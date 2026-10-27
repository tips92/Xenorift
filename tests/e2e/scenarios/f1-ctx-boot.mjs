// Vol 1 (f1) : contexte WebGL perdu PENDANT le démarrage de la partie (constructeur de FlightRun),
// provoqué par un script injecté (paramètre d'URL xrlose, voir armBootLoss) :
//  - dès la création du contexte ;
//  - pendant la cuisson du ciel (1er programme lié) ;
//  - au dernier programme des reflets PMREM (fin de la cuisson) ;
//  - au dernier programme de compile().
// Les repères (nombre de programmes liés à la fin du ciel et de compile()) sont mesurés sur un démarrage
// normal. Attendu à chaque fois : écran d'échec « Liaison graphique perdue » (jamais d'écran noir figé ni
// d'exception non rattrapée), un seul, aucun canevas 3D laissé ; puis RÉESSAYER relance une partie qui vole
// sur un contexte neuf.
import { assert, fmt, waitFor } from '../lib/helpers.mjs';
import {
  LOST_REASON,
  armBootLoss,
  assertFlying,
  assertOneLiveCanvas,
  bootInfo,
  pageNow,
  pressScreen,
  recordUi,
  screensSince,
  threeCanvases,
  waitFail,
  waitFlying,
} from '../lib/game3d.mjs';

export const meta = {
  title: 'Vol 1 : perte du contexte WebGL au démarrage (création, ciel, PMREM, compile)',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
  allowConsole: [
    // Contexte perdu dès sa création : le constructeur de WebGLRenderer échoue (three le journalise)…
    /^THREE\.WebGLRenderer: Cannot read properties of null \(reading 'precision'\)$/,
    // … puis startFlight() le signale avant d'afficher l'écran d'échec.
    /^\[flight3d\] démarrage impossible/,
  ],
};

export default async function (t) {
  await recordUi(t);
  await armBootLoss(t);

  // ---------- Démarrage normal : repères de la séquence de démarrage
  await t.goto('?unlock=1&stage=f1');
  await waitFlying(t, null);
  const ref = await bootInfo(t);
  t.log(`démarrage normal : ciel cuit après ${ref.skyLinks} programmes, compile() terminé après ${ref.compileLinks}`);
  for (const m of ref.timings) t.log(`  ${m.msg}`);
  assert(ref.loss === null, `démarrage normal : aucune perte attendue, obtenu ${fmt(ref.loss)}`);
  assert(
    Number.isInteger(ref.skyLinks) && ref.skyLinks >= 1 && Number.isInteger(ref.compileLinks) && ref.compileLinks > ref.skyLinks,
    `repères du démarrage illisibles (messages console.debug [flight3d] absents ?) : ${fmt(ref)}`,
  );

  const cases = [
    { at: 'create', during: 'create', label: 'création du contexte' },
    { at: 1, during: 'sky', label: 'cuisson du ciel' },
    { at: ref.skyLinks, during: 'sky', label: 'reflets PMREM' },
    { at: ref.compileLinks, during: 'compile', label: 'compile()' },
  ];
  for (const c of cases) {
    await t.goto(`?unlock=1&stage=f1&xrlose=${c.at}`);
    const loss = await waitFor(t, () => window.__boot && window.__boot.loss, {
      timeout: 30000,
      label: `perte provoquée (${c.label}, xrlose=${c.at})`,
    });
    assert(loss.during === c.during, `${c.label} : perte attendue pendant « ${c.during} », obtenu ${fmt(loss)}`);

    const reason = await waitFail(t, { timeout: 30000 });
    assert(reason === LOST_REASON, `${c.label} : motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
    const fails = await screensSince(t, 'fail', 0);
    assert(fails.length === 1, `${c.label} : un seul écran d'échec attendu, obtenu ${fmt(fails)}`);
    const delay = fails[0].at - loss.at;
    t.log(`${c.label} (xrlose=${c.at}) : échec affiché ${delay} ms après la perte`);
    // Constructeur interrompu : échec immédiat ; perte remarquée à la fin : délai de grâce (~2 s) en plus.
    assert(delay >= 0 && delay <= 15000, `${c.label} : échec attendu dans les 15 s après la perte, obtenu ${delay} ms`);
    const cs = await threeCanvases(t);
    assert(cs.length === 0, `${c.label} : le canevas au contexte perdu doit être retiré, obtenu ${fmt(cs)}`);
    await t.shot(`fail-${c.during}-${c.at}`);

    // RÉESSAYER : contexte neuf, partie normale, aucun échec en retard
    const t0 = await pageNow(t);
    await pressScreen(t, 'fail', 'Réessayer');
    await waitFlying(t, null);
    const tag = await assertOneLiveCanvas(t, `${c.label}, après RÉESSAYER`);
    assert(tag === null, `${c.label}, après RÉESSAYER : canevas neuf attendu, obtenu ${fmt(tag)}`);
    await assertFlying(t, `${c.label}, après RÉESSAYER`);
    const late = await screensSince(t, 'fail', t0);
    assert(late.length === 0, `${c.label}, après RÉESSAYER : aucun écran d'échec attendu, obtenu ${fmt(late)}`);
    if (c.at === 'create') await t.shot('retry-flying');
  }
}
