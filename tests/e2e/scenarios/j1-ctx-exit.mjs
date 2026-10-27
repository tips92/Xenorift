// Jungle 2D (j1) : contexte WebGL perdu pour de bon pendant le décollage du vaisseau de sortie.
// Le décollage est figé ; ~5 s plus tard le niveau est VALIDÉ (« NIVEAU TERMINÉ », record sauvegardé),
// jamais échoué. REJOUER (contexte toujours perdu) -> jeu Phaser neuf qui s'affiche et répond.
import { assert, fmt, readSave, screenText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  RESTORE_WAIT_MS,
  WEBGL,
  assertPlays,
  assertRenders,
  ends,
  engine2d,
  gameInfo,
  home,
  loseGameOk,
  phaserCanvases,
  pressScreen,
  recordUi,
  screensSince,
  toastVisible,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D : perte définitive du contexte pendant le décollage -> niveau validé',
  suites: ['full'],
  dev: true,
  timeoutMs: 120000,
};

export default async function (t) {
  await recordUi(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  const g1 = await waitPlay(t);
  await home(t);
  await t.wait(300);
  const ref = await assertRenders(t, 'avant le décollage');

  await t.ev(() => window.__xr2d.win());
  await waitFor(t, () => window.__xr2d.scene.state === 'exit', { timeout: 3000, label: 'décollage commencé (état exit)' });
  const loss = await loseGameOk(t, 0, 'perte pendant le décollage');
  assert(loss.state === 'exit', `perte attendue pendant le décollage, état ${fmt(loss.state)}`);
  await waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.session.gfxLost && s.sys.isPaused());
    },
    { timeout: 5000, label: 'décollage figé par la perte' },
  );
  assert(await toastVisible(t, 'Liaison graphique perdue'), 'message « Liaison graphique perdue… » attendu');
  await t.shot('exit-lost');
  // Le décollage normal dure 2,6 s : à 3,5 s de la perte, l'étape ne doit toujours pas être terminée (scène figée).
  await t.wait(3500);
  const mid = await engine2d(t);
  assert(mid && mid.state === 'exit' && (await ends(t)).length === 0, `décollage toujours figé attendu 3,5 s après la perte, obtenu ${fmt(mid)} / ${fmt(await ends(t))}`);

  await waitForScreen(t, 'results', { timeout: 20000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `écran « NIVEAU TERMINÉ » attendu (texte : ${text.slice(0, 160)})`);
  const e = await ends(t);
  assert(e.length === 1 && e[0].kind === 'complete', `un seul onComplete (et aucun onFail) attendu, obtenu ${fmt(e)}`);
  const delay = e[0].at - loss.at;
  t.log(`niveau validé ${delay} ms après la perte`);
  assert(
    delay >= RESTORE_WAIT_MS - 500 && delay <= RESTORE_WAIT_MS + 2500,
    `validation attendue après le délai d'attente de la restauration (4,5 à 7,5 s après la perte), obtenu ${delay} ms`,
  );
  await t.wait(1500);
  assert((await screensSince(t, 'fail', 0)).length === 0, 'aucun écran d\'échec attendu');
  const save = await readSave(t);
  assert(save && save.best && save.best.j1 && save.unlocked >= 1, `record de j1 et étape suivante débloquée attendus (sauvegarde : ${fmt(save)})`);
  await t.shot('results');

  // REJOUER : le contexte de l'ancien jeu est toujours perdu -> instance Phaser neuve
  await pressScreen(t, 'results', 'Rejouer');
  const g2 = await waitPlay(t);
  assert(g2.game !== g1.game, `REJOUER : jeu Phaser neuf attendu, obtenu le jeu n°${g2.game}`);
  const old = await gameInfo(t, g1.game);
  assert(!old.canvasInDom, `ancien jeu : canvas retiré attendu (${fmt(old)})`);
  const pc = await phaserCanvases(t);
  assert(pc.length === 1 && pc[0].display === 'block', `un seul canvas Phaser affiché attendu, obtenu ${fmt(pc)}`);
  const e2 = await engine2d(t);
  assert(e2.type === WEBGL && e2.contextLost === false, `REJOUER : rendu WebGL au contexte vivant attendu, obtenu ${fmt(e2)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'REJOUER', ref);
  await assertPlays(t, 'REJOUER');
  await t.shot('replay');
}
