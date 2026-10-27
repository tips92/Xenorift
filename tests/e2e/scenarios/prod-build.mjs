// Build de production (dist/ servi par vite preview) : aides DEV absentes ; accueil → JOUER → carte d'intro passée
// d'un toucher → Jungle jouable au clavier (Kaï court et ramasse les cristaux du départ, HUD) ; ?stage=f1 :
// un seul canevas affiché (three.js), image éclairée (pas d'écran noir), compte à rebours puis vol qui avance
// (chronomètre, barre de progression, vaisseau), flèche gauche qui déplace le vaisseau ; aucun contexte WebGL perdu.
// La position du vaisseau est lue par le crochet des outils de dev de three.js (présent même en production).
import { assert, assertEq, waitFor, waitForScreen } from '../lib/helpers.mjs';
import { contextLog, logContexts } from '../lib/gl.mjs';
import { gameCanvases, hudFlight, hudPlatform, press, screenLuma, shipPos, trackThreeScenes, waitHud } from '../lib/core.mjs';

export const meta = {
  title: 'Build de production : accueil → intro → j1 au clavier, vol f1 affiché',
  suites: ['full'],
  prod: true,
  timeoutMs: 150000,
};

async function assertNoLostContext(t, label) {
  const log = await contextLog(t);
  const lost = log.filter((e) => e.ev === 'lost');
  assert(!lost.length, `${label} : aucun contexte WebGL ne doit être perdu (journal : ${JSON.stringify(log.map((e) => `${e.ev} ${e.type} #${e.canvas} ${e.engine || ''}@${e.at}`))})`);
  return log;
}

export default async function (t) {
  await logContexts(t);
  await trackThreeScenes(t);

  // ---------------------------------------------------------------- Accueil, sans aides DEV
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  const helpers = await t.ev(() => [typeof window.__xr2d, typeof window.__xr3d, typeof window.__xrShell]);
  assertEq(helpers, ['undefined', 'undefined', 'undefined'], 'aides DEV (__xr2d, __xr3d, __xrShell) absentes du build de production');
  await t.shot('title');

  // ---------------------------------------------------------------- JOUER → intro passée d'un toucher
  await press(t, 'title', 'Jouer');
  await waitFor(
    t,
    () => {
      const s = document.querySelector('.screens [data-screen="intro"].is-active:not(.is-leaving)');
      const f = document.querySelector('.fader');
      return !!s && !(f && f.classList.contains('is-on'));
    },
    { timeout: 15000, label: "carte d'intro de la Jungle affichée" },
  );
  await t.shot('intro');
  const t0 = Date.now();
  await t.page.locator('.screens [data-screen="intro"].is-active').click({ position: { x: 40, y: 40 } });
  // Sans toucher, l'intro reste 2,2 s : le fondu au noir qui suit le toucher doit partir bien avant.
  await waitFor(t, () => document.querySelector('.fader').classList.contains('is-on'), { timeout: 1500, label: "fondu au noir juste après le toucher sur l'intro" });
  const skipMs = Date.now() - t0;
  assert(skipMs < 1500, `l'intro doit se fermer dès le toucher (fondu après ${skipMs} ms)`);

  // ---------------------------------------------------------------- Jungle au clavier
  await waitHud(t, 'platform', { timeout: 30000 });
  await t.wait(500);
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  // Sans aide DEV, la position de Kaï n'est pas lisible : on s'appuie sur le HUD. Trois cristaux attendent
  // juste devant lui au départ de la Jungle ; à l'arrêt il n'en ramasse aucun, en courant il les ramasse.
  const c0 = (await hudPlatform(t)).crystals;
  await t.wait(1000);
  const c1 = (await hudPlatform(t)).crystals;
  await t.shot('j1-start');
  assertEq([c0, c1], [0, 0], "cristaux du HUD au départ, puis après 1 s à l'arrêt");
  await t.page.keyboard.down('ArrowRight');
  const got = await waitFor(t, () => Number(document.querySelector('.hud-crystals .hud-num').textContent) >= 2 && Number(document.querySelector('.hud-crystals .hud-num').textContent), {
    timeout: 3000,
    label: 'flèche droite tenue : Kaï avance et ramasse les cristaux du départ (HUD)',
  });
  await t.page.keyboard.up('ArrowRight');
  t.log(`cristaux ramassés en courant : ${got}`);
  await t.shot('j1-run');
  const cv2 = await gameCanvases(t);
  assertEq(cv2.filter((c) => c.shown).length, 1, `j1 : un seul canevas affiché (${JSON.stringify(cv2)})`);
  await assertNoLostContext(t, 'j1');

  // ---------------------------------------------------------------- Vol 1 lancé directement
  await t.goto('?touch=0&unlock=1&stage=f1');
  await waitHud(t, 'flight', { timeout: 60000 });
  const cv3 = await gameCanvases(t);
  const shown = cv3.filter((c) => c.shown);
  assert(shown.length === 1 && /^three/.test(shown[0].engine), `f1 : un seul canevas affiché, celui de three.js (${JSON.stringify(cv3)})`);
  const h0 = await hudFlight(t);
  assertEq(h0.total, 16, 'f1 : total des portails dans le HUD');
  // Compte à rebours (3 s) puis le chronomètre défile
  await waitFor(t, (v) => document.querySelector('.fl-timer').textContent !== v, { timeout: 25000, label: 'chronomètre du vol qui défile', arg: h0.timer });
  const s0 = await shipPos(t);
  const p0 = (await hudFlight(t)).progress;
  await t.wait(1500);
  const s1 = await shipPos(t);
  const h1 = await hudFlight(t);
  assert(s0 && s1, 'f1 : vaisseau introuvable dans la scène three.js');
  t.log(`vol : z ${Math.round(s0.z)} -> ${Math.round(s1.z)}, progression ${p0} -> ${h1.progress}, chrono ${h0.timer} -> ${h1.timer}`);
  assert(s1.z < s0.z - 20, `f1 : le vaisseau doit avancer (z ${Math.round(s0.z)} -> ${Math.round(s1.z)})`);
  assert(h1.progress > p0, `f1 : la barre de progression doit avancer (${p0} -> ${h1.progress})`);
  // Image éclairée au centre (sous le HUD) : nébuleuse, vaisseau, portails
  const luma = await screenLuma(t, { x: Math.round(W * 0.1), y: Math.round(H * 0.25), width: Math.round(W * 0.8), height: Math.round(H * 0.7) });
  t.log('luminosité du vol', JSON.stringify(luma));
  assert(luma.mean > 20 && luma.lit > 0.3 && luma.spread > 8, `f1 : image 3D attendue (pas d'écran noir ni uni) : ${JSON.stringify(luma)}`);
  await t.shot('f1-flying');
  // Pilotage au clavier
  await t.wait(400);
  const l0 = await shipPos(t);
  await t.key('ArrowLeft', 700);
  const l1 = await shipPos(t);
  assert(l1.x < l0.x - 2, `f1 : flèche gauche, le vaisseau doit aller à gauche (x ${l0.x.toFixed(2)} -> ${l1.x.toFixed(2)})`);
  const log = await assertNoLostContext(t, 'f1');
  assert(log.some((e) => e.ev === 'create' && e.type === 'webgl2'), `f1 : contexte WebGL2 créé (journal ${JSON.stringify(log.map((e) => `${e.ev} ${e.type}`))})`);
}
