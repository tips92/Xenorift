import {
  DOUBLE_JUMP_VELOCITY,
  GRAVITY,
  JUMP_VELOCITY,
  TILE,
} from '../constants';

// Réglages internes du moteur 2D (le contrat de gameplay reste dans ../constants.ts).

/** Clé de la scène Phaser du mode plateforme. */
export const SCENE_KEY = 'platform';

/** Fréquence fixe de la simulation Arcade (pas fixe = sauts identiques quel que soit le framerate). */
export const PHYS_FPS = 60;

/**
 * Pénétration max corrigée contre une tuile en un pas. À 60 Hz : chute max 1400/60 ≈ 23 px,
 * saut 1204/60 ≈ 20 px ; la valeur par défaut (16) laisserait traverser sols et plafonds.
 */
export const TILE_BIAS = 32;

/**
 * Vitesses de saut corrigées : l'intégration d'Euler semi-implicite à pas fixe perd ≈ v·dt/2 de hauteur.
 * On ajoute g·dt/2 pour que le sommet discret vaille exactement JUMP_HEIGHT_TILES (4,2 tuiles = 268,8 px).
 */
export const JUMP_V = JUMP_VELOCITY + GRAVITY / (2 * PHYS_FPS);
export const DOUBLE_JUMP_V = DOUBLE_JUMP_VELOCITY + GRAVITY / (2 * PHYS_FPS);

// ---------------------------------------------------------------- Déplacement de Kaï
export const GROUND_ACCEL = 3000;
export const GROUND_TURN_ACCEL = 6400;
export const GROUND_DECEL = 3600;
export const AIR_ACCEL = 2000;
export const AIR_TURN_ACCEL = 2800;
export const AIR_DECEL = 900;
export const COYOTE_MS = 100;
export const JUMP_BUFFER_MS = 120;
/** Relâcher le saut tôt conserve 55 % de la vitesse montante (coupe ~45 %). */
export const JUMP_CUT = 0.55;
export const STOMP_BOUNCE = 0.6;
export const STOMP_BOUNCE_HELD = 0.85;
/** Durée sans contrôle après un coup (recul). */
export const HURT_LOCK_MS = 260;
export const KNOCKBACK_X = 300;
export const KNOCKBACK_Y = 520;
/** Rebond vertical quand on tombe dans des pics. */
export const HAZARD_POP_Y = 760;
/** Décalage du pistolet par rapport aux pieds (personnage tourné vers la droite). */
export const GUN_OFFSET_X = 28;
export const GUN_OFFSET_Y = -38;

// ---------------------------------------------------------------- Laser
/** Délai après un tir avant que le laser refroidisse (sinon 5 tirs rapides ne surchaufferaient jamais). */
export const HEAT_COOL_DELAY_MS = 260;
export const TRIPLE_SPREAD_RAD = (10 * Math.PI) / 180;

// ---------------------------------------------------------------- Ennemis
/** Les ennemis ne sont simulés qu'à moins de 1,5 écran du centre de la caméra. */
export const ACTIVE_RANGE_SCREENS = 1.5;
export const WALKER_SPEED = 1.6 * TILE;
export const ARMORED_SPEED = 1.0 * TILE;
export const FLYER_AMPLITUDE = 3 * TILE;
export const FLYER_PERIOD_S = 5;
export const SPITTER_RANGE = 8 * TILE;
export const SPITTER_INTERVAL_MS = 2200;
export const SPORE_SPEED = 330;
export const SPORE_GRAVITY = 420;
export const SPORE_LIFE_S = 4;
export const ARMORED_HP = 2;

// ---------------------------------------------------------------- Plateformes mobiles
export const MOVER_TRAVEL = 3 * TILE;
/** Aller-retour complet (≈ 2 tuiles/s en moyenne, mouvement adouci). */
export const MOVER_PERIOD_S = 3.2;

// ---------------------------------------------------------------- Caméra
// Kaï reste vers 40 % de l'écran : les boutons TIR/SAUT masquent le bas à droite, on voit venir les ennemis.
export const CAMERA_LOOKAHEAD = 2.5 * TILE;
export const CAMERA_LERP_X = 0.1;
export const CAMERA_LERP_Y = 0.12;
/** La caméra vise un peu au-dessus de Kaï (au sol). */
export const CAMERA_OFFSET_Y = 40;
/** Marges d'écran (px) qui forcent la caméra à suivre verticalement pendant un saut / une chute. */
export const CAMERA_EDGE_TOP = 110;
export const CAMERA_EDGE_BOTTOM = 90;

// ---------------------------------------------------------------- Score
export const SCORE_CRYSTAL = 50;
export const SCORE_ENEMY = 100;
export const SCORE_LIFE = 500;
export const TIME_BONUS_REF_S = 240;
export const TIME_BONUS_PER_S = 10;

/** Couleur de fond (fondus au noir). */
export const BG_RGB = { r: 5, g: 1, b: 15 } as const;
