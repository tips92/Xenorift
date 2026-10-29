import type { CrewId, SkillId, StagePart } from './types';

// Textes de la campagne (docs/HISTOIRE.md) : titres, sous-titres et conseils des étapes, radio de LUMA, répliques
// des cinématiques. Lisible par Node : données seules, TypeScript effaçable. Radio et répliques : espace insécable
// (NB) avant : ; ! ? (pas de retour à la ligne avant la ponctuation).

const NB = ' ';

export interface StageText {
  /** Titre : cartes, intro, résultats, pause ; aussi LevelData.name du niveau 2D. */
  readonly title: string;
  /** Conseil d'une ligne de la carte d'intro. */
  readonly hint: string;
}

/** Par identifiant d'étape (core/worlds.ts). */
export const STAGE_TEXTS: Readonly<Record<string, StageText>> = {
  j1: { title: 'Lisière de Xéna', hint: 'LUMA te guide : rejoins sa balise !' },
  j2: { title: 'Canopée des spores', hint: 'Rebondis sur les champignons et retrouve Tess !' },
  j3: { title: 'Sanctuaire du gardien', hint: 'Libère la méduse-baleine du Vide !' },
  f1: { title: "Nébuleuse d'Azur", hint: 'Le noyau a ouvert le portail… et quelque chose nous suit.' },
  m1: { title: 'Lune Krator', hint: 'Les crabes blindés ne craignent que tes tirs. Attention aux trous !' },
  f2: { title: "Ceinture d'Orak", hint: 'Champ d’astéroïdes dense : utilise le turbo avec prudence !' },
};

/** Textes d'une étape ; inconnue : son identifiant pour titre. */
export function stageText(id: string): StageText {
  return Object.prototype.hasOwnProperty.call(STAGE_TEXTS, id) ? STAGE_TEXTS[id] : { title: id, hint: '' };
}

/** « Monde 1 · Niveau 2 », « Monde 1 · Vol ». */
export function stageSubtitle(world: number, part: StagePart): string {
  return part === 4 ? `Monde ${world} · Vol` : `Monde ${world} · Niveau ${part}`;
}

/** Nom d'une compétence dans une phrase (« Compétence : double saut »). */
export const SKILL_NAMES: Readonly<Record<SkillId, string>> = {
  doubleJump: 'double saut',
};

// ---------------------------------------------------------------- Qui parle (bulle de story/bubble.ts)

/** Qui parle dans la bulle (portrait dessiné par code, story/portraits.ts). */
export type Speaker = 'luma' | 'tess' | 'kai';

/** Humeur du portrait ; « scrambled » = LUMA brouillée par le Vide (bulle grise, « signal brouillé »). */
export type Mood = 'neutral' | 'amused' | 'worried' | 'scrambled';

/** Une réplique. */
export interface StoryLine {
  readonly speaker: Speaker;
  readonly mood: Mood;
  readonly text: string;
}

// ---------------------------------------------------------------- Radio de LUMA (ui/radio.ts)

/**
 * Message de la radio, déclenché par un niveau (LevelData.radio) ; RadioId = ses clés. `text` nomme les commandes
 * tactiles (stick, SAUT, TIR) ; `keys`, s'il y en a un, le remplace au clavier (commandes tactiles absentes).
 */
export interface RadioMessage extends StoryLine {
  readonly keys?: string;
  /** Tutoriel : se tait une fois TUTORIAL_MARK dans story.seen. */
  readonly tutorial?: boolean;
  /** Passe devant les messages en attente (danger tout proche : à pleine course, la file arriverait trop tard). */
  readonly urgent?: boolean;
  /**
   * Coupe la parole (dialogue lancé par une action de Kaï, calé sur elle : sauvetage) : il remplace aussitôt le
   * message de la bulle, sans trou ; les messages en attente sans ce drapeau sont oubliés, ceux qui l'ont gardent leur
   * ordre.
   */
  readonly interrupt?: boolean;
  /** Parle de ce naufragé avant son sauvetage : se tait une fois qu'il est dans l'équipage (SaveData.crew). */
  readonly castaway?: CrewId;
  /** Radio brouillée par le Vide : bulle grise qui tressaute (humeur « scrambled » à l'affichage). */
  readonly scrambled?: boolean;
}

export const RADIO = {
  // ---- j1, dans l'ordre du niveau (tutoriel : courir et sauter, écraser ou tirer, visée, accroupi et descente,
  // point de contrôle, surchauffe, blocs, blindé, porte, cristaux pour plus tard, boss).
  'j1-start': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: `Le Vide me brouille… Je te guide depuis l’orbite${NB}!`,
  },
  'tuto-move': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Stick pour courir, SAUT pour sauter. Tiens SAUT${NB}: tu montes plus haut.`,
    keys: `← → pour courir, Espace pour sauter. Tiens Espace${NB}: tu montes plus haut.`,
  },
  'tuto-stomp': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    urgent: true,
    text: `Un blob, derrière ce pilier. Saute-lui dessus, ou TIR. Il n’a pas d’avis.`,
    keys: `Un blob, derrière ce pilier. Saute-lui dessus, ou tire avec J. Il n’a pas d’avis.`,
  },
  'tuto-aim': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Des volants. Stick vers le haut ou en diagonale${NB}: ton tir part dans cette direction.`,
    keys: `Des volants. ↑, ou ↑ avec ← →${NB}: ton tir part en haut ou en diagonale.`,
  },
  'tuto-drop': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Stick vers le bas${NB}: tu t’accroupis. Bas et SAUT sur ces plateformes${NB}: tu passes au travers.`,
    keys: `↓ pour t’accroupir. ↓ et Espace sur ces plateformes${NB}: tu passes au travers.`,
  },
  'tuto-checkpoint': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    text: `Point de contrôle. Si tu tombes, tu repars d’ici. Je préfère ne pas vérifier.`,
  },
  'tuto-overheat': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Surchauffe${NB}! Ton arme se bloque le temps de refroidir${NB}: tire plutôt par petites rafales.`,
  },
  'tuto-blocks': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Ces blocs lumineux se frappent de la tête, par en dessous. Cristaux dedans, parfois mieux.`,
  },
  'tuto-armored': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Un blindé. Lui sauter dessus ne sert à rien${NB}: deux tirs, et il comprendra.`,
  },
  'tuto-door': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    text: `Une porte astréenne, sur ce rocher${NB}! Devant elle, stick vers le haut pour entrer.`,
    keys: `Une porte astréenne, sur ce rocher${NB}! Devant elle, ↑ pour entrer.`,
  },
  // Dans la ruine (première porte franchie) : les Astréens, sans rien dire d'Éon.
  'j1-ruin': {
    speaker: 'luma',
    mood: 'amused',
    text: `Une ruine astréenne${NB}! Ce peuple a bâti les portails, puis il a disparu. Où${NB}? Mes archives sont muettes.`,
  },
  'tuto-later': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Ceux-là sont trop hauts, pour l’instant. Ramasse les autres${NB}: au hangar, ils paient tes améliorations.`,
  },
  'j1-beacon': {
    speaker: 'luma',
    mood: 'amused',
    text: `Je capte enfin ta position${NB}! Ma balise est droit devant, au bout de cette clairière.`,
  },
  'j1-boss': {
    speaker: 'luma',
    mood: 'worried',
    tutorial: true,
    text: `Un Blob-roi garde ma balise${NB}! Sa gelée arrête tes tirs${NB}: saute ses ondes et vise le noyau quand il s’aplatit.`,
  },
  // ---- j2, dans l'ordre du niveau : champignons, la méduse-baleine qui agit (ombre, secousse, spores), Tess. Pas
  // de `tutorial` : j1 réussi les ferait taire, or on n'arrive ici qu'après. Courts autour des champignons : la
  // bulle doit être fermée au sommet des rebonds (check-levels).
  'j2-mushroom': {
    speaker: 'luma',
    mood: 'amused',
    text: `Champignon${NB}! Tiens SAUT à l’impact${NB}: plus haut.`,
    keys: `Champignon${NB}! Tiens Espace à l’impact${NB}: plus haut.`,
  },
  'j2-shadow': {
    speaker: 'luma',
    mood: 'worried',
    text: `Cette ombre… C’est la méduse-baleine. Le Vide la rend nerveuse.`,
  },
  'j2-pits': {
    speaker: 'luma',
    mood: 'neutral',
    text: `Au-dessus du vide${NB}: rebondis d’un champignon à l’autre${NB}!`,
  },
  'j2-closer': {
    speaker: 'luma',
    mood: 'amused',
    text: `Cette méduse grossit à vue d’œil. Ou alors on s’approche. Je préfère la première option.`,
  },
  'j2-signal': {
    speaker: 'luma',
    mood: 'worried',
    castaway: 'tess',
    text: `Un signal de détresse, tout près… Quelqu’un d’autre s’est écrasé ici${NB}!`,
  },
  'j2-quake': {
    speaker: 'luma',
    mood: 'worried',
    urgent: true,
    text: `La forêt tremble${NB}! Le tronc bouche le tunnel… Passe par la porte${NB}: stick vers le haut.`,
    keys: `La forêt tremble${NB}! Le tronc bouche le tunnel… Passe par la porte${NB}: ↑ devant elle.`,
  },
  // Sauvetage (déclencheur 'rescue') : Tess, puis LUMA qui la téléporte à bord ; ils coupent la parole (engine/npc.ts
  // cale la dissolution sur ces deux répliques : finie juste après « … à bord ! »).
  'j2-tess': {
    speaker: 'tess',
    mood: 'amused',
    interrupt: true,
    text: `Enfin quelqu’un${NB}! Je suis Tess. Ma capsule est en miettes…`,
  },
  'j2-rescue': {
    speaker: 'luma',
    mood: 'amused',
    interrupt: true,
    text: `Ne bouge plus, Tess${NB}: je te téléporte à bord${NB}!`,
  },
  'j2-spores': {
    speaker: 'luma',
    mood: 'worried',
    urgent: true,
    text: `Des spores tombent${NB}! Une tache au sol annonce chacune${NB}: écarte-toi, ou abats-les au TIR.`,
    keys: `Des spores tombent${NB}! Une tache au sol annonce chacune${NB}: écarte-toi, ou abats-les avec J.`,
  },
  // Avant l'arène (pas au déclencheur 'boss') : la bulle doit être fermée quand Kaï rebondit sur son champignon 205.
  'j2-titan': {
    speaker: 'luma',
    mood: 'worried',
    text: `Un Scarabée-titan garde ma balise${NB}! Renversé, frappe-le${NB}!`,
  },
  // ---- j3, dans l'ordre du niveau : près de la gardienne, le Vide brouille la radio de bout en bout (bulle grise qui
  // tressaute). Courts : la bulle doit être fermée avant chaque champignon, dont celui de l'entrée de l'arène.
  'j3-start': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: `…Kaï${NB}? Le Vide brouille tout, ici… Là-haut, la gardienne. Toute grise.`,
  },
  'j3-pits': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: `Champignons… au-dessus du vide. Tiens SAUT${NB}!`,
    keys: `Champignons… au-dessus du vide. Tiens Espace${NB}!`,
  },
  'j3-spores': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    urgent: true,
    text: `…des spores${NB}! Les taches au sol… écarte-toi${NB}!`,
  },
  'j3-signal': {
    speaker: 'luma',
    mood: 'amused',
    scrambled: true,
    text: `Signal… trop faible. Si tu m’entends${NB}: ne meurs pas. C’est un ordre.`,
  },
  'j3-heart': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: `Brouillage… Vise son cœur quand il s’ouvre${NB}!`,
  },
} as const satisfies Record<string, RadioMessage>;

/** Marque de story.seen posée à la réussite de TUTORIAL_STAGE : les messages `tutorial` se taisent ensuite. */
export const TUTORIAL_MARK = 'tutorial-j1';
export const TUTORIAL_STAGE = 'j1';

// ---------------------------------------------------------------- Rythme de la bulle et de la radio
// Partagé par story/bubble.ts, ui/radio.ts et scripts/check-levels.ts (file de la radio simulée).

/** Lettres écrites par seconde dans la bulle. */
export const BUBBLE_CPS = 32;
/** Pauses après la ponctuation (s) : . ! ? … puis , ; : */
const STOP_PAUSE_S = 0.22;
const COMMA_PAUSE_S = 0.09;

/** Délai après le caractère de code `c` avant le suivant (s). */
export function letterGap(c: number, cps = BUBBLE_CPS): number {
  const base = 1 / cps;
  // . ! ? …
  if (c === 46 || c === 33 || c === 63 || c === 8230) return base + STOP_PAUSE_S;
  // , ; :
  if (c === 44 || c === 59 || c === 58) return base + COMMA_PAUSE_S;
  return base;
}

/** Durée d'écriture d'une réplique (s), pour caler une chronologie. */
export function typingDuration(text: string, cps = BUBBLE_CPS): number {
  let d = 0;
  for (let i = 0; i < text.length - 1; i++) d += letterGap(text.charCodeAt(i), cps);
  return d;
}

/**
 * Radio en jeu (s) : ouverture (radioOpen) avant la première lettre ; lecture après la dernière lettre, selon la
 * longueur et bornée, réduite à holdBusyS si un message attend ; bulle cachée avant le suivant ; messages en
 * attente au plus (un nouveau chasse le plus ancien).
 */
export const RADIO_TIMING = {
  openS: 0.3,
  holdPerCharS: 0.045,
  holdMinS: 2.2,
  holdMaxS: 5,
  holdBusyS: 1.2,
  gapS: 0.35,
  maxWaiting: 2,
} as const;

/** Lecture d'un message après sa dernière lettre, sans message en attente (s). */
export function radioHoldS(text: string): number {
  const t = RADIO_TIMING;
  return Math.min(t.holdMaxS, Math.max(t.holdMinS, text.length * t.holdPerCharS));
}

// ---------------------------------------------------------------- Cinématiques (story/scenes)

function luma(mood: Mood, text: string): StoryLine {
  return { speaker: 'luma', mood, text };
}

export const PROLOGUE_LINES = {
  signal: luma('neutral', 'Kaï, je capte un signal au bord de la galaxie. Inconnu. Très ancien.'),
  kai: { speaker: 'kai', mood: 'neutral', text: 'On va voir.' },
  decision: luma('amused', `Évidemment. Je note${NB}: décision prise sans consulter l’ordinateur de bord.`),
  rift: luma('worried', `Ce n’est pas un signal, ça… C’est une faille${NB}! Elle nous aspire${NB}!`),
  worlds: luma('worried', 'Ces mondes s’éteignent un à un… Une ombre grise les ronge. Appelons-la le Vide.'),
  alive: luma('amused', `Bonne nouvelle${NB}: on est vivants. Mauvaise nouvelle${NB}: il me faut de l’énergie pour ouvrir un portail.`),
  guardian: luma('neutral', `Tu vois la méduse-baleine${NB}? C’est la gardienne de ce monde. Le Vide l’a rendue folle.`),
  goal: luma('neutral', `Libère-la et rapporte son noyau${NB}: il ouvrira le portail.`),
  onFoot: luma('scrambled', `Près d’elle, le Vide me brouille… Impossible de me poser plus près${NB}: tu continues à pied${NB}!`),
} as const satisfies Record<string, StoryLine>;

export const LIBERATION_LINES = {
  skill: luma('amused', `Nouvelle compétence installée. Essaie de ne pas t’en servir pour sauter dans un trou.`),
} as const satisfies Record<string, StoryLine>;

/** Bandeaux de la libération (dessinés sur le canvas ; le nom et la compétence viennent de LiberationParams). */
export const LIBERATION_BANNERS = {
  guardian: 'GARDIEN LIBÉRÉ',
  skill: 'NOUVELLE COMPÉTENCE',
} as const;
