import { t } from '../../core/i18n/locale';
import { UI } from '../../core/i18n/ui';
import { stageSubtitle, stageTitle } from '../../core/story';
import type { StageDef } from '../../core/types';
import { div, el } from '../dom';
import { ICONS } from '../icons';
import { FADE_MS } from '../overlays';
import type { UiCtx } from '../services';
import { button, iconButton } from './common';
import { createOptionsPanel, type OptionsPanel } from './options';

// Menu Pause par-dessus le jeu : Reprendre, Recommencer, Options (même panneau), Quitter.

export interface PauseActions {
  resume(): void;
  restart(): void;
  quit(): void;
}

export interface PauseOverlay {
  readonly el: HTMLElement;
  open(): void;
  /** Ferme (avec fondu, ou tout de suite) puis retire du DOM. */
  close(instant: boolean): void;
  /** Retour : sous-vue Options → menu. Renvoie false si on est déjà sur le menu. */
  back(): boolean;
  view(): 'menu' | 'options';
  openOptions(): void;
}

export function createPauseOverlay(ctx: UiCtx, stage: StageDef, a: PauseActions): PauseOverlay {
  const root = div('overlay pause');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t(UI.pause));

  const panel = div('panel pause-panel');
  let locked = false;
  let options: OptionsPanel | null = null;
  let view: 'menu' | 'options' = 'menu';

  /** Une seule action par ouverture (évite les doubles appuis pendant le fondu). */
  const once = (fn: () => void) => (): void => {
    if (locked) return;
    locked = true;
    fn();
  };

  // ---- Vue menu
  const menuView = div('pause-view pause-view--menu');
  const head = div('pause-head');
  head.append(el('h2', 'pause-title', t(UI.pauseTitle)), el('p', 'pause-stage', `${stageSubtitle(stage.world, stage.part)} · ${stageTitle(stage.id)}`));
  const resumeBtn = button(ctx, {
    label: t(UI.resume),
    icon: ICONS.play,
    cls: 'btn-primary btn-wide',
    onPress: () => {
      if (!locked) a.resume();
    },
  });
  const row = div('pause-row');
  row.append(
    button(ctx, { label: t(UI.restart), icon: ICONS.restart, onPress: once(a.restart) }),
    button(ctx, { label: t(UI.options), icon: ICONS.gear, onPress: () => showOptions() }),
    button(ctx, { label: t(UI.quit), icon: ICONS.home, onPress: once(a.quit) }),
  );
  menuView.append(head, resumeBtn, row);

  // ---- Vue options (créée à la demande)
  const optView = div('pause-view pause-view--options');
  const optHead = div('screen-header pause-opt-head');
  optHead.append(iconButton(ctx, ICONS.back, t(UI.back), () => showMenu()), el('h2', 'screen-title', t(UI.options)), div('screen-header-right'));
  const optBody = div('pause-opt-body');
  optView.append(optHead, optBody);

  function showOptions(): void {
    if (locked || view === 'options') return;
    if (!options) {
      options = createOptionsPanel(ctx);
      optBody.append(options.el);
      // Confirmation hors de la zone qui défile (son masque de fondu la rognerait).
      optView.append(options.overlay);
    }
    view = 'options';
    root.dataset.view = 'options';
  }

  function showMenu(): void {
    if (view === 'menu') return;
    view = 'menu';
    root.dataset.view = 'menu';
  }

  root.dataset.view = 'menu';
  panel.append(menuView, optView);
  root.append(panel);

  let closed = false;

  return {
    el: root,
    open(): void {
      void root.offsetWidth;
      root.classList.add('is-open');
    },
    close(instant: boolean): void {
      if (closed) return;
      closed = true;
      locked = true;
      options?.dispose();
      root.classList.remove('is-open');
      if (instant) root.remove();
      else window.setTimeout(() => root.remove(), FADE_MS + 40);
    },
    view(): 'menu' | 'options' {
      return view;
    },
    openOptions(): void {
      showOptions();
    },
    back(): boolean {
      if (view === 'options') {
        if (options && options.back()) return true;
        ctx.audio.sfx('click', { pitch: 0.85 });
        showMenu();
        return true;
      }
      return false;
    },
  };
}
