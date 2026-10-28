import * as Phaser from 'phaser';
import type { ThemeId } from '../../core/types';
import { TEX } from '../art/keys';
import { DEPTH } from '../constants';

// Particules (étincelles, explosions, poussière) : quelques émetteurs créés une fois par niveau,
// utilisés en mode « explode » (aucune allocation d'émetteur pendant le jeu).

export interface ThemeColors {
  /** Énergie du thème (balises, portes, double saut). Les tirs ont la couleur de leur arme (WeaponDef.color). */
  laser: number;
  enemyBurst: number;
  spore: number;
  crystal: number;
  dust: number;
}

export const THEME_COLORS: Record<ThemeId, ThemeColors> = {
  jungle: { laser: 0x8ffcff, enemyBurst: 0x9dff5c, spore: 0xb6ff3b, crystal: 0x7ff6ff, dust: 0xc9a8ff },
  moon: { laser: 0x8ffcff, enemyBurst: 0xffa64d, spore: 0xff4fd8, crystal: 0xffb35c, dust: 0xd8cce8 },
};

export class Effects {
  readonly colors: ThemeColors;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly bursts: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly streaks: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly trail: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, theme: ThemeId) {
    this.colors = THEME_COLORS[theme];

    this.sparks = scene.add.particles(0, 0, TEX.spark, {
      emitting: false,
      lifespan: { min: 160, max: 380 },
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    });
    this.sparks.setDepth(DEPTH.particles);

    this.bursts = scene.add.particles(0, 0, TEX.spark, {
      emitting: false,
      lifespan: { min: 380, max: 720 },
      speed: { min: 90, max: 340 },
      angle: { min: 0, max: 360 },
      gravityY: 520,
      scale: { start: 1.25, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    });
    this.bursts.setDepth(DEPTH.particles);

    this.puffs = scene.add.particles(0, 0, TEX.puff, {
      emitting: false,
      lifespan: { min: 320, max: 520 },
      speedX: { min: -70, max: 70 },
      speedY: { min: -46, max: -8 },
      scale: { start: 0.45, end: 1.05 },
      alpha: { start: 0.65, end: 0 },
      rotate: { min: 0, max: 360 },
    });
    this.puffs.setDepth(DEPTH.player - 1);

    // Bonus de vitesse : traits verts (couleur du bonus) étirés à l'horizontale, laissés sur place derrière Kaï.
    // Mode normal : en additif sur le violet de la Jungle, ils viraient au lavande. Vie courte : la traînée
    // reste collée au dos de Kaï.
    this.streaks = scene.add.particles(0, 0, TEX.spark, {
      emitting: false,
      lifespan: { min: 140, max: 260 },
      speed: { min: 0, max: 12 },
      angle: { min: 0, max: 360 },
      scaleX: { start: 2.6, end: 0.3 },
      scaleY: { start: 0.7, end: 0.15 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x7dff4a, 0xb8ff8a, 0xeaffb0],
    });
    this.streaks.setDepth(DEPTH.player - 1);

    // Traînée du réacteur au décollage (suit la flamme, démarrée à la demande).
    this.trail = scene.add.particles(0, 0, TEX.spark, {
      emitting: false,
      frequency: 22,
      quantity: 2,
      lifespan: { min: 260, max: 520 },
      speed: { min: 20, max: 90 },
      angle: { min: 150, max: 210 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffd27a, 0xff8a3c, 0xfff1c9],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.trail.setDepth(DEPTH.items - 1);
  }

  /** Petites étincelles (impact de laser, cristal…). */
  spark(x: number, y: number, tint: number, count = 6): void {
    this.sparks.setParticleTint(tint);
    this.sparks.explode(count, x, y);
  }

  /** Éclat à la bouche du canon, couleur de l'arme ; bonus de cadence : plus d'étincelles, avec un cœur blanc. */
  muzzle(x: number, y: number, tint: number, rapid: boolean): void {
    this.spark(x, y, tint, rapid ? 6 : 3);
    if (rapid) this.spark(x, y, 0xffffff, 3);
  }

  /** Traînée du bonus de vitesse : trois traits répartis sur `h` (le torse), centrés en (x, y). */
  speedStreak(x: number, y: number, h: number): void {
    for (let i = 0; i < 3; i++) {
      this.streaks.emitParticleAt(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * h, 1);
    }
  }

  /** Explosion plus large avec gravité (ennemi détruit, bouclier brisé). */
  burst(x: number, y: number, tint: number, count = 14): void {
    this.bursts.setParticleTint(tint);
    this.bursts.explode(count, x, y);
  }

  /** Nuage de poussière aux pieds. */
  puff(x: number, y: number, count = 3): void {
    this.puffs.setParticleTint(this.colors.dust);
    this.puffs.explode(count, x, y);
  }
}
