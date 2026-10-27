// Plateforme 2D, Jungle (j1) lancée par ?stage=j1 : course à droite, saut (monte puis retombe),
// tir laser, pause par Échap (overlay ouvert, Kaï figé), reprise, victoire (__xr2d.win) → écran de résultats.
import {
  assert,
  assertEq,
  assertNear,
  lasers2d,
  player2d,
  readSave,
  screenText,
  waitFor,
  waitFor2dPlay,
  waitForScreen,
} from '../lib/helpers.mjs';

export const meta = {
  title: 'Jungle 2D : course, saut, tir, pause, victoire',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 90000,
};

/** Attend Kaï au sol et immobile verticalement. */
function waitGrounded(t, label) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.player && s.player.onGround && Math.abs(s.player.body.velocity.y) < 1);
    },
    { timeout: 5000, label },
  );
}

export default async function (t) {
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await waitGrounded(t, 'Kaï au sol au départ');
  await t.shot('start');

  // --- Course : x augmente
  const p0 = await player2d(t);
  await t.page.keyboard.down('ArrowRight');
  await t.wait(800);
  await t.page.keyboard.up('ArrowRight');
  const p1 = await player2d(t);
  t.log('course', Math.round(p0.x), '->', Math.round(p1.x));
  assert(p1.x > p0.x + 100, `flèche droite : x doit augmenter nettement (${Math.round(p0.x)} -> ${Math.round(p1.x)})`);

  // --- Saut sur place : les pieds montent (y diminue) puis Kaï retombe au même niveau
  await waitGrounded(t, 'Kaï au sol avant le saut');
  const y0 = (await player2d(t)).feetY;
  await t.page.keyboard.down('Space');
  let minY = y0;
  for (let i = 0; i < 8; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  await t.page.keyboard.up('Space');
  for (let i = 0; i < 6; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  await t.shot('jump');
  await waitGrounded(t, 'Kaï retombé au sol après le saut');
  const y1 = (await player2d(t)).feetY;
  t.log('saut', `pieds ${Math.round(y0)} -> apex ${Math.round(minY)} -> ${Math.round(y1)}`);
  assert(y0 - minY > 40, `Espace : Kaï doit monter d'au moins 40 px (montée ${Math.round(y0 - minY)} px)`);
  assertNear(y1, y0, 2, 'Kaï doit retomber au niveau de départ');

  // --- Tir : des lasers apparaissent
  let maxLasers = 0;
  for (let i = 0; i < 3; i++) {
    await t.key('KeyJ', 60);
    maxLasers = Math.max(maxLasers, await lasers2d(t));
    await t.wait(100);
  }
  await t.shot('fire');
  t.log('lasers actifs (max)', maxLasers);
  assert(maxLasers > 0, 'J : au moins un tir laser actif');

  // --- Pause (Échap) : overlay ouvert, partie en pause, Kaï figé même flèche tenue
  await t.key('Escape', 60);
  await waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause');
      const i = window.__xrShell.info();
      return !!(ov && ov.classList.contains('is-open') && i.run && i.run.paused);
    },
    { timeout: 5000, label: 'overlay de pause ouvert' },
  );
  const xa = (await player2d(t)).x;
  await t.page.keyboard.down('ArrowRight');
  await t.wait(500);
  await t.page.keyboard.up('ArrowRight');
  const pp = await player2d(t);
  await t.shot('pause');
  assertNear(pp.x, xa, 0.5, 'Kaï doit rester figé pendant la pause');
  assert(pp.paused, 'la session 2D doit être en pause');

  // --- Reprise (Échap) : overlay fermé, Kaï avance de nouveau
  await t.key('Escape', 60);
  await waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const i = window.__xrShell.info();
      return !ov && !!(i.run && !i.run.paused) && !i.navLock;
    },
    { timeout: 5000, label: 'reprise après la pause' },
  );
  const xr = (await player2d(t)).x;
  await t.page.keyboard.down('ArrowRight');
  await t.wait(400);
  await t.page.keyboard.up('ArrowRight');
  const xr2 = (await player2d(t)).x;
  assert(xr2 > xr + 30, `après reprise, flèche droite : x doit augmenter (${Math.round(xr)} -> ${Math.round(xr2)})`);

  // --- Victoire : décollage du vaisseau puis écran de résultats, progression sauvegardée
  await t.ev(() => window.__xr2d.win());
  await waitFor(t, () => !window.__xr2d || window.__xr2d.scene.state !== 'play', { timeout: 5000, label: 'sortie de la phase play' });
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  t.log('résultats', text.slice(0, 120));
  assert(/NIVEAU TERMIN/i.test(text), `écran de résultats attendu (texte : ${text.slice(0, 160)})`);
  await t.shot('results');
  const save = await readSave(t);
  assert(save && save.best && save.best.j1, `record de j1 sauvegardé (sauvegarde : ${JSON.stringify(save)})`);
  assertEq(save.unlocked >= 1, true, 'étape suivante débloquée après la victoire');
}
