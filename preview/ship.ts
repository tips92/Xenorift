import '@fontsource/exo-2/600.css';
import * as THREE from 'three';

// Essai : exploration d'une épave à la première personne (couloirs en grille, monstres en images
// toujours tournées vers la caméra, à la manière des vieux jeux de tir). Trouver les cristaux et la
// carte d'accès, puis rejoindre le sas. Tout est dessiné par code.
// http://localhost:5173/preview/ship.html  (?stats=0 : sans compteurs)
// Clavier : ZQSD / WASD avancer et se décaler, ← → tourner, J / Espace / F tirer ; souris : clic = capturer la
//   souris, puis bouger pour tourner et clic pour tirer.
// Tactile : stick à gauche (avancer, se décaler), glisser à droite pour tourner, bouton TIR en bas à droite.

const params = new URLSearchParams(location.search);

// Légende : # mur, . sol, P départ, D porte (s'ouvre à l'approche), M rampant, S cracheur,
// T cristal, C carte d'accès, X sas de sortie (avec la carte).
const MAP = [
  '######################',
  '#P....#.........#....#',
  '#.....D....M....#..T.#',
  '#.....#.........D....#',
  '###D###....T....#.S..#',
  '#.....#.........###D##',
  '#.T...####D######....#',
  '#..M..#....S....#..M.#',
  '#.....D....M....D....#',
  '###D###.........#....#',
  '#.....#..C......###D##',
  '#.S...#####D#####....#',
  '#.....#.........#..X.#',
  '#..T..D....M..T.#....#',
  '#.....#.........#.M..#',
  '######################',
];
const W = MAP[0].length;
const H = MAP.length;
for (const row of MAP) if (row.length !== W) throw new Error(`ligne de longueur ${row.length} : ${row}`);

const CELL = 3;
const WALL_H = 3;
const EYE = 1.55;
const PLAYER_R = 0.35;
const SPEED = 4.6;
const TURN_SPEED = 2.4;
const TOUCH_TURN = 0.006;
const MOUSE_TURN = 0.0025;
const MAX_HEARTS = 5;
const FIRE_GAP = 0.22;
const SHOT_RANGE = 26;

const cellAt = (cx: number, cy: number): string =>
  cx < 0 || cy < 0 || cx >= W || cy >= H ? '#' : MAP[cy][cx];
const centerX = (cx: number): number => cx * CELL + CELL / 2;
const centerZ = (cy: number): number => cy * CELL + CELL / 2;

// ---------- rendu ----------
const view = document.querySelector('#view') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
view.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030208);
scene.fog = new THREE.Fog(0x030208, 6, 26);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 60);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x1a0c22, 0.55));
const lamp = new THREE.SpotLight(0xfff4e0, 26, 22, 0.62, 0.55, 1.4);
lamp.position.set(0, 0, 0.1);
camera.add(lamp);
camera.add(lamp.target);
lamp.target.position.set(0, -0.1, -1);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- textures dessinées ----------
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function panels(g: CanvasRenderingContext2D, s: number, base: string, edge: string): void {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = edge;
  g.lineWidth = s / 64;
  for (const [x, y, w, h] of [
    [0.04, 0.04, 0.42, 0.55],
    [0.54, 0.04, 0.42, 0.55],
    [0.04, 0.72, 0.92, 0.24],
  ]) {
    g.strokeRect(x * s, y * s, w * s, h * s);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(x * s, y * s, w * s, (h * s) / 3);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [x, y] of [
    [0.08, 0.08],
    [0.42, 0.08],
    [0.58, 0.08],
    [0.92, 0.08],
    [0.08, 0.55],
    [0.92, 0.55],
  ]) {
    g.beginPath();
    g.arc(x * s, y * s, s / 80, 0, Math.PI * 2);
    g.fill();
  }
}

const wallTex = canvasTex(256, (g, s) => {
  panels(g, s, '#3a4060', '#1a1d30');
  g.fillStyle = '#0d0f1c';
  g.fillRect(0, s * 0.62, s, s * 0.06);
});
const wallGlow = canvasTex(256, (g, s) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#29d8ff';
  g.fillRect(0, s * 0.635, s, s * 0.02);
  g.fillStyle = '#ff9a2e';
  g.fillRect(s * 0.86, s * 0.78, s * 0.06, s * 0.03);
});
const floorTex = canvasTex(
  256,
  (g, s) => {
    g.fillStyle = '#20222e';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#11121a';
    g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo((i * s) / 8, 0);
      g.lineTo((i * s) / 8, s);
      g.stroke();
    }
    g.strokeStyle = '#3a3d52';
    g.lineWidth = 6;
    g.strokeRect(3, 3, s - 6, s - 6);
  },
  true,
);
floorTex.repeat.set(W, H);
const ceilTex = canvasTex(
  256,
  (g, s) => {
    panels(g, s, '#1d2034', '#0c0d18');
  },
  true,
);
ceilTex.repeat.set(W, H);
const ceilGlow = canvasTex(
  256,
  (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#6b7cff';
    g.fillRect(s * 0.3, s * 0.42, s * 0.4, s * 0.06);
  },
  true,
);
ceilGlow.repeat.set(W, H);
const doorTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#4b3a2a';
  g.fillRect(0, 0, s, s);
  for (let i = -4; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f0b02a' : '#20160e';
    g.beginPath();
    g.moveTo(i * 40, s * 0.82);
    g.lineTo(i * 40 + 40, s * 0.82);
    g.lineTo(i * 40 + 80, s);
    g.lineTo(i * 40 + 40, s);
    g.fill();
  }
  g.fillStyle = '#2a2f45';
  g.fillRect(s * 0.47, 0, s * 0.06, s * 0.82);
  g.fillStyle = '#3ff0ff';
  g.fillRect(s * 0.485, s * 0.25, s * 0.03, s * 0.3);
});

// ---------- murs (un seul maillage : faces tournées vers une case libre) ----------
{
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number): void => {
    const p = [
      [ax, 0, az],
      [bx, 0, bz],
      [bx, WALL_H, bz],
      [ax, WALL_H, az],
    ];
    const t = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[i]);
      uv.push(...t[i]);
      nor.push(nx, 0, nz);
    }
  };
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (cellAt(cx, cy) !== '#') continue;
      const x0 = cx * CELL;
      const x1 = x0 + CELL;
      const z0 = cy * CELL;
      const z1 = z0 + CELL;
      if (cellAt(cx, cy - 1) !== '#') quad(x1, z0, x0, z0, 0, -1);
      if (cellAt(cx, cy + 1) !== '#') quad(x0, z1, x1, z1, 0, 1);
      if (cellAt(cx - 1, cy) !== '#') quad(x0, z0, x0, z1, -1, 0);
      if (cellAt(cx + 1, cy) !== '#') quad(x1, z1, x1, z0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const walls = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ map: wallTex, emissiveMap: wallGlow, emissive: 0xffffff }),
  );
  scene.add(walls);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((W * CELL) / 2, 0, (H * CELL) / 2);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W * CELL, H * CELL),
    new THREE.MeshLambertMaterial({ map: ceilTex, emissiveMap: ceilGlow, emissive: 0xffffff }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((W * CELL) / 2, WALL_H, (H * CELL) / 2);
  scene.add(floor, ceil);
}

// ---------- portes ----------
interface Door {
  cx: number;
  cy: number;
  open: number;
  mesh: THREE.Mesh;
}
const doors: Door[] = [];
const doorAt = new Map<number, Door>();
{
  const geo = new THREE.BoxGeometry(CELL, WALL_H, 0.25);
  const mat = new THREE.MeshLambertMaterial({ map: doorTex });
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (cellAt(cx, cy) !== 'D') continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(centerX(cx), WALL_H / 2, centerZ(cy));
      // Murs à gauche et à droite : la porte barre le passage nord-sud.
      if (cellAt(cx - 1, cy) !== '#') mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      const d = { cx, cy, open: 0, mesh };
      doors.push(d);
      doorAt.set(cy * W + cx, d);
    }
  }
}

/** Case qui arrête Kaï, les monstres et les tirs (mur, porte pas assez ouverte). */
function solid(cx: number, cy: number): boolean {
  const c = cellAt(cx, cy);
  if (c === '#') return true;
  if (c === 'D') return (doorAt.get(cy * W + cx)?.open ?? 0) < 0.75;
  return false;
}

/** Déplace un cercle en glissant le long des cases pleines. */
function slide(p: THREE.Vector3, dx: number, dz: number, r: number): void {
  p.x += dx;
  pushOut(p, r);
  p.z += dz;
  pushOut(p, r);
}
function pushOut(p: THREE.Vector3, r: number): void {
  const c0x = Math.floor((p.x - r) / CELL);
  const c1x = Math.floor((p.x + r) / CELL);
  const c0y = Math.floor((p.z - r) / CELL);
  const c1y = Math.floor((p.z + r) / CELL);
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      if (!solid(cx, cy)) continue;
      const nx = Math.max(cx * CELL, Math.min(p.x, cx * CELL + CELL));
      const nz = Math.max(cy * CELL, Math.min(p.z, cy * CELL + CELL));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        // Centre dans la case : sortir par le côté le plus proche.
        const lx = p.x - cx * CELL;
        const lz = p.z - cy * CELL;
        const m = Math.min(lx, CELL - lx, lz, CELL - lz);
        if (m === lx) p.x = cx * CELL - r;
        else if (m === CELL - lx) p.x = cx * CELL + CELL + r;
        else if (m === lz) p.z = cy * CELL - r;
        else p.z = cy * CELL + CELL + r;
      }
    }
  }
}

/** Distance jusqu'au premier obstacle le long d'un rayon horizontal (DDA sur la grille). */
function rayDist(ox: number, oz: number, dx: number, dz: number, max: number): number {
  let cx = Math.floor(ox / CELL);
  let cy = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL : cx * CELL) - ox) / dx : Infinity;
  let tz = dz !== 0 ? ((dz > 0 ? (cy + 1) * CELL : cy * CELL) - oz) / dz : Infinity;
  let t = 0;
  while (t < max) {
    if (tx < tz) {
      t = tx;
      tx += tdx;
      cx += stepX;
    } else {
      t = tz;
      tz += tdz;
      cy += stepY;
    }
    if (solid(cx, cy)) return Math.min(t, max);
  }
  return max;
}
function lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return rayDist(ax, az, dx / d, dz / d, d) >= d - 0.01;
}

// ---------- objets ----------
interface Pickup {
  kind: 'crystal' | 'card';
  mesh: THREE.Mesh;
  taken: boolean;
}
const pickups: Pickup[] = [];
const crystalGeo = new THREE.OctahedronGeometry(0.28);
crystalGeo.scale(1, 1.6, 1);
const crystalMat = new THREE.MeshLambertMaterial({ color: 0x7ff8ff, emissive: 0x1d8fb0 });
const cardGeo = new THREE.BoxGeometry(0.5, 0.32, 0.04);
const cardMat = new THREE.MeshLambertMaterial({ color: 0xff9a2e, emissive: 0x8a3c00 });
let exitCell = { cx: 0, cy: 0 };
const player = { pos: new THREE.Vector3(), yaw: -Math.PI / 2, hearts: MAX_HEARTS, invuln: 0, card: false, crystals: 0, over: false };
let crystalsTotal = 0;

// ---------- monstres (images dessinées, toujours face à la caméra) ----------
type MonsterKind = 'crawler' | 'spitter';
type Frame = 'walk0' | 'walk1' | 'attack' | 'hurt' | 'dead';
const FRAMES: Frame[] = ['walk0', 'walk1', 'attack', 'hurt', 'dead'];

function drawCrawler(g: CanvasRenderingContext2D, s: number, f: Frame): void {
  const cx = s / 2;
  if (f === 'dead') {
    g.fillStyle = '#5a1f8a';
    g.beginPath();
    g.ellipse(cx, s * 0.9, s * 0.42, s * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9dff6a';
    g.fillRect(cx - s * 0.12, s * 0.88, s * 0.06, s * 0.02);
    return;
  }
  const squash = f === 'walk1' ? 0.92 : f === 'attack' ? 1.08 : 1;
  const top = s * (0.3 + (1 - squash) * 0.5);
  // Pattes
  g.strokeStyle = '#3c1260';
  g.lineWidth = s * 0.05;
  g.lineCap = 'round';
  const k = f === 'walk1' ? 1 : -1;
  for (const sx of [-1, 1]) {
    for (const j of [0, 1]) {
      g.beginPath();
      g.moveTo(cx + sx * s * 0.2, s * 0.75);
      g.lineTo(cx + sx * s * (0.36 + j * 0.06), s * (0.8 + k * j * 0.04));
      g.lineTo(cx + sx * s * (0.4 + j * 0.06), s * 0.97);
      g.stroke();
    }
  }
  const grad = g.createRadialGradient(cx - s * 0.1, top + s * 0.15, s * 0.05, cx, top + s * 0.28, s * 0.4);
  grad.addColorStop(0, f === 'hurt' ? '#ffffff' : '#d58bff');
  grad.addColorStop(1, f === 'hurt' ? '#ffb0d0' : '#5a1f8a');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, top + s * 0.28, s * 0.34, s * 0.3 * squash, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#120c24';
  g.lineWidth = s * 0.02;
  g.stroke();
  // Yeux
  for (const sx of [-1, 1]) {
    g.fillStyle = '#9dff6a';
    g.beginPath();
    g.ellipse(cx + sx * s * 0.12, top + s * 0.2, s * 0.07, s * 0.055, sx * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#071';
    g.beginPath();
    g.arc(cx + sx * s * 0.12, top + s * 0.21, s * 0.025, 0, Math.PI * 2);
    g.fill();
  }
  // Gueule
  const open = f === 'attack' ? 0.14 : 0.05;
  g.fillStyle = '#1a0420';
  g.beginPath();
  g.ellipse(cx, top + s * 0.38, s * 0.16, s * open, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f6f8ff';
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx + i * s * 0.04 - s * 0.015, top + s * 0.38 - s * open * 0.8);
    g.lineTo(cx + i * s * 0.04 + s * 0.015, top + s * 0.38 - s * open * 0.8);
    g.lineTo(cx + i * s * 0.04, top + s * 0.38 - s * open * 0.2);
    g.fill();
  }
}

function drawSpitter(g: CanvasRenderingContext2D, s: number, f: Frame): void {
  const cx = s / 2;
  if (f === 'dead') {
    g.fillStyle = '#8a2a10';
    g.beginPath();
    g.ellipse(cx, s * 0.92, s * 0.32, s * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const bob = f === 'walk1' ? s * 0.03 : 0;
  // Tentacules
  g.strokeStyle = '#ff6a3c';
  g.lineWidth = s * 0.035;
  g.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    const x = cx + i * s * 0.08;
    g.moveTo(x, s * 0.55 + bob);
    g.quadraticCurveTo(x + (f === 'walk1' ? 1 : -1) * s * 0.06, s * 0.72, x, s * 0.9 + bob * 0.5);
    g.stroke();
  }
  const grad = g.createRadialGradient(cx - s * 0.08, s * 0.3 + bob, s * 0.04, cx, s * 0.4 + bob, s * 0.32);
  grad.addColorStop(0, f === 'hurt' ? '#ffffff' : '#ffc070');
  grad.addColorStop(1, f === 'hurt' ? '#ffd0b0' : '#b0301a');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, s * 0.42 + bob, s * 0.28, Math.PI, 0);
  g.quadraticCurveTo(cx + s * 0.28, s * 0.6 + bob, cx, s * 0.58 + bob);
  g.quadraticCurveTo(cx - s * 0.28, s * 0.6 + bob, cx - s * 0.28, s * 0.42 + bob);
  g.fill();
  g.strokeStyle = '#120c24';
  g.lineWidth = s * 0.02;
  g.stroke();
  // Œil unique
  g.fillStyle = '#fff6d0';
  g.beginPath();
  g.ellipse(cx, s * 0.36 + bob, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = f === 'attack' ? '#ff2a2a' : '#3a0a00';
  g.beginPath();
  g.ellipse(cx, s * 0.37 + bob, s * 0.04, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  if (f === 'attack') {
    const gl = g.createRadialGradient(cx, s * 0.55, 0, cx, s * 0.55, s * 0.12);
    gl.addColorStop(0, 'rgba(255,240,150,1)');
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.fillRect(cx - s * 0.15, s * 0.42, s * 0.3, s * 0.26);
  }
}

const SPRITES = {} as Record<MonsterKind, Record<Frame, THREE.CanvasTexture>>;
for (const kind of ['crawler', 'spitter'] as MonsterKind[]) {
  SPRITES[kind] = {} as Record<Frame, THREE.CanvasTexture>;
  for (const f of FRAMES) {
    SPRITES[kind][f] = canvasTex(128, (g, s) => (kind === 'crawler' ? drawCrawler(g, s, f) : drawSpitter(g, s, f)));
  }
}

interface MonsterDef {
  hp: number;
  speed: number;
  r: number;
  size: number;
  fly: number;
}
const MDEF: Record<MonsterKind, MonsterDef> = {
  crawler: { hp: 3, speed: 2.6, r: 0.45, size: 1.7, fly: 0 },
  spitter: { hp: 2, speed: 1.8, r: 0.4, size: 1.5, fly: 0.7 },
};
interface Monster {
  kind: MonsterKind;
  pos: THREE.Vector3;
  hp: number;
  awake: boolean;
  cool: number;
  hurt: number;
  attack: number;
  deadT: number;
  sprite: THREE.Sprite;
  phase: number;
}
const monsters: Monster[] = [];

// ---------- lecture de la carte ----------
for (let cy = 0; cy < H; cy++) {
  for (let cx = 0; cx < W; cx++) {
    const c = cellAt(cx, cy);
    const x = centerX(cx);
    const z = centerZ(cy);
    if (c === 'P') player.pos.set(x, 0, z);
    else if (c === 'T' || c === 'C') {
      const mesh = new THREE.Mesh(c === 'T' ? crystalGeo : cardGeo, c === 'T' ? crystalMat : cardMat);
      mesh.position.set(x, 1.1, z);
      scene.add(mesh);
      pickups.push({ kind: c === 'T' ? 'crystal' : 'card', mesh, taken: false });
      if (c === 'T') crystalsTotal++;
    } else if (c === 'X') {
      exitCell = { cx, cy };
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.15, 40),
        new THREE.MeshBasicMaterial({ color: 0x3ff0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.03, z);
      ring.name = 'sas';
      scene.add(ring);
    } else if (c === 'M' || c === 'S') {
      const kind: MonsterKind = c === 'M' ? 'crawler' : 'spitter';
      const def = MDEF[kind];
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: SPRITES[kind].walk0, transparent: true, alphaTest: 0.1, fog: true }));
      sprite.scale.set(def.size, def.size, 1);
      scene.add(sprite);
      monsters.push({ kind, pos: new THREE.Vector3(x, 0, z), hp: def.hp, awake: false, cool: 1, hurt: 0, attack: 0, deadT: 0, sprite, phase: Math.random() * 6 });
    }
  }
}
const sasRing = scene.getObjectByName('sas') as THREE.Mesh;

// ---------- arme à l'écran ----------
const gun = new THREE.Group();
{
  // Couleurs fixes (sans éclairage) : la lampe frontale, collée à la caméra, la blanchirait.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), new THREE.MeshBasicMaterial({ color: 0xaeb8d4 }));
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.18), new THREE.MeshBasicMaterial({ color: 0x5a6488 }));
  top.position.set(0, 0.041, 0.01);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.008, 0.12), new THREE.MeshBasicMaterial({ color: 0x3ff0ff }));
  strip.position.set(0, 0.0, -0.02);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0x2b3050 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.19;
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd8deee }));
  glove.scale.set(1, 0.9, 1.3);
  glove.position.set(0.006, -0.045, 0.09);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.07, 12), new THREE.MeshBasicMaterial({ color: 0xd8761e }));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0.012, -0.05, 0.17);
  gun.add(body, top, strip, barrel, glove, cuff);
}
const GUN_REST = new THREE.Vector3(0.17, -0.17, -0.42);
gun.position.copy(GUN_REST);
camera.add(gun);
const muzzle = new THREE.Object3D();
muzzle.position.set(0, 0, -0.28);
gun.add(muzzle);
const flash = new THREE.PointLight(0x7ff8ff, 0, 7);
camera.add(flash);
flash.position.set(0.2, -0.15, -0.9);

// Rayon du tir (affiché un instant) et orbes des cracheurs.
const beam = new THREE.Mesh(
  new THREE.BoxGeometry(0.035, 0.035, 1),
  new THREE.MeshBasicMaterial({ color: 0x7ff8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
);
beam.visible = false;
scene.add(beam);
const orbTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,250,200,1)');
  gr.addColorStop(0.35, 'rgba(255,140,40,0.9)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});
interface Orb {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  sprite: THREE.Sprite;
}
const orbs: Orb[] = [];
for (let i = 0; i < 10; i++) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sprite.scale.set(0.6, 0.6, 1);
  sprite.visible = false;
  scene.add(sprite);
  orbs.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, sprite });
}
const sparkTex = canvasTex(32, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(127,248,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});
const impact = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
impact.visible = false;
scene.add(impact);

// ---------- commandes ----------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const STICK_R = 55;
const moveEl = document.querySelector('#stick-move') as HTMLElement;
const fireEl = document.querySelector('#fire') as HTMLElement;
let moveStick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
let lookId = -1;
let lookX = 0;
let fireId = -1;
let mouseFire = false;
let turnAcc = 0;

function inFire(x: number, y: number): boolean {
  const r = fireEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return Math.hypot(x - cx, y - cy) < r.width * 0.75;
}
function drawStick(): void {
  if (!moveStick) return;
  moveEl.style.left = `${moveStick.ox}px`;
  moveEl.style.top = `${moveStick.oy}px`;
  (moveEl.firstElementChild as HTMLElement).style.transform = `translate(${moveStick.x * STICK_R}px, ${moveStick.y * STICK_R}px)`;
}
document.querySelector('#back')?.addEventListener('click', () => {
  location.href = 'tests.html';
});
window.addEventListener('pointerdown', (e) => {
  const target = e.target as HTMLElement;
  if (target.id === 'back') return;
  if (player.over) {
    location.reload();
    return;
  }
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
    else mouseFire = true;
    return;
  }
  if (inFire(e.clientX, e.clientY) && fireId < 0) {
    fireId = e.pointerId;
    fireEl.classList.add('on');
  } else if (e.clientX < window.innerWidth / 2 && !moveStick) {
    moveStick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    moveEl.classList.add('on');
    drawStick();
  } else if (lookId < 0) {
    lookId = e.pointerId;
    lookX = e.clientX;
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === renderer.domElement) turnAcc -= e.movementX * MOUSE_TURN;
    return;
  }
  if (moveStick && moveStick.id === e.pointerId) {
    let dx = (e.clientX - moveStick.ox) / STICK_R;
    let dy = (e.clientY - moveStick.oy) / STICK_R;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    moveStick.x = dx;
    moveStick.y = dy;
    drawStick();
  } else if (e.pointerId === lookId) {
    turnAcc -= (e.clientX - lookX) * TOUCH_TURN;
    lookX = e.clientX;
  }
});
function release(e: PointerEvent): void {
  if (e.pointerType === 'mouse') {
    mouseFire = false;
    return;
  }
  if (moveStick && moveStick.id === e.pointerId) {
    moveStick = null;
    moveEl.classList.remove('on');
  }
  if (e.pointerId === lookId) lookId = -1;
  if (e.pointerId === fireId) {
    fireId = -1;
    fireEl.classList.remove('on');
  }
}
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- HUD ----------
const heartsEl = document.querySelector('#hearts') as HTMLElement;
const crystalsEl = document.querySelector('#crystals') as HTMLElement;
const cardEl = document.querySelector('#card') as HTMLElement;
const msgEl = document.querySelector('#msg') as HTMLElement;
const bannerEl = document.querySelector('#banner') as HTMLElement;
const hurtEl = document.querySelector('#hurt') as HTMLElement;
const crossEl = document.querySelector('#cross') as HTMLElement;
const statsEl = document.querySelector('#stats') as HTMLElement;
const mapEl = document.querySelector('#map') as HTMLCanvasElement;
const mapG = mapEl.getContext('2d') as CanvasRenderingContext2D;
if (params.get('stats') === '0') statsEl.hidden = true;
let msgLeft = 0;
function message(text: string, s = 2.5): void {
  msgEl.textContent = text;
  msgEl.classList.add('on');
  msgLeft = s;
}
function hud(): void {
  heartsEl.textContent = '♥'.repeat(Math.max(0, player.hearts)) + '♡'.repeat(MAX_HEARTS - Math.max(0, player.hearts));
  crystalsEl.textContent = `◆ ${player.crystals}/${crystalsTotal}`;
  cardEl.textContent = player.card ? '▣ carte' : '';
}
const seen = new Uint8Array(W * H);
function drawMap(): void {
  const s = 12;
  const px = player.pos.x / CELL;
  const pz = player.pos.z / CELL;
  mapG.clearRect(0, 0, mapEl.width, mapEl.height);
  mapG.save();
  mapG.translate(mapEl.width / 2 - px * s, mapEl.height / 2 - pz * s);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (!seen[cy * W + cx]) continue;
      const c = cellAt(cx, cy);
      mapG.fillStyle = c === '#' ? '#6b7cff' : c === 'D' ? '#f0b02a' : c === 'X' ? '#3ff0ff' : 'rgba(40,50,90,0.8)';
      mapG.fillRect(cx * s, cy * s, s, s);
    }
  }
  mapG.translate(px * s, pz * s);
  mapG.rotate(-player.yaw);
  mapG.fillStyle = '#ffffff';
  mapG.beginPath();
  mapG.moveTo(0, -7);
  mapG.lineTo(5, 5);
  mapG.lineTo(-5, 5);
  mapG.fill();
  mapG.restore();
}
function reveal(): void {
  const pcx = Math.floor(player.pos.x / CELL);
  const pcy = Math.floor(player.pos.z / CELL);
  // Cases vues : rayons en éventail autour de Kaï.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const d = rayDist(player.pos.x, player.pos.z, dx, dz, 14) + 0.5;
    for (let t = 0; t <= d; t += 1) {
      const cx = Math.floor((player.pos.x + dx * t) / CELL);
      const cy = Math.floor((player.pos.z + dz * t) / CELL);
      if (cx >= 0 && cy >= 0 && cx < W && cy < H) seen[cy * W + cx] = 1;
    }
  }
  seen[pcy * W + pcx] = 1;
}

function hurtPlayer(n: number): void {
  if (player.over || player.invuln > 0 || god) return;
  player.hearts -= n;
  player.invuln = 0.8;
  hurtEl.style.opacity = '1';
  if (player.hearts <= 0) end(false);
}
function end(win: boolean): void {
  player.over = true;
  document.exitPointerLock?.();
  bannerEl.innerHTML = win
    ? `Épave fouillée !<small>Cristaux ${player.crystals}/${crystalsTotal} · monstres ${killed}/${monsters.length} · ${Math.round(time)} s — touche pour rejouer</small>`
    : `Kaï est à terre<small>Cristaux ${player.crystals}/${crystalsTotal} — touche pour rejouer</small>`;
  bannerEl.classList.add('on');
}

// ---------- tir ----------
let fireCool = 0;
let shots = 0;
let killed = 0;
let god = false;
let beamLeft = 0;
let recoil = 0;
const fwd = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Ennemi visé : dans un petit cône devant Kaï (aide à la visée au doigt), visible, le plus proche. */
function target(): Monster | null {
  let best: Monster | null = null;
  let bd = Infinity;
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const dx = m.pos.x - player.pos.x;
    const dz = m.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > SHOT_RANGE || d < 0.01) continue;
    const cos = (dx * fwd.x + dz * fwd.z) / d;
    const tol = Math.max(Math.cos(0.1), Math.cos(Math.atan2(MDEF[m.kind].r + 0.25, d)));
    if (cos < tol) continue;
    if (!lineOfSight(player.pos.x, player.pos.z, m.pos.x, m.pos.z)) continue;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function shoot(): void {
  shots++;
  recoil = 1;
  const t = target();
  muzzle.getWorldPosition(_v);
  if (t) {
    _w.set(t.pos.x, MDEF[t.kind].fly + MDEF[t.kind].size * 0.45, t.pos.z);
    t.hp--;
    t.hurt = 0.12;
    t.awake = true;
    if (t.hp <= 0) {
      killed++;
      t.deadT = 0;
    }
  } else {
    const d = rayDist(player.pos.x, player.pos.z, fwd.x, fwd.z, SHOT_RANGE);
    _w.set(player.pos.x + fwd.x * d, EYE - 0.1, player.pos.z + fwd.z * d);
  }
  beam.position.copy(_v).add(_w).multiplyScalar(0.5);
  beam.scale.set(1, 1, _v.distanceTo(_w));
  beam.lookAt(_w);
  beam.visible = true;
  beamLeft = 0.06;
  impact.position.copy(_w);
  impact.scale.set(0.8, 0.8, 1);
  impact.visible = true;
  flash.intensity = 8;
  // Le bruit réveille les monstres proches qui voient Kaï.
  for (const m of monsters) {
    if (m.hp > 0 && m.pos.distanceTo(player.pos) < 12 && lineOfSight(player.pos.x, player.pos.z, m.pos.x, m.pos.z)) m.awake = true;
  }
}

// ---------- boucle ----------
let time = 0;
let fps = 0;
let fpsAcc = 0;
let fpsN = 0;
let slowLeft = 0;
let timeScale = 1;
let bob = 0;
const timer = new THREE.Timer();
const move = new THREE.Vector3();
let lastCell = -1;
message("Fouille l'épave : cristaux, carte d'accès, puis le sas.", 4);

function update(dt: number): void {
  time += dt;
  // Rotation
  if (keys.has('ArrowLeft')) player.yaw += TURN_SPEED * dt;
  if (keys.has('ArrowRight')) player.yaw -= TURN_SPEED * dt;
  player.yaw += turnAcc;
  turnAcc = 0;
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);
  // Déplacement
  let f = 0;
  let s = 0;
  if (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyA') || keys.has('KeyQ')) s -= 1;
  if (keys.has('KeyD')) s += 1;
  if (moveStick) {
    f = -moveStick.y;
    s = moveStick.x;
  }
  move.set(fwd.x * f + rx * s, 0, fwd.z * f + rz * s);
  if (move.lengthSq() > 1) move.normalize();
  if (!player.over) slide(player.pos, move.x * SPEED * dt, move.z * SPEED * dt, PLAYER_R);
  const moving = move.lengthSq() > 0.01;
  bob += dt * (moving ? 9 : 2);

  // Portes : s'ouvrent quand Kaï ou un monstre éveillé approche.
  for (const d of doors) {
    const x = centerX(d.cx);
    const z = centerZ(d.cy);
    let near = Math.hypot(player.pos.x - x, player.pos.z - z) < CELL * 1.1;
    if (!near) for (const m of monsters) if (m.hp > 0 && m.awake && Math.hypot(m.pos.x - x, m.pos.z - z) < CELL) near = true;
    d.open = THREE.MathUtils.clamp(d.open + (near ? 1.8 : -1.2) * dt, 0, 1);
    d.mesh.position.y = WALL_H / 2 + d.open * (WALL_H - 0.15);
  }

  // Objets
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 1.1 + Math.sin(time * 2.5 + p.mesh.position.x) * 0.1;
    if (Math.hypot(p.mesh.position.x - player.pos.x, p.mesh.position.z - player.pos.z) < 0.9) {
      p.taken = true;
      p.mesh.visible = false;
      if (p.kind === 'crystal') {
        player.crystals++;
        message(`Cristal trouvé (${player.crystals}/${crystalsTotal})`, 1.6);
      } else {
        player.card = true;
        message("Carte d'accès : le sas s'ouvrira", 2.5);
      }
    }
  }
  // Sas
  const cell = Math.floor(player.pos.z / CELL) * W + Math.floor(player.pos.x / CELL);
  (sasRing.material as THREE.MeshBasicMaterial).color.setHex(player.card ? 0x3ff0ff : 0xff4a6a);
  sasRing.rotation.z += dt;
  if (cell !== lastCell) {
    lastCell = cell;
    reveal();
    if (cell === exitCell.cy * W + exitCell.cx && !player.over) {
      if (player.card) end(true);
      else message("Sas verrouillé : il faut la carte d'accès", 2.5);
    }
  }

  // Monstres
  for (const m of monsters) {
    const def = MDEF[m.kind];
    const mat = m.sprite.material as THREE.SpriteMaterial;
    if (m.hp <= 0) {
      m.deadT += dt;
      mat.map = SPRITES[m.kind].dead;
      m.sprite.position.set(m.pos.x, def.size / 2 - 0.05, m.pos.z);
      continue;
    }
    const dx = player.pos.x - m.pos.x;
    const dz = player.pos.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!m.awake && dist < 13 && lineOfSight(m.pos.x, m.pos.z, player.pos.x, player.pos.z)) m.awake = true;
    m.cool -= dt;
    m.hurt = Math.max(0, m.hurt - dt);
    m.attack = Math.max(0, m.attack - dt);
    if (m.awake && !player.over) {
      const want = m.kind === 'spitter' ? (dist > 8 ? 1 : dist < 5 ? -0.6 : 0) : dist > 1.1 ? 1 : 0;
      const sees = lineOfSight(m.pos.x, m.pos.z, player.pos.x, player.pos.z);
      if (want !== 0 && m.hurt <= 0) {
        // Sans vue directe, il avance quand même vers Kaï (les portes s'ouvrent devant lui).
        const sp = def.speed * want * dt;
        slide(m.pos, (dx / dist) * sp, (dz / dist) * sp, def.r);
      }
      if (m.kind === 'crawler' && dist < 1.3 && m.cool <= 0) {
        m.cool = 0.9;
        m.attack = 0.3;
        hurtPlayer(1);
      }
      if (m.kind === 'spitter' && sees && dist < 14 && m.cool <= 0) {
        m.cool = 2.2;
        m.attack = 0.4;
        const o = orbs.find((x) => x.life <= 0);
        if (o) {
          o.pos.set(m.pos.x, def.fly + def.size * 0.4, m.pos.z);
          o.vel.set(player.pos.x - m.pos.x, EYE - 0.3 - o.pos.y, player.pos.z - m.pos.z).normalize().multiplyScalar(7);
          o.life = 4;
          o.sprite.visible = true;
        }
      }
    }
    const walk = Math.floor(time * 5 + m.phase) % 2 === 0;
    mat.map = m.hurt > 0 ? SPRITES[m.kind].hurt : m.attack > 0 ? SPRITES[m.kind].attack : walk || !m.awake ? SPRITES[m.kind].walk0 : SPRITES[m.kind].walk1;
    const hover = def.fly > 0 ? Math.sin(time * 2 + m.phase) * 0.12 : 0;
    m.sprite.position.set(m.pos.x, def.fly + def.size / 2 + hover, m.pos.z);
  }

  // Orbes
  for (const o of orbs) {
    if (o.life <= 0) continue;
    o.life -= dt;
    o.pos.addScaledVector(o.vel, dt);
    const cx = Math.floor(o.pos.x / CELL);
    const cy = Math.floor(o.pos.z / CELL);
    if (solid(cx, cy)) o.life = 0;
    else if (Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z) < 0.55) {
      o.life = 0;
      hurtPlayer(1);
    }
    o.sprite.position.copy(o.pos);
    o.sprite.visible = o.life > 0;
  }

  // Tir
  fireCool -= dt;
  const firing = fireId >= 0 || mouseFire || keys.has('KeyJ') || keys.has('KeyF') || keys.has('Space') || autoFire;
  if (firing && fireCool <= 0 && !player.over) {
    shoot();
    fireCool = FIRE_GAP;
  }
  crossEl.classList.toggle('lock', !!target());
  beamLeft -= dt;
  beam.visible = beamLeft > 0;
  if (impact.visible) {
    impact.scale.multiplyScalar(Math.max(0, 1 - dt * 8));
    if (impact.scale.x < 0.05) impact.visible = false;
  }
  flash.intensity = Math.max(0, flash.intensity - dt * 80);
  recoil = Math.max(0, recoil - dt * 7);

  // Caméra et arme
  player.invuln = Math.max(0, player.invuln - dt);
  hurtEl.style.opacity = String(Math.min(1, player.invuln * 1.2));
  camera.position.set(player.pos.x, EYE + (moving ? Math.sin(bob) * 0.04 : 0), player.pos.z);
  camera.rotation.set(0, player.yaw, 0);
  gun.position.set(
    GUN_REST.x + (moving ? Math.cos(bob * 0.5) * 0.012 : 0),
    GUN_REST.y + (moving ? Math.abs(Math.sin(bob * 0.5)) * 0.012 : 0) - recoil * 0.015,
    GUN_REST.z + recoil * 0.06,
  );
  gun.rotation.x = recoil * 0.12;

  msgLeft -= dt;
  if (msgLeft <= 0) msgEl.classList.remove('on');
}

let autoFire = false;
function frame(): void {
  requestAnimationFrame(frame);
  timer.update();
  const raw = Math.min(timer.getDelta(), 0.05);
  if (document.hidden) return;
  update(raw * timeScale);
  renderer.render(scene, camera);
  fpsAcc += raw;
  fpsN++;
  slowLeft -= raw;
  if (slowLeft <= 0) {
    slowLeft = 0.25;
    fps = Math.round(fpsN / Math.max(fpsAcc, 1e-3));
    fpsAcc = 0;
    fpsN = 0;
    hud();
    drawMap();
    const info = renderer.info.render;
    statsEl.textContent = `${fps} i/s · ${info.calls} appels · ${Math.round(info.triangles / 1000)} k triangles`;
  }
}
reveal();
hud();
requestAnimationFrame(frame);

// Aide de test.
(window as unknown as { __xrShip: unknown }).__xrShip = {
  info: () => ({
    pos: [player.pos.x / CELL, player.pos.z / CELL],
    yaw: player.yaw,
    hearts: player.hearts,
    crystals: player.crystals,
    crystalsTotal,
    card: player.card,
    over: player.over,
    shots,
    killed,
    monsters: monsters.length,
    awake: monsters.filter((m) => m.awake && m.hp > 0).length,
    fps,
    calls: renderer.info.render.calls,
  }),
  /** Place Kaï au centre d'une case, regard en radians (0 = vers le haut de la carte, −π/2 = vers la droite). */
  teleport: (cx: number, cy: number, yaw?: number) => {
    player.pos.set(centerX(cx), 0, centerZ(cy));
    if (yaw !== undefined) player.yaw = yaw;
  },
  /** Tourne Kaï vers une case. */
  face: (cx: number, cy: number) => {
    player.yaw = Math.atan2(-(centerX(cx) - player.pos.x), -(centerZ(cy) - player.pos.z));
  },
  fire: (on = true) => {
    autoFire = on;
  },
  god: (on = true) => {
    god = on;
  },
  timeScale: (s: number) => {
    timeScale = s;
  },
};
