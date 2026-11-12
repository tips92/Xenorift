// Campagne complète depuis l'accueil, sauvegarde neuve : JOUER → prologue (cinématique, coupée par Passer après
// 1,5 s ; marque « prologue ») → carte d'intro → Lisière de Xéna (4 cristaux, pause
// → RECOMMENCER : la partie repart du début, compte de cristaux remis à zéro ; 3 cristaux) → Blob-roi vaincu dans son
// arène, puis Kaï court jusqu'à la balise de LUMA (« Boss vaincu +2 000 », « +3 cristaux ») → SUIVANT → hangar
// (réserve 3, REDESCENDRE vers la Canopée des spores ; Échap ramène aux résultats, figés) → j2 (arrivée par le
// faisceau, victoire par la balise, aucun cristal ; « Équipière : Tess ») → SUIVANT → hangar (Tess à l'Établi,
// REDESCENDRE vers le Sanctuaire du gardien) → j3 (faisceau ; victoire = défaite de la méduse-baleine dans la scène,
// à sa hauteur et dans la vue, sans sortie ; puis la libération (cinématique, bandeau de la compétence, coupée par
// Échap ; marque « liberation-1 ») : « Compétence : double saut », « Boss vaincu +5 000 ») → SUIVANT → hangar
// (DÉCOLLER vers le Vol 1) → Vol 1
// gagné
// aussitôt (réserve + cristaux ramassés avant la victoire, 0 en général ; récompense « Plan : pompe ») →
// SUIVANT → hangar
// (ATTERRIR vers la Lune) → Lune : 5 cristaux ramassés, 3 vies perdues → « MISSION ÉCHOUÉE » (Plus de vies ! ;
// réserve inchangée, les cristaux de la tentative sont perdus) → RÉESSAYER (3 vies, 2 cristaux) → victoire par la
// Comète (réserve + cristaux de la nouvelle tentative seulement) → SUIVANT → hangar (DÉCOLLER vers le Vol 2) → Vol 2
// → SUIVANT (pas de hangar après la dernière étape) → « FIN DE LA DÉMO » avec le score total (somme des records) et
// les étoiles (3 par étape : n/18) → MENU → accueil qui propose de continuer. Étapes réussies et ouvertes lues dans
// __xrShell.info().stages, au départ et après chaque victoire, comparées à la règle (hors mode test : ouverte = la
// première, une réussie ou la suivante d'une réussie) ; la fin vérifie que le parcours a joué toutes les étapes. Les
// victoires et les morts passent par les aides DEV (__xr2d.boss.enter / win en j1 ; __xr2d.win, qui mène à la sortie
// du niveau : balise en j2, Comète en m1, et en j3 amène Kaï dans l'arène puis termine par la défaite du gardien ;
// kill ; __xr3d.win).
import {
  activeScreen,
  assert,
  assertEq,
  player2d,
  readSave,
  screenText,
  waitFor,
  waitFor2dPlay,
  waitFor3dPhase,
  waitForScreen,
} from '../lib/helpers.mjs';
import { hudPlatform, nextViaHangar, press, pressPause, resultDetails, skipCutscene, waitPause } from '../lib/core.mjs';

export const meta = {
  title: 'Campagne : accueil → prologue → j1 → j2 → j3 → libération → f1 → m1 (échec, RÉESSAYER) → f2 → fin de la démo',
  suites: ['full'],
  dev: true,
  timeoutMs: 270000,
};

/** Cinématique `id` affichée, fondu fini, son horloge au-delà de `s` secondes : renvoie __xrShell.info().cutscene. */
function waitCutscene(t, id, s) {
  return waitFor(
    t,
    ([want, at]) => {
      const i = window.__xrShell.info();
      const f = document.querySelector('.fader');
      return i.screen === 'cutscene' && i.cutscene && i.cutscene.id === want && i.cutscene.time >= at && !(f && f.classList.contains('is-on'))
        ? i.cutscene
        : false;
    },
    { timeout: 30000, label: `cinématique ${id} au-delà de ${s} s`, arg: [id, s] },
  );
}

/** Carte d'intro de l'étape affichée (fondu terminé) ; renvoie son texte. Pendant l'intro l'enchaînement reste verrouillé. */
async function waitIntro(t, title) {
  await waitFor(
    t,
    () => {
      const s = document.querySelector('.screens [data-screen="intro"].is-active:not(.is-leaving)');
      const f = document.querySelector('.fader');
      return !!s && !(f && f.classList.contains('is-on'));
    },
    { timeout: 20000, label: `carte d'intro de « ${title} »` },
  );
  const text = await screenText(t, 'intro');
  assert(text.includes(title), `carte d'intro de « ${title} » attendue (texte : ${text.slice(0, 160)})`);
  return text;
}

/** Cristaux comptés comme ramassés par Kaï (scene.collectCrystal, comme au contact d'un cristal). */
function collect(t, n) {
  return t.ev((k) => {
    const s = window.__xr2d.scene;
    for (let i = 0; i < k; i++) s.collectCrystal(s.player.x, s.player.feetY - 30);
    return s.crystals;
  }, n);
}

const bankNow = (t) => t.ev(() => window.__xrShell.info().crystals);

/**
 * Étapes réussies et ouvertes (`__xrShell.info().stages`, `[[id, cleared, unlocked], …]`) : réussies = `cleared`,
 * ouvertes = la première, une réussie ou la suivante d'une réussie (core/save.ts, hors mode test).
 */
async function assertProgress(t, cleared, label) {
  const got = await t.ev(() => window.__xrShell.info().stages.map((s) => [s.id, s.cleared, s.unlocked]));
  const want = got.map(([id], i) => [id, cleared.includes(id), i === 0 || cleared.includes(id) || cleared.includes(got[i - 1][0])]);
  assertEq(got, want, `progression ${label}`);
}

/** « Suivant » des résultats → hangar : vérifie le bouton de départ (libellé et étape), puis le touche. */
async function departTo(t, label, title) {
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'hangar');
  const depart = await t.ev(() => document.querySelector('.screens [data-screen="hangar"].is-active .hg-depart').innerText.replace(/\s+/g, ' ').trim());
  assert(new RegExp(label, 'i').test(depart) && depart.includes(title), `hangar : bouton « ${label} » vers ${title} (${depart})`);
  await t.page.locator('.screens [data-screen="hangar"].is-active .hg-depart').click({ timeout: 5000 });
}

/** Ligne Réserve des résultats affichés : gain (« +N cristaux » ou null) et total une fois les animations finies. */
async function resultsBank(t) {
  const R = '.screens [data-screen="results"].is-active';
  await t.page.locator(`${R} .results-panel`).click({ position: { x: 8, y: 8 } }); // fin des animations
  return t.ev((s) => {
    const r = document.querySelector(s);
    const g = r.querySelector('.detail-gain');
    return { gain: g ? g.textContent.trim() : null, bank: Number(r.querySelector('.detail--bank .detail-value').textContent.replace(/\D/g, '')) };
  }, R);
}

/** Victoire 2D (__xr2d.win : sortie du niveau, `kind` attendu, état exit) → écran « NIVEAU TERMINÉ ». */
async function win2d(t, label, kind) {
  const exit = await t.ev(() => {
    window.__xr2d.win();
    const s = window.__xr2d.scene;
    return { kind: s.exit && s.exit.kind, state: s.state };
  });
  assertEq(exit, { kind, state: 'exit' }, `${label} : sortie du niveau`);
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `${label} : écran « NIVEAU TERMINÉ » attendu (texte : ${text.slice(0, 160)})`);
}

/**
 * j1 : arène du Blob-roi (Kaï posé dedans, boss vaincu : aides DEV), puis Kaï court jusqu'à la balise de LUMA →
 * « NIVEAU TERMINÉ » avec la ligne « Boss vaincu +2 000 ».
 */
async function bossWin(t, label) {
  await t.ev(() => {
    window.__xr2d.god(true);
    window.__xr2d.boss.enter();
  });
  await waitFor(t, () => window.__xr2d.boss.info().state === 'fight', { timeout: 5000, label: `${label} : combat du boss commencé` });
  await t.ev(() => window.__xr2d.boss.win());
  await t.page.keyboard.down('ArrowRight');
  try {
    await waitFor(t, () => window.__xr2d.scene.state === 'exit' && window.__xr2d.scene.exit.kind === 'beacon', { timeout: 10000, label: `${label} : balise atteinte en courant` });
  } finally {
    await t.page.keyboard.up('ArrowRight');
  }
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `${label} : écran « NIVEAU TERMINÉ » attendu (texte : ${text.slice(0, 160)})`);
  const prime = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .results-bonus-value');
    return e ? e.textContent.replace(/\s/g, '') : null;
  });
  assertEq(prime, '+2000', `${label} : prime du boss sur les résultats`);
}

/** Vol jusqu'à la phase 'fly' puis victoire (__xr3d.win) → écran « VOL RÉUSSI ». */
/**
 * Vol gagné dès le départ (__xr3d.win) → « VOL RÉUSSI ». Renvoie les cristaux ramassés avant la victoire (0 : rien ne
 * tire sans TIR tenu ; plus aucun ramassage hors de la phase de vol).
 */
async function fly(t, label) {
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  const got = await t.ev(() => {
    window.__xr3d.win();
    return window.__xr3d.info().crystals;
  });
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `${label} : écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
  return got;
}

/** Gain affiché aux résultats pour n cristaux (rien sous 1). */
const gainText = (n) => (n > 0 ? `+${n} ${n >= 2 ? 'cristaux' : 'cristal'}` : null);

export default async function (t) {
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
  const title = await screenText(t, 'title');
  assert(/Nouvelle aventure/i.test(title), `sauvegarde neuve : JOUER doit annoncer « Nouvelle aventure » (texte : ${title})`);
  /** Étapes jouées et réussies par le parcours, dans l'ordre. */
  const played = [];
  await assertProgress(t, played, 'au départ');

  // ---------------------------------------------------------------- Prologue (première étape lancée), puis Jungle (j1)
  await press(t, 'title', 'Jouer');
  await waitCutscene(t, 'prologue', 1.5);
  await t.shot('prologue');
  await skipCutscene(t, () => t.page.locator('.screens [data-screen="cutscene"].is-active .cs-skip').click({ timeout: 5000 }), 'prologue : Passer (clic)');
  await waitIntro(t, 'Lisière de Xéna');
  assertEq((await readSave(t)).story.seen, ['prologue'], 'prologue passé : marque enregistrée');
  await t.shot('intro-j1');
  await waitFor2dPlay(t);
  const start = await player2d(t);
  await t.key('ArrowRight', 700);
  const moved = await player2d(t);
  assert(moved.x > start.x + 80, `j1 : Kaï doit avancer (${Math.round(start.x)} -> ${Math.round(moved.x)})`);
  const c0 = await collect(t, 0);
  assertEq(await collect(t, 4), c0 + 4, 'j1 : 4 cristaux de plus avant RECOMMENCER');

  // Pause → RECOMMENCER : la partie repart (même scène Phaser relancée), Kaï revient au départ
  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Recommencer');
  await waitFor(t, () => !document.querySelector('.overlay.pause'), { timeout: 5000, label: 'menu Pause fermé après RECOMMENCER' });
  await waitFor2dPlay(t);
  const again = await player2d(t);
  t.log(`RECOMMENCER : x ${Math.round(moved.x)} -> ${Math.round(again.x)} (départ ${Math.round(start.x)})`);
  assert(Math.abs(again.x - start.x) < 4, `RECOMMENCER : Kaï doit revenir au départ (x ${Math.round(again.x)}, départ ${Math.round(start.x)})`);
  assert(!(await t.ev(() => !!document.querySelector('.overlay.pause'))), 'RECOMMENCER : le menu Pause doit avoir disparu');
  await t.shot('j1-restarted');
  assertEq(await collect(t, 3), 3, 'RECOMMENCER : compte de cristaux remis à zéro, puis 3 ramassés');
  await bossWin(t, 'j1');
  const j1Bank = await resultsBank(t);
  assertEq(j1Bank, { gain: '+3 cristaux', bank: 3 }, 'j1 : gain de la partie recommencée seulement, réserve 3');
  played.push('j1');
  await assertProgress(t, played, 'après j1');
  await t.shot('j1-results');

  // ---------------------------------------------------------------- Hangar entre j1 et j2
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'hangar');
  const hg = await t.ev(() => {
    const s = document.querySelector('.screens [data-screen="hangar"].is-active');
    const d = s.querySelector('.hg-depart');
    return {
      wallet: Number(s.querySelector('.hg-wallet-n').textContent.replace(/\D/g, '')),
      depart: d ? d.innerText.replace(/\s+/g, ' ').trim() : null,
      crystals: window.__xrShell.info().crystals,
    };
  });
  t.log(`hangar après j1 : ${JSON.stringify(hg)}`);
  assertEq({ wallet: hg.wallet, crystals: hg.crystals }, { wallet: 3, crystals: 3 }, 'hangar : réserve affichée = réserve enregistrée = 3');
  assert(hg.depart && /Redescendre/i.test(hg.depart) && hg.depart.includes('Canopée des spores'), `hangar : bouton « Redescendre » vers j2 (${hg.depart})`);
  await t.shot('hangar-j1');
  // Échap : retour aux résultats, valeurs finales (réserve affichée tout de suite), puis de nouveau le hangar.
  await t.key('Escape', 60);
  await waitForScreen(t, 'results');
  const back = await resultDetails(t);
  assertEq(Number(String(back['Réserve']).replace(/\D/g, '')), 3, `retour du hangar : réserve des résultats (${JSON.stringify(back)})`);
  await nextViaHangar(t);

  // ---------------------------------------------------------------- Canopée des spores (j2) : faisceau, balise
  await waitIntro(t, 'Canopée des spores');
  await waitFor2dPlay(t);
  assertEq(await t.ev(() => window.__xr2d.scene.arrival && window.__xr2d.scene.arrival.kind), 'beam', 'j2 : arrivée par le faisceau de LUMA');
  await win2d(t, 'j2', 'beacon');
  assertEq(await resultsBank(t), { gain: null, bank: 3 }, 'j2 gagné sans cristal : réserve 3');
  assertEq((await resultDetails(t))['Équipière'], 'Tess', 'j2 réussi la première fois : « Équipière : Tess »');
  played.push('j2');
  await assertProgress(t, played, 'après j2');
  await t.shot('j2-results');
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'hangar');
  const tess = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="hangar"].is-active .hg-crew');
    return e ? e.textContent.trim() : null;
  });
  assertEq(tess, 'Tess à l’établi', 'hangar après j2 : Tess à l’Établi');
  await t.key('Escape', 60);
  await waitForScreen(t, 'results');
  await departTo(t, 'Redescendre', 'Sanctuaire du gardien');

  // ---------------------------------------------------------------- Sanctuaire du gardien (j3) : défaite du gardien
  await waitIntro(t, 'Sanctuaire du gardien');
  await waitFor2dPlay(t);
  assertEq(await t.ev(() => window.__xr2d.scene.arrival && window.__xr2d.scene.arrival.kind), 'beam', 'j3 : arrivée par le faisceau de LUMA');
  const guardian = await t.ev(() => {
    window.__xr2d.win();
    const s = window.__xr2d.scene;
    return { exit: s.exit, state: s.state, boss: s.boss.state, atHover: s.boss.y === s.boss.hoverY };
  });
  assertEq(guardian, { exit: null, state: 'exit', boss: 'beaten', atHover: true }, 'j3 : sans sortie, défaite du gardien dans l’arène, à sa hauteur (état exit)');
  // win() la bat pendant son arrivée : sa défaite se joue quand même dans la vue.
  await t.wait(1200);
  const seen = await t.ev(() => {
    const s = window.__xr2d.scene;
    const b = s.boss;
    return { state: s.state, boss: b.state, visible: b.body.visible, inView: b.y + 81 > s.cameras.main.worldView.y };
  });
  assertEq(seen, { state: 'exit', boss: 'beaten', visible: true, inView: true }, 'j3 : défaite visible, gardienne dans la vue 1,2 s après');
  // Libération (première victoire sur j3), avant les résultats : bandeau de la compétence, puis Échap = Passer.
  const lib = await waitCutscene(t, 'liberation', 7.2);
  assertEq(lib.mark, 'liberation-1', 'j3 : libération du monde 1');
  await t.shot('liberation');
  await skipCutscene(t, () => t.key('Escape', 60), 'j3 : Échap = Passer (libération)');
  await waitForScreen(t, 'results', { timeout: 25000 });
  assert((await readSave(t)).story.seen.includes('liberation-1'), 'libération passée : marque enregistrée');
  const j3Text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(j3Text), `j3 : écran « NIVEAU TERMINÉ » attendu (texte : ${j3Text.slice(0, 160)})`);
  assertEq(await resultsBank(t), { gain: null, bank: 3 }, 'j3 gagné sans cristal : réserve 3');
  assertEq((await resultDetails(t))['Compétence'], 'double saut', 'j3 réussi la première fois : « Compétence : double saut »');
  const j3Prime = await t.ev(() => {
    const e = document.querySelector('.screens [data-screen="results"].is-active .results-bonus-value');
    return e ? e.textContent.replace(/\s/g, '') : null;
  });
  assertEq(j3Prime, '+5000', 'j3 : prime du gardien sur les résultats');
  played.push('j3');
  await assertProgress(t, played, 'après j3');
  await t.shot('j3-results');
  await departTo(t, 'Décoller', "Nébuleuse d'Azur");

  // ---------------------------------------------------------------- Vol 1 (f1)
  await waitIntro(t, "Nébuleuse d'Azur");
  // Vol gagné aussitôt, sans tirer : 0 cristal (compté quand même : ceux du vol iraient à la réserve)
  const f1Got = await fly(t, 'f1');
  t.log(`f1 : ${f1Got} cristal(aux) ramassé(s) avant la victoire`);
  assertEq(await resultsBank(t), { gain: gainText(f1Got), bank: 3 + f1Got }, 'f1 : réserve = 3 + cristaux du vol');
  assertEq(await bankNow(t), 3 + f1Got, 'f1 : réserve enregistrée');
  assertEq((await resultDetails(t)).Plan, 'pompe', 'f1 réussi la première fois : « Plan : pompe »');
  played.push('f1');
  await assertProgress(t, played, 'après f1');
  await t.shot('f1-results');
  await departTo(t, 'Atterrir', 'Lune Krator');

  // ---------------------------------------------------------------- Lune (m1) : 3 vies perdues, échec, RÉESSAYER
  await waitIntro(t, 'Lune Krator');
  await waitFor2dPlay(t);
  assertEq((await hudPlatform(t)).lives, 3, 'm1 : vies au départ (HUD)');
  // Cristaux de la tentative ratée : perdus (la réserve ne bouge pas).
  const bank0 = await bankNow(t);
  assertEq(bank0, 3 + f1Got, 'm1 : réserve avant la tentative');
  await collect(t, 5);
  for (let lost = 1; lost <= 3; lost++) {
    await waitFor(t, () => window.__xr2d && window.__xr2d.scene.state === 'play', { timeout: 10000, label: `Kaï en jeu avant la mort n°${lost}` });
    await t.ev(() => window.__xr2d.kill());
    await waitFor(t, (n) => Number(document.querySelector('.hud-lives .hud-num').textContent) === 3 - n, {
      timeout: 3000,
      label: `HUD : ${3 - lost} vie(s) après la mort n°${lost}`,
      arg: lost,
    });
  }
  await waitForScreen(t, 'fail', { timeout: 20000 });
  const fail = await screenText(t, 'fail');
  t.log('échec', fail.slice(0, 120));
  assert(/MISSION ÉCHOUÉE/i.test(fail) && fail.includes('Plus de vies'), `écran « MISSION ÉCHOUÉE / Plus de vies ! » attendu (texte : ${fail.slice(0, 160)})`);
  await t.shot('m1-fail');
  assertEq(await bankNow(t), bank0, 'm1 ratée : cristaux de la tentative perdus, réserve inchangée');
  await press(t, 'fail', 'Réessayer');
  await waitFor2dPlay(t);
  assertEq((await hudPlatform(t)).lives, 3, 'm1 après RÉESSAYER : vies remises à 3 (HUD)');
  await t.shot('m1-retry');
  assertEq(await collect(t, 2), 2, 'm1 après RÉESSAYER : compte remis à zéro, puis 2 cristaux');
  await win2d(t, 'm1', 'ship');
  const m1Picked = Number(String((await resultDetails(t)).Cristaux).split('/')[0]);
  assertEq(m1Picked, 2, 'm1 : cristaux de la nouvelle tentative seulement');
  assertEq(await resultsBank(t), { gain: '+2 cristaux', bank: bank0 + m1Picked }, 'm1 : réserve = avant + nouvelle tentative (les 5 de l’échec perdus)');
  assertEq(await bankNow(t), bank0 + m1Picked, 'm1 : réserve enregistrée');
  played.push('m1');
  await assertProgress(t, played, 'après m1');
  await departTo(t, 'Décoller', "Ceinture d'Orak");

  // ---------------------------------------------------------------- Vol 2 (f2) puis fin de la démo
  await waitIntro(t, "Ceinture d'Orak");
  await fly(t, 'f2');
  played.push('f2');
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'end', { timeout: 20000 });

  const save = await readSave(t);
  const stages = await t.ev(() => window.__xrShell.info().stages);
  const ids = stages.map((s) => s.id);
  assertEq(ids, played, 'étapes de la campagne : toutes jouées par le parcours, dans l’ordre');
  for (const id of ids) assert(save.best[id] && save.best[id].score > 0, `record de ${id} sauvegardé (${JSON.stringify(save.best)})`);
  assert(stages.every((s) => s.cleared && s.unlocked), `toutes les étapes réussies et ouvertes (${JSON.stringify(stages)})`);
  assertEq(save.blueprints, ['shotgun', 'rifle'], 'plans de la pompe (f1) et du fusil (f2) enregistrés');
  assertEq(save.crew, ['tess'], 'Tess dans l’équipage');
  assertEq(save.loadout.skills.doubleJump, true, 'double saut appris');
  assertEq([...save.story.seen].sort(), ['liberation-1', 'prologue', 'tutorial-j1'], 'histoire : prologue, libération et tutoriel vus');
  const maxStars = ids.length * 3;
  const total = ids.reduce((s, id) => s + save.best[id].score, 0);
  const stars = ids.reduce((s, id) => s + save.best[id].stars, 0);
  // Le score total défile (≤ 2,2 s) jusqu'à la somme des records.
  const shown = await waitFor(
    t,
    (want) => {
      const e = document.querySelector('.screens [data-screen="end"] .end-total-n');
      const n = e ? Number(e.textContent.replace(/\D/g, '')) : -1;
      return n === want ? n : false;
    },
    { timeout: 6000, label: `score total affiché = somme des records (${total})`, arg: total },
  );
  const end = await screenText(t, 'end');
  t.log(`fin : total ${shown}, étoiles ${stars}/${maxStars} ; ${end.slice(0, 160)}`);
  assert(/FIN DE LA DÉMO/i.test(end), `écran « FIN DE LA DÉMO » attendu (texte : ${end.slice(0, 160)})`);
  assert(end.includes(`${stars}/${maxStars} étoiles`), `étoiles affichées : « ${stars}/${maxStars} étoiles » attendu (texte : ${end.slice(0, 200)})`);
  await t.shot('ending');

  // ---------------------------------------------------------------- Retour à l'accueil
  await press(t, 'end', 'Menu');
  await waitForScreen(t, 'title');
  assertEq(await activeScreen(t), 'title', 'écran après MENU');
  const title2 = await screenText(t, 'title');
  assert(/Continuer/i.test(title2), `l'accueil doit proposer de continuer après la campagne (texte : ${title2})`);
  await t.shot('title-continue');
}
