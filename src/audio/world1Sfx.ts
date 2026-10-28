import { FLOOR, perc, swell, type SfxVoice } from './voice';

// Effets sonores du monde 1 (étape 4) : boss, arène, champignons, créature, radio de LUMA, histoire.
// Même format que RECIPES (sfx.ts) : `t` = départ sur l'horloge audio, `p` = facteur de hauteur (1 = normal).
// Une recette = une voix (24 au plus, partagées) ; nœuds créés seulement par v.osc / noise / gain / filter /
// drive / env / echo, toutes les sources s'arrêtent, rampes exponentielles vers FLOOR (jamais vers 0).

export const WORLD1_SFX_IDS = [
  'bossAppear',
  'bossHit',
  'bossArmor',
  'bossPhase',
  'bossDefeat',
  'barrier',
  'mushroomBounce',
  'quake',
  'sporeDrop',
  'radioOpen',
  'lumaBip',
  'skill',
  'liberation',
  'blueprint',
  'rescue',
  'whaleCry',
  'leviathanRoar',
  'portalSwallow',
] as const;
export type World1SfxId = (typeof WORLD1_SFX_IDS)[number];

/** Même forme que les recettes de sfx.ts. */
export type Recipe = (v: SfxVoice, t: number, p: number) => void;

/** Glissement de hauteur d'un oscillateur à travers une enveloppe percussive (renvoyée). */
function chirp(v: SfxVoice, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number): GainNode {
  const o = v.osc(type, f0, t, t + dur + 0.03);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = v.gain(0);
  perc(g.gain, t, peak, 0.003, dur);
  o.connect(g);
  g.connect(v.out);
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
function noiseHit(v: SfxVoice, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, rate = 1): void {
  const n = v.noise(t, t + decay + 0.03, rate);
  const f = v.filter(type, freq, q);
  n.connect(f);
  f.connect(v.env(t, peak, 0.001, decay));
}

/** Montée linéaire, palier, puis extinction exponentielle (queue plus naturelle que swell). Renvoie la fin. */
function bloom(p: AudioParam, t: number, peak: number, attack: number, hold: number, decay: number): number {
  const pk = Math.max(peak, FLOOR * 2);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(pk, t + attack);
  p.setValueAtTime(pk, t + attack + hold);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + hold + decay);
  p.linearRampToValueAtTime(0, t + attack + hold + decay + 0.01);
  return t + attack + hold + decay + 0.015;
}

/** Fréquence d'un filtre : départ puis rampes exponentielles successives `[valeur, instant]`. */
function sweep(p: AudioParam, t: number, f0: number, ...pts: [number, number][]): void {
  p.setValueAtTime(f0, t);
  for (const [f, at] of pts) p.exponentialRampToValueAtTime(f, at);
}

/** Vibrato (cents) qui s'installe en `rise` secondes, appliqué aux oscillateurs donnés. */
function vibrato(v: SfxVoice, t: number, end: number, rate: number, cents: number, rise: number, ...oscs: OscillatorNode[]): void {
  const lfo = v.osc('sine', rate, t, end);
  const depth = v.gain(0);
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + rise);
  lfo.connect(depth);
  for (const o of oscs) depth.connect(o.detune);
}

const semi = (n: number): number => Math.pow(2, n / 12);

export const WORLD1_RECIPES: Record<World1SfxId, Recipe> = {
  // Apparition d'un boss : coup très grave, accord de cuivres saturé en triton, rugissement qui retombe
  bossAppear(v, t, p) {
    chirp(v, 'sine', 90 * p, 30 * p, t, 1.1, 0.6);
    const pre = v.gain(0.3);
    const d = v.drive();
    const lp = v.filter('lowpass', 300, 2.5);
    sweep(lp.frequency, t, 300, [2600, t + 0.18], [500, t + 1.4]);
    const g = v.gain(0);
    bloom(g.gain, t, 0.2, 0.04, 0.35, 1.1);
    pre.connect(d);
    d.connect(lp);
    lp.connect(g);
    g.connect(v.out);
    const brass = [82.41, 116.54, 164.81, 233.08]; // mi, si bémol (triton), à l'octave
    for (let i = 0; i < brass.length; i++) {
      const f = brass[i] * p;
      const o = v.osc('sawtooth', f * 1.04, t, t + 1.6);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      o.detune.value = i % 2 === 0 ? -7 : 7;
      o.connect(pre);
    }
    const r = v.osc('sawtooth', 230 * p, t + 0.08, t + 1.3);
    r.frequency.exponentialRampToValueAtTime(110 * p, t + 1.2);
    const rf = v.filter('bandpass', 900, 3);
    sweep(rf.frequency, t + 0.08, 900, [420, t + 1.2]);
    const rg = v.gain(0);
    swell(rg.gain, t + 0.08, 0.16, 0.1, 0.45, 0.6);
    r.connect(rf);
    rf.connect(rg);
    rg.connect(v.out);
    vibrato(v, t + 0.08, t + 1.3, 6, 30, 0.4, r);
    const n = v.noise(t, t + 0.85, 0.8);
    const nl = v.filter('lowpass', 2500, 0.7);
    sweep(nl.frequency, t, 2500, [200, t + 0.8]);
    n.connect(nl);
    nl.connect(v.env(t, 0.22, 0.002, 0.8));
  },

  // Coup porté au boss : choc mat, giclée humide, petit tic clair (doit traverser la musique sans lasser ;
  // hauteur légèrement variée d'un coup à l'autre)
  bossHit(v, t, pitch) {
    const p = pitch * (0.96 + Math.random() * 0.08);
    // Choc au-dessus des grosses caisses (qu'il ne s'additionne pas à elles en plein combat)
    chirp(v, 'sine', 230 * p, 95 * p, t, 0.1, 0.34);
    const n = v.noise(t, t + 0.1);
    const bp = v.filter('bandpass', 1400 * p, 4);
    sweep(bp.frequency, t, 1400 * p, [320 * p, t + 0.08]);
    n.connect(bp);
    bp.connect(v.env(t, 0.4, 0.002, 0.08));
    chirp(v, 'triangle', 1700 * p, 950 * p, t, 0.04, 0.1);
  },

  // Tir dévié par une carapace : claquement, tintement métallique, ricochet qui s'éloigne
  bossArmor(v, t, p) {
    noiseHit(v, t, 'highpass', 4200, 0.8, 0.28, 0.018);
    const ring = v.env(t, 0.13, 0.001, 0.26);
    v.echo(ring, 0.25);
    const a = v.osc('sine', 2350 * p, t, t + 0.3);
    a.connect(ring);
    const b = v.osc('sine', 3420 * p, t, t + 0.3);
    const gb = v.gain(0.6);
    b.connect(gb);
    gb.connect(ring);
    const c = v.osc('square', 1180 * p, t, t + 0.08);
    c.connect(v.env(t, 0.05, 0.001, 0.05));
    const w = v.osc('sine', 2900 * p, t + 0.03, t + 0.36);
    w.frequency.exponentialRampToValueAtTime(950 * p, t + 0.33);
    const gw = v.gain(0);
    swell(gw.gain, t + 0.03, 0.08, 0.02, 0.12, 0.17);
    w.connect(gw);
    gw.connect(v.out);
  },

  // Changement de phase : montée (0,55 s) puis impact saturé et rugissement bref
  bossPhase(v, t, p) {
    const rise = 0.55;
    const n = v.noise(t, t + rise + 0.05);
    const bp = v.filter('bandpass', 400 * p, 3);
    sweep(bp.frequency, t, 400 * p, [5000 * p, t + rise]);
    const gn = v.gain(0);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.24, t + rise);
    gn.gain.linearRampToValueAtTime(0, t + rise + 0.04);
    n.connect(bp);
    bp.connect(gn);
    gn.connect(v.out);
    const s = v.osc('sawtooth', 110 * p, t, t + rise + 0.05);
    s.frequency.exponentialRampToValueAtTime(440 * p, t + rise);
    const sl = v.filter('lowpass', 1800, 1);
    const gs = v.gain(0);
    gs.gain.setValueAtTime(0, t);
    gs.gain.linearRampToValueAtTime(0.12, t + rise);
    gs.gain.linearRampToValueAtTime(0, t + rise + 0.04);
    s.connect(sl);
    sl.connect(gs);
    gs.connect(v.out);

    const ti = t + rise;
    chirp(v, 'sine', 130 * p, 34 * p, ti, 0.7, 0.34);
    const n2 = v.noise(ti, ti + 0.5, 0.8);
    const lp = v.filter('lowpass', 5000, 0.8);
    sweep(lp.frequency, ti, 5000, [400, ti + 0.45]);
    const d = v.drive();
    n2.connect(lp);
    lp.connect(d);
    d.connect(v.env(ti, 0.2, 0.001, 0.45));
    const r = v.osc('sawtooth', 180 * p, ti, ti + 0.78);
    r.frequency.exponentialRampToValueAtTime(120 * p, ti + 0.7);
    const rf = v.filter('bandpass', 700, 3);
    const rg = v.gain(0);
    bloom(rg.gain, ti, 0.22, 0.02, 0.2, 0.5);
    r.connect(rf);
    rf.connect(rg);
    rg.connect(v.out);
  },

  // Boss vaincu : impact, plainte qui descend en ondulant, puis cloches montantes (on le libère)
  bossDefeat(v, t, p) {
    chirp(v, 'sine', 120 * p, 30 * p, t, 1.0, 0.46);
    const n = v.noise(t, t + 0.8, 0.7);
    const lp = v.filter('lowpass', 4500, 0.8);
    sweep(lp.frequency, t, 4500, [250, t + 0.7]);
    const d = v.drive();
    n.connect(lp);
    lp.connect(d);
    d.connect(v.env(t, 0.26, 0.001, 0.7));

    const t0 = t + 0.05;
    const wl = v.filter('lowpass', 2200, 1.5);
    sweep(wl.frequency, t0, 2200, [420, t0 + 1.5]);
    const gw = v.gain(0);
    bloom(gw.gain, t0, 0.2, 0.06, 0.6, 0.9);
    wl.connect(gw);
    gw.connect(v.out);
    const a = v.osc('sawtooth', 520 * p, t0, t0 + 1.65);
    a.frequency.exponentialRampToValueAtTime(80 * p, t0 + 1.55);
    const b = v.osc('square', 260 * p, t0, t0 + 1.65);
    b.frequency.exponentialRampToValueAtTime(40 * p, t0 + 1.55);
    const gb = v.gain(0.35);
    a.connect(wl);
    b.connect(gb);
    gb.connect(wl);
    vibrato(v, t0, t0 + 1.65, 7, 70, 0.3, a, b);

    const run = [1046.5, 1318.5, 1568, 2093, 2637];
    for (let i = 0; i < run.length; i++) {
      const g = bellNote(v, run[i] * p, t + 1.25 + i * 0.08, 0.08, 0.7);
      v.echo(g, 0.35);
    }
    noiseHit(v, t + 1.25, 'highpass', 7000, 0.6, 0.05, 0.6);
  },

  // Barrière d'arène (fermeture : pitch 1 ; ouverture : pitch ≈ 1,25) : zap, choc, bourdon du champ d'énergie
  barrier(v, t, p) {
    const z = v.osc('sawtooth', 1800 * p, t, t + 0.16);
    z.frequency.exponentialRampToValueAtTime(200 * p, t + 0.13);
    const zb = v.filter('bandpass', 1500 * p, 1.2);
    z.connect(zb);
    zb.connect(v.env(t, 0.22, 0.002, 0.13));
    chirp(v, 'sine', 150 * p, 55 * p, t + 0.02, 0.22, 0.5);
    const hl = v.filter('lowpass', 900, 1);
    const gh = v.gain(0);
    swell(gh.gain, t + 0.04, 0.09, 0.03, 0.25, 0.3);
    hl.connect(gh);
    gh.connect(v.out);
    const h1 = v.osc('square', 110 * p, t + 0.04, t + 0.65);
    const h2 = v.osc('square', 111.6 * p, t + 0.04, t + 0.65);
    h1.connect(hl);
    h2.connect(hl);
    for (let i = 0; i < 3; i++) noiseHit(v, t + 0.05 + i * 0.11 + Math.random() * 0.04, 'highpass', 5000, 0.7, 0.12, 0.02);
  },

  // Rebond sur un champignon : « boïng » rond qui monte puis vibre, choc spongieux
  mushroomBounce(v, t, p) {
    const o = v.osc('sine', 170 * p, t, t + 0.42);
    o.frequency.exponentialRampToValueAtTime(520 * p, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(430 * p, t + 0.38);
    const lfo = v.osc('sine', 17, t, t + 0.42);
    const depth = v.gain(0);
    depth.gain.setValueAtTime(70, t + 0.06);
    depth.gain.linearRampToValueAtTime(0, t + 0.4);
    lfo.connect(depth);
    depth.connect(o.detune);
    o.connect(v.env(t, 0.34, 0.006, 0.34));
    const o2 = v.osc('triangle', 340 * p, t, t + 0.3);
    o2.frequency.exponentialRampToValueAtTime(1040 * p, t + 0.1);
    o2.connect(v.env(t, 0.05, 0.006, 0.2));
    noiseHit(v, t, 'bandpass', 900 * p, 2, 0.12, 0.05);
    chirp(v, 'sine', 120 * p, 70 * p, t, 0.07, 0.3);
  },

  // Secousse (la créature frappe, un tronc tombe) : grondement saturé, craquement du bois, chute
  quake(v, t, p) {
    const n = v.noise(t, t + 1.8, 0.5);
    const lp = v.filter('lowpass', 180 * p, 1.2);
    const pre = v.gain(4);
    const d = v.drive();
    const lp2 = v.filter('lowpass', 900, 0.7);
    const g = v.gain(0);
    swell(g.gain, t, 0.13, 0.08, 0.9, 0.75);
    const tg = v.gain(1);
    const trem = v.osc('sine', 7, t, t + 1.8);
    const td = v.gain(0.35);
    trem.connect(td);
    td.connect(tg.gain);
    n.connect(lp);
    lp.connect(pre);
    pre.connect(d);
    d.connect(lp2);
    lp2.connect(g);
    g.connect(tg);
    tg.connect(v.out);
    const sub = v.osc('sine', 46 * p, t, t + 1.6);
    const wob = v.osc('sine', 5, t, t + 1.6);
    const wd = v.gain(5 * p);
    wob.connect(wd);
    wd.connect(sub.frequency);
    const gs = v.gain(0);
    swell(gs.gain, t, 0.2, 0.1, 0.8, 0.6);
    sub.connect(gs);
    gs.connect(v.out);
    // Le bois craque…
    const tc = t + 0.35;
    noiseHit(v, tc, 'bandpass', 1800 * p, 3, 0.34, 0.06);
    chirp(v, 'triangle', 420 * p, 110 * p, tc, 0.09, 0.18);
    noiseHit(v, tc + 0.16, 'bandpass', 2400 * p, 3, 0.22, 0.04);
    const cr = v.osc('sawtooth', 160 * p, tc + 0.05, tc + 0.6);
    cr.frequency.exponentialRampToValueAtTime(90 * p, tc + 0.55);
    const cf = v.filter('bandpass', 700, 6);
    const cg = v.gain(0);
    swell(cg.gain, tc + 0.05, 0.08, 0.05, 0.3, 0.15);
    cr.connect(cf);
    cf.connect(cg);
    cg.connect(v.out);
    // … et le tronc touche le sol
    const tt = t + 1.0;
    chirp(v, 'sine', 110 * p, 36 * p, tt, 0.5, 0.42);
    noiseHit(v, tt, 'lowpass', 700, 0.8, 0.25, 0.25);
    noiseHit(v, tt + 0.02, 'highpass', 3000, 0.7, 0.08, 0.3, 0.8);
  },

  // Pluie de spores : bouffée, souffle qui descend, gouttes au hasard
  sporeDrop(v, t, p) {
    noiseHit(v, t, 'lowpass', 600, 0.7, 0.26, 0.18);
    const n = v.noise(t, t + 1.5);
    const bp = v.filter('bandpass', 3800 * p, 0.9);
    sweep(bp.frequency, t, 3800 * p, [1800 * p, t + 1.4]);
    const g = v.gain(0);
    swell(g.gain, t, 0.09, 0.25, 0.6, 0.6);
    n.connect(bp);
    bp.connect(g);
    g.connect(v.out);
    const lp = v.filter('lowpass', 4200, 0.7);
    lp.connect(v.out);
    v.echo(lp, 0.2);
    for (let i = 0; i < 14; i++) {
      const at = t + 0.12 + Math.random() * 1.25;
      const f = (900 + Math.random() * 1300) * p;
      const o = v.osc('sine', f, at, at + 0.07);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, at + 0.05);
      const go = v.gain(0);
      perc(go.gain, at, 0.1 + Math.random() * 0.08, 0.002, 0.05);
      o.connect(go);
      go.connect(lp);
    }
  },

  // Radio de LUMA qui s'ouvre : déclic, souffle de squelch, double bip « canal ouvert » en bande étroite
  radioOpen(v, t, p) {
    noiseHit(v, t, 'highpass', 3000, 0.7, 0.22, 0.012);
    const n = v.noise(t + 0.01, t + 0.16, 1.3);
    const bp = v.filter('bandpass', 2300, 1.4);
    const gq = v.gain(0);
    swell(gq.gain, t + 0.01, 0.2, 0.008, 0.08, 0.05);
    n.connect(bp);
    bp.connect(gq);
    gq.connect(v.out);
    const radio = v.filter('bandpass', 1700, 0.8);
    radio.connect(v.out);
    const tones = [1320, 1760];
    for (let i = 0; i < tones.length; i++) {
      const at = t + 0.12 + i * 0.08;
      const o = v.osc('sine', tones[i] * p, at, at + 0.08);
      const g = v.gain(0);
      swell(g.gain, at, 0.17, 0.004, 0.05 + i * 0.02, 0.012);
      o.connect(g);
      g.connect(radio);
      const s = v.osc('square', tones[i] * p, at, at + 0.08);
      const gs = v.gain(0);
      swell(gs.gain, at, 0.022, 0.004, 0.05 + i * 0.02, 0.012);
      s.connect(gs);
      gs.connect(radio);
    }
  },

  // Voix de LUMA, une lettre : bip sinusoïdal très court et doux (jusqu'à 8 par seconde, varier `pitch`)
  lumaBip(v, t, p) {
    const f = 880 * p * (0.985 + Math.random() * 0.03);
    const o = v.osc('sine', f * 1.04, t, t + 0.075);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = v.gain(0);
    perc(g.gain, t, 0.15, 0.004, 0.055);
    o.connect(g);
    g.connect(v.out);
    const o2 = v.osc('triangle', f * 2, t, t + 0.05);
    const g2 = v.gain(0);
    perc(g2.gain, t, 0.024, 0.003, 0.03);
    o2.connect(g2);
    g2.connect(v.out);
  },

  // Compétence apprise : arpège montant, accord de puissance qui s'ouvre, souffle et scintillement
  skill(v, t, p) {
    const f = v.filter('lowpass', 4200, 0.7);
    f.connect(v.out);
    v.echo(f, 0.3);
    const steps = [0, 4, 7, 12, 16, 19, 24];
    const base = 392 * p;
    for (let i = 0; i < steps.length; i++) {
      const at = t + i * 0.06;
      const o = v.osc('square', base * semi(steps[i]), at, at + 0.2);
      const g = v.gain(0);
      perc(g.gain, at, 0.085, 0.003, 0.16);
      o.connect(g);
      g.connect(f);
    }
    const at = t + 0.42;
    const pre = v.gain(0.4);
    const cl = v.filter('lowpass', 500, 1);
    sweep(cl.frequency, at, 500, [3200, at + 0.5], [1800, at + 1.4]);
    const gc = v.gain(0);
    bloom(gc.gain, at, 0.12, 0.12, 0.45, 0.9);
    pre.connect(cl);
    cl.connect(gc);
    gc.connect(v.out);
    v.echo(gc, 0.2);
    const chord = [392, 587.33, 783.99, 987.77];
    for (let i = 0; i < chord.length; i++) {
      const o = v.osc('sawtooth', chord[i] * p, at, at + 1.5);
      o.detune.value = i % 2 === 0 ? -6 : 6;
      o.connect(pre);
    }
    chirp(v, 'sine', 220 * p, 110 * p, at, 0.3, 0.3);
    noiseHit(v, at, 'highpass', 7000, 0.6, 0.06, 0.9);
    const glints = [1567.98, 2349.32, 3135.96];
    for (let i = 0; i < glints.length; i++) {
      const g = bellNote(v, glints[i] * p, at + 0.1 + i * 0.09, 0.07, 0.9);
      v.echo(g, 0.35);
    }
  },

  // Libération du gardien (les couleurs reviennent) : inspiration, éclosion d'un accord majeur, cascade de cloches
  liberation(v, t, p) {
    const n = v.noise(t, t + 1.0);
    const bp = v.filter('bandpass', 600 * p, 1.2);
    sweep(bp.frequency, t, 600 * p, [6000 * p, t + 0.9]);
    const gn = v.gain(0);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.16, t + 0.85);
    gn.gain.linearRampToValueAtTime(0, t + 0.95);
    n.connect(bp);
    bp.connect(gn);
    gn.connect(v.out);

    const at = t + 0.9;
    const pre = v.gain(0.3);
    const cl = v.filter('lowpass', 600, 0.8);
    sweep(cl.frequency, at, 600, [4200, at + 0.8], [2000, at + 2.2]);
    const gc = v.gain(0);
    bloom(gc.gain, at, 0.12, 0.25, 0.9, 1.2);
    pre.connect(cl);
    cl.connect(gc);
    gc.connect(v.out);
    v.echo(gc, 0.25);
    const chord = [146.83, 220, 293.66, 369.99, 440, 659.25]; // ré majeur avec neuvième
    for (let i = 0; i < chord.length; i++) {
      const o = v.osc('sawtooth', chord[i] * p, at, at + 2.4);
      o.detune.value = i % 2 === 0 ? -7 : 7;
      o.connect(pre);
    }
    const warm = v.gain(0);
    bloom(warm.gain, at, 0.08, 0.3, 0.8, 1.0);
    warm.connect(v.out);
    const w1 = v.osc('sine', 587.33 * p, at, at + 2.2);
    const w2 = v.osc('sine', 880 * p, at, at + 2.2);
    w1.connect(warm);
    w2.connect(warm);
    chirp(v, 'sine', 110 * p, 55 * p, at, 0.6, 0.35);
    const run = [1174.66, 1318.51, 1479.98, 1760, 1975.53, 2349.32, 2959.96];
    for (let i = 0; i < run.length; i++) {
      const g = bellNote(v, run[i] * p, at + 0.1 + i * 0.11, 0.08, 1.1);
      v.echo(g, 0.4);
    }
    noiseHit(v, at, 'highpass', 8000, 0.6, 0.06, 1.6);
  },

  // Plan récupéré : lecture de données (bips montants), balayage du scanner, deux cloches de confirmation
  blueprint(v, t, p) {
    const lp = v.filter('lowpass', 3200, 0.8);
    lp.connect(v.out);
    const run = [0, 2, 4, 7, 9, 12, 14, 16];
    const base = 659.25 * p;
    for (let i = 0; i < run.length; i++) {
      const at = t + i * 0.045;
      const o = v.osc('square', base * semi(run[i]), at, at + 0.05);
      const g = v.gain(0);
      swell(g.gain, at, 0.055, 0.003, 0.025, 0.01);
      o.connect(g);
      g.connect(lp);
    }
    const s = v.osc('sine', 300 * p, t, t + 0.42);
    s.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.38);
    const gs = v.gain(0);
    swell(gs.gain, t, 0.05, 0.05, 0.25, 0.08);
    s.connect(gs);
    gs.connect(v.out);
    const a = bellNote(v, 1318.51 * p, t + 0.42, 0.13, 0.5);
    v.echo(a, 0.3);
    const b = bellNote(v, 1975.53 * p, t + 0.52, 0.14, 0.7);
    v.echo(b, 0.35);
    noiseHit(v, t + 0.42, 'highpass', 6500, 0.7, 0.05, 0.3);
  },

  // Tess téléportée : faisceau qui monte (trémolo rapide), étincelles, petit « pop » et accord de cloches
  rescue(v, t, p) {
    const tg = v.gain(1);
    tg.connect(v.out);
    const trem = v.osc('sine', 24, t, t + 0.9);
    const td = v.gain(0.45);
    trem.connect(td);
    td.connect(tg.gain);
    const g = v.gain(0);
    swell(g.gain, t, 0.12, 0.15, 0.5, 0.2);
    g.connect(tg);
    const beams: [OscillatorType, number, number][] = [
      ['sine', 520, 1],
      ['sine', 780, 1],
      ['triangle', 260, 0.5],
    ];
    for (const [type, f, lvl] of beams) {
      const o = v.osc(type, f * p, t, t + 0.9);
      o.frequency.exponentialRampToValueAtTime(f * 4 * p, t + 0.8);
      const go = v.gain(lvl);
      o.connect(go);
      go.connect(g);
    }
    for (let i = 0; i < 6; i++) {
      const sp = bellNote(v, (2400 + Math.random() * 2400) * p, t + 0.1 + Math.random() * 0.7, 0.04, 0.25);
      v.echo(sp, 0.3);
    }
    const ta = t + 0.85;
    chirp(v, 'sine', 280 * p, 1100 * p, ta, 0.06, 0.2);
    noiseHit(v, ta, 'bandpass', 2500, 1, 0.18, 0.04);
    const chord = [1046.5, 1318.5, 1568];
    for (let i = 0; i < chord.length; i++) {
      const b = bellNote(v, chord[i] * p, ta + i * 0.03, 0.09, 0.6);
      v.echo(b, 0.3);
    }
  },

  // Cri de la méduse-baleine : voix qui glisse (montée, plainte, descente) à travers deux formants, sous-octave
  whaleCry(v, t, p) {
    const end = t + 2.25;
    const f0 = 196 * p;
    const o = v.osc('sawtooth', f0, t, end);
    const sub = v.osc('sine', f0 * 0.5, t, end);
    for (const [osc, k] of [
      [o, 1],
      [sub, 0.5],
    ] as [OscillatorNode, number][]) {
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.5 * k, t + 0.55);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.42 * k, t + 1.2);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85 * k, t + 2.0);
    }
    vibrato(v, t, end, 4.5, 30, 0.8, o, sub);
    const f1 = v.filter('bandpass', 650, 4);
    sweep(f1.frequency, t, 650, [900, t + 0.55], [500, t + 2.0]);
    const f2 = v.filter('bandpass', 1500, 6);
    sweep(f2.frequency, t, 1500, [1900, t + 0.55], [1200, t + 2.0]);
    const gf2 = v.gain(0.5);
    const g = v.gain(0);
    bloom(g.gain, t, 0.55, 0.3, 1.2, 0.7);
    o.connect(f1);
    o.connect(f2);
    f1.connect(g);
    f2.connect(gf2);
    gf2.connect(g);
    g.connect(v.out);
    v.echo(g, 0.3);
    const gs = v.gain(0);
    bloom(gs.gain, t, 0.16, 0.3, 1.2, 0.6);
    sub.connect(gs);
    gs.connect(v.out);
    const n = v.noise(t, end);
    const nb = v.filter('bandpass', 1100, 1.5);
    const gn = v.gain(0);
    bloom(gn.gain, t, 0.05, 0.4, 1.0, 0.7);
    n.connect(nb);
    nb.connect(gn);
    gn.connect(v.out);
  },

  // Rugissement du léviathan : trois dents de scie graves saturées, filtre qui s'ouvre, grognement, grondement
  leviathanRoar(v, t, p) {
    const end = t + 2.6;
    const pre = v.gain(0.3);
    const d = v.drive();
    const lp = v.filter('lowpass', 250, 2);
    sweep(lp.frequency, t, 250, [1600, t + 0.35], [1100, t + 1.4], [300, t + 2.4]);
    const g = v.gain(0);
    bloom(g.gain, t, 0.34, 0.18, 1.3, 0.9);
    const tg = v.gain(1);
    const growl = v.osc('triangle', 29, t, end);
    const gd = v.gain(0.5);
    growl.connect(gd);
    gd.connect(tg.gain);
    pre.connect(d);
    d.connect(lp);
    lp.connect(g);
    g.connect(tg);
    tg.connect(v.out);
    const dets = [-14, 0, 13];
    for (let i = 0; i < dets.length; i++) {
      const o = v.osc('sawtooth', 55 * p, t, end);
      o.frequency.exponentialRampToValueAtTime(74 * p, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(66 * p, t + 1.4);
      o.frequency.exponentialRampToValueAtTime(41 * p, t + 2.4);
      o.detune.value = dets[i];
      o.connect(pre);
    }
    const hb = v.filter('bandpass', 1400, 2);
    const hg = v.gain(0.3);
    d.connect(hb);
    hb.connect(hg);
    hg.connect(g);
    const n = v.noise(t, end, 0.6);
    const nl = v.filter('lowpass', 500, 0.8);
    const gn = v.gain(0);
    bloom(gn.gain, t, 0.25, 0.25, 1.2, 0.9);
    n.connect(nl);
    nl.connect(gn);
    gn.connect(v.out);
  },

  // Le léviathan avale le portail : l'accord du portail plonge, aspiration, coup sourd et « glou » grave
  portalSwallow(v, t, p) {
    const g = v.gain(0);
    bloom(g.gain, t, 0.14, 0.02, 0.5, 0.7);
    g.connect(v.out);
    v.echo(g, 0.4);
    const shimmer = [1568, 1575, 2349];
    for (let i = 0; i < shimmer.length; i++) {
      const f = shimmer[i] * p;
      const o = v.osc('sine', f, t, t + 1.3);
      o.frequency.setValueAtTime(f, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.22, t + 1.2);
      o.connect(g);
    }
    const n = v.noise(t, t + 1.25);
    const bp = v.filter('bandpass', 6000 * p, 1.5);
    sweep(bp.frequency, t, 6000 * p, [220 * p, t + 1.15]);
    const gn = v.gain(0);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.34, t + 0.9);
    gn.gain.linearRampToValueAtTime(0, t + 1.18);
    n.connect(bp);
    bp.connect(gn);
    gn.connect(v.out);
    const tg = t + 1.15;
    chirp(v, 'sine', 170 * p, 38 * p, tg, 0.55, 0.58);
    const s = v.osc('sawtooth', 95 * p, tg, tg + 0.35);
    s.frequency.exponentialRampToValueAtTime(48 * p, tg + 0.3);
    const sl = v.filter('lowpass', 500, 1);
    s.connect(sl);
    sl.connect(v.env(tg, 0.22, 0.004, 0.3));
    noiseHit(v, tg, 'lowpass', 900, 0.8, 0.25, 0.25);
  },
};
