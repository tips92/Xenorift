import type { SfxId, WeaponId } from './types';

// Fiches des armes de Kaï (docs/plans/02-armes.md) : données et calculs purs, partagés par le jeu 2D,
// l'interface et plus tard le hangar. Lu aussi par Node (via game2d/constants.ts, scripts/check-levels.ts) :
// rien du navigateur, de Vite ni de Phaser, TypeScript effaçable, imports de valeurs avec l'extension .ts.
// Valeurs de départ, à régler après essai sur téléphone.

/** Toutes les armes, dans l'ordre d'affichage (choix de l'arme, hangar) = ordre d'obtention : le mitrailleur, la
 * meilleure, vient en dernier. */
export const WEAPON_IDS = ['laser', 'shotgun', 'rifle', 'machinegun'] as const satisfies readonly WeaponId[];

/** Fiche d'une arme. Points de vie des ennemis : 2 (normaux), 4 (blindé). */
export interface WeaponDef {
  readonly id: WeaponId;
  /** Nom affiché. */
  readonly name: string;
  /** Portée, en tuiles de 64 px : au-delà, le projectile s'éteint. */
  readonly rangeTiles: number;
  /** Projectiles par tir : plusieurs = éventail régulier sur ±spreadDeg (pompe). */
  readonly pellets: number;
  /** Dispersion (degrés, ± autour de la visée) : éventail si pellets > 1, sinon écart tiré au hasard à chaque balle. */
  readonly spreadDeg: number;
  /** Balles par appui : 1 = tir simple, plus = rafale (fusil d'assaut). Une rafale commencée va au bout. */
  readonly burst: number;
  /** Écart entre deux balles d'une rafale (ms) ; 0 sans rafale. */
  readonly burstGapMs: number;
  /** Délai entre deux tirs, ou entre deux débuts de rafale (ms). */
  readonly cooldownMs: number;
  /** Dégâts par projectile (par plomb, par balle de rafale). */
  readonly damage: number;
  /** Chauffe ajoutée par tir, jauge de 0 à 1 (rafale : une seule fois, à sa première balle). */
  readonly heatPerShot: number;
  /** Refroidissement, par seconde. */
  readonly coolRate: number;
  /**
   * Hors surchauffe, l'arme ne refroidit qu'après cette pause depuis le dernier projectile (ms). Plus long que
   * cooldownMs : le tir maintenu ne refroidit jamais (laser : 5 tirs puis surchauffe, comme avant).
   */
  readonly coolDelayMs: number;
  /** Vitesse du projectile, px/s. */
  readonly speed: number;
  /** Son du tir. */
  readonly sfx: SfxId;
  /** Couleur du tir (0xRRGGBB) : étincelles, éclat à la bouche, icône. */
  readonly color: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  // Polyvalent : 1 tir pour un ennemi normal, 2 pour le blindé (identique à l'ancien laser).
  laser: {
    id: 'laser',
    name: 'Pistolet laser',
    rangeTiles: 9,
    pellets: 1,
    spreadDeg: 0,
    burst: 1,
    burstGapMs: 0,
    cooldownMs: 160,
    damage: 2,
    heatPerShot: 0.2, // 5 tirs
    coolRate: 0.45,
    coolDelayMs: 260,
    speed: 900,
    sfx: 'laser',
    color: 0x8ffcff, // cyan-blanc
  },
  // Moyenne portée, arrose : 2 balles pour un ennemi normal.
  machinegun: {
    id: 'machinegun',
    name: 'Mitrailleur',
    rangeTiles: 7,
    pellets: 1,
    spreadDeg: 3,
    burst: 1,
    burstGapMs: 0,
    cooldownMs: 80,
    damage: 1,
    heatPerShot: 0.06, // ~16 tirs
    coolRate: 0.5,
    coolDelayMs: 260,
    speed: 1000,
    sfx: 'machinegun',
    color: 0x3ff0ff, // cyan, traits courts
  },
  // Courte portée, gros coup : au contact, un tir élimine un blindé.
  shotgun: {
    id: 'shotgun',
    name: 'Pompe',
    rangeTiles: 4,
    pellets: 5,
    spreadDeg: 14,
    burst: 1,
    burstGapMs: 0,
    cooldownMs: 600,
    damage: 1,
    heatPerShot: 0.34, // 3 tirs
    coolRate: 0.5,
    coolDelayMs: 700,
    speed: 1100,
    sfx: 'shotgun',
    color: 0xffb347, // ambre, petits plombs
  },
  // Longue portée, précis : une rafale élimine un blindé si deux balles touchent.
  rifle: {
    id: 'rifle',
    name: "Fusil d'assaut",
    rangeTiles: 12,
    pellets: 1,
    spreadDeg: 0,
    burst: 3,
    burstGapMs: 70,
    cooldownMs: 450,
    damage: 2,
    heatPerShot: 0.25, // 4 rafales
    coolRate: 0.4,
    coolDelayMs: 550,
    speed: 1400,
    sfx: 'rifle',
    color: 0xe9d4ff, // blanc-violet, long trait
  },
};

/** En surchauffe (refroidissement immédiat), le tir reprend quand la chauffe redescend sous ce seuil. */
export const OVERHEAT_RECOVER_AT = 0.3;

/**
 * Plombs (pellets > 1) : vitesse de chacun tirée au hasard dans ± cette part de la vitesse de la fiche, pour
 * une gerbe irrégulière (à vitesse égale, l'éventail formait une colonne de points). La portée ne change pas.
 */
export const PELLET_SPEED_JITTER = 0.08;

/** Bonus de cadence (bloc 3) : délai entre tirs et chauffe par tir multipliés (sinon on surchaufferait plus vite). */
export const RAPID_FIRE_MUL = { cooldown: 0.6, heat: 0.6 } as const;

/**
 * Améliorations d'une arme (hangar, étape 3) : multiplicateurs, 1 = fiche d'origine. fireRate = cadence
 * (délai entre tirs divisé), range = portée, cooling = refroidissement par seconde, damage = dégâts.
 */
export interface WeaponMods {
  damage: number;
  fireRate: number;
  range: number;
  cooling: number;
}

export const DEFAULT_WEAPON_MODS: Readonly<WeaponMods> = Object.freeze({ damage: 1, fireRate: 1, range: 1, cooling: 1 });

/** Valeurs effectives d'une arme (fiche × améliorations × bonus de cadence), écrites par resolveWeapon. */
export interface WeaponStats {
  id: WeaponId;
  /** Portée en tuiles (× TILE côté moteur). */
  rangeTiles: number;
  pellets: number;
  /** Dispersion en radians, ± autour de la visée. */
  spreadRad: number;
  burst: number;
  burstGapMs: number;
  cooldownMs: number;
  /** Dégâts par projectile, non arrondis (améliorations). */
  damage: number;
  heatPerShot: number;
  coolRate: number;
  coolDelayMs: number;
  speed: number;
  sfx: SfxId;
  color: number;
}

/** Nouvel objet de valeurs effectives (à créer une fois, puis à passer en `out` à resolveWeapon). */
export function createWeaponStats(): WeaponStats {
  return resolveWeapon(WEAPONS.laser, DEFAULT_WEAPON_MODS, false, {
    id: 'laser',
    rangeTiles: 0,
    pellets: 1,
    spreadRad: 0,
    burst: 1,
    burstGapMs: 0,
    cooldownMs: 0,
    damage: 0,
    heatPerShot: 0,
    coolRate: 0,
    coolDelayMs: 0,
    speed: 0,
    sfx: 'laser',
    color: 0,
  });
}

let scratch: WeaponStats | null = null;

/**
 * Valeurs effectives d'une arme, sans allocation : écrites dans `out` (par défaut un objet partagé, réécrit
 * à chaque appel : le recopier ou passer son propre objet pour le garder). Bonus de cadence (`rapid`) : délai
 * entre tirs et chauffe par tir × RAPID_FIRE_MUL ; l'écart entre balles d'une rafale ne change pas.
 */
export function resolveWeapon(
  def: Readonly<WeaponDef>,
  mods: Readonly<WeaponMods>,
  rapid: boolean,
  out?: WeaponStats,
): WeaponStats {
  const o = out ?? (scratch ??= createWeaponStats());
  o.id = def.id;
  o.rangeTiles = def.rangeTiles * mods.range;
  o.pellets = def.pellets;
  o.spreadRad = (def.spreadDeg * Math.PI) / 180;
  o.burst = def.burst;
  o.burstGapMs = def.burstGapMs;
  o.cooldownMs = (def.cooldownMs / mods.fireRate) * (rapid ? RAPID_FIRE_MUL.cooldown : 1);
  o.damage = def.damage * mods.damage;
  o.heatPerShot = def.heatPerShot * (rapid ? RAPID_FIRE_MUL.heat : 1);
  o.coolRate = def.coolRate * mods.cooling;
  o.coolDelayMs = def.coolDelayMs;
  o.speed = def.speed;
  o.sfx = def.sfx;
  o.color = def.color;
  return o;
}

/** Identifiant d'arme valide (sauvegarde, paramètre ?weapon=) ? Pas d'Object.hasOwn (ES2022) : build en es2020. */
export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, v);
}
