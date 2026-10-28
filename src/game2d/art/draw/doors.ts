import type { ThemeId } from '../../../core/types';
import { PALETTES, type ThemePalette } from '../palette';
import {
  type Ctx,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  linGrad,
  mix,
  poly,
  rgba,
  rimLight,
  roundRect,
  softDot,
} from '../util';

// Porte astréenne (64x128 = 1x2 tuiles, posée au bas de la frame) : arche de pierre gravée de runes néon,
// aux couleurs du monde. Frame 0 fermée (voile éteint), 1 ouverte (voile de portail allumé).
// Flèche ▲ d'interaction (28x24), affichée au-dessus d'une porte quand Kaï est devant.

const OUT = '#0d0618';
const TAU = Math.PI * 2;
const W = 64;
const CX = 32;
/** Arche extérieure : centre de l'arc et rayon (sommet à y = 15). */
const ARCH_Y = 44;
const ARCH_R = 29;
/** Ouverture : centre de l'arc et rayon (32 px de large, sommet à y = 32). */
const HOLE_Y = 48;
const HOLE_R = 16;
/** Bas de l'arche (caché par le seuil) et haut du seuil. */
const BASE_Y = 124;
const SILL_Y = 118;
/** Centre du voile (glyphe, tourbillon). */
const VEIL_Y = 78;

/** Arche : deux montants verticaux coiffés d'un demi-cercle. */
function archPath(cy: number, r: number, bottom: number): Path2D {
  const p = new Path2D();
  p.moveTo(CX - r, bottom);
  p.lineTo(CX - r, cy);
  p.arc(CX, cy, r, Math.PI, TAU);
  p.lineTo(CX + r, bottom);
  p.closePath();
  return p;
}

/** Glyphe astréen (anneau, quatre traits, point) : le même que sur les blocs de pierre. */
function glyph(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.moveTo(x, y - r - 7);
  ctx.lineTo(x, y - r - 2);
  ctx.moveTo(x, y + r + 2);
  ctx.lineTo(x, y + r + 7);
  ctx.moveTo(x - r - 7, y);
  ctx.lineTo(x - r - 2, y);
  ctx.moveTo(x + r + 2, y);
  ctx.lineTo(x + r + 7, y);
  ctx.stroke();
}

/** Petite rune verticale gravée sur un montant (deux variantes). */
function rune(ctx: Ctx, x: number, y: number, variant: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 5);
  if (variant === 0) {
    ctx.moveTo(x - 3.2, y - 4);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x + 3.2, y - 4);
  } else {
    ctx.moveTo(x - 3.2, y + 2);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x + 3.2, y + 2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + 7.5, 1.6, 0, TAU);
  ctx.stroke();
}

/** Joints de la maçonnerie : assises des montants et claveaux de l'arc. */
function masonry(ctx: Ctx, pal: ThemePalette): void {
  const left0 = CX - ARCH_R;
  const left1 = CX - HOLE_R;
  const right0 = CX + HOLE_R;
  const right1 = CX + ARCH_R;
  ctx.lineCap = 'butt';
  const joints = (color: string, dy: number, lw: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    // Assises (horizontales) et joints décalés (verticaux)
    for (const y of [ARCH_Y + 2, 70, 94]) {
      ctx.moveTo(left0, y + dy);
      ctx.lineTo(left1, y + dy);
      ctx.moveTo(right0, y + dy);
      ctx.lineTo(right1, y + dy);
    }
    ctx.moveTo(left0 + 6, ARCH_Y + 2 + dy);
    ctx.lineTo(left0 + 6, 70 + dy);
    ctx.moveTo(right1 - 6, ARCH_Y + 2 + dy);
    ctx.lineTo(right1 - 6, 70 + dy);
    // Claveaux : rayons entre l'ouverture et l'arc extérieur (la clé de voûte occupe le sommet)
    for (const a of [Math.PI * 1.17, Math.PI * 1.34, Math.PI * 1.66, Math.PI * 1.83]) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.moveTo(CX + c * HOLE_R, HOLE_Y + s * HOLE_R + dy);
      ctx.lineTo(CX + c * ARCH_R, ARCH_Y + s * ARCH_R + dy);
    }
    ctx.stroke();
  };
  joints('rgba(255,255,255,0.1)', 1.2, 1);
  joints(rgba(pal.outline, 0.6), 0, 1.4);
  ctx.lineCap = 'round';
}

/** Voile éteint : dalle sombre en deux battants, glyphe gravé à peine lumineux. */
function closedVeil(ctx: Ctx, pal: ThemePalette): void {
  ctx.fillStyle = linGrad(ctx, 0, HOLE_Y - HOLE_R, 0, BASE_Y, [
    [0, mix(pal.blockDark, '#000000', 0.25)],
    [0.6, mix(pal.blockDark, pal.outline, 0.6)],
    [1, pal.outline],
  ]);
  ctx.fillRect(0, 0, W, BASE_Y);
  // Reste de lumière au pied et autour du glyphe
  softDot(ctx, CX, SILL_Y, 22, pal.vein, 0.22);
  softDot(ctx, CX, VEIL_Y, 16, pal.vein, 0.16);
  // Joint vertical des deux battants (interrompu par le glyphe)
  ctx.strokeStyle = rgba(pal.outline, 0.9);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(CX, HOLE_Y - HOLE_R);
  ctx.lineTo(CX, VEIL_Y - 17);
  ctx.moveTo(CX, VEIL_Y + 17);
  ctx.lineTo(CX, BASE_Y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX + 1.2, HOLE_Y - HOLE_R);
  ctx.lineTo(CX + 1.2, VEIL_Y - 17);
  ctx.moveTo(CX + 1.2, VEIL_Y + 17);
  ctx.lineTo(CX + 1.2, BASE_Y);
  ctx.stroke();
  glow(ctx, pal.vein, 4, () => {
    ctx.strokeStyle = rgba(pal.vein, 0.5);
    ctx.lineWidth = 1.5;
    glyph(ctx, CX, VEIL_Y, 6);
  });
  softDot(ctx, CX, VEIL_Y, 4, pal.vein, 0.7);
}

/** Voile de portail allumé : cœur clair, anneaux qui tourbillonnent, étincelles. */
function openVeil(ctx: Ctx, pal: ThemePalette): void {
  ctx.fillStyle = pal.outline;
  ctx.fillRect(0, 0, W, BASE_Y);
  const g = ctx.createRadialGradient(CX, VEIL_Y, 1, CX, VEIL_Y, 52);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.16, pal.veinLight);
  g.addColorStop(0.45, pal.vein);
  g.addColorStop(0.8, rgba(pal.vein, 0.35));
  g.addColorStop(1, rgba(pal.vein, 0.15));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, BASE_Y);
  // Tourbillon : arcs concentriques décalés
  for (let k = 0; k < 5; k++) {
    const r = 7 + k * 6.5;
    const a0 = k * 1.3 + 0.4;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 - k * 0.08})`;
    ctx.lineWidth = 1.6 - k * 0.15;
    ctx.beginPath();
    ctx.ellipse(CX, VEIL_Y, r * 0.62, r, 0, a0, a0 + 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(CX, VEIL_Y, r * 0.62, r, 0, a0 + Math.PI, a0 + Math.PI + 1.4);
    ctx.stroke();
  }
  glow(ctx, '#ffffff', 6, () => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.6;
    glyph(ctx, CX, VEIL_Y, 6);
  });
  for (const [x, y, r] of [[22, 52, 1.4], [41, 60, 1.1], [24, 100, 1.2], [42, 108, 1.5], [36, 44, 1]] as const) {
    glowDot(ctx, x, y, r, pal.veinLight);
  }
  // Lumière qui coule sur le seuil
  softDot(ctx, CX, SILL_Y + 2, 26, pal.veinLight, 0.5);
}

/** Mousse et liane (jungle) ou garnitures de métal et voyants (lune). */
function themeDressing(ctx: Ctx, theme: ThemeId, pal: ThemePalette, open: boolean): void {
  if (theme === 'jungle') {
    // Mousse sur le haut de l'arche, de part et d'autre de la clé de voûte
    ctx.lineCap = 'round';
    for (const [a0, a1] of [[1.06, 1.38], [1.63, 1.76]] as const) {
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 8.5;
      ctx.beginPath();
      ctx.arc(CX, ARCH_Y, ARCH_R - 1.5, Math.PI * a0, Math.PI * a1);
      ctx.stroke();
      ctx.strokeStyle = linGrad(ctx, 0, 14, 0, 40, [[0, pal.surfaceLight], [0.5, pal.surface], [1, pal.surfaceDark]]);
      ctx.lineWidth = 5.5;
      ctx.stroke();
      glow(ctx, pal.surfaceGlow, 5, () => {
        ctx.strokeStyle = pal.surfaceLight;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(CX, ARCH_Y, ARCH_R + 0.5, Math.PI * (a0 + 0.03), Math.PI * (a1 - 0.03));
        ctx.stroke();
      });
    }
    // Touffe au pied du montant gauche
    const tuft = new Path2D();
    tuft.moveTo(2, SILL_Y + 1);
    tuft.quadraticCurveTo(4, SILL_Y - 6, 8, SILL_Y - 3);
    tuft.quadraticCurveTo(10, SILL_Y - 8, 14, SILL_Y - 2);
    tuft.quadraticCurveTo(17, SILL_Y - 4, 18, SILL_Y + 1);
    tuft.closePath();
    fillOutlined(ctx, tuft, linGrad(ctx, 0, SILL_Y - 12, 0, SILL_Y, [[0, pal.surfaceLight], [1, pal.surfaceDark]]), pal.outline, 1.8);
    // Liane pendue au côté droit de l'arche
    const vine = new Path2D();
    vine.moveTo(50, 24);
    vine.bezierCurveTo(57, 36, 50, 50, 56, 64);
    vine.quadraticCurveTo(59, 72, 55, 80);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3.6;
    ctx.stroke(vine);
    ctx.strokeStyle = '#1f8a6a';
    ctx.lineWidth = 1.7;
    ctx.stroke(vine);
    for (const [x, y, a] of [[53, 34, 0.7], [54, 52, -0.6], [57, 68, 0.5]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      fillOutlined(ctx, ellipse(4, 0, 4.2, 1.9), '#2ad8a0', pal.outline, 1.2);
      ctx.restore();
    }
    glowDot(ctx, 55, 81.5, 2.1, pal.bioB);
  } else {
    // Bandeau de métal sur l'arc (interrompu par la clé de voûte), rivets, voyants au pied des montants
    ctx.lineCap = 'butt';
    for (const [a0, a1] of [[1.06, 1.38], [1.62, 1.94]] as const) {
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(CX, ARCH_Y, ARCH_R - 3, Math.PI * a0, Math.PI * a1);
      ctx.stroke();
      ctx.strokeStyle = linGrad(ctx, 0, 14, 0, 50, [[0, '#ece6fa'], [0.5, '#a59cc6'], [1, '#5a5278']]);
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (const a of [Math.PI * 1.15, Math.PI * 1.35, Math.PI * 1.65, Math.PI * 1.85]) {
      const x = CX + Math.cos(a) * (ARCH_R - 3);
      const y = ARCH_Y + Math.sin(a) * (ARCH_R - 3);
      ctx.fillStyle = pal.outline;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, TAU);
      ctx.fill();
    }
    for (const x of [CX - ARCH_R + 6.5, CX + ARCH_R - 6.5]) {
      fillOutlined(ctx, roundRect(x - 4, 100, 8, 8, 2), '#2a2542', pal.outline, 1.6);
      glow(ctx, pal.vein, open ? 9 : 5, () => {
        ctx.fillStyle = open ? pal.veinLight : pal.vein;
        ctx.fillRect(x - 2.4, 102.6, 4.8, 2.8);
      });
    }
    // Poussière de régolithe sur le seuil
    ctx.fillStyle = rgba(pal.surface, 0.55);
    ctx.beginPath();
    ctx.ellipse(10, SILL_Y + 0.5, 8, 1.6, 0, 0, TAU);
    ctx.moveTo(58, SILL_Y + 0.5);
    ctx.ellipse(52, SILL_Y + 0.5, 6, 1.4, 0, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Porte (64x128, 2 frames)

export function drawDoor(ctx: Ctx, theme: ThemeId, frame: number): void {
  const pal = PALETTES[theme];
  const open = frame === 1;
  const outer = archPath(ARCH_Y, ARCH_R, BASE_Y);
  const hole = archPath(HOLE_Y, HOLE_R, BASE_Y + 2);

  // Halo du portail ouvert, derrière la pierre (petit : la frame ne fait que 64 px de large)
  if (open) softDot(ctx, CX, VEIL_Y, 34, pal.vein, 0.4);

  // Arche de pierre
  fillOutlined(
    ctx,
    outer,
    linGrad(ctx, 0, ARCH_Y - ARCH_R, 44, BASE_Y, [[0, pal.blockLight], [0.5, pal.blockBase], [1, pal.blockDark]]),
    pal.outline,
    3,
  );
  ctx.save();
  ctx.clip(outer);
  masonry(ctx, pal);
  // Runes gravées sur les montants (lune : voyants à la place de celles du bas, voir themeDressing)
  glow(ctx, pal.vein, open ? 8 : 4, () => {
    ctx.strokeStyle = rgba(pal.vein, open ? 1 : 0.6);
    ctx.lineWidth = 1.5;
    rune(ctx, CX - ARCH_R + 6.5, 81, 0);
    rune(ctx, CX + ARCH_R - 6.5, 81, 1);
    if (theme === 'jungle') {
      rune(ctx, CX - ARCH_R + 6.5, 104, 1);
      rune(ctx, CX + ARCH_R - 6.5, 104, 0);
    }
  });
  ctx.restore();
  rimLight(ctx, outer, 'rgba(220,230,255,0.35)', 2, 1.5, 1.5);

  // Ouverture : voile éteint ou allumé
  ctx.save();
  ctx.clip(hole);
  if (open) openVeil(ctx, pal);
  else closedVeil(ctx, pal);
  ctx.restore();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 2.6;
  ctx.stroke(hole);
  if (open) {
    glow(ctx, pal.vein, 8, () => rimLight(ctx, hole, rgba(pal.veinLight, 0.9), 2.4, 0, 0));
  } else {
    rimLight(ctx, hole, 'rgba(0,0,0,0.45)', 3, 1.5, 2);
  }

  // Clé de voûte et sa gemme
  const key = poly([CX - 7.5, 10, CX + 7.5, 10, CX + 5, 27, CX - 5, 27]);
  fillOutlined(ctx, key, linGrad(ctx, 0, 10, 0, 27, [[0, mix(pal.blockLight, '#ffffff', 0.25)], [1, pal.blockBase]]), pal.outline, 2.4);
  rimLight(ctx, key, 'rgba(255,255,255,0.4)', 1.4, 1, 1);
  glowDot(ctx, CX, 17.5, 2.6, open ? pal.veinLight : pal.accent);

  // Seuil
  const sill = roundRect(0.5, SILL_Y, W - 1, 128 - SILL_Y + 3, 3);
  fillOutlined(ctx, sill, linGrad(ctx, 0, SILL_Y, 0, 128, [[0, pal.blockLight], [1, pal.blockDark]]), pal.outline, 2.4);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(3, SILL_Y + 1.6, W - 6, 1.2);
  if (open) {
    glow(ctx, pal.vein, 8, () => {
      ctx.fillStyle = pal.veinLight;
      ctx.fillRect(CX - HOLE_R + 2, SILL_Y + 1.2, HOLE_R * 2 - 4, 1.8);
    });
  }

  themeDressing(ctx, theme, pal, open);
}

// ---------------------------------------------------------------- Mur du fond d'une salle close (64x64)

/**
 * Maçonnerie sombre de la ruine, derrière les cases vides d'une salle murée (sans collision) : deux assises
 * de pierres décalées, joints sombres, quelques runes éteintes et points lumineux. Se répète sans couture.
 */
export function drawRoomWall(ctx: Ctx, theme: ThemeId): void {
  const pal = PALETTES[theme];
  const stone = mix(pal.blockDark, pal.outline, 0.35);
  ctx.fillStyle = linGrad(ctx, 0, 0, 0, 64, [[0, mix(stone, pal.blockBase, 0.22)], [1, stone]]);
  ctx.fillRect(0, 0, 64, 64);
  // Pierres : assise du haut joints en 0 / 32, assise du bas en 16 / 48 (bords de la tuile = joints).
  const stones: [number, number, number][] = [
    [0, 0, 32],
    [32, 0, 32],
    [-16, 32, 32],
    [16, 32, 32],
    [48, 32, 32],
  ];
  for (const [x, y, w] of stones) {
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(x + 2, y + 2, w - 4, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 2, y + 27, w - 4, 3);
  }
  ctx.strokeStyle = rgba(pal.outline, 0.85);
  ctx.lineWidth = 2;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const y of [1, 33]) {
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
  }
  for (const x of [1, 33]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 32);
  }
  for (const x of [17, 49]) {
    ctx.moveTo(x, 32);
    ctx.lineTo(x, 64);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  // Runes à peine lumineuses et poussière de lumière
  ctx.strokeStyle = rgba(pal.vein, 0.2);
  ctx.lineWidth = 1.2;
  rune(ctx, 16, 15, 0);
  rune(ctx, 33, 47, 1);
  softDot(ctx, 48, 14, 5, pal.vein, 0.16);
  softDot(ctx, 8, 52, 4, pal.accent, 0.12);
  ctx.fillStyle = rgba(pal.veinLight, 0.55);
  for (const [x, y] of [[44, 21], [25, 57], [57, 42]] as const) ctx.fillRect(x, y, 1.5, 1.5);
}

// ---------------------------------------------------------------- Flèche d'interaction (28x24)

/** ▲ blanc bleuté cerné de sombre, avec un halo : lisible sur tous les fonds. */
export function drawInteractArrow(ctx: Ctx): void {
  const tri = poly([14, 3.5, 24.5, 19.5, 3.5, 19.5]);
  softDot(ctx, 14, 14, 13, '#7ff6ff', 0.35);
  glow(ctx, '#7ff6ff', 5, () => {
    fillOutlined(ctx, tri, linGrad(ctx, 0, 3.5, 0, 19.5, [[0, '#ffffff'], [1, '#8ff4ff']]), OUT, 2.8);
  });
  // Reflet sur l'arête gauche
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(13, 7.5);
  ctx.lineTo(7.5, 16.5);
  ctx.stroke();
}
