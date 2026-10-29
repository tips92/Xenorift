// Perte du contexte du jeu Phaser pendant qu'il dort (vol 3D f1 entre deux étapes 2D). Le niveau de la Jungle joué
// est celui qui précède f1 dans la campagne (lu dans __xrShell.info().stages : j2 depuis le plan 04, étape 7).
//  A. Jungle gagnée -> SUIVANT -> hangar -> DÉCOLLER -> f1 : le jeu 2D est endormi (canvas masqué, boucle arrêtée) ;
//     son contexte est perdu pour de bon -> le vol continue sans message ni échec -> f1 gagné -> SUIVANT ->
//     hangar -> DÉCOLLER -> m1 tourne sur un jeu Phaser NEUF (l'ancien canvas retiré), s'affiche et répond.
//  B. même parcours, contexte restauré pendant le vol -> m1 réutilise le MÊME jeu, image identique à celle
//     du jeu neuf de A (textures rechargées pendant le sommeil), et répond.
import { assert, fmt, info3d, screenText, waitFor, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { SEEN_STORY, nextViaHangar, seedSave, stageBefore } from '../lib/core.mjs';
import {
  WEBGL,
  assertPlays,
  assertRenders,
  ends,
  engine2d,
  gameInfo,
  home,
  loseGameOk,
  phaserCanvases,
  recordUi,
  restoreGame,
  screensSince,
  toastsSince,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D -> Vol 1 -> Lune : perte du contexte Phaser endormi (sans / avec restauration)',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

/** Jungle gagnée -> résultats -> SUIVANT -> hangar -> DÉCOLLER -> carte d'intro -> vol f1 en phase 'fly' ; vérifie le jeu 2D endormi. */
async function toFlight(t, game, label) {
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  await nextViaHangar(t);
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  const gi = await gameInfo(t, game);
  assert(
    gi && gi.canvasInDom && gi.display === 'none' && !gi.loop && gi.contextLost === false,
    `${label} : pendant le vol, jeu 2D endormi attendu (canvas masqué, boucle arrêtée, contexte vivant), obtenu ${fmt(gi)}`,
  );
}

/** f1 gagné -> « VOL RÉUSSI » -> SUIVANT -> hangar -> DÉCOLLER -> carte d'intro -> Lune (m1) jouable. */
async function toMoon(t, label) {
  await t.ev(() => window.__xr3d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `${label} : écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
  await nextViaHangar(t);
  const m = await waitPlay(t, { timeout: 40000 });
  assert(m.stage === 'm1', `${label} : étape m1 attendue, obtenu ${fmt(m.stage)}`);
  return m;
}

/** Le vol n'est pas dérangé par la perte du contexte 2D : toujours en vol, ni message 2D ni échec. */
async function assertFlightUndisturbed(t, loss, label) {
  await t.wait(1000);
  const i = await info3d(t);
  assert(i && i.phase === 'fly', `${label} : le vol doit continuer (phase ${fmt(i && i.phase)})`);
  assert((await screensSince(t, 'fail', loss.at)).length === 0, `${label} : aucun écran d'échec attendu`);
  const toasts = await toastsSince(t, 'Liaison graphique perdue', loss.at);
  assert(toasts.length === 0, `${label} : aucun message de perte pour un jeu 2D endormi, obtenu ${fmt(toasts)}`);
}

export default async function (t) {
  await recordUi(t);

  // Cinématiques déjà vues (plan 04, choix 14) : JOUER, les cartes et la fin de j3 ne les jouent pas.
  await seedSave(t, SEEN_STORY);
  await t.goto('?touch=1&unlock=1');
  await waitFor(t, () => !!window.__xrShell, { timeout: 20000, label: 'coquille chargée' });
  const jungle = await stageBefore(t, 'f1');
  assert(jungle && jungle.startsWith('j'), `niveau de la Jungle avant f1 attendu, obtenu ${fmt(jungle)}`);

  // ---------- A. Perte définitive pendant le sommeil -> jeu neuf en m1
  await t.goto(`?touch=1&unlock=1&stage=${jungle}`);
  const ja = await waitPlay(t);
  await toFlight(t, ja.game, 'A');
  const la = await loseGameOk(t, ja.game, 'A : jeu 2D endormi');
  await waitFor(t, (k) => window.__games2d[k - 1].renderer.gl.isContextLost(), { timeout: 5000, label: 'A : contexte 2D perdu', arg: ja.game });
  await assertFlightUndisturbed(t, la, 'A');
  await t.shot('A-f1-2d-lost');

  const ma = await toMoon(t, 'A');
  assert(ma.game !== ja.game, `A : contexte perdu pendant le sommeil -> jeu Phaser neuf attendu en m1, obtenu le jeu n°${ma.game}`);
  const oldA = await gameInfo(t, ja.game);
  assert(!oldA.canvasInDom, `A : le canvas de l'ancien jeu doit être retiré (${fmt(oldA)})`);
  const pcA = await phaserCanvases(t);
  assert(pcA.length === 1 && pcA[0].display === 'block', `A : un seul canvas Phaser affiché attendu, obtenu ${fmt(pcA)}`);
  const eA = await engine2d(t);
  assert(eA.type === WEBGL && eA.contextLost === false, `A : rendu WebGL au contexte vivant attendu, obtenu ${fmt(eA)}`);
  await home(t);
  await t.wait(300);
  const moonRef = await assertRenders(t, 'A : Lune sur un jeu neuf');
  await assertPlays(t, 'A : Lune sur un jeu neuf');
  await t.shot('A-m1-new-game');
  assert((await ends(t)).every((e) => e.kind === 'complete'), `A : aucun échec attendu, obtenu ${fmt(await ends(t))}`);

  // ---------- B. Perte puis restauration pendant le sommeil -> même jeu en m1
  await t.goto(`?touch=1&unlock=1&stage=${jungle}`);
  const jb = await waitPlay(t);
  await toFlight(t, jb.game, 'B');
  const lb = await loseGameOk(t, jb.game, 'B : jeu 2D endormi');
  await waitFor(t, (k) => window.__games2d[k - 1].renderer.gl.isContextLost(), { timeout: 5000, label: 'B : contexte 2D perdu', arg: jb.game });
  await t.wait(500);
  await restoreGame(t, jb.game);
  await waitFor(
    t,
    (k) => {
      const r = window.__games2d[k - 1].renderer;
      return !r.contextLost && !r.gl.isContextLost();
    },
    { timeout: 5000, label: 'B : contexte 2D restauré pendant le vol', arg: jb.game },
  );
  await assertFlightUndisturbed(t, lb, 'B');
  await t.shot('B-f1-2d-restored');

  const mb = await toMoon(t, 'B');
  assert(mb.game === jb.game, `B : contexte restauré pendant le sommeil -> m1 doit réutiliser le jeu n°${jb.game}, obtenu le n°${mb.game}`);
  const pcB = await phaserCanvases(t);
  assert(pcB.length === 1 && pcB[0].display === 'block', `B : un seul canvas Phaser affiché attendu, obtenu ${fmt(pcB)}`);
  const eB = await engine2d(t);
  assert(eB.type === WEBGL && eB.contextLost === false, `B : rendu WebGL au contexte vivant attendu, obtenu ${fmt(eB)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'B : Lune sur le jeu restauré', moonRef);
  await assertPlays(t, 'B : Lune sur le jeu restauré');
  await t.shot('B-m1-same-game');
  assert((await ends(t)).every((e) => e.kind === 'complete'), `B : aucun échec attendu, obtenu ${fmt(await ends(t))}`);
}
