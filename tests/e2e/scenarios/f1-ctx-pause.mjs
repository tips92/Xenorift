// Vol 1 (f1) : perte du contexte WebGL et pause (cas Android : appli en arrière-plan, GPU repris).
//  a. pause -> perte -> 3 s sans échec (délai de grâce suspendu) -> restauration (« Liaison rétablie »)
//     -> Reprendre -> la même partie continue ;
//  b. pause -> perte -> 3 s sans échec -> Reprendre sans restauration -> échec ~2 s après la reprise ;
//  c. pause -> perte -> Recommencer -> nouvelle partie qui vole, aucun échec périmé de l'ancienne ;
//  d. perte en vol -> pause aussitôt -> Quitter -> accueil, aucun échec périmé.
import { activeScreen, assert, fmt, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  assertFlying,
  assertOneLiveCanvas,
  loseFlightOk,
  pageNow,
  pauseByKey,
  pressPause,
  pressScreen,
  recordUi,
  runId,
  screensSince,
  tagCanvas,
  threeCanvases,
  toastsSince,
  waitFail,
  waitFlying,
} from '../lib/game3d.mjs';
import { restoreContext } from '../lib/gl.mjs';

export const meta = {
  title: 'Vol 1 : perte du contexte WebGL pendant la pause',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

/** Menu Pause toujours ouvert et partie toujours en pause. */
function stillPaused(t) {
  return t.ev(() => {
    const ov = document.querySelector('.overlay.pause.is-open');
    const i = window.__xrShell && window.__xrShell.info();
    return !!(ov && i && i.run && i.run.paused && !i.run.ended);
  });
}

/** Attend la fermeture du menu Pause et la partie relancée. */
function waitResumed(t, label) {
  return waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const i = window.__xrShell && window.__xrShell.info();
      return !ov && !!(i && i.run && !i.run.paused);
    },
    { timeout: 5000, label },
  );
}

export default async function (t) {
  await recordUi(t);
  await t.goto('?unlock=1&stage=f1');
  let run = await waitFlying(t, null);
  await tagCanvas(t, 'a');

  // ---------- a. Perte pendant la pause puis restauration : reprise sur place
  await pauseByKey(t);
  const la = await loseFlightOk(t, 'fly');
  await t.wait(RESTORE_WAIT_MS + 1000);
  let fails = await screensSince(t, 'fail', la.at);
  assert(fails.length === 0, `a. pendant la pause, la perte ne doit pas faire échouer l'étape, obtenu ${fmt(fails)}`);
  assert(await stillPaused(t), 'a. le menu Pause doit rester ouvert pendant la perte');
  assert(await restoreContext(t, 'three'), 'a. restauration impossible (extension absente)');
  await waitFor(
    t,
    (since) => (window.__uiLog || []).some((e) => e.kind === 'toast' && e.at >= since && e.text.includes('Liaison rétablie')),
    { timeout: 10000, label: 'a. message « Liaison rétablie »', arg: la.at },
  );
  assert(await stillPaused(t), 'a. la restauration ne doit pas relancer la partie (pause)');
  await t.shot('a-paused-restored');
  await pressPause(t, 'Reprendre');
  await waitResumed(t, 'a. reprise après restauration');
  const tagA = await assertOneLiveCanvas(t, 'a. reprise après restauration');
  assert(tagA === 'a', `a. la partie doit garder son canevas, obtenu ${fmt(tagA)}`);
  assert((await runId(t)) === run, 'a. même partie attendue après la reprise');
  await assertFlying(t, 'a. reprise après restauration');
  fails = await screensSince(t, 'fail', la.at);
  assert(fails.length === 0, `a. aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
  await t.shot('a-resumed-flying');

  // ---------- b. Perte pendant la pause, reprise sans restauration : échec après le délai de grâce
  await pauseByKey(t);
  const lb = await loseFlightOk(t, 'fly');
  await t.wait(RESTORE_WAIT_MS + 1000);
  fails = await screensSince(t, 'fail', lb.at);
  assert(fails.length === 0, `b. pendant la pause, aucun échec attendu, obtenu ${fmt(fails)}`);
  assert(await stillPaused(t), 'b. le menu Pause doit rester ouvert pendant la perte');
  const tr = await pageNow(t);
  await pressPause(t, 'Reprendre');
  const reason = await waitFail(t, { timeout: 15000 });
  assert(reason === LOST_REASON, `b. motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  fails = await screensSince(t, 'fail', lb.at);
  assert(fails.length === 1, `b. un seul écran d'échec attendu, obtenu ${fmt(fails)}`);
  const delay = fails[0].at - tr;
  t.log(`b. échec affiché ${delay} ms après Reprendre`);
  assert(
    delay >= RESTORE_WAIT_MS - 200 && delay <= 9000,
    `b. échec attendu entre 1,8 et 9 s après Reprendre (délai de grâce), obtenu ${delay} ms`,
  );
  await t.shot('b-resume-without-context-fail');

  // ---------- c. Perte pendant la pause puis Recommencer : nouvelle partie, aucun échec périmé
  await pressScreen(t, 'fail', 'Réessayer');
  run = await waitFlying(t, run);
  await tagCanvas(t, 'c');
  await pauseByKey(t);
  const lc = await loseFlightOk(t, 'fly');
  await t.wait(300);
  await pressPause(t, 'Recommencer');
  const runC = await waitFlying(t, run);
  const tagC = await assertOneLiveCanvas(t, 'c. après Recommencer');
  assert(tagC === null, `c. canevas neuf attendu (l'ancien contexte est perdu), obtenu ${fmt(tagC)}`);
  await t.wait(RESTORE_WAIT_MS + 1500);
  fails = await screensSince(t, 'fail', lc.at);
  assert(fails.length === 0, `c. aucun échec périmé attendu après Recommencer, obtenu ${fmt(fails)}`);
  assert((await runId(t)) === runC, 'c. la partie relancée doit continuer');
  await assertFlying(t, 'c. après Recommencer');
  await t.shot('c-restarted-flying');

  // ---------- d. Perte en vol, pause aussitôt (avant la fin du délai de grâce), Quitter
  const ld = await loseFlightOk(t, 'fly');
  await pauseByKey(t);
  const pausedAfter = (await pageNow(t)) - ld.at;
  assert(pausedAfter < RESTORE_WAIT_MS, `d. pause attendue avant la fin du délai de grâce, obtenue ${pausedAfter} ms après la perte`);
  await pressPause(t, 'Quitter');
  await waitForScreen(t, 'title');
  await t.wait(RESTORE_WAIT_MS + 2000);
  fails = await screensSince(t, 'fail', ld.at);
  assert(fails.length === 0, `d. aucun écran d'échec attendu après Quitter, obtenu ${fmt(fails)}`);
  const screen = await activeScreen(t);
  assert(screen === 'title', `d. l'accueil doit rester affiché, obtenu ${fmt(screen)}`);
  const cs = await threeCanvases(t);
  assert(cs.length === 0, `d. le canevas au contexte perdu doit être retiré, obtenu ${fmt(cs)}`);
  const lost = await toastsSince(t, 'Liaison graphique perdue', ld.at);
  assert(lost.length >= 1, 'd. message « Liaison graphique perdue… » attendu au moment de la perte');
  await t.shot('d-title-after-quit');
}
