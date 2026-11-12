import type * as Phaser from 'phaser';
import type { InputApi, WeaponId } from '../../core/types';
import { PLAYER_SHOULDER } from '../art';
import { frameShoulderX, frameShoulderY } from '../art/draw/player';
import { kaiPngActive, pngMuzzle } from '../art/kaiPng';
import { kaiModelActive } from '../art/kaiSheet';
import { ANIM, ARM_MUZZLE, ARM_RIG, ARM_TEX, FRAMES, FRAME_SIZE, TEX } from '../art/keys';
import {
  AIM_ANGLE,
  type AimDir,
  DEPTH,
  DROP_THROUGH_MS,
  MAX_FALL_SPEED,
  PLAYER_BODY,
  PLAYER_CROUCH_BODY,
  RUN_SPEED,
  TILE,
} from '../constants';
import { CELL_ONEWAY, CELL_SOLID } from './mapBuilder';
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
  HURT_LOCK_MS,
  JUMP_BUFFER_MS,
  JUMP_CUT,
  JUMP_V,
  KNOCKBACK_X,
  KNOCKBACK_Y,
  MAX_RISE_V,
  MUSHROOM_HELD_V,
  MUSHROOM_V,
  STOMP_BOUNCE,
  STOMP_BOUNCE_HELD,
} from './tuning';

// Kaï : corps physique (zone invisible 34x70, 34x46 accroupi) séparé du visuel, pour pouvoir écraser / étirer
// le sprite sans toucher à la boîte de collision. Le bras armé est un sprite à part qui pivote à l'épaule.

const HALF_H = PLAYER_BODY.height / 2;
/**
 * Reptation : on ne court pas accroupi (↓ seul pour s'accroupir, les diagonales basses font courir), mais une
 * fois accroupi, ↓ + côté fait ramper lentement, et sous un plafond trop bas ← → aussi : sans ça, impossible
 * d'entrer dans un passage d'une tuile de haut ou d'en sortir.
 */
const CRAWL_SPEED = 0.3 * RUN_SPEED;
/** Durée de la frame de recul du bras, et de la pose accroupie de tir, après un tir (ms). */
const RECOIL_MS = 70;
const CROUCH_SHOT_MS = 150;

function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Bras armé (ARM_TEX) : position, sens et rotation recalés à chaque frame sur le sprite du corps. */
  readonly arm: Phaser.GameObjects.Image;
  readonly bubble: Phaser.GameObjects.Image;

  facing: 1 | -1 = 1;
  invulnMs = 0;
  hurtMs = 0;
  shield = false;
  /** Compétence apprise (hooks.loadout.skills.doubleJump), posée par la scène au départ et à la réapparition. */
  canDoubleJump = false;
  /** Bonus de vitesse : vitesses et accélérations horizontales multipliées (SPEED_BOOST_MUL), saut inchangé. */
  speedMul = 1;
  god = false;
  onGround = true;
  /** Visée : devant, diagonale haute ou haut (toujours devant accroupi). */
  aim: AimDir = 'front';
  crouching = false;
  /** Descente d'étage en cours : les plateformes `=` et mobiles laissent passer Kaï vers le bas. */
  dropThrough = false;
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
  private dropUntil = -1e9;
  /** Dernier support touché : plateforme traversable (`=` ou mobile) plutôt que sol plein. */
  private supportPassThrough = false;
  private recoilMs = 0;
  private crouchShotMs = 0;
  private weaponId: WeaponId = 'laser';
  private armFrame: number = FRAMES.arm.rest;

  constructor(
    private readonly scene: PlatformScene,
    x: number,
    feetY: number,
    weapon: WeaponId = 'laser',
  ) {
    this.zone = scene.add.zone(x, feetY - HALF_H, PLAYER_BODY.width, PLAYER_BODY.height);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(PLAYER_BODY.width, PLAYER_BODY.height, true);
    this.body.setCollideWorldBounds(true);
    // Arcade borne aussi la montée : plafond relevé pour les champignons, chute bornée à la main (controlUpdate).
    this.body.setMaxVelocity(4000, MAX_RISE_V);
    this.body.setBounce(0, 0);

    this.sprite = scene.add.sprite(x, feetY, TEX.player, 0);
    this.sprite.setOrigin(0.5, 1).setDepth(DEPTH.player);

    this.arm = scene.add.image(x, feetY + ARM_RIG.shoulderY, TEX.armLaser, FRAMES.arm.rest);
    this.arm.setOrigin(ARM_RIG.pivotX / FRAME_SIZE.arm.w, ARM_RIG.pivotY / FRAME_SIZE.arm.h).setDepth(DEPTH.player + 0.5);
    this.setWeapon(weapon);

    this.bubble = scene.add.image(x, feetY - HALF_H, TEX.shieldBubble);
    this.bubble.setDepth(DEPTH.player + 1).setVisible(false);

    this.safeX = x;
    this.safeFeetY = feetY;
    this.playAnim(ANIM.playerIdle);
    this.placeArm(1);
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

  /** Décalage de l'épaule selon la visée (ARM_RIG) : avancée en visée haute, avancée et abaissée en diagonale. */
  private get aimShoulderDX(): number {
    return this.aim === 'up' ? ARM_RIG.upShoulderX : this.aim === 'diag' ? ARM_RIG.diagShoulderX : 0;
  }

  private get aimShoulderDY(): number {
    return this.aim === 'diag' ? ARM_RIG.diagShoulderY : 0;
  }

  /**
   * Épaule du tir : la frame PNG affichée (le projectile part de la bouche dessinée), sinon ARM_RIG
   * (debout ou accroupi). Le .glb garde l'épaule debout fixe.
   */
  private shotShoulderX(): number {
    if (!kaiModelActive() && kaiPngActive()) return frameShoulderX(+this.sprite.frame.name | 0) + this.aimShoulderDX;
    return (this.crouching ? ARM_RIG.crouchShoulderX : ARM_RIG.shoulderX) + this.aimShoulderDX;
  }

  private shotShoulderY(): number {
    if (!kaiModelActive() && kaiPngActive()) return frameShoulderY(+this.sprite.frame.name | 0) + this.aimShoulderDY;
    return (this.crouching ? ARM_RIG.crouchShoulderY : ARM_RIG.shoulderY) + this.aimShoulderDY;
  }

  /** Épaule (pivot du bras, dans le corps) : départ du balayage du canon au tir (ShotPool.fire). */
  get shoulderX(): number {
    return this.x + this.facing * this.shotShoulderX();
  }

  get shoulderY(): number {
    return this.feetY + this.shotShoulderY();
  }

  /**
   * Bouche du canon (voir ARM_RIG / ARM_MUZZLE) : épaule de la frame (décalée selon la visée), puis le
   * canon tourné selon la visée.
   */
  /** Bouche du canon dans la frame du bras : celle du PNG rendu (arme modélisée), sinon celle du dessin. */
  private get muzzle(): { readonly x: number; readonly y: number } {
    return (kaiPngActive() && pngMuzzle(this.weaponId, FRAMES.arm.rest)) || ARM_MUZZLE[this.weaponId];
  }

  get gunX(): number {
    const a = AIM_ANGLE[this.aim];
    const m = this.muzzle;
    const sx = this.shotShoulderX();
    return this.x + this.facing * (sx + (m.x - ARM_RIG.pivotX) * Math.cos(a) + (m.y - ARM_RIG.pivotY) * Math.sin(a));
  }

  get gunY(): number {
    const a = AIM_ANGLE[this.aim];
    const m = this.muzzle;
    const sy = this.shotShoulderY();
    return this.feetY + sy - (m.x - ARM_RIG.pivotX) * Math.sin(a) + (m.y - ARM_RIG.pivotY) * Math.cos(a);
  }

  /** Angle du tir (radians Phaser, y vers le bas) : visée vers le haut, du côté où regarde Kaï. */
  get fireAngle(): number {
    const a = AIM_ANGLE[this.aim];
    return this.facing > 0 ? -a : Math.PI + a;
  }

  get isDying(): boolean {
    return this.dying;
  }

  /** Arme tenue : texture du bras (ARM_TEX) et bouche du canon (ARM_MUZZLE). */
  get weapon(): WeaponId {
    return this.weaponId;
  }

  /** Change l'arme tenue (texture du laser tant que celle de l'arme n'est pas dessinée). */
  setWeapon(id: WeaponId): void {
    this.weaponId = id;
    const key = this.scene.textures.exists(ARM_TEX[id]) ? ARM_TEX[id] : TEX.armLaser;
    if (this.arm.texture.key !== key) this.arm.setTexture(key, this.armFrame);
  }

  /** Lecture des commandes et calcul des vitesses (appliquées au prochain pas de physique). */
  controlUpdate(dt: number, dtMs: number, now: number, input: InputApi): void {
    const b = this.body;
    const st = input.state;
    this.now = now;
    if (this.invulnMs > 0) this.invulnMs -= dtMs;
    if (this.hurtMs > 0) this.hurtMs -= dtMs;
    if (this.recoilMs > 0) this.recoilMs -= dtMs;
    if (this.crouchShotMs > 0) this.crouchShotMs -= dtMs;
    this.dropThrough = now < this.dropUntil;

    const left = st.left || st.stickX < -0.35;
    const right = st.right || st.stickX > 0.35;
    const up = st.up || st.stickY > 0.35;
    const down = st.down || st.stickY < -0.35;
    const move = left === right ? 0 : right ? 1 : -1;
    // ↓ seul : les diagonales basses comptent comme ← → (pas d'accroupi par accident en courant).
    const downOnly = down && !left && !right;
    // Chute bornée (maxVelocity.y est relevé pour les champignons) : moins de TILE_BIAS par pas.
    if (b.velocity.y > MAX_FALL_SPEED) b.velocity.y = MAX_FALL_SPEED;
    // Contact au sol (tuiles ou plateforme mobile, y compris quand elle monte) ; sur un champignon : rebond.
    let grounded = (b.blocked.down || b.touching.down) && now >= this.ignoreGroundUntil;
    if (grounded && b.blocked.down && this.mushroomBounce(input, now)) grounded = false;

    if (grounded) {
      if (!this.wasGrounded) this.land();
      this.lastGroundAt = now;
      this.jumping = false;
      this.airJumpUsed = false;
      this.maxFallVy = 0;
      if (b.blocked.down && !b.touching.down) {
        // Sol fixe (une plateforme mobile pose aussi blocked.down, mais touching seulement elle) : point de
        // retour du mode god.
        this.safeX = this.x;
        this.safeFeetY = this.feetY;
      }
      this.supportPassThrough = this.onPassThrough();
    } else if (b.velocity.y > this.maxFallVy) {
      this.maxFallVy = b.velocity.y;
    }
    this.onGround = grounded;
    this.wasGrounded = grounded;

    // ---- Accroupi : ↓ seul au sol (puis ↓ + côté pour ramper) ; reste accroupi tant que la place manque.
    // Une perte de contact d'une frame (plateforme mobile qui descend) ne le relève pas.
    const footing = grounded || (this.crouching && now - this.lastGroundAt <= COYOTE_MS);
    const wantCrouch = footing && this.hurtMs <= 0 && (downOnly || (this.crouching && down));
    if (wantCrouch !== this.crouching && (wantCrouch || this.canStand())) this.setCrouch(wantCrouch);

    // ---- Visée : ↑ seul = haut (Kaï s'arrête : aucun côté), ↑ + côté = diagonale.
    this.aim = this.crouching || !up ? 'front' : move === 0 ? 'up' : 'diag';

    // ---- Horizontal : accélération, demi-tour nerveux (bonus de vitesse : vitesses et accélérations × speedMul)
    let vx = b.velocity.x;
    if (this.hurtMs > 0) {
      vx = approach(vx, 0, 200 * dt);
    } else {
      const k = this.speedMul;
      let accel: number;
      if (move !== 0) {
        const turning = vx * move < 0;
        if (grounded) accel = turning ? GROUND_TURN_ACCEL : GROUND_ACCEL;
        else accel = turning ? AIR_TURN_ACCEL : AIR_ACCEL;
        if (turning && grounded && !this.crouching && Math.abs(vx) > 160 && now - this.lastTurnPuffAt > 220) {
          this.lastTurnPuffAt = now;
          this.scene.fx.puff(this.x - move * 10, this.feetY - 4, 2);
        }
        this.facing = move;
      } else {
        accel = grounded ? GROUND_DECEL : AIR_DECEL;
      }
      vx = approach(vx, move * (this.crouching ? CRAWL_SPEED : RUN_SPEED) * k, accel * k * dt);
    }
    b.velocity.x = vx;

    // ---- Saut : mémoire d'appui + coyote time + double saut ; ↓ + Saut sur un support traversable = descente
    if (input.consumePress('jump')) this.jumpBufferAt = now;
    if (this.hurtMs <= 0 && now - this.jumpBufferAt <= JUMP_BUFFER_MS) {
      const coyote = !this.jumping && now - this.lastGroundAt <= COYOTE_MS;
      if ((grounded || coyote) && downOnly && this.supportPassThrough) {
        this.jumpBufferAt = -1e9;
        this.startDrop(now);
      } else if (grounded || coyote) {
        this.jumpBufferAt = -1e9;
        // Accroupi sous un plafond trop bas : pas de saut.
        if (!this.crouching || this.canStand()) {
          this.setCrouch(false);
          this.jump(false);
        }
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

  /**
   * Change la hauteur du corps (70 ↔ 46), pieds en place. prev / prevFrame suivent le haut du corps : sinon,
   * pendant un pas, processTile / processMover croiraient Kaï sous une plateforme traversable.
   */
  private setCrouch(on: boolean): void {
    if (on === this.crouching) return;
    this.crouching = on;
    const b = this.body;
    const h = on ? PLAYER_CROUCH_BODY.height : PLAYER_BODY.height;
    const dy = b.height - h;
    b.setSize(PLAYER_BODY.width, h, false);
    // Zone de 70 px de haut centrée sur son origine : décalage vers le bas pour garder les pieds.
    b.setOffset(0, PLAYER_BODY.height - h);
    b.position.y += dy;
    b.prev.y += dy;
    b.prevFrame.y += dy;
    b.updateCenter();
    if (!on) this.crouchShotMs = 0;
  }

  /** Place pour se relever : aucune case pleine entre le haut du corps accroupi et la hauteur debout. */
  private canStand(): boolean {
    const grid = this.scene.grid;
    const b = this.body;
    const feet = b.y + b.height;
    const c0 = Math.floor((b.x + 1) / TILE);
    const c1 = Math.floor((b.x + b.width - 1) / TILE);
    const r0 = Math.floor((feet - PLAYER_BODY.height + 0.5) / TILE);
    const r1 = Math.floor((feet - PLAYER_CROUCH_BODY.height - 0.5) / TILE);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (grid.at(col, row) === CELL_SOLID) return false;
      }
    }
    return true;
  }

  /**
   * Au sol sur un support traversable seulement : plateforme `=` (aucun sol plein sous les pieds) ou mobile.
   * Mobile = touching.down, posé seulement par les collisions entre corps : les tuiles ne posent que blocked,
   * une plateforme mobile (corps `immovable` pour Arcade) pose les deux.
   */
  private onPassThrough(): boolean {
    const grid = this.scene.grid;
    const b = this.body;
    const row = Math.floor((b.y + b.height + 2) / TILE);
    const c0 = Math.floor((b.x + 1) / TILE);
    const c1 = Math.floor((b.x + b.width - 1) / TILE);
    let oneWay = false;
    for (let col = c0; col <= c1; col++) {
      const cell = grid.at(col, row);
      if (cell === CELL_SOLID) return false;
      if (cell === CELL_ONEWAY) oneWay = true;
    }
    return oneWay || b.touching.down;
  }

  /** Descente d'étage : pas de saut, les supports traversables s'effacent pendant DROP_THROUGH_MS. */
  private startDrop(now: number): void {
    this.dropUntil = now + DROP_THROUGH_MS;
    this.dropThrough = true;
    this.lastGroundAt = -1e9; // pas de saut « coyote » juste après
    this.leaveGround();
    this.scene.fx.puff(this.x, this.feetY - 2, 2);
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

  /**
   * Champignon sous Kaï (sous son centre, ou sous un bord si le centre est dans le vide) : rebond, plus haut si
   * Saut est tenu (ou vient d'être appuyé). L'appui est consommé : ni saut ni double saut à la même image.
   */
  private mushroomBounce(input: InputApi, now: number): boolean {
    const m = this.scene.mushrooms;
    if (!m) return false;
    const b = this.body;
    const row = Math.floor((b.y + b.height + 2) / TILE);
    const grid = this.scene.grid;
    let col = Math.floor(this.x / TILE);
    if (!m.at(col, row)) {
      const mid = grid.at(col, row);
      if (mid === CELL_SOLID || mid === CELL_ONEWAY) return false;
      const cL = Math.floor((b.x + 1) / TILE);
      const cR = Math.floor((b.x + b.width - 1) / TILE);
      if (m.at(cL, row)) col = cL;
      else if (m.at(cR, row)) col = cR;
      else return false;
    }
    const pressed = input.consumePress('jump');
    const held = input.state.jump || pressed || now - this.jumpBufferAt <= JUMP_BUFFER_MS;
    b.velocity.y = -(held ? MUSHROOM_HELD_V : MUSHROOM_V);
    this.jumping = false;
    this.airJumpUsed = false;
    this.jumpBufferAt = -1e9;
    this.lastGroundAt = -1e9;
    this.leaveGround();
    this.squashX = 0.78;
    this.squashY = 1.24;
    m.bounce(col, row, held);
    return true;
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

  /** Un tir vient de partir : recul du bras (et pose accroupie de tir). */
  onShot(): void {
    this.recoilMs = RECOIL_MS;
    if (this.crouching) this.crouchShotMs = CROUCH_SHOT_MS;
  }

  /** Visuel : animation, écrasement, clignotement, bulle. Appelé à chaque frame. */
  visualUpdate(dt: number, now: number): void {
    if (this.dying) {
      this.deathVy += 1900 * dt;
      this.sprite.y += this.deathVy * dt;
      this.sprite.angle += this.facing * 160 * dt;
      this.placeArm(1);
      return;
    }
    const k = Math.min(1, dt * 14);
    this.squashX += (1 - this.squashX) * k;
    this.squashY += (1 - this.squashY) * k;
    this.sprite.setScale(this.squashX, this.squashY);
    this.sprite.flipX = this.facing < 0;

    const b = this.body;
    let key: string;
    // Accroupi d'abord : le visuel suit la boîte basse (même touché sous un plafond) ; reptation au sol.
    if (this.crouching) {
      if (this.crouchShotMs > 0) key = ANIM.playerCrouchShoot;
      else key = this.onGround && Math.abs(b.velocity.x) > 25 ? ANIM.playerCrawl : ANIM.playerCrouch;
    } else if (this.hurtMs > 0) key = ANIM.playerHurt;
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

    const armFrame = this.recoilMs > 0 ? FRAMES.arm.recoil : FRAMES.arm.rest;
    if (armFrame !== this.armFrame) {
      this.armFrame = armFrame;
      this.arm.setFrame(armFrame);
    }

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
    if (this.shield) this.bubble.setPosition(x, feet - this.body.height / 2 - 2);
    this.placeArm(1);
  }

  /** Sortie du niveau : le bras suit le sprite animé par la sortie (saut vers le cockpit, faisceau de la balise). */
  syncArmToSprite(): void {
    if (!this.dying) this.placeArm(this.sprite.scaleY);
  }

  /**
   * Bras armé accroché à l'épaule de la frame affichée (PNG, sinon PLAYER_SHOULDER), avec le sens,
   * l'écrasement et la rotation du corps (mort avec rebond), tourné selon la visée. Visée haute ou
   * diagonale : épaule décalée (ARM_RIG), la visière reste visible. Une échelle négative retourne l'image
   * autour de l'épaule (pas flipX).
   */
  private placeArm(scale: number): void {
    const spr = this.sprite;
    const arm = this.arm;
    if (!spr.visible) {
      if (arm.visible) arm.setVisible(false);
      return;
    }
    const f = spr.flipX ? -1 : 1;
    const frame = +spr.frame.name | 0;
    // Modèle .glb : une seule pose debout, l'épaule ne suit pas encore la marche ni l'accroupi.
    const sx = (kaiModelActive() ? (PLAYER_SHOULDER[0] ?? ARM_RIG.shoulderX) : frameShoulderX(frame)) + this.aimShoulderDX;
    const sy = (kaiModelActive() ? (PLAYER_SHOULDER[1] ?? ARM_RIG.shoulderY) : frameShoulderY(frame)) + this.aimShoulderDY;
    const c = Math.cos(spr.rotation);
    const s = Math.sin(spr.rotation);
    const ox = f * sx * spr.scaleX;
    const oy = sy * spr.scaleY;
    arm.setPosition(spr.x + ox * c - oy * s, spr.y + ox * s + oy * c);
    arm.setScale(f * scale, scale);
    arm.rotation = spr.rotation - f * AIM_ANGLE[this.aim];
    arm.alpha = spr.alpha;
    if (!arm.visible) arm.setVisible(true);
  }

  playAnim(key: string): void {
    if (key === this.animKey) return;
    this.animKey = key;
    if (this.scene.anims.exists(key)) this.sprite.anims.play(key);
  }

  /** Commandes coupées, corps physique désactivé (mort, sortie du niveau). */
  freeze(): void {
    this.body.stop();
    this.body.enable = false;
    this.aim = 'front';
    this.dropUntil = -1e9;
    this.dropThrough = false;
    // Bras au repos : plus de mise à jour visuelle ensuite (sortie), le recul resterait affiché.
    this.recoilMs = 0;
    this.crouchShotMs = 0;
    if (this.armFrame !== FRAMES.arm.rest) {
      this.armFrame = FRAMES.arm.rest;
      this.arm.setFrame(FRAMES.arm.rest);
    }
  }

  startDeath(hop: boolean): void {
    this.freeze();
    this.dying = true;
    this.deathVy = hop ? -640 : 0;
    this.shield = false;
    this.bubble.setVisible(false);
    this.arm.setDepth(DEPTH.foreground + 0.5);
    this.sprite.setScale(1).setAlpha(1).setDepth(DEPTH.foreground);
    this.sprite.anims.timeScale = 1;
    this.animKey = '';
    this.playAnim(ANIM.playerHurt);
    if (!hop) this.sprite.setVisible(false);
    // Avec rebond, le bras tournoie avec le corps ; sans rebond, placeArm le masque avec le sprite.
    this.placeArm(1);
  }

  /** Replace Kaï (pieds en feetY), immobile, debout, prêt à jouer. */
  teleport(x: number, feetY: number): void {
    // Debout avant body.reset : la position est recalculée depuis la zone, sans le décalage accroupi.
    this.setCrouch(false);
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
    this.aim = 'front';
    this.dropUntil = -1e9;
    this.dropThrough = false;
    this.supportPassThrough = false;
    this.recoilMs = 0;
    this.crouchShotMs = 0;
    this.sprite.setVisible(true).setAlpha(1).setAngle(0).setScale(1).setDepth(DEPTH.player);
    this.sprite.setPosition(x, feetY);
    this.animKey = '';
    this.playAnim(ANIM.playerIdle);
    this.armFrame = FRAMES.arm.rest;
    this.arm.setFrame(FRAMES.arm.rest).setDepth(DEPTH.player + 0.5);
    this.placeArm(1);
  }

  /** Masque Kaï (entré dans le vaisseau, emporté par le faisceau de la balise). */
  hide(): void {
    this.sprite.setVisible(false);
    this.bubble.setVisible(false);
    this.arm.setVisible(false);
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
