import * as Phaser from 'phaser';
import { BEACON_ORB } from '../art';
import { ANIM, FRAME_SIZE, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { LevelStart } from '../levels/types';
import type { ExitKind, ExitSpot } from './mapBuilder';
import type { Player } from './Player';
import type { PlatformScene } from './PlatformScene';

// Sorties du niveau : la Comète garée ('X') et la balise de LUMA ('L'). Kaï la touche, la scène passe dans
// l'état 'exit' et la sortie joue sa séquence, puis appelle onDone (PlatformScene.finishLevel). Tout passe par
// scene.time et les tweens de la scène : la pause et l'arrêt sont respectés, et sur perte du contexte
// graphique finishExitNow() termine le niveau sans attendre. La défaite du gardien (niveau 3, sans sortie) suit la
// même règle : état 'exit' le temps de sa défaite (PlatformScene.startGuardianExit), au plus EXIT_MAX_MS.
// Arrivées (LevelData.start, en fin de fichier) : leur miroir au départ (état 'enter'), Comète qui repart à vide
// ou faisceau de LUMA.

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

// Sortie : Kaï y grimpe, le réacteur s'allume, le vaisseau décolle et sort de l'écran en haut à droite (~2,6 s).
// Le même vaisseau, à vide, sert d'arrivée (ShipArrival, plus bas).

const SHIP_W = 192;
const SHIP_H = 112;
/** Tuyère (arrière du vaisseau, nez vers la droite), relative au point bas-centre du vaisseau
 *  (frame 192x112 : tuyère en (11, 58), cf. dessin de la Comète). La flamme pointe vers la gauche. */
const NOZZLE_X = 11 - SHIP_W / 2;
const NOZZLE_Y = 58 - SHIP_H;
/** Cockpit (où Kaï entre et d'où il sort), relatif au point bas-centre du vaisseau. */
const COCKPIT_X = 12;
const COCKPIT_Y = -64;

/** Décollage (ms depuis son début) : allumage, vol stationnaire, départ en haut à droite, fin. */
interface TakeOff {
  ignite: number;
  hover: number;
  fly: number;
  end: number;
  /** Secousse de l'allumage : durée (ms), force (Effects.shake). */
  shakeMs: number;
  shake: number;
  /** Trajet du départ (px) et sa durée (ms). */
  dx: number;
  dy: number;
  flyMs: number;
  /** La caméra lâche le vaisseau au départ (sortie) ; sinon elle continue de suivre Kaï (arrivée). */
  release: boolean;
}

/** Sortie : Kaï à bord, la caméra suit le vaisseau jusqu'au départ. */
const EXIT_TAKEOFF: TakeOff = {
  ignite: 740,
  hover: 980,
  fly: 1560,
  end: EXIT_MAX_MS,
  shakeMs: 700,
  shake: 0.35,
  dx: 1800,
  dy: -950,
  flyMs: 1100,
  release: true,
};
/** Arrivée : la Comète repart à vide vers l'orbite, plus droit vers le ciel, sans gêner la partie qui commence. */
const START_TAKEOFF: TakeOff = {
  ignite: 1000,
  hover: 1240,
  fly: 1820,
  end: 3000,
  shakeMs: 450,
  shake: 0.2,
  dx: 900,
  dy: -1300,
  flyMs: 1100,
  release: false,
};

/** Comète posée au sol : image, flamme du réacteur, décollage. */
class Comet {
  readonly ship: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Sprite;

  /** (x, baseY) = point bas-centre du vaisseau, posé sur le sol. */
  constructor(
    private readonly scene: PlatformScene,
    readonly x: number,
    readonly baseY: number,
  ) {
    this.ship = scene.add.image(x, baseY, TEX.ship);
    this.ship.setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.flame = scene.add.sprite(x + NOZZLE_X, baseY + NOZZLE_Y, TEX.shipFlame, 0);
    this.flame.setOrigin(1, 0.5).setDepth(DEPTH.items - 1).setVisible(false);
  }

  get cockpitX(): number {
    return this.x + COCKPIT_X;
  }

  get cockpitY(): number {
    return this.baseY + COCKPIT_Y;
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

  /** Décollage selon `t` ; onEnd à t.end (traînée éteinte). */
  takeOff(t: TakeOff, onEnd: () => void): void {
    const scene = this.scene;
    // 1. Allumage du réacteur.
    scene.time.delayedCall(t.ignite, () => {
      this.flame.setVisible(true).setScale(0.2);
      this.sync();
      if (scene.anims.exists(ANIM.shipFlame)) this.flame.anims.play(ANIM.shipFlame);
      scene.tweens.add({ targets: this.flame, scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
      scene.playSfx('takeoff');
      scene.vibrate(90);
      scene.fx.shake(t.shake, t.shakeMs);
      scene.fx.trail.startFollow(this.flame, -18, 0);
      scene.fx.trail.start();
    });
    // 2. Vol stationnaire.
    scene.time.delayedCall(t.hover, () => {
      scene.tweens.add({ targets: this.ship, y: this.baseY - 48, duration: 620, ease: 'Sine.easeInOut' });
    });
    // 3. Départ en haut à droite.
    scene.time.delayedCall(t.fly, () => {
      if (t.release) scene.cameras.main.stopFollow();
      scene.tweens.add({
        targets: this.ship,
        x: this.x + t.dx,
        y: this.baseY + t.dy,
        angle: -17,
        duration: t.flyMs,
        ease: 'Cubic.easeIn',
      });
      scene.tweens.add({ targets: this.flame, scaleX: 1.45, scaleY: 1.2, duration: 400, ease: 'Quad.easeOut' });
    });
    scene.time.delayedCall(t.end, () => {
      // Traînée commune à toutes les Comètes : éteinte seulement si elle suit encore celle-ci.
      const trail = scene.fx.trail;
      if (trail.follow === this.flame) {
        trail.stop();
        trail.stopFollow();
      }
      onEnd();
    });
  }
}

class ExitShip implements LevelExit {
  readonly kind = 'ship';
  readonly comet: Comet;
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
    this.comet = new Comet(scene, this.x, this.baseY);
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

  sync(): void {
    this.comet.sync();
  }

  launch(player: Player, onDone: () => void): void {
    if (this.launched) return;
    this.launched = true;
    const scene = this.scene;
    const spr = player.sprite;

    // Kaï saute dans le cockpit, puis le vaisseau décolle avec lui.
    player.freeze();
    player.shield = false;
    player.bubble.setVisible(false);
    player.playAnim(ANIM.playerJump);
    const sx = spr.x;
    const sy = spr.y;
    const tx = this.comet.cockpitX;
    const ty = this.comet.cockpitY;
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
    this.comet.takeOff(EXIT_TAKEOFF, onDone);
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

// ---------------------------------------------------------------- Arrivées (LevelData.start)

/** Arrivée de Kaï au départ : l'état 'enter' de la scène dure jusqu'à onLanded (Kaï ensuite jouable). */
export interface LevelArrival {
  readonly kind: LevelStart;
  /** Kaï posé et jouable (onLanded appelé). */
  readonly landed: boolean;
  /** Tout est fini (Comète partie, faisceau éteint) : plus rien à l'écran. */
  readonly done: boolean;
  /** À chaque image, après la physique (flamme de la Comète). */
  sync(): void;
  /** Kaï, figé, est amené à son départ ; onLanded quand il y est posé (au plus ARRIVAL_MS après). */
  play(player: Player, onLanded: () => void): void;
}

/** Durée maximale de l'état 'enter' (ms). */
export const ARRIVAL_MS = 700;

/** (x, feetY) = départ 'P' (pieds au bas de la case). */
export function createArrival(scene: PlatformScene, kind: LevelStart, x: number, feetY: number): LevelArrival {
  return kind === 'ship' ? new ShipArrival(scene, x, feetY) : new BeamArrival(scene, x, feetY);
}

/** Comète posée derrière le départ : centre 180 px à gauche de P (3 colonnes, place libre vérifiée par check-levels). */
const ARRIVAL_SHIP_DX = -180;

/** Kaï sort du cockpit et saute devant le vaisseau ; la Comète, vide, repart en orbite derrière lui (~3 s). */
class ShipArrival implements LevelArrival {
  readonly kind = 'ship';
  readonly comet: Comet;
  landed = false;
  done = false;

  constructor(
    private readonly scene: PlatformScene,
    private readonly x: number,
    private readonly feetY: number,
  ) {
    this.comet = new Comet(scene, x + ARRIVAL_SHIP_DX, feetY);
  }

  sync(): void {
    this.comet.sync();
  }

  play(player: Player, onLanded: () => void): void {
    const scene = this.scene;
    const spr = player.sprite;
    const sx = this.comet.cockpitX;
    const sy = this.comet.cockpitY;
    const tx = this.x;
    const ty = this.feetY;
    player.freeze();
    player.playAnim(ANIM.playerJump);
    spr.flipX = tx < sx;
    spr.setPosition(sx, sy).setScale(0.25).setAlpha(0);
    // Kaï paraît dans le cockpit (170 ms), puis saute à terre (520 ms).
    scene.tweens.add({
      targets: spr,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.playSfx('jump', 0.8);
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
            scene.fx.puff(tx, ty, 3);
            this.landed = true;
            onLanded();
          },
        });
      },
    });
    this.comet.takeOff(START_TAKEOFF, () => {
      this.comet.ship.setVisible(false);
      this.comet.flame.setVisible(false);
      this.done = true;
    });
  }
}

/** Le faisceau de LUMA descend du ciel et dépose Kaï, puis s'éteint (~1,1 s). */
class BeamArrival implements LevelArrival {
  readonly kind = 'beam';
  readonly beam: Phaser.GameObjects.Sprite;
  landed = false;
  done = false;

  constructor(
    private readonly scene: PlatformScene,
    private readonly x: number,
    private readonly feetY: number,
  ) {
    this.beam = scene.add.sprite(x, feetY, TEX.beaconBeam, 0).setOrigin(0.5, 1);
    this.beam.setDepth(DEPTH.player - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  sync(): void {}

  play(player: Player, onLanded: () => void): void {
    const scene = this.scene;
    const spr = player.sprite;
    player.freeze();
    player.playAnim(ANIM.playerFall);
    spr.setPosition(this.x, this.feetY - 600).setScale(0.3).setAlpha(0);
    this.beam.setVisible(true).setAlpha(0).setScale(0, (this.feetY + TILE) / FRAME_SIZE.beaconBeam.h);
    if (scene.anims.exists(ANIM.beaconBeam)) this.beam.anims.play(ANIM.beaconBeam);
    scene.playSfx('beacon', 0.7);
    scene.tweens.add({ targets: this.beam, scaleX: BEAM_W / FRAME_SIZE.beaconBeam.w, alpha: 0.9, duration: 220, ease: 'Back.easeOut' });
    // Kaï descend dans le faisceau (120 → 600 ms), puis le faisceau s'éteint (700 → 1100 ms).
    scene.tweens.add({
      targets: spr,
      y: this.feetY,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      delay: 120,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.fx.spark(this.x, this.feetY - 30, LUMA_TINT, 10);
        this.landed = true;
        onLanded();
      },
    });
    scene.tweens.add({
      targets: this.beam,
      scaleX: 0,
      alpha: 0,
      delay: 700,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.beam.setVisible(false);
        this.done = true;
      },
    });
  }
}
