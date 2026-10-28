import { type Ctx, glowDot, linGrad, mix, rgba, rimLight, rng, smoothPoly, softDot, sphereGrad } from '../../game2d/art/util';
import { VH, type Sprite, makeSprite } from '../scenes/common';

// Espace du prologue, dessiné par code : ciel au bord de la galaxie, étoiles qui défilent, la Faille (déchirure
// lumineuse, intérieur gris du Vide), ciel éteint de l'autre côté et planètes rongées par le Vide (gris,
// fissures noires, reflets rouges), Xéna encore allumée.

const TAU = Math.PI * 2;
const VOID_RED = '#ff3a4a';

/** Ciel du bord de la galaxie (demi-résolution) : dégradé, nébuleuses, bande de la galaxie qu'on quitte. */
export function spaceSky(vw: number, res: number): Sprite {
  return makeSprite(vw, VH, 0, 0, res * 0.5, (ctx) => {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, VH, [[0, '#05021a'], [0.55, '#0d0630'], [1, '#1c0d4c']]);
    ctx.fillRect(0, 0, vw, VH);
    // Bande de la galaxie : de bas à gauche vers le haut, s'éteint vers la droite (le bord).
    for (let i = 0; i < 26; i++) {
      const u = i / 25;
      const x = -40 + u * vw * 0.7;
      const y = 330 - u * 210 + Math.sin(u * 5) * 18;
      softDot(ctx, x, y, 70 + 40 * Math.sin(u * 3.1), u < 0.5 ? '#3fffe0' : '#7a6aff', 0.1 * (1 - u * 0.6));
    }
    softDot(ctx, vw * 0.14, 90, 210, '#ff3fc8', 0.16);
    softDot(ctx, vw * 0.48, 330, 240, '#3a6bff', 0.14);
    softDot(ctx, vw * 0.3, 210, 120, '#b06aff', 0.1);
    // Le bord : obscurité à droite.
    ctx.fillStyle = linGrad(ctx, vw * 0.6, 0, vw, 0, [[0, 'rgba(2,0,10,0)'], [1, 'rgba(2,0,10,0.55)']]);
    ctx.fillRect(0, 0, vw, VH);
  });
}

/**
 * Étoiles sur une tuile de `w` unités qui se répète (défilement). `bright` : étoiles plus grosses avec halo.
 * `tint` : couleurs des étoiles (le ciel éteint du Vide n'a que des gris).
 */
export function starTile(w: number, res: number, seed: number, count: number, bright: boolean, tint: readonly string[]): Sprite {
  return makeSprite(w, VH, 0, 0, res, (ctx) => {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const x = r() * w;
      const y = r() * VH;
      const col = tint[Math.floor(r() * tint.length) % tint.length];
      const a = 0.35 + r() * 0.6;
      // Étoiles proches des bords redessinées de l'autre côté : raccord invisible.
      for (let ox = -w; ox <= w; ox += w) {
        const px = x + ox;
        if (px < -6 || px > w + 6) continue;
        if (bright) {
          softDot(ctx, px, y, 5 + r() * 3, col, 0.45 * a);
          ctx.fillStyle = rgba('#ffffff', a);
          ctx.beginPath();
          ctx.arc(px, y, 0.9 + r() * 0.6, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = rgba(col, a);
          ctx.fillRect(px, y, 0.6 + r() * 0.8, 0.6 + r() * 0.8);
        }
      }
    }
  });
}

/** Scintillement en croix (au-dessus des étoiles, opacité animée). */
export function twinkle(res: number): Sprite {
  return makeSprite(24, 24, 12, 12, res, (ctx) => {
    softDot(ctx, 12, 12, 9, '#bff8ff', 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(12, 12, 11, 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, 12, 0.9, 11, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, 12, 1.8, 0, TAU);
    ctx.fill();
  });
}

// ---------------------------------------------------------------- La Faille

const RIFT_W = 150;
const RIFT_H = 330;

/** Contour de la déchirure : lentille verticale aux bords en dents de scie (graine fixe). */
function riftPath(seed: number, cx: number, cy: number, half: number, hw: number): Path2D {
  const r = rng(seed);
  const pts: number[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const v = -1 + (2 * i) / n;
    const w = hw * Math.pow(Math.max(0, 1 - v * v), 0.75);
    pts.push(cx + w + (i % 2 ? 5 : -2) * r() * (w > 4 ? 1 : 0), cy + v * half);
  }
  for (let i = n - 1; i > 0; i--) {
    const v = -1 + (2 * i) / n;
    const w = hw * Math.pow(Math.max(0, 1 - v * v), 0.75);
    pts.push(cx - w - (i % 2 ? 5 : -2) * r() * (w > 4 ? 1 : 0), cy + v * half);
  }
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/** Éclair en zigzag de (x0, y0) vers (x1, y1). */
function bolt(ctx: Ctx, r: () => number, x0: number, y0: number, x1: number, y1: number, jag: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const n = 6;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    ctx.lineTo(x0 + (x1 - x0) * u + (r() - 0.5) * jag, y0 + (y1 - y0) * u + (r() - 0.5) * jag);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * La Faille (150 x 330 unités, ancre au centre), 3 images : même déchirure, éclairs différents (scintillement).
 * Bords blanc-magenta, intérieur gris et noir du Vide avec des braises rouges (halo violet à dessiner à part).
 */
export function rift(res: number): Sprite {
  const cx = RIFT_W / 2;
  const cy = RIFT_H / 2;
  return makeSprite(
    RIFT_W,
    RIFT_H,
    cx,
    cy,
    res,
    (ctx, i) => {
      // Halo : dessiné à part (glowSprite), sinon coupé aux bords du sprite.
      const outer = riftPath(7, cx, cy, 150, 46);
      const inner = riftPath(7, cx, cy, 140, 36);
      // Bord épais lumineux
      ctx.save();
      ctx.shadowColor = '#ff4fd8';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd6f6';
      ctx.fill(outer);
      ctx.restore();
      // Intérieur : le Vide, gris et noir qui tourbillonne
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 150);
      g.addColorStop(0, '#3a3440');
      g.addColorStop(0.35, '#16121c');
      g.addColorStop(1, '#040208');
      ctx.fillStyle = g;
      ctx.fill(inner);
      ctx.save();
      ctx.clip(inner);
      const r = rng(31);
      ctx.lineWidth = 2.2;
      for (let k = 0; k < 9; k++) {
        ctx.strokeStyle = rgba(k % 3 === 0 ? '#8a8494' : '#4a4452', 0.55);
        ctx.beginPath();
        const y0 = cy - 120 + k * 30;
        ctx.ellipse(cx + (r() - 0.5) * 20, y0, 26 + r() * 14, 9 + r() * 6, (r() - 0.5) * 0.6, r() * TAU, r() * TAU + 3.6);
        ctx.stroke();
      }
      for (let k = 0; k < 14; k++) glowDot(ctx, cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 230, 0.9 + r(), VOID_RED);
      ctx.restore();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke(inner);
      // Éclairs autour (différents par image)
      const rb = rng(100 + i * 17);
      ctx.save();
      ctx.shadowColor = '#ff4fd8';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffe8fb';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 5; k++) {
        const side = k % 2 ? 1 : -1;
        const y = cy + (rb() - 0.5) * 220;
        const v = (y - cy) / 150;
        const w = 46 * Math.pow(Math.max(0, 1 - v * v), 0.75);
        bolt(ctx, rb, cx + side * w, y, cx + side * (w + 20 + rb() * 40), y + (rb() - 0.5) * 60, 14);
      }
      ctx.restore();
    },
    3,
  );
}

// ---------------------------------------------------------------- De l'autre côté : ciel éteint

/** Ciel éteint (demi-résolution) : gris violacé, brume rouge, nuages de cendre. */
export function voidSky(vw: number, res: number): Sprite {
  return makeSprite(vw, VH, 0, 0, res * 0.5, (ctx) => {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, VH, [[0, '#07060c'], [0.6, '#141019'], [1, '#22141c']]);
    ctx.fillRect(0, 0, vw, VH);
    softDot(ctx, vw * 0.8, 340, 300, '#ff2a3a', 0.09);
    softDot(ctx, vw * 0.2, 80, 260, '#5a5664', 0.12);
    softDot(ctx, vw * 0.55, 200, 200, '#3a3644', 0.16);
    const r = rng(77);
    for (let i = 0; i < 18; i++) softDot(ctx, r() * vw, r() * VH, 40 + r() * 70, '#6a6670', 0.05 + r() * 0.05);
  });
}

// ---------------------------------------------------------------- Planètes

export type PlanetLook = 'dead' | 'living' | 'livingDead' | 'xena';

/** Fissures noires bordées de rouge (marche aléatoire depuis quelques départs), découpées par le disque. */
function cracks(ctx: Ctx, cx: number, cy: number, R: number, seed: number, count: number): void {
  const r = rng(seed);
  const lines: number[][] = [];
  for (let k = 0; k < count; k++) {
    let a = r() * TAU;
    let x = cx + Math.cos(a) * R * r() * 0.8;
    let y = cy + Math.sin(a) * R * r() * 0.8;
    const pts = [x, y];
    const n = 5 + Math.floor(r() * 5);
    for (let j = 0; j < n; j++) {
      a += (r() - 0.5) * 1.6;
      const len = R * (0.08 + r() * 0.12);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push(x, y);
    }
    lines.push(pts);
  }
  const stroke = (pts: number[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  ctx.save();
  ctx.shadowColor = VOID_RED;
  ctx.shadowBlur = R * 0.12;
  ctx.strokeStyle = rgba(VOID_RED, 0.85);
  ctx.lineWidth = Math.max(1.5, R * 0.05);
  for (const l of lines) stroke(l);
  ctx.restore();
  ctx.strokeStyle = '#08060c';
  ctx.lineWidth = Math.max(0.8, R * 0.022);
  for (const l of lines) stroke(l);
}

function drawPlanet(ctx: Ctx, cx: number, cy: number, R: number, look: PlanetLook): void {
  const disc = new Path2D();
  disc.arc(cx, cy, R, 0, TAU);
  if (look === 'xena') softDot(ctx, cx, cy, R * 1.45, '#3dffd2', 0.35);
  else if (look === 'living') softDot(ctx, cx, cy, R * 1.4, '#ffcf6a', 0.3);
  else softDot(ctx, cx, cy, R * 1.35, VOID_RED, 0.12);

  if (look === 'dead' || look === 'livingDead') {
    ctx.fillStyle = sphereGrad(ctx, cx, cy, R, '#c4c2cc', '#6e6c78', '#1e1c24');
  } else if (look === 'living') {
    ctx.fillStyle = sphereGrad(ctx, cx, cy, R, '#ffe7a8', '#ff9a3f', '#5a1e0c');
  } else {
    ctx.fillStyle = sphereGrad(ctx, cx, cy, R, '#d8c4ff', '#6a3ab8', '#140632');
  }
  ctx.fill(disc);
  ctx.save();
  ctx.clip(disc);
  const r = rng(look === 'xena' ? 5 : look === 'dead' ? 9 : 13);
  if (look === 'living' || look === 'livingDead') {
    // Bandes de sable
    for (let i = 0; i < 7; i++) {
      const y = cy - R + (i + 0.5) * ((2 * R) / 7);
      ctx.strokeStyle = rgba(look === 'living' ? (i % 2 ? '#ffd27a' : '#c4581a') : i % 2 ? '#9a98a4' : '#4a4854', 0.35);
      ctx.lineWidth = R * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - R, y);
      ctx.bezierCurveTo(cx - R * 0.3, y - R * 0.08, cx + R * 0.3, y + R * 0.1, cx + R, y);
      ctx.stroke();
    }
  } else if (look === 'xena') {
    // Continents de jungle lumineux
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU;
      const d = r() * R * 0.7;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const pts: number[] = [];
      const s = R * (0.18 + r() * 0.22);
      for (let j = 0; j < 7; j++) {
        const b = (j / 7) * TAU;
        pts.push(x + Math.cos(b) * s * (0.6 + r() * 0.5), y + Math.sin(b) * s * (0.6 + r() * 0.5));
      }
      ctx.fillStyle = rgba('#18d9a8', 0.75);
      ctx.fill(smoothPoly(pts));
    }
    for (let i = 0; i < 16; i++) glowDot(ctx, cx + (r() - 0.5) * R * 1.4, cy + (r() - 0.5) * R * 1.4, R * 0.025, i % 3 ? '#9dffe4' : '#ff5ae0');
    // Une tache grise : le Vide arrive.
    const sx = cx + R * 0.45;
    const sy = cy + R * 0.38;
    ctx.fillStyle = rgba('#5a5864', 0.9);
    ctx.fill(smoothPoly([sx - R * 0.2, sy, sx - R * 0.05, sy - R * 0.16, sx + R * 0.18, sy - R * 0.1, sx + R * 0.22, sy + R * 0.12, sx, sy + R * 0.2]));
    cracks(ctx, sx, sy, R * 0.22, 41, 2);
  } else {
    // Taches mortes
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = rgba(i % 2 ? '#3a3842' : '#8a8894', 0.35);
      ctx.beginPath();
      ctx.ellipse(cx + (r() - 0.5) * R * 1.5, cy + (r() - 0.5) * R * 1.5, R * (0.1 + r() * 0.2), R * (0.06 + r() * 0.12), r() * 3, 0, TAU);
      ctx.fill();
    }
  }
  if (look === 'dead' || look === 'livingDead') cracks(ctx, cx, cy, R, look === 'dead' ? 21 : 23, look === 'dead' ? 7 : 5);
  // Terminateur : côté nuit en bas à droite
  const night = ctx.createRadialGradient(cx - R * 0.5, cy - R * 0.55, R * 0.4, cx - R * 0.2, cy - R * 0.25, R * 1.6);
  night.addColorStop(0, 'rgba(0,0,0,0)');
  night.addColorStop(0.6, 'rgba(4,2,10,0.25)');
  night.addColorStop(1, 'rgba(4,2,10,0.8)');
  ctx.fillStyle = night;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  // Liseré : rouge pour les mondes éteints, couleur de l'atmosphère sinon.
  const rim = look === 'xena' ? 'rgba(120,255,230,0.8)' : look === 'living' ? 'rgba(255,220,140,0.8)' : rgba(VOID_RED, 0.75);
  rimLight(ctx, disc, rim, Math.max(1.5, R * 0.05), R * 0.05, R * 0.06);
  ctx.strokeStyle = rgba(mix('#000000', '#ffffff', 0.1), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke(disc);
}

/** Planète de rayon R (unités), ancre au centre. */
export function planet(R: number, look: PlanetLook, res: number): Sprite {
  const m = R * 1.5;
  return makeSprite(m * 2, m * 2, m, m, res, (ctx) => drawPlanet(ctx, m, m, R, look));
}

/** Débris rocheux sombre (silhouette), ancre au centre ; 3 images de formes différentes. */
export function debris(res: number): Sprite {
  return makeSprite(
    40,
    40,
    20,
    20,
    res,
    (ctx, i) => {
      const r = rng(300 + i * 7);
      const pts: number[] = [];
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * TAU;
        const d = 9 + r() * 9;
        pts.push(20 + Math.cos(a) * d, 20 + Math.sin(a) * d);
      }
      const p = smoothPoly(pts);
      ctx.fillStyle = '#26222c';
      ctx.fill(p);
      rimLight(ctx, p, rgba(VOID_RED, 0.6), 2, 1.5, 1.5);
      ctx.strokeStyle = '#0a080e';
      ctx.lineWidth = 1.4;
      ctx.stroke(p);
    },
    3,
  );
}
