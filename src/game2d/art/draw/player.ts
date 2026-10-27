import { FRAME_SIZE } from '../keys';
import { type Ctx, circle, ellipse, fillOutlined, glow, glowDot, limb, linGrad, rimLight, roundRect, sphereGrad } from '../util';

// Kaï, l'astronaute : combinaison blanche, visière orange, sac à dos à lumières cyan, pistolet laser.
// Dessiné tourné vers la droite, pieds au bas de la frame (64x80).

const OUT = '#120c24';
const SUIT = '#f6f8ff';
const SUIT_MID = '#cdd4ee';
const SUIT_SHADE = '#8f98c2';
const SUIT_FAR = '#aeb6d8';
const CYAN = '#3ff0ff';
const BOOT = '#3b4166';
const BOOT_DARK = '#1f2340';
const GUN = '#535c86';
const GUN_DARK = '#272c47';

const W = FRAME_SIZE.player.w;
const H = FRAME_SIZE.player.h;

const HIP_X = 30;
const HIP_Y = 52;
const THIGH = 11;
const SHIN = 10;
const GROUND_ANKLE = H - 7.2;

interface Pose {
  /** Décalage vertical du corps (rebond). */
  by: number;
  bx: number;
  /** Inclinaison du buste (rad, positif = vers l'avant). */
  lean: number;
  /** Jambe proche : angle de cuisse (0 = vertical, + = avant) et flexion du genou. */
  aThigh: number;
  aKnee: number;
  /** Jambe lointaine. */
  bThigh: number;
  bKnee: number;
  /** Bras lointain : angle d'épaule et flexion du coude. */
  armB: number;
  elbowB: number;
  /** Main du bras armé (coordonnées frame) et angle du pistolet. */
  handX: number;
  handY: number;
  gunAngle: number;
  /** Intensité des lumières du sac (0..1). */
  lights: number;
  hurt?: boolean;
  /** Pose au sol : recale le corps pour que le pied le plus bas touche le sol. */
  ground?: number;
}

interface V {
  x: number;
  y: number;
}

function legPoints(hx: number, hy: number, thigh: number, knee: number): { knee: V; ankle: V; shinAng: number } {
  const kx = hx + Math.sin(thigh) * THIGH;
  const ky = hy + Math.cos(thigh) * THIGH;
  const s = thigh - knee;
  return { knee: { x: kx, y: ky }, ankle: { x: kx + Math.sin(s) * SHIN, y: ky + Math.cos(s) * SHIN }, shinAng: s };
}

function drawLeg(ctx: Ctx, hx: number, hy: number, thigh: number, knee: number, far: boolean): void {
  const p = legPoints(hx, hy, thigh, knee);
  const col = far ? SUIT_FAR : SUIT;
  const shadeCol = far ? SUIT_SHADE : SUIT_MID;
  // Botte (perpendiculaire au tibia, pointe vers l'avant)
  const dx = Math.sin(p.shinAng);
  const dy = Math.cos(p.shinAng);
  const fx = dy;
  const fy = -dx;
  const bx = p.ankle.x + dx * 1.6;
  const by = p.ankle.y + dy * 1.6;
  limb(ctx, hx, hy, p.knee.x, p.knee.y, 9, linGrad(ctx, hx - 5, 0, hx + 5, 0, [[0, shadeCol], [0.6, col], [1, col]]), OUT, 2.2);
  limb(ctx, p.knee.x, p.knee.y, p.ankle.x, p.ankle.y, 8.5, col, OUT, 2.2);
  // Genouillère
  ctx.fillStyle = far ? SUIT_SHADE : SUIT_MID;
  ctx.beginPath();
  ctx.arc(p.knee.x + 0.6, p.knee.y, 3, 0, Math.PI * 2);
  ctx.fill();
  // Botte
  limb(ctx, bx - fx * 2.2, by - fy * 2.2, bx + fx * 5.5, by + fy * 5.5, 6.5, far ? BOOT_DARK : BOOT, OUT, 2);
  // Semelle lumineuse
  ctx.strokeStyle = far ? 'rgba(63,240,255,0.45)' : CYAN;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(bx - fx * 2.5 + dx * 3, by - fy * 2.5 + dy * 3);
  ctx.lineTo(bx + fx * 5.5 + dx * 3, by + fy * 5.5 + dy * 3);
  ctx.stroke();
  // Bande de la botte
  ctx.strokeStyle = shadeCol;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(p.ankle.x - fx * 4 - dx * 1.5, p.ankle.y - fy * 4 - dy * 1.5);
  ctx.lineTo(p.ankle.x + fx * 4 - dx * 1.5, p.ankle.y + fy * 4 - dy * 1.5);
  ctx.stroke();
}

function rot(lean: number, x: number, y: number, ox: number, oy: number): V {
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return { x: ox + x * c - y * s, y: oy + x * s + y * c };
}

function drawPose(ctx: Ctx, pose: Pose): void {
  let by = pose.by;
  if (pose.ground !== undefined) {
    const a = legPoints(HIP_X, HIP_Y, pose.aThigh, pose.aKnee).ankle.y;
    const b = legPoints(HIP_X, HIP_Y, pose.bThigh, pose.bKnee).ankle.y;
    const low = Math.max(a, b);
    by += (GROUND_ANKLE - low) * pose.ground;
  }
  const hx = HIP_X + pose.bx;
  const hy = HIP_Y + by;
  const lean = pose.lean;
  const sh = rot(lean, -3, -17, hx, hy); // épaule lointaine
  const sn = rot(lean, 3, -17, hx, hy); // épaule proche
  const head = rot(lean, 3, -31, hx, hy);

  // --- Bras lointain (derrière le corps)
  {
    const ex = sh.x + Math.sin(pose.armB) * 8.5;
    const ey = sh.y + Math.cos(pose.armB) * 8.5;
    const fa = pose.armB + pose.elbowB;
    const wx = ex + Math.sin(fa) * 8;
    const wy = ey + Math.cos(fa) * 8;
    limb(ctx, sh.x, sh.y, ex, ey, 7, SUIT_FAR, OUT, 2.2);
    limb(ctx, ex, ey, wx, wy, 6.5, SUIT_FAR, OUT, 2.2);
    fillOutlined(ctx, circle(wx, wy, 3.4), SUIT_SHADE, OUT, 2);
  }

  // --- Jambe lointaine
  drawLeg(ctx, hx - 2.5, hy, pose.bThigh, pose.bKnee, true);

  // --- Sac à dos
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean);
  {
    // Antenne
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -24);
    ctx.lineTo(-17, -32);
    ctx.stroke();
    ctx.strokeStyle = SUIT_SHADE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    glow(ctx, CYAN, 6 * pose.lights + 2, () => {
      ctx.fillStyle = pose.lights > 0.5 ? '#c9fdff' : '#7fe9f5';
      ctx.beginPath();
      ctx.arc(-17.2, -32.5, 1.9, 0, Math.PI * 2);
      ctx.fill();
    });
    const pack = roundRect(-21, -24, 12, 23, 4);
    fillOutlined(ctx, pack, linGrad(ctx, -21, 0, -9, 0, [[0, SUIT_SHADE], [0.5, SUIT_MID], [1, SUIT]]), OUT, 2.4);
    rimLight(ctx, pack, 'rgba(255,255,255,0.8)', 1.4, 1.2, 1.2);
    // Lumières cyan
    const la = 0.35 + 0.65 * pose.lights;
    ctx.globalAlpha = la;
    glowDot(ctx, -15, -18, 1.8, CYAN);
    glowDot(ctx, -15, -11.5, 1.8, CYAN);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(63,240,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-18.5, -6);
    ctx.lineTo(-11.5, -6);
    ctx.stroke();
  }
  ctx.restore();

  // --- Jambe proche
  drawLeg(ctx, hx + 1.5, hy, pose.aThigh, pose.aKnee, false);

  // --- Torse
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean);
  {
    const torso = roundRect(-10, -22, 21, 25, 8);
    fillOutlined(ctx, torso, linGrad(ctx, -10, 0, 11, 0, [[0, SUIT_SHADE], [0.35, SUIT_MID], [0.7, SUIT], [1, SUIT]]), OUT, 2.5);
    rimLight(ctx, torso, 'rgba(255,255,255,0.95)', 1.6, -1.3, 1.4);
    // Plastron
    const plate = roundRect(-1, -17, 9, 9, 3);
    fillOutlined(ctx, plate, '#dfe5fa', 'rgba(18,12,36,0.55)', 1.2);
    glowDot(ctx, 3.5, -12.5, 1.6, pose.hurt ? '#ff4f6a' : CYAN);
    // Ceinture
    ctx.fillStyle = BOOT;
    ctx.fillRect(-9.5, -3.5, 20, 4);
    ctx.fillStyle = CYAN;
    ctx.fillRect(4, -2.8, 3.5, 2.6);
    // Bande orange d'épaule
    ctx.strokeStyle = '#ff9a2e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-7, -19.5);
    ctx.lineTo(-7, -6);
    ctx.stroke();
  }
  ctx.restore();

  // --- Casque
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(lean * 0.6);
  {
    // Col
    fillOutlined(ctx, ellipse(-1, 11, 9, 4), BOOT, OUT, 2);
    const shell = circle(0, 0, 13);
    fillOutlined(ctx, shell, sphereGrad(ctx, 0, 0, 13, '#ffffff', SUIT, SUIT_SHADE), OUT, 2.6);
    rimLight(ctx, shell, 'rgba(120,230,255,0.55)', 1.5, -1.6, -1.2);
    // Visière
    const visor = new Path2D();
    visor.moveTo(-2, -8.5);
    visor.bezierCurveTo(6, -10.5, 12.5, -6, 12.2, 1);
    visor.bezierCurveTo(12, 7, 6.5, 9.2, 0.5, 8.4);
    visor.bezierCurveTo(-3.5, 7.6, -4.6, 3.5, -4.3, -1.5);
    visor.bezierCurveTo(-4, -5.5, -3.4, -7.6, -2, -8.5);
    visor.closePath();
    const vg = linGrad(ctx, 0, -9, 0, 9, pose.hurt
      ? [[0, '#ffffff'], [0.35, '#ff9aa8'], [1, '#c4123a']]
      : [[0, '#ffe7a0'], [0.4, '#ffa21f'], [1, '#c43c00']]);
    glow(ctx, pose.hurt ? '#ff3a5a' : '#ff8a1a', 9, () => {
      ctx.fillStyle = vg;
      ctx.fill(visor);
    });
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.6;
    ctx.stroke(visor);
    // Reflets
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(3.5, 0.5, 6.2, -2.3, -1.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(9.2, -3.4, 1.1, 0, Math.PI * 2);
    ctx.fill();
    if (pose.hurt) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2.5, -3);
      ctx.lineTo(6, 0);
      ctx.moveTo(6, -3);
      ctx.lineTo(2.5, 0);
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- Bras armé (devant)
  {
    const L1 = 8.5;
    const L2 = 8.5;
    let tx = pose.handX + pose.bx;
    let ty = pose.handY + by;
    let d = Math.hypot(tx - sn.x, ty - sn.y);
    if (d > L1 + L2 - 0.5) {
      const k = (L1 + L2 - 0.5) / d;
      tx = sn.x + (tx - sn.x) * k;
      ty = sn.y + (ty - sn.y) * k;
      d = L1 + L2 - 0.5;
    }
    const base = Math.atan2(ty - sn.y, tx - sn.x);
    const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const ex = sn.x + Math.cos(base + a) * L1;
    const ey = sn.y + Math.sin(base + a) * L1;
    // Pistolet
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(pose.gunAngle);
    {
      const grip = roundRect(-2.5, -1, 5, 8, 2);
      ctx.save();
      ctx.rotate(0.25);
      fillOutlined(ctx, grip, GUN_DARK, OUT, 2);
      ctx.restore();
      const body = roundRect(-4, -6, 16, 7.5, 3);
      fillOutlined(ctx, body, linGrad(ctx, 0, -6, 0, 1.5, [[0, '#8892c0'], [0.5, GUN], [1, GUN_DARK]]), OUT, 2.2);
      const barrel = roundRect(10, -4.8, 7, 4.6, 1.8);
      fillOutlined(ctx, barrel, linGrad(ctx, 0, -4.8, 0, 0, [[0, '#cfd6f2'], [1, '#7c86b0']]), OUT, 2);
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-1.5, -3.2);
      ctx.lineTo(8.5, -3.2);
      ctx.stroke();
      glowDot(ctx, 17.4, -2.5, 1.7, CYAN);
    }
    ctx.restore();
    limb(ctx, sn.x, sn.y, ex, ey, 7, linGrad(ctx, sn.x - 4, sn.y, sn.x + 4, sn.y, [[0, SUIT_MID], [1, SUIT]]), OUT, 2.2);
    limb(ctx, ex, ey, tx, ty, 6.5, SUIT, OUT, 2.2);
    fillOutlined(ctx, circle(tx, ty, 3.6), SUIT_MID, OUT, 2);
    // Brassard cyan
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mx = (ex + tx) / 2;
    const my = (ey + ty) / 2;
    const nx = -(ty - ey) / Math.max(1, Math.hypot(tx - ex, ty - ey));
    const ny = (tx - ex) / Math.max(1, Math.hypot(tx - ex, ty - ey));
    ctx.moveTo(mx - nx * 3, my - ny * 3);
    ctx.lineTo(mx + nx * 3, my + ny * 3);
    ctx.stroke();
  }
}

function idlePose(i: number): Pose {
  return {
    by: i === 1 ? 0.8 : 0,
    bx: 0,
    lean: 0.02,
    aThigh: 0.16,
    aKnee: 0.12,
    bThigh: -0.14,
    bKnee: 0.08,
    armB: -0.15,
    elbowB: 0.5,
    handX: 42,
    handY: i === 1 ? 45.5 : 45,
    gunAngle: 0.08,
    lights: i === 1 ? 0.3 : 1,
    ground: 1,
  };
}

function runPose(i: number): Pose {
  const p = (i / 6) * Math.PI * 2;
  const sa = Math.sin(p);
  const ca = Math.cos(p);
  const kneeFor = (c: number) => 0.3 + 1.35 * Math.pow(Math.max(0, c), 1.4);
  return {
    by: -1.6 * Math.abs(Math.sin(p * 1 + 0.5)) + 0.5,
    bx: 0,
    lean: 0.16,
    aThigh: 0.8 * sa,
    aKnee: kneeFor(ca),
    bThigh: -0.8 * sa,
    bKnee: kneeFor(-ca),
    armB: 0.95 * sa,
    elbowB: 1.35,
    handX: 44 - 1.6 * sa,
    handY: 44.5 + 0.8 * ca,
    gunAngle: 0.04,
    lights: i % 2 === 0 ? 1 : 0.55,
    ground: 0.8,
  };
}

const POSES: Pose[] = [
  idlePose(0),
  idlePose(1),
  runPose(0),
  runPose(1),
  runPose(2),
  runPose(3),
  runPose(4),
  runPose(5),
  // Saut : genou proche replié, jambe lointaine tendue vers le bas
  {
    by: -2,
    bx: 0,
    lean: 0.1,
    aThigh: 1.05,
    aKnee: 1.6,
    bThigh: -0.25,
    bKnee: 0.55,
    armB: -2.3,
    elbowB: -0.5,
    handX: 44,
    handY: 41,
    gunAngle: -0.12,
    lights: 1,
  },
  // Chute : jambes écartées, bras levé
  {
    by: 0,
    bx: 0,
    lean: -0.02,
    aThigh: 0.42,
    aKnee: 0.35,
    bThigh: -0.32,
    bKnee: 0.55,
    armB: -2.75,
    elbowB: 0.4,
    handX: 43,
    handY: 42,
    gunAngle: 0.1,
    lights: 0.7,
  },
  // Touché : rejeté en arrière
  {
    by: -1,
    bx: -2,
    lean: -0.38,
    aThigh: 0.75,
    aKnee: 0.9,
    bThigh: 0.2,
    bKnee: 1.1,
    armB: -2.1,
    elbowB: 0.6,
    handX: 41,
    handY: 33,
    gunAngle: -0.75,
    lights: 0.2,
    hurt: true,
  },
];

/** Étoiles d'impact autour du casque (frame « touché »). */
function hurtFx(ctx: Ctx): void {
  const pts: [number, number, number][] = [
    [50, 10, 4],
    [12, 14, 3],
    [54, 26, 2.6],
  ];
  for (const [x, y, r] of pts) {
    glow(ctx, '#ffffff', 5, () => {
      ctx.strokeStyle = '#fff6c0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
    });
  }
}

export function drawPlayerFrame(ctx: Ctx, index: number): void {
  const pose = POSES[index] ?? POSES[0];
  ctx.save();
  void W;
  drawPose(ctx, pose);
  if (pose.hurt) hurtFx(ctx);
  ctx.restore();
}

export const PLAYER_FRAME_COUNT = POSES.length;
