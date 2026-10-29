import type { WeaponId } from '../../core/types';

// Contrat entre le module graphique (src/game2d/art) et le moteur (src/game2d).
// Le module graphique génère par code toutes les textures et animations listées ici ;
// le moteur ne les utilise que via ces clés. Personnage dessiné tourné vers la DROITE (flipX pour la gauche).

/** Clés de texture Phaser. Taille des frames entre parenthèses (largeur x hauteur, px). */
export const TEX = {
  /** Tileset (64x64 par tuile), voir TILESET et TILE_FRAME. Ses frames sont aussi utilisables par des sprites. */
  tiles: 'tiles',
  /** Astronaute (64x80) — frames : voir FRAMES.player. Dessiné SANS le bras armé (sprite à part, voir ARM_RIG). */
  player: 'player',
  /** Bras armé de Kaï, une texture par arme (64x32 chacune) — frames : voir FRAMES.arm ; table : ARM_TEX. */
  armLaser: 'arm-laser',
  armMachinegun: 'arm-machinegun',
  armShotgun: 'arm-shotgun',
  armRifle: 'arm-rifle',
  /** Blob qui patrouille au sol (64x56). */
  walker: 'walker',
  /** Insecte volant (64x56). */
  flyer: 'flyer',
  /** Crabe / scarabée blindé (72x56). */
  armored: 'armored',
  /** Plante / tourelle fixe qui crache des projectiles (64x80). */
  spitter: 'spitter',
  /** Projectile ennemi (24x24). */
  spore: 'spore',
  /**
   * Projectiles de Kaï, un par arme (table : BULLET_TEX, tailles : BULLET_SIZE), lumineux, orientés vers la
   * droite, centrés. Trait laser (40x10), balle de mitrailleur (24x6, trait court cyan), plomb de pompe
   * (12x12, ambre), trait de fusil d'assaut (56x8, long, blanc-violet).
   */
  laser: 'laser',
  bulletMachinegun: 'bullet-machinegun',
  bulletShotgun: 'bullet-shotgun',
  bulletRifle: 'bullet-rifle',
  /** Cristal à ramasser (32x40) — 6 frames. */
  crystal: 'crystal',
  /** Icônes de bonus (48x48) : vitesse (bloc 1), bouclier (bloc 2), cadence (bloc 3). */
  powerSpeed: 'pu-speed',
  powerShield: 'pu-shield',
  powerRapid: 'pu-rapid',
  /** Bulle de bouclier autour du joueur (96x96), semi-transparente. */
  shieldBubble: 'shield-bubble',
  /** Balise de point de contrôle (48x128) — frame 0 éteinte, 1-2 allumée. */
  checkpoint: 'checkpoint',
  /** Vaisseau du joueur garé = sortie du niveau (192x112), nez vers la droite. */
  ship: 'ship',
  /** Flamme du réacteur (48x32) — 2 frames, à placer sous/derrière le vaisseau. */
  shipFlame: 'ship-flame',
  /**
   * Balise de LUMA = sortie des niveaux 1 et 2 d'un monde (64x160, posée au bas de sa case), identique dans tous
   * les thèmes — frames : FRAMES.beacon (veille, activée).
   */
  beacon: 'beacon',
  /** Faisceau de la balise (64x128) — 2 frames, colonne de lumière à étirer en hauteur, en mode additif. */
  beaconBeam: 'beacon-beam',
  /** Plateforme mobile (192x32). */
  mover: 'mover',
  /** Porte (64x128 = 1x2 tuiles, posée au bas de sa case), selon le thème — frame 0 fermée, 1 ouverte. */
  door: 'door',
  /** Flèche ▲ d'interaction au-dessus d'une porte quand Kaï est devant (28x24), pointe vers le haut. */
  interactArrow: 'interact-arrow',
  /** Mur du fond d'une salle close (64x64, se répète), selon le thème : derrière les cases vides de la salle. */
  roomWall: 'room-wall',
  /** Glyphes astréens gravés sur le mur du fond (cases 'G', 64x64) — frames : FRAMES.glyph (éteints, allumés). */
  glyphs: 'w1-glyphs',
  /** Particule ronde blanche douce (16x16), teintée à l'exécution. */
  spark: 'spark',
  /** Petit nuage de poussière (32x32). */
  puff: 'puff',
  /**
   * Barrière d'arène (64x64 par case, 7 frames : FRAMES.barrier), une texture par partie de la colonne : borne du
   * haut, milieu, borne du bas. Générées avec l'arène (generateArenaArt), pas par generatePlatformArt.
   */
  barrierTop: 'w1-barrier-top',
  barrierMid: 'w1-barrier-mid',
  barrierBottom: 'w1-barrier-bottom',
  /**
   * Objets du décor d'un niveau, générés avec lui (generateLevelArt) : champignon 'o' (64x64, posé au bas de sa
   * case, FRAMES.mushroom), tronc abattu par la secousse (256x256 = 4x4 cases, origine au coin bas-gauche de la
   * souche, FRAMES.trunk), tache au sol qui annonce une spore (128x40, centrée sur le sol, FRAMES.sporeSpot),
   * naufragée 'N' (Tess, 64x80 comme Kaï, posée par les pieds, tournée vers la droite, FRAMES.tess) et sa capsule
   * (128x128 = 2x2 cases, origine au joint bas des deux cases, FRAMES.capsule).
   */
  mushroom: 'w1-mushroom',
  trunk: 'w1-trunk',
  sporeSpot: 'w1-spore-spot',
  tess: 'w1-tess',
  capsule: 'w1-capsule',
} as const;

export const FRAME_SIZE = {
  player: { w: 64, h: 80 },
  arm: { w: 64, h: 32 },
  door: { w: 64, h: 128 },
  walker: { w: 64, h: 56 },
  flyer: { w: 64, h: 56 },
  armored: { w: 72, h: 56 },
  spitter: { w: 64, h: 80 },
  crystal: { w: 32, h: 40 },
  checkpoint: { w: 48, h: 128 },
  shipFlame: { w: 48, h: 32 },
  beacon: { w: 64, h: 160 },
  beaconBeam: { w: 64, h: 128 },
  glyph: { w: 64, h: 64 },
} as const;

/** Index des frames dans chaque planche (frames numérotées 0..n de gauche à droite). */
export const FRAMES = {
  player: { idle: [0, 1], run: [2, 3, 4, 5, 6, 7], jump: 8, fall: 9, hurt: 10, crouch: 11, crouchShoot: 12, crawl: [13, 14] },
  /** Bras armé : 0 au repos, 1 recul (canon reculé, éclair à la bouche) à montrer brièvement après un tir. */
  arm: { rest: 0, recoil: 1 },
  door: { closed: 0, open: 1 },
  walker: { walk: [0, 1, 2, 3], squashed: 4 },
  flyer: { fly: [0, 1, 2, 3] },
  armored: { walk: [0, 1, 2, 3] },
  spitter: { idle: [0, 1], shoot: 2 },
  crystal: { spin: [0, 1, 2, 3, 4, 5] },
  checkpoint: { off: 0, on: [1, 2] },
  shipFlame: { burn: [0, 1] },
  /** Balise : veille (lueur qui pulse, chevrons allumés tour à tour), activée (tout allumé, anneaux). */
  beacon: { idle: [0, 1], on: [2, 3] },
  beaconBeam: { flicker: [0, 1] },
  /**
   * Glyphe (GLYPH_VARIANTS de draw/world1.ts) : motif v éteint = v, allumé = v + on (posé par-dessus en fondu).
   * Motifs : 0 réseau, 1 chaîne de portails, 2 gardien, 3 noyau, 4 Astréen, 5 spirale de la Faille.
   */
  glyph: { variants: 6, on: 6 },
  /** Barrière : crépitement (fermée), éteinte (bornes seules), allumage, extinction ; même frame sur toute la colonne. */
  barrier: { crackle: [0, 1, 2, 3], off: 4, close: [4, 5, 6], open: [6, 5, 4] },
  /** Champignon : repos (lueur qui pulse), rebond (écrasé, détente, retour). */
  mushroom: { idle: [0, 1, 2, 1], bounce: [3, 4, 5, 0] },
  /** Tronc : debout, tremblement, chute, couché. */
  trunk: { stand: 0, tremble: [0, 1, 0, 2], fall: [3, 4, 5, 6], lying: 6 },
  /** Tache d'une spore : lointaine, proche, imminente. */
  sporeSpot: { warn: [0, 1, 2] },
  /** Tess : repos, salut, téléportation par LUMA (dissolution) ; capsule : feu de détresse allumé, éteint. */
  tess: { idle: [0, 1], wave: [2, 3], beam: [4, 5, 6, 7] },
  capsule: { blink: [0, 1] },
} as const;

/** Clés des animations créées par le module graphique (anims.create). */
export const ANIM = {
  playerIdle: 'player-idle',
  playerRun: 'player-run',
  playerJump: 'player-jump',
  playerFall: 'player-fall',
  playerHurt: 'player-hurt',
  playerCrouch: 'player-crouch',
  playerCrouchShoot: 'player-crouch-shoot',
  playerCrawl: 'player-crawl',
  walkerWalk: 'walker-walk',
  flyerFly: 'flyer-fly',
  armoredWalk: 'armored-walk',
  spitterIdle: 'spitter-idle',
  spitterShoot: 'spitter-shoot',
  crystalSpin: 'crystal-spin',
  checkpointOn: 'checkpoint-on',
  shipFlame: 'ship-flame-burn',
  beaconIdle: 'beacon-idle',
  beaconOn: 'beacon-on',
  beaconBeam: 'beacon-beam-flicker',
} as const;

// ---------------------------------------------------------------- Bras armé de Kaï

/** Texture du bras armé par arme (même gréement ARM_RIG et mêmes frames pour toutes). */
export const ARM_TEX = {
  laser: TEX.armLaser,
  machinegun: TEX.armMachinegun,
  shotgun: TEX.armShotgun,
  rifle: TEX.armRifle,
} as const satisfies Record<WeaponId, string>;

/** Texture du projectile par arme. */
export const BULLET_TEX = {
  laser: TEX.laser,
  machinegun: TEX.bulletMachinegun,
  shotgun: TEX.bulletShotgun,
  rifle: TEX.bulletRifle,
} as const satisfies Record<WeaponId, string>;

/**
 * Taille des textures de projectile (px) et `tip` : distance du centre à la pointe, le long du tir (point
 * testé contre les tuiles et les ennemis ; laser : 16, l'ancien BOLT_TIP).
 */
export const BULLET_SIZE = {
  laser: { w: 40, h: 10, tip: 16 },
  machinegun: { w: 24, h: 6, tip: 10 },
  shotgun: { w: 16, h: 16, tip: 7 },
  rifle: { w: 56, h: 8, tip: 24 },
} as const satisfies Record<WeaponId, { w: number; h: number; tip: number }>;

/**
 * Projectiles rendus en mode additif (lueur sans contour). Les plombs de la pompe, cerclés de sombre, sont en
 * mode normal : en additif, leur ambre virait au blanc rosé sur les fonds violets de la Jungle.
 */
export const BULLET_ADDITIVE = {
  laser: true,
  machinegun: true,
  shotgun: false,
  rifle: true,
} as const satisfies Record<WeaponId, boolean>;

/**
 * Gréement du bras armé : sprite à part (FRAME_SIZE.arm, toutes armes), dessiné tourné vers la DROITE, arme
 * dans l'axe du tir devant (angle 0), qui pivote autour de l'épaule proche de Kaï. En px :
 * - pivotX / pivotY : épaule dans la frame du bras → setOrigin(pivotX / 64, pivotY / 32) ;
 * - shoulder* : épaule par rapport à l'origine du sprite de Kaï (centre des pieds), tourné vers la droite
 *   (y < 0 = vers le haut), debout puis accroupi. Les poses du corps gardent l'épaule à ±2 px de ces points.
 * - upShoulderX : en visée haute seulement, épaule avancée d'autant (ajouté à sx) : le canon monte le long du
 *   bord avant du casque au lieu de cacher la visière.
 * - diagShoulderX / diagShoulderY : en visée diagonale seulement, épaule avancée et abaissée d'autant (ajoutés
 *   à sx et sy) : le canon passe devant le bas du casque au lieu de mordre la visière.
 * Bouche du canon, avec f = ±1 (côté), a = AIM_ANGLE (constants.ts), (sx, sy) l'épaule (décalages de visée
 * compris), et
 * (mx, my) = ARM_MUZZLE[arme] - (pivotX, pivotY) :
 *   x = pieds.x + f·(sx + mx·cos a + my·sin a)   y = pieds.y + sy - mx·sin a + my·cos a
 * Sprite du bras : position = pieds + (f·sx, sy), setScale(f, 1), rotation = -f·a (une échelle négative
 * retourne l'image autour de l'origine ; flipX la retournerait autour du centre de la frame).
 */
export const ARM_RIG = {
  pivotX: 10,
  pivotY: 12,
  shoulderX: 1,
  shoulderY: -45,
  crouchShoulderX: 3,
  crouchShoulderY: -26,
  upShoulderX: 11,
  diagShoulderX: 6,
  diagShoulderY: 3,
} as const;

/**
 * Bouche du canon dans la frame du bras, par arme : le tir part de ce point, dans l'axe de la visée. Même main
 * pour toutes les armes ; seul le canon s'allonge (x ≤ 54 : l'éclair de la frame de recul tient dans les 64 px).
 * Laser : (27, 7) depuis le pivot → debout, devant : (28, -38) des pieds (= l'ancien décalage fixe du pistolet) ;
 * accroupi, devant : (30, -19), au ras du sol ; debout, en haut : (19, -72), au-dessus du bord avant du casque
 * (épaule avancée de upShoulderX). Les autres : valeurs de départ, le dessin peut les ajuster (y entre 17 et 21).
 */
export const ARM_MUZZLE = {
  laser: { x: 37, y: 19 },
  machinegun: { x: 44, y: 19 },
  shotgun: { x: 48, y: 19 },
  rifle: { x: 54, y: 19 },
} as const satisfies Record<WeaponId, { x: number; y: number }>;

/**
 * Disposition du tileset : 8 colonnes x 4 lignes de tuiles 64x64, avec marge de 1 px et espacement de 2 px
 * (bords « extrudés » d'1 px pour éviter les coutures). Taille de la texture : 528 x 264.
 * Utilisation : map.addTilesetImage(TEX.tiles, TEX.tiles, 64, 64, TILESET.margin, TILESET.spacing)
 */
export const TILESET = { columns: 8, rows: 4, margin: 1, spacing: 2, width: 528, height: 264 } as const;

/** Index de chaque tuile dans le tileset (= index de tuile Phaser = numéro de frame de la texture). */
export const TILE_FRAME = {
  GROUND_TOP: 0, // surface (herbe / régolithe) avec sol en dessous
  GROUND_FILL: 1, // intérieur du sol
  GROUND_TOP_LEFT: 2, // surface, bord gauche arrondi
  GROUND_TOP_RIGHT: 3, // surface, bord droit arrondi
  GROUND_LEFT: 4, // intérieur, paroi gauche
  GROUND_RIGHT: 5, // intérieur, paroi droite
  BLOCK: 6, // bloc solide décoratif
  BONUS: 7, // bloc bonus actif (symbole lumineux)
  BONUS_USED: 8, // bloc bonus vidé
  PLATFORM: 9, // plateforme traversable sans motif (aperçus ; les cartes posent WALKWAY), épaisseur ~24 px en haut
  HAZARD: 10, // pics / acide (moitié basse de la tuile)
  DECOR_A: 11, // décor sans collision posé au bas de la tuile (plante, rocher…)
  DECOR_B: 12,
  DECOR_C: 13,
  GROUND_SINGLE: 14, // surface avec les deux bords (pilier d'une tuile de large)
  GROUND_FILL_ALT: 15, // variante de remplissage (fossiles, racines, cristaux)
  /**
   * Plateforme traversable à motifs, 9 tuiles (WALKWAY..WALKWAY + 8) = famille x 3 + variante : branche, liane,
   * passerelle dans la Jungle (art/draw/world1.ts), la plateforme du thème ailleurs. Une famille par rangée de '='.
   */
  WALKWAY: 16,
} as const;

/** Tuiles à motifs de plateforme traversable : WALKWAY_FAMILY_COUNT familles de WALKWAY_VARIANTS variantes. */
export const WALKWAY_FAMILY_COUNT = 3;
export const WALKWAY_VARIANTS = 3;
