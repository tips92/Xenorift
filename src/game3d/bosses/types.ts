import type * as THREE from 'three';
import type { MusicId } from '../../core/types';
import type { CourseTheme } from '../courses';
import type { ShipState } from '../enemies';
import type { ShotTargets } from '../shots';
import type { Bin } from '../util';

// Contrat d'un boss de vol (plan 04, points 22 et 23) : combattu après le dernier portail d'un parcours qui en a un
// (CourseDef.boss), pendant la phase 'boss' de FlightRun (chrono figé). Un boss se bat en touches (décision 20) :
// chaque cible exposée (`open`) prend UNE touche, quelle que soit l'arme. Il se branche sur le combat de 3b : ses
// cibles sont proposées à la visée par FlightRun (offerAim, cône sûr puis cône de visée, cible condamnée sautée),
// ShotPool les teste (shotTest) et réserve les dégâts des tirs en route (pending), FlightRun appelle hitTarget ;
// ses orbes partent de la réserve d'EnemyField (FlightBossEvents.orb → launchOrb : mêmes chocs) ; son corps peut
// heurter la Comète (hitsShip → damageShip). Tout est créé et attaché caché AVANT la compilation de FlightRun
// (renderer.compile prépare aussi les matériaux des objets cachés : rien à compiler en vol) ; aucune allocation
// pendant le combat. Registre et aides de FlightRun (visée, pilote automatique) : bosses/index.ts.

/** État du boss : caché, arrivée, combat, changement de phase, défaite (explosion), parti. */
export type FlightBossState = 'idle' | 'appear' | 'fight' | 'shift' | 'dying' | 'gone';

/** Cible d'un boss (plaque, point faible), tenue à jour par le boss à chaque update. */
export interface FlightBossTarget {
  x: number;
  y: number;
  z: number;
  /** Vitesse (u/s, absolue) : visée en avance. */
  vx: number;
  vy: number;
  vz: number;
  /** Rayon de touche des tirs (u). */
  r: number;
  /** Exposée : un tir qui l'atteint compte une touche ; fermée, elle arrête les tirs sans effet (blindage). */
  open: boolean;
  /** Encore en place (une cible exposée touchée disparaît). */
  alive: boolean;
}

/** Rappels du boss vers FlightRun (objet créé une fois) : son, effets, score, HUD. */
export interface FlightBossEvents {
  /** Lance une orbe de (x, y, z) vers la Comète, visée décalée de (dx, dy) u (EnemyField.launchOrb). */
  orb(x: number, y: number, z: number, dx: number, dy: number): void;
  /** Touche comptée en (x, y, z) ; `left` : touches restantes. */
  touched(x: number, y: number, z: number, left: number): void;
  /** Tir arrêté par un blindage (cible fermée) en (x, y, z). */
  armor(x: number, y: number, z: number): void;
  /** Nouvelle phase (à partir de 2). */
  phase(n: number): void;
  /** Vaincu (dernière touche ou aide DEV) : son explosion commence en (x, y, z). */
  defeated(x: number, y: number, z: number): void;
}

/** Fiche d'un boss de vol (registre FLIGHT_BOSSES de bosses/index.ts). */
export interface FlightBossDef {
  /** Nom de la barre de boss (HUD). */
  readonly name: string;
  /** Prime à la victoire, comprise dans le score (StageResult.bossBonus). */
  readonly bonus: number;
  /** Musique du combat : à son début, dès le compte à rebours d'un départ au combat. */
  readonly music: MusicId;
}

/** De quoi construire un boss (FlightRun, avant sa compilation) : thème, reflets du ciel, rappels, Bin de la partie. */
export interface FlightBossContext {
  readonly theme: CourseTheme;
  readonly env: THREE.Texture;
  /** Points lumineux partagés avec le décor (setGlowScale). */
  readonly glow: THREE.ShaderMaterial;
  readonly events: FlightBossEvents;
  readonly bin: Bin;
}

export interface FlightBoss extends ShotTargets {
  readonly def: FlightBossDef;
  /** Touches pour le vaincre et nombre de phases (barre de boss en crans). */
  readonly touches: number;
  readonly phases: number;
  /** Tout le boss (ajouté à la scène par FlightRun, caché hors combat). */
  readonly group: THREE.Group;
  /** Cibles proposées à la visée (open et alive) et testées par les tirs (alive ; fermée = blindage). */
  readonly targets: readonly FlightBossTarget[];
  readonly state: FlightBossState;
  /** Phase en cours, à partir de 1. */
  readonly phase: number;
  /** Touches restantes (def.touches au départ). */
  readonly touchesLeft: number;
  /** Arrivée devant la Comète (état 'appear', puis 'fight'). */
  start(ship: Readonly<ShipState>): void;
  /** Un sous-pas : déplacement, cibles, attaques (rappels). */
  update(h: number, time: number, ship: Readonly<ShipState>): void;
  /** Écrit les instances (une fois par image). */
  render(time: number, camZ: number): void;
  /** Tir arrivé sur la cible `index` (shotTest) : vrai si une touche est comptée (cible exposée). */
  hitTarget(index: number, damage: number): boolean;
  /** Le corps du boss heurte-t-il la Comète ? (point du choc dans `out`) */
  hitsShip(ship: Readonly<ShipState>, out: { x: number; y: number }): boolean;
  /** Vaincu tout de suite (aide DEV) : même suite qu'à la dernière touche. */
  defeat(): void;
  /** Libère ce qui n'est pas dans le Bin de la partie (tampons d'instances). */
  dispose(): void;
}
