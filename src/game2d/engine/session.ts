import type { ModeHooks, SfxId, StageDef, ToastKind } from '../../core/types';
import type { LevelData } from '../levels/types';

// Une « session » = un appel à startPlatformer. Elle relie la poignée renvoyée à l'interface
// et la scène Phaser (réutilisée d'une session à l'autre).

export interface Session {
  readonly id: number;
  readonly stage: StageDef;
  readonly hooks: ModeHooks;
  readonly level: LevelData;
  /** Faux après destroy() ou si une nouvelle session l'a remplacée. */
  alive: boolean;
  /** Pause demandée par l'interface. */
  paused: boolean;
  /** onComplete / onFail déjà envoyé (une seule fois). */
  ended: boolean;
  /** Contexte WebGL perdu : la scène reste figée jusqu'à sa restauration (indépendamment de `paused`). */
  gfxLost: boolean;
}

let nextId = 1;

export function createSession(stage: StageDef, hooks: ModeHooks, level: LevelData): Session {
  return { id: nextId++, stage, hooks, level, alive: true, paused: false, ended: false, gfxLost: false };
}

/**
 * Termine l'étape (onComplete / onFail). L'appel est différé hors de la boucle Phaser :
 * l'interface peut ainsi appeler destroy() directement depuis le callback sans casser la frame en cours.
 */
export function endSession(session: Session, fn: () => void): void {
  if (session.ended || !session.alive) return;
  session.ended = true;
  setTimeout(() => {
    if (session.alive) fn();
  }, 0);
}

// ---------------------------------------------------------------- Accès protégés aux hooks
// Une erreur dans l'audio ou le HUD ne doit jamais casser la boucle de jeu.

const reported = new Set<string>();

function report(where: string, err: unknown): void {
  if (reported.has(where)) return;
  reported.add(where);
  console.error(`[engine2d] ${where}`, err);
}

const sfxOpts: { volume?: number; pitch?: number } = {};

export function sfx(session: Session, id: SfxId, volume = 1, pitch = 1): void {
  try {
    if (volume === 1 && pitch === 1) {
      session.hooks.audio.sfx(id);
    } else {
      // Objet réutilisé : pas d'allocation par son joué.
      sfxOpts.volume = volume;
      sfxOpts.pitch = pitch;
      session.hooks.audio.sfx(id, sfxOpts);
    }
  } catch (err) {
    report('audio.sfx', err);
  }
}

export function haptic(session: Session, pattern: number | number[]): void {
  try {
    session.hooks.audio.haptic(pattern);
  } catch (err) {
    report('audio.haptic', err);
  }
}

export function toast(session: Session, text: string, kind?: ToastKind): void {
  try {
    session.hooks.hud.toast(text, kind);
  } catch (err) {
    report('hud.toast', err);
  }
}

export function reportError(where: string, err: unknown): void {
  report(where, err);
}
