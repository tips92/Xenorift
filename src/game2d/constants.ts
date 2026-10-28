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
/** Hauteur du second saut (compétence « double saut » : ModeHooks.loadout.skills.doubleJump). */
export const DOUBLE_JUMP_HEIGHT_TILES = 3;
export const DOUBLE_JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * DOUBLE_JUMP_HEIGHT_TILES * TILE);

/** Taille de la boîte de collision du joueur (il tient dans un couloir de 2 tuiles de haut). */
export const PLAYER_BODY = { width: 34, height: 70 };
/**
 * Corps accroupi (↓ seul) : même largeur, pieds en place, 24 px de moins en haut. Il passe sous un plafond
 * d'une tuile ; Kaï ne se relève que s'il a de nouveau PLAYER_BODY.height de place au-dessus des pieds.
 */
export const PLAYER_CROUCH_BODY = { width: PLAYER_BODY.width, height: 46 };
/**
 * Descente d'étage (↓ + Saut sur une plateforme `=` ou mobile ; sur un sol plein, c'est un saut normal) :
 * pendant ce délai, ces supports laissent passer Kaï vers le bas (≈ 52 px de chute depuis l'arrêt).
 */
export const DROP_THROUGH_MS = 200;

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

/**
 * Cœurs de Kaï : MAX_HEARTS sans achat (3), jusqu'à MAX_HEARTS_CAP (5) avec les cœurs du hangar. Valeur d'une
 * partie : ModeHooks.loadout.maxHearts (core/hangar.ts), au départ, à la réapparition et dans le HUD.
 */
export { BASE_HEARTS as MAX_HEARTS, MAX_HEARTS_CAP } from '../core/hangar.ts';
export const START_LIVES = 3;
export const INVULNERABLE_MS = 1200;
// Armes : fiches dans core/weapons.ts (WEAPONS, resolveWeapon, OVERHEAT_RECOVER_AT).
/** Projectiles de Kaï en pool (plombs et rafales compris) ; pool plein : le plus ancien est recyclé. */
export const PROJECTILE_POOL_SIZE = 40;
/**
 * Étoiles d'un niveau selon la part des cristaux ramassés (PlatformScene.finishLevel) : 3 à partir de `three`,
 * 2 à partir de `two`, sinon 1. check-levels vérifie que `three` reste possible sans les secrets de compétence.
 */
export const STARS_RATIO = { three: 0.9, two: 0.5 } as const;

// ---------------------------------------------------------------- Bonus (blocs 1, 2, 3)
// Vitesse (1) et cadence (3) se cumulent, un anneau chacun dans le HUD ; reprendre le même bonus remet sa
// durée au maximum. Bouclier (2) : jusqu'au prochain coup. Tout est perdu avec une vie.

export const POWER_DURATION_MS = { speed: 12000, rapid: 12000 } as const;
/**
 * Vitesse : vitesses ET accélérations horizontales de Kaï multipliées (RUN_SPEED, reptation, GROUND_* et AIR_*
 * de engine/tuning.ts). Le saut ne change pas.
 */
export const SPEED_BOOST_MUL = 1.35;
/** Cadence : délai entre tirs ×0,6 et chauffe par tir ×0,6 (appliqué par resolveWeapon de core/weapons.ts). */
export { RAPID_FIRE_MUL } from '../core/weapons.ts';
/**
 * Angles de visée (rad), comptés vers le haut depuis l'horizontale devant Kaï. Le signe se gère au tir :
 * angle Phaser (y vers le bas) = -a tourné vers la droite, π + a tourné vers la gauche. Accroupi : 'front'.
 */
export const AIM_ANGLE = { front: 0, diag: Math.PI / 4, up: Math.PI / 2 } as const;
export type AimDir = keyof typeof AIM_ANGLE;

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
