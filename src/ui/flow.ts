import { nextStage } from '../core/stages';
import type { StageDef } from '../core/types';

// Décisions pures de l'enchaînement des étapes (docs/plans/04-monde-1.md, point 6). Les fondus, navigate et
// flowId restent dans App.ts ; la progression (étape de JOUER, verrous) dans core/save.ts.

/** Étape proposée après `stage` (hangar puis sa carte d'intro) ; null après la dernière : fin de la démo. */
export function stageAfter(stage: StageDef): StageDef | null {
  return nextStage(stage) ?? null;
}

/** Libellé du bouton de départ du hangar vers `next` : on atterrit au niveau 1, on y redescend ensuite, on décolle pour le vol. */
export function departLabel(next: StageDef): string {
  if (next.part === 4) return 'Décoller';
  return next.part === 1 ? 'Atterrir' : 'Redescendre';
}

/** Ligne sous JOUER : « Nouvelle aventure » sur une sauvegarde neuve, sinon l'étape reprise. */
export function playSubtitle(fresh: boolean, next: StageDef): string {
  return fresh ? 'Nouvelle aventure' : `Continuer · ${next.title}`;
}
