// Jungle 2D (j1) : pause de l'interface et perte du contexte WebGL entremêlées.
//  A. Échap (pause) -> perte -> restauration : la partie reste en pause (menu ouvert, Kaï figé) ;
//     Échap -> reprise, Kaï répond.
//  B. perte -> Échap (pause) -> REPRENDRE alors que le contexte est toujours perdu : menu fermé mais Kaï
//     reste figé ; restauration -> la partie repart d'elle-même.
//  Aucun abandon (restaurations avant 5 s), puis victoire normale : un seul onComplete, « NIVEAU TERMINÉ ».
import { assert, fmt, screenText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  RESTORE_WAIT_MS,
  assertFrozen,
  assertPlays,
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
  waitPauseMenu,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D : pause et perte du contexte WebGL entremêlées',
  suites: ['full'],
  dev: true,
  timeoutMs: 120000,
};

/** Contexte perdu pris en compte par le moteur (session gfxLost). */
function waitGfxLost(t, label) {
  return waitFor(t, () => !!(window.__xr2d && window.__xr2d.scene.session && window.__xr2d.scene.session.gfxLost), {
    timeout: 5000,
    label,
  });
}

/** Contexte rendu et pris en compte (gfxLost retombé, contexte vivant). */
function waitGfxBack(t, label) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      const r = s && s.game.renderer;
      return !!(s && s.session && !s.session.gfxLost && r && !r.contextLost && !r.gl.isContextLost());
    },
    { timeout: 5000, label },
  );
}

export default async function (t) {
  await recordUi(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  const g = await waitPlay(t);
  await home(t);

  // ---------- A. Pause -> perte -> restauration : la pause est conservée
  await t.key('Escape', 60);
  await waitPauseMenu(t, true);
  const la = await loseGameOk(t, 0, 'A : perte pendant la pause');
  await waitGfxLost(t, 'A : perte prise en compte');
  await t.wait(300);
  await restoreGame(t);
  await waitGfxBack(t, 'A : contexte restauré');
  await t.wait(400);
  const ea = await engine2d(t);
  assert(ea.paused && ea.scenePaused && !ea.gfxLost, `A : après restauration, la partie doit rester en pause (${fmt(ea)})`);
  assert((await pauseOverlay(t)) === 'open', `A : le menu Pause doit rester ouvert (état ${await pauseOverlay(t)})`);
  await assertFrozen(t, 'A : restauré, toujours en pause');
  await t.shot('A-restored-still-paused');
  await t.key('Escape', 60);
  await waitPauseMenu(t, false);
  const ea2 = await engine2d(t);
  assert(ea2.sceneActive && !ea2.paused, `A : Échap doit relancer la scène (${fmt(ea2)})`);
  await assertPlays(t, 'A : après reprise');
  await t.shot('A-resumed');

  // ---------- B. Perte -> pause -> REPRENDRE pendant la perte : toujours figé jusqu'à la restauration
  const lb = await loseGameOk(t, 0, 'B : perte en jeu');
  await waitGfxLost(t, 'B : perte prise en compte');
  await t.key('Escape', 60);
  await waitPauseMenu(t, true);
  await pressPause(t, 'Reprendre');
  await waitPauseMenu(t, false);
  const eb = await engine2d(t);
  assert(!eb.paused && eb.gfxLost && eb.scenePaused, `B : REPRENDRE sans contexte -> partie reprise mais scène figée attendue (${fmt(eb)})`);
  await assertFrozen(t, 'B : reprise demandée, contexte toujours perdu', 600);
  await t.shot('B-resumed-still-lost');
  const elapsed = (await pageNow(t)) - lb.at;
  assert(elapsed < RESTORE_WAIT_MS - 500, `B : étapes trop lentes (${elapsed} ms depuis la perte) : la restauration doit arriver avant ${RESTORE_WAIT_MS} ms`);
  await restoreGame(t);
  await waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.session && !s.session.gfxLost && s.sys.isActive());
    },
    { timeout: 5000, label: 'B : la restauration relance la scène' },
  );
  assert((await pauseOverlay(t)) === 'none', 'B : aucun menu Pause attendu après la restauration');
  await assertPlays(t, 'B : après restauration');
  await t.shot('B-restored');

  // Au-delà des 5 s depuis chaque perte : aucun abandon.
  for (let now = await pageNow(t); now < lb.at + RESTORE_WAIT_MS + 1500; now = await pageNow(t)) await t.wait(250);
  assert((await ends(t)).length === 0, `aucune fin d'étape attendue avant la victoire, obtenu ${fmt(await ends(t))}`);
  assert((await screensSince(t, 'fail', la.at)).length === 0, 'aucun écran d\'échec attendu');

  // ---------- Victoire normale
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `écran « NIVEAU TERMINÉ » attendu (texte : ${text.slice(0, 160)})`);
  const all = await ends(t);
  assert(all.length === 1 && all[0].kind === 'complete' && all[0].sid === g.sid, `un seul onComplete attendu, obtenu ${fmt(all)}`);
  await t.shot('results');
}
