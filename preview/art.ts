import Phaser from 'phaser';
import '@fontsource/exo-2/600.css';
import { THEME_IDS } from '../src/core/ids';
import type { ThemeId, WeaponId } from '../src/core/types';
import { PELLET_SPEED_JITTER, WEAPON_IDS, WEAPONS } from '../src/core/weapons';
import { createParallax, generatePlatformArt, PLAYER_SHOULDER, type ParallaxHandle } from '../src/game2d/art';
import { PLAYER_FRAME_COUNT } from '../src/game2d/art/draw/player';
import { ANIM, ARM_MUZZLE, ARM_RIG, ARM_TEX, BULLET_ADDITIVE, BULLET_SIZE, BULLET_TEX, FRAMES, FRAME_SIZE, TEX, TILESET, TILE_FRAME } from '../src/game2d/art/keys';
import { AIM_ANGLE, type AimDir, DEPTH, LEVEL_ROWS, TILE, VIEW_H } from '../src/game2d/constants';

// Page d'aperçu du module graphique 2D (outil de développement, hors jeu).
// Paramètres : ?theme=jungle|moon (THEME_IDS) &view=world|sheet|weapons &w=1080..1600 &speed=90 &x=0 &vy=1 &regen=1 &ff=0
// &z=1 (&cx, &cy) ; vue weapons : &bg=0 sans le décor du thème.

const params = new URLSearchParams(location.search);
const theme: ThemeId = THEME_IDS.find((id) => id === params.get('theme')) ?? THEME_IDS[0];
const viewParam = params.get('view');
const view = viewParam === 'sheet' || viewParam === 'weapons' ? viewParam : 'world';
const viewW = Math.min(1600, Math.max(1080, Number(params.get('w')) || 1280));
/** La planche est plus haute que la vue du jeu (rangée « Kaï + bras » et portes, puis la balise de LUMA en bas). */
const viewH = view === 'sheet' ? 1080 : VIEW_H;
const speed = params.has('speed') ? Number(params.get('speed')) : 90;
const startX = Number(params.get('x')) || 0;
const vertical = params.get('vy') === '1';
const regen = params.get('regen') === '1';

const LABEL = { fontFamily: '"Exo 2", sans-serif', fontSize: '11px', color: '#b8b0e0' };
/** Étiquettes lisibles sur le décor du thème (vue weapons). */
const TAG = { ...LABEL, color: '#ffffff', backgroundColor: 'rgba(5,1,15,0.6)', padding: { x: 4, y: 2 } };

/** Nom court de chaque arme (étiquettes des planches). */
const SHORT: Record<WeaponId, string> = { laser: 'laser', machinegun: 'mitr.', shotgun: 'pompe', rifle: 'fusil' };

/** Kaï assemblé : corps animé + bras armé accroché à l'épaule de la frame affichée (comme Player.placeArm). */
interface Kai {
  body: Phaser.GameObjects.Sprite;
  arm: Phaser.GameObjects.Image;
  aim: AimDir;
}

/** Stand de tir de la vue weapons : Kaï tire en continu, projectiles à la vitesse et à la cadence réelles. */
interface Range {
  weapon: WeaponId;
  shooter: Kai;
  /** Bouche du canon (ARM_RIG, comme Player.gunX / gunY) et distance visible (portée ou bord de la vue). */
  mx: number;
  my: number;
  maxD: number;
  pool: Phaser.GameObjects.Image[];
}

/** Aléatoire reproductible dans [0, 1) (dispersion du mitrailleur). */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

class ArtScene extends Phaser.Scene {
  private parallax: ParallaxHandle | null = null;
  private mapW = 0;
  private movers: { s: Phaser.GameObjects.Image; x0: number }[] = [];
  private lasers: Phaser.GameObjects.Image[] = [];
  private kais: Kai[] = [];
  private ranges: Range[] = [];
  /** Flèches ▲ qui oscillent au-dessus des portes (y de repos). */
  private arrows: { s: Phaser.GameObjects.Image; y0: number }[] = [];
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('art');
  }

  create(): void {
    (window as unknown as { __artScene: Phaser.Scene }).__artScene = this;
    if (regen) for (const other of THEME_IDS) if (other !== theme) generatePlatformArt(this, other);
    const t0 = performance.now();
    generatePlatformArt(this, theme);
    const t1 = performance.now();
    let t2 = t1;
    if (view === 'sheet') {
      this.buildSheet();
    } else if (view === 'weapons') {
      if (params.get('bg') !== '0') this.parallax = createParallax(this, theme);
      t2 = performance.now();
      this.buildWeapons();
    } else {
      this.parallax = createParallax(this, theme);
      t2 = performance.now();
      // Avance rapide de l'arrière-plan : &ff=4 (secondes)
      const ff = Number(params.get('ff')) || 0;
      for (let k = 1; k <= ff * 60; k++) this.parallax.update(k * 16.67, 16.67);
      this.buildWorld();
    }
    const msg = `${theme} — textures ${(t1 - t0).toFixed(1)} ms` + (this.parallax ? ` · parallaxe ${(t2 - t1).toFixed(1)} ms` : '');
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

  /** Kaï complet (pieds en feetY) : corps animé, bras armé tourné selon la visée, vers la gauche si left. */
  private kai(x: number, feetY: number, anim: string, aim: AimDir, left = false, recoil = false, weapon: WeaponId = 'laser'): Kai {
    const body = this.add.sprite(x, feetY, TEX.player).setOrigin(0.5, 1).setDepth(DEPTH.player).setFlipX(left);
    body.play(anim);
    const arm = this.add
      .image(x, feetY, ARM_TEX[weapon], recoil ? FRAMES.arm.recoil : FRAMES.arm.rest)
      .setOrigin(ARM_RIG.pivotX / FRAME_SIZE.arm.w, ARM_RIG.pivotY / FRAME_SIZE.arm.h)
      .setDepth(DEPTH.player + 0.5);
    const k: Kai = { body, arm, aim };
    this.kais.push(k);
    this.placeArm(k);
    return k;
  }

  /** Même calcul que Player.placeArm : épaule de la frame affichée, échelle négative pour la gauche. */
  private placeArm(k: Kai): void {
    const spr = k.body;
    const f = spr.flipX ? -1 : 1;
    const i = (+spr.frame.name | 0) * 2;
    const sx =
      (i + 1 < PLAYER_SHOULDER.length ? PLAYER_SHOULDER[i] : ARM_RIG.shoulderX) +
      (k.aim === 'up' ? ARM_RIG.upShoulderX : k.aim === 'diag' ? ARM_RIG.diagShoulderX : 0);
    const sy = (i + 1 < PLAYER_SHOULDER.length ? PLAYER_SHOULDER[i + 1] : ARM_RIG.shoulderY) + (k.aim === 'diag' ? ARM_RIG.diagShoulderY : 0);
    k.arm.setPosition(spr.x + f * sx, spr.y + sy);
    k.arm.setScale(f, 1);
    k.arm.rotation = -f * AIM_ANGLE[k.aim];
  }

  /** Porte (pieds en feetY) : frame fermée ou ouverte, avec la flèche ▲ au-dessus si arrow. */
  private door(x: number, feetY: number, open: boolean, arrow: boolean): void {
    this.add
      .image(x, feetY, TEX.door, open ? FRAMES.door.open : FRAMES.door.closed)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.decor);
    if (!arrow) return;
    // Même placement que engine/doors.ts : 8 px au-dessus de la porte.
    const y0 = feetY - FRAME_SIZE.door.h - 8;
    const s = this.add.image(x, y0, TEX.interactArrow).setOrigin(0.5, 1).setDepth(DEPTH.items + 1);
    this.arrows.push({ s, y0 });
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
    // Joueur (corps sans le bras armé ; 11 = accroupi, 12 = accroupi qui tire), flèche ▲ ; bras armés plus bas
    let x = this.frames(TEX.player, PLAYER_FRAME_COUNT, 10, 186, 64, 80, 'p');
    this.single(TEX.interactArrow, x, 214, 28, 24, 'flèche');
    // Ennemis
    x = this.frames(TEX.walker, 5, 10, 300, 64, 56, 'walker');
    x = this.frames(TEX.flyer, 4, x, 300, 64, 56, 'flyer');
    x = this.frames(TEX.armored, 4, x, 300, 72, 56, 'armored');
    x = this.frames(TEX.spitter, 3, x, 290, 64, 80, 'spitter');
    // Objets
    x = this.frames(TEX.crystal, 6, 10, 400, 32, 40, 'cr');
    x = this.single(TEX.spore, x, 408, 24, 24, 'spore');
    // Projectiles des 4 armes (centrés sur la ligne y = 420), bonus vitesse / bouclier / cadence
    for (const id of WEAPON_IDS) {
      const b = BULLET_SIZE[id];
      x = this.single(BULLET_TEX[id], x, 420 - b.h / 2, b.w, b.h, SHORT[id]);
    }
    x = this.single(TEX.powerSpeed, x, 396, 48, 48, 'vitesse');
    x = this.single(TEX.powerShield, x, 396, 48, 48, 'bouclier');
    x = this.single(TEX.powerRapid, x, 396, 48, 48, 'cadence');
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
    // Bras armés des 4 armes (repos, recul ; détail : &view=weapons)
    let bx = 10;
    for (const id of WEAPON_IDS) bx = this.frames(ARM_TEX[id], 2, bx, 664, FRAME_SIZE.arm.w, FRAME_SIZE.arm.h, SHORT[id]);
    // Kaï assemblé (corps + bras armé) : visées devant / diagonale / haut, accroupi, tir, vers la gauche
    const ky = 850;
    const poses: [string, AimDir, boolean, boolean, string][] = [
      [ANIM.playerIdle, 'front', false, false, 'idle'],
      [ANIM.playerRun, 'diag', false, false, 'run ↗'],
      [ANIM.playerIdle, 'up', false, false, 'idle ↑'],
      [ANIM.playerJump, 'up', false, false, 'jump ↑'],
      [ANIM.playerFall, 'diag', false, false, 'fall ↗'],
      [ANIM.playerHurt, 'front', false, false, 'hurt'],
      [ANIM.playerCrouch, 'front', false, false, 'crouch'],
      [ANIM.playerCrouchShoot, 'front', false, true, 'crouch tir'],
      [ANIM.playerCrawl, 'front', false, false, 'crawl'],
      [ANIM.playerRun, 'diag', true, false, 'run ↖'],
      [ANIM.playerIdle, 'up', true, true, '↑ tir (g.)'],
    ];
    for (let i = 0; i < poses.length; i++) {
      const [anim, aim, left, recoil, name] = poses[i];
      const px = 46 + i * 74;
      this.kai(px, ky, anim, aim, left, recoil);
      this.label(px, ky + 2, name);
    }
    // Portes : fermée avec la flèche ▲, ouverte avec Kaï devant, puis les deux frames brutes ; mur de fond
    // d'une salle close (2x2 tuiles)
    this.door(870, ky, false, true);
    this.label(870, ky + 2, 'porte + ▲');
    this.door(950, ky, true, false);
    this.kai(950, ky, ANIM.playerIdle, 'up');
    this.label(950, ky + 2, 'porte ouverte');
    x = this.frames(TEX.door, 2, 998, ky - FRAME_SIZE.door.h, FRAME_SIZE.door.w, FRAME_SIZE.door.h, 'porte');
    for (let k = 0; k < 4; k++) this.add.image(x + (k % 2) * 64, ky - 128 + Math.floor(k / 2) * 64, TEX.roomWall).setOrigin(0, 0);
    this.label(x + 64, ky + 2, 'mur de salle');
    // Balise de LUMA (sortie des niveaux 1 et 2) : frames brutes, faisceau, puis en veille et activée, Kaï dans
    // le faisceau (comme engine/exit.ts : faisceau derrière Kaï, en mode additif, lueur au sol)
    const by = 1060;
    const Bc = FRAME_SIZE.beacon;
    const Bb = FRAME_SIZE.beaconBeam;
    x = this.frames(TEX.beacon, 4, 10, by - Bc.h, Bc.w, Bc.h, 'balise');
    x = this.frames(TEX.beaconBeam, 2, x, by - Bb.h, Bb.w, Bb.h, 'faisceau');
    this.animSprite(x + 40, by, TEX.beacon, ANIM.beaconIdle, 'veille');
    const lx = x + 150;
    this.animSprite(lx, by, TEX.beacon, ANIM.beaconOn, 'activée');
    this.add
      .sprite(lx, by, TEX.beaconBeam)
      .setOrigin(0.5, 1)
      .setDisplaySize(76, by - 880)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.9)
      .setDepth(DEPTH.player - 1)
      .play(ANIM.beaconBeam);
    this.add.image(lx, by - 4, TEX.spark).setScale(6, 1.4).setTint(0x8ffcff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setDepth(DEPTH.player - 1);
    this.kai(lx, by - 60, ANIM.playerJump, 'front');
    this.zoom();
  }

  /** Loupe des vues fixes : &z=3&cx=200&cy=230. */
  private zoom(): void {
    const z = Number(params.get('z')) || 1;
    if (z !== 1) {
      const cam = this.cameras.main;
      cam.setZoom(z);
      cam.centerOn(Number(params.get('cx')) || viewW / 2, Number(params.get('cy')) || viewH / 2);
      this.info?.setVisible(false);
    }
  }

  // ------------------------------------------------------------ Armes : bras (x2), visées, stand de tir, bonus
  private buildWeapons(): void {
    if (!this.parallax) this.cameras.main.setBackgroundColor('#140e26');
    const text = (x: number, y: number, s: string, origin = 0) => this.add.text(x, y, s, TAG).setOrigin(origin, 0).setDepth(1000);
    text(10, 6, 'Armes de Kaï : bras x2 (+ = bouche du canon), visées, tir continu à la cadence et à la vitesse réelles');
    // Kaï dans les 6 visées testées : [anim, visée, gauche, recul, étiquette]
    const poses: [string, AimDir, boolean, boolean, string][] = [
      [ANIM.playerIdle, 'front', false, false, 'devant'],
      [ANIM.playerRun, 'diag', false, false, 'course ↗'],
      [ANIM.playerIdle, 'up', false, false, 'haut ↑'],
      [ANIM.playerCrouch, 'front', false, false, 'accroupi'],
      [ANIM.playerJump, 'diag', true, false, 'saut ↖'],
      [ANIM.playerIdle, 'up', true, true, '↑ tir (g.)'],
    ];
    const Am = FRAME_SIZE.arm;
    WEAPON_IDS.forEach((id, row) => {
      const w = WEAPONS[id];
      const feet = 140 + row * 146;
      const shot = w.pellets > 1 ? `${w.pellets} plombs ±${w.spreadDeg}°` : w.burst > 1 ? `rafale de ${w.burst}` : w.spreadDeg ? `1 balle ±${w.spreadDeg}°` : '1 tir';
      text(10, feet - 114, `${w.name} — portée ${w.rangeTiles} tuiles · ${shot} · ${w.cooldownMs} ms · dégâts ${w.damage}`);
      // Planche du bras x2, bouche du canon (ARM_MUZZLE) et épaule (ARM_RIG.pivot) repérées
      const m = ARM_MUZZLE[id];
      for (let f = 0; f < 2; f++) {
        const fx = 10 + f * (Am.w * 2 + 8);
        const fy = feet - 88;
        this.add.rectangle(fx + Am.w, fy + Am.h, Am.w * 2, Am.h * 2, 0x05010f, 0.55).setStrokeStyle(1, 0x3a3060);
        this.add.image(fx, fy, ARM_TEX[id], f).setOrigin(0, 0).setScale(2);
        for (const [px, py, col] of [[m.x, m.y, 0xff4fd8], [ARM_RIG.pivotX, ARM_RIG.pivotY, 0xffcc33]] as const) {
          this.add.rectangle(fx + px * 2, fy + py * 2, 7, 1, col);
          this.add.rectangle(fx + px * 2, fy + py * 2, 1, 7, col);
        }
        text(fx + Am.w, fy + Am.h * 2 + 2, f === FRAMES.arm.recoil ? 'recul' : 'repos', 0.5);
      }
      for (let k = 0; k < poses.length; k++) {
        const [anim, aim, left, recoil, name] = poses[k];
        const px = 330 + k * 76;
        this.kai(px, feet, anim, aim, left, recoil, id);
        text(px, feet + 2, name, 0.5);
      }
      // Stand de tir : Kaï debout qui vise devant
      const sx = 830;
      const shooter = this.kai(sx, feet, ANIM.playerIdle, 'front', false, false, id);
      const mx = sx + ARM_RIG.shoulderX + (m.x - ARM_RIG.pivotX);
      const my = feet + ARM_RIG.shoulderY + (m.y - ARM_RIG.pivotY);
      const rangePx = w.rangeTiles * TILE;
      const maxD = Math.min(rangePx, viewW - 10 - mx);
      if (rangePx <= maxD) {
        this.add.rectangle(mx + rangePx, my, 2, 30, 0xffffff, 0.5);
        text(mx + rangePx, my + 16, 'portée', 0.5);
      }
      // Assez d'images pour tout ce qui est en vol (cycles visibles x balles x plombs, plombs lents compris)
      const life = maxD / ((w.speed / 1000) * (w.pellets > 1 ? 1 - PELLET_SPEED_JITTER : 1)) + w.burst * w.burstGapMs;
      const count = (Math.ceil(life / w.cooldownMs) + 1) * w.burst * w.pellets;
      const pool: Phaser.GameObjects.Image[] = [];
      const blend = BULLET_ADDITIVE[id] ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL;
      for (let i = 0; i < count; i++) {
        pool.push(this.add.image(0, 0, BULLET_TEX[id]).setDepth(DEPTH.projectiles).setBlendMode(blend).setVisible(false));
      }
      this.ranges.push({ weapon: id, shooter, mx, my, maxD, pool });
    });
    // Bonus x1,5 et x1 (taille du jeu), projectiles x3
    const by = 612;
    let x = 10;
    const icons: [string, string][] = [[TEX.powerSpeed, 'vitesse'], [TEX.powerShield, 'bouclier'], [TEX.powerRapid, 'cadence']];
    for (const [key, name] of icons) {
      this.add.image(x, by, key).setOrigin(0, 0).setScale(1.5);
      text(x + 36, by + 74, name, 0.5);
      x += 86;
    }
    x += 16;
    for (const id of WEAPON_IDS) {
      const b = BULLET_SIZE[id];
      this.add.rectangle(x + b.w * 1.5, by + 36, b.w * 3, b.h * 3, 0x05010f, 0.7).setStrokeStyle(1, 0x3a3060);
      this.add
        .image(x, by + 36 - b.h * 1.5, BULLET_TEX[id])
        .setOrigin(0, 0)
        .setScale(3)
        .setBlendMode(BULLET_ADDITIVE[id] ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      // Pointe testée contre les tuiles et les ennemis (BULLET_SIZE.tip, depuis le centre)
      this.add.rectangle(x + (b.w / 2 + b.tip) * 3, by + 36, 1, b.h * 3 + 8, 0xff4fd8);
      text(x + b.w * 1.5, by + 74, `${SHORT[id]} x3`, 0.5);
      x += b.w * 3 + 18;
    }
    x += 6;
    for (const [key, name] of icons) {
      this.add.image(x, by + 12, key).setOrigin(0, 0);
      text(x + 24, by + 74, name, 0.5);
      x += 62;
    }
    this.zoom();
  }

  /** Stand de tir : projectiles en vol (cycles de tir passés encore visibles) et recul du bras après chaque tir. */
  private updateRanges(time: number): void {
    for (const r of this.ranges) {
      const w = WEAPONS[r.weapon];
      const v = w.speed / 1000;
      const spread = (w.spreadDeg * Math.PI) / 180;
      const jitter = w.pellets > 1 ? PELLET_SPEED_JITTER : 0;
      const life = r.maxD / (v * (1 - jitter)) + w.burst * w.burstGapMs;
      let n = 0;
      let recoil = false;
      for (let c = Math.floor(time / w.cooldownMs); c >= 0 && time - c * w.cooldownMs <= life; c--) {
        for (let b = 0; b < w.burst; b++) {
          const age = time - c * w.cooldownMs - b * w.burstGapMs;
          if (age < 0) continue;
          if (age < 60) recoil = true;
          for (let p = 0; p < w.pellets && n < r.pool.length; p++) {
            // Comme le moteur : éventail régulier (plombs, vitesses un peu différentes) ou écart au hasard dans ±dispersion
            const a = w.pellets > 1 ? spread * ((2 * p) / (w.pellets - 1) - 1) : spread * (2 * hash01(c * 3 + b) - 1);
            const d = age * v * (1 + jitter * (2 * hash01(c * 7 + p * 13 + 1) - 1));
            if (d > r.maxD) continue;
            r.pool[n++].setPosition(r.mx + Math.cos(a) * d, r.my + Math.sin(a) * d).setRotation(a).setVisible(true);
          }
        }
      }
      for (let i = n; i < r.pool.length; i++) r.pool[i].setVisible(false);
      r.shooter.arm.setFrame(recoil ? FRAMES.arm.recoil : FRAMES.arm.rest);
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
      // Kaï : corps + bras armé (fusil visée haut, laser devant avec les tirs, mitrailleur en diagonale en saut),
      // accroupi avec la pompe sur la plateforme `=`
      let p = at(o + 1, 10);
      this.kai(p.x, p.y, ANIM.playerIdle, 'up', false, false, 'rifle');
      p = at(o + 3, 10);
      this.kai(p.x, p.y, ANIM.playerRun, 'front');
      p = at(o + 4, 8);
      this.kai(p.x, p.y, ANIM.playerJump, 'diag', false, false, 'machinegun');
      this.add.image(p.x, p.y - 40, TEX.shieldBubble).setDepth(DEPTH.player + 1).setAlpha(0.9);
      p = at(o + 7, 6);
      this.kai(p.x, p.y, ANIM.playerCrouch, 'front', true, false, 'shotgun');
      // Paire de portes : ouverte (Kaï devant, flèche ▲) et fermée
      p = at(o + 12, 10);
      this.door(p.x, p.y, true, true);
      this.kai(p.x, p.y, ANIM.playerIdle, 'up');
      p = at(o + 51, 11);
      this.door(p.x, p.y, false, false);
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
      this.kai(p.x, p.y, ANIM.playerHurt, 'front');
      p = at(o + 12, 5);
      this.add.image(p.x, p.y, TEX.powerSpeed).setDepth(DEPTH.items);
      this.add.image(p.x + 64, p.y, TEX.powerShield).setDepth(DEPTH.items);
      this.add.image(p.x + 128, p.y, TEX.powerRapid).setDepth(DEPTH.items);
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
      // Balise de LUMA (1x3 tuiles, posée au bas de sa case)
      p = at(o + 61, 11);
      this.add.sprite(p.x, p.y, TEX.beacon).setOrigin(0.5, 1).setDepth(DEPTH.items).play(ANIM.beaconIdle);
      // Tirs laser
      for (let k = 0; k < 3; k++) {
        const l = this.add.image(at(o + 3, 10).x + 40 + k * 120, at(o + 3, 10).y - 38, TEX.laser).setDepth(DEPTH.projectiles);
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
    // Bras recalés sur la frame affichée (rebond des poses), flèches ▲ qui oscillent (comme engine/doors.ts)
    for (const k of this.kais) this.placeArm(k);
    const bob = 6 * (0.5 + 0.5 * Math.sin(time * 0.006));
    for (const a of this.arrows) a.s.y = a.y0 - bob;
    if (view === 'weapons') {
      this.updateRanges(time);
      this.parallax?.update(time, delta);
      return;
    }
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
  height: viewH,
  backgroundColor: '#05010f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  scene: [ArtScene],
});
