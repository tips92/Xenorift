import type { ThemeId } from '../../../core/types';
import {
  type Ctx,
  circle,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  limb,
  linGrad,
  poly,
  rimLight,
  rng,
  smoothPoly,
  softDot,
  sphereGrad,
} from '../util';

// Ennemis : silhouettes distinctes par type et par monde. Tous dessinés tournés vers la droite.

const OUT = '#0d0618';

// ================================================================ Marcheur

/** Blob gluant (jungle). */
function slime(ctx: Ctx, w: number, h: number, lean: number, frame: number): void {
  const cx = 31;
  const base = 54;
  const p = new Path2D();
  p.moveTo(cx - w / 2, base - 3);
  p.bezierCurveTo(cx - w / 2 - 2, base - h * 0.75, cx - w * 0.32 + lean, base - h, cx + lean, base - h);
  p.bezierCurveTo(cx + w * 0.32 + lean, base - h, cx + w / 2 + 2, base - h * 0.75, cx + w / 2, base - 3);
  p.quadraticCurveTo(cx + w / 2, base, cx + w / 2 - 5, base);
  // Base ondulée (gouttes)
  const n = 5;
  for (let i = n; i >= 0; i--) {
    const x = cx - w / 2 + 5 + ((w - 10) * i) / n;
    p.lineTo(x, base + (i % 2 === 0 ? 0.5 : -1));
  }
  p.quadraticCurveTo(cx - w / 2, base, cx - w / 2, base - 3);
  p.closePath();

  const g = ctx.createRadialGradient(cx - w * 0.12 + lean, base - h * 0.72, 2, cx + lean * 0.5, base - h * 0.45, Math.max(w, h) * 0.75);
  g.addColorStop(0, '#eaffa0');
  g.addColorStop(0.3, '#7cf04a');
  g.addColorStop(0.75, '#22a83e');
  g.addColorStop(1, '#0e6a2e');
  glow(ctx, 'rgba(110,255,80,0.8)', 10, () => {
    ctx.fillStyle = g;
    ctx.fill(p);
  });
  ctx.strokeStyle = '#05210c';
  ctx.lineWidth = 2.6;
  ctx.stroke(p);
  ctx.fillStyle = g;
  ctx.fill(p);
  // Noyau et bulles internes
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = 'rgba(10,90,40,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - 4 + lean * 0.3, base - h * 0.3, w * 0.22, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const r = rng(40 + frame);
  for (let i = 0; i < 5; i++) {
    const bx = cx - w * 0.35 + r() * w * 0.6;
    const by = base - 5 - r() * h * 0.55;
    const br = 1 + r() * 2;
    ctx.strokeStyle = 'rgba(230,255,190,0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  rimLight(ctx, p, 'rgba(220,255,170,0.55)', 2, -1.5, -1.6);
  // Reflet
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.22 + lean * 0.6, base - h * 0.7, w * 0.11, h * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - w * 0.33 + lean * 0.6, base - h * 0.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Yeux
  const ey = base - h * 0.6;
  eye(ctx, cx + w * 0.1 + lean, ey, 5.2, 0.6);
  eye(ctx, cx + w * 0.3 + lean, ey + 0.6, 4.4, 0.6);
  // Sourcils fâchés
  ctx.strokeStyle = '#05210c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.1 + lean - 5, ey - 7);
  ctx.lineTo(cx + w * 0.1 + lean + 3, ey - 4.6);
  ctx.moveTo(cx + w * 0.3 + lean + 4, ey - 6.5);
  ctx.lineTo(cx + w * 0.3 + lean - 2, ey - 4.2);
  ctx.stroke();
  // Bouche + croc
  const my = base - h * 0.28;
  const mx = cx + w * 0.22 + lean * 0.8;
  ctx.fillStyle = '#0a2a10';
  ctx.beginPath();
  ctx.moveTo(mx - 6, my - 1);
  ctx.quadraticCurveTo(mx, my + 4, mx + 6, my - 1.5);
  ctx.quadraticCurveTo(mx, my + 1, mx - 6, my - 1);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(mx + 1, my + 0.6);
  ctx.lineTo(mx + 3.4, my + 0.2);
  ctx.lineTo(mx + 2.4, my + 3);
  ctx.fill();
}

function eye(ctx: Ctx, x: number, y: number, r: number, look: number): void {
  fillOutlined(ctx, circle(x, y, r), '#ffffff', OUT, 1.8);
  ctx.fillStyle = '#120a1c';
  ctx.beginPath();
  ctx.arc(x + r * 0.35 * look + 0.4, y + 0.3, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + r * 0.15, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function slimeSquashed(ctx: Ctx): void {
  const p = new Path2D();
  p.moveTo(4, 54);
  p.bezierCurveTo(6, 44, 20, 42, 32, 42);
  p.bezierCurveTo(46, 42, 58, 44, 60, 54);
  p.closePath();
  const g = linGrad(ctx, 0, 42, 0, 55, [[0, '#a8ff6a'], [0.5, '#3ac24a'], [1, '#0e6a2e']]);
  glow(ctx, 'rgba(110,255,80,0.7)', 8, () => {
    ctx.fillStyle = g;
    ctx.fill(p);
  });
  fillOutlined(ctx, p, g, '#05210c', 2.4);
  // Éclaboussures
  for (const [x, y, rr] of [[2, 52, 2.5], [62, 51, 2], [10, 46, 1.6], [56, 45, 1.5]] as const) {
    fillOutlined(ctx, circle(x, y, rr), '#5be04a', '#05210c', 1.4);
  }
  // Yeux en croix
  ctx.strokeStyle = '#05210c';
  ctx.lineWidth = 2;
  for (const ex of [26, 38]) {
    ctx.beginPath();
    ctx.moveTo(ex - 3, 45.5);
    ctx.lineTo(ex + 3, 50.5);
    ctx.moveTo(ex + 3, 45.5);
    ctx.lineTo(ex - 3, 50.5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(18, 45.5, 5, 1.4, -0.1, 0, Math.PI * 2);
  ctx.fill();
}

/** Pattes d'arachnide : genou haut, pied écarté (marche en trépied). */
function spiderLegs(
  ctx: Ctx,
  legs: readonly (readonly [number, number, number])[],
  ay: number,
  kneeY: number,
  ph: number,
  far: boolean,
  color: string,
): void {
  for (let i = 0; i < legs.length; i++) {
    const [ax0, kdx, fdx] = legs[i];
    const p2 = ph + (i % 2 ? Math.PI : 0) + (far ? Math.PI : 0);
    const swing = Math.sin(p2) * 3;
    const lift = Math.max(0, Math.cos(p2)) * 3;
    const ax = ax0 + (far ? -3 : 0);
    const kx = ax + kdx + swing * 0.5;
    const ky = kneeY - lift * 0.6;
    const fx = ax + fdx + swing;
    const fy = 54.5 - lift;
    const w = far ? 2.6 : 3.2;
    limb(ctx, ax, ay, kx, ky, w, color, OUT, 1.8);
    limb(ctx, kx, ky, fx, fy, w * 0.8, color, OUT, 1.8);
  }
}

/** Shard de cristal facetté (pointe vers le haut avant rotation). */
function crystalShard(
  ctx: Ctx,
  x: number,
  y: number,
  h: number,
  w: number,
  ang: number,
  light: string,
  mid: string,
  dark: string,
  glowCol: string | null,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const shape = poly([-w / 2, 0, -w / 2, -h * 0.62, 0, -h, w / 2, -h * 0.62, w / 2, 0]);
  if (glowCol) {
    glow(ctx, glowCol, 8, () => {
      ctx.fillStyle = mid;
      ctx.fill(shape);
    });
  }
  fillOutlined(ctx, shape, mid, OUT, 1.8);
  ctx.fillStyle = light;
  ctx.fill(poly([-w / 2, 0, -w / 2, -h * 0.62, 0, -h, 0, 0]));
  ctx.fillStyle = dark;
  ctx.fill(poly([w * 0.15, 0, w * 0.15, -h * 0.88, w / 2, -h * 0.62, w / 2, 0]));
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h * 0.15);
  ctx.lineTo(-w * 0.28, -h * 0.6);
  ctx.stroke();
  ctx.restore();
}

/** Acarien de cristal (lune). */
function mite(ctx: Ctx, frame: number, squashed: boolean): void {
  const ph = (frame / 4) * Math.PI * 2;
  const bob = squashed ? 0 : Math.abs(Math.sin(ph)) * -1.2;
  const bodyY = squashed ? 48 : 38 + bob;
  const legs = [
    [17, -9, -14],
    [26, -2, -4],
    [35, 6, 10],
  ] as const;
  if (!squashed) spiderLegs(ctx, legs, bodyY + 3, bodyY - 9, ph, true, '#3a3456');
  // Abdomen
  const ab = ellipse(26, bodyY, 17, squashed ? 6 : 11);
  // Cristaux du dos
  if (!squashed) {
    crystalShard(ctx, 16, bodyY - 6, 13, 7, -0.55, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
    crystalShard(ctx, 26, bodyY - 9, 19, 9, 0.05, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
    crystalShard(ctx, 35, bodyY - 7, 12, 7, 0.5, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
  }
  fillOutlined(ctx, ab, sphereGrad(ctx, 24, bodyY - 3, 17, '#d9d2f0', '#8a82a8', '#3a3456'), OUT, 2.4);
  rimLight(ctx, ab, 'rgba(255,190,120,0.7)', 1.6, -1.2, -1.4);
  // Segments
  ctx.strokeStyle = 'rgba(30,24,50,0.6)';
  ctx.lineWidth = 1.2;
  for (const sx of [14, 22, 30]) {
    ctx.beginPath();
    ctx.ellipse(sx, bodyY + 1, 2.5, squashed ? 4 : 8, 0, -1.2, 1.2);
    ctx.stroke();
  }
  // Tête
  const hx = 44;
  const hy = bodyY + 2;
  const head = ellipse(hx, hy, 9, squashed ? 5 : 7.5);
  fillOutlined(ctx, head, sphereGrad(ctx, hx - 2, hy - 3, 9, '#a59cc6', '#5a5278', '#28233e'), OUT, 2.2);
  // Mandibules
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(51, hy + 2);
  ctx.quadraticCurveTo(57, hy + 3, 56, hy + 7);
  ctx.stroke();
  ctx.strokeStyle = '#ffb36a';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (squashed) {
    ctx.strokeStyle = '#ff3d7a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(45, hy - 2);
    ctx.lineTo(49, hy + 1);
    ctx.moveTo(49, hy - 2);
    ctx.lineTo(45, hy + 1);
    ctx.stroke();
    // Éclats de cristal au sol
    crystalShard(ctx, 10, 54, 9, 5, -1.2, '#ffe0a0', '#ff9a2e', '#c4501a', null);
    crystalShard(ctx, 30, 44, 8, 5, 0.9, '#ffe0a0', '#ff9a2e', '#c4501a', null);
    crystalShard(ctx, 56, 54, 9, 5, 1.3, '#ffe0a0', '#ff9a2e', '#c4501a', null);
  } else {
    glowDot(ctx, 47, hy - 2.5, 1.9, '#ff3d7a');
    glowDot(ctx, 50.5, hy - 0.5, 1.5, '#ff3d7a');
    glowDot(ctx, 44, hy - 3.5, 1.2, '#ff3d7a');
    spiderLegs(ctx, legs, bodyY + 5, bodyY - 7, ph, false, '#8a82a8');
  }
}

export function drawWalker(ctx: Ctx, theme: ThemeId, i: number): void {
  if (theme === 'jungle') {
    if (i === 4) return slimeSquashed(ctx);
    const shapes: [number, number, number][] = [
      [46, 32, 0],
      [51, 27, -2],
      [44, 36, 3],
      [40, 39, 1],
    ];
    const [w, h, lean] = shapes[i];
    slime(ctx, w, h, lean, i);
  } else {
    mite(ctx, i, i === 4);
  }
}

// ================================================================ Volant

/** Guêpe-libellule (jungle). */
function wasp(ctx: Ctx, frame: number): void {
  const bob = [0, -1.2, 0, 1.2][frame];
  const wingAng = [-1.05, -0.45, 0.2, -0.45][frame];
  const tx = 33;
  const ty = 27 + bob;
  const wing = (rootX: number, rootY: number, ang: number, len: number, far: boolean) => {
    ctx.save();
    ctx.translate(rootX, rootY);
    ctx.rotate(Math.PI + ang);
    const p = ellipse(len / 2, 0, len / 2, 4.6);
    const g = linGrad(ctx, 0, 0, len, 0, [
      [0, far ? 'rgba(120,200,255,0.35)' : 'rgba(170,255,250,0.55)'],
      [1, far ? 'rgba(160,120,255,0.18)' : 'rgba(255,140,240,0.35)'],
    ]);
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.strokeStyle = far ? 'rgba(120,200,255,0.55)' : 'rgba(210,255,255,0.95)';
    ctx.lineWidth = 1.1;
    ctx.stroke(p);
    ctx.strokeStyle = far ? 'rgba(120,200,255,0.3)' : 'rgba(210,255,255,0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.lineTo(len - 2, 0.5);
    ctx.moveTo(len * 0.35, 0.2);
    ctx.lineTo(len * 0.55, -3.2);
    ctx.moveTo(len * 0.6, 0.3);
    ctx.lineTo(len * 0.8, 3);
    ctx.stroke();
    ctx.restore();
  };
  // Ailes lointaines + fantôme de mouvement
  wing(tx - 1, ty - 5, -wingAng - 0.25, 21, true);
  wing(tx + 3, ty - 5, -wingAng - 0.05, 17, true);
  // Pattes
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  for (const lx of [30, 34, 38]) {
    ctx.beginPath();
    ctx.moveTo(lx, ty + 4);
    ctx.lineTo(lx - 2, ty + 10);
    ctx.lineTo(lx - 4, ty + 13);
    ctx.stroke();
  }
  // Abdomen segmenté (vers l'arrière, légèrement tombant)
  const segs = 6;
  for (let s = segs - 1; s >= 0; s--) {
    const t = s / (segs - 1);
    const x = tx - 7 - t * 21;
    const y = ty + 2 + t * t * 7 + Math.sin(frame * 1.5 + t * 2) * 0.6;
    const rr = 5.6 - t * 2.4;
    const p = ellipse(x, y, rr + 1.2, rr);
    fillOutlined(ctx, p, s % 2 === 0 ? sphereGrad(ctx, x, y, rr, '#f6ff9a', '#c8f53a', '#5a8a10') : sphereGrad(ctx, x, y, rr, '#7a4aa0', '#3a1a5a', '#1a0a2a'), OUT, 2);
  }
  // Dard
  const sx = tx - 7 - 21 - 4;
  const sy = ty + 2 + 7;
  fillOutlined(ctx, poly([sx + 3, sy - 2, sx - 6, sy + 2.5, sx + 3, sy + 2]), '#2a0f3a', OUT, 1.5);
  glowDot(ctx, sx - 5, sy + 2.3, 1.2, '#ff4fd8');
  // Thorax
  const th = ellipse(tx, ty, 8.5, 7);
  fillOutlined(ctx, th, sphereGrad(ctx, tx, ty, 9, '#9dfff0', '#18b8b0', '#0a4a5a'), OUT, 2.2);
  rimLight(ctx, th, 'rgba(255,255,255,0.55)', 1.5, 1.2, 1.2);
  // Tête
  const hx = tx + 11;
  const hy = ty - 1;
  fillOutlined(ctx, circle(hx, hy, 6.5), sphereGrad(ctx, hx, hy, 6.5, '#7a4aa0', '#3a1a5a', '#1a0a2a'), OUT, 2.2);
  const eyeP = ellipse(hx + 2.4, hy - 1, 4.6, 5);
  glow(ctx, '#ff3fc8', 8, () => {
    ctx.fillStyle = sphereGrad(ctx, hx + 2.4, hy - 1, 5, '#ffd0f4', '#ff3fc8', '#8a0a6a');
    ctx.fill(eyeP);
  });
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.4;
  ctx.stroke(eyeP);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(hx + 1.5, hy - 3, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Mandibules + antennes
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx + 5, hy + 4);
  ctx.quadraticCurveTo(hx + 9, hy + 6, hx + 7, hy + 8);
  ctx.moveTo(hx - 1, hy - 6);
  ctx.quadraticCurveTo(hx + 2, hy - 13, hx + 8, hy - 14);
  ctx.stroke();
  glowDot(ctx, hx + 8, hy - 14, 1.1, '#c8ff3a');
  // Ailes proches
  wing(tx - 1, ty - 5, wingAng, 23, false);
  wing(tx + 3, ty - 5, wingAng + 0.2, 18, false);
}

/** Drone-œil (lune). */
function eyeDrone(ctx: Ctx, frame: number): void {
  const bob = [0, -1, 0, 1][frame];
  const cx = 30;
  const cy = 25 + bob;
  const r = 14;
  // Propulseur bas (flamme)
  const fl = [9, 6, 10, 7][frame];
  glow(ctx, '#ff3fc8', 8, () => {
    ctx.fillStyle = linGrad(ctx, 0, cy + r, 0, cy + r + fl + 4, [[0, '#ffffff'], [0.3, '#ff8ae8'], [1, 'rgba(255,63,200,0)']]);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + r);
    ctx.quadraticCurveTo(cx, cy + r + fl * 2, cx + 4, cy + r);
    ctx.fill();
  });
  fillOutlined(ctx, ellipse(cx, cy + r - 1, 5.5, 3.2), '#3a3456', OUT, 2);
  // Ailerons latéraux
  const finA = [0.15, 0.05, -0.05, 0.05][frame];
  ctx.save();
  ctx.translate(cx - r + 2, cy);
  ctx.rotate(finA);
  fillOutlined(ctx, poly([2, -5, -10, -9, -12, -4, -9, 2, 2, 4]), linGrad(ctx, -12, 0, 2, 0, [[0, '#3a3456'], [1, '#8a82a8']]), OUT, 2);
  ctx.restore();
  // Antenne
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - r + 2);
  ctx.lineTo(cx - 9, cy - r - 7);
  ctx.stroke();
  ctx.strokeStyle = '#8a82a8';
  ctx.lineWidth = 1;
  ctx.stroke();
  glowDot(ctx, cx - 9, cy - r - 7.5, frame % 2 === 0 ? 1.8 : 1.2, frame % 2 === 0 ? '#ff5050' : '#a03040');
  // Coque
  const body = circle(cx, cy, r);
  fillOutlined(ctx, body, sphereGrad(ctx, cx, cy, r, '#f0eaff', '#8f88b0', '#2a2542'), OUT, 2.6);
  rimLight(ctx, body, 'rgba(255,160,90,0.65)', 1.8, -1.4, -1.4);
  // Ceinture
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = '#2a2542';
  ctx.fillRect(cx - r, cy + 4, r * 2, 3.5);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = (k + frame) % 4 === 0 ? '#ffb36a' : '#7a4a2a';
    ctx.fillRect(cx - r + 3 + k * 6, cy + 4.8, 2.5, 2);
  }
  ctx.restore();
  // Œil
  const ex = cx + 5;
  const ey = cy - 1;
  fillOutlined(ctx, circle(ex, ey, 9), '#140c22', OUT, 1.8);
  const pulse = [1, 0.9, 1.08, 0.95][frame];
  glow(ctx, '#ff3fc8', 10, () => {
    ctx.fillStyle = sphereGrad(ctx, ex + 1, ey, 7 * pulse, '#ffd6f6', '#ff3fc8', '#7a0a5a');
    ctx.beginPath();
    ctx.arc(ex + 1, ey, 6.8 * pulse, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#12051a';
  ctx.beginPath();
  ctx.ellipse(ex + 2.2, ey, 2.2, 3.6 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex - 1.5, ey - 3, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Paupière métallique
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.fillStyle = linGrad(ctx, 0, cy - r, 0, cy - 6, [[0, '#c9c2e2'], [1, '#5a5278']]);
  ctx.beginPath();
  ctx.arc(ex, ey, 10, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineTo(ex + 11, ey - 12);
  ctx.lineTo(ex - 11, ey - 12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex, ey, 10, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.restore();
}

export function drawFlyer(ctx: Ctx, theme: ThemeId, i: number): void {
  if (theme === 'jungle') wasp(ctx, i);
  else eyeDrone(ctx, i);
}

// ================================================================ Blindé

/** Pattes articulées écartées (genou vers l'extérieur), pour le scarabée. */
function splayLegs(ctx: Ctx, ay: number, ph: number, far: boolean, col: string, hi: string): void {
  const legs: [number, number, number][] = [
    [22, -9, -13],
    [33, -1, 0],
    [44, 8, 13],
  ];
  for (let i = 0; i < legs.length; i++) {
    const [ax, kdx, fdx] = legs[i];
    const p2 = ph + (i % 2 ? Math.PI : 0) + (far ? Math.PI : 0);
    const swing = Math.sin(p2) * 4;
    const lift = Math.max(0, Math.cos(p2)) * 3;
    const kx = ax + kdx + swing * 0.5 + (far ? -2 : 0);
    const ky = ay - 5 - lift * 0.6;
    const fx = ax + fdx + swing + (far ? -2 : 0);
    const fy = 54.5 - lift;
    limb(ctx, ax, ay, kx, ky, far ? 3.2 : 4, col, OUT, 1.8);
    limb(ctx, kx, ky, fx, fy, far ? 2.6 : 3.2, col, OUT, 1.8);
    if (!far) {
      ctx.strokeStyle = hi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 1);
      ctx.lineTo(kx, ky - 1);
      ctx.stroke();
    }
    // Griffe
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Scarabée à carapace (jungle). */
function beetle(ctx: Ctx, frame: number): void {
  const ph = (frame / 4) * Math.PI * 2;
  const bob = -Math.abs(Math.sin(ph)) * 1.2;
  splayLegs(ctx, 43 + bob, ph, true, '#2a1446', '#5a3a8a');
  // Tête et corne
  const hx = 57;
  const hy = 37 + bob;
  const horn = new Path2D();
  horn.moveTo(hx - 1, hy - 5);
  horn.quadraticCurveTo(hx + 9, hy - 9, hx + 10, hy - 21);
  horn.quadraticCurveTo(hx + 14, hy - 8, hx + 6, hy + 1);
  horn.closePath();
  glow(ctx, 'rgba(255,200,60,0.8)', 6, () => {
    fillOutlined(ctx, horn, linGrad(ctx, hx, hy, hx + 10, hy - 21, [[0, '#7a4a20'], [0.5, '#ffb52e'], [1, '#fff0a0']]), OUT, 2.2);
  });
  const head = ellipse(hx, hy, 10, 8.5);
  fillOutlined(ctx, head, sphereGrad(ctx, hx, hy, 10, '#b48cff', '#5a2aa0', '#1e0c3a'), OUT, 2.4);
  rimLight(ctx, head, 'rgba(200,170,255,0.8)', 1.5, -1.2, 1.2);
  glowDot(ctx, hx + 4.5, hy - 1.5, 2.3, '#ffb02e');
  // Mandibule
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(hx + 6, hy + 4);
  ctx.quadraticCurveTo(hx + 12, hy + 5, hx + 11, hy + 10);
  ctx.stroke();
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Ventre
  fillOutlined(ctx, ellipse(33, 45 + bob, 22, 5), '#1c0e30', OUT, 2);
  // Carapace (élytres)
  const shell = new Path2D();
  shell.moveTo(9, 45 + bob);
  shell.bezierCurveTo(6, 22 + bob, 22, 11 + bob, 34, 11 + bob);
  shell.bezierCurveTo(48, 11 + bob, 58, 22 + bob, 56, 44 + bob);
  shell.quadraticCurveTo(33, 49 + bob, 9, 45 + bob);
  shell.closePath();
  const g = ctx.createLinearGradient(12, 12 + bob, 50, 46 + bob);
  g.addColorStop(0, '#5affd8');
  g.addColorStop(0.3, '#2a8aff');
  g.addColorStop(0.62, '#6a2ad0');
  g.addColorStop(1, '#240a4a');
  glow(ctx, 'rgba(80,180,255,0.6)', 8, () => {
    ctx.fillStyle = g;
    ctx.fill(shell);
  });
  fillOutlined(ctx, shell, g, OUT, 2.8);
  // Bord doré
  ctx.save();
  ctx.clip(shell);
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 44 + bob);
  ctx.quadraticCurveTo(33, 49.5 + bob, 57, 43 + bob);
  ctx.stroke();
  ctx.restore();
  // Ligne de séparation des élytres
  ctx.strokeStyle = 'rgba(16,6,40,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(44, 14 + bob);
  ctx.quadraticCurveTo(30, 22 + bob, 12, 40 + bob);
  ctx.stroke();
  // Taches lumineuses
  glowDot(ctx, 24, 25 + bob, 2.2, '#ffcc33');
  glowDot(ctx, 37, 31 + bob, 1.9, '#ffcc33');
  glowDot(ctx, 22, 37 + bob, 1.6, '#3ffff0');
  // Reflet spéculaire
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(26, 17 + bob, 9, 3, -0.35, 0, Math.PI * 2);
  ctx.fill();
  rimLight(ctx, shell, 'rgba(180,255,255,0.6)', 1.6, -1.4, -1.6);
  splayLegs(ctx, 45 + bob, ph, false, '#4a2a7a', 'rgba(190,150,255,0.8)');
}

/** Crabe de roche (lune). */
function rockCrab(ctx: Ctx, frame: number): void {
  const ph = (frame / 4) * Math.PI * 2;
  const bob = -Math.abs(Math.sin(ph)) * 1;
  // Pattes pointues écartées (arrière vers la gauche, avant vers la droite)
  const crabLegs = (far: boolean) => {
    const col = far ? '#3a3456' : '#9a92b8';
    const legs: [number, number, number, number][] = [
      [20, -12, -19, 0],
      [31, -3, -6, Math.PI],
      [42, 10, 15, 0],
    ];
    for (const [ax0, kdx, fdx, off] of legs) {
      const p2 = ph + off + (far ? Math.PI : 0);
      const swing = Math.sin(p2) * 3;
      const lift = Math.max(0, Math.cos(p2)) * 3;
      const ax = ax0 + (far ? -3 : 0);
      const ay = (far ? 41 : 45) + bob;
      const kx = ax + kdx + swing * 0.5;
      const ky = ay - (far ? 8 : 4) - lift * 0.5;
      const fx = ax + fdx + swing;
      const fy = 55 - lift;
      limb(ctx, ax, ay, kx, ky, far ? 3.2 : 4.2, col, OUT, 1.8);
      ctx.lineCap = 'round';
      // Tibia effilé
      const nx = -(fy - ky);
      const ny = fx - kx;
      const nl = Math.hypot(nx, ny) || 1;
      const w = far ? 1.8 : 2.4;
      const tib = poly([kx + (nx / nl) * w, ky + (ny / nl) * w, fx, fy, kx - (nx / nl) * w, ky - (ny / nl) * w]);
      fillOutlined(ctx, tib, col, OUT, 1.8);
    }
  };
  crabLegs(true);
  // Pince lointaine
  claw(ctx, 50, 33 + bob, 0.2 + Math.sin(ph) * 0.12, true, 1);
  // Pédoncules oculaires
  for (const [ex, ey, h] of [[44, 24, 9], [50, 25, 11]] as const) {
    limb(ctx, ex, ey + bob, ex + 2, ey - h + bob, 2.4, '#b9b0d0', OUT, 1.6);
    glowDot(ctx, ex + 2, ey - h + bob - 1, 2.3, '#ffd23a');
  }
  // Carapace rocheuse bosselée
  const r = rng(77);
  const pts: number[] = [];
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = Math.PI + (k / (n - 1)) * Math.PI;
    const rx = 23 + (r() - 0.5) * 3;
    const ry = 19 + (r() - 0.5) * 4;
    pts.push(33 + Math.cos(a) * rx, 42 + bob + Math.sin(a) * ry);
  }
  pts.push(54, 45 + bob, 33, 48 + bob, 12, 45 + bob);
  const shell = smoothPoly(pts);
  // Cristaux du dos
  crystalShard(ctx, 25, 27 + bob, 13, 7, -0.4, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
  crystalShard(ctx, 34, 24 + bob, 17, 8, 0.1, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
  crystalShard(ctx, 42, 28 + bob, 10, 6, 0.5, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.9)');
  fillOutlined(ctx, shell, sphereGrad(ctx, 29, 30 + bob, 27, '#ece4ff', '#9a92b8', '#3a3456'), OUT, 2.8);
  rimLight(ctx, shell, 'rgba(255,200,140,0.75)', 1.8, -1.5, -1.6);
  // Cratères
  for (const [x, y, rr] of [[22, 36, 3.5], [38, 34, 2.6], [30, 42, 2.2], [46, 40, 2]] as const) {
    ctx.fillStyle = 'rgba(40,32,64,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y + bob, rr, rr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(x, y + bob, rr, rr * 0.6, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  // Veine orange
  glow(ctx, '#ff9a2e', 5, () => {
    ctx.strokeStyle = '#ffb04a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(14, 41 + bob);
    ctx.lineTo(19, 38 + bob);
    ctx.lineTo(24, 40 + bob);
    ctx.lineTo(28, 37 + bob);
    ctx.stroke();
  });
  crabLegs(false);
  // Grosse pince proche
  claw(ctx, 48, 39 + bob, 0.14 - Math.sin(ph) * 0.14, false, 1.25);
}

function claw(ctx: Ctx, x: number, y: number, open: number, far: boolean, scale: number): void {
  const col = far ? '#4a4466' : '#b9b0d0';
  const dark = far ? '#2a2542' : '#5a5278';
  limb(ctx, x, y, x + 6, y - 4, far ? 4 : 5, col, OUT, 2);
  ctx.save();
  ctx.translate(x + 7, y - 5);
  ctx.scale(scale, scale);
  // Mâchoire fixe
  const upper = new Path2D();
  upper.moveTo(-3, 2);
  upper.bezierCurveTo(-2, -8, 8, -9, 12, -2);
  upper.quadraticCurveTo(6, -3, 2, 1);
  upper.closePath();
  ctx.save();
  ctx.rotate(-open);
  fillOutlined(ctx, upper, sphereGrad(ctx, 3, -4, 9, far ? '#6a6288' : '#e0d8f6', col, dark), OUT, 2);
  ctx.restore();
  const lower = new Path2D();
  lower.moveTo(-3, 1);
  lower.bezierCurveTo(-1, 7, 7, 7, 11, 2);
  lower.quadraticCurveTo(5, 2, 1, -1);
  lower.closePath();
  ctx.save();
  ctx.rotate(open * 0.8);
  fillOutlined(ctx, lower, sphereGrad(ctx, 3, 3, 8, far ? '#6a6288' : '#c9c1e2', col, dark), OUT, 2);
  ctx.restore();
  if (!far) {
    glowDot(ctx, 11, -2.2, 1.2, '#ff9a2e');
    glowDot(ctx, 10, 2.6, 1, '#ff9a2e');
  }
  ctx.restore();
}

export function drawArmored(ctx: Ctx, theme: ThemeId, i: number): void {
  if (theme === 'jungle') beetle(ctx, i);
  else rockCrab(ctx, i);
}

// ================================================================ Cracheur

/** Plante carnivore cracheuse de spores (jungle). */
function plant(ctx: Ctx, frame: number): void {
  const shoot = frame === 2;
  const sway = shoot ? 3 : frame === 0 ? -1 : 1;
  const open = shoot ? 1 : frame === 0 ? 0.25 : 0.4;
  // Feuilles basses
  const leaf = (x: number, ang: number, len: number, far: boolean) => {
    ctx.save();
    ctx.translate(x, 78);
    ctx.rotate(ang);
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(-len * 0.3, -len * 0.35, -len * 0.15, -len * 0.85, 0, -len);
    p.bezierCurveTo(len * 0.18, -len * 0.8, len * 0.3, -len * 0.35, 0, 0);
    p.closePath();
    fillOutlined(ctx, p, linGrad(ctx, 0, 0, 0, -len, far ? [[0, '#0a3a3a'], [1, '#147a6a']] : [[0, '#0e5a4a'], [1, '#2ad8a0']]), OUT, 2);
    glow(ctx, '#3dffe0', 4, () => {
      ctx.strokeStyle = far ? 'rgba(61,255,224,0.4)' : 'rgba(150,255,235,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(-1, -len * 0.5, 0, -len * 0.92);
      ctx.stroke();
    });
    ctx.restore();
  };
  leaf(24, -1.0, 20, true);
  leaf(40, 0.95, 20, true);
  // Tige
  const hx = 33 + sway;
  const hy = 36;
  const stem = new Path2D();
  stem.moveTo(30, 79);
  stem.bezierCurveTo(22, 64, 40 + sway * 0.4, 56, hx - 4, hy + 8);
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 10;
  ctx.stroke(stem);
  ctx.strokeStyle = linGrad(ctx, 20, 0, 40, 0, [[0, '#0e5a4a'], [0.6, '#24b08a'], [1, '#10604e']]);
  ctx.lineWidth = 6;
  ctx.stroke(stem);
  // Sacs à spores
  for (const [x, y] of [[27, 66], [35, 56]] as const) {
    glowDot(ctx, x, y, 2.4, '#b8ff3a');
  }
  leaf(18, -0.55, 24, false);
  leaf(44, 0.6, 22, false);
  leaf(30, -0.05, 14, false);
  // Tête (bulbe) avec mâchoires orientées vers la droite
  ctx.save();
  ctx.translate(hx, hy);
  const jaw = 4 + open * 12;
  // Intérieur de la gueule
  const inside = ellipse(9, 0, 10, jaw * 0.55 + 2);
  ctx.fillStyle = '#3a0820';
  ctx.fill(inside);
  if (open > 0.3) {
    glow(ctx, '#b8ff3a', 10, () => {
      ctx.fillStyle = shoot ? '#eaff8a' : '#7ad02a';
      ctx.beginPath();
      ctx.arc(8, 0, shoot ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const lip = (upperSide: boolean) => {
    const s = upperSide ? -1 : 1;
    const p = new Path2D();
    p.moveTo(-14, 0);
    p.bezierCurveTo(-14, s * 18, 4, s * (jaw + 8), 18, s * (jaw * 0.4));
    p.quadraticCurveTo(6, s * (jaw * 0.25), -4, 0);
    p.closePath();
    // Dents
    const teeth = new Path2D();
    for (let k = 0; k < 4; k++) {
      const t = 0.25 + k * 0.2;
      const tx = -4 + t * 22;
      const ty = s * (jaw * 0.25 + t * jaw * 0.2);
      teeth.moveTo(tx - 1.6, ty);
      teeth.lineTo(tx, ty - s * 4);
      teeth.lineTo(tx + 1.6, ty);
      teeth.closePath();
    }
    ctx.fillStyle = '#fff6e6';
    ctx.fill(teeth);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 0.8;
    ctx.stroke(teeth);
    const g = ctx.createRadialGradient(-6, s * 6, 1, 0, s * 4, 20);
    g.addColorStop(0, '#ff8ae6');
    g.addColorStop(0.45, '#c02a9a');
    g.addColorStop(1, '#4a0a4a');
    fillOutlined(ctx, p, g, OUT, 2.4);
    rimLight(ctx, p, 'rgba(255,200,250,0.6)', 1.5, 1.2, s * 1.2);
    // Points lumineux
    glowDot(ctx, -6, s * 8, 1.5, '#3dffe0');
    glowDot(ctx, 1, s * (jaw * 0.5 + 4), 1.2, '#3dffe0');
  };
  lip(false);
  lip(true);
  ctx.restore();
  if (shoot) {
    softDot(ctx, hx + 20, hy, 10, '#c8ff3a', 0.8);
  }
}

/** Tourelle de cristal (lune). */
function turret(ctx: Ctx, frame: number): void {
  const shoot = frame === 2;
  const power = shoot ? 1 : frame === 0 ? 0.45 : 0.7;
  // Monticule rocheux
  const r = rng(91);
  const pts: number[] = [6, 80];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    pts.push(32 + Math.cos(a) * (26 + (r() - 0.5) * 3), 80 + Math.sin(a) * (22 + (r() - 0.5) * 4));
  }
  pts.push(58, 80);
  const mound = smoothPoly(pts);
  // Éclats latéraux (derrière)
  crystalShard(ctx, 16, 64, 20, 8, -0.5, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.8)');
  crystalShard(ctx, 46, 64, 16, 7, 0.55, '#ffe0a0', '#ff9a2e', '#c4501a', 'rgba(255,150,40,0.8)');
  fillOutlined(ctx, mound, sphereGrad(ctx, 26, 62, 30, '#b9b0d0', '#5a5478', '#24203a'), OUT, 2.6);
  rimLight(ctx, mound, 'rgba(255,200,140,0.5)', 1.6, -1.4, -1.6);
  for (const [x, y, rr] of [[20, 70, 3], [38, 66, 2.4], [44, 74, 2]] as const) {
    ctx.fillStyle = 'rgba(20,16,36,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fût en cristal pointé vers la droite
  const cx = 28;
  const cy = 44;
  const barrel = poly([cx, cy - 7, cx + 22, cy - 5, cx + 30, cy, cx + 22, cy + 5, cx, cy + 7]);
  glow(ctx, `rgba(255,63,200,${0.5 + power * 0.5})`, 6 + power * 10, () => {
    ctx.fillStyle = '#ff6ad8';
    ctx.fill(barrel);
  });
  fillOutlined(ctx, barrel, linGrad(ctx, 0, cy - 7, 0, cy + 7, [[0, '#ffd0f4'], [0.45, '#ff3fc8'], [1, '#7a0a5a']]), OUT, 2.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 4.5);
  ctx.lineTo(cx + 22, cy - 3);
  ctx.stroke();
  // Support
  const mount = poly([cx - 10, 62, cx - 6, cy + 2, cx + 8, cy + 2, cx + 12, 62]);
  fillOutlined(ctx, mount, linGrad(ctx, 0, cy, 0, 62, [[0, '#8a82a8'], [1, '#3a3456']]), OUT, 2.2);
  // Noyau d'énergie
  const core = circle(cx, cy, 9.5);
  fillOutlined(ctx, core, '#1c1030', OUT, 2.2);
  glow(ctx, '#ff3fc8', 6 + power * 12, () => {
    ctx.fillStyle = sphereGrad(ctx, cx, cy, 7, '#ffffff', '#ff6ad8', '#9a0a7a');
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5 + power * 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Anneau
  ctx.strokeStyle = '#ff9a2e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, -0.4, 1.2);
  ctx.stroke();
  if (shoot) {
    softDot(ctx, cx + 32, cy, 14, '#ff3fc8', 0.9);
    softDot(ctx, cx + 32, cy, 6, '#ffffff', 0.9);
  }
}

export function drawSpitter(ctx: Ctx, theme: ThemeId, i: number): void {
  if (theme === 'jungle') plant(ctx, i);
  else turret(ctx, i);
}

// ================================================================ Projectile

export function drawSpore(ctx: Ctx, theme: ThemeId): void {
  const c = 12;
  if (theme === 'jungle') {
    softDot(ctx, c, c, 12, '#9dff3a', 0.6);
    const body = new Path2D();
    const n = 9;
    for (let k = 0; k < n * 2; k++) {
      const a = (k / (n * 2)) * Math.PI * 2;
      const rr = k % 2 === 0 ? 7.2 : 5.8;
      const x = c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      if (k === 0) body.moveTo(x, y);
      else body.lineTo(x, y);
    }
    body.closePath();
    fillOutlined(ctx, body, sphereGrad(ctx, c, c, 7, '#f6ffb0', '#9dff3a', '#2e8a1a'), '#0a2a0a', 1.6);
    ctx.fillStyle = 'rgba(30,110,20,0.6)';
    for (const [x, y] of [[c + 2, c + 2], [c - 2.5, c + 1.5], [c + 1, c - 2.5]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c - 2, c - 2.4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    softDot(ctx, c, c, 12, '#ff3fc8', 0.7);
    const gem = poly([c, c - 7.5, c + 6, c, c, c + 7.5, c - 6, c]);
    fillOutlined(ctx, gem, sphereGrad(ctx, c, c, 7, '#ffe6fa', '#ff3fc8', '#7a0a5a'), '#2a0626', 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill(poly([c, c - 7.5, c - 6, c, c, c]));
    softDot(ctx, c, c, 4, '#ffffff', 0.9);
  }
}
