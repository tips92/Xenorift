import { t, tf } from '../../core/i18n/locale';
import { UI } from '../../core/i18n/ui';
import { stageSubtitle, stageTitle } from '../../core/story';
import type { StageDef } from '../../core/types';
import { clamp, div, el, formatNumber, icon } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenRoot, type Screen } from './common';

// Écrans de fin : mission échouée, fin de la démo, erreur de lancement.

/**
 * Mission échouée. `retryFight` : échec en plein combat de boss (le mode a rendu un point de reprise) → bouton
 * « Réessayer le combat » en premier, « Réessayer » (tout le niveau) devient secondaire.
 */
export function createFailScreen(
  ctx: UiCtx,
  stage: StageDef,
  reason: string,
  a: { retry(): void; retryFight: (() => void) | null; menu(): void },
): Screen {
  const root = screenRoot('fail');
  const panel = div('panel fail-panel');
  const badge = div('fail-badge');
  badge.append(icon(ICONS.warning, 'ico'));
  panel.append(
    badge,
    el('h2', 'fail-title', t(UI.missionFailed)),
    el('p', 'fail-reason', reason.trim() || t(UI.retreat)),
    el('p', 'fail-stage', `${stageSubtitle(stage.world, stage.part)} · ${stageTitle(stage.id)}`),
  );
  const actions = div('fail-actions');
  if (a.retryFight) {
    actions.append(button(ctx, { label: t(UI.retryFight), icon: ICONS.aim, cls: 'btn-primary fail-fight', onPress: a.retryFight }));
  }
  actions.append(
    button(ctx, { label: t(UI.retry), icon: ICONS.restart, cls: a.retryFight ? '' : 'btn-primary', onPress: a.retry }),
    button(ctx, { label: t(UI.menu), icon: ICONS.home, onPress: a.menu }),
  );
  panel.append(actions);
  root.append(panel);
  return {
    name: 'fail',
    el: root,
    back(): boolean {
      a.menu();
      return true;
    },
  };
}

export interface EndData {
  total: number;
  stars: number;
  maxStars: number;
}

export function createEndScreen(ctx: UiCtx, d: EndData, a: { menu(): void }): Screen {
  const root = screenRoot('end');

  const flyby = div('end-flyby');
  const ship = div('end-ship');
  ship.innerHTML = ICONS.ship;
  flyby.append(ship);

  const sparks = div('end-sparks');
  for (let i = 0; i < 14; i++) {
    const s = div('end-spark');
    s.style.setProperty('--i', String(i));
    sparks.append(s);
  }

  const panel = div('panel end-panel');
  const totalEl = el('b', 'end-total-n', '0');
  const total = div('end-total');
  total.append(el('span', 'end-total-label', t(UI.totalScore)), totalEl);
  const stars = div('end-stars');
  stars.append(icon(ICONS.star, 'star is-on'), el('span', '', tf(UI.starsShort, { n: d.stars, max: d.maxStars })));

  panel.append(
    el('p', 'end-kicker', t(UI.endKicker)),
    el('h2', 'end-title', t(UI.endTitle)),
    el('p', 'end-text', t(UI.endText)),
    total,
    stars,
  );
  const actions = div('end-actions');
  actions.append(button(ctx, { label: t(UI.menu), icon: ICONS.home, cls: 'btn-primary', onPress: a.menu }));
  panel.append(actions);

  root.append(sparks, flyby, panel);

  const target = Math.max(0, Math.round(d.total));
  const duration = clamp(900 + target / 30, 1000, 2200);
  let raf = 0;
  let t0 = 0;
  let done = false;

  function tick(now: number): void {
    if (done) return;
    if (!t0) t0 = now;
    const k = Math.min(1, (now - t0) / duration);
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    totalEl.textContent = formatNumber(target * e);
    if (k < 1) raf = requestAnimationFrame(tick);
  }

  return {
    name: 'end',
    el: root,
    shown(): void {
      if (t0 || done) return;
      raf = requestAnimationFrame(tick);
    },
    back(): boolean {
      a.menu();
      return true;
    },
    dispose(): void {
      done = true;
      cancelAnimationFrame(raf);
    },
  };
}

export function createErrorScreen(
  ctx: UiCtx,
  stage: StageDef | null,
  message: string,
  a: { retry: (() => void) | null; menu(): void },
): Screen {
  const root = screenRoot('error');
  const panel = div('panel error-panel');
  const badge = div('fail-badge');
  badge.append(icon(ICONS.warning, 'ico'));
  const msg = el('pre', 'error-msg', message.trim() || t(UI.unknownError));
  panel.append(
    badge,
    el('h2', 'fail-title', t(UI.errorTitle)),
    el('p', 'fail-reason', stage ? tf(UI.launchFail, { title: stageTitle(stage.id) }) : t(UI.problem)),
    msg,
  );
  const actions = div('fail-actions');
  if (a.retry) {
    actions.append(button(ctx, { label: t(UI.retry), icon: ICONS.restart, cls: 'btn-primary', onPress: a.retry }));
  }
  actions.append(button(ctx, { label: t(UI.menu), icon: ICONS.home, onPress: a.menu }));
  panel.append(actions);
  root.append(panel);
  return {
    name: 'error',
    el: root,
    back(): boolean {
      a.menu();
      return true;
    },
  };
}
