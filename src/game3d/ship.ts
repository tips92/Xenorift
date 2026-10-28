import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHIP_GUNS, shipGunId } from '../core/shipGuns';
import { type Bin, makeGlowTexture } from './util';

// La Comète en 3D (même design que le sprite 2D) : coque blanche effilée, ailes en delta, cockpit
// et bandes cyan, deux réacteurs à flamme orange. Nez vers −Z, dessus vers +Y.
// Longueur ≈ 4,35 u, envergure ≈ 4,3 u. ~8 appels de dessin (pièces fusionnées par matériau) ; canons fusionnés
// avec les pièces et les liserés (aucun appel de plus), éclairs de bouche : +1 ou +2 pendant le tir.

const CYAN = '#3ff0ff';
const ENGINE_X = 0.62;
const ENGINE_Y = -0.1;
const NOZZLE_Z = 2.12;
const HULL_TAIL = -1.95;
const HULL_NOSE = 2.4;
const WING_Y = -0.14;
/**
 * Bouches des canons (repère de la maquette, nez vers −Z) : canon léger sous le nez (niveau 0), mitrailleuse
 * sous les ailes (niveaux 1 à 3 ; bouches 0 et 1 en alternance). Les canons modélisés doivent finir là. Vue de
 * la caméra de poursuite (derrière, ~13° au-dessus), l'aile cache ce qui est dessous jusqu'à ~0,5 u devant son
 * bord d'attaque : la mitrailleuse est placée vers l'extérieur de l'aile (bord d'attaque reculé, en z ≈ 0,33) et
 * dépasse loin devant (nacelle, fourreau, bague et bouche visibles de dos).
 */
const NOSE_MUZZLES: readonly (readonly [number, number, number])[] = [[0, -0.34, -1.95]];
const WING_MUZZLES: readonly (readonly [number, number, number])[] = [
  [-1.45, -0.3, -1.12],
  [1.45, -0.3, -1.12],
];
/** Éclair de bouche : durée (s) et taille du halo (canon léger, mitrailleuse). */
const FLASH_TIME = 0.07;
const FLASH_SIZE_LIGHT = 1.05;
const FLASH_SIZE_MG = 0.8;

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

/** Tube le long de Z, de cz − len/2 à cz + len/2 : rayon avant (−Z) rFront, arrière rBack. */
function tube(rFront: number, rBack: number, len: number, seg: number, x: number, y: number, cz: number, open = false): THREE.BufferGeometry {
  // Après rotateX(π/2), le haut du cylindre (+Y) passe à l'arrière (+Z).
  const g = new THREE.CylinderGeometry(rBack, rFront, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, cz);
  return g;
}

/**
 * Canons, fusionnés avec les pièces et les liserés (aucun appel de dessin de plus). Niveau 0 : canon léger sous
 * le nez. Niveaux 1 à 3 : mitrailleuse, une nacelle sous chaque aile prolongée par un fourreau et un long canon
 * qui dépassent devant l'aile, bague cyan au bout du fourreau, bouche lumineuse et une bague de plus par
 * amélioration (comme l'aperçu du hangar). Ils finissent aux bouches.
 */
function addGuns(level: number, parts: THREE.BufferGeometry[], glows: THREE.BufferGeometry[]): void {
  if (level < 1) {
    const [mx, my, mz] = NOSE_MUZZLES[0];
    // Tourelle à demi rentrée dans la coque, canon court
    const turret = new THREE.SphereGeometry(0.13, 14, 8);
    turret.scale(1, 0.75, 1.5);
    turret.translate(mx, my + 0.05, -1.22);
    parts.push(paint(turret, '#6a7298'));
    parts.push(paint(tube(0.04, 0.05, 0.62, 10, mx, my, mz + 0.31), '#2a2e48'));
    glows.push(paint(tube(0.052, 0.052, 0.035, 10, mx, my, mz + 0.03, true), CYAN));
    return;
  }
  for (const [mx, my, mz] of WING_MUZZLES) {
    // Nacelle (z de −0,35 à 0,65 ; l'arrière sous l'aile), mât sous l'aile, avant effilé, fourreau, canon
    parts.push(paint(tube(0.1, 0.075, 1.0, 14, mx, my, 0.15), '#b4bcdc'));
    parts.push(paint(tube(0.07, 0.1, 0.22, 14, mx, my, -0.46), '#8e97bd'));
    const fairing = new THREE.BoxGeometry(0.06, 0.06, 0.34);
    fairing.translate(mx, my + 0.11, 0.5);
    parts.push(paint(fairing, '#d3d9ef'));
    parts.push(paint(tube(0.06, 0.07, 0.25, 12, mx, my, -0.695), '#6a7298'));
    parts.push(paint(tube(0.042, 0.042, 0.32, 10, mx, my, mz + 0.16), '#2a2e48'));
    // Bagues de la nacelle et du fourreau (devant l'aile : visibles de la caméra), bouche, bagues des améliorations
    glows.push(paint(tube(0.13, 0.13, 0.08, 14, mx, my, -0.8, true), CYAN));
    glows.push(paint(tube(0.104, 0.1, 0.05, 14, mx, my, -0.3, true), CYAN));
    glows.push(paint(tube(0.052, 0.052, 0.03, 10, mx, my, mz + 0.02, true), CYAN));
    for (let i = 1; i < level; i++) {
      glows.push(paint(tube(0.058, 0.058, 0.035, 10, mx, my, mz + 0.2 - (i - 1) * 0.08, true), CYAN));
    }
  }
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
  /** Canon (hooks.loadout.ship.gunLevel, 0..3) : 0 canon léger, 1 à 3 mitrailleuse (bagues selon le niveau). */
  readonly gunLevel: number;
  private readonly muzzles: readonly (readonly [number, number, number])[];
  /** Éclairs de bouche (un halo par bouche, masqué au repos) : intensité 0..1, allumé depuis cette image. */
  private readonly flashes: THREE.Sprite[] = [];
  private readonly flashMats: THREE.SpriteMaterial[] = [];
  private readonly flashLeft: number[] = [];
  private readonly flashFresh: boolean[] = [];
  private readonly flashSize: number;
  private lastTime = -1;

  /** `gunLevel` : canon léger sous le nez (0), mitrailleuse sous les ailes et ses bagues lumineuses (1 à 3). */
  constructor(bin: Bin, env: THREE.Texture | null, gunLevel = 0) {
    this.gunLevel = Number.isFinite(gunLevel) ? Math.min(3, Math.max(0, Math.floor(gunLevel))) : 0;
    this.muzzles = this.gunLevel >= 1 ? WING_MUZZLES : NOSE_MUZZLES;
    this.flashSize = this.gunLevel >= 1 ? FLASH_SIZE_MG : FLASH_SIZE_LIGHT;
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

    addGuns(this.gunLevel, parts, glows);

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

    // --- Éclairs de bouche : halo de la couleur du tir, un peu devant chaque bouche (masqués au repos)
    const flashColor = new THREE.Color(SHIP_GUNS[shipGunId(this.gunLevel)].color).lerp(new THREE.Color(0xffffff), 0.35);
    for (const m of this.muzzles) {
      const mat = bin.add(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: flashColor,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const s = new THREE.Sprite(mat);
      s.position.set(m[0], m[1], m[2] - 0.12);
      s.renderOrder = 5;
      s.visible = false;
      this.flashes.push(s);
      this.flashMats.push(mat);
      this.flashLeft.push(0);
      this.flashFresh.push(false);
      this.body.add(s);
    }
  }

  /** Bouches du canon : 1 (canon léger) ou 2 (mitrailleuse). */
  get muzzleCount(): number {
    return this.muzzles.length;
  }

  /**
   * Position dans le monde de la bouche `i`, pour une Comète en (x, y, z) (position simulée de FlightRun),
   * avec l'inclinaison actuelle de la maquette (body). Écrite dans `out`, sans allocation.
   */
  muzzleWorld(i: number, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const m = this.muzzles[((i % this.muzzles.length) + this.muzzles.length) % this.muzzles.length];
    out.set(m[0], m[1], m[2]).applyQuaternion(this.body.quaternion);
    return out.set(out.x + x, out.y + y, out.z + z);
  }

  /** Éclair de bouche du canon `i` (au tir) ; il s'éteint de lui-même dans update() (FLASH_TIME). */
  fireFlash(i: number): void {
    const n = this.flashes.length;
    if (n === 0 || !Number.isFinite(i)) return;
    const k = ((Math.floor(i) % n) + n) % n;
    this.flashLeft[k] = 1;
    // Affiché entier à l'image du tir, il ne décroît qu'aux suivantes.
    this.flashFresh[k] = true;
    const s = this.flashes[k];
    s.visible = true;
    s.scale.set(this.flashSize, this.flashSize, 1);
    this.flashMats[k].opacity = 1;
  }

  /** thrust : 0..1.5 (poussée), boost : 0..1.3 (turbo / distorsion). Éteint aussi les éclairs de bouche. */
  update(time: number, thrust: number, boost: number): void {
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    for (let i = 0; i < this.flashes.length; i++) {
      let left = this.flashLeft[i];
      if (left <= 0) continue;
      if (this.flashFresh[i]) this.flashFresh[i] = false;
      else left = Math.max(0, left - dt / FLASH_TIME);
      this.flashLeft[i] = left;
      const s = this.flashes[i];
      s.visible = left > 0;
      if (left > 0) {
        const k = this.flashSize * (0.55 + 0.45 * left) * (0.9 + 0.1 * Math.sin(time * 91 + i * 1.7));
        s.scale.set(k, k, 1);
        this.flashMats[i].opacity = Math.min(1, 0.3 + 0.8 * left);
      }
    }
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
