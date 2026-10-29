import { resetProgress } from '../../core/save';
import type { Settings } from '../../core/types';
import { TOUCH_OPACITY_STEPS, TOUCH_SIZE_STEPS, touchStep } from '../../input/touch';
import { div, el, icon } from '../dom';
import type { StoryPlay } from '../flow';
import { ICONS } from '../icons';
import type { UiCtx } from '../services';
import { button, screenHeader, screenRoot, type Screen } from './common';

// Panneau d'options (utilisé par l'écran Options et par le menu Pause) : rubriques Général et Commandes,
// interrupteurs et sélecteurs à 3 crans appliqués immédiatement, réinitialisation de la progression avec
// confirmation intégrée ; écran Options seulement : « Revoir les cinématiques » (liste des cinématiques vues).

type Group = 'general' | 'controls';
type ToggleKey = 'music' | 'sfx' | 'haptics' | 'tilt' | 'unlockAll' | 'leftHanded';

interface ToggleDef {
  key: ToggleKey;
  /** Rubrique où l'interrupteur s'affiche. */
  group: Group;
  label: string;
  desc: string;
  icon: string;
}

const TOGGLES: readonly ToggleDef[] = [
  { key: 'music', group: 'general', label: 'Musique', desc: 'Ambiances synthétisées', icon: ICONS.music },
  { key: 'sfx', group: 'general', label: 'Effets sonores', desc: 'Tirs, sauts, portails…', icon: ICONS.sfx },
  { key: 'haptics', group: 'general', label: 'Vibrations', desc: 'Retour tactile du téléphone', icon: ICONS.vibration },
  { key: 'unlockAll', group: 'general', label: 'Tout débloquer', desc: 'Mode test : toutes les étapes jouables', icon: ICONS.unlock },
  { key: 'leftHanded', group: 'controls', label: 'Mode gaucher', desc: 'Stick à droite, boutons à gauche', icon: ICONS.swap },
  { key: 'tilt', group: 'controls', label: 'Pilotage par inclinaison', desc: 'Remplace le joystick en vol spatial', icon: ICONS.tilt },
];

type StepKey = 'touchSize' | 'touchOpacity';
type Step = 0 | 1 | 2;

interface ChoiceDef {
  key: StepKey;
  label: string;
  desc: string;
  icon: string;
  /** Libellés des crans 0, 1 et 2. */
  steps: readonly [string, string, string];
}

/** Sélecteurs à 3 crans (en tête de la rubrique Commandes). */
const CHOICES: readonly ChoiceDef[] = [
  { key: 'touchSize', label: 'Taille des boutons', desc: 'Stick, Saut, Tir et Turbo', icon: ICONS.touchSize, steps: ['Petits', 'Moyens', 'Grands'] },
  { key: 'touchOpacity', label: 'Opacité', desc: 'Commandes plus ou moins visibles', icon: ICONS.touchOpacity, steps: ['Discrète', 'Moyenne', 'Opaque'] },
];


export interface OptionsPanel {
  readonly el: HTMLElement;
  /**
   * Boîtes plein écran (confirmation, liste des cinématiques), à placer HORS de la zone qui défile : celle-ci a un
   * masque de fondu qui rognerait les boîtes.
   */
  readonly overlay: HTMLElement;
  /** Ferme la boîte ouverte s'il y en a une (renvoie true dans ce cas). */
  back(): boolean;
  dispose(): void;
}

/** « Revoir les cinématiques » (écran Options, pas la Pause) : cinématiques vues et lecture (App.ts). */
export interface StoryReplay {
  /** Cinématiques déjà vues, dans l'ordre de la campagne (relu à chaque ouverture de la liste). */
  list(): readonly StoryPlay[];
  play(p: StoryPlay): void;
}

interface ToggleRow {
  def: ToggleDef;
  btn: HTMLButtonElement;
  desc: HTMLSpanElement;
}

interface ChoiceRow {
  def: ChoiceDef;
  seg: HTMLDivElement;
  btns: HTMLButtonElement[];
}

interface Section {
  root: HTMLElement;
  head: HTMLDivElement;
  grid: HTMLDivElement;
}

function section(title: string, cls: string): Section {
  const root = el('section', `options-section options-section--${cls}`);
  const head = div('options-section-head');
  head.append(el('h3', 'options-section-title', title), div('options-section-rule'));
  const grid = div('options-grid');
  root.append(head, grid);
  return { root, head, grid };
}

export function createOptionsPanel(ctx: UiCtx, story: StoryReplay | null = null): OptionsPanel {
  const root = div('options');
  const general = section('Général', 'general');
  const controls = section('Commandes', 'controls');
  const rows: ToggleRow[] = [];
  const choices: ChoiceRow[] = [];
  let tiltPending = false;
  let disposed = false;

  // Aperçu des commandes en jeu (masquées en pause et dans les menus) : taille, opacité et côté.
  const preview = div('ctl-preview');
  preview.setAttribute('aria-hidden', 'true');
  const pvPad = div('ctl-preview-pad');
  const pvBtns = div('ctl-preview-btns');
  pvBtns.append(div('ctl-preview-fire'), div('ctl-preview-jump'));
  pvPad.append(div('ctl-preview-stick'), pvBtns);
  preview.append(pvPad);
  controls.head.append(preview);

  function sync(): void {
    for (const r of rows) {
      const on = !!ctx.settings[r.def.key];
      r.btn.classList.toggle('is-on', on);
      r.btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const c of choices) {
      const cur = touchStep(ctx.settings[c.def.key]);
      for (let i = 0; i < c.btns.length; i++) {
        const b = c.btns[i];
        const on = i === cur;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        // Un seul arrêt de tabulation par groupe (les flèches changent de cran).
        b.tabIndex = on ? 0 : -1;
      }
      c.seg.style.setProperty('--seg-i', String(cur));
    }
    preview.style.setProperty('--pv-scale', String(TOUCH_SIZE_STEPS[touchStep(ctx.settings.touchSize)]));
    preview.style.setProperty('--pv-opacity', String(TOUCH_OPACITY_STEPS[touchStep(ctx.settings.touchOpacity)]));
    preview.classList.toggle('is-lefty', !!ctx.settings.leftHanded);
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

  // ---------------------------------------------------------------- Sélecteurs à 3 crans

  function pick(c: ChoiceRow, i: Step): void {
    // Le son monte avec le cran choisi.
    ctx.audio.sfx('click', { pitch: 0.9 + i * 0.12 });
    if (ctx.settings[c.def.key] === i) return;
    const patch: Partial<Settings> = {};
    patch[c.def.key] = i;
    ctx.setSettings(patch);
    sync();
  }

  function onSegKey(c: ChoiceRow, e: KeyboardEvent): void {
    const cur = touchStep(ctx.settings[c.def.key]);
    let next: number;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        next = cur - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        next = cur + 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 2;
        break;
      default:
        return;
    }
    e.preventDefault();
    const i = touchStep(next);
    if (i !== cur || ctx.settings[c.def.key] !== i) pick(c, i);
    c.btns[i].focus();
  }

  for (const def of CHOICES) {
    const box = div(`choice choice--${def.key}`);
    const head = div('choice-head');
    const txt = div('toggle-text');
    txt.append(el('span', 'toggle-label', def.label), el('span', 'toggle-desc', def.desc));
    head.append(icon(def.icon, 'ico toggle-ico'), txt);
    // Boutons obligatoires : enableSecondFingerTaps rejoue le clic d'un 2e doigt sur un <button>.
    const seg = div('seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', def.label);
    const row: ChoiceRow = { def, seg, btns: [] };
    for (let i = 0; i < def.steps.length; i++) {
      const b = el('button', 'seg-btn', def.steps[i]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const step = touchStep(i);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        pick(row, step);
      });
      row.btns.push(b);
      seg.append(b);
    }
    seg.addEventListener('keydown', (e) => onSegKey(row, e));
    choices.push(row);
    box.append(head, seg);
    controls.grid.append(box);
  }

  // ---------------------------------------------------------------- Interrupteurs

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
    (def.group === 'general' ? general : controls).grid.append(btn);
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

  // ---------------------------------------------------------------- Revoir les cinématiques

  const storyBox = div('confirm confirm--story');
  storyBox.setAttribute('role', 'dialog');
  storyBox.setAttribute('aria-modal', 'true');
  storyBox.setAttribute('aria-label', 'Revoir les cinématiques');
  const storyPanel = div('panel confirm-box story-box');
  const storyList = div('story-list');
  let storyOpen = false;

  function closeStory(): void {
    if (!storyOpen) return;
    storyOpen = false;
    storyBox.classList.remove('is-open');
  }

  /** Liste relue à chaque ouverture : une réinitialisation la vide aussitôt. */
  function openStory(): void {
    if (!story || storyOpen) return;
    storyOpen = true;
    storyList.replaceChildren();
    const seen = story.list();
    for (const p of seen) {
      const b = button(ctx, {
        label: p.title,
        sub: p.sub,
        icon: ICONS.play,
        cls: 'btn-sm story-item',
        onPress: () => {
          closeStory();
          story.play(p);
        },
      });
      b.dataset.cutscene = p.id;
      storyList.append(b);
    }
    if (seen.length === 0) {
      storyList.append(el('p', 'confirm-text', 'Aucune pour l’instant : elles se débloquent en jouant.'));
    }
    storyBox.classList.add('is-open');
  }

  if (story) {
    storyPanel.append(
      icon(ICONS.play, 'ico confirm-ico'),
      el('h3', 'confirm-title', 'Cinématiques'),
      storyList,
      button(ctx, { label: 'Fermer', cls: 'btn-sm', onPress: closeStory }),
    );
    storyBox.append(storyPanel);
    // Toucher le fond ferme la boîte.
    storyBox.addEventListener('click', (e) => {
      if (e.target === storyBox) {
        ctx.audio.sfx('click', { pitch: 0.85 });
        closeStory();
      }
    });
    const storyBtn = button(ctx, {
      label: 'Revoir les cinématiques',
      icon: ICONS.play,
      cls: 'btn-sm options-story',
      onPress: openStory,
    });
    footer.append(storyBtn);
  }
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
    el(
      'p',
      'confirm-text',
      'Les étapes débloquées, tous les records, ton équipement (armes, compétences), ta réserve de cristaux et les achats du hangar seront perdus, et les cinématiques se rejoueront. Tes réglages sont conservés.',
    ),
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

  root.append(general.root, controls.root, footer);
  sync();

  // Les deux boîtes, posées ensemble hors de la zone qui défile (enveloppe sans boîte : display: contents).
  const overlays = div('options-overlays');
  overlays.append(confirm);
  if (story) overlays.append(storyBox);

  return {
    el: root,
    overlay: overlays,
    back(): boolean {
      if (storyOpen) {
        closeStory();
        return true;
      }
      if (!confirmOpen) return false;
      closeConfirm();
      return true;
    },
    dispose(): void {
      disposed = true;
      closeConfirm();
      closeStory();
    },
  };
}

export function createOptionsScreen(ctx: UiCtx, a: { back(): void; story: StoryReplay }): Screen {
  const root = screenRoot('options');
  const panel = createOptionsPanel(ctx, a.story);
  root.append(screenHeader(ctx, 'Options', a.back));
  const body = div('screen-body options-body');
  body.append(panel.el);
  root.append(body, panel.overlay);
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
