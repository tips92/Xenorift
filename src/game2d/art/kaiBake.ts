import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KAI_BAKE_SCALE, KAI_FILL, KAI_FRAME, KAI_NEAR_ARM } from './kaiModel';
import { installKaiFrame } from './kaiSheet';

// Rendu de profil du .glb, une fois, avant que Phaser ou le vol ne prennent le contexte WebGL.
// Le renderer est détruit tout de suite : un second contexte vivant fait perdre le premier sur cette machine.

const GLB_FILE = new URL('../../../art/kai.glb', import.meta.url).href;

const NEAR = new Set(KAI_NEAR_ARM.map(nodeKey));
const _v = new THREE.Vector3();

/** Three retire espaces et « . : / [ ] » des noms (Bras.R devient BrasR). */
function nodeKey(name: string): string {
  return name.replace(/\s/g, '_').replace(/[\[\].:/]/g, '');
}

export interface KaiStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  model: THREE.Object3D;
  /** Masque ou montre le bras proche. Renvoie le nombre de nœuds trouvés. */
  setNearArm(hidden: boolean): number;
  fit(): void;
  dispose(): void;
}

/** Boîte des maillages visibles (le bras masqué ne doit pas élargir le cadre). */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    for (let p: THREE.Object3D | null = obj; p; p = p.parent) {
      if (!p.visible) return;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    const min = bb.min;
    const max = bb.max;
    const xs = [min.x, max.x];
    const ys = [min.y, max.y];
    const zs = [min.z, max.z];
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          _v.set(xs[ix], ys[iy], zs[iz]).applyMatrix4(mesh.matrixWorld);
          box.expandByPoint(_v);
        }
      }
    }
  });
  return box;
}

/**
 * Caméra orthographique : Kaï vers la droite, pieds au bas de la frame, hauteur = KAI_FILL de la frame.
 * Le .glb est en Y vers le haut (export glTF). On le regarde depuis −X.
 */
export function fitKaiSideCamera(camera: THREE.OrthographicCamera, box: THREE.Box3): void {
  const size = box.getSize(_v);
  const viewH = Math.max(size.y, 0.001) / KAI_FILL;
  const viewW = viewH * (KAI_FRAME.w / KAI_FRAME.h);
  const lookY = box.min.y + viewH / 2;
  const lookZ = (box.min.z + box.max.z) / 2;
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.near = 0.05;
  camera.far = Math.max(20, size.x + 10);
  camera.position.set(box.min.x - 3, lookY, lookZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(box.max.x + 1, lookY, lookZ);
  camera.updateProjectionMatrix();
}

export async function openKaiStage(url: string = GLB_FILE): Promise<KaiStage> {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  try {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x1a1030, 0.9));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.45);
    key.position.set(-3, 4, 2.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fd8ff, 0.4);
    fill.position.set(-2, 1.5, -3);
    scene.add(fill);

    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    scene.add(model);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);

  const stage: KaiStage = {
    renderer,
    scene,
    camera,
    model,
    setNearArm(hidden: boolean): number {
      let n = 0;
      model.traverse((obj) => {
        if (!NEAR.has(nodeKey(obj.name))) return;
        obj.visible = !hidden;
        n++;
      });
      return n;
    },
    fit(): void {
      const box = visibleBounds(model);
      if (box.isEmpty()) return;
      fitKaiSideCamera(camera, box);
    },
    dispose(): void {
      renderer.forceContextLoss();
      renderer.dispose();
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m?.dispose();
      });
    },
  };
    return stage;
  } catch (err) {
    renderer.forceContextLoss();
    renderer.dispose();
    throw err;
  }
}

/** Frame 64×80, fond transparent, telle que la planche du jeu. */
export function renderGameFrame(stage: KaiStage): HTMLCanvasElement {
  const w = KAI_FRAME.w * KAI_BAKE_SCALE;
  const h = KAI_FRAME.h * KAI_BAKE_SCALE;
  stage.fit();
  stage.renderer.setSize(w, h, false);
  stage.renderer.render(stage.scene, stage.camera);
  const out = document.createElement('canvas');
  out.width = KAI_FRAME.w;
  out.height = KAI_FRAME.h;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(stage.renderer.domElement, 0, 0, out.width, out.height);
  return out;
}

/** Charge le .glb, rend la pose, libère le contexte WebGL. À appeler avant Phaser et avant le vol. */
export async function prepareKaiSheet(url: string = GLB_FILE): Promise<void> {
  const stage = await openKaiStage(url);
  try {
    const hidden = stage.setNearArm(true);
    if (hidden === 0) console.warn('[kai] bras proche introuvable dans le .glb : les deux bras sont dessinés');
    installKaiFrame(renderGameFrame(stage));
  } finally {
    stage.dispose();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
}
