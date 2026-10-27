import type { StageDef, StageResult } from '../../core/types';
import { clamp, div, el, formatDuration, formatNumber, icon } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenRoot, starRow, type Screen } from './common';

// Résultats d'une étape réussie : score qui défile, étoiles qui apparaissent une à une,
// détails, record. Toucher le panneau termine les animations.

export interface ResultsData {
  stage: StageDef;
  result: StageResult;
  /** Le score bat le record enregistré avant cette partie. */
  newRecord: boolean;
  /** Meilleur score enregistré (après cette partie). */
  best: number;
}

export interface ResultsActions {
  next(): void;
  replay(): void;
  menu(): void;
}

function detailRow(list: HTMLElement, svg: string, label: string, value: string): void {
  const row = div('detail');
  row.append(icon(svg, 'ico detail-ico'), el('span', 'detail-label', label), el('b', 'detail-value', value));
  list.append(row);
}

export function createResultsScreen(ctx: UiCtx, d: ResultsData, a: ResultsActions): Screen {
  const { stage, result } = d;
  const root = screenRoot('results', `results--${stage.kind}`);
  const panel = div('panel results-panel');

  const head = div('results-head');
  head.append(
    el('p', 'results-kicker', stage.subtitle),
    el('h2', 'results-title', stage.kind === 'platform' ? 'NIVEAU TERMINÉ' : 'VOL RÉUSSI'),
    el('p', 'results-stage', stage.title),
  );

  // ---- Colonne score
  const main = div('results-main');
  const { row: starsEl, stars } = starRow(0, 'stars--lg');
  starsEl.setAttribute('aria-label', `${result.stars} étoile${result.stars > 1 ? 's' : ''} sur 3`);
  const scoreBox = div('results-scorebox');
  const scoreEl = el('span', 'results-score', '0');
  scoreBox.append(el('span', 'results-score-label', 'Score'), scoreEl);
  const record = div('results-record');
  if (d.newRecord) {
    record.classList.add('is-new');
    record.append(icon(ICONS.trophy, 'ico'), el('span', '', 'Nouveau record !'));
  } else {
    record.append(el('span', '', `Record : ${formatNumber(d.best)}`));
  }
  main.append(starsEl, scoreBox, record);

  // ---- Colonne détails, puis rangée d'actions sous les deux colonnes
  const side = div('results-side');
  const details = div('results-details');
  if (stage.kind === 'platform') {
    if (result.crystals !== undefined) {
      const total = result.crystalsTotal !== undefined ? `/${result.crystalsTotal}` : '';
      detailRow(details, ICONS.crystal, 'Cristaux', `${result.crystals}${total}`);
    }
    if (result.enemies !== undefined) detailRow(details, ICONS.enemy, 'Ennemis', String(result.enemies));
    detailRow(details, ICONS.clock, 'Temps', formatDuration(result.timeMs, false));
  } else {
    if (result.gates !== undefined) {
      const total = result.gatesTotal !== undefined ? `/${result.gatesTotal}` : '';
      detailRow(details, ICONS.gate, 'Portails', `${result.gates}${total}`);
    }
    detailRow(details, ICONS.clock, 'Temps', formatDuration(result.timeMs, true));
  }

  const actions = div('results-actions');
  actions.append(
    button(ctx, { label: 'Suivant', icon: ICONS.next, cls: 'btn-primary', onPress: a.next }),
    button(ctx, { label: 'Rejouer', icon: ICONS.restart, onPress: a.replay }),
    button(ctx, { label: 'Menu', icon: ICONS.home, onPress: a.menu }),
  );
  side.append(details);

  const body = div('results-body');
  body.append(main, side);
  panel.append(head, body, actions);
  root.append(panel);

  // ---------------------------------------------------------------- Animations

  const earned = clamp(Math.round(result.stars), 1, 3);
  const target = Math.max(0, Math.round(result.score));
  const duration = clamp(700 + target / 12, 900, 1700);
  const timers: number[] = [];
  let raf = 0;
  let t0 = 0;
  let finished = false;
  let started = false;

  function revealRecord(withSound: boolean): void {
    if (record.classList.contains('is-shown')) return;
    record.classList.add('is-shown');
    if (d.newRecord && withSound) {
      ctx.audio.sfx('powerup');
      ctx.audio.haptic([20, 30, 40]);
    }
  }

  function popStar(i: number, withSound: boolean): void {
    const s = stars[i];
    if (!s || s.classList.contains('is-on')) return;
    s.classList.add('is-on', 'is-pop');
    if (withSound) {
      ctx.audio.sfx('crystal', { pitch: 1 + i * 0.16 });
      ctx.audio.haptic(14);
    }
  }

  function tick(now: number): void {
    if (finished) return;
    if (!t0) t0 = now;
    const k = Math.min(1, (now - t0) / duration);
    const eased = 1 - (1 - k) * (1 - k) * (1 - k);
    scoreEl.textContent = formatNumber(target * eased);
    if (k < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      scoreEl.classList.add('is-done');
      revealRecord(true);
    }
  }

  function finishAll(): void {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const id of timers) window.clearTimeout(id);
    timers.length = 0;
    scoreEl.textContent = formatNumber(target);
    scoreEl.classList.add('is-done');
    for (let i = 0; i < earned; i++) popStar(i, false);
    revealRecord(true);
  }

  // Toucher en dehors des boutons : afficher le résultat final tout de suite.
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null;
    if (t && t.closest('button')) return;
    if (started) finishAll();
  });

  return {
    name: 'results',
    el: root,
    shown(): void {
      if (started) return;
      started = true;
      raf = requestAnimationFrame(tick);
      for (let i = 0; i < earned; i++) {
        timers.push(window.setTimeout(() => popStar(i, true), 420 + i * 400));
      }
    },
    back(): boolean {
      a.menu();
      return true;
    },
    dispose(): void {
      finished = true;
      cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
      timers.length = 0;
    },
  };
}
