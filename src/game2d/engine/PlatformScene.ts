import * as Phaser from 'phaser';
import { CREW } from '../../core/hangar';
import { RADIO } from '../../core/story';
import type { BossHud, BossId, CrewId, PowerUpKind, RadioId, SfxId, StageResult, StartAt, ToastKind, WeaponId } from '../../core/types';
import { isWeaponId } from '../../core/weapons';
import { createParallax, destroyArenaArt, destroyLevelArt, generateArenaArt, generateLevelArt, generatePlatformArt } from '../art';
import type { ParallaxHandle } from '../art';
import { ANIM, TILE_FRAME } from '../art/keys';
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
import { Arena } from './arena';
import { bossFlyers, bossMusic, bossWalkers, createBoss, destroyBossArt, generateBossArt } from './bosses';
import type { Boss } from './bosses/types';
import { Doors } from './doors';
import type { DoorArrival } from './doors';
import { EnemyManager } from './enemies';
import { Effects } from './effects';
import { EXIT_MAX_MS, createArrival, createExit } from './exit';
import type { LevelArrival, LevelExit } from './exit';
import { Glyphs } from './glyphs';
import { HudSync } from './hudSync';
import { Items } from './items';
import { LevelEvents } from './levelEvents';
import type { LevelEvent } from '../levels/types';
import { buildTilemap, CELL_HAZARD, CELL_ONEWAY, Grid, parseLevel } from './mapBuilder';
import type { EnemySpawn, GridPos, ParsedLevel } from './mapBuilder';
import { Movers } from './movers';
import { Mushrooms } from './mushrooms';
import { Castaway, rescueDelayMs } from './npc';
import { Player, PLAYER_HALF_H } from './Player';
import { ShotPool, SporePool } from './projectiles';
import { SporeRain } from './sporeRain';
import { FallingTrunk } from './trunk';
import { bossBar, endSession, haptic, music, musicLevel, radio, reportError, sfx, toast } from './session';
import type { Session } from './session';
import { riftForStage } from '../../core/rifts';
import { readFightSnapshot, readRiftSnapshot } from './snapshot';
import type { FightSnapshot, RiftSnapshot } from './snapshot';
import { Vortex } from './vortex';
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
  SCORE_BOSS,
  SCORE_CRYSTAL,
  SCORE_ENEMY,
  SCORE_GUARDIAN,
  SCORE_LIFE,
  SPEED_TRAIL_MS,
  TIME_BONUS_PER_S,
} from './tuning';
import { Gun } from './weapons';

// Scène Phaser du mode plateforme. Réutilisée d'un niveau à l'autre : tout l'état est remis à zéro dans init().

export interface PlatformSceneData {
  session: Session;
}

/** 'enter' : arrivée de Kaï au départ (LevelData.start), commandes coupées, au plus ARRIVAL_MS. */
export type PlayState = 'enter' | 'play' | 'dead' | 'exit' | 'over';
type DamageSource = 'hazard' | 'enemy' | 'spore';

const DEV = import.meta.env.DEV;

/** Naufragé du niveau : l'équipier que donne l'étape (check-levels : 'N' seulement avec une récompense d'équipage). */
function castawayOf(session: Session): CrewId | null {
  for (const r of session.stage.rewards) if (r.kind === 'crew') return r.id;
  return null;
}

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
  /** Sortie du niveau (Comète ou balise de LUMA) ; null pour un niveau sans sortie dans la carte. */
  exit: LevelExit | null = null;
  /** Arrivée au départ (Comète qui repart à vide, faisceau de LUMA) ; null sans LevelData.start ou depuis un K. */
  arrival: LevelArrival | null = null;
  /** Glyphes astréens des ruines ('G') ; null s'il n'y en a pas. */
  glyphs: Glyphs | null = null;
  gun!: Gun;
  hud!: HudSync;
  doors!: Doors;
  /** Messages de la radio du niveau (fenêtres de colonnes, première surchauffe) ; une partie = un objet. */
  levelEvents: LevelEvents | null = null;
  /** Arène de boss du niveau et son boss (lu par ShotPool.probe) ; null sans arène. */
  arena: Arena | null = null;
  boss: Boss | null = null;
  /** Boss vaincu pendant cette partie : prime SCORE_BOSS (gardien : SCORE_GUARDIAN). */
  bossBeaten = false;
  /** Défaite du gardien (état 'exit') : Kaï, sans commandes, finit son saut avant d'être figé au sol. */
  kaiLanding = false;
  /** Champignons 'o' (null sans champignon), troncs des secousses, pluie de spores (null sans pluie). */
  mushrooms: Mushrooms | null = null;
  trunks: FallingTrunk[] = [];
  sporeRain: SporeRain | null = null;
  /** Passages de la créature joués (événement 'shadow'), pour les tests. */
  shadowPasses = 0;
  /** Naufragé 'N' (Tess) ; null sans naufragé. */
  npc: Castaway | null = null;
  /**
   * « Réessayer le combat » (choix 7 du plan 04) : état noté quand Kaï allume le point de contrôle d'avant l'arène (ou
   * repris du départ imposé), rendu par onFail si la partie se perd en plein combat. `fightRetry` : partie reprise
   * ainsi (pas de prime de vies).
   */
  fightSnap: FightSnapshot | null = null;
  fightRetry = false;
  /** Vortex 'V' (faille du Vide) ; null s'il n'y en a pas. */
  vortex: Vortex | null = null;
  /** Départ vers la faille déjà demandé : un seul appel à onRift. */
  private riftLeft = false;
  /** Retour de faille : la bombe a harmonisé (toast). -1 : pas un retour. */
  private riftBack: -1 | 0 | 1 = -1;

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
  /** Cadre de départ du glissement vers l'arène (px) : la vue à la fermeture, toute la carte à l'ouverture. */
  private camFromX = 0;
  private camFromW = 0;
  /** Dernier point de contrôle avant l'arène (null sans arène ou sans K avant elle). */
  private arenaK: GridPos | null = null;
  private lastBumpAt = -1e9;
  private heatHudMs = 0;
  private crystalCombo = 0;
  private lastCrystalAt = -1e9;
  /** Arrivée d'un passage de porte (objet réutilisé, écrit par Doors.enter). */
  private readonly doorArrival: DoorArrival = { x: 0, feetY: 0 };
  /** Textures du boss générées pour cette partie (libérées à l'arrêt de la scène). */
  private bossArt: BossId | null = null;
  /** Textures des objets du niveau (champignon, tronc, tache de spore) générées : libérées à l'arrêt. */
  private levelArt = false;
  /** Barre de boss : objet réutilisé, dernier état envoyé (vie en %). */
  private readonly bossHud: BossHud = { name: '', life: 1, phase: 1, phases: 1, steps: 0 };
  private bossHudOn = false;
  private bossHudLife = -1;
  private bossHudPhase = 0;

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
    this.exit = null;
    this.arrival = null;
    this.glyphs = null;
    this.levelEvents = null;
    this.arena = null;
    this.boss = null;
    this.bossBeaten = false;
    this.kaiLanding = false;
    this.bossArt = null;
    this.mushrooms = null;
    this.trunks = [];
    this.sporeRain = null;
    this.shadowPasses = 0;
    this.npc = null;
    this.fightSnap = null;
    this.fightRetry = false;
    this.vortex = null;
    this.riftLeft = false;
    this.riftBack = -1;
    this.arenaK = null;
    this.levelArt = false;
    this.bossHudOn = false;
    this.bossHudLife = -1;
    this.bossHudPhase = 0;
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
    this.camFromX = 0;
    this.camFromW = 0;
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

    // Textures générées par code (synchrones), puis décor de fond (gardien du monde à sa distance).
    generatePlatformArt(this, theme);
    this.parallax = createParallax(this, theme, { creature: level.creature ?? 'far' });

    const p = parseLevel(level);
    this.parsed = p;
    this.grid = new Grid(p.cols, p.rows, p.cells);
    const built = buildTilemap(this, p);
    this.map = built.map;
    this.layer = built.layer;
    // Objets du niveau : champignons, tronc d'une secousse, taches de la pluie de spores, naufragé et sa capsule
    // (libérés dans onShutdown).
    const events = level.events ?? [];
    const need = {
      mushroom: p.mushrooms.length > 0,
      trunk: events.some((e) => e.kind === 'quake'),
      sporeSpot: events.some((e) => e.kind === 'spores'),
      castaway: p.castaway !== null,
    };
    if (need.mushroom || need.trunk || need.sporeSpot || need.castaway) {
      generateLevelArt(this, theme, need);
      this.levelArt = true;
    }
    if (need.mushroom) this.mushrooms = new Mushrooms(this, p.mushrooms);
    for (const e of events) if (e.kind === 'quake') this.trunks.push(new FallingTrunk(this, e.trunk[0], e.trunk[1]));
    if (p.castaway) {
      // Dissolution calée sur les répliques du sauvetage (déclencheur 'rescue' de la radio). Déjà dans l'équipage
      // (hooks.loadout.crew : niveau rejoué) : seule sa capsule reste.
      const lines: string[] = [];
      for (const r of level.radio ?? []) if ('on' in r && r.on === 'rescue') lines.push(RADIO[r.id].text);
      const who = castawayOf(session);
      const lo = session.hooks.loadout;
      const aboard = who !== null && !!lo && Array.isArray(lo.crew) && lo.crew.includes(who);
      this.npc = new Castaway(this, p.castaway, rescueDelayMs(lines), this.onCastawayRescued, aboard);
    }
    // Arène de boss : barrières et planches du boss générées avec le niveau (libérées dans onShutdown).
    const bossId = p.arena && p.boss && level.boss ? level.boss : null;
    if (bossId) {
      generateArenaArt(this, theme);
      generateBossArt(this, bossId, theme);
      this.bossArt = bossId;
    }

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
    if (p.vortices.length > 0) {
      const rift = riftForStage(session.stage.id);
      this.vortex = new Vortex(this, p.vortices, rift && rift.radio ? rift.radio : null);
    }
    // Renforts du boss créés dès maintenant, cachés (le collider des marcheurs est posé plus bas).
    const reserve: EnemySpawn[] = [];
    if (bossId && p.boss) {
      for (let i = 0; i < bossWalkers(bossId); i++) reserve.push({ kind: 'w', col: p.boss.col, row: p.boss.row });
      for (let i = 0; i < bossFlyers(bossId); i++) reserve.push({ kind: 'f', col: p.boss.col, row: p.boss.row - 2 });
    }
    this.enemies = new EnemyManager(this, p.enemies, reserve);
    this.exit = p.exit ? createExit(this, p.exit) : null;
    if (bossId && p.arena && p.boss) {
      const arena = new Arena(this, p.arena);
      this.arena = arena;
      this.enemies.fence(arena.outerLeft, arena.outerRight);
      const spot = { x: p.boss.col * TILE + TILE / 2, feetY: (p.boss.row + 1) * TILE, left: arena.left, right: arena.right };
      this.boss = createBoss(bossId, this, spot);
    }

    // Équipement de la partie (hooks.loadout, fixe) : arme tenue, ses améliorations (et celles des autres
    // armes), compétence du double saut. Cœurs max : init().
    const weapon = this.loadoutWeapon(session);
    this.arenaK = this.arenaCheckpoint(p);
    const start = this.startPoint(session, p);
    this.respawnX = start.col * TILE + TILE / 2;
    this.respawnFeetY = (start.row + 1) * TILE;
    this.player = new Player(this, this.respawnX, this.respawnFeetY, weapon);
    this.player.canDoubleJump = this.loadoutDoubleJump(session);
    this.lasers = new ShotPool(this);
    this.spores = new SporePool(this);
    if (need.sporeSpot) this.sporeRain = new SporeRain(this);
    this.gun = new Gun(this, weapon, session.hooks.loadout ? session.hooks.loadout.mods : undefined);
    this.levelEvents = new LevelEvents(level.radio, this.sayRadio, level.events, this.playLevelEvent);
    this.gun.onOverheat = this.onGunOverheat;
    // Nouvel essai d'un combat : état noté au point de contrôle d'avant l'arène (départ à ce K).
    const back = session.hooks.riftReturn;
    const riftSnap = back ? readRiftSnapshot(back.snapshot, level.id) : null;
    const at = session.hooks.startAt;
    const snap = !riftSnap && at && at.at === 'boss' && start === this.arenaK ? readFightSnapshot(at.snapshot, level.id) : null;
    if (riftSnap) this.restoreRift(riftSnap, back?.cleared === true);
    else if (snap) this.restoreFight(snap);
    this.glyphs = p.glyphs.length > 0 ? new Glyphs(this, p.glyphs) : null;
    // Arrivée au départ P seulement (pas depuis un point de contrôle, ?at=boss) : Kaï figé jusqu'à onLanded.
    if (!riftSnap && level.start && start === p.start) {
      this.arrival = createArrival(this, level.start, this.respawnX, this.respawnFeetY);
      this.state = 'enter';
      this.arrival.play(this.player, this.onLanded);
    }

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

    // Caméra : suivi adouci, anticipation dans le sens de la course, hauteur calée sur le dernier sol. Cadre :
    // updateCameraBounds (appelé par snapCamera).
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.camOffsetX = CAMERA_LOOKAHEAD * this.player.facing;
    this.snapCamera();
    cam.startFollow(this.camTarget, true, CAMERA_LERP_X, CAMERA_LERP_Y);

    this.hud = new HudSync(session.hooks.hud, {
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      lives: this.lives,
      crystals: this.crystals,
      crystalsTotal: p.crystalsTotal,
      weapon: this.player.weapon,
      heat: 0,
      overheated: false,
      speedLeft: 0,
      rapidLeft: 0,
      shield: false,
    });
    if (snap || riftSnap) this.refreshPowerHud();
    if (riftSnap) this.showToast(this.riftBack === 1 ? 'Faille harmonisée' : 'De retour dans la salle', this.riftBack === 1 ? 'good' : 'info');

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

  /** Dernier point de contrôle avant l'arène, ou null. */
  private arenaCheckpoint(p: ParsedLevel): GridPos | null {
    if (!p.arena) return null;
    let k: GridPos | null = null;
    for (const c of p.checkpoints) if (c.col < p.arena.col0) k = c;
    return k;
  }

  /** Départ : P, ou le dernier point de contrôle avant l'arène avec ModeHooks.startAt `boss` (?at=boss, nouvel essai). */
  private startPoint(session: Session, p: ParsedLevel): GridPos {
    const at = session.hooks.startAt;
    if (!at || at.at !== 'boss') return p.start;
    return this.arenaK ?? p.start;
  }

  /** Nouvel essai d'un combat : la partie reprend l'état noté (3 vies, cœurs pleins, boss à neuf : rien à faire). */
  private restoreFight(s: FightSnapshot): void {
    this.fightSnap = s;
    this.fightRetry = true;
    this.elapsedMs = s.timeMs;
    this.crystals = s.crystals;
    this.enemiesKilled = s.enemiesKilled;
    this.speedLeftMs = s.speedLeftMs;
    this.rapidLeftMs = s.rapidLeftMs;
    this.player.shield = s.shield;
    this.applyPowers();
    this.items.restore(s.items);
    // Départ sur le K d'avant l'arène : allumé d'emblée, même s'il avait été contourné (état noté à l'entrée).
    if (this.arenaK) this.items.lightCheckpoint(this.parsed.checkpoints.indexOf(this.arenaK));
    this.enemies.restore(s.deadEnemies);
    if (this.levelEvents && s.events) this.levelEvents.restore(s.events);
    if (this.npc) this.npc.restore(s.castaway);
    for (let i = 0; i < this.trunks.length; i++) this.trunks[i].restore(s.trunks[i] === true);
  }

  /** Retour de faille : même salle, même endroit, vies et progrès gardés. Pas un « Réessayer le combat ». */
  private restoreRift(s: RiftSnapshot, cleared: boolean): void {
    this.riftBack = cleared ? 1 : 0;
    this.elapsedMs = s.timeMs;
    this.crystals = s.crystals;
    this.enemiesKilled = s.enemiesKilled;
    this.speedLeftMs = s.speedLeftMs;
    this.rapidLeftMs = s.rapidLeftMs;
    this.player.shield = s.shield;
    this.applyPowers();
    this.items.restore(s.items);
    this.enemies.restore(s.deadEnemies);
    if (this.levelEvents && s.events) this.levelEvents.restore(s.events);
    if (this.npc) this.npc.restore(s.castaway);
    for (let i = 0; i < this.trunks.length; i++) this.trunks[i].restore(s.trunks[i] === true);
    this.hearts = Math.max(1, Math.min(this.maxHearts, Math.round(s.hearts)));
    this.lives = Math.max(1, Math.round(s.lives));
    this.respawnX = s.respawnX;
    this.respawnFeetY = s.respawnY;
    if (s.weapon !== this.player.weapon) {
      this.player.setWeapon(s.weapon);
      this.gun.setWeapon(s.weapon);
    }
    this.player.facing = s.facing;
    this.player.teleport(s.x, s.y);
    this.player.invulnMs = 500;
  }

  /** État noté au moment d'entrer dans le vortex (une fois, hors de la boucle de jeu). */
  private noteRift(): RiftSnapshot {
    const s = this.session;
    return {
      level: s ? s.level.id : '',
      timeMs: this.elapsedMs,
      crystals: this.crystals,
      enemiesKilled: this.enemiesKilled,
      speedLeftMs: this.speedLeftMs,
      rapidLeftMs: this.rapidLeftMs,
      shield: this.player.shield,
      items: this.items.snapshot(),
      deadEnemies: this.enemies.snapshot(),
      events: this.levelEvents ? this.levelEvents.snapshot() : null,
      castaway: this.npc ? this.npc.snapshot() : false,
      trunks: this.trunks.map((t) => t.state !== 'stand'),
      x: this.player.x,
      y: this.player.feetY,
      hearts: this.hearts,
      lives: this.lives,
      weapon: this.player.weapon,
      facing: this.player.facing,
      respawnX: this.respawnX,
      respawnY: this.respawnFeetY,
    };
  }

  /** Haut sur le vortex : fige la partie et demande à l'interface le voyage. */
  private tryRift(): boolean {
    if (this.riftLeft || this.state !== 'play' || !this.vortex || !this.vortex.enter(this.player)) return false;
    const s = this.session;
    if (!s || !s.hooks.onRift) return false;
    const rift = riftForStage(s.stage.id);
    if (!rift || !rift.placed) return false;
    this.riftLeft = true;
    this.state = 'over';
    const trip = { id: rift.id, snapshot: this.noteRift() };
    try {
      s.hooks.onRift(trip);
    } catch (err) {
      reportError('onRift', err);
    }
    return true;
  }

  /** Note l'état de la partie (point de contrôle d'avant l'arène atteint, ou combat commencé sans lui). */
  private noteFight(): void {
    const s = this.session;
    if (!s || !this.arena) return;
    this.fightSnap = {
      level: s.level.id,
      timeMs: this.elapsedMs,
      crystals: this.crystals,
      enemiesKilled: this.enemiesKilled,
      speedLeftMs: this.speedLeftMs,
      rapidLeftMs: this.rapidLeftMs,
      shield: this.player.shield,
      items: this.items.snapshot(),
      deadEnemies: this.enemies.snapshot(),
      events: this.levelEvents ? this.levelEvents.snapshot() : null,
      castaway: this.npc ? this.npc.snapshot() : false,
      trunks: this.trunks.map((t) => t.state !== 'stand'),
    };
  }

  /** Point de reprise « Réessayer le combat » : combat en cours (arène fermée) et état noté, sinon null. */
  fightRetryPoint(): StartAt | null {
    if (!this.built || !this.fightSnap || !this.arena || this.arena.state !== 'closed') return null;
    return { at: 'boss', snapshot: this.fightSnap };
  }

  /** Double saut : compétence apprise (ou mode test). */
  private loadoutDoubleJump(session: Session): boolean {
    const lo = session.hooks.loadout;
    return !!(lo && lo.skills && lo.skills.doubleJump);
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
      case 'enter':
        // Radio dès l'arrivée (Kaï au départ).
        if (this.levelEvents) this.levelEvents.update(this.player.x);
        this.updateWorld(dt, dtMs);
        break;
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
        if (this.kaiLanding) this.landKai();
        break;
      default:
        break;
    }

    this.updateCamera(dt);
    this.syncBossHud(s);
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
    // Portes et naufragé : « interact » (↑ seul, refusé si Tir est tenu) consommé à chaque image, pour qu'un appui
    // loin d'une porte ne serve pas plus tard ; près du naufragé, il le secourt (les portes attendent son départ) ;
    // devant une porte reliée, Kaï ressort devant l'autre.
    const npc = this.npc;
    const npcHolds = npc !== null && npc.holdsDoors(p);
    if (input.consumePress('interact')) {
      if (npc && npc.rescue(p)) {
        if (this.levelEvents) this.levelEvents.trigger('rescue');
      } else if (!npcHolds && this.doors.enter(this.doorArrival)) {
        const a = this.doorArrival;
        p.teleport(a.x, a.feetY);
        this.snapCamera();
        if (this.glyphs) this.glyphs.wake(a.x, a.feetY - PLAYER_HALF_H);
        if (this.levelEvents) this.levelEvents.trigger('door');
      } else if (!npcHolds) {
        this.tryRift();
      }
    }
    this.doors.update(dtMs, !npcHolds);
    if (this.vortex && this.state === 'play') {
      this.vortex.update(dtMs, p, true);
      const say = this.vortex.takeRadio();
      if (say) radio(s, say);
    } else if (this.vortex) {
      this.vortex.update(dtMs, p, false);
    }
    // Radio : après les portes (une fenêtre franchie par une porte ou une téléportation est sautée).
    if (this.levelEvents) this.levelEvents.update(p.x);
    if (this.glyphs) this.glyphs.update(p.x, p.feetY - PLAYER_HALF_H);
    // Arène : Kaï entre les bornes → barrières fermées, combat.
    const arena = this.arena;
    const boss = this.boss;
    if (arena && boss && arena.state === 'open' && boss.state === 'wait' && arena.holds(p)) this.startBossFight(s, arena, boss);
    this.updateArena(dt, dtMs);

    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, true);
    this.updateDecor(dtMs);

    if (this.state === 'play') this.checkHeadBump();
    if (this.state === 'play') this.enemies.checkPlayer();
    if (this.state === 'play' && boss) this.checkBoss(boss);
    if (this.state === 'play') this.checkHazards();
    if (this.state === 'play' && this.exit && this.exit.touches(p)) this.startExit();
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

  /** Le monde continue de vivre pendant la mort / la sortie (sans ramassage). */
  private updateWorld(dt: number, dtMs: number): void {
    this.updateArena(dt, dtMs);
    this.enemies.update(dt, dtMs);
    this.lasers.update(dt);
    this.spores.update(dt);
    this.items.update(dt, this.clockMs, false);
    this.doors.update(dtMs, false);
    this.updateDecor(dtMs);
  }

  /** Champignons, troncs, pluie de spores, naufragé (animés à la main, sur l'horloge de la scène). */
  private updateDecor(dtMs: number): void {
    if (this.mushrooms) this.mushrooms.update(dtMs);
    for (let i = 0; i < this.trunks.length; i++) this.trunks[i].update(dtMs);
    if (this.sporeRain) this.sporeRain.update(dtMs);
    if (this.npc) this.npc.update(dtMs, this.state === 'play');
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
    this.updateCameraBounds();
    this.camGroundFeet = this.player.feetY;
    this.updateCamTarget();
    this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
  }

  /**
   * Cadre de la caméra (seul appel à setBounds) : toute la carte, ou l'arène fermée (camBlend, adouci). Une arène
   * plus étroite que la vue est centrée (Phaser calerait la vue sur son bord gauche). Appelé par snapCamera, au
   * redimensionnement (largeur de vue variable) et pendant le glissement du cadre depuis camFromX / camFromW (à la
   * fermeture, la vue elle-même : elle glisse dès la première image au lieu de sauter à la fin).
   */
  private updateCameraBounds(): void {
    const cam = this.cameras.main;
    const W = this.parsed.width;
    const H = this.parsed.height;
    const a = this.arena;
    const k = a ? a.camBlend : 0;
    if (!a || k <= 0) {
      cam.setBounds(0, 0, W, H);
      return;
    }
    let x0 = a.outerLeft;
    let w = a.outerRight - a.outerLeft;
    if (w < cam.width) {
      x0 = (a.outerLeft + a.outerRight - cam.width) / 2;
      w = cam.width;
    }
    x0 = Math.max(0, Math.min(x0, W - w));
    if (k < 1) {
      x0 = this.camFromX + (x0 - this.camFromX) * k;
      w = this.camFromW + (w - this.camFromW) * k;
      // Vue élargie entre-temps (rotation) : cadre centré.
      if (w < cam.width) {
        x0 -= (cam.width - w) / 2;
        w = cam.width;
      }
      x0 = Math.max(0, Math.min(x0, W - w));
    }
    cam.setBounds(x0, 0, w, H);
  }

  /** Après la synchronisation Arcade (POST_UPDATE) : visuels recalés sur les corps physiques. */
  private onPostUpdate(): void {
    if (!this.built) return;
    if (this.state === 'play') {
      this.player.syncVisual();
      this.updateCamTarget();
    } else if (this.state === 'exit' && this.kaiLanding) {
      this.player.syncVisual();
    } else if (this.state === 'exit' || this.state === 'enter') {
      this.player.syncArmToSprite();
    }
    if (this.exit) this.exit.sync();
    if (this.arrival) this.arrival.sync();
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
    if (this.built) this.updateCameraBounds();
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
    this.fx.shake(0.6, 180);
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
    // Dernière vie perdue en plein combat : l'interface proposera « Réessayer le combat ».
    const retry = this.lives <= 0 ? this.fightRetryPoint() : null;
    this.hearts = 0;
    this.hud.set('lives', this.lives);
    this.hud.set('hearts', 0);
    this.clearPowers();
    this.gun.reset();
    this.updateHeatHud(1000);
    this.player.startDeath(hop);
    this.playSfx('death');
    this.vibrate([40, 60, 90]);
    if (hop) this.fx.shake(0.8, 220);

    this.time.delayedCall(hop ? 1000 : 650, () => {
      const s = this.session;
      if (!s) return;
      if (this.lives <= 0) {
        this.state = 'over';
        endSession(s, () => s.hooks.onFail('Plus de vies !', retry ?? undefined));
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
    this.resetBossFight(s);
    this.doors.reset();
    this.player.invulnMs = INVULNERABLE_MS;
    this.hearts = this.maxHearts;
    this.hud.set('hearts', this.hearts);
    this.player.canDoubleJump = this.loadoutDoubleJump(s);
    this.gun.reset();
    this.lasers.clear();
    this.spores.clear();
    if (this.sporeRain) this.sporeRain.clear();
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
    if (this.levelEvents) this.levelEvents.trigger('checkpoint');
    this.fx.burst(x, feetY - 110, this.fx.colors.laser, 12);
    // On ne recule jamais le point de réapparition.
    if (x >= this.respawnX) {
      this.respawnX = x;
      this.respawnFeetY = feetY;
    }
    const k = this.arenaK;
    if (k && Math.floor(x / TILE) === k.col && feetY === (k.row + 1) * TILE) this.noteFight();
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

  // ---------------------------------------------------------------- Arène et boss

  /** Niveau qui finit par la défaite du gardien (niveau 3 d'un monde) : pas de sortie, pas de fuite. */
  private get guardianLevel(): boolean {
    return !!this.session && this.session.level.ending === 'guardian';
  }

  private startBossFight(s: Session, arena: Arena, boss: Boss): void {
    // Point de contrôle d'avant l'arène contourné (sauté très haut) : état noté à l'entrée.
    if (!this.fightSnap) this.noteFight();
    const cam = this.cameras.main;
    this.camFromX = cam.scrollX;
    this.camFromW = cam.width;
    arena.close();
    // Intensité 0 explicite : un nouvel essai retrouve le gardien déjà en musique (music() garde alors l'intensité).
    music(s, bossMusic(boss.id));
    musicLevel(s, 0);
    // Le gardien quitte le décor : c'est lui qui arrive dans l'arène.
    if (this.parallax && this.guardianLevel) this.parallax.setCreature(false);
    boss.start();
    if (this.levelEvents) this.levelEvents.trigger('boss');
  }

  /** Intensité de la musique du combat (gardien : une par phase), appelée par le boss. */
  setMusicLevel(n: number): void {
    if (this.session) musicLevel(this.session, n);
  }

  /** Barrières, cadre de la caméra et boss (aussi pendant la mort et la sortie). */
  private updateArena(dt: number, dtMs: number): void {
    if (this.arena && this.arena.update(dtMs)) this.updateCameraBounds();
    if (this.boss) this.boss.update(dt, dtMs);
  }

  /** Contact avec le boss, après les ennemis : rebond par le dessus, sinon dégâts (pas juste après un rebond). */
  private checkBoss(boss: Boss): void {
    const p = this.player;
    if (boss.stomp && boss.stomp(p)) return;
    if (this.stompGraceMs > 0) return;
    const x = boss.hurts(p);
    if (!Number.isNaN(x)) this.damagePlayer(x, 'enemy');
  }

  /**
   * Appelé par le boss vaincu : barrières rouvertes, renforts éclatés, musique du niveau (il s'enfuit seul). Gardien :
   * sa défaite, dans l'arène fermée, termine le niveau (startGuardianExit).
   */
  onBossBeaten(): void {
    const s = this.session;
    this.bossBeaten = true;
    if (this.guardianLevel) {
      this.enemies.recall(true);
      this.startGuardianExit();
      return;
    }
    // Le cadre se rouvre vers toute la carte (la caméra suit Kaï à son rythme une fois libérée).
    this.camFromX = 0;
    this.camFromW = this.parsed.width;
    if (this.arena) this.arena.open(true);
    this.enemies.recall(true);
    if (s) music(s, s.level.music);
    if (this.boss) this.showToast(`${this.boss.name} s’enfuit !`, 'good');
  }

  /** Vie perdue pendant le combat : arène rouverte, boss remis à neuf (choix 6), renforts rangés. */
  private resetBossFight(s: Session): void {
    if (!this.arena || this.arena.state !== 'closed') return;
    this.arena.reset();
    if (this.boss) this.boss.reset();
    this.enemies.recall(false);
    music(s, s.level.music);
    if (this.parallax && this.guardianLevel) this.parallax.setCreature(true);
  }

  /** Aide de test (win) : combat passé, arène ouverte pour de bon, sans prime. */
  private skipBossFight(s: Session): void {
    const arena = this.arena;
    if (!arena || arena.state === 'done') return;
    const fighting = arena.state === 'closed';
    arena.open(false);
    if (!fighting) return;
    if (this.boss) this.boss.reset();
    this.enemies.recall(false);
    music(s, s.level.music);
  }

  /** Barre de boss : affichée pendant le combat, envoyée seulement quand la vie (en %) ou la phase change. */
  private syncBossHud(s: Session): void {
    const b = this.boss;
    if (!b || b.state !== 'fight' || !this.arena || this.arena.state !== 'closed') {
      if (this.bossHudOn) {
        this.bossHudOn = false;
        bossBar(s, null);
      }
      return;
    }
    const life = Math.ceil((b.life / b.maxLife) * 100);
    if (this.bossHudOn && life === this.bossHudLife && b.phase === this.bossHudPhase) return;
    this.bossHudOn = true;
    this.bossHudLife = life;
    this.bossHudPhase = b.phase;
    const h = this.bossHud;
    h.name = b.name;
    h.life = life / 100;
    h.phase = b.phase;
    h.phases = b.phases;
    h.steps = b.maxLife;
    bossBar(s, h);
  }

  // ---------------------------------------------------------------- Fin du niveau

  /** Kaï touche la sortie : état 'exit' le temps de sa séquence (au plus EXIT_MAX_MS), puis finishLevel. */
  private startExit(): void {
    const exit = this.exit;
    if (this.state !== 'play' || !exit) return;
    this.state = 'exit';
    this.spores.clear();
    if (this.sporeRain) this.sporeRain.clear();
    exit.launch(this.player, () => this.finishLevel());
  }

  /**
   * Défaite du gardien (choix 13 du plan 04) : état 'exit' le temps de sa défaite dans la scène (Boss.defeatMs, au
   * plus EXIT_MAX_MS), puis finishLevel ; sur perte du contexte, finishExitNow termine sans attendre. Kaï, sans
   * commandes ni dégâts, finit son saut puis reste figé au sol (landKai).
   */
  private startGuardianExit(): void {
    if (this.state !== 'play') return;
    this.state = 'exit';
    this.spores.clear();
    if (this.sporeRain) this.sporeRain.clear();
    const p = this.player;
    p.body.velocity.x = 0;
    p.sprite.alpha = 1;
    this.kaiLanding = true;
    this.landKai();
    const ms = Math.min(EXIT_MAX_MS, this.boss && this.boss.defeatMs ? this.boss.defeatMs : EXIT_MAX_MS);
    this.time.delayedCall(ms, () => this.finishLevel());
  }

  /** Défaite du gardien : Kaï retombe (corps Arcade, sans commandes), puis il est figé au sol, au repos. */
  private landKai(): void {
    const p = this.player;
    const b = p.body;
    if (!b.blocked.down && !b.touching.down) {
      p.playAnim(b.velocity.y < 0 ? ANIM.playerJump : ANIM.playerFall);
      return;
    }
    this.kaiLanding = false;
    p.freeze();
    p.playAnim(ANIM.playerIdle);
    p.syncVisual();
  }

  /** Sortie en cours : termine le niveau sans attendre la fin de l'animation. Faux sinon. */
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
    const bossBonus = this.bossBeaten ? (this.guardianLevel ? SCORE_GUARDIAN : SCORE_BOSS) : 0;
    const score =
      this.crystals * SCORE_CRYSTAL +
      this.enemiesKilled * SCORE_ENEMY +
      Math.max(0, s.level.parTimeS - seconds) * TIME_BONUS_PER_S +
      // Nouvel essai d'un combat : 3 vies rendues, sans prime.
      (this.fightRetry ? 0 : this.lives) * SCORE_LIFE +
      bossBonus;
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
    if (bossBonus > 0) result.bossBonus = bossBonus;
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

  /** Fin de l'arrivée : Kaï posé au départ, jouable. */
  private readonly onLanded = (): void => {
    const s = this.session;
    if (this.state !== 'enter' || !s) return;
    this.player.teleport(this.respawnX, this.respawnFeetY);
    this.state = 'play';
    try {
      s.hooks.input.clearPresses();
    } catch (err) {
      reportError('input.clearPresses', err);
    }
  };

  private readonly sayRadio = (id: RadioId): void => {
    if (this.session) radio(this.session, id);
  };

  private readonly onGunOverheat = (): void => {
    if (this.levelEvents) this.levelEvents.trigger('overheat');
  };

  /** Événement du décor (LevelEvents) : ombre de la créature, secousse qui abat un tronc, pluie de spores. */
  private readonly playLevelEvent = (e: LevelEvent): void => {
    if (e.kind === 'shadow') {
      const ms = this.parallax ? this.parallax.shadowPass() : 0;
      if (ms > 0) {
        this.shadowPasses++;
        this.playSfx('whaleCry', 0.8);
      }
    } else if (e.kind === 'quake') {
      this.fx.shake(1, 900);
      this.playSfx('quake');
      this.vibrate([90, 50, 140]);
      for (const t of this.trunks) if (t.col === e.trunk[0] && t.row === e.trunk[1]) t.fall();
    } else if (this.sporeRain) {
      this.sporeRain.start(e.rain[0], e.rain[1]);
    }
  };

  /** Naufragé téléporté à bord : il rejoindra l'équipage à la réussite du niveau (récompense de l'étape). */
  private readonly onCastawayRescued = (): void => {
    const s = this.session;
    const crew = (s && castawayOf(s)) || 'tess';
    this.showToast(`${CREW[crew].name} est à bord !`, 'good');
  };

  /** Tronc couché (cases pleines) : ennemis pris dessous écrasés, Kaï pris dessous posé dessus. */
  onTrunkDown(t: FallingTrunk): void {
    const x0 = t.col * TILE;
    const x1 = (t.col + 4) * TILE;
    const y0 = (t.row - 1) * TILE;
    const y1 = (t.row + 1) * TILE;
    this.enemies.crushIn(x0, y0, x1, y1);
    const p = this.player;
    if (this.state !== 'play' || p.right <= x0 || p.left >= x1 || p.feetY <= y0 || p.top >= y1) return;
    const onStump = p.x < x0 + TILE;
    p.teleport(p.x, onStump ? t.row * TILE : y0);
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
    if (this.boss) {
      this.boss.destroy();
      this.boss = null;
    }
    this.arena = null;
    // Objets d'affichage déjà détruits : seules les textures (globales) restent à libérer.
    if (this.bossArt) {
      try {
        destroyBossArt(this, this.bossArt);
        destroyArenaArt(this);
      } catch (err) {
        reportError('destroyBossArt', err);
      }
      this.bossArt = null;
    }
    if (this.levelArt) {
      try {
        destroyLevelArt(this);
      } catch (err) {
        reportError('destroyLevelArt', err);
      }
      this.levelArt = false;
    }
    if (this.vortex) {
      this.vortex.destroy();
      this.vortex = null;
    }
    this.mushrooms = null;
    this.trunks = [];
    this.sporeRain = null;
    this.npc = null;
    this.built = false;
    this.session = null;
    if (DEV) {
      const w = window as unknown as { __xr2d?: { scene?: unknown } };
      if (w.__xr2d && w.__xr2d.scene === this) delete w.__xr2d;
    }
  }

  /** Aide de test : Kaï posé dans l'arène, sur la première case libre après la première borne (champignon sauté). */
  private placeInArena(): boolean {
    const a = this.arena;
    if (!a) return false;
    const y = a.row * TILE + TILE / 2;
    let c = a.col0 + 1;
    while (c < a.col1 - 1 && this.grid.solidAtPx(c * TILE + TILE / 2, y)) c++;
    this.player.teleport(c * TILE + TILE / 2, (a.row + 1) * TILE);
    this.snapCamera();
    return true;
  }

  /** Aide de test (win) dans le niveau du gardien : Kaï dans l'arène, combat lancé, gardien vaincu. */
  private winGuardian(s: Session): void {
    const a = this.arena;
    const b = this.boss;
    if (!a || !b || !this.placeInArena()) return;
    if (a.state === 'open' && b.state === 'wait') this.startBossFight(s, a, b);
    b.takeDamage(b.life);
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
      /**
       * Kaï posé juste avant la sortie (balise ou Comète), qui démarre aussitôt (état 'exit') ; un combat de boss
       * est passé (arène ouverte pour de bon, sans prime). Niveau du gardien (sans sortie) : Kaï posé dans l'arène,
       * combat lancé, puis défaite du gardien (prime comprise) : état 'exit', résultats à la fin de la défaite.
       */
      win: (): void => {
        const exit = this.exit;
        const s = this.session;
        if (this.state !== 'play' || !s) return;
        if (!exit) {
          this.winGuardian(s);
          return;
        }
        this.skipBossFight(s);
        this.player.teleport(exit.approachX, exit.feetY);
        this.snapCamera();
        this.startExit();
      },
      /** Boss de l'arène (null sans arène). */
      boss: {
        info: () => {
          const b = this.boss;
          const a = this.arena;
          if (!b || !a) return null;
          return {
            id: b.id,
            name: b.name,
            state: b.state,
            life: b.life,
            maxLife: b.maxLife,
            phase: b.phase,
            phases: b.phases,
            x: b.x,
            y: b.y,
            beaten: this.bossBeaten,
            arena: { state: a.state, col0: a.col0, col1: a.col1, row: a.row, left: a.left, right: a.right, camBlend: a.camBlend },
            ...(b.info ? b.info() : {}),
          };
        },
        /**
         * Kaï posé dans l'arène, sur la première case libre après la première borne (un champignon collé à la borne
         * est sauté) : le combat commence à l'image suivante.
         */
        enter: (): void => {
          if (this.state === 'play') this.placeInArena();
        },
        /** Touches directes pendant le combat (où que soit Kaï) ; renvoie les touches restantes. */
        hit: (n = 1): number => {
          const b = this.boss;
          if (!b) return -1;
          b.takeDamage(Number(n));
          return b.life;
        },
        /** Boss vaincu (comme par les tirs : fuite, barrières, prime). */
        win: (): void => {
          const b = this.boss;
          if (b && b.state === 'fight') b.takeDamage(b.life);
        },
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
