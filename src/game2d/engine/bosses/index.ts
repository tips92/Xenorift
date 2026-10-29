import type { BossId, MusicId, ThemeId } from '../../../core/types';
import { BOSS_ART, buildBossSheet, removeBossSheets } from '../../art/draw/bosses';
import type { BossSheetId } from '../../art/draw/bosses';
import type { PlatformScene } from '../PlatformScene';
import { BeetleTitan } from './beetleTitan';
import { BLOB_KING_MINIONS, BlobKing } from './blobKing';
import type { Boss, BossSpot } from './types';
import { WHALE_WASPS, Whale } from './whale';

// Registre des boss 2D : planches à générer, renforts à créer cachés au chargement, musique du combat, création.

interface BossEntry {
  readonly art: readonly BossSheetId[];
  /** Marcheurs et volants de réserve (EnemyManager), appelés pendant le combat ; hors score. */
  readonly walkers: number;
  readonly flyers: number;
  /** Musique du combat (le gardien : à 3 intensités, une par phase). */
  readonly music: MusicId;
  create(scene: PlatformScene, spot: BossSpot): Boss;
}

const BOSSES: Record<BossId, BossEntry> = {
  blobKing: {
    art: BOSS_ART.blobKing,
    walkers: BLOB_KING_MINIONS,
    flyers: 0,
    music: 'boss',
    create: (scene, spot) => new BlobKing(scene, spot),
  },
  beetleTitan: { art: BOSS_ART.beetleTitan, walkers: 0, flyers: 0, music: 'boss', create: (scene, spot) => new BeetleTitan(scene, spot) },
  whale: { art: BOSS_ART.whale, walkers: 0, flyers: WHALE_WASPS, music: 'guardian', create: (scene, spot) => new Whale(scene, spot) },
};

export function createBoss(id: BossId, scene: PlatformScene, spot: BossSpot): Boss {
  return BOSSES[id].create(scene, spot);
}

export function bossWalkers(id: BossId): number {
  return BOSSES[id].walkers;
}

export function bossFlyers(id: BossId): number {
  return BOSSES[id].flyers;
}

export function bossMusic(id: BossId): MusicId {
  return BOSSES[id].music;
}

/** Textures du boss (canevas : rendues à la restauration du contexte), à générer avant createBoss. */
export function generateBossArt(scene: PlatformScene, id: BossId, theme: ThemeId): void {
  for (const sheet of BOSSES[id].art) buildBossSheet(scene, sheet, theme);
}

/** À l'arrêt de la scène (les textures sont globales : elles survivraient à la session). */
export function destroyBossArt(scene: PlatformScene, id: BossId): void {
  removeBossSheets(scene, BOSSES[id].art);
}
