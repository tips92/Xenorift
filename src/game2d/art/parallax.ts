import type Phaser from 'phaser';
import type { ThemeId } from '../../core/types';
import { DEPTH, VIEW_H } from '../constants';
import { BG, WHALE, bgKey, ensureBackgroundTextures } from './draw/backgrounds';
import type { ParallaxHandle } from './index';

// Arrière-plan à défilement parallaxe : ciel, astres, créatures géantes, silhouettes.
// Chaque couche est une bande d'images répétées (même rendu qu'une TileSprite, sans copie
// de texture en puissance de 2), placée en espace écran (scrollFactor 0).

type Img = Phaser.GameObjects.Image;

const TAU = Math.PI * 2;

interface Strip {
  key: string;
  texW: number;
  texH: number;
  scale: number;
  factor: number;
  /** Part du décalage vertical de caméra appliquée à la couche. */
  vf: number;
  depth: number;
  baseY: number;
  images: Img[];
  visible: number;
}

interface Body {
  img: Img;
  fx: number;
  y: number;
  factor: number;
  halfW: number;
}

function posMod(a: number, m: number): number {
  const r = a % m;
  return r < 0 ? r + m : r;
}

export function createParallaxImpl(scene: Phaser.Scene, theme: ThemeId): ParallaxHandle {
  ensureBackgroundTextures(scene, theme);
  const cam = scene.cameras.main;
  const fxKey = bgKey(theme, 'fx');
  const objects: Phaser.GameObjects.GameObject[] = [];
  let viewW = cam.width || 1280;
  let viewH = cam.height || VIEW_H;
  let destroyed = false;
  let boundsRect: Phaser.Geom.Rectangle | null = null;
  let lastCamX = cam.scrollX;

  const img = (x: number, y: number, key: string, frame: string | undefined, depth: number): Img => {
    const im = scene.add.image(x, y, key, frame);
    im.setScrollFactor(0);
    im.setDepth(depth);
    objects.push(im);
    return im;
  };

  // ------------------------------------------------------------ Bandes répétées
  const strips: Strip[] = [];
  const makeStrip = (name: string, texW: number, texH: number, scale: number, factor: number, vf: number, depth: number): Strip => {
    const s: Strip = { key: bgKey(theme, name), texW, texH, scale, factor, vf, depth, baseY: 0, images: [], visible: 0 };
    strips.push(s);
    return s;
  };
  const sky = makeStrip('sky', BG.skyW * BG.skyRes, BG.skyH * BG.skyRes, VIEW_H / BG.skyH / BG.skyRes, 0.02, 0.01, DEPTH.parallaxFar);
  const stars = makeStrip('stars', BG.starsW, BG.starsH, 1, 0.03, 0.02, DEPTH.parallaxFar + 1);
  const far = makeStrip('far', BG.farW * BG.farRes, BG.farH * BG.farRes, 1 / BG.farRes, 0.15, 0.15, DEPTH.parallaxFar + 20);
  const mid = makeStrip('mid', BG.midW, BG.midH, 1, 0.35, 0.35, DEPTH.parallaxFar + 50);
  const near = makeStrip('near', BG.nearW, BG.nearH, 1, 0.6, 0.6, DEPTH.parallaxNear);

  const layoutStrips = () => {
    sky.scale = viewH / BG.skyH / BG.skyRes;
    sky.baseY = 0;
    stars.baseY = 0;
    far.baseY = viewH - BG.farH;
    mid.baseY = viewH - BG.midH;
    near.baseY = viewH - BG.nearH;
    for (const s of strips) {
      const span = s.texW * s.scale;
      const need = Math.ceil(viewW / span) + 1;
      while (s.images.length < need) {
        const im = img(0, 0, s.key, undefined, s.depth);
        im.setOrigin(0, 0);
        s.images.push(im);
      }
      for (let i = 0; i < s.images.length; i++) {
        s.images[i].setScale(s.scale);
        s.images[i].setVisible(i < need);
      }
      s.visible = need;
    }
  };

  // ------------------------------------------------------------ Étoiles scintillantes
  const TW = 28;
  const twinkles: Img[] = [];
  const twX = new Float32Array(TW);
  const twY = new Float32Array(TW);
  const twSpeed = new Float32Array(TW);
  const twPhase = new Float32Array(TW);
  const twScale = new Float32Array(TW);
  const twTints = theme === 'jungle' ? [0xffffff, 0xbff8ff, 0xffc8f4] : [0xffffff, 0xffe6c0, 0xd8c8ff];
  for (let i = 0; i < TW; i++) {
    twX[i] = Math.random() * 2048;
    twY[i] = 10 + Math.pow(Math.random(), 1.4) * 400;
    twSpeed[i] = 0.8 + Math.random() * 2.4;
    twPhase[i] = Math.random() * TAU;
    twScale[i] = 0.45 + Math.random() * 0.7;
    const t = img(0, 0, fxKey, 'twinkle', DEPTH.parallaxFar + 2);
    t.setTint(twTints[i % twTints.length]);
    t.setBlendMode(1); // ADD
    twinkles.push(t);
  }

  // ------------------------------------------------------------ Astres
  const bodies: Body[] = [];
  const addBody = (frame: string, fx: number, y: number, factor: number, halfW: number) => {
    const b = img(0, y, bgKey(theme, 'bodies'), frame, DEPTH.parallaxFar + 4);
    bodies.push({ img: b, fx, y, factor, halfW });
  };
  if (theme === 'jungle') {
    addBody('moonA', 0.74, 170, 0.03, 140);
    addBody('moonB', 0.3, 105, 0.036, 55);
  } else {
    addBody('ringed', 0.62, 215, 0.025, 320);
    addBody('sun', 0.13, 92, 0.03, 80);
  }

  // ------------------------------------------------------------ Jungle : méduse-baleine + nuées
  const WHALE_F = 0.06;
  const TENT_SEG = 18;
  const WHALE_SCALE = 0.82;
  let whale: Img | null = null;
  const tentacles: Img[] = [];
  let whaleX = viewW * 0.7;
  let whaleY = 190;
  const FLOCKS = 3;
  const BIRDS = 7;
  const birds: Img[] = [];
  const flX = new Float32Array(FLOCKS);
  const flY = new Float32Array(FLOCKS);
  const flV = new Float32Array(FLOCKS);
  const flDir = new Float32Array(FLOCKS);
  const flScale = new Float32Array(FLOCKS);
  const bdX = new Float32Array(FLOCKS * BIRDS);
  const bdY = new Float32Array(FLOCKS * BIRDS);
  const bdPh = new Float32Array(FLOCKS * BIRDS);
  const FLOCK_F = 0.25;

  const spawnFlock = (f: number, initial: boolean) => {
    const dir = Math.random() < 0.5 ? 1 : -1;
    flDir[f] = dir;
    flV[f] = 40 + Math.random() * 45;
    flY[f] = 90 + Math.random() * 230;
    flScale[f] = 0.65 + Math.random() * 0.55;
    const sx = initial ? Math.random() * viewW : dir > 0 ? -160 - Math.random() * 300 : viewW + 160 + Math.random() * 300;
    flX[f] = sx + cam.scrollX * FLOCK_F;
  };

  if (theme === 'jungle') {
    for (let k = 0; k < WHALE.tentacles.length; k++) {
      for (let j = 0; j < TENT_SEG; j++) {
        const t = img(0, 0, fxKey, 'tent', DEPTH.parallaxFar + 8);
        t.setBlendMode(1);
        tentacles.push(t);
      }
    }
    whale = img(0, 0, fxKey, 'whale', DEPTH.parallaxFar + 9);
    whale.setAlpha(0.88);
    for (let f = 0; f < FLOCKS; f++) {
      spawnFlock(f, true);
      for (let b = 0; b < BIRDS; b++) {
        const i = f * BIRDS + b;
        // Formation en V
        const rank = Math.ceil(b / 2);
        const side = b % 2 === 0 ? 1 : -1;
        bdX[i] = -rank * 22;
        bdY[i] = rank * 10 * side + (Math.random() - 0.5) * 6;
        bdPh[i] = Math.random() * TAU;
        birds.push(img(0, 0, fxKey, 'flyer0', DEPTH.parallaxFar + 30));
      }
    }
  }

  // ------------------------------------------------------------ Lune : ver des sables + comètes
  const WORM_SEG = 20;
  const WORM_F = 0.12;
  const WORM_R = 190;
  const WORM_RV = 290;
  const WORM_DS = 0.118;
  const WORM_SPEED = 0.95;
  const wormSegs: Img[] = [];
  let wormHead: Img | null = null;
  let wormActive = false;
  let wormTimer = 2.5;
  let wormS = 0;
  let wormAnchor = 0;
  let wormDir = 1;
  const DUST = 18;
  const dust: Img[] = [];
  const duX = new Float32Array(DUST);
  const duY = new Float32Array(DUST);
  const duVX = new Float32Array(DUST);
  const duVY = new Float32Array(DUST);
  const duLife = new Float32Array(DUST);
  const COMETS = 2;
  const comets: Img[] = [];
  const coX = new Float32Array(COMETS);
  const coY = new Float32Array(COMETS);
  const coVX = new Float32Array(COMETS);
  const coVY = new Float32Array(COMETS);
  const coLife = new Float32Array(COMETS);
  const coMax = new Float32Array(COMETS);
  let cometTimer = 3;

  if (theme === 'moon') {
    for (let i = 0; i < WORM_SEG; i++) wormSegs.push(null as unknown as Img);
    // Créés de la queue vers la tête : la tête et les premiers anneaux passent devant
    for (let i = WORM_SEG - 1; i >= 0; i--) wormSegs[i] = img(0, 0, fxKey, 'wormSeg', DEPTH.parallaxFar + 14).setTint(0xcfc6ec);
    // Teinte de lointain (perspective atmosphérique)
    wormHead = img(0, 0, fxKey, 'wormHead', DEPTH.parallaxFar + 14).setTint(0xcfc6ec);
    for (let i = 0; i < DUST; i++) {
      const d = img(0, 0, fxKey, 'dust', DEPTH.parallaxFar + 15);
      d.setTint(0xb9a8dc);
      d.setVisible(false);
      dust.push(d);
    }
    for (let i = 0; i < COMETS; i++) {
      const c = img(0, 0, fxKey, 'comet', DEPTH.parallaxFar + 5);
      c.setOrigin(0.95, 0.5);
      c.setBlendMode(1);
      c.setVisible(false);
      comets.push(c);
    }
  }

  const wormGroundY = () => viewH - 120;

  const dustBurst = (x: number, y: number, n: number) => {
    let spawned = 0;
    for (let i = 0; i < DUST && spawned < n; i++) {
      if (duLife[i] > 0) continue;
      duX[i] = x + (Math.random() - 0.5) * 40;
      duY[i] = y - Math.random() * 10;
      duVX[i] = (Math.random() - 0.5) * 110;
      duVY[i] = -30 - Math.random() * 80;
      duLife[i] = 1.2 + Math.random() * 0.6;
      dust[i].setVisible(true);
      spawned++;
    }
  };

  const placeWormPart = (im: Img, s: number, cx: number, gy: number, scale: number) => {
    if (s < -0.02 || s > Math.PI + 0.02) {
      im.setVisible(false);
      return;
    }
    const c = Math.cos(s);
    const sn = Math.sin(s);
    im.setVisible(true);
    im.setPosition(cx - wormDir * WORM_R * c, gy - WORM_RV * sn);
    im.setRotation(Math.atan2(-WORM_RV * c, wormDir * WORM_R * sn));
    im.setFlipY(wormDir < 0);
    im.setScale(scale);
  };

  // ------------------------------------------------------------ Mise à jour
  const update = (time: number, delta: number) => {
    if (destroyed) return;
    const t = time / 1000;
    const dt = Math.min(delta, 100) / 1000;
    const camX = cam.scrollX;
    let dy = 0;
    if (cam.useBounds) {
      boundsRect = boundsRect ? cam.getBounds(boundsRect) : cam.getBounds();
      const maxY = boundsRect.y + boundsRect.height - cam.height;
      dy = Math.max(0, Math.min(400, maxY - cam.scrollY));
    }

    for (let k = 0; k < strips.length; k++) {
      const s = strips[k];
      const span = s.texW * s.scale;
      const off = posMod(camX * s.factor, span);
      const y = s.baseY + dy * s.vf;
      for (let i = 0; i < s.visible; i++) s.images[i].setPosition(i * span - off, y);
    }

    for (let i = 0; i < TW; i++) {
      const tw = twinkles[i];
      const x = posMod(twX[i] - camX * 0.03, 2048) - 20;
      const s = 0.5 + 0.5 * Math.sin(t * twSpeed[i] + twPhase[i]);
      const s4 = s * s * s * s;
      tw.setPosition(x, twY[i] + dy * 0.02);
      tw.setAlpha(0.12 + 0.88 * s4);
      tw.setScale(twScale[i] * (0.45 + 0.75 * s4));
      tw.setRotation(s * 0.4);
    }

    for (let k = 0; k < bodies.length; k++) {
      const b = bodies[k];
      const lo = -b.halfW - 40;
      const hi = viewW + b.halfW + 40;
      const x = lo + posMod(b.fx * viewW - camX * b.factor - lo, hi - lo);
      b.img.setPosition(x, b.y + dy * 0.03);
    }

    if (whale) {
      whaleX -= 15 * dt;
      let sx = whaleX - camX * WHALE_F;
      if (sx < -WHALE.w * 0.65 - 60) {
        whaleX += viewW + WHALE.w * 1.3 + 120 + Math.random() * 400;
        whaleY = 160 + Math.random() * 80;
        sx = whaleX - camX * WHALE_F;
      } else if (sx > viewW + WHALE.w * 1.5 + 600) {
        whaleX -= viewW + WHALE.w * 1.3 + 120;
        sx = whaleX - camX * WHALE_F;
      }
      const sy = whaleY + Math.sin(t * 0.42) * 12 + dy * 0.05;
      const rot = Math.sin(t * 0.33) * 0.035;
      whale.setPosition(sx, sy);
      whale.setRotation(rot);
      const ws = WHALE_SCALE;
      whale.setScale(ws * (1 + Math.sin(t * 1.1) * 0.012), ws * (1 + Math.sin(t * 1.1 + 1) * 0.025));
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      let n = 0;
      for (let k = 0; k < WHALE.tentacles.length; k++) {
        const lx = (WHALE.tentacles[k] - WHALE.w / 2) * ws;
        const ly = (WHALE.tentY - WHALE.h / 2) * ws;
        const ax = sx + lx * cr - ly * sr;
        const ay = sy + lx * sr + ly * cr;
        const len = (0.85 + ((k * 37) % 5) * 0.08) * ws;
        for (let j = 0; j < TENT_SEG; j++) {
          const ph = t * 1.25 + k * 0.85 - j * 0.3;
          const tm = tentacles[n++];
          tm.setPosition(ax + (Math.sin(ph) * (1.5 + j * 1.1) + j * j * 0.1) * ws, ay + j * 9 * len + Math.sin(ph * 0.7) * 1.5);
          tm.setScale((1.1 - j * 0.045) * ws);
          tm.setAlpha(0.8 - j * 0.035);
        }
      }
    }

    if (birds.length > 0) {
      for (let f = 0; f < FLOCKS; f++) {
        flX[f] += flV[f] * flDir[f] * dt;
        const sx = flX[f] - camX * FLOCK_F;
        if (sx > viewW + 260 || sx < -260 - 0) {
          // Sortie de l'écran dans le sens du vol (ou dépassée par la caméra) : nouvelle nuée
          if ((flDir[f] > 0 && sx > viewW + 260) || (flDir[f] < 0 && sx < -260) || sx < -900 || sx > viewW + 900) {
            spawnFlock(f, false);
          }
        }
        const fx = flX[f] - camX * FLOCK_F;
        const fy = flY[f] + Math.sin(t * 0.5 + f * 2) * 16 + dy * 0.2;
        const sc = flScale[f];
        for (let b = 0; b < BIRDS; b++) {
          const i = f * BIRDS + b;
          const bi = birds[i];
          bi.setPosition(fx + bdX[i] * sc * flDir[f] + Math.sin(t * 2.1 + bdPh[i]) * 3, fy + bdY[i] * sc + Math.sin(t * 1.7 + bdPh[i]) * 4);
          const fr = ((t * 9 + bdPh[i]) | 0) % 2 === 0 ? 'flyer0' : 'flyer1';
          if (bi.frame.name !== fr) bi.setFrame(fr);
          bi.setScale(sc);
        }
      }
    }

    if (wormHead) {
      const gy = wormGroundY() + dy * WORM_F;
      if (!wormActive) {
        wormTimer -= dt;
        if (wormTimer <= 0) {
          wormActive = true;
          wormS = -0.12;
          wormDir = Math.random() < 0.5 ? 1 : -1;
          wormAnchor = (0.28 + Math.random() * 0.44) * viewW + camX * WORM_F;
        }
        wormHead.setVisible(false);
        for (let i = 0; i < WORM_SEG; i++) wormSegs[i].setVisible(false);
      } else {
        const prev = wormS;
        wormS += WORM_SPEED * dt;
        const cx = wormAnchor - camX * WORM_F;
        if (prev < 0 && wormS >= 0) dustBurst(cx - wormDir * WORM_R, gy, 7);
        if (prev < Math.PI && wormS >= Math.PI) dustBurst(cx + wormDir * WORM_R, gy, 7);
        placeWormPart(wormHead, wormS, cx, gy, 1);
        for (let i = 0; i < WORM_SEG; i++) {
          placeWormPart(wormSegs[i], wormS - (i + 1) * WORM_DS, cx, gy, 1.12 - i * 0.03);
        }
        const tailS = wormS - WORM_SEG * WORM_DS;
        if (tailS - WORM_SPEED * dt < Math.PI && tailS >= Math.PI) dustBurst(cx + wormDir * WORM_R, gy, 4);
        if (tailS > Math.PI + 0.1) {
          wormActive = false;
          wormTimer = 4 + Math.random() * 6;
        }
      }
      const shift = (camX - lastCamX) * WORM_F;
      for (let i = 0; i < DUST; i++) {
        if (duLife[i] <= 0) continue;
        duLife[i] -= dt;
        const d = dust[i];
        if (duLife[i] <= 0) {
          d.setVisible(false);
          continue;
        }
        duVY[i] += 25 * dt;
        duX[i] += duVX[i] * dt - shift;
        duY[i] += duVY[i] * dt;
        const life = duLife[i];
        d.setPosition(duX[i], duY[i]);
        d.setAlpha(Math.min(1, life) * 0.75);
        d.setScale(0.7 + (1.8 - life) * 1.2);
      }
      // Comètes
      cometTimer -= dt;
      if (cometTimer <= 0) {
        cometTimer = 5 + Math.random() * 8;
        for (let i = 0; i < COMETS; i++) {
          if (coLife[i] > 0) continue;
          const a = Math.PI - (0.12 + Math.random() * 0.38);
          const sp = 260 + Math.random() * 220;
          coX[i] = viewW * (0.35 + Math.random() * 0.75);
          coY[i] = 20 + Math.random() * 170;
          coVX[i] = Math.cos(a) * sp;
          coVY[i] = Math.sin(a) * sp;
          coMax[i] = coLife[i] = 2.2 + Math.random() * 1.2;
          comets[i].setRotation(a);
          comets[i].setScale(0.55 + Math.random() * 0.5);
          comets[i].setVisible(true);
          break;
        }
      }
      for (let i = 0; i < COMETS; i++) {
        if (coLife[i] <= 0) continue;
        coLife[i] -= dt;
        const c = comets[i];
        if (coLife[i] <= 0) {
          c.setVisible(false);
          continue;
        }
        coX[i] += coVX[i] * dt;
        coY[i] += coVY[i] * dt;
        const age = coMax[i] - coLife[i];
        c.setPosition(coX[i], coY[i]);
        c.setAlpha(Math.min(1, age / 0.35, coLife[i] / 0.7));
      }
    }
    lastCamX = camX;
  };

  const resize = (width: number, height: number) => {
    if (destroyed) return;
    viewW = Math.max(1, width);
    viewH = Math.max(1, height);
    layoutStrips();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const o of objects) o.destroy();
    objects.length = 0;
  };

  layoutStrips();
  update(scene.time ? scene.time.now : 0, 16);

  return { update, resize, destroy };
}
