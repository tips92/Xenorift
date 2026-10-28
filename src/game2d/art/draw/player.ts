import { ARM_MUZZLE, ARM_RIG, type ARM_TEX, FRAMES, FRAME_SIZE } from '../keys';
import { type Ctx, circle, ellipse, fillOutlined, glow, glowDot, limb, linGrad, poly, rimLight, roundRect, sphereGrad } from '../util';

// Kaï, l'astronaute : combinaison blanche, visière orange, sac à dos à lumières cyan.
// Corps dessiné tourné vers la droite, pieds au bas de la frame (64x80), SANS le bras armé : le bras et l'arme
// forment un sprite à part (64x32, voir ARM_RIG) qui pivote à l'épaule selon la visée.

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
  /** Intensité des lumières du sac (0..1). */
  lights: number;
  hurt?: boolean;
  /** Pose au sol : recale le corps pour que le pied le plus bas touche le sol. */
  ground?: number;
  /** Jambe proche dessinée devant le torse (accroupi : genou relevé). */
  legFront?: boolean;
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

/** Hanches de la pose (frame), recalées au sol si besoin. */
function hipOf(pose: Pose): V {
  let by = pose.by;
  if (pose.ground !== undefined) {
    const a = legPoints(HIP_X, HIP_Y, pose.aThigh, pose.aKnee).ankle.y;
    const b = legPoints(HIP_X, HIP_Y, pose.bThigh, pose.bKnee).ankle.y;
    const low = Math.max(a, b);
    by += (GROUND_ANKLE - low) * pose.ground;
  }
  return { x: HIP_X + pose.bx, y: HIP_Y + by };
}

/** Épaule proche (frame) : point d'accroche du bras armé. */
function nearShoulder(pose: Pose): V {
  const hip = hipOf(pose);
  return rot(pose.lean, 3, -17, hip.x, hip.y);
}

function drawPose(ctx: Ctx, pose: Pose): void {
  const hip = hipOf(pose);
  const hx = hip.x;
  const hy = hip.y;
  const lean = pose.lean;
  const sh = rot(lean, -3, -17, hx, hy); // épaule lointaine
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

  // --- Jambe proche (derrière le torse, sauf genou relevé)
  if (!pose.legFront) drawLeg(ctx, hx + 1.5, hy, pose.aThigh, pose.aKnee, false);

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

  if (pose.legFront) drawLeg(ctx, hx + 1.5, hy, pose.aThigh, pose.aKnee, false);

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
    lights: i === 1 ? 0.3 : 1,
    ground: 1,
  };
}

function runPose(i: number): Pose {
  const p = (i / 6) * Math.PI * 2;
  const sa = Math.sin(p);
  const ca = Math.cos(p);
  const kneeFor = (c: number) => 0.3 + 1.35 * Math.pow(Math.max(0, c), 1.4);
  // Corps décalé de (-1,5 ; -1) : l'épaule reste à ±2 px de ARM_RIG malgré l'inclinaison et le rebond.
  return {
    by: -1.6 * Math.abs(Math.sin(p * 1 + 0.5)) - 0.5,
    bx: -1.5,
    lean: 0.16,
    aThigh: 0.8 * sa,
    aKnee: kneeFor(ca),
    bThigh: -0.8 * sa,
    bKnee: kneeFor(-ca),
    armB: 0.95 * sa,
    elbowB: 1.35,
    lights: i % 2 === 0 ? 1 : 0.55,
    ground: 0.8,
  };
}

/** Accroupi : hanches basses, genou proche relevé devant le torse, épaule proche sur ARM_RIG.crouchShoulder*. */
function crouchPose(shot: boolean): Pose {
  return {
    by: 17,
    bx: shot ? -4.6 : -3.6, // recul d'1 px au tir
    lean: shot ? 0.3 : 0.35,
    aThigh: 2.14,
    aKnee: 2.39,
    bThigh: 1.95,
    bKnee: 2.61,
    // Main lointaine portée vers l'avant, comme pour soutenir l'arme.
    armB: shot ? 0.8 : 0.75,
    elbowB: shot ? 0.9 : 1,
    lights: shot ? 1 : 0.6,
    legFront: true,
  };
}

/**
 * Reptation (2 frames) : la posture accroupie, jambes qui alternent, chevilles au ras du sol. Frame 0 : pied
 * proche en avant, pied lointain en arrière, hanches plus basses ; frame 1 : l'inverse, hanches plus hautes.
 * Épaule proche à ±1 px de ARM_RIG.crouchShoulder*.
 */
function crawlPose(i: number): Pose {
  const base = crouchPose(false);
  return i === 0
    ? { ...base, by: 17.8, aThigh: 2.2, aKnee: 1.874, bThigh: 1.7, bKnee: 2.813, armB: 0.7, lights: 1 }
    : { ...base, by: 16.6, aThigh: 1.9, aKnee: 2.583, bThigh: 2.05, bKnee: 1.666, armB: 0.8, lights: 0.55 };
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
    lights: 0.7,
  },
  // Touché : rejeté en arrière (hanches avancées pour garder l'épaule proche sur ARM_RIG)
  {
    by: -1,
    bx: 4,
    lean: -0.3,
    aThigh: 0.75,
    aKnee: 0.9,
    bThigh: 0.2,
    bKnee: 1.1,
    armB: -2.1,
    elbowB: 0.6,
    lights: 0.2,
    hurt: true,
  },
  crouchPose(false),
  crouchPose(true),
  crawlPose(0),
  crawlPose(1),
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
  drawPose(ctx, pose);
  if (pose.hurt) hurtFx(ctx);
  ctx.restore();
}

export const PLAYER_FRAME_COUNT = POSES.length;

/**
 * Épaule proche de chaque frame du corps, par rapport au centre des pieds (tourné vers la droite, y < 0 vers
 * le haut) : [x0, y0, x1, y1…]. Le bras armé s'y accroche pour suivre le rebond des poses ; le tir, lui, part
 * de ARM_RIG (à ±2 px près).
 */
export const PLAYER_SHOULDER: readonly number[] = POSES.flatMap((pose) => {
  const s = nearShoulder(pose);
  return [Math.round((s.x - W / 2) * 2) / 2, Math.round((s.y - H) * 2) / 2];
});

// ---------------------------------------------------------------- Bras armé (64x32, une texture par arme)

/** Arme portée par le bras (clé de ARM_TEX). */
export type ArmWeapon = keyof typeof ARM_TEX;

/** Main dans la frame du bras (épaule = ARM_RIG.pivot) ; l'arme y est tenue canon vers +x. */
const HAND_X = 19.6;
const HAND_Y = 21.5;
const UPPER_ARM = 8.5;
const FOREARM = 8.5;
/** Recul de la main (px) sur la frame FRAMES.arm.recoil. */
const RECOIL_PX = 2.2;

/**
 * Armes dessinées dans la main (origine = main, canon vers +x, axe du canon en y = -2,5). La bouche du canon
 * doit tomber sur ARM_MUZZLE[arme] - (HAND_X, HAND_Y). Silhouettes et couleurs distinctes (lisibles en petit) :
 * laser court cyan-blanc, mitrailleur compact à chargeur et canon cyan, pompe à gros canon ambre et crosse,
 * fusil d'assaut long, blanc-violet, à lunette. Crosses dessinées sous le bras (dessiné par-dessus).
 */
const GUNS: Record<ArmWeapon, (ctx: Ctx) => void> = {
  laser: drawLaserGun,
  machinegun: drawMachinegun,
  shotgun: drawShotgun,
  rifle: drawRifle,
};

const AMBER = '#ffb347';
const VIOLET = '#b066ff';

/** Dégradé du métal de la carcasse (comme le laser). */
function metalGrad(ctx: Ctx, y0: number, y1: number): CanvasGradient {
  return linGrad(ctx, 0, y0, 0, y1, [[0, '#8892c0'], [0.5, GUN], [1, GUN_DARK]]);
}

/** Poignée inclinée sous la main (comme le laser). */
function gunGrip(ctx: Ctx): void {
  ctx.save();
  ctx.rotate(0.25);
  fillOutlined(ctx, roundRect(-2.5, -1, 5, 8, 2), GUN_DARK, OUT, 2);
  ctx.restore();
}

/**
 * Crosse (pompe, fusil) : de l'arrière de la carcasse vers le bas, la plaque de couche dépasse sous le coude
 * (le bras, dessiné par-dessus, cache le reste).
 */
function stockPath(): Path2D {
  const p = new Path2D();
  p.moveTo(-3, -6);
  p.lineTo(-10.5, -2.5);
  p.lineTo(-13.6, 2);
  p.quadraticCurveTo(-14.2, 5, -13, 7.6);
  p.lineTo(-9.4, 7.6);
  p.lineTo(-3, 1);
  p.closePath();
  return p;
}

/** Trait lumineux le long d'une pièce. */
function glowLine(ctx: Ctx, color: string, lw: number, x0: number, y0: number, x1: number, y1: number): void {
  glow(ctx, color, 3, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  });
}

/** Mitrailleur : compact, chargeur incliné devant la poignée, manchon à évents et canon court cyan. */
function drawMachinegun(ctx: Ctx): void {
  // Chargeur
  const mag = new Path2D();
  mag.moveTo(5, 0);
  mag.lineTo(10.5, 0);
  mag.quadraticCurveTo(11, 4.5, 12.4, 7.8);
  mag.lineTo(7.8, 8.4);
  mag.quadraticCurveTo(6.4, 4.5, 5, 0);
  mag.closePath();
  fillOutlined(ctx, mag, linGrad(ctx, 5, 0, 12, 0, [[0, GUN_DARK], [0.55, GUN], [1, GUN_DARK]]), OUT, 2);
  glowLine(ctx, CYAN, 1.3, 7.7, 2, 9.5, 6.4); // cellule d'énergie
  gunGrip(ctx);
  // Carcasse
  fillOutlined(ctx, roundRect(-6, -6.5, 19.5, 7.5, 2.5), metalGrad(ctx, -6.5, 1), OUT, 2.2);
  // Viseur à point cyan
  fillOutlined(ctx, roundRect(0.5, -9, 5, 2.8, 1), GUN_DARK, OUT, 1.6);
  ctx.fillStyle = CYAN;
  ctx.fillRect(3.6, -8.2, 1.4, 1.2);
  glowLine(ctx, CYAN, 1.3, -4, -3.4, 10.5, -3.4);
  // Manchon cyan à évents
  const shroud = roundRect(12, -5.8, 8.4, 6.6, 2);
  fillOutlined(ctx, shroud, linGrad(ctx, 0, -5.8, 0, 0.8, [[0, '#c9fdff'], [0.45, '#3fd8f0'], [1, '#0f5a78']]), OUT, 2);
  ctx.strokeStyle = '#0b3550';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const x of [14.4, 16.6, 18.8]) {
    ctx.moveTo(x, -4.4);
    ctx.lineTo(x, -0.8);
  }
  ctx.stroke();
  rimLight(ctx, shroud, 'rgba(255,255,255,0.75)', 1.1, 0, 1.1);
  // Canon court
  fillOutlined(ctx, roundRect(19.8, -4, 4.4, 3, 1), linGrad(ctx, 0, -4, 0, -1, [[0, '#e6fdff'], [1, '#4fc8e0']]), OUT, 1.8);
  // Bouche du canon : (24.4, -2.5) depuis la main = ARM_MUZZLE.machinegun.
  glowDot(ctx, 24.4, -2.5, 1.5, CYAN);
}

/** Pompe : gros canon ambre à bague de bouche, pompe rainurée dessous, crosse vers l'épaule. */
function drawShotgun(ctx: Ctx): void {
  // Crosse : la plaque de couche dépasse sous le coude
  fillOutlined(ctx, stockPath(), linGrad(ctx, 0, -6, 0, 7.6, [[0, '#6e5c80'], [1, '#2a2036']]), OUT, 2);
  glowLine(ctx, AMBER, 1.3, -13.1, 2.8, -12.5, 6.6);
  gunGrip(ctx);
  // Pompe rainurée
  fillOutlined(ctx, roundRect(11, 0, 10.5, 4.4, 1.8), linGrad(ctx, 0, 0, 0, 4.4, [[0, '#6a6290'], [1, GUN_DARK]]), OUT, 2);
  ctx.strokeStyle = '#17122a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of [13.6, 16.2, 18.8]) {
    ctx.moveTo(x, 1.2);
    ctx.lineTo(x, 3.6);
  }
  ctx.stroke();
  // Carcasse et témoins de cartouches
  fillOutlined(ctx, roundRect(-4, -7, 14.5, 8.5, 2.5), metalGrad(ctx, -7, 1.5), OUT, 2.2);
  glow(ctx, AMBER, 4, () => {
    ctx.fillStyle = AMBER;
    for (const x of [-1.6, 1.6, 4.8]) ctx.fillRect(x, -3.4, 2, 2.6);
  });
  // Canon épais ambre
  const barrel = roundRect(8.5, -5.9, 17, 6.8, 2.6);
  fillOutlined(ctx, barrel, linGrad(ctx, 0, -5.9, 0, 0.9, [[0, '#ffe7b8'], [0.38, AMBER], [1, '#94440f']]), OUT, 2.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(11, -4.5);
  ctx.lineTo(22.5, -4.5);
  ctx.stroke();
  // Bague de bouche
  fillOutlined(ctx, roundRect(24.6, -6.7, 3.4, 8.4, 1.4), linGrad(ctx, 0, -6.7, 0, 1.7, [[0, '#ffd27a'], [1, '#6e320c']]), OUT, 2);
  // Bouche du canon : (28.4, -2.5) depuis la main = ARM_MUZZLE.shotgun.
  glowDot(ctx, 28.4, -2.5, 1.8, AMBER);
}

/** Fusil d'assaut : long, blanc-violet, lunette basse, garde-main à fentes violettes, crosse claire. */
function drawRifle(ctx: Ctx): void {
  // Crosse claire, plaque de couche violette sous le coude
  fillOutlined(ctx, stockPath(), linGrad(ctx, 0, -6, 0, 7.6, [[0, '#f2ecff'], [1, '#8a76c0']]), OUT, 2);
  glowLine(ctx, VIOLET, 1.3, -13.1, 2.8, -12.5, 6.6);
  gunGrip(ctx);
  // Chargeur droit
  fillOutlined(ctx, poly([6.5, 0.5, 10.5, 0.5, 11.2, 7.4, 7.2, 7.4]), linGrad(ctx, 6, 0, 11, 0, [[0, GUN_DARK], [0.55, GUN], [1, GUN_DARK]]), OUT, 2);
  glowLine(ctx, VIOLET, 1.2, 8.4, 2.2, 8.9, 5.8);
  // Carcasse blanc-violet
  const body = roundRect(-4, -6.5, 20, 8, 2.5);
  fillOutlined(ctx, body, linGrad(ctx, 0, -6.5, 0, 1.5, [[0, '#ffffff'], [0.45, '#d9ccf5'], [1, '#7c66b0']]), OUT, 2.2);
  glowLine(ctx, VIOLET, 1.3, -2, -3.3, 13.5, -3.3);
  // Garde-main à fentes
  fillOutlined(ctx, roundRect(15, -5.3, 10, 5.6, 2), linGrad(ctx, 0, -5.3, 0, 0.3, [[0, '#ebe2ff'], [1, '#6a54a2']]), OUT, 2);
  glow(ctx, VIOLET, 3, () => {
    ctx.strokeStyle = '#d6a8ff';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const x of [17.6, 20, 22.4]) {
      ctx.moveTo(x, -4);
      ctx.lineTo(x, -1.4);
    }
    ctx.stroke();
  });
  // Canon long et frein de bouche
  fillOutlined(ctx, roundRect(24, -3.8, 8, 2.6, 1), linGrad(ctx, 0, -3.8, 0, -1.2, [[0, '#ffffff'], [1, '#a294cc']]), OUT, 1.8);
  fillOutlined(ctx, roundRect(30.4, -4.6, 3.6, 4.2, 1.2), linGrad(ctx, 0, -4.6, 0, -0.4, [[0, '#f3e9ff'], [1, '#7f62c0']]), OUT, 1.8);
  // Lunette basse (en visée haute, elle ne mord que le bord avant de la visière)
  fillOutlined(ctx, roundRect(3, -7.6, 1.8, 1.4, 0.4), GUN_DARK, OUT, 1.2);
  fillOutlined(ctx, roundRect(10, -7.6, 1.8, 1.4, 0.4), GUN_DARK, OUT, 1.2);
  const scope = roundRect(1, -10.2, 13, 3.2, 1.6);
  fillOutlined(ctx, scope, linGrad(ctx, 0, -10.2, 0, -7, [[0, '#8070b0'], [0.5, '#3a3060'], [1, '#1e1838']]), OUT, 1.8);
  glow(ctx, VIOLET, 4, () => {
    ctx.fillStyle = '#ead6ff';
    ctx.fill(ellipse(13.6, -8.6, 0.9, 1.4));
  });
  // Bouche du canon : (34.4, -2.5) depuis la main = ARM_MUZZLE.rifle.
  glowDot(ctx, 34.4, -2.5, 1.6, VIOLET);
}

function drawLaserGun(ctx: Ctx): void {
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
  // Bouche du canon : (17.4, -2.5) depuis la main = ARM_MUZZLE.laser.
  glowDot(ctx, 17.4, -2.5, 1.7, CYAN);
}

interface FlashStyle {
  glow: string;
  halo: string;
  spark: string;
  /** Demi-hauteurs du halo et du cœur blanc (px). */
  ry: number;
  coreRy: number;
  /** Gerbe : deux langues de plus en éventail (pompe). */
  fan: boolean;
}

/** Éclair de bouche de chaque arme, à sa couleur (laser : inchangé). */
const FLASH: Record<ArmWeapon, FlashStyle> = {
  laser: { glow: CYAN, halo: 'rgba(160,250,255,0.85)', spark: 'rgba(220,255,255,0.9)', ry: 2.8, coreRy: 1.5, fan: false },
  machinegun: { glow: CYAN, halo: 'rgba(110,240,255,0.85)', spark: 'rgba(200,255,255,0.9)', ry: 2.4, coreRy: 1.3, fan: false },
  shotgun: { glow: '#ff9a2e', halo: 'rgba(255,196,110,0.9)', spark: 'rgba(255,236,190,0.95)', ry: 4.2, coreRy: 2.2, fan: true },
  rifle: { glow: VIOLET, halo: 'rgba(222,196,255,0.9)', spark: 'rgba(245,235,255,0.95)', ry: 2.2, coreRy: 1.2, fan: false },
};

/** Éclair de bouche (frame de recul), centré un peu devant le canon (x + 11 au plus : tient dans la frame). */
function muzzleFlash(ctx: Ctx, x: number, y: number, st: FlashStyle): void {
  glow(ctx, st.glow, 8, () => {
    ctx.fillStyle = st.halo;
    ctx.fill(ellipse(x + 4.5, y, 6.5, st.ry));
  });
  ctx.fillStyle = '#ffffff';
  ctx.fill(ellipse(x + 3, y, 3.6, st.coreRy));
  ctx.strokeStyle = st.spark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 4.5);
  ctx.lineTo(x + 4, y - 1.5);
  ctx.moveTo(x + 2, y + 4.5);
  ctx.lineTo(x + 4, y + 1.5);
  if (st.fan) {
    ctx.moveTo(x + 6, y - 2.6);
    ctx.lineTo(x + 10, y - 5.6);
    ctx.moveTo(x + 6, y + 2.6);
    ctx.lineTo(x + 10, y + 5.6);
  }
  ctx.stroke();
}

/**
 * Bras armé tourné vers la droite, arme à l'horizontale : épaule au pivot ARM_RIG, coude vers le bas, main
 * vers (HAND_X, HAND_Y). Frame FRAMES.arm.rest au repos, FRAMES.arm.recoil = main reculée + éclair.
 */
export function drawArmFrame(ctx: Ctx, weapon: ArmWeapon, index: number): void {
  const recoil = index === FRAMES.arm.recoil;
  const sx = ARM_RIG.pivotX;
  const sy = ARM_RIG.pivotY;
  const tx = HAND_X - (recoil ? RECOIL_PX : 0);
  const ty = HAND_Y - (recoil ? 0.4 : 0);
  // Coude (deux segments, pli vers le bas)
  const d = Math.min(Math.hypot(tx - sx, ty - sy), UPPER_ARM + FOREARM - 0.5);
  const base = Math.atan2(ty - sy, tx - sx);
  const a = Math.acos(Math.min(1, Math.max(-1, (UPPER_ARM * UPPER_ARM + d * d - FOREARM * FOREARM) / (2 * UPPER_ARM * d))));
  const ex = sx + Math.cos(base + a) * UPPER_ARM;
  const ey = sy + Math.sin(base + a) * UPPER_ARM;

  ctx.save();
  // Arme (derrière la main)
  ctx.save();
  ctx.translate(tx, ty);
  GUNS[weapon](ctx);
  ctx.restore();
  // Épaulière : couvre l'articulation quel que soit l'angle de visée.
  fillOutlined(ctx, circle(sx, sy, 4.6), sphereGrad(ctx, sx, sy, 4.6, '#ffffff', SUIT, SUIT_SHADE), OUT, 2.2);
  limb(ctx, sx, sy, ex, ey, 7, linGrad(ctx, sx - 4, sy, sx + 4, sy, [[0, SUIT_MID], [1, SUIT]]), OUT, 2.2);
  limb(ctx, ex, ey, tx, ty, 6.5, SUIT, OUT, 2.2);
  fillOutlined(ctx, circle(tx, ty, 3.6), SUIT_MID, OUT, 2);
  // Brassard cyan
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const len = Math.max(1, Math.hypot(tx - ex, ty - ey));
  const mx = (ex + tx) / 2;
  const my = (ey + ty) / 2;
  const nx = -(ty - ey) / len;
  const ny = (tx - ex) / len;
  ctx.moveTo(mx - nx * 3, my - ny * 3);
  ctx.lineTo(mx + nx * 3, my + ny * 3);
  ctx.stroke();
  if (recoil) {
    const m = ARM_MUZZLE[weapon];
    muzzleFlash(ctx, m.x - RECOIL_PX, m.y - 0.4, FLASH[weapon]);
  }
  ctx.restore();
}

/** Nombre de frames d'une planche de bras armé (repos, recul). */
export const ARM_FRAME_COUNT = 2;
