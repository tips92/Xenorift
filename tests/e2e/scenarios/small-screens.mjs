// Petits écrans de téléphone en paysage (740x360, 640x320) : accueil, choix du niveau, commandes tactiles et HUD
// en jeu, menu Pause. Rien d'important ne sort de l'écran, n'est coupé ni ne déborde, la page ne défile pas,
// les commandes ne se chevauchent pas. Puis portrait (390x844) en pleine partie : invite « Tourne ton
// téléphone » et partie mise en pause ; retour en paysage : invite masquée, menu Pause, REPRENDRE relance.
// N'utilise pas les aides DEV : passe aussi sur le build de production (--prod).
import { assert, assertEq, clickText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import { assertLayout, overlaps, pressPause, rects, waitHud, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Petits écrans (740x360, 640x320) et portrait : menus, commandes, pause, invite de rotation',
  suites: ['full'],
  timeoutMs: 150000,
  viewport: { width: 740, height: 360 },
};

const SIZES = [
  [740, 360],
  [640, 320],
];

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

  // --- Choix du niveau : 4 cartes côte à côte, entières, sans chevauchement
  await clickText(t, 'Niveaux');
  await waitForScreen(t, 'select');
  await assertNoPageScroll(t, `choix du niveau ${tag}`);
  const S = '.screens [data-screen="select"].is-active';
  await assertLayout(t, [`${S} .screen-header .btn-round`, `${S} .screen-title`, `${S} .select-total`, `${S} .card`, `${S} .card-title`, `${S} .card-sub`], `choix du niveau ${tag}`);
  const cards = await rects(t, `${S} .card`);
  assertEq(cards.length, 4, `choix du niveau ${tag} : cartes visibles`);
  assertDisjoint(cards.map((c, i) => ({ name: `carte ${i + 1}`, r: c })), `choix du niveau ${tag}`);
  await t.shot(`select-${tag}`);
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // --- En jeu : HUD et commandes tactiles dans l'écran, sans chevauchement
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitHud(t, 'platform');
  await assertNoPageScroll(t, `jeu ${tag}`);
  await assertLayout(t, ['.xr-dpad', '.xr-jump', '.xr-fire', '.hud-pause', '.hud-platform .hud-chip'], `jeu ${tag}`);
  const ctrls = [];
  for (const [name, sel] of [
    ['croix', '.xr-dpad'],
    ['SAUT', '.xr-jump'],
    ['TIR', '.xr-fire'],
    ['PAUSE', '.hud-pause'],
    ['HUD', '.hud-platform .hud-stats'],
  ]) {
    ctrls.push({ name, r: await one(t, sel, `jeu ${tag}`) });
  }
  assertDisjoint(ctrls, `jeu ${tag}`);
  await t.shot(`play-${tag}`);

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
}
