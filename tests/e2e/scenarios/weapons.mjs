// Armes de Kaï (plan 02, aides DEV), Jungle (j1) :
//  Arme de la session : plus de ligne « Arme » sur la carte d'intro (retirée au plan 03), ni hors mode test
//  (laser, pas de double saut) ni en mode test (laser, double saut) ; au hangar en mode test, une arme non
//  possédée (mitrailleur) équipée pour la session est celle de la partie (HUD, bras) et le reste (Quitter puis
//  JOUER, puis une autre étape : Lune m1), sans être enregistrée (sauvegarde v2 : laser seul ; oubliée au
//  rechargement) ; sortie du mode test (Options) : arme oubliée, laser ; ?weapon= inconnu : message et laser.
//  Équipement de la sauvegarde (bloc loadout) hors mode test : ancienne sauvegarde sans loadout (valeurs par
//  défaut, progression gardée, migrée en version 2), arme possédée équipée et double saut appris, valeurs
//  abîmées (laser seul), ?weapon= hors mode test (arme imposée, sauvegarde inchangée).
//  Pour chaque arme (?weapon=) : arme de la partie, icône et graduations de la jauge, texture du bras ;
//  projectiles par appui (1, 1, 5, rafale de 3), vitesse (plombs : ± 8 %), dégâts, portée (distance finale,
//  à un sous-pas près), déplacement réel à cette vitesse, éventail de la pompe, dispersion du mitrailleur
//  (réelle sur 17 balles, nulle pour le laser et le fusil), écart des balles de la rafale, son du tir (un par
//  appui, trois par rafale) ; tirs vers le haut, en diagonale et accroupi ; chauffe d'un appui, chauffe gardée
//  jusqu'au délai de refroidissement puis en baisse ; appuis avant surchauffe (5, 17, 3, 4 rafales),
//  SURCHAUFFE au HUD, refroidissement par seconde de l'arme, reprise du tir sous 30 % ; appuis pour éliminer
//  un marcheur (1, 2, 1, 1) et un blindé (2, 4, 1 au contact, 1 rafale). Changement d'arme en cours de partie
//  (__xr2d.weapon) : bras et HUD suivent.
//  Captures : Kaï et chaque arme (devant, haut, diagonale, accroupi), tirs en vol.
import { assert, assertEq, assertNear, fmt, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import {
  enemy2d,
  freeze2d,
  gameClock,
  gun2d,
  hudGun,
  kaiShot,
  moveEnemy,
  parkEnemy,
  placeKai,
  placeKaiRight,
  readyGun,
  recordShots,
  removeEnemies,
  shotAngle,
  shotLog,
  waitGunIdle,
} from '../lib/game2d.mjs';
import { SEEN_STORY, STORY_MARKS, pickStage, press, recordToasts, seedSave, toasts, waitPause, pressPause } from '../lib/core.mjs';
import { waitIntroCard } from '../lib/shell.mjs';

export const meta = {
  title: 'Armes : arme de la session, projectiles, portée, visée, surchauffe, dégâts (laser, mitrailleur, pompe, fusil)',
  suites: ['full'],
  dev: true,
  timeoutMs: 420000,
};

/**
 * Valeurs attendues (src/core/weapons.ts, docs/plans/02-armes.md) : projectiles par appui, dégâts par
 * projectile, portée (px), vitesse (px/s) et son écart d'un plomb à l'autre (jitter, part de la vitesse),
 * dispersion (°), écart des balles d'une rafale (ms), chauffe d'un appui, refroidissement (par seconde) et
 * délai avant refroidissement hors surchauffe (ms), son du tir, graduations de la jauge, appuis avant
 * surchauffe, appuis pour éliminer un marcheur et un blindé.
 */
const SPECS = {
  laser: { name: 'Pistolet laser', per: 1, damage: 2, range: 576, speed: 900, jitter: 0, spread: 0, gap: 0, heat: 0.2, cool: 0.45, coolDelay: 260, sfx: 'laser', sfxPer: 1, step: '20.00%', overheat: 5, walker: 1, armored: 2 },
  machinegun: { name: 'Mitrailleur', per: 1, damage: 1, range: 448, speed: 1000, jitter: 0, spread: 3, gap: 0, heat: 0.06, cool: 0.5, coolDelay: 260, sfx: 'machinegun', sfxPer: 1, step: '10.00%', overheat: 17, walker: 2, armored: 4 },
  shotgun: { name: 'Pompe', per: 5, damage: 1, range: 256, speed: 1100, jitter: 0.08, spread: 14, gap: 0, heat: 0.34, cool: 0.5, coolDelay: 700, sfx: 'shotgun', sfxPer: 1, step: '34.00%', overheat: 3, walker: 1, armored: 1 },
  rifle: { name: "Fusil d'assaut", per: 3, damage: 2, range: 768, speed: 1400, jitter: 0, spread: 0, gap: 70, heat: 0.25, cool: 0.4, coolDelay: 550, sfx: 'rifle', sfxPer: 3, step: '25.00%', overheat: 4, walker: 1, armored: 1 },
};
const IDS = Object.keys(SPECS);
const ENEMY_NAME = { w: 'un marcheur', a: 'un blindé' };
/** Reprise du tir après une surchauffe (OVERHEAT_RECOVER_AT). */
const RECOVER_AT = 0.3;
/** Haut du sol de la Jungle sous Kaï (ligne 12, px). */
const GROUND_Y = 12 * 64;
const DEFAULT_LOADOUT = { equipped: 'laser', owned: ['laser'], skills: { doubleJump: false } };
const SAVE_KEY = 'xeno-rift-save-v1';

const kb = (t) => t.page.keyboard;
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const INTRO = '.screens [data-screen="intro"].is-active';
const OPTIONS = '.screens [data-screen="options"].is-active';
const HANGAR = '.screens [data-screen="hangar"].is-active';

/** Tir dont la direction est la plus proche de l'horizontale (plomb du milieu, balle la moins dispersée). */
const flattest = (list) => list.reduce((b, r) => (Math.abs(shotAngle(r)) < Math.abs(shotAngle(b)) ? r : b));

/** Attend `n` tirs partis depuis `t0` (heure du jeu), tous éteints, et les renvoie. */
function waitShotsDone(t, t0, n, label) {
  return waitFor(
    t,
    ([a, k]) => {
      const l = window.__xrShots.list.filter((r) => r.at >= a);
      return l.length >= k && l.every((r) => r.end !== null) ? l : false;
    },
    { timeout: 3000, interval: 40, label, arg: [t0, n] },
  );
}

/** Angles des tirs (°), triés. */
const anglesOf = (list) => list.map(shotAngle).sort((a, b) => a - b);

/** Vérifie la direction des tirs d'un appui autour de `base` (°) selon la dispersion de l'arme. */
function assertAim(list, S, base, label) {
  const angles = anglesOf(list);
  const txt = angles.map((a) => r1(a)).join('°, ');
  if (S.per === 5) {
    // Pompe : éventail régulier de 5 plombs sur ± 14°.
    [-14, -7, 0, 7, 14].forEach((d, i) => assertNear(angles[i], base + d, 0.6, `${label} : éventail ${txt}°`));
  } else {
    for (const a of angles) assert(Math.abs(a - base) <= S.spread + 0.6, `${label} : tir à ${r1(a)}° pour ${base}° ± ${S.spread} (${txt}°)`);
  }
  return txt;
}

// ---------------------------------------------------------------- Arme de la session (hangar en mode test)

/** Carte d'intro active : plus de ligne Arme (l'arme se choisit au hangar, plan 03). */
async function assertNoIntroWeapon(t, label) {
  const st = await t.ev((sel) => {
    const s = document.querySelector(sel);
    return s ? { row: !!s.querySelector('.intro-weapon'), weapon: s.dataset.weapon || null } : null;
  }, INTRO);
  assert(st && !st.row && !st.weapon, `${label} : pas de ligne Arme sur la carte d'intro (${fmt(st)})`);
}

/** Partie en cours : Pause puis Quitter (retour à l'accueil). */
async function quitToTitle(t) {
  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Quitter');
  await waitForScreen(t, 'title');
}

/** Accueil → Niveaux → Hangar (ouvert sans départ). */
async function openHangar(t) {
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  await t.page.locator('.screens [data-screen="select"].is-active .select-hangar').click({ timeout: 5000 });
  await waitForScreen(t, 'hangar');
}

/** Partie 2D jouable avec l'arme `id` : arme du jeu, icône du HUD, bras armé. */
async function assertPlayWeapon(t, id, label) {
  const g = await gun2d(t);
  assertEq(g.weapon, id, `${label} : arme de la partie`);
  await waitFor(t, (w) => document.querySelector('.hud-heat').dataset.weapon === w, { timeout: 1000, interval: 30, label: `${label} : icône du HUD sur ${id}`, arg: id });
  assertEq(await t.ev(() => window.__xr2d.scene.player.arm.texture.key), `arm-${id}`, `${label} : bras armé`);
}

async function sessionWeapon(t) {
  // --- Hors mode test : pas de ligne Arme, laser, pas de double saut
  await t.goto('?touch=0');
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  await assertNoIntroWeapon(t, 'hors mode test');
  await waitFor2dPlay(t);
  let g = await gun2d(t);
  assert(g.weapon === 'laser' && !g.canDoubleJump, `hors mode test : laser, sans double saut (${fmt(g)})`);
  assertEq((await hudGun(t)).weapon, 'laser', 'hors mode test : icône du HUD');

  // --- Mode test : pas de ligne Arme non plus (retirée), laser et double saut
  await t.goto('?touch=0&unlock=1');
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  await assertNoIntroWeapon(t, 'mode test');
  await waitFor2dPlay(t);
  g = await gun2d(t);
  assert(g.weapon === 'laser' && g.canDoubleJump, `mode test : laser et double saut (${fmt(g)})`);

  // --- Hangar en mode test : le mitrailleur (non possédé) est équipé pour la session seulement
  await quitToTitle(t);
  await openHangar(t);
  await t.page.locator(`${HANGAR} .hg-weapon[data-weapon="machinegun"]`).click({ timeout: 5000 });
  await t.page.locator(`${HANGAR} [data-equip="machinegun"]`).click({ timeout: 5000 });
  await waitFor(
    t,
    (sel) => {
      const b = document.querySelector(`${sel} [data-equip="machinegun"]`);
      return !!b && b.getAttribute('aria-pressed') === 'true';
    },
    { timeout: 2000, interval: 30, label: 'hangar : mitrailleur équipé', arg: HANGAR },
  );
  let sh = await t.ev(() => window.__xrShell.info());
  assert(sh.weapon === 'machinegun' && sh.loadout.equipped === 'machinegun', `hangar : arme de la session (${fmt({ weapon: sh.weapon, loadout: sh.loadout })})`);
  await waitFor(t, (sel) => /Équipé pour cette session \(mode test\)/.test((document.querySelector(`${sel} .hg-msg.is-on`) || {}).textContent || ''), {
    timeout: 2000,
    label: 'message « Équipé pour cette session (mode test) » dans le hangar',
    arg: HANGAR,
  });
  // ?unlock=1 enregistre la sauvegarde (version 2, avec son bloc loadout) : l'arme de la session n'y est pas.
  let save = await readSave(t);
  t.log(`sauvegarde après l'équipement de session : ${fmt(save && save.loadout)}`);
  assert(
    save && save.version === 2 && save.loadout && save.loadout.equipped === 'laser' && save.loadout.owned.join() === 'laser',
    `arme de la session : la sauvegarde garde le laser seul (${fmt(save && { version: save.version, loadout: save.loadout })})`,
  );
  await t.key('Escape', 60);
  await waitForScreen(t, 'select');
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // --- JOUER : la partie prend l'arme de la session
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  await assertNoIntroWeapon(t, 'arme de la session');
  await waitFor2dPlay(t);
  await assertPlayWeapon(t, 'machinegun', 'arme de la session');
  assert((await gun2d(t)).canDoubleJump, 'mode test : double saut');

  // --- Autre étape (Lune, m1) : l'arme est gardée d'un niveau à l'autre
  await quitToTitle(t);
  await press(t, 'title', 'Niveaux');
  await pickStage(t, 'm1');
  await waitIntroCard(t);
  await waitFor2dPlay(t);
  assertEq(await t.ev(() => window.__xrShell.info().run.stage), 'm1', 'partie de la Lune lancée');
  await assertPlayWeapon(t, 'machinegun', 'Lune (m1)');

  // --- Sortie du mode test (Options) : l'arme de la session est oubliée, retour au laser
  await quitToTitle(t);
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  await t.page.locator(`${OPTIONS} .toggle--unlockAll`).click({ timeout: 5000 });
  await waitFor(t, (sel) => document.querySelector(`${sel} .toggle--unlockAll`).getAttribute('aria-checked') === 'false', {
    timeout: 2000,
    interval: 30,
    label: '« Tout débloquer » décoché',
    arg: OPTIONS,
  });
  assertEq(await t.ev(() => window.__xrShell.info().weapon), null, 'mode test quitté : plus d’arme imposée pour la session');
  await t.key('Escape', 60);
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  await waitFor2dPlay(t);
  await assertPlayWeapon(t, 'laser', 'mode test quitté');
  assert(!(await gun2d(t)).canDoubleJump, 'mode test quitté : plus de double saut');

  // --- Rechargement en mode test : l'arme de l'ancienne session est oubliée (laser)
  await t.goto('?touch=0&unlock=1');
  await waitForScreen(t, 'title');
  sh = await t.ev(() => window.__xrShell.info());
  assert(sh.weapon === null && sh.loadout.equipped === 'laser', `rechargement : pas d’arme imposée pour la session (${fmt({ weapon: sh.weapon, loadout: sh.loadout })})`);

  // --- Vol en mode test : pas de ligne Arme
  await press(t, 'title', 'Niveaux');
  await pickStage(t, 'f1');
  await waitIntroCard(t);
  await assertNoIntroWeapon(t, 'vol (f1) en mode test');

  // --- ?weapon= inconnu : message, laser
  await t.goto('?touch=0&unlock=1&stage=j1&weapon=bazooka');
  await waitFor2dPlay(t);
  assertEq((await gun2d(t)).weapon, 'laser', '?weapon=bazooka : laser');
  await waitFor(t, () => (window.__xrToasts || []).some((m) => /Arme inconnue : bazooka/.test(m.text)), { timeout: 3000, label: 'message « Arme inconnue : bazooka »' });
  t.log(`messages : ${(await toasts(t)).map((m) => m.text).join(' | ')}`);
}

// ---------------------------------------------------------------- Équipement de la sauvegarde (hors mode test)

/** Remplace la sauvegarde (localStorage), prise en compte au prochain t.goto. */
function putSave(t, save) {
  return t.ev(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [SAVE_KEY, save]);
}

/** Équipement effectif de la partie en cours (ModeHooks.loadout, via __xrShell). */
function runLoadout(t) {
  return t.ev(() => window.__xrShell.info().loadout);
}

async function savedLoadout(t) {
  // --- Ancienne sauvegarde sans bloc loadout : laser seul, pas de double saut ; progression gardée
  await putSave(t, { version: 1, unlocked: 2, best: { j1: { score: 10, stars: 3 } }, settings: {} });
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  assertEq(await runLoadout(t), DEFAULT_LOADOUT, 'ancienne sauvegarde : équipement par défaut');
  await assertPlayWeapon(t, 'laser', 'ancienne sauvegarde');
  assert(!(await gun2d(t)).canDoubleJump, 'ancienne sauvegarde : pas de double saut');
  // ?unlock=1 réécrit la sauvegarde, migrée en version 2 (plan 03) : progression conservée, bloc loadout par défaut
  // ajouté (le mode test n'y est pas), réserve vide.
  await t.goto('?touch=0&unlock=1');
  await waitForScreen(t, 'title');
  let save = await readSave(t);
  t.log(`ancienne sauvegarde réécrite : ${fmt({ version: save.version, unlocked: save.unlocked, best: save.best, loadout: save.loadout, crystals: save.crystals })}`);
  assert(save.version === 2 && save.crystals === 0, `ancienne sauvegarde : migrée en version 2, réserve vide (${fmt(save)})`);
  assert(save.unlocked === 2 && save.best.j1 && save.best.j1.score === 10 && save.best.j1.stars === 3, `ancienne sauvegarde : progression conservée (${fmt(save)})`);
  assertEq(save.loadout, DEFAULT_LOADOUT, 'ancienne sauvegarde réécrite : bloc loadout par défaut');

  // --- Arme possédée équipée et double saut appris : repris hors mode test, sans ligne Arme sur la carte
  // (prologue déjà vu : JOUER mène à la carte d'intro)
  await putSave(t, {
    version: 1,
    unlocked: 0,
    best: {},
    settings: {},
    loadout: { equipped: 'rifle', owned: ['laser', 'rifle'], skills: { doubleJump: true } },
    story: { seen: STORY_MARKS },
  });
  await t.goto('?touch=0');
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  await assertNoIntroWeapon(t, 'sauvegarde avec le fusil');
  await waitFor2dPlay(t);
  assertEq(await runLoadout(t), { equipped: 'rifle', owned: ['laser', 'rifle'], skills: { doubleJump: true } }, 'sauvegarde avec le fusil : équipement de la partie');
  await assertPlayWeapon(t, 'rifle', 'sauvegarde avec le fusil');
  assert((await gun2d(t)).canDoubleJump, 'sauvegarde : double saut appris, hors mode test');

  // --- Valeurs abîmées : arme équipée non possédée, armes inconnues, compétence qui n'est pas un booléen
  await putSave(t, { version: 1, unlocked: 0, best: {}, settings: {}, loadout: { equipped: 'shotgun', owned: ['bazooka', 'laser'], skills: { doubleJump: 'oui' } } });
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  assertEq(await runLoadout(t), DEFAULT_LOADOUT, 'arme équipée non possédée : laser seul, pas de double saut');
  await assertPlayWeapon(t, 'laser', 'arme équipée non possédée');
  await putSave(t, { version: 1, unlocked: 0, best: {}, settings: {}, loadout: { equipped: 'bazooka', owned: 'x', skills: null } });
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  assertEq(await runLoadout(t), DEFAULT_LOADOUT, 'loadout abîmé : équipement par défaut');
  await assertPlayWeapon(t, 'laser', 'loadout abîmé');

  // --- ?weapon= hors mode test : arme imposée (même non possédée), sauvegarde inchangée
  await putSave(t, { version: 1, unlocked: 0, best: {}, settings: {}, loadout: DEFAULT_LOADOUT });
  await t.goto('?touch=0&stage=j1&weapon=rifle');
  await waitFor2dPlay(t);
  assertEq(await runLoadout(t), { equipped: 'rifle', owned: ['laser', 'rifle'], skills: { doubleJump: false } }, '?weapon=rifle hors mode test : équipement de la partie');
  await assertPlayWeapon(t, 'rifle', '?weapon=rifle hors mode test');
  save = await readSave(t);
  assertEq(save.loadout, DEFAULT_LOADOUT, '?weapon=rifle : la sauvegarde garde le laser seul');
  assert(!save.settings.unlockAll, `?weapon=rifle : mode test toujours désactivé (${fmt(save.settings)})`);

  await t.ev((k) => localStorage.removeItem(k), SAVE_KEY);
}

// ---------------------------------------------------------------- Une arme

/** Sons joués depuis le dernier vidage (window.__sfxLog, voir recordSfx) : nombre de chaque identifiant. */
async function sfxCounts(t) {
  const log = await t.ev(() => window.__sfxLog.slice());
  const n = {};
  for (const id of log) n[id] = (n[id] || 0) + 1;
  return n;
}

/**
 * Journal des sons d'effet : AudioApi.sfx de la coquille (le même objet que hooks.audio, méthode relue à chaque
 * son par la session 2D) enveloppée pour noter chaque identifiant dans window.__sfxLog.
 */
function recordSfx(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    const orig = a.sfx;
    window.__sfxLog = [];
    a.sfx = function (id, opts) {
      window.__sfxLog.push(id);
      return orig.call(this, id, opts);
    };
  });
}

/**
 * Tirs d'un appui droit devant : nombre, vitesse, dégâts, portée, dispersion, rafale, son ; capture des tirs
 * en vol. Renvoie la hauteur de la bouche du canon (y0 du tir le plus horizontal).
 */
async function front(t, id, S) {
  await placeKaiRight(t, 3, 11, `${id} devant`);
  await readyGun(t, id, `${id} devant`);
  await kaiShot(t, `${id}-front`);
  await t.ev(() => {
    window.__sfxLog.length = 0;
  });
  const t0 = await gameClock(t);
  await t.key('KeyJ', 30);
  await t.wait(S.gap ? 150 : 40);
  // Image figée le temps de lire la chauffe et de capturer les tirs en vol (les plombs vivent 0,2 s).
  await freeze2d(t, true);
  const heat = (await gun2d(t)).heat;
  await kaiShot(t, `${id}-shots`, { w: 560, h: 150, dy: -24, dx: 230, zoom: 2 });
  await freeze2d(t, false);
  await waitShotsDone(t, t0, S.per, `${id} : ${S.per} projectile(s) partis puis éteints`);
  await waitGunIdle(t, `${id} devant`);
  const list = await shotLog(t, t0);
  assertEq(list.length, S.per, `${id} : projectiles par appui`);
  assertNear(heat, S.heat, 0.011, `${id} : chauffe d'un appui`);
  const txt = assertAim(list, S, 0, `${id} devant`);
  const travel = [];
  for (const r of list) {
    assertEq(r.weapon, id, `${id} : arme du projectile`);
    const v = Math.hypot(r.vx, r.vy);
    const vMin = S.speed * (1 - S.jitter) - 1;
    const vMax = S.speed * (1 + S.jitter) + 1;
    assert(v >= vMin && v <= vMax, `${id} : vitesse du projectile ${r1(v)} px/s (${S.speed}${S.jitter ? ` ± ${S.jitter * 100} %` : ''} attendus)`);
    assertNear(r.damage, S.damage, 1e-6, `${id} : dégâts par projectile`);
    assertNear(r.range, S.range, 0.5, `${id} : portée de la fiche`);
    // Déplacement réel à cette vitesse, de la première image vue à la disparition (à une image de 50 ms près).
    const moved = r.dist - r.dist0;
    const expect = ((r.end - r.at) / 1000) * v;
    assert(moved <= expect + 1 && moved >= expect - v * 0.05 - 1, `${id} : ${r1(moved)} px parcourus en ${r1(r.end - r.at)} ms à ${r1(v)} px/s (${r1(expect)} px attendus)`);
    // Tirs qui atteignent leur portée sans toucher le sol (pointe comprise) : distance finale = portée, au
    // sous-pas de 14 px près ; les plombs les plus bas de la pompe touchent le sol avant.
    if (r.y0 + (r.vy / v) * (S.range + 30) < GROUND_Y) {
      travel.push(Math.round(r.dist));
      assert(r.dist >= S.range - 0.5 && r.dist <= S.range + 15, `${id} : distance parcourue ${r1(r.dist)} px pour une portée de ${S.range} px`);
    }
  }
  assert(travel.length > 0, `${id} : au moins un tir mesuré jusqu'à sa portée (${fmt(list.map((r) => ({ y0: r1(r.y0), vy: r1(r.vy), dist: r1(r.dist) })))})`);
  if (S.gap) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].at - list[i - 1].at;
      assert(gap >= S.gap - 20 && gap <= S.gap + 30, `${id} : écart de ${r1(gap)} ms entre deux balles de la rafale (${S.gap} ms attendus)`);
    }
  }
  // Son de l'arme : un par appui (pompe : un pour les 5 plombs), un par balle de rafale ; jamais celui du laser
  // pour une autre arme.
  const sfx = await sfxCounts(t);
  assertEq(sfx[S.sfx] || 0, S.sfxPer, `${id} : sons « ${S.sfx} » pour un appui (${fmt(sfx)})`);
  if (id !== 'laser') assert(!sfx.laser, `${id} : aucun son de laser (${fmt(sfx)})`);
  const y0 = flattest(list).y0;
  t.log(`${id} devant : ${list.length} projectile(s) à ${txt}°, parcours ${travel.join(', ')} px (portée ${S.range}), chauffe ${r1(heat * 100)} %, bouche y ${r1(y0)}, sons ${fmt(sfx)}`);
  return y0;
}

/** Visée haute puis diagonale : un appui, direction des tirs ; captures de Kaï. */
async function aims(t, id, S) {
  await placeKai(t, 3, 11, `${id} haut`);
  await readyGun(t, id, `${id} haut`);
  await kb(t).down('ArrowUp');
  await waitFor(t, () => window.__xr2d.scene.player.aim === 'up', { timeout: 1000, interval: 30, label: `${id} : visée haute` });
  await t.wait(150);
  await kaiShot(t, `${id}-up`, { h: 220, dy: -60 });
  let t0 = await gameClock(t);
  await t.key('KeyJ', 30);
  let list = await waitShotsDone(t, t0, S.per, `${id} haut : ${S.per} projectile(s)`);
  await kb(t).up('ArrowUp');
  assertEq(list.length, S.per, `${id} haut : projectiles par appui`);
  const up = assertAim(list, S, 90, `${id} haut`);

  await placeKai(t, 3, 11, `${id} diagonale`);
  await readyGun(t, id, `${id} diagonale`);
  await kb(t).down('ArrowRight');
  await kb(t).down('ArrowUp');
  await waitFor(t, () => window.__xr2d.scene.player.aim === 'diag', { timeout: 1000, interval: 30, label: `${id} : visée diagonale` });
  await t.wait(150);
  await kaiShot(t, `${id}-diag`, { h: 200, dy: -45 });
  t0 = await gameClock(t);
  await t.key('KeyJ', 30);
  // Visée gardée jusqu'au départ de tous les tirs de l'appui (rafale comprise, heure du jeu).
  await waitFor(t, ([a, k]) => window.__xrShots.list.filter((r) => r.at >= a).length >= k, {
    timeout: 2000,
    interval: 20,
    label: `${id} diagonale : ${S.per} projectile(s) partis`,
    arg: [t0, S.per],
  });
  await kb(t).up('ArrowUp');
  await kb(t).up('ArrowRight');
  list = await waitShotsDone(t, t0, S.per, `${id} diagonale : ${S.per} projectile(s)`);
  assertEq(list.length, S.per, `${id} diagonale : projectiles par appui`);
  const diag = assertAim(list, S, 45, `${id} diagonale`);
  t.log(`${id} : haut ${up}°, diagonale ${diag}°`);
}

/** Accroupi : tir à l'horizontale, bouche du canon plus basse que debout (`standY`) ; capture. */
async function crouch(t, id, S, standY) {
  await placeKaiRight(t, 3, 11, `${id} accroupi`);
  await readyGun(t, id, `${id} accroupi`);
  await kb(t).down('ArrowDown');
  await waitFor(t, () => window.__xr2d.scene.player.crouching && window.__xr2d.scene.player.body.height === 46, { timeout: 1000, interval: 30, label: `${id} : accroupi` });
  await t.wait(200);
  await kaiShot(t, `${id}-crouch`);
  const t0 = await gameClock(t);
  await t.key('KeyJ', 30);
  const list = await waitShotsDone(t, t0, S.per, `${id} accroupi : ${S.per} projectile(s)`);
  await kb(t).up('ArrowDown');
  assertAim(list, S, 0, `${id} accroupi`);
  const y = flattest(list).y0;
  // Poses PNG de Kaï : épaule accroupie ≈ 9 px sous celle de la pose debout (19 px avec le Kaï dessiné).
  assert(y > standY + 6, `${id} : tir accroupi plus bas que debout (bouche du canon y ${r1(y)} / ${r1(standY)})`);
}

/**
 * Chauffe de l'arme relevée à chaque image (window.__xrHeat) : samples [{ at, heat, over }] et `recover` (chauffe
 * et heure à l'image où la surchauffe prend fin).
 */
function watchHeat(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    if (window.__xrHeat && window.__xrHeat.off) window.__xrHeat.off();
    const r = (window.__xrHeat = { samples: [], over: s.gun.overheated, recover: null });
    const f = () => {
      const g = s.gun;
      r.samples.push({ at: s.clockMs, heat: g.heat, over: g.overheated });
      if (r.over && !g.overheated && !r.recover) r.recover = { heat: g.heat, at: s.clockMs };
      r.over = g.overheated;
    };
    s.events.on('postupdate', f);
    r.off = () => s.events.off('postupdate', f);
  });
}

/** Relevés de watchHeat (arrête le relevé). */
const heatSamples = (t) =>
  t.ev(() => {
    window.__xrHeat.off();
    return window.__xrHeat.samples;
  });

/**
 * Tir maintenu jusqu'à la surchauffe : nombre d'appuis (rafales comprises), dispersion des balles, SURCHAUFFE
 * au HUD ; refroidissement par seconde en surchauffe, reprise du tir sous 30 %. Puis hors surchauffe : chauffe
 * d'un appui gardée jusqu'au délai de refroidissement de l'arme, puis en baisse.
 */
async function overheat(t, id, S) {
  await placeKaiRight(t, 3, 11, `${id} surchauffe`);
  await readyGun(t, id, `${id} surchauffe`);
  await watchHeat(t);
  const t0 = await gameClock(t);
  await kb(t).down('KeyJ');
  try {
    await waitFor(t, () => window.__xr2d.info().overheated, { timeout: 6000, interval: 20, label: `${id} : surchauffe en tir maintenu` });
  } finally {
    await kb(t).up('KeyJ');
  }
  await waitFor(t, () => {
    const h = document.querySelector('.hud-heat');
    return !!h && h.classList.contains('is-over');
  }, { timeout: 1000, interval: 30, label: `${id} : SURCHAUFFE au HUD` });
  await waitGunIdle(t, `${id} surchauffe`); // fin d'une rafale commencée
  const list = await shotLog(t, t0);
  const pulls = list.length / S.per;
  t.log(`${id} : surchauffe après ${pulls} appui(s) (${list.length} projectiles)`);
  assertEq(pulls, S.overheat, `${id} : appuis avant surchauffe`);
  assert((await gun2d(t)).overheated, `${id} : toujours en surchauffe juste après`);

  // Dispersion réelle : mitrailleur, balles étalées dans ± 3° ; laser et fusil, toutes dans l'axe.
  if (S.per === 1 || S.gap) {
    const angles = list.map(shotAngle);
    const lo = Math.min(...angles);
    const hi = Math.max(...angles);
    for (const x of angles) assert(Math.abs(x) <= S.spread + 0.6, `${id} : tir à ${r1(x)}° pour 0° ± ${S.spread}°`);
    if (S.spread > 0) assert(hi - lo > S.spread * 0.5, `${id} : dispersion de ${r1(hi - lo)}° sur ${angles.length} balles (± ${S.spread}° attendus)`);
    else assert(hi - lo < 0.2, `${id} : ${angles.length} balles dans l'axe (écart ${r3(hi - lo)}°)`);
    t.log(`${id} : angles de ${r1(lo)}° à ${r1(hi)}° sur ${angles.length} balles`);
  }

  // Fin de la surchauffe juste sous 30 % (à une image de 50 ms près).
  await waitFor(t, () => !window.__xr2d.info().overheated, { timeout: 4000, interval: 30, label: `${id} : fin de la surchauffe` });
  const rec = await t.ev(() => window.__xrHeat.recover);
  const over = (await heatSamples(t)).filter((p) => p.over);
  assert(rec && rec.heat < RECOVER_AT && rec.heat > RECOVER_AT - S.cool * 0.05 - 1e-6, `${id} : surchauffe finie à ${rec && r3(rec.heat)} (sous ${RECOVER_AT})`);
  // Refroidissement en surchauffe : immédiat (de 100 % à l'image de la surchauffe), à la vitesse de l'arme.
  const a = over[0];
  const b = over[over.length - 1];
  assert(a && a.heat === 1 && b.at - a.at >= 300, `${id} : surchauffe relevée image par image (${fmt({ a, b, n: over.length })})`);
  const rate = (a.heat - b.heat) / ((b.at - a.at) / 1000);
  t.log(`${id} : refroidissement ${r3(rate)} / s en surchauffe (${S.cool} attendus), fin à ${r3(rec.heat)}`);
  assertNear(rate, S.cool, 0.01, `${id} : refroidissement par seconde en surchauffe`);
  // Le tir reprend.
  await waitFor(t, () => !document.querySelector('.hud-heat').classList.contains('is-over'), { timeout: 1000, interval: 30, label: `${id} : SURCHAUFFE retiré du HUD` });
  let t1 = await gameClock(t);
  await t.key('KeyJ', 30);
  await waitShotsDone(t, t1, S.per, `${id} : le tir reprend après la surchauffe`);

  // Hors surchauffe : la chauffe d'un appui reste entière jusqu'au délai de refroidissement, puis baisse.
  await readyGun(t, id, `${id} refroidissement`);
  await watchHeat(t);
  t1 = await gameClock(t);
  await t.key('KeyJ', 30);
  await waitShotsDone(t, t1, S.per, `${id} : un appui`);
  const last = Math.max(...(await shotLog(t, t1)).map((r) => r.at));
  await waitFor(t, (at) => window.__xr2d.scene.clockMs >= at, { timeout: 4000, interval: 30, label: `${id} : délai de refroidissement passé`, arg: last + S.coolDelay + 250 });
  const samples = await heatSamples(t);
  const before = samples.filter((p) => p.at >= last && p.at <= last + S.coolDelay - 50);
  const after = samples.filter((p) => p.at >= last + S.coolDelay + 100);
  assert(before.length > 0 && after.length > 0, `${id} : chauffe relevée avant et après le délai (${samples.length} images)`);
  for (const p of before) assertNear(p.heat, S.heat, 1e-6, `${id} : chauffe gardée ${r1(p.at - last)} ms après le dernier tir (délai ${S.coolDelay} ms)`);
  for (const p of after) assert(p.heat < S.heat - 0.01, `${id} : chauffe en baisse ${r1(p.at - last)} ms après le dernier tir (${r3(p.heat)})`);
  t.log(`${id} : chauffe ${S.heat} gardée ${S.coolDelay} ms, ${r3(after[0].heat)} à +${r1(after[0].at - last)} ms`);
}

/** Appuis nécessaires pour éliminer l'ennemi `kind` posé en (col, 11), immobile, devant Kaï. */
async function damage(t, id, S, kind, index, col) {
  const want = S[kind === 'w' ? 'walker' : 'armored'];
  await placeKaiRight(t, 3, 11, `${id} contre ${ENEMY_NAME[kind]}`);
  await moveEnemy(t, index, col * 64 + 32, 12 * 64);
  await waitFor(
    t,
    (i) => {
      const e = window.__xr2d.scene.enemies.list[i];
      return e.awake && e.body.enable && e.body.blocked.down;
    },
    { timeout: 2000, interval: 30, label: `${id} : ${ENEMY_NAME[kind]} réveillé et posé`, arg: index },
  );
  const hps = [(await enemy2d(t, index)).hp];
  let pulls = 0;
  for (; pulls < 8; ) {
    await readyGun(t, id, `${id} contre ${ENEMY_NAME[kind]}`);
    await t.key('KeyJ', 30);
    pulls++;
    // Tir parti (gun.sinceShotMs, champ privé lisible, remis à 1e6 par readyGun ; un plomb détruit au canon,
    // contre un ennemi au contact, n'est pas vu par recordShots), puis rafale finie et tirs éteints.
    await waitFor(t, () => window.__xr2d.scene.gun.sinceShotMs < 1e5, { timeout: 2000, interval: 20, label: `${id} : tir parti` });
    await waitGunIdle(t, `${id} contre ${ENEMY_NAME[kind]}`);
    const e = await enemy2d(t, index);
    hps.push(e.alive ? e.hp : 0);
    if (!e.alive) break;
  }
  t.log(`${id} contre ${ENEMY_NAME[kind]} : ${pulls} appui(s), points de vie ${hps.join(' -> ')}`);
  assertEq(pulls, want, `${id} : appuis pour éliminer ${ENEMY_NAME[kind]} (points de vie ${hps.join(' -> ')})`);
}

async function weapon(t, id, icons) {
  const S = SPECS[id];
  await t.goto(`?touch=0&unlock=1&stage=j1&weapon=${id}`);
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  await recordShots(t);
  await recordSfx(t);

  // Arme de la partie, HUD, bras, équipement de la session.
  const g = await gun2d(t);
  assertEq(g.weapon, id, `?weapon=${id} : arme de la partie`);
  const hud = await hudGun(t);
  assertEq(hud.weapon, id, `${id} : icône du HUD (data-weapon)`);
  assertEq(hud.step, S.step, `${id} : graduations de la jauge (--heat-step)`);
  icons[id] = hud.icon;
  assertEq(await t.ev(() => window.__xr2d.scene.player.arm.texture.key), `arm-${id}`, `${id} : texture du bras armé`);
  const sh = await t.ev(() => window.__xrShell.info());
  assert(sh.weapon === id && sh.loadout.equipped === id, `${id} : équipement de la session (${fmt({ weapon: sh.weapon, loadout: sh.loadout })})`);

  // Ennemis : seuls restent le marcheur du départ (rangé en colonne 30, immobile) et le premier blindé.
  const idx = await t.ev(() => {
    const list = window.__xr2d.scene.enemies.list;
    const near = (k, col) => list.reduce((b, e, i) => (e.kind === k && (b < 0 || Math.abs(e.homeX - col * 64) < Math.abs(list[b].homeX - col * 64)) ? i : b), -1);
    return { w: near('w', 22), a: near('a', 138) };
  });
  assert(idx.w >= 0 && idx.a >= 0, `ennemis de la Jungle trouvés (${fmt(idx)})`);
  await removeEnemies(t, [idx.w, idx.a]);
  await parkEnemy(t, 'w', 30, 11);

  const standY = await front(t, id, S);
  await aims(t, id, S);
  await crouch(t, id, S, standY);
  await overheat(t, id, S);
  await damage(t, id, S, 'w', idx.w, 5);
  // Pompe : au contact (colonne 4), les 5 plombs touchent.
  await damage(t, id, S, 'a', idx.a, id === 'shotgun' ? 4 : 5);
}

export default async function (t) {
  await recordToasts(t);
  // Cinématiques déjà vues (plan 04, choix 14) : JOUER et les cartes mènent droit à la carte d'intro.
  await seedSave(t, SEEN_STORY);
  await sessionWeapon(t);
  await savedLoadout(t);

  const icons = {};
  for (const id of IDS) await weapon(t, id, icons);
  assertEq(new Set(Object.values(icons)).size, 4, 'une icône différente par arme dans la jauge');

  // Changement d'arme en cours de partie : bras, HUD et fiche suivent.
  await t.ev(() => window.__xr2d.weapon('laser'));
  for (const id of ['machinegun', 'laser']) {
    await t.ev((w) => window.__xr2d.weapon(w), id);
    await waitFor(t, (w) => document.querySelector('.hud-heat').dataset.weapon === w, { timeout: 1000, interval: 30, label: `HUD sur ${id}`, arg: id });
    const st = await t.ev(() => ({ weapon: window.__xr2d.info().weapon, arm: window.__xr2d.scene.player.arm.texture.key, heat: window.__xr2d.info().heat }));
    assertEq(st, { weapon: id, arm: `arm-${id}`, heat: 0 }, `__xr2d.weapon('${id}') en cours de partie`);
    assertEq((await hudGun(t)).step, SPECS[id].step, `graduations de la jauge après le changement (${id})`);
  }
}
