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
/**
 * Graine des vagues d'ennemis : mulberry32(seed ^ WAVE_SEED_XOR), un générateur À PART. Le générateur des
 * portails et des rochers n'est jamais touché : ils restent identiques au bit près (tests, records).
 */
export const WAVE_SEED_XOR = 0x5eed3b;

export type Vec3Tuple = readonly [number, number, number];

/** Ennemis spatiaux (game3d/enemies.ts) : chasseur, mine, essaim. */
export type EnemyKind = 'fighter' | 'mine' | 'swarm';
export const ENEMY_KINDS = ['fighter', 'mine', 'swarm'] as const satisfies readonly EnemyKind[];

/** Vagues d'ennemis d'un parcours (réglages de genWaves ; champs ajoutables par le module ennemis). */
export interface WavePlan {
  /** Nombre de vagues (moins si la place manque : portails, rochers). */
  count: number;
  /** Types possibles. */
  kinds: readonly EnemyKind[];
  /** Fraction du parcours (0..1) avant laquelle aucun chasseur n'apparaît. */
  fighterFrom: number;
  /** Vagues de chasseurs parmi `count`, réparties après fighterFrom (les autres : mines et essaims en alternance). */
  fighterWaves: number;
  /** Chasseurs par vague au plus (1 ou 2). */
  fighterMax: number;
  /** Mines par vague, du début à la fin du parcours (1 à 3). */
  mineMin: number;
  mineMax: number;
  /** Membres d'un essaim, du début à la fin du parcours (5 à 7). */
  swarmMin: number;
  swarmMax: number;
  /** Première vague après ce portail (index dans gates). */
  startGate: number;
}

// Géométrie des vagues, partagée par genWaves (placement) et game3d/enemies.ts (comportement).
/** Mines et essaims apparaissent quand la Comète arrive à cette distance (u). */
export const ENEMY_ACTIVATE_D = 620;
/** Mine : explose si le centre de la Comète passe à moins de ce rayon (u). */
export const MINE_TRIGGER_R = 3;
/** Mines 2 et 3 d'une vague : à cette distance de la première, du même côté de la trajectoire (u). */
export const MINE_SIDE_R = 5.6;
/** Essaim : écart entre deux membres le long de la ligne ; ondulation (perpendiculaire) et balancement (u). */
export const SWARM_SPACING = 2.5;
export const SWARM_UNDULATE = 1.1;
export const SWARM_SWAY = 1.4;
/**
 * Chasseur : entre en scène quand la Comète arrive à FIGHTER_SPAWN_D de WaveData.z, se cale devant elle et
 * charge pendant FIGHTER_HOLD_SPAN u de trajet, tire quand elle passe en WaveData.z + FIGHTER_FIRE_DZ (le second
 * d'une paire FIGHTER_STAGGER u plus loin). Repères en z de la Comète : même rendez-vous quelle que soit sa vitesse.
 * Son orbe, presque immobile dans le décor (vitesse réglée sur la croisière, pas sur la vitesse du moment), est
 * croisée vers WaveData.z (à ~10 u près ; le second d'une paire FIGHTER_STAGGER u plus loin) que la Comète
 * turbote, relâche ou soit ralentie : ~1,75 s après le tir à la croisière (ORB_T de enemies.ts), plus tôt en turbo.
 */
export const FIGHTER_SPAWN_D = 400;
export const FIGHTER_FIRE_DZ = 110;
export const FIGHTER_HOLD_SPAN = 70;
export const FIGHTER_STAGGER = 28;
/** Écart latéral des deux chasseurs d'une paire (u). */
export const FIGHTER_PAIR_DX = 3.4;

/**
 * Une vague, placée à la génération (déterministe). Jamais dans un portail ni sur sa ligne d'approche
 * immédiate ; tout reste atteignable et le parcours faisable au chrono.
 */
export interface WaveData {
  readonly kind: EnemyKind;
  /**
   * Profondeur (z < 0). Mine : sa position ; essaim : centre de la formation ; chasseur : profondeur où il
   * entre en scène (devant la Comète, au fond du couloir).
   */
  readonly z: number;
  /** Position latérale (centre de la formation pour l'essaim), dans le couloir. */
  readonly x: number;
  readonly y: number;
  /** Ennemis de la vague : mines 1 à 3, essaim 5 à 7, chasseurs 1 ou 2. */
  readonly count: number;
  /** Variante tirée à la génération, 0..1 (sens de l'ondulation, écart des mines, côté du virage…). */
  readonly variant: number;
}

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
  /** Vagues d'ennemis (graine dérivée : WAVE_SEED_XOR). */
  waves: WavePlan;
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
  /** Vagues d'ennemis, triées par z décroissant (la première rencontrée d'abord). */
  waves: WaveData[];
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
    // Introduction douce : mines et essaims d'abord, un chasseur seul après la moitié.
    waves: {
      count: 6,
      kinds: ['mine', 'swarm', 'fighter'],
      fighterFrom: 0.5,
      fighterWaves: 1,
      fighterMax: 1,
      mineMin: 1,
      mineMax: 2,
      swarmMin: 5,
      swarmMax: 6,
      startGate: 1,
    },
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
    // Les trois types, plus serrés.
    waves: {
      count: 10,
      kinds: ['mine', 'swarm', 'fighter'],
      fighterFrom: 0.15,
      fighterWaves: 3,
      fighterMax: 2,
      mineMin: 2,
      mineMax: 3,
      swarmMin: 6,
      swarmMax: 7,
      startGate: 0,
    },
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

/**
 * Position de repos du membre `k` d'une vague, écrite dans `out` (placement et comportement des ennemis).
 * Mines : la première en (x, y, z), les deux autres à MINE_SIDE_R d'elle, du côté `variant` (la trajectoire
 * reste libre de l'autre côté), l'une avant, l'autre après. Essaim : ligne d'orientation `variant` passant par
 * (x, y), en V (centre devant). Chasseurs : écart latéral de la paire, z = profondeur d'entrée en scène.
 */
export function waveSpot(w: Readonly<WaveData>, k: number, out: { x: number; y: number; z: number }): void {
  if (w.kind === 'mine') {
    if (k <= 0) {
      out.x = w.x;
      out.y = w.y;
      out.z = w.z;
      return;
    }
    const a = w.variant * Math.PI * 2 + (k === 1 ? 0.55 : -0.55);
    out.x = w.x + Math.cos(a) * MINE_SIDE_R;
    out.y = w.y + Math.sin(a) * MINE_SIDE_R;
    out.z = w.z + (k === 1 ? 24 : -28);
  } else if (w.kind === 'swarm') {
    const th = w.variant * Math.PI;
    const s = (k - (w.count - 1) / 2) * SWARM_SPACING;
    out.x = w.x + Math.cos(th) * s;
    out.y = w.y + Math.sin(th) * s;
    out.z = w.z - Math.abs(s) * 0.3;
  } else {
    const s = w.count > 1 ? (k === 0 ? -FIGHTER_PAIR_DX : FIGHTER_PAIR_DX) : 0;
    const th = (w.variant - 0.5) * 0.8;
    out.x = w.x + Math.cos(th) * s;
    out.y = w.y + Math.sin(th) * s;
    out.z = w.z;
  }
}

/** Zone réservée autour d'un portail (u) : ligne d'approche devant lui, sortie derrière lui. */
const GATE_APPROACH = 75;
const GATE_EXIT = 30;

/** Types des `n` vagues : chasseurs répartis après fighterFrom, mines et essaims en alternance (mine d'abord). */
function waveKinds(plan: WavePlan, n: number): EnemyKind[] {
  const hasF = plan.kinds.includes('fighter');
  const hasM = plan.kinds.includes('mine');
  const hasS = plan.kinds.includes('swarm');
  const fighterAt = new Set<number>();
  if (hasF) {
    const eligible: number[] = [];
    for (let i = 0; i < n; i++) if ((i + 0.5) / n >= plan.fighterFrom) eligible.push(i);
    const nf = !hasM && !hasS ? eligible.length : Math.min(Math.max(0, plan.fighterWaves), eligible.length);
    for (let j = 0; j < nf; j++) fighterAt.add(eligible[Math.floor(((j + 0.5) * eligible.length) / nf)]);
  }
  const kinds: EnemyKind[] = [];
  let alt = 0;
  for (let i = 0; i < n; i++) {
    if (fighterAt.has(i)) kinds.push('fighter');
    else if (hasM && (!hasS || alt++ % 2 === 0)) kinds.push('mine');
    else if (hasS) kinds.push('swarm');
  }
  return kinds;
}

/** Profondeurs occupées par une vague (z de la Comète, du premier tir au dernier danger) : jamais deux à la fois. */
function waveBusy(kind: EnemyKind, z: number, out: [number, number]): [number, number] {
  out[0] = z - (kind === 'fighter' ? 110 : 60);
  out[1] = z + (kind === 'fighter' ? 240 : 160);
  return out;
}

/**
 * Vagues d'ennemis du parcours, triées par z décroissant. Générateur PROPRE (mulberry32(seed ^ WAVE_SEED_XOR)) :
 * le générateur des portails et des rochers n'est pas consommé. Placement : réparties le long du parcours, hors
 * des portails et de leur ligne d'approche (pour un chasseur : là où son orbe arrive), dans le couloir, sans
 * chevaucher un rocher ; la première mine d'une vague barre la trajectoire mais laisse un passage sans rocher de
 * l'autre côté, l'essaim la traverse.
 */
function genWaves(
  def: CourseDef,
  gates: readonly GateData[],
  path: readonly GateData[],
  warpZ: number,
  rocks: readonly RockData[],
): WaveData[] {
  const plan = def.waves;
  const n = Math.max(0, Math.floor(plan.count));
  if (n === 0 || gates.length === 0) return [];
  const rng = mulberry32((def.seed ^ WAVE_SEED_XOR) >>> 0);
  const kinds = waveKinds(plan, n);
  const zTop = gates[Math.min(Math.max(0, plan.startGate), gates.length - 1)].z - GATE_EXIT;
  const zBot = warpZ + 150;
  const slot = (zTop - zBot) / kinds.length;
  const busy: [number, number][] = [];
  const range: [number, number] = [0, 0];
  const waves: WaveData[] = [];
  const tmp = { x: 0, y: 0 };
  const spot = { x: 0, y: 0, z: 0 };

  // Profondeurs [lo, hi] hors des zones des portails et dans la partie jouable du parcours.
  const gateFree = (lo: number, hi: number): boolean => {
    if (lo < warpZ + 100 || hi > zTop + 20) return false;
    for (const g of gates) if (hi > g.z - GATE_EXIT && lo < g.z + GATE_APPROACH) return false;
    return true;
  };
  const busyFree = (kind: EnemyKind, z: number): boolean => {
    waveBusy(kind, z, range);
    for (const b of busy) if (range[1] > b[0] && range[0] < b[1]) return false;
    return true;
  };
  // Sphère de rayon `rad` sans rocher (gros rochers : amplitude de dérive comprise).
  const rockFree = (x: number, y: number, z: number, rad: number): boolean => {
    for (const rk of rocks) {
      const reach = rk.r + rk.drift + rad;
      if (Math.abs(rk.z - z) > reach) continue;
      if (Math.hypot(rk.x - x, rk.y - y, rk.z - z) < reach) return false;
    }
    return true;
  };

  const tryMine = (z: number, variant: number, frac: number): WaveData | null => {
    const want = Math.round(clampN(plan.mineMin + (plan.mineMax - plan.mineMin) * frac + (rng() - 0.5) * 0.8, plan.mineMin, plan.mineMax));
    const o = 1 + rng();
    if (!gateFree(z - 40, z + 36) || !busyFree('mine', z)) return null;
    pathAt(path, z, tmp);
    const ux = Math.cos(variant * Math.PI * 2);
    const uy = Math.sin(variant * Math.PI * 2);
    const x = tmp.x + ux * o;
    const y = tmp.y + uy * o;
    if (Math.hypot(x, y) > CORRIDOR_R - 1.5) return null;
    // Passage de l'autre côté (pilote automatique, joueur qui l'évite) : sans rocher sur ±12 u
    const side = MINE_TRIGGER_R + 1.3 - o;
    for (let dz = -12; dz <= 12; dz += 6) {
      pathAt(path, z + dz, tmp);
      const px = tmp.x - ux * side;
      const py = tmp.y - uy * side;
      if (Math.hypot(px, py) > CORRIDOR_R - 1.2 || !rockFree(px, py, z + dz, SHIP_HIT_R + 0.7)) return null;
    }
    let count = 0;
    const w: WaveData = { kind: 'mine', x, y, z, count: want, variant };
    for (let k = 0; k < want; k++) {
      waveSpot(w, k, spot);
      if (Math.hypot(spot.x, spot.y) > CORRIDOR_R - 1 || !rockFree(spot.x, spot.y, spot.z, 2.4)) break;
      count++;
    }
    return count > 0 ? { kind: 'mine', x, y, z, count, variant } : null;
  };

  const trySwarm = (z: number, variant: number, frac: number): WaveData | null => {
    const count = Math.round(clampN(plan.swarmMin + (plan.swarmMax - plan.swarmMin) * frac + (rng() - 0.5), plan.swarmMin, plan.swarmMax));
    const a = rng() * Math.PI * 2;
    const m = rng() * 1.8;
    if (!gateFree(z - 14, z + 12) || !busyFree('swarm', z)) return null;
    pathAt(path, z, tmp);
    const w: WaveData = { kind: 'swarm', x: tmp.x + Math.cos(a) * m, y: tmp.y + Math.sin(a) * m, z, count, variant };
    // Membres dans le couloir, loin des rochers (ondulation et balancement compris)
    for (let k = 0; k < count; k++) {
      waveSpot(w, k, spot);
      if (Math.hypot(spot.x, spot.y) > CORRIDOR_R + 0.5) return null;
      if (!rockFree(spot.x, spot.y, spot.z, 0.75 + SWARM_UNDULATE + SWARM_SWAY + 0.6)) return null;
    }
    return w;
  };

  const tryFighter = (z: number, variant: number, frac: number): WaveData | null => {
    const count = plan.fighterMax > 1 && frac > 0.3 && rng() < 0.75 ? 2 : 1;
    const jx = (rng() - 0.5) * 3;
    const jy = (rng() - 0.5) * 2;
    // Orbe : croisée vers WaveData.z quelle que soit la vitesse (à ~10 u près ; second tir décalé), fenêtre large
    if (!gateFree(z - 75 - (count - 1) * FIGHTER_STAGGER, z + 30) || !busyFree('fighter', z)) return null;
    pathAt(path, z, tmp);
    return { kind: 'fighter', x: tmp.x * 0.6 + jx, y: tmp.y * 0.6 + jy, z, count, variant };
  };

  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const frac = (i + 0.5) / kinds.length;
    const target = zTop - slot * (i + 0.5);
    let made: WaveData | null = null;
    for (let attempt = 0; attempt < 60 && !made; attempt++) {
      const spread = attempt < 30 ? 0.5 : 0.95;
      const z = target + (rng() * 2 - 1) * slot * 0.5 * spread;
      const variant = rng();
      made = kind === 'mine' ? tryMine(z, variant, frac) : kind === 'swarm' ? trySwarm(z, variant, frac) : tryFighter(z, variant, frac);
    }
    if (!made) continue;
    waves.push(made);
    busy.push(waveBusy(made.kind, made.z, [0, 0]));
  }
  waves.sort((a, b) => b.z - a.z);
  return waves;
}

function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function buildCourse(id: CourseId): Course {
  const def = COURSES[id];
  const rng = mulberry32(def.seed);
  const gates = genGates(def, rng);
  const warpZ = gates[gates.length - 1].z - def.warpGap;
  const path: GateData[] = [{ x: 0, y: 0, z: 0 }, ...gates, { x: 0, y: 0, z: warpZ }];
  const rocks = genRocks(def, gates, path, warpZ, rng);
  // Après les rochers, avec son propre générateur : portails et rochers inchangés.
  const waves = genWaves(def, gates, path, warpZ, rocks);
  return { def, gates, rocks, path, waves, warpZ, length: -warpZ };
}
