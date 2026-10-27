/// <reference types="node" />
// Validation des niveaux de plateforme : format, entités, et accessibilité selon DESIGN_RULES.
// Usage (depuis la racine du projet) :
//   node scripts/check-levels.ts            -> tous les niveaux
//   node scripts/check-levels.ts moon       -> un seul niveau
//   node scripts/check-levels.ts --map      -> affiche aussi la carte annotée
// Code de sortie 1 s'il y a au moins une erreur.
//
// Modèle d'accessibilité : un graphe de positions « debout » (case libre sur 2 lignes avec un appui plein,
// traversable ou bloc bonus juste dessous, ou position sur une plateforme mobile). Arêtes : marcher, sauter
// (montée ≤ maxRise avec les écarts max de DESIGN_RULES), se laisser tomber (écart ≤ maxGapDown).
// Les plafonds et les murs bloquent les sauts. Un second parcours, amorcé sous les blocs « double saut »,
// repère les secrets réservés au double saut.

import { DESIGN_RULES, LEVEL_ROWS, RUN_SPEED, TILE } from '../src/game2d/constants.ts';
import { getLevel, LEVEL_IDS } from '../src/game2d/levels/index.ts';
import { LEGEND } from '../src/game2d/levels/types.ts';
import type { LevelData } from '../src/game2d/levels/types.ts';

const SOLID_CHARS = '#B?123';
const BONUS_CHARS = '?123';
const ENEMY_CHARS = 'wfap';
const VALID_THEMES = ['jungle', 'moon'];
const VALID_MUSIC = ['menu', 'jungle', 'moon', 'nebula', 'asteroids'];

/** Accessibilité : 0 = non atteinte, 1 = atteinte normalement, 2 = seulement avec le double saut. */
const REACH_NONE = 0;
const REACH_NORMAL = 1;
const REACH_DJ = 2;

/** Cristal le plus haut touché au sommet d'un saut (lignes au-dessus de la ligne où l'on se tient) :
 *  saut 4,2 tuiles + corps 70 px + marge de ramassage -> la tête atteint la ligne r-5 (r-8 avec le double saut). */
const CRYSTAL_UP = 5;
const CRYSTAL_UP_DJ = 8;
/** Bloc le plus haut frappé par dessous (la tête atteint le bas de la ligne r-5). */
const HIT_UP = 5;
const HIT_UP_DJ = 8;
/** Un secret « double saut » doit être à moins de N colonnes après un bloc « 3 » (bonus de 20 s). */
const DJ_SECRET_MAX_DIST = 40;
const START_SAFE_COLS = 8;
/** Positions par plateforme mobile dans le graphe : 3 cases x 4 décalages (0..3 tuiles). */
const MOVER_NODES = 12;

interface Mover {
  col: number;
  row: number;
  vertical: boolean;
}

interface Pos {
  col: number;
  row: number;
}

interface Report {
  errors: string[];
  warnings: string[];
  notes: string[];
}

const args = process.argv.slice(2);
const showMap = args.includes('--map');
const only = args.filter((a) => !a.startsWith('--'));

// ---------------------------------------------------------------- Grille

class LevelGrid {
  readonly rows: number;
  readonly cols: number;
  readonly movers: Mover[] = [];
  readonly map: readonly string[];

  constructor(map: readonly string[]) {
    this.map = map;
    this.rows = map.length;
    this.cols = map.length > 0 ? map[0].length : 0;
    this.parseMovers();
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
  // Double saut (~7,2 tuiles) : réservé aux secrets.
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

class ReachGraph {
  readonly n: number;
  readonly total: number;
  readonly g: LevelGrid;
  private readonly tmp: Pos = { col: 0, row: 0 };

  constructor(g: LevelGrid) {
    this.g = g;
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
    const mi = this.moverOf(id);
    const oi = this.offsetOf(id);
    const maxDx = (dj ? 6 : DESIGN_RULES.maxGapDown) + 1;
    const maxUp = dj ? 6 : DESIGN_RULES.maxRise;
    // Cibles fixes
    for (let c1 = Math.max(0, c0 - maxDx); c1 <= Math.min(g.cols - 1, c0 + maxDx); c1++) {
      for (let r1 = Math.max(0, r0 - maxUp); r1 < g.rows; r1++) {
        if (c1 === c0 && r1 === r0) continue;
        if (!g.standable(c1, r1)) continue;
        if (edgeAllowed(g, c0, r0, c1, r1, dj)) out.push(g.key(c1, r1));
      }
    }
    // Cibles sur plateformes mobiles
    const q: Pos = { col: 0, row: 0 };
    for (let mj = 0; mj < g.movers.length; mj++) {
      for (let oj = 0; oj < 4; oj++) {
        for (let kj = 0; kj < 3; kj++) {
          const id2 = this.node(mj, oj, kj);
          if (id2 === id || !this.valid(id2)) continue;
          if (mj === mi) {
            out.push(id2); // à bord : toute la course est accessible
            continue;
          }
          if (mi >= 0 && oj !== oi) continue; // plateformes synchronisées
          this.pos(id2, q);
          if (Math.abs(q.col - c0) > maxDx) continue;
          if (edgeAllowed(g, c0, r0, q.col, q.row, dj)) out.push(id2);
        }
      }
    }
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

/** Un cristal est-il touché depuis une case debout atteinte (en marchant ou au sommet d'un saut) ? */
function touchable(g: LevelGrid, reach: Uint8Array, c: number, r: number, level: number): boolean {
  const up = level === REACH_DJ ? CRYSTAL_UP_DJ : CRYSTAL_UP;
  const maxDx = level === REACH_DJ ? 3 : 2;
  for (let dc = -maxDx; dc <= maxDx; dc++) {
    const cs = c + dc;
    if (cs < 0 || cs >= g.cols) continue;
    for (let rs = r; rs <= Math.min(g.rows - 1, r + up); rs++) {
      const v = reach[g.key(cs, rs)];
      if (v === REACH_NONE || v > level) continue;
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
function hittable(g: LevelGrid, reach: Uint8Array, c: number, r: number, level: number): boolean {
  const up = level === REACH_DJ ? HIT_UP_DJ : HIT_UP;
  for (let rs = r + 2; rs <= Math.min(g.rows - 1, r + up); rs++) {
    if (g.solid(c, rs - 1)) return false;
    const v = reach[g.key(c, rs)];
    if (v !== REACH_NONE && v <= level) return true;
  }
  return false;
}

// ---------------------------------------------------------------- Vérification d'un niveau

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m} min ${sec.toString().padStart(2, '0')} s`;
}

function checkLevel(id: string, level: LevelData): Report {
  const rep: Report = { errors: [], warnings: [], notes: [] };
  const err = (m: string): void => void rep.errors.push(m);
  const warn = (m: string): void => void rep.warnings.push(m);

  // ---- Métadonnées
  if (level.id !== id) err(`id « ${level.id} » différent de la clé « ${id} »`);
  if (!VALID_THEMES.includes(level.theme)) err(`thème inconnu « ${level.theme} »`);
  if (!VALID_MUSIC.includes(level.music)) err(`musique inconnue « ${level.music} »`);
  if (!level.name.trim()) err('nom vide');

  // ---- Format
  const map = level.map;
  if (map.length !== LEVEL_ROWS) err(`${map.length} lignes au lieu de ${LEVEL_ROWS}`);
  const width = map.length > 0 ? map[0].length : 0;
  map.forEach((line, r) => {
    if (line.length !== width) err(`ligne ${r} : longueur ${line.length} au lieu de ${width}`);
    for (let c = 0; c < line.length; c++) {
      if (!Object.prototype.hasOwnProperty.call(LEGEND, line[c])) err(`caractère inconnu « ${line[c]} » en (${c}, ${r})`);
    }
  });
  if (rep.errors.length > 0) return rep;

  const g = new LevelGrid(map);
  const find = (ch: string): Pos[] => {
    const out: Pos[] = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (g.ch(c, r) === ch) out.push({ col: c, row: r });
    return out;
  };
  const starts = find('P');
  const exits = find('X');
  if (starts.length !== 1) err(`${starts.length} départ(s) 'P' (exactement 1 attendu)`);
  if (exits.length !== 1) err(`${exits.length} vaisseau(x) 'X' (exactement 1 attendu)`);
  if (starts.length !== 1 || exits.length !== 1) return rep;
  const P = starts[0];
  const X = exits[0];

  const crystals = find('c');
  const bonus: Pos[] = [];
  const enemies: (Pos & { kind: string })[] = [];
  const checkpoints = find('K');
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const ch = g.ch(c, r);
      if (BONUS_CHARS.includes(ch)) bonus.push({ col: c, row: r });
      if (ENEMY_CHARS.includes(ch)) enemies.push({ col: c, row: r, kind: ch });
    }
  }

  // ---- Vaisseau : 3x2 à droite et au-dessus de la case, posé sur le sol
  if (X.col + 2 >= g.cols) err(`vaisseau X (${X.col}, ${X.row}) : dépasse le bord droit`);
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 2; j++) {
      const c = X.col + k;
      const r = X.row - j;
      if ((k !== 0 || j !== 0) && g.ch(c, r) !== '.') err(`vaisseau X : case (${c}, ${r}) occupée par « ${g.ch(c, r)} »`);
    }
    if (!g.solid(X.col + k, X.row + 1)) err(`vaisseau X : pas de sol plein sous la colonne ${X.col + k}`);
  }

  // ---- Plateformes mobiles : place libre sur toute la course
  for (const m of g.movers) {
    const label = `plateforme ${m.vertical ? 'verticale' : 'horizontale'} (${m.col}, ${m.row})`;
    const body: Pos[] = [];
    const rider: Pos[] = [];
    if (m.vertical) {
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j <= 3; j++) body.push({ col: m.col + k, row: m.row - j });
        for (let j = 1; j <= 5; j++) rider.push({ col: m.col + k, row: m.row - j });
      }
      if (m.row - 5 < 0) err(`${label} : Kaï sortirait de la carte en haut de la course`);
    } else {
      for (let k = 0; k < 6; k++) {
        body.push({ col: m.col + k, row: m.row });
        rider.push({ col: m.col + k, row: m.row - 1 }, { col: m.col + k, row: m.row - 2 });
      }
    }
    if (m.col + (m.vertical ? 2 : 5) >= g.cols) err(`${label} : sort de la carte à droite`);
    for (const p of body) {
      const ch = g.ch(p.col, p.row);
      if (ch !== '.' && ch !== 'm' && ch !== 'v' && ch !== 'c') err(`${label} : la course traverse « ${ch} » en (${p.col}, ${p.row})`);
    }
    for (const p of rider) {
      if (g.solid(p.col, p.row) || g.hazard(p.col, p.row)) err(`${label} : pas de place pour Kaï en (${p.col}, ${p.row})`);
    }
    // Les 3 cases doivent être écrites 'mmm' / 'vvv' : une seule lettre marche aussi, mais se lit mal.
    const letter = m.vertical ? 'v' : 'm';
    for (let k = 1; k < 3; k++) {
      if (g.ch(m.col + k, m.row) !== letter) warn(`${label} : écrire '${letter.repeat(3)}' (3 cases)`);
    }
  }

  // ---- Ennemis
  const patrolLength = (c: number, r: number): number => {
    const ok = (x: number): boolean => x >= 0 && x < g.cols && !g.solid(x, r) && !g.hazard(x, r) && g.supported(x, r);
    let n = 1;
    for (let x = c - 1; ok(x); x--) n++;
    for (let x = c + 1; ok(x); x++) n++;
    return n;
  };
  for (const e of enemies) {
    const at = `(${e.col}, ${e.row})`;
    if (e.kind === 'w' || e.kind === 'a' || e.kind === 'p') {
      if (!g.supported(e.col, e.row)) err(`ennemi « ${e.kind} » ${at} : pas de sol dessous`);
      else if (e.kind !== 'p') {
        const n = patrolLength(e.col, e.row);
        if (n < 3) err(`ennemi « ${e.kind} » ${at} : seulement ${n} case(s) de patrouille (3 min.)`);
      }
      if (g.solid(e.col, e.row - 1) && e.kind === 'p') warn(`cracheur ${at} : plafond juste au-dessus`);
    } else {
      for (let x = e.col - 3; x <= e.col + 3; x++) {
        if (g.solid(x, e.row)) {
          warn(`volant ${at} : sa course (±3) traverse un mur en (${x}, ${e.row})`);
          break;
        }
      }
    }
    for (const m of g.movers) {
      const inX = e.col >= m.col && e.col < m.col + (m.vertical ? 3 : 6);
      const inY = m.vertical ? e.row <= m.row && e.row >= m.row - 5 : e.row <= m.row && e.row >= m.row - 2;
      if (inX && inY && e.kind !== 'f') err(`ennemi « ${e.kind} » ${at} : dans la course d'une plateforme mobile`);
    }
  }

  // ---- Décor
  for (const d of find('*')) {
    if (!g.solid(d.col, d.row + 1)) warn(`décor (${d.col}, ${d.row}) : ne repose pas sur un sol plein`);
  }

  // ---- Départ : zone sûre
  if (!g.standable(P.col, P.row)) err(`départ P (${P.col}, ${P.row}) : pas de sol dessous`);
  for (let c = P.col; c < P.col + START_SAFE_COLS; c++) {
    if (!g.standable(c, P.row)) {
      err(`départ : la colonne ${c} n'est pas un sol plat et sûr (${START_SAFE_COLS} colonnes sûres requises)`);
      break;
    }
  }
  const safeL = Math.max(0, P.col - 2);
  const safeR = P.col + START_SAFE_COLS - 1;
  for (const e of enemies) {
    const reachX = e.kind === 'f' ? 3 : e.kind === 'p' ? 8 : 0;
    if (e.col + reachX >= safeL && e.col - reachX <= safeR) {
      err(`ennemi « ${e.kind} » (${e.col}, ${e.row}) : menace la zone de départ (colonnes ${safeL}-${safeR})`);
    }
  }

  // ---- Accessibilité
  const graph = new ReachGraph(g);
  const nodeReach = new Uint8Array(graph.total);
  graph.flood(nodeReach, [g.key(P.col, P.row)], false, REACH_NORMAL);
  // Double saut : à partir des cases sous un bloc « 3 » atteintes normalement.
  const djBlocks = bonus.filter((b) => g.ch(b.col, b.row) === '3');
  const djSeeds: number[] = [];
  for (const b of djBlocks) {
    for (let rs = b.row + 2; rs <= Math.min(g.rows - 1, b.row + HIT_UP); rs++) {
      if (g.solid(b.col, rs - 1)) break;
      if (nodeReach[g.key(b.col, rs)] === REACH_NORMAL) djSeeds.push(g.key(b.col, rs));
    }
  }
  if (djSeeds.length > 0) graph.flood(nodeReach, djSeeds, true, REACH_DJ);
  const reach = graph.cellReach(nodeReach);

  const isReached = (p: Pos, lvl: number): boolean => {
    const v = reach[g.key(p.col, p.row)];
    return v !== REACH_NONE && v <= lvl;
  };
  const djLabel = (col: number): string | null => {
    const before = djBlocks.filter((b) => b.col <= col);
    if (before.length === 0) return null;
    const d = col - before[before.length - 1].col;
    return d <= DJ_SECRET_MAX_DIST ? `bloc « 3 » ${d} colonnes avant` : null;
  };

  if (!isReached(X, REACH_NORMAL)) err(`le vaisseau X (${X.col}, ${X.row}) n'est PAS accessible depuis P`);
  for (const k of checkpoints) {
    if (!g.standable(k.col, k.row)) err(`point de contrôle (${k.col}, ${k.row}) : pas de sol dessous`);
    else if (!isReached(k, REACH_NORMAL)) err(`point de contrôle (${k.col}, ${k.row}) inaccessible`);
    for (let x = k.col - 1; x <= k.col + 1; x++) if (g.hazard(x, k.row)) err(`point de contrôle (${k.col}, ${k.row}) : danger à côté`);
    for (const e of enemies) {
      if (e.kind !== 'f' && Math.abs(e.col - k.col) <= 2 && Math.abs(e.row - k.row) <= 2) {
        warn(`point de contrôle (${k.col}, ${k.row}) : ennemi « ${e.kind} » trop proche`);
      }
    }
  }

  let djCrystals = 0;
  for (const cr of crystals) {
    if (touchable(g, reach, cr.col, cr.row, REACH_NORMAL)) continue;
    if (touchable(g, reach, cr.col, cr.row, REACH_DJ)) {
      djCrystals++;
      const lbl = djLabel(cr.col);
      if (lbl) warn(`cristal (${cr.col}, ${cr.row}) : inaccessible sans double saut [secret double saut, ${lbl}]`);
      else err(`cristal (${cr.col}, ${cr.row}) : seulement avec le double saut, sans bloc « 3 » proche avant`);
    } else {
      err(`cristal (${cr.col}, ${cr.row}) : inaccessible (même avec le double saut)`);
    }
  }
  for (const b of bonus) {
    const ch = g.ch(b.col, b.row);
    if (hittable(g, reach, b.col, b.row, REACH_NORMAL)) continue;
    const lbl = djLabel(b.col);
    if (ch === '?' && lbl && hittable(g, reach, b.col, b.row, REACH_DJ)) {
      djCrystals++;
      warn(`bloc « ? » (${b.col}, ${b.row}) : seulement avec le double saut [secret, ${lbl}]`);
    } else {
      err(`bloc « ${ch} » (${b.col}, ${b.row}) : impossible à frapper par dessous`);
    }
  }

  // Cases debout trop hautes (hors de la vue) atteintes sur le chemin normal.
  let tooHigh = 0;
  for (let c = 0; c < g.cols; c++) for (let r = 0; r < 2; r++) if (reach[g.key(c, r)] === REACH_NORMAL) tooHigh++;
  if (tooHigh > 0) warn(`${tooHigh} case(s) debout accessibles sur les lignes 0-1 (hors de la vue)`);

  // ---- Résumé
  const nC = crystals.length;
  const nQ = bonus.filter((b) => g.ch(b.col, b.row) === '?').length;
  const count = (k: string): number => enemies.filter((e) => e.kind === k).length;
  const powers = bonus.filter((b) => g.ch(b.col, b.row) !== '?').map((b) => `« ${g.ch(b.col, b.row)} » col. ${b.col}`);
  const pureRun = (X.col - P.col) / (RUN_SPEED / TILE);
  // Estimation grossière : course x2,4 (sauts, hésitations) + temps par ennemi et par plateforme mobile.
  const estimate = pureRun * 2.4 + enemies.length * 1.2 + g.movers.length * 2.5;
  let pits = 0;
  for (let c = 0; c < g.cols; c++) {
    if (!g.solid(c, g.rows - 1) && (c === 0 || g.solid(c - 1, g.rows - 1))) pits++;
  }
  rep.notes.push(
    `taille : ${g.cols} x ${g.rows} ; trous : ${pits} ; plateformes mobiles : ${g.movers.length} ` +
      `(dont ${g.movers.filter((m) => m.vertical).length} verticales)`,
  );
  rep.notes.push(`cristaux : ${nC + nQ} (${nC} 'c' + ${nQ} blocs '?'), dont ${djCrystals} secrets double saut`);
  rep.notes.push(
    `ennemis : ${enemies.length} (marcheurs ${count('w')}, volants ${count('f')}, blindés ${count('a')}, ` +
      `cracheurs ${count('p')})`,
  );
  rep.notes.push(
    `points de contrôle : ${checkpoints.length} (colonnes ${checkpoints.map((k) => k.col).join(', ') || '-'}) ; ` +
      `bonus : ${powers.join(', ') || 'aucun'}`,
  );
  rep.notes.push(`durée : course pure ≈ ${Math.round(pureRun)} s, estimation de jeu ≈ ${fmtTime(estimate)}`);

  if (checkpoints.length < 2) warn(`${checkpoints.length} point(s) de contrôle (2 attendus)`);
  if (nC + nQ < 40 || nC + nQ > 60) warn(`${nC + nQ} cristaux (40-60 visés)`);
  if (enemies.length < 18 || enemies.length > 28) warn(`${enemies.length} ennemis (18-28 visés)`);
  if (g.cols < 190 || g.cols > 260) warn(`${g.cols} colonnes (~200-240 visées)`);

  if (showMap) printMap(g, reach, crystals, bonus, rep);
  return rep;
}

// ---------------------------------------------------------------- Carte annotée (--map)

function printMap(g: LevelGrid, reach: Uint8Array, crystals: Pos[], bonus: Pos[], rep: Report): void {
  const out: string[][] = [];
  for (let r = 0; r < g.rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < g.cols; c++) {
      const ch = g.ch(c, r);
      const v = reach[g.key(c, r)];
      if (ch === '.' && v === REACH_NORMAL) line.push(':');
      else if (ch === '.' && v === REACH_DJ) line.push(';');
      else line.push(ch);
    }
    out.push(line);
  }
  for (const cr of crystals) {
    if (!touchable(g, reach, cr.col, cr.row, REACH_NORMAL)) {
      out[cr.row][cr.col] = touchable(g, reach, cr.col, cr.row, REACH_DJ) ? 'd' : '!';
    }
  }
  for (const b of bonus) {
    if (!hittable(g, reach, b.col, b.row, REACH_NORMAL)) out[b.row][b.col] = '%';
  }
  const ruler1: string[] = [];
  const ruler2: string[] = [];
  for (let c = 0; c < g.cols; c++) {
    ruler1.push(c % 10 === 0 ? String(Math.floor(c / 100)) : ' ');
    ruler2.push(c % 10 === 0 ? String(Math.floor(c / 10) % 10) : c % 5 === 0 ? '+' : ' ');
  }
  const chunk = 120;
  const lines: string[] = [];
  for (let c0 = 0; c0 < g.cols; c0 += chunk) {
    lines.push('     ' + ruler1.slice(c0, c0 + chunk).join(''));
    lines.push('     ' + ruler2.slice(c0, c0 + chunk).join(''));
    out.forEach((line, r) => lines.push(`${r.toString().padStart(3)}  ${line.slice(c0, c0 + chunk).join('')}`));
    lines.push('');
  }
  lines.push(
    "     légende : ':' debout atteint, ';' atteint seulement avec le double saut, " +
      "'d' cristal secret (double saut), '!' cristal inaccessible, '%' bloc impossible à frapper",
  );
  rep.notes.push('\n' + lines.join('\n'));
}

// ---------------------------------------------------------------- Programme

let totalErrors = 0;
let totalWarnings = 0;
const ids = only.length > 0 ? only : [...LEVEL_IDS];
for (const id of ids) {
  let level: LevelData;
  try {
    level = getLevel(id);
  } catch (e) {
    console.log(`\n✗ ${id} : ${(e as Error).message}`);
    totalErrors++;
    continue;
  }
  const rep = checkLevel(id, level);
  totalErrors += rep.errors.length;
  totalWarnings += rep.warnings.length;
  console.log(`\n== ${level.name} (${id}, thème ${level.theme}, musique ${level.music}) ==`);
  for (const n of rep.notes) console.log('  ' + n);
  for (const w of rep.warnings) console.log('  ! ' + w);
  for (const e of rep.errors) console.log('  ✗ ' + e);
  console.log(rep.errors.length === 0 ? '  ✓ aucune erreur' : `  ✗ ${rep.errors.length} erreur(s)`);
}
console.log(`\nBilan : ${ids.length} niveau(x), ${totalErrors} erreur(s), ${totalWarnings} avertissement(s).`);
if (totalErrors > 0) process.exitCode = 1;
