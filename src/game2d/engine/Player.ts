import type * as Phaser from 'phaser';
import type { InputApi } from '../../core/types';
import { ANIM, TEX } from '../art/keys';
import { DEPTH, MAX_FALL_SPEED, PLAYER_BODY, RUN_SPEED } from '../constants';
import type { PlatformScene } from './PlatformScene';
import {
  AIR_ACCEL,
  AIR_DECEL,
  AIR_TURN_ACCEL,
  COYOTE_MS,
  DOUBLE_JUMP_V,
  GROUND_ACCEL,
  GROUND_DECEL,
  GROUND_TURN_ACCEL,
  GUN_OFFSET_X,
  GUN_OFFSET_Y,
  HURT_LOCK_MS,
  JUMP_BUFFER_MS,
  JUMP_CUT,
  JUMP_V,
  KNOCKBACK_X,
  KNOCKBACK_Y,
  STOMP_BOUNCE,
  STOMP_BOUNCE_HELD,
} from './tuning';

// Kaï : corps physique (zone invisible 34x70) séparé du visuel, pour pouvoir écraser / étirer
// le sprite sans toucher à la boîte de collision.

const HALF_H = PLAYER_BODY.height / 2;

function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bubble: Phaser.GameObjects.Image;

  facing: 1 | -1 = 1;
  invulnMs = 0;
  hurtMs = 0;
  shield = false;
  canDoubleJump = false;
  god = false;
  onGround = true;
  /** Dernière position sûre au sol (mode god : on y revient après une chute). */
  safeX = 0;
  safeFeetY = 0;

  private lastGroundAt = -1e9;
  private jumpBufferAt = -1e9;
  private jumping = false;
  private cutDone = false;
  private airJumpUsed = false;
  private wasGrounded = true;
  private maxFallVy = 0;
  private squashX = 1;
  private squashY = 1;
  private animKey = '';
  private lastTurnPuffAt = -1e9;
  private dying = false;
  private deathVy = 0;
  /** Horloge de jeu (ms) de la dernière mise à jour. */
  private now = 0;
  /** Juste après un saut / rebond, le contact au sol (encore signalé par la physique) est ignoré. */
  private ignoreGroundUntil = 0;

  constructor(
    private readonly scene: PlatformScene,
    x: number,
    feetY: number,
  ) {
    this.zone = scene.add.zone(x, feetY - HALF_H, PLAYER_BODY.width, PLAYER_BODY.height);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(PLAYER_BODY.width, PLAYER_BODY.height, true);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(4000, MAX_FALL_SPEED);
    this.body.setBounce(0, 0);

    this.sprite = scene.add.sprite(x, feetY, TEX.player, 0);
    this.sprite.setOrigin(0.5, 1).setDepth(DEPTH.player);

    this.bubble = scene.add.image(x, feetY - HALF_H, TEX.shieldBubble);
    this.bubble.setDepth(DEPTH.player + 1).setVisible(false);

    this.safeX = x;
    this.safeFeetY = feetY;
    this.playAnim(ANIM.playerIdle);
  }

  get x(): number {
    return this.body.x + this.body.halfWidth;
  }

  get feetY(): number {
    return this.body.y + this.body.height;
  }

  /** Bas du corps au début de la frame (avant les pas de physique). */
  get prevBottom(): number {
    return this.body.prevFrame.y + this.body.height;
  }

  get gunX(): number {
    return this.x + this.facing * GUN_OFFSET_X;
  }

  get gunY(): number {
    return this.feetY + GUN_OFFSET_Y;
  }

  get isDying(): boolean {
    return this.dying;
  }

  /** Lecture des commandes et calcul des vitesses (appliquées au prochain pas de physique). */
  controlUpdate(dt: number, dtMs: number, now: number, input: InputApi): void {
    const b = this.body;
    const st = input.state;
    this.now = now;
    if (this.invulnMs > 0) this.invulnMs -= dtMs;
    if (this.hurtMs > 0) this.hurtMs -= dtMs;

    const left = st.left || st.stickX < -0.35;
    const right = st.right || st.stickX > 0.35;
    const move = left === right ? 0 : right ? 1 : -1;
    // Contact au sol (tuiles ou plateforme mobile, y compris quand elle monte).
    const grounded = (b.blocked.down || b.touching.down) && now >= this.ignoreGroundUntil;

    if (grounded) {
      if (!this.wasGrounded) this.land();
      this.lastGroundAt = now;
      this.jumping = false;
      this.airJumpUsed = false;
      this.maxFallVy = 0;
      if (b.blocked.down) {
        // Sol fixe (pas une plateforme mobile) : point de retour du mode god.
        this.safeX = this.x;
        this.safeFeetY = this.feetY;
      }
    } else if (b.velocity.y > this.maxFallVy) {
      this.maxFallVy = b.velocity.y;
    }
    this.onGround = grounded;
    this.wasGrounded = grounded;

    // ---- Horizontal : accélération, demi-tour nerveux
    let vx = b.velocity.x;
    if (this.hurtMs > 0) {
      vx = approach(vx, 0, 200 * dt);
    } else {
      let accel: number;
      if (move !== 0) {
        const turning = vx * move < 0;
        if (grounded) accel = turning ? GROUND_TURN_ACCEL : GROUND_ACCEL;
        else accel = turning ? AIR_TURN_ACCEL : AIR_ACCEL;
        if (turning && grounded && Math.abs(vx) > 160 && now - this.lastTurnPuffAt > 220) {
          this.lastTurnPuffAt = now;
          this.scene.fx.puff(this.x - move * 10, this.feetY - 4, 2);
        }
        this.facing = move;
      } else {
        accel = grounded ? GROUND_DECEL : AIR_DECEL;
      }
      vx = approach(vx, move * RUN_SPEED, accel * dt);
    }
    b.velocity.x = vx;

    // ---- Saut : mémoire d'appui + coyote time + double saut
    if (input.consumePress('jump')) this.jumpBufferAt = now;
    if (this.hurtMs <= 0 && now - this.jumpBufferAt <= JUMP_BUFFER_MS) {
      const coyote = !this.jumping && now - this.lastGroundAt <= COYOTE_MS;
      if (grounded || coyote) {
        this.jumpBufferAt = -1e9;
        this.jump(false);
      } else if (this.canDoubleJump && !this.airJumpUsed) {
        this.jumpBufferAt = -1e9;
        this.jump(true);
      }
    }

    // ---- Hauteur variable : relâcher tôt coupe la montée
    if (this.jumping && !this.cutDone && !st.jump && b.velocity.y < 0) {
      b.velocity.y *= JUMP_CUT;
      this.cutDone = true;
    }
  }

  private jump(double: boolean): void {
    const b = this.body;
    b.velocity.y = -(double ? DOUBLE_JUMP_V : JUMP_V);
    this.jumping = true;
    this.cutDone = false;
    this.lastGroundAt = -1e9;
    this.leaveGround();
    this.squashX = 0.8;
    this.squashY = 1.2;
    if (double) {
      this.airJumpUsed = true;
      this.scene.playSfx('doubleJump');
      this.scene.fx.puff(this.x, this.feetY, 4);
      this.scene.fx.spark(this.x, this.feetY - 4, this.scene.fx.colors.laser, 8);
    } else {
      this.scene.playSfx('jump');
      this.scene.fx.puff(this.x, this.feetY - 2, 2);
    }
  }

  private land(): void {
    const impact = this.maxFallVy;
    if (impact > 260) {
      const k = Math.min(1, (impact - 260) / 900);
      this.squashX = 1 + 0.26 * k;
      this.squashY = 1 - 0.22 * k;
      this.scene.fx.puff(this.x, this.feetY - 2, 2 + Math.round(3 * k));
    }
  }

  /** Rebond après avoir écrasé un ennemi (plus haut si le saut est maintenu). */
  bounce(jumpHeld: boolean): void {
    this.body.velocity.y = -JUMP_V * (jumpHeld ? STOMP_BOUNCE_HELD : STOMP_BOUNCE);
    this.jumping = false;
    this.airJumpUsed = false;
    this.lastGroundAt = -1e9;
    this.leaveGround();
    this.squashX = 0.84;
    this.squashY = 1.16;
  }

  /** Recul après un coup, à l'opposé de la source. */
  knockback(fromX: number, strength: number): void {
    const dir = this.x < fromX ? -1 : 1;
    this.body.velocity.x = dir * KNOCKBACK_X * strength;
    this.body.velocity.y = -KNOCKBACK_Y * strength;
    this.hurtMs = HURT_LOCK_MS;
    this.jumping = false;
    this.leaveGround();
  }

  /** Projection vers le haut (pics) : renvoyé du côté d'où il venait. */
  popUp(vy: number, fromX: number): void {
    const vx = this.body.velocity.x;
    const dir = vx > 20 ? -1 : vx < -20 ? 1 : this.x < fromX ? -1 : 1;
    this.body.velocity.y = -vy;
    this.body.velocity.x = dir * KNOCKBACK_X;
    this.hurtMs = HURT_LOCK_MS;
    this.jumping = false;
    this.leaveGround();
  }

  private leaveGround(): void {
    this.onGround = false;
    this.wasGrounded = false;
    this.maxFallVy = 0;
    this.ignoreGroundUntil = this.now + 70;
  }

  /** Visuel : animation, écrasement, clignotement, bulle. Appelé à chaque frame. */
  visualUpdate(dt: number, now: number): void {
    if (this.dying) {
      this.deathVy += 1900 * dt;
      this.sprite.y += this.deathVy * dt;
      this.sprite.angle += this.facing * 160 * dt;
      return;
    }
    const k = Math.min(1, dt * 14);
    this.squashX += (1 - this.squashX) * k;
    this.squashY += (1 - this.squashY) * k;
    this.sprite.setScale(this.squashX, this.squashY);
    this.sprite.flipX = this.facing < 0;

    const b = this.body;
    let key: string;
    if (this.hurtMs > 0) key = ANIM.playerHurt;
    else if (!this.onGround) key = b.velocity.y < 0 ? ANIM.playerJump : ANIM.playerFall;
    else if (Math.abs(b.velocity.x) > 25) key = ANIM.playerRun;
    else key = ANIM.playerIdle;
    this.playAnim(key);
    if (key === ANIM.playerRun) {
      this.sprite.anims.timeScale = 0.55 + (0.6 * Math.abs(b.velocity.x)) / RUN_SPEED;
    } else if (this.sprite.anims.timeScale !== 1) {
      this.sprite.anims.timeScale = 1;
    }

    this.sprite.alpha = this.invulnMs > 0 && Math.floor(now / 70) % 2 === 0 ? 0.3 : 1;

    if (this.bubble.visible !== this.shield) this.bubble.setVisible(this.shield);
    if (this.shield) {
      const s = 1 + 0.035 * Math.sin(now * 0.006);
      this.bubble.setScale(s);
      this.bubble.alpha = 0.72 + 0.18 * Math.sin(now * 0.0045);
    }
  }

  /** Recale le visuel sur le corps physique (après la synchronisation Arcade de fin de frame). */
  syncVisual(): void {
    if (this.dying) return;
    const x = this.x;
    const feet = this.feetY;
    this.sprite.setPosition(x, feet);
    if (this.shield) this.bubble.setPosition(x, feet - HALF_H - 2);
  }

  playAnim(key: string): void {
    if (key === this.animKey) return;
    this.animKey = key;
    if (this.scene.anims.exists(key)) this.sprite.anims.play(key);
  }

  /** Commandes coupées, corps physique désactivé (mort, décollage). */
  freeze(): void {
    this.body.stop();
    this.body.enable = false;
  }

  startDeath(hop: boolean): void {
    this.freeze();
    this.dying = true;
    this.deathVy = hop ? -640 : 0;
    this.shield = false;
    this.bubble.setVisible(false);
    this.sprite.setScale(1).setAlpha(1).setDepth(DEPTH.foreground);
    this.sprite.anims.timeScale = 1;
    this.animKey = '';
    this.playAnim(ANIM.playerHurt);
    if (!hop) this.sprite.setVisible(false);
  }

  /** Replace Kaï (pieds en feetY), immobile, prêt à jouer. */
  teleport(x: number, feetY: number): void {
    this.body.enable = true;
    this.body.reset(x, feetY - HALF_H);
    this.dying = false;
    this.deathVy = 0;
    this.hurtMs = 0;
    this.jumping = false;
    this.cutDone = false;
    this.airJumpUsed = false;
    this.jumpBufferAt = -1e9;
    this.lastGroundAt = -1e9;
    this.maxFallVy = 0;
    this.wasGrounded = true;
    this.onGround = false;
    this.ignoreGroundUntil = 0;
    this.squashX = 1;
    this.squashY = 1;
    this.sprite.setVisible(true).setAlpha(1).setAngle(0).setScale(1).setDepth(DEPTH.player);
    this.sprite.setPosition(x, feetY);
    this.animKey = '';
    this.playAnim(ANIM.playerIdle);
  }

  /** Masque Kaï (entré dans le vaisseau). */
  hide(): void {
    this.sprite.setVisible(false);
    this.bubble.setVisible(false);
  }

  /** Rectangle de collision courant (coordonnées monde). */
  get left(): number {
    return this.body.x;
  }
  get right(): number {
    return this.body.x + this.body.width;
  }
  get top(): number {
    return this.body.y;
  }
}

export const PLAYER_HALF_H = HALF_H;
