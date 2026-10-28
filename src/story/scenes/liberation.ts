import { type Ctx, linGrad, rgba } from '../../game2d/art/util';
import { GROUND_Y, jungleFar, jungleMid, jungleNear, jungleSky } from '../art/jungle';
import { coreSprite, drawTentacles, tentacleSprite, WHALE_HEART, WHALE, whaleSprite } from '../art/whale';
import { LIBERATION_BANNERS, LIBERATION_LINES as L } from '../../core/story';
import type { LiberationParams } from '../types';
import {
  type CutsceneEvent,
  type CutsceneScript,
  type ShipSprites,
  type Sprite,
  type View,
  KAI,
  buildKai,
  buildShip,
  drawLayer,
  drawShipAt,
  drawSprite,
  drawSpriteXY,
  easeIn,
  easeOut,
  fillView,
  freeShip,
  freeSprite,
  glowSprite,
  kaiIdleFrame,
  kaiRunFrame,
  lerp,
  makeSprite,
  rand,
  seg,
  shakeX,
  shakeY,
  smooth,
  window4,
} from './common';

// Libération d'un gardien (≈ 15 s, même modèle pour les mondes 1 à 4, paramétrée par LiberationParams) : le
// Vide quitte le gardien en fumée grise, ses couleurs se rallument (onde de lumière), il confie son noyau à
// Kaï (bandeau « GARDIEN LIBÉRÉ »), qui apprend la compétence (bandeau « NOUVELLE COMPÉTENCE », démonstration
// de double saut) ; LUMA plaisante, la Comète se pose, Kaï embarque, décollage. Décor et gardien : ceux du
// monde 1 (jungle, méduse-baleine) pour tous les mondes tant que les autres ne sont pas dessinés.

const T = {
  voidOut: 0.3,
  heal: 1.6,
  healEnd: 3.6,
  pulse: 3.4,
  core: 4.2,
  coreIn: 6.3,
  skill: 6.5,
  jump: 7.2,
  jump2: 7.6,
  jumpTop: 8.0,
  jumpEnd: 8.7,
  say: 8.0,
  shipIn: 9.6,
  shipDown: 10.9,
  board: 11.2,
  boarded: 12.2,
  takeoff: 12.5,
  fadeOut: 14.3,
  end: 15.0,
} as const;

/** Hauteurs du double saut de démonstration (unités) : le sommet reste sous le bandeau de la compétence. */
const JUMP1 = 50;
const JUMP2 = 42;
/** Centre du bandeau « NOUVELLE COMPÉTENCE » (unités). */
const BANNER2_Y = 68;

/** Polices des bandeaux (Orbitron chargée par l'interface ; repli sans empattement). */
const FONT_TITLE = "'Orbitron', 'Exo 2', system-ui, sans-serif";

interface Assets {
  sky: Sprite;
  far: Sprite;
  mid: Sprite;
  near: Sprite;
  whale: Sprite;
  whaleGrey: Sprite;
  bead: Sprite;
  beadGrey: Sprite;
  core: Sprite;
  smoke: Sprite;
  smokeDark: Sprite;
  ember: Sprite;
  sparkCyan: Sprite;
  sparkPink: Sprite;
  halo: Sprite;
  dust: Sprite;
  banner1: Sprite;
  banner2: Sprite;
  sweep: Sprite;
  ship: ShipSprites;
  kai: Sprite;
}

const P = { x: 0, y: 0, r: 0, thrust: 0 };

/** Taille de police (unités) pour que `text` tienne dans `maxW`. */
function fitFont(ctx: Ctx, text: string, weight: number, size: number, maxW: number): number {
  let s = size;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${weight} ${s}px ${FONT_TITLE}`;
    if (ctx.measureText(text).width <= maxW) break;
    s *= 0.92;
  }
  return s;
}

/** Bandeau : bande sombre aux bouts fondus, filets lumineux, petite ligne puis grand titre. */
function banner(w: number, h: number, small: string, big: string, accent: string, res: number, bigSize: number): Sprite {
  return makeSprite(w, h, w / 2, h / 2, res, (ctx) => {
    const band = linGrad(ctx, 0, 0, w, 0, [
      [0, 'rgba(10,4,30,0)'],
      [0.18, 'rgba(10,4,30,0.78)'],
      [0.82, 'rgba(10,4,30,0.78)'],
      [1, 'rgba(10,4,30,0)'],
    ]);
    ctx.fillStyle = band;
    ctx.fillRect(0, 6, w, h - 12);
    const line = linGrad(ctx, 0, 0, w, 0, [
      [0, rgba(accent, 0)],
      [0.25, rgba(accent, 0.9)],
      [0.75, rgba(accent, 0.9)],
      [1, rgba(accent, 0)],
    ]);
    ctx.fillStyle = line;
    ctx.fillRect(0, 6, w, 1.6);
    ctx.fillRect(0, h - 7.6, w, 1.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const smallSize = Math.round(bigSize * 0.42);
    fitFont(ctx, small, 800, smallSize, w * 0.8);
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.fillText(small, w / 2, h * 0.3);
    const s = fitFont(ctx, big, 800, bigSize, w * 0.84);
    ctx.font = `800 ${s}px ${FONT_TITLE}`;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(big, w / 2, h * 0.64);
    ctx.shadowBlur = 0;
  });
}

/** Reflet qui balaie un bandeau (dégradé blanc oblique). */
function sweepSprite(res: number): Sprite {
  return makeSprite(80, 120, 40, 60, res, (ctx) => {
    ctx.fillStyle = linGrad(ctx, 0, 0, 80, 0, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, 'rgba(255,255,255,0.5)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 80, 120);
  });
}

export function createLiberation(params: LiberationParams): CutsceneScript {
  let A: Assets | null = null;
  const name = params.guardianName.toLocaleUpperCase('fr-FR');
  const skill = params.skillLabel.toLocaleUpperCase('fr-FR');

  const events: CutsceneEvent[] = [
    { t: T.voidOut, cue: 'vide' },
    { t: T.heal, cue: 'heal' },
    { t: T.heal + 0.3, announce: `${LIBERATION_BANNERS.guardian} : ${params.guardianName}` },
    { t: T.core, cue: 'core' },
    { t: T.skill, cue: 'skill' },
    { t: T.skill, announce: `${LIBERATION_BANNERS.skill} : ${params.skillLabel}` },
    { t: T.say, say: L.skill },
    { t: T.shipIn, cue: 'landing' },
    { t: T.takeoff, cue: 'takeoff' },
    { t: T.takeoff + 1.2, hide: true },
  ];

  function build(v: View): void {
    release();
    const k = v.k;
    const vw = v.vw;
    A = {
      sky: jungleSky(vw, k),
      far: jungleFar(vw, k, 31),
      mid: jungleMid(vw, k, 'sanctuary', 32),
      near: jungleNear(vw, k, 'sanctuary', 33),
      whale: whaleSprite('color', k * 0.9),
      whaleGrey: whaleSprite('grey', k * 0.9),
      bead: tentacleSprite(false, k * 0.9),
      beadGrey: tentacleSprite(true, k * 0.9),
      core: coreSprite(k * 1.4),
      smoke: glowSprite('#7a7684', '#a8a4b2', k, 18),
      smokeDark: glowSprite('#2a2630', '#4a4652', k, 18),
      ember: glowSprite('#ff3a4a', '#ffd0d4', k, 6),
      sparkCyan: glowSprite('#3ff0ff', '#ffffff', k, 8),
      sparkPink: glowSprite('#ff4fd8', '#ffe0fa', k, 8),
      halo: glowSprite('#3ff0ff', '#e0feff', k, 48),
      dust: glowSprite('#9dffe4', '#ffffff', k, 16),
      banner1: banner(380, 70, LIBERATION_BANNERS.guardian, name, '#3ff0ff', k, 28),
      banner2: banner(560, 104, LIBERATION_BANNERS.skill, skill, '#9dff3f', k, 44),
      sweep: sweepSprite(k),
      ship: buildShip(k * 0.9),
      kai: buildKai(k),
    };
  }

  function release(): void {
    if (!A) return;
    for (const key of Object.keys(A) as (keyof Assets)[]) {
      if (key === 'ship') freeShip(A.ship);
      else freeSprite(A[key] as Sprite);
    }
    A = null;
  }

  /** Comète : arrivée en haut à gauche, posé, puis décollage vers le haut à droite. */
  function pathShip(t: number, sx: number): void {
    if (t < T.shipDown) {
      const u = easeOut(seg(t, T.shipIn, T.shipDown));
      P.x = lerp(sx - 320, sx, u);
      P.y = lerp(-60, GROUND_Y, u);
      P.r = lerp(0.22, 0, u);
      P.thrust = t > T.shipDown - 0.6 ? 1.4 : 0.9;
      return;
    }
    if (t < T.takeoff) {
      const b = seg(t, T.shipDown, T.shipDown + 0.35);
      P.x = sx;
      P.y = GROUND_Y - 4 * Math.sin(b * Math.PI) * (1 - b);
      P.r = 0;
      P.thrust = 1.4 * (1 - seg(t, T.shipDown, T.shipDown + 0.4)) + 0.6 * seg(t, T.takeoff - 0.3, T.takeoff);
      return;
    }
    const lift = easeOut(seg(t, T.takeoff, T.takeoff + 0.7));
    const go = easeIn(seg(t, T.takeoff + 0.5, T.end));
    P.x = sx + go * 900;
    P.y = GROUND_Y - lift * 40 - go * 420;
    P.r = -0.3 * smooth(seg(t, T.takeoff + 0.3, T.takeoff + 1.2));
    P.thrust = 1.2 + 0.5 * go;
  }

  function draw(ctx: Ctx, t: number, v: View): void {
    const a = A;
    if (!a) return;
    const k = v.k;
    const vw = v.vw;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, v.w, v.h);

    const color = smooth(seg(t, T.heal, T.healEnd));
    drawLayer(ctx, a.sky, 0, 0, 1, k);
    drawLayer(ctx, a.far, 0, 0, 1, k);
    drawLayer(ctx, a.mid, 0, 0, 1, k);
    // Pénombre du Vide qui se dissipe
    fillView(ctx, '#0a0812', 0.38 * (1 - color), v);

    // Le gardien : frissonne, perd son gris, s'élève.
    const amp = v.reduced ? 0 : 2.2 * seg(t, T.voidOut, T.voidOut + 0.4) * (1 - seg(t, T.heal, T.healEnd));
    const wx = vw * 0.6 + shakeX(t, amp) + smooth(seg(t, 9, T.end)) * 40;
    const wy = 140 + Math.sin(t * 0.5) * 5 + shakeY(t, amp) - smooth(seg(t, 5, T.end)) * 70;
    const ws = 0.86;
    const rot = Math.sin(t * 0.33) * 0.03;
    const lift = 0.25 * (1 - color);
    if (color < 1) {
      drawTentacles(ctx, a.beadGrey, wx, wy, ws, t * (0.4 + 0.6 * color), 1 - color, k, 13, lift);
      drawSprite(ctx, a.whaleGrey, 0, wx, wy, ws, rot, 1 - color, k);
    }
    if (color > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawTentacles(ctx, a.bead, wx, wy, ws, t * (0.4 + 0.6 * color), color, k, 13, lift);
      ctx.globalCompositeOperation = 'source-over';
      drawSprite(ctx, a.whale, 0, wx, wy, ws * (1 + Math.sin(t * 1.1) * 0.01 * color), rot, color, k);
    }
    // Le Vide s'en va : fumée grise et braises qui montent du corps.
    if (t < T.healEnd + 1.4) {
      for (let i = 0; i < 72; i++) {
        const te = T.voidOut + rand(i + 800) * 3.4;
        const age = t - te;
        const life = 1.3 + rand(i + 810) * 0.8;
        if (age < 0 || age > life) continue;
        const u = age / life;
        const x = wx + (rand(i + 820) - 0.5) * 360 * ws + (rand(i + 830) - 0.5) * 70 * age;
        const y = wy + (rand(i + 840) - 0.42) * 110 * ws - (46 + rand(i + 850) * 60) * age;
        const kind = i % 6;
        const s = kind === 0 ? a.ember : kind < 3 ? a.smokeDark : a.smoke;
        drawSprite(ctx, s, 0, x, y, (kind === 0 ? 0.7 : 1 + u * 1.8) * (0.8 + rand(i + 860) * 0.5), 0, Math.sin(u * Math.PI) * (kind === 0 ? 1 : kind < 3 ? 0.85 : 0.7), k);
      }
    }
    // Onde de lumière quand les couleurs reviennent
    const pulse = seg(t, T.pulse, T.pulse + 1.0);
    if (pulse > 0 && pulse < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#9ef8ff';
      ctx.globalAlpha = (1 - pulse) * 0.8;
      ctx.lineWidth = (6 - pulse * 4) * k;
      ctx.beginPath();
      ctx.ellipse(wx * k, wy * k, (30 + pulse * vw * 0.7) * k, (18 + pulse * 220) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ff9cf0';
      ctx.globalAlpha = (1 - pulse) * 0.5;
      ctx.beginPath();
      ctx.ellipse(wx * k, wy * k, (20 + pulse * vw * 0.5) * k, (12 + pulse * 160) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // Lueurs qui montent autour du gardien libéré
    if (color > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const per = 2.4 + rand(i + 900) * 1.6;
        const ph = (t - T.heal + rand(i + 910) * per) / per;
        const u = ph - Math.floor(ph);
        const x = wx + (rand(i + 920) - 0.5) * 420 * ws + Math.sin(t + i) * 8;
        const y = wy + 60 - u * 160;
        drawSprite(ctx, i % 2 ? a.sparkCyan : a.sparkPink, 0, x, y, 0.4 + rand(i + 930) * 0.4, 0, color * Math.sin(u * Math.PI) * 0.8, k);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawLayer(ctx, a.near, 0, 0, 1, k);

    // La Comète (arrive après la compétence)
    const sx = vw * 0.17;
    if (t >= T.shipIn) {
      pathShip(t, sx);
      drawShipAt(ctx, a.ship, P.x, P.y, 0.8, P.r, 1, P.thrust, t, k);
      if (t >= T.shipDown - 0.5 && t < T.shipDown + 1.4) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const age = t - (T.shipDown - 0.3 + (i % 3) * 0.1);
          if (age < 0 || age > 1.1) continue;
          const dir = i % 2 ? 1 : -1;
          drawSprite(ctx, a.dust, 0, sx + dir * (18 + age * (50 + rand(i + 950) * 60)), GROUND_Y - 4 - age * 14, 0.5 + age, 0, 0.4 * (1 - age / 1.1), k);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Kaï : regarde le gardien, reçoit le noyau, double saut, puis court embarquer.
    const kx0 = vw * 0.4;
    let kx = kx0;
    let ky = GROUND_Y;
    let frame: number = kaiIdleFrame(t);
    let flip = false;
    let kAlpha = 1;
    if (t >= T.jump && t < T.jumpEnd) {
      if (t < T.jump2) ky = GROUND_Y - JUMP1 * Math.sin(seg(t, T.jump, T.jump2) * Math.PI * 0.5);
      else if (t < T.jumpTop) ky = GROUND_Y - JUMP1 - JUMP2 * Math.sin(seg(t, T.jump2, T.jumpTop) * Math.PI * 0.5);
      else {
        const u = seg(t, T.jumpTop, T.jumpEnd);
        ky = GROUND_Y - (JUMP1 + JUMP2) * (1 - u * u);
      }
      frame = t < T.jumpTop ? KAI.jump : KAI.fall;
    } else if (t >= T.board) {
      const u = seg(t, T.board, T.boarded);
      kx = lerp(kx0, sx + 40, u);
      frame = kaiRunFrame(t);
      flip = true;
      kAlpha = 1 - seg(t, T.boarded - 0.2, T.boarded);
    }
    // Halo de la compétence
    const glowK = window4(t, T.coreIn - 0.1, T.coreIn + 0.3, T.skill + 2.2, T.skill + 3.4);
    if (glowK > 0 && kAlpha > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.halo, 0, kx, ky - 34, 1.25 + 0.15 * Math.sin(t * 7), 0, glowK * 0.9 * kAlpha, k);
      drawSprite(ctx, a.sparkCyan, 0, kx, ky - 34, 2.6 + 0.3 * Math.sin(t * 5), 0, glowK * 0.5 * kAlpha, k);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (kAlpha > 0) drawSprite(ctx, a.kai, frame, kx, ky, 0.9, 0, kAlpha, k, flip);
    // Anneau du second saut
    const ring = seg(t, T.jump2, T.jump2 + 0.45);
    if (ring > 0 && ring < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#9ef8ff';
      ctx.globalAlpha = 1 - ring;
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath();
      ctx.ellipse(kx * k, (GROUND_Y - JUMP1) * k, (10 + ring * 34) * k, (3 + ring * 9) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Le noyau : quitte le cœur du gardien et descend dans les mains de Kaï.
    if (t >= T.core - 0.4 && t < T.coreIn + 0.5) {
      const hx = wx + (WHALE_HEART.x - WHALE.w / 2) * ws;
      const hy = wy + (WHALE_HEART.y - WHALE.h / 2) * ws;
      const u = smooth(seg(t, T.core, T.coreIn));
      const tx = kx0 + 22;
      const ty = GROUND_Y - 40;
      // Courbe de Bézier quadratique, point de contrôle au-dessus, vers la gauche.
      const cx = (hx + tx) / 2 - 60;
      const cy = Math.min(hy, ty) - 70;
      const iu = 1 - u;
      const px = iu * iu * hx + 2 * iu * u * cx + u * u * tx;
      const py = iu * iu * hy + 2 * iu * u * cy + u * u * ty + Math.sin(t * 5) * 3 * (1 - u);
      const appear = seg(t, T.core - 0.4, T.core + 0.2);
      const absorb = 1 - seg(t, T.coreIn, T.coreIn + 0.5);
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.halo, 0, px, py, 0.7 + 0.1 * Math.sin(t * 9), 0, 0.5 * appear * absorb, k);
      ctx.globalCompositeOperation = 'source-over';
      drawSprite(ctx, a.core, 0, px, py, (0.9 + 0.08 * Math.sin(t * 9)) * (0.4 + 0.6 * absorb), t * 0.8, appear * absorb, k);
      // Anneaux en orbite
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.4 * k;
      ctx.strokeStyle = '#9ef8ff';
      ctx.globalAlpha = 0.8 * appear * absorb;
      ctx.beginPath();
      ctx.ellipse(px * k, py * k, 17 * k, 6 * k, t * 1.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ff9cf0';
      ctx.beginPath();
      ctx.ellipse(px * k, py * k, 15 * k, 5 * k, -t * 1.3 + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // Éclair d'absorption
    const absorbFlash = window4(t, T.coreIn - 0.05, T.coreIn + 0.05, T.coreIn + 0.1, T.coreIn + 0.6);
    if (absorbFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.halo, 0, kx0 + 10, GROUND_Y - 36, 1 + absorbFlash * 1.4, 0, absorbFlash * (v.reduced ? 0.4 : 0.9), k);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Bandeaux
    const b1 = window4(t, T.heal + 0.3, T.heal + 0.7, T.core + 0.6, T.core + 1.1);
    if (b1 > 0) drawSprite(ctx, a.banner1, 0, vw * 0.5, 42 - (1 - b1) * 8, 1, 0, b1, k);
    const b2 = window4(t, T.skill, T.skill + 0.35, T.shipIn + 0.2, T.shipIn + 0.7);
    if (b2 > 0) {
      const sxs = 0.7 + 0.3 * easeOut(seg(t, T.skill, T.skill + 0.4));
      const by = BANNER2_Y;
      drawSpriteXY(ctx, a.banner2, vw * 0.5, by, sxs, 1, 0, b2, k);
      // Reflet qui balaie le bandeau
      const sw = seg(t, T.skill + 0.3, T.skill + 1.3);
      if (sw > 0 && sw < 1) {
        ctx.save();
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.beginPath();
        ctx.rect(vw * 0.5 - 280 * sxs, by - 46, 560 * sxs, 92);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, a.sweep, 0, vw * 0.5 - 300 + sw * 600, by, 1, 0.35, b2 * 0.9, k);
        ctx.restore();
      }
    }

    fillView(ctx, '#ffffff', (v.reduced ? 0.12 : 0.3) * window4(t, T.pulse - 0.1, T.pulse + 0.05, T.pulse + 0.1, T.pulse + 0.7), v);
    fillView(ctx, '#05010f', 1 - seg(t, 0, 0.6) + seg(t, T.fadeOut, T.end), v);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return { duration: T.end, events, build, draw, release };
}
