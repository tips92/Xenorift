import { LEVEL_ROWS } from '../constants.ts';

// Outils d'écriture des niveaux : une carte est composée de segments lisibles (LEVEL_ROWS lignes chacun)
// assemblés côte à côte. Uniquement du TypeScript « effaçable » : ce fichier est aussi chargé par Node
// (scripts/check-levels.ts).

/** Un morceau de carte : LEVEL_ROWS lignes de même largeur, de haut en bas. */
export type Segment = readonly string[];

/** Assemble des segments côte à côte. Lève une erreur précise si un segment est mal formé. */
export function joinSegments(levelId: string, segments: readonly Segment[]): string[] {
  const rows: string[] = [];
  for (let r = 0; r < LEVEL_ROWS; r++) rows.push('');
  let col = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length !== LEVEL_ROWS) {
      throw new Error(`${levelId} : le segment n°${i} (colonne ${col}) a ${seg.length} lignes au lieu de ${LEVEL_ROWS}`);
    }
    const width = seg[0].length;
    for (let r = 0; r < LEVEL_ROWS; r++) {
      if (seg[r].length !== width) {
        throw new Error(
          `${levelId} : segment n°${i} (colonne ${col}), ligne ${r} : largeur ${seg[r].length} au lieu de ${width}`,
        );
      }
      rows[r] += seg[r];
    }
    col += width;
  }
  return rows;
}
