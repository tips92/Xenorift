// Contrat du module des cinématiques et de la radio de LUMA (docs/plans/04-monde-1.md, points 20 et 21).
// L'interface (ui/) s'y branche ; le module n'importe du jeu 2D que des dessins purs (art/draw, util, keys, palette),
// et ses textes de core/story.ts.

export type CutsceneId = 'prologue' | 'liberation';

/** Qui parle, humeur du portrait : définis avec les textes (core/story.ts). */
export type { Mood, Speaker } from '../core/story';

/** Repères sonores d'une cinématique : l'interface les traduit en effets sonores. */
export type CutsceneCue =
  | 'bip'
  | 'signal'
  | 'rift'
  | 'whoosh'
  | 'impact'
  | 'landing'
  | 'vide'
  | 'heal'
  | 'core'
  | 'skill'
  | 'takeoff';

export interface CutsceneAudio {
  cue(c: CutsceneCue): void;
}

/** Libération d'un gardien (même modèle pour les mondes 1 à 4). Monde 1 : 'Méduse-baleine', 'DOUBLE SAUT'. */
export interface LiberationParams {
  world: number;
  guardianName: string;
  skillLabel: string;
}

export interface CutsceneHandle {
  /** Pause demandée par l'interface (cumulable avec la pause automatique de la page cachée). */
  pause(): void;
  resume(): void;
  /** Termine tout de suite : `done` donne 'skipped'. */
  skip(): void;
  /** Libère tout (boucle, écouteurs, DOM) ; avant la fin, `done` donne 'skipped'. */
  destroy(): void;
  /** Fin naturelle ('ended') ou Passer, skip(), destroy() avant la fin ('skipped'). Ne rejette jamais. */
  readonly done: Promise<'ended' | 'skipped'>;
}
