// Rendu et HUD des deux vols (f1 nébuleuse, f2 astéroïdes), lancés directement par ?stage= :
//  - nombre de portails du parcours (16 et 22) dans la partie et dans le HUD ;
//  - canevas 3D plein cadre (tampon = taille CSS, écran DPR 1) ;
//  - image éclairée (ni noire ni vide) pendant l'intro, vaisseau en gros plan (temps ralenti x0,1),
//    puis en vol ;
//  - en vol : la progression avance, le chrono de la partie décompte et le HUD l'affiche.
// Captures de référence (vaisseau, ciel, planètes) pour comparer le rendu d'une version à l'autre.
import { assert, fmt, waitFor, waitFor3dPhase } from '../lib/helpers.mjs';
import { assertFlying, flightInfo, frameLuma, waitNewRun } from '../lib/game3d.mjs';
import { canvases } from '../lib/gl.mjs';

export const meta = {
  title: 'Vols 1 et 2 : rendu, canevas et HUD',
  suites: ['full'],
  dev: true,
  timeoutMs: 150000,
};

/**
 * Chrono du HUD (« 01:12.0 » -> secondes, null s'il est illisible) et état de la partie, lus ensemble
 * (un portail franchi entre deux lectures séparées décalerait le chrono de la partie).
 */
function hudClock(t) {
  return t.ev(() => {
    const e = document.querySelector('.fl-timer');
    const m = e && /^(\d\d):(\d\d)\.(\d)$/.exec(e.textContent.trim());
    const i = window.__xr3d ? window.__xr3d.info() : null;
    return {
      hud: m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10 : null,
      timeLeft: i ? i.timeLeft : null,
      nextGate: i ? i.nextGate : null,
    };
  });
}

/** Portails affichés par le HUD : { n, total } (« 0 » et « /16 »). */
function hudGates(t) {
  return t.ev(() => {
    const g = document.querySelector('.fl-gates');
    if (!g) return null;
    const n = g.querySelector('.hud-num');
    const tot = g.querySelector('.hud-total');
    return { n: n ? Number(n.textContent) : null, total: tot ? Number(tot.textContent.replace('/', '')) : null };
  });
}

export default async function (t) {
  const vp = t.page.viewportSize();
  for (const [stage, gates] of [
    ['f1', 16],
    ['f2', 22],
  ]) {
    await t.goto(`?unlock=1&stage=${stage}`);
    await waitNewRun(t, null, { timeout: 60000 });
    // Intro ralentie : la caméra reste sur le vaisseau en gros plan
    await t.ev(() => window.__xr3d.timeScale(0.1));
    await waitFor(
      t,
      () => {
        const i = window.__xrShell && window.__xrShell.info();
        return !!(i && i.phase === 'playing' && !i.navLock && !i.fading);
      },
      { timeout: 20000, label: `${stage} : jeu dévoilé` },
    );

    const i0 = await flightInfo(t);
    assert(i0.phase === 'intro', `${stage} : phase intro attendue au lancement, obtenu ${fmt(i0.phase)}`);
    assert(i0.gatesTotal === gates, `${stage} : ${gates} portails attendus, obtenu ${i0.gatesTotal}`);
    const hg = await hudGates(t);
    assert(hg && hg.n === 0 && hg.total === gates, `${stage} : HUD « 0/${gates} » portails attendu, obtenu ${fmt(hg)}`);

    const three = (await canvases(t)).filter((c) => c.engine && c.engine.startsWith('three'));
    assert(three.length === 1, `${stage} : un canevas 3D attendu, obtenu ${fmt(three)}`);
    const c = three[0];
    assert(
      c.display !== 'none' && c.cssWidth === vp.width && c.cssHeight === vp.height && c.width === vp.width && c.height === vp.height,
      `${stage} : canevas 3D plein cadre ${vp.width}x${vp.height} attendu (DPR 1), obtenu ${fmt(c)}`,
    );

    const lumaIntro = await frameLuma(t);
    t.log(`${stage} : luminance intro ${lumaIntro}`);
    assert(lumaIntro > 3, `${stage} : image de l'intro éclairée attendue, luminance ${lumaIntro}`);
    await t.shot(`${stage}-intro-ship`);

    // Vol : progression, chrono du HUD qui décompte comme la partie
    await t.ev(() => window.__xr3d.timeScale(1));
    await waitFor3dPhase(t, 'fly', { timeout: 20000 });
    await assertFlying(t, `${stage} en vol`);
    const c1 = await hudClock(t);
    await t.wait(1500);
    const c2 = await hudClock(t);
    t.log(`${stage} : chrono HUD ${c1.hud} -> ${c2.hud} s, partie ${c1.timeLeft} -> ${c2.timeLeft} s, portail suivant ${c1.nextGate} -> ${c2.nextGate}`);
    for (const c of [c1, c2]) {
      assert(c.hud !== null && Math.abs(c.hud - c.timeLeft) <= 0.3, `${stage} : chrono du HUD aligné sur la partie attendu, obtenu ${fmt(c)}`);
    }
    // Portail franchi (bonus) ou manqué (pénalité) pendant la mesure : seul l'alignement compte.
    if (c2.nextGate === c1.nextGate) {
      const spent = c1.timeLeft - c2.timeLeft;
      assert(spent > 0.5 && spent < 3, `${stage} : le chrono doit décompter d'environ 1,5 s, obtenu ${spent.toFixed(1)} s`);
    }
    // Image du vol : instant figé pour la capture de référence
    await t.ev(() => window.__xr3d.timeScale(0.1));
    const lumaFly = await frameLuma(t);
    t.log(`${stage} : luminance en vol ${lumaFly}`);
    assert(lumaFly > 3, `${stage} : image du vol éclairée attendue, luminance ${lumaFly}`);
    await t.shot(`${stage}-fly`);
  }
}
