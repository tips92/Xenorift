// Vol 1 (f1) : combat du boss après le dernier portail (plan 04, étape 17 ; boss PROVISOIRE de
// src/game3d/bosses/provisional.ts en attendant le léviathan de l'étape 18 ; choix 7 et 15, décisions 20 et 21).
//  A. Partie normale (?stage=f1, tactile) : pilote automatique en avance rapide (__xr3d.advance) jusqu'au dernier
//     portail → phase 'boss' aussitôt (16/16, jamais de distorsion avant), boss qui arrive ('appear' puis 'fight'),
//     musique `boss`, son `bossAppear`, message « Chrono figé ! », portail de distorsion fermé ; chrono et avancement
//     figés (jeu et HUD) ; barre « Léviathan » en 6 crans, « Phase 1/2 » ; aucun programme compilé depuis le départ
//     (boss préparé avec la scène) ; appels de dessin < 150 ; Comète pilotée au clavier (flèches simulées) vers une
//     cible : visée sur le boss et atteignable, aucun tir sans TIR ; TIR tenu (aide fire) : une touche, barre d'un cran
//     plus courte ; TIR tactile ; touches jusqu'à la phase 2 (sons `bossHit` et `bossPhase`, barre « Phase 2/2 » à
//     moitié) ; perte du contexte puis restauration en plein combat : combat intact (touches, phase, chrono, portail
//     fermé) ; victoire : barre masquée, « Portail ouvert ! », portail ouvert ≈ 230 u devant la Comète, chrono
//     toujours figé, distorsion en l'atteignant → « VOL RÉUSSI », « Boss vaincu +3 000 », score = temps restant au
//     début du combat + portails + sans dégâts + points + prime.
//  B. Boucliers épuisés par les orbes du boss (pilote coupé) → « Vaisseau détruit ! » et « Réessayer le combat » →
//     reprise au début du combat : jamais de phase 'fly', boucliers pleins, état noté rendu (chrono, portails, points,
//     cristaux), boss à neuf, musique `boss` dès le compte à rebours, sans prime sans dégâts ; perdu de nouveau :
//     même instantané, bouton de nouveau → « Réessayer » simple : tout le vol ; combat lancé en vol
//     (__xr3d.boss.start) puis perdu → « Réessayer le combat » → victoire : score sans prime sans dégâts.
//  C. ?at=boss : départ au combat ; perte définitive du contexte en plein combat → « Liaison graphique perdue » avec
//     « Réessayer le combat » → reprise au combat sur un contexte neuf ; boss vaincu puis perte définitive avant le
//     portail : issue décidée, « VOL RÉUSSI » avec la prime (un seul écran de résultats).
//  D. Barre de boss de 844x390 à 568x320 (commandes normales, grandes, gaucher) : entière, sans chevaucher TIR,
//     TURBO, le joystick, le bouton pause ni le HUD du vol.
import { assert, assertEq, assertNear, center, fmt, readSave, screenText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout, hudFlight, overlaps, recordToasts, rects, toasts } from '../lib/core.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  assertOneLiveCanvas,
  frameLuma,
  loseFlightOk,
  pageNow,
  pressScreen,
  recordUi,
  screensSince,
  toastsSince,
  waitFail,
  waitNewRun,
} from '../lib/game3d.mjs';
import { restoreContext } from '../lib/gl.mjs';
import { touches } from '../lib/touch.mjs';

export const meta = {
  title: 'Vol 1 : combat du boss (chrono figé, TIR, touches, portail, « Réessayer le combat », contexte, barre)',
  suites: ['full'],
  dev: true,
  timeoutMs: 480000,
};

// ---------------------------------------------------------------- Valeurs recopiées (src/game3d/bosses, flight.ts)

/** Boss de f1 (FLIGHT_BOSSES de src/game3d/bosses/index.ts, PHASE_TARGETS de provisional.ts). */
const BOSS = { name: 'Léviathan', touches: 6, phases: 2, bonus: 3000 };
const BOSS_HALF = BOSS.touches / BOSS.phases;
/** Portail ouvert à la victoire, devant la Comète (PORTAL_AHEAD de src/game3d/flight.ts). */
const PORTAL_AHEAD = 230;
/** Score (startWarp de flight.ts) ; chrono du départ de f1 (COURSES.nebula.startTime). */
const SCORE = { perSecond: 100, perGate: 200, noDamage: 1000 };
const START_TIME = 72;

// ---------------------------------------------------------------- Aides

/** Sons et musiques notés en enveloppant __xrShell.audio (une fois par page) : window.__fbSfx / __fbMusic. */
function spyAudio(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    window.__fbSfx = [];
    window.__fbMusic = [];
    if (a.__fbSpied) return;
    a.__fbSpied = true;
    const sfx = a.sfx;
    const music = a.music;
    a.sfx = function (id, o) {
      window.__fbSfx.push(id);
      return sfx.call(this, id, o);
    };
    a.music = function (id) {
      window.__fbMusic.push(id);
      return music.call(this, id);
    };
  });
}

/** Phases du vol vues image par image (window.__fbPhases, remis à zéro ici), partie après partie. */
function trackPhases(t) {
  return t.ev(() => {
    window.__fbPhases = [];
    if (window.__fbTrack) return;
    window.__fbTrack = true;
    const tick = () => {
      const a = window.__xr3d;
      if (a) {
        const ph = a.info().phase;
        const list = window.__fbPhases;
        if (list[list.length - 1] !== ph) list.push(ph);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function bossInfo(t) {
  return t.ev(() => (window.__xr3d ? window.__xr3d.boss.info() : null));
}

function info(t) {
  return t.ev(() => (window.__xr3d ? window.__xr3d.info() : null));
}

/** Barre de boss du HUD : affichée, nom, phase, repères (phase et crans), remplissage. */
function bossBar(t) {
  return t.ev(() => {
    const e = document.querySelector('.hud-boss');
    const fill = document.querySelector('.boss-fill');
    const m = fill && /scaleX\(([\d.]+)\)/.exec(fill.style.transform);
    return {
      on: !!e && e.classList.contains('is-on'),
      name: (document.querySelector('.boss-name') || {}).textContent || '',
      phase: (document.querySelector('.boss-phase') || {}).textContent || '',
      dataPhase: e ? e.dataset.phase || null : null,
      marks: document.querySelectorAll('.boss-mark').length,
      steps: document.querySelectorAll('.boss-mark.is-step').length,
      fill: m ? Number(m[1]) : null,
    };
  });
}

/** Attend une partie 3D (nouvelle si `prev`) en compte à rebours ; renvoie son identifiant. */
async function waitIntro(t, prev, label) {
  const id = await waitNewRun(t, prev, { timeout: 60000 });
  await waitFor(t, () => !!(window.__xr3d && window.__xr3d.info().phase === 'intro'), { timeout: 20000, label: `${label} : compte à rebours` });
  return id;
}

/** Attend l'état `state` du boss (temps réel). */
function waitBossState(t, state, label, timeout = 10000) {
  return waitFor(t, (s) => !!(window.__xr3d && window.__xr3d.boss.info().state === s), { timeout, label: `${label} : boss ${state}`, arg: state });
}

/**
 * Pilote automatique en avance rapide (__xr3d.advance, demi-seconde par demi-seconde) jusqu'à la fin de la phase
 * 'fly' : le combat commence au dernier portail. Pilote coupé ensuite. Renvoie { info, boss }.
 */
async function flyToBoss(t, label) {
  await waitFor(t, () => !!(window.__xr3d && window.__xr3d.info().phase === 'fly'), { timeout: 30000, label: `${label} : en vol` });
  const r = await t.ev(() => {
    const a = window.__xr3d;
    a.autopilot(true);
    let i = a.info();
    let steps = 0;
    let maxCalls = 0;
    for (; steps < 240 && i.phase === 'fly'; steps++) {
      i = a.advance(0.5);
      maxCalls = Math.max(maxCalls, i.drawCalls);
    }
    a.autopilot(false);
    return { info: i, boss: a.boss.info(), steps, maxCalls };
  });
  t.log(
    `${label} : combat après ${r.steps / 2} s de vol simulé : ${fmt({ phase: r.info.phase, gates: r.info.gates, nextGate: r.info.nextGate, timeLeft: r.info.timeLeft, shield: r.info.shield, boss: r.boss.state, maxCalls: r.maxCalls })}`,
  );
  assertEq(r.info.phase, 'boss', `${label} : phase 'boss' à la fin du parcours (jamais la distorsion avant le combat)`);
  assertEq([r.info.nextGate, r.info.gatesTotal], [16, 16], `${label} : combat après le dernier portail`);
  assert(r.boss.fight && ['appear', 'fight'].includes(r.boss.state), `${label} : boss arrivé (${fmt({ state: r.boss.state, fight: r.boss.fight })})`);
  assert(r.maxCalls > 0 && r.maxCalls < 150, `${label} : appels de dessin sous 150 en vol (${r.maxCalls})`);
  return r;
}

/** Touches directes (aide DEV) : les cibles de la phase 1, puis celles de la phase 2 une fois exposées. */
async function beatBoss(t, label) {
  await waitBossState(t, 'fight', label);
  let left = await t.ev((n) => window.__xr3d.boss.hit(n), BOSS_HALF);
  if (left > 0) {
    await waitBossState(t, 'fight', `${label} (phase 2)`);
    left = await t.ev((n) => window.__xr3d.boss.hit(n), BOSS_HALF);
  }
  assertEq(left, 0, `${label} : boss vaincu par ses touches`);
}

/** Vide les boucliers aux orbes du boss (pilote coupé, Comète immobile ; jeu simulé) jusqu'à la fin de l'étape. */
async function loseToOrbs(t, label) {
  const r = await t.ev(() => {
    const a = window.__xr3d;
    a.autopilot(false);
    a.fire(false);
    let i = a.info();
    const shields = [i.shield];
    let k = 0;
    for (; k < 120 && i.phase === 'boss'; k++) {
      i = a.advance(0.5);
      if (i.shield !== shields[shields.length - 1]) shields.push(i.shield);
    }
    const ended = i.phase;
    // Explosion, puis fin d'étape (DEAD_TIME)
    for (let j = 0; j < 8 && i.phase !== 'done'; j++) i = a.advance(0.5);
    return { seconds: k / 2, ended, phase: i.phase, shields };
  });
  t.log(`${label} : ${fmt(r)}`);
  assertEq(r.ended, 'dead', `${label} : Comète détruite par les orbes du boss (boucliers ${r.shields.join(' > ')})`);
  assert(r.shields.length >= 2 && r.shields[r.shields.length - 1] === 0, `${label} : boucliers perdus un à un (${r.shields.join(' > ')})`);
  return r;
}

/** Écran d'échec avec « Réessayer le combat » au-dessus de Réessayer et Menu ; motif `reason`. */
async function expectFightFail(t, reason, label) {
  const got = await waitFail(t, { timeout: 20000 });
  assertEq(got, reason, `${label} : motif de l'échec`);
  const btns = await t.ev(() =>
    [...document.querySelectorAll('.screens [data-screen="fail"].is-active .fail-actions button')].map((b) => [
      b.textContent.trim(),
      b.classList.contains('fail-fight'),
    ]),
  );
  assertEq(
    btns,
    [
      ['Réessayer le combat', true],
      ['Réessayer', false],
      ['Menu', false],
    ],
    `${label} : « Réessayer le combat » au-dessus de Réessayer et Menu`,
  );
}

/**
 * Victoire (touches directes) jusqu'aux résultats : barre masquée, « Portail ouvert ! », portail devant la Comète,
 * chrono figé, distorsion au portail, « VOL RÉUSSI », prime, score. `noDamage` : prime sans dégâts attendue (null :
 * celle du vol, lue). Renvoie le score attendu.
 */
async function winToResults(t, label, snap, noDamage) {
  const since = await pageNow(t);
  await beatBoss(t, label);
  const won = await waitFor(
    t,
    () => {
      const a = window.__xr3d;
      const b = a && a.boss.info();
      return b && b.beaten ? { b, i: a.info() } : false;
    },
    { timeout: 5000, label: `${label} : boss vaincu` },
  );
  assert(won.b.portal.open, `${label} : portail ouvert à la victoire (${fmt(won.b.portal)})`);
  assertNear(won.b.portal.dist, PORTAL_AHEAD, 25, `${label} : portail ouvert ≈ ${PORTAL_AHEAD} u devant la Comète`);
  assertEq(won.i.phase, 'boss', `${label} : vol jusqu'au portail (pas encore la distorsion)`);
  assertNear(won.i.timeLeft, snap.timeLeft, 0.051, `${label} : chrono toujours figé après la victoire`);
  await waitFor(t, () => !document.querySelector('.hud-boss.is-on'), { timeout: 2000, label: `${label} : barre de boss masquée à la victoire` });
  assertEq((await toastsSince(t, 'Portail ouvert !', since)).length, 1, `${label} : message « Portail ouvert ! »`);
  await t.shot(`${label.toLowerCase()}-portal`);
  // La Comète rejoint le portail (≈ 4 s) : distorsion
  const warp = await waitFor(
    t,
    () => {
      const a = window.__xr3d;
      const i = a && a.info();
      return i && (i.phase === 'warp' || i.phase === 'done') ? { i, b: a.boss.info() } : false;
    },
    { timeout: 15000, interval: 50, label: `${label} : distorsion au portail` },
  );
  t.log(`${label} : distorsion ${fmt({ phase: warp.i.phase, gates: warp.i.gates, points: warp.i.points, timeLeft: warp.i.timeLeft, noDamage: warp.b.noDamage })}`);
  if (noDamage !== null) assertEq(warp.b.noDamage, noDamage, `${label} : prime sans dégâts ${noDamage ? 'gardée' : 'perdue (nouvel essai)'}`);
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `${label} : « VOL RÉUSSI » (texte : ${text.slice(0, 160)})`);
  const bonus = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .results-bonus');
    return e ? { label: e.querySelector('.results-bonus-label').textContent, value: e.querySelector('.results-bonus-value').textContent.replace(/\s/g, '') } : null;
  });
  assertEq(bonus, { label: 'Boss vaincu', value: `+${BOSS.bonus}` }, `${label} : prime du boss sous le score`);
  const expected =
    Math.round(snap.timeLeft * SCORE.perSecond) + warp.i.gates * SCORE.perGate + (warp.b.noDamage ? SCORE.noDamage : 0) + warp.i.points + BOSS.bonus;
  await t.wait(400);
  await t.shot(`${label.toLowerCase()}-results`);
  return expected;
}

/** Score enregistré de la dernière réussite de f1 (record : le meilleur). */
async function bestF1(t) {
  const save = await readSave(t);
  return save && save.best && save.best.f1 ? save.best.f1.score : null;
}

// ---------------------------------------------------------------- A. Combat d'une partie normale

async function partA(t) {
  await t.goto('?touch=1&unlock=1&stage=f1');
  await waitIntro(t, null, 'A');
  await spyAudio(t);
  await trackPhases(t);
  const b0 = await bossInfo(t);
  assertEq(
    { name: b0.name, state: b0.state, touches: b0.touches, phases: b0.phases, bonus: b0.bonus, fight: b0.fight, portal: b0.portal.open, visible: b0.visible, atBoss: b0.atBoss },
    { name: BOSS.name, state: 'idle', touches: BOSS.touches, phases: BOSS.phases, bonus: BOSS.bonus, fight: false, portal: false, visible: false, atBoss: false },
    'A : boss caché au départ, portail de distorsion fermé',
  );
  await waitFor(t, () => window.__xr3d.info().phase === 'fly', { timeout: 30000, label: 'A : en vol' });
  await t.wait(300);
  const prog0 = (await info(t)).programs;
  const go = await flyToBoss(t, 'A');
  const snapA = go.boss.snapshot;
  assert(snapA && snapA.course === 'nebula' && snapA.gatesPassed === go.info.gates, `A : état noté au début du combat (${fmt(snapA)})`);
  assertNear(snapA.timeLeft, go.info.timeLeft, 0.051, 'A : chrono noté au début du combat');
  const phases = await t.ev(() => window.__fbPhases);
  assert(!phases.includes('warp'), `A : aucune distorsion avant le combat (phases ${phases.join(' > ')})`);
  const msgs = await toasts(t);
  assert(msgs.some((m) => m.text === 'Chrono figé !'), `A : message « Chrono figé ! » (vus : ${msgs.map((m) => m.text).join(', ')})`);
  const heard = await t.ev(() => ({ sfx: window.__fbSfx, music: window.__fbMusic }));
  assertEq(heard.music, ['boss'], 'A : musique du combat (boss) au dernier portail');
  assert(heard.sfx.includes('bossAppear'), `A : son d'apparition du boss (${fmt(heard.sfx)})`);

  // Barre de boss : nom, 6 crans (1 repère de phase + 4 crans de touche), phase 1/2, pleine
  await waitFor(t, () => !!document.querySelector('.hud-boss.is-on'), { timeout: 3000, label: 'A : barre de boss affichée' });
  const bar1 = await bossBar(t);
  assertEq(
    { on: bar1.on, name: bar1.name, phase: bar1.phase, marks: bar1.marks, steps: bar1.steps, fill: bar1.fill },
    { on: true, name: BOSS.name, phase: 'Phase 1/2', marks: 5, steps: 4, fill: 1 },
    'A : barre de boss au début du combat',
  );

  // Chrono et avancement figés (jeu et HUD), sur du temps réel
  await waitBossState(t, 'fight', 'A');
  const c0 = await hudFlight(t);
  const i0 = await info(t);
  await t.wait(1500);
  const c1 = await hudFlight(t);
  const i1 = await info(t);
  assertEq([i1.phase, i1.timeLeft, c1.timer], ['boss', i0.timeLeft, c0.timer], 'A : chrono figé pendant le combat (jeu et HUD)');
  assertEq([i1.progress, c1.progress], [i0.progress, c0.progress], 'A : avancement figé pendant le combat (jeu et HUD)');
  await t.shot('a-fight');

  // Rien à compiler en vol : programmes du départ ; appels de dessin sous 150 avec le boss affiché
  const iDraw = await t.ev(() => window.__xr3d.advance(0));
  const bv = await bossInfo(t);
  t.log(`A : programmes ${prog0} au départ, ${iDraw.programs} en combat ; ${iDraw.drawCalls} appels de dessin`);
  assert(bv.visible, 'A : boss affiché');
  assertEq(iDraw.programs, prog0, 'A : aucun programme compilé depuis le départ (boss préparé avec la scène)');
  assert(iDraw.drawCalls > 0 && iDraw.drawCalls < 150, `A : appels de dessin sous 150 en combat (${iDraw.drawCalls})`);

  // Pilotage au clavier vers la cible exposée la plus proche (flèches simulées, sans TIR) : cible du boss visée et
  // atteignable, aucun tir ; puis TIR tenu (fire) : une touche
  const aimRun = await t.ev(() => {
    const a = window.__xr3d;
    a.autopilot(false);
    a.fire(false);
    const down = new Set();
    const key = (code, on) => {
      if (on === down.has(code)) return;
      if (on) down.add(code);
      else down.delete(code);
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }));
    };
    const steer = () => {
      const b = a.boss.info();
      let best = null;
      let bd = Infinity;
      for (const tg of b.targets) {
        if (!tg.alive || !tg.open) continue;
        const d = Math.hypot(tg.x - b.ship.x, tg.y - b.ship.y);
        if (d < bd) {
          bd = d;
          best = tg;
        }
      }
      const dx = best ? best.x - b.ship.x : 0;
      const dy = best ? best.y - b.ship.y : 0;
      key('ArrowRight', dx > 0.7);
      key('ArrowLeft', dx < -0.7);
      key('ArrowUp', dy > 0.7);
      key('ArrowDown', dy < -0.7);
    };
    let i = a.info();
    const n0 = i.shotsFired;
    let aimed = 0;
    let hit = 0;
    for (let k = 0; k < 150; k++) {
      steer();
      i = a.advance(1 / 60);
      if (i.target && i.target.type === 'boss') {
        aimed++;
        if (i.target.hit) hit++;
      }
    }
    const quiet = { aimed, hit, fired: i.shotsFired - n0, phase: i.phase };
    const left0 = a.boss.info().touchesLeft;
    const s0 = i.shotsFired;
    a.fire(true);
    let left = left0;
    let k = 0;
    for (; k < 240 && left >= left0; k++) {
      steer();
      i = a.advance(1 / 60);
      left = a.boss.info().touchesLeft;
    }
    a.fire(false);
    for (const c of [...down]) key(c, false);
    return { quiet, left0, left, steps: k, fired: i.shotsFired - s0 };
  });
  t.log(`A : pilotage au clavier ${fmt(aimRun)}`);
  assert(aimRun.quiet.aimed > 0 && aimRun.quiet.hit > 0, `A : cible du boss visée et atteignable pendant le pilotage (${fmt(aimRun.quiet)})`);
  assertEq(aimRun.quiet.fired, 0, 'A : aucun tir sans TIR, cible du boss atteignable devant la Comète (décision 21)');
  assert(aimRun.left === aimRun.left0 - 1 && aimRun.fired > 0, `A : TIR tenu : une touche (${fmt(aimRun)})`);
  await waitFor(
    t,
    (n) => {
      const f = document.querySelector('.boss-fill');
      const m = f && /scaleX\(([\d.]+)\)/.exec(f.style.transform);
      return !!m && Math.abs(Number(m[1]) - n) < 0.02;
    },
    { timeout: 2000, label: 'A : barre de boss raccourcie d’un cran', arg: aimRun.left / BOSS.touches },
  );

  // TIR tactile tenu : la Comète tire (pilote coupé ; ses tirs peuvent toucher)
  await t.ev(() => {
    window.__fbSfx = [];
  });
  const f = touches(t);
  const P = await center(t, '.xr-shoot');
  const s0 = (await info(t)).shotsFired;
  await f.start([[...P, 1]]);
  await t.wait(700);
  const s1 = (await info(t)).shotsFired;
  await f.end();
  assert(s1 >= s0 + 2, `A : TIR tactile en combat : la Comète tire (${s0} -> ${s1})`);

  // Touches directes sur ce qui reste de la phase 1 : phase 2 (barre à moitié, Phase 2/2, sons des touches et de la
  // phase)
  if ((await bossInfo(t)).phase === 1) {
    await waitBossState(t, 'fight', 'A (touches)');
    await t.ev((n) => window.__xr3d.boss.hit(n), BOSS.touches);
  }
  const ph2 = await bossInfo(t);
  assert(
    ph2.touchesLeft === BOSS_HALF && ph2.phase === 2 && ['shift', 'fight'].includes(ph2.state),
    `A : phase 2 après ${BOSS_HALF} touches (${fmt({ left: ph2.touchesLeft, phase: ph2.phase, state: ph2.state })})`,
  );
  const sfx2 = await t.ev(() => window.__fbSfx);
  assert(sfx2.includes('bossHit') && sfx2.includes('bossPhase'), `A : sons des touches et de la phase 2 (${fmt(sfx2)})`);
  await waitFor(t, () => document.querySelector('.boss-phase').textContent === 'Phase 2/2', { timeout: 2000, label: 'A : barre « Phase 2/2 »' });
  const bar3 = await bossBar(t);
  assertEq([bar3.dataPhase, bar3.fill], ['2', 0.5], 'A : barre de la phase 2, à moitié');
  await waitBossState(t, 'fight', 'A (phase 2)');
  await t.shot('a-phase2');

  // Perte puis restauration du contexte en plein combat : combat intact
  const before = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info() }));
  const luma0 = await frameLuma(t);
  const loss = await loseFlightOk(t, 'boss');
  await t.wait(500);
  assert(await restoreContext(t, 'three'), 'A : restauration : extension absente');
  await t.wait(RESTORE_WAIT_MS + 800);
  assertEq((await screensSince(t, 'fail', loss.at)).length, 0, 'A : restauration en plein combat : aucun échec');
  assertEq((await toastsSince(t, 'Liaison rétablie', loss.at)).length, 1, 'A : « Liaison rétablie »');
  const after = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info() }));
  const luma1 = await frameLuma(t);
  t.log(`A : restauration ${fmt({ luma0, luma1, before: before.b.touchesLeft, after: after.b.touchesLeft, state: after.b.state })}`);
  assertEq(
    { phase: after.i.phase, timeLeft: after.i.timeLeft, touchesLeft: after.b.touchesLeft, bossPhase: after.b.phase, fight: after.b.fight, portal: after.b.portal.open, hud: after.b.hud },
    { phase: 'boss', timeLeft: before.i.timeLeft, touchesLeft: before.b.touchesLeft, bossPhase: before.b.phase, fight: true, portal: false, hud: true },
    'A : combat intact après la restauration du contexte',
  );
  assert(luma0 > 3 && luma1 >= luma0 * 0.4, `A : image éclairée après la restauration (${luma0} -> ${luma1})`);
  const calls = (await t.ev(() => window.__xr3d.advance(0))).drawCalls;
  assert(calls > 0 && calls < 150, `A : appels de dessin après la restauration (${calls})`);

  // Victoire : portail ouvert devant la Comète, distorsion, résultats
  const expected = await winToResults(t, 'A', snapA, null);
  assertEq(await bestF1(t), expected, 'A : score = temps restant au début du combat + portails + sans dégâts + points + prime');
}

// ---------------------------------------------------------------- B. « Réessayer le combat »

async function partB(t) {
  await t.goto('?touch=1&unlock=1&stage=f1');
  const run1 = await waitIntro(t, null, 'B');
  await spyAudio(t);
  const go = await flyToBoss(t, 'B');
  const snap1 = go.boss.snapshot;
  await waitBossState(t, 'fight', 'B');
  await loseToOrbs(t, 'B : boucliers aux orbes');
  await expectFightFail(t, 'Vaisseau détruit !', 'B');
  await t.shot('b-fail');

  // Nouvel essai : début du combat, boucliers pleins, état noté rendu, boss à neuf
  await t.ev(() => {
    window.__fbMusic = [];
  });
  await pressScreen(t, 'fail', 'Réessayer le combat');
  const run2 = await waitIntro(t, run1, 'B (nouvel essai)');
  await trackPhases(t);
  const r2 = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info(), music: window.__fbMusic }));
  t.log(`B : nouvel essai ${fmt({ timeLeft: r2.i.timeLeft, gates: r2.i.gates, points: r2.i.points, crystals: r2.i.crystals, shield: r2.i.shield, progress: r2.i.progress, music: r2.music })}`);
  assertEq(r2.b.snapshot, snap1, 'B : instantané du début du combat rendu au nouvel essai');
  assertEq(
    { atBoss: r2.b.atBoss, retry: r2.b.retry, noDamage: r2.b.noDamage, state: r2.b.state, left: r2.b.touchesLeft, portal: r2.b.portal.open },
    { atBoss: true, retry: true, noDamage: false, state: 'idle', left: BOSS.touches, portal: false },
    'B : nouvel essai (sans prime sans dégâts, boss à neuf, portail fermé)',
  );
  assertEq(
    { shield: r2.i.shield, gates: r2.i.gates, nextGate: r2.i.nextGate, points: r2.i.points, crystals: r2.i.crystals },
    { shield: r2.i.maxShields, gates: snap1.gatesPassed, nextGate: 16, points: snap1.points, crystals: snap1.crystals },
    'B : boucliers pleins, portails, points et cristaux du début du combat',
  );
  assertNear(r2.i.timeLeft, snap1.timeLeft, 0.051, 'B : chrono du début du combat');
  assert(r2.i.progress > 0.9 && r2.i.progress < 1, `B : départ au bout du parcours (avancement ${r2.i.progress})`);
  assertEq(r2.music[r2.music.length - 1], 'boss', 'B : musique du combat dès le compte à rebours');
  const h2 = await hudFlight(t);
  assertEq([h2.gates, h2.shield], [snap1.gatesPassed, r2.i.maxShields], 'B : HUD du nouvel essai (portails, boucliers)');
  await waitFor(t, () => {
    const s = window.__xrShell.info();
    return s.phase === 'playing' && !s.fading && !s.navLock;
  }, { timeout: 10000, label: 'B : nouvel essai dévoilé' });
  await t.shot('b-retry-intro');
  await waitFor(t, () => window.__xr3d.info().phase === 'boss', { timeout: 15000, label: 'B : combat après le compte à rebours' });
  const ph = await t.ev(() => window.__fbPhases);
  assert(!ph.includes('fly'), `B : jamais de phase 'fly' au nouvel essai (phases ${ph.join(' > ')})`);
  await waitBossState(t, 'fight', 'B (nouvel essai)');
  await t.shot('b-retry-fight');

  // Perdu de nouveau : même instantané, bouton de nouveau ; « Réessayer » simple : tout le vol
  const snapAgain = (await bossInfo(t)).snapshot;
  assertEq(snapAgain, snap1, 'B : un nouvel essai garde le même instantané');
  await t.ev(() => window.__xr3d.fail());
  await expectFightFail(t, 'Vaisseau détruit !', 'B (nouvel essai perdu)');
  await pressScreen(t, 'fail', 'Réessayer');
  const run3 = await waitIntro(t, run2, 'B (Réessayer)');
  const r3 = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info() }));
  assertEq(
    { gates: r3.i.gates, nextGate: r3.i.nextGate, timeLeft: r3.i.timeLeft, atBoss: r3.b.atBoss, retry: r3.b.retry, fight: r3.b.fight, snapshot: r3.b.snapshot, noDamage: r3.b.noDamage },
    { gates: 0, nextGate: 0, timeLeft: START_TIME, atBoss: false, retry: false, fight: false, snapshot: null, noDamage: true },
    'B : « Réessayer » simple = tout le vol',
  );
  assert(Math.abs(r3.i.progress) < 0.01, `B : « Réessayer » simple : départ du parcours (avancement ${r3.i.progress})`);

  // Combat lancé en vol (aide DEV), perdu, repris, gagné : score sans prime sans dégâts
  await waitFor(t, () => window.__xr3d.info().phase === 'fly', { timeout: 30000, label: 'B : en vol' });
  const started = await t.ev(() => window.__xr3d.boss.start());
  assert(started, 'B : __xr3d.boss.start() en vol');
  const s3 = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info() }));
  assertEq([s3.i.phase, s3.i.gates, s3.i.nextGate], ['boss', 16, 16], 'B : boss.start : combat, portails restants comptés franchis');
  const snap3 = s3.b.snapshot;
  await waitBossState(t, 'fight', 'B (boss.start)');
  await t.ev(() => window.__xr3d.fail());
  await expectFightFail(t, 'Vaisseau détruit !', 'B (combat lancé en vol, perdu)');
  await pressScreen(t, 'fail', 'Réessayer le combat');
  await waitIntro(t, run3, 'B (second nouvel essai)');
  const r4 = await bossInfo(t);
  assertEq([r4.snapshot, r4.retry, r4.noDamage], [snap3, true, false], 'B : second nouvel essai (instantané de boss.start, sans prime sans dégâts)');
  await waitFor(t, () => window.__xr3d.info().phase === 'boss', { timeout: 15000, label: 'B : combat du second nouvel essai' });
  const prev = await bestF1(t);
  const expected = await winToResults(t, 'B', snap3, false);
  t.log(`B : score attendu ${expected} (record précédent ${prev})`);
  const score = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .results-record');
    return e ? e.textContent : '';
  });
  // Le record de A (prime sans dégâts possible) peut rester devant : score de l'essai relu sur la sauvegarde s'il le bat
  const best = await bestF1(t);
  assert(best === Math.max(prev || 0, expected), `B : record = max(précédent ${prev}, score de l'essai ${expected}) (${best} ; ${score})`);
}

// ---------------------------------------------------------------- C. ?at=boss, perte définitive en plein combat

async function partC(t) {
  await t.goto('?touch=1&unlock=1&stage=f1&at=boss');
  const run1 = await waitIntro(t, null, 'C');
  const c0 = await t.ev(() => ({ i: window.__xr3d.info(), b: window.__xr3d.boss.info() }));
  assertEq(
    { atBoss: c0.b.atBoss, retry: c0.b.retry, snapshot: c0.b.snapshot, gates: c0.i.gates, nextGate: c0.i.nextGate, timeLeft: c0.i.timeLeft },
    { atBoss: true, retry: false, snapshot: null, gates: 16, nextGate: 16, timeLeft: START_TIME },
    'C : ?at=boss : départ au combat (portails comptés franchis, chrono plein)',
  );
  await waitFor(t, () => window.__xr3d.info().phase === 'boss', { timeout: 15000, label: 'C : combat' });
  await waitBossState(t, 'fight', 'C');
  const loss = await loseFlightOk(t, 'boss');
  await expectFightFail(t, LOST_REASON, 'C : perte définitive en plein combat');
  const fails = await screensSince(t, 'fail', loss.at);
  assertEq(fails.length, 1, 'C : un seul écran d’échec');
  await t.shot('c-lost-fail');
  await pressScreen(t, 'fail', 'Réessayer le combat');
  await waitIntro(t, run1, 'C (nouvel essai)');
  await assertOneLiveCanvas(t, 'C : contexte neuf');
  const c1 = await bossInfo(t);
  assert(c1.retry && c1.snapshot && c1.snapshot.gatesPassed === 16, `C : nouvel essai avec l'état noté au début du combat (${fmt(c1.snapshot)})`);
  await waitFor(t, () => window.__xr3d.info().phase === 'boss', { timeout: 15000, label: 'C : combat repris' });
  await waitBossState(t, 'fight', 'C (repris)');

  // Boss vaincu, puis contexte perdu pour de bon avant le portail : l'issue est décidée, étape gagnée (une fois)
  await t.ev(() => window.__xr3d.boss.win());
  const won = await bossInfo(t);
  assert(won.beaten && won.portal.open, `C : boss vaincu, portail ouvert (${fmt({ beaten: won.beaten, portal: won.portal })})`);
  const loss2 = await loseFlightOk(t, 'boss');
  await waitForScreen(t, 'results', { timeout: 20000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `C : boss vaincu puis liaison perdue : « VOL RÉUSSI » (texte : ${text.slice(0, 160)})`);
  assertEq(
    [(await screensSince(t, 'results', loss2.at)).length, (await screensSince(t, 'fail', loss2.at)).length],
    [1, 0],
    'C : un seul écran de résultats, aucun échec',
  );
  const prime = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .results-bonus-value');
    return e ? e.textContent.replace(/\s/g, '') : null;
  });
  assertEq(prime, `+${BOSS.bonus}`, 'C : prime du boss gardée');
  await t.shot('c-won-lost');
}

// ---------------------------------------------------------------- D. Barre de boss sur petits écrans

/** Réglages tactiles posés dans la sauvegarde (avant le chargement suivant). */
function patchSettings(t, patch) {
  return t.ev((p) => {
    const KEY = 'xeno-rift-save-v1';
    let save = null;
    try {
      save = JSON.parse(localStorage.getItem(KEY));
    } catch {
      save = null;
    }
    if (!save || typeof save !== 'object') return false;
    save.settings = { ...save.settings, ...p };
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  }, patch);
}

async function checkBar(t, w, h, tag, settings) {
  await t.page.setViewportSize({ width: w, height: h });
  assert(await patchSettings(t, settings), `${tag} : sauvegarde à modifier`);
  await t.goto('?touch=1&unlock=1&stage=f1&at=boss');
  await waitFor(t, () => !!document.querySelector('.hud-boss.is-on'), { timeout: 30000, label: `${tag} : barre de boss affichée` });
  await t.wait(450); // apparition de la barre (glissement)
  const page = await t.ev(() => {
    const e = document.scrollingElement || document.documentElement;
    return { sw: e.scrollWidth, sh: e.scrollHeight, w: window.innerWidth, h: window.innerHeight };
  });
  assert(page.sw <= page.w && page.sh <= page.h, `${tag} : la page ne défile pas (${fmt(page)})`);
  await assertLayout(t, ['.hud-boss', '.boss-name', '.boss-phase', '.boss-track'], tag);
  const parts = [
    ['barre de boss', '.hud-boss'],
    ['TIR', '.xr-shoot'],
    ['TURBO', '.xr-boost'],
    ['joystick', '.xr-stick-base'],
    ['PAUSE', '.hud-pause'],
    ['HUD gauche', '.fl-left'],
    ['HUD centre', '.fl-center'],
    ['énergie', '.fl-energy'],
    ['cristaux du vol', '.fl-crystals'],
  ];
  const list = [];
  for (const [name, sel] of parts) {
    const r = await rects(t, sel);
    assertEq(r.length, 1, `${tag} : un seul élément visible ${sel}`);
    list.push({ name, r: r[0] });
  }
  const bar = list[0];
  for (const o of list.slice(1)) {
    assert(!overlaps(bar.r, o.r), `${tag} : barre de boss et ${o.name} se chevauchent (${fmt(bar.r)} / ${fmt(o.r)})`);
  }
  const name = await t.ev(() => {
    const e = document.querySelector('.boss-name');
    return { sw: e.scrollWidth, cw: e.clientWidth };
  });
  assert(name.sw <= name.cw + 1, `${tag} : nom du boss entier (${fmt(name)})`);
  t.log(`${tag} : barre ${fmt(bar.r)}, sans chevauchement`);
  await t.shot(`d-bar-${tag.replace(/[^\w-]+/g, '-')}`);
}

async function partD(t) {
  const variants = [
    [844, 390, 'normal 844x390', { leftHanded: false, touchSize: 1 }],
    [640, 320, 'normal 640x320', { leftHanded: false, touchSize: 1 }],
    [568, 320, 'normal 568x320', { leftHanded: false, touchSize: 1 }],
    [568, 320, 'grand 568x320', { leftHanded: false, touchSize: 2 }],
    [568, 320, 'gaucher grand 568x320', { leftHanded: true, touchSize: 2 }],
  ];
  for (const [w, h, tag, s] of variants) await checkBar(t, w, h, tag, s);
  await t.page.setViewportSize({ width: 844, height: 390 });
  await patchSettings(t, { leftHanded: false, touchSize: 1 });
}

export default async function (t) {
  await recordUi(t);
  await recordToasts(t);
  await partA(t);
  await partB(t);
  await partC(t);
  await partD(t);
}
