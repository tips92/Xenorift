// Hangar (plan 03a, aides DEV) :
//  A. Lecture de la sauvegarde : version inconnue puis données illisibles → remise à zéro ; version 2 abîmée (réserve
//     négative, niveaux hors bornes ou non entiers, arme, équipier et plans inconnus) → chaque champ relu dans ses
//     bornes, identifiants inconnus filtrés ; version 1 réaliste (étape 2 débloquée, record de j1, réglages, fusil
//     possédé et équipé, double saut) : migrée au chargement (réserve vide, rien d'acheté), réécrite en version 2 au
//     premier enregistrement avec progression, record, réglages et équipement gardés.
//  B. j1 terminé (cristaux ramassés par la fonction du jeu, __xr2d.win) : « +N cristaux » = cristaux de la partie,
//     réserve = N ; record plus haut gardé ; score et étoiles finaux notés.
//  C. SUIVANT → hangar (réserve affichée, Décoller vers le Vol 1) : laser (possédé) équipé et enregistré ; achat de
//     Dégâts niveau 1 du laser (confirmation : texte, prix, réserve avant → après ; le retour Android la ferme sans
//     rien acheter ; Acheter : réserve débitée, pastille allumée, son « buy », sauvegarde) ; achats refusés (Demande
//     Tess, réserve insuffisante, plan manquant, arme non possédée, Demande Mira : message du hangar (pas de toast),
//     la carte tremble, sa note de verrou clignote, ni boîte ni débit) ; bouclier niveau 1 ; retour Android →
//     résultats figés (score et étoiles finaux tout de suite, aucun son, réserve après achats, sans « +N ») →
//     SUIVANT → hangar → Décoller → carte d'intro du Vol 1 → 4 boucliers (jeu et HUD).
//  D. Rechargement : réserve et niveaux gardés ; Niveaux (bouton Hangar et sa réserve) → hangar sans Décoller ;
//     bouclier niveau 2 (Max, plus de prix), turbo niveau 1 ; Échap ferme la confirmation, ◀ et Retour arrière
//     ramènent aux Niveaux.
//  E. Effets en jeu hors mode test : laser à dégâts ×1,25 (fiche et projectile tiré), cadence et refroidissement
//     d'origine, 3 cœurs ; vol à 5 boucliers (jeu et HUD), turbo ×1,25 (jauge vidée de 0,32 et rechargée de 0,25 par
//     seconde de jeu, contre 0,4 et 0,2).
//  F. Mode test : réserve insuffisante toujours refusée (les prix restent) ; conditions levées (note « Mode test ») ;
//     pompe (non possédée) équipée pour la session puis achetée (rangée dans l'ordre des armes, devient l'arme
//     enregistrée, focus sur Équiper) ; laser rééquipé (dernier choix gagnant) puis Cadence et Refroidissement ;
//     Portée du fusil ; mitrailleuse de la Comète (« Effet en vol : bientôt ») ; cœur supplémentaire ; j1 : pompe,
//     4 cœurs (HUD), cœur perdu puis réapparition à 4 cœurs, portée d'une balle du fusil, cadence et refroidissement
//     du laser ; second cœur (Max) : 5 cœurs (HUD).
//  G. Hors mode test, équipage et plan présents dans la sauvegarde : Dégâts 2 (Tess), mitrailleur (son plan) et cœur
//     (Mira) achetables sans note ; mitrailleur acheté puis équipé (enregistré), ses améliorations débloquées.
//  H. Réinitialiser la progression : réserve, achats, équipage, plans, équipement et progression vidés, réglages gardés.
//  Captures : résultats « +N », hangar (Établi, confirmation, verrous, Comète, Kaï, mode test), aperçu (Kaï et 3 armes,
//  Comète sans puis avec mitrailleuse et bouclier), vol à 4 et 5 boucliers, Kaï à 5 cœurs.
//  Valeurs recopiées (à mettre à jour après un réglage) : prix (PRICES de src/core/hangar.ts), multiplicateurs
//  (UPGRADE_MULS, BOOST_MULS), fiches du laser et du fusil (src/core/weapons.ts), BOOST_DRAIN / BOOST_FILL
//  (src/game3d/flight.ts). Voir tests/e2e/README.md, « Scénario du hangar ».
import { assert, assertEq, assertNear, fmt, readSave, screenText, waitFor, waitFor2dPlay, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { hudFlight, pickStage, press, pressPause, recordToasts, resultDetails, waitPause } from '../lib/core.mjs';
import { pressBack, waitIntroCard } from '../lib/shell.mjs';

export const meta = {
  title: 'Hangar : sauvegarde v2 (migration, valeurs abîmées), cristaux gagnés, achats (confirmation, refus), équipement, retour, effets en jeu',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

const SAVE_KEY = 'xeno-rift-save-v1';
const HG = '.screens [data-screen="hangar"].is-active';
const RES = '.screens [data-screen="results"].is-active';
const SETTINGS = { music: true, sfx: true, haptics: false, tilt: false, unlockAll: false, touchSize: 2, touchOpacity: 0, leftHanded: true };
const RECORD = { score: 99999, stars: 2 };
const V1 = {
  version: 1,
  unlocked: 1,
  best: { j1: RECORD },
  settings: SETTINGS,
  loadout: { equipped: 'rifle', owned: ['laser', 'rifle'], skills: { doubleJump: true } },
};
const ZERO = { damage: 0, fireRate: 0, range: 0, cooling: 0 };
const ZERO_UPGRADES = Object.fromEntries(['laser', 'machinegun', 'shotgun', 'rifle'].map((w) => [w, { ...ZERO }]));
/** Turbo de la Comète (game3d/flight.ts) : jauge vidée en 2,5 s, rechargée en 5 s. */
const BOOST_DRAIN = 0.4;
const BOOST_FILL = 0.2;
/** Fiche du laser (core/weapons.ts) : délai entre tirs (ms), refroidissement par seconde. */
const LASER_COOLDOWN_MS = 160;
const LASER_COOL_RATE = 0.45;
/** Portée du fusil (core/weapons.ts : 12 tuiles de 64 px). */
const RIFLE_RANGE_PX = 12 * 64;
/** Cristaux ramassés pendant la partie de j1 (scene.collectCrystal, comme au contact d'un cristal). */
const PICKED = 9;

const r3 = (v) => Math.round(v * 1000) / 1000;
const digits = (s) => Number(String(s).replace(/\D/g, ''));

function putSave(t, save) {
  return t.ev(([k, s]) => localStorage.setItem(k, typeof s === 'string' ? s : JSON.stringify(s)), [SAVE_KEY, save]);
}

function shell(t) {
  return t.ev(() => window.__xrShell.info());
}

/** Ajoute des cristaux à la réserve (aide DEV), avant d'ouvrir un écran : l'écran affiché n'est pas redessiné. */
function addCrystals(t, n) {
  return t.ev((k) => window.__xrShell.addCrystals(k), n);
}

/** Journal des sons d'effet (AudioApi.sfx de la coquille enveloppée) ; vidé à chaque appel. */
function recordSfx(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    if (!a.__orig) {
      a.__orig = a.sfx;
      a.sfx = function (id, opts) {
        window.__sfxLog.push(id);
        return a.__orig.call(this, id, opts);
      };
    }
    window.__sfxLog = [];
  });
}

const sfxLog = (t) => t.ev(() => window.__sfxLog.slice());

/** Score et nombre d'étoiles allumées de l'écran de résultats actif. */
function resultsFinal(t) {
  return t.ev((s) => {
    const r = document.querySelector(s);
    return {
      score: Number(r.querySelector('.results-score').textContent.replace(/\D/g, '')),
      stars: r.querySelectorAll('.stars .star.is-on').length,
      gain: !!r.querySelector('.detail-gain'),
      bank: Number(r.querySelector('.detail--bank .detail-value').textContent.replace(/\D/g, '')),
    };
  }, RES);
}

/**
 * État lisible du hangar actif : réserve, onglet, arme choisie sur l'Établi, état des 4 pastilles d'armes,
 * boutons Équiper (aria-pressed), cartes d'achat (niveau, prix, verrou, Max, notes, ligne d'effet), départ,
 * confirmation ouverte, message affiché, légende de l'aperçu et canvas chargé.
 */
function hangarState(t) {
  return t.ev((sel) => {
    const s = document.querySelector(sel);
    if (!s) return null;
    const num = (e) => (e ? Number(e.textContent.replace(/\D/g, '')) : null);
    const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
    const items = {};
    for (const it of s.querySelectorAll('.hg-list [data-item]')) {
      const buy = it.querySelector('[data-buy]');
      items[it.dataset.item] = {
        level: it.querySelectorAll('.hg-pip.is-on').length,
        price: buy ? num(buy.querySelector('.hg-buy-n')) : null,
        locked: buy ? buy.classList.contains('is-locked') : null,
        disabled: buy ? buy.getAttribute('aria-disabled') === 'true' : null,
        max: !!it.querySelector('.hg-max'),
        notes: [...it.querySelectorAll('.hg-note')].map(txt),
        line: txt(it.querySelector('.hg-item-line')),
      };
    }
    const tab = s.querySelector('.hg-tab[aria-selected="true"]');
    const picked = s.querySelector('.hg-weapon[aria-checked="true"]');
    const conf = s.querySelector('.hg-confirm.is-open');
    const msg = s.querySelector('.hg-msg.is-on');
    return {
      wallet: num(s.querySelector('.hg-wallet-n')),
      tab: tab ? [...tab.classList].find((c) => c.startsWith('hg-tab--')).slice(8) : null,
      weapon: picked ? picked.dataset.weapon : null,
      weapons: Object.fromEntries([...s.querySelectorAll('.hg-weapon')].map((b) => [b.dataset.weapon, txt(b.querySelector('.hg-weapon-state'))])),
      equip: Object.fromEntries([...s.querySelectorAll('[data-equip]')].map((b) => [b.dataset.equip, b.getAttribute('aria-pressed') === 'true'])),
      items,
      depart: txt(s.querySelector('.hg-depart')) || null,
      confirm: conf ? { text: txt(conf.querySelector('.confirm-text')), funds: txt(conf.querySelector('.hg-confirm-funds')) } : null,
      msg: msg ? txt(msg) : null,
      caption: txt(s.querySelector('.hg-caption')),
      slots: s.querySelectorAll('.hg-caption .hg-slot.is-on').length,
      canvas: !!s.querySelector('.hg-canvas-el'),
    };
  }, HG);
}

/** Clic réel ; `force` : bouton aria-disabled (prix verrouillé), que Playwright refuse sinon de toucher. */
async function hgClick(t, sel, force = false) {
  await t.page.locator(`${HG} ${sel}`).first().click({ timeout: 5000, force });
}

async function selectTab(t, id) {
  await hgClick(t, `.hg-tab--${id}`);
  await waitFor(t, ([s, k]) => document.querySelector(`${s} .hg-tab--${k}`).getAttribute('aria-selected') === 'true', {
    timeout: 2000,
    interval: 30,
    label: `onglet ${id}`,
    arg: [HG, id],
  });
  return hangarState(t);
}

async function selectWeapon(t, w) {
  await hgClick(t, `.hg-weapon[data-weapon="${w}"]`);
  await waitFor(t, ([s, k]) => document.querySelector(`${s} .hg-weapon[data-weapon="${k}"]`).getAttribute('aria-checked') === 'true', {
    timeout: 2000,
    interval: 30,
    label: `arme ${w} choisie sur l'Établi`,
    arg: [HG, w],
  });
  return hangarState(t);
}

/** Bouton Équiper de l'arme `w` (fiche de l'Établi, arme choisie) : attend aria-pressed. */
async function equip(t, w) {
  await hgClick(t, `[data-equip="${w}"]`);
  await waitFor(t, ([s, k]) => document.querySelector(`${s} [data-equip="${k}"]`).getAttribute('aria-pressed') === 'true', {
    timeout: 2000,
    interval: 30,
    label: `${w} équipé`,
    arg: [HG, w],
  });
}

/** Fin du fondu de la confirmation (200 ms) : ouverte (`open`, boîte à sa taille) ou fermée. Avant une capture. */
async function confirmSettled(t, open) {
  await waitFor(
    t,
    ([s, o]) => {
      const c = document.querySelector(`${s} .hg-confirm`);
      const box = c.querySelector('.hg-confirm-box');
      return getComputedStyle(c).opacity === (o ? '1' : '0') && box.getAnimations().length === 0;
    },
    { timeout: 2000, interval: 30, label: `confirmation ${open ? 'ouverte' : 'fermée'} (fondu terminé)`, arg: [HG, open] },
  );
}

/** Ouvre la confirmation de l'achat `id` (prix `price`) ; vérifie son texte et la réserve avant → après. */
async function openBuy(t, id, price, what) {
  const st = await hangarState(t);
  const it = st.items[id];
  assert(it && it.locked === false && it.disabled === false && it.price === price, `${id} : achetable pour ${price} (${fmt(it)})`);
  await hgClick(t, `[data-buy="${id}"]`);
  const box = await waitFor(t, (s) => !!document.querySelector(`${s} .hg-confirm.is-open`), { timeout: 2000, interval: 30, label: `${id} : confirmation ouverte`, arg: HG }).then(() =>
    hangarState(t).then((h) => h.confirm),
  );
  assert(box.text.includes(what) && box.text.includes(`${price} cristaux`), `${id} : texte de la confirmation « ${what} … ${price} cristaux » (${box.text})`);
  const funds = box.funds.replace(/[\s  ]/g, '');
  assert(funds.includes(`${st.wallet}→${st.wallet - price}`), `${id} : réserve ${st.wallet} → ${st.wallet - price} dans la confirmation (${box.funds})`);
  return st;
}

/**
 * Achat confirmé : réserve débitée et enregistrée, son « buy ». Amélioration ou module : niveau `level` affiché
 * (pastilles ou Max). Arme : pastille « Possédé(e) » ou « Équipé(e) », plus de prix, focus sur son bouton Équiper.
 * Renvoie l'état du hangar.
 */
async function buy(t, id, price, what, level) {
  const st = await openBuy(t, id, price, what);
  await recordSfx(t);
  await hgClick(t, '.hg-confirm .btn-primary');
  const want = st.wallet - price;
  await waitFor(
    t,
    ([s, w]) => !document.querySelector(`${s} .hg-confirm.is-open`) && Number(document.querySelector(`${s} .hg-wallet-n`).textContent.replace(/\D/g, '')) === w,
    { timeout: 2000, interval: 30, label: `${id} : achat confirmé, réserve ${want}`, arg: [HG, want] },
  );
  const after = await hangarState(t);
  const w = id.startsWith('weapon.') ? id.slice(7) : null;
  if (w) {
    const dom = await t.ev(([s, k, a]) => ({
      buy: !!document.querySelector(`${s} [data-buy="${k}"]`),
      focus: !!document.activeElement && document.activeElement.matches(`${s} [data-equip="${a}"]`),
    }), [HG, id, w]);
    assert(/^(Possédée?|Équipée?)$/.test(after.weapons[w]) && !dom.buy, `${id} : arme achetée, plus de prix (${fmt({ state: after.weapons[w], buy: dom.buy })})`);
    assert(dom.focus, `${id} : focus sur le bouton Équiper`);
  } else {
    const it = after.items[id];
    assert(it && (it.max || it.level === level), `${id} : niveau ${level} affiché (${fmt(it)})`);
  }
  assertEq((await shell(t)).crystals, want, `${id} : réserve enregistrée`);
  const sfx = await sfxLog(t);
  assertEq(sfx.filter((x) => x === 'buy').length, 1, `${id} : son « buy » à l'achat (${fmt(sfx)})`);
  await confirmSettled(t, false); // captures suivantes sans la boîte qui s'efface
  t.log(`acheté ${id} niveau ${level} pour ${price} : réserve ${st.wallet} → ${want}`);
  return after;
}

/**
 * Achat refusé : message `text` dans le hangar (un seul message, pas de toast), la carte tremble (animation
 * 'hg-shake'), sa note de verrou clignote si elle en a une, ni confirmation ni débit.
 */
async function refuse(t, id, text) {
  const st = await hangarState(t);
  await hgClick(t, `[data-buy="${id}"]`, true);
  await waitFor(t, ([s, x]) => {
    const m = document.querySelector(`${s} .hg-msg.is-on`);
    return !!m && m.textContent.includes(x);
  }, { timeout: 2000, interval: 30, label: `${id} refusé : message « ${text} »`, arg: [HG, text] });
  const fx = await t.ev(([s, k]) => {
    const row = document.querySelector(`${s} [data-buy="${k}"]`).closest('.hg-item');
    const note = row.querySelector('.hg-note.is-lock');
    return {
      shake: row.getAnimations().some((a) => a.id === 'hg-shake'),
      note: !!note,
      blink: !!note && note.getAnimations().some((a) => a.id === 'hg-blink'),
      msgs: document.querySelectorAll(`${s} .hg-msg`).length,
    };
  }, [HG, id]);
  assert(fx.shake, `${id} refusé : la carte tremble (animation hg-shake)`);
  assert(!fx.note || fx.blink, `${id} refusé : la note de verrou clignote`);
  assertEq(fx.msgs, 1, `${id} refusé : un seul message dans le hangar`);
  const toasted = await t.ev((x) => (window.__xrToasts || []).some((m) => m.text.includes(x)), text);
  assert(!toasted, `${id} refusé : pas de toast global « ${text} »`);
  const after = await hangarState(t);
  assert(!after.confirm && after.wallet === st.wallet, `${id} refusé : ni confirmation ni débit (${fmt({ confirm: after.confirm, wallet: after.wallet })})`);
  t.log(`refusé ${id} : ${text}`);
}

/** Capture de l'aperçu (légende et canvas), agrandie. */
async function previewShot(t, name) {
  const r = await t.ev((s) => {
    const b = document.querySelector(`${s} .hg-stage`).getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, HG);
  await t.wait(250); // dessin de l'aperçu (image suivante) et fin des effets d'achat
  await t.shot(name, { clip: r, zoom: 2 });
}

async function waitCanvas(t) {
  await waitFor(t, (s) => !!document.querySelector(`${s} .hg-canvas-el`), { timeout: 5000, label: 'aperçu chargé (canvas)', arg: HG });
}

/** Niveaux (écran affiché) → Hangar (sans départ). Renvoie le texte du bouton Hangar des Niveaux. */
async function hangarFromSelectScreen(t) {
  await waitForScreen(t, 'select');
  const label = await t.ev(() => document.querySelector('.screens [data-screen="select"].is-active .select-hangar').innerText.replace(/\s+/g, ' ').trim());
  await t.page.locator('.screens [data-screen="select"].is-active .select-hangar').click({ timeout: 5000 });
  await waitForScreen(t, 'hangar');
  return label;
}

/** Accueil → Niveaux → Hangar (sans départ). Renvoie le texte du bouton Hangar des Niveaux. */
async function hangarFromSelect(t) {
  await press(t, 'title', 'Niveaux');
  return hangarFromSelectScreen(t);
}

/** Retour vers l'écran `name` par `how` ('android' | 'Escape' | 'Backspace' | 'button' : ◀ de l'en-tête). */
async function back(t, how, name) {
  await t.wait(150); // deux retours à moins de 120 ms : le second est ignoré
  if (how === 'android') await pressBack(t);
  else if (how === 'button') await hgClick(t, '.screen-header .btn-round');
  else await t.key(how, 60);
  await waitForScreen(t, name);
}

/** Pause puis Quitter : retour à l'accueil depuis une partie. */
async function quitGame(t) {
  await t.key('Escape', 60);
  await waitPause(t, true);
  await pressPause(t, 'Quitter');
  await waitForScreen(t, 'title');
}

export default async function (t) {
  await recordToasts(t);

  // ---------------------------------------------------------------- A. Lecture de la sauvegarde
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  // Version inconnue, puis données illisibles (JSON tronqué) : remise à zéro.
  for (const [what, raw] of [
    ['version 3', { version: 3, unlocked: 3, crystals: 999 }],
    ['JSON illisible', '{"version":2,"unlocked":3,"crystals":500'],
  ]) {
    await putSave(t, raw);
    await t.goto('?touch=0');
    await waitForScreen(t, 'title');
    const text = await screenText(t, 'title');
    const sh0 = await shell(t);
    assert(/Nouvelle aventure/i.test(text) && sh0.crystals === 0, `sauvegarde ${what} : remise à zéro (${fmt({ crystals: sh0.crystals, title: text.slice(0, 80) })})`);
  }
  // Version 2 abîmée : chaque champ relu dans ses bornes, identifiants inconnus filtrés.
  await putSave(t, {
    version: 2,
    unlocked: 1,
    settings: SETTINGS,
    crystals: -40,
    upgrades: { laser: { damage: 9, range: 1.9, fireRate: -2, cooling: 'x' }, bazooka: { damage: 3 } },
    ship: { gun: 7, shield: 9, boost: 1.6 },
    extraHearts: 4,
    crew: ['tess', 'bob'],
    blueprints: ['laser', 'rifle', 'bazooka'],
  });
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  let sh = await shell(t);
  assertEq(
    { crystals: sh.crystals, laser: sh.play.mods.laser, gunLevel: sh.play.ship.gunLevel, maxShields: sh.play.ship.maxShields, boostLevel: sh.play.ship.boostLevel, maxHearts: sh.play.maxHearts },
    { crystals: 0, laser: { damage: 2, fireRate: 1, range: 1.15, cooling: 1 }, gunLevel: 3, maxShields: 5, boostLevel: 1, maxHearts: 5 },
    'sauvegarde v2 abîmée : valeurs bornées',
  );
  assertEq(await addCrystals(t, 0), 0, 'sauvegarde v2 abîmée : réserve 0'); // enregistre la sauvegarde relue
  let save = await readSave(t);
  assertEq(
    { crystals: save.crystals, upgrades: save.upgrades, ship: save.ship, extraHearts: save.extraHearts, crew: save.crew, blueprints: save.blueprints },
    {
      crystals: 0,
      upgrades: { ...ZERO_UPGRADES, laser: { damage: 3, fireRate: 0, range: 1, cooling: 0 } },
      ship: { gun: 3, shield: 2, boost: 1 },
      extraHearts: 2,
      crew: ['tess'],
      blueprints: ['rifle'],
    },
    'sauvegarde v2 abîmée : réécrite propre (ni bazooka, ni bob, ni plan du laser)',
  );

  // Version 1 réaliste : migrée.
  await putSave(t, V1);
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  const title = await screenText(t, 'title');
  assert(/Continuer/i.test(title) && title.includes("Nébuleuse d'Azur"), `sauvegarde v1 : JOUER continue au Vol 1 (${title})`);
  sh = await shell(t);
  assertEq(sh.crystals, 0, 'sauvegarde v1 : réserve vide');
  assertEq(sh.loadout, V1.loadout, 'sauvegarde v1 : équipement gardé');
  assert(sh.play.maxHearts === 3 && sh.play.ship.maxShields === 3 && sh.play.mods.laser.damage === 1, `sauvegarde v1 : rien d'acheté (${fmt(sh.play)})`);
  assertEq((await readSave(t)).version, 1, 'sauvegarde v1 : pas réécrite au chargement');

  // ---------------------------------------------------------------- B. j1 terminé : cristaux ajoutés à la réserve
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  await t.ev((n) => {
    const s = window.__xr2d.scene;
    for (let i = 0; i < n; i++) s.collectCrystal(s.player.x, s.player.feetY - 30);
  }, PICKED);
  const picked = await t.ev(() => window.__xr2d.scene.crystals);
  assert(picked >= PICKED, `j1 : ${picked} cristaux ramassés`);
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  const gain = await t.ev((s) => document.querySelector(`${s} .detail-gain`).textContent.trim(), RES);
  assertEq(gain, `+${picked} cristaux`, 'résultats : gain de la partie');
  await waitFor(t, ([s, n]) => Number(document.querySelector(`${s} .detail--bank .detail-value`).textContent.replace(/\D/g, '')) === n, {
    timeout: 4000,
    label: `résultats : réserve qui défile jusqu'à ${picked}`,
    arg: [RES, picked],
  });
  const det = await resultDetails(t);
  assertEq(det.Cristaux, `${picked}/53`, 'résultats : cristaux de la partie');
  assertEq((await shell(t)).crystals, picked, 'réserve après j1');
  save = await readSave(t);
  t.log(`sauvegarde après j1 : ${fmt(save)}`);
  assertEq(
    { version: save.version, unlocked: save.unlocked, best: save.best.j1, settings: save.settings, loadout: save.loadout, crystals: save.crystals },
    { version: 2, unlocked: 1, best: RECORD, settings: SETTINGS, loadout: V1.loadout, crystals: picked },
    'sauvegarde réécrite en version 2 (progression, record, réglages et équipement gardés, réserve)',
  );
  assertEq(
    { upgrades: save.upgrades, ship: save.ship, extraHearts: save.extraHearts, crew: save.crew, blueprints: save.blueprints },
    { upgrades: ZERO_UPGRADES, ship: { gun: 0, shield: 0, boost: 0 }, extraHearts: 0, crew: [], blueprints: [] },
    'sauvegarde v2 : rien d’acheté',
  );
  // Toucher le panneau finit les animations : score et étoiles finaux, à retrouver au retour du hangar.
  await t.page.locator(`${RES} .results-panel`).click({ position: { x: 8, y: 8 } });
  const final = await resultsFinal(t);
  assert(final.score > 0 && final.stars >= 1, `résultats : score et étoiles finaux (${fmt(final)})`);
  await t.shot('results-gain');

  // ---------------------------------------------------------------- C. Hangar entre j1 et f1
  const bank = await addCrystals(t, 120 - picked);
  assertEq(bank, 120, 'réserve portée à 120 (aide DEV)');
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'hangar');
  await waitCanvas(t);
  let st = await hangarState(t);
  t.log(`hangar : ${fmt({ wallet: st.wallet, tab: st.tab, weapon: st.weapon, weapons: st.weapons, depart: st.depart })}`);
  assertEq(st.wallet, 120, 'hangar : réserve affichée');
  assert(st.tab === 'bench' && st.weapon === 'rifle', `hangar : Établi, arme équipée (fusil) choisie (${fmt({ tab: st.tab, weapon: st.weapon })})`);
  assertEq(st.weapons, { laser: 'Possédé', machinegun: 'Plan manquant', shotgun: 'Plan manquant', rifle: 'Équipé' }, 'hangar : état des 4 armes (accordé au nom)');
  assert(st.depart && /Décoller/i.test(st.depart) && st.depart.includes("Nébuleuse d'Azur"), `hangar : départ vers le Vol 1 (${st.depart})`);
  await previewShot(t, 'preview-kai-rifle');

  // Laser possédé : équipé et enregistré
  st = await selectWeapon(t, 'laser');
  assertEq(st.equip, { laser: false }, 'laser choisi : bouton Équiper');
  await equip(t, 'laser');
  sh = await shell(t);
  save = await readSave(t);
  assert(sh.weapon === null && sh.loadout.equipped === 'laser' && save.loadout.equipped === 'laser', `laser équipé et enregistré (${fmt({ weapon: sh.weapon, loadout: sh.loadout, saved: save.loadout })})`);
  await previewShot(t, 'preview-kai-laser');

  // Dégâts du laser, niveau 1 : la confirmation se ferme au retour Android sans rien acheter, puis achat
  st = await hangarState(t);
  const dmg = st.items['upgrade.laser.damage'];
  assert(dmg.level === 0 && dmg.price === 30 && dmg.line.includes('×1 → ×1,25'), `Dégâts du laser : niveau 0, 30, ×1 → ×1,25 (${fmt(dmg)})`);
  await openBuy(t, 'upgrade.laser.damage', 30, 'Améliorer les dégâts du Pistolet laser (×1,25)');
  await confirmSettled(t, true);
  await t.shot('hangar-confirm');
  await back(t, 'android', 'hangar');
  st = await hangarState(t);
  assert(!st.confirm && st.wallet === 120 && st.items['upgrade.laser.damage'].level === 0, `retour Android : confirmation fermée, rien acheté (${fmt({ confirm: st.confirm, wallet: st.wallet })})`);
  assertEq((await shell(t)).screen, 'hangar', 'retour Android avec la confirmation ouverte : toujours le hangar');
  st = await buy(t, 'upgrade.laser.damage', 30, 'Améliorer les dégâts du Pistolet laser (×1,25)', 1);
  assertEq((await readSave(t)).upgrades.laser.damage, 1, 'Dégâts du laser niveau 1 enregistré');
  const dmg2 = st.items['upgrade.laser.damage'];
  assert(dmg2.price === 60 && dmg2.locked && dmg2.disabled && dmg2.notes.includes('Demande Tess'), `Dégâts niveau 2 : 60, Demande Tess (${fmt(dmg2)})`);
  await t.shot('hangar-bought');

  // Refus : Tess, réserve insuffisante, plan manquant, arme non possédée, Mira
  await refuse(t, 'upgrade.laser.damage', 'Demande Tess');
  st = await selectTab(t, 'ship');
  assertEq(st.msg, null, 'changement d’onglet : message effacé');
  const gun = st.items['ship.gun'];
  assert(gun.price === 100 && gun.locked && gun.notes.includes('Effet en vol : bientôt') && !gun.notes.some((n) => /Réserve/.test(n)), `mitrailleuse : 100, réserve insuffisante (prix éteint), effet bientôt (${fmt(gun)})`);
  await refuse(t, 'ship.gun', 'Réserve insuffisante');
  await previewShot(t, 'preview-ship');
  st = await buy(t, 'ship.shield', 80, 'Installer le bouclier renforcé (4 boucliers)', 1);
  assert(st.items['ship.shield'].line.includes('4 → 5 boucliers') && st.slots === 4, `bouclier niveau 1 : 4 boucliers (${fmt({ item: st.items['ship.shield'], slots: st.slots })})`);
  assert(st.items['ship.boost'].locked && st.items['ship.boost'].price === 80, `turbo : 80, réserve insuffisante (${fmt(st.items['ship.boost'])})`);
  await t.shot('hangar-ship');
  st = await selectTab(t, 'bench');
  st = await selectWeapon(t, 'machinegun');
  const mg = st.items['weapon.machinegun'];
  assert(mg.price === 80 && mg.locked && mg.notes.includes('Plan manquant') && st.equip.machinegun === undefined, `mitrailleur : 80, plan manquant, pas de bouton Équiper (${fmt({ mg, equip: st.equip })})`);
  assert(st.items['upgrade.machinegun.damage'].notes.includes('Arme non possédée'), `améliorations du mitrailleur : arme non possédée (${fmt(st.items['upgrade.machinegun.damage'])})`);
  await refuse(t, 'weapon.machinegun', 'Plan manquant');
  await refuse(t, 'upgrade.machinegun.cooling', 'Arme non possédée');
  await t.shot('hangar-locks');
  st = await selectTab(t, 'kai');
  const heart = st.items['kai.heart'];
  assert(heart.price === 150 && heart.locked && heart.notes.includes('Demande Mira') && st.slots === 3, `cœur : 150, Demande Mira, 3 cœurs (${fmt({ heart, slots: st.slots })})`);
  await refuse(t, 'kai.heart', 'Demande Mira');
  await t.shot('hangar-kai');

  // Retour Android : résultats figés (score et étoiles finaux tout de suite, aucun son, réserve après achats,
  // sans « +N ») ; SUIVANT → hangar → Décoller → Vol 1
  await recordSfx(t);
  await back(t, 'android', 'results');
  const res = await resultsFinal(t);
  assertEq({ score: res.score, stars: res.stars }, { score: final.score, stars: final.stars }, 'retour du hangar : score et étoiles finaux tout de suite');
  assert(!res.gain && res.bank === 10, `retour du hangar : réserve 10, sans « +N » (${fmt(res)})`);
  await t.wait(500);
  const resSfx = await sfxLog(t);
  assert(!resSfx.some((x) => x === 'crystal' || x === 'powerup' || x === 'win'), `retour du hangar : ni étoiles ni record qui sonnent (${fmt(resSfx)})`);
  await t.shot('results-after-hangar');
  await press(t, 'results', 'Suivant');
  await waitForScreen(t, 'hangar');
  assertEq((await hangarState(t)).wallet, 10, 'hangar rouvert : réserve');
  await hgClick(t, '.hg-depart');
  await waitIntroCard(t);
  const intro = await screenText(t, 'intro');
  assert(intro.includes("Nébuleuse d'Azur"), `Décoller : carte d'intro du Vol 1 (${intro.slice(0, 120)})`);
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  let fl = await t.ev(() => window.__xr3d.info());
  assert(fl.maxShields === 4 && fl.shield === 4 && fl.boostDrain === BOOST_DRAIN && fl.boostFill === BOOST_FILL, `vol : 4 boucliers, turbo d'origine (${fmt(fl)})`);
  let hud = await hudFlight(t);
  const pips = () => t.ev(() => document.querySelectorAll('.fl-pips .fl-pip').length);
  assert(hud.shield === 4 && (await pips()) === 4, `HUD du vol : 4 boucliers (${fmt(hud)})`);
  await t.shot('flight-4-shields');

  // ---------------------------------------------------------------- D. Rechargement ; hangar depuis Niveaux
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  sh = await shell(t);
  assert(sh.crystals === 10 && sh.play.mods.laser.damage === 1.25 && sh.play.ship.maxShields === 4, `rechargement : réserve et achats gardés (${fmt({ crystals: sh.crystals, play: sh.play })})`);
  assertEq(await addCrystals(t, 300), 310, 'réserve portée à 310 (aide DEV)');
  const hgBtn = await hangarFromSelect(t);
  assert(/Hangar/i.test(hgBtn) && hgBtn.includes('310 cristaux'), `Niveaux : bouton Hangar et sa réserve (${hgBtn})`);
  await waitCanvas(t);
  st = await hangarState(t);
  assert(st.wallet === 310 && !st.depart && st.weapon === 'laser' && st.items['upgrade.laser.damage'].level === 1, `hangar depuis Niveaux : réserve, pas de départ, niveaux gardés (${fmt({ wallet: st.wallet, depart: st.depart, weapon: st.weapon })})`);
  st = await selectTab(t, 'ship');
  assertEq(st.items['ship.shield'].level, 1, 'bouclier : niveau 1 gardé');
  st = await buy(t, 'ship.shield', 140, 'Renforcer encore le bouclier (5 boucliers)', 2);
  assert(st.items['ship.shield'].max && st.items['ship.shield'].price === null && st.slots === 5, `bouclier niveau 2 : Max, plus de prix, 5 boucliers (${fmt({ item: st.items['ship.shield'], slots: st.slots })})`);
  assert(!(await t.ev((s) => !!document.querySelector(`${s} [data-buy="ship.shield"]`), HG)), 'bouclier au niveau max : plus de bouton d’achat');
  st = await buy(t, 'ship.boost', 80, 'Améliorer le turbo (durée et recharge ×1,25)', 1);
  await previewShot(t, 'preview-ship-shield');
  save = await readSave(t);
  assertEq({ ship: save.ship, crystals: save.crystals }, { ship: { gun: 0, shield: 2, boost: 1 }, crystals: 90 }, 'modules de la Comète enregistrés');
  // Retours : Échap ferme la confirmation ; ◀ → Niveaux ; Retour arrière → Niveaux
  st = await selectTab(t, 'bench');
  await openBuy(t, 'upgrade.laser.fireRate', 30, 'Améliorer la cadence du Pistolet laser (×1,15)');
  await back(t, 'Escape', 'hangar');
  assert(!(await hangarState(t)).confirm, 'Échap : confirmation fermée');
  await back(t, 'button', 'select');
  await t.page.locator('.screens [data-screen="select"].is-active .select-hangar').click({ timeout: 5000 });
  await waitForScreen(t, 'hangar');
  await back(t, 'Backspace', 'select');
  assertEq((await shell(t)).crystals, 90, 'retours : rien acheté');

  // ---------------------------------------------------------------- E. Effets en jeu, hors mode test
  await t.goto('?touch=0&stage=j1');
  await waitFor2dPlay(t);
  let k = await t.ev(() => window.__xr2d.info());
  assert(k.weapon === 'laser' && k.mods.damage === 1.25 && k.mods.fireRate === 1 && r3(k.stats.damage) === 2.5, `j1 : laser à dégâts ×1,25 (${fmt({ mods: k.mods, damage: k.stats.damage })})`);
  assertNear(k.stats.cooldownMs, LASER_COOLDOWN_MS, 1e-9, 'j1 : cadence du laser d’origine');
  assertNear(k.stats.coolRate, LASER_COOL_RATE, 1e-9, 'j1 : refroidissement du laser d’origine');
  assert(k.maxHearts === 3 && k.hearts === 3, `j1 : 3 cœurs (${fmt(k)})`);
  await t.ev(() => window.__xr2d.god(true));
  await t.key('KeyJ', 30);
  const shot = await waitFor(t, () => (window.__xr2d.info().shots || [])[0] || false, { timeout: 2000, interval: 20, label: 'tir du laser' });
  assertNear(shot.damage, 2.5, 1e-6, 'dégâts du tir du laser amélioré');
  await t.goto('?touch=0&stage=f1');
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  fl = await t.ev(() => window.__xr3d.info());
  assert(fl.maxShields === 5 && fl.shield === 5, `vol : 5 boucliers (${fmt(fl)})`);
  assertNear(fl.boostDrain, BOOST_DRAIN / 1.25, 1e-9, 'turbo niveau 1 : vidange');
  assertNear(fl.boostFill, BOOST_FILL * 1.25, 1e-9, 'turbo niveau 1 : recharge');
  hud = await hudFlight(t);
  assert(hud.shield === 5 && (await pips()) === 5, `HUD du vol : 5 boucliers (${fmt(hud)})`);
  await t.shot('flight-5-shields');
  // Jauge sur une seconde de jeu simulée (__xr3d.advance, dans une seule tâche) : turbo tenu, puis relâché.
  await t.page.keyboard.down('Space');
  try {
    await waitFor(t, () => window.__xrShell.info().input.boost, { timeout: 2000, interval: 20, label: 'turbo tenu' });
    const drain = await t.ev(() => {
      const a = window.__xr3d.info().boost;
      return a - window.__xr3d.advance(1).boost;
    });
    assertNear(drain, BOOST_DRAIN / 1.25, 0.0015, 'jauge vidée en 1 s de turbo');
  } finally {
    await t.page.keyboard.up('Space');
  }
  await waitFor(t, () => !window.__xrShell.info().input.boost, { timeout: 2000, interval: 20, label: 'turbo relâché' });
  const fill = await t.ev(() => {
    const a = window.__xr3d.info().boost;
    return window.__xr3d.advance(1).boost - a;
  });
  assertNear(fill, BOOST_FILL * 1.25, 0.0015, 'jauge rechargée en 1 s sans turbo');

  // ---------------------------------------------------------------- F. Mode test : conditions levées, prix gardés
  await t.goto('?touch=0&unlock=1');
  await waitForScreen(t, 'title');
  // Réserve à 90 : le cœur (150) reste refusé en mode test, sans note de verrou (seul le prix est éteint).
  await hangarFromSelect(t);
  st = await selectTab(t, 'kai');
  const heartT0 = st.items['kai.heart'];
  assert(
    heartT0.price === 150 && heartT0.locked && heartT0.disabled && heartT0.notes.includes('Mode test') && !heartT0.notes.some((n) => /Demande|Réserve/.test(n)),
    `mode test, réserve 90 : cœur à 150 refusé, note Mode test seulement (${fmt(heartT0)})`,
  );
  await refuse(t, 'kai.heart', 'Réserve insuffisante');
  assertEq((await shell(t)).crystals, 90, 'mode test : rien débité sans réserve suffisante');
  await back(t, 'Escape', 'select');
  assertEq(await addCrystals(t, 600), 690, 'réserve portée à 690 (aide DEV)');
  await hangarFromSelectScreen(t);
  await waitCanvas(t);
  st = await hangarState(t);
  const dmgT = st.items['upgrade.laser.damage'];
  assert(dmgT.price === 60 && !dmgT.locked && dmgT.notes.includes('Mode test'), `mode test : Dégâts niveau 2 achetable, 60, note Mode test (${fmt(dmgT)})`);
  st = await selectWeapon(t, 'shotgun');
  const sg = st.items['weapon.shotgun'];
  assert(sg.price === 100 && !sg.locked && sg.notes.includes('Mode test') && st.equip.shotgun === false, `mode test : pompe à 100, note Mode test, Équiper (${fmt({ sg, equip: st.equip })})`);
  await equip(t, 'shotgun');
  await waitFor(t, (s) => /Équipée pour cette session \(mode test\)/.test((document.querySelector(`${s} .hg-msg.is-on`) || {}).textContent || ''), {
    timeout: 2000,
    label: 'message « Équipée pour cette session (mode test) » dans le hangar',
    arg: HG,
  });
  sh = await shell(t);
  save = await readSave(t);
  assert(sh.weapon === 'shotgun' && sh.play.equipped === 'shotgun' && save.loadout.equipped === 'laser' && save.loadout.owned.join() === 'laser,rifle', `pompe pour la session seulement (${fmt({ weapon: sh.weapon, saved: save.loadout })})`);
  st = await hangarState(t);
  assert(st.weapons.shotgun === 'Équipée' && /Essai|Équipée/.test(st.caption), `pompe : pastille Équipée (${fmt({ weapons: st.weapons, caption: st.caption })})`);
  await t.shot('hangar-test-shotgun');
  await previewShot(t, 'preview-kai-shotgun');
  // Pompe achetée : rangée dans l'ordre des armes, devient l'arme enregistrée (l'arme de la session est oubliée).
  st = await buy(t, 'weapon.shotgun', 100, 'Acheter la Pompe', 1);
  assertEq(st.weapons.shotgun, 'Équipée', 'pompe achetée : toujours équipée');
  sh = await shell(t);
  save = await readSave(t);
  assertEq(
    { owned: save.loadout.owned, equipped: save.loadout.equipped, weapon: sh.weapon, play: sh.play.equipped },
    { owned: ['laser', 'shotgun', 'rifle'], equipped: 'shotgun', weapon: null, play: 'shotgun' },
    'pompe achetée : possédée, équipée et enregistrée',
  );
  // Laser (possédé) rééquipé : enregistré, le dernier choix gagne ; Cadence et Refroidissement du laser.
  st = await selectWeapon(t, 'laser');
  await equip(t, 'laser');
  sh = await shell(t);
  assert(sh.weapon === null && sh.play.equipped === 'laser' && (await readSave(t)).loadout.equipped === 'laser', `laser rééquipé et enregistré (${fmt({ weapon: sh.weapon, play: sh.play.equipped })})`);
  st = await buy(t, 'upgrade.laser.fireRate', 30, 'Améliorer la cadence du Pistolet laser (×1,15)', 1);
  st = await buy(t, 'upgrade.laser.cooling', 30, 'Améliorer le refroidissement du Pistolet laser (×1,25)', 1);
  st = await selectWeapon(t, 'shotgun');
  await equip(t, 'shotgun');
  assertEq((await readSave(t)).loadout.equipped, 'shotgun', 'pompe rééquipée et enregistrée');
  st = await selectWeapon(t, 'rifle');
  st = await buy(t, 'upgrade.rifle.range', 30, "Améliorer la portée du Fusil d'assaut (×1,15)", 1);
  await previewShot(t, 'preview-kai-rifle-owned');
  st = await selectTab(t, 'ship');
  st = await buy(t, 'ship.gun', 100, 'Installer la mitrailleuse', 1);
  assert(st.items['ship.gun'].notes.includes('Effet en vol : bientôt'), `mitrailleuse achetée : effet bientôt (${fmt(st.items['ship.gun'])})`);
  await previewShot(t, 'preview-ship-gun');
  st = await selectTab(t, 'kai');
  assert(st.items['kai.heart'].notes.includes('Mode test') && !st.items['kai.heart'].locked, `mode test : cœur achetable (${fmt(st.items['kai.heart'])})`);
  st = await buy(t, 'kai.heart', 150, 'Acheter un cœur supplémentaire (4 cœurs)', 1);
  assert(st.slots === 4 && st.items['kai.heart'].price === 250, `cœur niveau 1 : 4 cœurs, suivant à 250 (${fmt({ slots: st.slots, item: st.items['kai.heart'] })})`);
  await t.shot('hangar-test-kai');
  save = await readSave(t);
  assertEq(
    {
      crystals: save.crystals,
      extraHearts: save.extraHearts,
      ship: save.ship,
      laser: save.upgrades.laser,
      rifle: save.upgrades.rifle,
      crew: save.crew,
      blueprints: save.blueprints,
      owned: save.loadout.owned,
      equipped: save.loadout.equipped,
    },
    {
      crystals: 250,
      extraHearts: 1,
      ship: { gun: 1, shield: 2, boost: 1 },
      laser: { damage: 1, fireRate: 1, range: 0, cooling: 1 },
      rifle: { damage: 0, fireRate: 0, range: 1, cooling: 0 },
      crew: [],
      blueprints: [],
      owned: ['laser', 'shotgun', 'rifle'],
      equipped: 'shotgun',
    },
    'mode test : achats enregistrés (ni équipage ni plan ajoutés)',
  );

  // j1 lancé depuis les Niveaux : pompe, 4 cœurs, réapparition à 4 cœurs, portée du fusil, cadence du laser
  await back(t, 'Escape', 'select');
  await pickStage(t, 'j1');
  await waitFor2dPlay(t);
  k = await t.ev(() => window.__xr2d.info());
  assert(k.weapon === 'shotgun' && k.maxHearts === 4 && k.hearts === 4, `j1 en mode test : pompe, 4 cœurs (${fmt({ weapon: k.weapon, hearts: k.hearts, maxHearts: k.maxHearts })})`);
  // Le HUD suit le jeu à l'image suivante : on attend qu'il affiche `full` cœurs pleins sur `all`.
  const hudHearts = (all, full, label) =>
    waitFor(
      t,
      ([a, f]) => document.querySelectorAll('.hud-hearts .hud-heart').length === a && document.querySelectorAll('.hud-hearts .hud-heart:not(.is-empty)').length === f,
      { timeout: 2000, interval: 30, label, arg: [all, full] },
    );
  await hudHearts(4, 4, 'HUD : 4 cœurs');
  await t.ev(() => {
    const s = window.__xr2d.scene;
    s.damagePlayer(s.player.x + 40, 'hazard');
  });
  await waitFor(t, () => window.__xr2d.info().hearts === 3, { timeout: 2000, label: 'un cœur perdu' });
  await hudHearts(4, 3, 'HUD : 3 cœurs sur 4');
  await t.ev(() => window.__xr2d.kill());
  await waitFor(t, () => window.__xr2d.scene.state === 'play' && window.__xr2d.info().hearts === 4, { timeout: 6000, label: 'réapparition à 4 cœurs' });
  await hudHearts(4, 4, 'HUD après la réapparition : 4 cœurs');
  await t.ev(() => window.__xr2d.god(true));
  await t.ev(() => window.__xr2d.weapon('rifle'));
  k = await t.ev(() => window.__xr2d.info());
  assert(k.weapon === 'rifle' && k.mods.range === 1.15 && r3(k.stats.rangeTiles) === 13.8, `__xr2d.weapon('rifle') : Portée ×1,15 (${fmt({ mods: k.mods, rangeTiles: k.stats.rangeTiles })})`);
  await t.key('KeyJ', 30);
  const bullet = await waitFor(t, () => (window.__xr2d.info().shots || []).find((s) => s.weapon === 'rifle') || false, { timeout: 2000, interval: 20, label: 'balle du fusil' });
  assertNear(bullet.range, RIFLE_RANGE_PX * 1.15, 1e-6, 'portée d’une balle du fusil amélioré (px)');
  await t.ev(() => window.__xr2d.weapon('laser'));
  k = await t.ev(() => window.__xr2d.info());
  assertEq(k.mods, { damage: 1.25, fireRate: 1.15, range: 1, cooling: 1.25 }, "__xr2d.weapon('laser') : améliorations du laser");
  assertNear(k.stats.cooldownMs, LASER_COOLDOWN_MS / 1.15, 1e-9, 'cadence du laser ×1,15 : délai entre tirs divisé');
  assertNear(k.stats.coolRate, LASER_COOL_RATE * 1.25, 1e-9, 'refroidissement du laser ×1,25 : plus rapide');

  // Second cœur (Max) : 5 cœurs en jeu
  await quitGame(t);
  await hangarFromSelect(t);
  st = await selectTab(t, 'kai');
  st = await buy(t, 'kai.heart', 250, 'Acheter un cœur supplémentaire (5 cœurs)', 2);
  assert(st.items['kai.heart'].max && st.slots === 5 && st.wallet === 0, `cœur niveau 2 : Max, 5 cœurs, réserve vide (${fmt({ item: st.items['kai.heart'], slots: st.slots, wallet: st.wallet })})`);
  await back(t, 'android', 'select');
  await pickStage(t, 'j1');
  await waitFor2dPlay(t);
  k = await t.ev(() => window.__xr2d.info());
  assert(k.maxHearts === 5 && k.hearts === 5, `j1 : 5 cœurs (${fmt({ hearts: k.hearts, maxHearts: k.maxHearts })})`);
  await waitFor(
    t,
    () => document.querySelectorAll('.hud-hearts .hud-heart').length === 5 && document.querySelectorAll('.hud-hearts .hud-heart:not(.is-empty)').length === 5,
    { timeout: 2000, label: 'HUD : 5 cœurs' },
  );
  await t.shot('play-5-hearts');

  // ---------------------------------------------------------------- G. Équipage et plan de la sauvegarde, hors mode test
  await quitGame(t);
  await putSave(t, {
    version: 2,
    unlocked: 1,
    best: {},
    settings: SETTINGS,
    loadout: { equipped: 'laser', owned: ['laser'], skills: { doubleJump: false } },
    crystals: 400,
    upgrades: { laser: { damage: 1, fireRate: 0, range: 0, cooling: 0 } },
    ship: { gun: 0, shield: 0, boost: 0 },
    extraHearts: 0,
    crew: ['tess', 'mira'],
    blueprints: ['machinegun'],
  });
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  await hangarFromSelect(t);
  await waitCanvas(t);
  st = await hangarState(t);
  const dmgC = st.items['upgrade.laser.damage'];
  assert(dmgC.price === 60 && !dmgC.locked && dmgC.notes.length === 0, `Tess à bord : Dégâts niveau 2 achetable à 60, sans note (${fmt(dmgC)})`);
  assertEq(st.weapons, { laser: 'Équipé', machinegun: '80', shotgun: 'Plan manquant', rifle: 'Plan manquant' }, 'plan du mitrailleur : achetable, les autres armes sans plan');
  st = await selectWeapon(t, 'machinegun');
  const mgC = st.items['weapon.machinegun'];
  assert(mgC.price === 80 && !mgC.locked && mgC.notes.length === 0 && st.equip.machinegun === undefined, `mitrailleur : 80, sans note, pas encore de bouton Équiper (${fmt({ mgC, equip: st.equip })})`);
  assert(st.items['upgrade.machinegun.damage'].notes.includes('Arme non possédée'), 'améliorations du mitrailleur : arme non possédée avant l’achat');
  st = await buy(t, 'weapon.machinegun', 80, 'Acheter le Mitrailleur', 1);
  assertEq(st.weapons.machinegun, 'Possédé', 'mitrailleur acheté : possédé (pas équipé)');
  const up = st.items['upgrade.machinegun.damage'];
  assert(up.price === 30 && !up.locked && up.notes.length === 0, `mitrailleur acheté : ses améliorations achetables (${fmt(up)})`);
  await equip(t, 'machinegun');
  sh = await shell(t);
  save = await readSave(t);
  assert(
    sh.weapon === null && save.loadout.equipped === 'machinegun' && save.loadout.owned.join() === 'laser,machinegun' && !(await hangarState(t)).msg,
    `mitrailleur équipé et enregistré, sans message de session (${fmt({ weapon: sh.weapon, saved: save.loadout })})`,
  );
  st = await selectTab(t, 'kai');
  const heartC = st.items['kai.heart'];
  assert(heartC.price === 150 && !heartC.locked && heartC.notes.length === 0, `Mira à bord : cœur achetable à 150, sans note (${fmt(heartC)})`);
  st = await buy(t, 'kai.heart', 150, 'Acheter un cœur supplémentaire (4 cœurs)', 1);
  save = await readSave(t);
  assertEq({ crystals: save.crystals, extraHearts: save.extraHearts, crew: save.crew, blueprints: save.blueprints }, { crystals: 170, extraHearts: 1, crew: ['tess', 'mira'], blueprints: ['machinegun'] }, 'achats hors mode test enregistrés');
  await back(t, 'android', 'select');
  await back(t, 'Escape', 'title');

  // ---------------------------------------------------------------- H. Réinitialiser la progression
  await press(t, 'title', 'Options');
  await waitForScreen(t, 'options');
  await t.page.locator('.screens [data-screen="options"].is-active button', { hasText: 'Réinitialiser la progression' }).click({ timeout: 5000 });
  await t.page.locator('.screens [data-screen="options"].is-active .confirm.is-open button', { hasText: 'Effacer' }).click({ timeout: 5000 });
  await waitFor(t, () => window.__xrShell.info().crystals === 0, { timeout: 2000, label: 'réserve vidée' });
  save = await readSave(t);
  t.log(`après réinitialisation : ${fmt(save)}`);
  assertEq(
    { version: save.version, unlocked: save.unlocked, best: save.best, loadout: save.loadout, crystals: save.crystals, upgrades: save.upgrades, ship: save.ship, extraHearts: save.extraHearts, crew: save.crew, blueprints: save.blueprints },
    { version: 2, unlocked: 0, best: {}, loadout: { equipped: 'laser', owned: ['laser'], skills: { doubleJump: false } }, crystals: 0, upgrades: ZERO_UPGRADES, ship: { gun: 0, shield: 0, boost: 0 }, extraHearts: 0, crew: [], blueprints: [] },
    'réinitialisation : tout vidé (équipage et plans compris)',
  );
  assertEq(save.settings, SETTINGS, 'réinitialisation : réglages gardés');
  sh = await shell(t);
  assert(sh.play.maxHearts === 3 && sh.play.ship.maxShields === 3 && sh.play.mods.laser.damage === 1, `réinitialisation : équipement de départ (${fmt(sh.play)})`);
}
