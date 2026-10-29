import type { LevelData } from '../types';
import { joinSegments } from '../build.ts';
import type { Segment } from '../build.ts';
import { stageText } from '../../../core/story.ts';

// Monde 1, niveau 2 (j2) — Canopée des spores. Champignons présentés seuls puis au-dessus de trous ; la
// méduse-baleine, proche, agit (ombre, secousse qui abat un tronc, pluie de spores) ; le tronc barre le tunnel :
// on passe par la salle murée au-dessus (portes 126 ↔ 134 et 146 ↔ 148), où Tess attend près de sa capsule ;
// secret de compétence (double saut) au-dessus d'un rocher ; point de contrôle, arène du Scarabée-titan avec 2
// champignons, puis la balise de LUMA. Sol de base : lignes 12-13.
// Colonne absolue du premier caractère de chaque segment en commentaire.

/** 0 — Arrivée par le faisceau de LUMA (start: 'beam') en colonne 8, zone sûre, premier bloc « ? ». */
const START: Segment = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...........?....',
  '................',
  '................',
  '*.......P..ccc..',
  '################',
  '################',
];

/** 16 — Premier champignon (21) : le mur 24-27 ne se franchit qu'en rebondissant ; un marcheur enfermé entre le mur
 *  et le second champignon (33), seul : cristaux à la verticale, le plus haut seulement en tenant Saut à l'impact. */
const MUSHROOMS: Segment = [
  '........................',
  '........................',
  '.................c......',
  '.................c......',
  '.................c......',
  '.........cc.............',
  '........####............',
  '........####............',
  '........####............',
  '........####............',
  '........####............',
  '.....o..####..w..o...w..',
  '########################',
  '########################',
];

/** 40 — L'ombre de la créature passe (fenêtre 44-47) ; branche à cristaux, un volant, un marcheur, point de
 *  contrôle 60. */
const SHADOW: Segment = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '............f...........',
  '........................',
  '.......ccc..............',
  '......=====.............',
  '........................',
  '..c.c...........w...K...',
  '########################',
  '########################',
];

/** 64 — Champignons sur des piliers, au-dessus du vide (71, 76) : de l'un à l'autre, puis la rive (81), gardée par
 *  un volant et deux marcheurs. */
const PITS: Segment = [
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '.........cc...cc....f.......',
  '............................',
  '............................',
  '............................',
  '.......o....o......w.c.c..w.',
  '####...#....#....###########',
  '####...#....#....###########',
];

/** 92 — Sous-bois : blindé, volants, cracheur sur un rocher (104-108). Secret de compétence : la branche 103-108
 *  (ligne 4) et ses 4 cristaux ne s'atteignent qu'en double saut depuis le rocher (montée de 6 lignes). Point de
 *  contrôle 116. */
const CANOPY: Segment = [
  '..........................',
  '..........................',
  '..........................',
  '............cccc..........',
  '...........======.........',
  '..........................',
  '.......f..................',
  '....................f.....',
  '..........................',
  '............c.p.c.........',
  '............#####.........',
  '...w.c.c.a..#####.......K.',
  '##########################',
  '##########################',
];

/**
 * 118 — Secousse (fenêtre 118-120) : le tronc dont la souche est en (128, 11) tombe dans l'entrée du tunnel
 * (131-150, lignes 10-11, sous le rocher 131-150, lignes 2-9) et le bouche ; le rocher est trop haut pour être
 * franchi, même en double saut (montée de 8 lignes depuis le tronc ; saut et double saut : 7,2). On passe par la
 * salle murée creusée dedans : porte du sol (126) ↔ porte de la salle (134), où Tess attend près de sa capsule
 * (143-144) ; la porte voisine de Tess (146) ↔ la porte du tunnel (148), après le tronc. Fenêtre de la secousse
 * loin du tronc (≥ 13 colonnes de l'entrée du tunnel) : il est couché avant que Kaï, même à pleine course avec le
 * bonus de vitesse, ne passe dessous. Bouclier (« 2 ») et point de contrôle 156 à la sortie du tunnel.
 */
const TESS: Segment = [
  '........................................',
  '........................................',
  '.............####################.......',
  '.............####################.......',
  '.............####################.......',
  '.............##....G.G.G.......##.......',
  '.............##................##.......',
  '.............##.D.cccc.....ND..##.......',
  '.............####################...2...',
  '.............####################.......',
  '........................................',
  '........D.................c.c.D....c.cK.',
  '########################################',
  '########################################',
];

/** 158 — Pluie de spores (fenêtre 160-162, pluie 163-179) : cristaux au sol et sur une branche, un bloc « ? », un
 *  volant et deux marcheurs. */
const SPORES: Segment = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........f...............',
  '........................',
  '........................',
  '.....?.....ccc..........',
  '..........=====.........',
  '........................',
  '......c.c......w..c.cw..',
  '########################',
  '########################',
];

/** 182 — Révision : un champignon vers une branche à cristaux (186 → 188-192), blindé, volant, cracheur, marcheur. */
const REVIEW: Segment = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '.......ccc........',
  '......=====.......',
  '..................',
  '............f.....',
  '..................',
  '..................',
  '.cc.o.....a...p.w.',
  '##################',
  '##################',
];

/** 200 — Point de contrôle 201, arène du Scarabée-titan (bornes 206 et 221, 16 colonnes ; titan en 213), puis la
 *  balise de LUMA (228). Un champignon contre chaque barrière (207, 220) : le titan s'y assomme (il s'écrase), et
 *  Kaï, acculé, y rebondit par-dessus la charge ; le milieu reste libre pour courir et tirer (un champignon arrête
 *  les tirs et relance Kaï). 16 colonnes : au téléphone (caméra calée sur l'arène, centrée), le titan assommé contre
 *  un champignon reste hors du stick et de TIR. Les colonnes au-delà laissent la caméra centrer l'arène. */
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
  '.K....|o.....M......o|...cc.L..*',
  '################################',
  '################################',
];

export const JUNGLE2: LevelData = {
  id: 'jungle2',
  theme: 'jungle',
  name: stageText('j2').title,
  music: 'jungle',
  map: joinSegments('jungle2', [START, MUSHROOMS, SHADOW, PITS, CANOPY, TESS, SPORES, REVIEW, ARENA]),
  boss: 'beetleTitan',
  start: 'beam',
  creature: 'near',
  parTimeS: 240,
  events: [
    { kind: 'shadow', cols: [44, 47] },
    { kind: 'quake', cols: [118, 120], trunk: [128, 11] },
    { kind: 'spores', cols: [160, 162], rain: [163, 179] },
  ],
  // Courts autour des champignons : la bulle doit être fermée au sommet des rebonds (check-levels). Sauvetage de
  // Tess (déclencheur 'rescue') : sa réplique, puis LUMA qui la téléporte.
  radio: [
    { id: 'j2-mushroom', cols: [0, 10] },
    { id: 'j2-shadow', cols: [44, 47] },
    { id: 'j2-pits', cols: [54, 57] },
    { id: 'j2-closer', cols: [82, 85] },
    { id: 'j2-signal', cols: [108, 111] },
    { id: 'j2-quake', cols: [118, 120] },
    { id: 'j2-tess', on: 'rescue' },
    { id: 'j2-rescue', on: 'rescue' },
    { id: 'j2-spores', cols: [159, 162] },
    { id: 'j2-titan', cols: [190, 193] },
  ],
};
