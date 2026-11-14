import { BASE_HEARTS, BASE_SHIELDS, MAX_SHIP_GUN_LEVEL } from '../core/hangar';
import { onLocale, t } from '../core/i18n/locale';
import { UI } from '../core/i18n/ui';
import { resolveShipGun, shipGunId } from '../core/shipGuns';
import type { AudioApi, BossHud, FlightHud, HudApi, PlatformHud, PowerUpKind, RadioId, ToastKind, WeaponId } from '../core/types';
import { WEAPONS, isWeaponId } from '../core/weapons';
import { clamp, div, el, icon, play } from './dom';
import { ICONS, ensureSvgDefs, powerIcon, powerLabel, shipGunIcon, weaponIcon } from './icons';
import { createRadio, type RadioInfo } from './radio';

// HUD en DOM, partagé par les modes 2D et 3D.
// Règle de performance : le DOM n'est touché que lorsqu'une valeur affichée change réellement
// (valeurs quantifiées, aucune allocation par image tant que rien ne change).

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/** Circonférence des anneaux de bonus (cercle r = 20). */
const RING_C = 2 * Math.PI * 20;
/** Temps restant des bonus : pas de 2 % (comme l'envoie le moteur). */
const POWER_STEPS = 50;
const HEAT_STEPS = 50;
const PROGRESS_STEPS = 400;
const BOSS_STEPS = 200;
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
const POWER_IN: Keyframe[] = [
  { transform: 'scale(0.6)', opacity: 0 },
  { transform: 'scale(1.18)', opacity: 1 },
  { transform: 'scale(1)', opacity: 1 },
];
const POWER_IN_OPTS: KeyframeAnimationOptions = { duration: 300, easing: 'ease-out' };
const FLASH: Keyframe[] = [{ opacity: 0.9 }, { opacity: 0 }];
const FLASH_OPTS: KeyframeAnimationOptions = { duration: 240, easing: 'ease-out' };

/** Anneau d'un bonus du HUD plateforme (vitesse, cadence : temps restant ; bouclier : anneau fixe). */
interface PowerSlot {
  readonly el: HTMLDivElement;
  readonly fg: SVGCircleElement;
  /** Temps restant affiché, 0..POWER_STEPS (-1 : à redessiner). */
  q: number;
  on: boolean;
  ending: boolean;
}

function createPowerSlot(kind: PowerUpKind): PowerSlot {
  const box = div(`hud-power hud-power--${kind}`);
  box.dataset.kind = kind;
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', powerLabel(kind));
  box.innerHTML =
    '<svg class="power-ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="20"/><circle class="ring-fg" cx="24" cy="24" r="20"/></svg>';
  const fg = box.querySelector('.ring-fg') as SVGCircleElement;
  // Bouclier : pointillés fixes (CSS) ; bonus à durée : l'anneau se vide avec le temps.
  if (kind !== 'shield') fg.style.strokeDasharray = String(RING_C);
  const ico = div('power-icon');
  ico.innerHTML = powerIcon(kind);
  box.append(ico);
  return { el: box, fg, q: -1, on: false, ending: false };
}

/**
 * Graduations de la jauge de chauffe : un tir (une rafale) de l'arme à froid, sans bonus de cadence ; au moins
 * 10 % (mitrailleur : graduations de 10 %).
 */
function heatStep(id: WeaponId): string {
  return `${(Math.max(0.1, WEAPONS[id].heatPerShot) * 100).toFixed(2)}%`;
}

/**
 * Graduations de la jauge d'énergie de la Comète : une seconde de tir continu (canon léger : 25 %, surchauffe
 * en 4 s ; mitrailleuse : 33 %, 3 s à tous ses niveaux). Un tir (6 %, 3 %) donnerait des traits illisibles.
 */
function shipHeatStep(level: number): string {
  const st = resolveShipGun(level, 60);
  const perSec = st.cooldownMs > 0 ? (st.heatPerShot * 1000) / st.cooldownMs : 1;
  return `${(clamp(perSec, 0.1, 1) * 100).toFixed(2)}%`;
}

/**
 * Jauge de chauffe (arme de Kaï en 2D) ou d'énergie (canon et turbo de la Comète en vol) : mêmes classes
 * internes, état quantifié.
 */
interface HeatGauge {
  readonly el: HTMLDivElement;
  readonly grad: HTMLDivElement;
  /** Icône de l'arme ou du canon (couleur selon la chauffe). */
  readonly ico: HTMLSpanElement;
  /** Chauffe affichée, 0..HEAT_STEPS (-1 : à redessiner). */
  q: number;
  level: string;
  over: boolean;
}

/**
 * `title` (jauge d'énergie du vol) : libellé au-dessus de la barre, suivi du repère du turbo (`.fl-turbo`,
 * allumé par la classe `is-boost` de la jauge).
 */
function createHeatGauge(cls: string, svg: string, title?: string): HeatGauge {
  const box = div(cls);
  box.dataset.level = 'cool';
  const track = div('heat-track');
  const grad = div('heat-grad');
  track.append(grad, div('heat-ticks'));
  const ico = icon(svg, 'ico ico-weapon');
  if (title) {
    const head = div('heat-head');
    head.append(el('span', 'fl-label', title), icon(ICONS.boost, 'fl-turbo'));
    const body = div('heat-body');
    body.append(head, track);
    box.append(ico, body, el('span', 'heat-label', t(UI.overheat)));
  } else {
    box.append(ico, track, el('span', 'heat-label', t(UI.overheat)));
  }
  return { el: box, grad, ico, q: -1, level: '', over: false };
}

function setGaugeHeat(g: HeatGauge, v: number): void {
  const q = Math.round(num01(v) * HEAT_STEPS);
  if (q === g.q) return;
  g.q = q;
  // Part vide à droite (découpe du dégradé, voir .heat-grad).
  g.grad.style.setProperty('--heat-off', String((HEAT_STEPS - q) / HEAT_STEPS));
  const level = q < HEAT_STEPS * 0.5 ? 'cool' : q < HEAT_STEPS * 0.8 ? 'warm' : 'hot';
  if (level !== g.level) {
    g.level = level;
    g.el.dataset.level = level;
  }
}

function setGaugeOver(g: HeatGauge, on: boolean): void {
  if (on === g.over) return;
  g.over = on;
  g.el.classList.toggle('is-over', on);
  if (on) play(g.el, SHAKE, SHAKE_OPTS);
}

/** État inverse de l'affichage : le prochain appel redessine tout. */
function resetGauge(g: HeatGauge): void {
  g.q = -1;
  g.level = '';
  g.over = true;
}

function intOr(v: number, fallback: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : fallback;
}

function num01(v: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/** HUD de la coquille : celui des modes, plus ce que seule l'interface pilote (radio en pause, état pour les tests). */
export interface ShellHud extends HudApi {
  /** Partie en pause ou non : la radio fige son écriture. */
  setPaused(on: boolean): void;
  radioInfo(): RadioInfo;
}

/**
 * `onPauseClick` est appelé par le bouton pause du HUD ; `audio` : bips de la radio ; `touchShown()` : commandes
 * tactiles affichées (la radio nomme sinon les touches du clavier).
 */
export function createHud(uiRoot: HTMLElement, onPauseClick: () => void, audio: AudioApi, touchShown: () => boolean): ShellHud {
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

  // Jauge de chauffe : l'icône montre l'arme équipée.
  const heatGauge = createHeatGauge('hud-heat', weaponIcon('laser'));
  const heat = heatGauge.el;

  // Bonus : vitesse et cadence (cumulables, chacun son anneau), puis bouclier. Rangée calée à droite :
  // seuls les bonus actifs prennent de la place.
  const powers = div('hud-powers');
  const speedSlot = createPowerSlot('speed');
  const rapidSlot = createPowerSlot('rapid');
  const shieldSlot = createPowerSlot('shield');
  powers.append(speedSlot.el, rapidSlot.el, shieldSlot.el);

  plat.append(stats, heat, powers);

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
  shieldBox.append(el('span', 'fl-label', t(UI.shield)), pips);
  flLeft.append(shieldBox);

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
  gatesEl.append(icon(ICONS.gate, 'ico ico-gate'), el('span', 'fl-gates-label', t(UI.gates)), gatesN, gatesT);
  flCenter.append(timer, gatesEl);

  // Cristaux ramassés pendant le vol (sous le bouclier).
  const flCryst = div('fl-crystals');
  const flCrystIco = icon(ICONS.crystal, 'ico ico-crystal');
  const flCrystN = el('b', 'hud-num', '0');
  flCryst.append(flCrystIco, flCrystN);

  // Énergie de la Comète, chauffée par le tir et le turbo (à gauche du bouton pause) : l'icône montre le canon
  // léger ou la mitrailleuse, le repère du turbo s'allume quand il pousse.
  const flEnergy = createHeatGauge('fl-energy', shipGunIcon(0), t(UI.energy));

  fl.append(prog, flLeft, flCryst, flCenter, flEnergy.el);

  // ---------------------------------------------------------------- Bouton pause (seul élément interactif)

  const pauseBtn = el('button', 'hud-pause');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', t(UI.pause));
  pauseBtn.innerHTML = ICONS.pause;
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (root.classList.contains('is-hidden')) return;
    onPauseClick();
  });
  // Appui avec un deuxième doigt (l'autre tient la croix) : voir enableSecondFingerTaps (dom.ts).

  // ---------------------------------------------------------------- Barre de boss (2D et vol), en bas au centre

  const bossEl = div('hud-boss');
  bossEl.setAttribute('role', 'img');
  const bossName = el('span', 'boss-name', '');
  const bossPhase = el('span', 'boss-phase', '');
  const bossHead = div('boss-head');
  bossHead.append(bossName, bossPhase);
  const bossTrack = div('boss-track');
  const bossFill = div('boss-fill');
  const bossMarks = div('boss-marks');
  const bossFlash = div('boss-flash');
  bossTrack.append(bossFill, bossMarks, bossFlash);
  bossEl.append(bossHead, bossTrack);

  root.append(plat, fl, bossEl, pauseBtn);

  // Messages : couche indépendante du HUD (utilisable aussi dans les menus).
  const toasts = div('toasts');
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');

  uiRoot.append(root, toasts);

  // Radio de LUMA : bulle dans le HUD (masquée avec lui), sous les stats ; les messages passent sous la bulle, un
  // seul à la fois (plus nombreux, ils descendraient jusqu'à Kaï).
  const radio = createRadio(
    root,
    audio,
    (h) => {
      toasts.classList.toggle('is-below-radio', h > 0);
      if (h > 0) {
        toasts.style.setProperty('--radio-h', `${h}px`);
        trimToasts();
      }
    },
    touchShown,
  );

  // ---------------------------------------------------------------- Plateforme : état affiché

  let pHearts = -1;
  let pMaxHearts = -1;
  let pLives = -1;
  let pCrystals = -1;
  let pCrystalsTotal = -1;
  let pWeapon: WeaponId | '' = '';

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
    // Cœurs achetés au hangar (4 ou 5) : pastille plus longue, la jauge de chauffe se range à droite (styles.css).
    plat.classList.toggle('has-extra-hearts', n > BASE_HEARTS);
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

  function setWeapon(v: WeaponId): void {
    const id: WeaponId = isWeaponId(v) ? v : 'laser';
    if (id === pWeapon) return;
    pWeapon = id;
    heatGauge.ico.innerHTML = weaponIcon(id);
    heat.dataset.weapon = id;
    heat.style.setProperty('--heat-step', heatStep(id));
  }

  /** Affiche ou masque un anneau de bonus (apparition animée). */
  function showPower(s: PowerSlot, on: boolean, animate: boolean): void {
    if (on === s.on) return;
    s.on = on;
    s.el.classList.toggle('is-on', on);
    if (on && animate) play(s.el, POWER_IN, POWER_IN_OPTS);
  }

  /** Bonus à durée (vitesse, cadence) : temps restant 0..1, 0 = inactif. */
  function setPowerLeft(s: PowerSlot, v: number, animate: boolean): void {
    const q = Math.round(num01(v) * POWER_STEPS);
    if (q === s.q) return;
    const prev = s.q;
    s.q = q;
    s.fg.style.strokeDashoffset = String(RING_C * (1 - q / POWER_STEPS));
    showPower(s, q > 0, animate);
    // Même bonus repris : durée remise au maximum, petit rebond.
    if (animate && prev > 0 && q > prev + 1) play(s.el, POP, POP_OPTS);
    const ending = q > 0 && q <= POWER_STEPS * 0.2;
    if (ending !== s.ending) {
      s.ending = ending;
      s.el.classList.toggle('is-ending', ending);
    }
  }

  /** État inverse de l'affichage : le prochain appel redessine tout. */
  function resetPowerSlot(s: PowerSlot): void {
    s.q = -1;
    s.on = true;
    s.ending = true;
  }

  function resetPlatform(): void {
    pHearts = -1;
    pMaxHearts = -1;
    pLives = -1;
    pCrystals = -1;
    pCrystalsTotal = -1;
    pWeapon = '';
    resetGauge(heatGauge);
    resetPowerSlot(speedSlot);
    resetPowerSlot(rapidSlot);
    resetPowerSlot(shieldSlot);
    setMaxHearts(3);
    setHearts(3, false);
    setLives(3, false);
    setCrystalsTotal(0);
    setCrystals(0, false);
    setWeapon('laser');
    setGaugeHeat(heatGauge, 0);
    setGaugeOver(heatGauge, false);
    setPowerLeft(speedSlot, 0, false);
    setPowerLeft(rapidSlot, 0, false);
    showPower(shieldSlot, false, false);
    stats.classList.remove('is-critical');
  }

  // ---------------------------------------------------------------- Vol : état affiché

  let fDs = -2;
  let fDanger = false;
  let fGates = -1;
  let fGatesTotal = -1;
  let fShield = -1;
  let fMaxShield = -1;
  let fBoosting = false;
  let fProgQ = -1;
  let fGun = -1;
  let fCrystals = -1;

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
    // Bouclier renforcé (4 ou 5) : pastilles plus serrées sur les petits écrans (styles.css).
    flLeft.classList.toggle('has-extra-shields', n > BASE_SHIELDS);
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

  /** Turbo en marche : repère du turbo allumé sur la jauge d'énergie. */
  function setBoosting(on: boolean): void {
    if (on === fBoosting) return;
    fBoosting = on;
    flEnergy.el.classList.toggle('is-boost', on);
  }

  function setProgress(v: number): void {
    const q = Math.round(num01(v) * PROGRESS_STEPS);
    if (q === fProgQ) return;
    fProgQ = q;
    const r = q / PROGRESS_STEPS;
    progFill.style.transform = `scaleX(${r})`;
    progDotWrap.style.transform = `translate3d(${r * 100}%,0,0)`;
  }

  /** Canon de la Comète : icône (canon léger ou mitrailleuse) et graduations de la jauge d'énergie. */
  function setGunLevel(v: number): void {
    const n = intOr(v, 0, 0, MAX_SHIP_GUN_LEVEL);
    if (n === fGun) return;
    fGun = n;
    flEnergy.ico.innerHTML = shipGunIcon(n);
    flEnergy.el.dataset.gun = shipGunId(n);
    flEnergy.el.style.setProperty('--heat-step', shipHeatStep(n));
  }

  function setFlightCrystals(v: number, animate: boolean): void {
    const n = intOr(v, 0, 0, 99999);
    if (n === fCrystals) return;
    const prev = fCrystals;
    fCrystals = n;
    flCrystN.textContent = String(n);
    if (animate && prev >= 0 && n > prev) play(flCrystIco, POP, POP_OPTS);
  }

  function resetFlight(): void {
    fDs = -2;
    fGates = -1;
    fGatesTotal = -1;
    fShield = -1;
    fMaxShield = -1;
    fBoosting = true;
    fProgQ = -1;
    fGun = -1;
    fCrystals = -1;
    resetGauge(flEnergy);
    setTime(Number.NaN);
    setGatesTotal(0);
    setGates(0, false);
    setMaxShield(3);
    setShield(3, false);
    setBoosting(false);
    setProgress(0);
    setGunLevel(0);
    setGaugeHeat(flEnergy, 0);
    setGaugeOver(flEnergy, false);
    setFlightCrystals(0, false);
    flLeft.classList.remove('is-critical');
  }

  // ---------------------------------------------------------------- Boss : état affiché

  let bOn = false;
  let bName = '';
  let bLifeQ = -1;
  let bPhase = -1;
  let bPhases = -1;
  let bSteps = -1;

  function setBoss(s: BossHud | null): void {
    if (!s) {
      if (!bOn) return;
      bOn = false;
      bossEl.classList.remove('is-on');
      return;
    }
    const shown = bOn;
    if (!bOn) {
      bOn = true;
      bossEl.classList.add('is-on');
    }
    const name = String(s.name ?? '');
    if (name !== bName) {
      bName = name;
      bossName.textContent = name;
    }
    const phases = intOr(s.phases, 1, 1, 9);
    const steps = intOr(s.steps ?? 0, 0, 0, 24);
    if (phases !== bPhases || steps !== bSteps) {
      bPhases = phases;
      bSteps = steps;
      bossMarks.textContent = '';
      // Repère de changement de phase : la barre est partagée en parts égales ; boss en touches : un cran fin par
      // touche (sauf où tombe un repère de phase).
      for (let k = 1; k < phases; k++) {
        const m = div('boss-mark');
        m.style.left = `${(k * 100) / phases}%`;
        bossMarks.append(m);
      }
      for (let k = 1; k < steps; k++) {
        if ((k * phases) % steps === 0) continue;
        const m = div('boss-mark is-step');
        m.style.left = `${(k * 100) / steps}%`;
        bossMarks.append(m);
      }
      bPhase = -1;
    }
    const phase = intOr(s.phase, 1, 1, phases);
    if (phase !== bPhase) {
      const prev = bPhase;
      bPhase = phase;
      bossPhase.textContent = phases > 1 ? `Phase ${phase}/${phases}` : '';
      bossEl.dataset.phase = String(phase);
      if (shown && prev > 0 && phase > prev) play(bossEl, BUMP, BUMP_OPTS);
    }
    const q = Math.round(num01(s.life) * BOSS_STEPS);
    if (q !== bLifeQ) {
      const prev = bLifeQ;
      bLifeQ = q;
      bossFill.style.transform = `scaleX(${q / BOSS_STEPS})`;
      bossEl.setAttribute('aria-label', `${name} : ${Math.round((q * 100) / BOSS_STEPS)} %`);
      if (shown && prev >= 0 && q < prev) play(bossFlash, FLASH, FLASH_OPTS);
    }
  }

  function resetBoss(): void {
    bOn = false;
    bName = '';
    bLifeQ = -1;
    bPhase = -1;
    bPhases = -1;
    bSteps = -1;
    bossEl.classList.remove('is-on');
    bossName.textContent = '';
    bossPhase.textContent = '';
    bossMarks.textContent = '';
    delete bossEl.dataset.phase;
  }

  // ---------------------------------------------------------------- Messages

  const toastTimers = new Map<HTMLElement, number>();

  function dropToast(t: HTMLElement): void {
    const id = toastTimers.get(t);
    if (id !== undefined) window.clearTimeout(id);
    toastTimers.delete(t);
    t.remove();
  }

  /** Au plus MAX_TOASTS messages (les plus anciens partent) ; un seul sous la bulle de la radio. */
  function trimToasts(): void {
    const max = toasts.classList.contains('is-below-radio') ? 1 : MAX_TOASTS;
    while (toasts.childElementCount > max) {
      const first = toasts.firstElementChild as HTMLElement | null;
      if (!first) break;
      dropToast(first);
    }
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

  onLocale(() => {
    root.querySelectorAll('.heat-label').forEach((n) => {
      n.textContent = t(UI.overheat);
    });
    const energy = root.querySelector('.fl-energy .fl-label');
    if (energy) energy.textContent = t(UI.energy);
    const shield = root.querySelector('.fl-shield .fl-label');
    if (shield) shield.textContent = t(UI.shield);
    const gates = root.querySelector('.fl-gates-label');
    if (gates) gates.textContent = t(UI.gates);
    pauseBtn.setAttribute('aria-label', t(UI.pause));
    for (const slot of [speedSlot, rapidSlot, shieldSlot]) {
      slot.el.setAttribute('aria-label', powerLabel(slot.el.dataset.kind as 'speed' | 'rapid' | 'shield'));
    }
  });

  return {
    showPlatform(): void {
      show('platform');
      radio.prepare();
    },

    showFlight(): void {
      show('flight');
    },

    hide(): void {
      mode = 'none';
      root.classList.add('is-hidden');
      delete root.dataset.mode;
      clearToasts();
      radio.clear();
      // Remise à zéro pendant que le HUD est masqué : l'étape suivante part d'un état propre,
      // et les valeurs envoyées avant le prochain show*() sont conservées.
      resetPlatform();
      resetFlight();
      resetBoss();
    },

    updatePlatform(s: Partial<PlatformHud>): void {
      if (!s) return;
      if (s.maxHearts !== undefined) setMaxHearts(s.maxHearts);
      if (s.hearts !== undefined) setHearts(s.hearts, true);
      if (s.lives !== undefined) setLives(s.lives, true);
      if (s.crystalsTotal !== undefined) setCrystalsTotal(s.crystalsTotal);
      if (s.crystals !== undefined) setCrystals(s.crystals, true);
      if (s.weapon !== undefined) setWeapon(s.weapon);
      if (s.heat !== undefined) setGaugeHeat(heatGauge, s.heat);
      if (s.overheated !== undefined) setGaugeOver(heatGauge, !!s.overheated);
      if (s.speedLeft !== undefined) setPowerLeft(speedSlot, s.speedLeft, true);
      if (s.rapidLeft !== undefined) setPowerLeft(rapidSlot, s.rapidLeft, true);
      if (s.shield !== undefined) showPower(shieldSlot, !!s.shield, true);
    },

    updateFlight(s: Partial<FlightHud>): void {
      if (!s) return;
      if (s.timeLeft !== undefined) setTime(s.timeLeft);
      if (s.gatesTotal !== undefined) setGatesTotal(s.gatesTotal);
      if (s.gates !== undefined) setGates(s.gates, true);
      if (s.maxShield !== undefined) setMaxShield(s.maxShield);
      if (s.shield !== undefined) setShield(s.shield, true);
      if (s.progress !== undefined) setProgress(s.progress);
      if (s.gunLevel !== undefined) setGunLevel(s.gunLevel);
      if (s.heat !== undefined) setGaugeHeat(flEnergy, s.heat);
      if (s.overheated !== undefined) setGaugeOver(flEnergy, !!s.overheated);
      if (s.boosting !== undefined) setBoosting(!!s.boosting);
      if (s.crystals !== undefined) setFlightCrystals(s.crystals, true);
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
      trimToasts();
      scheduleToast(t);
    },

    radio(id: RadioId): void {
      radio.say(id);
    },

    updateBoss(s: BossHud | null): void {
      setBoss(s);
    },

    setPaused(on: boolean): void {
      radio.setPaused(on);
    },

    radioInfo: () => radio.info(),
  };
}
