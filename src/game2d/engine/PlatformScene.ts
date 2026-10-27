import * as Phaser from 'phaser';
import type { PowerUpKind, SfxId, StageResult, ToastKind } from '../../core/types';
import { createParallax, generatePlatformArt } from '../art';
import type { ParallaxHandle } from '../art';
import { TILE_FRAME } from '../art/keys';
import {
  INVULNERABLE_MS,
  MAX_HEARTS,
  POWER_DURATION_MS,
  START_LIVES,
  TILE,
} from '../constants';
import { EnemyManager } from './enemies';
import { Effects } from './effects';
import { ExitShip } from './exitShip';
import { HudSync } from './hudSync';
import { Items } from './items';
import { buildTilemap, CELL_HAZARD, CELL_ONEWAY, CELL_SOLID, Grid, parseLevel } from './mapBuilder';
import type { GridPos, ParsedLevel } from './mapBuilder';
import { Movers } from './movers';
import { Player, PLAYER_HALF_H } from './Player';
import { LaserPool, SporePool } from './projectiles';
import { endSession, haptic, reportError, sfx, toast } from './session';
import type { Session } from './session';
import {
  BG_RGB,
  CAMERA_EDGE_BOTTOM,
  CAMERA_EDGE_TOP,
  CAMERA_LERP_X,
  CAMERA_LERP_Y,
  CAMERA_LOOKAHEAD,
  CAMERA_OFFSET_Y,
  HAZARD_POP_Y,
  PHYS_FPS,
  SCENE_KEY,
  SCORE_CRYSTAL,
  SCORE_ENEMY,
  SCORE_LIFE,
  TIME_BONUS_PER_S,
  TIME_BONUS_REF_S,
} from './tuning';
import { Blaster } from './weapons';

// Scène Phaser du mode plateforme. Réutilisée d'un niveau à l'autre : tout l'état est remis à zéro dans init().

export interface PlatformSceneData {
  session: Session;
}

export type PlayState = 'play' | 'dead' | 'exit' | 'over';
type DamageSource = 'hazard' | 'enemy' | 'spore';

const DEV = import.meta.env.DEV;

export class PlatformScene extends Phaser.Scene {
  session: Session | null = null;
  state: PlayState = 'play';

  parsed!: ParsedLevel;
  grid!: Grid;
  layer!: Phaser.Tilemaps.TilemapLayer;
  fx!: Effects;
  player!: Player;
  enemies!: EnemyManager;
  items!: Items;
  lasers!: LaserPool;
  spores!: SporePool;
  movers!: Movers;
  ship!: ExitShip;
  blaster!: Blaster;
  hud!: HudSync;

  /** Horloge de jeu (ms, hors pause). */
  clockMs = 0;
  lives = START_LIVES;
  hearts = MAX_HEARTS;
  crystals = 0;
  enemiesKilled = 0;
  /** Bonus temporaire actif (le bouclier est porté par le joueur, indépendamment). */
  power: 'triple' | 'doublejump' | null = null;
  /** Délai pendant lequel un contact ennemi ne blesse pas, juste après un écrasement. */
  stompGraceMs = 0;

  private built = false;
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private parallax: ParallaxHandle | null = null;
  private world: Phaser.Physics.Arcade.World | null = null;
  private elapsedMs = 0;
  private powerLeftMs = 0;
  private respawnX = 0;
  private respawnFeetY = 0;
  private camOffsetX = 0;
  /** Cible suivie par la caméra (anticipation horizontale, hauteur calée sur le dernier sol). */
  private readonly camTarget = { x: 0, y: 0 };
  /** Hauteur des pieds au dernier contact avec le sol (zone morte verticale). */
  private camGroundFeet = 0;
  private lastBumpAt = -1e9;
  private heatHudMs = 0;
  private crystalCombo = 0;
  private lastCrystalAt = -1e9;

  constructor() {
    super({ key: SCENE_KEY });
  }

  init(data: PlatformSceneData): void {
    this.session = data && data.session ? data.session : null;
    this.state = 'play';
    this.built = false;
    this.map = null;
    this.parallax = null;
    this.world = null;
    this.clockMs = 0;
    this.elapsedMs = 0;
    this.lives = START_LIVES;
    this.hearts = MAX_HEARTS;
    this.crystals = 0;
    this.enemiesKilled = 0;
    this.power = null;
    this.powerLeftMs = 0;
    this.stompGraceMs = 0;
    this.camOffsetX = CAMERA_LOOKAHEAD;
    this.lastBumpAt = -1e9;
    this.heatHudMs = 0;
    this.crystalCombo = 0;
    this.lastCrystalAt = -1e9;
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    const session = this.session;
    if (!session || !session.alive) return;
    try {
      this.build(session);
      this.built = true;
    } catch (err) {
      reportError('création du niveau', err);
      this.state = 'over';
      endSession(session, () => session.hooks.onFail('Impossible de charger le niveau.'));
    }
  }

  private build(session: Session): void {
    const level = session.level;
    const theme = level.theme;

    // Textures générées par code (synchrones), puis décor de fond.
    generatePlatformArt(this, theme);
    this.parallax = createParallax(this, theme);

    const p = parseLevel(level);
    this.parsed = p;
    this.grid = new Grid(p.cols, p.rows, p.cells);
    const built = buildTilemap(this, p);
    this.map = built.map;
    this.layer = built.layer;

    const world = this.physics.world;
    this.world = world;
    // Pas de bord bas : tomber dans un trou fait sortir de la carte.
    world.setBounds(0, 0, p.width, p.height + TILE * 4);
    world.setBoundsCollision(true, true, false, false);

    this.fx = new Effects(this, theme);
    this.movers = new Movers(this, p.movers);
    this.items = new Items(this, p);
    this.enemies = new EnemyManager(this, p.enemies);
    const exit = p.exit ?? this.fallbackExit(p);
    this.ship = new ExitShip(this, exit.col, exit.row);

    this.respawnX = p.start.col * TILE + TILE / 2;
    this.respawnFeetY = (p.start.row + 1) * TILE;
    this.player = new Player(this, this.respawnX, this.respawnFeetY);
    this.lasers = new LaserPool(this);
    this.spores = new SporePool(this);
    this.blaster = new Blaster(this);

    // Collisions Arcade : uniquement le décor (le reste est géré à la main).
    this.physics.add.collider(this.player.zone, this.layer, undefined, this.processTile, this);
    if (this.enemies.physicsSprites.length > 0) {
      this.physics.add.collider(this.enemies.physicsSprites, this.layer, undefined, this.processTile, this);
    }
    if (this.movers.images.length > 0) {
      this.physics.add.collider(this.player.zone, this.movers.images, undefined, this.processMover, this);
      world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, this.onWorldStep, this);
      this.movers.prime(1 / PHYS_FPS);
    }

    // Caméra : suivi adouci, anticipation dans le sens de la course, hauteur calée sur le dernier sol.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, p.width, p.height);
    cam.setRoundPixels(true);
    this.camOffsetX = CAMERA_LOOKAHEAD * this.player.facing;
    this.snapCamera();
    cam.startFollow(this.camTarget, true, CAMERA_LERP_X, CAMERA_LERP_Y);

    this.hud = new HudSync(session.hooks.hud, {
      hearts: this.hearts,
      maxHearts: MAX_HEARTS,
      lives: this.lives,
      crystals: 0,
      crystalsTotal: p.crystalsTotal,
      heat: 0,
      overheated: false,
      power: null,
      powerLeft: 0,
    });

    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.parallax.resize(this.scale.gameSize.width, this.scale.gameSize.height);

    if (DEV) this.exposeDevHelper();
  }

  /** Pas de 'X' dans la carte : vaisseau posé sur le sol, près de la fin. */
  private fallbackExit(p: ParsedLevel): GridPos {
    const col = Math.max(0, p.cols - 5);
    for (let row = 0; row < p.rows - 1; row++) {
      if (this.grid.at(col, row) !== CELL_SOLID && this.grid.at(col, row + 1) === CELL_SOLID) return { col, row };
    }
    return { col, row: p.rows - 2 };
  }

  // ---------------------------------------------------------------- Boucle

  update(time: number, delta: number): void {
    const s = this.session;
    if (!s || !s.alive || !this.built) return;
    if (s.paused || s.gfxLost) {
      // Pause (ou perte du contexte graphique) survenue avant que la scène ne tourne : on s'arrête dès la première frame.
      if (this.sys.isActive()) this.scene.pause();
      return;
    }
    const dtMs = Math.min(delta, 50);
    const dt = dtMs / 1000;
    this.clockMs += dtMs;

    if (this.parallax) {
      try {
        this.parallax.update(time, delta);
      } catch (err) {
        reportError('parallax.update', err);
      }
    }

    switch (this.state) {
      case 'play':
        this.updatePlay(dt, dtMs, s);
        break;
      case 'dead':
        this.elapsedMs += dtMs;
        this.player.visualUpdate(dt, this.clockMs);
        this.updateWorld(dt, dtMs);
        break;
      case 'exit':
        this.updateWorld(dt, dtMs);
        break;
      default:
        break;
    }

    this.updateCamera(dt);
    this.hud.flush();
  }

  private updatePlay(dt: number, dtMs: number, s: Session): void {
    this.elapsedMs += dtMs;
    if (this.stompGraceMs > 0) this.stompGraceMs -= dtMs;
    const input = s.hooks.input;
    const p = this.player;

    p.controlUpdate(dt, dtMs, this.clockMs, input);
    this.blaster.update(dt, dtMs, input);
    this.updatePower(dtMs);

    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, true);

    if (this.state === 'play') this.checkHeadBump();
    if (this.state === 'play') this.enemies.checkPlayer();
    if (this.state === 'play') this.checkHazards();
    if (this.state === 'play' && this.ship.touches(p)) this.startExit();
    if (this.state === 'play' && p.top > this.parsed.height) this.onFall();

    if (this.state === 'play') p.visualUpdate(dt, this.clockMs);
    this.updateHeatHud(dtMs);
  }

  /** Le monde continue de vivre pendant la mort / le décollage (sans ramassage). */
  private updateWorld(dt: number, dtMs: number): void {
    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, false);
  }

  private updateCamera(dt: number): void {
    if (this.state !== 'play') return;
    const target = this.player.facing * CAMERA_LOOKAHEAD;
    this.camOffsetX += (target - this.camOffsetX) * Math.min(1, dt * 2.4);
  }

  /**
   * Cible de la caméra : anticipation dans le sens de la course ; verticalement, la caméra reste calée
   * sur le dernier sol touché (un saut ne la fait pas bouger) sauf si Kaï approche du haut / bas de l'écran.
   */
  private updateCamTarget(): void {
    const p = this.player;
    const feet = p.feetY;
    if (p.onGround) this.camGroundFeet = feet;
    const halfH = this.cameras.main.height * 0.5;
    let cy = this.camGroundFeet - PLAYER_HALF_H - CAMERA_OFFSET_Y;
    if (p.top - (cy - halfH) < CAMERA_EDGE_TOP) cy = p.top - CAMERA_EDGE_TOP + halfH;
    if (cy + halfH - feet < CAMERA_EDGE_BOTTOM) cy = feet + CAMERA_EDGE_BOTTOM - halfH;
    this.camTarget.x = p.x + this.camOffsetX;
    this.camTarget.y = cy;
  }

  /** Recentre la caméra immédiatement (départ, réapparition, téléportation). */
  private snapCamera(): void {
    this.camGroundFeet = this.player.feetY;
    this.updateCamTarget();
    this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
  }

  /** Après la synchronisation Arcade (POST_UPDATE) : visuels recalés sur les corps physiques. */
  private onPostUpdate(): void {
    if (!this.built) return;
    if (this.state === 'play') {
      this.player.syncVisual();
      this.updateCamTarget();
    }
    this.ship.syncFlame();
  }

  private onWorldStep(delta: number): void {
    this.movers.step(delta);
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    if (!this.parallax) return;
    try {
      this.parallax.resize(gameSize.width, gameSize.height);
    } catch (err) {
      reportError('parallax.resize', err);
    }
  }

  // ---------------------------------------------------------------- Collisions Arcade

  /** Plateformes traversables : ne bloquent que si le corps était au-dessus avant ce pas. */
  private processTile(obj: unknown, tileObj: unknown): boolean {
    const tile = tileObj as Phaser.Tilemaps.Tile;
    if (this.grid.at(tile.x, tile.y) !== CELL_ONEWAY) return true;
    const body = (obj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    return body.prev.y + body.height <= tile.pixelY + 1;
  }

  private processMover(playerObj: unknown, moverObj: unknown): boolean {
    const pb = (playerObj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    const mb = (moverObj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    return pb.prev.y + pb.height <= mb.prev.y + 6;
  }

  // ---------------------------------------------------------------- Règles

  private checkHeadBump(): void {
    const b = this.player.body;
    if (!b.blocked.up || this.clockMs - this.lastBumpAt < 150) return;
    this.lastBumpAt = this.clockMs;
    const row = Math.floor((b.y - 4) / TILE);
    const cMid = Math.floor(this.player.x / TILE);
    const cL = Math.floor((b.x + 2) / TILE);
    const cR = Math.floor((b.x + b.width - 2) / TILE);
    let col = -1;
    // Priorité au bloc situé sous le centre de la tête.
    if (this.items.isActiveBonus(cMid, row)) col = cMid;
    else if (cL !== cMid && this.items.isActiveBonus(cL, row)) col = cL;
    else if (cR !== cMid && this.items.isActiveBonus(cR, row)) col = cR;
    if (col >= 0) {
      this.items.hitBonus(col, row);
      this.enemies.killOnBlock(col * TILE, row * TILE);
      return;
    }
    const tile = this.layer.getTileAt(cMid, row);
    if (tile && (tile.index === TILE_FRAME.BLOCK || tile.index === TILE_FRAME.BONUS_USED || tile.index === TILE_FRAME.BONUS)) {
      this.playSfx('bump', 0.4);
    }
  }

  private checkHazards(): void {
    const p = this.player;
    if (p.invulnMs > 0 || p.god) return;
    const l = p.left + 4;
    const r = p.right - 4;
    const t = p.top + 6;
    const b = p.feetY;
    const c0 = Math.floor(l / TILE);
    const c1 = Math.floor(r / TILE);
    const r0 = Math.max(0, Math.floor(t / TILE));
    const r1 = Math.floor((b - 0.01) / TILE);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (this.grid.at(col, row) !== CELL_HAZARD) continue;
        // Pics / acide : moitié basse de la case, un peu rétrécie.
        const hx0 = col * TILE + 8;
        const hx1 = col * TILE + TILE - 8;
        const hy0 = row * TILE + TILE / 2 + 2;
        const hy1 = (row + 1) * TILE;
        if (r > hx0 && l < hx1 && b > hy0 && t < hy1) {
          this.damagePlayer(col * TILE + TILE / 2, 'hazard');
          return;
        }
      }
    }
  }

  /** Dégât reçu (pics, ennemi, spore) : bouclier, cœur perdu, recul, clignotement. */
  damagePlayer(fromX: number, source: DamageSource): void {
    if (this.state !== 'play') return;
    const p = this.player;
    if (p.god || p.invulnMs > 0) return;
    const hazard = source === 'hazard';

    if (p.shield) {
      p.shield = false;
      p.invulnMs = 700;
      this.playSfx('shieldBreak');
      this.fx.burst(p.x, p.feetY - 40, 0x9ff6ff, 16);
      this.vibrate(40);
      if (hazard) p.popUp(HAZARD_POP_Y, fromX);
      else p.knockback(fromX, 0.7);
      this.refreshPowerHud();
      return;
    }

    this.hearts = Math.max(0, this.hearts - 1);
    this.hud.set('hearts', this.hearts);
    this.playSfx('hurt');
    this.vibrate(60);
    this.cameras.main.shake(180, 0.006);
    if (this.hearts <= 0) {
      this.killPlayer(true);
      return;
    }
    p.invulnMs = INVULNERABLE_MS;
    if (hazard) p.popUp(HAZARD_POP_Y, fromX);
    else p.knockback(fromX, 1);
  }

  private onFall(): void {
    const p = this.player;
    if (p.god) {
      p.teleport(p.safeX, p.safeFeetY);
      p.invulnMs = 600;
      this.snapCamera();
      return;
    }
    this.killPlayer(false);
  }

  /** Vie perdue : animation, puis retour au dernier point de contrôle (ou échec si plus de vies). */
  private killPlayer(hop: boolean): void {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.lives = Math.max(0, this.lives - 1);
    this.hearts = 0;
    this.hud.set('lives', this.lives);
    this.hud.set('hearts', 0);
    this.clearPowers();
    this.blaster.reset();
    this.updateHeatHud(1000);
    this.player.startDeath(hop);
    this.playSfx('death');
    this.vibrate([40, 60, 90]);
    if (hop) this.cameras.main.shake(220, 0.008);

    this.time.delayedCall(hop ? 1000 : 650, () => {
      const s = this.session;
      if (!s) return;
      if (this.lives <= 0) {
        this.state = 'over';
        endSession(s, () => s.hooks.onFail('Plus de vies !'));
        return;
      }
      const cam = this.cameras.main;
      cam.fadeOut(320, BG_RGB.r, BG_RGB.g, BG_RGB.b);
      this.time.delayedCall(360, () => {
        this.respawn();
        cam.fadeIn(420, BG_RGB.r, BG_RGB.g, BG_RGB.b);
      });
    });
  }

  private respawn(): void {
    const s = this.session;
    if (!s) return;
    this.player.teleport(this.respawnX, this.respawnFeetY);
    this.player.invulnMs = INVULNERABLE_MS;
    this.hearts = MAX_HEARTS;
    this.hud.set('hearts', this.hearts);
    this.blaster.reset();
    this.lasers.clear();
    this.spores.clear();
    this.stompGraceMs = 0;
    this.state = 'play';
    this.camOffsetX = CAMERA_LOOKAHEAD * this.player.facing;
    this.snapCamera();
    try {
      s.hooks.input.clearPresses();
    } catch (err) {
      reportError('input.clearPresses', err);
    }
  }

  reachCheckpoint(x: number, feetY: number): void {
    this.playSfx('checkpoint');
    this.showToast('Point de contrôle !', 'good');
    this.fx.burst(x, feetY - 110, this.fx.colors.laser, 12);
    // On ne recule jamais le point de réapparition.
    if (x >= this.respawnX) {
      this.respawnX = x;
      this.respawnFeetY = feetY;
    }
  }

  collectCrystal(x: number, y: number): void {
    this.crystals += 1;
    this.hud.set('crystals', this.crystals);
    // Ramassages rapprochés : la note monte.
    if (this.clockMs - this.lastCrystalAt < 650) this.crystalCombo = Math.min(this.crystalCombo + 1, 10);
    else this.crystalCombo = 0;
    this.lastCrystalAt = this.clockMs;
    this.playSfx('crystal', 1, 1 + this.crystalCombo * 0.06);
    this.fx.spark(x, y, this.fx.colors.crystal, 7);
  }

  collectPower(kind: PowerUpKind, x: number, y: number): void {
    this.playSfx('powerup');
    this.fx.burst(x, y, 0xffffff, 12);
    if (kind === 'shield') {
      this.player.shield = true;
      this.showToast('Bouclier !', 'good');
    } else {
      // Un seul bonus temporaire à la fois : le nouveau remplace l'ancien.
      this.power = kind;
      this.powerLeftMs = POWER_DURATION_MS[kind];
      this.player.canDoubleJump = kind === 'doublejump';
      this.showToast(kind === 'triple' ? 'Tir triple !' : 'Double saut !', 'good');
    }
    this.refreshPowerHud();
  }

  private updatePower(dtMs: number): void {
    if (this.power) {
      this.powerLeftMs -= dtMs;
      if (this.powerLeftMs <= 0) {
        this.power = null;
        this.powerLeftMs = 0;
        this.player.canDoubleJump = false;
      }
    }
    this.refreshPowerHud();
  }

  private clearPowers(): void {
    this.power = null;
    this.powerLeftMs = 0;
    this.player.canDoubleJump = false;
    this.player.shield = false;
    this.refreshPowerHud();
  }

  private refreshPowerHud(): void {
    let kind: PowerUpKind | null = null;
    let left = 0;
    if (this.power) {
      kind = this.power;
      // Pas de 2 % : quelques mises à jour par seconde seulement.
      left = Math.ceil((Math.max(0, this.powerLeftMs) / POWER_DURATION_MS[this.power]) * 50) / 50;
    } else if (this.player.shield) {
      kind = 'shield';
      left = 1;
    }
    this.hud.set('power', kind);
    this.hud.set('powerLeft', left);
  }

  private updateHeatHud(dtMs: number): void {
    this.hud.set('overheated', this.blaster.overheated);
    this.heatHudMs -= dtMs;
    if (this.heatHudMs <= 0) {
      this.heatHudMs = 100;
      this.hud.set('heat', Math.round(this.blaster.heat * 50) / 50);
    }
  }

  // ---------------------------------------------------------------- Fin du niveau

  private startExit(): void {
    if (this.state !== 'play') return;
    this.state = 'exit';
    this.spores.clear();
    this.ship.launch(this.player, () => this.finishLevel());
  }

  /** Décollage en cours : termine le niveau sans attendre la fin de l'animation. Faux sinon. */
  finishExitNow(): boolean {
    if (this.state !== 'exit' || !this.built) return false;
    this.finishLevel();
    return true;
  }

  private finishLevel(): void {
    const s = this.session;
    if (!s || this.state !== 'exit') return;
    this.state = 'over';
    const timeMs = Math.round(this.elapsedMs);
    const seconds = Math.floor(timeMs / 1000);
    const total = this.parsed.crystalsTotal;
    const score =
      this.crystals * SCORE_CRYSTAL +
      this.enemiesKilled * SCORE_ENEMY +
      Math.max(0, TIME_BONUS_REF_S - seconds) * TIME_BONUS_PER_S +
      this.lives * SCORE_LIFE;
    const ratio = total > 0 ? this.crystals / total : 1;
    const stars: 1 | 2 | 3 = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;
    const result: StageResult = {
      stageId: s.stage.id,
      score,
      stars,
      timeMs,
      crystals: this.crystals,
      crystalsTotal: total,
      enemies: this.enemiesKilled,
    };
    endSession(s, () => s.hooks.onComplete(result));
  }

  // ---------------------------------------------------------------- Raccourcis audio / HUD

  playSfx(id: SfxId, volume = 1, pitch = 1): void {
    if (this.session) sfx(this.session, id, volume, pitch);
  }

  vibrate(pattern: number | number[]): void {
    if (this.session) haptic(this.session, pattern);
  }

  showToast(text: string, kind?: ToastKind): void {
    if (this.session) toast(this.session, text, kind);
  }

  // ---------------------------------------------------------------- Nettoyage / outils de test

  private onShutdown(): void {
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.world) {
      this.world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, this.onWorldStep, this);
      this.world = null;
    }
    if (this.parallax) {
      try {
        this.parallax.destroy();
      } catch (err) {
        reportError('parallax.destroy', err);
      }
      this.parallax = null;
    }
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.built = false;
    this.session = null;
    if (DEV) {
      const w = window as unknown as { __xr2d?: { scene?: unknown } };
      if (w.__xr2d && w.__xr2d.scene === this) delete w.__xr2d;
    }
  }

  private exposeDevHelper(): void {
    const w = window as unknown as { __xr2d?: unknown };
    w.__xr2d = {
      scene: this,
      /** Place Kaï sur la case (col, row) (pieds en bas de la case). */
      teleport: (col: number, row: number): void => {
        if (this.state !== 'play') return;
        this.player.teleport(col * TILE + TILE / 2, (row + 1) * TILE);
        this.snapCamera();
      },
      /** Invincibilité (les chutes ramènent au dernier sol sûr). */
      god: (on = true): void => {
        this.player.god = on;
      },
      win: (): void => {
        if (this.state === 'play') this.startExit();
      },
      kill: (): void => {
        if (this.state === 'play') this.killPlayer(true);
      },
    };
  }
}
