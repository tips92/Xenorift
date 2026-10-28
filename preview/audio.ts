import '@fontsource/exo-2/600.css';
import type { MusicId, SfxId } from '../src/core/types';
import { makeDriveCurve, makeImpulse, makeNoise } from '../src/audio/buffers';
import { AudioEngine } from '../src/audio/engine';
import { MusicPlayer, type MusicFxHost } from '../src/audio/music';
import { RECIPES } from '../src/audio/sfx';
import { TRACKS } from '../src/audio/tracks';
import { SfxVoice, type SfxHost } from '../src/audio/voice';
import { WORLD1_SFX_IDS } from '../src/audio/world1Sfx';
import { WORLD1_MUSIC_IDS } from '../src/audio/world1Tracks';

// Page d'aperçu des sons et musiques du monde 1 (outil de développement, hors jeu et hors typecheck).
// Écoute : le vrai moteur (AudioEngine). Mesures : rendu hors temps réel (OfflineAudioContext) sur une copie du
// graphe du moteur, avec le vrai séquenceur (MusicPlayer) et les vraies voix d'effets (SfxVoice).
// ?analyse=1 lance les mesures au chargement. window.__audioPreview sert au scénario e2e audio-world1.

type AnyMusic = string;
type AnySfx = string;

const SFX_INFO: Record<string, string> = {
  bossAppear: "apparition d'un boss",
  bossHit: 'coup porté au boss',
  bossArmor: 'tir dévié par une carapace',
  bossPhase: 'changement de phase (montée 0,55 s)',
  bossDefeat: 'boss vaincu, libéré',
  barrier: 'barrière : ×1 ferme, ×1,25 ouvre',
  mushroomBounce: 'rebond sur un champignon',
  quake: 'secousse, tronc qui tombe',
  sporeDrop: 'pluie de spores',
  radioOpen: 'radio de LUMA qui s’ouvre',
  lumaBip: 'voix de LUMA (une lettre)',
  skill: 'compétence apprise',
  liberation: 'libération : couleurs qui reviennent',
  blueprint: 'plan récupéré',
  rescue: 'Tess téléportée',
  whaleCry: 'cri de la méduse-baleine',
  leviathanRoar: 'rugissement du léviathan',
  portalSwallow: 'portail avalé',
};
const SFX_REF: AnySfx[] = ['laser', 'laserHit', 'armorClank', 'enemyDie', 'crystal', 'crash', 'takeoff', 'warp', 'win'];
const MUSIC_INFO: Record<string, string> = {
  boss: 'mini-boss',
  guardian: 'gardien · 3 intensités',
  story: 'cinématiques · 2 intensités',
};
const MUSIC_REF: AnyMusic[] = ['menu', 'jungle', 'moon', 'nebula', 'asteroids'];
const LEVEL_HINT: Record<string, string[]> = {
  guardian: ['phase 1', 'phase 2', 'phase 3'],
  story: ['récit', 'lumière'],
};
const PHRASE = 'Bonne nouvelle : on est vivants. Mauvaise nouvelle : il me faut de l’énergie pour ouvrir un portail.';

const params = new URLSearchParams(location.search);

// ===================================================================== moteur réel et vu-mètre

/** Compresseur du moteur (sortie), capté à sa création pour le vu-mètre. */
let liveComp: DynamicsCompressorNode | null = null;
const createComp = BaseAudioContext.prototype.createDynamicsCompressor;
BaseAudioContext.prototype.createDynamicsCompressor = function (this: BaseAudioContext) {
  const node = createComp.call(this);
  if (!liveComp && !(this instanceof OfflineAudioContext)) liveComp = node;
  return node;
};

const engine = new AudioEngine();
/** Champs privés du moteur et du séquenceur (lisibles à l'exécution). */
interface EngineInside {
  ctx: AudioContext | null;
  player: MusicPlayer | null;
  wantedLevel: number;
  voices: unknown[];
  musicVoices: number;
}
const inside = engine as unknown as EngineInside;
interface TrackInside {
  id: string;
  ctx: { bar: number; step: number; level: number; loop: number };
}

let analyser: AnalyserNode | null = null;
let meterBuf: Float32Array<ArrayBuffer> | null = null;
let hold = 0;
let holdAt = 0;
/** Crête maximale de sortie depuis le dernier resetPeak() (scénario e2e). */
let peakSince = 0;

function attachMeter(): void {
  const ac = inside.ctx;
  if (analyser || !ac || !liveComp) return;
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  meterBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  liveComp.connect(analyser);
}

function unlock(): void {
  engine.unlock();
  attachMeter();
}

const dbfs = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));
const fmtDb = (x: number): string => (x <= 1e-5 ? '-∞' : dbfs(x).toFixed(1));

function meterLoop(): void {
  requestAnimationFrame(meterLoop);
  attachMeter();
  if (!analyser || !meterBuf) return;
  analyser.getFloatTimeDomainData(meterBuf);
  let pk = 0;
  let sum = 0;
  for (let i = 0; i < meterBuf.length; i++) {
    const a = Math.abs(meterBuf[i]);
    if (a > pk) pk = a;
    sum += meterBuf[i] * meterBuf[i];
  }
  const rms = Math.sqrt(sum / meterBuf.length);
  const now = performance.now();
  if (pk >= hold || now - holdAt > 1500) {
    hold = pk;
    holdAt = now;
  }
  if (pk > peakSince) peakSince = pk;
  const pos = (x: number): number => Math.max(0, Math.min(1, (dbfs(x) + 60) / 60));
  (document.getElementById('meter-bar') as HTMLElement).style.width = `${pos(pk) * 100}%`;
  (document.getElementById('meter-hold') as HTMLElement).style.left = `${pos(hold) * 100}%`;
  (document.getElementById('meter-text') as HTMLElement).textContent = `sortie : crête ${fmtDb(hold)} dBFS · RMS ${fmtDb(rms)}`;
}

// ===================================================================== commandes

let musicId: AnyMusic | null = null;

function playMusic(id: AnyMusic | null): void {
  unlock();
  musicId = id;
  engine.music(id as MusicId | null);
  refreshButtons();
}

function setLevel(n: number): void {
  unlock();
  engine.musicLevel(n);
  refreshButtons();
}

function playSfx(id: AnySfx, pitch?: number): void {
  unlock();
  engine.sfx(id as SfxId, { pitch: pitch ?? Number((document.getElementById('pitch') as HTMLInputElement).value) });
}

/** Hauteur d'une lettre : voyelles un peu plus hautes, variation selon la lettre. */
function letterPitch(ch: string): number {
  const c = ch.toLowerCase();
  const k = c.charCodeAt(0);
  return 'aeiouyàâäéèêëîïôöùûü'.includes(c) ? 1.08 + (k % 3) * 0.04 : 0.9 + (k % 5) * 0.03;
}

let phraseTimer: ReturnType<typeof setInterval> | null = null;

/** Joue un texte au rythme de la radio : un lumaBip par lettre, `rate` lettres par seconde (8 au plus). */
function lumaPhrase(text = PHRASE, rate = 8): Promise<number> {
  unlock();
  if (phraseTimer !== null) clearInterval(phraseTimer);
  let i = 0;
  let bips = 0;
  return new Promise((resolve) => {
    phraseTimer = setInterval(() => {
      if (i >= text.length) {
        if (phraseTimer !== null) clearInterval(phraseTimer);
        phraseTimer = null;
        resolve(bips);
        return;
      }
      const ch = text[i++];
      if (/\p{L}/u.test(ch)) {
        engine.sfx('lumaBip' as SfxId, { pitch: letterPitch(ch) });
        bips++;
      }
    }, 1000 / rate);
  });
}

/** `n` effets du monde 1 au hasard, toutes les `gap` ms (au-delà de 24 voix : les plus anciennes sont coupées). */
function burst(n = 30, gap = 40): Promise<void> {
  unlock();
  let k = 0;
  return new Promise((resolve) => {
    const id = setInterval(() => {
      engine.sfx(WORLD1_SFX_IDS[(k * 7) % WORLD1_SFX_IDS.length] as SfxId, { pitch: 0.9 + (k % 5) * 0.05 });
      if (++k >= n) {
        clearInterval(id);
        resolve();
      }
    }, gap);
  });
}

function state(): {
  ac: string;
  wanted: string | null;
  playing: string | null;
  wantedLevel: number;
  level: number;
  bar: number;
  step: number;
  sfxVoices: number;
  musicVoices: number;
} {
  const p = inside.player;
  const cur = p ? ((p as unknown as { current: TrackInside | null }).current ?? null) : null;
  return {
    ac: inside.ctx ? inside.ctx.state : 'none',
    wanted: musicId,
    playing: p ? p.playing : null,
    wantedLevel: inside.wantedLevel,
    level: p ? p.level : 0,
    bar: cur ? cur.ctx.bar : -1,
    step: cur ? cur.ctx.step : -1,
    sfxVoices: inside.voices.length,
    musicVoices: inside.musicVoices,
  };
}

function refreshButtons(): void {
  const s = state();
  document.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((b) => b.classList.toggle('is-on', b.dataset.music === s.playing));
  const hints = (s.playing && LEVEL_HINT[s.playing]) || [];
  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
    const n = Number(b.dataset.level);
    b.classList.toggle('is-on', n === s.wantedLevel);
    b.classList.toggle('is-applied', n === s.level && hints.length > 0);
    b.textContent = `${n}${hints[n] ? ` · ${hints[n]}` : ''}`;
    b.disabled = hints.length > 0 && n >= hints.length;
  });
  const st = document.getElementById('status') as HTMLElement;
  st.textContent =
    `AudioContext ${s.ac.padEnd(9)}  morceau ${String(s.playing ?? '—').padEnd(9)}  intensité demandée ${s.wantedLevel} · jouée ${s.level}` +
    `  mesure ${s.bar < 0 ? '—' : s.bar} pas ${s.step < 0 ? '—' : s.step}\n` +
    `voix d'effets ${String(s.sfxVoices).padStart(2)} / 24   voix musicales ${String(s.musicVoices).padStart(2)} / 64`;
}

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function buildControls(): void {
  const mNew = document.getElementById('music-new') as HTMLElement;
  for (const id of WORLD1_MUSIC_IDS) {
    const b = button(`${id} · ${MUSIC_INFO[id]}`, () => playMusic(id));
    b.dataset.music = id;
    mNew.append(b);
  }
  mNew.append(button('Couper', () => playMusic(null)));
  const lv = document.getElementById('music-levels') as HTMLElement;
  for (let n = 0; n < 3; n++) {
    const b = button(String(n), () => setLevel(n));
    b.dataset.level = String(n);
    lv.append(b);
  }
  const note = document.createElement('span');
  note.className = 'note';
  note.textContent = 'appliquée au prochain début de mesure (contour vert), sans relancer le morceau';
  lv.append(note);
  const mRef = document.getElementById('music-ref') as HTMLElement;
  for (const id of MUSIC_REF) {
    const b = button(id, () => playMusic(id), 'ref');
    b.dataset.music = id;
    mRef.append(b);
  }

  const grid = document.getElementById('sfx-new') as HTMLElement;
  for (const id of WORLD1_SFX_IDS) {
    const b = button('', () => playSfx(id));
    b.dataset.sfx = id;
    const t = document.createElement('b');
    t.textContent = id;
    const d = document.createElement('span');
    d.textContent = SFX_INFO[id] ?? '';
    b.append(t, d);
    grid.append(b);
  }
  const ref = document.getElementById('sfx-ref') as HTMLElement;
  for (const id of SFX_REF) ref.append(button(id, () => playSfx(id), 'ref'));

  const pitch = document.getElementById('pitch') as HTMLInputElement;
  pitch.addEventListener('input', () => {
    (document.getElementById('pitch-v') as HTMLElement).textContent = `× ${Number(pitch.value).toFixed(2).replace('.', ',')}`;
  });
  (document.getElementById('luma-phrase') as HTMLElement).addEventListener('click', () => void lumaPhrase());
  (document.getElementById('burst') as HTMLElement).addEventListener('click', () => void burst());
  (document.getElementById('analyse') as HTMLElement).addEventListener('click', () => void analyse());
}

// ===================================================================== rendu hors temps réel

const SR = 44100;
const MUSIC_SOFT_CAP = 40; // = engine.ts
const MUSIC_HARD_CAP = 64;

interface OffGraph {
  ac: OfflineAudioContext;
  musicIn: GainNode;
  delayIn: GainNode;
  verbIn: GainNode;
  sfxIn: GainNode;
  echoIn: GainNode;
  delayNode: DelayNode;
  delayFb: GainNode;
  noise: AudioBuffer;
  drive: Float32Array<ArrayBuffer>;
}

/**
 * Copie du graphe de AudioEngine.buildGraph (engine.ts), à garder en phase. Sortie sur 4 canaux : 0-1 = après le
 * compresseur (ce qu'entend le joueur), 2-3 = master avant le compresseur.
 */
function offlineGraph(seconds: number): OffGraph {
  const ac = new OfflineAudioContext({ numberOfChannels: 4, length: Math.ceil(seconds * SR), sampleRate: SR });
  const dest = ac.destination;
  dest.channelCount = 4;
  dest.channelCountMode = 'explicit';
  dest.channelInterpretation = 'discrete';
  const merger = ac.createChannelMerger(4);
  merger.connect(dest);
  const tap = (src: AudioNode, ch0: number): void => {
    const up = ac.createGain();
    up.channelCount = 2;
    up.channelCountMode = 'explicit';
    up.channelInterpretation = 'speakers';
    const sp = ac.createChannelSplitter(2);
    src.connect(up);
    up.connect(sp);
    sp.connect(merger, 0, ch0);
    sp.connect(merger, 1, ch0 + 1);
  };

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -9;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  tap(comp, 0);
  tap(master, 2);

  const musicBus = ac.createGain();
  musicBus.gain.value = 0.4;
  musicBus.connect(master);
  const sfxBus = ac.createGain();
  sfxBus.gain.value = 0.95;
  sfxBus.connect(master);

  const echoIn = ac.createGain();
  const echo = ac.createDelay(1);
  echo.delayTime.value = 0.14;
  const echoLp = ac.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 3200;
  const echoFb = ac.createGain();
  echoFb.gain.value = 0.3;
  const echoOut = ac.createGain();
  echoOut.gain.value = 0.55;
  echoIn.connect(echo);
  echo.connect(echoLp);
  echoLp.connect(echoFb);
  echoFb.connect(echo);
  echoLp.connect(echoOut);
  echoOut.connect(sfxBus);

  const musicIn = ac.createGain();
  musicIn.connect(musicBus);
  const delayIn = ac.createGain();
  // 1,99 et non 2 : le compteur de morceaux des tests e2e (countTracks) suit le dernier createDelay(2).
  const delayNode = ac.createDelay(1.99);
  delayNode.delayTime.value = 0.36;
  const dLp = ac.createBiquadFilter();
  dLp.type = 'lowpass';
  dLp.frequency.value = 2600;
  const delayFb = ac.createGain();
  delayFb.gain.value = 0.35;
  const dOut = ac.createGain();
  dOut.gain.value = 0.6;
  delayIn.connect(delayNode);
  delayNode.connect(dLp);
  dLp.connect(delayFb);
  delayFb.connect(delayNode);
  dLp.connect(dOut);
  dOut.connect(musicBus);

  const verbIn = ac.createGain();
  const verb = ac.createConvolver();
  verb.buffer = makeImpulse(ac, 1.6, 2.6);
  const vOut = ac.createGain();
  vOut.gain.value = 0.5;
  verbIn.connect(verb);
  verb.connect(vOut);
  vOut.connect(musicBus);

  return { ac, musicIn, delayIn, verbIn, sfxIn: sfxBus, echoIn, delayNode, delayFb, noise: makeNoise(ac, 2), drive: makeDriveCurve(3) };
}

function sfxHost(g: OffGraph): SfxHost {
  return { ac: g.ac as unknown as AudioContext, sfxIn: g.sfxIn, echoIn: g.echoIn, noise: g.noise, drive: g.drive, voiceEnded: () => undefined };
}

/** Voix musicales comme le moteur (plafonds 40 / 64), avec statistiques. */
interface VoiceStats {
  live: number;
  max: number;
  taken: number;
  refused: number;
}

function musicHost(g: OffGraph, st: VoiceStats): MusicFxHost {
  return {
    ac: g.ac as unknown as AudioContext,
    noise: g.noise,
    musicIn: g.musicIn,
    delayIn: g.delayIn,
    verbIn: g.verbIn,
    take(priority: number): boolean {
      if (st.live >= MUSIC_HARD_CAP || (st.live >= MUSIC_SOFT_CAP && priority < 2)) {
        st.refused++;
        return false;
      }
      st.live++;
      st.taken++;
      if (st.live > st.max) st.max = st.live;
      return true;
    },
    release(): void {
      if (st.live > 0) st.live--;
    },
    setDelay(seconds: number, feedback: number): void {
      const now = g.ac.currentTime;
      g.delayNode.delayTime.setTargetAtTime(Math.min(1.9, Math.max(0.05, seconds)), now, 0.08);
      g.delayFb.gain.setTargetAtTime(Math.min(0.7, Math.max(0, feedback)), now, 0.08);
    },
  };
}

interface Meas {
  name: string;
  group: 'sfx' | 'sfx-ref' | 'music' | 'music-ref' | 'mix' | 'mix-ref';
  /** Durée audible (au-dessus de -60 dBFS), en s. */
  dur: number;
  peakPre: number;
  peakPost: number;
  /** Instant de la crête de sortie (s). */
  peakAt: number;
  rms: number;
  rmsMax: number;
  voicesMax?: number;
  refused?: number;
  notesPerSec?: number;
  sources?: number;
  /** Mesure où le niveau demandé a pris effet (musiques à intensités). */
  appliedBar?: number;
  expectedBar?: number;
  problems: string[];
}

/** Crêtes, RMS sur la partie audible et RMS maximal sur 400 ms, entre `from` et `to` secondes. */
function measure(buf: AudioBuffer, from = 0, to = buf.duration): Omit<Meas, 'name' | 'group' | 'problems'> {
  const a = Math.max(0, Math.floor(from * SR));
  const b = Math.min(buf.length, Math.floor(to * SR));
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const PL = buf.getChannelData(2);
  const PR = buf.getChannelData(3);
  let peakPost = 0;
  let peakPre = 0;
  let peakAt = 0;
  let first = -1;
  let last = -1;
  for (let i = a; i < b; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    const y = Math.max(Math.abs(PL[i]), Math.abs(PR[i]));
    if (x > peakPost) {
      peakPost = x;
      peakAt = i / SR;
    }
    if (y > peakPre) peakPre = y;
    if (x > 0.001) {
      if (first < 0) first = i;
      last = i;
    }
  }
  let sum = 0;
  let n = 0;
  if (first >= 0) {
    for (let i = first; i <= last; i++) {
      sum += (L[i] * L[i] + R[i] * R[i]) * 0.5;
      n++;
    }
  }
  // RMS glissant sur 400 ms (pas de 100 ms)
  const win = Math.floor(0.4 * SR);
  const hop = Math.floor(0.1 * SR);
  let rmsMax = 0;
  for (let s = a; s + win <= b || s === a; s += hop) {
    const e = Math.min(b, s + win);
    let acc = 0;
    for (let i = s; i < e; i++) acc += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    const r = Math.sqrt(acc / Math.max(1, e - s));
    if (r > rmsMax) rmsMax = r;
    if (e >= b) break;
  }
  return { dur: first < 0 ? 0 : (last - first) / SR, peakPre, peakPost, peakAt, rms: n ? Math.sqrt(sum / n) : 0, rmsMax };
}

/** Crête de sortie maximale d'un mélange de combat : -0,5 dBFS (marge pour les crêtes entre échantillons au rééchantillonnage). */
const MIX_MAX = Math.pow(10, -0.5 / 20);

function judge(m: Meas): Meas {
  // Mélange de référence (sons existants) : chiffres seulement, sans verdict.
  if (m.group === 'mix-ref') return m;
  if (m.peakPost >= 0.999) m.problems.push(`sature (crête de sortie ${fmtDb(m.peakPost)} dBFS)`);
  // Pire cas du jeu (musique + effets) : garder au moins 0,5 dB de marge.
  else if (m.group === 'mix' && m.peakPost > MIX_MAX) m.problems.push(`marge < 0,5 dB (crête de sortie ${fmtDb(m.peakPost)} dBFS)`);
  if (m.peakPost < 0.01 || m.rms < 0.003) m.problems.push(`muet (crête ${fmtDb(m.peakPost)}, RMS ${fmtDb(m.rms)} dBFS)`);
  if (m.refused) m.problems.push(`${m.refused} notes refusées (plafond de voix)`);
  if (m.expectedBar !== undefined && m.appliedBar !== m.expectedBar) {
    m.problems.push(`intensité appliquée à la mesure ${m.appliedBar}, attendue ${m.expectedBar}`);
  }
  return m;
}

// --------------------------------------------------------------------- spectrogrammes

const FFT_TABLES = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array; win: Float64Array }>();

function fftTables(n: number) {
  let tb = FFT_TABLES.get(n);
  if (tb) return tb;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let k = 0; k < bits; k++) r |= ((i >> k) & 1) << (bits - 1 - k);
    rev[i] = r;
  }
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  tb = { cos, sin, rev, win };
  FFT_TABLES.set(n, tb);
  return tb;
}

/** Spectre d'amplitude (dB) d'une trame de `n` échantillons centrée sur `center`. */
function spectrum(x: Float32Array, center: number, n: number, re: Float64Array, im: Float64Array, out: Float64Array): void {
  const { cos, sin, rev, win } = fftTables(n);
  const s0 = center - n / 2;
  for (let i = 0; i < n; i++) {
    const j = s0 + i;
    re[rev[i]] = j >= 0 && j < x.length ? x[j] * win[i] : 0;
    im[rev[i]] = 0;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = i + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  const norm = 4 / n;
  for (let k = 0; k < n / 2; k++) out[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) * norm + 1e-12);
}

const LUT = (() => {
  const stops: [number, number, number, number][] = [
    [0, 5, 1, 15],
    [0.25, 40, 10, 110],
    [0.45, 124, 77, 255],
    [0.65, 255, 63, 210],
    [0.82, 255, 154, 63],
    [1, 255, 245, 190],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [p0, r0, g0, b0] = stops[k];
    const [p1, r1, g1, b1] = stops[k + 1];
    const f = (v - p0) / (p1 - p0);
    lut[i * 3] = r0 + (r1 - r0) * f;
    lut[i * 3 + 1] = g0 + (g1 - g0) * f;
    lut[i * 3 + 2] = b0 + (b1 - b0) * f;
  }
  return lut;
})();

interface Mark {
  t: number;
  label: string;
}

/** Spectrogramme (fréquences logarithmiques 40 Hz - 16 kHz) et enveloppes de crête et RMS (bande du haut). */
function drawSpectro(canvas: HTMLCanvasElement, buf: AudioBuffer, from: number, to: number, marks: Mark[] = []): void {
  const W = canvas.width;
  const H = canvas.height;
  const envH = Math.round(H * 0.3);
  const specH = H - envH;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#05010f';
  g.fillRect(0, 0, W, H);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const a = Math.floor(from * SR);
  const b = Math.min(buf.length, Math.floor(to * SR));
  const mono = new Float32Array(b - a);
  for (let i = 0; i < mono.length; i++) mono[i] = (L[a + i] + R[a + i]) * 0.5;
  const n = to - from > 8 ? 4096 : 1024;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const mag = new Float64Array(n / 2);
  const img = g.createImageData(W, specH);
  const fLo = 40;
  const fHi = 16000;
  const binOf = (f: number): number => Math.min(n / 2 - 1, Math.max(1, Math.round((f * n) / SR)));
  for (let x = 0; x < W; x++) {
    const center = Math.floor(((x + 0.5) * mono.length) / W);
    spectrum(mono, center, n, re, im, mag);
    for (let y = 0; y < specH; y++) {
      const f0 = fLo * Math.pow(fHi / fLo, 1 - (y + 1) / specH);
      const f1 = fLo * Math.pow(fHi / fLo, 1 - y / specH);
      let m = -200;
      for (let k = binOf(f0); k <= binOf(f1); k++) if (mag[k] > m) m = mag[k];
      const v = Math.max(0, Math.min(255, Math.round(((m + 100) / 90) * 255)));
      const o = (y * W + x) * 4;
      img.data[o] = LUT[v * 3];
      img.data[o + 1] = LUT[v * 3 + 1];
      img.data[o + 2] = LUT[v * 3 + 2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, envH);
  // Repères de fréquence
  g.fillStyle = 'rgba(238,240,255,0.55)';
  g.font = '9px ui-monospace, Consolas, monospace';
  for (const f of [100, 1000, 10000]) {
    const y = envH + specH * (1 - Math.log(f / fLo) / Math.log(fHi / fLo));
    g.fillRect(0, y, 4, 1);
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 6, y + 3);
  }
  // Enveloppes : crête (cyan) et RMS (magenta), -60..0 dBFS ; ligne rouge à -1 dBFS
  const yOf = (x: number): number => envH - 2 - Math.max(0, Math.min(1, (dbfs(x) + 60) / 60)) * (envH - 4);
  g.fillStyle = 'rgba(255,63,94,0.7)';
  g.fillRect(0, yOf(Math.pow(10, -1 / 20)), W, 1);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, envH - 1, W, 1);
  const per = mono.length / W;
  g.beginPath();
  for (let x = 0; x < W; x++) {
    let pk = 0;
    let acc = 0;
    const s = Math.floor(x * per);
    const e = Math.max(s + 1, Math.floor((x + 1) * per));
    for (let i = s; i < e; i++) {
      const v = Math.abs(mono[i]);
      if (v > pk) pk = v;
      acc += mono[i] * mono[i];
    }
    const yr = yOf(Math.sqrt(acc / (e - s)));
    g.fillStyle = 'rgba(255,63,210,0.55)';
    g.fillRect(x, yr, 1, envH - 1 - yr);
    if (x === 0) g.moveTo(x, yOf(pk));
    else g.lineTo(x, yOf(pk));
  }
  g.strokeStyle = '#3ff7ff';
  g.lineWidth = 1;
  g.stroke();
  // Repères temporels
  g.font = '10px ui-monospace, Consolas, monospace';
  for (const mk of marks) {
    const x = ((mk.t - from) / (to - from)) * W;
    g.fillStyle = 'rgba(255,216,74,0.85)';
    g.fillRect(x, 0, 1, H);
    g.fillText(mk.label, x + 3, 10);
  }
}

function addCard(container: string, title: string, sub: string, ref: boolean, w: number, h: number): HTMLCanvasElement {
  const card = document.createElement('div');
  card.className = `card${ref ? ' ref' : ''}`;
  const h3 = document.createElement('h3');
  const name = document.createElement('span');
  name.textContent = title;
  const small = document.createElement('small');
  small.textContent = sub;
  h3.append(name, small);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  card.append(h3, cv);
  (document.getElementById(container) as HTMLElement).append(card);
  return cv;
}

// --------------------------------------------------------------------- rendus

const sfxGroup = (id: string): 'sfx' | 'sfx-ref' => ((WORLD1_SFX_IDS as readonly string[]).includes(id) ? 'sfx' : 'sfx-ref');

async function renderSfx(id: AnySfx, pitch = 1, label = id): Promise<Meas> {
  const g = offlineGraph(4.6);
  const v = new SfxVoice(sfxHost(g), 1);
  (RECIPES as Record<string, (v: SfxVoice, t: number, p: number) => void>)[id](v, 0.05, pitch);
  const sources = (v as unknown as { sources: unknown[] }).sources.length;
  v.commit();
  const buf = await g.ac.startRendering();
  const m: Meas = { name: label, group: sfxGroup(id), ...measure(buf), sources, problems: [] };
  const cv = addCard('sfx-cards', label, `${m.dur.toFixed(2)} s · ${fmtDb(m.peakPost)} dB`, m.group === 'sfx-ref', 300, 120);
  drawSpectro(cv, buf, 0, Math.min(4.6, Math.max(0.6, m.dur + 0.45)));
  return judge(m);
}

/** La radio : une phrase de LUMA à 8 lettres par seconde (une voix par lettre). */
async function renderLumaPhrase(): Promise<Meas> {
  const text = PHRASE.slice(0, 48);
  const g = offlineGraph(text.length / 8 + 0.6);
  const host = sfxHost(g);
  for (let i = 0; i < text.length; i++) {
    if (!/\p{L}/u.test(text[i])) continue;
    const v = new SfxVoice(host, 1);
    (RECIPES as Record<string, (v: SfxVoice, t: number, p: number) => void>).lumaBip(v, 0.05 + i / 8, letterPitch(text[i]));
    v.commit();
  }
  const buf = await g.ac.startRendering();
  const m: Meas = { name: 'lumaBip × phrase (8/s)', group: 'sfx', ...measure(buf), problems: [] };
  const cv = addCard('sfx-cards', 'phrase de LUMA', `${text.length} car. · ${fmtDb(m.peakPost)} dB`, false, 300, 120);
  drawSpectro(cv, buf, 0, buf.duration);
  return judge(m);
}

interface MusicPlan {
  id: AnyMusic;
  label: string;
  bars: number;
  startLevel?: number;
  /** Changements d'intensité : [mesure visée, niveau] (demandés 0,3 s avant). */
  levels?: [number, number][];
  /** Effets ajoutés : [instant (s), effet, hauteur]. */
  sfx?: [number, AnySfx, number][];
  group: Meas['group'];
}

async function renderMusic(plan: MusicPlan): Promise<Meas[]> {
  const def = TRACKS[plan.id as MusicId];
  const barDur = 240 / def.bpm;
  const t0 = 0.05;
  const end = t0 + plan.bars * barDur;
  const g = offlineGraph(end + 2.5);
  const st: VoiceStats = { live: 0, max: 0, taken: 0, refused: 0 };
  const player = new MusicPlayer(musicHost(g, st));
  player.play(plan.id as MusicId, plan.startLevel ?? 0);
  player.pause(); // pas de minuterie : tick() est appelé à chaque suspension du rendu
  const tick = (player as unknown as { tick: () => void }).tick;
  const sh = sfxHost(g);
  for (const [at, id, p] of plan.sfx ?? []) {
    const v = new SfxVoice(sh, 1);
    (RECIPES as Record<string, (v: SfxVoice, t: number, p: number) => void>)[id](v, at, p);
    v.commit();
  }
  // Segments de mesure : bornés par les changements d'intensité.
  const cuts = [0, ...(plan.levels ?? []).map(([bar]) => bar), plan.bars];
  const segs = cuts.slice(0, -1).map((bar, i) => ({
    from: bar,
    to: cuts[i + 1],
    level: i === 0 ? (plan.startLevel ?? 0) : (plan.levels as [number, number][])[i - 1][1],
    taken: 0,
    refused: 0,
    max: 0,
    appliedBar: i === 0 ? 0 : -1,
  }));
  const pending = (plan.levels ?? []).map(([bar, lvl]) => ({ at: t0 + bar * barDur - 0.3, lvl, done: false }));
  const CH = 0.05;
  let lastLevel = player.level;
  for (let k = 1; k * CH < end + 0.2; k++) {
    const tk = k * CH;
    g.ac.suspend(tk).then(() => {
      for (const e of pending) {
        if (!e.done && tk >= e.at) {
          e.done = true;
          player.setLevel(e.lvl);
        }
      }
      const seg = segs.find((s) => tk < t0 + s.to * barDur) ?? segs[segs.length - 1];
      const taken0 = st.taken;
      const refused0 = st.refused;
      if (tk < end) tick();
      else player.stop(0.3);
      seg.taken += st.taken - taken0;
      seg.refused += st.refused - refused0;
      if (st.live > seg.max) seg.max = st.live;
      const lvl = player.level;
      if (lvl !== lastLevel) {
        lastLevel = lvl;
        // Mesure du dernier pas programmé : celle où le niveau a pris effet.
        const cur = (player as unknown as { current: TrackInside | null }).current;
        const s = segs.find((x) => x.level === lvl && x.appliedBar < 0);
        if (s && cur) s.appliedBar = cur.ctx.bar + cur.ctx.loop * def.bars;
      }
      void g.ac.resume();
    });
  }
  const buf = await g.ac.startRendering();
  const out: Meas[] = [];
  const marks: Mark[] = [];
  for (const s of segs) {
    const from = t0 + s.from * barDur;
    const to = t0 + s.to * barDur;
    // La première mesure d'un segment (fondu d'entrée, cymbale du changement) n'est pas comptée dans le RMS ;
    // un mélange est mesuré en entier (effets dès le début, queues comprises).
    const m: Meas = {
      name: segs.length > 1 ? `${plan.label} · niv. ${s.level} (mes. ${s.from}-${s.to - 1})` : plan.label,
      group: plan.group,
      ...(plan.group === 'mix' ? measure(buf) : measure(buf, Math.min(to - barDur, from + barDur * (s.from === 0 ? 1 : 0.5)), to)),
      voicesMax: s.max,
      refused: s.refused,
      notesPerSec: s.taken / ((s.to - s.from) * barDur),
      problems: [],
    };
    if (s.from > 0) {
      m.appliedBar = s.appliedBar;
      m.expectedBar = s.from;
      marks.push({ t: from, label: `niv. ${s.level}` });
    }
    out.push(judge(m));
  }
  const whole = measure(buf, 0, end);
  const cv = addCard(
    'music-cards',
    plan.label,
    `${plan.bars} mesures · ${(end - t0).toFixed(1)} s · crête ${fmtDb(whole.peakPost)} dB · RMS ${fmtDb(whole.rms)} dB`,
    plan.group.endsWith('ref'),
    1200,
    130,
  );
  drawSpectro(cv, buf, 0, end + 0.5, marks);
  return out;
}

// --------------------------------------------------------------------- tableau

function renderTable(rows: Meas[]): void {
  const tb = document.getElementById('table') as HTMLTableElement;
  const head =
    '<tr><th>son</th><th>durée s</th><th>crête entrée</th><th>crête sortie</th><th>RMS</th><th>RMS max 400 ms</th><th>voix max</th><th>notes/s</th><th>remarques</th></tr>';
  const sep: Record<Meas['group'], string> = {
    sfx: 'Effets du monde 1',
    'sfx-ref': 'Effets existants (référence)',
    music: 'Musiques du monde 1',
    'music-ref': 'Musiques existantes (référence)',
    mix: 'Mélanges : combats (musique + effets)',
    'mix-ref': 'Mélange de référence : sons existants (jungle + effets)',
  };
  let last = '';
  const parts: string[] = [head];
  for (const m of rows) {
    if (m.group !== last) {
      last = m.group;
      parts.push(`<tr class="sep"><td colspan="9">${sep[m.group]}</td></tr>`);
    }
    const cls = m.group.endsWith('ref') ? ' class="ref"' : '';
    const post = m.peakPost >= 0.999 ? 'bad' : m.peakPost > 0.89 ? 'warn' : '';
    const pre = m.peakPre > 1 ? 'warn' : '';
    const quiet = m.peakPost < 0.01 || m.rms < 0.003 ? 'bad' : '';
    parts.push(
      `<tr${cls}><td>${m.name}</td><td>${m.dur.toFixed(2)}</td><td class="${pre}">${fmtDb(m.peakPre)}</td>` +
        `<td class="${post}">${fmtDb(m.peakPost)}</td><td class="${quiet}">${fmtDb(m.rms)}</td><td>${fmtDb(m.rmsMax)}</td>` +
        `<td>${m.voicesMax ?? (m.sources !== undefined ? `${m.sources} src` : '')}</td><td>${m.notesPerSec !== undefined ? m.notesPerSec.toFixed(1) : ''}</td>` +
        `<td class="${m.problems.length ? 'bad' : ''}">${m.problems.join(' ; ') || (m.appliedBar !== undefined ? `niveau appliqué mesure ${m.appliedBar}` : m.group.startsWith('mix') ? `crête à ${m.peakAt.toFixed(2)} s` : '')}</td></tr>`,
    );
  }
  tb.innerHTML = parts.join('');
}

const MUSIC_PLANS: MusicPlan[] = [
  { id: 'boss', label: 'boss', bars: 32, group: 'music' },
  {
    id: 'guardian',
    label: 'guardian',
    bars: 24,
    levels: [
      [8, 1],
      [16, 2],
    ],
    group: 'music',
  },
  { id: 'story', label: 'story (récit)', bars: 24, group: 'music' },
  { id: 'story', label: 'story → lumière', bars: 10, levels: [[2, 1]], group: 'music' },
  { id: 'menu', label: 'menu', bars: 8, group: 'music-ref' },
  { id: 'jungle', label: 'jungle', bars: 16, group: 'music-ref' },
  { id: 'nebula', label: 'nebula', bars: 16, group: 'music-ref' },
  { id: 'asteroids', label: 'asteroids', bars: 16, group: 'music-ref' },
];

/**
 * Pires cas réalistes : plongée du gardien, coups au boss en continu, cri, secousse, phase, spores, défaite ; les
 * impacts de la secousse (chute du tronc à +1 s), de la phase (+0,55 s) et de la défaite tombent sur une grosse
 * caisse (un temps = 60 / 112 s, premier pas à 0,05 s), le coup fatal (bossHit) en même temps que la défaite.
 */
function mixPlan(): MusicPlan {
  const beat = (k: number): number => 0.05 + (k * 60) / 112;
  const sfx: [number, AnySfx, number][] = [
    [0.4, 'whaleCry', 1],
    [beat(6) - 1.0, 'quake', 1],
    [beat(8) - 0.55, 'bossPhase', 1],
    [4.8, 'sporeDrop', 1],
    [5.2, 'bossArmor', 1],
    [beat(12), 'bossHit', 1],
    [beat(12), 'bossDefeat', 1],
    [7.0, 'radioOpen', 1],
  ];
  for (let i = 0; i < 26; i++) sfx.push([0.3 + i * 0.25, 'bossHit', 0.95 + (i % 3) * 0.05]);
  return { id: 'guardian', label: 'gardien niv. 2 + effets', bars: 5, startLevel: 2, sfx, group: 'mix' };
}

/**
 * Mini-boss : apparition, barrière qui se ferme, rebonds, tirs déviés et coups, phase, coup fatal et défaite sur
 * une grosse caisse (un temps = 60 / 132 s), barrière qui se rouvre.
 */
function bossMixPlan(): MusicPlan {
  const beat = (k: number): number => 0.05 + (k * 60) / 132;
  const sfx: [number, AnySfx, number][] = [
    [beat(4), 'bossAppear', 1],
    [beat(6), 'barrier', 1],
    [3.3, 'mushroomBounce', 1],
    [3.9, 'bossArmor', 1],
    [beat(12) - 0.55, 'bossPhase', 1],
    [6.4, 'mushroomBounce', 1.05],
    [6.7, 'bossArmor', 1.1],
    [beat(16), 'bossHit', 1],
    [beat(16), 'bossDefeat', 1],
    [beat(19), 'barrier', 1.25],
  ];
  for (let i = 0; i < 16; i++) sfx.push([2.5 + i * 0.3, 'bossHit', 0.95 + (i % 3) * 0.05]);
  return { id: 'boss', label: 'boss + effets', bars: 5, sfx, group: 'mix' };
}

/** Référence : combat de la jungle avec les sons existants (tirs, ennemis, chocs sur les grosses caisses, 118 BPM). */
function refMixPlan(): MusicPlan {
  const beat = (k: number): number => 0.05 + (k * 60) / 118;
  const sfx: [number, AnySfx, number][] = [
    [beat(4), 'enemyDie', 1],
    [beat(6), 'stomp', 1],
    [beat(8), 'armorClank', 1],
    [beat(10), 'shieldBreak', 1],
    [beat(12), 'hurt', 1],
    [beat(14), 'enemyDie', 1.1],
    [beat(16), 'death', 1],
  ];
  for (let i = 0; i < 30; i++) {
    sfx.push([0.5 + i * 0.25, 'laser', 1]);
    if (i % 2 === 1) sfx.push([0.56 + i * 0.25, 'laserHit', 1]);
  }
  return { id: 'jungle', label: 'jungle + effets existants', bars: 5, sfx, group: 'mix-ref' };
}

let results: Meas[] | null = null;
let running: Promise<Meas[]> | null = null;

function analyse(): Promise<Meas[]> {
  if (running) return running;
  running = (async () => {
    const stateEl = document.getElementById('analysis-state') as HTMLElement;
    (document.getElementById('sfx-cards') as HTMLElement).replaceChildren();
    (document.getElementById('music-cards') as HTMLElement).replaceChildren();
    const rows: Meas[] = [];
    const jobs: (() => Promise<Meas | Meas[]>)[] = [
      ...WORLD1_SFX_IDS.map((id) => () => renderSfx(id)),
      () => renderSfx('barrier', 1.25, 'barrier ×1,25 (ouverture)'),
      () => renderLumaPhrase(),
      ...SFX_REF.map((id) => () => renderSfx(id)),
      ...MUSIC_PLANS.map((p) => () => renderMusic(p)),
      () => renderMusic(mixPlan()),
      () => renderMusic(bossMixPlan()),
      () => renderMusic(refMixPlan()),
    ];
    const t0 = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      stateEl.textContent = `· rendu ${i + 1} / ${jobs.length}…`;
      const r = await jobs[i]();
      if (Array.isArray(r)) rows.push(...r);
      else rows.push(r);
      renderTable(rows);
    }
    const order: Meas['group'][] = ['sfx', 'sfx-ref', 'music', 'music-ref', 'mix', 'mix-ref'];
    rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    renderTable(rows);
    const bad = rows.filter((m) => m.problems.length).length;
    stateEl.textContent = `· ${rows.length} mesures en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${bad ? `${bad} problème(s)` : 'aucun problème'}`;
    results = rows;
    running = null;
    return rows;
  })();
  return running;
}

// ===================================================================== démarrage

buildControls();
refreshButtons();
setInterval(refreshButtons, 100);
requestAnimationFrame(meterLoop);

(window as unknown as { __audioPreview: unknown }).__audioPreview = {
  engine,
  sfxIds: [...WORLD1_SFX_IDS],
  musicIds: [...WORLD1_MUSIC_IDS],
  unlock,
  music: playMusic,
  level: setLevel,
  sfx: playSfx,
  lumaPhrase,
  burst,
  state,
  analyse,
  get results() {
    return results;
  },
  resetPeak(): void {
    peakSince = 0;
  },
  get peak() {
    return peakSince;
  },
};

if (params.get('analyse') === '1') void analyse();
