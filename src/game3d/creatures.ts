import * as THREE from 'three';
import { GLSL_NOISE } from './glsl';
import type { Bin } from './util';

// Créatures géantes au loin : un corps tubulaire continu dont chaque anneau suit la trajectoire
// de la tête avec un retard (nage sinueuse naturelle). Le tube est reconstruit à chaque image
// (quelques centaines de sommets, tampons réutilisés).
// Vol 1 : léviathan bioluminescent (nageoires translucides, yeux et leurre lumineux).
// Vol 2 : ver cosmique rocheux aux jointures incandescentes qui tourne autour de la planète à anneaux.
// Ce qui distingue chaque genre est dans LOOKS.

export type CreatureKind = 'leviathan' | 'worm';

export interface CreatureSpec {
  kind: CreatureKind;
  /** Nombre d'anneaux du tube (de la tête à la queue). */
  rings: number;
  /** Retard (s) entre deux anneaux le long de la trajectoire. */
  lag: number;
  radius(i: number, n: number): number;
  /** Position de l'anneau i à l'instant t, relative à l'ancre. */
  path(t: number, i: number, out: THREE.Vector3): void;
  /** Nombre de motifs (taches / segments) le long du corps. */
  pattern: number;
  /** Taille des points lumineux (1 : celle du genre). Le boss du couloir les réduit. */
  lightScale?: number;
  /** Taille des nageoires (1 : celle du genre). Le boss du couloir les réduit : le rayon y est petit. */
  finScale?: number;
  light: THREE.Vector3;
  body: string;
  belly: string;
  rim: string;
  spotA: string;
  spotB: string;
}

const RADIAL = 18;

const BODY_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BODY_FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uBelly;
uniform vec3 uRim;
uniform vec3 uSpotA;
uniform vec3 uSpotB;
uniform vec3 uLight;
uniform float uTime;
uniform float uPattern;
uniform float uKind;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
${GLSL_NOISE}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float th = vUv.x * 6.2831853;
  float s = sin(th);
  float c = cos(th);
  float along = vUv.y * uPattern;
  float diff = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  float wave = 0.5 + 0.5 * sin(uTime * 2.4 - vUv.y * 22.0);
  float ends = smoothstep(0.02, 0.08, vUv.y) * (1.0 - smoothstep(0.9, 0.99, vUv.y));
  vec3 col;
  if (uKind < 0.5) {
    // Léviathan : dos sombre, ventre clair, deux rangées de taches lumineuses, crête magenta
    float belly = smoothstep(-0.15, -0.75, c);
    col = mix(uBody, uBelly, belly) * (0.2 + 0.95 * diff);
    float side = smoothstep(0.35, 0.6, abs(s));
    float ca = fract(along) - 0.5;
    float spotA = smoothstep(0.3, 0.1, length(vec2(ca * 1.1, (c - 0.18) * 2.4))) * side;
    float cb = fract(along + 0.5) - 0.5;
    float spotB = smoothstep(0.24, 0.07, length(vec2(cb * 1.2, (c + 0.42) * 2.8))) * side;
    float ridge = smoothstep(0.94, 1.0, c) * smoothstep(0.2, 0.0, abs(fract(along * 2.0) - 0.5) - 0.18);
    col += uSpotA * spotA * (0.7 + 2.0 * wave) * ends;
    col += uSpotB * (spotB * (0.6 + 1.5 * (1.0 - wave)) + ridge * (0.8 + 1.2 * wave)) * ends;
    col += uRim * rim * (0.5 + 0.6 * smoothstep(-0.2, 0.8, c));
    col += uSpotB * smoothstep(0.03, 0.0, vUv.y) * 0.6;
  } else {
    // Ver cosmique : plaques rocheuses, jointures incandescentes, gueule de braise
    float rock = xrNoise(vec3(s * 3.0 + 7.0, c * 3.0, vUv.y * 70.0));
    float rock2 = xrNoise(vec3(s * 9.0, c * 9.0 + 3.0, vUv.y * 210.0));
    float belly = smoothstep(-0.2, -0.8, c);
    col = mix(uBody, uBelly, belly) * (0.35 + 0.6 * rock + 0.25 * rock2) * (0.12 + 0.85 * diff);
    float seg = fract(along);
    float seam = smoothstep(0.14, 0.0, seg) + smoothstep(0.86, 1.0, seg);
    col += uSpotA * seam * (0.5 + 1.0 * wave) * (0.55 + 0.6 * belly) * ends;
    col += uSpotB * smoothstep(0.82, 0.95, rock2) * belly * 0.6 * ends;
    col += uRim * rim * 0.45;
    float mouth = smoothstep(0.05, 0.0, vUv.y);
    col += mix(uSpotA, uSpotB, wave) * mouth * 2.2;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const FIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`;

const FIN_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uTime;
varying vec2 vUv;
void main() {
  float span = clamp(vUv.x, 0.0, 1.0);
  float ang = atan(vUv.y + 0.4, vUv.x + 0.05);
  float veins = pow(0.5 + 0.5 * sin(ang * 26.0), 6.0);
  float pulse = 0.6 + 0.4 * sin(uTime * 2.0 - span * 6.0);
  float a = (0.14 + 0.45 * veins * pulse) * (1.0 - span * 0.35);
  vec3 col = mix(uA, uB, span);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/** Repères des anneaux du corps, recalculés à chaque image (tampons réutilisés). */
interface Rings {
  readonly n: number;
  readonly pts: THREE.Vector3[];
  readonly fwd: THREE.Vector3[];
  readonly right: THREE.Vector3[];
  readonly up: THREE.Vector3[];
  readonly quats: THREE.Quaternion[];
  readonly radii: Float32Array;
}

/** Ce qui distingue un genre de créature : corps, nageoires, points lumineux. */
interface CreatureLook {
  /** Branche du shader du corps (uKind). */
  shader: number;
  /** Aplatissement vertical du corps (1 : section ronde). */
  flat: number;
  /** Nageoires translucides : 2 pectorales et 2 lobes de queue. */
  fins: boolean;
  /** Nombre de points lumineux pour n anneaux. */
  lightCount(n: number): number;
  /** Point lumineux i : couleur spotB (sinon spotA) et taille. */
  lightB(i: number): boolean;
  lightSize(i: number): number;
  /** Positions des points lumineux (x, y, z à la suite). */
  placeLights(r: Rings, time: number, out: Float32Array): void;
}

/** Léviathan : yeux et leurre au bout d'une antenne. */
function leviathanLights(r: Rings, time: number, lp: Float32Array): void {
  const hi = 2;
  const hr = r.radii[hi];
  for (let k = 0; k < 2; k++) {
    _v.set((k === 0 ? 1 : -1) * hr * 0.62, hr * 0.32, hr * 0.2).applyQuaternion(r.quats[hi]).add(r.pts[hi]);
    lp[k * 3] = _v.x;
    lp[k * 3 + 1] = _v.y;
    lp[k * 3 + 2] = _v.z;
  }
  _v.set(Math.sin(time * 1.3) * hr * 0.25, hr * 1.6 + Math.sin(time * 2.1) * hr * 0.15, hr * 1.9)
    .applyQuaternion(r.quats[0])
    .add(r.pts[0]);
  lp[6] = _v.x;
  lp[7] = _v.y;
  lp[8] = _v.z;
}

/** Ver : lueur de la gueule, puis braises le long du dos. */
function wormLights(r: Rings, _time: number, lp: Float32Array): void {
  _v.copy(r.fwd[0]).multiplyScalar(r.radii[0] * 0.2).add(r.pts[0]);
  lp[0] = _v.x;
  lp[1] = _v.y;
  lp[2] = _v.z;
  const count = lp.length / 3;
  for (let k = 1; k < count; k++) {
    const i = Math.min(r.n - 1, k * 5);
    _v.copy(r.up[i]).multiplyScalar(r.radii[i] * 1.02).add(r.pts[i]);
    lp[k * 3] = _v.x;
    lp[k * 3 + 1] = _v.y;
    lp[k * 3 + 2] = _v.z;
  }
}

/** Par genre : un genre oublié fait échouer tsc. */
const LOOKS: Record<CreatureKind, CreatureLook> = {
  leviathan: {
    shader: 0,
    flat: 0.82,
    fins: true,
    lightCount: () => 3,
    lightB: (i) => i < 2,
    lightSize: (i) => (i < 2 ? 34 : 70),
    placeLights: leviathanLights,
  },
  worm: {
    shader: 1,
    flat: 1,
    fins: false,
    lightCount: (n) => 1 + Math.floor(n / 5),
    lightB: (i) => i === 0,
    lightSize: (i) => (i === 0 ? 150 : 60),
    placeLights: wormLights,
  },
};

export class Creature {
  readonly group = new THREE.Group();
  private readonly spec: CreatureSpec;
  private readonly look: CreatureLook;
  private readonly n: number;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly nrmAttr: THREE.BufferAttribute;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly fins: THREE.InstancedMesh | null = null;
  private readonly lightPos: Float32Array;
  private readonly lightAttr: THREE.BufferAttribute;
  private readonly rings: Rings;
  private readonly bodyU: { uTime: { value: number } };
  private readonly finU: { uTime: { value: number } } | null = null;
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;

  constructor(spec: CreatureSpec, glowMaterial: THREE.ShaderMaterial, bin: Bin) {
    this.spec = spec;
    const look = LOOKS[spec.kind];
    this.look = look;
    const n = spec.rings;
    this.n = n;
    const rings: Rings = { n, pts: [], fwd: [], right: [], up: [], quats: [], radii: new Float32Array(n) };
    this.rings = rings;
    for (let i = 0; i < n; i++) {
      rings.radii[i] = spec.radius(i, n);
      rings.pts.push(new THREE.Vector3());
      rings.fwd.push(new THREE.Vector3());
      rings.right.push(new THREE.Vector3());
      rings.up.push(new THREE.Vector3());
      rings.quats.push(new THREE.Quaternion());
    }
    this.cosT = new Float32Array(RADIAL + 1);
    this.sinT = new Float32Array(RADIAL + 1);
    for (let j = 0; j <= RADIAL; j++) {
      const th = (j / RADIAL) * Math.PI * 2;
      this.cosT[j] = Math.cos(th);
      this.sinT[j] = Math.sin(th);
    }

    // --- Tube : sommets dynamiques, UV et indices fixes
    const vc = n * (RADIAL + 1);
    const pos = new Float32Array(vc * 3);
    const nrm = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= RADIAL; j++) {
        const k = i * (RADIAL + 1) + j;
        uv[k * 2] = j / RADIAL;
        uv[k * 2 + 1] = i / (n - 1);
        if (i < n - 1 && j < RADIAL) {
          const a = k;
          const b = k + RADIAL + 1;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    this.bodyGeo = bin.add(new THREE.BufferGeometry());
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.bodyGeo.setAttribute('position', this.posAttr);
    this.bodyGeo.setAttribute('normal', this.nrmAttr);
    this.bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.bodyGeo.setIndex(index);
    this.bodyU = { uTime: { value: 0 } };
    const mat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: BODY_VERT,
        fragmentShader: BODY_FRAG,
        uniforms: {
          ...this.bodyU,
          uBody: { value: new THREE.Color(spec.body) },
          uBelly: { value: new THREE.Color(spec.belly) },
          uRim: { value: new THREE.Color(spec.rim) },
          uSpotA: { value: new THREE.Color(spec.spotA) },
          uSpotB: { value: new THREE.Color(spec.spotB) },
          uLight: { value: spec.light },
          uPattern: { value: spec.pattern },
          uKind: { value: look.shader },
        },
      }),
    );
    const body = new THREE.Mesh(this.bodyGeo, mat);
    body.frustumCulled = false;
    this.group.add(body);

    if (look.fins) {
      // Nageoires translucides (2 pectorales + 2 lobes de queue)
      const s = new THREE.Shape();
      s.moveTo(0, -0.3);
      s.quadraticCurveTo(0.55, -0.32, 1.0, 0.2);
      s.quadraticCurveTo(0.62, 0.12, 0.38, 0.42);
      s.quadraticCurveTo(0.16, 0.38, 0, 0.32);
      s.closePath();
      const fg = bin.add(new THREE.ShapeGeometry(s, 10));
      fg.rotateX(-Math.PI / 2);
      this.finU = { uTime: { value: 0 } };
      const fm = bin.add(
        new THREE.ShaderMaterial({
          vertexShader: FIN_VERT,
          fragmentShader: FIN_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: {
            ...this.finU,
            uA: { value: new THREE.Color(spec.spotA) },
            uB: { value: new THREE.Color(spec.spotB) },
          },
        }),
      );
      this.fins = new THREE.InstancedMesh(fg, fm, 4);
      this.fins.frustumCulled = false;
      this.fins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(this.fins);
    }

    // Points lumineux : yeux + leurre (léviathan) ou gueule + braises dorsales (ver)
    const lightCount = look.lightCount(n);
    this.lightPos = new Float32Array(lightCount * 3);
    const col = new Float32Array(lightCount * 3);
    const size = new Float32Array(lightCount);
    const alpha = new Float32Array(lightCount).fill(1);
    const ca = new THREE.Color(spec.spotA);
    const cb = new THREE.Color(spec.spotB);
    for (let i = 0; i < lightCount; i++) {
      const c = look.lightB(i) ? cb : ca;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = look.lightSize(i) * (spec.lightScale ?? 1);
    }
    const lg = bin.add(new THREE.BufferGeometry());
    this.lightAttr = new THREE.BufferAttribute(this.lightPos, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', this.lightAttr);
    lg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    lg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    lg.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const lights = new THREE.Points(lg, glowMaterial);
    lights.frustumCulled = false;
    this.group.add(lights);
  }

  update(time: number, anchor: THREE.Vector3): void {
    const spec = this.spec;
    const n = this.n;
    const { pts, fwd, right, up, quats, radii } = this.rings;
    this.group.position.copy(anchor);
    this.bodyU.uTime.value = time;
    if (this.finU) this.finU.uTime.value = time;
    for (let i = 0; i < n; i++) spec.path(time - i * spec.lag, i, pts[i]);

    // Repères des anneaux, sans vrille : le dos reste orienté vers le haut
    for (let i = 0; i < n; i++) {
      if (i === 0) _t.subVectors(pts[0], pts[1]);
      else if (i === n - 1) _t.subVectors(pts[n - 2], pts[n - 1]);
      else _t.subVectors(pts[i - 1], pts[i + 1]);
      if (_t.lengthSq() < 1e-6) _t.set(0, 0, 1);
      const f = fwd[i].copy(_t).normalize();
      const r = right[i].crossVectors(Y_AXIS, f);
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      r.normalize();
      up[i].crossVectors(f, r);
      _mb.makeBasis(r, up[i], f);
      quats[i].setFromRotationMatrix(_mb);
    }

    // Sommets du tube
    const pos = this.posAttr.array as Float32Array;
    const nrm = this.nrmAttr.array as Float32Array;
    const flat = this.look.flat;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const r = right[i];
      const u = up[i];
      const rad = radii[i];
      for (let j = 0; j <= RADIAL; j++) {
        const s = this.sinT[j];
        const c = this.cosT[j];
        const nx = r.x * s + u.x * c;
        const ny = r.y * s + u.y * c;
        const nz = r.z * s + u.z * c;
        const k = (i * (RADIAL + 1) + j) * 3;
        pos[k] = p.x + (r.x * s + u.x * c * flat) * rad;
        pos[k + 1] = p.y + (r.y * s + u.y * c * flat) * rad;
        pos[k + 2] = p.z + (r.z * s + u.z * c * flat) * rad;
        nrm[k] = nx;
        nrm[k + 1] = ny;
        nrm[k + 2] = nz;
      }
    }
    this.posAttr.needsUpdate = true;
    this.nrmAttr.needsUpdate = true;

    if (this.fins) {
      // Nageoires pectorales (battement) et lobes de queue
      const flap = Math.sin(time * 1.15) * 0.45;
      const pi = 5;
      const pr = radii[pi];
      const finK = this.spec.finScale ?? 1;
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 1 : -1;
        _v.set(side * pr * 0.7, -pr * 0.2, 0).applyQuaternion(quats[pi]).add(pts[pi]);
        _qa.setFromAxisAngle(Z_AXIS, side * flap);
        _qb.setFromAxisAngle(Y_AXIS, side * 0.3);
        _q.copy(quats[pi]).multiply(_qa).multiply(_qb);
        _s.set(side * pr * 3.4 * finK, 1, pr * 2.3 * finK);
        _m.compose(_v, _q, _s);
        this.fins.setMatrixAt(k, _m);
      }
      const ti = n - 2;
      const tr = Math.max(radii[ti], radii[4] * 0.12);
      const tflap = Math.sin(time * 1.6 + 1.0) * 0.4;
      const tailScale = radii[4] * 1.5 * finK;
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 1 : -1;
        _v.set(0, 0, -tr).applyQuaternion(quats[ti]).add(pts[ti]);
        _qa.setFromAxisAngle(Z_AXIS, side * tflap);
        _qb.setFromAxisAngle(Y_AXIS, side * 0.93);
        _q.copy(quats[ti]).multiply(_qa).multiply(_qb);
        _s.set(side * tailScale, 1, tailScale * 0.7);
        _m.compose(_v, _q, _s);
        this.fins.setMatrixAt(2 + k, _m);
      }
      this.fins.instanceMatrix.needsUpdate = true;
    }
    this.look.placeLights(this.rings, time, this.lightPos);
    this.lightAttr.needsUpdate = true;
  }

  /** Nombre d'anneaux du tube. */
  get ringCount(): number {
    return this.n;
  }

  /**
   * Après `update` : centre local de l'anneau `i` et son dos (réécrits au prochain update). Renvoie le rayon.
   * Le groupe est sur l'ancre, sans rotation : position monde = ancre + local.
   */
  copyRing(i: number, pos: THREE.Vector3, up: THREE.Vector3): number {
    pos.copy(this.rings.pts[i]);
    up.copy(this.rings.up[i]);
    return this.rings.radii[i];
  }
}
