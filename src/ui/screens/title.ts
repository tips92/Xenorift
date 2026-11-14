import { t } from '../../core/i18n/locale';
import { UI } from '../../core/i18n/ui';
import { div, el } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenRoot, type Screen } from './common';

// Écran d'accueil : logo néon, slogan, JOUER / NIVEAUX / OPTIONS.

export interface TitleActions {
  /** Ligne d'information sous JOUER (ex. « Continuer · Lune Krator »). */
  playSub: string;
  play(): void;
  levels(): void;
  options(): void;
}

export function createTitleScreen(ctx: UiCtx, a: TitleActions): Screen {
  const root = screenRoot('title');

  const main = div('title-main');

  const logo = el('h1', 'logo');
  logo.setAttribute('aria-label', 'Xeno Rift');
  const glow = el('span', 'logo-glow', 'XENO RIFT');
  glow.setAttribute('aria-hidden', 'true');
  const text = el('span', 'logo-text');
  text.setAttribute('aria-hidden', 'true');
  text.append(el('span', 'logo-xeno', 'XENO'), el('span', 'logo-gap', ' '), el('span', 'logo-rift', 'RIFT'));
  logo.append(glow, text);

  const bar = div('logo-bar');
  const tagline = el('p', 'tagline', t(UI.tagline));

  const actions = div('title-actions');
  const play = button(ctx, {
    label: t(UI.play),
    sub: a.playSub,
    icon: ICONS.play,
    cls: 'btn-primary btn-xl',
    onPress: a.play,
  });
  const row = div('title-row');
  row.append(
    button(ctx, { label: t(UI.levels), icon: ICONS.grid, onPress: a.levels }),
    button(ctx, { label: t(UI.options), icon: ICONS.gear, onPress: a.options }),
  );
  actions.append(play, row);

  main.append(logo, bar, tagline, actions);

  const footer = div('title-footer');
  footer.append(el('span', 'footer-tag', t(UI.demo)));
  // Essais de gameplay (pages à part, preview/tests.html, aussi dans l'APK).
  const tryArena = el('button', 'footer-try', t(UI.tests)) as HTMLButtonElement;
  tryArena.type = 'button';
  tryArena.addEventListener('click', () => {
    location.href = 'preview/tests.html';
  });
  footer.append(tryArena);

  root.append(main, footer);

  return {
    name: 'title',
    el: root,
    back: () => false,
  };
}
