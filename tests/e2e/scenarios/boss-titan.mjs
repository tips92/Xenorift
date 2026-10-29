// Mini-boss de j2 (Scarabée-titan, plan 04 étape 9 ; boss en touches : point 20), lancé par ?at=boss (départ au
// point de contrôle 201) :
//  A. arène 206-221 (16 colonnes), titan en 213, champignons 207 et 220 contre les bornes, butées de la charge devant
//     eux, aucun renfort ; entrée → barrières, sons, musique, barre en 4 crans ;
//  B. carapace : contrat hitBy (0 sur la carapace, même à hauteur du ventre, image « tir renvoyé » en marche, -1 à
//     côté), tir du ShotPool arrêté sans effet ; rebond sur la carapace sans perdre de cœur ;
//  C. charge : annonce (tête basse, raclement), charge vers Kaï (posé devant le champignon opposé) qui blesse au sol et
//     pas au-dessus, choc contre le champignon (écrasé, rebond de Kaï non compté ; sons), titan sur le dos ;
//  D. touches seulement sur le dos : hitBy (une touche sur le ventre, plomb de la même salve absorbé sur le dôme, -1 à
//     côté), clignotement calé, point faible refermé ensuite (0) et titan relevé aussitôt ; au choc suivant, saut sur
//     le ventre : une touche, grand rebond, aucun cœur perdu ; c'est la seconde : phase 2 (colère depuis le dos,
//     carapace fendue, clignotement calé, barre « Phase 2/2 ») ;
//  E. phase 2 : charge plus rapide ; Kaï posé derrière le titan pendant la charge : au choc, 3 cailloux annoncés
//     (marque sur leur point d'arrivée, 850 ms, caillou encore caché) puis qui tombent d'au-dessus de la vue : celui
//     visé sur Kaï le blesse (il le recouvre à l'image du cœur perdu), celui qui tombe sur le titan assommé est
//     annoncé sur son dos (marque au-dessus de lui) et s'y arrête ; au choc suivant, tir réel de Kaï debout : touche ;
//  F. vie perdue pendant les cailloux du choc suivant → retour au K, titan à neuf (cailloux rangés et cachés à la
//     remise à neuf même), arène rouverte ;
//  G. victoire : fuite, barrières ouvertes, balise → résultats avec la prime ; textures libérées après la session ;
//  H. « Réessayer le combat » (plan 04, choix 7), j2 du début : secousse jouée (tronc couché), Tess secourue, puis
//     arène atteinte sans allumer le K 201 (contourné : état noté à l'entrée) ; vies épuisées en plein combat →
//     nouvel essai au K 201, allumé sans « Point de contrôle ! » (instantané inchangé), Tess partie sans « Tess est à
//     bord ! », tronc couché et plein, secousse et messages non rejoués, titan à neuf.
import { assert, assertEq, fmt, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  ends,
  freeze2d,
  loseFight,
  pageNow,
  placeKai,
  pressScreen,
  progress2d,
  recordUi,
  removeEnemies,
  toastsSince,
  waitGrounded,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Mini-boss de j2 : Scarabée-titan en touches, charge, ventre, phase 2 et cailloux, vie perdue, victoire, réessayer le combat',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

/** Textures propres à l'arène et au titan (à libérer après la session). */
const ARENA_TEX = ['boss-beetle-titan', 'boss-beetle-titan-cracked', 'boss-titan-rock', 'w1-barrier-top', 'w1-barrier-mid', 'w1-barrier-bottom'];
/**
 * Valeurs recopiées : src/game2d/engine/bosses/beetleTitan.ts (MAX_LIFE en touches, CHARGE_SPEED, FRONT, WAKE_MS,
 * TOUCH_GRACE_MS, ROCK_WARN_MS, ROCK_HALF, ROCK_OFFSETS), art/draw/bosses.ts (BEETLE_POSE), j2 (arène, titan,
 * champignons) et son temps de référence.
 */
const BOSS_LIFE = 4;
const CHARGE_SPEED = [600, 760];
const FRONT = 119;
const WAKE_MS = 450;
const TOUCH_GRACE_MS = 120;
const ROCK_WARN_MS = 850;
const ROCK_HALF = 20;
const ROCK_OFFSET = 190;
const POSE = { walk0: 0, charge: 4, stunned: 5, deflect: 6, flee: 7 };
const ARENA = { col0: 206, col1: 221, boss: 213, mush: [207, 220] };
const PAR_TIME_S = 240;
const URL = '?touch=1&unlock=1&stage=j2&at=boss';
/** j2 du début (partie H) : fenêtre de la secousse, tronc abattu, porte voisine de Tess (levels/jungle/j2.ts). */
const URL_START = '?touch=1&unlock=1&stage=j2';
const QUAKE_COL = 119;
const TRUNK = { col: 128, row: 11 };
const TESS_DOOR = { col: 146, row: 7 };

function boss(t) {
  return t.ev(() => (window.__xr2d ? window.__xr2d.boss.info() : null));
}

/** Attend une condition sur __xr2d.boss.info() (`src` : expression sur `i`). */
function waitBoss(t, src, label, timeout = 8000) {
  return waitFor(
    t,
    (s) => {
      const i = window.__xr2d && window.__xr2d.boss.info();
      return !!i && new Function('i', `return (${s});`)(i);
    },
    { timeout, interval: 20, label, arg: src },
  );
}

/** Sons et musiques notés à partir de maintenant (enveloppe de __xrShell.audio). */
function spyAudio(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    window.__btSfx = [];
    window.__btMusic = [];
    if (a.__btSpied) return;
    a.__btSpied = true;
    const sfx = a.sfx;
    const music = a.music;
    a.sfx = function (id, o) {
      window.__btSfx.push(id);
      return sfx.call(this, id, o);
    };
    a.music = function (id) {
      window.__btMusic.push(id);
      return music.call(this, id);
    };
  });
}

function audioLog(t) {
  return t.ev(() => ({ sfx: window.__btSfx.slice(), music: window.__btMusic.slice() }));
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

function barrierCells(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const a = s.arena;
    const g = s.grid;
    let cells = 0;
    for (const c of [a.col0, a.col1]) for (let r = 0; r <= a.row; r++) if (g.cells[r * g.cols + c] === 1) cells++;
    return { state: a.state, cells };
  });
}

/** → tenu jusqu'à la fermeture des barrières ; le champignon 207, contre la première borne, se franchit d'un saut. */
async function walkIn(t, label) {
  await t.page.keyboard.down('ArrowRight');
  try {
    for (let k = 0; k < 12; k++) {
      await t.wait(250);
      if (await t.ev(() => window.__xr2d.boss.info().arena.state === 'closed')) break;
      await t.key('Space', 120);
    }
    await waitBoss(t, "i.arena.state === 'closed' && i.state === 'fight'", `${label} : barrières fermées à l'entrée de Kaï`, 5000);
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
}

/**
 * Relevé image par image (postupdate de la scène) : changements d'acte (heure, position, sens, Kaï, phase), vitesse
 * maximale de chaque charge, coups du contrat hurts au premier pas de chaque charge (Kaï factice devant, au sol, puis
 * au-dessus du titan), cailloux (annonce : marque, point d'arrivée, profondeurs ; chute ; fin), cœurs perdus (caillou
 * en chute qui recouvre Kaï à cette image), images affichées pendant l'annonce.
 */
function installRecorder(t) {
  return t.ev((half) => {
    const s = window.__xr2d.scene;
    const b = s.boss;
    const log = (window.__bt = { acts: [], charges: [], rocks: [], windupFrames: [], heartLoss: [] });
    let last = '';
    let charge = null;
    let hearts = s.hearts;
    const rockPhase = b.rocks.map(() => 'off');
    const rockRec = b.rocks.map(() => null);
    const FRONT_PX = 119;
    const fake = (x, feet) => ({ left: x - 17, right: x + 17, top: feet - 70, feetY: feet });
    const n = (v) => (Number.isNaN(v) ? 'NaN' : Math.round(v));
    const on = () => {
      const i = b.info();
      if (i.act !== last) {
        log.acts.push({ act: i.act, at: Math.round(s.clockMs), x: Math.round(b.x), facing: i.facing, kai: Math.round(s.player.x), phase: b.phase, scrapes: i.scrapes });
        if (i.act === 'charge') {
          const feet = b.spot.feetY;
          charge = {
            phase: b.phase,
            facing: i.facing,
            from: Math.round(b.x),
            max: 0,
            front: n(b.hurts(fake(b.x + i.facing * (FRONT_PX - 20), feet))),
            above: n(b.hurts(fake(b.x, b.y - 165))),
          };
          log.charges.push(charge);
        }
        last = i.act;
      }
      if (i.act === 'windup') log.windupFrames.push(i.shownFrame);
      if (charge && i.act === 'charge') charge.max = Math.max(charge.max, i.speed);
      if (s.hearts < hearts) {
        const p = s.player;
        const k = b.rocks.find((r) => r.phase === 'fall' && p.right - 3 > r.x - half && p.left + 3 < r.x + half && p.feetY > r.y - half && p.top + 4 < r.y + half);
        log.heartLoss.push({ at: Math.round(s.clockMs), rock: k ? Math.round(k.x) : null, act: b.act });
      }
      hearts = s.hearts;
      b.rocks.forEach((r, k) => {
        if (r.phase === rockPhase[k]) return;
        if (r.phase === 'warn') {
          rockRec[k] = {
            x: Math.round(r.x),
            warnAt: Math.round(s.clockMs),
            mark: r.mark.visible,
            markY: Math.round(r.mark.y),
            land: Math.round(b.rockFloor(r)),
            floor: r.floor,
            img: r.img.visible,
            markDepth: r.mark.depth,
            titanDepth: Math.max(b.sprite.depth, b.glow.depth),
            onTitan: b.act === 'stunned' && Math.abs(r.x - b.x) < 60,
          };
          log.rocks.push(rockRec[k]);
        } else if (r.phase === 'fall' && rockRec[k]) {
          rockRec[k].fallAt = Math.round(s.clockMs);
          rockRec[k].startY = Math.round(r.y);
          rockRec[k].viewY = Math.round(s.cameras.main.worldView.y);
        } else if (r.phase === 'off' && rockRec[k]) {
          rockRec[k].endAt = Math.round(s.clockMs);
          rockRec[k].endY = Math.round(r.y + half);
          rockRec[k].markOff = !r.mark.visible;
          rockRec[k] = null;
        }
        rockPhase[k] = r.phase;
      });
    };
    s.events.on('postupdate', on);
  }, ROCK_HALF);
}

/**
 * Rebond de Kaï lâché 30 px au-dessus du titan, en `lx` (repère du sprite, tourné vers la droite), sans mode dieu :
 * relevé sur postupdate (vie, phase, planche et clignotement à cette image), puis Kaï reposé en `backX` (mode dieu).
 */
function dropOnBoss(t, where) {
  return t.ev(
    (w) =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const b = s.boss;
        const p = s.player;
        const hearts = s.hearts;
        const life0 = b.life;
        const t0 = performance.now();
        window.__xr2d.god(false);
        p.invulnMs = 0;
        p.shield = false;
        // Dessus des boîtes de l'image courante sous lx : ventre, carapace, cornes.
        const fr = b.sheet.boxes[b.frame];
        let top = 0;
        for (const h of [...fr.weak, ...fr.armor, ...fr.hurt]) if (w.lx > h.x && w.lx < h.x + h.w) top = Math.min(top, h.y);
        p.teleport(b.x + w.lx * b.facing, b.y + top - 30);
        const on = () => {
          let r = null;
          if (s.hearts < hearts) r = { hurt: true, act: b.act };
          else if (s.stompGraceMs > 0) {
            r = { hurt: false, vy: Math.round(p.body.velocity.y), act: b.act, dLife: life0 - b.life, top, phase: b.phase, tex: b.sheet.key, glow: window.__btGlow() };
          } else if (performance.now() - t0 > 3000) r = { timeout: true, act: b.act };
          if (!r) return;
          s.events.off('postupdate', on);
          window.__xr2d.god(true);
          p.teleport(w.backX, b.spot.feetY);
          resolve(r);
        };
        s.events.on('postupdate', on);
      }),
    where,
  );
}

export default async function (t) {
  await recordUi(t);
  await t.goto(URL);
  const g = await waitPlay(t);
  await spyAudio(t);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(true);
    window.__btGame = s.game;
    const h = s.session.hooks;
    const oc = h.onComplete;
    h.onComplete = (r) => {
      window.__btResult = JSON.parse(JSON.stringify(r));
      return oc(r);
    };
    const b = s.boss;
    window.__btGlow = () => {
      const gl = b.glow;
      return {
        on: gl.visible,
        at: gl.x === b.sprite.x && gl.y === b.y,
        flip: gl.flipX === b.facing < 0,
        tex: gl.texture.key === b.sheet.key && String(gl.frame.name) === String(b.sprite.frame.name),
      };
    };
    // Retours de hitBy qui arrêtent un tir (0 carapace, 1 point faible) ; clignotement relevé dès une touche.
    window.__btHits = [];
    const hitBy = b.hitBy.bind(b);
    b.hitBy = (x, y) => {
      const life = b.life;
      const r = hitBy(x, y);
      if (r >= 0) window.__btHits.push(r);
      if (b.life < life) window.__btHitGlow = window.__btGlow();
      return r;
    };
  });
  // Ennemis de la fin du niveau (cracheur, volant) : hors du test.
  await removeEnemies(t);
  await waitGrounded(t, 'A : Kaï posé au départ');
  await installRecorder(t);

  // ---------- A. Arène, titan, champignons ; entrée
  const start = await t.ev((keys) => {
    const s = window.__xr2d.scene;
    const ks = s.parsed.checkpoints.filter((c) => c.col < s.arena.col0);
    const k = ks[ks.length - 1];
    return {
      x: Math.round(s.player.x),
      k: k.col,
      reserve: s.enemies.list.filter((e) => e.summoned).length,
      tex: keys.filter((key) => !s.textures.exists(key)),
      mush: s.mushrooms.list.map((m) => Math.floor(m.img.x / 64)).filter((c) => c > s.arena.col0 && c < s.arena.col1),
      bounces: s.mushrooms.bounces,
    };
  }, ARENA_TEX);
  t.log('départ', fmt(start));
  assert(start.k === 201 && Math.abs(start.x - (201 * 64 + 32)) <= 1, `A : départ au point de contrôle 201 (${fmt(start)})`);
  assertEq(start.reserve, 0, 'A : aucun renfort');
  assertEq(start.tex, [], 'A : textures du titan, des cailloux et des barrières générées');
  assertEq(start.mush, ARENA.mush, `A : champignons de l’arène en ${ARENA.mush.join(' et ')}`);
  let b = await boss(t);
  assert(
    b.id === 'beetleTitan' && b.name === 'Scarabée-titan' && b.state === 'wait' && b.life === BOSS_LIFE && b.maxLife === BOSS_LIFE && b.phase === 1 &&
      b.x === ARENA.boss * 64 + 32 && b.arena.col0 === ARENA.col0 && b.arena.col1 === ARENA.col1 && b.texture === 'boss-beetle-titan' && b.open === false,
    `A : titan en attente dans l'arène ${ARENA.col0}-${ARENA.col1}, ${BOSS_LIFE} touches (${fmt(b)})`,
  );
  assertEq(b.stops, [(ARENA.mush[0] + 1) * 64, ARENA.mush[1] * 64], 'A : butées de la charge devant les champignons');
  await walkIn(t, 'A');
  assertEq(await barrierCells(t), { state: 'closed', cells: 24 }, 'A : barrières fermées');
  await waitFor(t, () => document.querySelector('.hud-boss.is-on') !== null, { timeout: 2000, label: 'A : barre de boss affichée' });
  assertEq(await bossBar(t), { on: true, name: 'Scarabée-titan', phase: 'Phase 1/2', life: 1, marks: 3, steps: 2 }, 'A : barre de boss en 4 crans');
  let au = await audioLog(t);
  assert(au.sfx.includes('barrier') && au.sfx.includes('bossAppear'), `A : sons de la barrière et de l'apparition (${fmt(au.sfx)})`);
  assertEq(au.music[au.music.length - 1], 'boss', 'A : musique du boss');
  await t.wait(400);
  await t.shot('arena-closed');

  // ---------- B. Carapace : tirs renvoyés sans effet, rebond dessus
  // Relevé fait sur l'image même où le titan marche (postupdate) : la marche peut finir entre deux allers-retours.
  const shell = await t.ev(
    () =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const bs = s.boss;
        const on = () => {
          if (bs.act !== 'walk') return;
          s.events.off('postupdate', on);
          const life0 = bs.life;
          const d0 = bs.info().deflects;
          const r1 = bs.hitBy(bs.x, bs.y - 70);
          const shown = bs.info().shownFrame;
          // Hauteur du ventre (quand il est sur le dos) : debout, c'est la carapace.
          const r2 = bs.hitBy(bs.x - 8 * bs.facing, bs.y - 110);
          const r3 = bs.hitBy(bs.x, bs.y - 400);
          resolve({ r1, r2, r3, shown, life0, life1: bs.life, deflects: bs.info().deflects - d0 });
        };
        s.events.on('postupdate', on);
      }),
  );
  t.log('carapace', fmt(shell));
  assert(shell.r1 === 0 && shell.r2 === 0 && shell.r3 === -1 && shell.life1 === shell.life0, `B : carapace : 0 (même à hauteur du ventre), -1 à côté, sans touche (${fmt(shell)})`);
  assert(shell.shown === POSE.deflect && shell.deflects === 2, `B : image « tir renvoyé » en marche (${fmt(shell)})`);
  const shot1 = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bs = s.boss;
    // Du côté le plus dégagé, entre le corps et la butée (un champignon ou une barrière arrêterait le tir).
    const room = [bs.x - 120 - bs.stopLeft, bs.stopRight - bs.x - 120];
    const side = room[0] > room[1] ? -1 : 1;
    const x = bs.x + side * (120 + room[side < 0 ? 0 : 1] / 2);
    const y = bs.y - 38;
    window.__btHits.length = 0;
    s.lasers.fire(x, y, side < 0 ? 0 : Math.PI, s.gun.stats, x - side * 10, y);
    return { life: bs.life, x, room };
  });
  await waitFor(t, () => window.__btHits.length > 0, { timeout: 3000, interval: 20, label: 'B : tir arrêté par la carapace' });
  const r1 = await t.ev(() => ({ hits: window.__btHits.slice(), life: window.__xr2d.scene.boss.life }));
  assert(r1.hits[0] === 0 && r1.life === shot1.life, `B : tir du ShotPool arrêté sans effet (${fmt({ shot1, r1 })})`);
  const leftX = (ARENA.mush[0] + 1) * 64 + 40;
  const shellHop = await dropOnBoss(t, { lx: 0, backX: leftX });
  t.log('rebond sur la carapace', fmt(shellHop));
  assert(shellHop.hurt === false && shellHop.vy < 0 && shellHop.dLife === 0, `B : rebond sur la carapace sans cœur perdu ni touche (${fmt(shellHop)})`);

  // ---------- C. Charge vers Kaï, champignon écrasé au passage, choc, sur le dos
  // Nouveau cycle (après un éventuel choc pendant B) : Kaï posé devant le champignon opposé au titan, au début de sa
  // marche ; l'annonce suivante le vise, la charge finit contre ce champignon.
  await waitGrounded(t, 'C : Kaï posé');
  let c0 = null;
  for (let k = 0; k < 4 && !c0; k++) {
    await waitBoss(t, "i.act === 'walk'", 'C : titan en marche', 12000);
    c0 = await t.ev(() => {
      const s = window.__xr2d.scene;
      const bs = s.boss;
      const a = s.arena;
      // Déjà dans l'annonce (entre deux relevés) : on attend la marche suivante.
      if (bs.act !== 'walk') return null;
      const i = bs.info();
      const side = bs.x < (a.left + a.right) / 2 ? 1 : -1;
      const x = side > 0 ? i.stops[1] - 40 : i.stops[0] + 40;
      s.player.teleport(x, bs.spot.feetY);
      return { side, x, bounces: s.mushrooms.bounces, mushHits: i.mushHits, stuns: i.stuns, stops: i.stops, windups: window.__bt.acts.filter((e) => e.act === 'windup').length };
    });
    if (!c0) await waitBoss(t, "i.act !== 'walk'", 'C : fin de la marche', 3000);
  }
  assert(c0, 'C : Kaï posé pendant une marche du titan');
  await waitFor(t, (n) => window.__bt.acts.filter((a) => a.act === 'windup').length > n, { timeout: 4000, interval: 20, label: 'C : annonce de la charge', arg: c0.windups });
  await t.wait(250);
  await t.shot('windup');
  await waitBoss(t, "i.act === 'charge'", 'C : charge', 3000);
  await t.shot('charge');
  await waitBoss(t, `i.act === 'stunned' && i.stuns === ${c0.stuns + 1}`, 'C : titan assommé', 4000);
  const c1 = await t.ev(() => {
    const s = window.__xr2d.scene;
    const i = window.__xr2d.boss.info();
    const acts = window.__bt.acts;
    const w = acts.filter((a) => a.act === 'windup').pop();
    return {
      x: Math.round(s.boss.x),
      facing: i.facing,
      open: i.open,
      mushHits: i.mushHits,
      bounces: s.mushrooms.bounces,
      mushFrames: s.mushrooms.list.map((m) => m.frame),
      windup: w,
      windupFrames: [...new Set(window.__bt.windupFrames)],
      charge: window.__bt.charges[window.__bt.charges.length - 1],
    };
  });
  t.log('charge', fmt({ c0, c1 }));
  au = await audioLog(t);
  assert(c1.windup && c1.windup.facing === c0.side && Math.sign(c1.windup.kai - c1.windup.x) === c0.side, `C : annonce tournée vers Kaï (${fmt({ c0, w: c1.windup })})`);
  assertEq(c1.windupFrames, [POSE.charge], 'C : tête basse pendant l’annonce (image « charge »)');
  assert(au.sfx.filter((x) => x === 'stomp').length >= 2, `C : raclement pendant l'annonce (${fmt(au.sfx)})`);
  assert(c1.charge.facing === c0.side && c1.charge.max === CHARGE_SPEED[0], `C : charge vers Kaï à ${CHARGE_SPEED[0]} px/s (${fmt(c1.charge)})`);
  assert(typeof c1.charge.front === 'number' && c1.charge.above === 'NaN', `C : la charge blesse devant au sol, pas au-dessus (${fmt(c1.charge)})`);
  assert(c1.facing === c0.side && c1.x === (c0.side > 0 ? c0.stops[1] - FRONT : c0.stops[0] + FRONT) && c1.open, `C : choc contre le champignon (cornes à la butée), sur le dos (${fmt(c1)})`);
  assert(c1.mushHits === c0.mushHits + 1 && c1.bounces === c0.bounces, `C : champignon écrasé au choc, sans rebond compté (${fmt({ c0, c1 })})`);
  assert(au.sfx.includes('boost') && au.sfx.includes('crash') && au.sfx.includes('quake') && au.sfx.includes('mushroomBounce'), `C : sons de la charge, du choc, du champignon (${fmt(au.sfx)})`);
  await t.shot('stunned');

  // ---------- D. Touches seulement sur le dos : tir (point faible refermé ensuite), saut sur le ventre
  const belly = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bs = s.boss;
    const w = bs.sheet.boxes[bs.frame].weak[0];
    const bx = bs.x + bs.facing * (w.x + w.w / 2);
    const by = bs.y + w.y + w.h / 2;
    const life0 = bs.life;
    const open0 = bs.info().open;
    const core = bs.hitBy(bx, by);
    const glow = window.__btGlow();
    // Plomb de la même salve (même image), sur le dôme retourné côté ventre, à hauteur du tir debout : absorbé.
    const dome = bs.hitBy(bs.x - bs.facing * 80, bs.y - 38);
    const miss = bs.hitBy(bs.x, bs.y - 400);
    return { act: bs.act, open0, core, glow, dome, miss, life0, life1: bs.life, open1: bs.info().open };
  });
  t.log('sur le dos', fmt(belly));
  assert(
    belly.act === 'stunned' && belly.open0 && belly.core === 1 && belly.dome === 1 && belly.miss === -1 && belly.life1 === belly.life0 - 1 && !belly.open1,
    `D : sur le dos, ventre touché (1 touche), plomb de la même salve sur le dôme absorbé (1, sans touche), raté (-1), point faible refermé (${fmt(belly)})`,
  );
  assertEq(belly.glow, { on: true, at: true, flip: true, tex: true }, 'D : clignotement calé sur le titan dès la touche');
  // Après les plombs de la salve : tir arrêté sans touche ; il remue (WAKE_MS) puis se relève.
  const shut = await t.ev(
    (grace) =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const bs = s.boss;
        let closed = null;
        const on = () => {
          if (closed === null && s.clockMs - bs.touchAt > grace + 10) {
            const w = bs.sheet.boxes[bs.frame].weak[0];
            closed = { act: bs.act, r: w ? bs.hitBy(bs.x + bs.facing * (w.x + w.w / 2), bs.y + w.y + w.h / 2) : null, life: bs.life };
          }
          if (bs.act === 'stunned') return;
          s.events.off('postupdate', on);
          resolve({ closed, wakeAfter: Math.round(s.clockMs - bs.touchAt), act: bs.act });
        };
        s.events.on('postupdate', on);
      }),
    TOUCH_GRACE_MS,
  );
  t.log('point faible refermé', fmt(shut));
  assert(
    shut.closed && shut.closed.act === 'stunned' && shut.closed.r === 0 && shut.closed.life === belly.life1 && shut.act === 'recover' && shut.wakeAfter <= WAKE_MS + 100,
    `D : point faible refermé après la touche (0), titan relevé en ${WAKE_MS} ms au plus (${fmt(shut)})`,
  );
  await waitFor(t, (v) => Math.abs(Number(/scaleX\(([\d.]+)\)/.exec(document.querySelector('.boss-fill').style.transform)[1]) - v) < 0.001, {
    timeout: 2000,
    label: 'D : barre de boss qui baisse d’un cran',
    arg: (BOSS_LIFE - 1) / BOSS_LIFE,
  });
  // Saut sur le ventre, au choc suivant (Kaï devant le champignon opposé : le titan y vient).
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const st = s.boss.info().stops;
    const x = s.boss.x < (st[0] + st[1]) / 2 ? st[1] - 40 : st[0] + 40;
    s.player.teleport(x, s.boss.spot.feetY);
  });
  await waitBoss(t, `i.act === 'stunned' && i.stuns === ${c0.stuns + 2}`, 'D : étourdissement suivant (champignon opposé)', 9000);
  await t.shot('stunned-2');
  const hop = await dropOnBoss(t, { lx: -8, backX: Math.round((ARENA.col0 + ARENA.col1 + 1) * 32) });
  t.log('saut sur le ventre', fmt(hop));
  assert(hop.hurt === false && hop.dLife === 1 && hop.vy < -950, `D : saut sur le ventre : une touche, grand rebond, aucun cœur perdu (${fmt(hop)})`);
  // Seconde touche : phase 2 (colère depuis le dos, carapace fendue), clignotement calé dès la touche.
  assert(hop.phase === 2 && hop.act === 'rage' && hop.tex === 'boss-beetle-titan-cracked', `D : seconde touche : phase 2, colère, carapace fendue (${fmt(hop)})`);
  assertEq(hop.glow, { on: true, at: true, flip: true, tex: true }, 'D : clignotement sur la carapace fendue dès la touche');
  au = await audioLog(t);
  assert(au.sfx.includes('bossPhase') && au.sfx.includes('bossHit'), `D : sons de la touche et de la phase (${fmt(au.sfx)})`);
  await waitFor(t, () => /Phase 2/.test(document.querySelector('.hud-boss .boss-phase').textContent), { timeout: 2000, label: 'D : barre en phase 2' });
  const bar2 = await bossBar(t);
  assert(bar2.on && bar2.phase === 'Phase 2/2' && Math.abs(bar2.life - 0.5) < 0.01 && bar2.marks === 3, `D : barre « Phase 2/2 » à mi-vie (${fmt(bar2)})`);
  await t.wait(200);
  await t.shot('phase-2');

  // ---------- E. Phase 2 : charge plus rapide, cailloux (sur Kaï, sur le titan assommé), tir réel de Kaï
  // Kaï posé derrière le titan pendant la charge (son dos passé), à ROCK_OFFSET du point de choc : au choc, un caillou
  // visé sur Kaï, un sur le titan assommé, un plus loin.
  const behind = await t.ev(
    ([off, front]) =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const bs = s.boss;
        const stuns = bs.info().stuns;
        const t0 = performance.now();
        const on = () => {
          if (performance.now() - t0 > 15000) {
            s.events.off('postupdate', on);
            resolve(null);
            return;
          }
          if (bs.act !== 'charge') return;
          const xs = bs.facing > 0 ? bs.stopRight - front : bs.stopLeft + front;
          const x = xs - bs.facing * off;
          // Dos du titan (≈ 100 px derrière ses pieds) au-delà de la place de Kaï.
          if ((bs.x - bs.facing * 110 - x) * bs.facing < 40) return;
          s.events.off('postupdate', on);
          s.player.teleport(x, bs.spot.feetY);
          resolve({ x: Math.round(x), xs: Math.round(xs), facing: bs.facing, hearts: s.hearts, stuns, at: Math.round(s.clockMs) });
        };
        s.events.on('postupdate', on);
      }),
    [ROCK_OFFSET, FRONT],
  );
  t.log('Kaï derrière le titan', fmt(behind));
  assert(behind, 'E : Kaï posé derrière le titan pendant une charge de la phase 2');
  await waitBoss(t, `i.act === 'stunned' && i.stuns === ${behind.stuns + 1} && i.rocks > 0`, 'E : choc, cailloux annoncés', 4000);
  const loss0 = await t.ev(() => {
    const p = window.__xr2d.scene.player;
    window.__xr2d.god(false);
    p.invulnMs = 0;
    p.shield = false;
    return window.__bt.heartLoss.length;
  });
  await t.wait(500);
  await t.shot('rocks-warn');
  await waitFor(t, (at) => window.__bt.rocks.some((r) => r.warnAt >= at && r.fallAt), { timeout: 3000, interval: 20, label: 'E : premier caillou qui tombe', arg: behind.at });
  await t.wait(150);
  await t.shot('rock-fall');
  // Caillou en chute, agrandi x3 (scène figée le temps de la capture).
  await freeze2d(t, true);
  const clip = await t.ev(() => {
    const s = window.__xr2d.scene;
    const r = s.boss.rocks.find((k) => k.phase === 'fall');
    if (!r) return null;
    const v = s.cameras.main.worldView;
    const c = s.game.canvas.getBoundingClientRect();
    const x = c.left + ((r.x - v.x) / v.width) * c.width;
    const y = c.top + ((r.y - v.y) / v.height) * c.height;
    return { x: Math.max(0, Math.round(x - 60)), y: Math.max(0, Math.round(y - 50)), width: 120, height: 100 };
  });
  if (clip) await t.shot('rock-fall-zoom', { clip, zoom: 3 });
  await freeze2d(t, false);
  await waitFor(t, (n) => window.__bt.heartLoss.length > n, { timeout: 3000, interval: 20, label: 'E : caillou sur Kaï resté dessous', arg: loss0 });
  await t.ev(() => window.__xr2d.god(true));
  await waitBoss(t, 'i.rocks === 0', 'E : cailloux tombés', 4000);
  const e1 = await t.ev(
    (at) => ({
      rocks: window.__bt.rocks.filter((r) => r.warnAt >= at),
      heartLoss: window.__bt.heartLoss.filter((h) => h.at >= at),
      charge: window.__bt.charges[window.__bt.charges.length - 1],
      ground: window.__xr2d.scene.boss.spot.feetY,
      arena: { left: window.__xr2d.scene.arena.left, right: window.__xr2d.scene.arena.right },
    }),
    behind.at,
  );
  t.log('phase 2', fmt(e1));
  assert(e1.charge.phase === 2 && e1.charge.max === CHARGE_SPEED[1], `E : charge de la phase 2 à ${CHARGE_SPEED[1]} px/s (${fmt(e1.charge)})`);
  assertEq(e1.rocks.length, 3, 'E : 3 cailloux au choc');
  const onKai = e1.rocks.find((r) => Math.abs(r.x - behind.x) <= 1);
  assert(onKai && e1.heartLoss.length === 1 && e1.heartLoss[0].rock === onKai.x, `E : le caillou visé sur Kaï le blesse (il le recouvre à l'image du cœur perdu) (${fmt({ behind, onKai, loss: e1.heartLoss })})`);
  const onTitan = e1.rocks.find((r) => Math.abs(r.x - behind.xs) <= 1);
  assert(
    onTitan && onTitan.onTitan && onTitan.land < e1.ground - 60 && onTitan.markY === onTitan.land - 2 && onTitan.markDepth > onTitan.titanDepth &&
      onTitan.endY >= onTitan.land && onTitan.endY < onTitan.land + 60,
    `E : caillou visé sur le titan assommé : marque sur son dos, dessinée au-dessus de lui, caillou arrêté sur lui (${fmt({ behind, onTitan })})`,
  );
  for (const r of e1.rocks) {
    assert(
      r.mark && !r.img && r.markY === r.land - 2 && (r === onTitan || (r.land === r.floor && (r.floor === e1.ground || r.floor === e1.ground - 64))) &&
        r.fallAt - r.warnAt >= ROCK_WARN_MS - 20 && r.endAt > r.fallAt && r.endY >= r.land && r.markOff && r.startY < r.viewY && r.x > e1.arena.left && r.x < e1.arena.right,
      `E : caillou annoncé (marque sur son point d'arrivée, ${ROCK_WARN_MS} ms) puis tombé d'au-dessus de la vue (${fmt(r)})`,
    );
  }
  au = await audioLog(t);
  assert(au.sfx.includes('bump'), `E : son des cailloux (${fmt(au.sfx)})`);
  // Tir réel de Kaï, debout, au choc suivant, côté dôme retourné (loin du champignon, qui arrêterait le tir) : touche.
  await waitBoss(t, `i.act === 'stunned' && i.stuns === ${behind.stuns + 2}`, 'E : choc suivant', 12000);
  const front = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bs = s.boss;
    const p = s.player;
    const kx = bs.x - bs.facing * 150;
    p.teleport(kx, bs.spot.feetY);
    p.facing = kx < bs.x ? 1 : -1;
    p.aim = 'front';
    window.__btHits.length = 0;
    const life = bs.life;
    s.lasers.fire(p.gunX, p.gunY, p.fireAngle, s.gun.stats, p.shoulderX, p.shoulderY);
    return { life, kx, open: bs.info().open, mush: s.grid.solidAtPx(kx, bs.spot.feetY - 10) };
  });
  await waitFor(t, () => window.__btHits.length > 0, { timeout: 2000, interval: 20, label: 'E : tir debout arrêté' });
  const fr = await t.ev(() => ({ hits: window.__btHits.slice(), life: window.__xr2d.scene.boss.life, open: window.__xr2d.boss.info().open }));
  assert(front.open && !front.mush && fr.hits[0] === 1 && fr.life === front.life - 1 && !fr.open, `E : tir debout de Kaï sur le titan assommé : une touche (${fmt({ front, fr })})`);

  // ---------- F. Vie perdue pendant les cailloux : retour au K, titan à neuf
  // Remise à neuf relevée sur le moment (cailloux encore annoncés ou en chute).
  await t.ev(() => {
    const bs = window.__xr2d.scene.boss;
    const reset = bs.reset.bind(bs);
    bs.reset = () => {
      const before = bs.info().rocks;
      reset();
      window.__btReset = { before, rocks: bs.info().rocks, hidden: bs.rocks.every((r) => r.phase === 'off' && !r.img.visible && !r.mark.visible) };
    };
  });
  await waitBoss(t, `i.act === 'stunned' && i.stuns === ${behind.stuns + 3} && i.rocks > 0`, 'F : choc suivant, cailloux annoncés', 12000);
  const lives0 = await t.ev(() => window.__xr2d.scene.lives);
  await t.ev(() => window.__xr2d.kill());
  await waitFor(t, (n) => window.__xr2d.scene.state === 'play' && window.__xr2d.scene.lives === n - 1, { timeout: 6000, label: 'F : réapparition', arg: lives0 });
  const back = await t.ev(() => ({ x: Math.round(window.__xr2d.scene.player.x), reset: window.__btReset }));
  assert(Math.abs(back.x - (201 * 64 + 32)) <= 1, `F : Kaï de retour au point de contrôle 201 (${fmt(back)})`);
  assert(back.reset && back.reset.before > 0 && back.reset.rocks === 0 && back.reset.hidden, `F : remis à neuf pendant les cailloux : rangés et cachés (${fmt(back.reset)})`);
  assertEq(await barrierCells(t), { state: 'open', cells: 0 }, 'F : barrières retirées');
  b = await boss(t);
  assert(
    b.state === 'wait' && b.life === BOSS_LIFE && b.phase === 1 && b.texture === 'boss-beetle-titan' && b.rocks === 0 && b.x === ARENA.boss * 64 + 32 && b.visible && b.open === false,
    `F : titan remis à neuf (${fmt(b)})`,
  );
  await waitFor(t, () => !document.querySelector('.hud-boss.is-on'), { timeout: 2000, label: 'F : barre de boss masquée' });
  au = await audioLog(t);
  assertEq(au.music[au.music.length - 1], 'jungle', 'F : musique du niveau');

  // ---------- G. Victoire : fuite, balise, prime, textures libérées
  await waitGrounded(t, 'G : Kaï posé');
  await walkIn(t, 'G');
  const t0 = await pageNow(t);
  await t.ev(() => {
    window.__btSfx.length = 0;
    window.__xr2d.boss.win();
  });
  b = await boss(t);
  assert(b.state === 'beaten' && b.life === 0 && b.beaten && b.arena.state === 'done' && b.texture === 'boss-beetle-titan-cracked' && b.frame === POSE.flee, `G : titan vaincu (fuite), arène ouverte pour de bon (${fmt(b)})`);
  au = await audioLog(t);
  assert(au.sfx.includes('bossDefeat') && au.sfx.includes('barrier'), `G : sons de la défaite et des barrières (${fmt(au.sfx)})`);
  assertEq((await toastsSince(t, 'Scarabée-titan s’enfuit', t0)).length, 1, 'G : message « Scarabée-titan s’enfuit ! »');
  await t.wait(500);
  await t.shot('beaten-flee');
  await waitBoss(t, "i.state === 'gone' && !i.visible", 'G : titan parti', 5000);
  // Après le champignon et la seconde borne (on les franchit d'un rebond ; en courant, Kaï s'arrête contre lui).
  await t.ev((c) => window.__xr2d.teleport(c, 11), ARENA.col1 + 1);
  await waitGrounded(t, 'G : Kaï posé après la seconde borne');
  const lives = await t.ev(() => window.__xr2d.scene.lives);
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitFor(t, () => window.__xr2d.scene.state === 'exit' && window.__xr2d.scene.exit.kind === 'beacon', { timeout: 10000, label: 'G : balise atteinte en courant' });
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
  await waitForScreen(t, 'results', { timeout: 25000 });
  const res = await t.ev(() => window.__btResult);
  const expected = res.crystals * 50 + res.enemies * 100 + Math.max(0, PAR_TIME_S - Math.floor(res.timeMs / 1000)) * 10 + lives * 500 + 2000;
  assert(res.bossBonus === 2000 && res.score === expected, `G : prime du boss dans le score (${fmt({ res, lives, expected })})`);
  await t.shot('results');
  await waitFor(t, (keys) => keys.every((k) => !window.__btGame.textures.exists(k)), { timeout: 5000, label: 'G : textures du titan et des barrières libérées après la session', arg: ARENA_TEX });
  const e = await ends(t);
  assert(e.length === 1 && e[0].kind === 'complete' && e[0].sid === g.sid, `G : un seul onComplete (${fmt(e)})`);

  await retryFight(t);
}

/** H. « Réessayer le combat » : Tess secourue et tronc couché gardés ; K d'avant l'arène contourné allumé sans message. */
async function retryFight(t) {
  // Sauvegarde effacée : j2 réussie en G a mis Tess dans l'équipage (elle serait déjà partie).
  await t.ev(() => localStorage.removeItem('xeno-rift-save-v1'));
  await t.goto(URL_START);
  const g = await waitPlay(t);
  assertEq(await t.ev(() => window.__xr2d.scene.npc.state), 'wait', 'H : Tess attend (pas encore dans l’équipage)');
  await t.ev((c) => {
    window.__xr2d.god(true);
    window.__xr2d.teleport(c, 11);
  }, QUAKE_COL);
  await waitFor(t, () => window.__xr2d.scene.trunks[0].state === 'down', { timeout: 5000, label: 'H : secousse, tronc couché' });
  const lying = await t.ev(() => window.__xr2d.scene.trunks[0].img.frame.name);
  await placeKai(t, TESS_DOOR.col, TESS_DOOR.row, 'H : devant la porte voisine de Tess');
  await t.key('ArrowUp', 80);
  await waitFor(t, () => window.__xr2d.scene.npc.state === 'gone', { timeout: 12000, label: 'H : Tess secourue' });
  // Arène atteinte sans passer devant le K 201 (contourné) : état noté à l'entrée.
  await t.ev(() => window.__xr2d.boss.enter());
  await waitBoss(t, "i.state === 'fight' && i.arena.state === 'closed'", 'H : combat commencé');
  const before = await progress2d(t);
  const snap = before.snap;
  const kRank = await t.ev(() => {
    const s = window.__xr2d.scene;
    const ks = s.parsed.checkpoints.filter((c) => c.col < s.arena.col0);
    return s.parsed.checkpoints.indexOf(ks[ks.length - 1]);
  });
  assert(snap && !before.k.on && !snap.items.checkpoints.includes(kRank), `H : K 201 contourné, état noté à l'entrée de l'arène (${fmt({ k: before.k, kRank, snap })})`);
  assert(snap.castaway === true && snap.events.fired.every((f) => f) && snap.trunks[0] === true, `H : Tess secourue (répliques jouées) et tronc couché notés (${fmt(snap)})`);
  assertEq(await loseFight(t, 'H'), 'Plus de vies !', 'H : motif de l’échec');
  const e = (await ends(t)).filter((x) => x.sid === g.sid);
  assert(e.length === 1 && e[0].kind === 'fail' && e[0].retry === 'boss', `H : onFail avec un point de reprise (${fmt(e)})`);

  const t0 = await pageNow(t);
  await pressScreen(t, 'fail', 'Réessayer le combat');
  const g2 = await waitPlay(t);
  await t.wait(800);
  const after = await progress2d(t);
  t.log('H : reprise', fmt({ x: after.x, k: after.k, checkpoints: after.items.checkpoints, castaway: after.castaway, trunks: after.trunks }));
  assert(g2.sid !== g.sid && after.retry && after.lives === 3 && after.x === after.k.x && after.timeMs >= snap.timeMs, `H : nouvel essai au K 201, 3 vies (${fmt(after)})`);
  assert(after.k.on, 'H : K 201 allumé au départ du nouvel essai');
  assertEq(after.snap, snap, 'H : K allumé sans être atteint de nouveau, instantané inchangé');
  assertEq(after.items.checkpoints, [...new Set([...snap.items.checkpoints, kRank])].sort((a, b) => a - b), 'H : points de contrôle notés, plus le K 201');
  assertEq(
    { castaway: after.castaway, trunks: after.trunks, crystals: after.crystals, taken: after.items.crystals, dead: after.deadEnemies },
    { castaway: true, trunks: snap.trunks, crystals: snap.crystals, taken: snap.items.crystals, dead: snap.deadEnemies },
    'H : état noté rendu',
  );
  const st = await t.ev((tr) => {
    const s = window.__xr2d.scene;
    const n = s.npc;
    const k = s.trunks[0];
    const tile = s.layer.getTileAt(tr.col + 1, tr.row);
    return {
      arrival: s.arrival,
      tess: { state: n.state, visible: n.img.visible, arrow: n.arrow.visible, capsule: n.capsule.visible },
      trunk: { state: k.state, frame: k.img.frame.name, cells: k.cells().map(([c, r]) => s.grid.at(c, r)), collides: !!tile && tile.collides },
      quake: s.levelEvents.events.map((w) => w.event.kind + ':' + w.state).filter((x) => x.startsWith('quake')),
    };
  }, TRUNK);
  assertEq(st.arrival, null, 'H : départ au K, sans arrivée');
  assertEq(st.tess, { state: 'gone', visible: false, arrow: false, capsule: true }, 'H : Tess partie, seule sa capsule reste');
  assertEq(st.trunk, { state: 'down', frame: lying, cells: [1, 1, 1, 1, 1, 1, 1], collides: true }, 'H : tronc couché et plein (grille et calque)');
  assertEq(st.quake, ['quake:1'], 'H : secousse déjà jouée');
  assertEq((await toastsSince(t, 'est à bord', t0)).length, 0, 'H : pas de « Tess est à bord ! » rejoué');
  assertEq((await toastsSince(t, 'Point de contrôle', t0)).length, 0, 'H : K allumé sans message');
  assertEq((await t.ev(() => window.__xrShell.radio())).played, [], 'H : aucun message de LUMA rejoué');
  const b = await boss(t);
  assert(b.state === 'wait' && b.life === BOSS_LIFE && b.arena.state === 'open', `H : titan à neuf (${fmt(b)})`);
  await t.shot('retry-fight-k');
}
