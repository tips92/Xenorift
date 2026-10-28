import type { TouchLayout, TouchOptions } from '../core/types';
import { ICON_DOWN, ICON_JUMP, ICON_LASER, ICON_LEFT, ICON_RIGHT, ICON_TURBO, ICON_UP } from './icons';
import { readStick, type StickDir } from './stick';
import { injectTouchStyles } from './styles';

// Commandes tactiles : événements pointer avec multi-touch suivi par pointerId (+ capture),
// pour que chaque doigt reste attaché à sa commande même s'il glisse en dehors.

export type TouchPress = 'jump' | 'fire' | 'boost';

/** Zone morte du joystick (fraction du rayon). */
const STICK_DEAD_ZONE = 0.12;
/** Course maximale de la bille du stick 2D (fraction du rayon) : elle reste dans la base. */
const KNOB_TRAVEL = 0.56;
/**
 * Crans des réglages (cran 1 = valeurs d'origine) : échelle des commandes, opacité des couches. Repris par
 * l'aperçu du panneau d'options (ui/screens/options.ts).
 */
export const TOUCH_SIZE_STEPS = [0.85, 1, 1.2] as const;
export const TOUCH_OPACITY_STEPS = [0.45, 0.75, 0.95] as const;

interface HoldButton {
  readonly el: HTMLDivElement;
  readonly action: TouchPress;
  readonly ids: Set<number>;
  down: boolean;
}

/** Dernière position connue d'un doigt posé sur le stick 2D. */
interface FingerPos {
  x: number;
  y: number;
}

function div(className: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  parent.appendChild(d);
  return d;
}

function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // pointeur déjà relâché : le filet de sécurité global s'en chargera
  }
}

function uncapture(el: Element, id: number): void {
  try {
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  } catch {
    // sans importance
  }
}

function isSecondaryMouse(e: PointerEvent): boolean {
  return e.pointerType === 'mouse' && e.button !== 0;
}

/** Cran 0..2 (la sauvegarde ne valide pas les valeurs : on borne, 1 par défaut). */
export function touchStep(v: unknown): 0 | 1 | 2 {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 1;
  return n <= 0 ? 0 : n >= 2 ? 2 : 1;
}

const prevent = (e: Event): void => {
  if (e.cancelable) e.preventDefault();
};

/** L'appareil a-t-il un écran tactile ? (forçable avec ?touch=1 / ?touch=0 dans l'URL) */
function detectTouch(): boolean | null {
  try {
    const q = new URLSearchParams(window.location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
  } catch {
    // pas d'URL exploitable
  }
  if (navigator.maxTouchPoints > 0) return true;
  if ('ontouchstart' in window) return true;
  try {
    if (window.matchMedia('(any-pointer: coarse)').matches) return true;
  } catch {
    // matchMedia indisponible
  }
  return null;
}

export class TouchControls {
  // --- Sorties lues par le gestionnaire d'entrées
  /** Stick 2D : directions booléennes (une diagonale en allume deux, ↓ compris). */
  left = false;
  right = false;
  up = false;
  down = false;
  jump = false;
  fire = false;
  boost = false;
  /** Joystick du vol (analogique). */
  stickActive = false;
  stickX = 0;
  stickY = 0;

  private layout: TouchLayout = 'none';
  private capable: boolean;
  private readonly forced: boolean;
  private stickHidden = false;
  private size: 0 | 1 | 2 = 1;
  private opacity: 0 | 1 | 2 = 1;
  private lefty = false;
  private readonly onPress: (a: TouchPress) => void;
  private readonly onChange: () => void;

  private readonly root: HTMLElement;
  private readonly platformLayer: HTMLDivElement;
  private readonly flightLayer: HTMLDivElement;

  // Stick fixe à 8 directions (plateforme)
  private readonly dpad: HTMLDivElement;
  private readonly dpadKnob: HTMLDivElement;
  private readonly arrowL: HTMLDivElement;
  private readonly arrowR: HTMLDivElement;
  private readonly arrowU: HTMLDivElement;
  private readonly arrowD: HTMLDivElement;
  /** Doigts posés sur le stick (ordre d'arrivée) ; le plus récent commande. */
  private readonly dpadFingers = new Map<number, FingerPos>();
  private dpadId = -1;
  /** Direction lue (sert aussi d'hystérésis à readStick : remise à zéro quand le doigt change). */
  private readonly dpadDir: StickDir = { x: 0, y: 0 };
  private dpadCx = 0;
  private dpadCy = 0;
  private dpadR = 1;
  /** Centre et rayon à remesurer (taille de la fenêtre ou réglages changés). */
  private dpadStale = true;

  // Boutons
  private readonly fireBtn: HoldButton;
  private readonly jumpBtn: HoldButton;
  private readonly boostBtn: HoldButton;
  private readonly buttons: HoldButton[];

  // Joystick flottant
  private readonly stickZone: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private stickId = -1;
  private ox = 0;
  private oy = 0;
  private zx = 0;
  private zy = 0;
  private radius = 64;

  constructor(root: HTMLElement, onPress: (a: TouchPress) => void, onChange: () => void) {
    this.root = root;
    this.onPress = onPress;
    this.onChange = onChange;
    injectTouchStyles();
    root.classList.add('xr-touch');

    const detected = detectTouch();
    this.forced = detected !== null && new URLSearchParams(window.location.search).has('touch');
    this.capable = detected === true;

    // --- Disposition « plateforme »
    this.platformLayer = div('xr-tc-layer xr-tc-platform', root);
    this.platformLayer.setAttribute('aria-hidden', 'true');
    this.dpad = div('xr-ctl xr-glass xr-dpad', this.platformLayer);
    div('xr-dpad-ring', this.dpad);
    this.arrowL = this.makeArrow('xr-dpad-l', ICON_LEFT);
    this.arrowR = this.makeArrow('xr-dpad-r', ICON_RIGHT);
    this.arrowU = this.makeArrow('xr-dpad-u', ICON_UP);
    this.arrowD = this.makeArrow('xr-dpad-d', ICON_DOWN);
    this.dpadKnob = div('xr-dpad-knob', this.dpad);
    this.fireBtn = this.makeButton(this.platformLayer, 'xr-fire', 'TIR', ICON_LASER, 'fire');
    this.jumpBtn = this.makeButton(this.platformLayer, 'xr-jump', 'SAUT', ICON_JUMP, 'jump');

    // --- Disposition « vol »
    this.flightLayer = div('xr-tc-layer xr-tc-flight', root);
    this.flightLayer.setAttribute('aria-hidden', 'true');
    this.stickZone = div('xr-ctl xr-stick-zone', this.flightLayer);
    this.stickBase = div('xr-glass xr-stick-base is-idle', this.stickZone);
    this.stickKnob = div('xr-stick-knob', this.stickBase);
    this.boostBtn = this.makeButton(this.flightLayer, 'xr-boost', 'TURBO', ICON_TURBO, 'boost');

    this.buttons = [this.fireBtn, this.jumpBtn, this.boostBtn];

    // --- Pointeurs
    const d = this.dpad;
    d.addEventListener('pointerdown', this.onDpadDown);
    d.addEventListener('pointermove', this.onDpadMove);
    d.addEventListener('pointerup', this.onDpadUp);
    d.addEventListener('pointercancel', this.onDpadUp);
    d.addEventListener('lostpointercapture', this.onDpadUp);
    const z = this.stickZone;
    z.addEventListener('pointerdown', this.onStickDown);
    z.addEventListener('pointermove', this.onStickMove);
    z.addEventListener('pointerup', this.onStickUp);
    z.addEventListener('pointercancel', this.onStickUp);
    z.addEventListener('lostpointercapture', this.onStickUp);

    // Pas de défilement, zoom (double tape / pincement), menu contextuel ni sélection sur les commandes
    for (const layer of [this.platformLayer, this.flightLayer]) {
      layer.addEventListener('touchstart', prevent, { passive: false });
      layer.addEventListener('touchmove', prevent, { passive: false });
      layer.addEventListener('contextmenu', prevent);
      layer.addEventListener('selectstart', prevent);
      layer.addEventListener('dblclick', prevent);
      layer.addEventListener('gesturestart', prevent);
    }

    // Filet de sécurité : un doigt relâché n'importe où libère sa commande
    window.addEventListener('pointerup', this.onAnyPointerEnd, true);
    window.addEventListener('pointercancel', this.onAnyPointerEnd, true);
    // Premier contact tactile sur un appareil non détecté : on affiche les commandes
    if (!this.capable && !this.forced) window.addEventListener('pointerdown', this.onFirstTouch, true);
    window.addEventListener('resize', this.updateMetrics);

    this.updateMetrics();
    this.applyVisibility();
  }

  setLayout(layout: TouchLayout): void {
    if (layout === this.layout) return;
    this.releaseAll();
    this.layout = layout;
    this.applyVisibility();
  }

  /**
   * Taille (×0,85 / ×1 / ×1,2), opacité (0,45 / 0,75 / 0,95) et côté des commandes. Effet immédiat, sans
   * recréer les éléments ; si une commande change de place, les doigts posés sont relâchés.
   */
  setOptions(opts: TouchOptions): void {
    const size = touchStep(opts.touchSize);
    const opacity = touchStep(opts.touchOpacity);
    const lefty = opts.leftHanded === true;
    if (size === this.size && opacity === this.opacity && lefty === this.lefty) return;
    const moved = size !== this.size || lefty !== this.lefty;
    this.size = size;
    this.opacity = opacity;
    this.lefty = lefty;
    const st = this.root.style;
    st.setProperty('--xr-scale', String(TOUCH_SIZE_STEPS[size]));
    st.setProperty('--xr-tc-opacity', String(TOUCH_OPACITY_STEPS[opacity]));
    this.root.classList.toggle('xr-touch--lefty', lefty);
    this.updateMetrics();
    if (moved) this.releaseAll();
  }

  /** Masque le joystick (pilotage par inclinaison) ; le bouton TURBO reste visible. */
  setStickHidden(hidden: boolean): void {
    if (hidden === this.stickHidden) return;
    this.stickHidden = hidden;
    if (hidden && this.stickId !== -1) {
      uncapture(this.stickZone, this.stickId);
      this.endStick();
      this.onChange();
    }
    this.applyVisibility();
  }

  /** Relâche tous les doigts suivis et remet les commandes au repos. */
  releaseAll(): void {
    let changed = false;
    if (this.dpadFingers.size > 0) {
      for (const id of this.dpadFingers.keys()) uncapture(this.dpad, id);
      this.dpadFingers.clear();
      changed = true;
    }
    this.dpadId = -1;
    this.dpadDir.x = 0;
    this.dpadDir.y = 0;
    for (const b of this.buttons) {
      if (b.ids.size > 0) {
        for (const id of b.ids) uncapture(b.el, id);
        b.ids.clear();
      }
      if (b.down) {
        b.down = false;
        b.el.classList.remove('is-down');
        changed = true;
      }
    }
    if (this.stickId !== -1) {
      uncapture(this.stickZone, this.stickId);
      this.endStick();
      changed = true;
    }
    const was =
      this.left || this.right || this.up || this.down || this.jump || this.fire || this.boost || this.stickActive;
    this.left = this.right = this.up = this.down = false;
    this.jump = this.fire = this.boost = false;
    this.stickActive = false;
    this.stickX = this.stickY = 0;
    this.syncDpadVisual();
    if (changed || was) this.onChange();
  }

  // ---------------------------------------------------------------- affichage

  private applyVisibility(): void {
    const show = this.capable;
    this.platformLayer.hidden = !(show && this.layout === 'platform');
    this.flightLayer.hidden = !(show && this.layout === 'flight');
    this.stickZone.hidden = this.stickHidden;
    this.root.classList.toggle('xr-touch--on', show && this.layout !== 'none');
  }

  private readonly updateMetrics = (): void => {
    const m = Math.min(window.innerWidth, window.innerHeight);
    const base = m >= 720 ? 84 : m >= 520 ? 74 : 64;
    this.radius = Math.round(base * TOUCH_SIZE_STEPS[this.size]);
    this.root.style.setProperty('--xr-stick-r', `${this.radius}px`);
    this.dpadStale = true;
  };

  private readonly onFirstTouch = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    window.removeEventListener('pointerdown', this.onFirstTouch, true);
    if (this.capable) return;
    this.capable = true;
    this.applyVisibility();
  };

  // ---------------------------------------------------------------- boutons

  private makeButton(parent: HTMLElement, cls: string, label: string, svg: string, action: TouchPress): HoldButton {
    const el = div(`xr-ctl xr-glass xr-btn ${cls}`, parent);
    el.innerHTML = `${svg}<span class="xr-btn-label">${label}</span>`;
    const b: HoldButton = { el, action, ids: new Set<number>(), down: false };
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (isSecondaryMouse(e)) return;
      prevent(e);
      capture(el, e.pointerId);
      b.ids.add(e.pointerId);
      // Chaque nouveau doigt compte comme un appui (tapotements rapides à deux doigts).
      this.onPress(action);
      if (!b.down) {
        b.down = true;
        el.classList.add('is-down');
        this.syncButtons();
      }
    });
    const up = (e: PointerEvent): void => this.releaseButtonPointer(b, e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return b;
  }

  private releaseButtonPointer(b: HoldButton, id: number): void {
    if (!b.ids.delete(id) || b.ids.size > 0 || !b.down) return;
    b.down = false;
    b.el.classList.remove('is-down');
    this.syncButtons();
  }

  private syncButtons(): void {
    this.fire = this.fireBtn.down;
    this.jump = this.jumpBtn.down;
    this.boost = this.boostBtn.down;
    this.onChange();
  }

  // ---------------------------------------------------------------- stick 2D (8 directions)

  private makeArrow(cls: string, svg: string): HTMLDivElement {
    const a = div(`xr-dpad-arrow ${cls}`, this.dpad);
    a.innerHTML = svg;
    return a;
  }

  private measureDpad(): void {
    const r = this.dpad.getBoundingClientRect();
    this.dpadCx = r.left + r.width * 0.5;
    this.dpadCy = r.top + r.height * 0.5;
    this.dpadR = Math.max(1, r.width * 0.5);
    this.dpadStale = false;
  }

  private readonly onDpadDown = (e: PointerEvent): void => {
    if (isSecondaryMouse(e)) return;
    prevent(e);
    capture(this.dpad, e.pointerId);
    this.measureDpad();
    const id = e.pointerId;
    // Le nouveau doigt prend la main ; les autres restent suivis (repli s'il est levé).
    this.dpadFingers.delete(id);
    this.dpadFingers.set(id, { x: e.clientX, y: e.clientY });
    this.dpadId = id;
    this.dpadDir.x = 0;
    this.dpadDir.y = 0;
    this.updateDpad();
  };

  private readonly onDpadMove = (e: PointerEvent): void => {
    const p = this.dpadFingers.get(e.pointerId);
    if (p === undefined) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (e.pointerId === this.dpadId) this.updateDpad();
  };

  private readonly onDpadUp = (e: PointerEvent): void => {
    this.dropDpadFinger(e.pointerId);
  };

  private dropDpadFinger(id: number): void {
    if (!this.dpadFingers.delete(id) || id !== this.dpadId) return;
    // Doigt actif levé : le plus récent des doigts encore posés reprend la main.
    let next = -1;
    for (const k of this.dpadFingers.keys()) next = k;
    this.dpadId = next;
    this.dpadDir.x = 0;
    this.dpadDir.y = 0;
    this.updateDpad();
  }

  /** Lit la direction du doigt actif, place la bille et publie left/right/up/down. */
  private updateDpad(): void {
    const d = this.dpadDir;
    const p = this.dpadId === -1 ? undefined : this.dpadFingers.get(this.dpadId);
    if (p !== undefined) {
      if (this.dpadStale) this.measureDpad();
      const dx = p.x - this.dpadCx;
      const dy = p.y - this.dpadCy;
      readStick(dx, dy, this.dpadR, d);
      const max = this.dpadR * KNOB_TRAVEL;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.dpadKnob.style.transform = `translate3d(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px, 0)`;
    } else {
      d.x = 0;
      d.y = 0;
      this.dpadKnob.style.transform = '';
    }
    const l = d.x < 0;
    const r = d.x > 0;
    const u = d.y > 0;
    // Diagonale basse transmise entière (← → + ↓, comme au clavier) : Player n'accroupit que sur ↓ seul
    // (downOnly), puis ↓ + côté fait ramper.
    const dn = d.y < 0;
    const same = l === this.left && r === this.right && u === this.up && dn === this.down;
    this.left = l;
    this.right = r;
    this.up = u;
    this.down = dn;
    this.syncDpadVisual();
    if (!same) this.onChange();
  }

  private syncDpadVisual(): void {
    this.dpad.classList.toggle('is-active', this.dpadId !== -1);
    this.arrowL.classList.toggle('is-down', this.left);
    this.arrowR.classList.toggle('is-down', this.right);
    this.arrowU.classList.toggle('is-down', this.up);
    this.arrowD.classList.toggle('is-down', this.down);
    if (this.dpadId === -1) this.dpadKnob.style.transform = '';
  }

  // ---------------------------------------------------------------- joystick

  private readonly onStickDown = (e: PointerEvent): void => {
    if (this.stickId !== -1 || isSecondaryMouse(e)) return;
    prevent(e);
    capture(this.stickZone, e.pointerId);
    const r = this.stickZone.getBoundingClientRect();
    this.zx = r.left;
    this.zy = r.top;
    this.stickId = e.pointerId;
    // La base apparaît sous le doigt : le point de contact est la position neutre.
    this.ox = e.clientX - r.left;
    this.oy = e.clientY - r.top;
    this.stickActive = true;
    this.stickX = 0;
    this.stickY = 0;
    this.stickBase.classList.remove('is-idle');
    this.stickBase.classList.add('is-live');
    this.placeBase();
    this.stickKnob.style.transform = 'translate3d(0px, 0px, 0)';
    this.onChange();
  };

  private readonly onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    const R = this.radius;
    let dx = e.clientX - this.zx - this.ox;
    let dy = e.clientY - this.zy - this.oy;
    let d = Math.hypot(dx, dy);
    if (d > R) {
      // Au-delà du rayon, la base suit le doigt : inverser la direction reste immédiat.
      const k = (d - R) / d;
      this.ox += dx * k;
      this.oy += dy * k;
      dx -= dx * k;
      dy -= dy * k;
      d = R;
      this.placeBase();
    }
    this.stickKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    const m = d / R;
    if (m < STICK_DEAD_ZONE || d === 0) {
      this.stickX = 0;
      this.stickY = 0;
    } else {
      const s = (m - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE) / d;
      this.stickX = dx * s;
      this.stickY = -dy * s; // haut = positif
    }
    this.onChange();
  };

  private readonly onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    this.endStick();
    this.onChange();
  };

  private placeBase(): void {
    const R = this.radius;
    this.stickBase.style.transform = `translate3d(${(this.ox - R).toFixed(1)}px, ${(this.oy - R).toFixed(1)}px, 0)`;
  }

  private endStick(): void {
    this.stickId = -1;
    this.stickActive = false;
    this.stickX = 0;
    this.stickY = 0;
    this.stickBase.classList.remove('is-live');
    this.stickBase.classList.add('is-idle');
    this.stickBase.style.transform = '';
    this.stickKnob.style.transform = '';
  }

  // ---------------------------------------------------------------- filet de sécurité

  private readonly onAnyPointerEnd = (e: PointerEvent): void => {
    const id = e.pointerId;
    this.dropDpadFinger(id);
    for (const b of this.buttons) this.releaseButtonPointer(b, id);
    if (id === this.stickId) {
      this.endStick();
      this.onChange();
    }
  };
}
