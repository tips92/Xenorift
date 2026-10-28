import type {
  CrewId,
  PlayLoadout,
  SaveData,
  ShipLoadout,
  ShipModules,
  StageResult,
  UpgradeStat,
  WeaponId,
  WeaponUpgrades,
} from './types';
import { SHIP_GUN_MULS, SHIP_GUNS } from './shipGuns.ts';
import { isWeaponId, WEAPON_IDS, WEAPONS } from './weapons.ts';
import type { WeaponMods } from './weapons';

// Hangar (docs/plans/03-hangar.md) : catalogue des achats, prix, effets, conditions, et calculs PURS
// (état d'un achat, achat appliqué à une copie de la sauvegarde, équipement effectif d'une partie).
// L'enregistrement est fait par core/save.ts. Lisible par Node : rien du navigateur, de Vite ni de Phaser,
// TypeScript effaçable, imports de valeurs avec l'extension .ts. Valeurs de départ, à régler.

// ---------------------------------------------------------------- Équipage, bases et limites

/** Équipage, dans l'ordre d'enregistrement (SaveData.crew). */
export const CREW_IDS = ['tess', 'mira'] as const satisfies readonly CrewId[];

export const CREW: Readonly<Record<CrewId, { readonly name: string; readonly role: string }>> = {
  tess: { name: 'Tess', role: 'mécanicienne' },
  mira: { name: 'Mira', role: 'biologiste' },
};

/** Caractéristiques améliorables, dans l'ordre d'affichage. */
export const UPGRADE_STATS = ['damage', 'fireRate', 'range', 'cooling'] as const satisfies readonly UpgradeStat[];

/** Cœurs de Kaï sans achat (MAX_HEARTS de game2d/constants.ts) ; jusqu'à BASE_HEARTS + MAX_EXTRA_HEARTS. */
export const BASE_HEARTS = 3;
export const MAX_EXTRA_HEARTS = 2;
/** Boucliers de la Comète sans achat (MAX_SHIELD de game3d/flight.ts) ; jusqu'à BASE_SHIELDS + MAX_SHIELD_LEVEL. */
export const BASE_SHIELDS = 3;
export const MAX_SHIELD_LEVEL = 2;
export const MAX_BOOST_LEVEL = 2;
/** Canon de la Comète : 1 = mitrailleuse achetée, 2 et 3 = ses améliorations. */
export const MAX_SHIP_GUN_LEVEL = 3;
export const MAX_UPGRADE_LEVEL = 3;
/** Plafonds affichés par le HUD (cœurs en 2D, boucliers en vol). */
export const MAX_HEARTS_CAP = BASE_HEARTS + MAX_EXTRA_HEARTS;
export const MAX_SHIELDS_CAP = BASE_SHIELDS + MAX_SHIELD_LEVEL;

// ---------------------------------------------------------------- Effets et prix

/** Multiplicateur d'une caractéristique selon son niveau (index 0 = fiche d'origine). */
export const UPGRADE_MULS: Readonly<Record<UpgradeStat, readonly number[]>> = {
  damage: [1, 1.25, 1.5, 2],
  fireRate: [1, 1.15, 1.3, 1.5],
  range: [1, 1.15, 1.3, 1.5],
  cooling: [1, 1.25, 1.5, 1.8],
};

/** Turbo : durée de la jauge pleine et vitesse de recharge multipliées, selon le niveau. */
export const BOOST_MULS: readonly number[] = [1, 1.25, 1.5];

/** Prix en cristaux ; tableaux indexés par le niveau actuel (prix du niveau suivant). */
export const PRICES = {
  weapon: { machinegun: 80, shotgun: 100, rifle: 120 },
  upgrade: [30, 60, 100],
  shipGun: [100, 80, 140],
  shipShield: [80, 140],
  shipBoost: [80, 140],
  heart: [150, 250],
} as const;

// ---------------------------------------------------------------- Catalogue

/** Armes qui s'achètent (le laser est donné au départ). */
export type BuyableWeaponId = Exclude<WeaponId, 'laser'>;

/** Identifiants stables des achats (jamais renommés : l'interface et les tests s'en servent). */
export type HangarItemId =
  | `weapon.${BuyableWeaponId}`
  | `upgrade.${WeaponId}.${UpgradeStat}`
  | 'ship.gun'
  | 'ship.shield'
  | 'ship.boost'
  | 'kai.heart';

/** Onglets : Établi (armes de Kaï), Comète, Kaï. */
export type HangarTab = 'bench' | 'ship' | 'kai';

export const HANGAR_TABS: readonly { readonly id: HangarTab; readonly label: string }[] = [
  { id: 'bench', label: 'Établi' },
  { id: 'ship', label: 'Comète' },
  { id: 'kai', label: 'Kaï' },
];

export type HangarItemKind = 'weapon' | 'upgrade' | 'shipGun' | 'shipShield' | 'shipBoost' | 'heart';

export interface HangarItem {
  readonly id: HangarItemId;
  readonly kind: HangarItemKind;
  readonly tab: HangarTab;
  /** Nom affiché (amélioration : la caractéristique ; l'arme est dans `weapon`). */
  readonly name: string;
  /** Description courte, une ligne. */
  readonly desc: string;
  /** Niveau max (achat unique : 1). */
  readonly maxLevel: number;
  /** Prix du niveau n + 1 : prices[n]. */
  readonly prices: readonly number[];
  /** Effet du niveau n : effects[n - 1] (texte court). */
  readonly effects: readonly string[];
  /** Membre d'équipage demandé pour acheter le niveau n + 1 : crew[n] (null : aucun). */
  readonly crew: readonly (CrewId | null)[];
  /** Plan à récupérer avant l'achat (armes). */
  readonly blueprint: WeaponId | null;
  /** Arme achetée ou améliorée. */
  readonly weapon: WeaponId | null;
  /** Caractéristique améliorée. */
  readonly stat: UpgradeStat | null;
  /** Effet en jeu pas encore branché : note « Effet en vol : bientôt » (plus aucun achat depuis 3b). */
  readonly soon: boolean;
}

const STAT_TEXT: Readonly<Record<UpgradeStat, { readonly name: string; readonly desc: string }>> = {
  damage: { name: 'Dégâts', desc: 'Chaque tir fait plus de dégâts.' },
  fireRate: { name: 'Cadence', desc: 'Tirs plus rapprochés.' },
  range: { name: 'Portée', desc: 'Les tirs vont plus loin.' },
  cooling: { name: 'Refroidissement', desc: 'L’arme refroidit plus vite.' },
};

const WEAPON_DESC: Readonly<Record<BuyableWeaponId, string>> = {
  machinegun: 'Tir rapide à moyenne portée.',
  shotgun: 'Gerbe de plombs, redoutable au contact.',
  rifle: 'Rafales de 3 balles, longue portée.',
};

/** Multiplicateur affiché à la française : 1.25 → « ×1,25 ». */
export function formatMul(m: number): string {
  return `×${String(Math.round(m * 100) / 100).replace('.', ',')}`;
}

/**
 * Effets du canon de la Comète, niveaux 1 à 3, tirés des fiches (core/shipGuns.ts) : « Canon léger →
 * Mitrailleuse : cadence ×2,5 », « Dégâts ×1,25, cadence ×1,15 », « Dégâts ×1,5, cadence ×1,3 ».
 */
function shipGunEffects(): string[] {
  const { light, machinegun: mg } = SHIP_GUNS;
  const out = [`${light.name} → ${mg.name} : cadence ${formatMul(light.cooldownMs / mg.cooldownMs)}`];
  for (let lv = 2; lv <= MAX_SHIP_GUN_LEVEL; lv++) {
    out.push(`Dégâts ${formatMul(SHIP_GUN_MULS.damage[lv])}, cadence ${formatMul(SHIP_GUN_MULS.fireRate[lv])}`);
  }
  return out;
}

function buildItems(): HangarItem[] {
  const out: HangarItem[] = [];
  const base = { crew: [] as (CrewId | null)[], blueprint: null, weapon: null, stat: null, soon: false };
  // Établi : chaque arme (achat sauf le laser) suivie de ses 4 améliorations.
  for (const w of WEAPON_IDS) {
    if (w !== 'laser') {
      out.push({
        ...base,
        id: `weapon.${w}`,
        kind: 'weapon',
        tab: 'bench',
        name: WEAPONS[w].name,
        desc: WEAPON_DESC[w],
        maxLevel: 1,
        prices: [PRICES.weapon[w]],
        effects: ['Arme possédée'],
        crew: [null],
        blueprint: w,
        weapon: w,
      });
    }
    for (const s of UPGRADE_STATS) {
      const t = STAT_TEXT[s];
      out.push({
        ...base,
        id: `upgrade.${w}.${s}`,
        kind: 'upgrade',
        tab: 'bench',
        name: t.name,
        desc: t.desc,
        maxLevel: MAX_UPGRADE_LEVEL,
        prices: PRICES.upgrade,
        effects: UPGRADE_MULS[s].slice(1).map((m) => `${t.name} ${formatMul(m)}`),
        // Niveaux 2 et 3 : Tess.
        crew: [null, 'tess', 'tess'],
        weapon: w,
        stat: s,
      });
    }
  }
  // Atelier de la Comète.
  out.push(
    {
      ...base,
      id: 'ship.gun',
      kind: 'shipGun',
      tab: 'ship',
      name: 'Mitrailleuse',
      desc: 'Deux canons sous les ailes, à la place du canon léger.',
      maxLevel: MAX_SHIP_GUN_LEVEL,
      prices: PRICES.shipGun,
      effects: shipGunEffects(),
      crew: [null, null, null],
    },
    {
      ...base,
      id: 'ship.shield',
      kind: 'shipShield',
      tab: 'ship',
      name: 'Bouclier renforcé',
      desc: 'La Comète encaisse plus de chocs.',
      maxLevel: MAX_SHIELD_LEVEL,
      prices: PRICES.shipShield,
      effects: [1, 2].map((n) => `${BASE_SHIELDS + n} boucliers`),
      crew: [null, null],
    },
    {
      ...base,
      id: 'ship.boost',
      kind: 'shipBoost',
      tab: 'ship',
      name: 'Turbo',
      desc: 'Jauge de turbo plus endurante, recharge plus rapide.',
      maxLevel: MAX_BOOST_LEVEL,
      prices: PRICES.shipBoost,
      effects: BOOST_MULS.slice(1).map((m) => `Durée et recharge ${formatMul(m)}`),
      crew: [null, null],
    },
  );
  // Kaï.
  out.push({
    ...base,
    id: 'kai.heart',
    kind: 'heart',
    tab: 'kai',
    name: 'Cœur supplémentaire',
    desc: 'Kaï encaisse un coup de plus.',
    maxLevel: MAX_EXTRA_HEARTS,
    prices: PRICES.heart,
    effects: [1, 2].map((n) => `${BASE_HEARTS + n} cœurs`),
    crew: ['mira', 'mira'],
  });
  return out;
}

/** Tous les achats, dans l'ordre d'affichage. */
export const HANGAR_ITEMS: readonly HangarItem[] = buildItems();

const BY_ID: ReadonlyMap<string, HangarItem> = new Map(HANGAR_ITEMS.map((it) => [it.id, it]));

export function isHangarItemId(v: unknown): v is HangarItemId {
  return typeof v === 'string' && BY_ID.has(v);
}

/** Fiche d'un achat (undefined pour un identifiant inconnu). */
export function getHangarItem(id: string): HangarItem | undefined {
  return BY_ID.get(id);
}

export function itemsOfTab(tab: HangarTab): HangarItem[] {
  return HANGAR_ITEMS.filter((it) => it.tab === tab);
}

export function weaponItemId(w: BuyableWeaponId): HangarItemId {
  return `weapon.${w}`;
}

export function upgradeItemId(w: WeaponId, s: UpgradeStat): HangarItemId {
  return `upgrade.${w}.${s}`;
}

// ---------------------------------------------------------------- Valeurs par défaut (sauvegarde)

export function defaultWeaponUpgrades(): Record<WeaponId, WeaponUpgrades> {
  const out = {} as Record<WeaponId, WeaponUpgrades>;
  for (const w of WEAPON_IDS) out[w] = { damage: 0, fireRate: 0, range: 0, cooling: 0 };
  return out;
}

export function defaultShipModules(): ShipModules {
  return { gun: 0, shield: 0, boost: 0 };
}

/** Niveau relu : entier de 0 à max (arrondi vers le bas : jamais plus que ce qui a été acheté), sinon 0. */
export function clampLevel(v: unknown, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(0, Math.floor(v)));
}

// ---------------------------------------------------------------- Effets

/** Multiplicateurs d'une arme selon ses niveaux d'amélioration (écrits dans `out` s'il est fourni). */
export function weaponMods(levels: Readonly<WeaponUpgrades>, out?: WeaponMods): WeaponMods {
  const o = out ?? { damage: 1, fireRate: 1, range: 1, cooling: 1 };
  for (const s of UPGRADE_STATS) o[s] = UPGRADE_MULS[s][clampLevel(levels[s], MAX_UPGRADE_LEVEL)];
  return o;
}

export function maxHeartsFor(extraHearts: number): number {
  return BASE_HEARTS + clampLevel(extraHearts, MAX_EXTRA_HEARTS);
}

export function maxShieldsFor(shieldLevel: number): number {
  return BASE_SHIELDS + clampLevel(shieldLevel, MAX_SHIELD_LEVEL);
}

/** Turbo : multiplicateur de la durée de la jauge et de la recharge (1, 1,25, 1,5). */
export function boostMulFor(level: number): number {
  return BOOST_MULS[clampLevel(level, MAX_BOOST_LEVEL)];
}

/** Effets en vol des modules de la Comète. */
export function shipLoadout(m: Readonly<ShipModules>): ShipLoadout {
  const boost = boostMulFor(m.boost);
  return {
    gunLevel: clampLevel(m.gun, MAX_SHIP_GUN_LEVEL),
    maxShields: maxShieldsFor(m.shield),
    boostLevel: clampLevel(m.boost, MAX_BOOST_LEVEL),
    boostDrainMul: 1 / boost,
    boostFillMul: boost,
  };
}

/**
 * Équipement EFFECTIF d'une partie (nouvel objet). Mode test (`test`) : les 4 armes possédées et le double
 * saut appris, mais seulement les améliorations achetées. `override` (arme de la session) : arme équipée,
 * ajoutée aux armes possédées si besoin ; identifiant invalide ignoré.
 */
export function buildPlayLoadout(save: Readonly<SaveData>, test: boolean, override: WeaponId | null): PlayLoadout {
  const lo = save.loadout;
  const forced = isWeaponId(override) ? override : null;
  const owned = WEAPON_IDS.filter((id) => test || id === forced || lo.owned.includes(id));
  const mods = {} as Record<WeaponId, WeaponMods>;
  for (const w of WEAPON_IDS) mods[w] = weaponMods(save.upgrades[w]);
  return {
    equipped: forced ?? lo.equipped,
    owned,
    skills: { ...lo.skills, doubleJump: test || lo.skills.doubleJump },
    mods,
    maxHearts: maxHeartsFor(save.extraHearts),
    ship: shipLoadout(save.ship),
  };
}

/** Équipement de départ (laser seul, rien d'acheté) : aperçus et repli des modes. */
export function defaultPlayLoadout(): PlayLoadout {
  const mods = {} as Record<WeaponId, WeaponMods>;
  for (const w of WEAPON_IDS) mods[w] = { damage: 1, fireRate: 1, range: 1, cooling: 1 };
  return {
    equipped: 'laser',
    owned: ['laser'],
    skills: { doubleJump: false },
    mods,
    maxHearts: BASE_HEARTS,
    ship: shipLoadout(defaultShipModules()),
  };
}

// ---------------------------------------------------------------- État d'un achat

/**
 * Raison d'un achat impossible : niveau max, plan manquant, arme non possédée (amélioration), membre
 * d'équipage absent, réserve insuffisante.
 */
export type LockReason = 'max' | 'blueprint' | 'weapon' | 'crew' | 'funds';

export interface ItemState {
  readonly item: HangarItem;
  /** Niveau acheté (0 = rien ; arme : 1 = possédée). */
  readonly level: number;
  readonly maxed: boolean;
  /** Prix du niveau suivant ; null au niveau max. */
  readonly price: number | null;
  /** Effet du niveau actuel (null au niveau 0) et du suivant (null au niveau max). */
  readonly effect: string | null;
  readonly nextEffect: string | null;
  readonly canBuy: boolean;
  /** Raison du refus (null si achetable). Ordre : max, puis condition (plan, arme, équipage), puis réserve. */
  readonly lock: LockReason | null;
  /** Membre d'équipage demandé (lock 'crew'). */
  readonly needs: CrewId | null;
  /** « Plan manquant », « Demande Tess »… ; '' si achetable. */
  readonly lockText: string;
  /** Une condition (plan, arme, équipage) a été levée par le mode test. */
  readonly bypassed: boolean;
}

/** Niveau actuel d'un achat dans une sauvegarde. */
export function itemLevel(save: Readonly<SaveData>, item: HangarItem): number {
  switch (item.kind) {
    case 'weapon':
      return item.weapon && save.loadout.owned.includes(item.weapon) ? 1 : 0;
    case 'upgrade':
      return item.weapon && item.stat ? clampLevel(save.upgrades[item.weapon][item.stat], MAX_UPGRADE_LEVEL) : 0;
    case 'shipGun':
      return clampLevel(save.ship.gun, MAX_SHIP_GUN_LEVEL);
    case 'shipShield':
      return clampLevel(save.ship.shield, MAX_SHIELD_LEVEL);
    case 'shipBoost':
      return clampLevel(save.ship.boost, MAX_BOOST_LEVEL);
    case 'heart':
      return clampLevel(save.extraHearts, MAX_EXTRA_HEARTS);
  }
}

/** Texte d'un verrou (ItemState.lockText). */
export function lockLabel(lock: LockReason | null, item: HangarItem, needs: CrewId | null): string {
  switch (lock) {
    case 'max':
      return item.kind === 'weapon' ? 'Arme déjà possédée' : 'Niveau max';
    case 'blueprint':
      return 'Plan manquant';
    case 'weapon':
      return 'Arme non possédée';
    case 'crew':
      return `Demande ${needs ? CREW[needs].name : 'un équipier'}`;
    case 'funds':
      return 'Réserve insuffisante';
    default:
      return '';
  }
}

/**
 * État d'un achat pour une sauvegarde. Mode test (`test`, par défaut save.settings.unlockAll) : conditions
 * levées (plan, arme possédée, équipage), PAS les prix ni le niveau max.
 */
export function itemState(save: Readonly<SaveData>, item: HangarItem, test: boolean = save.settings.unlockAll): ItemState {
  const level = itemLevel(save, item);
  const maxed = level >= item.maxLevel;
  const price = maxed ? null : item.prices[level];
  let lock: LockReason | null = null;
  let needs: CrewId | null = null;
  let bypassed = false;
  if (maxed) {
    lock = 'max';
  } else {
    let cond: LockReason | null = null;
    if (item.blueprint && !save.blueprints.includes(item.blueprint)) cond = 'blueprint';
    else if (item.kind === 'upgrade' && item.weapon && !save.loadout.owned.includes(item.weapon)) cond = 'weapon';
    else {
      const who = item.crew[level] ?? null;
      if (who && !save.crew.includes(who)) {
        cond = 'crew';
        needs = who;
      }
    }
    if (cond && test) {
      bypassed = true;
      needs = null;
    } else if (cond) {
      lock = cond;
    }
    if (!lock && price !== null && save.crystals < price) lock = 'funds';
  }
  return {
    item,
    level,
    maxed,
    price,
    effect: level > 0 ? item.effects[level - 1] : null,
    nextEffect: maxed ? null : item.effects[level],
    canBuy: lock === null,
    lock,
    needs,
    lockText: lockLabel(lock, item, needs),
    bypassed,
  };
}

// ---------------------------------------------------------------- Achat

export type PurchaseResult =
  | { readonly ok: true; readonly id: HangarItemId; readonly level: number; readonly price: number; readonly crystals: number }
  | { readonly ok: false; readonly id: string; readonly reason: LockReason | 'unknown'; readonly text: string };

/**
 * Achat appliqué à une COPIE de la sauvegarde (la sauvegarde reçue n'est pas modifiée) : vérifie tout
 * (itemState), débite la réserve, monte d'un niveau ; une arme achetée rejoint loadout.owned dans l'ordre de
 * WEAPON_IDS (sans être équipée). Refusé : `save` est null.
 */
export function applyPurchase(
  save: Readonly<SaveData>,
  id: string,
  test: boolean = save.settings.unlockAll,
): { result: PurchaseResult; save: SaveData | null } {
  const item = getHangarItem(id);
  if (!item) return { result: { ok: false, id, reason: 'unknown', text: 'Achat inconnu' }, save: null };
  const st = itemState(save, item, test);
  if (!st.canBuy || st.price === null) {
    const reason = st.lock ?? 'max';
    return { result: { ok: false, id, reason, text: st.lockText || lockLabel(reason, item, st.needs) }, save: null };
  }
  const level = st.level + 1;
  const next: SaveData = {
    ...save,
    crystals: save.crystals - st.price,
    loadout: { ...save.loadout, owned: [...save.loadout.owned], skills: { ...save.loadout.skills } },
    upgrades: { ...save.upgrades },
    ship: { ...save.ship },
    crew: [...save.crew],
    blueprints: [...save.blueprints],
  };
  switch (item.kind) {
    case 'weapon': {
      const w = item.weapon as WeaponId;
      const owned = next.loadout.owned;
      next.loadout.owned = WEAPON_IDS.filter((x) => x === w || owned.includes(x));
      break;
    }
    case 'upgrade': {
      const w = item.weapon as WeaponId;
      next.upgrades[w] = { ...next.upgrades[w], [item.stat as UpgradeStat]: level };
      break;
    }
    case 'shipGun':
      next.ship.gun = level;
      break;
    case 'shipShield':
      next.ship.shield = level;
      break;
    case 'shipBoost':
      next.ship.boost = level;
      break;
    case 'heart':
      next.extraHearts = level;
      break;
  }
  return { result: { ok: true, id: item.id, level, price: st.price, crystals: next.crystals }, save: next };
}

// ---------------------------------------------------------------- Divers

/** Cristaux gagnés par une étape réussie (StageResult.crystals, 2D et vol : entier ≥ 0 ; absent : 0). */
export function stageCrystals(result: Readonly<StageResult>): number {
  const n = result.crystals;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
