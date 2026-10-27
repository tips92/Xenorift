import { mtof } from './theory';

// Instruments de musique synthétisés. Chaque note crée quelques nœuds Web Audio de courte durée,
// tous débranchés à la fin (onended). Une « Band » = les bus de mixage d'une instance de morceau.

export type BusName = 'drums' | 'perc' | 'bass' | 'pad' | 'arp' | 'lead' | 'bell' | 'pluck' | 'stab' | 'fx';

export interface BusSpec {
  gain: number;
  /** Envoi vers l'écho (delay) partagé. */
  delay?: number;
  /** Envoi vers la réverbération partagée. */
  verb?: number;
  /** Passe-bas fixe sur tout le bus (adoucit les ondes carrées). */
  lowpass?: number;
  /** Panoramique -1..1. */
  pan?: number;
}

export type MixSpec = Partial<Record<BusName, BusSpec>>;

/** Ce que le moteur fournit aux instruments. */
export interface MusicHost {
  readonly ac: AudioContext;
  readonly noise: AudioBuffer;
  readonly musicIn: AudioNode;
  readonly delayIn: AudioNode;
  readonly verbIn: AudioNode;
  /** Réserve une voix ; false si le budget CPU est atteint pour cette priorité (0 = décor … 3 = essentiel). */
  take(priority: number): boolean;
  /** Libère une voix réservée. */
  release(): void;
}

export interface BassOpts {
  wave?: OscillatorType;
  /** Coupure de repos du passe-bas (Hz). */
  cutoff?: number;
  /** Ouverture du filtre à l'attaque (Hz ajoutés, multipliés par la vélocité). */
  env?: number;
  /** Constante de temps de refermeture du filtre (s). */
  decay?: number;
  q?: number;
  attack?: number;
  release?: number;
  /** Niveau de maintien relatif (0..1). */
  sustain?: number;
}

export interface LeadOpts {
  wave?: OscillatorType;
  /** Second oscillateur désaccordé de n cents (0 = aucun). */
  detune?: number;
  /** Note MIDI de départ du glissando (-1 = aucun). */
  glideFrom?: number;
  glide?: number;
  /** Profondeur du vibrato en cents (0 = aucun). */
  vibrato?: number;
  attack?: number;
  release?: number;
}

export interface PadOpts {
  wave?: OscillatorType;
  cutoff?: number;
  attack?: number;
  release?: number;
  /** Écart des deux oscillateurs par note, en cents. */
  detune?: number;
}

const BUS_NAMES: readonly BusName[] = ['drums', 'perc', 'bass', 'pad', 'arp', 'lead', 'bell', 'pluck', 'stab', 'fx'];
const DEFAULT_BUS: BusSpec = { gain: 0.5 };
const SILENT = 0.0008;

export class Band {
  readonly ac: AudioContext;
  private readonly host: MusicHost;
  private readonly fadeDry: GainNode;
  private readonly fadeDelay: GainNode;
  private readonly fadeVerb: GainNode;
  private readonly bus: Record<BusName, GainNode>;
  private readonly owned: AudioNode[] = [];
  private readonly noiseSpan: number;

  constructor(host: MusicHost, mix: MixSpec, level: number) {
    this.host = host;
    const ac = (this.ac = host.ac);
    this.noiseSpan = host.noise.duration * 0.9;
    this.fadeDry = this.own(ac.createGain());
    this.fadeDelay = this.own(ac.createGain());
    this.fadeVerb = this.own(ac.createGain());
    this.fadeDry.gain.value = 0;
    this.fadeDelay.gain.value = 0;
    this.fadeVerb.gain.value = 0;
    this.fadeDry.connect(host.musicIn);
    this.fadeDelay.connect(host.delayIn);
    this.fadeVerb.connect(host.verbIn);

    const bus = {} as Record<BusName, GainNode>;
    for (const name of BUS_NAMES) {
      const spec = mix[name] ?? DEFAULT_BUS;
      const input = this.own(ac.createGain());
      input.gain.value = spec.gain * level;
      let tail: AudioNode = input;
      if (spec.lowpass) {
        const f = this.own(ac.createBiquadFilter());
        f.type = 'lowpass';
        f.frequency.value = spec.lowpass;
        f.Q.value = 0.5;
        tail.connect(f);
        tail = f;
      }
      if (spec.pan && typeof ac.createStereoPanner === 'function') {
        const p = this.own(ac.createStereoPanner());
        p.pan.value = spec.pan;
        tail.connect(p);
        tail = p;
      }
      tail.connect(this.fadeDry);
      if (spec.delay) {
        const s = this.own(ac.createGain());
        s.gain.value = spec.delay;
        tail.connect(s);
        s.connect(this.fadeDelay);
      }
      if (spec.verb) {
        const s = this.own(ac.createGain());
        s.gain.value = spec.verb;
        tail.connect(s);
        s.connect(this.fadeVerb);
      }
      bus[name] = input;
    }
    this.bus = bus;
  }

  /** Fondu de l'ensemble du morceau (sec + envois) vers `to` en `dur` secondes. */
  fade(to: number, dur: number): void {
    const t = this.ac.currentTime;
    for (const g of [this.fadeDry, this.fadeDelay, this.fadeVerb]) {
      const p = g.gain;
      const from = p.value;
      p.cancelScheduledValues(t);
      p.setValueAtTime(from, t);
      p.linearRampToValueAtTime(to, t + Math.max(0.01, dur));
    }
  }

  dispose(): void {
    for (const n of this.owned) {
      try {
        n.disconnect();
      } catch {
        // déjà débranché
      }
    }
    this.owned.length = 0;
  }

  // ------------------------------------------------------------------ batterie

  kick(t: number, vel = 1, f0 = 150, f1 = 45, decay = 0.36): void {
    if (!this.host.take(3)) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.11);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    o.connect(g);
    g.connect(this.bus.drums);
    o.start(t);
    o.stop(t + decay + 0.02);
    this.done(o, g);
  }

  /** Grondement très grave et long (ambiances). */
  boom(t: number, vel = 0.6): void {
    this.kick(t, vel, 75, 27, 1.8);
  }

  snare(t: number, vel = 1, decay = 0.17, tone = 190): void {
    if (!this.host.take(2)) return;
    const ac = this.ac;
    const n = this.noiseSrc();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1150;
    hp.Q.value = 0.7;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(vel * 0.5, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(tone, t);
    o.frequency.exponentialRampToValueAtTime(tone * 0.72, t + 0.08);
    const go = ac.createGain();
    go.gain.setValueAtTime(0, t);
    go.gain.linearRampToValueAtTime(vel * 0.42, t + 0.002);
    go.gain.exponentialRampToValueAtTime(SILENT, t + 0.09);
    n.connect(hp);
    hp.connect(gn);
    gn.connect(this.bus.drums);
    o.connect(go);
    go.connect(this.bus.drums);
    // La source de bruit s'arrête en dernier : c'est elle qui libère la note.
    this.startNoise(n, t, t + Math.max(decay, 0.1) + 0.02);
    o.start(t);
    o.stop(t + 0.1);
    this.done(n, hp, gn, o, go);
  }

  hat(t: number, vel = 0.5, open = false): void {
    if (!this.host.take(0)) return;
    const ac = this.ac;
    const n = this.noiseSrc();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    hp.Q.value = 0.9;
    const g = ac.createGain();
    const d = open ? 0.24 : 0.045;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(SILENT, t + d);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.bus.drums);
    this.startNoise(n, t, t + d + 0.02);
    this.done(n, hp, g);
  }

  shaker(t: number, vel = 0.4): void {
    if (!this.host.take(0)) return;
    const ac = this.ac;
    const n = this.noiseSrc();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6300;
    bp.Q.value = 1.3;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.012);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.075);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.bus.perc);
    this.startNoise(n, t, t + 0.09);
    this.done(n, bp, g);
  }

  /** Bois / cerclage : petit claquement sec. */
  rim(t: number, vel = 0.5): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.001);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.04);
    const n = this.noiseSrc();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(vel * 0.5, t + 0.001);
    gn.gain.exponentialRampToValueAtTime(SILENT, t + 0.028);
    o.connect(g);
    g.connect(this.bus.perc);
    n.connect(bp);
    bp.connect(gn);
    gn.connect(this.bus.perc);
    o.start(t);
    o.stop(t + 0.05);
    this.startNoise(n, t, t + 0.05);
    this.done(n, bp, gn, o, g);
  }

  /** Tambour tribal accordé (glissement de hauteur + claque optionnelle). */
  tom(t: number, freq: number, vel = 0.6, decay = 0.3, slap = false): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.62, t + 0.002);
    g.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    o.connect(g);
    g.connect(this.bus.perc);
    o.start(t);
    o.stop(t + decay + 0.02);
    if (slap) {
      const n = this.noiseSrc();
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 1.2;
      const gn = ac.createGain();
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(vel * 0.35, t + 0.001);
      gn.gain.exponentialRampToValueAtTime(SILENT, t + 0.03);
      n.connect(bp);
      bp.connect(gn);
      gn.connect(this.bus.perc);
      this.startNoise(n, t, t + 0.04);
      n.onended = () => {
        n.disconnect();
        bp.disconnect();
        gn.disconnect();
      };
    }
    this.done(o, g);
  }

  crash(t: number, vel = 0.6, dur = 1.6): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const n = this.noiseSrc();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    hp.Q.value = 0.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.24, t + 0.002);
    g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.bus.drums);
    this.startNoise(n, t, t + dur + 0.02);
    this.done(n, hp, g);
  }

  /** Montée de bruit filtré avant une relance. */
  riser(t: number, dur: number, vel = 0.7): void {
    if (!this.host.take(2)) return;
    const ac = this.ac;
    const n = this.noiseSrc();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.5;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.32, t + dur * 0.94);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.bus.fx);
    this.startNoise(n, t, t + dur + 0.02);
    this.done(n, bp, g);
  }

  // ------------------------------------------------------------------ notes

  bass(t: number, midi: number, dur: number, vel: number, o: BassOpts = {}): void {
    if (!this.host.take(3)) return;
    const ac = this.ac;
    const cutoff = o.cutoff ?? 420;
    const env = o.env ?? 900;
    const decay = o.decay ?? 0.09;
    const attack = o.attack ?? 0.005;
    const release = o.release ?? 0.06;
    const peak = vel * 0.5;
    const osc = ac.createOscillator();
    osc.type = o.wave ?? 'sawtooth';
    osc.frequency.setValueAtTime(mtof(midi), t);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q ?? 3;
    lp.frequency.setValueAtTime(cutoff + env * vel, t);
    lp.frequency.setTargetAtTime(cutoff, t + 0.004, decay);
    const g = ac.createGain();
    const end = t + Math.max(dur, attack + 0.02);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(peak * (o.sustain ?? 0.75), t + attack, 0.12);
    g.gain.setTargetAtTime(0, end, release / 4);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.bus.bass);
    osc.start(t);
    osc.stop(end + release * 1.5 + 0.02);
    this.done(osc, lp, g);
  }

  /** Lame façon marimba : fondamentale + partiel au quadruple, très court. */
  pluck(t: number, midi: number, vel = 0.6, decay = 0.5): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const f = mtof(midi);
    const o1 = ac.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f, t);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(vel * 0.42, t + 0.002);
    g1.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 3.98, t);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vel * 0.16, t + 0.001);
    g2.gain.exponentialRampToValueAtTime(SILENT, t + 0.07);
    o1.connect(g1);
    o2.connect(g2);
    g1.connect(this.bus.pluck);
    g2.connect(this.bus.pluck);
    o1.start(t);
    o2.start(t);
    o2.stop(t + 0.09);
    o1.stop(t + decay + 0.02);
    this.done(o1, g1, o2, g2);
  }

  /** Cloche FM : porteuse sinus modulée par un sinus inharmonique dont l'indice décroît. */
  bell(t: number, midi: number, vel = 0.5, decay = 1.8, ratio = 3.5, bright = 1): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const f = mtof(midi);
    const car = ac.createOscillator();
    car.type = 'sine';
    car.frequency.setValueAtTime(f, t);
    const mod = ac.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(f * ratio, t);
    const idx = ac.createGain();
    idx.gain.setValueAtTime(f * 2.2 * bright, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.08 * bright + 1, t + decay * 0.55);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.003);
    g.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    mod.connect(idx);
    idx.connect(car.frequency);
    car.connect(g);
    g.connect(this.bus.bell);
    mod.start(t);
    car.start(t);
    mod.stop(t + decay + 0.02);
    car.stop(t + decay + 0.02);
    this.done(car, g, mod, idx);
  }

  /** Note d'arpège : attaque nette et extinction rapide. */
  arp(t: number, midi: number, vel = 0.5, decay = 0.2, wave: OscillatorType = 'square'): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(mtof(midi), t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.24, t + 0.003);
    g.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    o.connect(g);
    g.connect(this.bus.arp);
    o.start(t);
    o.stop(t + decay + 0.02);
    this.done(o, g);
  }

  /** Mélodie : enveloppe tenue, vibrato progressif, glissando et désaccord optionnels. */
  lead(t: number, midi: number, dur: number, vel: number, o: LeadOpts = {}): void {
    if (!this.host.take(2)) return;
    const ac = this.ac;
    const f = mtof(midi);
    const attack = o.attack ?? 0.012;
    const release = o.release ?? 0.09;
    const end = t + Math.max(dur, attack + 0.02);
    const stopAt = end + release * 1.5 + 0.02;
    const glideFrom = o.glideFrom ?? -1;
    const glide = o.glide ?? 0.06;
    const peak = vel * 0.2;

    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(peak * 0.72, t + attack, 0.15);
    g.gain.setTargetAtTime(0, end, release / 4);
    g.connect(this.bus.lead);

    const o1 = ac.createOscillator();
    o1.type = o.wave ?? 'square';
    this.setPitch(o1.frequency, t, f, glideFrom, glide);
    o1.connect(g);
    o1.start(t);
    o1.stop(stopAt);

    let o2: OscillatorNode | null = null;
    if (o.detune) {
      o2 = ac.createOscillator();
      o2.type = o1.type;
      o2.detune.value = o.detune;
      this.setPitch(o2.frequency, t, f, glideFrom, glide);
      o2.connect(g);
      o2.start(t);
      o2.stop(stopAt);
    }

    let lfo: OscillatorNode | null = null;
    let depth: GainNode | null = null;
    const vib = o.vibrato ?? 0;
    if (vib > 0 && dur > 0.28) {
      lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.4;
      depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(vib, t + Math.min(0.45, dur * 0.7));
      lfo.connect(depth);
      depth.connect(o1.detune);
      if (o2) depth.connect(o2.detune);
      lfo.start(t);
      lfo.stop(stopAt);
    }
    const a = o2;
    const l = lfo;
    const dp = depth;
    o1.onended = () => {
      o1.disconnect();
      g.disconnect();
      if (a) a.disconnect();
      if (l) l.disconnect();
      if (dp) dp.disconnect();
      this.host.release();
    };
  }

  /** Nappe : deux oscillateurs désaccordés par note, passe-bas qui s'ouvre lentement. */
  pad(t: number, midis: readonly number[], dur: number, vel: number, o: PadOpts = {}): void {
    if (!this.host.take(2)) return;
    const ac = this.ac;
    const cutoff = o.cutoff ?? 1200;
    const attack = o.attack ?? 0.6;
    const release = o.release ?? 1;
    const det = o.detune ?? 8;
    const end = t + Math.max(dur, attack + 0.05);
    const stopAt = end + release * 1.5 + 0.03;
    const peak = (vel * 0.13) / Math.sqrt(Math.max(1, midis.length));

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(cutoff * 0.5, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + attack * 1.2);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, end);
    g.gain.setTargetAtTime(0, end, release / 4);
    lp.connect(g);
    g.connect(this.bus.pad);

    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < midis.length; i++) {
      const f = mtof(midis[i]);
      for (let k = -1; k <= 1; k += 2) {
        const osc = ac.createOscillator();
        osc.type = o.wave ?? 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.detune.value = k * det;
        osc.connect(lp);
        osc.start(t);
        osc.stop(stopAt);
        oscs.push(osc);
      }
    }
    const last = oscs[oscs.length - 1];
    if (!last) {
      lp.disconnect();
      g.disconnect();
      this.host.release();
      return;
    }
    last.onended = () => {
      for (const osc of oscs) osc.disconnect();
      lp.disconnect();
      g.disconnect();
      this.host.release();
    };
  }

  /** Accord bref et percutant. */
  stab(t: number, midis: readonly number[], vel = 0.5, decay = 0.13, wave: OscillatorType = 'square'): void {
    if (!this.host.take(1)) return;
    const ac = this.ac;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + decay);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((vel * 0.2) / Math.sqrt(Math.max(1, midis.length)), t + 0.003);
    g.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    lp.connect(g);
    g.connect(this.bus.stab);
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < midis.length; i++) {
      const osc = ac.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(mtof(midis[i]), t);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + decay + 0.02);
      oscs.push(osc);
    }
    const last = oscs[oscs.length - 1];
    if (!last) {
      lp.disconnect();
      g.disconnect();
      this.host.release();
      return;
    }
    last.onended = () => {
      for (const osc of oscs) osc.disconnect();
      lp.disconnect();
      g.disconnect();
      this.host.release();
    };
  }

  // ------------------------------------------------------------------ utilitaires

  private own<T extends AudioNode>(n: T): T {
    this.owned.push(n);
    return n;
  }

  private setPitch(p: AudioParam, t: number, f: number, from: number, glide: number): void {
    if (from >= 0) {
      p.setValueAtTime(mtof(from), t);
      p.exponentialRampToValueAtTime(f, t + glide);
    } else {
      p.setValueAtTime(f, t);
    }
  }

  private noiseSrc(): AudioBufferSourceNode {
    const n = this.ac.createBufferSource();
    n.buffer = this.host.noise;
    n.loop = true;
    return n;
  }

  private startNoise(n: AudioBufferSourceNode, t: number, stopAt: number): void {
    n.start(t, Math.random() * this.noiseSpan);
    n.stop(stopAt);
  }

  /** Débranche les nœuds d'une note quand sa source se termine et libère la voix. */
  private done(src: AudioScheduledSourceNode, a: AudioNode, b?: AudioNode, c?: AudioNode, d?: AudioNode): void {
    src.onended = () => {
      src.disconnect();
      a.disconnect();
      if (b) b.disconnect();
      if (c) c.disconnect();
      if (d) d.disconnect();
      this.host.release();
    };
  }
}
