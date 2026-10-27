// Jungle 2D (j1) : perte du contexte WebGL pendant que l'application est en arrière-plan (document.hidden
// simulé, cas mobile : la restauration n'arrive souvent qu'au retour au premier plan).
//  1. arrière-plan (pause automatique) -> perte -> 7,5 s : aucun abandon ; retour au premier plan ->
//     restauration -> toujours en pause -> REPRENDRE -> image intacte, Kaï répond ; aucun abandon ensuite.
//  2. arrière-plan -> perte -> 7,5 s : aucun abandon ; retour au premier plan SANS restauration ->
//     un seul échec « Liaison graphique perdue », ~5 s après le retour (seul le temps au premier plan compte).
import { assert, fmt, waitFor } from '../lib/helpers.mjs';
import { instrument, setHidden, shellInfo } from '../lib/shell.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  assertPlays,
  assertRenders,
  ends,
  engine2d,
  home,
  loseGameOk,
  pageNow,
  pauseOverlay,
  pressPause,
  recordUi,
  restoreGame,
  screensSince,
  waitFail,
  waitPauseMenu,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D : perte du contexte WebGL en arrière-plan',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

/** Arrière-plan simulé : pause automatique, puis perte du contexte ; 7,5 s plus tard, aucun abandon. */
async function loseWhileHidden(t, label) {
  await setHidden(t, true);
  await waitPauseMenu(t, true);
  const sh = await shellInfo(t);
  assert(sh.backgrounded, `${label} : application en arrière-plan attendue (${fmt(sh)})`);
  const loss = await loseGameOk(t, 0, `${label} : perte en arrière-plan`);
  await waitFor(t, () => !!(window.__xr2d && window.__xr2d.scene.session.gfxLost), { timeout: 5000, label: `${label} : perte prise en compte` });
  await t.wait(7500);
  assert((await ends(t, loss.at)).length === 0, `${label} : aucun abandon en arrière-plan attendu (7,5 s), obtenu ${fmt(await ends(t, loss.at))}`);
  assert((await screensSince(t, 'fail', loss.at)).length === 0, `${label} : aucun écran d'échec en arrière-plan attendu`);
  const sh2 = await shellInfo(t);
  assert(sh2.phase === 'playing' && sh2.run && sh2.run.paused && !sh2.run.ended, `${label} : partie en pause attendue après 7,5 s en arrière-plan (${fmt(sh2)})`);
  return loss;
}

export default async function (t) {
  await instrument(t);
  await recordUi(t);

  // ---------- 1. Retour au premier plan puis restauration : on rejoue
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitPlay(t);
  await home(t);
  await t.wait(300);
  const ref = await assertRenders(t, 'avant l\'arrière-plan');
  await loseWhileHidden(t, '1');
  await t.shot('1-hidden-lost');
  const vis1 = await t.ev(() => Math.round(performance.now()));
  await setHidden(t, false);
  await t.wait(1000);
  assert(!(await shellInfo(t)).backgrounded, '1 : retour au premier plan attendu');
  await restoreGame(t);
  await waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && !s.session.gfxLost && !s.game.renderer.contextLost);
    },
    { timeout: 5000, label: '1 : contexte restauré' },
  );
  const e1 = await engine2d(t);
  assert(e1.paused && e1.scenePaused, `1 : après restauration, la partie doit attendre REPRENDRE (${fmt(e1)})`);
  assert((await pauseOverlay(t)) === 'open', '1 : menu Pause ouvert attendu');
  await t.shot('1-restored-paused');
  await pressPause(t, 'Reprendre');
  await waitPauseMenu(t, false);
  await home(t);
  await t.wait(300);
  await assertRenders(t, '1 : après REPRENDRE', ref);
  await assertPlays(t, '1 : après REPRENDRE');
  await t.shot('1-resumed');
  for (let now = await pageNow(t); now < vis1 + RESTORE_WAIT_MS + 1500; now = await pageNow(t)) await t.wait(250);
  assert((await ends(t)).length === 0, `1 : aucun abandon attendu, obtenu ${fmt(await ends(t))}`);
  assert((await screensSince(t, 'fail', 0)).length === 0, '1 : aucun écran d\'échec attendu');

  // ---------- 2. Retour au premier plan sans restauration : abandon ~5 s après le retour
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitPlay(t);
  const loss2 = await loseWhileHidden(t, '2');
  const vis2 = await t.ev(() => {
    window.__setHidden(false);
    return Math.round(performance.now());
  });
  const reason = await waitFail(t, { timeout: 20000 });
  assert(reason === LOST_REASON, `2 : motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  const e2 = await ends(t, loss2.at);
  assert(e2.length === 1 && e2[0].kind === 'fail' && e2[0].reason === LOST_REASON, `2 : un seul onFail attendu, obtenu ${fmt(e2)}`);
  const delay = e2[0].at - vis2;
  t.log(`2 : abandon ${delay} ms après le retour au premier plan (${e2[0].at - loss2.at} ms après la perte)`);
  assert(delay >= 4500 && delay <= 6500, `2 : abandon attendu 4,5 à 6,5 s après le retour au premier plan, obtenu ${delay} ms`);
  await t.wait(1500);
  assert((await screensSince(t, 'fail', loss2.at)).length === 1, '2 : un seul écran d\'échec attendu');
  assert((await ends(t, loss2.at)).length === 1, '2 : une seule fin d\'étape attendue');
  await t.shot('2-fail');
}
