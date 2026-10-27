import type { TouchLayout } from '../core/types';
import { ICON_JUMP, ICON_LASER, ICON_LEFT, ICON_RIGHT, ICON_TURBO } from './icons';
import { injectTouchStyles } from './styles';

// Commandes tactiles : événements pointer avec multi-touch suivi par pointerId (+ capture),
// pour que chaque doigt reste attaché à sa commande même s'il glisse en dehors.

export type TouchPress = 'jump' | 'fire' | 'boost';

/** Zone morte du joystick (fraction du rayon). */
const STICK_DEAD_ZONE = 0.12;

interface HoldButton {
  readonly el: HTMLDivElement;
  readonly action: TouchPress;
  readonly ids: Set<number>;
  down: boolean;
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
  left = false;
  right = false;
  jump = false;
  fire = false;
  boost = false;
  stickActive = false;
  stickX = 0;
  stickY = 0;

  private layout: TouchLayout = 'none';
  private capable: boolean;
  private readonly forced: boolean;
  private stickHidden = false;
  private readonly onPress: (a: TouchPress) => void;
  private readonly onChange: () => void;

  private readonly root: HTMLElement;
  private readonly platformLayer: HTMLDivElement;
  private readonly flightLayer: HTMLDivElement;

  // Croix directionnelle
  private readonly dpad: HTMLDivElement;
  private readonly dpadL: HTMLDivElement;
  private readonly dpadR: HTMLDivElement;
  /** pointerId → zone (-1 gauche, 0 neutre, 1 droite). */
  private readonly dpadZones = new Map<number, number>();
  private dpadCx = 0;
  private dpadNeutral = 8;

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
    this.dpadL = div('xr-dpad-half xr-dpad-l', this.dpad);
    this.dpadL.innerHTML = ICON_LEFT;
    div('xr-dpad-mid', this.dpad);
    this.dpadR = div('xr-dpad-half xr-dpad-r', this.dpad);
    this.dpadR.innerHTML = ICON_RIGHT;
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
    if (this.dpadZones.size > 0) {
      for (const id of this.dpadZones.keys()) uncapture(this.dpad, id);
      this.dpadZones.clear();
      changed = true;
    }
    this.syncDpadVisual(false, false);
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
    const was = this.left || this.right || this.jump || this.fire || this.boost || this.stickActive;
    this.left = this.right = this.jump = this.fire = this.boost = false;
    this.stickActive = false;
    this.stickX = this.stickY = 0;
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
    this.radius = m >= 720 ? 84 : m >= 520 ? 74 : 64;
    this.root.style.setProperty('--xr-stick-r', `${this.radius}px`);
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

  // ---------------------------------------------------------------- croix directionnelle

  private zoneOf(x: number): number {
    const dx = x - this.dpadCx;
    if (dx < -this.dpadNeutral) return -1;
    if (dx > this.dpadNeutral) return 1;
    return 0;
  }

  private readonly onDpadDown = (e: PointerEvent): void => {
    if (isSecondaryMouse(e)) return;
    prevent(e);
    capture(this.dpad, e.pointerId);
    const r = this.dpad.getBoundingClientRect();
    this.dpadCx = r.left + r.width * 0.5;
    // Bande neutre centrale étroite : on passe d'une flèche à l'autre sans lever le doigt.
    this.dpadNeutral = Math.max(6, r.width * 0.045);
    this.dpadZones.set(e.pointerId, this.zoneOf(e.clientX));
    this.syncDpad();
  };

  private readonly onDpadMove = (e: PointerEvent): void => {
    const z = this.dpadZones.get(e.pointerId);
    if (z === undefined) return;
    const nz = this.zoneOf(e.clientX);
    if (nz === z) return;
    this.dpadZones.set(e.pointerId, nz);
    this.syncDpad();
  };

  private readonly onDpadUp = (e: PointerEvent): void => {
    if (this.dpadZones.delete(e.pointerId)) this.syncDpad();
  };

  private syncDpad(): void {
    let l = false;
    let r = false;
    for (const z of this.dpadZones.values()) {
      if (z < 0) l = true;
      else if (z > 0) r = true;
    }
    this.syncDpadVisual(l, r);
    this.dpad.classList.toggle('is-active', this.dpadZones.size > 0);
    if (l === this.left && r === this.right) return;
    this.left = l;
    this.right = r;
    this.onChange();
  }

  private syncDpadVisual(l: boolean, r: boolean): void {
    this.dpadL.classList.toggle('is-down', l);
    this.dpadR.classList.toggle('is-down', r);
    if (!l && !r && this.dpadZones.size === 0) this.dpad.classList.remove('is-active');
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
    if (this.dpadZones.delete(id)) this.syncDpad();
    for (const b of this.buttons) this.releaseButtonPointer(b, id);
    if (id === this.stickId) {
      this.endStick();
      this.onChange();
    }
  };
}
