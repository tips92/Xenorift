import { bars, holdLen, note, notes, seq } from './theory';
import type { StepCtx, TrackDef } from './tracks';

// Musiques du monde 1 (étape 4) : mini-boss, gardien (méduse-baleine) et cinématiques. Même format que TRACKS
// (tracks.ts), qui les reprend. Un morceau peut avoir plusieurs intensités (`levels`) : musicLevel(n) les choisit,
// le séquenceur les applique au prochain début de mesure et play() les lit dans c.level.

export const WORLD1_MUSIC_IDS = ['boss', 'guardian', 'story'] as const;
export type World1MusicId = (typeof WORLD1_MUSIC_IDS)[number];

/** Intensités du gardien : une par phase du combat. */
export const GUARDIAN_LEVEL = { phase1: 0, phase2: 1, phase3: 2 } as const;
/** Intensités des cinématiques : 0 = récit (mystère puis lumière, seul), 1 = lumière tout de suite. */
export const STORY_LEVEL = { tale: 0, light: 1 } as const;

/**
 * Suit les changements d'intensité (à appeler au pas 0) : mem[1] = dernier niveau vu, mem[2] = mesure où il a
 * commencé (début de phrase). Renvoie vrai si le niveau vient de changer (pas au tout premier pas du morceau).
 */
function levelChanged(c: StepCtx, level: number): boolean {
  if (c.step !== 0 || c.mem[1] === level) return false;
  const first = c.mem[1] < 0;
  c.mem[1] = level;
  c.mem[2] = c.bar;
  return !first;
}

const M = (s: string): number => note(s);

const chordProg = <T>(table: Record<string, T>, src: string): T[] =>
  src
    .trim()
    .split(/\s+/)
    .map((k) => table[k]);

// ===================================================================== BOSS (mini-boss)
// Mi mineur, 132 BPM, léger swing : tambours tribaux et caisse claire, basse en doubles croches, marimba,
// accords syncopés, thème carré (doublé à l'octave en fin de boucle) ; pont de tension avec montée.

interface BChord {
  root: number;
  tones: number[];
  stab: number[];
  pad: number[];
}

const B_CHORDS: Record<string, BChord> = {
  Em: { root: M('E2'), tones: notes('E4 G4 B4'), stab: notes('G4 B4 E5'), pad: notes('E3 G3 B3') },
  C: { root: M('C2'), tones: notes('E4 G4 C5'), stab: notes('G4 C5 E5'), pad: notes('E3 G3 C4') },
  D: { root: M('D2'), tones: notes('F#4 A4 D5'), stab: notes('F#4 A4 D5'), pad: notes('F#3 A3 D4') },
  B: { root: M('B1'), tones: notes('D#4 F#4 B4'), stab: notes('F#4 B4 D#5'), pad: notes('D#3 F#3 B3') },
  Am: { root: M('A1'), tones: notes('E4 A4 C5'), stab: notes('A4 C5 E5'), pad: notes('E3 A3 C4') },
};

const B_PROG = chordProg(B_CHORDS, 'Em Em C D Em Em C B  Em C D Em Em C D B  Am Am Em Em C C B B  Em C D Em Em C D B');

const B_MEL = bars(
  'E5 - - E5 - - G5 - B5 - - - A5 - G5 -',
  'E5 - - - - - - - . . G5 - A5 - B5 -',
  'C6 - - B5 - - A5 - F#5 - - - D5 - - -',
  'E5 - - - - - - - - - . . B4 - D5 -',
  'G5 - - G5 - - B5 - E6 - - - D6 - B5 -',
  'C6 - - - B5 - G5 - E5 - - - G5 - - -',
  'A5 - - - F#5 - - - D6 - - - C6 - A5 -',
  'B5 - - - A5 - - - F#5 - - - D#5 - - -',
);

const B_BASS_A = seq('0 - 0 12 0 - 7 - 0 - 0 12 . 0 7 12', 16);
const B_BASS_T = seq('0 . 0 . 0 . 12 . 0 . 0 . 0 . 12 .', 16);
const B_PLK_A = seq('0 . 2 . 1 3 . 2 0 . 2 . 3 1 2 .', 16);
const B_PLK_B = seq('0 . . 2 . . 1 . 0 . . 2 . . 3 .', 16);
const B_STAB = seq('. . 1 . . . 1 . . . 1 . . 1 . .', 16);
const B_FILL = [330, 262, 196, 147];

const boss: TrackDef = {
  bpm: 132,
  bars: 32,
  swing: 0.08,
  level: 0.85,
  delayBeats: 0.75,
  delayFb: 0.3,
  mix: {
    drums: { gain: 0.9, verb: 0.1 },
    perc: { gain: 0.75, verb: 0.12, pan: 0.15 },
    bass: { gain: 0.85 },
    pluck: { gain: 0.7, delay: 0.15, verb: 0.12, pan: -0.25 },
    stab: { gain: 0.5, delay: 0.2, lowpass: 3200, pan: 0.2 },
    lead: { gain: 0.55, delay: 0.25, verb: 0.15, lowpass: 3000, pan: 0.05 },
    arp: { gain: 0.35, delay: 0.3, lowpass: 3400, pan: -0.3 },
    pad: { gain: 0.5, verb: 0.35 },
    fx: { gain: 0.6, verb: 0.3 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng, loop } = c;
    const sec = bar >> 3; // 0 : riff, 1 : thème, 2 : tension, 3 : thème doublé
    const ch = B_PROG[bar];
    const tension = sec === 2;
    const sparse = tension && bar < 20;
    const fill = (bar & 7) === 7 && step >= 12;

    // --- Batterie
    if (fill) {
      b.tom(t, B_FILL[step - 12], 0.75, 0.26, true);
      if (step === 12) b.kick(t, 0.85, 150, 44, 0.3);
    } else if (sparse) {
      if (step === 0 || step === 10) b.kick(t, 1, 150, 44, 0.34);
      if (step === 8) b.snare(t, 0.85, 0.22, 200);
      if ((step & 3) === 2) b.hat(t, 0.18);
      if (step === 3 || step === 6 || step === 13) b.tom(t, 110, 0.6, 0.3, true);
      if (step === 11) b.tom(t, 220, 0.45, 0.2);
    } else if (tension) {
      // Montée (mesures 20 à 23) : noire au pied, caisse claire de plus en plus serrée.
      if ((step & 3) === 0) b.kick(t, 1, 150, 44, 0.3);
      if (bar === 22 && (step & 1) === 0) b.snare(t, 0.3 + step * 0.03, 0.1, 210);
      else if (bar === 23) b.snare(t, 0.35 + step * 0.04, 0.1, 210);
      else if (step === 4 || step === 12) b.snare(t, 0.85, 0.16, 210);
      b.hat(t, (step & 1) === 0 ? 0.26 : 0.12);
    } else {
      if (step === 0 || step === 6 || step === 8 || (step === 14 && (bar & 1) === 1)) {
        b.kick(t, step === 0 || step === 8 ? 1 : 0.72, 150, 44, 0.3);
      }
      if (step === 4 || step === 12) b.snare(t, 0.85, 0.16, 210);
      if ((step & 1) === 0) b.hat(t, (step & 3) === 2 ? 0.28 : 0.13, step === 14 && (bar & 3) === 3);
      if (step === 3 || step === 11) b.tom(t, 110, 0.45, 0.26, true);
      if (step === 7 && rng.chance(0.6)) b.tom(t, 165, 0.35, 0.18);
    }
    if (sec !== 2 && (sec !== 0 || (step & 1) === 0)) {
      b.shaker(t, ((step & 3) === 2 ? 0.5 : 0.24) + rng.next() * 0.08);
    }
    if (bar === 22 && step === 0) b.riser(t, sd * 32, 0.9);
    if (step === 0 && (bar === 8 || bar === 16 || bar === 24 || (bar === 0 && loop > 0))) b.crash(t, 0.75);

    // --- Basse
    if (tension) {
      const iv = B_BASS_T[step];
      if (iv >= 0) {
        b.bass(t, ch.root + iv, sd * 1.5, (step & 3) === 0 ? 0.95 : 0.75, { cutoff: 300 + (bar - 16) * 40, env: 1200, q: 6, decay: 0.07 });
      }
    } else {
      const iv = B_BASS_A[step];
      if (iv >= 0) {
        b.bass(t, ch.root + iv, holdLen(B_BASS_A, step) * sd * 0.8, (step & 3) === 0 ? 0.95 : 0.78, { cutoff: 360, env: 1300, q: 6, decay: 0.05 });
      }
    }

    // --- Marimba et accords syncopés
    if (!tension) {
      const pp = sec === 0 ? B_PLK_A : B_PLK_B;
      const pi = pp[step];
      if (pi >= 0) b.pluck(t, pi >= 3 ? ch.tones[0] + 12 : ch.tones[pi], (step & 3) === 0 ? 0.7 : 0.52 + rng.next() * 0.1, 0.4);
    }
    if ((sec === 0 || sec === 3) && B_STAB[step] >= 0) b.stab(t, ch.stab, sec === 0 ? 0.7 : 0.5, 0.12, 'sawtooth');

    // --- Tension : nappe qui s'ouvre, arpège qui monte
    if (tension && step === 0) {
      b.pad(t, ch.pad, sd * 16, 0.8, { wave: 'sawtooth', cutoff: 900 + (bar - 16) * 180, attack: 0.15, release: 0.4, detune: 12 });
    }
    if (tension && bar >= 18) b.arp(t, ch.stab[step % 3] + 12, 0.4 + (bar - 18) * 0.05, 0.11, 'square');

    // --- Thème
    if (sec === 1 || sec === 3) {
      const k = (bar & 7) * 16 + step;
      const m = B_MEL[k];
      if (m >= 0) {
        const len = holdLen(B_MEL, k);
        b.lead(t, m, len * sd * 0.88, 0.95, { wave: 'square', detune: sec === 3 ? 8 : 0, vibrato: len >= 4 ? 16 : 0 });
        if (sec === 3) b.lead(t, m + 12, len * sd * 0.88, 0.38, { wave: 'triangle', vibrato: len >= 4 ? 12 : 0 });
      }
    }
  },
};

// ===================================================================== GUARDIAN (méduse-baleine)
// Do mineur, 112 BPM, même tempo aux 3 intensités (une par phase du combat) :
//  0 : demi-temps pesant, basse en croches, nappe sombre, chant de baleine (glissandos), spores en clochettes ;
//  1 : batterie complète, basse en doubles croches, arpège qui bourdonne (les guêpes), chant au synthé ;
//  2 : nouvelle section (la plongée) : grosse caisse à chaque temps, toms, accords syncopés, thème doublé.
// Chaque changement d'intensité tombe sur un début de mesure, marqué par une cymbale et un grondement.

interface GChord {
  root: number;
  pad: number[];
  arp: number[];
  stab: number[];
}

const gChord = (root: string, pad: string, arp: string): GChord => {
  const a = notes(arp);
  return { root: M(root), pad: notes(pad), arp: a, stab: a.slice(0, 3) };
};

const G_CHORDS: Record<string, GChord> = {
  Cm: gChord('C2', 'G3 C4 Eb4', 'C4 Eb4 G4 C5'),
  Ab: gChord('Ab1', 'Ab3 C4 Eb4', 'Ab3 C4 Eb4 Ab4'),
  Eb: gChord('Eb2', 'G3 Bb3 Eb4', 'Eb4 G4 Bb4 Eb5'),
  Bb: gChord('Bb1', 'F3 Bb3 D4', 'Bb3 D4 F4 Bb4'),
  Fm: gChord('F2', 'Ab3 C4 F4', 'F4 Ab4 C5 F5'),
  G: gChord('G1', 'G3 B3 D4', 'G3 B3 D4 G4'),
};

const G_PROG = chordProg(G_CHORDS, 'Cm Ab Eb Bb Cm Ab Fm G  Ab Bb Cm Cm Ab Bb G G');
const G_PROG_DIVE = chordProg(G_CHORDS, 'Cm Cm Ab Ab Fm Fm G G');

const G_MEL = bars(
  'G4 - - - - - - - Eb5 - - - - - D5 -',
  'C5 - - - - - - - - - - - . . . .',
  'Bb4 - - - - - - - G5 - - - - - F5 -',
  'F5 - - - - - - - D5 - - - . . . .',
  'G5 - - - - - - - Ab5 - - - G5 - Eb5 -',
  'Eb5 - - - - - - - C5 - - - - - Eb5 -',
  'F5 - - - - - - - Ab5 - - - G5 - F5 -',
  'D5 - - - - - - - B4 - - - . . . .',
  'C6 - - - - - - - Bb5 - - - Ab5 - - -',
  'Bb5 - - - - - - - F5 - - - D5 - - -',
  'Eb5 - - - - - - - - - - - G5 - - -',
  'C5 - - - - - - - - - - - . . . .',
  'Eb5 - - - - - - - Ab5 - - - C6 - - -',
  'D6 - - - - - - - C6 - - - Bb5 - - -',
  'B5 - - - - - - - G5 - - - D5 - - -',
  'B4 - - - - - - - - - - - . . . .',
);

const G_DIVE = bars(
  'C5 - - Eb5 - - G5 - C6 - - - Bb5 - G5 -',
  'Ab5 - - - G5 - - - Eb5 - - - D5 - Eb5 -',
  'C5 - - Eb5 - - Ab5 - C6 - - - Eb6 - C6 -',
  'Bb5 - - - Ab5 - - - G5 - - - Ab5 - - -',
  'F5 - - Ab5 - - C6 - F6 - - - Eb6 - C6 -',
  'Ab5 - - - G5 - - - F5 - - - Eb5 - - -',
  'D5 - - G5 - - B5 - D6 - - - C6 - B5 -',
  'G5 - - - - - - - B5 - - - D6 - - -',
);

const G_BASS_0 = seq('0 - 0 - 0 - 0 - 0 - 0 - 12 - 7 -', 16);
const G_BASS_1 = seq('0 0 12 0 0 0 7 0 0 0 12 0 0 7 12 7', 16);
const G_BASS_2 = seq('0 12 0 0 12 0 7 0 0 12 0 0 7 0 12 0', 16);
const G_ARP_1 = seq('0 1 2 3 2 1 0 1 2 3 2 1 0 1 2 1', 16);
const G_ARP_2 = seq('0 2 1 3 0 2 1 3 2 0 3 1 3 2 1 0', 16);
const G_STAB = seq('. . 1 . . 1 . . . . 1 . . 1 . .', 16);
const G_FILL = [196, 147, 110, 82];

const guardian: TrackDef = {
  bpm: 112,
  bars: 16,
  swing: 0,
  level: 0.85,
  levels: 3,
  delayBeats: 0.75,
  delayFb: 0.4,
  mix: {
    drums: { gain: 0.9, verb: 0.22 },
    perc: { gain: 0.7, verb: 0.2, pan: -0.15 },
    bass: { gain: 0.85 },
    pad: { gain: 0.7, verb: 0.45 },
    arp: { gain: 0.38, delay: 0.3, lowpass: 2600, pan: 0.3 },
    lead: { gain: 0.58, delay: 0.35, verb: 0.35, lowpass: 2800, pan: -0.05 },
    bell: { gain: 0.45, delay: 0.5, verb: 0.5, pan: 0.25 },
    stab: { gain: 0.5, delay: 0.2, lowpass: 3000, pan: -0.2 },
    fx: { gain: 0.6, verb: 0.4 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng } = c;
    const level = c.level;
    const changed = levelChanged(c, level);
    const dive = level >= 2;
    // La plongée repart au début de sa phrase quand elle commence.
    const rel = (bar - c.mem[2]) & 7;
    const ch = dive ? G_PROG_DIVE[rel] : G_PROG[bar];

    if (changed) {
      b.crash(t, 0.85, 2);
      b.boom(t, 0.7);
    }

    // --- Batterie
    const phraseEnd = dive ? (rel & 3) === 3 : (bar & 7) === 7;
    const fill = phraseEnd && step >= 12 && level > 0;
    if (fill) {
      b.tom(t, G_FILL[step - 12], 0.75, 0.3, true);
      if (step === 12) b.kick(t, 0.85, 130, 40, 0.34);
    } else if (level === 0) {
      if (step === 0) b.kick(t, 1, 110, 38, 0.55);
      if (step === 0 && (bar & 1) === 0) b.boom(t, 0.45);
      if (step === 14 && (bar & 1) === 1) b.kick(t, 0.5, 110, 38, 0.4);
      if (step === 8) b.snare(t, 0.8, 0.32, 160);
      if ((step & 1) === 0 && step !== 0) b.hat(t, 0.1, step === 12 && (bar & 3) === 3);
      if (step === 11 && rng.chance(0.4)) b.tom(t, 98, 0.4, 0.32, true);
    } else if (level === 1) {
      if (step === 0 || step === 8) b.kick(t, 1, 130, 40, 0.34);
      if (step === 10 || (step === 14 && (bar & 1) === 1)) b.kick(t, 0.7, 130, 40, 0.3);
      if (step === 4 || step === 12) b.snare(t, 0.85, 0.2, 180);
      if ((step & 1) === 0) b.hat(t, (step & 3) === 2 ? 0.26 : 0.16, step === 6 && (bar & 1) === 1);
      else b.shaker(t, 0.2 + rng.next() * 0.06);
    } else {
      if ((step & 3) === 0) b.kick(t, 1, 140, 40, 0.3);
      if (step === 14) b.kick(t, 0.7, 140, 40, 0.26);
      if (step === 4 || step === 12) b.snare(t, 0.95, 0.18, 190);
      if (step === 15) b.snare(t, 0.3, 0.08, 190);
      b.hat(t, (step & 1) === 0 ? 0.3 : 0.16, step === 6);
      if (step === 3 || step === 7 || step === 11) b.tom(t, step === 7 ? 147 : 98, 0.5, 0.26, true);
    }
    if (step === 0 && level > 0 && !changed && ((dive && rel === 4) || (!dive && bar === 8))) b.crash(t, 0.6);
    if (dive && rel === 6 && step === 0) b.riser(t, sd * 32, 0.85);

    // --- Basse
    const bp = level === 0 ? G_BASS_0 : level === 1 ? G_BASS_1 : G_BASS_2;
    const iv = bp[step];
    if (iv >= 0) {
      if (level === 0) {
        b.bass(t, ch.root + iv, holdLen(bp, step) * sd * 0.9, (step & 3) === 0 ? 0.9 : 0.75, { cutoff: 240, env: 600, q: 4, decay: 0.15 });
      } else {
        b.bass(t, ch.root + iv, sd * 0.8, (step & 3) === 0 ? 0.95 : 0.74, {
          cutoff: level === 1 ? 320 : 380,
          env: level === 1 ? 1000 : 1400,
          q: level === 1 ? 5 : 6,
          decay: 0.06,
        });
      }
    }

    // --- Nappe
    if (step === 0) {
      b.pad(t, ch.pad, sd * 16, level === 0 ? 0.85 : 0.75, {
        wave: 'sawtooth',
        cutoff: level === 0 ? 700 : level === 1 ? 1100 : 1500,
        attack: level === 0 ? 0.8 : level === 1 ? 0.3 : 0.15,
        release: 0.8,
        detune: 10,
      });
    }

    // --- Arpège (les guêpes), accords syncopés de la plongée
    if (level === 1) b.arp(t, ch.arp[G_ARP_1[step]] + 12, (step & 3) === 0 ? 0.5 : 0.36, 0.12, 'square');
    else if (dive) b.arp(t, ch.arp[G_ARP_2[step]] + 12, (step & 3) === 0 ? 0.48 : 0.36, 0.1, 'sawtooth');
    if (dive && G_STAB[step] >= 0) b.stab(t, ch.stab, 0.6, 0.13, 'sawtooth');

    // --- Spores : clochettes lointaines
    if ((step === 6 || step === 14) && level < 2 && rng.chance(level === 0 ? 0.35 : 0.18)) {
      b.bell(t, ch.arp[rng.int(4)] + 24, 0.22, 2.2, 3.5, 0.8);
    }

    // --- Chant de la baleine (0 et 1), thème de la plongée (2)
    if (!dive) {
      const k = bar * 16 + step;
      const m = G_MEL[k];
      if (m >= 0) {
        const len = holdLen(G_MEL, k);
        const prev = c.mem[0];
        const glideFrom = prev >= 0 && Math.abs(prev - m) <= 9 ? prev : -1;
        if (level === 0) {
          b.lead(t, m, len * sd * 0.95, 0.85, { wave: 'triangle', vibrato: 22, glideFrom, glide: 0.12, attack: 0.08, release: 0.4 });
        } else {
          b.lead(t, m, len * sd * 0.92, 0.85, { wave: 'sawtooth', detune: 9, vibrato: 16, glideFrom, glide: 0.06, attack: 0.03, release: 0.25 });
          if (len >= 8) b.bell(t, m + 12, 0.3, 1.8, 2, 0.7);
        }
        c.mem[0] = m;
      }
    } else {
      const k = rel * 16 + step;
      const m = G_DIVE[k];
      if (m >= 0) {
        const len = holdLen(G_DIVE, k);
        b.lead(t, m, len * sd * 0.88, 0.95, { wave: 'square', detune: 8, vibrato: len >= 4 ? 16 : 0 });
        b.lead(t, m + 12, len * sd * 0.88, 0.36, { wave: 'triangle', vibrato: len >= 4 ? 12 : 0 });
        c.mem[0] = m;
      }
    }
  },
};

// ===================================================================== STORY (cinématiques)
// 80 BPM, mesure de 3 s. Intensité 0 (récit) : 8 mesures de mystère (la mineur, couleurs lydiennes, le signal
// en clochettes, battement de cœur, montée) puis 16 de lumière (do majeur : marimba, cloches, mélodie douce),
// 8 de retour au calme, en boucle (≈ 24 s de mystère : le prologue). Intensité 1 : la lumière, reprise au début
// de sa phrase dès la mesure suivante (la libération).

interface SChord {
  root: number;
  pad: number[];
  arp: number[];
}

const sChord = (root: string, pad: string, arp: string): SChord => ({ root: M(root), pad: notes(pad), arp: notes(arp) });

const S_CHORDS: Record<string, SChord> = {
  // Mystère
  mAm: sChord('A2', 'E3 A3 B3 C4', 'A4 B4 C5 E5'),
  mF: sChord('F2', 'F3 A3 B3 E4', 'F4 A4 B4 E5'),
  mBb: sChord('Bb2', 'F3 Bb3 D4 E4', 'Bb4 D5 E5 F5'),
  mDm: sChord('D2', 'F3 A3 D4 E4', 'D5 E5 F5 A5'),
  mEs: sChord('E2', 'E3 A3 B3 D4', 'E5 A5 B5 D6'),
  mE: sChord('E2', 'E3 G#3 B3 D4', 'E5 G#5 B5 D6'),
  // Lumière
  C: sChord('C3', 'G3 C4 D4 E4', 'C5 E5 G5 D6'),
  G: sChord('G2', 'B3 D4 G4 A4', 'B4 D5 G5 A5'),
  Am: sChord('A2', 'A3 C4 E4 G4', 'A4 C5 E5 G5'),
  F: sChord('F2', 'F3 A3 C4 G4', 'A4 C5 F5 G5'),
  Dm: sChord('D3', 'F3 A3 D4 E4', 'D5 F5 A5 E5'),
  Es: sChord('E2', 'E3 A3 B3 D4', 'E5 A5 B5 D6'),
  E: sChord('E2', 'E3 G#3 B3 D4', 'E5 G#5 B5 D6'),
};

const S_PROG_TALE = chordProg(
  S_CHORDS,
  'mAm mF mAm mBb mDm mBb mEs mE  C G Am F C G F F  Am F C G F G C C  F F C C Dm Dm Es E',
);
const S_PROG_LIGHT = S_PROG_TALE.slice(8, 24);

const S_MYS = bars(
  '. . . . . . . . . . . . . . . .',
  '. . . . . . . . . . . . . . . .',
  'E5 - - - - - - - - - - - F5 - - -',
  'E5 - - - - - - - D5 - - - - - - -',
  'A4 - - - - - - - - - - - C5 - - -',
  'D5 - - - - - - - E5 - - - F5 - - -',
  'E5 - - - - - - - - - - - D5 - - -',
  'G#4 - - - - - - - - - - - B4 - - -',
);

const S_MEL = bars(
  'E5 - - - G5 - - - C6 - - - - - - -',
  'B5 - - - - - D6 - - - B5 - G5 - - -',
  'A5 - - - - - - - E5 - - - A5 - B5 -',
  'C6 - - - - - - - A5 - - - - - - -',
  'G5 - - - - - E5 - G5 - - - C6 - D6 -',
  'E6 - - - - - - - D6 - - - B5 - - -',
  'C6 - - - A5 - - - F5 - - - A5 - - -',
  'G5 - - - - - - - - - - - . . . .',
  'E5 - - - - - - - A5 - - - B5 - C6 -',
  'D6 - - - - - C6 - A5 - - - - - - -',
  'G5 - - - - - - - E5 - G5 - C6 - - -',
  'B5 - - - - - - - D6 - - - - - - -',
  'A5 - - - C6 - - - F6 - - - E6 - D6 -',
  'D6 - - - - - - - B5 - - - G5 - - -',
  'C6 - - - - - - - - - - - G5 - - -',
  'C6 - - - - - - - - - - - . . . .',
);

/** Le signal venu du bord de la galaxie : deux clochettes. */
const S_SIGNAL = notes('E6 B5');
const S_ARP_M = seq('0 . . . 2 . . . 1 . . . 3 . . .', 16);
const S_ARP_L = seq('0 . 1 . 2 . 3 . 2 . 1 . 3 . 2 .', 16);

const story: TrackDef = {
  bpm: 80,
  bars: 32,
  swing: 0,
  level: 1,
  levels: 2,
  delayBeats: 0.75,
  delayFb: 0.45,
  mix: {
    pad: { gain: 0.85, verb: 0.55 },
    bass: { gain: 0.8 },
    bell: { gain: 0.55, delay: 0.45, verb: 0.55, pan: 0.2 },
    arp: { gain: 0.5, delay: 0.4, verb: 0.35, lowpass: 2800, pan: -0.2 },
    pluck: { gain: 0.65, delay: 0.25, verb: 0.25, pan: -0.15 },
    lead: { gain: 0.55, delay: 0.3, verb: 0.45, lowpass: 2600, pan: 0.1 },
    drums: { gain: 0.7, verb: 0.4 },
    perc: { gain: 0.55, verb: 0.3 },
    fx: { gain: 0.5, verb: 0.5 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng } = c;
    const level = c.level;
    const changed = levelChanged(c, level);
    // Section : 0 mystère, 1 et 2 lumière (phrase de 16 mesures `li`), 3 retour au calme.
    let sec: number;
    let li = 0;
    if (level >= 1) {
      li = (bar - c.mem[2]) & 15;
      sec = li < 8 ? 1 : 2;
    } else {
      sec = bar >> 3;
      li = bar - 8;
    }
    const ch = level >= 1 ? S_PROG_LIGHT[li] : S_PROG_TALE[bar];
    const light = sec === 1 || sec === 2;

    if (changed && light) {
      b.crash(t, 0.5, 2.4);
      b.bell(t, ch.arp[2] + 12, 0.35, 3, 2, 0.6);
    }

    // --- Nappe et bourdon
    if (step === 0) {
      if (sec === 0) {
        b.pad(t, ch.pad, sd * 16, 0.8, { wave: 'sawtooth', cutoff: 650 + (bar & 7) * 40, attack: 2, release: 2.4, detune: 9 });
        b.bass(t, ch.root, sd * 15.5, 0.6, { wave: 'sine', cutoff: 600, env: 0, attack: 0.8, release: 1.4, sustain: 0.9 });
      } else {
        b.pad(t, ch.pad, sd * 16, sec === 3 ? 0.7 : 0.85, { wave: 'triangle', cutoff: sec === 3 ? 1600 : 2400, attack: 0.7, release: 1.6, detune: 7 });
        b.bass(t, ch.root, sd * 15.5, 0.55, { wave: 'triangle', cutoff: 500, env: 200, attack: 0.3, release: 1, sustain: 0.85 });
      }
    }

    if (sec === 0) {
      // --- Le signal : deux clochettes toutes les deux mesures
      if ((bar & 1) === 0 && (step === 0 || step === 3)) b.bell(t, S_SIGNAL[step === 0 ? 0 : 1], 0.4, 2.6, 3.5, 0.55);
      if (bar >= 2) {
        const ai = S_ARP_M[step];
        if (ai >= 0) b.arp(t, ch.arp[ai], 0.32 + rng.next() * 0.08, 0.9, 'triangle');
      }
      // --- Battement de cœur, grondements, montée vers la lumière
      if (step === 0 && (bar & 1) === 0 && bar >= 2) b.boom(t, 0.45);
      if (bar >= 4 && (step === 0 || step === 3)) b.kick(t, step === 0 ? 0.5 : 0.32, 90, 40, 0.4);
      if (bar === 6 && step === 0 && level === 0) b.riser(t, sd * 32, 0.7);
      // --- Thérémine lointain
      const m = S_MYS[bar * 16 + step];
      if (m >= 0) {
        b.lead(t, m, holdLen(S_MYS, bar * 16 + step) * sd * 0.95, 0.6, {
          wave: 'triangle',
          vibrato: 24,
          glideFrom: c.mem[0],
          glide: 0.14,
          attack: 0.25,
          release: 0.6,
        });
        c.mem[0] = m;
      }
      return;
    }

    if (light) {
      if (step === 0 && li === 0 && !changed) {
        b.crash(t, 0.5, 2.4);
        b.boom(t, 0.4);
      }
      // --- Pulsation douce
      if (step === 0) b.kick(t, 0.55, 110, 45, 0.4);
      if (step === 10) b.kick(t, 0.35, 110, 45, 0.3);
      if (step === 4 || step === 12) b.rim(t, 0.22);
      if (sec === 2 && (step & 1) === 0) b.shaker(t, (step & 3) === 2 ? 0.28 : 0.16);
      // --- Arpège de verre (A), marimba de la jungle (B)
      const ai = S_ARP_L[step];
      if (ai >= 0) {
        if (sec === 1) b.arp(t, ch.arp[ai], 0.36 + rng.next() * 0.08, 0.6, 'triangle');
        else b.pluck(t, ch.arp[ai], (step & 3) === 0 ? 0.55 : 0.42, 0.5);
      }
      // --- Mélodie (doublée de cloches sur les notes longues en B)
      const k = li * 16 + step;
      const m = S_MEL[k];
      if (m >= 0) {
        const len = holdLen(S_MEL, k);
        b.lead(t, m, len * sd * 0.92, sec === 1 ? 0.7 : 0.8, { wave: 'triangle', vibrato: len >= 4 ? 14 : 0, attack: 0.05, release: 0.35 });
        if (sec === 2 && len >= 6) b.bell(t, m + 12, 0.28, 2.2, 2, 0.6);
        c.mem[0] = m;
      }
      if (step === 8 && (li & 3) === 3 && rng.chance(0.7)) b.bell(t, ch.arp[3] + 12, 0.2, 2.4, 3.5, 0.7);
      return;
    }

    // --- Retour au calme : nappe, marimba clairsemé, le signal revient
    if (step === 0 && (bar & 1) === 0) b.kick(t, 0.4, 100, 42, 0.45);
    if ((step & 3) === 0 && rng.chance(0.75)) b.pluck(t, ch.arp[(step >> 2) & 3], 0.38, 0.55);
    if (bar >= 28 && (bar & 1) === 0 && (step === 0 || step === 3)) b.bell(t, S_SIGNAL[step === 0 ? 0 : 1], 0.3, 2.6, 3.5, 0.55);
  },
};

export const WORLD1_TRACKS: Record<World1MusicId, TrackDef> = { boss, guardian, story };
