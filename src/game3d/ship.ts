import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Bin, makeGlowTexture } from './util';

// La Comète en 3D (même design que le sprite 2D) : coque blanche effilée, ailes en delta, cockpit
// et bandes cyan, deux réacteurs à flamme orange. Nez vers −Z, dessus vers +Y.
// Longueur ≈ 4,35 u, envergure ≈ 4,3 u. ~8 appels de dessin (pièces fusionnées par matériau).

const CYAN = '#3ff0ff';
const ENGINE_X = 0.62;
const ENGINE_Y = -0.1;
const NOZZLE_Z = 2.12;
const HULL_TAIL = -1.95;
const HULL_NOSE = 2.4;
const WING_Y = -0.14;

/** Profil du fuselage (t = 0 à l'arrière, 1 au nez). */
function hullRadius(t: number): number {
  if (t < 0.03) return 0.3 + (t / 0.03) * 0.14;
  if (t < 0.42) return 0.44 + 0.08 * Math.sin(((t - 0.03) / 0.39) * Math.PI * 0.5);
  const k = (t - 0.42) / 0.58;
  return 0.52 * Math.pow(Math.max(0, 1 - Math.pow(k, 1.8)), 0.75);
}

/** Ajoute une couleur par sommet (géométrie non indexée, prête à fusionner). */
function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!m) throw new Error('La Comète : fusion de géométries impossible');
  return m;
}

/** Parallélogramme plat (bande décorative) dans le plan XY, entre deux bords. */
function stripShape(ax: number, ay: number, bx: number, by: number, nx: number, ny: number, o0: number, o1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(ax + nx * o0, ay + ny * o0);
  s.lineTo(bx + nx * o0, by + ny * o0);
  s.lineTo(bx + nx * o1, by + ny * o1);
  s.lineTo(ax + nx * o1, ay + ny * o1);
  s.closePath();
  return s;
}

function hullTextures(bin: Bin): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 512;
  const H = 512;
  const cm = document.createElement('canvas');
  const ce = document.createElement('canvas');
  cm.width = ce.width = W;
  cm.height = ce.height = H;
  const m = cm.getContext('2d');
  const e = ce.getContext('2d');
  if (m && e) {
    // Autour de la coque (u) : dessus blanc, flancs nacrés, ventre gris-bleu
    const g = m.createLinearGradient(0, 0, W, 0);
    const stops: [number, string][] = [
      [0, '#ffffff'],
      [0.17, '#f3f5ff'],
      [0.3, '#d3d9ef'],
      [0.5, '#8e97bd'],
      [0.7, '#d3d9ef'],
      [0.83, '#f3f5ff'],
      [1, '#ffffff'],
    ];
    for (const [o, c] of stops) g.addColorStop(o, c);
    m.fillStyle = g;
    m.fillRect(0, 0, W, H);
    e.fillStyle = '#000000';
    e.fillRect(0, 0, W, H);
    const vy = (v: number): number => (1 - v) * H;
    // Lignes de panneaux
    m.strokeStyle = 'rgba(80,90,130,0.45)';
    m.lineWidth = 2;
    for (const v of [0.22, 0.4, 0.58, 0.74]) {
      m.beginPath();
      m.moveTo(0, vy(v));
      m.lineTo(W, vy(v));
      m.stroke();
    }
    m.strokeStyle = 'rgba(80,90,130,0.3)';
    for (const u of [0.12, 0.88]) {
      m.beginPath();
      m.moveTo(u * W, vy(0.06));
      m.lineTo(u * W, vy(0.88));
      m.stroke();
    }
    // Bandes cyan sur les flancs (un peu sous la ligne médiane)
    const band = (ctx: CanvasRenderingContext2D, u: number, w: number, color: string, v0: number, v1: number): void => {
      ctx.fillStyle = color;
      ctx.fillRect(u * W - (w * W) / 2, vy(v1), w * W, vy(v0) - vy(v1));
    };
    for (const u of [0.285, 0.715]) {
      band(m, u, 0.036, CYAN, 0.05, 0.9);
      band(e, u, 0.036, CYAN, 0.05, 0.9);
      const u2 = u < 0.5 ? u + 0.048 : u - 0.048;
      band(m, u2, 0.012, '#1aa8c8', 0.05, 0.85);
      band(e, u2, 0.012, '#0b6f86', 0.05, 0.85);
      // Emblème comète
      for (const ctx of [m, e]) {
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.arc((u < 0.5 ? u - 0.035 : u + 0.035) * W, vy(0.55), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect((u < 0.5 ? u - 0.039 : u + 0.031) * W, vy(0.55), 0.008 * W, vy(0.47) - vy(0.55));
      }
    }
    // Arête dorsale claire
    m.fillStyle = 'rgba(255,255,255,0.9)';
    m.fillRect(0, vy(0.85), 0.012 * W, vy(0.1) - vy(0.85));
    m.fillRect(W - 0.012 * W, vy(0.85), 0.012 * W, vy(0.1) - vy(0.85));
    // Nez sombre
    const ng = m.createLinearGradient(0, 0, 0, vy(0.9));
    ng.addColorStop(0, '#1c2036');
    ng.addColorStop(1, '#3b4166');
    m.fillStyle = ng;
    m.fillRect(0, 0, W, vy(0.905));
    // Culot arrière
    m.fillStyle = '#5a6288';
    m.fillRect(0, vy(0.04), W, H - vy(0.04));
  }
  const map = bin.add(new THREE.CanvasTexture(cm));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissive = bin.add(new THREE.CanvasTexture(ce));
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform vec3 uCore;
uniform vec3 uOuter;
varying vec2 vUv;
void main() {
  float t = 1.0 - vUv.y;
  float flick = 0.82 + 0.18 * sin(uTime * 43.0 + vUv.x * 18.85);
  float a = pow(t, 1.5) * flick * uPower;
  vec3 c = mix(uOuter, uCore, pow(t, 2.5));
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

export class ShipModel {
  /** Position du vaisseau. */
  readonly root = new THREE.Group();
  /** Rotation (roulis, tangage, lacet) appliquée à la maquette. */
  readonly body = new THREE.Group();
  private readonly flames: THREE.Mesh[] = [];
  private readonly sprites: THREE.Sprite[] = [];
  private readonly spriteMat: THREE.SpriteMaterial;
  private readonly flameU: { uTime: { value: number }; uPower: { value: number } };

  constructor(bin: Bin, env: THREE.Texture | null) {
    this.root.add(this.body);

    // --- Fuselage (tour) avec texture : bandes cyan émissives, nez sombre
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, HULL_TAIL)];
    const N = 32;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector2(hullRadius(t), HULL_TAIL + (HULL_NOSE - HULL_TAIL) * t));
    }
    const hullGeo = bin.add(new THREE.LatheGeometry(pts, 48));
    hullGeo.rotateX(-Math.PI / 2);
    hullGeo.scale(1, 0.78, 1);
    const tex = hullTextures(bin);
    const hullMat = bin.add(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex.map,
        emissive: 0xffffff,
        emissiveMap: tex.emissive,
        emissiveIntensity: 1.6,
        roughness: 0.26,
        metalness: 0.12,
        envMap: env,
        envMapIntensity: 0.9,
      }),
    );
    const hull = new THREE.Mesh(hullGeo, hullMat);

    // --- Pièces blanches et métal (couleurs par sommet)
    const parts: THREE.BufferGeometry[] = [];
    const glows: THREE.BufferGeometry[] = [];
    const wingExtrude = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.035, bevelSegments: 1, curveSegments: 4 };
    for (const side of [1, -1]) {
      // Aile delta
      const P: [number, number][] = [
        [0.3, -0.95],
        [2.1, 1.05],
        [2.12, 1.38],
        [0.3, 1.58],
      ];
      const ws = new THREE.Shape();
      ws.moveTo(P[0][0] * side, P[0][1]);
      for (let i = 1; i < P.length; i++) ws.lineTo(P[i][0] * side, P[i][1]);
      ws.closePath();
      const wing = new THREE.ExtrudeGeometry(ws, wingExtrude);
      wing.rotateX(Math.PI / 2);
      wing.translate(0, WING_Y + 0.03, 0);
      parts.push(paint(wing, '#f4f6ff'));

      // Bande cyan le long du bord d'attaque (sur le dessus)
      const ax = 0.3 * side;
      const az = -0.95;
      const bx = 2.1 * side;
      const bz = 1.05;
      const dl = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / dl;
      const dz = (bz - az) / dl;
      // Normale vers l'intérieur de l'aile
      let nx = -dz;
      let nz = dx;
      if (nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const sa = 0.12;
      const sb = 0.92;
      const stripe = new THREE.ShapeGeometry(
        stripShape(ax + dx * dl * sa, -(az + dz * dl * sa), ax + dx * dl * sb, -(az + dz * dl * sb), nx, -nz, 0.09, 0.2),
      );
      stripe.rotateX(-Math.PI / 2);
      stripe.translate(0, WING_Y + 0.07, 0);
      glows.push(paint(stripe, CYAN));
      // Seconde bande fine
      const stripe2 = new THREE.ShapeGeometry(
        stripShape(ax + dx * dl * 0.3, -(az + dz * dl * 0.3), ax + dx * dl * 0.9, -(az + dz * dl * 0.9), nx, -nz, 0.27, 0.31),
      );
      stripe2.rotateX(-Math.PI / 2);
      stripe2.translate(0, WING_Y + 0.07, 0);
      glows.push(paint(stripe2, '#1aa8c8'));

      // Feu de bout d'aile
      const tip = new THREE.SphereGeometry(0.065, 8, 6);
      tip.translate(2.13 * side, WING_Y, 1.22);
      glows.push(paint(tip, CYAN));

      // Réacteur : nacelle, entrée d'air, tuyère, disque incandescent
      const pod = new THREE.CylinderGeometry(0.24, 0.27, 1.15, 20);
      pod.rotateX(Math.PI / 2);
      pod.translate(ENGINE_X * side, ENGINE_Y, 1.5);
      parts.push(paint(pod, '#b4bcdc'));
      const intake = new THREE.SphereGeometry(0.255, 18, 10);
      intake.scale(1, 1, 1.6);
      intake.translate(ENGINE_X * side, ENGINE_Y, 0.95);
      parts.push(paint(intake, '#6a7298'));
      const nozzle = new THREE.CylinderGeometry(0.3, 0.24, 0.24, 20, 1, true);
      nozzle.rotateX(Math.PI / 2);
      nozzle.translate(ENGINE_X * side, ENGINE_Y, NOZZLE_Z);
      parts.push(paint(nozzle, '#2a2e48'));
      const ringBand = new THREE.CylinderGeometry(0.275, 0.275, 0.06, 20, 1, true);
      ringBand.rotateX(Math.PI / 2);
      ringBand.translate(ENGINE_X * side, ENGINE_Y, 1.78);
      glows.push(paint(ringBand, CYAN));
      const disc = new THREE.CircleGeometry(0.22, 20);
      disc.translate(ENGINE_X * side, ENGINE_Y, NOZZLE_Z - 0.03);
      glows.push(paint(disc, '#ffb347'));
    }

    // Dérive (aileron vertical) penchée vers l'arrière
    const fs = new THREE.Shape();
    fs.moveTo(0.95, 0.28);
    fs.lineTo(1.7, 1.22);
    fs.lineTo(1.98, 1.24);
    fs.lineTo(2.0, 0.3);
    fs.closePath();
    const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 });
    fin.rotateY(-Math.PI / 2);
    fin.translate(0.025, 0, 0);
    parts.push(paint(fin, '#f4f6ff'));
    {
      const ax = 0.95;
      const ay = 0.28;
      const bx = 1.7;
      const by = 1.22;
      const dl = Math.hypot(bx - ax, by - ay);
      const dx = (bx - ax) / dl;
      const dy = (by - ay) / dl;
      const s = stripShape(ax + dx * dl * 0.25, ay + dy * dl * 0.25, ax + dx * dl * 0.95, ay + dy * dl * 0.95, dy, -dx, 0.06, 0.15);
      for (const side of [1, -1]) {
        const st = new THREE.ShapeGeometry(s);
        st.rotateY(-Math.PI / 2);
        st.translate(0.06 * side, 0, 0);
        glows.push(paint(st, CYAN));
      }
    }
    const finTip = new THREE.SphereGeometry(0.06, 8, 6);
    finTip.translate(0, 1.25, 1.86);
    glows.push(paint(finTip, '#ff4a4a'));

    const partsMat = bin.add(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.3,
        metalness: 0.15,
        envMap: env,
        envMapIntensity: 0.85,
      }),
    );
    const partsMesh = new THREE.Mesh(bin.add(merge(parts)), partsMat);
    const glowMat = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const glowMesh = new THREE.Mesh(bin.add(merge(glows)), glowMat);

    // --- Cockpit : bulle de verre cyan
    const canopyGeo = bin.add(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
    canopyGeo.scale(0.3, 0.32, 0.9);
    canopyGeo.translate(0, 0.24, -0.72);
    const canopyMat = bin.add(
      new THREE.MeshStandardMaterial({
        color: '#0d3a58',
        emissive: '#2fd8ff',
        emissiveIntensity: 0.55,
        roughness: 0.06,
        metalness: 0.5,
        envMap: env,
        envMapIntensity: 1.8,
      }),
    );
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);

    this.body.add(hull, partsMesh, glowMesh, canopy);

    // --- Flammes (cônes additifs) et halos des réacteurs
    const coneGeo = bin.add(new THREE.ConeGeometry(0.21, 1, 16, 1, true));
    coneGeo.translate(0, 0.5, 0);
    coneGeo.rotateX(Math.PI / 2);
    this.flameU = { uTime: { value: 0 }, uPower: { value: 1 } };
    const flameMat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...this.flameU,
          uCore: { value: new THREE.Color('#fff4c8') },
          uOuter: { value: new THREE.Color('#ff7a1a') },
        },
      }),
    );
    const glowTex = makeGlowTexture(bin);
    this.spriteMat = bin.add(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: '#ff8a2a',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    for (const side of [1, -1]) {
      const f = new THREE.Mesh(coneGeo, flameMat);
      f.position.set(ENGINE_X * side, ENGINE_Y, NOZZLE_Z + 0.02);
      f.renderOrder = 4;
      this.flames.push(f);
      const s = new THREE.Sprite(this.spriteMat);
      s.position.set(ENGINE_X * side, ENGINE_Y, NOZZLE_Z + 0.25);
      s.renderOrder = 4;
      this.sprites.push(s);
      this.body.add(f, s);
    }
  }

  /** thrust : 0..1.5 (poussée), boost : 0..1.3 (turbo / distorsion). */
  update(time: number, thrust: number, boost: number): void {
    this.flameU.uTime.value = time;
    this.flameU.uPower.value = 0.55 + thrust * 0.35 + boost * 0.45;
    for (let i = 0; i < 2; i++) {
      const fl = 0.88 + 0.08 * Math.sin(time * 47 + i * 2.1) + 0.05 * Math.sin(time * 83 + i);
      const len = (0.55 + thrust * 1.0 + boost * 1.9) * fl;
      const w = 1 + boost * 0.3;
      this.flames[i].scale.set(w, w, len);
      const s = (0.9 + thrust * 0.55 + boost * 1.0) * fl;
      this.sprites[i].scale.set(s * 1.25, s * 1.25, 1);
    }
    this.spriteMat.opacity = Math.min(1, 0.65 + 0.2 * thrust + 0.25 * boost);
  }
}
