import type { LevelData } from './types';
import { joinSegments } from './build.ts';
import type { Segment } from './build.ts';
import { stageText } from '../../core/story.ts';

// Monde 1 — Jungle de Xéna : niveau d'apprentissage, à la manière d'un « 1-1 ».
// Chaque mécanique est présentée seule, sans danger, puis combinée. Sol de base : lignes 12-13.
// Repères de colonnes en commentaire (colonne absolue du premier caractère du segment).

/** 0 — Départ : zone sûre, premiers cristaux à ramasser en marchant, premier bloc « ? ».
 *  Départ en colonne 8 : au repos, la caméra est calée à gauche et Kaï doit apparaître à droite du stick
 *  tactile (et du Tir en mode gaucher), même au cran « grand » sur un écran de 320 px de haut. */
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

/** 16 — Premier marcheur seul sur du plat, rangée de blocs avec le bonus de vitesse (« 1 »), premier pilier. */
const FIRST_WALKER: Segment = [
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
  '......w..........##.*.',
  '######################',
  '######################',
];

/** 38 — Piliers (2 et 3 lignes) avec un marcheur entre chaque, puis un petit trou de 2. */
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
 *  Salle secrète murée tout en haut (ruine astréenne, 3 cristaux ; visible en haut de l'écran depuis le sol,
 *  mais fermée et hors d'atteinte) : on y entre par la porte posée sur le rocher (col. 144, ligne 9, sur une
 *  tuile plate), on ressort par celle de la salle (col. 128, ligne 5). Lignes 0 et 1 vides : le plafond et la
 *  flèche ▲ de la porte de la salle restent sous le HUD (caméra calée en haut de la carte). Le bloc « ? » de
 *  dessous laisse la place de se tenir debout dessus. Ses cristaux étaient sur le 2e pilier et sur le rocher
 *  du double saut. */
const ARMORED: Segment = [
  '......................',
  '......................',
  '...BBBBBBBBBBB........',
  '...B.........B........',
  '...B.........B........',
  '...BD.*ccc*..B........',
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
  name: stageText('j1').title,
  music: 'jungle',
  map: joinSegments('jungle', [
    START,
    FIRST_WALKER,
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
  // Départ (LUMA brouillée), sous la ruine astréenne (salle murée 127-137), avant l'escalier final (arène : 220-239,
  // balise : 244), à l'entrée dans l'arène.
  radio: [
    { id: 'j1-start', cols: [0, 12] },
    { id: 'j1-ruin', cols: [127, 137] },
    { id: 'j1-beacon', cols: [193, 206] },
    { id: 'tuto-overheat', on: 'overheat' },
    { id: 'j1-boss', on: 'boss' },
  ],
};
