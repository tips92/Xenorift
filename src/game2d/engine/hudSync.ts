import type { HudApi, PlatformHud } from '../../core/types';
import { reportError } from './session';

// Envoie au HUD uniquement les champs qui ont changé (un seul appel par frame au plus).

export class HudSync {
  private readonly sent: PlatformHud;
  private pending: Partial<PlatformHud> | null = null;

  constructor(
    private readonly hud: HudApi,
    initial: PlatformHud,
  ) {
    this.sent = { ...initial };
    this.send({ ...initial });
  }

  set<K extends keyof PlatformHud>(key: K, value: PlatformHud[K]): void {
    if (this.sent[key] === value) return;
    this.sent[key] = value;
    if (!this.pending) this.pending = {};
    this.pending[key] = value;
  }

  get<K extends keyof PlatformHud>(key: K): PlatformHud[K] {
    return this.sent[key];
  }

  flush(): void {
    if (!this.pending) return;
    const p = this.pending;
    this.pending = null;
    this.send(p);
  }

  private send(p: Partial<PlatformHud>): void {
    try {
      this.hud.updatePlatform(p);
    } catch (err) {
      reportError('hud.updatePlatform', err);
    }
  }
}
