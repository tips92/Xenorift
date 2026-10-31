import * as THREE from 'three';
import type { CourseId } from '../core/types';
import type { CourseTheme, Vec3Tuple } from './courses';
import { Creature, type CreatureSpec } from './creatures';
import { Planet, type PlanetSpec } from './planets';
import type { Rng } from './rng';
import { StarField } from './sky';
import type { Bin } from './util';

// Décor lointain de chaque parcours (SCENERY) : étoiles, planètes, créature géante.
// Tout est placé par rapport à la caméra (à « l'infini ») : aucun effet de parallaxe parasite.

const NEBULA_PLANETS: PlanetSpec[] = [
  {
    // Xéna, la planète jungle que l'on quitte (derrière le vaisseau au départ)
    kind: 'jungle',
    radius: 1100,
    colors: ['#2a1458', '#0a6e6c', '#18d9a8', '#ff4fd8'],
    atmosphere: '#3dffd2',
    atmStrength: 1.1,
    night: '#3dffe0',
    light: [0.85, 0.5, 0.25],
    tiltX: 0.2,
    tiltZ: 0.35,
    spin: 0.006,
    seed: 3.1,
    offset: [-1650, -420, 2350],
    drift: [-8, -4, 42],
  },
  {
    // Krator, la lune de destination, petite et lointaine devant
    kind: 'moon',
    radius: 240,
    colors: ['#b9b0d0', '#ece6fa', '#5a5378', '#ff9a2e'],
    atmosphere: '#c8b8ff',
    atmStrength: 0.45,
    night: '#ff9a2e',
    light: [-0.55, 0.45, 0.7],
    tiltX: 0.1,
    tiltZ: -0.2,
    spin: 0.01,
    seed: 7.7,
    offset: [-1150, 520, -3600],
    drift: [0, 0, 5],
  },
  {
    // La géante à anneaux, minuscule à l'horizon (annonce du vol 2)
    kind: 'gas',
    radius: 170,
    colors: ['#e8b070', '#9a5ac8', '#f2dcc0', '#c0502a'],
    atmosphere: '#ffb070',
    atmStrength: 0.7,
    night: '#000000',
    light: [-0.7, 0.4, 0.6],
    tiltX: 0.4,
    tiltZ: 0.3,
    spin: 0.02,
    seed: 2.4,
    offset: [2500, 780, -5300],
    drift: [0, 0, 0],
    ring: { inner: 1.35, outer: 2.3, colorA: '#f2dcc0', colorB: '#b27adc' },
  },
];

const ASTEROID_PLANETS: PlanetSpec[] = [
  {
    // Krator que l'on quitte
    kind: 'moon',
    radius: 900,
    colors: ['#b9b0d0', '#ece6fa', '#4a4466', '#ff9a2e'],
    atmosphere: '#c8b8ff',
    atmStrength: 0.6,
    night: '#ff9a2e',
    light: [0.8, 0.45, 0.3],
    tiltX: 0.1,
    tiltZ: 0.25,
    spin: 0.005,
    seed: 5.3,
    offset: [-1500, -520, 2250],
    drift: [-6, -3, 38],
  },
  {
    // La géante à anneaux, autour de laquelle tourne le ver cosmique
    kind: 'gas',
    radius: 760,
    colors: ['#e8b070', '#8a4ac0', '#f6e2c4', '#c0502a'],
    atmosphere: '#ffb070',
    atmStrength: 1.0,
    night: '#000000',
    light: [-0.82, 0.38, 0.46],
    tiltX: 0.36,
    tiltZ: 0.32,
    spin: 0.012,
    seed: 2.4,
    offset: [1350, 430, -3500],
    drift: [0, 0, 6],
    ring: { inner: 1.32, outer: 2.35, colorA: '#f6e2c4', colorB: '#a070e0' },
  },
];

/** 0 : orbite lointaine d'origine ; 1 : plongeon vers le portail (dernier quart du parcours). */
interface Approach {
  near: number;
}

function leviathanSpec(light: THREE.Vector3, approach: Approach): CreatureSpec {
  const W = (2 * Math.PI) / 84;
  return {
    kind: 'leviathan',
    rings: 44,
    lag: 0.21,
    pattern: 20,
    radius: (i, n) => {
      if (i < 4) return [14, 34, 48, 57][i];
      const k = (i - 4) / (n - 5);
      return 3 + 59 * Math.pow(Math.max(0, 1 - Math.pow(k, 1.5)), 0.9);
    },
    path: (t, i, out) => {
      const a = W * t + 4.2;
      const k = approach.near;
      // k = 0 : la même orbite qu'avant l'approche (captures du décor inchangées au départ)
      if (k <= 0) {
        out.set(1550 * Math.sin(a), 430 + 150 * Math.sin(2 * a + 0.4), -2500 + 650 * Math.cos(a));
      } else {
        const rad = 1550 + (340 - 1550) * k;
        const y0 = 430 + (70 - 430) * k;
        const yAmp = 150 + (36 - 150) * k;
        const z0 = -2500 + (-520 - -2500) * k;
        const zAmp = 650 + (160 - 650) * k;
        const swallow = k > 0.8 ? (k - 0.8) / 0.2 : 0;
        const s = swallow * swallow;
        out.set(
          rad * Math.sin(a) * (1 - s),
          (y0 + yAmp * Math.sin(2 * a + 0.4)) * (1 - 0.8 * s),
          (z0 + zAmp * Math.cos(a)) * (1 - s) - 180 * s,
        );
      }
      out.y += 16 * Math.sin(i * 0.2 - t * 1.4) * Math.min(1, i / 8);
    },
    light,
    body: '#1d1660',
    belly: '#2c6a9a',
    rim: '#3dffe0',
    spotA: '#3dffe0',
    spotB: '#ff5ae0',
  };
}

function wormSpec(light: THREE.Vector3): CreatureSpec {
  const W = (2 * Math.PI) / 46;
  const tilt = 0.6;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const roll = -0.35;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return {
    kind: 'worm',
    rings: 56,
    lag: 0.17,
    pattern: 24,
    radius: (i, n) => {
      if (i < 3) return [52, 78, 86][i];
      return 22 + 60 * Math.pow(Math.max(0, 1 - (i - 3) / (n - 4)), 0.6);
    },
    path: (t, i, out) => {
      const a = W * t + 0.6;
      const R = 1300 + 70 * Math.sin(i * 0.5 - t * 1.4);
      const x = R * Math.cos(a);
      const z = R * Math.sin(a);
      const y = 90 * Math.sin(i * 0.33 - t * 1.2);
      // Orbite inclinée (autour de X puis de Z)
      const y1 = y * ct - z * st;
      const z1 = y * st + z * ct;
      out.set(x * cr - y1 * sr, x * sr + y1 * cr, z1);
    },
    light,
    body: '#4a3c4c',
    belly: '#2a1c30',
    rim: '#ff9a50',
    spotA: '#ff8a1a',
    spotB: '#ffe08a',
  };
}

/** Décor d'un parcours, hors étoiles (thème du parcours). */
interface Scenery {
  planets: readonly PlanetSpec[];
  /** Créature géante, selon la direction de sa lumière. `approach` : le léviathan de la nébuleuse (ignoré ailleurs). */
  creature(light: THREE.Vector3, approach: Approach): CreatureSpec;
  /** Direction de la lumière de la créature (normalisée à la construction). */
  creatureLight: Vec3Tuple;
  /** Rang dans planets de la planète autour de laquelle tourne la créature ; null : la caméra. */
  anchor: number | null;
}

/** Par parcours : un parcours sans décor fait échouer tsc. */
const SCENERY: Record<CourseId, Scenery> = {
  nebula: { planets: NEBULA_PLANETS, creature: leviathanSpec, creatureLight: [-0.4, 0.8, 0.45], anchor: null },
  // Le ver tourne autour de la géante à anneaux. L'approche ne le concerne pas.
  asteroids: {
    planets: ASTEROID_PLANETS,
    creature: (light) => wormSpec(light),
    creatureLight: [-0.82, 0.38, 0.46],
    anchor: 1,
  },
};

export class Environment {
  readonly group = new THREE.Group();
  private readonly stars: StarField;
  private readonly planets: Planet[] = [];
  private readonly creature: Creature;
  /** Planète autour de laquelle tourne la créature (sinon : la caméra). */
  private readonly creatureAnchor: Planet | null;
  /** Approche du léviathan de la nébuleuse (lue par son tracé). */
  private readonly approach: Approach = { near: 0 };

  constructor(course: CourseId, theme: CourseTheme, rng: Rng, bin: Bin, pr: number, glowMat: THREE.ShaderMaterial) {
    this.stars = new StarField(theme, rng, bin, pr);
    this.group.add(this.stars.group);
    const sc = SCENERY[course];
    for (const s of sc.planets) {
      const p = new Planet(s, bin);
      this.planets.push(p);
      this.group.add(p.group);
    }
    const l = sc.creatureLight;
    this.creature = new Creature(sc.creature(new THREE.Vector3(l[0], l[1], l[2]).normalize(), this.approach), glowMat, bin);
    this.creatureAnchor = sc.anchor === null ? null : this.planets[sc.anchor];
    this.group.add(this.creature.group);
  }

  /** 0 loin, 1 plongeon vers le portail. Sans effet visible sur le ver (il ignore `approach`). */
  setApproach(near: number): void {
    this.approach.near = near < 0 ? 0 : near > 1 ? 1 : near;
  }

  /**
   * Le boss de vol dessine son propre tube : on cache celui du décor (un seul tube reconstruit par image).
   * Reste caché après le combat (le léviathan est dans le couloir, plus à l'horizon).
   */
  setCreatureShown(on: boolean): void {
    this.creature.group.visible = on;
  }

  setPixelRatio(pr: number): void {
    this.stars.setPixelRatio(pr);
  }

  update(dt: number, time: number, camPos: THREE.Vector3, moving: boolean): void {
    this.stars.update(time, camPos);
    for (const p of this.planets) p.update(dt, time, camPos, moving);
    if (this.creature.group.visible) this.creature.update(time, this.creatureAnchor ? this.creatureAnchor.group.position : camPos);
  }
}
