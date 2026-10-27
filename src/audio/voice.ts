// Voix d'effet sonore : regroupe les nœuds d'un son, les débranche quand toutes ses sources
// se sont arrêtées, et peut être « volée » (coupée en fondu rapide) si trop de sons se chevauchent.

export interface SfxHost {
  readonly ac: AudioContext;
  readonly sfxIn: AudioNode;
  readonly echoIn: AudioNode;
  readonly noise: AudioBuffer;
  readonly drive: Float32Array<ArrayBuffer>;
  /** Appelé quand la voix a fini (pour la retirer de la liste des voix actives). */
  voiceEnded(v: SfxVoice): void;
}

/** Valeur plancher des rampes exponentielles (qui ne peuvent pas atteindre 0). */
export const FLOOR = 0.0005;

/** Enveloppe percussive : 0 → crête (linéaire) → quasi-silence (exponentiel) → 0. Renvoie l'instant de fin. */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const pk = Math.max(peak, FLOOR * 2);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(pk, t + attack);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  p.linearRampToValueAtTime(0, t + attack + decay + 0.01);
  return t + attack + decay + 0.015;
}

/** Enveloppe montée / palier / descente, toute linéaire. */
export function swell(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, t + attack + hold);
  p.linearRampToValueAtTime(0, t + attack + hold + release);
  return t + attack + hold + release + 0.01;
}

export class SfxVoice {
  readonly ac: AudioContext;
  readonly out: GainNode;
  readonly born: number;
  private readonly host: SfxHost;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private pending = 0;
  private disposed = false;

  constructor(host: SfxHost, volume: number) {
    this.host = host;
    this.ac = host.ac;
    this.born = host.ac.currentTime;
    this.out = this.ac.createGain();
    this.out.gain.value = volume;
    this.out.connect(host.sfxIn);
  }

  /** Oscillateur démarré à t0 et arrêté à t1. */
  osc(type: OscillatorType, freq: number, t0: number, t1: number): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    this.track(o, t0, t1);
    return o;
  }

  /** Bruit blanc (lu en boucle à partir d'une position aléatoire). */
  noise(t0: number, t1: number, rate = 1): AudioBufferSourceNode {
    const s = this.ac.createBufferSource();
    s.buffer = this.host.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    this.pending++;
    this.sources.push(s);
    s.onended = this.ended;
    s.start(t0, Math.random() * this.host.noise.duration * 0.9);
    s.stop(Math.max(t1, t0 + 0.01));
    return s;
  }

  gain(value = 0): GainNode {
    const g = this.ac.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  /** Saturation douce (courbe partagée). */
  drive(): WaveShaperNode {
    const w = this.ac.createWaveShaper();
    w.curve = this.host.drive;
    w.oversample = 'none';
    this.nodes.push(w);
    return w;
  }

  /** Gain à enveloppe percussive déjà branché sur la sortie de la voix. */
  env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.gain(0);
    perc(g.gain, t, peak, attack, decay);
    g.connect(this.out);
    return g;
  }

  /** Envoi vers l'écho partagé des effets. */
  echo(from: AudioNode, amount: number): void {
    const g = this.gain(amount);
    from.connect(g);
    g.connect(this.host.echoIn);
  }

  /** Coupe la voix en ~20 ms (vol de voix). */
  kill(): void {
    if (this.disposed) return;
    const now = this.ac.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.02);
    for (const s of this.sources) {
      try {
        s.stop(now + 0.03);
      } catch {
        // déjà arrêtée
      }
    }
    // Filet de sécurité si 'ended' n'arrive pas (source jamais démarrée).
    setTimeout(() => this.dispose(), 400);
  }

  /** Après la recette : si aucune source n'a été créée, libère tout de suite. */
  commit(): void {
    if (this.pending === 0) this.dispose();
  }

  private track(s: AudioScheduledSourceNode, t0: number, t1: number): void {
    this.pending++;
    this.sources.push(s);
    s.onended = this.ended;
    s.start(t0);
    s.stop(Math.max(t1, t0 + 0.01));
  }

  private readonly ended = (): void => {
    this.pending--;
    if (this.pending <= 0) this.dispose();
  };

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) {
      s.onended = null;
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
    this.sources.length = 0;
    this.nodes.length = 0;
    this.host.voiceEnded(this);
  }
}
