import * as Phaser from 'phaser';
import { TEX } from '../art/keys';
import { DEPTH, LASER_RANGE, LASER_SPEED } from '../constants';
import type { PlatformScene } from './PlatformScene';
import { SPORE_GRAVITY, SPORE_LIFE_S, SPORE_SPEED } from './tuning';

// Projectiles en pool, déplacés à la main (pas de corps Arcade) : tirs laser de Kaï et spores des cracheurs.

interface Bolt {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  ux: number;
  uy: number;
  dist: number;
  alive: boolean;
}

/** Longueur max d'un sous-pas de déplacement (évite de traverser un coin de tuile ou un ennemi). */
const SUB_STEP_PX = 14;
/** Distance du centre du tir à sa pointe. */
const BOLT_TIP = 16;

export class LaserPool {
  private readonly bolts: Bolt[] = [];
  private cursor = 0;

  constructor(
    private readonly scene: PlatformScene,
    size = 24,
  ) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-200, -200, TEX.laser);
      img.setDepth(DEPTH.projectiles).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
      this.bolts.push({ img, vx: 0, vy: 0, ux: 1, uy: 0, dist: 0, alive: false });
    }
  }

  fire(x: number, y: number, angle: number): void {
    // Premier tir libre, sinon on recycle le plus ancien.
    let bolt: Bolt | null = null;
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[(this.cursor + i) % this.bolts.length];
      if (!b.alive) {
        bolt = b;
        break;
      }
    }
    if (!bolt) bolt = this.bolts[this.cursor];
    this.cursor = (this.bolts.indexOf(bolt) + 1) % this.bolts.length;

    bolt.ux = Math.cos(angle);
    bolt.uy = Math.sin(angle);
    bolt.vx = bolt.ux * LASER_SPEED;
    bolt.vy = bolt.uy * LASER_SPEED;
    bolt.dist = 0;
    bolt.alive = true;
    bolt.img.setPosition(x, y).setRotation(angle).setVisible(true).setActive(true).setAlpha(1);
  }

  update(dt: number): void {
    const scene = this.scene;
    const grid = scene.grid;
    const enemies = scene.enemies;
    const spores = scene.spores;
    const n = Math.max(1, Math.ceil((LASER_SPEED * dt) / SUB_STEP_PX));
    const sdt = dt / n;
    const stepDist = LASER_SPEED * sdt;

    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.alive) continue;
      let x = b.img.x;
      let y = b.img.y;
      for (let s = 0; s < n; s++) {
        x += b.vx * sdt;
        y += b.vy * sdt;
        b.dist += stepDist;
        const tx = x + b.ux * BOLT_TIP;
        const ty = y + b.uy * BOLT_TIP;
        if (grid.solidAtPx(tx, ty)) {
          scene.fx.spark(tx - b.ux * 4, ty - b.uy * 4, scene.fx.colors.laser, 7);
          scene.playSfx('laserHit', 0.45);
          this.kill(b);
          break;
        }
        const e = enemies.hitTestPoint(tx, ty, 6);
        if (e) {
          scene.fx.spark(tx, ty, scene.fx.colors.laser, 8);
          enemies.laserHit(e);
          this.kill(b);
          break;
        }
        if (spores.hitTest(tx, ty, 18)) {
          scene.fx.spark(tx, ty, scene.fx.colors.spore, 6);
          this.kill(b);
          break;
        }
        if (b.dist >= LASER_RANGE) {
          scene.fx.spark(tx, ty, scene.fx.colors.laser, 3);
          this.kill(b);
          break;
        }
      }
      if (b.alive) {
        b.img.setPosition(x, y);
        // Fin de portée : le tir pâlit légèrement.
        const left = LASER_RANGE - b.dist;
        b.img.alpha = left < 80 ? 0.35 + (0.65 * left) / 80 : 1;
      }
    }
  }

  private kill(b: Bolt): void {
    b.alive = false;
    b.img.setVisible(false).setActive(false);
  }

  clear(): void {
    for (let i = 0; i < this.bolts.length; i++) {
      if (this.bolts[i].alive) this.kill(this.bolts[i]);
    }
  }
}

interface Spore {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  alive: boolean;
}

const SPORE_RADIUS = 10;

export class SporePool {
  private readonly spores: Spore[] = [];

  constructor(
    private readonly scene: PlatformScene,
    size = 16,
  ) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-200, -200, TEX.spore);
      img.setDepth(DEPTH.projectiles).setVisible(false).setActive(false);
      this.spores.push({ img, vx: 0, vy: 0, life: 0, alive: false });
    }
  }

  /** Tir visé vers (tx, ty), en légère cloche. */
  fire(x: number, y: number, tx: number, ty: number): void {
    let spore: Spore | null = null;
    let oldest: Spore = this.spores[0];
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      if (!s.alive) {
        spore = s;
        break;
      }
      if (s.life < oldest.life) oldest = s;
    }
    if (!spore) spore = oldest;

    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(1.6, Math.max(0.35, dist / SPORE_SPEED));
    spore.vx = dx / t;
    spore.vy = dy / t - 0.5 * SPORE_GRAVITY * t;
    spore.life = SPORE_LIFE_S;
    spore.alive = true;
    spore.img.setPosition(x, y).setVisible(true).setActive(true).setScale(0.4);
  }

  update(dt: number): void {
    const scene = this.scene;
    const grid = scene.grid;
    const p = scene.player;
    const playing = scene.state === 'play';
    const bottom = scene.parsed.height + 64;
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      if (!s.alive) continue;
      s.life -= dt;
      s.vy += SPORE_GRAVITY * dt;
      const img = s.img;
      img.x += s.vx * dt;
      img.y += s.vy * dt;
      img.rotation += 7 * dt;
      // Petite croissance à la sortie de la bouche.
      if (img.scaleX < 1) img.setScale(Math.min(1, img.scaleX + dt * 5));

      if (s.life <= 0 || img.y > bottom) {
        this.kill(s);
        continue;
      }
      if (grid.solidAtPx(img.x, img.y)) {
        scene.fx.spark(img.x, img.y, scene.fx.colors.spore, 6);
        this.kill(s);
        continue;
      }
      if (playing) {
        // Cercle contre la boîte de Kaï.
        const cx = Math.max(p.left + 3, Math.min(img.x, p.right - 3));
        const cy = Math.max(p.top + 4, Math.min(img.y, p.feetY));
        const ddx = img.x - cx;
        const ddy = img.y - cy;
        if (ddx * ddx + ddy * ddy <= SPORE_RADIUS * SPORE_RADIUS) {
          scene.fx.spark(img.x, img.y, scene.fx.colors.spore, 8);
          this.kill(s);
          scene.damagePlayer(img.x - s.vx * 0.05, 'spore');
        }
      }
    }
  }

  /** Détruit une spore proche de (x, y) ; renvoie vrai si touchée. */
  hitTest(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.spores.length; i++) {
      const s = this.spores[i];
      if (!s.alive) continue;
      const dx = s.img.x - x;
      const dy = s.img.y - y;
      if (dx * dx + dy * dy <= r * r) {
        this.kill(s);
        return true;
      }
    }
    return false;
  }

  private kill(s: Spore): void {
    s.alive = false;
    s.img.setVisible(false).setActive(false);
  }

  clear(): void {
    for (let i = 0; i < this.spores.length; i++) {
      if (this.spores[i].alive) this.kill(this.spores[i]);
    }
  }
}
