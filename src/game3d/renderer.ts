import * as THREE from 'three';

// WebGLRenderer unique, créé à la première partie puis réutilisé (créer un contexte WebGL coûte cher
// et les navigateurs mobiles en limitent le nombre).
// Un contexte perdu (GPU réinitialisé, WebView en arrière-plan, manque de mémoire) n'est jamais
// réutilisé : le renderer est jeté et la partie suivante en crée un neuf.

let shared: THREE.WebGLRenderer | null = null;

export const MAX_PIXEL_RATIO = 1.5;

/** Échec de démarrage dû à la perte du contexte WebGL (message dédié côté interface). */
export class ContextLostError extends Error {
  constructor() {
    super('Contexte WebGL perdu');
    this.name = 'ContextLostError';
  }
}

export function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/** Vrai si le contexte du renderer est perdu (ou illisible). */
export function isContextLost(r: THREE.WebGLRenderer): boolean {
  try {
    return r.getContext().isContextLost();
  } catch {
    return true;
  }
}

/** Renvoie le renderer partagé, son canevas attaché (et visible) dans `container`. */
export function acquireRenderer(container: HTMLElement): THREE.WebGLRenderer {
  // Contexte perdu depuis la dernière partie : on repart d'un canevas neuf.
  if (shared && isContextLost(shared)) discardRenderer(shared);
  if (!shared) {
    const canvas = document.createElement('canvas');
    try {
      shared = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      });
    } catch (err) {
      // Contexte obtenu mais aussitôt perdu (GPU en cours de réinitialisation) : erreur passagère
      let lost = false;
      try {
        lost = !!canvas.getContext('webgl2')?.isContextLost();
      } catch {
        // pas de WebGL2 du tout
      }
      throw lost ? new ContextLostError() : err;
    }
    shared.outputColorSpace = THREE.SRGBColorSpace;
    shared.toneMapping = THREE.NoToneMapping;
    const c = shared.domElement;
    c.setAttribute('aria-hidden', 'true');
    c.style.display = 'block';
    c.style.left = '0';
    c.style.top = '0';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.touchAction = 'none';
    c.style.outline = 'none';
    // Contexte perdu : Chrome peint le canevas en blanc (icône d'image cassée) ; masqué, le fond sombre reste.
    c.addEventListener('webglcontextlost', () => (c.style.visibility = 'hidden'));
    c.addEventListener('webglcontextrestored', () => (c.style.visibility = ''));
  }
  shared.setPixelRatio(pixelRatio());
  const canvas = shared.domElement;
  // Canevas plein cadre : absolu si le conteneur est positionné, sinon dans le flux.
  canvas.style.position = getComputedStyle(container).position === 'static' ? 'relative' : 'absolute';
  if (canvas.parentElement !== container) container.appendChild(canvas);
  canvas.style.display = 'block';
  return shared;
}

/** Cache le canevas ; le renderer reste prêt pour la partie suivante. */
export function releaseRenderer(r?: THREE.WebGLRenderer): void {
  if (!shared || (r && r !== shared)) return;
  shared.domElement.style.display = 'none';
  shared.renderLists.dispose();
}

/** Jette un renderer (contexte perdu) : libéré, canevas retiré ; le prochain acquireRenderer en recrée un. */
export function discardRenderer(r: THREE.WebGLRenderer): void {
  if (shared === r) shared = null;
  const lost = isContextLost(r);
  try {
    r.dispose();
  } catch {
    // contexte déjà inutilisable : on ignore
  }
  // Contexte encore vivant : on le rend tout de suite au navigateur (nombre de contextes limité).
  if (!lost) {
    try {
      r.forceContextLoss();
    } catch {
      // extension absente : le ramasse-miettes s'en chargera
    }
  }
  r.domElement.remove();
}
