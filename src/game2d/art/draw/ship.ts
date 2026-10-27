import { type Ctx, ellipse, fillOutlined, glow, glowDot, limb, linGrad, poly, rimLight, roundRect, softDot } from '../util';

// La Comète : coque blanche effilée, ailes en delta, cockpit et bandes cyan, réacteur orange.
// Vue de profil (3/4 léger), nez vers la droite, posée sur ses jambes d'atterrissage (192x112).

const OUT = '#120c24';
const CYAN = '#3ff0ff';

/** Position de la tuyère dans la frame du vaisseau (point d'attache de la flamme). */
export const SHIP_NOZZLE = { x: 11, y: 58 } as const;

export function drawShip(ctx: Ctx): void {
  // Ombre au sol
  const sh = ctx.createRadialGradient(96, 109, 2, 96, 109, 80);
  sh.addColorStop(0, 'rgba(0,0,0,0.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(96, 109, 80, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Aile lointaine (au-dessus, derrière la coque)
  const farWing = poly([116, 44, 58, 20, 44, 21, 46, 46]);
  fillOutlined(ctx, farWing, linGrad(ctx, 40, 20, 110, 46, [[0, '#9aa2c8'], [1, '#c9d0ea']]), OUT, 2.6);
  ctx.strokeStyle = 'rgba(63,240,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(106, 42);
  ctx.lineTo(58, 23);
  ctx.stroke();

  // --- Dérive
  const fin = poly([30, 46, 16, 13, 30, 12, 70, 42]);
  fillOutlined(ctx, fin, linGrad(ctx, 16, 12, 60, 44, [[0, '#ffffff'], [1, '#c9d0ea']]), OUT, 2.6);
  ctx.save();
  ctx.clip(fin);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 20);
  ctx.lineTo(56, 44);
  ctx.stroke();
  ctx.restore();
  glowDot(ctx, 23, 14, 1.8, '#ff4a4a');

  // --- Jambes d'atterrissage
  const leg = (x0: number, y0: number, kx: number, ky: number, fx: number, fy: number) => {
    limb(ctx, x0, y0, kx, ky, 5, '#8e97bd', OUT, 2.2);
    limb(ctx, kx, ky, fx, fy, 4, '#c9d0ea', OUT, 2.2);
    fillOutlined(ctx, ellipse(kx, ky, 3, 3), '#3b4166', OUT, 1.6);
    fillOutlined(ctx, roundRect(fx - 10, fy - 2, 20, 6, 3), linGrad(ctx, 0, fy - 2, 0, fy + 4, [[0, '#6a7298'], [1, '#2a2e48']]), OUT, 2);
    ctx.fillStyle = '#ff9a2e';
    ctx.fillRect(fx - 6, fy - 0.5, 3, 1.6);
  };
  leg(66, 74, 58, 92, 54, 105);
  leg(132, 70, 140, 90, 142, 105);

  // --- Réacteur
  const pod = roundRect(9, 45, 22, 27, 6);
  fillOutlined(ctx, pod, linGrad(ctx, 0, 45, 0, 72, [[0, '#9aa2c8'], [0.5, '#5a6288'], [1, '#2a2e48']]), OUT, 2.4);
  softDot(ctx, SHIP_NOZZLE.x, SHIP_NOZZLE.y, 16, '#ff8a1a', 0.7);
  const noz = ellipse(SHIP_NOZZLE.x + 1, SHIP_NOZZLE.y, 5, 10);
  fillOutlined(ctx, noz, '#2a2e48', OUT, 2.2);
  glow(ctx, '#ff8a1a', 10, () => {
    ctx.fillStyle = linGrad(ctx, 0, SHIP_NOZZLE.y - 8, 0, SHIP_NOZZLE.y + 8, [[0, '#ffe27a'], [0.5, '#ff9a2e'], [1, '#c43c00']]);
    ctx.beginPath();
    ctx.ellipse(SHIP_NOZZLE.x, SHIP_NOZZLE.y, 3, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Fuselage
  const hull = new Path2D();
  hull.moveTo(24, 44);
  hull.bezierCurveTo(60, 34, 110, 30, 150, 40);
  hull.bezierCurveTo(172, 46, 186, 54, 191, 60);
  hull.bezierCurveTo(180, 66, 160, 73, 128, 74);
  hull.lineTo(40, 74);
  hull.quadraticCurveTo(24, 74, 22, 66);
  hull.quadraticCurveTo(20, 54, 24, 44);
  hull.closePath();
  const hg = linGrad(ctx, 0, 32, 0, 74, [[0, '#ffffff'], [0.38, '#f2f5ff'], [0.75, '#c9d0ea'], [1, '#8e97bd']]);
  fillOutlined(ctx, hull, hg, OUT, 3);
  rimLight(ctx, hull, 'rgba(63,240,255,0.55)', 2.2, 0, -2);
  ctx.save();
  ctx.clip(hull);
  // Bandes cyan
  glow(ctx, CYAN, 6, () => {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(18, 53);
    ctx.bezierCurveTo(80, 52, 140, 54, 192, 61);
    ctx.stroke();
  });
  ctx.strokeStyle = '#1aa8c8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(18, 60);
  ctx.bezierCurveTo(80, 59, 140, 61, 186, 65);
  ctx.stroke();
  // Lignes de panneaux
  ctx.strokeStyle = 'rgba(80,90,130,0.45)';
  ctx.lineWidth = 1;
  for (const x of [52, 84, 112]) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x - 2, 76);
    ctx.stroke();
  }
  // Pointe du nez
  ctx.fillStyle = '#3b4166';
  ctx.beginPath();
  ctx.moveTo(180, 40);
  ctx.lineTo(196, 40);
  ctx.lineTo(196, 80);
  ctx.lineTo(178, 80);
  ctx.quadraticCurveTo(186, 60, 180, 40);
  ctx.fill();
  ctx.restore();
  // Reflet supérieur
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 41);
  ctx.bezierCurveTo(70, 35, 100, 33, 120, 35);
  ctx.stroke();
  // Emblème comète
  glow(ctx, CYAN, 5, () => {
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(98, 65, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(63,240,255,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(95, 63.5);
    ctx.lineTo(84, 61);
    ctx.moveTo(95, 66.5);
    ctx.lineTo(86, 68);
    ctx.stroke();
  });
  // Hublots
  for (const x of [62, 72]) {
    fillOutlined(ctx, ellipse(x, 46, 2.6, 2.2), '#1a4a6a', OUT, 1.4);
    ctx.fillStyle = 'rgba(160,250,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - 0.7, 45.3, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Cockpit
  const canopy = new Path2D();
  canopy.moveTo(116, 38);
  canopy.bezierCurveTo(124, 22, 154, 22, 172, 46);
  canopy.quadraticCurveTo(146, 41, 116, 38);
  canopy.closePath();
  glow(ctx, 'rgba(63,240,255,0.9)', 10, () => {
    ctx.fillStyle = linGrad(ctx, 0, 24, 0, 46, [[0, '#d8feff'], [0.35, '#3fd8ff'], [1, '#0a4a7a']]);
    ctx.fill(canopy);
  });
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.6;
  ctx.stroke(canopy);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(126, 33);
  ctx.quadraticCurveTo(136, 26, 150, 28);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(18,12,36,0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(146, 26);
  ctx.lineTo(150, 42);
  ctx.stroke();

  // --- Aile proche (delta, sous la coque, vers l'observateur)
  const wing = poly([126, 64, 62, 92, 40, 93, 32, 66]);
  fillOutlined(ctx, wing, linGrad(ctx, 30, 64, 80, 94, [[0, '#ffffff'], [0.6, '#e6ebfa'], [1, '#aab2d6']]), OUT, 2.8);
  rimLight(ctx, wing, 'rgba(255,255,255,0.9)', 1.6, 1, 1.2);
  ctx.save();
  ctx.clip(wing);
  glow(ctx, CYAN, 5, () => {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(122, 67);
    ctx.lineTo(60, 90);
    ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(80,90,130,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 70);
  ctx.lineTo(54, 91);
  ctx.stroke();
  ctx.restore();
  glowDot(ctx, 44, 91, 1.8, '#ff9a2e');
  // Feu de nez
  glowDot(ctx, 186, 58, 1.3, '#ffffff');
}

/** Flamme du réacteur (48x32), vers la GAUCHE : le bord droit se colle à la tuyère. */
export function drawShipFlame(ctx: Ctx, frame: number): void {
  const cy = 16;
  const tip = frame === 0 ? 3 : 10;
  const wob = frame === 0 ? 1 : -1;
  const layer = (len: number, half: number, col: string, blur: number) => {
    const p = new Path2D();
    p.moveTo(48, cy - half);
    p.bezierCurveTo(48 - len * 0.35, cy - half - 1 + wob, 48 - len * 0.75, cy - half * 0.45 - wob, 48 - len, cy);
    p.bezierCurveTo(48 - len * 0.75, cy + half * 0.45 - wob, 48 - len * 0.35, cy + half + 1 + wob, 48, cy + half);
    p.closePath();
    if (blur > 0) {
      glow(ctx, col, blur, () => {
        ctx.fillStyle = col;
        ctx.fill(p);
      });
    } else {
      ctx.fillStyle = col;
      ctx.fill(p);
    }
  };
  layer(48 - tip, 10, 'rgba(255,80,20,0.65)', 8);
  layer(40 - tip * 0.8, 7.5, '#ff9a2e', 0);
  layer(28 - tip * 0.5, 5, '#ffe27a', 0);
  layer(14, 3, '#ffffff', 0);
  // Disques de choc
  for (const x of frame === 0 ? [26, 16] : [30, 20]) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x, cy, 1.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
