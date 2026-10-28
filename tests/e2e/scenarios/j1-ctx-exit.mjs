// Jungle 2D (j1) : contexte WebGL perdu pour de bon pendant la sortie du niveau (balise de LUMA activée par le
// contact, Kaï posé haut dans la colonne du faisceau ; état exit, séquence de 2,6 s au plus). La sortie est figée ;
// ~5 s plus tard le niveau est VALIDÉ une seule fois (« NIVEAU TERMINÉ », record sauvegardé), jamais échoué.
// REJOUER (contexte toujours perdu) -> jeu Phaser neuf qui s'affiche et répond.
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
  title: 'Jungle 2D : perte définitive du contexte pendant la sortie (balise de LUMA) -> niveau validé',
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
  const ref = await assertRenders(t, 'avant la sortie');

  // Sortie par le contact (win() est vérifié par j1-play) : Kaï posé 5 tuiles au-dessus de la balise de LUMA, dans
  // la colonne du faisceau, est happé avant de retomber (on ne saute pas la balise).
  await t.ev(() => {
    const e = window.__xr2d.scene.parsed.exit;
    window.__xr2d.teleport(e.col, e.row - 5);
  });
  await waitFor(t, () => window.__xr2d.scene.state === 'exit', { timeout: 3000, label: 'sortie commencée par le contact (état exit)' });
  const caught = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { kind: s.exit.kind, launched: s.exit.launched, height: Math.round(s.exit.feetY - s.player.feetY) };
  });
  assert(
    caught.kind === 'beacon' && caught.launched && caught.height > 4 * 64,
    `balise de LUMA activée par Kaï au-dessus d'elle (plus de 4 tuiles au-dessus du sol), obtenu ${fmt(caught)}`,
  );
  const loss = await loseGameOk(t, 0, 'perte pendant la sortie');
  assert(loss.state === 'exit', `perte attendue pendant la sortie, état ${fmt(loss.state)}`);
  await waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.session.gfxLost && s.sys.isPaused());
    },
    { timeout: 5000, label: 'sortie figée par la perte' },
  );
  assert(await toastVisible(t, 'Liaison graphique perdue'), 'message « Liaison graphique perdue… » attendu');
  await t.shot('exit-lost');
  // Une sortie dure 2,6 s au plus : à 3,5 s de la perte, l'étape ne doit toujours pas être terminée (scène figée).
  await t.wait(3500);
  const mid = await engine2d(t);
  assert(mid && mid.state === 'exit' && (await ends(t)).length === 0, `sortie toujours figée attendue 3,5 s après la perte, obtenu ${fmt(mid)} / ${fmt(await ends(t))}`);

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
  // Mode test (?unlock=1) : tout est ouvert, seule la réussite de j1 se vérifie ici.
  const j1 = await t.ev(() => window.__xrShell.info().stages.find((s) => s.id === 'j1'));
  assert(save && save.best && save.best.j1 && j1 && j1.cleared, `record de j1 et étape réussie attendus (sauvegarde : ${fmt(save)}, j1 : ${fmt(j1)})`);
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
