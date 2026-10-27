import type { ThemeId } from '../../../core/types';
import { PALETTES } from '../palette';
import {
  type Ctx,
  circle,
  ellipse,
  fillOutlined,
  glow,
  glowDot,
  linGrad,
  poly,
  rgba,
  rimLight,
  roundRect,
  softDot,
  sphereGrad,
} from '../util';

// Objets : laser, cristaux, bonus, bouclier, balise, particules, plateforme mobile.

const OUT = '#0d0618';

// ---------------------------------------------------------------- Laser (40x10, vers la droite)

export function drawLaser(ctx: Ctx): void {
  const cy = 5;
  // Traînée
  const tail = ctx.createLinearGradient(0, 0, 40, 0);
  tail.addColorStop(0, 'rgba(63,240,255,0)');
  tail.addColorStop(0.55, 'rgba(63,240,255,0.55)');
  tail.addColorStop(1, 'rgba(63,240,255,0.95)');
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(1, cy);
  ctx.quadraticCurveTo(20, cy - 4.6, 35, cy - 4.4);
  ctx.arc(35, cy, 4.4, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(20, cy + 4.6, 1, cy);
  ctx.fill();
  // Cœur blanc
  const core = ctx.createLinearGradient(4, 0, 40, 0);
  core.addColorStop(0, 'rgba(255,255,255,0)');
  core.addColorStop(0.5, 'rgba(220,255,255,0.9)');
  core.addColorStop(1, '#ffffff');
  glow(ctx, '#3ff0ff', 4, () => {
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(5, cy);
    ctx.quadraticCurveTo(22, cy - 2, 35, cy - 2);
    ctx.arc(35, cy, 2, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(22, cy + 2, 5, cy);
    ctx.fill();
  });
  softDot(ctx, 35, cy, 5, '#ffffff', 0.9);
}

// ---------------------------------------------------------------- Cristal (32x40, 6 frames de rotation)

/** Bipyramide hexagonale qui tourne sur son axe vertical (6 frames = 60°, boucle parfaite). */
export function drawCrystal(ctx: Ctx, frame: number): void {
  const cx = 16;
  const cy = 21;
  const top = -16;
  const bot = 16;
  const ringY = -4;
  const R = 10.5;
  const phi = (frame / 6) * (Math.PI / 3);
  const verts: { x: number; z: number; ang: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const a = phi + (k / 6) * Math.PI * 2;
    verts.push({ x: Math.sin(a) * R, z: Math.cos(a) * R, ang: a });
  }
  // Halo
  softDot(ctx, cx, cy, 16, '#3ff0ff', 0.45);
  // Silhouette
  const sil: number[] = [cx, cy + top];
  // Les sommets extrêmes en x forment la silhouette
  let minX = 0;
  let maxX = 0;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
  }
  sil.push(cx + maxX, cy + ringY, cx, cy + bot, cx + minX, cy + ringY);
  const silP = poly(sil);
  ctx.strokeStyle = '#06243a';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke(silP);
  // Facettes visibles (normale orientée vers la caméra)
  const lx = -0.5;
  const ly = -0.6;
  const lz = 0.62;
  const faces: { z: number; pts: number[]; col: string }[] = [];
  for (let k = 0; k < 6; k++) {
    const a = verts[k];
    const b = verts[(k + 1) % 6];
    const midAng = phi + ((k + 0.5) * Math.PI) / 3;
    const nzc = Math.cos(midAng);
    const nxc = Math.sin(midAng);
    for (const upper of [true, false]) {
      const ny = upper ? -0.55 : 0.75;
      const nz = nzc * 0.85;
      const nx = nxc * 0.85;
      if (nz <= 0.02) continue;
      const lum = Math.max(0, nx * lx + ny * ly + nz * lz);
      const tipY = upper ? top : bot;
      const t = Math.min(1, lum * 1.15);
      const hue = (k + (upper ? 0 : 3)) % 6;
      const base = hue === 1 ? '#b066ff' : hue === 4 ? '#ff6ad8' : '#22d8ff';
      const col = t > 0.75 ? '#eaffff' : t > 0.5 ? '#7ff6ff' : t > 0.28 ? base : '#0a6a9a';
      faces.push({
        z: nz,
        pts: [cx, cy + tipY, cx + a.x, cy + ringY, cx + b.x, cy + ringY],
        col,
      });
    }
  }
  faces.sort((p, q) => p.z - q.z);
  glow(ctx, 'rgba(63,240,255,0.9)', 6, () => {
    ctx.fillStyle = '#22d8ff';
    ctx.fill(silP);
  });
  for (const f of faces) {
    const p = poly(f.pts);
    ctx.fillStyle = f.col;
    ctx.fill(p);
    ctx.strokeStyle = 'rgba(6,36,58,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke(p);
  }
  // Arête de la ceinture
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + minX, cy + ringY);
  ctx.lineTo(cx + maxX, cy + ringY);
  ctx.stroke();
  // Éclat scintillant
  if (frame === 0 || frame === 3) {
    const sx = frame === 0 ? cx - 5 : cx + 5;
    const sy = frame === 0 ? cy - 9 : cy + 4;
    glow(ctx, '#ffffff', 4, () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4.5);
      ctx.lineTo(sx + 1, sy - 1);
      ctx.lineTo(sx + 4.5, sy);
      ctx.lineTo(sx + 1, sy + 1);
      ctx.lineTo(sx, sy + 4.5);
      ctx.lineTo(sx - 1, sy + 1);
      ctx.lineTo(sx - 4.5, sy);
      ctx.lineTo(sx - 1, sy - 1);
      ctx.closePath();
      ctx.fill();
    });
  }
}

// ---------------------------------------------------------------- Bonus (48x48)

function powerOrb(ctx: Ctx, light: string, mid: string, dark: string, glowCol: string): void {
  const c = 24;
  softDot(ctx, c, c, 24, glowCol, 0.55);
  const orb = circle(c, c, 18);
  fillOutlined(ctx, orb, sphereGrad(ctx, c, c, 18, light, mid, dark), OUT, 2.6);
  // Anneau intérieur
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(c, c, 14.5, 0, Math.PI * 2);
  ctx.stroke();
  rimLight(ctx, orb, 'rgba(255,255,255,0.5)', 2, -1.5, -1.5);
}

function orbGloss(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(18, 14, 7, 3.4, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPowerTriple(ctx: Ctx): void {
  powerOrb(ctx, '#ffd0a0', '#ff6a3d', '#8a1a4a', '#ff7a3d');
  // Trois rayons en éventail
  for (const a of [-0.42, 0, 0.42]) {
    ctx.save();
    ctx.translate(14, 24);
    ctx.rotate(a);
    glow(ctx, '#3ff0ff', 5, () => {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(19, 0);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    ctx.fillStyle = '#c9fdff';
    ctx.beginPath();
    ctx.arc(19.5, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  fillOutlined(ctx, circle(14, 24, 3.5), '#ffffff', OUT, 2);
  orbGloss(ctx);
}

export function drawPowerShield(ctx: Ctx): void {
  powerOrb(ctx, '#c9fdff', '#2fa8ff', '#16246a', '#3ff0ff');
  const s = new Path2D();
  s.moveTo(24, 11);
  s.quadraticCurveTo(30, 14.5, 34.5, 14.5);
  s.quadraticCurveTo(35, 29, 24, 36.5);
  s.quadraticCurveTo(13, 29, 13.5, 14.5);
  s.quadraticCurveTo(18, 14.5, 24, 11);
  s.closePath();
  glow(ctx, '#bffcff', 6, () => {
    fillOutlined(ctx, s, linGrad(ctx, 0, 11, 0, 36, [[0, '#ffffff'], [1, '#bfeaff']]), OUT, 2.4);
  });
  // Hexagone central
  const hex: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    hex.push(24 + Math.cos(a) * 5.2, 23 + Math.sin(a) * 5.2);
  }
  fillOutlined(ctx, poly(hex), '#2fa8ff', '#16246a', 1.4);
  orbGloss(ctx);
}

export function drawPowerDoubleJump(ctx: Ctx): void {
  powerOrb(ctx, '#eaffb0', '#5ae04a', '#0e5a3a', '#7dff4a');
  for (const dy of [-5, 5]) {
    const ch = new Path2D();
    ch.moveTo(14, 26 + dy);
    ch.lineTo(24, 16 + dy);
    ch.lineTo(34, 26 + dy);
    glow(ctx, '#eaffb0', 5, () => {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 7.5;
      ctx.stroke(ch);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke(ch);
    });
  }
  orbGloss(ctx);
}

// ---------------------------------------------------------------- Bulle de bouclier (96x96)

export function drawShieldBubble(ctx: Ctx): void {
  const c = 48;
  const r = 43;
  const g = ctx.createRadialGradient(c, c, r * 0.55, c, c, r);
  g.addColorStop(0, 'rgba(63,240,255,0)');
  g.addColorStop(0.75, 'rgba(63,200,255,0.12)');
  g.addColorStop(1, 'rgba(120,250,255,0.42)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  // Motif hexagonal près du bord
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  const hexR = 7;
  for (let row = -8; row <= 8; row++) {
    for (let col = -8; col <= 8; col++) {
      const x = c + col * hexR * 1.5;
      const y = c + row * hexR * 1.732 + (col % 2 ? hexR * 0.866 : 0);
      const d = Math.hypot(x - c, y - c) / r;
      if (d < 0.6) continue;
      ctx.strokeStyle = `rgba(160,250,255,${(d - 0.6) * 0.55})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * hexR * 0.92;
        const py = y + Math.sin(a) * hexR * 0.92;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  glow(ctx, '#3ff0ff', 8, () => {
    ctx.strokeStyle = 'rgba(160,250,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  });
  // Reflets
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, r - 7, Math.PI * 1.08, Math.PI * 1.42);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(c - 20, c - 30, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, r - 6, Math.PI * 0.15, Math.PI * 0.4);
  ctx.stroke();
}

// ---------------------------------------------------------------- Balise de point de contrôle (48x128)

export function drawCheckpoint(ctx: Ctx, frame: number): void {
  const on = frame > 0;
  const px = 15;
  const col = on ? '#3dffb0' : '#ff4a5a';
  // Socle
  const base = new Path2D();
  base.moveTo(3, 127);
  base.lineTo(7, 116);
  base.quadraticCurveTo(px, 111, 23, 116);
  base.lineTo(27, 127);
  base.closePath();
  fillOutlined(ctx, base, linGrad(ctx, 0, 112, 0, 127, [[0, '#9aa2c8'], [1, '#3a3f62']]), OUT, 2.2);
  ctx.fillStyle = on ? '#3dffb0' : '#5a2a3a';
  ctx.fillRect(9, 120, 12, 2.2);
  // Mât
  const pole = roundRect(px - 2.5, 26, 5, 90, 2);
  fillOutlined(ctx, pole, linGrad(ctx, px - 2.5, 0, px + 2.5, 0, [[0, '#6a7298'], [0.4, '#e6eaff'], [1, '#7a82a8']]), OUT, 2);
  for (let y = 40; y < 112; y += 14) {
    ctx.fillStyle = on ? (y / 14 + frame) % 2 === 0 ? '#3dffb0' : '#1a8a6a' : '#2a2e48';
    ctx.fillRect(px - 1.2, y, 2.4, 3);
  }
  // Drapeau holographique
  if (on) {
    const wave = frame === 1 ? 0 : 1;
    const flag = new Path2D();
    flag.moveTo(px + 2, 30);
    flag.bezierCurveTo(px + 12, 26 + wave * 3, px + 20, 34 - wave * 3, px + 30, 31 + wave * 2);
    flag.lineTo(px + 26, 42 + wave);
    flag.lineTo(px + 30, 53 + wave * 2);
    flag.bezierCurveTo(px + 20, 56 - wave * 3, px + 12, 48 + wave * 3, px + 2, 52);
    flag.closePath();
    glow(ctx, '#3dffb0', 8, () => {
      ctx.fillStyle = 'rgba(61,255,176,0.45)';
      ctx.fill(flag);
    });
    ctx.strokeStyle = 'rgba(190,255,230,0.95)';
    ctx.lineWidth = 1.3;
    ctx.stroke(flag);
    // Lignes de balayage
    ctx.save();
    ctx.clip(flag);
    ctx.strokeStyle = 'rgba(200,255,235,0.35)';
    ctx.lineWidth = 1;
    for (let y = 28 + frame; y < 58; y += 3) {
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + 32, y);
      ctx.stroke();
    }
    ctx.restore();
    // Glyphe (étoile de Kaï)
    glow(ctx, '#ffffff', 4, () => {
      ctx.fillStyle = '#ffffff';
      const sx = px + 15;
      const sy = 42 + wave;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = k % 2 === 0 ? 5 : 2.2;
        ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    });
  } else {
    // Drapeau replié
    const furled = new Path2D();
    furled.moveTo(px + 2, 30);
    furled.lineTo(px + 7, 33);
    furled.lineTo(px + 6, 60);
    furled.lineTo(px + 2, 62);
    furled.closePath();
    fillOutlined(ctx, furled, '#3a3f62', OUT, 1.6);
  }
  // Lanterne au sommet
  const lampY = 17;
  const cage = roundRect(px - 7, lampY - 9, 14, 20, 6);
  if (on) softDot(ctx, px, lampY, 22 + frame * 2, col, frame === 1 ? 0.55 : 0.75);
  fillOutlined(ctx, cage, '#2a2e48', OUT, 2.2);
  const bulb = ellipse(px, lampY + 1, 4.8, 7);
  if (on) {
    glow(ctx, col, 12, () => {
      ctx.fillStyle = sphereGrad(ctx, px, lampY + 1, 7, '#ffffff', col, '#0a8a5a');
      ctx.fill(bulb);
    });
  } else {
    ctx.fillStyle = sphereGrad(ctx, px, lampY + 1, 7, '#a04a5a', '#5a2030', '#2a0a14');
    ctx.fill(bulb);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px - 1, lampY - 1, 3, Math.PI, Math.PI * 1.6);
  ctx.stroke();
  // Chapeau
  fillOutlined(ctx, roundRect(px - 8, lampY - 12, 16, 4.5, 2), '#c9cfe8', OUT, 2);
  if (on) {
    // Anneaux d'émission
    ctx.strokeStyle = rgba('#3dffb0', frame === 1 ? 0.55 : 0.3);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(px, lampY, 12 + frame * 2, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- Particules

export function drawSpark(ctx: Ctx): void {
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
}

export function drawPuff(ctx: Ctx): void {
  const blobs: [number, number, number][] = [
    [12, 19, 8.5],
    [20, 18, 9],
    [16, 12, 8],
    [23, 23, 6],
    [9, 23, 5.5],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(225,225,240,0.7)');
    g.addColorStop(1, 'rgba(200,200,225,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Plateforme mobile (192x32)

export function drawMover(ctx: Ctx, theme: ThemeId): void {
  const pal = PALETTES[theme];
  if (theme === 'jungle') {
    // Dalle de pierre flottante couverte de mousse, runes lumineuses
    const slab = new Path2D();
    slab.moveTo(4, 6);
    slab.lineTo(188, 6);
    slab.quadraticCurveTo(191, 6, 190, 10);
    slab.lineTo(184, 22);
    slab.quadraticCurveTo(160, 30, 96, 30);
    slab.quadraticCurveTo(32, 30, 8, 22);
    slab.lineTo(2, 10);
    slab.quadraticCurveTo(1, 6, 4, 6);
    slab.closePath();
    softDot(ctx, 40, 30, 14, pal.bioA, 0.5);
    softDot(ctx, 152, 30, 14, pal.bioA, 0.5);
    fillOutlined(ctx, slab, linGrad(ctx, 0, 6, 0, 30, [[0, '#5d6aa6'], [0.5, '#2e3c5e'], [1, '#141a33']]), pal.outline, 2.6);
    rimLight(ctx, slab, 'rgba(160,190,255,0.5)', 1.6, 1.2, 1.4);
    // Runes
    glow(ctx, pal.bioA, 6, () => {
      ctx.strokeStyle = pal.bioA;
      ctx.lineWidth = 1.6;
      for (const x of [40, 96, 152]) {
        ctx.beginPath();
        ctx.moveTo(x - 8, 18);
        ctx.lineTo(x - 3, 14);
        ctx.lineTo(x + 3, 22);
        ctx.lineTo(x + 8, 16);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, 18, 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // Mousse sur le dessus
    const moss = new Path2D();
    moss.moveTo(2, 9);
    for (let x = 2; x <= 190; x += 4) moss.lineTo(x, 3 + Math.sin(x * 0.35) * 1.1);
    moss.lineTo(190, 9);
    for (let x = 190; x >= 2; x -= 6) moss.lineTo(x, 10 + Math.sin(x * 0.21 + 1) * 1.6 + (x % 36 < 6 ? 3 : 0));
    moss.closePath();
    glow(ctx, pal.surfaceGlow, 6, () => {
      ctx.fillStyle = linGrad(ctx, 0, 2, 0, 13, [[0, pal.surfaceLight], [0.4, pal.surface], [1, pal.surfaceDark]]);
      ctx.fill(moss);
    });
    // Racines pendantes
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.6;
    for (const [x, len] of [[30, 6], [118, 5], [168, 4]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, 27);
      ctx.quadraticCurveTo(x + 2, 27 + len * 0.6, x - 1, 27 + len);
      ctx.stroke();
    }
  } else {
    // Plateforme métallique en lévitation, feux orange
    const body = roundRect(2, 4, 188, 18, 7);
    softDot(ctx, 36, 28, 12, '#ff9a2e', 0.6);
    softDot(ctx, 156, 28, 12, '#ff9a2e', 0.6);
    for (const x of [36, 156]) {
      fillOutlined(ctx, roundRect(x - 10, 18, 20, 9, 3), '#2a2542', pal.outline, 2);
      glow(ctx, '#ff9a2e', 8, () => {
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(x - 6, 25, 12, 2);
      });
    }
    fillOutlined(ctx, body, linGrad(ctx, 0, 4, 0, 22, [[0, '#e6e0f6'], [0.25, '#a59cc6'], [0.7, '#5a5278'], [1, '#2e2946']]), pal.outline, 2.6);
    rimLight(ctx, body, 'rgba(255,255,255,0.65)', 1.4, 1, 1.2);
    // Bande d'avertissement
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = '#2a2542';
    ctx.fillRect(2, 13, 188, 5);
    for (let x = -4; x < 192; x += 12) {
      ctx.fillStyle = '#ff9a2e';
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x + 5, 13);
      ctx.lineTo(x + 9, 13);
      ctx.lineTo(x + 4, 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    for (const x of [12, 180]) glowDot(ctx, x, 9, 1.6, '#ff9a2e');
    for (const x of [60, 96, 132]) {
      ctx.fillStyle = 'rgba(30,24,50,0.6)';
      ctx.beginPath();
      ctx.arc(x, 8.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
