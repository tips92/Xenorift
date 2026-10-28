// Outils des scénarios du vol 3D : parties successives (__xr3d), perte / restauration du contexte WebGL
// du renderer partagé (src/game3d/renderer.ts, src/game3d/flight.ts), journal des écrans et des messages.
// Les aides de partie (runId, waitFlying, loseFlight…) utilisent __xr3d : serveur de dev uniquement (meta.dev).
import { AssertionError, assert, fmt, waitFor, waitForScreen } from './helpers.mjs';

/** Motif de l'échec d'étape quand le contexte n'est pas restauré (CONTEXT_LOST_REASON). */
export const LOST_REASON = 'Liaison graphique perdue';
/** Délai de grâce du jeu avant d'abandonner l'étape sans contexte (RESTORE_WAIT_MS). */
export const RESTORE_WAIT_MS = 2000;

// ---------------------------------------------------------------- Journal de l'interface

/**
 * Journal des écrans affichés et des messages du HUD, injecté AVANT le chargement (appeler avant t.goto).
 * window.__uiLog : { kind: 'screen' | 'toast', name (écran) | text (message), reason (écran d'échec), at }.
 * `at` = performance.now() de la page (même horloge que loseFlight().at).
 */
export async function recordUi(t) {
  await t.page.addInitScript(() => {
    window.__uiLog = [];
    const push = (e) => window.__uiLog.push({ ...e, at: Math.round(performance.now()) });
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.dataset.screen && n.parentElement && n.parentElement.classList.contains('screens')) {
            const r = n.querySelector('.fail-reason');
            push({ kind: 'screen', name: n.dataset.screen, reason: r ? r.textContent : null });
          } else if (n.classList.contains('toast')) {
            push({ kind: 'toast', text: n.textContent });
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

/** Entrées du journal (voir recordUi) postérieures à `since` (ms, horloge de la page). */
export function uiLog(t, since = 0) {
  return t.ev((s) => (window.__uiLog || []).filter((e) => e.at >= s), since);
}

/** Écrans `name` apparus depuis `since`. */
export async function screensSince(t, name, since = 0) {
  return (await uiLog(t, since)).filter((e) => e.kind === 'screen' && e.name === name);
}

/** Messages du HUD contenant `text` apparus depuis `since`. */
export async function toastsSince(t, text, since = 0) {
  return (await uiLog(t, since)).filter((e) => e.kind === 'toast' && e.text.includes(text));
}

/** Horloge de la page (performance.now()), pour borner les recherches dans le journal. */
export function pageNow(t) {
  return t.ev(() => Math.round(performance.now()));
}

// ---------------------------------------------------------------- Parties successives

/**
 * Identifiant de la partie 3D en cours (numéro attribué à chaque nouvel objet __xr3d), ou null.
 * Chaque FlightRun installe son propre __xr3d : un numéro différent = une nouvelle partie.
 */
export function runId(t) {
  return t.ev(() => {
    const a = window.__xr3d;
    if (!a) return null;
    if (!a.__xrId) a.__xrId = window.__xrRunSeq = (window.__xrRunSeq || 0) + 1;
    return a.__xrId;
  });
}

/** Attend une partie 3D différente de `prevId` (null = n'importe laquelle) ; renvoie son identifiant. */
export async function waitNewRun(t, prevId = null, { timeout = 40000 } = {}) {
  return waitFor(
    t,
    (prev) => {
      const a = window.__xr3d;
      if (!a) return false;
      if (!a.__xrId) a.__xrId = window.__xrRunSeq = (window.__xrRunSeq || 0) + 1;
      return a.__xrId !== prev ? a.__xrId : false;
    },
    { timeout, label: `nouvelle partie 3D (précédente : ${prevId})`, arg: prevId },
  );
}

/**
 * Attend une nouvelle partie (≠ prevId) arrivée en phase de vol ('fly', après le compte à rebours de 3 s),
 * jeu dévoilé (plus de fondu ni d'enchaînement). Renvoie son identifiant.
 */
export async function waitFlying(t, prevId = null, { timeout = 45000 } = {}) {
  const id = await waitNewRun(t, prevId, { timeout });
  await waitFor(
    t,
    (rid) => {
      const a = window.__xr3d;
      const i = window.__xrShell && window.__xrShell.info();
      return !!(a && a.__xrId === rid && a.info().phase === 'fly' && i && i.phase === 'playing' && !i.navLock && !i.fading);
    },
    { timeout, label: `partie 3D n°${id} en vol`, arg: id },
  );
  return id;
}

/** __xr3d.info() ou null. */
export function flightInfo(t) {
  return t.ev(() => (window.__xr3d ? window.__xr3d.info() : null));
}

/**
 * Vérifie que le vaisseau avance : progression (0..1) en hausse sur `ms` ms, phase 'fly'.
 * Renvoie { p0, p1 }.
 */
export async function assertFlying(t, label, ms = 1500) {
  const a = await flightInfo(t);
  assert(a, `${label} : __xr3d absent (aucune partie 3D en cours)`);
  await t.wait(ms);
  const b = await flightInfo(t);
  assert(b, `${label} : la partie 3D a disparu pendant le vol`);
  assert(b.phase === 'fly', `${label} : phase 'fly' attendue, obtenu ${fmt(b.phase)}`);
  assert(
    b.progress > a.progress + 0.002,
    `${label} : la progression doit augmenter en ${ms} ms (${a.progress} -> ${b.progress})`,
  );
  return { p0: a.progress, p1: b.progress };
}

// ---------------------------------------------------------------- Contexte WebGL du vol

/**
 * Perd le contexte du canevas 3D (WEBGL_lose_context) et relève dans la même évaluation l'état de la
 * partie : { r: 'lost' | 'no-canvas' | 'no-ext', phase, progress, at (performance.now()) }.
 * L'extension est gardée dans window.__xrLoseExt.three (restoreContext(t, 'three') de gl.mjs).
 */
export function loseFlight(t) {
  return t.ev(() => {
    const c = document.querySelector('#game-root canvas[data-engine^="three"]');
    const i = window.__xr3d ? window.__xr3d.info() : null;
    const out = { r: 'no-canvas', phase: i ? i.phase : null, progress: i ? i.progress : null, at: Math.round(performance.now()) };
    if (!c) return out;
    const gl = c.getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return { ...out, r: 'no-ext' };
    window.__xrLoseExt = window.__xrLoseExt || {};
    window.__xrLoseExt.three = ext;
    ext.loseContext();
    return { ...out, r: 'lost' };
  });
}

/** Perd le contexte et vérifie que la perte a bien eu lieu (en phase `phase` si précisé). */
export async function loseFlightOk(t, phase) {
  const l = await loseFlight(t);
  assert(l.r === 'lost', `perte du contexte 3D impossible : ${l.r}`);
  if (phase) assert(l.phase === phase, `perte attendue en phase ${phase}, obtenu ${fmt(l.phase)}`);
  t.log(`contexte perdu en phase ${l.phase} (progression ${l.progress})`);
  return l;
}

/**
 * Canevas 3D présents dans la page : { tag, inGameRoot, display, visibility, lost }. `tag` = étiquette posée
 * par tagCanvas (null si le canevas n'en a pas : canevas neuf). visibility 'hidden' = masqué pendant une perte.
 */
export function threeCanvases(t) {
  return t.ev(() =>
    [...document.querySelectorAll('canvas[data-engine^="three"]')].map((c) => {
      let lost = null;
      try {
        const gl = c.getContext('webgl2');
        lost = gl ? gl.isContextLost() : null;
      } catch {
        lost = null;
      }
      return {
        tag: c.__xrTag || null,
        inGameRoot: !!c.closest('#game-root'),
        display: getComputedStyle(c).display,
        visibility: getComputedStyle(c).visibility,
        lost,
      };
    }),
  );
}

/** Étiquette le canevas 3D actuel (identité suivie d'une partie à l'autre) ; lève une erreur s'il n'y en a pas. */
export async function tagCanvas(t, tag) {
  const ok = await t.ev((g) => {
    const c = document.querySelector('#game-root canvas[data-engine^="three"]');
    if (!c) return false;
    c.__xrTag = g;
    return true;
  }, tag);
  if (!ok) throw new AssertionError(`tagCanvas : aucun canevas 3D dans #game-root`);
}

/** Exactement un canevas 3D, affiché (ni display:none ni masqué), contexte vivant ; renvoie son étiquette. */
export async function assertOneLiveCanvas(t, label) {
  const cs = await threeCanvases(t);
  assert(cs.length === 1, `${label} : un seul canevas 3D attendu, obtenu ${fmt(cs)}`);
  const c = cs[0];
  assert(
    c.inGameRoot && c.display !== 'none' && c.visibility !== 'hidden',
    `${label} : canevas 3D affiché dans #game-root attendu, obtenu ${fmt(c)}`,
  );
  assert(c.lost === false, `${label} : contexte WebGL vivant attendu, obtenu ${fmt(c)}`);
  return c.tag;
}

/**
 * Luminance moyenne (0..255) de l'image 3D : dessine une image (__xr3d.advance(0)) et lit aussitôt une
 * grille de 8x6 points du tampon (lecture dans la même tâche, avant la composition). null sans partie.
 */
export function frameLuma(t) {
  return t.ev(() => {
    const a = window.__xr3d;
    const c = document.querySelector('#game-root canvas[data-engine^="three"]');
    if (!a || !c) return null;
    a.advance(0);
    const gl = c.getContext('webgl2');
    const px = new Uint8Array(4);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        gl.readPixels(Math.floor(((i + 0.5) / 8) * gl.drawingBufferWidth), Math.floor(((j + 0.5) / 6) * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sum += 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
        n++;
      }
    }
    return Math.round((sum / n) * 10) / 10;
  });
}

// ---------------------------------------------------------------- Écrans et pause

/** Texte du motif de l'écran d'échec actif, ou null. */
export function failReason(t) {
  return t.ev(() => {
    const e = document.querySelector('.screens [data-screen="fail"].is-active .fail-reason');
    return e ? e.textContent : null;
  });
}

/** Attend l'écran d'échec utilisable et renvoie son motif. */
export async function waitFail(t, { timeout = 15000 } = {}) {
  await waitForScreen(t, 'fail', { timeout });
  return failReason(t);
}

/** Clique le bouton `label` de l'écran actif `screen` (attend d'abord que l'écran soit utilisable). */
export async function pressScreen(t, screen, label) {
  await waitForScreen(t, screen);
  await t.page.locator(`.screens [data-screen="${screen}"].is-active button`, { hasText: label }).first().click({ timeout: 5000 });
}

/** Échap : attend le menu Pause ouvert et la partie en pause. */
export async function pauseByKey(t) {
  await t.key('Escape', 60);
  await waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const i = window.__xrShell && window.__xrShell.info();
      return !!(ov && i && i.run && i.run.paused);
    },
    { timeout: 5000, label: 'menu Pause ouvert' },
  );
}

/** Clique le bouton `label` du menu Pause ouvert (Reprendre, Recommencer, Quitter). */
export async function pressPause(t, label) {
  await t.page.locator('.overlay.pause.is-open button', { hasText: label }).first().click({ timeout: 5000 });
}

// ---------------------------------------------------------------- Perte au démarrage

/**
 * Suivi du démarrage de la partie 3D et perte provoquée pendant le constructeur (appeler avant t.goto).
 * Compte les linkProgram de la page et note deux repères, d'après les messages console.debug du jeu
 * (serveur de dev) : fin de la cuisson du ciel (« [flight3d] ciel cuit », reflets PMREM compris) et fin de
 * compile() (« [flight3d] compile »). window.__boot = { links, skyLinks, compileLinks, skyAt, compileAt,
 * timings: [messages [flight3d] avec leur heure], loss: { why, during: 'create' | 'sky' | 'compile' | 'after',
 * at } | null }.
 * Perte demandée par le paramètre d'URL `xrlose` : 'create' (contexte WebGL2 perdu dès sa création) ou N
 * (juste après le N-ième linkProgram). Une seule perte par chargement : RÉESSAYER relance une partie normale.
 */
export async function armBootLoss(t) {
  await t.page.addInitScript(() => {
    const raw = new URLSearchParams(location.search).get('xrlose');
    const loseAt = !raw ? null : raw === 'create' ? 'create' : Number(raw);
    const boot = { links: 0, skyLinks: null, compileLinks: null, skyAt: null, compileAt: null, timings: [], loss: null };
    window.__boot = boot;
    const now = () => Math.round(performance.now());
    const during = () => (boot.skyLinks === null ? 'sky' : boot.compileLinks === null ? 'compile' : 'after');
    const lose = (gl, why, where) => {
      boot.loss = { why, during: where, at: now() };
      gl.getExtension('WEBGL_lose_context').loseContext();
    };
    const origDebug = console.debug;
    console.debug = function (...a) {
      const msg = String(a[0]);
      if (msg.startsWith('[flight3d]')) {
        boot.timings.push({ at: now(), msg });
        if (msg.startsWith('[flight3d] ciel cuit') && boot.skyLinks === null) {
          boot.skyLinks = boot.links;
          boot.skyAt = now();
        } else if (msg.startsWith('[flight3d] compile') && boot.compileLinks === null) {
          boot.compileLinks = boot.links;
          boot.compileAt = now();
        }
      }
      return origDebug.apply(this, a);
    };
    const origGet = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const ctx = origGet.call(this, type, attrs);
      if (loseAt === 'create' && !boot.loss && ctx && type === 'webgl2') lose(ctx, 'create', 'create');
      return ctx;
    };
    const P = WebGL2RenderingContext.prototype;
    const origLink = P.linkProgram;
    P.linkProgram = function (p) {
      const r = origLink.call(this, p);
      boot.links++;
      if (typeof loseAt === 'number' && !boot.loss && boot.links === loseAt) lose(this, `link#${loseAt}`, during());
      return r;
    };
  });
}

/** window.__boot (voir armBootLoss), null s'il n'est pas installé. */
export function bootInfo(t) {
  return t.ev(() => (window.__boot ? JSON.parse(JSON.stringify(window.__boot)) : null));
}
