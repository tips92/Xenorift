// Contrôles tactiles réels (multi-touch CDP, un identifiant par doigt).
// Plateforme (j1) : croix (gauche, glissement vers la droite : Kaï avance), SAUT + TIR en même temps,
// lever des doigts sans perdre les autres, perte de focus et touchcancel qui relâchent tout, doigt qui glisse
// hors de SAUT et reste attaché à SAUT jusqu'au lever, doigt posé sur une zone vide (et qui glisse) sans effet
// ni annulation des autres doigts, PAUSE du HUD touchée par un 2e doigt pendant que le 1er tient la croix,
// REPRENDRE au 2e doigt (sans commande collée ensuite).
// Vol (f1) : joystick (le vaisseau se déplace) + TURBO (vitesse), doigt vide sans effet, touchcancel et
// passage en arrière-plan qui relâchent tout.
import { assert, center, info3d, lasers2d, player2d, waitFor, waitFor2dPlay, waitFor3dPhase } from '../lib/helpers.mjs';
import { touches } from '../lib/touch.mjs';
import { instrument, setHidden, uiState } from '../lib/shell.mjs';
import { input, shipPos, trackThreeScenes, waitInput, waitInputIdle, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Tactile : croix, SAUT + TIR, doigts multiples, pause au 2e doigt, joystick + TURBO',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 120000,
};

const r1 = (v) => Math.round(v * 10) / 10;

/** Élément sous le point (x, y) : refuse une commande, un bouton ou le HUD (zone censée être « vide »). */
async function assertBlank(t, x, y) {
  const hit = await t.ev(
    ([px, py]) => {
      const e = document.elementFromPoint(px, py);
      if (!e) return { ok: false, what: 'rien' };
      const what = `${e.tagName}.${typeof e.className === 'string' ? e.className : ''}`;
      return { ok: !e.closest('.xr-ctl, button, .hud-chip, .fl-center'), what };
    },
    [x, y],
  );
  assert(hit.ok, `le point (${x}, ${y}) doit être une zone vide, obtenu ${hit.what}`);
}

/** pointercancel reçus depuis le dernier appel : [{ id, target }]. */
function takeCancels(t) {
  return t.ev(() => window.__pcancel.splice(0));
}

async function platform(t, f) {
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  // Invincible : les chutes ramènent au dernier sol sûr et les ennemis ne tuent pas Kaï pendant l'essai.
  await t.ev(() => window.__xr2d.god(true));
  assert((await uiState(t)).touch === '10', `couche tactile « plateforme » seule visible (${(await uiState(t)).touch})`);
  const L = await center(t, '.xr-dpad', 0.2);
  const R = await center(t, '.xr-dpad', 0.8);
  const J = await center(t, '.xr-jump');
  const F = await center(t, '.xr-fire');
  const P = await center(t, '.hud-pause');
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  const B = [Math.round(W * 0.5), Math.round(H * 0.5)];
  await assertBlank(t, ...B);
  await assertBlank(t, B[0], B[1] - 90);
  await takeCancels(t);

  // --- Croix : gauche, puis glissement vers la droite sans lever le doigt
  await f.start([[...L, 1]]);
  await waitInput(t, (i) => i.left && !i.right, 'doigt sur ◀ : gauche');
  await f.move([[...R, 1]]);
  await waitInput(t, (i) => i.right && !i.left, 'glissé sur ▶ : droite seule');
  const x0 = (await player2d(t)).x;
  await t.wait(500);
  const x1 = (await player2d(t)).x;
  t.log(`▶ tenu 500 ms : x ${r1(x0)} -> ${r1(x1)}`);
  assert(x1 > x0 + 40, `▶ tenu : Kaï doit avancer (${r1(x0)} -> ${r1(x1)})`);

  // --- SAUT (2e doigt) puis TIR (3e doigt), ▶ toujours tenu
  const y0 = (await player2d(t)).feetY;
  await f.start([[...R, 1], [...J, 2]]);
  await waitInput(t, (i) => i.right && i.jump, '▶ + SAUT');
  await waitFor(t, (y) => window.__xr2d.scene.player.feetY < y - 20, { timeout: 1500, label: 'Kaï décolle (SAUT au 2e doigt)', arg: y0 });
  await f.start([[...R, 1], [...J, 2], [...F, 3]]);
  await waitInput(t, (i) => i.right && i.jump && i.fire, '▶ + SAUT + TIR');
  await waitFor(t, () => window.__xr2d.scene.children.list.some((c) => c.texture && c.texture.key === 'laser' && c.active), {
    timeout: 1500,
    label: 'tir laser (TIR au 3e doigt)',
  });
  await t.shot('run-jump-fire');
  assert((await lasers2d(t)) > 0, 'au moins un laser actif');

  // --- Lever SAUT et TIR : ▶ reste pris en compte
  await f.end([[...R, 1]]);
  await waitInput(t, (i) => i.right && !i.jump && !i.fire, 'SAUT et TIR levés, ▶ toujours tenu');

  // --- Perte de focus de la fenêtre : tout est relâché (le doigt reste posé)
  await t.ev(() => window.dispatchEvent(new Event('blur')));
  await waitInputIdle(t, 'après blur de la fenêtre');
  await f.end();
  await t.wait(150);
  await waitInputIdle(t, 'tous les doigts levés');

  // --- Doigt sur une zone vide qui glisse (geste de défilement), puis ▶ : ▶ marche et n'est pas annulé
  await f.start([[...B, 4]]);
  for (let k = 1; k <= 6; k++) {
    await f.move([[B[0], B[1] - k * 15, 4]]);
    await t.wait(16);
  }
  await waitInputIdle(t, 'doigt sur une zone vide : aucune commande');
  await f.start([[B[0], B[1] - 90, 4], [...R, 5]]);
  await waitInput(t, (i) => i.right && !i.left, '▶ malgré le doigt posé sur une zone vide');
  for (let k = 1; k <= 6; k++) {
    await f.move([[B[0] + k * 10, B[1] - 90 + k * 12, 4], [...R, 5]]);
    await t.wait(16);
  }
  await t.wait(150);
  await waitInput(t, (i) => i.right, '▶ toujours tenu après un nouveau glissement du doigt vide', { timeout: 300 });
  await f.start([[B[0] + 60, B[1] - 18, 4], [...R, 5], [...J, 6]]);
  await waitInput(t, (i) => i.right && i.jump, '▶ + SAUT avec un doigt sur une zone vide');
  await f.end();
  await waitInputIdle(t, 'tout levé');

  // ▶ d'abord, puis doigt vide qui glisse : ▶ reste tenu
  await f.start([[...R, 7]]);
  await waitInput(t, (i) => i.right, '▶');
  await f.start([[...R, 7], [...B, 8]]);
  for (let k = 1; k <= 6; k++) {
    await f.move([[...R, 7], [B[0], B[1] - k * 15, 8]]);
    await t.wait(16);
  }
  await t.wait(150);
  await waitInput(t, (i) => i.right && !i.jump && !i.fire, '▶ toujours tenu pendant le glissement d’un autre doigt', { timeout: 300 });
  await f.end();
  await waitInputIdle(t, 'tout levé');
  const cancels = await takeCancels(t);
  t.log('pointercancel pendant les essais de zone vide', JSON.stringify(cancels));
  assert(
    !cancels.some((c) => /xr-/.test(c.target)),
    `aucune commande tactile ne doit recevoir pointercancel à cause d'un doigt sur une zone vide (${JSON.stringify(cancels)})`,
  );

  // --- touchcancel : tout est relâché
  await f.start([[...R, 9], [...J, 10]]);
  await waitInput(t, (i) => i.right && i.jump, '▶ + SAUT');
  await f.cancel();
  await waitInputIdle(t, 'après touchcancel');

  // --- Doigt qui glisse hors de SAUT : il reste attaché à SAUT (capture du pointeur) ; levé dehors, SAUT est relâché
  await f.start([[...J, 20]]);
  await waitInput(t, (i) => i.jump, 'SAUT tenu');
  const held = await t.ev(() => document.querySelector('.xr-jump').hasPointerCapture(window.__lastPid));
  assert(held, 'SAUT doit capturer le pointeur du doigt posé');
  await f.moveTo(20, ...B);
  await t.wait(150);
  await waitInput(t, (i) => i.jump, 'doigt glissé hors de SAUT : SAUT toujours tenu', { timeout: 300 });
  await f.end();
  await waitInputIdle(t, 'doigt levé hors de SAUT : SAUT relâché');

  // --- PAUSE du HUD touchée par un 2e doigt pendant que le 1er tient ▶
  await f.start([[...R, 11]]);
  await waitInput(t, (i) => i.right, '▶ (1er doigt)');
  await t.wait(300);
  await f.tap(...P, 12);
  await waitPause(t, true);
  const xa = (await player2d(t)).x;
  await t.wait(600);
  const xb = (await player2d(t)).x;
  await t.shot('pause-second-finger');
  assert(Math.abs(xb - xa) < 0.5, `Kaï figé pendant la pause (${r1(xa)} -> ${r1(xb)})`);
  await waitInputIdle(t, 'pause : commandes relâchées');

  // --- REPRENDRE touché par un 2e doigt (le 1er toujours posé sur ▶)
  const RB = await center(t, '.overlay.pause.is-open .btn-primary');
  await f.tap(...RB, 13);
  await waitPause(t, false);
  // Le doigt resté posé n'a pas été « reposé » : il ne doit pas faire avancer Kaï (pas de commande collée).
  // (Kaï courait au moment de la pause : il glisse encore un peu à la reprise, d'où l'attente avant la mesure.)
  await f.moveTo(11, R[0] + 4, R[1]);
  await t.wait(300);
  const xc = (await player2d(t)).x;
  await t.wait(500);
  const xd = (await player2d(t)).x;
  const st = await input(t);
  t.log(`après REPRENDRE, doigt resté sur ▶ : x ${r1(xc)} -> ${r1(xd)} en 500 ms`);
  assert(!st.right && !st.left, `après REPRENDRE, le doigt resté posé ne doit pas compter (commandes ${JSON.stringify(st)})`);
  assert(Math.abs(xd - xc) < 15, `après REPRENDRE, Kaï ne doit pas avancer tout seul (${r1(xc)} -> ${r1(xd)})`);
  await f.end();

  // --- Un nouveau doigt sur ▶ fonctionne de nouveau
  await f.start([[...R, 14]]);
  await waitInput(t, (i) => i.right, 'nouveau doigt sur ▶');
  const xe = (await player2d(t)).x;
  await t.wait(400);
  const xf = (await player2d(t)).x;
  assert(xf > xe + 25, `nouveau doigt sur ▶ : Kaï avance (${r1(xe)} -> ${r1(xf)})`);
  await f.end();
  await waitInputIdle(t, 'fin de la partie plateforme');
}

async function flight(t, f) {
  await t.goto('?touch=1&unlock=1&stage=f1');
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  assert((await uiState(t)).touch === '01', `couche tactile « vol » seule visible (${(await uiState(t)).touch})`);
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  const S = [Math.round(W * 0.2), Math.round(H * 0.65)];
  const T = await center(t, '.xr-boost');
  const E = [Math.round(W * 0.68), Math.round(H * 0.4)];
  await assertBlank(t, ...E);

  // --- Joystick vers le haut à droite : commandes analogiques, le vaisseau se déplace
  await t.wait(400);
  const s0 = await shipPos(t);
  await f.start([[...S, 1]]);
  await f.move([[S[0] + 70, S[1] - 60, 1]]);
  const st = await waitInput(t, (i) => i.stickX > 0.5 && i.stickY > 0.4, 'joystick haut-droite');
  await t.wait(700);
  const s1 = await shipPos(t);
  t.log(`joystick ${JSON.stringify({ x: r1(st.stickX), y: r1(st.stickY) })} : vaisseau x ${r1(s0.x)} -> ${r1(s1.x)}, y ${r1(s0.y)} -> ${r1(s1.y)}`);
  assert(s1.x > s0.x + 2 && s1.y > s0.y + 2, `joystick haut-droite : le vaisseau doit monter à droite (${JSON.stringify(s0)} -> ${JSON.stringify(s1)})`);

  // --- TURBO au 2e doigt, joystick toujours tenu
  const v0 = (await info3d(t)).speed;
  await f.start([[S[0] + 70, S[1] - 60, 1], [...T, 2]]);
  await waitInput(t, (i) => i.boost && i.stickX > 0.5, 'joystick + TURBO');
  await t.wait(800);
  const v1 = (await info3d(t)).speed;
  await t.shot('stick-turbo');
  t.log(`TURBO : vitesse ${v0} -> ${v1}`);
  assert(v1 >= v0 * 1.2, `TURBO tenu : la vitesse doit augmenter nettement (${v0} -> ${v1})`);

  // --- 3e doigt sur une zone vide qui glisse : rien ne change
  await f.start([[S[0] + 70, S[1] - 60, 1], [...T, 2], [...E, 3]]);
  await f.move([[S[0] + 70, S[1] - 60, 1], [...T, 2], [E[0] + 40, E[1] - 20, 3]]);
  await t.wait(150);
  await waitInput(t, (i) => i.boost && i.stickX > 0.5 && i.stickY > 0.4, 'doigt vide : joystick et TURBO inchangés', { timeout: 300 });

  // --- touchcancel : tout est relâché
  await f.cancel();
  await waitInputIdle(t, 'après touchcancel en vol');

  // --- Joystick puis passage en arrière-plan : commandes relâchées, partie en pause, toujours en pause au retour
  await f.start([[...S, 4]]);
  await f.move([[S[0] - 70, S[1] + 40, 4]]);
  await waitInput(t, (i) => i.stickX < -0.5, 'joystick vers la gauche');
  await setHidden(t, true);
  await waitInputIdle(t, 'arrière-plan : commandes relâchées');
  await waitPause(t, true);
  await setHidden(t, false);
  await t.wait(400);
  await waitPause(t, true);
  await waitInputIdle(t, 'retour au premier plan : rien de collé');
  await f.end();
  await t.shot('flight-background-paused');
}

export default async function (t) {
  await instrument(t);
  await trackThreeScenes(t);
  await t.page.addInitScript(() => {
    window.addEventListener('pointerdown', (e) => {
      window.__lastPid = e.pointerId;
    }, true);
    window.__pcancel = [];
    window.addEventListener(
      'pointercancel',
      (e) => window.__pcancel.push({ id: e.pointerId, target: e.target && typeof e.target.className === 'string' ? e.target.className : String(e.target && e.target.tagName) }),
      true,
    );
  });
  const f = touches(t);
  await platform(t, f);
  await flight(t, f);
}
