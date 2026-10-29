// Endurance : 3 tours complets de campagne dans la même page (choix du niveau → première étape → … → dernière →
// fin → MENU, le hangar entre deux étapes ; étapes lues dans __xrShell.info().stages), victoires par les aides DEV.
// Dès le 2e tour, les Niveaux s'ouvrent sur le dernier monde : la carte de la première étape est atteinte par ◀. À chaque étape : images/s mesurées, au plus 2 canevas
// dans #game-root (Phaser + three.js, réutilisés) dont un seul affiché. À la fin de chaque tour, sur l'accueil : tas
// JS après ramasse-miettes et nombre de nœuds DOM ; ni l'un ni l'autre ne doit grimper d'un tour à l'autre (fuite).
// Ressources GPU du renderer three.js partagé (géométries, textures, programmes de renderer.info) relevées à l'entrée
// en vol de f1 et f2 : identiques au 1er et au dernier tour (un InstancedMesh, une géométrie ou une texture d'ennemi,
// de tir ou de cristal non libérés s'y verraient ; le tas JS ne les voit pas).
import { assert, assertEq, waitFor, waitFor2dPlay, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { SEEN_STORY, domNodes, gameCanvases, heapMB, measureFps, nextViaHangar, pickStage, press, seedSave } from '../lib/core.mjs';

export const meta = {
  title: 'Endurance : 3 tours de campagne (mémoire, images/s, canevas)',
  suites: ['full'],
  dev: true,
  timeoutMs: 480000,
};

const LAPS = 3;
/** Images/s minimales tolérées (iGPU lent, Chrome sans fenêtre) : en dessous, le jeu n'est plus jouable. */
const MIN_FPS = { '2d': 20, '3d': 15 };
/**
 * Croissance tolérée du tas entre la fin du 1er et du dernier tour : 30 % + 2 Mo (~6 Mo ; mesuré : +1 Mo en
 * 2 tours). Une étape qui ne libère pas sa scène (Phaser ou three.js) fait grimper le tas de plusieurs Mo par tour.
 */
const heapLimit = (first) => Math.round((first * 1.3 + 2) * 10) / 10;
const NODES_SLACK = 40;

export default async function (t) {
  // Cinématiques déjà vues (plan 04, choix 14) : JOUER, les cartes et la fin de j3 ne les jouent pas.
  await seedSave(t, SEEN_STORY);
  await t.goto('?touch=1&unlock=1');
  await waitForScreen(t, 'title');
  const STAGES = (await t.ev(() => window.__xrShell.info().stages)).map((s) => [s.id, s.kind === 'flight' ? '3d' : '2d']);
  const lastId = STAGES[STAGES.length - 1][0];
  const laps = [];
  for (let lap = 1; lap <= LAPS; lap++) {
    await press(t, 'title', 'Niveaux');
    await pickStage(t, STAGES[0][0]);
    const fps = {};
    const gpu = {};
    for (const [id, kind] of STAGES) {
      if (kind === '2d') await waitFor2dPlay(t, { timeout: 40000 });
      else {
        await waitFor3dPhase(t, 'fly', { timeout: 60000 });
        gpu[id] = await t.ev(() => {
          const i = window.__xr3d.info();
          return { geometries: i.geometries, textures: i.textures, programs: i.programs };
        });
      }
      const stage = await t.ev(() => window.__xrShell.info().run.stage);
      assert(stage === id, `tour ${lap} : étape ${id} attendue, obtenu ${stage}`);
      fps[id] = await measureFps(t, 1500);
      if (fps[id] < MIN_FPS[kind]) {
        // Navigateur à froid : les premières secondes d'une étape peuvent caler une fois (vu : j1 du 1er tour à
        // 23,9 images/s, puis 60 partout ; 60 dès le départ sur 6 essais ciblés). Une seule remesure : seule une
        // lenteur qui dure fait échouer.
        const again = await measureFps(t, 1500);
        t.log(`tour ${lap}, ${id} : ${fps[id]} images/s, remesure ${again}`);
        fps[id] = again;
      }
      const cv = await gameCanvases(t);
      assert(cv.length <= 2, `tour ${lap}, ${id} : au plus 2 canevas dans #game-root, obtenu ${JSON.stringify(cv)}`);
      assert(cv.filter((c) => c.shown).length === 1, `tour ${lap}, ${id} : un seul canevas affiché, obtenu ${JSON.stringify(cv)}`);
      assert(fps[id] >= MIN_FPS[kind], `tour ${lap}, ${id} : ${fps[id]} images/s, minimum ${MIN_FPS[kind]}`);
      if (lap === 1 || lap === LAPS) await t.shot(`lap${lap}-${id}`);
      await t.ev((k) => (k === '2d' ? window.__xr2d.win() : window.__xr3d.win()), kind);
      await waitForScreen(t, 'results', { timeout: 30000 });
      // Étape suivante par le hangar (plan 03) ; après la dernière, « Suivant » mène à la fin.
      if (id === lastId) await press(t, 'results', 'Suivant');
      else await nextViaHangar(t, { timeout: 30000 });
    }
    await waitForScreen(t, 'end', { timeout: 20000 });
    await press(t, 'end', 'Menu');
    await waitForScreen(t, 'title');
    await t.wait(600);
    const heap = await heapMB(t);
    const nodes = await domNodes(t);
    const cv = await gameCanvases(t);
    laps.push({ heap, nodes, fps, gpu });
    t.log(`tour ${lap} : tas ${heap} Mo, ${nodes} nœuds DOM, canevas ${JSON.stringify(cv)}, images/s ${JSON.stringify(fps)}, GPU à l'entrée en vol ${JSON.stringify(gpu)}`);
    assert(cv.length <= 2 && cv.every((c) => !c.shown), `tour ${lap} : canevas de jeu masqués sur l'accueil, au plus 2 (${JSON.stringify(cv)})`);
  }
  const first = laps[0];
  const last = laps[laps.length - 1];
  assert(
    last.heap <= heapLimit(first.heap),
    `le tas JS ne doit pas grimper d'un tour à l'autre : ${laps.map((l) => l.heap).join(' -> ')} Mo (maximum ${heapLimit(first.heap)} Mo)`,
  );
  assert(
    last.nodes <= first.nodes + NODES_SLACK,
    `le nombre de nœuds DOM ne doit pas grimper : ${laps.map((l) => l.nodes).join(' -> ')} (tolérance +${NODES_SLACK})`,
  );
  for (const id of ['f1', 'f2']) {
    assertEq(last.gpu[id], first.gpu[id], `${id} : géométries, textures et programmes du renderer à l'entrée en vol, 1er et dernier tour (fuite GPU)`);
  }
  await waitFor(t, () => document.querySelector('.screens [data-screen="title"].is-active'), { timeout: 2000, label: 'accueil final' });
  await t.shot('final-title');
}
