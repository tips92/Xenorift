import '@fontsource/exo-2/600.css';
import { drawPlayerFrame } from '../src/game2d/art/draw/player';
import { ensureKaiSprites } from '../src/game2d/art/kaiPng';
import { openKaiStage, type KaiStage } from '../src/game2d/art/kaiBake';
import { KAI_FRAME } from '../src/game2d/art/kaiModel';

// Aperçu du .glb dans le cadre du sprite (64×80, pieds en bas, vers la droite), à côté du Kaï dessiné.
// http://localhost:5173/preview/kai.html

const SHOW = 6;
const status = document.querySelector('#status') as HTMLParagraphElement;
const frames = document.querySelector('#frames') as HTMLElement;
const hideArm = document.querySelector('#hide-arm') as HTMLInputElement;

function figure(caption: string, canvas: HTMLCanvasElement): void {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(cap, canvas);
  frames.append(fig);
}

const sharp = document.createElement('canvas');
sharp.width = KAI_FRAME.w * SHOW;
sharp.height = KAI_FRAME.h * SHOW;
const game = document.createElement('canvas');
game.width = KAI_FRAME.w;
game.height = KAI_FRAME.h;
game.className = 'game';
const drawn = document.createElement('canvas');
drawn.width = KAI_FRAME.w;
drawn.height = KAI_FRAME.h;
drawn.className = 'game';

figure('Modèle, cadre du jeu ×6', sharp);
figure('Tel que la planche 64×80', game);
figure('Kaï du jeu (PNG)', drawn);

const drawnCtx = drawn.getContext('2d');
await ensureKaiSprites();
if (drawnCtx) drawPlayerFrame(drawnCtx, 0);

let stage: KaiStage | null = null;

function paint(): void {
  if (!stage) return;
  stage.setNearArm(hideArm.checked);
  stage.fit();
  stage.renderer.setSize(sharp.width, sharp.height, false);
  stage.renderer.render(stage.scene, stage.camera);
  const src = stage.renderer.domElement;
  sharp.getContext('2d')?.drawImage(src, 0, 0);
  const g = game.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = true;
  g.drawImage(src, 0, 0, game.width, game.height);
}

hideArm.addEventListener('change', paint);

try {
  stage = await openKaiStage();
  const found = stage.setNearArm(true);
  paint();
  status.textContent =
    found > 0
      ? `Modèle chargé (${found} nœuds de bras proche). Dans le jeu : ?kai=glb (serveur de dev), avec ?stage=j1 pour le voir dans un niveau. Sans ce paramètre, Kaï est le PNG. Une seule pose pour l’instant : pas de marche, de saut ni d’accroupi tant que le fichier n’a pas de squelette.`
      : 'Modèle chargé, mais les noms du bras proche (.R) sont introuvables : les deux bras restent visibles.';
} catch (err) {
  console.error(err);
  status.textContent =
    'Impossible de lire art/kai.glb. Exporte-le depuis Blender avec art/outils/export-kai.py (fichier art/kai.blend ouvert), puis recharge cette page.';
}
