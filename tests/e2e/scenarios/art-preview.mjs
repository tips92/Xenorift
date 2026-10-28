// Diagnostic : captures de la page d'aperçu des graphismes 2D (/preview/art.html, serveur de dev seulement)
// pour une revue visuelle : planche des textures (Kaï et son bras armé, poses accroupies et de reptation, portes
// et flèche ▲, mur de salle, ennemis, objets, balise de LUMA ; loupes x2,5 sur Kaï et les portes, x2 sur la balise
// de la Jungle), stand de tir des 4 armes (loupe x2,5 sur les bras armés) et monde de démonstration, pour la
// Jungle et la Lune. Affiche les temps de génération des textures relevés par la page ; pas de vrai verdict
// (échoue seulement si la page ne se construit pas).
import { waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Aperçu des graphismes 2D (preview/art.html) : planches, armes et mondes Jungle et Lune',
  suites: ['diag'],
  dev: true,
  timeoutMs: 120000,
  viewport: { width: 1280, height: 1080 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

const VIEWS = [
  { theme: 'jungle', view: 'sheet', size: [1280, 1080] },
  // Loupes : frames accroupies et de reptation (p11 à p14), Kaï assemblé (visées, accroupi, reptation,
  // gauche), portes et mur de salle.
  { theme: 'jungle', view: 'sheet', size: [1280, 1080], extra: '&z=2.5&cx=880&cy=232', tag: 'jungle-sheet-crouch-zoom' },
  { theme: 'jungle', view: 'sheet', size: [1280, 1080], extra: '&z=2.5&cx=330&cy=826', tag: 'jungle-sheet-kai-zoom' },
  { theme: 'jungle', view: 'sheet', size: [1280, 1080], extra: '&z=2.5&cx=1010&cy=800', tag: 'jungle-sheet-doors-zoom' },
  // Balise de LUMA (sortie des niveaux 1 et 2) : frames, faisceau, activée avec Kaï dans le faisceau.
  { theme: 'jungle', view: 'sheet', size: [1280, 1080], extra: '&z=2&cx=325&cy=950', tag: 'jungle-sheet-beacon-zoom' },
  { theme: 'moon', view: 'sheet', size: [1280, 1080] },
  // Stand de tir des 4 armes (plan 02) : Kaï et chaque arme (devant, haut, diagonale, accroupi), tirs à la
  // vitesse et à la cadence réelles, sur le décor de chaque thème ; loupe sur les bras armés.
  { theme: 'jungle', view: 'weapons', size: [1280, 720] },
  { theme: 'jungle', view: 'weapons', size: [1280, 720], extra: '&z=2.5&cx=500&cy=230', tag: 'jungle-weapons-zoom' },
  { theme: 'moon', view: 'weapons', size: [1280, 720] },
  { theme: 'jungle', view: 'world', size: [1280, 720], extra: '&speed=0&x=0' },
  { theme: 'jungle', view: 'world', size: [1280, 720], extra: '&speed=0&x=2600' },
  { theme: 'moon', view: 'world', size: [1280, 720], extra: '&speed=0&x=0' },
  { theme: 'moon', view: 'world', size: [1280, 720], extra: '&speed=0&x=2600' },
];

export default async function (t) {
  for (const v of VIEWS) {
    const tag = v.tag || `${v.theme}-${v.view}${v.extra ? `-x${/x=(\d+)/.exec(v.extra)[1]}` : ''}`;
    await t.page.setViewportSize({ width: v.size[0], height: v.size[1] });
    // URL relative à la racine du serveur de dev (t.base se termine par /) : preview/art.html?…
    await t.goto(`preview/art.html?theme=${v.theme}&view=${v.view}${v.extra || ''}`);
    await waitFor(t, () => !!window.__artScene && window.__artScene.sys.isActive() && window.__artScene.game.loop.frame > 30, {
      timeout: 30000,
      label: `aperçu ${tag} construit`,
    });
    await t.wait(500); // bras et flèches recalés sur quelques images
    const info = await t.ev(() => {
      const s = window.__artScene;
      const txt = s.children.list.find((c) => c.type === 'Text' && /textures/.test(c.text));
      return { text: txt ? txt.text : null, objects: s.children.list.length };
    });
    t.log(`${tag} : ${info.text} (${info.objects} objets)`);
    await t.shot(tag);
  }
}
