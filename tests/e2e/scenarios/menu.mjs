// Menus : accueil (JOUER / NIVEAUX / OPTIONS), choix du niveau (4 cartes, 3 verrouillées sur une sauvegarde neuve),
// retour par Échap, écran Options puis retour à l'accueil par le bouton Retour de l'en-tête.
// N'utilise pas les aides DEV : passe aussi sur le build de production (--prod).
import { activeScreen, assert, assertEq, clickText, screenText, waitForScreen } from '../lib/helpers.mjs';

export const meta = {
  title: 'Menus : accueil, choix du niveau, options',
  suites: ['smoke', 'full'],
  timeoutMs: 60000,
};

export default async function (t) {
  await t.goto('?touch=1');
  await waitForScreen(t, 'title');
  const title = (await screenText(t, 'title')).toUpperCase();
  for (const label of ['JOUER', 'NIVEAUX', 'OPTIONS']) {
    assert(title.includes(label), `l'accueil doit afficher ${label} (texte : ${title})`);
  }
  await t.shot('title');

  // Choix du niveau : une carte par étape ; sauvegarde neuve → seule la première est jouable.
  await clickText(t, 'Niveaux');
  await waitForScreen(t, 'select');
  const cards = await t.ev(() =>
    [...document.querySelectorAll('.screens [data-screen="select"] .card')].map((c) => ({
      title: (c.querySelector('.card-title') || {}).textContent || '',
      locked: c.classList.contains('is-locked'),
    })),
  );
  t.log('cartes', cards.map((c) => `${c.title}${c.locked ? ' (verrouillé)' : ''}`).join(' | '));
  assertEq(cards.length, 4, 'nombre de cartes du choix du niveau');
  assert(cards.every((c) => c.title.trim()), 'chaque carte doit avoir un titre');
  assertEq(
    cards.map((c) => c.locked),
    [false, true, true, true],
    'verrous des cartes sur une sauvegarde neuve',
  );
  await t.shot('select');

  // Échap = retour à l'accueil
  await t.key('Escape', 60);
  await waitForScreen(t, 'title');

  // Options : interrupteurs présents, puis bouton Retour de l'en-tête
  await clickText(t, 'Options');
  await waitForScreen(t, 'options');
  const toggles = await t.ev(() => document.querySelectorAll('.screens [data-screen="options"] .toggle').length);
  assert(toggles >= 4, `l'écran Options doit afficher ses interrupteurs (${toggles} trouvés)`);
  await t.shot('options');
  await t.page.locator('.screens [data-screen="options"].is-active [aria-label="Retour"]').click();
  await waitForScreen(t, 'title');
  assertEq(await activeScreen(t), 'title', 'écran actif après Retour depuis Options');
  await t.shot('back-to-title');
}
