import { WHALE } from '../../game2d/art/draw/backgrounds';
import { PALETTES, type ThemePalette } from '../../game2d/art/palette';
import { type Ctx, circle, glow, glowDot, rgba, rng, smoothPoly, softDot } from '../../game2d/art/util';
import { type Sprite, canvas, makeSprite } from '../scenes/common';

// La méduse-baleine des cinématiques. Son dessin est COPIÉ de l'ancien drawWhale de src/game2d/art/draw/backgrounds.ts
// (le décor dessine maintenant la sienne avec drawWhaleBody de draw/bosses.ts, même tracé : cette copie peut lui
// céder la place), avec
// des variantes : grise (le Vide : couleurs éteintes, fissures noires, reflets rouges, œil rouge) et tachée
// (quelques plaques grises, comme au niveau 1). Les tentacules sont des chapelets de petites lueurs animées.

const TAU = Math.PI * 2;
const VOID_RED = '#ff3a4a';

export { WHALE };
/** Centre du cœur lumineux (organe magenta) dans le repère de la frame 'whale'. */
export const WHALE_HEART = { x: 222, y: 128 } as const;
/** Centres des plaques grises de la version tachée (repère de la frame) : fumée du Vide. */
export const WHALE_BLOTS: readonly number[] = [322, 96, 246, 142, 150, 70, 414, 120];
/** Œil (repère de la frame). */
export const WHALE_EYE = { x: 70, y: 108 } as const;

/** Méduse-baleine géante (tournée vers la gauche) : copie de drawWhale (backgrounds.ts). */
function drawWhale(ctx: Ctx, pal: ThemePalette): void {
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
  const body = whaleBody();
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
  glowDot(ctx, WHALE_EYE.x, WHALE_EYE.y, 4, '#ffffff');
  softDot(ctx, WHALE_EYE.x, WHALE_EYE.y, 14, pal.bioA, 0.6);
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
}

/** Corps : tête arrondie à gauche, queue en voile à droite (même tracé que drawWhale). */
function whaleBody(): Path2D {
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
  return body;
}

/** Éteint les couleurs d'un canvas (garde sa transparence) et l'assombrit d'autant. */
function desaturate(c: HTMLCanvasElement, darken: number): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const copy = canvas(c.width, c.height);
  copy.ctx.drawImage(c, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(copy.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(16,14,22,${darken})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  copy.c.width = 0;
  copy.c.height = 0;
}

/** Fissures noires bordées de rouge sur le corps, œil rouge (repère de la frame, découpées par le corps). */
function voidMarks(ctx: Ctx, seed: number, count: number): void {
  const body = whaleBody();
  const r = rng(seed);
  ctx.save();
  ctx.clip(body);
  const paths: number[][] = [];
  for (let k = 0; k < count; k++) {
    let x = 70 + r() * 340;
    let y = 60 + r() * 100;
    let a = r() * TAU;
    const pts = [x, y];
    for (let j = 0; j < 6; j++) {
      a += (r() - 0.5) * 1.5;
      x += Math.cos(a) * (10 + r() * 14);
      y += Math.sin(a) * (8 + r() * 10);
      pts.push(x, y);
    }
    paths.push(pts);
  }
  const stroke = (pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  glow(ctx, VOID_RED, 8, () => {
    ctx.strokeStyle = rgba(VOID_RED, 0.8);
    ctx.lineWidth = 3.4;
    for (const p of paths) stroke(p);
  });
  ctx.strokeStyle = '#08060c';
  ctx.lineWidth = 1.6;
  for (const p of paths) stroke(p);
  ctx.restore();
}

function redEye(ctx: Ctx): void {
  softDot(ctx, WHALE_EYE.x, WHALE_EYE.y, 16, VOID_RED, 0.7);
  glowDot(ctx, WHALE_EYE.x, WHALE_EYE.y, 4, VOID_RED);
}

export type WhaleLook = 'color' | 'grey' | 'stained';

/** Méduse-baleine (460 x 240 unités, ancre au centre) : couleurs, toute grise (Vide) ou tachée de gris. */
export function whaleSprite(look: WhaleLook, res: number): Sprite {
  const pal = PALETTES.jungle;
  const s = makeSprite(WHALE.w, WHALE.h, WHALE.w / 2, WHALE.h / 2, res, (ctx) => drawWhale(ctx, pal));
  if (look === 'color') return s;
  const ctx = s.c.getContext('2d') as Ctx;
  // Résolution réelle du sprite (makeSprite peut la réduire sur un très grand écran).
  const k = s.res;
  if (look === 'grey') {
    desaturate(s.c, 0.3);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    voidMarks(ctx, 61, 9);
    redEye(ctx);
    ctx.restore();
    return s;
  }
  // Tachée : plaques irrégulières (et quelques éclaboussures autour : le gris gagne) sur un fond gris presque
  // opaque (le corps est translucide : sans lui, elles resteraient violettes), texture de la version grise,
  // liseré rouge sombre et fissures noires bordées de rouge, comme les mondes rongés du prologue.
  const r = rng(88);
  const blots: Path2D[] = [];
  const radii = [56, 38, 36, 32];
  const centers: [number, number, number][] = radii.map((br, i) => [WHALE_BLOTS[i * 2], WHALE_BLOTS[i * 2 + 1], br]);
  for (const [bx, by, br] of centers) {
    const pts: number[] = [];
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * TAU;
      const d = br * (0.62 + r() * 0.5);
      pts.push(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.78);
    }
    blots.push(smoothPoly(pts));
    for (let j = 0; j < 3; j++) {
      const a = r() * TAU;
      const d = br * (1.08 + r() * 0.3);
      blots.push(circle(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.78, br * (0.1 + r() * 0.1)));
    }
  }
  const grey = canvas(s.c.width, s.c.height);
  grey.ctx.drawImage(s.c, 0, 0);
  desaturate(grey.c, 0.5);
  grey.ctx.save();
  grey.ctx.setTransform(k, 0, 0, k, 0, 0);
  grey.ctx.globalCompositeOperation = 'destination-in';
  grey.ctx.fillStyle = '#000';
  for (const b of blots) grey.ctx.fill(b);
  grey.ctx.restore();
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clip(whaleBody());
  ctx.fillStyle = 'rgba(66,62,76,0.8)';
  for (const b of blots) ctx.fill(b);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(grey.c, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  glow(ctx, VOID_RED, 6, () => {
    ctx.strokeStyle = rgba(VOID_RED, 0.5);
    ctx.lineWidth = 2.6;
    for (const b of blots) ctx.stroke(b);
  });
  ctx.strokeStyle = 'rgba(16,12,20,0.85)';
  ctx.lineWidth = 1.4;
  for (const b of blots) ctx.stroke(b);
  for (let i = 0; i < centers.length; i++) blotCracks(ctx, centers[i][0], centers[i][1], centers[i][2], 70 + i);
  ctx.restore();
  grey.c.width = 0;
  grey.c.height = 0;
  return s;
}

/** Fissures noires bordées de rouge rayonnant depuis le centre d'une plaque grise. */
function blotCracks(ctx: Ctx, cx: number, cy: number, R: number, seed: number): void {
  const r = rng(seed);
  const paths: number[][] = [];
  for (let k = 0; k < 4; k++) {
    let a = (k / 4) * TAU + r() * 0.8;
    let x = cx;
    let y = cy;
    const pts = [x, y];
    for (let j = 0; j < 4; j++) {
      a += (r() - 0.5) * 1.2;
      x += Math.cos(a) * R * 0.28;
      y += Math.sin(a) * R * 0.22;
      pts.push(x, y);
    }
    paths.push(pts);
  }
  const stroke = (pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  // Traits épais : le sprite est à basse résolution (créature au loin, ≈ 0,5 px par unité).
  glow(ctx, VOID_RED, 7, () => {
    ctx.strokeStyle = rgba(VOID_RED, 0.9);
    ctx.lineWidth = 4.8;
    for (const p of paths) stroke(p);
  });
  ctx.strokeStyle = '#08060c';
  ctx.lineWidth = 2.2;
  for (const p of paths) stroke(p);
  glowDot(ctx, cx, cy, 3, VOID_RED);
}

/** Perle de tentacule (22 x 22, ancre au centre) : lumineuse, ou grise et terne. */
export function tentacleSprite(grey: boolean, res: number): Sprite {
  const pal = PALETTES.jungle;
  return makeSprite(22, 22, 11, 11, res, (ctx) => {
    const w = 22;
    const h = 22;
    softDot(ctx, w / 2, h / 2, w / 2, grey ? '#8a8692' : pal.bioA, grey ? 0.3 : 0.45);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.42);
    g.addColorStop(0, grey ? 'rgba(200,198,208,0.85)' : 'rgba(225,220,255,0.9)');
    g.addColorStop(0.6, grey ? 'rgba(120,116,130,0.6)' : 'rgba(160,140,255,0.6)');
    g.addColorStop(1, grey ? 'rgba(90,86,100,0)' : 'rgba(120,100,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.24, h * 0.42, 0, 0, TAU);
    ctx.fill();
  });
}

/** Noyau du gardien (48 x 48, ancre au centre) : orbe blanc, halo cyan et magenta. Anneaux dessinés à part. */
export function coreSprite(res: number): Sprite {
  return makeSprite(48, 48, 24, 24, res, (ctx) => {
    softDot(ctx, 24, 24, 24, '#ff4fd8', 0.45);
    softDot(ctx, 24, 24, 16, '#3ff0ff', 0.7);
    const g = ctx.createRadialGradient(21, 21, 1, 24, 24, 9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#c9fdff');
    g.addColorStop(1, '#3fd8ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(24, 24, 8, 0, TAU);
    ctx.fill();
    // Facettes
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(24, 16);
    ctx.lineTo(30, 24);
    ctx.lineTo(24, 32);
    ctx.lineTo(18, 24);
    ctx.closePath();
    ctx.stroke();
  });
}

/**
 * Tentacules animés (7 chapelets de `segs` perles) sous une baleine posée en (x, y) unités, échelle `ws` :
 * reprend le mouvement de parallax.ts. Sans allocation.
 */
export function drawTentacles(
  ctx: Ctx,
  bead: Sprite,
  x: number,
  y: number,
  ws: number,
  t: number,
  alpha: number,
  k: number,
  segs: number,
  lift: number,
): void {
  if (alpha <= 0.004) return;
  for (let i = 0; i < WHALE.tentacles.length; i++) {
    const ax = x + (WHALE.tentacles[i] - WHALE.w / 2) * ws;
    const ay = y + (WHALE.tentY - WHALE.h / 2) * ws;
    const len = (0.85 + ((i * 37) % 5) * 0.08) * ws * (1 - lift);
    for (let j = 0; j < segs; j++) {
      const ph = t * 1.25 + i * 0.85 - j * 0.3;
      const px = ax + (Math.sin(ph) * (1.5 + j * 1.1) + j * j * 0.1) * ws;
      const py = ay + j * 9 * len + Math.sin(ph * 0.7) * 1.5 * ws;
      drawSpriteBead(ctx, bead, px, py, (1.1 - j * 0.045) * ws, alpha * (0.8 - j * 0.035), k);
    }
  }
}

function drawSpriteBead(ctx: Ctx, s: Sprite, x: number, y: number, scale: number, alpha: number, k: number): void {
  if (alpha <= 0.004) return;
  const f = (k * scale) / s.res;
  ctx.globalAlpha = alpha;
  ctx.setTransform(f, 0, 0, f, x * k, y * k);
  ctx.drawImage(s.c, -s.ax * s.res, -s.ay * s.res);
}
