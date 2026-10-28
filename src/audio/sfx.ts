import type { SfxId } from '../core/types';
import { perc, swell, type SfxVoice } from './voice';

// Recettes des effets sonores : oscillateurs + bruit + filtres + enveloppes.
// `t` = instant de départ sur l'horloge audio, `p` = facteur de hauteur (1 = normal).

type Recipe = (v: SfxVoice, t: number, p: number) => void;

/** Glissement de hauteur d'un oscillateur à travers une enveloppe percussive (renvoyée). */
function chirp(
  v: SfxVoice,
  type: OscillatorType,
  f0: number,
  f1: number,
  t: number,
  dur: number,
  peak: number,
  dest: AudioNode | null = null,
): GainNode {
  const o = v.osc(type, f0, t, t + dur + 0.03);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = v.gain(0);
  perc(g.gain, t, peak, 0.003, dur);
  o.connect(g);
  g.connect(dest ?? v.out);
  return g;
}

/** Note de cloche : sinus + partiel inharmonique bref. Renvoie le gain (pour un envoi d'écho). */
function bellNote(v: SfxVoice, f: number, t: number, peak: number, decay: number): GainNode {
  const g = v.gain(0);
  perc(g.gain, t, peak, 0.002, decay);
  g.connect(v.out);
  const o1 = v.osc('sine', f, t, t + decay + 0.03);
  o1.connect(g);
  const o2 = v.osc('sine', f * 2.76, t, t + decay * 0.35 + 0.03);
  const g2 = v.gain(0);
  perc(g2.gain, t, peak * 0.35, 0.001, decay * 0.3);
  o2.connect(g2);
  g2.connect(v.out);
  return g;
}

/** Bruit filtré à enveloppe percussive. */
function noiseHit(
  v: SfxVoice,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  decay: number,
  rate = 1,
): BiquadFilterNode {
  const n = v.noise(t, t + decay + 0.03, rate);
  const f = v.filter(type, freq, q);
  n.connect(f);
  f.connect(v.env(t, peak, 0.001, decay));
  return f;
}

const semi = (n: number): number => Math.pow(2, n / 12);

export const RECIPES: Record<SfxId, Recipe> = {
  // Petit tic d'interface, doux
  click(v, t, p) {
    chirp(v, 'sine', 1900 * p, 1250 * p, t, 0.035, 0.13);
    noiseHit(v, t, 'highpass', 6000, 0.7, 0.04, 0.012);
  },

  // Saut : gazouillis montant rapide
  jump(v, t, p) {
    const f = v.filter('lowpass', 2800, 0.8);
    f.connect(v.env(t, 0.2, 0.004, 0.17));
    const o = v.osc('square', 240 * p, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(780 * p, t + 0.12);
    o.connect(f);
    const o2 = v.osc('triangle', 480 * p, t, t + 0.2);
    o2.frequency.exponentialRampToValueAtTime(1560 * p, t + 0.12);
    const g2 = v.gain(0.5);
    o2.connect(g2);
    g2.connect(f);
  },

  // Double saut : deux gazouillis plus aigus + scintillement
  doubleJump(v, t, p) {
    const f = v.filter('lowpass', 3600, 0.7);
    f.connect(v.out);
    chirp(v, 'square', 420 * p, 1100 * p, t, 0.09, 0.14, f);
    chirp(v, 'square', 640 * p, 1700 * p, t + 0.065, 0.1, 0.14, f);
    const s = chirp(v, 'sine', 2600 * p, 3300 * p, t + 0.07, 0.14, 0.06);
    v.echo(s, 0.25);
  },

  // Écrasement : choc sourd + bruit visqueux + petit rebond
  stomp(v, t, p) {
    chirp(v, 'sine', 190 * p, 48 * p, t, 0.18, 0.6);
    const n = v.noise(t, t + 0.16);
    const bp = v.filter('bandpass', 900 * p, 3);
    bp.frequency.setValueAtTime(900 * p, t);
    bp.frequency.exponentialRampToValueAtTime(240 * p, t + 0.12);
    n.connect(bp);
    bp.connect(v.env(t, 0.4, 0.004, 0.12));
    chirp(v, 'triangle', 300 * p, 540 * p, t + 0.03, 0.09, 0.09);
  },

  // Ennemi éliminé : « pop » + étincelles
  enemyDie(v, t, p) {
    chirp(v, 'sine', 720 * p, 110 * p, t, 0.08, 0.42);
    noiseHit(v, t, 'highpass', 2500, 0.7, 0.18, 0.025);
    const sparkle = [2093, 2637, 3136, 4186];
    for (let i = 0; i < sparkle.length; i++) {
      const at = t + 0.04 + i * 0.035;
      const o = v.osc('triangle', sparkle[i] * p, at, at + 0.15);
      const g = v.gain(0);
      perc(g.gain, at, 0.085, 0.002, 0.12);
      o.connect(g);
      g.connect(v.out);
      v.echo(g, 0.45);
    }
  },

  // Carapace touchée : modulation en anneau métallique + transitoire
  armorClank(v, t, p) {
    const car = v.osc('square', 820 * p, t, t + 0.3);
    const mod = v.osc('square', 1290 * p, t, t + 0.3);
    const ring = v.gain(0);
    car.connect(ring);
    mod.connect(ring.gain);
    const bp = v.filter('bandpass', 2400 * p, 1.2);
    ring.connect(bp);
    bp.connect(v.env(t, 0.32, 0.001, 0.24));
    chirp(v, 'sine', 560 * p, 500 * p, t, 0.32, 0.16);
    noiseHit(v, t, 'highpass', 3000, 0.8, 0.3, 0.025);
  },

  // Cristal : cloche claire en deux notes
  crystal(v, t, p) {
    const a = bellNote(v, 1318.5 * p, t, 0.2, 0.4);
    const b = bellNote(v, 1975.5 * p, t + 0.07, 0.22, 0.5);
    v.echo(a, 0.25);
    v.echo(b, 0.35);
  },

  // Achat au hangar : déclic de caisse, cascade de cristaux montante, tintement final
  buy(v, t, p) {
    noiseHit(v, t, 'bandpass', 3400 * p, 5, 0.26, 0.03);
    chirp(v, 'square', 520 * p, 780 * p, t, 0.045, 0.07);
    const run = [1318.5, 1760, 2093, 2637];
    for (let i = 0; i < run.length; i++) {
      const g = bellNote(v, run[i] * p, t + 0.05 + i * 0.055, 0.13, 0.3);
      v.echo(g, 0.22);
    }
    const ring = bellNote(v, 3520 * p, t + 0.3, 0.08, 0.55);
    v.echo(ring, 0.35);
    noiseHit(v, t + 0.3, 'highpass', 7500, 0.6, 0.05, 0.25);
  },

  // Tête dans un bloc : coup de bois
  bump(v, t, p) {
    chirp(v, 'sine', 250 * p, 150 * p, t, 0.09, 0.45);
    noiseHit(v, t, 'bandpass', 1100 * p, 6, 0.55, 0.045);
    const o = v.osc('triangle', 680 * p, t, t + 0.06);
    o.connect(v.env(t, 0.12, 0.001, 0.035));
  },

  // Bonus : arpège montant + miroitement
  powerup(v, t, p) {
    const f = v.filter('lowpass', 3800, 0.7);
    f.connect(v.out);
    v.echo(f, 0.3);
    const steps = [0, 4, 7, 12, 16, 19, 24];
    const base = 523.25 * p;
    for (let i = 0; i < steps.length; i++) {
      const at = t + i * 0.052;
      const fr = base * semi(steps[i]);
      const o = v.osc('square', fr * 0.985, at, at + 0.14);
      o.frequency.exponentialRampToValueAtTime(fr, at + 0.03);
      const g = v.gain(0);
      perc(g.gain, at, 0.1, 0.003, 0.11);
      o.connect(g);
      g.connect(f);
    }
    const sh = v.osc('triangle', 1046.5 * p, t + 0.1, t + 0.62);
    sh.frequency.exponentialRampToValueAtTime(2093 * p, t + 0.5);
    const gs = v.gain(0);
    swell(gs.gain, t + 0.1, 0.06, 0.12, 0.15, 0.24);
    sh.connect(gs);
    gs.connect(f);
  },

  // Bouclier brisé : éclats de verre
  shieldBreak(v, t, p) {
    const n = v.noise(t, t + 0.35);
    const hp = v.filter('highpass', 2500, 0.7);
    const bp = v.filter('bandpass', 8000, 0.9);
    bp.frequency.setValueAtTime(8000 * p, t);
    bp.frequency.exponentialRampToValueAtTime(3000 * p, t + 0.28);
    n.connect(hp);
    hp.connect(bp);
    bp.connect(v.env(t, 0.38, 0.001, 0.28));
    for (let i = 0; i < 7; i++) {
      const at = t + Math.random() * 0.22;
      const fr = (2500 + Math.random() * 3500) * p;
      const o = v.osc('sine', fr, at, at + 0.2);
      const g = v.gain(0);
      perc(g.gain, at, 0.07, 0.001, 0.08 + Math.random() * 0.1);
      o.connect(g);
      g.connect(v.out);
      v.echo(g, 0.4);
    }
    const r1 = v.osc('sine', 3520 * p, t, t + 0.4);
    const r2 = v.osc('sine', 4650 * p, t, t + 0.4);
    const gr = v.env(t, 0.08, 0.001, 0.35);
    r1.connect(gr);
    r2.connect(gr);
  },

  // Coup reçu : bourdonnement désaccordé qui descend
  hurt(v, t, p) {
    const lp = v.filter('lowpass', 2200, 1.5);
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    lp.connect(v.env(t, 0.22, 0.004, 0.3));
    const a = v.osc('sawtooth', 440 * p, t, t + 0.34);
    a.frequency.exponentialRampToValueAtTime(170 * p, t + 0.28);
    const b = v.osc('sawtooth', 452 * p, t, t + 0.34);
    b.frequency.exponentialRampToValueAtTime(160 * p, t + 0.28);
    const s = v.osc('square', 220 * p, t, t + 0.34);
    s.frequency.exponentialRampToValueAtTime(85 * p, t + 0.28);
    const gs = v.gain(0.4);
    a.connect(lp);
    b.connect(lp);
    s.connect(gs);
    gs.connect(lp);
  },

  // Mort : descente ondulante + choc final
  death(v, t, p) {
    const lp = v.filter('lowpass', 2400, 2);
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 1.1);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.015);
    g.gain.setValueAtTime(0.2, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + 1.21);
    lp.connect(g);
    g.connect(v.out);
    const o = v.osc('square', 660 * p, t, t + 1.25);
    o.frequency.exponentialRampToValueAtTime(70 * p, t + 1.1);
    const o2 = v.osc('triangle', 330 * p, t, t + 1.25);
    o2.frequency.exponentialRampToValueAtTime(35 * p, t + 1.1);
    const lfo = v.osc('sine', 8, t, t + 1.25);
    const depth = v.gain(90);
    lfo.connect(depth);
    depth.connect(o.detune);
    depth.connect(o2.detune);
    o.connect(lp);
    o2.connect(lp);
    chirp(v, 'sine', 95 * p, 38 * p, t + 1.0, 0.35, 0.4);
  },

  // Point de contrôle : accord carillonné
  checkpoint(v, t, p) {
    const chord = [1046.5, 1318.5, 1568, 2093];
    for (let i = 0; i < chord.length; i++) {
      const g = bellNote(v, chord[i] * p, t + i * 0.05, 0.12, 0.9);
      v.echo(g, 0.35);
    }
    noiseHit(v, t, 'highpass', 7000, 0.6, 0.05, 0.4);
  },

  // Surchauffe : sifflement de vapeur + deux bips d'alerte
  overheat(v, t, p) {
    const n = v.noise(t, t + 0.66);
    const bp = v.filter('bandpass', 5200, 0.7);
    bp.frequency.setValueAtTime(5200, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.6);
    n.connect(bp);
    const gh = v.gain(0);
    gh.gain.setValueAtTime(0, t);
    gh.gain.linearRampToValueAtTime(0.24, t + 0.02);
    gh.gain.exponentialRampToValueAtTime(0.0005, t + 0.62);
    gh.gain.linearRampToValueAtTime(0, t + 0.63);
    bp.connect(gh);
    gh.connect(v.out);
    const lp = v.filter('lowpass', 3000, 0.7);
    lp.connect(v.out);
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.14;
      const o = v.osc('square', 880 * p, at, at + 0.1);
      const g = v.gain(0);
      swell(g.gain, at, 0.09, 0.005, 0.07, 0.01);
      o.connect(g);
      g.connect(lp);
    }
  },

  // Décollage : grondement de bruit qui monte
  takeoff(v, t, p) {
    const n = v.noise(t, t + 2.45);
    const lp = v.filter('lowpass', 180, 1);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 2.1);
    n.connect(lp);
    const g = v.gain(0);
    swell(g.gain, t, 0.5, 0.5, 1.3, 0.6);
    // Trémolo du grondement (après l'enveloppe : silence garanti aux extrémités)
    const tg = v.gain(1);
    const trem = v.osc('sine', 14, t, t + 2.45);
    const td = v.gain(0.25);
    trem.connect(td);
    td.connect(tg.gain);
    lp.connect(g);
    g.connect(tg);
    tg.connect(v.out);
    // Rumeur grave
    const saw = v.osc('sawtooth', 40 * p, t, t + 2.45);
    saw.frequency.exponentialRampToValueAtTime(95 * p, t + 2.2);
    const sl = v.filter('lowpass', 260, 1);
    const gs = v.gain(0);
    swell(gs.gain, t, 0.3, 0.6, 1.2, 0.6);
    saw.connect(sl);
    sl.connect(gs);
    gs.connect(v.out);
    // Sifflement de réacteur
    const w = v.osc('sine', 260 * p, t, t + 2.45);
    w.frequency.exponentialRampToValueAtTime(1400 * p, t + 2.2);
    const gw = v.gain(0);
    swell(gw.gain, t, 0.05, 1, 0.6, 0.8);
    w.connect(gw);
    gw.connect(v.out);
  },

  // Portail traversé : tintement brillant et chatoyant
  gate(v, t, p) {
    const g = v.env(t, 0.16, 0.002, 0.5);
    v.echo(g, 0.45);
    const a = v.osc('sine', 1568 * p, t, t + 0.55);
    const b = v.osc('sine', 1575 * p, t, t + 0.55);
    const c = v.osc('sine', 2349 * p, t, t + 0.55);
    const gc = v.gain(0.5);
    a.connect(g);
    b.connect(g);
    c.connect(gc);
    gc.connect(g);
    noiseHit(v, t, 'highpass', 8000, 0.7, 0.08, 0.08);
    chirp(v, 'triangle', 1046.5 * p, 2093 * p, t, 0.07, 0.06);
  },

  // Portail manqué : bourdonnement grave et terne
  gateMiss(v, t, p) {
    const lp = v.filter('lowpass', 520, 2);
    lp.connect(v.env(t, 0.34, 0.006, 0.36));
    const a = v.osc('sawtooth', 116 * p, t, t + 0.4);
    a.frequency.exponentialRampToValueAtTime(92 * p, t + 0.36);
    const b = v.osc('square', 110 * p, t, t + 0.4);
    b.frequency.exponentialRampToValueAtTime(86 * p, t + 0.36);
    a.connect(lp);
    b.connect(lp);
  },

  // Turbo : souffle (whoosh)
  boost(v, t, p) {
    const n = v.noise(t, t + 0.8);
    const bp = v.filter('bandpass', 380, 1.1);
    bp.frequency.setValueAtTime(380 * p, t);
    bp.frequency.exponentialRampToValueAtTime(3200 * p, t + 0.35);
    bp.frequency.exponentialRampToValueAtTime(1400 * p, t + 0.72);
    n.connect(bp);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.75);
    g.gain.linearRampToValueAtTime(0, t + 0.76);
    bp.connect(g);
    g.connect(v.out);
    const o = v.osc('sine', 70 * p, t, t + 0.55);
    o.frequency.exponentialRampToValueAtTime(120 * p, t + 0.4);
    o.connect(v.env(t, 0.25, 0.05, 0.45));
  },

  // Choc : rafale de bruit saturée + boum grave
  crash(v, t, p) {
    const n = v.noise(t, t + 0.75);
    const lp = v.filter('lowpass', 4200, 0.8);
    lp.frequency.setValueAtTime(4200 * p, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    const d = v.drive();
    n.connect(lp);
    lp.connect(d);
    d.connect(v.env(t, 0.5, 0.001, 0.7));
    chirp(v, 'sine', 110 * p, 32 * p, t, 0.8, 0.75);
    noiseHit(v, t + 0.02, 'highpass', 3000, 0.7, 0.22, 0.15, 0.8);
  },

  // Distorsion (warp) : long balayage filtré montant
  warp(v, t, p) {
    const lp = v.filter('lowpass', 300, 7);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(7000, t + 2.2);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 1.6);
    g.gain.linearRampToValueAtTime(0.28, t + 2.2);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    lp.connect(g);
    g.connect(v.out);
    const a = v.osc('sawtooth', 110 * p, t, t + 2.65);
    a.frequency.exponentialRampToValueAtTime(880 * p, t + 2.2);
    a.detune.value = -12;
    const b = v.osc('sawtooth', 110 * p, t, t + 2.65);
    b.frequency.exponentialRampToValueAtTime(880 * p, t + 2.2);
    b.detune.value = 12;
    a.connect(lp);
    b.connect(lp);
    const n = v.noise(t, t + 2.65);
    const bp = v.filter('bandpass', 500, 2);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + 2.4);
    const gn = v.gain(0);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.25, t + 2.2);
    gn.gain.linearRampToValueAtTime(0, t + 2.6);
    n.connect(bp);
    bp.connect(gn);
    gn.connect(v.out);
    const sh = bellNote(v, 1760 * p, t + 2.1, 0.1, 0.6);
    v.echo(sh, 0.4);
  },

  // Victoire : courte fanfare
  win(v, t, p) {
    const lp = v.filter('lowpass', 3200, 0.7);
    lp.connect(v.out);
    v.echo(lp, 0.2);
    const run = [392, 523.25, 659.25, 783.99];
    for (let i = 0; i < run.length; i++) {
      const at = t + i * 0.11;
      const o = v.osc('square', run[i] * p, at, at + 0.12);
      const g = v.gain(0);
      swell(g.gain, at, 0.11, 0.005, 0.07, 0.03);
      o.connect(g);
      g.connect(lp);
    }
    const at = t + 0.46;
    const top = v.osc('square', 1046.5 * p, at, at + 0.95);
    const vib = v.osc('sine', 6, at, at + 0.95);
    const vd = v.gain(0);
    vd.gain.setValueAtTime(0, at);
    vd.gain.linearRampToValueAtTime(18, at + 0.4);
    vib.connect(vd);
    vd.connect(top.detune);
    const gt = v.gain(0);
    swell(gt.gain, at, 0.12, 0.01, 0.5, 0.4);
    top.connect(gt);
    gt.connect(lp);
    const chord = [261.63, 329.63, 392];
    const gc = v.gain(0);
    swell(gc.gain, at, 0.07, 0.02, 0.45, 0.45);
    const cl = v.filter('lowpass', 2000, 0.6);
    cl.connect(gc);
    gc.connect(v.out);
    for (let i = 0; i < chord.length; i++) {
      const o = v.osc('sawtooth', chord[i] * p, at, at + 0.95);
      o.connect(cl);
    }
    const s = bellNote(v, 2093 * p, at + 0.05, 0.06, 0.6);
    v.echo(s, 0.4);
  },

  // Défaite : phrase mineure descendante
  lose(v, t, p) {
    const lp = v.filter('lowpass', 1800, 0.7);
    lp.connect(v.out);
    v.echo(lp, 0.15);
    const line = [659.25, 587.33, 523.25, 493.88];
    for (let i = 0; i < line.length; i++) {
      const at = t + i * 0.2;
      const o = v.osc('triangle', line[i] * p, at, at + 0.2);
      const o2 = v.osc('square', line[i] * p, at, at + 0.2);
      const g = v.gain(0);
      swell(g.gain, at, 0.14, 0.01, 0.14, 0.04);
      const g2 = v.gain(0.25);
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(lp);
    }
    const at = t + 0.8;
    const last = v.osc('triangle', 440 * p, at, at + 0.95);
    last.frequency.setValueAtTime(440 * p, at + 0.3);
    last.frequency.exponentialRampToValueAtTime(415 * p, at + 0.9);
    const gl = v.gain(0);
    swell(gl.gain, at, 0.16, 0.02, 0.45, 0.45);
    last.connect(gl);
    gl.connect(lp);
    const pad = [220, 261.63, 329.63];
    const pl = v.filter('lowpass', 900, 0.6);
    const gp = v.gain(0);
    swell(gp.gain, at, 0.06, 0.2, 0.3, 0.45);
    pl.connect(gp);
    gp.connect(v.out);
    for (let i = 0; i < pad.length; i++) {
      const o = v.osc('sawtooth', pad[i] * p, at, at + 0.97);
      o.connect(pl);
    }
  },

  // Laser : zap rapide qui chute en hauteur
  laser(v, t, p) {
    const lp = v.filter('lowpass', 7000, 2);
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.14);
    lp.connect(v.env(t, 0.22, 0.002, 0.14));
    const a = v.osc('square', 1500 * p, t, t + 0.17);
    a.frequency.exponentialRampToValueAtTime(190 * p, t + 0.14);
    const b = v.osc('sawtooth', 2250 * p, t, t + 0.17);
    b.frequency.exponentialRampToValueAtTime(260 * p, t + 0.12);
    const gb = v.gain(0.45);
    a.connect(lp);
    b.connect(gb);
    gb.connect(lp);
  },

  // Mitrailleur : tic sec et feutré (un par tir, toutes les 80 ms, 48 avec la cadence : ≤ 70 ms et discret)
  machinegun(v, t, p) {
    const lp = v.filter('lowpass', 3600, 0.7);
    lp.frequency.setValueAtTime(3600 * p, t);
    lp.frequency.exponentialRampToValueAtTime(900 * p, t + 0.04);
    lp.connect(v.env(t, 0.12, 0.001, 0.04));
    const o = v.osc('square', 900 * p, t, t + 0.055);
    o.frequency.exponentialRampToValueAtTime(210 * p, t + 0.04);
    o.connect(lp);
    noiseHit(v, t, 'bandpass', 2600 * p, 1.1, 0.13, 0.02);
    chirp(v, 'sine', 170 * p, 80 * p, t, 0.035, 0.16);
  },

  // Pompe : détonation grave (souffle de bruit saturé, coup sourd, grondement) puis réarmement en deux clics
  shotgun(v, t, p) {
    const n = v.noise(t, t + 0.3, 0.7);
    const lp = v.filter('lowpass', 5200, 0.8);
    lp.frequency.setValueAtTime(5200 * p, t);
    lp.frequency.exponentialRampToValueAtTime(350 * p, t + 0.24);
    const d = v.drive();
    n.connect(lp);
    lp.connect(d);
    d.connect(v.env(t, 0.36, 0.001, 0.26));
    chirp(v, 'sine', 150 * p, 42 * p, t, 0.24, 0.55);
    const s = v.osc('sawtooth', 95 * p, t, t + 0.17);
    s.frequency.exponentialRampToValueAtTime(48 * p, t + 0.14);
    const sl = v.filter('lowpass', 700, 1);
    s.connect(sl);
    sl.connect(v.env(t, 0.2, 0.002, 0.14));
    noiseHit(v, t, 'highpass', 3200, 0.7, 0.26, 0.03);
    // Réarmement (avant le tir suivant, même avec la cadence : 360 ms)
    noiseHit(v, t + 0.24, 'bandpass', 2600 * p, 5, 0.3, 0.022);
    noiseHit(v, t + 0.31, 'bandpass', 1900 * p, 5, 0.26, 0.028);
  },

  // Fusil d'assaut : claquement sec et saturé (un par balle, 3 par rafale à 70 ms : ≤ 100 ms, sans écho)
  rifle(v, t, p) {
    const d = v.drive();
    const lp = v.filter('lowpass', 6500, 0.9);
    lp.frequency.setValueAtTime(6500 * p, t);
    lp.frequency.exponentialRampToValueAtTime(1200 * p, t + 0.06);
    d.connect(lp);
    lp.connect(v.env(t, 0.24, 0.001, 0.07));
    const n = v.noise(t, t + 0.085);
    const gn = v.gain(0.8);
    n.connect(gn);
    gn.connect(d);
    const o = v.osc('square', 1400 * p, t, t + 0.085);
    o.frequency.exponentialRampToValueAtTime(260 * p, t + 0.05);
    const go = v.gain(0.5);
    o.connect(go);
    go.connect(d);
    chirp(v, 'sine', 230 * p, 75 * p, t, 0.055, 0.34);
    noiseHit(v, t, 'highpass', 4500, 0.8, 0.2, 0.018, 1.2);
  },

  // Impact de laser : petit grésillement électrique
  laserHit(v, t, p) {
    noiseHit(v, t, 'bandpass', 3200 * p, 1.4, 0.32, 0.07);
    chirp(v, 'square', 1100 * p, 320 * p, t, 0.06, 0.08);
    noiseHit(v, t + 0.028, 'highpass', 5000, 0.8, 0.18, 0.035, 1.3);
  },
};
