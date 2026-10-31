import type { FlightBossId } from '../courses';
import { inAimCone, offerAim, type AimTarget } from '../shots';
import { LeviathanBoss } from './leviathan';
import type { FlightBoss, FlightBossContext, FlightBossDef } from './types';

// Registre des boss de vol (CourseDef.boss) : fiche (nom de la barre, prime, musique) et construction. Un identifiant
// de plus dans FLIGHT_BOSS_IDS (courses.ts) fait échouer tsc ici tant que sa fiche manque. Aussi : la visée et le
// pilote automatique de FlightRun pendant un combat.

interface FlightBossEntry {
  readonly def: FlightBossDef;
  create(def: FlightBossDef, ctx: FlightBossContext): FlightBoss;
}

const FLIGHT_BOSSES: Record<FlightBossId, FlightBossEntry> = {
  // 4 plaques dorsales puis 3 sur la queue (bosses/leviathan.ts). Prime entre un mini-boss (2 000) et un gardien
  // (5 000) : à régler sur téléphone.
  leviathan: {
    def: { name: 'Léviathan', bonus: 3000, music: 'boss' },
    create: (def, ctx) => new LeviathanBoss(def, ctx),
  },
};

/** Boss `id` construit (caché, état 'idle') ; FlightRun l'ajoute à la scène avant sa compilation. */
export function createFlightBoss(id: FlightBossId, ctx: FlightBossContext): FlightBoss {
  const e = FLIGHT_BOSSES[id];
  return e.create(e.def, ctx);
}

/**
 * Propose à `best` (offerAim de shots.ts, type 'boss') la cible exposée du boss la plus proche dans le cône de visée
 * (inAimCone, dx = cible − Comète en (x, y, z)), avec sa vitesse (visée en avance), sauf si un tir en route y est déjà
 * réservé (pending : une touche suffit, décision 20). Même règle qu'EnemyField.aim.
 */
export function aimBoss(boss: FlightBoss, x: number, y: number, z: number, cosCone: number, range: number, best: AimTarget): void {
  const ts = boss.targets;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (!t.alive || !t.open || boss.pending[i] > 0) continue;
    const d = inAimCone(t.x - x, t.y - y, t.z - z, cosCone, range);
    if (d >= 0) offerAim(best, 'boss', i, d, t.x, t.y, t.z, t.vx, t.vy, t.vz);
  }
}

/** Avance (s) du point d'alignement du pilote automatique sur une cible en mouvement. */
const AP_LEAD = 0.3;

/**
 * Pilote automatique (outil DEV) pendant le combat : point (x, y) où s'aligner, écrit dans `out` : la cible exposée
 * sans tir réservé la plus proche en latéral de (x, y), un peu en avance ; à défaut (tirs en route sur toutes), la
 * plus proche des cibles exposées. Faux sans cible exposée (arrivée, changement de phase : rien écrit).
 */
export function bossAutopilotSpot(boss: FlightBoss, x: number, y: number, out: { x: number; y: number }): boolean {
  const ts = boss.targets;
  let best = -1;
  let bestD = Infinity;
  let bestFree = false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (!t.alive || !t.open) continue;
    const free = boss.pending[i] <= 0;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = dx * dx + dy * dy;
    if ((free && !bestFree) || (free === bestFree && d < bestD)) {
      best = i;
      bestD = d;
      bestFree = free;
    }
  }
  if (best < 0) return false;
  const t = ts[best];
  out.x = t.x + t.vx * AP_LEAD;
  out.y = t.y + t.vy * AP_LEAD;
  return true;
}
