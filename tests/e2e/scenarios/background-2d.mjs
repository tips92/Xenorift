// Arrière-plan pendant la Jungle 2D (j1), commandes tactiles :
//  A. ▶ tenu puis page cachée (visibilitychange) : menu Pause ouvert, AudioContext suspendu, ▶ relâché,
//     Kaï figé, aucune source audio démarrée pendant 1,5 s ; au retour : son relancé, toujours en pause (rien ne
//     reprend tout seul) ; REPRENDRE : Kaï ne repart pas seul, puis ▶ le fait de nouveau avancer.
//  B. Pause Capacitor seule (page toujours visible) : même pause, son coupé, ▶ relâché ; REPRENDRE ne fait
//     rien tant que Capacitor n'a pas envoyé « resume » ; après « resume », toujours en pause jusqu'à REPRENDRE.
//  C. Arrière-plan pendant la pause : au retour, toujours en pause avec un seul menu.
import { assert, assertEq, assertNear, center, fmt, player2d, waitFor, waitFor2dPlay } from '../lib/helpers.mjs';
import { touches } from '../lib/touch.mjs';
import {
  audioState,
  cap,
  clickResume,
  inputState,
  instrument,
  pauseState,
  setHidden,
  sourceStarts,
  uiState,
  waitAudio,
  waitPaused,
  waitResumed,
} from '../lib/shell.mjs';

export const meta = {
  title: 'Arrière-plan en 2D : pause, son suspendu, commandes relâchées, pas de reprise seule',
  suites: ['full'],
  dev: true,
  timeoutMs: 120000,
};

/** Tient le stick vers la droite (doigt `id`) jusqu'à ce que le jeu lise « droite » et que Kaï avance. */
async function holdRight(t, f, id, label) {
  const [rx, ry] = await center(t, '.xr-dpad', 0.8, 0.5);
  const x0 = (await player2d(t)).x;
  await f.down(id, rx, ry);
  await waitFor(t, () => window.__xrShell.info().input.right, { timeout: 3000, label: `${label} : ▶ lu par le jeu` });
  await waitFor(t, (x) => window.__xr2d.scene.player.x > x + 20, { timeout: 4000, label: `${label} : Kaï avance`, arg: x0 });
}

/** Vérifie que Kaï ne bouge pas pendant `ms` ms. */
async function assertFrozen(t, ms, label) {
  const a = await player2d(t);
  await t.wait(ms);
  const b = await player2d(t);
  assertNear(b.x, a.x, 0.5, `${label} : Kaï doit rester figé (x)`);
  assertNear(b.feetY, a.feetY, 0.5, `${label} : Kaï doit rester figé (y)`);
  return b;
}

/** Commandes au repos (aucune direction, haut et bas compris, ni bouton). */
async function assertIdle(t, label) {
  const i = await inputState(t);
  assert(!i.left && !i.right && !i.up && !i.down && !i.jump && !i.fire && i.stickX === 0, `${label} : commandes relâchées attendues (${fmt(i)})`);
}

export default async function (t) {
  await instrument(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  // Invincible : un ennemi qui le bouscule fausserait les vérifications de position.
  await t.ev(() => window.__xr2d.god(true));
  await t.key('KeyZ', 40); // premier geste : déblocage du son
  await waitAudio(t, 'running', 'son actif après le premier geste');
  const f = touches(t);

  // ---------------------------------------------------------------- A. Page cachée, ▶ tenu
  await holdRight(t, f, 1, 'A');
  const startsAtHide = await t.ev(() => {
    window.__setHidden(true);
    return window.__starts;
  });
  await waitPaused(t, 'A : page cachée → menu Pause');
  await waitAudio(t, 'suspended', 'A : page cachée → AudioContext suspendu');
  await assertIdle(t, 'A : page cachée');
  const sA = await pauseState(t);
  assert(sA.backgrounded, `A : le shell doit se savoir en arrière-plan (${fmt(sA)})`);
  assertEq((await uiState(t)).touch, '00', 'A : commandes tactiles masquées pendant la pause');
  const xA = (await assertFrozen(t, 1500, 'A : page cachée 1,5 s')).x;
  assertEq((await sourceStarts(t)) - startsAtHide, 0, 'A : sources audio démarrées pendant que la page est cachée');

  await setHidden(t, false);
  await waitAudio(t, 'running', 'A : retour au premier plan → son relancé');
  await assertFrozen(t, 1200, 'A : retour au premier plan');
  const sA2 = await pauseState(t);
  assert(sA2.paused && sA2.open === 1 && !sA2.backgrounded, `A : au retour, toujours en pause (rien ne reprend seul) (${fmt(sA2)})`);
  assertNear((await player2d(t)).x, xA, 0.5, 'A : Kaï au même endroit au retour');
  await t.shot('A-back-from-background');

  // Le doigt est levé pendant la pause (son « touchend » serait perdu en arrière-plan), puis REPRENDRE.
  await f.up(1);
  await clickResume(t);
  await waitResumed(t, 'A : REPRENDRE');
  await assertIdle(t, 'A : après REPRENDRE');
  await t.wait(500); // l'élan éventuel retombe
  await assertFrozen(t, 700, 'A : après REPRENDRE sans toucher (aucune commande collée)');
  await holdRight(t, f, 2, 'A : ▶ après la reprise');
  await f.up(2);
  await t.shot('A-resumed');

  // ---------------------------------------------------------------- B. Pause Capacitor seule (page visible)
  await holdRight(t, f, 3, 'B');
  const startsAtCap = await t.ev(() => {
    window.__xrShell.cap('pause');
    return window.__starts;
  });
  await waitPaused(t, 'B : pause Capacitor → menu Pause');
  await waitAudio(t, 'suspended', 'B : pause Capacitor → AudioContext suspendu');
  assert(!(await t.ev(() => document.hidden)), 'B : la page doit rester visible (pause Capacitor seule)');
  await assertIdle(t, 'B : pause Capacitor');
  await assertFrozen(t, 1000, 'B : pause Capacitor');
  assertEq((await sourceStarts(t)) - startsAtCap, 0, 'B : sources audio démarrées pendant la pause Capacitor');
  await f.up(3);
  // REPRENDRE pendant l'arrière-plan Capacitor : ignoré.
  await clickResume(t);
  await t.wait(600);
  const sB = await pauseState(t);
  assert(sB.paused && sB.open === 1, `B : REPRENDRE avant « resume » Capacitor ne doit rien faire (${fmt(sB)})`);
  await assertFrozen(t, 500, 'B : après REPRENDRE ignoré');
  await t.shot('B-cap-paused-resume-ignored');
  await cap(t, 'resume');
  await waitAudio(t, 'running', 'B : « resume » Capacitor → son relancé');
  await t.wait(800);
  const sB2 = await pauseState(t);
  assert(sB2.paused && sB2.open === 1 && !sB2.backgrounded, `B : après « resume », toujours en pause jusqu'à REPRENDRE (${fmt(sB2)})`);
  await clickResume(t);
  await waitResumed(t, 'B : REPRENDRE après « resume »');
  await holdRight(t, f, 4, 'B : ▶ après la reprise');
  await f.up(4);

  // ---------------------------------------------------------------- C. Arrière-plan pendant la pause
  await t.wait(200);
  await t.key('Escape', 40);
  await waitPaused(t, 'C : Échap → pause');
  await setHidden(t, true);
  await waitAudio(t, 'suspended', 'C : page cachée pendant la pause → son suspendu');
  await t.wait(400);
  await setHidden(t, false);
  await waitAudio(t, 'running', 'C : retour → son relancé');
  await t.wait(800);
  const sC = await pauseState(t);
  assert(sC.paused && sC.open === 1 && sC.overlays === 1, `C : toujours en pause, un seul menu Pause (${fmt(sC)})`);
  assertEq(await audioState(t), 'running', 'C : son actif dans le menu Pause au premier plan');
  await t.shot('C-paused-after-cycle');
  await clickResume(t);
  await waitResumed(t, 'C : REPRENDRE');
  assertEq(await t.ev(() => window.__acs.length), 1, 'un seul AudioContext créé pendant tout le scénario');
}
