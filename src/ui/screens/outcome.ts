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
    el('h2', 'fail-title', 'MISSION ÉCHOUÉE'),
    el('p', 'fail-reason', reason.trim() || 'Kaï doit battre en retraite…'),
    el('p', 'fail-stage', `${stage.subtitle} · ${stage.title}`),
  );
  const actions = div('fail-actions');
  if (a.retryFight) {
    actions.append(button(ctx, { label: 'Réessayer le combat', icon: ICONS.aim, cls: 'btn-primary fail-fight', onPress: a.retryFight }));
  }
  actions.append(
    button(ctx, { label: 'Réessayer', icon: ICONS.restart, cls: a.retryFight ? '' : 'btn-primary', onPress: a.retry }),
    button(ctx, { label: 'Menu', icon: ICONS.home, onPress: a.menu }),
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
  total.append(el('span', 'end-total-label', 'Score total'), totalEl);
  const stars = div('end-stars');
  stars.append(icon(ICONS.star, 'star is-on'), el('span', '', `${d.stars}/${d.maxStars} étoiles`));

  panel.append(
    el('p', 'end-kicker', 'Mission accomplie'),
    el('h2', 'end-title', 'FIN DE LA DÉMO'),
    el('p', 'end-text', 'Merci d’avoir joué à Xeno Rift ! Kaï et la Comète ont franchi la ceinture d’Orak… La suite de l’odyssée arrive bientôt.'),
    total,
    stars,
  );
  const actions = div('end-actions');
  actions.append(button(ctx, { label: 'Menu', icon: ICONS.home, cls: 'btn-primary', onPress: a.menu }));
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
  const msg = el('pre', 'error-msg', message.trim() || 'Erreur inconnue');
  panel.append(
    badge,
    el('h2', 'fail-title', 'ERREUR'),
    el('p', 'fail-reason', stage ? `Impossible de lancer « ${stage.title} ».` : 'Un problème est survenu.'),
    msg,
  );
  const actions = div('fail-actions');
  if (a.retry) {
    actions.append(button(ctx, { label: 'Réessayer', icon: ICONS.restart, cls: 'btn-primary', onPress: a.retry }));
  }
  actions.append(button(ctx, { label: 'Menu', icon: ICONS.home, onPress: a.menu }));
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
