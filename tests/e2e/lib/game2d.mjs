// Outils des scénarios de la plateforme 2D (src/game2d) : identité du jeu Phaser d'une session à l'autre,
// perte / restauration de son contexte WebGL, fins d'étape (onFail / onComplete), journal des écrans et des
// messages du HUD, image réellement affichée, vérification que Kaï répond (course, saut, tir).
// Les aides de partie utilisent __xr2d / __xrShell : serveur de dev uniquement (meta.dev).
import { AssertionError, assert, fmt, lasers2d, player2d, waitFor, waitFor2dPlay, waitForScreen } from './helpers.mjs';

/** Motif de l'échec d'étape sans restauration du contexte (GFX_LOST_REASON, src/game2d/engine/game.ts). */
export const LOST_REASON = 'Liaison graphique perdue';
/** Temps au premier plan accordé à la restauration avant d'abandonner l'étape (GFX_RESTORE_WAIT_MS). */
export const RESTORE_WAIT_MS = 5000;
/** Renderer.type de Phaser : rendu Canvas 2D (secours) et WebGL. */
export const CANVAS = 1;
export const WEBGL = 2;

// ---------------------------------------------------------------- Journal de l'interface

/**
 * Journal des écrans affichés et des messages du HUD, injecté AVANT le chargement (appeler avant t.goto).
 * window.__ui2d : { kind: 'screen' | 'toast', name (écran) | text (message), reason (écran d'échec), at }.
 * `at` = performance.now() de la page (même horloge que loseGame().at et pageNow()).
 */
export async function recordUi(t) {
  await t.page.addInitScript(() => {
    window.__ui2d = [];
    const push = (e) => window.__ui2d.push({ ...e, at: Math.round(performance.now()) });
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

/** Horloge de la page (performance.now() arrondi). */
export function pageNow(t) {
  return t.ev(() => Math.round(performance.now()));
}

/** Écrans `name` apparus depuis `since` (ms, horloge de la page). */
export function screensSince(t, name, since = 0) {
  return t.ev(([n, s]) => (window.__ui2d || []).filter((e) => e.kind === 'screen' && e.name === n && e.at >= s), [name, since]);
}

/** Messages du HUD contenant `text` apparus depuis `since`. */
export function toastsSince(t, text, since = 0) {
  return t.ev(([x, s]) => (window.__ui2d || []).filter((e) => e.kind === 'toast' && e.text.includes(x) && e.at >= s), [text, since]);
}

/** Vrai si un message du HUD contenant `text` est affiché en ce moment (pas en train de sortir). */
export function toastVisible(t, text) {
  return t.ev((x) => [...document.querySelectorAll('.toast:not(.is-out)')].some((e) => e.textContent.includes(x)), text);
}

// ---------------------------------------------------------------- Jeu Phaser et session

/**
 * Enregistre le jeu Phaser de la scène 2D courante (numéroté 1, 2… dans l'ordre d'apparition :
 * un nouveau numéro = une nouvelle instance Phaser) et branche un journal sur les fins d'étape de la session :
 * window.__ends2d : { kind: 'fail' | 'complete', reason, sid, game, at }.
 * Renvoie { game, sid, stage }.
 */
export async function armGame(t) {
  const r = await t.ev(() => {
    const s = window.__xr2d && window.__xr2d.scene;
    if (!s || !s.session) return null;
    const g = s.game;
    window.__games2d = window.__games2d || [];
    if (!window.__games2d.includes(g)) window.__games2d.push(g);
    const n = window.__games2d.indexOf(g) + 1;
    window.__ends2d = window.__ends2d || [];
    const sess = s.session;
    const h = sess.hooks;
    if (!h.__xrArmed) {
      h.__xrArmed = true;
      const of = h.onFail;
      const oc = h.onComplete;
      const log = (kind, reason) =>
        window.__ends2d.push({ kind, reason: reason === undefined ? null : reason, sid: sess.id, game: n, at: Math.round(performance.now()) });
      h.onFail = (reason) => {
        log('fail', reason);
        return of(reason);
      };
      h.onComplete = (res) => {
        log('complete', null);
        return oc(res);
      };
    }
    return { game: n, sid: sess.id, stage: sess.stage.id };
  });
  if (!r) throw new AssertionError('armGame : aucune scène 2D avec session (__xr2d.scene.session)');
  return r;
}

/** Attend une partie 2D jouable puis l'enregistre (armGame). Renvoie { game, sid, stage }. */
export async function waitPlay(t, { timeout = 30000 } = {}) {
  await waitFor2dPlay(t, { timeout });
  return armGame(t);
}

/** Fins d'étape enregistrées (voir armGame), éventuellement depuis `since`. */
export function ends(t, since = 0) {
  return t.ev((s) => (window.__ends2d || []).filter((e) => e.at >= s), since);
}

/**
 * État du moteur 2D : { game (n° armGame, 0 si inconnu), sid, stage, state, x, feetY, type (Renderer.type),
 * contextLost (WebGL : drapeau Phaser ou contexte perdu ; null en Canvas), loop (boucle active),
 * sceneActive, scenePaused, paused (pause de l'interface), gfxLost, ended, display (canvas) }, ou null sans scène.
 */
export function engine2d(t) {
  return t.ev(() => {
    const s = window.__xr2d && window.__xr2d.scene;
    if (!s || !s.player) return null;
    const g = s.game;
    const r = g.renderer;
    const sess = s.session;
    let lost = null;
    if (r && r.type === 2) {
      try {
        lost = !!(r.contextLost || !r.gl || r.gl.isContextLost());
      } catch {
        lost = true;
      }
    }
    return {
      game: (window.__games2d || []).indexOf(g) + 1,
      sid: sess ? sess.id : null,
      stage: sess ? sess.stage.id : null,
      state: s.state,
      x: s.player.x,
      feetY: s.player.feetY,
      type: r ? r.type : null,
      contextLost: lost,
      loop: !!g.loop.running,
      sceneActive: s.sys.isActive(),
      scenePaused: s.sys.isPaused(),
      paused: !!(sess && sess.paused),
      gfxLost: !!(sess && sess.gfxLost),
      ended: !!(sess && sess.ended),
      display: g.canvas ? g.canvas.style.display : null,
    };
  });
}

/**
 * Jeu n° `n` (armGame) même hors partie (endormi ou abandonné) : { canvasInDom, display, loop, destroyed,
 * contextLost }. null si ce numéro n'existe pas.
 */
export function gameInfo(t, n) {
  return t.ev((k) => {
    const g = (window.__games2d || [])[k - 1];
    if (!g) return null;
    const r = g.renderer;
    let lost = null;
    try {
      if (r && r.type === 2) lost = !!(r.contextLost || !r.gl || r.gl.isContextLost());
    } catch {
      lost = true;
    }
    return {
      canvasInDom: !!(g.canvas && g.canvas.isConnected),
      display: g.canvas ? g.canvas.style.display : null,
      loop: !!(g.loop && g.loop.running),
      destroyed: !!g.pendingDestroy || !r,
      contextLost: lost,
    };
  }, n);
}

/** Canvas de #game-root qui ne sont pas ceux du vol 3D (canvas Phaser). */
export function phaserCanvases(t) {
  return t.ev(() =>
    [...document.querySelectorAll('#game-root canvas')]
      .filter((c) => !c.dataset.engine)
      .map((c) => ({ display: c.style.display || getComputedStyle(c).display, width: c.width, height: c.height })),
  );
}

/**
 * Perd le contexte WebGL du jeu n° `n` (par défaut : celui de la scène 2D courante) et relève l'état au même
 * instant : { r: 'lost' | 'no-game' | 'no-gl' | 'no-ext', game, at, x, state }.
 * L'extension est gardée sur le jeu (restoreGame).
 */
export function loseGame(t, n = 0) {
  return t.ev((k) => {
    const s = window.__xr2d && window.__xr2d.scene;
    const g = k ? (window.__games2d || [])[k - 1] : s && s.game;
    const at = Math.round(performance.now());
    if (!g) return { r: 'no-game', game: k, at };
    const r = g.renderer;
    const gl = r && r.type === 2 ? r.gl : null;
    if (!gl) return { r: 'no-gl', game: k, at };
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { r: 'no-ext', game: k, at };
    g.__xrLoseExt = ext;
    const p = s && s.game === g && s.player ? { x: s.player.x, state: s.state } : { x: null, state: null };
    ext.loseContext();
    return { r: 'lost', game: (window.__games2d || []).indexOf(g) + 1, at, ...p };
  }, n);
}

/** loseGame + vérification. */
export async function loseGameOk(t, n = 0, label = 'perte du contexte 2D') {
  const l = await loseGame(t, n);
  assert(l.r === 'lost', `${label} : impossible de perdre le contexte (${l.r})`);
  t.log(`${label} : contexte du jeu n°${l.game} perdu${l.state ? ` (état ${l.state}, x ${Math.round(l.x)})` : ''}`);
  return l;
}

/** Restaure le contexte perdu par loseGame (jeu n° `n`, ou celui de la scène courante). Renvoie true si demandé. */
export async function restoreGame(t, n = 0) {
  const ok = await t.ev((k) => {
    const s = window.__xr2d && window.__xr2d.scene;
    const g = k ? (window.__games2d || [])[k - 1] : s && s.game;
    if (!g || !g.__xrLoseExt) return false;
    g.__xrLoseExt.restoreContext();
    return true;
  }, n);
  assert(ok, `restauration du contexte 2D impossible (jeu n°${n || 'courant'} sans perte provoquée)`);
}

// ---------------------------------------------------------------- Écrans

/** Attend l'écran d'échec utilisable et renvoie son motif. */
export async function waitFail(t, { timeout = 20000 } = {}) {
  await waitForScreen(t, 'fail', { timeout });
  return t.ev(() => {
    const e = document.querySelector('.screens [data-screen="fail"].is-active .fail-reason');
    return e ? e.textContent : null;
  });
}

/** Clique le bouton `label` de l'écran `screen` une fois celui-ci utilisable. */
export async function pressScreen(t, screen, label) {
  await waitForScreen(t, screen);
  await t.page.locator(`.screens [data-screen="${screen}"].is-active button`, { hasText: label }).first().click({ timeout: 5000 });
}

/** État du menu Pause : 'open', 'closing' ou 'none'. */
export function pauseOverlay(t) {
  return t.ev(() => {
    const ov = document.querySelector('.overlay.pause');
    return ov ? (ov.classList.contains('is-open') ? 'open' : 'closing') : 'none';
  });
}

/** Attend le menu Pause ouvert (true) ou disparu / en fermeture (false), avec l'état de la partie assorti. */
export function waitPauseMenu(t, open, { timeout = 5000 } = {}) {
  return waitFor(
    t,
    (o) => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const i = window.__xrShell && window.__xrShell.info();
      if (!i || !i.run) return false;
      return o ? !!ov && i.run.paused : !ov && !i.run.paused && !i.navLock;
    },
    { timeout, label: open ? 'menu Pause ouvert' : 'menu Pause fermé, partie reprise', arg: open },
  );
}

/** Clique le bouton `label` du menu Pause ouvert (Reprendre, Recommencer, Quitter). */
export async function pressPause(t, label) {
  await t.page.locator('.overlay.pause.is-open button', { hasText: label }).first().click({ timeout: 5000 });
}

// ---------------------------------------------------------------- Image affichée

/**
 * Statistiques de l'image du canvas Phaser telle qu'elle est affichée (capture d'écran du navigateur,
 * HUD, messages et commandes tactiles masqués) : bande centrale du canvas, grille de 48 x 16 points.
 * { mean (luminance moyenne 0..255), std (écart type), colors (couleurs distinctes, 4 bits par canal) }.
 */
export async function frameStats(t) {
  const rect = await t.ev(() => {
    const s = window.__xr2d && window.__xr2d.scene;
    const c = s ? s.game.canvas : [...document.querySelectorAll('#game-root canvas')].find((x) => !x.dataset.engine && x.style.display !== 'none');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!rect || rect.w < 10 || rect.h < 10) throw new AssertionError(`frameStats : canvas Phaser absent ou invisible (${fmt(rect)})`);
  const clip = { x: Math.round(rect.x), y: Math.round(rect.y + rect.h * 0.15), width: Math.round(rect.w), height: Math.round(rect.h * 0.7) };
  const buf = await t.page.screenshot({ clip, style: '#ui-root, #touch-root { visibility: hidden !important; }' });
  return t.ev(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const lum = [];
    const colors = new Set();
    for (let i = 0; i < 48; i++) {
      for (let j = 0; j < 16; j++) {
        const x = Math.floor(((i + 0.5) / 48) * bmp.width);
        const y = Math.floor(((j + 0.5) / 16) * bmp.height);
        const k = (y * bmp.width + x) * 4;
        lum.push(0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]);
        colors.add(((d[k] >> 4) << 8) | ((d[k + 1] >> 4) << 4) | (d[k + 2] >> 4));
      }
    }
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const std = Math.sqrt(lum.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lum.length);
    return { mean: Math.round(mean * 10) / 10, std: Math.round(std * 10) / 10, colors: colors.size };
  }, buf.toString('base64'));
}

/** Image « vivante » : décor texturé (contraste et couleurs), pas un écran noir ou uni. */
export async function assertRenders(t, label, ref = null) {
  const f = await frameStats(t);
  t.log(`${label} : image ${fmt(f)}${ref ? ` (référence ${fmt(ref)})` : ''}`);
  assert(f.std >= 12 && f.colors >= 12 && f.mean >= 12, `${label} : image du jeu attendue (contrastée, colorée), obtenu ${fmt(f)}`);
  if (ref) {
    // Même endroit du niveau : l'image doit ressembler à la référence (textures toutes présentes).
    assert(
      f.mean >= ref.mean * 0.6 && f.mean <= ref.mean * 1.6 && f.std >= ref.std * 0.6 && f.colors >= ref.colors * 0.5,
      `${label} : image comparable à la référence attendue (${fmt(ref)}), obtenu ${fmt(f)}`,
    );
  }
  return f;
}

// ---------------------------------------------------------------- Kaï répond

/** Kaï au départ du niveau, au sol, invincible (les chutes ramènent au dernier sol sûr). */
export async function home(t) {
  await t.ev(() => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(true);
    window.__xr2d.teleport(s.parsed.start.col, s.parsed.start.row);
  });
  await waitGrounded(t, 'Kaï au sol au départ');
}

/** Attend Kaï au sol et immobile verticalement. */
export function waitGrounded(t, label = 'Kaï au sol') {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.player && s.player.onGround && Math.abs(s.player.body.velocity.y) < 1);
    },
    { timeout: 6000, label },
  );
}

/** Flèche droite tenue `ms` ms : renvoie { x0, x1 }. */
export async function runRight(t, ms) {
  const x0 = (await player2d(t)).x;
  await t.page.keyboard.down('ArrowRight');
  await t.wait(ms);
  await t.page.keyboard.up('ArrowRight');
  const x1 = (await player2d(t)).x;
  return { x0, x1 };
}

/**
 * Vérifie que la partie répond : retour au départ, course (x +80 px en 600 ms), saut (pieds +40 px),
 * tir (au moins un laser). Renvoie { dx, rise, lasers }.
 */
export async function assertPlays(t, label) {
  await home(t);
  const run = await runRight(t, 600);
  const dx = run.x1 - run.x0;
  assert(dx > 80, `${label} : flèche droite, Kaï doit avancer de plus de 80 px (${Math.round(run.x0)} -> ${Math.round(run.x1)})`);
  await waitGrounded(t, `${label} : Kaï au sol avant le saut`);
  const y0 = (await player2d(t)).feetY;
  let minY = y0;
  await t.page.keyboard.down('Space');
  for (let i = 0; i < 10; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  await t.page.keyboard.up('Space');
  for (let i = 0; i < 4; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  const rise = y0 - minY;
  assert(rise > 40, `${label} : Espace, Kaï doit sauter d'au moins 40 px (montée ${Math.round(rise)} px)`);
  await waitGrounded(t, `${label} : Kaï retombé au sol`);
  let lasers = 0;
  for (let i = 0; i < 3 && !lasers; i++) {
    await t.key('KeyJ', 60);
    lasers = Math.max(lasers, await lasers2d(t));
    await t.wait(80);
    lasers = Math.max(lasers, await lasers2d(t));
  }
  assert(lasers > 0, `${label} : J, au moins un tir laser attendu`);
  t.log(`${label} : course +${Math.round(dx)} px, saut ${Math.round(rise)} px, ${lasers} laser(s)`);
  return { dx, rise, lasers };
}

/**
 * Vérifie que Kaï reste figé : flèche droite tenue `ms` ms puis Espace, x et pieds inchangés.
 * Renvoie l'état du moteur à la fin.
 */
export async function assertFrozen(t, label, ms = 700) {
  const a = await player2d(t);
  await t.page.keyboard.down('ArrowRight');
  await t.wait(ms);
  await t.key('Space', 120);
  await t.page.keyboard.up('ArrowRight');
  const b = await player2d(t);
  assert(a && b, `${label} : scène 2D absente`);
  assert(
    Math.abs(b.x - a.x) < 0.5 && Math.abs(b.feetY - a.feetY) < 0.5,
    `${label} : Kaï doit rester figé (x ${Math.round(a.x)} -> ${Math.round(b.x)}, pieds ${Math.round(a.feetY)} -> ${Math.round(b.feetY)})`,
  );
  return engine2d(t);
}
