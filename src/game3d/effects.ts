import * as THREE from 'three';
import type { Bin } from './util';

// Effets : particules lumineuses (pool), éclats de roche (InstancedMesh), traînées de vitesse
// animées entièrement sur GPU, et voiles plein écran (fondu blanc, flash de dégât) en DOM.

// ------------------------------------------------------------------ Points lumineux

const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 0.0, 240.0);
  vColor = aColor;
  vAlpha = aAlpha;
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a = 1.0 - r;
  a = a * a * vAlpha;
  vec3 c = vColor + vec3(0.7) * pow(1.0 - r, 6.0);
  gl_FragColor = vec4(c, min(a, 1.0));
  #include <colorspace_fragment>
}
`;

/** Matériau des points lumineux (taille en unités monde, perspective). */
export function makeGlowPointsMaterial(bin: Bin): THREE.ShaderMaterial {
  return bin.add(
    new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 500 } },
    }),
  );
}

/** Met à jour l'échelle des points selon la hauteur du tampon de rendu et le FOV. */
export function setGlowScale(mat: THREE.ShaderMaterial, bufferHeight: number, fovDeg: number): void {
  mat.uniforms.uScale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
}

export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private readonly size0: Float32Array;
  private readonly aPos: THREE.BufferAttribute;
  private readonly aCol: THREE.BufferAttribute;
  private readonly aSize: THREE.BufferAttribute;
  private readonly aAlpha: THREE.BufferAttribute;

  constructor(max: number, material: THREE.ShaderMaterial, bin: Bin) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.size0 = new Float32Array(max);
    const geo = bin.add(new THREE.BufferGeometry());
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    c: THREE.Color,
    size: number,
    life: number,
    drag = 1.5,
  ): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i3] = c.r;
    this.col[i3 + 1] = c.g;
    this.col[i3 + 2] = c.b;
    this.size0[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
  }

  /** Gerbe sphérique de particules. */
  burst(
    x: number,
    y: number,
    z: number,
    n: number,
    sMin: number,
    sMax: number,
    c: THREE.Color,
    size: number,
    life: number,
    baseVz = 0,
  ): void {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const sp = sMin + (sMax - sMin) * Math.random();
      this.spawn(
        x,
        y,
        z,
        Math.cos(th) * q * sp,
        Math.sin(th) * q * sp,
        u * sp + baseVz,
        c,
        size * (0.6 + Math.random() * 0.8),
        life * (0.6 + Math.random() * 0.6),
        1.8,
      );
    }
  }

  /** Gerbe en anneau dans le plan XY (portail franchi). */
  ring(x: number, y: number, z: number, radius: number, n: number, c: THREE.Color, size: number, speed: number): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = speed * (0.7 + Math.random() * 0.6);
      this.spawn(
        x + ca * radius,
        y + sa * radius,
        z,
        ca * sp,
        sa * sp,
        (Math.random() - 0.5) * 4,
        c,
        size * (0.7 + Math.random() * 0.6),
        0.5 + Math.random() * 0.35,
        2.2,
      );
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.moveLast(i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] *= k;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = t < 0.6 ? t / 0.6 : 1;
      this.size[i] = this.size0[i] * (0.35 + 0.65 * t);
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    if (this.count > 0) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aAlpha.needsUpdate = true;
    }
  }

  private moveLast(i: number): void {
    const j = --this.count;
    if (i === j) return;
    const i3 = i * 3;
    const j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k];
      this.vel[i3 + k] = this.vel[j3 + k];
      this.col[i3 + k] = this.col[j3 + k];
    }
    this.size[i] = this.size[j];
    this.size0[i] = this.size0[j];
    this.alpha[i] = this.alpha[j];
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.drag[i] = this.drag[j];
  }
}

// ------------------------------------------------------------------ Éclats de roche / de coque

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private count = 0;
  private readonly st: Float32Array; // px py pz vx vy vz ax ay az ang angVel scale life maxLife
  private readonly colors: Float32Array;
  private static readonly STRIDE = 14;

  constructor(cap: number, geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.cap = cap;
    this.st = new Float32Array(cap * Debris.STRIDE);
    this.colors = new Float32Array(cap * 3);
    this.mesh = new THREE.InstancedMesh(geometry, material, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number, c: THREE.Color, life: number): void {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const o = i * Debris.STRIDE;
    const st = this.st;
    st[o] = x;
    st[o + 1] = y;
    st[o + 2] = z;
    st[o + 3] = vx;
    st[o + 4] = vy;
    st[o + 5] = vz;
    _axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    st[o + 6] = _axis.x;
    st[o + 7] = _axis.y;
    st[o + 8] = _axis.z;
    st[o + 9] = Math.random() * 6.28;
    st[o + 10] = (Math.random() * 2 - 1) * 7;
    st[o + 11] = scale;
    st[o + 12] = life;
    st[o + 13] = life;
    this.colors[i * 3] = c.r;
    this.colors[i * 3 + 1] = c.g;
    this.colors[i * 3 + 2] = c.b;
  }

  update(dt: number): void {
    const st = this.st;
    const S = Debris.STRIDE;
    let i = 0;
    while (i < this.count) {
      const o = i * S;
      st[o + 12] -= dt;
      if (st[o + 12] <= 0) {
        const j = --this.count;
        if (j !== i) {
          st.copyWithin(o, j * S, j * S + S);
          this.colors[i * 3] = this.colors[j * 3];
          this.colors[i * 3 + 1] = this.colors[j * 3 + 1];
          this.colors[i * 3 + 2] = this.colors[j * 3 + 2];
        }
        continue;
      }
      const k = Math.exp(-0.6 * dt);
      st[o + 3] *= k;
      st[o + 4] *= k;
      st[o + 5] *= k;
      st[o] += st[o + 3] * dt;
      st[o + 1] += st[o + 4] * dt;
      st[o + 2] += st[o + 5] * dt;
      st[o + 9] += st[o + 10] * dt;
      const t = st[o + 12] / st[o + 13];
      const sc = st[o + 11] * (t < 0.3 ? t / 0.3 : 1);
      _p.set(st[o], st[o + 1], st[o + 2]);
      _axis.set(st[o + 6], st[o + 7], st[o + 8]);
      _q.setFromAxisAngle(_axis, st[o + 9]);
      _s.setScalar(sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    const ic = this.mesh.instanceColor;
    if (ic) {
      (ic.array as Float32Array).set(this.colors.subarray(0, this.count * 3));
      ic.needsUpdate = true;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ Traînées de vitesse

const STREAK_VERT = /* glsl */ `
attribute vec2 aCorner;
uniform float uTravel;
uniform float uRange;
uniform float uStretch;
uniform float uWidth;
uniform float uIntensity;
varying float vA;
void main() {
  float z = -uRange + mod(position.z * uRange + uTravel, uRange);
  vec2 radial = normalize(position.xy);
  vec2 tang = vec2(-radial.y, radial.x);
  vec3 p = vec3(position.xy + tang * aCorner.y * uWidth, z - aCorner.x * uStretch + 4.0);
  float fade = smoothstep(-uRange, -uRange * 0.55, z) * (1.0 - smoothstep(-8.0, 3.0, z));
  vA = (1.0 - aCorner.x) * fade * uIntensity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const STREAK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, clamp(vA, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

export class Streaks {
  readonly mesh: THREE.Mesh;
  private readonly u: {
    uTravel: { value: number };
    uStretch: { value: number };
    uIntensity: { value: number };
    uWidth: { value: number };
  };

  constructor(count: number, color: string, bin: Bin) {
    const pos = new Float32Array(count * 4 * 3);
    const corner = new Float32Array(count * 4 * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + 22 * Math.sqrt(Math.random());
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.85;
      const ph = Math.random();
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = ph;
        corner[v * 2] = k < 2 ? 0 : 1;
        corner[v * 2 + 1] = k % 2 === 0 ? -1 : 1;
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    const geo = bin.add(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(index);
    this.u = {
      uTravel: { value: 0 },
      uStretch: { value: 4 },
      uIntensity: { value: 0 },
      uWidth: { value: 0.045 },
    };
    const mat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: STREAK_VERT,
        fragmentShader: STREAK_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...this.u,
          uRange: { value: 260 },
          uColor: { value: new THREE.Color(color) },
        },
      }),
    );
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  update(camPos: THREE.Vector3, travel: number, stretch: number, intensity: number, width: number): void {
    this.mesh.position.copy(camPos);
    this.u.uTravel.value = travel % 100000;
    this.u.uStretch.value = stretch;
    this.u.uIntensity.value = intensity;
    this.u.uWidth.value = width;
    this.mesh.visible = intensity > 0.005;
  }
}

// ------------------------------------------------------------------ Voiles plein écran (DOM)

export class ScreenFx {
  private readonly fade: HTMLDivElement;
  private readonly hit: HTMLDivElement;
  private fadeA = 0;
  private hitA = 0;
  private shownFade = -1;
  private shownHit = -1;

  constructor(container: HTMLElement) {
    this.hit = document.createElement('div');
    this.hit.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;' +
      'background:radial-gradient(ellipse at center, rgba(255,40,90,0) 42%, rgba(255,40,90,0.7) 100%);';
    this.fade = document.createElement('div');
    this.fade.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;background:#ffffff;';
    container.appendChild(this.hit);
    container.appendChild(this.fade);
  }

  setFade(a: number): void {
    this.fadeA = a;
  }

  flashHit(strength: number): void {
    this.hitA = Math.max(this.hitA, strength);
  }

  update(dt: number): void {
    this.hitA = Math.max(0, this.hitA - dt * 1.8);
    const f = Math.round(this.fadeA * 100) / 100;
    if (f !== this.shownFade) {
      this.shownFade = f;
      this.fade.style.opacity = String(f);
    }
    const h = Math.round(this.hitA * 100) / 100;
    if (h !== this.shownHit) {
      this.shownHit = h;
      this.hit.style.opacity = String(h);
    }
  }

  dispose(): void {
    this.fade.remove();
    this.hit.remove();
  }
}
