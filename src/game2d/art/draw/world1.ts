import type { ThemeId } from '../../../core/types';
import { PALETTES, type ThemePalette } from '../palette';
import {
  type Ctx,
  type Surface,
  circle,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  limb,
  linGrad,
  makeCanvas,
  mix,
  poly,
  rgba,
  rimLight,
  rng,
  roundRect,
  softDot,
  sphereGrad,
  wrapX,
} from '../util';

// Monde 1 (Jungle de Xéna), plan 04 (points 8, 15 et 19) : champignon rebondissant, barrière d'arène, tronc
// abattu, Tess et sa capsule, glyphes astréens, branches / lianes / passerelles (variantes de '=').
// Fonctions pures (ctx, theme, frame, opts?) : une frame dessinée dans le repère de sa planche (origine en haut
// à gauche, taille dans WORLD1_SHEETS). Couleurs de la palette du thème et contour sombre, comme tiles.ts et
// doors.ts ; personnages tournés vers la droite (flipX pour la gauche), pieds au bas de la frame.

const TAU = Math.PI * 2;
const T = 64;
/** Cyan de LUMA (téléportation), le même que les lumières de Kaï. */
const BEAM = '#3ff0ff';

// ================================================================ Champignon rebondissant (case 'o', 64x64)

interface MushPose {
  /** Haut du chapeau, bord du chapeau (y) et demi-largeur du chapeau. */
  top: number;
  brim: number;
  half: number;
  /** Demi-largeur du pied sous le chapeau. */
  stalk: number;
  /** Intensité des lueurs (0..1) et éclat du rebond (0..1). */
  glow: number;
  flash: number;
}

/** 0-2 repos (lueur qui pulse), 3 écrasé, 4 détente, 5 retour. */
const MUSH: MushPose[] = [
  { top: 4, brim: 31, half: 30, stalk: 11, glow: 0.45, flash: 0 },
  { top: 3.5, brim: 30.5, half: 30, stalk: 11, glow: 0.72, flash: 0 },
  { top: 3, brim: 30, half: 30.5, stalk: 11, glow: 1, flash: 0 },
  { top: 15, brim: 37, half: 31.5, stalk: 13.5, glow: 1, flash: 0.6 },
  { top: 0.5, brim: 27, half: 26.5, stalk: 9.5, glow: 1, flash: 1 },
  { top: 6, brim: 32, half: 31, stalk: 11.5, glow: 0.85, flash: 0.3 },
];

/** Taches du chapeau : position (fraction de la demi-largeur, fraction de la hauteur du dôme) et rayon. */
const MUSH_SPOTS: readonly [number, number, number][] = [
  [-0.5, 0.5, 0.17],
  [0.02, 0.2, 0.2],
  [0.48, 0.42, 0.15],
  [-0.84, 0.86, 0.09],
  [0.78, 0.8, 0.1],
  [-0.12, 0.72, 0.1],
];

/**
 * Champignon rebondissant, case pleine 'o' (64x64). Chapeau magenta à pois sur un pied lilas, lamelles cyan
 * qui luisent : rien à voir avec la mousse verte du sol. Le haut du chapeau reste vers y = 3 au repos (Kaï s'y
 * tient), descend à 15 écrasé et monte à 0,5 à la détente. La frame 0 sert aussi de tuile de tileset.
 */
export function drawMushroom(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const p = MUSH[frame] ?? MUSH[0];
  const cx = 32;
  const cap = pal.bioB;
  const gill = pal.bioA;
  const l = cx - p.half;
  const r = cx + p.half;

  // Lueur au pied (sous la touffe)
  softDot(ctx, cx, 60, 26, gill, 0.18 * p.glow);

  // Pied, évasé vers le bas
  const sb = p.stalk + 7;
  const st = new Path2D();
  st.moveTo(cx - sb, 64);
  st.bezierCurveTo(cx - p.stalk - 1, 57, cx - p.stalk, p.brim + 10, cx - p.stalk + 1.5, p.brim + 1);
  st.lineTo(cx + p.stalk - 1.5, p.brim + 1);
  st.bezierCurveTo(cx + p.stalk, p.brim + 10, cx + p.stalk + 1, 57, cx + sb, 64);
  st.closePath();
  fillOutlined(ctx, st, linGrad(ctx, cx - sb, 0, cx + sb, 0, [[0, '#6a5aa0'], [0.3, '#efe8ff'], [0.65, '#b9a8e8'], [1, '#4e3f86']]), pal.outline, 2.6);
  ctx.save();
  ctx.clip(st);
  // Fibres du pied
  ctx.strokeStyle = 'rgba(60,40,110,0.35)';
  ctx.lineWidth = 1;
  for (const dx of [-5, 1, 6]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, p.brim + 4);
    ctx.quadraticCurveTo(cx + dx * 1.3, (p.brim + 64) / 2, cx + dx * 1.7, 64);
    ctx.stroke();
  }
  ctx.restore();
  // Anneau (jupe) du pied
  const ys = p.brim + (64 - p.brim) * 0.4;
  const skirt = new Path2D();
  skirt.moveTo(cx - p.stalk - 3, ys);
  skirt.quadraticCurveTo(cx, ys - 4, cx + p.stalk + 3, ys);
  skirt.quadraticCurveTo(cx + p.stalk + 1, ys + 5, cx + p.stalk - 2, ys + 3.5);
  skirt.quadraticCurveTo(cx, ys + 6, cx - p.stalk + 2, ys + 3.5);
  skirt.quadraticCurveTo(cx - p.stalk - 1, ys + 5, cx - p.stalk - 3, ys);
  skirt.closePath();
  fillOutlined(ctx, skirt, linGrad(ctx, 0, ys - 3, 0, ys + 6, [[0, '#ffffff'], [1, '#a898d8']]), pal.outline, 1.8);
  glowDot(ctx, cx - 4, ys + 10, 1.2, gill);
  glowDot(ctx, cx + 5, ys + 15, 1, cap);

  // Touffe de mousse au pied
  const tuft = new Path2D();
  tuft.moveTo(cx - 24, 64.5);
  tuft.quadraticCurveTo(cx - 22, 58, cx - 15, 59.5);
  tuft.quadraticCurveTo(cx - 9, 55, cx - 2, 59);
  tuft.quadraticCurveTo(cx + 6, 55.5, cx + 13, 59.5);
  tuft.quadraticCurveTo(cx + 21, 57.5, cx + 24, 64.5);
  tuft.closePath();
  fillOutlined(ctx, tuft, linGrad(ctx, 0, 55, 0, 64, [[0, pal.surfaceLight], [0.4, pal.surface], [1, pal.surfaceDark]]), pal.outline, 2);
  glowDot(ctx, cx - 14, 60.5, 0.9, pal.bioA);
  glowDot(ctx, cx + 9, 60, 0.9, '#ffffff');
  // Petit champignon au pied (à droite)
  const mx = cx + 19;
  fillOutlined(ctx, roundRect(mx - 1.6, 54, 3.2, 8, 1.5), '#d8ccff', pal.outline, 1.4);
  glow(ctx, cap, 5, () => {
    fillOutlined(ctx, new Path2D(`M ${mx - 5} 55 Q ${mx} 47 ${mx + 5} 55 Z`), sphereGrad(ctx, mx - 1, 51, 5, '#ffd6fa', cap, '#7a0f7a'), pal.outline, 1.4);
  });

  // Dessous du chapeau : lamelles lumineuses
  const under = new Path2D();
  under.moveTo(l + 3, p.brim - 1);
  under.quadraticCurveTo(cx, p.brim + 10, r - 3, p.brim - 1);
  under.closePath();
  softDot(ctx, cx, p.brim + 4, p.half * 0.95, gill, 0.3 * p.glow);
  fillOutlined(ctx, under, '#3a0a44', pal.outline, 2);
  ctx.save();
  ctx.clip(under);
  glow(ctx, gill, 5 * p.glow, () => {
    ctx.strokeStyle = rgba(gill, 0.35 + 0.55 * p.glow);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let k = -5; k <= 5; k++) {
      ctx.moveTo(cx + k * p.half * 0.16, p.brim - 1);
      ctx.lineTo(cx + k * p.half * 0.11, p.brim + 7);
    }
    ctx.stroke();
  });
  ctx.restore();

  // Chapeau (dôme)
  const dome = p.brim - p.top;
  const capP = new Path2D();
  capP.moveTo(l, p.brim);
  capP.bezierCurveTo(l - 1, p.top + dome * 0.22, cx - p.half * 0.58, p.top, cx, p.top);
  capP.bezierCurveTo(cx + p.half * 0.58, p.top, r + 1, p.top + dome * 0.22, r, p.brim);
  capP.quadraticCurveTo(cx, p.brim + 5, l, p.brim);
  capP.closePath();
  // Halo intérieur seulement : un halo externe serait coupé net par les bords de la case (carré visible)
  softDot(ctx, cx, p.top + dome * 0.55, p.half * 0.95, cap, 0.25 * p.glow);
  fillOutlined(ctx, capP, sphereGrad(ctx, cx - p.half * 0.3, p.top + dome * 0.35, p.half * 1.15, '#ffe2fb', cap, '#6a0a6a'), pal.outline, 2.8);
  ctx.save();
  ctx.clip(capP);
  // Taches pâles, cerclées de lueur cyan
  for (const [fx, fy, fr] of MUSH_SPOTS) {
    const sx = cx + fx * p.half;
    const sy = p.top + fy * dome;
    const sr = Math.max(1.4, fr * p.half);
    softDot(ctx, sx, sy, sr * 2.2, gill, 0.3 * p.glow);
    fillOutlined(ctx, ellipse(sx, sy, sr, sr * 0.8), 'rgba(255,240,255,0.92)', rgba(pal.outline, 0.35), 1);
  }
  // Ombre du bord inférieur
  ctx.fillStyle = 'rgba(40,0,50,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, p.brim + 3, p.half + 2, 5, 0, 0, TAU);
  ctx.fill();
  if (p.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.32 * p.flash})`;
    ctx.fill(capP);
  }
  ctx.restore();
  rimLight(ctx, capP, 'rgba(255,230,255,0.8)', 2, 1.6, 2);
  // Liseré lumineux du bord : le signe du rebond
  glow(ctx, gill, 3 + 4 * p.glow, () => {
    ctx.strokeStyle = mix(gill, '#ffffff', 0.35);
    ctx.lineWidth = 1.2 + 0.9 * p.glow;
    ctx.beginPath();
    ctx.moveTo(l + 6, p.brim + 1.6);
    ctx.quadraticCurveTo(cx, p.brim + 5.5, r - 6, p.brim + 1.6);
    ctx.stroke();
  });

  // Effets du rebond
  if (frame === 3) {
    // Écrasé : bouffées de spores sur les côtés, traits de compression
    for (const [x, y, rr, c] of [[4, p.brim - 6, 1.6, gill], [60, p.brim - 7, 1.5, cap], [9, p.brim - 13, 1.1, cap], [55, p.brim - 14, 1.1, gill]] as const) {
      glowDot(ctx, x, y, rr, c);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 10, p.top - 5);
    ctx.lineTo(cx + 10, p.top - 5);
    ctx.moveTo(cx - 6, p.top - 9);
    ctx.lineTo(cx + 6, p.top - 9);
    ctx.stroke();
  } else if (frame === 4) {
    // Détente : traits de vitesse de part et d'autre du chapeau
    glow(ctx, gill, 6, () => {
      ctx.strokeStyle = 'rgba(220,255,250,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [x, y0, y1] of [[2.5, p.brim + 2, p.brim - 14], [61.5, p.brim + 2, p.brim - 14], [6, p.brim - 6, p.brim - 18], [58, p.brim - 6, p.brim - 18]] as const) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
    });
  }
}

// ================================================================ Barrière d'arène (colonne de tuiles 64x64)

export type BarrierPart = 'top' | 'mid' | 'bottom';

/** Puissance du champ par frame : 0-3 crépitement, 4 éteinte, 5 et 6 allumage (à rebours : extinction). */
const BARRIER_POWER = [1, 1, 1, 1, 0, 0.22, 0.6];
/** Haut de la tête de la borne du bas (fente) ; bas de la tête de la borne du haut. */
const EMIT_LOW = 44;
const EMIT_HIGH = 20;

/** Borne d'émission en pierre astréenne (en bas, ou retournée en haut) : socle, griffes, fente lumineuse. */
function barrierEmitter(ctx: Ctx, theme: ThemeId, pal: ThemePalette, power: number, top: boolean): void {
  const Y = (y: number) => (top ? 64 - y : y);
  const on = power > 0;
  const stone = linGrad(ctx, 0, top ? 0 : 40, 0, top ? 24 : 64, [[0, mix(pal.blockLight, '#ffffff', 0.1)], [0.5, pal.blockBase], [1, pal.blockDark]]);
  // Griffes qui tiennent le champ
  for (const s of [-1, 1]) {
    const x0 = 32 + s * 19;
    const claw = new Path2D();
    claw.moveTo(x0 - s * 4, Y(52));
    claw.quadraticCurveTo(x0 + s * 3, Y(42), x0 - s * 2.5, Y(31));
    claw.quadraticCurveTo(x0 + s * 1.5, Y(41), x0 + s * 5, Y(52));
    claw.closePath();
    fillOutlined(ctx, claw, stone, pal.outline, 2.2);
    if (on) glowDot(ctx, x0 - s * 2.3, Y(32.5), 1.5 + power * 0.5, mix(pal.accent, '#ffffff', 0.3));
    else glowDot(ctx, x0 - s * 2.3, Y(32.5), 1.1, rgba(pal.accent, 0.35));
  }
  // Socle (trapèze)
  const base = poly([5, Y(64.5), 11, Y(51), 53, Y(51), 59, Y(64.5)]);
  fillOutlined(ctx, base, stone, pal.outline, 2.6);
  rimLight(ctx, base, 'rgba(220,230,255,0.35)', 1.6, 1.2, top ? -1.2 : 1.2);
  // Rune du socle
  glow(ctx, pal.vein, on ? 6 : 2, () => {
    ctx.strokeStyle = rgba(pal.vein, on ? 0.85 : 0.3);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(32, Y(58), 2.6, 0, TAU);
    ctx.moveTo(23, Y(58));
    ctx.lineTo(27, Y(58));
    ctx.moveTo(37, Y(58));
    ctx.lineTo(41, Y(58));
    ctx.stroke();
  });
  // Tête et fente
  const head = roundRect(16, top ? 64 - 53 : 44, 32, 9, 3);
  fillOutlined(ctx, head, linGrad(ctx, 0, Y(44), 0, Y(53), [[0, pal.blockDark], [1, mix(pal.blockDark, pal.outline, 0.5)]]), pal.outline, 2.2);
  const slot = roundRect(20, top ? 64 - 47.5 : 44.5, 24, 3, 1.5);
  if (on) {
    softDot(ctx, 32, Y(EMIT_LOW), 18, pal.accent, 0.35 * power);
    glow(ctx, pal.accent, 10, () => {
      ctx.fillStyle = mix(pal.accent, '#ffffff', 0.45 * power);
      ctx.fill(slot);
    });
  } else {
    ctx.fillStyle = mix(pal.accent, pal.outline, 0.75);
    ctx.fill(slot);
  }
  // Mousse au pied (en bas) ou liane qui pend (en haut) : jungle
  if (theme === 'jungle') {
    if (!top) {
      for (const [x, w] of [[7, 9], [52, 8]] as const) {
        const tuft = new Path2D();
        tuft.moveTo(x - w / 2, 64.5);
        tuft.quadraticCurveTo(x - w / 2 + 1, 58, x, 59.5);
        tuft.quadraticCurveTo(x + w / 2 - 1, 57, x + w / 2, 64.5);
        tuft.closePath();
        fillOutlined(ctx, tuft, linGrad(ctx, 0, 57, 0, 64, [[0, pal.surfaceLight], [1, pal.surfaceDark]]), pal.outline, 1.6);
      }
    } else {
      const vine = new Path2D();
      vine.moveTo(9, 12);
      vine.bezierCurveTo(5, 18, 11, 22, 8, 28);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 3.2;
      ctx.stroke(vine);
      ctx.strokeStyle = '#1f8a6a';
      ctx.lineWidth = 1.5;
      ctx.stroke(vine);
      glowDot(ctx, 8, 29.5, 1.6, pal.bioB);
    }
  }
}

/** Champ d'énergie de y0 à y1 : voile, losanges qui défilent, bords, cœur, éclairs et étincelles. */
function barrierField(ctx: Ctx, pal: ThemePalette, part: BarrierPart, f: number, power: number, y0: number, y1: number): void {
  const cx = 32;
  const half = 5 + 19 * power;
  const flick = f < 4 ? [1, 0.84, 0.95, 0.78][f] : 0.7;
  const a = power * flick;
  // Voile
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, rgba(pal.accent, 0));
  g.addColorStop(0.12, rgba(pal.accent, 0.3 * a));
  g.addColorStop(0.5, rgba(pal.accent, 0.5 * a));
  g.addColorStop(0.88, rgba(pal.accent, 0.3 * a));
  g.addColorStop(1, rgba(pal.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - half, y0, half * 2, y1 - y0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - half, y0, half * 2, y1 - y0);
  ctx.clip();
  // Losanges (période 16 px : les tuiles empilées se raccordent), défilent vers le haut d'une frame à l'autre
  const off = (f % 4) * 4;
  ctx.strokeStyle = rgba(pal.accentLight, 0.28 * a);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = -32 - off; y < 96; y += 16) {
    ctx.moveTo(cx - half, y + half * 0.6);
    ctx.lineTo(cx + half, y - half * 0.6);
    ctx.moveTo(cx - half, y - half * 0.6);
    ctx.lineTo(cx + half, y + half * 0.6);
  }
  ctx.stroke();
  ctx.restore();
  // Bords du voile : deux filets, nœuds lumineux toutes les 16 px
  for (const s of [-1, 1]) {
    const x = cx + s * (half - 1.5);
    ctx.strokeStyle = rgba(pal.accentLight, 0.6 * a);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    for (let y = 8 + ((f * 4 + (s > 0 ? 8 : 0)) % 16); y < 64; y += 16) {
      if (y > y0 + 1 && y < y1 - 1) glowDot(ctx, x, y, 1.1 * power + 0.4, '#ffffff');
    }
  }
  // Cœur ondulant (période 32 px) ; pointillés pendant l'allumage
  glow(ctx, pal.accent, 10, () => {
    ctx.strokeStyle = mix(pal.accent, '#ffffff', 0.55);
    ctx.lineWidth = 2 + 3 * power;
    if (power < 0.5) ctx.setLineDash([9, 5]);
    ctx.lineDashOffset = -f * 5;
    ctx.beginPath();
    for (let y = y0; y <= y1; y += 2) {
      const x = cx + Math.sin((y / T) * TAU * 2 + f * 1.6) * 1.3 * power;
      if (y === y0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1 + power * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx, y1);
  ctx.stroke();
  if (power < 0.5) return;
  // Éclairs : extrémités sur l'axe (x = 32) pour se raccorder aux tuiles voisines
  const r = rng(97 + f * 13 + (part === 'top' ? 5 : part === 'bottom' ? 9 : 0));
  for (let b = 0; b < 2; b++) {
    const pts: number[] = [];
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const y = y0 + ((y1 - y0) * k) / n;
      const x = k === 0 || k === n ? cx : cx + (r() - 0.5) * 2 * (half - 4) * 0.72;
      pts.push(x, y);
    }
    const bolt = new Path2D();
    bolt.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) bolt.lineTo(pts[k], pts[k + 1]);
    glow(ctx, pal.accent, 8, () => {
      ctx.strokeStyle = rgba(pal.accentLight, 0.9);
      ctx.lineWidth = 2.6;
      ctx.stroke(bolt);
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke(bolt);
  }
  // Étincelles
  for (let k = 0; k < 3; k++) {
    const x = cx + (r() - 0.5) * 2 * (half - 3);
    const y = y0 + 3 + r() * (y1 - y0 - 6);
    glowDot(ctx, x, y, 0.9 + r() * 0.8, k === 0 ? pal.accentLight : '#ffffff');
  }
}

/**
 * Barrière d'arène : une tuile de la colonne (`part`). Le champ magenta (« fermé ») occupe x = 8..56 à pleine
 * puissance ; ses éclairs, son cœur et ses losanges se raccordent d'une tuile à l'autre (même frame partout).
 * Frames : 0-3 crépitement, 4 éteinte (bornes seules), 5-6 allumage ; fermeture = 4, 5, 6 puis 0-3 en boucle,
 * ouverture = 6, 5, 4. Les bornes sont en haut (y = 0..20) et en bas (y = 44..64) de leur tuile.
 */
export function drawBarrier(ctx: Ctx, theme: ThemeId, frame: number, opts: { part?: BarrierPart } = {}): void {
  const pal = PALETTES[theme];
  const part = opts.part ?? 'mid';
  const f = Math.max(0, Math.min(BARRIER_POWER.length - 1, frame | 0));
  const power = BARRIER_POWER[f];
  const y0 = part === 'top' ? EMIT_HIGH - 3 : 0;
  const y1 = part === 'bottom' ? EMIT_LOW + 3 : 64;
  if (power > 0) barrierField(ctx, pal, part, f, power, y0, y1);
  if (part === 'bottom') barrierEmitter(ctx, theme, pal, power, false);
  else if (part === 'top') barrierEmitter(ctx, theme, pal, power, true);
}

// ================================================================ Tronc abattu (256x256 = 4x4 tuiles)

/**
 * Géométrie du tronc (px, dans la frame) : pivot de la chute = cassure au-dessus de la souche, longueur et
 * rayon du fût. Debout, il monte jusqu'à y ≈ 5 (2 tuiles de large) ; couché (90°), il couvre x ≈ 52..255,
 * y ≈ 134..256 (mousse comprise) devant la souche (x ≈ 4..124, haut vers y ≈ 188) : 4 tuiles de large, 2 de haut.
 */
export const TRUNK = { w: 256, h: 256, pivotX: 64, pivotY: 196, length: 170, radius: 58 } as const;
/** Angle de chute par frame (rad, sens horaire) : 0-2 debout qui tremble, 3-5 chute, 6 couché. */
const TRUNK_ANGLE = [0, 0.03, -0.022, 0.42, 0.98, 1.44, Math.PI / 2];
const BARK = ['#a87aa8', '#7a4a80', '#4a2452', '#22102a'] as const;
const WOOD = ['#f0cce0', '#c88aac', '#8a4a72'] as const;

function barkGrad(ctx: Ctx, x0: number, x1: number): CanvasGradient {
  return linGrad(ctx, x0, 0, x1, 0, [[0, BARK[0]], [0.25, BARK[1]], [0.62, BARK[2]], [1, BARK[3]]]);
}

/** Bord du fût à la hauteur y (repère local : base en 0, sommet en -length), avec de légères bosses. */
function trunkEdge(y: number, side: number): number {
  const t = -y / TRUNK.length;
  const w = TRUNK.radius * (1 - 0.14 * t);
  return side * (w + 1.6 * Math.sin(y * (side > 0 ? 0.17 : 0.21) + (side > 0 ? 1 : 0)));
}

/** Fût dans son repère local (base de la cassure en 0, vers -y), branche, mousse, champignons et liane. */
function trunkBody(ctx: Ctx, pal: ThemePalette): void {
  const L = TRUNK.length;
  const R = TRUNK.radius;
  // Branche cassée (côté droit : cachée sous le fût une fois couché), derrière le fût
  const br = new Path2D();
  br.moveTo(trunkEdge(-100, 1) - 6, -100);
  br.quadraticCurveTo(R + 12, -114, R + 24, -136);
  br.lineTo(R + 21, -145);
  br.lineTo(R + 16, -138);
  br.lineTo(R + 11, -146);
  br.quadraticCurveTo(R + 4, -124, trunkEdge(-128, 1) - 6, -128);
  br.closePath();
  fillOutlined(ctx, br, linGrad(ctx, R - 6, -120, R + 24, -140, [[0, BARK[2]], [1, BARK[1]]]), pal.outline, 2.8);
  fillOutlined(ctx, poly([R + 23, -137, R + 21, -144, R + 16, -138, R + 11, -145, R + 14, -135]), WOOD[1], pal.outline, 1.4);
  // Mousse sur la branche
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.surface;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(R - 2, -126);
  ctx.quadraticCurveTo(R + 6, -130, R + 12, -144);
  ctx.stroke();
  glow(ctx, pal.surfaceGlow, 5, () => {
    ctx.strokeStyle = pal.surfaceLight;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  });

  // Fût
  const body = new Path2D();
  body.moveTo(trunkEdge(0, -1), 4);
  for (let y = 0; y >= -L; y -= 7) body.lineTo(trunkEdge(y, -1), y);
  const Rt = R * 0.86;
  const top: [number, number][] = [
    [-Rt + 9, -L - 9],
    [-Rt + 17, -L - 3],
    [-10, -L - 21],
    [0, -L - 8],
    [11, -L - 15],
    [Rt - 12, -L - 1],
    [Rt - 5, -L - 8],
  ];
  for (const [x, y] of top) body.lineTo(x, y);
  for (let y = -L; y <= 0; y += 7) body.lineTo(trunkEdge(y, 1), y);
  const base: [number, number][] = [
    [R - 12, 12],
    [R - 21, 5],
    [10, 14],
    [0, 6],
    [-12, 13],
    [-23, 4],
    [-33, 11],
  ];
  body.lineTo(trunkEdge(0, 1), 4);
  for (const [x, y] of base) body.lineTo(x, y);
  body.closePath();
  fillOutlined(ctx, body, barkGrad(ctx, -R, R), pal.outline, 3);

  ctx.save();
  ctx.clip(body);
  // Bois clair des cassures (sommet et base)
  const topWood = new Path2D();
  topWood.moveTo(trunkEdge(-L, -1), -L + 4);
  for (const [x, y] of top) topWood.lineTo(x, y + 5);
  topWood.lineTo(trunkEdge(-L, 1), -L + 4);
  topWood.lineTo(trunkEdge(-L, 1), -L - 30);
  topWood.lineTo(trunkEdge(-L, -1), -L - 30);
  topWood.closePath();
  ctx.fillStyle = linGrad(ctx, 0, -L - 22, 0, -L + 4, [[0, WOOD[0]], [0.6, WOOD[1]], [1, WOOD[2]]]);
  ctx.fill(topWood);
  ctx.fillStyle = linGrad(ctx, 0, 14, 0, -2, [[0, WOOD[0]], [1, WOOD[2]]]);
  ctx.fillRect(-R - 4, 3, R * 2 + 8, 14);
  // Écorce : sillons verticaux et plaques
  for (let k = -3; k <= 3; k++) {
    const x0 = k * 12 + 3;
    ctx.strokeStyle = 'rgba(18,6,28,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 2; y >= -L; y -= 6) {
      const x = x0 * (1 - 0.14 * (-y / L)) + 2.4 * Math.sin(y * 0.05 + k * 1.7);
      if (y === 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,215,250,0.12)';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(-2.4, 0);
    ctx.stroke();
    ctx.restore();
  }
  const r = rng(301);
  ctx.strokeStyle = 'rgba(18,6,28,0.6)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * R * 1.6;
    const y = -10 - r() * (L - 30);
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x, y + 2.5, x + 5, y);
    ctx.stroke();
  }
  // Mousse du côté gauche (dessus une fois couché)
  const moss = new Path2D();
  moss.moveTo(-R - 3, -14);
  for (let y = -14; y >= -L + 12; y -= 6) moss.lineTo(trunkEdge(y, -1) - 2, y);
  for (let y = -L + 12; y <= -14; y += 6) moss.lineTo(trunkEdge(y, -1) + 8 + 3 * Math.sin(y * 0.13) + 2 * Math.sin(y * 0.31), y);
  moss.closePath();
  ctx.fillStyle = linGrad(ctx, -R, 0, -R + 12, 0, [[0, pal.surfaceLight], [0.35, pal.surface], [1, pal.surfaceDark]]);
  ctx.fill(moss);
  // Liane enroulée (deux bandes en diagonale)
  for (const [ya, yb] of [[-52, -86], [-128, -160]] as const) {
    const vine = new Path2D();
    vine.moveTo(-R - 4, ya);
    vine.bezierCurveTo(-R * 0.4, ya - 2, R * 0.4, yb + 4, R + 4, yb);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 6.5;
    ctx.stroke(vine);
    ctx.strokeStyle = '#1f9a74';
    ctx.lineWidth = 3.6;
    ctx.stroke(vine);
    ctx.strokeStyle = 'rgba(160,255,220,0.5)';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(0, -1.2);
    ctx.stroke(vine);
    ctx.restore();
  }
  // Spores lumineuses
  for (const [x, y, c] of [[-18, -40, pal.bioA], [14, -70, pal.bioB], [-6, -104, pal.bioA], [22, -140, pal.bioA], [-26, -178, pal.bioB], [6, -24, pal.bioB]] as const) {
    glowDot(ctx, x, y, 1.3, c);
  }
  ctx.restore();
  // Liseré lumineux de la mousse
  glow(ctx, pal.surfaceGlow, 6, () => {
    ctx.strokeStyle = pal.surfaceLight;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let y = -16; y >= -L + 14; y -= 6) {
      const x = trunkEdge(y, -1) - 0.5;
      if (y === -16) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  // Champignons-consoles du côté droit
  for (const [y, s] of [[-38, 1], [-54, 0.7], [-152, 0.8]] as const) {
    const x = trunkEdge(y, 1) - 3;
    const shelf = new Path2D();
    shelf.moveTo(x, y - 6 * s);
    shelf.quadraticCurveTo(x + 18 * s, y - 9 * s, x + 20 * s, y);
    shelf.quadraticCurveTo(x + 10 * s, y + 4 * s, x, y + 2 * s);
    shelf.closePath();
    softDot(ctx, x + 10 * s, y + 3 * s, 12 * s, pal.bioA, 0.35);
    fillOutlined(ctx, shelf, linGrad(ctx, 0, y - 8 * s, 0, y + 3 * s, [[0, '#f4ecff'], [1, '#9a86d0']]), pal.outline, 1.8);
    glow(ctx, pal.bioA, 6, () => {
      ctx.strokeStyle = mix(pal.bioA, '#ffffff', 0.3);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 1.6 * s);
      ctx.quadraticCurveTo(x + 10 * s, y + 3.4 * s, x + 19 * s, y + 0.4);
      ctx.stroke();
    });
  }
}

/** Souche et racines (repère de la frame), au pied du pivot ; `broken` : cassure à vif (bois clair). */
function trunkStump(ctx: Ctx, pal: ThemePalette, broken: boolean): void {
  const cx = TRUNK.pivotX;
  const ty = TRUNK.pivotY;
  const R = TRUNK.radius;
  const k = R / 44;
  // Racines (courtes à gauche : la frame s'arrête à x = 0)
  for (const [s, len, y0, th] of [[-1, 10, 232, 10], [-1, 6, 244, 7], [1, 34, 226, 11], [1, 58, 242, 8]] as const) {
    const root = new Path2D();
    const x0 = cx + s * (R - 6);
    root.moveTo(x0, y0 - th);
    root.quadraticCurveTo(x0 + s * len * 0.55, y0 - th * 0.4, x0 + s * len, 256.5);
    root.lineTo(x0 + s * (len - th * 1.6), 256.5);
    root.quadraticCurveTo(x0 + s * len * 0.35, y0 + th * 0.7, x0, y0 + th);
    root.closePath();
    fillOutlined(ctx, root, barkGrad(ctx, x0 - 20, x0 + 30), pal.outline, 2.4);
  }
  // Souche
  const jag: [number, number][] = [
    [-44, 2],
    [-34, -8],
    [-26, 4],
    [-16, -4],
    [-6, 9],
    [4, -6],
    [14, 6],
    [24, -3],
    [34, 7],
    [44, -2],
  ].map(([x, y]) => [x * k, y] as [number, number]);
  const w = R + 2;
  const st = new Path2D();
  st.moveTo(cx - w - 2, 256.5);
  st.bezierCurveTo(cx - w - 1, 244, cx - w + 1, 230, cx + jag[0][0], ty + jag[0][1]);
  for (const [x, y] of jag) st.lineTo(cx + x, ty + y);
  st.bezierCurveTo(cx + w - 1, 230, cx + w + 1, 244, cx + w + 2, 256.5);
  st.closePath();
  if (broken) {
    // Bois à vif au sommet (derrière le contour)
    const wood = new Path2D();
    wood.moveTo(cx + jag[0][0], ty + jag[0][1]);
    for (const [x, y] of jag) wood.lineTo(cx + x, ty + y);
    for (let i = jag.length - 1; i >= 0; i--) wood.lineTo(cx + jag[i][0] * 0.9, ty + jag[i][1] * 0.4 + 12);
    wood.closePath();
    ctx.fillStyle = barkGrad(ctx, cx - w, cx + w);
    ctx.fill(st);
    ctx.fillStyle = linGrad(ctx, 0, ty - 8, 0, ty + 14, [[0, WOOD[0]], [0.5, WOOD[1]], [1, WOOD[2]]]);
    ctx.fill(wood);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.stroke(st);
  } else {
    fillOutlined(ctx, st, barkGrad(ctx, cx - w, cx + w), pal.outline, 3);
  }
  ctx.save();
  ctx.clip(st);
  ctx.strokeStyle = 'rgba(18,6,28,0.5)';
  ctx.lineWidth = 2;
  for (const i of [-2, -1, 0, 1, 2]) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 15 * k + 3, ty + 8);
    ctx.quadraticCurveTo(cx + i * 17 * k, 236, cx + i * 19 * k + 2, 258);
    ctx.stroke();
  }
  ctx.restore();
  // Mousse au pied
  for (const [x, tw] of [[cx - 52, 18], [cx - 10, 26], [cx + 40, 20], [cx + 86, 16]] as const) {
    const w = tw;
    const tuft = new Path2D();
    tuft.moveTo(x - w / 2, 257);
    tuft.quadraticCurveTo(x - w / 4, 247, x, 250);
    tuft.quadraticCurveTo(x + w / 4, 245, x + w / 2, 257);
    tuft.closePath();
    fillOutlined(ctx, tuft, linGrad(ctx, 0, 245, 0, 256, [[0, pal.surfaceLight], [0.45, pal.surface], [1, pal.surfaceDark]]), pal.outline, 1.8);
  }
  glowDot(ctx, cx - 18, 236, 1.2, pal.bioB);
  glowDot(ctx, cx + 22, 226, 1.2, pal.bioA);
}

/** Feuilles qui tombent (repère de la frame). */
function fallingLeaves(ctx: Ctx, pal: ThemePalette, pts: readonly (readonly [number, number, number])[]): void {
  for (const [x, y, a] of pts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    fillOutlined(ctx, ellipse(0, 0, 5, 2.2), '#2ad8a0', pal.outline, 1.3);
    ctx.restore();
  }
}

/** Nuage de poussière (repère de la frame). */
function dustCloud(ctx: Ctx, pal: ThemePalette, x: number, y: number, r: number, a: number): void {
  const col = mix(pal.soilLight, '#d8c8f0', 0.35);
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(mix(col, '#ffffff', 0.3), a));
  g.addColorStop(0.6, rgba(col, a * 0.75));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * Tronc abattu (256x256, origine conseillée en bas à gauche) : 0 debout, 1-2 debout qui tremble (penché de
 * ±2°, feuilles qui tombent), 3-5 chute vers la droite autour de la cassure (traînée, poussière à l'impact),
 * 6 couché sur 4 tuiles (souche à gauche). Debout, il est décor ; couché, il barre le chemin (voir TRUNK).
 */
export function drawTrunk(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const f = Math.max(0, Math.min(TRUNK_ANGLE.length - 1, frame | 0));
  const a = TRUNK_ANGLE[f];
  const px = TRUNK.pivotX;
  const py = TRUNK.pivotY;
  // Traînée de la chute (derrière)
  if (f >= 3 && f <= 5) {
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.32 - k * 0.08})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rr = TRUNK.length + 6 - k * 26;
      ctx.arc(px, py, rr, -Math.PI / 2 + a - 0.32 + k * 0.05, -Math.PI / 2 + a - 0.06);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  trunkBody(ctx, pal);
  ctx.restore();
  trunkStump(ctx, pal, f >= 3);
  // Feuilles et poussière
  if (f === 1) fallingLeaves(ctx, pal, [[30, 22, 0.6], [92, 40, -0.4], [12, 70, 1.2]]);
  else if (f === 2) fallingLeaves(ctx, pal, [[36, 40, -0.3], [98, 62, 0.9], [8, 96, 0.2], [70, 12, 1.4]]);
  else if (f === 3) fallingLeaves(ctx, pal, [[60, 30, 0.8], [130, 50, -0.6], [20, 120, 0.4]]);
  else if (f === 4) fallingLeaves(ctx, pal, [[150, 70, 0.2], [96, 100, -1], [40, 150, 0.7]]);
  if (f === 1 || f === 2) {
    dustCloud(ctx, pal, px - 40, 248, 12, 0.45);
    dustCloud(ctx, pal, px + 44, 250, 10, 0.4);
  }
  if (f === 5) {
    for (const [x, y, rr] of [[130, 244, 22], [170, 238, 28], [212, 242, 26], [246, 248, 18], [100, 250, 14]] as const) {
      dustCloud(ctx, pal, x, y, rr, 0.6);
    }
    for (const [x, y, rr] of [[150, 214, 3], [196, 206, 2.5], [232, 220, 3.5], [118, 226, 2]] as const) {
      fillOutlined(ctx, ellipse(x, y, rr, rr * 0.8), pal.soilLight, pal.outline, 1.4);
    }
  }
}

// ================================================================ Tess, mécanicienne naufragée (64x80)

const TS_OUT = '#120c24';
const TS_SUIT = '#ffd286';
const TS_SUIT_MID = '#f7a33c';
const TS_SUIT_SHADE = '#bc5f1a';
const TS_SUIT_FAR = '#d48434';
const TS_PATCH = '#3d2c5e';
const TS_BOOT = '#4b3b70';
const TS_BOOT_DARK = '#2a1f46';
const TS_HAIR = '#ff5a8a';
const TS_HAIR_DARK = '#a82460';
const TS_MINT = '#5dffc8';
const TS_SHELL = '#f6f8ff';
const TS_SHELL_SHADE = '#8f98c2';

const TS_W = 64;
const TS_H = 80;
const TS_HIP_X = 30;
const TS_HIP_Y = 52;
const TS_THIGH = 11;
const TS_SHIN = 10;
const TS_ANKLE = TS_H - 7.2;

interface TessPose {
  by: number;
  lean: number;
  aThigh: number;
  aKnee: number;
  bThigh: number;
  bKnee: number;
  /** Bras proche (devant le corps) et lointain : angle d'épaule (0 = vers le bas, π = vers le haut) et coude. */
  armA: number;
  elbowA: number;
  armB: number;
  elbowB: number;
  /** Balancement de la queue de cheval (-1..1) et intensité de la lampe frontale (0..1). */
  hair: number;
  lamp: number;
  /** Main proche ouverte (salut), bras proche allongé d'autant (px par segment) pour lever la main devant la visière. */
  open?: boolean;
  reach?: number;
}

function tessIdle(i: number): TessPose {
  return {
    by: i === 1 ? 0.8 : 0,
    lean: 0.03,
    aThigh: 0.15,
    aKnee: 0.1,
    bThigh: -0.17,
    bKnee: 0.08,
    // Main proche posée sur la hanche, bras lointain le long du corps
    armA: -0.35,
    elbowA: 1.3,
    armB: 0.22,
    elbowB: 0.35,
    hair: i === 1 ? 1 : 0,
    lamp: i === 1 ? 0.55 : 1,
  };
}

/** Salut : bras levé vers l'avant, avant-bras qui balance de 20° à 50° de la verticale, main devant la visière. */
function tessWave(i: number): TessPose {
  return {
    by: i === 1 ? -0.4 : 0,
    lean: -0.04,
    aThigh: 0.15,
    aKnee: 0.1,
    bThigh: -0.17,
    bKnee: 0.08,
    armA: i === 0 ? 1.66 : 1.75,
    elbowA: i === 0 ? 1.13 : 0.52,
    armB: -0.3,
    elbowB: 1.25,
    hair: i === 0 ? -1 : 1,
    lamp: 1,
    open: true,
    reach: 1.75,
  };
}

const TESS_POSES: TessPose[] = [tessIdle(0), tessIdle(1), tessWave(0), tessWave(1)];

function tessLeg(hx: number, hy: number, thigh: number, knee: number): { kx: number; ky: number; ax: number; ay: number; s: number } {
  const kx = hx + Math.sin(thigh) * TS_THIGH;
  const ky = hy + Math.cos(thigh) * TS_THIGH;
  const s = thigh - knee;
  return { kx, ky, ax: kx + Math.sin(s) * TS_SHIN, ay: ky + Math.cos(s) * TS_SHIN, s };
}

/** Hanches de la pose, recalées pour que le pied le plus bas touche le sol. */
function tessHip(pose: TessPose): { x: number; y: number } {
  const a = tessLeg(TS_HIP_X, TS_HIP_Y, pose.aThigh, pose.aKnee).ay;
  const b = tessLeg(TS_HIP_X, TS_HIP_Y, pose.bThigh, pose.bKnee).ay;
  return { x: TS_HIP_X, y: TS_HIP_Y + pose.by + (TS_ANKLE - Math.max(a, b)) };
}

function drawTessLeg(ctx: Ctx, hx: number, hy: number, thigh: number, knee: number, far: boolean): void {
  const p = tessLeg(hx, hy, thigh, knee);
  const col = far ? TS_SUIT_FAR : TS_SUIT_MID;
  limb(ctx, hx, hy, p.kx, p.ky, 8.5, linGrad(ctx, hx - 5, 0, hx + 5, 0, [[0, far ? TS_SUIT_SHADE : TS_SUIT_FAR], [0.6, col], [1, far ? col : TS_SUIT]]), TS_OUT, 2.2);
  limb(ctx, p.kx, p.ky, p.ax, p.ay, 8, col, TS_OUT, 2.2);
  // Genouillère sombre
  fillOutlined(ctx, circle(p.kx + 0.8, p.ky, 3.1), far ? TS_BOOT_DARK : TS_PATCH, TS_OUT, 1.2);
  // Botte et semelle lumineuse menthe
  const dx = Math.sin(p.s);
  const dy = Math.cos(p.s);
  const bx = p.ax + dx * 1.6;
  const by = p.ay + dy * 1.6;
  limb(ctx, bx - dy * 2.2, by + dx * 2.2, bx + dy * 5.5, by - dx * 5.5, 6.5, far ? TS_BOOT_DARK : TS_BOOT, TS_OUT, 2);
  ctx.strokeStyle = far ? rgba(TS_MINT, 0.45) : TS_MINT;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(bx - dy * 2.5 + dx * 3, by + dx * 2.5 + dy * 3);
  ctx.lineTo(bx + dy * 5.5 + dx * 3, by - dx * 5.5 + dy * 3);
  ctx.stroke();
}

function drawTessArm(ctx: Ctx, sx: number, sy: number, arm: number, elbow: number, far: boolean, open: boolean, reach = 0): void {
  const ex = sx + Math.sin(arm) * (8.5 + reach);
  const ey = sy + Math.cos(arm) * (8.5 + reach);
  const fa = arm + elbow;
  const wx = ex + Math.sin(fa) * (8 + reach);
  const wy = ey + Math.cos(fa) * (8 + reach);
  const col = far ? TS_SUIT_FAR : TS_SUIT_MID;
  limb(ctx, sx, sy, ex, ey, 6.6, far ? TS_SUIT_FAR : linGrad(ctx, sx - 4, 0, sx + 4, 0, [[0, TS_SUIT_FAR], [1, TS_SUIT]]), TS_OUT, 2.2);
  limb(ctx, ex, ey, wx, wy, 6, col, TS_OUT, 2.2);
  // Manchette menthe et gant sombre
  ctx.strokeStyle = far ? rgba(TS_MINT, 0.5) : TS_MINT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const cx = ex + Math.sin(fa) * 5.6;
  const cy = ey + Math.cos(fa) * 5.6;
  ctx.moveTo(cx - Math.cos(fa) * 3, cy + Math.sin(fa) * 3);
  ctx.lineTo(cx + Math.cos(fa) * 3, cy - Math.sin(fa) * 3);
  ctx.stroke();
  const hx = wx + Math.sin(fa) * 1.2;
  const hy = wy + Math.cos(fa) * 1.2;
  if (open) {
    // Main ouverte : paume, pouce et doigts
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-fa + Math.PI);
    fillOutlined(ctx, roundRect(-3.4, -6.5, 6.8, 8, 2.6), TS_PATCH, TS_OUT, 1.8);
    fillOutlined(ctx, ellipse(4, -0.5, 1.6, 3, -0.6), TS_PATCH, TS_OUT, 1.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1.2, -6);
    ctx.lineTo(-1.2, -3);
    ctx.moveTo(1.2, -6);
    ctx.lineTo(1.2, -3);
    ctx.stroke();
    ctx.restore();
  } else {
    fillOutlined(ctx, circle(hx, hy, 3.3), far ? TS_BOOT_DARK : TS_PATCH, TS_OUT, 1.8);
  }
}

function drawTessBody(ctx: Ctx, pose: TessPose): void {
  const hip = tessHip(pose);
  const hx = hip.x;
  const hy = hip.y;
  const lean = pose.lean;
  const rotP = (x: number, y: number) => ({
    x: hx + x * Math.cos(lean) - y * Math.sin(lean),
    y: hy + x * Math.sin(lean) + y * Math.cos(lean),
  });
  const shFar = rotP(-3, -17);
  const shNear = rotP(3, -17);
  const head = rotP(3, -31);

  // Bras et jambe lointains
  drawTessArm(ctx, shFar.x, shFar.y, pose.armB, pose.elbowB, true, false);
  drawTessLeg(ctx, hx - 2.5, hy, pose.bThigh, pose.bKnee, true);

  // Clé à molette portée dans le dos
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean);
  // (acier bleuté, plus sombre que le casque ; mâchoire ouverte vers le haut)
  limb(ctx, -11, -3, -15, -25, 4, linGrad(ctx, -17, 0, -10, 0, [[0, '#5c6288'], [0.5, '#b8c0e0'], [1, '#3a3f62']]), TS_OUT, 2);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = TS_OUT;
  ctx.lineWidth = 7.4;
  ctx.beginPath();
  ctx.arc(-15.6, -29.5, 4.6, -Math.PI / 2 + 0.7, Math.PI * 1.5 - 0.7);
  ctx.stroke();
  ctx.strokeStyle = '#a4abcc';
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.restore();

  drawTessLeg(ctx, hx + 1.5, hy, pose.aThigh, pose.aKnee, false);

  // Torse : combinaison ambre, bavette, ceinture à outils
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean);
  const torso = roundRect(-9.5, -22, 20, 25, 8);
  fillOutlined(ctx, torso, linGrad(ctx, -10, 0, 11, 0, [[0, TS_SUIT_SHADE], [0.35, TS_SUIT_MID], [0.75, TS_SUIT], [1, TS_SUIT]]), TS_OUT, 2.5);
  rimLight(ctx, torso, 'rgba(255,240,210,0.9)', 1.5, -1.3, 1.4);
  // Bretelles et bavette
  ctx.strokeStyle = TS_PATCH;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -21);
  ctx.lineTo(-4, -12);
  ctx.moveTo(6.5, -21);
  ctx.lineTo(5.5, -12);
  ctx.stroke();
  fillOutlined(ctx, roundRect(-5, -13, 11.5, 9, 2.5), mix(TS_SUIT_MID, TS_SUIT_SHADE, 0.35), 'rgba(18,12,36,0.6)', 1.2);
  glowDot(ctx, 3, -9.5, 1.4, TS_MINT);
  // Ceinture et sacoches
  ctx.fillStyle = TS_PATCH;
  ctx.fillRect(-9.5, -4, 20, 4);
  fillOutlined(ctx, roundRect(-9.5, -3.5, 5.5, 6.5, 1.6), '#8a5a2a', TS_OUT, 1.3);
  fillOutlined(ctx, roundRect(5.5, -3.5, 5, 6, 1.6), '#8a5a2a', TS_OUT, 1.3);
  ctx.fillStyle = TS_MINT;
  ctx.fillRect(0.5, -3.3, 3, 2.6);
  // Tournevis dans la sacoche avant
  ctx.strokeStyle = TS_OUT;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(8, -3.5);
  ctx.lineTo(9, -8);
  ctx.stroke();
  ctx.strokeStyle = TS_MINT;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Queue de cheval (derrière le casque)
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(lean * 0.6);
  const sw = pose.hair * 1.6;
  const tail = new Path2D();
  tail.moveTo(-9, -7);
  tail.bezierCurveTo(-19 - sw, -9, -22 - sw, 2, -18 - sw * 1.4, 12);
  tail.bezierCurveTo(-17 - sw, 6, -14, 1, -9, 2);
  tail.closePath();
  fillOutlined(ctx, tail, linGrad(ctx, -20, -8, -10, 12, [[0, TS_HAIR], [1, TS_HAIR_DARK]]), TS_OUT, 2);
  ctx.strokeStyle = 'rgba(255,220,235,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-13, -6.5);
  ctx.quadraticCurveTo(-19 - sw, -3, -18.5 - sw * 1.3, 6);
  ctx.stroke();
  fillOutlined(ctx, roundRect(-13.5, -6.5, 4, 6, 1.5), TS_MINT, TS_OUT, 1.2);

  // Casque blanc, visière menthe, lampe frontale, écouteur ambre
  fillOutlined(ctx, ellipse(-1, 11, 8.5, 4), TS_PATCH, TS_OUT, 2);
  const shell = circle(0, 0, 12.5);
  fillOutlined(ctx, shell, sphereGrad(ctx, 0, 0, 12.5, '#ffffff', TS_SHELL, TS_SHELL_SHADE), TS_OUT, 2.6);
  rimLight(ctx, shell, 'rgba(120,255,210,0.5)', 1.5, -1.6, -1.2);
  const visor = new Path2D();
  visor.moveTo(-1.5, -8);
  visor.bezierCurveTo(6, -10, 12, -5.5, 11.8, 1);
  visor.bezierCurveTo(11.6, 6.5, 6.5, 8.6, 1, 8);
  visor.bezierCurveTo(-3, 7.4, -4, 3.5, -3.8, -1.5);
  visor.bezierCurveTo(-3.6, -5, -3, -7, -1.5, -8);
  visor.closePath();
  glow(ctx, TS_MINT, 8, () => {
    ctx.fillStyle = linGrad(ctx, 0, -9, 0, 9, [[0, '#e6fff6'], [0.4, TS_MINT], [1, '#0f8a6e']]);
    ctx.fill(visor);
  });
  ctx.strokeStyle = TS_OUT;
  ctx.lineWidth = 1.6;
  ctx.stroke(visor);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(3.5, 0.5, 6, -2.3, -1.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(8.8, -3.2, 1.1, 0, TAU);
  ctx.fill();
  // Écouteur
  fillOutlined(ctx, circle(-5, 2, 3.2), TS_SUIT_MID, TS_OUT, 1.6);
  // Lampe frontale, posée sur le haut avant du casque
  ctx.save();
  ctx.translate(6.4, -11.4);
  ctx.rotate(0.52);
  fillOutlined(ctx, roundRect(-3.6, -2.4, 7.2, 4.8, 1.6), '#5a6288', TS_OUT, 1.5);
  if (pose.lamp > 0) softDot(ctx, 5, 0, 6 + 4 * pose.lamp, '#ffe27a', 0.55 * pose.lamp);
  glowDot(ctx, 3.4, 0, 1.3, '#fff2b0');
  ctx.restore();
  ctx.restore();

  // Bras proche (devant le torse)
  drawTessArm(ctx, shNear.x, shNear.y, pose.armA, pose.elbowA, false, !!pose.open, pose.reach ?? 0);
}

let tessScratch: Surface | null = null;

/** Canvas de travail réutilisé (64x80) pour la dissolution : aucune allocation d'une frame à l'autre. */
function tessCanvas(): Surface {
  if (!tessScratch) tessScratch = makeCanvas(TS_W, TS_H);
  return tessScratch;
}

/** Colonne de lumière de LUMA (derrière ou devant), de demi-largeur w. */
function beamColumn(ctx: Ctx, w: number, a: number): void {
  const g = ctx.createLinearGradient(32 - w, 0, 32 + w, 0);
  g.addColorStop(0, rgba(BEAM, 0));
  g.addColorStop(0.3, rgba(BEAM, 0.25 * a));
  g.addColorStop(0.5, rgba('#e8ffff', 0.6 * a));
  g.addColorStop(0.7, rgba(BEAM, 0.25 * a));
  g.addColorStop(1, rgba(BEAM, 0));
  ctx.fillStyle = g;
  ctx.fillRect(32 - w, 0, w * 2, TS_H);
}

/** Particules qui montent (téléportation). */
function beamMotes(ctx: Ctx, seed: number, n: number, spread: number, rise: number): void {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const x = 32 + (r() - 0.5) * 2 * spread;
    const y = 6 + r() * 68 - rise * r();
    if (y < 1) continue;
    const big = r() < 0.3;
    glowDot(ctx, x, y, big ? 1.3 : 0.8, k % 3 === 0 ? '#ffffff' : BEAM);
  }
}

/** Anneau lumineux horizontal (perspective) autour de la colonne. */
function beamRing(ctx: Ctx, y: number, rx: number, a: number): void {
  glow(ctx, BEAM, 8, () => {
    ctx.strokeStyle = rgba('#c9fdff', a);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(32, y, rx, rx * 0.28, 0, 0, TAU);
    ctx.stroke();
  });
}

/**
 * Tess, mécanicienne naufragée (64x80, même échelle et même construction que Kaï, tournée vers la droite) :
 * combinaison ambre, casque blanc à visière menthe, queue de cheval rose, clé à molette dans le dos.
 * Frames : 0-1 repos (main sur la hanche), 2-3 salut, 4-7 téléportée par LUMA (dissolution en lumière cyan ;
 * la frame 7 ne garde qu'un trait de lumière, puis on cache le sprite).
 */
export function drawTess(ctx: Ctx, _theme: ThemeId, frame: number): void {
  const f = Math.max(0, Math.min(7, frame | 0));
  if (f < 4) {
    drawTessBody(ctx, TESS_POSES[f]);
    return;
  }
  const k = f - 4;
  // Colonne de lumière derrière
  beamColumn(ctx, [18, 15, 11, 5][k], [0.55, 0.8, 1, 0.9][k]);
  if (k < 3) {
    const s = tessCanvas();
    const c = s.ctx;
    c.clearRect(0, 0, TS_W, TS_H);
    c.globalCompositeOperation = 'source-over';
    drawTessBody(c, TESS_POSES[0]);
    // Teinte cyan croissante, puis tranches effacées (de bas en haut)
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = rgba(k === 2 ? '#e8ffff' : BEAM, [0.35, 0.62, 0.92][k]);
    c.fillRect(0, 0, TS_W, TS_H);
    if (k > 0) {
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000000';
      const from = k === 1 ? 46 : 0;
      for (let y = TS_H; y > from; y -= 4) {
        const t = (TS_H - y) / (TS_H - from);
        const h = (k === 1 ? 2.6 : 2.2) * (1 - t * 0.55);
        c.fillRect(0, y - h, TS_W, h);
      }
      if (k === 2) {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(0, 0, TS_W, TS_H);
      }
    }
    c.globalCompositeOperation = 'source-over';
    glow(ctx, BEAM, k === 2 ? 12 : 8, () => {
      ctx.drawImage(s.canvas, 0, 0);
    });
  }
  // Anneaux, cœur de la colonne et particules
  beamRing(ctx, 74, [16, 14, 11, 7][k], [0.9, 0.8, 0.7, 0.5][k]);
  if (k < 3) beamRing(ctx, [40, 30, 18][k], [13, 11, 9][k], 0.6);
  if (k >= 2) {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, TS_H, [[0, 'rgba(255,255,255,0)'], [0.3, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0.95)']]);
    ctx.fillRect(32 - (k === 3 ? 1.6 : 1), 0, k === 3 ? 3.2 : 2, TS_H);
  }
  beamMotes(ctx, 500 + k, [8, 14, 18, 12][k], [16, 15, 12, 7][k], [0, 10, 20, 30][k]);
}

// ================================================================ Capsule de survie écrasée (128x128 = 2x2 tuiles)

/** Coque de la capsule dans son repère (nez arrondi à gauche en x = -47, tuyère à droite en x = 50). */
function capsulePod(ctx: Ctx, pal: ThemePalette, frame: number): void {
  const on = frame % 2 === 0;
  // Ailerons : celui du haut tordu, celui du bas arraché (derrière la coque)
  fillOutlined(ctx, poly([20, -27, 32, -27, 44, -42, 36, -43]), linGrad(ctx, 26, -43, 38, -27, [[0, '#c9cfe8'], [1, '#5c6288']]), pal.outline, 2.2);
  fillOutlined(ctx, poly([22, 27, 34, 27, 40, 35, 27, 35]), '#5c6288', pal.outline, 2);
  // Petite tuyère
  const bell = poly([40, -9, 50, -13, 50, 13, 40, 9]);
  fillOutlined(ctx, bell, linGrad(ctx, 0, -13, 0, 13, [[0, '#7a82a8'], [0.4, '#3a3f62'], [1, '#1e2038']]), pal.outline, 2.2);
  fillOutlined(ctx, ellipse(50, 0, 2.4, 12), '#1a0c14', pal.outline, 1.6);
  softDot(ctx, 50, 1, 8, '#ff6a2a', on ? 0.6 : 0.4);
  // Coque : capsule ventrue, nez en demi-cercle, arrière aux coins arrondis
  const hull = new Path2D();
  hull.moveTo(-18, -29);
  hull.lineTo(24, -29);
  hull.quadraticCurveTo(42, -29, 42, -12);
  hull.lineTo(42, 12);
  hull.quadraticCurveTo(42, 29, 24, 29);
  hull.lineTo(-18, 29);
  hull.arc(-18, 0, 29, Math.PI / 2, Math.PI * 1.5);
  hull.closePath();
  fillOutlined(ctx, hull, linGrad(ctx, 0, -29, 0, 29, [[0, '#ffffff'], [0.3, '#e2e6f8'], [0.75, '#a4abcc'], [1, '#5c6288']]), pal.outline, 2.8);
  ctx.save();
  ctx.clip(hull);
  // Bandes ambre (les couleurs de Tess)
  ctx.fillStyle = TS_SUIT_MID;
  ctx.fillRect(-10, -32, 8, 64);
  ctx.fillRect(26, -32, 3.5, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-10, -32, 2, 64);
  ctx.strokeStyle = rgba(pal.outline, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-10, -32);
  ctx.lineTo(-10, 32);
  ctx.moveTo(-2, -32);
  ctx.lineTo(-2, 32);
  ctx.moveTo(-34, -24);
  ctx.quadraticCurveTo(-25, -4, -34, 24);
  ctx.moveTo(10, 29);
  ctx.lineTo(10, 20);
  ctx.lineTo(34, 20);
  ctx.stroke();
  // Brûlure de rentrée sur le nez, traînées vers l'arrière
  const burn = ctx.createRadialGradient(-46, 8, 2, -40, 6, 38);
  burn.addColorStop(0, 'rgba(26,10,22,0.92)');
  burn.addColorStop(0.5, 'rgba(60,24,40,0.55)');
  burn.addColorStop(1, 'rgba(60,24,40,0)');
  ctx.fillStyle = burn;
  ctx.fillRect(-50, -32, 60, 64);
  ctx.strokeStyle = 'rgba(30,12,26,0.45)';
  ctx.lineWidth = 2;
  for (const y of [-14, -2, 12, 20]) {
    ctx.beginPath();
    ctx.moveTo(-30, y);
    ctx.lineTo(-12 + (y % 7) * 2, y + 1);
    ctx.stroke();
  }
  // Panneau arraché : fils et étincelles
  fillOutlined(ctx, poly([16, 5, 27, 3, 30, 13, 23, 17, 17, 14]), '#1a1028', pal.outline, 1.4);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = TS_SUIT_MID;
  ctx.beginPath();
  ctx.moveTo(21, 10);
  ctx.quadraticCurveTo(27, 19, 32, 16);
  ctx.stroke();
  ctx.strokeStyle = BEAM;
  ctx.beginPath();
  ctx.moveTo(24, 9);
  ctx.quadraticCurveTo(28, 3, 34, 7);
  ctx.stroke();
  ctx.restore();
  rimLight(ctx, hull, 'rgba(255,255,255,0.75)', 1.6, 1.2, 1.6);
  // Hublot ouvert : cadre épais à rivets, intérieur chaud, siège
  const hole = circle(8, -6, 11.5);
  fillOutlined(ctx, hole, '#160c1e', pal.outline, 2.4);
  ctx.save();
  ctx.clip(hole);
  softDot(ctx, 6, -2, 14, '#ffb347', on ? 0.6 : 0.45);
  fillOutlined(ctx, roundRect(0, -10, 8, 14, 3), '#5a3a6a', pal.outline, 1.4);
  ctx.restore();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  ctx.arc(8, -6, 13.4, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#eef0ff';
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.fillStyle = '#7a82a8';
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3;
    ctx.beginPath();
    ctx.arc(8 + Math.cos(a) * 13.4, -6 + Math.sin(a) * 13.4, 0.9, 0, TAU);
    ctx.fill();
  }
  // Trappe pendue à sa charnière
  ctx.save();
  ctx.translate(20, -19);
  ctx.rotate(-0.9);
  fillOutlined(ctx, ellipse(10, 0, 11.5, 4.2), linGrad(ctx, 0, -4, 0, 4, [[0, '#eef0ff'], [1, '#7a82a8']]), pal.outline, 2);
  ctx.strokeStyle = TS_SUIT_MID;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(10, 0, 8, 2.4, 0, Math.PI, TAU);
  ctx.stroke();
  ctx.restore();
  // Antenne et feu de détresse
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, -28);
  ctx.lineTo(-15, -42);
  ctx.stroke();
  ctx.strokeStyle = '#c9cfe8';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  if (on) {
    softDot(ctx, -15.5, -44, 16, '#ff5a3a', 0.55);
    glowDot(ctx, -15.5, -44, 2.6, '#ff6a3a');
  } else {
    fillOutlined(ctx, circle(-15.5, -44, 2.4), '#6a1a1a', pal.outline, 1.2);
  }
  // Étincelles du panneau (alternent)
  const sp = on ? [[33, 5, 1.2], [37, 11, 0.9], [30, 0, 0.8]] : [[35, 15, 1.1], [39, 7, 0.8]];
  for (const [x, y, r] of sp) glowDot(ctx, x, y, r, '#fff2b0');
}

/**
 * Capsule de survie de Tess, écrasée nez dans le sol (128x128, origine conseillée en bas au centre) : coque
 * blanche à bandes ambre, nez brûlé, hublot ouvert, aileron tordu, tuyère qui fume. Frames 0-1 : feu de
 * détresse allumé / éteint, fumée et étincelles qui changent (≈ 2 images/s).
 */
export function drawCapsule(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const f = frame % 2;
  // Fumée de la tuyère (derrière)
  const smoke = f === 0 ? [[114, 58, 7, 0.5], [108, 44, 9, 0.42], [100, 29, 11, 0.32]] : [[116, 61, 6, 0.5], [106, 49, 9, 0.42], [97, 34, 11, 0.34], [90, 20, 11, 0.2]];
  for (const [x, y, r, a] of smoke) dustCloud(ctx, pal, x, y, r, a);
  // Jambe de train tordue (derrière)
  limb(ctx, 104, 102, 112, 126, 4, '#7a82a8', pal.outline, 2);
  fillOutlined(ctx, roundRect(105, 124, 14, 4, 1.5), '#5c6288', pal.outline, 1.6);
  // Coque, inclinée nez en bas
  ctx.save();
  ctx.translate(66, 88);
  ctx.rotate(-0.38);
  capsulePod(ctx, pal, f);
  ctx.restore();
  // Monticule de terre soulevé devant le nez, mousse arrachée, mottes
  const mound = new Path2D();
  mound.moveTo(-2, 128.5);
  mound.quadraticCurveTo(2, 108, 14, 104);
  mound.quadraticCurveTo(24, 98, 32, 106);
  mound.quadraticCurveTo(42, 112, 50, 116);
  mound.quadraticCurveTo(62, 120, 70, 128.5);
  mound.closePath();
  fillOutlined(ctx, mound, linGrad(ctx, 0, 98, 0, 128, [[0, pal.soilLight], [0.45, pal.soil], [1, pal.soilDeep]]), pal.outline, 2.4);
  for (const [x0, x1, y] of [[6, 22, 106], [30, 44, 110]] as const) {
    const moss = new Path2D();
    moss.moveTo(x0, y + 2);
    moss.quadraticCurveTo((x0 + x1) / 2, y - 5, x1, y + 2);
    moss.quadraticCurveTo((x0 + x1) / 2, y + 1, x0, y + 2);
    moss.closePath();
    fillOutlined(ctx, moss, linGrad(ctx, 0, y - 4, 0, y + 2, [[0, pal.surfaceLight], [1, pal.surfaceDark]]), pal.outline, 1.6);
  }
  for (const [x, y, r] of [[78, 124, 3.5], [90, 126, 2.5], [6, 96, 2.6], [54, 104, 2.2], [24, 92, 1.8]] as const) {
    fillOutlined(ctx, ellipse(x, y, r, r * 0.75), pal.soilLight, pal.outline, 1.4);
  }
  glowDot(ctx, 20, 116, 1.1, pal.bioA);
  glowDot(ctx, 44, 120, 1, pal.bioB);
}

// ================================================================ Glyphes astréens (décor de mur 'G', 64x64)

interface GlyphDef {
  path: Path2D;
  dots: readonly (readonly [number, number, number])[];
}

function glyphDefs(): GlyphDef[] {
  // 0 : réseau (anneau et quatre traits, comme les portes)
  const net = new Path2D();
  net.moveTo(39, 33);
  net.arc(32, 33, 7, 0, TAU);
  net.moveTo(32, 18);
  net.lineTo(32, 23);
  net.moveTo(32, 43);
  net.lineTo(32, 48);
  net.moveTo(17, 33);
  net.lineTo(22, 33);
  net.moveTo(42, 33);
  net.lineTo(47, 33);
  // 1 : chaîne de portails
  const chain = new Path2D();
  for (const [x, y] of [[20, 41], [32, 24], [44, 41]] as const) {
    chain.moveTo(x + 5.5, y);
    chain.arc(x, y, 5.5, 0, TAU);
  }
  chain.moveTo(23.5, 36.5);
  chain.lineTo(28.6, 28.4);
  chain.moveTo(35.4, 28.4);
  chain.lineTo(40.5, 36.5);
  chain.moveTo(25.5, 41);
  chain.lineTo(38.5, 41);
  // 2 : le gardien (méduse-baleine)
  const whale = new Path2D();
  whale.moveTo(17, 34);
  whale.bezierCurveTo(17, 15, 47, 15, 47, 34);
  whale.quadraticCurveTo(43.5, 31, 40, 34);
  whale.quadraticCurveTo(36, 31, 32, 34);
  whale.quadraticCurveTo(28, 31, 24, 34);
  whale.quadraticCurveTo(20.5, 31, 17, 34);
  for (const x of [22, 29, 36, 43]) {
    whale.moveTo(x, 36);
    whale.bezierCurveTo(x - 3, 40, x + 3, 44, x - 1, 50);
  }
  // 3 : le noyau
  const core = new Path2D();
  core.moveTo(32, 16);
  core.lineTo(48, 33);
  core.lineTo(32, 50);
  core.lineTo(16, 33);
  core.closePath();
  core.moveTo(32, 25);
  core.lineTo(40, 33);
  core.lineTo(32, 41);
  core.lineTo(24, 33);
  core.closePath();
  // 4 : un Astréen, bras levés, auréole
  const fig = new Path2D();
  fig.moveTo(35.5, 21);
  fig.arc(32, 21, 3.5, 0, TAU);
  fig.moveTo(32, 26);
  fig.lineTo(25, 49);
  fig.lineTo(39, 49);
  fig.closePath();
  fig.moveTo(31, 30);
  fig.lineTo(21, 22);
  fig.moveTo(33, 30);
  fig.lineTo(43, 22);
  fig.moveTo(32 + 9 * Math.cos(Math.PI * 1.12), 21 + 9 * Math.sin(Math.PI * 1.12));
  fig.arc(32, 21, 9, Math.PI * 1.12, Math.PI * 1.88);
  // 5 : spirale de la Faille
  const spiral = new Path2D();
  for (let a = 0; a <= TAU * 2.1; a += 0.2) {
    const rr = 1.5 + a * 1.62;
    const x = 32 + Math.cos(a) * rr;
    const y = 34 + Math.sin(a) * rr;
    if (a === 0) spiral.moveTo(x, y);
    else spiral.lineTo(x, y);
  }
  return [
    { path: net, dots: [[32, 33, 2]] },
    { path: chain, dots: [[20, 41, 1.6], [32, 24, 1.6], [44, 41, 1.6]] },
    { path: whale, dots: [[37, 26, 1.8], [26, 27, 1], [31, 21, 1]] },
    { path: core, dots: [[32, 33, 2.2], [32, 12, 1.2], [52, 33, 1.2], [32, 54, 1.2], [12, 33, 1.2]] },
    { path: fig, dots: [[32, 21, 1.2], [21, 22, 1.2], [43, 22, 1.2]] },
    { path: spiral, dots: [[32, 34, 1.6], [17, 18, 1.3], [48, 20, 1.2], [47, 49, 1.4]] },
  ];
}

let glyphCache: GlyphDef[] | null = null;

/** Nombre de motifs de glyphes (frames 0..n-1 éteints, n..2n-1 allumés). */
export const GLYPH_VARIANTS = 6;

/**
 * Glyphe astréen gravé sur une plaque de pierre (64x64, à poser sur le mur du fond de la ruine, cases 'G') :
 * même pierre et mêmes runes néon que les portes. Frames 0-5 éteints (gravure sombre à peine lumineuse), 6-11
 * allumés (gravure pleine de lumière, halo, étincelles). Motifs : réseau, chaîne de portails, gardien (la
 * méduse-baleine), noyau, Astréen, spirale de la Faille. Allumage : afficher l'allumé par-dessus en fondu.
 */
export function drawGlyph(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const f = Math.max(0, Math.min(GLYPH_VARIANTS * 2 - 1, frame | 0));
  const lit = f >= GLYPH_VARIANTS;
  if (!glyphCache) glyphCache = glyphDefs();
  const g = glyphCache[f % GLYPH_VARIANTS];
  // Panneau creusé dans le mur (coins coupés) : plus sombre que les blocs, ombre en haut à gauche, reflet
  // en bas à droite, sans contour épais ni mousse, pour ne pas passer pour un bloc plein.
  const plate = poly([12, 7, 52, 7, 57, 12, 57, 52, 52, 57, 12, 57, 7, 52, 7, 12]);
  if (lit) softDot(ctx, 32, 32, 34, pal.vein, 0.26);
  ctx.fillStyle = linGrad(ctx, 0, 7, 0, 57, [[0, mix(pal.blockDark, pal.outline, 0.45)], [1, mix(pal.blockDark, pal.blockBase, 0.3)]]);
  ctx.fill(plate);
  ctx.save();
  ctx.clip(plate);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 5;
  ctx.translate(2, 2);
  ctx.stroke(plate);
  ctx.restore();
  rimLight(ctx, plate, 'rgba(200,215,255,0.28)', 2, -1.4, -1.4);
  ctx.strokeStyle = rgba(pal.outline, 0.85);
  ctx.lineWidth = 1.4;
  ctx.stroke(plate);
  // Cadre gravé
  const frameP = poly([14, 12, 50, 12, 52, 14, 52, 50, 50, 52, 14, 52, 12, 50, 12, 14]);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.save();
  ctx.translate(0.8, 0.8);
  ctx.stroke(frameP);
  ctx.restore();
  ctx.strokeStyle = rgba(pal.outline, 0.75);
  ctx.lineWidth = 1.4;
  ctx.stroke(frameP);
  // Gravure : creux sombre, reflet décalé
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 3.6;
  ctx.save();
  ctx.translate(0.9, 0.9);
  ctx.stroke(g.path);
  ctx.restore();
  ctx.strokeStyle = rgba(pal.outline, 0.95);
  ctx.lineWidth = 3.4;
  ctx.stroke(g.path);
  if (lit) {
    glow(ctx, pal.vein, 12, () => {
      ctx.strokeStyle = pal.vein;
      ctx.lineWidth = 2.4;
      ctx.stroke(g.path);
    });
    ctx.strokeStyle = mix(pal.veinLight, '#ffffff', 0.4);
    ctx.lineWidth = 1;
    ctx.stroke(g.path);
    for (const [x, y, r] of g.dots) glowDot(ctx, x, y, r, pal.veinLight);
  } else {
    glow(ctx, pal.vein, 3, () => {
      ctx.strokeStyle = rgba(pal.vein, 0.4);
      ctx.lineWidth = 1.4;
      ctx.stroke(g.path);
    });
    for (const [x, y, r] of g.dots) {
      ctx.fillStyle = rgba(pal.vein, 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, TAU);
      ctx.fill();
    }
  }
  // Points gravés des coins
  for (const [x, y] of [[11, 11], [53, 11], [11, 53], [53, 53]] as const) {
    if (lit) glowDot(ctx, x, y, 1.3, pal.vein);
    else {
      ctx.fillStyle = rgba(pal.outline, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, TAU);
      ctx.fill();
    }
  }
  // Racine qui pend sur le coin du panneau (jungle) et poussière de lumière
  if (theme === 'jungle') {
    const root = new Path2D();
    root.moveTo(46, 7);
    root.bezierCurveTo(50, 12, 45, 16, 49, 22);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.stroke(root);
    ctx.strokeStyle = '#1f8a6a';
    ctx.lineWidth = 1.4;
    ctx.stroke(root);
    glowDot(ctx, 49, 23, 1.2, pal.bioB);
  }
  if (lit) {
    for (const [x, y] of [[18, 14], [48, 46], [44, 15]] as const) glowDot(ctx, x, y, 0.9, '#ffffff');
  }
}

// ================================================================ Branches, lianes et passerelles ('=', 64x64)

/** Familles de plateformes traversables ; frame = famille x 3 + variante (0..8). */
export const WALKWAY_FAMILIES = ['branch', 'vine', 'bridge'] as const;
export type WalkwayFamily = (typeof WALKWAY_FAMILIES)[number];

const brTop = (x: number) => 5 + 0.9 * Math.sin((x / T) * TAU * 2 + 0.4);
const brBot = (x: number) => 21 + 1.3 * Math.sin((x / T) * TAU * 3 + 1.1) + 0.6 * Math.sin((x / T) * TAU * 5);

function edgeLine(f: (x: number) => number, dy = 0): Path2D {
  const p = new Path2D();
  for (let x = 0; x <= T; x += 2) {
    if (x === 0) p.moveTo(x, f(x) + dy);
    else p.lineTo(x, f(x) + dy);
  }
  return p;
}

function bandPath(top: (x: number) => number, bot: (x: number) => number): Path2D {
  const p = new Path2D();
  for (let x = 0; x <= T; x += 2) {
    if (x === 0) p.moveTo(x, top(x));
    else p.lineTo(x, top(x));
  }
  for (let x = T; x >= 0; x -= 2) p.lineTo(x, bot(x));
  p.closePath();
  return p;
}

/** Mousse lumineuse sur le dessus (périodique : se raccorde d'une tuile à l'autre). */
function walkMoss(ctx: Ctx, pal: ThemePalette, top: (x: number) => number): void {
  const moss = new Path2D();
  for (let x = 0; x <= T; x += 2) {
    const y = top(x) - 2.2 - 0.8 * Math.sin((x / T) * TAU * 4);
    if (x === 0) moss.moveTo(x, y);
    else moss.lineTo(x, y);
  }
  for (let x = T; x >= 0; x -= 2) moss.lineTo(x, top(x) + 4 + 1.6 * Math.sin((x / T) * TAU * 3 + 0.5));
  moss.closePath();
  ctx.fillStyle = linGrad(ctx, 0, 2, 0, 11, [[0, pal.surfaceLight], [0.4, pal.surface], [1, pal.surfaceDark]]);
  ctx.fill(moss);
  glow(ctx, pal.surfaceGlow, 6, () => {
    ctx.strokeStyle = pal.surfaceLight;
    ctx.lineWidth = 1.5;
    ctx.stroke(edgeLine((x) => top(x) - 1.6 - 0.8 * Math.sin((x / T) * TAU * 4)));
  });
}

function leaf(ctx: Ctx, pal: ThemePalette, x: number, y: number, a: number, len: number, col = '#2ad8a0'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const p = new Path2D();
  p.moveTo(0, 0);
  p.quadraticCurveTo(len * 0.45, -len * 0.42, len, 0);
  p.quadraticCurveTo(len * 0.45, len * 0.42, 0, 0);
  p.closePath();
  fillOutlined(ctx, p, col, pal.outline, 1.3);
  ctx.strokeStyle = 'rgba(200,255,235,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(len - 2, 0);
  ctx.stroke();
  ctx.restore();
}

/** Branche : écorce noueuse, grain en biais, mousse lumineuse. Base commune aux 3 variantes. */
function branchBase(ctx: Ctx, pal: ThemePalette): void {
  const body = bandPath(brTop, brBot);
  ctx.fillStyle = linGrad(ctx, 0, 4, 0, 23, [[0, '#a0709a'], [0.32, '#6a3a72'], [1, '#2a1234']]);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  // Grain en biais (période 8 px)
  for (let i = 0; i < 8; i++) {
    wrapX(T, i * 8 + 2, 10, (x) => {
      ctx.strokeStyle = 'rgba(20,6,30,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 9);
      ctx.quadraticCurveTo(x + 4, 13, x + 7, 20);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,215,250,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, 9.5);
      ctx.quadraticCurveTo(x + 2.6, 13.5, x + 5.6, 20.5);
      ctx.stroke();
    });
  }
  // Reflet du haut de l'écorce
  ctx.strokeStyle = 'rgba(255,220,250,0.22)';
  ctx.lineWidth = 1.4;
  ctx.stroke(edgeLine(brTop, 4.5));
  ctx.restore();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 2.6;
  ctx.stroke(edgeLine(brBot));
  walkMoss(ctx, pal, brTop);
}

const viTop = (x: number) => 5.5 + 0.6 * Math.sin((x / T) * TAU * 2);
const viBot = (x: number) => 17 + 0.8 * Math.sin((x / T) * TAU * 2 + 0.9);

/** Liane : torsade de brins (période 8 px), feuilles sur le dessus, bourgeons. Base commune aux 3 variantes. */
function vineBase(ctx: Ctx, pal: ThemePalette): void {
  const body = bandPath(viTop, viBot);
  ctx.fillStyle = '#0c4a3c';
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  for (let i = 0; i < 8; i++) {
    wrapX(T, i * 8, 12, (x) => {
      const strand = poly([x - 1, 3, x + 4.5, 3, x + 10, 19, x + 4.5, 19]);
      ctx.fillStyle = linGrad(ctx, x, 3, x + 8, 19, [[0, '#7affd0'], [0.35, '#2ad8a0'], [1, '#137a5e']]);
      ctx.fill(strand);
      ctx.strokeStyle = 'rgba(6,40,30,0.7)';
      ctx.lineWidth = 1.1;
      ctx.stroke(strand);
    });
  }
  ctx.restore();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 2.4;
  ctx.stroke(edgeLine(viTop, -0.4));
  ctx.stroke(edgeLine(viBot, 0.4));
  // Feuilles du dessus (période 16 px) et lueur
  for (let i = 0; i < 4; i++) {
    const x = i * 16 + 6;
    leaf(ctx, pal, x, viTop(x) + 1, -2.5, 7);
    leaf(ctx, pal, x + 2, viTop(x + 2) + 1, -0.75, 6, '#38e8b0');
  }
  glow(ctx, pal.bioA, 5, () => {
    for (let i = 0; i < 4; i++) {
      const x = i * 16 + 13;
      ctx.fillStyle = mix(pal.bioA, '#ffffff', 0.4);
      ctx.beginPath();
      ctx.arc(x, viTop(x) + 2, 1, 0, TAU);
      ctx.fill();
    }
  });
}

const PLANK_SHADE = [0, 0.1];

/** Passerelle : planches lilas liées par des cordes de liane, nœuds lumineux. Base commune aux 3 variantes. */
function bridgeBase(ctx: Ctx, pal: ThemePalette): void {
  // Corde porteuse, affaissée entre les attaches (période 32 px)
  const sag = (x: number) => 16.5 + 3.2 * Math.sin(Math.PI * ((((x % 32) + 32) % 32) / 32));
  const rope = new Path2D();
  for (let x = 0; x <= T; x += 1) {
    if (x === 0) rope.moveTo(x, sag(x));
    else rope.lineTo(x, sag(x));
  }
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 3.8;
  ctx.stroke(rope);
  ctx.strokeStyle = '#1f9a74';
  ctx.lineWidth = 1.9;
  ctx.stroke(rope);
  // Planches (2 par tuile, joints aux bords de la tuile)
  for (let i = 0; i < 2; i++) {
    const x0 = i * 32 + 1.4;
    const y0 = 5 + [0, 0.7][i];
    const pl = roundRect(x0, y0, 29.2, 10, 2.4);
    const sh = PLANK_SHADE[i];
    fillOutlined(ctx, pl, linGrad(ctx, 0, y0, 0, y0 + 10, [[0, mix('#d8acdc', sh > 0 ? '#000000' : '#ffffff', Math.abs(sh))], [0.35, '#946aa2'], [1, '#4a2456']]), pal.outline, 2.2);
    // Veinage et nœud
    ctx.strokeStyle = 'rgba(40,12,50,0.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y0 + 4.5);
    ctx.bezierCurveTo(x0 + 10, y0 + 3.4, x0 + 18, y0 + 5.6, x0 + 26, y0 + 4.4);
    ctx.moveTo(x0 + 5, y0 + 7.4);
    ctx.quadraticCurveTo(x0 + 14, y0 + 6.6, x0 + 24, y0 + 7.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,12,50,0.45)';
    ctx.beginPath();
    ctx.ellipse(x0 + (i === 0 ? 20 : 9), y0 + 5.8, 2.2, 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,255,0.5)';
    ctx.fillRect(x0 + 2, y0 + 1.1, 25, 1);
    // Clous
    ctx.fillStyle = rgba(pal.outline, 0.85);
    for (const dx of [3.2, 26]) {
      ctx.beginPath();
      ctx.arc(x0 + dx, y0 + 5, 0.9, 0, TAU);
      ctx.fill();
    }
  }
  // Attaches aux joints (x = 0 et 32 ; celle de x = 0 se partage avec la tuile voisine)
  for (let i = 0; i < 2; i++) {
    wrapX(T, i * 32, 4, (x) => {
      const tie = roundRect(x - 2.2, 4.5, 4.4, 12, 2);
      fillOutlined(ctx, tie, linGrad(ctx, x - 2, 0, x + 2, 0, [[0, '#2ad8a0'], [1, '#126a50']]), pal.outline, 1.4);
      ctx.strokeStyle = 'rgba(6,40,30,0.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - 2, 7);
      ctx.lineTo(x + 2, 9);
      ctx.moveTo(x - 2, 11);
      ctx.lineTo(x + 2, 13);
      ctx.stroke();
      glowDot(ctx, x, 16, 1.1, pal.bioA);
    });
  }
}

/**
 * Plateforme traversable '=' du monde 1 (64x64, épaisseur visuelle en haut de la case, dessus vers y = 5
 * comme la liane-bûche de tiles.ts). frame = famille x 3 + variante : 0-2 branche, 3-5 liane, 6-8
 * passerelle. Les 3 variantes d'une famille ont les mêmes bords (x < 6 et x > 58) : on les mélange au
 * hasard dans une même rangée sans couture ; deux familles différentes, elles, ne se raccordent pas.
 */
export function drawWalkway(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const f = Math.max(0, Math.min(8, frame | 0));
  const family = Math.floor(f / 3);
  const v = f % 3;
  if (family === 0) {
    // Décor sous la branche d'abord (derrière), puis la branche
    if (v === 0) {
      const twig = new Path2D();
      twig.moveTo(22, 19);
      twig.quadraticCurveTo(16, 26, 12, 34);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 4.6;
      ctx.stroke(twig);
      ctx.strokeStyle = '#6a3a72';
      ctx.lineWidth = 2.4;
      ctx.stroke(twig);
      leaf(ctx, pal, 15, 28, 2.4, 9);
      leaf(ctx, pal, 13, 33, 1.3, 8, '#38e8b0');
      glowDot(ctx, 11.5, 35.5, 1.5, pal.bioB);
    } else if (v === 2) {
      for (const [x, len, c] of [[18, 12, pal.bioA], [31, 20, pal.bioB], [45, 9, pal.bioA]] as const) {
        const s = new Path2D();
        s.moveTo(x, 19);
        s.bezierCurveTo(x - 3, 19 + len * 0.4, x + 3, 19 + len * 0.7, x, 19 + len);
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 3.4;
        ctx.stroke(s);
        ctx.strokeStyle = pal.surfaceDark;
        ctx.lineWidth = 1.8;
        ctx.stroke(s);
        glowDot(ctx, x, 20 + len, 1.4, c);
      }
    }
    branchBase(ctx, pal);
    if (v === 0) {
      // Nœud de l'écorce
      fillOutlined(ctx, ellipse(39, 14.5, 5, 3.2), '#3a1a42', 'rgba(20,6,30,0.85)', 1.4);
      ctx.strokeStyle = 'rgba(255,215,250,0.3)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(39, 14.5, 2.4, 1.4, 0, 0, TAU);
      ctx.stroke();
    } else if (v === 1) {
      // Champignons-consoles sous la branche
      for (const [x, w, y] of [[24, 9, 21], [37, 12, 22], [48, 7, 21]] as const) {
        const shelf = new Path2D();
        shelf.moveTo(x - w, y);
        shelf.quadraticCurveTo(x, y + 2, x + w, y);
        shelf.quadraticCurveTo(x + w * 0.8, y + 6, x, y + 6.5);
        shelf.quadraticCurveTo(x - w * 0.8, y + 6, x - w, y);
        shelf.closePath();
        softDot(ctx, x, y + 7, w * 1.2, pal.bioA, 0.3);
        fillOutlined(ctx, shelf, linGrad(ctx, 0, y, 0, y + 6, [[0, '#f4ecff'], [1, '#9a86d0']]), pal.outline, 1.6);
        glow(ctx, pal.bioA, 6, () => {
          ctx.strokeStyle = mix(pal.bioA, '#ffffff', 0.3);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x - w * 0.7, y + 4.5);
          ctx.quadraticCurveTo(x, y + 7.2, x + w * 0.7, y + 4.5);
          ctx.stroke();
        });
      }
    } else {
      leaf(ctx, pal, 26, 18, 0.5, 7);
      glowDot(ctx, 52, 12, 1.1, '#ffffff');
    }
  } else if (family === 1) {
    if (v === 0) {
      leaf(ctx, pal, 22, 16, 1.9, 12);
      leaf(ctx, pal, 26, 16, 1.1, 11, '#38e8b0');
      const stem = new Path2D();
      stem.moveTo(42, 16);
      stem.quadraticCurveTo(44, 21, 41, 25);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 3;
      ctx.stroke(stem);
      ctx.strokeStyle = '#1f8a6a';
      ctx.lineWidth = 1.4;
      ctx.stroke(stem);
      glow(ctx, pal.bioB, 8, () => {
        fillOutlined(ctx, ellipse(41, 28, 3.6, 4.4), sphereGrad(ctx, 40, 27, 4.4, '#ffd0f8', pal.bioB, '#7a0f7a'), pal.outline, 1.4);
      });
    } else if (v === 1) {
      const t = new Path2D();
      t.moveTo(34, 16);
      t.bezierCurveTo(28, 24, 38, 30, 31, 38);
      t.quadraticCurveTo(27, 42, 30, 45);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 3.4;
      ctx.stroke(t);
      ctx.strokeStyle = '#1f8a6a';
      ctx.lineWidth = 1.6;
      ctx.stroke(t);
      leaf(ctx, pal, 32, 26, -0.6, 7);
      leaf(ctx, pal, 33, 34, 3.6, 6, '#38e8b0');
      glowDot(ctx, 30.5, 46.5, 2.2, pal.bioB);
    } else {
      // Vrille en spirale
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 3;
      const curl = new Path2D();
      curl.moveTo(44, 16);
      for (let a = 0; a <= TAU * 1.6; a += 0.25) {
        const rr = 7 - a * 0.6;
        curl.lineTo(44 + Math.sin(a) * rr, 24 - Math.cos(a) * rr + a * 0.4);
      }
      ctx.stroke(curl);
      ctx.strokeStyle = '#1f8a6a';
      ctx.lineWidth = 1.4;
      ctx.stroke(curl);
    }
    vineBase(ctx, pal);
    if (v === 2) {
      // Fleur magenta posée sur la liane
      softDot(ctx, 26, 11, 13, pal.bioB, 0.4);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * TAU;
        glow(ctx, pal.bioB, 6, () => {
          fillOutlined(ctx, ellipse(26 + Math.cos(a) * 4, 11 + Math.sin(a) * 3.4, 3.4, 2.2, a), pal.bioB, pal.outline, 1.2);
        });
      }
      glowDot(ctx, 26, 11, 1.8, '#ffe27a');
    }
  } else {
    if (v === 1) {
      // Lanterne-cosse pendue à la corde
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(32, 16);
      ctx.lineTo(32, 31);
      ctx.stroke();
      ctx.strokeStyle = '#1f9a74';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      softDot(ctx, 32, 37, 16, '#ffd84a', 0.45);
      const pod = new Path2D();
      pod.moveTo(32, 30);
      pod.bezierCurveTo(24, 31, 25, 43, 32, 45);
      pod.bezierCurveTo(39, 43, 40, 31, 32, 30);
      pod.closePath();
      glow(ctx, '#ffd84a', 10, () => {
        fillOutlined(ctx, pod, sphereGrad(ctx, 30, 35, 8, '#ffffff', '#ffe27a', '#ff7a3d'), pal.outline, 1.8);
      });
      ctx.strokeStyle = 'rgba(122,40,10,0.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(32, 31);
      ctx.lineTo(32, 44);
      ctx.moveTo(28.5, 33);
      ctx.quadraticCurveTo(27.5, 38, 29.5, 43);
      ctx.moveTo(35.5, 33);
      ctx.quadraticCurveTo(36.5, 38, 34.5, 43);
      ctx.stroke();
    } else if (v === 2) {
      // Breloque astréenne et bout de corde
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(24, 17);
      ctx.lineTo(24, 27);
      ctx.moveTo(43, 17);
      ctx.quadraticCurveTo(46, 22, 42, 26);
      ctx.stroke();
      ctx.strokeStyle = '#1f9a74';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      fillOutlined(ctx, circle(24, 31, 4.6), linGrad(ctx, 0, 27, 0, 36, [[0, pal.blockLight], [1, pal.blockDark]]), pal.outline, 1.6);
      glow(ctx, pal.vein, 6, () => {
        ctx.strokeStyle = pal.vein;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(24, 31, 1.8, 0, TAU);
        ctx.moveTo(24, 26.8);
        ctx.lineTo(24, 28.2);
        ctx.moveTo(24, 33.8);
        ctx.lineTo(24, 35.2);
        ctx.stroke();
      });
    }
    bridgeBase(ctx, pal);
    if (v === 0) {
      // Mousse et petits champignons sur deux planches
      const moss = new Path2D();
      moss.moveTo(18, 6);
      moss.quadraticCurveTo(23, 1.5, 29, 5.6);
      moss.quadraticCurveTo(24, 8, 18, 6);
      moss.closePath();
      fillOutlined(ctx, moss, linGrad(ctx, 0, 2, 0, 8, [[0, pal.surfaceLight], [1, pal.surfaceDark]]), pal.outline, 1.3);
      for (const [x, h] of [[38, 5], [42, 3.5]] as const) {
        fillOutlined(ctx, roundRect(x - 0.9, 5 - h, 1.8, h + 1, 0.8), '#e6dcff', pal.outline, 1);
        glow(ctx, pal.bioB, 5, () => {
          fillOutlined(ctx, new Path2D(`M ${x - 3} ${5.6 - h} Q ${x} ${-0.8 - h} ${x + 3} ${5.6 - h} Z`), pal.bioB, pal.outline, 1);
        });
      }
    } else if (v === 2) {
      // Planche fendue
      ctx.strokeStyle = 'rgba(20,6,30,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(36, 5);
      ctx.lineTo(39, 8.5);
      ctx.lineTo(37.5, 11);
      ctx.lineTo(40, 13);
      ctx.stroke();
    }
  }
}

// ================================================================ Planches, animations et boîtes

export interface World1Sheet {
  /** Clé de texture proposée (à reporter dans TEX de keys.ts à l'intégration). */
  key: string;
  /** Taille d'une frame (px). */
  w: number;
  h: number;
  /** Nombre de frames (planche horizontale, buildSheet). */
  frames: number;
  /** Origine conseillée du sprite (setOrigin), en fraction de la frame. */
  originX: number;
  originY: number;
  draw: (ctx: Ctx, theme: ThemeId, frame: number) => void;
}

/**
 * Planches du monde 1, à construire par buildSheet(scene, s.key, s.w, s.h, s.frames, (ctx, i) => s.draw(ctx,
 * theme, i)). Toutes tiennent sous 2048 px de large (tronc : 7 x 258 = 1806).
 */
export const WORLD1_SHEETS = {
  /** Case 'o' (pleine) : frame 0 = tuile du tileset ; sprite posé au bas de sa case pour l'animation. */
  mushroom: { key: 'w1-mushroom', w: 64, h: 64, frames: MUSH.length, originX: 0.5, originY: 1, draw: drawMushroom },
  barrierTop: { key: 'w1-barrier-top', w: 64, h: 64, frames: 7, originX: 0, originY: 0, draw: (ctx, theme, i) => drawBarrier(ctx, theme, i, { part: 'top' }) },
  barrierMid: { key: 'w1-barrier-mid', w: 64, h: 64, frames: 7, originX: 0, originY: 0, draw: (ctx, theme, i) => drawBarrier(ctx, theme, i, { part: 'mid' }) },
  barrierBottom: { key: 'w1-barrier-bottom', w: 64, h: 64, frames: 7, originX: 0, originY: 0, draw: (ctx, theme, i) => drawBarrier(ctx, theme, i, { part: 'bottom' }) },
  /** Origine en bas à gauche : coin bas-gauche de la case de gauche de la souche (4 x 4 tuiles). */
  trunk: { key: 'w1-trunk', w: TRUNK.w, h: TRUNK.h, frames: TRUNK_ANGLE.length, originX: 0, originY: 1, draw: drawTrunk },
  tess: { key: 'w1-tess', w: TS_W, h: TS_H, frames: 8, originX: 0.5, originY: 1, draw: drawTess },
  /** 2 x 2 tuiles, posée au bas de ses cases (origine en bas au centre = joint des deux cases). */
  capsule: { key: 'w1-capsule', w: 128, h: 128, frames: 2, originX: 0.5, originY: 1, draw: drawCapsule },
  glyphs: { key: 'w1-glyphs', w: 64, h: 64, frames: GLYPH_VARIANTS * 2, originX: 0, originY: 0, draw: drawGlyph },
  /** Variantes de '=' : à ranger dans le tileset (frame 0..8 = famille x 3 + variante). */
  walkways: { key: 'w1-walkways', w: 64, h: 64, frames: 9, originX: 0, originY: 0, draw: drawWalkway },
} satisfies Record<string, World1Sheet>;

export type World1SheetId = keyof typeof WORLD1_SHEETS;

/** Frames nommées de chaque planche. */
export const WORLD1_FRAMES = {
  mushroom: { idle: [0, 1, 2, 1], bounce: [3, 4, 5, 0], tile: 0 },
  barrier: { crackle: [0, 1, 2, 3], off: 4, close: [4, 5, 6], open: [6, 5, 4] },
  trunk: { stand: 0, tremble: [0, 1, 0, 2], fall: [3, 4, 5, 6], lying: 6 },
  tess: { idle: [0, 1], wave: [2, 3], beam: [4, 5, 6, 7] },
  capsule: { blink: [0, 1] },
  /** Glyphe v (0..5) : éteint = v, allumé = v + GLYPH_VARIANTS. */
  glyphs: { off: 0, on: GLYPH_VARIANTS },
  walkways: { branch: [0, 1, 2], vine: [3, 4, 5], bridge: [6, 7, 8] },
} as const;

export interface World1Anim {
  key: string;
  sheet: World1SheetId;
  frames: readonly number[];
  frameRate: number;
  /** -1 : en boucle ; 0 : une fois. */
  repeat: number;
}

const barrierAnims = (part: 'Top' | 'Mid' | 'Bottom'): World1Anim[] => {
  const sheet = `barrier${part}` as World1SheetId;
  const k = part.toLowerCase();
  return [
    { key: `w1-barrier-${k}-crackle`, sheet, frames: WORLD1_FRAMES.barrier.crackle, frameRate: 14, repeat: -1 },
    { key: `w1-barrier-${k}-close`, sheet, frames: WORLD1_FRAMES.barrier.close, frameRate: 12, repeat: 0 },
    { key: `w1-barrier-${k}-open`, sheet, frames: WORLD1_FRAMES.barrier.open, frameRate: 12, repeat: 0 },
  ];
};

/** Animations proposées (anims.create({ key, frames: frames.map(f => ({ key: sheet.key, frame: f })), frameRate, repeat })). */
export const WORLD1_ANIMS: readonly World1Anim[] = [
  { key: 'w1-mushroom-idle', sheet: 'mushroom', frames: WORLD1_FRAMES.mushroom.idle, frameRate: 5, repeat: -1 },
  { key: 'w1-mushroom-bounce', sheet: 'mushroom', frames: WORLD1_FRAMES.mushroom.bounce, frameRate: 16, repeat: 0 },
  ...barrierAnims('Top'),
  ...barrierAnims('Mid'),
  ...barrierAnims('Bottom'),
  { key: 'w1-trunk-tremble', sheet: 'trunk', frames: WORLD1_FRAMES.trunk.tremble, frameRate: 14, repeat: -1 },
  { key: 'w1-trunk-fall', sheet: 'trunk', frames: WORLD1_FRAMES.trunk.fall, frameRate: 12, repeat: 0 },
  { key: 'w1-tess-idle', sheet: 'tess', frames: WORLD1_FRAMES.tess.idle, frameRate: 3, repeat: -1 },
  { key: 'w1-tess-wave', sheet: 'tess', frames: WORLD1_FRAMES.tess.wave, frameRate: 6, repeat: -1 },
  { key: 'w1-tess-beam', sheet: 'tess', frames: WORLD1_FRAMES.tess.beam, frameRate: 10, repeat: 0 },
  { key: 'w1-capsule-blink', sheet: 'capsule', frames: WORLD1_FRAMES.capsule.blink, frameRate: 2, repeat: -1 },
];

/**
 * Boîtes utiles au moteur (px, dans la frame, origine en haut à gauche) : `solid` = emprise conseillée en
 * cases pleines, `art` = partie dessinée.
 */
export const WORLD1_BOXES = {
  /** Haut visuel du chapeau au repos (Kaï s'y tient : le pied s'enfonce de 3 px, comme sur la mousse du sol). */
  mushroom: { capTop: 3, solid: { x: 0, y: 0, w: 64, h: 64 } },
  /** Champ à pleine puissance ; la case entière est pleine pendant que la barrière est fermée. */
  barrier: { field: { x: 8, y: 0, w: 48, h: 64 }, emitterTop: { y0: 0, y1: EMIT_HIGH }, emitterBottom: { y0: EMIT_LOW, y1: 64 } },
  /**
   * Couché : fût sur les cases 1 à 3 (2 de haut), souche sur la case 0 (1 de haut) ; debout : décor sans
   * collision (la frame entière, souche comprise, fait 4 x 4 cases).
   */
  trunk: {
    lying: { x: 64, y: 128, w: 192, h: 128 },
    stump: { x: 0, y: 192, w: 64, h: 64 },
    lyingArt: { x: 4, y: 132, w: 252, h: 124 },
    standingArt: { x: 0, y: 0, w: 150, h: 256 },
    pivot: { x: TRUNK.pivotX, y: TRUNK.pivotY },
  },
  /** Même boîte que Kaï (PLAYER_BODY 34 x 70), centrée, pieds au bas de la frame. */
  tess: { body: { x: 15, y: 10, w: 34, h: 70 }, head: { x: 33, y: 20 } },
  /** Décor sans collision ; hublot = point de départ du faisceau de LUMA si on le veut. */
  capsule: { art: { x: 0, y: 10, w: 128, h: 118 }, hatch: { x: 69, y: 80 }, beacon: { x: 36, y: 53 } },
} as const;
