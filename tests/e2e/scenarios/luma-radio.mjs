// Radio de LUMA en jeu (plan 04, points 7, 9 et 14 ; choix 12) dans j1, sauvegarde neuve, au clavier (?touch=0) :
//  A. Messages du départ (fenêtres 0-12) dès l'arrivée : histoire (brouillée) puis « courir et sauter » en attente ;
//     radioOpen puis lettres ; bulle « signal brouillé » sans pointer-events (elle et tout son contenu ;
//     elementFromPoint passe à travers) ; texte complet posé une seule fois dans le nœud aria-live ; bips lumaBip
//     espacés d'au moins 125 ms (8 par seconde au plus, une voix) ; texte du clavier (`keys`) sans commandes tactiles ;
//     Kaï immobile : le premier marcheur reste dans son enclos (35-40), rien ne vient au départ.
//  A2. Départ à pleine course (→ tenu, saut au pilier 33) : « tuto-stomp » (urgent) passe devant « tuto-move » et
//     s'ouvre avant le contact avec le premier marcheur (relevé à chaque image, postupdate).
//  A3. Départ à 2,5 colonnes/s (rythme de check-levels ; Kaï avancé d'une colonne toutes les 400 ms) :
//     « tuto-stomp » ouvert avant la colonne 30, sa première phrase écrite au pied du pilier (32).
//  B. Première surchauffe → message du tutoriel ; une seconde surchauffe, radio revenue au repos, ne le rejoue pas
//     (LevelEvents.say espionné : un seul appel par message, la file de la radio ne masque rien).
//  C. Tutoriel complet, dans l'ordre du niveau : Kaï posé dans chaque fenêtre (bornes lues dans la page) et aux
//     déclencheurs à colonne connue (point de contrôle 78, porte du rocher vers la ruine, arène) ; chaque message
//     demandé une fois (LevelEvents.say) au bon endroit, puis joué par la radio avec son texte du clavier s'il en a
//     un ; aucune fenêtre sautée ; ruine : glyphes éteints avant la porte, allumés à l'arrivée ; revenir dans la
//     fenêtre de la balise ne la rejoue pas.
//  D. Pause (Échap) pendant l'écriture : lettres et bips figés, bulle .is-paused ; page cachée puis revenue : figée,
//     partie toujours en pause ; REPRENDRE : l'écriture repart.
//  E. File : 3 messages poussés pendant qu'un autre s'affiche → 2 en attente (le plus ancien chassé), joués dans
//     l'ordre ; fin de l'étape : file vidée, bulle cachée ; marque tutorial-j1 enregistrée.
//  F. Sauvegarde avec tutorial-j1 : tutoriel muet (surchauffe, point de contrôle, fenêtres), messages d'histoire
//     toujours joués ; téléportation au-delà des fenêtres : sautées.
//  G. Mise en page à 844x390, 740x360 et 640x320, 3 et 5 cœurs, trois bonus allumés : bulle dans la fenêtre, sous
//     les stats, sans toucher pause, jauge, bonus, commandes tactiles ni messages (qui passent dessous, un seul à la
//     fois, au-dessus de Kaï) ; les messages glissent (transition de top) quand la bulle paraît et se cache. Captures.
//  H. j3 : radio brouillée de bout en bout (bulle « scrambled ») ; Kaï posé dans chaque fenêtre, dans l'ordre du
//     niveau : chaque message demandé une fois, joué sans être chassé, avec son texte du clavier s'il en a un.
import { assert, assertEq, fmt, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { overlaps } from '../lib/core.mjs';
import { placeKai } from '../lib/game2d.mjs';
import { clickResume, instrument, setHidden, waitPaused, waitResumed } from '../lib/shell.mjs';

export const meta = {
  title: 'Radio de LUMA : fenêtres, téléportation, bips, pause, file, tutoriel, mise en page',
  suites: ['full'],
  dev: true,
  timeoutMs: 300000,
};

const SAVE_KEY = 'xeno-rift-save-v1';
/** Écart minimal entre deux bips (story/bubble.ts, BIP_GAP_S), en ms, moins une marge d'arrondi. */
const BIP_GAP_MS = 124;
const BUBBLE = '.hud .xr-bubble--radio';

/** Avant t.goto : journal des textes posés dans le nœud aria-live de la bulle (un par changement). */
async function recordAria(t) {
  await t.page.addInitScript(() => {
    window.__srLog = [];
    new MutationObserver((recs) => {
      const seen = new Set();
      for (const r of recs) {
        const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (n && n.matches && n.matches('.xr-bubble--radio .xr-sr') && !seen.has(n)) {
          seen.add(n);
          window.__srLog.push(n.textContent);
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

/**
 * Avant t.goto : sons de la radio (AudioApi.sfx de la coquille, enveloppé dès que __xrShell existe, avant le
 * lancement de l'étape) : window.__sfxLog = [id, instant (ms), hauteur].
 */
async function recordSfx(t) {
  await t.page.addInitScript(() => {
    window.__sfxLog = [];
    const id = setInterval(() => {
      const a = window.__xrShell && window.__xrShell.audio;
      if (!a) return;
      clearInterval(id);
      const orig = a.sfx;
      a.sfx = function (sfx, opts) {
        if (sfx === 'lumaBip' || sfx === 'radioOpen') window.__sfxLog.push([sfx, performance.now(), opts && opts.pitch]);
        return orig.call(this, sfx, opts);
      };
    }, 5);
  });
}

/** État de la radio (__xrShell.radio), de sa bulle et des fenêtres du niveau ([id, 0 attente | 1 jouée | 2 sautée]). */
function radio(t) {
  return t.ev(() => {
    const r = window.__xrShell.radio();
    const b = document.querySelector('.hud .xr-bubble--radio');
    const s = window.__xr2d && window.__xr2d.scene;
    return {
      ...r,
      bubble: b
        ? {
            hidden: b.classList.contains('is-hidden'),
            paused: b.classList.contains('is-paused'),
            mood: b.dataset.mood,
            speaker: b.dataset.speaker,
            status: b.querySelector('.xr-bubble-status').textContent,
            revealed: b.querySelectorAll('.xr-bubble-text > span.is-on').length,
          }
        : null,
      windows: s && s.levelEvents ? s.levelEvents.windows.map((w) => [w.id, w.state]) : null,
      text: r.text,
      bips: window.__sfxLog ? window.__sfxLog.filter((e) => e[0] === 'lumaBip').length : 0,
    };
  });
}

function waitRadio(t, pred, label, { timeout = 15000, arg } = {}) {
  return waitFor(t, pred, { timeout, interval: 60, label, arg }).catch(async (e) => {
    throw new Error(`${e.message} ; radio : ${fmt(await radio(t))}`);
  });
}

/** Fois où `id` a été affiché ou attend de l'être. */
function count(r, id) {
  return r.played.filter((p) => p === id).length + r.waiting.filter((p) => p === id).length;
}

/**
 * Espionne LevelEvents.say de la partie en cours (appelé une fois par message déclenché, avant la radio et sa file) :
 * window.__said = identifiants demandés.
 */
function spySay(t) {
  return t.ev(() => {
    const le = window.__xr2d.scene.levelEvents;
    const orig = le.say;
    window.__said = [];
    le.say = (id) => {
      window.__said.push(id);
      orig(id);
    };
  });
}

/** Appels à LevelEvents.say pour `id` depuis spySay. */
function said(t, id) {
  return t.ev((m) => window.__said.filter((s) => s === m).length, id);
}

/**
 * Journal des glissements des messages : à chaque ajout ou retrait de .is-below-radio, transitions de .toasts
 * lancées par ce changement (getAnimations dans l'observateur : style recalculé, transition créée si top
 * s'interpole). window.__toastSlides = [classe posée, propriétés en transition].
 */
function recordToastSlides(t) {
  return t.ev(() => {
    const el = document.querySelector('.toasts');
    window.__toastSlides = [];
    let below = el.classList.contains('is-below-radio');
    new MutationObserver(() => {
      const now = el.classList.contains('is-below-radio');
      if (now === below) return;
      below = now;
      window.__toastSlides.push([now, el.getAnimations().map((a) => a.transitionProperty || a.constructor.name)]);
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}

/** Message poussé directement dans la radio (comme le ferait un mode : hooks.hud.radio). */
function push(t, ids) {
  return t.ev((list) => {
    for (const id of list) window.__xr2d.scene.session.hooks.hud.radio(id);
  }, ids);
}

/** Surchauffe de l'arme (Tir maintenu jusqu'à la surchauffe ; `again` : jauge remise juste sous le seuil). */
async function overheat(t, label, again = false) {
  if (again) await t.ev(() => Object.assign(window.__xr2d.scene.gun, { overheated: false, heat: 0.95 }));
  await t.page.keyboard.down('KeyJ');
  try {
    await waitFor(t, () => window.__xr2d.scene.gun.overheated, { timeout: 5000, interval: 30, label: `${label} : surchauffe` });
  } finally {
    await t.page.keyboard.up('KeyJ');
  }
}

/** Bulle : ni elle ni son contenu ne reçoivent le pointeur ; un toucher en son centre atteint ce qui est dessous. */
async function assertNotClickable(t, label) {
  const r = await t.ev((sel) => {
    const b = document.querySelector(sel);
    const all = [b, ...b.querySelectorAll('*')];
    const bad = all.filter((e) => getComputedStyle(e).pointerEvents !== 'none').map((e) => e.className || e.tagName);
    const box = b.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { bad, hitInside: !!hit && b.contains(hit), hit: hit ? hit.tagName + '.' + hit.className : null };
  }, BUBBLE);
  assertEq(r.bad, [], `${label} : pointer-events: none sur la bulle et tout son contenu`);
  assert(!r.hitInside, `${label} : le centre de la bulle laisse passer le toucher (${r.hit})`);
}

/**
 * Bips et texte accessible d'un message : bips entre son radioOpen et le suivant (ou la fin du journal), écart
 * minimal, et texte complet posé une seule fois dans le nœud aria-live.
 */
async function assertSpoken(t, text, label) {
  const { log, sr } = await t.ev(() => ({ log: window.__sfxLog.slice(), sr: window.__srLog.slice() }));
  const opens = log.map((e, i) => (e[0] === 'radioOpen' ? i : -1)).filter((i) => i >= 0);
  assert(opens.length > 0, `${label} : radioOpen joué (${fmt(log.slice(0, 4))})`);
  const i0 = opens[opens.length - 1];
  const bips = log.slice(i0 + 1).filter((e) => e[0] === 'lumaBip');
  assert(bips.length >= 5, `${label} : des bips pendant l'écriture (${bips.length})`);
  assert(bips[0][1] - log[i0][1] >= 250, `${label} : radioOpen avant la première lettre (${Math.round(bips[0][1] - log[i0][1])} ms)`);
  let minGap = Infinity;
  for (let i = 1; i < bips.length; i++) minGap = Math.min(minGap, bips[i][1] - bips[i - 1][1]);
  assert(minGap >= BIP_GAP_MS, `${label} : bips espacés de 125 ms au moins (8 par seconde au plus, une voix) : ${Math.round(minGap)} ms`);
  const pitches = new Set(bips.map((b) => b[2]));
  assert(pitches.size >= 3, `${label} : hauteur des bips selon la lettre (${[...pitches].join(', ')})`);
  const full = `LUMA : ${text}`;
  const mine = sr.filter((s) => s.length > 0 && full.startsWith(s.slice(0, 12)));
  assertEq(mine, [full], `${label} : texte complet posé une seule fois dans le nœud aria-live`);
  t.log(`${label} : ${bips.length} bips, écart min ${Math.round(minGap)} ms, ${pitches.size} hauteurs`);
}

/** Charge `query`, partie 2D jouable, Kaï invincible. */
async function start(t, query) {
  await t.goto(query);
  await waitFor2dPlay(t);
  await t.ev(() => window.__xr2d.god(true));
}

/** Lettres écrites dans la bulle de la radio (sélecteur). */
const LETTERS = `${BUBBLE} .xr-bubble-text > span.is-on`;

/**
 * Dans la page : premier contact entre Kaï et le premier marcheur (enclos 35-40) relevé à chaque image (postupdate),
 * avec l'état de la radio à cet instant : window.__contact. `drive` : → tenu, saut au pilier (touches simulées).
 */
function watchContact(t, drive) {
  return t.ev(
    ([drive, sel]) => {
      const s = window.__xr2d.scene;
      const w = s.enemies.list.find((e) => e.kind === 'w' && e.homeX > 35 * 64 && e.homeX < 41 * 64);
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code }));
      window.__contact = null;
      let jumpAt = -1;
      if (drive) key('keydown', 'ArrowRight');
      const f = () => {
        const p = s.player;
        const now = performance.now();
        if (drive && jumpAt < 0 && p.x >= 31.4 * 64) {
          jumpAt = now;
          key('keydown', 'Space');
        } else if (jumpAt > 0 && now - jumpAt > 300) {
          jumpAt = Infinity;
          key('keyup', 'Space');
        }
        const b = w.body;
        const touch = !w.alive || (p.right > b.x && p.left < b.x + b.width && p.feetY > b.y && p.top < b.y + b.height);
        if (!touch) return;
        const r = window.__xrShell.radio();
        window.__contact = { at: now, kaiX: Math.round(p.x), walkerX: Math.round(w.sprite.x), played: r.played.slice(), current: r.current, phase: r.phase, letters: document.querySelectorAll(sel).length };
        s.events.off('postupdate', f);
        if (drive) key('keyup', 'ArrowRight');
        if (jumpAt !== Infinity && jumpAt > 0) key('keyup', 'Space');
      };
      s.events.on('postupdate', f);
      return { walker: Math.round(w.homeX / 64 - 0.5) };
    },
    [drive, LETTERS],
  );
}

/** Ouverture (radioOpen, performance.now) de chaque message joué depuis le chargement : [id, instant]. */
function opens(t) {
  return t.ev(() => {
    const ids = window.__xrShell.radio().played;
    const at = window.__sfxLog.filter((e) => e[0] === 'radioOpen').map((e) => e[1]);
    return ids.map((id, i) => [id, at[i]]);
  });
}

/** Mise en page (G) : tutoriel déjà vu, seuls les messages d'histoire et ceux poussés par le test. */
const BASE_SAVE = { version: 2, unlocked: 0, best: {}, settings: { unlockAll: true }, story: { seen: ['tutorial-j1'] } };

export default async function (t) {
  await instrument(t);
  await recordAria(t);
  await recordSfx(t);
  await start(t, '?touch=0&unlock=1&stage=j1');
  const RADIO = await t.ev(async () => (await import('/src/core/story.ts')).RADIO);

  // ---------------------------------------------------------------- A. Départ
  await waitRadio(t, () => {
    const i = window.__xrShell.radio();
    return i.current === 'j1-start' && (i.phase === 'typing' || i.phase === 'hold');
  }, 'A : message de départ affiché');
  let r = await radio(t);
  assertEq(
    r.windows.filter((w) => w[1] !== 0),
    [['j1-start', 1], ['tuto-move', 1]],
    'A : fenêtres du départ jouées, toutes les autres en attente',
  );
  assertEq(r.waiting, ['tuto-move'], 'A : « courir et sauter » en attente derrière le message de départ');
  assert(r.bubble && !r.bubble.hidden && r.bubble.speaker === 'luma' && r.bubble.mood === 'scrambled', `A : bulle de LUMA brouillée (${fmt(r.bubble)})`);
  assertEq(r.bubble.status, 'signal brouillé', 'A : mention « signal brouillé »');
  await assertNotClickable(t, 'A');
  await t.shot('start-typing');
  await waitRadio(t, () => window.__xrShell.radio().phase === 'hold', 'A : message de départ entièrement écrit');
  await assertSpoken(t, RADIO['j1-start'].text, 'A (départ)');
  await t.shot('start-written');
  await waitRadio(t, () => window.__xrShell.radio().current === 'tuto-move', 'A : tutoriel « courir et sauter » affiché', { timeout: 20000 });
  assertEq((await radio(t)).text, RADIO['tuto-move'].keys, 'A : texte du clavier sans commandes tactiles');
  const pen = await t.ev(() => {
    const s = window.__xr2d.scene;
    const ws = s.enemies.list.filter((e) => e.kind === 'w' && e.alive && !e.summoned).map((e) => e.sprite.x / 64);
    return { first: Math.min(...ws), kai: s.player.x / 64 };
  });
  assert(pen.first >= 35 && pen.first <= 41 && pen.kai < 9, `A : Kaï immobile, premier marcheur toujours dans son enclos 35-40 (${fmt(pen)})`);

  // ---------------------------------------------------------------- A2. Départ à pleine course
  await start(t, '?touch=0&unlock=1&stage=j1');
  const a2 = await watchContact(t, true);
  await waitFor(t, () => window.__contact, { timeout: 15000, interval: 50, label: `A2 : Kaï atteint le premier marcheur (${a2.walker})` });
  const c2 = await t.ev(() => window.__contact);
  const o2 = await opens(t);
  const stomp2 = o2.find((o) => o[0] === 'tuto-stomp');
  t.log(`A2 : contact en x ${c2.kaiX} (marcheur ${c2.walkerX}) ; radio : ${fmt(o2.map(([id, at]) => [id, Math.round(at - c2.at)]))} ms par rapport au contact ; ${c2.current} ${c2.phase}, ${c2.letters} lettres`);
  assert(stomp2 && stomp2[1] < c2.at, `A2 : « tuto-stomp » ouvert avant le contact (${fmt({ c2, o2 })})`);
  assertEq(o2.slice(0, 2).map((o) => o[0]), ['j1-start', 'tuto-stomp'], 'A2 : « tuto-stomp » (urgent) passé devant « tuto-move »');
  await waitRadio(t, () => window.__xrShell.radio().played.includes('tuto-move'), 'A2 : « tuto-move » joué ensuite', { timeout: 20000 });

  // ---------------------------------------------------------------- A3. Départ à 2,5 colonnes/s
  await start(t, '?touch=0&unlock=1&stage=j1');
  await watchContact(t, false);
  const steps = await t.ev(
    (sel) =>
      new Promise((done) => {
        const log = [];
        let col = 8;
        const id = setInterval(() => {
          col++;
          window.__xr2d.teleport(col, 11);
          const r = window.__xrShell.radio();
          log.push({ col, played: r.played.slice(), current: r.current, letters: document.querySelectorAll(sel).length });
          if (col >= 32) {
            clearInterval(id);
            done(log);
          }
        }, 400);
      }),
    LETTERS,
  );
  const at30 = steps.find((s) => s.col === 30);
  const at32 = steps.find((s) => s.col === 32);
  const open3 = steps.find((s) => s.played.includes('tuto-stomp'));
  t.log(`A3 : « tuto-stomp » ouvert à la colonne ${open3 ? open3.col : '-'} ; au pilier (32) : ${at32.current}, ${at32.letters} lettres ; ordre ${fmt(at32.played)}`);
  assert(at30.played.includes('tuto-stomp'), `A3 : « tuto-stomp » ouvert avant la colonne 30 (${fmt(steps.map((s) => [s.col, s.current, s.letters]))})`);
  const first = RADIO['tuto-stomp'].keys.indexOf('.') + 1;
  assert(at32.played.includes('tuto-stomp') && (at32.current !== 'tuto-stomp' || at32.letters >= first), `A3 : au pied du pilier, « ${RADIO['tuto-stomp'].keys.slice(0, first)} » écrit (${fmt(at32)})`);
  assert(!(await t.ev(() => window.__contact)), 'A3 : aucun contact avec le marcheur (enclos)');

  // Partie neuve pour la suite (fenêtres du départ seules jouées).
  await start(t, '?touch=0&unlock=1&stage=j1');

  // ---------------------------------------------------------------- B. Surchauffe
  await spySay(t);
  await overheat(t, 'B');
  r = await radio(t);
  assert(r.current === 'tuto-overheat' || r.waiting.includes('tuto-overheat'), `B : message du tutoriel à la surchauffe (${fmt(r)})`);
  await waitRadio(t, () => window.__xrShell.radio().current === 'tuto-overheat', 'B : message du tutoriel affiché');
  // Radio au repos : un second appel ne serait plus absorbé par sa file (doublon ignoré), il rejouerait le message.
  await waitRadio(t, () => window.__xrShell.radio().phase === 'idle', 'B : radio revenue au repos', { timeout: 20000 });
  await overheat(t, 'B (seconde)', true);
  await t.wait(800);
  r = await radio(t);
  assertEq([await said(t, 'tuto-overheat'), count(r, 'tuto-overheat'), r.phase], [1, 1, 'idle'], 'B : seconde surchauffe : message pas rejoué');

  // ---------------------------------------------------------------- C. Tutoriel complet
  // Ordre du niveau : fenêtres (Kaï posé sur une case debout de la fenêtre) et déclencheurs à colonne connue.
  const TOUR = [
    ['tuto-stomp', 17, 11],
    ['tuto-aim', 56, 11],
    ['tuto-drop', 64, 11],
    ['tuto-checkpoint', 78, 11, 'point de contrôle 78'],
    ['tuto-blocks', 91, 11],
    ['tuto-armored', 118, 11],
    ['tuto-door', 140, 11],
    ['j1-ruin', 144, 9, 'porte du rocher, ↑'],
    ['tuto-later', 151, 11],
    ['j1-beacon', 195, 11],
  ];
  const windowsC = await t.ev(() => window.__xr2d.scene.levelEvents.windows.map((w) => [w.id, w.col0, w.col1]));
  for (const [id, col, row, how] of TOUR) {
    const win = windowsC.find((w) => w[0] === id);
    if (win) assert(col >= win[1] && col <= win[2], `C : « ${id} » : colonne ${col} dans sa fenêtre ${win[1]}-${win[2]}`);
    await placeKai(t, col, row, `C (${how || id})`);
    if (id === 'j1-ruin') {
      assert(await t.ev(() => window.__xr2d.scene.glyphs.list.every((g) => !g.lit)), 'C : glyphes de la ruine éteints avant la porte');
      await t.key('ArrowUp', 80);
    }
    await waitRadio(t, (m) => window.__said.filter((x) => x === m).length === 1, `C : « ${id} » demandé (${how || `colonne ${col}`})`, { arg: id, timeout: 5000 });
    await waitRadio(t, (m) => window.__xrShell.radio().played.includes(m), `C : « ${id} » joué par la radio`, { arg: id, timeout: 25000 });
    const shown = await radio(t);
    if (shown.current === id) assertEq(shown.text, RADIO[id].keys || RADIO[id].text, `C : « ${id} » : texte du clavier`);
    if (id === 'j1-ruin') {
      await waitRadio(t, () => window.__xr2d.scene.glyphs.list.every((g) => g.lit && g.on.alpha > 0.99), 'C : ruine : glyphes allumés', { timeout: 4000 });
      assertEq(await t.ev(() => window.__xr2d.scene.glyphs.list.length), 6, 'C : 6 glyphes dans la ruine');
      await t.shot('ruin-glyphs');
    }
  }
  // Revenir dans la fenêtre de la balise ne la rejoue pas ; puis l'arène (déclencheur « boss »).
  await placeKai(t, 184, 11, 'C (retour avant la fenêtre de la balise)');
  await placeKai(t, 196, 11, 'C (de nouveau dans la fenêtre)');
  await t.ev(() => window.__xr2d.boss.enter());
  await waitRadio(t, () => window.__said.includes('j1-boss'), 'C : « j1-boss » demandé à l’entrée dans l’arène', { timeout: 5000 });
  await waitRadio(t, () => window.__xrShell.radio().played.includes('j1-boss'), 'C : « j1-boss » joué', { timeout: 25000 });
  r = await radio(t);
  assertEq(r.windows.filter((w) => w[1] !== 1), [], 'C : toutes les fenêtres jouées, aucune sautée');
  const ORDER = ['tuto-overheat', ...TOUR.map((v) => v[0]), 'j1-boss'];
  assertEq(await t.ev(() => window.__said.slice()), ORDER, 'C : LevelEvents.say : chaque message une fois, dans l’ordre du niveau');
  assertEq(
    r.played.filter((id) => id !== 'j1-start' && id !== 'tuto-move'),
    ORDER,
    'C : radio : tous joués, aucun chassé de la file',
  );

  // ---------------------------------------------------------------- D. Pause et page cachée
  await waitRadio(t, () => window.__xrShell.radio().phase === 'idle', 'D : radio au repos', { timeout: 20000 });
  await push(t, ['j1-beacon']);
  await waitRadio(
    t,
    (sel) => {
      const i = window.__xrShell.radio();
      return i.current === 'j1-beacon' && i.phase === 'typing' && document.querySelectorAll(`${sel} .xr-bubble-text > span.is-on`).length >= 6;
    },
    'D : message de la balise en cours d’écriture',
    { arg: BUBBLE },
  );
  await t.page.keyboard.press('Escape');
  await waitPaused(t, 'D : pause par Échap');
  const p0 = await radio(t);
  assert(p0.paused && p0.bubble.paused, `D : radio en pause (${fmt({ paused: p0.paused, bubble: p0.bubble })})`);
  assert(p0.typing && p0.bubble.revealed < RADIO['j1-beacon'].text.length, `D : écriture inachevée à la pause (${p0.bubble.revealed})`);
  await t.wait(1000);
  let p1 = await radio(t);
  assertEq([p1.bubble.revealed, p1.bips], [p0.bubble.revealed, p0.bips], 'D : pause : lettres et bips figés (1 s)');
  await setHidden(t, true);
  await t.wait(700);
  await setHidden(t, false);
  await t.wait(500);
  p1 = await radio(t);
  assertEq([p1.bubble.revealed, p1.bips, p1.paused], [p0.bubble.revealed, p0.bips, true], 'D : page cachée puis revenue : toujours figée');
  await waitPaused(t, 'D : partie toujours en pause au retour');
  await t.shot('paused');
  await clickResume(t);
  await waitResumed(t, 'D : REPRENDRE');
  await waitRadio(
    t,
    ([sel, n]) => document.querySelectorAll(`${sel} .xr-bubble-text > span.is-on`).length > n && !window.__xrShell.radio().paused,
    'D : l’écriture repart',
    { timeout: 5000, arg: [BUBBLE, p0.bubble.revealed] },
  );

  // ---------------------------------------------------------------- E. File de 2 messages, fin de l'étape
  r = await radio(t);
  assertEq(r.current, 'j1-beacon', 'E : message affiché');
  await push(t, ['j1-start', 'j1-ruin', 'tuto-overheat']);
  r = await radio(t);
  assertEq(r.waiting, ['j1-ruin', 'tuto-overheat'], 'E : 2 messages en attente au plus, le plus ancien chassé');
  await waitRadio(t, () => window.__xrShell.radio().current === 'j1-ruin', 'E : message suivant de la file', { timeout: 20000 });
  r = await radio(t);
  assertEq(r.waiting, ['tuto-overheat'], 'E : file dans l’ordre');
  await t.ev(() => window.__xr2d.win());
  await waitForScreen(t, 'results', { timeout: 25000 });
  r = await radio(t);
  assertEq(
    { phase: r.phase, current: r.current, waiting: r.waiting, played: r.played, paused: r.paused, hidden: r.bubble.hidden },
    { phase: 'idle', current: null, waiting: [], played: [], paused: false, hidden: true },
    'E : fin de l’étape (hud.hide) : file vidée, bulle cachée',
  );
  assert(!(await t.ev(() => document.querySelector('.toasts').classList.contains('is-below-radio'))), 'E : messages de l’interface à leur place');
  const save = await readSave(t);
  assert(save.story.seen.includes('tutorial-j1'), `E : j1 réussi : marque tutorial-j1 enregistrée (${fmt(save.story)})`);

  // ---------------------------------------------------------------- F. Tutoriel terminé
  await start(t, '?touch=0&stage=j1');
  await waitRadio(t, () => window.__xrShell.radio().current === 'j1-start', 'F : message d’histoire toujours joué');
  await spySay(t);
  await overheat(t, 'F');
  await placeKai(t, 78, 11, 'F (point de contrôle 78)');
  await placeKai(t, 195, 11, 'F (fenêtre de la balise)');
  await waitRadio(t, () => window.__xrShell.radio().played.includes('j1-beacon'), 'F : message de la balise joué', { timeout: 25000 });
  r = await radio(t);
  assertEq(r.played, ['j1-start', 'j1-beacon'], `F : tutoriel muet après la réussite de j1, histoire jouée (${fmt(r)})`);
  assertEq(await t.ev(() => window.__said.slice()), ['tuto-overheat', 'tuto-checkpoint', 'j1-beacon'], 'F : messages demandés par le niveau (la radio filtre)');
  assertEq(
    r.windows,
    r.windows.map((w) => [w[0], w[0] === 'j1-start' || w[0] === 'tuto-move' || w[0] === 'j1-beacon' ? 1 : 2]),
    'F : fenêtres franchies par téléportation : sautées',
  );

  // ---------------------------------------------------------------- G. Mise en page
  const SIZES = [
    [844, 390, 2],
    [844, 390, 0],
    [740, 360, 2],
    [640, 320, 2],
    [640, 320, 0],
  ];
  const OTHERS = ['.hud-stats', '.hud-pause', '.hud-heat', '.hud-powers .hud-power.is-on', '.xr-dpad', '.xr-jump', '.xr-fire'];
  for (const [w, h, extra] of SIZES) {
    const tag = `G ${w}x${h}, ${3 + extra} cœurs`;
    await t.page.setViewportSize({ width: w, height: h });
    await t.ev(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [SAVE_KEY, { ...BASE_SAVE, extraHearts: extra }]);
    await start(t, '?touch=1&stage=j1');
    await recordToastSlides(t);
    await push(t, ['j1-ruin']);
    await t.ev(() => ['speed', 'rapid', 'shield'].forEach((k) => window.__xr2d.power(k)));
    await waitFor(t, () => document.querySelectorAll('.hud-powers .hud-power.is-on').length === 3, { timeout: 3000, label: `${tag} : trois bonus au HUD` });
    for (const id of ['j1-start', 'j1-ruin']) {
      await waitRadio(
        t,
        ([sel, m]) => {
          const i = window.__xrShell.radio();
          const b = document.querySelector(sel);
          return i.current === m && i.phase === 'typing' && !!b && getComputedStyle(b).opacity === '1';
        },
        `${tag} : « ${id} » en cours d’écriture`,
        { timeout: 20000, arg: [BUBBLE, id] },
      );
      // Trois messages pendant que la bulle parle : un seul reste, sous la bulle (fin de toast-in : 260 ms).
      await t.ev((m) => {
        const hud = window.__xr2d.scene.session.hooks.hud;
        for (const text of ['Vitesse !', 'Cadence !', 'Bouclier !']) hud.toast(`${text} ${m}`, 'good');
      }, id);
      await t.wait(350);
      const geo = await t.ev(
        ([sel, others]) => {
          const box = (e, s) => {
            const r = e.getBoundingClientRect();
            return { sel: s, x: r.left, y: r.top, w: r.width, h: r.height, text: (e.textContent || '').trim().slice(0, 20) };
          };
          const list = [];
          for (const s of others) for (const e of document.querySelectorAll(s)) if (e.getBoundingClientRect().width > 0) list.push(box(e, s));
          // Haut de Kaï à l'écran (sprite, ou bulle du bouclier si elle dépasse).
          const sc = window.__xr2d.scene;
          const p = sc.player;
          const v = sc.cameras.main.worldView;
          const cr = sc.game.canvas.getBoundingClientRect();
          let top = p.sprite.getBounds().y;
          if (p.bubble.visible) top = Math.min(top, p.bubble.getBounds().y);
          return {
            kaiTop: cr.top + ((top - v.y) / v.height) * cr.height,
            W: window.innerWidth,
            H: window.innerHeight,
            b: box(document.querySelector(sel), sel),
            list,
            toasts: [...document.querySelectorAll('.toasts .toast')].map((e) => box(e, '.toast')),
            hearts: document.querySelectorAll('.hud-hearts .hud-heart').length,
          };
        },
        [BUBBLE, OTHERS],
      );
      assertEq(geo.hearts, 3 + extra, `${tag} : cœurs au HUD`);
      const b = geo.b;
      assert(b.x >= 0 && b.y >= 0 && b.x + b.w <= geo.W && b.y + b.h <= geo.H, `${tag} « ${id} » : bulle dans la fenêtre (${fmt(b)})`);
      const stats = geo.list.find((e) => e.sel === '.hud-stats');
      assert(stats && b.y >= stats.y + stats.h, `${tag} « ${id} » : bulle sous les stats (${fmt({ b, stats })})`);
      for (const o of geo.list) assert(!overlaps(b, o), `${tag} « ${id} » : la bulle touche ${o.sel} (${fmt({ b, o })})`);
      assertEq(geo.toasts.map((o) => o.text), [`Bouclier ! ${id}`.slice(0, 20)], `${tag} « ${id} » : un seul message sous la bulle, le dernier`);
      for (const o of geo.toasts) {
        assert(!overlaps(b, o), `${tag} « ${id} » : le message « ${o.text} » couvre la bulle (${fmt({ b, o })})`);
        assert(o.y + o.h <= geo.kaiTop, `${tag} « ${id} » : le message « ${o.text} » descend sur Kaï (bas ${Math.round(o.y + o.h)}, Kaï ${Math.round(geo.kaiTop)})`);
      }
      assertEq(geo.list.filter((e) => e.sel.includes('hud-power')).length, 3, `${tag} : trois bonus allumés`);
      await assertNotClickable(t, `${tag} « ${id} »`);
      const o = geo.toasts[0];
      t.log(`${tag} « ${id} » : bulle ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}, message ${Math.round(o.y)}-${Math.round(o.y + o.h)}, Kaï dès ${Math.round(geo.kaiTop)}`);
      await t.shot(`layout-${w}x${h}-${3 + extra}h-${id}`);
    }
    // Bulle ouverte, cachée (fin de « j1-start »), rouverte : les messages glissent à chaque fois.
    const slides = await t.ev(() => window.__toastSlides);
    assert(slides.some((s) => !s[0]) && slides.some((s) => s[0]), `${tag} : bulle cachée puis rouverte (${fmt(slides)})`);
    for (const [on, props] of slides) assert(props.includes('top'), `${tag} : messages ${on ? 'descendus' : 'remontés'} sans glisser (${fmt(slides)})`);
  }

  // ---------------------------------------------------------------- H. j3 : radio brouillée
  await t.page.setViewportSize({ width: 844, height: 390 });
  await start(t, '?touch=0&stage=j3');
  const J3 = [
    ['j3-start', 8, 11],
    ['j3-pits', 34, 11],
    ['j3-spores', 102, 11],
    ['j3-signal', 131, 11],
    ['j3-heart', 148, 11],
  ];
  const windowsH = await t.ev(() => window.__xr2d.scene.levelEvents.windows.map((w) => [w.id, w.col0, w.col1]));
  assertEq(windowsH.map((w) => w[0]), J3.map((v) => v[0]), 'H : messages de j3 dans l’ordre du niveau');
  await spySay(t);
  for (const [id, col, row] of J3) {
    const win = windowsH.find((w) => w[0] === id);
    assert(col >= win[1] && col <= win[2], `H : « ${id} » : colonne ${col} dans sa fenêtre ${win[1]}-${win[2]}`);
    // Le message du départ est demandé dès l'arrivée, avant l'espion.
    if (id !== 'j3-start') {
      await placeKai(t, col, row, `H (${id})`);
      await waitRadio(t, (m) => window.__said.filter((x) => x === m).length === 1, `H : « ${id} » demandé (colonne ${col})`, { arg: id, timeout: 5000 });
    }
    const shown = await waitRadio(
      t,
      ([m, sel]) => {
        const i = window.__xrShell.radio();
        const b = document.querySelector(sel);
        return i.current === m && b && !b.classList.contains('is-hidden') ? { text: i.text, mood: b.dataset.mood, speaker: b.dataset.speaker } : false;
      },
      `H : « ${id} » affiché`,
      { arg: [id, BUBBLE], timeout: 25000 },
    );
    assertEq(shown, { text: RADIO[id].keys || RADIO[id].text, mood: 'scrambled', speaker: 'luma' }, `H : « ${id} » : radio brouillée, texte du clavier`);
    await t.shot(`j3-${id}`);
  }
  await waitRadio(t, () => window.__xrShell.radio().phase === 'idle', 'H : radio au repos', { timeout: 20000 });
  r = await radio(t);
  assertEq(r.played, J3.map((v) => v[0]), 'H : tous joués dans l’ordre, aucun chassé de la file');
  assertEq(await t.ev(() => window.__said.slice()), J3.slice(1).map((v) => v[0]), 'H : LevelEvents.say : chaque message une fois');
  assertEq(r.windows.filter((w) => w[1] !== 1), [], 'H : toutes les fenêtres jouées');
}
