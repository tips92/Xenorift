import type { CourseId } from '../core/types';

// « Réessayer le combat » en vol (plan 04, choix 7) : état de la partie noté au début du combat de boss (dernier
// portail passé). Rendu à l'interface par onFail (StartAt.snapshot, opaque pour elle) si la Comète est détruite (ou
// la liaison graphique perdue) en plein combat, puis repassé tel quel dans ModeHooks.startAt : FlightRun repart du
// début de l'arène avec cet état, boucliers pleins, sans prime sans dégâts, boss à neuf. Jamais modifié après sa
// création (plusieurs essais repartent du même). Même rôle que FightSnapshot du jeu 2D (game2d/engine/snapshot.ts).

export interface FlightSnapshot {
  /** Parcours : un instantané d'un autre parcours est ignoré. */
  readonly course: CourseId;
  /** Chrono au début du combat (figé pendant le combat : c'est celui du score), temps de vol (s). */
  readonly timeLeft: number;
  readonly flightTime: number;
  /** Compteurs au début du combat. */
  readonly gatesPassed: number;
  readonly points: number;
  readonly crystals: number;
  readonly rocksDestroyed: number;
  readonly enemiesKilled: number;
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** L'instantané de StartAt s'il vient bien de ce parcours et a la forme attendue, sinon null (combat seul). */
export function readFlightSnapshot(raw: unknown, course: CourseId): FlightSnapshot | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Partial<FlightSnapshot>;
  const ok =
    s.course === course &&
    isNum(s.timeLeft) &&
    s.timeLeft > 0 &&
    isNum(s.flightTime) &&
    s.flightTime >= 0 &&
    isCount(s.gatesPassed) &&
    isCount(s.points) &&
    isCount(s.crystals) &&
    isCount(s.rocksDestroyed) &&
    isCount(s.enemiesKilled);
  return ok ? (s as FlightSnapshot) : null;
}
