// Diagnostic : sons et musiques du monde 1 sur la page d'aperçu /preview/audio.html (serveur de dev seulement),
// avec le vrai moteur audio (AudioContext instrumenté comme dans audio-lifecycle) :
//  A. Premier geste : un seul AudioContext, actif ; graphe fixe mesuré (nœuds branchés, stable 2 s).
//  B. Effets : les 18 effets du monde 1 joués 3 fois à 45 ms d'écart, une phrase de LUMA (lumaBip à 8 lettres
//     par seconde : au plus 2 voix à la fois), une rafale de 40 effets (plus de 24 voix : vol de voix) ; retour
//     exact au graphe fixe.
//  C. Musiques : boss, guardian et story jouées quelques secondes chacune (un morceau lancé par changement, des
//     notes jouées) ; guardian aux niveaux 0, 1, 2 et retour à 0 : niveau pris au début de mesure suivant, sans
//     relancer le morceau (compteur de morceaux inchangé), notes par seconde et crête de sortie relevées par
//     niveau ; redemander guardian garde son intensité ; story niveau 1 ; musicLevel sans effet sur un morceau à
//     un seul niveau (menu) et remis à 0 par un changement de morceau ; musique coupée : retour au graphe fixe.
//  D. Mesures hors temps réel (OfflineAudioContext, copie du graphe du moteur) : crêtes et RMS de chaque effet
//     et de chaque morceau (et par niveau), comparés aux sons existants ; échoue si un son sature (crête de sortie
//     ≥ 0 dBFS), est muet, perd des notes (plafond de voix) ou si une intensité tombe à la mauvaise mesure ; deux
//     mélanges de combat (gardien niveau 2, mini-boss : musique + effets, coup fatal sur une grosse caisse) doivent
//     garder 0,5 dB de marge (crêtes entre échantillons) ; un mélange des sons existants (jungle) sert de référence.
//     Tableau dans out/audio-world1/levels.json et captures de la page (commandes, tableau, spectrogrammes).
import fs from 'node:fs';
import path from 'node:path';
import { assert, assertEq, fmt, waitFor } from '../lib/helpers.mjs';
import { countTracks, instrument, liveNodes, sourceRate, tracks, waitAudio } from '../lib/shell.mjs';

export const meta = {
  title: 'Aperçu audio du monde 1 (preview/audio.html) : effets, musiques, intensités, nœuds, crêtes',
  suites: ['diag'],
  dev: true,
  timeoutMs: 600000,
  viewport: { width: 1280, height: 900 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

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

/** Attend le retour exact au graphe fixe (`n0` nœuds branchés). */
function waitNodes(t, n0, label, timeout = 20000) {
  return waitFor(t, (n) => window.__liveNodes() === n, { timeout, interval: 250, label: `${label} : retour à ${n0} nœuds branchés`, arg: n0 }).catch(
    async (e) => {
      throw new Error(`${e.message} (actuellement ${await liveNodes(t)})`);
    },
  );
}

const st = (t) => t.ev(() => window.__audioPreview.state());
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');

/** Lance un morceau, attend des notes ; renvoie notes/s et crête de sortie sur `ms`. */
async function listen(t, ms) {
  await t.ev(() => window.__audioPreview.resetPeak());
  const rate = await sourceRate(t, ms);
  const peak = await t.ev(() => window.__audioPreview.peak);
  return { rate, peak };
}

/** Niveau effectivement joué = `n`, en au plus `bars` mesures (+ marge). */
async function waitLevel(t, n, barSec, label) {
  const t0 = Date.now();
  await waitFor(t, (k) => window.__audioPreview.state().level === k, {
    timeout: Math.round(barSec * 1000 * 1.2 + 600),
    interval: 50,
    label: `${label} : intensité ${n} jouée au plus une mesure plus tard`,
    arg: n,
  });
  const s = await st(t);
  // Le niveau change au début d'une mesure : le dernier pas programmé est l'un des premiers de la mesure.
  assert(s.step <= 3, `${label} : niveau pris au début de la mesure (pas ${s.step})`);
  return Date.now() - t0;
}

let shots = 50;
async function shotEl(t, sel, name) {
  const file = path.join(t.out, `${shots++}-${name}.png`);
  await t.page.locator(sel).screenshot({ path: file });
  t.log(`capture ${path.relative(process.cwd(), file)}`);
}

export default async function (t) {
  await instrument(t);
  await countTracks(t);
  await t.goto('preview/audio.html');
  await waitFor(t, () => !!window.__audioPreview, { label: 'page d’aperçu audio prête' });
  const sfxIds = await t.ev(() => window.__audioPreview.sfxIds);
  const musicIds = await t.ev(() => window.__audioPreview.musicIds);
  assertEq(sfxIds.length, 18, 'nombre d’effets du monde 1');
  assertEq(musicIds, ['boss', 'guardian', 'story'], 'musiques du monde 1');

  // ---------------------------------------------------------------- A. Premier geste, graphe fixe
  assertEq(await t.ev(() => window.__acs.length), 0, 'AudioContext créés avant le premier geste');
  await t.key('KeyZ', 40);
  await waitAudio(t, 'running', 'premier geste → son actif');
  await t.ev(() => window.__audioPreview.unlock()); // vu-mètre branché avant la mesure du graphe fixe
  const n0 = await settledNodes(t, 'graphe fixe');
  t.log('nœuds branchés en silence (graphe fixe)', n0);
  assert(n0 > 0, 'le graphe fixe du moteur doit être branché après le premier geste');
  assertEq(await tracks(t), 0, 'aucun morceau lancé au premier geste');

  // ---------------------------------------------------------------- B. Effets
  for (let r = 0; r < 3; r++) {
    for (const id of sfxIds) {
      await t.ev((i) => window.__audioPreview.sfx(i, 1), id);
      await t.wait(45);
    }
  }
  const nMid = await liveNodes(t);
  assert(nMid > n0, `les effets doivent brancher des nœuds pendant qu'ils jouent (${n0} -> ${nMid})`);
  await waitNodes(t, n0, '54 effets du monde 1');
  // Phrase de LUMA à 8 lettres par seconde : voix d'effets relevées pendant la lecture.
  const bipVoices = await t.ev(async () => {
    const p = window.__audioPreview;
    let max = 0;
    const id = setInterval(() => {
      max = Math.max(max, p.state().sfxVoices);
    }, 10);
    const bips = await p.lumaPhrase(undefined, 8);
    clearInterval(id);
    return { bips, max };
  });
  t.log(`phrase de LUMA : ${bipVoices.bips} bips, ${bipVoices.max} voix au plus`);
  assert(bipVoices.bips >= 40, `la phrase de LUMA doit jouer un bip par lettre (${bipVoices.bips})`);
  assert(bipVoices.max <= 2, `lumaBip à 8 par seconde : au plus 2 voix à la fois (${bipVoices.max})`);
  await t.ev(() => window.__audioPreview.burst(40, 40));
  const maxVoices = await t.ev(() => window.__audioPreview.state().sfxVoices);
  assert(maxVoices <= 24, `24 voix d'effets au plus (${maxVoices})`);
  await waitNodes(t, n0, 'phrase de LUMA et rafale de 40 effets', 25000);
  t.log(`effets : graphe fixe ${n0}, pendant ${nMid}, voix après la rafale ${maxVoices}`);

  // ---------------------------------------------------------------- C. Musiques
  const tr0 = await tracks(t);
  const report = { nodes: { n0, duringSfx: nMid }, music: {} };
  for (const id of ['boss', 'story']) {
    await t.ev((m) => window.__audioPreview.music(m), id);
    await t.wait(800);
    const r = await listen(t, 3500);
    report.music[id] = { notesPerSec: r.rate, livePeakDb: Number(db(r.peak)) };
    t.log(`${id} : ${r.rate} sources/s, crête de sortie ${db(r.peak)} dBFS`);
    assert(r.rate > 0, `${id} doit jouer des notes`);
    assert(r.peak < 1, `${id} : crête de sortie sous 0 dBFS en temps réel (${db(r.peak)})`);
  }
  assertEq((await tracks(t)) - tr0, 2, 'un morceau lancé par changement (boss, story)');

  // story : passage à la lumière (niveau 1)
  await t.ev(() => window.__audioPreview.level(1));
  const storyMs = await waitLevel(t, 1, 3, 'story');
  t.log(`story : lumière jouée ${storyMs} ms après la demande`);
  assertEq((await tracks(t)) - tr0, 2, 'story : changer d’intensité ne relance pas le morceau');

  // guardian : 0 → 1 → 2 → 0 (une mesure = 60 / 112 × 4 ≈ 2,14 s)
  await t.ev(() => window.__audioPreview.music('guardian'));
  assertEq((await st(t)).wantedLevel, 0, 'changer de morceau remet l’intensité à 0');
  await t.wait(800);
  const levels = [];
  for (const n of [0, 1, 2, 0]) {
    if (n !== 0 || levels.length) {
      await t.ev((k) => window.__audioPreview.level(k), n);
      const ms = await waitLevel(t, n, 2.143, `guardian niveau ${n}`);
      t.log(`guardian : niveau ${n} joué ${ms} ms après la demande`);
    }
    await t.wait(300);
    const r = await listen(t, 4300);
    levels.push({ level: n, notesPerSec: r.rate, livePeakDb: Number(db(r.peak)) });
    t.log(`guardian niveau ${n} : ${r.rate} sources/s, crête de sortie ${db(r.peak)} dBFS`);
    assert(r.peak < 1, `guardian niveau ${n} : crête de sortie sous 0 dBFS (${db(r.peak)})`);
    if (n === 2) {
      // Redemander le morceau en cours ne le relance pas et garde son intensité.
      await t.ev(() => window.__audioPreview.music('guardian'));
      const s2 = await st(t);
      assertEq([s2.playing, s2.wantedLevel, s2.level], ['guardian', 2, 2], 'guardian redemandé : intensité conservée');
    }
  }
  report.music.guardian = levels;
  assertEq((await tracks(t)) - tr0, 3, 'guardian : les changements d’intensité ne relancent pas le morceau');
  assert(levels[1].notesPerSec > levels[0].notesPerSec, `guardian : plus de notes au niveau 1 qu'au niveau 0 (${fmt(levels)})`);
  assert(levels[2].notesPerSec > levels[0].notesPerSec, `guardian : plus de notes au niveau 2 qu'au niveau 0 (${fmt(levels)})`);
  await shotEl(t, '#music-panel', 'commandes-musique');

  // Morceau à un seul niveau : musicLevel ne change rien et ne relance rien.
  await t.ev(() => window.__audioPreview.music('menu'));
  await t.wait(600);
  await t.ev(() => window.__audioPreview.level(2));
  await t.wait(5000);
  const sm = await st(t);
  assertEq([sm.playing, sm.level], ['menu', 0], 'menu (un seul niveau) : intensité jouée');
  assertEq((await tracks(t)) - tr0, 4, 'menu : musicLevel ne relance pas le morceau');

  // Musique coupée : retour au graphe fixe une fois les dernières notes éteintes.
  await t.ev(() => window.__audioPreview.music(null));
  await waitNodes(t, n0, 'musique coupée', 40000);
  await t.shot('page-commandes');

  // ---------------------------------------------------------------- D. Mesures hors temps réel
  const t0 = Date.now();
  const rows = await t.ev(() => window.__audioPreview.analyse());
  t.log(`mesures hors temps réel : ${rows.length} lignes en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const dbf = (x) => Number(db(x));
  const table = rows.map((m) => ({
    name: m.name,
    group: m.group,
    dur: Number(m.dur.toFixed(2)),
    peakPreDb: dbf(m.peakPre),
    peakPostDb: dbf(m.peakPost),
    peakAt: Number(m.peakAt.toFixed(2)),
    rmsDb: dbf(m.rms),
    rmsMax400Db: dbf(m.rmsMax),
    voicesMax: m.voicesMax,
    notesPerSec: m.notesPerSec !== undefined ? Number(m.notesPerSec.toFixed(1)) : undefined,
    sources: m.sources,
    appliedBar: m.appliedBar,
    problems: m.problems,
  }));
  for (const r of table) {
    t.log(
      `${r.group.padEnd(9)} ${r.name.padEnd(34)} ${String(r.dur).padStart(6)} s  crête ${String(r.peakPreDb).padStart(6)} / ${String(r.peakPostDb).padStart(6)} dBFS (${r.peakAt} s)  RMS ${String(r.rmsDb).padStart(6)}  max400 ${String(r.rmsMax400Db).padStart(6)}${r.voicesMax !== undefined ? `  voix ${r.voicesMax}` : ''}${r.notesPerSec !== undefined ? `  notes/s ${r.notesPerSec}` : ''}${r.problems.length ? `  !! ${r.problems.join(' ; ')}` : ''}`,
    );
  }
  report.offline = table;
  fs.writeFileSync(path.join(t.out, 'levels.json'), JSON.stringify(report, null, 2));
  await t.page.evaluate(() => window.scrollTo(0, 0));
  await shotEl(t, '#analysis-panel', 'tableau');
  await shotEl(t, '#sfx-cards-panel', 'spectres-effets');
  await shotEl(t, '#music-cards-panel', 'spectres-musiques');

  const bad = table.filter((r) => r.problems.length);
  assert(!bad.length, `mesures hors temps réel : ${bad.map((r) => `${r.name} (${r.problems.join(' ; ')})`).join(' | ')}`);
  const sfxRows = table.filter((r) => r.group === 'sfx');
  assertEq(sfxRows.length, 20, 'mesures des effets du monde 1 (18 + barrière ouverte + phrase de LUMA)');
  assertEq(table.filter((r) => r.group === 'mix').length, 2, 'mélanges de combat mesurés (gardien, mini-boss)');
  assertEq(table.filter((r) => r.group === 'mix-ref').length, 1, 'mélange de référence mesuré (jungle)');
  const g = table.filter((r) => r.name.startsWith('guardian · niv.'));
  assertEq(
    g.map((r) => r.appliedBar),
    [undefined, 8, 16],
    'guardian hors temps réel : intensités appliquées aux mesures demandées',
  );
}
