import * as THREE from 'three';
import type { ShipState } from '../enemies';
import { segmentHitsSphere, smoothstep } from '../util';
import type { FlightBoss, FlightBossContext, FlightBossDef, FlightBossEvents, FlightBossState, FlightBossTarget } from './types';

// Boss de vol PROVISOIRE (plan 04, étape 17), à la place du léviathan (étape 18) : un noyau blindé qui fuit devant
// la Comète à distance fixe en dérivant dans le couloir, entouré d'un rail où tournent ses cibles (3 puis 3, une
// touche chacune : 6 touches, 2 phases égales comme les crans de la barre de boss), et qui lance des orbes de la
// réserve de 3b (une, puis deux en phase 2). Le rail est plus large que ce que le guidage des tirs rattrape depuis
// l'axe du noyau : il faut s'aligner sur une cible. Trois appels de dessin (noyau, cibles, rail), matériaux créés
// avant la compilation de FlightRun ; aucune allocation en combat. Repère : la Comète avance vers −Z ; le boss reste
// DIST u devant elle.

/** Distance tenue devant la Comète (u), à ±DIST_SWAY près ; l'arrivée part de APPEAR_FROM. */
const DIST = 42;
const DIST_SWAY = 2.5;
const APPEAR_FROM = 170;
/** Durées (s) : arrivée, changement de phase, explosion. */
const APPEAR_TIME = 1.6;
const SHIFT_TIME = 1.3;
const DYING_TIME = 1.4;
/**
 * Noyau (blindage) et rail des cibles (u). Rail à 7 u : depuis l'axe du noyau, une cible est à ≈ 9,5° (guidage des
 * tirs : 6°) ; noyau en dérive + rail restent dans le couloir (4,9 + 7 < CORRIDOR_R).
 */
const CORE_R = 3.4;
const RING_R = 7;
/** Rayon de touche d'une cible (u) ; taille dessinée. */
const TARGET_R = 1.6;
const TARGET_SIZE = 1.9;
/** Cibles de chaque phase (une touche chacune). */
const PHASE_TARGETS = [3, 3] as const;
const MAX_TARGETS = 3;
/** Rotation du rail (rad/s) et dérive du noyau dans le couloir (amplitudes u, pulsations rad/s), par phase. */
const SPIN = [0.55, 0.85] as const;
const WANDER_X = 4.2;
const WANDER_Y = 2.6;
const WANDER_W = [0.37, 0.52] as const;
/** Orbes : première après ORB_FIRST s de combat, puis toutes les ORB_EVERY s ; écart de la seconde orbe (phase 2). */
const ORB_FIRST = 1.4;
const ORB_EVERY = [2.6, 2.1] as const;
const ORB_SPREAD = 3.2;

const C_OPEN = [new THREE.Color('#ffb030'), new THREE.Color('#ff5a3a')] as const;
const C_SHUT = new THREE.Color('#3a1f5c');
const C_WHITE = new THREE.Color('#ffffff');
const C_EMISSIVE = [new THREE.Color('#ff2bd6'), new THREE.Color('#ff6a2a')] as const;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function newTarget(r: number): FlightBossTarget {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r, open: false, alive: false };
}

export class ProvisionalBoss implements FlightBoss {
  readonly def: FlightBossDef;
  readonly group = new THREE.Group();
  /** Cibles du rail (0..MAX_TARGETS − 1), puis le noyau (toujours fermé : blindage). */
  readonly targets: readonly FlightBossTarget[];
  readonly pending: Float32Array;
  readonly touches: number;
  readonly phases = PHASE_TARGETS.length;
  state: FlightBossState = 'idle';
  phase = 1;
  touchesLeft: number;
  private readonly events: FlightBossEvents;
  private readonly core: THREE.Mesh;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly marks: THREE.InstancedMesh;
  private readonly rail: THREE.Mesh;
  private readonly railMat: THREE.MeshBasicMaterial;
  private readonly coreIx = MAX_TARGETS;
  private stateT = 0;
  private fightT = 0;
  private orbT = 0;
  private orbs = 0;
  /** Angle du rail, horloge de la dérive. */
  private ang = 0;
  private wanderT = 0;
  /** Centre du noyau ; distance à la Comète. */
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private dist = APPEAR_FROM;
  /** Vitesses calculées au sous-pas précédent connues (sinon nulles). */
  private hasPrev = false;
  /** Éclat du noyau (touche, phase) et des cibles touchées. */
  private flash = 0;
  private readonly hitFlash = new Float32Array(MAX_TARGETS);
  private scale = 0;

  constructor(def: FlightBossDef, ctx: FlightBossContext) {
    const { env, bin } = ctx;
    this.def = def;
    this.events = ctx.events;
    let n = 0;
    for (const k of PHASE_TARGETS) n += k;
    this.touches = n;
    this.touchesLeft = n;
    const ts: FlightBossTarget[] = [];
    for (let i = 0; i < MAX_TARGETS; i++) ts.push(newTarget(TARGET_R));
    ts.push(newTarget(CORE_R));
    this.targets = ts;
    this.pending = new Float32Array(ts.length);

    // Noyau : mêmes réglages que la bulle du cockpit (même programme), sombre, veiné de magenta par l'émission
    this.coreMat = bin.add(
      new THREE.MeshStandardMaterial({
        color: '#1a0b2e',
        emissive: C_EMISSIVE[0],
        emissiveIntensity: 0.45,
        roughness: 0.32,
        metalness: 0.55,
        envMap: env,
        envMapIntensity: 1.1,
      }),
    );
    this.core = new THREE.Mesh(bin.add(new THREE.IcosahedronGeometry(CORE_R, 1)), this.coreMat);

    // Cibles : un InstancedMesh (couleur par instance : exposée, fermée, éclat)
    const marksMat = bin.add(new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.marks = new THREE.InstancedMesh(bin.add(new THREE.OctahedronGeometry(1, 0)), marksMat, MAX_TARGETS);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.marks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TARGETS * 3), 3);
    this.marks.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // Rail des cibles : anneau additif autour du noyau
    this.railMat = bin.add(
      new THREE.MeshBasicMaterial({
        color: '#ff5ae0',
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.rail = new THREE.Mesh(bin.add(new THREE.TorusGeometry(RING_R, 0.12, 6, 72)), this.railMat);

    this.group.add(this.core, this.marks, this.rail);
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
    this.ang = 0;
    this.wanderT = 0;
    this.dist = APPEAR_FROM;
    this.hasPrev = false;
    this.flash = 0;
    this.hitFlash.fill(0);
    this.pending.fill(0);
    this.armPhase();
    this.place(ship, 0);
    this.group.visible = true;
  }

  update(h: number, _time: number, ship: Readonly<ShipState>): void {
    const st = this.state;
    if (st === 'idle' || st === 'gone' || !(h > 0)) return;
    this.stateT += h;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - h * 3);
    for (let i = 0; i < MAX_TARGETS; i++) if (this.hitFlash[i] > 0) this.hitFlash[i] = Math.max(0, this.hitFlash[i] - h * 4);
    const p = this.phase - 1;
    this.ang += SPIN[p] * h;
    this.wanderT += h * WANDER_W[p];

    if (st === 'appear') {
      const k = Math.min(1, this.stateT / APPEAR_TIME);
      const e = 1 - (1 - k) * (1 - k);
      this.dist = APPEAR_FROM + (DIST - APPEAR_FROM) * e;
      this.scale = smoothstep(0, 0.7, k);
      if (k >= 1) {
        this.setState('fight');
        this.orbT = ORB_FIRST;
        this.setOpen(true);
      }
    } else if (st === 'fight') {
      this.fightT += h;
      this.dist = DIST + DIST_SWAY * Math.sin(this.fightT * 0.6);
      this.orbT -= h;
      if (this.orbT <= 0) {
        this.orbT += ORB_EVERY[p];
        this.fireOrbs();
      }
    } else if (st === 'shift') {
      this.dist = DIST + DIST_SWAY * Math.sin(this.fightT * 0.6);
      if (this.stateT >= SHIFT_TIME) {
        this.armPhase();
        this.setState('fight');
        this.orbT = ORB_FIRST * 0.8;
        this.setOpen(true);
      }
    } else if (st === 'dying') {
      this.scale = 1 - smoothstep(0.55, 1, this.stateT / DYING_TIME);
      if (this.stateT >= DYING_TIME) {
        this.setState('gone');
        this.group.visible = false;
        for (const t of this.targets) t.alive = false;
        return;
      }
    }
    this.place(ship, h);
  }

  /** Centre du noyau et cibles sur le rail ; vitesses par différence avec le sous-pas précédent. */
  private place(ship: Readonly<ShipState>, h: number): void {
    const w = this.wanderT;
    this.cx = WANDER_X * Math.sin(w);
    this.cy = WANDER_Y * Math.sin(w * 0.77 + 1.1);
    this.cz = ship.z - this.dist;
    const n = PHASE_TARGETS[this.phase - 1];
    const inv = this.hasPrev && h > 0 ? 1 / h : 0;
    for (let i = 0; i <= MAX_TARGETS; i++) {
      const t = this.targets[i];
      let x = this.cx;
      let y = this.cy;
      if (i < MAX_TARGETS) {
        const a = this.ang + (i * Math.PI * 2) / n;
        x += Math.cos(a) * RING_R;
        y += Math.sin(a) * RING_R;
      }
      t.vx = (x - t.x) * inv;
      t.vy = (y - t.y) * inv;
      t.vz = (this.cz - t.z) * inv;
      t.x = x;
      t.y = y;
      t.z = this.cz;
    }
    this.hasPrev = true;
  }

  /**
   * Cibles de la phase en cours en place (fermées), les autres retirées. Leur écart sur le rail change avec leur
   * nombre : vitesses remises à zéro au sous-pas suivant (pas de saut pris pour une vitesse par la visée).
   */
  private armPhase(): void {
    const n = PHASE_TARGETS[this.phase - 1];
    for (let i = 0; i < MAX_TARGETS; i++) {
      const t = this.targets[i];
      t.alive = i < n;
      t.open = false;
      this.pending[i] = 0;
    }
    const core = this.targets[this.coreIx];
    core.alive = true;
    core.open = false;
    this.hasPrev = false;
  }

  private setOpen(on: boolean): void {
    for (let i = 0; i < MAX_TARGETS; i++) this.targets[i].open = on && this.targets[i].alive;
  }

  private setState(s: FlightBossState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** Une orbe vers la Comète (phase 1), ou deux : la seconde décalée, tournée d'un tir à l'autre (phase 2). */
  private fireOrbs(): void {
    const z = this.cz + CORE_R;
    this.events.orb(this.cx, this.cy, z, 0, 0);
    if (this.phase >= 2) {
      const a = this.orbs * 2.4;
      this.events.orb(this.cx, this.cy, z, Math.cos(a) * ORB_SPREAD, Math.sin(a) * ORB_SPREAD);
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
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.alive) continue;
      // Taille dessinée : le boss grandit pendant son arrivée
      const rr = t.r * this.scale + r;
      if (t.z < Math.min(z0, z1) - rr || t.z > Math.max(z0, z1) + rr) continue;
      if (!segmentHitsSphere(x0, y0, z0, x1, y1, z1, t.x, t.y, t.z, rr)) continue;
      const k = len2 > 0 ? ((t.x - x0) * dx + (t.y - y0) * dy + (t.z - z0) * dz) / len2 : 0;
      if (k < bestT) {
        bestT = k;
        best = i;
      }
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
    // Une touche : la cible tombe (décision 20 : une touche par cible exposée, quelle que soit l'arme)
    t.alive = false;
    t.open = false;
    this.pending[index] = 0;
    this.hitFlash[index] = 1;
    this.touchesLeft--;
    this.flash = 1;
    this.events.touched(t.x, t.y, t.z, this.touchesLeft);
    if (this.touchesLeft <= 0) this.die();
    else if (!this.phaseAlive()) this.nextPhase();
    return true;
  }

  /** Une cible de la phase en cours est-elle encore en place ? */
  private phaseAlive(): boolean {
    for (let i = 0; i < MAX_TARGETS; i++) if (this.targets[i].alive) return true;
    return false;
  }

  private nextPhase(): void {
    this.phase = Math.min(this.phases, this.phase + 1);
    this.setState('shift');
    this.setOpen(false);
    this.flash = 1.4;
    this.events.phase(this.phase);
  }

  private die(): void {
    this.touchesLeft = 0;
    for (let i = 0; i < MAX_TARGETS; i++) {
      this.targets[i].alive = false;
      this.targets[i].open = false;
    }
    this.targets[this.coreIx].open = false;
    this.setState('dying');
    this.flash = 2;
    this.events.defeated(this.cx, this.cy, this.cz);
  }

  defeat(): void {
    if (this.state === 'idle' || this.state === 'dying' || this.state === 'gone') return;
    this.die();
  }

  hitsShip(ship: Readonly<ShipState>, out: { x: number; y: number }): boolean {
    const st = this.state;
    if (st === 'idle' || st === 'gone' || st === 'dying') return false;
    const dx = ship.x - this.cx;
    const dy = ship.y - this.cy;
    const dz = ship.z - this.cz;
    const rr = CORE_R * this.scale + ship.r;
    if (dx * dx + dy * dy + dz * dz >= rr * rr) return false;
    out.x = this.cx;
    out.y = this.cy;
    return true;
  }

  // ================================================================ Rendu

  render(time: number, _camZ: number): void {
    const st = this.state;
    if (st === 'idle' || st === 'gone') return;
    const p = this.phase - 1;
    const sc = Math.max(0.001, this.scale);
    // Noyau : rotation lente, pulsation, éclat aux touches ; tremble pendant son explosion
    const dying = st === 'dying';
    const jitter = dying ? 0.35 * Math.sin(time * 53) : 0;
    this.core.position.set(this.cx + jitter, this.cy - jitter, this.cz);
    this.core.rotation.set(time * 0.31, time * 0.47, 0);
    this.core.scale.setScalar(sc * (1 + 0.04 * Math.sin(time * 5) + 0.12 * Math.min(1, this.flash)));
    this.coreMat.emissive.copy(C_EMISSIVE[p]);
    this.coreMat.emissiveIntensity = 0.45 + 0.25 * Math.sin(time * 3.1) + 1.6 * this.flash + (dying ? 1.5 : 0);

    // Rail : suit le noyau et tourne avec les cibles
    this.rail.visible = !dying;
    this.rail.position.set(this.cx, this.cy, this.cz);
    this.rail.rotation.set(0, 0, this.ang);
    this.rail.scale.setScalar(sc);
    this.railMat.opacity = st === 'fight' ? 0.55 : 0.25;

    // Cibles en place : exposées (vives, couleur de la phase), fermées (sombres) ; touchée : éclat blanc qui grossit
    // puis se résorbe
    const colors = (this.marks.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX_TARGETS; i++) {
      const t = this.targets[i];
      const f = this.hitFlash[i];
      if (!t.alive && f <= 0) continue;
      const size = t.alive ? (t.open ? 1 + 0.15 * Math.sin(time * 9 + i * 1.7) : 0.8) : f * (1.8 - 0.8 * f);
      _e.set(time * 1.3 + i, time * 2.1 + i * 0.5, 0);
      _q.setFromEuler(_e);
      _p.set(t.x, t.y, t.z);
      _s.setScalar(TARGET_SIZE * sc * size);
      _m.compose(_p, _q, _s);
      this.marks.setMatrixAt(n, _m);
      const gain = t.open || !t.alive ? 1.6 : 1;
      _c.copy(t.alive ? (t.open ? C_OPEN[p] : C_SHUT) : C_WHITE);
      if (t.alive && f > 0) _c.lerp(C_WHITE, f);
      colors[n * 3] = _c.r * gain;
      colors[n * 3 + 1] = _c.g * gain;
      colors[n * 3 + 2] = _c.b * gain;
      n++;
    }
    this.marks.count = n;
    if (n > 0) {
      this.marks.instanceMatrix.needsUpdate = true;
      (this.marks.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.marks.count = 0;
    this.marks.dispose();
    this.group.clear();
  }
}
