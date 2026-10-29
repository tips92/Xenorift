import type * as Phaser from 'phaser';
import { FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { GridPos } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';

// Glyphes astréens des ruines (cases 'G', plan 04 point 9) : plaques gravées sur le mur du fond, éteintes, qui
// s'allument (motif allumé posé par-dessus en fondu) quand Kaï approche ; arrivé par une porte, ceux d'alentour
// s'allument en vague. Allumés pour toute la partie. Un objet par partie, créé dans build().

/** Motifs dans l'ordre de lecture d'une ruine (FRAMES.glyph) : Astréen, réseau, chaîne de portails, noyau, gardien, Faille. */
const READING_ORDER = [4, 0, 1, 3, 2, 5] as const;
/** Kaï (centre du corps) à moins de … px du centre d'un glyphe : il s'allume. */
const NEAR_PX = 3.2 * TILE;
/** Arrivée par une porte : glyphes allumés jusqu'à … px, avec un retard selon la distance (ms par px). */
const WAKE_PX = 9 * TILE;
const WAKE_MS_PER_PX = 0.9;
const FADE_MS = 450;

export interface Glyph {
  /** Centre de la case. */
  readonly x: number;
  readonly y: number;
  lit: boolean;
  readonly on: Phaser.GameObjects.Image;
}

export class Glyphs {
  /** Lu par les tests (lit). */
  readonly list: Glyph[] = [];
  private dark = 0;
  private notes = 0;

  constructor(
    private readonly scene: PlatformScene,
    cells: readonly GridPos[],
  ) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const v = READING_ORDER[i % READING_ORDER.length];
      const x = c.col * TILE;
      const y = c.row * TILE;
      // Au-dessus du mur de la salle (DEPTH.decor - 1), sous le décor et les portes.
      scene.add.image(x, y, TEX.glyphs, v).setOrigin(0, 0).setDepth(DEPTH.decor - 0.5);
      const on = scene.add.image(x, y, TEX.glyphs, v + FRAMES.glyph.on).setOrigin(0, 0).setDepth(DEPTH.decor - 0.4);
      on.setAlpha(0).setVisible(false);
      this.list.push({ x: x + TILE / 2, y: y + TILE / 2, lit: false, on });
    }
    this.dark = this.list.length;
  }

  /** À chaque image de jeu : (x, y) = centre du corps de Kaï. */
  update(x: number, y: number): void {
    if (this.dark === 0) return;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.lit) continue;
      const dx = g.x - x;
      const dy = g.y - y;
      if (dx * dx + dy * dy < NEAR_PX * NEAR_PX) this.light(g, 0);
    }
  }

  /** Kaï arrive par une porte en (x, y) : les glyphes d'alentour s'allument en vague, les plus proches d'abord. */
  wake(x: number, y: number): void {
    if (this.dark === 0) return;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g.lit) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < WAKE_PX) this.light(g, d * WAKE_MS_PER_PX);
    }
  }

  private light(g: Glyph, delay: number): void {
    g.lit = true;
    this.dark--;
    const scene = this.scene;
    g.on.setVisible(true);
    scene.tweens.add({
      targets: g.on,
      alpha: 1,
      delay,
      duration: FADE_MS,
      ease: 'Sine.easeOut',
      onStart: () => {
        // Petite gamme qui monte d'un glyphe à l'autre.
        scene.playSfx('crystal', 0.35, 0.55 + 0.07 * (this.notes++ % 6));
        scene.fx.spark(g.x, g.y, 0x8ffcff, 5);
      },
    });
  }
}
