import type Phaser from 'phaser';
import type { ThemeId } from '../../../core/types';
import { PALETTES, type ThemePalette } from '../palette';
import {
  type AtlasItem,
  type Ctx,
  buildAtlas,
  ellipse,
  glowDot,
  linGrad,
  makeCanvas,
  mix,
  poly,
  registerCanvas,
  rgba,
  rng,
  shade,
  softDot,
  sphereGrad,
  wrapX,
} from '../util';

// Textures de l'arrière-plan (préfixe 'bg-<thème>-'), générées une fois puis gardées en cache.

const TAU = Math.PI * 2;

/** Dimensions des couches (le ciel est dessiné en demi-résolution puis agrandi x2). */
export const BG = {
  skyW: 1024,
  skyH: 360,
  /** Le ciel (flou par nature) est rastérisé à demi-résolution de ses coordonnées de dessin. */
  skyRes: 0.5,
  /** La couche lointaine (brumeuse) aussi : contours adoucis = effet de profondeur. */
  farRes: 0.5,
  starsW: 1024,
  starsH: 520,
  farW: 2048,
  farH: 460,
  midW: 2048,
  midH: 380,
  nearW: 2048,
  nearH: 260,
} as const;

export function bgKey(theme: ThemeId, name: string): string {
  return `bg-${theme}-${name}`;
}

/** Points d'attache des tentacules sous la méduse-baleine (coordonnées dans la frame 'whale'). */
export const WHALE = { w: 460, h: 240, tentacles: [130, 170, 205, 240, 275, 310, 350], tentY: 168 } as const;

/** Somme de sinus périodique sur W (lignes de crête qui se raccordent). */
function wave(x: number, W: number, terms: [number, number, number][]): number {
  let y = 0;
  for (const [k, a, ph] of terms) y += Math.sin((x / W) * TAU * k + ph) * a;
  return y;
}

function galaxyY(x: number): number {
  return 150 + wave(x, BG.skyW, [[1, 48, 0.6], [2, 16, 1.9]]);
}

// ================================================================ Ciel

function drawSky(pal: ThemePalette, st: BgStyle): HTMLCanvasElement {
  const W = BG.skyW;
  const H = BG.skyH;
  const { canvas, ctx } = makeCanvas(W * BG.skyRes, H * BG.skyRes);
  ctx.scale(BG.skyRes, BG.skyRes);
  ctx.fillStyle = linGrad(ctx, 0, 0, 0, H, [
    [0, pal.skyTop],
    [0.45, pal.skyMid],
    [0.78, pal.skyLow],
    [1, pal.horizon],
  ]);
  ctx.fillRect(0, 0, W, H);
  const r = rng(st.skySeed);
  ctx.globalCompositeOperation = 'lighter';
  // Nébuleuses
  for (let i = 0; i < st.nebulae; i++) {
    const x = r() * W;
    const y = 40 + r() * 220;
    const rad = 60 + r() * 120;
    const col = i % 2 === 0 ? pal.nebulaA : pal.nebulaB;
    const a = st.nebulaAlpha + r() * 0.08;
    wrapX(W, x, rad, (px) => softDot(ctx, px, y, rad, col, a));
  }
  // Bande galactique
  for (let i = 0; i < 140; i++) {
    const x = r() * W;
    const y = galaxyY(x) + (r() - 0.5) * 50;
    const rad = 14 + r() * 38;
    const col = r() < 0.75 ? pal.galaxy : '#ffffff';
    const a = st.galaxyAlpha * (0.5 + r());
    wrapX(W, x, rad, (px) => softDot(ctx, px, y, rad, col, a));
  }
  ctx.globalCompositeOperation = 'source-over';
  // Bandes de poussière sombres au centre de la galaxie
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = galaxyY(x) + (r() - 0.5) * 14;
    const rad = 8 + r() * 18;
    wrapX(W, x, rad, (px) => softDot(ctx, px, y, rad, pal.skyTop, 0.22));
  }
  // Lueur d'horizon
  const hz = ctx.createLinearGradient(0, H * 0.6, 0, H);
  hz.addColorStop(0, rgba(pal.horizon, 0));
  hz.addColorStop(1, rgba(st.horizonGlow, 0.45));
  ctx.fillStyle = hz;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  return canvas;
}

function drawStars(st: BgStyle): HTMLCanvasElement {
  const W = BG.starsW;
  const H = BG.starsH;
  const { canvas, ctx } = makeCanvas(W, H);
  const r = rng(st.starSeed);
  const cols = ['#ffffff', '#ffffff', '#cfffff', '#ffd6f4', '#fff2c0', '#c8d8ff'];
  for (let i = 0; i < st.stars; i++) {
    const nearBand = i % 3 === 0;
    const x = r() * W;
    const y = nearBand ? galaxyY(x) * 2 + (r() - 0.5) * 120 : r() * H;
    if (y < 0 || y > H) continue;
    const fade = Math.pow(1 - y / H, 0.6);
    const big = r();
    const col = cols[Math.floor(r() * cols.length)];
    const a = (0.35 + r() * 0.65) * fade;
    if (big > 0.985) {
      wrapX(W, x, 8, (px) => {
        softDot(ctx, px, y, 7, col, a * 0.6);
        ctx.fillStyle = rgba('#ffffff', a);
        ctx.fillRect(px - 4, y - 0.5, 8, 1);
        ctx.fillRect(px - 0.5, y - 4, 1, 8);
      });
    } else if (big > 0.92) {
      wrapX(W, x, 4, (px) => {
        softDot(ctx, px, y, 3.5, col, a * 0.7);
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath();
        ctx.arc(px, y, 1.1, 0, TAU);
        ctx.fill();
      });
    } else {
      const sz = big > 0.6 ? 1.4 : 1;
      ctx.fillStyle = rgba(col, a * (sz > 1 ? 1 : 0.8));
      ctx.fillRect(x, y, sz, sz);
    }
  }
  return canvas;
}

// ================================================================ Silhouettes : jungle

function mushroomTree(
  ctx: Ctx,
  x: number,
  baseY: number,
  capY: number,
  capW: number,
  capH: number,
  stalkW: number,
  lean: number,
  body: CanvasGradient | string,
  rim: string,
  glowA: string,
  glowB: string,
  intensity: number,
  r: () => number,
): void {
  const cx = x + lean;
  // Pied
  const st = new Path2D();
  st.moveTo(x - stalkW * 1.1, baseY);
  st.bezierCurveTo(x - stalkW * 0.4, baseY - 30, cx - stalkW * 0.6, capY + capH * 1.8, cx - stalkW * 0.32, capY + capH * 0.5);
  st.lineTo(cx + stalkW * 0.32, capY + capH * 0.5);
  st.bezierCurveTo(cx + stalkW * 0.6, capY + capH * 1.8, x + stalkW * 0.4, baseY - 30, x + stalkW * 1.1, baseY);
  st.closePath();
  ctx.fillStyle = body;
  ctx.fill(st);
  // Lueur des lamelles sous le chapeau
  softDot(ctx, cx, capY + capH * 0.95, capW * 0.42, glowA, 0.28 * intensity);
  // Filaments pendants
  const nT = 3 + Math.floor(r() * 3);
  for (let k = 0; k < nT; k++) {
    const tx = cx + (r() - 0.5) * capW * 0.85;
    const len = 20 + r() * 60;
    ctx.strokeStyle = typeof body === 'string' ? body : rim;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, capY + capH * 0.9);
    ctx.quadraticCurveTo(tx + 4, capY + capH + len * 0.5, tx - 2, capY + capH + len);
    ctx.stroke();
    ctx.globalAlpha = 1;
    softDot(ctx, tx - 2, capY + capH + len, 4, k % 2 ? glowA : glowB, 0.7 * intensity);
  }
  // Chapeau
  const cap = new Path2D();
  const l = cx - capW / 2;
  const rgt = cx + capW / 2;
  cap.moveTo(l, capY + capH);
  cap.bezierCurveTo(l - capW * 0.02, capY + capH * 0.2, cx - capW * 0.3, capY, cx, capY);
  cap.bezierCurveTo(cx + capW * 0.3, capY, rgt + capW * 0.02, capY + capH * 0.2, rgt, capY + capH);
  const sc = 6;
  for (let k = sc; k >= 0; k--) {
    const px = l + (capW * k) / sc;
    cap.quadraticCurveTo(px + capW / sc / 2, capY + capH * 0.82, px, capY + capH);
  }
  cap.closePath();
  ctx.fillStyle = body;
  ctx.fill(cap);
  // Liseré de lumière (bord supérieur)
  ctx.save();
  ctx.clip(cap);
  ctx.translate(2, 3);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.stroke(cap);
  ctx.restore();
  // Lamelles lumineuses
  ctx.strokeStyle = rgba(glowA, 0.45 * intensity);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(l + capW * 0.08, capY + capH * 0.95);
  ctx.quadraticCurveTo(cx, capY + capH * 1.12, rgt - capW * 0.08, capY + capH * 0.95);
  ctx.stroke();
  // Taches lumineuses
  const nS = 5 + Math.floor(r() * 6);
  for (let k = 0; k < nS; k++) {
    const a = Math.PI + 0.25 + r() * (Math.PI - 0.5);
    const rr = 0.35 + r() * 0.55;
    const sx = cx + Math.cos(a) * capW * 0.5 * rr;
    const sy = capY + capH * 0.95 + Math.sin(a) * capH * 0.85 * rr;
    const sz = 1.5 + r() * 3.5;
    softDot(ctx, sx, sy, sz * 2.6, k % 3 === 0 ? glowA : glowB, 0.55 * intensity);
    ctx.fillStyle = rgba('#ffffff', 0.55 * intensity);
    ctx.beginPath();
    ctx.arc(sx, sy, sz * 0.4, 0, TAU);
    ctx.fill();
  }
}

function canopyMass(ctx: Ctx, W: number, H: number, y0: number, amp: number, rMin: number, rMax: number, fill: string, r: () => number): void {
  ctx.fillStyle = fill;
  for (let x = -20; x < W + 20; x += rMin * 0.9) {
    const rad = rMin + r() * (rMax - rMin);
    const y = y0 + r() * amp;
    wrapX(W, x, rad, (px) => {
      ctx.beginPath();
      ctx.arc(px, y, rad, 0, TAU);
      ctx.fill();
    });
  }
  ctx.fillRect(0, y0 + amp * 0.5, W, H);
}

function mistOverlay(ctx: Ctx, W: number, H: number, from: number, col: string, a: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, from, 0, H);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, a));
  ctx.fillStyle = g;
  ctx.fillRect(0, from, W, H - from);
  ctx.restore();
}

function jungleFar(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.farW;
  const H = BG.farH;
  const { canvas, ctx } = makeCanvas(W * BG.farRes, H * BG.farRes);
  ctx.scale(BG.farRes, BG.farRes);
  const r = rng(2001);
  const body = linGrad(ctx, 0, 0, 0, H, [[0, mix(pal.far, pal.farLight, 0.35)], [0.6, pal.far], [1, shade(pal.far, -0.15)]]);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.25 + r() * 0.5) * W) / n;
    const capY = 18 + r() * 120;
    const capW = 150 + r() * 150;
    const capH = capW * (0.28 + r() * 0.12);
    const stalkW = 14 + r() * 14;
    const lean = (r() - 0.5) * 50;
    const seed = r() * 1000;
    wrapX(W, x, capW / 2 + 60, (px) => {
      mushroomTree(ctx, px, H - 40, capY, capW, capH, stalkW, lean, body, rgba(pal.farLight, 0.9), pal.bioA, pal.bioB, 0.6, rng(seed));
    });
  }
  // Petits arbres intermédiaires
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const capY = 170 + r() * 90;
    const capW = 60 + r() * 60;
    const seed = r() * 1000;
    const sw = 7 + r() * 4;
    const lean = (r() - 0.5) * 20;
    wrapX(W, x, capW / 2 + 30, (px) => {
      mushroomTree(ctx, px, H - 40, capY, capW, capW * 0.32, sw, lean, body, rgba(pal.farLight, 0.7), pal.bioA, pal.bioB, 0.45, rng(seed));
    });
  }
  canopyMass(ctx, W, H, 330, 40, 30, 62, pal.far, r);
  // Points bioluminescents dans la canopée
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = 320 + r() * 120;
    softDot(ctx, x, y, 2 + r() * 3, r() < 0.5 ? pal.bioA : pal.bioB, 0.35);
  }
  mistOverlay(ctx, W, H, 180, pal.mist, 0.5);
  return canvas;
}

function fern(ctx: Ctx, x: number, y: number, len: number, ang: number, col: string, rim: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const side = ang < 0 ? -1 : 1;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * len * 0.15, -len * 0.7, side * len * 0.45, -len * 0.9);
  ctx.stroke();
  for (let k = 1; k < 14; k++) {
    const t = k / 14;
    const px = side * len * 0.15 * 2 * t * (1 - t) + side * len * 0.45 * t * t;
    const py = -len * 0.7 * 2 * t * (1 - t) - len * 0.9 * t * t;
    const lw = (1 - t) * len * 0.22 + 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(px + s * lw * 0.5, py + 2, lw * 0.55, 3, s * 0.6 + side * 0.3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * len * 0.15, -len * 0.7, side * len * 0.45, -len * 0.9);
  ctx.stroke();
  ctx.restore();
}

function jungleMid(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.midW;
  const H = BG.midH;
  const { canvas, ctx } = makeCanvas(W, H);
  const r = rng(3001);
  const body = linGrad(ctx, 0, 0, 0, H, [[0, mix(pal.mid, pal.midLight, 0.3)], [0.5, pal.mid], [1, shade(pal.mid, -0.2)]]);
  for (let i = 0; i < 5; i++) {
    const x = ((i + 0.2 + r() * 0.6) * W) / 5;
    const capY = 24 + r() * 110;
    const capW = 110 + r() * 110;
    const seed = r() * 1000;
    const lean = (r() - 0.5) * 40;
    const sw = 10 + r() * 8;
    wrapX(W, x, capW / 2 + 50, (px) => {
      mushroomTree(ctx, px, H - 30, capY, capW, capW * 0.33, sw, lean, body, rgba(pal.midLight, 0.95), pal.bioA, pal.bioB, 0.9, rng(seed));
    });
  }
  // Fougères géantes
  for (let i = 0; i < 16; i++) {
    const x = r() * W;
    const len = 70 + r() * 90;
    const a = (r() - 0.5) * 1.6;
    wrapX(W, x, len, (px) => fern(ctx, px, H - 70, len, a, pal.mid, rgba(pal.bioA, 0.35)));
  }
  canopyMass(ctx, W, H, 290, 30, 22, 48, pal.mid, r);
  // Plantes lumineuses
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = 270 + r() * 40;
    const h = 10 + r() * 26;
    const col = r() < 0.5 ? pal.bioA : pal.bioB;
    wrapX(W, x, 12, (px) => {
      ctx.strokeStyle = pal.mid;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, y + 20);
      ctx.quadraticCurveTo(px + 4, y, px + 1, y - h);
      ctx.stroke();
      glowDot(ctx, px + 1, y - h, 2.2, col);
    });
  }
  mistOverlay(ctx, W, H, 200, pal.mist, 0.28);
  return canvas;
}

function bigLeaf(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, fill: string, rim: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(-wid, -len * 0.3, -wid * 0.7, -len * 0.85, 0, -len);
  p.bezierCurveTo(wid * 0.7, -len * 0.85, wid, -len * 0.3, 0, 0);
  p.closePath();
  ctx.fillStyle = fill;
  ctx.fill(p);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  ctx.stroke(p);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -len * 0.92);
  ctx.stroke();
  ctx.restore();
}

function jungleNear(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.nearW;
  const H = BG.nearH;
  const { canvas, ctx } = makeCanvas(W, H);
  const r = rng(4001);
  const rim = rgba(pal.bioA, 0.28);
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const n = 3 + Math.floor(r() * 4);
    const baseY = 190 + r() * 40;
    const leaves: [number, number, number][] = [];
    for (let k = 0; k < n; k++) leaves.push([60 + r() * 110, 14 + r() * 18, (r() - 0.5) * 2]);
    wrapX(W, x, 180, (px) => {
      for (const [len, wid, a] of leaves) bigLeaf(ctx, px, baseY, len, wid, a, pal.near, rim);
    });
  }
  // Brins
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const h = 20 + r() * 50;
    const lean = (r() - 0.5) * 30;
    wrapX(W, x, 40, (px) => {
      ctx.fillStyle = pal.near;
      ctx.beginPath();
      ctx.moveTo(px - 3, 220);
      ctx.quadraticCurveTo(px + lean * 0.3, 220 - h * 0.6, px + lean, 220 - h);
      ctx.quadraticCurveTo(px + lean * 0.3 + 2, 220 - h * 0.6, px + 3, 220);
      ctx.fill();
    });
  }
  canopyMass(ctx, W, H, 200, 30, 26, 56, pal.near, r);
  // Fleurs lumineuses
  for (let i = 0; i < 18; i++) {
    const x = r() * W;
    const y = 170 + r() * 40;
    const col = r() < 0.6 ? pal.bioB : pal.bioA;
    wrapX(W, x, 10, (px) => glowDot(ctx, px, y, 2.4, col));
  }
  // Liseré lumineux sur le haut des buissons
  return canvas;
}

// ================================================================ Silhouettes : lune

function crystalSpire(ctx: Ctx, x: number, baseY: number, tipY: number, w: number, lean: number, light: string, dark: string, glowCol: string, intensity: number): void {
  const h = baseY - tipY;
  const p = poly([x - w / 2, baseY, x - w * 0.38 + lean * 0.3, baseY - h * 0.6, x + lean, tipY, x + w * 0.38 + lean * 0.3, baseY - h * 0.6, x + w / 2, baseY]);
  ctx.fillStyle = dark;
  ctx.fill(p);
  ctx.fillStyle = light;
  ctx.fill(poly([x - w / 2, baseY, x - w * 0.38 + lean * 0.3, baseY - h * 0.6, x + lean, tipY, x + lean * 0.5 - w * 0.05, baseY]));
  softDot(ctx, x + lean, tipY + 6, 12, glowCol, 0.55 * intensity);
  ctx.fillStyle = rgba('#ffffff', 0.5 * intensity);
  ctx.beginPath();
  ctx.arc(x + lean, tipY + 3, 1.5, 0, TAU);
  ctx.fill();
}

function ridgePath(W: number, H: number, f: (x: number) => number, step = 8): Path2D {
  const p = new Path2D();
  p.moveTo(0, H + 1);
  for (let x = 0; x <= W; x += step) p.lineTo(x, f(x));
  p.lineTo(W, H + 1);
  p.closePath();
  return p;
}

function moonFar(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.farW;
  const H = BG.farH;
  const { canvas, ctx } = makeCanvas(W * BG.farRes, H * BG.farRes);
  ctx.scale(BG.farRes, BG.farRes);
  const r = rng(5001);
  // Arêtes de cratères (dents de scie douces)
  const ridge = (x: number) =>
    225 + wave(x, W, [[2, 34, 0.4], [5, 20, 1.2], [9, 10, 2.1], [17, 5, 0.3]]) - Math.abs(wave(x, W, [[3, 30, 0.9], [7, 14, 2.6]]));
  // Flèches de cristal (derrière l'arête)
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const tip = 30 + r() * 140;
    const w = 14 + r() * 22;
    const lean = (r() - 0.5) * 30;
    wrapX(W, x, w + 20, (px) => crystalSpire(ctx, px, ridge(x) + 30, tip, w, lean, pal.farLight, pal.far, pal.vein, 0.8));
  }
  const rp = ridgePath(W, H, ridge);
  ctx.fillStyle = linGrad(ctx, 0, 160, 0, H, [[0, mix(pal.far, pal.farLight, 0.4)], [0.5, pal.far], [1, shade(pal.far, -0.2)]]);
  ctx.fill(rp);
  ctx.strokeStyle = rgba(pal.farLight, 0.85);
  ctx.lineWidth = 2;
  ctx.save();
  ctx.clip(rp);
  ctx.translate(0, 1.5);
  ctx.stroke(rp);
  ctx.restore();
  // Cratères sur l'arête
  for (let i = 0; i < 6; i++) {
    const x = r() * W;
    const y = ridge(x) + 30 + r() * 40;
    const rx = 30 + r() * 50;
    wrapX(W, x, rx, (px) => {
      ctx.fillStyle = rgba(shade(pal.far, -0.35), 0.7);
      ctx.beginPath();
      ctx.ellipse(px, y, rx, rx * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.farLight, 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, y, rx, rx * 0.22, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    });
  }
  // Dunes (d'où surgit le ver)
  const dune = (x: number) => 318 + wave(x, W, [[3, 12, 0.2], [6, 7, 1.7], [11, 3, 0.8]]);
  const dp = ridgePath(W, H, dune, 6);
  ctx.fillStyle = linGrad(ctx, 0, 300, 0, H, [[0, mix(pal.far, pal.mist, 0.45)], [1, pal.far]]);
  ctx.fill(dp);
  ctx.strokeStyle = rgba('#d8ccf0', 0.4);
  ctx.lineWidth = 1.5;
  ctx.save();
  ctx.clip(dp);
  ctx.translate(0, 1);
  ctx.stroke(dp);
  ctx.restore();
  // Reflets de cristaux lointains
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = dune(x) + 10 + r() * 100;
    softDot(ctx, x, y, 2 + r() * 3, pal.vein, 0.45);
  }
  mistOverlay(ctx, W, H, 200, pal.mist, 0.45);
  return canvas;
}

function moonMid(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.midW;
  const H = BG.midH;
  const { canvas, ctx } = makeCanvas(W, H);
  const r = rng(6001);
  const base = (x: number) => 250 + wave(x, W, [[2, 22, 1.1], [5, 14, 0.2], [13, 4, 2.2]]);
  // Mesas et éperons
  for (let i = 0; i < 8; i++) {
    const x = r() * W;
    const w = 90 + r() * 160;
    const top = 70 + r() * 110;
    const pts = [x - w / 2 - 30, H, x - w / 2, top + 30 + r() * 20, x - w * 0.3, top + r() * 10, x + w * 0.2, top + r() * 14, x + w / 2, top + 26 + r() * 20, x + w / 2 + 30, H];
    wrapX(W, x, w / 2 + 40, (px) => {
      const sh = pts.slice();
      for (let k = 0; k < sh.length; k += 2) sh[k] += px - x;
      const p = poly(sh);
      ctx.fillStyle = linGrad(ctx, 0, top, 0, H, [[0, pal.midLight], [0.35, pal.mid], [1, shade(pal.mid, -0.25)]]);
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      ctx.strokeStyle = rgba(shade(pal.midLight, 0.3), 0.9);
      ctx.lineWidth = 3;
      ctx.translate(2, 2);
      ctx.stroke(p);
      ctx.restore();
      // Strates
      ctx.save();
      ctx.clip(p);
      ctx.strokeStyle = rgba(shade(pal.mid, -0.3), 0.6);
      ctx.lineWidth = 2;
      for (let s = 1; s < 5; s++) {
        ctx.beginPath();
        ctx.moveTo(px - w, top + s * 26);
        ctx.lineTo(px + w, top + s * 26 + 6);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  // Amas de cristaux
  for (let i = 0; i < 12; i++) {
    const x = r() * W;
    const y = base(x) + 10;
    const n = 3 + Math.floor(r() * 3);
    const shards: [number, number, number, number][] = [];
    for (let k = 0; k < n; k++) shards.push([(r() - 0.5) * 40, 30 + r() * 60, 10 + r() * 14, (r() - 0.5) * 30]);
    wrapX(W, x, 60, (px) => {
      softDot(ctx, px, y - 30, 60, pal.vein, 0.22);
      for (const [dx, h, w, lean] of shards) crystalSpire(ctx, px + dx, y + 10, y - h, w, lean, mix(pal.vein, pal.midLight, 0.45), mix(pal.vein, pal.mid, 0.7), pal.vein, 1);
    });
  }
  const gp = ridgePath(W, H, base, 6);
  ctx.fillStyle = linGrad(ctx, 0, 230, 0, H, [[0, mix(pal.mid, pal.midLight, 0.5)], [0.3, pal.mid], [1, shade(pal.mid, -0.3)]]);
  ctx.fill(gp);
  ctx.save();
  ctx.clip(gp);
  ctx.translate(0, 1.5);
  ctx.strokeStyle = rgba(pal.midLight, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke(gp);
  ctx.restore();
  // Rebords de cratères
  for (let i = 0; i < 7; i++) {
    const x = r() * W;
    const rx = 40 + r() * 60;
    const y = base(x) + 30 + r() * 30;
    wrapX(W, x, rx, (px) => {
      ctx.fillStyle = rgba(shade(pal.mid, -0.4), 0.8);
      ctx.beginPath();
      ctx.ellipse(px, y, rx, rx * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.midLight, 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(px, y, rx, rx * 0.2, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    });
  }
  mistOverlay(ctx, W, H, 180, pal.mist, 0.25);
  return canvas;
}

function moonNear(pal: ThemePalette): HTMLCanvasElement {
  const W = BG.nearW;
  const H = BG.nearH;
  const { canvas, ctx } = makeCanvas(W, H);
  const r = rng(7001);
  for (let i = 0; i < 22; i++) {
    const x = r() * W;
    const w = 50 + r() * 120;
    const h = 40 + r() * 90;
    const y = 220;
    const pts: number[] = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (k / n) * Math.PI;
      pts.push(Math.cos(a) * w * (0.85 + r() * 0.3) * 0.5, Math.sin(a) * h * (0.8 + r() * 0.3));
    }
    const hasShard = r() < 0.55;
    const sx = (r() - 0.5) * w * 0.5;
    const sh = 30 + r() * 50;
    const sl = (r() - 0.5) * 20;
    wrapX(W, x, w, (px) => {
      if (hasShard) {
        softDot(ctx, px + sx, y - h * 0.6 - sh * 0.5, 40, pal.vein, 0.25);
        crystalSpire(ctx, px + sx, y - h * 0.5, y - h * 0.5 - sh, 14, sl, mix(pal.vein, pal.nearLight, 0.5), mix(pal.vein, pal.near, 0.75), pal.vein, 1);
      }
      const p = new Path2D();
      p.moveTo(px + pts[0], y + 40);
      for (let k = 0; k < pts.length; k += 2) p.lineTo(px + pts[k], y + pts[k + 1]);
      p.lineTo(px + pts[pts.length - 2], y + 40);
      p.closePath();
      ctx.fillStyle = pal.near;
      ctx.fill(p);
      ctx.save();
      ctx.clip(p);
      ctx.translate(2, 2.5);
      ctx.strokeStyle = rgba(pal.nearLight, 0.95);
      ctx.lineWidth = 3;
      ctx.stroke(p);
      ctx.restore();
    });
  }
  ctx.fillStyle = pal.near;
  ctx.fillRect(0, 215, W, H - 215);
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = 190 + r() * 40;
    wrapX(W, x, 6, (px) => glowDot(ctx, px, y, 1.6, pal.vein));
  }
  return canvas;
}

// ================================================================ Astres

function planetMoon(ctx: Ctx, cx: number, cy: number, rad: number, light: string, mid: string, dark: string, halo: string, seed: number): void {
  softDot(ctx, cx, cy, rad * 1.45, halo, 0.35);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, TAU);
  ctx.clip();
  ctx.fillStyle = sphereGrad(ctx, cx, cy, rad, light, mid, dark);
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  const r = rng(seed);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * rad * 0.9;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const cr = rad * (0.04 + r() * 0.12);
    ctx.fillStyle = rgba(dark, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, cr, cr * 0.85, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.18);
    ctx.lineWidth = Math.max(1, cr * 0.15);
    ctx.beginPath();
    ctx.ellipse(x, y, cr, cr * 0.85, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  // Terminateur (ombre en croissant)
  const g = ctx.createRadialGradient(cx - rad * 0.55, cy - rad * 0.5, rad * 0.6, cx - rad * 0.3, cy - rad * 0.3, rad * 1.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(5,2,20,0.35)');
  g.addColorStop(1, 'rgba(5,2,20,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  ctx.restore();
  ctx.strokeStyle = rgba(light, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, rad - 0.5, Math.PI * 0.95, Math.PI * 1.65);
  ctx.stroke();
}

function ringedPlanet(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const R = 150;
  const tilt = -0.22;
  const rings: [number, number, string][] = [
    [1.35, 7, 'rgba(230,210,255,0.35)'],
    [1.48, 10, 'rgba(255,220,190,0.55)'],
    [1.62, 6, 'rgba(210,180,240,0.45)'],
    [1.72, 3, 'rgba(255,230,210,0.5)'],
    [1.86, 12, 'rgba(200,170,235,0.35)'],
    [2.02, 4, 'rgba(255,220,200,0.3)'],
  ];
  const drawRings = (front: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    for (const [k, lw, col] of rings) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * k, R * k * 0.2, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
      ctx.stroke();
    }
    ctx.restore();
  };
  softDot(ctx, cx, cy, R * 1.5, '#ff8a5a', 0.25);
  drawRings(false);
  // Planète à bandes
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  ctx.fillStyle = sphereGrad(ctx, cx, cy, R, '#ffe0c0', '#e8805a', '#5a1f4a');
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  const bands: [number, number, string][] = [
    [-0.75, 0.1, 'rgba(255,240,220,0.35)'],
    [-0.5, 0.14, 'rgba(160,60,90,0.35)'],
    [-0.22, 0.08, 'rgba(255,210,170,0.4)'],
    [0.05, 0.18, 'rgba(190,80,80,0.3)'],
    [0.35, 0.09, 'rgba(255,230,200,0.3)'],
    [0.6, 0.15, 'rgba(120,40,90,0.35)'],
  ];
  for (const [y, hh, col] of bands) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let x = -R; x <= R; x += 10) ctx.lineTo(x, y * R + Math.sin(x * 0.05 + y * 9) * 3);
    for (let x = R; x >= -R; x -= 10) ctx.lineTo(x, (y + hh) * R + Math.sin(x * 0.04 + y * 5) * 3);
    ctx.closePath();
    ctx.fill();
  }
  // Tempête ovale
  ctx.fillStyle = 'rgba(255,200,170,0.45)';
  ctx.beginPath();
  ctx.ellipse(R * 0.25, R * 0.18, R * 0.16, R * 0.07, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(-tilt);
  ctx.translate(-cx, -cy);
  const g = ctx.createRadialGradient(cx - R * 0.6, cy - R * 0.55, R * 0.5, cx - R * 0.2, cy - R * 0.2, R * 1.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(10,4,30,0.35)');
  g.addColorStop(1, 'rgba(10,4,30,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  // Ombre des anneaux sur la planète
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.strokeStyle = 'rgba(20,6,30,0.35)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 18, R * 1.1, R * 0.17, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,220,190,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 1, Math.PI * 0.95, Math.PI * 1.6);
  ctx.stroke();
  drawRings(true);
}

function drawSun(ctx: Ctx, w: number, h: number): void {
  const c = w / 2;
  softDot(ctx, c, h / 2, w / 2, '#ffd27a', 0.55);
  softDot(ctx, c, h / 2, w / 4, '#fff2c0', 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, h / 2, 13, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.5)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + 0.3;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 18, h / 2 + Math.sin(a) * 18);
    ctx.lineTo(c + Math.cos(a) * 70, h / 2 + Math.sin(a) * 70);
    ctx.moveTo(c - Math.cos(a) * 18, h / 2 - Math.sin(a) * 18);
    ctx.lineTo(c - Math.cos(a) * 70, h / 2 - Math.sin(a) * 70);
    ctx.stroke();
  }
}

// ================================================================ Créatures et effets

function drawTwinkle(ctx: Ctx, w: number, h: number): void {
  const c = w / 2;
  softDot(ctx, c, h / 2, c, '#ffffff', 0.5);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(c, h / 2, c - 1, 1.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c, h / 2, 1.2, c - 1, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, h / 2, 2, 0, TAU);
  ctx.fill();
}

function drawDust(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Méduse-baleine géante (tournée vers la gauche). */
function drawWhale(ctx: Ctx, pal: ThemePalette): void {
  const { w, h } = WHALE;
  // Nageoire pectorale (derrière)
  const fin = new Path2D();
  fin.moveTo(150, 150);
  fin.bezierCurveTo(120, 190, 150, 230, 200, 228);
  fin.bezierCurveTo(190, 200, 205, 175, 215, 152);
  fin.closePath();
  ctx.fillStyle = 'rgba(120,110,255,0.35)';
  ctx.fill(fin);
  ctx.strokeStyle = 'rgba(160,250,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke(fin);
  // Corps : tête arrondie à gauche, queue en voile à droite
  const body = new Path2D();
  body.moveTo(30, 120);
  body.bezierCurveTo(28, 60, 110, 30, 210, 36);
  body.bezierCurveTo(300, 40, 360, 70, 400, 100);
  body.bezierCurveTo(420, 80, 445, 60, 455, 56);
  body.bezierCurveTo(450, 90, 440, 120, 430, 136);
  body.bezierCurveTo(445, 150, 452, 175, 450, 192);
  body.bezierCurveTo(430, 175, 410, 160, 392, 150);
  body.bezierCurveTo(340, 168, 260, 172, 200, 170);
  body.bezierCurveTo(110, 168, 32, 160, 30, 120);
  body.closePath();
  const g = ctx.createRadialGradient(170, 90, 10, 220, 110, 260);
  g.addColorStop(0, 'rgba(210,200,255,0.9)');
  g.addColorStop(0.35, 'rgba(130,110,255,0.75)');
  g.addColorStop(0.75, 'rgba(70,50,190,0.65)');
  g.addColorStop(1, 'rgba(40,20,120,0.55)');
  softDot(ctx, 220, 110, 230, '#7a6aff', 0.25);
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  // Organes internes lumineux
  softDot(ctx, 200, 110, 60, pal.bioB, 0.35);
  softDot(ctx, 270, 115, 40, pal.bioA, 0.25);
  // Ventre plus sombre et rayures
  ctx.fillStyle = 'rgba(30,10,90,0.35)';
  ctx.beginPath();
  ctx.ellipse(220, 175, 220, 40, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,240,255,0.25)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const x = 90 + k * 34;
    ctx.beginPath();
    ctx.moveTo(x, 150);
    ctx.quadraticCurveTo(x + 10, 120, x + 4, 95);
    ctx.stroke();
  }
  ctx.restore();
  // Liseré lumineux
  ctx.strokeStyle = 'rgba(160,250,255,0.75)';
  ctx.lineWidth = 2.5;
  ctx.stroke(body);
  // Rangées de points bioluminescents
  for (let k = 0; k < 16; k++) {
    const t = k / 15;
    const x = 70 + t * 320;
    const y = 70 - Math.sin(t * Math.PI) * 26 + t * 30;
    glowDot(ctx, x, y + 12, 2.2 - t, pal.bioA);
  }
  for (let k = 0; k < 10; k++) {
    const x = 100 + k * 28;
    glowDot(ctx, x, 140 + Math.sin(k) * 3, 1.5, pal.bioB);
  }
  // Œil
  glowDot(ctx, 70, 108, 4, '#ffffff');
  softDot(ctx, 70, 108, 14, pal.bioA, 0.6);
  // Jupe festonnée (méduse) sous le corps
  const skirt = new Path2D();
  skirt.moveTo(90, 160);
  for (let k = 0; k <= 10; k++) {
    const x = 90 + k * 30;
    skirt.quadraticCurveTo(x + 15, 188 + (k % 2) * 6, x + 30, 166);
  }
  skirt.lineTo(390, 150);
  skirt.closePath();
  ctx.fillStyle = 'rgba(150,130,255,0.35)';
  ctx.fill(skirt);
  ctx.strokeStyle = 'rgba(190,250,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke(skirt);
  void w;
  void h;
}

function drawTentacle(ctx: Ctx, w: number, h: number, pal: ThemePalette): void {
  softDot(ctx, w / 2, h / 2, w / 2, pal.bioA, 0.45);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.42);
  g.addColorStop(0, 'rgba(225,220,255,0.9)');
  g.addColorStop(0.6, 'rgba(160,140,255,0.6)');
  g.addColorStop(1, 'rgba(120,100,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.24, h * 0.42, 0, 0, TAU);
  ctx.fill();
}

function drawTinyFlyer(ctx: Ctx, w: number, h: number, up: boolean, pal: ThemePalette): void {
  const cx = w / 2;
  const cy = h / 2 + 1;
  ctx.fillStyle = '#1a0a30';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (up) {
      ctx.quadraticCurveTo(cx + s * 5, cy - 7, cx + s * 12, cy - 6);
      ctx.quadraticCurveTo(cx + s * 6, cy - 2, cx, cy + 1);
    } else {
      ctx.quadraticCurveTo(cx + s * 5, cy + 2, cx + s * 12, cy + 5);
      ctx.quadraticCurveTo(cx + s * 6, cy + 4, cx, cy + 1);
    }
    ctx.fill();
  }
  softDot(ctx, cx, cy, 5, pal.bioB, 0.8);
  ctx.fillStyle = '#ffd6f8';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 2.4, 1.6, 0, 0, TAU);
  ctx.fill();
}

/** Segment du ver des sables (vu de côté ; la crête en haut). */
function drawWormSeg(ctx: Ctx, w: number, h: number, pal: ThemePalette): void {
  const c = w / 2;
  const R = w / 2 - 4;
  const seg = ellipse(c, h / 2, R, R * 0.92);
  ctx.fillStyle = sphereGrad(ctx, c, h / 2, R, '#d8cce8', '#8a7ca8', '#2e2846');
  ctx.fill(seg);
  ctx.strokeStyle = '#141024';
  ctx.lineWidth = 3;
  ctx.stroke(seg);
  ctx.save();
  ctx.clip(seg);
  // Anneaux
  ctx.strokeStyle = 'rgba(30,20,50,0.45)';
  ctx.lineWidth = 3;
  for (const dx of [-R * 0.45, 0, R * 0.45]) {
    ctx.beginPath();
    ctx.ellipse(c + dx, h / 2, R * 0.18, R, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }
  // Ventre
  ctx.fillStyle = 'rgba(255,170,90,0.25)';
  ctx.fillRect(0, h / 2 + R * 0.55, w, h);
  ctx.restore();
  // Plaques dorsales en cristal
  for (const dx of [-R * 0.4, R * 0.15]) {
    const x = c + dx;
    const y = h / 2 - R * 0.82;
    ctx.fillStyle = pal.vein;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 6);
    ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 8, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.veinLight;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 6);
    ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 1, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,200,140,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c, h / 2, R - 2, R * 0.92 - 2, 0, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
}

/** Tête du ver : gueule ronde dentée, tournée vers la droite. */
function drawWormHead(ctx: Ctx, w: number, h: number, pal: ThemePalette): void {
  const cy = h / 2;
  const head = new Path2D();
  head.moveTo(10, cy - 34);
  head.bezierCurveTo(50, cy - 46, 90, cy - 44, 104, cy - 30);
  head.lineTo(104, cy + 30);
  head.bezierCurveTo(90, cy + 44, 50, cy + 46, 10, cy + 34);
  head.bezierCurveTo(2, cy + 10, 2, cy - 10, 10, cy - 34);
  head.closePath();
  ctx.fillStyle = sphereGrad(ctx, 50, cy - 10, 60, '#e0d4f0', '#8a7ca8', '#2e2846');
  ctx.fill(head);
  ctx.strokeStyle = '#141024';
  ctx.lineWidth = 3;
  ctx.stroke(head);
  ctx.save();
  ctx.clip(head);
  ctx.strokeStyle = 'rgba(30,20,50,0.45)';
  ctx.lineWidth = 3;
  for (const x of [30, 58]) {
    ctx.beginPath();
    ctx.ellipse(x, cy, 8, 48, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }
  ctx.restore();
  // Gueule
  const maw = ellipse(104, cy, 13, 32);
  ctx.fillStyle = '#2a0610';
  ctx.fill(maw);
  softDot(ctx, 106, cy, 30, '#ff7a1a', 0.7);
  ctx.strokeStyle = '#141024';
  ctx.lineWidth = 3;
  ctx.stroke(maw);
  // Dents
  ctx.fillStyle = '#fff2e0';
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI;
    const x = 104 + Math.cos(a) * 10;
    const y = cy + Math.sin(a) * 29;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 3);
    ctx.lineTo(x + 8, y - Math.sin(a) * 5);
    ctx.lineTo(x - 1, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  // Points lumineux
  for (const [x, y] of [[40, cy - 26], [64, cy - 30], [80, cy - 26]] as const) glowDot(ctx, x, y, 2, pal.vein);
}

function drawComet(ctx: Ctx, w: number, h: number): void {
  const cy = h / 2;
  const tail = ctx.createLinearGradient(0, 0, w, 0);
  tail.addColorStop(0, 'rgba(120,200,255,0)');
  tail.addColorStop(0.7, 'rgba(160,230,255,0.35)');
  tail.addColorStop(1, 'rgba(230,250,255,0.9)');
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.quadraticCurveTo(w * 0.6, cy - 9, w - 12, cy - 6);
  ctx.lineTo(w - 12, cy + 6);
  ctx.quadraticCurveTo(w * 0.6, cy + 9, 0, cy);
  ctx.fill();
  const t2 = ctx.createLinearGradient(w * 0.3, 0, w, 0);
  t2.addColorStop(0, 'rgba(255,140,220,0)');
  t2.addColorStop(1, 'rgba(255,170,230,0.45)');
  ctx.fillStyle = t2;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, cy + 7);
  ctx.quadraticCurveTo(w * 0.7, cy + 6, w - 12, cy + 2);
  ctx.lineTo(w - 12, cy + 5);
  ctx.closePath();
  ctx.fill();
  softDot(ctx, w - 12, cy, 14, '#bff6ff', 0.9);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(w - 12, cy, 3.2, 0, TAU);
  ctx.fill();
}

// ================================================================ Par thème

/** Arrière-plan de chaque thème (un thème oublié ici fait échouer tsc). */
interface BgStyle {
  /** Ciel : graine, nombre de nébuleuses, opacité de base des nébuleuses et de la bande galactique, lueur d'horizon. */
  skySeed: number;
  nebulae: number;
  nebulaAlpha: number;
  galaxyAlpha: number;
  horizonGlow: string;
  /** Étoiles fixes : graine et nombre. */
  starSeed: number;
  stars: number;
  /** Silhouettes : lointaine (brumeuse), intermédiaire et proche. */
  far(pal: ThemePalette): HTMLCanvasElement;
  mid(pal: ThemePalette): HTMLCanvasElement;
  near(pal: ThemePalette): HTMLCanvasElement;
  /** Astres de l'atlas 'bodies' (placés par parallax.ts). */
  bodies(pal: ThemePalette): AtlasItem[];
  /** Créatures et effets propres au thème, ajoutés à l'atlas 'fx' (animés par parallax.ts). */
  fx(pal: ThemePalette): AtlasItem[];
}

const BG_STYLES: Record<ThemeId, BgStyle> = {
  jungle: {
    skySeed: 71,
    nebulae: 9,
    nebulaAlpha: 0.16,
    galaxyAlpha: 0.09,
    horizonGlow: '#b05ad0',
    starSeed: 5,
    stars: 380,
    far: jungleFar,
    mid: jungleMid,
    near: jungleNear,
    bodies: () => [
      { name: 'moonA', w: 280, h: 280, draw: (c) => planetMoon(c, 140, 140, 92, '#e6fbff', '#8ab6e0', '#2a2a7a', '#6af0ff', 11) },
      { name: 'moonB', w: 110, h: 110, draw: (c) => planetMoon(c, 55, 55, 32, '#ffe0f6', '#d07ad0', '#4a1a5a', '#ff7ae0', 12) },
    ],
    fx: (pal) => [
      { name: 'whale', w: WHALE.w, h: WHALE.h, draw: (c) => drawWhale(c, pal) },
      { name: 'tent', w: 22, h: 22, draw: (c, w, h) => drawTentacle(c, w, h, pal) },
      { name: 'flyer0', w: 28, h: 18, draw: (c, w, h) => drawTinyFlyer(c, w, h, true, pal) },
      { name: 'flyer1', w: 28, h: 18, draw: (c, w, h) => drawTinyFlyer(c, w, h, false, pal) },
    ],
  },
  moon: {
    skySeed: 93,
    nebulae: 7,
    nebulaAlpha: 0.11,
    galaxyAlpha: 0.07,
    horizonGlow: '#6a4a9a',
    starSeed: 6,
    stars: 520,
    far: moonFar,
    mid: moonMid,
    near: moonNear,
    bodies: () => [
      { name: 'ringed', w: 640, h: 330, draw: (c, w, h) => ringedPlanet(c, w, h) },
      { name: 'sun', w: 160, h: 160, draw: (c, w, h) => drawSun(c, w, h) },
    ],
    fx: (pal) => [
      { name: 'wormHead', w: 120, h: 110, draw: (c, w, h) => drawWormHead(c, w, h, pal) },
      { name: 'wormSeg', w: 84, h: 84, draw: (c, w, h) => drawWormSeg(c, w, h, pal) },
      { name: 'comet', w: 260, h: 40, draw: (c, w, h) => drawComet(c, w, h) },
    ],
  },
};

// ================================================================ Génération (avec cache)

/** Durées de génération (ms) de la dernière création, pour le profilage sur appareil. */
export const BG_TIMINGS: Record<string, number> = {};

function timed<T>(name: string, fn: () => T): T {
  const t = performance.now();
  const r = fn();
  BG_TIMINGS[name] = Math.round((performance.now() - t) * 10) / 10;
  return r;
}

/** Génère les textures d'arrière-plan du thème si elles n'existent pas encore. */
export function ensureBackgroundTextures(scene: Phaser.Scene, theme: ThemeId): void {
  if (scene.textures.exists(bgKey(theme, 'fx'))) return;
  const pal = PALETTES[theme];
  const st = BG_STYLES[theme];
  const reg = (name: string, draw: () => HTMLCanvasElement) =>
    timed(name, () => registerCanvas(scene, bgKey(theme, name), draw()));
  reg('sky', () => drawSky(pal, st));
  reg('stars', () => drawStars(st));
  reg('far', () => st.far(pal));
  reg('mid', () => st.mid(pal));
  reg('near', () => st.near(pal));
  timed('bodies', () => buildAtlas(scene, bgKey(theme, 'bodies'), st.bodies(pal), 1024));
  const fx: AtlasItem[] = [
    { name: 'twinkle', w: 24, h: 24, draw: (c, w, h) => drawTwinkle(c, w, h) },
    { name: 'dust', w: 64, h: 64, draw: (c, w, h) => drawDust(c, w, h) },
    ...st.fx(pal),
  ];
  timed('fx', () => buildAtlas(scene, bgKey(theme, 'fx'), fx, 1024));
}
