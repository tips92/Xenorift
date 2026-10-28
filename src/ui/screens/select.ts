import { getCrystals, getSave, isUnlocked, nextToPlay } from '../../core/save';
import { STAGES } from '../../core/stages';
import type { SaveData, StageDef } from '../../core/types';
import { WORLDS } from '../../core/worlds';
import { clamp, div, el, formatNumber, icon, play } from '../dom';
import { ICONS, stageIcon } from '../icons';
import type { UiCtx } from '../services';
import { button, iconButton, screenHeader, screenRoot, starRow, type Screen } from './common';

// Choix du niveau : une page par monde (◀ ▶, glissement horizontal, étoiles du monde), ouverte sur celle de
// l'étape de JOUER ; une carte par étape (verrou, record, étoiles) ; l'accès au hangar.

export interface SelectActions {
  back(): void;
  start(stage: StageDef): void;
  /** Bouton « Hangar » (ouvert sans départ : son retour ramène ici, sur la page du monde `world`). */
  hangar(world: number): void;
}

const SHAKE: Keyframe[] = [
  { transform: 'translate3d(0,0,0)' },
  { transform: 'translate3d(-8px,0,0)' },
  { transform: 'translate3d(7px,0,0)' },
  { transform: 'translate3d(-4px,0,0)' },
  { transform: 'translate3d(0,0,0)' },
];

/** Déplacement (px) au-delà duquel un doigt posé devient un glissement : la carte touchée n'est pas lancée. */
const DRAG_SLOP = 10;
/** Glissement qui change de page : une part de la largeur, ou un geste vif (px par ms) d'au moins 30 px. */
const SWIPE_PART = 0.18;
const SWIPE_SPEED = 0.45;

export function kindLabel(stage: StageDef): string {
  return stage.kind === 'platform' ? 'Plateforme' : 'Vol spatial';
}

/** « 0 cristal », « 1 cristal », « 1 250 cristaux ». */
export function crystalsText(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return `${formatNumber(v)} ${v >= 2 ? 'cristaux' : 'cristal'}`;
}

function stageCard(ctx: UiCtx, a: SelectActions, save: Readonly<SaveData>, stage: StageDef, i: number): HTMLButtonElement {
  const unlocked = isUnlocked(stage);
  const best = save.best[stage.id];

  const c = el('button', `card card--${stage.kind} card--${stage.theme}${unlocked ? '' : ' is-locked'}`);
  c.type = 'button';
  c.dataset.stage = stage.id;
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
    if (!isUnlocked(stage)) {
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
  return c;
}

interface Page {
  readonly world: number;
  readonly label: string;
  readonly stars: number;
  readonly max: number;
  readonly el: HTMLElement;
}

/** `world` : monde de la page ouverte (absent ou inconnu : celui de l'étape de JOUER). */
export function createLevelSelect(ctx: UiCtx, a: SelectActions, world?: number): Screen {
  const root = screenRoot('select');
  const save = getSave();

  let stars = 0;
  for (const s of STAGES) stars += save.best[s.id]?.stars ?? 0;
  const total = div('select-total');
  total.setAttribute('aria-label', `${stars} étoiles sur ${STAGES.length * 3}`);
  total.append(icon(ICONS.star, 'star is-on'), el('span', 'select-total-n', `${stars}/${STAGES.length * 3}`));

  // Hangar, avec la réserve de cristaux en sous-titre.
  const reserve = crystalsText(getCrystals());
  const hangar = button(ctx, {
    label: 'Hangar',
    icon: ICONS.hangar,
    sub: reserve,
    cls: 'btn-sm select-hangar',
    aria: `Hangar, réserve : ${reserve}`,
    onPress: () => a.hangar(pages[page].world),
  });
  const right = div('select-head-right');
  right.append(hangar, total);

  root.append(screenHeader(ctx, 'Choix du niveau', a.back, right));

  // ---- Pages : une par monde, côte à côte dans une bande qui se décale.
  const view = div('select-pages');
  const track = div('select-track');
  view.append(track);
  const pages: Page[] = [];
  WORLDS.forEach((w, wi) => {
    const list = STAGES.filter((s) => s.world === wi + 1);
    if (list.length === 0) return;
    const label = `Monde ${wi + 1} · ${w.name}`;
    const node = div('select-page');
    node.dataset.world = String(wi + 1);
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', label);
    const cards = div('cards');
    cards.style.setProperty('--cols', String(Math.min(4, list.length)));
    let got = 0;
    list.forEach((stage, i) => {
      got += save.best[stage.id]?.stars ?? 0;
      cards.append(stageCard(ctx, a, save, stage, i));
    });
    node.append(cards);
    track.append(node);
    pages.push({ world: wi + 1, label, stars: got, max: list.length * 3, el: node });
  });

  // ---- Barre du monde affiché : ◀, nom et étoiles du monde, ▶.
  const bar = div(`select-bar${pages.length < 2 ? ' is-single' : ''}`);
  const prev = iconButton(ctx, ICONS.back, 'Monde précédent', () => show(page - 1, true), 'select-arrow select-prev');
  const next = iconButton(ctx, ICONS.back, 'Monde suivant', () => show(page + 1, true), 'select-arrow select-next');
  const info = div('select-world');
  info.setAttribute('aria-live', 'polite');
  const worldName = el('span', 'select-world-name');
  const worldStars = div('select-world-stars');
  const worldStarsN = el('span', 'select-world-n');
  worldStars.append(icon(ICONS.star, 'star is-on'), worldStarsN);
  info.append(worldName, worldStars);
  bar.append(prev, info, next);

  const body = div('screen-body select-body');
  body.append(view);
  root.append(bar, body);

  let page = 0;

  function show(i: number, animate: boolean): void {
    page = clamp(i, 0, pages.length - 1);
    track.classList.toggle('is-instant', !animate);
    track.style.transform = `translate3d(${-100 * page}%, 0, 0)`;
    pages.forEach((p, k) => {
      const cur = k === page;
      p.el.classList.toggle('is-current', cur);
      p.el.inert = !cur;
      p.el.setAttribute('aria-hidden', cur ? 'false' : 'true');
    });
    prev.disabled = page === 0;
    next.disabled = page >= pages.length - 1;
    const p = pages[page];
    if (!p) return;
    worldName.textContent = p.label;
    worldStarsN.textContent = `${p.stars}/${p.max}`;
    worldStars.setAttribute('aria-label', `${p.stars} étoiles sur ${p.max} dans ce monde`);
  }

  const want = world ?? nextToPlay().world;
  show(Math.max(0, pages.findIndex((p) => p.world === want)), false);

  // ---- Glissement horizontal (doigt ou souris) : la bande suit, puis change de page ou revient. Un glissement
  // capture le pointeur et avale le `click` du pointeur qui suit : la carte de départ n'est pas lancée.
  let drag: { id: number; x0: number; y0: number; t0: number; dx: number; on: boolean } | null = null;
  let swallowClick = false;

  view.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, on: false };
  });
  view.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    // Bouton relâché sans pointerup reçu (hors de la fenêtre) : geste abandonné.
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      release(e, true);
      return;
    }
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.on) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      // Geste plutôt vertical : défilement de la page (petits écrans), pas un glissement.
      if (Math.abs(dy) > Math.abs(dx) || pages.length < 2) {
        drag = null;
        return;
      }
      d.on = true;
      swallowClick = true;
      track.classList.add('is-dragging');
      try {
        view.setPointerCapture(e.pointerId);
      } catch {
        // Pointeur déjà relâché.
      }
    }
    d.dx = dx;
    // Résistance au-delà de la première et de la dernière page.
    const off = (page === 0 && dx > 0) || (page === pages.length - 1 && dx < 0) ? dx / 3 : dx;
    track.style.transform = `translate3d(calc(${-100 * page}% + ${off}px), 0, 0)`;
  });
  const release = (e: PointerEvent, cancel: boolean): void => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    drag = null;
    if (!d.on) return;
    track.classList.remove('is-dragging');
    const w = view.clientWidth || 1;
    const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t0);
    const far = Math.abs(d.dx) > w * SWIPE_PART || (Math.abs(d.dx) > 30 && speed > SWIPE_SPEED);
    const to = cancel || !far ? page : clamp(page + (d.dx < 0 ? 1 : -1), 0, pages.length - 1);
    if (to !== page) {
      ctx.audio.sfx('click', { pitch: 0.85 });
      ctx.audio.haptic(8);
    }
    show(to, true);
  };
  // Sur `window` : un bouton relâché hors de la zone des pages termine aussi le geste.
  const onUp = (e: PointerEvent): void => release(e, e.type === 'pointercancel');
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  view.addEventListener(
    'click',
    (e) => {
      // detail 0 : clic du clavier (Entrée, Espace) ou de click(), jamais celui d'un glissement.
      if (!swallowClick || e.detail === 0) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // ---- Clavier (PC) : ← → changent de page.
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || drag?.on) return;
    if (!root.classList.contains('is-active') || root.classList.contains('is-leaving')) return;
    const to = e.key === 'ArrowLeft' ? page - 1 : e.key === 'ArrowRight' ? page + 1 : -1;
    if (to < 0 || to >= pages.length) return;
    e.preventDefault();
    ctx.audio.sfx('click', { pitch: 0.85 });
    show(to, true);
  };
  window.addEventListener('keydown', onKey);

  return {
    name: 'select',
    el: root,
    back(): boolean {
      a.back();
      return true;
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
