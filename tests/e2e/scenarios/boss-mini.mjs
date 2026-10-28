// Mini-boss de j1 (Blob-roi, plan 04 étape 5), lancé par ?at=boss (départ au point de contrôle d'avant l'arène) :
//  A. renforts cachés dès le chargement ; entrée dans l'arène → barrières fermées (grille ET calque, collision),
//     sons « barrier » et « bossAppear », musique « boss », barre de boss, caméra calée et centrée sur l'arène
//     (plus étroite que la vue), Kaï retenu par la barrière ;
//  B. noyau seul vulnérable : contrat hitBy (0 sur la gelée, dégâts sur le noyau de l'image aplatie, -1 à côté),
//     tirs du ShotPool arrêtés par la gelée sans dégât puis qui blessent le noyau aplati ; ondes au sol qui
//     blessent au sol et pas en saut ;
//  C. phase 2 à mi-vie : planche « rage », 2 petits blobs appelés tournés vers Kaï, hors score ; barre « Phase 2/2 » ;
//  D. vie perdue dans l'arène → retour au K, arène rouverte (grille, calque, caméra), boss à neuf, renforts rangés,
//     barre masquée, musique du niveau ;
//  E. victoire : fuite, barrières ouvertes, Kaï court jusqu'à la balise → résultats avec « Boss vaincu +2 000 » sous
//     le score (prime comprise dans le score ; panneau entier sans défilement à 844x390 et 640x320) ;
//     textures du boss et des barrières libérées après la session ;
//  F. perte du contexte WebGL en plein combat : partie figée, restauration, le combat reprend, aucun échec.
import { assert, assertEq, fmt, waitFor, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout } from '../lib/core.mjs';
import { ends, loseGameOk, pageNow, recordUi, restoreGame, toastsSince, waitGrounded, waitPlay } from '../lib/game2d.mjs';

export const meta = {
  title: 'Mini-boss de j1 : arène, Blob-roi, phase 2, vie perdue, victoire, perte de contexte',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

/** Textures propres à l'arène et au Blob-roi (à libérer après la session). */
const ARENA_TEX = ['boss-blob-king', 'boss-blob-king-rage', 'boss-blob-wave', 'w1-barrier-top', 'w1-barrier-mid', 'w1-barrier-bottom'];
const URL = '?touch=1&unlock=1&stage=j1&at=boss';

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
    window.__bmSfx = [];
    window.__bmMusic = [];
    if (a.__bmSpied) return;
    a.__bmSpied = true;
    const sfx = a.sfx;
    const music = a.music;
    a.sfx = function (id, o) {
      window.__bmSfx.push(id);
      return sfx.call(this, id, o);
    };
    a.music = function (id) {
      window.__bmMusic.push(id);
      return music.call(this, id);
    };
  });
}

function audioLog(t) {
  return t.ev(() => ({ sfx: window.__bmSfx.slice(), music: window.__bmMusic.slice() }));
}

/** Barre de boss du HUD : affichée, nom, phase, vie lue sur la jauge (scaleX), repères de phase. */
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
    };
  });
}

/** Cases des deux barrières : pleines dans la grille, tuiles du calque avec collision. */
function barrier(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const a = s.arena;
    const g = s.grid;
    let cells = 0;
    let tiles = 0;
    let n = 0;
    for (const c of [a.col0, a.col1]) {
      for (let r = 0; r <= a.row; r++) {
        n++;
        if (g.cells[r * g.cols + c] === 1) cells++;
        const tl = s.layer.getTileAt(c, r);
        if (tl && tl.collides) tiles++;
      }
    }
    return { state: a.state, n, cells, tiles };
  });
}

/** Caméra : centre de la vue, cadre (bounds), centre de l'arène, largeur de la carte. */
function camera(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const c = s.cameras.main;
    const a = s.arena;
    const b = c.getBounds();
    return { cx: c.scrollX + c.width / 2, w: c.width, bx: b.x, bw: b.width, arenaCx: (a.outerLeft + a.outerRight) / 2, mapW: s.parsed.width, blend: a.camBlend };
  });
}

/** → tenu jusqu'à la fermeture des barrières (entrée dans l'arène en courant). */
async function walkIn(t, label) {
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitBoss(t, "i.arena.state === 'closed' && i.state === 'fight'", `${label} : barrières fermées à l'entrée de Kaï`, 5000);
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
}

/** Tir du ShotPool (fiche de l'arme tenue) vers le noyau, depuis 170 px du boss, à hauteur du canon debout. */
function fireAtBoss(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const b = s.boss;
    const a = s.arena;
    const fromLeft = b.x - 170 > a.left + 10;
    const x = fromLeft ? b.x - 170 : b.x + 170;
    const y = b.y - 38;
    window.__bmHits.length = 0;
    s.lasers.fire(x, y, fromLeft ? 0 : Math.PI, s.gun.stats, x + (fromLeft ? -10 : 10), y);
    return { life: b.life, damage: s.gun.stats.damage };
  });
}

export default async function (t) {
  await recordUi(t);
  await t.goto(URL);
  const g = await waitPlay(t);
  await spyAudio(t);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(true);
    window.__bmGame = s.game;
    // Résultat transmis à l'interface (prime du boss, score).
    const h = s.session.hooks;
    const oc = h.onComplete;
    h.onComplete = (r) => {
      window.__bmResult = JSON.parse(JSON.stringify(r));
      return oc(r);
    };
    // Retours de hitBy qui arrêtent un tir (0 gelée, > 0 dégâts) ; appels de renforts.
    window.__bmHits = [];
    const b = s.boss;
    const hitBy = b.hitBy.bind(b);
    b.hitBy = (x, y, d) => {
      const r = hitBy(x, y, d);
      if (r >= 0) window.__bmHits.push(r);
      return r;
    };
    // Copie additive du clignotement calée sur l'état du boss (à lire dans la même tâche que le coup).
    window.__bmGlow = () => {
      const gl = b.glow;
      return {
        on: gl.visible,
        at: gl.x === b.x && gl.y === b.y,
        flip: gl.flipX === b.facing < 0,
        tex: gl.texture.key === b.sheet.key && String(gl.frame.name) === String(b.frame),
      };
    };
    window.__bmSummons = [];
    const en = s.enemies;
    const summon = en.summon.bind(en);
    en.summon = (x, feet, dir, vy) => {
      window.__bmSummons.push({ x, dir, kai: s.player.x, boss: s.boss.x });
      return summon(x, feet, dir, vy);
    };
  });
  await waitGrounded(t, 'A : Kaï posé au départ');

  // ---------- A. Départ au K, arène fermée à l'entrée, caméra calée
  const start = await t.ev((keys) => {
    const s = window.__xr2d.scene;
    const ks = s.parsed.checkpoints.filter((c) => c.col < s.arena.col0);
    const k = ks[ks.length - 1];
    return {
      x: Math.round(s.player.x),
      kx: k.col * 64 + 32,
      gap: s.arena.col0 - k.col,
      reserve: s.enemies.list.filter((e) => e.summoned).map((e) => ({ kind: e.kind, alive: e.alive, visible: e.sprite.visible, body: !!(e.body && e.body.enable) })),
      tex: keys.filter((key) => !s.textures.exists(key)),
    };
  }, ARENA_TEX);
  t.log('départ', fmt(start));
  assert(Math.abs(start.x - start.kx) <= 1 && start.gap >= 1 && start.gap <= 6, `A : départ au point de contrôle d'avant l'arène (${fmt(start)})`);
  assertEq(start.reserve, [0, 1].map(() => ({ kind: 'w', alive: false, visible: false, body: false })), 'A : 2 petits blobs créés cachés dès le chargement');
  assertEq(start.tex, [], 'A : textures du boss et des barrières générées');
  let b = await boss(t);
  assert(b.state === 'wait' && b.arena.state === 'open' && b.life === 24 && b.maxLife === 24 && b.phase === 1, `A : boss en attente, arène ouverte (${fmt(b)})`);
  assert(!(await bossBar(t)).on, 'A : pas de barre de boss avant le combat');
  assertEq((await barrier(t)).cells, 0, 'A : barrières ouvertes (grille)');

  // Glissement du cadre à la fermeture : position de la vue relevée image par image, après le rendu.
  await t.ev(() => {
    const s = window.__xr2d.scene;
    const cam = s.cameras.main;
    const log = (window.__bmCam = []);
    const on = (_r, _time, delta) => {
      const a = s.arena;
      log.push({ sx: cam.scrollX, closed: a.state === 'closed', dt: Math.min(delta, 50) });
      if (a.camBlend >= 1 || log.length > 3000) s.game.events.off('postrender', on);
    };
    s.game.events.on('postrender', on);
  });
  await walkIn(t, 'A');
  const closed = await barrier(t);
  assertEq(closed, { state: 'closed', n: 24, cells: 24, tiles: 24 }, 'A : 2 x 12 cases de barrière pleines (grille) et solides (calque)');
  await waitFor(t, () => document.querySelector('.hud-boss.is-on') !== null, { timeout: 2000, label: 'A : barre de boss affichée' });
  const bar = await bossBar(t);
  assertEq(bar, { on: true, name: 'Blob-roi', phase: 'Phase 1/2', life: 1, marks: 1 }, 'A : barre de boss (nom, phase, vie pleine, repère de mi-vie)');
  let au = await audioLog(t);
  assert(au.sfx.includes('barrier') && au.sfx.includes('bossAppear'), `A : sons de la barrière et de l'apparition (${fmt(au.sfx)})`);
  assertEq(au.music[au.music.length - 1], 'boss', 'A : musique du boss');
  await waitFor(t, () => window.__xr2d.boss.info().arena.camBlend === 1, { timeout: 3000, label: 'A : caméra calée sur l’arène' });
  const glide = await t.ev(() => {
    const log = window.__bmCam;
    const i0 = log.findIndex((e) => e.closed);
    let step = 0;
    let rate = 0;
    for (let i = Math.max(1, i0); i < log.length; i++) {
      const d = Math.abs(log[i].sx - log[i - 1].sx);
      step = Math.max(step, d);
      rate = Math.max(rate, d / Math.max(1, log[i].dt));
    }
    const from = i0 > 0 ? log[i0 - 1].sx : NaN;
    return { frames: log.length - i0, from: Math.round(from), to: Math.round(log[log.length - 1].sx), step: Math.round(step), pxPerMs: Math.round(rate * 100) / 100 };
  });
  t.log('glissement', fmt(glide));
  // Sans point de départ (vue à la fermeture), la vue restait figée puis sautait de ≈ 400 px en 4 images.
  assert(glide.frames >= 8 && glide.step <= 60, `A : la vue glisse vers l'arène sans saut (${fmt(glide)})`);
  await t.wait(150);
  const cam = await camera(t);
  t.log('caméra', fmt(cam));
  assert(cam.bw === cam.w && Math.abs(cam.cx - cam.arenaCx) <= 1, `A : arène plus étroite que la vue, centrée (${fmt(cam)})`);
  // Kaï poussé contre la première barrière : retenu.
  await t.page.keyboard.down('ArrowLeft');
  await t.wait(1200);
  const kx = await t.ev(() => ({ left: window.__xr2d.scene.player.left, wall: window.__xr2d.scene.arena.left }));
  await t.page.keyboard.up('ArrowLeft');
  assert(kx.left >= kx.wall - 1, `A : Kaï retenu par la barrière (${fmt(kx)})`);
  await t.shot('arena-closed');

  // ---------- B. Noyau seul vulnérable
  await waitBoss(t, "i.act === 'flat'", 'B : boss aplati après un bond');
  const flat = await t.ev(() => {
    const s = window.__xr2d.scene;
    const bs = s.boss;
    const w = bs.waves.find((x) => x.alive);
    const fake = (x, feet) => ({ left: x - 17, right: x + 17, top: feet - 70, feetY: feet });
    const n = (v) => (Number.isNaN(v) ? 'NaN' : Math.round(v));
    const feet = bs.spot.feetY;
    const life0 = bs.life;
    const core = bs.hitBy(bs.x, bs.y - 50, 2);
    const glow = window.__bmGlow();
    const miss = bs.hitBy(bs.x, bs.y - 400, 2);
    return {
      waves: bs.waves.filter((x) => x.alive).length,
      waveGround: w ? n(bs.hurts(fake(w.x, feet))) : null,
      waveJump: w ? n(bs.hurts(fake(w.x, feet - 130))) : null,
      life0,
      core,
      glow,
      miss,
      life1: bs.life,
    };
  });
  t.log('aplati', fmt(flat));
  assert(flat.waves >= 1 && typeof flat.waveGround === 'number' && flat.waveJump === 'NaN', `B : onde au sol, qui blesse au sol et pas en saut (${fmt(flat)})`);
  assert(flat.core === 2 && flat.miss === -1 && flat.life1 === flat.life0 - 2, `B : noyau aplati touché (2), tir à côté raté (-1) (${fmt(flat)})`);
  // Coup reçu hors de la boucle de rendu : la copie du clignotement est déjà sur le boss (pas à sa place de départ).
  assertEq(flat.glow, { on: true, at: true, flip: true, tex: true }, 'B : clignotement calé sur le boss dès le coup');
  await t.shot('flat-core');
  await waitBoss(t, "i.act === 'idle'", 'B : boss revenu au repos');
  const body = await t.ev(() => {
    const bs = window.__xr2d.scene.boss;
    const life0 = bs.life;
    return { r: bs.hitBy(bs.x, bs.y - 50, 2), life0, life1: bs.life };
  });
  assert(body.r === 0 && body.life1 === body.life0, `B : gelée au repos : tir arrêté sans dégât (0) (${fmt(body)})`);
  // Tirs du ShotPool (fiche de l'arme tenue) : arrêtés par la gelée, puis blessent le noyau aplati.
  const shot1 = await fireAtBoss(t);
  await waitFor(t, () => window.__bmHits.length > 0, { timeout: 3000, interval: 20, label: 'B : tir arrêté par le boss au repos' });
  const r1 = await t.ev(() => ({ hits: window.__bmHits.slice(), life: window.__xr2d.scene.boss.life, act: window.__xr2d.boss.info().act }));
  assert(r1.hits[0] === 0 && r1.life === shot1.life, `B : tir arrêté par la gelée sans dégât (${fmt({ shot1, r1 })})`);
  await waitBoss(t, "i.act === 'flat'", 'B : boss de nouveau aplati');
  const shot2 = await fireAtBoss(t);
  await waitFor(t, () => window.__bmHits.length > 0, { timeout: 3000, interval: 20, label: 'B : tir sur le noyau aplati' });
  const r2 = await t.ev(() => ({ hits: window.__bmHits.slice(), life: window.__xr2d.scene.boss.life }));
  assert(r2.hits[0] === shot2.damage && r2.life === shot2.life - shot2.damage, `B : tir sur le noyau aplati : ${shot2.damage} de dégâts (${fmt({ shot2, r2 })})`);
  await waitFor(t, () => Number(/scaleX\(([\d.]+)\)/.exec(document.querySelector('.boss-fill').style.transform)[1]) < 0.85, { timeout: 2000, label: 'B : barre de boss qui baisse' });
  // Rebond par le dessus, sans mode dieu : Kaï lâché sur le milieu (la couronne dépasse du corps) ne perd rien.
  await waitBoss(t, "i.act === 'idle'", 'B : boss au repos avant le rebond');
  const crown = await t.ev(
    () =>
      new Promise((resolve) => {
        const s = window.__xr2d.scene;
        const bs = s.boss;
        const p = s.player;
        let top = 0;
        for (const h of bs.boxes.hurt) top = Math.min(top, h.y);
        const hearts = s.hearts;
        const t0 = performance.now();
        window.__xr2d.god(false);
        p.invulnMs = 0;
        p.teleport(bs.x, bs.y + top - 30);
        const on = () => {
          let r = null;
          if (s.hearts < hearts) r = { hurt: true, act: bs.act };
          else if (s.stompGraceMs > 0) r = { hurt: false, vy: Math.round(p.body.velocity.y), act: bs.act, feet: Math.round(p.feetY - bs.y), top };
          else if (performance.now() - t0 > 3000) r = { timeout: true, act: bs.act };
          if (!r) return;
          s.events.off('postupdate', on);
          window.__xr2d.god(true);
          // Kaï ramené près de la première borne (ne pas rebondir sur le noyau aplati : vie de la phase 2 vérifiée).
          p.teleport(s.arena.left + 64, bs.spot.feetY);
          resolve(r);
        };
        s.events.on('postupdate', on);
      }),
  );
  t.log('rebond', fmt(crown));
  assert(crown.hurt === false && crown.vy < 0, `B : rebond sur la couronne sans perdre de cœur (${fmt(crown)})`);

  // ---------- C. Phase 2 à mi-vie, petits blobs appelés (hors score)
  const killed0 = await t.ev(() => window.__xr2d.scene.enemiesKilled);
  const rageGlow = await t.ev(() => {
    window.__xr2d.boss.hit(window.__xr2d.boss.info().life - 12);
    return window.__bmGlow();
  });
  assertEq(rageGlow, { on: true, at: true, flip: true, tex: true }, 'C : clignotement sur la planche « rage » dès le coup');
  await waitBoss(t, "i.phase === 2 && i.act === 'rage' && i.texture === 'boss-blob-king-rage'", 'C : phase 2 (colère, planche « rage »)', 3000);
  au = await audioLog(t);
  assert(au.sfx.includes('bossPhase') && au.sfx.includes('bossHit'), `C : sons du coup et de la phase (${fmt(au.sfx)})`);
  await waitFor(t, () => window.__xr2d.scene.enemies.list.filter((e) => e.summoned && e.alive).length === 2, { timeout: 4000, label: 'C : 2 petits blobs appelés' });
  const summons = await t.ev(() => window.__bmSummons.slice());
  assert(summons.length === 2 && summons.every((s) => s.dir === (s.kai < s.boss ? -1 : 1)), `C : petits blobs tournés vers Kaï (${fmt(summons)})`);
  const bar2 = await bossBar(t);
  assert(bar2.on && bar2.phase === 'Phase 2/2' && Math.abs(bar2.life - 0.5) < 0.01, `C : barre « Phase 2/2 » à mi-vie (${fmt(bar2)})`);
  await t.shot('phase-2');
  const killed1 = await t.ev(() => {
    const s = window.__xr2d.scene;
    const e = s.enemies.list.find((x) => x.summoned && x.alive);
    s.enemies.hit(e, 99);
    return s.enemiesKilled;
  });
  assertEq(killed1, killed0, 'C : petit blob éliminé hors score (enemiesKilled inchangé)');

  // ---------- D. Vie perdue dans l'arène : retour au K, boss à neuf
  const lives0 = await t.ev(() => window.__xr2d.scene.lives);
  await t.ev(() => window.__xr2d.kill());
  await waitFor(t, (n) => window.__xr2d.scene.state === 'play' && window.__xr2d.scene.lives === n - 1, { timeout: 6000, label: 'D : réapparition', arg: lives0 });
  const back = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { x: Math.round(s.player.x), alive: s.enemies.list.filter((e) => e.summoned && (e.alive || e.dying)).length };
  });
  assert(Math.abs(back.x - start.kx) <= 1, `D : Kaï de retour au point de contrôle d'avant l'arène (${fmt(back)} / ${start.kx})`);
  assertEq(back.alive, 0, 'D : petits blobs rangés');
  assertEq(await barrier(t), { state: 'open', n: 24, cells: 0, tiles: 0 }, 'D : barrières retirées (grille et calque)');
  b = await boss(t);
  assert(b.state === 'wait' && b.life === 24 && b.phase === 1 && b.texture === 'boss-blob-king' && b.waves === 0, `D : boss remis à neuf (${fmt(b)})`);
  const camD = await camera(t);
  assert(camD.bx === 0 && camD.bw === camD.mapW, `D : caméra rendue à toute la carte (${fmt(camD)})`);
  await waitFor(t, () => !document.querySelector('.hud-boss.is-on'), { timeout: 2000, label: 'D : barre de boss masquée' });
  au = await audioLog(t);
  assertEq(au.music[au.music.length - 1], 'jungle', 'D : musique du niveau');
  await t.shot('respawn-k');

  // ---------- E. Victoire : fuite, barrières ouvertes, balise, résultats avec la prime
  await waitGrounded(t, 'E : Kaï posé');
  await walkIn(t, 'E');
  assertEq((await bossBar(t)).phase, 'Phase 1/2', 'E : nouveau combat en phase 1');
  await t.ev(() => {
    window.__bmSfx.length = 0;
  });
  const t0 = await pageNow(t);
  await t.ev(() => window.__xr2d.boss.win());
  b = await boss(t);
  assert(b.state === 'beaten' && b.life === 0 && b.beaten && b.arena.state === 'done', `E : boss vaincu, arène ouverte pour de bon (${fmt(b)})`);
  assertEq((await barrier(t)).cells, 0, 'E : barrières retirées');
  au = await audioLog(t);
  assert(au.sfx.includes('bossDefeat') && au.sfx.includes('barrier'), `E : sons de la défaite et des barrières (${fmt(au.sfx)})`);
  assertEq(au.music[au.music.length - 1], 'jungle', 'E : musique du niveau');
  await waitFor(t, () => !document.querySelector('.hud-boss.is-on'), { timeout: 2000, label: 'E : barre de boss masquée' });
  assertEq((await toastsSince(t, 'Blob-roi s’enfuit', t0)).length, 1, 'E : message « Blob-roi s’enfuit ! »');
  await t.wait(500);
  await t.shot('beaten-flee');
  await waitBoss(t, "i.state === 'gone' && !i.visible", 'E : Blob-roi parti', 5000);
  // La balise s'atteint en courant (seconde borne franchie).
  const lives = await t.ev(() => window.__xr2d.scene.lives);
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitFor(t, () => window.__xr2d.scene.state === 'exit', { timeout: 8000, label: 'E : balise atteinte en courant' });
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
  await waitForScreen(t, 'results', { timeout: 25000 });
  const res = await t.ev(() => window.__bmResult);
  const expected =
    res.crystals * 50 + res.enemies * 100 + Math.max(0, 240 - Math.floor(res.timeMs / 1000)) * 10 + lives * 500 + 2000;
  assert(res.bossBonus === 2000 && res.score === expected, `E : prime du boss dans le score (${fmt({ res, lives, expected })})`);
  const R = '.screens [data-screen="results"].is-active';
  await t.page.locator(`${R} .results-panel`).click({ position: { x: 8, y: 8 } }); // fin des animations
  const line = await t.ev((sel) => {
    const e = document.querySelector(`${sel} .results-bonus`);
    return e ? { label: e.querySelector('.results-bonus-label').textContent, value: e.querySelector('.results-bonus-value').textContent.replace(/\s/g, '') } : null;
  }, R);
  assertEq(line, { label: 'Boss vaincu', value: '+2000' }, 'E : prime « Boss vaincu +2 000 » sous le score des résultats');
  const LAYOUT = [`${R} .results-bonus`, `${R} .results-score`, `${R} .detail`, `${R} .detail-label`, `${R} .detail-value`, `${R} .results-actions .btn`, `${R} .results-actions .btn-label`];
  const noScroll = (sel) => {
    const p = document.querySelector(`${sel} .results-panel`);
    return p.scrollHeight <= p.clientHeight + 1;
  };
  await assertLayout(t, LAYOUT, 'E : résultats 844x390');
  assert(await t.ev(noScroll, R), 'E : panneau des résultats entier, sans défilement (844x390)');
  await t.shot('results-boss');
  // 640x320 : plus petit écran à deux colonnes (en dessous, le panneau empilé défile, prime ou pas).
  await t.page.setViewportSize({ width: 640, height: 320 });
  await t.wait(400);
  await assertLayout(t, LAYOUT, 'E : résultats 640x320');
  assert(await t.ev(noScroll, R), 'E : panneau des résultats entier, sans défilement (640x320)');
  await t.shot('results-boss-640x320');
  await t.page.setViewportSize({ width: 844, height: 390 });
  await waitFor(t, (keys) => keys.every((k) => !window.__bmGame.textures.exists(k)), { timeout: 5000, label: 'E : textures du boss et des barrières libérées après la session', arg: ARENA_TEX });
  const e1 = await ends(t);
  assert(e1.length === 1 && e1[0].kind === 'complete' && e1[0].sid === g.sid, `E : un seul onComplete (${fmt(e1)})`);

  // ---------- F. Perte du contexte WebGL en plein combat
  await t.goto(URL);
  const g2 = await waitPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  await waitGrounded(t, 'F : Kaï posé');
  await walkIn(t, 'F');
  await t.ev(() => window.__xr2d.boss.hit(4));
  await t.wait(500);
  const loss = await loseGameOk(t, 0, 'F : perte en plein combat');
  await waitFor(t, () => window.__xr2d.scene.session.gfxLost, { timeout: 5000, label: 'F : perte prise en compte' });
  const f0 = await t.ev(() => ({ clock: window.__xr2d.scene.clockMs, ...window.__xr2d.boss.info() }));
  await t.wait(1000);
  const f1 = await t.ev(() => ({ clock: window.__xr2d.scene.clockMs, ...window.__xr2d.boss.info() }));
  assert(f1.clock === f0.clock && f1.x === f0.x && f1.y === f0.y && f1.act === f0.act, `F : combat figé pendant la perte (${fmt({ f0, f1 })})`);
  await restoreGame(t);
  await waitFor(t, () => !window.__xr2d.scene.session.gfxLost && window.__xr2d.scene.sys.isActive(), { timeout: 5000, label: 'F : contexte restauré, scène relancée' });
  await waitFor(t, (c) => window.__xr2d.scene.clockMs > c + 1500, { timeout: 8000, label: 'F : le combat reprend', arg: f1.clock });
  b = await boss(t);
  assert(b.state === 'fight' && b.life === 20 && b.arena.state === 'closed' && b.visible, `F : combat toujours en cours après la restauration (${fmt(b)})`);
  assert((await bossBar(t)).on, 'F : barre de boss toujours affichée');
  await t.shot('ctx-restored');
  for (let now = await pageNow(t); now < loss.at + 6500; now = await pageNow(t)) await t.wait(250);
  assertEq((await ends(t, loss.at)).length, 0, 'F : aucun échec après la perte');
  await t.ev(() => window.__xr2d.boss.win());
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const e2 = await ends(t, loss.at);
  assert(e2.length === 1 && e2[0].kind === 'complete' && e2[0].sid === g2.sid, `F : un seul onComplete (${fmt(e2)})`);
}
