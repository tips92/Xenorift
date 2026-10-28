import type Phaser from 'phaser';
import type { ThemeId, WeaponId } from '../../core/types';
import { drawDoor, drawInteractArrow, drawRoomWall } from './draw/doors';
import { drawArmored, drawFlyer, drawSpitter, drawSpore, drawWalker } from './draw/enemies';
import {
  drawBullet,
  drawCheckpoint,
  drawCrystal,
  drawMover,
  drawPowerRapid,
  drawPowerShield,
  drawPowerSpeed,
  drawPuff,
  drawShieldBubble,
  drawSpark,
} from './draw/items';
import { ARM_FRAME_COUNT, type ArmWeapon, PLAYER_FRAME_COUNT, drawArmFrame, drawPlayerFrame } from './draw/player';
import { drawShip, drawShipFlame } from './draw/ship';
import { drawTileset, tileRect } from './draw/tiles';
import { ANIM, ARM_TEX, BULLET_SIZE, BULLET_TEX, FRAMES, FRAME_SIZE, TEX, TILESET } from './keys';
import { createParallaxImpl } from './parallax';
import { buildSheet, registerCanvas } from './util';

// Module graphique du mode 2D : tout est dessiné par code (Canvas 2D), aucun fichier image.
// Les signatures exportées ne doivent pas changer.

export { SHIP_NOZZLE } from './draw/ship';
export { BG_TIMINGS } from './draw/backgrounds';
export { PLAYER_SHOULDER } from './draw/player';

/**
 * (Re)génère toutes les textures et animations de TEX / ANIM (voir ./keys.ts) pour le thème donné.
 * Supprime d'abord les textures/animations existantes de mêmes clés (changement de thème entre niveaux).
 */
export function generatePlatformArt(scene: Phaser.Scene, theme: ThemeId): void {
  // Animations d'abord (elles référencent les anciennes textures)
  for (const key of Object.values(ANIM)) {
    if (scene.anims.exists(key)) scene.anims.remove(key);
  }

  // --- Tileset
  registerCanvas(scene, TEX.tiles, drawTileset(theme), (tex) => {
    const total = TILESET.columns * TILESET.rows;
    for (let i = 0; i < total; i++) {
      const r = tileRect(i);
      tex.add(i, 0, r.x, r.y, 64, 64);
    }
  });

  // --- Personnage (identique dans les deux thèmes)
  const P = FRAME_SIZE.player;
  buildSheet(scene, TEX.player, P.w, P.h, PLAYER_FRAME_COUNT, (ctx, i) => drawPlayerFrame(ctx, i));
  // Bras armé : une planche (repos, recul) par arme
  const Am = FRAME_SIZE.arm;
  for (const weapon of Object.keys(ARM_TEX) as ArmWeapon[]) {
    buildSheet(scene, ARM_TEX[weapon], Am.w, Am.h, ARM_FRAME_COUNT, (ctx, i) => drawArmFrame(ctx, weapon, i));
  }

  // --- Ennemis (spécifiques au thème)
  const Wk = FRAME_SIZE.walker;
  buildSheet(scene, TEX.walker, Wk.w, Wk.h, 5, (ctx, i) => drawWalker(ctx, theme, i));
  const Fl = FRAME_SIZE.flyer;
  buildSheet(scene, TEX.flyer, Fl.w, Fl.h, 4, (ctx, i) => drawFlyer(ctx, theme, i));
  const Ar = FRAME_SIZE.armored;
  buildSheet(scene, TEX.armored, Ar.w, Ar.h, 4, (ctx, i) => drawArmored(ctx, theme, i));
  const Sp = FRAME_SIZE.spitter;
  buildSheet(scene, TEX.spitter, Sp.w, Sp.h, 3, (ctx, i) => drawSpitter(ctx, theme, i));
  buildSheet(scene, TEX.spore, 24, 24, 1, (ctx) => drawSpore(ctx, theme));

  // --- Objets
  // Projectiles de Kaï : un par arme (laser = TEX.laser), à la taille BULLET_SIZE
  for (const weapon of Object.keys(BULLET_TEX) as WeaponId[]) {
    const B = BULLET_SIZE[weapon];
    buildSheet(scene, BULLET_TEX[weapon], B.w, B.h, 1, (ctx) => drawBullet(ctx, weapon));
  }
  const Cr = FRAME_SIZE.crystal;
  buildSheet(scene, TEX.crystal, Cr.w, Cr.h, 6, (ctx, i) => drawCrystal(ctx, i));
  // Bonus : vitesse (bloc 1), bouclier (bloc 2), cadence (bloc 3)
  buildSheet(scene, TEX.powerSpeed, 48, 48, 1, (ctx) => drawPowerSpeed(ctx));
  buildSheet(scene, TEX.powerShield, 48, 48, 1, (ctx) => drawPowerShield(ctx));
  buildSheet(scene, TEX.powerRapid, 48, 48, 1, (ctx) => drawPowerRapid(ctx));
  buildSheet(scene, TEX.shieldBubble, 96, 96, 1, (ctx) => drawShieldBubble(ctx));
  const Ck = FRAME_SIZE.checkpoint;
  buildSheet(scene, TEX.checkpoint, Ck.w, Ck.h, 3, (ctx, i) => drawCheckpoint(ctx, i));
  buildSheet(scene, TEX.ship, 192, 112, 1, (ctx) => drawShip(ctx));
  const SF = FRAME_SIZE.shipFlame;
  buildSheet(scene, TEX.shipFlame, SF.w, SF.h, 2, (ctx, i) => drawShipFlame(ctx, i));
  buildSheet(scene, TEX.mover, 192, 32, 1, (ctx) => drawMover(ctx, theme));
  const Dr = FRAME_SIZE.door;
  buildSheet(scene, TEX.door, Dr.w, Dr.h, 2, (ctx, i) => drawDoor(ctx, theme, i));
  buildSheet(scene, TEX.interactArrow, 28, 24, 1, (ctx) => drawInteractArrow(ctx));
  buildSheet(scene, TEX.roomWall, 64, 64, 1, (ctx) => drawRoomWall(ctx, theme));
  buildSheet(scene, TEX.spark, 16, 16, 1, (ctx) => drawSpark(ctx));
  buildSheet(scene, TEX.puff, 32, 32, 1, (ctx) => drawPuff(ctx));

  // --- Animations
  const frames = (key: string, list: readonly number[]) => list.map((f) => ({ key, frame: f }));
  const anim = (key: string, tex: string, list: readonly number[], frameRate: number, loop: boolean) => {
    scene.anims.create({ key, frames: frames(tex, list), frameRate, repeat: loop ? -1 : 0 });
  };
  anim(ANIM.playerIdle, TEX.player, FRAMES.player.idle, 3, true);
  anim(ANIM.playerRun, TEX.player, FRAMES.player.run, 12, true);
  anim(ANIM.playerJump, TEX.player, [FRAMES.player.jump], 1, false);
  anim(ANIM.playerFall, TEX.player, [FRAMES.player.fall], 1, false);
  anim(ANIM.playerHurt, TEX.player, [FRAMES.player.hurt], 1, false);
  anim(ANIM.playerCrouch, TEX.player, [FRAMES.player.crouch], 1, false);
  anim(ANIM.playerCrouchShoot, TEX.player, [FRAMES.player.crouchShoot], 1, false);
  anim(ANIM.playerCrawl, TEX.player, FRAMES.player.crawl, 6, true);
  anim(ANIM.walkerWalk, TEX.walker, FRAMES.walker.walk, 8, true);
  anim(ANIM.flyerFly, TEX.flyer, FRAMES.flyer.fly, 8, true);
  anim(ANIM.armoredWalk, TEX.armored, FRAMES.armored.walk, 8, true);
  anim(ANIM.spitterIdle, TEX.spitter, FRAMES.spitter.idle, 3, true);
  anim(ANIM.spitterShoot, TEX.spitter, [FRAMES.spitter.shoot], 1, false);
  anim(ANIM.crystalSpin, TEX.crystal, FRAMES.crystal.spin, 10, true);
  anim(ANIM.checkpointOn, TEX.checkpoint, FRAMES.checkpoint.on, 6, true);
  anim(ANIM.shipFlame, TEX.shipFlame, FRAMES.shipFlame.burn, 14, true);
}

export interface ParallaxHandle {
  /** À appeler à chaque frame ; lit la position de scene.cameras.main. */
  update(time: number, delta: number): void;
  /** Taille logique de la vue après changement d'orientation / de fenêtre. */
  resize(width: number, height: number): void;
  destroy(): void;
}

/**
 * Crée l'arrière-plan à défilement parallaxe du thème (ciel galactique, planètes, silhouettes,
 * monstres géants qui bougent au loin, végétation proche), avec des depth entre DEPTH.parallaxFar
 * et DEPTH.parallaxNear.
 */
export function createParallax(scene: Phaser.Scene, theme: ThemeId): ParallaxHandle {
  return createParallaxImpl(scene, theme);
}
