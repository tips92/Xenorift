import * as Phaser from 'phaser';
import type { WeaponId } from '../../core/types';
import { PELLET_SPEED_JITTER, WEAPON_IDS } from '../../core/weapons';
import type { WeaponStats } from '../../core/weapons';
import { BULLET_ADDITIVE, BULLET_SIZE, BULLET_TEX, TEX } from '../art/keys';
import { DEPTH, PROJECTILE_POOL_SIZE, TILE } from '../constants';
import type { PlatformScene } from './PlatformScene';
import { IMPACT_SFX_GAP_MS, SPORE_GRAVITY, SPORE_LIFE_S, SPORE_SPEED } from './tuning';

// Projectiles en pool, déplacés à la main (pas de corps Arcade) : tirs de Kaï (toutes armes) et spores des cracheurs.

/** Tir de Kaï en vol. Vitesse, portée, dégâts, pointe et couleur sont copiés de la fiche de l'arme au départ. */
export interface Bolt {
  img: Phaser.GameObjects.Image;
  weapon: WeaponId;
  vx: number;
  vy: number;
  ux: number;
  uy: number;
  /** Distance parcourue et portée (px). */
  dist: number;
  range: number;
  speed: number;
  damage: number;
  /** Distance du centre à la pointe (BULLET_SIZE), point testé contre tuiles et ennemis. */
  tip: number;
  /** Étincelles d'impact. */
  color: number;
  alive: boolean;
}

/** Longueur max d'un sous-pas de déplacement (évite de traverser un coin de tuile ou un ennemi). */
const SUB_STEP_PX = 14;
/** Fin de portée : le tir pâlit sur cette distance. */
const FADE_PX = 80;

/**
 * Tirs de Kaï, toutes armes (plombs et rafales compris). Pool plein : le plus ancien est recyclé.
 * `bolts` est lu par les outils de test (__xr2d, tests e2e).
 */
export class ShotPool {
  readonly bolts: Bolt[] = [];
  private cursor = 0;
  /** Texture de chaque arme (celle du laser tant que la sienne n'est pas dessinée). */
  private readonly tex: Record<WeaponId, string>;
  private lastImpactSfxAt = -1e9;

  constructor(
    private readonly scene: PlatformScene,
    size = PROJECTILE_POOL_SIZE,
  ) {
    const tex = { ...BULLET_TEX } as Record<WeaponId, string>;
    for (const id of WEAPON_IDS) {
      if (!scene.textures.exists(tex[id])) tex[id] = TEX.laser;
    }
    this.tex = tex;
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(-200, -200, TEX.laser);
      img.setDepth(DEPTH.projectiles).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
      this.bolts.push({
        img,
        weapon: 'laser',
        vx: 0,
        vy: 0,
        ux: 1,
        uy: 0,
        dist: 0,
        range: 0,
        speed: 0,
        damage: 0,
        tip: BULLET_SIZE.laser.tip,
        color: 0xffffff,
        alive: false,
      });
    }
  }

  /**
   * Un projectile de l'arme `w` (valeurs effectives) depuis la bouche (x, y), angle Phaser (radians, y vers le
   * bas). (ox, oy) : épaule de Kaï ; le segment épaule → pointe à la bouche est balayé au départ (un canon long
   * ne traverse ni un mur d'une tuile ni un ennemi au contact). La portée compte depuis la bouche.
   */
  fire(x: number, y: number, angle: number, w: Readonly<WeaponStats>, ox: number, oy: number): void {
    // Premier tir libre, sinon on recycle le plus ancien.
    const n = this.bolts.length;
    let idx = this.cursor;
    for (let i = 0; i < n; i++) {
      const j = (this.cursor + i) % n;
      if (!this.bolts[j].alive) {
        idx = j;
        break;
      }
    }
    const bolt = this.bolts[idx];
    this.cursor = (idx + 1) % n;

    if (bolt.weapon !== w.id) {
      bolt.weapon = w.id;
      bolt.tip = BULLET_SIZE[w.id].tip;
      bolt.img.setTexture(this.tex[w.id]).setBlendMode(BULLET_ADDITIVE[w.id] ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    bolt.ux = Math.cos(angle);
    bolt.uy = Math.sin(angle);
    // Plombs : vitesses un peu différentes, la gerbe s'étale au lieu de former une colonne.
    const speed = w.pellets > 1 ? w.speed * (1 + PELLET_SPEED_JITTER * (Math.random() * 2 - 1)) : w.speed;
    bolt.speed = speed;
    bolt.vx = bolt.ux * speed;
    bolt.vy = bolt.uy * speed;
    bolt.range = w.rangeTiles * TILE;
    bolt.damage = w.damage;
    bolt.color = w.color;
    bolt.dist = 0;
    bolt.alive = true;
    bolt.img.setPosition(x, y).setRotation(angle).setVisible(true).setActive(true).setAlpha(1);

    // Balayage du canon, par pas de SUB_STEP_PX au plus (l'épaule elle-même est dans le corps : non testée).
    const ex = x + bolt.ux * bolt.tip;
    const ey = y + bolt.uy * bolt.tip;
    const dx = ex - ox;
    const dy = ey - oy;
    const k = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / SUB_STEP_PX));
    for (let s = 1; s <= k; s++) {
      if (this.probe(bolt, ox + (dx * s) / k, oy + (dy * s) / k)) return;
    }
  }

  /** Pointe du tir en (tx, ty) contre le décor, les ennemis et les spores ; vrai si le tir est détruit. */
  private probe(b: Bolt, tx: number, ty: number): boolean {
    const scene = this.scene;
    const fx = scene.fx;
    if (scene.grid.solidAtPx(tx, ty)) {
      fx.spark(tx - b.ux * 4, ty - b.uy * 4, b.color, 7);
      this.impactSfx();
      this.kill(b);
      return true;
    }
    const e = scene.enemies.hitTestPoint(tx, ty, 6);
    if (e) {
      fx.spark(tx, ty, b.color, 8);
      scene.enemies.hit(e, b.damage);
      this.kill(b);
      return true;
    }
    if (scene.spores.hitTest(tx, ty, 18)) {
      fx.spark(tx, ty, fx.colors.spore, 6);
      this.kill(b);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    const fx = this.scene.fx;

    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.alive) continue;
      const n = Math.max(1, Math.ceil((b.speed * dt) / SUB_STEP_PX));
      const sdt = dt / n;
      const stepDist = b.speed * sdt;
      let x = b.img.x;
      let y = b.img.y;
      for (let s = 0; s < n; s++) {
        x += b.vx * sdt;
        y += b.vy * sdt;
        b.dist += stepDist;
        const tx = x + b.ux * b.tip;
        const ty = y + b.uy * b.tip;
        if (this.probe(b, tx, ty)) break;
        if (b.dist >= b.range) {
          fx.spark(tx, ty, b.color, 3);
          this.kill(b);
          break;
        }
      }
      if (b.alive) {
        b.img.setPosition(x, y);
        // Fin de portée : le tir pâlit légèrement.
        const left = b.range - b.dist;
        b.img.alpha = left < FADE_PX ? 0.35 + (0.65 * left) / FADE_PX : 1;
      }
    }
  }

  /** Impact sur le décor : un seul son pour des plombs qui touchent ensemble. */
  private impactSfx(): void {
    const now = this.scene.clockMs;
    if (now - this.lastImpactSfxAt < IMPACT_SFX_GAP_MS) return;
    this.lastImpactSfxAt = now;
    this.scene.playSfx('laserHit', 0.45);
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
