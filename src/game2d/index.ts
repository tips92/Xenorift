import type { ModeHandle, ModeHooks, StageDef } from '../core/types';
import { pauseSession, releaseSession, resumeSession, runSession } from './engine/game';
import { createSession, reportError } from './engine/session';
import { getLevel } from './levels';

// Mode plateforme 2D (Phaser 3). La signature exportée ne doit pas changer.

export function startPlatformer(container: HTMLElement, stage: StageDef, hooks: ModeHooks): ModeHandle {
  const level = getLevel(stage.levelId);
  const session = createSession(stage, hooks, level);

  try {
    hooks.input.clearPresses();
  } catch (err) {
    reportError('input.clearPresses', err);
  }
  try {
    hooks.audio.music(level.music);
  } catch (err) {
    reportError('audio.music', err);
  }

  runSession(container, session);

  return {
    pause(): void {
      if (!session.alive || session.paused) return;
      session.paused = true;
      pauseSession(session);
    },
    resume(): void {
      if (!session.alive || !session.paused) return;
      session.paused = false;
      // Les appuis faits pendant la pause ne doivent pas déclencher de saut / tir.
      try {
        hooks.input.clearPresses();
      } catch (err) {
        reportError('input.clearPresses', err);
      }
      resumeSession(session);
    },
    destroy(): void {
      if (!session.alive) return;
      session.alive = false;
      releaseSession(session);
    },
  };
}
