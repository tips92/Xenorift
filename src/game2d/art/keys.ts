// Contrat entre le module graphique (src/game2d/art) et le moteur (src/game2d).
// Le module graphique génère par code toutes les textures et animations listées ici ;
// le moteur ne les utilise que via ces clés. Personnage dessiné tourné vers la DROITE (flipX pour la gauche).

/** Clés de texture Phaser. Taille des frames entre parenthèses (largeur x hauteur, px). */
export const TEX = {
  /** Tileset (64x64 par tuile), voir TILESET et TILE_FRAME. Les frames 0..15 sont aussi utilisables par des sprites. */
  tiles: 'tiles',
  /** Astronaute (64x80) — frames : voir FRAMES.player. */
  player: 'player',
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
  /** Tir laser du joueur (40x10), lumineux, orienté vers la droite. */
  laser: 'laser',
  /** Cristal à ramasser (32x40) — 6 frames. */
  crystal: 'crystal',
  /** Icônes de bonus (48x48). */
  powerTriple: 'pu-triple',
  powerShield: 'pu-shield',
  powerDoubleJump: 'pu-doublejump',
  /** Bulle de bouclier autour du joueur (96x96), semi-transparente. */
  shieldBubble: 'shield-bubble',
  /** Balise de point de contrôle (48x128) — frame 0 éteinte, 1-2 allumée. */
  checkpoint: 'checkpoint',
  /** Vaisseau du joueur garé = sortie du niveau (192x112), nez vers la droite. */
  ship: 'ship',
  /** Flamme du réacteur (48x32) — 2 frames, à placer sous/derrière le vaisseau. */
  shipFlame: 'ship-flame',
  /** Plateforme mobile (192x32). */
  mover: 'mover',
  /** Particule ronde blanche douce (16x16), teintée à l'exécution. */
  spark: 'spark',
  /** Petit nuage de poussière (32x32). */
  puff: 'puff',
} as const;

export const FRAME_SIZE = {
  player: { w: 64, h: 80 },
  walker: { w: 64, h: 56 },
  flyer: { w: 64, h: 56 },
  armored: { w: 72, h: 56 },
  spitter: { w: 64, h: 80 },
  crystal: { w: 32, h: 40 },
  checkpoint: { w: 48, h: 128 },
  shipFlame: { w: 48, h: 32 },
} as const;

/** Index des frames dans chaque planche (frames numérotées 0..n de gauche à droite). */
export const FRAMES = {
  player: { idle: [0, 1], run: [2, 3, 4, 5, 6, 7], jump: 8, fall: 9, hurt: 10 },
  walker: { walk: [0, 1, 2, 3], squashed: 4 },
  flyer: { fly: [0, 1, 2, 3] },
  armored: { walk: [0, 1, 2, 3] },
  spitter: { idle: [0, 1], shoot: 2 },
  crystal: { spin: [0, 1, 2, 3, 4, 5] },
  checkpoint: { off: 0, on: [1, 2] },
  shipFlame: { burn: [0, 1] },
} as const;

/** Clés des animations créées par le module graphique (anims.create). */
export const ANIM = {
  playerIdle: 'player-idle',
  playerRun: 'player-run',
  playerJump: 'player-jump',
  playerFall: 'player-fall',
  playerHurt: 'player-hurt',
  walkerWalk: 'walker-walk',
  flyerFly: 'flyer-fly',
  armoredWalk: 'armored-walk',
  spitterIdle: 'spitter-idle',
  spitterShoot: 'spitter-shoot',
  crystalSpin: 'crystal-spin',
  checkpointOn: 'checkpoint-on',
  shipFlame: 'ship-flame-burn',
} as const;

/**
 * Disposition du tileset : 8 colonnes x 2 lignes de tuiles 64x64, avec marge de 1 px et espacement de 2 px
 * (bords « extrudés » d'1 px pour éviter les coutures). Taille de la texture : 528 x 132.
 * Utilisation : map.addTilesetImage(TEX.tiles, TEX.tiles, 64, 64, TILESET.margin, TILESET.spacing)
 */
export const TILESET = { columns: 8, rows: 2, margin: 1, spacing: 2, width: 528, height: 132 } as const;

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
  PLATFORM: 9, // plateforme traversable par le dessous (épaisseur visuelle ~24 px en haut de la tuile)
  HAZARD: 10, // pics / acide (moitié basse de la tuile)
  DECOR_A: 11, // décor sans collision posé au bas de la tuile (plante, rocher…)
  DECOR_B: 12,
  DECOR_C: 13,
  GROUND_SINGLE: 14, // surface avec les deux bords (pilier d'une tuile de large)
  GROUND_FILL_ALT: 15, // variante de remplissage (fossiles, racines, cristaux)
} as const;
