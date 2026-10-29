import type { LevelData } from './types';
import { JUNGLE } from './jungle/j1.ts';
import { JUNGLE2 } from './jungle/j2.ts';
import { JUNGLE3 } from './jungle/j3.ts';
import { MOON } from './moon.ts';

// Registre des niveaux de plateforme (clé = StageDef.levelId).

const LEVELS = new Map<string, LevelData>([
  [JUNGLE.id, JUNGLE],
  [JUNGLE2.id, JUNGLE2],
  [JUNGLE3.id, JUNGLE3],
  [MOON.id, MOON],
]);

/** Identifiants des niveaux disponibles (utilisé par scripts/check-levels.ts). */
export const LEVEL_IDS: readonly string[] = [...LEVELS.keys()];

/** Renvoie le niveau de plateforme demandé ('jungle', 'jungle2', 'jungle3', 'moon'). */
export function getLevel(id: string): LevelData {
  const level = LEVELS.get(id);
  if (!level) throw new Error(`Niveau de plateforme inconnu : « ${id} »`);
  // Copie : le moteur peut lire la carte sans risquer d'altérer la référence partagée.
  return { ...level, map: level.map.slice() };
}
