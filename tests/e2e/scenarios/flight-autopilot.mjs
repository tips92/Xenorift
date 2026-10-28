// Vols complets au pilote automatique (__xr3d.autopilot) à vitesse normale, sans raccourci (ni win, ni advance,
// ni timeScale) : Vol 1 (16 portails) puis Vol 2 (22 portails) lancé depuis le choix du niveau dans la même page.
// Chaque vol : aucun portail manqué, ni explosion ni temps écoulé, distorsion puis « VOL RÉUSSI » avec
// 16/16 (puis 22/22). Le renderer three.js est réutilisé : un seul canevas 3D dans la page à la fin.
// Combat (plan 03, 3b) : le pilote automatique tire en automatique et s'écarte des mines et des orbes ; il finit
// avec au moins un bouclier, des ennemis abattus et des cristaux ramassés ; appels de dessin relevés chaque
// seconde, toujours sous 150. Renderer partagé : rien ne survit d'une partie à l'autre (au départ de chaque vol,
// ni ennemi, ni orbe, ni tir, ni cristal en vol, compteurs à zéro, cristaux du HUD à 0) ; « +N cristaux » de
// chaque vol, réserve enregistrée = cristaux de f1 + f2.
import { assert, assertEq, readSave, screenText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import { gameCanvases, hudFlight, pickStage, press, resultDetails } from '../lib/core.mjs';

export const meta = {
  title: 'Vols complets au pilote automatique : f1 (16/16) et f2 (22/22)',
  suites: ['full'],
  dev: true,
  timeoutMs: 420000,
};

/** Durée maximale d'un vol (temps réel) : f1 dure ~1 min à vitesse normale, f2 un peu plus. */
const FLIGHT_MAX_MS = 180000;

/** Pilote automatique du départ à l'écran de résultats ; vérifie chaque seconde l'état du vol. */
async function autoFlight(t, id, gatesTotal) {
  // Nouvelle partie de ce vol (la précédente a disparu avec son __xr3d).
  await waitFor(t, (n) => !!(window.__xr3d && window.__xr3d.info().gatesTotal === n), {
    timeout: 60000,
    label: `vol ${id} démarré (${gatesTotal} portails)`,
    arg: gatesTotal,
  });
  // Partie neuve (compte à rebours : rien n'a encore bougé) : rien de la précédente
  const fresh = await t.ev(() => {
    const i = window.__xr3d.info();
    const c = document.querySelector('.fl-crystals .hud-num');
    return {
      phase: i.phase,
      enemies: i.enemies,
      orbs: i.orbsActive,
      shots: i.shotsActive,
      shotsFired: i.shotsFired,
      crystalsActive: i.crystalsActive,
      crystals: i.crystals,
      rocks: i.rocksDestroyed,
      points: i.points,
      heat: i.heat,
      hudCrystals: c ? c.textContent.trim() : null,
      hudOver: !!document.querySelector('.fl-heat.is-over'),
    };
  });
  t.log(`${id} : départ ${JSON.stringify(fresh)}`);
  assertEq(
    fresh,
    {
      phase: 'intro',
      enemies: { fighter: 0, mine: 0, swarm: 0, killed: 0 },
      orbs: 0,
      shots: 0,
      shotsFired: 0,
      crystalsActive: 0,
      crystals: 0,
      rocks: 0,
      points: 0,
      heat: 0,
      hudCrystals: '0',
      hudOver: false,
    },
    `${id} : partie neuve pendant le compte à rebours, rien de la précédente`,
  );
  await t.ev(() => window.__xr3d.autopilot(true));
  const t0 = Date.now();
  let last = null;
  let minShield = Infinity;
  let maxCalls = 0;
  let shotMid = false;
  const phases = new Set();
  for (;;) {
    const s = await t.ev(() => {
      const a = window.__xr3d;
      const r = document.querySelector('.screens [data-screen="results"].is-active');
      return { info: a ? a.info() : null, results: !!r };
    });
    if (s.info) {
      last = s.info;
      phases.add(s.info.phase);
      minShield = Math.min(minShield, s.info.shield);
      if (s.info.phase === 'fly') maxCalls = Math.max(maxCalls, s.info.drawCalls);
      assert(
        !['dead', 'timeout'].includes(s.info.phase),
        `${id} : le pilote automatique ne doit ni exploser ni manquer de temps (phase ${s.info.phase}, ${JSON.stringify(s.info)})`,
      );
      assert(
        s.info.nextGate === s.info.gates,
        `${id} : portail manqué par le pilote automatique (${s.info.gates} franchis sur ${s.info.nextGate} atteints)`,
      );
      if (!shotMid && s.info.phase === 'fly' && s.info.gates >= gatesTotal / 2) {
        shotMid = true;
        const h = await hudFlight(t);
        assertEq(h.gates, s.info.gates, `${id} : compteur de portails du HUD à mi-parcours`);
        await t.shot(`${id}-mid`);
      }
    }
    if (s.results) break;
    assert(Date.now() - t0 < FLIGHT_MAX_MS, `${id} : pas d'écran de résultats après ${FLIGHT_MAX_MS / 1000} s (dernier état ${JSON.stringify(last)})`);
    await t.wait(1000);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  t.log(`${id} : résultats après ${secs} s, phases ${[...phases].join(' > ')}, bouclier min ${minShield}, appels de dessin max ${maxCalls}, dernier état ${JSON.stringify(last)}`);
  assert(minShield >= 1, `${id} : au moins un bouclier pendant tout le vol (${minShield})`);
  assert(maxCalls > 0 && maxCalls < 150, `${id} : appels de dessin sous 150 en vol (max relevé ${maxCalls})`);
  assert(last.enemies.killed > 0 && last.crystals > 0, `${id} : ennemis abattus et cristaux ramassés par le tir automatique (${JSON.stringify({ enemies: last.enemies, crystals: last.crystals })})`);
  assert(phases.has('warp') || phases.has('done'), `${id} : la distorsion finale doit avoir eu lieu (phases vues : ${[...phases].join(', ')})`);
  assertEq(last.gates, gatesTotal, `${id} : portails franchis en fin de vol`);
  await waitForScreen(t, 'results', { timeout: 15000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `${id} : écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
  const det = await resultDetails(t);
  assertEq(det.Portails, `${gatesTotal}/${gatesTotal}`, `${id} : ligne Portails des résultats`);
  // Cristaux du vol : « +N cristaux » (au moins ceux du dernier relevé : le vol a pu en ramasser après)
  const gain = await t.ev(() => {
    const g = document.querySelector('.screens [data-screen="results"].is-active .detail-gain');
    return g ? Number(g.textContent.replace(/\D/g, '')) : 0;
  });
  assert(gain >= last.crystals && gain > 0, `${id} : « +N cristaux » aux résultats (${gain}, dernier relevé ${last.crystals})`);
  await t.shot(`${id}-results`);
  return gain;
}

/** Canevas three.js de la page : exactement un, dans #game-root. */
async function assertOneThreeCanvas(t, label) {
  const all = await t.ev(() => [...document.querySelectorAll('canvas[data-engine^="three"]')].map((c) => !!c.closest('#game-root')));
  assert(all.length === 1 && all[0], `${label} : un seul canevas three.js (dans #game-root) attendu, obtenu ${JSON.stringify(all)}`);
  const inRoot = await gameCanvases(t);
  t.log(`${label} : canevas de #game-root ${JSON.stringify(inRoot)}`);
  // Partie détruite derrière l'écran de résultats : le canevas reste prêt mais masqué.
  assert(inRoot.every((c) => !c.shown), `${label} : canevas de jeu masqués sous l'écran de résultats, obtenu ${JSON.stringify(inRoot)}`);
}

export default async function (t) {
  await t.goto('?touch=0&unlock=1&stage=f1');
  const g1 = await autoFlight(t, 'f1', 16);
  await assertOneThreeCanvas(t, 'après f1');
  assertEq((await readSave(t)).crystals, g1, 'réserve enregistrée = cristaux de f1');

  // Vol 2 depuis le choix du niveau (même page, même renderer)
  await press(t, 'results', 'Menu');
  await waitForScreen(t, 'title');
  await t.page.locator('.screens [data-screen="title"].is-active button', { hasText: 'Niveaux' }).click();
  await pickStage(t, 'f2');
  const g2 = await autoFlight(t, 'f2', 22);
  await assertOneThreeCanvas(t, 'après f2');
  assertEq((await readSave(t)).crystals, g1 + g2, 'réserve enregistrée = cristaux de f1 + f2');
}
