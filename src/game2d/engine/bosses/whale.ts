import * as Phaser from 'phaser';
import { bossName } from '../../../core/i18n/names';
import { BOSS_SHEETS, HEART_POSE, TENTACLE_POSE, WHALE_BOSS, WHALE_HEART, WHALE_POSE } from '../../art/draw/bosses';
import type { BossBox } from '../../art/draw/bosses';
import { DEPTH, JUMP_HEIGHT_TILES, PLAYER_BODY, TILE } from '../../constants';
import type { PlatformScene } from '../PlatformScene';
import type { Player } from '../Player';
import { SPORE_DROP_VY, SPORE_GRAVITY } from '../tuning';
import type { Boss, BossSpot, BossState } from './types';

// Méduse-baleine, gardienne du monde 1 (plan 04, point 18 ; choix 9 et 13), toute grise (Vide). Elle plane au-dessus
// de l'arène, le bas de sa jupe au-dessus de la tête de Kaï au sommet d'un saut ; son corps est insensible (il arrête
// les tirs) et, hors plongée, inoffensif. Son cœur, pendu à une tige sous elle, descend jusqu'à 3 tuiles au-dessus du canon de Kaï et s'ouvre 3 s
// (4 s en phase 3) : seul point faible, touché d'un tir vers le haut ou en diagonale (la pompe l'atteint), ou droit
// devant depuis une passerelle ; une touche le referme. 6 touches, 2 par phase (point 20). Un cycle : elle dérive
// au-dessus de Kaï, attaque, lâche des spores annoncées par une tache au sol, puis expose son cœur. Phase 1 :
// tentacules abattus au sol (marque au sol) ; phase 2 : un tentacule balaie l'arène à mi-hauteur (s'accroupir ou
// sauter), 2 guêpes appelées (volants de réserve, hors score) ; phase 3 : plongée (son ombre grandit au sol : on
// s'écarte). Musique 'guardian', une intensité par phase (musicLevel au début de chaque transition). Vaincue (choix
// 13) : immobile, elle crie puis s'élève, encore grise ; la scène reste dans l'état 'exit' DEFEAT_MS, puis termine le
// niveau. Mouvement à la main, sans corps Arcade ; aucune allocation par image.

const BODY = BOSS_SHEETS.whaleBody;
const HEART = BOSS_SHEETS.whaleHeart;
const TENT = BOSS_SHEETS.whaleTentacle;
const SPOT = BOSS_SHEETS.whaleSpot;

/** 6 touches (plan 04, point 20), 2 par phase. */
const MAX_LIFE = 6;
const PHASES = 3;
const PER_PHASE = MAX_LIFE / PHASES;
/** Guêpes appelées en phase 2 (volants créés cachés au chargement : EnemyManager), hors score. */
export const WHALE_WASPS = 2;
/** Défaite dans la scène (ms, ≤ EXIT_MAX_MS) : immobile, elle crie, puis s'élève. */
const DEFEAT_MS = 2500;
/** Défaite : elle s'affaisse un peu, immobile, puis s'élève lentement et pâlit à la fin. */
const DEFEAT_STILL_MS = 900;
const DEFEAT_SAG = 28;
const DEFEAT_RISE_V = 150;
const DEFEAT_FADE_MS = 900;

/** Canon de Kaï debout, tir droit devant (px au-dessus des pieds). */
const CANNON_H = 38;
/** Centre du corps au-dessus du sol : bas de la jupe 14 px au-dessus de la tête de Kaï au sommet d'un saut. */
const HOVER_H = Math.round(PLAYER_BODY.height + JUMP_HEIGHT_TILES * TILE + 14 + WHALE_BOSS.skirtBottom);
/**
 * Centre du cœur exposé au-dessus du sol : 3 tuiles au-dessus du canon de Kaï debout (tir vers le haut ou en
 * diagonale), à hauteur du tir droit devant depuis une passerelle à 3 tuiles du sol.
 */
const HEART_LOW_H = CANNON_H + 3 * TILE;
/** Cœur rentré : haut de son image au-dessus de l'attache ; le bouton fermé dépasse sous la jupe. */
const HEART_TUCK = 36;
/** Débord du corps de part et d'autre de son centre (boîtes, avec une marge) : il reste entre les bornes. */
const BODY_LEFT = 236;
const BODY_RIGHT = 262;
const BOB = 6;

// Réglages en ms et px, par phase. Cycle ≈ 9 s : dérive, attaque, spores, fenêtre du cœur.
const INTRO_MS = 1800;
const DRIFT_MS = [1100, 900, 800];
const DRIFT_SPEED = [150, 190, 230];
const RAGE_MS = 1700;
/** Les guêpes arrivent pendant la colère qui ouvre la phase 2 ; elles volent entre le sol et les passerelles, juste
 *  au-dessus de la tête de Kaï debout (un saut les touche). */
const WASPS_AT_MS = 600;
const WASP_H = 110;
const WASP_X = 220;

// Tentacules abattus (phase 1) : 2 par cycle, chacun annoncé par une marque au sol sous Kaï et le tentacule levé.
const SLAMS = 2;
const SLAM_WARN_MS = 800;
const SLAM_STRIKE_MS = 130;
const SLAM_HOLD_MS = 450;
const SLAM_BACK_MS = 450;
const SLAM_GAP_MS = 150;
// Balayage (phase 2) : le bout d'un tentacule descend à mi-hauteur contre une borne (annonce), puis balaie l'arène.
const SWEEP_WARN_MS = 900;
const SWEEP_SPEED = 620;
const SWEEP_BACK_MS = 450;
/** Centre du bout au-dessus du sol : Kaï accroupi (46 px) passe dessous, debout (70 px) non. */
const SWEEP_H = 68;
/** Segments du bout qui blessent (le reste du tentacule passe derrière). */
const SWEEP_HURT_SEGS = 6;
// Plongée (phase 3) : annonce (elle se ramasse en suivant Kaï, son ombre grandit au sol), descente, au sol, remontée.
const DIVE_WARN_MS = 1000;
const DIVE_AIM_MS = 550;
const DIVE_RAISE = 36;
const DIVE_DOWN_MS = 320;
const DIVE_GROUND_MS = 450;
const DIVE_UP_MS = 700;
/** Centre du corps au plus bas : bas de la jupe à 9 px du sol. */
const DIVE_H = 90;
/** Boîte qui blesse pendant la plongée (relative au centre du corps) : tout le corps, dos compris. */
const DIVE_BOXES: readonly BossBox[] = [{ x: -215, y: -125, w: 462, h: 205 }];
/** Milieu de la masse du corps par rapport à son centre (ombre de la plongée). */
const BODY_MID = 13;

// Cœur : descente, ouverture, battements, fermeture, remontée.
const HEART_DOWN_MS = 450;
const HEART_OPENING_MS = 150;
const HEART_OPEN_MS = [3000, 3000, 4000];
const HEART_BEAT_MS = 300;
const HEART_CLOSE_MS = 120;
const HEART_UP_MS = 450;

// Spores (après chaque attaque) : une tache au sol annonce chacune, puis elle tombe d'au-dessus de la vue.
const SPORE_COUNT = [3, 4, 5];
const SPORE_OFFSETS = [0, -200, 200, -400, 400];
const SPORE_STAGGER_MS = 260;
const SPORE_WARN_MS = 1000;
const SPORE_MIN_GAP = 96;
const SPORE_ABOVE = 40;
const SPOT_POOL = 6;
const SPOT_SCALE = 0.85;

// Tentacules : chaînes d'images de la planche whaleTentacle.
const SEG = 19;
const REST_SEGS = 6;
const ATK_SEGS = 48;
const CORD_LINKS = 6;
const CORD_GAP = 16;
/** Rayon d'un segment qui blesse. */
const SEG_R = 14;

const HURT_MS = 450;
const FLASH_MS = 90;
const WEAK_PAD = 8;
/** Après une touche : les plombs de la même salve (ou tirs rapprochés) sont absorbés, sans seconde touche ni son. */
const TOUCH_GRACE_MS = 120;
/** Écart min entre deux sons de coup (plombs simultanés). */
const SFX_GAP_MS = 70;
const VOID_GREY = 0x9a96a8;
const CORE_MAGENTA = 0xff4fd8;

type Act = 'none' | 'intro' | 'drift' | 'slam' | 'sweep' | 'dive' | 'heart' | 'rage';
type Attack = 'none' | 'slam' | 'sweep';

interface Spot {
  readonly img: Phaser.GameObjects.Image;
  on: boolean;
  ms: number;
  dropped: boolean;
  /** Durée de vie après la chute (ms) : le temps que la spore atteigne le sol. */
  holdMs: number;
  x: number;
  /** Dessus du premier sol plein sous la tache (champignon compris) : la spore y éclate. */
  floor: number;
  frame: number;
}

interface Pt {
  x: number;
  y: number;
}

function inside(boxes: readonly BossBox[], x: number, y: number, pad: number): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return true;
  }
  return false;
}

function easeOut(u: number): number {
  return 1 - (1 - u) * (1 - u);
}

export class Whale implements Boss {
  readonly id = 'whale' as const;
  get name(): string {
    return bossName('whale');
  }
  readonly maxLife = MAX_LIFE;
  readonly phases = PHASES;
  readonly defeatMs = DEFEAT_MS;
  life = MAX_LIFE;
  phase = 1;
  state: BossState = 'wait';
  /** Centre du corps (px du monde). */
  x: number;
  y: number;

  private act: Act = 'none';
  private actMs = 0;
  private lastActMs = 0;
  /** Sous-étape de l'acte (annonce, frappe, retour…) et son temps. */
  private sub = 0;
  private subMs = 0;
  private clock = 0;
  private bodyFrame: number = WHALE_POSE.idle;
  private shownBody = -1;
  private hurtMs = 0;
  private flashMs = 0;
  private jitter = 0;
  /** Cœur : descente (0 rentré, 1 au plus bas), image, refermé après une touche. */
  private heartK = 0;
  private heartFrame: number = HEART_POSE.closed;
  private shownHeart = -1;
  private shut = false;
  private touchAt = -1e9;
  private lastHitSfx = -1e9;
  private lastArmorSfx = -1e9;
  /** Attaque d'un tentacule : genre, tentacule au repos remplacé, images montrées, blesse-t-il. */
  private atk: Attack = 'none';
  private atkK = -1;
  private atkShown = 0;
  private atkHurting = false;
  private atkSide = 1;
  private readonly anchor: Pt = { x: 0, y: 0 };
  private readonly ctrl: Pt = { x: 0, y: 0 };
  private readonly tip: Pt = { x: 0, y: 0 };
  /** Bout du tentacule au départ d'une étape (interpolations). */
  private readonly tipFrom: Pt = { x: 0, y: 0 };
  private targetX = 0;
  private sweepTo = 0;
  private slamIdx = 0;
  private diveFromY = 0;
  private introY = 0;
  private fadeAlpha = 1;
  private riseV = 0;
  private defeatY = 0;
  // Spores du cycle.
  private sporesLeft = 0;
  private sporeN = 0;
  private sporeNextMs = 0;
  private sporeBaseX = 0;
  // Relevés (tests).
  private slams = 0;
  private sweeps = 0;
  private dives = 0;
  private heartsOpened = 0;
  private spotsShown = 0;
  private sporesDropped = 0;
  private waspsCalled = 0;
  private readonly hoverY: number;
  private readonly groundY: number;
  private readonly minX: number;
  private readonly maxX: number;
  private readonly body: Phaser.GameObjects.Image;
  private readonly heart: Phaser.GameObjects.Image;
  /** Clignotement d'une touche : copie additive du cœur (aussi en rendu Canvas, où setTintFill est sans effet). */
  private readonly heartGlow: Phaser.GameObjects.Image;
  private readonly cord: Phaser.GameObjects.Image[] = [];
  private readonly rest: Phaser.GameObjects.Image[][] = [];
  private readonly atkParts: Phaser.GameObjects.Image[] = [];
  private readonly spots: Spot[] = [];
  private readonly slamMark: Phaser.GameObjects.Ellipse;
  private readonly diveShadow: Phaser.GameObjects.Ellipse;

  constructor(
    private readonly scene: PlatformScene,
    private readonly spot: BossSpot,
  ) {
    this.groundY = spot.feetY;
    this.hoverY = spot.feetY - HOVER_H;
    this.minX = spot.left + BODY_LEFT;
    this.maxX = Math.max(this.minX, spot.right - BODY_RIGHT);
    this.x = this.clampX(spot.x);
    this.y = this.hoverY;
    // Annonces au sol (lisibles sur le sol sombre) : ombre de la plongée, marque d'un tentacule abattu.
    this.diveShadow = scene.add.ellipse(0, spot.feetY, 460, 44, 0x6a3a86, 0.75).setStrokeStyle(4, 0xff3a4a, 1).setDepth(DEPTH.items - 0.5);
    this.slamMark = scene.add.ellipse(0, spot.feetY, 104, 28, 0xff3a4a, 0.45).setStrokeStyle(3, 0xffd6ec, 1).setDepth(DEPTH.items - 0.5);
    for (let k = 0; k < WHALE_BOSS.tentacles.length; k++) {
      const chain: Phaser.GameObjects.Image[] = [];
      for (let j = 0; j <= REST_SEGS; j++) {
        const f = j === REST_SEGS ? TENTACLE_POSE.tip : TENTACLE_POSE.segment;
        chain.push(scene.add.image(0, 0, TENT.key, f).setScale(1 - j * 0.035).setDepth(DEPTH.enemies - 3));
      }
      this.rest.push(chain);
    }
    for (let i = 0; i < CORD_LINKS; i++) this.cord.push(scene.add.image(0, 0, TENT.key, TENTACLE_POSE.cord).setDepth(DEPTH.enemies - 2.5));
    this.heart = scene.add.image(0, 0, HEART.key, HEART_POSE.closed).setOrigin(HEART.originX, HEART.originY).setDepth(DEPTH.enemies - 2);
    this.heartGlow = scene.add
      .image(0, 0, HEART.key, HEART_POSE.closed)
      .setOrigin(HEART.originX, HEART.originY)
      .setDepth(DEPTH.enemies - 1.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.85);
    this.body = scene.add.image(0, 0, BODY.key, WHALE_POSE.idle).setOrigin(BODY.originX, BODY.originY).setDepth(DEPTH.enemies - 1);
    for (let i = 0; i < ATK_SEGS; i++) {
      const f = i === ATK_SEGS - 1 ? TENTACLE_POSE.tip : TENTACLE_POSE.segment;
      this.atkParts.push(scene.add.image(0, 0, TENT.key, f).setDepth(DEPTH.enemies + 1));
    }
    for (let i = 0; i < SPOT_POOL; i++) {
      const img = scene.add.image(-500, -500, SPOT.key, 0).setOrigin(SPOT.originX, SPOT.originY).setScale(SPOT_SCALE).setDepth(DEPTH.items);
      this.spots.push({ img, on: false, ms: 0, dropped: false, holdMs: 0, x: 0, floor: spot.feetY, frame: -1 });
    }
    this.reset();
  }

  // ---------------------------------------------------------------- Cycle de vie

  /** À neuf, cachée : elle n'arrive qu'au début du combat (le décor la montre au loin jusque-là). */
  reset(): void {
    this.life = MAX_LIFE;
    this.phase = 1;
    this.state = 'wait';
    this.go('none');
    this.x = this.clampX(this.spot.x);
    this.y = this.hoverY;
    this.hurtMs = 0;
    this.flashMs = 0;
    this.jitter = 0;
    this.heartK = 0;
    this.heartFrame = HEART_POSE.closed;
    this.shut = false;
    this.touchAt = -1e9;
    this.fadeAlpha = 1;
    this.riseV = 0;
    this.endTentacle();
    this.clearSpores();
    this.showAll(false);
  }

  start(): void {
    if (this.state !== 'wait') return;
    this.state = 'fight';
    this.introY = -WHALE_BOSS.h;
    this.x = this.clampX(this.scene.player.x - WHALE_BOSS.heart.x);
    this.y = this.introY;
    this.go('intro');
    this.showAll(true);
    this.place();
    const scene = this.scene;
    scene.playSfx('whaleCry');
    scene.playSfx('bossAppear', 0.6);
    scene.fx.shake(0.5, 500);
    scene.vibrate(40);
  }

  destroy(): void {
    this.body.destroy();
    this.heart.destroy();
    this.heartGlow.destroy();
    this.slamMark.destroy();
    this.diveShadow.destroy();
    for (const c of this.rest) for (const img of c) img.destroy();
    for (const img of this.cord) img.destroy();
    for (const img of this.atkParts) img.destroy();
    for (const s of this.spots) s.img.destroy();
    this.rest.length = 0;
    this.cord.length = 0;
    this.atkParts.length = 0;
    this.spots.length = 0;
  }

  update(dt: number, dtMs: number): void {
    this.clock += dtMs;
    this.jitter = 0;
    if (this.hurtMs > 0) this.hurtMs -= dtMs;
    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      if (this.flashMs <= 0) this.heartGlow.setVisible(false);
    }
    this.updateSpores(dtMs);
    if (this.state === 'fight') this.updateFight(dt, dtMs);
    else if (this.state === 'beaten') this.updateDefeat(dt, dtMs);
    if (this.state !== 'wait' && this.state !== 'gone') this.place();
  }

  // ---------------------------------------------------------------- Combat

  private go(act: Act): void {
    this.act = act;
    this.actMs = 0;
    this.lastActMs = 0;
    this.sub = 0;
    this.subMs = 0;
  }

  private next(sub: number): void {
    this.sub = sub;
    this.subMs = 0;
  }

  private get pi(): number {
    return this.phase - 1;
  }

  /** Cœur ouvert et pas encore touché : la fenêtre où une touche compte (Kaï en jeu). */
  private get open(): boolean {
    return this.state === 'fight' && this.act === 'heart' && this.sub === 1 && !this.shut && this.scene.state === 'play';
  }

  private clampX(x: number): number {
    return Math.min(this.maxX, Math.max(this.minX, x));
  }

  /** Vol stationnaire : léger balancement autour de sa hauteur. */
  private hover(): void {
    this.y = this.hoverY + Math.sin(this.clock * 0.0035) * BOB;
  }

  /** Dérive vers le point où son cœur pend au-dessus de Kaï. */
  private follow(dt: number, speed: number): void {
    const target = this.clampX(this.scene.player.x - WHALE_BOSS.heart.x);
    const dx = target - this.x;
    const step = Math.min(Math.abs(dx), speed * dt);
    this.x += dx < 0 ? -step : step;
  }

  private updateFight(dt: number, dtMs: number): void {
    this.lastActMs = this.actMs;
    this.actMs += dtMs;
    this.subMs += dtMs;
    switch (this.act) {
      case 'intro': {
        // Elle descend d'au-dessus de la vue jusqu'à sa hauteur, en criant.
        const u = Math.min(1, this.actMs / INTRO_MS);
        this.y = this.introY + (this.hoverY - this.introY) * (1 - (1 - u) * (1 - u) * (1 - u));
        if (u >= 1) this.go('drift');
        break;
      }
      case 'drift':
        this.hover();
        this.follow(dt, DRIFT_SPEED[this.pi]);
        if (this.actMs >= DRIFT_MS[this.pi]) this.startAttack();
        break;
      case 'slam':
        this.hover();
        this.updateSlam();
        break;
      case 'sweep':
        this.hover();
        this.updateSweep(dt);
        break;
      case 'dive':
        this.updateDive(dt);
        break;
      case 'heart':
        this.hover();
        this.updateHeart();
        break;
      case 'rage':
        // Colère : elle tremble et crie (insensible), le cœur rentre ; en phase 2, les guêpes arrivent.
        this.hover();
        this.jitter = Math.sin(this.clock * 0.08) * 3;
        this.hurtMs = Math.max(this.hurtMs, 60);
        this.heartK = Math.max(0, this.heartK - dtMs / HEART_UP_MS);
        this.heartFrame = HEART_POSE.closed;
        if (this.phase === 2 && this.lastActMs < WASPS_AT_MS && this.actMs >= WASPS_AT_MS) this.callWasps();
        if (this.actMs >= RAGE_MS) this.go('drift');
        break;
      default:
        break;
    }
  }

  private startAttack(): void {
    if (this.phase === 1) {
      this.go('slam');
      this.slamIdx = 0;
      this.startSlam();
    } else if (this.phase === 2) {
      this.go('sweep');
      this.startSweep();
    } else {
      this.go('dive');
      this.diveFromY = this.y;
      this.scene.playSfx('whaleCry', 0.7);
    }
  }

  /** Fin de l'attaque : spores annoncées autour de Kaï, puis le cœur descend. */
  private endAttack(): void {
    this.endTentacle();
    this.slamMark.setVisible(false);
    this.diveShadow.setVisible(false);
    this.startSpores();
    this.go('heart');
    this.heartsOpened++;
  }

  // ---------------------------------------------------------------- Tentacules abattus (phase 1)

  private startSlam(): void {
    this.next(0);
    const kx = this.scene.player.x;
    this.targetX = Math.min(this.spot.right - 30, Math.max(this.spot.left + 30, kx));
    this.useTentacle('slam', this.nearestTentacle(this.targetX));
    this.atkSide = this.targetX >= this.anchor.x ? 1 : -1;
    this.slamMark.setPosition(this.targetX, this.groundY).setVisible(true).setScale(0.5, 1).setAlpha(0.35);
  }

  private updateSlam(): void {
    const a = this.anchor;
    const side = this.atkSide;
    // Bout levé près du corps (annonce), point d'impact au sol.
    const rx = a.x + side * 26;
    const ry = a.y + 46 + Math.sin(this.clock * 0.02) * 4;
    const gx = this.targetX;
    const gy = this.groundY - 14;
    switch (this.sub) {
      case 0: {
        const u = Math.min(1, this.subMs / SLAM_WARN_MS);
        this.setTentacle(rx, ry, a.x + side * 50, a.y + 10);
        const blink = u > 0.7 && Math.floor(this.subMs / 70) % 2 === 1;
        this.slamMark.setScale(0.5 + 0.5 * u, 1).setAlpha(blink ? 0.3 : 0.35 + 0.45 * u);
        if (u >= 1) {
          this.next(1);
          this.atkHurting = true;
          this.tipFrom.x = rx;
          this.tipFrom.y = ry;
          this.scene.playSfx('boost', 0.6, 0.5);
        }
        break;
      }
      case 1: {
        const u = Math.min(1, this.subMs / SLAM_STRIKE_MS);
        const e = u * u;
        this.atkHurting = true;
        this.setTentacle(this.tipFrom.x + (gx - this.tipFrom.x) * e, this.tipFrom.y + (gy - this.tipFrom.y) * e, (a.x + gx) / 2 + side * 30, (a.y + gy) / 2);
        if (u >= 1) {
          this.next(2);
          this.slams++;
          const scene = this.scene;
          scene.fx.puff(gx, this.groundY, 4);
          scene.fx.shake(0.45, 180);
          scene.playSfx('stomp', 0.9, 0.55);
          scene.vibrate(25);
        }
        break;
      }
      case 2:
        this.atkHurting = true;
        this.setTentacle(gx + Math.sin(this.clock * 0.03) * 2, gy, (a.x + gx) / 2 + side * 30, (a.y + gy) / 2);
        this.slamMark.setAlpha(Math.max(0, 0.8 * (1 - this.subMs / SLAM_HOLD_MS)));
        if (this.subMs >= SLAM_HOLD_MS) {
          this.next(3);
          this.atkHurting = false;
          this.slamMark.setVisible(false);
        }
        break;
      case 3: {
        const u = Math.min(1, this.subMs / SLAM_BACK_MS);
        const e = easeOut(u);
        this.setTentacle(gx + (rx - gx) * e, gy + (ry - gy) * e, (a.x + gx) / 2 + side * 30 * (1 - e), (a.y + gy) / 2);
        if (u >= 1) {
          this.endTentacle();
          this.next(4);
        }
        break;
      }
      default:
        if (this.subMs < SLAM_GAP_MS) break;
        this.slamIdx++;
        if (this.slamIdx < SLAMS) this.startSlam();
        else this.endAttack();
        break;
    }
  }

  // ---------------------------------------------------------------- Balayage (phase 2)

  private startSweep(): void {
    // Départ contre la borne la plus loin de Kaï (il le voit venir), tentacule le plus proche de ce côté.
    const mid = (this.spot.left + this.spot.right) / 2;
    const fromLeft = this.scene.player.x >= mid;
    const from = fromLeft ? this.spot.left + 30 : this.spot.right - 30;
    this.sweepTo = fromLeft ? this.spot.right - 30 : this.spot.left + 30;
    this.useTentacle('sweep', fromLeft ? 0 : WHALE_BOSS.tentacles.length - 1);
    this.tipFrom.x = this.anchor.x;
    this.tipFrom.y = this.anchor.y + REST_SEGS * SEG;
    this.targetX = from;
  }

  private updateSweep(dt: number): void {
    const a = this.anchor;
    const ty = this.groundY - SWEEP_H;
    switch (this.sub) {
      case 0: {
        // Le bout descend à mi-hauteur contre la borne, et luit.
        const u = Math.min(1, this.subMs / SWEEP_WARN_MS);
        const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        this.sweepTip(this.tipFrom.x + (this.targetX - this.tipFrom.x) * e, this.tipFrom.y + (ty - this.tipFrom.y) * e);
        if (Math.floor(this.actMs / 150) !== Math.floor(this.lastActMs / 150)) this.scene.fx.spark(this.tip.x, this.tip.y, CORE_MAGENTA, 3);
        if (u >= 1) {
          this.next(1);
          this.atkHurting = true;
          this.scene.playSfx('boost', 0.8, 0.45);
        }
        break;
      }
      case 1: {
        this.atkHurting = true;
        const dir = this.sweepTo > this.tip.x ? 1 : -1;
        const x = this.tip.x + dir * SWEEP_SPEED * dt;
        const done = dir > 0 ? x >= this.sweepTo : x <= this.sweepTo;
        this.sweepTip(done ? this.sweepTo : x, ty + Math.sin(this.subMs * 0.02) * 3);
        if (done) {
          this.next(2);
          this.atkHurting = false;
          this.sweeps++;
          this.tipFrom.x = this.tip.x;
          this.tipFrom.y = this.tip.y;
        }
        break;
      }
      default: {
        const u = Math.min(1, this.subMs / SWEEP_BACK_MS);
        const e = u * u;
        const rx = a.x;
        const ry = a.y + REST_SEGS * SEG;
        this.sweepTip(this.tipFrom.x + (rx - this.tipFrom.x) * e, this.tipFrom.y + (ry - this.tipFrom.y) * e);
        if (u >= 1) this.endAttack();
        break;
      }
    }
  }

  /** Tentacule du balayage : il descend du corps et file à l'horizontale vers son bout. */
  private sweepTip(x: number, y: number): void {
    const a = this.anchor;
    this.setTentacle(x, y, x + (a.x - x) * 0.4, y);
  }

  // ---------------------------------------------------------------- Plongée (phase 3)

  private updateDive(dt: number): void {
    const low = this.groundY - DIVE_H;
    const raised = this.hoverY - DIVE_RAISE;
    const sh = this.diveShadow;
    switch (this.sub) {
      case 0: {
        // Elle se ramasse en suivant Kaï, puis se fige ; son ombre grandit au sol, et clignote juste avant.
        const u = Math.min(1, this.subMs / DIVE_WARN_MS);
        if (this.subMs < DIVE_AIM_MS) this.follow(dt, 260);
        this.y = this.diveFromY + (raised - this.diveFromY) * easeOut(u);
        this.jitter = Math.sin(this.clock * 0.09) * 3 * u;
        const blink = u > 0.75 && Math.floor(this.subMs / 70) % 2 === 1;
        sh.setVisible(true).setPosition(this.x + BODY_MID, this.groundY).setScale(0.3 + 0.7 * u, 1).setAlpha(blink ? 0.25 : 0.25 + 0.5 * u);
        if (u >= 1) this.next(1);
        break;
      }
      case 1: {
        const u = Math.min(1, this.subMs / DIVE_DOWN_MS);
        this.y = raised + (low - raised) * u * u;
        if (u >= 1) {
          this.next(2);
          this.dives++;
          const scene = this.scene;
          scene.fx.shake(1, 420);
          scene.playSfx('quake');
          scene.playSfx('crash', 0.6, 0.7);
          scene.vibrate([60, 40, 80]);
          scene.fx.puff(this.x - 150, this.groundY, 4);
          scene.fx.puff(this.x + BODY_MID, this.groundY, 5);
          scene.fx.puff(this.x + 170, this.groundY, 4);
        }
        break;
      }
      case 2:
        this.y = low + Math.sin(this.clock * 0.07) * 2;
        sh.setAlpha(0.75 * (1 - this.subMs / DIVE_GROUND_MS));
        if (this.subMs >= DIVE_GROUND_MS) {
          this.next(3);
          sh.setVisible(false);
        }
        break;
      default: {
        const u = Math.min(1, this.subMs / DIVE_UP_MS);
        this.y = low + (this.hoverY - low) * easeOut(u);
        if (u >= 1) this.endAttack();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Cœur

  private updateHeart(): void {
    switch (this.sub) {
      case 0: {
        const u = Math.min(1, this.subMs / HEART_DOWN_MS);
        this.heartK = easeOut(u);
        this.heartFrame = HEART_POSE.closed;
        if (u >= 1) {
          this.next(1);
          this.shut = false;
          this.heartFrame = HEART_POSE.opening;
          this.scene.playSfx('gate', 0.5, 0.7);
        }
        break;
      }
      case 1: {
        this.heartK = 1;
        const t = this.subMs - HEART_OPENING_MS;
        const open = HEART_POSE.open;
        this.heartFrame = t < 0 ? HEART_POSE.opening : open[Math.floor(t / HEART_BEAT_MS) % open.length];
        if (this.subMs >= HEART_OPEN_MS[this.pi]) this.next(2);
        break;
      }
      case 2:
        this.heartFrame = this.subMs < HEART_CLOSE_MS ? HEART_POSE.opening : HEART_POSE.closed;
        if (this.subMs >= HEART_CLOSE_MS) this.next(3);
        break;
      default: {
        const u = Math.min(1, this.subMs / HEART_UP_MS);
        this.heartFrame = HEART_POSE.closed;
        this.heartK = 1 - u * u;
        if (u >= 1) {
          this.heartK = 0;
          this.shut = false;
          this.go('drift');
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Touches, phases, défaite

  /** Touches directes (tir sur le cœur ouvert, aide de test) : cœur refermé ; renvoie les touches prises. */
  takeDamage(n: number): number {
    const k = Math.min(this.life, Math.floor(n));
    const scene = this.scene;
    if (this.state !== 'fight' || !(k >= 1) || scene.state !== 'play') return 0;
    this.life -= k;
    this.touchAt = scene.clockMs;
    this.hurtMs = HURT_MS;
    this.flashMs = FLASH_MS;
    this.heartGlow.setVisible(this.heart.visible);
    if (scene.clockMs - this.lastHitSfx >= SFX_GAP_MS) {
      this.lastHitSfx = scene.clockMs;
      scene.playSfx('bossHit');
    }
    scene.fx.burst(this.heart.x, this.heart.y + WHALE_HEART.cy, CORE_MAGENTA, 10);
    const phase = Math.min(PHASES, Math.floor((MAX_LIFE - this.life) / PER_PHASE) + 1);
    if (this.life <= 0) this.defeat();
    else if (phase > this.phase) this.enterRage(phase);
    else if (this.act === 'heart' && this.sub <= 1) {
      // Cœur refermé : il remonte.
      this.shut = true;
      this.next(2);
    }
    // Les coups arrivent après update() (tirs) : images recalées avant le rendu de cette image.
    this.place();
    return k;
  }

  private enterRage(phase: number): void {
    const from = this.phase;
    this.phase = phase;
    this.shut = true;
    this.endTentacle();
    this.slamMark.setVisible(false);
    this.diveShadow.setVisible(false);
    // Plongée interrompue : elle remonte pendant la colère.
    if (this.act === 'dive') this.y = Math.min(this.y, this.hoverY);
    this.go('rage');
    const scene = this.scene;
    scene.setMusicLevel(phase - 1);
    scene.playSfx('whaleCry');
    scene.playSfx('bossPhase');
    scene.fx.shake(0.8, 400);
    scene.vibrate([40, 40, 60]);
    scene.fx.burst(this.x, this.y, VOID_GREY, 16);
    scene.fx.burst(this.heart.x, this.heart.y + WHALE_HEART.cy, CORE_MAGENTA, 10);
    if (from < 2 && phase > 2) this.callWasps();
  }

  private callWasps(): void {
    const scene = this.scene;
    const kx = scene.player.x;
    for (let i = 0; i < WHALE_WASPS; i++) {
      const x = i % 2 === 0 ? this.spot.left + WASP_X : this.spot.right - WASP_X;
      const y = this.groundY - WASP_H;
      if (!scene.enemies.summonFlyer(x, y, x < kx ? 1 : -1)) continue;
      this.waspsCalled++;
      scene.fx.burst(x, y, VOID_GREY, 8);
    }
  }

  private defeat(): void {
    // Vaincue pendant son arrivée (aides de test) : à sa hauteur, sa défaite se joue dans la vue.
    if (this.act === 'intro') this.y = this.hoverY;
    this.life = 0;
    this.state = 'beaten';
    this.go('none');
    this.endTentacle();
    this.clearSpores();
    this.slamMark.setVisible(false);
    this.diveShadow.setVisible(false);
    this.heart.setVisible(false);
    this.heartGlow.setVisible(false);
    for (const c of this.cord) c.setVisible(false);
    this.hurtMs = 0;
    this.fadeAlpha = 1;
    this.riseV = 0;
    // Plongée interrompue : immobile là où elle est, au-dessus du sol.
    this.y = Math.min(this.y, this.hoverY);
    this.defeatY = this.y;
    const scene = this.scene;
    scene.playSfx('bossDefeat');
    scene.playSfx('whaleCry');
    scene.vibrate([60, 40, 120]);
    scene.fx.shake(1, 500);
    scene.fx.burst(this.x, this.y, VOID_GREY, 22);
    scene.fx.burst(this.x, this.y, 0xbff8ff, 12);
    scene.onBossBeaten();
  }

  /** Vaincue : immobile, elle tremble et crie, puis s'élève en pâlissant, encore grise. */
  private updateDefeat(dt: number, dtMs: number): void {
    this.lastActMs = this.actMs;
    this.actMs += dtMs;
    if (Math.floor(this.actMs / 150) !== Math.floor(this.lastActMs / 150)) {
      this.scene.fx.burst(this.x + Math.sin(this.actMs) * 160, this.y + 40, VOID_GREY, 4);
    }
    if (this.actMs < DEFEAT_STILL_MS) {
      const u = this.actMs / DEFEAT_STILL_MS;
      this.y = this.defeatY + DEFEAT_SAG * easeOut(u);
      this.jitter = Math.sin(this.clock * 0.1) * 2 * (1 - u);
      return;
    }
    this.riseV = Math.min(DEFEAT_RISE_V, this.riseV + 300 * dt);
    this.y -= this.riseV * dt;
    const t = this.actMs - (DEFEAT_MS - DEFEAT_FADE_MS);
    if (t > 0) this.fadeAlpha = Math.max(0, 1 - t / (2 * DEFEAT_FADE_MS));
    if (this.fadeAlpha <= 0 || this.y < -WHALE_BOSS.h) {
      this.state = 'gone';
      this.showAll(false);
    }
  }

  // ---------------------------------------------------------------- Spores

  private startSpores(): void {
    this.sporesLeft = SPORE_COUNT[this.pi];
    this.sporeN = 0;
    this.sporeNextMs = 0;
    this.sporeBaseX = this.scene.player.x;
  }

  private updateSpores(dtMs: number): void {
    if (this.sporesLeft > 0 && this.state === 'fight') {
      this.sporeNextMs -= dtMs;
      if (this.sporeNextMs <= 0) {
        this.sporeNextMs += SPORE_STAGGER_MS;
        this.sporesLeft--;
        this.announceSpore(this.sporeN++);
      }
    }
    const w = SPOT.frames.warn as readonly number[];
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.on) continue;
      s.ms += dtMs;
      if (!s.dropped && s.ms >= SPORE_WARN_MS) this.dropSpore(s);
      if (s.dropped && s.ms >= SPORE_WARN_MS + s.holdMs) {
        s.on = false;
        s.img.setVisible(false);
        continue;
      }
      const f = w[Math.min(w.length - 1, Math.floor((s.ms / SPORE_WARN_MS) * w.length))];
      if (f !== s.frame) {
        s.frame = f;
        s.img.setFrame(f);
      }
      s.img.setAlpha(0.65 + 0.35 * Math.sin(s.ms * 0.02));
    }
  }

  private announceSpore(n: number): void {
    const x = Math.min(this.spot.right - 40, Math.max(this.spot.left + 40, this.sporeBaseX + SPORE_OFFSETS[n % SPORE_OFFSETS.length]));
    let free: Spot | null = null;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (s.on && Math.abs(s.x - x) < SPORE_MIN_GAP) return;
      if (!s.on && !free) free = s;
    }
    if (!free) return;
    free.on = true;
    free.ms = 0;
    free.dropped = false;
    free.holdMs = 0;
    free.x = x;
    free.floor = this.floorAt(x);
    free.frame = -1;
    free.img.setPosition(x, free.floor - 2).setVisible(true);
    this.spotsShown++;
  }

  /** Dessus du premier sol plein sous x (champignon compris ; les passerelles laissent passer les spores). */
  private floorAt(x: number): number {
    const g = this.scene.grid;
    for (let y = TILE / 2; y < this.groundY + TILE; y += TILE) if (g.solidAtPx(x, y)) return y - TILE / 2;
    return this.groundY;
  }

  private dropSpore(s: Spot): void {
    const scene = this.scene;
    s.dropped = true;
    const y0 = scene.cameras.main.worldView.y - SPORE_ABOVE;
    scene.spores.drop(s.x, y0);
    scene.playSfx('sporeDrop', 0.8);
    this.sporesDropped++;
    // Temps de chute (SporePool.drop) : la tache reste jusqu'à l'impact.
    const d = Math.max(0, s.floor - y0);
    const v = SPORE_DROP_VY;
    s.holdMs = ((-v + Math.sqrt(v * v + 2 * SPORE_GRAVITY * d)) / SPORE_GRAVITY) * 1000;
  }

  private clearSpores(): void {
    this.sporesLeft = 0;
    for (let i = 0; i < this.spots.length; i++) {
      this.spots[i].on = false;
      this.spots[i].img.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- Tentacule d'attaque

  private nearestTentacle(x: number): number {
    const t = WHALE_BOSS.tentacles;
    let best = 0;
    for (let k = 1; k < t.length; k++) if (Math.abs(this.x + t[k].x - x) < Math.abs(this.x + t[best].x - x)) best = k;
    return best;
  }

  private useTentacle(kind: Attack, k: number): void {
    this.atk = kind;
    this.atkK = k;
    this.atkHurting = false;
    this.updateAnchor();
  }

  private updateAnchor(): void {
    if (this.atkK < 0) return;
    const t = WHALE_BOSS.tentacles[this.atkK];
    this.anchor.x = this.x + t.x;
    this.anchor.y = this.y + t.y + 8;
  }

  private endTentacle(): void {
    this.atk = 'none';
    this.atkK = -1;
    this.atkHurting = false;
    this.atkShown = 0;
    for (let i = 0; i < this.atkParts.length; i++) this.atkParts[i].setVisible(false);
  }

  /** Bout et point de contrôle (courbe du corps au bout), placés par place(). */
  private setTentacle(tx: number, ty: number, cx: number, cy: number): void {
    this.tip.x = tx;
    this.tip.y = ty;
    this.ctrl.x = cx;
    this.ctrl.y = cy;
  }

  // ---------------------------------------------------------------- Tirs et contacts

  hitBy(x: number, y: number): number {
    if (this.state !== 'fight' && this.state !== 'beaten') return -1;
    const grace = this.scene.clockMs - this.touchAt < TOUCH_GRACE_MS;
    if (this.heart.visible) {
      // Cœur : devant le corps pour les tirs venus d'en dessous. Ouvert, il est vulnérable en entier (pendant son
      // ouverture, le bouton qui s'écarte dépasse sous le point faible de l'image).
      const hb = HEART.boxes[this.heartFrame];
      const rx = x - this.heart.x;
      const ry = y - this.heart.y;
      const weak = inside(hb.weak, rx, ry, WEAK_PAD);
      if (weak || inside(hb.armor, rx, ry, 0)) {
        if (this.open) return this.takeDamage(1) > 0 ? 1 : 0;
        if (grace) return 1;
        this.armorSfx();
        return 0;
      }
    }
    // Corps insensible : il arrête le tir sans effet.
    if (!inside(BODY.boxes[this.bodyFrame].armor, x - this.x, y - this.y, 0)) return -1;
    if (grace) return 1;
    this.armorSfx();
    return 0;
  }

  private armorSfx(): void {
    const now = this.scene.clockMs;
    if (now - this.lastArmorSfx < SFX_GAP_MS * 2) return;
    this.lastArmorSfx = now;
    this.scene.playSfx('bossArmor', 0.6);
  }

  /**
   * Tentacule qui frappe, et tout le corps pendant la plongée ; pas pendant son arrivée. Hors plongée, le corps est
   * inoffensif : un saut depuis une passerelle ou un rebond de champignon sous elle l'atteint.
   */
  hurts(p: Player): number {
    if (this.state !== 'fight' || this.act === 'intro') return Number.NaN;
    const l = p.left + 3;
    const r = p.right - 3;
    const t = p.top + 4;
    const b = p.feetY;
    if (this.atkHurting) {
      const n = this.atkShown;
      const from = this.atk === 'sweep' ? n - SWEEP_HURT_SEGS : 2;
      for (let i = Math.max(0, from); i < n; i++) {
        const s = this.atkParts[i];
        const cx = Math.max(l, Math.min(s.x, r));
        const cy = Math.max(t, Math.min(s.y, b));
        const dx = s.x - cx;
        const dy = s.y - cy;
        if (dx * dx + dy * dy <= SEG_R * SEG_R) return s.x;
      }
    }
    if (this.act !== 'dive' || this.sub < 1) return Number.NaN;
    const lo = l - this.x;
    const hi = r - this.x;
    const ty = t - this.y;
    const by = b - this.y;
    for (let i = 0; i < DIVE_BOXES.length; i++) {
      const h = DIVE_BOXES[i];
      if (hi > h.x && lo < h.x + h.w && by > h.y && ty < h.y + h.h) return this.x;
    }
    return Number.NaN;
  }

  // ---------------------------------------------------------------- Affichage

  private showAll(on: boolean): void {
    this.body.setVisible(on).setAlpha(1);
    this.heart.setVisible(on);
    this.heartGlow.setVisible(false);
    for (const c of this.rest) for (const img of c) img.setVisible(on).setAlpha(1);
    for (const c of this.cord) c.setVisible(false);
    this.slamMark.setVisible(false);
    this.diveShadow.setVisible(false);
    if (!on) this.endTentacle();
  }

  private place(): void {
    const x = this.x + this.jitter;
    const y = this.y;
    const beaten = this.state === 'beaten';
    this.bodyFrame = beaten ? WHALE_POSE.defeat : this.hurtMs > 0 ? WHALE_POSE.hurt : WHALE_POSE.idle;
    const body = this.body;
    body.setPosition(x, y);
    if (this.bodyFrame !== this.shownBody) {
      this.shownBody = this.bodyFrame;
      body.setFrame(this.bodyFrame);
    }
    body.alpha = this.fadeAlpha;
    this.updateAnchor();
    // Tentacules au repos (celui de l'attaque remplacé), balancés comme ceux du décor ; mous une fois vaincue.
    const t = this.clock / 1000;
    const amp = beaten ? 0.3 : 1;
    const tents = WHALE_BOSS.tentacles;
    // Près du sol (plongée), les tentacules se tassent : jamais sous le sol.
    const room = this.groundY - 10 - (y + tents[0].y + 8);
    const gap = Math.max(3, Math.min(SEG, room / REST_SEGS));
    for (let k = 0; k < this.rest.length; k++) {
      const chain = this.rest[k];
      const hide = k === this.atkK;
      const bx = x + tents[k].x;
      const by = y + tents[k].y + 8;
      for (let j = 0; j < chain.length; j++) {
        const img = chain[j];
        if (img.visible === hide) img.setVisible(!hide);
        if (hide) continue;
        const ph = t * 1.25 + k * 0.85 - j * 0.3;
        img.setPosition(bx + amp * (Math.sin(ph) * (1.5 + j * 1.6) + j * j * 0.15), by + j * gap + amp * Math.sin(ph * 0.7) * 1.5);
        img.alpha = beaten ? 0.75 * this.fadeAlpha : 1;
      }
    }
    if (!beaten) this.placeHeart(x, y);
    this.placeAttack();
  }

  private placeHeart(x: number, y: number): void {
    const ax = x + WHALE_BOSS.heart.x;
    const ay = y + WHALE_BOSS.heart.y;
    // Rentré, il reste derrière le corps quand elle plonge (jamais sous le sol).
    const tuck = Math.min(ay - HEART_TUCK, this.groundY - HEART_TUCK - WHALE_HEART.h);
    const low = this.groundY - HEART_LOW_H - WHALE_HEART.cy;
    const top = tuck + (low - tuck) * this.heartK;
    const h = this.heart;
    h.setPosition(ax, top);
    if (this.heartFrame !== this.shownHeart) {
      this.shownHeart = this.heartFrame;
      h.setFrame(this.heartFrame);
    }
    const n = Math.max(0, Math.min(CORD_LINKS, Math.floor((top - ay - 4) / CORD_GAP)));
    for (let i = 0; i < this.cord.length; i++) {
      const c = this.cord[i];
      const on = i < n;
      if (c.visible !== on) c.setVisible(on);
      if (on) c.setPosition(ax, ay + 6 + i * CORD_GAP);
    }
    const g = this.heartGlow;
    if (g.visible) {
      g.setPosition(h.x, h.y);
      if (g.frame.name !== h.frame.name) g.setFrame(this.heartFrame);
    }
  }

  /** Tentacule d'attaque : courbe du corps (ancre) au bout, par son point de contrôle ; images au pas de SEG. */
  private placeAttack(): void {
    const parts = this.atkParts;
    if (this.atk === 'none') return;
    const a = this.anchor;
    const c = this.ctrl;
    const p = this.tip;
    const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(p.x - c.x, p.y - c.y);
    const n = Math.max(4, Math.min(parts.length, Math.ceil(len / (SEG - 2)) + 1));
    this.atkShown = n;
    for (let i = 0; i < parts.length; i++) {
      const img = parts[i];
      if (i >= n) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const u = (i + 1) / n;
      const v = 1 - u;
      img.setPosition(v * v * a.x + 2 * v * u * c.x + u * u * p.x, v * v * a.y + 2 * v * u * c.y + u * u * p.y);
      const tipFrame = i === n - 1 ? TENTACLE_POSE.tip : TENTACLE_POSE.segment;
      if (+img.frame.name !== tipFrame) img.setFrame(tipFrame);
      img.setScale(1 - 0.22 * u);
      if (!img.visible) img.setVisible(true);
    }
  }

  /** État détaillé (aides de test). */
  info(): Record<string, unknown> {
    let spots = 0;
    for (const s of this.spots) if (s.on) spots++;
    return {
      act: this.act,
      sub: this.sub,
      frame: this.bodyFrame,
      heartFrame: this.heartFrame,
      heartK: Math.round(this.heartK * 1000) / 1000,
      heartY: Math.round(this.heart.y + WHALE_HEART.cy),
      heartX: Math.round(this.heart.x),
      open: this.open,
      shut: this.shut,
      skirtY: Math.round(this.y + WHALE_BOSS.skirtBottom),
      groundY: this.groundY,
      hoverY: this.hoverY,
      visible: this.body.visible,
      alpha: Math.round(this.body.alpha * 100) / 100,
      attack: this.atk,
      hurting: this.atkHurting,
      tip: { x: Math.round(this.tip.x), y: Math.round(this.tip.y) },
      slams: this.slams,
      sweeps: this.sweeps,
      dives: this.dives,
      heartsOpened: this.heartsOpened,
      spots,
      spotsShown: this.spotsShown,
      sporesDropped: this.sporesDropped,
      waspsCalled: this.waspsCalled,
      flashing: this.heartGlow.visible,
    };
  }
}
