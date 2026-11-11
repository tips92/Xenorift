import type { Ctx } from './util';

// Poses de Kaï en PNG (exception : le reste du jeu reste dessiné). Planches à 4× du cadre jeu,
// sans écart : corps 15 × 256×320, bras 2 × 256×128. Réduites dans 64×80 et 64×32.
// Le bras n'a pas d'arme : le canon reste dessiné (drawArmFrame) à la main (mains.txt = HAND_X/Y).
// Épaules : art/sprites/kai/epaules.txt, repère du jeu (centre des pieds, y < 0 vers le haut).

const BODY_FRAMES = 15;
const BODY_SRC_W = 256;
const BODY_SRC_H = 320;
const ARM_SRC_W = 256;
const ARM_SRC_H = 128;

const bodyUrl = new URL('../../../art/sprites/kai/planche.png', import.meta.url).href;
const armUrl = new URL('../../../art/sprites/kai/planche-bras.png', import.meta.url).href;

/** Épaule proche de chaque frame du corps (même ordre que FRAMES.player). */
export const PNG_SHOULDER: readonly number[] = [
  1.3, -40.1, 1.3, -40.7, 3.9, -40.3, 3.9, -38.5, 3.9, -38.2, 3.9, -40.3, 3.9, -38.5, 3.9, -38.2, 2.8, -39.6,
  -2.5, -38.9, -5.9, -37.9, 9.0, -30.9, 9.0, -30.9, 9.2, -27.5, 9.2, -27.5,
];

let body: HTMLImageElement | null = null;
let arm: HTMLImageElement | null = null;
let pending: Promise<boolean> | null = null;
let failed = false;

export function kaiPngActive(): boolean {
  return body !== null && arm !== null;
}

/** Abscisse d'épaule de la frame, ou null si les PNG ne sont pas chargés. */
export function pngShoulderX(frame: number): number | null {
  if (!body) return null;
  const v = PNG_SHOULDER[frame * 2];
  return v === undefined ? null : v;
}

/** Ordonnée d'épaule de la frame, ou null si les PNG ne sont pas chargés. */
export function pngShoulderY(frame: number): number | null {
  if (!body) return null;
  const v = PNG_SHOULDER[frame * 2 + 1];
  return v === undefined ? null : v;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

/** Charge les deux planches. Une fois raté, le dessin de draw/player.ts sert de repli. */
export function ensureKaiSprites(): Promise<boolean> {
  if (body && arm) return Promise.resolve(true);
  if (failed) return Promise.resolve(false);
  if (!pending) {
    pending = Promise.all([loadImage(bodyUrl), loadImage(armUrl)])
      .then(([b, a]) => {
        if (b.naturalWidth !== BODY_FRAMES * BODY_SRC_W || b.naturalHeight !== BODY_SRC_H) {
          throw new Error(`planche ${b.naturalWidth}x${b.naturalHeight}`);
        }
        if (a.naturalWidth !== 2 * ARM_SRC_W || a.naturalHeight !== ARM_SRC_H) {
          throw new Error(`bras ${a.naturalWidth}x${a.naturalHeight}`);
        }
        body = b;
        arm = a;
        return true;
      })
      .catch((err: unknown) => {
        failed = true;
        pending = null;
        console.error('[kai] sprites PNG inutilisables, dessin de repli', err);
        return false;
      });
  }
  return pending;
}

/** Colle la frame du corps (64×80) dans le repère courant. Faux si le PNG n'est pas là. */
export function drawPngBody(ctx: Ctx, frame: number, w: number, h: number): boolean {
  if (!body) return false;
  const i = frame >= 0 && frame < BODY_FRAMES ? frame : 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(body, i * BODY_SRC_W, 0, BODY_SRC_W, BODY_SRC_H, 0, 0, w, h);
  return true;
}

/** Colle le bras (64×32, repos ou recul) dans le repère courant. Faux si le PNG n'est pas là. */
export function drawPngArm(ctx: Ctx, frame: number, w: number, h: number): boolean {
  if (!arm) return false;
  const i = frame === 1 ? 1 : 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(arm, i * ARM_SRC_W, 0, ARM_SRC_W, ARM_SRC_H, 0, 0, w, h);
  return true;
}
