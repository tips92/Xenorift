// Gardienne de j3 et perte du contexte WebGL (plan 04, étapes 10 et 11), lancé par ?at=boss (départ au seul point de
// contrôle du niveau, juste avant l'arène) :
//  A. perte en plein combat (après une touche) : combat figé (horloge de la scène, gardienne, acte), message
//     « Liaison graphique perdue… », puis restauration : le combat reprend (vie, phase, barrières, barre), aucun échec ;
//  B. défaite (__xr2d.boss.win : état exit, ≤ 2,62 s de séquence) puis perte définitive : la défaite reste figée (encore
//     en exit 3,5 s après), ~5 s plus tard l'étape est GAGNÉE une seule fois (« NIVEAU TERMINÉ », prime du gardien,
//     record de j3), jamais échouée ; REJOUER → jeu Phaser neuf au contexte vivant ;
//  C. perte définitive en plein combat : échec « Liaison graphique perdue » avec « Réessayer le combat » (plan 04,
//     choix 7), qui repart du K dans un jeu Phaser neuf, gardienne à neuf et cachée.
import { assert, assertEq, fmt, readSave, screenText, waitFor, waitForScreen } from '../lib/helpers.mjs';
import {
  LOST_REASON,
  RESTORE_WAIT_MS,
  WEBGL,
  ends,
  engine2d,
  gameInfo,
  loseGameOk,
  pageNow,
  phaserCanvases,
  pressScreen,
  progress2d,
  recordUi,
  restoreGame,
  screensSince,
  toastVisible,
  waitFail,
  waitGrounded,
  waitPlay,
} from '../lib/game2d.mjs';

export const meta = {
  title: 'Gardienne de j3 : perte du contexte en plein combat (restauré), pendant la défaite (étape gagnée), puis en plein combat (réessayer le combat)',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
};

const URL = '?touch=1&stage=j3&at=boss';

function boss(t) {
  return t.ev(() => (window.__xr2d ? window.__xr2d.boss.info() : null));
}

function waitBoss(t, src, label, timeout = 15000) {
  return waitFor(
    t,
    (s) => {
      const i = window.__xr2d && window.__xr2d.boss.info();
      return !!i && new Function('i', `return (${s});`)(i) && i;
    },
    { timeout, interval: 20, label, arg: src },
  );
}

/** Instantané du combat : horloge de la scène, état, gardienne. */
function snap(t) {
  return t.ev(() => {
    const s = window.__xr2d.scene;
    const b = s.boss;
    return { clock: s.clockMs, boss: b.clock, state: s.state, act: b.act, sub: b.sub, actMs: b.actMs, x: b.x, y: b.y, life: b.life, phase: b.phase };
  });
}

export default async function (t) {
  await recordUi(t);
  await t.goto(URL);
  const g1 = await waitPlay(t);
  await t.ev(() => {
    const s = window.__xr2d.scene;
    window.__xr2d.god(true);
    const h = s.session.hooks;
    const oc = h.onComplete;
    h.onComplete = (r) => {
      window.__jcResult = JSON.parse(JSON.stringify(r));
      return oc(r);
    };
  });
  await waitGrounded(t, 'A : Kaï au point de contrôle');
  const k = await t.ev(() => {
    const s = window.__xr2d.scene;
    return { x: Math.round(s.player.x), ks: s.parsed.checkpoints.map((c) => c.col), col0: s.arena.col0 };
  });
  assert(
    k.ks.length === 1 && k.x === k.ks[0] * 64 + 32 && k.col0 - k.ks[0] <= 6,
    `A : départ au point de contrôle d'avant l'arène, le seul du niveau (${fmt(k)})`,
  );

  // ---------- A. Perte en plein combat, puis restauration
  await t.ev(() => window.__xr2d.boss.enter());
  await waitBoss(t, "i.state === 'fight' && i.act !== 'intro'", 'A : combat commencé');
  await t.ev(() => window.__xr2d.boss.hit(1));
  await waitBoss(t, "i.act === 'slam'", 'A : tentacules abattus');
  const loss = await loseGameOk(t, 0, 'A : perte en plein combat');
  await waitFor(t, () => window.__xr2d.scene.session.gfxLost && window.__xr2d.scene.sys.isPaused(), { timeout: 5000, label: 'A : combat figé par la perte' });
  assert(await toastVisible(t, 'Liaison graphique perdue'), 'A : message « Liaison graphique perdue… »');
  const f0 = await snap(t);
  await t.wait(1200);
  const f1 = await snap(t);
  assertEq(f1, f0, 'A : combat figé pendant la perte (horloge, acte, position, vie)');
  await t.shot('A-lost');
  await restoreGame(t);
  await waitFor(t, () => !window.__xr2d.scene.session.gfxLost && window.__xr2d.scene.sys.isActive(), { timeout: 5000, label: 'A : contexte restauré, scène relancée' });
  await waitFor(t, (c) => window.__xr2d.scene.clockMs > c + 2500, { timeout: 10000, label: 'A : le combat reprend', arg: f1.clock });
  const a = await boss(t);
  const ran = (await snap(t)).boss - f1.boss;
  assert(
    a.state === 'fight' && a.life === 5 && a.phase === 1 && a.arena.state === 'closed' && a.visible && ran > 2000,
    `A : combat toujours en cours après la restauration, la gardienne de nouveau animée (${fmt({ a, ran })})`,
  );
  assert(await t.ev(() => document.querySelector('.hud-boss.is-on') !== null), 'A : barre de boss toujours affichée');
  await t.shot('A-restored');
  for (let now = await pageNow(t); now < loss.at + 6500; now = await pageNow(t)) await t.wait(250);
  assertEq((await ends(t, loss.at)).length, 0, 'A : aucun échec après la perte');

  // ---------- B. Défaite, puis perte définitive : étape gagnée une seule fois
  await waitBoss(t, "i.act === 'drift' || i.act === 'heart'", 'B : gardienne en place');
  const d = await t.ev(() => {
    window.__xr2d.boss.win();
    const s = window.__xr2d.scene;
    return { state: s.state, boss: s.boss.state };
  });
  assertEq(d, { state: 'exit', boss: 'beaten' }, 'B : défaite dans la scène (état exit)');
  await t.wait(300);
  const loss2 = await loseGameOk(t, 0, 'B : perte pendant la défaite');
  assert(loss2.state === 'exit', `B : perte pendant la défaite (état ${fmt(loss2.state)})`);
  await waitFor(t, () => window.__xr2d.scene.session.gfxLost && window.__xr2d.scene.sys.isPaused(), { timeout: 5000, label: 'B : défaite figée par la perte' });
  await t.shot('B-defeat-lost');
  // La défaite dure 2,5 s : 3,5 s après la perte, toujours figée, rien d'envoyé.
  await t.wait(3500);
  const mid = await engine2d(t);
  assert(mid && mid.state === 'exit' && (await ends(t, loss2.at)).length === 0, `B : défaite toujours figée 3,5 s après la perte (${fmt(mid)})`);
  await waitForScreen(t, 'results', { timeout: 20000 });
  const text = await screenText(t, 'results');
  assert(/NIVEAU TERMIN/i.test(text), `B : « NIVEAU TERMINÉ » (${text.slice(0, 160)})`);
  const e = await ends(t);
  assert(e.length === 1 && e[0].kind === 'complete' && e[0].sid === g1.sid, `B : un seul onComplete, aucun onFail (${fmt(e)})`);
  const delay = e[0].at - loss2.at;
  t.log(`étape gagnée ${delay} ms après la perte`);
  assert(delay >= RESTORE_WAIT_MS - 500 && delay <= RESTORE_WAIT_MS + 2500, `B : gagnée après le délai d'attente de la restauration (${delay} ms)`);
  const res = await t.ev(() => window.__jcResult);
  assert(res && res.stageId === 'j3' && res.bossBonus === 5000, `B : résultat de j3 avec la prime du gardien (${fmt(res)})`);
  await t.wait(1500);
  assert((await screensSince(t, 'fail', 0)).length === 0, 'B : aucun écran d’échec');
  assertEq((await ends(t)).length, 1, 'B : toujours un seul envoi');
  const save = await readSave(t);
  const j3 = await t.ev(() => window.__xrShell.info().stages.find((s) => s.id === 'j3'));
  assert(save.best && save.best.j3 && j3 && j3.cleared, `B : record de j3 et étape réussie (${fmt({ best: save.best, j3 })})`);
  await t.shot('B-results');

  // REJOUER : contexte de l'ancien jeu toujours perdu → instance Phaser neuve.
  await pressScreen(t, 'results', 'Rejouer');
  const g2 = await waitPlay(t);
  assert(g2.game !== g1.game, `REJOUER : jeu Phaser neuf attendu (jeu n°${g2.game})`);
  const old = await gameInfo(t, g1.game);
  assert(!old.canvasInDom, `REJOUER : canvas de l'ancien jeu retiré (${fmt(old)})`);
  const pc = await phaserCanvases(t);
  assert(pc.length === 1 && pc[0].display === 'block', `REJOUER : un seul canvas Phaser affiché (${fmt(pc)})`);
  const e2 = await engine2d(t);
  assert(e2.type === WEBGL && e2.contextLost === false, `REJOUER : rendu WebGL au contexte vivant (${fmt(e2)})`);
  const b2 = await boss(t);
  assert(b2.state === 'wait' && b2.life === 6 && b2.arena.state === 'open', `REJOUER : gardienne à neuf (${fmt(b2)})`);
  await t.shot('replay');

  // ---------- C. Perte définitive en plein combat : « Réessayer le combat »
  await t.ev(() => {
    window.__xr2d.god(true);
    window.__xr2d.boss.enter();
  });
  await waitBoss(t, "i.state === 'fight' && i.act !== 'intro'", 'C : combat commencé');
  await t.ev(() => window.__xr2d.boss.hit(1));
  const loss3 = await loseGameOk(t, 0, 'C : perte définitive en plein combat');
  assertEq(await waitFail(t, { timeout: 20000 }), LOST_REASON, 'C : motif de l’échec');
  const e3 = await ends(t, loss3.at);
  assert(e3.length === 1 && e3[0].kind === 'fail' && e3[0].retry === 'boss' && e3[0].sid === g2.sid, `C : un seul onFail, avec un point de reprise (${fmt(e3)})`);
  const buttons = await t.ev(() => [...document.querySelectorAll('.screens [data-screen="fail"].is-active .fail-actions button')].map((b) => b.textContent.trim()));
  assertEq(buttons, ['Réessayer le combat', 'Réessayer', 'Menu'], 'C : « Réessayer le combat » proposé');
  await t.shot('C-fail');
  await pressScreen(t, 'fail', 'Réessayer le combat');
  const g3 = await waitPlay(t);
  assert(g3.game !== g2.game, `C : jeu Phaser neuf (jeu n°${g3.game})`);
  const p = await progress2d(t);
  assert(p.retry && p.lives === 3 && p.k && p.x === p.k.x && p.k.on, `C : reprise au K, 3 vies (${fmt(p)})`);
  const b3 = await boss(t);
  assert(b3.state === 'wait' && !b3.visible && b3.life === 6 && b3.arena.state === 'open', `C : gardienne à neuf et cachée (${fmt(b3)})`);
}
