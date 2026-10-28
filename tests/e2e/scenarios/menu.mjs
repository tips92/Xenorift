// Menus : accueil (JOUER / NIVEAUX / OPTIONS), choix du niveau (une page par monde, ouverte sur le monde 1 ;
// cartes [data-stage], seule j1 ouverte sur une sauvegarde neuve ; ▶ puis ◀ changent de page), retour par Échap,
// écran Options puis retour à l'accueil par le bouton Retour de l'en-tête.
// N'utilise pas les aides DEV : passe aussi sur le build de production (--prod).
import { activeScreen, assert, assertEq, clickText, screenText, waitForScreen } from '../lib/helpers.mjs';
import { selectState, waitSelectPage } from '../lib/core.mjs';

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

  // Choix du niveau : une carte par étape, une page par monde ; sauvegarde neuve → seule la première est jouable.
  await clickText(t, 'Niveaux');
  await waitForScreen(t, 'select');
  let sel = await selectState(t);
  t.log('cartes', sel.order.map((id) => `${id} ${sel.cards[id].title}${sel.cards[id].locked ? ' (verrouillé)' : ''}`).join(' | '));
  assertEq(sel.order, ['j1', 'f1', 'm1', 'f2'], 'cartes du choix du niveau (data-stage)');
  assert(sel.order.every((id) => sel.cards[id].title), 'chaque carte doit avoir un titre');
  assertEq(
    sel.order.map((id) => sel.cards[id].locked),
    [false, true, true, true],
    'verrous des cartes sur une sauvegarde neuve',
  );
  assertEq(
    { worlds: sel.worlds, world: sel.world, name: sel.name, stars: sel.worldStars, prev: sel.prev, next: sel.next },
    { worlds: [1, 2], world: 1, name: 'Monde 1 · Jungle de Xéna', stars: '0/6', prev: { disabled: true }, next: { disabled: false } },
    'pages des Niveaux : ouvert sur le monde 1',
  );
  assertEq(sel.cards.j1.title, 'Lisière de Xéna', 'titre de j1');
  await t.shot('select');
  // ▶ : monde 2 (◀ actif, ▶ désactivé), puis ◀ : retour au monde 1.
  await t.page.locator('.screens [data-screen="select"].is-active .select-next').click();
  await waitSelectPage(t, 2);
  sel = await selectState(t);
  assertEq({ name: sel.name, prev: sel.prev, next: sel.next }, { name: 'Monde 2 · Lune Krator', prev: { disabled: false }, next: { disabled: true } }, 'page du monde 2');
  await t.shot('select-world2');
  await t.page.locator('.screens [data-screen="select"].is-active .select-prev').click();
  await waitSelectPage(t, 1);

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
