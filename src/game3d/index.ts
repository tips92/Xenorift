import type { ModeHandle, ModeHooks, StageDef } from '../core/types';
import { CONTEXT_LOST_REASON, FlightRun, UnknownCourseError } from './flight';
import { ContextLostError } from './renderer';

// Mode vol spatial 3D (Three.js) : la Comète file dans un couloir de portails jusqu'au grand
// portail de distorsion. La signature exportée ne doit pas changer.

export function startFlight(container: HTMLElement, stage: StageDef, hooks: ModeHooks): ModeHandle {
  try {
    const run = new FlightRun(container, stage, hooks);
    return {
      pause: () => run.pause(),
      resume: () => run.resume(),
      destroy: () => run.destroy(),
    };
  } catch (err) {
    // WebGL indisponible (vieux appareil, contexte perdu…) ou parcours inconnu : on sort proprement de l'étape.
    console.error('[flight3d] démarrage impossible', err);
    const reason =
      err instanceof ContextLostError
        ? CONTEXT_LOST_REASON
        : err instanceof UnknownCourseError
          ? err.message
          : 'Mode 3D indisponible sur cet appareil';
    let failed = false;
    const timer = window.setTimeout(() => {
      failed = true;
      hooks.onFail(reason);
    }, 0);
    return {
      pause: () => undefined,
      resume: () => undefined,
      destroy: () => {
        if (!failed) window.clearTimeout(timer);
      },
    };
  }
}
