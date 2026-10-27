import type * as Phaser from 'phaser';
import { TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { MoverSpawn } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';
import { MOVER_PERIOD_S, MOVER_TRAVEL } from './tuning';

// Plateformes mobiles (3 tuiles) : corps Arcade immobiles déplacés par leur vitesse.
// La vitesse est recalculée à CHAQUE pas de physique pour suivre exactement une trajectoire adoucie :
// Arcade transporte alors Kaï sans à-coups (report du déplacement horizontal, vitesse verticale recopiée).

const MOVER_W = 3 * TILE;
const MOVER_BODY_H = 28;

interface Mover {
  img: Phaser.Physics.Arcade.Image;
  body: Phaser.Physics.Arcade.Body;
  x0: number;
  y0: number;
  vertical: boolean;
}

/** Décalage le long du trajet à l'instant t (0 → MOVER_TRAVEL → 0, en cosinus). */
function offsetAt(t: number): number {
  return (MOVER_TRAVEL * (1 - Math.cos((t / MOVER_PERIOD_S) * Math.PI * 2))) / 2;
}

export class Movers {
  readonly images: Phaser.Physics.Arcade.Image[] = [];
  private readonly list: Mover[] = [];
  private time = 0;

  constructor(scene: PlatformScene, spawns: readonly MoverSpawn[]) {
    for (const s of spawns) {
      const x0 = s.col * TILE;
      const y0 = s.row * TILE;
      const img = scene.physics.add.image(x0, y0, TEX.mover);
      img.setOrigin(0, 0).setDepth(DEPTH.tiles);
      const body = img.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.pushable = false;
      body.setSize(MOVER_W, MOVER_BODY_H, false);
      body.setOffset(0, 0);
      // Plateforme traversable : seul le dessus bloque.
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
      body.setFriction(1, 0);
      body.updateFromGameObject();
      this.images.push(img);
      this.list.push({ img, body, x0, y0, vertical: s.vertical });
    }
  }

  /** Vitesse du tout premier pas. */
  prime(delta: number): void {
    this.applyVelocities(delta);
  }

  /** Appelé après chaque pas de physique (événement WORLD_STEP) : vitesse pour le pas suivant. */
  step(delta: number): void {
    this.time += delta;
    this.applyVelocities(delta);
  }

  private applyVelocities(delta: number): void {
    const target = offsetAt(this.time + delta);
    for (let i = 0; i < this.list.length; i++) {
      const m = this.list[i];
      const b = m.body;
      if (m.vertical) {
        b.velocity.x = 0;
        b.velocity.y = (m.y0 - target - b.y) / delta;
      } else {
        b.velocity.x = (m.x0 + target - b.x) / delta;
        b.velocity.y = 0;
      }
    }
  }
}
