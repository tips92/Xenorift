import type { SfxId } from './types';

// Canons de la Comète (docs/plans/03-hangar.md, 3b) : fiches et calculs purs, dans le style de core/weapons.ts.
// Lu aussi par Node (via core/hangar.ts, scripts/check-levels.ts) : rien du navigateur, de Vite ni de three,
// TypeScript effaçable, imports de valeurs avec l'extension .ts. Valeurs de départ, à régler sur téléphone.

/** Canon léger (de série, sous le nez) ou mitrailleuse (achetée au hangar : deux canons sous les ailes). */
export type ShipGunId = 'light' | 'machinegun';

/** Fiche d'un canon. Points de vie en vol : astéroïdes 1 à 5, chasseur 3, mine 2, essaim 1. */
export interface ShipGunDef {
  readonly id: ShipGunId;
  /** Nom affiché. */
  readonly name: string;
  /** Délai entre deux tirs, toutes bouches confondues (ms). */
  readonly cooldownMs: number;
  /** Bouches, qui tirent chacune à leur tour (positions dans la maquette : game3d/ship.ts, muzzleWorld). */
  readonly muzzles: number;
  /** Dégâts par projectile. */
  readonly damage: number;
  /** Chauffe ajoutée par tir, jauge de 0 à 1 (tir continu : 1 / heatPerShot tirs avant la surchauffe). */
  readonly heatPerShot: number;
  /** Refroidissement, par seconde. */
  readonly coolRate: number;
  /** Hors surchauffe, refroidit seulement après cette pause sans tirer (ms ; > cooldownMs : le tir continu ne refroidit pas). */
  readonly coolDelayMs: number;
  /** Vitesse du projectile RELATIVE à la Comète (u/s) : sa vitesse absolue = vitesse d'avance + speed. */
  readonly speed: number;
  /** Portée : distance parcourue par la Comète en rangeSec secondes, à la vitesse de croisière du parcours. */
  readonly rangeSec: number;
  /** Trait lumineux : longueur et épaisseur (u). */
  readonly length: number;
  readonly width: number;
  /** Couleur du trait et de l'éclair de bouche (0xRRGGBB). */
  readonly color: number;
  /** Son d'un tir. */
  readonly sfx: SfxId;
}

export const SHIP_GUNS: Readonly<Record<ShipGunId, ShipGunDef>> = {
  // ~4 tirs/s ; tir continu : surchauffe au bout de ~4 s (16 tirs).
  light: {
    id: 'light',
    name: 'Canon léger',
    cooldownMs: 250,
    muzzles: 1,
    damage: 1,
    heatPerShot: 1 / 16,
    coolRate: 0.5,
    coolDelayMs: 400,
    speed: 190,
    rangeSec: 1.6,
    // Trait long : vu presque dans l'axe depuis la caméra de poursuite, il se raccourcit beaucoup
    length: 6,
    width: 0.16,
    color: 0x3ff0ff, // cyan
    sfx: 'shipGun',
  },
  // ~10 tirs/s en tout (les deux canons en alternance) ; tir continu : surchauffe au bout de ~3 s (30 tirs).
  machinegun: {
    id: 'machinegun',
    name: 'Mitrailleuse',
    cooldownMs: 100,
    muzzles: 2,
    damage: 1,
    heatPerShot: 1 / 30,
    coolRate: 0.55,
    coolDelayMs: 300,
    speed: 220,
    rangeSec: 1.6,
    length: 5,
    width: 0.12,
    color: 0x7ff6ff, // cyan clair (un blanc-cyan saturait en blanc : traits additifs)
    sfx: 'shipMachinegun',
  },
};

/**
 * Multiplicateurs selon le niveau du canon (ShipModules.gun : 0 canon léger, 1 mitrailleuse, 2 et 3 ses
 * améliorations) ; niveaux 0 et 1 = fiche d'origine. La cadence divise aussi la chauffe par tir : la durée de
 * tir continu avant la surchauffe ne raccourcit pas (~3 s), l'amélioration tire plus dans le même temps.
 */
export const SHIP_GUN_MULS: Readonly<{ damage: readonly number[]; fireRate: readonly number[] }> = {
  damage: [1, 1, 1.25, 1.5],
  fireRate: [1, 1, 1.15, 1.3],
};

/** Niveau max du canon (= MAX_SHIP_GUN_LEVEL de core/hangar.ts). */
const MAX_LEVEL = SHIP_GUN_MULS.damage.length - 1;

/**
 * Visée : cible = astéroïde ou ennemi le plus proche dans un cône devant la Comète (demi-angle coneDeg, axe −Z)
 * et à portée ; le tir part vers elle (visée en avance), écarté de l'axe d'au plus homingDeg.
 */
export const SHIP_AIM: Readonly<{ coneDeg: number; homingDeg: number }> = { coneDeg: 10, homingDeg: 6 };

/** Canon d'un niveau : 0 = canon léger, 1 à 3 = mitrailleuse. */
export function shipGunId(level: number): ShipGunId {
  return level >= 1 ? 'machinegun' : 'light';
}

/** Valeurs effectives du canon (fiche × niveau × parcours), écrites par resolveShipGun. */
export interface ShipGunStats {
  /** Niveau, entier de 0 à 3. */
  level: number;
  id: ShipGunId;
  name: string;
  cooldownMs: number;
  muzzles: number;
  /** Dégâts par projectile, non arrondis. */
  damage: number;
  heatPerShot: number;
  coolRate: number;
  coolDelayMs: number;
  /** Vitesse relative à la Comète (u/s). */
  speed: number;
  /** Portée (u) : rangeSec × vitesse de croisière du parcours. */
  range: number;
  /** Durée de vie d'un projectile (s) : range / speed (il s'éteint à `range` devant la Comète). */
  life: number;
  length: number;
  width: number;
  color: number;
  sfx: SfxId;
}

/** Nouvel objet de valeurs effectives (à créer une fois, puis à passer en `out` à resolveShipGun). */
export function createShipGunStats(): ShipGunStats {
  return resolveShipGun(0, 60, {
    level: 0,
    id: 'light',
    name: '',
    cooldownMs: 0,
    muzzles: 1,
    damage: 0,
    heatPerShot: 0,
    coolRate: 0,
    coolDelayMs: 0,
    speed: 0,
    range: 0,
    life: 0,
    length: 0,
    width: 0,
    color: 0,
    sfx: 'shipGun',
  });
}

let scratch: ShipGunStats | null = null;

/**
 * Valeurs effectives du canon, sans allocation : écrites dans `out` (par défaut un objet partagé, réécrit à
 * chaque appel). `level` hors de 0..3 ou invalide : borné (0 par défaut) ; `cruiseSpeed` : vitesse de
 * croisière du parcours (CourseDef.speed, u/s), 60 si invalide.
 */
export function resolveShipGun(level: number, cruiseSpeed: number, out?: ShipGunStats): ShipGunStats {
  const o = out ?? (scratch ??= createShipGunStats());
  const lv = Number.isFinite(level) ? Math.min(MAX_LEVEL, Math.max(0, Math.floor(level))) : 0;
  const cruise = Number.isFinite(cruiseSpeed) && cruiseSpeed > 0 ? cruiseSpeed : 60;
  const def = SHIP_GUNS[shipGunId(lv)];
  const rate = SHIP_GUN_MULS.fireRate[lv];
  o.level = lv;
  o.id = def.id;
  o.name = def.name;
  o.cooldownMs = def.cooldownMs / rate;
  o.muzzles = def.muzzles;
  o.damage = def.damage * SHIP_GUN_MULS.damage[lv];
  o.heatPerShot = def.heatPerShot / rate;
  o.coolRate = def.coolRate;
  o.coolDelayMs = def.coolDelayMs;
  o.speed = def.speed;
  o.range = def.rangeSec * cruise;
  o.life = o.range / def.speed;
  o.length = def.length;
  o.width = def.width;
  o.color = def.color;
  o.sfx = def.sfx;
  return o;
}
