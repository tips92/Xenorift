import * as THREE from 'three';
import { GLSL_NOISE } from './glsl';
import type { Bin } from './util';

// Planètes lointaines : surface procédurale en shader (jungle, lune de cristal, géante gazeuse),
// halo d'atmosphère de Fresnel, anneaux avec ombre portée. Placées par rapport à la caméra
// (objets « à l'infini ») avec une lente dérive pour simuler l'éloignement / l'approche.

export type PlanetKind = 'jungle' | 'moon' | 'gas';

/** Branche du shader de surface (uKind) de chaque genre : un genre oublié fait échouer tsc. */
const SURFACE_SHADER: Record<PlanetKind, number> = { jungle: 0, moon: 1, gas: 2 };

export interface PlanetSpec {
  kind: PlanetKind;
  radius: number;
  colors: readonly [string, string, string, string];
  atmosphere: string;
  atmStrength: number;
  night: string;
  /** Direction vers le soleil (monde). */
  light: readonly [number, number, number];
  /** Inclinaison (rad) autour de X puis Z. */
  tiltX: number;
  tiltZ: number;
  spin: number;
  seed: number;
  /** Décalage initial par rapport à la caméra, et vitesse de ce décalage (u/s). */
  offset: readonly [number, number, number];
  drift: readonly [number, number, number];
  ring?: { inner: number; outer: number; colorA: string; colorB: string };
}

const PLANET_VERT = /* glsl */ `
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vViewDir;
void main() {
  vObjN = normal;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLANET_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec3 uAtm;
uniform vec3 uNight;
uniform vec3 uLight;
uniform float uKind;
uniform float uSeed;
uniform float uTime;
uniform float uAtmK;
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vViewDir;
${GLSL_NOISE}
void main() {
  vec3 n = normalize(vObjN);
  vec3 col;
  vec3 glow = vec3(0.0);
  if (uKind < 0.5) {
    // Xéna : océans violets, jungles turquoise, mousse lumineuse, fleurs magenta
    float h = xrFbm6(n * 2.2 + vec3(uSeed));
    float h2 = xrFbm4(n * 9.0 + vec3(uSeed * 2.0));
    float land = smoothstep(0.52, 0.57, h);
    col = mix(uC1 * (0.7 + 0.5 * h2), uC2 * (0.75 + 0.5 * h2), land);
    col = mix(col, uC3, smoothstep(0.6, 0.78, h) * 0.75 * h2);
    col = mix(col, uC4, smoothstep(0.72, 0.8, h2) * land * 0.55);
    float cl = smoothstep(0.55, 0.82, xrFbm4(n * vec3(3.0, 6.5, 3.0) + vec3(uTime * 0.012, 0.0, uSeed)));
    col = mix(col, vec3(0.86, 0.84, 1.0), cl * 0.55);
    // Forêts bioluminescentes visibles côté nuit : amas diffus et scintillement fin
    float clusters = smoothstep(0.5, 0.72, xrFbm4(n * 7.0 + vec3(uSeed * 3.0)));
    float fine = xrNoise(n * 150.0);
    glow = uNight * land * clusters * (0.25 + 1.6 * fine * fine * fine) * (1.0 - cl);
  } else if (uKind < 1.5) {
    // Krator : régolithe gris-lilas, cratères, veines de cristal orange
    float h = xrFbm6(n * 3.0 + vec3(uSeed));
    col = mix(uC3, uC1, h);
    col = mix(col, uC2, smoothstep(0.55, 0.75, h));
    float cr = xrNoise(n * 9.0 + vec3(uSeed));
    col *= 0.72 + 0.4 * smoothstep(0.3, 0.7, cr);
    float vein = 1.0 - abs(xrNoise(n * 5.0 + vec3(3.1)) * 2.0 - 1.0);
    vein = pow(vein, 14.0) * smoothstep(0.4, 0.6, xrNoise(n * 2.0 + vec3(7.0)));
    col = mix(col, uC4, vein * 0.8);
    glow = uC4 * vein * 1.2;
  } else {
    // Géante gazeuse : bandes ambre / violet / crème et grande tempête
    float turb = xrFbm4(n * vec3(2.0, 7.0, 2.0) + vec3(uSeed));
    float lat = n.y + (turb - 0.5) * 0.25;
    float b1 = 0.5 + 0.5 * sin(lat * 22.0);
    float b2 = 0.5 + 0.5 * sin(lat * 9.0 + 1.3);
    col = mix(uC1, uC2, b1 * 0.8);
    col = mix(col, uC3, smoothstep(0.55, 0.95, b2) * 0.6);
    col = mix(col, uC4, smoothstep(0.6, 0.8, turb) * 0.45);
    float storm = smoothstep(0.2, 0.0, length(vec2(atan(n.z, n.x) - 1.0, (n.y + 0.3) * 2.6)));
    col = mix(col, uC4 * 1.25, storm * 0.85);
  }
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(vViewDir);
  float lit = dot(N, uLight);
  float diff = smoothstep(-0.12, 0.75, lit);
  vec3 outc = col * (0.02 + 1.1 * diff);
  outc += glow * (1.0 - smoothstep(-0.2, 0.15, lit));
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  outc += uAtm * fr * (0.12 + 1.0 * smoothstep(-0.35, 0.45, lit)) * uAtmK;
  gl_FragColor = vec4(outc, 1.0);
  #include <colorspace_fragment>
}
`;

// Coquille d'atmosphère vue de l'intérieur (faces arrière) : halo maximal au limbe de la planète.
const ATM_FRAG = /* glsl */ `
uniform vec3 uAtm;
uniform vec3 uLight;
uniform float uAtmK;
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vViewDir;
void main() {
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(vViewDir);
  float k = clamp(-dot(N, V) / 0.4, 0.0, 1.0);
  float g = pow(k, 1.7);
  float lit = smoothstep(-0.5, 0.5, dot(N, uLight));
  float a = g * (0.1 + 0.95 * lit) * uAtmK;
  gl_FragColor = vec4(uAtm, a);
  #include <colorspace_fragment>
}
`;

const RING_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vR;
void main() {
  vR = length(position.xy);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
uniform float uInner;
uniform float uOuter;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uLight;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vWorld;
varying float vR;
${GLSL_NOISE}
void main() {
  float t = (vR - uInner) / (uOuter - uInner);
  float n = xrNoise(vec3(t * 46.0, 0.5, 0.5));
  float bands = 0.45 + 0.55 * (0.5 + 0.5 * sin(t * 62.0)) * (0.6 + 0.4 * sin(t * 23.0 + 1.0)) * (0.6 + 0.8 * n);
  float gap = smoothstep(0.56, 0.58, t) * (1.0 - smoothstep(0.64, 0.66, t));
  float a = bands * (1.0 - gap * 0.9) * smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.88, 1.0, t));
  vec3 col = mix(uA, uB, smoothstep(0.15, 0.85, t + (n - 0.5) * 0.25));
  // Ombre de la planète sur l'anneau
  vec3 p = vWorld - uCenter;
  float along = dot(p, uLight);
  float perp = length(p - along * uLight);
  float shadow = (along < 0.0 && perp < uRadius) ? 0.1 : 1.0;
  gl_FragColor = vec4(col * shadow * 1.15, clamp(a * 0.8, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

export class Planet {
  readonly group = new THREE.Group();
  readonly offset: THREE.Vector3;
  private readonly drift: THREE.Vector3;
  private readonly body: THREE.Mesh;
  private readonly uniforms: { uTime: { value: number } };
  private readonly spin: number;

  constructor(spec: PlanetSpec, bin: Bin) {
    const light = new THREE.Vector3(spec.light[0], spec.light[1], spec.light[2]).normalize();
    this.offset = new THREE.Vector3(spec.offset[0], spec.offset[1], spec.offset[2]);
    this.drift = new THREE.Vector3(spec.drift[0], spec.drift[1], spec.drift[2]);
    this.spin = spec.spin;
    const kind = SURFACE_SHADER[spec.kind];
    const atm = new THREE.Color(spec.atmosphere);

    const geo = bin.add(new THREE.SphereGeometry(spec.radius, 72, 48));
    const time = { value: 0 };
    this.uniforms = { uTime: time };
    const mat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
          uC1: { value: new THREE.Color(spec.colors[0]) },
          uC2: { value: new THREE.Color(spec.colors[1]) },
          uC3: { value: new THREE.Color(spec.colors[2]) },
          uC4: { value: new THREE.Color(spec.colors[3]) },
          uAtm: { value: atm },
          uNight: { value: new THREE.Color(spec.night) },
          uLight: { value: light },
          uKind: { value: kind },
          uSeed: { value: spec.seed },
          uTime: time,
          uAtmK: { value: spec.atmStrength },
        },
      }),
    );
    this.body = new THREE.Mesh(geo, mat);
    this.body.frustumCulled = false;

    const atmGeo = bin.add(new THREE.SphereGeometry(spec.radius * 1.08, 64, 40));
    const atmMat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: ATM_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uAtm: { value: atm },
          uLight: { value: light },
          uAtmK: { value: spec.atmStrength },
        },
      }),
    );
    const shell = new THREE.Mesh(atmGeo, atmMat);
    shell.frustumCulled = false;

    const tilt = new THREE.Group();
    tilt.rotation.set(spec.tiltX, 0, spec.tiltZ);
    tilt.add(this.body);
    this.group.add(tilt, shell);

    if (spec.ring) {
      const inner = spec.radius * spec.ring.inner;
      const outer = spec.radius * spec.ring.outer;
      const rGeo = bin.add(new THREE.RingGeometry(inner, outer, 160, 1));
      const rMat = bin.add(
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uInner: { value: inner },
            uOuter: { value: outer },
            uA: { value: new THREE.Color(spec.ring.colorA) },
            uB: { value: new THREE.Color(spec.ring.colorB) },
            uLight: { value: light },
            uCenter: { value: this.group.position },
            uRadius: { value: spec.radius },
          },
        }),
      );
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.rotation.x = -Math.PI / 2;
      ring.frustumCulled = false;
      tilt.add(ring);
    }
  }

  update(dt: number, time: number, camPos: THREE.Vector3, moving: boolean): void {
    if (moving) this.offset.addScaledVector(this.drift, dt);
    this.group.position.copy(camPos).add(this.offset);
    this.body.rotation.y += this.spin * dt;
    this.uniforms.uTime.value = time;
  }
}
