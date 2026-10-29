// Progression par identifiants d'étape (plan 04 : choix 2, 5, 16 et 19), sauvegardes injectées avant le chargement.
// Étapes lues sur la page (cartes des Niveaux, dans l'ordre) : verrous, étoiles du monde et total en découlent (ouverte
// = la première, une réussie ou la suivante d'une réussie), quel que soit le nombre d'étapes.
//  A. Sauvegarde neuve : « Nouvelle aventure » ; Niveaux ouverts sur le monde 1 (◀ désactivé), seule j1 ouverte ;
//     toucher une carte verrouillée du monde 2 : message, rien ne démarre ; JOUER → carte d'intro de « Lisière de
//     Xéna » (Échap : retour à l'accueil).
//  B. Version 1 « unlocked: 3 », j1 f1 m1 réussis : j2 (suivante de j1) et f2 (suivante de m1) ouvertes aussi,
//     records et étoiles (cartes, monde, en-tête) ; JOUER → Canopée des spores ; Niveaux ouverts sur le monde 1 ;
//     plan du mitrailleur rendu au chargement (hangar : arme achetable) ; retour du hangar sur la même page ; pages :
//     glissement au doigt commencé sur une carte ouverte (page changée, carte non lancée), petit glissement (la page
//     revient), geste vif, glissement à la souris, flèches du clavier, souris relâchée hors de la zone des pages puis
//     survol sans bouton (pas de glissement fantôme), Entrée sur j1 après un glissement au doigt (son intro) ; carte
//     de f1 touchée → son intro.
//  C. Version 1 « unlocked: 2 », j1 seul réussi : j2 ouverte, f1, m1 et f2 verrouillées (l'index n'ouvre plus
//     rien) ; JOUER → Canopée des spores ; pas de plan.
//  D. Version 2, f1 seul réussi (mode test) : j1 (la première), f1 et m1 ouvertes, j2 et f2 verrouillées ; JOUER →
//     Lisière de Xéna ; plan du mitrailleur, pas de Tess à l'Établi. Version 2, j1 et j2 réussis sans équipage : Tess
//     rendue au chargement (récompense de j2), mentionnée à l'Établi. Version 2 sans records mais avec des marques d'histoire : « Continuer »
//     (pas « Nouvelle aventure ») ; marques relues sans doublon ni valeur invalide, plan et `unlocked` gardés à
//     l'enregistrement suivant (réglage changé).
//  E. Dev seulement (aides DEV ; sauté en --prod) : f1 gagné → résultats avec « Plan : mitrailleur » ; SUIVANT →
//     hangar « Atterrir » vers la Lune Krator ; f1 rejoué et gagné → plus de ligne de récompense.
// Sans aide DEV jusqu'à D : passe aussi sur le build de production (--prod).
import { assert, assertEq, fmt, readSave, waitFor, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { pickStage, press, recordToasts, resultDetails, selectState, toasts, waitSelectPage } from '../lib/core.mjs';
import { touches } from '../lib/touch.mjs';

export const meta = {
  title: 'Progression par identifiants : sauvegardes v1 et v2, verrous, JOUER, records, plan rétroactif, pages des Niveaux',
  suites: ['full'],
  timeoutMs: 240000,
};

const SAVE_KEY = 'xeno-rift-save-v1';
const S = '.screens [data-screen="select"].is-active';
const HG = '.screens [data-screen="hangar"].is-active';
/** Étapes dans l'ordre des cartes des Niveaux (lu à la première ouverture). */
let ORDER = [];

/** Remplace la sauvegarde (null : l'efface) puis recharge l'accueil. */
async function loadSave(t, save) {
  await t.ev(([k, s]) => (s === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(s))), [SAVE_KEY, save]);
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
}

/** Ligne sous JOUER. */
function playSub(t) {
  return t.ev(() => document.querySelector('.screens [data-screen="title"].is-active .btn-primary .btn-sub').textContent.trim());
}

/** Carte d'intro affichée (titre renvoyé), puis Échap : retour à l'accueil avant le lancement de l'étape. */
async function introThenBack(t) {
  await waitFor(
    t,
    () => {
      const s = document.querySelector('.screens [data-screen="intro"].is-active:not(.is-leaving)');
      const f = document.querySelector('.fader');
      return !!s && !(f && f.classList.contains('is-on'));
    },
    { timeout: 10000, interval: 40, label: "carte d'intro" },
  );
  const title = await t.ev(() => document.querySelector('.screens [data-screen="intro"] .intro-title').textContent.trim());
  // Le retour est ignoré pendant un fondu (FADE_MS = 250 ms) ; la carte reste 2,2 s.
  await t.wait(350);
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');
  return title;
}

/** JOUER → titre de la carte d'intro, puis retour à l'accueil. */
async function playTarget(t) {
  await press(t, 'title', 'Jouer');
  return introThenBack(t);
}

async function openSelect(t) {
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  return selectState(t);
}

/** Verrous des cartes, dans l'ordre de ORDER. */
const locks = (sel) => ORDER.map((id) => sel.cards[id].locked);

/** Verrous attendus d'après les étapes réussies (core/save.ts : la première, une réussie, la suivante d'une réussie). */
const lockedBy = (cleared) => ORDER.map((id, i) => !(i === 0 || cleared.includes(id) || cleared.includes(ORDER[i - 1])));

/** Étoiles « n/max » d'un ensemble d'étapes (3 par étape) d'après les records `best`. */
const starsOf = (ids, best) => `${ids.reduce((n, id) => n + (best[id] ? best[id].stars : 0), 0)}/${ids.length * 3}`;

/** Hangar ouvert depuis les Niveaux : état du mitrailleur sur l'Établi (« Plan manquant » ou son prix). */
async function machinegunState(t) {
  await t.page.locator(`${S} .select-hangar`).click({ timeout: 5000 });
  await waitForScreen(t, 'hangar');
  return t.ev((h) => document.querySelector(`${h} .hg-weapon[data-weapon="machinegun"] .hg-weapon-state`).textContent.trim(), HG);
}

/** Hangar affiché : mention de l'équipière à l'Établi (« Tess à l’établi »), ou null. */
function crewMention(t) {
  return t.ev((h) => {
    const e = document.querySelector(`${h} .hg-crew`);
    return e ? e.textContent.trim() : null;
  }, HG);
}

/** Toujours l'écran Niveaux, sans carte d'intro, `ms` après un geste. */
async function stillSelect(t, label, ms = 500) {
  await t.wait(ms);
  const shown = await t.ev(() => [...document.querySelectorAll('.screens [data-screen].is-active')].map((s) => s.dataset.screen));
  assertEq(shown, ['select'], `${label} : la carte touchée ne doit pas lancer l'étape`);
}

/** Glissement au doigt (CDP) de `dx` px en `steps` pas, commencé au centre de la carte `id`. */
async function swipe(t, id, dx, steps) {
  const r = await t.ev((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, `${S} .card[data-stage="${id}"]`);
  const f = touches(t);
  await f.start([[r.x, r.y, 1]]);
  for (let i = 1; i <= steps; i++) {
    await f.move([[r.x + (dx * i) / steps, r.y + i, 1]]);
    await t.wait(16);
  }
  await f.end();
}

export default async function (t) {
  await recordToasts(t);
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');

  // ---------------------------------------------------------------- A. Sauvegarde neuve
  await loadSave(t, null);
  assertEq(await playSub(t), 'Nouvelle aventure', 'sauvegarde neuve : JOUER');
  let sel = await openSelect(t);
  ORDER = sel.order;
  t.log(`étapes : ${ORDER.join(' ')}`);
  for (const id of ['j1', 'j2', 'j3', 'f1', 'm1', 'f2']) assert(ORDER.includes(id), `carte de ${id} dans les Niveaux (${fmt(ORDER)})`);
  assertEq(ORDER[0], 'j1', 'première carte : j1');
  /** Cartes d'une page (monde). */
  const worldOf = (w) => ORDER.filter((id) => sel.cards[id].world === w);
  const W1 = worldOf(1);
  const W2 = worldOf(2);
  assertEq({ world: sel.world, prev: sel.prev, next: sel.next }, { world: 1, prev: { disabled: true }, next: { disabled: false } }, 'sauvegarde neuve : monde 1');
  assertEq(locks(sel), lockedBy([]), 'sauvegarde neuve : seule j1 ouverte');
  assertEq(sel.cards.j1.sub, 'Monde 1 · Niveau 1', 'sous-titre de j1');
  assertEq(sel.cards.f2.sub, 'Monde 2 · Vol', 'sous-titre de f2');
  await t.page.locator(`${S} .select-next`).click();
  await waitSelectPage(t, 2);
  const n0 = (await toasts(t)).length;
  await t.page.locator(`${S} .card[data-stage="m1"]`).click();
  await waitFor(t, (n) => (window.__xrToasts || []).slice(n).some((m) => /Termine l.étape précédente/.test(m.text)), {
    timeout: 3000,
    label: 'message « Termine l’étape précédente… »',
    arg: n0,
  });
  await stillSelect(t, 'carte verrouillée', 200);
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');
  assertEq(await playTarget(t), 'Lisière de Xéna', 'sauvegarde neuve : JOUER → j1');

  // ---------------------------------------------------------------- B. v1 « unlocked: 3 », j1 f1 m1 réussis
  const bestB = { j1: { score: 4321, stars: 3 }, f1: { score: 2500, stars: 2 }, m1: { score: 1800, stars: 1 } };
  await loadSave(t, { version: 1, unlocked: 3, best: bestB, settings: {} });
  assertEq(await playSub(t), 'Continuer · Canopée des spores', 'v1 unlocked 3 : JOUER (j2, ouverte par j1 et pas réussie)');
  sel = await openSelect(t);
  t.log(`v1 unlocked 3 : ${fmt({ world: sel.world, name: sel.name, worldStars: sel.worldStars, total: sel.total })}`);
  assertEq(locks(sel), lockedBy(Object.keys(bestB)), 'v1 unlocked 3 : réussies et suivantes ouvertes');
  assertEq([sel.cards.j2.locked, sel.cards.f2.locked], [false, false], 'v1 unlocked 3 : j2 et f2 ouvertes');
  const REC = { j1: ['4 321', 3], f1: ['2 500', 2], m1: ['1 800', 1] };
  assertEq(
    ORDER.map((id) => [sel.cards[id].best, sel.cards[id].stars]),
    ORDER.map((id) => REC[id] || ['—', 0]),
    'v1 unlocked 3 : records et étoiles des cartes',
  );
  assert(/record 4\s?321/.test(sel.cards.j1.label), `aria-label de j1 avec son record (${sel.cards.j1.label})`);
  assertEq(
    { world: sel.world, name: sel.name, worldStars: sel.worldStars, total: sel.total },
    { world: 1, name: 'Monde 1 · Jungle de Xéna', worldStars: starsOf(W1, bestB), total: starsOf(ORDER, bestB) },
    'v1 unlocked 3 : ouvert sur le monde de j2',
  );
  assertEq(await machinegunState(t), '80', 'v1 avec f1 réussi : plan du mitrailleur rendu au chargement (arme achetable)');
  await t.key('Escape', 40);
  await waitForScreen(t, 'select');
  assertEq((await selectState(t)).world, 1, 'retour du hangar : même page (monde 1)');
  await t.shot('select-world1-records');

  // Glissement au doigt commencé sur une carte ouverte (f1) : page suivante, f1 non lancée.
  await swipe(t, 'f1', -300, 12);
  await waitSelectPage(t, 2);
  await stillSelect(t, 'glissement vers la gauche');
  sel = await selectState(t);
  assertEq({ name: sel.name, worldStars: sel.worldStars }, { name: 'Monde 2 · Lune Krator', worldStars: starsOf(W2, bestB) }, 'monde 2 après le glissement');
  await t.shot('select-world2-records');
  // Petit glissement lent (sous le seuil) : la page revient, la carte n'est pas lancée.
  await swipe(t, 'm1', 60, 10);
  await waitSelectPage(t, 2);
  await stillSelect(t, 'petit glissement');
  // Geste vif et court (100 px, sous la part de largeur qui suffit seule ; vif si fini en moins de 220 ms) :
  // page précédente.
  await swipe(t, 'm1', 100, 1);
  await waitSelectPage(t, 1);
  await stillSelect(t, 'geste vif');
  // Glissement à la souris : page suivante, carte non lancée.
  const c = await t.ev((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, `${S} .card[data-stage="j1"]`);
  await t.page.mouse.move(c.x, c.y);
  await t.page.mouse.down();
  for (let i = 1; i <= 10; i++) await t.page.mouse.move(c.x - 25 * i, c.y, { steps: 1 });
  await t.page.mouse.up();
  await waitSelectPage(t, 2);
  await stillSelect(t, 'glissement à la souris');
  // Clavier : ← puis →, puis ← (retour au monde 1).
  await t.key('ArrowLeft', 40);
  await waitSelectPage(t, 1);
  await t.key('ArrowRight', 40);
  await waitSelectPage(t, 2);
  await t.key('ArrowLeft', 40);
  await waitSelectPage(t, 1);
  // Souris pressée au bord haut de la zone des pages, relâchée juste au-dessus (sous le seuil), puis survol sans
  // bouton : pas de glissement fantôme.
  const track = () =>
    t.ev((s) => {
      const tr = document.querySelector(`${s} .select-track`);
      return { dragging: tr.classList.contains('is-dragging'), transform: tr.style.transform };
    }, S);
  const still = await track();
  const v = await t.ev((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), top: Math.round(b.top) };
  }, `${S} .select-pages`);
  await t.page.mouse.move(v.x, v.top + 3);
  await t.page.mouse.down();
  await t.page.mouse.move(v.x, v.top - 5);
  await t.page.mouse.up();
  await t.page.mouse.move(v.x + 4, v.top + 6);
  for (let i = 1; i <= 8; i++) await t.page.mouse.move(v.x + 4 - 30 * i, v.top + 6);
  assertEq(await track(), still, 'souris relâchée hors de la zone des pages puis survol : bande immobile');
  // Après un glissement au doigt (sans click), Entrée sur une carte la lance encore.
  await swipe(t, 'j1', -60, 10);
  await waitSelectPage(t, 1);
  await t.page.locator(`${S} .card[data-stage="j1"]`).focus();
  await t.key('Enter', 40);
  assertEq(await introThenBack(t), 'Lisière de Xéna', 'Entrée sur la carte de j1 après un glissement : son intro');
  await press(t, 'title', 'Niveaux');
  await waitForScreen(t, 'select');
  await waitSelectPage(t, 1);
  // Un simple toucher lance toujours la carte.
  await pickStage(t, 'f1');
  assertEq(await introThenBack(t), "Nébuleuse d'Azur", 'carte de f1 touchée : son intro');
  assertEq(await playTarget(t), 'Canopée des spores', 'v1 unlocked 3 : JOUER → j2');

  // ---------------------------------------------------------------- C. v1 « unlocked: 2 », j1 seul réussi
  const bestC = { j1: { score: 1234, stars: 2 } };
  await loadSave(t, { version: 1, unlocked: 2, best: bestC, settings: {} });
  assertEq(await playSub(t), 'Continuer · Canopée des spores', 'v1 unlocked 2 : JOUER');
  sel = await openSelect(t);
  assertEq(locks(sel), lockedBy(['j1']), 'v1 unlocked 2 : j2 ouverte, la suite verrouillée (index ignoré)');
  assertEq([sel.cards.j2.locked, sel.cards.f1.locked], [false, true], 'v1 unlocked 2 : j2 ouverte, f1 verrouillée');
  assertEq(
    { world: sel.world, worldStars: sel.worldStars, total: sel.total },
    { world: 1, worldStars: starsOf(W1, bestC), total: starsOf(ORDER, bestC) },
    'v1 unlocked 2 : monde 1, étoiles',
  );
  assertEq(await machinegunState(t), 'Plan manquant', 'v1 sans f1 réussi : pas de plan');
  await t.key('Escape', 40);
  await waitForScreen(t, 'select');
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');
  assertEq(await playTarget(t), 'Canopée des spores', 'v1 unlocked 2 : JOUER → j2');

  // ---------------------------------------------------------------- D. Version 2
  await loadSave(t, { version: 2, unlocked: 0, best: { f1: { score: 900, stars: 1 } }, settings: {}, crystals: 5 });
  assertEq(await playSub(t), 'Continuer · Lisière de Xéna', 'v2, f1 seul réussi : JOUER');
  sel = await openSelect(t);
  assertEq(locks(sel), lockedBy(['f1']), 'v2, f1 seul réussi : j1, f1 et m1 ouvertes');
  assertEq([sel.cards.j2.locked, sel.cards.m1.locked, sel.cards.f2.locked], [true, false, true], 'v2, f1 seul réussi : j2 et f2 verrouillées, m1 ouverte');
  assertEq(await machinegunState(t), '80', 'v2, f1 réussi : plan du mitrailleur');
  assertEq(await crewMention(t), null, 'v2, j2 non réussie : pas de Tess à l’Établi');
  await t.key('Escape', 40);
  await waitForScreen(t, 'select');
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');
  assertEq(await playTarget(t), 'Lisière de Xéna', 'v2, f1 seul réussi : JOUER → j1');

  // j1 et j2 réussis, équipage vide : Tess rendue au chargement (récompense de j2), à l'Établi.
  await loadSave(t, { version: 2, unlocked: 2, best: { j1: { score: 900, stars: 1 }, j2: { score: 800, stars: 1 } }, settings: {}, crew: [] });
  await openSelect(t);
  await machinegunState(t);
  assertEq(await crewMention(t), 'Tess à l’établi', 'v2, j2 réussie sans équipage : Tess rendue au chargement, à l’Établi');
  await t.key('Escape', 40);
  await waitForScreen(t, 'select');
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');

  await loadSave(t, { version: 2, unlocked: 0, best: {}, settings: {} });
  assertEq(await playSub(t), 'Nouvelle aventure', 'v2 sans records ni histoire : JOUER');
  await loadSave(t, { version: 2, unlocked: 0, best: {}, settings: {}, story: { seen: ['prologue'] } });
  assertEq(await playSub(t), 'Continuer · Lisière de Xéna', 'v2 sans records mais avec une marque d’histoire : pas « Nouvelle aventure »');
  await loadSave(t, {
    version: 2,
    unlocked: 1,
    best: { f1: { score: 900, stars: 1 } },
    settings: { music: true },
    story: { seen: ['prologue', 7, 'prologue', '', 'tutorial-j1'] },
  });
  // Enregistrement suivant (réglage changé dans Options) : histoire relue, plan et index hérité gardés.
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  await t.page.locator('.screens [data-screen="options"].is-active .toggle--music').click({ timeout: 5000 });
  await waitFor(t, () => JSON.parse(localStorage.getItem('xeno-rift-save-v1')).settings.music === false, { timeout: 3000, label: 'réglage enregistré' });
  const save = await readSave(t);
  t.log(`v2 réécrite : ${fmt({ unlocked: save.unlocked, best: save.best, blueprints: save.blueprints, story: save.story })}`);
  assertEq(
    { version: save.version, unlocked: save.unlocked, blueprints: save.blueprints, story: save.story },
    { version: 2, unlocked: 1, blueprints: ['machinegun'], story: { seen: ['prologue', 'tutorial-j1'] } },
    'v2 réécrite : histoire relue, plan rendu, index hérité gardé',
  );
  await t.key('Escape', 40);
  await waitForScreen(t, 'title');

  if (t.prod) return;

  // ---------------------------------------------------------------- E. Récompense sur l'écran de résultats (DEV)
  await loadSave(t, null);
  for (const pass of [1, 2]) {
    if (pass === 1) await t.goto('?touch=0&stage=f1');
    else await press(t, 'results', 'Rejouer');
    await waitFor3dPhase(t, 'fly', { timeout: 60000 });
    await t.ev(() => window.__xr3d.win());
    await waitForScreen(t, 'results', { timeout: 25000 });
    const rewards = await t.ev(() =>
      [...document.querySelectorAll('.screens [data-screen="results"].is-active .detail--reward')].map((r) => ({ reward: r.dataset.reward, label: r.getAttribute('aria-label') })),
    );
    t.log(`f1 gagné (partie ${pass}) : ${fmt({ rewards, details: await resultDetails(t) })}`);
    if (pass === 1) {
      assertEq(rewards, [{ reward: 'blueprint:machinegun', label: 'Plan : mitrailleur' }], 'f1 gagné la première fois : « Plan : mitrailleur »');
      assertEq((await resultDetails(t)).Plan, 'mitrailleur', 'ligne Plan des résultats');
      assertEq((await readSave(t)).blueprints, ['machinegun'], 'plan enregistré');
      await t.shot('results-f1-plan');
      await press(t, 'results', 'Suivant');
      await waitForScreen(t, 'hangar');
      const depart = await t.ev((h) => document.querySelector(`${h} .hg-depart`).innerText.replace(/\s+/g, ' ').trim(), HG);
      assert(/Atterrir/i.test(depart) && depart.includes('Lune Krator'), `hangar après f1 : « Atterrir » vers la Lune Krator (${depart})`);
      await t.key('Escape', 40);
      await waitForScreen(t, 'results');
    } else {
      assertEq(rewards, [], 'f1 rejoué et gagné : plus de ligne de récompense');
    }
  }
}
