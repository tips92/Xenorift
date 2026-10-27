import type { StageDef } from './types';

/** La campagne de la démo : 2 niveaux de plateforme, chacun suivi d'un vol spatial. */
export const STAGES: readonly StageDef[] = [
  {
    id: 'j1',
    index: 0,
    kind: 'platform',
    world: 1,
    title: 'Jungle de Xéna',
    subtitle: 'Monde 1 — Planète Xéna',
    hint: 'Saute sur les ennemis ou tire au laser, puis rejoins ton vaisseau !',
    levelId: 'jungle',
    theme: 'jungle',
  },
  {
    id: 'f1',
    index: 1,
    kind: 'flight',
    world: 1,
    title: "Nébuleuse d'Azur",
    subtitle: 'Vol 1 — Cap sur la lune Krator',
    hint: 'Traverse les portails et évite les astéroïdes !',
    levelId: 'nebula',
    theme: 'jungle',
  },
  {
    id: 'm1',
    index: 2,
    kind: 'platform',
    world: 2,
    title: 'Lune Krator',
    subtitle: 'Monde 2 — Lune de cristal',
    hint: 'Les crabes blindés ne craignent que le laser. Attention aux trous !',
    levelId: 'moon',
    theme: 'moon',
  },
  {
    id: 'f2',
    index: 3,
    kind: 'flight',
    world: 2,
    title: "Ceinture d'Orak",
    subtitle: 'Vol 2 — Le grand saut',
    hint: 'Champ d’astéroïdes dense : utilise le turbo avec prudence !',
    levelId: 'asteroids',
    theme: 'moon',
  },
];

export function getStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function nextStage(stage: StageDef): StageDef | undefined {
  return STAGES[stage.index + 1];
}
