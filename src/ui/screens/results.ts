import { CREW } from '../../core/hangar';
import { SKILL_NAMES } from '../../core/story';
import type { CrewId, SkillId, StageDef, StageResult, StageReward } from '../../core/types';
import { WEAPONS } from '../../core/weapons';
import { clamp, div, el, formatDuration, formatNumber, icon } from '../dom';
import { ICONS, weaponIcon } from '../icons';
import type { UiCtx } from '../services';
import { button, screenRoot, starRow, type Screen } from './common';
import { crystalsText } from './select';

// Résultats d'une étape réussie : score qui défile, étoiles qui apparaissent une à une,
// détails, réserve de cristaux, récompenses nouvelles, record. Toucher le panneau termine les animations.

export interface ResultsData {
  stage: StageDef;
  result: StageResult;
  /** Le score bat le record enregistré avant cette partie. */
  newRecord: boolean;
  /** Meilleur score enregistré (après cette partie). */
  best: number;
  /** Cristaux de l'étape ajoutés à la réserve (recordResult ; 0 en vol pour l'instant). */
  crystalsGained: number;
  /** Réserve après l'ajout (au retour du hangar : réserve actuelle, achats déduits). */
  crystals: number;
  /** Récompenses obtenues par cette réussite (recordResult : les nouvelles seulement). */
  rewards: readonly StageReward[];
  /** Retour du hangar : valeurs finales tout de suite, sans animation ni son. */
  settled?: boolean;
}

export interface ResultsActions {
  next(): void;
  replay(): void;
  menu(): void;
}

function detailRow(list: HTMLElement, svg: string, label: string, value: string): HTMLElement {
  const row = div('detail');
  row.append(icon(svg, 'ico detail-ico'), el('span', 'detail-label', label), el('b', 'detail-value', value));
  list.append(row);
  return row;
}

const SKILL_ICONS: Record<SkillId, string> = { doubleJump: ICONS.doublejump };
const CREW_LABELS: Record<CrewId, string> = { tess: 'Équipière', mira: 'Équipière' };

/** Ligne d'une récompense : « Compétence : double saut », « Équipière : Tess », « Plan : mitrailleur ». */
function rewardLine(r: StageReward): { svg: string; label: string; value: string } {
  switch (r.kind) {
    case 'skill':
      return { svg: SKILL_ICONS[r.id], label: 'Compétence', value: SKILL_NAMES[r.id] };
    case 'crew':
      return { svg: ICONS.helmet, label: CREW_LABELS[r.id], value: CREW[r.id].name };
    case 'blueprint':
      return { svg: weaponIcon(r.id), label: 'Plan', value: WEAPONS[r.id].name.toLocaleLowerCase('fr-FR') };
  }
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
  main.append(starsEl, scoreBox);
  // Prime du boss vaincu (comprise dans le score), sous le score : la colonne des détails reste à 4 lignes.
  if (stage.kind === 'platform' && result.bossBonus) {
    const bonus = div('results-bonus');
    bonus.append(icon(ICONS.trophy, 'ico'), el('span', 'results-bonus-label', 'Boss vaincu'), el('b', 'results-bonus-value', `+${formatNumber(result.bossBonus)}`));
    main.append(bonus);
  }
  main.append(record);

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

  // Réserve du hangar : gain de l'étape (« +N cristaux », s'il y en a) et total, qui défile avec le score. Au
  // retour du hangar (achats déduits), le total seul : le gain ne s'y additionne plus.
  const gained = Number.isFinite(d.crystalsGained) ? Math.max(0, Math.round(d.crystalsGained)) : 0;
  const bankTo = Number.isFinite(d.crystals) ? Math.max(0, Math.round(d.crystals)) : 0;
  const bankFrom = d.settled ? bankTo : Math.max(0, bankTo - gained);
  const showGain = !d.settled;
  const bank = div('detail detail--bank');
  bank.setAttribute('aria-label', `Réserve : ${crystalsText(bankTo)}${showGain && gained > 0 ? `, dont ${crystalsText(gained)} de cette étape` : ''}`);
  const bankN = el('b', 'detail-value', formatNumber(bankFrom));
  bank.append(icon(ICONS.crystal, 'ico detail-ico'), el('span', 'detail-label', 'Réserve'));
  if (showGain && gained > 0) bank.append(el('span', 'detail-gain', `+${crystalsText(gained)}`));
  bank.append(bankN);
  details.append(bank);
  for (const r of d.rewards) {
    const line = rewardLine(r);
    const row = detailRow(details, line.svg, line.label, line.value);
    row.classList.add('detail--reward');
    row.dataset.reward = `${r.kind}:${r.id}`;
    row.setAttribute('aria-label', `${line.label} : ${line.value}`);
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
    if (bankTo !== bankFrom) bankN.textContent = formatNumber(bankFrom + (bankTo - bankFrom) * eased);
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
    bankN.textContent = formatNumber(bankTo);
    scoreEl.classList.add('is-done');
    for (let i = 0; i < earned; i++) popStar(i, false);
    revealRecord(true);
  }

  // Retour du hangar : tout est déjà affiché (ni défilement, ni étoiles qui sautent, ni son).
  if (d.settled) {
    started = true;
    finished = true;
    scoreEl.textContent = formatNumber(target);
    for (let i = 0; i < earned; i++) stars[i]?.classList.add('is-on');
    revealRecord(false);
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
