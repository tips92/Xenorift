// Petits utilitaires DOM, temps et formatage partagés par l'interface.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function div(className?: string, text?: string): HTMLDivElement {
  return el('div', className, text);
}

/** Icône SVG en ligne dans un <span> (décorative, masquée aux lecteurs d'écran). */
export function icon(svg: string, className = 'ico'): HTMLSpanElement {
  const s = el('span', className);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = svg;
  return s;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Prochaine image (avec repli par minuterie : requestAnimationFrame est gelé en arrière-plan). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    window.setTimeout(finish, 120);
  });
}

export interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

export function deferred(): Deferred {
  let res: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    res = r;
  });
  return { promise, resolve: () => res() };
}

/** Rejoue une animation Web Animations (sans effet si l'API est absente). */
export function play(node: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): void {
  if (typeof node.animate !== 'function') return;
  try {
    node.animate(frames, opts);
  } catch {
    // Animation purement décorative.
  }
}

/**
 * Deuxième doigt : le navigateur ne génère pas de « click » pour un pointeur tactile non principal
 * (un pouce reste sur la croix pendant qu'on touche PAUSE puis REPRENDRE). On rejoue donc le clic
 * au relâcher, si le doigt est resté sur le même bouton. Un éventuel clic natif en doublon est ignoré.
 */
export function enableSecondFingerTaps(root: HTMLElement): void {
  const downs = new Map<number, HTMLButtonElement>();
  let echo: HTMLButtonElement | null = null;
  let echoUntil = 0;
  root.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || e.isPrimary) return;
      const b = (e.target as Element | null)?.closest('button');
      if (b instanceof HTMLButtonElement) downs.set(e.pointerId, b);
    },
    true,
  );
  root.addEventListener('pointercancel', (e) => downs.delete(e.pointerId), true);
  root.addEventListener(
    'pointerup',
    (e) => {
      const b = downs.get(e.pointerId);
      if (!b) return;
      downs.delete(e.pointerId);
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (!b.isConnected || b.disabled || !over || !b.contains(over)) return;
      echo = b;
      echoUntil = performance.now() + 450;
      b.click();
    },
    true,
  );
  root.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || !echo || performance.now() > echoUntil) return;
      if (!(e.target instanceof Node) || !echo.contains(e.target)) return;
      echo = null;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

/** 12345 → « 12 345 » (espace fine insécable, à la française). */
export function formatNumber(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return out;
}

/** Durée en « m:ss » ou « m:ss.d ». */
export function formatDuration(ms: number, tenths: boolean): string {
  const total = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const ds = Math.floor(total / 100);
  const m = Math.floor(ds / 600);
  const s = Math.floor(ds / 10) % 60;
  const base = `${m}:${s < 10 ? '0' : ''}${s}`;
  return tenths ? `${base}.${ds % 10}` : base;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
