import { delay, div, el } from './dom';

// Fondu au noir (transitions entre menus et jeu) et invite « Tourne ton téléphone ».

/** Durée des transitions d'écran (doit correspondre à --t-screen dans styles.css). */
export const FADE_MS = 250;

export interface Fader {
  /** Vrai si le noir est demandé (ou atteint). */
  readonly black: boolean;
  /** Vrai pendant une transition (fondu en cours). */
  readonly busy: boolean;
  /** Fondu vers le noir ; résout quand l'écran est entièrement noir. */
  toBlack(): Promise<void>;
  /** Fondu depuis le noir ; résout quand l'écran est dégagé. */
  clear(): Promise<void>;
}

export function createFader(parent: HTMLElement, startBlack: boolean): Fader {
  const node = div('fader');
  if (startBlack) node.classList.add('is-on');
  parent.append(node);
  let black = startBlack;
  /** Fin de la transition en cours (horloge performance.now). */
  let endsAt = 0;

  function go(on: boolean): Promise<void> {
    const now = performance.now();
    if (black === on) return delay(Math.max(0, endsAt - now));
    black = on;
    node.classList.toggle('is-on', on);
    endsAt = now + FADE_MS + 30;
    return delay(FADE_MS + 30);
  }

  return {
    get black(): boolean {
      return black;
    },
    get busy(): boolean {
      return performance.now() < endsAt;
    },
    toBlack: () => go(true),
    clear: () => go(false),
  };
}

export interface RotatePrompt {
  setVisible(on: boolean): void;
}

export function createRotatePrompt(parent: HTMLElement): RotatePrompt {
  const node = div('rotate');
  node.setAttribute('role', 'alertdialog');
  node.setAttribute('aria-label', 'Tourne ton téléphone');
  const art = div('rotate-art');
  const phone = div('rotate-phone');
  phone.append(div('rotate-phone-screen'), div('rotate-phone-notch'));
  art.append(div('rotate-arc'), phone);
  node.append(
    art,
    el('p', 'rotate-title', 'Tourne ton téléphone'),
    el('p', 'rotate-sub', 'Xeno Rift se joue en mode paysage.'),
  );
  parent.append(node);
  return {
    setVisible(on: boolean): void {
      node.classList.toggle('is-on', on);
    },
  };
}
