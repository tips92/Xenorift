import type Phaser from 'phaser';
import { PLAYER_FRAME_COUNT } from './draw/player';
import { FRAME_SIZE, TEX } from './keys';
import { FRAME_GAP, makeCanvas, registerCanvas } from './util';

// Planche du corps venue du .glb. Tant qu'elle est absente, generatePlatformArt dessine Kaï par le code.

let sheet: HTMLCanvasElement | null = null;

/** Vrai une fois le .glb rendu : le corps ne change pas de pose, le bras armé reste accroché à l'épaule debout. */
export function kaiModelActive(): boolean {
  return sheet !== null;
}

/** Recopie une frame 64×80 sur les 15 poses (marche, saut, accroupi : la même image, en attendant le squelette). */
export function installKaiFrame(frame: HTMLCanvasElement): void {
  const { w, h } = FRAME_SIZE.player;
  const { canvas, ctx } = makeCanvas(PLAYER_FRAME_COUNT * w + (PLAYER_FRAME_COUNT - 1) * FRAME_GAP, h);
  for (let i = 0; i < PLAYER_FRAME_COUNT; i++) ctx.drawImage(frame, i * (w + FRAME_GAP), 0);
  sheet = canvas;
}

/** Enregistre la planche à la place du corps dessiné. Renvoie faux si aucun modèle n'a été rendu. */
export function mountKaiSheet(scene: Phaser.Scene): boolean {
  if (!sheet) return false;
  const { w, h } = FRAME_SIZE.player;
  registerCanvas(scene, TEX.player, sheet, (tex) => {
    for (let i = 0; i < PLAYER_FRAME_COUNT; i++) tex.add(i, 0, i * (w + FRAME_GAP), 0, w, h);
  });
  return true;
}
