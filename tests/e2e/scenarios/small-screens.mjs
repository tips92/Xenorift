// Petits écrans de téléphone en paysage (740x360, 640x320) : accueil, choix du niveau (avec le bouton Hangar),
// carte d'intro, commandes tactiles et HUD en jeu, menu Pause. Rien d'important ne sort de l'écran, n'est coupé ni
// ne déborde, la page ne défile pas, les commandes ne se chevauchent pas. Puis portrait (390x844) en pleine
// partie : invite « Tourne ton téléphone » et partie mise en pause ; retour en paysage : invite masquée, menu
// Pause, REPRENDRE relance.
// Réglages des commandes posés dans la sauvegarde avant le chargement (640x320 puis 740x360) : mode gaucher, cran
// « grand », et les deux : le stick rond (border-radius 50 %) ne chevauche rien, il passe à droite en mode
// gaucher (Saut et Tir à gauche) et grandit de 20 % au cran « grand » ; en vol, gaucher et grand : joystick à
// droite, TURBO à gauche, sans chevauchement avec le HUD de vol ni le bouton pause.
// Plan 02 : en jeu, avec les trois bonus actifs (vitesse, cadence, bouclier), jauge de chauffe, anneaux et bouton
// pause ne se chevauchent pas (aides DEV : sautés avec --prod).
// Plan 03 (hangar) : sauvegarde version 2 avec 2 cœurs et 2 boucliers achetés (640x320, 740x360) : HUD à 5 cœurs
// (avec les trois bonus en dev) et vol à 5 boucliers sans chevauchement ; résultats avec « +53 cristaux » et une
// grosse réserve (ligne Réserve entière, dev). Hangar à 844x390, 740x360, 640x320 et 568x320 : ouvert depuis les
// Niveaux hors mode test (verrous) et, en dev, depuis les résultats en mode test (bouton Décoller, Équiper et prix) :
// en-tête, aperçu (zone de dessin d'au moins 100x60 px, canvas à sa taille, dans la baie), onglets, chaque carte de
// la liste (amenée à l'écran, la liste défile) entière et sans chevauchement, sur l'Établi une première amélioration
// entière sans défiler, cibles tactiles d'au moins 40 px, boîte de confirmation ; captures aux 4 tailles.
// N'utilise pas les aides DEV (sauf les bonus, la victoire et les cristaux de j1) : passe aussi sur le build de
// production (--prod).
import { assert, assertEq, clickText, fmt, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout, overlaps, press, pressPause, rects, waitHud, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Petits écrans (740x360, 640x320, 568x320) et portrait : menus, hangar, commandes, HUD (5 cœurs, 5 boucliers), pause, rotation',
  suites: ['full'],
  timeoutMs: 300000,
  viewport: { width: 740, height: 360 },
};

const SIZES = [
  [740, 360],
  [640, 320],
];
const HANGAR_SIZES = [
  [844, 390],
  [740, 360],
  [640, 320],
  [568, 320],
];
/** Tailles dont le hangar est capturé pour la revue à l'œil. */
const HANGAR_SHOTS = new Set(['844x390', '740x360', '640x320', '568x320']);
/** Cible tactile minimale (px) des commandes du hangar. */
const MIN_TARGET = 40;
const HG = '.screens [data-screen="hangar"].is-active';

/** La page elle-même ne doit jamais défiler (tout tient dans la fenêtre). */
async function assertNoPageScroll(t, label) {
  const d = await t.ev(() => {
    const e = document.scrollingElement || document.documentElement;
    return { sw: e.scrollWidth, sh: e.scrollHeight, w: window.innerWidth, h: window.innerHeight };
  });
  assert(d.sw <= d.w && d.sh <= d.h, `${label} : la page ne doit pas défiler (contenu ${d.sw}x${d.sh} pour une fenêtre ${d.w}x${d.h})`);
}

/** Aucun chevauchement entre les rectangles (commandes tactiles, bouton pause). */
function assertDisjoint(list, label) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      assert(!overlaps(a.r, b.r), `${label} : ${a.name} et ${b.name} se chevauchent (${JSON.stringify(a.r)} / ${JSON.stringify(b.r)})`);
    }
  }
}

async function one(t, sel, label) {
  const r = await rects(t, sel);
  assertEq(r.length, 1, `${label} : un seul élément visible ${sel}`);
  return r[0];
}

/** Rectangles nommés (un élément visible chacun), puis aucun chevauchement. */
async function assertParts(t, parts, label) {
  const list = [];
  for (const [name, sel] of parts) list.push({ name, r: await one(t, sel, label) });
  assertDisjoint(list, label);
  return list;
}

async function checkSize(t, w, h) {
  const tag = `${w}x${h}`;
  await t.page.setViewportSize({ width: w, height: h });

  // --- Accueil
  await t.goto('?touch=1&unlock=1');
  await waitForScreen(t, 'title');
  await assertNoPageScroll(t, `accueil ${tag}`);
  const T = '.screens [data-screen="title"].is-active';
  const titleButtons = await rects(t, `${T} .btn`);
  assertEq(titleButtons.length, 3, `accueil ${tag} : boutons JOUER, NIVEAUX, OPTIONS visibles`);
  await assertLayout(t, [`${T} .logo`, `${T} .btn`, `${T} .btn-label`, `${T} .btn-sub`, `${T} .tagline`], `accueil ${tag}`);
  await t.shot(`title-${tag}`);

  // --- Choix du niveau : 4 cartes côte à côte, entières, sans chevauchement ; en-tête avec le bouton Hangar
  await clickText(t, 'Niveaux');
  await waitForScreen(t, 'select');
  await assertNoPageScroll(t, `choix du niveau ${tag}`);
  const S = '.screens [data-screen="select"].is-active';
  await assertLayout(
    t,
    [`${S} .screen-header .btn-round`, `${S} .screen-title`, `${S} .select-total`, `${S} .select-hangar`, `${S} .select-hangar .btn-label`, `${S} .select-hangar .btn-sub`, `${S} .card`, `${S} .card-title`, `${S} .card-sub`],
    `choix du niveau ${tag}`,
  );
  await assertParts(
    t,
    [
      ['retour', `${S} .screen-header .btn-round`],
      ['titre', `${S} .screen-title`],
      ['Hangar', `${S} .select-hangar`],
      ['étoiles', `${S} .select-total`],
    ],
    `en-tête du choix du niveau ${tag}`,
  );
  const cards = await rects(t, `${S} .card`);
  assertEq(cards.length, 4, `choix du niveau ${tag} : cartes visibles`);
  assertDisjoint(cards.map((c, i) => ({ name: `carte ${i + 1}`, r: c })), `choix du niveau ${tag}`);
  await t.shot(`select-${tag}`);
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // --- Carte d'intro (JOUER : Jungle), mesurée une fois ses animations d'entrée finies (~1,1 s sur 2,2 s)
  await press(t, 'title', 'Jouer');
  const I = '.screens [data-screen="intro"].is-active';
  await waitFor(
    t,
    (sel) => {
      const s = document.querySelector(`${sel}:not(.is-leaving)`);
      const f = document.querySelector('.fader');
      return !!s && !(f && f.classList.contains('is-on'));
    },
    { timeout: 10000, interval: 50, label: `carte d'intro ${tag}`, arg: I },
  );
  await t.wait(950);
  await assertNoPageScroll(t, `carte d'intro ${tag}`);
  await assertLayout(t, [`${I} .intro-card`, `${I} .intro-title`, `${I} .intro-hint`, `${I} .intro-skip`], `carte d'intro ${tag}`);
  assertEq(await t.ev((sel) => document.querySelectorAll(`${sel} .intro-weapon`).length, I), 0, `carte d'intro ${tag} : plus de ligne Arme (plan 03)`);
  await assertParts(
    t,
    [
      ['titre', `${I} .intro-title`],
      ['consigne', `${I} .intro-hint`],
      ['« Touche l’écran »', `${I} .intro-skip`],
    ],
    `carte d'intro ${tag}`,
  );
  await t.shot(`intro-${tag}`);

  // --- En jeu : HUD et commandes tactiles dans l'écran, sans chevauchement
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitHud(t, 'platform');
  await assertNoPageScroll(t, `jeu ${tag}`);
  await assertLayout(t, ['.xr-dpad', '.xr-jump', '.xr-fire', '.hud-pause', '.hud-platform .hud-chip'], `jeu ${tag}`);
  await assertParts(
    t,
    [
      ['stick', '.xr-dpad'],
      ['SAUT', '.xr-jump'],
      ['TIR', '.xr-fire'],
      ['PAUSE', '.hud-pause'],
      ['HUD', '.hud-platform .hud-stats'],
    ],
    `jeu ${tag}`,
  );
  await t.shot(`play-${tag}`);

  // --- Trois bonus actifs (vitesse, cadence, bouclier ; aides DEV) : jauge, anneaux et pause sans chevauchement
  if (t.dev) {
    await checkPowers(t, `jeu ${tag}, trois bonus`);
    await t.shot(`play-powers-${tag}`);
  } else {
    t.log(`jeu ${tag} : bonus non testés (aides DEV absentes du build de production)`);
  }

  // --- Menu Pause : panneau et boutons entiers
  await t.key('Escape', 60);
  await waitPause(t, true);
  await t.wait(350); // fin de l'animation d'ouverture du panneau (mise à l'échelle)
  const P = '.overlay.pause.is-open';
  await assertLayout(t, [`${P} .pause-panel`, `${P} .pause-title`, `${P} .btn`, `${P} .btn-label`], `pause ${tag}`);
  const pauseButtons = await rects(t, `${P} .btn`);
  assertEq(pauseButtons.length, 4, `pause ${tag} : REPRENDRE, RECOMMENCER, OPTIONS, QUITTER visibles`);
  assertDisjoint(pauseButtons.map((b) => ({ name: b.text, r: b })), `pause ${tag}`);
  await t.shot(`pause-${tag}`);
}

/** Trois bonus donnés (aides DEV) : jauge de chauffe, anneaux, bouton pause et pastille du HUD disjoints. */
async function checkPowers(t, label) {
  await t.ev(() => ['speed', 'rapid', 'shield'].forEach((k) => window.__xr2d.power(k)));
  await waitFor(t, () => document.querySelectorAll('.hud-powers .hud-power.is-on').length === 3, { timeout: 3000, label: `${label} : trois anneaux de bonus` });
  await t.wait(350); // apparition des anneaux (mise à l'échelle)
  await assertLayout(t, ['.hud-heat', '.hud-powers', '.hud-power.is-on', '.hud-pause', '.hud-platform .hud-stats', '.hud-hearts'], label);
  await assertParts(
    t,
    [
      ['jauge', '.hud-heat'],
      ['bonus', '.hud-powers'],
      ['PAUSE', '.hud-pause'],
      ['HUD', '.hud-platform .hud-stats'],
    ],
    label,
  );
}

/**
 * Modifie la sauvegarde (localStorage) ; prise en compte au prochain chargement de la page. Sauvegarde absente ou
 * illisible : version 2 vide. Les champs de `patch` remplacent ceux de la sauvegarde (`settings` : fusionnés) ;
 * la sauvegarde est écrite en version 2 (une version 1 complétée reste lisible : mêmes champs de base).
 */
function patchSave(t, patch) {
  return t.ev((p) => {
    const KEY = 'xeno-rift-save-v1';
    let save = null;
    try {
      save = JSON.parse(localStorage.getItem(KEY));
    } catch {
      save = null;
    }
    if (!save || (save.version !== 1 && save.version !== 2)) save = { version: 2, unlocked: 0, best: {}, settings: {} };
    const { settings, ...rest } = p;
    Object.assign(save, rest, { version: 2 });
    if (settings) save.settings = { ...save.settings, ...settings };
    localStorage.setItem(KEY, JSON.stringify(save));
  }, patch);
}

/** Modifie les réglages de la sauvegarde ; pris en compte au prochain chargement de la page. */
function patchSavedSettings(t, patch) {
  return patchSave(t, { settings: patch });
}

const TOUCH_VARIANTS = [
  { tag: 'lefty', settings: { leftHanded: true, touchSize: 1 } },
  { tag: 'big', settings: { leftHanded: false, touchSize: 2 } },
  { tag: 'lefty-big', settings: { leftHanded: true, touchSize: 2 } },
];

/** Commandes tactiles en jeu avec les réglages gaucher / grand, posés dans la sauvegarde avant le chargement. */
async function checkTouchVariants(t, w, h) {
  const size = `${w}x${h}`;
  await t.page.setViewportSize({ width: w, height: h });
  let baseW = 0;
  for (const v of TOUCH_VARIANTS) {
    const tag = `${v.tag} ${size}`;
    await patchSavedSettings(t, v.settings);
    await t.goto('?touch=1&unlock=1&stage=j1');
    await waitHud(t, 'platform');
    await assertNoPageScroll(t, `jeu ${tag}`);
    const lefty = await t.ev(() => document.getElementById('touch-root').classList.contains('xr-touch--lefty'));
    assertEq(lefty, v.settings.leftHanded, `jeu ${tag} : classe xr-touch--lefty`);
    await assertLayout(t, ['.xr-dpad', '.xr-jump', '.xr-fire', '.hud-pause', '.hud-platform .hud-chip'], `jeu ${tag}`);
    const ctrls = await assertParts(
      t,
      [
        ['stick', '.xr-dpad'],
        ['SAUT', '.xr-jump'],
        ['TIR', '.xr-fire'],
        ['PAUSE', '.hud-pause'],
        ['HUD', '.hud-platform .hud-stats'],
      ],
      `jeu ${tag}`,
    );
    const [stick, jump, fire] = ctrls.map((c) => c.r);
    const cx = (r) => r.x + r.w / 2;
    if (v.settings.leftHanded) {
      assert(cx(stick) > w / 2 && cx(jump) < w / 2 && cx(fire) < w / 2, `jeu ${tag} : stick à droite, SAUT et TIR à gauche (${JSON.stringify({ stick, jump, fire })})`);
    } else {
      assert(cx(stick) < w / 2 && cx(jump) > w / 2 && cx(fire) > w / 2, `jeu ${tag} : stick à gauche, SAUT et TIR à droite (${JSON.stringify({ stick, jump, fire })})`);
    }
    const radius = await t.ev(() => getComputedStyle(document.querySelector('.xr-dpad')).borderRadius);
    assert(Math.abs(stick.w - stick.h) < 1 && radius === '50%', `jeu ${tag} : stick rond (${stick.w}x${stick.h}, border-radius ${radius})`);
    if (v.settings.touchSize === 1) baseW = stick.w;
    else if (baseW > 0) {
      assert(Math.abs(stick.w - baseW * 1.2) <= 1.5, `jeu ${tag} : stick 20 % plus grand au cran « grand » (${stick.w} pour ${baseW} au cran moyen)`);
    }
    await t.shot(`play-${v.tag}-${size}`);
    if (v.settings.leftHanded && v.settings.touchSize === 2) await checkFlightLefty(t, w, h);
  }
  await patchSavedSettings(t, { leftHanded: false, touchSize: 1 });
}

/** Vol en mode gaucher, cran « grand » : joystick (au repos) à droite, TURBO à gauche, rien ne chevauche le HUD. */
async function checkFlightLefty(t, w, h) {
  const tag = `vol lefty-big ${w}x${h}`;
  await t.goto('?touch=1&unlock=1&stage=f1');
  await waitHud(t, 'flight', { timeout: 60000 });
  await assertNoPageScroll(t, tag);
  const list = await checkFlightHud(t, tag);
  const [boost, base] = list.map((c) => c.r);
  const cx = (r) => r.x + r.w / 2;
  assert(cx(base) > w / 2 && cx(boost) < w / 2, `${tag} : joystick à droite, TURBO à gauche (${JSON.stringify({ boost, base })})`);
  await t.shot(`flight-lefty-big-${w}x${h}`);
}

/** HUD du vol et commandes tactiles dans l'écran, sans chevauchement (TURBO, joystick, PAUSE, HUD gauche et centre). */
async function checkFlightHud(t, tag) {
  const sels = [
    ['TURBO', '.xr-boost'],
    ['joystick', '.xr-stick-base'],
    ['PAUSE', '.hud-pause'],
    ['HUD gauche', '.fl-left'],
    ['HUD centre', '.fl-center'],
  ];
  await assertLayout(t, [...sels.map((s) => s[1]), '.fl-pips', '.fl-pip'], tag);
  return assertParts(t, sels, tag);
}

// ---------------------------------------------------------------- Plan 03 : HUD à 5 cœurs et 5 boucliers, résultats

/** Sauvegarde v2 : 2 cœurs et 2 boucliers achetés (HUD les plus chargés), grosse réserve. */
const RICH = { crystals: 12345, extraHearts: 2, ship: { gun: 3, shield: 2, boost: 2 } };

async function checkRichHud(t, w, h) {
  const tag = `${w}x${h}, 5 cœurs`;
  await t.page.setViewportSize({ width: w, height: h });
  await patchSave(t, RICH);
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitHud(t, 'platform');
  await waitFor(t, () => document.querySelectorAll('.hud-hearts .hud-heart:not(.is-empty)').length === 5, { timeout: 3000, label: `jeu ${tag} : 5 cœurs au HUD` });
  await assertNoPageScroll(t, `jeu ${tag}`);
  await assertLayout(t, ['.xr-dpad', '.xr-jump', '.xr-fire', '.hud-pause', '.hud-platform .hud-chip', '.hud-hearts', '.hud-heart'], `jeu ${tag}`);
  await assertParts(
    t,
    [
      ['stick', '.xr-dpad'],
      ['SAUT', '.xr-jump'],
      ['TIR', '.xr-fire'],
      ['PAUSE', '.hud-pause'],
      ['HUD', '.hud-platform .hud-stats'],
      ['jauge', '.hud-heat'],
    ],
    `jeu ${tag}`,
  );
  if (t.dev) await checkPowers(t, `jeu ${tag}, trois bonus`);
  await t.shot(`play-5-hearts-${w}x${h}`);

  // Résultats (aides DEV) : 53 cristaux ramassés, réserve à 5 chiffres : ligne Réserve entière
  if (t.dev) {
    await t.ev(() => {
      const s = window.__xr2d.scene;
      for (let i = 0; i < 53; i++) s.collectCrystal(s.player.x, s.player.feetY - 30);
      window.__xr2d.win();
    });
    await waitForScreen(t, 'results', { timeout: 25000 });
    const R = '.screens [data-screen="results"].is-active';
    await t.page.locator(`${R} .results-panel`).click({ position: { x: 8, y: 8 } }); // fin des animations
    await waitFor(t, (sel) => document.querySelector(`${sel} .detail--bank .detail-value`).textContent.replace(/\D/g, '') === '12398', { timeout: 3000, label: `résultats ${w}x${h} : réserve 12 398`, arg: R });
    await assertNoPageScroll(t, `résultats ${w}x${h}`);
    await assertLayout(t, [`${R} .detail`, `${R} .detail--bank .detail-label`, `${R} .detail--bank .detail-gain`, `${R} .detail--bank .detail-value`, `${R} .results-actions .btn-label`], `résultats ${w}x${h}`);
    await assertParts(
      t,
      [
        ['Réserve', `${R} .detail--bank .detail-label`],
        ['gain', `${R} .detail--bank .detail-gain`],
        ['total', `${R} .detail--bank .detail-value`],
      ],
      `ligne Réserve ${w}x${h}`,
    );
    const gain = await t.ev((sel) => document.querySelector(`${sel} .detail-gain`).textContent, R);
    assertEq(gain, '+53 cristaux', `résultats ${w}x${h} : gain`);
    await t.shot(`results-bank-${w}x${h}`);
  }

  await t.goto('?touch=1&unlock=1&stage=f1');
  await waitHud(t, 'flight', { timeout: 60000 });
  await waitFor(t, () => document.querySelectorAll('.fl-pips .fl-pip:not(.is-empty)').length === 5, { timeout: 3000, label: `vol ${w}x${h} : 5 boucliers au HUD` });
  await assertNoPageScroll(t, `vol ${w}x${h}, 5 boucliers`);
  await checkFlightHud(t, `vol ${w}x${h}, 5 boucliers`);
  await t.shot(`flight-5-shields-${w}x${h}`);
}

// ---------------------------------------------------------------- Plan 03 : hangar

/**
 * Mise en page du hangar actif : chaque élément du contenu de la liste est amené à l'écran (la liste défile),
 * puis il doit tenir dans la liste, et ses textes et boutons dans sa carte (texte et boutons disjoints) ; en-tête,
 * aperçu, onglets et départ dans la fenêtre et disjoints ; cibles tactiles d'au moins MIN_TARGET px. Renvoie
 * { problems, scroll : la liste défile-t-elle, n : éléments vérifiés }.
 */
function hangarProblems(t) {
  return t.ev(
    ([sel, minT]) => {
      const s = document.querySelector(sel);
      const out = [];
      const W = window.innerWidth;
      const H = window.innerHeight;
      const R = (e) => e.getBoundingClientRect();
      const shown = (e) => {
        const r = R(e);
        const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
      };
      const label = (e) => `${(e.getAttribute('class') || e.tagName).split(' ')[0]} « ${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28)} »`;
      const box = (r) => `[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}]`;
      const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      const meet = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      // Parties fixes : dans la fenêtre, disjointes.
      const fixed = [...s.querySelectorAll('.screen-header .btn-round, .screen-title, .hg-wallet, .hg-stage, .hg-depart, .hg-tabs, .hg-list')].filter(shown);
      for (const e of fixed) {
        const r = R(e);
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`${label(e)} hors de la fenêtre ${box(r)}`);
      }
      for (let i = 0; i < fixed.length; i++) {
        for (let j = i + 1; j < fixed.length; j++) {
          if (meet(R(fixed[i]), R(fixed[j]))) out.push(`${label(fixed[i])} et ${label(fixed[j])} se chevauchent`);
        }
      }
      // Aperçu : zone de dessin utile (au moins 100 x 60 px), canvas à sa taille, dans la baie.
      const stage = s.querySelector('.hg-stage');
      const host = s.querySelector('.hg-canvas');
      const cv = s.querySelector('.hg-canvas-el');
      if (!cv) out.push('aperçu : canvas absent');
      else {
        const hr = R(host);
        if (hr.width < 100 || hr.height < 60) out.push(`aperçu trop petit ${box(hr)} (minimum 100x60)`);
        if (cv.width <= 1 || cv.height <= 1) out.push(`canvas de l'aperçu vide (${cv.width}x${cv.height})`);
        if (!inside(R(cv), R(stage))) out.push(`canvas de l'aperçu hors de la baie ${box(R(cv))} / ${box(R(stage))}`);
      }
      // Textes fixes qui ne doivent pas être coupés.
      for (const e of s.querySelectorAll('.screen-title, .hg-tab-label, .hg-caption-title, .hg-caption-sub, .hg-depart .btn-label, .hg-depart .btn-sub, .hg-wallet-n')) {
        if (!shown(e)) continue;
        const p = e.closest('.hg-tab, .hg-stage, .hg-depart, .hg-wallet, .screen-header');
        if (p && !inside(R(e), R(p))) out.push(`${label(e)} sort de ${label(p)}`);
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') out.push(`${label(e)} coupé (${e.scrollWidth} > ${e.clientWidth})`);
      }
      // Cibles tactiles.
      for (const e of s.querySelectorAll('.screen-header .btn-round, .hg-tab, .hg-depart, .hg-weapon, .hg-buy, .hg-equip')) {
        if (!shown(e)) continue;
        const r = R(e);
        if (r.width < minT - 0.5 || r.height < minT - 0.5) out.push(`${label(e)} : cible de ${Math.round(r.width)}x${Math.round(r.height)} px (minimum ${minT})`);
      }
      // Liste : chaque élément amené à l'écran, entier dans la liste ; ses parties dans sa carte.
      const list = s.querySelector('.hg-list');
      const lr = R(list);
      const saved = list.scrollTop;
      list.style.scrollBehavior = 'auto';
      const scroll = list.scrollHeight > list.clientHeight + 1;
      if (list.scrollWidth > list.clientWidth + 1) out.push(`liste plus large que sa boîte (${list.scrollWidth} > ${list.clientWidth})`);
      let n = 0;
      for (const c of list.children) {
        if (!shown(c)) continue;
        c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        n++;
        const cr = R(c);
        if (!inside(cr, lr)) out.push(`${label(c)} ne tient pas dans la liste ${box(cr)} / ${box(lr)}`);
        for (const p of c.querySelectorAll('.hg-item-name, .hg-item-line, .hg-note, .hg-pips, .hg-buy, .hg-equip, .hg-max, .hg-tag, .hg-weapon, .hg-weapon-name, .hg-weapon-state, .hg-section-text, .hg-item-ico')) {
          if (!shown(p)) continue;
          const pr = R(p);
          const host = p.closest('.hg-weapon') && p !== p.closest('.hg-weapon') ? p.closest('.hg-weapon') : c;
          if (!inside(pr, R(host))) out.push(`${label(p)} sort de ${label(host)} ${box(pr)} / ${box(R(host))}`);
        }
        const text = c.querySelector(':scope > .hg-item-text');
        const acts = c.querySelector(':scope > .hg-actions');
        if (text && acts && shown(text) && shown(acts) && meet(R(text), R(acts))) out.push(`${label(c)} : texte et boutons se chevauchent`);
        const ws = [...c.querySelectorAll(':scope > .hg-weapon')];
        for (let i = 1; i < ws.length; i++) if (meet(R(ws[i - 1]), R(ws[i]))) out.push(`${label(ws[i - 1])} et ${label(ws[i])} se chevauchent`);
      }
      list.scrollTop = saved;
      list.style.scrollBehavior = '';
      return { problems: out, scroll, n };
    },
    [HG, MIN_TARGET],
  );
}

async function assertHangar(t, label) {
  await t.wait(450); // entrée des cartes (animation de 380 ms décalée)
  await assertNoPageScroll(t, label);
  const r = await hangarProblems(t);
  if (r.problems.length) throw new Error(`${label} : mise en page du hangar incorrecte : ${r.problems.join(' ; ')}`);
  return r;
}

async function hgClick(t, sel) {
  await t.page.locator(`${HG} ${sel}`).first().click({ timeout: 5000 });
}

/**
 * Établi, liste en haut : la première amélioration doit être entière dans la partie nette de la liste (hors du
 * fondu du bas, 12 px), sans défiler.
 */
async function assertUpgradeInView(t, label) {
  const r = await t.ev((sel) => {
    const list = document.querySelector(`${sel} .hg-list`);
    list.scrollTop = 0;
    const card = list.querySelector('[data-item^="upgrade."]');
    const lr = list.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return { card: [Math.round(cr.top), Math.round(cr.bottom)], list: [Math.round(lr.top), Math.round(lr.bottom)] };
  }, HG);
  assert(r.card[1] <= r.list[1] - 12 + 1, `${label} : première amélioration hors de vue (carte ${fmt(r.card)}, liste ${fmt(r.list)})`);
}

/** Les 3 onglets (Établi avec le laser puis `weapon`, Comète, Kaï), vérifiés ; captures si `shots`. */
async function checkHangarTabs(t, tag, weapon, shots) {
  let r = await assertHangar(t, `hangar ${tag}, Établi`);
  t.log(`hangar ${tag}, Établi : ${r.n} éléments, liste qui défile : ${r.scroll}`);
  await assertUpgradeInView(t, `hangar ${tag}, Établi`);
  if (shots) await t.shot(`hangar-bench-${tag}`);
  await hgClick(t, `.hg-weapon[data-weapon="${weapon}"]`);
  r = await assertHangar(t, `hangar ${tag}, Établi (${weapon})`);
  await assertUpgradeInView(t, `hangar ${tag}, Établi (${weapon})`);
  if (shots) await t.shot(`hangar-bench-${weapon}-${tag}`);
  await hgClick(t, '.hg-tab--ship');
  r = await assertHangar(t, `hangar ${tag}, Comète`);
  if (shots) await t.shot(`hangar-ship-${tag}`);
  await hgClick(t, '.hg-tab--kai');
  r = await assertHangar(t, `hangar ${tag}, Kaï`);
  if (shots) await t.shot(`hangar-kai-${tag}`);
  await hgClick(t, '.hg-tab--bench');
  await hgClick(t, '.hg-weapon[data-weapon="laser"]');
}

/** Confirmation d'achat (Dégâts du laser) : boîte et boutons entiers, disjoints ; Échap la ferme. */
async function checkHangarConfirm(t, tag, shots) {
  await hgClick(t, '[data-buy="upgrade.laser.damage"]');
  await waitFor(t, (s) => !!document.querySelector(`${s} .hg-confirm.is-open`), { timeout: 2000, label: `confirmation ${tag}`, arg: HG });
  await t.wait(350); // ouverture de la boîte
  const C = `${HG} .hg-confirm.is-open`;
  // Les libellés plutôt que les boutons : le reflet animé de .btn-primary (::after décalé) grossit leur scrollWidth.
  await assertLayout(t, [`${C} .confirm-box`, `${C} .confirm-title`, `${C} .confirm-text`, `${C} .hg-confirm-funds`, `${C} .confirm-actions .btn-text`, `${C} .btn-label`], `confirmation ${tag}`);
  const btns = await rects(t, `${C} .confirm-actions .btn`);
  assertEq(btns.length, 2, `confirmation ${tag} : Annuler et Acheter`);
  assertDisjoint(btns.map((b) => ({ name: b.text, r: b })), `confirmation ${tag}`);
  for (const b of btns) assert(b.w >= MIN_TARGET && b.h >= MIN_TARGET, `confirmation ${tag} : bouton ${b.text} de ${Math.round(b.w)}x${Math.round(b.h)} px`);
  if (shots) await t.shot(`hangar-confirm-${tag}`);
  await t.key('Escape', 60);
  await waitFor(t, (s) => !document.querySelector(`${s} .hg-confirm.is-open`), { timeout: 2000, label: `confirmation ${tag} fermée par Échap`, arg: HG });
}

/** Aperçu chargé (import dynamique) : canvas présent. */
async function waitCanvas(t, tag) {
  await waitFor(t, (s) => !!document.querySelector(`${s} .hg-canvas-el`), { timeout: 5000, label: `hangar ${tag} : aperçu chargé`, arg: HG });
}

async function checkHangar(t, w, h) {
  const tag = `${w}x${h}`;
  const shots = HANGAR_SHOTS.has(tag);
  await t.page.setViewportSize({ width: w, height: h });

  // Hors mode test, depuis les Niveaux : verrous (plan manquant, arme non possédée, Demande Tess / Mira).
  await patchSave(t, { crystals: 12345, unlocked: 1, extraHearts: 0, ship: { gun: 0, shield: 0, boost: 0 }, settings: { unlockAll: false } });
  await t.goto('?touch=1');
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  await t.page.locator('.screens [data-screen="select"].is-active .select-hangar').click({ timeout: 5000 });
  await waitForScreen(t, 'hangar');
  await waitCanvas(t, tag);
  assertEq(await t.ev((s) => !!document.querySelector(`${s} .hg-depart`), HG), false, `hangar ${tag} depuis les Niveaux : pas de départ`);
  await checkHangarTabs(t, `${tag}`, 'machinegun', shots);
  await checkHangarConfirm(t, tag, shots);

  // Mode test, depuis les résultats (aides DEV) : Décoller, Équiper et prix sur la même carte, notes « Mode test ».
  if (t.dev) {
    await t.goto('?touch=1&unlock=1&stage=j1');
    // Partie vraiment lancée (phase, run sans pause, enchaînement fini) : un win() trop tôt peut être perdu.
    await waitFor2dPlay(t);
    await t.ev(() => window.__xr2d.win());
    await waitForScreen(t, 'results', { timeout: 25000 });
    await press(t, 'results', 'Suivant');
    await waitForScreen(t, 'hangar');
    await waitCanvas(t, `${tag}-test`);
    const depart = await t.ev((s) => {
      const d = document.querySelector(`${s} .hg-depart`);
      return d ? d.innerText.replace(/\s+/g, ' ').trim() : null;
    }, HG);
    assert(depart && /Décoller/i.test(depart), `hangar ${tag} depuis les résultats : bouton Décoller (${fmt(depart)})`);
    await checkHangarTabs(t, `${tag}-test`, 'shotgun', shots);
  }
}

export default async function (t) {
  for (const [w, h] of SIZES) await checkSize(t, w, h);

  // --- Portrait en pleine partie : invite de rotation, partie en pause
  await pressPause(t, 'Reprendre');
  await waitPause(t, false);
  assert(!(await t.ev(() => document.querySelector('.rotate').classList.contains('is-on'))), 'paysage : pas d’invite de rotation');
  await t.page.setViewportSize({ width: 390, height: 844 });
  await waitFor(
    t,
    () => {
      const r = document.querySelector('.rotate.is-on');
      if (!r) return false;
      const b = r.getBoundingClientRect();
      return getComputedStyle(r).display !== 'none' && b.width >= window.innerWidth - 1 && b.height >= window.innerHeight - 1;
    },
    { timeout: 3000, label: 'invite « Tourne ton téléphone » plein écran en portrait' },
  );
  const msg = await t.ev(() => document.querySelector('.rotate').innerText.replace(/\s+/g, ' ').trim());
  assert(/Tourne ton téléphone/i.test(msg) && /paysage/i.test(msg), `texte de l'invite de rotation (obtenu : ${msg})`);
  await assertLayout(t, ['.rotate-title', '.rotate-sub', '.rotate-art'], 'portrait 390x844');
  await waitPause(t, true);
  await t.shot('portrait-390x844');

  // --- Retour en paysage : invite masquée, la partie reste en pause jusqu'à REPRENDRE
  await t.page.setViewportSize({ width: 740, height: 360 });
  await waitFor(t, () => !document.querySelector('.rotate.is-on'), { timeout: 3000, label: 'invite de rotation masquée en paysage' });
  await t.wait(500);
  await waitPause(t, true);
  await t.shot('landscape-again-paused');
  await pressPause(t, 'Reprendre');
  await waitPause(t, false);

  // --- Réglages des commandes : gaucher, grand, les deux
  for (const [w, h] of SIZES.slice().reverse()) await checkTouchVariants(t, w, h);

  // --- Plan 03 : HUD à 5 cœurs et 5 boucliers, ligne Réserve des résultats, hangar
  for (const [w, h] of SIZES.slice().reverse()) await checkRichHud(t, w, h);
  for (const [w, h] of HANGAR_SIZES) await checkHangar(t, w, h);
}
