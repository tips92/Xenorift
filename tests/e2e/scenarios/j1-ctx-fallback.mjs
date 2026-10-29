// Jungle 2D (j1) : contexte WebGL perdu pour de bon ET création de nouveaux contextes WebGL refusée
// (getContext('webgl…') renvoie null pour tout nouveau canvas, comme un GPU bloqué après des pertes répétées).
// Échec « Liaison graphique perdue » -> RÉESSAYER -> le jeu repart en rendu Canvas 2D (Renderer.type 1),
// s'affiche et répond ; l'arène du Blob-roi s'y affiche aussi (barrières, boss, barre, clignotement de dégât sans
// teinte). WebGL de nouveau disponible -> RECOMMENCER retente WebGL (Renderer.type 2).
import { assert, fmt, waitFor } from '../lib/helpers.mjs';
import {
  CANVAS,
  LOST_REASON,
  WEBGL,
  assertPlays,
  assertRenders,
  ends,
  engine2d,
  home,
  loseGameOk,
  phaserCanvases,
  pressPause,
  pressScreen,
  recordUi,
  waitFail,
  waitPauseMenu,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Jungle 2D : WebGL refusé après une perte définitive -> rendu Canvas de secours',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
  // Signalé une fois par le moteur quand il bascule en rendu Canvas.
  allowConsole: [/\[engine2d\] création du rendu WebGL/],
};

export default async function (t) {
  await recordUi(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  const g1 = await waitPlay(t);
  await home(t);
  await t.wait(300);
  const ref = await assertRenders(t, 'WebGL avant la perte');
  assert((await engine2d(t)).type === WEBGL, 'départ : rendu WebGL attendu');

  // WebGL refusé pour tout nouveau canvas (le canvas actuel garde le sien, pour pouvoir le perdre).
  await t.ev(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    window.__xrOrigGetContext = orig;
    window.__xrGlRefused = 0;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (/webgl/.test(type) && !this.__xrKeep) {
        window.__xrGlRefused++;
        return null;
      }
      return orig.call(this, type, attrs);
    };
    window.__xr2d.scene.game.canvas.__xrKeep = true;
  });
  const loss = await loseGameOk(t, 0, 'perte définitive');
  const reason = await waitFail(t, { timeout: 20000 });
  assert(reason === LOST_REASON, `motif ${fmt(LOST_REASON)} attendu, obtenu ${fmt(reason)}`);
  const e = await ends(t, loss.at);
  assert(e.length === 1 && e[0].kind === 'fail', `un seul onFail attendu, obtenu ${fmt(e)}`);
  await t.shot('fail');

  // RÉESSAYER : WebGL refusé -> secours Canvas 2D, jouable
  await pressScreen(t, 'fail', 'Réessayer');
  const g2 = await waitPlay(t);
  assert(g2.game !== g1.game, `RÉESSAYER : jeu Phaser neuf attendu, obtenu le jeu n°${g2.game}`);
  const refused = await t.ev(() => window.__xrGlRefused);
  assert(refused >= 1, `le jeu neuf doit avoir tenté WebGL (tentatives refusées : ${refused})`);
  const e2 = await engine2d(t);
  assert(e2.type === CANVAS, `rendu Canvas de secours attendu (Renderer.type ${CANVAS}), obtenu ${fmt(e2.type)}`);
  const pc = await phaserCanvases(t);
  assert(pc.length === 1 && pc[0].display === 'block', `un seul canvas Phaser affiché attendu, obtenu ${fmt(pc)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'rendu Canvas de secours', ref);
  await assertPlays(t, 'rendu Canvas de secours');
  await t.shot('canvas-fallback');

  // Arène du Blob-roi en rendu Canvas : barrières, boss, barre, et clignotement de dégât (copie additive du sprite :
  // setTintFill est sans effet en Canvas), figé le temps de la capture.
  await t.ev(() => window.__xr2d.boss.enter());
  await waitFor(t, () => {
    const i = window.__xr2d.boss.info();
    return !!i && i.state === 'fight' && i.arena.state === 'closed';
  }, { timeout: 5000, label: 'Canvas : combat commencé (barrières fermées)' });
  await t.wait(1200);
  const hit = await t.ev(
    () =>
      new Promise((done) => {
        window.__xr2d.boss.hit(1);
        // Une image dessinée avec la copie additive, puis la scène figée.
        requestAnimationFrame(() => {
          window.__xr2d.scene.scene.pause();
          done(window.__xr2d.boss.info());
        });
      }),
  );
  assert(hit.flashing && hit.life === hit.maxLife - 1, `Canvas : boss touché, clignotement visible (${fmt(hit)})`);
  await t.shot('canvas-boss-flash');
  await t.ev(() => window.__xr2d.scene.scene.resume());
  await waitFor(t, () => !window.__xr2d.boss.info().flashing, { timeout: 2000, label: 'Canvas : fin du clignotement' });
  await assertRenders(t, 'Canvas : arène du boss');
  assert(!!(await t.ev(() => document.querySelector('.hud-boss.is-on'))), 'Canvas : barre de boss affichée');
  await t.shot('canvas-arena');

  // WebGL de nouveau disponible : le lancement suivant (RECOMMENCER) quitte le secours et retente WebGL.
  await t.ev(() => {
    HTMLCanvasElement.prototype.getContext = window.__xrOrigGetContext;
  });
  await t.key('Escape', 60);
  await waitPauseMenu(t, true);
  await pressPause(t, 'Recommencer');
  const g3 = await waitPlay(t);
  assert(g3.game !== g2.game, `RECOMMENCER après le secours Canvas : jeu Phaser neuf attendu, obtenu le jeu n°${g3.game}`);
  const e3 = await engine2d(t);
  assert(e3.type === WEBGL && e3.contextLost === false, `RECOMMENCER : rendu WebGL attendu, obtenu ${fmt(e3)}`);
  const pc3 = await phaserCanvases(t);
  assert(pc3.length === 1, `un seul canvas Phaser attendu, obtenu ${fmt(pc3)}`);
  await home(t);
  await t.wait(300);
  await assertRenders(t, 'retour en WebGL', ref);
  await assertPlays(t, 'retour en WebGL');
  await t.shot('webgl-again');
  assert((await ends(t)).length === 1, `bilan : un seul abandon attendu, obtenu ${fmt(await ends(t))}`);
}
