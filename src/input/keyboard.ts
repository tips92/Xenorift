// Clavier (tests sur PC) : touches physiques via event.code, donc identiques en AZERTY et QWERTY
// (ZQSD en AZERTY = WASD en QWERTY).

export const K_LEFT = 1;
export const K_RIGHT = 2;
export const K_UP = 4;
export const K_DOWN = 8;
export const K_JUMP = 16;
export const K_FIRE = 32;
export const K_BOOST = 64;
export const K_PAUSE = 128;

const KEYMAP = new Map<string, number>([
  ['ArrowLeft', K_LEFT],
  ['KeyA', K_LEFT],
  ['ArrowRight', K_RIGHT],
  ['KeyD', K_RIGHT],
  ['ArrowUp', K_UP | K_JUMP],
  ['KeyW', K_UP | K_JUMP],
  ['ArrowDown', K_DOWN],
  ['KeyS', K_DOWN],
  ['Space', K_JUMP | K_BOOST],
  ['KeyK', K_JUMP],
  ['KeyJ', K_FIRE],
  ['KeyX', K_FIRE],
  ['KeyF', K_FIRE],
  ['ShiftLeft', K_BOOST],
  ['ShiftRight', K_BOOST],
  ['Escape', K_PAUSE],
  ['KeyP', K_PAUSE],
]);

/** Vrai si la cible est un champ de saisie (on laisse alors le clavier tranquille). */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return type !== 'checkbox' && type !== 'radio' && type !== 'range' && type !== 'button';
}

export class Keyboard {
  /** Masque des actions maintenues (K_*). */
  mask = 0;
  /** En jeu : Espace / flèches ne font pas défiler la page. Dans les menus, comportement normal (boutons, défilement). */
  capture = false;
  private readonly held = new Map<string, number>();
  private readonly onEdge: (bits: number) => void;
  private readonly onChange: () => void;

  /**
   * @param onEdge appelé à chaque nouvel appui physique (hors répétition) avec les actions de la touche
   * @param onChange appelé quand l'ensemble des touches maintenues change
   */
  constructor(onEdge: (bits: number) => void, onChange: () => void) {
    this.onEdge = onEdge;
    this.onChange = onChange;
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
  }

  releaseAll(): void {
    if (this.held.size === 0 && this.mask === 0) return;
    this.held.clear();
    this.mask = 0;
    this.onChange();
  }

  private recalc(): void {
    let m = 0;
    for (const bits of this.held.values()) m |= bits;
    this.mask = m;
  }

  private readonly down = (e: KeyboardEvent): void => {
    const bits = KEYMAP.get(e.code);
    if (bits === undefined) return;
    // Raccourcis du navigateur (Ctrl+R…) et champs de saisie : on n'intercepte pas.
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
    if (this.capture) e.preventDefault();
    if (e.repeat || this.held.has(e.code)) return;
    this.held.set(e.code, bits);
    this.recalc();
    this.onEdge(bits);
    this.onChange();
  };

  private readonly up = (e: KeyboardEvent): void => {
    const bits = KEYMAP.get(e.code);
    if (bits === undefined) return;
    if (this.capture && !(e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target))) e.preventDefault();
    if (!this.held.delete(e.code)) return;
    this.recalc();
    this.onChange();
  };
}
