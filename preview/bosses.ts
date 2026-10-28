import Phaser from 'phaser';
import '@fontsource/exo-2/600.css';
import { createParallax, generatePlatformArt, type ParallaxHandle } from '../src/game2d/art';
import {
  BOSS_SHEETS,
  type BossBox,
  type BossFrameBoxes,
  type BossSheetId,
  WHALE_BOSS,
  WHALE_HEART,
  buildBossSheet,
} from '../src/game2d/art/draw/bosses';
import { ARM_RIG, ARM_TEX, FRAMES, FRAME_SIZE, TEX, TILESET, TILE_FRAME } from '../src/game2d/art/keys';
import { AIM_ANGLE, type AimDir, DEPTH, LEVEL_ROWS, TILE, VIEW_H } from '../src/game2d/constants';

// Page d'aperçu des boss du monde 1 (outil de développement, hors jeu) : toutes les images du Blob-roi, du
// Scarabée-titan et de la méduse-baleine sur un décor de jungle à l'échelle du jeu (tuiles de 64 px, vue de
// 720 px de haut), Kaï à côté pour comparer.
// Paramètres : ?view=blob|beetle|whale|whale-sheet &grey=0..1 &body=0|1|2 (vue whale) &boxes=1 (boîtes utiles)
// &w=1080..1600 &z=2&cx&cy (loupe, coordonnées de la vue).

type View = 'blob' | 'beetle' | 'whale' | 'whale-sheet';
const params = new URLSearchParams(location.search);
const viewParam = params.get('view');
const view: View = viewParam === 'beetle' || viewParam === 'whale' || viewParam === 'whale-sheet' ? viewParam : 'blob';
const viewW = Math.min(1600, Math.max(1080, Number(params.get('w')) || 1600));
const grey = params.has('grey') ? Math.min(1, Math.max(0, Number(params.get('grey')) || 0)) : 1;
const showBoxes = params.get('boxes') === '1';
/** Vue whale : image du corps (0 normal, cœur exposé ; 1 blessée, cœur fermé ; 2 défaite, sans cœur). */
const bodyFrame = Math.max(0, Math.min(2, Math.round(Number(params.get('body')) || 0)));

/** Décalage de la caméra : la carte a 14 lignes, la vue en montre 11,25 (sol en bas, comme en jeu). */
const SCROLL_Y = LEVEL_ROWS * TILE - VIEW_H;
/** Surface du sol (ligne 12) et des étagères `=` (lignes 9 et 6), en y de carte. */
const GROUND = 12 * TILE;
const MID = 9 * TILE;
const TOP = 6 * TILE;
/** Sommet d'un saut de Kaï (pieds au-dessus du sol, JUMP_HEIGHT_TILES = 4,2) et hauteur de son corps. */
const JUMP_APEX = 4.2 * TILE;
const KAI_H = 70;

const LABEL = {
  fontFamily: '"Exo 2", sans-serif',
  fontSize: '12px',
  color: '#ffffff',
  backgroundColor: 'rgba(5,1,15,0.62)',
  padding: { x: 4, y: 2 },
};
const BOX_COL = { weak: 0x3dff7a, hurt: 0xff3a4a, armor: 0xffcc33 } as const;

const key = (id: BossSheetId, g?: number) => (g === undefined ? BOSS_SHEETS[id].key : `${BOSS_SHEETS[id].key}@${g}`);

interface Chain {
  x: number;
  y: number;
  spacing: number;
  phase: number;
  /** Ampleur du balancement (0 : tige droite). */
  amp: number;
  parts: Phaser.GameObjects.Image[];
}

class BossScene extends Phaser.Scene {
  private parallax: ParallaxHandle | null = null;
  private gfx!: Phaser.GameObjects.Graphics;
  private chains: Chain[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('bosses');
  }

  create(): void {
    (window as unknown as { __bossScene: Phaser.Scene }).__bossScene = this;
    const t0 = performance.now();
    generatePlatformArt(this, 'jungle');
    const t1 = performance.now();
    const times: string[] = [];
    const edges: string[] = [];
    const build = (id: BossSheetId, g?: number) => {
      const t = performance.now();
      buildBossSheet(this, id, 'jungle', g === undefined ? undefined : { grey: g }, key(id, g));
      times.push(`${id}${g === undefined ? '' : '@' + g} ${(performance.now() - t).toFixed(0)}`);
      edges.push(`${id}${g === undefined ? '' : '@' + g} ${this.edgeAlpha(id, key(id, g))}`);
    };
    if (view === 'blob') {
      build('blobKing');
      build('blobKingRage');
    } else if (view === 'beetle') {
      build('beetleTitan');
      build('beetleTitanCracked');
    } else if (view === 'whale') {
      for (const id of ['whaleBody', 'whaleHeart', 'whaleTentacle'] as const) build(id, grey);
      build('whaleSpot');
    } else {
      for (const g of [0, 0.5, 1]) build('whaleBody', g);
      for (const g of [0, 1]) {
        build('whaleHeart', g);
        build('whaleTentacle', g);
      }
      build('whaleSpot');
    }
    const t2 = performance.now();
    this.parallax = createParallax(this, 'jungle');
    this.gfx = this.add.graphics().setDepth(900);
    if (view === 'blob') this.buildBlob();
    else if (view === 'beetle') this.buildBeetle();
    else if (view === 'whale') this.buildWhale();
    else this.buildWhaleSheet();
    if (showBoxes) this.title('vert = vulnérable · rouge = blessant · or = blindé · croix = origine', 24);
    const msg = `textures du thème ${(t1 - t0).toFixed(0)} ms · boss ${(t2 - t1).toFixed(0)} ms (${times.join(', ')})`;
    const edgeMsg = `bords (alpha max /255 haut-bas-gauche-droite) : ${edges.join(' · ')}`;
    console.log('[bosses preview]', msg, edgeMsg);
    this.add
      .text(viewW - 8, VIEW_H - 6, msg, { ...LABEL, fontSize: '11px' })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    this.add
      .text(viewW - 8, VIEW_H - 26, edgeMsg, { ...LABEL, fontSize: '11px' })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    this.zoom();
  }

  /**
   * Opacité maximale sur le pourtour des images d'une planche (haut-bas-gauche-droite) : au-delà de quelques
   * unités, un halo ou un trait est coupé net par le bord de l'image et se verra en jeu.
   */
  private edgeAlpha(id: BossSheetId, k: string): string {
    const s = BOSS_SHEETS[id];
    const src = this.textures.get(k).getSourceImage() as HTMLCanvasElement;
    const ctx = src.getContext('2d');
    if (!ctx) return '?';
    const max = [0, 0, 0, 0];
    for (let i = 0; i < s.count; i++) {
      const d = ctx.getImageData(i * (s.w + 2), 0, s.w, s.h).data;
      const a = (x: number, y: number) => d[(y * s.w + x) * 4 + 3];
      for (let x = 0; x < s.w; x++) {
        max[0] = Math.max(max[0], a(x, 0));
        max[1] = Math.max(max[1], a(x, s.h - 1));
      }
      for (let y = 0; y < s.h; y++) {
        max[2] = Math.max(max[2], a(0, y));
        max[3] = Math.max(max[3], a(s.w - 1, y));
      }
    }
    return max.join('-');
  }

  // ------------------------------------------------------------ Outils

  private title(text: string, y = 4): void {
    this.add.text(8, y, text, { ...LABEL, fontSize: '13px' }).setScrollFactor(0).setDepth(1000);
  }

  private label(x: number, y: number, text: string): void {
    this.add.text(x, y, text, LABEL).setOrigin(0.5, 0).setDepth(1000);
  }

  /** Sol (lignes 12-13) et étagères `=` aux lignes données ; caméra calée comme en jeu. */
  private buildMap(shelves: readonly number[]): void {
    const cols = Math.ceil(viewW / TILE) + 1;
    const data: number[][] = [];
    for (let r = 0; r < LEVEL_ROWS; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        let t = -1;
        if (r === 12) t = TILE_FRAME.GROUND_TOP;
        else if (r === 13) t = (c * 7 + r * 3) % 11 === 0 ? TILE_FRAME.GROUND_FILL_ALT : TILE_FRAME.GROUND_FILL;
        else if (shelves.includes(r)) t = TILE_FRAME.PLATFORM;
        row.push(t);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage(TEX.tiles, TEX.tiles, TILE, TILE, TILESET.margin, TILESET.spacing);
    if (ts) map.createLayer(0, ts, 0, 0)?.setDepth(DEPTH.tiles);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, cols * TILE, LEVEL_ROWS * TILE);
    cam.scrollY = SCROLL_Y;
  }

  /** Image d'une planche de boss posée par son origine en (x, y), boîtes en option. */
  private place(id: BossSheetId, g: number | undefined, frame: number, x: number, y: number, text?: string, scale = 1, depth: number = DEPTH.enemies): Phaser.GameObjects.Image {
    const s = BOSS_SHEETS[id];
    const img = this.add.image(x, y, key(id, g), frame).setOrigin(s.originX, s.originY).setScale(scale).setDepth(depth);
    if (text) this.label(x, y + 6, text);
    if (showBoxes) this.boxes(s.boxes[frame], x, y, scale);
    return img;
  }

  private boxes(b: BossFrameBoxes, x: number, y: number, scale: number): void {
    const g = this.gfx;
    const draw = (list: readonly BossBox[], col: number, lw: number) => {
      for (const r of list) {
        g.fillStyle(col, 0.1);
        g.fillRect(x + r.x * scale, y + r.y * scale, r.w * scale, r.h * scale);
        g.lineStyle(lw, col, 0.95);
        g.strokeRect(x + r.x * scale, y + r.y * scale, r.w * scale, r.h * scale);
      }
    };
    draw(b.armor, BOX_COL.armor, 5);
    draw(b.hurt, BOX_COL.hurt, 2);
    draw(b.weak, BOX_COL.weak, 3);
    g.lineStyle(2, 0xffffff, 1);
    g.lineBetween(x - 6, y, x + 6, y);
    g.lineBetween(x, y - 6, x, y + 6);
  }

  /** Kaï (pieds en feetY) avec son laser, comme Player.placeArm (épaule par défaut) ; renvoie la bouche du canon. */
  private kai(x: number, feetY: number, left = false, aim: AimDir = 'front', frame: number = FRAMES.player.idle[0]): { x: number; y: number; a: number } {
    const f = left ? -1 : 1;
    this.add.image(x, feetY, TEX.player, frame).setOrigin(0.5, 1).setFlipX(left).setDepth(DEPTH.player);
    const sx = ARM_RIG.shoulderX + (aim === 'up' ? ARM_RIG.upShoulderX : aim === 'diag' ? ARM_RIG.diagShoulderX : 0);
    const sy = ARM_RIG.shoulderY + (aim === 'diag' ? ARM_RIG.diagShoulderY : 0);
    const a = AIM_ANGLE[aim];
    this.add
      .image(x + f * sx, feetY + sy, ARM_TEX.laser, 0)
      .setOrigin(ARM_RIG.pivotX / FRAME_SIZE.arm.w, ARM_RIG.pivotY / FRAME_SIZE.arm.h)
      .setScale(f, 1)
      .setRotation(-f * a)
      .setDepth(DEPTH.player + 0.5);
    const mx = 27;
    const my = 7;
    return { x: x + f * (sx + mx * Math.cos(a) + my * Math.sin(a)), y: feetY + sy - mx * Math.sin(a) + my * Math.cos(a), a: left ? Math.PI + a : -a };
  }

  /** Trait laser à distance d de la bouche du canon. */
  private laser(m: { x: number; y: number; a: number }, d: number): void {
    const dir = m.a;
    this.add
      .image(m.x + Math.cos(dir) * d, m.y + Math.sin(dir) * d, TEX.laser)
      .setRotation(dir)
      .setDepth(DEPTH.projectiles)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  // ------------------------------------------------------------ Blob-roi

  private buildBlob(): void {
    this.buildMap([6, 9]);
    this.title('Blob-roi (mini-boss du niveau 1) · haut : phase 1 · milieu : phase 2 et fuite · sol : face à Kaï et au marcheur');
    const names = ['repos 0', 'repos 1', 'repos 2', 'écrasé', 'bond', 'aplati : noyau', 'fuite'];
    for (let i = 0; i < 6; i++) this.place('blobKing', undefined, i, 140 + i * 230, TOP, `${i} ${names[i]}`);
    for (let i = 0; i < 7; i++) this.place('blobKingRage', undefined, i, 130 + i * 222, MID, `${i} ${names[i]}`);
    this.kai(56, GROUND);
    this.add.image(140, GROUND, TEX.walker, 0).setOrigin(0.5, 1).setDepth(DEPTH.enemies);
    this.label(140, GROUND + 6, 'marcheur');
    this.place('blobKing', undefined, 0, 330, GROUND, 'Blob-roi');
    let m = this.kai(530, GROUND, true);
    this.laser(m, 60);
    this.place('blobKing', undefined, 5, 780, GROUND, 'noyau exposé');
    m = this.kai(990, GROUND, true);
    this.laser(m, 70);
    this.laser(m, 140);
    this.place('blobKingRage', undefined, 3, 1230, GROUND, 'phase 2 : écrasé');
    this.kai(1460, GROUND, true);
  }

  // ------------------------------------------------------------ Scarabée-titan

  private buildBeetle(): void {
    this.buildMap([6, 9]);
    this.title('Scarabée-titan (mini-boss du niveau 2) · haut : phase 1 · milieu : phase 2 (carapace fendue) · sol : fuite, face à Kaï');
    const names = ['marche 0', 'marche 1', 'marche 2', 'marche 3', 'charge', 'assommé : ventre', 'tir renvoyé', 'fuite'];
    for (let i = 0; i < 7; i++) this.place('beetleTitan', undefined, i, 128 + i * 224, TOP, `${i} ${names[i]}`);
    for (let i = 0; i < 7; i++) this.place('beetleTitanCracked', undefined, i, 128 + i * 224, MID, `${i} ${names[i]}`);
    this.kai(46, GROUND);
    this.add.image(130, GROUND, TEX.armored, 0).setOrigin(0.5, 1).setDepth(DEPTH.enemies);
    this.label(130, GROUND + 6, 'blindé');
    this.place('beetleTitanCracked', undefined, 7, 330, GROUND, '7 fuite');
    this.place('beetleTitan', undefined, 5, 690, GROUND, 'assommé');
    const m = this.kai(930, GROUND, true, 'diag');
    this.laser(m, 60);
    this.laser(m, 130);
    this.place('beetleTitan', undefined, 4, 1190, GROUND, 'charge');
    this.kai(1440, GROUND, true);
  }

  // ------------------------------------------------------------ Méduse-baleine dans son arène

  /** Chaîne d'images (tentacule ou tige du cœur), animée dans update(). */
  private chain(id: BossSheetId, g: number, x: number, y: number, frames: readonly number[], spacing: number, phase: number, depth: number, amp = 1): void {
    const parts = frames.map((f, j) =>
      this.add
        .image(x, y + j * spacing, key(id, g), f)
        .setScale(1 - j * 0.035)
        .setDepth(depth),
    );
    this.chains.push({ x, y, spacing, phase, amp, parts });
  }

  private buildWhale(): void {
    this.buildMap([]);
    const bodyName = ['cœur exposé', 'blessée, cœur fermé', 'défaite'][bodyFrame];
    this.title(`Méduse-baleine (gardien du niveau 3) · ${bodyName} · Vide : grey = ${grey} · jupe au-dessus de la tête de Kaï au sommet d'un saut`);
    const bx = Math.round(viewW * 0.5);
    const by = Math.round(GROUND - KAI_H - JUMP_APEX - 14 - WHALE_BOSS.skirtBottom);
    // Tentacules (le 4e abattu), derrière le corps
    const lengths = [8, 9, 10, 3, 10, 9, 8];
    WHALE_BOSS.tentacles.forEach((t, k) => {
      const n = lengths[k];
      const frames = Array.from({ length: n }, (_, j) => (j === n - 1 ? (k === 3 ? 3 : 2) : 0));
      this.chain('whaleTentacle', grey, bx + t.x, by + t.y + 8, frames, 19, k * 0.85, DEPTH.enemies - 2, bodyFrame === 2 ? 0.25 : 1);
    });
    // Cœur descendu à 3 tuiles du canon de Kaï, pendu à sa tige
    const hx = bx + WHALE_BOSS.heart.x;
    const hy = by + WHALE_BOSS.heart.y;
    const heartTop = GROUND - 38 - 3 * TILE - WHALE_HEART.cy;
    if (bodyFrame < 2) {
      const links = Math.max(1, Math.ceil((heartTop - hy) / 16));
      this.chain('whaleTentacle', grey, hx, hy + 6, new Array<number>(links).fill(1), 16, 0, DEPTH.enemies - 1, 0);
      const heart = this.place('whaleHeart', grey, bodyFrame === 0 ? 2 : 0, hx, heartTop, undefined, 1, DEPTH.enemies - 1);
      if (bodyFrame === 0) this.hearts.push(heart);
      this.label(hx + 92, heartTop + 74, bodyFrame === 0 ? 'cœur exposé' : 'cœur fermé');
    }
    this.place('whaleBody', grey, bodyFrame, bx, by);
    this.label(bx - 210, by + 150, 'corps (insensible)');
    // Kaï : sous le cœur (visée haute), au sommet d'un saut, et pour l'échelle
    const m = this.kai(hx - 19, GROUND, false, 'up');
    this.laser(m, 40);
    this.laser(m, 110);
    this.kai(bx + 200, GROUND - JUMP_APEX, false, 'front', FRAMES.player.jump);
    this.label(bx + 200, GROUND - JUMP_APEX + 6, 'sommet du saut');
    this.kai(110, GROUND);
    // Taches d'annonce des spores et spores qui tombent
    const sx = [bx + 340, bx + 480, bx + 620].map((x) => Math.min(x, viewW - 70));
    for (let i = 0; i < 3; i++) this.place('whaleSpot', undefined, i, sx[i], GROUND, `tache ${i}`, 1, DEPTH.items);
    this.add.image(sx[1], GROUND - 330, TEX.spore).setDepth(DEPTH.projectiles).setScale(1.4);
    this.add.image(sx[2], GROUND - 110, TEX.spore).setDepth(DEPTH.projectiles).setScale(1.4);
  }

  // ------------------------------------------------------------ Toutes les images de la méduse-baleine

  private buildWhaleSheet(): void {
    this.buildMap([]);
    this.title('Méduse-baleine : corps (x 0,5) à grey = 0 / 0,5 / 1, blessée et défaite (grey 1) ; cœur, tentacules et taches (x 1)');
    const rowA = SCROLL_Y + 104;
    const bodies: [number, number, string][] = [
      [0, 0, 'grey 0'],
      [0.5, 0, 'grey 0,5'],
      [1, 0, 'grey 1'],
      [1, 1, 'blessée (grey 1)'],
      [1, 2, 'défaite (grey 1)'],
    ];
    bodies.forEach(([g, f, name], i) => {
      const x = 150 + i * 296;
      this.place('whaleBody', g, f, x, rowA, undefined, 0.5);
      this.label(x, rowA + 76, name);
    });
    const rowB = SCROLL_Y + 206;
    const heartNames = ['fermé', 'ouvre', 'exposé', 'bat'];
    for (let i = 0; i < 8; i++) {
      const g = i < 4 ? 0 : 1;
      const x = 85 + i * 158;
      this.place('whaleHeart', g, i % 4, x, rowB);
      this.label(x, rowB + WHALE_HEART.h + 2, `cœur ${i % 4} ${heartNames[i % 4]} · g${g}`);
    }
    const tentNames = ['segment', 'tige', 'bout', 'moignon'];
    for (const [row, g] of [
      [0, 0],
      [1, 1],
    ] as const) {
      for (let i = 0; i < 4; i++) {
        const x = 1336 + i * 72;
        const y = rowB + 40 + row * 92;
        this.place('whaleTentacle', g, i, x, y);
        this.label(x, y + 26, `${tentNames[i]} g${g}`);
      }
    }
    const spots = ['tache 0', 'tache 1', 'tache 2'];
    for (let i = 0; i < 3; i++) this.place('whaleSpot', undefined, i, 760 + i * 170, GROUND, spots[i], 1, DEPTH.items);
    this.kai(560, GROUND);
    this.label(560, GROUND + 6, 'Kaï');
  }

  /** Loupe : &z=2&cx=…&cy=… (coordonnées de la vue). */
  private zoom(): void {
    const z = Number(params.get('z')) || 1;
    if (z === 1) return;
    const cam = this.cameras.main;
    cam.setZoom(z);
    cam.centerOn(Number(params.get('cx')) || viewW / 2, (Number(params.get('cy')) || VIEW_H / 2) + SCROLL_Y);
  }

  update(time: number, delta: number): void {
    this.parallax?.update(time, delta);
    const t = time / 1000;
    for (const c of this.chains) {
      for (let j = 0; j < c.parts.length; j++) {
        const ph = t * 1.25 + c.phase - j * 0.3;
        c.parts[j].setPosition(
          c.x + c.amp * (Math.sin(ph) * (1.5 + j * 1.6) + j * j * 0.15),
          c.y + j * c.spacing + c.amp * Math.sin(ph * 0.7) * 1.5,
        );
      }
    }
    const beat = Math.floor(t / 0.35) % 2;
    for (const h of this.hearts) h.setFrame(2 + beat);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'root',
  width: viewW,
  height: VIEW_H,
  backgroundColor: '#05010f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  scene: [BossScene],
});
