import { div, el, icon } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';

// Briques communes des écrans : contrat d'écran, boutons, en-têtes, étoiles.

export type ScreenName =
  | 'title'
  | 'select'
  | 'options'
  | 'intro'
  | 'cutscene'
  | 'results'
  | 'hangar'
  | 'fail'
  | 'rift'
  | 'end'
  | 'error';

export interface Screen {
  readonly name: ScreenName;
  readonly el: HTMLElement;
  /** Retour (bouton Android / Échap). Renvoie true si l'écran l'a pris en charge. */
  back?(): boolean;
  /** Appelé une fois l'écran entièrement visible (après le fondu). */
  shown?(): void;
  /** Libère minuteries et écouteurs. */
  dispose?(): void;
}

export interface ButtonOpts {
  label: string;
  /** Classes supplémentaires (ex. 'btn-primary'). */
  cls?: string;
  icon?: string;
  /** Petite ligne sous le libellé. */
  sub?: string;
  aria?: string;
  /** Son du clic (par défaut 'click'). */
  silent?: boolean;
  onPress(): void;
}

/** Bouton néon : son + vibration légère, puis l'action. */
export function button(ctx: UiCtx, o: ButtonOpts): HTMLButtonElement {
  const b = el('button', `btn${o.cls ? ` ${o.cls}` : ''}`);
  b.type = 'button';
  if (o.aria) b.setAttribute('aria-label', o.aria);
  if (o.icon) b.append(icon(o.icon, 'ico btn-ico'));
  const text = el('span', 'btn-text');
  text.append(el('span', 'btn-label', o.label));
  if (o.sub) text.append(el('span', 'btn-sub', o.sub));
  b.append(text);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (b.disabled) return;
    if (!o.silent) {
      ctx.audio.sfx('click');
      ctx.audio.haptic(8);
    }
    o.onPress();
  });
  return b;
}

/** Bouton rond à icône seule (retour…). */
export function iconButton(ctx: UiCtx, svg: string, aria: string, onPress: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn-round${cls ? ` ${cls}` : ''}`);
  b.type = 'button';
  b.setAttribute('aria-label', aria);
  b.append(icon(svg));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    ctx.audio.sfx('click', { pitch: 0.85 });
    ctx.audio.haptic(8);
    onPress();
  });
  return b;
}

/** En-tête d'écran : bouton retour, titre, zone libre à droite. */
export function screenHeader(ctx: UiCtx, title: string, onBack: () => void, right?: HTMLElement): HTMLElement {
  const h = div('screen-header');
  h.append(iconButton(ctx, ICONS.back, 'Retour', onBack));
  h.append(el('h2', 'screen-title', title));
  const r = div('screen-header-right');
  if (right) r.append(right);
  h.append(r);
  return h;
}

/** Rangée de 3 étoiles ; `earned` étoiles allumées (sans animation). */
export function starRow(earned: number, cls = ''): { row: HTMLElement; stars: HTMLElement[] } {
  const row = div(`stars${cls ? ` ${cls}` : ''}`);
  row.setAttribute('aria-label', `${earned} étoile${earned > 1 ? 's' : ''} sur 3`);
  const stars: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const s = icon(ICONS.star, 'star');
    if (i < earned) s.classList.add('is-on');
    stars.push(s);
    row.append(s);
  }
  return { row, stars };
}

/** Racine d'un écran plein cadre. */
export function screenRoot(name: ScreenName, extra = ''): HTMLElement {
  const s = div(`screen screen--${name}${extra ? ` ${extra}` : ''}`);
  s.dataset.screen = name;
  return s;
}
