// Monde 1, niveau 2 (j2, « Canopée des spores ») lancé par ?stage=j2, au clavier, sans mode test (pas de double
// saut) : A. arrivée par le faisceau de LUMA (état « enter » puis « play », Kaï posé au départ, son « beacon ») ;
// méduse-baleine proche dans le décor (LevelData.creature 'near') ; textures des objets du niveau (Tess et sa capsule
// comprises) ; bulle du premier message cachée avant que Kaï n'atteigne le premier champignon au rythme de référence.
// B. champignons : rebond mesuré sans tenir Saut (6,5 tuiles) et en le tenant (8 tuiles), son et animation
// d'écrasement ; sous une dalle posée par le test à 4 lignes, puis juste au-dessus de la tête (choc à ≈ 26 px par
// pas), rebond tenu arrêté net (aucun pas ne traverse une tuile, vitesses bornées) ; le mur de 6 lignes franchi en
// rebondissant sur le premier champignon. C. événements, une fois chacun : ombre de la créature (passage, son
// « whaleCry », créature du décor effacée puis revenue en fondu, pas de second passage) ; secousse (son « quake »,
// secousse de la caméra qui remplace un coup en cours, tronc qui tremble, tombe, devient plein dans la grille ET le
// calque ; Kaï pris dessous posé dessus ; arrêté par la souche ; sur le tronc, arrêté par le rocher même en sautant :
// le tunnel est bouché). E. Tess (salle murée au-dessus du tunnel) : porte du sol → porte de la salle (glyphes
// allumés) ; Tess salue, devant la porte voisine les portes restent fermées et la flèche est au-dessus de Tess ; ↑ la
// secourt (pas la porte) : sa réplique par la radio (bulle « tess ») coupe aussitôt le message en cours, puis celle
// de LUMA, portes toujours fermées, dissolution (son « rescue ») pendant « … je te téléporte à bord ! », « Tess est à
// bord ! » après sa dernière lettre ; ↑ → porte du tunnel, après le tronc ; pas encore dans
// l'équipage. C3. pluie de spores (8 taches au sol, chaque spore lâchée sur sa tache au moins 0,95 s après
// l'annonce ; une spore blesse Kaï, une autre est abattue au tir). F. Plus de vies : échec, Tess hors de l'équipage ;
// RÉESSAYER : elle attend de nouveau. G. Partie neuve : à pleine course avec le bonus de vitesse, le tronc tombe avant
// que Kaï n'entre dans le tunnel ; Tess secourue de nouveau ; arène du Scarabée-titan avec ses 2 champignons contre
// les bornes (rebond pendant le combat), victoire, balise → résultats « Équipière : Tess » et prime du boss
// (panneau entier à 844x390 et 640x320), Tess dans l'équipage, j2 réussie. H. j2 rejouée : Tess déjà à bord, seule
// sa capsule reste ; signal de détresse muet ; porte voisine ouverte d'emblée, ni dialogue ni message.
import { assert, assertEq, assertNear, fmt, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout, press, resultDetails } from '../lib/core.mjs';
import { pageNow, placeKai, recordUi, removeEnemies, toastsSince, waitGrounded } from '../lib/game2d.mjs';

export const meta = {
  title: 'Canopée des spores (j2) : faisceau, champignons, ombre, secousse et tronc, Tess, spores, échec, arène, balise',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

const T = 64;
/** Rebond (constants.ts : MUSHROOM_BOUNCE_TILES, MUSHROOM_BOUNCE_HELD_TILES) et vitesses bornées (tuning.ts). */
const BOUNCE_PX = 6.5 * T;
const BOUNCE_HELD_PX = 8 * T;
const MAX_RISE_V = Math.sqrt(2 * 2600 * 9 * T) + 2600 / 120;
const MAX_FALL = 1400;
/** j2 : champignon seul (33, 11), premier champignon (21, 11) avant le mur 24-27 (dessus : ligne 5). */
const MUSH = { col: 33, row: 11 };
const FIRST_MUSH = { col: 21, row: 11 };
/** Événements (src/game2d/levels/jungle/j2.ts). */
const SHADOW_COL = 45;
const QUAKE_COL = 119;
const TRUNK = { col: 128, row: 11 };
/** Rocher au-dessus du tunnel (131-150) : le tronc couché en bouche l'entrée. */
const ROCK_COL = 131;
const SPORES_COL = 161;
const RAIN = [163, 179];
/** Salle de Tess : porte du sol A ↔ porte de la salle B, porte voisine de Tess C ↔ porte du tunnel D. */
const DOOR_A = { col: 126, row: 11 };
const DOOR_B = { col: 134, row: 7 };
const DOOR_C = { col: 146, row: 7 };
const DOOR_D = { col: 148, row: 11 };
const TESS = { col: 145, row: 7 };
const CHAMPIGNONS = 7;
/** Arène (bornes 206 et 221, 16 colonnes) : champignons 207 et 220, contre les bornes. */
const ARENA = { col0: 206, col1: 221 };
const ARENA_MUSH = [207, 220];
const DROPS = 8;
const WARN_MS = 1000;
/** Kaï au rythme de référence de check-levels (2,5 colonnes/s, après 0,7 s d'arrivée) à la colonne qui précède le
 *  premier champignon : la bulle du premier message doit être cachée, fondu (0,16 s) compris. */
const FIRST_BOUNCE_S = 0.7 + (FIRST_MUSH.col - 1 - 8) / 2.5;
const BUBBLE_FADE_S = 0.16;
/** Secousse de l'événement (PlatformScene : fx.shake(1, 900) ; effects.ts : SHAKE_FULL x force). */
const QUAKE_SHAKE = { intensity: 0.01, ms: 900 };

/** Avant t.goto : états de la scène (window.__states), sons joués (window.__sfx), phases de la radio depuis l'état
 *  « enter » (window.__radio : [phase, ms]) jusqu'à la bulle du premier message cachée (window.__bubbleHiddenAt). */
async function recordStart(t) {
  await t.page.addInitScript(() => {
    window.__states = [];
    window.__sfx = [];
    window.__enterAt = 0;
    window.__bubbleHiddenAt = 0;
    window.__radio = [];
    const tick = () => {
      const s = window.__xr2d && window.__xr2d.scene;
      const st = s && s.state;
      if (st && window.__states[window.__states.length - 1] !== st) window.__states.push(st);
      if (st === 'enter' && !window.__enterAt) window.__enterAt = performance.now();
      // Bulle du premier message cachée : la radio passe au trou entre deux messages (ou au repos).
      const r = window.__enterAt && !window.__bubbleHiddenAt && window.__xrShell && window.__xrShell.radio();
      const ph = window.__radio;
      if (r && (ph.length === 0 || ph[ph.length - 1][0] !== r.phase)) ph.push([r.phase, Math.round(performance.now() - window.__enterAt)]);
      if (r && r.played.length > 0 && (r.phase === 'gap' || r.phase === 'idle')) window.__bubbleHiddenAt = performance.now();
      const a = window.__xrShell && window.__xrShell.audio;
      if (a && !a.__j2p) {
        a.__j2p = true;
        const orig = a.sfx;
        a.sfx = function (id, o) {
          window.__sfx.push(id);
          return orig.call(this, id, o);
        };
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const sfxCount = (t, id) => t.ev((x) => window.__sfx.filter((s) => s === x).length, id);
/** Équipage et records enregistrés (sauvegarde absente tant que rien n'est enregistré : vides). */
async function saved(t) {
  const s = await readSave(t);
  return { crew: s ? s.crew : [], best: s ? s.best : {} };
}

/**
 * Relevé à chaque image, après la physique (postupdate de la scène) : sommet des pieds et de la tête, vitesses
 * verticales extrêmes, cases pleines chevauchées par le corps de Kaï, frames du champignon.
 */
async function installMonitor(t) {
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const m = { on: false, minFeet: 1e9, minTop: 1e9, maxUp: 0, maxDown: 0, hitUp: 0, prevUp: 0, overlap: [], frames: [] };
    window.__mon = m;
    window.__monReset = () => {
      m.minFeet = 1e9;
      m.minTop = 1e9;
      m.maxUp = 0;
      m.maxDown = 0;
      m.hitUp = 0;
      m.prevUp = 0;
      m.overlap.length = 0;
      m.frames.length = 0;
    };
    s.events.on('postupdate', () => {
      if (!m.on || s.state !== 'play') return;
      const b = s.player.body;
      const feet = b.y + b.height;
      m.minFeet = Math.min(m.minFeet, feet);
      m.minTop = Math.min(m.minTop, b.y);
      m.maxUp = Math.max(m.maxUp, -b.velocity.y);
      m.maxDown = Math.max(m.maxDown, b.velocity.y);
      // Tête arrêtée par une tuile à ce pas : vitesse montante du pas d'avant.
      if (b.blocked.up) m.hitUp = Math.max(m.hitUp, m.prevUp);
      m.prevUp = -b.velocity.y;
      const g = s.grid;
      const c0 = Math.floor((b.x + 1) / 64);
      const c1 = Math.floor((b.x + b.width - 1) / 64);
      const r0 = Math.floor((b.y + 1) / 64);
      const r1 = Math.floor((feet - 1) / 64);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g.at(c, r) === 1 && m.overlap.length < 20) m.overlap.push([c, r, Math.round(b.y)]);
      const mu = s.mushrooms;
      if (mu) for (const x of mu.list) if (m.frames[m.frames.length - 1] !== x.frame && x.frame >= 3) m.frames.push(x.frame);
    });
  });
}

const mon = (t) => t.ev(() => ({ ...window.__mon, overlap: window.__mon.overlap.slice(), frames: window.__mon.frames.slice() }));

/**
 * Rebond sur le champignon seul : Kaï lâché 2 cases au-dessus, Saut tenu ou non, jusqu'au rebond suivant (la
 * retombée de 6,5 ou 8 tuiles dépasserait MAX_FALL sans la borne). Renvoie la hauteur du premier rebond (pieds, px
 * au-dessus du chapeau) et le relevé.
 */
async function bounceOnce(t, held, label) {
  const b0 = await t.ev(() => window.__xr2d.scene.mushrooms.bounces);
  await t.ev(() => {
    window.__monReset();
    window.__mon.on = true;
  });
  await t.ev(([c, r]) => window.__xr2d.teleport(c, r), [MUSH.col, MUSH.row - 3]);
  if (held) await t.page.keyboard.down('Space');
  // Premier rebond, puis sommet passé (Kaï redescend nettement).
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n, { timeout: 4000, interval: 20, arg: b0, label: `${label} : rebond` });
  await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      return s.player.body.velocity.y > 300 && s.player.feetY > window.__mon.minFeet + 40;
    },
    { timeout: 4000, interval: 20, label: `${label} : sommet passé` },
  );
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n + 1, { timeout: 4000, interval: 20, arg: b0, label: `${label} : rebond suivant` });
  const m = await mon(t);
  const info = await t.ev(() => {
    const mu = window.__xr2d.scene.mushrooms;
    return { bounces: mu.bounces, held: mu.lastHeld };
  });
  if (held) await t.page.keyboard.up('Space');
  await t.ev(() => {
    window.__mon.on = false;
  });
  // Kaï ramené sur le sol, à côté (sinon il rebondit sans fin).
  await t.ev(() => window.__xr2d.teleport(30, 11));
  await waitGrounded(t, `${label} : Kaï au sol`);
  const rise = (MUSH.row) * T - m.minFeet;
  t.log(label, `rebond ${Math.round(rise)} px (${(rise / T).toFixed(2)} tuiles), Saut tenu ${info.held}, montée max ${Math.round(m.maxUp)} px/s, chute max ${Math.round(m.maxDown)} px/s`);
  return { rise, m, info, b0 };
}

/** Pose une dalle pleine (grille ET calque, collision et faces) sur les cases [c, r] ; renvoie la ligne. */
function putSlab(t, cells) {
  return t.ev((list) => {
    const s = window.__xr2d.scene;
    for (const [c, r] of list) {
      const tile = s.layer.putTileAt(6, c, r);
      tile.setCollision(true, true, true, true, false);
      tile.faceTop = tile.faceBottom = tile.faceLeft = tile.faceRight = true;
      s.grid.cells[r * s.grid.cols + c] = 1;
    }
  }, cells);
}

function removeSlab(t, cells) {
  return t.ev((list) => {
    const s = window.__xr2d.scene;
    for (const [c, r] of list) {
      s.layer.removeTileAt(c, r);
      s.grid.cells[r * s.grid.cols + c] = 0;
    }
  }, cells);
}

/** État des événements du décor et de leurs objets. */
function decor(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const tr = s.trunks[0];
    const rain = s.sporeRain;
    return {
      events: s.levelEvents.events.map((e) => [e.event.kind, e.state]),
      shadowPasses: s.shadowPasses,
      trunk: tr ? { state: tr.state, frame: tr.img.frame.name, depth: tr.img.depth } : null,
      rain: rain ? { active: rain.active, history: rain.history.map((h) => ({ ...h })), spots: rain.spots.filter((p) => p.on).length } : null,
      spores: s.spores.active,
    };
  });
}

export default async function (t) {
  await recordStart(t);
  await recordUi(t);
  await t.goto('?touch=0&stage=j2');

  // ------------------------------------------------------------ A. Arrivée par le faisceau, décor
  await waitFor(t, () => !!(window.__xr2d && window.__xr2d.scene && window.__xr2d.scene.arrival), { timeout: 30000, label: 'arrivée de j2' });
  await t.wait(250);
  await t.shot('a-beam-arrival');
  await waitFor2dPlay(t);
  await waitGrounded(t, 'Kaï au sol au départ');
  const a = await t.ev(() => {
    const s = window.__xr2d.scene;
    const tex = (k) => s.textures.exists(k);
    const creature = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-near');
    return {
      level: s.session.level.id,
      kind: s.arrival.kind,
      landed: s.arrival.landed,
      states: window.__states.slice(),
      x: s.player.x,
      feetY: s.player.feetY,
      beacon: window.__sfx.filter((id) => id === 'beacon').length,
      creature: creature ? { visible: creature.visible, depth: creature.depth } : null,
      textures: [tex('w1-mushroom'), tex('w1-trunk'), tex('w1-spore-spot'), tex('w1-tess'), tex('w1-capsule')],
      mushrooms: s.mushrooms ? s.mushrooms.list.length : 0,
      npc: s.npc ? { state: s.npc.state, x: s.npc.x, feetY: s.npc.feetY, capsule: [s.npc.capsule.x, s.npc.capsule.y, s.npc.capsule.visible] } : null,
      hiddenTiles: s.parsed.mushrooms.every((m) => !s.layer.getTileAt(m.col, m.row).visible),
      radio: s.levelEvents.windows.map((w) => [w.id, w.state]),
    };
  });
  t.log('arrivée', fmt(a));
  assertEq([a.level, a.kind, a.landed], ['jungle2', 'beam', true], 'j2 : arrivée par le faisceau de LUMA, Kaï posé');
  assertEq(a.states.slice(0, 2), ['enter', 'play'], 'états de la scène : arrivée puis jeu');
  assertNear(a.x, 8 * T + 32, 1, 'Kaï au départ P (x)');
  assertNear(a.feetY, 12 * T, 1, 'Kaï au départ P (pieds)');
  assert(a.beacon >= 1, 'son du faisceau (« beacon ») à l’arrivée');
  assert(a.creature && a.creature.visible, `méduse-baleine proche dans le décor (texture « bg-jungle-creature-near ») : ${fmt(a.creature)}`);
  assertEq(a.textures, [true, true, true, true, true], 'textures du niveau générées : champignon, tronc, tache de spore, Tess, capsule');
  assertEq([a.mushrooms, a.hiddenTiles], [CHAMPIGNONS, true], `${CHAMPIGNONS} champignons dessinés par-dessus leurs tuiles cachées`);
  assertEq(
    a.npc,
    { state: 'wait', x: TESS.col * T + 32, feetY: (TESS.row + 1) * T, capsule: [(TESS.col - 1) * T, (TESS.row + 1) * T, true] },
    'Tess en attente dans sa salle, sa capsule sur les 2 cases à sa gauche',
  );
  assertEq(a.radio[0], ['j2-mushroom', 1], 'radio : j2-mushroom au départ');
  await t.shot('a-start');
  await waitFor(t, () => window.__bubbleHiddenAt > 0, { timeout: 10000, label: 'A : bulle du premier message cachée' });
  const hiddenS = await t.ev(() => (window.__bubbleHiddenAt - window.__enterAt) / 1000);
  t.log('A : phases de la radio (ms depuis « enter »)', fmt(await t.ev(() => window.__radio)));
  t.log('A : bulle cachée', hiddenS.toFixed(2), 's après l’arrivée ; Kaï au rythme de référence avant le champignon à', FIRST_BOUNCE_S.toFixed(2), 's');
  assert(hiddenS + BUBBLE_FADE_S <= FIRST_BOUNCE_S, `A : bulle cachée avant le premier rebond au rythme de référence (${hiddenS.toFixed(2)} + ${BUBBLE_FADE_S} ≤ ${FIRST_BOUNCE_S.toFixed(2)} s)`);

  // ------------------------------------------------------------ B. Champignons
  // Ennemis retirés (marcheurs autour des champignons : Kaï y est posé et lâché) ; mode dieu jusqu'à la pluie.
  await removeEnemies(t);
  await t.ev(() => window.__xr2d.god(true));
  await installMonitor(t);
  const loose = await bounceOnce(t, false, 'B1 sans tenir Saut');
  assertNear(loose.rise, BOUNCE_PX, 8, 'B1 : rebond de 6,5 tuiles sans tenir Saut');
  assertEq(loose.info.held, false, 'B1 : rebond « Saut lâché »');
  assertEq(loose.m.overlap, [], 'B1 : aucune case pleine traversée');
  assert(loose.m.frames.includes(3), `B1 : champignon écrasé à l’impact (frames ${fmt(loose.m.frames)})`);
  const held = await bounceOnce(t, true, 'B2 Saut tenu');
  assertNear(held.rise, BOUNCE_HELD_PX, 8, 'B2 : rebond de 8 tuiles en tenant Saut');
  assertEq(held.info.held, true, 'B2 : rebond « Saut tenu »');
  assertEq(held.m.overlap, [], 'B2 : aucune case pleine traversée');
  for (const r of [loose, held]) {
    assert(r.m.maxUp <= MAX_RISE_V + 1, `montée ≤ ${Math.round(MAX_RISE_V)} px/s (${Math.round(r.m.maxUp)})`);
    assert(r.m.maxDown <= MAX_FALL + 2 * 44, `chute bornée vers ${MAX_FALL} px/s (${Math.round(r.m.maxDown)})`);
  }
  assert((await sfxCount(t, 'mushroomBounce')) >= 2, 'son « mushroomBounce » à chaque rebond');

  // Plafond d'une case posé au-dessus du champignon (ligne 4) : le rebond tenu s'y arrête, sans le traverser.
  const slab = [[32, 4], [33, 4], [34, 4]];
  await putSlab(t, slab);
  const capped = await bounceOnce(t, true, 'B3 plafond');
  await removeSlab(t, slab);
  assertEq(capped.m.overlap, [], 'B3 : le plafond arrête Kaï, aucune case traversée');
  assertNear(capped.m.minTop, 5 * T, 2, 'B3 : tête arrêtée sous le plafond (ligne 4)');

  // Dalle juste au-dessus de la tête (ligne 8, 58 px) : choc à ≈ 1 560 px/s, ≈ 26 px par pas, le cas qui frôle
  // TILE_BIAS (32 px). Saut tenu en l'air (pas de double saut), puis Kaï posé sur le chapeau.
  const slab8 = [[32, 8], [33, 8], [34, 8]];
  await t.ev(() => window.__xr2d.teleport(30, 5));
  await t.page.keyboard.down('Space');
  await putSlab(t, slab8);
  // Relevé remis à zéro et Kaï posé dans la même tâche : aucune image de jeu entre les deux.
  const tb0 = await t.ev(([c, r]) => {
    window.__monReset();
    window.__mon.on = true;
    window.__xr2d.teleport(c, r);
    return window.__xr2d.scene.mushrooms.bounces;
  }, [MUSH.col, MUSH.row - 1]);
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n + 2, { timeout: 4000, interval: 20, arg: tb0, label: 'B3b : rebonds sous la dalle' });
  const tight = await mon(t);
  const tightHeld = await t.ev(() => window.__xr2d.scene.mushrooms.lastHeld);
  await t.page.keyboard.up('Space');
  await t.ev(() => {
    window.__mon.on = false;
    window.__xr2d.teleport(30, 11);
  });
  await removeSlab(t, slab8);
  await waitGrounded(t, 'B3b : Kaï au sol');
  t.log('B3b dalle en ligne 8', `tête au plus haut ${Math.round(tight.minTop)}, choc à ${Math.round(tight.hitUp)} px/s (${(tight.hitUp / 60).toFixed(1)} px par pas), Saut tenu ${tightHeld}`);
  assertEq(tightHeld, true, 'B3b : rebond « Saut tenu »');
  assertEq(tight.overlap, [], 'B3b : dalle juste au-dessus de la tête, aucune case traversée');
  assertNear(tight.minTop, 9 * T, 2, 'B3b : tête arrêtée sous la dalle (ligne 8)');
  assert(tight.hitUp > 1450 && tight.hitUp <= MAX_RISE_V + 1, `B3b : choc à pleine vitesse de rebond tenu (${Math.round(tight.hitUp)} px/s)`);

  // Premier champignon : le mur 24-27 (dessus ligne 5, 6 lignes au-dessus du sol) ne se franchit qu'en rebondissant
  // (arc « champignon » de check-levels : montée 5, écart 2) ; Kaï lâché dessus, → tenu dès le rebond, sans Saut.
  const fb0 = await t.ev(() => window.__xr2d.scene.mushrooms.bounces);
  await t.ev(([c, r]) => window.__xr2d.teleport(c, r), [FIRST_MUSH.col, FIRST_MUSH.row - 3]);
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n, { timeout: 4000, interval: 10, arg: fb0, label: 'B4 : rebond sur le premier champignon' });
  await t.page.keyboard.down('ArrowRight');
  await waitFor(t, () => window.__xr2d.scene.player.x > 24 * 64 && window.__xr2d.scene.player.onGround, {
    timeout: 4000,
    interval: 20,
    label: 'B4 : Kaï posé sur le mur après le rebond',
  });
  await t.page.keyboard.up('ArrowRight');
  const wall = await t.ev(() => ({ x: window.__xr2d.scene.player.x, feetY: window.__xr2d.scene.player.feetY }));
  t.log('B4 : sur le mur', fmt(wall));
  assertNear(wall.feetY, 6 * T, 1, 'B4 : rebond sans tenir Saut jusqu’en haut du mur (ligne 5)');
  await t.shot('b-wall-top');

  // ------------------------------------------------------------ C. Événements du décor
  // Ombre de la créature (fenêtre 44-47) ; opacité de la créature du décor relevée à chaque image (0 : cachée).
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const cr = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-near');
    const rec = (window.__cfade = []);
    s.events.on('postupdate', () => {
      if (s.shadowPasses >= 1 && rec.length < 400) rec.push(cr.visible ? Math.round(cr.alpha * 100) / 100 : 0);
    });
  });
  await t.ev((c) => window.__xr2d.teleport(c, 11), SHADOW_COL);
  await waitFor(t, () => window.__xr2d.scene.shadowPasses === 1, { timeout: 3000, label: 'C1 : ombre de la créature' });
  await t.wait(1100);
  const sh = await t.ev(() => {
    const s = window.__xr2d.scene;
    const o = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-shadow');
    const cr = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-near');
    return { shadow: o ? { visible: o.visible, alpha: o.alpha, x: Math.round(o.x) } : null, creature: cr.visible };
  });
  t.log('C1 : ombre', fmt(sh));
  assert(sh.shadow && sh.shadow.visible && sh.shadow.alpha > 0.2, `C1 : ombre visible au milieu du passage (${fmt(sh)})`);
  assertEq(sh.creature, false, 'C1 : la créature du décor passe au-dessus (cachée au loin)');
  await t.shot('c-shadow');
  assert((await sfxCount(t, 'whaleCry')) === 1, 'C1 : cri de la méduse-baleine');
  await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      const o = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-shadow');
      const cr = s.children.list.find((c) => c.texture && c.texture.key === 'bg-jungle-creature-near');
      return !o.visible && cr.visible;
    },
    { timeout: 4000, label: 'C1 : passage fini, créature revenue au loin' },
  );
  await t.ev((c) => window.__xr2d.teleport(c, 11), SHADOW_COL - 2);
  await t.wait(150);
  await t.ev((c) => window.__xr2d.teleport(c, 11), SHADOW_COL);
  await t.wait(300);
  assertEq(await t.ev(() => window.__xr2d.scene.shadowPasses), 1, 'C1 : pas de second passage (une fois par partie)');
  const fade = await t.ev(() => window.__cfade.slice());
  const out = fade.indexOf(0);
  const back = fade.findIndex((v, i) => i > out && v > 0);
  const full = fade.findIndex((v, i) => i > back && v >= 0.9);
  t.log('C1 : opacité de la créature', fmt({ debut: fade.slice(0, 3), effacee: out, retour: fade.slice(back, back + 3), pleine: full - back }));
  assert(out >= 8 && fade[0] >= 0.8 && fade[out - 1] < 0.4, `C1 : créature effacée en fondu au début du passage (${out} images, de ${fade[0]} à ${fade[out - 1]})`);
  assert(back > out && fade[back] < 0.4 && full - back >= 8, `C1 : créature revenue en fondu (${fade[back]}, pleine après ${full - back} images)`);

  // Secousse (fenêtre 118-120) : le tronc (128, 11) tremble puis tombe ; Kaï, posé dessous, est remonté dessus. Une
  // secousse de coup reçu (0,6, 180 ms) tourne quand Kaï entre dans la fenêtre : celle de l'événement la remplace.
  await t.ev((c) => {
    window.__xr2d.scene.fx.shake(0.6, 180);
    window.__xr2d.teleport(c, 11);
  }, QUAKE_COL);
  await waitFor(t, () => window.__xr2d.scene.trunks[0].state !== 'stand', { timeout: 3000, label: 'C2 : la secousse fait trembler le tronc' });
  const q0 = await t.ev((tr) => {
    const e = window.__xr2d.scene.cameras.main.shakeEffect;
    return { shake: e.isRunning, intensity: Math.round(e.intensity.x * 1e4) / 1e4, ms: e.duration, cells: window.__xr2d.scene.grid.at(tr.col + 1, tr.row) };
  }, TRUNK);
  assertEq(q0, { shake: true, intensity: QUAKE_SHAKE.intensity, ms: QUAKE_SHAKE.ms, cells: 0 }, 'C2 : caméra secouée par l’événement (le coup en cours remplacé), tronc pas encore plein');
  assertEq(await sfxCount(t, 'quake'), 1, 'C2 : son « quake »');
  await t.ev((c) => window.__xr2d.teleport(c, 11), TRUNK.col + 2);
  await t.wait(200);
  await t.shot('c-trunk-falling');
  await waitFor(t, () => window.__xr2d.scene.trunks[0].state === 'down', { timeout: 3000, label: 'C2 : tronc couché' });
  const q1 = await t.ev((tr) => {
    const s = window.__xr2d.scene;
    const cells = [[tr.col, tr.row]];
    for (let r = tr.row - 1; r <= tr.row; r++) for (let c = tr.col + 1; c <= tr.col + 3; c++) cells.push([c, r]);
    return {
      grid: cells.map(([c, r]) => s.grid.at(c, r)),
      layer: cells.map(([c, r]) => {
        const tile = s.layer.getTileAt(c, r);
        return !!(tile && tile.collideUp && tile.collideLeft);
      }),
    };
  }, TRUNK);
  assertEq(q1.grid, [1, 1, 1, 1, 1, 1, 1], 'C2 : tronc plein dans la grille (souche + 3 x 2)');
  assertEq(q1.layer, [true, true, true, true, true, true, true], 'C2 : tronc plein dans le calque (collision)');
  await waitGrounded(t, 'C2 : Kaï posé');
  const onTrunk = await t.ev(() => window.__xr2d.scene.player.feetY);
  assertNear(onTrunk, (TRUNK.row - 1) * T, 1, 'C2 : Kaï pris sous le tronc, posé dessus');
  await t.shot('c-trunk-down');
  // Arrêté par la souche en courant vers elle.
  await t.ev((c) => window.__xr2d.teleport(c, 11), TRUNK.col - 2);
  await waitGrounded(t, 'C2 : Kaï avant la souche');
  await t.key('ArrowRight', 700);
  const blocked = await t.ev(() => window.__xr2d.scene.player.right);
  assert(blocked <= TRUNK.col * T + 1, `C2 : Kaï arrêté par la souche (bord droit ${Math.round(blocked)} ≤ ${TRUNK.col * T})`);
  // Sur le tronc, contre le rocher : le tunnel est bouché, même en sautant.
  await placeKai(t, TRUNK.col + 2, TRUNK.row - 2, 'C2 : Kaï sur le tronc');
  await t.page.keyboard.down('ArrowRight');
  await t.key('Space', 600);
  await t.wait(500);
  await t.page.keyboard.up('ArrowRight');
  await waitGrounded(t, 'C2 : Kaï retombé');
  const wallStop = await t.ev(() => ({ right: window.__xr2d.scene.player.right, feetY: window.__xr2d.scene.player.feetY }));
  t.log('C2 : contre le rocher', fmt(wallStop));
  assert(wallStop.right <= ROCK_COL * T + 1 && wallStop.feetY === (TRUNK.row - 1) * T, `C2 : arrêté par le rocher, toujours sur le tronc (${fmt(wallStop)})`);
  await t.shot('c-trunk-blocks');

  // ------------------------------------------------------------ E. Tess, dans la salle murée au-dessus du tunnel
  await placeKai(t, DOOR_A.col, DOOR_A.row, 'E1 : devant la porte du sol');
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex === 0, { timeout: 2000, label: 'E1 : porte du sol ouverte' });
  await t.key('ArrowUp', 80);
  await waitFor(t, (b) => Math.abs(window.__xr2d.scene.player.x - (b.col * 64 + 32)) < 2 && window.__xr2d.scene.player.feetY === (b.row + 1) * 64, {
    timeout: 2000,
    label: 'E1 : Kaï dans la salle (porte B)',
    arg: DOOR_B,
  });
  await waitFor(t, () => window.__xr2d.scene.glyphs.list.some((g) => g.lit), { timeout: 3000, label: 'E1 : glyphes de la salle allumés' });
  await t.wait(400);
  await t.shot('e-room');
  // Devant la porte voisine de Tess : flèche au-dessus de Tess, portes fermées (un appui la secourt d'abord).
  await placeKai(t, DOOR_C.col, DOOR_C.row, 'E2 : devant la porte voisine de Tess');
  await waitFor(t, () => window.__xr2d.scene.npc.near && window.__xr2d.scene.npc.arrow.visible && window.__xr2d.scene.npc.arrow.alpha > 0.95, {
    timeout: 2000,
    label: 'E2 : flèche au-dessus de Tess',
  });
  const e2 = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { doorNear: s.doors.nearIndex, doorArrow: s.doors.arrow.visible, tessFrame: s.npc.img.frame.name, flip: s.npc.img.flipX };
  });
  t.log('E2', fmt(e2));
  assert(e2.doorNear === -1 && !e2.doorArrow, `E2 : portes fermées tant que Tess attend Kaï (${fmt(e2)})`);
  assert(e2.tessFrame === 2 || e2.tessFrame === 3, `E2 : Tess salue Kaï (frame ${e2.tessFrame})`);
  assertEq(e2.flip, false, 'E2 : Tess tournée vers Kaï, à sa droite');
  await t.shot('e-tess-near');
  assertEq((await saved(t)).crew, [], 'E2 : Tess pas encore dans l’équipage');
  // Un message ordinaire en cours d'écriture : le dialogue le coupera. Relevé à chaque image du sauvetage : état de
  // Tess, message, phase et lettres écrites de la bulle.
  await t.ev(() => {
    const r = window.__xrShell.radio();
    if (r.phase !== 'typing' && r.phase !== 'hold') window.__xr2d.scene.session.hooks.hud.radio('j2-closer');
  });
  await waitFor(t, () => ['typing', 'hold'].includes(window.__xrShell.radio().phase), { timeout: 3000, label: 'E3 : un message dans la bulle' });
  await t.ev(() => {
    const log = [];
    window.__rescueLog = log;
    let last = '';
    const tick = () => {
      const n = window.__xr2d.scene.npc;
      const r = window.__xrShell.radio();
      const key = `${n.state}|${r.current}|${r.phase}`;
      if (key !== last) {
        last = key;
        const on = document.querySelectorAll('.hud .xr-bubble--radio .xr-bubble-text > span.is-on').length;
        log.push({ at: performance.now(), state: n.state, current: r.current, phase: r.phase, on, text: r.text });
      }
      if (n.state !== 'gone') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await waitFor(t, () => window.__rescueLog.length > 0, { timeout: 2000, label: 'E3 : relevé du sauvetage commencé' });
  const e3t0 = await pageNow(t);
  await t.key('ArrowUp', 80);
  await waitFor(t, () => window.__xr2d.scene.npc.state === 'talk', { timeout: 2000, label: 'E3 : sauvetage lancé' });
  const e3 = await t.ev(() => ({ x: window.__xr2d.scene.player.x, feetY: window.__xr2d.scene.player.feetY }));
  assert(Math.abs(e3.x - (DOOR_C.col * T + 32)) < 30 && e3.feetY === (DOOR_C.row + 1) * T, `E3 : l'appui secourt Tess, Kaï reste dans la salle (${fmt(e3)})`);
  await waitFor(t, () => {
    const r = window.__xrShell.radio();
    const b = document.querySelector('.hud .xr-bubble--radio');
    return r.current === 'j2-tess' && b && b.dataset.speaker === 'tess' && !b.classList.contains('is-hidden');
  }, { timeout: 3000, label: 'E3 : Tess parle par la radio (bulle « tess »)' });
  await t.wait(900);
  await t.shot('e-tess-talk');
  // Pendant le sauvetage, un appui devant la porte ne fait rien.
  await t.key('ArrowUp', 80);
  await t.wait(200);
  assertEq(await t.ev(() => window.__xr2d.scene.player.feetY), (DOOR_C.row + 1) * T, 'E3 : portes fermées pendant le sauvetage');
  await waitFor(t, () => window.__xr2d.scene.npc.state === 'beam', { timeout: 8000, label: 'E4 : LUMA téléporte Tess' });
  const e4 = await t.ev(() => ({ radio: window.__xrShell.radio(), frame: window.__xr2d.scene.npc.img.frame.name, sfx: window.__sfx.filter((x) => x === 'rescue').length }));
  t.log('E4 : dissolution', fmt({ played: e4.radio.played, current: e4.radio.current, frame: e4.frame }));
  assertEq(e4.radio.current, 'j2-rescue', 'E4 : LUMA parle quand Tess se dissout');
  assert(e4.frame >= 4 && e4.sfx === 1, `E4 : images de dissolution et son « rescue » (${fmt(e4)})`);
  await t.wait(150);
  await t.shot('e-tess-beam');
  await waitFor(t, () => window.__xr2d.scene.npc.state === 'gone', { timeout: 3000, label: 'E4 : Tess à bord' });
  const e4b = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { visible: s.npc.img.visible, arrow: s.npc.arrow.visible, played: window.__xrShell.radio().played.slice(), capsule: s.npc.capsule.visible };
  });
  assertEq([e4b.visible, e4b.arrow, e4b.capsule], [false, false, true], 'E4 : Tess partie, capsule restée');
  const pl = e4b.played;
  assert(pl.indexOf('j2-tess') >= 0 && pl.indexOf('j2-rescue') === pl.indexOf('j2-tess') + 1, `E4 : réplique de Tess puis celle de LUMA (${fmt(pl)})`);
  assertEq((await toastsSince(t, 'Tess est à bord', e3t0)).length, 1, 'E4 : message « Tess est à bord ! »');
  // Chronologie relevée à chaque image : le dialogue coupe le message en cours sans trou ; Tess se dissout pendant
  // « … je te téléporte à bord ! » et part après sa dernière lettre.
  const log = await t.ev(() => window.__rescueLog.slice());
  for (const e of log) t.log('E4 : chronologie', Math.round(e.at - log[0].at), 'ms', e.state, e.current, e.phase, `${e.on} lettres`);
  const talk = log.find((e) => e.state === 'talk');
  const tess = log.find((e) => e.current === 'j2-tess');
  const beam = log.find((e) => e.state === 'beam');
  const gone = log.find((e) => e.state === 'gone');
  assert(log[0].state === 'wait' && log[0].current !== null && log[0].current !== 'j2-tess', `E4 : un message ordinaire dans la bulle avant l'appui (${fmt(log[0])})`);
  assert(talk && tess && tess.at - talk.at <= 150, `E4 : réplique de Tess ouverte sans trou après l'appui (${tess && talk ? Math.round(tess.at - talk.at) : '?'} ms ≤ 150)`);
  assert(
    beam && beam.current === 'j2-rescue' && beam.phase === 'typing' && beam.on > beam.text.indexOf('je te') && beam.on < beam.text.length,
    `E4 : dissolution pendant « … je te téléporte à bord » (${beam ? `${beam.on}/${beam.text.length} lettres : « ${beam.text.slice(0, beam.on)} »` : '?'})`,
  );
  assert(gone && gone.current === 'j2-rescue' && gone.on === gone.text.length, `E4 : Tess à bord après la dernière lettre de LUMA (${gone ? `${gone.on}/${gone.text.length}, ${gone.phase}` : '?'})`);
  // La porte voisine s'ouvre : ↑ → porte du tunnel, après le tronc.
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0, { timeout: 2000, label: 'E5 : porte voisine ouverte une fois Tess partie' });
  await t.key('ArrowUp', 80);
  await waitFor(t, (d) => Math.abs(window.__xr2d.scene.player.x - (d.col * 64 + 32)) < 2 && window.__xr2d.scene.player.feetY === (d.row + 1) * 64, {
    timeout: 2000,
    label: 'E5 : Kaï dans le tunnel (porte D)',
    arg: DOOR_D,
  });
  await t.wait(300);
  await t.shot('e-tunnel');
  assertEq((await saved(t)).crew, [], 'E5 : Tess secourue, mais dans l’équipage seulement à la réussite');

  // Pluie de spores (fenêtre 160-162, pluie 163-179) : 8 taches, chaque spore lâchée sur la sienne après l'annonce.
  await t.ev((c) => window.__xr2d.teleport(c, 11), SPORES_COL);
  await waitFor(t, () => window.__xr2d.scene.sporeRain.history.length >= 1, { timeout: 3000, label: 'C3 : première tache' });
  await t.wait(500);
  const spot0 = await t.ev(() => {
    const p = window.__xr2d.scene.sporeRain.spots.find((x) => x.on);
    return p ? { visible: p.img.visible, frame: p.img.frame.name, y: p.img.y } : null;
  });
  assert(spot0 && spot0.visible, `C3 : tache au sol visible avant la chute (${fmt(spot0)})`);
  await t.shot('c-spore-spot');
  // Une spore abattue au tir : visée par un tir vertical du ShotPool (fiche de l'arme), sous elle.
  await waitFor(t, () => window.__xr2d.scene.spores.active > 0, { timeout: 3000, interval: 20, label: 'C3 : une spore tombe' });
  const shot = await t.ev(() => {
    const s = window.__xr2d.scene;
    const sp = s.spores.spores.find((x) => x.alive);
    const y0 = sp.img.y;
    s.lasers.fire(sp.img.x, sp.img.y + 140, -Math.PI / 2, s.gun.stats, sp.img.x, sp.img.y + 150);
    window.__shotSpore = sp;
    return { x: sp.img.x, y: y0 };
  });
  await waitFor(t, () => !window.__shotSpore.alive, { timeout: 2000, interval: 20, label: 'C3 : spore abattue' });
  const shotEnd = await t.ev(() => window.__shotSpore.img.y);
  t.log('C3 : spore abattue', fmt(shot), '→ y', Math.round(shotEnd));
  assert(shotEnd < 11 * T, `C3 : spore abattue en l’air (y ${Math.round(shotEnd)}), pas au sol`);
  // Une spore blesse : sans mode dieu, Kaï posé sous la prochaine tache.
  await t.ev(() => window.__xr2d.god(false));
  const h0 = await t.ev(() => window.__xr2d.info().hearts);
  const n0 = await t.ev(() => window.__xr2d.scene.sporeRain.history.length);
  await waitFor(t, (n) => window.__xr2d.scene.sporeRain.history.length > n, { timeout: 2000, interval: 20, arg: n0, label: 'C3 : tache suivante' });
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const h = s.sporeRain.history[s.sporeRain.history.length - 1];
    s.player.invulnMs = 0;
    window.__xr2d.teleport(Math.floor(h.x / 64), Math.round(h.groundY / 64) - 1);
    window.__hurtSpot = h;
  });
  await waitFor(t, (h) => window.__xr2d.info().hearts < h, { timeout: 4000, interval: 20, arg: h0, label: 'C3 : Kaï touché par la spore' });
  await t.ev(() => window.__xr2d.god(true));
  await waitFor(t, () => !window.__xr2d.scene.sporeRain.active, { timeout: 12000, label: 'C3 : pluie finie' });
  const d = await decor(t);
  t.log('C3 : pluie', fmt(d.rain.history.map((h) => [Math.round(h.x / 64), Math.round(h.droppedAt - h.announcedAt)])));
  assertEq(d.rain.history.length, DROPS, `C3 : ${DROPS} spores annoncées`);
  for (const h of d.rain.history) {
    const col = Math.floor(h.x / 64);
    assert(col >= RAIN[0] && col <= RAIN[1], `C3 : tache dans la pluie ${RAIN.join('-')} (colonne ${col})`);
    assert(h.droppedAt >= 0 && h.droppedAt - h.announcedAt >= WARN_MS - 50, `C3 : spore lâchée ${Math.round(h.droppedAt - h.announcedAt)} ms après sa tache (≥ ${WARN_MS - 50})`);
  }
  assert((await sfxCount(t, 'sporeDrop')) >= DROPS, 'C3 : son « sporeDrop » à chaque spore');

  // Chaque événement une fois.
  assertEq(d.events, [['shadow', 1], ['quake', 1], ['spores', 1]], 'événements du décor joués une fois chacun');
  assertEq([d.shadowPasses, d.trunk.state], [1, 'down'], 'une ombre, tronc couché');

  // ------------------------------------------------------------ F. Plus de vies : échec, Tess attend de nouveau
  await t.ev(() => window.__xr2d.god(false));
  for (let lost = 1; lost <= 3; lost++) {
    await waitFor(t, () => window.__xr2d && window.__xr2d.scene.state === 'play', { timeout: 10000, label: `F : Kaï en jeu avant la mort n°${lost}` });
    await t.ev(() => window.__xr2d.kill());
    await waitFor(t, (n) => window.__xr2d.scene.lives === 3 - n, { timeout: 3000, label: `F : ${3 - lost} vie(s)`, arg: lost });
  }
  await waitForScreen(t, 'fail', { timeout: 20000 });
  const f = await saved(t);
  assert(f.crew.length === 0 && !f.best.j2, `F : échec, Tess hors de l’équipage, j2 non réussie (${fmt({ crew: f.crew, best: f.best })})`);
  await press(t, 'fail', 'Réessayer');
  await waitFor2dPlay(t);
  const f2 = await t.ev(() => {
    const n = window.__xr2d.scene.npc;
    return { state: n.state, visible: n.img.visible, rescuedAt: n.rescuedAt };
  });
  assertEq(f2, { state: 'wait', visible: true, rescuedAt: -1 }, 'F : RÉESSAYER, Tess attend de nouveau dans sa salle');

  // ------------------------------------------------------------ G. Secourue, arène, balise : Tess dans l'équipage
  // Partie neuve : Kaï file vers le tunnel à pleine course, bonus de vitesse compris, depuis le point de contrôle
  // 116 : le tronc tombe avant qu'il n'y entre (fenêtre de la secousse à 13 colonnes de l'entrée).
  await t.ev(() => window.__xr2d.god(true));
  await placeKai(t, 114, 11, 'G : avant la fenêtre de la secousse');
  await t.ev(() => window.__xr2d.power('speed'));
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitFor(t, () => window.__xr2d.scene.trunks[0].state === 'down', { timeout: 4000, interval: 10, label: 'G : tronc couché' });
    const g1 = await t.ev(() => ({ right: window.__xr2d.scene.player.right, speedMul: window.__xr2d.scene.player.speedMul }));
    t.log('G : tronc couché, Kaï à pleine course', fmt(g1));
    assert(g1.speedMul > 1.3 && g1.right <= ROCK_COL * T, `G : tronc couché avant que Kaï n'entre dans le tunnel (${fmt(g1)})`);
    await t.wait(600);
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
  assert((await t.ev(() => window.__xr2d.scene.player.right)) <= ROCK_COL * T + 1, 'G : Kaï arrêté devant le tunnel bouché');
  await placeKai(t, DOOR_C.col, DOOR_C.row, 'G : devant la porte voisine de Tess');
  await t.key('ArrowUp', 80);
  await waitFor(t, () => window.__xr2d.scene.npc.state === 'gone', { timeout: 12000, label: 'G : Tess secourue de nouveau' });
  // Arène du Scarabée-titan : barrières fermées, champignons de l'arène.
  await t.ev(() => window.__xr2d.boss.enter());
  await waitFor(t, () => window.__xr2d.boss.info().state === 'fight' && window.__xr2d.boss.info().arena.state === 'closed', {
    timeout: 5000,
    label: 'G : combat du mini-boss commencé',
  });
  const g0 = await t.ev((cols) => {
    const s = window.__xr2d.scene;
    const i = window.__xr2d.boss.info();
    return { id: i.id, col0: i.arena.col0, col1: i.arena.col1, mush: s.mushrooms.list.filter((m) => cols.includes(Math.floor(m.img.x / 64))).length };
  }, ARENA_MUSH);
  assertEq(g0, { id: 'beetleTitan', col0: ARENA.col0, col1: ARENA.col1, mush: 2 }, `G : arène ${ARENA.col0}-${ARENA.col1}, Scarabée-titan, 2 champignons`);
  const gb = await t.ev(() => window.__xr2d.scene.mushrooms.bounces);
  await t.ev((c) => window.__xr2d.teleport(c, 8), ARENA_MUSH[0]);
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n, { timeout: 3000, interval: 20, arg: gb, label: 'G : rebond sur un champignon de l’arène' });
  await t.wait(250);
  await t.shot('g-arena');
  // Boss vaincu, puis Kaï posé après le second champignon et la seconde borne (sinon il rebondit sans fin ; en
  // courant, on les franchit d'un rebond).
  await t.ev(() => window.__xr2d.boss.win());
  await waitFor(t, () => window.__xr2d.boss.info().state === 'gone', { timeout: 6000, label: 'G : mini-boss enfui' });
  await t.ev((c) => window.__xr2d.teleport(c, 11), ARENA.col1 + 1);
  await waitGrounded(t, 'G : Kaï au sol');
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitFor(t, () => window.__xr2d.scene.state === 'exit' && window.__xr2d.scene.exit.kind === 'beacon', { timeout: 10000, label: 'G : balise atteinte en courant' });
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
  await waitForScreen(t, 'results', { timeout: 25000 });
  const R = '.screens [data-screen="results"].is-active';
  await t.page.locator(`${R} .results-panel`).click({ position: { x: 8, y: 8 } }); // fin des animations
  const res = await t.ev((sel) => {
    const r = document.querySelector(`${sel} .detail--reward`);
    const b = document.querySelector(`${sel} .results-bonus-value`);
    return { reward: r ? r.dataset.reward : null, bonus: b ? b.textContent.replace(/\s/g, '') : null };
  }, R);
  const details = await resultDetails(t);
  t.log('G : résultats', fmt({ ...res, details }));
  assertEq([res.reward, details['Équipière'], res.bonus], ['crew:tess', 'Tess', '+2000'], 'G : résultats « Équipière : Tess » et prime du boss');
  const LAYOUT = [`${R} .results-bonus`, `${R} .results-score`, `${R} .detail`, `${R} .detail-label`, `${R} .detail-value`, `${R} .results-actions .btn`, `${R} .results-actions .btn-label`];
  const noScroll = (sel) => {
    const p = document.querySelector(`${sel} .results-panel`);
    return p.scrollHeight <= p.clientHeight + 1;
  };
  await assertLayout(t, LAYOUT, 'G : résultats 844x390');
  assert(await t.ev(noScroll, R), 'G : panneau des résultats entier, sans défilement (844x390)');
  await t.shot('g-results');
  await t.page.setViewportSize({ width: 640, height: 320 });
  await t.wait(400);
  await assertLayout(t, LAYOUT, 'G : résultats 640x320');
  assert(await t.ev(noScroll, R), 'G : panneau des résultats entier, sans défilement (640x320)');
  await t.shot('g-results-640x320');
  await t.page.setViewportSize({ width: 844, height: 390 });
  const save = await readSave(t);
  assertEq(save.crew, ['tess'], 'G : Tess dans l’équipage après la réussite');
  const st = await t.ev(() => window.__xrShell.info().stages.find((x) => x.id === 'j2'));
  assertEq([st.cleared, st.unlocked], [true, true], 'G : j2 réussie');

  // ------------------------------------------------------------ H. j2 rejouée, Tess à bord : seule sa capsule reste
  await t.goto('?touch=0&stage=j2');
  await waitFor2dPlay(t);
  await waitGrounded(t, 'H : Kaï au départ');
  await removeEnemies(t);
  await t.ev(() => window.__xr2d.god(true));
  const again = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { crew: [...s.session.hooks.loadout.crew], state: s.npc.state, visible: s.npc.img.visible, capsule: s.npc.capsule.visible };
  });
  assertEq(again, { crew: ['tess'], state: 'gone', visible: false, capsule: true }, 'H : Tess déjà à bord (hooks.loadout.crew), seule sa capsule reste');
  // Fenêtre du signal de détresse (108-111) : message muet, Tess étant à bord.
  await placeKai(t, 109, 11, 'H : fenêtre du signal de détresse');
  await waitFor(t, () => window.__xr2d.scene.levelEvents.windows.find((w) => w.id === 'j2-signal').state === 1, { timeout: 2000, label: 'H : fenêtre du signal franchie' });
  await t.wait(300);
  const againRadio = await t.ev(() => window.__xrShell.radio());
  assert(!againRadio.played.includes('j2-signal') && !againRadio.waiting.includes('j2-signal'), `H : signal de détresse muet (${fmt({ played: againRadio.played, waiting: againRadio.waiting })})`);
  // La porte voisine de la capsule s'ouvre d'emblée : ↑ → porte du tunnel, sans dialogue ni message.
  const againT0 = await pageNow(t);
  await placeKai(t, DOOR_C.col, DOOR_C.row, 'H : devant la porte voisine de la capsule');
  await waitFor(t, () => window.__xr2d.scene.doors.nearIndex >= 0 && !window.__xr2d.scene.npc.near, { timeout: 2000, label: 'H : porte voisine ouverte' });
  await t.wait(300);
  await t.shot('h-replay-capsule');
  await t.key('ArrowUp', 80);
  await waitFor(t, (d) => Math.abs(window.__xr2d.scene.player.x - (d.col * 64 + 32)) < 2 && window.__xr2d.scene.player.feetY === (d.row + 1) * 64, {
    timeout: 2000,
    label: 'H : Kaï dans le tunnel (porte D)',
    arg: DOOR_D,
  });
  const againEnd = await t.ev(() => ({ state: window.__xr2d.scene.npc.state, played: window.__xrShell.radio().played.slice() }));
  assert(againEnd.state === 'gone' && !againEnd.played.includes('j2-tess') && !againEnd.played.includes('j2-rescue'), `H : ni dialogue ni sauvetage (${fmt(againEnd)})`);
  assertEq((await toastsSince(t, 'Tess est à bord', againT0)).length, 0, 'H : pas de message « Tess est à bord ! »');
}
