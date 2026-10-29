import type { Ctx } from '../game2d/art/util';
import { type Bubble, createBubble } from './bubble';
import { type CutsceneEvent, type CutsceneScript, type View, VH } from './scenes/common';
import { createLiberation } from './scenes/liberation';
import { createPrologue } from './scenes/prologue';
import { ensureStoryStyles } from './styles';
import type { CutsceneAudio, CutsceneHandle, CutsceneId, LiberationParams, Mood, Speaker } from './types';

// Lecteur de cinématiques : un <canvas> 2D plein cadre dans `root` (pas de WebGL : aucun second contexte), la
// bulle de dialogue, un bouton Passer (<button class="cs-skip">) et un nœud aria-live. Horloge à pas borné
// (100 ms au plus : pas de saut au retour d'arrière-plan), arrêtée en pause (pause() de l'interface et page
// cachée, cumulables). Calques pré-rendus à la construction et à chaque changement de taille ; une image ne
// dépend que du temps (startAtS : départ à n'importe quel instant, images reproductibles). Un toucher sur
// l'image termine la réplique en cours. destroy() libère boucle, écouteurs, DOM et calques.

export interface CutsceneOptions {
  audio: CutsceneAudio;
  /** Libération : gardien et compétence (défaut : monde 1, « Méduse-baleine », « DOUBLE SAUT »). */
  params?: LiberationParams;
  /** Départ à cet instant (s) : les repères sonores antérieurs ne sont pas joués. */
  startAtS?: number;
}

/** Poignée enrichie (lecture seule) pour les tests et l'aperçu ; assignable à CutsceneHandle. */
export interface CutscenePlayer extends CutsceneHandle {
  /** Horloge de la cinématique (s). */
  readonly time: number;
  readonly duration: number;
  /** En pause (interface ou page cachée). */
  readonly paused: boolean;
  readonly state: 'playing' | 'ended' | 'skipped';
  readonly bubble: Bubble | null;
}

export const DEFAULT_LIBERATION: LiberationParams = { world: 1, guardianName: 'Méduse-baleine', skillLabel: 'DOUBLE SAUT' };

/** Pas maximal de l'horloge (s). */
const MAX_DT = 0.1;
const DPR_MAX = 1.5;
/** Police des bandeaux de la libération (Orbitron, chargée par l'interface via @fontsource). */
const BANNER_FONT = "800 20px 'Orbitron'";

const SKIP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" d="M5 6l6 6-6 6M13 6l6 6-6 6"/></svg>';

function createScript(id: CutsceneId, params: LiberationParams | undefined): CutsceneScript {
  return id === 'liberation' ? createLiberation(params ?? DEFAULT_LIBERATION) : createPrologue();
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function playCutscene(root: HTMLElement, id: CutsceneId, opts: CutsceneOptions): CutscenePlayer {
  ensureStoryStyles();
  const audio = opts.audio;
  let state: 'playing' | 'ended' | 'skipped' = 'playing';
  let destroyed = false;
  let resolveDone: (r: 'ended' | 'skipped') => void = () => undefined;
  const done = new Promise<'ended' | 'skipped'>((resolve) => {
    resolveDone = resolve;
  });

  // ------------------------------------------------------------ DOM
  const box = document.createElement('div');
  box.className = 'cs';
  box.dataset.cutscene = id;
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Cinématique');
  const cnv = document.createElement('canvas');
  cnv.className = 'cs-canvas';
  cnv.setAttribute('aria-hidden', 'true');
  const ctx = cnv.getContext('2d', { alpha: false }) as Ctx | null;
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'cs-skip';
  skipBtn.setAttribute('aria-label', 'Passer la cinématique');
  skipBtn.innerHTML = '<span>Passer</span>' + SKIP_ICON;
  const live = document.createElement('div');
  live.className = 'xr-sr';
  live.setAttribute('aria-live', 'polite');
  box.append(cnv, skipBtn, live);
  root.append(box);

  const audioCue: CutsceneAudio['cue'] = (c) => {
    try {
      audio.cue(c);
    } catch (err) {
      // Le son ne doit jamais bloquer la cinématique.
      console.warn('[story] repère sonore', c, err);
    }
  };
  const onBip = (who: Speaker, mood: Mood, letter: number): void => {
    if (!audio.bip) {
      audioCue('bip');
      return;
    }
    try {
      audio.bip(who, mood, letter);
    } catch (err) {
      console.warn('[story] bip', err);
    }
  };
  const bubble = createBubble(box, { className: 'cs-bubble', clock: 'manual', onBip });

  // ------------------------------------------------------------ Script et vue
  let script: CutsceneScript | null = null;
  let warned = false;
  try {
    script = createScript(id, opts.params);
  } catch (err) {
    console.error('[story] cinématique impossible', err);
  }
  const duration = script ? script.duration : 0;
  const events: readonly CutsceneEvent[] = script ? script.events : [];
  let t = Math.max(0, Math.min(duration, opts.startAtS ?? 0));
  let nextEvent = 0;

  const reduced = reducedMotion();
  const view = { w: 0, h: 0, k: 1, vw: 0, reduced, skipLeft: 0 } as { -readonly [K in keyof View]: View[K] };
  /** Largeur de la boîte (px CSS) au dernier calcul de la vue. */
  let boxW = 0;
  /** Calques à revoir : 0 non, 1 si la taille a changé (ResizeObserver), 2 toujours (police chargée). */
  let dirty = 0;

  /** Taille du canvas = celle de la boîte × densité (≤ 1,5) ; reconstruit les calques si elle change. */
  function layout(force: boolean): void {
    if (!script || destroyed) return;
    const dpr = Math.min(DPR_MAX, Math.max(1, window.devicePixelRatio || 1));
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    boxW = cw;
    const w = Math.max(1, Math.round(cw * dpr));
    const h = Math.max(1, Math.round(ch * dpr));
    if (!force && w === view.w && h === view.h) return;
    view.w = w;
    view.h = h;
    view.k = h / VH;
    view.vw = w / view.k;
    cnv.width = w;
    cnv.height = h;
    if (cw < 2 || ch < 2) return;
    try {
      script.build(view);
    } catch (err) {
      console.error('[story] calques impossibles', err);
      script.release();
    }
  }

  function render(): void {
    if (!ctx || !script || destroyed || view.w < 2 || view.h < 2) return;
    // Bord gauche de Passer relu à chaque image (deux entiers, sans allocation) : l'encoche (--sar) ou la police
    // du bouton le déplacent sans changer la taille de la boîte.
    const sw = skipBtn.offsetWidth;
    view.skipLeft = sw > 0 && boxW > 0 ? (view.vw * skipBtn.offsetLeft) / boxW : view.vw;
    try {
      script.draw(ctx, t, view);
    } catch (err) {
      // Une erreur de dessin ne doit pas bloquer l'enchaînement : notée une fois, la chronologie continue.
      if (!warned) console.error('[story] image', err);
      warned = true;
    }
  }

  // ------------------------------------------------------------ Chronologie

  /** Déclenche les événements de (t0, t1] (t0 inclus au départ). */
  function fire(t1: number): void {
    while (nextEvent < events.length && events[nextEvent].t <= t1) {
      const e = events[nextEvent++];
      if (e.cue) audioCue(e.cue);
      if (e.say) void bubble.say(e.say.speaker, e.say.mood, e.say.text);
      if (e.hide) bubble.hide();
      if (e.announce) live.textContent = e.announce;
    }
  }

  /** Départ à t (> 0) : réplique en cours remise dans son état, sans les sons ni les bips d'avant. */
  function seek(): void {
    let sayIdx = -1;
    let hidden = false;
    while (nextEvent < events.length && events[nextEvent].t < t) {
      const e = events[nextEvent];
      if (e.say) {
        sayIdx = nextEvent;
        hidden = false;
      }
      if (e.hide) hidden = true;
      nextEvent++;
    }
    if (sayIdx >= 0 && !hidden) {
      const e = events[sayIdx];
      if (e.say) {
        void bubble.say(e.say.speaker, e.say.mood, e.say.text);
        bubble.advance(t - e.t, true);
      }
    }
  }

  function finish(result: 'ended' | 'skipped'): void {
    if (state !== 'playing') return;
    state = result;
    box.classList.add('is-over');
    stopLoop();
    bubble.pause();
    resolveDone(result);
  }

  // ------------------------------------------------------------ Boucle

  let raf = 0;
  let last = -1;
  let userPaused = false;
  let hiddenPaused = typeof document !== 'undefined' && document.hidden === true;

  function step(now: number): void {
    raf = 0;
    if (destroyed || state !== 'playing') return;
    const dt = last < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    if (dirty) {
      const force = dirty === 2;
      dirty = 0;
      layout(force);
    }
    const t1 = Math.min(duration, t + dt);
    fire(t1);
    t = t1;
    bubble.advance(dt);
    render();
    if (t >= duration) {
      finish('ended');
      return;
    }
    raf = requestAnimationFrame(step);
  }

  function stopLoop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /** Boucle en marche seulement si rien ne la met en pause. */
  function sync(): void {
    const want = !destroyed && state === 'playing' && !userPaused && !hiddenPaused;
    if (want && !raf) {
      last = -1;
      bubble.resume();
      raf = requestAnimationFrame(step);
    } else if (!want && raf) {
      stopLoop();
      bubble.pause();
    } else if (!want) {
      bubble.pause();
    }
  }

  // ------------------------------------------------------------ Écouteurs

  const onVisibility = (): void => {
    hiddenPaused = document.hidden;
    sync();
  };
  /** Taille changée (force = false : rien à refaire si le canvas garde sa taille) ou police chargée (true). */
  const relayout = (force: boolean): void => {
    if (destroyed) return;
    dirty = Math.max(dirty, force ? 2 : 1);
    // En pause, la boucle ne tourne pas : on redessine tout de suite.
    if (!raf) {
      dirty = 0;
      layout(force);
      render();
    }
  };
  const onResize = (): void => relayout(false);
  const onTap = (e: PointerEvent): void => {
    if (e.target instanceof Element && e.target.closest('.cs-skip')) return;
    if (bubble.typing) bubble.finish();
  };
  const onSkip = (): void => {
    finish('skipped');
  };
  document.addEventListener('visibilitychange', onVisibility);
  box.addEventListener('pointerdown', onTap);
  skipBtn.addEventListener('click', onSkip);
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(onResize);
    observer.observe(box);
  } else {
    window.addEventListener('resize', onResize);
  }
  // Police des bandeaux (libération) pas encore chargée : demandée, calques refaits quand elle arrive.
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (id === 'liberation' && fonts) {
    try {
      if (!fonts.check(BANNER_FONT)) {
        fonts.load(BANNER_FONT).then(
          () => relayout(true),
          () => undefined,
        );
      }
    } catch {
      // API des polices absente : bandeaux dans la police de repli.
    }
  }

  // ------------------------------------------------------------ Démarrage

  if (!script || !ctx) {
    finish('skipped');
  } else {
    layout(true);
    dirty = 0;
    if (t > 0) seek();
    fire(t);
    render();
    sync();
  }

  return {
    get done() {
      return done;
    },
    get time(): number {
      return t;
    },
    duration,
    get paused(): boolean {
      return userPaused || hiddenPaused;
    },
    get state() {
      return state;
    },
    get bubble(): Bubble | null {
      return destroyed ? null : bubble;
    },
    pause(): void {
      userPaused = true;
      sync();
    },
    resume(): void {
      userPaused = false;
      sync();
    },
    skip(): void {
      finish('skipped');
    },
    destroy(): void {
      if (destroyed) return;
      finish('skipped');
      destroyed = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      box.removeEventListener('pointerdown', onTap);
      skipBtn.removeEventListener('click', onSkip);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', onResize);
      bubble.destroy();
      if (script) script.release();
      script = null;
      cnv.width = 0;
      cnv.height = 0;
      box.remove();
    },
  };
}
