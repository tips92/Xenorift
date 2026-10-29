import type * as Phaser from 'phaser';
import { FRAMES, TEX, TILE_FRAME } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import { CELL_SOLID } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';

// Tronc abattu par la secousse (plan 04, point 14) : debout, c'est un décor sans collision (4 x 4 cases, souche
// sur sa case de gauche) ; la secousse le fait trembler puis tomber vers la droite ; couché, il devient un obstacle
// plein : souche (1 case) et fût (3 x 2 cases à sa droite), posés dans la grille ET le calque (collision et faces à
// la main, comme les barrières d'arène). Animé à la main sur l'horloge de la scène.

export type TrunkState = 'stand' | 'tremble' | 'fall' | 'down';

const TREMBLE_MS = 700;
const TREMBLE_FPS = 14;
const FALL_FPS = 12;

export class FallingTrunk {
  state: TrunkState = 'stand';
  readonly img: Phaser.GameObjects.Image;
  /** Souche (case vide de la carte, sur un sol plein). */
  readonly col: number;
  readonly row: number;
  private ms = 0;
  private frame: number = FRAMES.trunk.stand;

  constructor(
    private readonly scene: PlatformScene,
    col: number,
    row: number,
  ) {
    this.col = col;
    this.row = row;
    this.img = scene.add.image(col * TILE, (row + 1) * TILE, TEX.trunk, this.frame);
    this.img.setOrigin(0, 1).setDepth(DEPTH.decor);
  }

  /** Cases pleines une fois couché : [col, ligne] (souche, puis le fût ligne par ligne). */
  cells(out: number[][] = []): number[][] {
    out.length = 0;
    out.push([this.col, this.row]);
    for (let r = this.row - 1; r <= this.row; r++) for (let c = this.col + 1; c <= this.col + 3; c++) out.push([c, r]);
    return out;
  }

  /** La secousse le fait trembler, puis tomber. */
  fall(): void {
    if (this.state !== 'stand') return;
    this.state = 'tremble';
    this.ms = 0;
  }

  update(dtMs: number): void {
    if (this.state === 'stand' || this.state === 'down') return;
    this.ms += dtMs;
    const F = FRAMES.trunk;
    if (this.state === 'tremble') {
      if (this.ms < TREMBLE_MS) {
        this.setFrame(F.tremble[Math.floor((this.ms * TREMBLE_FPS) / 1000) % F.tremble.length]);
        return;
      }
      this.state = 'fall';
      this.ms = 0;
      this.scene.playSfx('quake', 0.6, 1.3);
    }
    const i = Math.floor((this.ms * FALL_FPS) / 1000);
    if (i < F.fall.length) {
      this.setFrame(F.fall[i]);
      return;
    }
    this.land();
  }

  /** Reprise d'un combat : déjà abattu au point de contrôle → couché d'emblée, sans effet. */
  restore(down: boolean): void {
    if (!down || this.state === 'down') return;
    this.lie();
  }

  private lie(): void {
    this.state = 'down';
    this.setFrame(FRAMES.trunk.lying);
    this.img.setDepth(DEPTH.tiles + 1);
    this.setSolid();
  }

  /** Couché : obstacle plein, dessiné devant les tuiles ; Kaï pris dessous est posé dessus. */
  private land(): void {
    const scene = this.scene;
    this.lie();
    const x = (this.col + 2.5) * TILE;
    const y = (this.row + 1) * TILE;
    scene.fx.puff(x - TILE, y - 4, 4);
    scene.fx.puff(x + TILE, y - 4, 4);
    scene.fx.shake(0.5, 260);
    scene.playSfx('bump', 1, 0.6);
    scene.vibrate(50);
    scene.onTrunkDown(this);
  }

  private setSolid(): void {
    const scene = this.scene;
    const grid = scene.grid;
    const cells = this.cells();
    for (const [c, r] of cells) grid.cells[r * grid.cols + c] = CELL_SOLID;
    for (const [c, r] of cells) {
      const t = scene.layer.putTileAt(TILE_FRAME.BLOCK, c, r, false);
      t.setVisible(false);
      t.setCollision(true, true, true, true, false);
      t.faceTop = grid.at(c, r - 1) !== CELL_SOLID;
      t.faceBottom = grid.at(c, r + 1) !== CELL_SOLID;
      t.faceLeft = grid.at(c - 1, r) !== CELL_SOLID;
      t.faceRight = grid.at(c + 1, r) !== CELL_SOLID;
    }
  }

  private setFrame(f: number): void {
    if (f === this.frame) return;
    this.frame = f;
    this.img.setFrame(f);
  }
}
