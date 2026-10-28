// Radio de LUMA en jeu (plan 04, points 7 et 14 ; choix 12) dans j1, sauvegarde neuve :
//  A. Message de départ (fenêtre 0-12) dès le début : radioOpen puis lettres ; bulle « signal brouillé » sans
//     pointer-events (elle et tout son contenu ; elementFromPoint passe à travers) ; texte complet posé une seule
//     fois dans le nœud aria-live ; bips lumaBip espacés d'au moins 125 ms (8 par seconde au plus, une voix).
//  B. Première surchauffe → message du tutoriel ; une seconde surchauffe, radio revenue au repos, ne le rejoue pas
//     (LevelEvents.say espionné : un seul appel par message, la file de la radio ne masque rien).
//  C. Téléportation au-delà de la ruine (127-137) : fenêtre sautée ; dans celle de la balise (193-206) : jouée une
//     fois (y revenir ne la rejoue pas : un seul appel à LevelEvents.say).
//  D. Pause (Échap) pendant l'écriture : lettres et bips figés, bulle .is-paused ; page cachée puis revenue : figée,
//     partie toujours en pause ; REPRENDRE : l'écriture repart.
//  E. File : 3 messages poussés pendant qu'un autre s'affiche → 2 en attente (le plus ancien chassé), joués dans
//     l'ordre ; fin de l'étape : file vidée, bulle cachée ; marque tutorial-j1 enregistrée.
//  F. Sauvegarde avec tutorial-j1 : tutoriel muet à la surchauffe, message d'histoire toujours joué.
//  G. Mise en page à 844x390, 740x360 et 640x320, 3 et 5 cœurs, trois bonus allumés : bulle dans la fenêtre, sous
//     les stats, sans toucher pause, jauge, bonus, commandes tactiles ni messages (qui passent dessous, un seul à la
//     fois, au-dessus de Kaï) ; les messages glissent (transition de top) quand la bulle paraît et se cache. Captures.
import { assert, assertEq, fmt, readSave, waitFor, waitFor2dPlay, waitForScreen } from '../lib/helpers.mjs';
import { overlaps } from '../lib/core.mjs';
import { placeKai } from '../lib/game2d.mjs';
import { clickResume, instrument, setHidden, waitPaused, waitResumed } from '../lib/shell.mjs';

export const meta = {
  title: 'Radio de LUMA : fenêtres, téléportation, bips, pause, file, tutoriel, mise en page',
  suites: ['full'],
  dev: true,
  timeoutMs: 240000,
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

const BASE_SAVE = { version: 2, unlocked: 0, best: {}, settings: { unlockAll: true }, story: { seen: [] } };

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
  assertEq(r.windows, [['j1-start', 1], ['j1-ruin', 0], ['j1-beacon', 0]], 'A : fenêtres après le départ');
  assert(r.bubble && !r.bubble.hidden && r.bubble.speaker === 'luma' && r.bubble.mood === 'scrambled', `A : bulle de LUMA brouillée (${fmt(r.bubble)})`);
  assertEq(r.bubble.status, 'signal brouillé', 'A : mention « signal brouillé »');
  await assertNotClickable(t, 'A');
  await t.shot('start-typing');
  await waitRadio(t, () => window.__xrShell.radio().phase === 'hold', 'A : message de départ entièrement écrit');
  await assertSpoken(t, RADIO['j1-start'].text, 'A (départ)');
  await t.shot('start-written');

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

  // ---------------------------------------------------------------- C. Fenêtres et téléportation
  await placeKai(t, 150, 11, 'C (au-delà de la ruine)');
  await waitRadio(t, () => window.__xr2d.scene.levelEvents.windows[1].state === 2, 'C : fenêtre de la ruine sautée');
  await placeKai(t, 195, 11, 'C (fenêtre de la balise)');
  await waitRadio(t, () => window.__xr2d.scene.levelEvents.windows[2].state === 1, 'C : fenêtre de la balise jouée');
  await placeKai(t, 184, 11, 'C (retour avant la fenêtre)');
  await placeKai(t, 196, 11, 'C (de nouveau dans la fenêtre)');
  await t.wait(300);
  r = await radio(t);
  assertEq(r.windows, [['j1-start', 1], ['j1-ruin', 2], ['j1-beacon', 1]], 'C : fenêtres');
  assert(!r.played.includes('j1-ruin') && !r.waiting.includes('j1-ruin'), `C : pas de message de la ruine (${fmt(r)})`);
  assertEq(count(r, 'j1-beacon'), 1, 'C : message de la balise une seule fois');
  assertEq([await said(t, 'j1-ruin'), await said(t, 'j1-beacon')], [0, 1], 'C : LevelEvents.say : ruine jamais, balise une fois');

  // ---------------------------------------------------------------- D. Pause et page cachée
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
  await overheat(t, 'F');
  await t.wait(1500);
  r = await radio(t);
  assert(r.current !== 'tuto-overheat' && count(r, 'tuto-overheat') === 0, `F : tutoriel muet après la réussite de j1 (${fmt(r)})`);

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
}
