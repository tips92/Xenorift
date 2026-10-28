import type { BossId, ThemeId } from '../../../core/types';
import { BOSS_ART, buildBossSheet, removeBossSheets } from '../../art/draw/bosses';
import type { BossSheetId } from '../../art/draw/bosses';
import type { PlatformScene } from '../PlatformScene';
import { BLOB_KING_MINIONS, BlobKing } from './blobKing';
import type { Boss, BossSpot } from './types';

// Registre des boss 2D : planches à générer, renforts à créer cachés au chargement, création.

interface BossEntry {
  readonly art: readonly BossSheetId[];
  /** Marcheurs de réserve (EnemyManager), appelés pendant le combat ; hors score. */
  readonly walkers: number;
  create(scene: PlatformScene, spot: BossSpot): Boss;
}

const BOSSES: Record<BossId, BossEntry> = {
  blobKing: { art: BOSS_ART.blobKing, walkers: BLOB_KING_MINIONS, create: (scene, spot) => new BlobKing(scene, spot) },
};

export function createBoss(id: BossId, scene: PlatformScene, spot: BossSpot): Boss {
  return BOSSES[id].create(scene, spot);
}

export function bossWalkers(id: BossId): number {
  return BOSSES[id].walkers;
}

/** Textures du boss (canevas : rendues à la restauration du contexte), à générer avant createBoss. */
export function generateBossArt(scene: PlatformScene, id: BossId, theme: ThemeId): void {
  for (const sheet of BOSSES[id].art) buildBossSheet(scene, sheet, theme);
}

/** À l'arrêt de la scène (les textures sont globales : elles survivraient à la session). */
export function destroyBossArt(scene: PlatformScene, id: BossId): void {
  removeBossSheets(scene, BOSSES[id].art);
}
