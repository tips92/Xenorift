import * as THREE from 'three';
import type { CourseId } from '../core/types';
import type { CourseTheme } from './courses';
import { Creature, type CreatureSpec } from './creatures';
import { Planet, type PlanetSpec } from './planets';
import type { Rng } from './rng';
import { StarField } from './sky';
import type { Bin } from './util';

// Décor lointain de chaque parcours : étoiles, planètes, créature géante.
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

function leviathanSpec(light: THREE.Vector3): CreatureSpec {
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
      out.set(1550 * Math.sin(a), 430 + 150 * Math.sin(2 * a + 0.4), -2500 + 650 * Math.cos(a));
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

export class Environment {
  readonly group = new THREE.Group();
  private readonly stars: StarField;
  private readonly planets: Planet[] = [];
  private readonly creature: Creature;
  /** Planète autour de laquelle tourne la créature (sinon : la caméra). */
  private readonly creatureAnchor: Planet | null;

  constructor(course: CourseId, theme: CourseTheme, rng: Rng, bin: Bin, pr: number, glowMat: THREE.ShaderMaterial) {
    this.stars = new StarField(theme, rng, bin, pr);
    this.group.add(this.stars.group);
    const specs = course === 'nebula' ? NEBULA_PLANETS : ASTEROID_PLANETS;
    for (const s of specs) {
      const p = new Planet(s, bin);
      this.planets.push(p);
      this.group.add(p.group);
    }
    if (course === 'nebula') {
      this.creature = new Creature(leviathanSpec(new THREE.Vector3(-0.4, 0.8, 0.45).normalize()), glowMat, bin);
      this.creatureAnchor = null;
    } else {
      this.creature = new Creature(wormSpec(new THREE.Vector3(-0.82, 0.38, 0.46).normalize()), glowMat, bin);
      this.creatureAnchor = this.planets[1];
    }
    this.group.add(this.creature.group);
  }

  setPixelRatio(pr: number): void {
    this.stars.setPixelRatio(pr);
  }

  update(dt: number, time: number, camPos: THREE.Vector3, moving: boolean): void {
    this.stars.update(time, camPos);
    for (const p of this.planets) p.update(dt, time, camPos, moving);
    this.creature.update(time, this.creatureAnchor ? this.creatureAnchor.group.position : camPos);
  }
}
