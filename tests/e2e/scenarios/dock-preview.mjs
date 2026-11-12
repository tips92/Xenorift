// Diagnostic : arrimage (preview/dock.html, ouvert par Tests de l'accueil, aussi en --prod). Approche 1 sans
// toucher aux commandes (échec attendu : la dérive écarte la Comète), puis approches 1 et 3 au pilote automatique
// (réussite), avec captures et alertes de LUMA relevées.
import { assert, waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Arrimage d’essai (preview/dock.html) : écran de visée, dérive, alertes, axe vertical',
  suites: ['diag'],
  timeoutMs: 150000,
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

export default async function (t) {
  await t.goto('');
  await t.page.locator('button.footer-try').click();
  await t.page.waitForSelector('body[data-ready]');
  await t.page.locator('button.card', { hasText: 'Arrimage' }).click();
  await waitFor(t, () => !!window.__xrDock, { timeout: 20000, label: 'arrimage chargé' });
  await t.wait(500);
  await t.shot('menu');
  const info = () => t.ev(() => window.__xrDock.info());

  // Sans commandes : échec.
  await t.ev(() => {
    window.__xrDock.voice(false);
    window.__xrDock.start(1);
    window.__xrDock.timeScale(4);
  });
  await t.wait(2500);
  await t.ev(() => window.__xrDock.timeScale(0));
  await t.shot('approche-1-derive');
  t.log(JSON.stringify(await info()));
  await t.ev(() => window.__xrDock.timeScale(6));
  await waitFor(t, () => window.__xrDock.info().phase === 'done', { timeout: 30000, label: 'contact sans commandes' });
  const a = await info();
  t.log(JSON.stringify(a));
  assert(a.result === 'fail', 'sans correction, la dérive doit faire échouer');
  assert(a.said.includes('urgent') || a.said.includes('collision'), 'alerte de collision attendue');
  await t.wait(1800);
  await t.shot('echec');

  for (const level of [1, 3]) {
    await t.ev((lv) => {
      window.__xrDock.timeScale(1);
      window.__xrDock.start(lv);
      window.__xrDock.autopilot(true);
      window.__xrDock.timeScale(5);
    }, level);
    await t.wait(1200);
    await t.ev(() => window.__xrDock.timeScale(0));
    await t.shot(`approche-${level}-pilote`);
    await t.ev(() => window.__xrDock.timeScale(3));
    await waitFor(t, () => window.__xrDock.info().dist < 25, { timeout: 30000, label: 'dernier tronçon' });
    await t.ev(() => window.__xrDock.timeScale(0));
    await t.shot(`approche-${level}-contact`);
    await t.ev(() => window.__xrDock.timeScale(3));
    await waitFor(t, () => window.__xrDock.info().phase === 'done', { timeout: 30000, label: `contact approche ${level}` });
    const r = await info();
    t.log(JSON.stringify(r));
    assert(r.result === 'success' || r.result === 'perfect', `approche ${level} réussie au pilote automatique`);
    await t.ev(() => window.__xrDock.autopilot(false));
  }
  await t.wait(1800);
  await t.shot('fin');
}
