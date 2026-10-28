import type { SkillId, StagePart } from './types';

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

/** Par identifiant d'étape (core/worlds.ts). j2 et j3 : prévus pour 4b. */
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

/** Message de la radio, déclenché par un niveau (LevelData.radio) ; RadioId = ses clés. */
export interface RadioMessage extends StoryLine {
  /** Tutoriel : se tait une fois TUTORIAL_MARK dans story.seen. */
  readonly tutorial?: boolean;
  /** Radio brouillée par le Vide : bulle grise qui tressaute (humeur « scrambled » à l'affichage). */
  readonly scrambled?: boolean;
}

export const RADIO = {
  'j1-start': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: `Kaï, tu me reçois${NB}? Le Vide brouille ma radio… Je te guide de loin${NB}: file droit devant${NB}!`,
  },
  'j1-ruin': {
    speaker: 'luma',
    mood: 'amused',
    text: `Des ruines astréennes, juste au-dessus${NB}! Ce peuple a bâti les portails. Trouve un moyen d’y entrer.`,
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
  'tuto-overheat': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: `Surchauffe${NB}! Ton arme se bloque le temps de refroidir${NB}: tire plutôt par petites rafales.`,
  },
} as const satisfies Record<string, RadioMessage>;

/** Marque de story.seen posée à la réussite de TUTORIAL_STAGE : les messages `tutorial` se taisent ensuite. */
export const TUTORIAL_MARK = 'tutorial-j1';
export const TUTORIAL_STAGE = 'j1';

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
