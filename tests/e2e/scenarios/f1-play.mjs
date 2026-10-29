// Vol 1 (f1) lancé par ?stage=f1, au clavier : compte à rebours 3, 2, 1, Go ! (~3 s) puis vol qui progresse,
// pilotage (gauche, droite, haut déplacent le vaisseau), turbo (Espace : vitesse en hausse, jauge d'énergie qui
// chauffe), tir seulement quand J est tenu (aucun tir sans appui, même avec une mine atteignable devant la Comète),
// portails comptés dans le HUD, pause par le bouton du HUD (vol figé)
// puis REPRENDRE,
// victoire (__xr3d.win) → écran « VOL RÉUSSI » avec le décompte des portails, progression sauvegardée.
import { assert, assertEq, info3d, readSave, screenText, waitFor, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import {
  hudFlight,
  pressPause,
  recordToasts,
  resultDetails,
  shipPos,
  toasts,
  trackThreeScenes,
  waitPause,
} from '../lib/core.mjs';
import { assertNoAutoFire } from '../lib/game3d.mjs';

export const meta = {
  title: 'Vol 1 : compte à rebours, pilotage, turbo et tir (énergie), portails, pause, victoire',
  suites: ['smoke', 'full'],
  dev: true,
  timeoutMs: 120000,
};

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Laisse le vaisseau s'arrêter (sans commande, sa vitesse latérale retombe à 0 en ~0,35 s), maintient
 * la touche `code` pendant `ms` ms et renvoie la position du vaisseau avant / après.
 */
async function steer(t, code, ms) {
  await t.wait(500);
  const a = await shipPos(t);
  await t.key(code, ms);
  const b = await shipPos(t);
  t.log(`${code} ${ms} ms : x ${r2(a.x)} -> ${r2(b.x)}, y ${r2(a.y)} -> ${r2(b.y)}`);
  return { a, b };
}

export default async function (t) {
  await trackThreeScenes(t);
  await recordToasts(t);
  await t.goto('?touch=0&unlock=1&stage=f1');

  // --- Compte à rebours : HUD du vol affiché, 0/16 portails
  await waitFor3dPhase(t, 'intro', { timeout: 45000 });
  const h0 = await hudFlight(t);
  assert(h0.visible, `HUD du vol attendu pendant le compte à rebours (${JSON.stringify(h0)})`);
  assertEq([h0.gates, h0.total], [0, 16], 'portails affichés au départ (passés, total)');
  await t.shot('countdown');
  await waitFor3dPhase(t, 'fly', { timeout: 30000 });
  const msgs = await toasts(t);
  const at = (txt) => (msgs.find((m) => m.text === txt) || {}).at;
  t.log('messages', msgs.map((m) => `${m.text}@${m.at}`).join(' '));
  for (const txt of ['3', '2', '1', 'Go !']) assert(at(txt) !== undefined, `message « ${txt} » du compte à rebours attendu (vus : ${msgs.map((m) => m.text).join(', ')})`);
  assert(at('3') < at('2') && at('2') < at('1') && at('1') < at('Go !'), 'compte à rebours dans l’ordre 3, 2, 1, Go !');
  const countdown = at('Go !') - at('3');
  // 3 s de temps de jeu ; le temps réel peut s'allonger (pas de temps borné quand le GPU cale), jamais raccourcir.
  assert(countdown >= 2700 && countdown <= 25000, `compte à rebours de ~3 s attendu entre « 3 » et « Go ! », obtenu ${countdown} ms`);

  // --- Vol : la progression avance (jeu et barre du HUD), le chronomètre tourne
  const i0 = await info3d(t);
  const hA = await hudFlight(t);
  await t.wait(1500);
  const i1 = await info3d(t);
  const hB = await hudFlight(t);
  assert(i1.progress > i0.progress, `la progression doit augmenter en vol (${i0.progress} -> ${i1.progress})`);
  assert(hB.progress > 0 && hB.progress >= hA.progress, `barre de progression du HUD (${hA.progress} -> ${hB.progress})`);
  assert(hB.timer !== hA.timer, `le chronomètre du HUD doit défiler (${hA.timer} -> ${hB.timer})`);
  await t.shot('flying');

  // --- Pilotage au clavier
  assert(await shipPos(t), 'vaisseau introuvable dans la scène three.js');
  const left = await steer(t, 'ArrowLeft', 700);
  assert(left.b.x < left.a.x - 2, `flèche gauche : x doit baisser d'au moins 2 (${r2(left.a.x)} -> ${r2(left.b.x)})`);
  const right = await steer(t, 'ArrowRight', 1000);
  assert(right.b.x > right.a.x + 3, `flèche droite : x doit augmenter d'au moins 3 (${r2(right.a.x)} -> ${r2(right.b.x)})`);
  const up = await steer(t, 'ArrowUp', 700);
  assert(up.b.y > up.a.y + 2, `flèche haut : y doit augmenter d'au moins 2 (${r2(up.a.y)} -> ${r2(up.b.y)})`);
  const down = await steer(t, 'ArrowDown', 700);
  assert(down.b.y < down.a.y - 2, `flèche bas : y doit baisser d'au moins 2 (${r2(down.a.y)} -> ${r2(down.b.y)})`);
  await t.shot('steer');

  // --- Turbo (Espace) : vitesse nettement plus haute, jauge d'énergie du HUD qui chauffe (repère du turbo
  // allumé), retour à la normale ensuite
  await waitFor(t, () => window.__xr3d.info().speed > 50, { timeout: 5000, label: 'vitesse de croisière' });
  const cruise = (await info3d(t)).speed;
  const e0 = (await hudFlight(t)).energy;
  await t.page.keyboard.down('Space');
  await t.wait(1000);
  const fast = (await info3d(t)).speed;
  const h1 = await hudFlight(t);
  await t.shot('boost');
  await t.page.keyboard.up('Space');
  t.log(`turbo : vitesse ${cruise} -> ${fast}, énergie ${e0} -> ${h1.energy}, repère du turbo ${h1.boosting}`);
  assert(fast >= cruise * 1.25, `Espace : vitesse attendue >= ${Math.round(cruise * 1.25)}, obtenu ${fast} (croisière ${cruise})`);
  assert(h1.energy >= e0 + 0.2 && h1.boosting && !h1.over, `Espace : la jauge d'énergie du HUD doit chauffer, repère du turbo allumé (${e0} -> ${JSON.stringify(h1)})`);
  // Espace relâché : la vitesse redescend (au moins 60 % du gain perdu).
  await waitFor(t, (lim) => window.__xr3d.info().speed <= lim, {
    timeout: 5000,
    label: 'retour vers la vitesse de croisière après le turbo',
    arg: cruise + (fast - cruise) * 0.4,
  });
  assert(!(await hudFlight(t)).boosting, 'Espace relâché : repère du turbo éteint');

  // --- Tir (J tenu) : la Comète ne tire que sur appui, tant que la touche est tenue ; aucun tir sans appui,
  // même avec une cible atteignable devant elle (mine posée, sous-pas simulés : pas de tir automatique)
  await assertNoAutoFire(t, 'clavier');
  const n1 = (await info3d(t)).shotsFired;
  await t.page.keyboard.down('KeyJ');
  await t.wait(700);
  const n2 = (await info3d(t)).shotsFired;
  await t.page.keyboard.up('KeyJ');
  await t.wait(300);
  const n3 = (await info3d(t)).shotsFired;
  t.log(`tir : J tenu 700 ms : ${n2 - n1} tirs, ${n3 - n2} après le relâcher`);
  assert(n2 >= n1 + 2, `J tenu : la Comète tire (${n1} -> ${n2})`);
  assert(n3 - n2 <= 1, `J relâché : le tir s'arrête (${n2} -> ${n3})`);

  // --- Portails : pilote automatique jusqu'à 2 portails, le HUD suit le compte du jeu
  await t.ev(() => window.__xr3d.autopilot(true));
  await waitFor(t, () => window.__xr3d.info().gates >= 2, { timeout: 45000, label: '2 portails franchis' });
  await waitFor(
    t,
    () => Number(document.querySelector('.fl-gates .hud-num').textContent) === window.__xr3d.info().gates,
    { timeout: 2000, label: 'compteur de portails du HUD = portails franchis' },
  );
  await t.shot('gates');

  // --- Pause par le bouton du HUD : menu ouvert, vol figé ; REPRENDRE : le vol repart
  await t.page.locator('.hud-pause').click();
  await waitPause(t, true);
  const p0 = await info3d(t);
  const s0 = await shipPos(t);
  await t.wait(800);
  const p1 = await info3d(t);
  const s1 = await shipPos(t);
  await t.shot('pause');
  assertEq(p1.progress, p0.progress, 'progression figée pendant la pause');
  assertEq(s1.z, s0.z, 'vaisseau immobile pendant la pause (z)');
  await pressPause(t, 'Reprendre');
  await waitPause(t, false);
  const q0 = await info3d(t);
  await t.wait(1000);
  const q1 = await info3d(t);
  assert(q1.progress > q0.progress, `après REPRENDRE, la progression doit repartir (${q0.progress} -> ${q1.progress})`);

  // --- Victoire : distorsion puis écran de résultats
  await t.ev(() => window.__xr3d.win());
  const fin = await waitFor(t, () => window.__xr3d && ['warp', 'done'].includes(window.__xr3d.info().phase) && window.__xr3d.info(), {
    timeout: 5000,
    label: 'phase warp après la victoire',
  });
  await waitForScreen(t, 'results', { timeout: 25000 });
  const text = await screenText(t, 'results');
  assert(/VOL RÉUSSI/i.test(text), `écran « VOL RÉUSSI » attendu (texte : ${text.slice(0, 160)})`);
  const det = await resultDetails(t);
  t.log('résultats', JSON.stringify(det));
  // win() franchit les portails restants ; seuls ceux manqués pendant le pilotage manuel manquent.
  assert(fin.gates >= 12, `presque tous les portails attendus après la victoire, obtenu ${fin.gates}/16`);
  assertEq(det.Portails, `${fin.gates}/16`, 'ligne Portails de l’écran de résultats');
  await t.shot('results');
  const save = await readSave(t);
  assert(save && save.best && save.best.f1 && save.best.f1.score > 0, `record de f1 sauvegardé (sauvegarde : ${JSON.stringify(save)})`);
  // Mode test (?unlock=1) : tout est ouvert ; l'étape réussie se lit dans `cleared`.
  const prog = await t.ev(() => window.__xrShell.info().stages.filter((s) => s.id === 'f1' || s.id === 'm1'));
  assertEq(prog.map((s) => [s.id, s.cleared, s.unlocked]), [['f1', true, true], ['m1', false, true]], 'f1 réussie, m1 non réussie (ouverte par le mode test)');
}
