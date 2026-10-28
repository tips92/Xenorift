import type { MusicId } from '../core/types';
import type { Band, MixSpec } from './band';
import { bars, holdLen, note, notes, seq, type Rng } from './theory';
import { WORLD1_TRACKS } from './world1Tracks';

// Morceaux procéduraux : chaque pas (double croche) appelle play(), qui décide quoi jouer
// selon la mesure (sections), le pas, le numéro de boucle et un aléa rejouable.

export interface StepCtx {
  b: Band;
  /** Mesure dans la boucle (0 .. bars-1). */
  bar: number;
  /** Pas dans la mesure (0 .. 15). */
  step: number;
  /** Instant du pas sur l'horloge audio (swing inclus). */
  t: number;
  /** Nombre de boucles complètes déjà jouées. */
  loop: number;
  /** Durée d'un pas (s). */
  sd: number;
  rng: Rng;
  /** Mémoire propre à l'instance (ex. dernière note jouée, pour les glissandos). */
  mem: number[];
  /** Intensité (musicLevel), 0 = de base : changée seulement au début d'une mesure (pas 0). */
  level: number;
}

export interface TrackDef {
  bpm: number;
  /** Longueur de la boucle en mesures de 4 temps. */
  bars: number;
  /** Décalage des doubles croches impaires (fraction de pas). */
  swing: number;
  level: number;
  /** Écho : durée en temps et réinjection. */
  delayBeats: number;
  delayFb: number;
  mix: MixSpec;
  /** Nombre d'intensités (absent : 1, insensible à musicLevel). */
  levels?: number;
  play(c: StepCtx): void;
}

const M = (s: string): number => note(s);

// ===================================================================== MENU
// Ré mineur, 76 BPM : nappes spacieuses, arpège lent, cloches de verre en seconde moitié.

interface MenuChord {
  bass: number;
  pad: number[];
  arp: number[];
  mel: Int16Array;
}

const MENU_CHORDS: MenuChord[] = [
  { bass: M('D2'), pad: notes('A3 C4 E4 F4'), arp: notes('D4 F4 A4 C5 E5'), mel: seq('A5 . . . . . . . . . . . . . . . E5 . . . . . . . F5 . . . . . . .', 32) },
  { bass: M('Bb1'), pad: notes('A3 D4 F4 Bb4'), arp: notes('D4 F4 A4 Bb4 D5'), mel: seq('D6 . . . . . . . C6 . . . . . . . A5 . . . . . . . . . . . . . . .', 32) },
  { bass: M('G1'), pad: notes('Bb3 D4 F4 A4'), arp: notes('G4 Bb4 D5 F5 A5'), mel: seq('Bb5 . . . . . . . A5 . . . . . . . F5 . . . . . . . G5 . . . . . . .', 32) },
  { bass: M('A1'), pad: notes('G3 D4 E4 A4'), arp: notes('E4 G4 A4 D5 E5'), mel: seq('E5 . . . . . . . . . . . . . . . D5 . . . . . . . E5 . . . . . . .', 32) },
  { bass: M('D2'), pad: notes('A3 C4 E4 F4'), arp: notes('D4 F4 A4 C5 E5'), mel: seq('F5 . . . . . . . A5 . . . . . . . C6 . . . . . . . E6 . . . . . . .', 32) },
  { bass: M('Eb2'), pad: notes('G3 Bb3 D4 A4'), arp: notes('Eb4 G4 Bb4 D5 A5'), mel: seq('D6 . . . . . . . . . . . A5 . . . . . . . Bb5 . . . . . . . G5 . . .', 32) },
  { bass: M('F2'), pad: notes('A3 C4 E4 G4'), arp: notes('F4 A4 C5 E5 G5'), mel: seq('A5 . . . . . . . G5 . . . . . . . E5 . . . . . . . C5 . . . . . . .', 32) },
  { bass: M('A1'), pad: notes('G3 C#4 E4 Bb4'), arp: notes('E4 G4 Bb4 C#5 E5'), mel: seq('C#6 . . . . . . . . . . . Bb5 . . . . . . . . . . . A5 . . . . . . .', 32) },
];

const MENU_ARP_A = seq('0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 . 0 . 2 . 1 . 3 . 2 . 4 . . . . .', 32);
const MENU_ARP_B = seq('4 . . 2 . . 3 . 1 . . 2 . . 0 . 3 . . 1 . . 4 . 2 . . 3 . . 1 .', 32);

const menu: TrackDef = {
  bpm: 76,
  bars: 32,
  swing: 0,
  level: 1,
  delayBeats: 0.75,
  delayFb: 0.45,
  mix: {
    pad: { gain: 0.85, verb: 0.55 },
    bass: { gain: 0.85 },
    arp: { gain: 0.6, delay: 0.5, verb: 0.35, pan: -0.25, lowpass: 2600 },
    bell: { gain: 0.5, delay: 0.4, verb: 0.6, pan: 0.25 },
    drums: { gain: 0.7, verb: 0.5 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng, loop } = c;
    const ch = MENU_CHORDS[(bar >> 1) & 7];
    const pos = (bar & 1) * 16 + step;
    const second = bar >= 16;
    if (pos === 0) {
      b.pad(t, ch.pad, sd * 32, second ? 0.95 : 0.8, {
        wave: 'sawtooth',
        cutoff: second ? 1300 : 950,
        attack: 1.8,
        release: 2.6,
        detune: 9,
      });
      b.bass(t, ch.bass + 12, sd * 30, 0.62, { wave: 'sine', cutoff: 500, env: 0, attack: 0.5, release: 1.4, sustain: 0.9 });
      if (second) b.boom(t, 0.5);
    }
    const ai = (second ? MENU_ARP_B : MENU_ARP_A)[pos];
    if (ai >= 0) {
      const up = second && (loop & 1) === 1 ? 12 : 0;
      b.arp(t, ch.arp[ai] + up, 0.5 + rng.next() * 0.2, 0.9, 'triangle');
    }
    if (second) {
      const m = ch.mel[pos];
      if (m >= 0) b.bell(t, m, 0.55, 3, 2, 0.6);
    } else if (step === 8 && (bar & 3) === 3 && rng.chance(0.6)) {
      // Scintillement lointain
      b.bell(t, ch.arp[4] + 12, 0.22, 2.2, 3.5, 0.8);
    }
  },
};

// ===================================================================== JUNGLE
// Sol mixolydien, 118 BPM : percussions tribales, marimba, mélodie d'aventure.

interface JChord {
  root: number;
  tones: number[];
  pad: number[];
}

const J_CHORDS: Record<string, JChord> = {
  G: { root: M('G2'), tones: notes('G4 B4 D5'), pad: notes('G3 B3 D4') },
  F: { root: M('F2'), tones: notes('F4 A4 C5'), pad: notes('F3 A3 C4') },
  C: { root: M('C3'), tones: notes('E4 G4 C5'), pad: notes('E3 G3 C4') },
  D: { root: M('D3'), tones: notes('F#4 A4 D5'), pad: notes('F#3 A3 D4') },
  Em: { root: M('E2'), tones: notes('E4 G4 B4'), pad: notes('E3 G3 B3') },
};

const J_PROG: JChord[] = (
  'G F C G G F C D  G F C G G F C D  Em C G D Em C F D  G F C G G F C D'
)
  .trim()
  .split(/\s+/)
  .map((k) => J_CHORDS[k]);

const J_MEL_A = bars(
  'D5 - G5 - A5 - B5 - - - A5 - G5 - - -',
  'F5 - - - E5 - C5 - - - A4 - C5 - - -',
  'E5 - - - G5 - - - E5 - D5 - C5 - - -',
  'D5 - - - - - - - . . B4 - D5 - G5 -',
  'A5 - - - B5 - A5 - G5 - - - D5 - - -',
  'F5 - - - A5 - - - G5 - F5 - C5 - - -',
  'E5 - G5 - C6 - - - B5 - A5 - G5 - - -',
  'F#5 - - - - - - - A5 - - - . . . .',
);

const J_MEL_B = bars(
  'B4 - - - E5 - - - G5 - - - F#5 - E5 -',
  'G5 - - - - - E5 - C5 - - - - - . .',
  'D5 - - - G5 - - - B5 - - - A5 - G5 -',
  'A5 - - - - - - - F#5 - - - D5 - - -',
  'E5 - - - G5 - B5 - - - A5 - G5 - E5 -',
  'G5 - - - - - - - E5 - G5 - C6 - - -',
  'A5 - - - G5 - F5 - - - E5 - F5 - G5 -',
  'F#5 - - - - - - - - - - - . . . .',
);

const J_BASS_A = seq('0 - . 12 0 . 7 - 0 - 12 7 . . 7 12', 16);
const J_BASS_B = seq('0 - - . 7 - 12 - 0 - - . 7 - 12 -', 16);
const J_PLK_A = seq('0 . 1 2 . 1 2 . 3 . 2 1 . 2 1 .', 16);
const J_PLK_B = seq('3 . 2 . 1 . 2 . 0 . 1 . 2 . 1 .', 16);
const J_PLK_C = seq('0 1 2 1 3 . 2 1 0 1 2 . 3 2 1 .', 16);
const J_FILL = [294, 247, 196, 147];

const jungle: TrackDef = {
  bpm: 118,
  bars: 32,
  swing: 0.12,
  level: 0.9,
  delayBeats: 0.75,
  delayFb: 0.3,
  mix: {
    drums: { gain: 0.85, verb: 0.08 },
    perc: { gain: 0.75, verb: 0.12, pan: 0.15 },
    bass: { gain: 0.8 },
    pluck: { gain: 0.8, delay: 0.18, verb: 0.15, pan: -0.2 },
    lead: { gain: 0.55, delay: 0.3, verb: 0.15, lowpass: 2800, pan: 0.1 },
    pad: { gain: 0.5, verb: 0.3 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng, loop } = c;
    const sec = bar >> 3; // 0 : A, 1 : A + mélodie, 2 : pont, 3 : A + mélodie doublée
    const ch = J_PROG[bar];
    const bridge = sec === 2;
    const fillBar = (bar & 7) === 7 && step >= 12;

    // --- Percussions
    if (bridge) {
      if (step === 0 || step === 6 || step === 10) b.kick(t, step === 0 ? 1 : 0.8, 140, 48, 0.3);
    } else {
      if (step === 0 || step === 8) b.kick(t, 1, 140, 48, 0.3);
      if (sec > 0 && step === 11) b.kick(t, 0.7, 140, 48, 0.26);
      if (sec === 3 && step === 14 && (bar & 1) === 1) b.kick(t, 0.6, 140, 48, 0.24);
    }
    if (step === 4 || step === 12) b.rim(t, 0.5);
    else if (bridge && step === 15) b.rim(t, 0.22);
    if (bar >= 2 || step % 2 === 0) {
      const v = step % 4 === 2 ? 0.55 : step % 2 === 0 ? 0.32 : 0.18;
      b.shaker(t, v + rng.next() * 0.08);
    }
    if (fillBar) {
      b.tom(t, J_FILL[step - 12], 0.7, 0.28, true);
    } else if (bridge) {
      if (step === 3 || step === 7 || step === 10) b.tom(t, 98, 0.6, 0.32, true);
      if (step === 5 || step === 12 || step === 13) b.tom(t, 196, 0.42, 0.2);
    } else {
      if (step === 7 || step === 14) b.tom(t, 98, 0.5, 0.32, true);
      if (step === 3 || step === 10) b.tom(t, 196, 0.34, 0.2);
      if ((bar & 3) === 3 && step === 15 && rng.chance(0.5)) b.tom(t, 147, 0.4, 0.2);
    }

    // --- Basse rebondissante
    const bp = bridge ? J_BASS_B : J_BASS_A;
    const iv = bp[step];
    if (iv >= 0) {
      const len = holdLen(bp, step);
      b.bass(t, ch.root + iv, len * sd * 0.85, step === 0 ? 0.95 : 0.78, { cutoff: 380, env: 1100, q: 4, decay: 0.07 });
    }

    // --- Marimba
    const pp = sec === 3 ? J_PLK_C : bridge ? J_PLK_B : J_PLK_A;
    const pi = pp[step];
    if (pi >= 0) {
      const m = pi >= 3 ? ch.tones[0] + 12 : ch.tones[pi];
      b.pluck(t, m, (step & 3) === 0 ? 0.7 : 0.5 + rng.next() * 0.12, 0.42);
    }

    // --- Nappe douce sur le pont
    if (bridge && step === 0) b.pad(t, ch.pad, sd * 16, 0.75, { wave: 'triangle', cutoff: 1800, attack: 0.3, release: 0.6, detune: 6 });

    // --- Mélodies
    const k = (bar & 7) * 16 + step;
    if (sec === 1 || sec === 3) {
      const m = J_MEL_A[k];
      if (m >= 0) {
        const len = holdLen(J_MEL_A, k);
        b.lead(t, m, len * sd * 0.9, 0.85, {
          wave: (loop & 1) === 1 ? 'triangle' : 'square',
          vibrato: len >= 4 ? 14 : 0,
        });
        if (sec === 3) b.pluck(t, m - 12, 0.45, 0.35);
      }
    } else if (bridge) {
      const m = J_MEL_B[k];
      if (m >= 0) {
        const len = holdLen(J_MEL_B, k);
        b.lead(t, m, len * sd * 0.92, 0.9, {
          wave: 'triangle',
          vibrato: 18,
          glideFrom: c.mem[0] >= 0 && Math.abs(c.mem[0] - m) <= 7 ? c.mem[0] : -1,
          glide: 0.05,
          attack: 0.03,
        });
        c.mem[0] = m;
      }
    }
  },
};

// ===================================================================== MOON
// Mi mineur, 100 BPM : cloches qui résonnent, rythme clairsemé, thérémine en seconde moitié.

interface MoonChord {
  root: number;
  pad: number[];
  bell: number[];
  mel: Int16Array;
}

const MOON_CHORDS: MoonChord[] = [
  { root: M('E2'), pad: notes('G3 D4 F#4'), bell: notes('E5 G5 B5 D6 F#6'), mel: seq('B4 - - - - - - - E5 - - - - - - - F#5 - - - - - - - - - - - G5 - - -', 32) },
  { root: M('C2'), pad: notes('G3 B3 E4'), bell: notes('C5 E5 G5 B5 E6'), mel: seq('E5 - - - - - - - - - - - D5 - - - B4 - - - - - - - - - - - . . . .', 32) },
  { root: M('A1'), pad: notes('C4 G4 B4'), bell: notes('A4 C5 E5 G5 B5'), mel: seq('C5 - - - - - - - B4 - - - A4 - - - E5 - - - - - - - - - - - - - - -', 32) },
  { root: M('B1'), pad: notes('A3 D#4 F#4'), bell: notes('B4 D#5 F#5 A5 B5'), mel: seq('D#5 - - - - - - - F#5 - - - - - - - A5 - - - - - - - F#5 - - - - - - -', 32) },
  { root: M('E2'), pad: notes('G3 D4 F#4'), bell: notes('E5 G5 B5 D6 F#6'), mel: seq('G5 - - - - - - - F#5 - - - E5 - - - B5 - - - - - - - - - - - - - - -', 32) },
  { root: M('F2'), pad: notes('A3 E4 B4'), bell: notes('F5 A5 B5 C6 E6'), mel: seq('A5 - - - - - - - G5 - - - F5 - - - E5 - - - - - - - - - - - . . . .', 32) },
  { root: M('D2'), pad: notes('F#3 A3 E4'), bell: notes('D5 E5 F#5 A5 D6'), mel: seq('F#5 - - - - - - - E5 - - - D5 - - - A4 - - - - - - - - - - - - - - -', 32) },
  { root: M('B1'), pad: notes('A3 D#4 C5'), bell: notes('B4 D#5 F#5 A5 C6'), mel: seq('B4 - - - - - - - C5 - - - - - - - D#5 - - - - - - - - - - - . . . .', 32) },
];

const MOON_BASS = seq('0 - - - - - - - - - - - 7 - - - 0 - - - - - 12 - - - 7 - - - . .', 32);
const MOON_BELL_A = seq('0 . . . . . 2 . . . 1 . . . 3 .', 16);
const MOON_BELL_B = seq('0 . . 2 . . 4 . . . 1 . 3 . . .', 16);

const moon: TrackDef = {
  bpm: 100,
  bars: 32,
  swing: 0,
  level: 1,
  delayBeats: 0.75,
  delayFb: 0.5,
  mix: {
    drums: { gain: 0.8, verb: 0.45 },
    bass: { gain: 0.85 },
    pad: { gain: 0.75, verb: 0.5 },
    bell: { gain: 0.6, delay: 0.55, verb: 0.55, pan: -0.15 },
    lead: { gain: 0.6, delay: 0.3, verb: 0.5, lowpass: 2400, pan: 0.15 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng } = c;
    const ch = MOON_CHORDS[(bar >> 1) & 7];
    const pos = (bar & 1) * 16 + step;
    const second = bar >= 16;

    if (pos === 0) {
      b.pad(t, ch.pad, sd * 32, second ? 0.9 : 0.7, {
        wave: 'sawtooth',
        cutoff: second ? 900 : 700,
        attack: 1.4,
        release: 2,
        detune: 7,
      });
    }

    // --- Basse lente
    const bv = MOON_BASS[pos];
    if (bv >= 0) {
      b.bass(t, ch.root + bv, holdLen(MOON_BASS, pos) * sd * 0.95, 0.8, {
        cutoff: 260,
        env: 320,
        q: 2,
        decay: 0.25,
        attack: 0.02,
        release: 0.3,
        sustain: 0.85,
      });
    }

    // --- Cloches en écho
    const bi = (second ? MOON_BELL_B : MOON_BELL_A)[step];
    if (bi >= 0) {
      let m = ch.bell[bi];
      if (second && rng.chance(0.25)) m += 12;
      b.bell(t, m, 0.5 + rng.next() * 0.2, 2.2);
    }
    if (step === 4 && rng.chance(0.12)) b.bell(t, ch.bell[rng.int(5)] + 12, 0.18, 1.4, 2.76, 0.7);

    // --- Rythme clairsemé
    if (step === 0) b.kick(t, 0.85, 120, 40, 0.5);
    if (step === 10 && (bar & 1) === 1) b.kick(t, 0.6, 120, 40, 0.4);
    if (second && step === 7 && rng.chance(0.5)) b.kick(t, 0.42, 120, 40, 0.3);
    if (step === 8 && bar >= 4) b.snare(t, second ? 0.6 : 0.45, 0.25, 170);
    if (bar >= 8 && (step & 1) === 0) b.hat(t, (step & 3) === 2 ? 0.22 : 0.12, step === 14 && (bar & 1) === 1);
    if (second && (step & 1) === 1 && rng.chance(0.2)) b.hat(t, 0.07);

    // --- Thérémine (glissando depuis la note précédente)
    if (second) {
      const m = ch.mel[pos];
      if (m >= 0) {
        b.lead(t, m, holdLen(ch.mel, pos) * sd * 0.95, 0.85, {
          wave: 'triangle',
          vibrato: 22,
          glideFrom: c.mem[0],
          glide: 0.11,
          attack: 0.09,
          release: 0.45,
        });
        c.mem[0] = m;
      }
    }
  },
};

// ===================================================================== NEBULA (vol 1)
// La mineur, 124 BPM : synthwave entraînante, basse en octaves, arpège, grande caisse claire.

interface NChord {
  root: number;
  arp: number[];
  pad: number[];
}

const N_CHORDS: Record<string, NChord> = {
  Am: { root: M('A2'), arp: notes('A4 C5 E5 G5'), pad: notes('A3 C4 E4') },
  F: { root: M('F2'), arp: notes('F4 A4 C5 E5'), pad: notes('A3 C4 F4') },
  C: { root: M('C3'), arp: notes('E4 G4 C5 E5'), pad: notes('G3 C4 E4') },
  G: { root: M('G2'), arp: notes('G4 B4 D5 G5'), pad: notes('G3 B3 D4') },
  E: { root: M('E2'), arp: notes('E4 G#4 B4 E5'), pad: notes('G#3 B3 E4') },
};

const N_PROG: NChord[] = (
  'Am F C G Am F C G  Am F C G Am F G E  F G Am Am F G C E  Am F C G Am F G E'
)
  .trim()
  .split(/\s+/)
  .map((k) => N_CHORDS[k]);

const N_MEL_B = bars(
  'E5 - - - - - D5 - C5 - - - D5 - E5 -',
  'F5 - - - - - E5 - C5 - - - A4 - - -',
  'G5 - - - - - E5 - C5 - - - E5 - G5 -',
  'D5 - - - - - - - - - - - B4 - D5 -',
  'E5 - - - A5 - - - G5 - E5 - D5 - C5 -',
  'C5 - - - A4 - - - F5 - - - E5 - D5 -',
  'D5 - - - - - B4 - D5 - - - G5 - - -',
  'G#5 - - - - - - - B5 - - - E5 - - -',
);

const N_MEL_D = bars(
  'A5 - - - - - G5 - E5 - - - G5 - A5 -',
  'C6 - - - - - A5 - F5 - - - A5 - C6 -',
  'B5 - - - - - G5 - E5 - - - G5 - B5 -',
  'D6 - - - - - - - B5 - - - G5 - - -',
  'E6 - - - - - D6 - C6 - - - B5 - A5 -',
  'C6 - - - - - - - A5 - - - F5 - - -',
  'G5 - - - B5 - - - D6 - - - B5 - - -',
  'G#5 - - - - - - - - - - - . . . .',
);

const N_ARP_1 = seq('0 1 2 3 2 1 2 3 0 1 2 3 2 3 1 2', 16);
const N_ARP_2 = seq('0 2 1 3 0 2 1 3 2 0 3 1 2 0 3 1', 16);
const N_ARP_C = seq('0 2 1 3 0 2 3 1', 8);
const N_BASS_C = seq('0 - - 0 - - 0 - 12 - 0 - - 7 - -', 16);

const nebula: TrackDef = {
  bpm: 124,
  bars: 32,
  swing: 0,
  level: 0.85,
  delayBeats: 0.75,
  delayFb: 0.35,
  mix: {
    drums: { gain: 0.9, verb: 0.15 },
    bass: { gain: 0.8 },
    arp: { gain: 0.5, delay: 0.35, lowpass: 2400, pan: -0.25 },
    pad: { gain: 0.6, verb: 0.35 },
    lead: { gain: 0.55, delay: 0.3, verb: 0.2, lowpass: 3200, pan: 0.12 },
    fx: { gain: 0.6, verb: 0.3 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng, loop } = c;
    const sec = bar >> 3; // 0 : intro rythmique, 1 : thème, 2 : pont, 3 : thème aigu
    const ch = N_PROG[bar];
    const half = sec === 2 && bar < 20;

    // --- Batterie
    if (half) {
      if (step === 0 || step === 10) b.kick(t, 0.95, 160, 44, 0.34);
      if (step === 8) b.snare(t, 0.8, 0.24);
      if ((step & 3) === 2) b.hat(t, 0.15);
    } else {
      if ((step & 3) === 0) b.kick(t, 1, 160, 44, 0.32);
      if (step === 4 || step === 12) b.snare(t, 0.85, 0.2);
      if ((step & 3) === 2) b.hat(t, 0.3, true);
      if ((sec === 1 || sec === 3) && (step & 1) === 1) b.hat(t, 0.09 + rng.next() * 0.05);
    }
    if (bar === 23 && step >= 8) b.snare(t, 0.25 + (step - 8) * 0.08, 0.1);
    if (bar === 22 && step === 0) b.riser(t, sd * 32, 0.9);
    if (step === 0 && (bar === 8 || bar === 20 || bar === 24 || (bar === 0 && loop > 0))) b.crash(t, 0.7);

    // --- Basse
    if (sec === 0) {
      if ((step & 1) === 0) {
        b.bass(t, ch.root + ((step & 2) !== 0 ? 12 : 0), sd * 1.7, (step & 3) === 0 ? 0.95 : 0.75, {
          cutoff: 380,
          env: 1000,
          q: 5,
          decay: 0.08,
        });
      }
    } else if (sec === 2) {
      const iv = N_BASS_C[step];
      if (iv >= 0) {
        b.bass(t, ch.root + iv, holdLen(N_BASS_C, step) * sd * 0.9, 0.85, { cutoff: 420, env: 700, q: 3, decay: 0.12 });
      }
    } else {
      const oct = step === 6 || step === 14 ? 12 : 0;
      b.bass(t, ch.root + oct, sd * 0.85, (step & 3) === 0 ? 0.95 : 0.7, { cutoff: 340, env: 900, q: 5, decay: 0.05 });
    }

    // --- Arpège
    if (sec === 2) {
      if ((step & 1) === 0) b.arp(t, ch.arp[N_ARP_C[step >> 1]] + 12, 0.5, 0.3, 'sawtooth');
    } else {
      const ai = (sec === 3 ? N_ARP_2 : N_ARP_1)[step];
      const up = sec === 3 && (bar & 1) === 1 ? 12 : 0;
      b.arp(t, ch.arp[ai] + up, (step & 3) === 0 ? 0.62 : 0.48, 0.16, 'square');
    }

    // --- Nappe
    if (sec !== 0 && step === 0) {
      b.pad(t, ch.pad, sd * 16, 0.8, { wave: 'sawtooth', cutoff: sec === 2 ? 1100 : 1600, attack: 0.25, release: 0.5, detune: 10 });
    }

    // --- Mélodie
    if (sec === 1 || sec === 3) {
      const mel = sec === 1 ? N_MEL_B : N_MEL_D;
      const k = (bar & 7) * 16 + step;
      const m = mel[k];
      if (m >= 0) {
        const len = holdLen(mel, k);
        b.lead(t, m, len * sd * 0.92, 0.9, { wave: 'sawtooth', detune: 9, vibrato: len >= 4 ? 16 : 0 });
      }
    }
  },
};

// ===================================================================== ASTEROIDS (vol 2)
// Ré mineur, 140 BPM : basse arpégée en doubles croches, accords syncopés, montée de tension.

interface AChord {
  root: number;
  /** Intervalles de l'arpège de basse : fondamentale, quinte, octave, dixième. */
  ivs: number[];
  stab: number[];
  pad: number[];
}

const aChord = (root: string, third: number, stab: string, pad: string): AChord => ({
  root: M(root),
  ivs: [0, 7, 12, 12 + third],
  stab: notes(stab),
  pad: notes(pad),
});

const A_CHORDS: Record<string, AChord> = {
  Dm: aChord('D2', 3, 'F4 A4 D5', 'D4 F4 A4'),
  Bb: aChord('Bb1', 4, 'F4 Bb4 D5', 'D4 F4 Bb4'),
  C: aChord('C2', 4, 'G4 C5 E5', 'E4 G4 C5'),
  A: aChord('A1', 4, 'E4 A4 C#5', 'C#4 E4 A4'),
  Gm: aChord('G2', 3, 'G4 Bb4 D5', 'D4 G4 Bb4'),
};

const A_PROG: AChord[] = (
  'Dm Dm Bb C Dm Dm Bb A  Dm Bb C A Dm Bb Gm A  Gm Gm Bb Bb Gm Gm A A  Dm Bb C A Dm Bb Gm A'
)
  .trim()
  .split(/\s+/)
  .map((k) => A_CHORDS[k]);

const A_MEL = bars(
  'D5 - - D5 - - F5 - - - E5 - D5 - C5 -',
  'D5 - - - - - - - . . F5 - G5 - A5 -',
  'G5 - - G5 - - E5 - - - C5 - E5 - G5 -',
  'A5 - - - - - - - C#5 - - - E5 - - -',
  'F5 - - F5 - - A5 - - - G5 - F5 - E5 -',
  'F5 - - - D5 - - - Bb4 - - - D5 - F5 -',
  'G5 - - - Bb5 - - - A5 - G5 - F5 - E5 -',
  'C#5 - - - E5 - - - A5 - - - - - . .',
);

const A_BASS = seq('0 1 2 1 0 1 3 2 0 1 2 1 0 2 3 2', 16);
const A_BASS_C = seq('0 . 0 . 2 . 0 . 0 . 0 . 2 . 1 .', 16);
const A_STAB = seq('1 . . 1 . . 1 . . . 1 . . . 1 .', 16);
const A_FILL = [196, 165, 131, 98];

const asteroids: TrackDef = {
  bpm: 140,
  bars: 32,
  swing: 0,
  level: 0.85,
  delayBeats: 0.5,
  delayFb: 0.3,
  mix: {
    drums: { gain: 0.9, verb: 0.1 },
    perc: { gain: 0.7, verb: 0.1 },
    bass: { gain: 0.85 },
    stab: { gain: 0.55, delay: 0.2, lowpass: 3000, pan: 0.2 },
    lead: { gain: 0.5, delay: 0.3, verb: 0.1, lowpass: 3000, pan: -0.1 },
    arp: { gain: 0.35, delay: 0.3, lowpass: 3600, pan: 0.3 },
    pad: { gain: 0.55, verb: 0.3 },
    fx: { gain: 0.6, verb: 0.3 },
  },
  play(c) {
    const { b, bar, step, t, sd, rng, loop } = c;
    const sec = bar >> 3; // 0 : riff, 1 : thème, 2 : tension, 3 : thème doublé
    const ch = A_PROG[bar];
    const tension = sec === 2;
    const sparse = tension && bar < 20;

    // --- Batterie
    if (sparse) {
      if (step === 0 || step === 10) b.kick(t, 1, 170, 42, 0.34);
      if (step === 8) b.snare(t, 0.85, 0.22, 200);
      if ((step & 1) === 0) b.hat(t, (step & 3) === 0 ? 0.2 : 0.12);
      if (bar === 19 && step >= 12) b.tom(t, A_FILL[step - 12], 0.75, 0.25, true);
    } else {
      if ((step & 3) === 0 || (step === 14 && (bar & 1) === 1) || (step === 10 && rng.chance(0.3))) {
        b.kick(t, (step & 3) === 0 ? 1 : 0.75, 170, 42, 0.3);
      }
      if (step === 4 || step === 12) b.snare(t, 0.9, 0.18, 200);
      b.hat(t, (step & 1) === 0 ? 0.3 : 0.14 + rng.next() * 0.06, step === 14 && (bar & 3) === 3);
    }
    if (bar === 22 && step % 2 === 0) b.snare(t, 0.3 + step * 0.02, 0.1, 210);
    if (bar === 23) b.snare(t, 0.35 + step * 0.035, 0.1, 210);
    if (bar === 22 && step === 0) b.riser(t, sd * 32, 1);
    if (step === 0 && (bar === 8 || bar === 16 || bar === 24 || (bar === 0 && loop > 0))) b.crash(t, 0.75);

    // --- Basse arpégée
    if (tension) {
      const bi = A_BASS_C[step];
      if (bi >= 0) b.bass(t, ch.root + ch.ivs[bi], sd * 1.6, (step & 3) === 0 ? 0.95 : 0.75, { cutoff: 300, env: 1400, q: 7, decay: 0.07 });
    } else {
      const iv = ch.ivs[A_BASS[step]];
      b.bass(t, ch.root + iv, sd * 0.8, (step & 3) === 0 ? 0.95 : 0.72, { cutoff: 360, env: 1300, q: 6, decay: 0.05 });
    }

    // --- Accords syncopés
    if ((sec === 0 || sec === 3) && A_STAB[step] >= 0) b.stab(t, ch.stab, sec === 0 ? 0.75 : 0.5, 0.12);

    // --- Nappe et arpège aigu pendant la tension
    if (tension && step === 0) b.pad(t, ch.pad, sd * 16, 0.85, { wave: 'sawtooth', cutoff: 900 + (bar - 16) * 160, attack: 0.2, release: 0.4, detune: 12 });
    if (tension && bar >= 20) b.arp(t, ch.stab[step % 3] + 12, 0.45 + (bar - 20) * 0.06, 0.12, 'square');

    // --- Mélodie
    if (sec === 1 || sec === 3) {
      const k = (bar & 7) * 16 + step;
      const m = A_MEL[k];
      if (m >= 0) {
        const len = holdLen(A_MEL, k);
        b.lead(t, m, len * sd * 0.9, 0.95, { wave: 'square', vibrato: len >= 4 ? 18 : 0 });
        if (sec === 3) b.lead(t, m + 12, len * sd * 0.9, 0.45, { wave: 'triangle', vibrato: len >= 4 ? 12 : 0 });
      }
    }
  },
};

export const TRACKS: Record<MusicId, TrackDef> = { menu, jungle, moon, nebula, asteroids, ...WORLD1_TRACKS };
