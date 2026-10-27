// Bouton retour Android (événement Capacitor « backButton », via le crochet DEV __xrShell.cap) et touches
// Échap / Retour arrière / P :
//  - accueil : retour → CapApp.exitApp() appelé une fois (espion) ; deux appuis dans la même tâche → un seul
//    appel ; Échap et Retour arrière ne quittent jamais ;
//  - Niveaux / Options : retour, double retour, Échap, Retour arrière → accueil, sans quitter ; un 2e retour
//    150 ms après le premier (fondu vers l'accueil en cours) ne quitte pas ;
//  - fondus : retour pendant l'apparition de la carte d'intro, puis pendant le dévoilement de l'étape : ignoré ;
//    retour sur la carte d'intro → accueil ; retour pendant le fondu de QUITTER : ignoré ;
//  - en jeu : retour → pause (un seul menu pour deux appuis), retour → reprise ; Options du menu Pause :
//    retour → menu Pause, retour → reprise ; Échap → pause sans reprise immédiate (deux écouteurs), P → reprise ;
//    Espace : défilement bloqué en jeu, pas dans le menu Pause.
import { activeScreen, assert, assertEq, clickText, fmt, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import {
  clickPauseButton,
  clickThen,
  exitCalls,
  instrument,
  pauseState,
  pressBack,
  spyExitApp,
  waitIntroCard,
  waitPaused,
  waitResumed,
} from '../lib/shell.mjs';

export const meta = {
  title: 'Bouton retour Android : accueil (exitApp), menus, fondus, pause',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 120000,
};

/** Laisse passer l'anti-doublon du retour (120 ms) avant l'appui suivant. */
const GAP_MS = 200;

/**
 * Appuie sur retour dès que le shell est en phase `phase` avec un fondu au noir en cours (sondage dans la page,
 * toutes les 4 ms). Renvoie __xrShell.info() au moment de l'appui.
 */
async function backDuringFade(t, phase) {
  const r = await t.ev(
    (ph) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const id = setInterval(() => {
          const i = window.__xrShell.info();
          const ok = i.phase === ph && i.fading && (ph !== 'playing' || (i.run && !i.run.ended));
          if (ok || performance.now() - t0 > 20000) {
            clearInterval(id);
            if (ok) window.__xrShell.cap('backButton');
            resolve({ ok, info: i });
          }
        }, 4);
      }),
    phase,
  );
  assert(r.ok, `fondu en phase ${phase} jamais observé (dernier état : ${fmt(r.info)})`);
  return r.info;
}

/** Espace envoyé à la page : vrai si le jeu a bloqué l'action par défaut (défilement). */
function spacePrevented(t) {
  return t.ev(() => {
    const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
    return e.defaultPrevented;
  });
}

async function assertExits(t, n, msg) {
  // exitApp passe par une promesse (chargement du greffon Capacitor) : on laisse le temps à l'appel d'arriver.
  await t.wait(250);
  assertEq(await exitCalls(t), n, `${msg} : appels à exitApp`);
}

export default async function (t) {
  await instrument(t);
  await t.goto('?touch=1&unlock=1');
  await waitForScreen(t, 'title');
  const mod = await spyExitApp(t);
  t.log('espion exitApp sur', mod);
  await t.key('KeyZ', 40); // premier geste : déblocage du son

  // ---------------------------------------------------------------- Accueil
  await pressBack(t);
  await waitFor(t, () => window.__exitCalls === 1, { timeout: 3000, label: 'retour sur l’accueil : exitApp appelé' });
  assertEq(await activeScreen(t), 'title', 'écran après retour sur l’accueil (version web : rien ne se ferme)');
  await t.wait(GAP_MS);
  await pressBack(t, 2);
  await assertExits(t, 2, 'deux retours dans la même tâche : un seul appel de plus');
  await t.wait(GAP_MS);
  await t.key('Escape', 40);
  await t.wait(GAP_MS);
  await t.key('Backspace', 40);
  await assertExits(t, 2, 'Échap puis Retour arrière sur l’accueil');
  assertEq(await activeScreen(t), 'title', 'écran après Échap / Retour arrière sur l’accueil');
  await t.shot('title');

  // ---------------------------------------------------------------- Niveaux
  // Retour dans la même tâche que le clic (fondu enchaîné vers Niveaux en cours) : ignoré.
  await clickThen(t, '.screens [data-screen="title"].is-active', 'Niveaux', 'back');
  await waitForScreen(t, 'select');
  await t.wait(400);
  assertEq(await activeScreen(t), 'select', 'retour pendant le fondu vers Niveaux : Niveaux reste affiché');
  await t.shot('select');
  await pressBack(t);
  await waitForScreen(t, 'title');
  // Deux retours à 150 ms : le 2e arrive pendant le fondu vers l'accueil et ne doit pas quitter l'application.
  await clickText(t, 'Niveaux');
  await waitForScreen(t, 'select');
  await t.ev(() => {
    window.__xrShell.cap('backButton');
    setTimeout(() => window.__xrShell.cap('backButton'), 150);
  });
  await t.wait(400);
  await waitForScreen(t, 'title');
  await assertExits(t, 2, 'Niveaux : deux retours à 150 ms (le 2e pendant le fondu vers l’accueil)');

  // ---------------------------------------------------------------- Options
  await clickText(t, 'Options');
  await waitForScreen(t, 'options');
  await pressBack(t, 2);
  await waitForScreen(t, 'title');
  await t.wait(300);
  assertEq(await activeScreen(t), 'title', 'Options : double retour → accueil');
  for (const k of ['Escape', 'Backspace']) {
    await clickText(t, 'Options');
    await waitForScreen(t, 'options');
    await t.key(k, 40);
    await waitForScreen(t, 'title', { timeout: 5000 });
  }
  await assertExits(t, 2, 'retours depuis Options');

  // ---------------------------------------------------------------- Carte d'intro
  await clickThen(t, '.screens [data-screen="title"].is-active', 'Jouer');
  const atFade = await backDuringFade(t, 'intro');
  t.log('retour pendant l’apparition de la carte d’intro', fmt(atFade));
  await waitIntroCard(t);
  assertEq(await activeScreen(t), 'intro', 'retour pendant l’apparition de la carte d’intro : ignoré');
  await t.shot('intro');
  await t.wait(GAP_MS);
  await pressBack(t);
  await waitForScreen(t, 'title');
  assertEq(await t.ev(() => window.__xrShell.info().run), null, 'retour sur la carte d’intro : aucune étape en cours');
  await assertExits(t, 2, 'retours pendant l’intro');

  // ---------------------------------------------------------------- Dévoilement de l'étape
  await clickText(t, 'Jouer');
  await waitIntroCard(t);
  const atReveal = await backDuringFade(t, 'playing');
  t.log('retour pendant le dévoilement de l’étape', fmt(atReveal));
  await waitFor2dPlay(t);
  await t.wait(400);
  const s0 = await pauseState(t);
  assert(!s0.paused && s0.open === 0, `retour pendant le dévoilement de l'étape : ignoré, partie non en pause (${fmt(s0)})`);

  // ---------------------------------------------------------------- En jeu : pause / reprise
  assert(await spacePrevented(t), 'en jeu, Espace doit être intercepté (pas de défilement de la page)');
  await t.wait(GAP_MS);
  await pressBack(t, 2);
  await waitPaused(t, 'deux retours en jeu : menu Pause');
  await t.wait(400);
  const p1 = await pauseState(t);
  assert(p1.paused && p1.overlays === 1 && p1.open === 1, `deux retours dans la même tâche : une seule pause, un seul menu (${fmt(p1)})`);
  assertEq(p1.view, 'menu', 'vue du menu Pause à l’ouverture');
  assert(!(await spacePrevented(t)), 'dans le menu Pause, Espace ne doit pas être intercepté (boutons utilisables au clavier)');
  await t.shot('paused-by-back');
  await pressBack(t);
  await waitResumed(t, 'retour dans le menu Pause : reprise');

  // Options du menu Pause : retour → menu Pause, puis retour → reprise
  await t.wait(GAP_MS);
  await pressBack(t);
  await waitPaused(t);
  await clickPauseButton(t, 'Options');
  await waitFor(t, () => (document.querySelector('.overlay.pause.is-open') || {}).dataset?.view === 'options', {
    timeout: 3000,
    label: 'menu Pause : vue Options',
  });
  await t.shot('pause-options');
  await t.wait(GAP_MS);
  await pressBack(t);
  await t.wait(300);
  const p2 = await pauseState(t);
  assert(p2.paused && p2.open === 1 && p2.view === 'menu', `retour dans Options du menu Pause : retour au menu, toujours en pause (${fmt(p2)})`);
  await pressBack(t);
  await waitResumed(t, 'retour sur le menu Pause : reprise');

  // Échap : deux écouteurs (module d'entrées + clavier global) pour un seul appui → une seule bascule
  await t.wait(GAP_MS);
  await t.key('Escape', 40);
  await waitPaused(t, 'Échap en jeu : pause');
  await t.wait(400);
  const p3 = await pauseState(t);
  assert(p3.paused && p3.open === 1, `Échap : la partie doit rester en pause (pas de reprise immédiate) (${fmt(p3)})`);
  await t.key('KeyP', 40);
  await waitResumed(t, 'P dans le menu Pause : reprise');

  // ---------------------------------------------------------------- QUITTER puis retour sur l'accueil
  await t.wait(GAP_MS);
  await t.key('Escape', 40);
  await waitPaused(t);
  // Retour dans la même tâche que QUITTER (fondu vers l'accueil) : ignoré, pas de sortie.
  await clickThen(t, '.overlay.pause.is-open', 'Quitter', 'back');
  await waitForScreen(t, 'title');
  await t.wait(300);
  assertEq(await activeScreen(t), 'title', 'QUITTER : accueil');
  assertEq(await t.ev(() => window.__xrShell.info().run), null, 'QUITTER : plus d’étape en cours');
  await assertExits(t, 2, 'retour pendant le fondu de QUITTER');
  await pressBack(t);
  await assertExits(t, 3, 'retour sur l’accueil après QUITTER');
  await t.shot('title-after-quit');
}
