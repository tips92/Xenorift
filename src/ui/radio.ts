import { getSave } from '../core/save';
import { RADIO, TUTORIAL_MARK, type Mood, type RadioMessage, type Speaker } from '../core/story';
import type { AudioApi, RadioId } from '../core/types';
import type { Bubble } from '../story/bubble';

// Radio de LUMA en jeu (plan 04, point 7) : bulle de story/bubble.ts dans le HUD, sous les stats (styles.css),
// jamais cliquable. File de 2 messages en attente au plus ; lettres écrites à 32 par seconde, un bip (lumaBip)
// toutes les 125 ms au plus ; horloge propre (requestAnimationFrame) figée en pause et page cachée. Module des
// bulles chargé à la demande (import dynamique : il n'alourdit pas l'accueil).

/** Messages en attente au plus : un nouveau message chasse le plus ancien. */
const MAX_WAITING = 2;
/** Ouverture de la radio (radioOpen) avant la première lettre (s). */
const OPEN_S = 0.3;
/** Lecture après la dernière lettre (s) : selon la longueur, bornée ; plus courte si un message attend. */
const HOLD_PER_CHAR_S = 0.045;
const HOLD_MIN_S = 2.2;
const HOLD_MAX_S = 5;
const HOLD_BUSY_S = 1.2;
/** Bulle cachée avant le message suivant (s ; fondu de 160 ms). */
const GAP_S = 0.35;
/** Pas maximal (retour de pause ou d'arrière-plan : pas de saut). */
const MAX_DT = 0.1;
const VOWELS = 'aeiouyàâäéèêëîïôöùûüAEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ';

export type RadioPhase = 'idle' | 'open' | 'typing' | 'hold' | 'gap';

/** État lisible (tests : __xrShell.radio()). */
export interface RadioInfo {
  phase: RadioPhase;
  current: RadioId | null;
  waiting: RadioId[];
  /** Messages affichés depuis le dernier clear(), dans l'ordre. */
  played: RadioId[];
  paused: boolean;
  typing: boolean;
}

export interface Radio {
  say(id: RadioId): void;
  /** Vide la file et cache la bulle (HUD masqué : fin ou abandon de l'étape) ; pause levée. */
  clear(): void;
  /** Partie en pause : écriture et délais figés. */
  setPaused(on: boolean): void;
  /** Charge le module des bulles d'avance. */
  prepare(): void;
  info(): RadioInfo;
}

function isVowel(c: number): boolean {
  for (let i = 0; i < VOWELS.length; i++) if (VOWELS.charCodeAt(i) === c) return true;
  return false;
}

/** Hauteur du bip d'une lettre : voyelles un peu plus hautes, variation selon la lettre. */
function letterPitch(c: number): number {
  return isVowel(c) ? 1.08 + (c % 3) * 0.04 : 0.9 + (c % 5) * 0.03;
}

function holdFor(m: RadioMessage): number {
  return Math.min(HOLD_MAX_S, Math.max(HOLD_MIN_S, m.text.length * HOLD_PER_CHAR_S));
}

function tutorialDone(): boolean {
  return getSave().story.seen.includes(TUTORIAL_MARK);
}

/**
 * `parent` : couche du HUD ; `onLayout(h)` : hauteur de la bulle affichée (px), 0 quand elle se cache (les
 * messages de l'interface passent dessous).
 */
export function createRadio(parent: HTMLElement, audio: AudioApi, onLayout: (height: number) => void): Radio {
  let bubble: Bubble | null = null;
  let loading = false;
  const waiting: RadioId[] = [];
  const played: RadioId[] = [];
  let current: RadioMessage | null = null;
  let currentId: RadioId | null = null;
  let phase: RadioPhase = 'idle';
  /** Temps écoulé dans la phase (s). */
  let inPhase = 0;
  let paused = false;
  let raf = 0;
  let last = -1;
  /** Options du bip (objet réutilisé). */
  const bip = { pitch: 1 };

  function onBip(_who: Speaker, mood: Mood, letter: number): void {
    bip.pitch = letterPitch(letter) * (mood === 'scrambled' ? 0.82 + Math.random() * 0.24 : 1);
    audio.sfx('lumaBip', bip);
  }

  function load(): void {
    if (bubble || loading) return;
    loading = true;
    import('../story/bubble')
      .then((m) => {
        bubble = m.createBubble(parent, { className: 'xr-bubble--radio', clock: 'manual', onBip });
        if (paused) bubble.pause();
        wake();
      })
      .catch((err: unknown) => {
        // Nouvel essai au prochain message.
        console.warn('[ui] radio indisponible', err);
      })
      .finally(() => {
        loading = false;
      });
  }

  function running(): boolean {
    return bubble !== null && !paused && !document.hidden && (phase !== 'idle' || waiting.length > 0);
  }

  function setPhase(p: RadioPhase): void {
    phase = p;
    inPhase = 0;
  }

  /** Message suivant de la file : la radio s'ouvre, la bulle paraît (texte encore vide). */
  function next(): void {
    const b = bubble;
    const id = waiting.shift();
    if (!b || id === undefined) {
      setPhase('idle');
      return;
    }
    const m: RadioMessage = RADIO[id];
    current = m;
    currentId = id;
    played.push(id);
    setPhase('open');
    audio.sfx('radioOpen');
    void b.say(m.speaker, m.scrambled ? 'scrambled' : m.mood, m.text);
    // Texte entier déjà en place (lettres transparentes) : hauteur finale.
    onLayout(b.el.offsetHeight);
  }

  function step(b: Bubble, dt: number): void {
    inPhase += dt;
    switch (phase) {
      case 'idle':
        next();
        break;
      case 'open':
        if (inPhase >= OPEN_S) setPhase('typing');
        break;
      case 'typing':
        b.advance(dt);
        if (!b.typing) setPhase('hold');
        break;
      case 'hold': {
        b.advance(dt);
        const hold = current ? holdFor(current) : 0;
        if (inPhase >= (waiting.length > 0 ? Math.min(hold, HOLD_BUSY_S) : hold)) {
          b.hide();
          onLayout(0);
          setPhase('gap');
        }
        break;
      }
      case 'gap':
        if (inPhase >= GAP_S) {
          current = null;
          currentId = null;
          setPhase('idle');
          if (waiting.length > 0) next();
        }
        break;
    }
  }

  function frame(now: number): void {
    raf = 0;
    const b = bubble;
    if (!b || !running()) return;
    const dt = last < 0 ? 0 : Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    step(b, dt);
    if (running()) raf = requestAnimationFrame(frame);
  }

  function wake(): void {
    if (raf || !running()) return;
    last = -1;
    raf = requestAnimationFrame(frame);
  }

  function sleep(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sleep();
    else wake();
  });

  return {
    say(id: RadioId): void {
      if (!Object.prototype.hasOwnProperty.call(RADIO, id)) return;
      const m: RadioMessage = RADIO[id];
      if (m.tutorial && tutorialDone()) return;
      if (currentId === id || waiting.includes(id)) return;
      if (waiting.length >= MAX_WAITING) waiting.shift();
      waiting.push(id);
      load();
      wake();
    },
    clear(): void {
      sleep();
      waiting.length = 0;
      played.length = 0;
      current = null;
      currentId = null;
      setPhase('idle');
      paused = false;
      if (bubble) {
        bubble.hide();
        bubble.resume();
      }
      onLayout(0);
    },
    setPaused(on: boolean): void {
      if (on === paused) return;
      paused = on;
      if (bubble) {
        if (on) bubble.pause();
        else bubble.resume();
      }
      if (on) sleep();
      else wake();
    },
    prepare: load,
    info(): RadioInfo {
      return {
        phase,
        current: currentId,
        waiting: waiting.slice(),
        played: played.slice(),
        paused,
        typing: !!bubble && bubble.typing,
      };
    },
  };
}
