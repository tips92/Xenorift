// Diagnostic : captures de la page d'aperçu des boss du monde 1 (/preview/bosses.html, serveur de dev seulement)
// pour une revue visuelle : toutes les images du Blob-roi et du Scarabée-titan (phases 1 et 2, fuite), la
// méduse-baleine dans son arène à grey = 0 / 0,5 / 1 (cœur, tentacules, taches d'annonce des spores), blessée et
// vaincue, et la planche
// de toutes ses images ; avec et sans les boîtes utiles, à l'échelle du jeu (1600x720) puis réduites comme sur un
// téléphone en paysage (844x390), et quelques loupes. Affiche les temps de génération ; pas de vrai verdict
// (échoue seulement si la page ne se construit pas).
import { waitFor } from '../lib/helpers.mjs';

export const meta = {
  title: 'Aperçu des boss du monde 1 (preview/bosses.html) : Blob-roi, Scarabée-titan, méduse-baleine',
  suites: ['diag'],
  dev: true,
  timeoutMs: 180000,
  viewport: { width: 1600, height: 720 },
  // La page d'aperçu n'a pas d'icône : Chrome demande /favicon.ico (404 du serveur de dev).
  allowConsole: [/^Failed to load resource: the server responded with a status of 404/],
};

const GAME = [1600, 720];
/** Téléphone en paysage : la vue logique garde 720 px de haut, la largeur suit l'écran (844x390 → 1558). */
const PHONE = [844, 390];

const VIEWS = [
  { q: 'view=blob', size: GAME, tag: 'blob' },
  { q: 'view=blob&boxes=1', size: GAME, tag: 'blob-boxes' },
  { q: 'view=beetle', size: GAME, tag: 'beetle' },
  { q: 'view=beetle&boxes=1', size: GAME, tag: 'beetle-boxes' },
  { q: 'view=whale&grey=0', size: GAME, tag: 'whale-grey0' },
  { q: 'view=whale&grey=0.5', size: GAME, tag: 'whale-grey05' },
  { q: 'view=whale&grey=1', size: GAME, tag: 'whale-grey1' },
  { q: 'view=whale&grey=1&boxes=1', size: GAME, tag: 'whale-grey1-boxes' },
  { q: 'view=whale&grey=1&body=1', size: GAME, tag: 'whale-hurt' },
  { q: 'view=whale&grey=1&body=2', size: GAME, tag: 'whale-defeat' },
  { q: 'view=whale-sheet', size: GAME, tag: 'whale-sheet' },
  { q: 'view=whale-sheet&boxes=1', size: GAME, tag: 'whale-sheet-boxes' },
  // Loupes x2 : noyau du Blob-roi, ventre du Scarabée-titan, cœur et visage de la méduse-baleine
  { q: 'view=blob&z=2&cx=780&cy=520', size: GAME, tag: 'blob-zoom-core' },
  { q: 'view=beetle&z=2&cx=1250&cy=120', size: GAME, tag: 'beetle-zoom-stunned' },
  { q: 'view=whale&grey=1&z=2&cx=660&cy=170', size: GAME, tag: 'whale-zoom-face' },
  { q: 'view=whale&grey=1&z=2&cx=790&cy=340', size: GAME, tag: 'whale-zoom-heart' },
  // Téléphone en paysage
  { q: 'view=blob&w=1558', size: PHONE, tag: 'phone-blob' },
  { q: 'view=beetle&w=1558', size: PHONE, tag: 'phone-beetle' },
  { q: 'view=whale&grey=1&w=1558', size: PHONE, tag: 'phone-whale-grey1' },
];

export default async function (t) {
  for (const v of VIEWS) {
    await t.page.setViewportSize({ width: v.size[0], height: v.size[1] });
    await t.goto(`preview/bosses.html?${v.q}`);
    await waitFor(t, () => !!window.__bossScene && window.__bossScene.sys.isActive() && window.__bossScene.game.loop.frame > 30, {
      timeout: 30000,
      label: `aperçu ${v.tag} construit`,
    });
    await t.wait(400);
    const info = await t.ev(() => {
      const s = window.__bossScene;
      const find = (re) => s.children.list.find((c) => c.type === 'Text' && re.test(c.text));
      const txt = find(/textures du thème/);
      const edges = find(/^bords/);
      return { text: txt ? txt.text : null, edges: edges ? edges.text : null, objects: s.children.list.length };
    });
    t.log(`${v.tag} : ${info.text} (${info.objects} objets)`);
    // Bords des images : un halo coupé net par le cadre se voit en jeu (rectangle autour du boss)
    t.log(`${v.tag} : ${info.edges}`);
    await t.shot(v.tag);
  }
}
