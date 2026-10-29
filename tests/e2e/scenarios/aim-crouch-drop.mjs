// Contrôles 2D du plan 01 (aides DEV) :
//  Jungle (j1), au clavier : ↑ et W ne font pas sauter, W vise vers le haut ; visée haute (Kaï s'arrête, tir
//  vers le haut), diagonale à droite et à gauche (tirs à 45°) ; pompe : l'éventail (± 14°) suit la visée ;
//  ↓ seul = accroupi (corps de 46 px, pieds en place), tir accroupi à l'horizontale et plus bas, relevé au
//  relâcher ; ↓ puis → = reptation lente ; → puis ↓ (diagonale basse en courant) = course sans accroupi ;
//  ↓ + Saut sur un sol plein = saut normal ; plafond bas (tuiles posées par le test) : impossible de se relever
//  ni de sauter, reptation pour en sortir, relevé seulement une fois tout le corps sorti ; ↓ seul et Saut seul
//  sur une plateforme '=' ne font pas tomber, ↘ + Saut y fait un vrai saut, ↓ + Saut la traverse ; portes
//  (128, 5) ↔ (144, 9) : flèche ▲, ↑ avec Tir maintenu n'entre pas, aller (glyphes de la ruine allumés à
//  l'arrivée), ↑ pressé pendant que ← est tenu (contre le mur de la salle) n'entre pas, retour.
//  Jungle (j1), au stick tactile : stick posé sur ↑ devant la porte : passage ; doigt gardé sur ↑ après
//  l'arrivée : pas de retour ; TIR posé puis stick ↑ : pas de passage, ni au lever de TIR ; doigt glissé de ←
//  (contre le mur) vers ↑ : retour.
//  Lune (m1) : sur la plateforme mobile verticale (col. 47-49), ↓ seul et Saut seul ne font pas tomber,
//  ↙ + Saut y fait un vrai saut, ↓ + Saut la traverse.
import { assert, assertEq, assertNear, center, fmt, waitFor, waitFor2dPlay } from '../lib/helpers.mjs';
import { kai2d, kaiShot } from '../lib/game2d.mjs';
import { waitInputIdle } from '../lib/core.mjs';
import { touches } from '../lib/touch.mjs';

export const meta = {
  title: 'Visée haute et diagonale, éventail de la pompe, accroupi, reptation, plafond bas, descente d’étage, portes (clavier et stick)',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

const TILE = 64;
const CROUCH_H = 46;
const STAND_H = 70;
/** Demi-largeur du corps de Kaï (PLAYER_BODY.width / 2). */
const HALF_W = 17;
const r1 = (v) => Math.round(v * 10) / 10;

// Portes de la Jungle : (144, 9) sur le rocher ↔ (128, 5) dans la salle secrète (mur 'B' en colonne 127).
const DOOR_ROCK = { col: 144, row: 9, x: 144 * TILE + TILE / 2, feetY: 10 * TILE };
const DOOR_ROOM = { col: 128, row: 5, x: 128 * TILE + TILE / 2, feetY: 6 * TILE };

const kb = (t) => t.page.keyboard;

/** Téléporte Kaï sur la case (col, row) et attend qu'il soit posé et immobile. */
async function placeAt(t, col, row, label) {
  await t.ev(([c, r]) => window.__xr2d.teleport(c, r), [col, row]);
  await waitFor(
    t,
    () => {
      const p = window.__xr2d.scene.player;
      return p.onGround && Math.abs(p.body.velocity.x) < 1 && Math.abs(p.body.velocity.y) < 1;
    },
    { timeout: 3000, label: `${label} : Kaï posé en (${col}, ${row})` },
  );
  return kai2d(t);
}

/** Attend qu'aucun tir ne soit en vol. */
function waitNoBolt(t, label) {
  return waitFor(t, () => !window.__xr2d.scene.lasers.bolts.some((b) => b.alive), { timeout: 3000, interval: 30, label: `${label} : plus aucun tir en vol` });
}

/**
 * Attend qu'aucun tir ne soit en vol, tire une fois (J) et renvoie les `n` tirs partis (les plus récents),
 * lus dans la même évaluation que l'attente : [{ x, y, vx, vy, dist }].
 */
async function fire(t, label, n = 1) {
  await waitNoBolt(t, label);
  await t.key('KeyJ', 60);
  return waitFor(
    t,
    (k) => {
      const live = window.__xr2d.scene.lasers.bolts.filter((b) => b.alive);
      if (live.length < k) return false;
      return live
        .map((b) => ({ x: b.img.x, y: b.img.y, vx: b.vx, vy: b.vy, dist: b.dist }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, k);
    },
    { timeout: 1500, interval: 30, label: `${label} : ${n} tir(s) partent`, arg: n },
  );
}

/** Tire une fois et renvoie le tir parti. */
async function fireOnce(t, label) {
  return (await fire(t, label, 1))[0];
}

/** Direction d'un tir : angle (degrés) compté vers le haut depuis la droite (0 = droite, 90 = haut, 135 = haut-gauche). */
const angleOf = (b) => Math.round((Math.atan2(-b.vy, b.vx) * 180) / Math.PI);

/** Angles des tirs, triés. */
const anglesOf = (list) => list.map(angleOf).sort((a, b) => a - b);

/** Vrai si Kaï est devant la porte `d` (centre à ±tol px, pieds au bas de sa case). */
function atDoor(k, d, tol = 2) {
  return Math.abs(k.x - d.x) < tol && Math.abs(k.feetY - d.feetY) < 2;
}

/** Attend que Kaï soit devant la porte `d` (arrivée d'un passage). */
function waitAtDoor(t, d, label, timeout = 1500) {
  return waitFor(t, (p) => Math.abs(window.__xr2d.scene.player.x - p.x) < 24 && Math.abs(window.__xr2d.scene.player.feetY - p.feetY) < 2, {
    timeout,
    interval: 30,
    label,
    arg: d,
  });
}

/**
 * Saut attendu (et non une descente d'étage) : les pieds montent à plus de 60 px au-dessus de `fromY` en
 * moins de 600 ms ; pendant la montée, dropThrough reste faux. Renvoie la hauteur atteinte.
 */
async function assertRealJump(t, fromY, label) {
  const t0 = Date.now();
  let top = fromY;
  let risen = false;
  while (Date.now() - t0 < 900) {
    const k = await kai2d(t);
    assert(!k.dropThrough, `${label} : pas de descente d'étage (${fmt(k)})`);
    top = Math.min(top, k.feetY);
    if (k.feetY < fromY - 60) risen = true;
    if (risen && k.vy >= 0) break;
    assert(risen || Date.now() - t0 < 600, `${label} : Kaï doit sauter en moins de 600 ms (pieds ${r1(k.feetY)} pour ${r1(fromY)})`);
    await t.wait(30);
  }
  assert(risen, `${label} : Kaï doit sauter (pieds au plus haut ${r1(top)} pour ${r1(fromY)})`);
  return top;
}

/** Glisse le doigt `id` (seul doigt posé) de `a` vers `b` en `n` pas, sans le lever. */
async function slide(t, f, id, a, b, n = 8) {
  for (let k = 1; k <= n; k++) {
    await f.move([[a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, id]]);
    await t.wait(16);
  }
}

/** Vérifie que Kaï reste au sol sans bouger verticalement pendant `ms` (pieds à `feetY` ± 1). */
async function assertNoJump(t, feetY, ms, label) {
  const t0 = Date.now();
  let minFeet = feetY;
  while (Date.now() - t0 < ms) {
    const k = await kai2d(t);
    minFeet = Math.min(minFeet, k.feetY);
    await t.wait(40);
  }
  assert(minFeet > feetY - 1, `${label} : Kaï ne doit pas sauter (pieds ${r1(feetY)} -> plus haut ${r1(minFeet)})`);
}

/** Pose une tuile pleine (collision 4 côtés, grille de la scène comprise) en (col, row), copie de la tuile `like`. */
function putSolid(t, col, row, like) {
  return t.ev(
    ([c, r, l]) => {
      const s = window.__xr2d.scene;
      const idx = s.layer.getTileAt(l[0], l[1]).index;
      const tile = s.layer.putTileAt(idx, c, r);
      tile.setCollision(true, true, true, true, false);
      tile.faceTop = tile.faceBottom = tile.faceLeft = tile.faceRight = true;
      s.grid.cells[r * s.grid.cols + c] = 1; // CELL_SOLID : lu par Player.canStand
      return tile.index;
    },
    [col, row, like],
  );
}

// ---------------------------------------------------------------- Jungle

async function jungle(t) {
  await t.goto('?touch=0&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  const k0 = await placeAt(t, 4, 11, 'départ');
  const ground = k0.feetY;
  assertNear(ground, 12 * TILE, 1, 'pieds au sol de la Jungle (ligne 12)');
  assert(k0.h === STAND_H && !k0.crouching, `debout au départ (${fmt(k0)})`);

  // --- ↑ et W ne font plus sauter (Espace et K restent les touches de saut)
  await t.key('ArrowUp', 60);
  await assertNoJump(t, ground, 400, '↑ tapé');
  await t.key('KeyW', 60);
  await assertNoJump(t, ground, 400, 'W (Z en AZERTY) tapé');
  // W tenu = haut (visée haute), comme ↑
  await kb(t).down('KeyW');
  await waitFor(t, () => window.__xr2d.scene.player.aim === 'up', { timeout: 1000, interval: 30, label: 'W tenu : visée vers le haut' });
  await kb(t).up('KeyW');
  await waitFor(t, () => window.__xr2d.scene.player.aim === 'front', { timeout: 1000, interval: 30, label: 'W relâché : visée devant' });

  // --- ↑ tenu : visée haute, Kaï s'arrête et reste au sol ; tir vers le haut
  await kb(t).down('ArrowRight');
  await t.wait(250);
  await kb(t).down('ArrowUp');
  await t.wait(120);
  await kb(t).up('ArrowRight'); // ↑ seul
  await t.wait(400);
  let k = await kai2d(t);
  assert(k.aim === 'up', `↑ seul : visée vers le haut (${k.aim})`);
  assert(Math.abs(k.vx) < 5, `↑ seul : Kaï s'arrête (vx ${r1(k.vx)})`);
  await assertNoJump(t, ground, 300, '↑ tenu');
  let b = await fireOnce(t, 'tir vers le haut');
  t.log(`tir ↑ : v ${r1(b.vx)}, ${r1(b.vy)} (angle ${angleOf(b)}°)`);
  assert(b.vy < -850 && Math.abs(b.vx) < 20, `↑ : le tir part vers le haut (${fmt(b)})`);
  await t.key('KeyJ', 40);
  await t.wait(70);
  await kaiShot(t, 'aim-up-fire', { h: 220, dy: -60 });
  await kb(t).up('ArrowUp');

  // --- ↑ + → : visée diagonale, Kaï court ; tir à 45° vers la droite (tirs précédents finis avant de courir)
  await placeAt(t, 4, 11, 'diagonale droite');
  await waitNoBolt(t, 'diagonale droite');
  await kb(t).down('ArrowRight');
  await kb(t).down('ArrowUp');
  await t.wait(200);
  k = await kai2d(t);
  assert(k.aim === 'diag' && k.facing === 1, `↑ + → : visée diagonale à droite (${fmt(k)})`);
  assert(k.vx > 150, `↑ + → : Kaï court (vx ${r1(k.vx)})`);
  b = await fireOnce(t, 'tir diagonal droit');
  t.log(`tir ↗ : v ${r1(b.vx)}, ${r1(b.vy)} (angle ${angleOf(b)}°)`);
  assertNear(angleOf(b), 45, 2, `↗ : angle du tir (${fmt(b)})`);
  await t.key('KeyJ', 40);
  await t.wait(70);
  await kaiShot(t, 'aim-diag-right-fire', { h: 200, dy: -45 });
  await kb(t).up('ArrowUp');
  await kb(t).up('ArrowRight');

  // --- ↑ + ← : diagonale vers la gauche ; tir à 135°
  await placeAt(t, 12, 11, 'diagonale gauche');
  await waitNoBolt(t, 'diagonale gauche');
  await kb(t).down('ArrowLeft');
  await kb(t).down('ArrowUp');
  await t.wait(200);
  k = await kai2d(t);
  assert(k.aim === 'diag' && k.facing === -1, `↑ + ← : visée diagonale à gauche (${fmt(k)})`);
  b = await fireOnce(t, 'tir diagonal gauche');
  t.log(`tir ↖ : v ${r1(b.vx)}, ${r1(b.vy)} (angle ${angleOf(b)}°)`);
  assertNear(angleOf(b), 135, 2, `↖ : angle du tir (${fmt(b)})`);
  await kb(t).up('ArrowUp');
  await kb(t).up('ArrowLeft');

  // --- Tir debout à l'horizontale : hauteur de référence
  await placeAt(t, 16, 11, 'tir debout');
  await t.key('ArrowRight', 40);
  await t.wait(200);
  const standShot = await fireOnce(t, 'tir debout');
  assertNear(angleOf(standShot), 0, 1, `tir debout vers la droite (${fmt(standShot)})`);

  // --- ↓ seul : accroupi, corps de 46 px, pieds en place ; tir accroupi plus bas, toujours horizontal
  await kb(t).down('ArrowDown');
  await waitFor(t, (h) => window.__xr2d.scene.player.crouching && window.__xr2d.scene.player.body.height === h, {
    timeout: 1000,
    label: '↓ seul : accroupi',
    arg: CROUCH_H,
  });
  k = await kai2d(t);
  assertNear(k.feetY, ground, 1, '↓ seul : les pieds restent au sol');
  assert(k.aim === 'front', `accroupi : visée devant (${k.aim})`);
  await t.wait(250);
  await kaiShot(t, 'crouch');
  const crouchShot = await fireOnce(t, 'tir accroupi');
  t.log(`tir debout y ${r1(standShot.y)}, tir accroupi y ${r1(crouchShot.y)} (angle ${angleOf(crouchShot)}°)`);
  assertNear(angleOf(crouchShot), 0, 1, `tir accroupi à l'horizontale (${fmt(crouchShot)})`);
  assert(crouchShot.y > standShot.y + 10, `tir accroupi plus bas que debout (${r1(crouchShot.y)} / ${r1(standShot.y)})`);
  // Tir maintenu : pose accroupie de tir (rafraîchie à chaque tir) pendant la capture.
  await kb(t).down('KeyJ');
  await t.wait(120);
  await kaiShot(t, 'crouch-fire');
  await kb(t).up('KeyJ');
  // Relâcher ↓ : Kaï se relève.
  await kb(t).up('ArrowDown');
  await waitFor(t, (h) => !window.__xr2d.scene.player.crouching && window.__xr2d.scene.player.body.height === h, {
    timeout: 1000,
    label: '↓ relâché : debout',
    arg: STAND_H,
  });
  assertNear((await kai2d(t)).feetY, ground, 1, 'relevé : les pieds restent au sol');

  // --- Pompe : l'éventail (5 plombs, ± 14°) suit la visée haute et diagonale ; retour au laser ensuite
  await placeAt(t, 4, 11, 'pompe');
  await waitNoBolt(t, 'pompe');
  await t.ev(() => window.__xr2d.weapon('shotgun'));
  await kb(t).down('ArrowUp');
  await t.wait(150);
  let gerbe = anglesOf(await fire(t, 'pompe vers le haut', 5));
  t.log(`pompe ↑ : ${gerbe.join('°, ')}°`);
  assertEq(gerbe.length, 5, 'pompe ↑ : 5 plombs');
  [76, 83, 90, 97, 104].forEach((a, i) => assertNear(gerbe[i], a, 2, `pompe ↑ : angles ${gerbe.join(', ')} (76 à 104 attendus)`));
  await kb(t).up('ArrowUp');
  await placeAt(t, 4, 11, 'pompe diagonale');
  await waitNoBolt(t, 'pompe diagonale');
  await t.ev(() => window.__xr2d.weapon('shotgun')); // cadence (600 ms) et chauffe remises à zéro
  await kb(t).down('ArrowRight');
  await kb(t).down('ArrowUp');
  await t.wait(200);
  gerbe = anglesOf(await fire(t, 'pompe diagonale', 5));
  t.log(`pompe ↗ : ${gerbe.join('°, ')}°`);
  [31, 38, 45, 52, 59].forEach((a, i) => assertNear(gerbe[i], a, 2, `pompe ↗ : angles ${gerbe.join(', ')} (31 à 59 attendus)`));
  await kb(t).up('ArrowUp');
  await kb(t).up('ArrowRight');
  await waitNoBolt(t, 'retour au laser');
  await t.ev(() => window.__xr2d.weapon('laser'));

  // --- ↓ puis → : reptation lente (≈ 0,3 x la course)
  await placeAt(t, 16, 11, 'reptation');
  await kb(t).down('ArrowDown');
  await waitFor(t, () => window.__xr2d.scene.player.crouching, { timeout: 1000, label: 'reptation : accroupi' });
  await kb(t).down('ArrowRight');
  await t.wait(250);
  const xc0 = (await kai2d(t)).x;
  await t.wait(500);
  k = await kai2d(t);
  t.log(`reptation 500 ms : x ${r1(xc0)} -> ${r1(k.x)} (vx ${r1(k.vx)})`);
  assert(k.crouching && k.h === CROUCH_H, `↓ + → : reste accroupi (${fmt(k)})`);
  assert(k.x - xc0 > 30 && k.x - xc0 < 90, `↓ + → : reptation lente (${r1(k.x - xc0)} px en 500 ms)`);
  await kaiShot(t, 'crawl');
  await kb(t).up('ArrowRight');
  await kb(t).up('ArrowDown');
  await waitFor(t, () => !window.__xr2d.scene.player.crouching, { timeout: 1000, label: 'reptation finie : debout' });

  // --- → puis ↓ (diagonale basse en courant) : course, pas d'accroupi
  await placeAt(t, 12, 11, 'diagonale basse');
  await kb(t).down('ArrowRight');
  await t.wait(250);
  await kb(t).down('ArrowDown');
  const xr0 = (await kai2d(t)).x;
  await t.wait(300);
  k = await kai2d(t);
  t.log(`→ + ↓ 300 ms : x ${r1(xr0)} -> ${r1(k.x)}, accroupi ${k.crouching}`);
  assert(!k.crouching && k.h === STAND_H, `→ + ↓ : pas d'accroupi en courant (${fmt(k)})`);
  assert(k.x - xr0 > 90, `→ + ↓ : Kaï court (${r1(k.x - xr0)} px en 300 ms)`);
  await kb(t).up('ArrowDown');
  await kb(t).up('ArrowRight');

  // --- ↓ + Saut sur un sol plein : saut normal
  await placeAt(t, 18, 11, '↓ + Saut sur sol plein');
  await kb(t).down('ArrowDown');
  await waitFor(t, () => window.__xr2d.scene.player.crouching, { timeout: 1000, label: '↓ + Saut sol plein : accroupi' });
  await t.key('Space', 120);
  await waitFor(t, (g) => window.__xr2d.scene.player.feetY < g - 100, { timeout: 1500, label: '↓ + Saut sur sol plein : Kaï saute', arg: ground });
  await kb(t).up('ArrowDown');
  await waitFor(t, (g) => window.__xr2d.scene.player.onGround && Math.abs(window.__xr2d.scene.player.feetY - g) < 1, {
    timeout: 3000,
    label: 'retombé au sol',
    arg: ground,
  });

  // --- Plafond bas (aucun dans la Jungle : tuiles posées par le test à la ligne 10, au-dessus de Kaï accroupi)
  k = await placeAt(t, 20, 11, 'plafond bas');
  await kb(t).down('ArrowDown');
  await waitFor(t, () => window.__xr2d.scene.player.crouching, { timeout: 1000, label: 'plafond bas : accroupi' });
  const c = Math.floor(k.x / TILE);
  for (let col = c - 1; col <= c + 2; col++) await putSolid(t, col, 10, [20, 12]);
  await kb(t).up('ArrowDown');
  await t.wait(400);
  k = await kai2d(t);
  assert(k.crouching && k.h === CROUCH_H, `plafond bas : impossible de se relever (${fmt(k)})`);
  await kaiShot(t, 'crouch-under-low-ceiling', { w: 320 });
  // Saut refusé sous le plafond
  await t.key('Space', 120);
  await assertNoJump(t, ground, 400, 'Saut sous le plafond bas');
  assert((await kai2d(t)).crouching, 'plafond bas : toujours accroupi après Saut');
  // → seul : reptation pour sortir, puis Kaï se relève tout seul et court. Tant qu'une partie du corps est
  // sous le plafond (colonnes c-1 à c+2), il reste accroupi ; il se relève une fois le bord gauche sorti.
  const ceilL = (c - 1) * TILE;
  const ceilR = (c + 3) * TILE;
  await kb(t).down('ArrowRight');
  await t.wait(300);
  k = await kai2d(t);
  assert(k.crouching && k.vx > 50 && k.vx < 150, `plafond bas, → : reptation (${fmt(k)})`);
  let stood = null;
  let under = 0;
  const tc = Date.now();
  while (!stood && Date.now() - tc < 4000) {
    const s = await kai2d(t);
    // Marge d'1 px comme Player.canStand (bords du corps rentrés d'1 px) : relevé à moins d'1 px du bord, Kaï
    // peut déjà être debout.
    if (s.x + HALF_W - 1 > ceilL && s.x - HALF_W + 1 < ceilR) {
      under++;
      assert(s.crouching && s.h === CROUCH_H, `plafond bas : Kaï accroupi tant qu'il est dessous (${fmt(s)}, plafond ${ceilL}-${ceilR})`);
    } else if (!s.crouching && s.h === STAND_H) {
      stood = s;
    }
    await t.wait(40);
  }
  assert(stood, `sorti de sous le plafond : Kaï doit se relever (${under} relevés sous le plafond)`);
  t.log(`plafond bas : ${under} relevés accroupi dessous, relevé en x ${r1(stood.x)} (bord gauche ${r1(stood.x - HALF_W)}, plafond jusqu'à ${ceilR})`);
  assert(stood.x - HALF_W >= ceilR - 1, `relevé seulement une fois tout le corps sorti (bord gauche ${r1(stood.x - HALF_W)}, plafond jusqu'à ${ceilR})`);
  await kb(t).up('ArrowRight');

  // --- Plateforme '=' (ligne 9, col. 60-63, sol plein ligne 12) : ↓ seul et Saut seul ne font pas tomber
  const plat = 9 * TILE;
  k = await placeAt(t, 61, 8, 'plateforme =');
  assertNear(k.feetY, plat, 1, 'Kaï posé sur la plateforme =');
  await kb(t).down('ArrowDown');
  await t.wait(500);
  k = await kai2d(t);
  assert(k.crouching && Math.abs(k.feetY - plat) < 1, `↓ seul sur '=' : accroupi, ne tombe pas (${fmt(k)})`);
  await kb(t).up('ArrowDown');
  await t.wait(150);
  await t.key('Space', 80);
  await waitFor(t, (y) => window.__xr2d.scene.player.feetY < y - 60, { timeout: 1500, label: "Saut seul sur '=' : Kaï saute vers le haut", arg: plat });
  await waitFor(t, (y) => window.__xr2d.scene.player.onGround && Math.abs(window.__xr2d.scene.player.feetY - y) < 1, {
    timeout: 3000,
    label: "retombé sur la plateforme '='",
    arg: plat,
  });
  // ↘ (→ + ↓) + Saut : la diagonale basse compte comme → seul : vrai saut, pas de descente d'étage
  await placeAt(t, 61, 8, "plateforme = (↘ + Saut)");
  await kb(t).down('ArrowRight');
  await kb(t).down('ArrowDown');
  await t.wait(60);
  await kb(t).down('Space');
  const topR = await assertRealJump(t, plat, "↘ + Saut sur '='");
  t.log(`↘ + Saut sur '=' : saut jusqu'à ${r1(plat - topR)} px au-dessus de la plateforme`);
  await kb(t).up('Space');
  await kb(t).up('ArrowDown');
  await kb(t).up('ArrowRight');
  await waitFor(t, () => window.__xr2d.scene.player.onGround, { timeout: 3000, label: "↘ + Saut sur '=' : retombé au sol" });
  // ↓ + Saut : descente à travers la plateforme, jusqu'au sol plein
  await placeAt(t, 61, 8, "plateforme = (↓ + Saut)");
  await kb(t).down('ArrowDown');
  await t.wait(150);
  await kb(t).down('Space');
  await waitFor(t, (y) => window.__xr2d.scene.player.feetY > y + 20, { timeout: 1000, label: "↓ + Saut : Kaï passe sous la plateforme '='", arg: plat });
  await kaiShot(t, 'drop-through-platform', { h: 240, dy: -60 });
  await kb(t).up('Space');
  await kb(t).up('ArrowDown');
  await waitFor(t, (g) => window.__xr2d.scene.player.onGround && Math.abs(window.__xr2d.scene.player.feetY - g) < 1, {
    timeout: 3000,
    label: "↓ + Saut sur '=' : Kaï retombe sur le sol de l'étage du dessous",
    arg: ground,
  });

  // --- Portes : (144, 9) sur le rocher ↔ (128, 5) dans la salle secrète
  const doorA = DOOR_ROCK;
  const doorB = DOOR_ROOM;
  k = await placeAt(t, doorA.col, doorA.row, 'porte du rocher');
  assertNear(k.x, doorA.x, 1, 'Kaï devant la porte du rocher (x)');
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0 && window.__xr2d.scene.doors.arrow.visible && window.__xr2d.scene.doors.arrow.alpha > 0.95, {
    timeout: 2000,
    label: 'flèche ▲ au-dessus de la porte',
  });
  await t.wait(200);
  await kaiShot(t, 'door-arrow', { w: 260, h: 240, dy: -70 });
  // ↑ avec Tir maintenu : n'entre pas
  await kb(t).down('KeyJ');
  await t.wait(80);
  await kb(t).down('ArrowUp');
  await t.wait(500);
  await kb(t).up('KeyJ');
  await t.wait(150);
  await kb(t).up('ArrowUp');
  k = await kai2d(t);
  assert(atDoor(k, doorA), `↑ avec Tir maintenu : Kaï ne passe pas la porte (${fmt(k)})`);
  // ↑ seul : passage vers la salle secrète
  await t.wait(200);
  await t.key('ArrowUp', 80);
  await waitAtDoor(t, doorB, 'porte : arrivée devant la porte de la salle secrète (128, 5)');
  assert(atDoor(await kai2d(t), doorB), 'porte : Kaï centré devant la porte de la salle');
  await waitFor(t, () => window.__xr2d.scene.glyphs.list.every((g) => g.lit && g.on.alpha > 0.99), {
    timeout: 4000,
    label: 'ruine astréenne : glyphes allumés à l’arrivée par la porte',
  });
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0 && window.__xr2d.scene.doors.arrow.alpha > 0.95, {
    timeout: 2000,
    label: 'flèche ▲ revenue au-dessus de la porte de la salle',
  });
  await t.wait(200);
  await t.shot('door-secret-room');
  // ← tenu (Kaï poussé contre le mur de la salle, toujours devant la porte), puis ↑ : pas de passage
  await kb(t).down('ArrowLeft');
  await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      const p = s.player;
      // Contre le mur B de la colonne 127 : bord gauche du corps en 128 x 64.
      return p.onGround && Math.abs(p.x - 17 - 128 * 64) < 2 && s.doors.nearIndex >= 0;
    },
    { timeout: 2000, interval: 30, label: '← tenu : Kaï contre le mur, devant la porte de la salle' },
  );
  await kb(t).down('ArrowUp');
  await t.wait(500);
  k = await kai2d(t);
  assert(Math.abs(k.feetY - doorB.feetY) < 1 && Math.abs(k.x - doorB.x) < 24, `↑ pressé pendant que ← est tenu : Kaï ne passe pas la porte (${fmt(k)})`);
  // Relâcher ↑ d'abord (relâcher ← avec ↑ tenu serait un appui « interact »)
  await kb(t).up('ArrowUp');
  await t.wait(80);
  await kb(t).up('ArrowLeft');
  await t.wait(150);
  k = await kai2d(t);
  assert(Math.abs(k.feetY - doorB.feetY) < 1, `← et ↑ relâchés : Kaï toujours dans la salle (${fmt(k)})`);
  // Retour : ↑ seul devant la porte de la salle
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0, { timeout: 2000, label: 'flèche devant la porte de la salle' });
  await t.key('ArrowUp', 80);
  await waitAtDoor(t, doorA, 'porte : retour devant la porte du rocher (144, 9)');
  assert(atDoor(await kai2d(t), doorA), 'porte : Kaï centré devant la porte du rocher');
  t.log('portes au clavier : aller et retour faits');
}

// ---------------------------------------------------------------- Jungle : portes au stick tactile

async function doorsTouch(t) {
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  const f = touches(t);
  const U = await center(t, '.xr-dpad', 0.5, 0.12);
  const L = await center(t, '.xr-dpad', 0.2, 0.5);
  const F = await center(t, '.xr-fire');

  // Stick posé sur ↑ devant la porte du rocher : passage
  await placeAt(t, DOOR_ROCK.col, DOOR_ROCK.row, 'tactile : porte du rocher');
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0, { timeout: 2000, label: 'tactile : flèche ▲ devant la porte du rocher' });
  await f.start([[...U, 1]]);
  await waitAtDoor(t, DOOR_ROOM, 'tactile : stick ↑, arrivée dans la salle secrète');
  // Doigt gardé sur ↑ bien au-delà du délai entre deux passages : pas de retour
  await t.wait(1000);
  let k = await kai2d(t);
  assert(atDoor(k, DOOR_ROOM), `tactile : doigt gardé sur ↑ après l'arrivée, Kaï reste dans la salle (${fmt(k)})`);
  await f.end();
  await waitInputIdle(t, 'tactile : doigt levé');

  // TIR posé, puis stick ↑ : pas de passage ; TIR levé, stick toujours sur ↑ : toujours pas
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0, { timeout: 2000, label: 'tactile : flèche ▲ devant la porte de la salle' });
  await f.start([[...F, 2]]);
  await t.wait(80);
  await f.start([[...F, 2], [...U, 3]]);
  await t.wait(600);
  k = await kai2d(t);
  assert(atDoor(k, DOOR_ROOM), `tactile : TIR tenu + stick ↑, Kaï ne passe pas la porte (${fmt(k)})`);
  await f.end([[...U, 3]]);
  await t.wait(500);
  k = await kai2d(t);
  assert(atDoor(k, DOOR_ROOM), `tactile : TIR levé, stick toujours sur ↑, Kaï ne passe pas la porte (${fmt(k)})`);
  await f.end();
  await waitInputIdle(t, 'tactile : tout levé');

  // Retour : doigt sur ← (Kaï contre le mur, devant la porte), puis glissé vers ↑ sans lever : passage
  await f.start([[...L, 4]]);
  await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      const p = s.player;
      // Contre le mur B de la colonne 127 : bord gauche du corps en 128 x 64.
      return p.onGround && Math.abs(p.x - 17 - 128 * 64) < 2 && s.doors.nearIndex >= 0;
    },
    { timeout: 2000, interval: 30, label: 'tactile : ← tenu, Kaï contre le mur devant la porte de la salle' },
  );
  await slide(t, f, 4, L, U);
  await waitAtDoor(t, DOOR_ROCK, 'tactile : doigt glissé de ← vers ↑, retour devant la porte du rocher');
  await f.end();
  await waitInputIdle(t, 'tactile : fin des portes');
  t.log('portes au stick : aller, refus (doigt gardé, TIR tenu) et retour faits');
}

// ---------------------------------------------------------------- Lune : plateforme mobile

/** Plateforme mobile sous Kaï : { top, vy } (null s'il n'est pas dessus). */
function moverUnder(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const p = s.player;
    for (const m of s.movers.list) {
      const b = m.body;
      if (p.x >= b.left && p.x <= b.right) return { top: b.top, vy: b.velocity.y, vertical: m.vertical };
    }
    return null;
  });
}

async function moon(t) {
  await t.goto('?touch=0&unlock=1&stage=m1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  // Monte-charge vertical dans le puits des colonnes 47-49 (ligne 12 → 9) : Kaï y tombe depuis la ligne 7.
  await t.ev(() => window.__xr2d.teleport(48, 7));
  await waitFor(t, () => {
    const p = window.__xr2d.scene.player;
    return p.onGround && p.body.touching.down;
  }, { timeout: 4000, label: 'Kaï posé sur la plateforme mobile' });
  const m0 = await moverUnder(t);
  assert(m0 && m0.vertical, `plateforme mobile verticale sous Kaï (${fmt(m0)})`);

  // ↓ seul : accroupi, reste sur la plateforme (elle monte et descend) : pieds jamais sous son dessus
  await kb(t).down('ArrowDown');
  await waitFor(t, () => window.__xr2d.scene.player.crouching, { timeout: 1000, label: '↓ seul sur la plateforme mobile : accroupi' });
  let gap = 0;
  for (let i = 0; i < 16; i++) {
    const k = await kai2d(t);
    const m = await moverUnder(t);
    assert(m && k.crouching, `↓ seul sur la plateforme mobile : accroupi dessus (${fmt(k)} / ${fmt(m)})`);
    gap = Math.max(gap, k.feetY - m.top);
    await t.wait(50);
  }
  t.log(`↓ seul sur la plateforme mobile : écart max pieds - dessus ${r1(gap)} px`);
  assert(gap < 8, `↓ seul sur la plateforme mobile : Kaï ne doit pas tomber (écart ${r1(gap)} px)`);
  await kb(t).up('ArrowDown');
  await t.wait(150);

  // Saut seul : saut normal, Kaï retombe sur la plateforme
  const f0 = (await moverUnder(t)).top;
  await t.key('Space', 80);
  await waitFor(t, (y) => window.__xr2d.scene.player.feetY < y - 60, { timeout: 1500, label: 'Saut seul sur la plateforme mobile : saut', arg: f0 });
  await waitFor(t, () => {
    const p = window.__xr2d.scene.player;
    return p.onGround && p.body.touching.down;
  }, { timeout: 4000, label: 'retombé sur la plateforme mobile' });
  await t.wait(200);

  // ↙ (← + ↓) + Saut : la diagonale basse compte comme ← seul : vrai saut, pas de traversée
  const f1 = (await moverUnder(t)).top;
  await kb(t).down('ArrowLeft');
  await kb(t).down('ArrowDown');
  await t.wait(60);
  await kb(t).down('Space');
  await assertRealJump(t, f1, '↙ + Saut sur la plateforme mobile');
  await kb(t).up('Space');
  await kb(t).up('ArrowDown');
  await kb(t).up('ArrowLeft');
  await waitFor(t, () => window.__xr2d.scene.player.onGround, { timeout: 4000, label: '↙ + Saut : retombé au sol' });
  // Retour sur le monte-charge
  await t.ev(() => window.__xr2d.teleport(48, 7));
  await waitFor(t, () => {
    const p = window.__xr2d.scene.player;
    return p.onGround && p.body.touching.down;
  }, { timeout: 4000, label: 'Kaï reposé sur la plateforme mobile' });
  await t.wait(200);

  // ↓ + Saut : Kaï traverse la plateforme (le puits, sans fond, le ramène au dernier sol sûr en mode god)
  await kb(t).down('ArrowDown');
  await t.wait(150);
  await kb(t).down('Space');
  const crossed = await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      const p = s.player;
      for (const mv of s.movers.list) {
        const b = mv.body;
        if (p.x >= b.left && p.x <= b.right && p.feetY > b.top + 30) return { feet: p.feetY, top: b.top };
      }
      return false;
    },
    { timeout: 1000, interval: 30, label: '↓ + Saut : Kaï passe sous le dessus de la plateforme mobile' },
  );
  t.log(`plateforme mobile traversée : pieds ${r1(crossed.feet)}, dessus ${r1(crossed.top)}`);
  await kaiShot(t, 'moon-drop-through-mover', { h: 240, dy: -40 });
  await kb(t).up('Space');
  await kb(t).up('ArrowDown');
  // Mode god : la chute dans le puits ramène Kaï au dernier sol sûr ; la partie continue.
  await waitFor(t, () => {
    const s = window.__xr2d.scene;
    return s.state === 'play' && s.player.onGround;
  }, { timeout: 5000, label: 'Kaï de retour au sol après la chute' });
}

export default async function (t) {
  await jungle(t);
  await doorsTouch(t);
  await moon(t);
}
