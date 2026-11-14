import * as THREE from 'three';
import { t, tf } from '../core/i18n/locale';
import { UI } from '../core/i18n/ui';
import type { RiftDef } from '../core/rifts';
import type { AudioApi, HudApi, InputApi, ModeHandle, PlayLoadout, Settings, WeaponId } from '../core/types';
import { DEFAULT_WEAPON_MODS, OVERHEAT_RECOVER_AT, WEAPONS, isWeaponId, resolveWeapon } from '../core/weapons';
import type { WeaponStats } from '../core/weapons';
import { START_LIVES } from '../game2d/constants';
import { ARM_RIG, FRAME_SIZE, FRAMES } from '../game2d/art/keys';
import { drawArmFrame, drawPlayerFrame, frameShoulderX, frameShoulderY } from '../game2d/art/draw/player';
import type { Ctx } from '../game2d/art/util';
import { acquireRenderer, discardRenderer, pixelRatio } from '../game3d/renderer';

// Arène 3D de survie (faille du Vide). Chargée par import() : Three ne pèse pas sur l'accueil.
// Un seul contexte : l'interface a déjà lâché Phaser. destroy() jette le renderer (forceContextLoss)
// avant le retour au 2D. Pas d'allocation dans la boucle (objets et matrices réutilisés).

export interface RiftHooks {
  hud: HudApi;
  input: InputApi;
  audio: AudioApi;
  settings: Readonly<Settings>;
  loadout: Readonly<PlayLoadout>;
  onClear(): void;
  onDown(): void;
}

const ARENA_R = 13.5;
const KAI_R = 0.42;
const MAX_FOES = 16;
const PER_KIND = 12;
const MAX_BOLTS = 40;
/** Trois vagues fixes (pas de tirage : un essai se rejoue pareil). */
const WAVES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 2, 2],
];
const KIND_HP = [2, 1, 6];
const KIND_SPEED = [2.5, 4.3, 1.45];
const KIND_R = [0.46, 0.32, 0.7];
const KIND_COLOR = [0x3dffd2, 0xff4fd8, 0xc8fdff];

interface Foe {
  alive: boolean;
  kind: number;
  slot: number;
  x: number;
  z: number;
  hp: number;
  flash: number;
  rise: number;
}

interface Bolt {
  life: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  dmg: number;
}

const DEV = import.meta.env.DEV;

export function startRift(container: HTMLElement, rift: RiftDef, hooks: RiftHooks): ModeHandle {
  const weaponId: WeaponId = isWeaponId(hooks.loadout.equipped) ? hooks.loadout.equipped : 'laser';
  const mods = hooks.loadout.mods[weaponId] ?? DEFAULT_WEAPON_MODS;
  const stats: WeaponStats = {
    id: weaponId,
    rangeTiles: 0,
    pellets: 1,
    spreadRad: 0,
    burst: 1,
    burstGapMs: 0,
    cooldownMs: 0,
    damage: 1,
    heatPerShot: 0,
    coolRate: 0,
    coolDelayMs: 0,
    speed: 0,
    sfx: 'laser',
    color: 0xffffff,
  };
  resolveWeapon(WEAPONS[weaponId], mods, false, stats);
  const heartsMax = hooks.loadout.maxHearts >= 3 ? hooks.loadout.maxHearts : 3;
  const boltSpeed = stats.speed / 64;
  const boltRange = stats.rangeTiles;

  const renderer = acquireRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070214);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 80);
  const camTarget = new THREE.Vector3();

  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: ARENA_R } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uR; varying vec2 vP;
      void main() {
        float d = length(vP) / uR;
        vec3 soil = mix(vec3(0.07, 0.03, 0.16), vec3(0.03, 0.01, 0.07), d);
        float crack = smoothstep(0.03, 0.0, abs(fract(sin(vP.x * 1.7 + vP.y * 0.4) * 7.0) - 0.5) - 0.42);
        soil = mix(soil, vec3(0.28, 0.30, 0.36), crack * 0.55);
        float ring = smoothstep(0.025, 0.0, abs(d - 0.55)) + smoothstep(0.02, 0.0, abs(d - 0.82));
        vec3 col = soil + vec3(0.15, 0.85, 0.72) * ring * 0.45;
        col += vec3(1.0, 0.25, 0.75) * smoothstep(0.04, 0.0, abs(d - 0.28)) * 0.25;
        col += vec3(0.25, 1.0, 0.85) * smoothstep(0.9, 1.0, d);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R - 0.18, ARENA_R, 48),
    new THREE.MeshBasicMaterial({ color: 0x3dffd2 }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  scene.add(rim);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R, ARENA_R, 3.4, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x140828, side: THREE.BackSide }),
  );
  wall.position.y = 1.5;
  scene.add(wall);

  const bombMat = new THREE.MeshBasicMaterial({ color: 0x8a90a8 });
  const bomb = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 24), bombMat);
  bomb.rotation.x = Math.PI / 2;
  bomb.position.y = 0.2;
  scene.add(bomb);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x2a1848 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), coreMat);
  core.position.y = 0.35;
  scene.add(core);

  const kindGeo = [
    new THREE.SphereGeometry(0.46, 8, 6),
    new THREE.ConeGeometry(0.28, 0.72, 6),
    new THREE.BoxGeometry(0.95, 0.62, 0.95),
  ];
  kindGeo[1].rotateX(Math.PI / 2);
  const foeMesh: THREE.InstancedMesh[] = [];
  const freeSlots: number[][] = [[], [], []];
  for (let k = 0; k < 3; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(kindGeo[k], mat, PER_KIND);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    foeMesh.push(mesh);
    for (let s = 0; s < PER_KIND; s++) {
      freeSlots[k].push(s);
      hideAt(mesh, s);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = PER_KIND;
  }

  const boltGeo = new THREE.BoxGeometry(0.12, 0.12, 0.42);
  const boltMat = new THREE.MeshBasicMaterial({ color: stats.color });
  const boltMesh = new THREE.InstancedMesh(boltGeo, boltMat, MAX_BOLTS);
  boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boltMesh.frustumCulled = false;
  scene.add(boltMesh);
  for (let i = 0; i < MAX_BOLTS; i++) hideAt(boltMesh, i);
  boltMesh.instanceMatrix.needsUpdate = true;

  const kai = buildKai(scene, weaponId);

  const foes: Foe[] = [];
  for (let i = 0; i < MAX_FOES; i++) {
    foes.push({ alive: false, kind: 0, slot: 0, x: 0, z: 0, hp: 0, flash: 0, rise: 0 });
  }
  const bolts: Bolt[] = [];
  for (let i = 0; i < MAX_BOLTS; i++) bolts.push({ life: 0, x: 0, z: 0, dx: 0, dz: 0, dmg: 0 });

  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();
  const bossHud = { name: 'Bombe', life: 0, phase: 1, phases: 3, steps: 3 };

  let alive = true;
  let paused = false;
  let sent = false;
  let raf = 0;
  let last = performance.now();
  let phase: 'fight' | 'boom' | 'down' | 'done' = 'fight';
  let kaiX = 0;
  let kaiZ = 3.2;
  let aimX = 0;
  let aimZ = -1;
  let hearts = heartsMax;
  let lives = START_LIVES;
  let invuln = 0.6;
  let heat = 0;
  let overheated = false;
  let heatWait = 0;
  let cool = 0;
  let recoilT = 0;
  let burstLeft = 0;
  let burstWait = 0;
  let burstAx = 0;
  let burstAz = -1;
  let wave = 0;
  let cursor = 0;
  let spawnIn = 0.7;
  let killedWave = 0;
  let spawnN = 0;
  let bombFill = 0;
  let boomT = 0;
  let downT = 0;
  let hudT = 0;
  let impactT = 0;
  let kaiMat = 0;

  function aliveCount(): number {
    let n = 0;
    for (const e of foes) if (e.alive) n++;
    return n;
  }

  function spawn(kind: number): void {
    const slot = freeSlots[kind].pop();
    if (slot === undefined) return;
    let foe: Foe | null = null;
    for (const e of foes) {
      if (!e.alive) {
        foe = e;
        break;
      }
    }
    if (!foe) {
      freeSlots[kind].push(slot);
      return;
    }
    const ang = spawnN * 2.399963;
    spawnN++;
    foe.alive = true;
    foe.kind = kind;
    foe.slot = slot;
    foe.x = Math.cos(ang) * (ARENA_R - 1.1);
    foe.z = Math.sin(ang) * (ARENA_R - 1.1);
    foe.hp = KIND_HP[kind];
    foe.flash = 0;
    foe.rise = 0;
  }

  function killFoe(e: Foe): void {
    e.alive = false;
    hideAt(foeMesh[e.kind], e.slot);
    freeSlots[e.kind].push(e.slot);
    killedWave++;
    try {
      hooks.audio.sfx('enemyDie', { volume: 0.7 });
    } catch {
      /* le son ne bloque pas le combat */
    }
  }

  function emit(dx: number, dz: number, dmg: number): void {
    let b: Bolt | null = null;
    let slot = -1;
    for (let i = 0; i < MAX_BOLTS; i++) {
      if (bolts[i].life <= 0) {
        b = bolts[i];
        slot = i;
        break;
      }
    }
    if (!b || slot < 0) return;
    const len = Math.hypot(dx, dz) || 1;
    b.life = boltRange;
    b.x = kaiX + (dx / len) * 0.45;
    b.z = kaiZ + (dz / len) * 0.45;
    b.dx = dx / len;
    b.dz = dz / len;
    b.dmg = dmg;
    void slot;
  }

  function hurt(): void {
    if (invuln > 0 || phase !== 'fight') return;
    hearts -= 1;
    invuln = 1.15;
    hudT = 1;
    try {
      hooks.audio.sfx('hurt');
      hooks.audio.haptic(28);
    } catch {
      /* ignore */
    }
    if (hearts > 0) return;
    lives -= 1;
    if (lives <= 0) {
      hearts = 0;
      phase = 'down';
      downT = 0.45;
      try {
        hooks.audio.sfx('death');
      } catch {
        /* ignore */
      }
      return;
    }
    hearts = heartsMax;
    kaiX = 0;
    kaiZ = 0;
    invuln = 1.25;
    try {
      hooks.hud.toast(t(UI.oneLifeLeft), 'bad');
    } catch {
      /* ignore */
    }
  }

  function pushHud(force: boolean): void {
    if (!force && hudT < 0.1) return;
    hudT = 0;
    bossHud.life = bombFill;
    bossHud.phase = wave + 1;
    try {
      hooks.hud.updatePlatform({
        hearts,
        maxHearts: heartsMax,
        lives,
        weapon: weaponId,
        heat: Math.round(heat * 50) / 50,
        overheated,
        crystals: 0,
        crystalsTotal: 0,
        speedLeft: 0,
        rapidLeft: 0,
        shield: false,
      });
      hooks.hud.updateBoss(bossHud);
    } catch {
      /* HUD protégé par l'interface, mais on n'arrête pas la boucle */
    }
  }

  function finish(kind: 'clear' | 'down'): void {
    if (sent) return;
    sent = true;
    phase = 'done';
    try {
      if (kind === 'clear') hooks.onClear();
      else hooks.onDown();
    } catch (err) {
      console.error('[rift] fin', err);
    }
  }

  function step(dt: number): void {
    const input = hooks.input.state;
    let mx = input.stickX;
    let mz = -input.stickY;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    if (phase === 'fight') {
      kaiX += mx * 5.4 * dt;
      kaiZ += mz * 5.4 * dt;
    }
    const kd = Math.hypot(kaiX, kaiZ);
    const lim = ARENA_R - 0.85;
    if (kd > lim) {
      kaiX = (kaiX / kd) * lim;
      kaiZ = (kaiZ / kd) * lim;
    }
    if (mx * mx + mz * mz > 0.04) {
      aimX = mx;
      aimZ = mz;
    }
    let best = (boltRange + 1.2) * (boltRange + 1.2);
    let found = false;
    for (const e of foes) {
      if (!e.alive || e.rise < 0.45) continue;
      const dx = e.x - kaiX;
      const dz = e.z - kaiZ;
      const dd = dx * dx + dz * dz;
      if (dd < best) {
        best = dd;
        aimX = dx;
        aimZ = dz;
        found = true;
      }
    }
    if (!found && aimX === 0 && aimZ === 0) aimZ = -1;
    const al = Math.hypot(aimX, aimZ) || 1;
    aimX /= al;
    aimZ /= al;

    if (cool > 0) cool -= dt;
    const firing = input.fire && phase === 'fight';
    if (firing && !overheated) heatWait = stats.coolDelayMs / 1000;
    else heatWait -= dt;
    if (overheated || heatWait <= 0) {
      if (heat > 0) heat = Math.max(0, heat - stats.coolRate * dt);
      if (overheated && heat <= OVERHEAT_RECOVER_AT) overheated = false;
    }
    if (burstLeft > 0 && phase === 'fight') {
      burstWait -= dt;
      if (burstWait <= 0) {
        emit(burstAx, burstAz, stats.damage);
        burstLeft--;
        burstWait = stats.burstGapMs / 1000;
        recoilT = 0.06;
      }
    } else if (firing && !overheated && cool <= 0 && phase === 'fight') {
      cool = stats.cooldownMs / 1000;
      heat += stats.heatPerShot;
      if (heat >= 1) {
        heat = 1;
        if (!overheated) {
          overheated = true;
          try {
            hooks.audio.sfx('overheat');
          } catch {
            /* ignore */
          }
        }
      }
      try {
        hooks.audio.sfx(stats.sfx);
      } catch {
        /* ignore */
      }
      recoilT = 0.07;
      if (stats.burst > 1) {
        burstLeft = stats.burst;
        burstAx = aimX;
        burstAz = aimZ;
        burstWait = 0;
      } else {
        const n = stats.pellets;
        const stepA = n <= 1 ? 0 : (stats.spreadRad * 2) / (n - 1);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * stepA;
          const cs = Math.cos(off);
          const sn = Math.sin(off);
          emit(aimX * cs - aimZ * sn, aimX * sn + aimZ * cs, stats.damage);
        }
      }
    }

    if (invuln > 0) invuln -= dt;
    if (impactT > 0) impactT -= dt;
    if (recoilT > 0) recoilT -= dt;

    for (const e of foes) {
      if (!e.alive) continue;
      e.rise = e.rise < 1 ? Math.min(1, e.rise + dt * 3.2) : 1;
      if (e.flash > 0) e.flash -= dt;
      if (phase === 'fight') {
        let dx = kaiX - e.x;
        let dz = kaiZ - e.z;
        const dist = Math.hypot(dx, dz) || 1;
        dx /= dist;
        dz /= dist;
        const sp = KIND_SPEED[e.kind];
        e.x += dx * sp * dt;
        e.z += dz * sp * dt;
        const ed = Math.hypot(e.x, e.z);
        const eLim = ARENA_R - 0.7;
        if (ed > eLim) {
          e.x = (e.x / ed) * eLim;
          e.z = (e.z / ed) * eLim;
        }
        if (e.rise > 0.65 && dist < KIND_R[e.kind] + KAI_R) hurt();
      }
      const sc = KIND_R[e.kind] <= 0.32 ? e.rise : e.rise;
      _p.set(e.x, 0.35 * e.rise + (e.kind === 2 ? 0.31 : 0.2), e.z);
      _s.set(sc, sc, sc);
      _q.identity();
      foeMesh[e.kind].setMatrixAt(e.slot, _m.compose(_p, _q, _s));
      if (e.flash > 0) _c.setRGB(1, 1, 1);
      else _c.setHex(KIND_COLOR[e.kind]);
      foeMesh[e.kind].setColorAt(e.slot, _c);
    }
    for (const mesh of foeMesh) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < MAX_BOLTS; i++) {
      const b = bolts[i];
      if (b.life > 0) {
        const stepD = boltSpeed * dt;
        b.x += b.dx * stepD;
        b.z += b.dz * stepD;
        b.life -= stepD;
        if (b.x * b.x + b.z * b.z > ARENA_R * ARENA_R) b.life = 0;
        for (const e of foes) {
          if (b.life <= 0 || !e.alive || e.rise < 0.5) continue;
          const dx = b.x - e.x;
          const dz = b.z - e.z;
          const rr = KIND_R[e.kind] + 0.2;
          if (dx * dx + dz * dz <= rr * rr) {
            b.life = 0;
            e.hp -= b.dmg;
            e.flash = 0.08;
            if (impactT <= 0) {
              impactT = 0.045;
              try {
                hooks.audio.sfx('laserHit', { volume: 0.55 });
              } catch {
                /* ignore */
              }
            }
            if (e.hp <= 0) killFoe(e);
          }
        }
      }
      if (b.life > 0) {
        _dir.set(b.dx, 0, b.dz);
        _q.setFromUnitVectors(_up.set(0, 0, 1), _dir);
        _p.set(b.x, 0.55, b.z);
        _s.set(1, 1, 1);
        boltMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      } else hideAt(boltMesh, i);
    }
    boltMesh.instanceMatrix.needsUpdate = true;

    if (phase === 'fight') {
      const plan = WAVES[wave];
      if (cursor < plan.length) {
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawn(plan[cursor]);
          cursor++;
          spawnIn = 0.72;
        }
      } else if (aliveCount() === 0) {
        if (wave < WAVES.length - 1) {
          wave++;
          cursor = 0;
          killedWave = 0;
          spawnIn = 1.05;
          try {
            hooks.hud.toast(tf(UI.wave, { n: wave + 1 }), 'info');
          } catch {
            /* ignore */
          }
        } else {
          phase = 'boom';
          boomT = 0.85;
          bombFill = 1;
          try {
            hooks.audio.sfx('liberation', { volume: 0.8 });
            hooks.audio.haptic([20, 40, 30]);
          } catch {
            /* ignore */
          }
        }
      }
      const planNow = WAVES[wave];
      const part = planNow.length > 0 ? Math.min(1, killedWave / planNow.length) : 0;
      if (phase === 'fight') bombFill = (wave + part) / WAVES.length;
    } else if (phase === 'boom') {
      bombFill = 1;
      boomT -= dt;
      if (boomT <= 0) finish('clear');
    } else if (phase === 'down') {
      downT -= dt;
      if (downT <= 0) finish('down');
    }

    const pulse = 1 + bombFill * 0.35;
    bomb.scale.set(pulse, pulse, pulse);
    bombMat.color.setRGB(0.45 + bombFill * 0.2, 0.5 + bombFill * 0.45, 0.55 + bombFill * 0.3);
    coreMat.color.setRGB(0.15 + bombFill * 0.5, 0.08 + bombFill * 0.85, 0.28 + bombFill * 0.55);
    core.position.y = 0.35 + bombFill * 0.25;

    kai.mesh.position.set(kaiX, 0.02, kaiZ);
    kai.mesh.rotation.y = Math.atan2(camera.position.x - kaiX, camera.position.z - kaiZ);
    const flip = aimX < -0.12 ? -1 : 1;
    kai.mesh.scale.set(flip * 1.2, 1.5, 1);
    const wantMat = recoilT > 0 ? 1 : 0;
    if (wantMat !== kaiMat) {
      kaiMat = wantMat;
      kai.mesh.material = wantMat ? kai.recoil : kai.rest;
    }

    camTarget.set(kaiX, 0.3, kaiZ);
    camera.position.set(kaiX, 9.2, kaiZ + 6.5);
    camera.lookAt(camTarget);
    hudT += dt;
    pushHud(false);
  }

  function frame(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (paused || document.hidden) return;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    step(dt);
    renderer.render(scene, camera);
  }

  function resize(): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const onLost = (): void => {
    if (!alive || sent || phase === 'done') return;
    phase = 'down';
    downT = 0.05;
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);

  resize();
  window.addEventListener('resize', resize);
  try {
    hooks.audio.music('boss');
    hooks.audio.musicLevel(0);
    hooks.hud.toast(tf(UI.wave, { n: 1 }), 'info');
  } catch {
    /* ignore */
  }
  pushHud(true);
  raf = requestAnimationFrame(frame);

  if (DEV) {
    const w = window as unknown as { __xrRift?: unknown };
    w.__xrRift = {
      info: () => ({
        phase,
        wave: wave + 1,
        waves: WAVES.length,
        hearts,
        lives,
        maxHearts: heartsMax,
        bomb: bombFill,
        weapon: weaponId,
        enemies: aliveCount(),
      }),
      win(): void {
        if (sent || phase === 'done' || phase === 'down') return;
        phase = 'boom';
        boomT = 0.05;
        bombFill = 1;
      },
      kill(): void {
        if (sent || phase === 'done') return;
        lives = 0;
        hearts = 0;
        phase = 'down';
        downT = 0.05;
      },
    };
  }

  return {
    pause(): void {
      paused = true;
    },
    resume(): void {
      paused = false;
      last = performance.now();
    },
    destroy(): void {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      if (DEV) {
        const w = window as unknown as { __xrRift?: unknown };
        delete w.__xrRift;
      }
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          for (const m of mat) disposeMat(m);
        } else if (mat) disposeMat(mat);
      });
      kai.rest.map?.dispose();
      kai.recoil.map?.dispose();
      discardRenderer(renderer);
    },
  };
}

function hideAt(mesh: THREE.InstancedMesh, slot: number): void {
  mesh.setMatrixAt(slot, HIDE);
}

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function disposeMat(mat: THREE.Material): void {
  const m = mat as THREE.MeshBasicMaterial;
  if (m.map && m.map !== kaiKeep) m.map.dispose();
  mat.dispose();
}

/** Textures de Kaï déjà libérées à part : ne pas les disposer deux fois. */
let kaiKeep: THREE.Texture | null = null;

function buildKai(
  scene: THREE.Scene,
  weapon: WeaponId,
): { mesh: THREE.Mesh; rest: THREE.MeshBasicMaterial; recoil: THREE.MeshBasicMaterial } {
  const restTex = new THREE.CanvasTexture(paintKai(weapon, false));
  const recoilTex = new THREE.CanvasTexture(paintKai(weapon, true));
  restTex.colorSpace = THREE.SRGBColorSpace;
  recoilTex.colorSpace = THREE.SRGBColorSpace;
  kaiKeep = restTex;
  const rest = new THREE.MeshBasicMaterial({ map: restTex, transparent: true, alphaTest: 0.12, side: THREE.DoubleSide });
  const recoil = new THREE.MeshBasicMaterial({
    map: recoilTex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), rest);
  mesh.position.y = 0.7;
  scene.add(mesh);
  return { mesh, rest, recoil };
}

function paintKai(weapon: WeaponId, recoil: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx as Ctx;
  const P = FRAME_SIZE.player;
  const idle = FRAMES.player.idle[0];
  g.translate(canvas.width / 2, canvas.height - 6);
  g.save();
  g.translate(-P.w / 2, -P.h);
  drawPlayerFrame(g, idle);
  g.restore();
  g.save();
  g.translate(frameShoulderX(idle) - ARM_RIG.pivotX, frameShoulderY(idle) - ARM_RIG.pivotY);
  drawArmFrame(g, weapon, recoil ? FRAMES.arm.recoil : FRAMES.arm.rest);
  g.restore();
  return canvas;
}
