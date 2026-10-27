import type { ThemeId } from '../../../core/types';
import { TILESET, TILE_FRAME } from '../keys';
import { PALETTES, type ThemePalette } from '../palette';
import {
  type Ctx,
  type Surface,
  circle,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  linGrad,
  makeCanvas,
  poly,
  rgba,
  rimLight,
  rng,
  roundRect,
  softDot,
  sphereGrad,
  wrapX,
  wrapXY,
} from '../util';

// Tileset 8x2 (64 px, marge 1, espacement 2, bords extrudés d'1 px).
// Les tuiles de sol se raccordent sans couture horizontalement (surface continue) et verticalement.

const T = 64;
const TAU = Math.PI * 2;
/** Rayon des coins arrondis du sol. */
const RAD = 20;
/** Hauteur de la surface (haut de la mousse / croûte). */
const SY = 4;

// ================================================================ Remplissage de base (motif périodique 64x64)

function makeFillBase(theme: ThemeId, pal: ThemePalette): Surface {
  const s = makeCanvas(T, T);
  const ctx = s.ctx;
  const r = rng(theme === 'jungle' ? 1201 : 3307);
  ctx.fillStyle = pal.soil;
  ctx.fillRect(0, 0, T, T);
  // Grumeaux sombres / clairs
  for (let i = 0; i < 18; i++) {
    const x = r() * T;
    const y = r() * T;
    const rx = 4 + r() * 9;
    const ry = rx * (0.5 + r() * 0.4);
    const dark = r() < 0.6;
    const rot = r() * 0.2;
    wrapXY(T, T, x, y, rx + 1, (px, py) => {
      ctx.fillStyle = dark ? rgba(pal.soilDeep, 0.5) : rgba(pal.soilLight, 0.32);
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, rot, 0, TAU);
      ctx.fill();
    });
  }
  // Strates ondulées (périodiques)
  for (const sy of [18, 44]) {
    ctx.strokeStyle = rgba(pal.soilDeep, 0.55);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let x = 0; x <= T; x += 2) {
      const y = sy + Math.sin((x / T) * TAU * 2 + sy) * 2.2 + Math.sin((x / T) * TAU * 3) * 0.8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (theme === 'jungle') {
    // Racines fines
    for (let i = 0; i < 3; i++) {
      const x = r() * T;
      const y = r() * T;
      const dx = (r() - 0.5) * 30;
      const dy = 10 + r() * 14;
      wrapXY(T, T, x, y, 32, (px, py) => {
        ctx.strokeStyle = rgba(pal.soilDeep, 0.9);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(px + dx * 0.3, py + dy * 0.5, px + dx * 0.8, py + dy * 0.4, px + dx, py + dy);
        ctx.stroke();
      });
    }
  } else {
    // Cratères
    for (let i = 0; i < 3; i++) {
      const x = r() * T;
      const y = r() * T;
      const rx = 3.5 + r() * 4;
      wrapXY(T, T, x, y, rx + 2, (px, py) => {
        ctx.fillStyle = rgba(pal.soilDeep, 0.65);
        ctx.beginPath();
        ctx.ellipse(px, py, rx, rx * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba(pal.soilSpeck, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, rx * 0.55, 0, 0.15, Math.PI - 0.15);
        ctx.stroke();
      });
    }
    // Veine de cristal orange (une seule, discrète : évite l'effet de motif répété)
    for (let i = 0; i < 1; i++) {
      const x = r() * T;
      const y = r() * T;
      const pts: number[] = [];
      let cx = 0;
      let cy = 0;
      for (let k = 0; k < 5; k++) {
        pts.push(cx, cy);
        cx += 4 + r() * 5;
        cy += (r() - 0.5) * 9;
      }
      wrapXY(T, T, x, y, 34, (px, py) => {
        glow(ctx, pal.vein, 4, () => {
          ctx.strokeStyle = rgba(pal.vein, 0.75);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let k = 0; k < pts.length; k += 2) {
            if (k === 0) ctx.moveTo(px + pts[k], py + pts[k + 1]);
            else ctx.lineTo(px + pts[k], py + pts[k + 1]);
          }
          ctx.stroke();
        });
        ctx.strokeStyle = pal.veinLight;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      });
    }
  }
  // Cailloux
  for (let i = 0; i < 7; i++) {
    const x = r() * T;
    const y = r() * T;
    const rx = 1.8 + r() * 2;
    const ry = rx * 0.75;
    wrapXY(T, T, x, y, rx + 2, (px, py) => {
      ctx.fillStyle = pal.soilLight;
      ctx.strokeStyle = rgba(pal.outline, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.soilSpeck;
      ctx.beginPath();
      ctx.arc(px - rx * 0.3, py - ry * 0.35, rx * 0.35, 0, TAU);
      ctx.fill();
    });
  }
  // Spores / éclats lumineux
  for (let i = 0; i < 5; i++) {
    const x = r() * T;
    const y = r() * T;
    const col = theme === 'jungle' ? (i % 3 === 0 ? pal.bioB : pal.vein) : pal.vein;
    wrapXY(T, T, x, y, 6, (px, py) => {
      softDot(ctx, px, py, 4.5, col, 0.45);
      ctx.fillStyle = theme === 'jungle' ? '#e6ffff' : pal.veinLight;
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, TAU);
      ctx.fill();
    });
  }
  return s;
}

// ================================================================ Surface (mousse / croûte)

function topY(theme: ThemeId, x: number): number {
  const u = (x / T) * TAU;
  return theme === 'jungle'
    ? SY - 1.1 * Math.sin(u * 3) - 0.5 * Math.sin(u * 5 + 1.3)
    : SY + 0.8 * Math.sin(u * 2 + 0.3) + 0.45 * Math.sin(u * 7);
}

function botY(theme: ThemeId, x: number): number {
  const u = (x / T) * TAU;
  return theme === 'jungle'
    ? 16 + 2.2 * Math.sin(u * 2 + 0.7) + 1.3 * Math.sin(u * 5 + 2.1)
    : 14 + 1.8 * Math.sin(u * 3 + 1.3) + 1.1 * Math.sin(u * 5);
}

function edgePath(theme: ThemeId, f: (t: ThemeId, x: number) => number, dy = 0): Path2D {
  const p = new Path2D();
  for (let x = 0; x <= T; x += 2) {
    if (x === 0) p.moveTo(x, f(theme, x) + dy);
    else p.lineTo(x, f(theme, x) + dy);
  }
  return p;
}

function surfaceBand(ctx: Ctx, theme: ThemeId, pal: ThemePalette): void {
  // Efface au-dessus de la surface
  const above = new Path2D();
  above.moveTo(-1, -1);
  above.lineTo(T + 1, -1);
  for (let x = T; x >= 0; x -= 2) above.lineTo(x, topY(theme, x));
  above.closePath();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(above);
  ctx.restore();

  const band = new Path2D();
  for (let x = 0; x <= T; x += 2) {
    if (x === 0) band.moveTo(x, topY(theme, x));
    else band.lineTo(x, topY(theme, x));
  }
  for (let x = T; x >= 0; x -= 2) band.lineTo(x, botY(theme, x));
  band.closePath();

  // Ombre portée sous la bande
  ctx.strokeStyle = rgba(pal.soilDeep, 0.85);
  ctx.lineWidth = 5;
  ctx.stroke(edgePath(theme, botY, 2.2));

  if (theme === 'jungle') {
    // Coulures de mousse
    for (const [x0, len] of [[9, 9], [28, 6], [47, 11]] as const) {
      wrapX(T, x0, 6, (x) => {
        const y = botY(theme, x0) - 2;
        const drip = new Path2D();
        drip.moveTo(x - 4, y);
        drip.bezierCurveTo(x - 4, y + len * 0.6, x - 1.6, y + len, x, y + len);
        drip.bezierCurveTo(x + 1.6, y + len, x + 4, y + len * 0.6, x + 4, y);
        drip.closePath();
        ctx.fillStyle = linGrad(ctx, 0, y, 0, y + len, [[0, pal.surface], [1, pal.surfaceDark]]);
        ctx.fill(drip);
        glowDot(ctx, x, y + len - 0.5, 1, pal.bioA);
      });
    }
    ctx.fillStyle = linGrad(ctx, 0, 1, 0, 20, [[0, pal.surfaceLight], [0.3, pal.surface], [0.8, pal.surfaceDark], [1, '#07484a']]);
    ctx.fill(band);
    // Texture de la mousse
    ctx.save();
    ctx.clip(band);
    const r = rng(505);
    for (let i = 0; i < 26; i++) {
      const x = r() * T;
      const y = 5 + r() * 13;
      const rr = 1 + r() * 2.2;
      const light = r() < 0.5;
      wrapX(T, x, rr, (px) => {
        ctx.fillStyle = light ? rgba(pal.surfaceLight, 0.35) : rgba(pal.surfaceDark, 0.55);
        ctx.beginPath();
        ctx.arc(px, y, rr, 0, TAU);
        ctx.fill();
      });
    }
    ctx.restore();
    // Liseré lumineux
    glow(ctx, pal.surfaceGlow, 7, () => {
      ctx.strokeStyle = pal.surfaceLight;
      ctx.lineWidth = 1.8;
      ctx.stroke(edgePath(theme, topY, 0.9));
    });
    // Brins d'herbe
    const blades: [number, number, number][] = [
      [3, 3.5, -1.2],
      [12, 4, 1],
      [19, 3, 0.6],
      [33, 4.2, -0.8],
      [40, 3, 1.3],
      [55, 3.8, 0.5],
      [61, 3, -1],
    ];
    for (const [bx, h, lean] of blades) {
      wrapX(T, bx, 3, (x) => {
        const y = topY(theme, bx) + 1.5;
        ctx.strokeStyle = pal.surfaceLight;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
        ctx.stroke();
      });
    }
    // Points bioluminescents
    for (const [x, y, c] of [[7, 10, pal.bioA], [24, 9, pal.bioB], [38, 12, pal.bioA], [52, 8, '#ffffff']] as const) {
      glowDot(ctx, x, y, 0.9, c);
    }
  } else {
    ctx.fillStyle = linGrad(ctx, 0, 2, 0, 18, [[0, pal.surfaceLight], [0.35, pal.surface], [1, pal.surfaceDark]]);
    ctx.fill(band);
    ctx.save();
    ctx.clip(band);
    // Petits cratères de la croûte
    for (const [x, y, rx] of [[14, 10, 4], [44, 9, 3], [30, 12, 2.2], [58, 11, 2]] as const) {
      ctx.fillStyle = rgba(pal.surfaceDark, 0.7);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.45, 0, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    // Poussière
    const r = rng(77);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : rgba(pal.surfaceDark, 0.4);
      ctx.fillRect(r() * T, 4 + r() * 12, 1, 1);
    }
    ctx.restore();
    // Contour sombre + reflet du bord supérieur
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.6;
    ctx.stroke(edgePath(theme, topY, 1.2));
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.stroke(edgePath(theme, topY, 2.9));
    // Éclat de cristal dans la croûte
    glow(ctx, pal.vein, 6, () => {
      ctx.fillStyle = pal.vein;
      ctx.fill(poly([34, botY(theme, 34) - 1, 36.5, botY(theme, 34) - 7, 39, botY(theme, 34) - 1]));
    });
    ctx.fillStyle = pal.veinLight;
    ctx.fill(poly([34.8, botY(theme, 34) - 1.5, 36.5, botY(theme, 34) - 6, 36.6, botY(theme, 34) - 1.5]));
  }
}

// ================================================================ Bords (parois et coins arrondis)

function cornerArc(p: Path2D, inset: number): void {
  // Arc du coin supérieur gauche, du bas de la paroi vers la surface
  p.lineTo(inset, SY + RAD);
  p.arcTo(inset, SY + inset, RAD, SY + inset, RAD - inset);
}

function edgeLeft(ctx: Ctx, theme: ThemeId, pal: ThemePalette, top: boolean): void {
  if (top) {
    const cut = new Path2D();
    cut.moveTo(-1, -1);
    cut.lineTo(RAD + 5, -1);
    cut.lineTo(RAD + 1, SY);
    cut.arcTo(0, SY, 0, SY + RAD, RAD);
    cut.lineTo(-1, SY + RAD + 1);
    cut.closePath();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(cut);
    ctx.restore();
  }
  const wallTop = top ? SY + RAD : -1;
  // Assombrissement de la paroi
  ctx.fillStyle = linGrad(ctx, 0, 0, 14, 0, [[0, rgba(pal.soilDeep, 0.6)], [1, rgba(pal.soilDeep, 0)]]);
  ctx.fillRect(0, wallTop, 14, T - wallTop + 1);

  const inside = new Path2D();
  inside.moveTo(0, T + 1);
  inside.lineTo(0, SY + RAD);
  inside.arcTo(0, SY, RAD, SY, RAD);
  inside.lineTo(RAD + 1, SY);
  inside.lineTo(RAD + 5, -1);
  inside.lineTo(T + 1, -1);
  inside.lineTo(T + 1, T + 1);
  inside.closePath();

  if (top) {
    // Coiffe de surface qui suit l'arrondi
    const cap = new Path2D();
    cap.moveTo(0, SY + RAD + (theme === 'jungle' ? 10 : 6));
    cornerArc(cap, 0);
    cap.lineTo(RAD + 10, SY);
    ctx.save();
    ctx.clip(inside);
    ctx.lineCap = 'butt';
    if (theme === 'jungle') {
      ctx.strokeStyle = '#07484a';
      ctx.lineWidth = 24;
      ctx.stroke(cap);
      ctx.strokeStyle = pal.surfaceDark;
      ctx.lineWidth = 19;
      ctx.stroke(cap);
      ctx.strokeStyle = pal.surface;
      ctx.lineWidth = 11;
      ctx.stroke(cap);
      ctx.strokeStyle = pal.surfaceLight;
      ctx.lineWidth = 4;
      ctx.stroke(cap);
      // Coulure sur la paroi
      const drip = new Path2D();
      drip.moveTo(0, SY + RAD + 4);
      drip.bezierCurveTo(5, SY + RAD + 6, 4, SY + RAD + 16, 1, SY + RAD + 18);
      drip.lineTo(0, SY + RAD + 18);
      drip.closePath();
      ctx.fillStyle = pal.surfaceDark;
      ctx.fill(drip);
    } else {
      ctx.strokeStyle = pal.surfaceDark;
      ctx.lineWidth = 22;
      ctx.stroke(cap);
      ctx.strokeStyle = pal.surface;
      ctx.lineWidth = 15;
      ctx.stroke(cap);
      ctx.strokeStyle = pal.surfaceLight;
      ctx.lineWidth = 6;
      ctx.stroke(cap);
    }
    ctx.restore();
  }

  // Contour de paroi
  const wall = new Path2D();
  wall.moveTo(1.5, T + 2);
  if (top) {
    cornerArc(wall, 1.5);
    if (theme === 'moon') wall.lineTo(RAD + 3, SY + 1.5);
  } else {
    wall.lineTo(1.5, -2);
  }
  if (theme === 'jungle' && top) {
    // Paroi sombre sous la coiffe, liseré lumineux sur l'arrondi
    const lower = new Path2D();
    lower.moveTo(1.5, T + 2);
    lower.lineTo(1.5, SY + RAD + 6);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.stroke(lower);
    const arc = new Path2D();
    arc.moveTo(0.9, SY + RAD + 4);
    cornerArc(arc, 0.9);
    arc.lineTo(RAD + 6, SY + 0.9);
    glow(ctx, pal.surfaceGlow, 7, () => {
      ctx.strokeStyle = pal.surfaceLight;
      ctx.lineWidth = 1.8;
      ctx.stroke(arc);
    });
  } else {
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.stroke(wall);
    if (theme === 'moon' && top) {
      const hl = new Path2D();
      hl.moveTo(3.2, SY + RAD + 2);
      cornerArc(hl, 3.2);
      hl.lineTo(RAD + 4, SY + 3.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke(hl);
    }
  }
  // Liseré de lumière intérieur sur la paroi
  ctx.strokeStyle = rgba(pal.soilSpeck, 0.75);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(4, T + 1);
  ctx.lineTo(4, top ? SY + RAD + (theme === 'jungle' ? 12 : 8) : -1);
  ctx.stroke();
}

function groundTile(
  ctx: Ctx,
  theme: ThemeId,
  pal: ThemePalette,
  base: Surface,
  top: boolean,
  left: boolean,
  right: boolean,
  alt = false,
): void {
  ctx.drawImage(base.canvas, 0, 0);
  if (alt) fillAlt(ctx, theme, pal);
  if (top) surfaceBand(ctx, theme, pal);
  if (left) edgeLeft(ctx, theme, pal, top);
  if (right) {
    ctx.save();
    ctx.translate(T, 0);
    ctx.scale(-1, 1);
    edgeLeft(ctx, theme, pal, top);
    ctx.restore();
  }
}

/** Variante de remplissage : fossile + racines lumineuses (jungle), géode de cristaux (lune). */
function fillAlt(ctx: Ctx, theme: ThemeId, pal: ThemePalette): void {
  if (theme === 'jungle') {
    // Ammonite fossile
    ctx.save();
    ctx.translate(30, 34);
    ctx.rotate(-0.4);
    ctx.strokeStyle = rgba('#e6dcff', 0.3);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let a = 0; a < TAU * 2.6; a += 0.15) {
      const rr = 1.2 + a * 1.55;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.85;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba('#e6dcff', 0.18);
    ctx.lineWidth = 1;
    for (let a = 1.5; a < TAU * 2.6; a += 0.55) {
      const r1 = 1.2 + a * 1.55;
      const r0 = 1.2 + (a - TAU) * 1.55;
      if (r0 < 1) continue;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.85);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.85);
      ctx.stroke();
    }
    ctx.restore();
    // Racines lumineuses
    glow(ctx, pal.vein, 4, () => {
      ctx.strokeStyle = rgba(pal.vein, 0.5);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(8, 10);
      ctx.bezierCurveTo(18, 18, 10, 30, 18, 40);
      ctx.bezierCurveTo(24, 48, 40, 50, 54, 58);
      ctx.moveTo(18, 40);
      ctx.quadraticCurveTo(10, 50, 8, 56);
      ctx.moveTo(46, 8);
      ctx.quadraticCurveTo(52, 20, 56, 24);
      ctx.stroke();
    });
    glowDot(ctx, 8, 56, 1.2, pal.bioB);
    glowDot(ctx, 56, 24, 1.2, pal.vein);
  } else {
    // Géode
    const cav = ellipse(32, 36, 17, 12);
    fillOutlined(ctx, cav, linGrad(ctx, 0, 24, 0, 48, [[0, '#120e22'], [1, '#2a2440']]), rgba(pal.soilSpeck, 0.8), 2);
    ctx.save();
    ctx.clip(cav);
    softDot(ctx, 32, 42, 18, pal.vein, 0.5);
    const shard = (x: number, h: number, a: number, w: number) => {
      ctx.save();
      ctx.translate(x, 48);
      ctx.rotate(a);
      const p = poly([-w / 2, 0, -w / 2, -h * 0.7, 0, -h, w / 2, -h * 0.7, w / 2, 0]);
      fillOutlined(ctx, p, pal.vein, '#2a1206', 1.2);
      ctx.fillStyle = pal.veinLight;
      ctx.fill(poly([-w / 2, 0, -w / 2, -h * 0.7, 0, -h, 0, 0]));
      ctx.restore();
    };
    shard(22, 12, -0.5, 6);
    shard(29, 17, -0.15, 7);
    shard(36, 15, 0.2, 7);
    shard(43, 10, 0.55, 5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(32, 36, 17, 12, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

// ================================================================ Blocs

function blockTile(ctx: Ctx, theme: ThemeId, pal: ThemePalette): void {
  const b = roundRect(1.5, 1.5, 61, 61, 9);
  if (theme === 'jungle') {
    fillOutlined(ctx, b, linGrad(ctx, 0, 0, 64, 64, [[0, pal.blockLight], [0.45, pal.blockBase], [1, pal.blockDark]]), pal.outline, 3);
    ctx.save();
    ctx.clip(b);
    // Pierre : fissures
    ctx.strokeStyle = rgba(pal.blockDark, 0.9);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(50, 62);
    ctx.lineTo(46, 52);
    ctx.lineTo(52, 46);
    ctx.moveTo(4, 40);
    ctx.lineTo(11, 43);
    ctx.stroke();
    // Biseau
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke(roundRect(7, 7, 50, 50, 6));
    // Glyphe gravé lumineux
    glow(ctx, pal.vein, 6, () => {
      ctx.strokeStyle = rgba(pal.vein, 0.75);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(32, 34, 8, 0, TAU);
      ctx.moveTo(32, 20);
      ctx.lineTo(32, 26);
      ctx.moveTo(32, 42);
      ctx.lineTo(32, 48);
      ctx.moveTo(18, 34);
      ctx.lineTo(24, 34);
      ctx.moveTo(40, 34);
      ctx.lineTo(46, 34);
      ctx.stroke();
    });
    glowDot(ctx, 32, 34, 2, pal.vein);
    // Mousse sur le dessus
    const moss = new Path2D();
    moss.moveTo(0, 0);
    moss.lineTo(40, 0);
    moss.bezierCurveTo(40, 6, 34, 8, 30, 7);
    moss.bezierCurveTo(26, 13, 18, 9, 16, 9);
    moss.bezierCurveTo(10, 16, 4, 12, 0, 14);
    moss.closePath();
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, 14, [[0, pal.surfaceLight], [0.4, pal.surface], [1, pal.surfaceDark]]);
    ctx.fill(moss);
    ctx.restore();
    rimLight(ctx, b, 'rgba(200,220,255,0.4)', 2, 1.6, 1.6);
    glow(ctx, pal.surfaceGlow, 5, () => {
      ctx.strokeStyle = pal.surfaceLight;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(4, 4.5);
      ctx.quadraticCurveTo(10, 2.4, 36, 2.6);
      ctx.stroke();
    });
  } else {
    fillOutlined(ctx, b, linGrad(ctx, 0, 0, 0, 64, [[0, pal.blockLight], [0.5, pal.blockBase], [1, pal.blockDark]]), pal.outline, 3);
    rimLight(ctx, b, 'rgba(255,255,255,0.45)', 2, 1.5, 1.5);
    // Panneau en creux
    const panel = roundRect(10, 10, 44, 44, 5);
    fillOutlined(ctx, panel, linGrad(ctx, 0, 10, 0, 54, [[0, '#24203a'], [1, '#3e3a58']]), rgba(pal.outline, 0.8), 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 53.5);
    ctx.lineTo(53.5, 53.5);
    ctx.lineTo(53.5, 12);
    ctx.stroke();
    // Croisillon
    ctx.save();
    ctx.clip(panel);
    ctx.strokeStyle = rgba(pal.blockLight, 0.5);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(54, 54);
    ctx.moveTo(54, 10);
    ctx.lineTo(10, 54);
    ctx.stroke();
    ctx.restore();
    // Bande lumineuse orange
    glow(ctx, pal.vein, 8, () => {
      ctx.fillStyle = pal.vein;
      ctx.fillRect(22, 30, 20, 4);
    });
    ctx.fillStyle = pal.veinLight;
    ctx.fillRect(24, 31, 16, 1.5);
    // Rivets
    for (const [x, y] of [[6, 6], [58, 6], [6, 58], [58, 58]] as const) {
      fillOutlined(ctx, circle(x, y, 2.2), sphereGrad(ctx, x, y, 2.2, '#ffffff', pal.blockLight, pal.blockDark), pal.outline, 1);
    }
  }
}

// Glyphe extraterrestre « ? »
function glyphPath(): Path2D {
  const g = new Path2D();
  g.moveTo(23.5, 26);
  g.bezierCurveTo(23, 17, 41, 15, 41, 25);
  g.bezierCurveTo(41, 31, 32, 31, 32, 38);
  return g;
}

function bonusTile(ctx: Ctx, pal: ThemePalette, used: boolean): void {
  const frame = roundRect(1.5, 1.5, 61, 61, 10);
  const inner = roundRect(8, 8, 48, 48, 7);
  if (!used) {
    fillOutlined(ctx, frame, linGrad(ctx, 0, 0, 64, 64, [[0, '#ffffff'], [0.15, pal.bonusFrame], [0.7, pal.bonusFrame], [1, '#7a3a08']]), pal.outline, 3);
    rimLight(ctx, frame, 'rgba(255,255,255,0.6)', 2, 1.5, 1.5);
    const ig = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    ig.addColorStop(0, pal.bonusCore);
    ig.addColorStop(0.55, '#3a0a4a');
    ig.addColorStop(1, '#12041c');
    fillOutlined(ctx, inner, ig, pal.outline, 2);
    // Glyphe
    const g = glyphPath();
    glow(ctx, pal.bonusGlyph, 12, () => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.bonusGlyph;
      ctx.lineWidth = 6;
      ctx.stroke(g);
      ctx.fillStyle = pal.bonusGlyph;
      ctx.fill(poly([32, 41.5, 36, 45.5, 32, 49.5, 28, 45.5]));
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke(g);
    // Points latéraux
    glowDot(ctx, 16, 32, 1.5, pal.bonusGlyph);
    glowDot(ctx, 48, 32, 1.5, pal.bonusGlyph);
    // Reflet de vitre
    ctx.save();
    ctx.clip(inner);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill(poly([8, 8, 34, 8, 8, 34]));
    ctx.restore();
    // Clous
    for (const [x, y] of [[5, 5], [59, 5], [5, 59], [59, 59]] as const) {
      fillOutlined(ctx, circle(x, y, 2), '#ffffff', '#7a3a08', 1);
    }
  } else {
    fillOutlined(ctx, frame, linGrad(ctx, 0, 0, 64, 64, [[0, '#6a6070'], [0.5, '#4a4252'], [1, '#26202e']]), pal.outline, 3);
    rimLight(ctx, frame, 'rgba(255,255,255,0.18)', 2, 1.5, 1.5);
    fillOutlined(ctx, inner, linGrad(ctx, 0, 8, 0, 56, [[0, '#1a1622'], [1, '#2a2432']]), pal.outline, 2);
    // Glyphe éteint (gravure)
    const g = glyphPath();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 5;
    ctx.save();
    ctx.translate(0.8, 0.8);
    ctx.stroke(g);
    ctx.restore();
    ctx.strokeStyle = '#0e0b14';
    ctx.lineWidth = 4.5;
    ctx.stroke(g);
    ctx.fillStyle = '#0e0b14';
    ctx.fill(poly([32, 42, 35.5, 45.5, 32, 49, 28.5, 45.5]));
    // Fêlure
    ctx.strokeStyle = 'rgba(10,8,14,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(54, 10);
    ctx.lineTo(47, 19);
    ctx.lineTo(50, 24);
    ctx.stroke();
    for (const [x, y] of [[5, 5], [59, 5], [5, 59], [59, 59]] as const) {
      fillOutlined(ctx, circle(x, y, 2), '#5a5262', '#1a1622', 1);
    }
  }
}

// ================================================================ Plateforme traversable

function platformTile(ctx: Ctx, theme: ThemeId, pal: ThemePalette): void {
  if (theme === 'jungle') {
    const top = (x: number) => 5 + 0.8 * Math.sin((x / T) * TAU * 2);
    const bot = (x: number) => 23 + 1.4 * Math.sin((x / T) * TAU * 2 + 1);
    // Liane pendante
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(18, 22);
    ctx.bezierCurveTo(14, 30, 22, 36, 17, 44);
    ctx.stroke();
    ctx.strokeStyle = '#1f8a6a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    glowDot(ctx, 17, 45.5, 2.2, pal.bioB);
    for (const [x, y, a] of [[16, 30, -0.6], [19, 37, 0.7]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      fillOutlined(ctx, ellipse(4, 0, 4, 1.8), '#2ad8a0', pal.outline, 1.2);
      ctx.restore();
    }
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(46, 22);
    ctx.quadraticCurveTo(49, 28, 46, 32);
    ctx.stroke();
    ctx.strokeStyle = '#1f8a6a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Bûche
    const log = new Path2D();
    for (let x = 0; x <= T; x += 2) {
      if (x === 0) log.moveTo(x, top(x));
      else log.lineTo(x, top(x));
    }
    for (let x = T; x >= 0; x -= 2) log.lineTo(x, bot(x));
    log.closePath();
    ctx.fillStyle = linGrad(ctx, 0, 4, 0, 25, [[0, '#8a5a8a'], [0.35, '#5a2e60'], [1, '#26102e']]);
    ctx.fill(log);
    ctx.save();
    ctx.clip(log);
    // Veinage
    ctx.strokeStyle = 'rgba(20,6,30,0.5)';
    ctx.lineWidth = 1.1;
    for (const y0 of [11, 15, 19]) {
      ctx.beginPath();
      for (let x = 0; x <= T; x += 4) {
        const y = y0 + Math.sin((x / T) * TAU * 2 + y0) * 1.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    fillOutlined(ctx, ellipse(40, 16, 4, 2.6), '#3a1a40', 'rgba(20,6,30,0.8)', 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 1.2, 40);
    ctx.restore();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let x = 0; x <= T; x += 2) {
      if (x === 0) ctx.moveTo(x, bot(x));
      else ctx.lineTo(x, bot(x));
    }
    ctx.stroke();
    // Mousse
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
      ctx.beginPath();
      for (let x = 0; x <= T; x += 2) {
        const y = top(x) - 1.6 - 0.8 * Math.sin((x / T) * TAU * 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  } else {
    // Poutrelle métallique
    ctx.lineCap = 'butt';
    const truss = (col: string, w: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let k = -1; k < 3; k++) {
        const x0 = k * 32;
        ctx.moveTo(x0, 22);
        ctx.lineTo(x0 + 16, 11);
        ctx.lineTo(x0 + 32, 22);
      }
      ctx.stroke();
    };
    truss(pal.outline, 5);
    truss('#6e6894', 2.4);
    // Rails
    ctx.fillStyle = pal.outline;
    ctx.fillRect(0, 19.5, T, 6);
    ctx.fillStyle = linGrad(ctx, 0, 21, 0, 24, [[0, '#7a7298'], [1, '#3a3456']]);
    ctx.fillRect(0, 21, T, 3);
    // Plateau
    ctx.fillStyle = pal.outline;
    ctx.fillRect(0, 2.5, T, 10);
    ctx.fillStyle = linGrad(ctx, 0, 4, 0, 11, [[0, '#f0eaff'], [0.4, '#b0a8cc'], [1, '#6a6288']]);
    ctx.fillRect(0, 4, T, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 4.4, T, 1);
    // Joint
    ctx.fillStyle = 'rgba(12,10,26,0.6)';
    ctx.fillRect(0, 4, 1.2, 7);
    // Feux
    for (const x of [16, 48]) {
      glow(ctx, pal.vein, 7, () => {
        ctx.fillStyle = pal.vein;
        ctx.fillRect(x - 3, 7, 6, 2.4);
      });
      ctx.fillStyle = pal.veinLight;
      ctx.fillRect(x - 2, 7.5, 4, 1);
    }
  }
}

// ================================================================ Danger

function hazardTile(ctx: Ctx, theme: ThemeId, pal: ThemePalette): void {
  if (theme === 'jungle') {
    const surf = (x: number) => 40 + 1.4 * Math.sin((x / T) * TAU * 2) + 0.8 * Math.sin((x / T) * TAU * 5 + 1);
    // Épines (derrière l'acide)
    const thorn = (x: number, tipY: number, lean: number, w: number) => {
      const p = new Path2D();
      p.moveTo(x - w, 64);
      p.bezierCurveTo(x - w * 0.6, 50, x + lean * 0.3 - 1, tipY + 10, x + lean, tipY);
      p.bezierCurveTo(x + lean * 0.3 + 2, tipY + 12, x + w * 0.6, 50, x + w, 64);
      p.closePath();
      fillOutlined(ctx, p, linGrad(ctx, 0, tipY, 0, 64, [[0, '#ff7ae6'], [0.25, '#7a2a8a'], [1, '#2a0a34']]), pal.outline, 2.2);
      glowDot(ctx, x + lean, tipY + 1.5, 1.4, pal.accent);
    };
    thorn(14, 26, -3, 6);
    thorn(46, 30, 3, 5.5);
    thorn(31, 36, 1, 4);
    // Acide
    const acid = new Path2D();
    for (let x = 0; x <= T; x += 2) {
      if (x === 0) acid.moveTo(x, surf(x));
      else acid.lineTo(x, surf(x));
    }
    acid.lineTo(T, T);
    acid.lineTo(0, T);
    acid.closePath();
    const ag = linGrad(ctx, 0, 38, 0, 64, [[0, '#e6ff6a'], [0.18, '#7dff3a'], [0.6, '#1fae3a'], [1, '#0b4a2a']]);
    glow(ctx, 'rgba(140,255,60,0.9)', 12, () => {
      ctx.fillStyle = ag;
      ctx.fill(acid);
    });
    ctx.fillStyle = ag;
    ctx.fill(acid);
    // Bulles
    ctx.save();
    ctx.clip(acid);
    for (const [x, y, r] of [[8, 54, 2.4], [22, 47, 1.6], [36, 57, 2.8], [52, 50, 2], [58, 59, 1.4], [28, 60, 1.2]] as const) {
      ctx.strokeStyle = 'rgba(240,255,190,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // Surface brillante
    ctx.strokeStyle = '#f6ffc0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let x = 0; x <= T; x += 2) {
      if (x === 0) ctx.moveTo(x, surf(x) + 0.6);
      else ctx.lineTo(x, surf(x) + 0.6);
    }
    ctx.stroke();
    // Bulles qui éclatent en surface
    for (const [x, r] of [[18, 3.2], [44, 2.4]] as const) {
      const y = surf(x);
      fillOutlined(ctx, new Path2D(`M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`), 'rgba(170,255,90,0.85)', 'rgba(240,255,190,0.9)', 1);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.5, 0.8, 0, TAU);
      ctx.fill();
    }
    glowDot(ctx, 30, surf(30) - 6, 0.9, '#d6ff6a');
  } else {
    // Gravats au pied
    const r = rng(19);
    // Pics de cristal (rouge-magenta : danger)
    const spike = (x: number, tipY: number, w: number, lean: number) => {
      const p = poly([x - w / 2, 64, x - w / 2 + 1, 50, x + lean, tipY, x + w / 2 - 1, 50, x + w / 2, 64]);
      glow(ctx, 'rgba(255,61,122,0.9)', 9, () => {
        ctx.fillStyle = '#ff3d7a';
        ctx.fill(p);
      });
      fillOutlined(ctx, p, '#e0205a', pal.outline, 2);
      ctx.fillStyle = '#ffb0c8';
      ctx.fill(poly([x - w / 2, 64, x - w / 2 + 1, 50, x + lean, tipY, x + lean * 0.6, 64]));
      ctx.fillStyle = '#8a0a3a';
      ctx.fill(poly([x + lean * 0.6 + 2, 64, x + lean, tipY, x + w / 2 - 1, 50, x + w / 2, 64]));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 3, 58);
      ctx.lineTo(x + lean - 1, tipY + 6);
      ctx.stroke();
      glowDot(ctx, x + lean, tipY + 1, 1.1, '#ffffff');
    };
    spike(10, 38, 12, -2);
    spike(54, 36, 12, 2);
    spike(32, 30, 15, 0);
    spike(21, 46, 8, -1);
    spike(43, 44, 9, 1);
    for (let i = 0; i < 8; i++) {
      const x = (i / 8) * T + r() * 4;
      const rx = 3 + r() * 3;
      wrapX(T, x, rx + 1, (px) => {
        fillOutlined(ctx, ellipse(px, 62, rx, 2.6), linGrad(ctx, 0, 59, 0, 64, [[0, pal.surface], [1, pal.surfaceDark]]), pal.outline, 1.4);
      });
    }
  }
}

// ================================================================ Décor (sans collision, posé au bas de la tuile)

function decorTile(ctx: Ctx, theme: ThemeId, pal: ThemePalette, which: 0 | 1 | 2): void {
  if (theme === 'jungle') {
    if (which === 0) {
      // Fougère bioluminescente
      const fronds: [number, number, number][] = [
        [-1.15, 30, -1],
        [-0.6, 40, -1],
        [-0.1, 46, 1],
        [0.45, 40, 1],
        [1.05, 30, 1],
      ];
      for (const [a, len, side] of fronds) {
        ctx.save();
        ctx.translate(32, 63);
        ctx.rotate(a);
        const stem = new Path2D();
        stem.moveTo(0, 0);
        stem.quadraticCurveTo(side * 6, -len * 0.6, side * 2, -len);
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 3.4;
        ctx.stroke(stem);
        ctx.strokeStyle = '#1aa88a';
        ctx.lineWidth = 1.6;
        ctx.stroke(stem);
        for (let k = 1; k < 7; k++) {
          const t = k / 7;
          const y = -len * t;
          const x = side * 6 * 2 * t * (1 - t) + side * 2 * t * t;
          const lw = (1 - t) * 6 + 2;
          for (const s of [-1, 1]) {
            ctx.fillStyle = t > 0.6 ? pal.bioA : '#20c8a0';
            ctx.beginPath();
            ctx.ellipse(x + s * lw * 0.6, y + 1, lw * 0.65, 1.5, s * 0.5, 0, TAU);
            ctx.fill();
          }
        }
        // Crosse enroulée
        glow(ctx, pal.bioA, 8, () => {
          ctx.strokeStyle = '#c8fff4';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(side * 2 + side * 2.2, -len - 0.5, 2.2, 0, TAU * 0.8);
          ctx.stroke();
        });
        ctx.restore();
      }
    } else if (which === 1) {
      // Bouquet de champignons
      const shroom = (x: number, h: number, cr: number, col: string, colLight: string) => {
        const stem = new Path2D();
        stem.moveTo(x - 3, 64);
        stem.quadraticCurveTo(x - 1, 64 - h * 0.6, x - 2, 64 - h);
        stem.lineTo(x + 2, 64 - h);
        stem.quadraticCurveTo(x + 1, 64 - h * 0.6, x + 3.5, 64);
        stem.closePath();
        fillOutlined(ctx, stem, linGrad(ctx, x - 3, 0, x + 3, 0, [[0, '#c9b8f0'], [1, '#7a68b0']]), pal.outline, 2);
        const y = 64 - h;
        softDot(ctx, x, y + 3, cr * 1.6, pal.bioA, 0.35);
        const cap = new Path2D();
        cap.moveTo(x - cr, y + 2);
        cap.bezierCurveTo(x - cr, y - cr * 1.1, x + cr, y - cr * 1.1, x + cr, y + 2);
        cap.quadraticCurveTo(x, y + 5, x - cr, y + 2);
        cap.closePath();
        glow(ctx, col, 8, () => {
          fillOutlined(ctx, cap, sphereGrad(ctx, x - cr * 0.3, y - cr * 0.3, cr * 1.2, colLight, col, '#5a0a5a'), pal.outline, 2.2);
        });
        ctx.strokeStyle = pal.bioA;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - cr + 2, y + 2.5);
        ctx.quadraticCurveTo(x, y + 5.5, x + cr - 2, y + 2.5);
        ctx.stroke();
        for (const [dx, dy, rr] of [[-0.4, -0.45, 0.16], [0.2, -0.65, 0.12], [0.5, -0.2, 0.1]] as const) {
          ctx.fillStyle = 'rgba(255,240,255,0.9)';
          ctx.beginPath();
          ctx.arc(x + dx * cr, y + dy * cr, Math.max(1, rr * cr), 0, TAU);
          ctx.fill();
        }
      };
      shroom(18, 18, 9, pal.bioB, '#ffc0f4');
      shroom(42, 14, 7, '#a04aff', '#e0c0ff');
      shroom(30, 30, 12, pal.bioB, '#ffd0f8');
    } else {
      // Fleur-bulbe extraterrestre
      const stem = new Path2D();
      stem.moveTo(30, 64);
      stem.bezierCurveTo(24, 46, 40, 34, 34, 20);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 5;
      ctx.stroke(stem);
      ctx.strokeStyle = '#178a6a';
      ctx.lineWidth = 2.6;
      ctx.stroke(stem);
      for (const [x, y, a, s] of [[28, 52, -0.7, 1], [33, 42, 0.6, -1]] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        const leaf = new Path2D();
        leaf.moveTo(0, 0);
        leaf.quadraticCurveTo(s * 6, -7, s * 14, -2);
        leaf.quadraticCurveTo(s * 6, 2, 0, 0);
        fillOutlined(ctx, leaf, '#22c09a', pal.outline, 1.8);
        ctx.restore();
      }
      softDot(ctx, 34, 15, 16, '#ffd84a', 0.4);
      const bulb = new Path2D();
      bulb.moveTo(34, 21);
      bulb.bezierCurveTo(24, 20, 26, 6, 34, 4);
      bulb.bezierCurveTo(42, 6, 44, 20, 34, 21);
      bulb.closePath();
      glow(ctx, '#ffd84a', 10, () => {
        fillOutlined(ctx, bulb, sphereGrad(ctx, 32, 10, 10, '#ffffff', '#ffe27a', '#ff7a3d'), pal.outline, 2);
      });
      // Pétales
      for (const s of [-1, 1]) {
        const pet = new Path2D();
        pet.moveTo(34, 19);
        pet.quadraticCurveTo(34 + s * 10, 16, 34 + s * 12, 24);
        pet.quadraticCurveTo(34 + s * 6, 22, 34, 21);
        fillOutlined(ctx, pet, pal.bioB, pal.outline, 1.6);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(31, 9, 2, 3, -0.3, 0, TAU);
      ctx.fill();
    }
  } else {
    if (which === 0) {
      // Amas de cristaux orange
      const base = ellipse(32, 62, 18, 4.5);
      fillOutlined(ctx, base, pal.surfaceDark, pal.outline, 2);
      softDot(ctx, 32, 50, 24, pal.vein, 0.35);
      const shard = (x: number, h: number, a: number, w: number) => {
        ctx.save();
        ctx.translate(x, 62);
        ctx.rotate(a);
        const p = poly([-w / 2, 0, -w / 2, -h * 0.7, 0, -h, w / 2, -h * 0.7, w / 2, 0]);
        glow(ctx, 'rgba(255,154,46,0.85)', 8, () => {
          fillOutlined(ctx, p, pal.vein, pal.outline, 1.8);
        });
        ctx.fillStyle = pal.veinLight;
        ctx.fill(poly([-w / 2, 0, -w / 2, -h * 0.7, 0, -h, 0, 0]));
        ctx.fillStyle = '#b4400a';
        ctx.fill(poly([w * 0.15, 0, w * 0.15, -h * 0.9, w / 2, -h * 0.7, w / 2, 0]));
        ctx.restore();
      };
      shard(22, 20, -0.5, 8);
      shard(42, 22, 0.45, 8);
      shard(36, 30, 0.15, 10);
      shard(28, 38, -0.12, 11);
      shard(48, 12, 0.9, 6);
    } else if (which === 1) {
      // Rocher cratérisé
      const rock = new Path2D();
      rock.moveTo(8, 64);
      rock.bezierCurveTo(4, 50, 16, 34, 32, 36);
      rock.bezierCurveTo(48, 34, 60, 48, 56, 64);
      rock.closePath();
      fillOutlined(ctx, rock, sphereGrad(ctx, 26, 42, 32, pal.surfaceLight, pal.surface, pal.soil), pal.outline, 2.6);
      rimLight(ctx, rock, 'rgba(255,255,255,0.6)', 1.6, 1.4, 1.6);
      for (const [x, y, rx] of [[24, 48, 5], [40, 44, 3.5], [44, 56, 3]] as const) {
        ctx.fillStyle = rgba(pal.surfaceDark, 0.75);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, rx * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, rx * 0.55, 0, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      glow(ctx, pal.vein, 5, () => {
        ctx.strokeStyle = pal.vein;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(14, 58);
        ctx.lineTo(20, 55);
        ctx.lineTo(26, 58);
        ctx.lineTo(31, 55);
        ctx.stroke();
      });
    } else {
      // Vers-tubes à panache lumineux
      const tubes: [number, number, number][] = [
        [20, 22, -0.25],
        [28, 34, -0.08],
        [36, 28, 0.1],
        [44, 18, 0.3],
        [14, 12, -0.45],
      ];
      for (const [x, h, a] of tubes) {
        ctx.save();
        ctx.translate(x, 64);
        ctx.rotate(a);
        const tube = roundRect(-3.2, -h, 6.4, h + 2, 3);
        fillOutlined(ctx, tube, linGrad(ctx, -3, 0, 3, 0, [[0, pal.surface], [1, pal.surfaceDark]]), pal.outline, 2);
        ctx.strokeStyle = rgba(pal.outline, 0.5);
        ctx.lineWidth = 0.9;
        for (let y = -h + 5; y < 0; y += 4) {
          ctx.beginPath();
          ctx.moveTo(-3, y);
          ctx.lineTo(3, y + 0.6);
          ctx.stroke();
        }
        const col = h > 25 ? '#ff5ae0' : '#4ff0ff';
        glow(ctx, col, 8, () => {
          ctx.fillStyle = col;
          for (const s of [-1, 0, 1]) {
            ctx.beginPath();
            ctx.ellipse(s * 3, -h - 3, 1.6, 4, s * 0.5, 0, TAU);
            ctx.fill();
          }
        });
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -h - 3.5, 1, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ================================================================ Assemblage

function drawTile(ctx: Ctx, index: number, theme: ThemeId, pal: ThemePalette, base: Surface): void {
  switch (index) {
    case TILE_FRAME.GROUND_TOP:
      return groundTile(ctx, theme, pal, base, true, false, false);
    case TILE_FRAME.GROUND_FILL:
      return groundTile(ctx, theme, pal, base, false, false, false);
    case TILE_FRAME.GROUND_TOP_LEFT:
      return groundTile(ctx, theme, pal, base, true, true, false);
    case TILE_FRAME.GROUND_TOP_RIGHT:
      return groundTile(ctx, theme, pal, base, true, false, true);
    case TILE_FRAME.GROUND_LEFT:
      return groundTile(ctx, theme, pal, base, false, true, false);
    case TILE_FRAME.GROUND_RIGHT:
      return groundTile(ctx, theme, pal, base, false, false, true);
    case TILE_FRAME.BLOCK:
      return blockTile(ctx, theme, pal);
    case TILE_FRAME.BONUS:
      return bonusTile(ctx, pal, false);
    case TILE_FRAME.BONUS_USED:
      return bonusTile(ctx, pal, true);
    case TILE_FRAME.PLATFORM:
      return platformTile(ctx, theme, pal);
    case TILE_FRAME.HAZARD:
      return hazardTile(ctx, theme, pal);
    case TILE_FRAME.DECOR_A:
      return decorTile(ctx, theme, pal, 0);
    case TILE_FRAME.DECOR_B:
      return decorTile(ctx, theme, pal, 1);
    case TILE_FRAME.DECOR_C:
      return decorTile(ctx, theme, pal, 2);
    case TILE_FRAME.GROUND_SINGLE:
      return groundTile(ctx, theme, pal, base, true, true, true);
    case TILE_FRAME.GROUND_FILL_ALT:
      return groundTile(ctx, theme, pal, base, false, false, false, true);
  }
}

/** Position (coin haut-gauche, hors extrusion) de la tuile `index` dans le tileset. */
export function tileRect(index: number): { x: number; y: number } {
  const c = index % TILESET.columns;
  const r = Math.floor(index / TILESET.columns);
  return {
    x: TILESET.margin + c * (T + TILESET.spacing),
    y: TILESET.margin + r * (T + TILESET.spacing),
  };
}

/** Dessine le tileset complet (528x132) avec bords extrudés. */
export function drawTileset(theme: ThemeId): HTMLCanvasElement {
  const pal = PALETTES[theme];
  const base = makeFillBase(theme, pal);
  const sheet = makeCanvas(TILESET.width, TILESET.height);
  const sctx = sheet.ctx;
  sctx.imageSmoothingEnabled = false;
  const tmp = makeCanvas(T, T);
  const total = TILESET.columns * TILESET.rows;
  for (let i = 0; i < total; i++) {
    tmp.ctx.clearRect(0, 0, T, T);
    tmp.ctx.save();
    drawTile(tmp.ctx, i, theme, pal, base);
    tmp.ctx.restore();
    const { x, y } = tileRect(i);
    const src = tmp.canvas;
    sctx.drawImage(src, 0, 0, T, T, x, y, T, T);
    // Extrusion d'1 px des bords (évite les coutures au filtrage)
    sctx.drawImage(src, 0, 0, T, 1, x, y - 1, T, 1);
    sctx.drawImage(src, 0, T - 1, T, 1, x, y + T, T, 1);
    sctx.drawImage(src, 0, 0, 1, T, x - 1, y, 1, T);
    sctx.drawImage(src, T - 1, 0, 1, T, x + T, y, 1, T);
    sctx.drawImage(src, 0, 0, 1, 1, x - 1, y - 1, 1, 1);
    sctx.drawImage(src, T - 1, 0, 1, 1, x + T, y - 1, 1, 1);
    sctx.drawImage(src, 0, T - 1, 1, 1, x - 1, y + T, 1, 1);
    sctx.drawImage(src, T - 1, T - 1, 1, 1, x + T, y + T, 1, 1);
  }
  return sheet.canvas;
}
