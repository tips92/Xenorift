import { PALETTES } from '../../game2d/art/palette';
import { type Ctx, ellipse, fillOutlined, glowDot, linGrad, mix, rgba, rimLight, rng, roundRect, shade, smoothPoly, softDot, sphereGrad } from '../../game2d/art/util';
import { VH, type Sprite, makeSprite } from '../scenes/common';

// Jungle de Xéna vue en plan large pour les cinématiques, dans la palette du jeu (PALETTES.jungle) : ciel et
// lunes, montagnes lointaines dans la brume, arbres géants aux lueurs bioluminescentes, sol de mousse lumineuse.
// Variante « sanctuary » (libération) : ruines astréennes aux glyphes cyan, dalles au sol. Chaque calque est un
// sprite de la largeur demandée (parallaxe : plus large pour les plans proches).

const TAU = Math.PI * 2;
const pal = PALETTES.jungle;

/** Ligne du sol (unités) : pieds de Kaï, de la Comète. */
export const GROUND_Y = 296;

export type JungleVariant = 'edge' | 'sanctuary';

/** Ciel (demi-résolution) : dégradé, étoiles, bande galactique, nébuleuses, deux lunes. */
export function jungleSky(w: number, res: number): Sprite {
  return makeSprite(w, VH, 0, 0, res * 0.5, (ctx) => {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, VH, [
      [0, pal.skyTop],
      [0.42, pal.skyMid],
      [0.74, pal.skyLow],
      [0.9, pal.horizon],
      [1, pal.horizon],
    ]);
    ctx.fillRect(0, 0, w, VH);
    for (let i = 0; i < 18; i++) {
      const u = i / 17;
      softDot(ctx, u * w, 40 + u * 120 + Math.sin(u * 6) * 20, 60, pal.galaxy, 0.05);
    }
    softDot(ctx, w * 0.7, 70, 200, pal.nebulaA, 0.12);
    softDot(ctx, w * 0.3, 160, 220, pal.nebulaB, 0.1);
    const r = rng(404);
    for (let i = 0; i < 160; i++) {
      const y = r() * 250;
      ctx.fillStyle = rgba(i % 5 === 0 ? '#bff8ff' : '#ffffff', 0.3 + r() * 0.6 * (1 - y / 300));
      const s = r() < 0.1 ? 2 : 1.2;
      ctx.fillRect(r() * w, y, s, s);
    }
    moon(ctx, w * 0.17, 92, 40, '#e6fbff', '#8ab6e0', '#2a2a7a', '#6af0ff', 11);
    moon(ctx, w * 0.43, 54, 13, '#ffe0f6', '#d07ad0', '#4a1a5a', '#ff7ae0', 12);
  });
}

function moon(ctx: Ctx, x: number, y: number, R: number, light: string, mid: string, dark: string, halo: string, seed: number): void {
  softDot(ctx, x, y, R * 2.4, halo, 0.3);
  const disc = new Path2D();
  disc.arc(x, y, R, 0, TAU);
  ctx.fillStyle = sphereGrad(ctx, x, y, R, light, mid, dark);
  ctx.fill(disc);
  ctx.save();
  ctx.clip(disc);
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const cx = x + (r() - 0.5) * R * 1.4;
    const cy = y + (r() - 0.5) * R * 1.4;
    const cr = R * (0.08 + r() * 0.16);
    ctx.fillStyle = rgba(dark, 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  rimLight(ctx, disc, rgba('#ffffff', 0.6), 1.5, -1, -1);
}

/** Montagnes lointaines dans la brume (demi-résolution), entre y = 170 et le sol. */
export function jungleFar(w: number, res: number, seed: number): Sprite {
  return makeSprite(w, VH, 0, 0, res * 0.5, (ctx) => {
    const r = rng(seed);
    for (let layer = 0; layer < 2; layer++) {
      const base = layer === 0 ? 268 : 284;
      const col = layer === 0 ? mix(pal.far, pal.horizon, 0.35) : pal.far;
      const p = new Path2D();
      p.moveTo(0, VH);
      let x = 0;
      p.lineTo(0, base - 40);
      while (x < w + 60) {
        const peak = base - (layer === 0 ? 70 : 50) - r() * (layer === 0 ? 90 : 60);
        const nx = x + 70 + r() * 110;
        // Sommets en mesas arrondies (champignons de pierre)
        p.bezierCurveTo(x + 20, peak + 30, x + 18, peak, (x + nx) / 2, peak);
        p.bezierCurveTo(nx - 18, peak, nx - 20, peak + 30, nx, base - 20 - r() * 30);
        x = nx;
      }
      p.lineTo(w + 60, VH);
      p.closePath();
      ctx.fillStyle = col;
      ctx.fill(p);
      rimLight(ctx, p, rgba(pal.farLight, layer === 0 ? 0.5 : 0.7), 2, 0, 2);
    }
    // Brume au pied des montagnes
    ctx.fillStyle = linGrad(ctx, 0, 210, 0, 310, [[0, rgba(pal.mist, 0)], [0.6, rgba(pal.mist, 0.35)], [1, rgba(pal.mist, 0.15)]]);
    ctx.fillRect(0, 210, w, 190);
  });
}

/** Arbre géant : tronc courbe, couronne en ombrelle, lianes à lueurs (couleurs du plan moyen). */
function giantTree(ctx: Ctx, r: () => number, x: number, ground: number, h: number, scale: number): void {
  const top = ground - h;
  const lean = (r() - 0.5) * 30 * scale;
  const tw = (9 + r() * 7) * scale;
  const trunk = new Path2D();
  trunk.moveTo(x - tw, ground + 4);
  trunk.bezierCurveTo(x - tw * 0.8, ground - h * 0.4, x + lean - tw * 0.5, top + h * 0.3, x + lean - tw * 0.35, top + 10);
  trunk.lineTo(x + lean + tw * 0.35, top + 10);
  trunk.bezierCurveTo(x + lean + tw * 0.5, top + h * 0.3, x + tw * 0.8, ground - h * 0.4, x + tw, ground + 4);
  trunk.closePath();
  ctx.fillStyle = linGrad(ctx, x - tw, 0, x + tw, 0, [[0, pal.mid], [0.6, shade(pal.mid, 0.08)], [1, pal.near]]);
  ctx.fill(trunk);
  rimLight(ctx, trunk, rgba(pal.midLight, 0.7), 2, 2, 0);
  // Couronne : ombrelle de 3 à 5 chapeaux
  const cx = x + lean;
  const caps = 3 + Math.floor(r() * 3);
  for (let i = 0; i < caps; i++) {
    const cw = (40 + r() * 46) * scale;
    const ch = cw * (0.32 + r() * 0.12);
    const ox = (r() - 0.5) * 70 * scale;
    const oy = top + 6 - r() * 26 * scale + Math.abs(ox) * 0.25;
    const cap = new Path2D();
    cap.moveTo(cx + ox - cw, oy + ch * 0.35);
    cap.bezierCurveTo(cx + ox - cw * 0.9, oy - ch, cx + ox + cw * 0.9, oy - ch, cx + ox + cw, oy + ch * 0.35);
    cap.bezierCurveTo(cx + ox + cw * 0.5, oy + ch * 0.1, cx + ox - cw * 0.5, oy + ch * 0.1, cx + ox - cw, oy + ch * 0.35);
    cap.closePath();
    ctx.fillStyle = linGrad(ctx, 0, oy - ch, 0, oy + ch * 0.4, [[0, pal.midLight], [0.45, pal.mid], [1, shade(pal.mid, -0.25)]]);
    ctx.fill(cap);
    rimLight(ctx, cap, rgba(pal.bioA, 0.55), 2, 0, 2);
    // Points lumineux sous le chapeau
    const dots = 3 + Math.floor(r() * 4);
    for (let d = 0; d < dots; d++) {
      const u = (d + 0.5) / dots;
      glowDot(ctx, cx + ox - cw * 0.8 + u * cw * 1.6, oy + ch * 0.22, 1.4 * scale, d % 2 ? pal.bioA : pal.bioB);
    }
    // Lianes
    if (r() < 0.75) {
      const lx = cx + ox + (r() - 0.5) * cw;
      const len = (30 + r() * 60) * scale;
      ctx.strokeStyle = rgba(pal.midLight, 0.6);
      ctx.lineWidth = 1.6 * scale;
      ctx.beginPath();
      ctx.moveTo(lx, oy + ch * 0.2);
      ctx.quadraticCurveTo(lx + 6, oy + len * 0.5, lx - 2, oy + len);
      ctx.stroke();
      glowDot(ctx, lx - 2, oy + len, 2.2 * scale, r() < 0.5 ? pal.bioA : pal.bioB);
    }
  }
}

/** Ruine astréenne : pilier brisé ou arche, pierre sombre et glyphes cyan. */
function ruin(ctx: Ctx, r: () => number, x: number, ground: number, h: number, arch: boolean): void {
  const stone = pal.blockBase;
  const draw = (px: number, ph: number, broken: boolean) => {
    const pw = 26;
    const p = new Path2D();
    p.moveTo(px - pw / 2, ground + 2);
    p.lineTo(px - pw / 2, ground - ph);
    if (broken) {
      p.lineTo(px - 4, ground - ph - 10);
      p.lineTo(px + 3, ground - ph + 4);
      p.lineTo(px + pw / 2, ground - ph - 6);
    } else p.lineTo(px + pw / 2, ground - ph);
    p.lineTo(px + pw / 2, ground + 2);
    p.closePath();
    fillOutlined(ctx, p, linGrad(ctx, px - pw / 2, 0, px + pw / 2, 0, [[0, shade(stone, -0.3)], [0.5, stone], [1, shade(stone, -0.45)]]), pal.outline, 2.5);
    rimLight(ctx, p, rgba(pal.blockLight, 0.7), 2, 1.5, 0);
    // Glyphes
    ctx.save();
    ctx.shadowColor = '#3ff0ff';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(120,250,255,0.9)';
    ctx.lineWidth = 1.6;
    for (let gy = ground - ph + 22; gy < ground - 14; gy += 22) {
      ctx.beginPath();
      const v = Math.floor(r() * 3);
      if (v === 0) {
        ctx.arc(px, gy, 4, 0, TAU);
        ctx.moveTo(px, gy - 7);
        ctx.lineTo(px, gy + 7);
      } else if (v === 1) {
        ctx.moveTo(px - 6, gy - 5);
        ctx.lineTo(px, gy + 5);
        ctx.lineTo(px + 6, gy - 5);
      } else {
        ctx.moveTo(px - 6, gy);
        ctx.lineTo(px + 6, gy);
        ctx.moveTo(px - 3, gy - 5);
        ctx.lineTo(px - 3, gy + 5);
        ctx.moveTo(px + 3, gy - 5);
        ctx.lineTo(px + 3, gy + 5);
      }
      ctx.stroke();
    }
    ctx.restore();
  };
  if (arch) {
    const span = 120;
    draw(x - span / 2, h, false);
    draw(x + span / 2, h * 0.86, true);
    // Arc (cassé à droite)
    const a = new Path2D();
    a.moveTo(x - span / 2 - 13, ground - h);
    a.quadraticCurveTo(x - 10, ground - h - 60, x + 30, ground - h - 34);
    a.lineTo(x + 26, ground - h - 18);
    a.quadraticCurveTo(x - 10, ground - h - 40, x - span / 2 + 13, ground - h);
    a.closePath();
    fillOutlined(ctx, a, stone, pal.outline, 2.5);
    rimLight(ctx, a, rgba(pal.blockLight, 0.7), 2, 0, 2);
    glowDot(ctx, x - 22, ground - h - 34, 2.6, '#3ff0ff');
  } else {
    draw(x, h, true);
  }
}

/**
 * Plan moyen (de y = 30 au sol) : arbres géants, buissons ; variante sanctuaire : ruines et moins
 * d'arbres. `keep` : intervalles [x0, x1] laissés libres (là où la créature ou la scène doivent se voir).
 */
export function jungleMid(w: number, res: number, variant: JungleVariant, seed: number, keep: readonly number[] = []): Sprite {
  const y0 = 30;
  return makeSprite(w, VH - y0, 0, -y0, res, (ctx) => {
    ctx.translate(0, -y0);
    const r = rng(seed);
    const free = (x: number) => {
      for (let i = 0; i < keep.length; i += 2) if (x > keep[i] && x < keep[i + 1]) return false;
      return true;
    };
    // Buissons de fond
    ctx.fillStyle = shade(pal.mid, -0.15);
    for (let x = -20; x < w + 40; x += 30 + r() * 30) {
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y - 8, 30 + r() * 26, 18 + r() * 16, 0, Math.PI, TAU);
      ctx.fill();
    }
    // Rangée d'arbres plus petits et plus sombres, derrière (profondeur)
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let x = r() * 60; x < w + 60; x += 70 + r() * 60) giantTree(ctx, r, x, GROUND_Y - 6, 80 + r() * 60, 0.55 + r() * 0.2);
    // Brume sur cette rangée seulement (source-atop : le ciel derrière le calque n'est pas voilé).
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = rgba(pal.mist, 0.22);
    ctx.fillRect(0, 0, w, GROUND_Y + 10);
    ctx.restore();
    const step = variant === 'sanctuary' ? 190 : 120;
    for (let x = 30 + r() * 50; x < w + 60; x += step + r() * 80) {
      if (!free(x)) continue;
      giantTree(ctx, r, x, GROUND_Y, 120 + r() * 90, 0.85 + r() * 0.35);
    }
    if (variant === 'sanctuary') {
      ruin(ctx, r, w * 0.07, GROUND_Y, 120, true);
      ruin(ctx, r, w * 0.78, GROUND_Y, 92, false);
      ruin(ctx, r, w * 0.9, GROUND_Y, 60, false);
    }
    // Brume basse
    ctx.fillStyle = linGrad(ctx, 0, GROUND_Y - 50, 0, GROUND_Y + 10, [[0, rgba(pal.mist, 0)], [1, rgba(pal.mist, 0.28)]]);
    ctx.fillRect(0, GROUND_Y - 50, w, 60);
  });
}

/** Plante lumineuse du premier plan (bulbes, fougères). */
function plant(ctx: Ctx, r: () => number, x: number, ground: number, s: number): void {
  const stems = 3 + Math.floor(r() * 3);
  for (let i = 0; i < stems; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.3;
    const len = (14 + r() * 22) * s;
    const ex = x + Math.cos(a) * len;
    const ey = ground + Math.sin(a) * len;
    ctx.strokeStyle = pal.surfaceDark;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.quadraticCurveTo(x + (ex - x) * 0.2, ground + (ey - ground) * 0.7, ex, ey);
    ctx.stroke();
    glowDot(ctx, ex, ey, 2.4 * s, r() < 0.5 ? pal.bioA : pal.bioB);
  }
}

/** Grande feuille sombre qui encadre l'image (premier plan, au bord) : limbe large, nervures lumineuses. */
function frameLeaf(ctx: Ctx, x: number, ground: number, dir: number, h: number): void {
  const p = new Path2D();
  const tipX = x + dir * h * 0.95;
  const tipY = ground - h;
  p.moveTo(x, ground + 12);
  p.bezierCurveTo(x - dir * 18, ground - h * 0.55, tipX - dir * h * 0.55, tipY - h * 0.1, tipX, tipY);
  p.bezierCurveTo(tipX - dir * h * 0.05, tipY + h * 0.45, x + dir * h * 0.55, ground - h * 0.05, x + dir * 26, ground + 12);
  p.closePath();
  ctx.fillStyle = linGrad(ctx, x, ground, tipX, tipY, [[0, pal.near], [0.7, pal.nearLight], [1, shade(pal.nearLight, 0.15)]]);
  ctx.fill(p);
  rimLight(ctx, p, rgba(pal.surfaceGlow, 0.55), 2.2, dir * -1.5, 2);
  ctx.save();
  ctx.clip(p);
  ctx.shadowColor = pal.bioA;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = rgba(pal.bioA, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + dir * 10, ground + 8);
  ctx.quadraticCurveTo(x + dir * h * 0.3, ground - h * 0.6, tipX, tipY);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(pal.bioA, 0.35);
  for (let i = 1; i < 6; i++) {
    const u = i / 6;
    const mx = x + dir * 10 + (tipX - x - dir * 10) * u * 0.92;
    const my = ground + 8 + (tipY - ground - 8) * Math.pow(u, 0.85);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx + dir * h * 0.12, my + h * 0.05, mx + dir * h * 0.22, my + h * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Premier plan : sol de mousse lumineuse (ligne GROUND_Y), terre violette aux veines cyan, plantes ; feuilles
 * sombres aux deux bouts. Variante sanctuaire : dalles de pierre à glyphes au milieu.
 */
export function jungleNear(w: number, res: number, variant: JungleVariant, seed: number): Sprite {
  const y0 = GROUND_Y - 70;
  return makeSprite(w, VH - y0, 0, -y0, res, (ctx) => {
    ctx.translate(0, -y0);
    const r = rng(seed);
    // Terre
    ctx.fillStyle = linGrad(ctx, 0, GROUND_Y, 0, VH, [[0, pal.soil], [1, pal.soilDeep]]);
    ctx.fillRect(0, GROUND_Y, w, VH - GROUND_Y);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rgba(pal.soilSpeck, 0.35);
      ctx.beginPath();
      ctx.ellipse(r() * w, GROUND_Y + 14 + r() * 46, 3 + r() * 6, 2 + r() * 3, 0, 0, TAU);
      ctx.fill();
    }
    // Veines lumineuses
    ctx.save();
    ctx.shadowColor = pal.vein;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = rgba(pal.vein, 0.6);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 10; i++) {
      let x = r() * w;
      let y = GROUND_Y + 16 + r() * 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += 12 + r() * 18;
        y += (r() - 0.5) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (variant === 'sanctuary') {
      // Dalles astréennes
      const x0 = w * 0.3;
      const x1 = w * 0.7;
      for (let x = x0; x < x1; x += 46) {
        const slab = roundRect(x, GROUND_Y - 2, 44, 16, 3);
        fillOutlined(ctx, slab, linGrad(ctx, 0, GROUND_Y - 2, 0, GROUND_Y + 14, [[0, pal.blockLight], [1, pal.blockBase]]), pal.outline, 2);
        ctx.strokeStyle = 'rgba(120,250,255,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 10, GROUND_Y + 6);
        ctx.lineTo(x + 34, GROUND_Y + 6);
        ctx.stroke();
      }
    }
    // Mousse lumineuse : bande de surface ondulée
    const moss = new Path2D();
    moss.moveTo(0, GROUND_Y + 8);
    for (let x = 0; x <= w + 20; x += 20) moss.lineTo(x, GROUND_Y - 3 + Math.sin(x * 0.07) * 1.5 + (r() - 0.5) * 2);
    moss.lineTo(w + 20, GROUND_Y + 8);
    moss.closePath();
    ctx.save();
    ctx.shadowColor = pal.surfaceGlow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = linGrad(ctx, 0, GROUND_Y - 4, 0, GROUND_Y + 8, [[0, pal.surfaceLight], [0.4, pal.surface], [1, pal.surfaceDark]]);
    ctx.fill(moss);
    ctx.restore();
    // Touffes
    ctx.fillStyle = pal.surface;
    for (let x = 4; x < w; x += 9 + r() * 14) {
      ctx.beginPath();
      ctx.moveTo(x - 3, GROUND_Y);
      ctx.lineTo(x, GROUND_Y - 4 - r() * 5);
      ctx.lineTo(x + 3, GROUND_Y);
      ctx.fill();
    }
    // Plantes lumineuses (pas au milieu, où se joue la scène)
    for (let x = 20; x < w; x += 70 + r() * 90) {
      if (x > w * 0.28 && x < w * 0.72 && r() < 0.7) continue;
      plant(ctx, r, x, GROUND_Y, 0.8 + r() * 0.5);
    }
    // Cristaux
    for (let i = 0; i < 3; i++) {
      const x = r() * w;
      const c = smoothPoly([x - 5, GROUND_Y, x - 3, GROUND_Y - 12, x + 1, GROUND_Y - 18, x + 4, GROUND_Y - 10, x + 6, GROUND_Y]);
      fillOutlined(ctx, c, linGrad(ctx, 0, GROUND_Y - 18, 0, GROUND_Y, [[0, '#ffffff'], [1, pal.accent]]), pal.outline, 1.6);
    }
    frameLeaf(ctx, -14, GROUND_Y + 34, 1, 96);
    frameLeaf(ctx, w + 14, GROUND_Y + 34, -1, 112);
    fillOutlined(ctx, ellipse(w - 30, GROUND_Y + 22, 50, 26), pal.near, pal.outline, 0);
  });
}
