import { resetProgress } from '../../core/save';
import type { Settings } from '../../core/types';
import { div, el, icon } from '../dom';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenHeader, screenRoot, type Screen } from './common';

// Panneau d'options (utilisé par l'écran Options et par le menu Pause) : interrupteurs appliqués
// immédiatement, réinitialisation de la progression avec confirmation intégrée.

type ToggleKey = 'music' | 'sfx' | 'haptics' | 'tilt' | 'unlockAll';

interface ToggleDef {
  key: ToggleKey;
  label: string;
  desc: string;
  icon: string;
}

const TOGGLES: readonly ToggleDef[] = [
  { key: 'music', label: 'Musique', desc: 'Ambiances synthétisées', icon: ICONS.music },
  { key: 'sfx', label: 'Effets sonores', desc: 'Tirs, sauts, portails…', icon: ICONS.sfx },
  { key: 'haptics', label: 'Vibrations', desc: 'Retour tactile du téléphone', icon: ICONS.vibration },
  { key: 'tilt', label: 'Pilotage par inclinaison', desc: 'Remplace le joystick en vol spatial', icon: ICONS.tilt },
  { key: 'unlockAll', label: 'Tout débloquer', desc: 'Mode test : toutes les étapes jouables', icon: ICONS.unlock },
];

export interface OptionsPanel {
  readonly el: HTMLElement;
  /** Ferme la boîte de confirmation si elle est ouverte (renvoie true dans ce cas). */
  back(): boolean;
  dispose(): void;
}

interface ToggleRow {
  def: ToggleDef;
  btn: HTMLButtonElement;
  desc: HTMLSpanElement;
}

export function createOptionsPanel(ctx: UiCtx): OptionsPanel {
  const root = div('options');
  const grid = div('options-grid');
  const rows: ToggleRow[] = [];
  let tiltPending = false;
  let disposed = false;

  function sync(): void {
    for (const r of rows) {
      const on = !!ctx.settings[r.def.key];
      r.btn.classList.toggle('is-on', on);
      r.btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  function setDesc(r: ToggleRow, text: string, kind: '' | 'warn' | 'ok'): void {
    r.desc.textContent = text;
    r.desc.classList.toggle('is-warn', kind === 'warn');
    r.desc.classList.toggle('is-ok', kind === 'ok');
  }

  function onTilt(r: ToggleRow): void {
    if (tiltPending) return;
    if (ctx.settings.tilt) {
      ctx.setSettings({ tilt: false });
      ctx.audio.sfx('click', { pitch: 0.9 });
      setDesc(r, r.def.desc, '');
      sync();
      return;
    }
    // iOS : la demande d'autorisation doit partir directement du geste (aucun await avant).
    const ask = ctx.input.requestTiltPermission();
    ctx.audio.sfx('click', { pitch: 1.15 });
    tiltPending = true;
    r.btn.classList.add('is-pending');
    setDesc(r, 'Autorisation en cours…', '');
    void ask.then((ok) => {
      tiltPending = false;
      r.btn.classList.remove('is-pending');
      if (ok) {
        ctx.setSettings({ tilt: true });
        ctx.input.calibrateTilt();
        if (!disposed) setDesc(r, 'Activé : la position actuelle sert de neutre', 'ok');
      } else {
        // Refus : l'option reste désactivée et on l'explique.
        ctx.setSettings({ tilt: false });
        ctx.audio.sfx('click', { pitch: 0.6 });
        if (!disposed) setDesc(r, 'Autorisation refusée : le pilotage reste au joystick', 'warn');
      }
      sync();
    });
  }

  for (const def of TOGGLES) {
    const btn = el('button', `toggle toggle--${def.key}`);
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.append(icon(def.icon, 'ico toggle-ico'));
    const txt = div('toggle-text');
    const desc = el('span', 'toggle-desc', def.desc);
    txt.append(el('span', 'toggle-label', def.label), desc);
    const sw = el('span', 'switch');
    sw.setAttribute('aria-hidden', 'true');
    sw.append(el('span', 'switch-knob'));
    btn.append(txt, sw);
    const row: ToggleRow = { def, btn, desc };
    rows.push(row);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (def.key === 'tilt') {
        onTilt(row);
        return;
      }
      const next = !ctx.settings[def.key];
      const patch: Partial<Settings> = {};
      patch[def.key] = next;
      ctx.setSettings(patch);
      // Le son du clic suit le nouveau réglage (muet si on vient de couper les effets).
      ctx.audio.sfx('click', { pitch: next ? 1.15 : 0.9 });
      if (def.key === 'haptics' && next) ctx.audio.haptic(40);
      sync();
    });
    grid.append(btn);
  }

  // ---------------------------------------------------------------- Réinitialisation

  const footer = div('options-footer');
  const confirm = div('confirm');
  confirm.setAttribute('role', 'alertdialog');
  confirm.setAttribute('aria-modal', 'true');
  confirm.setAttribute('aria-label', 'Réinitialiser la progression');
  const box = div('panel confirm-box');
  const confirmActions = div('confirm-actions');
  let confirmOpen = false;

  function openConfirm(): void {
    if (confirmOpen) return;
    confirmOpen = true;
    confirm.classList.add('is-open');
  }

  function closeConfirm(): void {
    if (!confirmOpen) return;
    confirmOpen = false;
    confirm.classList.remove('is-open');
  }

  const resetBtn = button(ctx, {
    label: 'Réinitialiser la progression',
    icon: ICONS.reset,
    cls: 'btn-danger btn-sm',
    onPress: openConfirm,
  });
  footer.append(resetBtn);

  confirmActions.append(
    button(ctx, { label: 'Annuler', onPress: closeConfirm }),
    button(ctx, {
      label: 'Effacer',
      icon: ICONS.reset,
      cls: 'btn-danger',
      onPress: () => {
        resetProgress();
        closeConfirm();
        ctx.audio.haptic([30, 40, 30]);
        ctx.hud.toast('Progression réinitialisée', 'info');
      },
    }),
  );
  box.append(
    icon(ICONS.warning, 'ico confirm-ico'),
    el('h3', 'confirm-title', 'Tout effacer ?'),
    el('p', 'confirm-text', 'Les étapes débloquées et tous les records seront perdus. Tes réglages sont conservés.'),
    confirmActions,
  );
  confirm.append(box);
  // Toucher le fond ferme la boîte.
  confirm.addEventListener('click', (e) => {
    if (e.target === confirm) {
      ctx.audio.sfx('click', { pitch: 0.85 });
      closeConfirm();
    }
  });

  root.append(grid, footer, confirm);
  sync();

  return {
    el: root,
    back(): boolean {
      if (!confirmOpen) return false;
      closeConfirm();
      return true;
    },
    dispose(): void {
      disposed = true;
      closeConfirm();
    },
  };
}

export function createOptionsScreen(ctx: UiCtx, a: { back(): void }): Screen {
  const root = screenRoot('options');
  const panel = createOptionsPanel(ctx);
  root.append(screenHeader(ctx, 'Options', a.back));
  const body = div('screen-body options-body');
  body.append(panel.el);
  root.append(body);
  return {
    name: 'options',
    el: root,
    back(): boolean {
      if (panel.back()) return true;
      a.back();
      return true;
    },
    dispose: () => panel.dispose(),
  };
}
