import type { RadioId } from '../../core/types';
import { TILE } from '../constants';
import type { LevelEvent, LevelRadio, RadioTrigger } from '../levels/types';

// Événements d'un niveau (plan 04, point 14) : messages de la radio de LUMA déclenchés par la position de Kaï
// (fenêtres de colonnes) ou par un événement du jeu (première surchauffe), et événements du décor
// (LevelData.events : ombre de la créature, secousse qui abat un tronc, pluie de spores), joués par la scène.
// Chacun joue au plus une fois par partie ; une fenêtre que Kaï a dépassée sans y passer (porte, téléportation)
// est sautée. Un objet par partie, créé dans build() (la scène le remet à null dans init()).

/** Fenêtre de colonnes : 0 en attente, 1 jouée, 2 sautée. */
export interface RadioWindow {
  readonly id: RadioId;
  readonly col0: number;
  readonly col1: number;
  state: 0 | 1 | 2;
}

/** Fenêtre d'un événement du décor (mêmes états). */
export interface EventWindow {
  readonly event: LevelEvent;
  readonly col0: number;
  readonly col1: number;
  state: 0 | 1 | 2;
}

export const WINDOW_WAITING = 0;
export const WINDOW_PLAYED = 1;
export const WINDOW_SKIPPED = 2;

/** États notés au point de contrôle d'avant l'arène (« Réessayer le combat ») : fenêtres, événements, déclencheurs. */
export interface EventsSnapshot {
  readonly windows: readonly number[];
  readonly events: readonly number[];
  readonly fired: readonly boolean[];
}

export class LevelEvents {
  /** Lu par les tests (état de chaque fenêtre). */
  readonly windows: RadioWindow[] = [];
  /** Événements du décor, lus par les tests. */
  readonly events: EventWindow[] = [];
  private readonly onTrigger: { readonly on: RadioTrigger; readonly id: RadioId; fired: boolean }[] = [];
  private pending = 0;

  constructor(
    list: readonly LevelRadio[] | undefined,
    private readonly say: (id: RadioId) => void,
    events?: readonly LevelEvent[],
    private readonly play?: (e: LevelEvent) => void,
  ) {
    if (list) {
      for (const r of list) {
        if ('cols' in r) this.windows.push({ id: r.id, col0: r.cols[0], col1: r.cols[1], state: WINDOW_WAITING });
        else this.onTrigger.push({ on: r.on, id: r.id, fired: false });
      }
    }
    if (events) for (const e of events) this.events.push({ event: e, col0: e.cols[0], col1: e.cols[1], state: WINDOW_WAITING });
    this.pending = this.windows.length + this.events.length;
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
    const ev = this.events;
    for (let i = 0; i < ev.length; i++) {
      const win = ev[i];
      if (win.state !== WINDOW_WAITING) continue;
      if (col > win.col1) {
        win.state = WINDOW_SKIPPED;
        this.pending--;
      } else if (col >= win.col0) {
        win.state = WINDOW_PLAYED;
        this.pending--;
        if (this.play) this.play(win.event);
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

  snapshot(): EventsSnapshot {
    return {
      windows: this.windows.map((w) => w.state),
      events: this.events.map((w) => w.state),
      fired: this.onTrigger.map((t) => t.fired),
    };
  }

  /** Reprise d'un combat : messages et événements déjà joués (ou sautés) ne rejouent pas. Rien n'est rejoué ici. */
  restore(s: EventsSnapshot): void {
    const state = (v: number | undefined): 0 | 1 | 2 => (v === WINDOW_PLAYED || v === WINDOW_SKIPPED ? v : WINDOW_WAITING);
    for (let i = 0; i < this.windows.length; i++) this.windows[i].state = state(s.windows[i]);
    for (let i = 0; i < this.events.length; i++) this.events[i].state = state(s.events[i]);
    for (let i = 0; i < this.onTrigger.length; i++) this.onTrigger[i].fired = s.fired[i] === true;
    let n = 0;
    for (const w of this.windows) if (w.state === WINDOW_WAITING) n++;
    for (const w of this.events) if (w.state === WINDOW_WAITING) n++;
    this.pending = n;
  }
}
