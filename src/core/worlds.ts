import type { BossId, CrewId, CutsceneId, SkillId, StagePart, StageReward, ThemeId, WeaponId } from './types';

// Table des mondes (docs/plans/04-monde-1.md, point 1) : par monde, son gardien, son naufragé, le boss de son vol
// et ses étapes dans l'ordre de la campagne. core/stages.ts en tire STAGES ; les textes sont dans core/story.ts.
// Lisible par Node : données seules, TypeScript effaçable.

/** Une étape dans la table des mondes. */
export interface WorldStage {
  /** Identifiant stable, clé de SaveData.best : ne jamais le renommer. */
  readonly id: string;
  readonly part: StagePart;
  /** Niveau 2D (registre de game2d/levels) ou parcours de vol (CourseId). */
  readonly levelId: string;
  /** Cinématiques avant la carte d'intro et avant les résultats (StageDef.before / after). */
  readonly before?: CutsceneId;
  readonly after?: CutsceneId;
  /** Données à la réussite, réappliquées au chargement (core/save.ts). */
  readonly rewards?: readonly StageReward[];
  /** Boss de l'arène du niveau 2D : le même que LevelData.boss (vérifié par check-levels). */
  readonly boss?: BossId;
}

export interface WorldDef {
  readonly name: string;
  readonly theme: ThemeId;
  /** Gardien (boss du niveau 3) : son noyau ouvre le portail du vol ; sa compétence (null : pas encore codée). */
  readonly guardian: { readonly name: string; readonly core: string; readonly skill: SkillId | null };
  /** Naufragé secouru au niveau 2 (null : pas encore dans CrewId). */
  readonly castaway: CrewId | null;
  /** Boss du vol et plan d'arme qu'il laisse. */
  readonly flightBoss: { readonly name: string; readonly blueprint: Exclude<WeaponId, 'laser'> | null };
  readonly stages: readonly WorldStage[];
}

/** Mondes dans l'ordre de la campagne (Monde 1 = WORLDS[0]). Ajouter une étape ici l'ajoute partout. */
export const WORLDS: readonly WorldDef[] = [
  {
    name: 'Jungle de Xéna',
    theme: 'jungle',
    guardian: { name: 'Méduse-baleine', core: 'Noyau de Xéna', skill: 'doubleJump' },
    castaway: 'tess',
    flightBoss: { name: 'Léviathan de la nébuleuse', blueprint: 'machinegun' },
    stages: [
      { id: 'j1', part: 1, levelId: 'jungle', boss: 'blobKing', before: 'prologue' },
      { id: 'j2', part: 2, levelId: 'jungle2', boss: 'beetleTitan', rewards: [{ kind: 'crew', id: 'tess' }] },
      {
        id: 'j3',
        part: 3,
        levelId: 'jungle3',
        boss: 'whale',
        after: 'liberation',
        rewards: [{ kind: 'skill', id: 'doubleJump' }],
      },
      { id: 'f1', part: 4, levelId: 'nebula', rewards: [{ kind: 'blueprint', id: 'machinegun' }] },
    ],
  },
  {
    name: 'Lune Krator',
    theme: 'moon',
    // Glissade et Ozzo (cartographe) : monde 2 au nouveau format (étape 5).
    guardian: { name: 'Ver des sables', core: 'Noyau de Krator', skill: null },
    castaway: null,
    flightBoss: { name: 'Ver cosmique', blueprint: 'shotgun' },
    stages: [
      { id: 'm1', part: 1, levelId: 'moon' },
      { id: 'f2', part: 4, levelId: 'asteroids' },
    ],
  },
];
