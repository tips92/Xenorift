import type { BossId } from '../../../core/types';
import type { Player } from '../Player';

// Contrat des boss 2D (plan 04, point 16). Un boss vit dans une arène (engine/arena.ts) : la scène le crée au
// chargement (createBoss), le démarre quand les barrières se ferment, le met à jour, lui passe les tirs de Kaï
// (ShotPool.probe) et les contacts, et le remet à neuf quand Kaï perd une vie dans l'arène. Il n'alloue rien par
// image et ne passe que par l'horloge de la scène (update) : pause, perte de contexte et arrêt sont respectés.

/** Place du boss : case 'M' (pieds au bas de la case) et intérieur de l'arène (px, entre les deux bornes). */
export interface BossSpot {
  x: number;
  feetY: number;
  left: number;
  right: number;
}

/**
 * 'wait' : avant le combat (immobile, insensible) ; 'fight' : combat ; 'beaten' : vaincu, il s'enfuit (insensible,
 * inoffensif) ; 'gone' : parti (caché).
 */
export type BossState = 'wait' | 'fight' | 'beaten' | 'gone';

export interface Boss {
  readonly id: BossId;
  /** Nom affiché sur la barre de boss. */
  readonly name: string;
  life: number;
  readonly maxLife: number;
  /** Phase en cours, à partir de 1, sur `phases`. */
  phase: number;
  readonly phases: number;
  state: BossState;
  /** Centre des pieds (px du monde). */
  readonly x: number;
  readonly y: number;
  /** Les barrières viennent de se fermer : le combat commence. */
  start(): void;
  /** Une image (états 'play', 'dead' et 'exit' de la scène). */
  update(dt: number, dtMs: number): void;
  /**
   * Tir de Kaï dont la pointe est en (x, y) : -1 raté (le tir continue), 0 partie blindée (tir arrêté sans
   * dégât), sinon les dégâts infligés (tir arrêté).
   */
  hitBy(x: number, y: number, dmg: number): number;
  /** Dégâts directs pendant le combat, où que ce soit (hitBy, aides de test) ; renvoie les dégâts pris. */
  takeDamage(n: number): number;
  /** Kaï touche une partie blessante (corps, onde…) : abscisse de la source (recul), sinon NaN. */
  hurts(p: Player): number;
  /** Kaï retombe sur le boss : rebond (et dégâts éventuels) gérés ici ; vrai si c'est le cas. */
  stomp?(p: Player): boolean;
  /** Remis à neuf à sa place, en attente (vie perdue dans l'arène : choix 6 du plan 04). */
  reset(): void;
  destroy(): void;
  /** État détaillé, propre au boss (aides de test). */
  info?(): Record<string, unknown>;
}
