import Phaser from 'phaser';
import '@fontsource/exo-2/600.css';
import { createParallax, generatePlatformArt, PLAYER_SHOULDER, type ParallaxHandle } from '../src/game2d/art';
import {
  GLYPH_VARIANTS,
  TRUNK,
  WORLD1_ANIMS,
  WORLD1_FRAMES,
  WORLD1_SHEETS,
} from '../src/game2d/art/draw/world1';
import { ARM_RIG, ARM_TEX, FRAMES, FRAME_SIZE, TEX, TILESET, TILE_FRAME } from '../src/game2d/art/keys';
import { buildSheet } from '../src/game2d/art/util';
import { DEPTH, LEVEL_ROWS, TILE, VIEW_H } from '../src/game2d/constants';

// Page d'aperçu des dessins du monde 1 (outil de développement, hors jeu) : champignon, barrière d'arène,
// tronc abattu, Tess et sa capsule, glyphes astréens, branches / lianes / passerelles, sur le fond de la
// Jungle et à l'échelle du jeu, animations dépliées, plus une petite scène d'essai.
// Paramètres : ?view=objects|trunk|walkways|scene &x=0 (défilement de la scène) &z=1 &cx &cy (loupe).

const params = new URLSearchParams(location.search);
const VIEWS = ['objects', 'trunk', 'walkways', 'scene'] as const;
type View = (typeof VIEWS)[number];
const viewParam = params.get('view') ?? '';
const view: View = (VIEWS as readonly string[]).includes(viewParam) ? (viewParam as View) : 'objects';
const theme = 'jungle';
const viewW = 1280;
const viewH = VIEW_H;

const TAG = {
  fontFamily: '"Exo 2", sans-serif',
  fontSize: '11px',
  color: '#ffffff',
  backgroundColor: 'rgba(5,1,15,0.62)',
  padding: { x: 4, y: 2 },
};
const TITLE = { ...TAG, fontSize: '14px', color: '#c8fdff' };

const S = WORLD1_SHEETS;
const F = WORLD1_FRAMES;

/** Aléatoire reproductible dans [0, 1) (variantes des plateformes). */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

class PropsScene extends Phaser.Scene {
  private parallax: ParallaxHandle | null = null;
  /** Démonstration du rebond : Kaï au-dessus d'un champignon. */
  private bouncers: { mush: Phaser.GameObjects.Sprite; kai: Phaser.GameObjects.Sprite; arm: Phaser.GameObjects.Image; x: number; top: number; phase: number; last: number }[] = [];

  constructor() {
    super('props');
  }

  create(): void {
    (window as unknown as { __propsScene: Phaser.Scene }).__propsScene = this;
    const t0 = performance.now();
    generatePlatformArt(this, theme);
    const t1 = performance.now();
    for (const s of Object.values(S)) {
      buildSheet(this, s.key, s.w, s.h, s.frames, (ctx, i) => s.draw(ctx, theme, i));
    }
    for (const a of WORLD1_ANIMS) {
      if (this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({ key: a.key, frames: a.frames.map((f) => ({ key: S[a.sheet].key, frame: f })), frameRate: a.frameRate, repeat: a.repeat });
    }
    const t2 = performance.now();
    this.parallax = createParallax(this, theme);
    const cam = this.cameras.main;
    if (view === 'scene') this.buildScene();
    else {
      cam.setBounds(0, 0, viewW, viewH);
      if (view === 'objects') this.buildObjects();
      else if (view === 'trunk') this.buildTrunk();
      else this.buildWalkways();
    }
    const z = Number(params.get('z')) || 1;
    if (z !== 1) {
      cam.setZoom(z);
      cam.centerOn(Number(params.get('cx')) || viewW / 2, Number(params.get('cy')) || viewH / 2);
    }
    const msg = `monde 1 — planches ${(t2 - t1).toFixed(1)} ms (art du thème ${(t1 - t0).toFixed(1)} ms)`;
    console.log('[props preview]', msg);
    this.add
      .text(viewW - 10, 8, msg, { ...TAG, fontSize: '13px' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  // ------------------------------------------------------------ Outils
  private label(x: number, y: number, text: string, origin = 0.5): void {
    this.add.text(x, y, text, TAG).setOrigin(origin, 0).setDepth(1000);
  }

  private title(x: number, y: number, text: string): void {
    this.add.text(x, y, text, TITLE).setOrigin(0, 0).setDepth(1000);
  }

  private box(x: number, y: number, w: number, h: number): void {
    this.add.rectangle(x + w / 2, y + h / 2, w, h).setStrokeStyle(1, 0x8a7ad0, 0.55).setDepth(DEPTH.decor - 2);
  }

  /** Rangée de tuiles du sol (surface), coin haut-gauche en (x, y). */
  private groundStrip(x: number, y: number, n: number, rows = 1): void {
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const t = r === 0 ? (i === 0 ? TILE_FRAME.GROUND_TOP_LEFT : i === n - 1 ? TILE_FRAME.GROUND_TOP_RIGHT : TILE_FRAME.GROUND_TOP) : i === 0 ? TILE_FRAME.GROUND_LEFT : i === n - 1 ? TILE_FRAME.GROUND_RIGHT : TILE_FRAME.GROUND_FILL;
        this.add.image(x + i * TILE, y + r * TILE, TEX.tiles, t).setOrigin(0, 0).setDepth(DEPTH.tiles);
      }
    }
  }

  /** Kaï (pieds en feetY) avec son bras au repos, comme Player.placeArm (visée devant). */
  private kai(x: number, feetY: number, frame: number, left = false): { body: Phaser.GameObjects.Sprite; arm: Phaser.GameObjects.Image } {
    const body = this.add.sprite(x, feetY, TEX.player, frame).setOrigin(0.5, 1).setDepth(DEPTH.player).setFlipX(left);
    const arm = this.add
      .image(x, feetY, ARM_TEX.laser, FRAMES.arm.rest)
      .setOrigin(ARM_RIG.pivotX / FRAME_SIZE.arm.w, ARM_RIG.pivotY / FRAME_SIZE.arm.h)
      .setDepth(DEPTH.player + 0.5);
    this.placeArm(body, arm, frame);
    return { body, arm };
  }

  private placeArm(body: Phaser.GameObjects.Sprite, arm: Phaser.GameObjects.Image, frame: number): void {
    const f = body.flipX ? -1 : 1;
    arm.setPosition(body.x + f * PLAYER_SHOULDER[frame * 2], body.y + PLAYER_SHOULDER[frame * 2 + 1]);
    arm.setScale(f, 1);
  }

  /** Champignon animé (repos) au bas de la case dont le coin haut-gauche est (x, y). */
  private mushroom(x: number, y: number): Phaser.GameObjects.Sprite {
    return this.add.sprite(x + TILE / 2, y + TILE, S.mushroom.key).setOrigin(0.5, 1).setDepth(DEPTH.tiles).play('w1-mushroom-idle');
  }

  /** Kaï qui rebondit sur un champignon (sommet du chapeau en top) : rebond joué à chaque atterrissage. */
  private bouncer(x: number, top: number, phase: number): void {
    const mush = this.mushroom(x - TILE / 2, top - 3);
    const k = this.kai(x, top, FRAMES.player.jump);
    k.body.setDepth(DEPTH.player);
    this.bouncers.push({ mush, kai: k.body, arm: k.arm, x, top: top + 3, phase, last: 0 });
  }

  /** Colonne de barrière (haut, n milieux, bas), coin haut-gauche (x, y) ; anim jouée sur chaque tuile. */
  private barrierColumn(x: number, y: number, mids: number, frame = -1): Phaser.GameObjects.Sprite[] {
    const parts: Phaser.GameObjects.Sprite[] = [];
    const keys = [S.barrierTop.key, ...new Array<string>(mids).fill(S.barrierMid.key), S.barrierBottom.key];
    keys.forEach((key, i) => {
      const s = this.add.sprite(x, y + i * TILE, key, Math.max(0, frame)).setOrigin(0, 0).setDepth(DEPTH.tiles + 1);
      parts.push(s);
    });
    return parts;
  }

  private playBarrier(parts: Phaser.GameObjects.Sprite[], what: 'crackle' | 'close' | 'open'): void {
    const names = ['top', ...new Array<string>(parts.length - 2).fill('mid'), 'bottom'];
    parts.forEach((s, i) => s.play(`w1-barrier-${names[i]}-${what}`));
  }

  /** Cycle de démonstration : fermée (crépite) 2,2 s → ouverture → ouverte 1 s → fermeture → … */
  private cycleBarrier(parts: Phaser.GameObjects.Sprite[]): void {
    const loop = () => {
      this.playBarrier(parts, 'crackle');
      this.time.delayedCall(2200, () => {
        this.playBarrier(parts, 'open');
        this.time.delayedCall(1250, () => {
          this.playBarrier(parts, 'close');
          this.time.delayedCall(260, loop);
        });
      });
    };
    loop();
  }

  /** Cycle du tronc : tremble 1,6 s → chute → couché 1,6 s → de nouveau debout. */
  private cycleTrunk(s: Phaser.GameObjects.Sprite): void {
    const loop = () => {
      s.play('w1-trunk-tremble');
      this.time.delayedCall(1600, () => {
        s.play('w1-trunk-fall');
        this.time.delayedCall(1950, loop);
      });
    };
    loop();
  }

  /** Cycle de Tess : repos 1,2 s → téléportation → cachée 0,6 s → … */
  private cycleBeam(s: Phaser.GameObjects.Sprite): void {
    const loop = () => {
      s.setVisible(true).play('w1-tess-idle');
      this.time.delayedCall(1200, () => {
        s.play('w1-tess-beam');
        s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          s.setVisible(false);
          this.time.delayedCall(600, loop);
        });
      });
    };
    loop();
  }

  // ------------------------------------------------------------ Vue « objects »
  private buildObjects(): void {
    this.title(16, 8, 'Monde 1 — champignon, barrière, glyphes, Tess et capsule (échelle du jeu)');
    // Champignon : 6 frames
    const mushNames = ['repos 0', 'repos 1', 'repos 2', 'écrasé 3', 'détente 4', 'retour 5'];
    for (let i = 0; i < S.mushroom.frames; i++) {
      const x = 16 + i * 74;
      this.box(x, 36, 64, 64);
      this.add.image(x, 36, S.mushroom.key, i).setOrigin(0, 0).setDepth(DEPTH.tiles);
      this.label(x + 32, 104, mushNames[i]);
    }
    // Barrière : 7 frames, colonne haut / milieu / milieu / bas
    const barNames = ['0', '1', '2', '3', '4 éteinte', '5', '6'];
    for (let f = 0; f < S.barrierMid.frames; f++) {
      const x = 16 + f * 74;
      this.box(x, 132, 64, 256);
      this.barrierColumn(x, 132, 2, f);
      this.add.image(x, 132 + 256, TEX.tiles, TILE_FRAME.GROUND_SINGLE).setOrigin(0, 0).setDepth(DEPTH.tiles);
      this.label(x + 32, 456, barNames[f]);
    }
    this.label(16, 118, 'barrière : 0-3 crépite · 4 éteinte · 5-6 allumage', 0);
    // Glyphes sur le mur de la ruine : éteints puis allumés
    const gx = 16;
    const gy = 488;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < GLYPH_VARIANTS + 1; c++) {
        this.add.image(gx + c * 64, gy + r * 64, TEX.roomWall).setOrigin(0, 0).setDepth(DEPTH.decor - 1);
      }
      for (let v = 0; v < GLYPH_VARIANTS; v++) {
        this.add.image(gx + v * 64 + 32, gy + r * 64, S.glyphs.key, v + r * F.glyphs.on).setOrigin(0.5, 0).setDepth(DEPTH.decor);
      }
    }
    for (let b = 0; b < 2; b++) this.add.image(gx + GLYPH_VARIANTS * 64, gy + b * 64, TEX.tiles, TILE_FRAME.BLOCK).setOrigin(0, 0).setDepth(DEPTH.tiles);
    const gNames = ['réseau', 'portails', 'gardien', 'noyau', 'Astréen', 'Faille'];
    gNames.forEach((n, v) => this.label(gx + v * 64 + 32, gy + 130, n));
    this.label(gx + 6 * 64 + 34, gy + 22, 'éteints', 0);
    this.label(gx + 6 * 64 + 34, gy + 86, 'allumés', 0);

    // Capsule (2 frames)
    for (let i = 0; i < 2; i++) {
      const x = 560 + i * 140;
      this.box(x, 30, 128, 128);
      this.add.image(x, 30, S.capsule.key, i).setOrigin(0, 0).setDepth(DEPTH.decor);
      this.label(x + 64, 162, `capsule ${i}`);
    }
    // Tess : 8 frames
    const tNames = ['repos 0', 'repos 1', 'salut 2', 'salut 3', 'téléport 4', '5', '6', '7'];
    for (let i = 0; i < S.tess.frames; i++) {
      const x = 560 + i * 68;
      this.box(x, 196, 64, 80);
      this.add.image(x, 196, S.tess.key, i).setOrigin(0, 0).setDepth(DEPTH.items);
      this.label(x + 32, 280, tNames[i]);
    }
    // Mise en situation : Kaï, Tess qui salue (tournée vers lui), sa capsule, Tess téléportée en boucle
    const gy2 = 424;
    this.groundStrip(560, gy2, 8, 2);
    this.kai(610, gy2, FRAMES.player.idle[0]);
    this.add.sprite(700, gy2, S.tess.key).setOrigin(0.5, 1).setDepth(DEPTH.items).setFlipX(true).play('w1-tess-wave');
    this.add.sprite(800, gy2, S.capsule.key).setOrigin(0.5, 1).setDepth(DEPTH.decor).play('w1-capsule-blink');
    this.add.sprite(900, gy2, S.tess.key).setOrigin(0.5, 1).setDepth(DEPTH.items).play('w1-tess-idle');
    const beam = this.add.sprite(1000, gy2, S.tess.key).setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.cycleBeam(beam);
    this.label(610, gy2 + 70, 'Kaï');
    this.label(700, gy2 + 70, 'Tess (salut)');
    this.label(900, gy2 + 70, 'repos');
    this.label(1000, gy2 + 70, 'téléportée (boucle)');

    // Colonne de barrière animée (fermée ↔ ouverte) et rebond sur un champignon
    const bx = 1104;
    const parts = this.barrierColumn(bx, 96, 3);
    this.cycleBarrier(parts);
    this.add.image(bx, 96 + 5 * TILE, TEX.tiles, TILE_FRAME.GROUND_SINGLE).setOrigin(0, 0).setDepth(DEPTH.tiles);
    this.label(bx + 32, 76, 'cycle');
    this.groundStrip(1184, 656, 2);
    this.bouncer(1216, 656 - 64 + 3, 0);
    this.label(1216, 704, 'rebond');
  }

  // ------------------------------------------------------------ Vue « trunk »
  private buildTrunk(): void {
    this.title(16, 8, 'Tronc abattu (4 x 4 tuiles) : 0 debout, 1-2 tremble, 3-5 chute, 6 couché ; à droite : en boucle');
    const names = ['0 debout', '1 tremble', '2 tremble', '3 chute', '4 chute', '5 impact', '6 couché'];
    const pos = (i: number) => (i < 4 ? { x: 16 + i * 316, y: 30 } : { x: 16 + (i - 4) * 316, y: 372 });
    for (let i = 0; i < S.trunk.frames; i++) {
      const { x, y } = pos(i);
      this.box(x, y, TRUNK.w, TRUNK.h);
      this.groundStrip(x - 16, y + TRUNK.h, 5);
      this.add.image(x, y + TRUNK.h, S.trunk.key, i).setOrigin(S.trunk.originX, S.trunk.originY).setDepth(i === 6 ? DEPTH.tiles + 1 : DEPTH.decor);
      this.label(x + TRUNK.w / 2, y + TRUNK.h + 50, names[i]);
    }
    // Kaï à côté du tronc couché, pour l'échelle
    const p6 = pos(6);
    this.kai(p6.x + TRUNK.w + 26, p6.y + TRUNK.h, FRAMES.player.idle[0], true);
    // En boucle
    const x = 16 + 3 * 316;
    const y = 372;
    this.box(x, y, TRUNK.w, TRUNK.h);
    this.groundStrip(x - 16, y + TRUNK.h, 5);
    const s = this.add.sprite(x, y + TRUNK.h, S.trunk.key, 0).setOrigin(0, 1).setDepth(DEPTH.decor);
    this.cycleTrunk(s);
    this.label(x + TRUNK.w / 2, y + TRUNK.h + 50, 'en boucle');
  }

  // ------------------------------------------------------------ Vue « walkways »
  private buildWalkways(): void {
    this.title(16, 8, "Plateformes '=' du monde 1 : branche, liane, passerelle (3 variantes chacune) ; rangées tirées au hasard");
    const fam = ['branche', 'liane', 'passerelle'];
    for (let i = 0; i < 9; i++) {
      const x = 16 + i * 76 + Math.floor(i / 3) * 28;
      this.box(x, 36, 64, 64);
      this.add.image(x, 36, S.walkways.key, i).setOrigin(0, 0).setDepth(DEPTH.tiles);
      this.label(x + 32, 104, `${fam[Math.floor(i / 3)]} ${i % 3}`);
    }
    const ox = 16 + 9 * 76 + 3 * 28 + 10;
    this.box(ox, 36, 64, 64);
    this.add.image(ox, 36, TEX.tiles, TILE_FRAME.PLATFORM).setOrigin(0, 0).setDepth(DEPTH.tiles);
    this.label(ox + 32, 104, 'actuelle (=)');
    // Rangées : une par famille (variantes au hasard), une qui mélange les familles, l'actuelle
    const rows: { name: string; frame: (c: number) => number }[] = [
      { name: 'branches', frame: (c) => Math.floor(hash01(c) * 3) },
      { name: 'lianes', frame: (c) => 3 + Math.floor(hash01(c + 40) * 3) },
      { name: 'passerelles', frame: (c) => 6 + Math.floor(hash01(c + 80) * 3) },
      { name: 'familles mêlées', frame: (c) => Math.floor(hash01(c + 120) * 9) },
    ];
    const n = 17;
    const x0 = 120;
    rows.forEach((row, r) => {
      const y = 196 + r * 108;
      this.label(16, y + 4, row.name, 0);
      for (let c = 0; c < n; c++) {
        this.add.image(x0 + c * TILE, y, S.walkways.key, row.frame(c)).setOrigin(0, 0).setDepth(DEPTH.tiles);
      }
      this.kai(x0 + (3 + r * 4) * TILE + 32, y, FRAMES.player.idle[r % 2], r % 2 === 1);
    });
    const yOld = 196 + 4 * 108;
    this.label(16, yOld + 4, "actuelle '='", 0);
    for (let c = 0; c < 8; c++) this.add.image(x0 + c * TILE, yOld, TEX.tiles, TILE_FRAME.PLATFORM).setOrigin(0, 0).setDepth(DEPTH.tiles);
    for (let c = 0; c < 8; c++) this.add.image(x0 + (9 + c) * TILE, yOld, S.walkways.key, F.walkways.vine[c % 3]).setOrigin(0, 0).setDepth(DEPTH.tiles);
    this.label(x0 + 9 * TILE, yOld - 18, 'lianes 0-1-2 dans l\'ordre', 0);
  }

  // ------------------------------------------------------------ Vue « scene » : petite scène d'essai
  private buildScene(): void {
    const cols = 40;
    const rows = LEVEL_ROWS;
    const grid: string[][] = [];
    for (let r = 0; r < rows; r++) grid.push(new Array<string>(cols).fill('.'));
    const ground = (c0: number, c1: number, top: number) => {
      for (let c = c0; c <= c1; c++) for (let r = top; r < rows; r++) grid[r][c] = '#';
    };
    const put = (c: number, r: number, ch: string) => {
      grid[r][c] = ch;
    };
    ground(0, cols - 1, 11);
    ground(11, 12, 10);
    // Champignons 'o' (cases pleines dessinées par des sprites ici)
    for (const [c, r] of [[4, 10], [7, 10], [8, 10], [12, 9]] as const) put(c, r, 'o');
    // Plateformes '=' : branche, liane, passerelle
    for (let c = 1; c <= 4; c++) put(c, 7, 'b');
    for (let c = 6; c <= 9; c++) put(c, 6, 'v');
    for (let c = 11; c <= 15; c++) put(c, 6, 'w');
    for (let c = 21; c <= 26; c++) put(c, 4, 'w');
    // Ruine : blocs autour du mur du fond
    for (let c = 30; c <= 39; c++) put(c, 3, 'B');
    for (let r = 4; r <= 8; r++) put(30, r, 'B');
    for (let r = 4; r <= 10; r++) put(39, r, 'B');

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
          else if (l) t = TILE_FRAME.GROUND_LEFT;
          else if (rt) t = TILE_FRAME.GROUND_RIGHT;
          else t = (c * 7 + r * 3) % 11 === 0 ? TILE_FRAME.GROUND_FILL_ALT : TILE_FRAME.GROUND_FILL;
        } else if (ch === 'B') t = TILE_FRAME.BLOCK;
        row.push(t);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage(TEX.tiles, TEX.tiles, TILE, TILE, TILESET.margin, TILESET.spacing);
    if (ts) map.createLayer(0, ts, 0, 0)?.setDepth(DEPTH.tiles);
    const mapW = cols * TILE;
    const mapH = rows * TILE;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH);
    cam.scrollY = mapH - VIEW_H;
    cam.scrollX = Number(params.get('x')) || 0;
    const at = (c: number, r: number) => ({ x: c * TILE, y: r * TILE });

    // Sprites des cases propres au monde 1
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = grid[r][c];
        const { x, y } = at(c, r);
        if (ch === 'o' && !(c === 4 && r === 10)) this.mushroom(x, y);
        else if (ch === 'b' || ch === 'v' || ch === 'w') {
          const base = ch === 'b' ? 0 : ch === 'v' ? 3 : 6;
          this.add.image(x, y, S.walkways.key, base + Math.floor(hash01(c * 3 + r) * 3)).setOrigin(0, 0).setDepth(DEPTH.tiles);
        }
      }
    }
    // Kaï : sur la branche, et qui rebondit sur le champignon de la colonne 4
    this.kai(at(2, 7).x + 32, at(2, 7).y, FRAMES.player.idle[0]);
    this.bouncer(at(4, 10).x + 32, at(4, 10).y + 3, 0.3);
    // Tess près de sa capsule (tournée vers la gauche, d'où vient Kaï)
    this.add.sprite(at(16, 11).x, at(16, 11).y, S.capsule.key).setOrigin(0.5, 1).setDepth(DEPTH.decor).play('w1-capsule-blink');
    this.add.sprite(at(14, 11).x + 20, at(14, 11).y, S.tess.key).setOrigin(0.5, 1).setDepth(DEPTH.items).setFlipX(true).play('w1-tess-wave');
    // Barrière d'arène : colonne 18, lignes 5 à 10
    this.cycleBarrier(this.barrierColumn(at(18, 5).x, at(18, 5).y, 4));
    // Tronc debout qui tremble (colonnes 21-24) et tronc couché (26-29)
    this.add.sprite(at(20, 11).x, at(20, 11).y, S.trunk.key, F.trunk.stand).setOrigin(0, 1).setDepth(DEPTH.decor).play('w1-trunk-tremble');
    this.add.image(at(25, 11).x, at(25, 11).y, S.trunk.key, F.trunk.lying).setOrigin(0, 1).setDepth(DEPTH.tiles + 1);
    // Ruine : mur du fond, glyphes éteints et allumés, Kaï devant
    for (let r = 4; r <= 10; r++) for (let c = 31; c <= 38; c++) this.add.image(at(c, r).x, at(c, r).y, TEX.roomWall).setOrigin(0, 0).setDepth(DEPTH.decor - 1);
    let v = 0;
    for (const r of [5, 7]) {
      for (const c of [32, 34, 36]) {
        const lit = (v + (r === 7 ? 1 : 0)) % 2 === 0;
        this.add.image(at(c, r).x, at(c, r).y, S.glyphs.key, (v % GLYPH_VARIANTS) + (lit ? F.glyphs.on : F.glyphs.off)).setOrigin(0, 0).setDepth(DEPTH.decor);
        v++;
      }
    }
    // Glyphe qui s'allume en fondu
    const g0 = this.add.image(at(37, 9).x, at(37, 9).y, S.glyphs.key, 1).setOrigin(0, 0).setDepth(DEPTH.decor);
    const g1 = this.add.image(g0.x, g0.y, S.glyphs.key, 1 + F.glyphs.on).setOrigin(0, 0).setDepth(DEPTH.decor + 0.1).setAlpha(0);
    this.tweens.add({ targets: g1, alpha: 1, duration: 900, yoyo: true, hold: 900, repeat: -1, repeatDelay: 500 });
    this.kai(at(34, 11).x + 32, at(34, 11).y, FRAMES.player.idle[0], true);
    this.kai(at(27, 9).x + 32, at(27, 9).y, FRAMES.player.idle[1]);
  }

  update(time: number, delta: number): void {
    // Rebond : parabole de 1,1 s, rebond joué à l'atterrissage
    const P = 1100;
    for (const b of this.bouncers) {
      const t = ((time / P + b.phase) % 1 + 1) % 1;
      const h = 4 * 150 * t * (1 - t);
      b.kai.y = b.top - 3 - h;
      const frame = t < 0.5 ? FRAMES.player.jump : FRAMES.player.fall;
      b.kai.setFrame(frame);
      this.placeArm(b.kai, b.arm, frame);
      if (t < b.last) b.mush.play('w1-mushroom-bounce').chain('w1-mushroom-idle');
      b.last = t;
    }
    this.parallax?.update(time, delta);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'root',
  width: viewW,
  height: viewH,
  backgroundColor: '#05010f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  scene: [PropsScene],
});
