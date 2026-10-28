import type * as Phaser from 'phaser';
import type { PowerUpKind } from '../../core/types';
import { ANIM, FRAMES, TEX, TILE_FRAME } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { ParsedLevel } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';

// Objets : cristaux, blocs bonus (frappés par dessous), bonus flottants, points de contrôle.

interface Crystal {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  baseY: number;
  phase: number;
  taken: boolean;
  shown: boolean;
}

/** Sortie du bloc, glissade (tombe des rebords), puis flotte sur place. */
const POWER_EMERGING = 0;
const POWER_SLIDING = 1;
const POWER_FLOATING = 2;
const POWER_HALF = 22;
const POWER_SLIDE_SPEED = 85;
const POWER_GRAVITY = 900;
const POWER_MAX_FALL = 320;
const POWER_SLIDE_MAX_S = 4;
/** Hauteur de flottaison (centre de l'icône au-dessus du sol) : à hauteur de Kaï. */
const POWER_FLOAT_H = 34;

interface PowerItem {
  sprite: Phaser.GameObjects.Image;
  kind: PowerUpKind;
  state: number;
  /** Centre de flottaison. */
  baseY: number;
  phase: number;
  vx: number;
  vy: number;
  slideS: number;
  fell: boolean;
  /** Position de repli (au-dessus du bloc) si le bonus tombe hors de la carte. */
  homeX: number;
  homeY: number;
  taken: boolean;
}

interface Checkpoint {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  feetY: number;
  on: boolean;
}

const POWER_TEX: Record<PowerUpKind, string> = {
  speed: TEX.powerSpeed,
  shield: TEX.powerShield,
  rapid: TEX.powerRapid,
};

export class Items {
  private readonly crystals: Crystal[] = [];
  private readonly powers: PowerItem[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly usedBonus = new Set<number>();
  private readonly hasSpin: boolean;

  constructor(
    private readonly scene: PlatformScene,
    private readonly level: ParsedLevel,
  ) {
    this.hasSpin = scene.anims.exists(ANIM.crystalSpin);
    for (const c of level.crystals) {
      const x = c.col * TILE + TILE / 2;
      const baseY = (c.row + 1) * TILE - 10;
      const sprite = scene.add.sprite(x, baseY, TEX.crystal, 0);
      sprite.setOrigin(0.5, 1).setDepth(DEPTH.items);
      if (this.hasSpin) sprite.anims.play({ key: ANIM.crystalSpin, startFrame: (c.col + c.row) % 6 });
      this.crystals.push({ sprite, x, baseY, phase: (c.col * 0.7 + c.row) % 6.283, taken: false, shown: true });
    }
    for (const k of level.checkpoints) {
      const x = k.col * TILE + TILE / 2;
      const feetY = (k.row + 1) * TILE;
      const sprite = scene.add.sprite(x, feetY, TEX.checkpoint, FRAMES.checkpoint.off);
      sprite.setOrigin(0.5, 1).setDepth(DEPTH.items - 1);
      this.checkpoints.push({ sprite, x, feetY, on: false });
    }
  }

  update(dt: number, now: number, allowPickup: boolean): void {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const camCX = cam.scrollX + cam.width * 0.5;
    const range = cam.width;
    const p = scene.player;
    const pl = p.left - 4;
    const pr = p.right + 4;
    const pt = p.top - 4;
    const pb = p.feetY + 2;
    const t = now * 0.001;

    // ---- Cristaux : affichés / animés seulement près de la caméra
    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i];
      if (c.taken) continue;
      const near = Math.abs(c.x - camCX) <= range;
      if (near !== c.shown) {
        c.shown = near;
        c.sprite.setVisible(near).setActive(near);
      }
      if (!near) continue;
      const y = c.baseY - 4 * Math.sin(t * 2.6 + c.phase);
      c.sprite.y = y;
      if (allowPickup && pr > c.x - 14 && pl < c.x + 14 && pb > y - 36 && pt < y) {
        c.taken = true;
        c.sprite.setVisible(false).setActive(false);
        scene.collectCrystal(c.x, y - 20);
      }
    }

    // ---- Bonus : glissent hors du bloc, tombent, puis flottent à hauteur de Kaï
    for (let i = 0; i < this.powers.length; i++) {
      const it = this.powers[i];
      if (it.taken || it.state === POWER_EMERGING) continue;
      if (it.state === POWER_SLIDING) this.slide(it, dt);
      let y = it.sprite.y;
      if (it.state === POWER_FLOATING) {
        y = it.baseY + 5 * Math.sin(t * 3.2 + it.phase);
        it.sprite.y = y;
        it.sprite.rotation = 0.08 * Math.sin(t * 2.1 + it.phase);
      }
      if (allowPickup && pr > it.sprite.x - POWER_HALF && pl < it.sprite.x + POWER_HALF && pb > y - POWER_HALF && pt < y + POWER_HALF) {
        it.taken = true;
        const x = it.sprite.x;
        it.sprite.destroy();
        scene.collectPower(it.kind, x, y);
      }
    }

    // ---- Points de contrôle : activés en passant devant la balise
    if (allowPickup) {
      for (let i = 0; i < this.checkpoints.length; i++) {
        const k = this.checkpoints[i];
        if (k.on) continue;
        // Fenêtre limitée : une balise contournée très loin (autre chemin) ne s'allume pas à retardement.
        if (p.x >= k.x - 12 && p.x <= k.x + 3 * TILE && pb > k.feetY - 4 * TILE && pt < k.feetY + TILE) {
          k.on = true;
          if (scene.anims.exists(ANIM.checkpointOn)) k.sprite.anims.play(ANIM.checkpointOn);
          else k.sprite.setFrame(FRAMES.checkpoint.on[0]);
          scene.reachCheckpoint(k.x, k.feetY);
        }
      }
    }
  }

  private slide(it: PowerItem, dt: number): void {
    const grid = this.scene.grid;
    const spr = it.sprite;
    it.slideS += dt;
    // Horizontal : demi-tour contre un mur.
    let x = spr.x + it.vx * dt;
    const front = x + (it.vx > 0 ? POWER_HALF : -POWER_HALF);
    if (grid.solidAtPx(front, spr.y)) {
      it.vx = -it.vx;
      x = spr.x;
    }
    // Vertical : posé sur un sol (plein ou traversable) ou en chute.
    let y = spr.y;
    const bottom = y + POWER_HALF;
    const supported = grid.groundAtPx(x, bottom + 1) && !grid.groundAtPx(x, bottom - 8);
    if (supported && it.vy >= 0) {
      const top = Math.floor((bottom + 1) / TILE) * TILE;
      y = top - POWER_HALF;
      if (it.fell || it.slideS > POWER_SLIDE_MAX_S) {
        it.state = POWER_FLOATING;
        it.baseY = top - POWER_FLOAT_H;
      }
      it.vy = 0;
    } else {
      it.vy = Math.min(POWER_MAX_FALL, it.vy + POWER_GRAVITY * dt);
      y += it.vy * dt;
      if (it.vy > 60) it.fell = true;
      // Atterrissage pendant ce pas : recalé sur la surface.
      const nb = y + POWER_HALF;
      if (it.vy > 0 && grid.groundAtPx(x, nb) && !grid.groundAtPx(x, bottom)) {
        y = Math.floor(nb / TILE) * TILE - POWER_HALF;
      }
    }
    if (y > this.level.height + TILE) {
      // Tombé dans un trou : il revient flotter au-dessus de son bloc.
      x = it.homeX;
      y = it.homeY;
      it.state = POWER_FLOATING;
      it.baseY = it.homeY;
      it.vx = 0;
      it.vy = 0;
    }
    spr.setPosition(x, y);
    spr.rotation = 0;
  }

  /** Bloc bonus encore plein à cette case ? */
  isActiveBonus(col: number, row: number): boolean {
    if (col < 0 || col >= this.level.cols || row < 0 || row >= this.level.rows) return false;
    const i = row * this.level.cols + col;
    return this.level.bonus.has(i) && !this.usedBonus.has(i);
  }

  /** Bloc bonus frappé par dessous : petit saut du bloc, puis cristal ou bonus qui en sort. */
  hitBonus(col: number, row: number): void {
    const scene = this.scene;
    const i = row * this.level.cols + col;
    const content = this.level.bonus.get(i);
    if (!content || this.usedBonus.has(i)) return;
    this.usedBonus.add(i);
    scene.playSfx('bump');

    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    const top = row * TILE;
    const tile = scene.layer.getTileAt(col, row);
    if (tile) tile.visible = false;
    const bumpImg = scene.add.image(cx, cy, TEX.tiles, TILE_FRAME.BONUS_USED);
    bumpImg.setDepth(DEPTH.tiles + 1);
    scene.tweens.add({
      targets: bumpImg,
      y: cy - 14,
      duration: 80,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        bumpImg.destroy();
        if (tile) {
          tile.index = TILE_FRAME.BONUS_USED;
          tile.visible = true;
        }
      },
    });

    if (content === 'crystal') {
      // Cristal éjecté puis compté aussitôt.
      const c = scene.add.sprite(cx, top, TEX.crystal, 0);
      c.setOrigin(0.5, 1).setDepth(DEPTH.items);
      if (this.hasSpin) c.anims.play(ANIM.crystalSpin);
      scene.tweens.add({
        targets: c,
        y: top - 96,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: c,
            y: top - 70,
            alpha: 0,
            duration: 200,
            ease: 'Quad.easeIn',
            onComplete: () => c.destroy(),
          });
        },
      });
      scene.collectCrystal(cx, top - 40);
      return;
    }

    // Bonus : sort lentement du bloc, glisse dans le sens de Kaï puis tombe et flotte (toujours atteignable).
    const sprite = scene.add.image(cx, cy, POWER_TEX[content]);
    sprite.setDepth(DEPTH.tiles - 1);
    const restY = top - POWER_HALF;
    const item: PowerItem = {
      sprite,
      kind: content,
      state: POWER_EMERGING,
      baseY: top - POWER_FLOAT_H,
      phase: col * 0.9,
      vx: scene.player.facing * POWER_SLIDE_SPEED,
      vy: 0,
      slideS: 0,
      fell: false,
      homeX: cx,
      homeY: top - POWER_FLOAT_H,
      taken: false,
    };
    this.powers.push(item);
    scene.tweens.add({
      targets: sprite,
      y: restY,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (item.taken) return;
        item.state = POWER_SLIDING;
        sprite.setDepth(DEPTH.items);
      },
    });
  }
}
