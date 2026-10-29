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
// (double saut). Arène de boss : deux bornes '|', le 'M' entre elles, un 'K' juste avant, sol continu. Radio :
// messages de core/story.ts, et file de la radio simulée au rythme de l'estimation de durée (aucun message chassé,
// tutoriel ouvert au plus 3 s après le passage de Kaï, bulle fermée pendant les rebonds sur un champignon), puis à
// pleine course (pour information). Champignons 'o' : arcs de rebond du graphe (MUSHROOM_RULES, écourtées sous un
// plafond). Événements du décor (LevelData.events) : fenêtres, tronc posé sur un sol
// plein (couché, ses cases sont pleines pour le graphe : l'état où Kaï le trouve), pluie au-dessus d'un sol.
// Naufragé 'N' : capsule à sa gauche, récompense d'équipage de l'étape, sauvetage garanti (sans la porte voisine,
// la sortie est hors d'atteinte, même en double saut). Repères (taille, cristaux, ennemis, points de contrôle, durée)
// selon la partie du monde de l'étape (core/worlds.ts).

import type { BossId, StagePart } from '../src/core/types.ts';
import { BOSS_IDS, MUSIC_IDS, THEME_IDS } from '../src/core/ids.ts';
import { RADIO, RADIO_TIMING, radioHoldS, typingDuration } from '../src/core/story.ts';
import type { RadioMessage } from '../src/core/story.ts';
import { WORLDS } from '../src/core/worlds.ts';
import { GRAVITY, LEVEL_ROWS, MUSHROOM_BOUNCE_HELD_TILES, RUN_SPEED, STARS_RATIO, TILE } from '../src/game2d/constants.ts';
import { getLevel, LEVEL_IDS } from '../src/game2d/levels/index.ts';
import { CREATURE_DISTANCES, LEGEND, LEVEL_EVENT_KINDS, LEVEL_STARTS, RADIO_TRIGGERS } from '../src/game2d/levels/types.ts';
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
/** Dans l'arène, au-dessus du sol : seulement du vide, le boss, du décor, des plateformes '=', des cristaux et des
 *  champignons. */
const ARENA_FREE = '.M*=co';
/** Durée estimée d'un combat de boss (s), ajoutée à l'estimation de jeu (joueur moyen ; mini-boss en 4 touches, l'IA du
 *  diag boss-bot les gagne en ≈ 12 et 17 s ; gardien en 6 touches, une par fenêtre du cœur, cycles de ≈ 9 s). */
const BOSS_FIGHT_S: Readonly<Record<BossId, number>> = { blobKing: 25, beetleTitan: 30, whale: 60 };
/** Estimation de jeu : course pure x RUN_FACTOR (sauts, hésitations), plus ennemis, plateformes mobiles, combat. */
const RUN_FACTOR = 2.4;
/** Message de la radio trop long pour la bulle (caractères). */
const RADIO_MAX_CHARS = 110;
/** Message de tutoriel ouvert trop tard : Kaï a quitté sa fenêtre (ou passé son déclencheur) depuis plus longtemps (s,
 *  file simulée au rythme de référence). */
const RADIO_LATE_S = 3;
/** Rebond tenu sur un champignon, en l'air (s) : au sommet, la caméra garde la tête de Kaï en haut de la vue, sous la
 *  bulle de la radio. Fondu de la bulle à sa fermeture (s, story/styles.ts). */
const BOUNCE_AIR_S = 2 * Math.sqrt((2 * MUSHROOM_BOUNCE_HELD_TILES * TILE) / GRAVITY);
const BUBBLE_FADE_S = 0.16;
/** Arrivée en Comète (engine/exit.ts, ShipArrival) : vaisseau posé sur les colonnes P-4 à P-1. */
const ARRIVAL_SHIP_COLS = 4;
/** Arrivée (LevelData.start, ARRIVAL_MS d'engine/exit.ts) : Kaï figé, la radio parle déjà (s). */
const ARRIVAL_S = 0.7;
/** Capsule du naufragé : cases à sa gauche (engine/npc.ts). Porte qui garde le sauvetage : à cette distance. */
const CAPSULE_COLS = 2;
const CASTAWAY_DOOR_COLS = 1;

/** Repères d'un niveau selon sa partie dans le monde (1 et 2 : ≈ 250 et 230 colonnes ; 3 : ≈ 160 + l'arène, un seul
 *  point de contrôle, juste avant l'arène du gardien). */
interface PartLimits {
  cols: readonly [number, number];
  crystals: readonly [number, number];
  enemies: readonly [number, number];
  checkpoints: readonly [number, number];
  /** Durée estimée, combat compris (min). */
  minutes: readonly [number, number];
}
const PART_LIMITS: Readonly<Record<Exclude<StagePart, 4>, PartLimits>> = {
  1: { cols: [190, 260], crystals: [40, 60], enemies: [18, 28], checkpoints: [2, 4], minutes: [2, 3] },
  2: { cols: [190, 250], crystals: [40, 60], enemies: [18, 30], checkpoints: [2, 4], minutes: [2, 3] },
  3: { cols: [140, 200], crystals: [30, 50], enemies: [14, 26], checkpoints: [1, 1], minutes: [2, 3.5] },
};

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
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total - m * 60;
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
  if (level.start !== undefined && !(LEVEL_STARTS as readonly string[]).includes(level.start)) {
    err(`arrivée inconnue « ${String(level.start)} » (${LEVEL_STARTS.join(', ')})`);
  }
  if (level.creature !== undefined && !(CREATURE_DISTANCES as readonly string[]).includes(level.creature)) {
    err(`créature inconnue « ${String(level.creature)} » (${CREATURE_DISTANCES.join(', ')})`);
  }
  if (!Number.isInteger(level.parTimeS) || level.parTimeS <= 0) err(`parTimeS « ${String(level.parTimeS)} » : nombre entier de secondes attendu`);
  // Partie du monde (repères) : celle de l'étape qui joue ce niveau.
  let part: Exclude<StagePart, 4> = 1;
  const stage = WORLDS.flatMap((w) => w.stages).find((st) => st.levelId === id);
  if (!stage) warn("niveau joué par aucune étape de core/worlds.ts : repères d'un niveau 1");
  else if (stage.part === 4) err(`étape ${stage.id} : partie 4 (vol) pour un niveau de plateforme`);
  else part = stage.part;
  const limits = PART_LIMITS[part];

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

  // Événements du décor ; le tronc couché bouche ses cases (graphe et suite des vérifications).
  const trunkCells = checkEvents(level, new LevelGrid(map), err, warn, rep.notes);
  const g = new LevelGrid(trunkCells.length > 0 ? withSolid(map, trunkCells) : map);
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

  // ---- Décor ; glyphes sur le mur du fond d'une salle close (ailleurs, ils seraient dessinés sur le ciel).
  for (const d of find('*')) {
    if (!g.solid(d.col, d.row + 1)) warn(`décor (${d.col}, ${d.row}) : ne repose pas sur un sol plein`);
  }
  const glyphs = find('G');
  if (glyphs.length > 0) {
    const enclosed = enclosedCells(g);
    for (const p of glyphs) {
      if (!enclosed[g.key(p.col, p.row)]) err(`glyphe (${p.col}, ${p.row}) hors d'une salle close : il serait dessiné sur le ciel`);
    }
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

  // ---- Départ : zone sûre ; arrivée en Comète : elle se pose derrière P (sol plein, place libre).
  if (!g.standable(P.col, P.row)) err(`départ P (${P.col}, ${P.row}) : pas de sol dessous`);
  const shipStart = level.start === 'ship';
  if (shipStart && P.col < ARRIVAL_SHIP_COLS) {
    err(`arrivée en Comète : départ P en colonne ${P.col} (${ARRIVAL_SHIP_COLS} colonnes libres à gauche attendues)`);
  }
  if (shipStart) {
    for (let c = Math.max(0, P.col - ARRIVAL_SHIP_COLS); c < P.col; c++) {
      if (!g.solid(c, P.row + 1)) err(`arrivée en Comète : pas de sol plein sous la colonne ${c}`);
      for (const r of [P.row, P.row - 1]) {
        if (g.solid(c, r) || g.hazard(c, r)) err(`arrivée en Comète : case (${c}, ${r}) occupée par « ${g.ch(c, r)} »`);
      }
    }
  }
  for (let c = P.col; c < P.col + START_SAFE_COLS; c++) {
    if (!g.standable(c, P.row) || g.bounce(c, P.row)) {
      err(`départ : la colonne ${c} n'est pas un sol plat et sûr (${START_SAFE_COLS} colonnes sûres requises, sans champignon)`);
      break;
    }
  }
  const safeL = Math.max(0, P.col - (shipStart ? ARRIVAL_SHIP_COLS : 2));
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

  const castaway = checkCastaway(g, find('N'), stage, P, E, beam, reach, err, rep.notes);

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
  // Estimation grossière : course x RUN_FACTOR (sauts, hésitations) + temps par ennemi et par plateforme mobile + combat.
  const fightS = arena && level.boss !== undefined && VALID_BOSSES.includes(level.boss) ? BOSS_FIGHT_S[level.boss] : 0;
  const estimate = pureRun * RUN_FACTOR + enemies.length * 1.2 + g.movers.length * 2.5 + fightS;
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
  if (glyphs.length > 0) rep.notes.push(`glyphes : ${glyphs.length} (${glyphs.map((p) => `${p.col},${p.row}`).join(' ')})`);
  const mushrooms = find('o');
  if (mushrooms.length > 0) rep.notes.push(`champignons : ${mushrooms.length} (${mushrooms.map((p) => `${p.col},${p.row}`).join(' ')})`);
  if (doors.length > 0) {
    const pairs: string[] = [];
    for (let i = 0; i + 1 < doors.length; i += 2) {
      const a = doors[i];
      const b = doors[i + 1];
      pairs.push(`(${a.col}, ${a.row}) ↔ (${b.col}, ${b.row})`);
    }
    rep.notes.push(`portes : ${doors.length} (paires : ${pairs.join(', ') || '-'})`);
  }
  checkRadio(level, g.cols, P, E, checkpoints, arena, mushrooms, castaway, err, warn, rep.notes);
  rep.notes.push(
    `durée : course pure ≈ ${Math.round(pureRun)} s, estimation de jeu ≈ ${fmtTime(estimate)}` +
      `${fightS > 0 ? ` (combat ≈ ${fightS} s compris)` : ''} ; temps de référence ${level.parTimeS} s`,
  );

  // Repères de la partie du monde.
  const inRange = (v: number, r: readonly [number, number]): boolean => v >= r[0] && v <= r[1];
  const aim = `repères d'un niveau ${part}`;
  if (!inRange(checkpoints.length, limits.checkpoints)) {
    const [k0, k1] = limits.checkpoints;
    warn(`${checkpoints.length} point(s) de contrôle (${k0 === k1 ? k0 : `${k0}-${k1}`} : ${aim})`);
  }
  if (!inRange(nC + nQ, limits.crystals)) warn(`${nC + nQ} cristaux (${limits.crystals.join('-')} : ${aim})`);
  if (!inRange(enemies.length, limits.enemies)) warn(`${enemies.length} ennemis (${limits.enemies.join('-')} : ${aim})`);
  if (!inRange(g.cols, limits.cols)) warn(`${g.cols} colonnes (${limits.cols.join('-')} : ${aim})`);
  if (!inRange(estimate / 60, limits.minutes)) {
    warn(`durée estimée ${fmtTime(estimate)} (${limits.minutes.join(' à ').replace('.', ',')} min : ${aim})`);
  }
  if (level.parTimeS < estimate || level.parTimeS > 2 * estimate) {
    warn(`temps de référence ${level.parTimeS} s : entre l'estimation de jeu et son double attendu (${Math.round(estimate)}-${Math.round(2 * estimate)} s)`);
  }

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

// ---------------------------------------------------------------- Événements du décor

/** Carte dont les cases `cells` ([col, ligne]) sont pleines ('B'). */
function withSolid(map: readonly string[], cells: readonly (readonly [number, number])[]): string[] {
  const rows = map.map((line) => line.split(''));
  for (const [c, r] of cells) if (r >= 0 && r < rows.length && c >= 0 && c < rows[r].length) rows[r][c] = 'B';
  return rows.map((line) => line.join(''));
}

/** Fenêtre [col0, col1] d'entiers dans la carte, à l'endroit ; null sinon (erreur signalée). */
function cols2(v: unknown, cols: number, label: string, what: string, err: (m: string) => void): [number, number] | null {
  const ok = Array.isArray(v) && v.length === 2 && v.every((c) => Number.isInteger(c));
  if (!ok) {
    err(`${label} : « ${what} » doit être [col0, col1] (entiers)`);
    return null;
  }
  const [c0, c1] = v as number[];
  if (c0 < 0 || c1 >= cols || c0 > c1) {
    err(`${label} : ${what} ${c0}-${c1} hors de la carte (0-${cols - 1}) ou à l'envers`);
    return null;
  }
  return [c0, c1];
}

/**
 * LevelData.events : genres connus, fenêtres dans la carte (après le départ, avant la sortie), et pour une secousse
 * le tronc : souche et fût (4 x 2 cases à partir de la souche, celle-ci sur la ligne du bas) vides, sur un sol plein
 * continu, la fenêtre finie avant lui (Kaï pris dessous serait posé dessus) ; pour la pluie, ses colonnes avec un sol
 * plein. Renvoie les cases du tronc couché (pleines pour le graphe).
 */
function checkEvents(level: LevelData, g: LevelGrid, err: (m: string) => void, warn: (m: string) => void, notes: string[]): [number, number][] {
  const cells: [number, number][] = [];
  if (level.events === undefined) return cells;
  if (!Array.isArray(level.events)) {
    err('événements : liste attendue');
    return cells;
  }
  let pCol = -1;
  let exitCol = -1;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const ch = g.ch(c, r);
      if (ch === 'P') pCol = c;
      if (ch === 'X' || ch === 'L') exitCol = c;
    }
  }
  const NAMES: Readonly<Record<string, string>> = { shadow: 'ombre', quake: 'secousse', spores: 'spores' };
  const parts: string[] = [];
  (level.events as readonly unknown[]).forEach((raw, i) => {
    const e = (raw ?? {}) as { kind?: unknown; cols?: unknown; trunk?: unknown; rain?: unknown };
    const kind = String(e.kind);
    const label = `événement n°${i} « ${kind} »`;
    if (!(LEVEL_EVENT_KINDS as readonly string[]).includes(kind)) {
      err(`${label} : genre inconnu (${LEVEL_EVENT_KINDS.join(', ')})`);
      return;
    }
    const w = cols2(e.cols, g.cols, label, 'cols', err);
    if (!w) return;
    if (exitCol >= 0 && w[0] > exitCol) warn(`${label} : colonnes ${w[0]}-${w[1]} après la sortie (${exitCol}) : jamais atteintes`);
    else if (pCol >= 0 && w[1] < pCol) warn(`${label} : colonnes ${w[0]}-${w[1]} avant le départ (${pCol}) : sautées d'emblée`);
    let extra = '';
    if (kind === 'quake') {
      const t = e.trunk as unknown[];
      if (!Array.isArray(t) || t.length !== 2 || !t.every((v) => Number.isInteger(v))) {
        err(`${label} : « trunk » doit être [col, ligne] (case de la souche)`);
        return;
      }
      const [tc, tr] = t as number[];
      const at = `tronc (${tc}, ${tr})`;
      if (tc < 0 || tc + 3 >= g.cols || tr < 1 || tr >= g.rows - 1) {
        err(`${label} : ${at} hors de la carte (4 colonnes à partir de la souche, 2 lignes, sol dessous)`);
        return;
      }
      const lying: [number, number][] = [[tc, tr]];
      for (let r = tr - 1; r <= tr; r++) for (let c = tc + 1; c <= tc + 3; c++) lying.push([c, r]);
      for (const [c, r] of lying) {
        if (g.ch(c, r) !== '.') err(`${label} : ${at}, case (${c}, ${r}) occupée par « ${g.ch(c, r)} » (vide attendue : il s'y couche)`);
      }
      for (let c = tc; c <= tc + 3; c++) if (!g.solid(c, tr + 1)) err(`${label} : ${at}, pas de sol plein sous la colonne ${c}`);
      // Debout (décor, 3 colonnes sur 4 lignes) : dessiné par-dessus ce qui serait plein.
      standing: for (let r = tr - 3; r <= tr; r++) {
        for (let c = tc; c <= tc + 2; c++) {
          if (g.solid(c, r)) {
            warn(`${label} : ${at} debout, son dessin couvre la case pleine (${c}, ${r})`);
            break standing;
          }
        }
      }
      if (w[1] > tc - 2) warn(`${label} : fenêtre ${w[0]}-${w[1]} trop près du tronc (${tc}) : Kaï pourrait être dessous à sa chute`);
      cells.push(...lying);
      extra = ` (tronc ${tc},${tr})`;
    } else if (kind === 'spores') {
      const rain = cols2(e.rain, g.cols, label, 'rain', err);
      if (!rain) return;
      let ground = 0;
      for (let c = rain[0]; c <= rain[1]; c++) {
        for (let r = 1; r < g.rows; r++) {
          if (g.solid(c, r) && !g.solid(c, r - 1)) {
            ground++;
            break;
          }
        }
      }
      if (ground === 0) err(`${label} : pluie ${rain[0]}-${rain[1]} sans aucun sol plein (les spores tomberaient dans le vide)`);
      if (rain[1] < w[0]) warn(`${label} : pluie ${rain[0]}-${rain[1]} derrière la fenêtre ${w[0]}-${w[1]}`);
      extra = ` (pluie ${rain[0]}-${rain[1]})`;
    }
    parts.push(`${NAMES[kind]} ${w[0]}-${w[1]}${extra}`);
  });
  notes.push(`événements : ${parts.join(', ') || 'aucun'}`);
  return cells;
}

// ---------------------------------------------------------------- Naufragé

/**
 * Naufragé 'N' (au plus un) : debout sur un sol, atteint ; sa capsule sur les CAPSULE_COLS cases vides à sa gauche
 * (2 lignes, sol plein dessous) ; l'étape qui joue le niveau donne un équipier (rewards de core/worlds.ts), et
 * inversement. Sauvetage garanti : une porte reliée sur sa ligne, à CASTAWAY_DOOR_COLS colonne (l'appui Haut devant
 * elle le secourt d'abord, engine/npc.ts), et sans le passage de cette porte, la sortie est hors d'atteinte, même en
 * double saut (borne haute du graphe, ReachGraph `bound`). Renvoie sa case, ou null.
 */
function checkCastaway(
  g: LevelGrid,
  found: Pos[],
  stage: { readonly id: string; readonly rewards?: readonly { readonly kind: string }[] } | undefined,
  P: Pos,
  E: Pos | null,
  beam: Pos | null,
  reach: Uint8Array,
  err: (m: string) => void,
  notes: string[],
): Pos | null {
  const crew = !!stage && !!stage.rewards && stage.rewards.some((r) => r.kind === 'crew');
  if (found.length === 0) {
    if (crew && stage) err(`étape ${stage.id} : récompense d'équipage sans naufragé 'N' à secourir`);
    return null;
  }
  if (found.length > 1) err(`${found.length} naufragés 'N' (un au plus)`);
  const N = found[0];
  const at = `naufragé N (${N.col}, ${N.row})`;
  if (!crew) err(`${at} : l'étape ${stage ? stage.id : '?'} ne donne aucun équipier (rewards de core/worlds.ts)`);
  if (!g.standable(N.col, N.row)) err(`${at} : pas de sol dessous`);
  else if (reach[g.key(N.col, N.row)] !== REACH_NORMAL) err(`${at} : inaccessible`);
  for (let c = N.col - CAPSULE_COLS; c < N.col; c++) {
    for (const r of [N.row, N.row - 1]) if (g.ch(c, r) !== '.') err(`${at} : capsule, case (${c}, ${r}) occupée par « ${g.ch(c, r)} »`);
    if (!g.solid(c, N.row + 1)) err(`${at} : capsule, pas de sol plein sous la colonne ${c}`);
  }
  const guards = g.doors.filter((d) => d.row === N.row && Math.abs(d.col - N.col) <= CASTAWAY_DOOR_COLS && g.doorLink.has(g.key(d.col, d.row)));
  if (guards.length === 0) {
    err(`${at} : aucune porte reliée à ${CASTAWAY_DOOR_COLS} colonne sur sa ligne (sauvetage garanti : elle seule mène à la sortie)`);
  } else if (E) {
    // Sans le passage des portes voisines (dans les deux sens), la sortie doit rester hors d'atteinte, même avec la
    // borne haute du graphe (saut et double saut à leur hauteur exacte, pas les règles prudentes du level design).
    const skip = new Set<number>();
    for (const d of guards) {
      const k = g.key(d.col, d.row);
      skip.add(k);
      skip.add(g.doorLink.get(k) as number);
    }
    const graph = new ReachGraph(g, beam, skip, true);
    const nodes = new Uint8Array(graph.total);
    graph.flood(nodes, [g.key(P.col, P.row)], true, REACH_NORMAL);
    if (graph.cellReach(nodes)[g.key(E.col, E.row)] !== REACH_NONE) {
      err(`${at} : sauvetage non garanti, la sortie s'atteint sans la porte (${guards[0].col}, ${guards[0].row}) voisine du naufragé`);
    }
  }
  notes.push(
    `naufragé : (${N.col}, ${N.row}), capsule ${N.col - CAPSULE_COLS}-${N.col - 1}, ` +
      `porte voisine ${guards.map((d) => `(${d.col}, ${d.row})`).join(', ') || '-'}`,
  );
  return N;
}

// ---------------------------------------------------------------- Radio de LUMA

/**
 * LevelData.radio : messages connus de core/story.ts, chacun une fois, assez courts pour la bulle ; fenêtres
 * [col0, col1] d'entiers dans la carte (une fenêtre au-delà de la sortie ne joue jamais : avertissement) ;
 * déclencheurs de RADIO_TRIGGERS. Puis la file de la radio simulée (simulateRadio) au rythme de référence : aucun
 * message chassé (erreur), tutoriel ouvert au plus RADIO_LATE_S après le passage de Kaï, bulle fermée de la colonne
 * qui précède un champignon jusqu'à la fin du rebond (avertissements) ; et à pleine course, en note.
 */
function checkRadio(
  level: LevelData,
  cols: number,
  P: Pos,
  E: Pos | null,
  checkpoints: readonly Pos[],
  arena: { col0: number; col1: number } | null,
  mushrooms: readonly Pos[],
  castaway: Pos | null,
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
  /** Arrivées dans la file (colonne où le message se déclenche) ; surchauffe et portes : imprévisibles, ignorées. */
  const arrivals: { col: number; end: number; id: string; m: RadioMessage; text: string }[] = [];
  // Point de contrôle : le premier allumé est le plus à gauche après le départ (find('K') va ligne par ligne).
  const firstK = checkpoints.filter((p) => p.col > P.col).sort((a, b) => a.col - b.col)[0];
  for (const raw of level.radio as readonly unknown[]) {
    const r = (raw ?? {}) as { id?: unknown; cols?: unknown; on?: unknown };
    const id = String(r.id);
    const label = `radio « ${id} »`;
    const known = typeof r.id === 'string' && Object.prototype.hasOwnProperty.call(RADIO, r.id);
    if (!known) err(`${label} : message inconnu de core/story.ts`);
    const m: RadioMessage | null = known ? RADIO[r.id as keyof typeof RADIO] : null;
    // Le plus long des deux textes (tactile, clavier) : la bulle doit le tenir, la simulation le prend.
    const text = m ? (m.keys && m.keys.length > m.text.length ? m.keys : m.text) : '';
    if (text.length > RADIO_MAX_CHARS) warn(`${label} : ${text.length} caractères (${RADIO_MAX_CHARS} au plus pour la bulle)`);
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
      if (ok && m) arrivals.push({ col: Math.max(c0, P.col), end: Math.max(c1 + 1, P.col), id, m, text });
    } else if (r.on !== undefined) {
      if (!(RADIO_TRIGGERS as readonly unknown[]).includes(r.on)) err(`${label} : déclencheur inconnu « ${String(r.on)} » (${RADIO_TRIGGERS.join(', ')})`);
      parts.push(`${id} (${String(r.on)})`);
      // Colonne prévisible : premier point de contrôle après le départ, entrée dans l'arène, naufragé (Kaï à sa
      // colonne : on y arrive par une porte voisine).
      if (m && r.on === 'checkpoint' && firstK) arrivals.push({ col: firstK.col, end: firstK.col, id, m, text });
      if (m && r.on === 'boss' && arena) arrivals.push({ col: arena.col0 + 1, end: arena.col0 + 1, id, m, text });
      if (m && r.on === 'rescue') {
        if (castaway) arrivals.push({ col: castaway.col, end: castaway.col, id, m, text });
        else err(`${label} : déclencheur « rescue » sans naufragé 'N'`);
      }
    } else {
      err(`${label} : ni « cols » ni « on »`);
    }
  }
  notes.push(`radio : ${parts.join(', ') || 'aucun message'}`);
  if (arrivals.length === 0) return;
  const f1 = (v: number): string => v.toFixed(1).replace('.', ',');
  // Arrivée : les messages du départ partent tout de suite, Kaï ne bouge qu'ensuite.
  const t0 = level.start !== undefined ? ARRIVAL_S : 0;
  const at = (col: number, colsPerS: number): number => (col <= P.col ? 0 : t0 + (col - P.col) / colsPerS);
  const run = (colsPerS: number): RadioSim =>
    simulateRadio(
      arrivals.map((a) => ({ t: at(a.col, colsPerS), id: a.id, text: a.text, urgent: a.m.urgent === true, interrupt: a.m.interrupt === true })),
    );
  // Rythme de référence (celui de l'estimation de durée) : aucun message chassé, tutoriel à l'heure.
  const pace = RUN_SPEED / TILE / RUN_FACTOR;
  const sim = run(pace);
  for (const [lost, by] of sim.dropped) {
    err(`radio « ${lost} » chassé de la file par « ${by} » (file de ${RADIO_TIMING.maxWaiting} ; simulation à ${f1(pace)} colonnes/s) : espacer les fenêtres`);
  }
  if (sim.cut.length > 0) notes.push(`radio simulée : coupés par un dialogue (« interrupt ») : ${sim.cut.join(', ')}`);
  for (const a of arrivals) {
    // Retard compté depuis que Kaï a quitté la fenêtre (passé le déclencheur), maître de ses mouvements : le conseil
    // arrive après l'endroit où il sert. Une fenêtre peut donc s'ouvrir tôt, avant ce dont elle parle.
    const open = sim.opens.get(a.id);
    const d = open === undefined ? 0 : open - Math.max(at(a.end, pace), t0);
    if (a.m.tutorial && d > RADIO_LATE_S) {
      warn(`radio « ${a.id} » : ouvert ${f1(d)} s après le passage de Kaï (${RADIO_LATE_S} s au plus ; simulation à ${f1(pace)} colonnes/s) : espacer les fenêtres ou raccourcir les messages d'avant`);
    }
  }
  for (const mu of mushrooms) {
    if (mu.col <= P.col) continue;
    const b0 = at(mu.col - 1, pace);
    const b1 = at(mu.col, pace) + BOUNCE_AIR_S;
    for (const [id, [open, close]] of sim.shown) {
      if (open < b1 && close + BUBBLE_FADE_S > b0) {
        warn(`radio « ${id} » affichée pendant le rebond sur le champignon (${mu.col}, ${mu.row}) (simulation à ${f1(pace)} colonnes/s) : au sommet, la bulle cache Kaï`);
      }
    }
  }
  notes.push(`radio simulée à ${f1(pace)} colonnes/s : ${sim.maxWaiting} message(s) en attente au plus, retard maximal ${f1(sim.maxDelay)} s (« ${sim.maxDelayId} »)`);
  // Pleine course, pour information : qui file sans s'arrêter ne lit pas tout.
  const full = RUN_SPEED / TILE;
  const fast = run(full);
  const lost = fast.dropped.map(([l]) => l);
  notes.push(
    `radio à pleine course (${f1(full)} colonnes/s) : ${lost.length > 0 ? `chassés : ${lost.join(', ')}` : 'aucun message chassé'}, ` +
      `retard maximal ${f1(fast.maxDelay)} s (« ${fast.maxDelayId} »)`,
  );
}

interface RadioSim {
  /** [message chassé, message arrivé qui l'a chassé]. */
  dropped: [string, string][];
  /** Messages coupés ou oubliés par un dialogue (« interrupt »). */
  cut: string[];
  maxWaiting: number;
  maxDelay: number;
  maxDelayId: string;
  /** Ouverture de chaque message joué (s depuis le départ). */
  opens: Map<string, number>;
  /** Bulle de chaque message joué : [ouverture, fermeture] (s). */
  shown: Map<string, [number, number]>;
}

/**
 * File de la radio de ui/radio.ts, pas à pas (RADIO_TIMING, écriture de la bulle) : ouverture, écriture, lecture
 * (courte si un message attend), trou ; un message de plus que la file n'en tient chasse le plus ancien ; un message
 * urgent passe devant ; un dialogue (« interrupt ») remplace aussitôt le message en cours et fait oublier les autres.
 */
function simulateRadio(arrivals: { t: number; id: string; text: string; urgent: boolean; interrupt: boolean }[]): RadioSim {
  const T = RADIO_TIMING;
  const list = arrivals.slice().sort((a, b) => a.t - b.t);
  const waiting: { t: number; id: string; text: string; urgent: boolean; interrupt: boolean }[] = [];
  const dropped: [string, string][] = [];
  const cut: string[] = [];
  const opens = new Map<string, number>();
  const shown = new Map<string, [number, number]>();
  let next = 0;
  let current: { id: string; text: string; interrupt: boolean } | null = null;
  let phase: 'idle' | 'open' | 'typing' | 'hold' | 'gap' = 'idle';
  let inPhase = 0;
  let typing = 0;
  let maxWaiting = 0;
  let maxDelay = 0;
  let maxDelayId = '';
  const dt = 1 / 60;
  for (let now = 0; next < list.length || waiting.length > 0 || phase !== 'idle'; now += dt) {
    while (next < list.length && list[next].t <= now) {
      const a = list[next++];
      if (a.interrupt) {
        // Message en cours coupé sans trou : le dialogue s'ouvre aussitôt (ui/radio.ts, cutIn).
        for (let i = waiting.length - 1; i >= 0; i--) if (!waiting[i].interrupt) cut.push(waiting.splice(i, 1)[0].id);
        if (current && !current.interrupt && phase !== 'idle') {
          if (phase !== 'gap') {
            shown.set(current.id, [opens.get(current.id) ?? now, now]);
            cut.push(current.id);
          }
          current = null;
          phase = 'idle';
          inPhase = 0;
        }
      }
      if (waiting.length >= T.maxWaiting) dropped.push([waiting.shift()!.id, a.id]);
      if (a.urgent) {
        let i = 0;
        while (i < waiting.length && waiting[i].interrupt) i++;
        waiting.splice(i, 0, a);
      } else {
        waiting.push(a);
      }
      maxWaiting = Math.max(maxWaiting, waiting.length);
    }
    inPhase += dt;
    if (phase === 'idle' || (phase === 'gap' && inPhase >= T.gapS)) {
      const a = waiting.shift();
      current = a ?? null;
      phase = a ? 'open' : 'idle';
      inPhase = 0;
      if (a) {
        typing = typingDuration(a.text);
        opens.set(a.id, now);
        if (now - a.t > maxDelay) {
          maxDelay = now - a.t;
          maxDelayId = a.id;
        }
      }
    } else if (phase === 'open' && inPhase >= T.openS) {
      phase = 'typing';
      inPhase = 0;
    } else if (phase === 'typing' && inPhase >= typing) {
      phase = 'hold';
      inPhase = 0;
    } else if (phase === 'hold' && current) {
      const hold = radioHoldS(current.text);
      if (inPhase >= (waiting.length > 0 ? Math.min(hold, T.holdBusyS) : hold)) {
        shown.set(current.id, [opens.get(current.id) ?? now, now]);
        phase = 'gap';
        inPhase = 0;
      }
    }
  }
  return { dropped, cut, maxWaiting, maxDelay, maxDelayId, opens, shown };
}

// ---------------------------------------------------------------- Salles closes

/** Cases non pleines qu'aucun chemin (sans traverser de case pleine) ne relie au bord : comme mapBuilder. */
function enclosedCells(g: LevelGrid): Uint8Array {
  const open = new Uint8Array(g.cols * g.rows);
  const stack: number[] = [];
  const push = (c: number, r: number): void => {
    const k = g.key(c, r);
    if (open[k] || g.solid(c, r)) return;
    open[k] = 1;
    stack.push(k);
  };
  for (let c = 0; c < g.cols; c++) {
    push(c, 0);
    push(c, g.rows - 1);
  }
  for (let r = 0; r < g.rows; r++) {
    push(0, r);
    push(g.cols - 1, r);
  }
  while (stack.length > 0) {
    const k = stack.pop() as number;
    const c = k % g.cols;
    const r = (k - c) / g.cols;
    if (c > 0) push(c - 1, r);
    if (c < g.cols - 1) push(c + 1, r);
    if (r > 0) push(c, r - 1);
    if (r < g.rows - 1) push(c, r + 1);
  }
  const enclosed = new Uint8Array(g.cols * g.rows);
  for (let k = 0; k < enclosed.length; k++) enclosed[k] = !open[k] && !g.solid(k % g.cols, Math.floor(k / g.cols)) ? 1 : 0;
  return enclosed;
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
      "'%' bloc impossible à frapper, 'D' porte, 'o' champignon (on y rebondit), 'B' aussi pour un tronc couché (secousse), " +
      "'N' naufragé",
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
