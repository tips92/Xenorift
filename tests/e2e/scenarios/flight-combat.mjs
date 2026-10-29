// Combat en vol (plan 03, étape 3b ; décision du 29/10/2026 : tir seulement quand TIR est tenu, énergie partagée par
// le tir et le turbo) : tir de la Comète, visée, astéroïdes destructibles, cristaux du vol, ennemis, énergie.
//  0. Parcours (import du module dans la page) : vagues déterministes (deux constructions identiques, types et
//     effectifs attendus), hors des portails et de leur ligne d'approche (fenêtres de genWaves recopiées) ; portails,
//     rochers (tous les champs), trajectoire et distorsion de f1 / f2 identiques à ceux d'avant 3b (hachage recopié).
//  A. f1, canon léger, pilote automatique (il tient TIR sur les cibles atteignables) : chasseur posé tout de suite,
//     abattu en 3 coups (2 sons « touché ») ; mine posée à 60 u abattue en < 1 s sans bouclier perdu (50 points,
//     1 cristal lâché au pas même de sa mort, puis ramassé) ; chasseur abattu (150 points, 2 cristaux) ; rochers
//     détruits sans bouclier perdu ; le pilote ne tire jamais sans cible atteignable (toutes les traces) ; cristal du
//     HUD = cristaux ramassés, un son par tir ; capture d'un chasseur sous le feu ; victoire : score = base d'avant
//     3b + points du combat, étoiles des portails seulement, score affiché = record, « +N cristaux », réserve et
//     sauvegarde.
//  B. f1, mitrailleuse (ship.gun = 1) : jauge data-gun="machinegun", chasseur abattu en 3 coups ; essaim de 6
//     (variante fixée) abattu en entier par le pilote automatique (30 points chacun), cristal de la vague lâché à la
//     mort du dernier, aucun aux autres ; essaim à orientation libre (journalisé ; s'il est incomplet : aucun cristal) ;
//     pilote coupé, TIR tenu (fire) : cadence 10 tirs/s, deux bouches en alternance, surchauffe en ~2,9 s de tir
//     continu (jauge .is-over), reprise sous 30 % (jauge rallumée) ; captures de la Comète armée (de face pendant le
//     compte à rebours, de dos en vol, en plein tir).
//  B3. f1, mitrailleuse niveau 3 : chasseur abattu en 2 coups (dégâts 1,5), cadence 13 tirs/s, surchauffe après 39 tirs.
//  C. f1, commandes du vol, 5 boucliers : gros TIR en bas à droite, TURBO plus petit au-dessus ; aucun tir sans
//     appui ; mine frôlée : un bouclier perdu, ni points ni ennemi abattu ni cristal ; orbe du chasseur reçue : un
//     bouclier perdu ; TIR tactile, joystick + TURBO + TIR tenus ensemble, clavier J / X / F ; canon léger : cadence
//     4 tirs/s, surchauffe en ~3,75 s, reprise ; énergie : turbo seul (Espace) qui chauffe la jauge de 0,4 par
//     seconde (surchauffe en 2,5 s, turbo coupé), puis en surchauffe ni turbo ni tir malgré Espace et TIR tenus
//     jusqu'à 30 %, puis les deux reprennent ; TIR et turbo ensemble : chauffes additionnées (surchauffe en ~1,5 s) ;
//     gros plans (chasseur, mine, essaim, explosion, cristaux) ; HUD à 844x390 et 640x320 ; J tire aussi sans cible
//     pendant que le pilote automatique vole.
//  D. f2, mitrailleuse : captures de près dans la ceinture, puis vol au pilote automatique (x2,5) : les trois types
//     d'ennemis rencontrés, appels de dessin toujours sous 150 (relevés pendant les vagues).
// Les mesures fines passent par __xr3d.advance(1/60) (sous-pas simulés d'affilée : temps de jeu exact). Les ennemis
// posés par spawn ont une variante fixée (troisième argument) : même orientation et même mouvement à chaque passage.
import { assert, assertEq, assertNear, center, fmt, readSave, waitFor, waitFor3dPhase, waitForScreen } from '../lib/helpers.mjs';
import { rects, trackThreeScenes, waitInput, waitInputIdle } from '../lib/core.mjs';
import { touches } from '../lib/touch.mjs';

export const meta = {
  title: 'Combat en vol : TIR tenu, énergie (tir et turbo), rochers, cristaux, chasseur, mine, essaim, appels de dessin',
  suites: ['full'],
  dev: true,
  timeoutMs: 600000,
};

// ---------------------------------------------------------------- Valeurs recopiées (à mettre à jour après un réglage)

/**
 * Fiches des canons (src/core/shipGuns.ts × SHIP_GUN_MULS) : tirs par seconde, délai entre deux tirs (s), tirs
 * avant la surchauffe, refroidissement ; coups pour abattre un chasseur (3 PV) : dégâts 1, 1 et 1,5.
 */
const GUNS = {
  light: { rate: 4, cooldown: 0.25, shotsToOver: 16, coolRate: 0.5, fighterHits: 3 },
  machinegun: { rate: 10, cooldown: 0.1, shotsToOver: 30, coolRate: 0.55, fighterHits: 3 },
  machinegun3: { rate: 13, cooldown: 1 / 13, shotsToOver: 39, coolRate: 0.55, fighterHits: 2 },
};
const RECOVER_AT = 0.3;
/** Énergie (SHIP_ENERGY de src/core/shipGuns.ts) : chauffe du turbo par seconde (2,5 s depuis une jauge froide). */
const BOOST_HEAT = 0.4;
/** Points (src/game3d/flight.ts, enemies.ts). */
const POINTS = { rock: 10, crystal: 50, fighter: 150, mine: 50, swarm: 30 };
/** Cristaux lâchés (ENEMY_DEFS, SWARM_WAVE_CRYSTALS de enemies.ts). */
const DROPS = { fighter: 2, mine: 1, swarmWave: 1 };
/** Score d'avant 3b (startWarp de flight.ts) : temps restant, portails, sans dégâts ; étoiles selon les portails. */
const SCORE = { perSecond: 100, perGate: 200, noDamage: 1000 };
const starsFor = (ratio) => (ratio >= 0.95 ? 3 : ratio >= 0.7 ? 2 : 1);
/** Vitesse de croisière (CourseDef.speed) et portée = 1,6 s de vol. */
const CRUISE = { f1: 58, f2: 64 };
/** Vagues attendues (plan 03, « Choix de réalisation de 3b », E) : type + effectif, dans l'ordre de rencontre. */
const WAVES = {
  nebula: 'mine1 swarm5 mine1 swarm6 fighter1 mine2',
  asteroids: 'mine2 swarm6 fighter1 mine1 swarm7 fighter2 mine3 swarm7 fighter2 mine1',
};
const CRYSTALS_TOTAL = { f1: 23, f2: 98 };
/**
 * Zones des portails et fenêtres des vagues (genWaves de src/game3d/courses.ts) : une vague n'occupe jamais
 * [g.z − GATE_EXIT, g.z + GATE_APPROACH] ; sa fenêtre [z + lo, z + hi] (chasseur : lo − (n − 1) × 28 pour une paire).
 */
const GATE_ZONE = { exit: 30, approach: 75 };
const WAVE_WINDOW = { mine: [-40, 36], swarm: [-14, 12], fighter: [-75, 30] };
const FIGHTER_STAGGER = 28;
/**
 * Hachage FNV-1a de JSON.stringify({ gates, rocks, path, warpZ }) (tous les champs des rochers), recalculé ici dans
 * la page sur buildCourse : les vagues ont leur propre générateur, rien d'autre ne doit bouger (records et autres
 * scénarios). Relevé dans Chrome sur le code d'avant 3b (commit f4275db, courses.ts construit par esbuild) et sur
 * celui-ci : identiques. Sous Node, les valeurs diffèrent (nebula c716de59, asteroids c61a1b0c : fonctions Math.*
 * d'une autre version de V8), identiques elles aussi entre les deux codes.
 */
const COURSE_FP = {
  nebula: { gates: 16, rocks: 216, hash: '4ccfce4c' },
  asteroids: { gates: 22, rocks: 818, hash: '24a39915' },
};
/**
 * Variantes de spawn (0..1 : orientation et phase de l'essaim, côté du virage du chasseur, clignotement de la mine)
 * et avancement du vol (progress) où les essaims de B sont posés. Chaque essai part d'un état fixé par
 * __xr3d.settle() (Comète sur la trajectoire, énergie froide, turbo coupé) : sans lui, la chauffe et l'écart latéral
 * laissés par le vol en temps réel (images plus lentes à froid) changeaient parfois l'issue. Remesuré le 28/10/2026
 * avec settle (10 variantes de 0,05 à 0,95, une partie neuve chacune ; issue identique d'un passage à l'autre) :
 * à 6 % du parcours, l'essaim est abattu en entier pour 0,55 à 0,75 et 0,95 (en 0,72 s de jeu), pas pour les
 * autres ; à 13 %, un membre file (5 sur 6) pour toutes sauf 0,15. swarmFull (0,65, milieu de la plage) est donc
 * abattu en entier par la mitrailleuse et le pilote automatique, swarmLeak laisse filer un membre ; swarmHit à 25 u
 * percute la Comète qui vole droit (toutes les variantes le font) ; swarmShot : essaim des gros plans (orientation
 * des captures relues à la revue visuelle de 3b). À remesurer si la visée, l'essaim, le pilote
 * automatique ou les vagues de f1 changent. Vagues de f1 à éviter : la
 * première mine (z ≈ −849, avancement 0,198) est à portée vers 0,176, le premier essaim (z ≈ −1567) entre en scène à
 * 0,221 : l'essai à orientation libre est posé une fois la mine passée ou abattue (dès 0,18), et n'est que
 * journalisé si une vague s'en mêle.
 */
const VARIANT = { fighter: 0.25, mine: 0.5, swarmFull: 0.65, swarmLeak: 0.4, swarmHit: 0, swarmShot: 0.3 };
const SWARM_AT = { full: 0.06, leak: 0.13, free: 'i.enemies.mine === 0 && i.progress >= 0.18' };
/**
 * Avancements fixes des essais de A et du premier chasseur de B : posés au même endroit du parcours (rochers,
 * courbe de la trajectoire) quel qu'ait été le vol en temps réel avant (départ des essais vers 0,005 à 0,02 ; la mine
 * de A, à 0,04, échappait parfois au tir quand elle était posée plus loin). La mine de A doit être abattue avant que
 * la première mine du parcours n'entre en scène (0,053).
 */
const TRIAL_AT = { fighter: 0.025, mine: 0.04, fighter2: 0.07 };

/** L'essai a bien démarré avant l'avancement visé (sinon il est posé plus loin, à un endroit non mesuré). */
function assertTrialStart(from, at, label) {
  assert(from <= at, `${label} : vol déjà à ${from} avant l'essai, au-delà de l'avancement fixé ${at} (temps réel trop long avant ?)`);
}

const SAVE_KEY = 'xeno-rift-save-v1';

// ---------------------------------------------------------------- Outils

/** Sauvegarde version 2 complétée par `patch` (réglages fusionnés), prise en compte au prochain chargement. */
function patchSave(t, patch) {
  return t.ev(
    ([k, p]) => {
      let save = null;
      try {
        save = JSON.parse(localStorage.getItem(k));
      } catch {
        save = null;
      }
      if (!save || save.version !== 2) save = { version: 2, unlocked: 0, best: {}, settings: {} };
      const { settings, ...rest } = p;
      Object.assign(save, rest);
      if (settings) save.settings = { ...save.settings, ...settings };
      localStorage.setItem(k, JSON.stringify(save));
    },
    [SAVE_KEY, patch],
  );
}

const info = (t) => t.ev(() => (window.__xr3d ? window.__xr3d.info() : null));

/**
 * Sons joués notés (enveloppe de __xrShell.audio.sfx, l'objet que reçoit le mode de vol), journal vidé :
 * window.__sfxLog (identifiants) et window.__sfxVol (volume demandé, 1 par défaut).
 */
function recordSfx(t) {
  return t.ev(() => {
    const a = window.__xrShell.audio;
    if (!a.__orig) {
      a.__orig = a.sfx;
      a.sfx = function (id, opts) {
        window.__sfxLog.push(id);
        window.__sfxVol.push(opts && typeof opts.volume === 'number' ? opts.volume : 1);
        return a.__orig.call(this, id, opts);
      };
    }
    window.__sfxLog = [];
    window.__sfxVol = [];
  });
}
const sfxLog = (t) => t.ev(() => window.__sfxLog.slice());
/**
 * Volume du son « touché » sur un ennemi (shotHit de flight.ts : 0,8 ; un rocher touché sans être détruit joue le
 * même son à 0,35).
 */
const ENEMY_HIT_VOL = 0.8;
/** Sons notés et tirs partis, relevés ensemble (le vol continue entre deux appels). */
const sfxAndShots = (t) => t.ev(() => ({ log: window.__sfxLog.slice(), fired: window.__xr3d.info().shotsFired }));
const count = (log, id) => log.filter((s) => s === id).length;

/**
 * Pas à pas dans la page (à poser avant t.goto) : window.__xrTrace(max, until) simule jusqu'à `max` sous-pas de
 * 1/60 s (__xr3d.advance), s'arrête après le premier pas où l'expression `until` (variables i : état, i0 : départ,
 * rows : relevés résumés jusque-là) est vraie, et renvoie l'état résumé de chaque pas (rows[0] = départ).
 */
async function installTrace(t) {
  await t.page.addInitScript(() => {
    const pick = (i) => ({
      phase: i.phase,
      progress: i.progress,
      shield: i.shield,
      orbs: i.orbsActive,
      fighter: i.enemies.fighter,
      mine: i.enemies.mine,
      swarm: i.enemies.swarm,
      killed: i.enemies.killed,
      fired: i.shotsFired,
      muzzle: i.lastMuzzle,
      heat: i.heat,
      over: i.overheated,
      points: i.points,
      crystals: i.crystals,
      crystalsActive: i.crystalsActive,
      dropped: i.crystalsDropped,
      rocks: i.rocksDestroyed,
      target: i.target ? i.target.type : null,
      hit: i.target ? i.target.hit : false,
      speed: i.speed,
      boosting: i.boosting,
      calls: i.drawCalls,
      hudOver: !!document.querySelector('.fl-energy.is-over'),
      hudBoost: !!document.querySelector('.fl-energy.is-boost'),
      hudLevel: document.querySelector('.fl-energy') ? document.querySelector('.fl-energy').dataset.level : null,
    });
    window.__xrTrace = (max, until) => {
      const a = window.__xr3d;
      const stop = until ? new Function('i', 'i0', 'rows', `return (${until});`) : () => false;
      const i0 = a.info();
      const rows = [pick(i0)];
      for (let k = 1; k <= max; k++) {
        const i = a.advance(1 / 60);
        rows.push(pick(i));
        if (stop(i, i0, rows)) break;
      }
      return rows;
    };
  });
}

/** Trace de `max` sous-pas au plus (voir installTrace). */
const trace = (t, max, until = null) => t.ev(([m, u]) => window.__xrTrace(m, u), [max, until]);

/** Index du premier pas où pred(row, prev) est vrai, ou -1. */
function firstStep(rows, pred) {
  for (let k = 1; k < rows.length; k++) if (pred(rows[k], rows[k - 1])) return k;
  return -1;
}

/** Points attendus d'un intervalle : ennemis abattus (fourni) + rochers détruits + cristaux ramassés. */
function otherPoints(a, b) {
  return (b.rocks - a.rocks) * POINTS.rock + (b.crystals - a.crystals) * POINTS.crystal;
}

/**
 * Tirs du pilote automatique (sans fire(true) ni touche) : il ne tient TIR qu'à un pas où une cible visée peut être
 * touchée (target et hit : la cible renvoyée par info() est celle du sous-pas où part le tir). Ajoute les comptes à
 * `acc` (pas, pas sans cible, pas avec une cible hors d'atteinte, tirs).
 */
function checkPilotFire(rows, label, acc) {
  assert(rows.length > 1, `${label} : trace vide`);
  for (let k = 1; k < rows.length; k++) {
    const x = rows[k];
    const shot = x.fired !== rows[k - 1].fired;
    if (shot) assert(x.target !== null && x.hit, `${label} : tir du pilote automatique au pas ${k} sans cible atteignable (${fmt(x)})`);
    if (!acc) continue;
    acc.steps++;
    if (x.target === null) acc.noTarget++;
    else if (!x.hit) acc.notHit++;
    if (shot) acc.shots++;
  }
}

/**
 * Cristaux lâchés au pas `k` (crystalsDropped : ils apparaissent au sous-pas même de la destruction) : `n` pour la
 * destruction de ce pas, plus au plus un par rocher détruit au même pas.
 */
function assertDrops(rows, k, n, label) {
  const x = rows[k];
  const p = rows[k - 1];
  const extra = x.dropped - p.dropped - n;
  assert(extra >= 0 && extra <= x.rocks - p.rocks, `${label} : ${n} cristal(aux) lâché(s) au pas ${k} (${p.dropped} -> ${x.dropped}, rochers ${p.rocks} -> ${x.rocks})`);
}

/** Pas (index) où un ennemi est abattu par les tirs (compteur killed). */
function killSteps(rows) {
  const out = [];
  for (let k = 1; k < rows.length; k++) if (rows[k].killed > rows[k - 1].killed) out.push(k);
  return out;
}

/**
 * Chasseur posé à 60 u (variante fixée) à l'avancement TRIAL_AT.fighter, abattu par les tirs du pilote
 * automatique : coups « touché » comptés par le son (volume des ennemis), 2 cristaux lâchés au pas de sa mort, 150
 * points. Fait au départ du vol : la première vague (mine à ~230 u) est encore hors de portée. Renvoie les relevés.
 */
async function fighterHits(t, label, gun, acc) {
  const r = await t.ev(([v, at]) => {
    window.__xr3d.autopilot(true);
    const pre = window.__xrTrace(60 * 30, `i.progress >= ${at}`);
    window.__xr3d.settle();
    const n0 = window.__sfxLog.length;
    const placed = window.__xr3d.spawn('fighter', 60, v);
    const rows = window.__xrTrace(240, 'i.enemies.killed > i0.enemies.killed');
    return { placed, rows, from: pre[0].progress, log: window.__sfxLog.slice(n0), vol: window.__sfxVol.slice(n0) };
  }, [VARIANT.fighter, TRIAL_AT.fighter]);
  assertTrialStart(r.from, TRIAL_AT.fighter, label);
  assertEq(r.placed, 1, `${label} : spawn(fighter) place un chasseur`);
  const rows = r.rows;
  const a = rows[0];
  const b = rows[rows.length - 1];
  assert(b.killed === a.killed + 1 && b.fighter === a.fighter - 1, `${label} : le chasseur posé est abattu (${fmt({ a, b })})`);
  assert(rows.every((x) => x.target !== 'mine' && x.target !== 'swarm'), `${label} : aucun autre ennemi visé pendant la mesure`);
  const hits = r.log.filter((id, k) => id === 'enemyHit' && r.vol[k] === ENEMY_HIT_VOL).length;
  t.log(`${label} : chasseur abattu en ${((rows.length - 1) / 60).toFixed(2)} s de jeu, ${hits} coups sans le dernier`);
  assertEq(hits + 1, GUNS[gun].fighterHits, `${label} : coups pour abattre un chasseur (3 PV)`);
  assertEq(b.points - a.points - otherPoints(a, b), POINTS.fighter, `${label} : points du chasseur`);
  assertDrops(rows, rows.length - 1, DROPS.fighter, `${label} : cristaux du chasseur`);
  checkPilotFire(rows, label, acc);
  return rows;
}

/**
 * Ramène la Comète sur la trajectoire idéale (pilote automatique 1,5 s de jeu, qui tire sur les cibles atteignables),
 * puis pilote coupé et vitesse latérale retombée : la suite vole droit sans tirer ni croiser de rocher.
 */
async function recenter(t) {
  await t.ev(() => window.__xr3d.autopilot(true));
  await trace(t, 90);
  await t.ev(() => window.__xr3d.autopilot(false));
  await trace(t, 30);
}

/**
 * Au-delà de l'entrée en scène de la première vague de f1 (mine en z ≈ −849, posée quand la Comète passe en
 * z ≈ −229, avancement 0,053 ; à portée vers 0,176) : vol au pilote automatique jusqu'à 6 % du parcours, puis
 * recenter. Ensuite, le nombre de mines ne change que par celles posées par le test (comptes au pas près).
 */
async function afterFirstWave(t) {
  await t.ev(() => {
    window.__xr3d.autopilot(true);
    window.__xrTrace(60 * 30, 'i.progress >= 0.06');
  });
  await recenter(t);
}

/**
 * Zone de l'écran autour du point situé `d` u devant la Comète (sur sa ligne : là où spawn pose les ennemis),
 * projeté par la caméra du vol (scène suivie par trackThreeScenes) : { x, y, width, height } de w x h px.
 */
function clipAhead(t, d, w = 240, h = 140) {
  return t.ev(
    ([dd, cw, ch]) => {
      const refs = window.__xrScenes || [];
      for (let i = refs.length - 1; i >= 0; i--) {
        const sc = refs[i].deref();
        if (!sc) continue;
        const cam = sc.children.find((o) => o.isPerspectiveCamera);
        const ship = sc.children.find((c) => {
          let hull = false;
          c.traverse((o) => {
            if (o.isMesh && o.geometry && o.geometry.type === 'LatheGeometry') hull = true;
          });
          return hull;
        });
        if (!cam || !ship) continue;
        const p = [ship.position.x, ship.position.y, ship.position.z - dd, 1];
        const mul = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
        const c = mul(cam.projectionMatrix.elements, mul(cam.matrixWorldInverse.elements, p));
        const W = window.innerWidth;
        const H = window.innerHeight;
        const sx = ((c[0] / c[3] + 1) / 2) * W;
        const sy = ((1 - c[1] / c[3]) / 2) * H;
        return {
          x: Math.max(0, Math.min(W - cw, Math.round(sx - cw / 2))),
          y: Math.max(0, Math.min(H - ch, Math.round(sy - ch / 2))),
          width: cw,
          height: ch,
        };
      }
      return null;
    },
    [d, w, h],
  );
}

/** Capture de l'écran entier puis zone agrandie x3 autour du point `d` u devant la Comète (si d ≥ 0). */
async function nearShot(t, name, d) {
  await t.shot(name);
  if (d === undefined || d < 0) return;
  const clip = await clipAhead(t, d);
  if (clip) await t.shot(`${name}-zoom`, { clip, zoom: 3 });
}

/** Captures au ralenti (×0,1) : l'image ne bouge presque pas entre la demande et les captures. */
async function slowShot(t, name, d) {
  await t.ev(() => window.__xr3d.timeScale(0.1));
  await t.wait(60);
  await nearShot(t, name, d);
}

/** Sous-pas (0,47 s) après lesquels un ennemi posé a fini d'apparaître (grossissement APPEAR_T de enemies.ts). */
const APPEAR_STEPS = 28;

/**
 * Gros plans pilote coupé (rien ne tire avant la capture), chacun juste après un portail : chaque type posé sur
 * la ligne de la Comète, capturé à ~30 u une fois son apparition finie, au ralenti ; chasseur abattu par un tir
 * forcé : explosion puis cristaux ; ensuite le pilote automatique (tirs sur les cibles, écarts) fait place nette.
 */
async function closeups(t, tag, cruise) {
  const ahead = (APPEAR_STEPS / 60) * cruise;
  for (const [kind, d] of [['fighter', 30], ['mine', 30 + ahead], ['swarm', 30 + ahead]]) {
    // Juste après un portail (pilote automatique) : le suivant est loin, rien ne passe devant la caméra
    await t.ev(() => {
      window.__xr3d.fire(false);
      window.__xr3d.timeScale(1);
      window.__xr3d.autopilot(true);
    });
    await trace(t, 600, 'i.nextGate > i0.nextGate');
    await t.ev(() => window.__xr3d.autopilot(false));
    await trace(t, 20);
    // Pose et apparition depuis un état fixé (settle), dans la même tâche, puis jeu figé (timeScale 0) pendant les
    // captures : même gros plan et même suite quelle qu'ait été la cadence des images (au ralenti, un chasseur
    // capturé lentement virait hors du cône avant le tir forcé)
    await t.ev(([k, dd, v, n]) => {
      window.__xr3d.settle();
      window.__xr3d.spawn(k, dd, v);
      window.__xrTrace(n);
      window.__xr3d.timeScale(0);
    }, [kind, d, kind === 'swarm' ? VARIANT.swarmShot : VARIANT[kind], APPEAR_STEPS]);
    await t.wait(60);
    await nearShot(t, `${tag}-near-${kind}`, 30);
    if (kind === 'fighter') {
      // Tir forcé en sous-pas simulés (temps de jeu exact) depuis l'image capturée, puis 2 sous-pas d'explosion
      const rows = await t.ev(() => {
        window.__xr3d.fire(true);
        const r = window.__xrTrace(60 * 4, 'i.enemies.killed > i0.enemies.killed');
        window.__xr3d.fire(false);
        window.__xrTrace(2);
        return r;
      });
      const a = rows[0];
      const b = rows[rows.length - 1];
      assert(b.killed > a.killed, `${tag} : chasseur abattu au tir forcé en 4 s de jeu (${fmt({ a, b })})`);
      await t.wait(60);
      await nearShot(t, `${tag}-explosion`, 30);
      await t.ev(() => window.__xr3d.timeScale(0.1));
      await t.wait(500);
      await nearShot(t, `${tag}-crystal`, 28);
    }
    await t.ev(() => {
      window.__xr3d.timeScale(1);
      window.__xr3d.autopilot(true);
    });
    await trace(t, 120);
  }
  await t.ev(() => window.__xr3d.autopilot(false));
}

/** Lance une étape de vol avec la sauvegarde `patch` ; attend la phase de vol ; sons notés. */
async function startFlight(t, stage, patch, touch = 1, introShot = null) {
  await patchSave(t, patch);
  await t.goto(`?touch=${touch}&unlock=1&stage=${stage}`);
  if (introShot) {
    // Début du compte à rebours : travelling depuis l'avant de la Comète (canons sous les ailes visibles)
    await waitFor(t, () => {
      const a = window.__xr3d;
      const i = window.__xrShell.info();
      return !!(a && a.info().phase === 'intro' && i.phase === 'playing' && !i.fading);
    }, { timeout: 60000, label: `${stage} : compte à rebours` });
    await slowShot(t, introShot, 0);
    await t.ev(() => window.__xr3d.timeScale(1));
  }
  await waitFor3dPhase(t, 'fly', { timeout: 60000 });
  await waitFor(t, () => {
    const i = window.__xrShell.info();
    return i.phase === 'playing' && !i.navLock && !i.fading;
  }, { timeout: 10000, label: `${stage} : partie dévoilée` });
  await recordSfx(t);
  return info(t);
}

/** Jauge d'énergie et compteur de cristaux du HUD du vol. */
function hudCombat(t) {
  return t.ev(() => {
    const h = document.querySelector('.fl-energy');
    const c = document.querySelector('.fl-crystals .hud-num');
    return {
      gun: h ? h.dataset.gun : null,
      level: h ? h.dataset.level : null,
      over: h ? h.classList.contains('is-over') : null,
      off: h ? Number(getComputedStyle(h.querySelector('.heat-grad')).getPropertyValue('--heat-off')) : null,
      step: h ? getComputedStyle(h).getPropertyValue('--heat-step').trim() : null,
      crystals: c ? Number(c.textContent) : null,
      shields: document.querySelectorAll('.fl-pips .fl-pip:not(.is-empty)').length,
    };
  });
}

/**
 * Tir continu forcé (__xr3d.fire : TIR tenu) mesuré en temps de jeu, pilote automatique coupé (rien d'autre ne tire,
 * pas de turbo) : canon refroidi, puis tirs de la première seconde, bouches, durée jusqu'à la surchauffe (HUD .is-over
 * au même pas), reprise du tir sous 30 %. Renvoie les mesures.
 */
async function measureGun(t, label, gun) {
  // Canon froid : 2,6 s de jeu sans tirer (délai puis refroidissement complet), relevé dans la même tâche
  const g0 = await t.ev(() => {
    window.__xr3d.autopilot(false);
    window.__xr3d.fire(false);
    window.__xrTrace(156);
    return window.__xr3d.info();
  });
  assert(g0.heat === 0 && !g0.overheated && !g0.boosting, `${label} : énergie froide, sans turbo avant la mesure (${fmt({ heat: g0.heat, over: g0.overheated, boosting: g0.boosting })})`);
  // Tir forcé et trace dans la même tâche (aucune image du jeu entre les deux) : jusqu'au premier tir qui suit
  // la surchauffe, puis 0,4 s de plus (jauge du HUD rallumée)
  const rows = await t.ev(() => {
    window.__xr3d.fire(true);
    const r = window.__xrTrace(60 * 9, 'rows.some((r) => r.over) && !i.overheated && i.shotsFired > rows[rows.length - 2].fired');
    window.__xr3d.fire(false);
    return r.concat(window.__xrTrace(24).slice(1));
  });
  const shotsAt = [];
  for (let k = 1; k < rows.length; k++) if (rows[k].fired > rows[k - 1].fired) shotsAt.push(k);
  assert(shotsAt.length > 0, `${label} : aucun tir forcé`);
  const first = shotsAt[0];
  const inFirstSecond = shotsAt.filter((k) => k < first + 60).length;
  const over = firstStep(rows, (r, p) => r.over && !p.over);
  assert(over > 0, `${label} : surchauffe attendue en tir continu (9 s de jeu ; chauffe finale ${rows[rows.length - 1].heat})`);
  const back = shotsAt.find((k) => k > over);
  assert(back !== undefined, `${label} : le tir doit reprendre après la surchauffe`);
  const muzzles = shotsAt.slice(0, 8).map((k) => rows[k].muzzle);
  // Jauge du HUD (mise à jour ~10 fois par seconde de jeu) sortie de la surchauffe après la reprise
  const hudBack = rows.findIndex((r, k) => k >= back && !r.hudOver);
  const m = {
    rate: inFirstSecond,
    overAfter: Math.round(((over - first) / 60) * 100) / 100,
    shotsToOver: shotsAt.filter((k) => k <= over).length,
    recover: Math.round(((back - over) / 60) * 100) / 100,
    heatAtBack: rows[back - 1].heat,
    hudOver: rows[over].hudOver,
    hudLevel: rows[over].hudLevel,
    hudBack: hudBack < 0 ? null : Math.round(((hudBack - back) / 60) * 100) / 100,
    muzzles,
  };
  t.log(`${label} : ${fmt(m)}`);
  const g = GUNS[gun];
  assert(Math.abs(m.rate - g.rate) <= 1, `${label} : cadence ${g.rate} tirs/s attendue, obtenu ${m.rate}`);
  assertEq(m.shotsToOver, g.shotsToOver, `${label} : tirs avant la surchauffe`);
  assertNear(m.overAfter, (g.shotsToOver - 1) * g.cooldown, 0.1, `${label} : durée de tir continu avant la surchauffe (s)`);
  assertNear(m.recover, (1 - RECOVER_AT) / g.coolRate, 0.1, `${label} : reprise du tir (chauffe sous 30 %) après la surchauffe (s)`);
  assert(m.heatAtBack < RECOVER_AT + 0.02, `${label} : reprise sous 30 % de chauffe (${m.heatAtBack})`);
  assert(m.hudOver && m.hudLevel === 'hot', `${label} : jauge du HUD en surchauffe au même pas (${fmt({ over: m.hudOver, level: m.hudLevel })})`);
  assert(m.hudBack !== null && m.hudBack <= 0.2, `${label} : jauge du HUD sortie de la surchauffe au plus 0,2 s après la reprise du tir (${m.hudBack})`);
  return m;
}

/**
 * Essaim de 6 posé à 95 u devant la Comète (variante `v`, au hasard si null) quand le vol atteint l'avancement
 * `at` (ou quand l'expression `at` de __xrTrace devient vraie ; pilote automatique, TIR tenu sur les cibles atteignables) ; trace jusqu'à la fin de la formation. 30 points par membre abattu ;
 * cristaux lâchés : 1 à la mort du dernier membre d'une vague abattue en entier, aucun aux autres morts ni à
 * aucune mort d'une vague incomplète (un membre a filé). Un autre ennemi abattu ou entré en scène pendant la trace
 * (vague du parcours) fausse les comptes : refusé si `strict`, sinon essai seulement journalisé. Renvoie
 * { placed, killed, rows, mixed }.
 */
async function swarmTrial(t, label, v, at, acc, strict = true) {
  const r = await t.ev(
    ([vv, p]) => {
      window.__xr3d.autopilot(true);
      window.__xrTrace(60 * 60, typeof p === 'string' ? p : `i.progress >= ${p}`);
      // Même départ quel qu'ait été le vol en temps réel avant (cadence des images à froid) : Comète sur la
      // trajectoire, sans vitesse latérale, énergie froide, turbo coupé
      window.__xr3d.settle();
      const placed = vv === null ? window.__xr3d.spawn('swarm', 95) : window.__xr3d.spawn('swarm', 95, vv);
      return { placed, rows: window.__xrTrace(240, 'i.enemies.swarm === 0') };
    },
    [v, at],
  );
  const rows = r.rows;
  const a = rows[0];
  const b = rows[rows.length - 1];
  const killed = b.killed - a.killed;
  const complete = killed === r.placed;
  // Autre ennemi : un abattu sans membre d'essaim en moins, ou un essaim entré en scène
  const mixed = rows.some((x, k) => k > 0 && (x.killed - rows[k - 1].killed > rows[k - 1].swarm - x.swarm || x.swarm > rows[k - 1].swarm));
  t.log(`${label} : ${killed} abattus sur ${r.placed} en ${((rows.length - 1) / 60).toFixed(2)} s de jeu (avancement ${at}), cristaux lâchés ${b.dropped - a.dropped}${mixed ? ', autre ennemi pendant la trace' : ''}`);
  checkPilotFire(rows, label, acc);
  assert(!(strict && mixed), `${label} : aucun autre ennemi pendant la trace (avancement ${at} à revoir si les vagues changent)`);
  if (mixed) return { placed: r.placed, killed, rows, mixed };
  assert(r.placed >= 5 && r.placed <= 7, `${label} : essaim de 5 à 7 (${r.placed})`);
  assert(b.swarm === 0 && killed <= r.placed, `${label} : formation terminée, seuls ses membres abattus (${fmt({ a, b })})`);
  assertEq(b.points - a.points - otherPoints(a, b), POINTS.swarm * killed, `${label} : points de l’essaim (30 par membre abattu)`);
  const steps = killSteps(rows);
  for (const k of steps) {
    const n = complete && k === steps[steps.length - 1] ? DROPS.swarmWave : 0;
    assertDrops(rows, k, n, `${label} : ${complete ? 'vague entière' : 'vague incomplète'}, cristaux à la mort d'un membre`);
  }
  return { placed: r.placed, killed, rows, mixed };
}

// ---------------------------------------------------------------- 0. Parcours

async function checkCourses(t) {
  await t.goto('?touch=0');
  await waitForScreen(t, 'title');
  const res = await t.ev(
    async ([zone, win, stagger]) => {
      const m = await import('/src/game3d/courses.ts');
      const fnv = (s) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
      };
      const out = {};
      for (const id of ['nebula', 'asteroids']) {
        const a = m.buildCourse(id);
        const b = m.buildCourse(id);
        // Fenêtre de chaque vague contre la zone de chaque portail (écart minimal, négatif = chevauchement)
        let gap = Infinity;
        let worst = null;
        for (const w of a.waves) {
          const lo = w.z + win[w.kind][0] - (w.kind === 'fighter' ? (w.count - 1) * stagger : 0);
          const hi = w.z + win[w.kind][1];
          for (const g of a.gates) {
            const d = Math.max(g.z - zone.exit - hi, lo - (g.z + zone.approach));
            if (d < gap) {
              gap = d;
              worst = { wave: `${w.kind}${w.count}`, z: Math.round(w.z), gate: Math.round(g.z) };
            }
          }
        }
        out[id] = {
          gates: a.gates.length,
          rocks: a.rocks.length,
          hash: fnv(JSON.stringify({ gates: a.gates, rocks: a.rocks, path: a.path, warpZ: a.warpZ })),
          waves: a.waves.map((w) => `${w.kind}${w.count}`).join(' '),
          same: JSON.stringify(a.waves) === JSON.stringify(b.waves) && JSON.stringify(a.rocks) === JSON.stringify(b.rocks),
          sorted: a.waves.every((w, i) => i === 0 || w.z < a.waves[i - 1].z),
          inside: a.waves.every((w) => Math.hypot(w.x, w.y) < m.CORRIDOR_R && w.z < 0 && w.z > a.warpZ),
          gateGap: Math.round(gap * 10) / 10,
          worst,
        };
      }
      return out;
    },
    [GATE_ZONE, WAVE_WINDOW, FIGHTER_STAGGER],
  );
  for (const id of ['nebula', 'asteroids']) {
    const r = res[id];
    const fp = COURSE_FP[id];
    t.log(`parcours ${id} : ${fmt(r)}`);
    assert(r.same && r.sorted, `${id} : vagues identiques d'une construction à l'autre et triées (${fmt(r)})`);
    assertEq(r.waves, WAVES[id], `${id} : vagues (type et effectif, dans l'ordre)`);
    assert(r.inside, `${id} : vagues dans le couloir, avant la distorsion`);
    assert(r.gateGap >= 0, `${id} : aucune vague dans un portail ni sur sa ligne d'approche (écart ${r.gateGap} u, ${fmt(r.worst)})`);
    assertEq([r.gates, r.rocks], [fp.gates, fp.rocks], `${id} : nombre de portails et de rochers inchangé`);
    assertEq(r.hash, fp.hash, `${id} : portails, rochers, trajectoire et distorsion identiques à f4275db (hachage)`);
  }
}

// ---------------------------------------------------------------- A. Canon léger, pilote automatique

async function partA(t) {
  const i0 = await startFlight(t, 'f1', { ship: { gun: 0, shield: 0, boost: 0 } }, 0);
  assertEq(
    { gunLevel: i0.gunLevel, waves: i0.waves, crystalsTotal: i0.crystalsTotal, shield: i0.shield, crystals: i0.crystals, shotsFired: i0.shotsFired },
    { gunLevel: 0, waves: 6, crystalsTotal: CRYSTALS_TOTAL.f1, shield: 3, crystals: 0, shotsFired: 0 },
    'A : départ de f1 (canon léger, aucun tir sans appui)',
  );
  assertNear(i0.range, CRUISE.f1 * 1.6, 0.2, 'A : portée = 1,6 s de vol à la croisière');
  const h0 = await hudCombat(t);
  assertEq({ gun: h0.gun, crystals: h0.crystals, over: h0.over }, { gun: 'light', crystals: 0, over: false }, 'A : HUD (jauge du canon léger, 0 cristal)');
  assertEq(h0.step, '25.00%', 'A : graduations de la jauge = 1 s de tir (25 %)');
  // Tirs du pilote automatique : comptes de toutes les traces (aucun tir sans cible atteignable)
  const acc = { steps: 0, noTarget: 0, notHit: 0, shots: 0 };

  // --- Chasseur posé au départ (TRIAL_AT.fighter ; la première vague, à z −229, est encore hors de portée) : 3 coups
  await fighterHits(t, 'A : canon léger', 'light', acc);

  // --- Mine posée à 60 u devant : abattue à distance, sans bouclier perdu. Chaque essai part d'un endroit et d'un
  // état fixés (TRIAL_AT, settle : ni turbo ni orbe laissés par le vol en temps réel) et se trace, ramassage
  // compris, dans la même tâche
  let rows = await t.ev(([v, at]) => {
    const pre = window.__xrTrace(60 * 30, `i.progress >= ${at}`);
    window.__xr3d.settle();
    const placed = window.__xr3d.spawn('mine', 60, v);
    const tr = window.__xrTrace(120, 'i.enemies.killed > i0.enemies.killed && i.enemies.mine === 0');
    const c = tr[tr.length - 1].crystals;
    return { placed, from: pre[0].progress, rows: tr, pick: window.__xrTrace(150, `i.crystals >= ${c + 1}`) };
  }, [VARIANT.mine, TRIAL_AT.mine]);
  assertTrialStart(rows.from, TRIAL_AT.mine, 'A : mine');
  assertEq(rows.placed, 1, 'A : spawn(mine) place une mine');
  let r = rows.rows;
  let a = r[0];
  let b = r[r.length - 1];
  const mineT = (r.length - 1) / 60;
  t.log(`A : mine abattue en ${mineT.toFixed(2)} s de jeu (${fmt({ a, b })})`);
  assert(b.mine === 0 && b.killed === a.killed + 1, `A : mine abattue par les tirs du pilote automatique (${fmt(b)})`);
  assert(mineT <= 0.9, `A : mine posée à 60 u abattue en moins de 0,9 s (${mineT.toFixed(2)} s)`);
  assert(r.every((x) => x.shield === 3), 'A : aucun bouclier perdu en abattant la mine');
  assertEq(b.points - a.points - otherPoints(a, b), POINTS.mine, 'A : points de la mine');
  assert(b.fired > a.fired && r.some((x) => x.target === 'mine'), 'A : mine visée (cible) et tirs partis');
  assertDrops(r, r.length - 1, DROPS.mine, 'A : cristal de la mine, lâché au pas de sa mort');
  checkPilotFire(r, 'A : mine', acc);
  // Son cristal ramassé dans les 2,5 s de jeu suivantes (lâché sur la ligne de la Comète)
  const c0 = b.crystals;
  r = rows.pick;
  assert(r[r.length - 1].crystals >= c0 + 1, `A : cristal de la mine ramassé (${c0} -> ${r[r.length - 1].crystals})`);
  checkPilotFire(r, 'A : ramassage', acc);

  // --- Chasseur posé à 60 u : abattu (150 points), ses 2 cristaux lâchés à sa mort puis ramassés
  rows = await t.ev(([v, at]) => {
    const pre = window.__xrTrace(60 * 30, `i.progress >= ${at}`);
    window.__xr3d.settle();
    const placed = window.__xr3d.spawn('fighter', 60, v);
    const tr = window.__xrTrace(240, 'i.enemies.killed > i0.enemies.killed && i.enemies.fighter === 0');
    const c = tr[tr.length - 1].crystals;
    return { placed, from: pre[0].progress, rows: tr, pick: window.__xrTrace(240, `i.crystals >= ${c + 2}`) };
  }, [VARIANT.fighter, TRIAL_AT.fighter2]);
  assertTrialStart(rows.from, TRIAL_AT.fighter2, 'A : chasseur');
  assertEq(rows.placed, 1, 'A : spawn(fighter) place un chasseur');
  r = rows.rows;
  a = r[0];
  b = r[r.length - 1];
  t.log(`A : chasseur abattu en ${((r.length - 1) / 60).toFixed(2)} s de jeu, orbes ${Math.max(...r.map((x) => x.orbs))}`);
  assert(b.fighter === 0 && b.killed === a.killed + 1, `A : chasseur abattu (${fmt(b)})`);
  assertEq(b.points - a.points - otherPoints(a, b), POINTS.fighter, 'A : points du chasseur');
  assertDrops(r, killSteps(r).at(-1), DROPS.fighter, 'A : 2 cristaux du chasseur, lâchés au pas de sa mort');
  checkPilotFire(r, 'A : chasseur', acc);
  r = rows.pick;
  assert(r[r.length - 1].crystals >= b.crystals + 2, `A : 2 cristaux du chasseur ramassés (${b.crystals} -> ${r[r.length - 1].crystals})`);
  assert(rows.rows.concat(r).every((x) => x.shield === 3), 'A : aucun bouclier perdu (chasseur et son orbe)');
  checkPilotFire(r, 'A : ramassage', acc);
  await t.wait(300);
  await waitFor(t, () => Number(document.querySelector('.fl-crystals .hud-num').textContent) === window.__xr3d.info().crystals, {
    timeout: 2000,
    label: 'A : compteur de cristaux du HUD = cristaux ramassés',
  });

  // --- Rochers : visés dans le cône, tirs partis, détruits sans bouclier perdu (pilote automatique, 15 s de jeu
  // au plus) ; un cristal lâché à un pas sans ennemi abattu vient d'un rocher détruit au même pas
  const rocks0 = (await info(t)).rocksDestroyed;
  r = await trace(t, 900, `i.rocksDestroyed >= ${rocks0 + 3}`);
  const last = r[r.length - 1];
  t.log(`A : rochers détruits ${rocks0} -> ${last.rocks} en ${((r.length - 1) / 60).toFixed(2)} s de jeu, cristaux ${last.crystals}, points ${last.points}`);
  assert(r.some((x) => x.target === 'rock' && x.hit), 'A : un rocher visé et atteignable');
  assert(last.rocks >= rocks0 + 3, `A : rochers détruits par les tirs du pilote automatique (${rocks0} -> ${last.rocks})`);
  assert(r.every((x) => x.shield === 3), 'A : aucun bouclier perdu (rochers détruits par les tirs)');
  for (let k = 1; k < r.length; k++) {
    if (r[k].killed === r[k - 1].killed) assert(r[k].dropped - r[k - 1].dropped <= r[k].rocks - r[k - 1].rocks, `A : cristal lâché au pas ${k} sans destruction (${fmt(r[k])})`);
  }
  checkPilotFire(r, 'A : rochers', acc);
  t.log(`A : tirs du pilote automatique, ${fmt(acc)}`);
  assert(acc.noTarget > 0 && acc.shots > 0, `A : traces du pilote automatique avec des pas sans cible (aucun tir) et des tirs (${fmt(acc)})`);
  await t.shot('a-auto-fire-hud');

  const { log, fired: firedA } = await sfxAndShots(t);
  t.log(`A : sons ${fmt(Object.fromEntries(['shipGun', 'shipMachinegun', 'enemyHit', 'enemyBlast', 'enemyOrb', 'crystal', 'overheat', 'crash'].map((s) => [s, count(log, s)])))}`);
  assert(count(log, 'shipGun') === firedA && firedA >= 8 && count(log, 'shipMachinegun') === 0, `A : son du canon léger à chaque tir, pas celui de la mitrailleuse (${count(log, 'shipGun')} sons pour ${firedA} tirs)`);
  assert(count(log, 'enemyBlast') >= 3 && count(log, 'crystal') >= 3, 'A : sons des explosions et des cristaux');
  assertEq(count(log, 'crash'), 0, 'A : aucun choc');

  // --- Capture des tirs du pilote automatique sur un chasseur posé à 45 u (apparition finie), au ralenti
  await t.ev((v) => window.__xr3d.spawn('fighter', 45, v), VARIANT.fighter);
  await trace(t, APPEAR_STEPS);
  await slowShot(t, 'a-auto-fire-fighter', 45);
  await t.ev(() => window.__xr3d.timeScale(1));
  await trace(t, 90);

  // --- Victoire : relevé dans la même tâche que win() (le résultat est calculé à cet instant)
  const fin = await t.ev(() => {
    window.__xr3d.win();
    const i = window.__xr3d.info();
    return { crystals: i.crystals, points: i.points, timeLeft: i.timeLeft, shield: i.shield, maxShields: i.maxShields, gates: i.gates, gatesTotal: i.gatesTotal };
  });
  const got = fin.crystals;
  assert(got >= 4 && fin.points > 0, `A : cristaux ramassés et points du combat pendant le vol (${fmt(fin)})`);
  await waitForScreen(t, 'results', { timeout: 25000 });
  const R = '.screens [data-screen="results"].is-active';
  await t.page.locator(`${R} .results-panel`).click({ position: { x: 8, y: 8 } }); // fin des animations
  const res = await t.ev((s) => {
    const el = document.querySelector(s);
    const g = el.querySelector('.detail-gain');
    return {
      gain: g ? g.textContent.trim() : null,
      bank: Number(el.querySelector('.detail--bank .detail-value').textContent.replace(/\D/g, '')),
      score: Number(el.querySelector('.results-score').textContent.replace(/\D/g, '')),
    };
  }, R);
  assertEq({ gain: res.gain, bank: res.bank }, { gain: `+${got} cristaux`, bank: got }, 'A : résultats du vol : « +N cristaux » et réserve');
  const save = await readSave(t);
  assertEq(save.crystals, got, 'A : réserve enregistrée = cristaux du vol');
  // Score : base d'avant 3b (temps restant arrondi à 0,1 s par info(), d'où ±5) + points du combat ; sans dégâts ⇔
  // aucun bouclier perdu (pas de recharge en vol). Étoiles : portails seulement, comme avant 3b.
  const base = Math.round(fin.timeLeft * SCORE.perSecond) + fin.gates * SCORE.perGate + (fin.shield === fin.maxShields ? SCORE.noDamage : 0);
  const best = save.best.f1;
  t.log(`A : score ${best.score} = base ${base} + points ${fin.points} (±5), étoiles ${best.stars}, affiché ${res.score}`);
  assert(Math.abs(best.score - fin.points - base) <= 5, `A : score du vol = base d'avant 3b + points du combat (${fmt({ score: best.score, base, points: fin.points })})`);
  assertEq(best.stars, starsFor(fin.gates / fin.gatesTotal), 'A : étoiles selon les portails seulement');
  assertEq(res.score, best.score, 'A : score affiché aux résultats = record enregistré');
  await t.shot('a-results');
}

// ---------------------------------------------------------------- B. Mitrailleuse

async function partB(t) {
  // Mesures du canon pilote coupé (TIR tenu par fire) ; le pilote automatique tient TIR sur les cibles atteignables
  const i0 = await startFlight(t, 'f1', { crystals: 0, ship: { gun: 1, shield: 2, boost: 0 } }, 1, 'b-comet-machinegun-intro');
  assertEq({ gunLevel: i0.gunLevel, waves: i0.waves }, { gunLevel: 1, waves: 6 }, 'B : mitrailleuse installée');
  const h0 = await hudCombat(t);
  assertEq({ gun: h0.gun, step: h0.step }, { gun: 'machinegun', step: '33.33%' }, 'B : jauge de la mitrailleuse (graduations = 1 s de tir)');
  const acc = { steps: 0, noTarget: 0, notHit: 0, shots: 0 };
  await fighterHits(t, 'B : mitrailleuse', 'machinegun', acc);

  // --- Essaim de 6 posé à 95 u à un endroit fixé du parcours (variante fixée : abattu en entier) : 30 points par
  // membre abattu, cristal de la vague lâché à la mort du dernier, aucun aux autres
  const full = await swarmTrial(t, 'B : essaim (variante abattue en entier)', VARIANT.swarmFull, SWARM_AT.full, acc);
  assertEq(full.killed, full.placed, `B : essaim abattu en entier par la mitrailleuse et le pilote automatique (variante ${VARIANT.swarmFull})`);
  assert(full.rows.every((x) => x.shield === 5), 'B : aucun bouclier perdu (essaim abattu en entier)');
  const end = full.rows[full.rows.length - 1];
  const after = await trace(t, 180, `i.crystals >= ${end.crystals + 1}`);
  assert(after[after.length - 1].crystals >= end.crystals + 1, `B : cristal de la vague entière abattue ramassé (${end.crystals} -> ${after[after.length - 1].crystals})`);
  checkPilotFire(after, 'B : ramassage', acc);

  // --- Essaim dont un membre file (variante mesurée), puis essaim à orientation libre (journalisé) : vague
  // incomplète, aucun cristal à aucune mort
  const leak = await swarmTrial(t, 'B : essaim (variante qui laisse filer un membre)', VARIANT.swarmLeak, SWARM_AT.leak, acc);
  assert(leak.killed > 0 && leak.killed < leak.placed, `B : un membre au moins file (variante ${VARIANT.swarmLeak} : ${leak.killed} abattus sur ${leak.placed})`);
  await swarmTrial(t, 'B : essaim à orientation libre', null, SWARM_AT.free, acc, false);
  t.log(`B : tirs du pilote automatique, ${fmt(acc)}`);

  // --- Cadence, alternance des deux canons, surchauffe
  const m = await measureGun(t, 'B : mitrailleuse', 'machinegun');
  assert(m.muzzles.every((x, k) => (x === 0 || x === 1) && (k === 0 || x !== m.muzzles[k - 1])), `B : les deux canons tirent à tour de rôle (${m.muzzles})`);
  const { log, fired: firedB } = await sfxAndShots(t);
  assert(count(log, 'shipMachinegun') === firedB && count(log, 'shipGun') === 0, `B : son de la mitrailleuse à chaque tir (${count(log, 'shipMachinegun')} sons pour ${firedB} tirs)`);

  // --- Captures : la Comète armée, puis en plein tir (traits blanc-cyan des deux ailes)
  await t.ev(() => window.__xr3d.fire(false));
  await trace(t, 60);
  await slowShot(t, 'b-comet-machinegun', 0);
  await t.ev(() => {
    window.__xr3d.timeScale(1);
    window.__xr3d.fire(true);
  });
  await trace(t, 20);
  await slowShot(t, 'b-machinegun-firing', 6);
  await t.ev(() => {
    window.__xr3d.fire(false);
    window.__xr3d.timeScale(1);
  });
}

// ---------------------------------------------------------------- B3. Mitrailleuse niveau 3, chocs d'ennemis

async function partB3(t) {
  const i0 = await startFlight(t, 'f1', { crystals: 0, ship: { gun: 3, shield: 2, boost: 0 } }, 0);
  assertEq({ gunLevel: i0.gunLevel, shield: i0.shield }, { gunLevel: 3, shield: 5 }, 'B3 : mitrailleuse niveau 3, 5 boucliers');
  const h0 = await hudCombat(t);
  assertEq({ gun: h0.gun, step: h0.step }, { gun: 'machinegun', step: '33.33%' }, 'B3 : jauge de la mitrailleuse (graduations = 1 s de tir)');
  // Dégâts 1,5 : chasseur (3 PV) abattu en 2 coups
  await fighterHits(t, 'B3 : mitrailleuse niveau 3', 'machinegun3', null);
  await afterFirstWave(t);

  // --- Membre d'essaim percuté (pilote coupé : aucun tir, Comète en ligne droite, variante fixée) : un bouclier perdu, membre
  // détruit au même pas, sans points, sans cristal, sans ennemi abattu
  const r = await t.ev((v) => {
    window.__xr3d.spawn('swarm', 25, v);
    return window.__xrTrace(90, 'i.shield < i0.shield');
  }, VARIANT.swarmHit);
  const hit = firstStep(r, (x, p) => x.shield < p.shield);
  t.log(`B3 : membre d'essaim percuté au pas ${hit} (${fmt(r[hit])})`);
  assert(hit > 0, 'B3 : la Comète doit percuter un membre de l’essaim posé sur sa route');
  const [p, x] = [r[hit - 1], r[hit]];
  assertEq([x.shield, p.swarm - x.swarm], [p.shield - 1, 1], 'B3 : membre d’essaim détruit au même pas qu’un bouclier perdu');
  assertEq([x.killed, x.points, x.dropped, x.fired], [p.killed, p.points, p.dropped, r[0].fired], 'B3 : membre percuté : ni ennemi abattu, ni points, ni cristal (aucun tir)');

  // --- Mine percutée pendant l'invulnérabilité (même invulnérabilité que les rochers) : détruite, bouclier
  // gardé, choc léger (son « crash » faible)
  const inv = await t.ev((v) => {
    const n0 = window.__sfxLog.length;
    window.__xr3d.spawn('mine', 8, v);
    const rows = window.__xrTrace(40, 'i.enemies.mine < i0.enemies.mine');
    return { rows, log: window.__sfxLog.slice(n0), vol: window.__sfxVol.slice(n0) };
  }, VARIANT.mine);
  const ir = inv.rows;
  const crashes = inv.log.map((id, k) => (id === 'crash' ? inv.vol[k] : null)).filter((v) => v !== null);
  t.log(`B3 : mine percutée ${((ir.length - 1) / 60).toFixed(2)} s après le choc de l'essaim : boucliers ${ir[0].shield} -> ${ir[ir.length - 1].shield}, sons crash ${fmt(crashes)}`);
  assert(ir[ir.length - 1].mine < ir[0].mine, 'B3 : mine déclenchée par la Comète invulnérable');
  assert(ir.every((y) => y.shield === x.shield), `B3 : aucun bouclier perdu pendant l'invulnérabilité (${x.shield})`);
  assert(crashes.length === 1 && crashes[0] < 0.5, `B3 : un seul choc, léger (volumes ${fmt(crashes)})`);
  assertEq(ir[ir.length - 1].killed, ir[0].killed, 'B3 : mine percutée : pas comptée comme abattue');
  await trace(t, 70);
  await recenter(t);

  // --- Cadence ×1,3 (13 tirs/s), surchauffe après 39 tirs (~2,9 s), alternance
  const m = await measureGun(t, 'B3 : mitrailleuse niveau 3', 'machinegun3');
  assert(m.muzzles.every((y, k) => (y === 0 || y === 1) && (k === 0 || y !== m.muzzles[k - 1])), `B3 : les deux canons tirent à tour de rôle (${m.muzzles})`);
}

// ---------------------------------------------------------------- C. Commandes du vol, énergie

/**
 * Énergie partagée par le tir et le turbo, canon léger, pilote coupé (rien d'autre ne tire) ; Espace (turbo) simulé
 * par des événements clavier dans la même tâche que les traces. Énergie refroidie, puis : turbo seul jusqu'à la
 * surchauffe (chauffe BOOST_HEAT par seconde, vitesse en hausse, aucun tir, repère du turbo au HUD) ; en surchauffe,
 * Espace et TIR (fire) tenus : ni turbo ni tir tant que l'énergie n'est pas sous 30 %, puis les deux reprennent ;
 * énergie refroidie, puis TIR et turbo ensemble : chauffes additionnées, surchauffe bien plus tôt. Renvoie les mesures.
 */
async function energyTrial(t, label) {
  const r = await t.ev(() => {
    const a = window.__xr3d;
    const space = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ' }));
    a.autopilot(false);
    a.fire(false);
    window.__xrTrace(156); // pause sans tirer ni pousser, puis refroidissement complet
    const n0 = window.__sfxLog.length;
    space('keydown');
    const boost = window.__xrTrace(60 * 4, 'i.overheated');
    a.fire(true);
    const over = window.__xrTrace(60 * 3, '!i.overheated && i.boosting && i.shotsFired > i0.shotsFired');
    a.fire(false);
    space('keyup');
    const cooled = window.__xrTrace(60 * 4, 'i.heat === 0');
    a.fire(true);
    space('keydown');
    const both = window.__xrTrace(60 * 4, 'i.overheated');
    a.fire(false);
    space('keyup');
    window.__xrTrace(6);
    return { boost, over, cooled: cooled[cooled.length - 1], both, log: window.__sfxLog.slice(n0) };
  });
  const st = (rows) => (rows.length - 1) / 60;
  // Turbo seul
  const b0 = r.boost[0];
  const bEnd = r.boost[r.boost.length - 1];
  const bOver = st(r.boost);
  const pre = r.boost.slice(1, -1);
  const fast = Math.max(...pre.map((x) => x.speed));
  t.log(`${label} : turbo seul surchauffé en ${bOver.toFixed(2)} s (énergie ${b0.heat} -> ${bEnd.heat}), vitesse ${b0.speed} -> ${fast}`);
  assert(b0.heat === 0 && !b0.boosting, `${label} : énergie froide, turbo au repos avant l'essai (${fmt(b0)})`);
  assert(pre.length > 0 && pre.every((x) => x.boosting && x.fired === b0.fired), `${label} : turbo en marche jusqu'à la surchauffe, aucun tir sans TIR`);
  assertNear(pre[59].heat, BOOST_HEAT, 0.01, `${label} : énergie chauffée de ${BOOST_HEAT} en 1 s de turbo`);
  assertNear(bOver, 1 / BOOST_HEAT, 0.05, `${label} : turbo seul : surchauffe après ${1 / BOOST_HEAT} s depuis une jauge froide`);
  assert(fast >= b0.speed * 1.4, `${label} : turbo : vitesse en hausse (${b0.speed} -> ${fast})`);
  assert(pre.some((x) => x.hudBoost), `${label} : repère du turbo allumé sur la jauge du HUD`);
  assert(bEnd.over && !bEnd.boosting && bEnd.hudOver && !bEnd.hudBoost, `${label} : surchauffe : turbo coupé, jauge du HUD en surchauffe (${fmt(bEnd)})`);
  // Surchauffe, Espace et TIR tenus : rien jusqu'à 30 %, puis turbo et tir reprennent
  const o = r.over;
  const out = o.findIndex((x) => !x.over);
  assert(out > 0, `${label} : la surchauffe doit se terminer (${fmt(o[o.length - 1])})`);
  const still = o.slice(1, out);
  assert(still.every((x) => !x.boosting && x.fired === o[0].fired), `${label} : en surchauffe, ni turbo ni tir malgré Espace et TIR tenus`);
  assertNear(out / 60, (1 - RECOVER_AT) / GUNS.light.coolRate, 0.05, `${label} : reprise sous 30 % après la surchauffe (s)`);
  assert(o[out - 1].heat < RECOVER_AT + 0.02, `${label} : reprise sous 30 % (${o[out - 1].heat})`);
  const end = o[o.length - 1];
  assert(end.boosting && end.fired > o[0].fired && o.length - 1 - out <= 2, `${label} : turbo et tir repris dès la fin de la surchauffe (${fmt({ out, steps: o.length - 1, end })})`);
  // Refroidi, puis TIR et turbo ensemble : surchauffe bien plus tôt (canon léger : 0,25 + turbo 0,4 par seconde)
  assertEq(r.cooled.heat, 0, `${label} : énergie refroidie entre les essais`);
  const bothOver = st(r.both);
  const fired = r.both[r.both.length - 1].fired - r.both[0].fired;
  t.log(`${label} : TIR et turbo ensemble : surchauffe en ${bothOver.toFixed(2)} s, ${fired} tirs`);
  const rate = BOOST_HEAT + GUNS.light.rate / GUNS.light.shotsToOver;
  assertNear(bothOver, 1 / rate, 0.15, `${label} : TIR et turbo : chauffes additionnées, surchauffe vers ${(1 / rate).toFixed(2)} s`);
  assert(r.both.slice(1, -1).every((x) => x.boosting) && fired >= 6, `${label} : TIR et turbo en marche jusqu'à la surchauffe (${fired} tirs)`);
  assert(count(r.log, 'overheat') >= 2 && count(r.log, 'boost') >= 3, `${label} : sons de la surchauffe et du turbo (${fmt({ overheat: count(r.log, 'overheat'), boost: count(r.log, 'boost') })})`);
  return { boostOver: bOver, bothOver, recover: out / 60 };
}

async function partC(t, f) {
  const i0 = await startFlight(t, 'f1', { crystals: 0, ship: { gun: 0, shield: 2, boost: 0 }, settings: { leftHanded: false } });
  assertEq({ shield: i0.shield, maxShields: i0.maxShields }, { shield: 5, maxShields: 5 }, 'C : 5 boucliers');
  // Gros TIR en bas à droite (pouce droit), TURBO plus petit juste au-dessus, sans chevauchement
  const shoot = await rects(t, '.xr-shoot');
  const boost = await rects(t, '.xr-boost');
  assert(shoot.length === 1 && boost.length === 1, `C : boutons TIR et TURBO visibles (${fmt({ shoot, boost })})`);
  const [S, B] = [shoot[0], boost[0]];
  const Wv = await t.ev(() => window.innerWidth);
  const cx = (r) => r.x + r.w / 2;
  assert(
    S.x + S.w > Wv - 60 && S.w > B.w && B.y + B.h <= S.y && Math.abs(cx(B) - cx(S)) < S.w / 2,
    `C : gros TIR en bas à droite, TURBO plus petit au-dessus (${fmt({ S, B })})`,
  );
  assert(/TIR/.test(S.text) && /TURBO/.test(B.text), `C : libellés TIR et TURBO (${S.text}, ${B.text})`);
  const hud = await hudCombat(t);
  assertEq(hud.shields, 5, 'C : 5 boucliers au HUD');
  await t.shot('c-hud-844x390');

  // --- Aucun tir sans appui ; mine posée sur la route : frôlée, elle explose (−1 bouclier, sans points)
  // (le pilote automatique d'afterFirstWave tire : sons comptés après lui)
  await afterFirstWave(t);
  const sfx0 = (await sfxLog(t)).length;
  let r = await t.ev((v) => {
    window.__xr3d.spawn('mine', 45, v);
    return window.__xrTrace(150, 'i.shield < i0.shield');
  }, VARIANT.mine);
  let hit = firstStep(r, (x, p) => x.shield < p.shield);
  t.log(`C : mine frôlée au pas ${hit} (${fmt(r[hit])})`);
  assert(hit > 0, 'C : la mine doit exploser au passage de la Comète');
  assert(r.some((x) => x.target === 'mine' && x.hit), 'C : mine visée (dans le cône) et atteignable (condition de l’ancien tir automatique) mais...');
  assertEq(r[hit].fired, r[0].fired, 'C : ... aucun tir sans appui sur TIR');
  assertEq([r[hit].shield, r[hit - 1].mine - r[hit].mine], [4, 1], 'C : mine explosée au même pas qu’un bouclier perdu');
  assertEq([r[hit].killed, r[hit].points], [r[hit - 1].killed, r[hit - 1].points], 'C : mine percutée : ni ennemi abattu ni points');
  assertEq(r[hit].dropped, r[hit - 1].dropped, 'C : mine percutée : aucun cristal lâché');
  await trace(t, 70); // invulnérabilité (1 s) passée

  // --- Chasseur : son orbe vise la position anticipée ; la Comète reste en place : un bouclier perdu
  await t.ev(() => window.__xr3d.timeScale(0.1));
  await waitFor(t, () => document.querySelectorAll('.toasts .toast').length === 0, { timeout: 6000, label: 'C : messages du départ effacés' });
  await t.ev(() => window.__xr3d.timeScale(1));
  r = await t.ev((v) => {
    window.__xr3d.spawn('fighter', 60, v);
    return window.__xrTrace(150, 'i.orbsActive > 0');
  }, VARIANT.fighter);
  const fired = r[r.length - 1].orbs > 0;
  assert(fired, `C : orbe tirée par le chasseur (${fmt(r[r.length - 1])})`);
  t.log(`C : orbe tirée ${((r.length - 1) / 60).toFixed(2)} s après l'apparition du chasseur`);
  await t.wait(150);
  await slowShot(t, 'c-orb-nebula', 50);
  await t.ev(() => window.__xr3d.timeScale(1));
  r = await trace(t, 300, 'i.shield < i0.shield');
  hit = firstStep(r, (x, p) => x.shield < p.shield);
  t.log(`C : orbe reçue au pas ${hit} (${fmt(r[hit])})`);
  assert(hit > 0, 'C : l’orbe doit toucher la Comète restée en place');
  assertEq([r[hit].shield, r[hit - 1].orbs - r[hit].orbs], [3, 1], 'C : orbe disparue au même pas qu’un bouclier perdu');
  assertEq(r[hit].fired, r[0].fired, 'C : toujours aucun tir sans appui');
  assertEq([r[hit].dropped, r[hit].points, r[hit].killed], [r[hit - 1].dropped, r[hit - 1].points, r[hit - 1].killed], 'C : orbe reçue : ni cristal, ni points, ni ennemi abattu');
  let log = (await sfxLog(t)).slice(sfx0);
  assert(count(log, 'enemyOrb') >= 1 && count(log, 'shipGun') === 0, `C : son de l'orbe, aucun son de tir (${fmt(log.slice(-12))})`);
  await trace(t, 70);
  await recenter(t);

  // --- Bouton TIR tactile tenu : la Comète tire (énergie refroidie par settle : le pilote automatique de recenter
  // a pu prendre le turbo et tirer)
  const P = await center(t, '.xr-shoot');
  await t.ev(() => window.__xr3d.settle());
  let n0 = (await info(t)).shotsFired;
  await f.start([[...P, 1]]);
  await waitInput(t, (i) => i.fire, 'TIR tenu');
  await t.wait(800);
  let n1 = (await info(t)).shotsFired;
  await f.end();
  await waitInputIdle(t, 'TIR relâché');
  t.log(`C : TIR tactile tenu 800 ms : ${n1 - n0} tirs`);
  assert(n1 - n0 >= 2, `C : TIR tactile : la Comète tire (${n0} -> ${n1})`);

  // --- Joystick + TURBO + TIR tenus ensemble (3 doigts)
  const W = await t.ev(() => window.innerWidth);
  const H = await t.ev(() => window.innerHeight);
  const J = [Math.round(W * 0.2), Math.round(H * 0.65)];
  const T = await center(t, '.xr-boost');
  await t.ev(() => window.__xr3d.settle());
  const v0 = (await info(t)).speed;
  n0 = (await info(t)).shotsFired;
  await f.start([[...J, 2]]);
  await f.move([[J[0] + 60, J[1] - 10, 2]]);
  await f.start([[J[0] + 60, J[1] - 10, 2], [...T, 3]]);
  await f.start([[J[0] + 60, J[1] - 10, 2], [...T, 3], [...P, 4]]);
  const st = await waitInput(t, (i) => i.fire && i.boost && i.stickX > 0.5, 'joystick + TURBO + TIR');
  await t.wait(700);
  const i1 = await info(t);
  await t.shot('c-stick-turbo-fire');
  await f.end();
  await waitInputIdle(t, 'trois doigts levés');
  t.log(`C : trois doigts ${fmt({ stickX: st.stickX, boost: st.boost, fire: st.fire })} : vitesse ${v0} -> ${i1.speed}, tirs +${i1.shotsFired - n0}, énergie ${i1.heat}`);
  assert(
    i1.shotsFired - n0 >= 2 && i1.speed >= v0 * 1.2 && i1.boosting && !i1.overheated,
    `C : trois doigts : tir et turbo ensemble (${fmt({ v0, v1: i1.speed, tirs: i1.shotsFired - n0, boosting: i1.boosting, heat: i1.heat })})`,
  );

  // --- Clavier : J, X, F tirent (TIR au clavier)
  // (appui tenu plus longtemps que la cadence : un appui bref juste après un tir est perdu, comme au sol, la
  // mémoire de l'appui, 150 ms, étant plus courte que la cadence du canon léger)
  for (const k of ['KeyJ', 'KeyX', 'KeyF']) {
    await t.wait(300);
    n0 = (await info(t)).shotsFired;
    await t.key(k, 300);
    await t.wait(150);
    n1 = (await info(t)).shotsFired;
    assert(n1 > n0, `C : touche ${k} : un tir (${n0} -> ${n1})`);
  }

  // --- Canon léger : cadence, surchauffe, reprise
  await recenter(t);
  await measureGun(t, 'C : canon léger', 'light');
  log = await sfxLog(t);
  assert(count(log, 'overheat') >= 1 && count(log, 'shipMachinegun') === 0, 'C : son de la surchauffe, pas de son de mitrailleuse');

  // --- Énergie partagée : turbo seul, surchauffe (ni turbo ni tir), TIR et turbo ensemble
  await recenter(t);
  const en = await energyTrial(t, 'C : énergie');
  t.log(`C : énergie ${fmt(en)}`);
  // Capture du HUD : turbo en marche (repère allumé), énergie qui chauffe
  await recenter(t);
  await t.ev(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
    window.__xrTrace(50);
  });
  await slowShot(t, 'c-hud-turbo', 0);
  await t.ev(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }));
    window.__xr3d.timeScale(1);
  });
  await recenter(t);

  // --- Gros plans (nébuleuse) : chasseur, mine, essaim, explosion, cristaux
  await closeups(t, 'c-nebula', CRUISE.f1);
  await recenter(t);

  // --- HUD à 640x320 (5 boucliers au départ, énergie, cristaux, TIR et TURBO)
  await t.page.setViewportSize({ width: 640, height: 320 });
  await t.wait(400);
  await t.shot('c-hud-640x320');
  await t.page.setViewportSize({ width: 844, height: 390 });
  await t.wait(400);

  // --- J tire aussi sans cible pendant que le pilote automatique vole (il ne tient TIR que sur les cibles
  // atteignables) : vol jusqu'à 20 pas d'affilée sans cible (canon prêt, énergie sous 50 %), puis J tenue
  // (événements clavier dans la même tâche que la trace)
  const jr = await t.ev(() => {
    window.__xr3d.autopilot(true);
    const pre = window.__xrTrace(60 * 30, 'rows.length > 20 && rows.slice(-20).every((x) => x.target === null) && i.heat < 0.5');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j' }));
    const rows = window.__xrTrace(30);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', key: 'j' }));
    window.__xr3d.autopilot(false);
    return { pre, rows };
  });
  checkPilotFire(jr.pre, 'C : avant l’appui sur J (pilote automatique)');
  assert(jr.pre.length > 20 && jr.pre.slice(-20).every((x) => x.target === null), 'C : 20 pas d’affilée sans cible trouvés');
  const free = jr.rows.filter((x, k) => k > 0 && x.fired > jr.rows[k - 1].fired && !(x.target !== null && x.hit));
  t.log(`C : J tenue 0,5 s, pilote automatique : ${jr.rows[jr.rows.length - 1].fired - jr.rows[0].fired} tirs, dont ${free.length} sans cible atteignable`);
  assert(free.length >= 1, 'C : touche J avec le pilote automatique : tir sans cible');
  log = await sfxLog(t);
  assert(count(log, 'shipGun') >= 5, 'C : son des tirs');
}

// ---------------------------------------------------------------- D. Ceinture d'Orak

async function partD(t) {
  const i0 = await startFlight(t, 'f2', { crystals: 0, ship: { gun: 1, shield: 2, boost: 0 } });
  assertEq({ waves: i0.waves, crystalsTotal: i0.crystalsTotal, gunLevel: i0.gunLevel }, { waves: 10, crystalsTotal: CRYSTALS_TOTAL.f2, gunLevel: 1 }, 'D : départ de f2');
  assertNear(i0.range, CRUISE.f2 * 1.6, 0.2, 'D : portée en f2');

  // --- Gros plans (ceinture) ; messages du compte à rebours (« Go ! » au centre de l'écran, là où apparaissent
  // les ennemis) d'abord effacés
  await t.ev(() => window.__xr3d.timeScale(0.1));
  await waitFor(t, () => document.querySelectorAll('.toasts .toast').length === 0, { timeout: 6000, label: 'D : messages du départ effacés' });
  await t.ev(() => window.__xr3d.timeScale(1));
  await closeups(t, 'd-belt', CRUISE.f2);

  // --- Vol complet au pilote automatique (x2,5) : appels de dessin relevés pendant les vagues
  await t.ev(() => {
    window.__xr3d.autopilot(true);
    window.__xr3d.timeScale(2.5);
  });
  const t0 = Date.now();
  const maxSeen = { calls: 0, at: null, fighter: 0, mine: 0, swarm: 0, orbs: 0, shots: 0, crystalsActive: 0 };
  let last = null;
  let samples = 0;
  for (;;) {
    const i = await info(t);
    if (!i) break;
    last = i;
    samples++;
    if (i.drawCalls > maxSeen.calls) {
      maxSeen.calls = i.drawCalls;
      maxSeen.at = { progress: i.progress, enemies: i.enemies, orbs: i.orbsActive, shots: i.shotsActive, crystals: i.crystalsActive };
    }
    for (const k of ['fighter', 'mine', 'swarm']) maxSeen[k] = Math.max(maxSeen[k], i.enemies[k]);
    maxSeen.orbs = Math.max(maxSeen.orbs, i.orbsActive);
    maxSeen.shots = Math.max(maxSeen.shots, i.shotsActive);
    maxSeen.crystalsActive = Math.max(maxSeen.crystalsActive, i.crystalsActive);
    if (i.phase !== 'fly') break;
    assert(Date.now() - t0 < 90000, `D : vol trop long (${fmt(i)})`);
    await t.wait(40);
  }
  t.log(`D : ${samples} relevés, maxima ${fmt(maxSeen)} ; fin ${fmt({ phase: last.phase, shield: last.shield, killed: last.enemies.killed, crystals: last.crystals, rocks: last.rocksDestroyed, points: last.points })}`);
  assertEq(last.phase, 'warp', 'D : f2 fini au pilote automatique');
  assert(last.shield >= 1, 'D : au moins un bouclier');
  assert(maxSeen.fighter >= 1 && maxSeen.mine >= 1 && maxSeen.swarm >= 5, `D : les trois types d'ennemis rencontrés (${fmt(maxSeen)})`);
  assert(maxSeen.calls > 0 && maxSeen.calls < 150, `D : appels de dessin sous 150 (max ${maxSeen.calls})`);
  await t.ev(() => window.__xr3d && window.__xr3d.timeScale(1));
}

export default async function (t) {
  await installTrace(t);
  await trackThreeScenes(t);
  const f = touches(t);
  await checkCourses(t);
  await partA(t);
  await partB(t);
  await partB3(t);
  await partC(t, f);
  await partD(t);
}
