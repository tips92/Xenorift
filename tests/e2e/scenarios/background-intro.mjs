// Arrière-plan pendant les enchaînements (carte d'intro, fondu de RECOMMENCER), Jungle 2D (j1) :
//  A. Page cachée pendant la carte d'intro (4,5 s, plus que sa durée) : aucune étape lancée ; au retour,
//     l'étape démarre EN PAUSE (un seul menu, Kaï figé) ; REPRENDRE → partie relancée.
//  B. RECOMMENCER puis page cachée dans la même tâche (pendant le fondu) : l'ancienne partie est libérée, aucune
//     nouvelle n'est lancée tant que la page est cachée ; au retour, elle démarre en pause, un seul menu.
//  C. RECOMMENCER puis 5 cycles cacher / montrer rapides pendant le fondu : un seul départ, en pause, un seul menu.
//  D. QUITTER → JOUER → pause Capacitor seule (page visible) pendant la carte d'intro : aucune étape lancée ;
//     « resume » → l'étape démarre en pause ; pause Capacitor en jeu : REPRENDRE ne fait rien avant « resume ».
//  E. Arrière-plan sur l'accueil, AVANT de lancer une étape : l'étape suivante démarre normalement (pas en pause).
//  F. JOUER puis page cachée dans la même tâche (premier fondu, avant la carte d'intro ; cinématiques déjà vues,
//     aucune à jouer), montrée de nouveau 150 ms plus tard : l'étape démarre quand même en pause, un seul menu.
import { activeScreen, assert, assertEq, assertNear, clickText, fmt, player2d, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { SEEN_STORY, seedSave } from '../lib/core.mjs';
import {
  cap,
  clickPauseButton,
  clickResume,
  clickThen,
  instrument,
  pauseState,
  setHidden,
  waitAudio,
  waitIntroCard,
  waitPaused,
  waitResumed,
  waitStageShown,
} from '../lib/shell.mjs';

export const meta = {
  title: 'Arrière-plan pendant l’intro et les fondus : départ en pause, un seul menu',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
};

/** Aucune étape en cours ni scène 2D (rien ne doit démarrer pendant l'arrière-plan). */
async function assertNoRun(t, label) {
  const s = await t.ev(() => ({ run: window.__xrShell.info().run, xr2d: !!window.__xr2d }));
  assert(s.run === null && !s.xr2d, `${label} : aucune étape ne doit être lancée (${fmt(s)})`);
}

/** Étape j1 dévoilée, en pause, un seul menu Pause, Kaï figé pendant `ms` ms. */
async function assertStartedPaused(t, label, ms = 800) {
  await waitStageShown(t, 'j1', { timeout: 30000 });
  await waitPaused(t, `${label} : étape lancée en pause`);
  await t.wait(300); // un éventuel second menu aurait le temps d'apparaître
  const s = await pauseState(t);
  assert(s.paused && s.open === 1 && s.overlays === 1, `${label} : un seul menu Pause, partie en pause (${fmt(s)})`);
  const a = await player2d(t);
  await t.wait(ms);
  const b = await player2d(t);
  assertNear(b.x, a.x, 0.5, `${label} : Kaï figé pendant la pause (x)`);
  assertNear(b.feetY, a.feetY, 0.5, `${label} : Kaï figé pendant la pause (y)`);
}

async function resumeAndCheck(t, label) {
  await clickResume(t);
  await waitResumed(t, `${label} : REPRENDRE`);
  await waitFor2dPlay(t);
}

export default async function (t) {
  await instrument(t);
  // Cinématiques déjà vues (plan 04, choix 14) : JOUER, les cartes et la fin de j3 ne les jouent pas.
  await seedSave(t, SEEN_STORY);
  await t.goto('?touch=1&unlock=1');
  await waitForScreen(t, 'title');
  await t.key('KeyZ', 40); // premier geste : déblocage du son
  await waitAudio(t, 'running', 'son actif après le premier geste');

  // ---------------------------------------------------------------- A. Page cachée pendant la carte d'intro
  await clickText(t, 'Jouer');
  await waitIntroCard(t);
  await setHidden(t, true);
  await waitAudio(t, 'suspended', 'A : page cachée → son suspendu');
  await t.wait(4500);
  await assertNoRun(t, 'A : page cachée 4,5 s pendant l’intro');
  assertEq(await activeScreen(t), 'intro', 'A : la carte d’intro reste affichée pendant l’arrière-plan');
  await setHidden(t, false);
  await assertStartedPaused(t, 'A');
  await t.shot('A-started-paused');
  await resumeAndCheck(t, 'A');

  // ---------------------------------------------------------------- B. Page cachée pendant le fondu de RECOMMENCER
  await t.key('Escape', 40);
  await waitPaused(t, 'B : Échap → pause');
  await clickThen(t, '.overlay.pause.is-open', 'Recommencer', 'hide');
  await t.wait(3000);
  await assertNoRun(t, 'B : page cachée 3 s pendant le fondu de RECOMMENCER');
  await setHidden(t, false);
  await assertStartedPaused(t, 'B');
  await t.shot('B-restart-started-paused');
  await resumeAndCheck(t, 'B');

  // ---------------------------------------------------------------- C. Cycles rapides pendant le fondu de RECOMMENCER
  await t.wait(200);
  await t.key('Escape', 40);
  await waitPaused(t, 'C : Échap → pause');
  await clickPauseButton(t, 'Recommencer');
  for (let i = 0; i < 5; i++) {
    await setHidden(t, true);
    await t.wait(70);
    await setHidden(t, false);
    await t.wait(90);
  }
  await assertStartedPaused(t, 'C');
  await t.wait(1000);
  const sC = await pauseState(t);
  assert(sC.overlays === 1 && sC.paused, `C : toujours un seul menu Pause 1 s plus tard (${fmt(sC)})`);
  await t.shot('C-rapid-cycles-one-overlay');
  await resumeAndCheck(t, 'C');

  // ---------------------------------------------------------------- D. Pause Capacitor seule pendant la carte d'intro
  await t.wait(200);
  await t.key('Escape', 40);
  await waitPaused(t, 'D : Échap → pause');
  await clickPauseButton(t, 'Quitter');
  await waitForScreen(t, 'title');
  await clickText(t, 'Jouer');
  await waitIntroCard(t);
  await cap(t, 'pause');
  await waitAudio(t, 'suspended', 'D : pause Capacitor → son suspendu');
  await t.wait(4000);
  assert(!(await t.ev(() => document.hidden)), 'D : la page doit rester visible (pause Capacitor seule)');
  await assertNoRun(t, 'D : pause Capacitor 4 s pendant l’intro');
  await cap(t, 'resume');
  await waitAudio(t, 'running', 'D : « resume » → son relancé');
  await assertStartedPaused(t, 'D');
  // En jeu : nouvelle pause Capacitor ; REPRENDRE ne fait rien tant que « resume » n'est pas arrivé.
  await cap(t, 'pause');
  await waitAudio(t, 'suspended', 'D : 2e pause Capacitor → son suspendu');
  await clickResume(t);
  await t.wait(600);
  const sD = await pauseState(t);
  assert(sD.paused && sD.open === 1 && sD.backgrounded, `D : REPRENDRE pendant la pause Capacitor ne doit rien faire (${fmt(sD)})`);
  await t.shot('D-cap-paused-resume-ignored');
  await cap(t, 'resume');
  await waitAudio(t, 'running', 'D : 2e « resume » → son relancé');
  await t.wait(600);
  const sD2 = await pauseState(t);
  assert(sD2.paused && sD2.open === 1 && !sD2.backgrounded, `D : après « resume », toujours en pause jusqu'à REPRENDRE (${fmt(sD2)})`);
  await resumeAndCheck(t, 'D');

  // ---------------------------------------------------------------- E. Arrière-plan avant le lancement
  await t.wait(200);
  await t.key('Escape', 40);
  await waitPaused(t, 'E : Échap → pause');
  await clickPauseButton(t, 'Quitter');
  await waitForScreen(t, 'title');
  await setHidden(t, true);
  await t.wait(500);
  await setHidden(t, false);
  await waitAudio(t, 'running', 'E : retour sur l’accueil → son relancé');
  await clickText(t, 'Jouer');
  await waitIntroCard(t);
  await waitStageShown(t, 'j1', { timeout: 30000 });
  await t.wait(500);
  const sE = await pauseState(t);
  assert(!sE.paused && sE.open === 0, `E : un arrière-plan AVANT le lancement ne doit pas mettre l'étape en pause (${fmt(sE)})`);
  await waitFor2dPlay(t);
  await t.shot('E-started-normally');

  // ---------------------------------------------------------------- F. Page cachée pendant le premier fondu de JOUER
  await t.wait(200);
  await t.key('Escape', 40);
  await waitPaused(t, 'F : Échap → pause');
  await clickPauseButton(t, 'Quitter');
  await waitForScreen(t, 'title');
  await clickThen(t, '.screens [data-screen="title"].is-active', 'Jouer', 'hide');
  await t.wait(150);
  await setHidden(t, false);
  await waitIntroCard(t);
  await assertStartedPaused(t, 'F');
  await t.shot('F-play-fade-started-paused');
  await resumeAndCheck(t, 'F');
  assertEq(await t.ev(() => window.__acs.length), 1, 'un seul AudioContext créé pendant tout le scénario');
  await waitFor(t, () => window.__acs[0].state === 'running', { timeout: 3000, label: 'son actif en fin de scénario' });
}
