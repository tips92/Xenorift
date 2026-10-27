import { getSave, isUnlocked } from '../../core/save';
import { STAGES } from '../../core/stages';
import type { StageDef } from '../../core/types';
import { div, el, formatNumber, icon, play } from '../dom';
import { ICONS, stageIcon } from '../icons';
import type { UiCtx } from '../services';
import { screenHeader, screenRoot, starRow, type Screen } from './common';

// Choix du niveau : une carte par étape (verrou, record, étoiles).

export interface SelectActions {
  back(): void;
  start(stage: StageDef): void;
}

const SHAKE: Keyframe[] = [
  { transform: 'translate3d(0,0,0)' },
  { transform: 'translate3d(-8px,0,0)' },
  { transform: 'translate3d(7px,0,0)' },
  { transform: 'translate3d(-4px,0,0)' },
  { transform: 'translate3d(0,0,0)' },
];

export function kindLabel(stage: StageDef): string {
  return stage.kind === 'platform' ? 'Plateforme' : 'Vol spatial';
}

export function createLevelSelect(ctx: UiCtx, a: SelectActions): Screen {
  const root = screenRoot('select');
  const save = getSave();

  let stars = 0;
  for (const s of STAGES) stars += save.best[s.id]?.stars ?? 0;
  const total = div('select-total');
  total.setAttribute('aria-label', `${stars} étoiles sur ${STAGES.length * 3}`);
  total.append(icon(ICONS.star, 'star is-on'), el('span', 'select-total-n', `${stars}/${STAGES.length * 3}`));

  root.append(screenHeader(ctx, 'Choix du niveau', a.back, total));

  const body = div('screen-body select-body');
  const cards = div('cards');

  STAGES.forEach((stage, i) => {
    const unlocked = isUnlocked(stage.index);
    const best = save.best[stage.id];

    const c = el('button', `card card--${stage.kind} card--${stage.theme}${unlocked ? '' : ' is-locked'}`);
    c.type = 'button';
    c.style.setProperty('--i', String(i));
    c.setAttribute(
      'aria-label',
      `${stage.title}, ${kindLabel(stage)}${unlocked ? (best ? `, record ${best.score}` : '') : ', verrouillé'}`,
    );

    const top = div('card-top');
    const world = el('span', 'card-world', 'Monde ');
    world.append(el('b', '', String(stage.world)));
    top.append(world, el('span', `badge badge--${stage.kind}`, kindLabel(stage)));

    const art = div('card-art');
    art.innerHTML = stageIcon(stage);

    const title = el('h3', 'card-title', stage.title);
    const sub = el('p', 'card-sub', stage.subtitle);

    const foot = div('card-foot');
    const { row } = starRow(best?.stars ?? 0, 'stars--sm');
    const rec = div('card-best');
    rec.append(el('small', '', 'Record'), el('b', '', best ? formatNumber(best.score) : '—'));
    foot.append(row, rec);

    c.append(top, art, title, sub, foot);

    if (!unlocked) {
      const lock = div('card-lock');
      lock.append(icon(ICONS.lock, 'ico'), el('span', '', 'Verrouillé'));
      c.append(lock);
    }

    c.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isUnlocked(stage.index)) {
        ctx.audio.sfx('click', { pitch: 0.55 });
        ctx.audio.haptic([18, 40, 18]);
        play(c, SHAKE, { duration: 360, easing: 'ease-out' });
        ctx.hud.toast('Termine l’étape précédente pour la débloquer', 'bad');
        return;
      }
      ctx.audio.sfx('click');
      ctx.audio.haptic(10);
      a.start(stage);
    });

    cards.append(c);
  });

  body.append(cards);
  root.append(body);

  return {
    name: 'select',
    el: root,
    back(): boolean {
      a.back();
      return true;
    },
  };
}
