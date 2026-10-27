// Son et cycle de vie de l'application (AudioContext instrumenté, compteur de morceaux de musique) :
//  1. Accueil : aucun AudioContext avant le premier geste ; après, un seul, actif. Musique coupée : graphe fixe
//     mesuré, puis 24 effets x 3 et une rafale de 60 (vol de voix) : les nœuds branchés reviennent exactement
//     au graphe fixe. Musique réactivée : le morceau du menu démarre une fois.
//  2. Cycles arrière-plan / retour (visibilitychange 100, 500, 1200 ms ; Capacitor seul ; mélanges dans les deux
//     ordres Android) : suspendu en arrière-plan, actif au retour et qui le reste ; « resume » Capacitor alors que
//     la page est encore cachée : reste suspendu ; aucun son démarré pendant que la page est cachée.
//  3. En arrière-plan : les effets sont ignorés ; changer de musique lance un morceau par changement puis le
//     séquenceur reste à l'arrêt jusqu'au retour.
//  4. Fuites par la musique : redemander le morceau en cours ne le relance pas ; après des bascules Musique et
//     des changements de morceau rapides (un morceau lancé par changement), musique coupée : les nœuds branchés
//     reviennent exactement au graphe fixe une fois les dernières notes terminées.
//  5. Écrans de résultats et d'échec (j1) : page cachée → son suspendu, écran inchangé ; retour → son actif ;
//     RÉESSAYER après un arrière-plan sur l'écran d'échec : l'étape démarre normalement (pas en pause).
//  6. Interrupteur Musique dans les Options du menu Pause : coupé → plus aucune note ; réactivé → exactement un
//     nouveau morceau (pas de double départ), même après des bascules rapides.
import { activeScreen, assert, assertEq, clickText, fmt, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import {
  audioState,
  cap,
  clickPauseButton,
  clickResume,
  clickThen,
  countTracks,
  instrument,
  liveNodes,
  pauseState,
  setHidden,
  sourceRate,
  sourceStarts,
  tracks,
  waitAudio,
  waitIntroCard,
  waitPaused,
  waitResumed,
  waitStageShown,
} from '../lib/shell.mjs';

export const meta = {
  title: 'Son : arrière-plan, écrans de fin, fuites de nœuds, interrupteur Musique',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
};

const SFX = [
  'click', 'jump', 'doubleJump', 'laser', 'laserHit', 'overheat', 'stomp', 'enemyDie', 'armorClank', 'crystal', 'bump',
  'powerup', 'shieldBreak', 'hurt', 'death', 'checkpoint', 'takeoff', 'gate', 'gateMiss', 'boost', 'crash', 'warp', 'win', 'lose',
];

/** L'AudioContext doit rester 'running' pendant `ms` ms (relevé toutes les 100 ms dans la page). */
async function assertStaysRunning(t, ms, label) {
  const states = await t.ev(
    (d) =>
      new Promise((resolve) => {
        const out = [];
        const id = setInterval(() => {
          out.push(window.__acs[0].state);
          if (out.length * 100 >= d) {
            clearInterval(id);
            resolve(out);
          }
        }, 100);
      }),
    ms,
  );
  assert(states.every((s) => s === 'running'), `${label} : le son doit rester actif ${ms} ms (relevés : ${states.join(' ')})`);
}

/** Nombre de nœuds branchés une fois stable (inchangé pendant 2 s). */
async function settledNodes(t, label, timeout = 15000) {
  const t0 = Date.now();
  let last = await liveNodes(t);
  let since = Date.now();
  while (Date.now() - t0 < timeout) {
    await t.wait(250);
    const n = await liveNodes(t);
    if (n !== last) {
      last = n;
      since = Date.now();
    } else if (Date.now() - since >= 2000) {
      return n;
    }
  }
  throw new Error(`${label} : nombre de nœuds audio jamais stable en ${timeout} ms (dernier : ${last})`);
}

/** Attend le retour exact au graphe fixe (`n0` nœuds branchés). */
function waitNodes(t, n0, label, timeout = 15000) {
  return waitFor(t, (n) => window.__liveNodes() === n, { timeout, label: `${label} : retour à ${n0} nœuds branchés`, arg: n0 }).catch(
    async (e) => {
      throw new Error(`${e.message} (actuellement ${await liveNodes(t)})`);
    },
  );
}

/** Cache la page (ou pause Capacitor), vérifie le son suspendu et l'écran inchangé, puis revient. */
async function backgroundCycle(t, screen, label) {
  await setHidden(t, true);
  await waitAudio(t, 'suspended', `${label} : page cachée → son suspendu`);
  await t.wait(600);
  assertEq(await activeScreen(t), screen, `${label} : écran pendant l'arrière-plan`);
  await setHidden(t, false);
  await waitAudio(t, 'running', `${label} : retour → son actif`);
  await assertStaysRunning(t, 800, `${label} : après le retour`);
  assertEq(await activeScreen(t), screen, `${label} : écran après le retour`);
}

/** Interrupteur Musique du menu Pause (vue Options) : clic réel, renvoie aria-checked après le clic. */
async function toggleMusic(t) {
  await t.page.locator('.overlay.pause.is-open .toggle--music').click({ timeout: 5000 });
  return t.ev(() => document.querySelector('.overlay.pause.is-open .toggle--music').getAttribute('aria-checked'));
}

export default async function (t) {
  await instrument(t);
  await countTracks(t);
  await t.goto('?touch=1&unlock=1');
  await waitForScreen(t, 'title');

  // ---------------------------------------------------------------- 1. Premier geste, graphe fixe, effets
  assertEq(await t.ev(() => window.__acs.length), 0, 'AudioContext créés avant le premier geste');
  // Musique coupée (moteur seul) avant le geste : on mesure d'abord le graphe fixe, sans aucune note qui traîne
  // (une nappe déjà programmée garde ses nœuds branchés plusieurs secondes après l'arrêt d'un morceau).
  await t.ev(() => window.__xrShell.audio.setMusicEnabled(false));
  await t.key('KeyZ', 40);
  await waitAudio(t, 'running', 'premier geste → son actif');
  const n0 = await settledNodes(t, 'graphe fixe');
  t.log('nœuds branchés en silence (graphe fixe)', n0);
  assertEq(await tracks(t), 0, 'musique coupée : aucun morceau lancé au premier geste');
  assert(n0 > 0, 'le graphe fixe du moteur doit être branché après le premier geste');

  // Fuites par effet : 24 effets x 3, puis une rafale de 60 (plus de 24 voix : les plus anciennes sont coupées).
  for (let r = 0; r < 3; r++) {
    for (const id of SFX) {
      await t.ev((i) => window.__xrShell.audio.sfx(i), id);
      await t.wait(45);
    }
  }
  await t.ev(
    () =>
      new Promise((resolve) => {
        let k = 0;
        const id = setInterval(() => {
          window.__xrShell.audio.sfx(k % 2 ? 'laser' : 'crystal', { pitch: 1 + (k % 5) * 0.1 });
          if (++k >= 60) {
            clearInterval(id);
            resolve();
          }
        }, 40);
      }),
  );
  const nMid = await liveNodes(t);
  await waitNodes(t, n0, 'après 72 effets et une rafale de 60');
  t.log(`nœuds : graphe fixe ${n0}, juste après la rafale ${nMid}, puis ${await liveNodes(t)}`);
  assert(nMid > n0, `les effets doivent brancher des nœuds pendant qu'ils jouent (${n0} -> ${nMid})`);

  // Musique réactivée : le morceau du menu (demandé par l'accueil) démarre, une seule fois.
  await t.ev(() => window.__xrShell.audio.setMusicEnabled(true));
  await waitFor(t, () => window.__tracks === 1, { timeout: 3000, label: 'musique du menu lancée (1 morceau)' });
  assert((await sourceRate(t, 2000)) > 0, 'la musique du menu doit jouer des notes');

  // ---------------------------------------------------------------- 2. Cycles arrière-plan / retour
  for (const ms of [100, 500, 1200]) {
    await setHidden(t, true);
    if (ms >= 500) await waitAudio(t, 'suspended', `page cachée ${ms} ms → son suspendu`);
    else await t.wait(ms);
    if (ms >= 500) await t.wait(ms);
    await setHidden(t, false);
    await waitAudio(t, 'running', `page cachée ${ms} ms puis visible → son actif`);
    await assertStaysRunning(t, 1000, `cycle page cachée ${ms} ms`);
  }
  for (const ms of [100, 500]) {
    await cap(t, 'pause');
    if (ms >= 500) await waitAudio(t, 'suspended', `pause Capacitor ${ms} ms → son suspendu`);
    else await t.wait(ms);
    if (ms >= 500) await t.wait(ms);
    await cap(t, 'resume');
    await waitAudio(t, 'running', `pause Capacitor ${ms} ms puis « resume » → son actif`);
    await assertStaysRunning(t, 1000, `cycle Capacitor ${ms} ms`);
  }
  // Ordre A : pause Capacitor, page cachée … page visible, « resume ».
  await t.ev(() => {
    window.__xrShell.cap('pause');
    window.__setHidden(true);
  });
  await waitAudio(t, 'suspended', 'mélange A : pause + page cachée → son suspendu');
  await t.wait(600);
  await setHidden(t, false);
  await t.wait(50);
  await cap(t, 'resume');
  await waitAudio(t, 'running', 'mélange A : page visible puis « resume » → son actif');
  await assertStaysRunning(t, 1000, 'mélange A');
  // Ordre B : page cachée, pause Capacitor … « resume » (page encore cachée), page visible.
  const startsHidden = await t.ev(() => {
    window.__setHidden(true);
    window.__xrShell.cap('pause');
    return window.__starts;
  });
  await waitAudio(t, 'suspended', 'mélange B : page cachée + pause → son suspendu');
  await t.wait(600);
  await cap(t, 'resume');
  await t.wait(500);
  assertEq(await audioState(t), 'suspended', 'mélange B : « resume » Capacitor alors que la page est encore cachée : le son reste suspendu');
  assertEq((await sourceStarts(t)) - startsHidden, 0, 'mélange B : sources audio démarrées pendant que la page est cachée');
  await setHidden(t, false);
  await waitAudio(t, 'running', 'mélange B : page visible → son actif');
  await assertStaysRunning(t, 1000, 'mélange B');
  assertEq(await t.ev(() => window.__acs.length), 1, 'un seul AudioContext après tous les cycles');
  assertEq(await tracks(t), 1, 'les cycles ne relancent pas la musique du menu (toujours 1 morceau)');
  assert((await sourceRate(t, 1500)) > 0, 'la musique du menu rejoue après les cycles');

  // ---------------------------------------------------------------- 3. En arrière-plan : effets ignorés, séquenceur à l'arrêt
  await cap(t, 'pause');
  await waitAudio(t, 'suspended', 'pause Capacitor → son suspendu');
  const s0 = await t.ev(() => {
    const a = window.__xrShell.audio;
    const before = window.__starts;
    a.sfx('laser');
    a.sfx('crystal');
    a.sfx('win');
    return before;
  });
  await t.wait(300);
  assertEq((await sourceStarts(t)) - s0, 0, 'effets sonores demandés en arrière-plan : sources démarrées');
  const tr0 = await tracks(t);
  const s1 = await t.ev(() => {
    const a = window.__xrShell.audio;
    a.setMusicEnabled(false);
    a.setMusicEnabled(true);
    a.music('jungle');
    a.music('menu');
    return window.__starts;
  });
  assertEq((await tracks(t)) - tr0, 3, 'en arrière-plan : réactivation + 2 changements de morceau = 3 morceaux lancés');
  await t.wait(1000);
  assertEq((await sourceStarts(t)) - s1, 0, 'en arrière-plan, le séquenceur de musique doit rester à l’arrêt (sources démarrées en 1 s)');
  await cap(t, 'resume');
  await waitAudio(t, 'running', '« resume » → son actif');
  assert((await sourceRate(t, 1500)) > 0, 'la musique rejoue après le retour');

  // ---------------------------------------------------------------- 4. Fuites de nœuds par la musique
  const tr1 = await tracks(t);
  await t.ev(() => window.__xrShell.audio.music('menu')); // déjà en cours : rien n'est relancé
  await t.wait(1000);
  assertEq(await tracks(t), tr1, 'redemander le morceau en cours ne le relance pas');
  for (let i = 0; i < 6; i++) {
    await t.ev((on) => window.__xrShell.audio.setMusicEnabled(on), i % 2 === 1); // coupe, active, … active
    await t.wait(60);
  }
  for (const id of ['jungle', 'moon', 'menu', 'nebula', 'asteroids', 'menu']) {
    await t.ev((m) => window.__xrShell.audio.music(m), id);
    await t.wait(30);
  }
  // 3 réactivations + 6 changements de morceau.
  assertEq((await tracks(t)) - tr1, 9, 'morceaux lancés par les bascules et changements rapides');
  await t.wait(2500);
  assert((await sourceRate(t, 1500)) > 0, 'la musique joue après les changements rapides');
  await t.ev(() => window.__xrShell.audio.music(null));
  // Les nappes déjà programmées (jusqu'à ~8 s) gardent leurs nœuds jusqu'à leur fin.
  await waitNodes(t, n0, 'musique coupée après les bascules et changements de morceau', 30000);
  await t.shot('title-after-audio-stress');

  // ---------------------------------------------------------------- 5. Écrans de résultats et d'échec
  await clickText(t, 'Jouer');
  await waitIntroCard(t);
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  await backgroundCycle(t, 'results', 'écran de résultats');
  await t.shot('results-after-background');
  await clickThen(t, '.screens [data-screen="results"].is-active', 'Rejouer');
  for (let i = 0; i < 6; i++) {
    const done = await waitFor(
      t,
      () => {
        if (document.querySelector('.screens [data-screen="fail"]')) return 'fail';
        const s = window.__xr2d && window.__xr2d.scene;
        const sh = window.__xrShell.info();
        return s && s.state === 'play' && sh.run && !sh.run.ended && !sh.navLock ? 'play' : false;
      },
      { timeout: 20000, label: `Kaï en jeu (mort n° ${i + 1}) ou écran d'échec` },
    );
    if (done === 'fail') break;
    await t.ev(() => window.__xr2d.kill());
    await t.wait(300);
  }
  await waitForScreen(t, 'fail', { timeout: 20000 });
  await backgroundCycle(t, 'fail', "écran d'échec");
  await t.shot('fail-after-background');
  await clickThen(t, '.screens [data-screen="fail"].is-active', 'Réessayer');
  await waitStageShown(t, 'j1', { timeout: 30000 });
  await t.wait(500);
  const sRetry = await pauseState(t);
  assert(!sRetry.paused && sRetry.open === 0, `RÉESSAYER après un arrière-plan sur l'écran d'échec : pas de pause (${fmt(sRetry)})`);
  await waitFor2dPlay(t);

  // ---------------------------------------------------------------- 6. Interrupteur Musique du menu Pause
  await t.wait(1500); // musique de la jungle installée
  await t.key('Escape', 40);
  await waitPaused(t, 'Échap → pause');
  assert((await sourceRate(t, 1500)) > 0, 'la musique continue dans le menu Pause');
  await clickPauseButton(t, 'Options');
  await waitFor(t, () => (document.querySelector('.overlay.pause.is-open') || {}).dataset?.view === 'options', {
    timeout: 3000,
    label: 'menu Pause : vue Options',
  });
  const tp0 = await tracks(t);
  assertEq(await toggleMusic(t), 'false', 'interrupteur Musique après le 1er clic');
  await t.wait(1500); // fondu de sortie (0,3 s), puis morceau libéré
  assertEq(await sourceRate(t, 2000), 0, 'musique coupée : sources démarrées par seconde dans le menu Pause');
  assertEq(await tracks(t), tp0, 'couper la musique ne lance aucun morceau');
  await t.shot('pause-options-music-off');
  assertEq(await toggleMusic(t), 'true', 'interrupteur Musique après le 2e clic');
  await t.wait(1500);
  assertEq((await tracks(t)) - tp0, 1, 'réactiver la musique lance exactement un morceau');
  assert((await sourceRate(t, 1500)) > 0, 'musique réactivée : des notes sont jouées');
  // Bascules rapides : coupe, active, coupe, active, coupe, puis active.
  for (let i = 0; i < 5; i++) {
    await toggleMusic(t);
    await t.wait(70);
  }
  assertEq(await toggleMusic(t), 'true', 'interrupteur Musique après les bascules rapides');
  await t.wait(2000);
  assertEq((await tracks(t)) - tp0, 4, 'bascules rapides : un morceau par réactivation (3 de plus), aucun double départ');
  const save = await readSave(t);
  assert(save && save.settings && save.settings.music === true, `réglage Musique enregistré (sauvegarde : ${fmt(save && save.settings)})`);
  await t.key('Escape', 40); // Options → menu Pause
  await waitFor(t, () => (document.querySelector('.overlay.pause.is-open') || {}).dataset?.view === 'menu', {
    timeout: 3000,
    label: 'Échap dans Options : retour au menu Pause',
  });
  await t.wait(200);
  await clickResume(t);
  await waitResumed(t);
  assertEq(await t.ev(() => window.__acs.length), 1, 'un seul AudioContext créé pendant tout le scénario');
}
