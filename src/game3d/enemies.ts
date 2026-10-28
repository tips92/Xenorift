import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CORRIDOR_R,
  ENEMY_ACTIVATE_D,
  FIGHTER_FIRE_DZ,
  FIGHTER_HOLD_SPAN,
  FIGHTER_SPAWN_D,
  FIGHTER_STAGGER,
  MINE_TRIGGER_R,
  SWARM_SPACING,
  SWARM_SWAY,
  SWARM_UNDULATE,
  pathAt,
  waveSpot,
  type Course,
  type CourseTheme,
  type EnemyKind,
  type WaveData,
} from './courses';
import { SHIP_GUNS } from '../core/shipGuns';
import type { Particles } from './effects';
import { GLSL_NOISE } from './glsl';
import { inAimCone, offerAim, type AimTarget } from './shots';
import { type Bin, clamp, segmentHitsSphere, smoothstep } from './util';

// Ennemis spatiaux « touchés par le Vide » (docs/plans/03-hangar.md, 3b) : silhouettes sombres violet-noir
// veinées de magenta lumineux, un InstancedMesh par type (+ un pour les orbes). Vagues placées par
// courses.ts (Course.waves), activées quand la Comète approche. Aucune allocation en vol (pools).
// Repère : la Comète avance vers −Z dans le couloir (CORRIDOR_R) ; un ennemi « devant » a un z plus petit.
// Ce module ne touche ni au son, ni au HUD, ni au score : il prévient FlightRun par EnemyEvents.
// Lisibilité : chaque type a sa lueur (mine : balise rouge qui clignote, essaim : nuée de points violets,
// chasseur : œil ambre qui se charge avant le tir), gardée visible de loin ; le magenta est réservé aux orbes,
// boules pleines cerclées de sombre (ni traits cyan des tirs, ni cristaux), et aux veines des coques.
// Explosions : éclair bref (lueur blanche puis violette) et gerbe blanc-violet, sans magenta qui cacherait une orbe.

export type { EnemyKind } from './courses';
export { MINE_TRIGGER_R } from './courses';

/** Fiche d'un type d'ennemi (valeurs de départ, à régler). */
export interface EnemyDef {
  /** Points de vie (dégâts du canon : 1 ; ×1,25 / ×1,5 améliorée). */
  readonly hp: number;
  /** Points rapportés quand un tir l'abat. */
  readonly points: number;
  /** Cristaux lâchés quand un tir l'abat (essaim : voir SWARM_WAVE_CRYSTALS). */
  readonly crystals: number;
  /** Rayon de collision (tirs, contact). */
  readonly radius: number;
}

export const ENEMY_DEFS: Readonly<Record<EnemyKind, EnemyDef>> = {
  // Arrive de face, tire UNE orbe vers la position anticipée de la Comète, puis s'écarte en virant.
  fighter: { hp: 3, points: 150, crystals: 2, radius: 1.4 },
  // Immobile dans le couloir, clignote ; explose si la Comète passe à moins de MINE_TRIGGER_R.
  mine: { hp: 2, points: 50, crystals: 1, radius: 1.0 },
  // 5 à 7 petits ennemis en formation ondulante qui barrent un passage.
  swarm: { hp: 1, points: 30, crystals: 0, radius: 0.75 },
};

/** Cristal bonus quand TOUTE une vague d'essaim a été abattue par les tirs (lâché au dernier). */
export const SWARM_WAVE_CRYSTALS = 1;
/** Ennemis simultanés au plus, par type ; orbes. */
export const ENEMY_CAP: Readonly<Record<EnemyKind, number>> = { fighter: 6, mine: 24, swarm: 28 };
export const ORB_CAP = 16;
/** Rayon de choc d'une orbe (u). */
export const ORB_R = 1.1;

/** Comète vue par les ennemis (objet tenu à jour par FlightRun avant chaque update ; lecture seule ici). */
export interface ShipState {
  x: number;
  y: number;
  z: number;
  /** Vitesse latérale (u/s). */
  vx: number;
  vy: number;
  /** Vitesse d'avance (u/s, vers −Z). */
  speed: number;
  /** Rayon de collision (SHIP_HIT_R de courses.ts). */
  r: number;
}

/** Origine d'un choc contre la Comète. */
export type EnemyHitCause = 'contact' | 'mine' | 'orb';

/**
 * Événements envoyés à FlightRun, appelés pendant update() ou damage() (objet créé une fois par FlightRun).
 * Aucun son ni score ici : FlightRun s'en charge.
 */
export interface EnemyEvents {
  /** Un chasseur lance son orbe (son 'enemyOrb'). */
  orbFired(x: number, y: number, z: number): void;
  /**
   * Ennemi détruit en (x, y, z). `points` et `crystals` : ce que rapporte cette destruction, décidé ici
   * (fiche ; 0 et 0 si la Comète l'a percuté ou si la mine a explosé contre elle ; essaim : bonus
   * SWARM_WAVE_CRYSTALS sur le dernier membre d'une vague entièrement abattue). Les éclats sont faits ici.
   */
  enemyKilled(kind: EnemyKind, x: number, y: number, z: number, points: number, crystals: number): void;
  /**
   * Choc contre la Comète, venu de (x, y, z) : contact avec un ennemi (détruit), mine déclenchée (détruite),
   * orbe (éteinte). FlightRun retire un bouclier, sauf pendant l'invulnérabilité (comme un rocher).
   */
  shipHit(cause: EnemyHitCause, x: number, y: number, z: number): void;
}

/** Comptes pour __xr3d.info() (objet réutilisé). */
export interface EnemyCounts {
  /** Ennemis vivants en scène, par type. */
  fighter: number;
  mine: number;
  swarm: number;
  /** Ennemis abattus par les tirs depuis le départ (StageResult.enemies). */
  killed: number;
  /** Orbes en vol. */
  orbs: number;
}

export function createEnemyCounts(): EnemyCounts {
  return { fighter: 0, mine: 0, swarm: 0, killed: 0, orbs: 0 };
}

/** Cristaux possibles des vagues (StageResult.crystalsTotal, avec ceux des astéroïdes). */
export function wavesCrystals(waves: readonly WaveData[]): number {
  let n = 0;
  for (const w of waves) n += w.kind === 'swarm' ? SWARM_WAVE_CRYSTALS : w.count * ENEMY_DEFS[w.kind].crystals;
  return n;
}

// ---------------------------------------------------------------- Réglages du comportement

/**
 * Chasseur des vagues : se cale pendant la charge à FIGHTER_OUT_OF_RANGE u au-delà de la portée du canon
 * (rangeSec × vitesse de croisière) : son orbe part toujours, on l'abat pendant son virage (plus facile à la
 * mitrailleuse). Aide DEV spawn : à la distance demandée, au moins FIGHTER_HOLD_MIN.
 */
const FIGHTER_OUT_OF_RANGE = 8;
const FIGHTER_HOLD_MIN = 30;
/**
 * Chasseur qui s'écarte : accélération latérale (u/s²), vitesse latérale max (u/s), recul vers la Comète (u/s).
 * Mouvement presque rectiligne et sans hâte : le tir visé en avance peut le rattraper pendant ~1 s.
 */
const BREAK_ACCEL = 30;
const BREAK_MAX = 12;
const BREAK_BACK = 35;
/** Chasseur : poursuite latérale de la Comète (1/s) et vitesse latérale max (u/s). */
const FIGHTER_TRACK = 1.6;
const FIGHTER_LAT_MAX = 14;
/** Échelle des maquettes. */
const FIGHTER_SCALE = 0.85;
/**
 * Orbe : temps jusqu'à la Comète à la vitesse de croisière (s ; vitesse en z fixée sur la croisière du
 * parcours, pas sur la vitesse du moment : presque immobile dans le décor, atteinte en ORB_T s à la croisière,
 * plus tôt en turbo), part de l'anticipation de sa position, durée de vie (s). courses.ts (genWaves) place les
 * chasseurs pour que ce croisement, près de WaveData.z quelle que soit la vitesse, tombe hors des portails.
 */
const ORB_T = 1.75;
const ORB_LEAD = 0.65;
const ORB_LIFE = 5;
/** Retiré quand il passe à cette distance derrière la Comète (la caméra est à ~9,5 u derrière). */
const DESPAWN_BEHIND = 14;
/** Apparition (s) : la maquette grandit depuis 0. */
const APPEAR_T = 0.45;
/** Essaim : pulsation de l'ondulation (rad/s). */
const SWARM_OMEGA = 2.2;
/** Pilote automatique : horizon d'évitement (s) et écart latéral max conseillé (u). */
const AVOID_T = 1.6;
const AVOID_MAX = 4.5;

// Emplacements : chasseurs, puis mines, puis essaim (un index stable par ennemi vivant).
const KINDS: readonly EnemyKind[] = ['fighter', 'mine', 'swarm'];
const K_FIGHTER = 0;
const K_MINE = 1;
const K_SWARM = 2;
const BASE = [0, ENEMY_CAP.fighter, ENEMY_CAP.fighter + ENEMY_CAP.mine] as const;
const END = [BASE[1], BASE[2], BASE[2] + ENEMY_CAP.swarm] as const;
const TOTAL = END[2];
/** Formations d'essaim simultanées. */
const SWARM_GROUPS = 6;
/** Éclairs d'explosion simultanés, durée (s). */
const BLAST_CAP = 8;
const BLAST_T = 0.18;
/** Lueurs : une par ennemi + les orbes + les éclairs. */
const GLOW_CAP = TOTAL + ORB_CAP + BLAST_CAP;
/** Données d'une orbe : x y z vx vy vz âge phase. */
const ORB_STRIDE = 8;

const F_APPROACH = 0;
const F_HOLD = 1;
const F_BREAK = 2;

const TAU = Math.PI * 2;

// Couleurs (linéaires) des lueurs et des éclats
const C_VEIN = new THREE.Color('#ff2bd6');
const C_ORB = new THREE.Color('#ff36c8');
const C_MINE = new THREE.Color('#ff2a4a');
const C_SWARM = new THREE.Color('#b04dff');
/** Œil du chasseur : ambre chaud (une orbe magenta part de là, il ne faut pas les confondre). */
const C_EYE = new THREE.Color('#ffb030');
/** Liseré des coques, froid et propre aux ennemis (celui du thème Nébuleuse est magenta : coques toutes roses). */
const C_RIM = new THREE.Color('#8f9cff');
const C_WHITE = new THREE.Color('#ffffff');
const C_HOT = new THREE.Color('#ffd0f4');
const C_VIOLET = new THREE.Color('#7a3cff');
const C_PALE = new THREE.Color('#c4b8ff');
const _c = new THREE.Color();

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _mineAxis = new THREE.Vector3(0.3, 1, 0.2).normalize();
const _spot = { x: 0, y: 0, z: 0 };
const _pp = { x: 0, y: 0 };

// ---------------------------------------------------------------- Matériaux

const VOID_VERT = /* glsl */ `
attribute float aGlow;
attribute vec4 aState;
varying vec3 vWN;
varying vec3 vWP;
varying vec3 vObj;
varying float vGlow;
varying vec4 vState;
#include <fog_pars_vertex>
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * lp;
  vWP = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * n);
  vObj = position;
  vGlow = aGlow;
  vState = aState;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Coque sombre éclairée par la lumière principale, liseré froid (discret : les ailes vues par la tranche ne
// doivent pas devenir pleines), veines magenta (crêtes fines d'un bruit en repère maquette) qui pulsent, parties
// lumineuses (aGlow : 1 pointes et anneau, magenta ; 2 œil du chasseur, ambre) avivées par vState.y, éclair blanc
// de touche (vState.x). Un seul bruit : pas de boucle (FXC).
const VOID_FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uBody2;
uniform vec3 uVein;
uniform vec3 uEye;
uniform vec3 uRim;
uniform vec3 uKey;
uniform vec3 uKeyDir;
uniform float uTime;
varying vec3 vWN;
varying vec3 vWP;
varying vec3 vObj;
varying float vGlow;
varying vec4 vState;
#include <fog_pars_fragment>
${GLSL_NOISE}
void main() {
  vec3 n = normalize(vWN);
  vec3 v = normalize(cameraPosition - vWP);
  float diff = max(dot(n, uKeyDir), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  float spec = pow(max(dot(reflect(-uKeyDir, n), v), 0.0), 20.0);
  vec3 col = mix(uBody, uBody2, hemi) * (0.35 + 0.9 * diff) + uKey * spec * 0.3;
  float s = vState.z;
  float nz = xrNoise(vObj * 2.6 + vec3(s * 17.0, s * 5.0, uTime * 0.3));
  float vein = 1.0 - smoothstep(0.02, 0.07, abs(nz - 0.5));
  float pulse = 0.55 + 0.45 * sin(uTime * 3.2 + s * 6.2831853 + vObj.z * 2.2);
  float glow = vState.y;
  col += uVein * vein * (0.5 + 0.8 * pulse) * (0.7 + 0.5 * glow);
  vec3 gc = mix(uVein, uEye, clamp(vGlow - 1.0, 0.0, 1.0));
  col += mix(gc, vec3(1.0, 0.92, 0.85), clamp(glow - 1.0, 0.0, 1.0) * 0.6) * min(vGlow, 1.0) * (0.7 + 1.5 * glow);
  col += uRim * fres * 0.45 + uVein * fres * 0.15;
  col = mix(col, vec3(1.0, 0.92, 1.0), vState.x * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// Lueurs face caméra (une instance = un quad) : halo additif (style 0) ou orbe (style 1) : disque plein
// magenta à cœur blanc, cerclé de sombre (lisible sur n'importe quel fond), voile additif autour.
// Mélange prémultiplié : rgb ajouté, alpha qui assombrit (halo : alpha 0, purement additif).
const GLOW_VERT = /* glsl */ `
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = position.xy * 2.0;
  vCol = aCol;
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  float s = 1.0;
  #ifdef USE_INSTANCING
    c = instanceMatrix * c;
    s = length(instanceMatrix[0].xyz);
  #endif
  vec4 mv = modelViewMatrix * c;
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  vec3 c = vCol.rgb;
  float a = 0.0;
  vec3 rgb;
  if (vCol.w < 1.0) {
    float k = 1.0 - r;
    rgb = c * (k * k) + vec3(1.0) * pow(k, 10.0) * min(dot(c, vec3(0.33)), 1.5);
  } else {
    float pulse = 0.5 + 0.5 * sin(uTime * 9.0 + fract(vCol.w) * 6.2831853);
    float edge = 0.62 + 0.04 * pulse;
    float disc = 1.0 - smoothstep(edge - 0.03, edge, r);
    float ring = smoothstep(edge - 0.05, edge, r) * (1.0 - smoothstep(edge + 0.06, edge + 0.12, r));
    float core = 1.0 - smoothstep(0.0, 0.42, r);
    float band = 1.0 - smoothstep(0.0, 0.25, abs(r - (0.2 + 0.32 * fract(uTime * 1.6 + vCol.w))));
    vec3 body = mix(c * (0.9 + 0.5 * pulse), vec3(1.0), core * core) + c * band * 0.8;
    vec3 dark = vec3(0.05, 0.0, 0.09);
    float haze = (1.0 - smoothstep(edge, 1.0, r)) * (1.0 - disc);
    a = max(disc * 0.95, ring * 0.9);
    rgb = (body * disc + dark * ring * (1.0 - disc)) + c * haze * (0.45 + 0.35 * pulse);
  }
  gl_FragColor = vec4(rgb, a);
  #include <colorspace_fragment>
}
`;

/** Matériau des coques : lumière principale du thème ; liseré propre aux ennemis (C_RIM). */
function makeVoidMaterial(theme: CourseTheme, bin: Bin): THREE.ShaderMaterial {
  return bin.add(
    new THREE.ShaderMaterial({
      vertexShader: VOID_VERT,
      fragmentShader: VOID_FRAG,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uBody: { value: new THREE.Color('#0b0514') },
          uBody2: { value: new THREE.Color('#3a1a5c') },
          uVein: { value: C_VEIN.clone() },
          uEye: { value: C_EYE.clone() },
          uRim: { value: C_RIM.clone() },
          uKey: { value: new THREE.Color(theme.key) },
          uKeyDir: { value: new THREE.Vector3(4.5, 8, 5).normalize() },
          uTime: { value: 0 },
        },
      ]),
    }),
  );
}

// ---------------------------------------------------------------- Maquettes (nez vers +Z : face à la Comète)

type GlowFn = (x: number, y: number, z: number) => number;

/** Pièce prête à fusionner : non indexée, position + aGlow (lueur par sommet). */
function part(geo: THREE.BufferGeometry, glow: number | GlowFn): THREE.BufferGeometry {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) a[i] = typeof glow === 'number' ? glow : glow(pos.getX(i), pos.getY(i), pos.getZ(i));
  g.setAttribute('aGlow', new THREE.BufferAttribute(a, 1));
  return g;
}

/** Fusionne les pièces (facettes plates), avec l'attribut d'instance aState. */
function build(parts: THREE.BufferGeometry[], cap: number, bin: Bin): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('Ennemis : fusion de géométries impossible');
  m.computeVertexNormals();
  const st = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  st.setUsage(THREE.DynamicDrawUsage);
  m.setAttribute('aState', st);
  return bin.add(m);
}

/** Mine : noyau à facettes hérissé de 12 pointes aux bouts rougeoyants, anneau lumineux à l'équateur. */
function mineGeometry(bin: Bin): THREE.BufferGeometry {
  const parts = [part(new THREE.IcosahedronGeometry(0.62, 1), 0)];
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) dirs.push([0, a, b], [a, b, 0], [b, 0, a]);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const [x, y, z] of dirs) {
    const cone = new THREE.ConeGeometry(0.15, 0.55, 5);
    cone.translate(0, 0.82, 0);
    cone.applyQuaternion(q.setFromUnitVectors(up, d.set(x, y, z).normalize()));
    parts.push(part(cone, (px, py, pz) => (Math.hypot(px, py, pz) > 0.98 ? 0.9 : 0)));
  }
  const band = new THREE.TorusGeometry(0.66, 0.055, 5, 24);
  band.rotateX(Math.PI / 2);
  parts.push(part(band, 1));
  return build(parts, ENEMY_CAP.mine, bin);
}

/** Chasseur : fuselage en losange, ailes en griffes tournées vers l'avant, mandibles, œil, crête lumineuse. */
function fighterGeometry(bin: Bin): THREE.BufferGeometry {
  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.55, 0.36, 1.45);
  const crest = new THREE.OctahedronGeometry(1, 0);
  crest.scale(0.1, 0.42, 0.95);
  crest.translate(0, 0.28, -0.35);
  const eye = new THREE.IcosahedronGeometry(0.27, 0);
  eye.translate(0, 0.06, 1.18);
  // Œil : aGlow 2 (ambre dans le shader) ; bouts d'ailes et de griffes allumés : la forme se lit de loin
  const parts = [part(body, 0), part(crest, (_x, y) => (y > 0.6 ? 0.8 : 0)), part(eye, 2)];
  for (const side of [-1, 1]) {
    const wing = new THREE.OctahedronGeometry(1, 0);
    wing.scale(1.3, 0.07, 0.46);
    wing.rotateY(-side * 0.5);
    wing.translate(side * 1.05, -0.02, 0.1);
    parts.push(part(wing, (x) => (Math.abs(x) > 1.6 ? 1 : 0)));
    const claw = new THREE.ConeGeometry(0.13, 1.3, 5);
    claw.rotateX(Math.PI / 2);
    claw.rotateY(-side * 0.14);
    claw.translate(side * 0.5, -0.12, 1.05);
    parts.push(part(claw, (_x, _y, z) => (z > 1.5 ? 1 : 0)));
    const fin = new THREE.ConeGeometry(0.1, 0.9, 4);
    fin.rotateX(-Math.PI / 2);
    fin.rotateZ(side * 0.6);
    fin.translate(side * 0.35, 0.2, -1.5);
    parts.push(part(fin, 0));
  }
  return build(parts, ENEMY_CAP.fighter, bin);
}

/** Membre d'essaim : petit dard aux ailes relevées, œil lumineux. */
function swarmGeometry(bin: Bin): THREE.BufferGeometry {
  const body = new THREE.OctahedronGeometry(1, 0);
  body.scale(0.26, 0.2, 0.62);
  const eye = new THREE.IcosahedronGeometry(0.14, 0);
  eye.translate(0, 0.03, 0.52);
  const parts = [part(body, 0), part(eye, 1)];
  for (const side of [-1, 1]) {
    const wing = new THREE.OctahedronGeometry(1, 0);
    wing.scale(0.6, 0.035, 0.3);
    wing.rotateZ(side * 0.28);
    wing.rotateY(side * 0.35);
    wing.translate(side * 0.5, 0.05, -0.1);
    parts.push(part(wing, (x) => (Math.abs(x) > 0.95 ? 0.8 : 0)));
  }
  return build(parts, ENEMY_CAP.swarm, bin);
}

function makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/** Grossissement à l'apparition (léger rebond). */
function appear(age: number): number {
  if (age >= APPEAR_T) return 1;
  const a = age / APPEAR_T;
  return (1 - (1 - a) * (1 - a) * (1 - a)) * (1 + 0.18 * Math.sin(a * Math.PI));
}

export class EnemyField {
  /** Un InstancedMesh par type + les orbes : 4 appels de dessin au plus. */
  readonly group = new THREE.Group();
  /** Cristaux possibles de toutes les vagues du parcours. */
  readonly crystalsTotal: number;
  /**
   * Par emplacement : dégâts des tirs en route (ShotPool.claim ; la visée ne retient plus un ennemi qu'ils
   * suffisent à abattre) et numéro de l'occupant (changé à chaque naissance : un tir parti vers l'ancien
   * occupant ne rend rien au nouveau). Remis à zéro à la naissance.
   */
  readonly pending = new Float32Array(TOTAL);
  readonly serial = new Uint32Array(TOTAL);
  private readonly waves: readonly WaveData[];
  private readonly path: Course['path'];
  private readonly particles: Particles;
  private readonly events: EnemyEvents;
  private readonly material: THREE.ShaderMaterial;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly states: THREE.InstancedBufferAttribute[] = [];
  private readonly glowMesh: THREE.InstancedMesh;
  private readonly glowCol: THREE.InstancedBufferAttribute;

  // --- Vagues
  private readonly waveDone: Uint8Array;
  private waveFrom = 0;

  // --- Ennemis (emplacement i ; type fixé par la plage d'emplacements)
  private readonly alive = new Uint8Array(TOTAL);
  private readonly kindIx = new Uint8Array(TOTAL);
  private readonly pos = new Float64Array(TOTAL * 3);
  private readonly vel = new Float64Array(TOTAL * 3);
  private readonly hp = new Float32Array(TOTAL);
  private readonly flash = new Float32Array(TOTAL);
  private readonly age = new Float32Array(TOTAL);
  private readonly seed = new Float32Array(TOTAL);
  /** Lueur (mine : clignotement ; chasseur : charge). */
  private readonly glow = new Float32Array(TOTAL);
  // Mines : position de repos, côté libre (pilote automatique), phase du clignotement
  private readonly anchor = new Float64Array(TOTAL * 3);
  private readonly dodge = new Float32Array(TOTAL * 2);
  private readonly blink = new Float64Array(TOTAL);
  // Chasseurs : distance devant la Comète, état, repères en z de la Comète (départ, charge, tir), recul,
  // côté du virage, position et vitesse latérales, écart de la paire
  private readonly fD = new Float64Array(TOTAL);
  private readonly fD0 = new Float64Array(TOTAL);
  private readonly fHoldD = new Float64Array(TOTAL);
  private readonly fState = new Uint8Array(TOTAL);
  private readonly fStart = new Float64Array(TOTAL);
  private readonly fHoldAt = new Float64Array(TOTAL);
  private readonly fFireAt = new Float64Array(TOTAL);
  private readonly fBreakT = new Float32Array(TOTAL);
  private readonly fSide = new Float32Array(TOTAL * 2);
  private readonly fLat = new Float64Array(TOTAL * 2);
  private readonly fLatV = new Float32Array(TOTAL);
  private readonly fOff = new Float32Array(TOTAL * 2);
  // Essaim : formation, rang dans la formation
  private readonly sGroup = new Int8Array(TOTAL);
  private readonly sRank = new Uint8Array(TOTAL);
  private readonly gUsed = new Uint8Array(SWARM_GROUPS);
  private readonly gAlive = new Uint8Array(SWARM_GROUPS);
  private readonly gSpoiled = new Uint8Array(SWARM_GROUPS);
  private readonly gN = new Uint8Array(SWARM_GROUPS);
  private readonly gC = new Float64Array(SWARM_GROUPS * 3);
  private readonly gCos = new Float32Array(SWARM_GROUPS);
  private readonly gSin = new Float32Array(SWARM_GROUPS);
  private readonly gPhase = new Float32Array(SWARM_GROUPS);

  // --- Orbes (liste tassée)
  private readonly orbs = new Float64Array(ORB_CAP * ORB_STRIDE);
  private orbCount = 0;

  // --- Éclairs d'explosion (lueurs du glowMesh, à tour de rôle) : position, heure de naissance, taille
  private readonly blastPos = new Float64Array(BLAST_CAP * 3);
  private readonly blastBirth = new Float64Array(BLAST_CAP).fill(-1e9);
  private readonly blastSize = new Float32Array(BLAST_CAP);
  private blastNext = 0;

  // --- Pilote automatique : menaces (rel x, rel y, rayon, poids), candidats d'écart, dernier écart retenu
  private readonly threats = new Float64Array((TOTAL + ORB_CAP) * 4);
  private readonly cands = new Float64Array((1 + 8 + 3 * (TOTAL + ORB_CAP)) * 2);
  private avoidX = 0;
  private avoidY = 0;

  private killed = 0;
  private time = 0;
  /** Distance de charge des chasseurs des vagues (u) : hors de portée du canon. */
  private readonly fighterHoldD: number;
  /** Vitesse de croisière du parcours (u/s) : vitesse des orbes (fireOrb). */
  private readonly cruise: number;
  /** Dernière Comète reçue (aide DEV spawn, orientation des chasseurs) ; null avant le premier update. */
  private ship: Readonly<ShipState> | null = null;
  private disposed = false;

  /**
   * `particles` : pool partagé de FlightRun (éclats, étincelles) ; `events` : rappels de FlightRun. Géométries
   * et matériaux dans `bin` (libérés avec la partie).
   */
  constructor(course: Course, theme: CourseTheme, particles: Particles, events: EnemyEvents, bin: Bin) {
    this.waves = course.waves;
    this.path = course.path;
    this.particles = particles;
    this.events = events;
    this.crystalsTotal = wavesCrystals(course.waves);
    const rangeSec = Math.max(SHIP_GUNS.light.rangeSec, SHIP_GUNS.machinegun.rangeSec);
    this.fighterHoldD = rangeSec * course.def.speed + FIGHTER_OUT_OF_RANGE;
    this.cruise = course.def.speed;
    this.waveDone = new Uint8Array(course.waves.length);
    for (let k = 0; k < KINDS.length; k++) for (let i = BASE[k]; i < END[k]; i++) this.kindIx[i] = k;

    this.material = makeVoidMaterial(theme, bin);
    const geos = [fighterGeometry(bin), mineGeometry(bin), swarmGeometry(bin)];
    for (let k = 0; k < KINDS.length; k++) {
      const mesh = makeMesh(geos[k], this.material, END[k] - BASE[k]);
      this.meshes.push(mesh);
      this.states.push(geos[k].getAttribute('aState') as THREE.InstancedBufferAttribute);
      this.group.add(mesh);
    }

    const plane = bin.add(new THREE.PlaneGeometry(1, 1));
    plane.deleteAttribute('normal');
    plane.deleteAttribute('uv');
    this.glowCol = new THREE.InstancedBufferAttribute(new Float32Array(GLOW_CAP * 4), 4);
    this.glowCol.setUsage(THREE.DynamicDrawUsage);
    plane.setAttribute('aCol', this.glowCol);
    this.glowMat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uTime: { value: 0 } },
      }),
    );
    this.glowMesh = makeMesh(plane, this.glowMat, GLOW_CAP);
    this.glowMesh.renderOrder = 5;
    this.group.add(this.glowMesh);
  }

  // ================================================================ Simulation

  /**
   * Un sous-pas de simulation : vagues activées à l'approche de la Comète, déplacements et IA, orbes,
   * ennemis passés derrière la caméra retirés. `live` (phase 'fly' seulement) : chocs avec la Comète
   * (events.shipHit) et nouveaux tirs d'orbes ; sinon tout continue de bouger sans toucher la Comète.
   */
  update(h: number, time: number, ship: Readonly<ShipState>, live: boolean): void {
    if (this.disposed) return;
    this.ship = ship;
    this.time = time;
    if (!(h > 0)) return;
    if (live) this.activateWaves(ship);
    const inv = 1 / h;
    for (let i = 0; i < TOTAL; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const ox = this.pos[i3];
      const oy = this.pos[i3 + 1];
      const oz = this.pos[i3 + 2];
      this.age[i] += h;
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - h * 7);
      const k = this.kindIx[i];
      if (k === K_FIGHTER) this.stepFighter(i, h, ship, live);
      else if (k === K_MINE) this.stepMine(i, h, time, ship);
      else this.stepSwarm(i, time);
      if (!this.alive[i]) continue;
      this.vel[i3] = (this.pos[i3] - ox) * inv;
      this.vel[i3 + 1] = (this.pos[i3 + 1] - oy) * inv;
      this.vel[i3 + 2] = (this.pos[i3 + 2] - oz) * inv;
      if (live) this.collide(i, ship);
      if (this.alive[i] && this.pos[i3 + 2] > ship.z + DESPAWN_BEHIND) this.release(i, true);
    }
    this.stepOrbs(h, ship, live);
  }

  /** Vagues dont la Comète approche (triées par z décroissant : on s'arrête à la première trop lointaine). */
  private activateWaves(ship: Readonly<ShipState>): void {
    const waves = this.waves;
    while (this.waveFrom < waves.length && this.waveDone[this.waveFrom]) this.waveFrom++;
    for (let i = this.waveFrom; i < waves.length; i++) {
      const w = waves[i];
      const dist = ship.z - w.z;
      if (dist > ENEMY_ACTIVATE_D) break;
      if (this.waveDone[i]) continue;
      if (dist > (w.kind === 'fighter' ? FIGHTER_SPAWN_D : ENEMY_ACTIVATE_D)) continue;
      this.waveDone[i] = 1;
      // Déjà dépassée (saut de temps) : ignorée
      if (dist < -DESPAWN_BEHIND) continue;
      this.spawnWave(w, ship);
    }
  }

  private spawnWave(w: WaveData, ship: Readonly<ShipState>): void {
    if (w.kind === 'mine') {
      const ux = Math.cos(w.variant * TAU);
      const uy = Math.sin(w.variant * TAU);
      for (let k = 0; k < w.count; k++) {
        waveSpot(w, k, _spot);
        this.addMine(_spot.x, _spot.y, _spot.z, -ux, -uy, w.variant + k * 0.37);
      }
    } else if (w.kind === 'swarm') {
      this.addSwarm(w.x, w.y, w.z, w.count, w.variant * Math.PI, w.variant * TAU * 3);
    } else {
      const holdAt = w.z + FIGHTER_FIRE_DZ + FIGHTER_HOLD_SPAN;
      const th = (w.variant - 0.5) * 0.8;
      for (let k = 0; k < w.count; k++) {
        waveSpot(w, k, _spot);
        // Virage : seul, côté tiré à la génération ; en paire, chacun de son côté
        let sx: number;
        let sy: number;
        if (w.count > 1) {
          const s = k === 0 ? -1 : 1;
          sx = Math.cos(th) * s;
          sy = Math.sin(th) * s;
        } else {
          sx = Math.cos(w.variant * TAU);
          sy = Math.sin(w.variant * TAU) * 0.6;
        }
        const fireAt = w.z + FIGHTER_FIRE_DZ - k * FIGHTER_STAGGER;
        this.addFighter(_spot.x, _spot.y, _spot.z, ship.z, this.fighterHoldD, holdAt, fireAt, _spot.x - w.x, _spot.y - w.y, sx, sy, w.variant + k * 0.5);
      }
    }
  }

  /** Premier emplacement libre du type `k`, ou −1. */
  private alloc(k: number): number {
    for (let i = BASE[k]; i < END[k]; i++) if (!this.alive[i]) return i;
    return -1;
  }

  private init(i: number, x: number, y: number, z: number, seed: number): void {
    const i3 = i * 3;
    this.alive[i] = 1;
    this.pending[i] = 0;
    // Gardé sous 2^24 : recopié tel quel dans l'état Float32 des projectiles
    this.serial[i] = (this.serial[i] + 1) & 0xffffff;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = this.vel[i3 + 1] = this.vel[i3 + 2] = 0;
    this.hp[i] = ENEMY_DEFS[KINDS[this.kindIx[i]]].hp;
    this.flash[i] = 0;
    this.age[i] = 0;
    this.glow[i] = 0;
    this.seed[i] = seed - Math.floor(seed);
  }

  private addMine(x: number, y: number, z: number, dx: number, dy: number, seed: number): number {
    const i = this.alloc(K_MINE);
    if (i < 0) return 0;
    this.init(i, x, y, z, seed);
    this.anchor[i * 3] = x;
    this.anchor[i * 3 + 1] = y;
    this.anchor[i * 3 + 2] = z;
    const l = Math.hypot(dx, dy) || 1;
    this.dodge[i * 2] = dx / l;
    this.dodge[i * 2 + 1] = dy / l;
    this.blink[i] = this.seed[i] * TAU;
    return 1;
  }

  private addSwarm(x: number, y: number, z: number, n: number, angle: number, phase: number): number {
    let g = -1;
    for (let j = 0; j < SWARM_GROUPS; j++) {
      if (!this.gUsed[j]) {
        g = j;
        break;
      }
    }
    if (g < 0) return 0;
    this.gUsed[g] = 1;
    this.gAlive[g] = 0;
    this.gSpoiled[g] = 0;
    this.gN[g] = n;
    this.gC[g * 3] = x;
    this.gC[g * 3 + 1] = y;
    this.gC[g * 3 + 2] = z;
    this.gCos[g] = Math.cos(angle);
    this.gSin[g] = Math.sin(angle);
    this.gPhase[g] = phase;
    let placed = 0;
    for (let k = 0; k < n; k++) {
      const i = this.alloc(K_SWARM);
      if (i < 0) break;
      this.init(i, x, y, z, phase * 0.1 + k * 0.13);
      this.sGroup[i] = g;
      this.sRank[i] = k;
      this.gAlive[g]++;
      placed++;
      this.stepSwarm(i, this.time);
    }
    // Formation incomplète (pool plein) : pas de bonus
    if (placed < n) this.gSpoiled[g] = 1;
    if (placed === 0) this.gUsed[g] = 0;
    return placed;
  }

  /** Chasseur entré en z ; tenu à `holdD` devant la Comète pendant la charge ; repères en z de la Comète. */
  private addFighter(
    x: number,
    y: number,
    z: number,
    shipZ: number,
    holdD: number,
    holdAt: number,
    fireAt: number,
    offX: number,
    offY: number,
    sideX: number,
    sideY: number,
    seed: number,
  ): number {
    const i = this.alloc(K_FIGHTER);
    if (i < 0) return 0;
    this.init(i, x, y, z, seed);
    const d0 = Math.max(holdD, shipZ - z);
    this.fD[i] = d0;
    this.fD0[i] = d0;
    this.fHoldD[i] = holdD;
    this.fState[i] = F_APPROACH;
    this.fStart[i] = shipZ;
    this.fHoldAt[i] = Math.min(holdAt, shipZ - 1);
    this.fFireAt[i] = Math.min(fireAt, this.fHoldAt[i]);
    this.fBreakT[i] = 0;
    const sl = Math.hypot(sideX, sideY) || 1;
    this.fSide[i * 2] = sideX / sl;
    this.fSide[i * 2 + 1] = sideY / sl;
    this.fLat[i * 2] = x;
    this.fLat[i * 2 + 1] = y;
    this.fLatV[i] = 0;
    this.fOff[i * 2] = offX;
    this.fOff[i * 2 + 1] = offY;
    return 1;
  }

  /**
   * Chasseur, réglé sur la profondeur de la Comète (même rendez-vous à toute vitesse) : il arrive du fond
   * (distance fD qui fond jusqu'à fHoldD), se cale devant elle en suivant ses écarts, charge, tire
   * son orbe au repère fFireAt, puis vire sur le côté en reculant (la Comète le dépasse). Hors phase de vol :
   * il garde sa vitesse.
   */
  private stepFighter(i: number, h: number, ship: Readonly<ShipState>, live: boolean): void {
    const i3 = i * 3;
    const i2 = i * 2;
    if (!live) {
      this.pos[i3] += this.vel[i3] * h;
      this.pos[i3 + 1] += this.vel[i3 + 1] * h;
      this.pos[i3 + 2] += this.vel[i3 + 2] * h;
      this.glow[i] = Math.max(0, this.glow[i] - h * 2);
      if (this.age[i] > 20) this.release(i, true);
      return;
    }
    const st = this.fState[i];
    if (st !== F_BREAK) {
      const span = Math.max(1, this.fStart[i] - this.fHoldAt[i]);
      const p = clamp((this.fStart[i] - ship.z) / span, 0, 1);
      const e = (1 - p) * (1 - p);
      this.fD[i] = this.fHoldD[i] + (this.fD0[i] - this.fHoldD[i]) * e;
      if (p >= 1) this.fState[i] = F_HOLD;
      // Face à la Comète : suit ses écarts latéraux (avec l'écart de la paire), sans sortir du couloir
      let tx = ship.x + this.fOff[i2];
      let ty = ship.y + this.fOff[i2 + 1];
      const tr = Math.hypot(tx, ty);
      if (tr > CORRIDOR_R - 1) {
        tx *= (CORRIDOR_R - 1) / tr;
        ty *= (CORRIDOR_R - 1) / tr;
      }
      const k = 1 - Math.exp(-FIGHTER_TRACK * h);
      let dx = (tx - this.fLat[i2]) * k;
      let dy = (ty - this.fLat[i2 + 1]) * k;
      const dl = Math.hypot(dx, dy);
      const maxStep = FIGHTER_LAT_MAX * h;
      if (dl > maxStep) {
        dx *= maxStep / dl;
        dy *= maxStep / dl;
      }
      this.fLat[i2] += dx;
      this.fLat[i2 + 1] += dy;
      const hold = this.fHoldAt[i] - this.fFireAt[i];
      this.glow[i] = hold > 0 ? clamp((this.fHoldAt[i] - ship.z) / hold, 0, 1) : 1;
      if (ship.z <= this.fFireAt[i]) {
        this.fireOrb(i, ship);
        this.fState[i] = F_BREAK;
        this.fBreakT[i] = 0;
      }
    } else {
      this.fBreakT[i] += h;
      this.fD[i] -= BREAK_BACK * h;
      this.fLatV[i] = Math.min(BREAK_MAX, this.fLatV[i] + BREAK_ACCEL * h);
      this.fLat[i2] += this.fSide[i2] * this.fLatV[i] * h;
      this.fLat[i2 + 1] += this.fSide[i2 + 1] * this.fLatV[i] * h;
      this.glow[i] = Math.max(0, this.glow[i] - h * 3);
      if (Math.hypot(this.fLat[i2], this.fLat[i2 + 1]) > 80) {
        this.release(i, true);
        return;
      }
    }
    const bob = Math.sin(this.time * 2.3 + this.seed[i] * TAU) * 0.25;
    this.pos[i3] = this.fLat[i2];
    this.pos[i3 + 1] = this.fLat[i2 + 1] + bob;
    this.pos[i3 + 2] = ship.z - this.fD[i];
  }

  /**
   * Orbe lancée vers la position anticipée de la Comète. Vitesse en z réglée sur la croisière (et non sur la
   * vitesse du moment) : presque immobile dans le décor, elle est croisée près de son point de départ (zone que
   * genWaves garde hors des portails), en ORB_T s à la croisière, plus tôt en turbo, plus tard au ralenti.
   */
  private fireOrb(i: number, ship: Readonly<ShipState>): void {
    if (this.orbCount >= ORB_CAP) return;
    const i3 = i * 3;
    const ox = this.pos[i3];
    const oy = this.pos[i3 + 1];
    const oz = this.pos[i3 + 2] + 1.4 * FIGHTER_SCALE;
    const dist = ship.z - oz;
    if (dist < 12) return;
    const t = ORB_T;
    let tx = ship.x + ship.vx * t * ORB_LEAD;
    let ty = ship.y + ship.vy * t * ORB_LEAD;
    const tr = Math.hypot(tx, ty);
    if (tr > CORRIDOR_R - 0.5) {
      tx *= (CORRIDOR_R - 0.5) / tr;
      ty *= (CORRIDOR_R - 0.5) / tr;
    }
    const o = this.orbCount++ * ORB_STRIDE;
    const ob = this.orbs;
    ob[o] = ox;
    ob[o + 1] = oy;
    ob[o + 2] = oz;
    ob[o + 3] = (tx - ox) / t;
    ob[o + 4] = (ty - oy) / t;
    ob[o + 5] = -this.cruise + dist / t;
    ob[o + 6] = 0;
    ob[o + 7] = Math.random();
    this.particles.burst(ox, oy, oz, 14, 3, 10, C_ORB, 0.7, 0.35, ob[o + 5]);
    this.glow[i] = 2.2;
    this.events.orbFired(ox, oy, oz);
  }

  /** Mine : flotte sur place ; clignote d'autant plus vite que la Comète est proche. */
  private stepMine(i: number, h: number, time: number, ship: Readonly<ShipState>): void {
    const i3 = i * 3;
    this.pos[i3] = this.anchor[i3];
    this.pos[i3 + 1] = this.anchor[i3 + 1] + Math.sin(time * 1.4 + this.seed[i] * TAU) * 0.28;
    this.pos[i3 + 2] = this.anchor[i3 + 2];
    const dist = ship.z - this.anchor[i3 + 2];
    const rate = dist < 140 ? 1.6 + 4.4 * clamp(1 - dist / 140, 0, 1) : 1.6;
    this.blink[i] += h * TAU * rate;
    if (this.blink[i] > 1e4) this.blink[i] -= TAU * 1000;
    const b = 0.5 + 0.5 * Math.cos(this.blink[i]);
    this.glow[i] = b * b * b * b;
  }

  /** Membre d'essaim : rang dans une ligne en V, ondulation perpendiculaire, balancement, battement en z. */
  private stepSwarm(i: number, time: number): void {
    this.swarmAt(i, time, _spot);
    const i3 = i * 3;
    this.pos[i3] = _spot.x;
    this.pos[i3 + 1] = _spot.y;
    this.pos[i3 + 2] = _spot.z;
    this.glow[i] = 0.5 + 0.3 * Math.sin(time * 7 + this.sRank[i] * 2.1);
  }

  /** Position du membre d'essaim `i` à l'instant `time` (mouvement réglé sur l'horloge : prévisible). */
  private swarmAt(i: number, time: number, out: { x: number; y: number; z: number }): void {
    const g = this.sGroup[i];
    const k = this.sRank[i];
    const c = this.gCos[g];
    const s = this.gSin[g];
    const sk = (k - (this.gN[g] - 1) / 2) * SWARM_SPACING;
    const w = time * SWARM_OMEGA + this.gPhase[g];
    const und = SWARM_UNDULATE * Math.sin(w + k * 0.9);
    const sway = SWARM_SWAY * Math.sin(w * 0.55);
    const g3 = g * 3;
    out.x = this.gC[g3] + c * (sk + sway) - s * und;
    out.y = this.gC[g3 + 1] + s * (sk + sway) + c * und;
    out.z = this.gC[g3 + 2] - Math.abs(sk) * 0.3 + 0.8 * Math.sin(w * 0.8 + k * 1.7);
  }

  /** Chocs avec la Comète : mine déclenchée, ou contact (l'ennemi percuté est détruit sans points). */
  private collide(i: number, ship: Readonly<ShipState>): void {
    const i3 = i * 3;
    const x = this.pos[i3];
    const y = this.pos[i3 + 1];
    const z = this.pos[i3 + 2];
    const dz = z - ship.z;
    if (dz > 6 || dz < -6) return;
    const dx = x - ship.x;
    const dy = y - ship.y;
    const d2 = dx * dx + dy * dy + dz * dz;
    const k = this.kindIx[i];
    if (k === K_MINE) {
      if (d2 >= MINE_TRIGGER_R * MINE_TRIGGER_R) return;
      this.kill(i, false);
      this.events.shipHit('mine', x, y, z);
      return;
    }
    const rr = ENEMY_DEFS[KINDS[k]].radius + ship.r;
    if (d2 >= rr * rr) return;
    this.kill(i, false);
    this.events.shipHit('contact', x, y, z);
  }

  private stepOrbs(h: number, ship: Readonly<ShipState>, live: boolean): void {
    const ob = this.orbs;
    const rr = ORB_R + ship.r;
    let j = 0;
    while (j < this.orbCount) {
      const o = j * ORB_STRIDE;
      ob[o] += ob[o + 3] * h;
      ob[o + 1] += ob[o + 4] * h;
      ob[o + 2] += ob[o + 5] * h;
      ob[o + 6] += h;
      let gone = ob[o + 6] > ORB_LIFE || ob[o + 2] > ship.z + DESPAWN_BEHIND;
      if (!gone && live) {
        const dx = ob[o] - ship.x;
        const dy = ob[o + 1] - ship.y;
        const dz = ob[o + 2] - ship.z;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          gone = true;
          this.particles.burst(ob[o], ob[o + 1], ob[o + 2], 26, 4, 16, C_ORB, 0.9, 0.5, -ship.speed * 0.5);
          this.particles.burst(ob[o], ob[o + 1], ob[o + 2], 10, 2, 8, C_WHITE, 1.2, 0.3, -ship.speed * 0.5);
          this.events.shipHit('orb', ob[o], ob[o + 1], ob[o + 2]);
        }
      }
      if (gone) {
        const last = --this.orbCount * ORB_STRIDE;
        if (last !== o) ob.copyWithin(o, last, last + ORB_STRIDE);
        continue;
      }
      j++;
    }
  }

  /** Libère l'emplacement `i` ; `spoil` : la formation d'essaim perd son bonus (contact, sortie). */
  private release(i: number, spoil: boolean): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    if (this.kindIx[i] !== K_SWARM) return;
    const g = this.sGroup[i];
    if (g < 0) return;
    this.sGroup[i] = -1;
    if (spoil) this.gSpoiled[g] = 1;
    if (this.gAlive[g] > 0) this.gAlive[g]--;
    if (this.gAlive[g] === 0) this.gUsed[g] = 0;
  }

  /** Destruction : par un tir (points, cristaux, compté), ou par la Comète (rien). Éclats, puis événement. */
  private kill(i: number, byShot: boolean): void {
    const k = this.kindIx[i];
    const kind = KINDS[k];
    const i3 = i * 3;
    const x = this.pos[i3];
    const y = this.pos[i3 + 1];
    const z = this.pos[i3 + 2];
    const vz = this.vel[i3 + 2];
    let points = 0;
    let crystals = 0;
    if (byShot) {
      const def = ENEMY_DEFS[kind];
      this.killed++;
      points = def.points;
      crystals = def.crystals;
      if (k === K_SWARM) {
        const g = this.sGroup[i];
        if (g >= 0 && this.gAlive[g] === 1 && !this.gSpoiled[g]) crystals += SWARM_WAVE_CRYSTALS;
      }
    }
    this.release(i, !byShot);
    this.burst(k, x, y, z, vz, byShot);
    this.events.enemyKilled(kind, x, y, z, points, crystals);
  }

  /**
   * Explosion : éclair (lueur blanche puis violette, BLAST_T), gerbes et onde de choc. Chasseur et essaim en
   * blanc chaud et violet, presque sans magenta : une orbe qui vient de partir reste lisible au milieu.
   */
  private burst(k: number, x: number, y: number, z: number, vz: number, byShot: boolean): void {
    const p = this.particles;
    const bvz = vz * 0.6;
    if (k === K_FIGHTER) {
      this.addBlast(x, y, z, 7);
      p.burst(x, y, z, 24, 2, 12, C_WHITE, 1.6, 0.5, bvz);
      p.burst(x, y, z, 18, 3, 14, C_HOT, 1.3, 0.6, bvz);
      p.burst(x, y, z, 30, 8, 26, C_VIOLET, 0.9, 1.1, bvz);
      p.burst(x, y, z, 18, 6, 22, C_PALE, 0.7, 0.9, bvz);
      p.burst(x, y, z, 8, 5, 18, C_VEIN, 0.5, 0.7, bvz);
      p.ring(x, y, z, 1.4, 18, C_PALE, 0.8, 16);
    } else if (k === K_MINE) {
      // Mine : déflagration rouge et onde de choc (plus forte quand elle explose contre la Comète)
      const big = !byShot;
      this.addBlast(x, y, z, big ? 7 : 5.5);
      p.burst(x, y, z, big ? 60 : 36, 6, big ? 26 : 18, C_MINE, big ? 1.3 : 1, 0.8, bvz);
      p.burst(x, y, z, big ? 26 : 14, 2, 10, C_HOT, big ? 2.2 : 1.5, 0.45, bvz);
      p.ring(x, y, z, 1.2, big ? 34 : 22, C_VEIN, 0.8, big ? 20 : 14);
    } else {
      this.addBlast(x, y, z, 3.6);
      p.burst(x, y, z, 14, 4, 14, C_SWARM, 0.8, 0.6, bvz);
      p.burst(x, y, z, 8, 2, 7, C_WHITE, 1, 0.3, bvz);
      p.ring(x, y, z, 0.8, 10, C_PALE, 0.6, 9);
    }
  }

  /** Éclair d'explosion de taille `size` (u) en (x, y, z) ; remplace le plus ancien si tous servent. */
  private addBlast(x: number, y: number, z: number, size: number): void {
    const j = this.blastNext;
    this.blastNext = (j + 1) % BLAST_CAP;
    this.blastPos[j * 3] = x;
    this.blastPos[j * 3 + 1] = y;
    this.blastPos[j * 3 + 2] = z;
    this.blastBirth[j] = this.time;
    this.blastSize[j] = size;
  }

  // ================================================================ Rendu

  /** Écrit les instances visibles (une fois par image, depuis updateVisuals). */
  render(time: number, camZ: number): void {
    if (this.disposed) return;
    this.material.uniforms.uTime.value = time;
    this.glowMat.uniforms.uTime.value = time;
    const ship = this.ship;
    const svx = ship ? ship.vx : 0;
    const svy = ship ? ship.vy : 0;
    const gm = this.glowMesh.instanceMatrix.array as Float32Array;
    const gc = this.glowCol.array as Float32Array;
    let gn = 0;
    for (let k = 0; k < KINDS.length; k++) {
      const mesh = this.meshes[k];
      const st = this.states[k].array as Float32Array;
      let n = 0;
      for (let i = BASE[k]; i < END[k]; i++) {
        if (!this.alive[i]) continue;
        const i3 = i * 3;
        const x = this.pos[i3];
        const y = this.pos[i3 + 1];
        const z = this.pos[i3 + 2];
        if (z > camZ + 2) continue;
        const dist = camZ - z;
        const sc = appear(this.age[i]);
        const g = this.glow[i];
        let glowSize: number;
        let gz = z;
        if (k === K_FIGHTER) {
          if (this.fState[i] === F_BREAK) {
            // Virage : s'incline et tourne le nez vers son côté
            const tb = this.fBreakT[i];
            const sx = this.fSide[i * 2];
            const sy = this.fSide[i * 2 + 1];
            _e.set(-sy * Math.min(0.7, tb * 1.4), sx * Math.min(0.7, tb * 1.6), -sx * Math.min(1.3, tb * 3));
          } else {
            const rvx = this.vel[i3] - svx;
            const rvy = this.vel[i3 + 1] - svy;
            _e.set(clamp(rvy * 0.03, -0.4, 0.4), clamp(rvx * 0.02, -0.3, 0.3), clamp(-rvx * 0.06, -0.6, 0.6));
          }
          _q.setFromEuler(_e);
          _s.setScalar(sc * FIGHTER_SCALE);
          // Œil ambre qui se charge avant le tir, plus petit que le corps (~3,7 u d'envergure) : la silhouette
          // reste visible et on ne le prend pas pour l'orbe magenta qui en part
          const ch = Math.min(1, g);
          glowSize = Math.max(1.2 + 1.4 * ch, dist * 0.01) * sc;
          gz = z + 1.18 * FIGHTER_SCALE;
          const fade = 1 - 0.75 * smoothstep(250, 700, dist);
          const inten = (0.6 + 1.6 * Math.min(g, 1.3) + (ch > 0 && ch < 1 ? 0.4 * ch * Math.sin(time * 30) : 0)) * fade;
          gn = this.putGlow(gm, gc, gn, x, y, gz, glowSize, C_EYE, inten, 0);
        } else if (k === K_MINE) {
          _q.setFromAxisAngle(_mineAxis, time * 0.7 + this.seed[i] * TAU);
          _s.setScalar(sc);
          const fade = 1 - 0.75 * smoothstep(250, 700, dist);
          glowSize = Math.max(3.4, dist * 0.02) * sc;
          gn = this.putGlow(gm, gc, gn, x, y, z, glowSize, C_MINE, (0.3 + 1.5 * g) * fade, 0);
        } else {
          const r = this.sRank[i];
          _e.set(0.1 * Math.sin(time * 3 + r), 0.25 * Math.sin(time * SWARM_OMEGA + r * 0.9), 0.45 * Math.sin(time * 10 + r * 1.3));
          _q.setFromEuler(_e);
          _s.setScalar(sc);
          // Lueur grosse et vive de loin : la vague se lit comme un groupe qui barre le passage
          const fade = 1 - 0.7 * smoothstep(250, 700, dist);
          glowSize = Math.max(2.4, dist * 0.02) * sc;
          gn = this.putGlow(gm, gc, gn, x, y, z + 0.3, glowSize, C_SWARM, (0.8 + 0.5 * g) * fade, 0);
        }
        _p.set(x, y, z);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        const o = n * 4;
        st[o] = this.flash[i];
        st[o + 1] = g;
        st[o + 2] = this.seed[i];
        st[o + 3] = 0;
        n++;
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        this.states[k].needsUpdate = true;
      }
    }
    // Orbes
    const ob = this.orbs;
    for (let j = 0; j < this.orbCount; j++) {
      const o = j * ORB_STRIDE;
      if (ob[o + 2] > camZ + 2) continue;
      const a = Math.min(1, ob[o + 6] / 0.15);
      gn = this.putGlow(gm, gc, gn, ob[o], ob[o + 1], ob[o + 2], ORB_R * 2.9 * (0.4 + 0.6 * a), C_ORB, 1.15, 1 + ob[o + 7] * 0.99);
    }
    // Éclairs d'explosion : grands et blancs, puis plus petits et violets
    for (let j = 0; j < BLAST_CAP; j++) {
      const age = time - this.blastBirth[j];
      if (age < 0 || age > BLAST_T) continue;
      const bz = this.blastPos[j * 3 + 2];
      if (bz > camZ + 2) continue;
      const k = age / BLAST_T;
      _c.copy(C_WHITE).lerp(C_VIOLET, k);
      const size = this.blastSize[j] * (1.1 - 0.55 * k);
      gn = this.putGlow(gm, gc, gn, this.blastPos[j * 3], this.blastPos[j * 3 + 1], bz, size, _c, 2.4 * (1 - k) * (1 - k), 0);
    }
    this.glowMesh.count = gn;
    if (gn > 0) {
      this.glowMesh.instanceMatrix.needsUpdate = true;
      this.glowCol.needsUpdate = true;
    }
  }

  /** Une lueur face caméra : matrice (translation + échelle) écrite directement, couleur × intensité, style. */
  private putGlow(
    gm: Float32Array,
    gc: Float32Array,
    n: number,
    x: number,
    y: number,
    z: number,
    size: number,
    c: THREE.Color,
    inten: number,
    style: number,
  ): number {
    if (n >= GLOW_CAP || size <= 0) return n;
    const o = n * 16;
    gm[o] = size;
    gm[o + 1] = 0;
    gm[o + 2] = 0;
    gm[o + 3] = 0;
    gm[o + 4] = 0;
    gm[o + 5] = size;
    gm[o + 6] = 0;
    gm[o + 7] = 0;
    gm[o + 8] = 0;
    gm[o + 9] = 0;
    gm[o + 10] = size;
    gm[o + 11] = 0;
    gm[o + 12] = x;
    gm[o + 13] = y;
    gm[o + 14] = z;
    gm[o + 15] = 1;
    const q = n * 4;
    gc[q] = c.r * inten;
    gc[q + 1] = c.g * inten;
    gc[q + 2] = c.b * inten;
    gc[q + 3] = style;
    return n + 1;
  }

  // ================================================================ Tirs de la Comète, visée

  /**
   * Propose à `best` (offerAim de shots.ts) l'ennemi vivant le plus proche dans le cône de visée
   * (inAimCone(dx, dy, dz, cosCone, range), dx = ennemi − Comète), avec sa vitesse (visée en avance), sauf
   * s'il est déjà condamné par les tirs en route (pending). Les orbes ne sont pas des cibles.
   */
  aim(x: number, y: number, z: number, cosCone: number, range: number, best: AimTarget): void {
    for (let i = 0; i < TOTAL; i++) {
      if (!this.alive[i] || this.hp[i] - this.pending[i] <= 1e-6) continue;
      const i3 = i * 3;
      const d = inAimCone(this.pos[i3] - x, this.pos[i3 + 1] - y, this.pos[i3 + 2] - z, cosCone, range);
      if (d < 0) continue;
      offerAim(best, 'enemy', i, d, this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2], this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2]);
    }
  }

  /**
   * Premier ennemi vivant touché par le segment (x0, y0, z0) → (x1, y1, z1) d'un tir de rayon `r`
   * (segmentHitsSphere de util.ts, rayon de la fiche + r) : son emplacement, ou −1.
   */
  shotTest(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number): number {
    const zLo = Math.min(z0, z1);
    const zHi = Math.max(z0, z1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len2 = dx * dx + dy * dy + dz * dz;
    let best = -1;
    let bestT = Infinity;
    for (let i = 0; i < TOTAL; i++) {
      if (!this.alive[i]) continue;
      const i3 = i * 3;
      const cz = this.pos[i3 + 2];
      const rr = ENEMY_DEFS[KINDS[this.kindIx[i]]].radius + r;
      if (cz < zLo - rr || cz > zHi + rr) continue;
      const cx = this.pos[i3];
      const cy = this.pos[i3 + 1];
      if (!segmentHitsSphere(x0, y0, z0, x1, y1, z1, cx, cy, cz, rr)) continue;
      // Le plus proche du départ du segment
      const t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy + (cz - z0) * dz) / len2 : 0;
      if (t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  }

  /**
   * Dégâts d'un tir sur l'ennemi `i` (non arrondis, comme enemies.hit en 2D) : éclair de touche ; mort :
   * events.enemyKilled (points et cristaux de la fiche), renvoie true. Ennemi déjà mort : false.
   */
  damage(i: number, amount: number): boolean {
    if (i < 0 || i >= TOTAL || !this.alive[i]) return false;
    this.hp[i] -= amount;
    this.flash[i] = 1;
    if (this.hp[i] > 1e-6) {
      const i3 = i * 3;
      this.particles.burst(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2] + 0.6, 6, 3, 10, C_HOT, 0.4, 0.25, this.vel[i3 + 2] * 0.6);
      return false;
    }
    this.kill(i, true);
    return true;
  }

  /** Type de l'ennemi à l'emplacement `i` (cible de la visée, __xr3d.info). */
  kindOf(i: number): EnemyKind {
    return KINDS[i >= 0 && i < TOTAL ? this.kindIx[i] : K_MINE];
  }

  /**
   * Aide DEV (__xr3d.spawn) : place un ennemi (essaim : une formation entière) centré en (x, y, z), hors
   * vagues ; renvoie le nombre d'ennemis placés (0 si le pool est plein). `variant` (0..1) décide de tout ce qui
   * varie, comme WaveData.variant : clignotement de la mine ; orientation de l'essaim et phase de son ondulation,
   * comptée depuis la pose (même mouvement quelle que soit l'heure du vol) ; côté du virage du chasseur.
   * Chasseur : tenu à cette distance de la Comète (au moins FIGHTER_HOLD_MIN, donc à portée du canon si elle est
   * courte), il charge pendant 0,6 × FIGHTER_HOLD_SPAN u de trajet, tire, puis vire.
   */
  spawn(kind: EnemyKind, x: number, y: number, z: number, variant: number): number {
    if (this.disposed) return 0;
    const v = variant - Math.floor(variant);
    if (kind === 'mine') {
      const l = Math.hypot(x, y);
      return l > 0.5 ? this.addMine(x, y, z, -x / l, -y / l, v) : this.addMine(x, y, z, 0, 1, v);
    }
    if (kind === 'swarm') return this.addSwarm(x, y, z, 6, v * Math.PI, v * TAU * 3 - this.time * SWARM_OMEGA);
    const shipZ = this.ship ? this.ship.z : z + 120;
    const d = Math.max(FIGHTER_HOLD_MIN, shipZ - z);
    const holdAt = shipZ - 1;
    const a = v * TAU;
    return this.addFighter(x, y, shipZ - d, shipZ, d, holdAt, holdAt - FIGHTER_HOLD_SPAN * 0.6, 0, 0, Math.cos(a), Math.sin(a) * 0.6, v);
  }

  /**
   * Pilote automatique (outil DEV) : si une mine, un membre d'essaim ou une orbe menace la Comète en z dans les
   * ~1,5 s à venir (vitesse d'avance `speed`), écart latéral conseillé (u, ajouté au point visé sur la
   * trajectoire) écrit dans `out`, et true ; sinon false (out inchangé). Chaque menace est jugée là où passera
   * la trajectoire idéale (que suit le pilote), essaim et orbes à leur position au moment du croisement ; l'écart
   * retenu est le meilleur de quelques candidats pour toutes les menaces à la fois (deux orbes d'une paire,
   * mines, trou dans un essaim), proche du précédent. `_x`, `_y` : position actuelle (inutilisée).
   */
  avoid(_x: number, _y: number, z: number, speed: number, out: { x: number; y: number }): boolean {
    const sp = Math.max(speed, 5);
    const horizon = sp * AVOID_T;
    const th = this.threats;
    const cand = this.cands;
    let nt = 0;
    let nc = 1;
    cand[0] = cand[1] = 0;
    let danger = false;
    // Menaces : vecteur menace → trajectoire (rel), rayon à garder, poids (les plus proches comptent plus)
    for (let i = 0; i < TOTAL; i++) {
      if (!this.alive[i]) continue;
      const k = this.kindIx[i];
      if (k === K_FIGHTER) continue;
      const i3 = i * 3;
      const ez = this.pos[i3 + 2];
      const dz = z - ez;
      if (dz < -2 || dz > horizon) continue;
      pathAt(this.path, ez, _pp);
      let ex: number;
      let ey: number;
      if (k === K_MINE) {
        ex = this.anchor[i3];
        ey = this.anchor[i3 + 1];
      } else {
        // Essaim : là où le membre sera quand la Comète passera
        this.swarmAt(i, this.time + Math.max(0, dz) / sp, _spot);
        ex = _spot.x;
        ey = _spot.y;
      }
      const rx = _pp.x - ex;
      const ry = _pp.y - ey;
      const need = k === K_MINE ? MINE_TRIGGER_R + 1.1 : ENEMY_DEFS.swarm.radius + 1.05 + 0.9;
      const d = Math.hypot(rx, ry);
      if (d >= need + AVOID_MAX) continue;
      if (d < need) danger = true;
      nt = this.pushThreat(th, nt, rx, ry, need, 2 - dz / horizon);
      if (d >= need) continue;
      if (k === K_MINE) {
        // Vers le côté laissé libre à la génération
        const mx = this.dodge[i * 2];
        const my = this.dodge[i * 2 + 1];
        const push = need + 0.3 - (rx * mx + ry * my);
        nc = this.pushCand(cand, nc, mx * push, my * push);
      } else if (d > 0.05) {
        nc = this.pushCand(cand, nc, (rx / d) * (need + 0.3 - d), (ry / d) * (need + 0.3 - d));
      }
    }
    const ob = this.orbs;
    for (let j = 0; j < this.orbCount; j++) {
      const o = j * ORB_STRIDE;
      const closing = sp + ob[o + 5];
      if (closing <= 1) continue;
      const t = (z - ob[o + 2]) / closing;
      if (t < 0 || t > AVOID_T) continue;
      pathAt(this.path, z - sp * t, _pp);
      const rx = _pp.x - (ob[o] + ob[o + 3] * t);
      const ry = _pp.y - (ob[o + 1] + ob[o + 4] * t);
      const need = ORB_R + 1.05 + 1.0;
      const d = Math.hypot(rx, ry);
      if (d >= need + AVOID_MAX) continue;
      if (d < need) danger = true;
      nt = this.pushThreat(th, nt, rx, ry, need, 2 - t / AVOID_T);
      if (d >= need) continue;
      if (d > 0.05) nc = this.pushCand(cand, nc, (rx / d) * (need + 0.3 - d), (ry / d) * (need + 0.3 - d));
      // De part et d'autre de sa course
      const vl = Math.hypot(ob[o + 3], ob[o + 4]);
      const qx = vl > 1e-3 ? -ob[o + 4] / vl : 1;
      const qy = vl > 1e-3 ? ob[o + 3] / vl : 0;
      nc = this.pushCand(cand, nc, qx * (need + 0.3), qy * (need + 0.3));
      nc = this.pushCand(cand, nc, -qx * (need + 0.3), -qy * (need + 0.3));
    }
    if (!danger) {
      this.avoidX = this.avoidY = 0;
      return false;
    }
    // Couronne fixe en plus des candidats des menaces
    for (let a = 0; a < 8; a++) nc = this.pushCand(cand, nc, Math.cos(a * 0.785398) * 3.4, Math.sin(a * 0.785398) * 3.4);
    let best = 0;
    let bestScore = Infinity;
    for (let c = 0; c < nc; c++) {
      const cx = cand[c * 2];
      const cy = cand[c * 2 + 1];
      let score = 0.03 * (cx * cx + cy * cy);
      const px = cx - this.avoidX;
      const py = cy - this.avoidY;
      score += 0.08 * (px * px + py * py);
      for (let j = 0; j < nt; j++) {
        const o = j * 4;
        const v = th[o + 2] - Math.hypot(th[o] + cx, th[o + 1] + cy);
        if (v > 0) score += th[o + 3] * v * v * 10;
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    this.avoidX = cand[best * 2];
    this.avoidY = cand[best * 2 + 1];
    out.x = this.avoidX;
    out.y = this.avoidY;
    return true;
  }

  private pushThreat(th: Float64Array, n: number, rx: number, ry: number, need: number, w: number): number {
    if (n * 4 + 4 > th.length) return n;
    th[n * 4] = rx;
    th[n * 4 + 1] = ry;
    th[n * 4 + 2] = need;
    th[n * 4 + 3] = w;
    return n + 1;
  }

  /** Candidat d'écart, borné à AVOID_MAX. */
  private pushCand(cand: Float64Array, n: number, cx: number, cy: number): number {
    if (n * 2 + 2 > cand.length) return n;
    const l = Math.hypot(cx, cy);
    const k = l > AVOID_MAX ? AVOID_MAX / l : 1;
    cand[n * 2] = cx * k;
    cand[n * 2 + 1] = cy * k;
    return n + 1;
  }

  /** Comptes actuels écrits dans `out`. */
  counts(out: EnemyCounts): EnemyCounts {
    out.fighter = out.mine = out.swarm = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (!this.alive[i]) continue;
      const k = this.kindIx[i];
      if (k === K_FIGHTER) out.fighter++;
      else if (k === K_MINE) out.mine++;
      else out.swarm++;
    }
    out.killed = this.killed;
    out.orbs = this.orbCount;
    return out;
  }

  /** Libère ce qui n'est pas dans le Bin de la partie (tampons d'instances) et vide les pools. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.alive.fill(0);
    this.gUsed.fill(0);
    this.orbCount = 0;
    for (const m of this.meshes) {
      m.count = 0;
      m.dispose();
    }
    this.glowMesh.count = 0;
    this.glowMesh.dispose();
    this.group.clear();
    this.ship = null;
  }
}
