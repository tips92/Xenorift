// Diagnostic : captures de la page d'aperçu des dessins du monde 1 (/preview/props.html, serveur de dev
// seulement) pour une revue visuelle : champignon, barrière d'arène, glyphes, Tess et sa capsule (planches
// dépliées et mise en situation), tronc abattu, branches / lianes / passerelles, petite scène d'essai, avec des
// loupes. Affiche le temps de génération des planches ; pas de vrai verdict (échoue seulement si la page ne se
// construit pas).
import { waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Aperçu des dessins du monde 1 (preview/props.html) : objets, tronc, plateformes, scène',
  suites: ['diag'],
  dev: true,
  timeoutMs: 150000,
  viewport: { width: 1280, height: 720 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

const VIEWS = [
  { tag: 'objects', q: 'view=objects' },
  { tag: 'objects-mushroom-barrier-zoom', q: 'view=objects&z=2.5&cx=250&cy=190' },
  { tag: 'objects-glyphs-zoom', q: 'view=objects&z=2.5&cx=240&cy=560' },
  { tag: 'objects-tess-zoom', q: 'view=objects&z=2.5&cx=830&cy=236' },
  { tag: 'objects-capsule-zoom', q: 'view=objects&z=2&cx=800&cy=360' },
  { tag: 'trunk', q: 'view=trunk' },
  { tag: 'walkways', q: 'view=walkways' },
  { tag: 'walkways-zoom', q: 'view=walkways&z=2.5&cx=420&cy=260' },
  { tag: 'walkways-bridge-zoom', q: 'view=walkways&z=2.5&cx=420&cy=480' },
  { tag: 'scene-x0', q: 'view=scene&x=0' },
  { tag: 'scene-x1280', q: 'view=scene&x=1280' },
  { tag: 'scene-tess-zoom', q: 'view=scene&x=0&z=2&cx=1000&cy=640' },
  { tag: 'scene-ruin-zoom', q: 'view=scene&x=1280&z=2&cx=2200&cy=560' },
];

export default async function (t) {
  for (const v of VIEWS) {
    await t.goto(`preview/props.html?${v.q}`);
    await waitFor(t, () => !!window.__propsScene && window.__propsScene.sys.isActive() && window.__propsScene.game.loop.frame > 30, {
      timeout: 30000,
      label: `aperçu ${v.tag} construit`,
    });
    await t.wait(700); // animations et rebonds lancés
    const info = await t.ev(() => {
      const s = window.__propsScene;
      const txt = s.children.list.find((c) => c.type === 'Text' && /planches/.test(c.text));
      return { text: txt ? txt.text : null, objects: s.children.list.length };
    });
    t.log(`${v.tag} : ${info.text} (${info.objects} objets)`);
    await t.shot(v.tag);
  }
}
