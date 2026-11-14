import { t } from '../core/i18n/locale';
import { UI } from '../core/i18n/ui';
import type { ModeHandle, ModeHooks, StageDef } from '../core/types';
import { FlightRun, UnknownCourseError } from './flight';
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
        ? t(UI.gfxLost)
        : err instanceof UnknownCourseError
          ? err.message
          : t(UI.mode3dFail);
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
