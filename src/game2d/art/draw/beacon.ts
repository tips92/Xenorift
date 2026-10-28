import { type Ctx, ellipse, fillOutlined, glow, glowDot, linGrad, poly, rgba, roundRect, softDot, sphereGrad } from '../util';

// Balise de LUMA (sortie des niveaux 1 et 2 d'un monde), même dessin dans tous les thèmes : socle et colonne
// blancs, chevrons cyan, deux branches qui tiennent l'œil de LUMA en lévitation. 64x160, posée au bas de la
// frame. Frames 0-1 : veille (lueur qui pulse) ; 2-3 : activée. Faisceau : colonne de lumière 64x128.

const OUT = '#0d0618';
const CYAN = '#3ff0ff';
const LIGHT = '#bffcff';
/** Centre de l'œil de LUMA dans la frame (repris par le moteur pour les effets). */
export const BEACON_ORB = { x: 32, y: 38 } as const;

export function drawBeacon(ctx: Ctx, frame: number): void {
  const on = frame >= 2;
  const k = frame % 2;
  const { x: ox, y: oy } = BEACON_ORB;

  // Ombre au sol
  const sh = ctx.createRadialGradient(32, 157, 1, 32, 157, 30);
  sh.addColorStop(0, 'rgba(0,0,0,0.4)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(32, 157, 30, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Halo de l'œil (derrière tout le reste)
  if (on) softDot(ctx, ox, oy, 30, CYAN, k === 0 ? 0.8 : 0.62);
  else softDot(ctx, ox, oy, 20, CYAN, k === 0 ? 0.28 : 0.45);

  // Socle
  const base = poly([6, 159, 58, 159, 52, 142, 12, 142]);
  fillOutlined(ctx, base, linGrad(ctx, 0, 142, 0, 159, [[0, '#c9cfe8'], [1, '#3a3f62']]), OUT, 2.2);
  fillOutlined(ctx, roundRect(10, 137, 44, 7, 3), linGrad(ctx, 0, 137, 0, 144, [[0, '#ffffff'], [1, '#9aa2c8']]), OUT, 2);
  const strip = roundRect(18, 149, 28, 3, 1.5);
  if (on) {
    glow(ctx, CYAN, 8, () => {
      ctx.fillStyle = LIGHT;
      ctx.fill(strip);
    });
  } else {
    ctx.fillStyle = k === 0 ? '#2a7a90' : '#3fb8d0';
    ctx.fill(strip);
  }

  // Colonne effilée, panneau sombre et chevrons ▲ (allumés tour à tour en veille, tous une fois activée)
  const column = poly([21, 139, 43, 139, 39, 64, 25, 64]);
  fillOutlined(
    ctx,
    column,
    linGrad(ctx, 21, 0, 43, 0, [[0, '#6a7298'], [0.35, '#ffffff'], [0.6, '#e6eaff'], [1, '#7a82a8']]),
    OUT,
    2.2,
  );
  fillOutlined(ctx, roundRect(29, 70, 6, 64, 3), '#1a1636', OUT, 0);
  for (let i = 0; i < 4; i++) {
    const y = 128 - i * 15;
    const chev = poly([29.5, y + 3, 32, y - 1.5, 34.5, y + 3, 32, y + 1]);
    if (on) {
      glow(ctx, CYAN, 6, () => {
        ctx.fillStyle = (i + k) % 2 === 0 ? '#ffffff' : LIGHT;
        ctx.fill(chev);
      });
    } else {
      ctx.fillStyle = (i + k) % 2 === 0 ? '#3fc8e0' : '#2a3050';
      ctx.fill(chev);
    }
  }
  fillOutlined(ctx, roundRect(22, 59, 20, 7, 3), linGrad(ctx, 0, 59, 0, 66, [[0, '#ffffff'], [1, '#8e97bd']]), OUT, 2);

  // Branches qui tiennent l'œil
  const arm = (x0: number, cx: number, x1: number): void => {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, 61);
    ctx.quadraticCurveTo(cx, 46, x1, 18);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#c9cfe8';
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = on ? LIGHT : rgba(CYAN, 0.45);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  };
  arm(26, 8, 20);
  arm(38, 56, 44);
  if (on) {
    glowDot(ctx, 20, 18, 2.4, '#ffffff');
    glowDot(ctx, 44, 18, 2.4, '#ffffff');
  } else {
    glowDot(ctx, 20, 18, 2, k === 0 ? '#2a9ab0' : CYAN);
    glowDot(ctx, 44, 18, 2, k === 0 ? '#2a9ab0' : CYAN);
  }

  // Anneaux autour de l'œil
  ctx.lineWidth = 1.2;
  if (on) {
    ctx.strokeStyle = rgba(LIGHT, 0.85);
    ctx.beginPath();
    ctx.ellipse(ox, oy, 15 + k * 3, 3.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(CYAN, 0.6 - k * 0.25);
    ctx.beginPath();
    ctx.ellipse(ox, oy + 14, 11 + k * 6, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = rgba(CYAN, k === 0 ? 0.3 : 0.5);
    ctx.beginPath();
    ctx.ellipse(ox, oy, 14, 3.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Œil de LUMA : sphère, iris annulaire, pupille, reflet
  const orb = ellipse(ox, oy, 9, 9);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.stroke(orb);
  glow(ctx, CYAN, on ? 14 : 6, () => {
    ctx.fillStyle = on
      ? sphereGrad(ctx, ox, oy, 9, '#ffffff', LIGHT, '#1ab8d8')
      : sphereGrad(ctx, ox, oy, 9, k === 0 ? '#bfefff' : '#e8ffff', k === 0 ? '#2ac8e0' : CYAN, '#0a5a7a');
    ctx.fill(orb);
  });
  ctx.strokeStyle = on ? 'rgba(255,255,255,0.95)' : 'rgba(230,255,255,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(ox, oy, 4.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = on ? '#ffffff' : '#0a3a5a';
  ctx.beginPath();
  ctx.arc(ox, oy, 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ox - 1, oy - 1, 6.4, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();

  // Activée : lumière qui monte de l'œil (départ du faisceau)
  if (on) {
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, oy - 8, [[0, rgba(LIGHT, 0)], [1, rgba(LIGHT, 0.55 - k * 0.15)]]);
    ctx.fillRect(ox - 3, 0, 6, oy - 8);
  }
}

/** Faisceau (64x128) : cœur blanc, bords cyan transparents, traits verticaux qui changent d'une frame à l'autre. */
export function drawBeaconBeam(ctx: Ctx, frame: number): void {
  const core = frame === 0 ? 0.88 : 0.74;
  ctx.fillStyle = linGrad(ctx, 0, 0, 64, 0, [
    [0, rgba(CYAN, 0)],
    [0.22, rgba(CYAN, 0.16)],
    [0.4, rgba(LIGHT, 0.5)],
    [0.5, `rgba(255,255,255,${core})`],
    [0.6, rgba(LIGHT, 0.5)],
    [0.78, rgba(CYAN, 0.16)],
    [1, rgba(CYAN, 0)],
  ]);
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 6; i++) {
    const x = 14 + ((i * 37 + frame * 11) % 36) + 0.5;
    const a = 0.22 + ((i * 5 + frame * 3) % 4) * 0.08;
    ctx.fillStyle = linGrad(ctx, 0, 0, 0, 128, [[0, rgba(LIGHT, a * 0.3)], [0.5, rgba(LIGHT, a)], [1, rgba(LIGHT, a * 0.3)]]);
    ctx.fillRect(x, 0, i % 3 === 0 ? 1.5 : 1, 128);
  }
}
