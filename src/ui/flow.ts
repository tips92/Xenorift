import { STORY_LEVEL } from '../audio/world1Tracks';
import { STAGES, nextStage, stageWorld } from '../core/stages';
import { CUTSCENES, SKILL_NAMES, cutsceneMark } from '../core/story';
import type { CutsceneId, StageDef } from '../core/types';
import type { LiberationParams } from '../story/types';

// Décisions pures de l'enchaînement des étapes (docs/plans/04-monde-1.md, point 6). Les fondus, navigate et
// flowId restent dans App.ts ; la progression (étape de JOUER, verrous) dans core/save.ts.

/** Étape proposée après `stage` (hangar puis sa carte d'intro) ; null après la dernière : fin de la démo. */
export function stageAfter(stage: StageDef): StageDef | null {
  return nextStage(stage) ?? null;
}

/** Libellé du bouton de départ du hangar vers `next` : on atterrit au niveau 1, on y redescend ensuite, on décolle pour le vol. */
export function departLabel(next: StageDef): string {
  if (next.part === 4) return 'Décoller';
  return next.part === 1 ? 'Atterrir' : 'Redescendre';
}

/** Ligne sous JOUER : « Nouvelle aventure » sur une sauvegarde neuve, sinon l'étape reprise. */
export function playSubtitle(fresh: boolean, next: StageDef): string {
  return fresh ? 'Nouvelle aventure' : `Continuer · ${next.title}`;
}

// ---------------------------------------------------------------- Cinématiques (choix 14)

/** Une cinématique à jouer pour une étape. */
export interface StoryPlay {
  readonly id: CutsceneId;
  /** Marque de story.seen, posée à la fin ou au Passer (core/story.ts : cutsceneMark). */
  readonly mark: string;
  /** Libération : gardien et compétence du monde de l'étape. */
  readonly params?: LiberationParams;
  /** Titre et sous-titre (Options › Revoir les cinématiques). */
  readonly title: string;
  readonly sub: string;
}

function storyPlay(id: CutsceneId, stage: StageDef): StoryPlay {
  const w = stageWorld(stage);
  const play: { -readonly [K in keyof StoryPlay]: StoryPlay[K] } = {
    id,
    mark: cutsceneMark(id, stage.world),
    title: CUTSCENES[id].title,
    sub: `Monde ${stage.world} · ${id === 'liberation' ? w.guardian.name : w.name}`,
  };
  if (id === 'liberation') {
    const skill = w.guardian.skill;
    play.params = {
      world: stage.world,
      guardianName: w.guardian.name,
      skillLabel: skill ? SKILL_NAMES[skill].toLocaleUpperCase('fr-FR') : '',
    };
  }
  return play;
}

/**
 * Cinématiques à jouer avant la carte d'intro de `stage` (lancement par JOUER, une carte des Niveaux ou le hangar ;
 * jamais par ?stage=, REJOUER ni Réessayer, qui n'ont pas de carte d'intro) : les `before` pas encore vus des étapes
 * jusqu'à `stage` comprise, dans l'ordre de la campagne. Le prologue (avant j1) passe donc avant la première étape
 * lancée, quelle qu'elle soit (anciens joueurs compris).
 */
export function cutscenesBefore(stage: StageDef, seen: readonly string[]): StoryPlay[] {
  const out: StoryPlay[] = [];
  for (const s of STAGES) {
    if (s.index > stage.index) break;
    if (!s.before) continue;
    const play = storyPlay(s.before, s);
    if (!seen.includes(play.mark) && !out.some((p) => p.mark === play.mark)) out.push(play);
  }
  return out;
}

/** Cinématique à jouer après une victoire sur `stage`, avant ses résultats (?stage= compris) : son `after`, pas vu. */
export function cutsceneAfter(stage: StageDef, seen: readonly string[]): StoryPlay | null {
  if (!stage.after) return null;
  const play = storyPlay(stage.after, stage);
  return seen.includes(play.mark) ? null : play;
}

/** Cinématiques déjà vues, dans l'ordre de la campagne (Options › Revoir les cinématiques). */
export function seenCutscenes(seen: readonly string[]): StoryPlay[] {
  const out: StoryPlay[] = [];
  for (const s of STAGES) {
    for (const id of [s.before, s.after]) {
      if (!id) continue;
      const play = storyPlay(id, s);
      if (seen.includes(play.mark) && !out.some((p) => p.mark === play.mark)) out.push(play);
    }
  }
  return out;
}

/** Intensité de la musique 'story' : la libération joue tout de suite la partie lumineuse, le reste le récit. */
export function storyMusicLevel(id: CutsceneId): number {
  return id === 'liberation' ? STORY_LEVEL.light : STORY_LEVEL.tale;
}
