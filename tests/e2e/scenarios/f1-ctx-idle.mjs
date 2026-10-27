// Vol 1 (f1) : renderer partagé d'une partie à l'autre quand le contexte WebGL a été perdu.
//  H0. partie restaurée sur place puis gagnée -> son renderer est jeté (three garde des écouteurs de l'ancien
//      contexte) : aucun canevas 3D sur les résultats -> REJOUER -> canevas neuf, la partie vole ;
// Contexte perdu ENTRE deux parties (écran de résultats, canevas caché) :
//  H1. perte sans restauration -> REJOUER -> canevas et contexte neufs, la partie vole, aucun échec ;
//  H2. perte puis restauration hors partie -> REJOUER -> même canevas réutilisé, la partie vole et
//      l'image est éclairée (pas noire), aucun échec.
import { assert, fmt, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  assertFlying,
  assertOneLiveCanvas,
  frameLuma,
  loseFlightOk,
  pageNow,
  pressScreen,
  recordUi,
  screensSince,
  tagCanvas,
  threeCanvases,
  toastsSince,
  waitFlying,
} from '../lib/game3d.mjs';
import { loseContext, restoreContext } from '../lib/gl.mjs';

export const meta = {
  title: 'Vol 1 : perte du contexte WebGL entre deux parties',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
};

/** Victoire immédiate puis écran de résultats ; vérifie le canevas 3D caché, contexte vivant, étiquette `tag`. */
async function toResults(t, tag, label) {
  await t.ev(() => window.__xr3d.win());
  await waitForScreen(t, 'results', { timeout: 20000 });
  const cs = await threeCanvases(t);
  assert(
    cs.length === 1 && cs[0].tag === tag && cs[0].display === 'none' && cs[0].lost === false,
    `${label} : canevas 3D « ${tag} » caché et vivant attendu sur les résultats, obtenu ${fmt(cs)}`,
  );
}

/** Contexte du canevas caché perdu (vérifié). */
async function loseIdle(t, label) {
  const r = await loseContext(t, 'three');
  assert(r === 'lost', `${label} : perte du contexte impossible : ${r}`);
  await t.wait(400);
  const cs = await threeCanvases(t);
  assert(cs.length === 1 && cs[0].lost === true, `${label} : contexte perdu attendu, obtenu ${fmt(cs)}`);
}

export default async function (t) {
  await recordUi(t);
  await t.goto('?unlock=1&stage=f1');
  let run = await waitFlying(t, null);
  const luma0 = await frameLuma(t);

  // ---------- H0. Partie restaurée sur place puis gagnée : renderer jeté à la fin
  const l0 = await loseFlightOk(t, 'fly');
  await t.wait(500);
  assert(await restoreContext(t, 'three'), 'H0. restauration impossible (extension absente)');
  await waitFor(
    t,
    (since) => (window.__uiLog || []).some((e) => e.kind === 'toast' && e.at >= since && e.text.includes('Liaison rétablie')),
    { timeout: 10000, label: 'H0. message « Liaison rétablie »', arg: l0.at },
  );
  await assertFlying(t, 'H0. après restauration');
  await t.ev(() => window.__xr3d.win());
  await waitForScreen(t, 'results', { timeout: 20000 });
  let cs = await threeCanvases(t);
  assert(cs.length === 0, `H0. renderer d'une partie restaurée jeté attendu (aucun canevas 3D), obtenu ${fmt(cs)}`);
  await pressScreen(t, 'results', 'Rejouer');
  run = await waitFlying(t, run);
  const tag0 = await assertOneLiveCanvas(t, 'H0. REJOUER');
  assert(tag0 === null, `H0. canevas neuf attendu, obtenu ${fmt(tag0)}`);
  await assertFlying(t, 'H0. REJOUER');
  let fails = await screensSince(t, 'fail', l0.at);
  assert(fails.length === 0, `H0. aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
  assert((await toastsSince(t, 'Liaison rétablie', l0.at)).length === 1, 'H0. un seul message « Liaison rétablie » attendu');
  await tagCanvas(t, 'c1');

  // ---------- H1. Perte sans restauration hors partie : contexte neuf à la partie suivante
  await toResults(t, 'c1', 'H1');
  const t1 = await pageNow(t);
  await loseIdle(t, 'H1');
  await t.shot('H1-results-context-lost');
  await pressScreen(t, 'results', 'Rejouer');
  run = await waitFlying(t, run);
  const tag1 = await assertOneLiveCanvas(t, 'H1. REJOUER');
  assert(tag1 === null, `H1. canevas neuf attendu (l'ancien avait perdu son contexte), obtenu ${fmt(tag1)}`);
  await assertFlying(t, 'H1. REJOUER');
  fails = await screensSince(t, 'fail', t1);
  assert(fails.length === 0, `H1. aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
  await tagCanvas(t, 'c2');
  await t.shot('H1-replay-flying');

  // ---------- H2. Perte puis restauration hors partie : renderer réutilisé
  await toResults(t, 'c2', 'H2');
  const t2 = await pageNow(t);
  await loseIdle(t, 'H2');
  assert(await restoreContext(t, 'three'), 'H2. restauration impossible (extension absente)');
  await t.wait(600);
  cs = await threeCanvases(t);
  assert(cs.length === 1 && cs[0].lost === false, `H2. contexte restauré attendu, obtenu ${fmt(cs)}`);
  await pressScreen(t, 'results', 'Rejouer');
  await waitFlying(t, run);
  const tag2 = await assertOneLiveCanvas(t, 'H2. REJOUER');
  assert(tag2 === 'c2', `H2. le canevas restauré doit être réutilisé, obtenu ${fmt(tag2)}`);
  await assertFlying(t, 'H2. REJOUER');
  const luma = await frameLuma(t);
  t.log(`H2. luminance ${luma} (première partie : ${luma0})`);
  assert(luma0 > 3 && luma >= luma0 * 0.4, `H2. image éclairée attendue : luminance ${luma} (première partie : ${luma0})`);
  fails = await screensSince(t, 'fail', t2);
  assert(fails.length === 0, `H2. aucun écran d'échec attendu, obtenu ${fmt(fails)}`);
  await t.shot('H2-replay-flying');
}
