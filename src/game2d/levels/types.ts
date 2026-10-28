import type { BossId, MusicId, RadioId, ThemeId } from '../../core/types';

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
  /**
   * Fin du niveau : 'exit' (par défaut) = la sortie de la carte, exactement une, vaisseau 'X' ou balise 'L' ;
   * 'guardian' = aucune sortie, le niveau se termine par la défaite du gardien (niveau 3 d'un monde).
   */
  ending?: 'exit' | 'guardian';
  /** Messages de la radio de LUMA (core/story.ts), chacun joué au plus une fois par partie. */
  radio?: readonly LevelRadio[];
  /** Boss de l'arène (case 'M' entre les deux bornes '|') : obligatoire avec une arène, interdit sans. */
  boss?: BossId;
}

/** Événements de jeu qui peuvent déclencher un message (engine/levelEvents.ts). */
export const RADIO_TRIGGERS = ['overheat', 'boss'] as const;
export type RadioTrigger = (typeof RADIO_TRIGGERS)[number];

/**
 * Message de la radio : `cols` [col0, col1] = quand Kaï (son centre) entre dans ces colonnes, sauté s'il les a
 * dépassées sans y passer (porte, téléportation) ; `on` = à la première fois que l'événement arrive
 * ('overheat' : première surchauffe de l'arme ; 'boss' : barrières de l'arène fermées, le combat commence).
 */
export type LevelRadio =
  | { readonly id: RadioId; readonly cols: readonly [number, number] }
  | { readonly id: RadioId; readonly on: RadioTrigger };

/**
 * Légende des caractères de la carte.
 * Entités : la case indique la position de départ ; l'entité repose au bas de la case
 * (sauf volant et plateformes mobiles).
 *
 * Portes (D) : elles vont par paires (1re ↔ 2e, 3e ↔ 4e…) dans cet ordre : par colonne croissante (de
 * gauche à droite), puis, dans une même colonne, par ligne croissante (de haut en bas). Attention :
 * parseLevel (engine/mapBuilder.ts) et find() de scripts/check-levels.ts parcourent la carte ligne par
 * ligne (lignes de haut en bas, colonnes de gauche à droite dans chaque ligne) : il faut donc trier les
 * portes trouvées par (col, row), comme les points de contrôle le sont par colonne. Un nombre impair de
 * portes est une erreur ; la dernière, sans paire, reste inerte. Entrer (↑ seul devant la porte, au sol)
 * téléporte devant l'autre porte de la paire : pieds au bas de sa case, centré sur sa colonne.
 */
export const LEGEND = {
  '.': 'vide',
  '#': 'sol solide (le moteur choisit surface / intérieur / bords)',
  B: 'bloc solide',
  '?': 'bloc bonus : libère 1 cristal quand on le frappe par dessous',
  '1': 'bloc bonus : vitesse (course et accélérations ×1,35 pendant 12 s)',
  '2': 'bloc bonus : bouclier',
  '3': 'bloc bonus : cadence (délai entre tirs et chauffe par tir ×0,6 pendant 12 s)',
  '=': 'plateforme traversable par le dessous',
  '^': 'pics / acide : retire 1 cœur et repousse le joueur',
  c: 'cristal',
  w: 'marcheur (patrouille, fait demi-tour au bord ou contre un mur)',
  f: 'volant (vol ondulé horizontal sur ±3 tuiles)',
  a: 'blindé (rebondir dessus ne le tue pas ; 2 tirs de laser)',
  p: 'cracheur fixe (tire des projectiles vers le joueur à moins de 8 tuiles)',
  P: 'départ du joueur (exactement un)',
  K: 'point de contrôle',
  X: 'vaisseau de sortie, la Comète (une seule sortie par niveau : X ou L ; occupe 3x2 tuiles à droite et au-dessus de la case, posé sur le sol)',
  L: "balise de LUMA, sortie des niveaux 1 et 2 d'un monde (une seule sortie par niveau : X ou L ; posée sur le sol ; colonne vide jusqu'en haut : son faisceau happe Kaï à toute hauteur, on ne la franchit pas)",
  m: 'plateforme mobile horizontale (3 tuiles de large, va-et-vient de 3 tuiles vers la droite)',
  v: 'plateforme mobile verticale (3 tuiles de large, va-et-vient de 3 tuiles vers le haut)',
  D: 'porte (1x2 tuiles : la case et celle du dessus, posée sur un sol) ; par paires, voir plus haut',
  '|': "borne d'arène de boss, posée sur le sol, colonne vide au-dessus : deux par arène, de 16 à 22 colonnes bornes comprises, sol continu entre elles, un 'K' dans les 6 colonnes avant la première ; barrières fermées de la borne jusqu'en haut pendant le combat, rouvertes par la victoire",
  M: "boss de l'arène (LevelData.boss), un seul, posé sur le sol entre les deux bornes '|'",
  '*': 'décor sans collision',
} as const;

export type LegendChar = keyof typeof LEGEND;
