// Diagnostic (plan 04, étapes 6 et 9) : une IA de test simple affronte les mini-boss du monde 1 (?at=boss), au laser
// sans amélioration ni double saut, sans mode dieu, sur une sauvegarde neuve. Ses commandes remplacent hooks.input
// (état modifié avant chaque image).
// - Blob-roi (j1) : elle se tient à distance, esquive le bond (s'éloigne, ou passe dessous si elle est acculée), saute
//   les ondes, tire sur le noyau aplati par rafales (jamais en surchauffe) et abat les petits blobs.
// - Scarabée-titan (j2, ennemis du niveau retirés) : entre deux charges, elle file vers le champignon opposé au titan
//   (il s'assomme contre lui) ; acculée, elle y rebondit par-dessus la charge, sinon elle la saute en courant vers
//   lui ; titan sur le dos : en l'air, elle se dirige vers son ventre (sauts), au sol elle tire à ≈ 150 px ; elle
//   s'écarte vers le milieu avant son réveil et quitte un champignon de coin du côté du titan, fuit les cailloux.
//   BOT_MAX_S : durée maximale d'un combat (essais courts) ; BOT_TRACE=1 : relevé des charges et étourdissements.
// Mesure, sur l'horloge de la scène, la durée du combat (barrières fermées → défaite, vies perdues comprises), les
// cœurs perdus, les vies perdues, les tirs, les fenêtres (noyau aplati, titan sur le dos) et les touches (boss en
// touches, plan 04 point 20 : une au plus par fenêtre). Plusieurs combats
// par boss (BOT_RUNS, 3 par défaut ; BOT_BOSS=blobKing|beetleTitan pour un seul). Seul verdict : les combats sont
// gagnés. Réglages : src/game2d/engine/bosses/blobKing.ts, beetleTitan.ts.
import { assert, fmt, waitFor, waitFor2dPlay } from '../lib/helpers.mjs';

export const meta = {
  title: 'Mini-boss du monde 1 : IA de test, durée des combats au laser',
  suites: ['diag'],
  dev: true,
  timeoutMs: 1800000,
};

const RUNS = Math.max(1, Number(process.env.BOT_RUNS) || 3);
/** Combat abandonné au-delà (horloge de la scène, ms ; BOT_MAX_S pour un essai court). */
const MAX_FIGHT_MS = (Number(process.env.BOT_MAX_S) || 240) * 1000;
const BOSSES = [
  { id: 'blobKing', stage: 'j1', clearLevel: false },
  { id: 'beetleTitan', stage: 'j2', clearLevel: true },
].filter((b) => !process.env.BOT_BOSS || process.env.BOT_BOSS === b.id);

/** Installé dans la page : l'IA, ses commandes et son relevé (window.__bot). */
function installBot() {
  const s = window.__xr2d.scene;
  const hooks = s.session.hooks;
  const real = hooks.input;
  const st = { left: false, right: false, up: false, down: false, jump: false, fire: false, boost: false, stickX: 0, stickY: 0 };
  const presses = new Set();
  hooks.input = {
    state: st,
    consumePress: (a) => presses.delete(a),
    clearPresses: () => presses.clear(),
    setLayout: (l) => real.setLayout(l),
    setTouchOptions: (o) => real.setTouchOptions(o),
    setTiltEnabled: (o) => real.setTiltEnabled(o),
    requestTiltPermission: () => real.requestTiltPermission(),
    calibrateTilt: () => real.calibrateTilt(),
    onPause: (cb) => real.onPause(cb),
  };
  const log = { start: -1, end: -1, hits: 0, deaths: 0, shots: 0, touches: 0, windows: 0, windowTouches: [], gaveUp: false };
  let hearts = s.hearts;
  let lives = s.lives;
  let lastAct = '';
  let dodge = 0;
  let jumpMs = 0;
  let fireMs = 0;
  let life = -1;
  let winTouches = 0;
  const b = s.boss;
  const titan = b.id === 'beetleTitan';
  // Réglages du titan recopiés (beetleTitan.ts) : avant depuis les pieds, étourdissement par phase.
  const FRONT = 119;
  const STUN_MS = [2600, 2200];
  const origFire = s.lasers.fire.bind(s.lasers);
  s.lasers.fire = (...args) => {
    log.shots++;
    return origFire(...args);
  };
  const press = (dir) => {
    st.left = dir < 0;
    st.right = dir > 0;
    st.stickX = dir;
  };
  const step = () => {
    const dt = s.game.loop.delta;
    jumpMs -= dt;
    fireMs -= dt;
    if (s.lives < lives) log.deaths += lives - s.lives;
    else if (s.hearts < hearts) log.hits += hearts - s.hearts;
    hearts = s.hearts;
    lives = s.lives;
    if (s.state !== 'play') {
      press(0);
      st.jump = st.fire = false;
      lastAct = '';
      return;
    }
    const p = s.player;
    const px = p.x;
    let move = 0;
    let jump = false;
    let hold = 150;
    let fire = false;
    let face = 0;
    if (b.state === 'fight' && log.start < 0) log.start = s.clockMs;
    if (b.state === 'beaten' && log.end < 0) log.end = s.clockMs;
    if (log.start >= 0 && log.end < 0 && s.clockMs - log.start > 240000) log.gaveUp = true;
    if (b.life !== life) {
      if (life > b.life && b.state !== 'wait') {
        log.touches += life - b.life;
        winTouches += life - b.life;
      }
      life = b.life;
    }
    const lo = b.spot.left + 24;
    const hi = b.spot.right - 24;
    const bx = b.x;
    const ad = Math.abs(bx - px);
    const toBoss = bx > px ? 1 : -1;
    if (b.state === 'wait' && s.arena.state === 'open') {
      // Vers l'arène ; un obstacle (champignon contre la première borne) se franchit d'un saut.
      move = 1;
      if (p.onGround && p.body.blocked.right) jump = true;
    } else if (b.state === 'fight' && !titan) {
      const act = b.act;
      if (act === 'flat' && lastAct !== 'flat') {
        log.windows++;
        winTouches = 0;
      }
      if (act !== 'flat' && lastAct === 'flat') log.windowTouches.push(winTouches);
      // Petits blobs : le plus proche, à abattre (ou à sauter s'il est tout près).
      let minion = null;
      let md = Infinity;
      for (const e of s.enemies.list) {
        if (!e.summoned || !e.alive) continue;
        const d = Math.abs(e.sprite.x - px);
        if (d < md) {
          md = d;
          minion = e;
        }
      }
      if (act === 'leap') {
        if (lastAct !== 'leap') {
          // Bond vers la position de Kaï : on s'éloigne s'il y a la place, sinon on passe sous la parabole.
          const away = Math.sign(px - b.leapFrom) || 1;
          const room = away > 0 ? hi - px : px - lo;
          dodge = room >= 250 ? away : -away;
        }
        move = dodge;
      } else if (act === 'flat' || act === 'rise') {
        for (const w of b.waves) {
          if (w.alive && Math.sign(px - w.x) === w.dir && Math.abs(px - w.x) < 100) jump = true;
        }
        if (act === 'flat' && ad < 540) {
          face = toBoss;
          fire = true;
        }
        if (ad < 170) move = -toBoss;
      } else {
        // Repos, annonce, cri, colère : à ≈ 300 px du boss, du côté où il y a de la place.
        if (ad < 250) {
          const away = -toBoss;
          const room = away > 0 ? hi - px : px - lo;
          if (room > 80) move = away;
        } else if (ad > 380) {
          move = toBoss;
        }
        face = toBoss;
      }
      if (minion && md < 320 && act !== 'leap') {
        face = minion.sprite.x > px ? 1 : -1;
        fire = true;
        if (md < 70) jump = true;
      }
    } else if (b.state === 'fight' && titan) {
      const act = b.act;
      // Butées de la charge : devant les champignons posés contre les bornes (champs privés lisibles).
      const stopL = b.stopLeft;
      const stopR = b.stopRight;
      if (act === 'stunned' && lastAct !== 'stunned') {
        log.windows++;
        winTouches = 0;
      }
      if (act !== 'stunned' && lastAct === 'stunned') log.windowTouches.push(winTouches);
      if (act === 'charge') {
        if (Math.sign(px - bx) === b.facing) {
          const stop = b.facing > 0 ? stopR : stopL;
          if (Math.abs(stop - px) < 140) {
            // Acculée devant le champignon : on monte dessus, il nous relance par-dessus la charge.
            move = b.facing;
            if (p.onGround) jump = true;
          } else {
            // On court vers lui et on saute quand il sera sous Kaï dans ≈ 0,22 s.
            const front = bx + b.facing * FRONT;
            const d = (px - front) * b.facing - 17;
            move = -b.facing;
            const rel = b.speed + Math.abs(p.body.velocity.x);
            if (p.onGround && d < rel * 0.24) {
              jump = true;
              hold = 420;
            }
          }
        } else {
          face = toBoss;
        }
      } else if (act === 'stunned') {
        const left = STUN_MS[b.phase > 1 ? 1 : 0] - b.actMs;
        face = toBoss;
        if (left < 380) {
          // Réveil imminent : on s'écarte, vers le milieu de l'arène (côté mur : d'un saut par-dessus lui).
          const mid = Math.sign((stopL + stopR) / 2 - px) || 1;
          if (ad < 280) move = mid;
          if (mid === toBoss && p.onGround) jump = true;
        } else if (!p.onGround) {
          // En l'air (rebond sur le champignon ou sur lui) : vers son ventre.
          if (ad > 25) move = toBoss;
          fire = true;
        } else {
          // Au sol : à ≈ 150 px, côté ventre, et on tire.
          if (ad > 175) move = toBoss;
          else if (ad < 125) move = -toBoss;
          fire = ad < 520;
        }
      } else {
        // Marche, annonce, cri, réveil, colère : devant le champignon opposé au titan (il viendra s'y assommer),
        // tournée vers lui ; pas plus près que 300 px.
        const goal = bx < (stopL + stopR) / 2 ? stopR - 60 : stopL + 60;
        if (ad < 300) move = -toBoss;
        else if (Math.abs(goal - px) > 30) move = goal > px ? 1 : -1;
        face = toBoss;
        // Sur un champignon de coin (entre la butée et la borne), du côté du titan : on en sort par le milieu.
        if ((px < stopL || px > stopR) && Math.sign(bx - px) === Math.sign((stopL + stopR) / 2 - px)) {
          move = toBoss;
          if (p.onGround) jump = true;
        }
      }
      // Cailloux annoncés ou qui tombent tout près de Kaï : on s'écarte (vers l'intérieur de l'arène).
      for (const r of b.rocks) {
        if ((r.phase === 'warn' || r.phase === 'fall') && Math.abs(r.x - px) < 50) {
          move = r.x > px ? (px - stopL > 70 ? -1 : 1) : stopR - px > 70 ? 1 : -1;
        }
      }
    }
    // Se tourner : un appui d'une image vers la cible si Kaï regarde ailleurs.
    if (move === 0 && face !== 0 && p.facing !== face) move = face;
    if (window.__botTrace && titan && b.state === 'fight' && (b.act === 'stunned' || b.act === 'charge') && window.__botTrace.length < 400 && Math.floor(s.clockMs / 150) !== Math.floor((s.clockMs - dt) / 150)) {
      window.__botTrace.push([b.act, Math.round(b.actMs), Math.round(px), Math.round(bx), b.facing, move, fire ? 1 : 0, jump ? 1 : 0, p.onGround ? 1 : 0, p.facing, Math.round(p.feetY), b.life]);
    }
    press(move);
    if (jump && p.onGround && jumpMs <= -200) {
      presses.add('jump');
      jumpMs = hold;
    }
    st.jump = jumpMs > 0;
    // Rafales : jamais en surchauffe (chauffe laissée sous 0,8), comme un joueur attentif.
    const g = s.gun;
    if (fire && !g.overheated && g.heat < 0.8 && p.facing === (face || p.facing)) fireMs = 60;
    st.fire = fireMs > 0;
    lastAct = b.act;
  };
  s.events.on('preupdate', step);
  window.__bot = {
    log,
    stop: () => {
      s.events.off('preupdate', step);
      hooks.input = real;
      s.lasers.fire = origFire;
    },
  };
}

export default async function (t) {
  const all = [];
  for (const boss of BOSSES) {
    const results = [];
    for (let run = 1; run <= RUNS; run++) {
      await t.goto(`?touch=0&stage=${boss.stage}&at=boss`);
      await waitFor2dPlay(t);
      if (boss.clearLevel) {
        // Ennemis du niveau (cracheur, volant près de l'arène) : hors du combat mesuré.
        await t.ev(() => {
          for (const e of window.__xr2d.scene.enemies.list) {
            if (!e.alive || e.summoned) continue;
            e.alive = false;
            e.dying = 0;
            if (e.body) {
              e.body.stop();
              e.body.enable = false;
            }
            e.sprite.setVisible(false).setActive(false);
          }
        });
      }
      if (process.env.BOT_TRACE) await t.ev(() => (window.__botTrace = []));
      await t.ev(installBot);
      const t0 = Date.now();
      const out = await waitFor(
        t,
        (max) => {
          const b = window.__bot;
          const s = window.__xr2d && window.__xr2d.scene;
          if (!b || !s) return { lost: true };
          if (b.log.end >= 0 || b.log.gaveUp || s.state === 'over' || (b.log.start >= 0 && s.clockMs - b.log.start > max)) {
            return { ...b.log, state: s.state, life: s.boss.life, clock: s.clockMs };
          }
          return false;
        },
        { timeout: MAX_FIGHT_MS + 60000, interval: 500, label: `${boss.id} : combat ${run}`, arg: MAX_FIGHT_MS },
      );
      await t.ev(() => window.__bot && window.__bot.stop());
      if (process.env.BOT_TRACE) t.log('trace', JSON.stringify(await t.ev(() => window.__botTrace)));
      const fightS = out.end >= 0 ? (out.end - out.start) / 1000 : NaN;
      const per = out.windowTouches.length > 0 ? out.windowTouches.reduce((x, y) => x + y, 0) / out.windowTouches.length : 0;
      results.push({ run, won: out.end >= 0, fightS, realS: (Date.now() - t0) / 1000, hits: out.hits, deaths: out.deaths, shots: out.shots, touches: out.touches, windows: out.windows, perWindow: per });
      t.log(
        `${boss.id}, combat ${run} : ${out.end >= 0 ? 'gagné' : 'perdu'} en ${fightS.toFixed(1)} s de jeu (${((Date.now() - t0) / 1000).toFixed(0)} s réelles), ` +
          `${out.hits} cœur(s) et ${out.deaths} vie(s) perdus, ${out.shots} tirs, ${out.touches} touche(s) en ${out.windows} fenêtres ` +
          `(${per.toFixed(2)} par fenêtre ; ${fmt(out.windowTouches)})`,
      );
      await t.shot(`${boss.id}-run-${run}`);
    }
    const won = results.filter((r) => r.won);
    const mean = won.length > 0 ? won.reduce((x, r) => x + r.fightS, 0) / won.length : NaN;
    t.log(`${boss.id} : moyenne des combats gagnés : ${mean.toFixed(1)} s (${won.length}/${results.length})`);
    all.push({ boss: boss.id, results });
  }
  for (const a of all) {
    const won = a.results.filter((r) => r.won).length;
    assert(won === a.results.length, `${a.boss} : combats gagnés par l'IA : ${won}/${a.results.length} (${fmt(a.results)})`);
  }
}
