import * as Phaser from 'phaser';
import { BLOB_POSE, BLOB_WAVE, BOSS_SHEETS } from '../../art/draw/bosses';
import type { BossBox, BossFrameBoxes, BossSheet } from '../../art/draw/bosses';
import { DEPTH, TILE } from '../../constants';
import type { PlatformScene } from '../PlatformScene';
import type { Player } from '../Player';
import type { Boss, BossSpot, BossState } from './types';

// Blob-roi, mini-boss du niveau 1 (plan 04, point 17) : il bondit vers Kaï ; à l'atterrissage, deux ondes filent au
// ras du sol (à sauter) et il reste aplati, noyau exposé : seul moment où on peut le toucher, d'un tir ou d'un saut
// sur le noyau (ailleurs, la gelée arrête les tirs). Une touche referme le noyau : il se relève. Après 2 touches
// (phase 2) : plus vif, il appelle 2 petits blobs (marcheurs de réserve, hors score). Vaincu, il s'enfuit d'un
// grand bond. Mouvement à la main (sol plat de l'arène), sans corps Arcade.

const NORMAL = BOSS_SHEETS.blobKing;
const RAGE = BOSS_SHEETS.blobKingRage;
const WAVE = BOSS_SHEETS.blobWave;

/** 4 touches (plan 04, point 20), 2 par phase. */
const MAX_LIFE = 4;
/** Petits blobs appelés en phase 2 (marcheurs créés cachés au chargement : EnemyManager). */
export const BLOB_KING_MINIONS = 2;

// Réglages en ms et px, phase 1 puis phase 2. Une fenêtre (noyau aplati) = une touche au plus ; cycles ≈ 3,8 s puis
// 2,8 s, plus le cri et la colère.
const IDLE_MS = [1000, 600];
const SQUASH_MS = [450, 320];
const LEAP_MS = [880, 740];
const LEAP_H = [220, 260];
/** Noyau exposé (aplati) : la fenêtre de tir. */
const FLAT_MS = [1300, 1000];
const WAVE_SPEED = [430, 560];
const RISE_MS = 160;
const INTRO_MS = 900;
const RAGE_MS = 1200;
const FLEE_SHAKE_MS = 700;
const FLASH_MS = 90;
/** Demi-largeur du corps : le boss reste entre les bornes. */
const HALF_W = 76;
/** Marge autour du noyau pour les tirs. */
const WEAK_PAD = 6;
/** Après une touche : noyau refermé, il reste aplati ce temps (clignotement), puis se relève. */
const SHUT_MS = 250;
/** Après une touche : les plombs de la même salve (ou tirs rapprochés) sont absorbés, sans seconde touche ni son. */
const TOUCH_GRACE_MS = 120;
const WAVE_COUNT = 4;
const WAVE_HALF = 30;
const WAVE_FRAME_MS = 90;
/** Écart min entre deux sons de coup (plombs simultanés). */
const SFX_GAP_MS = 70;

type Act = 'none' | 'intro' | 'idle' | 'squash' | 'leap' | 'flat' | 'rise' | 'rage';

interface Wave {
  img: Phaser.GameObjects.Image;
  x: number;
  dir: number;
  speed: number;
  alive: boolean;
  frame: number;
  frameMs: number;
}

function inside(boxes: readonly BossBox[], x: number, y: number, pad: number): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return true;
  }
  return false;
}

export class BlobKing implements Boss {
  readonly id = 'blobKing' as const;
  readonly name = 'Blob-roi';
  readonly maxLife = MAX_LIFE;
  readonly phases = 2;
  life = MAX_LIFE;
  phase = 1;
  state: BossState = 'wait';
  x: number;
  y: number;

  /** Hauteur à l'image précédente (rebond pendant un bond qui monte). */
  private prevY = 0;
  private act: Act = 'none';
  private actMs = 0;
  private clock = 0;
  private facing: 1 | -1 = -1;
  private sheet: BossSheet = NORMAL;
  private frame = 0;
  private shownKey = '';
  private shownFrame = -1;
  private flashMs = 0;
  private lastHitSfx = -1e9;
  private lastArmorSfx = -1e9;
  /** Touché pendant cette fenêtre : noyau refermé. */
  private shut = false;
  private touchAt = -1e9;
  private leapFrom = 0;
  private leapTo = 0;
  private fleeX = 0;
  private fleeVx = 0;
  private fleeVy = 0;
  private fleeing = false;
  private readonly sprite: Phaser.GameObjects.Sprite;
  /** Clignotement de dégât : copie additive du sprite (aussi en rendu Canvas, où setTintFill est sans effet). */
  private readonly glow: Phaser.GameObjects.Sprite;
  private readonly waves: Wave[] = [];

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
    for (let i = 0; i < WAVE_COUNT; i++) {
      const img = scene.add.image(-500, -500, WAVE.key, 0).setOrigin(WAVE.originX, WAVE.originY).setDepth(DEPTH.enemies + 1).setVisible(false);
      this.waves.push({ img, x: 0, dir: 1, speed: 0, alive: false, frame: 0, frameMs: 0 });
    }
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
    this.frame = BLOB_POSE.idle[0];
    this.flashMs = 0;
    this.fleeing = false;
    this.shut = false;
    this.touchAt = -1e9;
    this.x = this.spot.x;
    this.y = this.spot.feetY;
    this.prevY = this.y;
    this.sprite.setVisible(true).setAlpha(1);
    this.glow.setVisible(false);
    this.clearWaves();
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
    for (const w of this.waves) w.img.destroy();
    this.waves.length = 0;
  }

  update(dt: number, dtMs: number): void {
    this.clock += dtMs;
    this.prevY = this.y;
    this.updateWaves(dt, dtMs);
    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      if (this.flashMs <= 0) this.glow.setVisible(false);
    }
    if (this.state === 'wait') this.frame = this.idleFrame();
    else if (this.state === 'fight') this.updateFight(dtMs);
    else if (this.state === 'beaten') this.updateFlee(dt, dtMs);
    this.place();
  }

  // ---------------------------------------------------------------- Combat

  private go(act: Act): void {
    this.act = act;
    this.actMs = 0;
  }

  private get pi(): number {
    return this.phase > 1 ? 1 : 0;
  }

  /** Aplati et pas encore touché : la fenêtre où une touche compte. */
  private get open(): boolean {
    return this.state === 'fight' && this.act === 'flat' && !this.shut;
  }

  private idleFrame(): number {
    const idle = BLOB_POSE.idle;
    return idle[Math.floor(this.clock / 166) % idle.length];
  }

  private faceKai(): void {
    this.facing = this.scene.player.x < this.x ? -1 : 1;
  }

  private updateFight(dtMs: number): void {
    this.actMs += dtMs;
    const feet = this.spot.feetY;
    switch (this.act) {
      case 'intro': {
        // Cri d'apparition : il s'écrase, saute sur place et retombe (sans onde).
        this.faceKai();
        if (this.actMs < 350) {
          this.frame = BLOB_POSE.squash;
        } else if (this.actMs < 800) {
          const u = (this.actMs - 350) / 450;
          this.frame = BLOB_POSE.leap;
          this.y = feet - 4 * 70 * u * (1 - u);
        } else {
          this.y = feet;
          this.frame = BLOB_POSE.squash;
          if (this.actMs >= INTRO_MS) {
            this.scene.fx.puff(this.x, feet, 4);
            this.go('idle');
          }
        }
        break;
      }
      case 'idle':
        this.faceKai();
        this.frame = this.idleFrame();
        if (this.actMs >= IDLE_MS[this.pi]) this.go('squash');
        break;
      case 'squash':
        this.frame = BLOB_POSE.squash;
        if (this.actMs >= SQUASH_MS[this.pi]) this.startLeap();
        break;
      case 'leap': {
        const u = Math.min(1, this.actMs / LEAP_MS[this.pi]);
        this.x = this.leapFrom + (this.leapTo - this.leapFrom) * u;
        this.y = feet - 4 * LEAP_H[this.pi] * u * (1 - u);
        this.frame = BLOB_POSE.leap;
        if (u >= 1) this.land();
        break;
      }
      case 'flat':
        this.frame = BLOB_POSE.flat;
        if (this.actMs >= FLAT_MS[this.pi]) this.go('rise');
        break;
      case 'rise':
        this.frame = BLOB_POSE.squash;
        if (this.actMs >= RISE_MS) this.go('idle');
        break;
      case 'rage': {
        // Colère : il tremble en alternant les poses, puis appelle ses petits blobs.
        this.y = feet;
        this.frame = Math.floor(this.actMs / 120) % 2 === 0 ? BLOB_POSE.squash : BLOB_POSE.idle[0];
        if (this.actMs >= RAGE_MS) {
          this.summonMinions();
          this.go('idle');
        }
        break;
      }
      default:
        break;
    }
  }

  private startLeap(): void {
    const kai = this.scene.player.x;
    const lo = this.spot.left + HALF_W;
    const hi = this.spot.right - HALF_W;
    this.leapFrom = this.x;
    this.leapTo = Math.min(hi, Math.max(lo, kai));
    if (Math.abs(this.leapTo - this.x) > 8) this.facing = this.leapTo < this.x ? -1 : 1;
    this.go('leap');
    this.scene.playSfx('jump', 0.7, 0.55);
  }

  private land(): void {
    const feet = this.spot.feetY;
    this.y = feet;
    this.x = this.leapTo;
    this.frame = BLOB_POSE.flat;
    this.go('flat');
    this.shut = false;
    this.spawnWave(-1);
    this.spawnWave(1);
    const scene = this.scene;
    scene.fx.shake(0.6, 160);
    scene.playSfx('quake', 0.75);
    scene.vibrate(40);
    scene.fx.puff(this.x - 70, feet, 4);
    scene.fx.puff(this.x + 70, feet, 4);
  }

  private enterRage(): void {
    this.phase = 2;
    this.sheet = RAGE;
    this.y = this.spot.feetY;
    this.go('rage');
    const scene = this.scene;
    scene.playSfx('bossPhase');
    scene.fx.shake(0.8, 300);
    scene.vibrate([40, 40, 60]);
    scene.fx.burst(this.x, this.y - 60, 0xd2ff28, 18);
  }

  private summonMinions(): void {
    const scene = this.scene;
    const feet = this.spot.feetY;
    const dir = scene.player.x < this.x ? -1 : 1;
    for (let k = 0; k < BLOB_KING_MINIONS; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      let x = Math.min(this.spot.right - 40, Math.max(this.spot.left + 40, this.x + side * 90));
      // Pas dans une case pleine (champignon de l'arène) : une tuile plus près du boss, sinon pas de renfort.
      if (scene.grid.solidAtPx(x, feet - 12)) x += x < this.x ? TILE : -TILE;
      if (scene.grid.solidAtPx(x, feet - 12)) continue;
      if (scene.enemies.summon(x, feet, dir, -620)) scene.fx.burst(x, feet - 30, 0x9dff5c, 8);
    }
  }

  /** Touches directes (tir ou saut sur le noyau, aide de test) : noyau refermé ; renvoie les touches prises. */
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
    else if (this.act === 'flat') {
      this.shut = true;
      this.actMs = Math.max(this.actMs, FLAT_MS[this.pi] - SHUT_MS);
    }
    // Les coups arrivent après update() (tirs, écrasement) : copie recalée avant le rendu de cette image.
    this.place();
    return k;
  }

  private defeat(): void {
    this.life = 0;
    this.state = 'beaten';
    this.go('none');
    this.clearWaves();
    this.sheet = RAGE;
    this.frame = BLOB_POSE.flee;
    this.y = this.spot.feetY;
    this.fleeX = this.x;
    this.fleeing = false;
    const scene = this.scene;
    scene.playSfx('bossDefeat');
    scene.vibrate([60, 40, 120]);
    scene.fx.shake(1, 380);
    scene.fx.burst(this.x, this.y - 60, 0x9dff5c, 26);
    scene.fx.burst(this.x, this.y - 60, 0xff4fd8, 14);
    scene.onBossBeaten();
  }

  /** Vaincu : il tremble, puis s'enfuit d'un grand bond loin de Kaï, hors de l'écran. */
  private updateFlee(dt: number, dtMs: number): void {
    this.actMs += dtMs;
    this.frame = BLOB_POSE.flee;
    if (this.actMs < FLEE_SHAKE_MS) {
      this.x = this.fleeX + Math.sin(this.clock * 0.09) * 3;
      return;
    }
    if (!this.fleeing) {
      this.fleeing = true;
      this.fleeVx = (this.scene.player.x < this.x ? 1 : -1) * 220;
      this.fleeVy = -2300;
      this.facing = this.fleeVx > 0 ? 1 : -1;
      this.scene.playSfx('jump', 0.8, 0.5);
      this.scene.fx.puff(this.x, this.y, 5);
    }
    this.fleeVy += 2600 * dt;
    this.x += this.fleeVx * dt;
    this.y += this.fleeVy * dt;
    const t = this.actMs - FLEE_SHAKE_MS;
    this.sprite.setAlpha(Math.max(0, 1 - Math.max(0, t - 400) / 400));
    if (this.y < -260 || t > 1400) {
      this.state = 'gone';
      this.sprite.setVisible(false);
      this.glow.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- Ondes

  private spawnWave(dir: number): void {
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (w.alive) continue;
      w.alive = true;
      w.dir = dir;
      w.speed = WAVE_SPEED[this.pi];
      w.x = this.x + dir * 62;
      w.frame = 0;
      w.frameMs = 0;
      w.img.setVisible(true).setFrame(0).setPosition(w.x, this.spot.feetY);
      return;
    }
  }

  private updateWaves(dt: number, dtMs: number): void {
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (!w.alive) continue;
      w.x += w.dir * w.speed * dt;
      if (w.x - WAVE_HALF < this.spot.left || w.x + WAVE_HALF > this.spot.right) {
        w.alive = false;
        w.img.setVisible(false);
        continue;
      }
      w.frameMs += dtMs;
      if (w.frameMs >= WAVE_FRAME_MS) {
        w.frameMs -= WAVE_FRAME_MS;
        w.frame = 1 - w.frame;
        w.img.setFrame(w.frame);
      }
      w.img.x = w.x;
    }
  }

  private clearWaves(): void {
    for (let i = 0; i < this.waves.length; i++) {
      this.waves[i].alive = false;
      this.waves[i].img.setVisible(false);
    }
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
    if (!weak && !inside(b.armor, rx, ry, 0)) return -1;
    if (weak && this.open) return this.takeDamage(1);
    if (this.scene.clockMs - this.touchAt < TOUCH_GRACE_MS) return 1;
    this.armorSfx();
    return 0;
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
    const ground = this.spot.feetY;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      if (w.alive && r > w.x - WAVE_HALF && l < w.x + WAVE_HALF && bottom > ground - BLOB_WAVE.crest + 8) return w.x;
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
   * Kaï retombe sur lui : rebond sur la gelée (couronne comprise : elle dépasse du corps au milieu) ; aplati,
   * l'écrasement du noyau est une touche.
   */
  stomp(p: Player): boolean {
    if (this.state !== 'fight' || p.body.velocity.y <= 0) return false;
    const flat = this.act === 'flat';
    const tops = flat ? this.boxes.weak : this.boxes.hurt;
    let lo = (p.left + 3 - this.x) * this.facing;
    let hi = (p.right - 3 - this.x) * this.facing;
    if (lo > hi) {
      const s = lo;
      lo = hi;
      hi = s;
    }
    // Dessus = la plus haute des boîtes sous les pieds de Kaï.
    let top = Infinity;
    for (let i = 0; i < tops.length; i++) {
      const h = tops[i];
      if (hi > h.x && lo < h.x + h.w && h.y < top) top = h.y;
    }
    if (top === Infinity) return false;
    const y = this.y + top;
    // Pieds au-dessus du dessus avant cette image : celui d'avant (le boss monte pendant un bond) ou l'actuel.
    if (p.feetY < y || p.prevBottom > Math.max(y, this.prevY + top) + 12) return false;
    const scene = this.scene;
    p.bounce(scene.session ? scene.session.hooks.input.state.jump : false);
    scene.stompGraceMs = 140;
    if (flat && this.open) {
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
    s.x = this.x;
    s.y = this.y;
    s.flipX = this.facing < 0;
    const key = this.sheet.key;
    if (key !== this.shownKey || this.frame !== this.shownFrame) {
      this.shownKey = key;
      this.shownFrame = this.frame;
      s.setTexture(key, this.frame);
    }
    const g = this.glow;
    if (g.visible) {
      g.x = s.x;
      g.y = s.y;
      g.flipX = s.flipX;
      g.alpha = 0.85 * s.alpha;
      if (g.texture.key !== key || g.frame !== s.frame) g.setTexture(key, this.frame);
    }
  }

  /** État détaillé (aides de test). */
  info(): Record<string, unknown> {
    let waves = 0;
    for (const w of this.waves) if (w.alive) waves++;
    return {
      act: this.act,
      frame: this.frame,
      texture: this.sheet.key,
      facing: this.facing,
      flashing: this.glow.visible,
      open: this.open,
      waves,
      visible: this.sprite.visible,
    };
  }
}
