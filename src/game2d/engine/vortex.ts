import type * as Phaser from 'phaser';
import type { RadioId } from '../../core/types';
import { DEPTH, TILE } from '../constants';
import type { GridPos } from './mapBuilder';
import type { Player } from './Player';

// Vortex 'V' : case vide (pas de collision), posée sur un sol, dans une salle. Haut devant lui (interact)
// envoie Kaï dans la faille. Le dessin est un canvas, une seule texture pour toute la partie.

const TEX_KEY = 'rift-vortex';
const NEAR_X = 22;
const NEAR_Y = 12;

export class Vortex {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private near = -1;
  /** Premier passage tout près : la scène joue la radio, une fois. */
  announce = false;
  private announced = false;

  constructor(
    private readonly scene: Phaser.Scene,
    spots: readonly GridPos[],
    private readonly radioId: RadioId | null,
  ) {
    ensureTexture(scene);
    for (const s of spots) {
      const img = scene.add.image(s.col * TILE + TILE / 2, s.row * TILE + TILE / 2, TEX_KEY);
      img.setDepth(DEPTH.items).setScale(0.9);
      this.sprites.push(img);
    }
  }

  update(dtMs: number, player: Player, active: boolean): void {
    const spin = dtMs * 0.004;
    for (const s of this.sprites) s.rotation += spin;
    this.near = -1;
    if (!active) return;
    const px = player.x;
    const py = player.feetY;
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const feet = s.y + TILE / 2;
      if (Math.abs(px - s.x) <= NEAR_X && Math.abs(py - feet) <= NEAR_Y) {
        this.near = i;
        s.setScale(1.05);
        if (!this.announced && this.radioId) {
          this.announced = true;
          this.announce = true;
        }
      } else {
        s.setScale(0.9);
      }
    }
  }

  /** Kaï est devant un vortex (au sol, sur sa case). Relu tout de suite, pas seulement à la frame d'avant. */
  enter(player: Player): boolean {
    const px = player.x;
    const py = player.feetY;
    for (const s of this.sprites) {
      const feet = s.y + TILE / 2;
      if (Math.abs(px - s.x) <= NEAR_X && Math.abs(py - feet) <= NEAR_Y) return true;
    }
    return false;
  }

  /** Message à jouer cette image, ou null. */
  takeRadio(): RadioId | null {
    if (!this.announce || !this.radioId) return null;
    this.announce = false;
    return this.radioId;
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites.length = 0;
  }
}

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return;
  const cx = 32;
  const cy = 32;
  g.clearRect(0, 0, 64, 64);
  g.lineCap = 'round';
  // Anneaux : cyan de la Jungle, puis le gris du Vide au centre.
  const rings: readonly [number, string, number][] = [
    [26, '#3dffd2', 3],
    [18, '#ff4fd8', 2.4],
    [11, '#9aa0b4', 2.2],
  ];
  for (const [rad, col, w] of rings) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(cx, cy, rad, 0.4, Math.PI * 1.7);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#1a1028';
  g.beginPath();
  g.arc(cx, cy, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c8fdff';
  g.beginPath();
  g.arc(cx, cy, 2.2, 0, Math.PI * 2);
  g.fill();
  scene.textures.addCanvas(TEX_KEY, c);
}
