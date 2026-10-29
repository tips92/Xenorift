import { drawArmFrame, drawPlayerFrame, PLAYER_SHOULDER } from '../../game2d/art/draw/player';
import { drawShip, drawShipFlame, SHIP_NOZZLE } from '../../game2d/art/draw/ship';
import { ARM_RIG, FRAMES, FRAME_SIZE } from '../../game2d/art/keys';
import { type Ctx, rgba, rng } from '../../game2d/art/util';
import type { StoryLine } from '../../core/story';
import type { CutsceneCue } from '../types';

// Outils communs des cinématiques : repère virtuel (hauteur 400 unités, largeur selon l'écran), sprites
// pré-rendus sur des canvas hors écran à la construction, dessin sans allocation (setTransform + drawImage),
// courbes d'animation, aléatoire figé. Chaque image est une fonction pure du temps : un saut à n'importe
// quel instant (startAtS, aperçu ?t=) donne exactement la même image.

/** Hauteur du repère virtuel (unités) ; la largeur suit le format de l'écran. */
export const VH = 400;

export interface View {
  /** Taille du canvas (pixels). */
  readonly w: number;
  readonly h: number;
  /** Pixels par unité. */
  readonly k: number;
  /** Largeur en unités. */
  readonly vw: number;
  /** Mouvements réduits : pas de secousses, éclairs atténués. */
  readonly reduced: boolean;
  /** Bord gauche du bouton Passer (unités ; `vw` sans bouton) : il suit l'encoche (--sar), relu à chaque image. */
  readonly skipLeft: number;
}

/** Réplique (textes : core/story.ts). */
export type Line = StoryLine;

/** Événement de la chronologie, déclenché quand l'horloge atteint `t`. */
export interface CutsceneEvent {
  readonly t: number;
  readonly cue?: CutsceneCue;
  /** Réplique affichée dans la bulle (remplace la précédente). */
  readonly say?: Line;
  /** Cache la bulle. */
  readonly hide?: boolean;
  /** Texte posé dans le nœud aria-live (bandeaux dessinés sur le canvas). */
  readonly announce?: string;
}

/** Une cinématique : chronologie, calques construits pour une taille de vue, image en fonction du temps. */
export interface CutsceneScript {
  readonly duration: number;
  readonly events: readonly CutsceneEvent[];
  /** (Re)construit les calques pour cette vue (démarrage, changement de taille, police chargée). */
  build(view: View): void;
  /** Dessine l'image de l'instant `t` (s) : fonction pure du temps, sans allocation. */
  draw(ctx: Ctx, t: number, view: View): void;
  /** Libère les calques. */
  release(): void;
}

// ---------------------------------------------------------------- Courbes

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Avancement de 0 à 1 entre a et b. */
export function seg(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

export function easeOut(u: number): number {
  const x = 1 - clamp01(u);
  return 1 - x * x * x;
}

export function easeIn(u: number): number {
  const x = clamp01(u);
  return x * x * x;
}

/** Monte de 0 à 1 entre a et b, reste à 1, redescend entre c et d. */
export function window4(t: number, a: number, b: number, c: number, d: number): number {
  return smooth(seg(t, a, b)) * (1 - smooth(seg(t, c, d)));
}

/** Partie fractionnaire positive. */
export function fract(x: number): number {
  return x - Math.floor(x);
}

/** Valeurs aléatoires figées (particules, étoiles) : RAND[i & RAND_MASK]. */
export const RAND_MASK = 1023;
export const RAND = (() => {
  const r = rng(0x5eed);
  const a = new Float32Array(RAND_MASK + 1);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
})();

export function rand(i: number): number {
  return RAND[i & RAND_MASK];
}

/** Secousse déterministe (unités) : somme de sinus, amplitude `amp`. */
export function shakeX(t: number, amp: number): number {
  return amp * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4);
}

export function shakeY(t: number, amp: number): number {
  return amp * (Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.3 + 0.4) * 0.4);
}

// ---------------------------------------------------------------- Calques et sprites

export interface Sprite {
  readonly c: HTMLCanvasElement;
  /** Taille d'une image (unités) et ancre (unités, depuis le coin haut gauche de l'image). */
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
  /** Pixels par unité du canvas. */
  readonly res: number;
  /** Taille d'une image en pixels (planche horizontale). */
  readonly fw: number;
  readonly fh: number;
  readonly frames: number;
}

/** Côté maximal visé pour un sprite (px) ; canvas() borne à 4096 (limite sûre des navigateurs mobiles). */
const MAX_CANVAS = 4000;

/** Canvas hors écran (accéléré : copié à chaque image). */
export function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.min(4096, Math.ceil(w)));
  c.height = Math.max(1, Math.min(4096, Math.ceil(h)));
  const ctx = c.getContext('2d') as Ctx;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { c, ctx };
}

/**
 * Pré-rend un sprite de `frames` images de w x h unités (ancre ax, ay) à `res` pixels par unité. `draw` dessine
 * l'image `i` en unités, repère au coin haut gauche de l'image.
 */
export function makeSprite(
  w: number,
  h: number,
  ax: number,
  ay: number,
  res: number,
  draw: (ctx: Ctx, i: number) => void,
  frames = 1,
): Sprite {
  // Canvas de 4096 px au plus de côté (grands écrans) : résolution réduite plutôt qu'image coupée.
  const r = Math.min(res, MAX_CANVAS / (w * frames), MAX_CANVAS / h);
  const fw = Math.max(1, Math.ceil(w * r));
  const fh = Math.max(1, Math.ceil(h * r));
  const { c, ctx } = canvas(fw * frames, fh);
  for (let i = 0; i < frames; i++) {
    ctx.save();
    ctx.setTransform(r, 0, 0, r, i * fw, 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, i);
    ctx.restore();
  }
  return { c, w, h, ax, ay, res: r, fw, fh, frames };
}

/** Libère la mémoire d'un canvas hors écran. */
export function freeCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

export function freeSprite(s: Sprite | null | undefined): void {
  if (s) freeCanvas(s.c);
}

/**
 * Dessine l'image `frame` du sprite, ancre en (x, y) unités, échelle, rotation (rad), opacité ; `flip` retourne
 * horizontalement autour de l'ancre. Sans allocation.
 */
export function drawSprite(
  ctx: Ctx,
  s: Sprite,
  frame: number,
  x: number,
  y: number,
  scale: number,
  rot: number,
  alpha: number,
  k: number,
  flip = false,
): void {
  if (alpha <= 0.004 || scale <= 0.0001) return;
  const f = (k * scale) / s.res;
  const cs = Math.cos(rot) * f;
  const sn = Math.sin(rot) * f;
  const fx = flip ? -1 : 1;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.setTransform(cs * fx, sn * fx, -sn, cs, x * k, y * k);
  ctx.drawImage(s.c, frame * s.fw, 0, s.fw, s.fh, -s.ax * s.res, -s.ay * s.res, s.fw, s.fh);
}

/** Sprite étiré : largeur et hauteur à part (ouverture de la Faille, rayons). */
export function drawSpriteXY(
  ctx: Ctx,
  s: Sprite,
  x: number,
  y: number,
  sx: number,
  sy: number,
  rot: number,
  alpha: number,
  k: number,
): void {
  if (alpha <= 0.004 || Math.abs(sx) <= 0.0001 || sy <= 0.0001) return;
  const fx = (k * sx) / s.res;
  const fy = (k * sy) / s.res;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.setTransform(cs * fx, sn * fx, -sn * fy, cs * fy, x * k, y * k);
  ctx.drawImage(s.c, 0, 0, s.fw, s.fh, -s.ax * s.res, -s.ay * s.res, s.fw, s.fh);
}

/** Calque de fond (sans rotation ni échelle) : ancre en (x, y) unités, à l'échelle de la vue. */
export function drawLayer(ctx: Ctx, s: Sprite, x: number, y: number, alpha: number, k: number): void {
  if (alpha <= 0.004) return;
  const f = k / s.res;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.setTransform(f, 0, 0, f, (x - s.ax) * k, (y - s.ay) * k);
  ctx.drawImage(s.c, 0, 0);
}

/** Calque qui se répète horizontalement (étoiles qui défilent) : décalage `off` unités. */
export function drawLayerWrapped(ctx: Ctx, s: Sprite, off: number, y: number, alpha: number, k: number, vw: number): void {
  const W = s.w;
  let x = -fract(off / W) * W;
  while (x < vw) {
    drawLayer(ctx, s, x, y, alpha, k);
    x += W;
  }
}

/** Remplit toute la vue d'une couleur (fondus). */
export function fillView(ctx: Ctx, color: string, alpha: number, view: View): void {
  if (alpha <= 0.004) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, view.w, view.h);
}

/** Point lumineux doux (sprite de particule) : halo + cœur, couleur au choix. */
export function glowSprite(color: string, core: string, res: number, r = 16): Sprite {
  return makeSprite(r * 2, r * 2, r, r, res, (ctx) => {
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, rgba(core, 1));
    g.addColorStop(0.18, rgba(color, 0.85));
    g.addColorStop(0.45, rgba(color, 0.28));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r * 2, r * 2);
  });
}

// ---------------------------------------------------------------- Kaï

/** Images du corps de Kaï utilisées (planche du jeu) : repos, course, saut, chute. */
export const KAI = { idle0: 0, idle1: 1, run0: 2, jump: 8, fall: 9 } as const;
const KAI_FRAMES = 10;
/** Cadre d'une image de Kaï (unités) ; ancre au centre des pieds. */
const KAI_W = 108;
const KAI_H = 92;
const KAI_AX = 40;
const KAI_AY = 86;

/** Kaï avec son bras armé (pistolet laser, au repos) : images 0 à 9 de la planche du jeu, ancre aux pieds. */
export function buildKai(res: number): Sprite {
  const P = FRAME_SIZE.player;
  return makeSprite(
    KAI_W,
    KAI_H,
    KAI_AX,
    KAI_AY,
    res,
    (ctx, i) => {
      ctx.translate(KAI_AX - P.w / 2, KAI_AY - P.h);
      drawPlayerFrame(ctx, i);
      ctx.translate(P.w / 2, P.h);
      const sx = PLAYER_SHOULDER[i * 2] ?? ARM_RIG.shoulderX;
      const sy = PLAYER_SHOULDER[i * 2 + 1] ?? ARM_RIG.shoulderY;
      ctx.translate(sx - ARM_RIG.pivotX, sy - ARM_RIG.pivotY);
      drawArmFrame(ctx, 'laser', FRAMES.arm.rest);
    },
    KAI_FRAMES,
  );
}

/** Image de course à l'instant t (6 images, 12 par seconde). */
export function kaiRunFrame(t: number): number {
  return KAI.run0 + (Math.floor(t * 12) % 6);
}

/** Image de repos à l'instant t. */
export function kaiIdleFrame(t: number): number {
  return fract(t * 0.8) < 0.5 ? KAI.idle0 : KAI.idle1;
}

// ---------------------------------------------------------------- La Comète

/** Ancre de la Comète : sous ses pieds d'atterrissage (repère de drawShip, 192x112). */
const SHIP_AX = 96;
const SHIP_AY = 108;

export interface ShipSprites {
  readonly ship: Sprite;
  readonly flame: Sprite;
}

export function freeShip(s: ShipSprites | null | undefined): void {
  if (!s) return;
  freeSprite(s.ship);
  freeSprite(s.flame);
}

export function buildShip(res: number): ShipSprites {
  const ship = makeSprite(196, 114, SHIP_AX, SHIP_AY, res, (ctx) => drawShip(ctx));
  const F = FRAME_SIZE.shipFlame;
  const flame = makeSprite(F.w, F.h, F.w, F.h / 2, res, (ctx, i) => drawShipFlame(ctx, i), 2);
  return { ship, flame };
}

/**
 * Comète (ancre aux pieds) en (x, y), échelle, rotation ; flamme du réacteur d'intensité `thrust` (0 : éteinte),
 * qui vacille avec t. Nez vers la droite.
 */
export function drawShipAt(
  ctx: Ctx,
  s: ShipSprites,
  x: number,
  y: number,
  scale: number,
  rot: number,
  alpha: number,
  thrust: number,
  t: number,
  k: number,
): void {
  if (thrust > 0.02) {
    const lx = (SHIP_NOZZLE.x - SHIP_AX) * scale;
    const ly = (SHIP_NOZZLE.y - SHIP_AY) * scale;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const nx = x + lx * cs - ly * sn;
    const ny = y + lx * sn + ly * cs;
    const fl = thrust * (0.92 + 0.08 * Math.sin(t * 47));
    drawSpriteXY(ctx, s.flame, nx, ny, scale * fl * 1.15, scale * (0.8 + 0.2 * thrust), rot, alpha, k);
    // Seconde image de la flamme par-dessus, en alternance : scintillement.
    if (fract(t * 14) < 0.5) drawSprite(ctx, s.flame, 1, nx, ny, scale * fl, rot, alpha * 0.55, k);
  }
  drawSprite(ctx, s.ship, 0, x, y, scale, rot, alpha, k);
}
