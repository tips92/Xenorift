import type { MusicId, ThemeId } from '../../core/types';

// Format des niveaux de plateforme : une carte ASCII, lignes de haut en bas, toutes de même longueur,
// LEVEL_ROWS (14) lignes. Une case = une tuile de 64 px. La dernière ligne est le fond du niveau :
// une colonne sans sol en bas est un trou (chute = vie perdue).
//
// Ce fichier et les fichiers de niveaux ne doivent contenir que des données et des `import type`,
// pour pouvoir être lus directement par Node (scripts/check-levels.ts).

export interface LevelData {
  id: string;
  theme: ThemeId;
  name: string;
  music: MusicId;
  map: string[];
}

/**
 * Légende des caractères de la carte.
 * Entités : la case indique la position de départ ; l'entité repose au bas de la case
 * (sauf volant et plateformes mobiles).
 */
export const LEGEND = {
  '.': 'vide',
  '#': 'sol solide (le moteur choisit surface / intérieur / bords)',
  B: 'bloc solide',
  '?': 'bloc bonus : libère 1 cristal quand on le frappe par dessous',
  '1': 'bloc bonus : tir triple',
  '2': 'bloc bonus : bouclier',
  '3': 'bloc bonus : double saut',
  '=': 'plateforme traversable par le dessous',
  '^': 'pics / acide : retire 1 cœur et repousse le joueur',
  c: 'cristal',
  w: 'marcheur (patrouille, fait demi-tour au bord ou contre un mur)',
  f: 'volant (vol ondulé horizontal sur ±3 tuiles)',
  a: 'blindé (rebondir dessus ne le tue pas ; 2 tirs de laser)',
  p: 'cracheur fixe (tire des projectiles vers le joueur à moins de 8 tuiles)',
  P: 'départ du joueur (exactement un)',
  K: 'point de contrôle',
  X: 'vaisseau de sortie (exactement un ; occupe 3x2 tuiles à droite et au-dessus de la case, posé sur le sol)',
  m: 'plateforme mobile horizontale (3 tuiles de large, va-et-vient de 3 tuiles vers la droite)',
  v: 'plateforme mobile verticale (3 tuiles de large, va-et-vient de 3 tuiles vers le haut)',
  '*': 'décor sans collision',
} as const;

export type LegendChar = keyof typeof LEGEND;
