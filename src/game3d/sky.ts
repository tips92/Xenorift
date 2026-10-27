import * as THREE from 'three';
import type { CourseTheme } from './courses';
import { GLSL_NOISE } from './glsl';
import type { Rng } from './rng';
import type { Bin } from './util';

// Ciel : nébuleuse fbm « cuite » une seule fois dans une cubemap (aucun coût par image ensuite),
// plus deux couches d'étoiles scintillantes en Points.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBase;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uFocus;
uniform vec3 uFocus2;
uniform vec3 uBand;
uniform float uSeed;
uniform float uBandGain;
uniform float uLaneGain;
varying vec3 vDir;
${GLSL_NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 p = d * 2.0 + vec3(uSeed);
  // Déformation de domaine : volutes organiques
  vec3 q = vec3(xrFbm4(p), xrFbm4(p + vec3(5.2, 1.3, 2.8)), xrFbm4(p + vec3(9.7, 4.1, 7.3)));
  float n = xrFbm6(d * 2.6 + q * 2.1 + vec3(uSeed * 0.7));
  float n2 = xrFbm6(d * 5.0 - q * 1.7 + vec3(uSeed * 1.3 + 4.0));
  float f1 = pow(max(dot(d, uFocus), 0.0), 2.0);
  float f2 = pow(max(dot(d, uFocus2), 0.0), 2.4);
  float bd = dot(d, uBand);
  float band = exp(-bd * bd / 0.07);
  vec3 col = mix(uDeep, uBase, clamp(0.2 + 0.8 * band * uBandGain + 0.5 * f1, 0.0, 1.0));
  float c1 = smoothstep(0.4, 0.85, n) * (0.12 + 1.5 * f1 + 0.65 * band * uBandGain);
  float c2 = smoothstep(0.46, 0.9, n2) * (0.08 + 1.4 * f2 + 0.45 * band * uBandGain);
  float c3 = smoothstep(0.5, 0.95, n * (0.55 + q.y)) * (0.15 + 0.9 * f1 + 0.9 * f2);
  col += uA * c1 * 0.75;
  col += uB * c2 * 0.6;
  col += uC * c3 * 0.55;
  // Coeurs lumineux
  col += (uA * 0.6 + vec3(0.25)) * pow(c1, 3.0) * 0.5;
  col += (uB * 0.5 + vec3(0.2)) * pow(c2, 3.0) * 0.35;
  // Bandes de poussière sombres
  float lanes = smoothstep(0.42, 0.72, xrFbm4(d * 7.0 + q * 3.0 + vec3(11.0)));
  col *= 1.0 - uLaneGain * lanes * clamp(band + f1 * 0.6, 0.0, 1.0);
  // Voile diffus d'étoiles lointaines le long de la bande
  col += vec3(0.035, 0.035, 0.05) * band * xrFbm4(d * 14.0 + q);
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <colorspace_fragment>
}
`;

export interface SkyBake {
  background: THREE.CubeTexture;
  /** Reflets (PMREM) ; rebake() la remplace par une nouvelle texture. */
  env: THREE.Texture;
  /** Contexte WebGL restauré : contenu GPU perdu, on recuit le fond (même cible) et les reflets. */
  rebake(renderer: THREE.WebGLRenderer): void;
}

/**
 * Taille des faces de la cubemap source des reflets. Le PMREM n'a pas besoin de plus : la pièce la
 * plus lisse du vaisseau (rugosité 0,06) lit le mip ≈ 7,7, soit des faces de 2^8 = 256 px.
 * Calculé depuis le fond 1024, il gardait ~100 Mo de cible demi-flottante (200 Mo pendant le calcul)
 * et coûtait 16x plus de GPU.
 */
const ENV_SIZE = 256;

function vec(t: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(t[0], t[1], t[2]).normalize();
}

function cubeTarget(size: number): THREE.WebGLCubeRenderTarget {
  return new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: false,
  });
}

/** Rend la nébuleuse dans une cubemap sRGB (fond + reflets du vaisseau via PMREM). */
export function bakeSky(renderer: THREE.WebGLRenderer, theme: CourseTheme, seed: number, bin: Bin): SkyBake {
  const size = Math.min(1024, renderer.capabilities.maxCubemapSize);
  const rt = bin.add(cubeTarget(size));
  const uniforms = {
    uDeep: { value: new THREE.Color(theme.skyDeep) },
    uBase: { value: new THREE.Color(theme.skyBase) },
    uA: { value: new THREE.Color(theme.nebA) },
    uB: { value: new THREE.Color(theme.nebB) },
    uC: { value: new THREE.Color(theme.nebC) },
    uFocus: { value: vec(theme.focus) },
    uFocus2: { value: vec(theme.focus2) },
    uBand: { value: vec(theme.band) },
    uSeed: { value: (seed % 97) * 0.37 },
    uBandGain: { value: theme.bandGain },
    uLaneGain: { value: theme.laneGain },
  };
  const bake = (r: THREE.WebGLRenderer): THREE.Texture => {
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 64, 32);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms,
    });
    scene.add(new THREE.Mesh(geo, mat));
    const small = cubeTarget(Math.min(ENV_SIZE, size));
    const pmrem = new THREE.PMREMGenerator(r);
    try {
      const t0 = performance.now();
      const cam = new THREE.CubeCamera(0.1, 100, rt);
      cam.update(r, scene);
      const t1 = performance.now();
      // Même nébuleuse en petit (même programme), source du PMREM des reflets
      cam.renderTarget = small;
      cam.update(r, scene);
      // L'ancienne cible (recuisson) appartenait au contexte perdu : la poubelle la libérera en fin de partie
      const next = bin.add(pmrem.fromCubemap(small.texture));
      if (import.meta.env.DEV) {
        console.debug(`[flight3d] ciel cuit : fond ${Math.round(t1 - t0)} ms, reflets ${Math.round(performance.now() - t1)} ms`);
      }
      return next.texture;
    } finally {
      pmrem.dispose();
      small.dispose();
      geo.dispose();
      mat.dispose();
    }
  };

  const sky: SkyBake = {
    background: rt.texture,
    env: bake(renderer),
    rebake: (r) => {
      sky.env = bake(r);
    },
  };
  return sky;
}

// ------------------------------------------------------------------ Étoiles

const STAR_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPR;
uniform float uTwinkle;
varying vec3 vColor;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.8 + aPhase * 2.6) + aPhase * 41.0));
  vTw = tw;
  vColor = aColor;
  gl_PointSize = aSize * uPR * (0.75 + 0.25 * tw);
}
`;

const STAR_FRAG = /* glsl */ `
uniform float uSpike;
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float core = clamp(1.0 - r, 0.0, 1.0);
  core = core * core * core;
  float sx = clamp(1.0 - abs(c.y) * 18.0, 0.0, 1.0) * clamp(1.0 - abs(c.x) * 2.0, 0.0, 1.0);
  float sy = clamp(1.0 - abs(c.x) * 18.0, 0.0, 1.0) * clamp(1.0 - abs(c.y) * 2.0, 0.0, 1.0);
  float a = (core * 1.4 + (sx + sy) * uSpike) * vTw;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, min(a, 1.0));
  #include <colorspace_fragment>
}
`;

const STAR_RADIUS = 8000;

export class StarField {
  readonly group = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];

  constructor(theme: CourseTheme, rng: Rng, bin: Bin, pr: number) {
    const band = vec(theme.band);
    this.addLayer(theme, rng, bin, pr, 2600, 1.6, 3.0, 0.25, 0, band);
    this.addLayer(theme, rng, bin, pr, 420, 3.2, 7.0, 0.55, 0.55, band);
  }

  private addLayer(
    theme: CourseTheme,
    rng: Rng,
    bin: Bin,
    pr: number,
    count: number,
    sMin: number,
    sMax: number,
    twinkle: number,
    spike: number,
    band: THREE.Vector3,
  ): void {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Direction aléatoire, une partie resserrée sur la bande galactique
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
      v.normalize();
      if (rng() < 0.55) {
        v.addScaledVector(band, -v.dot(band) * 0.85).normalize();
      }
      pos[i * 3] = v.x * STAR_RADIUS;
      pos[i * 3 + 1] = v.y * STAR_RADIUS;
      pos[i * 3 + 2] = v.z * STAR_RADIUS;
      c.set(theme.stars[Math.floor(rng() * theme.stars.length)]);
      const b = 0.55 + rng() * 0.6;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
      size[i] = sMin + (sMax - sMin) * Math.pow(rng(), 2.2);
      phase[i] = rng();
    }
    const geo = bin.add(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPR: { value: pr },
          uTwinkle: { value: twinkle },
          uSpike: { value: spike },
        },
      }),
    );
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -5;
    this.mats.push(mat);
    this.group.add(pts);
  }

  setPixelRatio(pr: number): void {
    for (const m of this.mats) m.uniforms.uPR.value = pr;
  }

  update(time: number, camPos: THREE.Vector3): void {
    this.group.position.copy(camPos);
    for (const m of this.mats) m.uniforms.uTime.value = time;
  }
}
