import type Phaser from 'phaser';

// Outils de dessin Canvas 2D partagés par tout le module graphique.

export type Ctx = CanvasRenderingContext2D;

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
}

/**
 * Crée un canvas hors écran (jamais plus de 2048 px de côté).
 * `willReadFrequently` force un canvas logiciel : dessin des petites formes et envoi au GPU
 * (texImage2D) bien plus rapides qu'avec un canvas accéléré, qui doit être relu.
 */
export function makeCanvas(w: number, h: number, soft = true): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(2048, Math.max(1, Math.ceil(w)));
  canvas.height = Math.min(2048, Math.max(1, Math.ceil(h)));
  const ctx = canvas.getContext('2d', { willReadFrequently: soft }) as Ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { canvas, ctx };
}

/** Écart entre deux frames d'une planche (évite les fuites de pixels au filtrage linéaire). */
export const FRAME_GAP = 2;

/** Supprime une texture existante (changement de thème). */
export function removeTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
}

/**
 * Dessine une planche horizontale de `count` frames de taille fw x fh et l'enregistre
 * sous `key` avec des frames numérotées 0..count-1.
 */
export function buildSheet(
  scene: Phaser.Scene,
  key: string,
  fw: number,
  fh: number,
  count: number,
  draw: (ctx: Ctx, index: number) => void,
): void {
  // Une planche d'une seule frame a exactement la taille de la frame (frame __BASE utilisable).
  const { canvas, ctx } = makeCanvas(count * fw + (count - 1) * FRAME_GAP, fh);
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(i * (fw + FRAME_GAP), 0);
    ctx.beginPath();
    ctx.rect(0, 0, fw, fh);
    ctx.clip();
    draw(ctx, i);
    ctx.restore();
  }
  registerCanvas(scene, key, canvas, (tex) => {
    for (let i = 0; i < count; i++) tex.add(i, 0, i * (fw + FRAME_GAP), 0, fw, fh);
  });
}

/** Enregistre un canvas comme texture (en remplaçant l'ancienne) et ajoute ses frames. */
export function registerCanvas(
  scene: Phaser.Scene,
  key: string,
  canvas: HTMLCanvasElement,
  addFrames?: (tex: Phaser.Textures.CanvasTexture) => void,
): void {
  removeTexture(scene, key);
  const tex = scene.textures.addCanvas(key, canvas);
  if (tex && addFrames) addFrames(tex);
}

// ---------------------------------------------------------------- Atlas (rangées)

export interface AtlasItem {
  name: string;
  w: number;
  h: number;
  draw: (ctx: Ctx, w: number, h: number) => void;
}

/** Range des images de tailles variées dans un seul canvas (rangées simples) et crée les frames nommées. */
export function buildAtlas(scene: Phaser.Scene, key: string, items: AtlasItem[], maxW = 1024): void {
  const pad = 2;
  const rects: { x: number; y: number }[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  let usedW = 0;
  for (const it of items) {
    if (x + it.w + pad > maxW && x > pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    rects.push({ x, y });
    x += it.w + pad;
    usedW = Math.max(usedW, x);
    rowH = Math.max(rowH, it.h);
  }
  const { canvas, ctx } = makeCanvas(usedW, y + rowH + pad);
  items.forEach((it, i) => {
    const r = rects[i];
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.beginPath();
    ctx.rect(0, 0, it.w, it.h);
    ctx.clip();
    it.draw(ctx, it.w, it.h);
    ctx.restore();
  });
  registerCanvas(scene, key, canvas, (tex) => {
    items.forEach((it, i) => tex.add(it.name, 0, rects[i].x, rects[i].y, it.w, it.h));
  });
}

// ---------------------------------------------------------------- Couleurs

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** '#rrggbb' + alpha -> 'rgba(...)'. */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mélange linéaire de deux couleurs hexadécimales. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Éclaircit (t > 0) ou assombrit (t < 0) une couleur. */
export function shade(hex: string, t: number): string {
  return t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t);
}

/** Valeur hexadécimale -> nombre (teintes Phaser). */
export function hexNum(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------- Aléatoire déterministe

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(r: () => number, a: number, b: number): number {
  return a + (b - a) * r();
}

// ---------------------------------------------------------------- Formes

export function roundRectPath(ctx: Ctx | Path2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  roundRectPath(p, x, y, w, h, r);
  return p;
}

export function circle(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  return p;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  return p;
}

export function poly(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/** Contour fermé lissé passant par les points (courbes quadratiques entre les milieux). */
export function smoothPoly(pts: number[]): Path2D {
  const p = new Path2D();
  const n = pts.length / 2;
  const mx = (i: number) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = (i: number) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  p.moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) p.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
  p.closePath();
  return p;
}

// ---------------------------------------------------------------- Rendu « néon »

/** Contour sombre puis remplissage (lisibilité sur fond sombre). */
export function fillOutlined(
  ctx: Ctx,
  path: Path2D,
  fill: string | CanvasGradient,
  outline: string,
  lw: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (lw > 0) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke(path);
  }
  ctx.fillStyle = fill;
  ctx.fill(path);
}

/** Lumière de bord : trace le contour décalé, découpé par la forme (croissant lumineux du côté opposé au décalage). */
export function rimLight(ctx: Ctx, path: Path2D, color: string, lw: number, dx: number, dy: number): void {
  ctx.save();
  ctx.clip(path);
  ctx.translate(dx, dy);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke(path);
  ctx.restore();
}

/** Ombre interne : remplit le décalé inverse, découpé par la forme. */
export function innerShade(ctx: Ctx, path: Path2D, color: string, dx: number, dy: number): void {
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = color;
  ctx.translate(dx, dy);
  // On soustrait la forme décalée : la zone restante est le bord opposé.
  ctx.fill(subtractPath(path), 'evenodd');
  ctx.restore();
}

function subtractPath(path: Path2D): Path2D {
  const p = new Path2D();
  p.rect(-4096, -4096, 8192, 8192);
  p.addPath(path);
  return p;
}

/** Exécute `fn` avec un halo lumineux (shadowBlur). */
export function glow(ctx: Ctx, color: string, blur: number, fn: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fn();
  ctx.restore();
}

/** Disque de lumière douce (dégradé radial). */
export function softDot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Point lumineux avec cœur blanc. */
export function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  softDot(ctx, x, y, r * 3, color, 0.55);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

/** Dégradé radial « sphère » éclairée en haut à gauche. */
export function sphereGrad(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  light: string,
  mid: string,
  dark: string,
): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  return g;
}

export function linGrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Trait épais à bouts ronds avec contour sombre (membres, tiges). */
export function limb(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  fill: string | CanvasGradient,
  outline: string,
  ow = 2.5,
): void {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = outline;
  ctx.lineWidth = w + ow * 2;
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Dessine `fn` aux positions x, x-W et x+W pour obtenir un motif qui se répète horizontalement. */
export function wrapX(W: number, x: number, reach: number, fn: (x: number) => void): void {
  fn(x);
  if (x - reach < 0) fn(x + W);
  if (x + reach > W) fn(x - W);
}

/** Idem dans les deux directions (tuiles de remplissage). */
export function wrapXY(W: number, H: number, x: number, y: number, reach: number, fn: (x: number, y: number) => void): void {
  for (let ox = -1; ox <= 1; ox++) {
    const px = x + ox * W;
    if (px + reach < 0 || px - reach > W) continue;
    for (let oy = -1; oy <= 1; oy++) {
      const py = y + oy * H;
      if (py + reach < 0 || py - reach > H) continue;
      fn(px, py);
    }
  }
}
