// Listes d'identifiants disponibles à l'exécution ; les unions ThemeId, CourseId et MusicId (types.ts) en
// découlent. Lu aussi par Node (scripts/check-levels.ts) : données seules, TypeScript effaçable.

/** Thèmes des niveaux 2D (palette, dessins, décor). */
export const THEME_IDS = ['jungle', 'moon'] as const;

/** Parcours de vol (game3d/courses.ts). */
export const COURSE_IDS = ['nebula', 'asteroids'] as const;

/**
 * Musiques (audio/tracks.ts) : un vol joue celle qui porte le nom de son parcours. Monde 1 (audio/world1Tracks.ts) :
 * mini-boss, gardien (3 intensités) et cinématiques (2 intensités).
 */
export const MUSIC_IDS = ['menu', 'jungle', 'moon', 'nebula', 'asteroids', 'boss', 'guardian', 'story'] as const;

/** Boss des arènes 2D (game2d/engine/bosses : createBoss), case 'M' d'un niveau (LevelData.boss) ; 'whale' : la
 *  méduse-baleine, gardienne du monde 1. */
export const BOSS_IDS = ['blobKing', 'beetleTitan', 'whale'] as const;

/**
 * Cinématiques (src/story) : étapes de WORLDS qui en jouent une avant leur carte d'intro (`before`) ou avant leurs
 * résultats (`after`) ; marques « vues » dans SaveData.story.seen (core/story.ts : cutsceneMark).
 * `rift` : écho du Vide, vision courte avant de retenter une faille (pas une étape de WORLDS).
 */
export const CUTSCENE_IDS = ['prologue', 'liberation', 'rift'] as const;
