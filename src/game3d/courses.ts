import type { CourseId } from '../core/types';
import { mulberry32, rand, type Rng } from './rng';

// Données des parcours 3D. Tout est généré à partir d'une graine fixe : un parcours est identique
// à chaque partie. Le vaisseau avance vers −Z, dans un couloir circulaire centré sur l'axe Z.

/** Rayon du couloir de vol (le centre du vaisseau reste dedans). */
export const CORRIDOR_R = 12;
/** Vitesse latérale maximale (u/s) et accélération latérale (u/s²). */
export const MAX_LAT = 16;
export const LAT_ACCEL = 46;
/** Rayon d'un portail (centre du tube de l'anneau) et rayon de passage validé. */
export const GATE_R = 4.6;
export const GATE_PASS_R = 4.5;
/** Sphère de collision du vaisseau. */
export const SHIP_HIT_R = 1.05;
/** Plus gros rayon d'astéroïde possible (pour les fenêtres de recherche). */
export const MAX_ROCK_R = 12;
/** Écart latéral entre deux portails ≤ 70 % de ce que permet la vitesse latérale max. */
const REACH_FACTOR = 0.7;

export type Vec3Tuple = readonly [number, number, number];

/** Palette et ambiance d'un parcours (couleurs sRGB). */
export interface CourseTheme {
  skyDeep: string;
  skyBase: string;
  nebA: string;
  nebB: string;
  nebC: string;
  /** Directions des zones les plus denses de la nébuleuse, et normale de la bande galactique. */
  focus: Vec3Tuple;
  focus2: Vec3Tuple;
  band: Vec3Tuple;
  bandGain: number;
  laneGain: number;
  fogNear: number;
  fogFar: number;
  gate: string;
  gateNext: string;
  gateMissed: string;
  rocks: readonly string[];
  crystal: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
  streak: string;
  warpA: string;
  warpB: string;
  stars: readonly string[];
}

export interface CourseDef {
  id: CourseId;
  seed: number;
  /** Vitesse de croisière (u/s). */
  speed: number;
  /** Chrono de départ (s). */
  startTime: number;
  gateCount: number;
  firstGateZ: number;
  spacing: readonly [number, number];
  tightChance: number;
  /** Distance max du centre d'un portail à l'axe du couloir. */
  maxOffset: number;
  /** Écart latéral max entre deux portails consécutifs. */
  maxJump: number;
  /** Distance entre le dernier portail et le portail de distorsion. */
  warpGap: number;
  /** Rayon du tube laissé libre autour de la trajectoire idéale. */
  clearR: number;
  nearRocks: number;
  nearRockMax: number;
  farRocks: number;
  bigRocks: number;
  /** Gros rochers à la dérive dans le couloir (vol 2) ou seulement autour (vol 1). */
  bigInside: boolean;
  theme: CourseTheme;
}

export interface GateData {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RockData {
  x: number;
  y: number;
  z: number;
  r: number;
  /** 0..3 : petits modèles, 4 : gros rocher détaillé. */
  variant: number;
  ax: number;
  ay: number;
  az: number;
  spin: number;
  phase: number;
  /** Amplitude et fréquence de dérive (gros rochers). */
  drift: number;
  driftFreq: number;
  collide: boolean;
  tint: number;
  shade: number;
}

export interface Course {
  def: CourseDef;
  gates: GateData[];
  rocks: RockData[];
  /** Trajectoire idéale : départ, centres des portails, portail de distorsion. */
  path: GateData[];
  warpZ: number;
  length: number;
}

const NEBULA_THEME: CourseTheme = {
  skyDeep: '#02021a',
  skyBase: '#0b0c3c',
  nebA: '#3a6bff',
  nebB: '#22e0cc',
  nebC: '#ff3fc8',
  focus: [0.35, 0.28, -1],
  focus2: [-1, 0.2, -0.55],
  band: [0.25, 1, 0.15],
  bandGain: 0.85,
  laneGain: 0.5,
  fogNear: 320,
  fogFar: 1300,
  gate: '#ff4fd8',
  gateNext: '#3dffe0',
  gateMissed: '#ff3355',
  rocks: ['#7d82b0', '#8c7cb4', '#6a74a4', '#9a90bc'],
  crystal: '#3dffe0',
  hemiSky: '#8fb0ff',
  hemiGround: '#3a1458',
  hemiIntensity: 1.1,
  key: '#fff2e4',
  keyIntensity: 2.6,
  rim: '#ff5ae0',
  rimIntensity: 2.2,
  streak: '#a8fbff',
  warpA: '#3dffe0',
  warpB: '#8a4dff',
  stars: ['#ffffff', '#cfe6ff', '#9fd8ff', '#ffd6f4', '#bff8ff'],
};

const ASTEROIDS_THEME: CourseTheme = {
  skyDeep: '#030109',
  skyBase: '#170b26',
  nebA: '#ff9a2e',
  nebB: '#7a3cff',
  nebC: '#ff5a3a',
  focus: [0.55, 0.12, -1],
  focus2: [-0.8, 0.4, -0.6],
  band: [0.1, 1, 0.3],
  bandGain: 1.25,
  laneGain: 0.72,
  fogNear: 300,
  fogFar: 1260,
  gate: '#ff9a2e',
  gateNext: '#3dffe0',
  gateMissed: '#ff3355',
  rocks: ['#8c7a6c', '#7e7064', '#70687c', '#9a8874'],
  crystal: '#ff8a1a',
  hemiSky: '#ffc89a',
  hemiGround: '#2a1640',
  hemiIntensity: 1.0,
  key: '#ffe6c8',
  keyIntensity: 2.7,
  rim: '#9a6bff',
  rimIntensity: 2.4,
  streak: '#ffe0b0',
  warpA: '#ffb347',
  warpB: '#8a4dff',
  stars: ['#ffffff', '#ffe9c8', '#ffd0a0', '#d8c8ff', '#cfe6ff'],
};

export const COURSES: Record<CourseId, CourseDef> = {
  // Vol 1 : facile, ~75 s, peu d'astéroïdes, sauts latéraux modérés.
  nebula: {
    id: 'nebula',
    seed: 1337,
    speed: 58,
    startTime: 72,
    gateCount: 16,
    firstGateZ: -250,
    spacing: [215, 290],
    tightChance: 0.12,
    maxOffset: 7.5,
    maxJump: 11,
    warpGap: 330,
    clearR: 4.2,
    nearRocks: 120,
    nearRockMax: 18,
    farRocks: 90,
    bigRocks: 6,
    bigInside: false,
    theme: NEBULA_THEME,
  },
  // Vol 2 : ceinture dense, ~90 s, gros rochers à la dérive dans le couloir.
  asteroids: {
    id: 'asteroids',
    seed: 4242,
    speed: 64,
    startTime: 67,
    gateCount: 22,
    firstGateZ: -260,
    spacing: [215, 298],
    tightChance: 0.2,
    maxOffset: 8.5,
    maxJump: 14,
    warpGap: 340,
    clearR: 3.5,
    nearRocks: 540,
    nearRockMax: 19,
    farRocks: 260,
    bigRocks: 18,
    bigInside: true,
    theme: ASTEROIDS_THEME,
  },
};

/** Position (x, y) de la trajectoire idéale à la profondeur z. */
export function pathAt(path: readonly GateData[], z: number, out: { x: number; y: number }): void {
  const first = path[0];
  if (z >= first.z) {
    out.x = first.x;
    out.y = first.y;
    return;
  }
  for (let i = 1; i < path.length; i++) {
    const b = path[i];
    if (z >= b.z) {
      const a = path[i - 1];
      const t = (a.z - z) / (a.z - b.z);
      out.x = a.x + (b.x - a.x) * t;
      out.y = a.y + (b.y - a.y) * t;
      return;
    }
  }
  const last = path[path.length - 1];
  out.x = last.x;
  out.y = last.y;
}

// Motifs de portails, choisis par blocs de 4 : dispersion, slalom, spirale, vague.
function genGates(def: CourseDef, rng: Rng): GateData[] {
  const gates: GateData[] = [];
  let px = 0;
  let py = 0;
  let pz = 0;
  let z = def.firstGateZ;
  let pattern = 0;
  let blockAng = 0;
  let dir = 1;
  const m = def.maxOffset;
  for (let i = 0; i < def.gateCount; i++) {
    if (i > 0) {
      const tight = rng() < def.tightChance;
      z -= tight ? rand(rng, 150, 175) : rand(rng, def.spacing[0], def.spacing[1]);
    }
    const k = i % 4;
    if (k === 0) {
      pattern = i < 4 ? 0 : Math.floor(rng() * 4);
      blockAng = rng() * Math.PI * 2;
      dir = rng() < 0.5 ? -1 : 1;
    }
    let x: number;
    let y: number;
    switch (pattern) {
      case 0: {
        const a = rng() * Math.PI * 2;
        const r = m * Math.sqrt(rng()) * (i < 2 ? 0.55 : 1);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r * 0.75;
        break;
      }
      case 1: {
        x = (k % 2 === 0 ? 1 : -1) * dir * rand(rng, m * 0.55, m);
        y = rand(rng, -m * 0.3, m * 0.3);
        break;
      }
      case 2: {
        const a = blockAng + dir * k * 1.25;
        const r = m * rand(rng, 0.7, 0.95);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r * 0.8;
        break;
      }
      default: {
        x = dir * (-m * 0.8 + (k / 3) * m * 1.6);
        y = Math.sin(k * 1.7 + blockAng) * m * 0.55;
      }
    }
    // Atteignabilité : écart latéral / temps de trajet ≤ 70 % de la vitesse latérale max.
    const travel = (pz - z) / def.speed;
    const maxD = Math.min(def.maxJump, REACH_FACTOR * MAX_LAT * travel);
    const dx = x - px;
    const dy = y - py;
    const d = Math.hypot(dx, dy);
    if (d > maxD) {
      x = px + (dx / d) * maxD;
      y = py + (dy / d) * maxD;
    }
    // Reste dans le couloir (projection sur le disque : ne fait que rapprocher du précédent).
    const r = Math.hypot(x, y);
    if (r > m) {
      x *= m / r;
      y *= m / r;
    }
    gates.push({ x, y, z });
    px = x;
    py = y;
    pz = z;
  }
  return gates;
}

function genRocks(def: CourseDef, gates: GateData[], path: GateData[], warpZ: number, rng: Rng): RockData[] {
  const rocks: RockData[] = [];
  const zStart = -110;
  const zEnd = warpZ + 160;
  const tmp = { x: 0, y: 0 };
  const tints = def.theme.rocks.length;

  // Tube libre autour de la trajectoire idéale + aucun rocher dans les anneaux.
  const clear = (x: number, y: number, z: number, r: number, extra: number): boolean => {
    for (let s = -1; s <= 1; s++) {
      pathAt(path, z + s * r, tmp);
      if (Math.hypot(x - tmp.x, y - tmp.y) < r + def.clearR + extra) return false;
    }
    for (const g of gates) {
      if (Math.abs(z - g.z) < r + 10 + extra && Math.hypot(x - g.x, y - g.y) < GATE_R + r + 3 + extra) return false;
    }
    return true;
  };

  const place = (
    count: number,
    rhoMin: number,
    rhoMax: number,
    rMin: number,
    rMax: number,
    rPow: number,
    big: boolean,
  ): void => {
    for (let n = 0; n < count; n++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const z = rand(rng, zEnd, zStart);
        const a = rng() * Math.PI * 2;
        const rho = rhoMin + (rhoMax - rhoMin) * Math.sqrt(rng());
        const x = Math.cos(a) * rho;
        const y = Math.sin(a) * rho * (big ? 0.8 : 1);
        const r = rMin + (rMax - rMin) * Math.pow(rng(), rPow);
        const drift = big ? rand(rng, 3, 6.5) : 0;
        if (!clear(x, y, z, r, drift)) continue;
        // Axe de rotation aléatoire normalisé
        let ax = rng() * 2 - 1;
        let ay = rng() * 2 - 1;
        let az = rng() * 2 - 1;
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al;
        ay /= al;
        az /= al;
        rocks.push({
          x,
          y,
          z,
          r,
          variant: big ? 4 : Math.floor(rng() * 4),
          ax,
          ay,
          az,
          spin: (big ? rand(rng, 0.05, 0.16) : rand(rng, 0.2, 0.9)) * (rng() < 0.5 ? -1 : 1),
          phase: rng() * Math.PI * 2,
          drift,
          driftFreq: big ? rand(rng, 0.18, 0.35) : 0,
          collide: Math.hypot(x, y) - r - drift < CORRIDOR_R + SHIP_HIT_R + 0.5,
          tint: Math.floor(rng() * tints),
          shade: rand(rng, 0.78, 1.15),
        });
        break;
      }
    }
  };

  place(def.nearRocks, 0, def.nearRockMax, 0.9, 3.4, 1.7, false);
  place(def.farRocks, 22, 80, 2.2, 7.5, 1.3, false);
  if (def.bigInside) place(def.bigRocks, 9, 30, 6, 10.5, 1, true);
  else place(def.bigRocks, 30, 70, 7, 11, 1, true);
  // Tri par z décroissant : fenêtres glissantes pour l'affichage et les collisions.
  rocks.sort((a, b) => b.z - a.z);
  return rocks;
}

export function buildCourse(id: CourseId): Course {
  const def = COURSES[id];
  const rng = mulberry32(def.seed);
  const gates = genGates(def, rng);
  const warpZ = gates[gates.length - 1].z - def.warpGap;
  const path: GateData[] = [{ x: 0, y: 0, z: 0 }, ...gates, { x: 0, y: 0, z: warpZ }];
  const rocks = genRocks(def, gates, path, warpZ, rng);
  return { def, gates, rocks, path, warpZ, length: -warpZ };
}
