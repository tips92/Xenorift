import { getSave } from '../core/save';
import { BUBBLE_CPS, RADIO, RADIO_TIMING, TUTORIAL_MARK, radioHoldS, type Mood, type RadioMessage, type Speaker } from '../core/story';
import type { AudioApi, RadioId } from '../core/types';
import type { Bubble } from '../story/bubble';

// Radio de LUMA en jeu (plan 04, point 7) : bulle de story/bubble.ts dans le HUD, sous les stats (styles.css),
// jamais cliquable. File de 2 messages en attente au plus (un message `urgent` passe devant, un message `interrupt`
// remplace aussitôt celui de la bulle et fait oublier les autres ; un message `castaway` se tait une fois ce naufragé
// dans l'équipage) ; lettres écrites à
// 32 par seconde, un bip (lumaBip) toutes les 125 ms au plus ; horloge propre (requestAnimationFrame) figée en
// pause et page cachée. Module des
// bulles chargé à la demande (import dynamique : il n'alourdit pas l'accueil). Rythme : RADIO_TIMING de
// core/story.ts (check-levels simule la file avec). Texte du clavier (`keys`) sans commandes tactiles.

const { openS: OPEN_S, holdBusyS: HOLD_BUSY_S, gapS: GAP_S, maxWaiting: MAX_WAITING } = RADIO_TIMING;
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
  /** Texte du message affiché (`keys` au clavier), '' sans message. */
  text: string;
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

function tutorialDone(): boolean {
  return getSave().story.seen.includes(TUTORIAL_MARK);
}

/**
 * `parent` : couche du HUD ; `onLayout(h)` : hauteur de la bulle affichée (px), 0 quand elle se cache (les
 * messages de l'interface passent dessous) ; `touchShown()` : commandes tactiles affichées (sinon texte `keys`).
 */
export function createRadio(
  parent: HTMLElement,
  audio: AudioApi,
  onLayout: (height: number) => void,
  touchShown: () => boolean,
): Radio {
  let bubble: Bubble | null = null;
  let loading = false;
  const waiting: RadioId[] = [];
  const played: RadioId[] = [];
  let current: RadioMessage | null = null;
  let currentId: RadioId | null = null;
  /** Texte affiché (tactile ou clavier) et sa lecture après la dernière lettre. */
  let currentText = '';
  let currentHold = 0;
  let phase: RadioPhase = 'idle';
  /** Temps écoulé dans la phase (s). */
  let inPhase = 0;
  let paused = false;
  let raf = 0;
  let last = -1;
  /** Options du bip (objet réutilisé). */
  const bip = { pitch: 1 };

  function onBip(who: Speaker, mood: Mood, letter: number): void {
    // Tess (naufragée de j2) : voix un peu plus aiguë que LUMA.
    bip.pitch = letterPitch(letter) * (mood === 'scrambled' ? 0.82 + Math.random() * 0.24 : 1) * (who === 'tess' ? 1.2 : 1);
    audio.sfx('lumaBip', bip);
  }

  function load(): void {
    if (bubble || loading) return;
    loading = true;
    import('../story/bubble')
      .then((m) => {
        bubble = m.createBubble(parent, { className: 'xr-bubble--radio', clock: 'manual', cps: BUBBLE_CPS, onBip });
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
    currentText = m.keys && !touchShown() ? m.keys : m.text;
    currentHold = radioHoldS(currentText);
    played.push(id);
    setPhase('open');
    audio.sfx('radioOpen');
    void b.say(m.speaker, m.scrambled ? 'scrambled' : m.mood, currentText);
    // Texte entier déjà en place (lettres transparentes) : hauteur finale.
    onLayout(b.el.offsetHeight);
  }

  /**
   * Dialogue d'une action de Kaï (`interrupt`) : la file est oubliée (sauf ce dialogue) et le message en cours coupé,
   * sans trou : la bulle passe au dialogue à l'image suivante (engine/npc.ts cale la dissolution sur ce départ).
   */
  function cutIn(): void {
    for (let i = waiting.length - 1; i >= 0; i--) {
      const w: RadioMessage = RADIO[waiting[i]];
      if (!w.interrupt) waiting.splice(i, 1);
    }
    if (current && !current.interrupt) {
      current = null;
      currentId = null;
      currentText = '';
      setPhase('idle');
    }
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
        const hold = current ? currentHold : 0;
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
          currentText = '';
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
      if (m.castaway && getSave().crew.includes(m.castaway)) return;
      if (currentId === id || waiting.includes(id)) return;
      if (m.interrupt) cutIn();
      if (waiting.length >= MAX_WAITING) waiting.shift();
      if (m.urgent) {
        // Devant les messages en attente, mais pas devant un dialogue (`interrupt`) commencé.
        let i = 0;
        while (i < waiting.length && (RADIO[waiting[i]] as RadioMessage).interrupt) i++;
        waiting.splice(i, 0, id);
      } else {
        waiting.push(id);
      }
      load();
      wake();
    },
    clear(): void {
      sleep();
      waiting.length = 0;
      played.length = 0;
      current = null;
      currentId = null;
      currentText = '';
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
        text: currentText,
      };
    },
  };
}
