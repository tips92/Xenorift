// Diagnostic : arène 3D d'essai (preview/arena.html, ouverte par « Essai 3D » de l'accueil, aussi en --prod). Kaï du .glb au pilote automatique
// contre les vagues : captures, images par seconde et appels de dessin relevés. Échoue seulement si la page ne se
// construit pas ou si Kaï ne tire ni n'abat rien.
import { assert, waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Arène 3D d’essai (preview/arena.html) : Kaï du .glb contre des vagues',
  suites: ['diag'],
  timeoutMs: 120000,
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

export default async function (t) {
  await t.goto('');
  await t.page.locator('button.footer-try').click();
  await waitFor(t, () => window.__xrArena?.info().loaded, { timeout: 30000, label: 'modèle chargé' });
  await t.ev(() => {
    window.__xrArena.god(true);
    window.__xrArena.autopilot(true);
  });
  await t.wait(1500);
  await t.shot('debut');
  const snaps = [];
  for (let i = 0; i < 4; i++) {
    await t.wait(4000);
    const info = await t.ev(() => window.__xrArena.info());
    snaps.push(info);
    t.log(JSON.stringify(info));
    await t.shot(`vague-${info.wave}`);
  }
  await t.ev(() => window.__xrArena.spawn('brute', 3));
  await t.ev(() => window.__xrArena.spawn('dart', 8));
  await t.wait(1200);
  await t.shot('foule');
  const last = await t.ev(() => window.__xrArena.info());
  t.log(JSON.stringify(last));
  assert(last.shotsFired > 0, 'Kaï doit tirer');
  assert(last.killed > 0, 'des ennemis doivent tomber');
  await t.page.setViewportSize({ width: 1600, height: 720 });
  await t.wait(800);
  await t.shot('grand');
  // Loupe sur Kaï, jeu figé : pose du bras et arme.
  await t.ev(() => window.__xrArena.timeScale(0));
  await t.wait(300);
  const [sx, sy] = await t.ev(() => window.__xrArena.screen());
  await t.shot('kai-loupe', { clip: { x: Math.round(sx - 90), y: Math.round(sy - 90), width: 180, height: 180 }, zoom: 3 });
  // Retour à l'accueil du jeu.
  await t.page.locator('#back').click();
  await t.page.waitForURL(/index\.html|\/$/);
  await t.page.waitForSelector('button.footer-try');
}
