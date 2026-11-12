import '@fontsource/exo-2/600.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Essai : arène 3D vue du dessus avec le Kaï du .glb (squelette et animations de Blender).
// Vagues d'ennemis qui arrivent du bord. Sert à juger le modèle en jeu et sa tenue sur téléphone.
// http://localhost:5173/preview/arena.html  (?auto=1 : pilote automatique ; ?stats=0 : sans compteurs)
// Clavier : ZQSD / WASD bouger, flèches viser et tirer, J tirer sur le plus proche. Souris : clic tenu = tir.
// Tactile : moitié gauche = stick de déplacement, moitié droite = stick de visée (tir tant qu'il est tenu).

// Le .glb part dans le build (et l'APK) avec cette page seulement.
const KAI_GLB_URL = new URL('../art/kai.glb', import.meta.url).href;
const params = new URLSearchParams(location.search);
const ARENA_R = 15;
const KAI_SPEED = 5;
const KAI_R = 0.4;
const MAX_HEARTS = 5;
const HIT_INVULN = 1.2;
const FIRE_GAP = 0.14;
const BOLT_SPEED = 24;
const BOLT_RANGE = 14;
const CAM_OFFSET = new THREE.Vector3(0, 8.2, 5.6);

type KindId = 'crawler' | 'dart' | 'brute';
interface KindDef {
  hp: number;
  speed: number;
  r: number;
  score: number;
  max: number;
  color: number;
}
const KINDS: Record<KindId, KindDef> = {
  crawler: { hp: 2, speed: 2.3, r: 0.45, score: 100, max: 40, color: 0xb24bff },
  dart: { hp: 1, speed: 4.4, r: 0.32, score: 150, max: 30, color: 0xff8a2e },
  brute: { hp: 7, speed: 1.5, r: 0.85, score: 500, max: 8, color: 0x3fd07a },
};
const KIND_IDS = Object.keys(KINDS) as KindId[];

// ---------- rendu ----------
const view = document.querySelector('#view') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
view.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07031a);
scene.fog = new THREE.Fog(0x07031a, 22, 48);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 120);
scene.add(new THREE.HemisphereLight(0xc8dcff, 0x2a1840, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-4, 10, 6);
scene.add(sun);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- décor ----------
const floorMat = new THREE.ShaderMaterial({
  uniforms: { uR: { value: ARENA_R }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    uniform float uR; uniform float uTime; varying vec2 vP;
    float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.,1.732))), p.x); }
    void main(){
      vec2 p = vP * 0.9;
      vec2 r = vec2(1., 1.732); vec2 h = r * .5;
      vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h;
      vec2 g = dot(a,a) < dot(b,b) ? a : b;
      float e = .5 - hexDist(g);
      float line = smoothstep(.06, .0, e);
      float d = length(vP) / uR;
      vec3 base = mix(vec3(.08,.05,.17), vec3(.04,.02,.1), d);
      float pulse = .55 + .45 * sin(uTime * 1.6 - d * 9.);
      vec3 col = base + line * vec3(.15,.75,.9) * (.18 + .22 * pulse) * (1. - d * .55);
      col += smoothstep(.93, 1., d) * vec3(.2,.9,1.) * .6;
      gl_FragColor = vec4(col, 1.);
    }`,
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 72), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const outer = new THREE.Mesh(
  new THREE.RingGeometry(ARENA_R, 60, 72, 1),
  new THREE.MeshBasicMaterial({ color: 0x0c0624 }),
);
outer.rotation.x = -Math.PI / 2;
outer.position.y = -0.02;
scene.add(outer);

const rim = new THREE.Mesh(
  new THREE.TorusGeometry(ARENA_R, 0.09, 6, 96),
  new THREE.MeshBasicMaterial({ color: 0x5ff6ff }),
);
rim.rotation.x = Math.PI / 2;
rim.position.y = 0.35;
scene.add(rim);
const wall = new THREE.Mesh(
  new THREE.CylinderGeometry(ARENA_R, ARENA_R, 0.35, 96, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x1b4a7a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
);
wall.position.y = 0.175;
scene.add(wall);

// Cristaux autour de l'arène (un seul appel de dessin).
{
  const geo = new THREE.ConeGeometry(0.6, 3, 5);
  geo.translate(0, 1.5, 0);
  const n = 34;
  const spires = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a0a3a }), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.15;
    const d = ARENA_R + 3 + rnd() * 14;
    p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4));
    const k = 0.6 + rnd() * 1.6;
    s.set(k, k * (0.8 + rnd()), k);
    spires.setMatrixAt(i, m.compose(p, q, s));
    spires.setColorAt(i, c.setHSL(0.5 + rnd() * 0.32, 0.8, 0.55));
  }
  scene.add(spires);
}

// Ombre ronde (texture dessinée une fois).
const shadowTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const kaiShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1.3, 1.3),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
);
kaiShadow.rotation.x = -Math.PI / 2;
kaiShadow.position.y = 0.02;
scene.add(kaiShadow);

// ---------- Kaï ----------
const kai = {
  pos: new THREE.Vector3(),
  facing: 0,
  hearts: MAX_HEARTS,
  invuln: 0,
  knock: new THREE.Vector3(),
  dead: false,
};
let model: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let current: THREE.AnimationAction | null = null;
let hurtLeft = 0;
const armChain: THREE.Bone[] = [];
let hand: THREE.Object3D | null = null;
let triangles = 0;

const gun = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.3), new THREE.MeshLambertMaterial({ color: 0xe9eef8 }));
  body.position.z = 0.1;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x3b4166 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.33;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.03, 0.2), new THREE.MeshBasicMaterial({ color: 0x3ff0ff }));
  strip.position.set(0, 0.05, 0.1);
  gun.add(body, barrel, strip);
}
const GUN_LEN = 0.44;
scene.add(gun);

function boneKey(name: string): string {
  return name.normalize('NFD').replace(/[^A-Za-z]/g, '');
}

function play(name: string, fade = 0.15): void {
  const next = actions[name];
  if (!next || next === current) return;
  next.reset().play();
  if (current) current.crossFadeTo(next, fade, false);
  current = next;
}

async function loadKai(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(KAI_GLB_URL);
  model = gltf.scene;
  const bones = new Map<string, THREE.Bone>();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(boneKey(o.name), o as THREE.Bone);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.frustumCulled = false;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  // Bras droit (bras armé) : on le tend vers la visée après l'animation.
  for (const key of ['BrasR', 'CoudeR']) {
    const b = bones.get(key);
    if (b) armChain.push(b);
  }
  hand = bones.get('MainR') ?? null;
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (clip.name === 'touche') {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions[clip.name] = a;
  }
  play('repos', 0);
  console.info(
    `[arena] Kaï : ${Math.round(triangles)} triangles, animations ${gltf.animations.map((c) => c.name).join(', ')}, bras ${armChain.length}/2, main ${hand ? 'ok' : 'absente'}`,
  );
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const aimDir = new THREE.Vector3(0, 0, 1);
const armDir = new THREE.Vector3();

/** Tourne l'os pour que la direction vers son enfant suive `dir` (repère du monde). */
function alignBone(b: THREE.Bone, child: THREE.Object3D, dir: THREE.Vector3): void {
  b.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _cur.subVectors(_b, _a);
  if (_cur.lengthSq() < 1e-6 || !b.parent) return;
  _cur.normalize();
  _q.setFromUnitVectors(_cur, dir);
  b.getWorldQuaternion(_wq).premultiply(_q);
  b.parent.getWorldQuaternion(_pq).invert();
  b.quaternion.copy(_pq.multiply(_wq));
  b.updateMatrixWorld(true);
}

function poseArm(): void {
  if (!model) return;
  model.updateMatrixWorld(true);
  armDir.set(Math.sin(kai.facing), -0.12, Math.cos(kai.facing)).normalize();
  for (const b of armChain) {
    const child = b.children.find((c) => (c as THREE.Bone).isBone);
    if (child) alignBone(b, child, armDir);
  }
  if (hand) {
    hand.getWorldPosition(gun.position);
    _b.copy(gun.position).addScaledVector(armDir, 1);
    gun.lookAt(_b);
  }
}

// ---------- ennemis ----------
interface Enemy {
  kind: KindId;
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  rise: number;
  flash: number;
  phase: number;
  alive: boolean;
}
function kindGeometry(kind: KindId): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const g2 = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = g2.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g2.deleteAttribute('uv');
    return g2;
  };
  const def = KINDS[kind];
  if (kind === 'crawler') {
    const body = new THREE.SphereGeometry(def.r, 12, 8);
    body.scale(1, 0.7, 1.15);
    body.translate(0, def.r * 0.7, 0);
    parts.push(paint(body, def.color));
    for (const sx of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.09, 6, 4);
      eye.translate(sx * 0.16, def.r * 0.95, def.r * 0.9);
      parts.push(paint(eye, 0x9dff6a));
    }
  } else if (kind === 'dart') {
    const body = new THREE.ConeGeometry(def.r, def.r * 3, 6);
    body.rotateX(Math.PI / 2);
    body.translate(0, def.r + 0.1, 0);
    parts.push(paint(body, def.color));
    const core = new THREE.OctahedronGeometry(def.r * 0.55);
    core.translate(0, def.r + 0.1, -def.r * 0.4);
    parts.push(paint(core, 0xfff0a0));
  } else {
    const body = new THREE.DodecahedronGeometry(def.r);
    body.scale(1.1, 0.85, 1);
    body.translate(0, def.r * 0.85, 0);
    parts.push(paint(body, def.color));
    const horn = new THREE.ConeGeometry(0.18, 0.6, 5);
    horn.rotateX(Math.PI / 2.6);
    horn.translate(0, def.r * 1.3, def.r * 0.75);
    parts.push(paint(horn, 0xf6f8ff));
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('fusion impossible');
  return merged;
}

const enemyMeshes = {} as Record<KindId, THREE.InstancedMesh>;
const freeSlots = {} as Record<KindId, number[]>;
const enemies: Enemy[] = [];
for (const kind of KIND_IDS) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x220a33 });
  const mesh = new THREE.InstancedMesh(kindGeometry(kind), mat, KINDS[kind].max);
  mesh.count = KINDS[kind].max;
  mesh.frustumCulled = false;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < KINDS[kind].max; i++) {
    mesh.setMatrixAt(i, hide);
    mesh.setColorAt(i, white);
  }
  enemyMeshes[kind] = mesh;
  freeSlots[kind] = Array.from({ length: KINDS[kind].max }, (_, i) => KINDS[kind].max - 1 - i);
  scene.add(mesh);
}

function spawnEnemy(kind: KindId, angle?: number): boolean {
  const slot = freeSlots[kind].pop();
  if (slot === undefined) return false;
  const a = angle ?? Math.random() * Math.PI * 2;
  const d = ARENA_R - 1.2;
  enemies.push({
    kind,
    slot,
    pos: new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d),
    vel: new THREE.Vector3(),
    hp: KINDS[kind].hp,
    rise: 0,
    flash: 0,
    phase: Math.random() * 6,
    alive: true,
  });
  return true;
}

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();
const _sep = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function updateEnemies(dt: number, t: number): void {
  for (const e of enemies) {
    const def = KINDS[e.kind];
    if (e.rise < 1) {
      e.rise = Math.min(1, e.rise + dt * 1.6);
    } else if (!kai.dead) {
      _a.subVectors(kai.pos, e.pos).setY(0);
      const dist = _a.length();
      if (dist > 0.001) _a.multiplyScalar(1 / dist);
      // Les dards zigzaguent.
      if (e.kind === 'dart') {
        const w = Math.sin(t * 6 + e.phase) * 0.7;
        _a.set(_a.x - _a.z * w, 0, _a.z + _a.x * w).normalize();
      }
      _sep.set(0, 0, 0);
      for (const o of enemies) {
        if (o === e) continue;
        const dx = e.pos.x - o.pos.x;
        const dz = e.pos.z - o.pos.z;
        const min = def.r + KINDS[o.kind].r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          _sep.x += (dx / d) * (min - d);
          _sep.z += (dz / d) * (min - d);
        }
      }
      e.vel.lerp(_a.multiplyScalar(def.speed), Math.min(1, dt * 4));
      e.pos.addScaledVector(e.vel, dt).addScaledVector(_sep, Math.min(1, dt * 8));
      const r = e.pos.length();
      if (r > ARENA_R - def.r) e.pos.multiplyScalar((ARENA_R - def.r) / r);
      // Contact avec Kaï.
      if (dist < def.r + KAI_R && kai.invuln <= 0) hurtKai(e.pos);
    }
    e.flash = Math.max(0, e.flash - dt);
    const bob = 1 + Math.sin(t * 8 + e.phase) * 0.06;
    const yaw = Math.atan2(e.vel.x, e.vel.z);
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    _s.set(bob, (1 / bob) * e.rise, bob);
    _b.set(e.pos.x, (e.rise - 1) * def.r * 2, e.pos.z);
    enemyMeshes[e.kind].setMatrixAt(e.slot, _m.compose(_b, _q, _s));
    enemyMeshes[e.kind].setColorAt(e.slot, e.flash > 0 ? _col.setRGB(3, 3, 3) : _col.setRGB(1, 1, 1));
  }
  for (const kind of KIND_IDS) {
    enemyMeshes[kind].instanceMatrix.needsUpdate = true;
    if (enemyMeshes[kind].instanceColor) enemyMeshes[kind].instanceColor!.needsUpdate = true;
  }
}

function killEnemy(e: Enemy): void {
  e.alive = false;
  enemyMeshes[e.kind].setMatrixAt(e.slot, HIDE);
  freeSlots[e.kind].push(e.slot);
  burst(e.pos, KINDS[e.kind].color, e.kind === 'brute' ? 26 : 14);
  score += KINDS[e.kind].score;
  killed++;
}

// ---------- tirs ----------
const MAX_BOLTS = 48;
const boltGeo = new THREE.CapsuleGeometry(0.07, 0.55, 2, 6);
boltGeo.rotateX(Math.PI / 2);
const bolts = new THREE.InstancedMesh(
  boltGeo,
  new THREE.MeshBasicMaterial({ color: 0x7ff8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  MAX_BOLTS,
);
bolts.frustumCulled = false;
scene.add(bolts);
interface Bolt {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  left: number;
}
const boltList: Bolt[] = Array.from({ length: MAX_BOLTS }, () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(), left: 0 }));
let fireCooldown = 0;
let shotsFired = 0;

function fire(): void {
  const b = boltList.find((x) => x.left <= 0);
  if (!b) return;
  gun.localToWorld(b.pos.set(0, 0, GUN_LEN));
  b.dir.set(Math.sin(kai.facing), 0, Math.cos(kai.facing));
  b.left = BOLT_RANGE;
  shotsFired++;
  muzzleFlash = 0.05;
}

const _seg = new THREE.Vector3();
function updateBolts(dt: number): void {
  for (let i = 0; i < MAX_BOLTS; i++) {
    const b = boltList[i];
    if (b.left > 0) {
      const step = BOLT_SPEED * dt;
      _seg.copy(b.dir).multiplyScalar(step);
      // Test du segment contre chaque ennemi (cercle au sol).
      let hit: Enemy | null = null;
      let bestT = 2;
      for (const e of enemies) {
        if (e.rise < 0.6) continue;
        const r = KINDS[e.kind].r + 0.12;
        const fx = b.pos.x - e.pos.x;
        const fz = b.pos.z - e.pos.z;
        const A = _seg.x * _seg.x + _seg.z * _seg.z;
        const B = 2 * (fx * _seg.x + fz * _seg.z);
        const C = fx * fx + fz * fz - r * r;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const tt = C < 0 ? 0 : (-B - Math.sqrt(disc)) / (2 * A);
        if (tt >= 0 && tt <= 1 && tt < bestT) {
          bestT = tt;
          hit = e;
        }
      }
      if (hit) {
        b.pos.addScaledVector(_seg, bestT);
        b.left = 0;
        hit.hp--;
        hit.flash = 0.08;
        hit.pos.addScaledVector(b.dir, hit.kind === 'brute' ? 0.08 : 0.3);
        burst(b.pos, 0x7ff8ff, 4);
        if (hit.hp <= 0) killEnemy(hit);
      } else {
        b.pos.add(_seg);
        b.left -= step;
        if (b.pos.x * b.pos.x + b.pos.z * b.pos.z > ARENA_R * ARENA_R) {
          b.left = 0;
          burst(b.pos, 0x7ff8ff, 3);
        }
      }
    }
    if (b.left > 0) {
      _q.setFromUnitVectors(_cur.set(0, 0, 1), b.dir);
      bolts.setMatrixAt(i, _m.compose(b.pos, _q, _s.set(1, 1, 1)));
    } else bolts.setMatrixAt(i, HIDE);
  }
  bolts.instanceMatrix.needsUpdate = true;
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
}

// ---------- éclats ----------
const MAX_SPARKS = 160;
const sparks = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  MAX_SPARKS,
);
sparks.frustumCulled = false;
const sparkList = Array.from({ length: MAX_SPARKS }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 }));
for (let i = 0; i < MAX_SPARKS; i++) {
  sparks.setMatrixAt(i, HIDE);
  sparks.setColorAt(i, _col.setRGB(1, 1, 1));
}
scene.add(sparks);
let sparkNext = 0;
function burst(at: THREE.Vector3, color: number, n: number): void {
  _col.setHex(color);
  for (let k = 0; k < n; k++) {
    const i = sparkNext;
    sparkNext = (sparkNext + 1) % MAX_SPARKS;
    const s = sparkList[i];
    s.pos.set(at.x, Math.max(at.y, 0.4), at.z);
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 5;
    s.vel.set(Math.cos(a) * v, 2 + Math.random() * 4, Math.sin(a) * v);
    s.life = 0.35 + Math.random() * 0.35;
    sparks.setColorAt(i, _col);
  }
  if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
}
function updateSparks(dt: number): void {
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkList[i];
    if (s.life > 0) {
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.05) {
        s.pos.y = 0.05;
        s.vel.y *= -0.3;
      }
      const k = Math.max(0, s.life) * 2.2;
      sparks.setMatrixAt(i, _m.compose(s.pos, _q.identity(), _s.set(k, k, k)));
    } else sparks.setMatrixAt(i, HIDE);
  }
  sparks.instanceMatrix.needsUpdate = true;
}

const flashLight = new THREE.PointLight(0x7ff8ff, 0, 4);
scene.add(flashLight);
let muzzleFlash = 0;

// ---------- commandes ----------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  el: HTMLElement;
}
const STICK_R = 55;
let moveStick: Stick | null = null;
let aimStick: Stick | null = null;
const moveEl = document.querySelector('#stick-move') as HTMLElement;
const aimEl = document.querySelector('#stick-aim') as HTMLElement;
let mouseFire = false;
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouseGround = new THREE.Vector3();

function stickDraw(s: Stick): void {
  s.el.style.left = `${s.ox}px`;
  s.el.style.top = `${s.oy}px`;
  const knob = s.el.firstElementChild as HTMLElement;
  knob.style.transform = `translate(${s.x * STICK_R}px, ${s.y * STICK_R}px)`;
}
function stickMove(s: Stick, cx: number, cy: number): void {
  let dx = (cx - s.ox) / STICK_R;
  let dy = (cy - s.oy) / STICK_R;
  const l = Math.hypot(dx, dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  s.x = dx;
  s.y = dy;
  stickDraw(s);
}
document.querySelector('#back')?.addEventListener('click', () => {
  location.href = '../index.html';
});
window.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).id === 'back') return;
  if (restartIfOver()) return;
  if (e.pointerType === 'mouse') {
    mouseFire = true;
    return;
  }
  const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, el: moveEl };
  if (e.clientX < window.innerWidth / 2 && !moveStick) moveStick = s;
  else if (e.clientX >= window.innerWidth / 2 && !aimStick) aimStick = { ...s, el: aimEl };
  else return;
  const st = (moveStick && moveStick.id === e.pointerId ? moveStick : aimStick) as Stick;
  st.el.classList.add('on');
  stickDraw(st);
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    return;
  }
  if (moveStick && moveStick.id === e.pointerId) stickMove(moveStick, e.clientX, e.clientY);
  if (aimStick && aimStick.id === e.pointerId) stickMove(aimStick, e.clientX, e.clientY);
});
function release(e: PointerEvent): void {
  if (e.pointerType === 'mouse') {
    mouseFire = false;
    return;
  }
  if (moveStick && moveStick.id === e.pointerId) {
    moveStick.el.classList.remove('on');
    moveStick = null;
  }
  if (aimStick && aimStick.id === e.pointerId) {
    aimStick.el.classList.remove('on');
    aimStick = null;
  }
}
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('contextmenu', (e) => e.preventDefault());

let autopilot = params.get('auto') === '1';

function nearestEnemy(): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of enemies) {
    if (e.rise < 0.6) continue;
    const d = e.pos.distanceToSquared(kai.pos);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

const move = new THREE.Vector3();
const aim = new THREE.Vector3();
/** Lit les commandes : déplacement dans `move`, visée dans `aim` ; renvoie vrai si Kaï tire. */
function readControls(t: number): boolean {
  move.set(0, 0, 0);
  aim.set(0, 0, 0);
  let firing = false;
  if (keys.has('KeyW') || keys.has('KeyZ')) move.z -= 1;
  if (keys.has('KeyS')) move.z += 1;
  if (keys.has('KeyA') || keys.has('KeyQ')) move.x -= 1;
  if (keys.has('KeyD')) move.x += 1;
  if (keys.has('ArrowUp')) aim.z -= 1;
  if (keys.has('ArrowDown')) aim.z += 1;
  if (keys.has('ArrowLeft')) aim.x -= 1;
  if (keys.has('ArrowRight')) aim.x += 1;
  if (aim.lengthSq() > 0) firing = true;
  if (moveStick) move.set(moveStick.x, 0, moveStick.y);
  if (aimStick) {
    firing = true;
    if (Math.hypot(aimStick.x, aimStick.y) > 0.35) aim.set(aimStick.x, 0, aimStick.y);
  }
  if (mouseFire) {
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(ground, mouseGround)) aim.subVectors(mouseGround, kai.pos).setY(0);
    firing = true;
  }
  if (keys.has('KeyJ') || keys.has('KeyX') || keys.has('KeyF')) firing = true;
  if (autopilot) {
    // Tourne autour du centre en gardant ses distances, tire sur le plus proche.
    const a = t * 0.35;
    move.set(Math.cos(a) * 6 - kai.pos.x, 0, Math.sin(a) * 6 - kai.pos.z);
    const near = nearestEnemy();
    if (near && near.pos.distanceTo(kai.pos) < 3.5) move.subVectors(kai.pos, near.pos).setY(0).normalize().multiplyScalar(1.5);
    if (move.lengthSq() > 1) move.normalize();
    firing = enemies.length > 0;
  }
  if (move.lengthSq() > 1) move.normalize();
  // Tir sans visée : vise l'ennemi le plus proche.
  if (firing && aim.lengthSq() === 0) {
    const near = nearestEnemy();
    if (near) aim.subVectors(near.pos, kai.pos).setY(0);
  }
  return firing;
}

// ---------- partie ----------
let wave = 0;
let toSpawn: KindId[] = [];
let spawnTimer = 0;
let waveBreak = 1.2;
let score = 0;
let killed = 0;
let time = 0;
const heartsEl = document.querySelector('#hearts') as HTMLElement;
const waveEl = document.querySelector('#wave') as HTMLElement;
const scoreEl = document.querySelector('#score') as HTMLElement;
const statsEl = document.querySelector('#stats') as HTMLElement;
const bannerEl = document.querySelector('#banner') as HTMLElement;
let bannerLeft = 0;
if (params.get('stats') === '0') statsEl.hidden = true;

function banner(html: string, s: number): void {
  bannerEl.innerHTML = html;
  bannerEl.classList.add('on');
  bannerLeft = s;
}

function waveList(n: number): KindId[] {
  const list: KindId[] = [];
  for (let i = 0; i < 4 + n * 3; i++) list.push('crawler');
  if (n >= 2) for (let i = 0; i < n * 2; i++) list.push('dart');
  if (n >= 3) for (let i = 0; i < Math.floor((n - 1) / 2); i++) list.push('brute');
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function startWave(): void {
  wave++;
  toSpawn = waveList(wave);
  spawnTimer = 0;
  banner(`Vague ${wave}`, 1.3);
}

function hurtKai(from: THREE.Vector3): void {
  if (kai.dead || kai.invuln > 0) return;
  kai.hearts--;
  kai.invuln = HIT_INVULN;
  kai.knock.subVectors(kai.pos, from).setY(0).normalize().multiplyScalar(9);
  hurtLeft = 0.45;
  play('touche', 0.05);
  burst(kai.pos, 0xff5a8c, 10);
  if (kai.hearts <= 0) {
    kai.dead = true;
    banner(`Kaï est à terre<small>Vague ${wave} · ${score} pts — touche l'écran pour rejouer</small>`, Infinity);
  }
}

function restartIfOver(): boolean {
  if (!kai.dead) return false;
  for (const e of enemies) killEnemyQuiet(e);
  enemies.length = 0;
  kai.pos.set(0, 0, 0);
  kai.hearts = MAX_HEARTS;
  kai.dead = false;
  kai.invuln = 1;
  wave = 0;
  score = 0;
  killed = 0;
  waveBreak = 1;
  toSpawn = [];
  bannerEl.classList.remove('on');
  bannerLeft = 0;
  play('repos');
  return true;
}
function killEnemyQuiet(e: Enemy): void {
  enemyMeshes[e.kind].setMatrixAt(e.slot, HIDE);
  freeSlots[e.kind].push(e.slot);
}

function updateKai(dt: number, t: number): void {
  const firing = readControls(t);
  if (kai.dead) {
    move.set(0, 0, 0);
  }
  const speed = move.length();
  kai.pos.addScaledVector(move, KAI_SPEED * dt).addScaledVector(kai.knock, dt);
  kai.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
  const r = kai.pos.length();
  if (r > ARENA_R - KAI_R) kai.pos.multiplyScalar((ARENA_R - KAI_R) / r);
  // Regard : la visée d'abord, sinon le sens de la marche.
  const look = aim.lengthSq() > 0 ? aim : speed > 0.1 ? move : null;
  if (look) {
    const target = Math.atan2(look.x, look.z);
    let d = target - kai.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    kai.facing += d * Math.min(1, dt * 16);
  }
  kai.invuln = Math.max(0, kai.invuln - dt);
  fireCooldown -= dt;
  if (firing && !kai.dead && fireCooldown <= 0 && model) {
    fire();
    fireCooldown = FIRE_GAP;
  }
  if (!model || !mixer) return;
  model.position.copy(kai.pos);
  model.rotation.y = kai.facing;
  model.visible = kai.invuln <= 0 || kai.dead || Math.floor(t * 14) % 2 === 0;
  hurtLeft -= dt;
  if (kai.dead) play('chute', 0.2);
  else if (hurtLeft <= 0) {
    if (speed > 0.15) {
      play('course');
      // À reculons quand Kaï tire dans l'autre sens.
      const fwd = Math.sin(kai.facing) * move.x + Math.cos(kai.facing) * move.z;
      if (actions.course) actions.course.timeScale = (fwd < -0.3 * speed ? -1 : 1) * (0.6 + 0.6 * speed);
    } else play('repos');
  }
  mixer.update(dt);
  poseArm();
  kaiShadow.position.set(kai.pos.x, 0.02, kai.pos.z);
  gun.visible = model.visible;
}

const camTarget = new THREE.Vector3();
function updateCamera(dt: number): void {
  _a.copy(kai.pos).multiplyScalar(0.85);
  camTarget.lerp(_a, Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget.x, 0.6, camTarget.z);
}

// ---------- boucle ----------
const clock = new THREE.Timer();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;
let statsLeft = 0;
let timeScale = 1;

function frame(): void {
  requestAnimationFrame(frame);
  clock.update();
  const raw = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) return;
  const dt = raw * timeScale;
  time += dt;
  if (!kai.dead) {
    if (toSpawn.length > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const kind = toSpawn[toSpawn.length - 1];
        if (spawnEnemy(kind)) toSpawn.pop();
        spawnTimer = Math.max(0.18, 0.75 - wave * 0.06);
      }
    } else if (enemies.length === 0) {
      waveBreak -= dt;
      if (waveBreak <= 0) {
        startWave();
        waveBreak = 1.5;
      }
    }
  }
  updateKai(dt, time);
  updateEnemies(dt, time);
  updateBolts(dt);
  updateSparks(dt);
  updateCamera(dt);
  muzzleFlash -= dt;
  flashLight.intensity = muzzleFlash > 0 ? 6 : 0;
  if (muzzleFlash > 0) gun.localToWorld(flashLight.position.set(0, 0, GUN_LEN + 0.1));
  floorMat.uniforms.uTime.value = time;
  if (bannerLeft !== Infinity) {
    bannerLeft -= raw;
    if (bannerLeft <= 0) bannerEl.classList.remove('on');
  }
  renderer.render(scene, camera);

  fpsAcc += raw;
  fpsFrames++;
  statsLeft -= raw;
  if (statsLeft <= 0) {
    fps = Math.round(fpsFrames / Math.max(fpsAcc, 1e-3));
    fpsAcc = 0;
    fpsFrames = 0;
    statsLeft = 0.5;
    const h = Math.min(MAX_HEARTS, Math.max(0, kai.hearts));
    heartsEl.textContent = '♥'.repeat(h) + '♡'.repeat(MAX_HEARTS - h);
    waveEl.textContent = wave > 0 ? `Vague ${wave}` : '';
    scoreEl.textContent = `${score}`;
    const info = renderer.info.render;
    statsEl.textContent = `${fps} i/s · ${info.calls} appels · ${Math.round(info.triangles / 1000)} k triangles (Kaï ${Math.round(triangles / 1000)} k) · ${enemies.length} ennemis`;
  }
}

// Aide de test (serveur de dev).
(window as unknown as { __xrArena: unknown }).__xrArena = {
  info: () => ({
    loaded: !!model,
    wave,
    hearts: kai.hearts,
    dead: kai.dead,
    score,
    killed,
    enemies: enemies.length,
    shotsFired,
    fps,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    kaiTriangles: Math.round(triangles),
    animation: current?.getClip().name ?? null,
    pos: [kai.pos.x, kai.pos.z],
  }),
  /** Position de Kaï à l'écran (px CSS, milieu du corps). */
  screen: () => {
    const v = new THREE.Vector3(kai.pos.x, 0.7, kai.pos.z).project(camera);
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
  },
  autopilot: (on = true) => {
    autopilot = on;
  },
  god: (on = true) => {
    kai.hearts = on ? 999 : MAX_HEARTS;
  },
  timeScale: (s: number) => {
    timeScale = s;
  },
  spawn: (kind: KindId, n = 1) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (spawnEnemy(kind, (i / n) * Math.PI * 2)) k++;
    return k;
  },
};

loadKai()
  .catch((err) => {
    console.error(err);
    banner('Impossible de lire art/kai.glb<small>Exporte-le depuis Blender (art/outils/export-kai.py)</small>', Infinity);
  })
  .finally(() => {
    clock.update();
    requestAnimationFrame(frame);
  });
