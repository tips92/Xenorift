// Diagnostic : épave à la première personne (preview/ship.html, ouverte par Tests de l'accueil, aussi en --prod).
// Passe par l'accueil et la page des essais, abat un monstre, prend la carte d'accès et sort par le sas.
import { assert, waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Épave d’essai (preview/ship.html) : vue à la première personne, monstres, carte et sas',
  suites: ['diag'],
  timeoutMs: 120000,
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

export default async function (t) {
  await t.goto('');
  await t.page.locator('button.footer-try').click();
  await t.page.waitForSelector('body[data-ready]');
  await t.page.locator('button.card', { hasText: 'Épave' }).click();
  await waitFor(t, () => !!window.__xrShip && window.__xrShip.info().fps > 0, { timeout: 30000, label: 'épave construite' });
  await t.wait(800);
  await t.shot('depart');
  const info = () => t.ev(() => window.__xrShip.info());
  t.log(JSON.stringify(await info()));

  await t.ev(() => {
    const s = window.__xrShip;
    s.god(true);
    s.teleport(8, 2);
    s.face(11, 2);
  });
  await t.wait(700);
  await t.shot('rampant');
  await t.ev(() => window.__xrShip.fire(true));
  await t.wait(1500);
  await t.ev(() => window.__xrShip.fire(false));
  await t.shot('rampant-abattu');
  const a = await info();
  t.log(JSON.stringify(a));
  assert(a.shots > 0 && a.killed >= 1, 'le rampant visé doit tomber');

  // Cracheur de la salle centrale, vu depuis la porte.
  await t.ev(() => {
    window.__xrShip.teleport(8, 8);
    window.__xrShip.face(11, 7);
  });
  await t.wait(2600);
  await t.shot('cracheur');

  await t.ev(() => window.__xrShip.teleport(19, 12, 0));
  await t.wait(500);
  const locked = await info();
  assert(!locked.over, 'sas verrouillé sans la carte');
  await t.shot('sas-verrouille');
  await t.ev(() => window.__xrShip.teleport(9, 10));
  await t.wait(400);
  assert((await info()).card, 'carte prise');
  await t.ev(() => window.__xrShip.teleport(19, 12, 0));
  await t.wait(600);
  const end = await info();
  t.log(JSON.stringify(end));
  assert(end.over && end.hearts > 0, 'sortie par le sas avec la carte');
  await t.shot('fin');
}
