import type * as Phaser from 'phaser';
import { ANIM, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { Player } from './Player';
import type { PlatformScene } from './PlatformScene';

// La Comète garée en fin de niveau : Kaï y grimpe, le réacteur s'allume, le vaisseau décolle
// et sort de l'écran en haut à droite (~2,6 s) avant l'écran de résultats.

const SHIP_W = 192;
const SHIP_H = 112;
/** Tuyère (arrière du vaisseau, nez vers la droite), relative au point bas-centre du vaisseau
 *  (frame 192x112 : tuyère en (11, 58), cf. dessin de la Comète). La flamme pointe vers la gauche. */
const NOZZLE_X = 11 - SHIP_W / 2;
const NOZZLE_Y = 58 - SHIP_H;

export class ExitShip {
  readonly ship: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Sprite;
  readonly x: number;
  readonly baseY: number;
  private launched = false;

  /** (col, row) = case du 'X' : le vaisseau occupe 3x2 tuiles à droite et au-dessus, posé sur le sol. */
  constructor(
    private readonly scene: PlatformScene,
    col: number,
    row: number,
  ) {
    this.x = col * TILE + SHIP_W / 2;
    this.baseY = (row + 1) * TILE;
    this.ship = scene.add.image(this.x, this.baseY, TEX.ship);
    this.ship.setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.flame = scene.add.sprite(this.x + NOZZLE_X, this.baseY + NOZZLE_Y, TEX.shipFlame, 0);
    this.flame.setOrigin(1, 0.5).setDepth(DEPTH.items - 1).setVisible(false);
  }

  /** Kaï touche-t-il le vaisseau ? */
  touches(p: Player): boolean {
    return (
      !this.launched &&
      p.right > this.x - SHIP_W / 2 + 16 &&
      p.left < this.x + SHIP_W / 2 - 16 &&
      p.feetY > this.baseY - SHIP_H + 8 &&
      p.top < this.baseY
    );
  }

  /** Suit le vaisseau avec la flamme (appelé à chaque frame après la physique). */
  syncFlame(): void {
    if (!this.flame.visible) return;
    const r = this.ship.rotation;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    this.flame.setPosition(
      this.ship.x + NOZZLE_X * cos - NOZZLE_Y * sin,
      this.ship.y + NOZZLE_X * sin + NOZZLE_Y * cos,
    );
    this.flame.rotation = r;
  }

  /** Séquence de décollage ; onDone est appelé à la fin (pause et arrêt de la scène respectés). */
  launch(player: Player, onDone: () => void): void {
    if (this.launched) return;
    this.launched = true;
    const scene = this.scene;
    const spr = player.sprite;

    // 1. Kaï saute dans le cockpit.
    player.freeze();
    player.shield = false;
    player.bubble.setVisible(false);
    player.playAnim(ANIM.playerJump);
    const sx = spr.x;
    const sy = spr.y;
    const tx = this.x + 12;
    const ty = this.baseY - 64;
    spr.flipX = tx < sx;
    spr.setAlpha(1).setScale(1);
    scene.playSfx('jump');
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 520,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        spr.x = sx + (tx - sx) * k;
        spr.y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 84;
      },
      onComplete: () => {
        scene.tweens.add({
          targets: spr,
          scaleX: 0.25,
          scaleY: 0.25,
          alpha: 0,
          duration: 170,
          ease: 'Quad.easeIn',
          onComplete: () => player.hide(),
        });
      },
    });

    // 2. Allumage du réacteur.
    scene.time.delayedCall(740, () => {
      this.flame.setVisible(true).setScale(0.2);
      this.syncFlame();
      if (scene.anims.exists(ANIM.shipFlame)) this.flame.anims.play(ANIM.shipFlame);
      scene.tweens.add({ targets: this.flame, scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
      scene.playSfx('takeoff');
      scene.vibrate(90);
      scene.cameras.main.shake(700, 0.0035);
      scene.fx.trail.startFollow(this.flame, -18, 0);
      scene.fx.trail.start();
    });

    // 3. Vol stationnaire.
    scene.time.delayedCall(980, () => {
      scene.tweens.add({ targets: this.ship, y: this.baseY - 48, duration: 620, ease: 'Sine.easeInOut' });
    });

    // 4. La caméra lâche le vaisseau qui file en haut à droite.
    scene.time.delayedCall(1560, () => {
      scene.cameras.main.stopFollow();
      scene.tweens.add({
        targets: this.ship,
        x: this.x + 1800,
        y: this.baseY - 950,
        angle: -17,
        duration: 1100,
        ease: 'Cubic.easeIn',
      });
      scene.tweens.add({ targets: this.flame, scaleX: 1.45, scaleY: 1.2, duration: 400, ease: 'Quad.easeOut' });
    });

    scene.time.delayedCall(2620, () => {
      scene.fx.trail.stop();
      onDone();
    });
  }
}
