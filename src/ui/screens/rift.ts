import { t } from '../../core/i18n/locale';
import { UI } from '../../core/i18n/ui';
import { div, el } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenRoot, type Screen } from './common';

// Échec dans une faille. « Harmoniser encore » joue d'abord l'écho du Vide (la vision qui remplace une vidéo),
// puis relance l'arène, vies et cœurs au départ. « Revenir » rend la salle 2D, sans marquer la faille.

export function createRiftDownScreen(ctx: UiCtx, a: { again(): void; back(): void }): Screen {
  const root = screenRoot('rift');
  const panel = div('panel fail-panel');
  panel.append(
    el('h2', 'fail-title', t(UI.riftTitle)),
    el('p', 'fail-reason', t(UI.riftReason)),
    el('p', 'fail-stage', t(UI.riftStage)),
  );
  const actions = div('fail-actions');
  actions.append(
    button(ctx, { label: t(UI.riftAgain), icon: ICONS.rift, cls: 'btn-primary fail-fight', onPress: a.again }),
    button(ctx, { label: t(UI.riftBackRoom), icon: ICONS.back, onPress: a.back }),
  );
  panel.append(actions);
  root.append(panel);
  return {
    name: 'rift',
    el: root,
    back(): boolean {
      a.back();
      return true;
    },
  };
}
