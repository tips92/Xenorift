import type { LevelData } from '../types';
import { joinSegments } from '../build.ts';
import type { Segment } from '../build.ts';
import { stageText } from '../../../core/story.ts';

// Monde 1, niveau 1 (j1) — Lisière de Xéna : niveau d'apprentissage, à la manière d'un « 1-1 ».
// Chaque mécanique est présentée seule, sans danger, puis combinée. Sol de base : lignes 12-13.
// Repères de colonnes en commentaire (colonne absolue du premier caractère du segment).

/** 0 — Départ : zone sûre, premiers cristaux à ramasser en marchant, premier bloc « ? ».
 *  Départ en colonne 8 : au repos, la caméra est calée à gauche et Kaï doit apparaître à droite du stick
 *  tactile (et du Tir en mode gaucher), même au cran « grand » sur un écran de 320 px de haut. La Comète est
 *  posée sur les colonnes 4 à 7 (start: 'ship') : Kaï en sort, elle repart en orbite. */
const START: Segment = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..............?.',
  '................',
  '................',
  '*....*..P.ccc...',
  '################',
  '################',
];

/** 16 — Rangée de blocs avec le bonus de vitesse (« 1 »), premier pilier (2 lignes). Aucun ennemi : le premier
 *  marcheur attend derrière ce pilier, dans l'enclos 35-40, sans pouvoir venir jusqu'au départ (Kaï immobile ou
 *  lent : LUMA a fini de parler avant de le croiser ; « tuto-stomp » quand il paraît à l'écran). */
const FIRST_BLOCKS: Segment = [
  '......................',
  '......................',
  '......................',
  '......................',
  '............?.........',
  '......................',
  '......................',
  '......................',
  '..........B?1?B.......',
  '......................',
  '.................##...',
  '.................##.*.',
  '######################',
  '######################',
];

/** 38 — Deux piliers de 3 lignes ; un marcheur dans chaque enclos (35-40 : le premier ennemi du niveau, 43-48),
 *  puis un petit trou de 2. */
const PILLARS: Segment = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '...cc......c........',
  '...##......##..cc...',
  '...##......##.c..c..',
  'w..##...w..##.......',
  '###############..###',
  '###############..###',
];

/** 58 — Plateformes traversables, premiers volants, trou avec une plateforme flottante. Point de contrôle 1. */
const ONE_WAY: Segment = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.......cc...............',
  '......====..............',
  '.............f..........',
  '...cc.......cc..........',
  '..====......==..........',
  '.......f................',
  '....................K..*',
  '##########......########',
  '##########......########',
];

/** 82 — Premier danger (acide) avec un saut évident, blocs « ? », marcheur et cracheur. */
const ACID: Segment = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '...........?.?..........',
  '......c.................',
  '.....c.c................',
  '.*...^^^........w..p..*.',
  '########################',
  '########################',
];

/** 106 — Plateforme mobile au-dessus d'un trou de 8. */
const LIFT: Segment = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '.............f....',
  '..................',
  '..................',
  '..................',
  '.....ccc..........',
  '##mmm.....########',
  '##........########',
];

/** 124 — Blindé présenté sur un long plat : de la place pour lui tirer dessus (2 tirs de laser).
 *  Ruine astréenne murée tout en haut (3 cristaux ; 6 glyphes 'G' sur la droite du mur du fond, que la bulle de
 *  LUMA, en haut à gauche, ne cache pas quand elle parle de la ruine ; visible en haut de l'écran depuis le sol,
 *  mais fermée et hors d'atteinte) : on y entre par la porte posée sur le rocher (col. 144, ligne 9, sur une tuile
 *  plate), on ressort par celle de la salle (col. 128, ligne 5). Lignes 0 et 1 vides : le plafond et la flèche ▲ de
 *  la porte de la salle restent sous le HUD (caméra calée en haut de la carte). Le bloc « ? » de dessous laisse la
 *  place de se tenir debout dessus. Ses cristaux étaient sur le 2e pilier et sur le rocher du double saut.
 *  Vortex 'V' dans la salle, à droite des cristaux (colonne 135, ligne 5) : Haut dessus ouvre la faille. */
const ARMORED: Segment = [
  '......................',
  '......................',
  '...BBBBBBBBBBB........',
  '...B...G.G.G.B........',
  '...B....G.G.GB........',
  '...BD.*ccc*V.B........',
  '...BBBBBBBBBBB........',
  '......................',
  '......................',
  '.....?............ccD.',
  '..................####',
  '..............a...####',
  '######################',
  '######################',
];

/** 146 — Point de contrôle 2, bloc de cadence (« 3 »), et un secret de compétence : la cache de 5 cristaux en
 *  hauteur n'est accessible qu'avec le double saut, appris plus tard (depuis le rocher, montée de 6 lignes ;
 *  un saut normal plafonne 1 ligne trop bas). On y revient ensuite : les 3 étoiles restent possibles sans
 *  elle (48 cristaux sur 53, 90 % requis). */
const DOUBLE_JUMP: Segment = [
  '........................',
  '........................',
  '........................',
  '...........ccccc........',
  '..........=======.......',
  '........................',
  '..................f.....',
  '........................',
  '......3.................',
  '........................',
  '...........#####........',
  '..K........#####....w...',
  '########################',
  '########################',
];

/** 170 — Révision : paire de marcheurs, trous, plateforme traversable, volant, cracheur, blindé. */
const REVIEW: Segment = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.......cc............f........',
  '......c..c..........c.c...?...',
  '..................====........',
  '..............................',
  '..w.w.......p..............a..',
  '######...#######.....#########',
  '######...#######.....#########',
];

/** 200 — Grand escalier final (un cristal par marche), paire de marcheurs à écraser en redescendant,
 *  atterrissage à plat et point de contrôle 3, juste avant l'arène. */
const FINALE: Segment = [
  '....................',
  '....................',
  '....................',
  '....................',
  '......cccc..........',
  '.....c####..........',
  '....c#####..........',
  '...c######..........',
  '...#######....f.....',
  '..########..........',
  '.#########..........',
  '##########..w.w..K..',
  '####################',
  '####################',
];

/** 220 — Arène du Blob-roi (bornes 220 et 239, 20 colonnes, sol plat), puis la balise de LUMA (244), qui
 *  remonte Kaï dans la Comète restée en orbite. Les colonnes au-delà laissent la caméra centrer l'arène. */
const ARENA: Segment = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '|............M.....|....L...*...',
  '################################',
  '################################',
];

export const JUNGLE: LevelData = {
  id: 'jungle',
  theme: 'jungle',
  name: stageText('j1').title.fr,
  music: 'jungle',
  map: joinSegments('jungle', [
    START,
    FIRST_BLOCKS,
    PILLARS,
    ONE_WAY,
    ACID,
    LIFT,
    ARMORED,
    DOUBLE_JUMP,
    REVIEW,
    FINALE,
    ARENA,
  ]),
  boss: 'blobKing',
  start: 'ship',
  creature: 'far',
  parTimeS: 240,
  // Tutoriel de LUMA là où il sert (muet une fois j1 réussi), et l'histoire : départ (LUMA brouillée), ruine
  // astréenne (première porte), balise (avant l'escalier final ; arène : 220-239, balise : 244).
  radio: [
    { id: 'j1-start', cols: [0, 12] },
    { id: 'tuto-move', cols: [0, 12] },
    // Premier marcheur, dans l'enclos 35-40 derrière le pilier 33 ; message urgent : il passe devant « tuto-move »
    // quand Kaï court déjà (fenêtre assez tôt pour qu'il arrive avant l'ouverture de « tuto-move »).
    { id: 'tuto-stomp', cols: [16, 24] },
    // Volants et plateformes traversables (58-81), point de contrôle 78.
    { id: 'tuto-aim', cols: [55, 59] },
    { id: 'tuto-drop', cols: [63, 67] },
    { id: 'tuto-checkpoint', on: 'checkpoint' },
    { id: 'tuto-overheat', on: 'overheat' },
    // Blocs « ? » au-dessus de l'acide (93, 95) : ceux du départ se découvrent en sautant, la file y est pleine.
    { id: 'tuto-blocks', cols: [88, 92] },
    // Blindé (138, réveillé vers la colonne 100, il descend jusqu'au bord de l'ascenseur, 116) : à l'atterrissage,
    // avant de le croiser. Porte du rocher (144) vers la ruine.
    { id: 'tuto-armored', cols: [116, 121] },
    { id: 'tuto-door', cols: [139, 143] },
    { id: 'j1-ruin', on: 'door' },
    // Cache du double saut (157-161, ligne 3), au-dessus du point de contrôle 148.
    { id: 'tuto-later', cols: [150, 154] },
    { id: 'j1-beacon', cols: [193, 206] },
    { id: 'j1-boss', on: 'boss' },
  ],
};
