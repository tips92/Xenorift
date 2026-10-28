import * as THREE from 'three';
import type { Bin } from './util';

// Cristaux du vol (docs/plans/03-hangar.md, 3b) : lâchés par les astéroïdes et les ennemis abattus, petits
// cristaux lumineux en InstancedMesh (pool), aimantés quand la Comète passe près, ramassés au contact
// (+1 réserve chacun, points). Couleurs fixes, celles de l'icône du HUD et du cristal 2D (cyan clair → bleu),
// quel que soit le parcours : les facettes des rochers (couleur du thème) ne s'y confondent pas. Chaque cristal a
// un halo additif face caméra qui pulse et un éclat bref (croix blanche). 2 appels de dessin. Aucune allocation
// en vol.

/** Cristaux simultanés au plus. */
export const PICKUP_CAP = 40;
/** Rayon de l'aimant (u, depuis le centre de la Comète) : au-delà, le cristal dérive sur place. */
export const MAGNET_R = 7;
/** Rayon de ramassage (u). */
export const PICK_R = 1.6;
/** Couleur des cristaux du vol (halo, scintillement du ramassage) : cyan de l'icône. */
export const PICKUP_COLOR = 0x3ff7ff;

/** Aimanté : la distance à la Comète fond de ce taux (/s) et de cette vitesse (u/s), dans son repère. */
const MAGNET_RATE = 7;
const MAGNET_SPEED = 26;
/** Freinage de la dérive (/s). */
const DRAG = 1.6;
/**
 * Lâché, un cristal glisse vers la ligne de la Comète de cette part de l'écart latéral : les rochers du couloir
 * sont à 7-13 u de la trajectoire idéale, le cristal finit à portée de l'aimant si on garde sa ligne.
 */
const PULL = 0.45;
/** Retiré une fois passé derrière la Comète de plus que ça (la caméra suit à ~9,5 u). */
const BEHIND = 12;
/** Taille d'un cristal (u) : demi-hauteur, demi-largeur. */
const HALF_H = 0.87;
const HALF_W = 0.5;
/** Halo : rayon minimal (u) et par unité de distance à la caméra (lisible de loin). */
const HALO_R = 1.7;
const HALO_PER_U = 0.028;

// État : position, vitesse, phase (rotation, scintillement), aimanté (0 / 1)
const P_X = 0;
const P_Y = 1;
const P_Z = 2;
const P_VX = 3;
const P_VY = 4;
const P_VZ = 5;
const P_PHASE = 6;
const P_MAG = 7;
const STRIDE = 8;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _halo = new THREE.Color(PICKUP_COLOR);

/**
 * Bipyramide à 6 pans, pointe haute courte et pointe basse longue (comme le cristal 2D), facettes aux couleurs
 * de l'icône : claires presque blanches en haut, cyan et bleues en bas. Sans éclairage : la rotation fait
 * passer les facettes claires et sombres.
 */
function crystalGeometry(): THREE.BufferGeometry {
  const top = ['#e8feff', '#9ffbff'];
  const bottom = ['#3ff7ff', '#2a7dff'];
  const RING_Y = 0.3;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const a1 = ((k + 1) / 6) * Math.PI * 2;
    const x0 = Math.cos(a0);
    const z0 = Math.sin(a0);
    const x1 = Math.cos(a1);
    const z1 = Math.sin(a1);
    // Facette du haut, puis du bas (sens des triangles : faces vers l'extérieur)
    pos.push(0, 1, 0, x1, RING_Y, z1, x0, RING_Y, z0);
    c.set(top[k % 2]);
    for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
    pos.push(0, -1, 0, x0, RING_Y, z0, x1, RING_Y, z1);
    c.set(bottom[k % 2]);
    for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Halo face caméra (une instance = un quad) : lueur radiale + croix blanche de l'éclat (aCol.w).
const HALO_VERT = /* glsl */ `
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

const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float k = 1.0 - r;
  vec3 rgb = vCol.rgb * (k * k);
  float cross = max(1.0 - smoothstep(0.0, 0.07, abs(vUv.x)), 1.0 - smoothstep(0.0, 0.07, abs(vUv.y)));
  rgb += vec3(1.0) * vCol.w * cross * k * k * k * 2.2;
  gl_FragColor = vec4(rgb, 1.0);
  #include <colorspace_fragment>
}
`;

export class CrystalPickups {
  /** Cristaux et leurs halos (ajouté à la scène par FlightRun). */
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  private readonly halo: THREE.InstancedMesh;
  private readonly haloCol: THREE.InstancedBufferAttribute;
  private readonly cap: number;
  private count = 0;
  private readonly st: Float32Array;
  /** Position de la Comète au sous-pas précédent : un cristal aimanté suit son déplacement. */
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private hasPrev = false;

  constructor(cap: number, bin: Bin) {
    this.cap = cap;
    this.st = new Float32Array(cap * STRIDE);
    const geo = bin.add(crystalGeometry());
    const mat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const plane = bin.add(new THREE.PlaneGeometry(1, 1));
    plane.deleteAttribute('normal');
    plane.deleteAttribute('uv');
    this.haloCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.haloCol.setUsage(THREE.DynamicDrawUsage);
    plane.setAttribute('aCol', this.haloCol);
    const haloMat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halo = new THREE.InstancedMesh(plane, haloMat, cap);
    this.halo.count = 0;
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh, this.halo);
  }

  /** Cristaux en jeu. */
  get active(): number {
    return this.count;
  }

  /**
   * Lâche `n` cristaux autour de (x, y, z), un peu éparpillés et poussés vers la ligne de la Comète (PULL) ;
   * pool plein : les suivants sont ignorés. Renvoie le nombre de cristaux lâchés.
   */
  spawn(x: number, y: number, z: number, n: number): number {
    const st = this.st;
    // Vitesse initiale qui, freinée par DRAG, parcourt PULL × l'écart latéral
    const pvx = this.hasPrev ? (this.prevX - x) * PULL * DRAG : 0;
    const pvy = this.hasPrev ? (this.prevY - y) * PULL * DRAG : 0;
    let placed = 0;
    for (let k = 0; k < n && this.count < this.cap; k++) {
      const o = this.count++ * STRIDE;
      const a = Math.random() * Math.PI * 2;
      const sp = n > 1 ? 2.5 + Math.random() * 2.5 : 1 + Math.random() * 1.5;
      st[o + P_X] = x;
      st[o + P_Y] = y;
      st[o + P_Z] = z;
      st[o + P_VX] = pvx + Math.cos(a) * sp;
      st[o + P_VY] = pvy + Math.sin(a) * sp;
      st[o + P_VZ] = (Math.random() - 0.5) * 3;
      st[o + P_PHASE] = Math.random() * Math.PI * 2;
      st[o + P_MAG] = 0;
      placed++;
    }
    return placed;
  }

  /**
   * Un sous-pas : dérive, aimant vers la Comète (MAGNET_R) et ramassage (PICK_R) si `collect` (phase 'fly'
   * seulement) ; cristaux passés derrière la caméra retirés. Renvoie le nombre de cristaux ramassés.
   */
  update(h: number, time: number, shipX: number, shipY: number, shipZ: number, collect: boolean): number {
    void time;
    const st = this.st;
    const drag = Math.exp(-DRAG * h);
    const shrink = Math.exp(-MAGNET_RATE * h);
    if (!this.hasPrev) {
      this.prevX = shipX;
      this.prevY = shipY;
      this.prevZ = shipZ;
      this.hasPrev = true;
    }
    let got = 0;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      let rx = st[o + P_X] - shipX;
      let ry = st[o + P_Y] - shipY;
      let rz = st[o + P_Z] - shipZ;
      let d = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (collect && st[o + P_MAG] === 0 && d < MAGNET_R) st[o + P_MAG] = 1;
      if (collect && st[o + P_MAG] === 1) {
        // Aimanté : suit la Comète (écart pris dans son repère, avant son déplacement) en se rapprochant,
        // quelle que soit sa vitesse
        rx = st[o + P_X] - this.prevX;
        ry = st[o + P_Y] - this.prevY;
        rz = st[o + P_Z] - this.prevZ;
        d = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const nd = Math.max(0, d * shrink - MAGNET_SPEED * h);
        const k = d > 1e-6 ? nd / d : 0;
        rx *= k;
        ry *= k;
        rz *= k;
        d = nd;
        st[o + P_X] = shipX + rx;
        st[o + P_Y] = shipY + ry;
        st[o + P_Z] = shipZ + rz;
      } else {
        st[o + P_VX] *= drag;
        st[o + P_VY] *= drag;
        st[o + P_VZ] *= drag;
        st[o + P_X] += st[o + P_VX] * h;
        st[o + P_Y] += st[o + P_VY] * h;
        st[o + P_Z] += st[o + P_VZ] * h;
      }
      if (collect && d <= PICK_R) {
        got++;
        this.remove(i);
        continue;
      }
      if (st[o + P_Z] > shipZ + BEHIND) {
        this.remove(i);
        continue;
      }
      i++;
    }
    this.prevX = shipX;
    this.prevY = shipY;
    this.prevZ = shipZ;
    return got;
  }

  /**
   * Écrit les instances une fois par image : rotation et pulsation des cristaux, halos (plus grands de loin,
   * `camZ` : profondeur de la caméra) et éclat bref, à son rythme pour chaque cristal.
   */
  render(time: number, camZ: number): void {
    const st = this.st;
    const n = this.count;
    const hm = this.halo.instanceMatrix.array as Float32Array;
    const hc = this.haloCol.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const ph = st[o + P_PHASE];
      _e.set(0.25 * Math.sin(time * 1.3 + ph), time * 2.6 + ph, 0.18 * Math.cos(time * 1.7 + ph));
      _q.setFromEuler(_e);
      const pulse = 1 + 0.14 * Math.sin(time * 7 + ph * 3);
      _s.set(HALF_W * pulse, HALF_H * pulse, HALF_W * pulse);
      const x = st[o + P_X];
      const y = st[o + P_Y];
      const z = st[o + P_Z];
      _p.set(x, y, z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      // Halo : translation + échelle écrites directement (face caméra dans le shader)
      const size = Math.max(HALO_R, (camZ - z) * HALO_PER_U) * (0.85 + 0.25 * Math.sin(time * 4.5 + ph));
      const m = i * 16;
      hm[m] = size;
      hm[m + 1] = 0;
      hm[m + 2] = 0;
      hm[m + 3] = 0;
      hm[m + 4] = 0;
      hm[m + 5] = size;
      hm[m + 6] = 0;
      hm[m + 7] = 0;
      hm[m + 8] = 0;
      hm[m + 9] = 0;
      hm[m + 10] = size;
      hm[m + 11] = 0;
      hm[m + 12] = x;
      hm[m + 13] = y;
      hm[m + 14] = z;
      hm[m + 15] = 1;
      // Éclat : ~0,15 s toutes les ~1,6 s (phase propre à chaque cristal)
      const g = Math.sin(time * 3.9 + ph * 2.3);
      const glint = g > 0.93 ? (g - 0.93) / 0.07 : 0;
      const inten = 0.55 + 0.2 * pulse;
      const c = i * 4;
      hc[c] = _halo.r * inten;
      hc[c + 1] = _halo.g * inten;
      hc[c + 2] = _halo.b * inten;
      hc[c + 3] = glint;
    }
    this.mesh.count = n;
    this.halo.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.halo.instanceMatrix.needsUpdate = true;
      this.haloCol.needsUpdate = true;
    }
  }

  /** Retire tous les cristaux. */
  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
    this.halo.count = 0;
    this.hasPrev = false;
  }

  /** Retire le cristal `i` (le dernier prend sa place). */
  private remove(i: number): void {
    const j = --this.count;
    if (i !== j) this.st.copyWithin(i * STRIDE, j * STRIDE, j * STRIDE + STRIDE);
  }
}
