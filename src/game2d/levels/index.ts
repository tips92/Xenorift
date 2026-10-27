import type { LevelData } from './types';
import { JUNGLE } from './jungle.ts';
import { MOON } from './moon.ts';

// Registre des niveaux de plateforme (clé = StageDef.levelId).

const LEVELS = new Map<string, LevelData>([
  [JUNGLE.id, JUNGLE],
  [MOON.id, MOON],
]);

/** Identifiants des niveaux disponibles (utilisé par scripts/check-levels.ts). */
export const LEVEL_IDS: readonly string[] = [...LEVELS.keys()];

/** Renvoie le niveau de plateforme demandé ('jungle' | 'moon'). */
export function getLevel(id: string): LevelData {
  const level = LEVELS.get(id);
  if (!level) throw new Error(`Niveau de plateforme inconnu : « ${id} »`);
  // Copie : le moteur peut lire la carte sans risquer d'altérer la référence partagée.
  return { ...level, map: level.map.slice() };
}
