// Constantes du mode plateforme 2D. Le level design (src/game2d/levels) s'appuie sur ces limites :
// le moteur doit les garantir, les niveaux ne doivent jamais les dépasser sur le chemin principal.

/** Taille d'une tuile, en pixels logiques. */
export const TILE = 64;

/** Hauteur logique de la vue (11,25 tuiles visibles). La largeur suit le ratio de l'écran. */
export const VIEW_H = 720;
export const MIN_VIEW_W = 1080;
export const MAX_VIEW_W = 1600;

/** Nombre de lignes de chaque carte de niveau. */
export const LEVEL_ROWS = 14;

// ---------------------------------------------------------------- Physique du joueur

export const GRAVITY = 2600; // px/s²
export const MAX_FALL_SPEED = 1400; // px/s
export const RUN_SPEED = 6 * TILE; // 384 px/s
/** Sommet du saut (bouton maintenu), en tuiles au-dessus du point de départ des pieds. */
export const JUMP_HEIGHT_TILES = 4.2;
export const JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT_TILES * TILE);
/** Hauteur supplémentaire du second saut (bonus « double saut »). */
export const DOUBLE_JUMP_HEIGHT_TILES = 3;
export const DOUBLE_JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * DOUBLE_JUMP_HEIGHT_TILES * TILE);

/** Taille de la boîte de collision du joueur (il tient dans un couloir de 2 tuiles de haut). */
export const PLAYER_BODY = { width: 34, height: 70 };

// ---------------------------------------------------------------- Règles de level design
// « écart » = nombre de colonnes vides entre le bord de départ et le bord d'arrivée.
// « montée » = nombre de lignes entre la surface de départ et la surface d'arrivée.
export const DESIGN_RULES = {
  /** Même hauteur : écart max. */
  maxGapFlat: 4,
  /** Montée de 1 ou 2 lignes : écart max. */
  maxGapUp2: 3,
  /** Montée de 3 lignes : écart max. */
  maxGapUp3: 2,
  /** Montée max sur le chemin principal (4 lignes = réservé au double saut). */
  maxRise: 3,
  /** Descente d'au moins 2 lignes : écart max. */
  maxGapDown: 5,
} as const;

// ---------------------------------------------------------------- Combat

export const MAX_HEARTS = 3;
export const START_LIVES = 3;
export const INVULNERABLE_MS = 1200;
export const LASER_SPEED = 900; // px/s
export const LASER_RANGE = 9 * TILE;
export const LASER_COOLDOWN_MS = 160;
/** Chauffe ajoutée par tir (5 tirs rapides = surchauffe). */
export const LASER_HEAT_PER_SHOT = 0.2;
/** Refroidissement par seconde. */
export const LASER_COOL_RATE = 0.45;
/** En surchauffe, le tir reprend quand la chauffe redescend sous ce seuil. */
export const LASER_RECOVER_AT = 0.3;
export const POWER_DURATION_MS = { triple: 15000, doublejump: 20000 } as const;

// ---------------------------------------------------------------- Ordre d'affichage (depth)

export const DEPTH = {
  parallaxFar: -100,
  parallaxNear: -10,
  decor: 5,
  tiles: 10,
  items: 20,
  enemies: 30,
  player: 40,
  projectiles: 50,
  particles: 60,
  foreground: 70,
} as const;
