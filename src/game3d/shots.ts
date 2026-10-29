import * as THREE from 'three';
import { createShipGunStats, resolveShipGun, type ShipGunStats } from '../core/shipGuns';
import { OVERHEAT_RECOVER_AT } from '../core/weapons';
import type { AsteroidField } from './asteroids';
import type { EnemyField } from './enemies';
import type { Bin } from './util';

// Tir de la Comète (docs/plans/03-hangar.md, 3b) : canon (cadence, chauffe, surchauffe ; fiches de
// core/shipGuns.ts), visée (cible la plus proche dans un cône devant la Comète), projectiles en InstancedMesh
// (un seul appel de dessin) et impacts contre les astéroïdes et les ennemis. Aucune allocation en vol.
// Repère : la Comète avance vers −Z ; le cône de visée a pour axe −Z (le lacet du modèle est décoratif).

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);
const _col = new THREE.Color();
const _rc = new THREE.Vector3();

/** Rayon d'un projectile pour les impacts (ajouté au rayon de la cible). */
export const SHOT_R = 0.35;
/** Projectiles simultanés au plus (mitrailleuse niveau 3 : ~13 tirs/s × ~0,5 s de vie, avec marge). */
export const SHOT_CAP = 48;

// ---------------------------------------------------------------- Visée

export type AimKind = 'none' | 'rock' | 'enemy';

/** Cible de la visée, objet réutilisé (remis à zéro par clearAim à chaque sous-pas). */
export interface AimTarget {
  kind: AimKind;
  /** Rocher : index dans AsteroidField.rocks ; ennemi : emplacement dans EnemyField (EnemyField.kindOf). −1 sans cible. */
  index: number;
  /** Distance centre à centre depuis la Comète (u) ; Infinity sans cible. */
  dist: number;
  /** Position de la cible. */
  x: number;
  y: number;
  z: number;
  /** Vitesse de la cible (u/s ; rocher : 0), pour viser en avance. */
  vx: number;
  vy: number;
  vz: number;
}

export function createAimTarget(): AimTarget {
  return { kind: 'none', index: -1, dist: Infinity, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
}

/** Plus de cible. */
export function clearAim(t: AimTarget): void {
  t.kind = 'none';
  t.index = -1;
  t.dist = Infinity;
  t.vx = t.vy = t.vz = 0;
}

/**
 * Point (dx, dy, dz) relatif à la Comète : distance s'il est devant elle, dans le cône d'axe −Z de demi-angle
 * acos(cosCone) et à moins de `range` ; sinon −1. Sert à AsteroidField.aim et EnemyField.aim.
 */
export function inAimCone(dx: number, dy: number, dz: number, cosCone: number, range: number): number {
  if (dz >= 0) return -1;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d > range || -dz < d * cosCone) return -1;
  return d;
}

/** Recopie la cible `src` dans `dst` (sans allocation). */
export function copyAim(dst: AimTarget, src: Readonly<AimTarget>): void {
  dst.kind = src.kind;
  dst.index = src.index;
  dst.dist = src.dist;
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.vz = src.vz;
}

/** Propose une cible : retenue si elle est plus proche que la cible actuelle de `t`. */
export function offerAim(
  t: AimTarget,
  kind: Exclude<AimKind, 'none'>,
  index: number,
  dist: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
): void {
  if (dist >= t.dist) return;
  t.kind = kind;
  t.index = index;
  t.dist = dist;
  t.x = x;
  t.y = y;
  t.z = z;
  t.vx = vx;
  t.vy = vy;
  t.vz = vz;
}

/**
 * Direction unitaire du tir, écrite dans `out` : vers la cible visée en avance (projectile de vitesse ABSOLUE
 * `speed`, parti de (fromX, fromY, fromZ)), écartée de l'axe −Z d'au plus `maxRad` (SHIP_AIM.homingDeg) ;
 * sans cible : droit devant (0, 0, −1).
 */
export function aimDirection(
  fromX: number,
  fromY: number,
  fromZ: number,
  target: Readonly<AimTarget>,
  speed: number,
  maxRad: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (target.kind === 'none' || !(speed > 0)) return out.set(0, 0, -1);
  const px = target.x - fromX;
  const py = target.y - fromY;
  const pz = target.z - fromZ;
  // Visée en avance : temps de vol estimé puis affiné deux fois (cible à vitesse constante)
  let t = Math.sqrt(px * px + py * py + pz * pz) / speed;
  for (let i = 0; i < 2; i++) {
    const qx = px + target.vx * t;
    const qy = py + target.vy * t;
    const qz = pz + target.vz * t;
    t = Math.sqrt(qx * qx + qy * qy + qz * qz) / speed;
  }
  let dx = px + target.vx * t;
  let dy = py + target.vy * t;
  let dz = pz + target.vz * t;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return out.set(0, 0, -1);
  dx /= len;
  dy /= len;
  dz /= len;
  // Écart à l'axe −Z borné à maxRad (vecteur unitaire : sin de l'écart = composante latérale)
  const lat = Math.sqrt(dx * dx + dy * dy);
  const maxLat = Math.sin(maxRad);
  if (dz < 0 && lat <= maxLat) return out.set(dx, dy, dz);
  if (lat < 1e-9) return out.set(0, 0, -1);
  const k = maxLat / lat;
  return out.set(dx * k, dy * k, -Math.cos(maxRad));
}

/**
 * Distance minimale (u) entre un projectile parti de (fromX, fromY, fromZ), direction unitaire `dir`, vitesse
 * ABSOLUE `speed`, et la cible (à sa vitesse), pendant les `life` secondes de vie du projectile. Comparée au
 * rayon de la cible + SHOT_R : un tir ne réserve ses dégâts sur la cible, et le pilote automatique ne tient TIR,
 * que s'il peut toucher (le guidage est borné à homingDeg, la cible peut être jusqu'à coneDeg de l'axe).
 */
export function shotMiss(
  fromX: number,
  fromY: number,
  fromZ: number,
  dir: Readonly<THREE.Vector3>,
  speed: number,
  target: Readonly<AimTarget>,
  life: number,
): number {
  const px = target.x - fromX;
  const py = target.y - fromY;
  const pz = target.z - fromZ;
  // Mouvement relatif de la cible vue du projectile
  const wx = target.vx - dir.x * speed;
  const wy = target.vy - dir.y * speed;
  const wz = target.vz - dir.z * speed;
  const w2 = wx * wx + wy * wy + wz * wz;
  let t = w2 > 0 ? -(px * wx + py * wy + pz * wz) / w2 : 0;
  t = t < 0 ? 0 : t > life ? life : t;
  const ex = px + wx * t;
  const ey = py + wy * t;
  const ez = pz + wz * t;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

// ---------------------------------------------------------------- Canon et énergie

/**
 * Canon de la Comète et jauge d'énergie partagée avec le turbo (SHIP_ENERGY de core/shipGuns.ts), sur le
 * modèle de Gun (game2d/engine/weapons.ts) : chauffe par tir et par seconde de turbo, refroidissement après
 * coolDelayMs sans tirer ni pousser (immédiat en surchauffe), surchauffe à 1 : ni tir ni turbo jusqu'à
 * OVERHEAT_RECOVER_AT (30 %). Les bouches tirent à tour de rôle. À chaque sous-pas de vol : boost puis step.
 */
export class ShipGun {
  /** Jauge d'énergie (chauffe), 0..1. */
  heat = 0;
  overheated = false;
  /**
   * Passé en surchauffe (tir ou turbo) depuis le dernier boost (son 'overheat', une fois ; pas de message : le
   * HUD l'affiche). Remis à faux par boost, appelé en premier à chaque sous-pas de vol.
   */
  justOverheated = false;
  /** Turbo en marche pendant ce sous-pas (boost). */
  boosting = false;
  /** Valeurs effectives (niveau du hangar, portée du parcours, module Turbo). */
  readonly stats: ShipGunStats = createShipGunStats();
  /** Prochaine bouche (0..stats.muzzles − 1). */
  private muzzle = 0;
  private cooldownMs = 0;
  /** Depuis le dernier tir ou la dernière poussée du turbo (refroidissement hors surchauffe). */
  private sinceUseMs = 1e6;

  /**
   * `level` : hooks.loadout.ship.gunLevel (0..3) ; `cruiseSpeed` : CourseDef.speed (portée) ; module Turbo
   * (ShipLoadout) : `boostHeatMul` multiplie la chauffe du turbo, `coolMul` le refroidissement de la jauge.
   */
  constructor(level: number, cruiseSpeed: number, boostHeatMul = 1, coolMul = 1) {
    resolveShipGun(level, cruiseSpeed, this.stats);
    this.stats.boostHeat *= boostHeatMul;
    this.stats.coolRate *= coolMul;
  }

  /** Énergie froide, canon prêt à tirer, première bouche (aide DEV : essais reproductibles). */
  cool(): void {
    this.reset();
  }

  /** Bouche du prochain tir (vérification de la visée avant step). */
  get nextMuzzle(): number {
    return this.muzzle;
  }

  /**
   * Turbo pendant un sous-pas de `h` secondes, appelé en premier à chaque sous-pas de vol (avant step) : il
   * pousse si `wants` et hors surchauffe, et chauffe la jauge (stats.boostHeat par seconde) ; il se coupe au
   * sous-pas où la jauge surchauffe. Renvoie boosting.
   */
  boost(h: number, wants: boolean): boolean {
    this.justOverheated = false;
    this.boosting = wants && !this.overheated;
    if (!this.boosting) return false;
    this.sinceUseMs = 0;
    this.heat += this.stats.boostHeat * h;
    if (this.heat >= 1 - 1e-6) this.overheat();
    return this.boosting;
  }

  /**
   * Un sous-pas de `h` secondes : refroidissement, puis tir si `wants` (cadence écoulée, pas en surchauffe).
   * Renvoie la bouche qui tire maintenant (0..stats.muzzles − 1), ou −1. Chauffe ajoutée par tir.
   */
  step(h: number, wants: boolean): number {
    const st = this.stats;
    const dtMs = h * 1000;
    if (this.cooldownMs > 0) this.cooldownMs -= dtMs;
    this.sinceUseMs += dtMs;

    // Refroidissement : immédiat en surchauffe, sinon après une pause sans tirer ni pousser (plus longue que la
    // cadence : le tir continu ne refroidit jamais ; boost remet la pause à zéro à chaque sous-pas de turbo).
    if (this.overheated) {
      this.heat -= st.coolRate * h;
      if (this.heat < OVERHEAT_RECOVER_AT) this.overheated = false;
    } else if (this.sinceUseMs >= st.coolDelayMs) {
      this.heat -= st.coolRate * h;
    }
    if (this.heat < 0) this.heat = 0;

    if (!wants || this.cooldownMs > 0 || this.overheated) return -1;
    // Garde le reliquat pour une cadence régulière en tir continu (sous-pas de 1/60 s).
    this.cooldownMs = st.cooldownMs + Math.max(-20, Math.min(0, this.cooldownMs));
    this.sinceUseMs = 0;
    const m = this.muzzle;
    this.muzzle = (m + 1) % Math.max(1, st.muzzles);
    this.heat += st.heatPerShot;
    if (this.heat >= 1 - 1e-6) this.overheat();
    return m;
  }

  reset(): void {
    this.heat = 0;
    this.overheated = false;
    this.justOverheated = false;
    this.boosting = false;
    this.muzzle = 0;
    this.cooldownMs = 0;
    this.sinceUseMs = 1e6;
  }

  /** Jauge pleine : surchauffe, turbo coupé. */
  private overheat(): void {
    this.heat = 1;
    this.overheated = true;
    this.justOverheated = true;
    this.boosting = false;
  }
}

// ---------------------------------------------------------------- Projectiles

/**
 * Impact d'un projectile (premier touché le long de son segment, rochers et ennemis confondus ; le projectile
 * s'éteint) : rocher `index` (AsteroidField.rocks) ou ennemi `index`
 * (emplacement d'EnemyField), dégâts du projectile, point d'impact. Fonction liée une fois (pas de fermeture
 * créée en vol).
 */
export type ShotHitFn = (kind: 'rock' | 'enemy', index: number, damage: number, x: number, y: number, z: number) => void;

/** Fraction (0..1) du segment où il entre dans la sphère (cx, cy, cz, rr) ; point le plus proche s'il l'effleure. */
function segmentEntry(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  cx: number,
  cy: number,
  cz: number,
  rr: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (!(len2 > 0)) return 0;
  const tc = ((cx - x0) * dx + (cy - y0) * dy + (cz - z0) * dz) / len2;
  const ex = x0 + dx * tc - cx;
  const ey = y0 + dy * tc - cy;
  const ez = z0 + dz * tc - cz;
  const half = Math.sqrt(Math.max(0, rr * rr - (ex * ex + ey * ey + ez * ez)) / len2);
  const t = tc - half;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Fuseau à `seg` pans le long de Z (tête en −0,5, anneau en `ringZ`, queue en +0,5), triangles non indexés,
 * couleur par sommet (tête, anneau, queue : intensités, la couleur vient de l'instance). Faces avant tournées
 * vers l'intérieur : vu de derrière (caméra de poursuite), seul le cône de la tête est dessiné (FrontSide).
 */
function pushSpindle(
  pos: number[],
  col: number[],
  radius: number,
  ringZ: number,
  head: number,
  ring: number,
  tail: number,
  seg: number,
): void {
  const SEG = seg;
  for (let j = 0; j < SEG; j++) {
    const a0 = (j / SEG) * Math.PI * 2;
    const a1 = ((j + 1) / SEG) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;
    pos.push(0, 0, -0.5, x0, y0, ringZ, x1, y1, ringZ);
    col.push(head, head, head, ring, ring, ring, ring, ring, ring);
    pos.push(x1, y1, ringZ, x0, y0, ringZ, 0, 0, 0.5);
    col.push(ring, ring, ring, ring, ring, ring, tail, tail, tail);
  }
}

/**
 * Trait du tir (longueur 1, rayon 1 avant mise à l'échelle) : cœur vif et halo pâle, fusionnés. Halo éteint à
 * son anneau, allumé à ses bouts : vu dans l'axe, un point lumineux qui s'estompe vers le bord (un anneau plus
 * vif que le centre dessinait un hexagone net).
 */
function boltGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  pushSpindle(pos, col, 1, -0.32, 1, 1, 0.45, 6);
  pushSpindle(pos, col, 2.6, -0.2, 0.35, 0, 0.2, 12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * État d'un projectile : position de la tête, direction unitaire, vitesse, vie, âge, dégâts, trait, cible
 * réservée (claim : type T_*, index, numéro de l'occupant pour un ennemi).
 */
const S_X = 0;
const S_Y = 1;
const S_Z = 2;
const S_DX = 3;
const S_DY = 4;
const S_DZ = 5;
const S_SPEED = 6;
const S_LIFE = 7;
const S_AGE = 8;
const S_DMG = 9;
const S_LEN = 10;
const S_W = 11;
const S_TK = 12;
const S_TI = 13;
const S_TG = 14;
const STRIDE = 15;
/** Cible réservée d'un projectile (S_TK). */
const T_NONE = 0;
const T_ROCK = 1;
const T_ENEMY = 2;
/** Fin de vie : le trait s'éteint en fondu sur cette durée (s). */
const FADE_OUT = 0.08;
/** Épaisseur minimale du trait par unité de distance à la caméra (u/u). */
const WIDTH_PER_U = 0.005;

/** Projectiles de la Comète : traits lumineux additifs, un InstancedMesh (un appel de dessin). */
export class ShotPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private count = 0;
  private readonly st: Float32Array;
  /** Couleur de chaque projectile (linéaire, déjà éclaircie vers le blanc). */
  private readonly colors: Float32Array;

  constructor(cap: number, bin: Bin) {
    this.cap = cap;
    this.st = new Float32Array(cap * STRIDE);
    this.colors = new Float32Array(cap * 3);
    const geo = bin.add(boltGeometry());
    const mat = bin.add(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Une face sur deux : deux fois moins de couches additives (le trait saturait en blanc)
        side: THREE.FrontSide,
        fog: false,
        toneMapped: false,
      }),
    );
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /** Projectiles en vol. */
  get active(): number {
    return this.count;
  }

  /**
   * Tire un projectile depuis (x, y, z), direction unitaire (dx, dy, dz), vitesse ABSOLUE `speed` (u/s : vitesse
   * d'avance de la Comète + stats.speed), durée de vie `life` (s), dégâts, couleur 0xRRGGBB, trait
   * (length, width). Faux (rien tiré) si le pool est plein.
   */
  fire(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    speed: number,
    life: number,
    damage: number,
    color: number,
    length: number,
    width: number,
  ): boolean {
    if (this.count >= this.cap || !(life > 0) || !(speed > 0)) return false;
    const i = this.count++;
    const o = i * STRIDE;
    const st = this.st;
    st[o + S_X] = x;
    st[o + S_Y] = y;
    st[o + S_Z] = z;
    st[o + S_DX] = dx;
    st[o + S_DY] = dy;
    st[o + S_DZ] = dz;
    st[o + S_SPEED] = speed;
    st[o + S_LIFE] = life;
    st[o + S_AGE] = 0;
    st[o + S_DMG] = damage;
    st[o + S_LEN] = length;
    st[o + S_W] = width;
    st[o + S_TK] = T_NONE;
    st[o + S_TI] = -1;
    st[o + S_TG] = 0;
    // À peine blanchi : lisible sur la nébuleuse de même teinte, sans perdre le cyan
    _col.setHex(color);
    this.colors[i * 3] = _col.r * 0.92 + 0.08;
    this.colors[i * 3 + 1] = _col.g * 0.92 + 0.08;
    this.colors[i * 3 + 2] = _col.b * 0.92 + 0.08;
    return true;
  }

  /**
   * Le dernier tir parti (fire a renvoyé true) vise `target` (tir qui doit toucher : canHit de FlightRun) : ses
   * dégâts sont réservés sur la cible (pending) jusqu'à l'impact ou l'extinction du projectile. La visée ne
   * retient plus une cible que les tirs en route suffisent à détruire : pas de chauffe perdue en tir continu.
   */
  claim(target: Readonly<AimTarget>, rocks: AsteroidField, enemies: EnemyField): void {
    if (this.count === 0 || target.index < 0) return;
    const o = (this.count - 1) * STRIDE;
    const st = this.st;
    const i = target.index;
    if (target.kind === 'rock') {
      st[o + S_TK] = T_ROCK;
      st[o + S_TI] = i;
      rocks.pending[i] += st[o + S_DMG];
    } else if (target.kind === 'enemy') {
      st[o + S_TK] = T_ENEMY;
      st[o + S_TI] = i;
      st[o + S_TG] = enemies.serial[i];
      enemies.pending[i] += st[o + S_DMG];
    }
  }

  /**
   * Un sous-pas : avance les projectiles, éteint ceux en fin de vie, teste le segment parcouru contre les
   * rochers (AsteroidField.shotTest) et les ennemis (EnemyField.shotTest), rayon SHOT_R ; premier touché le
   * long du segment, rochers et ennemis confondus : projectile éteint (réservation rendue), `onHit` appelé.
   * Appelé à chaque sous-pas, dans toutes les phases (le pool se vide).
   */
  update(h: number, time: number, rocks: AsteroidField, enemies: EnemyField, onHit: ShotHitFn): void {
    const st = this.st;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      st[o + S_LIFE] -= h;
      st[o + S_AGE] += h;
      if (st[o + S_LIFE] <= 0) {
        this.release(o, rocks, enemies);
        this.remove(i);
        continue;
      }
      const x0 = st[o + S_X];
      const y0 = st[o + S_Y];
      const z0 = st[o + S_Z];
      const step = st[o + S_SPEED] * h;
      const x1 = x0 + st[o + S_DX] * step;
      const y1 = y0 + st[o + S_DY] * step;
      const z1 = z0 + st[o + S_DZ] * step;
      // Segment entier du sous-pas : pas de traversée, même à pleine vitesse. Rocher touché : les ennemis ne
      // sont testés que jusqu'à son point d'entrée (un ennemi rencontré avant lui passe d'abord).
      const rock = rocks.shotTest(x0, y0, z0, x1, y1, z1, SHOT_R, time);
      let ex = x1;
      let ey = y1;
      let ez = z1;
      if (rock >= 0) {
        rocks.center(rock, time, _rc);
        const te = segmentEntry(x0, y0, z0, x1, y1, z1, _rc.x, _rc.y, _rc.z, rocks.rocks[rock].r * 0.82 + SHOT_R);
        ex = x0 + (x1 - x0) * te;
        ey = y0 + (y1 - y0) * te;
        ez = z0 + (z1 - z0) * te;
      }
      const enemy = enemies.shotTest(x0, y0, z0, ex, ey, ez, SHOT_R);
      if (enemy >= 0 || rock >= 0) {
        const dmg = st[o + S_DMG];
        this.release(o, rocks, enemies);
        this.remove(i);
        // Ennemi : milieu du segment retenu ; rocher : point d'entrée dans sa sphère (étincelles à sa surface)
        if (enemy >= 0) onHit('enemy', enemy, dmg, (x0 + ex) * 0.5, (y0 + ey) * 0.5, (z0 + ez) * 0.5);
        else onHit('rock', rock, dmg, ex, ey, ez);
        continue;
      }
      st[o + S_X] = x1;
      st[o + S_Y] = y1;
      st[o + S_Z] = z1;
      i++;
    }
  }

  /**
   * Écrit les instances (une fois par image, depuis updateVisuals). `camZ` : profondeur de la caméra (le trait
   * s'épaissit avec la distance : quelques pixels au moins, même loin devant).
   */
  render(camZ: number): void {
    const st = this.st;
    const n = this.count;
    const colors = (this.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      _dir.set(st[o + S_DX], st[o + S_DY], st[o + S_DZ]);
      // Trait jamais plus long que le chemin parcouru (il ne part pas de l'intérieur de la Comète)
      const len = Math.max(0.2, Math.min(st[o + S_LEN], st[o + S_AGE] * st[o + S_SPEED] + 0.2));
      const w = Math.max(st[o + S_W], (camZ - st[o + S_Z]) * WIDTH_PER_U);
      _q.setFromUnitVectors(_fwd, _dir);
      _p.set(st[o + S_X], st[o + S_Y], st[o + S_Z]).addScaledVector(_dir, -len * 0.5);
      _s.set(w, w, len);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      const life = st[o + S_LIFE];
      const fade = life < FADE_OUT ? life / FADE_OUT : 1;
      colors[i * 3] = this.colors[i * 3] * fade;
      colors[i * 3 + 1] = this.colors[i * 3 + 1] * fade;
      colors[i * 3 + 2] = this.colors[i * 3 + 2] * fade;
    }
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /** Rend à sa cible les dégâts réservés par le projectile d'état `o` (claim), s'il en a une. */
  private release(o: number, rocks: AsteroidField, enemies: EnemyField): void {
    const st = this.st;
    const tk = st[o + S_TK];
    if (tk === T_NONE) return;
    st[o + S_TK] = T_NONE;
    const ti = st[o + S_TI];
    const dmg = st[o + S_DMG];
    if (tk === T_ROCK) {
      const p = rocks.pending[ti] - dmg;
      rocks.pending[ti] = p > 0 ? p : 0;
    } else if (enemies.serial[ti] === st[o + S_TG]) {
      // Même occupant de l'emplacement qu'au départ du tir (sinon le compteur a été remis à zéro)
      const p = enemies.pending[ti] - dmg;
      enemies.pending[ti] = p > 0 ? p : 0;
    }
  }

  /** Retire le projectile `i` (le dernier prend sa place). */
  private remove(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.st.copyWithin(i * STRIDE, j * STRIDE, j * STRIDE + STRIDE);
    this.colors[i * 3] = this.colors[j * 3];
    this.colors[i * 3 + 1] = this.colors[j * 3 + 1];
    this.colors[i * 3 + 2] = this.colors[j * 3 + 2];
  }

  /**
   * Éteint tous les projectiles (fin de partie : les réservations des cibles, qui disparaissent avec la
   * partie, ne sont pas rendues).
   */
  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }
}
