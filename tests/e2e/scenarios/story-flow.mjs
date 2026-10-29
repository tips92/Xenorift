// Cinématiques branchées au jeu (plan 04, étapes 14 à 16, choix 14), sauvegarde neuve, sans mode test :
//  A0. ?stage=j1 sur une sauvegarde neuve : partie lancée sans prologue, rien de noté.
//  A. Accueil « Nouvelle aventure » → JOUER → prologue (écran `cutscene`, phase 'story', musique 'story' au niveau 0,
//     repère « signal », bips lumaBip espacés de 125 ms au moins) ; Entrée et Espace ne le passent pas ; page cachée
//     → arrêté (horloge figée), retour → reprend seul ; pause Capacitor seule → arrêté, « resume » → reprend ;
//     portrait → arrêté sous l'invite de rotation, paysage → reprend ; Passer (<button>) et bulle dans l'écran, sans
//     chevauchement, de 844x390 à 640x320, aussi sous une encoche simulée (--sal / --sar) ; bouton retour Android =
//     Passer (cinématique coupée, pas finie seule) → carte d'intro de j1, marque 'prologue' enregistrée ; Échap →
//     accueil « Continuer · Lisière de Xéna ».
//  B. Second JOUER, puis carte j1 des Niveaux : carte d'intro directement.
//  C. ?stage=j3 gagné (__xr2d.win) → libération (Méduse-baleine, « DOUBLE SAUT » annoncés ; music(null) de la fin
//     d'étape puis 'story' au niveau 1 ; repères vide → heal → core → skill → landing → takeoff dans l'ordre ; bandeau
//     de la compétence capturé, cinématique figée par une pause Capacitor, à 640x320 et 844x390, avec et sans encoche
//     de 44 px) jouée jusqu'au bout → résultats « Compétence : double saut », marque 'liberation-1' ; REJOUER puis
//     victoire : résultats directement.
//  D. Options › Revoir les cinématiques : liste en <button> (Prologue, Libération du gardien) ; libération revue
//     (marques inchangées), Retour arrière = Passer (coupée) → Options ; Réinitialiser la progression → liste vide
//     (message), accueil « Nouvelle aventure », JOUER → prologue de nouveau, Passer (clic, coupé) → carte d'intro.
//  E. Musique coupée : les nœuds audio reviennent exactement au graphe fixe (rien ne reste branché).
import { assert, assertEq, fmt, readSave, screenText, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout, pickStage, press, rects, overlaps, skipCutscene } from '../lib/core.mjs';
import { cap, countTracks, instrument, liveNodes, pressBack, setHidden, waitAudio, waitIntroCard } from '../lib/shell.mjs';

export const meta = {
  title: 'Cinématiques : prologue au premier JOUER, arrière-plan, Passer, libération après j3, Revoir, nœuds audio',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

const CS = '.screens [data-screen="cutscene"].is-active';
/** Repères de la libération traduits en effets (src/ui/screens/cutscene.ts : CUE_SFX), dans l'ordre de la scène. */
const LIBERATION_SFX = ['lose', 'liberation', 'crystal', 'skill', 'boost', 'takeoff'];
/** Instant du bandeau « NOUVELLE COMPÉTENCE » (src/story/scenes/liberation.ts : T.skill = 6,5 s, entré en 0,35 s). */
const SKILL_BANNER_S = 7.2;

/** Avant t.goto : écrans ajoutés dans `.screens`, dans l'ordre (window.__csScreens). */
async function recordScreens(t) {
  await t.page.addInitScript(() => {
    window.__csScreens = [];
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n instanceof HTMLElement && n.dataset && n.dataset.screen) window.__csScreens.push(n.dataset.screen);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

function screensSeen(t) {
  return t.ev(() => window.__csScreens.slice());
}

function shell(t) {
  return t.ev(() => window.__xrShell.info());
}

/** Sons, musiques et intensités notés à partir de maintenant (enveloppe de __xrShell.audio) : { id, at }. */
function spyAudio(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    window.__csSfx = [];
    window.__csMusic = [];
    if (a.__csSpied) return;
    a.__csSpied = true;
    const sfx = a.sfx;
    const music = a.music;
    const level = a.musicLevel;
    a.sfx = function (id, o) {
      window.__csSfx.push({ id, at: performance.now() });
      return sfx.call(this, id, o);
    };
    a.music = function (id) {
      window.__csMusic.push(`music:${id}`);
      return music.call(this, id);
    };
    a.musicLevel = function (n) {
      window.__csMusic.push(`level:${n}`);
      return level.call(this, n);
    };
  });
}

function audioLog(t) {
  return t.ev(() => ({ sfx: window.__csSfx.map((s) => s.id), at: window.__csSfx.map((s) => s.at), music: window.__csMusic.slice() }));
}

/** Cinématique `id` à l'écran, fondu fini : renvoie __xrShell.info().cutscene. */
function waitCutscene(t, id, { timeout = 20000 } = {}) {
  return waitFor(
    t,
    ([sel, want]) => {
      const i = window.__xrShell.info();
      const box = document.querySelector(`${sel} .cs[data-cutscene="${want}"]`);
      const f = document.querySelector('.fader');
      return i.phase === 'story' && i.screen === 'cutscene' && i.cutscene && i.cutscene.id === want && box && !i.fading && !(f && f.classList.contains('is-on'))
        ? i.cutscene
        : false;
    },
    { timeout, label: `cinématique ${id} affichée`, arg: [CS, id] },
  );
}

/** Attend l'horloge de la cinématique en cours au-delà de `s` secondes. */
function waitCutsceneTime(t, s, { timeout = 20000 } = {}) {
  return waitFor(t, (v) => {
    const c = window.__xrShell.info().cutscene;
    return c && c.time >= v ? c : false;
  }, { timeout, label: `cinématique au-delà de ${s} s`, arg: s });
}

/** Horloge figée pendant `ms` ms (cinématique arrêtée) ; renvoie l'état. */
async function assertFrozen(t, label, ms = 700) {
  const a = (await shell(t)).cutscene;
  await t.wait(ms);
  const b = (await shell(t)).cutscene;
  assert(a && b && a.paused && b.paused && b.time === a.time && b.state === 'playing', `${label} : cinématique arrêtée, horloge figée (${fmt({ a, b })})`);
  return b;
}

/** L'horloge avance de nouveau (reprise seule). */
async function assertRuns(t, label) {
  const a = (await shell(t)).cutscene;
  await waitFor(t, (t0) => {
    const c = window.__xrShell.info().cutscene;
    return c && !c.paused && c.time > t0 + 0.3;
  }, { timeout: 5000, label: `${label} : la cinématique reprend seule`, arg: a.time });
}

/** Bulle visible (une réplique en cours), pour mesurer sa place. */
function waitBubble(t, label) {
  return waitFor(t, (sel) => {
    const b = document.querySelector(`${sel} .cs-bubble`);
    return !!b && !b.classList.contains('is-hidden') && getComputedStyle(b).opacity === '1';
  }, { timeout: 15000, label: `${label} : bulle affichée`, arg: CS });
}

/** Passer et bulle : dans l'écran, hors des marges de l'encoche `sa` (px), sans se chevaucher, Passer assez grand. */
async function checkLayout(t, label, sa = 0) {
  await waitBubble(t, label);
  await t.wait(250);
  await assertLayout(t, [`${CS} .cs-skip`, `${CS} .cs-bubble`], label);
  const W = await t.ev(() => window.innerWidth);
  const [skip] = await rects(t, `${CS} .cs-skip`);
  const [bubble] = await rects(t, `${CS} .cs-bubble`);
  const tag = await t.ev((sel) => document.querySelector(`${sel} .cs-skip`).tagName, CS);
  assert(tag === 'BUTTON' && skip && skip.w >= 48 && skip.h >= 40, `${label} : Passer est un <button> d'au moins 48x40 (${fmt({ tag, skip })})`);
  assert(bubble && !overlaps(skip, bubble), `${label} : Passer et bulle ne se chevauchent pas (${fmt({ skip, bubble })})`);
  assert(skip.x + skip.w <= W - sa - 6 && bubble.x >= sa + 6 && bubble.x + bubble.w <= W - sa, `${label} : hors de l'encoche de ${sa} px (${fmt({ W, skip, bubble })})`);
  const font = await t.ev((sel) => parseFloat(getComputedStyle(document.querySelector(`${sel} .cs-bubble`)).fontSize), CS);
  assert(font >= 14, `${label} : texte de la bulle lisible (${font} px)`);
}

/** Simule une encoche (zones sûres gauche et droite de `px` pixels), 0 = aucune. */
function notch(t, px) {
  return t.ev((v) => {
    const s = document.documentElement.style;
    if (v) {
      s.setProperty('--sal', `${v}px`);
      s.setProperty('--sar', `${v}px`);
    } else {
      s.removeProperty('--sal');
      s.removeProperty('--sar');
    }
  }, px);
}

/** Attend le retour exact au graphe fixe (`n0` nœuds branchés). */
function waitNodes(t, n0, label, timeout = 20000) {
  return waitFor(t, (n) => window.__liveNodes() === n, { timeout, label: `${label} : retour à ${n0} nœuds branchés`, arg: n0 }).catch(async (e) => {
    throw new Error(`${e.message} (actuellement ${await liveNodes(t)})`);
  });
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

/** Suit la cinématique en cours jusqu'à sa fin : dernier état vu (`time`, `duration`) avant qu'elle ne quitte la main. */
function followCutscene(t, { timeout = 30000 } = {}) {
  return t.ev(
    (ms) =>
      new Promise((resolve, reject) => {
        let last = null;
        const t0 = performance.now();
        const tick = () => {
          const c = window.__xrShell.info().cutscene;
          if (c) last = c;
          else if (last) return resolve(last);
          if (performance.now() - t0 > ms) return reject(new Error(`cinématique pas finie en ${ms} ms (${JSON.stringify(last)})`));
          requestAnimationFrame(tick);
        };
        tick();
      }),
    timeout,
  );
}

export default async function (t) {
  await instrument(t);
  await countTracks(t);
  await recordScreens(t);

  // ---------------------------------------------------------------- A0. ?stage=j1 : pas de prologue
  await t.goto('?touch=1&stage=j1');
  await waitFor2dPlay(t);
  let i = await shell(t);
  assert(i.phase === 'playing' && i.cutscene === null && !(await screensSeen(t)).includes('cutscene'), `A0 : ?stage=j1 lance la partie sans prologue (${fmt({ phase: i.phase, cutscene: i.cutscene })})`);
  assertEq(i.seen, [], 'A0 : rien de noté');

  // ---------------------------------------------------------------- A. Premier JOUER : prologue
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
  assert(/Nouvelle aventure/i.test(await screenText(t, 'title')), 'A : accueil « Nouvelle aventure »');
  // Graphe audio fixe : musique coupée avant le premier geste (comme audio-lifecycle), mesuré puis musique remise.
  await t.ev(() => window.__xrShell.audio.setMusicEnabled(false));
  await t.key('KeyZ', 40);
  await waitAudio(t, 'running', 'A : premier geste → son actif');
  const n0 = await settledNodes(t, 'A : graphe fixe');
  t.log('nœuds branchés en silence (graphe fixe)', n0);
  await t.ev(() => window.__xrShell.audio.setMusicEnabled(true));
  await spyAudio(t);
  await press(t, 'title', 'Jouer');
  let c = await waitCutscene(t, 'prologue');
  assert(c.state === 'playing' && c.duration > 40 && c.mark === 'prologue', `A : prologue lancé (${fmt(c)})`);
  let au = await audioLog(t);
  assert(au.music.join(' ').includes('music:story level:0'), `A : musique 'story' au niveau 0 (${fmt(au.music)})`);
  assert(await t.ev((sel) => getComputedStyle(document.querySelector(sel)).pointerEvents === 'auto' && !!document.querySelector(`${sel} button.cs-skip`), CS), 'A : écran cliquable, Passer en <button>');
  await t.shot('prologue-start');

  // Entrée et Espace ne passent pas la cinématique.
  await waitCutsceneTime(t, 1.5);
  await t.key('Enter', 60);
  await t.key('Space', 60);
  await t.wait(400);
  i = await shell(t);
  assert(i.phase === 'story' && i.cutscene && i.cutscene.id === 'prologue' && i.cutscene.state === 'playing', `A : Entrée / Espace ne passent pas (${fmt(i.cutscene)})`);
  c = await waitCutsceneTime(t, 3.2);
  au = await audioLog(t);
  assert(au.sfx.includes('checkpoint'), `A : repère « signal » joué (${fmt(au.sfx)})`);
  const bips = au.at.filter((_, k) => au.sfx[k] === 'lumaBip');
  const gaps = bips.slice(1).map((v, k) => v - bips[k]);
  assert(bips.length >= 4 && gaps.every((g) => g >= 118), `A : bips lumaBip au rythme de la bulle (${bips.length}, écarts min ${Math.round(Math.min(...gaps))} ms)`);

  // Page cachée, pause Capacitor seule, portrait : arrêtée, puis reprise seule.
  await setHidden(t, true);
  await waitAudio(t, 'suspended', 'A : page cachée → son suspendu');
  await assertFrozen(t, 'A : page cachée');
  await setHidden(t, false);
  await assertRuns(t, 'A : retour au premier plan');
  await cap(t, 'pause');
  await assertFrozen(t, 'A : pause Capacitor');
  await cap(t, 'resume');
  await assertRuns(t, 'A : « resume » Capacitor');
  await t.page.setViewportSize({ width: 390, height: 844 });
  await waitFor(t, () => document.querySelector('.rotate').classList.contains('is-on'), { timeout: 3000, label: 'A : invite de rotation' });
  await assertFrozen(t, 'A : portrait');
  await t.shot('prologue-portrait');
  await t.page.setViewportSize({ width: 844, height: 390 });
  await assertRuns(t, 'A : paysage');
  i = await shell(t);
  assert(i.phase === 'story' && i.cutscene.id === 'prologue', `A : toujours le prologue après l'arrière-plan (${fmt(i.cutscene)})`);

  // Mise en page : Passer et bulle de 844x390 à 640x320, avec et sans encoche.
  for (const [w, h] of [[844, 390], [640, 320]]) {
    await t.page.setViewportSize({ width: w, height: h });
    await checkLayout(t, `A : ${w}x${h}`);
    await t.shot(`prologue-${w}x${h}`);
    await notch(t, 44);
    await checkLayout(t, `A : ${w}x${h}, encoche de 44 px`, 44);
    await t.shot(`prologue-${w}x${h}-notch`);
    await notch(t, 0);
  }
  await t.page.setViewportSize({ width: 844, height: 390 });

  // Bouton retour Android = Passer : carte d'intro de j1, prologue noté.
  await t.wait(400);
  await skipCutscene(t, () => pressBack(t), 'A : bouton retour Android = Passer');
  await waitIntroCard(t);
  const intro = await screenText(t, 'intro');
  assert(intro.includes('Lisière de Xéna'), `A : carte d'intro de j1 après le prologue (${intro.slice(0, 80)})`);
  const order = await screensSeen(t);
  assertEq(order.slice(order.lastIndexOf('title') + 1), ['cutscene', 'intro'], 'A : prologue puis carte d’intro');
  assert((await readSave(t)).story.seen.includes('prologue'), 'A : marque « prologue » enregistrée au Passer');
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');
  assert(/Continuer · Lisière de Xéna/.test(await screenText(t, 'title')), 'A : accueil « Continuer · Lisière de Xéna »');

  // ---------------------------------------------------------------- B. Second JOUER, carte des Niveaux : sans prologue
  let n = (await screensSeen(t)).length;
  await press(t, 'title', 'Jouer');
  await waitIntroCard(t);
  assert(!(await screensSeen(t)).slice(n).includes('cutscene'), 'B : second JOUER sans prologue');
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');
  await press(t, 'title', 'Niveaux');
  n = (await screensSeen(t)).length;
  await pickStage(t, 'j1');
  await waitIntroCard(t);
  assert(!(await screensSeen(t)).slice(n).includes('cutscene'), 'B : carte j1 des Niveaux sans prologue');
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // ---------------------------------------------------------------- C. Libération après j3 (?stage= : celle d'après est jouée)
  await t.goto('?touch=1&stage=j3');
  await waitFor2dPlay(t);
  await spyAudio(t);
  await t.ev(() => window.__xr2d.win());
  c = await waitCutscene(t, 'liberation', { timeout: 20000 });
  assert(c.mark === 'liberation-1' && c.duration >= 14, `C : libération du monde 1 (${fmt(c)})`);
  au = await audioLog(t);
  const ms = au.music.join(' ');
  assert(/music:null.*music:story level:1/.test(ms), `C : fin d'étape (music null) puis 'story' au niveau 1 (${ms})`);
  // Bandeau de la compétence (annoncé dans le nœud aria-live du lecteur) capturé à 640x320 et 844x390, avec et sans
  // encoche de 44 px : il rétrécit pour s'arrêter avant Passer. Cinématique figée par une pause Capacitor pendant les
  // captures (image redessinée à chaque changement de taille), reprise ensuite.
  await t.page.setViewportSize({ width: 640, height: 320 });
  await waitCutsceneTime(t, SKILL_BANNER_S);
  await cap(t, 'pause');
  await assertFrozen(t, 'C : pause pendant les captures du bandeau', 300);
  await t.shot('liberation-skill-640x320');
  await assertLayout(t, [`${CS} .cs-skip`], 'C : Passer à 640x320');
  const live = await t.ev((sel) => document.querySelector(`${sel} .cs > .xr-sr`).textContent, CS);
  assertEq(live, 'NOUVELLE COMPÉTENCE : DOUBLE SAUT', 'C : compétence annoncée');
  await notch(t, 44);
  for (const [w, h] of [[844, 390], [640, 320]]) {
    await t.page.setViewportSize({ width: w, height: h });
    await t.wait(300);
    await assertLayout(t, [`${CS} .cs-skip`], `C : Passer à ${w}x${h}, encoche de 44 px`);
    await t.shot(`liberation-skill-${w}x${h}-notch`);
  }
  await notch(t, 0);
  await t.page.setViewportSize({ width: 844, height: 390 });
  await t.wait(300);
  await t.shot('liberation-skill-844x390');
  await cap(t, 'resume');
  await assertRuns(t, 'C : reprise après les captures');
  const last = await followCutscene(t);
  assert(last.time >= last.duration - 0.25, `C : libération jouée jusqu'au bout (${fmt(last)})`);
  await waitForScreen(t, 'results', { timeout: 15000 });
  au = await audioLog(t);
  const got = au.sfx.filter((id) => LIBERATION_SFX.includes(id));
  let k = 0;
  for (const id of got) if (id === LIBERATION_SFX[k]) k++;
  assert(k === LIBERATION_SFX.length, `C : repères de la libération dans l'ordre (${got.join(' ')})`);
  const skill = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .detail--reward[data-reward="skill:doubleJump"]');
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  assert(skill && /Compétence/.test(skill) && /double saut/.test(skill), `C : résultats « Compétence : double saut » (${skill})`);
  assert((await readSave(t)).story.seen.includes('liberation-1'), 'C : marque « liberation-1 » enregistrée à la fin');
  await t.shot('liberation-results');
  n = (await screensSeen(t)).length;
  await press(t, 'results', 'Rejouer');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 20000 });
  assert(!(await screensSeen(t)).slice(n).includes('cutscene'), 'C : seconde victoire sans libération');

  // ---------------------------------------------------------------- D. Options › Revoir les cinématiques, réinitialisation
  await t.goto('?touch=1');
  await spyAudio(t);
  await press(t, 'title', 'Options');
  const O = '.screens [data-screen="options"].is-active';
  await t.page.locator(`${O} .options-story`).click();
  await waitFor(t, (sel) => !!document.querySelector(`${sel} .confirm--story.is-open`), { timeout: 3000, label: 'D : liste ouverte', arg: O });
  const list = await t.ev((sel) => [...document.querySelectorAll(`${sel} .confirm--story .story-item`)].map((b) => ({ tag: b.tagName, id: b.dataset.cutscene, text: b.textContent.replace(/\s+/g, ' ').trim() })), O);
  assertEq(list.map((b) => [b.tag, b.id]), [['BUTTON', 'prologue'], ['BUTTON', 'liberation']], `D : cinématiques vues, en <button> (${fmt(list)})`);
  assert(/Prologue/i.test(list[0].text) && /Libération du gardien/i.test(list[1].text) && /Méduse-baleine/i.test(list[1].text), `D : titres (${fmt(list)})`);
  await assertLayout(t, [`${O} .confirm--story .confirm-box`, `${O} .confirm--story .story-item`], 'D : liste');
  await t.wait(300); // fin du fondu de la boîte
  await t.shot('options-replay-list');
  const seenBefore = (await readSave(t)).story.seen;
  await t.page.locator(`${O} .confirm--story .story-item[data-cutscene="liberation"]`).click();
  await waitCutscene(t, 'liberation');
  await waitCutsceneTime(t, 1);
  au = await audioLog(t);
  assert(au.music.join(' ').includes('music:story level:1'), `D : musique 'story' au niveau 1 (${fmt(au.music)})`);
  await skipCutscene(t, () => t.key('Backspace', 60), 'D : Retour arrière = Passer');
  await waitForScreen(t, 'options');
  i = await shell(t);
  assert(i.phase === 'menu' && i.cutscene === null, `D : retour aux Options après Retour arrière (${fmt({ phase: i.phase, cutscene: i.cutscene })})`);
  assertEq((await readSave(t)).story.seen, seenBefore, 'D : marques inchangées après une cinématique revue');
  assert((await audioLog(t)).music.at(-1) === 'music:menu', 'D : musique du menu de retour');
  // Réinitialiser : texte de la confirmation, marques effacées, liste vide.
  await t.page.locator(`${O} .options-footer .btn-danger`).click();
  const confirmText = await t.ev((sel) => document.querySelector(`${sel} .confirm.is-open .confirm-text`).textContent, O);
  assert(/cinématiques se rejoueront/.test(confirmText), `D : confirmation qui parle des cinématiques (${confirmText})`);
  await t.page.locator(`${O} .confirm.is-open button`, { hasText: 'Effacer' }).click();
  await waitFor(t, () => JSON.parse(localStorage.getItem('xeno-rift-save-v1')).story.seen.length === 0, { timeout: 3000, label: 'D : marques effacées' });
  await t.page.locator(`${O} .options-story`).click();
  await waitFor(t, (sel) => !!document.querySelector(`${sel} .confirm--story.is-open`), { timeout: 3000, label: 'D : liste rouverte', arg: O });
  const empty = await t.ev((sel) => ({ items: document.querySelectorAll(`${sel} .confirm--story .story-item`).length, text: document.querySelector(`${sel} .confirm--story .story-list`).textContent }), O);
  assert(empty.items === 0 && /Aucune/.test(empty.text), `D : liste vide après la réinitialisation (${fmt(empty)})`);
  await t.wait(300);
  await t.shot('options-replay-empty');
  await t.key('Escape', 60);
  await waitFor(t, (sel) => !document.querySelector(`${sel} .confirm--story.is-open`), { timeout: 3000, label: 'D : Échap ferme la liste', arg: O });
  await t.wait(200); // deux retours à moins de 120 ms n'en font qu'un (App.ts : handleBack)
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');
  assert(/Nouvelle aventure/i.test(await screenText(t, 'title')), 'D : accueil « Nouvelle aventure » après la réinitialisation');
  await press(t, 'title', 'Jouer');
  await waitCutscene(t, 'prologue');
  await waitCutsceneTime(t, 0.8);
  await skipCutscene(t, () => t.page.locator(`${CS} .cs-skip`).click(), 'D : Passer (clic)');
  await waitIntroCard(t);
  assertEq((await readSave(t)).story.seen, ['prologue'], 'D : prologue de nouveau joué puis passé (clic)');
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // ---------------------------------------------------------------- E. Rien ne reste branché
  await t.ev(() => window.__xrShell.audio.setMusicEnabled(false));
  await waitNodes(t, n0, 'E : musique coupée après les cinématiques');
}
