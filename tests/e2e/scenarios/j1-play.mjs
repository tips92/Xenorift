// Plateforme 2D, Jungle (j1) lancée par ?stage=j1 : arrivée (Kaï sort de la Comète posée, figé dans l'état
// « enter », puis posé au départ ; la Comète repart à vide vers l'orbite, son « takeoff », sans rien déclencher),
// course à droite, saut (monte puis retombe),
// tir laser, pause par Échap (overlay ouvert, Kaï figé), reprise, victoire (__xr2d.win : combat du Blob-roi passé,
// balise de LUMA activée, état exit, Kaï emporté par le faisceau, son, sortie en 2,6 s au plus) → écran de résultats
// sans prime de boss.
import {
  assert,
  assertEq,
  assertNear,
  lasers2d,
  player2d,
  readSave,
  screenText,
  waitFor,
  waitFor2dPlay,
  waitForScreen,
} from '../lib/helpers.mjs';

export const meta = {
  title: 'Jungle 2D : course, saut, tir, pause, victoire',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 90000,
};

/** Attend Kaï au sol et immobile verticalement. */
function waitGrounded(t, label) {
  return waitFor(
    t,
    () => {
      const s = window.__xr2d && window.__xr2d.scene;
      return !!(s && s.player && s.player.onGround && Math.abs(s.player.body.velocity.y) < 1);
    },
    { timeout: 5000, label },
  );
}

/** Avant t.goto : états successifs de la scène 2D (window.__states) et sons joués (window.__sfx). */
async function recordStart(t) {
  await t.page.addInitScript(() => {
    window.__states = [];
    window.__sfx = [];
    const tick = () => {
      const s = window.__xr2d && window.__xr2d.scene;
      const st = s && s.state;
      if (st && window.__states[window.__states.length - 1] !== st) window.__states.push(st);
      const a = window.__xrShell && window.__xrShell.audio;
      if (a && !a.__j1p) {
        a.__j1p = true;
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

/** Arrivée de la scène : état, Comète du départ, Kaï. */
function arrival(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const a = s.arrival;
    const p = s.player;
    return {
      kind: a && a.kind,
      landed: !!(a && a.landed),
      done: !!(a && a.done),
      ship: a ? { visible: a.comet.ship.visible, x: Math.round(a.comet.ship.x), y: Math.round(a.comet.ship.y) } : null,
      state: s.state,
      exitLaunched: !!(s.exit && s.exit.launched),
      x: p.x,
      feetY: p.feetY,
      states: window.__states.slice(),
      takeoff: window.__sfx.filter((id) => id === 'takeoff').length,
    };
  });
}

export default async function (t) {
  await recordStart(t);
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await waitGrounded(t, 'Kaï au sol au départ');
  // Arrivée : Kaï a quitté le cockpit (état enter) et se tient au départ P (8, 11) ; la Comète est encore là.
  const a0 = await arrival(t);
  t.log('arrivée', JSON.stringify(a0));
  assertEq([a0.kind, a0.landed, a0.done, a0.ship && a0.ship.visible], ['ship', true, false, true], 'arrivée en Comète : Kaï posé, Comète encore là');
  assertEq(a0.states.slice(0, 2), ['enter', 'play'], 'états de la scène : arrivée (commandes coupées) puis jeu');
  assertNear(a0.x, 8 * 64 + 32, 1, 'Kaï au départ P (x)');
  assertNear(a0.feetY, 12 * 64, 1, 'Kaï au départ P (pieds)');
  await t.shot('start');

  // --- Course : x augmente
  const p0 = await player2d(t);
  await t.page.keyboard.down('ArrowRight');
  await t.wait(800);
  await t.page.keyboard.up('ArrowRight');
  const p1 = await player2d(t);
  t.log('course', Math.round(p0.x), '->', Math.round(p1.x));
  assert(p1.x > p0.x + 100, `flèche droite : x doit augmenter nettement (${Math.round(p0.x)} -> ${Math.round(p1.x)})`);

  // --- Saut sur place : les pieds montent (y diminue) puis Kaï retombe au même niveau
  await waitGrounded(t, 'Kaï au sol avant le saut');
  const y0 = (await player2d(t)).feetY;
  await t.page.keyboard.down('Space');
  let minY = y0;
  for (let i = 0; i < 8; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  await t.page.keyboard.up('Space');
  for (let i = 0; i < 6; i++) {
    await t.wait(40);
    minY = Math.min(minY, (await player2d(t)).feetY);
  }
  await t.shot('jump');
  await waitGrounded(t, 'Kaï retombé au sol après le saut');
  const y1 = (await player2d(t)).feetY;
  t.log('saut', `pieds ${Math.round(y0)} -> apex ${Math.round(minY)} -> ${Math.round(y1)}`);
  assert(y0 - minY > 40, `Espace : Kaï doit monter d'au moins 40 px (montée ${Math.round(y0 - minY)} px)`);
  assertNear(y1, y0, 2, 'Kaï doit retomber au niveau de départ');

  // --- Tir : des lasers apparaissent
  let maxLasers = 0;
  for (let i = 0; i < 3; i++) {
    await t.key('KeyJ', 60);
    maxLasers = Math.max(maxLasers, await lasers2d(t));
    await t.wait(100);
  }
  await t.shot('fire');
  t.log('lasers actifs (max)', maxLasers);
  assert(maxLasers > 0, 'J : au moins un tir laser actif');

  // --- La Comète du départ est repartie : réacteur allumé (son), envolée hors de la vue, sans rien déclencher.
  await waitFor(t, () => window.__xr2d.scene.arrival.done, { timeout: 8000, label: 'Comète du départ repartie en orbite' });
  const a1 = await arrival(t);
  t.log('Comète repartie', JSON.stringify(a1.ship));
  assert(!a1.ship.visible && a1.ship.y < 12 * 64 - 900, `Comète montée hors de la vue puis masquée (${JSON.stringify(a1.ship)})`);
  assertEq([a1.state, a1.exitLaunched, a1.takeoff], ['play', false, 1], 'Comète à vide : un décollage (son), partie en cours, sortie intacte');

  // --- Pause (Échap) : overlay ouvert, partie en pause, Kaï figé même flèche tenue
  await t.key('Escape', 60);
  await waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause');
      const i = window.__xrShell.info();
      return !!(ov && ov.classList.contains('is-open') && i.run && i.run.paused);
    },
    { timeout: 5000, label: 'overlay de pause ouvert' },
  );
  const xa = (await player2d(t)).x;
  await t.page.keyboard.down('ArrowRight');
  await t.wait(500);
  await t.page.keyboard.up('ArrowRight');
  const pp = await player2d(t);
  await t.shot('pause');
  assertNear(pp.x, xa, 0.5, 'Kaï doit rester figé pendant la pause');
  assert(pp.paused, 'la session 2D doit être en pause');

  // --- Reprise (Échap) : overlay fermé, Kaï avance de nouveau
  await t.key('Escape', 60);
  await waitFor(
    t,
    () => {
      const ov = document.querySelector('.overlay.pause.is-open');
      const i = window.__xrShell.info();
      return !ov && !!(i.run && !i.run.paused) && !i.navLock;
    },
    { timeout: 5000, label: 'reprise après la pause' },
  );
  const xr = (await player2d(t)).x;
  await t.page.keyboard.down('ArrowRight');
  await t.wait(400);
  await t.page.keyboard.up('ArrowRight');
  const xr2 = (await player2d(t)).x;
  assert(xr2 > xr + 30, `après reprise, flèche droite : x doit augmenter (${Math.round(xr)} -> ${Math.round(xr2)})`);

  // --- Victoire : win() pose Kaï devant la balise de LUMA, qui s'active aussitôt (état exit) ; le faisceau
  // l'emporte vers le haut et la sortie se termine en 2,6 s de jeu au plus (horloge de la scène, celle des délais
  // de la séquence : sondée par un minuteur posé juste avant). Relevé image par image dans la page
  // (window.__exitRun) ; son « beacon » noté en enveloppant l'audio ; capture pendant le faisceau.
  const begin = await t.ev(() => {
    const s = window.__xr2d.scene;
    const a = window.__xrShell.audio;
    const sfx = [];
    const orig = a.sfx;
    a.sfx = function (id, opts) {
      sfx.push(id);
      return orig.call(this, id, opts);
    };
    const probe = s.time.addEvent({ delay: 1e9 });
    window.__xr2d.win();
    const e = s.exit;
    const r = {
      kind: e && e.kind,
      state: s.state,
      launched: !!(e && e.launched),
      placed: !!e && Math.abs(s.player.x - e.approachX) < 1 && Math.abs(s.player.feetY - e.feetY) < 1,
      // Le combat du Blob-roi est passé : arène ouverte pour de bon, boss resté en attente, sans prime.
      arena: s.arena && s.arena.state,
      boss: s.boss && s.boss.state,
    };
    const feet0 = s.player.sprite.y;
    let rise = 0;
    const real0 = performance.now();
    window.__exitRun = null;
    const tick = () => {
      const spr = s.player.sprite;
      if (spr.visible) rise = Math.max(rise, feet0 - spr.y);
      if (s.state === 'exit' && performance.now() - real0 < 15000) {
        requestAnimationFrame(tick);
        return;
      }
      a.sfx = orig;
      window.__exitRun = { end: s.state, ms: Math.round(probe.getElapsed()), rise: Math.round(rise), hidden: !spr.visible, sfx };
    };
    requestAnimationFrame(tick);
    return r;
  });
  assertEq(
    begin,
    { kind: 'beacon', state: 'exit', launched: true, placed: true, arena: 'done', boss: 'wait' },
    'win() : combat du boss passé, Kaï posé devant la balise de LUMA, activée aussitôt (état exit)',
  );
  await t.wait(650);
  await t.shot('beacon-beam');
  const exit = await waitFor(t, () => window.__exitRun || false, { timeout: 20000, label: 'fin de la sortie (relevé dans la page)' });
  t.log('sortie', JSON.stringify(exit));
  assert(exit.end === 'over' && exit.ms <= 2620, `sortie terminée (état over) en 2,6 s de jeu au plus : ${exit.end}, ${exit.ms} ms`);
  assert(exit.rise > 300 && exit.hidden, `Kaï emporté vers le haut puis masqué (montée ${exit.rise} px, masqué : ${exit.hidden})`);
  assert(exit.sfx.includes('beacon'), `son de la balise attendu (sons : ${exit.sfx.join(', ')})`);
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  t.log('résultats', text.slice(0, 120));
  assert(/NIVEAU TERMIN/i.test(text), `écran de résultats attendu (texte : ${text.slice(0, 160)})`);
  assert(!(await t.ev(() => document.querySelector('.screens [data-screen="results"].is-active .results-bonus'))), 'combat passé par win() : pas de prime de boss');
  await t.shot('results');
  const save = await readSave(t);
  assert(save && save.best && save.best.j1, `record de j1 sauvegardé (sauvegarde : ${JSON.stringify(save)})`);
  // Mode test (?unlock=1) : tout est ouvert ; l'étape réussie se lit dans `cleared`.
  const prog = await t.ev(() => {
    const st = window.__xrShell.info().stages;
    const i = st.findIndex((s) => s.id === 'j1');
    return st.slice(i, i + 2);
  });
  assertEq(
    prog.map((s) => [s.cleared, s.unlocked]),
    [[true, true], [false, true]],
    `j1 réussie, l'étape suivante (${prog[1] && prog[1].id}) non réussie (ouverte par le mode test)`,
  );
}
