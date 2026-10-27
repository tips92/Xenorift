// Pilotage par inclinaison du téléphone (deviceorientation).
// On reconstruit le vecteur « haut » dans le repère de l'appareil à partir de beta / gamma,
// puis on le projette sur les axes de l'écran selon l'orientation (paysage 90° ou 270°).
// Cela évite les sauts des angles d'Euler quand le téléphone est tenu presque vertical.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Inclinaison donnant la déviation maximale (degrés). */
const FULL_DEG = 22;
/** Zone morte autour de la position neutre (degrés). */
const DEAD_DEG = 3;
/** Constante de temps du lissage passe-bas (s). */
const SMOOTH_TAU = 0.06;
/**
 * Convention verticale : false = « avion » (ramener le haut du téléphone vers soi fait monter),
 * true = « bille » (pencher le haut vers l'avant fait monter).
 */
const INVERT_Y = false;

function axis(deg: number): number {
  const a = Math.abs(deg);
  if (a <= DEAD_DEG) return 0;
  const v = Math.min(1, (a - DEAD_DEG) / (FULL_DEG - DEAD_DEG));
  return deg < 0 ? -v : v;
}

function wrap180(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  else if (x < -180) x += 360;
  return x;
}

function readScreenAngle(): number {
  let a = 0;
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') {
    a = so.angle;
  } else {
    const legacy = (window as unknown as { orientation?: number }).orientation;
    if (typeof legacy === 'number') a = legacy;
  }
  return ((a % 360) + 360) % 360;
}

type DOEWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/** Demande l'autorisation (iOS 13+) ; doit être appelée dans un geste utilisateur. */
export function requestOrientationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    return Promise.resolve(true);
  }
  const DOE = DeviceOrientationEvent as DOEWithPermission;
  if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true);
  try {
    // Appel synchrone (aucun await avant) pour rester dans la pile du geste.
    return DOE.requestPermission().then(
      (r) => r === 'granted',
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

export class Tilt {
  stickX = 0;
  stickY = 0;
  /** Au moins une mesure valide reçue depuis le début de l'écoute. */
  hasReading = false;
  /** Instant (performance.now) du début de l'écoute. */
  since = 0;
  private listening = false;
  private calibrated = false;
  private pendingCal = false;
  private roll = 0;
  private pitch = 0;
  private roll0 = 0;
  private pitch0 = 0;
  private lastTs = 0;
  private angle = 0;
  private readonly onUpdate: (first: boolean) => void;

  constructor(onUpdate: (first: boolean) => void) {
    this.onUpdate = onUpdate;
  }

  get isListening(): boolean {
    return this.listening;
  }

  setListening(on: boolean): void {
    if (on === this.listening) return;
    this.listening = on;
    if (on) {
      this.since = performance.now();
      this.hasReading = false;
      this.angle = readScreenAngle();
      window.addEventListener('deviceorientation', this.onOrient);
      window.addEventListener('orientationchange', this.onScreen);
      if (typeof screen !== 'undefined' && screen.orientation) screen.orientation.addEventListener('change', this.onScreen);
    } else {
      window.removeEventListener('deviceorientation', this.onOrient);
      window.removeEventListener('orientationchange', this.onScreen);
      if (typeof screen !== 'undefined' && screen.orientation) screen.orientation.removeEventListener('change', this.onScreen);
      this.hasReading = false;
      this.stickX = 0;
      this.stickY = 0;
    }
  }

  /** La position actuelle devient la position neutre (ou la prochaine mesure si aucune n'est encore arrivée). */
  calibrate(): void {
    if (this.hasReading) {
      this.roll0 = this.roll;
      this.pitch0 = this.pitch;
      this.calibrated = true;
      this.pendingCal = false;
      this.stickX = 0;
      this.stickY = 0;
      this.onUpdate(false);
    } else {
      this.pendingCal = true;
    }
  }

  private readonly onScreen = (): void => {
    this.angle = readScreenAngle();
  };

  private readonly onOrient = (e: DeviceOrientationEvent): void => {
    const beta = e.beta;
    const gamma = e.gamma;
    if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return;

    // Vecteur « haut » (opposé à la gravité) dans le repère de l'appareil
    const cb = Math.cos(beta * D2R);
    const sb = Math.sin(beta * D2R);
    const cg = Math.cos(gamma * D2R);
    const sg = Math.sin(gamma * D2R);
    const ux = -sg * cb;
    const uy = sb;
    const uz = cg * cb;
    // Projection sur les axes de l'écran (X vers la droite, Y vers le haut de l'image affichée)
    const th = this.angle * D2R;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const ax = ux * ct - uy * st;
    const ay = ux * st + uy * ct;
    // Roulis > 0 : bord droit de l'écran abaissé. Tangage : 0 = à plat, 90 = vertical face à soi.
    const roll = Math.asin(ax < -1 ? 1 : ax > 1 ? -1 : -ax) * R2D;
    const pitch = Math.atan2(ay, uz) * R2D;

    const ts = e.timeStamp > 0 ? e.timeStamp : performance.now();
    const first = !this.hasReading;
    if (first) {
      this.roll = roll;
      this.pitch = pitch;
    } else {
      const dt = Math.min(0.25, Math.max(0, (ts - this.lastTs) / 1000));
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      this.roll += (roll - this.roll) * k;
      this.pitch = wrap180(this.pitch + wrap180(pitch - this.pitch) * k);
    }
    this.lastTs = ts;
    this.hasReading = true;

    if (this.pendingCal || !this.calibrated) {
      this.roll0 = this.roll;
      this.pitch0 = this.pitch;
      this.calibrated = true;
      this.pendingCal = false;
    }
    this.stickX = axis(this.roll - this.roll0);
    const dy = axis(wrap180(this.pitch - this.pitch0));
    this.stickY = INVERT_Y ? -dy : dy;
    this.onUpdate(first);
  };
}
