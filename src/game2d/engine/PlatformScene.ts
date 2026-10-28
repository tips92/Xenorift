import * as Phaser from 'phaser';
import type { PowerUpKind, SfxId, StageResult, ToastKind, WeaponId } from '../../core/types';
import { isWeaponId } from '../../core/weapons';
import { createParallax, generatePlatformArt } from '../art';
import type { ParallaxHandle } from '../art';
import { TILE_FRAME } from '../art/keys';
import {
  INVULNERABLE_MS,
  MAX_HEARTS,
  MAX_HEARTS_CAP,
  POWER_DURATION_MS,
  SPEED_BOOST_MUL,
  STARS_RATIO,
  START_LIVES,
  TILE,
} from '../constants';
import { Doors } from './doors';
import type { DoorArrival } from './doors';
import { EnemyManager } from './enemies';
import { Effects } from './effects';
import { ExitShip } from './exitShip';
import { HudSync } from './hudSync';
import { Items } from './items';
import { buildTilemap, CELL_HAZARD, CELL_ONEWAY, CELL_SOLID, Grid, parseLevel } from './mapBuilder';
import type { GridPos, ParsedLevel } from './mapBuilder';
import { Movers } from './movers';
import { Player, PLAYER_HALF_H } from './Player';
import { ShotPool, SporePool } from './projectiles';
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
  SPEED_TRAIL_MS,
  TIME_BONUS_PER_S,
  TIME_BONUS_REF_S,
} from './tuning';
import { Gun } from './weapons';

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
  /** Tirs de Kaï, toutes armes (nom historique, lu par les tests e2e). */
  lasers!: ShotPool;
  spores!: SporePool;
  movers!: Movers;
  ship!: ExitShip;
  gun!: Gun;
  hud!: HudSync;
  doors!: Doors;

  /** Horloge de jeu (ms, hors pause). */
  clockMs = 0;
  lives = START_LIVES;
  hearts = MAX_HEARTS;
  /** Cœurs au départ et à la réapparition (hooks.loadout.maxHearts : 3 + cœurs du hangar). */
  maxHearts = MAX_HEARTS;
  crystals = 0;
  enemiesKilled = 0;
  /**
   * Bonus à durée, cumulables : temps restant (ms, 0 = inactif) de la vitesse (bloc 1) et de la cadence (bloc 3).
   * Le bouclier est porté par le joueur. Tout est perdu avec une vie.
   */
  speedLeftMs = 0;
  rapidLeftMs = 0;
  /** Délai pendant lequel un contact ennemi ne blesse pas, juste après un écrasement. */
  stompGraceMs = 0;

  private built = false;
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private parallax: ParallaxHandle | null = null;
  private world: Phaser.Physics.Arcade.World | null = null;
  private elapsedMs = 0;
  /** Cumul de temps avant la prochaine bouffée de traînée (bonus de vitesse). */
  private trailMs = 0;
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
  /** Arrivée d'un passage de porte (objet réutilisé, écrit par Doors.enter). */
  private readonly doorArrival: DoorArrival = { x: 0, feetY: 0 };

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
    this.maxHearts = this.loadoutMaxHearts(this.session);
    this.hearts = this.maxHearts;
    this.crystals = 0;
    this.enemiesKilled = 0;
    this.speedLeftMs = 0;
    this.rapidLeftMs = 0;
    this.trailMs = 0;
    this.stompGraceMs = 0;
    this.camOffsetX = CAMERA_LOOKAHEAD;
    this.lastBumpAt = -1e9;
    this.heatHudMs = 0;
    this.crystalCombo = 0;
    this.lastCrystalAt = -1e9;
    this.doorArrival.x = 0;
    this.doorArrival.feetY = 0;
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
    // Portes : elles ne lisent this.player qu'à la mise à jour, on peut donc les créer avant lui.
    this.doors = new Doors(this, p.doors);
    this.enemies = new EnemyManager(this, p.enemies);
    const exit = p.exit ?? this.fallbackExit(p);
    this.ship = new ExitShip(this, exit.col, exit.row);

    // Équipement de la partie (hooks.loadout, fixe) : arme tenue, ses améliorations (et celles des autres
    // armes), compétence du double saut. Cœurs max : init().
    const weapon = this.loadoutWeapon(session);
    this.respawnX = p.start.col * TILE + TILE / 2;
    this.respawnFeetY = (p.start.row + 1) * TILE;
    this.player = new Player(this, this.respawnX, this.respawnFeetY, weapon);
    this.player.canDoubleJump = this.loadoutDoubleJump(session);
    this.lasers = new ShotPool(this);
    this.spores = new SporePool(this);
    this.gun = new Gun(this, weapon, session.hooks.loadout ? session.hooks.loadout.mods : undefined);

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
      maxHearts: this.maxHearts,
      lives: this.lives,
      crystals: 0,
      crystalsTotal: p.crystalsTotal,
      weapon,
      heat: 0,
      overheated: false,
      speedLeft: 0,
      rapidLeft: 0,
      shield: false,
    });

    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.parallax.resize(this.scale.gameSize.width, this.scale.gameSize.height);

    if (DEV) this.exposeDevHelper();
  }

  /** Arme équipée pour la partie (laser si le loadout manque ou est invalide). */
  private loadoutWeapon(session: Session): WeaponId {
    const lo = session.hooks.loadout;
    return lo && isWeaponId(lo.equipped) ? lo.equipped : 'laser';
  }

  /** Cœurs max : hooks.loadout.maxHearts, entier borné à MAX_HEARTS..MAX_HEARTS_CAP (sinon MAX_HEARTS). */
  private loadoutMaxHearts(session: Session | null): number {
    const lo = session ? session.hooks.loadout : null;
    const n: unknown = lo ? lo.maxHearts : undefined;
    if (typeof n !== 'number' || !Number.isFinite(n)) return MAX_HEARTS;
    return Math.min(MAX_HEARTS_CAP, Math.max(MAX_HEARTS, Math.floor(n)));
  }

  /** Double saut : compétence apprise (ou mode test). */
  private loadoutDoubleJump(session: Session): boolean {
    const lo = session.hooks.loadout;
    return !!(lo && lo.skills && lo.skills.doubleJump);
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

    // Bonus d'abord : leur fin vaut dès cette image (vitesse de Kaï, fiche de l'arme).
    this.updatePower(dtMs);
    p.controlUpdate(dt, dtMs, this.clockMs, input);
    this.gun.update(dt, dtMs, input);
    // Portes : « interact » (↑ seul, refusé si Tir est tenu) consommé à chaque image, pour qu'un appui
    // loin d'une porte ne serve pas plus tard ; devant une porte reliée, Kaï ressort devant l'autre.
    if (input.consumePress('interact') && this.doors.enter(this.doorArrival)) {
      p.teleport(this.doorArrival.x, this.doorArrival.feetY);
      this.snapCamera();
    }
    this.doors.update(dtMs, true);

    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, true);

    if (this.state === 'play') this.checkHeadBump();
    if (this.state === 'play') this.enemies.checkPlayer();
    if (this.state === 'play') this.checkHazards();
    if (this.state === 'play' && this.ship.touches(p)) this.startExit();
    if (this.state === 'play' && p.top > this.parsed.height) this.onFall();

    if (this.state === 'play') {
      p.visualUpdate(dt, this.clockMs);
      this.updateSpeedTrail(dtMs);
    }
    this.updateHeatHud(dtMs);
  }

  /** Bonus de vitesse : traînée lumineuse derrière Kaï quand il court (particules recyclées). */
  private updateSpeedTrail(dtMs: number): void {
    const p = this.player;
    const vx = p.body.velocity.x;
    if (this.speedLeftMs <= 0 || Math.abs(vx) < 60) {
      this.trailMs = 0;
      return;
    }
    this.trailMs += dtMs;
    while (this.trailMs >= SPEED_TRAIL_MS) {
      this.trailMs -= SPEED_TRAIL_MS;
      // Sur le torse : un peu sous l'épaule, sur la moitié de la hauteur du corps.
      this.fx.speedStreak(p.x - (vx > 0 ? 12 : -12), p.shoulderY + 8, p.body.height * 0.5);
    }
  }

  /** Le monde continue de vivre pendant la mort / le décollage (sans ramassage). */
  private updateWorld(dt: number, dtMs: number): void {
    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, false);
    this.doors.update(dtMs, false);
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
    } else if (this.state === 'exit') {
      this.player.syncArmToSprite();
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

  /**
   * Plateformes traversables : ne bloquent que si le corps était au-dessus avant ce pas. Sert aussi aux
   * ennemis : la descente d'étage (↓ + Saut) ne vaut que pour Kaï.
   */
  private processTile(obj: unknown, tileObj: unknown): boolean {
    const tile = tileObj as Phaser.Tilemaps.Tile;
    if (this.grid.at(tile.x, tile.y) !== CELL_ONEWAY) return true;
    const body = (obj as Phaser.Types.Physics.Arcade.GameObjectWithBody).body as Phaser.Physics.Arcade.Body;
    if (body === this.player.body && this.player.dropThrough) return false;
    return body.prev.y + body.height <= tile.pixelY + 1;
  }

  /** Plateformes mobiles (Kaï seulement) : dessus seulement, et traversées pendant une descente d'étage. */
  private processMover(playerObj: unknown, moverObj: unknown): boolean {
    if (this.player.dropThrough) return false;
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
    this.gun.reset();
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
    this.doors.reset();
    this.player.invulnMs = INVULNERABLE_MS;
    this.hearts = this.maxHearts;
    this.hud.set('hearts', this.hearts);
    this.player.canDoubleJump = this.loadoutDoubleJump(s);
    this.gun.reset();
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
    // Vitesse et cadence se cumulent ; reprendre le même bonus remet sa durée au maximum.
    if (kind === 'shield') {
      this.player.shield = true;
      this.showToast('Bouclier !', 'good');
    } else if (kind === 'speed') {
      this.speedLeftMs = POWER_DURATION_MS.speed;
      this.showToast('Vitesse !', 'good');
    } else {
      this.rapidLeftMs = POWER_DURATION_MS.rapid;
      this.showToast('Cadence !', 'good');
    }
    this.applyPowers();
    this.refreshPowerHud();
  }

  private updatePower(dtMs: number): void {
    if (this.speedLeftMs > 0) this.speedLeftMs = Math.max(0, this.speedLeftMs - dtMs);
    if (this.rapidLeftMs > 0) this.rapidLeftMs = Math.max(0, this.rapidLeftMs - dtMs);
    this.applyPowers();
    this.refreshPowerHud();
  }

  /** Effets des bonus à durée : vitesse de Kaï, fiche de l'arme (cadence). */
  private applyPowers(): void {
    this.player.speedMul = this.speedLeftMs > 0 ? SPEED_BOOST_MUL : 1;
    this.gun.setRapid(this.rapidLeftMs > 0);
  }

  /** Vie perdue : plus aucun bonus (la compétence du double saut, elle, reste). */
  private clearPowers(): void {
    this.speedLeftMs = 0;
    this.rapidLeftMs = 0;
    this.trailMs = 0;
    this.player.shield = false;
    this.applyPowers();
    this.refreshPowerHud();
  }

  private refreshPowerHud(): void {
    // Pas de 2 % : quelques mises à jour par seconde seulement.
    this.hud.set('speedLeft', Math.ceil((this.speedLeftMs / POWER_DURATION_MS.speed) * 50) / 50);
    this.hud.set('rapidLeft', Math.ceil((this.rapidLeftMs / POWER_DURATION_MS.rapid) * 50) / 50);
    this.hud.set('shield', this.player.shield);
  }

  private updateHeatHud(dtMs: number): void {
    this.hud.set('overheated', this.gun.overheated);
    this.heatHudMs -= dtMs;
    if (this.heatHudMs <= 0) {
      this.heatHudMs = 100;
      this.hud.set('heat', Math.round(this.gun.heat * 50) / 50);
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
    const stars: 1 | 2 | 3 = ratio >= STARS_RATIO.three ? 3 : ratio >= STARS_RATIO.two ? 2 : 1;
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
      /** Change l'arme en cours de partie (jauge remise à zéro ; identifiant inconnu ignoré). Renvoie l'arme tenue. */
      weapon: (id?: unknown): WeaponId => {
        if (isWeaponId(id) && this.built) {
          this.player.setWeapon(id);
          this.gun.setWeapon(id);
          this.hud.set('weapon', id);
          this.updateHeatHud(1000);
        }
        return this.gun.weapon;
      },
      /** Donne un bonus ('speed' | 'rapid' | 'shield') comme si Kaï l'avait ramassé. */
      power: (kind: unknown): void => {
        if (this.state !== 'play' || (kind !== 'speed' && kind !== 'rapid' && kind !== 'shield')) return;
        this.collectPower(kind, this.player.x, this.player.feetY - 35);
      },
      /**
       * Arme (améliorations du hangar, fiche effective, chauffe), cœurs, bonus et tirs en vol : copie lisible
       * depuis les tests.
       */
      info: () => {
        const g = this.gun;
        const p = this.player;
        return {
          weapon: g.weapon,
          heat: g.heat,
          overheated: g.overheated,
          mods: { ...g.mods },
          stats: { ...g.stats },
          hearts: this.hearts,
          maxHearts: this.maxHearts,
          speedLeftMs: this.speedLeftMs,
          rapidLeftMs: this.rapidLeftMs,
          shield: p.shield,
          speedMul: p.speedMul,
          canDoubleJump: p.canDoubleJump,
          shots: this.lasers.bolts
            .filter((b) => b.alive)
            .map((b) => ({
              weapon: b.weapon,
              x: b.img.x,
              y: b.img.y,
              vx: b.vx,
              vy: b.vy,
              dist: b.dist,
              range: b.range,
              damage: b.damage,
            })),
        };
      },
    };
  }
}
