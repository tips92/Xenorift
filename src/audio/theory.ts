// Outils musicaux : noms de notes, séquences pas à pas, générateur pseudo-aléatoire déterministe.

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Nom de note → numéro MIDI : 'C4' = 60, 'F#3' = 54, 'Bb2' = 46. */
export function note(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Note invalide : ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + PITCH[m[1]] + acc;
}

/** Liste de notes séparées par des espaces. */
export function notes(list: string): number[] {
  return list.trim().split(/\s+/).map(note);
}

const FREQ = new Float64Array(128);
for (let i = 0; i < 128; i++) FREQ[i] = 440 * Math.pow(2, (i - 69) / 12);

/** Numéro MIDI (éventuellement fractionnaire) → fréquence en Hz. */
export function mtof(m: number): number {
  if (m >= 0 && m < 128 && (m | 0) === m) return FREQ[m];
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Silence dans une séquence. */
export const REST = -1;
/** Prolonge la note précédente d'un pas. */
export const HOLD = -2;

/**
 * Séquence pas à pas (un jeton par double croche) :
 * nom de note ('G5'), nombre entier (index ou intervalle), '.' = silence, '-' = tenue.
 * `expected` : nombre de jetons attendu (contrôle de saisie en développement).
 */
export function seq(src: string, expected?: number): Int16Array {
  const tokens = src.trim().split(/\s+/);
  const out = new Int16Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk === '.') out[i] = REST;
    else if (tk === '-') out[i] = HOLD;
    else if (/^\d+$/.test(tk)) out[i] = Number(tk);
    else out[i] = note(tk);
  }
  if (expected !== undefined && tokens.length !== expected && import.meta.env?.DEV) {
    console.warn(`[audio] séquence de ${tokens.length} pas au lieu de ${expected} : ${src.slice(0, 40)}…`);
  }
  return out;
}

/** Concatène des mesures de 16 pas (chaque chaîne = une mesure). */
export function bars(...lines: string[]): Int16Array {
  return seq(lines.join(' '), lines.length * 16);
}

/** Durée (en pas) de la note qui commence à l'index i : 1 + nombre de tenues qui suivent. */
export function holdLen(s: Int16Array, i: number): number {
  let n = 1;
  while (i + n < s.length && s[i + n] === HOLD) n++;
  return n;
}

/** Générateur pseudo-aléatoire (mulberry32) : rejouable, sans allocation. */
export class Rng {
  private s = 1;

  seed(n: number): void {
    this.s = (n ^ 0x2545f491) >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
