import * as Phaser from 'phaser';
import { BEACON_ORB } from '../art';
import { ANIM, FRAME_SIZE, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { ExitKind, ExitSpot } from './mapBuilder';
import type { Player } from './Player';
import type { PlatformScene } from './PlatformScene';

// Sorties du niveau : la Comète garée ('X') et la balise de LUMA ('L'). Kaï la touche, la scène passe dans
// l'état 'exit' et la sortie joue sa séquence, puis appelle onDone (PlatformScene.finishLevel). Tout passe par
// scene.time et les tweens de la scène : la pause et l'arrêt sont respectés, et sur perte du contexte
// graphique finishExitNow() termine le niveau sans attendre. La future défaite du gardien suivra la même règle.

/** Durée maximale d'une séquence de sortie (ms) : onDone est appelé au plus tard à cet instant. */
export const EXIT_MAX_MS = 2620;

export interface LevelExit {
  readonly kind: ExitKind;
  /** Séquence lancée (plus de contact). */
  readonly launched: boolean;
  /** Pieds de Kaï posé juste avant la sortie (__xr2d.win). */
  readonly approachX: number;
  readonly feetY: number;
  /** Kaï touche-t-il la sortie ? */
  touches(p: Player): boolean;
  /** À chaque image, après la physique. */
  sync(): void;
  /** Séquence de sortie ; onDone est appelé à la fin, au plus tard EXIT_MAX_MS après. */
  launch(player: Player, onDone: () => void): void;
}

export function createExit(scene: PlatformScene, spot: ExitSpot): LevelExit {
  return spot.kind === 'beacon' ? new Beacon(scene, spot.col, spot.row) : new ExitShip(scene, spot.col, spot.row);
}

// ---------------------------------------------------------------- Comète

// Kaï y grimpe, le réacteur s'allume, le vaisseau décolle et sort de l'écran en haut à droite (~2,6 s).

const SHIP_W = 192;
const SHIP_H = 112;
/** Tuyère (arrière du vaisseau, nez vers la droite), relative au point bas-centre du vaisseau
 *  (frame 192x112 : tuyère en (11, 58), cf. dessin de la Comète). La flamme pointe vers la gauche. */
const NOZZLE_X = 11 - SHIP_W / 2;
const NOZZLE_Y = 58 - SHIP_H;

class ExitShip implements LevelExit {
  readonly kind = 'ship';
  readonly ship: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Sprite;
  readonly x: number;
  readonly baseY: number;
  readonly approachX: number;
  readonly feetY: number;
  launched = false;

  /** (col, row) = case du 'X' : le vaisseau occupe 3x2 tuiles à droite et au-dessus, posé sur le sol. */
  constructor(
    private readonly scene: PlatformScene,
    col: number,
    row: number,
  ) {
    this.x = col * TILE + SHIP_W / 2;
    this.baseY = (row + 1) * TILE;
    this.approachX = col * TILE - 28;
    this.feetY = this.baseY;
    this.ship = scene.add.image(this.x, this.baseY, TEX.ship);
    this.ship.setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.flame = scene.add.sprite(this.x + NOZZLE_X, this.baseY + NOZZLE_Y, TEX.shipFlame, 0);
    this.flame.setOrigin(1, 0.5).setDepth(DEPTH.items - 1).setVisible(false);
  }

  touches(p: Player): boolean {
    return (
      !this.launched &&
      p.right > this.x - SHIP_W / 2 + 16 &&
      p.left < this.x + SHIP_W / 2 - 16 &&
      p.feetY > this.baseY - SHIP_H + 8 &&
      p.top < this.baseY
    );
  }

  /** La flamme suit le vaisseau. */
  sync(): void {
    if (!this.flame.visible) return;
    const r = this.ship.rotation;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    this.flame.setPosition(
      this.ship.x + NOZZLE_X * cos - NOZZLE_Y * sin,
      this.ship.y + NOZZLE_X * sin + NOZZLE_Y * cos,
    );
    this.flame.rotation = r;
  }

  launch(player: Player, onDone: () => void): void {
    if (this.launched) return;
    this.launched = true;
    const scene = this.scene;
    const spr = player.sprite;

    // 1. Kaï saute dans le cockpit.
    player.freeze();
    player.shield = false;
    player.bubble.setVisible(false);
    player.playAnim(ANIM.playerJump);
    const sx = spr.x;
    const sy = spr.y;
    const tx = this.x + 12;
    const ty = this.baseY - 64;
    spr.flipX = tx < sx;
    spr.setAlpha(1).setScale(1);
    scene.playSfx('jump');
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 520,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        spr.x = sx + (tx - sx) * k;
        spr.y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 84;
      },
      onComplete: () => {
        scene.tweens.add({
          targets: spr,
          scaleX: 0.25,
          scaleY: 0.25,
          alpha: 0,
          duration: 170,
          ease: 'Quad.easeIn',
          onComplete: () => player.hide(),
        });
      },
    });

    // 2. Allumage du réacteur.
    scene.time.delayedCall(740, () => {
      this.flame.setVisible(true).setScale(0.2);
      this.sync();
      if (scene.anims.exists(ANIM.shipFlame)) this.flame.anims.play(ANIM.shipFlame);
      scene.tweens.add({ targets: this.flame, scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
      scene.playSfx('takeoff');
      scene.vibrate(90);
      scene.cameras.main.shake(700, 0.0035);
      scene.fx.trail.startFollow(this.flame, -18, 0);
      scene.fx.trail.start();
    });

    // 3. Vol stationnaire.
    scene.time.delayedCall(980, () => {
      scene.tweens.add({ targets: this.ship, y: this.baseY - 48, duration: 620, ease: 'Sine.easeInOut' });
    });

    // 4. La caméra lâche le vaisseau qui file en haut à droite.
    scene.time.delayedCall(1560, () => {
      scene.cameras.main.stopFollow();
      scene.tweens.add({
        targets: this.ship,
        x: this.x + 1800,
        y: this.baseY - 950,
        angle: -17,
        duration: 1100,
        ease: 'Cubic.easeIn',
      });
      scene.tweens.add({ targets: this.flame, scaleX: 1.45, scaleY: 1.2, duration: 400, ease: 'Quad.easeOut' });
    });

    scene.time.delayedCall(EXIT_MAX_MS, () => {
      scene.fx.trail.stop();
      onDone();
    });
  }
}

// ---------------------------------------------------------------- Balise de LUMA

// Kaï la touche : elle s'allume, un faisceau descend du ciel, Kaï s'élève, file vers le haut et disparaît
// (téléporté dans la Comète en orbite), le faisceau s'éteint (~2,1 s).

const BEACON_W = FRAME_SIZE.beacon.w;
const BEACON_H = FRAME_SIZE.beacon.h;
/** Couleur de LUMA (étincelles, éclat de l'activation). */
const LUMA_TINT = 0x8ffcff;
/** Largeur du faisceau à l'écran (px) ; il va du haut de la carte au sol. */
const BEAM_W = 76;
const BEACON_DONE_MS = 2100;

class Beacon implements LevelExit {
  readonly kind = 'beacon';
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly beam: Phaser.GameObjects.Sprite;
  /** Lueur au sol, au pied du faisceau. */
  readonly pool: Phaser.GameObjects.Image;
  readonly x: number;
  readonly baseY: number;
  readonly approachX: number;
  readonly feetY: number;
  launched = false;

  /** (col, row) = case du 'L' : balise centrée sur la colonne, posée au bas de la case. */
  constructor(
    private readonly scene: PlatformScene,
    col: number,
    row: number,
  ) {
    this.x = col * TILE + TILE / 2;
    this.baseY = (row + 1) * TILE;
    this.approachX = this.x - 48;
    this.feetY = this.baseY;
    this.sprite = scene.add.sprite(this.x, this.baseY, TEX.beacon, 0).setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.play(ANIM.beaconIdle);
    // Faisceau : derrière Kaï, devant la balise ; du haut de la carte (une tuile au-dessus) jusqu'au sol.
    this.beam = scene.add.sprite(this.x, this.baseY, TEX.beaconBeam, 0).setOrigin(0.5, 1);
    this.beam.setDepth(DEPTH.player - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.pool = scene.add.image(this.x, this.baseY - 4, TEX.spark).setDepth(DEPTH.player - 1);
    this.pool.setBlendMode(Phaser.BlendModes.ADD).setTint(LUMA_TINT).setVisible(false);
  }

  /** Toute la colonne du faisceau, jusqu'en haut (libre, vérifié par check-levels) : on ne saute pas la balise. */
  touches(p: Player): boolean {
    return !this.launched && p.right > this.x - BEACON_W / 2 + 10 && p.left < this.x + BEACON_W / 2 - 10 && p.top < this.baseY;
  }

  sync(): void {}

  launch(player: Player, onDone: () => void): void {
    if (this.launched) return;
    this.launched = true;
    const scene = this.scene;
    const spr = player.sprite;
    const x = this.x;
    const base = this.baseY;

    // 1. La balise s'active ; Kaï se place sous l'œil de LUMA.
    player.freeze();
    player.shield = false;
    player.bubble.setVisible(false);
    player.playAnim(ANIM.playerIdle);
    spr.flipX = x < spr.x;
    spr.setAlpha(1).setScale(1);
    this.play(ANIM.beaconOn);
    scene.playSfx('beacon');
    scene.vibrate(50);
    scene.fx.burst(x, base - BEACON_H + BEACON_ORB.y, LUMA_TINT, 16);
    scene.tweens.add({ targets: spr, x, duration: 260, ease: 'Sine.easeOut' });

    // 2. Le faisceau descend du ciel ; des étincelles y montent.
    const beamScaleY = (base + TILE) / FRAME_SIZE.beaconBeam.h;
    this.beam.setVisible(true).setAlpha(0).setScale(0, beamScaleY);
    if (scene.anims.exists(ANIM.beaconBeam)) this.beam.anims.play(ANIM.beaconBeam);
    scene.tweens.add({
      targets: this.beam,
      scaleX: BEAM_W / FRAME_SIZE.beaconBeam.w,
      alpha: 0.9,
      delay: 120,
      duration: 300,
      ease: 'Back.easeOut',
    });
    this.pool.setVisible(true).setAlpha(0).setScale(0.5, 0.3);
    scene.tweens.add({ targets: this.pool, scaleX: 6, scaleY: 1.4, alpha: 0.8, delay: 160, duration: 300, ease: 'Quad.easeOut' });
    scene.time.addEvent({
      delay: 70,
      repeat: 18,
      callback: () => scene.fx.spark(x + (Math.random() - 0.5) * 40, base - 16 - Math.random() * 220, LUMA_TINT, 2),
    });

    // 3. Kaï s'élève dans le faisceau (0,3 → 1 s), puis 4. file vers le haut et disparaît (→ 1,38 s).
    scene.time.delayedCall(300, () => player.playAnim(ANIM.playerJump));
    scene.tweens.add({
      targets: spr,
      y: spr.y - 80,
      delay: 300,
      duration: 700,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        scene.fx.spark(spr.x, spr.y - 40, 0xffffff, 10);
        scene.tweens.add({
          targets: spr,
          y: spr.y - 900,
          scaleX: 0.3,
          scaleY: 0.3,
          alpha: 0,
          duration: 380,
          ease: 'Quad.easeIn',
          onComplete: () => player.hide(),
        });
      },
    });

    // 5. Le faisceau s'éteint, la balise retourne en veille.
    scene.tweens.add({ targets: [this.beam, this.pool], scaleX: 0, alpha: 0, delay: 1450, duration: 450, ease: 'Quad.easeIn' });
    scene.time.delayedCall(1900, () => this.play(ANIM.beaconIdle));

    scene.time.delayedCall(BEACON_DONE_MS, onDone);
  }

  private play(key: string): void {
    if (this.scene.anims.exists(key)) this.sprite.anims.play(key);
  }
}
