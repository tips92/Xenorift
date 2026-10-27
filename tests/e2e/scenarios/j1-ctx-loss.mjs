// Jungle 2D (j1) : perte du contexte WebGL du jeu Phaser pendant la partie (WEBGL_lose_context).
//  1. perte -> partie figée (Kaï ne bouge plus) + message « Liaison graphique perdue… » ; restauration ~1 s
//     plus tard -> reprise sur place, image intacte (textures rechargées), course / saut / tir ;
//  2. perte restaurée à 3,5 s : à 7 s de la perte, toujours aucun échec (délai d'abandon annulé) ;
//  3. perte définitive -> un seul écran « MISSION ÉCHOUÉE » (Liaison graphique perdue) ~5 s après la perte ;
//  4. RÉESSAYER -> jeu Phaser neuf (nouveau canvas, nouveau contexte, l'ancien canvas retiré) qui s'affiche et répond ;
//  5. nouvelle perte définitive, contexte rendu pendant l'écran d'échec -> RÉESSAYER réutilise ce jeu, intact.
import { assert, fmt, waitFor } from '../lib/helpers.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  WEBGL,
  assertFrozen,
  assertPlays,
  assertRenders,
  ends,
  engine2d,
  gameInfo,
  home,
  loseGameOk,
  pageNow,
  phaserCanvases,
  pressScreen,
  recordUi,
  restoreGame,
  screensSince,
  toastVisible,
  toastsSince,
  waitFail,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D : perte du contexte WebGL (gel, restaurations, abandon, RÉESSAYER)',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

/** Attend la partie figée par la perte (session gfxLost, scène en pause, contexte perdu). */
function waitFrozenByLoss(t, label) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.session && s.session.gfxLost && s.sys.isPaused() && s.game.renderer.contextLost);
    },
    { timeout: 5000, label },
  );
}

/** Attend la reprise après restauration (contexte rendu, scène active). */
function waitResumedAfterRestore(t, label) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      const r = s && s.game.renderer;
      return !!(s && s.session && !s.session.gfxLost && s.sys.isActive() && r && !r.contextLost && !r.gl.isContextLost());
    },
    { timeout: 5000, label },
  );
}

/** Perte définitive : un seul abandon (onFail) puis un seul écran d'échec, ~5 s après la perte. */
async function expectGiveUp(t, loss, label) {
  const reason = await waitFail(t, { timeout: 20000 });
  assert(reason === LOST_REASON, `${label} : motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  const e = await ends(t, loss.at);
  assert(e.length === 1 && e[0].kind === 'fail' && e[0].reason === LOST_REASON, `${label} : un seul onFail(${fmt(LOST_REASON)}) attendu, obtenu ${fmt(e)}`);
  const delay = e[0].at - loss.at;
  t.log(`${label} : abandon ${delay} ms après la perte`);
  assert(
    delay >= RESTORE_WAIT_MS - 500 && delay <= RESTORE_WAIT_MS + 2500,
    `${label} : abandon attendu ~${RESTORE_WAIT_MS} ms après la perte (4,5 à 7,5 s), obtenu ${delay} ms`,
  );
  const toasts = await toastsSince(t, 'Liaison graphique perdue', loss.at);
  assert(toasts.length >= 1, `${label} : message « Liaison graphique perdue… » attendu pendant l'attente`);
  // Rien de plus ne doit arriver ensuite (un seul abandon, un seul écran).
  await t.wait(1500);
  const fails = await screensSince(t, 'fail', loss.at);
  assert(fails.length === 1, `${label} : un seul écran d'échec attendu, obtenu ${fails.length}`);
  const e2 = await ends(t, loss.at);
  assert(e2.length === 1, `${label} : une seule fin d'étape attendue, obtenu ${fmt(e2)}`);
}

export default async function (t) {
  await recordUi(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  const g1 = await waitPlay(t);
  await home(t);
  await t.wait(300);
  const ref = await assertRenders(t, 'avant la perte');
  await t.shot('before');

  // ---------- 1. Perte puis restauration ~1 s plus tard : gel, message, puis reprise sur place
  const l1 = await loseGameOk(t, 0, 'perte 1');
  await waitFrozenByLoss(t, 'perte 1 : partie figée');
  assert(await toastVisible(t, 'Liaison graphique perdue'), 'perte 1 : message « Liaison graphique perdue… » attendu à l\'écran');
  await assertFrozen(t, 'perte 1 : contexte perdu');
  await t.shot('lost-frozen');
  await restoreGame(t);
  await waitResumedAfterRestore(t, 'perte 1 : reprise après restauration');
  const e1 = await engine2d(t);
  assert(e1.game === g1.game && e1.sid === g1.sid, `perte 1 : même jeu et même session attendus (${fmt(g1)}), obtenu ${fmt(e1)}`);
  assert(e1.state === 'play', `perte 1 : partie en cours attendue, état ${fmt(e1.state)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'perte 1 : après restauration', ref);
  await assertPlays(t, 'perte 1 : après restauration');
  await t.shot('restored-playing');

  // ---------- 2. Perte restaurée à 3,5 s : le délai d'abandon est annulé
  const l2 = await loseGameOk(t, 0, 'perte 2');
  await waitFrozenByLoss(t, 'perte 2 : partie figée');
  await t.wait(3500);
  await restoreGame(t);
  await waitResumedAfterRestore(t, 'perte 2 : reprise après restauration');
  // 7 s après la perte (au-delà des 5 s) : aucun abandon.
  for (let now = await pageNow(t); now < l2.at + 7000; now = await pageNow(t)) await t.wait(250);
  assert((await ends(t)).length === 0, `perte 2 : aucune fin d'étape attendue, obtenu ${fmt(await ends(t))}`);
  assert((await screensSince(t, 'fail', 0)).length === 0, 'perte 2 : aucun écran d\'échec attendu');
  await assertPlays(t, 'perte 2 : après restauration');

  // ---------- 3. Perte définitive : un seul échec « Liaison graphique perdue »
  const l3 = await loseGameOk(t, 0, 'perte 3');
  await expectGiveUp(t, l3, 'perte 3 (définitive)');
  await t.shot('give-up-fail');

  // ---------- 4. RÉESSAYER : jeu Phaser neuf, l'ancien canvas est retiré
  await pressScreen(t, 'fail', 'Réessayer');
  const g2 = await waitPlay(t);
  assert(g2.game !== g1.game, `RÉESSAYER après perte définitive : jeu Phaser neuf attendu, obtenu le jeu n°${g2.game}`);
  assert(g2.stage === 'j1', `RÉESSAYER : étape j1 attendue, obtenu ${fmt(g2.stage)}`);
  const old = await gameInfo(t, g1.game);
  assert(!old.canvasInDom, `ancien jeu : son canvas doit être retiré de la page (${fmt(old)})`);
  const pc = await phaserCanvases(t);
  assert(pc.length === 1 && pc[0].display === 'block', `un seul canvas Phaser affiché attendu, obtenu ${fmt(pc)}`);
  const e4 = await engine2d(t);
  assert(e4.type === WEBGL && e4.contextLost === false, `jeu neuf : rendu WebGL au contexte vivant attendu, obtenu ${fmt(e4)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'jeu neuf', ref);
  await assertPlays(t, 'jeu neuf');
  await t.shot('retry-new-game');

  // ---------- 5. Perte définitive, contexte rendu pendant l'écran d'échec : RÉESSAYER réutilise le jeu
  const l5 = await loseGameOk(t, 0, 'perte 5');
  await expectGiveUp(t, l5, 'perte 5 (définitive)');
  await restoreGame(t, g2.game);
  await waitFor(t, (k) => window.__games2d[k - 1].renderer.contextLost === false, {
    timeout: 5000,
    label: 'contexte du jeu rendu pendant l\'écran d\'échec',
    arg: g2.game,
  });
  await pressScreen(t, 'fail', 'Réessayer');
  const g3 = await waitPlay(t);
  assert(g3.game === g2.game, `contexte restauré : RÉESSAYER doit réutiliser le jeu n°${g2.game}, obtenu le n°${g3.game}`);
  const pc3 = await phaserCanvases(t);
  assert(pc3.length === 1 && pc3[0].display === 'block', `un seul canvas Phaser affiché attendu, obtenu ${fmt(pc3)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'jeu réutilisé après restauration', ref);
  await assertPlays(t, 'jeu réutilisé après restauration');
  await t.shot('retry-same-game');

  const all = await ends(t);
  assert(
    all.length === 2 && all.every((e) => e.kind === 'fail'),
    `bilan : exactement deux abandons (pertes 3 et 5) attendus, obtenu ${fmt(all)}`,
  );
  t.log(`pertes : ${[l1, l2, l3, l5].map((l) => l.at).join(', ')} ms`);
}
