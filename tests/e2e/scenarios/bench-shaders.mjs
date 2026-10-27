// Banc d'essai (diagnostic) : temps de compilation ANGLE / D3D11 (compilateur FXC) et coût de dessin des
// shaders de bruit du mode 3D (ciel, planètes), dans un contexte WebGL2 brut sur about:blank (aucun code
// du jeu). Deux variantes du bruit fbm :
//  - « jeu »     : GLSL_NOISE lu dans src/game3d/glsl.ts (bornes de boucles non constantes : pas de déroulage) ;
//  - « déroulé » : l'ancienne version (bornes constantes) que le compilateur D3D déroulait, ~5 s de compilation.
// Les fonctions main() du ciel et des planètes sont des copies simplifiées (GLSL 3) de sky.ts / planets.ts.
// Chaque programme reçoit un sel unique (pas de cache GPU). Seul verdict : les programmes « jeu » se lient.
import fs from 'node:fs';
import { assert, fmt } from '../lib/helpers.mjs';

export const meta = {
  title: 'Banc : compilation et dessin des shaders de bruit 3D',
  suites: ['diag'],
  timeoutMs: 180000,
};

const GLSL_FILE = new URL('../../../src/game3d/glsl.ts', import.meta.url);

/** GLSL_NOISE tel que le jeu l'utilise (gabarit sans interpolation dans src/game3d/glsl.ts). */
function gameNoise() {
  const src = fs.readFileSync(GLSL_FILE, 'utf8');
  const m = src.match(/export const GLSL_NOISE = \/\* glsl \*\/ `([^`]*)`/);
  assert(m && /xrFbm6/.test(m[1]), 'GLSL_NOISE introuvable dans src/game3d/glsl.ts (constante renommée ?)');
  return m[1];
}

const NOISE_HEAD = `
float xrHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float xrNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = xrHash(i);
  float b = xrHash(i + vec3(1.0, 0.0, 0.0));
  float c = xrHash(i + vec3(0.0, 1.0, 0.0));
  float d = xrHash(i + vec3(1.0, 1.0, 0.0));
  float e = xrHash(i + vec3(0.0, 0.0, 1.0));
  float g = xrHash(i + vec3(1.0, 0.0, 1.0));
  float h = xrHash(i + vec3(0.0, 1.0, 1.0));
  float k = xrHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
`;
const constFbm = (name, n) => `
float ${name}(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < ${n}; i++) {
    s += a * xrNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / ${(1 - Math.pow(0.5, n)).toFixed(6)};
}
`;
const UNROLLED = NOISE_HEAD + constFbm('xrFbm4', 4) + constFbm('xrFbm6', 6);

const SKY_MAIN = `
uniform vec3 uDeep; uniform vec3 uBase; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
uniform vec3 uFocus; uniform vec3 uFocus2; uniform vec3 uBand;
uniform float uSeed; uniform float uBandGain; uniform float uLaneGain;
in vec3 vDir;
out vec4 fragColor;
void main() {
  vec3 d = normalize(vDir);
  vec3 p = d * 2.0 + vec3(uSeed);
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
  col += uA * c1 * 0.75; col += uB * c2 * 0.6; col += uC * c3 * 0.55;
  col += (uA * 0.6 + vec3(0.25)) * pow(c1, 3.0) * 0.5;
  col += (uB * 0.5 + vec3(0.2)) * pow(c2, 3.0) * 0.35;
  float lanes = smoothstep(0.42, 0.72, xrFbm4(d * 7.0 + q * 3.0 + vec3(11.0)));
  col *= 1.0 - uLaneGain * lanes * clamp(band + f1 * 0.6, 0.0, 1.0);
  col += vec3(0.035, 0.035, 0.05) * band * xrFbm4(d * 14.0 + q);
  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

const PLANET_MAIN = `
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4; uniform vec3 uAtm; uniform vec3 uNight; uniform vec3 uLight;
uniform float uKind; uniform float uSeed; uniform float uTime; uniform float uAtmK;
in vec3 vDir;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vDir);
  vec3 col; vec3 glow = vec3(0.0);
  if (uKind < 0.5) {
    float h = xrFbm6(n * 2.2 + vec3(uSeed));
    float h2 = xrFbm4(n * 9.0 + vec3(uSeed * 2.0));
    float land = smoothstep(0.52, 0.57, h);
    col = mix(uC1 * (0.7 + 0.5 * h2), uC2 * (0.75 + 0.5 * h2), land);
    col = mix(col, uC3, smoothstep(0.6, 0.78, h) * 0.75 * h2);
    col = mix(col, uC4, smoothstep(0.72, 0.8, h2) * land * 0.55);
    float cl = smoothstep(0.55, 0.82, xrFbm4(n * vec3(3.0, 6.5, 3.0) + vec3(uTime * 0.012, 0.0, uSeed)));
    col = mix(col, vec3(0.86, 0.84, 1.0), cl * 0.55);
    float clusters = smoothstep(0.5, 0.72, xrFbm4(n * 7.0 + vec3(uSeed * 3.0)));
    float fine = xrNoise(n * 150.0);
    glow = uNight * land * clusters * (0.25 + 1.6 * fine * fine * fine) * (1.0 - cl);
  } else if (uKind < 1.5) {
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
    float turb = xrFbm4(n * vec3(2.0, 7.0, 2.0) + vec3(uSeed));
    float lat = n.y + (turb - 0.5) * 0.25;
    float b1 = 0.5 + 0.5 * sin(lat * 22.0);
    float b2 = 0.5 + 0.5 * sin(lat * 9.0 + 1.3);
    col = mix(uC1, uC2, b1 * 0.8);
    col = mix(col, uC3, smoothstep(0.55, 0.95, b2) * 0.6);
    col = mix(col, uC4, smoothstep(0.6, 0.8, turb) * 0.45);
  }
  float lit = dot(n, uLight);
  vec3 outc = col * (0.02 + 1.1 * smoothstep(-0.12, 0.75, lit)) + glow * (1.0 - smoothstep(-0.2, 0.15, lit));
  fragColor = vec4(outc + uAtm * uAtmK, 1.0);
}
`;

const VERT = `#version 300 es
in vec3 position;
out vec3 vDir;
void main() { vDir = vec3(position.xy, 0.7); gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export default async function (t) {
  const libs = { jeu: gameNoise(), 'déroulé': UNROLLED };
  const cases = [];
  for (const [lib, code] of Object.entries(libs)) {
    cases.push({ name: `ciel/${lib}`, lib, frag: code, main: SKY_MAIN });
    cases.push({ name: `planète/${lib}`, lib, frag: code, main: PLANET_MAIN });
  }
  await t.page.goto('about:blank');
  const res = await t.ev(
    ({ cases, VERT }) => {
      // Taille du tampon du jeu sur un écran de téléphone typique (844x390 x 1,5).
      const c = document.createElement('canvas');
      c.width = 1266;
      c.height = 585;
      const gl = c.getContext('webgl2');
      if (!gl) return { error: 'WebGL2 indisponible' };
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      const out = [];
      const salt = Math.random().toFixed(8);
      for (const k of cases) {
        const fs = `#version 300 es\nprecision highp float;\nprecision highp int;\n// ${salt} ${k.name}\n${k.frag}\n${k.main}`;
        const t0 = performance.now();
        const v = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(v, VERT);
        gl.compileShader(v);
        const f = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(f, fs);
        gl.compileShader(f);
        const p = gl.createProgram();
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        const ok = gl.getProgramParameter(p, gl.LINK_STATUS) === true;
        const compileMs = Math.round(performance.now() - t0);
        let drawMs = null;
        if (ok) {
          // Coût GPU : triangle plein écran dessiné 20 fois, synchronisé par readPixels.
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
          gl.useProgram(p);
          const loc = gl.getAttribLocation(p, 'position');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
          gl.viewport(0, 0, c.width, c.height);
          const px = new Uint8Array(4);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const g0 = performance.now();
          for (let n = 0; n < 20; n++) gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          drawMs = Math.round(((performance.now() - g0) / 20) * 100) / 100;
        }
        const log = (gl.getProgramInfoLog(p) || gl.getShaderInfoLog(f) || '').replace(/\s+/g, ' ').trim();
        out.push({ name: k.name, lib: k.lib, ok, compileMs, drawMs, lost: gl.isContextLost(), log: log.slice(0, 160) });
      }
      return { renderer, results: out };
    },
    { cases, VERT },
  );
  assert(!res.error, res.error);
  t.log(`rendu : ${res.renderer}`);
  t.log('programme        compilation   dessin (ms/image 1266x585)   contexte   journal');
  for (const r of res.results) {
    t.log(
      `${r.name.padEnd(16)} ${`${r.compileMs} ms`.padStart(10)}   ${(r.drawMs === null ? 'échec' : `${r.drawMs} ms`).padStart(10)}${' '.repeat(19)}${r.lost ? 'PERDU' : 'ok   '}      ${r.log || '-'}`,
    );
  }
  assert(res.results.length === cases.length, `${cases.length} mesures attendues, obtenu ${res.results.length}`);
  const game = res.results.filter((r) => r.lib === 'jeu');
  assert(game.every((r) => r.ok && !r.lost), `les programmes du jeu doivent se lier : ${fmt(game)}`);
}
