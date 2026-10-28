import type { AudioApi, MusicId, SfxId } from '../core/types';
import { makeDriveCurve, makeImpulse, makeNoise } from './buffers';
import { MusicPlayer, type MusicFxHost } from './music';
import { RECIPES } from './sfx';
import { SfxVoice, type SfxHost } from './voice';

// Moteur audio : AudioContext créé au premier geste, bus musique / effets, compresseur sur le master,
// gestion des suspensions (arrière-plan, interruptions iOS) et vibrations.

const MUSIC_LEVEL = 0.4;
const SFX_LEVEL = 0.95;
const MAX_VOICES = 24;
/** Écart minimal entre deux déclenchements du même effet (s). */
const SAME_SFX_GAP = 0.035;
/** Budget de voix musicales : au-delà de SOFT, seules les notes essentielles passent. */
const MUSIC_SOFT_CAP = 40;
const MUSIC_HARD_CAP = 64;

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const noop = (): void => undefined;

/** Ramène un motif de vibration à des valeurs sûres. */
function sanitizeVibration(pattern: number | number[]): number | number[] | null {
  if (typeof pattern === 'number') {
    return Number.isFinite(pattern) && pattern > 0 ? Math.min(1000, Math.round(pattern)) : null;
  }
  if (!Array.isArray(pattern) || pattern.length === 0) return null;
  const out: number[] = [];
  for (let i = 0; i < pattern.length && i < 16; i++) {
    const v = pattern[i];
    out.push(Number.isFinite(v) && v > 0 ? Math.min(1000, Math.round(v)) : 0);
  }
  return out;
}

export class AudioEngine implements AudioApi, SfxHost, MusicFxHost {
  // --- Contexte et graphe (créés au déverrouillage)
  private ctx: AudioContext | null = null;
  private failed = false;
  private masterGain!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private delayNode!: DelayNode;
  private delayFb!: GainNode;
  private noiseBuf!: AudioBuffer;
  private driveCurve!: Float32Array<ArrayBuffer>;
  private echoInput!: GainNode;
  private musicInput!: GainNode;
  private delayInput!: GainNode;
  private verbInput!: GainNode;
  private player: MusicPlayer | null = null;

  // --- État
  private musicOn = true;
  private sfxOn = true;
  private hapticsOn = true;
  private appSuspended = false;
  private pageHidden = typeof document !== 'undefined' ? document.hidden : false;
  private wanted: MusicId | null = null;
  private resumeAskedAt = -1;
  private readonly voices: SfxVoice[] = [];
  private readonly lastPlayed = new Map<SfxId, number>();
  private musicVoices = 0;
  private gestureArmed = false;
  private silentPlayed = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    // Filet de sécurité : le premier geste de l'utilisateur débloque l'audio même si l'interface oublie unlock().
    this.armGestures();
  }

  // ================================================================ hôtes (SfxHost / MusicFxHost)

  get ac(): AudioContext {
    return this.ctx as AudioContext;
  }

  get noise(): AudioBuffer {
    return this.noiseBuf;
  }

  get drive(): Float32Array<ArrayBuffer> {
    return this.driveCurve;
  }

  get sfxIn(): AudioNode {
    return this.sfxBus;
  }

  get echoIn(): AudioNode {
    return this.echoInput;
  }

  get musicIn(): AudioNode {
    return this.musicInput;
  }

  get delayIn(): AudioNode {
    return this.delayInput;
  }

  get verbIn(): AudioNode {
    return this.verbInput;
  }

  voiceEnded(v: SfxVoice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  take(priority: number): boolean {
    if (this.musicVoices >= MUSIC_HARD_CAP) return false;
    if (this.musicVoices >= MUSIC_SOFT_CAP && priority < 2) return false;
    this.musicVoices++;
    return true;
  }

  release(): void {
    if (this.musicVoices > 0) this.musicVoices--;
  }

  setDelay(seconds: number, feedback: number): void {
    const ac = this.ctx;
    if (!ac) return;
    const now = ac.currentTime;
    this.delayNode.delayTime.setTargetAtTime(clamp(seconds, 0.05, 1.9), now, 0.08);
    this.delayFb.gain.setTargetAtTime(clamp(feedback, 0, 0.7), now, 0.08);
  }

  // ================================================================ AudioApi

  unlock(): void {
    this.ensureContext();
    const ac = this.ctx;
    if (!ac) {
      if (this.failed) this.disarmGestures();
      return;
    }
    if (!this.silentPlayed) {
      // Astuce iOS : jouer un échantillon muet pendant le geste « réveille » la sortie audio.
      this.silentPlayed = true;
      try {
        const b = ac.createBuffer(1, 1, ac.sampleRate);
        const s = ac.createBufferSource();
        s.buffer = b;
        s.connect(ac.destination);
        s.onended = () => s.disconnect();
        s.start(0);
      } catch {
        // sans importance
      }
    }
    this.applyRunState();
    if (ac.state === 'running') this.disarmGestures();
    this.startWantedMusic();
  }

  sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void {
    // En arrière-plan : rien (un son programmé maintenant ressortirait au retour).
    if (!this.sfxOn || this.appSuspended || this.pageHidden) return;
    const ac = this.ctx;
    if (!ac) return;
    if (!this.canSchedule(ac)) return;
    const recipe = RECIPES[id];
    if (!recipe) return;
    const now = ac.currentTime;
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < SAME_SFX_GAP && now >= last) return;
    this.lastPlayed.set(id, now);

    const vIn = opts?.volume;
    const pIn = opts?.pitch;
    const volume = vIn !== undefined && Number.isFinite(vIn) ? clamp(vIn, 0, 2) : 1;
    if (volume <= 0) return;
    const pitch = pIn !== undefined && Number.isFinite(pIn) ? clamp(pIn, 0.25, 4) : 1;

    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest) oldest.kill();
    }
    const v = new SfxVoice(this, volume);
    this.voices.push(v);
    try {
      recipe(v, now + 0.004, pitch);
    } catch (err) {
      console.error('[audio] sfx', id, err);
    }
    v.commit();
  }

  music(id: MusicId | null): void {
    if (id === this.wanted) {
      // Même morceau : ne rien relancer (sauf s'il ne joue pas encore alors qu'il le pourrait).
      if (id !== null) this.startWantedMusic();
      return;
    }
    this.wanted = id;
    if (!this.player) return; // démarrera au déverrouillage
    if (id === null) this.player.stop();
    else this.startWantedMusic();
  }

  setMusicEnabled(on: boolean): void {
    if (this.musicOn === on) return;
    this.musicOn = on;
    const ac = this.ctx;
    if (!ac) return;
    const now = ac.currentTime;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? MUSIC_LEVEL : 0, now + 0.3);
    if (on) this.startWantedMusic();
    else if (this.player) this.player.stop(0.3);
  }

  setSfxEnabled(on: boolean): void {
    if (this.sfxOn === on) return;
    this.sfxOn = on;
    const ac = this.ctx;
    if (!ac) return;
    const now = ac.currentTime;
    const g = this.sfxBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? SFX_LEVEL : 0, now + 0.12);
  }

  setHapticsEnabled(on: boolean): void {
    this.hapticsOn = on;
    if (!on) this.vibrate(0);
  }

  haptic(pattern: number | number[]): void {
    if (!this.hapticsOn || this.appSuspended || this.pageHidden) return;
    const p = sanitizeVibration(pattern);
    if (p === null) return;
    this.vibrate(p);
  }

  suspend(): void {
    this.appSuspended = true;
    this.applyRunState();
  }

  resume(): void {
    this.appSuspended = false;
    this.applyRunState();
  }

  // ================================================================ interne

  private vibrate(p: number | number[]): void {
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
      // Avant le premier geste, Chrome refuse vibrate() avec une erreur dans la console (vibrations coupées dès le
      // démarrage, victoire sans avoir touché l'écran) : rien à faire vibrer ni à arrêter.
      const ua = nav ? (nav as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
      if (ua && !ua.hasBeenActive) return;
      if (nav && typeof nav.vibrate === 'function') nav.vibrate(p);
    } catch {
      // jamais d'exception vers le jeu
    }
  }

  private ensureContext(): void {
    if (this.ctx || this.failed) return;
    const C = audioCtor();
    if (!C) {
      this.failed = true;
      return;
    }
    let ac: AudioContext;
    try {
      ac = new C({ latencyHint: 'interactive' });
    } catch {
      try {
        ac = new C();
      } catch (err) {
        console.warn('[audio] AudioContext indisponible', err);
        this.failed = true;
        return;
      }
    }
    this.ctx = ac;
    try {
      this.buildGraph(ac);
    } catch (err) {
      console.error('[audio] graphe audio', err);
      this.failed = true;
      this.ctx = null;
      ac.close().catch(noop);
      return;
    }
    ac.onstatechange = this.onStateChange;
  }

  private buildGraph(ac: AudioContext): void {
    // Master → compresseur léger (limiteur doux) → sortie
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ac.destination);
    this.masterGain = ac.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(comp);

    this.musicBus = ac.createGain();
    this.musicBus.gain.value = this.musicOn ? MUSIC_LEVEL : 0;
    this.musicBus.connect(this.masterGain);
    this.sfxBus = ac.createGain();
    this.sfxBus.gain.value = this.sfxOn ? SFX_LEVEL : 0;
    this.sfxBus.connect(this.masterGain);

    this.noiseBuf = makeNoise(ac, 2);
    this.driveCurve = makeDriveCurve(3);

    // Écho des effets (cloches, étincelles)
    this.echoInput = ac.createGain();
    const echo = ac.createDelay(1);
    echo.delayTime.value = 0.14;
    const echoLp = ac.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 3200;
    const echoFb = ac.createGain();
    echoFb.gain.value = 0.3;
    const echoOut = ac.createGain();
    echoOut.gain.value = 0.55;
    this.echoInput.connect(echo);
    echo.connect(echoLp);
    echoLp.connect(echoFb);
    echoFb.connect(echo);
    echoLp.connect(echoOut);
    echoOut.connect(this.sfxBus);

    // Musique : entrée sèche, écho rythmique partagé, réverbération partagée (tout passe par le bus musique)
    this.musicInput = ac.createGain();
    this.musicInput.connect(this.musicBus);

    this.delayInput = ac.createGain();
    this.delayNode = ac.createDelay(2);
    this.delayNode.delayTime.value = 0.36;
    const dLp = ac.createBiquadFilter();
    dLp.type = 'lowpass';
    dLp.frequency.value = 2600;
    this.delayFb = ac.createGain();
    this.delayFb.gain.value = 0.35;
    const dOut = ac.createGain();
    dOut.gain.value = 0.6;
    this.delayInput.connect(this.delayNode);
    this.delayNode.connect(dLp);
    dLp.connect(this.delayFb);
    this.delayFb.connect(this.delayNode);
    dLp.connect(dOut);
    dOut.connect(this.musicBus);

    this.verbInput = ac.createGain();
    const verb = ac.createConvolver();
    verb.buffer = makeImpulse(ac, 1.6, 2.6);
    const vOut = ac.createGain();
    vOut.gain.value = 0.5;
    this.verbInput.connect(verb);
    verb.connect(vOut);
    vOut.connect(this.musicBus);

    this.player = new MusicPlayer(this);
  }

  private startWantedMusic(): void {
    const id = this.wanted;
    if (!id || !this.musicOn || !this.player) return;
    if (this.player.playing === id) return;
    this.player.play(id);
  }

  /** Les sons peuvent être programmés si le contexte tourne (ou va reprendre d'un instant à l'autre). */
  private canSchedule(ac: AudioContext): boolean {
    if (ac.state === 'running') return true;
    if (this.appSuspended || this.pageHidden) return false;
    return this.resumeAskedAt >= 0 && performance.now() - this.resumeAskedAt < 600;
  }

  private applyRunState(): void {
    const ac = this.ctx;
    if (!ac || (ac.state as string) === 'closed') return;
    const run = !this.appSuspended && !this.pageHidden;
    if (run) {
      if (ac.state !== 'running') {
        this.resumeAskedAt = performance.now();
        ac.resume().catch(noop);
        // Sur iOS la reprise peut exiger un geste : on réarme l'écoute des gestes.
        this.armGestures();
      }
      if (this.player) this.player.resume();
    } else {
      if (this.player) this.player.pause();
      if (ac.state === 'running') ac.suspend().catch(noop);
    }
  }

  private readonly onStateChange = (): void => {
    const ac = this.ctx;
    if (!ac) return;
    const st = ac.state as string;
    if (st === 'running') {
      this.resumeAskedAt = -1;
      this.disarmGestures();
    } else if ((st === 'suspended' || st === 'interrupted') && !this.appSuspended && !this.pageHidden) {
      // Interruption système (appel, Siri…) : reprise au prochain geste.
      this.armGestures();
    }
  };

  private readonly onVisibility = (): void => {
    this.pageHidden = document.hidden;
    this.applyRunState();
  };

  private readonly onGesture = (e: Event): void => {
    if (this.appSuspended) return;
    // Seuls certains événements accordent l'« activation utilisateur » : pointerdown seulement à la souris
    // (au doigt, c'est pointerup / touchend).
    if (e.type === 'pointerdown' && (e as PointerEvent).pointerType !== 'mouse') return;
    this.unlock();
  };

  private armGestures(): void {
    if (this.gestureArmed || typeof window === 'undefined') return;
    this.gestureArmed = true;
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', this.onGesture, opts);
    window.addEventListener('pointerup', this.onGesture, opts);
    window.addEventListener('touchend', this.onGesture, opts);
    window.addEventListener('keydown', this.onGesture, opts);
    window.addEventListener('click', this.onGesture, opts);
  }

  private disarmGestures(): void {
    if (!this.gestureArmed) return;
    this.gestureArmed = false;
    const opts: EventListenerOptions = { capture: true };
    window.removeEventListener('pointerdown', this.onGesture, opts);
    window.removeEventListener('pointerup', this.onGesture, opts);
    window.removeEventListener('touchend', this.onGesture, opts);
    window.removeEventListener('keydown', this.onGesture, opts);
    window.removeEventListener('click', this.onGesture, opts);
  }
}
