// Langue : repli français si la locale du téléphone est inconnue, ?lang= pour en/de/it/es/fr,
// choix Deutsch enregistré (il gagne sur le système au rechargement), ?lang=system ne l'efface pas.
// Contexte ja-JP : le défaut « système » ne tombe pas sur une des 5 langues. Pas d'aides DEV.
import { assert, clickText, screenText, waitForScreen } from '../lib/helpers.mjs';

export const meta = {
  title: 'Langue : système, choix, persistance, repli',
  suites: ['smoke', 'full'],
  timeoutMs: 60000,
  locale: 'ja-JP',
};

async function titleHas(t, needle) {
  await waitForScreen(t, 'title');
  const text = await screenText(t, 'title');
  // Les boutons de l'accueil sont en capitales (CSS) : innerText renvoie JOUER, pas Jouer.
  assert(text.toUpperCase().includes(needle.toUpperCase()), `l'accueil doit contenir « ${needle} » (texte : ${text.slice(0, 180)})`);
  return text;
}

export default async function (t) {
  // Locale ja : aucune des 5 langues → repli français.
  await t.goto('?touch=1');
  await titleHas(t, 'Jouer');

  await t.goto('?touch=1&lang=en');
  await titleHas(t, 'Play');
  await clickText(t, 'Stages');
  await waitForScreen(t, 'select');
  const en = await screenText(t, 'select');
  assert(en.toUpperCase().includes('EDGE OF XÉNA'), `carte anglaise « Edge of Xéna » (texte : ${en.slice(0, 220)})`);

  await t.goto('?touch=1&lang=de');
  await titleHas(t, 'Spielen');
  await t.goto('?touch=1&lang=it');
  await titleHas(t, 'Gioca');
  await t.goto('?touch=1&lang=es');
  await titleHas(t, 'Jugar');
  await t.goto('?touch=1&lang=fr');
  await titleHas(t, 'Jouer');

  // Choix enregistré : Deutsch, puis rechargement sans ?lang= (le système reste ja).
  await clickText(t, 'Options');
  await waitForScreen(t, 'options');
  await clickText(t, 'Deutsch', { exact: true });
  await t.goto('?touch=1');
  await titleHas(t, 'Spielen');

  // ?lang=system pour cette page seulement : ja → français, sans effacer le réglage.
  await t.goto('?touch=1&lang=system');
  await titleHas(t, 'Jouer');
  await t.goto('?touch=1');
  await titleHas(t, 'Spielen');
  await t.shot('lang-de');
};
