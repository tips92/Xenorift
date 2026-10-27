// Outils des scénarios « core » (vol, campagne, tactile, petits écrans, endurance, build de production).
// Complète helpers.mjs. Sauf mention contraire, rien ici ne dépend des aides DEV : ces fonctions
// marchent aussi sur le build de production.
import { AssertionError, fmt, waitFor, waitForScreen } from './helpers.mjs';

// ---------------------------------------------------------------- Vaisseau 3D (crochet des outils de dev de three.js)

/**
 * À appeler AVANT t.goto. three.js signale chaque THREE.Scene créée à window.__THREE_DEVTOOLS__
 * (événement 'observe', y compris dans le build de production) : on garde des références faibles
 * vers les scènes, ce qui permet de lire la position du vaisseau sans aucune aide du jeu.
 */
export async function trackThreeScenes(t) {
  await t.page.addInitScript(() => {
    window.__xrScenes = [];
    const hook = new EventTarget();
    hook.addEventListener('observe', (e) => {
      const o = e.detail;
      if (o && o.isScene) window.__xrScenes.push(new WeakRef(o));
    });
    window.__THREE_DEVTOOLS__ = hook;
  });
}

/**
 * Position { x, y, z } du vaisseau (racine de ShipModel : seul objet du vol dont la coque est une
 * LatheGeometry), dans la scène la plus récente qui le contient. null sans vol en cours.
 * Le vaisseau oscille de ±0,05 (±0,14 pendant le compte à rebours) en y.
 */
export function shipPos(t) {
  return t.ev(() => {
    const refs = window.__xrScenes || [];
    for (let i = refs.length - 1; i >= 0; i--) {
      const s = refs[i].deref();
      if (!s) continue;
      for (const c of s.children) {
        let hull = false;
        c.traverse((o) => {
          if (o.isMesh && o.geometry && o.geometry.type === 'LatheGeometry') hull = true;
        });
        if (hull) return { x: c.position.x, y: c.position.y, z: c.position.z };
      }
    }
    return null;
  });
}

// ---------------------------------------------------------------- HUD et messages

/** À appeler AVANT t.goto : journal des messages du HUD (window.__xrToasts : { text, at }). */
export async function recordToasts(t) {
  await t.page.addInitScript(() => {
    window.__xrToasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('toast')) {
            window.__xrToasts.push({ text: n.textContent, at: Math.round(performance.now()) });
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

/** Messages du HUD apparus depuis le chargement (voir recordToasts) : [{ text, at (performance.now()) }]. */
export function toasts(t) {
  return t.ev(() => window.__xrToasts || []);
}

/**
 * HUD du vol tel que le joueur le voit : visible, portails passés / total, progression (0..1, barre du haut),
 * jauge de turbo (0..1), chronomètre (texte), boucliers restants.
 */
export function hudFlight(t) {
  return t.ev(() => {
    const hud = document.querySelector('.hud');
    const q = (s) => document.querySelector(s);
    const scale = (e) => {
      const m = e && /scaleX\(([\d.]+)\)/.exec(e.style.transform);
      return m ? Number(m[1]) : null;
    };
    const total = q('.fl-gates .hud-total');
    return {
      visible: !!hud && !hud.classList.contains('is-hidden') && hud.dataset.mode === 'flight',
      gates: q('.fl-gates .hud-num') ? Number(q('.fl-gates .hud-num').textContent) : null,
      total: total ? Number(total.textContent.replace('/', '')) : null,
      progress: scale(q('.fl-progress-fill')),
      boost: scale(q('.fl-boost-fill')),
      timer: q('.fl-timer') ? q('.fl-timer').textContent : null,
      shield: document.querySelectorAll('.fl-pips .fl-pip:not(.is-empty)').length,
    };
  });
}

/** HUD de la plateforme : visible, vies, cristaux. */
export function hudPlatform(t) {
  return t.ev(() => {
    const hud = document.querySelector('.hud');
    const n = (s) => {
      const e = document.querySelector(s);
      return e ? Number(e.textContent) : null;
    };
    return {
      visible: !!hud && !hud.classList.contains('is-hidden') && hud.dataset.mode === 'platform',
      lives: n('.hud-lives .hud-num'),
      crystals: n('.hud-crystals .hud-num'),
    };
  });
}

/** Valeurs des lignes de détail de l'écran de résultats actif : { Portails: '16/16', Temps: '1:02.3', … }. */
export function resultDetails(t) {
  return t.ev(() => {
    const out = {};
    for (const d of document.querySelectorAll('.screens [data-screen="results"].is-active .detail')) {
      const k = d.querySelector('.detail-label');
      const v = d.querySelector('.detail-value');
      if (k && v) out[k.textContent.trim()] = v.textContent.trim();
    }
    return out;
  });
}

// ---------------------------------------------------------------- Écrans et pause

/** Clique le bouton `label` de l'écran `screen` une fois celui-ci utilisable (voir waitForScreen). */
export async function press(t, screen, label, { timeout = 20000 } = {}) {
  await waitForScreen(t, screen, { timeout });
  await t.page
    .locator(`.screens [data-screen="${screen}"].is-active button`, { hasText: label })
    .first()
    .click({ timeout: 5000 });
}

/**
 * Attend le menu Pause ouvert (open = true) ou fermé et la partie relancée (open = false).
 * En dev, vérifie aussi l'état de la partie (__xrShell) ; en production, seulement l'overlay.
 */
export function waitPause(t, open, { timeout = 5000 } = {}) {
  return waitFor(
    t,
    (want) => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const sh = window.__xrShell ? window.__xrShell.info() : null;
      if (want) return !!ov && (!sh || !!(sh.run && sh.run.paused));
      return !ov && (!sh || !!(sh.run && !sh.run.paused && !sh.navLock));
    },
    { timeout, label: open ? 'menu Pause ouvert' : 'menu Pause fermé, partie relancée', arg: !!open },
  );
}

/** Clique le bouton `label` du menu Pause ouvert (Reprendre, Recommencer, Options, Quitter). */
export async function pressPause(t, label) {
  await t.page.locator('.overlay.pause.is-open button', { hasText: label }).first().click({ timeout: 5000 });
}

/** Partie en cours et dévoilée (HUD du mode `mode` affiché, fondu terminé), sans aide DEV. */
export function waitHud(t, mode, { timeout = 30000 } = {}) {
  return waitFor(
    t,
    (m) => {
      const hud = document.querySelector('.hud');
      const f = document.querySelector('.fader');
      return !!hud && !hud.classList.contains('is-hidden') && hud.dataset.mode === m && !(f && f.classList.contains('is-on'));
    },
    { timeout, label: `HUD ${mode} affiché, fondu terminé`, arg: mode },
  );
}

// ---------------------------------------------------------------- Entrées (aide DEV __xrShell)

/** Commandes vues par le jeu : { left, right, jump, fire, boost, stickX, stickY } (__xrShell, dev uniquement). */
export function input(t) {
  return t.ev(() => window.__xrShell.info().input);
}

/** Attend que les commandes vérifient `pred(état)` (évalué côté Node) ; renvoie l'état. */
export async function waitInput(t, pred, label, { timeout = 3000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const i = await input(t);
    if (pred(i)) return i;
    if (Date.now() - t0 >= timeout) {
      throw new AssertionError(`commandes « ${label} » : délai de ${timeout} ms dépassé (état : ${fmt(i)})`);
    }
    await t.wait(50);
  }
}

/** Commandes au repos (aucune touche ni doigt pris en compte). */
export function waitInputIdle(t, label = 'tout relâché') {
  return waitInput(t, (i) => !i.left && !i.right && !i.jump && !i.fire && !i.boost && i.stickX === 0 && i.stickY === 0, label);
}

// ---------------------------------------------------------------- Images (captures décodées dans la page)

/** Décode une capture PNG dans la page et la réduit en niveaux de gris (facteur `step`) : { w, h, g: luma 0..255 }. */
async function grayOf(t, buf, step) {
  return t.ev(
    async ([b64, s]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const w = Math.floor(img.width / s);
      const h = Math.floor(img.height / s);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g2 = c.getContext('2d', { willReadFrequently: true });
      g2.imageSmoothingEnabled = true;
      g2.drawImage(img, 0, 0, w, h);
      const d = g2.getImageData(0, 0, w, h).data;
      const g = new Array(w * h);
      for (let i = 0; i < w * h; i++) g[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      return { w, h, g };
    },
    [buf.toString('base64'), step],
  );
}

/**
 * Luminosité d'une zone de l'écran (capture réelle, donc ce que voit le joueur) :
 * { mean (0..255), lit (part des pixels de luma > 24), spread (écart-type) }.
 */
export async function screenLuma(t, clip) {
  const buf = await t.page.screenshot({ clip });
  const { g } = await grayOf(t, buf, 2);
  let sum = 0;
  let sq = 0;
  let lit = 0;
  for (const v of g) {
    sum += v;
    sq += v * v;
    if (v > 24) lit++;
  }
  const mean = sum / g.length;
  return { mean: Math.round(mean * 10) / 10, lit: Math.round((lit / g.length) * 1000) / 1000, spread: Math.round(Math.sqrt(sq / g.length - mean * mean) * 10) / 10 };
}

// ---------------------------------------------------------------- Mise en page

/**
 * Problèmes de mise en page des éléments visibles de `selectors` (tous les éléments correspondants) :
 * élément sorti de la fenêtre (tolérance 1 px), contenu coupé par sa propre boîte (overflow hidden et
 * scrollWidth > clientWidth : texte tronqué), élément coupé par un ancêtre qui masque son débordement.
 * Renvoie [{ sel, text, problem, rect }].
 */
export function layoutProblems(t, selectors) {
  return t.ev((sels) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const out = [];
    const r4 = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    for (const sel of sels) {
      for (const e of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
        const text = (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        const push = (problem) => out.push({ sel, text, problem, rect: r4(r) });
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) push(`hors de la fenêtre ${W}x${H}`);
        // Contenu réellement coupé : boîte qui masque son débordement (texte tronqué, « … »).
        if (e.scrollWidth > e.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.overflowX === 'clip')) {
          push(`contenu coupé en largeur (${e.scrollWidth} > ${e.clientWidth})`);
        }
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
          const pr = p.getBoundingClientRect();
          if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) {
            push(`coupé par ${p.className || p.tagName} [${r4(pr).join(',')}]`);
            break;
          }
        }
      }
    }
    return out;
  }, selectors);
}

/** Échoue avec la liste des problèmes de mise en page (voir layoutProblems). */
export async function assertLayout(t, selectors, label) {
  const problems = await layoutProblems(t, selectors);
  if (problems.length) {
    throw new AssertionError(`${label} : mise en page incorrecte : ${problems.map((p) => `${p.sel} « ${p.text} » ${p.problem} [${p.rect}]`).join(' ; ')}`);
  }
}

/** Rectangles des éléments visibles de `selector` : [{ text, x, y, w, h }]. */
export function rects(t, selector) {
  return t.ev((s) => {
    return [...document.querySelectorAll(s)]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none';
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height };
      });
  }, selector);
}

/** Vrai si deux rectangles { x, y, w, h } se chevauchent. */
export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// ---------------------------------------------------------------- Mesures

/** Tas JS utilisé (Mo) après un ramasse-miettes complet (CDP). */
export async function heapMB(t) {
  const cdp = await t.cdp();
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return Math.round((usedSize / 1e6) * 10) / 10;
}

/** Images par seconde mesurées par requestAnimationFrame pendant `ms` ms. */
export function measureFps(t, ms = 1500) {
  return t.ev(
    (d) =>
      new Promise((resolve) => {
        let n = 0;
        let t0 = 0;
        const f = (now) => {
          if (!t0) t0 = now;
          else n++;
          if (now - t0 < d) requestAnimationFrame(f);
          else resolve(Math.round((n / (now - t0)) * 1000 * 10) / 10);
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
}

/** Canevas de #game-root : { engine ('three…' ou null = Phaser), shown (affiché) }. */
export function gameCanvases(t) {
  return t.ev(() =>
    [...document.querySelectorAll('#game-root canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { engine: c.dataset.engine || null, shown: getComputedStyle(c).display !== 'none' && r.width > 0 && r.height > 0 };
    }),
  );
}

/** Nombre d'éléments du document (repère de fuite de nœuds DOM). */
export function domNodes(t) {
  return t.ev(() => document.getElementsByTagName('*').length);
}
