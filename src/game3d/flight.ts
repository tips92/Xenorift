import * as THREE from 'three';
import { BASE_SHIELDS, BOOST_MULS, MAX_SHIELDS_CAP, MAX_SHIP_GUN_LEVEL } from '../core/hangar';
import { SHIP_AIM } from '../core/shipGuns';
import type { CourseId, FlightHud, ModeHandle, ModeHooks, SfxId, StageDef, StageResult } from '../core/types';
import { AsteroidField, chunkGeometry } from './asteroids';
import {
  CORRIDOR_R,
  ENEMY_KINDS,
  GATE_PASS_R,
  GATE_R,
  LAT_ACCEL,
  MAX_LAT,
  SHIP_HIT_R,
  buildCourse,
  pathAt,
  type Course,
  type CourseTheme,
  type EnemyKind,
} from './courses';
import { Debris, Particles, ScreenFx, Streaks, makeGlowPointsMaterial, setGlowScale } from './effects';
import { ENEMY_DEFS, EnemyField, createEnemyCounts, type EnemyCounts, type EnemyEvents, type ShipState } from './enemies';
import { Environment } from './environment';
import { GateField, WARP_R, WarpPortal } from './gates';
import { CrystalPickups, PICKUP_CAP, PICKUP_COLOR } from './pickups';
import { ContextLostError, acquireRenderer, discardRenderer, isContextLost, pixelRatio, releaseRenderer } from './renderer';
import { mulberry32 } from './rng';
import { ShipModel } from './ship';
import {
  SHOT_CAP,
  SHOT_R,
  ShipGun,
  ShotPool,
  aimDirection,
  clearAim,
  copyAim,
  createAimTarget,
  shotMiss,
  type AimTarget,
  type ShotHitFn,
} from './shots';
import { bakeSky, type SkyBake } from './sky';
import { Bin, clamp, damp, smoothstep } from './util';

// Partie de vol spatial : machine à états (compte à rebours → vol → distorsion / explosion),
// pilotage, portails, collisions, combat (tir de la Comète, ennemis, cristaux), caméra de poursuite,
// HUD et nettoyage complet.

type Phase = 'intro' | 'fly' | 'warp' | 'dead' | 'timeout' | 'done';

const BOOST_MULT = 1.6;
/** Turbo de série : jauge vidée en 2,5 s, rechargée en 5 s (× modules du hangar : hooks.loadout.ship). */
const BOOST_DRAIN = 1 / 2.5;
const BOOST_FILL = 1 / 5;
const BOOST_MUL_MAX = BOOST_MULS[BOOST_MULS.length - 1];
const INVULN_TIME = 1.0;
const COUNTDOWN = 3;
const WARP_TIME = 1.5;
const DEAD_TIME = 1.6;
const TIMEOUT_TIME = 1.1;
const GATE_BONUS = 2;
const GATE_PENALTY = 5;
const FOV_BASE = 64;
const FOV_BOOST = 76;
const FOV_WARP = 122;
const CAM_BACK = 9.5;
const CAM_UP = 2.7;
const MAX_DT = 1 / 20;
const SUB_DT = 1 / 60;
const STICK_DEADZONE = 0.06;
/** Après la fin (résultats affichés par l'interface), on arrête de dessiner au bout de ce délai. */
const IDLE_AFTER_END = 2.5;
/** Contexte WebGL perdu : délai d'attente de sa restauration avant d'abandonner l'étape (ms). */
const RESTORE_WAIT_MS = 2000;
/** Restaurations sur place acceptées par partie (au-delà, GPU jugé instable). */
const MAX_RESTORES = 2;
export const CONTEXT_LOST_REASON = 'Liaison graphique perdue';
/** Points d'un astéroïde détruit par les tirs, d'un cristal ramassé (ennemis : fiches de enemies.ts). */
const ROCK_POINTS = 10;
const CRYSTAL_POINTS = 50;
/** Appui bref sur TIR mémorisé (plus rapide que la cadence), comme au sol (s). */
const FIRE_QUEUE = 0.15;
/** Visée : cône prioritaire = guidage max + cette marge (°), les gros rochers au bord restent atteignables. */
const AIM_SURE_MARGIN = 1;

const _look = new THREE.Vector3();
const _c = new THREE.Color();
const _path = { x: 0, y: 0 };
const _avoid = { x: 0, y: 0 };
/** Centre du dernier rocher éclaté (burstRock). */
const _rc = new THREE.Vector3();
const _mz = new THREE.Vector3();
const _aimDir = new THREE.Vector3();

/** Valeur d'un module de la Comète bornée à [min, max] ; absente ou invalide (aperçu ancien) : `def`. */
function shipValue(v: unknown, min: number, max: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : def;
}

interface DevApi {
  autopilot(on?: boolean): void;
  win(): void;
  fail(): void;
  timeScale(s: number): void;
  info(): Record<string, unknown>;
  /** Avance la simulation de `seconds` d'un coup (tests rapides), puis dessine une image. */
  advance(seconds: number): Record<string, unknown>;
  /** Temps moyen (ms) de rendu d'une image, synchronisé avec le GPU. */
  bench(frames?: number): number;
  /**
   * Place un ennemi (essaim : formation entière) à `distance` devant la Comète ; renvoie le nombre placé.
   * `variant` (0..1, facultatif ; au hasard sans lui) : orientation et phase de l'essaim, côté du virage du
   * chasseur, clignotement de la mine (tests reproductibles).
   */
  spawn(type: string, distance?: number, variant?: number): number;
  /** Force le tir (tests), en tir automatique comme en tir manuel. */
  fire(on?: boolean): void;
}

export class FlightRun implements ModeHandle {
  private readonly container: HTMLElement;
  private readonly stage: StageDef;
  private readonly hooks: ModeHooks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bin = new Bin();
  private readonly sky: SkyBake;
  private readonly course: Course;
  private readonly theme: CourseTheme;
  private readonly ship: ShipModel;
  private readonly gates: GateField;
  private readonly portal: WarpPortal;
  private readonly rocks: AsteroidField;
  private readonly env: Environment;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly particles: Particles;
  private readonly debris: Debris;
  private readonly streaks: Streaks;
  private readonly screen: ScreenFx;
  private readonly resizeObs: ResizeObserver | null = null;
  private readonly onWinResize = (): void => this.resize();
  private readonly gateNextColor: THREE.Color;
  private readonly sparkColor = new THREE.Color('#ffffff');
  private readonly fireColor = new THREE.Color('#ff8a2a');
  private readonly hotColor = new THREE.Color('#ffe08a');
  private readonly hullColor = new THREE.Color('#e8ecff');
  private readonly cyanColor = new THREE.Color('#3ff0ff');
  private readonly crystalColor: THREE.Color;
  /** Cristaux du vol (scintillement du ramassage). */
  private readonly pickupColor: THREE.Color;
  /** Modules de la Comète (hooks.loadout.ship), lus au départ : boucliers max, vidange et recharge du turbo (/s). */
  private readonly maxShield: number;
  private readonly boostDrain: number;
  private readonly boostFill: number;

  // --- Combat (3b) : canon (hooks.loadout.ship.gunLevel), projectiles, cristaux, ennemis
  private readonly gun: ShipGun;
  private readonly shots: ShotPool;
  private readonly pickups: CrystalPickups;
  private readonly enemies: EnemyField;
  private readonly shotColor: THREE.Color;
  /** Cible de la visée, recalculée à chaque sous-pas de vol ; rocher candidat (aucun ennemi atteignable). */
  private readonly aim = createAimTarget();
  private readonly rockAim = createAimTarget();
  private readonly cosCone = Math.cos(THREE.MathUtils.degToRad(SHIP_AIM.coneDeg));
  /** Cône prioritaire : cibles que le guidage atteint (homingDeg + AIM_SURE_MARGIN). */
  private readonly cosSure = Math.cos(
    THREE.MathUtils.degToRad(Math.min(SHIP_AIM.coneDeg, SHIP_AIM.homingDeg + AIM_SURE_MARGIN)),
  );
  private readonly homingRad = THREE.MathUtils.degToRad(SHIP_AIM.homingDeg);
  /** La cible visée peut être touchée par le prochain tir (tir automatique). */
  private targetHit = false;
  /** La Comète vue par les ennemis (tenue à jour avant chaque EnemyField.update). */
  private readonly shipState: ShipState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 0, r: SHIP_HIT_R };
  private readonly enemyCounts: EnemyCounts = createEnemyCounts();
  /** Options des sons fréquents (tirs, impacts), réutilisées. */
  private readonly sfxOpts = { volume: 1, pitch: 1 };
  /** Impact d'un projectile (fonction liée une fois). */
  private readonly onShotHit: ShotHitFn = (kind, index, damage, x, y, z) => this.shotHit(kind, index, damage, x, y, z);
  /** Rappels du champ d'ennemis (objet créé une fois). */
  private readonly enemyEvents: EnemyEvents = {
    orbFired: () => this.hooks.audio.sfx('enemyOrb'),
    enemyKilled: (kind, x, y, z, points, crystals) => this.enemyKilled(kind, x, y, z, points, crystals),
    shipHit: (_cause, x, y) => this.damageShip(x, y),
  };

  // --- État de la partie
  private phase: Phase = 'intro';
  private phaseT = 0;
  private time = 0;
  private countdownStep = -1;
  private x = 0;
  private y = 0;
  private z = 0;
  private vx = 0;
  private vy = 0;
  private speed = 0;
  private slow = 1;
  private travel = 0;
  private boostGauge = 1;
  private boosting = false;
  private boostLocked = false;
  private boostVis = 0;
  private shield = BASE_SHIELDS;
  private invuln = 0;
  private noDamage = true;
  private timeLeft: number;
  private flightTime = 0;
  private nextGate = 0;
  private gatesPassed = 0;
  private combo = 0;
  private result: StageResult | null = null;
  private endT = 0;
  /** Points des rochers, ennemis et cristaux (ajoutés au score du vol). */
  private points = 0;
  /** Cristaux ramassés pendant ce vol (StageResult.crystals). */
  private crystals = 0;
  private rocksDestroyed = 0;
  /** Cristaux lâchés depuis le départ (aide DEV : cristaux de chaque destruction). */
  private crystalsDropped = 0;
  /** Tirs partis et bouche du dernier (aide DEV : cadence, alternance des canons). */
  private shotsFired = 0;
  private lastMuzzle = -1;
  private fireQueue = 0;
  /** Ennemis déjà simulés pendant ce sous-pas (par simFly, Comète vulnérable). */
  private enemyStepped = false;

  // --- Rendu / caméra
  private shake = 0;
  private fov = FOV_BASE;
  private camDist = CAM_BACK;
  private camX = 0;
  private camY = CAM_UP;
  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  private warpPush = 0;
  private hudT = 0;
  private lastHudTime = -1;

  // --- Boucle
  private running = false;
  private paused = false;
  private destroyed = false;
  private finished = false;
  private raf = 0;
  private last = 0;
  private autopilot = false;
  private apBoost = false;
  private timeScale = 1;
  private devApi: DevApi | null = null;
  private devFirstFrame = true;
  /** Tir forcé (__xr3d.fire). */
  private devFire = false;

  // --- Perte du contexte WebGL
  private ctxLost = false;
  private restores = 0;
  private lossTimer = 0;
  /** Renderer jeté (contexte perdu) : plus aucun appel de rendu. */
  private rendererDropped = false;
  private ctxCanvas: HTMLCanvasElement | null = null;
  private readonly onCtxLost = (e: Event): void => {
    e.preventDefault(); // autorise la restauration (three le fait aussi)
    this.contextLost();
  };
  private readonly onCtxRestored = (): void => this.contextRestored();

  constructor(container: HTMLElement, stage: StageDef, hooks: ModeHooks) {
    this.container = container;
    this.stage = stage;
    this.hooks = hooks;
    const ship = hooks.loadout ? hooks.loadout.ship : undefined;
    this.maxShield = Math.floor(shipValue(ship && ship.maxShields, BASE_SHIELDS, MAX_SHIELDS_CAP, BASE_SHIELDS));
    this.boostDrain = BOOST_DRAIN * shipValue(ship && ship.boostDrainMul, 1 / BOOST_MUL_MAX, 1, 1);
    this.boostFill = BOOST_FILL * shipValue(ship && ship.boostFillMul, 1, BOOST_MUL_MAX, 1);
    this.shield = this.maxShield;
    const courseId: CourseId = stage.levelId === 'asteroids' ? 'asteroids' : 'nebula';
    this.course = buildCourse(courseId);
    this.theme = this.course.def.theme;
    this.timeLeft = this.course.def.startTime;
    const theme = this.theme;
    // Canon : 0 canon léger, 1 mitrailleuse, 2-3 ses améliorations ; portée selon la vitesse du parcours
    const gunLevel = Math.floor(shipValue(ship && ship.gunLevel, 0, MAX_SHIP_GUN_LEVEL, 0));
    this.gun = new ShipGun(gunLevel, this.course.def.speed);
    this.shotColor = new THREE.Color(this.gun.stats.color);
    this.crystalColor = new THREE.Color(theme.crystal);
    this.pickupColor = new THREE.Color(PICKUP_COLOR);

    try {
      this.renderer = acquireRenderer(container);
      // Perte / restauration du contexte écoutées avant la cuisson du ciel et la compilation
      // (moments les plus exposés ; l'événement arrive juste après le constructeur).
      this.ctxCanvas = this.renderer.domElement;
      this.ctxCanvas.addEventListener('webglcontextlost', this.onCtxLost);
      this.ctxCanvas.addEventListener('webglcontextrestored', this.onCtxRestored);
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      this.camera = new THREE.PerspectiveCamera(FOV_BASE, w / h, 0.3, 9500);
      this.scene.add(this.camera);

      // --- Ciel cuit une fois (fond + reflets)
      const sky = bakeSky(this.renderer, theme, this.course.def.seed, this.bin);
      this.sky = sky;
      this.scene.background = sky.background;
      this.scene.fog = new THREE.Fog(theme.skyBase, theme.fogNear, theme.fogFar);

      // --- Lumières
      const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
      const key = new THREE.DirectionalLight(theme.key, theme.keyIntensity);
      key.position.set(4.5, 8, 5);
      const rim = new THREE.DirectionalLight(theme.rim, theme.rimIntensity);
      rim.position.set(-7, 2.5, -8);
      this.scene.add(hemi, key, rim);

      // --- Décor, parcours, vaisseau, effets
      this.glowMat = makeGlowPointsMaterial(this.bin);
      const rng = mulberry32(this.course.def.seed + 99);
      this.env = new Environment(courseId, theme, rng, this.bin, pixelRatio(), this.glowMat);
      this.scene.add(this.env.group);

      this.gates = new GateField(this.course, theme, this.bin);
      this.scene.add(this.gates.group);
      this.portal = new WarpPortal(this.course.warpZ, theme, this.bin);
      this.scene.add(this.portal.group);
      this.rocks = new AsteroidField(this.course, theme, sky.background, this.bin);
      this.scene.add(this.rocks.group);

      this.ship = new ShipModel(this.bin, sky.env, gunLevel);
      this.scene.add(this.ship.root);

      this.particles = new Particles(900, this.glowMat, this.bin);
      this.scene.add(this.particles.points);
      this.debris = new Debris(80, this.bin.add(chunkGeometry()), this.rocks.material);
      this.scene.add(this.debris.mesh);
      this.streaks = new Streaks(150, theme.streak, this.bin);
      this.scene.add(this.streaks.mesh);

      // --- Combat : projectiles, cristaux, ennemis (après les particules, qu'ils partagent)
      this.shots = new ShotPool(SHOT_CAP, this.bin);
      this.scene.add(this.shots.mesh);
      this.pickups = new CrystalPickups(PICKUP_CAP, this.bin);
      this.scene.add(this.pickups.group);
      this.enemies = new EnemyField(this.course, theme, this.particles, this.enemyEvents, this.bin);
      this.scene.add(this.enemies.group);
      this.screen = new ScreenFx(container);

      this.gateNextColor = new THREE.Color(theme.gateNext);

      // --- Taille du conteneur
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObs = new ResizeObserver(() => this.resize());
        this.resizeObs.observe(container);
      }
      window.addEventListener('resize', this.onWinResize);
      this.resize();

      // Première pose (caméra d'intro), puis compilation des shaders avant de lancer la boucle
      this.updateVisuals(0);
      const t0 = performance.now();
      this.renderer.compile(this.scene, this.camera);
      if (import.meta.env.DEV) console.debug(`[flight3d] compile ${Math.round(performance.now() - t0)} ms`);
    } catch (err) {
      // Échec de construction : on libère ce qui a déjà été créé avant de remonter l'erreur
      this.destroyed = true;
      this.removeContextListeners();
      this.resizeObs?.disconnect();
      window.removeEventListener('resize', this.onWinResize);
      (this as unknown as { screen?: ScreenFx }).screen?.dispose();
      (this as unknown as { enemies?: EnemyField }).enemies?.dispose();
      this.scene.clear();
      this.bin.disposeAll();
      // Contexte perdu en route : renderer jeté, la prochaine tentative repartira d'un contexte neuf
      const r = (this as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
      const lost = !!r && isContextLost(r);
      if (r && lost) discardRenderer(r);
      else releaseRenderer(r);
      throw lost ? new ContextLostError() : err;
    }

    // --- Démarrage
    hooks.audio.music(courseId);
    hooks.input.clearPresses();
    if (hooks.settings.tilt) hooks.input.calibrateTilt();
    this.pushHud();

    if (import.meta.env.DEV) this.installDevApi();
    // Contexte perdu pendant la cuisson ou la compilation (son événement n'est pas encore arrivé)
    if (isContextLost(this.renderer)) this.contextLost();
    this.startLoop();
  }

  // ================================================================ ModeHandle

  pause(): void {
    if (this.destroyed || this.paused) return;
    this.paused = true;
    this.stopLoop();
    // Contexte perdu pendant la pause (appli en arrière-plan) : le délai de grâce repartira à la reprise
    this.clearLossTimer();
  }

  resume(): void {
    if (this.destroyed || !this.paused) return;
    this.paused = false;
    if (this.ctxLost) {
      // Toujours sans contexte : on attend encore sa restauration, puis fin d'étape
      this.armLossTimer();
      return;
    }
    if (this.phase === 'done' && this.endT > IDLE_AFTER_END) {
      if (!this.rendererDropped) this.renderer.render(this.scene, this.camera);
      return;
    }
    // Pas de saut de temps : on repart de maintenant
    this.startLoop();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLoop();
    this.clearLossTimer();
    this.removeContextListeners();
    this.resizeObs?.disconnect();
    window.removeEventListener('resize', this.onWinResize);
    if (this.devApi && (window as unknown as { __xr3d?: DevApi }).__xr3d === this.devApi) {
      delete (window as unknown as { __xr3d?: DevApi }).__xr3d;
    }
    this.screen.dispose();
    this.scene.background = null;
    this.scene.fog = null;
    // Contexte perdu, ou restauré en cours de partie (three garde des écouteurs liés à l'ancien
    // contexte) : le renderer partagé ne resservira pas. Jeté avant la libération, qui reste muette.
    const drop = this.ctxLost || this.restores > 0 || isContextLost(this.renderer);
    if (drop) this.dropRenderer();
    this.enemies.dispose();
    this.shots.clear();
    this.pickups.clear();
    // Tampons d'instances (rochers, éclats, tirs, cristaux…) : hors du Bin, libérés par l'InstancedMesh
    this.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.scene.clear();
    this.bin.disposeAll();
    if (!drop) releaseRenderer(this.renderer);
  }

  // ================================================================ Perte du contexte WebGL
  // GPU réinitialisé (pilote, compilation trop longue), WebView en arrière-plan, manque de mémoire.
  // On arrête la boucle et on attend la restauration : three réinitialise son état, on recuit le ciel
  // (cibles de rendu vidées) et on recompile. Sans restauration sous ~2 s : fin d'étape propre.

  private contextLost(): void {
    if (this.destroyed || this.ctxLost) return;
    this.ctxLost = true;
    this.stopLoop();
    console.warn('[flight3d] contexte WebGL perdu');
    if (!this.finished) this.hooks.hud.toast('Liaison graphique perdue…', 'bad');
    this.armLossTimer();
  }

  private contextRestored(): void {
    if (this.destroyed || !this.ctxLost || this.rendererDropped) return;
    this.clearLossTimer();
    if (this.finished) {
      // Résultat déjà transmis : rien à reconstruire, l'interface va appeler destroy()
      this.ctxLost = false;
      return;
    }
    if (++this.restores > MAX_RESTORES) {
      this.giveUpSoon();
      return;
    }
    try {
      const t0 = performance.now();
      const oldEnv = this.sky.env;
      this.sky.rebake(this.renderer);
      this.swapEnv(oldEnv, this.sky.env);
      this.renderer.compile(this.scene, this.camera);
      if (import.meta.env.DEV) console.debug(`[flight3d] reconstruction ${Math.round(performance.now() - t0)} ms`);
    } catch (err) {
      console.error('[flight3d] reconstruction après restauration impossible', err);
      this.giveUpSoon();
      return;
    }
    if (isContextLost(this.renderer)) {
      // Reperdu pendant la reconstruction : on attend la restauration suivante
      this.armLossTimer();
      return;
    }
    this.ctxLost = false;
    console.info('[flight3d] contexte WebGL restauré');
    this.hooks.hud.toast('Liaison rétablie', 'good');
    if (this.paused) this.renderer.render(this.scene, this.camera);
    else this.startLoop();
  }

  /** Délai de grâce avant d'abandonner (suspendu pendant la pause). */
  private armLossTimer(): void {
    if (this.lossTimer || !this.ctxLost || this.paused || this.finished || this.destroyed) return;
    this.lossTimer = window.setTimeout(() => {
      this.lossTimer = 0;
      this.giveUpContext();
    }, RESTORE_WAIT_MS);
  }

  private clearLossTimer(): void {
    if (this.lossTimer) window.clearTimeout(this.lossTimer);
    this.lossTimer = 0;
  }

  private giveUpSoon(): void {
    this.clearLossTimer();
    // En pause (appli en arrière-plan) : ctxLost reste vrai, resume() arme le délai de grâce puis abandonne
    if (this.paused) return;
    this.lossTimer = window.setTimeout(() => {
      this.lossTimer = 0;
      this.giveUpContext();
    }, 0);
  }

  /** Pas de restauration : renderer jeté (la partie suivante aura un contexte neuf), fin d'étape unique. */
  private giveUpContext(): void {
    if (this.destroyed || this.finished) return;
    this.finished = true;
    this.stopLoop();
    this.dropRenderer();
    // Issue déjà décidée (distorsion atteinte, vaisseau détruit, chrono) : on la garde
    const phase = this.phase;
    this.setPhase('done');
    if (phase === 'warp' && this.result) this.hooks.onComplete(this.result);
    else if (phase === 'dead') this.hooks.onFail('Vaisseau détruit !');
    else if (phase === 'timeout') this.hooks.onFail('Temps écoulé !');
    else this.hooks.onFail(CONTEXT_LOST_REASON);
  }

  private dropRenderer(): void {
    if (this.rendererDropped) return;
    this.rendererDropped = true;
    this.removeContextListeners();
    discardRenderer(this.renderer);
  }

  private removeContextListeners(): void {
    const c = this.ctxCanvas;
    if (!c) return;
    this.ctxCanvas = null;
    c.removeEventListener('webglcontextlost', this.onCtxLost);
    c.removeEventListener('webglcontextrestored', this.onCtxRestored);
  }

  /** Remplace la texture de reflets (recuite) sur les matériaux qui l'utilisent. */
  private swapEnv(from: THREE.Texture, to: THREE.Texture): void {
    if (from === to) return;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        const s = mat as THREE.MeshStandardMaterial;
        if (s.envMap === from) s.envMap = to;
      }
    });
  }

  // ================================================================ Boucle

  private startLoop(): void {
    if (this.running || this.destroyed || this.ctxLost || this.rendererDropped) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    // Perte connue avant son événement : arrêt immédiat (sinon erreurs de shaders à chaque image)
    if (isContextLost(this.renderer)) {
      this.stopLoop();
      this.contextLost();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;
    dt *= this.timeScale;
    // Sous-pas fixes : pas d'effet tunnel à travers les rochers, même à basse fréquence
    const steps = Math.max(1, Math.ceil(dt / SUB_DT - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.simulate(h);
    this.updateVisuals(dt);
    if (import.meta.env.DEV && this.devFirstFrame) {
      // 1re image : attend la fin de la compilation des programmes lancée par compile()
      this.devFirstFrame = false;
      const t0 = performance.now();
      this.renderer.render(this.scene, this.camera);
      console.debug(`[flight3d] 1re image ${Math.round(performance.now() - t0)} ms`);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.phase === 'done') {
      this.endT += dt;
      if (this.endT > IDLE_AFTER_END) this.stopLoop();
    }
  };

  private resize(): void {
    if (this.destroyed || this.rendererDropped) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    const pr = pixelRatio();
    if (this.renderer.getPixelRatio() !== pr) this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.env.setPixelRatio(pr);
    setGlowScale(this.glowMat, h * pr, this.camera.fov);
    if (this.paused && !this.ctxLost && !isContextLost(this.renderer)) this.renderer.render(this.scene, this.camera);
  }

  // ================================================================ Simulation

  private simulate(h: number): void {
    this.time += h;
    this.phaseT += h;
    const startPhase = this.phase;
    this.enemyStepped = false;
    switch (this.phase) {
      case 'intro':
        this.simIntro();
        break;
      case 'fly':
        this.simFly(h);
        break;
      case 'warp':
        this.simWarp(h);
        break;
      case 'dead':
        this.speed = damp(this.speed, 0, 1.6, h);
        this.advance(h);
        if (this.phaseT >= DEAD_TIME) this.finishFail('Vaisseau détruit !');
        break;
      case 'timeout':
        this.speed = damp(this.speed, this.course.def.speed * 0.15, 1.5, h);
        this.vx = damp(this.vx, 0, 3, h);
        this.vy = damp(this.vy, 0, 3, h);
        this.advance(h);
        if (this.phaseT >= TIMEOUT_TIME) this.finishFail('Temps écoulé !');
        break;
      case 'done':
        this.speed = damp(this.speed, 0, 1.2, h);
        this.advance(h);
        break;
    }
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - h);

    // Combat, toutes phases : hors vol, les ennemis finissent leur mouvement sans toucher la Comète ;
    // les projectiles en vol vont au bout ; les cristaux ne se ramassent qu'en vol.
    if (!this.enemyStepped && startPhase !== 'intro' && this.phase !== 'intro') {
      this.syncShipState();
      this.enemies.update(h, this.time, this.shipState, false);
    }
    this.shots.update(h, this.time, this.rocks, this.enemies, this.onShotHit);
    const got = this.pickups.update(h, this.time, this.x, this.y, this.z, this.phase === 'fly');
    if (got > 0) this.collectCrystals(got);
  }

  /** La Comète vue par les ennemis. */
  private syncShipState(): void {
    const s = this.shipState;
    s.x = this.x;
    s.y = this.y;
    s.z = this.z;
    s.vx = this.vx;
    s.vy = this.vy;
    s.speed = this.speed;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private simIntro(): void {
    const step = Math.min(3, Math.floor(this.phaseT));
    if (step === this.countdownStep) return;
    this.countdownStep = step;
    const { hud, audio } = this.hooks;
    if (step < 3) {
      hud.toast(String(COUNTDOWN - step));
      audio.sfx('click', { pitch: 0.75 });
    } else {
      hud.toast('Go !', 'good');
      audio.sfx('takeoff', { volume: 0.7 });
      this.hooks.input.clearPresses();
      this.setPhase('fly');
    }
  }

  /** Avance le long du couloir avec la vitesse et la vitesse latérale courantes. */
  private advance(h: number): void {
    this.x += this.vx * h;
    this.y += this.vy * h;
    const r = Math.hypot(this.x, this.y);
    if (r > CORRIDOR_R) {
      const k = CORRIDOR_R / r;
      this.x *= k;
      this.y *= k;
      const nx = this.x / CORRIDOR_R;
      const ny = this.y / CORRIDOR_R;
      const vr = this.vx * nx + this.vy * ny;
      if (vr > 0) {
        this.vx -= vr * nx;
        this.vy -= vr * ny;
      }
    }
    this.z -= this.speed * h;
    this.travel += this.speed * h;
  }

  private simFly(h: number): void {
    const def = this.course.def;
    const input = this.hooks.input.state;
    let sx: number;
    let sy: number;
    let wantBoost: boolean;
    if (this.autopilot) {
      // Pilote automatique (outil de dev) : vise la trajectoire idéale un peu en avant
      const look = Math.max(8, this.speed * 0.3);
      pathAt(this.course.path, this.z - look, _path);
      // Mine ou orbe sur la route : écart latéral conseillé par le champ d'ennemis
      if (this.enemies.avoid(this.x, this.y, this.z, this.speed, _avoid)) {
        _path.x += _avoid.x;
        _path.y += _avoid.y;
      }
      let tvx = (_path.x - this.x) * 3.2;
      let tvy = (_path.y - this.y) * 3.2;
      const tl = Math.hypot(tvx, tvy);
      if (tl > MAX_LAT) {
        tvx *= MAX_LAT / tl;
        tvy *= MAX_LAT / tl;
      }
      sx = tvx / MAX_LAT;
      sy = tvy / MAX_LAT;
      const ng = this.course.gates[this.nextGate];
      const far = !ng || this.z - ng.z > 140;
      this.apBoost = far && (this.boostGauge > 0.95 || (this.apBoost && this.boostGauge > 0.35));
      wantBoost = this.apBoost;
    } else {
      sx = input.stickX;
      sy = input.stickY;
      wantBoost = input.boost;
    }
    // Zone morte + saturation circulaire
    let sl = Math.hypot(sx, sy);
    if (sl < STICK_DEADZONE) {
      sx = 0;
      sy = 0;
      sl = 0;
    } else if (sl > 1) {
      sx /= sl;
      sy /= sl;
    }

    // Turbo : jauge vidée en ~2,5 s, rechargée en ~5 s une fois relâché (module Turbo : ×1,25 / ×1,5)
    if (!wantBoost) this.boostLocked = false;
    if (wantBoost && !this.boostLocked && this.boostGauge > 0) {
      if (!this.boosting) {
        this.boosting = true;
        this.hooks.audio.sfx('boost');
      }
      this.boostGauge -= this.boostDrain * h;
      if (this.boostGauge <= 0) {
        this.boostGauge = 0;
        this.boosting = false;
        this.boostLocked = true;
      }
    } else {
      this.boosting = false;
      this.boostGauge = Math.min(1, this.boostGauge + this.boostFill * h);
    }

    // Vitesse d'avance (perte brève après un choc)
    this.slow = Math.min(1, this.slow + h * 0.55);
    const target = def.speed * (this.boosting ? BOOST_MULT : 1) * this.slow;
    this.speed = damp(this.speed, target, this.speed < target ? 2.2 : 3.5, h);

    // Déplacement latéral à accélération bornée
    let dvx = sx * MAX_LAT - this.vx;
    let dvy = sy * MAX_LAT - this.vy;
    const dl = Math.hypot(dvx, dvy);
    const maxDv = LAT_ACCEL * h;
    if (dl > maxDv) {
      dvx *= maxDv / dl;
      dvy *= maxDv / dl;
    }
    this.vx += dvx;
    this.vy += dvy;

    const px = this.x;
    const py = this.y;
    const pz = this.z;
    this.advance(h);
    this.flightTime += h;
    this.timeLeft -= h;

    this.checkGates(px, py, pz);

    const hit = this.rocks.hitTest(this.x, this.y, this.z, SHIP_HIT_R, this.time);
    if (hit >= 0) this.onRockHit(hit);
    if (this.phase !== 'fly') return;

    // Ennemis : vagues, IA, orbes, chocs avec la Comète
    this.syncShipState();
    this.enemies.update(h, this.time, this.shipState, true);
    this.enemyStepped = true;
    if (this.phase !== 'fly') return;

    this.updateGun(h);

    if (this.z <= this.course.warpZ) {
      this.startWarp();
      return;
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.startTimeout();
    }
  }

  private checkGates(px: number, py: number, pz: number): void {
    const gates = this.course.gates;
    while (this.nextGate < gates.length && this.z <= gates[this.nextGate].z) {
      const g = gates[this.nextGate];
      const t = (pz - g.z) / Math.max(1e-6, pz - this.z);
      const cx = px + (this.x - px) * t;
      const cy = py + (this.y - py) * t;
      const i = this.nextGate++;
      if (Math.hypot(cx - g.x, cy - g.y) <= GATE_PASS_R) this.gatePassed(i);
      else this.gateMissed(i);
    }
  }

  private gatePassed(i: number): void {
    const g = this.course.gates[i];
    this.gatesPassed++;
    this.timeLeft += GATE_BONUS;
    this.combo++;
    this.hooks.audio.sfx('gate', { pitch: Math.min(1.35, 1 + this.combo * 0.035) });
    this.gates.pass(i);
    this.particles.ring(g.x, g.y, g.z, GATE_R, 46, this.gateNextColor, 0.9, 11);
    this.particles.ring(g.x, g.y, g.z, GATE_R * 0.9, 20, this.sparkColor, 0.6, 6);
    this.pushHud();
  }

  private gateMissed(i: number): void {
    const g = this.course.gates[i];
    this.timeLeft -= GATE_PENALTY;
    this.combo = 0;
    this.hooks.audio.sfx('gateMiss');
    this.hooks.hud.toast('Portail manqué −5 s', 'bad');
    this.gates.miss(i);
    _c.set(this.theme.gateMissed);
    this.particles.ring(g.x, g.y, g.z, GATE_R, 18, _c, 0.7, 3);
    this.pushHud();
  }

  /** Choc de la Comète contre un rocher : il éclate, un bouclier est perdu (sauf invulnérable). */
  private onRockHit(k: number): void {
    this.burstRock(k);
    this.damageShip(_rc.x, _rc.y);
  }

  /** Éclatement d'un rocher (choc ou tirs) : retiré du champ, éclats, poussière, étincelles ; centre dans _rc. */
  private burstRock(k: number): void {
    const rk = this.rocks.rocks[k];
    this.rocks.center(k, this.time, _rc);
    this.rocks.destroyed[k] = 1;
    this.rocks.tint(k, _c);
    const n = Math.min(14, 5 + Math.round(rk.r * 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const q = Math.sqrt(1 - u * u);
      const sp = 4 + Math.random() * 10;
      this.debris.spawn(
        _rc.x + Math.cos(a) * q * rk.r * 0.5,
        _rc.y + Math.sin(a) * q * rk.r * 0.5,
        _rc.z + u * rk.r * 0.5,
        Math.cos(a) * q * sp,
        Math.sin(a) * q * sp,
        u * sp,
        rk.r * (0.18 + Math.random() * 0.22),
        _c,
        1.4 + Math.random() * 1.2,
      );
    }
    this.particles.burst(_rc.x, _rc.y, _rc.z, 24, 4, 14, _c.multiplyScalar(1.5), 0.9 + rk.r * 0.18, 0.9);
    this.particles.burst(_rc.x, _rc.y, _rc.z, 16, 8, 22, this.crystalColor, 0.45, 0.7);
  }

  /**
   * Choc contre la Comète (rocher, ennemi percuté, mine, orbe) venu de (fromX, fromY) : un bouclier perdu,
   * ralentissement, rebond ; pendant l'invulnérabilité, juste un petit bruit.
   */
  private damageShip(fromX: number, fromY: number): void {
    if (this.phase !== 'fly') return;
    if (this.invuln > 0) {
      this.hooks.audio.sfx('crash', { volume: 0.35, pitch: 1.3 });
      return;
    }
    this.shield--;
    this.noDamage = false;
    this.combo = 0;
    this.invuln = INVULN_TIME;
    this.slow = 0.42;
    this.shake = Math.min(1.5, this.shake + 0.9);
    this.hooks.audio.sfx('crash');
    this.hooks.audio.haptic(120);
    this.screen.flashHit(0.85);
    // Petit rebond latéral loin du choc
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 7;
    this.vy += (dy / d) * 7;
    this.pushHud();
    if (this.shield <= 0) this.explode();
  }

  /** Visée, tir automatique ou manuel, canon (cadence, surchauffe) et projectiles ; un sous-pas de vol. */
  private updateGun(h: number): void {
    const aim = this.aim;
    const gun = this.gun;
    const st = gun.stats;
    // Cible : les ennemis d'abord (un rocher du couloir, presque toujours là, cacherait le chasseur qui vire),
    // le plus proche à portée du guidage (homingDeg + 1°), sinon du cône de visée. Aucun, ou hors d'atteinte du
    // tir guidé : le rocher du couloir choisi de même (s'il peut être touché, ou faute d'ennemi). Une cible que
    // les tirs déjà en route suffisent à détruire est ignorée (ShotPool.claim).
    clearAim(aim);
    this.enemies.aim(this.x, this.y, this.z, this.cosSure, st.range, aim);
    if (aim.kind === 'none') this.enemies.aim(this.x, this.y, this.z, this.cosCone, st.range, aim);
    this.targetHit = aim.kind !== 'none' && this.canHit(aim);
    if (!this.targetHit) {
      const rock = this.rockAim;
      clearAim(rock);
      this.rocks.aim(this.x, this.y, this.z, this.cosSure, st.range, this.time, rock);
      if (rock.kind === 'none') this.rocks.aim(this.x, this.y, this.z, this.cosCone, st.range, this.time, rock);
      if (rock.kind !== 'none') {
        const rockHit = this.canHit(rock);
        if (rockHit || aim.kind === 'none') {
          copyAim(aim, rock);
          this.targetHit = rockHit;
        }
      }
    }

    const input = this.hooks.input;
    if (input.consumePress('fire')) this.fireQueue = FIRE_QUEUE;
    else if (this.fireQueue > 0) this.fireQueue -= h;
    const held = input.state.fire || this.fireQueue > 0 || this.devFire;
    // Tir automatique (réglage par défaut ; toujours avec le pilote automatique) : tant qu'une cible visée
    // peut être touchée (pas de chauffe perdue sur une cible au bord du cône ni sur une cible condamnée)
    const auto = !this.hooks.settings.manualFire || this.autopilot;
    const m = gun.step(h, held || (auto && this.targetHit));
    if (m >= 0) {
      this.fireQueue = 0;
      this.ship.muzzleWorld(m, this.x, this.y, this.z, _mz);
      const speed = this.speed + st.speed;
      aimDirection(_mz.x, _mz.y, _mz.z, aim, speed, this.homingRad, _aimDir);
      const d = _aimDir;
      // Tir qui doit toucher : ses dégâts sont réservés sur la cible (la visée passe à la suivante quand ils
      // suffisent à la détruire ; sans cela, la mitrailleuse perdait la moitié de ses tirs)
      if (this.shots.fire(_mz.x, _mz.y, _mz.z, d.x, d.y, d.z, speed, st.life, st.damage, st.color, st.length, st.width) && this.targetHit) {
        this.shots.claim(aim, this.rocks, this.enemies);
      }
      this.ship.fireFlash(m);
      this.shotsFired++;
      this.lastMuzzle = m;
      this.sfx(st.sfx, st.muzzles > 1 ? 0.6 : 0.85, 0.96 + Math.random() * 0.08);
    }
    // Surchauffe : un son, pas de message (la jauge du HUD l'affiche)
    if (gun.justOverheated) {
      this.hooks.audio.sfx('overheat');
      this.pushHudLight();
    }
  }

  /** Le prochain tir, guidé d'au plus homingDeg, toucherait-il la cible `aim` (rayon de la cible + SHOT_R) ? */
  private canHit(aim: Readonly<AimTarget>): boolean {
    const st = this.gun.stats;
    const r = aim.kind === 'rock' ? this.rocks.rocks[aim.index].r * 0.82 : ENEMY_DEFS[this.enemies.kindOf(aim.index)].radius;
    this.ship.muzzleWorld(this.gun.nextMuzzle, this.x, this.y, this.z, _mz);
    const speed = this.speed + st.speed;
    aimDirection(_mz.x, _mz.y, _mz.z, aim, speed, this.homingRad, _aimDir);
    return shotMiss(_mz.x, _mz.y, _mz.z, _aimDir, speed, aim, st.life) <= r + SHOT_R;
  }

  /** Impact d'un projectile sur un rocher (PV, éclatement, cristal) ou un ennemi (enemies.ts décide de sa mort). */
  private shotHit(kind: 'rock' | 'enemy', index: number, damage: number, x: number, y: number, z: number): void {
    if (kind === 'enemy') {
      if (!this.enemies.damage(index, damage)) this.sfx('enemyHit', 0.8, 0.95 + Math.random() * 0.1);
      return;
    }
    if (this.rocks.damage(index, damage)) {
      // Détruit par les tirs : même éclatement qu'au choc, sans perte de bouclier ni ralentissement
      this.burstRock(index);
      this.rocksDestroyed++;
      this.points += ROCK_POINTS;
      if (this.rocks.dropsCrystal[index]) this.crystalsDropped += this.pickups.spawn(_rc.x, _rc.y, _rc.z, 1);
      this.sfx('enemyBlast', 0.5, 0.72 + Math.random() * 0.1);
    } else {
      // Touché sans être détruit : étincelles à la surface
      this.particles.burst(x, y, z, 7, 3, 11, this.shotColor, 0.32, 0.28);
      this.sfx('enemyHit', 0.35, 0.78 + Math.random() * 0.1);
    }
  }

  /** Ennemi détruit (tirs, choc, mine déclenchée) : points et cristaux décidés par enemies.ts. */
  private enemyKilled(kind: EnemyKind, x: number, y: number, z: number, points: number, crystals: number): void {
    this.points += points;
    if (crystals > 0) this.crystalsDropped += this.pickups.spawn(x, y, z, crystals);
    const small = kind === 'swarm';
    this.sfx('enemyBlast', small ? 0.6 : 1, small ? 1.25 : 1);
    // Explosion toute proche (ennemi percuté, mine) : petite secousse
    const dx = x - this.x;
    const dy = y - this.y;
    const dz = z - this.z;
    if (dx * dx + dy * dy + dz * dz < 144) this.shake = Math.min(1.5, this.shake + 0.35);
  }

  /** Cristaux du vol ramassés : réserve de l'étape, points, son, scintillement autour de la Comète. */
  private collectCrystals(n: number): void {
    this.crystals += n;
    this.points += CRYSTAL_POINTS * n;
    this.hooks.audio.sfx('crystal');
    this.particles.burst(this.x, this.y, this.z - 1, 10, 3, 9, this.pickupColor, 0.35, 0.35, -this.speed);
    this.pushHud();
  }

  /** Son fréquent (tirs, impacts) : options réutilisées, sans allocation. */
  private sfx(id: SfxId, volume: number, pitch: number): void {
    const o = this.sfxOpts;
    o.volume = volume;
    o.pitch = pitch;
    this.hooks.audio.sfx(id, o);
  }

  private explode(): void {
    this.shield = 0;
    this.setPhase('dead');
    this.boosting = false;
    const sx = this.x;
    const sy = this.y;
    const sz = this.z;
    this.particles.burst(sx, sy, sz, 140, 6, 30, this.fireColor, 2.2, 1.4, -this.speed * 0.3);
    this.particles.burst(sx, sy, sz, 60, 2, 14, this.hotColor, 3.2, 0.9, -this.speed * 0.3);
    this.particles.burst(sx, sy, sz, 40, 10, 34, this.cyanColor, 0.9, 1.1, -this.speed * 0.3);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const q = Math.sqrt(1 - u * u);
      const sp = 5 + Math.random() * 14;
      this.debris.spawn(sx, sy, sz, Math.cos(a) * q * sp, Math.sin(a) * q * sp, u * sp - this.speed * 0.3, 0.18 + Math.random() * 0.3, this.hullColor, 2 + Math.random());
    }
    this.shake = 1.8;
    this.screen.setFade(0.75);
    this.hooks.audio.sfx('crash', { volume: 1, pitch: 0.55 });
    this.hooks.audio.haptic([90, 50, 200]);
    this.pushHud();
  }

  private startWarp(): void {
    this.setPhase('warp');
    this.boosting = false;
    this.hooks.audio.sfx('warp');
    this.hooks.audio.haptic(60);
    const total = this.course.gates.length;
    const ratio = total > 0 ? this.gatesPassed / total : 1;
    const timeLeft = Math.max(0, this.timeLeft);
    this.enemies.counts(this.enemyCounts);
    this.result = {
      stageId: this.stage.id,
      // Points du combat (rochers, ennemis, cristaux) en plus ; étoiles : portails seulement, comme avant
      score: Math.round(timeLeft * 100) + this.gatesPassed * 200 + (this.noDamage ? 1000 : 0) + this.points,
      stars: ratio >= 0.95 ? 3 : ratio >= 0.7 ? 2 : 1,
      timeMs: Math.round(this.flightTime * 1000),
      gates: this.gatesPassed,
      gatesTotal: total,
      crystals: this.crystals,
      crystalsTotal: this.crystalsTotal(),
      enemies: this.enemyCounts.killed,
    };
    this.particles.ring(0, 0, this.course.warpZ, WARP_R, 80, this.gateNextColor, 2.4, 26);
    this.pushHud();
  }

  private simWarp(h: number): void {
    this.speed = damp(this.speed, this.course.def.speed * 3.4, 2.2, h);
    this.vx = damp(this.vx, -this.x * 2, 4, h);
    this.vy = damp(this.vy, -this.y * 2, 4, h);
    this.advance(h);
    if (this.phaseT >= WARP_TIME && !this.finished) {
      this.finished = true;
      this.setPhase('done');
      this.pushHud();
      const res = this.result;
      if (res) this.hooks.onComplete(res);
    }
  }

  private startTimeout(): void {
    this.setPhase('timeout');
    this.boosting = false;
    this.pushHud();
  }

  private finishFail(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.setPhase('done');
    this.pushHud();
    this.hooks.onFail(reason);
  }

  // ================================================================ Rendu

  private updateVisuals(dt: number): void {
    const t = this.time;
    const phase = this.phase;
    const cruise = this.course.def.speed;

    // --- Vaisseau : inclinaison selon le mouvement, flammes, clignotement d'invulnérabilité
    const boostTarget = phase === 'warp' ? 1.3 : this.boosting ? 1 : 0;
    this.boostVis = damp(this.boostVis, boostTarget, 6, dt);
    let thrust: number;
    if (phase === 'intro') thrust = 0.2 + 0.06 * Math.sin(t * 5);
    else if (phase === 'fly') thrust = 0.55 + 0.25 * clamp(this.speed / cruise, 0, 1);
    else if (phase === 'warp') thrust = 1.5;
    else thrust = 0.08;
    this.roll = damp(this.roll, (-this.vx / MAX_LAT) * 0.7 + (phase === 'intro' ? Math.sin(t * 1.3) * 0.05 : 0), 7, dt);
    this.pitch = damp(this.pitch, (this.vy / MAX_LAT) * 0.3, 7, dt);
    this.yaw = damp(this.yaw, (-this.vx / MAX_LAT) * 0.18, 7, dt);
    if (phase === 'warp') this.warpPush += dt * (12 + this.phaseT * 70);
    const bob = phase === 'intro' ? Math.sin(t * 2.2) * 0.14 : Math.sin(t * 1.7) * 0.05;
    this.ship.root.position.set(this.x, this.y + bob, this.z - this.warpPush);
    this.ship.body.rotation.set(this.pitch, this.yaw, this.roll);
    const flicker = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;
    this.ship.body.visible = phase !== 'dead' && !(phase === 'done' && this.shield <= 0) && !flicker;
    this.ship.update(t, thrust, this.boostVis);

    this.updateCamera(dt);
    const cam = this.camera.position;

    // --- Monde
    this.gates.update(dt, t, this.z, this.nextGate);
    this.portal.update(dt, t, this.z);
    this.rocks.update(t, cam.z);
    this.enemies.render(t, cam.z);
    this.shots.render(cam.z);
    this.pickups.render(t, cam.z);
    this.env.update(dt, t, cam, phase !== 'intro');

    // --- Traînées de vitesse
    const sp = clamp(this.speed / cruise, 0, 4);
    let stretch = 2 + sp * 3 + this.boostVis * 10;
    let intensity = 0.32 * clamp(sp, 0, 1) + this.boostVis * 0.6;
    let width = 0.045 + this.boostVis * 0.02;
    if (phase === 'warp') {
      const k = smoothstep(0, 1.2, this.phaseT);
      stretch += k * 80;
      intensity += k * 1.4;
      width += k * 0.08;
    }
    this.streaks.update(cam, this.travel, stretch, intensity, width);

    this.particles.update(dt);
    this.debris.update(dt);

    // --- Fondu blanc (distorsion), voile qui retombe après l'explosion
    if (phase === 'warp' || (phase === 'done' && this.result)) {
      this.screen.setFade(phase === 'warp' ? smoothstep(0.35, WARP_TIME, this.phaseT) : 1);
    } else if (phase === 'dead' || (phase === 'done' && this.shield <= 0)) {
      const tt = phase === 'dead' ? this.phaseT : DEAD_TIME + this.endT;
      this.screen.setFade(0.75 * Math.max(0, 1 - tt / 0.5));
    }
    this.screen.update(dt);

    // --- HUD (~10 Hz)
    this.hudT += dt;
    if (this.hudT >= 0.1) {
      this.hudT = 0;
      if (phase === 'fly' || phase === 'intro') this.pushHudLight();
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.camera;
    const phase = this.phase;
    if (phase === 'intro') {
      // Travelling : de l'avant du vaisseau (planète en fond) jusqu'à la poursuite
      const k = smoothstep(0.15, 2.85, this.phaseT);
      const e = k * k * (3 - 2 * k);
      const ang = (1 - e) * 2.45;
      const dist = 11.5 + (CAM_BACK - 11.5) * e;
      const hgt = 1.0 + (CAM_UP - 1.0) * e;
      cam.position.set(this.x + Math.sin(ang) * dist, this.y + hgt, this.z + Math.cos(ang) * dist);
      _look.set(this.x, this.y + 0.3 + 0.5 * e, this.z - 16 * smoothstep(0.45, 1, e));
      cam.lookAt(_look);
      this.camX = cam.position.x;
      this.camY = cam.position.y;
      this.camDist = CAM_BACK;
    } else {
      const extra = phase === 'warp' ? 0 : this.boostVis * 1.6;
      this.camDist = damp(this.camDist, CAM_BACK + extra, 4, dt);
      this.camX = damp(this.camX, this.x * 0.82, 5, dt);
      this.camY = damp(this.camY, this.y * 0.82 + CAM_UP, 5, dt);
      cam.position.set(this.camX, this.camY, this.z + this.camDist);
      if (phase === 'warp') this.shake = Math.max(this.shake, 0.35 * smoothstep(0, 1, this.phaseT));
      if (this.shake > 0.002) {
        const s = this.shake * this.shake * 0.45;
        const t = this.time;
        cam.position.x += s * (Math.sin(t * 61) + 0.6 * Math.sin(t * 37 + 1.3));
        cam.position.y += s * (Math.sin(t * 53 + 0.7) + 0.6 * Math.sin(t * 29 + 2.1));
        this.shake = damp(this.shake, 0, 3.5, dt);
      }
      _look.set(this.x * 0.9, this.y * 0.9 + 0.8, this.z - 16);
      cam.lookAt(_look);
      cam.rotateZ(this.roll * 0.22);
    }
    let fovTarget = FOV_BASE + (FOV_BOOST - FOV_BASE) * clamp(this.boostVis, 0, 1);
    if (phase === 'warp') fovTarget = FOV_BASE + (FOV_WARP - FOV_BASE) * smoothstep(0, WARP_TIME, this.phaseT);
    this.fov = damp(this.fov, fovTarget, phase === 'warp' ? 6 : 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
      const h = this.renderer.domElement.height || this.container.clientHeight;
      setGlowScale(this.glowMat, h, cam.fov);
    }
  }

  // ================================================================ HUD

  private progress(): number {
    return clamp(-this.z / this.course.length, 0, 1);
  }

  /** Cristaux possibles du parcours : rochers qui en lâchent et vagues d'ennemis. */
  private crystalsTotal(): number {
    return this.rocks.crystalCount + this.enemies.crystalsTotal;
  }

  private pushHud(): void {
    const hud: FlightHud = {
      timeLeft: Math.max(0, Math.round(this.timeLeft * 10) / 10),
      gates: this.gatesPassed,
      gatesTotal: this.course.gates.length,
      shield: this.shield,
      maxShield: this.maxShield,
      boost: Math.round(this.boostGauge * 100) / 100,
      progress: Math.round(this.progress() * 1000) / 1000,
      gunLevel: this.gun.stats.level,
      heat: Math.round(this.gun.heat * 100) / 100,
      overheated: this.gun.overheated,
      crystals: this.crystals,
    };
    this.lastHudTime = hud.timeLeft;
    this.hooks.hud.updateFlight(hud);
  }

  private pushHudLight(): void {
    const timeLeft = Math.max(0, Math.round(this.timeLeft * 10) / 10);
    this.lastHudTime = timeLeft;
    this.hooks.hud.updateFlight({
      timeLeft,
      boost: Math.round(this.boostGauge * 100) / 100,
      progress: Math.round(this.progress() * 1000) / 1000,
      heat: Math.round(this.gun.heat * 100) / 100,
      overheated: this.gun.overheated,
    });
  }

  // ================================================================ Outils de développement

  private installDevApi(): void {
    const api: DevApi = {
      autopilot: (on = true) => {
        this.autopilot = !!on;
      },
      win: () => this.devWin(),
      fail: () => this.devFail(),
      timeScale: (s: number) => {
        this.timeScale = clamp(Number(s) || 1, 0.1, 8);
      },
      info: () => {
        const ec = this.enemies.counts(this.enemyCounts);
        return {
          phase: this.phase,
          timeLeft: Math.round(this.timeLeft * 10) / 10,
          gates: this.gatesPassed,
          nextGate: this.nextGate,
          gatesTotal: this.course.gates.length,
          shield: this.shield,
          maxShields: this.maxShield,
          boost: Math.round(this.boostGauge * 1000) / 1000,
          boosting: this.boosting,
          boostDrain: this.boostDrain,
          boostFill: this.boostFill,
          progress: Math.round(this.progress() * 1000) / 1000,
          speed: Math.round(this.speed),
          calls: this.renderer.info.render.calls,
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
          programs: this.renderer.info.programs?.length ?? 0,
          autopilot: this.autopilot,
          lastHud: this.lastHudTime,
          // Combat (3b)
          gunLevel: this.gun.stats.level,
          heat: Math.round(this.gun.heat * 1000) / 1000,
          overheated: this.gun.overheated,
          manualFire: !!this.hooks.settings.manualFire,
          range: Math.round(this.gun.stats.range * 10) / 10,
          shotsActive: this.shots.active,
          shotsFired: this.shotsFired,
          lastMuzzle: this.lastMuzzle,
          target: this.targetInfo(),
          enemies: { fighter: ec.fighter, mine: ec.mine, swarm: ec.swarm, killed: ec.killed },
          orbsActive: ec.orbs,
          waves: this.course.waves.length,
          crystals: this.crystals,
          crystalsTotal: this.crystalsTotal(),
          crystalsActive: this.pickups.active,
          crystalsDropped: this.crystalsDropped,
          rocksDestroyed: this.rocksDestroyed,
          points: this.points,
        };
      },
      advance: (seconds: number) => {
        const steps = Math.max(0, Math.round((Number(seconds) || 0) * 60));
        for (let i = 0; i < steps && !this.destroyed; i++) {
          this.simulate(SUB_DT);
          if (i % 2 === 1) this.updateVisuals(SUB_DT * 2);
        }
        if (!this.destroyed && !this.rendererDropped) {
          this.updateVisuals(SUB_DT);
          this.renderer.render(this.scene, this.camera);
        }
        return api.info();
      },
      bench: (frames = 30) => {
        const gl = this.renderer.getContext();
        const px = new Uint8Array(4);
        this.renderer.render(this.scene, this.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) {
          this.updateVisuals(1 / 60);
          this.renderer.render(this.scene, this.camera);
        }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return Math.round(((performance.now() - t0) / frames) * 100) / 100;
      },
      spawn: (type: string, distance = 60, variant?: number) => {
        if (this.destroyed || !(ENEMY_KINDS as readonly string[]).includes(type)) return 0;
        const d = clamp(Number(distance) || 60, 4, 2000);
        const v = typeof variant === 'number' && Number.isFinite(variant) ? variant - Math.floor(variant) : Math.random();
        return this.enemies.spawn(type as EnemyKind, this.x, this.y, this.z - d, v);
      },
      fire: (on = true) => {
        this.devFire = !!on;
      },
    };
    this.devApi = api;
    (window as unknown as { __xr3d?: DevApi }).__xr3d = api;
  }

  /** Cible actuelle de la visée (aide DEV) : type et distance, ou null hors vol et sans cible. */
  private targetInfo(): { type: string; dist: number; hit: boolean } | null {
    const a = this.aim;
    if (this.phase !== 'fly' || a.kind === 'none') return null;
    return {
      type: a.kind === 'rock' ? 'rock' : this.enemies.kindOf(a.index),
      dist: Math.round(a.dist * 10) / 10,
      hit: this.targetHit,
    };
  }

  private devWin(): void {
    if (this.finished || this.phase === 'warp' || this.phase === 'dead' || this.phase === 'timeout') return;
    const remaining = this.course.gates.length - this.nextGate;
    for (let i = this.nextGate; i < this.course.gates.length; i++) this.gates.pass(i);
    this.gatesPassed += remaining;
    this.nextGate = this.course.gates.length;
    this.startWarp();
  }

  private devFail(): void {
    if (this.finished || this.phase === 'dead' || this.phase === 'warp' || this.phase === 'timeout') return;
    this.explode();
  }
}
