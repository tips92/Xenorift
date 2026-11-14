import type { WeaponId } from '../../core/types';
import { isWeaponId } from '../../core/weapons';
import type { ItemsSnapshot } from './items';
import type { EventsSnapshot } from './levelEvents';

// « Réessayer le combat » (plan 04, choix 7) : état de la partie noté quand Kaï allume le point de contrôle d'avant
// l'arène. Rendu à l'interface par onFail (StartAt.snapshot, opaque pour elle) si la partie se perd en plein combat,
// puis repassé tel quel dans ModeHooks.startAt : la scène repart de ce K avec cet état, 3 vies, sans prime de vies,
// boss à neuf. Jamais modifié après sa création (plusieurs essais repartent du même).

export interface FightSnapshot {
  /** LevelData.id : un instantané d'un autre niveau est ignoré. */
  readonly level: string;
  /** Temps de jeu (ms) et compteurs au point de contrôle. */
  readonly timeMs: number;
  readonly crystals: number;
  readonly enemiesKilled: number;
  /** Bonus en cours. */
  readonly speedLeftMs: number;
  readonly rapidLeftMs: number;
  readonly shield: boolean;
  readonly items: ItemsSnapshot;
  /** Ennemis de la carte morts (rangs dans EnemyManager.list). */
  readonly deadEnemies: readonly number[];
  /** Messages de LUMA et événements du décor déjà joués (null : niveau sans LevelEvents). */
  readonly events: EventsSnapshot | null;
  /** Naufragé secouru ; troncs abattus (dans l'ordre de LevelData.events). */
  readonly castaway: boolean;
  readonly trunks: readonly boolean[];
}

/**
 * Aller-retour d'une faille : même mémoire que le combat, plus l'endroit exact, les vies, les cœurs et l'arme.
 * Opaque pour l'interface (RiftTrip.snapshot). Au retour, la scène reprend cet état dans la salle du vortex.
 */
export interface RiftSnapshot extends FightSnapshot {
  readonly x: number;
  readonly y: number;
  readonly hearts: number;
  readonly lives: number;
  readonly weapon: WeaponId;
  readonly facing: 1 | -1;
  readonly respawnX: number;
  readonly respawnY: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNums = (v: unknown): boolean => Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0);

/** L'instantané de StartAt s'il vient bien de ce niveau et a la forme attendue, sinon null (départ au K seul). */
export function readFightSnapshot(raw: unknown, levelId: string): FightSnapshot | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Partial<FightSnapshot>;
  const it = s.items as Partial<ItemsSnapshot> | undefined;
  const ev = s.events as Partial<EventsSnapshot> | null | undefined;
  const ok =
    s.level === levelId &&
    isNum(s.timeMs) &&
    isNum(s.crystals) &&
    isNum(s.enemiesKilled) &&
    isNum(s.speedLeftMs) &&
    isNum(s.rapidLeftMs) &&
    typeof s.shield === 'boolean' &&
    typeof s.castaway === 'boolean' &&
    !!it &&
    isNums(it.crystals) &&
    isNums(it.bonus) &&
    isNums(it.checkpoints) &&
    Array.isArray(it.powers) &&
    it.powers.every((p) => !!p && isNum(p.x) && isNum(p.y)) &&
    isNums(s.deadEnemies) &&
    Array.isArray(s.trunks) &&
    (ev === null || (!!ev && Array.isArray(ev.windows) && Array.isArray(ev.events) && Array.isArray(ev.fired)));
  return ok ? (s as FightSnapshot) : null;
}

/** Instantané de faille s'il vient de ce niveau, sinon null (départ normal). */
export function readRiftSnapshot(raw: unknown, levelId: string): RiftSnapshot | null {
  const base = readFightSnapshot(raw, levelId);
  if (!base) return null;
  const s = raw as Partial<RiftSnapshot>;
  if (!isNum(s.x) || !isNum(s.y) || !isNum(s.hearts) || !isNum(s.lives)) return null;
  if (!isNum(s.respawnX) || !isNum(s.respawnY)) return null;
  if (s.facing !== 1 && s.facing !== -1) return null;
  if (!isWeaponId(s.weapon)) return null;
  return s as RiftSnapshot;
}
