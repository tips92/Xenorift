// Graphe d'accessibilité des niveaux de plateforme (scripts/check-levels.ts), selon DESIGN_RULES.
//
// Modèle : un graphe de positions « debout » (case libre sur 2 lignes avec un appui plein, traversable ou bloc
// bonus juste dessous, ou position sur une plateforme mobile). Arêtes : marcher, sauter (montée ≤ maxRise avec
// les écarts max de DESIGN_RULES), se laisser tomber (écart ≤ maxGapDown), passer une porte 'D' (vers l'autre
// porte de sa paire, dans les deux sens). Les plafonds et les murs bloquent les sauts. Le faisceau d'une balise
// 'L' happe Kaï à toute hauteur : le parcours s'y arrête, et un trajet qui traverse sa colonne au-dessus de son
// sol mène à la balise (on ne la franchit pas). Les bornes d'arène '|' sont vides : la barrière ne se ferme que
// pendant le combat, que la victoire termine en rouvrant les deux. Un second parcours, avec le double saut
// (compétence apprise : loadout.skills.doubleJump) depuis toutes les positions déjà atteintes, repère les
// « secrets de compétence ».

import { DESIGN_RULES } from '../../src/game2d/constants.ts';

/** Cases pleines (les bornes '|' n'y sont pas : la barrière n'existe que pendant le combat). */
export const SOLID_CHARS = '#B?123';

/** Accessibilité : 0 = non atteinte, 1 = atteinte normalement, 2 = seulement avec le double saut (compétence). */
export const REACH_NONE = 0;
export const REACH_NORMAL = 1;
export const REACH_DJ = 2;

/** Cristal le plus haut touché au sommet d'un saut (lignes au-dessus de la ligne où l'on se tient) :
 *  saut 4,2 tuiles + corps 70 px + marge de ramassage -> la tête atteint la ligne r-5 (r-8 avec le double saut). */
const CRYSTAL_UP = 5;
const CRYSTAL_UP_DJ = 8;
/** Bloc le plus haut frappé par dessous (la tête atteint le bas de la ligne r-5). */
const HIT_UP = 5;
const HIT_UP_DJ = 8;
/** Positions par plateforme mobile dans le graphe : 3 cases x 4 décalages (0..3 tuiles). */
const MOVER_NODES = 12;

export interface Mover {
  col: number;
  row: number;
  vertical: boolean;
}

export interface Pos {
  col: number;
  row: number;
}

// ---------------------------------------------------------------- Grille

export class LevelGrid {
  readonly rows: number;
  readonly cols: number;
  readonly movers: Mover[] = [];
  /** Portes 'D' dans l'ordre des paires (comme le moteur) : par colonne, puis par ligne. */
  readonly doors: Pos[] = [];
  /** Case d'une porte appairée -> case de l'autre porte de sa paire. */
  readonly doorLink = new Map<number, number>();
  readonly map: readonly string[];

  constructor(map: readonly string[]) {
    this.map = map;
    this.rows = map.length;
    this.cols = map.length > 0 ? map[0].length : 0;
    this.parseMovers();
    this.parseDoors();
  }

  key(c: number, r: number): number {
    return r * this.cols + c;
  }

  /** Caractère d'une case ; hors carte : mur à gauche / droite, vide en haut / en bas. */
  ch(c: number, r: number): string {
    if (r < 0 || r >= this.rows) return '.';
    if (c < 0 || c >= this.cols) return '#';
    const line = this.map[r];
    return c < line.length ? line[c] : '.';
  }

  solid(c: number, r: number): boolean {
    return SOLID_CHARS.includes(this.ch(c, r));
  }

  oneWay(c: number, r: number): boolean {
    return this.ch(c, r) === '=';
  }

  hazard(c: number, r: number): boolean {
    return this.ch(c, r) === '^';
  }

  /** Appui fixe sous la case (sol, bloc, plateforme traversable). */
  supported(c: number, r: number): boolean {
    return this.solid(c, r + 1) || this.oneWay(c, r + 1);
  }

  /** Place pour Kaï (2 lignes de haut, sans danger), sans exiger d'appui. */
  roomFor(c: number, r: number): boolean {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    if (this.solid(c, r) || this.solid(c, r - 1)) return false;
    return !this.hazard(c, r) && !this.hazard(c, r - 1);
  }

  /** Kaï peut-il se tenir debout dans cette case sur un appui fixe ? */
  standable(c: number, r: number): boolean {
    return this.roomFor(c, r) && this.supported(c, r);
  }

  /** Même découpage que le moteur : 'mmm' / 'vvv' consécutifs = une plateforme de 3 tuiles. */
  private parseMovers(): void {
    for (let r = 0; r < this.rows; r++) {
      let run = 0;
      let runChar = '';
      for (let c = 0; c < this.cols; c++) {
        const ch = this.ch(c, r);
        if (ch !== runChar) run = 0;
        if (ch === 'm' || ch === 'v') {
          if (run % 3 === 0) this.movers.push({ col: c, row: r, vertical: ch === 'v' });
          runChar = ch;
          run++;
        }
      }
    }
  }

  /** Même appairage que le moteur (parseLevel) : tri (colonne, ligne), puis 1re ↔ 2e, 3e ↔ 4e… */
  private parseDoors(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) if (this.ch(c, r) === 'D') this.doors.push({ col: c, row: r });
    }
    this.doors.sort((a, b) => a.col - b.col || a.row - b.row);
    for (let i = 0; i + 1 < this.doors.length; i += 2) {
      const a = this.key(this.doors[i].col, this.doors[i].row);
      const b = this.key(this.doors[i + 1].col, this.doors[i + 1].row);
      this.doorLink.set(a, b);
      this.doorLink.set(b, a);
    }
  }
}

// ---------------------------------------------------------------- Règles de saut

/** Saut autorisé par DESIGN_RULES (montée en lignes, écart en colonnes vides) ? */
function jumpAllowed(rise: number, gap: number, dj: boolean): boolean {
  const R = DESIGN_RULES;
  if (!dj) {
    if (rise > R.maxRise) return false;
    if (rise === 3) return gap <= R.maxGapUp3;
    if (rise >= 1) return gap <= R.maxGapUp2;
    if (rise >= -1) return gap <= R.maxGapFlat;
    return gap <= R.maxGapDown;
  }
  // Double saut (~7,2 tuiles) : réservé aux secrets de compétence.
  if (rise > 6) return false;
  if (rise >= 5) return gap <= 2;
  if (rise >= 3) return gap <= 3;
  if (rise >= 1) return gap <= 4;
  if (rise >= -1) return gap <= 5;
  return gap <= 6;
}

/** Le couloir du saut est-il libre (plafonds, murs) ? Plateformes traversables = libres. */
function corridorClear(g: LevelGrid, c0: number, r0: number, c1: number, r1: number, gap: number): boolean {
  const rise = r0 - r1;
  const hi = Math.min(r0, r1);
  let top: number;
  if (rise > 0) top = hi - 2;
  else if (gap <= 1) top = hi - 1;
  else if (rise === 0 && gap >= 3) top = hi - 3;
  else top = hi - 2;
  const dir = c1 > c0 ? 1 : -1;
  for (let r = top; r <= r0; r++) if (g.solid(c0, r)) return false;
  for (let c = c0 + dir; c !== c1; c += dir) {
    for (let r = top; r <= hi; r++) if (g.solid(c, r)) return false;
  }
  for (let r = top; r <= r1; r++) if (g.solid(c1, r)) return false;
  return true;
}

/** Marche / saut / chute permis entre deux positions debout ? */
function edgeAllowed(g: LevelGrid, c0: number, r0: number, c1: number, r1: number, dj: boolean): boolean {
  const dc = c1 - c0;
  const rise = r0 - r1;
  if (dc === 0) {
    // Saut vertical à travers une plateforme traversable (on ne redescend jamais à travers).
    if (rise < 1 || !jumpAllowed(rise, 0, dj)) return false;
    for (let r = r1 - 1; r <= r0 - 1; r++) if (g.solid(c0, r)) return false;
    return true;
  }
  const gap = Math.abs(dc) - 1;
  if (!jumpAllowed(rise, gap, dj)) return false;
  return corridorClear(g, c0, r0, c1, r1, gap);
}

// ---------------------------------------------------------------- Graphe d'accessibilité
// Nœuds : cases debout fixes (row * cols + col), puis positions sur les plateformes mobiles
// (3 cases x 4 décalages par plateforme). Le moteur fait bouger toutes les plateformes avec la même
// horloge : d'une plateforme mobile à une autre, on ne saute qu'à décalage égal. Depuis (ou vers)
// un appui fixe, on peut attendre le bon décalage.

/** Kaï debout en (c, r) est-il dans le faisceau de la balise `beam` (corps au-dessus de son sol) ? */
export function inBeam(beam: Pos | null, c: number, r: number): boolean {
  return beam !== null && c === beam.col && r <= beam.row;
}

/** Un trajet libre de c0 à c1, dont la ligne la plus haute est `hi`, traverse-t-il le faisceau ? Un couloir
 *  libre passe forcément au-dessus du sol plein de la balise (dans le faisceau) ou en dessous (tunnel). */
export function crossesBeam(beam: Pos | null, c0: number, c1: number, hi: number): boolean {
  return beam !== null && Math.min(c0, c1) < beam.col && beam.col < Math.max(c0, c1) && hi <= beam.row;
}

export class ReachGraph {
  readonly n: number;
  readonly total: number;
  readonly g: LevelGrid;
  readonly beam: Pos | null;
  /** Nœud de la balise : où mène tout trajet qui traverse son faisceau. */
  private readonly beamNode: number;
  private readonly tmp: Pos = { col: 0, row: 0 };

  /** `beam` : case de la balise 'L' (null pour une Comète ou sans sortie). */
  constructor(g: LevelGrid, beam: Pos | null) {
    this.g = g;
    this.beam = beam;
    this.beamNode = beam ? g.key(beam.col, beam.row) : -1;
    this.n = g.rows * g.cols;
    this.total = this.n + g.movers.length * MOVER_NODES;
  }

  moverOf(id: number): number {
    return id < this.n ? -1 : Math.floor((id - this.n) / MOVER_NODES);
  }

  offsetOf(id: number): number {
    return id < this.n ? 0 : Math.floor(((id - this.n) % MOVER_NODES) / 3);
  }

  node(mover: number, offset: number, k: number): number {
    return this.n + mover * MOVER_NODES + offset * 3 + k;
  }

  pos(id: number, out: Pos): Pos {
    const g = this.g;
    if (id < this.n) {
      out.col = id % g.cols;
      out.row = (id - out.col) / g.cols;
      return out;
    }
    const j = id - this.n;
    const m = g.movers[Math.floor(j / MOVER_NODES)];
    const o = Math.floor((j % MOVER_NODES) / 3);
    const k = j % 3;
    out.col = m.vertical ? m.col + k : m.col + o + k;
    out.row = m.vertical ? m.row - 1 - o : m.row - 1;
    return out;
  }

  valid(id: number): boolean {
    const p = this.pos(id, this.tmp);
    return id < this.n ? this.g.standable(p.col, p.row) : this.g.roomFor(p.col, p.row);
  }

  neighbors(id: number, dj: boolean, out: number[]): void {
    out.length = 0;
    const g = this.g;
    const p = this.pos(id, { col: 0, row: 0 });
    const c0 = p.col;
    const r0 = p.row;
    // Happé par le faisceau de la balise : fin du parcours.
    if (inBeam(this.beam, c0, r0)) return;
    const mi = this.moverOf(id);
    const oi = this.offsetOf(id);
    const maxDx = (dj ? 6 : DESIGN_RULES.maxGapDown) + 1;
    const maxUp = dj ? 6 : DESIGN_RULES.maxRise;
    // Cibles fixes
    for (let c1 = Math.max(0, c0 - maxDx); c1 <= Math.min(g.cols - 1, c0 + maxDx); c1++) {
      for (let r1 = Math.max(0, r0 - maxUp); r1 < g.rows; r1++) {
        if (c1 === c0 && r1 === r0) continue;
        if (!g.standable(c1, r1)) continue;
        if (edgeAllowed(g, c0, r0, c1, r1, dj)) out.push(this.target(c0, r0, c1, r1, g.key(c1, r1)));
      }
    }
    // Porte : on entre debout devant elle, on ressort devant l'autre porte de la paire.
    const link = mi < 0 ? g.doorLink.get(id) : undefined;
    if (link !== undefined && g.standable(c0, r0)) {
      const c1 = link % g.cols;
      if (g.standable(c1, (link - c1) / g.cols)) out.push(link);
    }
    // Cibles sur plateformes mobiles
    const q: Pos = { col: 0, row: 0 };
    for (let mj = 0; mj < g.movers.length; mj++) {
      for (let oj = 0; oj < 4; oj++) {
        for (let kj = 0; kj < 3; kj++) {
          const id2 = this.node(mj, oj, kj);
          if (id2 === id || !this.valid(id2)) continue;
          this.pos(id2, q);
          if (mj === mi) {
            out.push(this.target(c0, r0, q.col, q.row, id2)); // à bord : toute la course est accessible
            continue;
          }
          if (mi >= 0 && oj !== oi) continue; // plateformes synchronisées
          if (Math.abs(q.col - c0) > maxDx) continue;
          if (edgeAllowed(g, c0, r0, q.col, q.row, dj)) out.push(this.target(c0, r0, q.col, q.row, id2));
        }
      }
    }
  }

  /** Nœud atteint par un trajet permis vers `id` : la balise si le trajet traverse son faisceau. */
  private target(c0: number, r0: number, c1: number, r1: number, id: number): number {
    return crossesBeam(this.beam, c0, c1, Math.min(r0, r1)) ? this.beamNode : id;
  }

  /** Parcours en largeur ; marque `mark` les nœuds nouvellement atteints. */
  flood(reach: Uint8Array, seeds: readonly number[], dj: boolean, mark: number): void {
    const queue: number[] = [];
    for (const s of seeds) {
      if (reach[s] === REACH_NONE) reach[s] = mark;
      queue.push(s);
    }
    const nb: number[] = [];
    for (let qi = 0; qi < queue.length; qi++) {
      this.neighbors(queue[qi], dj, nb);
      for (const k of nb) {
        if (reach[k] !== REACH_NONE) continue;
        reach[k] = mark;
        queue.push(k);
      }
    }
  }

  /** Projette l'accessibilité des nœuds sur les cases (niveau le plus facile). */
  cellReach(reach: Uint8Array): Uint8Array {
    const cells = new Uint8Array(this.n);
    const p: Pos = { col: 0, row: 0 };
    for (let id = 0; id < this.total; id++) {
      const v = reach[id];
      if (v === REACH_NONE) continue;
      this.pos(id, p);
      const k = this.g.key(p.col, p.row);
      if (cells[k] === REACH_NONE || v < cells[k]) cells[k] = v;
    }
    return cells;
  }
}

/** Un cristal est-il touché depuis une case debout atteinte (en marchant ou au sommet d'un saut) ? Pas dans
 *  le faisceau de la balise `beam`, ni en le traversant. */
export function touchable(g: LevelGrid, reach: Uint8Array, beam: Pos | null, c: number, r: number, level: number): boolean {
  if (inBeam(beam, c, r)) return false;
  const up = level === REACH_DJ ? CRYSTAL_UP_DJ : CRYSTAL_UP;
  const maxDx = level === REACH_DJ ? 3 : 2;
  for (let dc = -maxDx; dc <= maxDx; dc++) {
    const cs = c + dc;
    if (cs < 0 || cs >= g.cols || crossesBeam(beam, cs, c, r)) continue;
    for (let rs = r; rs <= Math.min(g.rows - 1, r + up); rs++) {
      const v = reach[g.key(cs, rs)];
      if (v === REACH_NONE || v > level || inBeam(beam, cs, rs)) continue;
      let clear = true;
      for (let k = r; k <= rs && clear; k++) if (g.solid(cs, k)) clear = false;
      const dir = dc > 0 ? -1 : 1;
      for (let x = cs + dir; dc !== 0 && clear; x += dir) {
        if (g.solid(x, r)) clear = false;
        if (x === c) break;
      }
      if (clear) return true;
    }
  }
  return false;
}

/** Un bloc bonus peut-il être frappé par dessous depuis une case debout atteinte ? */
export function hittable(g: LevelGrid, reach: Uint8Array, c: number, r: number, level: number): boolean {
  const up = level === REACH_DJ ? HIT_UP_DJ : HIT_UP;
  for (let rs = r + 2; rs <= Math.min(g.rows - 1, r + up); rs++) {
    if (g.solid(c, rs - 1)) return false;
    const v = reach[g.key(c, rs)];
    if (v !== REACH_NONE && v <= level) return true;
  }
  return false;
}
