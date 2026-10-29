import type * as Phaser from 'phaser';
import { FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import { CELL_SOLID } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';
import { SPORE_DROP_VY, SPORE_GRAVITY } from './tuning';

// Pluie de spores (plan 04, point 14) : des spores tombent du haut de la vue sur les colonnes de la pluie, devant
// Kaï, l'une après l'autre ; chacune est annoncée par une tache au sol (bosses.ts, drawWhaleSpot) qui grandit
// pendant WARN_MS avant la chute. Les spores (SporePool.drop) blessent Kaï et s'abattent au tir. Pas de nouvelle
// allocation pendant le jeu : taches en pool, historique de DROPS entrées au plus.

/** Spores d'une pluie, écart entre deux taches, annonce avant la chute (ms). */
const DROPS = 8;
const DROP_EVERY_MS = 520;
const WARN_MS = 1000;
/** Colonnes devant Kaï (dans le sens de la pluie) où tombent les spores successives. */
const AHEAD = [3, 5, 2, 6, 4, 1, 5, 3] as const;
/** Départ de la chute au-dessus du haut de la vue (px). */
const DROP_ABOVE = 40;
/** Sans sol plein dans la colonne visée : colonnes voisines essayées, dans cet ordre. */
const NEAR = [0, 1, -1, 2, -2] as const;
const SPOT_POOL = 6;
const SPOT_SCALE = 0.85;

interface Spot {
  readonly img: Phaser.GameObjects.Image;
  on: boolean;
  ms: number;
  dropped: boolean;
  /** Durée de vie après la chute (ms) : le temps que la spore atteigne le sol. */
  holdMs: number;
  x: number;
  groundY: number;
  /** Entrée de l'historique. */
  k: number;
  frame: number;
}

/** Une spore de la pluie (tests) : colonne, sol, heure de l'annonce et de la chute (horloge de la scène, ms). */
export interface SporeDrop {
  x: number;
  groundY: number;
  announcedAt: number;
  droppedAt: number;
}

export class SporeRain {
  readonly spots: Spot[] = [];
  /** Lu par les tests. */
  readonly history: SporeDrop[] = [];
  active = false;
  private col0 = 0;
  private col1 = 0;
  private left = 0;
  private nextMs = 0;

  constructor(private readonly scene: PlatformScene) {
    for (let i = 0; i < SPOT_POOL; i++) {
      const img = scene.add.image(-500, -500, TEX.sporeSpot, FRAMES.sporeSpot.warn[0]);
      img.setOrigin(0.5, 0.5).setDepth(DEPTH.items).setScale(SPOT_SCALE).setVisible(false);
      this.spots.push({ img, on: false, ms: 0, dropped: false, holdMs: 0, x: 0, groundY: 0, k: -1, frame: -1 });
    }
  }

  /** Pluie sur les colonnes [col0, col1] (une seule fois par partie : LevelEvents). */
  start(col0: number, col1: number): void {
    if (this.active) return;
    this.active = true;
    this.col0 = Math.min(col0, col1);
    this.col1 = Math.max(col0, col1);
    this.left = DROPS;
    this.nextMs = 0;
  }

  update(dtMs: number): void {
    if (this.active && this.left > 0) {
      this.nextMs -= dtMs;
      if (this.nextMs <= 0) {
        this.nextMs += DROP_EVERY_MS;
        this.announce(DROPS - this.left);
        this.left--;
      }
    }
    let any = false;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.on) continue;
      any = true;
      s.ms += dtMs;
      if (!s.dropped && s.ms >= WARN_MS) this.dropOn(s);
      if (s.dropped && s.ms >= WARN_MS + s.holdMs) {
        s.on = false;
        s.img.setVisible(false);
        continue;
      }
      const w = FRAMES.sporeSpot.warn;
      this.setFrame(s, w[Math.min(w.length - 1, Math.floor((s.ms / WARN_MS) * w.length))]);
      s.img.setAlpha(0.65 + 0.35 * Math.sin(s.ms * 0.02));
    }
    if (this.active && this.left === 0 && !any) this.active = false;
  }

  /** Vie perdue, sortie : plus de taches ni de spores à venir (la pluie ne rejoue pas). */
  clear(): void {
    this.active = false;
    this.left = 0;
    for (let i = 0; i < this.spots.length; i++) {
      this.spots[i].on = false;
      this.spots[i].img.setVisible(false);
    }
  }

  /** Tache de la spore n° `n` au sol de sa colonne (la plus proche qui a un sol plein visible). */
  private announce(n: number): void {
    const scene = this.scene;
    const p = scene.player;
    const want = Math.floor(p.x / TILE) + AHEAD[n % AHEAD.length];
    const base = Math.max(this.col0, Math.min(this.col1, want));
    const top = Math.max(0, Math.floor(scene.cameras.main.scrollY / TILE));
    for (let i = 0; i < NEAR.length; i++) {
      const c = base + NEAR[i];
      if (c < this.col0 || c > this.col1) continue;
      const row = this.groundRow(c, top);
      if (row < 0) continue;
      this.place(c, row);
      return;
    }
  }

  private groundRow(col: number, top: number): number {
    const grid = this.scene.grid;
    for (let r = top + 1; r < grid.rows; r++) if (grid.at(col, r) === CELL_SOLID && grid.at(col, r - 1) !== CELL_SOLID) return r;
    return -1;
  }

  private place(col: number, row: number): void {
    let s: Spot | null = null;
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.spots[i].on) {
        s = this.spots[i];
        break;
      }
    }
    if (!s) return;
    s.on = true;
    s.ms = 0;
    s.dropped = false;
    s.x = col * TILE + TILE / 2;
    s.groundY = row * TILE;
    s.frame = -1;
    s.img.setPosition(s.x, s.groundY - 2).setVisible(true);
    s.k = this.history.length;
    this.history.push({ x: s.x, groundY: s.groundY, announcedAt: this.scene.clockMs, droppedAt: -1 });
  }

  private dropOn(s: Spot): void {
    const scene = this.scene;
    s.dropped = true;
    const y0 = scene.cameras.main.scrollY - DROP_ABOVE;
    scene.spores.drop(s.x, y0);
    scene.playSfx('sporeDrop', 0.8);
    // Temps de chute (SporePool.drop) : la tache reste jusqu'à l'impact.
    const d = Math.max(0, s.groundY - y0);
    const v = SPORE_DROP_VY;
    s.holdMs = ((-v + Math.sqrt(v * v + 2 * SPORE_GRAVITY * d)) / SPORE_GRAVITY) * 1000;
    if (s.k >= 0) this.history[s.k].droppedAt = scene.clockMs;
  }

  private setFrame(s: Spot, f: number): void {
    if (s.frame === f) return;
    s.frame = f;
    s.img.setFrame(f);
  }
}
