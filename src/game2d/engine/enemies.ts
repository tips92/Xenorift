import type * as Phaser from 'phaser';
import { ANIM, FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { EnemyKind, EnemySpawn } from './mapBuilder';
import type { PlatformScene } from './PlatformScene';
import {
  ACTIVE_RANGE_SCREENS,
  ARMORED_HP,
  ARMORED_SPEED,
  ENEMY_HP,
  FLYER_AMPLITUDE,
  FLYER_PERIOD_S,
  IMPACT_SFX_GAP_MS,
  SPITTER_INTERVAL_MS,
  SPITTER_RANGE,
  WALKER_SPEED,
} from './tuning';

// Ennemis : marcheur (w), volant (f), blindé (a), cracheur (p).
// Marcheurs et blindés ont un corps Arcade (gravité + tuiles) ; volants et cracheurs sont cinématiques.
// Toutes les interactions avec Kaï et ses tirs passent par des boîtes calculées ici (pas de callbacks Arcade).

const DEATH_NONE = 0;
const DEATH_SQUASH = 1;
const DEATH_POP = 2;
const DEATH_FALL = 3;
type DeathMode = typeof DEATH_SQUASH | typeof DEATH_POP | typeof DEATH_FALL;

/** Boîte de collision (coordonnées monde). */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Enemy {
  kind: EnemyKind;
  sprite: Phaser.GameObjects.Sprite;
  body: Phaser.Physics.Arcade.Body | null;
  alive: boolean;
  /** Simulé (proche de la caméra). */
  awake: boolean;
  dir: number;
  hp: number;
  /** Boîte de touche des ennemis cinématiques. */
  w: number;
  h: number;
  homeX: number;
  homeY: number;
  t: number;
  shootCd: number;
  shootAnimMs: number;
  flashMs: number;
  turnCd: number;
  dying: number;
  dieMs: number;
  dvx: number;
  dvy: number;
  /** Renfort d'un boss : créé caché au chargement (hors carte), appelé par summon(), jamais compté au score. */
  summoned: boolean;
}

interface KindSpec {
  tex: string;
  frameW: number;
  frameH: number;
  /** Boîte de touche (largeur, hauteur), posée sur le bas de la case. */
  w: number;
  h: number;
  anim: string;
}

const SPECS: Record<EnemyKind, KindSpec> = {
  w: { tex: TEX.walker, frameW: 64, frameH: 56, w: 46, h: 38, anim: ANIM.walkerWalk },
  a: { tex: TEX.armored, frameW: 72, frameH: 56, w: 58, h: 40, anim: ANIM.armoredWalk },
  f: { tex: TEX.flyer, frameW: 64, frameH: 56, w: 44, h: 32, anim: ANIM.flyerFly },
  p: { tex: TEX.spitter, frameW: 64, frameH: 80, w: 40, h: 62, anim: ANIM.spitterIdle },
};

export class EnemyManager {
  readonly list: Enemy[] = [];
  /** Sprites à corps Arcade (collision avec les tuiles). */
  readonly physicsSprites: Phaser.Physics.Arcade.Sprite[] = [];
  private readonly box: Box = { l: 0, t: 0, r: 0, b: 0 };
  /** Horloge de jeu du dernier son de touche (plombs simultanés : un seul son). */
  private lastHitSfxAt = -1e9;
  /** Arène de boss (px, bornes comprises) : les ennemis de la carte font demi-tour devant. */
  private fenceL = 0;
  private fenceR = -1;

  /**
   * `reserve` : renforts des boss, créés dès le chargement (le collider des corps Arcade est posé avec la liste
   * de départ) puis rangés cachés en fin de liste, jusqu'à summon().
   */
  constructor(
    private readonly scene: PlatformScene,
    spawns: readonly EnemySpawn[],
    reserve: readonly EnemySpawn[] = [],
  ) {
    for (const s of spawns) this.list.push(this.create(s));
    for (const s of reserve) {
      const e = this.create(s);
      e.summoned = true;
      this.park(e);
      this.list.push(e);
    }
  }

  private create(s: EnemySpawn): Enemy {
    const scene = this.scene;
    const spec = SPECS[s.kind];
    const cx = s.col * TILE + TILE / 2;
    const feet = (s.row + 1) * TILE;
    let sprite: Phaser.GameObjects.Sprite;
    let body: Phaser.Physics.Arcade.Body | null = null;

    if (s.kind === 'w' || s.kind === 'a') {
      const ps = scene.physics.add.sprite(cx, feet, spec.tex, 0);
      ps.setOrigin(0.5, 1);
      body = ps.body as Phaser.Physics.Arcade.Body;
      body.setSize(spec.w, spec.h, false);
      body.setOffset((spec.frameW - spec.w) / 2, spec.frameH - spec.h);
      body.setCollideWorldBounds(true);
      body.setMaxVelocity(1000, 1200);
      body.updateFromGameObject();
      this.physicsSprites.push(ps);
      sprite = ps;
    } else if (s.kind === 'f') {
      sprite = scene.add.sprite(cx, s.row * TILE + TILE / 2, spec.tex, 0);
    } else {
      sprite = scene.add.sprite(cx, feet, spec.tex, 0);
      sprite.setOrigin(0.5, 1);
    }
    sprite.setDepth(DEPTH.enemies);
    if (scene.anims.exists(spec.anim)) {
      // Départ décalé : les ennemis ne bougent pas tous en rythme.
      sprite.anims.play({ key: spec.anim, startFrame: (s.col + s.row) % 2 });
    }

    // Départ vers Kaï (en général à gauche).
    const dir = -1;
    sprite.flipX = dir < 0;
    if (body) body.velocity.x = dir * (s.kind === 'a' ? ARMORED_SPEED : WALKER_SPEED);

    return {
      kind: s.kind,
      sprite,
      body,
      alive: true,
      awake: true,
      dir,
      hp: s.kind === 'a' ? ARMORED_HP : ENEMY_HP,
      w: spec.w,
      h: spec.h,
      homeX: sprite.x,
      homeY: sprite.y,
      t: ((s.col * 7) % 10) / 10 * FLYER_PERIOD_S,
      shootCd: 900,
      shootAnimMs: 0,
      flashMs: 0,
      turnCd: 0,
      dying: DEATH_NONE,
      dieMs: 0,
      dvx: 0,
      dvy: 0,
      summoned: false,
    };
  }

  /** Zone interdite aux marcheurs et blindés de la carte (l'arène, de x0 à x1) ; les renforts y restent libres. */
  fence(x0: number, x1: number): void {
    this.fenceL = x0;
    this.fenceR = x1;
  }

  /** Rangé (réserve des renforts) : ni simulé, ni visible, ni touché. */
  private park(e: Enemy): void {
    e.alive = false;
    e.awake = false;
    e.dying = DEATH_NONE;
    if (e.body) {
      e.body.stop();
      e.body.enable = false;
    }
    e.sprite.anims.pause();
    e.sprite.setVisible(false).setActive(false);
  }

  /**
   * Appelle un marcheur de réserve, pieds en (x, feetY), tourné vers `dir`, lancé vers le haut à `vy` (px/s) ;
   * faux si la réserve est vide (renforts encore en vie ou en train de mourir).
   */
  summon(x: number, feetY: number, dir: number, vy: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.summoned || e.alive || e.dying !== DEATH_NONE || e.kind !== 'w') continue;
      const s = e.sprite;
      e.alive = true;
      e.awake = true;
      e.hp = ENEMY_HP;
      e.dir = dir < 0 ? -1 : 1;
      e.turnCd = 0;
      e.flashMs = 0;
      e.homeX = x;
      e.homeY = feetY;
      s.setPosition(x, feetY).setVisible(true).setActive(true).setAlpha(1).setScale(1).setAngle(0).setDepth(DEPTH.enemies);
      s.flipY = false;
      s.flipX = e.dir < 0;
      s.clearTint();
      if (this.scene.anims.exists(SPECS.w.anim)) s.anims.play(SPECS.w.anim);
      const b = e.body;
      if (b) {
        b.enable = true;
        b.updateFromGameObject();
        b.prev.copy(b.position);
        b.prevFrame.copy(b.position);
        b.velocity.set(e.dir * WALKER_SPEED, vy);
      }
      return true;
    }
    return false;
  }

  /**
   * Appelle un volant de réserve (guêpe de la méduse-baleine), centré en (x, y), tourné vers `dir`, qui ondule autour
   * de ce point ; faux si la réserve est vide.
   */
  summonFlyer(x: number, y: number, dir: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.summoned || e.alive || e.dying !== DEATH_NONE || e.kind !== 'f') continue;
      const s = e.sprite;
      e.alive = true;
      e.awake = true;
      e.hp = ENEMY_HP;
      e.dir = dir < 0 ? -1 : 1;
      e.flashMs = 0;
      e.t = 0;
      e.homeX = x;
      e.homeY = y;
      s.setPosition(x, y).setVisible(true).setActive(true).setAlpha(1).setScale(1).setAngle(0).setDepth(DEPTH.enemies);
      s.flipY = false;
      s.flipX = e.dir < 0;
      s.clearTint();
      if (this.scene.anims.exists(SPECS.f.anim)) s.anims.play(SPECS.f.anim);
      return true;
    }
    return false;
  }

  /** Renforts renvoyés en réserve (boss remis à neuf) ; `pop` : avec une gerbe (boss vaincu). */
  recall(pop: boolean): void {
    const box = this.box;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.summoned || (!e.alive && e.dying === DEATH_NONE)) continue;
      if (pop && e.alive) {
        this.bounds(e, box);
        this.scene.fx.burst((box.l + box.r) * 0.5, (box.t + box.b) * 0.5, this.scene.fx.colors.enemyBurst, 10);
      }
      this.park(e);
    }
  }

  /** Boîte de touche courante de l'ennemi (écrite dans `out`). */
  bounds(e: Enemy, out: Box): Box {
    const b = e.body;
    if (b) {
      out.l = b.x;
      out.t = b.y;
      out.r = b.x + b.width;
      out.b = b.y + b.height;
    } else if (e.kind === 'f') {
      out.l = e.sprite.x - e.w / 2;
      out.r = e.sprite.x + e.w / 2;
      out.t = e.sprite.y - e.h / 2;
      out.b = e.sprite.y + e.h / 2;
    } else {
      out.l = e.sprite.x - e.w / 2;
      out.r = e.sprite.x + e.w / 2;
      out.t = e.sprite.y - e.h;
      out.b = e.sprite.y;
    }
    return out;
  }

  private setAwake(e: Enemy, on: boolean): void {
    e.awake = on;
    e.sprite.setVisible(on);
    if (e.body) {
      e.body.enable = on;
      if (on) e.body.velocity.x = e.dir * (e.kind === 'a' ? ARMORED_SPEED : WALKER_SPEED);
    }
    if (on) e.sprite.anims.resume();
    else e.sprite.anims.pause();
  }

  update(dt: number, dtMs: number): void {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const camCX = cam.scrollX + cam.width * 0.5;
    const range = cam.width * ACTIVE_RANGE_SCREENS;
    const grid = scene.grid;
    const worldBottom = scene.parsed.height;
    const player = scene.player;
    const canShoot = scene.state === 'play';

    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.alive) {
        if (e.dying !== DEATH_NONE) this.updateDying(e, dt, dtMs);
        continue;
      }
      const refX = e.kind === 'f' ? e.homeX : e.sprite.x;
      const near = Math.abs(refX - camCX) <= range;
      if (near !== e.awake) this.setAwake(e, near);
      if (!e.awake) continue;

      if (e.flashMs > 0) {
        e.flashMs -= dtMs;
        if (e.flashMs <= 0) e.sprite.clearTint();
      }

      switch (e.kind) {
        case 'w':
        case 'a': {
          const b = e.body!;
          if (b.y > worldBottom) {
            // Tombé dans un trou : disparaît sans points.
            this.remove(e);
            continue;
          }
          if (e.turnCd > 0) e.turnCd -= dtMs;
          if (b.blocked.left && e.dir < 0) e.dir = 1;
          else if (b.blocked.right && e.dir > 0) e.dir = -1;
          else if (b.blocked.down && e.turnCd <= 0) {
            const fx = e.dir > 0 ? b.x + b.width + 3 : b.x - 3;
            const feet = b.y + b.height;
            const fenced = !e.summoned && fx > this.fenceL && fx < this.fenceR;
            if (fenced || !grid.groundAtPx(fx, feet + 6) || grid.solidAtPx(fx, feet - 12) || grid.hazardAtPx(fx, feet - 6)) {
              e.dir = -e.dir;
              e.turnCd = 180;
            }
          }
          b.velocity.x = e.dir * (e.kind === 'a' ? ARMORED_SPEED : WALKER_SPEED);
          e.sprite.flipX = e.dir < 0;
          break;
        }
        case 'f': {
          e.t += dt;
          const ph = (e.t / FLYER_PERIOD_S) * Math.PI * 2;
          e.sprite.x = e.homeX + FLYER_AMPLITUDE * Math.sin(ph);
          e.sprite.y = e.homeY + 10 * Math.sin(ph * 2.3);
          e.sprite.flipX = Math.cos(ph) < 0;
          break;
        }
        case 'p': {
          const px = player.x;
          e.sprite.flipX = px < e.sprite.x;
          const mouthX = e.sprite.x + (e.sprite.flipX ? -18 : 18);
          const mouthY = e.sprite.y - 56;
          const dx = px - mouthX;
          const dy = player.feetY - 36 - mouthY;
          if (canShoot && dx * dx + dy * dy <= SPITTER_RANGE * SPITTER_RANGE) {
            e.shootCd -= dtMs;
            if (e.shootCd <= 0) {
              e.shootCd = SPITTER_INTERVAL_MS;
              e.shootAnimMs = 380;
              if (scene.anims.exists(ANIM.spitterShoot)) e.sprite.anims.play(ANIM.spitterShoot);
              scene.spores.fire(mouthX, mouthY, px, player.feetY - 36);
            }
          } else if (e.shootCd < 900) {
            e.shootCd = 900;
          }
          if (e.shootAnimMs > 0) {
            e.shootAnimMs -= dtMs;
            if (e.shootAnimMs <= 0 && scene.anims.exists(ANIM.spitterIdle)) e.sprite.anims.play(ANIM.spitterIdle);
          }
          break;
        }
      }
    }
  }

  /** Contacts Kaï / ennemis : écrasement par le dessus ou dégâts. */
  checkPlayer(): void {
    const scene = this.scene;
    const p = scene.player;
    const pl = p.left + 3;
    const pr = p.right - 3;
    const pt = p.top + 4;
    const pb = p.feetY;
    const prevBottom = p.prevBottom;
    const falling = p.body.velocity.y > 0 || pb > prevBottom + 0.5;
    let stomped = false;
    let clanked = false;
    const box = this.box;

    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.alive || !e.awake) continue;
      this.bounds(e, box);
      if (pr <= box.l || pl >= box.r || pb <= box.t || pt >= box.b) continue;
      const mid = (box.t + box.b) * 0.5;
      if ((falling || stomped || clanked) && (prevBottom <= box.t + 10 || pb <= mid)) {
        if (e.kind === 'a') {
          clanked = true;
          this.flash(e);
          scene.fx.spark((box.l + box.r) * 0.5, box.t, 0xffffff, 8);
        } else {
          stomped = true;
          this.kill(e, e.kind === 'w' ? DEATH_SQUASH : e.kind === 'f' ? DEATH_FALL : DEATH_POP);
        }
        continue;
      }
      if (!stomped && !clanked && scene.stompGraceMs <= 0) {
        scene.damagePlayer((box.l + box.r) * 0.5, 'enemy');
        if (scene.state !== 'play') return;
      }
    }

    if (stomped || clanked) {
      const held = scene.session ? scene.session.hooks.input.state.jump : false;
      p.bounce(held);
      scene.stompGraceMs = 140;
      if (stomped) scene.playSfx('stomp');
      if (clanked) scene.playSfx('armorClank');
    }
  }

  /** Ennemi touché au point (x, y) par un tir (marge `pad`), ou null. */
  hitTestPoint(x: number, y: number, pad: number): Enemy | null {
    const box = this.box;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.alive || !e.awake) continue;
      this.bounds(e, box);
      if (x >= box.l - pad && x <= box.r + pad && y >= box.t - pad && y <= box.b + pad) return e;
    }
    return null;
  }

  /** Touché par un tir de Kaï : `damage` points de vie en moins (fiche de l'arme), détruit à 0. */
  hit(e: Enemy, damage: number): void {
    if (!e.alive) return;
    e.hp -= damage;
    // Marge : dégâts non entiers (améliorations du hangar).
    if (e.hp > 1e-6) {
      this.flash(e);
      const now = this.scene.clockMs;
      if (now - this.lastHitSfxAt >= IMPACT_SFX_GAP_MS) {
        this.lastHitSfxAt = now;
        this.scene.playSfx('laserHit');
      }
      return;
    }
    this.kill(e, DEATH_POP);
  }

  /** Ennemis posés sur un bloc frappé par dessous : éjectés. */
  killOnBlock(left: number, top: number): void {
    const box = this.box;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.alive || !e.awake) continue;
      this.bounds(e, box);
      if (box.b >= top - 8 && box.b <= top + 8 && box.r > left && box.l < left + TILE) {
        this.kill(e, DEATH_FALL);
      }
    }
  }

  /** Ennemis vivants pris dans le rectangle (px) : écrasés (tronc abattu). */
  crushIn(left: number, top: number, right: number, bottom: number): void {
    const box = this.box;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.alive) continue;
      this.bounds(e, box);
      if (box.r > left && box.l < right && box.b > top && box.t < bottom) this.kill(e, DEATH_FALL);
    }
  }

  private flash(e: Enemy): void {
    e.sprite.setTintFill(0xffffff);
    e.flashMs = 80;
  }

  private kill(e: Enemy, mode: DeathMode): void {
    const scene = this.scene;
    const box = this.bounds(e, this.box);
    e.alive = false;
    if (e.body) {
      e.body.stop();
      e.body.enable = false;
    }
    e.sprite.clearTint();
    if (!e.summoned) scene.enemiesKilled += 1;
    scene.fx.burst((box.l + box.r) * 0.5, (box.t + box.b) * 0.5, scene.fx.colors.enemyBurst, 14);
    scene.playSfx('enemyDie', 0.8);

    e.dying = mode;
    if (mode === DEATH_SQUASH) {
      e.sprite.anims.stop();
      if (e.kind === 'w') e.sprite.setFrame(FRAMES.walker.squashed);
      else e.sprite.setScale(1.15, 0.5);
      e.dieMs = 520;
    } else if (mode === DEATH_POP) {
      e.dieMs = 200;
    } else {
      e.sprite.anims.pause();
      e.sprite.flipY = true;
      e.dvx = (scene.player.x < e.sprite.x ? 1 : -1) * 90;
      e.dvy = -320;
      e.dieMs = 900;
      e.sprite.setDepth(DEPTH.foreground);
    }
  }

  private updateDying(e: Enemy, dt: number, dtMs: number): void {
    e.dieMs -= dtMs;
    const s = e.sprite;
    if (e.dying === DEATH_SQUASH) {
      if (e.dieMs < 160) s.alpha = Math.max(0, e.dieMs / 160);
    } else if (e.dying === DEATH_POP) {
      const k = 1 - Math.max(0, e.dieMs) / 200;
      s.setScale(1 + 0.35 * k);
      s.alpha = 1 - k;
    } else {
      e.dvy += 1800 * dt;
      s.x += e.dvx * dt;
      s.y += e.dvy * dt;
      s.angle += 220 * dt;
      if (e.dieMs < 200) s.alpha = Math.max(0, e.dieMs / 200);
    }
    if (e.dieMs <= 0) {
      e.dying = DEATH_NONE;
      s.setVisible(false).setActive(false);
    }
  }

  /** Ennemis de la carte morts (rangs dans `list`, renforts exclus) : état noté au point de contrôle d'avant l'arène. */
  snapshot(): number[] {
    const dead: number[] = [];
    for (let i = 0; i < this.list.length; i++) if (!this.list[i].summoned && !this.list[i].alive) dead.push(i);
    return dead;
  }

  /** Reprise d'un combat : ces ennemis de la carte retirés d'emblée (sans points, ni effet). */
  restore(dead: readonly number[]): void {
    for (const i of dead) {
      const e = this.list[i];
      if (e && !e.summoned) this.remove(e);
    }
  }

  /** Retire un ennemi sans points (chute hors carte). */
  private remove(e: Enemy): void {
    e.alive = false;
    e.dying = DEATH_NONE;
    if (e.body) {
      e.body.stop();
      e.body.enable = false;
    }
    e.sprite.setVisible(false).setActive(false);
  }
}
