// Faille de j1 : vortex de la salle aux cristaux (colonne 135, ligne 5), arène 3D, mort puis écho du Vide,
// nouvel essai (vies au départ), victoire, retour au même endroit, marque sur la carte du niveau.
// Arme de la session (?weapon=shotgun) tenue dans l'arène. Pas une étape de campagne.
import { press, pressPause, waitPause } from '../lib/core.mjs';
import { assert, assertEq, player2d, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';

export const meta = {
  title: 'Faille de j1 : vortex, arène, écho, retour et icône',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

export default async function (t) {
  t.page.setDefaultNavigationTimeout(90000);
  await t.goto('?touch=0&stage=j1&weapon=shotgun');
  await waitFor2dPlay(t, { timeout: 90000 });
  await t.ev(() => window.__xr2d.teleport(135, 5));
  const before = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { x: s.player.x, feetY: s.player.feetY, lives: s.lives, hearts: s.hearts, crystals: s.crystals, weapon: s.player.weapon };
  });
  assertEq(before.weapon, 'shotgun', 'arme de la session en 2D');

  await t.page.keyboard.press('ArrowUp');
  await waitFor(t, () => window.__xrRift && window.__xrRift.info().phase === 'fight', {
    timeout: 20000,
    label: 'arène de la faille',
  });
  const arena = await t.ev(() => window.__xrRift.info());
  assertEq(arena.weapon, 'shotgun', 'arme équipée dans l’arène');
  assertEq(arena.lives, 3, 'vies de l’arène au départ');
  assertEq(arena.wave, 1, 'première vague');
  assert(await t.ev(() => typeof window.__xr2d === 'undefined'), 'Phaser lâché pendant l’arène');

  await t.ev(() => window.__xrRift.kill());
  await waitForScreen(t, 'rift', { timeout: 20000 });
  await press(t, 'rift', 'Harmoniser encore');
  await waitFor(
    t,
    () => !!document.querySelector('.cs[data-cutscene="rift"]'),
    { timeout: 15000, label: 'écho du Vide' },
  );
  await t.page.locator('.cs-skip').click({ timeout: 5000 });
  await waitFor(t, () => window.__xrRift && window.__xrRift.info().lives === 3 && window.__xrRift.info().phase === 'fight', {
    timeout: 20000,
    label: 'nouvel essai, vies au départ',
  });
  const retry = await t.ev(() => window.__xrRift.info());
  assertEq(retry.hearts, retry.maxHearts, 'cœurs pleins au nouvel essai');

  await t.ev(() => window.__xrRift.win());
  await waitFor2dPlay(t, { timeout: 20000 });
  const back = await player2d(t);
  assert(back && Math.abs(back.x - before.x) < 4 && Math.abs(back.feetY - before.feetY) < 4, `retour au vortex (${back && back.x}, ${back && back.feetY})`);
  const kept = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { lives: s.lives, hearts: s.hearts, crystals: s.crystals, weapon: s.player.weapon };
  });
  assertEq(kept.lives, before.lives, 'vies 2D inchangées');
  assertEq(kept.hearts, before.hearts, 'cœurs 2D inchangés');
  assertEq(kept.crystals, before.crystals, 'cristaux 2D inchangés');
  assertEq(kept.weapon, 'shotgun', 'arme 2D rendue');
  const save = await readSave(t);
  assert(save.rifts && save.rifts.includes('xena'), `faille marquée (${JSON.stringify(save.rifts)})`);

  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Quitter');
  await waitForScreen(t, 'title');
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  const icon = await t.ev(() => ({
    j1: !!document.querySelector('.card[data-stage="j1"] .card-rift'),
    j2: !!document.querySelector('.card[data-stage="j2"] .card-rift'),
  }));
  assert(icon.j1, 'icône de faille sur la carte de j1');
  assert(!icon.j2, 'pas d’icône sur j2');
}
