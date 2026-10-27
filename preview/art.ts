import Phaser from 'phaser';
import '@fontsource/exo-2/600.css';
import type { ThemeId } from '../src/core/types';
import { createParallax, generatePlatformArt, type ParallaxHandle } from '../src/game2d/art';
import { ANIM, FRAMES, TEX, TILESET, TILE_FRAME } from '../src/game2d/art/keys';
import { DEPTH, LEVEL_ROWS, TILE, VIEW_H } from '../src/game2d/constants';

// Page d'aperçu du module graphique 2D (outil de développement, hors jeu).
// Paramètres : ?theme=jungle|moon &view=world|sheet &w=1080..1600 &speed=90 &x=0 &vy=1 &regen=1 &ff=0 &z=1

const params = new URLSearchParams(location.search);
const theme: ThemeId = params.get('theme') === 'moon' ? 'moon' : 'jungle';
const view = params.get('view') === 'sheet' ? 'sheet' : 'world';
const viewW = Math.min(1600, Math.max(1080, Number(params.get('w')) || 1280));
const speed = params.has('speed') ? Number(params.get('speed')) : 90;
const startX = Number(params.get('x')) || 0;
const vertical = params.get('vy') === '1';
const regen = params.get('regen') === '1';

const LABEL = { fontFamily: '"Exo 2", sans-serif', fontSize: '11px', color: '#b8b0e0' };

class ArtScene extends Phaser.Scene {
  private parallax: ParallaxHandle | null = null;
  private mapW = 0;
  private movers: { s: Phaser.GameObjects.Image; x0: number }[] = [];
  private lasers: Phaser.GameObjects.Image[] = [];
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('art');
  }

  create(): void {
    (window as unknown as { __artScene: Phaser.Scene }).__artScene = this;
    if (regen) generatePlatformArt(this, theme === 'jungle' ? 'moon' : 'jungle');
    const t0 = performance.now();
    generatePlatformArt(this, theme);
    const t1 = performance.now();
    let t2 = t1;
    if (view === 'sheet') {
      this.buildSheet();
    } else {
      this.parallax = createParallax(this, theme);
      t2 = performance.now();
      // Avance rapide de l'arrière-plan : &ff=4 (secondes)
      const ff = Number(params.get('ff')) || 0;
      for (let k = 1; k <= ff * 60; k++) this.parallax.update(k * 16.67, 16.67);
      this.buildWorld();
    }
    const msg = `${theme} — textures ${(t1 - t0).toFixed(1)} ms` + (view === 'world' ? ` · parallaxe ${(t2 - t1).toFixed(1)} ms` : '');
    console.log('[art preview]', msg);
    this.info = this.add
      .text(viewW - 10, 8, msg, { ...LABEL, fontSize: '13px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 6, y: 3 } })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  // ------------------------------------------------------------ Planche de toutes les textures
  private label(x: number, y: number, text: string): void {
    this.add.text(x, y, text, LABEL).setOrigin(0.5, 0);
  }

  private frames(key: string, count: number, x: number, y: number, w: number, h: number, name: string): number {
    for (let i = 0; i < count; i++) {
      const cx = x + i * (w + 6);
      this.add.rectangle(cx + w / 2, y + h / 2, w, h).setStrokeStyle(1, 0x3a3060);
      this.add.image(cx, y, key, i).setOrigin(0, 0);
      this.label(cx + w / 2, y + h + 2, `${name} ${i}`);
    }
    return x + count * (w + 6) + 10;
  }

  private single(key: string, x: number, y: number, w: number, h: number, name: string): number {
    this.add.rectangle(x + w / 2, y + h / 2, w, h).setStrokeStyle(1, 0x3a3060);
    this.add.image(x, y, key).setOrigin(0, 0);
    this.label(x + w / 2, y + h + 2, name);
    return x + w + 14;
  }

  private animSprite(x: number, y: number, key: string, anim: string, name: string): void {
    const s = this.add.sprite(x, y, key).setOrigin(0.5, 1);
    s.play(anim);
    this.label(x, y + 2, name);
  }

  private buildSheet(): void {
    this.cameras.main.setBackgroundColor('#140e26');
    // Tileset complet + frames 0..15
    this.add.image(10, 26, TEX.tiles).setOrigin(0, 0);
    this.label(274, 160, `tileset ${TILESET.width}x${TILESET.height}`);
    for (let i = 0; i < 16; i++) {
      const x = 560 + (i % 8) * 88;
      const y = 26 + Math.floor(i / 8) * 76;
      this.add.image(x, y, TEX.tiles, i).setOrigin(0, 0);
      const name = Object.entries(TILE_FRAME).find(([, v]) => v === i)?.[0] ?? String(i);
      this.label(x + 32, y + 62, name.replace('GROUND_', 'G_'));
    }
    // Joueur
    let x = this.frames(TEX.player, 11, 10, 186, 64, 80, 'p');
    this.animSprite(x + 30, 266, TEX.player, ANIM.playerIdle, 'idle');
    this.animSprite(x + 100, 266, TEX.player, ANIM.playerRun, 'run');
    this.animSprite(x + 170, 266, TEX.player, ANIM.playerJump, 'jump');
    this.animSprite(x + 240, 266, TEX.player, ANIM.playerFall, 'fall');
    this.animSprite(x + 310, 266, TEX.player, ANIM.playerHurt, 'hurt');
    // Ennemis
    x = this.frames(TEX.walker, 5, 10, 300, 64, 56, 'walker');
    x = this.frames(TEX.flyer, 4, x, 300, 64, 56, 'flyer');
    x = this.frames(TEX.armored, 4, x, 300, 72, 56, 'armored');
    x = this.frames(TEX.spitter, 3, x, 290, 64, 80, 'spitter');
    // Objets
    x = this.frames(TEX.crystal, 6, 10, 400, 32, 40, 'cr');
    x = this.single(TEX.spore, x, 408, 24, 24, 'spore');
    x = this.single(TEX.laser, x, 415, 40, 10, 'laser');
    x = this.single(TEX.powerTriple, x, 396, 48, 48, 'triple');
    x = this.single(TEX.powerShield, x, 396, 48, 48, 'shield');
    x = this.single(TEX.powerDoubleJump, x, 396, 48, 48, 'dbljump');
    x = this.single(TEX.spark, x, 412, 16, 16, 'spark');
    x = this.single(TEX.puff, x, 404, 32, 32, 'puff');
    x = this.single(TEX.shieldBubble, x, 380, 96, 96, 'bubble');
    x = this.frames(TEX.shipFlame, 2, x, 404, 48, 32, 'flame');
    this.single(TEX.mover, x, 404, 192, 32, 'mover');
    x = this.frames(TEX.checkpoint, 3, 10, 500, 48, 128, 'cp');
    x = this.single(TEX.ship, x, 516, 192, 112, 'ship');
    // Animations en boucle
    const ay = 640;
    this.animSprite(x + 40, ay, TEX.walker, ANIM.walkerWalk, 'walker-walk');
    this.animSprite(x + 120, ay - 20, TEX.flyer, ANIM.flyerFly, 'flyer-fly');
    this.animSprite(x + 200, ay, TEX.armored, ANIM.armoredWalk, 'armored-walk');
    this.animSprite(x + 280, ay, TEX.spitter, ANIM.spitterIdle, 'spitter-idle');
    this.animSprite(x + 350, ay, TEX.spitter, ANIM.spitterShoot, 'spitter-shoot');
    this.animSprite(x + 420, ay, TEX.crystal, ANIM.crystalSpin, 'crystal');
    this.animSprite(x + 480, ay, TEX.checkpoint, ANIM.checkpointOn, 'checkpoint');
    const ship = this.add.image(x + 640, ay, TEX.ship).setOrigin(0.5, 1);
    const flame = this.add.sprite(ship.x - 96 + 11, ay - 112 + 58, TEX.shipFlame).setOrigin(1, 0.5);
    flame.play(ANIM.shipFlame);
    this.label(x + 640, ay + 2, 'ship + flame');
    // Loupe : &z=3&cx=200&cy=230
    const z = Number(params.get('z')) || 1;
    if (z !== 1) {
      const cam = this.cameras.main;
      cam.setZoom(z);
      cam.centerOn(Number(params.get('cx')) || viewW / 2, Number(params.get('cy')) || VIEW_H / 2);
      this.info?.setVisible(false);
    }
  }

  // ------------------------------------------------------------ Terrain d'exemple + parallaxe
  private buildWorld(): void {
    const cols = 128;
    const rows = LEVEL_ROWS;
    const grid: string[][] = [];
    for (let r = 0; r < rows; r++) grid.push(new Array<string>(cols).fill('.'));
    const ground = (c0: number, c1: number, top: number) => {
      for (let c = c0; c <= c1; c++) for (let r = top; r < rows; r++) grid[r][c] = '#';
    };
    const put = (c: number, r: number, ch: string) => {
      grid[r][c] = ch;
    };
    // Motif de 64 colonnes répété deux fois
    for (const o of [0, 64]) {
      ground(o + 0, o + 15, 11);
      // trou
      ground(o + 18, o + 27, 10);
      ground(o + 28, o + 30, 12);
      ground(o + 31, o + 31, 8); // pilier
      ground(o + 32, o + 37, 12);
      for (let c = o + 33; c <= o + 36; c++) put(c, 11, '^');
      ground(o + 38, o + 47, 11);
      ground(o + 50, o + 63, 12);
      // plateformes, blocs, bonus
      for (let c = o + 5; c <= o + 8; c++) put(c, 7, '=');
      put(o + 11, 7, 'B');
      put(o + 12, 7, '?');
      put(o + 13, 7, 'U');
      put(o + 14, 7, '?');
      put(o + 15, 7, 'B');
      for (let c = o + 22; c <= o + 25; c++) put(c, 6, '=');
      for (let c = o + 40; c <= o + 42; c++) put(c, 8, 'B');
      put(o + 41, 7, '?');
      // décor
      put(o + 2, 10, 'a');
      put(o + 9, 10, 'b');
      put(o + 14, 10, 'c');
      put(o + 20, 9, 'a');
      put(o + 26, 9, 'c');
      put(o + 39, 10, 'b');
      put(o + 45, 10, 'a');
      put(o + 52, 11, 'c');
      put(o + 58, 11, 'b');
    }
    const data: number[][] = [];
    const isG = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === '#';
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const ch = grid[r][c];
        let t = -1;
        if (ch === '#') {
          const top = !isG(r - 1, c);
          const l = c > 0 && !isG(r, c - 1);
          const rt = c < cols - 1 && !isG(r, c + 1);
          if (top && l && rt) t = TILE_FRAME.GROUND_SINGLE;
          else if (top && l) t = TILE_FRAME.GROUND_TOP_LEFT;
          else if (top && rt) t = TILE_FRAME.GROUND_TOP_RIGHT;
          else if (top) t = TILE_FRAME.GROUND_TOP;
          else if (l && rt) t = TILE_FRAME.GROUND_FILL;
          else if (l) t = TILE_FRAME.GROUND_LEFT;
          else if (rt) t = TILE_FRAME.GROUND_RIGHT;
          else t = (c * 7 + r * 3) % 11 === 0 ? TILE_FRAME.GROUND_FILL_ALT : TILE_FRAME.GROUND_FILL;
        } else if (ch === 'B') t = TILE_FRAME.BLOCK;
        else if (ch === '?') t = TILE_FRAME.BONUS;
        else if (ch === 'U') t = TILE_FRAME.BONUS_USED;
        else if (ch === '=') t = TILE_FRAME.PLATFORM;
        else if (ch === '^') t = TILE_FRAME.HAZARD;
        else if (ch === 'a') t = TILE_FRAME.DECOR_A;
        else if (ch === 'b') t = TILE_FRAME.DECOR_B;
        else if (ch === 'c') t = TILE_FRAME.DECOR_C;
        row.push(t);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage(TEX.tiles, TEX.tiles, TILE, TILE, TILESET.margin, TILESET.spacing);
    if (ts) map.createLayer(0, ts, 0, 0)?.setDepth(DEPTH.tiles);
    this.mapW = cols * TILE;
    const mapH = rows * TILE;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.mapW, mapH);
    cam.scrollY = mapH - VIEW_H;
    cam.scrollX = startX;
    const z = Number(params.get('z')) || 1;
    if (z !== 1) {
      cam.setZoom(z);
      if (params.has('cy')) cam.scrollY = Number(params.get('cy')) - VIEW_H / 2;
    }

    // Acteurs (y = bas de la case)
    const at = (c: number, r: number) => ({ x: c * TILE + TILE / 2, y: (r + 1) * TILE });
    for (const o of [0, 64]) {
      let p = at(o + 1, 10);
      this.add.sprite(p.x, p.y, TEX.player).setOrigin(0.5, 1).setDepth(DEPTH.player).play(ANIM.playerIdle);
      p = at(o + 3, 10);
      this.add.sprite(p.x, p.y, TEX.player).setOrigin(0.5, 1).setDepth(DEPTH.player).play(ANIM.playerRun);
      p = at(o + 4, 8);
      this.add.sprite(p.x, p.y, TEX.player).setOrigin(0.5, 1).setDepth(DEPTH.player).play(ANIM.playerJump);
      this.add.image(p.x, p.y - 40, TEX.shieldBubble).setDepth(DEPTH.player + 1).setAlpha(0.9);
      p = at(o + 10, 10);
      this.add.sprite(p.x, p.y, TEX.walker).setOrigin(0.5, 1).setDepth(DEPTH.enemies).play(ANIM.walkerWalk);
      p = at(o + 16, 6);
      for (let k = 0; k < 5; k++) {
        const cx = at(o + 16 + k * 0.6, 6);
        this.add.sprite(cx.x, cx.y - Math.sin((k / 4) * Math.PI) * 60, TEX.crystal).setDepth(DEPTH.items).play(ANIM.crystalSpin);
      }
      p = at(o + 23, 4);
      this.add.sprite(p.x, p.y - 20, TEX.flyer).setDepth(DEPTH.enemies).play(ANIM.flyerFly);
      p = at(o + 27, 9);
      this.add.sprite(p.x, p.y, TEX.checkpoint).setOrigin(0.5, 1).setDepth(DEPTH.items).play(ANIM.checkpointOn);
      p = at(o + 19, 9);
      this.add.image(p.x, p.y, TEX.checkpoint, 0).setOrigin(0.5, 1).setDepth(DEPTH.items);
      p = at(o + 39, 10);
      this.add.sprite(p.x, p.y, TEX.armored).setOrigin(0.5, 1).setDepth(DEPTH.enemies).play(ANIM.armoredWalk);
      p = at(o + 46, 10);
      this.add.sprite(p.x, p.y, TEX.spitter).setOrigin(0.5, 1).setDepth(DEPTH.enemies).play(ANIM.spitterIdle);
      this.add.image(p.x - 50, p.y - 44, TEX.spore).setDepth(DEPTH.projectiles);
      p = at(o + 43, 10);
      this.add.sprite(p.x, p.y, TEX.player).setOrigin(0.5, 1).setDepth(DEPTH.player).play(ANIM.playerHurt);
      p = at(o + 12, 5);
      this.add.image(p.x, p.y, TEX.powerTriple).setDepth(DEPTH.items);
      this.add.image(p.x + 64, p.y, TEX.powerShield).setDepth(DEPTH.items);
      this.add.image(p.x + 128, p.y, TEX.powerDoubleJump).setDepth(DEPTH.items);
      // Plateforme mobile
      const mv = this.add.image(o * TILE + 48 * TILE, 8 * TILE, TEX.mover).setOrigin(0, 0).setDepth(DEPTH.tiles);
      this.movers.push({ s: mv, x0: mv.x });
      // Vaisseau de sortie (3x2 tuiles à droite et au-dessus de la case)
      p = at(o + 56, 11);
      const sx = p.x - TILE / 2 + 96;
      this.add.image(sx, p.y, TEX.ship).setOrigin(0.5, 1).setDepth(DEPTH.items);
      this.add
        .sprite(sx - 96 + 11, p.y - 112 + 58, TEX.shipFlame)
        .setOrigin(1, 0.5)
        .setDepth(DEPTH.items - 1)
        .play(ANIM.shipFlame);
      // Tirs laser
      for (let k = 0; k < 3; k++) {
        const l = this.add.image(at(o + 3, 10).x + 40 + k * 120, at(o + 3, 10).y - 36, TEX.laser).setDepth(DEPTH.projectiles);
        l.setData('x0', at(o + 3, 10).x + 40);
        this.lasers.push(l);
      }
      // Particules
      p = at(o + 5, 10);
      for (let k = 0; k < 6; k++) {
        this.add
          .image(p.x + k * 14, p.y - 8 - (k % 2) * 10, TEX.puff)
          .setDepth(DEPTH.particles)
          .setAlpha(0.7)
          .setScale(0.6 + k * 0.1);
      }
      for (let k = 0; k < 8; k++) {
        this.add
          .image(p.x + 300 + k * 10, p.y - 200 + (k % 3) * 12, TEX.spark)
          .setDepth(DEPTH.particles)
          .setTint(k % 2 ? 0x3ff0ff : 0xff4fd8)
          .setBlendMode(Phaser.BlendModes.ADD);
      }
    }
  }

  update(time: number, delta: number): void {
    if (view !== 'world') return;
    const cam = this.cameras.main;
    const t = time / 1000;
    const span = this.mapW - viewW;
    cam.scrollX = (startX + t * speed) % span;
    if (vertical) cam.scrollY = this.cameras.main.getBounds().height - VIEW_H - (0.5 - 0.5 * Math.cos(t * 0.6)) * 176;
    for (const m of this.movers) m.s.x = m.x0 + (0.5 - 0.5 * Math.cos(t * 1.2)) * 3 * TILE;
    for (const l of this.lasers) {
      const x0 = l.getData('x0') as number;
      l.x = x0 + ((l.x - x0 + delta * 0.6) % 360);
    }
    this.parallax?.update(time + (Number(params.get('ff')) || 0) * 1000, delta);
    void FRAMES;
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
  scene: [ArtScene],
});
