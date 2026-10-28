// Rubrique « Commandes » des Options (réglages des commandes tactiles) :
//  - ancienne sauvegarde v1 sans ces réglages : valeurs par défaut, progression (déblocage, record) et musique
//    coupée conservées ; réglages abîmés (cran hors limites ou en texte, gaucher non booléen) : crans bornés ou
//    par défaut, interrupteur, aperçu et commandes d'accord ;
//  - écran Options : taille (Petits / Moyens / Grands), opacité (Discrète / Moyenne / Opaque), mode gaucher ;
//    toutes les commandes sont des <button> ; effet immédiat sur #touch-root (--xr-scale, --xr-tc-opacity,
//    classe xr-touch--lefty) et dans la sauvegarde ; mise en page à 844x390 et 740x360 ;
//  - persistance après rechargement de la page ;
//  - en 2D : stick à droite (plus grand), SAUT et TIR à gauche, commandes fonctionnelles ;
//  - réglages changés depuis la Pause : visibles à la reprise (stick revenu à gauche, 1,2 fois plus petit) ;
//  - en vol : joystick sur la moitié droite (un doigt glissé à gauche ne pilote pas), TURBO à gauche.
import { assert, assertEq, assertNear, center, fmt, readSave, waitFor, waitFor2dPlay, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { touches } from '../lib/touch.mjs';
import { input, press, pressPause, rects, waitInput, waitInputIdle, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Options : rubrique Commandes (taille, opacité, gaucher), persistance, changement depuis la Pause',
  suites: ['full'],
  dev: true,
  timeoutMs: 180000,
};

const O = '.screens [data-screen="options"].is-active';
const PO = '.overlay.pause.is-open';

/** Réglages appliqués aux commandes tactiles (#touch-root, valeurs calculées : feuille de style ou réglage). */
function touchRoot(t) {
  return t.ev(() => {
    const r = document.getElementById('touch-root');
    const cs = getComputedStyle(r);
    return {
      scale: cs.getPropertyValue('--xr-scale').trim(),
      opacity: cs.getPropertyValue('--xr-tc-opacity').trim(),
      lefty: r.classList.contains('xr-touch--lefty'),
    };
  });
}

/** État de la rubrique Commandes du panneau `root` : cran coché de chaque sélecteur, interrupteur gaucher. */
function controlsState(t, root) {
  return t.ev((sel) => {
    const sec = document.querySelector(`${sel} .options-section--controls`);
    if (!sec) return null;
    const checked = (cls) => {
      const b = sec.querySelector(`.choice--${cls} .seg-btn[aria-checked="true"]`);
      return b ? b.textContent.trim() : null;
    };
    const lefty = sec.querySelector('.toggle--leftHanded');
    return {
      title: sec.querySelector('.options-section-title').textContent.trim(),
      size: checked('touchSize'),
      opacity: checked('touchOpacity'),
      lefty: lefty ? lefty.getAttribute('aria-checked') === 'true' : null,
      // Commandes de la rubrique : toutes des <button> (le 2e doigt rejoue le clic d'un <button>).
      controls: [...sec.querySelectorAll('.seg-btn, .toggle, [role="radio"], [role="switch"]')].map((e) => e.tagName),
    };
  }, root);
}

/** Clique le bouton de la rubrique Commandes du panneau `root` contenant `label` (cran ou interrupteur). */
async function clickControl(t, root, label) {
  await t.page.locator(`${root} .options-section--controls button`, { hasText: label }).first().click({ timeout: 5000 });
}

/** Fait défiler le panneau jusqu'à la rubrique Commandes (haut de la rubrique en haut de la zone visible). */
async function showControls(t, root) {
  await t.ev((sel) => document.querySelector(`${sel} .options-section--controls`).scrollIntoView({ block: 'start' }), root);
  await t.wait(250);
}

/** Boutons des crans entiers et lisibles (dans la fenêtre en largeur, texte non coupé). */
async function assertSegButtons(t, root, label) {
  const bad = await t.ev((sel) => {
    const W = window.innerWidth;
    return [...document.querySelectorAll(`${sel} .options-section--controls .seg-btn, ${sel} .options-section--controls .toggle`)]
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim().slice(0, 30), l: Math.round(r.left), r: Math.round(r.right), sw: b.scrollWidth, cw: b.clientWidth };
      })
      .filter((b) => b.l < -1 || b.r > W + 1 || b.sw > b.cw + 1);
  }, root);
  assert(!bad.length, `${label} : commandes de la rubrique coupées ou hors de la fenêtre : ${fmt(bad)}`);
}

/** Rectangle unique visible de `sel`. */
async function one(t, sel) {
  const r = await rects(t, sel);
  assertEq(r.length, 1, `un seul élément visible ${sel}`);
  return r[0];
}

const cx = (r) => r.x + r.w / 2;

const SAVE_KEY = 'xeno-rift-save-v1';

/** Remplace la sauvegarde (localStorage) puis recharge la page sur l'accueil (sans ?unlock=1). */
async function loadWithSave(t, save) {
  await t.ev(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [SAVE_KEY, save]);
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
}

/** Interrupteur `key` du panneau Options : coché (aria-checked) ou non. */
function toggleOn(t, key) {
  return t.ev(([sel, k]) => {
    const b = document.querySelector(`${sel} .toggle--${k}`);
    return b ? b.getAttribute('aria-checked') === 'true' : null;
  }, [O, key]);
}

/** Libellés accessibles des cartes du choix du niveau (« …, record 1234 », « …, verrouillé »). */
async function cardLabels(t) {
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  const labels = await t.ev(() => [...document.querySelectorAll('.screens [data-screen="select"].is-active .card')].map((c) => c.getAttribute('aria-label')));
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');
  return labels;
}

/** Anciennes sauvegardes (sans les réglages des commandes) et réglages abîmés : valeurs par défaut ou bornées. */
async function oldSaves(t) {
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
  // Sauvegarde v1 antérieure à la rubrique Commandes : progression et musique coupée conservées.
  await loadWithSave(t, { version: 1, unlocked: 2, best: { j1: { score: 1234, stars: 2 } }, settings: { music: false } });
  assertEq(await touchRoot(t), { scale: '1', opacity: '0.75', lefty: false }, 'ancienne sauvegarde : commandes tactiles par défaut');
  const cards = await cardLabels(t);
  t.log('ancienne sauvegarde : cartes', JSON.stringify(cards));
  assert(/record 1\s?234/.test(cards[0]), `ancienne sauvegarde : record de j1 conservé (${cards[0]})`);
  assert(!/verrouillé/.test(cards[2]), `ancienne sauvegarde : étape m1 débloquée (${cards[2]})`);
  assert(/verrouillé/.test(cards[3]), `ancienne sauvegarde : étape f2 toujours verrouillée (${cards[3]})`);
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  let st = await controlsState(t, O);
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Moyens', opacity: 'Moyenne', lefty: false }, 'ancienne sauvegarde : rubrique Commandes par défaut');
  assertEq(await toggleOn(t, 'music'), false, 'ancienne sauvegarde : musique toujours coupée');

  // Réglages abîmés : cran hors limites, cran en texte, interrupteur qui n'est pas un booléen.
  await loadWithSave(t, { version: 1, unlocked: 0, best: {}, settings: { touchSize: 7, touchOpacity: '2', leftHanded: 'oui' } });
  assertEq(await touchRoot(t), { scale: '1.2', opacity: '0.75', lefty: false }, 'réglages abîmés : cran borné (Grands), valeurs invalides par défaut');
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  st = await controlsState(t, O);
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Grands', opacity: 'Moyenne', lefty: false }, 'réglages abîmés : crans et interrupteur gaucher');
  const pvLefty = await t.ev((sel) => document.querySelector(`${sel} .ctl-preview`).classList.contains('is-lefty'), O);
  assertEq(pvLefty, false, "réglages abîmés : l'aperçu est d'accord avec les commandes (droitier)");

  // Retour à une sauvegarde vide pour la suite.
  await t.ev((k) => localStorage.removeItem(k), SAVE_KEY);
}

export default async function (t) {
  const f = touches(t);

  // ---------------------------------------------------------------- Anciennes sauvegardes
  await oldSaves(t);

  // ---------------------------------------------------------------- Écran Options
  await t.goto('?touch=1&unlock=1');
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  let st = await controlsState(t, O);
  assert(st, 'rubrique Commandes présente dans les Options');
  assertEq(st.title, 'Commandes', 'titre de la rubrique');
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Moyens', opacity: 'Moyenne', lefty: false }, 'réglages par défaut');
  assert(st.controls.length >= 8 && st.controls.every((tag) => tag === 'BUTTON'), `commandes de la rubrique : des <button> (${st.controls.join(',')})`);
  assertEq(await touchRoot(t), { scale: '1', opacity: '0.75', lefty: false }, 'commandes tactiles au départ');
  await showControls(t, O);
  await t.shot('options-controls-default-844x390');

  // Taille Grands, opacité Discrète puis Opaque, mode gaucher : effet immédiat et sauvegarde
  await clickControl(t, O, 'Grands');
  await waitFor(t, () => getComputedStyle(document.getElementById('touch-root')).getPropertyValue('--xr-scale').trim() === '1.2', {
    timeout: 2000,
    label: 'Grands : --xr-scale 1.2',
  });
  await clickControl(t, O, 'Discrète');
  assertEq((await touchRoot(t)).opacity, '0.45', 'Discrète : --xr-tc-opacity');
  await clickControl(t, O, 'Opaque');
  assertEq((await touchRoot(t)).opacity, '0.95', 'Opaque : --xr-tc-opacity');
  await clickControl(t, O, 'Mode gaucher');
  assertEq(await touchRoot(t), { scale: '1.2', opacity: '0.95', lefty: true }, 'commandes tactiles après réglage');
  st = await controlsState(t, O);
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Grands', opacity: 'Opaque', lefty: true }, 'crans cochés après réglage');
  const pv = await t.ev((sel) => {
    const p = document.querySelector(`${sel} .ctl-preview`);
    return { lefty: p.classList.contains('is-lefty'), scale: p.style.getPropertyValue('--pv-scale').trim() };
  }, O);
  assertEq(pv, { lefty: true, scale: '1.2' }, 'aperçu des commandes dans la rubrique');
  let save = await readSave(t);
  assertEq(
    { touchSize: save.settings.touchSize, touchOpacity: save.settings.touchOpacity, leftHanded: save.settings.leftHanded },
    { touchSize: 2, touchOpacity: 2, leftHanded: true },
    'réglages enregistrés',
  );
  await showControls(t, O);
  await assertSegButtons(t, O, 'Options 844x390');
  await t.shot('options-controls-set-844x390');
  await t.page.setViewportSize({ width: 740, height: 360 });
  await showControls(t, O);
  await assertSegButtons(t, O, 'Options 740x360');
  await t.shot('options-controls-set-740x360');
  await t.page.setViewportSize({ width: 844, height: 390 });

  // ---------------------------------------------------------------- Persistance
  await t.page.reload();
  await waitForScreen(t, 'title');
  assertEq(await touchRoot(t), { scale: '1.2', opacity: '0.95', lefty: true }, 'après rechargement : commandes tactiles réglées dès le démarrage');
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  st = await controlsState(t, O);
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Grands', opacity: 'Opaque', lefty: true }, 'après rechargement : crans cochés');

  // ---------------------------------------------------------------- 2D : gaucher, grand, opaque
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
  const W = await t.ev(() => window.innerWidth);
  let stick = await one(t, '.xr-dpad');
  let jump = await one(t, '.xr-jump');
  let fire = await one(t, '.xr-fire');
  assert(cx(stick) > W / 2 && cx(jump) < W / 2 && cx(fire) < W / 2, `gaucher : stick à droite, SAUT et TIR à gauche (${fmt({ stick, jump, fire })})`);
  // Largeur au cran Grands : comparée à celle du cran Moyens à la reprise (rapport 1,2).
  const bigW = stick.w;
  await waitFor(t, () => Math.abs(Number(getComputedStyle(document.querySelector('.xr-tc-platform')).opacity) - 0.95) < 0.01, {
    timeout: 2000,
    label: 'Opaque : opacité de la couche des commandes 0,95',
  });
  // Le stick à droite marche (directions lues autour de son centre) ; SAUT à gauche aussi.
  const SR = await center(t, '.xr-dpad', 0.8, 0.5);
  const SL = await center(t, '.xr-dpad', 0.2, 0.5);
  const SU = await center(t, '.xr-dpad', 0.5, 0.12);
  const J = await center(t, '.xr-jump');
  await f.start([[...SR, 1]]);
  await waitInput(t, (i) => i.right && !i.left && !i.up && !i.down, 'gaucher : stick à droite → droite');
  await f.move([[...SL, 1]]);
  await waitInput(t, (i) => i.left && !i.right, 'gaucher : stick → gauche');
  await f.move([[...SU, 1]]);
  await waitInput(t, (i) => i.up && !i.left && !i.right && !i.down, 'gaucher : stick → haut');
  await f.start([[...SU, 1], [...J, 2]]);
  await waitInput(t, (i) => i.up && i.jump, 'gaucher : haut + SAUT (à gauche)');
  await t.wait(150);
  await t.shot('play-lefty-big-opaque');
  await f.end();
  await waitInputIdle(t, 'gaucher : tout levé');

  // ---------------------------------------------------------------- Pause : retour à droitier, taille moyenne
  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Options');
  await waitFor(t, (sel) => !!document.querySelector(`${sel} .options-section--controls`) && document.querySelector('.overlay.pause').dataset.view === 'options', {
    timeout: 3000,
    label: 'Pause : vue Options avec la rubrique Commandes',
    arg: PO,
  });
  await t.wait(350); // animation d'ouverture du panneau
  st = await controlsState(t, PO);
  assertEq({ size: st.size, opacity: st.opacity, lefty: st.lefty }, { size: 'Grands', opacity: 'Opaque', lefty: true }, 'Pause : crans cochés');
  assert(st.controls.every((tag) => tag === 'BUTTON'), `Pause : commandes de la rubrique en <button> (${st.controls.join(',')})`);
  await showControls(t, PO);
  await t.shot('pause-options-controls');
  await clickControl(t, PO, 'Moyens');
  await clickControl(t, PO, 'Moyenne');
  await clickControl(t, PO, 'Mode gaucher');
  assertEq(await touchRoot(t), { scale: '1', opacity: '0.75', lefty: false }, 'Pause : réglages appliqués tout de suite');
  await showControls(t, PO);
  await t.shot('pause-options-controls-changed');
  await t.page.locator(`${PO} .pause-opt-head .btn-round`).first().click({ timeout: 5000 });
  await waitFor(t, () => document.querySelector('.overlay.pause').dataset.view === 'menu', { timeout: 2000, label: 'Pause : retour au menu' });
  await pressPause(t, 'Reprendre');
  await waitPause(t, false);
  // Apparition des commandes (animation de 220 ms, de 0 à l'opacité réglée)
  await waitFor(t, () => Math.abs(Number(getComputedStyle(document.querySelector('.xr-tc-platform')).opacity) - 0.75) < 0.01, {
    timeout: 2000,
    label: 'reprise : opacité moyenne de la couche des commandes (0,75)',
  });
  stick = await one(t, '.xr-dpad');
  jump = await one(t, '.xr-jump');
  fire = await one(t, '.xr-fire');
  assert(cx(stick) < W / 2 && cx(jump) > W / 2 && cx(fire) > W / 2, `reprise : stick revenu à gauche, SAUT et TIR à droite (${fmt({ stick, jump, fire })})`);
  assertNear(bigW, stick.w * 1.2, 1.5, `reprise : stick de taille moyenne (${stick.w} px, ${bigW} px au cran Grands)`);
  const x0 = await t.ev(() => window.__xr2d.scene.player.x);
  const R = await center(t, '.xr-dpad', 0.8, 0.5);
  await f.start([[...R, 1]]);
  await waitInput(t, (i) => i.right && !i.left, 'reprise : stick à gauche → droite');
  await waitFor(t, (x) => window.__xr2d.scene.player.x > x + 40, { timeout: 2000, label: 'reprise : Kaï avance', arg: x0 });
  await t.shot('play-after-pause-change');
  await f.end();
  await waitInputIdle(t, 'reprise : tout levé');
  save = await readSave(t);
  assertEq(
    { touchSize: save.settings.touchSize, touchOpacity: save.settings.touchOpacity, leftHanded: save.settings.leftHanded },
    { touchSize: 1, touchOpacity: 1, leftHanded: false },
    'réglages changés depuis la Pause : enregistrés',
  );

  // ---------------------------------------------------------------- Vol : joystick à droite en mode gaucher
  await t.ev(() => {
    const KEY = 'xeno-rift-save-v1';
    const s = JSON.parse(localStorage.getItem(KEY));
    s.settings.leftHanded = true;
    localStorage.setItem(KEY, JSON.stringify(s));
  });
  await t.goto('?touch=1&unlock=1&stage=f1');
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  const zone = await one(t, '.xr-stick-zone');
  const base = await one(t, '.xr-stick-base');
  const boost = await one(t, '.xr-boost');
  assert(zone.x >= W / 2 - 1 && cx(base) > W / 2 && cx(boost) < W / 2, `vol gaucher : joystick à droite, TURBO à gauche (${fmt({ zone, base, boost })})`);
  const H = await t.ev(() => window.innerHeight);
  // Doigt posé sur la moitié gauche (hors TURBO) puis glissé comme sur le joystick : rien ne pilote, la base
  // du joystick reste au repos.
  const G = [Math.round(W * 0.3), Math.round(H * 0.45)];
  await f.start([[...G, 3]]);
  await f.move([[G[0] + 70, G[1] - 60, 3]]);
  await t.wait(150);
  const i0 = await input(t);
  const baseCls = await t.ev(() => document.querySelector('.xr-stick-base').className);
  assert(i0.stickX === 0 && i0.stickY === 0 && !i0.right && !i0.up, `vol gaucher : un doigt glissé à gauche ne pilote pas (${fmt(i0)})`);
  assert(/\bis-idle\b/.test(baseCls) && !/\bis-live\b/.test(baseCls), `vol gaucher : base du joystick au repos (${baseCls})`);
  await f.end();
  // Joystick à droite : vers la gauche puis vers le haut.
  const S = [Math.round(W * 0.75), Math.round(H * 0.6)];
  await f.start([[...S, 4]]);
  await f.move([[S[0] - 70, S[1] - 50, 4]]);
  await waitInput(t, (i) => i.stickX < -0.5 && i.stickY > 0.4, 'vol gaucher : joystick haut-gauche');
  await t.shot('flight-lefty-stick');
  await f.end();
  await waitInputIdle(t, 'vol gaucher : tout levé');
}
