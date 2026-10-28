// Contrôles tactiles réels (multi-touch CDP, un identifiant par doigt).
// Plateforme (j1) : stick rond à 8 directions (gauche, glissement vers la droite : Kaï avance ; glissement de →
// vers ↑ sans lever le doigt : visée haute, Kaï s'arrête sans sauter ; ↗ = haut + droite, visée diagonale ;
// ↘ = droite + bas, Kaï court sans s'accroupir ; ↓ seul : accroupi ; ↓ puis ↘ : reptation lente ; retour à → :
// debout), SAUT + TIR en même temps,
// lever des doigts sans perdre les autres, perte de focus et touchcancel qui relâchent tout, doigt qui glisse
// hors de SAUT et reste attaché à SAUT jusqu'au lever, doigt posé sur une zone vide (et qui glisse) sans effet
// ni annulation des autres doigts, PAUSE du HUD touchée par un 2e doigt pendant que le 1er tient le stick,
// REPRENDRE au 2e doigt (sans commande collée ensuite).
// Vol (f1) : joystick (le vaisseau se déplace) + TURBO (vitesse), doigt vide sans effet, touchcancel et
// passage en arrière-plan qui relâchent tout.
import { assert, center, info3d, lasers2d, player2d, waitFor, waitFor2dPlay, waitFor3dPhase } from '../lib/helpers.mjs';
import { touches } from '../lib/touch.mjs';
import { instrument, setHidden, uiState } from '../lib/shell.mjs';
import { input, shipPos, trackThreeScenes, waitInput, waitInputIdle, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Tactile : stick 8 directions, SAUT + TIR, doigts multiples, pause au 2e doigt, joystick + TURBO',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 120000,
};

const r1 = (v) => Math.round(v * 10) / 10;

/** Kaï (aide DEV) : position, visée, accroupi, hauteur du corps, vitesse horizontale. */
function kai(t) {
  return t.ev(() => {
    const p = window.__xr2d.scene.player;
    return { x: p.x, feetY: p.feetY, onGround: !!p.onGround, aim: p.aim, crouching: !!p.crouching, h: p.body.height, vx: p.body.velocity.x };
  });
}

/** Glisse le doigt `id` (seul doigt posé) de `a` vers `b` en `n` pas, sans le lever. */
async function slide(t, f, id, a, b, n = 6) {
  for (let k = 1; k <= n; k++) {
    await f.move([[a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, id]]);
    await t.wait(16);
  }
}

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
  // Stick rond : directions lues par secteurs d'angle autour du centre (src/input/stick.ts).
  const L = await center(t, '.xr-dpad', 0.2);
  const R = await center(t, '.xr-dpad', 0.8);
  const U = await center(t, '.xr-dpad', 0.5, 0.12);
  const UR = await center(t, '.xr-dpad', 0.78, 0.22);
  const DR = await center(t, '.xr-dpad', 0.78, 0.78);
  const D = await center(t, '.xr-dpad', 0.5, 0.88);
  const J = await center(t, '.xr-jump');
  const F = await center(t, '.xr-fire');
  const P = await center(t, '.hud-pause');
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  const B = [Math.round(W * 0.5), Math.round(H * 0.5)];
  await assertBlank(t, ...B);
  await assertBlank(t, B[0], B[1] - 90);
  await takeCancels(t);

  // --- Secteurs du stick : un doigt neuf par point (pas d'hystérésis). Centre : zone morte ; au rayon 0,8,
  // 20° = → seul, 40° et 58° = ↗, 72° = ↑ seul (frontières à 30° et 65°, src/input/stick.ts).
  {
    const C = await center(t, '.xr-dpad', 0.5, 0.5);
    await f.start([[...C, 30]]);
    await t.wait(120);
    const i0 = await input(t);
    assert(!i0.left && !i0.right && !i0.up && !i0.down, `stick : doigt au centre, aucune direction (${JSON.stringify(i0)})`);
    await f.end();
    await waitInputIdle(t, 'stick : doigt du centre levé');
    const SECTORS = [
      [20, { right: true, up: false }],
      [40, { right: true, up: true }],
      [58, { right: true, up: true }],
      [72, { right: false, up: true }],
    ];
    for (const [deg, want] of SECTORS) {
      const a = (deg * Math.PI) / 180;
      const P = await center(t, '.xr-dpad', 0.5 + 0.4 * Math.cos(a), 0.5 - 0.4 * Math.sin(a));
      await f.start([[...P, 31]]);
      await waitInput(t, (i) => i.right === want.right && i.up === want.up && !i.left && !i.down, `stick à ${deg}° : ${want.right ? '→' : ''}${want.up ? '↑' : ''}`);
      await f.end();
      await waitInputIdle(t, `stick à ${deg}° : doigt levé`);
    }
  }

  // --- Deux doigts sur le stick : le plus récent commande ; levé, le précédent reprend la main
  await f.start([[...R, 32]]);
  await waitInput(t, (i) => i.right && !i.left, 'stick : 1er doigt sur →');
  await f.start([[...R, 32], [...L, 33]]);
  await waitInput(t, (i) => i.left && !i.right, 'stick : 2e doigt sur ← (le plus récent commande)');
  await f.end([[...R, 32]]);
  await waitInput(t, (i) => i.right && !i.left, 'stick : 2e doigt levé, le 1er (→) reprend la main');
  await f.end();
  await waitInputIdle(t, 'stick : les deux doigts levés');

  // --- Retour visuel au ↗ : flèches ↑ et → allumées (pas ← ni ↓), bille déplacée vers le haut à droite ;
  // au lever, bille revenue au centre.
  {
    const P = await center(t, '.xr-dpad', 0.78, 0.22);
    await f.start([[...P, 34]]);
    await waitInput(t, (i) => i.up && i.right, 'stick ↗ (retour visuel)');
    const vis = await t.ev(() => {
      const d = document.querySelector('.xr-dpad');
      const lit = (c) => d.querySelector(`.xr-dpad-${c}`).classList.contains('is-down');
      const m = new DOMMatrixReadOnly(getComputedStyle(d.querySelector('.xr-dpad-knob')).transform);
      return { l: lit('l'), r: lit('r'), u: lit('u'), d: lit('d'), dx: m.m41, dy: m.m42, active: d.classList.contains('is-active') };
    });
    assert(vis.u && vis.r && !vis.l && !vis.d && vis.active, `stick ↗ : flèches ↑ et → seules allumées, stick actif (${JSON.stringify(vis)})`);
    assert(vis.dx > 5 && vis.dy < -5, `stick ↗ : bille déplacée vers le haut à droite (${JSON.stringify(vis)})`);
    await f.end();
    await waitInputIdle(t, 'stick ↗ : doigt levé');
    const after = await t.ev(() => {
      const d = document.querySelector('.xr-dpad');
      return {
        transform: d.querySelector('.xr-dpad-knob').style.transform,
        lit: d.querySelectorAll('.xr-dpad-arrow.is-down').length,
        active: d.classList.contains('is-active'),
      };
    });
    assert(after.transform === '' && after.lit === 0 && !after.active, `stick levé : bille au centre, flèches éteintes (${JSON.stringify(after)})`);
  }

  // --- Stick : gauche, puis glissement vers la droite sans lever le doigt
  await f.start([[...L, 1]]);
  await waitInput(t, (i) => i.left && !i.right && !i.up && !i.down, 'stick à gauche : gauche seule');
  await f.move([[...R, 1]]);
  await waitInput(t, (i) => i.right && !i.left && !i.up && !i.down, 'glissé à droite : droite seule');
  const x0 = (await player2d(t)).x;
  await t.wait(500);
  const x1 = (await player2d(t)).x;
  t.log(`▶ tenu 500 ms : x ${r1(x0)} -> ${r1(x1)}`);
  assert(x1 > x0 + 40, `▶ tenu : Kaï doit avancer (${r1(x0)} -> ${r1(x1)})`);

  // --- Glissement de → vers ↑ sans lever le doigt : haut seul, visée haute, Kaï s'arrête et ne saute pas
  const groundY = (await kai(t)).feetY;
  await slide(t, f, 1, R, U);
  await waitInput(t, (i) => i.up && !i.left && !i.right && !i.down, 'glissé de → vers ↑ : haut seul');
  await t.wait(450);
  const ku = await kai(t);
  t.log(`↑ seul : ${JSON.stringify({ aim: ku.aim, vx: r1(ku.vx), feetY: r1(ku.feetY), onGround: ku.onGround })}`);
  assert(ku.aim === 'up', `↑ seul : visée vers le haut (obtenu ${ku.aim})`);
  assert(Math.abs(ku.vx) < 5, `↑ seul : Kaï s'arrête (vx ${r1(ku.vx)})`);
  assert(ku.onGround && Math.abs(ku.feetY - groundY) < 1, `↑ seul : Kaï reste au sol, sans sauter (pieds ${r1(ku.feetY)})`);
  await t.shot('stick-up-aim');

  // --- ↗ : haut + droite, visée diagonale, Kaï court
  await f.move([[...UR, 1]]);
  await waitInput(t, (i) => i.up && i.right && !i.left && !i.down, '↗ : haut + droite');
  const xd0 = (await kai(t)).x;
  await t.wait(350);
  const kd = await kai(t);
  assert(kd.aim === 'diag', `↗ : visée diagonale (obtenu ${kd.aim})`);
  assert(kd.x > xd0 + 40 && !kd.crouching, `↗ : Kaï avance debout (${r1(xd0)} -> ${r1(kd.x)})`);
  await t.shot('stick-up-right-diag');
  // Gros plan du stick : bille déplacée vers ↗, flèches ↑ et → allumées.
  const pad = await t.ev(() => {
    const r = document.querySelector('.xr-dpad').getBoundingClientRect();
    const m = 24;
    const x = Math.max(0, Math.floor(r.left - m));
    const y = Math.max(0, Math.floor(r.top - m));
    return { x, y, width: Math.min(window.innerWidth - x, Math.ceil(r.width + 2 * m)), height: Math.min(window.innerHeight - y, Math.ceil(r.height + 2 * m)) };
  });
  await t.shot('stick-knob-up-right-zoom', { clip: pad, zoom: 2 });

  // --- ↘ : droite + bas transmis tous les deux, mais Kaï court sans s'accroupir (↓ seul accroupit)
  await f.move([[...DR, 1]]);
  await waitInput(t, (i) => i.right && i.down && !i.left && !i.up, '↘ : droite + bas');
  const xr0 = (await kai(t)).x;
  await t.wait(350);
  const kr = await kai(t);
  t.log(`↘ 350 ms : x ${r1(xr0)} -> ${r1(kr.x)}, accroupi ${kr.crouching}`);
  assert(!kr.crouching && kr.h === 70, `↘ : Kaï ne s'accroupit pas en courant (accroupi ${kr.crouching}, corps ${kr.h})`);
  assert(kr.x > xr0 + 80, `↘ : Kaï court (${r1(xr0)} -> ${r1(kr.x)})`);

  // --- ↓ seul : accroupi (corps de 46 px), immobile
  await f.move([[...D, 1]]);
  await waitInput(t, (i) => i.down && !i.left && !i.right && !i.up, '↓ seul');
  await waitFor(t, () => window.__xr2d.scene.player.crouching && window.__xr2d.scene.player.body.height === 46, {
    timeout: 1500,
    label: '↓ seul : Kaï accroupi (corps de 46 px)',
  });
  await t.wait(300);
  await t.shot('stick-down-crouch');

  // --- ↓ puis ↘ : reste accroupi et rampe lentement
  await f.move([[...DR, 1]]);
  await waitInput(t, (i) => i.right && i.down, '↓ puis ↘');
  const xc0 = (await kai(t)).x;
  await t.wait(500);
  const kc = await kai(t);
  t.log(`reptation 500 ms : x ${r1(xc0)} -> ${r1(kc.x)} (vx ${r1(kc.vx)})`);
  assert(kc.crouching, '↓ puis ↘ : Kaï reste accroupi');
  assert(kc.x > xc0 + 15 && kc.x < xc0 + 120, `↓ puis ↘ : reptation lente (${r1(xc0)} -> ${r1(kc.x)} en 500 ms)`);

  // --- Retour à → : Kaï se relève et court
  await f.move([[...R, 1]]);
  await waitInput(t, (i) => i.right && !i.down && !i.up && !i.left, 'retour à → : droite seule');
  await waitFor(t, () => !window.__xr2d.scene.player.crouching, { timeout: 1000, label: '→ : Kaï se relève' });

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
