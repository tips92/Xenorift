import * as THREE from 'three';
import { Creature, type CreatureSpec } from '../creatures';
import type { ShipState } from '../enemies';
import { smoothstep } from '../util';
import type { FlightBoss, FlightBossContext, FlightBossDef, FlightBossEvents, FlightBossState, FlightBossTarget } from './types';

// Léviathan de la nébuleuse (plan 04, étape 18) : le tube du décor, ramené à l'échelle du couloir et gris de Vide,
// 4 plaques lumineuses sur le dos puis 3 sur la queue (une touche chacune). Les orbes partent de la réserve de 3b.
// En phase 2 la queue se détend vers la Comète au passage au centre : le choc se teste par capsules, seulement
// pendant ce passage (assis sur une plaque, on ne prend rien). Quatre appels de dessin (tube, nageoires, lueurs,
// plaques), matériaux créés avant la compilation de FlightRun. Aucune allocation en combat.
// Repère : la Comète avance vers −Z ; le groupe de la créature est posé sur elle, le corps est en local devant.

/** Anneaux du tube, assez serrés pour des capsules de queue continues. */
const RINGS = 28;
/**
 * Longueur du corps (u) et distance tenue par la tête. La caméra regarde ~16 u devant la Comète (CAM_BACK 9,5) :
 * un corps épais qui commence là et file plus loin se lit comme un léviathan, pas comme un caillou sur le nez.
 */
const BODY_LEN = 32;
const DIST = 50;
const APPEAR_FROM = 150;
/** Durées (s) : arrivée, changement de phase, explosion. */
const APPEAR_TIME = 1.6;
const SHIFT_TIME = 1.3;
const DYING_TIME = 1.4;
/** Plaques : anneaux du dos (phase 1), puis de la queue (phase 2). Recopiées par f1-boss (PHASE_TOUCHES). */
const DORSAL = [7, 10, 13, 16] as const;
const TAIL_PLATES = [21, 23, 25] as const;
const PHASE_RINGS = [DORSAL, TAIL_PLATES] as const;
const MAX_PLATES = 4;
/** Rayon de touche d'une plaque (u) ; taille dessinée à l'unité, mise à l'échelle par l'instance. */
const PLATE_R = 1.55;
const PLATE_SIZE = 1.45;
/** Queue testée par capsules (anneaux TAIL_FROM .. RINGS − 1). */
const TAIL_FROM = 20;
const TAIL_SEGS = RINGS - TAIL_FROM - 1;
/** Balancement (amplitude u, rad/s) et détente de la queue vers la Comète (u), par phase. */
const SWEEP_AMP = [2, 7] as const;
const SWEEP_W = [0.55, 1.15] as const;
/** Détente max : la pointe arrive sur la Comète (−DIST + BODY_LEN + CURL ≈ 0), le ventre reste loin. */
const CURL = [0, 20] as const;
/** Passage au centre : |sin| sous ce seuil. Le choc ne compte que le cœur du passage. */
const WHIP_SIN = 0.28;
const WHIP_HIT = 0.65;
/** Orbes : première après ORB_FIRST s de combat, puis toutes les ORB_EVERY s ; écart de la seconde (phase 2). */
const ORB_FIRST = 1.4;
const ORB_EVERY = [2.6, 2.1] as const;
const ORB_SPREAD = 3.2;

const C_OPEN = [new THREE.Color('#7ee7ff'), new THREE.Color('#ff7ad4')] as const;
const C_SHUT = new THREE.Color('#2a2436');
const C_WHITE = new THREE.Color('#ffffff');

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Tracé du corps, lu par Creature.path (réécrit chaque sous-pas, jamais réalloué). */
interface Pose {
  dist: number;
  ox: number;
  oy: number;
  sweepAng: number;
  sweepAmp: number;
  curl: number;
}

function newTarget(r: number): FlightBossTarget {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r, open: false, alive: false };
}

function voidSpec(pose: Pose, light: THREE.Vector3): CreatureSpec {
  return {
    kind: 'leviathan',
    rings: RINGS,
    lag: 0.045,
    pattern: 10,
    lightScale: 0.55,
    finScale: 0.45,
    radius: (i, n) => {
      if (i < 3) return [0.9, 2.6, 3.8][i];
      const k = (i - 2) / (n - 3);
      return 1.15 + 2.7 * Math.pow(Math.max(0, 1 - Math.pow(k, 1.15)), 0.75);
    },
    path: (t, i, out) => {
      const k = i / (RINGS - 1);
      const tail = k * k;
      const z = -pose.dist + k * BODY_LEN + pose.curl * tail;
      const wave = Math.sin(t * 1.15 - k * 4.2);
      out.set(
        pose.ox + wave * (0.35 + 0.45 * k) + Math.sin(pose.sweepAng) * pose.sweepAmp * tail,
        pose.oy + Math.cos(t * 0.85 - k * 2.4) * (0.22 + 0.28 * k),
        z,
      );
    },
    light,
    // Uniforme de Vide : gris froid, taches et nageoires presque éteintes. Les plaques portent la lumière.
    body: '#4a4e5c',
    belly: '#32343e',
    rim: '#c5cedf',
    spotA: '#6e7688',
    spotB: '#8a93a8',
  };
}

/** Point (px, py, pz) à moins de `rr` du segment a → b ? Écrit le point du segment le plus proche dans `out`. */
function pointNearSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  rr: number,
  out: { x: number; y: number },
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t;
  const y = ay + dy * t;
  const z = az + dz * t;
  const ex = x - px;
  const ey = y - py;
  const ez = z - pz;
  if (ex * ex + ey * ey + ez * ez > rr * rr) return false;
  out.x = x;
  out.y = y;
  return true;
}

export class LeviathanBoss implements FlightBoss {
  readonly def: FlightBossDef;
  readonly group = new THREE.Group();
  readonly targets: readonly FlightBossTarget[];
  readonly pending: Float32Array;
  readonly touches: number;
  readonly phases = PHASE_RINGS.length;
  state: FlightBossState = 'idle';
  phase = 1;
  touchesLeft: number;
  private readonly events: FlightBossEvents;
  private readonly creature: Creature;
  private readonly plates: THREE.InstancedMesh;
  private readonly pose: Pose = { dist: DIST, ox: 0, oy: 0, sweepAng: 0, sweepAmp: 0, curl: 0 };
  private readonly anchor = new THREE.Vector3();
  /** Capsules de la queue : ax, ay, az, bx, by, bz, rayon, une par segment. */
  private readonly caps = new Float64Array(TAIL_SEGS * 7);
  private capN = 0;
  /** Anneau de chaque emplacement de plaque (la phase en cours en remplit une partie). */
  private readonly plateRing = new Int16Array(MAX_PLATES);
  private stateT = 0;
  private fightT = 0;
  private orbT = 0;
  private orbs = 0;
  private wanderT = 0;
  /** 0..1 : cœur du balayage (queue détendue, capsules actives au-dessus de WHIP_HIT). */
  private whip = 0;
  private hasPrev = false;
  private readonly hitFlash = new Float32Array(MAX_PLATES);

  constructor(def: FlightBossDef, ctx: FlightBossContext) {
    const { bin } = ctx;
    this.def = def;
    this.events = ctx.events;
    let n = 0;
    for (const rings of PHASE_RINGS) n += rings.length;
    this.touches = n;
    this.touchesLeft = n;
    const ts: FlightBossTarget[] = [];
    for (let i = 0; i < MAX_PLATES; i++) ts.push(newTarget(PLATE_R));
    this.targets = ts;
    this.pending = new Float32Array(ts.length);

    const light = new THREE.Vector3(0.2, 0.85, 0.45).normalize();
    this.creature = new Creature(voidSpec(this.pose, light), ctx.glow, bin);
    this.group.add(this.creature.group);

    const mat = bin.add(new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.plates = new THREE.InstancedMesh(bin.add(new THREE.OctahedronGeometry(1, 0)), mat, MAX_PLATES);
    this.plates.count = 0;
    this.plates.frustumCulled = false;
    this.plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.plates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PLATES * 3), 3);
    this.plates.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.plates);
    this.group.visible = false;
  }

  // ================================================================ Combat

  start(ship: Readonly<ShipState>): void {
    if (this.state !== 'idle') return;
    this.setState('appear');
    this.phase = 1;
    this.touchesLeft = this.touches;
    this.fightT = 0;
    this.orbs = 0;
    this.wanderT = 0;
    this.whip = 0;
    this.hasPrev = false;
    this.hitFlash.fill(0);
    this.pending.fill(0);
    this.pose.dist = APPEAR_FROM;
    this.pose.sweepAng = 0;
    this.pose.ox = this.pose.oy = 0;
    this.creature.group.scale.setScalar(1);
    this.armPhase();
    this.anchor.set(ship.x, ship.y, ship.z);
    this.syncPose();
    this.creature.update(0, this.anchor);
    this.placePlates(0);
    this.group.visible = true;
  }

  update(h: number, time: number, ship: Readonly<ShipState>): void {
    const st = this.state;
    if (st === 'idle' || st === 'gone' || !(h > 0)) return;
    this.stateT += h;
    for (let i = 0; i < MAX_PLATES; i++) if (this.hitFlash[i] > 0) this.hitFlash[i] = Math.max(0, this.hitFlash[i] - h * 4);
    const p = this.phase - 1;
    this.pose.sweepAng += SWEEP_W[p] * h;
    this.wanderT += h * 0.45;
    this.pose.ox = 1.4 * Math.sin(this.wanderT);
    this.pose.oy = 0.7 * Math.sin(this.wanderT * 0.8 + 0.6);
    const s = Math.sin(this.pose.sweepAng);
    this.whip = this.phase >= 2 ? Math.max(0, 1 - Math.abs(s) / WHIP_SIN) : 0;

    if (st === 'appear') {
      const k = Math.min(1, this.stateT / APPEAR_TIME);
      const e = 1 - (1 - k) * (1 - k);
      this.pose.dist = APPEAR_FROM + (DIST - APPEAR_FROM) * e;
      if (k >= 1) {
        this.setState('fight');
        this.orbT = ORB_FIRST;
        this.setOpen(true);
      }
    } else if (st === 'fight') {
      this.fightT += h;
      this.pose.dist = DIST;
      this.orbT -= h;
      if (this.orbT <= 0) {
        this.orbT += ORB_EVERY[p];
        this.fireOrbs();
      }
    } else if (st === 'shift') {
      this.pose.dist = DIST;
      if (this.stateT >= SHIFT_TIME) {
        this.armPhase();
        this.setState('fight');
        this.orbT = ORB_FIRST * 0.8;
        this.setOpen(true);
      }
    } else if (st === 'dying') {
      const k = this.stateT / DYING_TIME;
      this.creature.group.scale.setScalar(Math.max(0.001, 1 - smoothstep(0.35, 1, k)));
      if (this.stateT >= DYING_TIME) {
        this.setState('gone');
        this.group.visible = false;
        this.creature.group.scale.setScalar(1);
        for (const t of this.targets) t.alive = false;
        return;
      }
    }
    this.syncPose();
    this.anchor.set(ship.x, ship.y, ship.z);
    this.creature.update(time, this.anchor);
    this.placePlates(h);
    this.fillTail();
  }

  /** Amplitude et détente de la phase en cours. La détente ne va jusqu'à la Comète qu'au cœur du balayage. */
  private syncPose(): void {
    const p = this.phase - 1;
    this.pose.sweepAmp = SWEEP_AMP[p];
    this.pose.curl = this.phase >= 2 ? CURL[p] * (0.25 + 0.75 * this.whip) : 0;
  }

  /** Plaques de la phase en place (fermées). Vitesses remises à zéro au sous-pas suivant. */
  private armPhase(): void {
    const rings = PHASE_RINGS[this.phase - 1];
    for (let i = 0; i < MAX_PLATES; i++) {
      const t = this.targets[i];
      t.alive = i < rings.length;
      t.open = false;
      this.pending[i] = 0;
      this.plateRing[i] = i < rings.length ? rings[i] : 0;
    }
    this.hasPrev = false;
  }

  private setOpen(on: boolean): void {
    for (let i = 0; i < MAX_PLATES; i++) this.targets[i].open = on && this.targets[i].alive;
  }

  private setState(s: FlightBossState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** Plaques sur le dos de leur anneau ; vitesses par différence avec le sous-pas précédent. */
  private placePlates(h: number): void {
    const inv = this.hasPrev && h > 0 ? 1 / h : 0;
    const ax = this.anchor.x;
    const ay = this.anchor.y;
    const az = this.anchor.z;
    const sc = this.creature.group.scale.x;
    for (let i = 0; i < MAX_PLATES; i++) {
      const t = this.targets[i];
      if (!t.alive && this.hitFlash[i] <= 0) continue;
      const rad = this.creature.copyRing(this.plateRing[i], _p, _up);
      const lift = rad * 0.72 * sc;
      const x = ax + _p.x * sc + _up.x * lift;
      const y = ay + _p.y * sc + _up.y * lift;
      const z = az + _p.z * sc + _up.z * lift;
      t.vx = (x - t.x) * inv;
      t.vy = (y - t.y) * inv;
      t.vz = (z - t.z) * inv;
      t.x = x;
      t.y = y;
      t.z = z;
    }
    this.hasPrev = true;
  }

  /** Segments de la queue, en monde (choc de la Comète). */
  private fillTail(): void {
    const ax = this.anchor.x;
    const ay = this.anchor.y;
    const az = this.anchor.z;
    const sc = this.creature.group.scale.x;
    let prev = false;
    let px = 0;
    let py = 0;
    let pz = 0;
    let pr = 0;
    let n = 0;
    for (let i = TAIL_FROM; i < RINGS; i++) {
      const rad = this.creature.copyRing(i, _p, _up) * sc;
      const x = ax + _p.x * sc;
      const y = ay + _p.y * sc;
      const z = az + _p.z * sc;
      if (prev) {
        const o = n * 7;
        this.caps[o] = px;
        this.caps[o + 1] = py;
        this.caps[o + 2] = pz;
        this.caps[o + 3] = x;
        this.caps[o + 4] = y;
        this.caps[o + 5] = z;
        this.caps[o + 6] = Math.max(pr, rad);
        n++;
      }
      px = x;
      py = y;
      pz = z;
      pr = rad;
      prev = true;
    }
    this.capN = n;
  }

  /** Une orbe vers la Comète (phase 1), ou deux : la seconde décalée (phase 2). Départ : la gueule. */
  private fireOrbs(): void {
    this.creature.copyRing(2, _p, _up);
    const sc = this.creature.group.scale.x;
    const x = this.anchor.x + _p.x * sc;
    const y = this.anchor.y + _p.y * sc;
    const z = this.anchor.z + _p.z * sc;
    this.events.orb(x, y, z, 0, 0);
    if (this.phase >= 2) {
      const a = this.orbs * 2.4;
      this.events.orb(x, y, z, Math.cos(a) * ORB_SPREAD, Math.sin(a) * ORB_SPREAD);
    }
    this.orbs++;
  }

  // ================================================================ Tirs de la Comète

  shotTest(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number): number {
    const st = this.state;
    if (st === 'idle' || st === 'gone' || st === 'dying') return -1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len2 = dx * dx + dy * dy + dz * dz;
    let best = -1;
    let bestT = Infinity;
    for (let i = 0; i < MAX_PLATES; i++) {
      const t = this.targets[i];
      if (!t.alive) continue;
      const rr = t.r + r;
      if (t.z < Math.min(z0, z1) - rr || t.z > Math.max(z0, z1) + rr) continue;
      const ex0 = t.x - x0;
      const ey0 = t.y - y0;
      const ez0 = t.z - z0;
      // Même test que segmentHitsSphere, avec le paramètre du point le plus proche (la plaque la plus proche gagne)
      let u = len2 > 0 ? (ex0 * dx + ey0 * dy + ez0 * dz) / len2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = x0 + dx * u - t.x;
      const ey = y0 + dy * u - t.y;
      const ez = z0 + dz * u - t.z;
      if (ex * ex + ey * ey + ez * ez > rr * rr || u >= bestT) continue;
      bestT = u;
      best = i;
    }
    return best;
  }

  hitTarget(index: number, _damage: number): boolean {
    const t = this.targets[index];
    if (!t || !t.alive || this.state === 'dying' || this.state === 'gone') return false;
    if (!t.open) {
      this.events.armor(t.x, t.y, t.z);
      return false;
    }
    t.alive = false;
    t.open = false;
    this.pending[index] = 0;
    this.hitFlash[index] = 1;
    this.touchesLeft--;
    this.events.touched(t.x, t.y, t.z, this.touchesLeft);
    if (this.touchesLeft <= 0) this.die();
    else if (!this.phaseAlive()) this.nextPhase();
    return true;
  }

  private phaseAlive(): boolean {
    for (let i = 0; i < MAX_PLATES; i++) if (this.targets[i].alive) return true;
    return false;
  }

  private nextPhase(): void {
    this.phase = Math.min(this.phases, this.phase + 1);
    this.setState('shift');
    this.setOpen(false);
    this.events.phase(this.phase);
  }

  private die(): void {
    this.touchesLeft = 0;
    for (let i = 0; i < MAX_PLATES; i++) {
      this.targets[i].alive = false;
      this.targets[i].open = false;
    }
    this.setState('dying');
    this.creature.copyRing(2, _p, _up);
    const sc = this.creature.group.scale.x;
    this.events.defeated(this.anchor.x + _p.x * sc, this.anchor.y + _p.y * sc, this.anchor.z + _p.z * sc);
  }

  defeat(): void {
    if (this.state === 'idle' || this.state === 'dying' || this.state === 'gone') return;
    this.die();
  }

  hitsShip(ship: Readonly<ShipState>, out: { x: number; y: number }): boolean {
    if (this.state !== 'fight' || this.whip < WHIP_HIT) return false;
    const rrShip = ship.r;
    for (let i = 0; i < this.capN; i++) {
      const o = i * 7;
      const rad = this.caps[o + 6] + rrShip;
      if (
        pointNearSegment(
          ship.x,
          ship.y,
          ship.z,
          this.caps[o],
          this.caps[o + 1],
          this.caps[o + 2],
          this.caps[o + 3],
          this.caps[o + 4],
          this.caps[o + 5],
          rad,
          out,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // ================================================================ Rendu

  render(time: number, _camZ: number): void {
    const st = this.state;
    if (st === 'idle' || st === 'gone') return;
    const p = this.phase - 1;
    const dying = st === 'dying';
    const colors = (this.plates.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let n = 0;
    if (!dying) {
      for (let i = 0; i < MAX_PLATES; i++) {
        const t = this.targets[i];
        const f = this.hitFlash[i];
        if (!t.alive && f <= 0) continue;
        const size = t.alive ? (t.open ? 1 + 0.12 * Math.sin(time * 8 + i) : 0.72) : f * (1.6 - 0.6 * f);
        _e.set(time * 0.8 + i, time * 1.1, 0);
        _q.setFromEuler(_e);
        _p.set(t.x, t.y, t.z);
        _s.setScalar(PLATE_SIZE * size);
        _m.compose(_p, _q, _s);
        this.plates.setMatrixAt(n, _m);
        const gain = t.open || !t.alive ? 1.7 : 1;
        _c.copy(t.alive ? (t.open ? C_OPEN[p] : C_SHUT) : C_WHITE);
        if (t.alive && f > 0) _c.lerp(C_WHITE, f);
        colors[n * 3] = _c.r * gain;
        colors[n * 3 + 1] = _c.g * gain;
        colors[n * 3 + 2] = _c.b * gain;
        n++;
      }
    }
    this.plates.count = n;
    if (n > 0) {
      this.plates.instanceMatrix.needsUpdate = true;
      (this.plates.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.plates.count = 0;
    this.plates.dispose();
    this.group.clear();
  }
}
