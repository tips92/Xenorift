// Noms montrés au joueur (armes, mondes, boss, compétences). Phrases complètes : pas d'accord français
// reporté. Noms propres : Kaï, LUMA, Tess, Comète, Xéna, Orak, Krator, Mira, Azur.
import type { BossId, SkillId, ThemeId, UpgradeStat, WeaponId } from '../types';
import { L, t, type L10n } from './locale.ts';

const WEAPON: Record<WeaponId, L10n> = {
  laser: L('Pistolet laser', 'Laser pistol', 'Laserpistole', 'Pistola laser', 'Pistola láser'),
  machinegun: L('Mitrailleur', 'Machine gun', 'Maschinengewehr', 'Mitragliatrice', 'Ametralladora'),
  shotgun: L('Pompe', 'Shotgun', 'Schrotflinte', 'Fucile a pompa', 'Escopeta'),
  rifle: L("Fusil d'assaut", 'Assault rifle', 'Sturmgewehr', "Fucile d'assalto", 'Fusil de asalto'),
};

export function weaponName(id: WeaponId): string {
  return t(WEAPON[id]);
}

export function weaponPack(id: WeaponId): L10n {
  return WEAPON[id];
}

/** Canon de la Comète (pas l'arme de Kaï). */
const SHIP_GUN: Record<'light' | 'minigun', L10n> = {
  light: L('Canon léger', 'Light cannon', 'Leichtkanone', 'Cannone leggero', 'Cañón ligero'),
  minigun: L('Mitrailleuse', 'Minigun', 'Minigun', 'Mitragliatrice di bordo', 'Ametralladora de a bordo'),
};

export function shipGunName(id: 'light' | 'minigun'): string {
  return t(SHIP_GUN[id]);
}

const STAT: Record<UpgradeStat, L10n> = {
  damage: L('Dégâts', 'Damage', 'Schaden', 'Danni', 'Daño'),
  fireRate: L('Cadence', 'Fire rate', 'Feuerrate', 'Cadenza', 'Cadencia'),
  range: L('Portée', 'Range', 'Reichweite', 'Gittata', 'Alcance'),
  cooling: L('Refroidissement', 'Cooling', 'Kühlung', 'Raffreddamento', 'Enfriamiento'),
};

export function statName(id: UpgradeStat): string {
  return t(STAT[id]);
}

const WORLD: Record<ThemeId, L10n> = {
  jungle: L('Jungle de Xéna', 'Jungle of Xéna', 'Dschungel von Xéna', 'Giungla di Xéna', 'Jungla de Xéna'),
  moon: L('Lune Krator', 'Krator Moon', 'Mond Krator', 'Luna Krator', 'Luna Krator'),
};

export function worldName(theme: ThemeId): string {
  return t(WORLD[theme]);
}

const BOSS: Record<BossId, L10n> = {
  blobKing: L('Blob-roi', 'Blob King', 'Blob-König', 'Re Blob', 'Rey Blob'),
  beetleTitan: L('Scarabée-titan', 'Titan Beetle', 'Titanenkäfer', 'Scarabeo titano', 'Escarabajo titán'),
  whale: L('Méduse-baleine', 'Whale jellyfish', 'Quallenwal', 'Medusa-balena', 'Medusa ballena'),
};

export function bossName(id: BossId): string {
  return t(BOSS[id]);
}

/** Barre du léviathan (nom propre, formes locales). */
const LEVIATHAN = L('Léviathan', 'Leviathan', 'Leviathan', 'Leviatano', 'Leviatán');

export function leviathanName(): string {
  return t(LEVIATHAN);
}

const SKILL: Record<SkillId, L10n> = {
  doubleJump: L('double saut', 'double jump', 'Doppelsprung', 'doppio salto', 'doble salto'),
};

export function skillName(id: SkillId): string {
  return t(SKILL[id]);
}

export function skillPack(id: SkillId): L10n {
  return SKILL[id];
}

const CREW_ROLE: Record<'tess' | 'mira', L10n> = {
  tess: L('mécanicienne', 'mechanic', 'Mechanikerin', 'meccanica', 'mecánica'),
  mira: L('biologiste', 'biologist', 'Biologin', 'biologa', 'bióloga'),
};

export function crewRole(id: 'tess' | 'mira'): string {
  return t(CREW_ROLE[id]);
}

/** Gardienne telle que dans la table des mondes (affichage). */
const GUARDIAN: Record<ThemeId, L10n> = {
  jungle: BOSS.whale,
  moon: L('Ver des sables', 'Sand worm', 'Sandwurm', 'Verme delle sabbie', 'Gusano de arena'),
};

export function guardianName(theme: ThemeId): string {
  return t(GUARDIAN[theme]);
}

const FLIGHT_BOSS: Record<ThemeId, L10n> = {
  jungle: L(
    'Léviathan de la nébuleuse',
    'Nebula leviathan',
    'Nebel-Leviathan',
    'Leviatano della nebulosa',
    'Leviatán de la nebulosa',
  ),
  moon: L('Ver cosmique', 'Cosmic worm', 'Kosmischer Wurm', 'Verme cosmico', 'Gusano cósmico'),
};

export function flightBossName(theme: ThemeId): string {
  return t(FLIGHT_BOSS[theme]);
}
