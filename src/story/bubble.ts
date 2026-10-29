import { BUBBLE_CPS, letterGap } from '../core/story';
import { PORTRAIT_FRAME, PORTRAIT_FRAMES, SPEAKER_NAME, renderPortraitStrip } from './portraits';
import { ensureStoryStyles } from './styles';
import type { Mood, Speaker } from './types';

// Bulle de dialogue DOM, commune aux cinématiques et à la radio de LUMA en jeu (ui/radio.ts) : portrait animé dans un
// <canvas>, nom, texte écrit lettre à lettre avec de petits bips (8 par seconde au plus, un seul à la fois),
// texte complet posé une fois dans un nœud aria-live masqué. Jamais cliquable (pointer-events: none) : un
// toucher ailleurs appelle finish(). Horloge propre (requestAnimationFrame, pas borné) ou pilotée par
// advance(dt) (lecteur de cinématiques : rendu déterministe à n'importe quel instant).

export interface BubbleOptions {
  /**
   * Bip de voix : appelé au plus 8 fois par seconde (jamais deux à moins de 125 ms) ; `letter` : code de la
   * dernière lettre écrite (hauteur du bip).
   */
  onBip?: (speaker: Speaker, mood: Mood, letter: number) => void;
  /** Classe(s) ajoutée(s) à la bulle (placement : ex. 'xr-bubble--radio' en jeu, 'cs-bubble' en cinématique). */
  className?: string;
  /** 'auto' (défaut) : horloge propre ; 'manual' : le texte n'avance que par advance(dt). */
  clock?: 'auto' | 'manual';
  /** Lettres par seconde (32 par défaut). */
  cps?: number;
}

export interface Bubble {
  readonly el: HTMLElement;
  /** Affiche la bulle et écrit `text` ; résout quand tout est affiché (ou bulle cachée, remplacée, détruite). */
  say(speaker: Speaker, mood: Mood, text: string): Promise<void>;
  /** Texte complet tout de suite. */
  finish(): void;
  hide(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  /** Avance l'horloge de la bulle de `dt` secondes (mode 'manual' ; `silent` : sans bip, pour un saut). */
  advance(dt: number, silent?: boolean): void;
  /** Lettres encore à écrire. */
  readonly typing: boolean;
  readonly visible: boolean;
}

// Rythme de l'écriture (lettres par seconde, pauses après la ponctuation) : core/story.ts.
export { BUBBLE_CPS, typingDuration } from '../core/story';
/** Écart minimal entre deux bips (s) : 8 par seconde au plus. */
export const BIP_GAP_S = 0.125;
/** Dernier bip, toutes bulles confondues (ms, horloge réelle) : une seule voix même si deux bulles parlent. */
let lastBipAtMs = -1e9;
/** Pas maximal de l'horloge propre (retour d'arrière-plan : pas de saut). */
const MAX_DT = 0.1;
const DPR_MAX = 1.5;

/** Lettres et chiffres : un bip ; espaces (insécables compris) et ponctuation (. , ; : ! ? … ’ « » –) : aucun. */
function isSpoken(c: number): boolean {
  if (c < 128) return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  // Latin-1 : lettres à partir de À (sauf × et ÷) ; au-delà de U+2000 : espaces fines et ponctuation.
  return c >= 192 && c < 0x2000 && c !== 215 && c !== 247;
}

export function createBubble(parent: HTMLElement, opts: BubbleOptions = {}): Bubble {
  ensureStoryStyles();
  const cps = opts.cps && opts.cps > 0 ? opts.cps : BUBBLE_CPS;
  const manual = opts.clock === 'manual';

  const el = document.createElement('div');
  el.className = 'xr-bubble is-hidden' + (opts.className ? ' ' + opts.className : '');
  const portrait = document.createElement('canvas');
  portrait.className = 'xr-bubble-portrait';
  portrait.setAttribute('aria-hidden', 'true');
  const pctx = portrait.getContext('2d');
  const body = document.createElement('div');
  body.className = 'xr-bubble-body';
  const head = document.createElement('div');
  head.className = 'xr-bubble-head';
  const nameEl = document.createElement('span');
  nameEl.className = 'xr-bubble-name';
  const statusEl = document.createElement('span');
  statusEl.className = 'xr-bubble-status';
  head.append(nameEl, statusEl);
  const textEl = document.createElement('p');
  textEl.className = 'xr-bubble-text';
  textEl.setAttribute('aria-hidden', 'true');
  body.append(head, textEl);
  const sr = document.createElement('span');
  sr.className = 'xr-sr';
  sr.setAttribute('aria-live', 'polite');
  el.append(portrait, body, sr);
  parent.append(el);

  /** Une lettre = un <span> (réutilisés d'une réplique à l'autre) : l'écrire ne change que sa couleur. */
  const spans: HTMLSpanElement[] = [];
  let text = '';
  let total = 0;
  let revealed = 0;
  let clock = 0;
  let nextAt = 0;
  let lastBip = -1;
  let speaker: Speaker = 'luma';
  let mood: Mood = 'neutral';
  let shown = false;
  let paused = false;
  let destroyed = false;
  let pending: (() => void) | null = null;

  // Portrait : planches pré-rendues par (qui, humeur) à la taille du canvas, libérées par destroy().
  const strips = new Map<string, HTMLCanvasElement>();
  let strip: HTMLCanvasElement | null = null;
  let stripPx = 0;
  let drawnFrame = -1;

  let raf = 0;
  let last = -1;

  function settle(): void {
    const p = pending;
    pending = null;
    if (p) p();
  }

  function setPortrait(): void {
    if (!pctx) return;
    const dpr = Math.min(DPR_MAX, Math.max(1, window.devicePixelRatio || 1));
    const css = portrait.clientWidth || 64;
    const px = Math.max(16, Math.round(css * dpr));
    if (px !== stripPx) {
      for (const c of strips.values()) {
        c.width = 0;
        c.height = 0;
      }
      strips.clear();
      stripPx = px;
      portrait.width = px;
      portrait.height = px;
    }
    const key = speaker + ':' + mood;
    let s = strips.get(key);
    if (!s) {
      s = renderPortraitStrip(speaker, mood, px);
      strips.set(key, s);
    }
    strip = s;
    drawnFrame = -1;
  }

  function portraitFrame(): number {
    if (mood === 'scrambled') return Math.floor(clock / 0.1) % PORTRAIT_FRAMES;
    if (revealed < total) {
      // Bouche fermée pendant les pauses de ponctuation.
      if (nextAt - clock > 0.06) return PORTRAIT_FRAME.idle;
      const k = Math.floor(clock / 0.09) & 3;
      return k === 1 ? PORTRAIT_FRAME.talkB : k === 3 ? PORTRAIT_FRAME.idle : PORTRAIT_FRAME.talkA;
    }
    return clock % 3.4 < 0.13 ? PORTRAIT_FRAME.blink : PORTRAIT_FRAME.idle;
  }

  function drawPortraitFrame(): void {
    if (!pctx || !strip || stripPx <= 0) return;
    const f = portraitFrame();
    if (f === drawnFrame) return;
    drawnFrame = f;
    pctx.clearRect(0, 0, stripPx, stripPx);
    pctx.drawImage(strip, f * stripPx, 0, stripPx, stripPx, 0, 0, stripPx, stripPx);
  }

  function revealAll(): void {
    while (revealed < total) spans[revealed++].className = 'is-on';
    settle();
  }

  function advance(dt: number, silent = false): void {
    if (destroyed || !shown) return;
    clock += Math.max(0, dt);
    if (revealed < total) {
      let letters = 0;
      let letter = 0;
      while (revealed < total && nextAt <= clock) {
        spans[revealed].className = 'is-on';
        const c = text.charCodeAt(revealed);
        revealed++;
        nextAt += letterGap(c, cps);
        if (isSpoken(c)) {
          letters++;
          letter = c;
        }
      }
      // Un seul bip par pas, jamais deux à moins de 125 ms, ni dans cette bulle (son horloge) ni entre deux
      // bulles (horloge réelle), et aucun pendant un saut dans le temps.
      if (letters > 0 && !silent && dt <= MAX_DT && clock - lastBip >= BIP_GAP_S) {
        const now = performance.now();
        if (now - lastBipAtMs >= BIP_GAP_S * 1000) {
          lastBip = clock;
          lastBipAtMs = now;
          if (opts.onBip) opts.onBip(speaker, mood, letter);
        }
      }
      if (revealed >= total) settle();
    }
    drawPortraitFrame();
  }

  function loop(now: number): void {
    raf = 0;
    if (destroyed || paused || !shown) return;
    const dt = last < 0 ? 0 : Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    advance(dt);
    raf = requestAnimationFrame(loop);
  }

  function sync(): void {
    const want = !manual && !destroyed && !paused && shown;
    if (want && !raf) {
      last = -1;
      raf = requestAnimationFrame(loop);
    } else if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  return {
    el,
    get typing(): boolean {
      return shown && revealed < total;
    },
    get visible(): boolean {
      return shown;
    },
    say(who: Speaker, how: Mood, line: string): Promise<void> {
      if (destroyed) return Promise.resolve();
      settle();
      speaker = who;
      mood = how;
      text = line;
      total = line.length;
      revealed = 0;
      el.dataset.speaker = who;
      el.dataset.mood = how;
      nameEl.textContent = SPEAKER_NAME[who];
      statusEl.textContent = how === 'scrambled' ? 'signal brouillé' : '';
      while (spans.length < total) spans.push(document.createElement('span'));
      const frag = document.createDocumentFragment();
      for (let i = 0; i < total; i++) {
        const s = spans[i];
        s.className = '';
        s.textContent = line[i];
        frag.append(s);
      }
      textEl.replaceChildren(frag);
      // Texte complet pour les lecteurs d'écran (vidé d'abord : une même réplique est relue).
      sr.textContent = '';
      sr.textContent = SPEAKER_NAME[who] + ' : ' + line;
      shown = true;
      el.classList.remove('is-hidden');
      nextAt = clock;
      lastBip = -1;
      setPortrait();
      drawPortraitFrame();
      const done = new Promise<void>((resolve) => {
        pending = resolve;
      });
      if (total === 0) settle();
      sync();
      return done;
    },
    finish(): void {
      if (destroyed || !shown) return;
      revealAll();
      drawPortraitFrame();
    },
    hide(): void {
      if (destroyed) return;
      shown = false;
      revealed = total;
      el.classList.add('is-hidden');
      settle();
      sync();
    },
    pause(): void {
      if (destroyed || paused) return;
      paused = true;
      el.classList.add('is-paused');
      sync();
    },
    resume(): void {
      if (destroyed || !paused) return;
      paused = false;
      el.classList.remove('is-paused');
      sync();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      shown = false;
      sync();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      settle();
      for (const c of strips.values()) {
        c.width = 0;
        c.height = 0;
      }
      strips.clear();
      strip = null;
      portrait.width = 0;
      portrait.height = 0;
      spans.length = 0;
      el.remove();
    },
    advance,
  };
}
