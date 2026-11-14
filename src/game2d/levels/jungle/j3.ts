import type { LevelData } from '../types';
import { joinSegments } from '../build.ts';
import type { Segment } from '../build.ts';
import { stageText } from '../../../core/story.ts';

// Monde 1, niveau 3 (j3) — Sanctuaire du gardien. Plus exigeant que j2 : ennemis plus nombreux, champignons
// au-dessus du vide, branches en hauteur au-dessus d'un grand trou, pluie de spores. La méduse-baleine, toute
// grise, domine le décor ('looming') ; près d'elle, la radio de LUMA est brouillée. Un seul point de contrôle, juste
// avant l'arène de la gardienne. Pas de sortie : sa défaite termine le niveau (ending: 'guardian').
// Sol de base : lignes 12-13. Colonne absolue du premier caractère de chaque segment en commentaire.

/** 0 — Arrivée par le faisceau de LUMA (start: 'beam') en colonne 8, zone sûre. */
const START: Segment = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..........c.....',
  '................',
  '*.......P..c.c..',
  '################',
  '################',
];

/** 16 — Sous-bois : blocs « ? », trou de 3 (24-26), marcheurs, cracheur sur un rocher (35-36) sous deux volants ;
 *  aucun ennemi ne peut venir jusqu'au départ (le trou les arrête). Volants aux lignes 7-8 : plus bas que la bulle de
 *  LUMA (fenêtre 34-37), qui ne les cache pas. */
const GROVE: Segment = [
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '......................f...',
  '..?.?...........f.........',
  '........ccc.........p.....',
  '...................##.....',
  '.............w.....##.c.wc',
  '########...###############',
  '########...###############',
];

/** 42 — Champignons au-dessus du vide : 49 et 59 sur des piliers, 54 plus haut ; rive à partir de 64. Aucun volant
 *  au-dessus : un coup en l'air jetterait Kaï dans un trou. Rebord de la rive (64) : le marcheur de la rive y fait
 *  demi-tour, et le recul d'un coup reçu sur la rive s'y arrête (montée de 52 px, rebord de 64). */
const PITS: Segment = [
  '............................',
  '............................',
  '............................',
  '............................',
  '.........cc.................',
  '.....c.........cc...........',
  '............................',
  '............................',
  '............................',
  '............o...............',
  '............#...............',
  '.......o....#....o....#..c.c',
  '####...#....#....#....######',
  '####...#....#....#....######',
];

/** 70 — Branches en hauteur, toutes en ligne 6, au-dessus d'un grand trou (75-99) : le champignon 73 lance Kaï sur
 *  la première (76-81), puis 85-90 et 94-98. Les deux dernières ont chacune un marcheur, qu'un tir droit devant
 *  abat depuis la branche précédente (même hauteur) ; un volant au-dessus du second écart (à viser en diagonale). On
 *  redescend sur la rive (100). Un marcheur patrouille la rive 65-72. */
const HIGH: Segment = [
  '................................',
  '................................',
  '................................',
  '.............c..........f.......',
  '........cc.......cc.........c...',
  '.................w........w.....',
  '......======...======...=====...',
  '................................',
  '................................',
  '................................',
  '................................',
  'w..o............................',
  '#####.........................##',
  '#####.........................##',
];

/** 102 — Pluie de spores (fenêtre 102-104, pluie 105-127) sur un long sol gardé par trois marcheurs, un blindé, un
 *  volant et un cracheur sur un rocher (124-125). On redescend des branches sur 100-102, sans ennemi : le rocher bas
 *  103-104 y arrête les marcheurs, le volant (108) n'y passe pas. */
const SPORES: Segment = [
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '......f....?................',
  '......................cp....',
  '......................##....',
  '.##wc.c..w....c.c...a.##..w.',
  '############################',
  '############################',
];

/** 130 — Rocher du cracheur (138-142), volants, blindé ; la marche 151 arrête marcheur et blindé avant l'approche.
 *  Secret de compétence : la branche 138-143 (ligne 4) et ses 4 cristaux ne s'atteignent qu'en double saut depuis le
 *  rocher (montée de 6 lignes), comme en j2. Volants en ligne 8 : écrasés, ils ne relancent pas Kaï jusqu'à la branche
 *  (rebond ≈ 3 tuiles), et passent plus bas que la bulle de LUMA (fenêtres 130-133 et 147-150). */
const ROCKS: Segment = [
  '......................',
  '......................',
  '......................',
  '.........cccc.........',
  '........======........',
  '......................',
  '......................',
  '......................',
  '.?...f...........f....',
  '..........p...........',
  '........#####.........',
  '..w.....#####.a..c.cw#',
  '######################',
  '######################',
];

/** 152 — Approche, calme : le seul point de contrôle du niveau (159), juste avant l'arène. */
const APPROACH: Segment = [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..c.c.c...',
  '..........',
  '.......K..',
  '##########',
  '##########',
];

/** 162 — Arène de la méduse-baleine (bornes 162 et 179, 18 colonnes : au téléphone, ses bords restent hors des
 *  commandes ; 'M' en 170) : 3 passerelles '=' à 3 tuiles du sol (de là, un tir droit devant atteint le cœur au plus
 *  bas) avec un cristal au-dessus de chacune, et 2 champignons (165, 176). La gardienne plane au-dessus de l'arène ;
 *  'M' ne donne que sa colonne de départ. */
const ARENA: Segment = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '.....c..c...c.....',
  '..................',
  '.....==.==.==.....',
  '..................',
  '|..o....M.....o..|',
  '##################',
  '##################',
];

/** 180 — Bout de la carte : la caméra peut centrer l'arène sur les écrans larges (jusqu'à ≈ 2,6:1). */
const END: Segment = [
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '...*..',
  '######',
  '######',
];

export const JUNGLE3: LevelData = {
  id: 'jungle3',
  theme: 'jungle',
  name: stageText('j3').title.fr,
  music: 'jungle',
  map: joinSegments('jungle3', [START, GROVE, PITS, HIGH, SPORES, ROCKS, APPROACH, ARENA, END]),
  ending: 'guardian',
  boss: 'whale',
  start: 'beam',
  creature: 'looming',
  parTimeS: 240,
  events: [{ kind: 'spores', cols: [102, 104], rain: [105, 127] }],
  // Radio brouillée de bout en bout ; bulle fermée avant chaque champignon (check-levels), y compris celui de
  // l'arène (165) : le conseil sur le cœur s'ouvre bien avant le point de contrôle.
  radio: [
    { id: 'j3-start', cols: [0, 10] },
    { id: 'j3-pits', cols: [34, 37] },
    { id: 'j3-spores', cols: [102, 104] },
    { id: 'j3-signal', cols: [130, 133] },
    { id: 'j3-heart', cols: [147, 150] },
  ],
};
