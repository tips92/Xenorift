// Vol 1 (f1) : perte du contexte WebGL pendant la partie (WEBGL_lose_context).
//  1. perte pendant le compte à rebours, sans restauration -> « Liaison graphique perdue » après le délai
//     de grâce (~2 s), canevas jeté -> RÉESSAYER -> nouvelle partie qui vole sur un contexte neuf ;
//  2. même chose en plein vol ;
//  3. perte puis restauration 0,5 s plus tard (x2) -> la partie continue sur place (« Liaison rétablie »,
//     image de nouveau éclairée, aucun échec) ; la 3e restauration de la même partie -> abandon net
//     (un seul écran d'échec) -> RÉESSAYER -> partie normale.
import { assert, fmt } from '../lib/helpers.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  assertFlying,
  assertOneLiveCanvas,
  frameLuma,
  loseFlightOk,
  pageNow,
  pressScreen,
  recordUi,
  runId,
  screensSince,
  tagCanvas,
  threeCanvases,
  toastsSince,
  waitFail,
  waitFlying,
  waitNewRun,
} from '../lib/game3d.mjs';
import { restoreContext } from '../lib/gl.mjs';

export const meta = {
  title: 'Vol 1 : perte du contexte WebGL (intro, vol, restaurations)',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

/** Perte sans restauration : écran d'échec après le délai de grâce, canevas jeté. */
async function expectLostFail(t, loss, label) {
  const reason = await waitFail(t, { timeout: 15000 });
  assert(reason === LOST_REASON, `${label} : motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  const fails = await screensSince(t, 'fail', loss.at);
  assert(fails.length === 1, `${label} : un seul écran d'échec attendu, obtenu ${fails.length}`);
  const delay = fails[0].at - loss.at;
  t.log(`${label} : échec affiché ${delay} ms après la perte`);
  // Le jeu attend la restauration ~2 s avant d'abandonner (puis fondu au noir).
  assert(delay >= RESTORE_WAIT_MS - 200 && delay <= 9000, `${label} : échec attendu entre 1,8 et 9 s après la perte, obtenu ${delay} ms`);
  const lostToast = await toastsSince(t, 'Liaison graphique perdue', loss.at);
  assert(lostToast.length >= 1, `${label} : message « Liaison graphique perdue… » attendu pendant l'attente`);
  // Renderer jeté : plus aucun canevas 3D (le prochain sera neuf).
  const cs = await threeCanvases(t);
  assert(cs.length === 0, `${label} : le canevas au contexte perdu doit être retiré, obtenu ${fmt(cs)}`);
}

export default async function (t) {
  await recordUi(t);
  await t.goto('?unlock=1&stage=f1');

  // ---------- 1. Perte pendant le compte à rebours (phase intro)
  const run1 = await waitNewRun(t, null);
  const l1 = await loseFlightOk(t, 'intro');
  await t.wait(300);
  await t.shot('intro-lost');
  await expectLostFail(t, l1, 'perte en intro');
  await t.shot('intro-lost-fail');

  await pressScreen(t, 'fail', 'Réessayer');
  const run2 = await waitFlying(t, run1);
  await assertOneLiveCanvas(t, 'après RÉESSAYER (1)');
  await assertFlying(t, 'après RÉESSAYER (1)');
  await t.shot('retry-flying');

  // ---------- 2. Perte en plein vol, sans restauration
  const l2 = await loseFlightOk(t, 'fly');
  await expectLostFail(t, l2, 'perte en vol');
  await pressScreen(t, 'fail', 'Réessayer');
  const run3 = await waitFlying(t, run2);
  await tagCanvas(t, 'run3');
  await assertFlying(t, 'après RÉESSAYER (2)');

  // ---------- 3. Perte + restauration 0,5 s plus tard, deux fois : reprise sur place
  for (let k = 1; k <= 2; k++) {
    const lumaBefore = await frameLuma(t);
    const l = await loseFlightOk(t, 'fly');
    await t.wait(500);
    assert(await restoreContext(t, 'three'), `restauration ${k} : extension absente`);
    // Au-delà du délai de grâce : aucun échec ne doit arriver.
    await t.wait(RESTORE_WAIT_MS + 800);
    const fails = await screensSince(t, 'fail', l.at);
    assert(fails.length === 0, `restauration ${k} : aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
    const back = await toastsSince(t, 'Liaison rétablie', l.at);
    assert(back.length === 1, `restauration ${k} : message « Liaison rétablie » attendu, obtenu ${fmt(back)}`);
    const tag = await assertOneLiveCanvas(t, `restauration ${k}`);
    assert(tag === 'run3', `restauration ${k} : la partie doit garder son canevas (étiquette ${fmt(tag)})`);
    const id = await runId(t);
    assert(id === run3, `restauration ${k} : même partie attendue (n°${run3}), obtenu n°${id}`);
    await assertFlying(t, `restauration ${k}`);
    // Ciel recuit et shaders recompilés : l'image n'est pas noire (référence : juste avant la perte).
    const lumaAfter = await frameLuma(t);
    t.log(`restauration ${k} : luminance ${lumaBefore} -> ${lumaAfter}`);
    assert(
      lumaBefore > 3 && lumaAfter >= lumaBefore * 0.4,
      `restauration ${k} : image éclairée attendue (luminance ${lumaBefore} avant, ${lumaAfter} après)`,
    );
    if (k === 1) await t.shot('restored-in-place');
  }

  // ---------- 3 bis. Troisième restauration de la même partie : GPU jugé instable -> abandon unique
  const l3 = await loseFlightOk(t, 'fly');
  await t.wait(500);
  assert(await restoreContext(t, 'three'), 'restauration 3 : extension absente');
  const reason = await waitFail(t, { timeout: 15000 });
  assert(reason === LOST_REASON, `3e restauration : motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  await t.wait(1500);
  const fails = await screensSince(t, 'fail', l3.at);
  assert(fails.length === 1, `3e restauration : un seul écran d'échec attendu, obtenu ${fails.length}`);
  await t.shot('third-restore-fail');

  // ---------- 4. Nouvelle partie normale après l'abandon
  const t4 = await pageNow(t);
  await pressScreen(t, 'fail', 'Réessayer');
  await waitFlying(t, run3);
  const tag = await assertOneLiveCanvas(t, 'partie après abandon');
  assert(tag === null, `partie après abandon : canevas neuf attendu, obtenu le canevas ${fmt(tag)}`);
  await assertFlying(t, 'partie après abandon');
  const stale = await screensSince(t, 'fail', t4);
  assert(stale.length === 0, `partie après abandon : aucun écran d'échec attendu, obtenu ${fmt(stale)}`);
  await t.shot('flying-after-give-up');
}
