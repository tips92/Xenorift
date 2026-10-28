// Bonus du plan 02 et double saut (aides DEV), Jungle (j1) puis Lune (m1) :
//  Double saut : absent hors mode test (2e appui en l'air sans effet), appris en mode test (?unlock=1).
//  Blocs bonus de la Jungle frappés par dessous : vitesse (bloc 1, colonne 28) et cadence (bloc 3, colonne
//  152) sortent puis sont ramassés ; deux anneaux au HUD.
//  Vitesse : course maximale × 1,35 (518 px/s au lieu de 384). Cadence : délai entre tirs × 0,6, chauffe × 0,6
//  (appuis avant surchauffe : laser 5 -> 9, mitrailleur 28, pompe 5, fusil 7 rafales). Les deux à la fois.
//  Reprendre un bonus remet 12 s ; fin proche (anneau is-ending, absent tant que le bonus est frais, retiré
//  quand on le reprend), fin (effet retiré, anneau éteint).
//  Bouclier : absorbe un coup d'ennemi (cœurs intacts, anneau éteint), le coup suivant coûte un cœur.
//  Vie perdue (arme chaude, bonus actifs) : plus aucun bonus, jauge à zéro (moteur et HUD) ; le double saut
//  (compétence) reste.
//  HUD sans chevauchement de 844 à 621 px de large, avec 53 cristaux et les trois anneaux.
//  Captures : blocs bonus vitesse et cadence (Jungle et Lune, bonus sorti vérifié), traînée de vitesse,
//  étincelles de cadence, HUD avec arme, deux anneaux et bouclier (844x390 et 640x320).
import { assert, assertEq, assertNear, fmt, waitFor, waitFor2dPlay } from '../lib/helpers.mjs';
import {
  freeze2d,
  gameClock,
  gun2d,
  hudGun,
  kai2d,
  kaiShot,
  moveEnemy,
  parkEnemy,
  placeKai,
  placeKaiRight,
  readyGun,
  recordShots,
  removeEnemies,
  shotLog,
  waitGunIdle,
} from '../lib/game2d.mjs';
import { overlaps, rects } from '../lib/core.mjs';

export const meta = {
  title: 'Bonus : vitesse, cadence, les deux, durée, bouclier, vie perdue ; double saut selon le mode test ; blocs bonus',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

const RUN_SPEED = 384;
const SPEED_MUL = 1.35;
const DURATION_MS = 12000;
/** Projectiles par appui et appuis avant surchauffe sans / avec le bonus de cadence (core/weapons.ts). */
const HEAT = {
  laser: { per: 1, normal: 5, rapid: 9 },
  machinegun: { per: 1, normal: 17, rapid: 28 },
  shotgun: { per: 5, normal: 3, rapid: 5 },
  rifle: { per: 3, normal: 4, rapid: 7 },
};

const kb = (t) => t.page.keyboard;
const r1 = (v) => Math.round(v * 10) / 10;
const power = (t, kind) => t.ev((k) => window.__xr2d.power(k), kind);

/** Attend les anneaux de bonus allumés au HUD, dans l'ordre (vitesse, cadence, bouclier). */
function waitRings(t, kinds, label) {
  return waitFor(
    t,
    (k) => [...document.querySelectorAll('.hud-powers .hud-power.is-on')].map((e) => e.dataset.kind).join() === k.join(),
    { timeout: 1500, interval: 30, label: `${label} (${kinds.join(', ') || 'aucun'})`, arg: kinds },
  );
}

/** Hauteur max (px au-dessus du sol) d'un saut avec un 2e appui en l'air (relevé à chaque image). */
async function jumpApex(t, label) {
  await placeKai(t, 4, 11, label);
  const feet0 = (await kai2d(t)).feetY;
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const r = (window.__xrJump = { min: s.player.feetY, left: false });
    const f = () => {
      r.min = Math.min(r.min, s.player.feetY);
      if (!s.player.onGround) r.left = true;
    };
    s.events.on('postupdate', f);
    r.off = () => s.events.off('postupdate', f);
  });
  await kb(t).down('Space');
  await t.wait(200);
  await kb(t).up('Space');
  await t.wait(120);
  await kb(t).down('Space');
  await t.wait(250);
  await kb(t).up('Space');
  await waitFor(t, () => window.__xrJump.left && window.__xr2d.scene.player.onGround, { timeout: 4000, interval: 30, label: `${label} : retombé` });
  const min = await t.ev(() => {
    window.__xrJump.off();
    return window.__xrJump.min;
  });
  return feet0 - min;
}

/** Course à droite depuis (2, 11) pendant `ms` ms : vitesse horizontale max (relevée à chaque image). */
async function maxRunSpeed(t, label, shot = null) {
  await placeKai(t, 2, 11, label);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const r = (window.__xrRun = { max: 0 });
    const f = () => {
      r.max = Math.max(r.max, Math.abs(s.player.body.velocity.x));
    };
    s.events.on('postupdate', f);
    r.off = () => s.events.off('postupdate', f);
  });
  await kb(t).down('ArrowRight');
  await t.wait(900);
  if (shot) await kaiShot(t, shot, { w: 300, h: 160, dx: -40 });
  await t.wait(200);
  await kb(t).up('ArrowRight');
  const v = await t.ev(() => {
    window.__xrRun.off();
    return window.__xrRun.max;
  });
  await waitFor(t, () => Math.abs(window.__xr2d.scene.player.body.velocity.x) < 1, { timeout: 2000, interval: 30, label: `${label} : arrêté` });
  return v;
}

/**
 * Tir maintenu jusqu'à la surchauffe avec l'arme `id` : appuis (rafales comprises) et délai moyen entre deux
 * appuis (heure du jeu). `shot` : capture de Kaï pendant le tir.
 */
async function fireUntilOverheat(t, id, label, shot = null) {
  const per = HEAT[id].per;
  await placeKaiRight(t, 3, 11, label);
  await readyGun(t, id, label);
  const t0 = await gameClock(t);
  await kb(t).down('KeyJ');
  try {
    if (shot) {
      await t.wait(170);
      await kaiShot(t, shot, { w: 300, h: 160, dx: 40 });
    }
    await waitFor(t, () => window.__xr2d.info().overheated, { timeout: 6000, interval: 20, label: `${label} : surchauffe` });
  } finally {
    await kb(t).up('KeyJ');
  }
  await waitGunIdle(t, label); // fin d'une rafale commencée
  const list = await shotLog(t, t0);
  const starts = list.filter((_r, i) => i % per === 0).map((r) => r.at);
  const gap = starts.length > 1 ? (starts[starts.length - 1] - starts[0]) / (starts.length - 1) : 0;
  return { pulls: list.length / per, gap };
}

/** Pose le marcheur sur Kaï (contact, il avance vers lui) jusqu'à `until` (évalué dans la page), puis le range. */
async function walkerHit(t, index, until, label) {
  const k = await kai2d(t);
  await moveEnemy(t, index, k.x + 18, k.feetY, -1);
  try {
    await waitFor(t, until, { timeout: 2000, interval: 20, label });
  } finally {
    await moveEnemy(t, index, 30 * 64 + 32, 12 * 64);
  }
}

/**
 * Frappe par dessous le bloc bonus (col, row) : Kaï sous le bloc saute ; le bonus `kind` sort de CE bloc
 * (items.powers garde les bonus déjà ramassés : on cherche un bonus neuf au-dessus du bloc) ; capture.
 */
async function bumpBlock(t, col, row, kind, shot) {
  await placeKaiRight(t, col, 11, `bloc (${col}, ${row})`);
  await kb(t).down('Space');
  await t.wait(160);
  await kb(t).up('Space');
  await waitFor(
    t,
    ([k, x]) => window.__xr2d.scene.items.powers.some((p) => p.kind === k && !p.taken && Math.abs(p.homeX - x) < 1),
    { timeout: 2000, interval: 20, label: `bloc (${col}, ${row}) : bonus ${kind} sorti`, arg: [kind, col * 64 + 32] },
  );
  await t.wait(330);
  await freeze2d(t, true);
  await kaiShot(t, shot, { w: 300, h: 250, dy: -100, zoom: 2.5 });
  await freeze2d(t, false);
}

/** Attend le bonus sorti posé (il flotte), puis Kaï va le ramasser (téléporté dessous). */
async function pickUp(t, kind) {
  const col = await waitFor(
    t,
    (k) => {
      const it = window.__xr2d.scene.items.powers.find((p) => p.kind === k && !p.taken);
      return it && it.state === 2 ? Math.floor(it.sprite.x / 64) : false;
    },
    { timeout: 8000, interval: 50, label: `bonus ${kind} posé`, arg: kind },
  );
  return col;
}

async function doubleJump(t) {
  // --- Hors mode test : pas de double saut
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  assert(!(await gun2d(t)).canDoubleJump, 'hors mode test : pas de double saut');
  const single = await jumpApex(t, 'saut hors mode test');

  // --- Mode test : double saut appris
  await t.goto('?touch=0&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  assert((await gun2d(t)).canDoubleJump, 'mode test : double saut');
  const double = await jumpApex(t, 'saut en mode test');
  t.log(`2e appui en l'air : ${r1(single)} px hors mode test, ${r1(double)} px en mode test`);
  assert(single < 280, `hors mode test : le 2e appui ne relance pas le saut (${r1(single)} px)`);
  assert(double > single + 80, `mode test : le 2e appui fait un double saut (${r1(double)} px pour ${r1(single)} px)`);
}

export default async function (t) {
  await doubleJump(t);

  // Partie en mode test (j1) : le marcheur du départ est rangé en colonne 30 (immobile), les autres retirés.
  await recordShots(t);
  const walker = await t.ev(() => window.__xr2d.scene.enemies.list.findIndex((e) => e.kind === 'w'));
  await removeEnemies(t, [walker]);
  await parkEnemy(t, 'w', 30, 11);

  // --- Vitesse
  const v0 = await maxRunSpeed(t, 'course sans bonus');
  await power(t, 'speed');
  let g = await gun2d(t);
  assertNear(g.speedMul, SPEED_MUL, 1e-6, 'bonus de vitesse : speedMul');
  await waitRings(t, ['speed'], 'bonus de vitesse : un anneau au HUD');
  const v1 = await maxRunSpeed(t, 'course avec le bonus de vitesse', 'speed-trail');
  t.log(`vitesse de course max : ${r1(v0)} px/s, avec le bonus ${r1(v1)} px/s (x ${r1((v1 / v0) * 100) / 100})`);
  assertNear(v0, RUN_SPEED, 4, 'vitesse de course max sans bonus');
  assertNear(v1, RUN_SPEED * SPEED_MUL, 6, 'vitesse de course max avec le bonus de vitesse (x 1,35)');

  // Reprendre le bonus remet 12 s.
  let left = (await gun2d(t)).speedLeftMs;
  assert(left < DURATION_MS - 800, `bonus de vitesse entamé (${left} ms)`);
  await power(t, 'speed');
  left = (await gun2d(t)).speedLeftMs;
  assert(left > DURATION_MS - 200, `bonus de vitesse repris : de nouveau 12 s (${left} ms)`);

  // --- Cadence (laser) : délai entre tirs et chauffe x 0,6 ; les deux bonus en même temps
  await t.ev(() => {
    window.__xr2d.scene.speedLeftMs = 0;
  });
  await waitFor(t, () => window.__xr2d.info().speedMul === 1, { timeout: 1000, interval: 30, label: 'bonus de vitesse retiré' });
  const normal = await fireUntilOverheat(t, 'laser', 'laser sans bonus');
  await power(t, 'rapid');
  await power(t, 'speed');
  g = await gun2d(t);
  await waitRings(t, ['speed', 'rapid'], 'vitesse et cadence : deux anneaux au HUD');
  assert(g.speedMul === SPEED_MUL && Math.abs(g.stats.cooldownMs - 96) < 1e-6 && Math.abs(g.stats.heatPerShot - 0.12) < 1e-6, `vitesse et cadence actives ensemble (${fmt({ speedMul: g.speedMul, stats: g.stats })})`);
  const rapid = await fireUntilOverheat(t, 'laser', 'laser avec la cadence', 'rapid-sparks');
  t.log(`laser : ${normal.pulls} tirs toutes les ${r1(normal.gap)} ms, avec la cadence ${rapid.pulls} tirs toutes les ${r1(rapid.gap)} ms`);
  assertEq(normal.pulls, HEAT.laser.normal, 'laser sans bonus : tirs avant surchauffe');
  assertEq(rapid.pulls, HEAT.laser.rapid, 'laser avec la cadence : tirs avant surchauffe');
  assert(normal.gap >= 150 && normal.gap <= 185, `laser sans bonus : délai entre tirs ${r1(normal.gap)} ms (160 attendus)`);
  assert(rapid.gap >= 85 && rapid.gap <= 115, `laser avec la cadence : délai entre tirs ${r1(rapid.gap)} ms (96 attendus)`);
  assertNear(rapid.gap / normal.gap, 0.6, 0.08, 'délai entre tirs : rapport avec / sans la cadence');
  // Vitesse toujours là pendant la cadence.
  const v2 = await maxRunSpeed(t, 'course avec vitesse et cadence');
  assertNear(v2, RUN_SPEED * SPEED_MUL, 6, 'vitesse de course max avec les deux bonus');
  // Chauffe d'un tir.
  await placeKaiRight(t, 3, 11, 'chauffe d’un tir');
  await readyGun(t, 'laser', 'chauffe d’un tir');
  await t.key('KeyJ', 30);
  await t.wait(40);
  assertNear((await gun2d(t)).heat, 0.12, 0.011, 'laser avec la cadence : chauffe d’un tir');

  // Les autres armes avec la cadence (bonus repris avant chacune : 12 s).
  for (const id of ['machinegun', 'shotgun', 'rifle']) {
    await power(t, 'rapid');
    const r = await fireUntilOverheat(t, id, `${id} avec la cadence`);
    t.log(`${id} avec la cadence : surchauffe après ${r.pulls} appui(s), toutes les ${r1(r.gap)} ms`);
    assertEq(r.pulls, HEAT[id].rapid, `${id} avec la cadence : appuis avant surchauffe`);
  }
  await readyGun(t, 'laser', 'retour au laser');

  // --- Fin des bonus : anneau qui clignote, puis effet retiré
  await t.ev(() => {
    const s = window.__xr2d.scene;
    s.speedLeftMs = 2000;
    s.rapidLeftMs = 1500;
  });
  await waitFor(t, () => document.querySelectorAll('.hud-powers .hud-power.is-on.is-ending').length === 2, { timeout: 1000, interval: 30, label: 'fin proche : deux anneaux qui clignotent' });
  // Bonus de vitesse repris : son anneau ne clignote plus, celui de la cadence si.
  await power(t, 'speed');
  await waitFor(t, () => [...document.querySelectorAll('.hud-powers .hud-power.is-on.is-ending')].map((e) => e.dataset.kind).join() === 'rapid', {
    timeout: 1000,
    interval: 30,
    label: 'vitesse reprise : seul l’anneau de la cadence clignote',
  });
  assertEq((await hudGun(t)).powers, ['speed', 'rapid'], 'vitesse reprise : deux anneaux allumés');
  await t.ev(() => {
    window.__xr2d.scene.speedLeftMs = 600;
  });
  await waitFor(t, () => {
    const i = window.__xr2d.info();
    return i.speedLeftMs === 0 && i.rapidLeftMs === 0 && i.speedMul === 1 && i.stats.cooldownMs === 160;
  }, { timeout: 3500, interval: 50, label: 'bonus finis : vitesse et cadence normales' });
  await waitRings(t, [], 'bonus finis : plus d’anneau');

  // --- Bouclier : absorbe un coup, le suivant coûte un cœur
  await power(t, 'shield');
  await waitRings(t, ['shield'], 'bouclier : anneau au HUD');
  await placeKai(t, 8, 11, 'bouclier');
  await t.ev(() => window.__xr2d.god(false));
  await walkerHit(t, walker, () => !window.__xr2d.info().shield, 'coup absorbé par le bouclier');
  let hud = await hudGun(t);
  assertEq(hud.hearts, 3, 'bouclier : aucun cœur perdu');
  await waitFor(t, () => !document.querySelector('.hud-power.is-on[data-kind="shield"]'), { timeout: 1000, interval: 30, label: 'anneau du bouclier éteint' });
  // Invulnérabilité après le bouclier (700 ms, heure du jeu).
  await waitFor(t, () => window.__xr2d.scene.player.invulnMs <= 0, { timeout: 3000, interval: 30, label: 'fin de l’invulnérabilité après le bouclier' });
  await walkerHit(t, walker, () => document.querySelectorAll('.hud-hearts .hud-heart:not(.is-empty)').length === 2, 'coup suivant : un cœur perdu');
  await t.ev(() => window.__xr2d.god(true));

  // --- HUD : arme, deux anneaux et bouclier, 53 cristaux (pastille des stats la plus large), de 844 à 621 px
  // de large (sous 620 px, la jauge passe à droite : voir small-screens) ; captures à 844x390 et 640x320.
  await placeKaiRight(t, 3, 11, 'HUD');
  await readyGun(t, 'rifle', 'HUD');
  for (const k of ['speed', 'rapid', 'shield']) await power(t, k);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    s.crystals = s.parsed.crystalsTotal;
    s.hud.set('crystals', s.crystals);
  });
  await t.key('KeyJ', 30);
  await t.wait(1600); // messages des bonus partis
  for (const [w, h, shot] of [
    [844, 390, true],
    [700, 340, false],
    [667, 375, false],
    [640, 320, true],
    [621, 320, false],
  ]) {
    await t.page.setViewportSize({ width: w, height: h });
    await t.wait(400);
    hud = await hudGun(t);
    assertEq(hud.powers, ['speed', 'rapid', 'shield'], `HUD ${w}x${h} : trois anneaux`);
    assertEq(hud.ending, [], `HUD ${w}x${h} : bonus frais, aucun anneau qui clignote`);
    assertEq(hud.weapon, 'rifle', `HUD ${w}x${h} : icône du fusil`);
    const crys = await t.ev(() => document.querySelector('.hud-crystals').textContent.replace(/\s+/g, ''));
    assert(/^53\/53$/.test(crys), `HUD ${w}x${h} : 53 cristaux affichés (${crys})`);
    const list = [];
    for (const [name, sel] of [
      ['jauge', '.hud-heat'],
      ['bonus', '.hud-powers'],
      ['pause', '.hud-pause'],
      ['vies', '.hud-platform .hud-stats'],
    ]) {
      const r = await rects(t, sel);
      assertEq(r.length, 1, `HUD ${w}x${h} : ${sel} visible`);
      list.push({ name, r: r[0] });
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        assert(!overlaps(list[i].r, list[j].r), `HUD ${w}x${h} : ${list[i].name} et ${list[j].name} se chevauchent (${fmt(list[i].r)} / ${fmt(list[j].r)})`);
      }
    }
    if (shot) await t.shot(`hud-${w}x${h}`);
  }
  await t.page.setViewportSize({ width: 844, height: 390 });

  // --- Vie perdue (arme chaude, bonus actifs) : plus aucun bonus, jauge à zéro, le double saut reste
  await readyGun(t, 'rifle', 'vie perdue');
  await t.key('KeyJ', 30);
  await waitFor(t, () => window.__xr2d.info().heat > 0.1, { timeout: 2000, interval: 20, label: 'vie perdue : arme chaude avant la mort' });
  await waitFor(t, () => {
    const g = document.querySelector('.hud-heat .heat-grad');
    return !!g && Number(g.style.getPropertyValue('--heat-off')) < 1;
  }, { timeout: 1000, interval: 20, label: 'vie perdue : jauge du HUD remplie avant la mort' });
  g = await gun2d(t);
  assert(g.speedLeftMs > 0 && g.rapidLeftMs > 0 && g.shield && g.speedMul === SPEED_MUL, `vie perdue : bonus actifs avant la mort (${fmt(g)})`);
  await t.ev(() => window.__xr2d.kill());
  await waitFor(t, () => window.__xr2d.scene.state === 'dead', { timeout: 2000, interval: 20, label: 'Kaï meurt' });
  g = await gun2d(t);
  assert(g.speedLeftMs === 0 && g.rapidLeftMs === 0 && !g.shield && g.heat === 0 && g.speedMul === 1, `vie perdue : plus aucun bonus (${fmt(g)})`);
  await waitFor(t, () => document.querySelectorAll('.hud-powers .hud-power.is-on').length === 0, { timeout: 1000, interval: 30, label: 'vie perdue : anneaux éteints' });
  await waitFor(t, () => {
    const g = document.querySelector('.hud-heat .heat-grad');
    const h = document.querySelector('.hud-heat');
    return g.style.getPropertyValue('--heat-off').trim() === '1' && !h.classList.contains('is-over');
  }, { timeout: 1000, interval: 30, label: 'vie perdue : jauge du HUD vide' });
  await waitFor2dPlay(t, { timeout: 8000 });
  g = await gun2d(t);
  assert(g.canDoubleJump && g.speedLeftMs === 0 && !g.shield, `réapparition : double saut gardé, pas de bonus (${fmt(g)})`);

  // --- Blocs bonus de la Jungle : vitesse (bloc 1) puis cadence (bloc 3), ramassés
  await removeEnemies(t, []);
  await bumpBlock(t, 28, 8, 'speed', 'jungle-speed-block');
  let col = await pickUp(t, 'speed');
  await placeKai(t, col, 11, 'ramassage de la vitesse');
  await waitFor(t, () => window.__xr2d.info().speedLeftMs > 0, { timeout: 2000, interval: 30, label: 'bonus de vitesse ramassé' });
  await bumpBlock(t, 152, 8, 'rapid', 'jungle-rapid-block');
  col = await pickUp(t, 'rapid');
  await placeKai(t, col, 11, 'ramassage de la cadence');
  await waitFor(t, () => window.__xr2d.info().rapidLeftMs > 0, { timeout: 2000, interval: 30, label: 'bonus de cadence ramassé' });
  await waitRings(t, ['speed', 'rapid'], 'blocs ramassés : deux anneaux au HUD');

  // --- Lune : blocs « ? » des colonnes 13 et 30 changés en vitesse et cadence (la Lune n'en a pas)
  await t.goto('?touch=0&unlock=1&stage=m1');
  await waitFor2dPlay(t);
  await t.ev(() => {
    window.__xr2d.god(true);
    const p = window.__xr2d.scene.parsed;
    p.bonus.set(8 * p.cols + 13, 'speed');
    p.bonus.set(8 * p.cols + 30, 'rapid');
  });
  await bumpBlock(t, 13, 8, 'speed', 'moon-speed-block');
  await bumpBlock(t, 30, 8, 'rapid', 'moon-rapid-block');
}
