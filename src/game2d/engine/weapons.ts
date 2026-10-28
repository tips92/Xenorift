import type { InputApi, WeaponId } from '../../core/types';
import {
  createWeaponStats,
  DEFAULT_WEAPON_MODS,
  OVERHEAT_RECOVER_AT,
  resolveWeapon,
  WEAPON_IDS,
  WEAPONS,
} from '../../core/weapons';
import type { WeaponMods, WeaponStats } from '../../core/weapons';
import type { PlatformScene } from './PlatformScene';

// Arme de Kaï, pilotée par sa fiche effective (core/weapons.ts : fiche × améliorations × bonus de cadence) :
// cadence, tir maintenu, rafale, plombs en éventail, dispersion, jauge de surchauffe. Direction : visée de Kaï.

/** Appui bref mémorisé (tapotement plus rapide que la cadence). */
const QUEUE_MS = 150;

/** Multiplicateur valide : nombre fini > 0. */
function validMul(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isMods(m: unknown): m is WeaponMods {
  if (m === null || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return validMul(o.damage) && validMul(o.fireRate) && validMul(o.range) && validMul(o.cooling);
}

/**
 * Améliorations du hangar de chaque arme (hooks.loadout.mods), relues une fois par partie : une arme dont les
 * multiplicateurs manquent ou sont invalides garde sa fiche d'origine (DEFAULT_WEAPON_MODS).
 */
function readMods(src: unknown): Record<WeaponId, Readonly<WeaponMods>> {
  const table = src !== null && typeof src === 'object' ? (src as Record<string, unknown>) : {};
  const out = {} as Record<WeaponId, Readonly<WeaponMods>>;
  for (const id of WEAPON_IDS) {
    const m = table[id];
    out[id] = isMods(m) ? { damage: m.damage, fireRate: m.fireRate, range: m.range, cooling: m.cooling } : DEFAULT_WEAPON_MODS;
  }
  return out;
}

export class Gun {
  heat = 0;
  overheated = false;
  /** Valeurs effectives de l'arme tenue (réécrites quand l'arme ou le bonus de cadence change). */
  readonly stats: WeaponStats = createWeaponStats();
  /** Améliorations de chaque arme (toutes, pas seulement l'équipée : __xr2d.weapon(id) en change). */
  private readonly allMods: Record<WeaponId, Readonly<WeaponMods>>;
  private id: WeaponId = 'laser';
  private rapid = false;
  private cooldownMs = 0;
  /** Depuis le dernier projectile (refroidissement hors surchauffe). */
  private sinceShotMs = 1e6;
  private queuedMs = 0;
  /** Rafale en cours : balles restantes, délai avant la suivante. */
  private burstLeft = 0;
  private burstMs = 0;

  /** `mods` : multiplicateurs par arme (hooks.loadout.mods) ; absent ou invalide : fiches d'origine. */
  constructor(
    private readonly scene: PlatformScene,
    weapon: WeaponId,
    mods?: unknown,
  ) {
    this.allMods = readMods(mods);
    this.setWeapon(weapon);
  }

  get weapon(): WeaponId {
    return this.id;
  }

  /** Améliorations de l'arme tenue (1 partout sans achat). */
  get mods(): Readonly<WeaponMods> {
    return this.allMods[this.id];
  }

  /** Change d'arme : fiche relue, jauge et cadence remises à zéro. */
  setWeapon(id: WeaponId): void {
    this.id = id;
    this.resolve();
    this.reset();
  }

  /** Bonus de cadence actif ou non (délai entre tirs et chauffe par tir réduits) ; fiche recalculée s'il change. */
  setRapid(on: boolean): void {
    if (on === this.rapid) return;
    this.rapid = on;
    this.resolve();
  }

  private resolve(): void {
    resolveWeapon(WEAPONS[this.id], this.allMods[this.id], this.rapid, this.stats);
  }

  update(dt: number, dtMs: number, input: InputApi): void {
    const st = this.stats;
    if (this.cooldownMs > 0) this.cooldownMs -= dtMs;
    this.sinceShotMs += dtMs;

    // Refroidissement : immédiat en surchauffe, sinon après une courte pause sans tirer (plus longue que la
    // cadence : le tir maintenu ne refroidit jamais).
    if (this.overheated) {
      this.heat -= st.coolRate * dt;
      if (this.heat < OVERHEAT_RECOVER_AT) this.overheated = false;
    } else if (this.sinceShotMs >= st.coolDelayMs) {
      this.heat -= st.coolRate * dt;
    }
    if (this.heat < 0) this.heat = 0;

    // Rafale commencée : elle va au bout, même si sa première balle a fait surchauffer l'arme.
    if (this.burstLeft > 0) {
      this.burstMs -= dtMs;
      while (this.burstLeft > 0 && this.burstMs <= 0) {
        this.burstLeft--;
        this.burstMs += st.burstGapMs;
        this.emit();
      }
    }

    if (input.consumePress('fire')) this.queuedMs = QUEUE_MS;
    else if (this.queuedMs > 0) this.queuedMs -= dtMs;

    const wants = this.queuedMs > 0 || input.state.fire;
    if (wants && this.cooldownMs <= 0 && !this.overheated && this.burstLeft === 0) {
      this.queuedMs = 0;
      this.shoot();
    }
  }

  /** Début d'un tir (ou d'une rafale) : cadence, première salve, chauffe (une fois par rafale). */
  private shoot(): void {
    const scene = this.scene;
    const st = this.stats;
    // Garde le reliquat pour une cadence régulière quand le tir est maintenu.
    this.cooldownMs = st.cooldownMs + Math.max(-20, Math.min(0, this.cooldownMs));
    this.burstLeft = st.burst - 1;
    this.burstMs = st.burstGapMs;
    this.emit();

    this.heat += st.heatPerShot;
    if (this.heat >= 1 - 1e-6) {
      this.heat = 1;
      this.overheated = true;
      scene.playSfx('overheat');
      scene.showToast('Surchauffe !', 'bad');
    }
  }

  /**
   * Une salve depuis la bouche du canon, selon la visée : une balle (dispersion tirée au hasard) ou les plombs
   * en éventail régulier. Éclat au canon, recul du bras, un son.
   */
  private emit(): void {
    const scene = this.scene;
    const st = this.stats;
    const p = scene.player;
    this.sinceShotMs = 0;
    const x = p.gunX;
    const y = p.gunY;
    // Épaule : le canon est balayé de là jusqu'à la bouche (mur ou ennemi au contact).
    const ox = p.shoulderX;
    const oy = p.shoulderY;
    const base = p.fireAngle;
    const n = st.pellets;
    if (n > 1) {
      for (let i = 0; i < n; i++) scene.lasers.fire(x, y, base + st.spreadRad * ((2 * i) / (n - 1) - 1), st, ox, oy);
    } else {
      scene.lasers.fire(x, y, st.spreadRad > 0 ? base + st.spreadRad * (Math.random() * 2 - 1) : base, st, ox, oy);
    }
    scene.fx.muzzle(x + Math.cos(base) * 6, y + Math.sin(base) * 6, st.color, this.rapid);
    p.onShot();
    scene.playSfx(st.sfx, 0.9, 0.96 + Math.random() * 0.08);
  }

  reset(): void {
    this.heat = 0;
    this.overheated = false;
    this.cooldownMs = 0;
    this.sinceShotMs = 1e6;
    this.queuedMs = 0;
    this.burstLeft = 0;
    this.burstMs = 0;
  }
}
