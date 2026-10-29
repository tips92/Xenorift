import type Phaser from 'phaser';
import type { ThemeId } from '../../../core/types';
import { PALETTES, type ThemePalette } from '../palette';
import {
  type Ctx,
  buildSheet,
  circle,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  limb,
  linGrad,
  mix,
  poly,
  removeTexture,
  rgba,
  rimLight,
  rng,
  smoothPoly,
  softDot,
  sphereGrad,
} from '../util';

// Boss du monde 1 (Jungle), dessinés par code : Blob-roi (mini-boss du niveau 1) et Scarabée-titan (niveau 2),
// rejetons du gardien, puis la méduse-baleine (gardien du niveau 3) : corps, cœur, tentacules en segments et
// tache d'annonce des spores. Fonctions pures (ctx, theme, frame, opts?) ; planches et boîtes : BOSS_SHEETS.
// Mini-boss tournés vers la DROITE comme les ennemis (flipX pour la gauche) ; méduse-baleine tournée vers la
// GAUCHE comme celle du décor. Points faibles (noyau, ventre, cœur) en magenta-blanc : la marque du gardien.
// Dessins prévus pour la Jungle : `theme` ne règle que les teintes bioluminescentes de la méduse-baleine.

const OUT = '#0d0618';
const TAU = Math.PI * 2;
/** Magenta du gardien : noyau du Blob-roi, ventre du Scarabée-titan, cœur de la méduse-baleine. */
const CORE = '#ff4fd8';
/** Reflets rouges du Vide. */
const VOID_RED = '#ff3a4a';

// ================================================================ Contrat des planches

/** Boîte en px relative à l'origine du sprite (setOrigin de la planche), sprite non retourné. */
export interface BossBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Boîtes utiles d'une image. Tester `weak` avant `armor` : un point faible peut chevaucher le blindage. */
export interface BossFrameBoxes {
  /** Zones vulnérables : un tir y blesse le boss. Vide = invulnérable sur cette image. */
  weak: readonly BossBox[];
  /** Zones blessantes : Kaï perd un cœur à leur contact. Vide = inoffensif sur cette image. */
  hurt: readonly BossBox[];
  /** Parties blindées : un tir s'y arrête sans dégât (hitBy → 0, étincelle). */
  armor: readonly BossBox[];
}

export interface BossDrawOpts {
  /** Part de Vide (méduse-baleine, 0 = couleurs, 1 = toute grise) ; ignoré par les mini-boss. */
  grey?: number;
}

export type BossSheetId =
  | 'blobKing'
  | 'blobKingRage'
  | 'blobWave'
  | 'beetleTitan'
  | 'beetleTitanCracked'
  | 'titanRock'
  | 'whaleBody'
  | 'whaleHeart'
  | 'whaleTentacle'
  | 'whaleSpot';

export interface BossSheet {
  /** Clé de texture conseillée. */
  key: string;
  /** Taille d'une image (px). */
  w: number;
  h: number;
  count: number;
  /** Origine à passer à setOrigin (pieds des mini-boss, centre du corps de la méduse-baleine…). */
  originX: number;
  originY: number;
  /** Rôle de chaque image (index dans la planche). */
  frames: Readonly<Record<string, number | readonly number[]>>;
  /** Boîtes utiles, une entrée par image. */
  boxes: readonly BossFrameBoxes[];
  /** Corps physique conseillé (Arcade), relatif à l'origine, s'il y en a un. */
  body?: BossBox;
  draw: (ctx: Ctx, theme: ThemeId, i: number, opts?: BossDrawOpts) => void;
}

/** Boîte d'un sprite tourné vers la gauche (flipX) : symétrique autour de l'origine. */
export function flipBox(b: BossBox): BossBox {
  return { x: -b.x - b.w, y: b.y, w: b.w, h: b.h };
}

// ================================================================ Outils

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Couleur éteinte par le Vide : même luminance, gris un peu froid ; k = 0 → inchangée, 1 → grise. */
function voided(hex: string, k: number): string {
  if (k <= 0) return hex;
  const [r, g, b] = hexRgb(hex);
  const l = (0.3 * r + 0.59 * g + 0.11 * b) * 0.9;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return mix(hex, '#' + c(l) + c(l + 2) + c(l * 1.05 + 6), k);
}

function box(x: number, y: number, w: number, h: number): BossBox {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

const NONE: readonly BossBox[] = [];

function starPath(x: number, y: number, r1: number, r2: number, n: number, rot = -Math.PI / 2): Path2D {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? r1 : r2;
    if (i === 0) p.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

/** Goutte de rayon r dont la pointe part dans la direction `ang`. */
function dropPath(x: number, y: number, r: number, ang: number): Path2D {
  const p = new Path2D();
  p.moveTo(x + Math.cos(ang) * r * 2.2, y + Math.sin(ang) * r * 2.2);
  p.arc(x, y, r, ang + 1.1, ang - 1.1 + TAU);
  p.closePath();
  return p;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Œil étourdi : spirale. */
function dizzyEye(ctx: Ctx, x: number, y: number, r: number, lw: number): void {
  fillOutlined(ctx, circle(x, y, r), '#ffffff', OUT, lw * 1.5);
  ctx.strokeStyle = '#120a1c';
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; i <= 26; i++) {
    const a = i * 0.55;
    const d = (i / 26) * r * 0.8;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/** Orbe magenta lumineux (point faible) : halo (rayon r x halo), rayons, anneaux, sphère à reflet. */
function weakOrb(ctx: Ctx, x: number, y: number, r: number, power: number, rays: boolean, lw: number, halo: number): void {
  softDot(ctx, x, y, r * halo, CORE, 0.6 * power);
  softDot(ctx, x, y, r * 1.9, '#ffffff', 0.35 * power);
  if (rays) {
    glow(ctx, CORE, 10, () => {
      ctx.strokeStyle = 'rgba(255,205,247,0.92)';
      ctx.lineWidth = lw * 0.85;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        const r1 = r * (k % 2 ? 1.75 : 2.15);
        ctx.moveTo(x + Math.cos(a) * r * 1.38, y + Math.sin(a) * r * 1.38);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(61,255,224,0.8)';
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, TAU);
    ctx.stroke();
  }
  const ball = circle(x, y, r);
  glow(ctx, CORE, 24, () => {
    ctx.fillStyle = '#ff6ae0';
    ctx.fill(ball);
  });
  fillOutlined(ctx, ball, sphereGrad(ctx, x, y, r, '#ffffff', '#ff8ae8', '#a0107a'), OUT, lw);
  // Lobes internes (il bat)
  ctx.save();
  ctx.clip(ball);
  ctx.strokeStyle = 'rgba(150,10,110,0.45)';
  ctx.lineWidth = lw * 0.55;
  ctx.beginPath();
  ctx.arc(x + r * 0.2, y + r * 0.35, r * 0.6, Math.PI * 1.1, Math.PI * 1.9);
  ctx.moveTo(x + r * 0.95, y + r * 0.1);
  ctx.arc(x + r * 0.35, y + r * 0.1, r * 0.6, 0, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill(ellipse(x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.18, -0.6));
}

// ================================================================ Blob-roi (mini-boss du niveau 1)

/** Blob-roi : images de 224x200 ; origine = milieu du bas du corps (pieds) en (cx, base). */
export const BLOB_KING = { w: 224, h: 200, cx: 112, base: 186 } as const;
/** Index des images : 0-2 repos, 3 écrasé avant le bond, 4 bond étiré, 5 aplati (noyau exposé), 6 fuite. */
export const BLOB_POSE = { idle: [0, 1, 2], squash: 3, leap: 4, flat: 5, flee: 6 } as const;

interface Jelly {
  light: string;
  mid: string;
  dark: string;
  deep: string;
  line: string;
  glow: string;
  rim: string;
  bubble: string;
  dot: string;
  shade: string;
}

const JELLY: Jelly = {
  light: '#eaffa0',
  mid: '#7cf04a',
  dark: '#22a83e',
  deep: '#0e6a2e',
  line: '#05210c',
  glow: 'rgba(110,255,80,0.85)',
  rim: 'rgba(220,255,170,0.6)',
  bubble: 'rgba(230,255,190,0.6)',
  dot: '#3dffe0',
  shade: 'rgba(8,70,30,0.35)',
};
/** Phase 2 : plus vif (acide), points magenta. */
const JELLY_RAGE: Jelly = {
  light: '#fdffb0',
  mid: '#c6ff2a',
  dark: '#46d81c',
  deep: '#127a1e',
  line: '#072604',
  glow: 'rgba(210,255,40,0.95)',
  rim: 'rgba(255,255,190,0.75)',
  bubble: 'rgba(255,255,210,0.7)',
  dot: '#ff5ae0',
  shade: 'rgba(20,90,10,0.3)',
};
/** Fuite : vaincu, pâli. */
const JELLY_PALE: Jelly = {
  light: '#e2f4cc',
  mid: '#94d48a',
  dark: '#4c9a5c',
  deep: '#285a38',
  line: '#0a2210',
  glow: 'rgba(150,230,140,0.45)',
  rim: 'rgba(230,255,220,0.45)',
  bubble: 'rgba(230,255,220,0.45)',
  dot: '#9adcd0',
  shade: 'rgba(20,60,30,0.3)',
};

type BlobFace = 'angry' | 'roar' | 'squint' | 'panic';

interface BlobPose {
  w: number;
  h: number;
  /** Décalage du sommet (penché). */
  lean: number;
  /** Bas du corps levé (en l'air). */
  lift: number;
  face: BlobFace;
  crownDy: number;
  tilt: number;
}

const BLOB_POSES: readonly BlobPose[] = [
  { w: 150, h: 104, lean: 0, lift: 0, face: 'angry', crownDy: 0, tilt: -0.1 },
  { w: 158, h: 97, lean: -4, lift: 0, face: 'angry', crownDy: 1, tilt: -0.14 },
  { w: 144, h: 111, lean: 4, lift: 0, face: 'angry', crownDy: -1, tilt: -0.05 },
  { w: 176, h: 70, lean: -4, lift: 0, face: 'squint', crownDy: 5, tilt: -0.24 },
  { w: 110, h: 134, lean: 3, lift: 10, face: 'roar', crownDy: -4, tilt: 0.1 },
];
const BLOB_FLEE: BlobPose = { w: 132, h: 96, lean: 18, lift: 0, face: 'panic', crownDy: -2, tilt: -0.6 };

/** Contour de gelée posé sur `base` : dôme (comme le marcheur), bas en gouttes ; wob = agitation du bord. */
function jellyPath(cx: number, base: number, w: number, h: number, lean: number, wob: number, ph: number): Path2D {
  const pts: number[] = [];
  const oy = base - h * 0.42;
  const add = (x: number, y: number, wobble: boolean) => {
    if (wobble && wob > 0) {
      const a = Math.atan2(y - oy, x - cx);
      const o = wob * (Math.sin(a * 5 + ph) * 0.6 + Math.sin(a * 9 - ph * 1.7) * 0.4);
      x += Math.cos(a) * o;
      y += Math.sin(a) * o;
    }
    pts.push(x, y);
  };
  const N = 12;
  const L = cx - w / 2;
  const R = cx + w / 2;
  const T = base - h;
  const top = cx + lean;
  for (let k = 0; k < N; k++) {
    const t = k / N;
    add(cubic(L, L - w * 0.02, cx - w * 0.32 + lean, top, t), cubic(base - 6, base - h * 0.75, T, T, t), k > 0);
  }
  for (let k = 0; k < N; k++) {
    const t = k / N;
    add(cubic(top, cx + w * 0.32 + lean, R + w * 0.02, R, t), cubic(T, T, base - h * 0.75, base - 6, t), true);
  }
  add(R, base - 6, false);
  // Bas en gouttes, de droite à gauche
  const n = 8;
  for (let k = 0; k <= n; k++) add(R - 5 - ((w - 10) * k) / n, base + (k % 2 === 0 ? 1 : -2), false);
  return smoothPoly(pts);
}

function jellyGrad(ctx: Ctx, cx: number, base: number, w: number, h: number, lean: number, J: Jelly): CanvasGradient {
  const g = ctx.createRadialGradient(cx - w * 0.14 + lean, base - h * 0.74, 4, cx + lean * 0.5, base - h * 0.45, Math.max(w, h) * 0.78);
  g.addColorStop(0, J.light);
  g.addColorStop(0.3, J.mid);
  g.addColorStop(0.75, J.dark);
  g.addColorStop(1, J.deep);
  return g;
}

function jellyFill(ctx: Ctx, path: Path2D, g: CanvasGradient, J: Jelly, blur: number): void {
  glow(ctx, J.glow, blur, () => {
    ctx.fillStyle = g;
    ctx.fill(path);
  });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = J.line;
  ctx.lineWidth = 5;
  ctx.stroke(path);
  ctx.fillStyle = g;
  ctx.fill(path);
}

/** Intérieur (à dessiner découpé par le contour) : ombre, noyau enfoui, bulles, points bioluminescents. */
function jellyInside(ctx: Ctx, cx: number, base: number, w: number, h: number, lean: number, J: Jelly, rage: boolean, seed: number): void {
  ctx.fillStyle = J.shade;
  ctx.fill(ellipse(cx + w * 0.1 + lean * 0.3, base - h * 0.1, w * 0.52, h * 0.32));
  // Noyau enfoui : silhouette sombre, faible lueur (il ne sort qu'aplati)
  const kx = cx - w * 0.06 + lean * 0.4;
  const ky = base - h * 0.36;
  const kr = Math.min(w, h) * 0.15;
  softDot(ctx, kx, ky, kr * 2.6, CORE, rage ? 0.5 : 0.25);
  ctx.fillStyle = rage ? 'rgba(200,30,160,0.6)' : 'rgba(150,30,130,0.42)';
  ctx.fill(circle(kx, ky, kr));
  if (rage) {
    const r = rng(77 + seed);
    glow(ctx, CORE, 8, () => {
      ctx.strokeStyle = 'rgba(255,140,235,0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let v = 0; v < 6; v++) {
        let a = (v / 6) * TAU + r() * 0.6;
        let x = kx + Math.cos(a) * kr;
        let y = ky + Math.sin(a) * kr;
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a) * kr * 0.55;
          y += Math.sin(a) * kr * 0.55;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });
  }
  // Bulles
  const r = rng(300 + seed);
  for (let i = 0; i < 9; i++) {
    const bx = cx - w * 0.38 + r() * w * 0.7 + lean * 0.3;
    const by = base - 8 - r() * h * 0.7;
    const br = 2 + r() * 4.5;
    ctx.strokeStyle = J.bubble;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill(circle(bx - br * 0.35, by - br * 0.35, br * 0.28));
  }
  // Points bioluminescents sur l'épaule, comme la méduse-baleine (la marque du gardien)
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (1.04 + k * 0.068);
    glowDot(ctx, cx + lean * 0.5 + Math.cos(a) * w * 0.38, base - h * 0.4 + Math.sin(a) * h * 0.46, 2.8 - k * 0.15, J.dot);
  }
}

function jellyShine(ctx: Ctx, cx: number, base: number, w: number, h: number, lean: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill(ellipse(cx - w * 0.22 + lean * 0.6, base - h * 0.7, w * 0.1, h * 0.075, -0.6));
  ctx.fill(circle(cx - w * 0.33 + lean * 0.5, base - h * 0.5, 3));
}

function blobEye(ctx: Ctx, x: number, y: number, r: number, sq: number, look: number, pupil: number, red: boolean): void {
  const p = ellipse(x, y, r, r * sq);
  fillOutlined(ctx, p, red ? sphereGrad(ctx, x, y, r, '#ffffff', '#ffe6e6', '#ff8a8a') : '#ffffff', OUT, 3.6);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = '#120a1c';
  const px = x + r * 0.35 * look;
  ctx.fill(ellipse(px, y + r * 0.08, r * pupil, r * pupil * Math.max(sq, 0.6)));
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fill(circle(px - r * 0.15, y - r * 0.28 * sq, r * 0.2));
}

/** Visage du Blob-roi : x = sommet du dôme (cx + penché). */
function blobFace(ctx: Ctx, x: number, base: number, w: number, h: number, face: BlobFace, J: Jelly, rage: boolean): void {
  const ey = base - h * 0.58;
  const e1 = x + w * 0.05;
  const e2 = x + w * 0.27;
  const sq = face === 'squint' ? 0.42 : face === 'roar' ? 1.08 : 1;
  const look = face === 'panic' ? -0.9 : 0.6;
  const pupil = face === 'panic' ? 0.28 : face === 'roar' ? 0.42 : 0.52;
  blobEye(ctx, e1, ey, 13, sq, look, pupil, rage);
  blobEye(ctx, e2, ey + 1.5, 11, sq, look, pupil, rage);
  // Sourcils
  ctx.strokeStyle = J.line;
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'panic') {
    ctx.moveTo(e1 - 13, ey - 15);
    ctx.lineTo(e1 + 6, ey - 21);
    ctx.moveTo(e2 + 11, ey - 14);
    ctx.lineTo(e2 - 4, ey - 19);
  } else {
    const d = face === 'squint' ? 7 : 0;
    ctx.moveTo(e1 - 15, ey - 19 + d);
    ctx.lineTo(e1 + 8, ey - 11 + d);
    ctx.moveTo(e2 + 14, ey - 17 + d);
    ctx.lineTo(e2 - 4, ey - 10 + d);
  }
  ctx.stroke();
  // Bouche
  const mx = x + w * 0.17;
  const my = base - h * 0.27;
  if (face === 'roar') {
    const m = ellipse(mx, my, 17, 14);
    fillOutlined(ctx, m, '#0a2a10', J.line, 3);
    ctx.save();
    ctx.clip(m);
    ctx.fillStyle = '#ff5ad0';
    ctx.fill(ellipse(mx + 2, my + 11, 11, 7));
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fill(poly([mx - 11, my - 10, mx - 7, my - 1, mx - 3, my - 12.5]));
    ctx.fill(poly([mx + 4, my - 12.5, mx + 7.5, my - 2, mx + 11, my - 10]));
  } else if (face === 'panic') {
    fillOutlined(ctx, ellipse(mx, my + 2, 7, 9), '#0a2a10', J.line, 2.5);
  } else if (face === 'squint') {
    fillOutlined(ctx, ellipse(mx, my, 19, 7), '#ffffff', J.line, 3);
    ctx.strokeStyle = J.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 18, my);
    ctx.lineTo(mx + 18, my);
    for (const dx of [-10, -3, 4, 11]) {
      ctx.moveTo(mx + dx, my - 6);
      ctx.lineTo(mx + dx, my + 6);
    }
    ctx.stroke();
  } else {
    const m = new Path2D();
    m.moveTo(mx - 19, my - 3);
    m.quadraticCurveTo(mx, my + 12, mx + 19, my - 5);
    m.quadraticCurveTo(mx, my + 4, mx - 19, my - 3);
    m.closePath();
    fillOutlined(ctx, m, '#0a2a10', J.line, 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill(poly([mx - 9, my + 1.5, mx - 4.5, my + 1.8, mx - 6.5, my + 9]));
    ctx.fill(poly([mx + 5, my + 1, mx + 10, my - 0.2, mx + 8.5, my + 7.5]));
  }
}

/** Couronne (marque royale) : (x, y) = milieu du bas du bandeau. */
function crown(ctx: Ctx, x: number, y: number, tilt: number, dim: boolean, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(s, s);
  const p = new Path2D();
  p.moveTo(-27, 0);
  p.lineTo(-31, -22);
  p.lineTo(-17, -11);
  p.lineTo(-12, -29);
  p.lineTo(-4, -13);
  p.lineTo(0, -35);
  p.lineTo(4, -13);
  p.lineTo(12, -29);
  p.lineTo(17, -11);
  p.lineTo(31, -22);
  p.lineTo(27, 0);
  p.quadraticCurveTo(0, 6, -27, 0);
  p.closePath();
  const g = linGrad(
    ctx,
    0,
    -35,
    0,
    5,
    dim
      ? [
          [0, '#eee2b8'],
          [0.5, '#b8a060'],
          [1, '#5a4a28'],
        ]
      : [
          [0, '#fff8c0'],
          [0.45, '#ffcc33'],
          [1, '#a2581a'],
        ],
  );
  if (!dim) {
    glow(ctx, 'rgba(255,204,51,0.75)', 12, () => {
      ctx.fillStyle = g;
      ctx.fill(p);
    });
  }
  fillOutlined(ctx, p, g, OUT, 3.5);
  // Bandeau
  ctx.strokeStyle = dim ? '#8a7a50' : '#fff0a0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, -6);
  ctx.quadraticCurveTo(0, -1, 24, -6);
  ctx.stroke();
  // Perles des pointes
  for (const [px, py] of [
    [-31, -22],
    [-12, -29],
    [0, -35],
    [12, -29],
    [31, -22],
  ] as const) {
    fillOutlined(ctx, circle(px, py, 3.4), dim ? '#d8d0b8' : '#fff6d0', OUT, 2.2);
  }
  // Gemmes : magenta au centre (la marque du gardien), cyan sur les côtés
  fillOutlined(ctx, circle(0, -9, 5.2), '#2a0626', OUT, 2.2);
  glowDot(ctx, 0, -9, 4, dim ? '#a07a98' : CORE);
  glowDot(ctx, -16, -5, 2.4, dim ? '#7aa8a0' : '#3dffe0');
  glowDot(ctx, 16, -5, 2.4, dim ? '#7aa8a0' : '#3dffe0');
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-25, -5);
  ctx.lineTo(-28, -17);
  ctx.stroke();
  ctx.restore();
}

function blobDrop(ctx: Ctx, x: number, y: number, r: number, ang: number, J: Jelly): void {
  fillOutlined(ctx, dropPath(x, y, r, ang), J.mid, J.line, 2.4);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill(circle(x - r * 0.3, y - r * 0.3, r * 0.3));
}

function blobFlat(ctx: Ctx, rage: boolean): void {
  const J = rage ? JELLY_RAGE : JELLY;
  const { cx, base } = BLOB_KING;
  // Éclaboussures
  for (const [x, y, r] of [
    [-104, -10, 4.5],
    [102, -12, 4.2],
    [-92, -28, 3.2],
    [94, -32, 3],
    [-64, -46, 2.6],
    [74, -48, 2.4],
  ] as const) {
    fillOutlined(ctx, circle(cx + x, base + y, r), J.mid, J.line, 2.4);
  }
  // Flaque avec une bosse au milieu, d'où sort le noyau
  const shape = [
    -104, -2, -98, -15, -78, -26, -50, -31, -32, -36, -24, -50, -12, -60, 10, -60, 22, -50, 30, -36, 52, -31, 80, -25, 98, -15,
    104, -2, 96, 1, 70, -1.5, 40, 1, 10, -1.5, -20, 1, -50, -1.5, -80, 1, -98, 0,
  ];
  const path = smoothPoly(shape.map((v, i) => (i % 2 === 0 ? cx + v : base + v)));
  jellyFill(ctx, path, jellyGrad(ctx, cx, base, 150, 62, 0, J), J, rage ? 12 : 9);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = J.shade;
  ctx.fill(ellipse(cx + 20, base - 2, 110, 16));
  const r = rng(321);
  for (let i = 0; i < 7; i++) {
    const bx = cx - 92 + r() * 184;
    const by = base - 6 - r() * 18;
    const br = 1.8 + r() * 3.2;
    ctx.strokeStyle = J.bubble;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  for (const [x, y] of [
    [-86, -16],
    [-70, -22],
    [-54, -26],
    [62, -24],
    [86, -17],
  ] as const) {
    glowDot(ctx, cx + x, base + y, 2.4, J.dot);
  }
  rimLight(ctx, path, J.rim, 4, -3, -3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill(ellipse(cx - 70, base - 22, 14, 3.6, -0.15));
  // Yeux étourdis, bouche ondulée
  dizzyEye(ctx, cx + 50, base - 18, 10, 2.2);
  dizzyEye(ctx, cx + 74, base - 15, 8.5, 2);
  ctx.strokeStyle = J.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 52, base - 5);
  for (let k = 1; k <= 6; k++) ctx.lineTo(cx + 52 + k * 4, base - 5 + (k % 2 ? -2.5 : 0));
  ctx.stroke();
  // Couronne tombée
  crown(ctx, cx - 74, base - 16, -0.95, false, 0.9);
  // NOYAU exposé : le point faible
  weakOrb(ctx, cx - 1, base - 50, 25, rage ? 1.2 : 1, true, 3.6, 2.3);
}

/**
 * Blob-roi (rejeton du gardien, grand marcheur de la Jungle à l'échelle ≈ 3 avec une couronne).
 * Images : voir BLOB_POSE ; opts.rage = phase 2 (plus vif, bord agité, veines et gouttes). La fuite (6) est pâle.
 */
export function drawBlobKing(ctx: Ctx, theme: ThemeId, frame: number, opts: { rage?: boolean } = {}): void {
  void theme;
  const rage = !!opts.rage;
  if (frame === BLOB_POSE.flat) return blobFlat(ctx, rage);
  const flee = frame === BLOB_POSE.flee;
  const p = flee ? BLOB_FLEE : BLOB_POSES[Math.max(0, Math.min(4, frame))];
  const J = flee ? JELLY_PALE : rage ? JELLY_RAGE : JELLY;
  const { cx } = BLOB_KING;
  const base = BLOB_KING.base - p.lift;
  const { w, h, lean } = p;
  // Derrière le corps
  if (frame === BLOB_POSE.squash) {
    softDot(ctx, cx - w / 2 + 2, BLOB_KING.base - 6, 18, '#b9a6e0', 0.55);
    softDot(ctx, cx + w / 2 - 2, BLOB_KING.base - 6, 18, '#b9a6e0', 0.55);
  }
  if (frame === BLOB_POSE.leap) {
    ctx.strokeStyle = 'rgba(220,255,190,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const dx of [-34, -12, 16, 38]) {
      ctx.moveTo(cx + dx, base - 2);
      ctx.lineTo(cx + dx * 1.1, base + 10);
    }
    ctx.stroke();
  }
  if (flee) {
    ctx.strokeStyle = 'rgba(220,255,200,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [y, len] of [
      [70, 26],
      [46, 34],
      [22, 22],
    ] as const) {
      ctx.moveTo(cx - w / 2 - 34, base - y);
      ctx.lineTo(cx - w / 2 - 34 + len, base - y);
    }
    ctx.stroke();
    fillOutlined(ctx, ellipse(cx - w / 2 - 22, base - 5, 9, 5), J.mid, J.line, 2.4);
  }
  const path = jellyPath(cx, base, w, h, lean, rage && !flee ? 3.2 : 0, frame * 2.3);
  jellyFill(ctx, path, jellyGrad(ctx, cx, base, w, h, lean, J), J, rage ? 20 : flee ? 8 : 16);
  ctx.save();
  ctx.clip(path);
  jellyInside(ctx, cx, base, w, h, lean, J, rage && !flee, frame);
  ctx.restore();
  rimLight(ctx, path, J.rim, 4, -3, -3.5);
  jellyShine(ctx, cx, base, w, h, lean);
  blobFace(ctx, cx + lean, base, w, h, p.face, J, rage && !flee);
  crown(ctx, cx + lean * (flee ? 0.2 : 0.9) - (flee ? 14 : 0), base - h + 12 + p.crownDy, p.tilt, flee);
  // Devant le corps
  if (frame === BLOB_POSE.squash) {
    ctx.strokeStyle = 'rgba(210,255,170,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      for (const d of [8, 17]) {
        const x = cx + s * (w / 2 + d);
        ctx.moveTo(x, BLOB_KING.base - 50 + d);
        ctx.quadraticCurveTo(x + s * 6, BLOB_KING.base - 36, x, BLOB_KING.base - 22 - d * 0.3);
      }
    }
    ctx.stroke();
  }
  if (frame === BLOB_POSE.leap) {
    blobDrop(ctx, cx - 24, base + 6, 3.6, -Math.PI / 2, J);
    blobDrop(ctx, cx + 12, base + 9, 3, -Math.PI / 2, J);
    blobDrop(ctx, cx + 32, base + 4, 2.6, -Math.PI / 2, J);
  }
  if (rage && !flee) {
    // Gouttes projetées (écart borné : elles restent dans l'image)
    const ww = Math.min(w, 150);
    blobDrop(ctx, cx - ww * 0.46, base - h * 0.95, 4, 0.9, J);
    blobDrop(ctx, cx + ww * 0.52 + lean, base - h * 0.92, 3.6, 2.3, J);
    blobDrop(ctx, cx - ww * 0.6, base - h * 0.5, 3.2, 0.2, J);
    blobDrop(ctx, cx + ww * 0.62, base - h * 0.42, 3, 2.9, J);
    softDot(ctx, cx - w * 0.2, base - h - 6, 10, '#ffffff', 0.25);
    softDot(ctx, cx + w * 0.3, base - h - 2, 8, '#ffffff', 0.2);
  }
  if (flee) {
    for (const [x, y, r] of [
      [-40, -h - 8, 4],
      [-58, -h + 10, 3.4],
    ] as const) {
      fillOutlined(ctx, dropPath(cx + x, base + y, r, 0.75), '#c8fdff', '#0a3a4a', 2);
    }
  }
}

/** Onde de choc du Blob-roi au sol : images de 96x56, pieds au milieu du bas ; symétrique (pas de flipX). */
export const BLOB_WAVE = { w: 96, h: 56, base: 55, crest: 40 } as const;

/** Onde de choc (atterrissage du Blob-roi) : vague de gelée qui file au ras du sol, 2 images (crête qui ondule). */
export function drawBlobWave(ctx: Ctx, theme: ThemeId, frame: number): void {
  void theme;
  const J = JELLY_RAGE;
  const { w, base } = BLOB_WAVE;
  const cx = w / 2;
  const h = BLOB_WAVE.crest + (frame % 2 === 0 ? 0 : 5);
  softDot(ctx, cx, base - 12, 44, J.mid, 0.32);
  const p = new Path2D();
  p.moveTo(3, base);
  p.bezierCurveTo(18, base - 3, 28, base - h * 0.5, cx - 8, base - h + 3);
  p.quadraticCurveTo(cx, base - h - 3, cx + 8, base - h + 3);
  p.bezierCurveTo(w - 28, base - h * 0.5, w - 18, base - 3, w - 3, base);
  p.closePath();
  fillOutlined(ctx, p, linGrad(ctx, 0, base - h, 0, base, [[0, J.light], [0.45, J.mid], [1, J.dark]]), J.line, 2.6);
  rimLight(ctx, p, J.rim, 3, 0, -2);
  // Traits de vitesse et bulles dans la vague, gouttes au-dessus de la crête
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = J.bubble;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (const [dx, y, len] of [
      [14, 16, 12],
      [22, 28, 10],
    ] as const) {
      const x = cx + s * (dx + frame * 3);
      ctx.moveTo(x, base - y);
      ctx.lineTo(x + s * len, base - y + 6);
    }
  }
  ctx.stroke();
  ctx.restore();
  glowDot(ctx, cx - 18, base - 10, 2.2, J.dot);
  glowDot(ctx, cx + 18, base - 10, 2.2, J.dot);
  blobDrop(ctx, cx - 10 - frame * 3, base - h - 6, 3, -Math.PI / 2 - 0.4, J);
  blobDrop(ctx, cx + 12 + frame * 3, base - h - 3, 2.6, -Math.PI / 2 + 0.4, J);
}

function blobBoxes(rage: boolean): BossFrameBoxes[] {
  const out: BossFrameBoxes[] = [];
  const n = rage ? 7 : 6;
  for (let i = 0; i < n; i++) {
    if (i === BLOB_POSE.flat) {
      // Flaque basse (30 px) : le tir de Kaï debout (38 px) passe au-dessus et atteint le noyau ; accroupi, il s'y arrête.
      out.push({ weak: [box(-31, -80, 60, 60)], hurt: NONE, armor: [box(-104, -30, 208, 30)] });
      continue;
    }
    const p = i === BLOB_POSE.flee ? BLOB_FLEE : BLOB_POSES[i];
    const top = -(p.h + p.lift);
    const body = box(-p.w / 2 + 6 + Math.min(0, p.lean), top + 6, p.w - 12 + Math.abs(p.lean), p.h - 6);
    const crownBox = box(p.lean * 0.9 - 26, top + 12 + p.crownDy - 32, 52, 32);
    out.push(i === BLOB_POSE.flee ? { weak: NONE, hurt: NONE, armor: [body] } : { weak: NONE, hurt: [body, crownBox], armor: [body] });
  }
  return out;
}

// ================================================================ Scarabée-titan (mini-boss du niveau 2)

/** Scarabée-titan : images de 248x184 ; origine = pieds en (footX, base). */
export const BEETLE_TITAN = { w: 248, h: 184, footX: 124, base: 172 } as const;
/** Index des images : 0-3 marche, 4 charge tête basse, 5 assommé sur le dos (ventre exposé), 6 tir renvoyé, 7 fuite. */
export const BEETLE_POSE = { walk: [0, 1, 2, 3], charge: 4, stunned: 5, deflect: 6, flee: 7 } as const;

// Dessiné dans les unités du scarabée de base (image 72x56), agrandies TS fois.
const TS = 3;
const TOX = 6;
const TOY = 8.5;
/** Épaisseur en px → unités du dessin. */
const U = (px: number) => px / TS;

type TitanMood = 'angry' | 'rage' | 'charge' | 'panic';

function titanLeg(ctx: Ctx, ax: number, ay: number, kx: number, ky: number, fx: number, fy: number, far: boolean): void {
  const col = far ? '#2a1446' : '#4a2a7a';
  limb(ctx, ax, ay, kx, ky, far ? 3 : 3.8, col, OUT, U(3.5));
  limb(ctx, kx, ky, fx, fy, far ? 2.4 : 3, col, OUT, U(3.5));
  if (!far) {
    ctx.strokeStyle = 'rgba(190,150,255,0.85)';
    ctx.lineWidth = U(2.5);
    ctx.beginPath();
    ctx.moveTo(ax, ay - 1);
    ctx.lineTo(kx, ky - 1);
    ctx.stroke();
  }
  // Épine au genou, griffe
  const nx = kx - ax;
  const ny = ky - ay;
  const nl = Math.hypot(nx, ny) || 1;
  const sx = kx - (ny / nl) * 3.6;
  const sy = ky + (nx / nl) * 3.6 - 1.4;
  fillOutlined(ctx, poly([kx - 1.3, ky - 0.2, sx, sy, kx + 1.3, ky + 0.4]), far ? '#3a2060' : '#9a6ae0', OUT, U(2.5));
  fillOutlined(ctx, circle(fx, fy, 1.5), far ? '#5a3a20' : '#ffcc33', OUT, U(2.5));
}

const TITAN_LEGS: readonly (readonly [number, number, number])[] = [
  [22, -9, -14],
  [33, -1, 0],
  [44, 8, 14],
];

function titanWalkLegs(ctx: Ctx, ay: number, ph: number, far: boolean, stride = 1): void {
  for (let i = 0; i < TITAN_LEGS.length; i++) {
    const [ax0, kdx, fdx] = TITAN_LEGS[i];
    const p2 = ph + (i % 2 ? Math.PI : 0) + (far ? Math.PI : 0);
    const swing = Math.sin(p2) * 4 * stride;
    const lift = Math.max(0, Math.cos(p2)) * 3 * stride;
    const ax = ax0 + (far ? -2 : 0);
    titanLeg(ctx, ax, ay, ax + kdx + swing * 0.5, ay - 6 - lift * 0.6, ax + fdx + swing, 54.5 - lift, far);
  }
}

/** gb : facteur des halos (réduit quand le corps frôle le bord de l'image). */
function titanHead(ctx: Ctx, hx: number, hy: number, mood: TitanMood, gb = 1): void {
  // Corne basse
  const horn = new Path2D();
  horn.moveTo(hx - 1, hy - 5);
  horn.quadraticCurveTo(hx + 9, hy - 8, hx + 11, hy - 19);
  horn.quadraticCurveTo(hx + 14.5, hy - 7, hx + 6, hy + 1);
  horn.closePath();
  const hg = linGrad(ctx, hx, hy, hx + 11, hy - 19, [
    [0, '#7a4a20'],
    [0.5, '#ffb52e'],
    [1, '#fff0a0'],
  ]);
  glow(ctx, 'rgba(255,200,60,0.85)', 12 * gb, () => fillOutlined(ctx, horn, hg, OUT, U(4.5)));
  const head = ellipse(hx, hy, 10.5, 9);
  fillOutlined(ctx, head, sphereGrad(ctx, hx, hy, 10.5, '#b48cff', '#5a2aa0', '#1e0c3a'), OUT, U(5));
  rimLight(ctx, head, 'rgba(200,170,255,0.85)', U(4), -U(3.5), U(3.5));
  // Œil
  if (mood === 'panic') {
    fillOutlined(ctx, circle(hx + 4.5, hy - 1.5, 3), '#ffffff', OUT, U(3));
    ctx.fillStyle = '#120a1c';
    ctx.fill(circle(hx + 3.3, hy - 1.6, 1));
  } else {
    const col = mood === 'angry' ? '#ffb02e' : '#ff4a3a';
    if (mood === 'charge') softDot(ctx, hx - 1, hy - 1.5, 7, col, 0.55);
    glowDot(ctx, hx + 4.5, hy - 1.5, 2.6, col);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = U(4.5);
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, hy - 5.8);
    ctx.lineTo(hx + 7.5, hy - 3.6);
    ctx.stroke();
  }
  // Mandibule
  ctx.strokeStyle = OUT;
  ctx.lineWidth = U(10);
  ctx.beginPath();
  ctx.moveTo(hx + 6, hy + 4);
  ctx.quadraticCurveTo(hx + 12, hy + 5, hx + 11, hy + 10);
  ctx.stroke();
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = U(4.5);
  ctx.stroke();
}

function titanShellPath(bob: number): Path2D {
  const s = new Path2D();
  s.moveTo(8, 45 + bob);
  s.bezierCurveTo(5, 20 + bob, 21, 8 + bob, 34, 8 + bob);
  s.bezierCurveTo(49, 8 + bob, 59, 21 + bob, 57, 44 + bob);
  s.quadraticCurveTo(33, 50 + bob, 8, 45 + bob);
  s.closePath();
  return s;
}

function shellGrad(ctx: Ctx, bob: number): CanvasGradient {
  const g = ctx.createLinearGradient(12, 10 + bob, 52, 47 + bob);
  g.addColorStop(0, '#5affd8');
  g.addColorStop(0.3, '#2a8aff');
  g.addColorStop(0.62, '#6a2ad0');
  g.addColorStop(1, '#240a4a');
  return g;
}

/** Fissures de la carapace (phase 2) : sombres, lumière magenta dedans, éclat manquant. À dessiner découpé. */
function titanCracks(ctx: Ctx, bob: number, flip: boolean): void {
  const lines = [
    [19, 11, 23, 18, 20, 24, 25, 30, 22, 36],
    [41, 10, 38, 17, 43, 23, 40, 30],
    [9, 33, 15, 35, 13, 41],
    [50, 18, 46, 24, 52, 30],
  ];
  const fy = (v: number) => (flip ? 63 - v : v) + bob;
  const p = new Path2D();
  for (const l of lines) {
    p.moveTo(l[0], fy(l[1]));
    for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], fy(l[i + 1]));
  }
  ctx.strokeStyle = '#12041e';
  ctx.lineWidth = U(8);
  ctx.stroke(p);
  glow(ctx, CORE, 10, () => {
    ctx.strokeStyle = '#ff8ae8';
    ctx.lineWidth = U(2.6);
    ctx.stroke(p);
  });
  const chip = poly([7, fy(27), 12, fy(19), 17, fy(22), 15, fy(28), 9, fy(31)]);
  ctx.fillStyle = '#14082a';
  ctx.fill(chip);
  ctx.strokeStyle = 'rgba(120,200,255,0.7)';
  ctx.lineWidth = U(2);
  ctx.stroke(chip);
}

function titanShell(ctx: Ctx, bob: number, cracked: boolean, flash: boolean, gb = 1): void {
  fillOutlined(ctx, ellipse(33, 45 + bob, 23, 5), '#1c0e30', OUT, U(4));
  const shell = titanShellPath(bob);
  const g = shellGrad(ctx, bob);
  glow(ctx, 'rgba(80,180,255,0.7)', 16 * gb, () => {
    ctx.fillStyle = g;
    ctx.fill(shell);
  });
  fillOutlined(ctx, shell, g, OUT, U(6));
  ctx.save();
  ctx.clip(shell);
  // Bord doré
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(7, 44 + bob);
  ctx.quadraticCurveTo(33, 50.5 + bob, 58, 43 + bob);
  ctx.stroke();
  // Plaques d'armure : arêtes dorées parallèles au dôme
  for (const f of [0.74, 0.5]) {
    ctx.save();
    ctx.translate(33, 47 + bob);
    ctx.scale(f, f);
    ctx.translate(-33, -(47 + bob));
    const ridge = new Path2D();
    ridge.moveTo(8, 45 + bob);
    ridge.bezierCurveTo(5, 20 + bob, 21, 8 + bob, 34, 8 + bob);
    ridge.bezierCurveTo(49, 8 + bob, 59, 21 + bob, 57, 44 + bob);
    ctx.strokeStyle = 'rgba(16,6,40,0.6)';
    ctx.lineWidth = U(6) / f;
    ctx.stroke(ridge);
    ctx.strokeStyle = 'rgba(255,214,90,0.85)';
    ctx.lineWidth = U(2.4) / f;
    ctx.stroke(ridge);
    ctx.restore();
  }
  // Séparation des élytres
  ctx.strokeStyle = 'rgba(16,6,40,0.75)';
  ctx.lineWidth = U(4.5);
  ctx.beginPath();
  ctx.moveTo(44, 14 + bob);
  ctx.quadraticCurveTo(30, 22 + bob, 12, 40 + bob);
  ctx.stroke();
  // Taches dorées, marque magenta du gardien, points bioluminescents le long du bord
  glowDot(ctx, 22, 25 + bob, 2.1, '#ffcc33');
  glowDot(ctx, 39, 31 + bob, 1.8, '#ffcc33');
  glowDot(ctx, 31, 16.5 + bob, 2.2, CORE);
  for (let k = 0; k < 6; k++) glowDot(ctx, 13 + k * 7.5, 38.6 + bob + Math.sin((k / 5) * Math.PI) * 2.6, 1.15, '#3dffe0');
  if (cracked) titanCracks(ctx, bob, false);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fill(ellipse(25, 16 + bob, 9, 3, -0.35));
  if (flash) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, 80, 60);
  }
  ctx.restore();
  rimLight(ctx, shell, flash ? 'rgba(255,255,255,0.95)' : 'rgba(180,255,255,0.65)', flash ? U(7) : U(4.5), -U(4), -U(5));
}

/** Pronotum et grande corne (au-dessus de la tête) ; cassée en phase 2. */
function titanHorn(ctx: Ctx, bob: number, cracked: boolean, gb = 1): void {
  // Pronotum : plaque irisée, comme la carapace
  const pr = ellipse(50, 27 + bob, 6.5, 8.5, 0.35);
  fillOutlined(ctx, pr, sphereGrad(ctx, 48, 23 + bob, 9, '#8af4ff', '#3a7aff', '#3a1a9a'), OUT, U(5));
  rimLight(ctx, pr, 'rgba(200,255,255,0.7)', U(3.5), -U(3), -U(3));
  ctx.strokeStyle = 'rgba(255,204,51,0.9)';
  ctx.lineWidth = U(2.5);
  ctx.beginPath();
  ctx.ellipse(50, 27 + bob, 5.2, 7.2, 0.35, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  const h = new Path2D();
  h.moveTo(44, 22 + bob);
  if (cracked) {
    h.bezierCurveTo(50, 9 + bob, 58, 6 + bob, 66, 7.5 + bob);
    h.lineTo(67.6, 10 + bob);
    h.lineTo(65.6, 10.6 + bob);
    h.lineTo(66.8, 12.6 + bob);
    h.bezierCurveTo(60, 12 + bob, 55, 15.5 + bob, 52, 28 + bob);
  } else {
    h.bezierCurveTo(50, 9 + bob, 62, 5 + bob, 74, 12 + bob);
    h.bezierCurveTo(64, 10.5 + bob, 56, 15 + bob, 52, 28 + bob);
  }
  h.closePath();
  const g = linGrad(ctx, 44, 24 + bob, 74, 11 + bob, [
    [0, '#7a4a20'],
    [0.5, '#ffb52e'],
    [1, '#fff3b0'],
  ]);
  glow(ctx, 'rgba(255,200,60,0.85)', 12 * gb, () => fillOutlined(ctx, h, g, OUT, U(4.5)));
  for (const x of [57.5, 62]) fillOutlined(ctx, poly([x - 1.3, 12.6 + bob, x + 0.2, 16 + bob, x + 1.3, 12.2 + bob]), '#ffe08a', OUT, U(2));
  ctx.strokeStyle = 'rgba(255,255,230,0.85)';
  ctx.lineWidth = U(2);
  ctx.beginPath();
  ctx.moveTo(47, 17 + bob);
  ctx.bezierCurveTo(52, 10 + bob, 57, 8 + bob, 63, 8 + bob);
  ctx.stroke();
}

function titanWalk(ctx: Ctx, frame: number, cracked: boolean, deflect: boolean): void {
  const ph = (frame / 4) * TAU;
  const bob = -Math.abs(Math.sin(ph)) * 1.2;
  titanWalkLegs(ctx, 43 + bob, ph, true);
  titanHead(ctx, 57, 37 + bob, cracked ? 'rage' : 'angry');
  titanShell(ctx, bob, cracked, deflect);
  titanHorn(ctx, bob, cracked);
  titanWalkLegs(ctx, 45 + bob, ph, false);
  if (deflect) titanSpark(ctx, 55, 29 + bob);
}

/** Tir renvoyé par la carapace : étoile, arcs, trait qui repart vers le haut. */
function titanSpark(ctx: Ctx, x: number, y: number): void {
  softDot(ctx, x, y, 18, '#3ff0ff', 0.55);
  softDot(ctx, x, y, 10, '#ffffff', 0.85);
  glow(ctx, '#3ff0ff', 14, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fill(starPath(x, y, 11, 1.6, 4));
    ctx.fill(starPath(x, y, 6.5, 1.3, 4, -Math.PI / 4));
  });
  ctx.strokeStyle = 'rgba(200,255,255,0.85)';
  ctx.lineWidth = U(3);
  ctx.beginPath();
  ctx.arc(x, y, 8.5, -2.5, -1.3);
  ctx.moveTo(x + Math.cos(0.5) * 12, y + Math.sin(0.5) * 12);
  ctx.arc(x, y, 12, 0.5, 1.4);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,250,255,0.8)';
  ctx.lineWidth = U(5);
  ctx.beginPath();
  ctx.moveTo(x + 3, y - 3);
  ctx.lineTo(x + 14, y - 12);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = U(2);
  ctx.stroke();
}

function titanCharge(ctx: Ctx, cracked: boolean): void {
  ctx.save();
  ctx.translate(-4, 0);
  // Traînées de vitesse et poussière derrière
  ctx.strokeStyle = 'rgba(160,240,255,0.6)';
  ctx.lineWidth = U(3.5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [y, x0, x1] of [
    [12, 14, 26],
    [21, 6, 16],
    [29, 3, 11],
    [36, 6, 12],
  ] as const) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  for (const [x, y, r] of [
    [12, 52, 4.5],
    [8, 49.5, 3.4],
    [17, 53, 2.6],
  ] as const) {
    softDot(ctx, x, y, r * 1.8, '#b9a6e0', 0.7);
  }
  // Pattes : arrière qui pousse, avant tendue (repère non tourné, attaches suivant le corps incliné)
  titanLeg(ctx, 23, 37.5, 14, 34, 5, 54.5, true);
  titanLeg(ctx, 34, 39.5, 30, 36, 24, 54.5, true);
  titanLeg(ctx, 44.5, 41.5, 52, 37.5, 59, 54, true);
  // Corps incliné, tête basse
  ctx.save();
  ctx.translate(52, 54);
  ctx.rotate(0.18);
  ctx.translate(-52, -54);
  titanHead(ctx, 57, 37, 'charge', 0.5);
  titanShell(ctx, 0, cracked, false, 0.5);
  titanHorn(ctx, 0, cracked, 0.5);
  ctx.restore();
  titanLeg(ctx, 24.5, 39.5, 15, 36, 7, 54.5, false);
  titanLeg(ctx, 35.5, 41.5, 33, 38, 28, 54.5, false);
  titanLeg(ctx, 46.5, 43.5, 55, 39.5, 62, 53.5, false);
  ctx.restore();
}

function titanStunned(ctx: Ctx, cracked: boolean): void {
  ctx.save();
  ctx.translate(34, 54);
  ctx.rotate(0.1);
  ctx.translate(-34, -54);
  // Pattes lointaines, en l'air
  titanLeg(ctx, 18, 16, 12, 6, 7, 10, true);
  titanLeg(ctx, 31, 13, 28, 3.5, 23, 2, true);
  titanLeg(ctx, 45, 15, 51, 5.5, 56, 8.5, true);
  // Cornes plantées au sol, tête renversée
  const horn = new Path2D();
  horn.moveTo(58, 38);
  horn.quadraticCurveTo(66, 41, 72, 52.5);
  horn.quadraticCurveTo(66, 46, 60, 45);
  horn.closePath();
  glow(ctx, 'rgba(255,200,60,0.8)', 10, () =>
    fillOutlined(
      ctx,
      horn,
      linGrad(ctx, 58, 38, 72, 52, [
        [0, '#7a4a20'],
        [0.5, '#ffb52e'],
        [1, '#fff0a0'],
      ]),
      OUT,
      U(4.5),
    ),
  );
  const big = new Path2D();
  big.moveTo(55, 42);
  if (cracked) {
    big.quadraticCurveTo(64, 42, 70, 45);
    big.lineTo(69, 47);
    big.lineTo(70.5, 48);
    big.quadraticCurveTo(63, 48, 56, 49);
  } else {
    big.quadraticCurveTo(66, 41, 75, 46);
    big.quadraticCurveTo(66, 47, 56, 49);
  }
  big.closePath();
  glow(ctx, 'rgba(255,200,60,0.8)', 10, () =>
    fillOutlined(
      ctx,
      big,
      linGrad(ctx, 55, 45, 78, 46, [
        [0, '#7a4a20'],
        [0.5, '#ffb52e'],
        [1, '#fff3b0'],
      ]),
      OUT,
      U(4.5),
    ),
  );
  const head = ellipse(61, 33, 9.5, 8.5, 0.3);
  fillOutlined(ctx, head, sphereGrad(ctx, 60, 31, 9.5, '#b48cff', '#5a2aa0', '#1e0c3a'), OUT, U(5));
  dizzyEye(ctx, 64, 32, 3.2, U(2.6));
  // Dôme de la carapace, à l'envers
  const dome = new Path2D();
  dome.moveTo(8, 26);
  dome.bezierCurveTo(6, 45, 20, 55, 34, 55);
  dome.bezierCurveTo(48, 55, 61, 45, 59, 26);
  dome.quadraticCurveTo(33, 21, 8, 26);
  dome.closePath();
  const dg = linGrad(ctx, 0, 22, 0, 55, [
    [0, '#5a9aff'],
    [0.35, '#3a5ae0'],
    [0.7, '#4a1ab0'],
    [1, '#1e0840'],
  ]);
  glow(ctx, 'rgba(80,180,255,0.6)', 8, () => {
    ctx.fillStyle = dg;
    ctx.fill(dome);
  });
  fillOutlined(ctx, dome, dg, OUT, U(6));
  ctx.save();
  ctx.clip(dome);
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(7, 27);
  ctx.quadraticCurveTo(33, 20.5, 60, 27);
  ctx.stroke();
  for (let k = 0; k < 6; k++) glowDot(ctx, 13 + k * 7.5, 31.5 - Math.sin((k / 5) * Math.PI) * 1.6, 1.1, '#3dffe0');
  if (cracked) titanCracks(ctx, 0, true);
  ctx.restore();
  rimLight(ctx, dome, 'rgba(180,255,255,0.55)', U(4.5), U(4), -U(5));
  // VENTRE exposé, tourné vers le haut : le point faible
  const belly = new Path2D();
  belly.moveTo(9.5, 25.5);
  belly.bezierCurveTo(12, 11, 25, 7.5, 34, 7.5);
  belly.bezierCurveTo(44, 7.5, 56, 11, 57.5, 25.5);
  belly.quadraticCurveTo(33, 20.5, 9.5, 25.5);
  belly.closePath();
  softDot(ctx, 34, 16, 18, CORE, 0.5);
  glow(ctx, CORE, 26, () => {
    ctx.fillStyle = '#ff6ae0';
    ctx.fill(belly);
  });
  fillOutlined(ctx, belly, sphereGrad(ctx, 28, 11, 28, '#fff2fc', '#ff86e2', '#b0187e'), OUT, U(5.5));
  ctx.save();
  ctx.clip(belly);
  ctx.strokeStyle = 'rgba(140,10,100,0.6)';
  ctx.lineWidth = U(3);
  ctx.beginPath();
  for (const x of [17, 25, 33, 41, 49]) {
    ctx.moveTo(x, 6);
    ctx.quadraticCurveTo(x - 1.5, 15, x, 25);
  }
  ctx.stroke();
  for (const x of [21, 29, 37, 45]) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill(ellipse(x, 12 + Math.abs(x - 33) * 0.18, 1.8, 0.9));
  }
  softDot(ctx, 33, 15, 9, '#ffffff', 0.7);
  ctx.restore();
  rimLight(ctx, belly, 'rgba(255,255,255,0.8)', U(4), U(3), U(4));
  // Pattes proches, qui gigotent
  titanLeg(ctx, 16, 15, 9, 8, 4, 13, false);
  titanLeg(ctx, 30, 12, 33, 2.5, 38, 0.5, false);
  titanLeg(ctx, 44, 13, 50, 4, 57, 9.5, false);
  ctx.restore();
  // Étoiles qui tournent au-dessus de la tête
  ctx.strokeStyle = 'rgba(255,240,150,0.55)';
  ctx.lineWidth = U(2);
  ctx.beginPath();
  ctx.ellipse(66, 19, 8, 3, 0, 0, TAU);
  ctx.stroke();
  for (const a of [0.4, 2.5, 4.4]) {
    const x = 66 + Math.cos(a) * 8;
    const y = 19 + Math.sin(a) * 3;
    glow(ctx, 'rgba(255,230,90,0.9)', 8, () => fillOutlined(ctx, starPath(x, y, 2.8, 1.2, 5), '#ffe066', OUT, U(2.5)));
  }
}

function titanFlee(ctx: Ctx): void {
  // Traînées et poussière derrière
  ctx.strokeStyle = 'rgba(200,190,255,0.55)';
  ctx.lineWidth = U(3);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [y, x0, x1] of [
    [18, 0, 7],
    [28, -1, 5],
    [38, 0, 6],
  ] as const) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  for (const [x, y, r] of [
    [8, 52, 4.2],
    [4, 50, 3],
  ] as const) {
    softDot(ctx, x, y, r * 1.8, '#b9a6e0', 0.65);
  }
  // Arcs de mouvement sous le ventre
  ctx.strokeStyle = 'rgba(190,150,255,0.45)';
  ctx.lineWidth = U(3);
  ctx.beginPath();
  for (const cx of [20, 34, 48]) {
    ctx.moveTo(cx - 6, 54);
    ctx.quadraticCurveTo(cx, 49, cx + 6, 54);
  }
  ctx.stroke();
  // Cabré autour des pattes arrière (elles restent au sol, l'avant se lève)
  ctx.save();
  ctx.translate(10, 54.5);
  ctx.rotate(-0.08);
  ctx.translate(-10, -54.5);
  titanWalkLegs(ctx, 43, 1.1, true, 1.4);
  titanHead(ctx, 57, 37, 'panic');
  titanShell(ctx, 0, true, false);
  titanHorn(ctx, 0, true);
  titanWalkLegs(ctx, 45, 1.1, false, 1.4);
  ctx.restore();
  // Gouttes de sueur
  for (const [x, y, r] of [
    [44, 4, 1.6],
    [37, 1.5, 1.3],
  ] as const) {
    fillOutlined(ctx, dropPath(x, y, r, 0.9), '#c8fdff', '#0a3a4a', U(2));
  }
}

/**
 * Scarabée-titan (rejeton du gardien, grand blindé de la Jungle à l'échelle ≈ 3, double corne).
 * Images : voir BEETLE_POSE ; opts.cracked = phase 2 (carapace fendue, grande corne cassée, œil rouge). La fuite
 * (7) est toujours fendue.
 */
export function drawBeetleTitan(ctx: Ctx, theme: ThemeId, frame: number, opts: { cracked?: boolean } = {}): void {
  void theme;
  const cracked = !!opts.cracked || frame === BEETLE_POSE.flee;
  ctx.save();
  ctx.translate(TOX, TOY);
  ctx.scale(TS, TS);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (frame <= 3) titanWalk(ctx, frame, cracked, false);
  else if (frame === BEETLE_POSE.charge) titanCharge(ctx, cracked);
  else if (frame === BEETLE_POSE.stunned) titanStunned(ctx, cracked);
  else if (frame === BEETLE_POSE.deflect) titanWalk(ctx, 0, cracked, true);
  else titanFlee(ctx);
  ctx.restore();
}

/** Boîte en unités du dessin du titan → px relatifs à l'origine. */
function tb(u0: number, v0: number, u1: number, v1: number): BossBox {
  return box(TOX + u0 * TS - BEETLE_TITAN.footX, TOY + v0 * TS - BEETLE_TITAN.base, (u1 - u0) * TS, (v1 - v0) * TS);
}

function beetleBoxes(cracked: boolean): BossFrameBoxes[] {
  const shell = tb(6, 7, 58, 50);
  const front = tb(46, 5, 76, 47);
  const walk: BossFrameBoxes = { weak: NONE, hurt: [tb(4, 7, 58, 55), front], armor: [shell, front] };
  const out: BossFrameBoxes[] = [walk, walk, walk, walk];
  // Charge : corps incliné, tête basse, décalé de 4 unités vers la gauche
  out.push({ weak: NONE, hurt: [tb(2, 4, 57, 55), tb(45, 13, 79, 52)], armor: [tb(5, 4, 57, 47), tb(45, 13, 79, 52)] });
  out.push({ weak: [tb(12, 7, 61, 28)], hurt: NONE, armor: [tb(7, 25, 63, 56), tb(58, 30, 79, 54)] });
  out.push(walk);
  if (cracked) out.push({ weak: NONE, hurt: NONE, armor: [tb(6, 5, 58, 50)] });
  return out;
}

/** Cailloux de la phase 2 du titan : images de 96x64, origine au centre ; rayon du caillou. */
export const TITAN_ROCK = { w: 96, h: 64, r: 21 } as const;
/** 0 et 1 : caillou (deux formes) ; 2 : marque d'annonce au sol (posée sur la surface). */
export const ROCK_POSE = { rocks: [0, 1], mark: 2 } as const;

/** Caillou détaché par le choc du titan contre la barrière (sol de la Jungle, mousse dessus), ou sa marque au sol. */
export function drawTitanRock(ctx: Ctx, theme: ThemeId, frame: number): void {
  const P = PALETTES[theme];
  const cx = TITAN_ROCK.w / 2;
  const cy = TITAN_ROCK.h / 2;
  if (frame === ROCK_POSE.mark) {
    // Ambre (les spores de la méduse-baleine sont annoncées en vert) : ellipse en tirets, cœur vif, croix de visée.
    const col = '#ffb347';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.24);
    softDot(ctx, 0, 0, 44, col, 0.5);
    ctx.restore();
    ctx.setLineDash([9, 6]);
    ctx.strokeStyle = rgba(col, 0.95);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 10, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    glow(ctx, col, 10, () => {
      ctx.strokeStyle = '#ffe2b0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 5, 0, 0, TAU);
      ctx.stroke();
    });
    ctx.strokeStyle = '#fff1d6';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(cx + s * 28, cy);
      ctx.lineTo(cx + s * 36, cy);
    }
    ctx.stroke();
    glowDot(ctx, cx, cy, 2.4, '#ffffff');
    return;
  }
  const r = rng(frame === 0 ? 17 : 41);
  const R = TITAN_ROCK.r;
  const pts: number[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.5;
    const d = R * (0.82 + r() * 0.2);
    pts.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.88);
  }
  const rock = poly(pts);
  // Halo ambré, comme sa marque au sol : il se détache du ciel violet.
  softDot(ctx, cx, cy, R + 10, '#ffb347', 0.45);
  fillOutlined(ctx, rock, sphereGrad(ctx, cx, cy, R, mix(P.soilSpeck, '#ffffff', 0.25), P.soilSpeck, P.soil), OUT, 3);
  ctx.save();
  ctx.clip(rock);
  // Mousse lumineuse sur le dessus, éclats plus clairs, fissure.
  ctx.fillStyle = P.surface;
  ctx.fill(ellipse(cx - 3, cy - R * 0.95, R * 0.95, R * 0.42, -0.15));
  ctx.fillStyle = rgba(P.surfaceLight, 0.7);
  ctx.fill(ellipse(cx - 7, cy - R * 0.98, R * 0.5, R * 0.18, -0.15));
  for (let i = 0; i < 4; i++) softDot(ctx, cx + (r() - 0.5) * R * 1.2, cy + r() * R * 0.6, 2.2, P.soilSpeck, 0.9);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + (frame === 0 ? 6 : -8), cy - 4);
  ctx.lineTo(cx + (frame === 0 ? 1 : -3), cy + 4);
  ctx.lineTo(cx + (frame === 0 ? 7 : -9), cy + 12);
  ctx.stroke();
  ctx.restore();
  rimLight(ctx, rock, rgba('#ffd9a0', 0.8), 2.5, -2, -3);
  glowDot(ctx, cx + (frame === 0 ? -9 : 8), cy + 5, 1.8, P.vein);
}

// ================================================================ Méduse-baleine (gardien du niveau 3)

/**
 * Repère du dessin de la méduse-baleine (échelle 1) et attaches des tentacules : mêmes valeurs que WHALE
 * (backgrounds.ts), recopiées pour que le décor puisse importer drawWhaleBody sans import circulaire.
 */
export const WHALE_SHAPE = { w: 460, h: 240, tentacles: [130, 170, 205, 240, 275, 310, 350], tentY: 168 } as const;
const WHALE = WHALE_SHAPE;

const WS = 1.1;
const WPAD = 12;
const WW = Math.ceil(WHALE.w * WS) + WPAD * 2;
const WH = Math.ceil(WHALE.h * WS) + WPAD * 2;

/** Point du dessin de WHALE (décor, échelle 1) → px relatifs à l'origine (centre) d'une image du boss. */
function wrel(x: number, y: number): { x: number; y: number } {
  return { x: Math.round((WPAD + x * WS - WW / 2) * 10) / 10, y: Math.round((WPAD + y * WS - WH / 2) * 10) / 10 };
}

function wbox(x0: number, y0: number, x1: number, y1: number): BossBox {
  const a = wrel(x0, y0);
  return box(a.x, a.y, (x1 - x0) * WS, (y1 - y0) * WS);
}

/**
 * Corps de la méduse-baleine en boss (images de WW x WH = 531x288, origine au centre) : WHALE agrandi `scale`
 * (1,1) avec une marge `pad`, tourné vers la gauche. Points relatifs à l'origine : attaches des 7 tentacules
 * (mêmes que le décor), attache du cœur (sous le ventre), œil, bas de la jupe (à garder au-dessus de la tête de
 * Kaï au sommet d'un saut, sauf en plongée). `grey` : part de Vide de la planche par défaut (niveau 3 : 1).
 */
export const WHALE_BOSS = {
  scale: WS,
  pad: WPAD,
  w: WW,
  h: WH,
  grey: 1,
  tentacles: WHALE.tentacles.map((x) => wrel(x, WHALE.tentY)),
  heart: wrel(222, 172),
  eye: wrel(70, 108),
  skirtBottom: wrel(0, 194).y,
} as const;
/** Index des images du corps : 0 normal, 1 blessée, 2 défaite (immobile, grise qui se fissure, cri). */
export const WHALE_POSE = { idle: 0, hurt: 1, defeat: 2 } as const;

function whaleFinPath(): Path2D {
  const fin = new Path2D();
  fin.moveTo(150, 150);
  fin.bezierCurveTo(120, 190, 150, 230, 200, 228);
  fin.bezierCurveTo(190, 200, 205, 175, 215, 152);
  fin.closePath();
  return fin;
}

function whaleBodyPath(): Path2D {
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

function whaleSkirtPath(torn: boolean): Path2D {
  const skirt = new Path2D();
  skirt.moveTo(90, 160);
  for (let k = 0; k <= 10; k++) {
    const x = 90 + k * 30;
    if (torn && (k === 3 || k === 7)) {
      skirt.lineTo(x + 8, 176);
      skirt.lineTo(x + 13, 168);
      skirt.lineTo(x + 20, 181);
      skirt.lineTo(x + 30, 166);
    } else {
      skirt.quadraticCurveTo(x + 15, 188 + (k % 2) * 6, x + 30, 166);
    }
  }
  skirt.lineTo(390, 150);
  skirt.closePath();
  return skirt;
}

const WHALE_GASHES: readonly (readonly [number, number, number, number])[] = [
  [150, 82, -0.5, 26],
  [258, 104, -0.28, 30],
  [334, 86, -0.7, 20],
];

/** Remplissage et intérieur du corps (organes, ventre, rayures, entailles), éteints de k par le Vide. */
function whaleFill(ctx: Ctx, body: Path2D, k: number, solid: boolean, hurt: boolean, pal: ThemePalette): void {
  const g = ctx.createRadialGradient(170, 90, 10, 220, 110, 260);
  g.addColorStop(0, rgba(voided('#d2c8ff', k), solid ? 1 : 0.9));
  g.addColorStop(0.35, rgba(voided('#826eff', k), solid ? 0.97 : 0.75));
  g.addColorStop(0.75, rgba(voided('#4632be', k), solid ? 0.95 : 0.65));
  g.addColorStop(1, rgba(voided('#281478', k), solid ? 0.95 : 0.55));
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  softDot(ctx, 200, 110, 60, voided(pal.bioB, k), 0.35 * (1 - 0.4 * k));
  softDot(ctx, 270, 115, 40, voided(pal.bioA, k), 0.25 * (1 - 0.4 * k));
  ctx.fillStyle = rgba(voided('#1e0a5a', k), 0.35);
  ctx.beginPath();
  ctx.ellipse(220, 175, 220, 40, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(voided('#b4f0ff', k), 0.25);
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const x = 90 + i * 34;
    ctx.beginPath();
    ctx.moveTo(x, 150);
    ctx.quadraticCurveTo(x + 10, 120, x + 4, 95);
    ctx.stroke();
  }
  if (hurt) {
    // Entailles : la lumière de dedans perce, même sous le gris
    for (const [x, y, a, L] of WHALE_GASHES) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const p = new Path2D();
      p.moveTo(-L, 0);
      p.quadraticCurveTo(0, -7, L, 0);
      p.quadraticCurveTo(0, 7, -L, 0);
      p.closePath();
      fillOutlined(ctx, p, '#12041c', OUT, 2);
      glow(ctx, CORE, 10, () => {
        ctx.strokeStyle = '#ff9aee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-L * 0.8, 0);
        ctx.quadraticCurveTo(0, -1.5, L * 0.8, 0);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Taches du Vide : centre et rayon max (dessin WHALE) ; elles apparaissent dans cet ordre quand `grey` monte. */
const VOID_SPOTS: readonly (readonly [number, number, number])[] = [
  [150, 74, 34],
  [292, 98, 30],
  [98, 122, 24],
  [226, 134, 28],
  [356, 110, 22],
  [204, 62, 26],
  [116, 86, 22],
  [262, 66, 24],
  [328, 142, 20],
  [64, 98, 18],
];

/** Deux fissures noires en zigzag qui traversent la zone (x, y, r), courtes branches, reflet rouge, points rouges. */
function crackNet(ctx: Ctx, x: number, y: number, r: number, seed: number, g: number): void {
  const rr = rng(seed);
  const p = new Path2D();
  const ends: number[] = [];
  let a0 = rr() * Math.PI;
  for (let b = 0; b < 2; b++) {
    if (b === 1) a0 += 0.9 + rr() * 0.6;
    const mx = x + (rr() - 0.5) * r * 0.6;
    const my = y + (rr() - 0.5) * r * 0.6;
    let px = mx - Math.cos(a0) * r * 0.8;
    let py = my - Math.sin(a0) * r * 0.8;
    p.moveTo(px, py);
    for (let s = 0; s < 6; s++) {
      const a = a0 + (rr() - 0.5) * 1.2;
      const len = r * (0.22 + rr() * 0.1);
      px += Math.cos(a) * len;
      py += Math.sin(a) * len;
      p.lineTo(px, py);
      if ((s === 1 || s === 3) && rr() < 0.7) {
        const a2 = a + (rr() < 0.5 ? -1 : 1) * (0.8 + rr() * 0.5);
        const bx = px + Math.cos(a2) * len * 0.75;
        const by = py + Math.sin(a2) * len * 0.75;
        p.lineTo(bx, by);
        p.moveTo(px, py);
        ends.push(bx, by);
      }
    }
    ends.push(px, py);
  }
  ctx.save();
  ctx.translate(0.9, 0.9);
  ctx.strokeStyle = rgba(VOID_RED, 0.35 + 0.45 * smooth(0.3, 1, g));
  ctx.lineWidth = 1.6;
  ctx.stroke(p);
  ctx.restore();
  ctx.strokeStyle = '#07050a';
  ctx.lineWidth = 2.2;
  ctx.stroke(p);
  for (let i = 0; i < ends.length; i += 4) glowDot(ctx, ends[i], ends[i + 1], 1.2, VOID_RED);
}

/** Taches grises du Vide : le corps repeint en gris (opaque) dans les taches, puis fissures et reflets. */
function whaleVoid(ctx: Ctx, body: Path2D, g: number, hurt: boolean, pal: ThemePalette): void {
  const zones = new Path2D();
  const spots: number[] = [];
  for (let i = 0; i < VOID_SPOTS.length; i++) {
    const f = clamp01((g - (0.04 + i * 0.075)) / 0.25);
    if (f <= 0) continue;
    const [x, y, R] = VOID_SPOTS[i];
    const r = R * (0.35 + 0.65 * f);
    const rr = rng(610 + i);
    const pts: number[] = [];
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU;
      const d = r * (0.72 + rr() * 0.5);
      pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85);
    }
    zones.addPath(smoothPoly(pts));
    spots.push(x, y, r, i);
  }
  if (spots.length === 0) return;
  ctx.save();
  ctx.clip(body);
  ctx.clip(zones);
  whaleFill(ctx, body, 1, true, hurt, pal);
  for (let i = 0; i < spots.length; i += 4) crackNet(ctx, spots[i], spots[i + 1], spots[i + 2], 900 + spots[i + 3], g);
  ctx.restore();
}

/** Défaite : grandes fissures d'où sort la lumière (les couleurs reviendront à la libération), éclats qui tombent. */
function whaleDefeatCracks(ctx: Ctx, body: Path2D, pal: ThemePalette): void {
  const rr = rng(4242);
  const p = new Path2D();
  const lights: number[] = [];
  for (const [sx, sy] of [
    [78, 72],
    [168, 48],
    [252, 58],
    [334, 86],
    [122, 152],
    [232, 160],
    [306, 150],
    [404, 118],
  ] as const) {
    let x = sx;
    let y = sy;
    let a = Math.atan2(110 - y, 220 - x) + (rr() - 0.5) * 0.8;
    p.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      a += (rr() - 0.5) * 1;
      const len = 14 + rr() * 12;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      p.lineTo(x, y);
      if (s === 2) {
        const a2 = a + (rr() < 0.5 ? -1 : 1) * 0.9;
        p.lineTo(x + Math.cos(a2) * 16, y + Math.sin(a2) * 16);
        p.moveTo(x, y);
        lights.push(x, y);
      }
    }
  }
  ctx.save();
  ctx.clip(body);
  for (let i = 0; i < lights.length; i += 2) softDot(ctx, lights[i], lights[i + 1], 16, i % 4 === 0 ? pal.bioA : pal.bioB, 0.5);
  ctx.strokeStyle = '#06040a';
  ctx.lineWidth = 5;
  ctx.stroke(p);
  glow(ctx, '#9ffff6', 12, () => {
    ctx.strokeStyle = '#e6fffd';
    ctx.lineWidth = 1.8;
    ctx.stroke(p);
  });
  ctx.restore();
}

function whaleFlakes(ctx: Ctx): void {
  const rr = rng(77);
  for (const [x, y] of [
    [118, 206],
    [176, 224],
    [246, 212],
    [306, 230],
    [362, 204],
    [212, 236],
    [146, 232],
  ] as const) {
    const s = 4 + rr() * 4;
    const a = rr() * TAU;
    const pts: number[] = [];
    for (let j = 0; j < 3; j++) pts.push(x + Math.cos(a + j * 2.1) * s * (0.7 + rr() * 0.6), y + Math.sin(a + j * 2.1) * s * (0.7 + rr() * 0.6));
    fillOutlined(ctx, poly(pts), flakeGrey(rr()), OUT, 1.6);
  }
}

function flakeGrey(t: number): string {
  return mix('#6e6e7a', '#a4a4b0', t);
}

function whaleEye(ctx: Ctx, pal: ThemePalette, k: number, g: number, solid: boolean, hurt: boolean, defeat: boolean): void {
  const x = 70;
  const y = 108;
  if (solid) fillOutlined(ctx, ellipse(x, y, 9, 8), rgba('#14082e', 0.9), OUT, 2.5);
  if (defeat) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y - 4, 7, 0.45, Math.PI - 0.45);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,210,220,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    return;
  }
  const red = smooth(0.3, 0.8, g);
  glowDot(ctx, x, y, 4, red > 0 ? mix('#ffffff', '#ff4a5a', red) : '#ffffff');
  softDot(ctx, x, y, 14, red > 0 ? mix(voided(pal.bioA, k), '#ff2a3a', red) : pal.bioA, 0.6);
  if (hurt) {
    const lid = new Path2D();
    lid.moveTo(x - 10, y - 1);
    lid.quadraticCurveTo(x, y - 15, x + 10, y - 1);
    lid.quadraticCurveTo(x, y - 4, x - 10, y - 1);
    lid.closePath();
    fillOutlined(ctx, lid, voided('#5a46c8', k), OUT, 2);
  }
}

function whaleMouth(ctx: Ctx, k: number, defeat: boolean): void {
  ctx.lineCap = 'round';
  if (defeat) {
    const m = ellipse(52, 133, 13, 9, -0.15);
    fillOutlined(ctx, m, '#0c0412', OUT, 3);
    ctx.save();
    ctx.clip(m);
    softDot(ctx, 54, 138, 12, '#6a6a7a', 0.6);
    ctx.restore();
    // Cri
    ctx.strokeStyle = 'rgba(230,230,240,0.8)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const [a, r0, r1] of [
      [-2.6, 19, 31],
      [3.05, 20, 34],
      [2.7, 19, 30],
    ] as const) {
      ctx.moveTo(52 + Math.cos(a) * r0, 133 + Math.sin(a) * r0);
      ctx.lineTo(52 + Math.cos(a) * r1, 133 + Math.sin(a) * r1);
    }
    ctx.stroke();
    return;
  }
  const m = new Path2D();
  m.moveTo(36, 127);
  m.quadraticCurveTo(50, 137, 68, 131);
  ctx.strokeStyle = rgba(OUT, 0.85);
  ctx.lineWidth = 3;
  ctx.stroke(m);
  ctx.save();
  ctx.translate(0, 1.6);
  ctx.strokeStyle = rgba(voided('#a0faff', k), 0.45);
  ctx.lineWidth = 1.2;
  ctx.stroke(m);
  ctx.restore();
}

export interface WhaleBodyOpts {
  /** Corps de boss : opaque, contour sombre, bouche (sinon translucide, exactement comme le décor). */
  solid?: boolean;
  /** Blessée : entailles lumineuses, jupe déchirée, œil mi-clos, points éteints. */
  hurt?: boolean;
  /** Défaite : immobile, toute grise, fissures d'où sort la lumière, œil fermé, cri, éclats qui tombent. */
  defeat?: boolean;
  /** Teintes bioluminescentes (Jungle par défaut). */
  pal?: ThemePalette;
}

/**
 * Corps de la méduse-baleine sans tentacules, dans le repère de WHALE (460x240 à l'échelle 1, tête à gauche),
 * agrandi `scale`. `grey` = part de Vide : 0 = couleurs (identique au décor actuel en style translucide), taches
 * grises qui s'étendent avec fissures noires et reflets rouges, 1 = toute grise (œil rouge). Réutilisable par le
 * décor lointain (frames `whaleVoid*`) et les cinématiques.
 */
export function drawWhaleBody(ctx: Ctx, scale: number, grey: number, opts: WhaleBodyOpts = {}): void {
  const pal = opts.pal ?? PALETTES.jungle;
  const solid = !!opts.solid;
  const defeat = !!opts.defeat;
  const hurt = !!opts.hurt && !defeat;
  const g = defeat ? 1 : clamp01(grey);
  const k = defeat ? 1 : smooth(0.5, 1, g);
  const red = smooth(0.35, 0.9, g);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  // Nageoire pectorale (derrière)
  const fin = whaleFinPath();
  if (solid) {
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 5;
    ctx.stroke(fin);
  }
  ctx.fillStyle = rgba(voided('#786eff', k), solid ? 0.92 : 0.35);
  ctx.fill(fin);
  if (solid) {
    // Rayons de la nageoire
    ctx.strokeStyle = rgba(voided('#c8c0ff', k), 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const [x, y] of [
      [146, 196],
      [160, 214],
      [182, 222],
    ] as const) {
      ctx.moveTo(196, 156);
      ctx.quadraticCurveTo((196 + x) / 2 + 6, (156 + y) / 2, x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(voided('#a0faff', k), 0.5);
  ctx.lineWidth = 2;
  ctx.stroke(fin);
  // Corps
  const body = whaleBodyPath();
  if (solid) {
    // Halo aplati : il tient dans l'image (sinon coupé net au bord)
    ctx.save();
    ctx.translate(220, 110);
    ctx.scale(1, 0.5);
    softDot(ctx, 0, 0, 230, voided('#7a6aff', k), 0.22);
    ctx.restore();
  } else {
    softDot(ctx, 220, 110, 230, voided('#7a6aff', k), 0.25);
  }
  if (solid) {
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 6;
    ctx.stroke(body);
  }
  whaleFill(ctx, body, k, solid, hurt, pal);
  if (g > 0) whaleVoid(ctx, body, g, hurt, pal);
  if (defeat) whaleDefeatCracks(ctx, body, pal);
  // Liseré lumineux, reflet rouge du Vide par en dessous
  ctx.strokeStyle = rgba(voided('#a0faff', k), 0.75);
  ctx.lineWidth = solid ? 3 : 2.5;
  ctx.stroke(body);
  if (red > 0) rimLight(ctx, body, rgba(VOID_RED, 0.6 * red), 3.5, 0, -3.5);
  // Rangées de points bioluminescents
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = 70 + t * 320;
    const y = 70 - Math.sin(t * Math.PI) * 26 + t * 30;
    if (hurt && i % 3 === 0) {
      ctx.fillStyle = rgba('#1a1040', 0.85);
      ctx.fill(circle(x, y + 12, 2.2 - t));
      continue;
    }
    const isRed = red > 0.5 && (i === 3 || i === 8 || i === 12);
    glowDot(ctx, x, y + 12, 2.2 - t, isRed ? VOID_RED : voided(pal.bioA, k));
  }
  for (let i = 0; i < 10; i++) {
    const x = 100 + i * 28;
    glowDot(ctx, x, 140 + Math.sin(i) * 3, 1.5, voided(pal.bioB, k));
  }
  whaleEye(ctx, pal, k, g, solid, hurt, defeat);
  if (solid) whaleMouth(ctx, k, defeat);
  // Jupe festonnée (méduse) sous le corps
  const skirt = whaleSkirtPath(hurt || defeat);
  if (solid) {
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4;
    ctx.stroke(skirt);
  }
  ctx.fillStyle = rgba(voided('#9682ff', k), solid ? 0.62 : 0.35);
  ctx.fill(skirt);
  ctx.strokeStyle = rgba(voided('#befaff', k), 0.55);
  ctx.lineWidth = 1.5;
  ctx.stroke(skirt);
  if (defeat) whaleFlakes(ctx);
  ctx.restore();
}

/** Corps de la méduse-baleine en boss (WHALE_POSE), sur une image de WHALE_BOSS.w x h ; opts.grey : 1 par défaut. */
export function drawWhaleBoss(ctx: Ctx, theme: ThemeId, frame: number, opts: BossDrawOpts = {}): void {
  ctx.save();
  ctx.translate(WPAD, WPAD);
  drawWhaleBody(ctx, WS, opts.grey ?? WHALE_BOSS.grey, {
    solid: true,
    hurt: frame === WHALE_POSE.hurt,
    defeat: frame === WHALE_POSE.defeat,
    pal: PALETTES[theme],
  });
  ctx.restore();
}

/** Cœur : images de 160x168, origine en haut de la tige (cx, 0), centre du cœur en (cx, cy). */
export const WHALE_HEART = { w: 160, h: 168, cx: 80, cy: 92 } as const;
/** Index des images du cœur : 0 fermé, 1 qui s'ouvre, 2-3 exposé (battement). */
export const HEART_POSE = { closed: 0, opening: 1, open: [2, 3] } as const;

/** Cœur de la méduse-baleine pendu à sa tige : bouton de pétales fermé, puis ouvert sur un cœur lumineux. */
export function drawWhaleHeart(ctx: Ctx, theme: ThemeId, frame: number, opts: BossDrawOpts = {}): void {
  const pal = PALETTES[theme];
  const g = clamp01(opts.grey ?? WHALE_BOSS.grey);
  const k = smooth(0.15, 1, g);
  const open = frame === 0 ? 0 : frame === 1 ? 0.45 : 1;
  const pulse = frame === 3 ? 1.1 : 1;
  const { cx, cy } = WHALE_HEART;
  const ay = cy - 30;
  ctx.lineJoin = 'round';
  softDot(ctx, cx, cy, 60 * (0.55 + 0.45 * open) * pulse, CORE, 0.22 + 0.4 * open);
  // Tige
  limb(
    ctx,
    cx,
    -6,
    cx,
    ay + 4,
    10,
    linGrad(ctx, cx - 5, 0, cx + 5, 0, [
      [0, voided('#4a36b0', k)],
      [0.5, voided('#9a86ff', k)],
      [1, voided('#3a2890', k)],
    ]),
    OUT,
    3,
  );
  glow(ctx, CORE, 8, () => {
    ctx.strokeStyle = 'rgba(255,140,235,0.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, ay + 2);
    ctx.stroke();
  });
  const petal = (side: number, ang: number, len: number, wid: number, back: boolean) => {
    ctx.save();
    ctx.translate(cx - side * 4, ay);
    ctx.scale(side, 1);
    ctx.rotate(ang);
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(-wid, len * 0.22, -wid * 0.85, len * 0.78, 0, len);
    p.bezierCurveTo(wid * 0.45, len * 0.72, wid * 0.5, len * 0.28, 0, 0);
    p.closePath();
    const stops: [number, string][] = back
      ? [
          [0, voided('#4a36a8', k)],
          [1, voided('#1e1258', k)],
        ]
      : [
          [0, voided('#c4b8ff', k)],
          [0.5, voided('#7a62f0', k)],
          [1, voided('#34208a', k)],
        ];
    fillOutlined(ctx, p, linGrad(ctx, 0, 0, -wid * 0.5, len, stops), OUT, 3);
    if (!back) rimLight(ctx, p, rgba(voided('#a0faff', k), 0.7), 2.5, 2, -2);
    ctx.strokeStyle = rgba(voided('#d8d0ff', k), 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.quadraticCurveTo(-wid * 0.45, len * 0.5, -1, len * 0.9);
    ctx.stroke();
    if (g > 0.45 && !back) {
      ctx.save();
      ctx.clip(p);
      crackNet(ctx, -wid * 0.3, len * 0.45, 22, 70 + side, g);
      ctx.restore();
    }
    glowDot(ctx, -wid * 0.3, len * 0.74, 2, g > 0.7 ? VOID_RED : voided(pal.bioA, k));
    ctx.restore();
  };
  petal(1, 0.55 + 1.35 * open, 52, 22, true);
  petal(-1, 0.55 + 1.35 * open, 52, 22, true);
  if (open > 0) weakOrb(ctx, cx, cy, (13 + 13 * open) * pulse, open * pulse, open >= 1, 3.5, 2.5);
  petal(1, -0.06 + 1.3 * open, 64, 30, false);
  petal(-1, -0.06 + 1.3 * open, 64, 30, false);
  if (open === 0) {
    // Fermé : la lumière filtre par la fente du bouton
    glow(ctx, CORE, 12, () => {
      ctx.strokeStyle = 'rgba(255,150,240,0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, ay + 10);
      ctx.quadraticCurveTo(cx + 1.5, cy + 6, cx, ay + 58);
      ctx.stroke();
    });
  }
}

/** Tentacules : images de 44x44, origine au centre ; le moteur les enchaîne (comme le décor) et les anime. */
export const WHALE_TENTACLE = { w: 44, h: 44 } as const;
/** Index : 0 segment, 1 maillon de la tige du cœur, 2 bout (dard), 3 moignon (tentacule abattu). */
export const TENTACLE_POSE = { segment: 0, cord: 1, tip: 2, stump: 3 } as const;

export function drawWhaleTentacle(ctx: Ctx, theme: ThemeId, frame: number, opts: BossDrawOpts = {}): void {
  const pal = PALETTES[theme];
  const g = clamp01(opts.grey ?? WHALE_BOSS.grey);
  const k = smooth(0.15, 1, g);
  const c = 22;
  const dot = g > 0.7 ? VOID_RED : voided(pal.bioA, k);
  ctx.lineJoin = 'round';
  if (frame === TENTACLE_POSE.cord) {
    const p = ellipse(c, c, 8.5, 15);
    fillOutlined(
      ctx,
      p,
      linGrad(ctx, c - 8, 0, c + 8, 0, [
        [0, voided('#4a36b0', k)],
        [0.5, voided('#a08cff', k)],
        [1, voided('#3a2890', k)],
      ]),
      OUT,
      3,
    );
    glow(ctx, CORE, 8, () => {
      ctx.strokeStyle = '#ff9aee';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(c, c - 13);
      ctx.lineTo(c, c + 13);
      ctx.stroke();
    });
    return;
  }
  softDot(ctx, c, c, 21, voided(pal.bioA, k), 0.28);
  const grad = sphereGrad(ctx, c, c, 15, voided('#d4caff', k), voided('#8a72f4', k), voided('#2e1c80', k));
  if (frame === TENTACLE_POSE.tip) {
    const p = new Path2D();
    p.moveTo(c - 12, c - 13);
    p.bezierCurveTo(c - 14, c + 2, c - 4, c + 12, c + 2, c + 19);
    p.bezierCurveTo(c + 4, c + 9, c + 13, c + 1, c + 12, c - 13);
    p.quadraticCurveTo(c, c - 19, c - 12, c - 13);
    p.closePath();
    fillOutlined(ctx, p, grad, OUT, 3);
    rimLight(ctx, p, rgba(voided('#a0faff', k), 0.8), 2.2, 1.8, 1.8);
    glowDot(ctx, c + 2, c + 15, 2.2, '#c8fdff');
    glowDot(ctx, c - 3, c - 5, 2, dot);
    return;
  }
  if (frame === TENTACLE_POSE.stump) {
    const p = new Path2D();
    p.moveTo(c - 13, c - 1);
    p.bezierCurveTo(c - 14, c - 19, c + 14, c - 19, c + 13, c - 1);
    p.lineTo(c + 9, c + 4);
    p.lineTo(c + 5, c);
    p.lineTo(c + 1, c + 6);
    p.lineTo(c - 4, c + 1);
    p.lineTo(c - 8, c + 5);
    p.closePath();
    fillOutlined(ctx, p, grad, OUT, 3);
    glow(ctx, '#9ffff6', 10, () => {
      ctx.fillStyle = '#e6fffd';
      ctx.fill(ellipse(c, c + 1.5, 9, 3));
    });
    for (const [x, y, r] of [
      [-4, 12, 2.4],
      [5, 17, 2],
    ] as const) {
      fillOutlined(ctx, dropPath(c + x, c + y, r, -Math.PI / 2), '#c8fdff', '#0a3a4a', 1.6);
    }
    return;
  }
  const p = ellipse(c, c, 13, 15);
  fillOutlined(ctx, p, grad, OUT, 3);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = rgba(voided('#24125e', k), 0.45);
  ctx.fill(ellipse(c, c + 12, 16, 7));
  if (g > 0.45) {
    // Une fissure du Vide
    ctx.strokeStyle = '#07050a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(c + 7, c - 12);
    ctx.lineTo(c + 3, c - 6);
    ctx.lineTo(c + 6, c - 1);
    ctx.lineTo(c + 2, c + 6);
    ctx.stroke();
  }
  ctx.restore();
  rimLight(ctx, p, rgba(voided('#a0faff', k), 0.8), 2.2, 1.8, 1.8);
  glowDot(ctx, c - 3, c - 3, 2.2, dot);
}

/** Tache d'annonce de spore au sol : images de 128x40, origine au centre, posée sur la surface du sol. */
export const WHALE_SPOT = { w: 128, h: 40 } as const;

/** Tache d'annonce : 0 lointaine (pâle), 1 proche, 2 imminente (vive, croix de visée). */
export function drawWhaleSpot(ctx: Ctx, theme: ThemeId, frame: number): void {
  void theme;
  const c = 64;
  const cy = 20;
  const t = Math.max(0, Math.min(2, frame)) / 2;
  const col = '#c8ff3a';
  ctx.save();
  ctx.translate(c, cy);
  ctx.scale(1, 0.26);
  softDot(ctx, 0, 0, 60, col, 0.3 + 0.35 * t);
  ctx.restore();
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = frame * 5;
  ctx.strokeStyle = rgba(col, 0.55 + 0.4 * t);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(c, cy, 55 - 6 * t, 13.5 - 1.5 * t, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  glow(ctx, col, 8 + 8 * t, () => {
    ctx.strokeStyle = rgba(mix(col, '#ffffff', 0.5 * t), 0.65 + 0.35 * t);
    ctx.lineWidth = 2.5 + t;
    ctx.beginPath();
    ctx.ellipse(c, cy, 30 - 8 * t, 7.5 - 2 * t, 0, 0, TAU);
    ctx.stroke();
  });
  if (frame >= 1) {
    ctx.strokeStyle = rgba('#f4ffc8', 0.9);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(c + s * 40, cy);
      ctx.lineTo(c + s * 50, cy);
    }
    ctx.moveTo(c, cy - 7);
    ctx.lineTo(c, cy - 11);
    ctx.moveTo(c, cy + 7);
    ctx.lineTo(c, cy + 11);
    ctx.stroke();
  }
  if (frame >= 2) {
    softDot(ctx, c, cy, 12, '#ffffff', 0.85);
    glowDot(ctx, c, cy, 2.6, '#ffffff');
  }
}

// ================================================================ Planches

const WHALE_BODY_BOXES = [wbox(30, 40, 210, 168), wbox(210, 38, 400, 172), wbox(392, 56, 455, 192)];
const WHALE_HURT = [...WHALE_BODY_BOXES, wbox(90, 150, 420, 192)];
const HEART_BUD = box(-30, WHALE_HEART.cy - 30, 60, 66);
const SEGMENT = box(-13, -15, 26, 30);

/**
 * Planches des boss (buildSheet : images 0..count-1 côte à côte, 2048 px de large au plus). Boîtes relatives à
 * l'origine, sprite tel que dessiné (mini-boss vers la droite : flipBox pour la gauche ; méduse-baleine vers la
 * gauche).
 */
export const BOSS_SHEETS: Readonly<Record<BossSheetId, BossSheet>> = {
  blobKing: {
    key: 'boss-blob-king',
    w: BLOB_KING.w,
    h: BLOB_KING.h,
    count: 6,
    originX: 0.5,
    originY: BLOB_KING.base / BLOB_KING.h,
    frames: { idle: BLOB_POSE.idle, squash: 3, leap: 4, flat: 5 },
    boxes: blobBoxes(false),
    body: box(-68, -100, 136, 100),
    draw: (ctx, theme, i) => drawBlobKing(ctx, theme, i),
  },
  blobKingRage: {
    key: 'boss-blob-king-rage',
    w: BLOB_KING.w,
    h: BLOB_KING.h,
    count: 7,
    originX: 0.5,
    originY: BLOB_KING.base / BLOB_KING.h,
    frames: { idle: BLOB_POSE.idle, squash: 3, leap: 4, flat: 5, flee: 6 },
    boxes: blobBoxes(true),
    body: box(-68, -100, 136, 100),
    draw: (ctx, theme, i) => drawBlobKing(ctx, theme, i, { rage: true }),
  },
  blobWave: {
    key: 'boss-blob-wave',
    w: BLOB_WAVE.w,
    h: BLOB_WAVE.h,
    count: 2,
    originX: 0.5,
    originY: BLOB_WAVE.base / BLOB_WAVE.h,
    frames: { roll: [0, 1] },
    boxes: [0, 1].map(() => ({ weak: NONE, hurt: [box(-30, -BLOB_WAVE.crest + 6, 60, BLOB_WAVE.crest - 6)], armor: NONE })),
    draw: (ctx, theme, i) => drawBlobWave(ctx, theme, i),
  },
  beetleTitan: {
    key: 'boss-beetle-titan',
    w: BEETLE_TITAN.w,
    h: BEETLE_TITAN.h,
    count: 7,
    originX: BEETLE_TITAN.footX / BEETLE_TITAN.w,
    originY: BEETLE_TITAN.base / BEETLE_TITAN.h,
    frames: { walk: BEETLE_POSE.walk, charge: 4, stunned: 5, deflect: 6 },
    boxes: beetleBoxes(false),
    body: tb(6, 8, 60, 54.5),
    draw: (ctx, theme, i) => drawBeetleTitan(ctx, theme, i),
  },
  beetleTitanCracked: {
    key: 'boss-beetle-titan-cracked',
    w: BEETLE_TITAN.w,
    h: BEETLE_TITAN.h,
    count: 8,
    originX: BEETLE_TITAN.footX / BEETLE_TITAN.w,
    originY: BEETLE_TITAN.base / BEETLE_TITAN.h,
    frames: { walk: BEETLE_POSE.walk, charge: 4, stunned: 5, deflect: 6, flee: 7 },
    boxes: beetleBoxes(true),
    body: tb(6, 8, 60, 54.5),
    draw: (ctx, theme, i) => drawBeetleTitan(ctx, theme, i, { cracked: true }),
  },
  titanRock: {
    key: 'boss-titan-rock',
    w: TITAN_ROCK.w,
    h: TITAN_ROCK.h,
    count: 3,
    originX: 0.5,
    originY: 0.5,
    frames: { rocks: ROCK_POSE.rocks, mark: ROCK_POSE.mark },
    boxes: [0, 1, 2].map((i) => ({ weak: NONE, hurt: i === ROCK_POSE.mark ? NONE : [box(-18, -18, 36, 36)], armor: NONE })),
    draw: (ctx, theme, i) => drawTitanRock(ctx, theme, i),
  },
  whaleBody: {
    key: 'boss-whale',
    w: WW,
    h: WH,
    count: 3,
    originX: 0.5,
    originY: 0.5,
    frames: { idle: 0, hurt: 1, defeat: 2 },
    boxes: [
      { weak: NONE, hurt: WHALE_HURT, armor: WHALE_BODY_BOXES },
      { weak: NONE, hurt: WHALE_HURT, armor: WHALE_BODY_BOXES },
      { weak: NONE, hurt: NONE, armor: WHALE_BODY_BOXES },
    ],
    draw: (ctx, theme, i, opts) => drawWhaleBoss(ctx, theme, i, opts),
  },
  whaleHeart: {
    key: 'boss-whale-heart',
    w: WHALE_HEART.w,
    h: WHALE_HEART.h,
    count: 4,
    originX: 0.5,
    originY: 0,
    frames: { closed: 0, opening: 1, open: HEART_POSE.open },
    boxes: [
      { weak: NONE, hurt: NONE, armor: [HEART_BUD] },
      { weak: [box(-19, WHALE_HEART.cy - 19, 38, 38)], hurt: NONE, armor: [HEART_BUD] },
      { weak: [box(-30, WHALE_HEART.cy - 30, 60, 60)], hurt: NONE, armor: NONE },
      { weak: [box(-32, WHALE_HEART.cy - 32, 64, 64)], hurt: NONE, armor: NONE },
    ],
    draw: (ctx, theme, i, opts) => drawWhaleHeart(ctx, theme, i, opts),
  },
  whaleTentacle: {
    key: 'boss-whale-tentacle',
    w: WHALE_TENTACLE.w,
    h: WHALE_TENTACLE.h,
    count: 4,
    originX: 0.5,
    originY: 0.5,
    frames: { segment: 0, cord: 1, tip: 2, stump: 3 },
    boxes: [
      { weak: [SEGMENT], hurt: [SEGMENT], armor: NONE },
      { weak: NONE, hurt: NONE, armor: NONE },
      { weak: [box(-12, -15, 24, 34)], hurt: [box(-12, -15, 24, 34)], armor: NONE },
      { weak: NONE, hurt: NONE, armor: NONE },
    ],
    draw: (ctx, theme, i, opts) => drawWhaleTentacle(ctx, theme, i, opts),
  },
  whaleSpot: {
    key: 'boss-whale-spot',
    w: WHALE_SPOT.w,
    h: WHALE_SPOT.h,
    count: 3,
    originX: 0.5,
    originY: 0.5,
    frames: { warn: [0, 1, 2] },
    boxes: [0, 1, 2].map(() => ({ weak: NONE, hurt: NONE, armor: NONE })),
    draw: (ctx, theme, i) => drawWhaleSpot(ctx, theme, i),
  },
};

/** Planches de chaque boss, à générer à l'arrivée dans l'arène (ou au chargement du niveau). */
export const BOSS_ART = {
  blobKing: ['blobKing', 'blobKingRage', 'blobWave'],
  beetleTitan: ['beetleTitan', 'beetleTitanCracked', 'titanRock'],
  whale: ['whaleBody', 'whaleHeart', 'whaleTentacle', 'whaleSpot'],
} as const satisfies Record<string, readonly BossSheetId[]>;

/** Génère la planche `id` (frames numérotées) sous sa clé, ou sous `key` (variantes de `grey`). */
export function buildBossSheet(scene: Phaser.Scene, id: BossSheetId, theme: ThemeId, opts?: BossDrawOpts, key?: string): void {
  const s = BOSS_SHEETS[id];
  buildSheet(scene, key ?? s.key, s.w, s.h, s.count, (ctx, i) => s.draw(ctx, theme, i, opts));
}

/** Libère les textures d'un boss (la scène ne supprime rien à l'arrêt). */
export function removeBossSheets(scene: Phaser.Scene, ids: readonly BossSheetId[]): void {
  for (const id of ids) removeTexture(scene, BOSS_SHEETS[id].key);
}
