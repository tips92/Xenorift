import type * as Phaser from 'phaser';
import { FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { GridPos } from './mapBuilder';
import type { Player } from './Player';
import type { PlatformScene } from './PlatformScene';
import { BG_RGB } from './tuning';

// Portes 'D' : par paires dans l'ordre de ParsedLevel.doors (0 ↔ 1, 2 ↔ 3… ; la dernière, sans paire, reste
// inerte). Kaï au sol et centré devant une porte : elle s'ouvre et une flèche ▲ flotte au-dessus. L'appui
// « interact » (↑ seul) le fait ressortir devant l'autre porte de la paire : enter() donne l'arrivée et joue
// l'effet (son, étincelles, court fondu) ; la scène téléporte Kaï et recentre la caméra.

/** « Devant » une porte : au sol, centre de Kaï à moins de FRONT_DX px du milieu de la porte. */
const FRONT_DX = 24;
/** Tolérance sur la hauteur des pieds (bas de la case de la porte). */
const FRONT_DY = 8;
/** Après un passage : délai avant de pouvoir repasser (la flèche revient ensuite). */
const COOLDOWN_MS = 450;
/** Les deux portes restent ouvertes un instant après un passage. */
const OPEN_AFTER_MS = 600;
/** Fondu depuis le noir à l'arrivée. */
const FADE_IN_MS = 260;
/** Hauteur d'une porte (1x2 tuiles, posée au bas de sa case). */
const DOOR_H = 2 * TILE;
/** Flèche : écart au-dessus de la porte, oscillation (px, rad/ms), fondu (alpha par ms). */
const ARROW_GAP = 8;
const ARROW_BOB = 6;
const ARROW_BOB_SPEED = 0.006;
const ARROW_FADE_PER_MS = 1 / 140;

interface Door {
  sprite: Phaser.GameObjects.Image;
  /** Milieu de la porte et bas de sa case (= pieds de Kaï devant elle). */
  x: number;
  feetY: number;
  /** Index de l'autre porte de la paire ; -1 : sans paire (inerte). */
  partner: number;
  /** Frame affichée (pas de setFrame à chaque image). */
  frame: number;
  /** Reste ouverte jusqu'à cette heure (horloge interne, ms). */
  openUntil: number;
}

/** Arrivée écrite par Doors.enter (objet gardé par l'appelant, réutilisé). */
export interface DoorArrival {
  x: number;
  feetY: number;
}

export class Doors {
  private readonly list: Door[] = [];
  private arrow: Phaser.GameObjects.Image | null = null;
  /** Texture de porte présente (sinon : image de secours de Phaser, sans frames). */
  private readonly framed: boolean;
  /** Horloge interne (ms), avancée par update() : arrêtée en pause comme la scène. */
  private time = 0;
  private near = -1;
  private cooldownUntil = 0;
  private arrowAlpha = 0;
  /** Porte au-dessus de laquelle est la flèche (gardée pendant qu'elle s'efface). */
  private arrowDoor = -1;

  constructor(
    private readonly scene: PlatformScene,
    spawns: readonly GridPos[],
  ) {
    this.framed = scene.textures.exists(TEX.door);
    const paired = spawns.length - (spawns.length % 2);
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const x = s.col * TILE + TILE / 2;
      const feetY = (s.row + 1) * TILE;
      const sprite = this.framed
        ? scene.add.image(x, feetY, TEX.door, FRAMES.door.closed)
        : scene.add.image(x, feetY, TEX.door);
      sprite.setOrigin(0.5, 1).setDepth(DEPTH.decor);
      this.list.push({ sprite, x, feetY, partner: i < paired ? i ^ 1 : -1, frame: FRAMES.door.closed, openUntil: 0 });
    }
    if (paired > 0) {
      this.arrow = scene.add.image(0, 0, TEX.interactArrow);
      this.arrow.setOrigin(0.5, 1).setDepth(DEPTH.items + 1).setAlpha(0).setVisible(false);
    }
  }

  get count(): number {
    return this.list.length;
  }

  /** Porte devant laquelle se tient Kaï à la dernière mise à jour (-1 : aucune). */
  get nearIndex(): number {
    return this.near;
  }

  /**
   * À chaque image. active : partie en cours (faux pendant la mort et la sortie : flèche effacée,
   * portes refermées).
   */
  update(dtMs: number, active: boolean): void {
    this.time += dtMs;
    const now = this.time;
    const near = active && now >= this.cooldownUntil ? this.find(this.scene.player) : -1;
    this.near = near;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      this.setFrame(d, i === near || now < d.openUntil ? FRAMES.door.open : FRAMES.door.closed);
    }
    this.updateArrow(dtMs, near);
  }

  /**
   * À appeler quand l'appui « interact » est consommé. Kaï devant une porte reliée : écrit dans `out`
   * l'arrivée (devant l'autre porte, pieds au bas de sa case), joue l'effet et renvoie vrai ; la scène
   * téléporte alors Kaï et recentre la caméra. Faux sinon (rien ne se passe).
   */
  enter(out: DoorArrival): boolean {
    if (this.time < this.cooldownUntil) return false;
    const from = this.find(this.scene.player);
    if (from < 0) return false;
    const a = this.list[from];
    const b = this.list[a.partner];
    out.x = b.x;
    out.feetY = b.feetY;

    this.cooldownUntil = this.time + COOLDOWN_MS;
    a.openUntil = this.time + OPEN_AFTER_MS;
    b.openUntil = this.time + OPEN_AFTER_MS;
    this.setFrame(a, FRAMES.door.open);
    this.setFrame(b, FRAMES.door.open);
    this.near = -1;
    this.hideArrow();

    // Effet : étincelles aux deux portes, gerbe à l'arrivée, son de portail, court fondu depuis le noir.
    const scene = this.scene;
    const fx = scene.fx;
    fx.spark(a.x, a.feetY - TILE, fx.colors.laser, 10);
    fx.burst(b.x, b.feetY - TILE, fx.colors.crystal, 12);
    fx.puff(b.x, b.feetY - 2, 3);
    scene.playSfx('gate', 0.8, 0.85);
    scene.vibrate(25);
    scene.cameras.main.fadeIn(FADE_IN_MS, BG_RGB.r, BG_RGB.g, BG_RGB.b);
    return true;
  }

  /** Réapparition : portes fermées, flèche cachée, délai oublié. */
  reset(): void {
    this.near = -1;
    this.cooldownUntil = 0;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      d.openUntil = 0;
      this.setFrame(d, FRAMES.door.closed);
    }
    this.hideArrow();
  }

  destroy(): void {
    for (let i = 0; i < this.list.length; i++) this.list[i].sprite.destroy();
    this.list.length = 0;
    if (this.arrow) {
      this.arrow.destroy();
      this.arrow = null;
    }
    this.near = -1;
    this.arrowDoor = -1;
  }

  /** Index de la porte reliée devant laquelle se tient Kaï (au sol, centré), ou -1. */
  private find(p: Player): number {
    if (!p.onGround) return -1;
    const px = p.x;
    const feet = p.feetY;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      if (d.partner < 0) continue;
      if (Math.abs(px - d.x) <= FRONT_DX && Math.abs(feet - d.feetY) <= FRONT_DY) return i;
    }
    return -1;
  }

  private setFrame(d: Door, frame: number): void {
    if (d.frame === frame) return;
    d.frame = frame;
    if (this.framed) d.sprite.setFrame(frame);
  }

  /** Flèche ▲ : apparaît en fondu au-dessus de la porte et oscille doucement. */
  private updateArrow(dtMs: number, near: number): void {
    const arrow = this.arrow;
    if (!arrow) return;
    if (near >= 0) this.arrowDoor = near;
    const step = dtMs * ARROW_FADE_PER_MS;
    this.arrowAlpha = near >= 0 ? Math.min(1, this.arrowAlpha + step) : Math.max(0, this.arrowAlpha - step);
    if (this.arrowAlpha <= 0 || this.arrowDoor < 0) {
      if (arrow.visible) arrow.setVisible(false);
      return;
    }
    const d = this.list[this.arrowDoor];
    const bob = ARROW_BOB * (0.5 + 0.5 * Math.sin(this.time * ARROW_BOB_SPEED));
    arrow.setPosition(d.x, d.feetY - DOOR_H - ARROW_GAP - bob);
    arrow.setAlpha(this.arrowAlpha);
    if (!arrow.visible) arrow.setVisible(true);
  }

  private hideArrow(): void {
    this.arrowAlpha = 0;
    if (this.arrow && this.arrow.visible) this.arrow.setVisible(false);
  }
}
