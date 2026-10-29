// Gardienne de j3 (méduse-baleine, plan 04 étapes 10 et 11 ; boss en touches : point 20, 6 touches, 2 par phase),
// sauvegarde neuve sans mode test (donc sans double saut), au clavier :
//  A. j3 depuis le début : arrivée par le faisceau, radio de LUMA brouillée ; puis ?at=boss (départ au seul point de
//     contrôle du niveau, 159, juste avant l'arène) : arène 162-179, méduse-baleine cachée en attente, méduse du décor
//     ('looming') visible, 2 guêpes de réserve cachées ; Kaï dans l'arène : barrières, sons, musique 'guardian' puis
//     musicLevel(0), barre « Méduse-baleine » en 6 crans « Phase 1/3 », méduse du décor cachée, arrivée d'en haut ;
//  B. phase 1 : corps au-dessus de la tête de Kaï au sommet d'un saut ; tentacule abattu annoncé par une marque au
//     sol sous Kaï (800 ms) qui le blesse ; spores annoncées par une tache au sol (≥ 950 ms avant la chute) ; cœur
//     descendu à 3 tuiles au plus du canon, ouvert 3 s ; corps insensible (hitBy 0, tir du ShotPool arrêté, vie
//     intacte) ; cœur fermé : 0 ;
//  B2. hors plongée, corps inoffensif : saut depuis une passerelle et rebond sur le champignon 165 sous elle, dans
//     son corps, sans cœur perdu ; tache d'une spore au-dessus du champignon posée sur son chapeau, effacée quand la
//     spore y éclate ;
//  C. touches : tir réel vers le haut (↑ + J) sous le cœur (clignotement, cœur refermé : 0 ensuite), tir en
//     diagonale (2e touche : phase 2, musicLevel(1) au début de la colère, guêpes appelées, hors score) ;
//  D. phase 2 : balayage à mi-hauteur (Kaï accroupi : aucun cœur perdu ; debout touché, au-dessus non : contrat
//     hurts), pompe vers le haut (3e touche), cœur qui s'ouvre touché dans son bouton (4e : phase 3, musicLevel(2)) ;
//  E. phase 3 : plongée annoncée par son ombre au sol (1 s) qui blesse dessous, pas à côté ; cœur ouvert 4 s ;
//  F. vie perdue : retour au K, gardienne à neuf et cachée, guêpes rangées, musique du niveau, méduse du décor
//     revenue ; nouvel essai : 'guardian' puis musicLevel(0) explicite ;
//  G. défaite (__xr2d.boss.win) : état 'exit', image de la défaite, cri, elle s'élève ; résultats ≤ 2,62 s plus
//     tard (horloge de la scène) avec « Compétence : double saut » et « Boss vaincu +5 000 » ; double saut
//     enregistré ; textures libérées ; puis j1 (partie suivante) : double saut actif et réel ;
//  H. « Réessayer le combat » (plan 04, choix 7), j3 depuis le début : cristaux, 2 ennemis abattus, pluie de spores
//     jouée, puis le K 159 (instantané) ; vies épuisées en plein combat → « Réessayer le combat » : départ au K sans
//     faisceau, 3 vies, état noté rendu (cristaux, HUD, ennemis morts, radio et pluie déjà jouées, sans reprise),
//     gardienne à neuf et cachée, méduse du décor visible ; défaite → score sans prime de vies ; puis Rejouer, vies
//     épuisées en combat → « Réessayer » simple : début du niveau (faisceau, rien de gardé).
import { assert, assertEq, fmt, readSave, screenText, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { hudPlatform, press } from '../lib/core.mjs';
import { ends, loseFight, pressScreen, progress2d, recordUi, snapFields, snapOf, waitGrounded, waitPlay } from '../lib/game2d.mjs';

export const meta = {
  title: 'Gardienne de j3 : méduse-baleine en 3 phases, cœur seul vulnérable, vie perdue, défaite, double saut, réessayer le combat',
  suites: ['full'],
  dev: true,
  timeoutMs: 360000,
};

/**
 * Valeurs recopiées : j3 (arène, point de contrôle, passerelles), src/game2d/engine/bosses/whale.ts (MAX_LIFE, CANNON_H,
 * HEART_LOW_H, SLAM_WARN_MS, SPORE_WARN_MS, DIVE_WARN_MS, HEART_OPEN_MS, SWEEP_H, WASP_H, DEFEAT_MS, BODY_MID),
 * constants.ts (corps de Kaï 70 px, saut de 4,2 tuiles), exit.ts (EXIT_MAX_MS), tuning.ts (SCORE_GUARDIAN).
 */
const URL = '?touch=1&stage=j3';
/** Départ au point de contrôle d'avant l'arène (serveur de dev). */
const URL_BOSS = '?touch=1&stage=j3&at=boss';
const T = 64;
const ARENA = { col0: 162, col1: 179, k: 159, mush: [165, 176] };
/** Colonne du milieu de l'arène (entre deux passerelles). */
const MID = ARENA.col0 + 7;
/** Colonnes des passerelles '=' de l'arène (ligne 9, à 3 tuiles du sol). */
const PLATFORM_COLS = [167, 168, 170, 171, 173, 174];
const MAX_LIFE = 6;
const GROUND = 12 * T;
const HEART_LOW_H = 38 + 3 * T;
const JUMP_HEAD = 70 + 4.2 * T;
const SLAM_WARN_MS = 800;
const SPORE_WARN_MS = 1000;
const DIVE_WARN_MS = 1000;
const HEART_OPEN_MS = [3000, 3000, 4000];
const SWEEP_H = 68;
const WASP_H = 110;
const DEFEAT_MS = 2500;
const EXIT_MAX_MS = 2620;
const BODY_MID = 13;
const SCORE_GUARDIAN = 5000;
/** j3 (parTimeS) ; score : tuning.ts (SCORE_CRYSTAL 50, SCORE_ENEMY 100, TIME_BONUS_PER_S 10). */
const PAR_TIME_S = 240;
/** Colonne de la fenêtre de la pluie de spores de j3 (102-104 ; le rocher 103-104 est en ligne 11). */
const SPORES_COL = 102;
const FAIL = '.screens [data-screen="fail"].is-active';
const WHALE_TEX = ['boss-whale', 'boss-whale-heart', 'boss-whale-tentacle', 'boss-whale-spot', 'w1-barrier-top', 'w1-barrier-mid', 'w1-barrier-bottom'];

function boss(t) {
  return t.ev(() => (window.__xr2d ? window.__xr2d.boss.info() : null));
}

/** Attend une condition sur __xr2d.boss.info() (`src` : expression sur `i`). */
function waitBoss(t, src, label, timeout = 20000) {
  return waitFor(
    t,
    (s) => {
      const i = window.__xr2d && window.__xr2d.boss.info();
      return !!i && new Function('i', `return (${s});`)(i) && i;
    },
    { timeout, interval: 20, label, arg: src },
  );
}

/** Sons, musiques et intensités notés à partir de maintenant (enveloppe de __xrShell.audio), dans l'ordre. */
function spyAudio(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    window.__bwSfx = [];
    window.__bwMusic = [];
    if (a.__bwSpied) return;
    a.__bwSpied = true;
    const sfx = a.sfx;
    const music = a.music;
    const level = a.musicLevel;
    a.sfx = function (id, o) {
      window.__bwSfx.push(id);
      return sfx.call(this, id, o);
    };
    a.music = function (id) {
      window.__bwMusic.push(`music:${id}`);
      return music.call(this, id);
    };
    a.musicLevel = function (n) {
      window.__bwMusic.push(`level:${n}`);
      return level.call(this, n);
    };
  });
}

function audioLog(t) {
  return t.ev(() => ({ sfx: window.__bwSfx.slice(), music: window.__bwMusic.slice() }));
}

function bossBar(t) {
  return t.ev(() => {
    const e = document.querySelector('.hud-boss');
    const fill = e.querySelector('.boss-fill');
    const m = /scaleX\(([\d.]+)\)/.exec(fill.style.transform);
    return {
      on: e.classList.contains('is-on') && getComputedStyle(e).display !== 'none',
      name: e.querySelector('.boss-name').textContent,
      phase: e.querySelector('.boss-phase').textContent,
      life: m ? Number(m[1]) : null,
      marks: e.querySelectorAll('.boss-mark').length,
      steps: e.querySelectorAll('.boss-mark.is-step').length,
    };
  });
}

/** Méduse du décor (parallaxe 'looming') : visible ? */
function decorWhale(t) {
  return t.ev(() =>
    window.__xr2d.scene.children.list.some((c) => c.texture && c.texture.key === 'bg-jungle-creature-looming' && c.visible && c.alpha > 0.3),
  );
}

/**
 * Relevé image par image (postupdate de la scène) : changements d'acte et de sous-étape (heure de la scène, phase,
 * vie), marge entre le bas de la jupe et le sommet du saut de Kaï hors plongée, jupe au plus bas en plongée, bout du
 * balayage, cœurs perdus (acte, tentacule qui blesse), spores lâchées (temps depuis leur tache, tache visible).
 */
function installRecorder(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const b = s.boss;
    const log = (window.__bw = { acts: [], minClear: Infinity, diveSkirt: -Infinity, sweep: { min: Infinity, max: -Infinity, dy: [] }, hurts: [], drops: [], glow: null });
    let last = '';
    let hearts = s.hearts;
    const drop = b.dropSpore.bind(b);
    b.dropSpore = (spot) => {
      log.drops.push({ x: Math.round(spot.x), ms: Math.round(spot.ms), spot: spot.img.visible, at: Math.round(s.clockMs) });
      return drop(spot);
    };
    const on = () => {
      if (b.state === 'wait') return;
      const i = b.info();
      const key = `${i.act}:${i.sub}`;
      if (key !== last) {
        log.acts.push({ act: i.act, sub: i.sub, at: Math.round(s.clockMs), phase: b.phase, life: b.life, x: Math.round(b.x) });
        last = key;
      }
      if (b.state === 'fight' && i.act !== 'intro' && i.act !== 'dive') log.minClear = Math.min(log.minClear, i.groundY - (b.y + 81.4));
      if (i.act === 'dive' && i.sub === 2) log.diveSkirt = Math.max(log.diveSkirt, i.skirtY);
      if (i.act === 'sweep' && i.sub === 1) {
        log.sweep.min = Math.min(log.sweep.min, i.tip.x);
        log.sweep.max = Math.max(log.sweep.max, i.tip.x);
        log.sweep.dy.push(i.groundY - i.tip.y);
      }
      if (s.hearts < hearts) log.hurts.push({ at: Math.round(s.clockMs), act: i.act, sub: i.sub, tentacle: i.hurting, kx: Math.round(s.player.x) });
      hearts = s.hearts;
    };
    s.events.on('postupdate', on);
    // Clignotement relevé dans la même tâche que la touche.
    const hitBy = b.hitBy.bind(b);
    b.hitBy = (x, y) => {
      const life = b.life;
      const r = hitBy(x, y);
      if (b.life < life) log.glow = { on: b.heartGlow.visible, at: b.heartGlow.x === b.heart.x && b.heartGlow.y === b.heart.y, frame: String(b.heartGlow.frame.name) === String(b.heart.frame.name) };
      return r;
    };
  });
}

/** Durée de la sous-étape `act:sub` la plus récente (relevé), sur l'horloge de la scène. */
function subDuration(acts, act, sub) {
  for (let k = acts.length - 2; k >= 0; k--) {
    if (acts[k].act === act && acts[k].sub === sub) return acts[k + 1].at - acts[k].at;
  }
  return -1;
}

/** Kaï posé sur le sol de l'arène en colonne `col`, au repos. */
async function placeKai(t, col, label) {
  await t.ev((c) => window.__xr2d.teleport(c, 11), col);
  await waitGrounded(t, label);
}

/** Danger pour Kaï : mode dieu coupé, sans bouclier ni invulnérabilité. */
function exposeKai(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(false);
    s.player.invulnMs = 0;
    s.player.shield = false;
  });
}

/** Kaï posé au sol en x (px), tourné vers `facing`, au repos. */
async function placeAt(t, x, facing, label) {
  await t.ev(
    ([px, f]) => {
      const s = window.__xr2d.scene;
      s.player.teleport(px, s.boss.info().groundY);
      s.player.facing = f;
    },
    [x, facing],
  );
  await waitGrounded(t, label);
}

/** Bouche du canon en visée haute : 19 px devant Kaï (épaule avancée et canon tourné) : Kaï posé pour viser le cœur. */
async function placeUnderHeart(t, facing, label) {
  const hx = (await boss(t)).heartX;
  await placeAt(t, hx - facing * 19, facing, label);
}

/** Fenêtre suivante du cœur ouvert (acte heart, sous-étape 1), Kaï en mode dieu. */
async function nextOpenHeart(t, label) {
  await t.ev(() => window.__xr2d.god(true));
  await waitBoss(t, "i.act !== 'heart' || i.sub !== 1", `${label} : fenêtre précédente finie`);
  return waitBoss(t, "i.act === 'heart' && i.sub === 1 && i.open", `${label} : cœur ouvert`, 25000);
}

/**
 * Salve réelle du Gun de Kaï (fiche de l'arme tenue : plombs de la pompe compris) dans la visée `aim`, tourné vers
 * `facing`, spores en l'air et à venir retirées ; renvoie la bouche du canon et le cœur à cet instant.
 */
function salvo(t, aim, facing) {
  return t.ev(
    ([a, f]) => {
      const s = window.__xr2d.scene;
      const p = s.player;
      p.facing = f;
      p.aim = a;
      const i = s.boss.info();
      const r = { x: Math.round(p.gunX), y: Math.round(p.gunY), angle: Math.round((p.fireAngle * 180) / Math.PI), heart: [i.heartX, i.heartY, i.act, i.sub, i.open] };
      // Spores en l'air et à venir : un tir les abat (une spore lâchée au-dessus de Kaï arrêterait celui-ci).
      s.boss.clearSpores();
      s.spores.clear();
      s.gun.emit();
      p.aim = 'front';
      return r;
    },
    [aim, facing],
  );
}

export default async function (t) {
  await recordUi(t);
  await t.goto(URL);

  // ---------- A. Départ de j3 : arrivée, radio brouillée ; puis ?at=boss : arène en attente, entrée
  await waitFor(t, () => !!(window.__xr2d && window.__xr2d.scene && window.__xr2d.scene.arrival), { timeout: 30000, label: 'A : arrivée' });
  const arrival = await t.ev(() => window.__xr2d.scene.arrival.kind);
  await waitPlay(t);
  const radio = await waitFor(
    t,
    () => {
      const r = window.__xrShell.radio();
      const e = document.querySelector('.hud .xr-bubble--radio');
      return r.current === 'j3-start' && e && !e.classList.contains('is-hidden') ? { mood: e.dataset.mood, speaker: e.dataset.speaker } : false;
    },
    { timeout: 6000, label: 'A : message de départ de LUMA' },
  );
  assertEq({ arrival, radio }, { arrival: 'beam', radio: { mood: 'scrambled', speaker: 'luma' } }, 'A : arrivée par le faisceau, radio de LUMA brouillée');
  assert(await decorWhale(t), 'A : méduse du décor visible dès le départ');
  await t.shot('start-scrambled');

  // Combat : départ au seul point de contrôle du niveau, juste avant l'arène (?at=boss), sans arrivée.
  await t.goto(URL_BOSS);
  const g = await waitPlay(t);
  const k0 = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { x: Math.round(s.player.x), respawnX: s.respawnX, arrival: s.arrival, checkpoints: s.parsed.checkpoints.map((k) => k.col) };
  });
  assertEq(
    k0,
    { x: ARENA.k * T + 32, respawnX: ARENA.k * T + 32, arrival: null, checkpoints: [ARENA.k] },
    `A : ?at=boss : départ au point de contrôle ${ARENA.k}, le seul du niveau, sans arrivée`,
  );
  const a0 = await t.ev((keys) => {
    const s = window.__xr2d.scene;
    window.__bwGame = s.game;
    const h = s.session.hooks;
    const oc = h.onComplete;
    h.onComplete = (r) => {
      window.__bwResult = JSON.parse(JSON.stringify(r));
      return oc(r);
    };
    // Fin du niveau (horloge de la scène).
    const fin = s.finishLevel.bind(s);
    s.finishLevel = () => {
      window.__bwFinish = { at: Math.round(s.clockMs), state: s.state };
      return fin();
    };
    return {
      level: s.session.level.id,
      ending: s.session.level.ending,
      exit: s.exit,
      missing: keys.filter((k) => !s.textures.exists(k)),
      reserve: s.enemies.list.filter((e) => e.summoned).map((e) => `${e.kind}:${e.alive}:${e.sprite.visible}`),
      dj: window.__xr2d.info().canDoubleJump,
    };
  }, WHALE_TEX);
  assertEq(
    a0,
    { level: 'jungle3', ending: 'guardian', exit: null, missing: [], reserve: ['f:false:false', 'f:false:false'], dj: false },
    'A : niveau du gardien sans sortie, textures générées, 2 guêpes de réserve cachées, pas de double saut',
  );
  assert(await decorWhale(t), 'A : méduse du décor visible avant le combat');
  let b = await boss(t);
  assert(
    b.id === 'whale' && b.name === 'Méduse-baleine' && b.state === 'wait' && !b.visible && b.life === MAX_LIFE && b.maxLife === MAX_LIFE &&
      b.phases === 3 && b.arena.state === 'open' && b.arena.col0 === ARENA.col0 && b.arena.col1 === ARENA.col1,
    `A : méduse-baleine cachée, en attente, ${MAX_LIFE} touches, 3 phases (${fmt(b)})`,
  );
  // Dans l'arène.
  await t.ev(() => window.__xr2d.god(true));
  await waitGrounded(t, 'A : Kaï au point de contrôle');
  await spyAudio(t);
  await installRecorder(t);
  await t.ev(() => window.__xr2d.boss.enter());
  b = await waitBoss(t, "i.state === 'fight'", 'A : combat commencé', 5000);
  assert(b.act === 'intro' && b.visible && b.arena.state === 'closed', `A : arrivée de la méduse-baleine, barrières fermées (${fmt(b)})`);
  await waitFor(t, () => document.querySelector('.hud-boss.is-on') !== null, { timeout: 2000, label: 'A : barre de boss affichée' });
  assertEq(await bossBar(t), { on: true, name: 'Méduse-baleine', phase: 'Phase 1/3', life: 1, marks: 5, steps: 3 }, 'A : barre de boss en 6 crans, 3 phases');
  let au = await audioLog(t);
  assertEq(au.music, ['music:guardian', 'level:0'], 'A : musique du gardien, intensité 0');
  assert(au.sfx.includes('barrier') && au.sfx.includes('whaleCry'), `A : sons de la barrière et du cri (${fmt(au.sfx)})`);
  assert(!(await decorWhale(t)), 'A : méduse du décor cachée pendant le combat');
  const intro = await t.ev(() => ({ y: window.__xr2d.boss.info().y, hover: window.__xr2d.boss.info().hoverY }));
  assert(intro.y < intro.hover - 100, `A : elle arrive d'en haut (${fmt(intro)})`);
  await waitBoss(t, "i.act === 'drift'", 'A : en place');
  await t.shot('arena');

  // ---------- B. Phase 1 : tentacule abattu, spores, cœur, corps insensible
  await placeKai(t, MID, 'B : Kaï au milieu de l’arène');
  b = await waitBoss(t, "i.act === 'slam' && i.sub === 0", 'B : annonce du tentacule abattu');
  await exposeKai(t);
  const mark = await t.ev(() => {
    const s = window.__xr2d.scene;
    const m = s.boss.slamMark;
    return { visible: m.visible, x: Math.round(m.x), y: Math.round(m.y), kai: Math.round(s.player.x), hearts: s.hearts };
  });
  assert(mark.visible && Math.abs(mark.x - mark.kai) <= 2 && mark.y === GROUND, `B : marque au sol sous Kaï (${fmt(mark)})`);
  await t.wait(350);
  await t.shot('slam-warn');
  await waitBoss(t, "i.act === 'slam' && i.sub === 2", 'B : tentacule au sol');
  await t.shot('slam-hit');
  await t.ev(() => window.__xr2d.god(true));
  let rec = await t.ev(() => window.__bw);
  const slamWarn = subDuration(rec.acts, 'slam', 0);
  const slamHurt = rec.hurts.find((h) => h.act === 'slam');
  assert(Math.abs(slamWarn - SLAM_WARN_MS) <= 60, `B : tentacule annoncé ${SLAM_WARN_MS} ms avant la frappe (${slamWarn} ms)`);
  assert(slamHurt && slamHurt.tentacle && slamHurt.sub >= 1, `B : Kaï resté sous la marque blessé par le tentacule (${fmt(rec.hurts)})`);

  // Première fenêtre du cœur : laissée passer (ouverte 3 s), corps insensible.
  b = await waitBoss(t, "i.act === 'heart' && i.sub === 1", 'B : cœur ouvert', 15000);
  const heart = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bb = s.boss;
    const i = bb.info();
    const life = bb.life;
    const body = bb.hitBy(bb.x, bb.y);
    const skirt = bb.hitBy(bb.x - 120, bb.y + 20);
    return { heartY: i.heartY, ground: i.groundY, frame: i.heartFrame, body, skirt, life: bb.life - life };
  });
  assertEq(heart.ground, GROUND, 'B : sol de l’arène');
  assert(heart.ground - heart.heartY === HEART_LOW_H && heart.ground - 38 - heart.heartY <= 3 * T, `B : cœur descendu à 3 tuiles au plus du canon (${fmt(heart)})`);
  assertEq([heart.body, heart.skirt, heart.life], [0, 0, 0], 'B : corps insensible (hitBy 0, aucune touche)');
  // Tir du ShotPool vers le haut dans le corps (loin du cœur) : arrêté sans effet.
  const shot = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bb = s.boss;
    const x = bb.x + 120;
    s.lasers.fire(x, bb.y + 140, -Math.PI / 2, s.gun.stats, x, bb.y + 150);
    return { life: bb.life };
  });
  await t.wait(400);
  assertEq((await boss(t)).life, shot.life, 'B : tir dans le corps arrêté sans effet');
  await t.shot('heart-open');
  await waitBoss(t, "i.act === 'drift'", 'B : cœur remonté');
  rec = await t.ev(() => window.__bw);
  const open1 = subDuration(rec.acts, 'heart', 1);
  assert(Math.abs(open1 - HEART_OPEN_MS[0]) <= 60, `B : cœur ouvert ${HEART_OPEN_MS[0]} ms en phase 1 (${open1} ms)`);
  // Cœur fermé (pendant sa descente) : arrêté sans touche.
  b = await waitBoss(t, "i.act === 'heart' && i.sub === 0 && i.heartK > 0.6", 'B : cœur qui descend, fermé', 20000);
  const closed = await t.ev(() => {
    const bb = window.__xr2d.boss;
    const i = bb.info();
    const s = window.__xr2d.scene;
    return { r: s.boss.hitBy(i.heartX, i.heartY), frame: i.heartFrame, life: s.boss.life };
  });
  assertEq(closed, { r: 0, frame: 0, life: MAX_LIFE }, 'B : cœur fermé : tir arrêté sans touche');
  // Spores du cycle : chacune lâchée sur sa tache, au moins 950 ms après son annonce.
  rec = await t.ev(() => window.__bw);
  t.log('spores', fmt(rec.drops));
  assert(rec.drops.length >= 3 && rec.drops.every((d) => d.spot && d.ms >= SPORE_WARN_MS - 50), `B : spores annoncées par une tache au sol (${fmt(rec.drops)})`);
  assert(rec.minClear >= JUMP_HEAD, `B : jupe au-dessus de la tête de Kaï au sommet d'un saut (${rec.minClear.toFixed(1)} ≥ ${JUMP_HEAD})`);

  // ---------- B2. Hors plongée, corps inoffensif : saut depuis une passerelle et rebond sur un champignon sous elle
  // Kaï contre la première borne pendant la dérive suivante : elle se cale de ce côté, au-dessus du premier champignon.
  await placeKai(t, ARENA.col0 + 1, 'B2 : Kaï contre la première borne');
  await waitBoss(t, "i.act === 'drift'", 'B2 : dérive vers Kaï');
  b = await waitBoss(t, "i.act === 'heart' && i.sub === 1", 'B2 : fenêtre du cœur', 15000);
  const plat = PLATFORM_COLS.reduce((best, c) => (Math.abs(c * T + 32 - b.x) < Math.abs(best * T + 32 - b.x) ? c : best));
  assert(b.x - 150 < ARENA.mush[0] * T + 32 && Math.abs(plat * T + 32 - b.x) < 150, `B2 : gardienne au-dessus du champignon ${ARENA.mush[0]} et de la passerelle ${plat} (${fmt({ x: b.x })})`);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const bb = s.boss;
    // Spores retirées : seul le corps pourrait blesser. Relevé : Kaï au plus haut (par rapport au bas de la jupe).
    bb.clearSpores();
    s.spores.clear();
    const r = (window.__bwBody = { hearts: s.hearts, bounces: s.mushrooms.bounces, deep: Infinity, dx: 0, attack: false, off: null });
    const on = () => {
      const p = s.player;
      const d = p.top - (bb.y + 81.4);
      if (d < r.deep) {
        r.deep = Math.round(d);
        r.dx = Math.round(p.x - bb.x);
      }
      if (bb.atkHurting || bb.act === 'dive') r.attack = true;
    };
    s.events.on('postupdate', on);
    r.off = () => s.events.off('postupdate', on);
  });
  await t.ev((c) => window.__xr2d.teleport(c, 8), plat);
  await waitGrounded(t, 'B2 : Kaï sur la passerelle');
  await exposeKai(t);
  await t.key('Space', 300);
  await t.wait(200);
  await waitGrounded(t, 'B2 : Kaï retombé sur la passerelle');
  const jumpUnder = await t.ev(() => {
    const r = window.__bwBody;
    const out = { deep: r.deep, dx: r.dx, lost: r.hearts - window.__xr2d.scene.hearts };
    r.deep = Infinity;
    return out;
  });
  await t.shot('body-jump');
  // Rebond : Kaï lâché au-dessus du premier champignon.
  await t.ev((c) => window.__xr2d.teleport(c, 8), ARENA.mush[0]);
  await waitFor(t, (n) => window.__xr2d.scene.mushrooms.bounces > n, { timeout: 2000, label: 'B2 : rebond sur le champignon', arg: await t.ev(() => window.__bwBody.bounces) });
  await waitFor(t, () => window.__xr2d.scene.player.body.velocity.y > 50, { timeout: 3000, label: 'B2 : sommet du rebond' });
  await t.shot('body-bounce');
  const bounceUnder = await t.ev(() => {
    const r = window.__bwBody;
    r.off();
    window.__xr2d.god(true);
    return { deep: r.deep, dx: r.dx, lost: r.hearts - window.__xr2d.scene.hearts, attack: r.attack };
  });
  t.log('corps', fmt({ jumpUnder, bounceUnder }));
  assert(jumpUnder.deep < -60 && Math.abs(jumpUnder.dx) < 150 && jumpUnder.lost === 0, `B2 : saut depuis la passerelle dans le corps, aucun cœur perdu (${fmt(jumpUnder)})`);
  assert(bounceUnder.deep < -60 && Math.abs(bounceUnder.dx) < 220 && bounceUnder.lost === 0, `B2 : rebond de champignon dans le corps, aucun cœur perdu (${fmt(bounceUnder)})`);
  assert(!bounceUnder.attack, 'B2 : aucune attaque pendant ces sauts');
  await placeKai(t, ARENA.col0 + 1, 'B2 : Kaï contre la première borne');

  // Tache d'une spore au-dessus du premier champignon : sur son chapeau, la tache reste jusqu'à l'éclatement de la spore.
  const mushX = ARENA.mush[0] * T + 32;
  const capSpot = await t.ev((mx) => {
    const s = window.__xr2d.scene;
    const bb = s.boss;
    bb.clearSpores();
    bb.sporeBaseX = mx;
    bb.announceSpore(0);
    const sp = bb.spots.find((x) => x.on);
    if (!sp) return null;
    const r = (window.__bwCap = { x: sp.x, y: Math.round(sp.img.y), hidden: -1, burst: -1, burstY: 0 });
    let spore = null;
    const on = () => {
      if (!spore && sp.dropped) spore = s.spores.spores.find((o) => o.alive && Math.abs(o.img.x - mx) < 1);
      if (spore && r.burst < 0 && !spore.alive) {
        r.burst = Math.round(s.clockMs);
        r.burstY = Math.round(spore.img.y);
      }
      if (r.hidden < 0 && !sp.on) r.hidden = Math.round(s.clockMs);
      if (r.hidden >= 0 && r.burst >= 0) s.events.off('postupdate', on);
    };
    s.events.on('postupdate', on);
    return { x: r.x, y: r.y };
  }, mushX);
  assertEq(capSpot, { x: mushX, y: GROUND - T - 2 }, 'B2 : tache posée sur le chapeau du champignon');
  const cap = await waitFor(t, () => window.__bwCap.hidden >= 0 && window.__bwCap.burst >= 0 && window.__bwCap, { timeout: 4000, label: 'B2 : spore éclatée sur le champignon' });
  assert(Math.abs(cap.hidden - cap.burst) <= 50 && cap.burstY >= GROUND - T && cap.burstY < GROUND - T + 40, `B2 : spore éclatée sur le chapeau quand sa tache s'efface (${fmt(cap)})`);

  // ---------- C. Touches : tir réel vers le haut, puis en diagonale (phase 2)
  b = await nextOpenHeart(t, 'C');
  await placeUnderHeart(t, 1, 'C : Kaï sous le cœur');
  await t.page.keyboard.down('ArrowUp');
  try {
    await waitFor(t, () => window.__xr2d.scene.player.aim === 'up', { timeout: 2000, label: 'C : visée vers le haut' });
    await t.ev(() => {
      const s = window.__xr2d.scene;
      s.boss.clearSpores();
      s.spores.clear();
    });
    await t.key('KeyJ', 60);
    b = await waitBoss(t, 'i.life === 5', 'C : première touche (tir réel vers le haut)', 3000);
  } finally {
    await t.page.keyboard.up('ArrowUp');
  }
  rec = await t.ev(() => window.__bw);
  assert(rec.glow && rec.glow.on && rec.glow.at && rec.glow.frame, `C : clignotement du cœur calé dès la touche (${fmt(rec.glow)})`);
  assert(b.shut && !b.open && b.frame === 1, `C : cœur refermé, corps blessé (${fmt(b)})`);
  await t.wait(200);
  const after = await t.ev(() => {
    const s = window.__xr2d.scene;
    const i = s.boss.info();
    return { r: s.boss.hitBy(i.heartX, i.heartY), life: s.boss.life };
  });
  assertEq(after, { r: 0, life: 5 }, 'C : cœur refermé : plus de touche');
  await t.shot('touch-up');

  await nextOpenHeart(t, 'C');
  const hx = (await boss(t)).heartX;
  // Bouche du canon en diagonale 31 px devant Kaï et 56 px au-dessus du sol : à 45°, elle croise le cœur. Kaï à
  // gauche du cœur, ou à droite si le premier champignon est sur sa place.
  const reach = 31 + HEART_LOW_H - 56;
  const side = hx - reach - 17 > (ARENA.mush[0] + 1) * T ? 1 : -1;
  await placeAt(t, hx - side * reach, side, 'C : Kaï devant le cœur');
  const diag = await salvo(t, 'diag', side);
  b = await waitBoss(t, 'i.life === 4', `C : deuxième touche en diagonale (bouche ${fmt(diag)})`, 3000);
  assertEq([b.phase, b.act], [2, 'rage'], 'C : phase 2 (colère)');
  au = await audioLog(t);
  assertEq(au.music.slice(-1), ['level:1'], 'C : intensité 1 au début de la colère');
  assert(au.sfx.includes('bossPhase'), 'C : son de la phase');
  const wasps = await waitFor(
    t,
    () => {
      const s = window.__xr2d.scene;
      const w = s.enemies.list.filter((e) => e.summoned && e.alive && e.sprite.visible);
      return w.length === 2 ? w.map((e) => ({ x: Math.round(e.homeX), y: Math.round(e.homeY) })) : false;
    },
    { timeout: 3000, label: 'C : 2 guêpes appelées' },
  );
  assert(wasps.every((w) => w.y === GROUND - WASP_H), `C : guêpes entre le sol et les passerelles (${fmt(wasps)})`);
  const killed = await t.ev(() => {
    const s = window.__xr2d.scene;
    const n = s.enemiesKilled;
    const e = s.enemies.list.find((x) => x.summoned && x.alive);
    s.enemies.hit(e, 99);
    return s.enemiesKilled - n;
  });
  assertEq(killed, 0, 'C : guêpe abattue hors score');
  await waitFor(t, () => document.querySelector('.boss-phase').textContent === 'Phase 2/3', { timeout: 2000, label: 'C : barre « Phase 2/3 »' });
  await t.shot('phase2');

  // ---------- D. Phase 2 : balayage à mi-hauteur, pompe, laser
  await placeKai(t, MID, 'D : Kaï au milieu');
  await waitBoss(t, "i.act === 'sweep' && i.sub === 0", 'D : annonce du balayage');
  await exposeKai(t);
  const heartsD = await t.ev(() => window.__xr2d.scene.hearts);
  await t.page.keyboard.down('ArrowDown');
  try {
    const sw = await waitBoss(t, "i.act === 'sweep' && i.sub === 1", 'D : balayage');
    const contract = await t.ev((h) => {
      const s = window.__xr2d.scene;
      const bb = s.boss;
      const tip = bb.info().tip;
      const g = bb.info().groundY;
      const fake = (x, feet, hh) => ({ left: x - 17, right: x + 17, top: feet - hh, feetY: feet });
      const n = (v) => (Number.isNaN(v) ? 'NaN' : 'hit');
      return {
        dy: g - tip.y,
        standing: n(bb.hurts(fake(tip.x, g, 70))),
        crouching: n(bb.hurts(fake(tip.x, g, 46))),
        jumping: n(bb.hurts(fake(tip.x, g - h, 70))),
      };
    }, 100);
    t.log('balayage', fmt({ sw: sw.tip, contract }));
    assert(Math.abs(contract.dy - SWEEP_H) <= 4, `D : bout du tentacule à mi-hauteur (${contract.dy} px)`);
    assertEq([contract.standing, contract.crouching, contract.jumping], ['hit', 'NaN', 'NaN'], 'D : balayage : debout touché, accroupi et en saut non');
    await t.wait(450);
    await t.shot('sweep-crouch');
    await waitBoss(t, "i.act === 'sweep' && i.sub === 2", 'D : balayage fini', 6000);
  } finally {
    await t.page.keyboard.up('ArrowDown');
  }
  await t.ev(() => window.__xr2d.god(true));
  rec = await t.ev(() => window.__bw);
  const kx = await t.ev(() => Math.round(window.__xr2d.scene.player.x));
  assert(rec.sweep.min <= kx && rec.sweep.max >= kx && rec.sweep.max - rec.sweep.min > 900, `D : le balayage traverse l'arène, au-dessus de Kaï (${fmt({ ...rec.sweep, dy: undefined, kx })})`);
  assertEq(await t.ev(() => window.__xr2d.scene.hearts), heartsD, 'D : Kaï accroupi : aucun cœur perdu');

  // Pompe vers le haut sous le cœur : une touche (plombs de la même salve absorbés).
  await nextOpenHeart(t, 'D');
  await placeUnderHeart(t, 1, 'D : Kaï sous le cœur');
  await t.ev(() => window.__xr2d.weapon('shotgun'));
  await salvo(t, 'up', 1);
  b = await waitBoss(t, 'i.life === 3', 'D : troisième touche à la pompe', 3000);
  await t.wait(300);
  assertEq((await boss(t)).life, 3, 'D : une seule touche pour la salve');
  await t.ev(() => window.__xr2d.weapon('laser'));

  // Quatrième touche dès l'ouverture (image « s'ouvre ») : tir sous le petit point faible de l'image, dans le bouton
  // qui s'écarte : le cœur ouvert compte en entier.
  await t.ev(() => window.__xr2d.god(true));
  await waitBoss(t, "i.act !== 'heart' || i.sub !== 1", 'D2 : fenêtre précédente finie');
  const opening = await t.ev(
    () =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const bb = s.boss;
        const on = () => {
          const i = bb.info();
          if (i.act !== 'heart' || i.sub !== 1) return;
          s.events.off('postupdate', on);
          const r = bb.hitBy(i.heartX, bb.heart.y + 120);
          resolve({ frame: i.heartFrame, r, life: bb.life });
        };
        s.events.on('postupdate', on);
      }),
  );
  assertEq(opening, { frame: 1, r: 1, life: 2 }, 'D2 : cœur qui s’ouvre touché sous son point faible (dans le bouton)');
  b = await waitBoss(t, 'i.life === 2', 'D2 : quatrième touche', 3000);
  assertEq([b.phase, b.act], [3, 'rage'], 'D2 : phase 3 (colère)');
  au = await audioLog(t);
  assertEq(au.music.filter((m) => m.startsWith('level:')), ['level:0', 'level:1', 'level:2'], 'D2 : intensités 0, 1 puis 2, une par phase');
  await waitFor(t, () => document.querySelector('.boss-phase').textContent === 'Phase 3/3', { timeout: 2000, label: 'D2 : barre « Phase 3/3 »' });

  // ---------- E. Phase 3 : plongée annoncée par son ombre ; cœur ouvert 4 s
  b = await waitBoss(t, "i.act === 'dive' && i.sub === 0", 'E : annonce de la plongée');
  await t.ev(() => {
    const s = window.__xr2d.scene;
    s.player.teleport(s.boss.x + 13, s.boss.info().groundY);
  });
  await exposeKai(t);
  await t.wait(600);
  const shadow = await t.ev(() => {
    const s = window.__xr2d.scene;
    const sh = s.boss.diveShadow;
    return { visible: sh.visible, dx: Math.round(sh.x - s.boss.x), y: Math.round(sh.y), sub: s.boss.info().sub, kai: Math.round(s.player.x - s.boss.x) };
  });
  assert(shadow.visible && shadow.dx === BODY_MID && shadow.y === GROUND && shadow.sub === 0, `E : ombre de la plongée au sol, sous elle (${fmt(shadow)})`);
  await t.shot('dive-warn');
  const low = await waitBoss(t, "i.act === 'dive' && i.sub === 2", 'E : au sol');
  const dive = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bb = s.boss;
    const g = bb.info().groundY;
    const fake = (x, feet) => ({ left: x - 17, right: x + 17, top: feet - 70, feetY: feet });
    const n = (v) => (Number.isNaN(v) ? 'NaN' : 'hit');
    return { under: n(bb.hurts(fake(bb.x, g))), platform: n(bb.hurts(fake(bb.x, g - 192))), aside: n(bb.hurts(fake(bb.x + 420, g))) };
  });
  await t.shot('dive-ground');
  await t.ev(() => window.__xr2d.god(true));
  rec = await t.ev(() => window.__bw);
  const diveWarn = subDuration(rec.acts, 'dive', 0);
  const diveHurt = rec.hurts.find((h) => h.act === 'dive');
  assert(Math.abs(diveWarn - DIVE_WARN_MS) <= 60, `E : plongée annoncée ${DIVE_WARN_MS} ms (${diveWarn} ms)`);
  assert(GROUND - low.skirtY <= 12, `E : jupe au ras du sol en plongée (${low.skirtY})`);
  assertEq(dive, { under: 'hit', platform: 'hit', aside: 'NaN' }, 'E : plongée : blesse dessous (sol et passerelle), pas à côté');
  assert(diveHurt && diveHurt.sub >= 1, `E : Kaï resté dessous blessé par la plongée (${fmt(rec.hurts)})`);
  await waitBoss(t, "i.act === 'heart' && i.sub === 1", 'E : cœur ouvert (phase 3)');
  await waitBoss(t, "i.act === 'drift'", 'E : cœur remonté', 10000);
  rec = await t.ev(() => window.__bw);
  const open3 = subDuration(rec.acts, 'heart', 1);
  assert(Math.abs(open3 - HEART_OPEN_MS[2]) <= 60, `E : cœur ouvert ${HEART_OPEN_MS[2]} ms en phase 3 (${open3} ms)`);

  // ---------- F. Vie perdue : gardienne à neuf ; nouvel essai
  const lives = await t.ev(() => window.__xr2d.scene.lives);
  await t.ev(() => window.__xr2d.kill());
  await waitFor(t, () => window.__xr2d.scene.state === 'play', { timeout: 6000, label: 'F : réapparition' });
  const f = await t.ev(() => {
    const s = window.__xr2d.scene;
    const i = window.__xr2d.boss.info();
    return {
      lives: s.lives,
      kai: Math.round(s.player.x),
      state: i.state,
      life: i.life,
      phase: i.phase,
      visible: i.visible,
      arena: i.arena.state,
      spots: i.spots,
      wasps: s.enemies.list.filter((e) => e.summoned && e.alive).length,
    };
  });
  assertEq(
    f,
    { lives: lives - 1, kai: ARENA.k * T + 32, state: 'wait', life: MAX_LIFE, phase: 1, visible: false, arena: 'open', spots: 0, wasps: 0 },
    'F : retour au K, méduse-baleine à neuf et cachée, arène rouverte, guêpes rangées',
  );
  au = await audioLog(t);
  assertEq(au.music.slice(-1), ['music:jungle'], 'F : musique du niveau');
  assert(await decorWhale(t), 'F : méduse du décor revenue');
  await t.ev(() => {
    window.__bwMusic.length = 0;
    window.__xr2d.boss.enter();
  });
  await waitBoss(t, "i.state === 'fight'", 'F : nouvel essai', 5000);
  au = await audioLog(t);
  assertEq(au.music, ['music:guardian', 'level:0'], 'F : nouvel essai : musique du gardien, intensité 0 explicite');

  // ---------- G. Défaite : état exit, cri, elle s'élève ; résultats ; double saut
  await waitBoss(t, "i.act === 'drift'", 'G : en place');
  const d0 = await t.ev(() => {
    const s = window.__xr2d.scene;
    window.__bwSfx.length = 0;
    const hearts = s.hearts;
    window.__xr2d.boss.win();
    const i = window.__xr2d.boss.info();
    return { at: Math.round(s.clockMs), state: s.state, boss: i.state, frame: i.frame, heart: s.boss.heart.visible, y: Math.round(s.boss.y), hearts };
  });
  assert(d0.state === 'exit' && d0.boss === 'beaten' && d0.frame === 2 && !d0.heart, `G : défaite dans la scène, état exit (${fmt(d0)})`);
  au = await audioLog(t);
  assert(au.sfx.includes('whaleCry') && au.sfx.includes('bossDefeat'), `G : cri et son de la défaite (${fmt(au.sfx)})`);
  await t.wait(400);
  await t.shot('defeat');
  const rising = await waitFor(
    t,
    (y0) => {
      const s = window.__xr2d && window.__xr2d.scene;
      return s && s.boss && s.state === 'exit' && s.boss.y < y0 - 20 ? { y: Math.round(s.boss.y), kai: s.player.body.enable, hearts: s.hearts } : false;
    },
    { timeout: 3000, label: 'G : elle s’élève', arg: d0.y },
  );
  assert(!rising.kai && rising.hearts === d0.hearts, `G : Kaï figé au sol, aucun dégât (${fmt(rising)})`);
  await t.shot('defeat-rise');
  await waitForScreen(t, 'results', { timeout: 15000 });
  const fin = await t.ev(() => window.__bwFinish);
  assert(fin && fin.state === 'exit' && fin.at - d0.at >= DEFEAT_MS - 50 && fin.at - d0.at <= EXIT_MAX_MS, `G : résultats à la fin de la défaite (${fin && fin.at - d0.at} ms)`);
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `G : « NIVEAU TERMINÉ » (${text.slice(0, 120)})`);
  const res = await t.ev(() => {
    const r = document.querySelector('.screens [data-screen="results"].is-active');
    const skill = r.querySelector('.detail--reward[data-reward="skill:doubleJump"]');
    const bonus = r.querySelector('.results-bonus-value');
    return { skill: skill ? skill.textContent.replace(/\s+/g, ' ').trim() : null, bonus: bonus ? bonus.textContent.replace(/\s/g, '') : null, result: window.__bwResult };
  });
  assert(res.skill && /Compétence/.test(res.skill) && /double saut/.test(res.skill), `G : « Compétence : double saut » (${fmt(res.skill)})`);
  assert(res.bonus === '+5000' && res.result.bossBonus === SCORE_GUARDIAN, `G : prime du gardien (${fmt(res)})`);
  await t.shot('results');
  const e = await ends(t);
  assert(e.length === 1 && e[0].kind === 'complete' && e[0].sid === g.sid, `G : un seul onComplete (${fmt(e)})`);
  await waitFor(t, (keys) => keys.every((k) => !window.__bwGame.textures.exists(k)), { timeout: 5000, label: 'G : textures libérées après la session', arg: WHALE_TEX });
  const save = await readSave(t);
  assert(save.loadout.skills.doubleJump === true && save.best.j3, `G : double saut et record de j3 enregistrés (${fmt({ loadout: save.loadout, best: save.best })})`);

  // Partie suivante : j1 avec le double saut (sans mode test).
  await t.goto('?touch=1&stage=j1');
  await waitFor2dPlay(t);
  const dj = await t.ev(() => ({ dj: window.__xr2d.info().canDoubleJump, shell: window.__xrShell.info().loadout.skills.doubleJump, unlock: window.__xrShell.info().stages.every((s) => s.unlocked) }));
  assertEq(dj, { dj: true, shell: true, unlock: false }, 'j1 : double saut actif, sans mode test');
  await t.ev(() => window.__xr2d.god(true));
  await waitGrounded(t, 'j1 : Kaï au sol');
  // Saut tenu, puis Saut au sommet : double saut (son « doubleJump »), plus haut qu'un saut seul (4,2 tuiles).
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const p = s.player;
    const r = (window.__bwJump = { feet0: p.feetY, top: p.feetY, doubles: 0 });
    const sfx = window.__xrShell.audio.sfx;
    window.__xrShell.audio.sfx = function (id, o) {
      if (id === 'doubleJump') r.doubles++;
      return sfx.call(this, id, o);
    };
    s.events.on('postupdate', () => {
      r.top = Math.min(r.top, p.feetY);
    });
  });
  await t.key('Space', 300);
  await waitFor(t, () => window.__xr2d.scene.player.body.velocity.y > -80, { timeout: 3000, label: 'j1 : sommet du saut' });
  await t.key('Space', 250);
  await t.wait(300);
  await waitGrounded(t, 'j1 : Kaï retombé');
  const jump = await t.ev(() => ({ rise: Math.round(window.__bwJump.feet0 - window.__bwJump.top), doubles: window.__bwJump.doubles }));
  t.log('double saut', fmt(jump));
  assert(jump.doubles === 1 && jump.rise > 4.2 * T + 64, `j1 : double saut réel, plus haut qu'un saut seul (${fmt(jump)})`);

  await retryFight(t);
}

/** Boutons de l'écran d'échec affiché, dans l'ordre : « balise:texte », suivi de * pour le bouton principal. */
function failButtons(t) {
  return t.ev(
    (sel) =>
      [...document.querySelectorAll(`${sel} .fail-actions > *`)].map(
        (b) => `${b.tagName.toLowerCase()}:${b.textContent.replace(/\s+/g, ' ').trim()}${b.classList.contains('btn-primary') ? '*' : ''}`,
      ),
    FAIL,
  );
}

const FIGHT_BUTTONS = ['button:Réessayer le combat*', 'button:Réessayer', 'button:Menu'];

/** Kaï posé sur le K 159 : allumé, état noté. */
async function reachK(t, label) {
  await t.ev((k) => {
    window.__xr2d.god(true);
    window.__xr2d.teleport(k, 11);
  }, ARENA.k);
  await waitFor(t, () => !!window.__xr2d.scene.fightSnap, { timeout: 3000, label: `${label} : K allumé, état noté` });
}

/** H. « Réessayer le combat » dans j3 : état noté au K rendu, gardienne à neuf, sans prime de vies ; puis « Réessayer ». */
async function retryFight(t) {
  // ---------- H1. j3 depuis le début : cristaux, ennemis, pluie de spores, K ; vies épuisées en plein combat
  await t.goto(URL);
  const g = await waitPlay(t);
  // Cristaux avant la pluie (dépassée sans y entrer, sa fenêtre serait sautée).
  const plan = await t.ev((max) => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(true);
    return {
      start: s.parsed.start.col * 64 + 32,
      crystals: s.parsed.crystals
        .filter((c) => c.col > 12 && c.col < max)
        .sort((a, b) => a.col - b.col)
        .slice(0, 3),
    };
  }, SPORES_COL - 2);
  for (const c of plan.crystals) {
    const n = await t.ev((c) => {
      window.__xr2d.teleport(c.col, c.row);
      return window.__xr2d.scene.crystals;
    }, c);
    await waitFor(t, (n) => window.__xr2d.scene.crystals > n, { timeout: 3000, label: `H1 : cristal (${c.col}, ${c.row}) ramassé`, arg: n });
  }
  const killed = await t.ev(([max, col]) => {
    const s = window.__xr2d.scene;
    const list = [];
    s.enemies.list.forEach((e, i) => {
      if (!e.summoned && e.alive && list.length < 2 && e.sprite.x < max * 64) list.push(i);
    });
    for (const i of list) s.enemies.hit(s.enemies.list[i], 99);
    window.__xr2d.teleport(col, 11);
    return list;
  }, [ARENA.k - 10, SPORES_COL]);
  await waitFor(t, () => window.__xr2d.scene.levelEvents.events.some((e) => e.event.kind === 'spores' && e.state === 1), {
    timeout: 3000,
    label: 'H1 : pluie de spores jouée',
  });
  await reachK(t, 'H1');
  const before = await progress2d(t);
  const snap = before.snap;
  t.log('H1 : instantané', fmt({ ...snap, events: undefined }));
  assertEq(snapOf(snap), snapFields(before), 'H1 : instantané = état de la partie au K');
  assert(snap.crystals >= 3 && snap.enemiesKilled >= 2 && killed.every((i) => snap.deadEnemies.includes(i)), `H1 : cristaux et ennemis abattus notés (${fmt(snap)})`);
  assert(snap.events.events.includes(1) && snap.events.windows.includes(1), `H1 : pluie et messages déjà joués notés (${fmt(snap.events)})`);
  const reason = await loseFight(t, 'H1');
  assertEq(reason, 'Plus de vies !', 'H1 : motif de l’échec');
  const e1 = (await ends(t)).filter((e) => e.sid === g.sid);
  assert(e1.length === 1 && e1[0].kind === 'fail' && e1[0].retry === 'boss', `H1 : onFail avec un point de reprise (${fmt(e1)})`);
  assertEq(await failButtons(t), FIGHT_BUTTONS, 'H1 : « Réessayer le combat » (bouton principal), puis Réessayer et Menu');
  await t.shot('fail-fight');

  // ---------- H2. « Réessayer le combat » : départ au K, état noté rendu, gardienne à neuf
  await pressScreen(t, 'fail', 'Réessayer le combat');
  const g2 = await waitPlay(t);
  const after = await progress2d(t);
  assert(
    g2.sid !== g.sid && after.retry && after.x === ARENA.k * T + 32 && after.lives === 3 && after.hearts === after.maxHearts,
    `H2 : au K, 3 vies, cœurs pleins (${fmt(after)})`,
  );
  assertEq(snapFields(after), snapOf(snap), 'H2 : état noté rendu (cristaux, ennemis morts, radio et pluie jouées)');
  assert(after.timeMs >= snap.timeMs && after.timeMs < snap.timeMs + 3000, `H2 : temps repris au K (${Math.round(after.timeMs)} / ${Math.round(snap.timeMs)})`);
  const h2 = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { arrival: s.arrival, rain: s.sporeRain.active, drops: s.sporeRain.history.length };
  });
  assertEq(h2, { arrival: null, rain: false, drops: 0 }, 'H2 : sans faisceau, pluie de spores pas rejouée');
  assertEq(await hudPlatform(t), { visible: true, lives: 3, crystals: snap.crystals }, 'H2 : HUD (vies, cristaux)');
  const b = await boss(t);
  assert(b.state === 'wait' && !b.visible && b.life === MAX_LIFE && b.phase === 1 && b.arena.state === 'open', `H2 : gardienne à neuf et cachée (${fmt(b)})`);
  assert(await decorWhale(t), 'H2 : méduse du décor visible');
  await t.wait(800);
  assertEq((await t.ev(() => window.__xrShell.radio())).played, [], 'H2 : aucun message de LUMA rejoué');
  await t.shot('retry-fight-k');
  // Défaite : score sans prime de vies.
  await t.ev(() => {
    const h = window.__xr2d.scene.session.hooks;
    const oc = h.onComplete;
    h.onComplete = (r) => {
      window.__bwRetryResult = JSON.parse(JSON.stringify(r));
      return oc(r);
    };
    window.__xr2d.win();
  });
  await waitForScreen(t, 'results', { timeout: 20000 });
  const res = await t.ev(() => window.__bwRetryResult);
  const expected = res.crystals * 50 + res.enemies * 100 + Math.max(0, PAR_TIME_S - Math.floor(res.timeMs / 1000)) * 10 + SCORE_GUARDIAN;
  assert(
    res.bossBonus === SCORE_GUARDIAN && res.score === expected && res.crystals >= snap.crystals && res.timeMs >= snap.timeMs,
    `H2 : score sans prime de vies (${fmt({ res, expected })})`,
  );

  // ---------- H3. Rejouer, vies épuisées en combat, « Réessayer » simple : début du niveau
  await press(t, 'results', 'Rejouer');
  const g3 = await waitPlay(t);
  await reachK(t, 'H3');
  await loseFight(t, 'H3');
  const e3 = (await ends(t)).filter((e) => e.sid === g3.sid);
  assert(e3.length === 1 && e3[0].retry === 'boss', `H3 : point de reprise (${fmt(e3)})`);
  await pressScreen(t, 'fail', 'Réessayer');
  await waitFor(t, () => !!(window.__xr2d && window.__xr2d.scene && window.__xr2d.scene.arrival), { timeout: 30000, label: 'H3 : arrivée par le faisceau' });
  const g4 = await waitPlay(t);
  const fresh = await progress2d(t);
  assert(
    g4.sid !== g3.sid && !fresh.retry && fresh.snap === null && !fresh.k.on && Math.abs(fresh.x - plan.start) <= 64,
    `H3 : début du niveau (${fmt(fresh)})`,
  );
  assertEq(
    { crystals: fresh.crystals, taken: fresh.items.crystals, dead: fresh.deadEnemies, events: fresh.events.events },
    { crystals: 0, taken: [], dead: [], events: fresh.events.events.map(() => 0) },
    'H3 : rien de gardé',
  );
}
