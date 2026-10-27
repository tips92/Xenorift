import type { InputApi } from '../../core/types';
import {
  LASER_COOLDOWN_MS,
  LASER_COOL_RATE,
  LASER_HEAT_PER_SHOT,
  LASER_RECOVER_AT,
} from '../constants';
import type { PlatformScene } from './PlatformScene';
import { HEAT_COOL_DELAY_MS, TRIPLE_SPREAD_RAD } from './tuning';

// Pistolet laser de Kaï : cadence, maintien du tir, jauge de surchauffe, tir triple.

export class Blaster {
  heat = 0;
  overheated = false;
  private cooldownMs = 0;
  private sinceShotMs = 1e6;
  /** Appui bref mémorisé (tapotement plus rapide que la cadence). */
  private queuedMs = 0;

  constructor(private readonly scene: PlatformScene) {}

  update(dt: number, dtMs: number, input: InputApi): void {
    if (this.cooldownMs > 0) this.cooldownMs -= dtMs;
    this.sinceShotMs += dtMs;

    // Refroidissement : immédiat en surchauffe, sinon après une courte pause sans tirer.
    if (this.overheated) {
      this.heat -= LASER_COOL_RATE * dt;
      if (this.heat < LASER_RECOVER_AT) this.overheated = false;
    } else if (this.sinceShotMs >= HEAT_COOL_DELAY_MS) {
      this.heat -= LASER_COOL_RATE * dt;
    }
    if (this.heat < 0) this.heat = 0;

    if (input.consumePress('fire')) this.queuedMs = 150;
    else if (this.queuedMs > 0) this.queuedMs -= dtMs;

    const wants = this.queuedMs > 0 || input.state.fire;
    if (wants && this.cooldownMs <= 0 && !this.overheated) {
      this.queuedMs = 0;
      this.shoot();
    }
  }

  private shoot(): void {
    const scene = this.scene;
    const p = scene.player;
    // Garde le reliquat pour une cadence régulière quand le tir est maintenu.
    this.cooldownMs = LASER_COOLDOWN_MS + Math.max(-20, Math.min(0, this.cooldownMs));
    this.sinceShotMs = 0;

    const x = p.gunX;
    const y = p.gunY;
    const base = p.facing > 0 ? 0 : Math.PI;
    scene.lasers.fire(x, y, base);
    if (scene.power === 'triple') {
      scene.lasers.fire(x, y, base - TRIPLE_SPREAD_RAD);
      scene.lasers.fire(x, y, base + TRIPLE_SPREAD_RAD);
    }
    scene.fx.spark(x + p.facing * 6, y, scene.fx.colors.laser, 3);
    scene.playSfx('laser', 0.9, 0.96 + Math.random() * 0.08);

    this.heat += LASER_HEAT_PER_SHOT;
    if (this.heat >= 1 - 1e-6) {
      this.heat = 1;
      this.overheated = true;
      scene.playSfx('overheat');
      scene.showToast('Surchauffe !', 'bad');
    }
  }

  reset(): void {
    this.heat = 0;
    this.overheated = false;
    this.cooldownMs = 0;
    this.sinceShotMs = 1e6;
    this.queuedMs = 0;
  }
}
