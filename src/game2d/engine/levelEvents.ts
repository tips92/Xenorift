import type { RadioId } from '../../core/types';
import { TILE } from '../constants';
import type { LevelRadio, RadioTrigger } from '../levels/types';

// Événements d'un niveau (plan 04, point 14) : messages de la radio de LUMA déclenchés par la position de Kaï
// (fenêtres de colonnes) ou par un événement du jeu (première surchauffe). Chacun joue au plus une fois par
// partie ; une fenêtre que Kaï a dépassée sans y passer (porte, téléportation) est sautée. Un objet par partie,
// créé dans build() (la scène le remet à null dans init()).

/** Fenêtre de colonnes : 0 en attente, 1 jouée, 2 sautée. */
export interface RadioWindow {
  readonly id: RadioId;
  readonly col0: number;
  readonly col1: number;
  state: 0 | 1 | 2;
}

export const WINDOW_WAITING = 0;
export const WINDOW_PLAYED = 1;
export const WINDOW_SKIPPED = 2;

export class LevelEvents {
  /** Lu par les tests (état de chaque fenêtre). */
  readonly windows: RadioWindow[] = [];
  private readonly onTrigger: { readonly on: RadioTrigger; readonly id: RadioId; fired: boolean }[] = [];
  private pending = 0;

  constructor(
    list: readonly LevelRadio[] | undefined,
    private readonly say: (id: RadioId) => void,
  ) {
    if (!list) return;
    for (const r of list) {
      if ('cols' in r) this.windows.push({ id: r.id, col0: r.cols[0], col1: r.cols[1], state: WINDOW_WAITING });
      else this.onTrigger.push({ on: r.on, id: r.id, fired: false });
    }
    this.pending = this.windows.length;
  }

  /** À chaque image de jeu (Kaï jouable), après un éventuel passage de porte : `x` = centre de Kaï. */
  update(x: number): void {
    if (this.pending === 0) return;
    const col = Math.floor(x / TILE);
    const w = this.windows;
    for (let i = 0; i < w.length; i++) {
      const win = w[i];
      if (win.state !== WINDOW_WAITING) continue;
      if (col > win.col1) {
        win.state = WINDOW_SKIPPED;
        this.pending--;
      } else if (col >= win.col0) {
        win.state = WINDOW_PLAYED;
        this.pending--;
        this.say(win.id);
      }
    }
  }

  /** Événement du jeu : le message qui l'attend joue à sa première occurrence. */
  trigger(kind: RadioTrigger): void {
    const t = this.onTrigger;
    for (let i = 0; i < t.length; i++) {
      if (t[i].on !== kind || t[i].fired) continue;
      t[i].fired = true;
      this.say(t[i].id);
    }
  }
}
