import type * as Phaser from 'phaser';
import { FRAMES, TEX, TILE_FRAME } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import { CELL_EMPTY, CELL_SOLID } from './mapBuilder';
import type { ArenaSpot } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';
import type { Player } from './Player';

// Arène de boss (plan 04, point 13) : deux bornes '|' ; quand Kaï est entre elles, une barrière se ferme sur chaque
// borne, de la borne jusqu'en haut de la carte (cases pleines : Kaï, ses tirs et les ennemis s'y arrêtent). La
// caméra se cale sur l'arène (PlatformScene.updateCameraBounds lit camBlend). Victoire : ouverte pour de bon ;
// vie perdue : rouverte (reset), le combat reprendra à la prochaine entrée.

/** 'open' : en attente de Kaï ; 'closed' : combat ; 'done' : boss vaincu (ou combat passé), plus jamais fermée. */
export type ArenaState = 'open' | 'closed' | 'done';

const BLEND_MS = 600;
const OPEN_FPS = 12;
const CRACKLE_FPS = 14;

type BarrierAnim = 'none' | 'close' | 'crackle' | 'open';

export class Arena {
  state: ArenaState = 'open';
  readonly col0: number;
  readonly col1: number;
  /** Ligne des bornes ; la barrière va de la ligne 0 à celle-ci, le sol est dessous. */
  readonly row: number;
  /** Intérieur (px) : du bord droit de la première borne au bord gauche de la seconde. */
  readonly left: number;
  readonly right: number;
  /** Cadre de la caméra (px) : bords extérieurs des deux bornes. */
  readonly outerLeft: number;
  readonly outerRight: number;
  /** Caméra : 0 = toute la carte, 1 = calée sur l'arène (adouci). */
  camBlend = 0;
  private camT = 0;
  private camTarget = 0;
  private anim: BarrierAnim = 'none';
  private animMs = 0;
  private frame: number = FRAMES.barrier.off;
  private readonly images: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: PlatformScene,
    spot: ArenaSpot,
  ) {
    this.col0 = spot.col0;
    this.col1 = spot.col1;
    this.row = spot.row;
    this.left = (spot.col0 + 1) * TILE;
    this.right = spot.col1 * TILE;
    this.outerLeft = spot.col0 * TILE;
    this.outerRight = (spot.col1 + 1) * TILE;
    // Une image par case, bornes en haut et en bas ; toutes sur la même frame (les éclairs se raccordent).
    for (const col of [spot.col0, spot.col1]) {
      for (let r = 0; r <= spot.row; r++) {
        const key = r === spot.row ? TEX.barrierBottom : r === 0 ? TEX.barrierTop : TEX.barrierMid;
        this.images.push(scene.add.image(col * TILE, r * TILE, key, this.frame).setOrigin(0, 0).setDepth(DEPTH.items - 1));
      }
    }
  }

  /** Kaï est entre les bornes sans empiéter sur leurs colonnes (la barrière ne se ferme pas sur lui). */
  holds(p: Player): boolean {
    return p.left > this.left + 2 && p.right < this.right - 2;
  }

  close(): void {
    if (this.state !== 'open') return;
    this.state = 'closed';
    this.setSolid(true);
    this.play('close');
    this.camTarget = 1;
    this.scene.playSfx('barrier');
    this.scene.vibrate(30);
  }

  /** Ouverte pour de bon (victoire, ou combat passé par l'aide de test : sans animation ni son). */
  open(animate: boolean): void {
    if (this.state === 'done') return;
    const wasClosed = this.state === 'closed';
    this.state = 'done';
    if (wasClosed) this.setSolid(false);
    this.camTarget = 0;
    if (animate && wasClosed) {
      this.play('open');
      this.scene.playSfx('barrier', 0.8, 0.85);
    } else {
      this.anim = 'none';
      this.camT = 0;
      this.camBlend = 0;
      this.setFrame(FRAMES.barrier.off);
    }
  }

  /** Vie perdue pendant le combat : rouverte tout de suite (Kaï repart du point de contrôle d'avant). */
  reset(): void {
    if (this.state === 'closed') this.setSolid(false);
    if (this.state !== 'done') this.state = 'open';
    this.anim = 'none';
    this.camT = 0;
    this.camTarget = 0;
    this.camBlend = 0;
    this.setFrame(FRAMES.barrier.off);
  }

  /** Une image : animation des barrières ; vrai si le cadre de la caméra a bougé. */
  update(dtMs: number): boolean {
    if (this.anim !== 'none') this.updateAnim(dtMs);
    if (this.camT === this.camTarget) return false;
    const step = dtMs / BLEND_MS;
    this.camT = this.camTarget > this.camT ? Math.min(this.camTarget, this.camT + step) : Math.max(this.camTarget, this.camT - step);
    const u = this.camT;
    this.camBlend = u * u * (3 - 2 * u);
    return true;
  }

  private play(anim: BarrierAnim): void {
    this.anim = anim;
    this.animMs = 0;
    this.updateAnim(0);
  }

  private updateAnim(dtMs: number): void {
    this.animMs += dtMs;
    const B = FRAMES.barrier;
    if (this.anim === 'close' || this.anim === 'open') {
      const list = this.anim === 'close' ? B.close : B.open;
      const i = Math.floor((this.animMs * OPEN_FPS) / 1000);
      if (i >= list.length) {
        if (this.anim === 'close') {
          this.play('crackle');
          return;
        }
        this.anim = 'none';
        this.setFrame(B.off);
        return;
      }
      this.setFrame(list[i]);
      return;
    }
    const i = Math.floor((this.animMs * CRACKLE_FPS) / 1000) % B.crackle.length;
    this.setFrame(B.crackle[i]);
  }

  private setFrame(f: number): void {
    if (f === this.frame) return;
    this.frame = f;
    for (let i = 0; i < this.images.length; i++) this.images[i].setFrame(f);
  }

  /**
   * Cases des deux barrières dans la grille (règles du jeu) ET dans le calque (collisions Arcade). putTileAt ne
   * pose pas la collision (collideIndexes vide, voir buildTilemap) : collision et faces posées à la main.
   */
  private setSolid(on: boolean): void {
    const scene = this.scene;
    const grid = scene.grid;
    const layer = scene.layer;
    for (const col of [this.col0, this.col1]) {
      for (let r = 0; r <= this.row; r++) grid.cells[r * grid.cols + col] = on ? CELL_SOLID : CELL_EMPTY;
    }
    for (const col of [this.col0, this.col1]) {
      for (let r = 0; r <= this.row; r++) {
        if (!on) {
          layer.removeTileAt(col, r, false, false);
          continue;
        }
        const t = layer.putTileAt(TILE_FRAME.BLOCK, col, r, false);
        t.setVisible(false);
        t.setCollision(true, true, true, true, false);
        t.faceTop = grid.at(col, r - 1) !== CELL_SOLID;
        t.faceBottom = grid.at(col, r + 1) !== CELL_SOLID;
        t.faceLeft = grid.at(col - 1, r) !== CELL_SOLID;
        t.faceRight = grid.at(col + 1, r) !== CELL_SOLID;
      }
    }
  }
}
