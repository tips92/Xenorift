// Failles du Vide : mini-niveaux bonus, une par monde. Pas une étape de campagne (STAGES, JOUER, étoiles
// inchangés). Seule une faille `placed` a un vortex dans un niveau jouable. Les autres sont des emplacements
// (monde, partie 1 ou 3, étape hôte si elle existe déjà) pour les mondes à venir. Lisible par Node.

export const RIFT_IDS = ['xena', 'krator', 'borea', 'vulkar', 'heart'] as const;

export type RiftId = (typeof RIFT_IDS)[number];

export interface RiftDef {
  readonly id: RiftId;
  /** Monde 1..5. */
  readonly world: number;
  /** Étape 2D qui porte le vortex, si cette étape existe. Jamais un id renommé. */
  readonly stageId: string | null;
  /** Niveau 1 ou 3 du monde : là où la faille se pose. */
  readonly part: 1 | 3;
  /** Vortex vraiment dans un niveau. Les autres mondes restent des données. */
  readonly placed: boolean;
  readonly waves: number;
  readonly title: string;
  /** Message de LUMA à l'approche du vortex (clé de RADIO). */
  readonly radio: 'rift-j1' | null;
}

/**
 * Une zone de vide par monde. Monde 1 : salle aux cristaux de j1. La Lune (ancien format) et les mondes
 * suivants : emplacement seulement, sans vortex tant que leur niveau n'existe pas au nouveau format.
 */
export const RIFTS: readonly RiftDef[] = [
  { id: 'xena', world: 1, stageId: 'j1', part: 1, placed: true, waves: 3, title: 'Faille de Xéna', radio: 'rift-j1' },
  { id: 'krator', world: 2, stageId: 'm1', part: 1, placed: false, waves: 3, title: 'Faille de Krator', radio: null },
  { id: 'borea', world: 3, stageId: null, part: 3, placed: false, waves: 3, title: 'Faille de Boréa', radio: null },
  { id: 'vulkar', world: 4, stageId: null, part: 1, placed: false, waves: 3, title: 'Faille de Vulkar', radio: null },
  { id: 'heart', world: 5, stageId: null, part: 3, placed: false, waves: 3, title: 'Faille du Cœur', radio: null },
];

export function isRiftId(v: unknown): v is RiftId {
  return typeof v === 'string' && (RIFT_IDS as readonly string[]).includes(v);
}

export function riftById(id: string): RiftDef | null {
  for (const r of RIFTS) if (r.id === id) return r;
  return null;
}

/** Faille dont le vortex est (ou sera) dans cette étape. */
export function riftForStage(stageId: string): RiftDef | null {
  for (const r of RIFTS) if (r.stageId === stageId) return r;
  return null;
}
