import type { InputAction, InputApi, InputState, TouchLayout, TouchOptions } from '../core/types';
import { K_BOOST, K_DOWN, K_FIRE, K_JUMP, K_LEFT, K_PAUSE, K_RIGHT, K_UP, Keyboard } from './keyboard';
import { Tilt, requestOrientationPermission } from './tilt';
import { TouchControls, type TouchPress } from './touch';

// Entrées unifiées : clavier (test sur PC), contrôles tactiles, inclinaison du téléphone.
// L'état est un objet unique modifié sur place à chaque événement : aucune allocation à la lecture.
// Appui « interact » (portes) : front montant de « haut sans ← → » (stick 2D qui entre dans le secteur haut,
// ↑ / W au clavier sans ← → tenus, ou ← → relâché pendant que haut est tenu), jamais si Tir est maintenu.

/** Seuil au-delà duquel un axe analogique active aussi la direction booléenne correspondante. */
const ANALOG_TO_DIGITAL = 0.5;
/** Délai sans mesure d'inclinaison avant de réafficher le joystick (capteur absent ou refusé). */
const TILT_GRACE_MS = 1500;

class InputManager implements InputApi {
  readonly state: InputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    fire: false,
    boost: false,
    stickX: 0,
    stickY: 0,
  };

  private readonly presses: Record<InputAction, boolean> = {
    jump: false,
    fire: false,
    boost: false,
    pause: false,
    interact: false,
  };
  private readonly pauseListeners: Array<() => void> = [];
  private readonly keys: Keyboard;
  private readonly touch: TouchControls;
  private readonly tilt: Tilt;
  private layout: TouchLayout = 'none';
  private tiltWanted = false;
  private tiltTimer: ReturnType<typeof setTimeout> | null = null;
  /** « Haut sans ← → » au dernier calcul (front montant → appui interact). */
  private upOnly = false;

  constructor(touchRoot: HTMLElement) {
    this.keys = new Keyboard(this.onKeyEdge, this.recompute);
    this.touch = new TouchControls(touchRoot, this.onTouchPress, this.recompute);
    this.tilt = new Tilt(this.onTilt);

    // Perte de focus / mise en arrière-plan : tout est relâché.
    window.addEventListener('blur', this.releaseEverything);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseEverything();
    });
  }

  // ---------------------------------------------------------------- InputApi

  consumePress(action: InputAction): boolean {
    if (!this.presses[action]) return false;
    this.presses[action] = false;
    return true;
  }

  clearPresses(): void {
    const p = this.presses;
    p.jump = false;
    p.fire = false;
    p.boost = false;
    p.pause = false;
    p.interact = false;
  }

  setLayout(layout: TouchLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.keys.capture = layout !== 'none';
    this.touch.setLayout(layout);
    this.refreshTiltMode();
    this.recompute();
  }

  setTouchOptions(opts: TouchOptions): void {
    this.touch.setOptions(opts);
  }

  setTiltEnabled(on: boolean): void {
    if (on === this.tiltWanted) return;
    this.tiltWanted = on;
    this.refreshTiltMode();
    this.recompute();
  }

  requestTiltPermission(): Promise<boolean> {
    return requestOrientationPermission();
  }

  calibrateTilt(): void {
    this.tilt.calibrate();
  }

  onPause(cb: () => void): () => void {
    this.pauseListeners.push(cb);
    return () => {
      const i = this.pauseListeners.indexOf(cb);
      if (i >= 0) this.pauseListeners.splice(i, 1);
    };
  }

  // ---------------------------------------------------------------- sources

  private readonly onKeyEdge = (bits: number): void => {
    const p = this.presses;
    if (bits & K_JUMP) p.jump = true;
    if (bits & K_FIRE) p.fire = true;
    if (bits & K_BOOST) p.boost = true;
    if (bits & K_PAUSE) {
      p.pause = true;
      this.emitPause();
    }
  };

  private readonly onTouchPress = (a: TouchPress): void => {
    this.presses[a] = true;
  };

  private readonly onTilt = (first: boolean): void => {
    if (first) this.refreshTiltMode();
    this.recompute();
  };

  private emitPause(): void {
    // Copie : un abonné peut se désabonner pendant l'appel.
    const list = this.pauseListeners.slice();
    for (const cb of list) {
      try {
        cb();
      } catch (err) {
        console.error('[input] onPause', err);
      }
    }
  }

  /**
   * Inclinaison : écoute du capteur seulement si activée ET en vol. Le joystick est masqué tant que
   * le capteur répond (ou pendant le court délai d'attente de la première mesure), sinon il revient.
   */
  private refreshTiltMode(): void {
    const flight = this.layout === 'flight';
    const listen = this.tiltWanted && flight;
    this.tilt.setListening(listen);
    if (this.tiltTimer !== null) {
      clearTimeout(this.tiltTimer);
      this.tiltTimer = null;
    }
    let hideStick = false;
    if (listen) {
      if (this.tilt.hasReading) {
        hideStick = true;
      } else {
        const left = TILT_GRACE_MS - (performance.now() - this.tilt.since);
        if (left > 0) {
          hideStick = true;
          this.tiltTimer = setTimeout(() => {
            this.tiltTimer = null;
            this.refreshTiltMode();
          }, left + 30);
        }
      }
    }
    this.touch.setStickHidden(hideStick);
  }

  private readonly releaseEverything = (): void => {
    this.keys.releaseAll();
    this.touch.releaseAll();
    this.clearPresses();
    this.recompute();
  };

  /** Fusionne clavier + tactile + inclinaison dans `state` (modifié sur place). */
  private readonly recompute = (): void => {
    const s = this.state;
    const km = this.keys.mask;
    const t = this.touch;
    // Directions tout-ou-rien : clavier + stick 2D (le joystick du vol est analogique, plus bas).
    const dl = (km & K_LEFT) !== 0 || t.left;
    const dr = (km & K_RIGHT) !== 0 || t.right;
    const du = (km & K_UP) !== 0 || t.up;
    const dd = (km & K_DOWN) !== 0 || t.down;

    let sx: number;
    let sy: number;
    let analog = true;
    if (t.stickActive) {
      sx = t.stickX;
      sy = t.stickY;
    } else if (this.layout === 'flight' && this.tiltWanted && this.tilt.hasReading) {
      sx = this.tilt.stickX;
      sy = this.tilt.stickY;
    } else {
      analog = false;
      sx = (dr ? 1 : 0) - (dl ? 1 : 0);
      sy = (du ? 1 : 0) - (dd ? 1 : 0);
      if (sx !== 0 && sy !== 0) {
        sx *= Math.SQRT1_2;
        sy *= Math.SQRT1_2;
      }
    }
    s.stickX = sx;
    s.stickY = sy;
    s.left = dl || (analog && sx < -ANALOG_TO_DIGITAL);
    s.right = dr || (analog && sx > ANALOG_TO_DIGITAL);
    s.up = du || (analog && sy > ANALOG_TO_DIGITAL);
    s.down = dd || (analog && sy < -ANALOG_TO_DIGITAL);
    s.jump = (km & K_JUMP) !== 0 || t.jump;
    s.fire = (km & K_FIRE) !== 0 || t.fire;
    s.boost = (km & K_BOOST) !== 0 || t.boost;

    const upOnly = du && !dl && !dr;
    if (upOnly && !this.upOnly && !s.fire) this.presses.interact = true;
    this.upOnly = upOnly;
  };
}

/** Crée le gestionnaire d'entrées ; les contrôles tactiles sont montés dans `touchRoot`. */
export function createInput(touchRoot: HTMLElement): InputApi {
  return new InputManager(touchRoot);
}
