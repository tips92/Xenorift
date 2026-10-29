// Diagnostic : captures reproductibles de tout ce qui dépend du thème 2D et du parcours de vol, pour vérifier
// qu'une refonte ne change aucun pixel. Pages preview/art.html (planche, stand de tir, monde : 3 vues dont une
// avance rapide de la parallaxe) de chaque thème, avec un aléa semé et une horloge virtuelle (1/60 s par image)
// figée à l'image FREEZE_FRAME, textes Phaser masqués (police chargée à un moment variable) ; empreinte de chaque
// texture générée. Interface : choix du niveau (une capture par page, donc par monde) et carte d'intro de chaque
// étape de STAGES (animations CSS arrêtées, fond des menus masqué), classes et icônes des cartes. Vol : page
// preview/flight.html de chaque étape de vol de STAGES, même aléa et même horloge (FLIGHT_VIEWS : début et milieu
// du travelling d'intro, vol en pilote automatique), toast masqué (son effacement suit l'horloge réelle), avec
// __xr3d.info() à l'image figée (phase, portails, chrono, appels de dessin…).
// Écrit hashes.json dans son dossier de captures. Avec XR_CAPTURES_REF=<dossier d'une exécution précédente>
// (copié hors de tests/e2e/out, vidé à chaque passage), compare pixel par pixel, texture par texture, et échoue
// sur la moindre différence, capture manquante d'un côté ou de l'autre comprise (image diff-<capture>.png :
// pixels différents en rouge).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
import { assert, waitFor, waitForScreen, clickText } from '../lib/helpers.mjs';
import { SEEN_STORY, pickStage, seedSave, waitSelectPage } from '../lib/core.mjs';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');

export const meta = {
  title: 'Captures par thème et par parcours (preview/art.html, choix du niveau, intros, preview/flight.html) : comparaison au pixel avec XR_CAPTURES_REF',
  suites: ['diag'],
  dev: true,
  timeoutMs: 420000,
  viewport: { width: 844, height: 390 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

const THEMES = ['jungle', 'moon'];
/** Image (horloge virtuelle) à laquelle l'aperçu est figé. */
const FREEZE_FRAME = 90;
const SEED = 20261028;
const ART_VIEWS = [
  { view: 'sheet', size: [1280, 1080] },
  { view: 'weapons', size: [1280, 720] },
  { view: 'world', size: [1280, 720], extra: '&speed=0&x=0', tag: 'world-x0' },
  // Ver, poussière et comètes (Lune), nuées et méduse-baleine qui dérive (Jungle).
  { view: 'world', size: [1280, 720], extra: '&speed=0&x=2600&ff=4', tag: 'world-x2600-ff4' },
  // Caméra en mouvement, méduse-baleine replacée à droite (aléa).
  { view: 'world', size: [1280, 720], extra: '&speed=90&ff=40', tag: 'world-run-ff40' },
];
/**
 * Vol (preview/flight.html, 844x390) : image figée `freeze` d'une horloge virtuelle qui avance de `step` / 60 s
 * par image (3 : 1/20 s, le plus grand pas du vol sans écrêtage) ; intro de 3 s, puis vol.
 */
const FLIGHT_VIEWS = [
  // Caméra devant la Comète : planète de départ derrière elle.
  { tag: 'intro-a', freeze: 1, step: 3 },
  // Milieu du travelling vers la poursuite.
  { tag: 'intro-b', freeze: 30, step: 3 },
  // Vol en pilote automatique (tir, rochers, portails, planètes et créature devant).
  { tag: 'fly-8s', freeze: 160, step: 3, extra: '&autopilot=1' },
  { tag: 'fly-40s', freeze: 800, step: 3, extra: '&autopilot=1' },
];

/**
 * Aperçu seulement : Math.random semé, horloge virtuelle, gel à FREEZE_FRAME (textes masqués juste avant). Paramètres
 * d'URL lus ici (la page les ignore) : xrFreeze (image du gel), xrStep (pas de l'horloge, en 1/60 s).
 */
function freezeScript({ seed, freezeAt: freezeDefault }) {
  if (!location.pathname.includes('/preview/')) return;
  const q = new URLSearchParams(location.search);
  const freezeAt = Number(q.get('xrFreeze')) || freezeDefault;
  const step = Number(q.get('xrStep')) || 1;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  let now = 0;
  let frame = 0;
  let lastReal = -1;
  const realRaf = window.requestAnimationFrame.bind(window);
  performance.now = () => now;
  window.__xrFreeze = { frozen: false, frame: 0, hidden: 0 };
  window.requestAnimationFrame = (cb) =>
    realRaf((ts) => {
      if (ts !== lastReal) {
        lastReal = ts;
        if (frame >= freezeAt) {
          window.__xrFreeze.frozen = true;
          return;
        }
        frame++;
        now = (frame * step * 1000) / 60;
        window.__xrFreeze.frame = frame;
        if (frame === freezeAt) {
          const sc = window.__artScene;
          if (sc) {
            for (const o of sc.children.list) {
              if (o.type === 'Text' && o.visible) {
                o.setVisible(false);
                window.__xrFreeze.hidden++;
              }
            }
          }
        }
      } else if (window.__xrFreeze.frozen) {
        return;
      }
      cb(now);
    });
}

/** Empreintes (FNV-1a sur les pixels, et cadres) de chaque texture tirée d'un canvas, hors textes. */
function textureHashes() {
  const scene = window.__artScene;
  const game = scene.game;
  const texts = new Set(scene.children.list.filter((o) => o.type === 'Text').map((o) => o.texture.key));
  const out = {};
  for (const key of Object.keys(game.textures.list).sort()) {
    if (key.startsWith('__') || texts.has(key)) continue;
    const tex = game.textures.list[key];
    const img = tex.source && tex.source[0] && tex.source[0].image;
    if (!(img instanceof HTMLCanvasElement)) continue;
    const data = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < words.length; i++) {
      h1 = Math.imul(h1 ^ words[i], 16777619);
      h2 = Math.imul(h2 + words[i], 2246822519) ^ (h2 >>> 13);
    }
    const frames = Object.keys(tex.frames)
      .filter((f) => f !== '__BASE')
      .map((f) => {
        const fr = tex.frames[f];
        return `${f}:${fr.cutX},${fr.cutY},${fr.cutWidth},${fr.cutHeight}`;
      })
      .join(' ');
    out[key] = `${img.width}x${img.height} ${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)} [${frames}]`;
  }
  return out;
}

function pixelHash(png) {
  return crypto.createHash('sha1').update(png.data).digest('hex');
}

/** Pixels différents (rouge) sur l'image de référence assombrie. */
function diffImage(a, b) {
  const d = new PNG({ width: a.width, height: a.height });
  let count = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0;
    for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]));
    if (delta > 0) {
      count++;
      maxDelta = Math.max(maxDelta, delta);
      d.data[i] = 255;
      d.data[i + 1] = 0;
      d.data[i + 2] = 0;
    } else {
      d.data[i] = a.data[i] >> 2;
      d.data[i + 1] = a.data[i + 1] >> 2;
      d.data[i + 2] = a.data[i + 2] >> 2;
    }
    d.data[i + 3] = 255;
  }
  return { count, maxDelta, png: PNG.sync.write(d) };
}

export default async function (t) {
  const result = { art: {}, ui: {}, flight: {} };
  const shots = {};
  const shoot = async (tag) => {
    const file = path.join(t.out, `${tag}.png`);
    await t.page.screenshot({ path: file, animations: 'disabled' });
    shots[tag] = file;
    return file;
  };

  // ------------------------------------------------------------ Aperçu des graphismes 2D
  await t.page.addInitScript(freezeScript, { seed: SEED, freezeAt: FREEZE_FRAME });
  for (const theme of THEMES) {
    for (const v of ART_VIEWS) {
      const tag = `art-${theme}-${v.tag || v.view}`;
      await t.page.setViewportSize({ width: v.size[0], height: v.size[1] });
      await t.goto(`preview/art.html?theme=${theme}&view=${v.view}${v.extra || ''}`);
      const st = await waitFor(t, () => window.__xrFreeze && window.__xrFreeze.frozen && window.__xrFreeze, {
        timeout: 30000,
        label: `aperçu ${tag} figé`,
      });
      assert(st.hidden > 0, `${tag} : textes masqués avant le gel (${st.hidden})`);
      const textures = await t.ev(textureHashes);
      result.art[tag] = { textures };
      await shoot(tag);
      t.log(`${tag} : ${Object.keys(textures).length} textures, ${st.hidden} textes masqués`);
    }
  }

  // ------------------------------------------------------------ Interface : choix du niveau et intros
  // Prologue déjà vu (plan 04, choix 14) : une carte des Niveaux mène droit à sa carte d'intro.
  await seedSave(t, SEEN_STORY);
  await t.page.setViewportSize(meta.viewport);
  let stages = [];
  for (let n = -1; n < stages.length; n++) {
    await t.goto('?touch=0&unlock=1');
    await waitForScreen(t, 'title');
    await clickText(t, 'Niveaux');
    await waitForScreen(t, 'select');
    await t.ev(() => document.fonts.ready.then(() => true));
    // Fond des menus masqué : ses calques animés (méduse-baleine, planète) sont rastérisés par le GPU à une
    // échelle qui dépend du moment, d'où des écarts d'une unité sur quelques pixels d'une exécution à l'autre.
    await t.page.addStyleTag({ content: '.space-bg { visibility: hidden !important; }' });
    if (n < 0) {
      // Étapes lues dans STAGES (même module que le jeu, servi par Vite).
      stages = await t.ev(async () =>
        (await import('/src/core/stages.ts')).STAGES.map((s) => ({ id: s.id, title: s.title, kind: s.kind })),
      );
      assert(stages.length > 0, 'STAGES lu depuis /src/core/stages.ts');
      result.ui.cards = await t.ev(() =>
        [...document.querySelectorAll('.screens [data-screen="select"] .card')].map((c) => ({
          cls: c.className,
          art: c.querySelector('.card-art').innerHTML,
        })),
      );
      // Une capture par page, de la première à la dernière (◀ puis ▶ : ouverte sur le monde de l'étape de JOUER).
      const S = '.screens [data-screen="select"].is-active';
      const worlds = await t.ev((s) => [...document.querySelectorAll(`${s} .select-page`)].map((p) => Number(p.dataset.world)), S);
      assert(worlds.length > 0, 'pages du choix du niveau');
      while (!(await t.ev((s) => document.querySelector(`${s} .select-prev`).disabled, S))) await t.page.locator(`${S} .select-prev`).click();
      for (let k = 0; k < worlds.length; k++) {
        if (k > 0) await t.page.locator(`${S} .select-next`).click();
        await waitSelectPage(t, worlds[k]);
        await shoot(`ui-select-w${worlds[k]}`);
      }
      continue;
    }
    const { id } = stages[n];
    // Carte repérée par data-stage, sur sa page (◀ ▶).
    await pickStage(t, id);
    await waitFor(
      t,
      () => {
        const s = document.querySelector('.screens [data-screen="intro"]');
        return !!s && s.classList.contains('is-active') && !s.classList.contains('is-leaving') && !document.querySelector('.fader.is-on');
      },
      { timeout: 10000, interval: 50, label: `intro de ${id}` },
    );
    await shoot(`ui-intro-${id}`);
    const intro = await t.ev(() => {
      const s = document.querySelector('.screens [data-screen="intro"]');
      return {
        still: s.classList.contains('is-active') && !s.classList.contains('is-leaving') && !document.querySelector('.fader.is-on'),
        cls: s.className,
        art: s.querySelector('.intro-art').innerHTML,
      };
    });
    assert(intro.still, `intro de ${id} encore affichée après la capture`);
    result.ui[`intro-${id}`] = { cls: intro.cls, art: intro.art };
  }

  // ------------------------------------------------------------ Vol 3D : preview/flight.html de chaque étape de vol
  const flights = stages.filter((s) => s.kind === 'flight');
  assert(flights.length > 0, 'étapes de vol dans STAGES');
  for (const st of flights) {
    for (const v of FLIGHT_VIEWS) {
      const tag = `flight-${st.id}-${v.tag}`;
      await t.goto(`preview/flight.html?stage=${st.id}${v.extra || ''}&xrFreeze=${v.freeze}&xrStep=${v.step}`);
      await waitFor(t, () => window.__xrFreeze && window.__xrFreeze.frozen && !!window.__xr3d, {
        timeout: 120000,
        label: `vol ${tag} figé`,
      });
      const hud = await t.ev(() => document.getElementById('hud').textContent.split('\n')[0]);
      assert(hud.startsWith(`${st.id} `), `${tag} : étape de l'aperçu (${hud})`);
      // Toast masqué : son effacement suit l'horloge réelle (setTimeout), pas l'horloge virtuelle.
      await t.page.addStyleTag({ content: '#toast { visibility: hidden !important; }' });
      const info = await t.ev(() => window.__xr3d.info());
      result.flight[tag] = { info };
      await shoot(tag);
      t.log(`${tag} : ${info.phase}, portails ${info.gates}/${info.gatesTotal}, ${info.drawCalls} appels de dessin`);
    }
  }

  // ------------------------------------------------------------ Empreintes et comparaison
  for (const [tag, file] of Object.entries(shots)) {
    const png = PNG.sync.read(fs.readFileSync(file));
    const entry = tag.startsWith('art-')
      ? result.art[tag]
      : tag.startsWith('flight-')
        ? result.flight[tag]
        : (result.ui[tag] = result.ui[tag] || {});
    entry.pixels = `${png.width}x${png.height} ${pixelHash(png)}`;
  }
  fs.writeFileSync(path.join(t.out, 'hashes.json'), `${JSON.stringify(result, null, 1)}\n`);

  const refDir = process.env.XR_CAPTURES_REF;
  if (!refDir) return;
  const ref = JSON.parse(fs.readFileSync(path.join(refDir, 'hashes.json'), 'utf8'));
  const problems = [];
  // Dans les deux sens : une capture ou une entrée retirée, renommée ou ajoutée est une différence.
  const tagsOf = (r) => new Set([...Object.keys(r.art), ...Object.keys(r.ui), ...Object.keys(r.flight || {})]);
  const refTags = tagsOf(ref);
  const curTags = tagsOf(result);
  for (const tag of refTags) if (!curTags.has(tag)) problems.push(`${tag} : absente de cette exécution`);
  for (const tag of curTags) if (!refTags.has(tag)) problems.push(`${tag} : absente de la référence`);
  for (const [tag, file] of Object.entries(shots)) {
    if (!refTags.has(tag)) continue;
    const refFile = path.join(refDir, `${tag}.png`);
    if (!fs.existsSync(refFile)) {
      problems.push(`${tag} : ${tag}.png absente du dossier de référence`);
      continue;
    }
    const a = PNG.sync.read(fs.readFileSync(refFile));
    const b = PNG.sync.read(fs.readFileSync(file));
    if (a.width !== b.width || a.height !== b.height) {
      problems.push(`${tag} : ${b.width}x${b.height} au lieu de ${a.width}x${a.height}`);
      continue;
    }
    const d = diffImage(a, b);
    if (d.count > 0) {
      fs.writeFileSync(path.join(t.out, `diff-${tag}.png`), d.png);
      problems.push(`${tag} : ${d.count} pixels différents (écart max ${d.maxDelta})`);
    }
  }
  for (const [tag, page] of Object.entries(ref.art)) {
    const cur = result.art[tag];
    if (!cur) continue; // signalée plus haut
    const keys = new Set([...Object.keys(page.textures), ...Object.keys(cur.textures)]);
    for (const key of keys) {
      const short = (v) => (v ? v.split(' [')[0] : 'absente');
      if (page.textures[key] !== cur.textures[key]) {
        problems.push(`${tag} : texture ${key} : ${short(cur.textures[key])} au lieu de ${short(page.textures[key])}`);
      }
    }
  }
  for (const [tag, v] of Object.entries(ref.ui)) {
    const cur = result.ui[tag];
    if (!cur) continue;
    if (JSON.stringify({ ...v, pixels: 0 }) !== JSON.stringify({ ...cur, pixels: 0 })) problems.push(`${tag} : classes ou icônes différentes`);
  }
  for (const [tag, v] of Object.entries(ref.flight || {})) {
    const cur = result.flight[tag];
    if (!cur) continue;
    for (const k of new Set([...Object.keys(v.info), ...Object.keys(cur.info)])) {
      const a = JSON.stringify(v.info[k]);
      const b = JSON.stringify(cur.info[k]);
      if (a !== b) problems.push(`${tag} : info().${k} ${b} au lieu de ${a}`);
    }
  }
  t.log(`comparaison à ${refDir} : ${problems.length ? `${problems.length} différence(s)` : 'identique'}`);
  for (const p of problems) t.log(`  ${p}`);
  assert(problems.length === 0, `${problems.length} différence(s) avec la référence : ${problems.slice(0, 4).join(' ; ')}`);
}
