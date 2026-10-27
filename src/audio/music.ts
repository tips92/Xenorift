import type { MusicId } from '../core/types';
import { Band, type MusicHost } from './band';
import { Rng } from './theory';
import { TRACKS, type StepCtx, type TrackDef } from './tracks';

// Séquenceur à anticipation : une minuterie (~25 ms) programme les notes ~120 ms à l'avance
// sur l'horloge de l'AudioContext (précise, indépendante des saccades du fil principal).

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
/** Retard au-delà duquel on saute des pas plutôt que de tout jouer d'un coup (onglet gelé…). */
const MAX_LATE = 0.06;
const CROSSFADE = 0.8;

/** Interface minimale vers le moteur pour régler l'écho partagé. */
export interface MusicFxHost extends MusicHost {
  setDelay(seconds: number, feedback: number): void;
}

class TrackPlayer {
  readonly id: MusicId;
  private readonly def: TrackDef;
  private readonly band: Band;
  private readonly ctx: StepCtx;
  private readonly sd: number;
  private step = 0;
  private next: number;
  /** Instant où le fondu de sortie se termine (Infinity tant que le morceau joue). */
  stopAt = Infinity;
  private readonly seed: number;

  constructor(host: MusicFxHost, id: MusicId, start: number) {
    this.id = id;
    const def = (this.def = TRACKS[id]);
    this.sd = 15 / def.bpm;
    this.next = start;
    this.band = new Band(host, def.mix, def.level);
    this.seed = Math.floor(Math.random() * 1e6);
    this.ctx = { b: this.band, bar: 0, step: 0, t: 0, loop: 0, sd: this.sd, rng: new Rng(), mem: [-1, -1, -1, -1] };
    host.setDelay((def.delayBeats * 60) / def.bpm, def.delayFb);
    this.band.fade(1, CROSSFADE);
  }

  /** Programme tous les pas qui tombent avant `until`. */
  schedule(now: number, until: number): void {
    if (this.next < now - MAX_LATE) {
      const skip = Math.ceil((now - this.next) / this.sd);
      this.step += skip;
      this.next += skip * this.sd;
    }
    const limit = Math.min(until, this.stopAt);
    const def = this.def;
    const c = this.ctx;
    while (this.next < limit) {
      const s = this.step & 15;
      const barAbs = this.step >> 4;
      c.step = s;
      c.bar = barAbs % def.bars;
      c.loop = Math.floor(barAbs / def.bars);
      c.t = this.next + ((s & 1) === 1 ? def.swing * this.sd : 0);
      c.rng.seed(this.seed + c.loop * 7919 + c.bar * 131 + s);
      try {
        def.play(c);
      } catch (err) {
        // Une erreur de composition ne doit jamais bloquer le séquenceur.
        console.error('[audio] music', err);
      }
      this.step++;
      this.next += this.sd;
    }
  }

  fadeOut(now: number, dur: number): void {
    if (this.stopAt !== Infinity) return;
    this.stopAt = now + dur;
    this.band.fade(0, dur);
  }

  dispose(): void {
    this.band.dispose();
  }
}

export class MusicPlayer {
  private readonly host: MusicFxHost;
  private current: TrackPlayer | null = null;
  private readonly fading: TrackPlayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  constructor(host: MusicFxHost) {
    this.host = host;
  }

  /** Identifiant du morceau en cours (null si silence). */
  get playing(): MusicId | null {
    return this.current ? this.current.id : null;
  }

  play(id: MusicId): void {
    if (this.current && this.current.id === id) return;
    const now = this.host.ac.currentTime;
    this.retire(now, CROSSFADE);
    this.current = new TrackPlayer(this.host, id, now + 0.05);
    this.ensureTimer();
    this.tick();
  }

  stop(fade = CROSSFADE): void {
    this.retire(this.host.ac.currentTime, fade);
    this.ensureTimer();
  }

  /** Arrête la minuterie (application en arrière-plan) ; l'horloge audio est elle aussi suspendue. */
  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    this.paused = false;
    this.ensureTimer();
  }

  private retire(now: number, fade: number): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.fadeOut(now, fade);
    this.fading.push(cur);
  }

  private ensureTimer(): void {
    if (this.paused || this.timer !== null) return;
    if (!this.current && this.fading.length === 0) return;
    this.timer = setInterval(this.tick, TICK_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private readonly tick = (): void => {
    const ac = this.host.ac;
    const now = ac.currentTime;
    const until = now + LOOKAHEAD;
    if (this.current) this.current.schedule(now, until);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      if (now > f.stopAt + 0.25) {
        f.dispose();
        this.fading.splice(i, 1);
      } else {
        f.schedule(now, until);
      }
    }
    if (!this.current && this.fading.length === 0) this.clearTimer();
  };
}
