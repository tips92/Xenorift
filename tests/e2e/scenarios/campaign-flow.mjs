// Campagne complète depuis l'accueil, sauvegarde neuve : JOUER → carte d'intro → Jungle (pause → RECOMMENCER :
// la partie repart du début) → victoire → SUIVANT → Vol 1 → SUIVANT → Lune : 3 vies perdues → « MISSION ÉCHOUÉE »
// (Plus de vies !) → RÉESSAYER (3 vies) → victoire → SUIVANT → Vol 2 → SUIVANT → « FIN DE LA DÉMO » avec le
// score total (somme des records) et les étoiles → MENU → accueil qui propose de continuer.
// Les victoires et les morts passent par les aides DEV (__xr2d.win / kill, __xr3d.win).
import {
  activeScreen,
  assert,
  assertEq,
  player2d,
  readSave,
  screenText,
  waitFor,
  waitFor2dPlay,
  waitFor3dPhase,
  waitForScreen,
} from '../lib/helpers.mjs';
import { hudPlatform, press, pressPause, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Campagne : accueil → j1 → f1 → m1 (échec, RÉESSAYER) → f2 → fin de la démo',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

/** Carte d'intro de l'étape affichée (fondu terminé) ; renvoie son texte. Pendant l'intro l'enchaînement reste verrouillé. */
async function waitIntro(t, title) {
  await waitFor(
    t,
    () => {
      const s = document.querySelector('.screens [data-screen="intro"].is-active:not(.is-leaving)');
      const f = document.querySelector('.fader');
      return !!s && !(f && f.classList.contains('is-on'));
    },
    { timeout: 20000, label: `carte d'intro de « ${title} »` },
  );
  const text = await screenText(t, 'intro');
  assert(text.includes(title), `carte d'intro de « ${title} » attendue (texte : ${text.slice(0, 160)})`);
  return text;
}

/** Victoire 2D (__xr2d.win) → écran « NIVEAU TERMINÉ ». */
async function win2d(t, label) {
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `${label} : écran « NIVEAU TERMINÉ » attendu (texte : ${text.slice(0, 160)})`);
}

/** Vol jusqu'à la phase 'fly' puis victoire (__xr3d.win) → écran « VOL RÉUSSI ». */
async function fly(t, label) {
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  await t.ev(() => window.__xr3d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `${label} : écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
}

export default async function (t) {
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
  const title = await screenText(t, 'title');
  assert(/Nouvelle aventure/i.test(title), `sauvegarde neuve : JOUER doit annoncer « Nouvelle aventure » (texte : ${title})`);

  // ---------------------------------------------------------------- Jungle (j1)
  await press(t, 'title', 'Jouer');
  await waitIntro(t, 'Jungle de Xéna');
  await t.shot('intro-j1');
  await waitFor2dPlay(t);
  const start = await player2d(t);
  await t.key('ArrowRight', 700);
  const moved = await player2d(t);
  assert(moved.x > start.x + 80, `j1 : Kaï doit avancer (${Math.round(start.x)} -> ${Math.round(moved.x)})`);

  // Pause → RECOMMENCER : la partie repart (même scène Phaser relancée), Kaï revient au départ
  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Recommencer');
  await waitFor(t, () => !document.querySelector('.overlay.pause'), { timeout: 5000, label: 'menu Pause fermé après RECOMMENCER' });
  await waitFor2dPlay(t);
  const again = await player2d(t);
  t.log(`RECOMMENCER : x ${Math.round(moved.x)} -> ${Math.round(again.x)} (départ ${Math.round(start.x)})`);
  assert(Math.abs(again.x - start.x) < 4, `RECOMMENCER : Kaï doit revenir au départ (x ${Math.round(again.x)}, départ ${Math.round(start.x)})`);
  assert(!(await t.ev(() => !!document.querySelector('.overlay.pause'))), 'RECOMMENCER : le menu Pause doit avoir disparu');
  await t.shot('j1-restarted');
  await win2d(t, 'j1');
  await t.shot('j1-results');
  await press(t, 'results', 'Suivant');

  // ---------------------------------------------------------------- Vol 1 (f1)
  await waitIntro(t, "Nébuleuse d'Azur");
  await fly(t, 'f1');
  await t.shot('f1-results');
  await press(t, 'results', 'Suivant');

  // ---------------------------------------------------------------- Lune (m1) : 3 vies perdues, échec, RÉESSAYER
  await waitIntro(t, 'Lune Krator');
  await waitFor2dPlay(t);
  assertEq((await hudPlatform(t)).lives, 3, 'm1 : vies au départ (HUD)');
  for (let lost = 1; lost <= 3; lost++) {
    await waitFor(t, () => window.__xr2d && window.__xr2d.scene.state === 'play', { timeout: 10000, label: `Kaï en jeu avant la mort n°${lost}` });
    await t.ev(() => window.__xr2d.kill());
    await waitFor(t, (n) => Number(document.querySelector('.hud-lives .hud-num').textContent) === 3 - n, {
      timeout: 3000,
      label: `HUD : ${3 - lost} vie(s) après la mort n°${lost}`,
      arg: lost,
    });
  }
  await waitForScreen(t, 'fail', { timeout: 20000 });
  const fail = await screenText(t, 'fail');
  t.log('échec', fail.slice(0, 120));
  assert(/MISSION ÉCHOUÉE/i.test(fail) && fail.includes('Plus de vies'), `écran « MISSION ÉCHOUÉE / Plus de vies ! » attendu (texte : ${fail.slice(0, 160)})`);
  await t.shot('m1-fail');
  await press(t, 'fail', 'Réessayer');
  await waitFor2dPlay(t);
  assertEq((await hudPlatform(t)).lives, 3, 'm1 après RÉESSAYER : vies remises à 3 (HUD)');
  await t.shot('m1-retry');
  await win2d(t, 'm1');
  await press(t, 'results', 'Suivant');

  // ---------------------------------------------------------------- Vol 2 (f2) puis fin de la démo
  await waitIntro(t, "Ceinture d'Orak");
  await fly(t, 'f2');
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'end', { timeout: 20000 });

  const save = await readSave(t);
  const ids = ['j1', 'f1', 'm1', 'f2'];
  for (const id of ids) assert(save.best[id] && save.best[id].score > 0, `record de ${id} sauvegardé (${JSON.stringify(save.best)})`);
  assert(save.unlocked >= 3, `toutes les étapes débloquées : unlocked = ${save.unlocked}`);
  const total = ids.reduce((s, id) => s + save.best[id].score, 0);
  const stars = ids.reduce((s, id) => s + save.best[id].stars, 0);
  // Le score total défile (≤ 2,2 s) jusqu'à la somme des records.
  const shown = await waitFor(
    t,
    (want) => {
      const e = document.querySelector('.screens [data-screen="end"] .end-total-n');
      const n = e ? Number(e.textContent.replace(/\D/g, '')) : -1;
      return n === want ? n : false;
    },
    { timeout: 6000, label: `score total affiché = somme des records (${total})`, arg: total },
  );
  const end = await screenText(t, 'end');
  t.log(`fin : total ${shown}, étoiles ${stars}/12 ; ${end.slice(0, 160)}`);
  assert(/FIN DE LA DÉMO/i.test(end), `écran « FIN DE LA DÉMO » attendu (texte : ${end.slice(0, 160)})`);
  assert(end.includes(`${stars}/12 étoiles`), `étoiles affichées : « ${stars}/12 étoiles » attendu (texte : ${end.slice(0, 200)})`);
  await t.shot('ending');

  // ---------------------------------------------------------------- Retour à l'accueil
  await press(t, 'end', 'Menu');
  await waitForScreen(t, 'title');
  assertEq(await activeScreen(t), 'title', 'écran après MENU');
  const title2 = await screenText(t, 'title');
  assert(/Continuer/i.test(title2), `l'accueil doit proposer de continuer après la campagne (texte : ${title2})`);
  await t.shot('title-continue');
}
