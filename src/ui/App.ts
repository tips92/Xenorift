// Application : écrans (accueil, choix du niveau, options, pause, résultats) et enchaînement des étapes.
// La signature exportée ne doit pas changer.

import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/exo-2/400.css';
import '@fontsource/exo-2/600.css';
import { App as CapApp } from '@capacitor/app';
import { createAudio } from '../audio';
import { getSave, getSettings, recordResult, updateSettings } from '../core/save';
import { STAGES, getStage, nextStage } from '../core/stages';
import type {
  ModeHandle,
  ModeHooks,
  Settings,
  StageDef,
  StageKind,
  StageResult,
  StartMode,
} from '../core/types';
import { createInput } from '../input';
import { createSpaceBackground } from './background';
import { deferred, delay, div, enableSecondFingerTaps, nextFrame } from './dom';
import { createHud } from './hud';
import { ensureSvgDefs } from './icons';
import { FADE_MS, createFader, createRotatePrompt } from './overlays';
import type { Screen } from './screens/common';
import { createIntroScreen } from './screens/intro';
import { createOptionsScreen } from './screens/options';
import { createEndScreen, createErrorScreen, createFailScreen } from './screens/outcome';
import { createPauseOverlay, type PauseOverlay } from './screens/pause';
import { createResultsScreen } from './screens/results';
import { createLevelSelect } from './screens/select';
import { createTitleScreen } from './screens/title';
import { createSafeAudio, createSafeInput, type UiCtx } from './services';

/** Durée d'affichage de la carte d'intro avant de lancer l'étape. */
const INTRO_MS = 2200;

type Phase = 'menu' | 'intro' | 'playing';
type Outcome = { ok: true; result: StageResult } | { ok: false; reason: string };

interface Run {
  readonly stage: StageDef;
  handle: ModeHandle | null;
  /** onComplete / onFail reçu, ou étape abandonnée. */
  ended: boolean;
  paused: boolean;
}

// Modes chargés à la demande (Phaser et Three.js ne ralentissent pas l'affichage de l'accueil).
const modeCache: Partial<Record<StageKind, Promise<StartMode>>> = {};

function loadMode(kind: StageKind): Promise<StartMode> {
  const cached = modeCache[kind];
  if (cached) return cached;
  const p: Promise<StartMode> =
    kind === 'platform'
      ? import('../game2d').then((m) => m.startPlatformer)
      : import('../game3d').then((m) => m.startFlight);
  modeCache[kind] = p;
  // Échec de chargement : on pourra réessayer.
  p.catch(() => {
    if (modeCache[kind] === p) delete modeCache[kind];
  });
  return p;
}

function layer(id: string): HTMLElement {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    document.body.append(node);
  }
  return node;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  try {
    return String(err);
  } catch {
    return 'Erreur inconnue';
  }
}

function sanitizeResult(res: StageResult, stage: StageDef): StageResult {
  const raw = (res ?? {}) as Partial<StageResult>;
  const score = Number.isFinite(raw.score) ? Math.max(0, Math.round(raw.score as number)) : 0;
  const s = Number(raw.stars);
  const stars: 1 | 2 | 3 = s >= 3 ? 3 : s >= 2 ? 2 : 1;
  const timeMs = Number.isFinite(raw.timeMs) ? Math.max(0, raw.timeMs as number) : 0;
  return { ...raw, stageId: stage.id, score, stars, timeMs };
}

const noop = (): void => undefined;

let booted = false;

export function startApp(): void {
  if (booted) return;
  booted = true;

  const gameRoot = layer('game-root');
  const touchRoot = layer('touch-root');
  const uiRoot = layer('ui-root');
  enableSecondFingerTaps(uiRoot);
  ensureSvgDefs();

  // ---------------------------------------------------------------- Services

  const audio = createSafeAudio(createAudio);
  const input = createSafeInput(() => createInput(touchRoot));
  /** Réglages vivants : le même objet est passé aux modes et mis à jour à chaque changement. */
  const live: Settings = { ...getSettings() };

  // ---------------------------------------------------------------- Couches de l'interface

  const bg = createSpaceBackground(uiRoot);
  const hud = createHud(uiRoot, () => pauseGame());
  const screensLayer = div('screens');
  uiRoot.append(screensLayer);
  const fader = createFader(uiRoot, true);
  const rotate = createRotatePrompt(uiRoot);

  function setSettings(patch: Partial<Settings>): void {
    const next = updateSettings(patch);
    Object.assign(live, next);
    if (patch.music !== undefined) {
      audio.setMusicEnabled(next.music);
      if (next.music && phase === 'menu') audio.music('menu');
    }
    if (patch.sfx !== undefined) audio.setSfxEnabled(next.sfx);
    if (patch.haptics !== undefined) audio.setHapticsEnabled(next.haptics);
    if (patch.tilt !== undefined) input.setTiltEnabled(next.tilt);
  }

  const ctx: UiCtx = { audio, input, hud, settings: live, setSettings };

  // ---------------------------------------------------------------- État

  let phase: Phase = 'menu';
  let screen: Screen | null = null;
  let run: Run | null = null;
  let pause: PauseOverlay | null = null;
  let introSkip: (() => void) | null = null;
  let portrait = false;
  let backgrounded = false;
  let flowId = 0;
  let navLock = false;
  let lastBack = -1;
  /** Nombre de passages en arrière-plan (une étape lancée après un passage démarre en pause). */
  let bgCount = 0;

  // ---------------------------------------------------------------- Écrans

  function setScreen(next: Screen | null, instant: boolean): void {
    const prev = screen;
    screen = next;
    if (prev) {
      try {
        prev.dispose?.();
      } catch (err) {
        console.error('[ui] dispose', err);
      }
      const node = prev.el;
      if (instant) {
        node.remove();
      } else {
        node.classList.remove('is-active');
        node.classList.add('is-leaving');
        window.setTimeout(() => node.remove(), FADE_MS + 60);
      }
    }
    if (next) {
      screensLayer.append(next.el);
      // Lecture forcée : la transition part bien de l'état initial.
      if (!instant) void next.el.offsetWidth;
      next.el.classList.add('is-active');
    }
  }

  /**
   * Lance un enchaînement asynchrone. Un nouvel enchaînement annule le précédent (flowId),
   * qui s'arrête à son prochain `await`. Sans `force`, ignoré si un autre est en cours.
   */
  function navigate(task: (flow: number) => Promise<void>, force = false): boolean {
    if (navLock && !force) return false;
    const flow = ++flowId;
    navLock = true;
    task(flow)
      .catch((err: unknown) => {
        console.error('[ui] enchaînement interrompu', err);
        if (flow === flowId) showCrash(err);
      })
      .finally(() => {
        if (flow === flowId) navLock = false;
      });
    return true;
  }

  /** Filet de sécurité : jamais de page blanche. */
  function showCrash(err: unknown): void {
    try {
      teardownRun();
      hud.hide();
      input.setLayout('none');
      phase = 'menu';
      bg.setVisible(true);
      setScreen(createErrorScreen(ctx, null, errorMessage(err), { retry: null, menu: () => goTitle(true) }), true);
      void fader.clear();
    } catch (e) {
      console.error('[ui] écran d’erreur impossible', e);
    }
  }

  function continueStage(): StageDef {
    const idx = Math.max(0, Math.min(getSave().unlocked, STAGES.length - 1));
    return STAGES[idx];
  }

  function playSub(): string {
    const save = getSave();
    const fresh = save.unlocked <= 0 && Object.keys(save.best).length === 0;
    if (fresh) return 'Nouvelle aventure';
    return `Continuer · ${continueStage().title}`;
  }

  function makeTitle(): Screen {
    return createTitleScreen(ctx, {
      playSub: playSub(),
      play: () => startStage(continueStage(), true),
      levels: () => goSelect(),
      options: () => goOptions(),
    });
  }

  function makeSelect(): Screen {
    return createLevelSelect(ctx, {
      back: () => goTitle(),
      start: (stage) => startStage(stage, true),
    });
  }

  function makeOptions(): Screen {
    return createOptionsScreen(ctx, { back: () => goTitle() });
  }

  /** Affiche un écran de menu : fondu enchaîné entre menus, fondu au noir depuis le jeu. */
  function showMenu(make: () => Screen, force = false): void {
    navigate(async (flow) => {
      const viaBlack = phase !== 'menu' || run !== null || fader.black;
      if (viaBlack) {
        abandonRun();
        await fader.toBlack();
        if (flow !== flowId) return;
        teardownRun();
        hud.hide();
        input.setLayout('none');
        phase = 'menu';
        bg.setVisible(true);
        const s = make();
        setScreen(s, true);
        audio.music('menu');
        await fader.clear();
        if (flow !== flowId) return;
        s.shown?.();
      } else {
        phase = 'menu';
        bg.setVisible(true);
        const s = make();
        setScreen(s, false);
        audio.music('menu');
        await delay(FADE_MS);
        if (flow !== flowId) return;
        s.shown?.();
      }
    }, force);
  }

  function goTitle(force = false): void {
    showMenu(makeTitle, force);
  }

  function goSelect(): void {
    showMenu(makeSelect);
  }

  function goOptions(): void {
    showMenu(makeOptions);
  }

  function showEnd(): void {
    navigate(async (flow) => {
      teardownRun();
      phase = 'menu';
      bg.setVisible(true);
      const save = getSave();
      let total = 0;
      let stars = 0;
      for (const s of STAGES) {
        const b = save.best[s.id];
        if (!b) continue;
        total += b.score;
        stars += b.stars;
      }
      const s = createEndScreen(ctx, { total, stars, maxStars: STAGES.length * 3 }, { menu: () => goTitle() });
      setScreen(s, false);
      audio.music('menu');
      await delay(FADE_MS);
      if (flow !== flowId) return;
      audio.sfx('win');
      s.shown?.();
    });
  }

  function goNext(stage: StageDef): void {
    const nxt = nextStage(stage);
    if (nxt) startStage(nxt, true);
    else showEnd();
  }

  // ---------------------------------------------------------------- Étapes

  function isPlayable(): boolean {
    // `backgrounded` couvre la pause Capacitor même si la page reste « visible » pour le navigateur.
    return !portrait && !backgrounded && !document.hidden;
  }

  /** Attend que l'écran soit en paysage et l'application au premier plan. */
  async function waitPlayable(flow: number): Promise<void> {
    while (!isPlayable() && flow === flowId) await delay(200);
  }

  function startStage(stage: StageDef, withIntro: boolean, force = false): void {
    navigate(async (flow) => {
      const bg0 = bgCount;
      // Chargement du mode en parallèle du fondu et de l'intro.
      const modeP = loadMode(stage.kind);
      modeP.catch(noop);

      abandonRun();
      await fader.toBlack();
      if (flow !== flowId) return;
      teardownRun();
      hud.hide();
      input.setLayout('none');

      if (withIntro) {
        phase = 'intro';
        const skip = deferred();
        introSkip = skip.resolve;
        setScreen(createIntroScreen(ctx, stage, skip.resolve), true);
        bg.setVisible(true);
        await fader.clear();
        if (flow !== flowId) return;
        await Promise.race([delay(INTRO_MS), skip.promise]);
        if (flow !== flowId) return;
        introSkip = null;
        await waitPlayable(flow);
        if (flow !== flowId) return;
        await fader.toBlack();
        if (flow !== flowId) return;
      }

      let start: StartMode;
      try {
        start = await modeP;
      } catch (err) {
        if (flow !== flowId) return;
        console.error('[ui] chargement du mode impossible', err);
        showStartError(stage, err);
        await fader.clear();
        return;
      }
      if (flow !== flowId) return;
      await waitPlayable(flow);
      if (flow !== flowId) return;

      setScreen(null, true);
      bg.setVisible(false);
      // Appli passée en arrière-plan pendant l'intro ou un fondu : on démarre en pause (REPRENDRE).
      if (!launch(stage, start, bgCount !== bg0)) {
        await fader.clear();
        return;
      }
      // Laisse le mode afficher ses premières images avant de dévoiler.
      await nextFrame();
      await nextFrame();
      await delay(90);
      if (flow !== flowId) return;
      await fader.clear();
    }, force);
  }

  function launch(stage: StageDef, start: StartMode, startPaused: boolean): boolean {
    const r: Run = { stage, handle: null, ended: false, paused: false };
    run = r;
    phase = 'playing';
    if (stage.kind === 'platform') hud.showPlatform();
    else hud.showFlight();
    input.setLayout(stage.kind);
    input.clearPresses();

    const hooks: ModeHooks = {
      hud,
      input,
      audio,
      settings: live,
      onComplete: (result) => endRun(r, { ok: true, result }),
      onFail: (reason) => endRun(r, { ok: false, reason: typeof reason === 'string' ? reason : '' }),
    };

    try {
      r.handle = start(gameRoot, stage, hooks);
    } catch (err) {
      console.error('[ui] démarrage de l’étape impossible', err);
      r.ended = true;
      if (run === r) run = null;
      hud.hide();
      input.setLayout('none');
      showStartError(stage, err);
      return false;
    }
    // Lancé en portrait ou en arrière-plan (ou juste après) : on démarre directement en pause.
    if (startPaused || !isPlayable()) pauseGame();
    return true;
  }

  function showStartError(stage: StageDef, err: unknown): void {
    phase = 'menu';
    bg.setVisible(true);
    audio.music('menu');
    setScreen(
      createErrorScreen(ctx, stage, errorMessage(err), {
        retry: () => startStage(stage, false),
        menu: () => goTitle(),
      }),
      true,
    );
  }

  /** onComplete / onFail d'un mode : protégé contre les doubles appels et les étapes périmées. */
  function endRun(r: Run, outcome: Outcome): void {
    if (r !== run || r.ended) return;
    r.ended = true;

    let result: StageResult | null = null;
    let newRecord = false;
    let best = 0;
    if (outcome.ok) {
      result = sanitizeResult(outcome.result, r.stage);
      const prev = getSave().best[r.stage.id];
      newRecord = !!prev && result.score > prev.score;
      try {
        recordResult(r.stage.index, result);
      } catch (err) {
        console.error('[ui] sauvegarde impossible', err);
      }
      best = getSave().best[r.stage.id]?.score ?? result.score;
    }
    input.setLayout('none');

    // Différé : le mode peut appeler onComplete depuis sa propre boucle.
    window.setTimeout(() => {
      // Étape déjà abandonnée entre-temps (Quitter, Recommencer…) : rien à afficher.
      if (run !== r) return;
      navigate(async (flow) => {
        closePause(false);
        await fader.toBlack();
        if (flow !== flowId) return;
        if (run === r) teardownRun();
        hud.hide();
        phase = 'menu';
        bg.setVisible(true);
        audio.music(null);
        let s: Screen;
        if (result) {
          s = createResultsScreen(
            ctx,
            { stage: r.stage, result, newRecord, best },
            {
              next: () => goNext(r.stage),
              replay: () => startStage(r.stage, false),
              menu: () => goTitle(),
            },
          );
        } else {
          s = createFailScreen(ctx, r.stage, outcome.ok ? '' : outcome.reason, {
            retry: () => startStage(r.stage, false),
            menu: () => goTitle(),
          });
        }
        setScreen(s, true);
        await fader.clear();
        if (flow !== flowId) return;
        audio.sfx(result ? 'win' : 'lose');
        audio.haptic(result ? [30, 60, 30] : 160);
        s.shown?.();
      }, true);
    }, 0);
  }

  /** L'étape en cours va être quittée : plus de pause / reprise / fin acceptée pendant le fondu. */
  function abandonRun(): void {
    if (!run) return;
    run.ended = true;
    input.setLayout('none');
  }

  /** Arrête et libère l'étape en cours (s'il y en a une). */
  function teardownRun(): void {
    const r = run;
    run = null;
    closePause(true);
    if (!r) return;
    r.ended = true;
    const h = r.handle;
    r.handle = null;
    if (!h) return;
    try {
      h.destroy();
    } catch (err) {
      console.error('[ui] destroy du mode', err);
    }
  }

  // ---------------------------------------------------------------- Pause

  function pauseGame(): void {
    const r = run;
    if (phase !== 'playing' || !r || r.ended || r.paused) return;
    r.paused = true;
    try {
      r.handle?.pause();
    } catch (err) {
      console.error('[ui] pause du mode', err);
    }
    input.setLayout('none');
    closePause(true);
    const p = createPauseOverlay(ctx, r.stage, {
      resume: () => resumeGame(),
      restart: () => startStage(r.stage, false, true),
      quit: () => goTitle(true),
    });
    pause = p;
    uiRoot.append(p.el);
    p.open();
    audio.sfx('click', { pitch: 0.8 });
  }

  function closePause(instant: boolean): void {
    const p = pause;
    pause = null;
    if (p) p.close(instant);
  }

  function resumeGame(): void {
    const r = run;
    if (phase !== 'playing' || !r || r.ended || !r.paused) return;
    // En portrait ou en arrière-plan, la partie reste en pause.
    if (!isPlayable()) return;
    r.paused = false;
    closePause(false);
    input.setLayout(r.stage.kind);
    input.clearPresses();
    try {
      r.handle?.resume();
    } catch (err) {
      console.error('[ui] reprise du mode', err);
    }
  }

  // ---------------------------------------------------------------- Retour (Android, Échap)

  function exitApp(): void {
    try {
      CapApp.exitApp().catch(noop);
    } catch {
      // Version web : rien à fermer.
    }
  }

  function handleBack(source: 'android' | 'key'): void {
    // Un même appui peut arriver deux fois (Échap : module d'entrées + clavier global) : un seul traitement.
    const now = performance.now();
    if (now - lastBack < 120) return;
    // Pendant un fondu au noir, l'écran change déjà : retour ignoré.
    if (fader.busy) return;
    lastBack = now;
    if (phase === 'playing') {
      const r = run;
      if (!r || r.ended) return;
      if (!r.paused) {
        pauseGame();
        return;
      }
      if (pause && pause.back()) return;
      resumeGame();
      return;
    }
    if (phase === 'intro') {
      goTitle(true);
      return;
    }
    if (navLock) return;
    if (screen && screen.back && screen.back()) return;
    if (source === 'android') exitApp();
  }

  // ---------------------------------------------------------------- Orientation et arrière-plan

  /** Appareil tactile (téléphone / tablette) : seul cas où « Tourne ton téléphone » a un sens. */
  function isTouchDevice(): boolean {
    try {
      return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return 'ontouchstart' in window;
    }
  }

  function checkOrientation(): void {
    // Sur PC (souris), une fenêtre étroite n'est pas un téléphone en portrait : pas d'invite.
    const p = window.innerHeight > window.innerWidth && isTouchDevice();
    if (p === portrait) return;
    portrait = p;
    rotate.setVisible(p);
    if (p) pauseGame();
  }

  function onBackground(): void {
    if (backgrounded) return;
    backgrounded = true;
    bgCount++;
    // Son coupé d'abord : le clic de la pause ne doit pas ressortir au retour.
    audio.suspend();
    pauseGame();
  }

  function onForeground(): void {
    if (!backgrounded) return;
    backgrounded = false;
    audio.resume();
    checkOrientation();
  }

  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', () => {
    checkOrientation();
    // Les dimensions ne sont pas toujours à jour juste après la rotation.
    window.setTimeout(checkOrientation, 350);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onBackground();
    else onForeground();
  });

  const capHandlers = {
    backButton: () => handleBack('android'),
    pause: onBackground,
    resume: onForeground,
  };
  try {
    CapApp.addListener('backButton', capHandlers.backButton).catch(noop);
    CapApp.addListener('pause', capHandlers.pause).catch(noop);
    CapApp.addListener('resume', capHandlers.resume).catch(noop);
  } catch {
    // Capacitor absent (navigateur) : visibilitychange et le clavier suffisent.
  }

  input.onPause(() => {
    if (phase === 'playing') handleBack('key');
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      introSkip?.();
      return;
    }
    if (e.key === 'Escape' || (e.key === 'Backspace' && phase !== 'playing')) {
      e.preventDefault();
      handleBack('key');
    }
  });

  // ---------------------------------------------------------------- Déblocage audio (premier geste)

  // Sur écran tactile, pointerdown n'est pas une « activation utilisateur » : on attend
  // pointerup / touchend / click (ou une touche) avant de retirer les écouteurs.
  const gestureEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  let gestureDone = false;

  function onGesture(e: Event): void {
    audio.unlock();
    if (gestureDone || e.type === 'pointerdown') return;
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return;
    gestureDone = true;
    for (const t of gestureEvents) window.removeEventListener(t, onGesture, true);
    if (phase === 'menu') audio.music('menu');
    // Inclinaison mémorisée : iOS redemande l'autorisation, depuis ce geste.
    if (live.tilt) {
      void input.requestTiltPermission().then((ok) => {
        if (ok) return;
        setSettings({ tilt: false });
        hud.toast('Inclinaison désactivée : autorisation refusée', 'bad');
      });
    }
  }

  for (const t of gestureEvents) window.addEventListener(t, onGesture, { capture: true, passive: true });

  // ---------------------------------------------------------------- Démarrage

  const params = new URLSearchParams(window.location.search);
  if (params.get('unlock') === '1' && !live.unlockAll) setSettings({ unlockAll: true });

  audio.setMusicEnabled(live.music);
  audio.setSfxEnabled(live.sfx);
  audio.setHapticsEnabled(live.haptics);
  input.setTiltEnabled(live.tilt);
  input.setLayout('none');
  hud.hide();

  checkOrientation();
  backgrounded = document.hidden;

  const devId = params.get('stage');
  const devStage = devId ? getStage(devId) : undefined;
  if (devStage) {
    // Paramètre de développement : lancement direct de l'étape.
    startStage(devStage, false);
  } else {
    navigate(async (flow) => {
      phase = 'menu';
      bg.setVisible(true);
      const s = makeTitle();
      setScreen(s, true);
      audio.music('menu');
      // Polices prêtes (ou délai max) avant de dévoiler l'accueil.
      try {
        await Promise.race([document.fonts.ready.then(noop), delay(700)]);
      } catch {
        // API absente : on continue.
      }
      if (flow !== flowId) return;
      await fader.clear();
      if (flow !== flowId) return;
      s.shown?.();
      if (devId) hud.toast(`Étape inconnue : ${devId}`, 'bad');
    });
  }

  if (import.meta.env.DEV) {
    // Accès de test (scénarios Playwright) : mêmes fonctions que les écouteurs Capacitor.
    (window as unknown as Record<string, unknown>).__xrShell = {
      cap: (name: keyof typeof capHandlers) => capHandlers[name](),
      audio,
      info: () => ({
        phase,
        run: run ? { stage: run.stage.id, paused: run.paused, ended: run.ended } : null,
        backgrounded,
        navLock,
        fading: fader.busy,
        input: { ...input.state },
      }),
    };
  }

  // Préchargement des modes une fois l'accueil affiché.
  window.setTimeout(() => {
    loadMode('platform').catch(noop);
    loadMode('flight').catch(noop);
  }, 1500);
}
