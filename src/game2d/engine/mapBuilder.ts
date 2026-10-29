import type * as Phaser from 'phaser';
import type { PowerUpKind } from '../../core/types';
import { TEX, TILESET, TILE_FRAME, WALKWAY_FAMILY_COUNT, WALKWAY_VARIANTS } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { LevelData } from '../levels/types';

// Lecture de la carte ASCII (voir LEGEND) : grille de collision, tuiles auto-assemblées, entités.

/** Nature physique d'une case. */
export const CELL_EMPTY = 0;
export const CELL_SOLID = 1;
export const CELL_ONEWAY = 2;
export const CELL_HAZARD = 3;

export type EnemyKind = 'w' | 'f' | 'a' | 'p';
export type BonusContent = 'crystal' | PowerUpKind;
/** Sortie du niveau : la Comète ('X') ou la balise de LUMA ('L'). */
export type ExitKind = 'ship' | 'beacon';

export interface GridPos {
  col: number;
  row: number;
}

export interface ExitSpot extends GridPos {
  kind: ExitKind;
}

export interface EnemySpawn extends GridPos {
  kind: EnemyKind;
}

export interface MoverSpawn extends GridPos {
  vertical: boolean;
}

/** Arène de boss : colonnes des deux bornes '|' (col0 < col1) et leur ligne (le sol est la ligne suivante). */
export interface ArenaSpot {
  col0: number;
  col1: number;
  row: number;
}

export interface ParsedLevel {
  cols: number;
  rows: number;
  /** Taille du monde en pixels. */
  width: number;
  height: number;
  /** Nature physique de chaque case (row * cols + col). */
  cells: Uint8Array;
  /** Index de tuile du calque principal (-1 = vide). */
  tiles: Int16Array;
  /** Index de tuile du calque décor (-1 = vide). */
  decor: Int16Array;
  /** Contenu des blocs bonus, par index de case. */
  bonus: Map<number, BonusContent>;
  start: GridPos;
  crystals: GridPos[];
  enemies: EnemySpawn[];
  checkpoints: GridPos[];
  movers: MoverSpawn[];
  /** Portes (case du bas, sans collision), triées par colonne puis par ligne : paires 0 ↔ 1, 2 ↔ 3… */
  doors: GridPos[];
  /** Cases non pleines d'une salle close (aucun passage vers le bord de la carte) : mur de fond dessiné derrière. */
  enclosed: GridPos[];
  /** Sortie ('X' ou 'L', la première lue) ; null pour un niveau qui se termine autrement (gardien). */
  exit: ExitSpot | null;
  /** Arène (les deux premières bornes '|' par colonne) ; null sans arène. */
  arena: ArenaSpot | null;
  /** Case du boss ('M', la première lue). */
  boss: GridPos | null;
  /** Glyphes astréens 'G' (cases vides, décor du mur du fond), par colonne puis par ligne. */
  glyphs: GridPos[];
  /** Champignons 'o' (cases pleines, tuile invisible : engine/mushrooms.ts les dessine), par colonne puis par ligne. */
  mushrooms: GridPos[];
  /** Naufragé 'N' (le premier lu ; engine/npc.ts), null sans naufragé. */
  castaway: GridPos | null;
  /** Cristaux posés + blocs « ? ». */
  crystalsTotal: number;
}

/** Hachage entier déterministe d'une case (variantes de tuiles, décor). */
export function cellHash(col: number, row: number): number {
  let h = Math.imul(col + 1, 73856093) ^ Math.imul(row + 7, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Tuile d'une case '=' : une famille par rangée (d'après la case de son début, `runCol` : les familles ne se
 * raccordent pas entre elles), une variante par case (elles se raccordent toutes).
 */
export function walkwayFrame(runCol: number, col: number, row: number): number {
  const family = cellHash(runCol, row) % WALKWAY_FAMILY_COUNT;
  return TILE_FRAME.WALKWAY + family * WALKWAY_VARIANTS + (cellHash(col, row) % WALKWAY_VARIANTS);
}

export function parseLevel(level: LevelData): ParsedLevel {
  const lines = level.map;
  const rows = Math.max(1, lines.length);
  let cols = 1;
  for (const line of lines) cols = Math.max(cols, line.length);

  const charAt = (col: number, row: number): string => {
    if (row < 0 || row >= rows || col < 0) return '.';
    const line = lines[row];
    return col < line.length ? line[col] : '.';
  };
  // '#' uniquement : sert à l'auto-assemblage. Hors carte à gauche/droite = sol (pas de bord arrondi au bord du monde).
  const isGround = (col: number, row: number): boolean => {
    if (row < 0) return false;
    if (row >= rows) return true;
    if (col < 0 || col >= cols) return charAt(Math.min(Math.max(col, 0), cols - 1), row) === '#';
    return charAt(col, row) === '#';
  };

  const n = cols * rows;
  const cells = new Uint8Array(n);
  const tiles = new Int16Array(n).fill(-1);
  const decor = new Int16Array(n).fill(-1);
  const bonus = new Map<number, BonusContent>();
  const crystals: GridPos[] = [];
  const enemies: EnemySpawn[] = [];
  const checkpoints: GridPos[] = [];
  const movers: MoverSpawn[] = [];
  const doors: GridPos[] = [];
  const bounds: GridPos[] = [];
  const glyphs: GridPos[] = [];
  const mushrooms: GridPos[] = [];
  let start: GridPos | null = null;
  let exit: ExitSpot | null = null;
  let boss: GridPos | null = null;
  let castaway: GridPos | null = null;
  let bonusCrystals = 0;

  for (let row = 0; row < rows; row++) {
    let moverRun = 0; // plusieurs 'm' / 'v' consécutifs = une seule plateforme de 3 tuiles
    let moverRunChar = '';
    let walkwayRun = -1; // colonne où commence la rangée de '=' en cours
    for (let col = 0; col < cols; col++) {
      const ch = charAt(col, row);
      const i = row * cols + col;
      if (ch !== moverRunChar) moverRun = 0;
      if (ch !== '=') walkwayRun = -1;
      else if (walkwayRun < 0) walkwayRun = col;
      switch (ch) {
        case '#': {
          cells[i] = CELL_SOLID;
          const up = isGround(col, row - 1);
          const left = isGround(col - 1, row);
          const right = isGround(col + 1, row);
          let frame: number;
          if (!up) {
            if (left && right) frame = TILE_FRAME.GROUND_TOP;
            else if (right) frame = TILE_FRAME.GROUND_TOP_LEFT;
            else if (left) frame = TILE_FRAME.GROUND_TOP_RIGHT;
            else frame = TILE_FRAME.GROUND_SINGLE;
          } else if (left && !right) {
            frame = TILE_FRAME.GROUND_RIGHT;
          } else if (!left && right) {
            frame = TILE_FRAME.GROUND_LEFT;
          } else {
            frame = cellHash(col, row) % 100 < 15 ? TILE_FRAME.GROUND_FILL_ALT : TILE_FRAME.GROUND_FILL;
          }
          tiles[i] = frame;
          break;
        }
        case 'B':
          cells[i] = CELL_SOLID;
          tiles[i] = TILE_FRAME.BLOCK;
          break;
        case 'o':
          // Case pleine ; la tuile (bloc) est cachée sous le dessin animé du champignon.
          cells[i] = CELL_SOLID;
          tiles[i] = TILE_FRAME.BLOCK;
          mushrooms.push({ col, row });
          break;
        case '?':
        case '1':
        case '2':
        case '3':
          cells[i] = CELL_SOLID;
          tiles[i] = TILE_FRAME.BONUS;
          // 1 = vitesse, 2 = bouclier, 3 = cadence (voir LEGEND).
          bonus.set(i, ch === '?' ? 'crystal' : ch === '1' ? 'speed' : ch === '2' ? 'shield' : 'rapid');
          if (ch === '?') bonusCrystals++;
          break;
        case '=':
          cells[i] = CELL_ONEWAY;
          tiles[i] = walkwayFrame(walkwayRun, col, row);
          break;
        case '^':
          cells[i] = CELL_HAZARD;
          tiles[i] = TILE_FRAME.HAZARD;
          break;
        case '*': {
          const pick = cellHash(col, row) % 3;
          decor[i] = pick === 0 ? TILE_FRAME.DECOR_A : pick === 1 ? TILE_FRAME.DECOR_B : TILE_FRAME.DECOR_C;
          break;
        }
        case 'c':
          crystals.push({ col, row });
          break;
        case 'w':
        case 'f':
        case 'a':
        case 'p':
          enemies.push({ kind: ch, col, row });
          break;
        case 'P':
          if (!start) start = { col, row };
          break;
        case 'K':
          checkpoints.push({ col, row });
          break;
        case 'X':
        case 'L':
          if (!exit) exit = { col, row, kind: ch === 'X' ? 'ship' : 'beacon' };
          break;
        case 'm':
        case 'v':
          if (moverRun % 3 === 0) movers.push({ col, row, vertical: ch === 'v' });
          moverRunChar = ch;
          moverRun++;
          break;
        case 'D':
          // Décor non solide (sprite à part) ; la case du dessus fait partie de la porte.
          doors.push({ col, row });
          break;
        case '|':
          // Vide tant que l'arène est ouverte (engine/arena.ts pose les barrières).
          bounds.push({ col, row });
          break;
        case 'M':
          if (!boss) boss = { col, row };
          break;
        case 'G':
          glyphs.push({ col, row });
          break;
        case 'N':
          if (!castaway) castaway = { col, row };
          break;
        default:
          break;
      }
    }
  }

  if (!start) {
    // Pas de 'P' : départ au-dessus du premier sol à gauche.
    let row = 0;
    while (row < rows - 1 && cells[(row + 1) * cols + 1] !== CELL_SOLID) row++;
    start = { col: 1, row };
  }
  checkpoints.sort((a, b) => a.col - b.col);
  // Lecture ligne par ligne : on remet les portes dans l'ordre des paires (colonne, puis ligne).
  doors.sort((a, b) => a.col - b.col || a.row - b.row);
  bounds.sort((a, b) => a.col - b.col);
  glyphs.sort((a, b) => a.col - b.col || a.row - b.row);
  mushrooms.sort((a, b) => a.col - b.col || a.row - b.row);
  const arena: ArenaSpot | null = bounds.length >= 2 ? { col0: bounds[0].col, col1: bounds[1].col, row: bounds[0].row } : null;

  return {
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    cells,
    tiles,
    decor,
    bonus,
    start,
    crystals,
    enemies,
    checkpoints,
    movers,
    doors,
    enclosed: enclosedCells(cols, rows, cells),
    exit,
    arena,
    boss,
    glyphs,
    mushrooms,
    castaway,
    crystalsTotal: crystals.length + bonusCrystals,
  };
}

/**
 * Cases non pleines qu'aucun chemin (sans traverser de case pleine) ne relie au bord de la carte : intérieur
 * d'une salle murée, où l'on n'entre que par une porte.
 */
function enclosedCells(cols: number, rows: number, cells: Uint8Array): GridPos[] {
  const open = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const push = (col: number, row: number): void => {
    const i = row * cols + col;
    if (open[i] || cells[i] === CELL_SOLID) return;
    open[i] = 1;
    stack.push(i);
  };
  for (let col = 0; col < cols; col++) {
    push(col, 0);
    push(col, rows - 1);
  }
  for (let row = 0; row < rows; row++) {
    push(0, row);
    push(cols - 1, row);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const col = i % cols;
    const row = (i - col) / cols;
    if (col > 0) push(col - 1, row);
    if (col < cols - 1) push(col + 1, row);
    if (row > 0) push(col, row - 1);
    if (row < rows - 1) push(col, row + 1);
  }
  const out: GridPos[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!open[i] && cells[i] !== CELL_SOLID) out.push({ col: i % cols, row: Math.floor(i / cols) });
  }
  return out;
}

// ---------------------------------------------------------------- Requêtes sur la grille

export class Grid {
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cells: Uint8Array,
  ) {}

  /** Nature d'une case ; hors carte : mur à gauche/droite, vide en haut/bas. */
  at(col: number, row: number): number {
    if (col < 0 || col >= this.cols) return CELL_SOLID;
    if (row < 0 || row >= this.rows) return CELL_EMPTY;
    return this.cells[row * this.cols + col];
  }

  atPx(x: number, y: number): number {
    return this.at(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  solidAtPx(x: number, y: number): boolean {
    return this.atPx(x, y) === CELL_SOLID;
  }

  /** Sol sur lequel on peut marcher (plein ou traversable). */
  groundAtPx(x: number, y: number): boolean {
    const c = this.atPx(x, y);
    return c === CELL_SOLID || c === CELL_ONEWAY;
  }

  hazardAtPx(x: number, y: number): boolean {
    return this.atPx(x, y) === CELL_HAZARD;
  }
}

// ---------------------------------------------------------------- Construction du Tilemap Phaser

export interface BuiltMap {
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  decorLayer: Phaser.Tilemaps.TilemapLayer | null;
}

export function buildTilemap(scene: Phaser.Scene, parsed: ParsedLevel): BuiltMap {
  const { cols, rows, tiles, decor, cells } = parsed;
  const data: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: number[] = new Array<number>(cols);
    for (let col = 0; col < cols; col++) line[col] = tiles[row * cols + col];
    data.push(line);
  }

  const map = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage(TEX.tiles, TEX.tiles, TILE, TILE, TILESET.margin, TILESET.spacing);
  if (!tileset) throw new Error('Tileset introuvable : ' + TEX.tiles);
  const layer = map.createLayer(0, tileset, 0, 0);
  if (!layer) throw new Error('Calque de tuiles impossible à créer');
  layer.setDepth(DEPTH.tiles);

  // Collisions par tuile : plein = 4 côtés ; traversable = dessus seulement.
  const solid = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows && cells[row * cols + col] === CELL_SOLID;
  const oneWay = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows && cells[row * cols + col] === CELL_ONEWAY;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const kind = cells[row * cols + col];
      if (kind !== CELL_SOLID && kind !== CELL_ONEWAY) continue;
      const tile = layer.getTileAt(col, row);
      if (!tile) continue;
      if (kind === CELL_SOLID) {
        tile.setCollision(true, true, true, true, false);
        // Faces internes désactivées (pas d'accroc entre deux tuiles pleines). Une face latérale contre une
        // plateforme traversable est aussi coupée : sinon on bute en passant de la plateforme au sol.
        tile.faceTop = !solid(col, row - 1);
        tile.faceBottom = !solid(col, row + 1);
        tile.faceLeft = !solid(col - 1, row) && !oneWay(col - 1, row);
        tile.faceRight = !solid(col + 1, row) && !oneWay(col + 1, row);
      } else {
        tile.setCollision(false, false, true, false, false);
        tile.faceTop = !solid(col, row - 1);
        tile.faceBottom = false;
        tile.faceLeft = false;
        tile.faceRight = false;
      }
    }
  }

  // Salles closes : mur de fond derrière les cases vides (sinon on y verrait le ciel de la parallaxe).
  // Images détruites avec la scène, comme les autres objets du niveau.
  if (scene.textures.exists(TEX.roomWall)) {
    for (const c of parsed.enclosed) {
      scene.add.image(c.col * TILE, c.row * TILE, TEX.roomWall).setOrigin(0, 0).setDepth(DEPTH.decor - 1);
    }
  }

  let decorLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  let hasDecor = false;
  for (let i = 0; i < decor.length; i++) {
    if (decor[i] >= 0) {
      hasDecor = true;
      break;
    }
  }
  if (hasDecor) {
    decorLayer = map.createBlankLayer('decor', tileset, 0, 0, cols, rows, TILE, TILE);
    if (decorLayer) {
      decorLayer.setDepth(DEPTH.decor);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = decor[row * cols + col];
          if (idx >= 0) decorLayer.putTileAt(idx, col, row, false);
        }
      }
    }
  }

  return { map, layer, decorLayer };
}
