// Diagnostic : page d'aperçu des cinématiques (/preview/story.html, serveur de dev seulement). Captures à
// plusieurs instants du prologue et de la libération (figées par ?t=…&hold=1, en 844x390 et 640x320), puis
// vérifications du lecteur : cinématique cliquable sous un parent en pointer-events: none (comme #ui-root),
// bulle sans pointer-events et texte complet aria-live, toucher sur l'image = fin de
// la réplique, bips ≤ 8 par seconde, page cachée = horloge arrêtée (et boucle stoppée), pause de l'interface
// cumulable, pas borné après un long blocage, Passer = 'skipped', fin naturelle = 'ended' avec les repères dans
// l'ordre, destroy() sans rAF, écouteur ni DOM restants. Aucune erreur console.
import { assert, assertEq, waitFor } from '../lib/helpers.mjs';
import { instrument, setHidden } from '../lib/shell.mjs';

export const meta = {
  title: 'Aperçu des cinématiques (preview/story.html) : captures, Passer, page cachée, destroy',
  suites: ['diag'],
  dev: true,
  timeoutMs: 240000,
  viewport: { width: 844, height: 390 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

const SHOTS = [
  ['prologue', 2.4, 'signal'],
  ['prologue', 7.6, 'decision-amused'],
  ['prologue', 11.6, 'rift-pull'],
  ['prologue', 13.3, 'rift-suck'],
  ['prologue', 14.9, 'tunnel'],
  ['prologue', 19.4, 'void-worlds'],
  ['prologue', 21.5, 'dive-xena'],
  ['prologue', 25.5, 'landing-impact'],
  ['prologue', 29.6, 'alive'],
  ['prologue', 34.4, 'guardian'],
  ['prologue', 37.9, 'goal'],
  ['prologue', 38.5, 'scramble-burst'],
  ['prologue', 41.4, 'on-foot-scrambled'],
  ['liberation', 0.9, 'void-leaves'],
  ['liberation', 2.6, 'colors-return'],
  ['liberation', 5.2, 'core'],
  ['liberation', 7.0, 'skill-banner'],
  ['liberation', 7.9, 'double-jump'],
  ['liberation', 10.9, 'ship-landed'],
  ['liberation', 13.4, 'takeoff'],
];

const SMALL = [
  ['prologue', 29.6, 'small-alive'],
  ['liberation', 9.6, 'small-skill'],
];

/** Compteurs posés avant le chargement : rAF en attente, écouteurs de document et window par type. */
async function spy(t) {
  await t.page.addInitScript(() => {
    const pending = new Set();
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      const id = raf((ts) => {
        pending.delete(id);
        cb(ts);
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      caf(id);
    };
    window.__rafPending = () => pending.size;
    const listeners = new Map();
    const label = (target) => (target === window ? 'window' : target === document ? 'document' : null);
    const add = EventTarget.prototype.addEventListener;
    const rem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      const l = label(this);
      if (l && fn) {
        const key = `${l}:${type}`;
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(fn);
      }
      return add.call(this, type, fn, opts);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      const l = label(this);
      if (l && fn && listeners.has(`${l}:${type}`)) listeners.get(`${l}:${type}`).delete(fn);
      return rem.call(this, type, fn, opts);
    };
    window.__listeners = () => {
      const o = {};
      for (const [k, s] of listeners) if (s.size) o[k] = s.size;
      return o;
    };
  });
}

const info = (t) => t.ev(() => window.__story.info());

async function open(t, query) {
  await t.goto(`preview/story.html?${query}`);
  await waitFor(t, () => window.__story && window.__story.ready, { timeout: 30000, label: `aperçu ${query}` });
}

export default async function (t) {
  // ------------------------------------------------------------ Captures
  await t.page.setViewportSize({ width: 1400, height: 700 });
  await open(t, 'view=portraits');
  await t.wait(300);
  await t.shot('portraits');
  await t.page.setViewportSize({ width: 844, height: 390 });
  for (const [cut, at, tag] of SHOTS) {
    await open(t, `cut=${cut}&t=${at}&hold=1&ui=0`);
    await t.wait(450); // fondu d'entrée de la bulle (CSS)
    const i = await info(t);
    assert(Math.abs(i.t - at) < 0.001, `${cut} figée à ${at} s (lu ${i.t})`);
    t.log(`${cut} ${at} s : bulle ${i.bubbleVisible ? `${i.speaker}/${i.mood} ${i.lettersOn}/${i.letters}` : 'cachée'}`);
    await t.shot(`${cut}-${String(at).replace('.', '_')}-${tag}`);
    // La gardienne au loin : taches grises lisibles ? (zone agrandie)
    if (tag === 'goal') await t.shot('prologue-whale-zoom', { clip: { x: 330, y: 0, width: 340, height: 170 }, zoom: 2 });
  }
  await t.page.setViewportSize({ width: 640, height: 320 });
  for (const [cut, at, tag] of SMALL) {
    await open(t, `cut=${cut}&t=${at}&hold=1&ui=0`);
    await t.wait(450);
    await t.shot(`${cut}-${String(at).replace('.', '_')}-${tag}`);
  }
  await t.page.setViewportSize({ width: 844, height: 390 });

  // ------------------------------------------------------------ Lecture réelle
  await instrument(t);
  await spy(t);
  await open(t, 'cut=prologue&ui=0');
  const dom = await t.ev(() => {
    const b = document.querySelector('.cs-bubble');
    const skip = document.querySelector('.cs-skip');
    const cnv = document.querySelector('.cs-canvas');
    const live = b && b.querySelector('[aria-live]');
    const cs = document.querySelector('.cs');
    return {
      // #root est en pointer-events: none comme #ui-root : la cinématique doit rétablir les siens.
      csPE: cs ? getComputedStyle(cs).pointerEvents : null,
      bubblePE: b ? getComputedStyle(b).pointerEvents : null,
      skipTag: skip ? skip.tagName : null,
      skipPE: skip ? getComputedStyle(skip).pointerEvents : null,
      canvas: cnv ? [cnv.width, cnv.height, cnv.clientWidth, cnv.clientHeight] : null,
      dpr: window.devicePixelRatio,
      live: live ? live.textContent : null,
      raf: window.__rafPending(),
    };
  });
  t.log('DOM', JSON.stringify(dom));
  assertEq(dom.csPE, 'auto', 'cinématique cliquable dans un parent en pointer-events: none');
  assertEq(dom.bubblePE, 'none', 'bulle sans pointer-events');
  assertEq(dom.skipTag, 'BUTTON', 'Passer est un <button>');
  assertEq(dom.skipPE, 'auto', 'Passer cliquable');
  assert(dom.canvas && dom.canvas[0] <= Math.ceil(dom.canvas[2] * Math.min(1.5, dom.dpr)) + 1, 'densité du canvas ≤ 1,5');
  assert(dom.raf >= 1, 'boucle en marche');

  // Toucher sur l'image : la réplique en cours s'affiche en entier.
  await waitFor(t, () => {
    const i = window.__story.info();
    return i.typing && i.lettersOn > 3 && i.lettersOn < i.letters - 10;
  }, { timeout: 8000, label: 'réplique en cours d’écriture' });
  await t.page.touchscreen.tap(420, 120);
  const tapped = await info(t);
  assert(!tapped.typing && tapped.lettersOn === tapped.letters, `toucher = texte complet (${tapped.lettersOn}/${tapped.letters})`);
  const live = await t.ev(() => document.querySelector('.cs-bubble [aria-live]').textContent);
  assert(/^LUMA : Kaï, je capte un signal/.test(live), `texte complet aria-live (${live})`);

  // Bips pendant les répliques suivantes : jamais deux à moins de 125 ms.
  await waitFor(t, () => window.__story.handle.time > 8.9, { timeout: 15000, label: 'prologue à 8,9 s' });
  const bips = await t.ev(() => window.__story.cues.filter((c) => c.c === 'bip').map((c) => c.at));
  let minGap = Infinity;
  for (let i = 1; i < bips.length; i++) minGap = Math.min(minGap, bips[i] - bips[i - 1]);
  t.log(`bips : ${bips.length}, écart minimal ${minGap} ms`);
  assert(bips.length >= 8, 'des bips pendant l’écriture');
  assert(minGap >= 120, `bips ≤ 8 par seconde (écart minimal ${minGap} ms)`);

  // Page cachée : horloge arrêtée, boucle stoppée ; reprise seule au retour.
  await setHidden(t, true);
  const h0 = await info(t);
  await t.wait(800);
  const h1 = await info(t);
  const rafHidden = await t.ev(() => window.__rafPending());
  t.log(`cachée : ${h0.t} → ${h1.t} s, rAF ${rafHidden}`);
  assert(h1.paused && Math.abs(h1.t - h0.t) < 0.001, 'page cachée : horloge arrêtée');
  assertEq(rafHidden, 0, 'page cachée : plus de requestAnimationFrame');
  await setHidden(t, false);
  await t.wait(500);
  const h2 = await info(t);
  assert(!h2.paused && h2.t > h1.t + 0.2, `reprise seule au retour (${h1.t} → ${h2.t})`);

  // Pause de l'interface + page cachée : cumulables.
  await t.ev(() => window.__story.handle.pause());
  await setHidden(t, true);
  await setHidden(t, false);
  const p0 = await info(t);
  await t.wait(500);
  const p1 = await info(t);
  assert(p1.paused && Math.abs(p1.t - p0.t) < 0.001, 'pause de l’interface gardée après le retour de la page');
  await t.ev(() => window.__story.handle.resume());
  await t.wait(400);
  const p2 = await info(t);
  assert(!p2.paused && p2.t > p1.t + 0.15, 'reprise par resume()');

  // Pas borné : un blocage de 700 ms n'avance l'horloge que d'un pas.
  const b0 = await t.ev(() => {
    const t0 = window.__story.handle.time;
    const end = performance.now() + 700;
    while (performance.now() < end) {
      // blocage volontaire
    }
    return t0;
  });
  const b1 = await t.ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(window.__story.handle.time)))));
  t.log(`après un blocage de 700 ms : +${(b1 - b0).toFixed(3)} s`);
  assert(b1 - b0 < 0.25, `pas borné (+${(b1 - b0).toFixed(3)} s)`);

  // Passer
  await t.page.click('.cs-skip');
  await waitFor(t, () => window.__story.result === 'skipped', { timeout: 3000, label: 'Passer → skipped' });
  const s0 = await info(t);
  await t.wait(300);
  const s1 = await info(t);
  assert(s0.state === 'skipped' && s1.t === s0.t, 'après Passer : terminée, horloge arrêtée');

  // destroy() : ni rAF, ni écouteur, ni DOM.
  await t.ev(() => window.__story.destroy());
  await t.wait(200);
  const base = await t.ev(() => ({ l: window.__listeners(), raf: window.__rafPending(), nodes: document.getElementById('root').childElementCount }));
  t.log('sans cinématique', JSON.stringify(base));
  assertEq(base.raf, 0, 'aucun rAF après destroy()');
  assertEq(base.nodes, 0, 'aucun DOM après destroy()');

  // Libération en entier : repères dans l'ordre, fin 'ended', puis destroy() revient à l'état de départ.
  await t.ev(() => window.__story.start('liberation', 0));
  const during = await t.ev(() => window.__listeners());
  t.log('pendant la libération', JSON.stringify(during));
  assert((during['document:visibilitychange'] || 0) === (base.l['document:visibilitychange'] || 0) + 1, 'un écouteur visibilitychange');
  await waitFor(t, () => window.__story.result === 'ended', { timeout: 25000, interval: 250, label: 'libération jouée jusqu’au bout' });
  const cues = await t.ev(() => window.__story.cues.filter((c) => c.c !== 'bip').map((c) => c.c));
  t.log('repères', cues.join(' '));
  assertEq(cues, ['vide', 'heal', 'core', 'skill', 'landing', 'takeoff'], 'repères de la libération');
  const libBips = await t.ev(() => window.__story.cues.filter((c) => c.c === 'bip').map((c) => c.at));
  for (let i = 1; i < libBips.length; i++) assert(libBips[i] - libBips[i - 1] >= 120, 'bips de la libération ≤ 8 par seconde');
  await t.ev(() => window.__story.destroy());
  await t.wait(200);
  const after = await t.ev(() => ({ l: window.__listeners(), raf: window.__rafPending(), nodes: document.getElementById('root').childElementCount }));
  t.log('après destroy()', JSON.stringify(after));
  assertEq(after.l, base.l, 'écouteurs revenus à l’état sans cinématique');
  assertEq(after.raf, 0, 'aucun rAF après destroy()');
  assertEq(after.nodes, 0, 'aucun DOM après destroy()');

  // Départ en cours de route : pas de repère antérieur, fin 'ended'.
  await t.ev(() => window.__story.start('prologue', 41.5));
  await waitFor(t, () => window.__story.result === 'ended', { timeout: 6000, label: 'fin du prologue' });
  const late = await t.ev(() => window.__story.cues.filter((c) => c.c !== 'bip').length);
  assertEq(late, 0, 'aucun repère avant le point de départ');
  const fin = await info(t);
  assert(fin.bubbleVisible === false, 'bulle retirée à la fin du prologue');
  await t.ev(() => window.__story.destroy());
}
