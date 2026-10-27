// Outils WebGL : journal des contextes, perte / restauration provoquées (WEBGL_lose_context), état des canvas.
//
// Désignation des canvas (`which`) :
//  - 'three'  : canvas du vol 3D (#game-root canvas[data-engine^="three"], attribut posé par Three.js) ;
//  - 'phaser' : canvas de la plateforme 2D (__xr2d.scene.game.canvas en dev, sinon le canvas sans data-engine).

/**
 * Journal des contextes WebGL, injecté AVANT le chargement de la page (appeler avant t.goto).
 * Chaque entrée de window.__ctxlog : { ev: 'create' | 'lost' | 'restored', type, canvas (n° d'ordre),
 * engine (data-engine au moment de l'événement), at (ms depuis le chargement), stack (création seulement) }.
 */
export async function logContexts(t) {
  await t.page.addInitScript(() => {
    window.__ctxlog = [];
    let n = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const ctx = orig.call(this, type, attrs);
      if (ctx && /webgl/.test(type) && !this.__xrGl) {
        const canvas = this;
        canvas.__xrGl = ctx;
        canvas.__xrN = ++n;
        const push = (ev, extra) =>
          window.__ctxlog.push({
            ev,
            type,
            canvas: canvas.__xrN,
            engine: canvas.dataset.engine || null,
            at: Math.round(performance.now()),
            ...extra,
          });
        push('create', { stack: new Error().stack.split('\n').slice(2, 5).map((l) => l.trim()).join(' | ') });
        canvas.addEventListener('webglcontextlost', () => push('lost'));
        canvas.addEventListener('webglcontextrestored', () => push('restored'));
      }
      return ctx;
    };
  });
}

/** Entrées du journal (voir logContexts), [] s'il n'est pas installé. */
export function contextLog(t) {
  return t.ev(() => window.__ctxlog || []);
}

/**
 * Canvas de #game-root : { i, engine ('three…' ou null), width, height (tampon), cssWidth, cssHeight,
 * display (calculé), lost (true / false, null si le contexte n'a pas été vu par logContexts ni par Phaser) }.
 */
export function canvases(t) {
  return t.ev(() => {
    const s2 = window.__xr2d && window.__xr2d.scene;
    const pc = s2 && s2.game ? s2.game.canvas : null;
    return [...document.querySelectorAll('#game-root canvas')].map((c, i) => {
      const r = c.getBoundingClientRect();
      const gl = c.__xrGl || (c === pc && s2.game.renderer ? s2.game.renderer.gl : null);
      return {
        i,
        engine: c.dataset.engine || (c === pc ? 'phaser' : null),
        width: c.width,
        height: c.height,
        cssWidth: Math.round(r.width),
        cssHeight: Math.round(r.height),
        display: getComputedStyle(c).display,
        lost: gl && gl.isContextLost ? gl.isContextLost() : null,
      };
    });
  });
}

/**
 * Provoque la perte du contexte du canvas `which` ('three' | 'phaser').
 * Renvoie 'lost', ou 'no-canvas' / 'no-context' / 'no-ext' si c'est impossible.
 * L'extension est gardée dans window.__xrLoseExt[which] pour restoreContext.
 */
export function loseContext(t, which) {
  return t.ev((w) => {
    const s2 = window.__xr2d && window.__xr2d.scene;
    let c = null;
    let gl = null;
    if (w === 'three') {
      c = document.querySelector('#game-root canvas[data-engine^="three"]');
    } else if (w === 'phaser') {
      if (s2 && s2.game) {
        c = s2.game.canvas;
        gl = s2.game.renderer && s2.game.renderer.gl;
      } else {
        c = [...document.querySelectorAll('#game-root canvas')].find((x) => !x.dataset.engine) || null;
      }
    } else {
      throw new Error(`loseContext : canvas inconnu « ${w} » (three | phaser)`);
    }
    if (!c) return 'no-canvas';
    // Contexte existant uniquement : getContext d'un autre type renvoie null, sans rien créer.
    gl = gl || c.__xrGl || c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no-context';
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return 'no-ext';
    window.__xrLoseExt = window.__xrLoseExt || {};
    window.__xrLoseExt[w] = ext;
    ext.loseContext();
    return 'lost';
  }, which);
}

/** Restaure le contexte perdu par loseContext(t, which). Renvoie true si une restauration a été demandée. */
export function restoreContext(t, which) {
  return t.ev((w) => {
    const ext = window.__xrLoseExt && window.__xrLoseExt[w];
    if (!ext) return false;
    ext.restoreContext();
    return true;
  }, which);
}

/** Rendu WebGL réel du navigateur (ex. « ANGLE (AMD, Radeon Vega 3 … Direct3D11 …) »), pour les diagnostics. */
export function webglRenderer(t) {
  return t.ev(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'none';
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
}
