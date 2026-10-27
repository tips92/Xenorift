// Diagnostic du vol 3D : trois lancements directs (f1 à froid, f2, puis f1 de nouveau, shaders en cache).
// Pour chacun : durée de chargement, étapes du constructeur de FlightRun (cuisson du ciel, compile(),
// 1re image : messages console.debug [flight3d] du serveur de dev), images par seconde seconde par seconde
// pendant les 10 premières secondes (phase, chrono du HUD), coût moyen d'une image (__xr3d.bench) et
// compteurs du renderer. En fin : journaux de programmes non vides (avertissements du compilateur D3D,
// matériau reconnu à ses uniformes) et pertes de contexte.
// Seul verdict : chaque partie démarre, vole et garde son contexte WebGL ; les chiffres sont à lire.
import { assert, fmt, waitFor3dPhase } from '../lib/helpers.mjs';
import { armBootLoss, bootInfo, flightInfo, waitNewRun } from '../lib/game3d.mjs';
import { contextLog, logContexts, webglRenderer } from '../lib/gl.mjs';

export const meta = {
  title: 'Diagnostic : images/s et démarrage du vol 3D',
  suites: ['diag'],
  dev: true,
  timeoutMs: 240000,
};

const SAMPLE_MS = 10000;

/** Journaux de programmes non vides, avec les uniformes du fragment shader pour reconnaître le matériau. */
async function logPrograms(t) {
  await t.page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype;
    const src = new WeakMap();
    const prog = new WeakMap();
    const oSrc = P.shaderSource;
    P.shaderSource = function (s, code) {
      src.set(s, code);
      return oSrc.call(this, s, code);
    };
    const oAtt = P.attachShader;
    P.attachShader = function (p, s) {
      const l = prog.get(p) || [];
      l.push(s);
      prog.set(p, l);
      return oAtt.call(this, p, s);
    };
    const oLog = P.getProgramInfoLog;
    window.__proglog = [];
    P.getProgramInfoLog = function (p) {
      const log = oLog.call(this, p);
      if (log && log.trim()) {
        const codes = (prog.get(p) || []).map((s) => src.get(s) || '');
        const frag = codes.find((c) => /gl_FragColor|pc_fragColor|fragColor/.test(c) && /void main/.test(c)) || codes[1] || '';
        // Uniformes propres au matériau (hors préfixe de three) et nom / type déclarés par three.
        const builtin = new Set(['viewMatrix', 'cameraPosition', 'isOrthographic', 'toneMappingExposure']);
        const uni = [...new Set([...frag.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)/g)].map((m) => m[1]))]
          .filter((u) => !builtin.has(u))
          .slice(0, 8)
          .join(',');
        const name = [...frag.matchAll(/#define SHADER_(?:NAME|TYPE) (\w+)/g)].map((m) => m[1]).join('/');
        window.__proglog.push({ name, uni, log: log.replace(/\s+/g, ' ').trim().slice(0, 200) });
      }
      return log;
    };
  });
}

/**
 * Images par seconde, seconde par seconde, pendant `ms` ms (requestAnimationFrame de la page), et instant
 * (ms depuis le chargement de la page) où la partie passe en phase 'fly', null s'il n'est pas vu.
 */
function sampleFps(t, ms) {
  return t.ev(
    (dur) =>
      new Promise((resolve) => {
        const out = [];
        let flyAt = null;
        let n = 0;
        let t1 = performance.now();
        const end = t1 + dur;
        const f = (now) => {
          n++;
          const a = window.__xr3d;
          const i = a && a.info();
          if (flyAt === null && i && i.phase === 'fly') flyAt = Math.round(now);
          if (now - t1 >= 1000) {
            const timer = document.querySelector('.fl-timer');
            out.push({
              fps: Math.round((n * 1000) / (now - t1)),
              phase: i ? i.phase : 'gone',
              progress: i ? i.progress : null,
              hud: timer ? timer.textContent : null,
            });
            n = 0;
            t1 = now;
          }
          if (now < end) requestAnimationFrame(f);
          else resolve({ series: out, flyAt });
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
}

export default async function (t) {
  await armBootLoss(t); // sans paramètre xrlose : simple suivi du démarrage
  await logContexts(t);
  await logPrograms(t);

  const rows = [];
  for (const [k, stage] of ['f1', 'f2', 'f1'].entries()) {
    const label = `${stage} #${k + 1}`;
    const t0 = Date.now();
    await t.goto(`?touch=1&unlock=1&stage=${stage}`);
    await waitNewRun(t, null, { timeout: 60000 });
    const loadMs = Date.now() - t0;
    const { series, flyAt } = await sampleFps(t, SAMPLE_MS);
    await waitFor3dPhase(t, 'fly', { timeout: 20000 });
    const flyMs = flyAt ?? (await t.ev(() => Math.round(performance.now())));
    const benchMs = await t.ev(() => window.__xr3d.bench(30));
    const info = await flightInfo(t);
    const boot = await bootInfo(t);
    const progs = await t.ev(() => window.__proglog || []);
    const ctx = await contextLog(t);
    if (k === 0) await t.shot('f1-flying');
    if (stage === 'f2') await t.shot('f2-flying');
    rows.push({ label, loadMs, flyMs, benchMs, info, boot, series, progs, ctx });

    t.log(`${label} : partie créée ${loadMs} ms après t.goto, vol (phase fly) à ${flyMs} ms du chargement ; bench ${benchMs} ms/image`);
    for (const m of boot.timings) t.log(`  ${m.msg} (à ${m.at} ms du chargement)`);
    t.log(`  programmes liés : ${boot.skyLinks} pour le ciel, ${boot.compileLinks} à la fin de compile(), ${boot.links} au total`);
    t.log(
      `  renderer : ${info.calls} appels, ${info.triangles} triangles, ${info.programs} programmes, ${info.textures} textures, ${info.geometries} géométries`,
    );
    t.log(`  images/s : ${series.map((s) => `${s.fps}${s.phase === 'fly' ? '' : `(${s.phase})`}`).join(' ')}`);
    t.log(`  chrono HUD : ${series.map((s) => s.hud || '-').join(' ')}`);

    assert(series.length >= SAMPLE_MS / 1000 - 2, `${label} : ${SAMPLE_MS / 1000} mesures d'images/s attendues, obtenu ${series.length}`);
    assert(
      boot.timings.some((m) => m.msg.startsWith('[flight3d] compile')),
      `${label} : message « [flight3d] compile » attendu (serveur de dev), obtenu ${fmt(boot.timings)}`,
    );
    assert(Number.isFinite(benchMs) && benchMs > 0, `${label} : bench invalide : ${fmt(benchMs)}`);
  }

  // Journaux de programmes (chaque chargement) : un seul exemplaire de chaque message.
  const seen = new Set();
  for (const r of rows) {
    for (const p of r.progs) {
      const key = `${p.name}|${p.uni}|${p.log}`;
      if (seen.has(key)) continue;
      seen.add(key);
      t.log(`journal de programme (${r.label}) [${p.name || '?'} ; uniformes ${p.uni || '-'}] : ${p.log}`);
    }
  }
  if (!seen.size) t.log('aucun journal de programme non vide');

  for (const r of rows) {
    const created = r.ctx.filter((e) => e.ev === 'create').length;
    const lost = r.ctx.filter((e) => e.ev === 'lost');
    t.log(`${r.label} : ${created} contexte(s) WebGL créé(s), ${lost.length} perdu(s)`);
    assert(lost.length === 0, `${r.label} : aucune perte de contexte attendue en vol normal, obtenu ${fmt(lost)}`);
  }
  t.log(`rendu : ${await webglRenderer(t)}`);
  t.log(`résumé : ${rows.map((r) => `${r.label} vol à ${r.flyMs} ms, ${Math.max(...r.series.map((s) => s.fps))} img/s max`).join(' | ')}`);
}
