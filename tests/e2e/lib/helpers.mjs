// Outils communs des scénarios : assertions, attentes actives, écrans de l'interface, état du jeu.
// Toutes les fonctions prennent l'objet `t` fourni par le lanceur (voir tests/e2e/run.mjs).
import { isDeepStrictEqual } from 'node:util';

/** Durée des fondus d'écran (FADE_MS dans src/ui/overlays.ts) + marge. */
const SETTLE_MS = 320;

/** Valeur courte et lisible pour un message d'erreur. */
export function fmt(v) {
  let s;
  try {
    s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x));
  } catch {
    s = String(v);
  }
  if (s === undefined) s = String(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

// ---------------------------------------------------------------- Assertions

export class AssertionError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'AssertionError';
  }
}

/** Échoue si `cond` est faux. */
export function assert(cond, msg = 'condition fausse') {
  if (!cond) throw new AssertionError(`Assertion échouée : ${msg}`);
}

/** Égalité profonde stricte (nombres, chaînes, tableaux, objets simples). */
export function assertEq(actual, expected, msg = 'valeurs différentes') {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new AssertionError(`Assertion échouée : ${msg} : attendu ${fmt(expected)}, obtenu ${fmt(actual)}`);
  }
}

/** |a - b| <= tol. */
export function assertNear(a, b, tol, msg = 'valeurs trop éloignées') {
  if (typeof a !== 'number' || typeof b !== 'number' || !(Math.abs(a - b) <= tol)) {
    throw new AssertionError(`Assertion échouée : ${msg} : ${fmt(a)} au lieu de ${fmt(b)} ± ${tol}`);
  }
}

// ---------------------------------------------------------------- Attentes

/**
 * Évalue `fn` dans la page (t.ev) jusqu'à obtenir une valeur vraie, et la renvoie.
 * Une évaluation qui lève (navigation en cours, aide DEV pas encore là…) compte comme « pas encore ».
 * Lève une erreur explicite (libellé + dernière valeur) si le délai est dépassé.
 */
export async function waitFor(t, fn, { timeout = 20000, interval = 150, label = 'condition', arg } = {}) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try {
      last = await t.ev(fn, arg);
      if (last) return last;
    } catch (e) {
      last = `erreur : ${String(e && e.message ? e.message : e).split('\n')[0]}`;
    }
    if (Date.now() - t0 >= timeout) {
      throw new AssertionError(`waitFor « ${label} » : délai de ${timeout} ms dépassé (dernière valeur : ${fmt(last)})`);
    }
    await t.wait(interval);
  }
}

// ---------------------------------------------------------------- Écrans de l'interface

/** Nom de l'écran actif (data-screen), ou null (en jeu, écran noir…). */
export function activeScreen(t) {
  return t.ev(() => {
    const s = document.querySelector('.screens [data-screen].is-active:not(.is-leaving)');
    return s ? s.dataset.screen : null;
  });
}

/**
 * Attend que l'écran `name` soit affiché et utilisable : actif, fondu au noir terminé et,
 * en dev, plus aucun enchaînement en cours (les clics pendant un enchaînement sont ignorés).
 * Sans les aides DEV (build de production), on laisse simplement passer la durée d'un fondu.
 */
export async function waitForScreen(t, name, { timeout = 20000 } = {}) {
  const mode = await waitFor(
    t,
    (n) => {
      const s = document.querySelector(`.screens [data-screen="${n}"]`);
      const f = document.querySelector('.fader');
      if (!s || !s.classList.contains('is-active') || s.classList.contains('is-leaving')) return false;
      if (f && f.classList.contains('is-on')) return false;
      const sh = window.__xrShell;
      if (!sh) return 'prod';
      const i = sh.info();
      return !i.navLock && !i.fading ? 'dev' : false;
    },
    { timeout, label: `écran ${name}`, arg: name },
  );
  if (mode === 'prod') await t.wait(SETTLE_MS);
}

/**
 * Bouton `label` de l'écran `screen` affiché : celui dont le texte vaut exactement `label` (casse et espaces
 * ignorés), sinon le premier qui le contient. Ainsi « Réessayer » ne prend pas « Réessayer le combat », placé avant.
 */
export async function screenButton(t, screen, label) {
  const all = t.page.locator(`.screens [data-screen="${screen}"].is-active button`);
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = all.filter({ hasText: new RegExp(`^\\s*${esc}\\s*$`, 'i') });
  return (await exact.count()) > 0 ? exact.first() : all.filter({ hasText: label }).first();
}

/** Texte visible (innerText, espaces normalisés) d'un écran, ou '' s'il est absent. */
export function screenText(t, name) {
  return t.ev((n) => {
    const s = document.querySelector(`.screens [data-screen="${n}"]`);
    return s ? s.innerText.replace(/\s+/g, ' ').trim() : '';
  }, name);
}

/** Clique le premier élément VISIBLE contenant `text` (insensible à la casse sauf exact: true). */
export async function clickText(t, text, { exact = false, timeout = 10000 } = {}) {
  await t.page.getByText(text, { exact }).filter({ visible: true }).first().click({ timeout });
}

/**
 * Coordonnées page d'un point de l'élément `selector` : fx, fy = fraction de la largeur / hauteur
 * (0.5, 0.5 = centre). Lève une erreur si l'élément est absent.
 */
export async function center(t, selector, fx = 0.5, fy = 0.5) {
  const p = await t.ev(
    ([s, x, y]) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [r.x + r.width * x, r.y + r.height * y];
    },
    [selector, fx, fy],
  );
  if (!p) throw new AssertionError(`center : élément introuvable : ${selector}`);
  return p;
}

/** Sauvegarde du jeu (localStorage 'xeno-rift-save-v1'), ou null. */
export function readSave(t) {
  return t.ev(() => {
    const raw = localStorage.getItem('xeno-rift-save-v1');
    return raw ? JSON.parse(raw) : null;
  });
}

// ---------------------------------------------------------------- État du jeu (aides DEV uniquement)

/**
 * Attend une partie 2D jouable : scène en 'play', phase shell 'playing', pas de pause,
 * fondu d'entrée terminé (sinon les premières touches peuvent être perdues).
 */
export function waitFor2dPlay(t, { timeout = 30000 } = {}) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      const i = window.__xrShell && window.__xrShell.info();
      return !!(s && s.state === 'play' && s.player && i && i.phase === 'playing' && i.run && !i.run.paused && !i.navLock);
    },
    { timeout, label: 'partie 2D jouable (__xr2d.scene.state = play)' },
  );
}

/** Kaï et la scène 2D : x, pieds (feetY, l'axe y descend), au sol, état de la scène. Null hors partie 2D. */
export function player2d(t) {
  return t.ev(() => {
    const s = window.__xr2d && window.__xr2d.scene;
    if (!s || !s.player) return null;
    const p = s.player;
    return { x: p.x, feetY: p.feetY, onGround: !!p.onGround, state: s.state, paused: !!(s.session && s.session.paused) };
  });
}

/** Tirs laser actifs dans la scène 2D. */
export function lasers2d(t) {
  return t.ev(() => {
    const s = window.__xr2d && window.__xr2d.scene;
    if (!s) return 0;
    return s.children.list.filter((c) => c.texture && c.texture.key === 'laser' && c.active).length;
  });
}

/** Attend que le vol 3D atteigne la phase `phase` ('intro', 'fly', 'warp', 'dead', 'timeout', 'done'). */
export function waitFor3dPhase(t, phase, { timeout = 40000 } = {}) {
  return waitFor(t, (ph) => !!(window.__xr3d && window.__xr3d.info().phase === ph), {
    timeout,
    label: `vol 3D en phase ${phase}`,
    arg: phase,
  });
}

/** __xr3d.info() ou null (l'aide disparaît quand la partie est détruite). */
export function info3d(t) {
  return t.ev(() => (window.__xr3d ? window.__xr3d.info() : null));
}
