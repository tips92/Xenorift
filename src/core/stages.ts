import type { CourseId, StageDef } from './types';
import { COURSE_IDS } from './ids.ts';
import { stageSubtitle, stageText } from './story.ts';
import { WORLDS, type WorldDef } from './worlds.ts';

// La campagne : les étapes de WORLDS mises bout à bout (index séquentiel, textes de core/story.ts).
// Lisible par Node : imports de valeurs avec l'extension .ts.

function buildStages(): StageDef[] {
  const out: StageDef[] = [];
  WORLDS.forEach((w, wi) => {
    for (const s of w.stages) {
      const text = stageText(s.id);
      const stage: StageDef = {
        id: s.id,
        index: out.length,
        kind: s.part === 4 ? 'flight' : 'platform',
        world: wi + 1,
        part: s.part,
        title: text.title.fr,
        subtitle: stageSubtitle(wi + 1, s.part),
        hint: text.hint.fr,
        levelId: s.levelId,
        theme: w.theme,
        rewards: s.rewards ?? [],
      };
      if (s.before) stage.before = s.before;
      if (s.after) stage.after = s.after;
      if (s.boss) stage.boss = s.boss;
      out.push(stage);
    }
  });
  return out;
}

export const STAGES: readonly StageDef[] = buildStages();

export function getStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function nextStage(stage: StageDef): StageDef | undefined {
  return STAGES[stage.index + 1];
}

/** Monde d'une étape. */
export function stageWorld(stage: StageDef): WorldDef {
  return WORLDS[stage.world - 1];
}

/** Parcours d'une étape de vol ; null pour une plateforme ou un levelId absent de COURSE_IDS (refusé par check-levels). */
export function stageCourse(stage: StageDef): CourseId | null {
  if (stage.kind !== 'flight') return null;
  const id = COURSE_IDS.find((c) => c === stage.levelId);
  return id ?? null;
}
