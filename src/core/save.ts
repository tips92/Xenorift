import type {
  BestScore,
  CrewId,
  Loadout,
  PlayLoadout,
  SaveData,
  Settings,
  StageDef,
  StageResult,
  StageReward,
  StoryProgress,
  WeaponId,
} from './types';
import {
  applyPurchase,
  buildPlayLoadout,
  clampLevel,
  CREW_IDS,
  defaultShipModules,
  defaultWeaponUpgrades,
  getHangarItem,
  itemState,
  MAX_BOOST_LEVEL,
  MAX_EXTRA_HEARTS,
  MAX_SHIELD_LEVEL,
  MAX_SHIP_GUN_LEVEL,
  MAX_UPGRADE_LEVEL,
  stageCrystals,
  UPGRADE_STATS,
} from './hangar.ts';
import type { HangarItemId, ItemState, PurchaseResult } from './hangar';
import { STAGES } from './stages.ts';
import { TUTORIAL_MARK, TUTORIAL_STAGE } from './story.ts';
import { isWeaponId, WEAPON_IDS } from './weapons.ts';

// Sauvegarde locale (localStorage). Fonctionne dans la WebView Capacitor sur Android et iOS ;
// pourra être remplacée par @capacitor/preferences sans changer cette interface.
// Lisible par Node (essais) : sans localStorage, tout marche en mémoire.

/** Clé historique : la version est DANS les données (SaveData.version), la clé ne change pas. */
const KEY = 'xeno-rift-save-v1';

/** Équipement de départ : le pistolet laser seul, aucune compétence. */
function defaultLoadout(): Loadout {
  return { equipped: 'laser', owned: ['laser'], skills: { doubleJump: false } };
}

/**
 * Équipement relu : identifiants inconnus ignorés, armes rangées dans l'ordre de WEAPON_IDS, 'laser'
 * toujours possédé, arme équipée possédée (sinon le laser). Absent (ancienne sauvegarde) : valeur par défaut.
 */
function readLoadout(raw: unknown): Loadout {
  const src = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(src.owned) ? (src.owned as unknown[]) : [];
  const owned = WEAPON_IDS.filter((id) => id === 'laser' || list.includes(id));
  const equipped = isWeaponId(src.equipped) && owned.includes(src.equipped) ? src.equipped : 'laser';
  const skills = src.skills !== null && typeof src.skills === 'object' ? (src.skills as Record<string, unknown>) : {};
  return { equipped, owned, skills: { doubleJump: skills.doubleJump === true } };
}

const DEFAULT_SETTINGS: Settings = {
  music: true,
  sfx: true,
  haptics: true,
  tilt: false,
  unlockAll: false,
  // Commandes tactiles : 1 = taille et opacité d'origine (calque à 0,75, voir input/styles.ts).
  touchSize: 1,
  touchOpacity: 1,
  leftHanded: false,
  // Vol : tir automatique par défaut (bouton TIR seulement en tir manuel).
  manualFire: false,
};

function defaults(): SaveData {
  return {
    version: 2,
    unlocked: 0,
    best: {},
    settings: { ...DEFAULT_SETTINGS },
    loadout: defaultLoadout(),
    crystals: 0,
    upgrades: defaultWeaponUpgrades(),
    ship: defaultShipModules(),
    extraHearts: 0,
    crew: [],
    blueprints: [],
    story: { seen: [] },
  };
}

/**
 * Réglages relus : chaque champ connu garde sa valeur enregistrée si elle a le bon type (crans arrondis et
 * bornés à 0..2), sinon reçoit sa valeur par défaut. Ancienne sauvegarde sans un réglage, ou valeur abîmée :
 * tous les modules voient alors la même valeur.
 */
function readSettings(raw: unknown): Settings {
  const src = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Settings = { ...DEFAULT_SETTINGS };
  const o = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = src[key];
    if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
    if (key === 'touchSize' || key === 'touchOpacity') {
      if (Number.isFinite(v)) o[key] = Math.min(2, Math.max(0, Math.round(v as number)));
    } else {
      o[key] = v;
    }
  }
  return out;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Meilleurs scores relus : entrées sans score numérique ignorées, étoiles ramenées à 1..3. */
function readBest(raw: unknown): Record<string, BestScore> {
  const out: Record<string, BestScore> = {};
  for (const [id, v] of Object.entries(asRecord(raw))) {
    const b = asRecord(v);
    if (id === '__proto__' || typeof b.score !== 'number' || !Number.isFinite(b.score)) continue;
    const s = Number(b.stars);
    out[id] = { score: Math.max(0, Math.round(b.score)), stars: s >= 3 ? 3 : s >= 2 ? 2 : 1 };
  }
  return out;
}

/** Marques de l'histoire relues : chaînes non vides, sans doublon. */
function readStory(raw: unknown): StoryProgress {
  const src = asRecord(raw);
  const list = Array.isArray(src.seen) ? (src.seen as unknown[]) : [];
  const seen: string[] = [];
  for (const v of list) if (typeof v === 'string' && v && !seen.includes(v)) seen.push(v);
  return { seen };
}

/** Champs communs aux versions 1 et 2. */
function readBase(src: Record<string, unknown>): SaveData {
  const u = src.unlocked;
  return {
    ...defaults(),
    unlocked: typeof u === 'number' && Number.isFinite(u) ? Math.max(0, Math.floor(u)) : 0,
    best: readBest(src.best),
    settings: readSettings(src.settings),
    loadout: readLoadout(src.loadout),
    story: readStory(src.story),
  };
}

/** Version 2 : chaque champ du hangar relu et borné ; identifiants inconnus filtrés. */
function readV2(src: Record<string, unknown>): SaveData {
  const out = readBase(src);
  const c = src.crystals;
  out.crystals = typeof c === 'number' && Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0;
  const ups = asRecord(src.upgrades);
  for (const w of WEAPON_IDS) {
    const lv = asRecord(ups[w]);
    for (const s of UPGRADE_STATS) out.upgrades[w][s] = clampLevel(lv[s], MAX_UPGRADE_LEVEL);
  }
  const ship = asRecord(src.ship);
  out.ship = {
    gun: clampLevel(ship.gun, MAX_SHIP_GUN_LEVEL),
    shield: clampLevel(ship.shield, MAX_SHIELD_LEVEL),
    boost: clampLevel(ship.boost, MAX_BOOST_LEVEL),
  };
  out.extraHearts = clampLevel(src.extraHearts, MAX_EXTRA_HEARTS);
  const crew = Array.isArray(src.crew) ? (src.crew as unknown[]) : [];
  out.crew = CREW_IDS.filter((id) => crew.includes(id)) as CrewId[];
  const plans = Array.isArray(src.blueprints) ? (src.blueprints as unknown[]) : [];
  out.blueprints = WEAPON_IDS.filter((id) => id !== 'laser' && plans.includes(id));
  return out;
}

/**
 * Applique des récompenses à la sauvegarde (ensembles : sans effet si déjà acquises) ; renvoie les NOUVELLES.
 * Équipage et plans rangés dans l'ordre de CREW_IDS et WEAPON_IDS.
 */
function applyRewards(save: SaveData, rewards: readonly StageReward[]): StageReward[] {
  const got: StageReward[] = [];
  for (const r of rewards) {
    switch (r.kind) {
      case 'skill':
        if (save.loadout.skills[r.id]) continue;
        save.loadout = { ...save.loadout, skills: { ...save.loadout.skills, [r.id]: true } };
        break;
      case 'crew': {
        if (save.crew.includes(r.id)) continue;
        const crew = save.crew;
        save.crew = CREW_IDS.filter((id) => id === r.id || crew.includes(id)) as CrewId[];
        break;
      }
      case 'blueprint': {
        if (save.blueprints.includes(r.id)) continue;
        const plans = save.blueprints;
        save.blueprints = WEAPON_IDS.filter((id) => id === r.id || plans.includes(id));
        break;
      }
    }
    got.push(r);
  }
  return got;
}

/** Récompenses des étapes réussies : qui avait fini une étape avant qu'elle en donne une la reçoit au chargement. */
function withRewards(save: SaveData): SaveData {
  for (const s of STAGES) if (save.best[s.id]) applyRewards(save, s.rewards);
  return save;
}

let data: SaveData = load();
/** Arme de la session (mode test ou ?weapon=) : jamais enregistrée ; null = arme de la sauvegarde. */
let sessionWeapon: WeaponId | null = null;

/**
 * Chargement. Version 1 : migrée (progression, scores, réglages, loadout et histoire gardés ; réserve,
 * améliorations, modules, cœurs, équipage et plans à zéro), réécrite en version 2 au prochain enregistrement.
 * Autre version, ou données illisibles : remise à zéro. Puis récompenses des étapes réussies réappliquées
 * (enregistrées avec le prochain changement).
 */
function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as unknown;
    const src = asRecord(parsed);
    if (src.version === 1) return withRewards(readBase(src));
    if (src.version === 2) return withRewards(readV2(src));
    return defaults();
  } catch {
    return defaults();
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Stockage indisponible (navigation privée…) : la partie continue sans sauvegarde.
  }
}

export function getSave(): Readonly<SaveData> {
  return data;
}

export function getSettings(): Readonly<Settings> {
  return data.settings;
}

export function updateSettings(patch: Partial<Settings>): Readonly<Settings> {
  data.settings = { ...data.settings, ...patch };
  persist();
  return data.settings;
}

// ---------------------------------------------------------------- Progression (par identifiants d'étape)

/** Étape réussie au moins une fois (son id figure dans les records). */
export function isCleared(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(data.best, id);
}

/** Étape jouable : la première, une réussie ou la suivante d'une réussie ; mode test : toutes. */
export function isUnlocked(stage: StageDef): boolean {
  if (data.settings.unlockAll || stage.index === 0 || isCleared(stage.id)) return true;
  const prev = STAGES[stage.index - 1];
  return !!prev && isCleared(prev.id);
}

/** Étape de JOUER : la première ouverte non réussie, sinon la dernière. */
export function nextToPlay(): StageDef {
  return STAGES.find((s) => isUnlocked(s) && !isCleared(s.id)) ?? STAGES[STAGES.length - 1];
}

/** Rien de réussi ni de vu : « Nouvelle aventure ». */
export function isFresh(): boolean {
  return Object.keys(data.best).length === 0 && data.story.seen.length === 0;
}

/** Ce que recordResult a changé : réserve et récompenses. */
export interface RecordInfo {
  /** Cristaux de l'étape ajoutés à la réserve (2D et vol). */
  crystalsGained: number;
  /** Réserve après l'ajout. */
  crystals: number;
  /** Récompenses obtenues par cette réussite (déjà acquises : absentes ; vide en rejouant). */
  rewards: StageReward[];
}

/**
 * Enregistre un résultat (étape RÉUSSIE seulement) : meilleur score, récompenses de l'étape, et cristaux de
 * l'étape ajoutés à la réserve, même en rejouant (seul endroit où ils s'ajoutent). `unlocked` (hérité) reste
 * tenu à jour. Réussir j1 termine le tutoriel de la radio (marque TUTORIAL_MARK).
 */
export function recordResult(stage: StageDef, result: StageResult): RecordInfo {
  const prev = data.best[stage.id];
  if (!prev || result.score > prev.score || result.stars > prev.stars) {
    data.best[stage.id] = {
      score: Math.max(result.score, prev?.score ?? 0),
      stars: Math.max(result.stars, prev?.stars ?? 1) as 1 | 2 | 3,
    };
  }
  data.unlocked = Math.max(data.unlocked, stage.index + 1);
  const rewards = applyRewards(data, stage.rewards);
  if (stage.id === TUTORIAL_STAGE && !data.story.seen.includes(TUTORIAL_MARK)) data.story.seen.push(TUTORIAL_MARK);
  const gained = stageCrystals(result);
  data.crystals += gained;
  persist();
  return { crystalsGained: gained, crystals: data.crystals, rewards };
}

// ---------------------------------------------------------------- Réserve et hangar

/** Réserve de cristaux. */
export function getCrystals(): number {
  return data.crystals;
}

/** Ajoute (ou retire, si négatif) des cristaux à la réserve, jamais sous 0 ; renvoie la réserve. Aide de test. */
export function addCrystals(n: number): number {
  if (!Number.isFinite(n)) return data.crystals;
  data.crystals = Math.max(0, data.crystals + Math.round(n));
  persist();
  return data.crystals;
}

/** État d'un achat pour la sauvegarde actuelle (mode test = settings.unlockAll) ; undefined si inconnu. */
export function getItemState(id: HangarItemId): ItemState | undefined {
  const item = getHangarItem(id);
  return item ? itemState(data, item) : undefined;
}

/**
 * Achat au hangar : condition (plan, arme, équipage ; levée en mode test), niveau max, prix. Accepté :
 * réserve débitée, niveau monté, enregistré (une arme achetée rejoint loadout.owned, sans être équipée, sauf
 * si c'est l'arme de la session : elle devient alors l'arme équipée enregistrée).
 */
export function purchase(id: HangarItemId): PurchaseResult {
  const { result, save } = applyPurchase(data, id);
  if (save) {
    data = save;
    persist();
    // Arme équipée pour la session (mode test) puis achetée : son équipement est enregistré.
    const item = getHangarItem(id);
    const w = item?.kind === 'weapon' ? item.weapon : null;
    if (w && w === sessionWeapon && setEquippedWeapon(w)) sessionWeapon = null;
  }
  return result;
}

/** Équipement enregistré (sans le mode test ni l'arme de la session : voir playLoadout). */
export function getLoadout(): Readonly<Loadout> {
  return data.loadout;
}

/** Équipe une arme possédée et l'enregistre (hangar). Faux, sans rien changer, si elle n'est pas possédée. */
export function setEquippedWeapon(id: WeaponId): boolean {
  const lo = data.loadout;
  if (!lo.owned.includes(id)) return false;
  if (lo.equipped !== id) {
    data.loadout = { ...lo, equipped: id };
    persist();
  }
  return true;
}

/** Arme de la session (null : celle de la sauvegarde). */
export function getSessionWeapon(): WeaponId | null {
  return sessionWeapon;
}

/** Impose une arme pour la session (?weapon=, mode test), jamais enregistrée ; null ou invalide : aucune. */
export function setSessionWeapon(id: WeaponId | null): void {
  sessionWeapon = isWeaponId(id) ? id : null;
}

/**
 * - 'saved' : arme possédée, équipée et enregistrée ; l'arme de la session est oubliée (dernier choix gagnant).
 * - 'session' : mode test, arme non possédée : équipée pour la session seulement (sauvegarde inchangée).
 * - 'refused' : arme non possédée hors mode test, ou identifiant invalide.
 */
export type EquipResult = 'saved' | 'session' | 'refused';

/** Bouton « Équiper » du hangar. */
export function equipWeapon(id: WeaponId): EquipResult {
  if (!isWeaponId(id)) return 'refused';
  if (setEquippedWeapon(id)) {
    sessionWeapon = null;
    return 'saved';
  }
  if (data.settings.unlockAll) {
    sessionWeapon = id;
    return 'session';
  }
  return 'refused';
}

/**
 * Équipement EFFECTIF d'une partie (ModeHooks.loadout), nouvel objet jamais enregistré : buildPlayLoadout
 * de core/hangar.ts (mode test : 4 armes et double saut ; améliorations, cœurs max et modules achetés).
 * `override` : arme imposée ; absent (undefined) = arme de la session (setSessionWeapon) ; null = aucune.
 */
export function playLoadout(settings: Readonly<Settings>, override?: WeaponId | null): PlayLoadout {
  const forced = override === undefined ? sessionWeapon : override;
  return buildPlayLoadout(data, settings.unlockAll, forced);
}

/**
 * Efface la progression : déblocages, records, équipement (armes, compétences), réserve, améliorations,
 * modules de la Comète, cœurs, équipage, plans et histoire. Les réglages (et l'arme de la session) restent.
 */
export function resetProgress(): void {
  data = { ...defaults(), settings: data.settings };
  persist();
}
