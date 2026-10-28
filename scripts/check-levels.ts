/// <reference types="node" />
// Validation des niveaux de plateforme : format, entités, et accessibilité selon DESIGN_RULES.
// Usage (depuis la racine du projet) :
//   node scripts/check-levels.ts            -> tous les niveaux
//   node scripts/check-levels.ts moon       -> un seul niveau
//   node scripts/check-levels.ts --map      -> affiche aussi la carte annotée
// Code de sortie 1 s'il y a au moins une erreur.
//
// Accessibilité : graphe de scripts/lib/reach.ts (positions debout, sauts selon DESIGN_RULES, portes, faisceau
// de la balise, bornes d'arène ouvertes). Les 3 étoiles doivent rester possibles sans les secrets de compétence
// (double saut). Arène de boss : deux bornes '|', le 'M' entre elles, un 'K' juste avant, sol continu.

import { BOSS_IDS, MUSIC_IDS, THEME_IDS } from '../src/core/ids.ts';
import { RADIO } from '../src/core/story.ts';
import { WORLDS } from '../src/core/worlds.ts';
import { LEVEL_ROWS, RUN_SPEED, STARS_RATIO, TILE } from '../src/game2d/constants.ts';
import { getLevel, LEVEL_IDS } from '../src/game2d/levels/index.ts';
import { LEGEND, RADIO_TRIGGERS } from '../src/game2d/levels/types.ts';
import type { LevelData } from '../src/game2d/levels/types.ts';
import { LevelGrid, REACH_DJ, REACH_NONE, REACH_NORMAL, ReachGraph, hittable, touchable } from './lib/reach.ts';
import type { Pos } from './lib/reach.ts';

const BONUS_CHARS = '?123';
/** Nom des blocs bonus dans les messages et la carte (sens complet : LEGEND de levels/types.ts). */
const BONUS_NAMES: Readonly<Record<string, string>> = { '?': 'cristal', '1': 'vitesse', '2': 'bouclier', '3': 'cadence' };
const ENEMY_CHARS = 'wfap';
const VALID_THEMES: readonly string[] = THEME_IDS;
const VALID_MUSIC: readonly string[] = MUSIC_IDS;
/** Part des cristaux qui donne 3 étoiles (seuil partagé avec PlatformScene.finishLevel). */
const STARS3_RATIO = STARS_RATIO.three;
const START_SAFE_COLS = 8;
const VALID_BOSSES: readonly string[] = BOSS_IDS;
/** Arène : largeur bornes comprises, et place du point de contrôle (colonnes avant la première borne). */
const ARENA_MIN_COLS = 16;
const ARENA_MAX_COLS = 22;
const ARENA_K_COLS = 6;
/** Dans l'arène, au-dessus du sol : seulement du vide, le boss, du décor, des plateformes '=' et des cristaux. */
const ARENA_FREE = '.M*=c';
/** Durée estimée d'un combat de mini-boss (s), ajoutée à l'estimation de jeu. */
const BOSS_FIGHT_S = 35;

interface Report {
  errors: string[];
  warnings: string[];
  notes: string[];
}

const args = process.argv.slice(2);
const showMap = args.includes('--map');
const only = args.filter((a) => !a.startsWith('--'));

// ---------------------------------------------------------------- Vérification d'un niveau

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m} min ${sec.toString().padStart(2, '0')} s`;
}

/** Pourcentage à la française : 0.9057 -> « 90,6 % ». */
function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}

/** Bloc bonus lisible : « vitesse « 1 » ». */
function bonusName(ch: string): string {
  return `${BONUS_NAMES[ch] ?? 'inconnu'} « ${ch} »`;
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
  if (level.ending !== undefined && level.ending !== 'exit' && level.ending !== 'guardian') err(`fin inconnue « ${level.ending} »`);

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
  // Sortie : exactement une, Comète 'X' ou balise 'L' ; aucune pour un niveau qui finit par le gardien.
  const ships = find('X');
  const beacons = find('L');
  const exits = [...ships, ...beacons];
  const guardian = level.ending === 'guardian';
  if (starts.length !== 1) err(`${starts.length} départ(s) 'P' (exactement 1 attendu)`);
  if (guardian && exits.length > 0) {
    err(`${exits.length} sortie(s) 'X' / 'L' dans un niveau qui finit par le gardien (ending: 'guardian') : aucune attendue`);
  } else if (!guardian && exits.length !== 1) {
    err(`${exits.length} sortie(s) ('X' : ${ships.length}, 'L' : ${beacons.length}) : exactement une attendue, vaisseau 'X' ou balise 'L'`);
  }
  if (rep.errors.length > 0) return rep;
  const P = starts[0];
  const E: Pos | null = exits.length === 1 ? exits[0] : null;
  const isShip = ships.length === 1;
  const exitName = E ? `${isShip ? 'vaisseau X' : 'balise L'} (${E.col}, ${E.row})` : '';

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

  // ---- Sortie, posée sur un sol plein. Vaisseau : 3x2 à droite et au-dessus de la case ; balise : sa case et
  // toute la colonne au-dessus, vide (le faisceau descend du ciel ; Kaï qui y entre, à toute hauteur, l'active).
  if (E && isShip) {
    if (E.col + 2 >= g.cols) err(`${exitName} : dépasse le bord droit`);
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 2; j++) {
        const c = E.col + k;
        const r = E.row - j;
        if ((k !== 0 || j !== 0) && g.ch(c, r) !== '.') err(`vaisseau X : case (${c}, ${r}) occupée par « ${g.ch(c, r)} »`);
      }
      if (!g.solid(E.col + k, E.row + 1)) err(`vaisseau X : pas de sol plein sous la colonne ${E.col + k}`);
    }
  } else if (E) {
    for (let r = E.row - 1; r >= 0; r--) {
      const ch = g.ch(E.col, r);
      if (ch !== '.') err(`balise L : case (${E.col}, ${r}) occupée par « ${ch} » : la colonne du faisceau reste vide jusqu'en haut`);
    }
    if (!g.solid(E.col, E.row + 1)) err(`${exitName} : pas de sol plein dessous`);
  }
  const arena = checkArena(id, level, g, find('|'), find('M'), checkpoints, E, err, warn, rep.notes);
  // Faisceau de la balise : Kaï y est happé à toute hauteur, rien ne s'atteint au-delà (sauf par une porte).
  const beam = E && !isShip ? E : null;
  const past = (p: Pos): string => (beam && p.col > beam.col ? ', après la balise L (infranchissable)' : '');

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

  // ---- Portes : par paires, posées sur un sol, 2 cases de haut (la case et celle du dessus, vide)
  const doors = g.doors;
  if (doors.length % 2 !== 0) {
    const last = doors[doors.length - 1];
    err(`${doors.length} portes 'D' : nombre impair, la porte (${last.col}, ${last.row}) n'a pas de paire`);
  }
  for (const d of doors) {
    const at = `porte (${d.col}, ${d.row})`;
    if (!g.supported(d.col, d.row)) err(`${at} : pas de sol dessous`);
    const above = g.ch(d.col, d.row - 1);
    if (d.row < 1) err(`${at} : dépasse en haut de la carte (2 cases de haut)`);
    else if (above !== '.') err(`${at} : case du dessus (${d.col}, ${d.row - 1}) occupée par « ${above} »`);
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
  const graph = new ReachGraph(g, beam);
  const nodeReach = new Uint8Array(graph.total);
  graph.flood(nodeReach, [g.key(P.col, P.row)], false, REACH_NORMAL);
  // Compétence « double saut » : plus aucun bloc ne la donne, une fois apprise elle sert partout. Second
  // parcours depuis toutes les positions atteintes normalement ; ce qu'il ajoute = secrets de compétence.
  const skillSeeds: number[] = [];
  for (let id = 0; id < graph.total; id++) if (nodeReach[id] === REACH_NORMAL) skillSeeds.push(id);
  graph.flood(nodeReach, skillSeeds, true, REACH_DJ);
  const reach = graph.cellReach(nodeReach);

  const isReached = (p: Pos, lvl: number): boolean => {
    const v = reach[g.key(p.col, p.row)];
    return v !== REACH_NONE && v <= lvl;
  };

  if (E && !isReached(E, REACH_NORMAL)) err(`${exitName} : sortie PAS accessible depuis P`);
  for (const k of checkpoints) {
    if (!g.standable(k.col, k.row)) err(`point de contrôle (${k.col}, ${k.row}) : pas de sol dessous`);
    else if (!isReached(k, REACH_NORMAL)) err(`point de contrôle (${k.col}, ${k.row}) inaccessible${past(k)}`);
    for (let x = k.col - 1; x <= k.col + 1; x++) if (g.hazard(x, k.row)) err(`point de contrôle (${k.col}, ${k.row}) : danger à côté`);
    for (const e of enemies) {
      if (e.kind !== 'f' && Math.abs(e.col - k.col) <= 2 && Math.abs(e.row - k.row) <= 2) {
        warn(`point de contrôle (${k.col}, ${k.row}) : ennemi « ${e.kind} » trop proche`);
      }
    }
  }
  for (const d of doors) {
    if (!isReached(d, REACH_DJ)) warn(`porte (${d.col}, ${d.row}) inaccessible (même avec le double saut)${past(d)}`);
  }

  // Cristaux (posés 'c' et blocs '?') : atteints normalement, secrets de compétence, ou erreur.
  let openCrystals = 0;
  let skillCrystals = 0;
  for (const cr of crystals) {
    if (touchable(g, reach, beam, cr.col, cr.row, REACH_NORMAL)) {
      openCrystals++;
    } else if (touchable(g, reach, beam, cr.col, cr.row, REACH_DJ)) {
      skillCrystals++;
      warn(`cristal (${cr.col}, ${cr.row}) : seulement avec le double saut [secret de compétence]`);
    } else {
      err(`cristal (${cr.col}, ${cr.row}) : inaccessible (même avec le double saut)${past(cr)}`);
    }
  }
  for (const b of bonus) {
    const ch = g.ch(b.col, b.row);
    if (hittable(g, reach, b.col, b.row, REACH_NORMAL)) {
      if (ch === '?') openCrystals++;
    } else if (hittable(g, reach, b.col, b.row, REACH_DJ)) {
      if (ch === '?') skillCrystals++;
      warn(`bloc ${bonusName(ch)} (${b.col}, ${b.row}) : seulement avec le double saut [secret de compétence]`);
    } else {
      err(`bloc ${bonusName(ch)} (${b.col}, ${b.row}) : impossible à frapper par dessous (même avec le double saut)${past(b)}`);
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
  const powers = bonus.filter((b) => g.ch(b.col, b.row) !== '?').map((b) => `${bonusName(g.ch(b.col, b.row))} col. ${b.col}`);
  // Sans sortie (gardien) : course jusqu'au bout de la carte.
  const pureRun = ((E ? E.col : g.cols - 1) - P.col) / (RUN_SPEED / TILE);
  // Estimation grossière : course x2,4 (sauts, hésitations) + temps par ennemi et par plateforme mobile + combat.
  const estimate = pureRun * 2.4 + enemies.length * 1.2 + g.movers.length * 2.5 + (arena ? BOSS_FIGHT_S : 0);
  let pits = 0;
  for (let c = 0; c < g.cols; c++) {
    if (!g.solid(c, g.rows - 1) && (c === 0 || g.solid(c - 1, g.rows - 1))) pits++;
  }
  rep.notes.push(
    `taille : ${g.cols} x ${g.rows} ; trous : ${pits} ; plateformes mobiles : ${g.movers.length} ` +
      `(dont ${g.movers.filter((m) => m.vertical).length} verticales)`,
  );
  rep.notes.push(`cristaux : ${nC + nQ} (${nC} 'c' + ${nQ} blocs '?'), dont ${skillCrystals} secrets de compétence`);
  // 3 étoiles sans compétence : on reviendra chercher les secrets plus tard. Même calcul que le moteur
  // (cristaux ramassés / total ≥ STARS3_RATIO), `need` = le plus petit nombre de cristaux qui suffit.
  const total = nC + nQ;
  let need = 0;
  while (need < total && need / total < STARS3_RATIO) need++;
  const openRatio = total > 0 ? openCrystals / total : 1;
  const stars3 = openRatio >= STARS3_RATIO;
  rep.notes.push(
    `3 étoiles sans compétence : ${openCrystals}/${total} cristaux accessibles (${fmtPct(openRatio)}), ` +
      `${need} requis (${fmtPct(STARS3_RATIO)}) ${stars3 ? '✓' : '✗'}`,
  );
  if (!stars3) {
    err(`3 étoiles impossibles sans compétence : ${openCrystals} cristaux sur ${total} hors secrets, ${need} requis`);
  }
  rep.notes.push(
    `ennemis : ${enemies.length} (marcheurs ${count('w')}, volants ${count('f')}, blindés ${count('a')}, ` +
      `cracheurs ${count('p')})`,
  );
  rep.notes.push(
    `points de contrôle : ${checkpoints.length} (colonnes ${checkpoints.map((k) => k.col).join(', ') || '-'}) ; ` +
      `bonus : ${powers.join(', ') || 'aucun'}`,
  );
  rep.notes.push(`sortie : ${E ? exitName : 'aucune, la défaite du gardien termine le niveau'}`);
  if (doors.length > 0) {
    const pairs: string[] = [];
    for (let i = 0; i + 1 < doors.length; i += 2) {
      const a = doors[i];
      const b = doors[i + 1];
      pairs.push(`(${a.col}, ${a.row}) ↔ (${b.col}, ${b.row})`);
    }
    rep.notes.push(`portes : ${doors.length} (paires : ${pairs.join(', ') || '-'})`);
  }
  checkRadio(level, g.cols, P, E, err, warn, rep.notes);
  rep.notes.push(
    `durée : course pure ≈ ${Math.round(pureRun)} s, estimation de jeu ≈ ${fmtTime(estimate)}${arena ? ` (combat ≈ ${BOSS_FIGHT_S} s compris)` : ''}`,
  );

  if (checkpoints.length < 2) warn(`${checkpoints.length} point(s) de contrôle (2 attendus)`);
  if (nC + nQ < 40 || nC + nQ > 60) warn(`${nC + nQ} cristaux (40-60 visés)`);
  if (enemies.length < 18 || enemies.length > 28) warn(`${enemies.length} ennemis (18-28 visés)`);
  if (g.cols < 190 || g.cols > 260) warn(`${g.cols} colonnes (~200-240 visées)`);

  if (showMap) printMap(g, reach, beam, crystals, bonus, rep);
  return rep;
}

// ---------------------------------------------------------------- Arène de boss

/**
 * Aucune arène, ou : deux bornes '|' sur une même ligne (colonne vide au-dessus : la barrière monte jusqu'en haut),
 * de ARENA_MIN_COLS à ARENA_MAX_COLS colonnes bornes comprises, sol plein continu de l'une à l'autre, intérieur
 * libre (ARENA_FREE), un 'M' sur ce sol entre elles, un 'K' dans les ARENA_K_COLS colonnes avant la première, la
 * sortie après la seconde ; LevelData.boss connu et le même que celui de l'étape dans core/worlds.ts. Renvoie les
 * bornes, ou null. L'accessibilité au-delà (la victoire rouvre la seconde borne) est celle du graphe : '|' y est vide.
 */
function checkArena(
  id: string,
  level: LevelData,
  g: LevelGrid,
  bounds: Pos[],
  bosses: Pos[],
  checkpoints: readonly Pos[],
  E: Pos | null,
  err: (m: string) => void,
  warn: (m: string) => void,
  notes: string[],
): { col0: number; col1: number } | null {
  if (level.boss !== undefined && !VALID_BOSSES.includes(level.boss)) err(`boss inconnu « ${String(level.boss)} » (${VALID_BOSSES.join(', ')})`);
  for (const w of WORLDS) {
    for (const s of w.stages) {
      if (s.levelId === id && (s.boss ?? null) !== (level.boss ?? null)) {
        err(`boss « ${level.boss ?? 'aucun'} » différent de celui de l'étape ${s.id} (core/worlds.ts : « ${s.boss ?? 'aucun'} »)`);
      }
    }
  }
  if (bounds.length === 0 && bosses.length === 0) {
    if (level.boss !== undefined) err(`boss « ${level.boss} » sans arène (deux bornes '|' et un 'M' attendus)`);
    return null;
  }
  if (bounds.length !== 2 || bosses.length !== 1) {
    err(`arène : ${bounds.length} borne(s) '|' et ${bosses.length} boss 'M' (2 bornes et 1 boss attendus)`);
    return null;
  }
  if (level.boss === undefined) err('arène sans LevelData.boss');
  bounds.sort((p, q) => p.col - q.col);
  const [a, b] = bounds;
  const M = bosses[0];
  const row = a.row;
  const label = `arène ${a.col}-${b.col}`;
  if (b.row !== row) err(`${label} : bornes sur des lignes différentes (${a.row} et ${b.row})`);
  const cols = b.col - a.col + 1;
  if (cols < ARENA_MIN_COLS || cols > ARENA_MAX_COLS) {
    err(`${label} : ${cols} colonnes, bornes comprises (${ARENA_MIN_COLS} à ${ARENA_MAX_COLS} attendues)`);
  }
  for (const p of bounds) {
    for (let r = p.row - 1; r >= 0; r--) {
      if (g.ch(p.col, r) === '.') continue;
      err(`borne (${p.col}, ${p.row}) : case (${p.col}, ${r}) occupée par « ${g.ch(p.col, r)} » : la barrière monte jusqu'en haut`);
      break;
    }
  }
  for (let c = a.col; c <= b.col; c++) {
    if (!g.solid(c, row + 1)) err(`${label} : pas de sol plein sous la colonne ${c} (sol continu attendu)`);
    if (c === a.col || c === b.col) continue;
    for (let r = 0; r <= row; r++) {
      const ch = g.ch(c, r);
      if (!ARENA_FREE.includes(ch)) err(`${label} : « ${ch} » en (${c}, ${r}) (dans l'arène, au-dessus du sol : « ${ARENA_FREE} » seulement)`);
    }
  }
  if (M.col <= a.col || M.col >= b.col || M.row !== row) {
    err(`boss M (${M.col}, ${M.row}) : à poser sur le sol de l'arène, entre ses bornes`);
  } else if (M.col - a.col < 6) {
    warn(`boss M (${M.col}, ${M.row}) : à ${M.col - a.col} colonnes de l'entrée de l'arène`);
  }
  const ks = checkpoints.filter((k) => k.col >= a.col - ARENA_K_COLS && k.col < a.col);
  if (ks.length === 0) {
    err(`${label} : aucun point de contrôle 'K' dans les ${ARENA_K_COLS} colonnes avant la première borne (${a.col - ARENA_K_COLS}-${a.col - 1})`);
  }
  if (E && E.col <= b.col) err(`sortie (${E.col}, ${E.row}) avant la seconde borne (${b.col}) : la balise vient après l'arène`);
  notes.push(
    `arène : bornes ${a.col} et ${b.col} (${cols} colonnes), boss ${level.boss ?? '?'} en (${M.col}, ${M.row}), ` +
      `point de contrôle ${ks.map((k) => k.col).join(', ') || '-'}`,
  );
  return { col0: a.col, col1: b.col };
}

// ---------------------------------------------------------------- Radio de LUMA

/**
 * LevelData.radio : messages connus de core/story.ts, chacun une fois ; fenêtres [col0, col1] d'entiers dans la
 * carte (une fenêtre au-delà de la sortie ne joue jamais : avertissement) ; déclencheurs de RADIO_TRIGGERS.
 */
function checkRadio(
  level: LevelData,
  cols: number,
  P: Pos,
  E: Pos | null,
  err: (m: string) => void,
  warn: (m: string) => void,
  notes: string[],
): void {
  if (level.radio === undefined) return;
  if (!Array.isArray(level.radio)) {
    err('radio : liste attendue');
    return;
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of level.radio as readonly unknown[]) {
    const r = (raw ?? {}) as { id?: unknown; cols?: unknown; on?: unknown };
    const id = String(r.id);
    const label = `radio « ${id} »`;
    if (typeof r.id !== 'string' || !Object.prototype.hasOwnProperty.call(RADIO, r.id)) err(`${label} : message inconnu de core/story.ts`);
    if (seen.has(id)) err(`${label} : en double (chaque message joue une fois par partie)`);
    seen.add(id);
    if (r.cols !== undefined && r.on !== undefined) {
      err(`${label} : « cols » ou « on », pas les deux`);
    } else if (r.cols !== undefined) {
      const w = r.cols as unknown[];
      const ok = Array.isArray(w) && w.length === 2 && w.every((c) => Number.isInteger(c));
      const [c0, c1] = ok ? (w as number[]) : [0, -1];
      if (!ok) err(`${label} : « cols » doit être [col0, col1] (entiers)`);
      else if (c0 < 0 || c1 >= cols || c0 > c1) err(`${label} : colonnes ${c0}-${c1} hors de la carte (0-${cols - 1}) ou à l'envers`);
      else if (E && c0 > E.col) warn(`${label} : colonnes ${c0}-${c1} après la sortie (${E.col}) : jamais atteintes`);
      else if (c1 < P.col) warn(`${label} : colonnes ${c0}-${c1} avant le départ (${P.col}) : sautées d'emblée`);
      parts.push(`${id} ${ok ? `${c0}-${c1}` : '?'}`);
    } else if (r.on !== undefined) {
      if (!(RADIO_TRIGGERS as readonly unknown[]).includes(r.on)) err(`${label} : déclencheur inconnu « ${String(r.on)} » (${RADIO_TRIGGERS.join(', ')})`);
      parts.push(`${id} (${String(r.on)})`);
    } else {
      err(`${label} : ni « cols » ni « on »`);
    }
  }
  notes.push(`radio : ${parts.join(', ') || 'aucun message'}`);
}

// ---------------------------------------------------------------- Carte annotée (--map)

function printMap(g: LevelGrid, reach: Uint8Array, beam: Pos | null, crystals: Pos[], bonus: Pos[], rep: Report): void {
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
    if (!touchable(g, reach, beam, cr.col, cr.row, REACH_NORMAL)) {
      out[cr.row][cr.col] = touchable(g, reach, beam, cr.col, cr.row, REACH_DJ) ? 'd' : '!';
    }
  }
  for (const b of bonus) {
    if (!hittable(g, reach, b.col, b.row, REACH_NORMAL)) {
      out[b.row][b.col] = hittable(g, reach, b.col, b.row, REACH_DJ) ? '&' : '%';
    }
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
    "     légende : ':' debout atteint, ';' atteint seulement avec le double saut (compétence), " +
      "'d' cristal secret de compétence, '!' cristal inaccessible, '&' bloc frappé seulement avec le double saut, " +
      "'%' bloc impossible à frapper, 'D' porte",
    '     blocs bonus : ' + [...BONUS_CHARS].map((ch) => `'${ch}' ${BONUS_NAMES[ch]}`).join(', '),
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
