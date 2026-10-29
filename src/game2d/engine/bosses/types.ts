import type { BossId } from '../../../core/types';
import type { Player } from '../Player';

// Contrat des boss 2D (plan 04, point 16). Un boss vit dans une arène (engine/arena.ts) : la scène le crée au
// chargement (createBoss), le démarre quand les barrières se ferment, le met à jour, lui passe les tirs de Kaï
// (ShotPool.probe) et les contacts, et le remet à neuf quand Kaï perd une vie dans l'arène. Il n'alloue rien par
// image et ne passe que par l'horloge de la scène (update) : pause, perte de contexte et arrêt sont respectés.
// Il se bat en touches (point 20) : une touche = un tir ou un saut qui atteint son point faible exposé, quelle que
// soit l'arme (les améliorations de dégâts ne comptent pas) ; le point faible se referme ensuite jusqu'à la fenêtre
// suivante.

/** Place du boss : case 'M' (pieds au bas de la case) et intérieur de l'arène (px, entre les deux bornes). */
export interface BossSpot {
  x: number;
  feetY: number;
  left: number;
  right: number;
}

/**
 * 'wait' : avant le combat (immobile, insensible) ; 'fight' : combat ; 'beaten' : vaincu, il s'enfuit (insensible,
 * inoffensif ; le gardien, lui, reste dans la scène le temps de sa défaite, puis le niveau se termine) ; 'gone' :
 * parti (caché).
 */
export type BossState = 'wait' | 'fight' | 'beaten' | 'gone';

export interface Boss {
  readonly id: BossId;
  /** Nom affiché sur la barre de boss. */
  readonly name: string;
  /** Touches restantes, sur `maxLife` (crans de la barre). */
  life: number;
  readonly maxLife: number;
  /** Phase en cours, à partir de 1, sur `phases`. */
  phase: number;
  readonly phases: number;
  state: BossState;
  /**
   * Gardien (niveau 3 d'un monde, LevelData.ending 'guardian') : durée de sa défaite dans la scène (ms, au plus
   * EXIT_MAX_MS) ; la scène reste dans l'état 'exit' ce temps-là, puis termine le niveau.
   */
  readonly defeatMs?: number;
  /** Centre des pieds d'un boss au sol ; centre du corps d'un boss volant (méduse-baleine) (px du monde). */
  readonly x: number;
  readonly y: number;
  /** Les barrières viennent de se fermer : le combat commence. */
  start(): void;
  /** Une image (états 'play', 'dead' et 'exit' de la scène). */
  update(dt: number, dtMs: number): void;
  /**
   * Tir de Kaï dont la pointe est en (x, y) : -1 raté (le tir continue), 0 partie blindée ou point faible fermé (tir
   * arrêté sans effet), 1 point faible atteint (tir arrêté) : une touche, ou un plomb de la salve qui vient de toucher.
   */
  hitBy(x: number, y: number): number;
  /** Touches directes pendant le combat (hitBy, saut, aides de test) : point faible refermé ; renvoie les touches prises. */
  takeDamage(n: number): number;
  /** Kaï touche une partie blessante (corps, onde…) : abscisse de la source (recul), sinon NaN. */
  hurts(p: Player): number;
  /** Kaï retombe sur le boss : rebond (et touche éventuelle) gérés ici ; vrai si c'est le cas. */
  stomp?(p: Player): boolean;
  /** Remis à neuf à sa place, en attente (vie perdue dans l'arène : choix 6 du plan 04). */
  reset(): void;
  destroy(): void;
  /** État détaillé, propre au boss (aides de test). */
  info?(): Record<string, unknown>;
}
