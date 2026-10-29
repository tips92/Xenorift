import type * as Phaser from 'phaser';
import { FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { GridPos } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';

// Champignons 'o' (plan 04, point 15) : cases pleines de la grille et du calque (tuile cachée), dessinées par un
// sprite chacun, animé à la main (pause et perte de contexte comprises). Le rebond lui-même est dans
// Player.controlUpdate (atterrissage, ou marche, sur un champignon).

const IDLE_FPS = 5;
const BOUNCE_FPS = 16;

interface Mushroom {
  readonly img: Phaser.GameObjects.Image;
  /** Décalage de la lueur au repos (ms), pour qu'ils ne pulsent pas tous ensemble. */
  readonly phase: number;
  /** Rebond en cours (ms écoulées), -1 au repos. */
  bounceMs: number;
  frame: number;
}

export class Mushrooms {
  /** Lu par les tests : un par case 'o', dans l'ordre de ParsedLevel.mushrooms. */
  readonly list: Mushroom[] = [];
  /** Index dans `list` + 1 par case (0 : pas de champignon). */
  private readonly byCell: Int16Array;
  private clockMs = 0;
  /** Rebonds depuis le départ (tests). */
  bounces = 0;
  lastHeld = false;

  constructor(
    private readonly scene: PlatformScene,
    spots: readonly GridPos[],
  ) {
    const grid = scene.grid;
    this.byCell = new Int16Array(grid.cols * grid.rows);
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const tile = scene.layer.getTileAt(s.col, s.row);
      if (tile) tile.setVisible(false);
      const img = scene.add.image(s.col * TILE + TILE / 2, (s.row + 1) * TILE, TEX.mushroom, FRAMES.mushroom.idle[0]);
      img.setOrigin(0.5, 1).setDepth(DEPTH.tiles + 1);
      this.list.push({ img, phase: ((s.col * 7 + s.row * 3) % 4) * (1000 / IDLE_FPS), bounceMs: -1, frame: FRAMES.mushroom.idle[0] });
      this.byCell[s.row * grid.cols + s.col] = i + 1;
    }
  }

  at(col: number, row: number): boolean {
    const g = this.scene.grid;
    if (col < 0 || col >= g.cols || row < 0 || row >= g.rows) return false;
    return this.byCell[row * g.cols + col] > 0;
  }

  /** Kaï rebondit sur la case (col, row) : écrasement puis détente, son, poussière. */
  bounce(col: number, row: number, held: boolean): void {
    const k = this.at(col, row) ? this.byCell[row * this.scene.grid.cols + col] - 1 : -1;
    if (k < 0) return;
    const m = this.list[k];
    m.bounceMs = 0;
    this.setFrame(m, FRAMES.mushroom.bounce[0]);
    this.bounces++;
    this.lastHeld = held;
    const scene = this.scene;
    scene.playSfx('mushroomBounce', held ? 1 : 0.85, held ? 1.08 : 1);
    scene.fx.puff(m.img.x, m.img.y - TILE + 4, 3);
    scene.vibrate(18);
  }

  /** Un boss le heurte (Scarabée-titan) : même écrasement, poussière ; ni rebond compté, ni vibration. */
  squash(col: number, row: number): void {
    const k = this.at(col, row) ? this.byCell[row * this.scene.grid.cols + col] - 1 : -1;
    if (k < 0) return;
    const m = this.list[k];
    m.bounceMs = 0;
    this.setFrame(m, FRAMES.mushroom.bounce[0]);
    this.scene.playSfx('mushroomBounce', 0.45, 0.8);
    this.scene.fx.puff(m.img.x, m.img.y - TILE / 2, 3);
  }

  update(dtMs: number): void {
    this.clockMs += dtMs;
    const idle = FRAMES.mushroom.idle;
    const bounce = FRAMES.mushroom.bounce;
    for (let i = 0; i < this.list.length; i++) {
      const m = this.list[i];
      if (m.bounceMs >= 0) {
        m.bounceMs += dtMs;
        const f = Math.floor((m.bounceMs * BOUNCE_FPS) / 1000);
        if (f < bounce.length) {
          this.setFrame(m, bounce[f]);
          continue;
        }
        m.bounceMs = -1;
      }
      this.setFrame(m, idle[Math.floor(((this.clockMs + m.phase) * IDLE_FPS) / 1000) % idle.length]);
    }
  }

  private setFrame(m: Mushroom, f: number): void {
    if (m.frame === f) return;
    m.frame = f;
    m.img.setFrame(f);
  }
}
