import type { StageDef } from '../../core/types';
import { div, el } from '../dom';
import { stageIcon } from '../icons';
import type { UiCtx } from '../services';
import { screenRoot, type Screen } from './common';
import { kindLabel } from './select';

// Carte d'introduction d'une étape (~2 s, toucher pour passer).

export function createIntroScreen(ctx: UiCtx, stage: StageDef, onSkip: () => void): Screen {
  const root = screenRoot('intro', `intro--${stage.kind} intro--${stage.theme}`);

  const card = div('intro-card');
  const art = div('intro-art');
  art.innerHTML = stageIcon(stage);
  const halo = div('intro-halo');
  const artWrap = div('intro-art-wrap');
  artWrap.append(halo, art);

  card.append(
    artWrap,
    el('span', `badge badge--${stage.kind}`, kindLabel(stage)),
    el('p', 'intro-sub', stage.subtitle),
    el('h2', 'intro-title', stage.title),
    div('intro-line'),
    el('p', 'intro-hint', stage.hint),
  );

  const skip = el('p', 'intro-skip', 'Touche l’écran pour passer');
  const timerBar = div('intro-timer');

  root.append(card, timerBar, skip);

  let skipped = false;
  root.addEventListener('click', (e) => {
    e.preventDefault();
    if (skipped) return;
    skipped = true;
    ctx.audio.sfx('click', { pitch: 1.1 });
    onSkip();
  });

  return {
    name: 'intro',
    el: root,
  };
}
