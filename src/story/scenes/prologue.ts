import type { Ctx } from '../../game2d/art/util';
import { GROUND_Y, jungleFar, jungleMid, jungleNear, jungleSky } from '../art/jungle';
import { debris, planet, rift, spaceSky, starTile, twinkle, voidSky } from '../art/space';
import { WHALE, WHALE_BLOTS, drawTentacles, tentacleSprite, whaleSprite } from '../art/whale';
import { PROLOGUE_LINES as L } from '../../core/story';
import {
  type CutsceneEvent,
  type CutsceneScript,
  type ShipSprites,
  type Sprite,
  type View,
  KAI,
  VH,
  buildKai,
  buildShip,
  drawLayer,
  drawLayerWrapped,
  drawShipAt,
  drawSprite,
  easeIn,
  easeOut,
  fillView,
  fract,
  freeShip,
  freeSprite,
  glowSprite,
  kaiIdleFrame,
  kaiRunFrame,
  lerp,
  rand,
  seg,
  shakeX,
  shakeY,
  smooth,
  window4,
} from './common';

// Prologue (≈ 43 s) : A. la Comète au bord de la galaxie, un signal ; B. la Faille s'ouvre et l'aspire (éclair,
// tunnel) ; C. de l'autre côté, des mondes qui s'éteignent (le Vide) ; D. atterrissage brutal en bordure de la
// jungle de Xéna, Kaï descend ; E. la méduse-baleine tachée de gris paraît au loin, LUMA annonce le but, puis
// le Vide la brouille (salves d'interférences) et Kaï part à pied. Chaque image ne dépend que du temps.

/** Repères de la chronologie (s). */
const T = {
  riftOpen: 9.2,
  pull: 10.6,
  suck: 12.8,
  gone: 13.8,
  tunnelEnd: 16.8,
  voidIn: 16.0,
  dive: 20.4,
  entry: 21.7,
  xena: 22.3,
  retro: 24.6,
  touch: 25.4,
  kaiOut: 26.0,
  kaiDown: 26.6,
  pan: 30.4,
  panEnd: 32.8,
  whaleIn: 30.0,
  scramble: 38.3,
  run: 39.6,
  fadeOut: 42.8,
  end: 43.6,
} as const;

const EVENTS: readonly CutsceneEvent[] = [
  { t: 0.4, cue: 'signal' },
  { t: 0.6, say: L.signal },
  { t: 2.6, cue: 'signal' },
  { t: 4.6, say: L.kai },
  { t: 4.8, cue: 'signal' },
  { t: 5.9, say: L.decision },
  { t: 7.0, cue: 'signal' },
  { t: T.riftOpen, cue: 'rift' },
  { t: 10.2, say: L.rift },
  { t: T.suck, cue: 'whoosh' },
  { t: T.gone, hide: true },
  { t: 16.4, cue: 'vide' },
  { t: 16.9, say: L.worlds },
  { t: 21.2, hide: true },
  { t: T.entry + 0.2, cue: 'whoosh' },
  { t: T.retro, cue: 'landing' },
  { t: T.touch, cue: 'impact' },
  { t: 26.6, say: L.alive },
  { t: 31.2, say: L.guardian },
  { t: 35.6, say: L.goal },
  { t: T.scramble, say: L.onFoot },
  // Bulle retirée avant le fondu au noir (la fin ne laisse que l'image noire).
  { t: T.fadeOut, hide: true },
];

interface Assets {
  sky: Sprite;
  starsFar: Sprite;
  starsNear: Sprite;
  twinkle: Sprite;
  signal: Sprite;
  spark: Sprite;
  sparkPink: Sprite;
  rift: Sprite;
  riftGlow: Sprite;
  riftCore: Sprite;
  voidSky: Sprite;
  starsDim: Sprite;
  deadBig: Sprite;
  deadMed: Sprite;
  living: Sprite;
  livingDead: Sprite;
  xena: Sprite;
  debris: Sprite;
  ash: Sprite;
  ember: Sprite;
  smoke: Sprite;
  heat: Sprite;
  jSky: Sprite;
  jFar: Sprite;
  jMid: Sprite;
  jNear: Sprite;
  whale: Sprite;
  whaleHalo: Sprite;
  bead: Sprite;
  dust: Sprite;
  ship: ShipSprites;
  kai: Sprite;
  /** Largeur de la vue lors de la construction (positions relatives). */
  vw: number;
}

/** Résultat des fonctions de trajectoire (objet réutilisé : aucune allocation par image). */
const P = { x: 0, y: 0, r: 0, s: 0, a: 1, thrust: 0 };

/** Comète en A et B (ancre aux pieds) : vol au bord de la galaxie, puis aspirée par la Faille. */
function pathSpace(t: number, vw: number): void {
  const bx = vw * 0.3 + Math.sin(t * 0.5) * 8;
  const by = 226 + Math.sin(t * 1.1) * 5;
  const pull = easeIn(seg(t, T.pull, T.gone));
  const shrink = easeIn(seg(t, T.suck - 0.2, T.gone));
  const s = 0.85 * (1 - 0.96 * shrink);
  // Centre visé : la Faille ; on interpole le centre du vaisseau puis on revient aux pieds.
  const cx = lerp(bx, vw * 0.8, pull);
  const cy = lerp(by - 54 * 0.85, 176, pull);
  const wob = seg(t, T.pull, T.suck);
  P.x = cx + shakeX(t * 0.9, 5 * wob * (1 - shrink));
  P.y = cy + 54 * s + shakeY(t * 0.9, 4 * wob * (1 - shrink));
  P.r = Math.sin(t * 0.9) * 0.03 + shakeX(t * 0.7, 0.07 * wob) + easeIn(seg(t, T.suck, T.gone)) * 5.5;
  P.s = s;
  P.a = 1;
  P.thrust = t < T.pull ? 1 : t < T.suck ? 1.35 : 1.35 * (1 - seg(t, T.suck, T.suck + 0.4));
}

/** Comète en C (ancre aux pieds) : arrive en tournoyant, traverse, plonge vers Xéna. */
function pathVoid(t: number, vw: number): void {
  let cx: number;
  let cy: number;
  let r: number;
  let s: number;
  if (t < 17.6) {
    const u = easeOut(seg(t, T.voidIn, 17.6));
    cx = lerp(vw * 0.04, vw * 0.24, u);
    cy = lerp(40, 168, u);
    r = (1 - u) * 3.2 + Math.sin(t * 2) * 0.04;
    s = 0.7;
  } else if (t < T.dive) {
    const u = smooth(seg(t, 17.6, T.dive));
    cx = lerp(vw * 0.24, vw * 0.56, u);
    cy = lerp(168, 196, u) + Math.sin(t * 1.4) * 3;
    r = -0.04 + Math.sin(t * 1.1) * 0.05;
    s = lerp(0.7, 0.6, u);
  } else {
    const u = easeIn(seg(t, T.dive, T.xena));
    cx = lerp(vw * 0.56, vw * 0.86, u);
    cy = lerp(196, 232, u);
    r = -0.04 + u * 0.55;
    s = lerp(0.6, 0.06, u);
  }
  P.x = cx;
  P.y = cy + 54 * s;
  P.r = r;
  P.s = s;
  P.a = 1;
  P.thrust = 0.55 + 0.3 * Math.sin(t * 19) * Math.sin(t * 7.3);
}

/** Comète en D (ancre aux pieds) : descente, rétrofusées, posé brutal. */
function pathLanding(t: number, lx: number): void {
  const u = easeOut(seg(t, T.xena, T.touch));
  const x = lerp(lx - 360, lx, u);
  let y = lerp(-40, GROUND_Y, easeOut(seg(t, T.xena, T.touch) * 1.0));
  let r = lerp(0.2, 0, u);
  if (t >= T.touch) {
    const b = seg(t, T.touch, T.touch + 0.45);
    y = GROUND_Y - 7 * Math.sin(b * Math.PI) * (1 - b);
    r = 0.05 * Math.sin(b * Math.PI * 2) * (1 - b) + 0.02 * smooth(b);
  }
  P.x = x;
  P.y = y;
  P.r = r;
  P.s = 0.8;
  P.a = 1;
  P.thrust = t < T.retro ? 0.9 : t < T.touch ? 1.5 : 1.5 * (1 - seg(t, T.touch, T.touch + 0.4));
}

/**
 * Brouillage du Vide près de la gardienne (réplique « brouillée » de LUMA) : trois brèves salves de bandes
 * décalées (copies du canvas sur lui-même), couleurs éteintes et grésillement. Dépend seulement de t.
 */
function interference(ctx: Ctx, t: number, v: View): void {
  const u = t - T.scramble;
  if (!(u < 0.45 || (u > 1.3 && u < 1.6) || (u > 2.6 && u < 2.8))) return;
  const w = v.w;
  const h = v.h;
  const seed = Math.floor(t * 14) * 7;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const bands = v.reduced ? 2 : 4;
  for (let i = 0; i < bands; i++) {
    const y = Math.floor(rand(seed + i * 3) * h * 0.8);
    const bh = Math.max(2, Math.floor((0.012 + rand(seed + i * 3 + 1) * 0.05) * h));
    const dx = Math.round((rand(seed + i * 3 + 2) - 0.5) * (v.reduced ? 0.02 : 0.08) * w);
    ctx.drawImage(ctx.canvas, 0, y, w, bh, dx, y, w, bh);
  }
  // Couleurs éteintes
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = v.reduced ? 0.3 : 0.55;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // Grésillement : traits gris, sombres et rouges
  for (let i = 0; i < 26; i++) {
    const r0 = rand(seed + 100 + i * 2);
    ctx.globalAlpha = 0.3 + 0.45 * rand(seed + 101 + i * 2);
    ctx.fillStyle = r0 < 0.2 ? '#ff3a4a' : r0 < 0.7 ? '#c8c4d0' : '#0a080e';
    ctx.fillRect(rand(seed + 160 + i) * w, rand(seed + 200 + i) * h, (4 + r0 * 44) * v.k, Math.max(1, v.k * 1.2));
  }
  ctx.globalAlpha = 1;
}

export function createPrologue(): CutsceneScript {
  let A: Assets | null = null;

  function build(v: View): void {
    release();
    const k = v.k;
    const vw = v.vw;
    const pan = vw * 0.8;
    A = {
      sky: spaceSky(vw, k),
      starsFar: starTile(512, k, 11, 170, false, ['#ffffff', '#bff8ff', '#ffc4f0', '#c8c0ff']),
      starsNear: starTile(640, k, 12, 24, true, ['#bff8ff', '#ffffff', '#ffb3f0']),
      twinkle: twinkle(k),
      signal: glowSprite('#3ff0ff', '#ffffff', k, 24),
      spark: glowSprite('#ffffff', '#ffffff', k, 8),
      sparkPink: glowSprite('#ff4fd8', '#ffe0fa', k, 8),
      rift: rift(k),
      riftGlow: glowSprite('#b03cff', '#ff9cf0', k, 150),
      riftCore: glowSprite('#ff3fd2', '#ffffff', k, 70),
      voidSky: voidSky(vw, k),
      starsDim: starTile(512, k, 13, 90, false, ['#9a96a4', '#6a6672', '#c8c4d0']),
      deadBig: planet(150, 'dead', k),
      deadMed: planet(58, 'dead', k),
      living: planet(46, 'living', k),
      livingDead: planet(46, 'livingDead', k),
      xena: planet(34, 'xena', k),
      debris: debris(k),
      ash: glowSprite('#8a8692', '#c8c4d0', k, 6),
      ember: glowSprite('#ff3a4a', '#ffd0d4', k, 6),
      smoke: glowSprite('#6a6672', '#9a96a4', k, 16),
      heat: glowSprite('#ffb347', '#fff6e0', k, 40),
      jSky: jungleSky(vw + pan * 0.04 + 8, k),
      jFar: jungleFar(vw + pan * 0.15 + 8, k, 21),
      jMid: jungleMid(vw + pan * 0.5 + 8, k, 'edge', 22),
      jNear: jungleNear(vw + pan + 8, k, 'edge', 23),
      whale: whaleSprite('stained', k * 0.56),
      whaleHalo: glowSprite('#7a6aff', '#b8b0ff', k * 0.5, 120),
      bead: tentacleSprite(false, k * 0.56),
      dust: glowSprite('#9dffe4', '#ffffff', k, 16),
      ship: buildShip(k * 0.9),
      kai: buildKai(k * 0.9),
      vw,
    };
  }

  function release(): void {
    if (!A) return;
    for (const key of Object.keys(A) as (keyof Assets)[]) {
      const s = A[key];
      if (key === 'ship') freeShip(s as ShipSprites);
      else if (key !== 'vw') freeSprite(s as Sprite);
    }
    A = null;
  }

  function draw(ctx: Ctx, t: number, v: View): void {
    if (!A) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, v.w, v.h);
    if (t < T.gone + 0.8) drawSpace(ctx, t, v, A);
    if (t >= T.voidIn && t < T.xena + 0.8) drawVoid(ctx, t, v, A);
    if (t >= T.gone - 0.2 && t < T.tunnelEnd) drawTunnel(ctx, t, v, A);
    if (t >= T.xena) drawXena(ctx, t, v, A);
    if (t >= T.scramble && t < T.fadeOut) interference(ctx, t, v);
    // Éclair blanc de la Faille, entrée dans l'atmosphère, fondus d'ouverture et de fin.
    const dim = v.reduced ? 0.4 : 1;
    fillView(ctx, '#ffffff', dim * window4(t, T.gone - 0.25, T.gone + 0.05, T.gone + 0.15, T.gone + 0.8), v);
    fillView(ctx, '#ffd6a0', dim * window4(t, T.entry, T.xena, T.xena + 0.1, T.xena + 0.9), v);
    fillView(ctx, '#05010f', 1 - seg(t, 0, 0.8) + seg(t, T.fadeOut, T.end), v);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ A et B : le signal, la Faille

  function drawSpace(ctx: Ctx, t: number, v: View, a: Assets): void {
    const k = v.k;
    const vw = v.vw;
    const amp = v.reduced ? 0 : 3.2 * seg(t, T.pull, T.suck) * (1 - seg(t, T.suck + 0.6, T.gone));
    const ox = shakeX(t, amp);
    const oy = shakeY(t, amp);
    drawLayer(ctx, a.sky, 0, 0, 1, k);
    drawLayerWrapped(ctx, a.starsFar, t * 14 - ox, 0, 1, k, vw);
    drawLayerWrapped(ctx, a.starsNear, t * 46 - ox, oy, 1, k, vw);
    for (let i = 0; i < 7; i++) {
      const x = fract(rand(i * 3) - t * 0.02) * vw;
      const y = 30 + rand(i * 3 + 1) * 250;
      drawSprite(ctx, a.twinkle, 0, x + ox, y + oy, 0.5 + rand(i * 3 + 2) * 0.5, 0, 0.35 + 0.35 * Math.sin(t * 2.6 + i * 1.7), k);
    }
    const rx = vw * 0.8 + ox;
    const ry = 176 + oy;
    // Le signal : impulsions toutes les 2,2 s, éteint quand la Faille s'ouvre.
    const sig = 1 - seg(t, T.riftOpen - 0.4, T.riftOpen + 0.4);
    if (sig > 0) {
      const beat = fract((t - 0.4) / 2.2);
      drawSprite(ctx, a.signal, 0, rx, ry, 0.55 + 0.25 * Math.exp(-beat * 6), 0, sig * (0.75 + 0.25 * Math.sin(t * 9)), k);
      ctx.strokeStyle = '#9ef8ff';
      for (let j = 0; j < 3; j++) {
        const age = (t - 0.4 - j * 0.16) / 2.2;
        if (age < 0) continue;
        const ph = fract(age);
        const rad = 8 + ph * 120;
        ctx.globalAlpha = sig * (1 - ph) * 0.8;
        ctx.lineWidth = (2.2 - j * 0.5) * k;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.arc(rx * k, ry * k, rad * k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // La Faille
    if (t >= T.riftOpen - 0.4) {
      const o = easeOut(seg(t, T.riftOpen, T.riftOpen + 1.4));
      const sx = 0.03 + 0.97 * o + Math.sin(o * Math.PI) * 0.18 + 0.03 * Math.sin(t * 9);
      const sy = 0.25 + 0.75 * easeOut(seg(t, T.riftOpen - 0.4, T.riftOpen + 0.8));
      const close = 1 - seg(t, T.gone + 0.2, T.gone + 0.8);
      const fr = Math.floor(t * 12) % 3;
      // Halo (sprite rond à part : jamais coupé), puis la déchirure étirée.
      const halo = Math.min(1, o * 1.4) * close;
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.riftGlow, 0, rx, ry, 0.9 + 0.9 * o + 0.05 * Math.sin(t * 5), 0, halo * 0.95, k);
      drawSprite(ctx, a.riftCore, 0, rx, ry, 1 + 1.2 * o, 0, halo * 0.7, k);
      ctx.globalCompositeOperation = 'source-over';
      drawRift(ctx, a.rift, fr, rx, ry, sx * close, sy, -0.18, 1, k);
      // Poussière d'étoiles aspirée en spirale : traits tournés vers la Faille.
      const suck = seg(t, T.riftOpen + 0.4, T.riftOpen + 1.2) * close;
      if (suck > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 70; i++) {
          const per = 1.1 + rand(i + 200) * 1.1;
          const ph = fract((t - T.riftOpen) / per + rand(i + 300));
          const rad = (70 + rand(i + 100) * 360) * Math.pow(1 - ph, 1.6);
          const ang = rand(i) * Math.PI * 2 + ph * 2.4;
          const px = rx + Math.cos(ang) * rad * 1.25;
          const py = ry + Math.sin(ang) * rad * 0.75;
          const tail = 0.1 + 0.25 * ph;
          ctx.strokeStyle = i % 3 === 0 ? '#ff7ae6' : i % 3 === 1 ? '#ffffff' : '#c49cff';
          ctx.globalAlpha = suck * Math.sin(ph * Math.PI) * 0.9;
          ctx.lineWidth = (1.4 + rand(i + 400) * 1.6) * k;
          ctx.beginPath();
          ctx.moveTo(px * k, py * k);
          ctx.lineTo((px + (px - rx) * tail) * k, (py + (py - ry) * tail) * k);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // La Comète
    if (t < T.gone) {
      pathSpace(t, vw);
      drawShipAt(ctx, a.ship, P.x + ox, P.y + oy, P.s, P.r, P.a, P.thrust, t, k);
    }
  }

  function drawRift(ctx: Ctx, s: Sprite, frame: number, x: number, y: number, sx: number, sy: number, rot: number, alpha: number, k: number): void {
    if (sx <= 0.001 || sy <= 0.001) return;
    const fx = (k * sx) / s.res;
    const fy = (k * sy) / s.res;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    ctx.globalAlpha = alpha;
    ctx.setTransform(cs * fx, sn * fx, -sn * fy, cs * fy, x * k, y * k);
    ctx.drawImage(s.c, frame * s.fw, 0, s.fw, s.fh, -s.ax * s.res, -s.ay * s.res, s.fw, s.fh);
  }

  // ------------------------------------------------------------ Le tunnel de la Faille

  function drawTunnel(ctx: Ctx, t: number, v: View, a: Assets): void {
    const k = v.k;
    const vw = v.vw;
    const alpha = seg(t, T.gone - 0.2, T.gone + 0.1) * (1 - seg(t, T.tunnelEnd - 0.8, T.tunnelEnd));
    if (alpha <= 0) return;
    fillView(ctx, '#0b0616', alpha, v);
    const cx = vw * 0.5;
    const cy = VH * 0.47;
    const grey = seg(t, T.gone + 0.6, T.tunnelEnd - 0.6);
    // Fond : lueur violette au centre, anneaux qui filent vers l'extérieur.
    ctx.globalCompositeOperation = 'lighter';
    drawSprite(ctx, a.riftGlow, 0, cx, cy, 2.2 + Math.sin(t * 3) * 0.1, 0, alpha * (0.55 - 0.3 * grey), k);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = grey > 0.5 ? '#6a6672' : '#b06aff';
    for (let j = 0; j < 4; j++) {
      const d = fract(t * 0.8 + j * 0.25);
      ctx.globalAlpha = alpha * d * (1 - d) * 1.6;
      ctx.lineWidth = (1 + d * 5) * k;
      ctx.beginPath();
      ctx.ellipse(cx * k, cy * k, (10 + d * d * vw * 0.7) * k, (7 + d * d * vw * 0.42) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 110; i++) {
      const d = fract(t * (0.7 + rand(i + 50) * 0.5) + rand(i + 60));
      const ang = rand(i) * Math.PI * 2;
      const r1 = 14 + d * d * vw * 0.75;
      const r2 = r1 * (1.18 + d * 0.7);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const kind = i % 4;
      ctx.strokeStyle = kind === 0 ? '#ffffff' : kind === 1 ? (grey > 0.5 ? '#8a8692' : '#ff4fd8') : kind === 2 ? (grey > 0.6 ? '#ff3a4a' : '#b06aff') : grey > 0.4 ? '#6a6672' : '#3ff0ff';
      ctx.globalAlpha = alpha * Math.min(1, d * 3) * 0.85;
      ctx.lineWidth = (0.6 + d * 3.2) * k;
      ctx.beginPath();
      ctx.moveTo((cx + cs * r1) * k, (cy + sn * r1 * 0.7) * k);
      ctx.lineTo((cx + cs * r2) * k, (cy + sn * r2 * 0.7) * k);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawSprite(ctx, a.riftCore, 0, cx, cy, 1.1 + Math.sin(t * 8) * 0.08, 0, alpha * 0.8, k);
    drawSprite(ctx, a.signal, 0, cx, cy, 1.4 + Math.sin(t * 8) * 0.1, 0, alpha * 0.6, k);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ C : des mondes qui s'éteignent

  function drawVoid(ctx: Ctx, t: number, v: View, a: Assets): void {
    const k = v.k;
    const vw = v.vw;
    drawLayer(ctx, a.voidSky, 0, 0, 1, k);
    drawLayerWrapped(ctx, a.starsDim, t * 5, 0, 0.8, k, vw);
    // Plongée : tout grossit autour de Xéna (zx, zy).
    const zx = vw * 0.86;
    const zy = 236;
    const z = 1 + 2.4 * easeIn(seg(t, T.dive + 0.3, T.xena));
    drawSprite(ctx, a.deadBig, 0, zx + (-vw * 0.02 - zx) * z, zy + (150 - zy) * z, z, t * 0.01, 1, k);
    drawSprite(ctx, a.deadMed, 0, zx + (vw * 0.78 - zx) * z, zy + (64 - zy) * z, z, 0, 1, k);
    // Un monde encore vivant que le gris envahit, de gauche à droite.
    const R = 46;
    const px = zx + (vw * 0.47 - zx) * z;
    const py = zy + (104 - zy) * z;
    drawSprite(ctx, a.living, 0, px, py, z, 0, 1, k);
    const eat = smooth(seg(t, 16.8, 21.6));
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.beginPath();
    ctx.arc(px + (eat - 1) * R * 2.4 * z, py - R * 0.15 * z, R * 1.25 * z, 0, Math.PI * 2);
    ctx.clip();
    drawSprite(ctx, a.livingDead, 0, px, py, z, 0, 1, k);
    ctx.restore();
    drawSprite(ctx, a.xena, 0, zx, zy, z, 0, 1, k);
    // Débris à la dérive
    for (let i = 0; i < 6; i++) {
      const x = fract(rand(i + 500) - t * (0.006 + rand(i + 510) * 0.01)) * (vw + 80) - 40;
      const y = 40 + rand(i + 520) * 250;
      drawSprite(ctx, a.debris, i % 3, zx + (x - zx) * z, zy + (y - zy) * z, (0.5 + rand(i + 530) * 0.7) * z, t * (rand(i + 540) - 0.5), 0.9, k);
    }
    // Cendres et braises du Vide
    for (let i = 0; i < 44; i++) {
      const sp = 10 + rand(i + 600) * 26;
      const x = fract(rand(i + 610) + (t * sp) / (vw + 40)) * (vw + 40) - 20;
      const y0 = rand(i + 620) * VH - ((t * (4 + rand(i + 630) * 6)) % VH);
      const y = y0 < 0 ? y0 + VH : y0;
      drawSprite(ctx, i % 5 === 0 ? a.ember : a.ash, 0, x, y + Math.sin(t + i) * 6, 0.5 + rand(i + 640) * 0.8, 0, 0.55, k);
    }
    // Traînée de fumée puis la Comète
    for (let i = 0; i < 24; i++) {
      const te = T.voidIn + i * 0.25;
      const age = t - te;
      if (age < 0 || age > 1.8) continue;
      pathVoid(te, vw);
      const sx = P.x - 70 * P.s - age * 10;
      const sy = P.y - 52 * P.s - age * 7;
      drawSprite(ctx, a.smoke, 0, zx + (sx - zx) * z, zy + (sy - zy) * z, (0.35 + age * 0.6) * (P.s / 0.7) * z, 0, 0.4 * (1 - age / 1.8), k);
    }
    pathVoid(t, vw);
    const shx = zx + (P.x - zx) * z;
    const shy = zy + (P.y - zy) * z;
    drawShipAt(ctx, a.ship, shx, shy, P.s * z, P.r, P.a, P.thrust, t, k);
    // Échauffement à l'approche de Xéna
    const heat = seg(t, T.dive + 0.6, T.xena);
    if (heat > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.heat, 0, shx + 20 * P.s * z, shy - 54 * P.s * z, 0.5 + heat * 0.8, 0, heat * 0.8, k);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ------------------------------------------------------------ D et E : Xéna

  function drawXena(ctx: Ctx, t: number, v: View, a: Assets): void {
    const k = v.k;
    const vw = v.vw;
    const pan1 = vw * 0.32;
    const pan2 = vw * 0.36;
    const run = smooth(seg(t, T.run, T.end));
    const cam = pan1 * smooth(seg(t, T.pan, T.panEnd)) + pan2 * run;
    const amp = v.reduced || t < T.touch ? 0 : 4 * (1 - seg(t, T.touch, T.touch + 0.6));
    const ox = shakeX(t, amp);
    const oy = shakeY(t, amp);
    const lx = vw * 0.34;
    drawLayer(ctx, a.jSky, -cam * 0.04, 0, 1, k);
    drawLayer(ctx, a.jFar, -cam * 0.15 + ox * 0.3, oy * 0.3, 1, k);
    // La gardienne au loin, tachée de gris : paraît pendant le panoramique, au-dessus des couronnes des arbres
    // (le bas du corps et les tentacules passent derrière).
    if (t >= T.whaleIn) {
      const wx = lerp(vw + 340, vw * 0.62, easeOut(seg(t, T.whaleIn, T.panEnd + 1.6))) - pan2 * 0.25 * run - (t - T.whaleIn) * 3;
      const wy = 74 + Math.sin(t * 0.42) * 6;
      const ws = 0.58;
      const rot = Math.sin(t * 0.33) * 0.035;
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, a.whaleHalo, 0, wx, wy, 1.9, 0, 0.32, k);
      ctx.globalCompositeOperation = 'source-over';
      drawTentacles(ctx, a.bead, wx, wy, ws, t, 0.9, k, 12, 0);
      drawSprite(ctx, a.whale, 0, wx, wy, ws * (1 + Math.sin(t * 1.1) * 0.012), rot, 1, k);
      // Fumée grise du Vide qui monte des plaques
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let i = 0; i < 20; i++) {
        const b = (i % 4) * 2;
        const lx0 = (WHALE_BLOTS[b] - WHALE.w / 2) * ws;
        const ly0 = (WHALE_BLOTS[b + 1] - WHALE.h / 2) * ws;
        const ph = fract(t / 2.4 + rand(i + 760));
        const px = wx + lx0 * cs - ly0 * sn + (rand(i + 770) - 0.5) * 14 + Math.sin(t * 1.3 + i) * 4;
        const py = wy + lx0 * sn + ly0 * cs - ph * 34;
        drawSprite(ctx, i % 5 === 0 ? a.ember : a.smoke, 0, px, py, (i % 5 === 0 ? 0.5 : 0.35 + ph * 0.5), 0, Math.sin(ph * Math.PI) * 0.6, k);
      }
    }
    drawLayer(ctx, a.jMid, -cam * 0.5 + ox * 0.6, oy * 0.6, 1, k);
    drawLayer(ctx, a.jNear, -cam + ox, oy, 1, k);
    // La Comète se pose
    pathLanding(t, lx);
    drawShipAt(ctx, a.ship, P.x - cam + ox, P.y + oy, P.s, P.r, 1, P.thrust, t, k);
    // Poussière soulevée au posé
    if (t >= T.retro && t < T.touch + 1.6) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const t0 = i < 5 ? T.retro + i * 0.12 : T.touch;
        const age = t - t0;
        if (age < 0 || age > 1.2) continue;
        const dir = i % 2 ? 1 : -1;
        const x = lx - cam + dir * (20 + age * (60 + rand(i + 700) * 70));
        const y = GROUND_Y - 4 - age * (10 + rand(i + 710) * 14);
        drawSprite(ctx, a.dust, 0, x + ox, y + oy, 0.5 + age * 1.2, 0, 0.4 * (1 - age / 1.2), k);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Kaï descend de la Comète, puis part à pied vers la droite.
    if (t >= T.kaiOut) {
      const kx0 = lx + 34;
      const kx1 = lx + 120;
      let x: number;
      let y: number;
      let frame: number;
      if (t < T.kaiDown) {
        const u = seg(t, T.kaiOut, T.kaiDown);
        x = lerp(kx0, kx1, u);
        y = lerp(GROUND_Y - 46, GROUND_Y, u) - Math.sin(u * Math.PI) * 30;
        frame = u < 0.5 ? KAI.jump : KAI.fall;
      } else if (t < T.run) {
        x = kx1;
        y = GROUND_Y;
        frame = kaiIdleFrame(t);
      } else {
        x = kx1 + 178 * (t - T.run) * smooth(seg(t, T.run, T.run + 0.3));
        y = GROUND_Y;
        frame = kaiRunFrame(t);
      }
      drawSprite(ctx, a.kai, frame, x - cam + ox, y + oy, 0.8, 0, seg(t, T.kaiOut, T.kaiOut + 0.12), k);
    }
  }

  return { duration: T.end, events: EVENTS, build, draw, release };
}
