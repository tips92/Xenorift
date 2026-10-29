// Arrière-plan et vol 3D (f1), commandes tactiles :
//  A. Jungle gagnée (le niveau qui précède f1, lu dans __xrShell.info().stages : j2) → résultats : le canvas 2D est
//     masqué derrière l'écran de résultats ; SUIVANT → hangar →
//     DÉCOLLER → carte d'intro du Vol 1, page cachée 3,5 s : aucune étape lancée ; au retour, le vol démarre EN PAUSE (un seul
//     menu, un seul canvas visible, compte à rebours et chrono figés) ; REPRENDRE → le vol démarre.
//  B. En vol, joystick + TURBO + TIR tenus puis page cachée : menu Pause, AudioContext suspendu, joystick, TURBO et
//     TIR relâchés, progression, chrono et tirs figés, aucune source audio démarrée ; au retour, toujours en pause et
//     figé ; REPRENDRE → la progression avance de nouveau, sans commande collée.
//  C. Pause Capacitor seule : progression figée ; après « resume », toujours en pause ; REPRENDRE → ça repart.
import { assert, assertEq, center, fmt, info3d, waitFor, waitFor2dPlay, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { canvases } from '../lib/gl.mjs';
import { nextViaHangar, stageBefore } from '../lib/core.mjs';
import { touches } from '../lib/touch.mjs';
import {
  cap,
  clickResume,
  inputState,
  instrument,
  pauseState,
  setHidden,
  sourceStarts,
  waitAudio,
  waitIntroCard,
  waitPaused,
  waitResumed,
  waitStageShown,
} from '../lib/shell.mjs';

export const meta = {
  title: 'Arrière-plan en vol 3D : départ en pause, progression figée, commandes relâchées',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

/** Vérifie que le vol ne progresse pas pendant `ms` ms (phase, progression, chrono, portails). */
async function assertFlightFrozen(t, ms, label) {
  const a = await info3d(t);
  await t.wait(ms);
  const b = await info3d(t);
  assert(a && b, `${label} : vol introuvable (__xr3d absent)`);
  const pick = (i) => ({ phase: i.phase, progress: i.progress, timeLeft: i.timeLeft, gates: i.gates, shots: i.shotsFired });
  assert(
    JSON.stringify(pick(a)) === JSON.stringify(pick(b)),
    `${label} : le vol doit rester figé pendant ${ms} ms (${fmt(pick(a))} -> ${fmt(pick(b))})`,
  );
  return b;
}

/** Attend que la progression du vol dépasse `p0`. */
function waitProgress(t, p0, label) {
  return waitFor(t, (p) => !!(window.__xr3d && window.__xr3d.info().progress > p + 0.002), {
    timeout: 8000,
    label,
    arg: p0,
  });
}

/** Canvas visibles de #game-root. */
async function visibleCanvases(t) {
  return (await canvases(t)).filter((c) => c.display !== 'none' && c.cssWidth > 0);
}

export default async function (t) {
  await instrument(t);
  await t.goto('?touch=1&unlock=1');
  await waitFor(t, () => !!window.__xrShell, { timeout: 20000, label: 'coquille chargée' });
  const jungle = await stageBefore(t, 'f1');
  await t.goto(`?touch=1&unlock=1&stage=${jungle}`);
  await waitFor2dPlay(t);
  await t.key('KeyZ', 40); // premier geste : déblocage du son
  await waitAudio(t, 'running', 'son actif après le premier geste');

  // ---------------------------------------------------------------- A. Jungle → résultats → intro f1 cachée
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const onResults = await visibleCanvases(t);
  assertEq(onResults.length, 0, `écran de résultats : aucun canvas de jeu visible derrière (${fmt(await canvases(t))})`);
  await nextViaHangar(t);
  await waitIntroCard(t);
  await setHidden(t, true);
  await waitAudio(t, 'suspended', 'A : page cachée pendant l’intro → son suspendu');
  await t.wait(3500);
  const hiddenIntro = await t.ev(() => ({ info: window.__xrShell.info(), xr3d: !!window.__xr3d }));
  assert(!hiddenIntro.info.run && !hiddenIntro.xr3d, `A : page cachée pendant l'intro : aucune étape lancée (${fmt(hiddenIntro)})`);
  assertEq(hiddenIntro.info.phase, 'intro', 'A : phase pendant l’intro cachée');
  await setHidden(t, false);
  await waitStageShown(t, 'f1', { timeout: 90000 });
  await waitPaused(t, 'A : vol lancé après un arrière-plan → en pause');
  const sA = await pauseState(t);
  assertEq([sA.overlays, sA.open], [1, 1], 'A : un seul menu Pause');
  const vis = await visibleCanvases(t);
  assert(vis.length === 1 && /^three/.test(vis[0].engine || ''), `A : un seul canvas visible, celui du vol (${fmt(await canvases(t))})`);
  // Le compte à rebours dure 3 s de jeu : 4 s plus tard, toujours en phase 'intro' et à 0 = il n'a pas tourné.
  const iA = await assertFlightFrozen(t, 4000, 'A : vol lancé en pause');
  // (progression arrondie au millième par info() : -0 possible au départ)
  assert(iA.phase === 'intro' && Math.abs(iA.progress) < 0.001, `A : le compte à rebours ne doit pas avoir tourné (${fmt(iA)})`);
  await t.shot('A-f1-started-paused');
  await clickResume(t);
  await waitResumed(t, 'A : REPRENDRE');
  await waitFor3dPhase(t, 'fly', { timeout: 30000 });
  // Pilote automatique : le vaisseau passe les portails (pas de crash pendant les vérifications).
  await t.ev(() => window.__xr3d.autopilot(true));
  const pA = (await info3d(t)).progress;
  await waitProgress(t, pA, 'A : la progression avance après REPRENDRE');

  // ---------------------------------------------------------------- B. Joystick + TURBO + TIR tenus, page cachée
  const f = touches(t);
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  const S = [Math.round(W * 0.2), Math.round(H * 0.65)];
  const T = await center(t, '.xr-boost');
  const P = await center(t, '.xr-shoot');
  await f.start([[...S, 1]]);
  await f.move([[S[0] + 70, S[1] - 60, 1]]);
  await f.start([[S[0] + 70, S[1] - 60, 1], [...T, 2], [...P, 3]]);
  await waitFor(t, () => {
    const i = window.__xrShell.info().input;
    return i.boost && i.fire && i.stickX > 0.5;
  }, { timeout: 3000, label: 'B : joystick + TURBO + TIR lus par le jeu' });
  await t.shot('B-stick-turbo-fire');
  const startsAtHide = await t.ev(() => {
    window.__setHidden(true);
    return window.__starts;
  });
  await waitPaused(t, 'B : page cachée → menu Pause');
  await waitAudio(t, 'suspended', 'B : page cachée → AudioContext suspendu');
  const iB = await inputState(t);
  assert(!iB.boost && !iB.fire && iB.stickX === 0 && iB.stickY === 0, `B : joystick, TURBO et TIR relâchés (${fmt(iB)})`);
  const fB = await assertFlightFrozen(t, 1500, 'B : page cachée');
  assertEq((await sourceStarts(t)) - startsAtHide, 0, 'B : sources audio démarrées pendant que la page est cachée');
  await setHidden(t, false);
  await waitAudio(t, 'running', 'B : retour → son relancé');
  const fB2 = await assertFlightFrozen(t, 1200, 'B : retour au premier plan');
  assertEq(fB2.progress, fB.progress, 'B : progression inchangée au retour');
  const sB = await pauseState(t);
  assert(sB.paused && sB.open === 1, `B : toujours en pause au retour (${fmt(sB)})`);
  await t.shot('B-back-paused');
  await f.up();
  await clickResume(t);
  await waitResumed(t, 'B : REPRENDRE');
  const iB2 = await inputState(t);
  assert(!iB2.boost && !iB2.fire && iB2.stickX === 0, `B : aucune commande collée après REPRENDRE (${fmt(iB2)})`);
  await waitProgress(t, fB2.progress, 'B : la progression avance après REPRENDRE');

  // ---------------------------------------------------------------- C. Pause Capacitor seule
  await cap(t, 'pause');
  await waitPaused(t, 'C : pause Capacitor → menu Pause');
  await waitAudio(t, 'suspended', 'C : pause Capacitor → son suspendu');
  const fC = await assertFlightFrozen(t, 1000, 'C : pause Capacitor');
  await cap(t, 'resume');
  await waitAudio(t, 'running', 'C : « resume » → son relancé');
  await assertFlightFrozen(t, 800, 'C : après « resume », avant REPRENDRE');
  const sC = await pauseState(t);
  assert(sC.paused && sC.open === 1 && !sC.backgrounded, `C : toujours en pause après « resume » (${fmt(sC)})`);
  await clickResume(t);
  await waitResumed(t, 'C : REPRENDRE');
  await waitProgress(t, fC.progress, 'C : la progression avance après REPRENDRE');
  const end = await info3d(t);
  assertEq(end.phase, 'fly', 'phase du vol à la fin du scénario');
  await t.shot('C-flying-again');
}
