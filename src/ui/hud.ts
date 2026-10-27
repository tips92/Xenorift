import type { FlightHud, HudApi, PlatformHud, PowerUpKind, ToastKind } from '../core/types';
import { clamp, div, el, icon, play } from './dom';
import { ICONS, ensureSvgDefs, powerIcon, powerLabel } from './icons';

// HUD en DOM, partagé par les modes 2D et 3D.
// Règle de performance : le DOM n'est touché que lorsqu'une valeur affichée change réellement
// (valeurs quantifiées, aucune allocation par image tant que rien ne change).

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/** Circonférence de l'anneau du bonus (cercle r = 20). */
const RING_C = 2 * Math.PI * 20;
const HEAT_STEPS = 50;
const BOOST_STEPS = 50;
const PROGRESS_STEPS = 400;
const MAX_TOASTS = 3;
const TOAST_MS = 1400;
const TOAST_OUT_MS = 320;

// Animations ponctuelles (déclenchées par un évènement, jamais à chaque image).
const SHAKE: Keyframe[] = [
  { transform: 'translate3d(0,0,0)' },
  { transform: 'translate3d(-6px,0,0) rotate(-3deg)' },
  { transform: 'translate3d(6px,0,0) rotate(3deg)' },
  { transform: 'translate3d(-4px,0,0)' },
  { transform: 'translate3d(3px,0,0)' },
  { transform: 'translate3d(0,0,0)' },
];
const SHAKE_OPTS: KeyframeAnimationOptions = { duration: 420, easing: 'ease-out' };
const POP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.38)' }, { transform: 'scale(1)' }];
const POP_OPTS: KeyframeAnimationOptions = { duration: 280, easing: 'ease-out' };
const LOST: Keyframe[] = [
  { transform: 'scale(1.5)', opacity: 1 },
  { transform: 'scale(0.75)', opacity: 0.4 },
  { transform: 'scale(1)', opacity: 1 },
];
const LOST_OPTS: KeyframeAnimationOptions = { duration: 480, easing: 'ease-out' };
const BUMP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }];
const BUMP_OPTS: KeyframeAnimationOptions = { duration: 200, easing: 'ease-out' };

function intOr(v: number, fallback: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : fallback;
}

function num01(v: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/** `onPauseClick` est appelé par le bouton pause du HUD. */
export function createHud(uiRoot: HTMLElement, onPauseClick: () => void): HudApi {
  ensureSvgDefs();

  const root = div('hud is-hidden');

  // ---------------------------------------------------------------- Plateforme : DOM

  const plat = div('hud-platform');

  const stats = div('hud-chip hud-stats');
  const heartsEl = div('hud-hearts');
  const heartEls: HTMLSpanElement[] = [];

  const livesEl = div('hud-lives');
  const livesN = el('b', 'hud-num', '3');
  livesEl.append(icon(ICONS.helmet, 'ico ico-helmet'), el('span', 'hud-x', '×'), livesN);

  const crystEl = div('hud-crystals');
  const crystIco = icon(ICONS.crystal, 'ico ico-crystal');
  const crystN = el('b', 'hud-num', '0');
  const crystT = el('small', 'hud-total', '/0');
  crystEl.append(crystIco, crystN, crystT);

  stats.append(heartsEl, div('hud-sep'), livesEl, div('hud-sep'), crystEl);

  const heat = div('hud-heat');
  heat.dataset.level = 'cool';
  const heatTrack = div('heat-track');
  const heatCover = div('heat-cover');
  heatTrack.append(div('heat-grad'), heatCover, div('heat-ticks'));
  const heatLabel = el('span', 'heat-label', 'SURCHAUFFE');
  heat.append(icon(ICONS.laser, 'ico ico-laser'), heatTrack, heatLabel);

  const power = div('hud-power');
  power.innerHTML =
    '<svg class="power-ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="20"/><circle class="ring-fg" cx="24" cy="24" r="20"/></svg>';
  const ringFg = power.querySelector('.ring-fg') as SVGCircleElement;
  const powerIco = div('power-icon');
  const powerLbl = el('span', 'power-label', '');
  power.append(powerIco, powerLbl);

  plat.append(stats, heat, power);

  // ---------------------------------------------------------------- Vol : DOM

  const fl = div('hud-flight');

  const prog = div('fl-progress');
  const progFill = div('fl-progress-fill');
  const progDotWrap = div('fl-progress-dot-wrap');
  progDotWrap.append(div('fl-progress-dot'));
  prog.append(progFill, progDotWrap);

  const flLeft = div('hud-chip fl-left');
  const shieldBox = div('fl-shield');
  const pips = div('fl-pips');
  const pipEls: HTMLSpanElement[] = [];
  shieldBox.append(el('span', 'fl-label', 'Bouclier'), pips);
  const boostBox = div('fl-boost');
  const boostTrack = div('fl-boost-track');
  const boostFill = div('fl-boost-fill');
  boostTrack.append(boostFill);
  boostBox.append(el('span', 'fl-label', 'Turbo'), boostTrack);
  flLeft.append(shieldBox, boostBox);

  const flCenter = div('fl-center');
  const timer = div('fl-timer');
  timer.setAttribute('role', 'timer');
  const timerChars: HTMLSpanElement[] = [];
  const timerShown: string[] = [];
  for (let i = 0; i < 7; i++) {
    const sep = i === 2 || i === 5;
    const span = el('span', sep ? 'tsep' : 'tdig', sep ? (i === 2 ? ':' : '.') : '-');
    timerChars.push(span);
    timerShown.push(span.textContent ?? '');
    timer.append(span);
  }
  const gatesEl = div('fl-gates');
  const gatesN = el('b', 'hud-num', '0');
  const gatesT = el('small', 'hud-total', '/0');
  gatesEl.append(icon(ICONS.gate, 'ico ico-gate'), el('span', 'fl-gates-label', 'Portails'), gatesN, gatesT);
  flCenter.append(timer, gatesEl);

  fl.append(prog, flLeft, flCenter);

  // ---------------------------------------------------------------- Bouton pause (seul élément interactif)

  const pauseBtn = el('button', 'hud-pause');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.innerHTML = ICONS.pause;
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (root.classList.contains('is-hidden')) return;
    onPauseClick();
  });
  // Appui avec un deuxième doigt (l'autre tient la croix) : voir enableSecondFingerTaps (dom.ts).

  root.append(plat, fl, pauseBtn);

  // Messages : couche indépendante du HUD (utilisable aussi dans les menus).
  const toasts = div('toasts');
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');

  uiRoot.append(root, toasts);

  // ---------------------------------------------------------------- Plateforme : état affiché

  let pHearts = -1;
  let pMaxHearts = -1;
  let pLives = -1;
  let pCrystals = -1;
  let pCrystalsTotal = -1;
  let pHeatQ = -1;
  let pHeatLevel = '';
  let pOver = false;
  let pPower: PowerUpKind | null = null;
  let pPowerQ = -1;
  let pEnding = false;

  function buildHearts(max: number): void {
    heartsEl.textContent = '';
    heartEls.length = 0;
    for (let i = 0; i < max; i++) {
      const h = icon(ICONS.heart, 'hud-heart');
      heartEls.push(h);
      heartsEl.append(h);
    }
  }

  function setMaxHearts(v: number): void {
    const n = intOr(v, 3, 0, 12);
    if (n === pMaxHearts) return;
    pMaxHearts = n;
    buildHearts(n);
    const keep = pHearts;
    pHearts = -1;
    setHearts(keep < 0 ? n : keep, false);
  }

  function setHearts(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, Math.max(0, pMaxHearts));
    if (n === pHearts) return;
    const prev = pHearts;
    pHearts = n;
    for (let i = 0; i < heartEls.length; i++) heartEls[i].classList.toggle('is-empty', i >= n);
    stats.classList.toggle('is-critical', n === 1 && pMaxHearts > 1);
    if (!animate || prev < 0) return;
    if (n < prev) {
      play(heartsEl, SHAKE, SHAKE_OPTS);
      for (let i = n; i < prev && i < heartEls.length; i++) play(heartEls[i], LOST, LOST_OPTS);
    } else {
      for (let i = prev; i < n && i < heartEls.length; i++) play(heartEls[i], POP, POP_OPTS);
    }
  }

  function setLives(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, 99);
    if (n === pLives) return;
    const prev = pLives;
    pLives = n;
    livesN.textContent = String(n);
    if (!animate || prev < 0) return;
    play(livesEl, n < prev ? SHAKE : POP, n < prev ? SHAKE_OPTS : POP_OPTS);
  }

  function setCrystals(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, 99999);
    if (n === pCrystals) return;
    const prev = pCrystals;
    pCrystals = n;
    crystN.textContent = String(n);
    crystEl.classList.toggle('is-complete', pCrystalsTotal > 0 && n >= pCrystalsTotal);
    if (animate && prev >= 0 && n > prev) play(crystIco, POP, POP_OPTS);
  }

  function setCrystalsTotal(v: number): void {
    const n = intOr(v, 0, 0, 99999);
    if (n === pCrystalsTotal) return;
    pCrystalsTotal = n;
    crystT.textContent = `/${n}`;
    crystEl.classList.toggle('is-complete', n > 0 && pCrystals >= n);
  }

  function setHeat(v: number): void {
    const q = Math.round(num01(v) * HEAT_STEPS);
    if (q === pHeatQ) return;
    pHeatQ = q;
    heatCover.style.transform = `scaleX(${(HEAT_STEPS - q) / HEAT_STEPS})`;
    const level = q < HEAT_STEPS * 0.5 ? 'cool' : q < HEAT_STEPS * 0.8 ? 'warm' : 'hot';
    if (level !== pHeatLevel) {
      pHeatLevel = level;
      heat.dataset.level = level;
    }
  }

  function setOverheated(on: boolean): void {
    if (on === pOver) return;
    pOver = on;
    heat.classList.toggle('is-over', on);
    if (on) play(heat, SHAKE, SHAKE_OPTS);
  }

  function setPower(kind: PowerUpKind | null, animate: boolean): void {
    if (kind === pPower) return;
    pPower = kind;
    pPowerQ = -1;
    pEnding = false;
    power.classList.remove('is-ending');
    if (!kind) {
      power.classList.remove('is-on');
      return;
    }
    power.dataset.kind = kind;
    powerIco.innerHTML = powerIcon(kind);
    powerLbl.textContent = powerLabel(kind);
    if (kind === 'shield') {
      // Bouclier : anneau statique en pointillés (dure jusqu'au prochain coup).
      ringFg.style.strokeDasharray = '7 5.566';
      ringFg.style.strokeDashoffset = '0';
    } else {
      ringFg.style.strokeDasharray = String(RING_C);
      ringFg.style.strokeDashoffset = '0';
    }
    power.classList.add('is-on');
    if (animate) play(power, POP, POP_OPTS);
  }

  function setPowerLeft(v: number): void {
    if (!pPower || pPower === 'shield') return;
    const q = Math.round(num01(v) * 100);
    if (q === pPowerQ) return;
    pPowerQ = q;
    ringFg.style.strokeDashoffset = String(RING_C * (1 - q / 100));
    const ending = q <= 20;
    if (ending !== pEnding) {
      pEnding = ending;
      power.classList.toggle('is-ending', ending);
    }
  }

  function resetPlatform(): void {
    pHearts = -1;
    pMaxHearts = -1;
    pLives = -1;
    pCrystals = -1;
    pCrystalsTotal = -1;
    pHeatQ = -1;
    pHeatLevel = '';
    pOver = true;
    pPower = 'triple';
    setMaxHearts(3);
    setHearts(3, false);
    setLives(3, false);
    setCrystalsTotal(0);
    setCrystals(0, false);
    setHeat(0);
    setOverheated(false);
    setPower(null, false);
    stats.classList.remove('is-critical');
  }

  // ---------------------------------------------------------------- Vol : état affiché

  let fDs = -2;
  let fDanger = false;
  let fGates = -1;
  let fGatesTotal = -1;
  let fShield = -1;
  let fMaxShield = -1;
  let fBoostQ = -1;
  let fBoostFull = false;
  let fBoostLow = false;
  let fProgQ = -1;

  function setTimerChar(i: number, c: string): void {
    if (timerShown[i] === c) return;
    timerShown[i] = c;
    timerChars[i].textContent = c;
  }

  function setTime(t: number): void {
    if (!Number.isFinite(t)) {
      if (fDs === -1) return;
      fDs = -1;
      for (let i = 0; i < 7; i++) if (i !== 2 && i !== 5) setTimerChar(i, '-');
      if (fDanger) {
        fDanger = false;
        flCenter.classList.remove('is-danger');
      }
      return;
    }
    // +1e-4 : 9.9 arrive parfois en 9.8999… et doit s'afficher 9.9.
    const ds = Math.max(0, Math.floor(t * 10 + 1e-4));
    if (ds === fDs) return;
    fDs = ds;
    const m = Math.min(99, Math.floor(ds / 600));
    const s = Math.floor(ds / 10) % 60;
    setTimerChar(0, DIGITS[Math.floor(m / 10)]);
    setTimerChar(1, DIGITS[m % 10]);
    setTimerChar(3, DIGITS[Math.floor(s / 10)]);
    setTimerChar(4, DIGITS[s % 10]);
    setTimerChar(6, DIGITS[ds % 10]);
    const danger = ds < 100;
    if (danger !== fDanger) {
      fDanger = danger;
      flCenter.classList.toggle('is-danger', danger);
    }
  }

  function setGates(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, 9999);
    if (n === fGates) return;
    const prev = fGates;
    fGates = n;
    gatesN.textContent = String(n);
    if (animate && prev >= 0 && n > prev) play(gatesEl, POP, POP_OPTS);
  }

  function setGatesTotal(v: number): void {
    const n = intOr(v, 0, 0, 9999);
    if (n === fGatesTotal) return;
    fGatesTotal = n;
    gatesT.textContent = `/${n}`;
  }

  function setMaxShield(v: number): void {
    const n = intOr(v, 3, 0, 12);
    if (n === fMaxShield) return;
    fMaxShield = n;
    pips.textContent = '';
    pipEls.length = 0;
    for (let i = 0; i < n; i++) {
      const p = icon(ICONS.hex, 'fl-pip');
      pipEls.push(p);
      pips.append(p);
    }
    const keep = fShield;
    fShield = -1;
    setShield(keep < 0 ? n : keep, false);
  }

  function setShield(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, Math.max(0, fMaxShield));
    if (n === fShield) return;
    const prev = fShield;
    fShield = n;
    for (let i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('is-empty', i >= n);
    flLeft.classList.toggle('is-critical', n <= 1 && fMaxShield > 1);
    if (!animate || prev < 0) return;
    if (n < prev) {
      play(shieldBox, SHAKE, SHAKE_OPTS);
      for (let i = n; i < prev && i < pipEls.length; i++) play(pipEls[i], LOST, LOST_OPTS);
    } else {
      for (let i = prev; i < n && i < pipEls.length; i++) play(pipEls[i], POP, POP_OPTS);
    }
  }

  function setBoost(v: number): void {
    const q = Math.round(num01(v) * BOOST_STEPS);
    if (q === fBoostQ) return;
    fBoostQ = q;
    boostFill.style.transform = `scaleX(${q / BOOST_STEPS})`;
    const full = q >= BOOST_STEPS;
    if (full !== fBoostFull) {
      fBoostFull = full;
      boostBox.classList.toggle('is-full', full);
    }
    const low = q < BOOST_STEPS * 0.2;
    if (low !== fBoostLow) {
      fBoostLow = low;
      boostBox.classList.toggle('is-low', low);
    }
  }

  function setProgress(v: number): void {
    const q = Math.round(num01(v) * PROGRESS_STEPS);
    if (q === fProgQ) return;
    fProgQ = q;
    const r = q / PROGRESS_STEPS;
    progFill.style.transform = `scaleX(${r})`;
    progDotWrap.style.transform = `translate3d(${r * 100}%,0,0)`;
  }

  function resetFlight(): void {
    fDs = -2;
    fGates = -1;
    fGatesTotal = -1;
    fShield = -1;
    fMaxShield = -1;
    fBoostQ = -1;
    fProgQ = -1;
    setTime(Number.NaN);
    setGatesTotal(0);
    setGates(0, false);
    setMaxShield(3);
    setShield(3, false);
    setBoost(1);
    setProgress(0);
    flLeft.classList.remove('is-critical');
  }

  // ---------------------------------------------------------------- Messages

  const toastTimers = new Map<HTMLElement, number>();

  function dropToast(t: HTMLElement): void {
    const id = toastTimers.get(t);
    if (id !== undefined) window.clearTimeout(id);
    toastTimers.delete(t);
    t.remove();
  }

  function scheduleToast(t: HTMLElement): void {
    const old = toastTimers.get(t);
    if (old !== undefined) window.clearTimeout(old);
    toastTimers.set(
      t,
      window.setTimeout(() => {
        t.classList.add('is-out');
        toastTimers.set(
          t,
          window.setTimeout(() => dropToast(t), TOAST_OUT_MS),
        );
      }, TOAST_MS),
    );
  }

  function clearToasts(): void {
    toastTimers.forEach((id) => window.clearTimeout(id));
    toastTimers.clear();
    toasts.textContent = '';
  }

  // ---------------------------------------------------------------- Visibilité

  let mode: 'none' | 'platform' | 'flight' = 'none';

  function show(next: 'platform' | 'flight'): void {
    if (mode !== next) {
      mode = next;
      root.dataset.mode = next;
    }
    root.classList.remove('is-hidden');
  }

  resetPlatform();
  resetFlight();

  return {
    showPlatform(): void {
      show('platform');
    },

    showFlight(): void {
      show('flight');
    },

    hide(): void {
      mode = 'none';
      root.classList.add('is-hidden');
      delete root.dataset.mode;
      clearToasts();
      // Remise à zéro pendant que le HUD est masqué : l'étape suivante part d'un état propre,
      // et les valeurs envoyées avant le prochain show*() sont conservées.
      resetPlatform();
      resetFlight();
    },

    updatePlatform(s: Partial<PlatformHud>): void {
      if (!s) return;
      if (s.maxHearts !== undefined) setMaxHearts(s.maxHearts);
      if (s.hearts !== undefined) setHearts(s.hearts, true);
      if (s.lives !== undefined) setLives(s.lives, true);
      if (s.crystalsTotal !== undefined) setCrystalsTotal(s.crystalsTotal);
      if (s.crystals !== undefined) setCrystals(s.crystals, true);
      if (s.heat !== undefined) setHeat(s.heat);
      if (s.overheated !== undefined) setOverheated(!!s.overheated);
      if (s.power !== undefined) setPower(s.power, true);
      if (s.powerLeft !== undefined) setPowerLeft(s.powerLeft);
    },

    updateFlight(s: Partial<FlightHud>): void {
      if (!s) return;
      if (s.timeLeft !== undefined) setTime(s.timeLeft);
      if (s.gatesTotal !== undefined) setGatesTotal(s.gatesTotal);
      if (s.gates !== undefined) setGates(s.gates, true);
      if (s.maxShield !== undefined) setMaxShield(s.maxShield);
      if (s.shield !== undefined) setShield(s.shield, true);
      if (s.boost !== undefined) setBoost(s.boost);
      if (s.progress !== undefined) setProgress(s.progress);
    },

    toast(text: string, kind?: ToastKind): void {
      const msg = String(text ?? '').trim();
      if (!msg) return;
      const k: ToastKind = kind === 'good' || kind === 'bad' ? kind : 'info';
      // Même message encore affiché : on le prolonge au lieu d'empiler un doublon.
      const last = toasts.lastElementChild as HTMLElement | null;
      if (last && !last.classList.contains('is-out') && last.dataset.text === msg && last.dataset.kind === k) {
        scheduleToast(last);
        play(last, BUMP, BUMP_OPTS);
        return;
      }
      const t = div(`toast toast--${k}`, msg);
      t.dataset.text = msg;
      t.dataset.kind = k;
      toasts.append(t);
      while (toasts.childElementCount > MAX_TOASTS) {
        const first = toasts.firstElementChild as HTMLElement | null;
        if (!first) break;
        dropToast(first);
      }
      scheduleToast(t);
    },
  };
}
