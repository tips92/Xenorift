// Vol 1 (f1) : perte du contexte WebGL quand l'issue de la partie est déjà décidée.
//  W. distorsion atteinte (__xr3d.win) puis perte aussitôt -> écran de RÉSULTATS (la victoire est gardée,
//     progression sauvegardée), aucun écran d'échec ;
//  X. vaisseau détruit (__xr3d.fail) puis perte aussitôt -> échec « Vaisseau détruit ! » (pas « Liaison
//     graphique perdue »), un seul écran ; RÉESSAYER relance une partie qui vole.
import { assert, fmt, readSave, screenText, waitForScreen } from '../lib/helpers.mjs';
import {
  assertFlying,
  assertOneLiveCanvas,
  flightInfo,
  loseFlightOk,
  pageNow,
  pressScreen,
  recordUi,
  screensSince,
  threeCanvases,
  waitFail,
  waitFlying,
} from '../lib/game3d.mjs';

export const meta = {
  title: 'Vol 1 : perte du contexte WebGL après la victoire ou l\'explosion',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
};

export default async function (t) {
  await recordUi(t);
  await t.goto('?unlock=1&stage=f1');
  let run = await waitFlying(t, null);
  const gatesTotal = (await flightInfo(t)).gatesTotal;

  // ---------- W. Victoire (distorsion) puis perte : résultats
  await t.ev(() => window.__xr3d.win());
  const lw = await loseFlightOk(t, 'warp');
  await waitForScreen(t, 'results', { timeout: 20000 });
  const shown = (await screensSince(t, 'results', lw.at))[0];
  t.log(`W. résultats affichés ${shown ? shown.at - lw.at : '?'} ms après la perte`);
  let fails = await screensSince(t, 'fail', lw.at);
  assert(fails.length === 0, `W. aucun écran d'échec attendu après une victoire, obtenu ${fmt(fails)}`);
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `W. écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
  const save = await readSave(t);
  const best = save && save.best && save.best.f1;
  assert(best, `W. résultat de f1 sauvegardé attendu (sauvegarde : ${fmt(save)})`);
  // win() franchit tous les portails restants : 3 étoiles.
  assert(best.stars === 3 && best.score > 0, `W. 3 étoiles et un score attendus (${gatesTotal} portails), obtenu ${fmt(best)}`);
  const cs = await threeCanvases(t);
  assert(cs.length === 0, `W. le canevas au contexte perdu doit être retiré, obtenu ${fmt(cs)}`);
  await t.shot('W-results-after-loss');

  // ---------- X. Explosion puis perte : « Vaisseau détruit ! »
  await pressScreen(t, 'results', 'Rejouer');
  run = await waitFlying(t, run);
  const tag = await assertOneLiveCanvas(t, 'X. partie relancée');
  assert(tag === null, `X. canevas neuf attendu, obtenu ${fmt(tag)}`);
  await t.ev(() => window.__xr3d.fail());
  const lx = await loseFlightOk(t, 'dead');
  const reason = await waitFail(t, { timeout: 15000 });
  assert(reason === 'Vaisseau détruit !', `X. motif « Vaisseau détruit ! » attendu, obtenu ${fmt(reason)}`);
  await t.wait(1000);
  fails = await screensSince(t, 'fail', lx.at);
  assert(fails.length === 1, `X. un seul écran d'échec attendu, obtenu ${fmt(fails)}`);
  await t.shot('X-destroyed-after-loss');

  const t0 = await pageNow(t);
  await pressScreen(t, 'fail', 'Réessayer');
  await waitFlying(t, run);
  await assertOneLiveCanvas(t, 'X. après RÉESSAYER');
  await assertFlying(t, 'X. après RÉESSAYER');
  fails = await screensSince(t, 'fail', t0);
  assert(fails.length === 0, `X. après RÉESSAYER : aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
}
