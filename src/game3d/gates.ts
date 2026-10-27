import * as THREE from 'three';
import { GATE_R, type Course, type CourseTheme } from './courses';
import { type Bin, damp, smoothstep } from './util';

// Portails : anneau néon (tore, tirets lumineux qui tournent) + disque additif (halo et tourbillon
// intérieur). Le prochain portail est mis en valeur ; les portails lointains apparaissent en fondu.
// À la fin du parcours : le grand portail de distorsion (warp), un vortex tourbillonnant.

export const GATE_VIEW = 1300;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uFade;
uniform float uHi;
uniform float uFlash;
uniform float uDash;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float nv = abs(dot(normalize(vN), normalize(vV)));
  float a = vUv.x;
  float f = fract(a * uDash - uTime * (0.5 + uHi * 0.9));
  float dash = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.45, 0.62, f));
  float beacon = pow(max(cos(a * 6.2831853 * 4.0), 0.0), 90.0);
  vec3 col = uColor * (0.5 + 0.7 * dash) * (1.0 + 0.9 * uHi);
  col += vec3(1.0) * (pow(nv, 5.0) * (0.25 + 0.55 * uHi) + beacon * 1.6);
  col += uColor * pow(1.0 - nv, 2.0) * 0.7;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, uFade);
  #include <colorspace_fragment>
}
`;

const DISK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uFade;
uniform float uHi;
uniform float uFlash;
uniform float uRing;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float d = (r - uRing) / uRing;
  float halo = exp(-d * d * 160.0) * 0.55 + exp(-d * d * 14.0) * 0.2;
  float inside = 1.0 - smoothstep(uRing * 0.9, uRing, r);
  float sw = 0.5 + 0.5 * sin(ang * 3.0 + r * 11.0 - uTime * 3.4);
  float sw2 = 0.5 + 0.5 * sin(ang * 5.0 - r * 15.0 + uTime * 2.1);
  float swirl = inside * (0.04 + 0.26 * sw * sw2 * smoothstep(0.05, uRing, r)) * (0.45 + 0.9 * uHi);
  // Chevrons tournants autour du prochain portail
  float ca = fract((ang / 6.2831853) * 6.0 + uTime * 0.25);
  float chev = uHi * smoothstep(0.06, 0.0, abs(r - uRing * 1.22 - abs(ca - 0.5) * 0.16)) * step(0.3, ca) * (1.0 - step(0.7, ca));
  float a = (halo * (0.65 + 0.7 * uHi) + swirl + chev * 0.9 + uFlash * inside * 0.6) * uFade;
  vec3 col = mix(uColor, vec3(1.0), 0.25 * halo + uFlash * 0.6);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

interface GateVisual {
  root: THREE.Group;
  ring: THREE.ShaderMaterial;
  disk: THREE.ShaderMaterial;
  color: THREE.Color;
  state: 0 | 1 | 2;
  t: number;
  hi: number;
  spin: number;
  z: number;
}

const DISK_SIZE = GATE_R * 3.4;

export class GateField {
  readonly group = new THREE.Group();
  private readonly items: GateVisual[] = [];
  private readonly base: THREE.Color;
  private readonly next: THREE.Color;
  private readonly missed: THREE.Color;

  constructor(course: Course, theme: CourseTheme, bin: Bin) {
    this.base = new THREE.Color(theme.gate);
    this.next = new THREE.Color(theme.gateNext);
    this.missed = new THREE.Color(theme.gateMissed);
    const torus = bin.add(new THREE.TorusGeometry(GATE_R, 0.3, 12, 80));
    const plane = bin.add(new THREE.PlaneGeometry(DISK_SIZE, DISK_SIZE));
    const ringBase = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uFade: { value: 1 },
        uHi: { value: 0 },
        uFlash: { value: 0 },
        uDash: { value: 16 },
      },
    });
    const diskBase = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uFade: { value: 1 },
        uHi: { value: 0 },
        uFlash: { value: 0 },
        uRing: { value: GATE_R / (DISK_SIZE / 2) },
      },
    });
    course.gates.forEach((g, i) => {
      const ring = bin.add(ringBase.clone());
      const disk = bin.add(diskBase.clone());
      const color = this.base.clone();
      ring.uniforms.uColor.value = color;
      disk.uniforms.uColor.value = color;
      const root = new THREE.Group();
      root.position.set(g.x, g.y, g.z);
      const ringMesh = new THREE.Mesh(torus, ring);
      const diskMesh = new THREE.Mesh(plane, disk);
      diskMesh.renderOrder = 2;
      root.add(ringMesh, diskMesh);
      root.visible = false;
      this.group.add(root);
      this.items.push({ root, ring, disk, color, state: 0, t: 0, hi: 0, spin: (i % 2 === 0 ? 1 : -1) * 0.35, z: g.z });
    });
    ringBase.dispose();
    diskBase.dispose();
  }

  pass(i: number): void {
    const g = this.items[i];
    if (!g || g.state !== 0) return;
    g.state = 1;
    g.t = 0;
  }

  miss(i: number): void {
    const g = this.items[i];
    if (!g || g.state !== 0) return;
    g.state = 2;
    g.t = 0;
  }

  update(dt: number, time: number, shipZ: number, nextIndex: number): void {
    for (let i = 0; i < this.items.length; i++) {
      const g = this.items[i];
      const ru = g.ring.uniforms;
      const du = g.disk.uniforms;
      ru.uTime.value = time;
      du.uTime.value = time;
      g.root.rotation.z += g.spin * dt * (1 + g.hi);
      if (g.state === 0) {
        const dist = shipZ - g.z;
        if (dist > GATE_VIEW || dist < -16) {
          g.root.visible = false;
          continue;
        }
        g.root.visible = true;
        const fade = 1 - smoothstep(GATE_VIEW * 0.55, GATE_VIEW, dist);
        g.hi = damp(g.hi, i === nextIndex ? 1 : 0, 6, dt);
        const pulse = g.hi * (0.8 + 0.2 * Math.sin(time * 6.5));
        g.color.lerpColors(this.base, this.next, g.hi);
        ru.uFade.value = fade;
        du.uFade.value = fade;
        ru.uHi.value = pulse;
        du.uHi.value = pulse;
        ru.uFlash.value = 0;
        du.uFlash.value = 0;
        g.root.scale.setScalar(1);
      } else if (g.state === 1) {
        // Franchi : éclair blanc et expansion
        g.t += dt;
        const k = g.t / 0.6;
        if (k >= 1) {
          g.root.visible = false;
          continue;
        }
        g.root.visible = true;
        g.root.scale.setScalar(1 + k * k * 1.4);
        ru.uFlash.value = 1 - k;
        du.uFlash.value = 1 - k;
        ru.uFade.value = 1 - k;
        du.uFade.value = 1 - k;
      } else {
        // Manqué : vire au rouge, se contracte et s'éteint
        g.t += dt;
        const k = g.t / 0.9;
        if (k >= 1) {
          g.root.visible = false;
          continue;
        }
        g.root.visible = true;
        g.color.lerpColors(this.next, this.missed, Math.min(1, k * 4));
        g.root.scale.setScalar(1 - k * 0.25);
        ru.uHi.value = 0.6 * (1 - k);
        du.uHi.value = 0.6 * (1 - k);
        ru.uFade.value = (1 - k) * (0.6 + 0.4 * Math.sin(g.t * 40));
        du.uFade.value = 1 - k;
      }
    }
  }
}

// ------------------------------------------------------------------ Portail de distorsion

const WARP_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p) / 0.4;
  float ang = atan(p.y, p.x);
  float lr = log(max(r, 0.02));
  float s1 = 0.5 + 0.5 * sin(ang * 4.0 + lr * 7.0 - uTime * 4.2);
  float s2 = 0.5 + 0.5 * sin(ang * 7.0 - lr * 5.0 + uTime * 2.6);
  float inside = 1.0 - smoothstep(0.9, 1.02, r);
  float core = exp(-r * r * 5.0);
  vec3 col = mix(uB, uA, s1) * (0.35 + 0.75 * s1 * s2) * inside;
  col += vec3(1.0) * core * 1.5;
  float rim = exp(-pow((r - 1.0) / 0.05, 2.0));
  col += mix(uA, vec3(1.0), 0.5) * rim * 1.5;
  float halo = exp(-max(r - 1.0, 0.0) * 2.4) * (1.0 - inside) * (1.0 - smoothstep(2.0, 2.5, r));
  col += uB * halo * 0.7 + uA * halo * 0.25;
  float alpha = clamp(inside * (0.5 + 0.5 * s1) + rim + halo * 0.7 + core, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export const WARP_R = 26;

export class WarpPortal {
  readonly group = new THREE.Group();
  private readonly disk: THREE.ShaderMaterial;
  private readonly rings: THREE.Mesh[] = [];
  private readonly ringMats: THREE.ShaderMaterial[] = [];
  private readonly z: number;

  constructor(z: number, theme: CourseTheme, bin: Bin) {
    this.z = z;
    this.group.position.set(0, 0, z);
    const a = new THREE.Color(theme.warpA);
    const b = new THREE.Color(theme.warpB);
    this.disk = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: DISK_VERT,
        fragmentShader: WARP_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: a }, uB: { value: b }, uTime: { value: 0 }, uFade: { value: 0 } },
      }),
    );
    const plane = bin.add(new THREE.PlaneGeometry(WARP_R * 5, WARP_R * 5));
    const diskMesh = new THREE.Mesh(plane, this.disk);
    diskMesh.renderOrder = 3;
    this.group.add(diskMesh);
    const torus = bin.add(new THREE.TorusGeometry(WARP_R, 0.85, 16, 128));
    const torus2 = bin.add(new THREE.TorusGeometry(WARP_R * 1.12, 0.35, 10, 128));
    for (let i = 0; i < 2; i++) {
      const mat = bin.add(
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          transparent: true,
          uniforms: {
            uColor: { value: i === 0 ? a : b },
            uTime: { value: 0 },
            uFade: { value: 0 },
            uHi: { value: i === 0 ? 1 : 0.4 },
            uFlash: { value: 0 },
            uDash: { value: i === 0 ? 32 : 48 },
          },
        }),
      );
      const m = new THREE.Mesh(i === 0 ? torus : torus2, mat);
      this.rings.push(m);
      this.ringMats.push(mat);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  update(dt: number, time: number, shipZ: number): void {
    const dist = shipZ - this.z;
    if (dist > 2600 || dist < -60) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const fade = 1 - smoothstep(1700, 2600, dist);
    this.disk.uniforms.uTime.value = time;
    this.disk.uniforms.uFade.value = fade;
    for (const m of this.ringMats) {
      m.uniforms.uTime.value = time;
      m.uniforms.uFade.value = fade;
    }
    this.rings[0].rotation.z += dt * 0.6;
    this.rings[1].rotation.z -= dt * 0.35;
    this.rings[1].rotation.x = Math.sin(time * 0.7) * 0.12;
    this.rings[1].rotation.y = Math.cos(time * 0.5) * 0.12;
  }
}
