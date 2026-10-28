import type { WeaponId } from '../core/types';
import { drawArmFrame, drawPlayerFrame, PLAYER_SHOULDER } from '../game2d/art/draw/player';
import { drawShip, drawShipFlame, SHIP_NOZZLE } from '../game2d/art/draw/ship';
import { ARM_RIG, FRAMES, FRAME_SIZE } from '../game2d/art/keys';
import { type Ctx, fillOutlined, glow, glowDot, linGrad, poly, roundRect } from '../game2d/art/util';
import { prefersReducedMotion } from './dom';

// Aperçu du hangar (docs/plans/03-hangar.md, point 7) : un canvas 2D dessiné avec les fonctions du jeu 2D
// (Kaï et son bras armé, la Comète de profil), sans Phaser ni three (imports de valeurs : dessins purs).
// Chargé à la demande par l'écran du hangar : hors du bundle de l'accueil. Redessiné seulement quand la scène,
// la taille ou l'étape d'animation changent ; animation (Kaï au repos, flamme du réacteur) arrêtée écran fermé,
// page cachée ou mouvements réduits.

/** Kaï debout, l'arme en main. */
export interface KaiView {
  readonly kind: 'kai';
  readonly weapon: WeaponId;
}

/** La Comète posée, avec ses modules (niveaux achetés). */
export interface ShipView {
  readonly kind: 'ship';
  /** 0 = canon léger (invisible), 1 = mitrailleuse (deux canons sous les ailes), 2-3 = bagues d'amélioration. */
  readonly gun: number;
  /** Bouclier renforcé 0-2 : bulle autour du vaisseau. */
  readonly shield: number;
  /** Turbo 0-2 : flamme plus longue. */
  readonly boost: number;
}

export type PreviewView = KaiView | ShipView;

export interface HangarPreview {
  /** Change la scène (redessinée seulement si elle change). */
  show(view: PreviewView): void;
  /** Effet d'achat ou d'équipement : tir de Kaï, poussée du réacteur. */
  pulse(): void;
  /** Animation en marche (écran affiché) ou arrêtée ; arrêtée aussi tant que la page est cachée. */
  setActive(on: boolean): void;
  dispose(): void;
}

/** Netteté : rapport de pixels borné (coût du dessin). */
const MAX_DPR = 2;
/** Pas d'animation (ms) : Kaï (repos tous les 4 pas, tir tous les 24), flamme de la Comète (chaque pas). */
const STEP_MS = { kai: 130, ship: 110 } as const;
const PULSE_MS = { kai: 170, ship: 420 } as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Kaï : origine aux pieds ; corps (casque vers y = -72), bras armé (fusil et éclair compris) et socle. */
const KAI_BOX: Box = { x: -44, y: -80, w: 112, h: 90 };
/** Comète : repère de sa frame (192x112) ; flamme du turbo à gauche, bulle du bouclier autour. */
const SHIP_BOX: Box = { x: -46, y: -2, w: 250, h: 124 };
/** Marge autour de la scène (fraction de la place disponible). */
const FILL = 0.94;

const OUT = '#120c24';
const CYAN = '#3ff0ff';

/** Socle lumineux du hangar sous les pieds de Kaï (origine aux pieds). */
function drawPad(c: Ctx): void {
  c.save();
  c.translate(0, 1);
  c.scale(1, 0.2);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 40);
  g.addColorStop(0, 'rgba(63,247,255,0.42)');
  g.addColorStop(1, 'rgba(63,247,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 40, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.lineWidth = 1.2;
  c.strokeStyle = 'rgba(63,247,255,0.75)';
  c.beginPath();
  c.ellipse(0, 1, 27, 4.6, 0, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = 'rgba(63,247,255,0.35)';
  c.beginPath();
  c.ellipse(0, 1, 16, 2.7, 0, 0, Math.PI * 2);
  c.stroke();
}

/** Canon de la mitrailleuse : corps de (x, y = axe) sur `len`, canon vers +x, une bague cyan par amélioration. */
function drawGun(c: Ctx, x: number, y: number, len: number, level: number, far: boolean): void {
  const body = roundRect(x, y - 4, len, 8, 4);
  fillOutlined(
    c,
    body,
    linGrad(c, 0, y - 4, 0, y + 4, far ? [[0, '#7d86ac'], [1, '#2a2e48']] : [[0, '#f2f5ff'], [0.55, '#a9b1d6'], [1, '#4f5780']]),
    OUT,
    2,
  );
  const bx = x + len - 3;
  fillOutlined(
    c,
    roundRect(bx, y - 2.1, 19, 4.2, 1.6),
    linGrad(c, 0, y - 2, 0, y + 2, far ? [[0, '#8e97bd'], [1, '#3b4166']] : [[0, '#e6ebfa'], [1, '#6a7298']]),
    OUT,
    1.6,
  );
  // Bande lumineuse du corps
  c.strokeStyle = far ? 'rgba(63,240,255,0.4)' : 'rgba(63,240,255,0.85)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x + 4, y + 0.5);
  c.lineTo(x + len - 6, y + 0.5);
  c.stroke();
  // Bagues des améliorations (niveaux 2 et 3)
  c.fillStyle = far ? 'rgba(63,240,255,0.55)' : CYAN;
  for (let i = 1; i < level; i++) c.fillRect(bx + 4 + (i - 1) * 5, y - 2.3, 2, 4.6);
  if (!far) glowDot(c, bx + 19.5, y, level >= 3 ? 1.9 : 1.4, CYAN);
}

/** Bulle du bouclier renforcé (niveau 1 : un anneau ; 2 : deux, plus lumineux). */
function drawBubble(c: Ctx, level: number): void {
  const cx = 96;
  const cy = 60;
  const rx = 106;
  const ry = 58;
  c.save();
  c.translate(cx, cy);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, rx * 0.35, 0, 0, rx);
  g.addColorStop(0, 'rgba(63,247,255,0)');
  g.addColorStop(0.8, `rgba(63,247,255,${0.03 + 0.03 * level})`);
  g.addColorStop(1, `rgba(120,250,255,${0.12 + 0.08 * level})`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
  glow(c, CYAN, 8, () => {
    c.strokeStyle = `rgba(150,250,255,${0.35 + 0.2 * level})`;
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.stroke();
    if (level >= 2) {
      c.strokeStyle = 'rgba(150,250,255,0.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(cx, cy, rx - 7, ry - 5, 0, 0, Math.PI * 2);
      c.stroke();
    }
  });
  // Reflet
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(cx, cy, rx - 12, ry - 9, 0, Math.PI * 1.12, Math.PI * 1.42);
  c.stroke();
}

/** Comète sans sa flamme : canon lointain (caché en partie par la coque), vaisseau, canon proche, bouclier. */
function drawShipBody(c: Ctx, v: ShipView): void {
  if (v.gun > 0) drawGun(c, 94, 77.5, 30, v.gun, true);
  drawShip(c);
  if (v.gun > 0) {
    // Support sous l'aile proche
    fillOutlined(c, poly([84, 79, 97, 77, 96, 87.5, 85, 87.5]), linGrad(c, 0, 77, 0, 88, [[0, '#c9d0ea'], [1, '#6a7298']]), OUT, 1.8);
    drawGun(c, 70, 90, 34, v.gun, false);
  }
  if (v.shield > 0) drawBubble(c, v.shield);
}

function sameView(a: PreviewView | null, b: PreviewView): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'kai') return b.kind === 'kai' && a.weapon === b.weapon;
  return b.kind === 'ship' && a.gun === b.gun && a.shield === b.shield && a.boost === b.boost;
}

const NOOP: HangarPreview = { show() {}, pulse() {}, setActive() {}, dispose() {} };

/** Crée l'aperçu dans `host` (le canvas en remplit toute la surface, voir .hg-canvas de styles.css). */
export function createHangarPreview(host: HTMLElement): HangarPreview {
  const canvas = document.createElement('canvas');
  canvas.className = 'hg-canvas-el';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return NOOP;
  host.append(canvas);
  // Calque de la Comète (coque, canons, bouclier) : redessiné seulement si la taille ou les modules changent.
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');

  const reduced = prefersReducedMotion();
  let view: PreviewView | null = null;
  let W = 0;
  let H = 0;
  let layerKey = '';
  let active = false;
  let running = false;
  let disposed = false;
  let raf = 0;
  let step = 0;
  /** frameKey() de la dernière image dessinée. */
  let drawnKey = -1;
  let pulseUntil = 0;
  let warned = false;
  // Mise à l'échelle courante (pixels du canvas par unité de la scène) et origine.
  let fk = 1;
  let fox = 0;
  let foy = 0;

  function fit(box: Box): void {
    fk = Math.max(0.01, Math.min(W / box.w, H / box.h) * FILL);
    fox = (W - box.w * fk) / 2 - box.x * fk;
    foy = (H - box.h * fk) / 2 - box.y * fk;
  }

  function prep(c: Ctx): void {
    c.setTransform(fk, 0, 0, fk, fox, foy);
    c.lineJoin = 'round';
    c.lineCap = 'round';
  }

  function renderKai(c: Ctx, v: KaiView, now: number): void {
    fit(KAI_BOX);
    prep(c);
    const key = frameKey();
    const idle = key & 1;
    const shoot = now < pulseUntil || (key & 2) !== 0;
    drawPad(c);
    const P = FRAME_SIZE.player;
    c.save();
    c.translate(-P.w / 2, -P.h);
    drawPlayerFrame(c, idle);
    c.restore();
    const sx = PLAYER_SHOULDER[idle * 2] ?? ARM_RIG.shoulderX;
    const sy = PLAYER_SHOULDER[idle * 2 + 1] ?? ARM_RIG.shoulderY;
    c.save();
    c.translate(sx - ARM_RIG.pivotX, sy - ARM_RIG.pivotY);
    drawArmFrame(c, v.weapon, shoot ? FRAMES.arm.recoil : FRAMES.arm.rest);
    c.restore();
  }

  function renderShip(c: Ctx, v: ShipView, now: number): void {
    fit(SHIP_BOX);
    // Flamme (derrière la coque) : plus longue avec le turbo, poussée brève à l'achat.
    let k = 0.6 + 0.15 * Math.max(0, Math.min(2, v.boost));
    if (now < pulseUntil) k += (0.25 * (pulseUntil - now)) / PULSE_MS.ship;
    prep(c);
    c.save();
    c.translate(SHIP_NOZZLE.x, SHIP_NOZZLE.y);
    c.scale(k, k);
    c.translate(-FRAME_SIZE.shipFlame.w, -FRAME_SIZE.shipFlame.h / 2);
    drawShipFlame(c, frameKey());
    c.restore();
    if (!lctx) {
      drawShipBody(c, v);
      return;
    }
    const key = `${W}x${H}|${v.gun}|${v.shield}`;
    if (key !== layerKey) {
      layerKey = key;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      prep(lctx);
      drawShipBody(lctx, v);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(layer, 0, 0);
  }

  /** Image à afficher pour le pas courant : Kaï (repos 0/1, tir), flamme (0/1). Rien d'autre ne bouge. */
  function frameKey(): number {
    if (reduced || !view) return 0;
    return view.kind === 'kai' ? ((step >> 2) & 1) | (step % 24 === 22 ? 2 : 0) : step & 1;
  }

  function render(now: number): void {
    if (disposed || !ctx || !view || W < 2 || H < 2) return;
    drawnKey = frameKey();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    try {
      if (view.kind === 'kai') renderKai(ctx, view, now);
      else renderShip(ctx, view, now);
    } catch (err) {
      // Aperçu décoratif : une erreur de dessin ne doit pas bloquer le hangar.
      if (!warned) console.error('[hangar] aperçu', err);
      warned = true;
    }
  }

  function tick(now: number): void {
    raf = 0;
    if (!running || !view) return;
    step = Math.floor(now / STEP_MS[view.kind]);
    if (frameKey() !== drawnKey || now < pulseUntil + 40) render(now);
    raf = requestAnimationFrame(tick);
  }

  /** Boucle d'animation : seulement écran affiché, page visible et mouvements non réduits. */
  function sync(): void {
    const want = active && !disposed && !reduced && !document.hidden && view !== null;
    if (want === running) return;
    running = want;
    if (running) {
      raf = requestAnimationFrame(tick);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /**
   * Taille du canvas = celle de `host` × rapport de pixels ; redessine si elle a changé (renvoie true). Taille de
   * mise en page (clientWidth) : l'écran entre avec une légère mise à l'échelle, que ResizeObserver ne signale pas.
   */
  function resize(): boolean {
    if (disposed) return false;
    const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(host.clientWidth * dpr);
    const h = Math.round(host.clientHeight * dpr);
    if (w === W && h === H) return false;
    W = w;
    H = h;
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    if (lctx) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
    layerKey = '';
    render(performance.now());
    return true;
  }

  const onResize = (): void => {
    resize();
  };
  const onVisibility = (): void => sync();
  document.addEventListener('visibilitychange', onVisibility);
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(onResize);
    observer.observe(host);
  } else {
    window.addEventListener('resize', onResize);
  }

  return {
    show(next: PreviewView): void {
      if (disposed || sameView(view, next)) return;
      view = next;
      pulseUntil = 0;
      if (!resize()) render(performance.now());
      sync();
    },
    pulse(): void {
      if (disposed || !view) return;
      const now = performance.now();
      if (running) {
        pulseUntil = now + PULSE_MS[view.kind];
      } else if (view.kind === 'kai' && !reduced) {
        // Hors boucle (écran pas encore affiché) : tir figé un instant.
        pulseUntil = now + PULSE_MS.kai;
        render(now);
        window.setTimeout(() => render(performance.now()), PULSE_MS.kai + 20);
      }
    },
    setActive(on: boolean): void {
      active = on;
      if (on) resize();
      sync();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', onResize);
      // Le canvas garde sa dernière image pendant le fondu de sortie de l'écran ; le calque est libéré.
      layer.width = 1;
      layer.height = 1;
    },
  };
}
