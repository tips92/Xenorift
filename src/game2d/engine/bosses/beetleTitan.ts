import * as Phaser from 'phaser';
import { BEETLE_POSE, BOSS_SHEETS, ROCK_POSE } from '../../art/draw/bosses';
import type { BossBox, BossFrameBoxes, BossSheet } from '../../art/draw/bosses';
import { DEPTH, TILE } from '../../constants';
import type { PlatformScene } from '../PlatformScene';
import type { Player } from '../Player';
import type { Boss, BossSpot, BossState } from './types';

// Scarabée-titan, mini-boss du niveau 2 (plan 04, point 17) : il gratte le sol tête basse (annonce), puis charge
// vers Kaï jusqu'à une barrière de l'arène (ou le champignon posé devant elle, qui s'écrase), où il s'assomme et
// tombe sur le dos, ventre exposé : seul moment où on peut le toucher, d'un tir (partout : le tir debout atteint le
// dôme retourné sous le ventre) ou d'un saut sur le ventre. Une touche le réveille (point faible refermé : il remue,
// puis se relève). Ailleurs, sa carapace renvoie les tirs. On le saute pendant la charge (rebond sur la carapace, ou
// sur le champignon contre la barrière). Après 2 touches (phase 2) : carapace fendue, plus rapide, et chaque choc
// fait tomber des cailloux d'au-dessus de la vue, annoncés par une marque sur leur point d'arrivée. Vaincu, il
// s'enfuit. Mouvement à la main, sans corps Arcade (sol plat de l'arène).

const NORMAL = BOSS_SHEETS.beetleTitan;
const CRACKED = BOSS_SHEETS.beetleTitanCracked;
const ROCK = BOSS_SHEETS.titanRock;

/** 4 touches (plan 04, point 20), 2 par phase. */
const MAX_LIFE = 4;

// Réglages en ms et px, phase 1 puis phase 2. Un étourdissement = une touche au plus ; cycles ≈ 5 s puis 4 s, plus
// le cri et la colère.
const WALK_SPEED = [80, 110];
const WALK_MS = [900, 500];
/** Il s'arrête de marcher quand son avant arrive à cette distance de Kaï. */
const WALK_NEAR = 170;
/** Annonce de la charge : tête basse, il gratte le sol. */
const WINDUP_MS = [850, 560];
/** Part de l'annonce pendant laquelle il suit Kaï ; ensuite la direction de la charge est prise. */
const WINDUP_AIM = 0.6;
const SCRAPE_MS = 210;
const CHARGE_SPEED = [600, 760];
const CHARGE_ACCEL = 3200;
/** Course minimale d'une charge (px) : moins de place devant lui, il fonce de l'autre côté. */
const MIN_RUN = 128;
/**
 * Assommé sur le dos : la fenêtre de tir. Assez longue pour courir jusqu'à lui après avoir sauté la charge (il
 * s'assomme à l'autre bout : jusqu'à ≈ 2 s de course).
 */
const STUN_MS = [2600, 2200];
/** Fin de l'étourdissement, et après une touche : il remue (il va se relever). */
const WAKE_MS = 450;
const RECOVER_MS = [350, 260];
const INTRO_MS = 1100;
const RAGE_MS = 1300;
/** Colère venue d'un coup sur le dos : il y reste ce temps avant de se relever. */
const RAGE_FLIP_MS = 450;
const FLEE_SHAKE_MS = 650;
const FLASH_MS = 90;
/** Image « tir renvoyé » après un tir sur la carapace (en marche). */
const DEFLECT_MS = 130;
/** Avant (cornes en charge) depuis les pieds : il ne dépasse jamais les butées. */
const FRONT = 119;
/** Marge autour du ventre pour les tirs. */
const WEAK_PAD = 8;
/** Après une touche : les plombs de la même salve (ou tirs rapprochés) sont absorbés, sans seconde touche ni son. */
const TOUCH_GRACE_MS = 120;
/** Écart min entre deux sons de coup (plombs simultanés). */
const SFX_GAP_MS = 70;
const DUST_MS = 70;

// Cailloux (phase 2), à chaque choc : sur Kaï et de part et d'autre, l'un après l'autre ; une marque les annonce sur
// leur point d'arrivée (sol, ou dos du titan s'il est dessous ; le haut de la vue est sous le HUD), puis ils tombent
// d'au-dessus de la vue.
const ROCK_COUNT = 3;
const ROCK_OFFSETS = [0, -190, 190];
const ROCK_MIN_GAP = 96;
const ROCK_STAGGER_MS = 260;
const ROCK_WARN_MS = 850;
/** Caillou affiché agrandi (lisible au téléphone) ; demi-côté de la boîte qui blesse, un peu plus petite que lui. */
const ROCK_SCALE = 1.25;
const ROCK_HALF = 20;
/** Départ de la chute, au-dessus du bord haut de la vue. */
const ROCK_START = 40;
const ROCK_START_VY = 300;
const ROCK_GRAVITY = 2600;
const ROCK_MAX_VY = 1400;

type Act = 'none' | 'intro' | 'walk' | 'windup' | 'charge' | 'stunned' | 'recover' | 'rage';
type RockPhase = 'off' | 'wait' | 'warn' | 'fall';

interface Rock {
  img: Phaser.GameObjects.Image;
  mark: Phaser.GameObjects.Image;
  phase: RockPhase;
  ms: number;
  x: number;
  y: number;
  vy: number;
  /** Dessus du premier sol plein sous lui (sol de l'arène, champignon). */
  floor: number;
}

function inside(boxes: readonly BossBox[], x: number, y: number, pad: number): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return true;
  }
  return false;
}

/** Plus haut des dessus de `boxes` sous [lo, hi] (repère du sprite), sinon Infinity. */
function topOver(boxes: readonly BossBox[], lo: number, hi: number, top: number): number {
  for (let i = 0; i < boxes.length; i++) {
    const h = boxes[i];
    if (hi > h.x && lo < h.x + h.w && h.y < top) top = h.y;
  }
  return top;
}

export class BeetleTitan implements Boss {
  readonly id = 'beetleTitan' as const;
  readonly name = 'Scarabée-titan';
  readonly maxLife = MAX_LIFE;
  readonly phases = 2;
  life = MAX_LIFE;
  phase = 1;
  state: BossState = 'wait';
  x: number;
  y: number;

  private prevY = 0;
  private act: Act = 'none';
  private actMs = 0;
  private lastActMs = 0;
  private clock = 0;
  private facing: 1 | -1 = -1;
  private sheet: BossSheet = NORMAL;
  private frame = 0;
  private shownKey = '';
  private shownFrame = -1;
  /** Décalage affiché (tremblement de l'annonce, de la fuite) et bascule (réveil), sans toucher à x. */
  private jitter = 0;
  private tilt = 0;
  private flashMs = 0;
  private deflectMs = 0;
  private dustMs = 0;
  private speed = 0;
  private scrapes = 0;
  private lastHitSfx = -1e9;
  private lastArmorSfx = -1e9;
  /** Touché pendant cet étourdissement : point faible refermé. */
  private shut = false;
  private touchAt = -1e9;
  private rageFromBack = false;
  private fleeDir = 1;
  private fleeVx = 0;
  // Relevés (tests).
  private charges = 0;
  private stuns = 0;
  private deflects = 0;
  private mushHits = 0;
  private rocksDropped = 0;
  private readonly sprite: Phaser.GameObjects.Sprite;
  /** Clignotement de dégât : copie additive du sprite (aussi en rendu Canvas, où setTintFill est sans effet). */
  private readonly glow: Phaser.GameObjects.Sprite;
  private readonly rocks: Rock[] = [];
  /**
   * Butées de la charge (px) : bord de la première case pleine sur le sol de part et d'autre de sa case (champignon
   * devant la barrière), sinon l'intérieur de l'arène ; colonne du champignon ou -1.
   */
  private readonly stopLeft: number;
  private readonly stopRight: number;
  private readonly mushLeft: number;
  private readonly mushRight: number;
  private readonly floorRow: number;

  constructor(
    private readonly scene: PlatformScene,
    private readonly spot: BossSpot,
  ) {
    this.x = spot.x;
    this.y = spot.feetY;
    this.sprite = scene.add.sprite(spot.x, spot.feetY, NORMAL.key, 0).setOrigin(NORMAL.originX, NORMAL.originY).setDepth(DEPTH.enemies - 1);
    this.glow = scene.add
      .sprite(spot.x, spot.feetY, NORMAL.key, 0)
      .setOrigin(NORMAL.originX, NORMAL.originY)
      .setDepth(DEPTH.enemies - 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.85)
      .setVisible(false);
    for (let i = 0; i < ROCK_COUNT; i++) {
      const img = scene.add
        .image(-500, -500, ROCK.key, ROCK_POSE.rocks[i % 2])
        .setOrigin(ROCK.originX, ROCK.originY)
        .setScale(ROCK_SCALE)
        .setDepth(DEPTH.enemies + 1)
        .setVisible(false);
      // Marque au-dessus du titan (posée sur son dos quand il est dessous), sous Kaï et les cailloux.
      const mark = scene.add.image(-500, -500, ROCK.key, ROCK_POSE.mark).setOrigin(ROCK.originX, ROCK.originY).setDepth(DEPTH.enemies).setVisible(false);
      this.rocks.push({ img, mark, phase: 'off', ms: 0, x: 0, y: 0, vy: 0, floor: 0 });
    }
    const g = scene.grid;
    const m = scene.mushrooms;
    const row = Math.round(spot.feetY / TILE) - 1;
    const c0 = Math.floor(spot.x / TILE);
    let lc = c0;
    while (lc * TILE > spot.left && !g.solidAtPx(lc * TILE - TILE / 2, row * TILE + TILE / 2)) lc--;
    let rc = c0;
    while ((rc + 1) * TILE < spot.right && !g.solidAtPx((rc + 1) * TILE + TILE / 2, row * TILE + TILE / 2)) rc++;
    this.floorRow = row;
    this.stopLeft = lc * TILE;
    this.stopRight = (rc + 1) * TILE;
    this.mushLeft = m && m.at(lc - 1, row) ? lc - 1 : -1;
    this.mushRight = m && m.at(rc + 1, row) ? rc + 1 : -1;
    this.reset();
  }

  // ---------------------------------------------------------------- Cycle de vie

  reset(): void {
    this.life = MAX_LIFE;
    this.phase = 1;
    this.state = 'wait';
    this.act = 'none';
    this.actMs = 0;
    this.facing = -1;
    this.sheet = NORMAL;
    this.frame = BEETLE_POSE.walk[0];
    this.jitter = 0;
    this.tilt = 0;
    this.flashMs = 0;
    this.deflectMs = 0;
    this.speed = 0;
    this.shut = false;
    this.touchAt = -1e9;
    this.x = this.spot.x;
    this.y = this.spot.feetY;
    this.prevY = this.y;
    this.sprite.setVisible(true).setAlpha(1);
    this.glow.setVisible(false);
    this.clearRocks();
    this.place();
  }

  start(): void {
    if (this.state !== 'wait') return;
    this.state = 'fight';
    this.go('intro');
    this.scene.playSfx('bossAppear');
  }

  destroy(): void {
    this.sprite.destroy();
    this.glow.destroy();
    for (const r of this.rocks) {
      r.img.destroy();
      r.mark.destroy();
    }
    this.rocks.length = 0;
  }

  update(dt: number, dtMs: number): void {
    this.clock += dtMs;
    this.prevY = this.y;
    this.jitter = 0;
    this.tilt = 0;
    this.updateRocks(dt, dtMs);
    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      if (this.flashMs <= 0) this.glow.setVisible(false);
    }
    if (this.deflectMs > 0) this.deflectMs -= dtMs;
    if (this.state === 'wait') this.frame = BEETLE_POSE.walk[0];
    else if (this.state === 'fight') this.updateFight(dt, dtMs);
    else if (this.state === 'beaten') this.updateFlee(dt, dtMs);
    this.place();
  }

  // ---------------------------------------------------------------- Combat

  private go(act: Act): void {
    this.act = act;
    this.actMs = 0;
    this.lastActMs = 0;
    this.deflectMs = 0;
  }

  private get pi(): number {
    return this.phase > 1 ? 1 : 0;
  }

  /** Sur le dos et pas encore touché : la fenêtre où une touche compte. */
  private get open(): boolean {
    return this.state === 'fight' && this.act === 'stunned' && !this.shut;
  }

  /** Bornes de x : l'avant (cornes) touche la butée au plus. */
  private get minX(): number {
    return this.stopLeft + FRONT;
  }

  private get maxX(): number {
    return this.stopRight - FRONT;
  }

  private faceKai(): void {
    const kx = this.scene.player.x;
    if (Math.abs(kx - this.x) > 4) this.facing = kx < this.x ? -1 : 1;
  }

  private walkFrame(fps: number): number {
    const w = BEETLE_POSE.walk;
    return w[Math.floor((this.clock * fps) / 1000) % w.length];
  }

  private updateFight(dt: number, dtMs: number): void {
    this.lastActMs = this.actMs;
    this.actMs += dtMs;
    const scene = this.scene;
    const feet = this.spot.feetY;
    switch (this.act) {
      case 'intro':
        // Il piétine sur place, puis baisse la tête et rugit (sans charger).
        this.faceKai();
        if (this.actMs < 700) {
          this.frame = this.walkFrame(10);
          if (this.everyMs(230)) scene.fx.puff(this.x - this.facing * 70, feet, 2);
        } else {
          this.frame = BEETLE_POSE.charge;
          this.jitter = Math.sin(this.clock * 0.09) * 2;
          if (this.lastActMs < 700) scene.fx.shake(0.4, 220);
        }
        if (this.actMs >= INTRO_MS) this.go('walk');
        break;
      case 'walk': {
        this.faceKai();
        const kx = scene.player.x;
        const gap = Math.abs(kx - this.x) - FRONT;
        if (gap > WALK_NEAR) this.x = Math.min(this.maxX, Math.max(this.minX, this.x + this.facing * WALK_SPEED[this.pi] * dt));
        this.frame = gap > WALK_NEAR ? this.walkFrame(8) : BEETLE_POSE.walk[0];
        if (this.actMs >= WALK_MS[this.pi] || gap <= WALK_NEAR) this.startWindup();
        break;
      }
      case 'windup': {
        // Tête basse, il gratte le sol de ses pattes arrière : raclement et poussière.
        if (this.actMs < WINDUP_MS[this.pi] * WINDUP_AIM) this.faceKai();
        this.frame = BEETLE_POSE.charge;
        this.jitter = Math.sin(this.clock * 0.11) * 2.5;
        if (this.everyMs(SCRAPE_MS)) {
          this.scrapes++;
          scene.fx.puff(this.x - this.facing * 95, feet, 2);
          scene.playSfx('stomp', 0.5, 0.55);
        }
        if (this.actMs >= WINDUP_MS[this.pi]) this.startCharge();
        break;
      }
      case 'charge': {
        const top = CHARGE_SPEED[this.pi];
        this.speed = Math.min(top, this.speed + CHARGE_ACCEL * dt);
        this.x += this.facing * this.speed * dt;
        this.frame = BEETLE_POSE.charge;
        this.dustMs += dtMs;
        if (this.dustMs >= DUST_MS) {
          this.dustMs -= DUST_MS;
          scene.fx.puff(this.x - this.facing * 90, feet, 1);
        }
        if (this.x <= this.minX || this.x >= this.maxX) this.impact();
        break;
      }
      case 'stunned': {
        this.frame = BEETLE_POSE.stunned;
        const left = STUN_MS[this.pi] - this.actMs;
        // Réveil annoncé : il se balance sur sa carapace.
        if (left < WAKE_MS) this.tilt = Math.sin(this.clock * 0.05) * 5 * (1 - left / WAKE_MS);
        if (left <= 0) {
          this.faceKai();
          this.go('recover');
          scene.fx.puff(this.x, feet, 3);
        }
        break;
      }
      case 'recover': {
        // Il se remet sur ses pattes d'un bond.
        const u = Math.min(1, this.actMs / RECOVER_MS[this.pi]);
        this.frame = BEETLE_POSE.walk[0];
        this.y = feet - 34 * Math.sin(Math.PI * u);
        if (u >= 1) {
          this.y = feet;
          this.go('walk');
        }
        break;
      }
      case 'rage': {
        // Carapace fendue : d'abord sur le dos s'il y était, puis debout, tête basse et tête haute en rugissant.
        const back = this.rageFromBack ? RAGE_FLIP_MS : 0;
        if (this.actMs < back) {
          this.frame = BEETLE_POSE.stunned;
          this.tilt = Math.sin(this.clock * 0.09) * 6;
        } else {
          const u = Math.min(1, (this.actMs - back) / 260);
          this.y = feet - 40 * Math.sin(Math.PI * u);
          this.frame = Math.floor(this.actMs / 120) % 2 === 0 ? BEETLE_POSE.charge : BEETLE_POSE.walk[0];
          this.jitter = Math.sin(this.clock * 0.12) * 3;
        }
        if (this.actMs >= RAGE_MS) {
          this.y = feet;
          this.faceKai();
          this.go('walk');
        }
        break;
      }
      default:
        break;
    }
  }

  /** Vrai à chaque multiple de `ms` franchi par actMs pendant cette image. */
  private everyMs(ms: number): boolean {
    return Math.floor(this.actMs / ms) !== Math.floor(this.lastActMs / ms);
  }

  private startWindup(): void {
    this.faceKai();
    this.go('windup');
    this.frame = BEETLE_POSE.charge;
    this.scrapes = 0;
  }

  private startCharge(): void {
    // Kaï au-dessus de lui, côté barrière : pas de charge sur place, il fonce vers l'autre.
    const room = this.facing > 0 ? this.maxX - this.x : this.x - this.minX;
    if (room < MIN_RUN) this.facing = this.facing > 0 ? -1 : 1;
    this.go('charge');
    this.speed = 0;
    this.dustMs = 0;
    this.charges++;
    this.scene.playSfx('boost', 0.75, 0.6);
    this.scene.fx.puff(this.x - this.facing * 90, this.spot.feetY, 4);
  }

  /** Cornes contre la butée (barrière, ou champignon qui s'écrase) : sonné, sur le dos ; en phase 2, des cailloux. */
  private impact(): void {
    this.x = Math.min(this.maxX, Math.max(this.minX, this.x));
    this.speed = 0;
    this.go('stunned');
    this.shut = false;
    this.stuns++;
    this.frame = BEETLE_POSE.stunned;
    const scene = this.scene;
    const feet = this.spot.feetY;
    const wall = this.facing > 0 ? this.stopRight : this.stopLeft;
    const mush = this.facing > 0 ? this.mushRight : this.mushLeft;
    if (mush >= 0 && scene.mushrooms) {
      scene.mushrooms.squash(mush, this.floorRow);
      this.mushHits++;
    }
    scene.playSfx('crash', 0.8, 0.85);
    scene.playSfx('quake', 0.7);
    scene.fx.shake(0.9, 320);
    scene.vibrate(50);
    scene.fx.burst(wall, feet - 90, 0x8ffcff, 14);
    scene.fx.puff(this.x, feet, 5);
    if (this.phase > 1) this.dropRocks();
  }

  private enterRage(): void {
    this.phase = 2;
    this.sheet = CRACKED;
    this.rageFromBack = this.act === 'stunned';
    if (!this.rageFromBack) this.y = this.spot.feetY;
    this.go('rage');
    const scene = this.scene;
    scene.playSfx('bossPhase');
    scene.fx.shake(0.8, 300);
    scene.vibrate([40, 40, 60]);
    // Éclats de carapace et lumière magenta des fissures.
    scene.fx.burst(this.x, this.y - 90, 0x6a3f9a, 16);
    scene.fx.burst(this.x, this.y - 90, 0xff4fd8, 10);
  }

  /** Touches directes (tir ou saut sur le dos, aide de test) : point faible refermé ; renvoie les touches prises. */
  takeDamage(n: number): number {
    const k = Math.min(this.life, Math.floor(n));
    if (this.state !== 'fight' || !(k >= 1)) return 0;
    this.life -= k;
    this.touchAt = this.scene.clockMs;
    this.flashMs = FLASH_MS;
    this.glow.setVisible(true);
    const scene = this.scene;
    if (scene.clockMs - this.lastHitSfx >= SFX_GAP_MS) {
      this.lastHitSfx = scene.clockMs;
      scene.playSfx('bossHit');
    }
    if (this.life <= 0) this.defeat();
    else if (this.phase === 1 && this.life <= MAX_LIFE / 2) this.enterRage();
    else if (this.act === 'stunned') {
      // Il remue un instant sur le dos (insensible), puis se relève.
      this.shut = true;
      this.actMs = Math.max(this.actMs, STUN_MS[this.pi] - WAKE_MS);
      this.lastActMs = this.actMs;
    }
    // Les coups arrivent après update() (tirs, saut) : copie recalée avant le rendu de cette image.
    this.place();
    return k;
  }

  private defeat(): void {
    this.life = 0;
    this.state = 'beaten';
    this.go('none');
    this.clearRocks();
    this.sheet = CRACKED;
    this.frame = BEETLE_POSE.flee;
    this.y = this.spot.feetY;
    this.fleeDir = this.scene.player.x < this.x ? 1 : -1;
    this.fleeVx = 0;
    this.facing = this.fleeDir > 0 ? 1 : -1;
    const scene = this.scene;
    scene.playSfx('bossDefeat');
    scene.vibrate([60, 40, 120]);
    scene.fx.shake(1, 380);
    scene.fx.burst(this.x, this.y - 80, 0x6a3f9a, 22);
    scene.fx.burst(this.x, this.y - 80, 0xff4fd8, 14);
    scene.onBossBeaten();
  }

  /** Vaincu : il tremble, cabré, puis détale loin de Kaï en pâlissant. */
  private updateFlee(dt: number, dtMs: number): void {
    this.actMs += dtMs;
    this.frame = BEETLE_POSE.flee;
    if (this.actMs < FLEE_SHAKE_MS) {
      this.jitter = Math.sin(this.clock * 0.09) * 3;
      return;
    }
    if (this.fleeVx === 0) {
      this.scene.playSfx('boost', 0.6, 0.7);
      this.scene.fx.puff(this.x, this.y, 5);
    }
    this.fleeVx = Math.min(720, this.fleeVx + 2400 * dt);
    this.x += this.fleeDir * this.fleeVx * dt;
    const t = this.actMs - FLEE_SHAKE_MS;
    this.y = this.spot.feetY - Math.abs(Math.sin(t * 0.018)) * 10;
    this.sprite.setAlpha(Math.max(0, 1 - Math.max(0, t - 350) / 450));
    if (t > 800) {
      this.state = 'gone';
      this.sprite.setVisible(false);
      this.glow.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- Cailloux (phase 2)

  private dropRocks(): void {
    const kai = this.scene.player.x;
    const lo = this.spot.left + ROCK_HALF + 10;
    const hi = this.spot.right - ROCK_HALF - 10;
    let n = 0;
    for (let k = 0; k < ROCK_COUNT; k++) {
      const x = Math.min(hi, Math.max(lo, kai + ROCK_OFFSETS[k]));
      let near = false;
      for (let j = 0; j < this.rocks.length; j++) {
        const o = this.rocks[j];
        if (o.phase !== 'off' && Math.abs(o.x - x) < ROCK_MIN_GAP) near = true;
      }
      if (near) continue;
      const r = this.freeRock();
      if (!r) return;
      r.phase = 'wait';
      r.ms = -n * ROCK_STAGGER_MS;
      r.x = x;
      r.vy = 0;
      r.floor = this.surfaceBelow(x);
      n++;
      this.rocksDropped++;
    }
  }

  private freeRock(): Rock | null {
    for (let i = 0; i < this.rocks.length; i++) if (this.rocks[i].phase === 'off') return this.rocks[i];
    return null;
  }

  private updateRocks(dt: number, dtMs: number): void {
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i];
      if (r.phase === 'off') continue;
      r.ms += dtMs;
      if (r.phase === 'wait') {
        if (r.ms < 0) continue;
        r.phase = 'warn';
        r.mark.setVisible(true);
      }
      if (r.phase === 'warn') {
        // Marque sur le point d'arrivée (dos du titan s'il est dessous, il peut bouger), qui s'élargit puis clignote
        // juste avant la chute.
        const u = Math.min(1, r.ms / ROCK_WARN_MS);
        r.mark.setPosition(r.x, this.rockFloor(r) - 2);
        r.mark.setScale(0.6 + 0.6 * u, 1.15).setAlpha(u > 0.7 && Math.floor(r.ms / 70) % 2 === 1 ? 0.45 : 0.5 + 0.5 * u);
        if (r.ms < ROCK_WARN_MS) continue;
        r.phase = 'fall';
        r.vy = ROCK_START_VY;
        r.y = this.scene.cameras.main.worldView.y - ROCK_START;
        r.img.setVisible(true);
      }
      r.vy = Math.min(ROCK_MAX_VY, r.vy + ROCK_GRAVITY * dt);
      r.y += r.vy * dt;
      r.img.setPosition(r.x, r.y).setRotation(r.y * 0.01);
      const land = this.rockFloor(r);
      if (r.y + ROCK_HALF >= land) this.shatter(r, land);
    }
  }

  /** Dessus du premier sol plein de la colonne de x (champignon compris). */
  private surfaceBelow(x: number): number {
    const g = this.scene.grid;
    for (let y = TILE / 2; y < g.rows * TILE; y += TILE) if (g.solidAtPx(x, y)) return y - TILE / 2;
    return this.spot.feetY;
  }

  /** Arrêt d'un caillou : le dessus du titan s'il est dessous, sinon le sol plein noté au départ. */
  private rockFloor(r: Rock): number {
    if (this.state === 'gone') return r.floor;
    const b = this.boxes;
    const a = (r.x - ROCK_HALF - this.x) * this.facing;
    const c = (r.x + ROCK_HALF - this.x) * this.facing;
    let top = topOver(b.armor, Math.min(a, c), Math.max(a, c), Infinity);
    top = topOver(b.weak, Math.min(a, c), Math.max(a, c), top);
    return top === Infinity ? r.floor : Math.min(r.floor, this.y + top);
  }

  private shatter(r: Rock, y: number): void {
    const scene = this.scene;
    scene.fx.puff(r.x, y, 4);
    scene.fx.burst(r.x, y - 10, 0x6a3f9a, 7);
    scene.playSfx('bump', 0.8, 0.6);
    scene.fx.shake(0.25, 120);
    this.hideRock(r);
  }

  private hideRock(r: Rock): void {
    r.phase = 'off';
    r.img.setVisible(false).setRotation(0);
    r.mark.setVisible(false);
  }

  private clearRocks(): void {
    for (let i = 0; i < this.rocks.length; i++) this.hideRock(this.rocks[i]);
  }

  // ---------------------------------------------------------------- Tirs et contacts

  private get boxes(): BossFrameBoxes {
    return this.sheet.boxes[this.frame];
  }

  hitBy(x: number, y: number): number {
    if (this.state === 'gone') return -1;
    const b = this.boxes;
    const rx = (x - this.x) * this.facing;
    const ry = y - this.y;
    const weak = inside(b.weak, rx, ry, WEAK_PAD);
    if (!weak && !inside(b.armor, rx, ry, 0) && !inside(b.hurt, rx, ry, 0)) return -1;
    // Sur le dos, tout le corps compte (le tir debout atteint le dôme retourné, sous le ventre).
    if (this.open) return this.takeDamage(1);
    if (this.scene.clockMs - this.touchAt < TOUCH_GRACE_MS) return 1;
    if (weak) this.armorSfx();
    else this.deflect();
    return 0;
  }

  /** Carapace : le tir est renvoyé (étincelle du ShotPool) ; en marche, image « tir renvoyé ». */
  private deflect(): void {
    this.deflects++;
    this.armorSfx();
    if (this.state === 'fight' && (this.act === 'walk' || this.act === 'intro' || this.act === 'recover')) {
      this.deflectMs = DEFLECT_MS;
      this.place();
    }
  }

  private armorSfx(): void {
    const now = this.scene.clockMs;
    if (now - this.lastArmorSfx < SFX_GAP_MS * 2) return;
    this.lastArmorSfx = now;
    this.scene.playSfx('bossArmor', 0.6);
  }

  hurts(p: Player): number {
    if (this.state !== 'fight') return Number.NaN;
    const l = p.left + 3;
    const r = p.right - 3;
    const t = p.top + 4;
    const bottom = p.feetY;
    for (let i = 0; i < this.rocks.length; i++) {
      const k = this.rocks[i];
      if (k.phase === 'fall' && r > k.x - ROCK_HALF && l < k.x + ROCK_HALF && bottom > k.y - ROCK_HALF && t < k.y + ROCK_HALF) return k.x;
    }
    const hurt = this.boxes.hurt;
    let lo = (l - this.x) * this.facing;
    let hi = (r - this.x) * this.facing;
    if (lo > hi) {
      const s = lo;
      lo = hi;
      hi = s;
    }
    const ty = t - this.y;
    const by = bottom - this.y;
    for (let i = 0; i < hurt.length; i++) {
      const h = hurt[i];
      if (hi > h.x && lo < h.x + h.w && by > h.y && ty < h.y + h.h) return this.x;
    }
    return Number.NaN;
  }

  /**
   * Kaï retombe sur lui : rebond sur la carapace (aussi pendant la charge : on le franchit ainsi) ; sur le dos,
   * retomber sur le ventre est une touche.
   */
  stomp(p: Player): boolean {
    if (this.state !== 'fight' || p.body.velocity.y <= 0) return false;
    const b = this.boxes;
    let lo = (p.left + 3 - this.x) * this.facing;
    let hi = (p.right - 3 - this.x) * this.facing;
    if (lo > hi) {
      const s = lo;
      lo = hi;
      hi = s;
    }
    // Dessus = la plus haute des boîtes sous les pieds de Kaï (ventre, carapace, cornes).
    const weakTop = topOver(b.weak, lo, hi, Infinity);
    let top = topOver(b.hurt, lo, hi, topOver(b.armor, lo, hi, Infinity));
    const onBelly = weakTop <= top && weakTop !== Infinity;
    if (onBelly) top = weakTop;
    if (top === Infinity) return false;
    const y = this.y + top;
    if (p.feetY < y || p.prevBottom > Math.max(y, this.prevY + top) + 12) return false;
    const scene = this.scene;
    const belly = onBelly && this.open;
    // Ventre : toujours le grand rebond (≈ 0,8 s en l'air), loin de son réveil.
    p.bounce(belly || (scene.session ? scene.session.hooks.input.state.jump : false));
    scene.stompGraceMs = 140;
    if (belly) {
      this.takeDamage(1);
      scene.playSfx('stomp');
    } else {
      this.armorSfx();
    }
    return true;
  }

  // ---------------------------------------------------------------- Affichage

  private place(): void {
    const s = this.sprite;
    s.x = this.x + this.jitter;
    s.y = this.y;
    s.flipX = this.facing < 0;
    s.angle = this.tilt * this.facing;
    const frame = this.deflectMs > 0 ? BEETLE_POSE.deflect : this.frame;
    const key = this.sheet.key;
    if (key !== this.shownKey || frame !== this.shownFrame) {
      this.shownKey = key;
      this.shownFrame = frame;
      s.setTexture(key, frame);
    }
    const g = this.glow;
    if (g.visible) {
      g.x = s.x;
      g.y = s.y;
      g.flipX = s.flipX;
      g.angle = s.angle;
      g.alpha = 0.85 * s.alpha;
      if (g.texture.key !== key || g.frame !== s.frame) g.setTexture(key, frame);
    }
  }

  /** État détaillé (aides de test). */
  info(): Record<string, unknown> {
    let rocks = 0;
    let falling = 0;
    for (const r of this.rocks) {
      if (r.phase !== 'off') rocks++;
      if (r.phase === 'fall') falling++;
    }
    return {
      act: this.act,
      frame: this.frame,
      shownFrame: this.shownFrame,
      texture: this.sheet.key,
      facing: this.facing,
      flashing: this.glow.visible,
      visible: this.sprite.visible,
      speed: Math.round(this.speed),
      open: this.open,
      charges: this.charges,
      stuns: this.stuns,
      deflects: this.deflects,
      scrapes: this.scrapes,
      mushHits: this.mushHits,
      stops: [this.stopLeft, this.stopRight],
      rocks,
      falling,
      rocksDropped: this.rocksDropped,
    };
  }
}
