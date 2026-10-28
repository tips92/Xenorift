// Lanceur des tests de bout en bout de Xeno Rift : Chrome sans fenêtre piloté par playwright-core.
//
// Usage (depuis n'importe quel dossier) :
//   node tests/e2e/run.mjs                         -> suite « smoke »
//   node tests/e2e/run.mjs <nom> [<nom>...]        -> ces scénarios (tests/e2e/scenarios/<nom>.mjs)
//   node tests/e2e/run.mjs --suite smoke|full|diag|all
// Options :
//   --prod        teste le build de production : dist/ servi par « vite preview » sur le port 4173
//                 (dist/ doit exister : npm run build). Les aides DEV (__xr2d, __xr3d, __xrShell) y sont absentes :
//                 les scénarios marqués meta.dev sont alors ignorés (SKIP).
//   --repeat N    relance N fois chaque scénario (recherche d'instabilités)
//   --list        affiche les scénarios, leurs suites et leurs titres
// Variables d'environnement :
//   XR_BASE       URL imposée pour tous les scénarios (aucun serveur démarré ni arrêté)
//   XR_DEV_PORT   port du serveur de dev (5173 par défaut) ; XR_PROD_PORT : port de vite preview (4173)
//   XR_TMP        dossier temporaire (profil Chrome) ; par défaut D:/DevTools/tmp s'il existe (C: est plein)
//   XR_VERBOSE=1  affiche aussi les console.log / info de la page
//
// Chaque scénario reçoit un navigateur NEUF (shaders et GPU à froid) et un contexte neuf. Il échoue sur :
// exception ou assertion, délai dépassé (meta.timeoutMs, 120 s par défaut), erreur de page (pageerror),
// console.error non prévue par meta.allowConsole. Les avertissements console sont affichés, sans échec.
// Un seul lanceur pilote un navigateur à la fois (verrou xeno-rift-e2e.lock dans le dossier temporaire, commun
// à toutes les copies du dépôt) : l'iGPU de la machine perd le contexte WebGL sous charge concurrente.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCEN_DIR = path.join(HERE, 'scenarios');
const OUT_DIR = path.join(HERE, 'out');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

const SUITES = ['smoke', 'full', 'diag'];
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_VIEWPORT = { width: 844, height: 390 };
const DEV_PORT = Number(process.env.XR_DEV_PORT || 5173);
const PROD_PORT = Number(process.env.XR_PROD_PORT || 4173);
const SERVER_START_MS = 60_000;
const LOCK_POLL_MS = 2000;
const LOCK_MAX_MS = 30 * 60_000;
const VERBOSE = process.env.XR_VERBOSE === '1';

// Mêmes réglages que l'ancien banc (D:/DevTools/pw) : vrai GPU via ANGLE/D3D11, son sans geste.
const BROWSER_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-angle=d3d11',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (s) => String(s ?? '').split('\n').find((l) => l.trim()) ?? '';
const errText = (e) => (e && e.stack ? e.stack : e && e.message ? e.message : String(e));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rel = (f) => path.relative(process.cwd(), f).split(path.sep).join('/');

class UsageError extends Error {}

// ---------------------------------------------------------------- Dossier temporaire (tout sur D:)

function setupTemp() {
  let dir = process.env.XR_TMP;
  if (!dir && process.platform === 'win32' && fs.existsSync('D:/DevTools')) dir = 'D:/DevTools/tmp';
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  // os.tmpdir() relit ces variables : le profil temporaire de Chrome atterrit ici.
  process.env.TEMP = dir;
  process.env.TMP = dir;
  process.env.TMPDIR = dir;
}

// ---------------------------------------------------------------- Ligne de commande

function parseArgs(argv) {
  const o = { names: [], suite: null, prod: false, repeat: 1, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (flag) => {
      if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${flag} attend une valeur`);
      return v;
    };
    if (a === '--prod') o.prod = true;
    else if (a === '--list') o.list = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--suite' || a.startsWith('--suite=')) o.suite = val('--suite');
    else if (a === '--repeat' || a.startsWith('--repeat=')) o.repeat = Number(val('--repeat'));
    else if (a.startsWith('-')) throw new UsageError(`option inconnue : ${a}`);
    else o.names.push(path.basename(a).replace(/\.mjs$/, ''));
  }
  if (o.suite !== null && ![...SUITES, 'all'].includes(o.suite)) {
    throw new UsageError(`suite inconnue : ${o.suite} (smoke | full | diag | all)`);
  }
  if (!Number.isInteger(o.repeat) || o.repeat < 1) throw new UsageError('--repeat attend un entier >= 1');
  if (!o.names.length && o.suite === null) o.suite = 'smoke';
  return o;
}

function usage() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  const end = src.findIndex((l) => !l.startsWith('//'));
  console.log(src.slice(0, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

// ---------------------------------------------------------------- Scénarios

function checkMeta(mod) {
  const problems = [];
  if (typeof mod.default !== 'function') problems.push('export default async function (t) manquant');
  const m = mod.meta;
  if (!m || typeof m !== 'object') {
    problems.push('export const meta manquant');
    return { meta: { title: '', suites: [] }, problems };
  }
  if (typeof m.title !== 'string' || !m.title) problems.push('meta.title doit être une chaîne non vide');
  const suites = Array.isArray(m.suites) ? m.suites : [];
  if (!suites.length) problems.push("meta.suites doit être un tableau non vide (['smoke','full'], ['full'] ou ['diag'])");
  for (const s of suites) if (!SUITES.includes(s)) problems.push(`meta.suites : suite inconnue « ${s} »`);
  if (suites.length && !suites.includes('full') && !(suites.length === 1 && suites[0] === 'diag')) {
    problems.push("meta.suites : un vrai test doit être dans 'full' (seuls les diagnostics sont ['diag'] seul)");
  }
  if (m.timeoutMs !== undefined && !(Number.isFinite(m.timeoutMs) && m.timeoutMs > 0)) {
    problems.push('meta.timeoutMs doit être un nombre > 0');
  }
  if (
    m.viewport !== undefined &&
    !(m.viewport && Number.isInteger(m.viewport.width) && Number.isInteger(m.viewport.height))
  ) {
    problems.push('meta.viewport doit être { width, height } entiers');
  }
  if (m.allowConsole !== undefined && !(Array.isArray(m.allowConsole) && m.allowConsole.every((r) => r instanceof RegExp))) {
    problems.push('meta.allowConsole doit être un tableau de RegExp');
  }
  if (m.prod && m.dev) problems.push('meta.prod et meta.dev sont incompatibles');
  return {
    meta: {
      title: String(m.title ?? ''),
      suites,
      timeoutMs: m.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      viewport: m.viewport ?? DEFAULT_VIEWPORT,
      prod: !!m.prod,
      dev: !!m.dev,
      allowConsole: m.allowConsole ?? [],
    },
    problems,
  };
}

async function loadScenarios() {
  const files = fs.existsSync(SCEN_DIR) ? fs.readdirSync(SCEN_DIR).filter((f) => f.endsWith('.mjs')).sort() : [];
  const list = [];
  for (const f of files) {
    const name = f.slice(0, -4);
    const file = path.join(SCEN_DIR, f);
    try {
      const mod = await import(pathToFileURL(file).href);
      const { meta, problems } = checkMeta(mod);
      list.push({ name, file, run: mod.default, meta, problems });
    } catch (e) {
      list.push({ name, file, run: null, meta: { title: '', suites: [] }, problems: [`chargement impossible : ${errText(e)}`] });
    }
  }
  return list;
}

function inSuite(sc, suite) {
  if (suite === 'all') return sc.meta.suites.includes('full') || sc.meta.suites.includes('diag');
  return sc.meta.suites.includes(suite);
}

function printList(all) {
  const w = Math.max(9, ...all.map((s) => s.name.length));
  console.log(`${'scénario'.padEnd(w)}  ${'suites'.padEnd(16)}  titre`);
  for (const s of all) {
    const flags = [s.meta.prod ? 'prod' : '', s.meta.dev ? 'dev' : ''].filter(Boolean).join(',');
    const suites = s.meta.suites.join(',') + (flags ? ` [${flags}]` : '');
    console.log(`${s.name.padEnd(w)}  ${suites.padEnd(16)}  ${s.meta.title}`);
    for (const p of s.problems) console.log(`${' '.repeat(w)}  ! ${firstLine(p)}`);
  }
}

// ---------------------------------------------------------------- Verrou global (un navigateur à la fois)

let lockHeld = false;
// Dans le dossier temporaire (XR_TMP), pas dans out/ : partagé par toutes les copies du dépôt (worktrees).
let LOCK = '';

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function acquireLock() {
  LOCK = path.join(os.tmpdir(), 'xeno-rift-e2e.lock'); // après setupTemp()
  const t0 = Date.now();
  let announced = false;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      lockHeld = true;
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let raw;
    let age;
    try {
      raw = fs.readFileSync(LOCK, 'utf8').trim();
      age = Date.now() - fs.statSync(LOCK).mtimeMs;
    } catch {
      continue; // libéré entre-temps : on retente tout de suite
    }
    const pid = Number.parseInt(raw, 10);
    // Fichier vide : l'autre lanceur est peut-être entre openSync et writeSync ; périmé après 10 s.
    const stale = Number.isInteger(pid) && pid > 0 ? !pidAlive(pid) : age > 10_000;
    if (stale) {
      try {
        if (fs.readFileSync(LOCK, 'utf8').trim() === raw) fs.unlinkSync(LOCK);
        console.log(`verrou périmé supprimé (pid ${raw || '?'} absent)`);
      } catch {
        // déjà supprimé par un autre
      }
      continue;
    }
    if (!announced) {
      console.log(`en attente du verrou… (${LOCK} tenu par le pid ${pid})`);
      announced = true;
    }
    if (Date.now() - t0 > LOCK_MAX_MS) throw new Error(`verrou ${LOCK} toujours tenu par le pid ${pid} après 30 min`);
    await sleep(LOCK_POLL_MS);
  }
}

function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try {
    if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK);
  } catch {
    // rien à libérer
  }
}

// ---------------------------------------------------------------- Serveurs (dev 5173, preview 4173)

/** kind → { base, child | null } (child = serveur lancé par nous, à arrêter à la fin). */
const servers = new Map();
/** kind → message d'échec de démarrage (évite de réessayer 60 s pour chaque scénario). */
const serverErrors = new Map();

async function probe(base) {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(2500) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function isXeno(html) {
  return /<title>\s*Xeno Rift\s*<\/title>/i.test(html);
}

function isDevHtml(html) {
  return html.includes('/@vite/client');
}

/** Dernière modification des sources (src/, public/, index.html), pour signaler un dist/ périmé. */
function newestSourceMtime() {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
    else newest = Math.max(newest, st.mtimeMs);
  };
  for (const p of ['src', 'public', 'index.html', 'vite.config.ts']) walk(path.join(ROOT, p));
  return newest;
}

function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    // /T : arbre complet (vite + esbuild).
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function killServers() {
  for (const s of servers.values()) {
    if (s.child) {
      killChild(s.child);
      s.child = null;
    }
  }
}

async function startServer(kind) {
  const prod = kind === 'prod';
  const port = prod ? PROD_PORT : DEV_PORT;
  const base = `http://localhost:${port}/`;
  const what = prod ? 'vite preview' : 'serveur de dev';

  const html = await probe(base);
  if (html !== null) {
    if (!isXeno(html) || isDevHtml(html) !== !prod) {
      throw new Error(
        `le port ${port} répond mais ce n'est pas le ${prod ? 'build de production (vite preview)' : 'serveur de dev'} de Xeno Rift : arrêtez ce serveur ou utilisez XR_BASE`,
      );
    }
    console.log(`${what} déjà actif sur ${base} : réutilisé (il ne sera pas arrêté)`);
    return { base, child: null };
  }

  if (prod) {
    if (!fs.existsSync(DIST_INDEX)) {
      throw new Error(`dist/ absent (${rel(DIST_INDEX)} introuvable) : lancez d'abord « npm run build »`);
    }
    if (newestSourceMtime() > fs.statSync(DIST_INDEX).mtimeMs) {
      console.log('attention : dist/ est plus ancien que les sources (src/, public/…) : « npm run build » pour tester le code actuel');
    }
  }
  if (!fs.existsSync(VITE_BIN)) throw new Error(`vite introuvable (${rel(VITE_BIN)}) : lancez « npm install »`);

  const args = prod ? [VITE_BIN, 'preview', '--port', String(port), '--strictPort'] : [VITE_BIN, '--port', String(port), '--strictPort'];
  console.log(`démarrage : ${what} sur ${base}…`);
  // Node directement (pas de .cmd) : un seul processus à arrêter, pas de fenêtre ni de shell.
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: process.env });
  const output = [];
  const keep = (d) => {
    output.push(...String(d).split(/\r?\n/).filter(Boolean));
    if (output.length > 60) output.splice(0, output.length - 60);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const entry = { base, child };
  servers.set(kind, entry); // enregistré tout de suite : arrêté même si on est interrompu pendant l'attente

  const t0 = Date.now();
  try {
    for (;;) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`${what} arrêté au démarrage (code ${child.exitCode}) :\n    ${output.join('\n    ')}`);
      }
      const page = await probe(base);
      if (page !== null) {
        if (!isXeno(page)) throw new Error(`${what} sur ${base} ne sert pas Xeno Rift`);
        console.log(`${what} prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s (pid ${child.pid}, arrêté à la fin)`);
        return entry;
      }
      if (Date.now() - t0 > SERVER_START_MS) {
        throw new Error(`${what} ne répond pas sur ${base} après ${SERVER_START_MS / 1000} s :\n    ${output.join('\n    ')}`);
      }
      await sleep(300);
    }
  } catch (e) {
    killChild(child);
    entry.child = null;
    throw e;
  }
}

/** URL de base (avec / final) pour un scénario dev ou prod ; démarre le serveur si besoin. */
async function serverBase(kind) {
  if (process.env.XR_BASE) return process.env.XR_BASE.endsWith('/') ? process.env.XR_BASE : `${process.env.XR_BASE}/`;
  if (servers.has(kind)) return servers.get(kind).base;
  if (serverErrors.has(kind)) throw new Error(serverErrors.get(kind));
  try {
    const entry = await startServer(kind);
    servers.set(kind, entry);
    return entry.base;
  } catch (e) {
    servers.delete(kind);
    serverErrors.set(kind, e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- Exécution d'un scénario

/** Scénario en cours : reçoit les rejets de promesses non gérés. */
let current = null;
/** Navigateur ouvert : { browser, pid } (fermé à l'interruption). */
let currentBrowser = null;
let chromeVersionShown = false;

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`délai dépassé : ${label} a duré plus de ${ms / 1000} s (meta.timeoutMs)`);
      e.stack = e.message; // la pile du minuteur n'apprend rien
      reject(e);
    }, ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** pid du processus principal de Chrome (0 si inconnu), via CDP SystemInfo.getProcessInfo. */
async function browserPid(browser) {
  try {
    const s = await browser.newBrowserCDPSession();
    const { processInfo } = await s.send('SystemInfo.getProcessInfo');
    await s.detach().catch(() => {});
    const main = processInfo.find((p) => p.type === 'browser');
    return main ? main.id : 0;
  } catch {
    return 0;
  }
}

function killPidTree(pid) {
  if (!(pid > 0)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // déjà arrêté
    }
  }
}

/**
 * Ferme les contextes (pages déchargées proprement) puis arrête Chrome sans attendre :
 * sa fermeture normale (browser.close seul) prend 15 à 60 s sur cette machine.
 * browser.close() ne fait ensuite que constater la fin du processus et nettoyer le profil temporaire.
 */
async function closeBrowser(browser, pid) {
  if (!browser) return;
  await Promise.race([Promise.all(browser.contexts().map((c) => c.close().catch(() => {}))), sleep(5000)]);
  killPidTree(pid);
  await Promise.race([browser.close().catch(() => {}), sleep(15_000)]);
  // Dossiers temporaires que Chrome arrêté de force laisse derrière lui (chrome_chrome_url_fetcher_<pid>_…,
  // chrome_chrome_Unpacker_BeginUnzipping<pid>_…).
  if (pid > 0) {
    try {
      const tmp = os.tmpdir();
      const mine = new RegExp(`^chrome_chrome_.*?(?:^|[^0-9])${pid}_\\d+$`);
      for (const f of fs.readdirSync(tmp)) {
        if (mine.test(f)) fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
      }
    } catch {
      // sans importance
    }
  }
}

/** Agrandit une capture PNG `k` fois sans lissage (décodée et réencodée dans la page). */
async function upscalePng(page, buf, k) {
  const b64 = await page.evaluate(
    async ([src, f]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width * f;
      c.height = img.height * f;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    },
    [buf.toString('base64'), k],
  );
  return Buffer.from(b64, 'base64');
}

function makeT({ name, meta, browser, ctx, page, base, out, prod, t0 }) {
  let n = 0;
  let cdp = null;
  const t = {
    name,
    meta,
    browser,
    ctx,
    page,
    base,
    out,
    prod,
    dev: !prod,
    wait: (ms) => t.page.waitForTimeout(ms),
    // opts.clip { x, y, width, height } : une zone de la page seulement, agrandie opts.zoom fois (sans lissage).
    async shot(label, opts = {}) {
      const safe = String(label).replace(/[^\w.-]+/g, '_');
      const file = path.join(out, `${String(++n).padStart(2, '0')}-${safe}.png`);
      if (opts.clip) {
        const buf = await t.page.screenshot({ clip: opts.clip });
        const k = Number(opts.zoom) > 1 ? Number(opts.zoom) : 1;
        fs.writeFileSync(file, k > 1 ? await upscalePng(t.page, buf, k) : buf);
      } else {
        await t.page.screenshot({ path: file });
      }
      t.log(`capture ${rel(file)}`);
      return file;
    },
    ev: (fn, arg) => t.page.evaluate(fn, arg),
    async key(code, ms = 100) {
      await t.page.keyboard.down(code);
      await t.wait(ms);
      await t.page.keyboard.up(code);
    },
    goto: (q = '') => t.page.goto(new URL(q, base).href),
    log: (...args) => console.log(`  [${name} ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...args),
    async cdp() {
      if (!cdp) cdp = await t.ctx.newCDPSession(t.page);
      return cdp;
    },
  };
  return t;
}

async function runScenario(sc, opts, rep) {
  const label = opts.repeat > 1 ? `${sc.name} #${rep}` : sc.name;
  const res = { name: label, status: 'FAIL', ms: 0, errors: [] };
  const prod = opts.prod || sc.meta.prod;
  const t0 = Date.now();
  const fail = (msg) => res.errors.push({ at: Date.now() - t0, msg });

  console.log(`\n=== ${label} : ${sc.meta.title || '(sans titre)'}${prod ? ' [prod]' : ''}`);
  if (sc.problems.length) {
    for (const p of sc.problems) fail(`scénario invalide : ${p}`);
    return finish(res, t0);
  }
  if (prod && sc.meta.dev) {
    res.status = 'SKIP';
    res.errors.push({ at: 0, msg: 'nécessite les aides DEV (meta.dev) : ignoré avec --prod' });
    console.log('  ignoré : nécessite les aides DEV (meta.dev), absentes du build de production');
    return finish(res, t0);
  }

  let base;
  try {
    base = await serverBase(prod ? 'prod' : 'dev');
  } catch (e) {
    fail(`serveur indisponible : ${e.message}`);
    return finish(res, t0);
  }

  const scenOut = path.join(OUT_DIR, sc.name);
  const out = opts.repeat > 1 ? path.join(scenOut, `run${rep}`) : scenOut;
  if (rep === 1) fs.rmSync(scenOut, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const warnings = new Map();
  const allow = sc.meta.allowConsole;
  let browser = null;
  let pid = 0;
  let t = null;
  /** Vrai une fois le scénario terminé : les messages émis pendant la fermeture ne comptent plus. */
  let closing = false;
  current = { fail };
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: BROWSER_ARGS,
      // Signaux gérés par le lanceur (fermeture propre, arrêt des serveurs, verrou).
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    pid = await browserPid(browser);
    currentBrowser = { browser, pid };
    if (!chromeVersionShown) {
      chromeVersionShown = true;
      console.log(`  Chrome ${browser.version()} (sans fenêtre, ANGLE/D3D11), base ${base}`);
    }
    const ctx = await browser.newContext({ viewport: sc.meta.viewport, deviceScaleFactor: 1, hasTouch: true });
    ctx.on('console', (m) => {
      if (closing) return;
      const type = m.type();
      const text = m.text();
      if (type === 'error') {
        if (allow.some((re) => re.test(text))) return;
        const loc = m.location();
        fail(`console.error : ${text}${loc && loc.url ? ` (${loc.url}:${loc.lineNumber})` : ''}`);
      } else if (type === 'warning') {
        warnings.set(text, (warnings.get(text) || 0) + 1);
      } else if (VERBOSE) {
        console.log(`  [page ${type}] ${clip(text, 300)}`);
      }
    });
    ctx.on('weberror', (we) => {
      if (!closing) fail(`pageerror : ${errText(we.error())}`);
    });
    ctx.on('page', (p) =>
      p.on('crash', () => {
        if (!closing) fail('la page a planté (crash du processus de rendu)');
      }),
    );
    const page = await ctx.newPage();
    t = makeT({ name: sc.name, meta: sc.meta, browser, ctx, page, base, out, prod, t0 });
    const run = Promise.resolve().then(() => sc.run(t));
    run.catch(() => {}); // après un délai dépassé, la suite du scénario échoue en silence (navigateur fermé)
    await withTimeout(run, sc.meta.timeoutMs, sc.name);
  } catch (e) {
    fail(errText(e));
  }
  if (res.errors.length && t) {
    try {
      await withTimeout(t.shot('fail'), 10_000, 'capture fail');
    } catch {
      // page plantée ou fermée : pas de capture
    }
  }
  closing = true;
  await closeBrowser(browser, pid);
  currentBrowser = null;
  current = null;

  if (warnings.size) {
    const list = [...warnings.entries()];
    console.log(`  avertissements console (${list.length} distincts) :`);
    for (const [text, count] of list.slice(0, 12)) console.log(`    ${count > 1 ? `x${count} ` : ''}${clip(text.replace(/\s+/g, ' '), 220)}`);
    if (list.length > 12) console.log(`    … ${list.length - 12} autres`);
  }
  if (!res.errors.length) res.status = 'PASS';
  return finish(res, t0);
}

function finish(res, t0) {
  res.ms = Date.now() - t0;
  res.errors.sort((a, b) => a.at - b.at);
  const secs = (res.ms / 1000).toFixed(1);
  if (res.status === 'FAIL') {
    console.log(`  -> FAIL (${secs} s)`);
    res.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.msg.split('\n').join('\n     ')}`));
  } else {
    console.log(`  -> ${res.status} (${secs} s)`);
  }
  return res;
}

function printSummary(results) {
  const w = Math.max(9, ...results.map((r) => r.name.length));
  console.log('\nRésumé');
  console.log(`${'scénario'.padEnd(w)}  résultat  ${'durée'.padStart(7)}  première erreur`);
  for (const r of results) {
    const err = r.errors.length ? clip(firstLine(r.errors[0].msg), 110) : '';
    console.log(`${r.name.padEnd(w)}  ${r.status.padEnd(8)}  ${`${(r.ms / 1000).toFixed(1)} s`.padStart(7)}  ${err}`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  const skip = count('SKIP');
  console.log(`${results.length} scénario(s) : ${count('PASS')} réussi(s), ${count('FAIL')} échoué(s)${skip ? `, ${skip} ignoré(s)` : ''}`);
}

// ---------------------------------------------------------------- Arrêt propre

function cleanupSync() {
  killServers();
  releaseLock();
}

let stopping = false;
async function onSignal(sig) {
  if (stopping) return;
  stopping = true;
  console.log(`\ninterruption (${sig}) : fermeture du navigateur, arrêt des serveurs lancés ici, libération du verrou…`);
  if (current) current.fail(`interrompu (${sig})`);
  if (currentBrowser) await closeBrowser(currentBrowser.browser, currentBrowser.pid);
  cleanupSync();
  process.exit(130);
}

// ---------------------------------------------------------------- Programme principal

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`erreur : ${e.message}\n`);
    usage();
    return 2;
  }
  if (opts.help) {
    usage();
    return 0;
  }

  const all = await loadScenarios();
  if (opts.list) {
    printList(all);
    return 0;
  }

  const byName = new Map(all.map((s) => [s.name, s]));
  const unknown = opts.names.filter((n) => !byName.has(n));
  if (unknown.length) {
    console.error(`scénario(s) inconnu(s) : ${unknown.join(', ')}\ndisponibles : ${all.map((s) => s.name).join(', ') || '(aucun)'}`);
    return 2;
  }
  const selected = [];
  const add = (s) => {
    if (!selected.includes(s)) selected.push(s);
  };
  for (const n of opts.names) add(byName.get(n));
  if (opts.suite) for (const s of all) if (inSuite(s, opts.suite)) add(s);
  if (!selected.length) {
    console.log(`aucun scénario dans la suite « ${opts.suite} »`);
    return 0;
  }

  setupTemp();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    try {
      process.on(sig, () => void onSignal(sig));
    } catch {
      // signal non pris en charge sur cette plateforme
    }
  }
  process.on('exit', cleanupSync);
  process.on('unhandledRejection', (e) => {
    const msg = errText(e);
    // Reste d'un scénario déjà terminé (navigateur fermé) : sans conséquence.
    if (!current || /has been closed|Target closed/i.test(msg)) return;
    current.fail(`promesse rejetée non gérée : ${msg}`);
  });

  const what = [opts.names.length ? opts.names.join(' ') : '', opts.suite ? `suite ${opts.suite}` : ''].filter(Boolean).join(' + ');
  console.log(
    `Xeno Rift e2e : ${selected.length} scénario(s) (${what})${opts.prod ? ', build de production' : ''}${opts.repeat > 1 ? `, x${opts.repeat}` : ''}`,
  );

  await acquireLock();
  const results = [];
  try {
    for (let rep = 1; rep <= opts.repeat && !stopping; rep++) {
      for (const sc of selected) {
        results.push(await runScenario(sc, opts, rep));
        if (stopping) break;
      }
    }
  } finally {
    killServers();
    releaseLock();
  }
  printSummary(results);
  if (stopping) return 130;
  return results.some((r) => r.status === 'FAIL') ? 1 : 0;
}

main().then(
  (code) => {
    cleanupSync();
    process.exit(code);
  },
  (e) => {
    console.error(`erreur du lanceur : ${errText(e)}`);
    cleanupSync();
    process.exit(1);
  },
);
