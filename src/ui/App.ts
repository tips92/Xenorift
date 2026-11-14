// Application : écrans (accueil, choix du niveau, options, pause, résultats, cinématiques) et enchaînement des
// étapes. La signature exportée ne doit pas changer.

import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/exo-2/400.css';
import '@fontsource/exo-2/600.css';
import { App as CapApp } from '@capacitor/app';
import { createAudio } from '../audio';
import {
  addCrystals,
  clearRift,
  getCrystals,
  getSave,
  getSessionWeapon,
  getSettings,
  isCleared,
  isFresh,
  isUnlocked,
  markSeen,
  nextToPlay,
  playLoadout,
  recordResult,
  setSessionWeapon,
  updateSettings,
  type RecordInfo,
} from '../core/save';
import { isRiftId, riftById } from '../core/rifts';
import { STAGES, getStage } from '../core/stages';
import type {
  ModeHandle,
  ModeHooks,
  PlayLoadout,
  RiftTrip,
  Settings,
  StageDef,
  StageKind,
  StageResult,
  StartAt,
  StartMode,
  WeaponId,
} from '../core/types';
import { ensureKaiSprites } from '../game2d/art/kaiPng';
import { isWeaponId } from '../core/weapons';
import { createInput } from '../input';
import type { CutscenePlayer } from '../story';
import { createSpaceBackground } from './background';
import { deferred, delay, div, enableSecondFingerTaps, nextFrame } from './dom';
import {
  cutsceneAfter,
  cutscenesBefore,
  playSubtitle,
  seenCutscenes,
  stageAfter,
  storyMusicLevel,
  type StoryPlay,
} from './flow';
import { createHud } from './hud';
import { ensureSvgDefs } from './icons';
import { FADE_MS, createFader, createRotatePrompt } from './overlays';
import type { Screen } from './screens/common';
import { createCutsceneScreen, type StoryModule } from './screens/cutscene';
import { createHangarScreen } from './screens/hangar';
import { createIntroScreen } from './screens/intro';
import { createOptionsScreen } from './screens/options';
import { createEndScreen, createErrorScreen, createFailScreen } from './screens/outcome';
import { createRiftDownScreen } from './screens/rift';
import { createPauseOverlay, type PauseOverlay } from './screens/pause';
import { createResultsScreen, type ResultsData } from './screens/results';
import { createLevelSelect } from './screens/select';
import { createTitleScreen } from './screens/title';
import { createSafeAudio, createSafeInput, type UiCtx } from './services';

/** Durée d'affichage de la carte d'intro avant de lancer l'étape. */
const INTRO_MS = 2200;

/** 'story' : une cinématique (avant la carte d'intro, avant les résultats, ou revue depuis les Options). */
type Phase = 'menu' | 'intro' | 'story' | 'playing';
/** Échec : `retry` = point de reprise rendu par le mode (« Réessayer le combat »), sinon null. */
type Outcome = { ok: true; result: StageResult } | { ok: false; reason: string; retry: StartAt | null };

interface Run {
  readonly stage: StageDef;
  /** Équipement effectif passé au mode (ModeHooks.loadout). */
  readonly loadout: Readonly<PlayLoadout>;
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

// Module des cinématiques, chargé à la demande comme les modes (préchargé après l'accueil).
let storyCache: Promise<StoryModule> | null = null;

function loadStory(): Promise<StoryModule> {
  if (storyCache) return storyCache;
  const p: Promise<StoryModule> = import('../story');
  storyCache = p;
  p.catch(() => {
    if (storyCache === p) storyCache = null;
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

/** Point de reprise passé à onFail par un mode : gardé tel quel (instantané opaque) s'il a la forme attendue. */
function retryPoint(v: unknown): StartAt | null {
  return v !== null && typeof v === 'object' && (v as StartAt).at === 'boss' ? (v as StartAt) : null;
}

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
  // Commandes tactiles affichées : classe posée par input/touch.ts sur sa racine.
  const hud = createHud(uiRoot, () => pauseGame(), audio, () => touchRoot.classList.contains('xr-touch--on'));
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
    // Sortie du mode test : l'arme de session posée au hangar est oubliée (reste celle de ?weapon=, sauf si
    // une arme possédée a été équipée depuis).
    if (patch.unlockAll === false && getSessionWeapon() !== null) setSessionWeapon(urlWeapon);
    // Commandes tactiles : effet immédiat (masquées en pause, elles reparaissent ainsi à la reprise).
    if (patch.touchSize !== undefined || patch.touchOpacity !== undefined || patch.leftHanded !== undefined) {
      input.setTouchOptions(next);
    }
  }

  const ctx: UiCtx = { audio, input, hud, settings: live, setSettings };

  // ---------------------------------------------------------------- État

  let phase: Phase = 'menu';
  let screen: Screen | null = null;
  let run: Run | null = null;
  /** Voyage en cours : instantané 2D gardé le temps de l'arène (Phaser est lâché). */
  let riftHold: { stage: StageDef; loadout: Readonly<PlayLoadout>; trip: RiftTrip } | null = null;
  let pause: PauseOverlay | null = null;
  let introSkip: (() => void) | null = null;
  /** Cinématique en cours (phase 'story'), jusqu'à sa fin ou son Passer. */
  let story: { readonly play: StoryPlay; readonly player: CutscenePlayer } | null = null;
  /**
   * Arme imposée par ?weapon= (valide), null sinon. L'arme de la session vit dans core/save.ts
   * (setSessionWeapon : ?weapon=, puis le hangar en mode test), jamais enregistrée.
   */
  let urlWeapon: WeaponId | null = null;
  /** ?weapon= inconnu : message affiché une fois, sur l'accueil ou au premier lancement (?stage=). */
  let weaponWarning = '';
  /**
   * ?at=boss (serveur de dev) : chaque niveau 2D lancé part du point de contrôle d'avant son arène, un vol avec boss
   * (f1) du début du combat.
   */
  let urlStartAt: StartAt | null = null;
  /** ?kai=glb (serveur de dev) : rendu du modèle avant le premier contexte WebGL du jeu. */
  let kaiReady: Promise<void> | null = null;
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

  function makeTitle(): Screen {
    return createTitleScreen(ctx, {
      playSub: playSubtitle(isFresh(), nextToPlay()),
      play: () => startStage(nextToPlay(), true),
      levels: () => goSelect(),
      options: () => goOptions(),
    });
  }

  /** Niveaux, ouverts sur le monde `world` (par défaut : celui de l'étape de JOUER). */
  function makeSelect(world?: number): Screen {
    return createLevelSelect(
      ctx,
      {
        back: () => goTitle(),
        start: (stage) => startStage(stage, true),
        // Hangar sans départ : le retour ramène aux Niveaux, sur le même monde.
        hangar: (w) => goHangar(null, () => goSelect(w)),
      },
      world,
    );
  }

  /**
   * Hangar. `next` : étape suivante (bouton de départ vers sa carte d'intro), ou null depuis les Niveaux (pas
   * de départ). `back` : retour (bouton ◀, Android, Échap) une fois la confirmation d'achat fermée.
   */
  function makeHangar(next: StageDef | null, back: () => void): Screen {
    return createHangarScreen(ctx, next, {
      back,
      depart: next ? () => startStage(next, true) : null,
    });
  }

  function goHangar(next: StageDef | null, back: () => void): void {
    showMenu(() => makeHangar(next, back));
  }

  /**
   * Résultats d'une étape réussie. `settled` : retour du hangar (valeurs finales tout de suite, sans animation ni
   * son ; réserve relue, achats déduits).
   */
  function makeResults(d: ResultsData, settled: boolean): Screen {
    const data: ResultsData = settled ? { ...d, crystals: getCrystals(), settled: true } : d;
    return createResultsScreen(ctx, data, {
      next: () => goNext(d.stage, () => showMenu(() => makeResults(d, true))),
      replay: () => startStage(d.stage, false),
      menu: () => goTitle(),
    });
  }

  function makeOptions(): Screen {
    return createOptionsScreen(ctx, {
      back: () => goTitle(),
      story: { list: () => seenCutscenes(getSave().story.seen), play: (p) => replayStory(p) },
    });
  }

  /** Écran de menu dévoilé depuis le noir (après une étape, une cinématique…), musique du menu. */
  async function revealMenu(flow: number, make: () => Screen): Promise<void> {
    riftHold = null;
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
  }

  /** Affiche un écran de menu : fondu enchaîné entre menus, fondu au noir depuis le jeu. */
  function showMenu(make: () => Screen, force = false): void {
    navigate(async (flow) => {
      const viaBlack = phase !== 'menu' || run !== null || fader.black;
      if (viaBlack) {
        abandonRun();
        await fader.toBlack();
        if (flow !== flowId) return;
        await revealMenu(flow, make);
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

  function goSelect(world?: number): void {
    showMenu(() => makeSelect(world));
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

  // ---------------------------------------------------------------- Cinématiques (phase 'story')

  /**
   * Joue une cinématique dans l'enchaînement `flow`, du noir au noir (elle reste affichée sous le noir : l'écran
   * suivant la libère). `record` : marque « vue » posée à la fin ou au Passer. Module introuvable : rien ne se
   * joue (aucune marque), l'enchaînement continue. Renvoie false si un autre enchaînement a pris la main.
   */
  async function playStory(flow: number, play: StoryPlay, record: boolean): Promise<boolean> {
    let mod: StoryModule;
    try {
      [mod] = await Promise.all([loadStory(), ensureKaiSprites()]);
    } catch (err) {
      console.error('[ui] cinématiques indisponibles', err);
      return flow === flowId;
    }
    if (flow !== flowId) return false;
    phase = 'story';
    hud.hide();
    input.setLayout('none');
    bg.setVisible(false);
    const s = createCutsceneScreen(ctx, mod, play);
    setScreen(s, true);
    const cur = { play, player: s.start() };
    story = cur;
    // Musique du jeu ou du menu remplacée ; la libération passe tout de suite à la partie lumineuse.
    audio.music('story');
    audio.musicLevel(storyMusicLevel(play.id));
    // Lancée en portrait ou en arrière-plan : arrêtée tout de suite, elle reprendra seule.
    syncStory();
    try {
      await fader.clear();
      if (flow !== flowId) return false;
      await cur.player.done;
    } finally {
      if (story === cur) story = null;
    }
    if (flow !== flowId) return false;
    if (record) markSeen(play.mark);
    await fader.toBlack();
    return flow === flowId;
  }

  /** Cinématique arrêtée en portrait et en arrière-plan (page cachée : le lecteur s'arrête seul), reprise seule. */
  function syncStory(): void {
    const p = story ? story.player : null;
    if (!p) return;
    if (isPlayable()) p.resume();
    else p.pause();
  }

  /** Options › Revoir les cinématiques : `play` rejouée (marques inchangées), puis retour aux Options. */
  function replayStory(play: StoryPlay): void {
    navigate(async (flow) => {
      await fader.toBlack();
      if (flow !== flowId) return;
      if (!(await playStory(flow, play, false))) return;
      await revealMenu(flow, makeOptions);
    });
  }

  /** « Suivant » des résultats : hangar avant l'étape suivante (`back` : retour aux résultats), sinon la fin. */
  function goNext(stage: StageDef, back: () => void): void {
    const nxt = stageAfter(stage);
    if (nxt) goHangar(nxt, back);
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

  /** `startAt` : départ imposé (point de reprise d'un combat) ; sinon ?at=boss. */
  function startStage(stage: StageDef, withIntro: boolean, force = false, startAt: StartAt | null = null): void {
    navigate(async (flow) => {
      let bg0 = bgCount;
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
        // Cinématiques pas encore vues (le prologue, avant la première étape lancée) : avant la carte d'intro.
        const plays = cutscenesBefore(stage, getSave().story.seen);
        for (const play of plays) {
          if (!(await playStory(flow, play, true))) return;
        }
        // Arrière-plan pendant une cinématique : elle s'est arrêtée puis a repris, la suite démarre normalement.
        // Sans cinématique, un arrière-plan pendant le premier fondu compte toujours.
        if (plays.length > 0) bg0 = bgCount;
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
        showStartError(stage, err, startAt);
        await fader.clear();
        return;
      }
      if (flow !== flowId) return;
      await waitPlayable(flow);
      if (flow !== flowId) return;
      if (kaiReady) await kaiReady;
      if (stage.kind === 'platform') await ensureKaiSprites();
      if (flow !== flowId) return;

      setScreen(null, true);
      bg.setVisible(false);
      // Appli passée en arrière-plan pendant l'intro ou un fondu : on démarre en pause (REPRENDRE).
      if (!launch(stage, start, bgCount !== bg0, startAt)) {
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

  /** Toast « Arme inconnue » (hud.hide() vide les toasts : appelé une fois l'accueil ou le HUD affiché). */
  function flushWeaponWarning(): void {
    if (!weaponWarning) return;
    hud.toast(weaponWarning, 'bad');
    weaponWarning = '';
  }

  function launch(
    stage: StageDef,
    start: StartMode,
    startPaused: boolean,
    startAt: StartAt | null,
    riftReturn: RiftTrip | null = null,
  ): boolean {
    // Équipement effectif figé pour toute la partie : arme (de la session sinon de la sauvegarde), améliorations,
    // cœurs max, modules de la Comète ; mode test : 4 armes et double saut.
    const loadout = playLoadout(live);
    const r: Run = { stage, loadout, handle: null, ended: false, paused: false };
    run = r;
    phase = 'playing';
    if (stage.kind === 'platform') hud.showPlatform();
    else hud.showFlight();
    flushWeaponWarning();
    input.setLayout(stage.kind);
    input.clearPresses();

    const hooks: ModeHooks = {
      hud,
      input,
      audio,
      settings: live,
      loadout,
      onComplete: (result) => endRun(r, { ok: true, result }),
      onFail: (reason, retry) =>
        endRun(r, { ok: false, reason: typeof reason === 'string' ? reason : '', retry: retryPoint(retry) }),
      onRift: (trip) => beginRiftTrip(r, trip),
    };
    // Retour de faille : l'instantané prime sur ?at=boss.
    if (riftReturn) hooks.riftReturn = riftReturn;
    else {
      const at = startAt ?? urlStartAt;
      if (at) hooks.startAt = at;
    }

    try {
      r.handle = start(gameRoot, stage, hooks);
    } catch (err) {
      console.error('[ui] démarrage de l’étape impossible', err);
      r.ended = true;
      if (run === r) run = null;
      hud.hide();
      input.setLayout('none');
      showStartError(stage, err, startAt);
      return false;
    }
    // Lancé en portrait ou en arrière-plan (ou juste après) : on démarre directement en pause.
    if (startPaused || !isPlayable()) pauseGame();
    return true;
  }

  /** `startAt` : départ imposé de la tentative (nouvel essai d'un combat), gardé par « Réessayer ». */
  function showStartError(stage: StageDef, err: unknown, startAt: StartAt | null): void {
    phase = 'menu';
    bg.setVisible(true);
    audio.music('menu');
    setScreen(
      createErrorScreen(ctx, stage, errorMessage(err), {
        retry: () => startStage(stage, false, false, startAt),
        menu: () => goTitle(),
      }),
      true,
    );
  }

  /** onComplete / onFail d'un mode : protégé contre les doubles appels et les étapes périmées. */
  function endRun(r: Run, outcome: Outcome): void {
    if (r !== run || r.ended) return;
    r.ended = true;

    let results: ResultsData | null = null;
    if (outcome.ok) {
      const result = sanitizeResult(outcome.result, r.stage);
      const prev = getSave().best[r.stage.id];
      // Cristaux de l'étape ajoutés à la réserve et récompenses données par recordResult (une seule fois :
      // r.ended est déjà posé).
      let info: RecordInfo = { crystalsGained: 0, crystals: getCrystals(), rewards: [] };
      try {
        info = recordResult(r.stage, result);
      } catch (err) {
        console.error('[ui] sauvegarde impossible', err);
      }
      results = {
        stage: r.stage,
        result,
        newRecord: !!prev && result.score > prev.score,
        best: getSave().best[r.stage.id]?.score ?? result.score,
        crystalsGained: info.crystalsGained,
        crystals: info.crystals,
        rewards: info.rewards,
      };
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
        // Victoire : cinématique d'après pas encore vue (libération du gardien), avant les résultats.
        const after = results ? cutsceneAfter(r.stage, getSave().story.seen) : null;
        if (after) {
          if (!(await playStory(flow, after, true))) return;
          phase = 'menu';
          bg.setVisible(true);
          audio.music(null);
        }
        let s: Screen;
        if (results) {
          s = makeResults(results, false);
        } else {
          const retry = outcome.ok ? null : outcome.retry;
          s = createFailScreen(ctx, r.stage, outcome.ok ? '' : outcome.reason, {
            retry: () => startStage(r.stage, false),
            retryFight: retry ? () => startStage(r.stage, false, false, retry) : null,
            menu: () => goTitle(),
          });
        }
        setScreen(s, true);
        await fader.clear();
        if (flow !== flowId) return;
        audio.sfx(results ? 'win' : 'lose');
        audio.haptic(results ? [30, 60, 30] : 160);
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

  // ---------------------------------------------------------------- Faille (arène 3D, puis retour au niveau 2D)

  const RIFT_ECHO: StoryPlay = { id: 'rift', mark: 'rift', title: 'Écho du Vide', sub: 'Faille' };

  /** Vortex : noter le voyage, lâcher Phaser, ouvrir l'arène. La campagne ne se termine pas. */
  function beginRiftTrip(r: Run, trip: RiftTrip): void {
    if (r !== run || r.ended || !isRiftId(trip.id)) return;
    r.ended = true;
    const hold = { stage: r.stage, loadout: r.loadout, trip };
    riftHold = hold;
    window.setTimeout(() => {
      navigate(async (flow) => {
        closePause(false);
        await fader.toBlack();
        if (flow !== flowId) return;
        if (run === r) teardownRun();
        hud.hide();
        input.setLayout('none');
        try {
          const g2 = await import('../game2d');
          g2.releasePlatformContext();
        } catch (err) {
          console.error('[ui] lâcher le 2D', err);
        }
        if (flow !== flowId) return;
        await openArena(flow, hold);
      }, true);
    }, 0);
  }

  /** Arène de la faille. Phaser est déjà lâché ; destroy de l'arène jette le contexte Three. */
  async function openArena(flow: number, hold: NonNullable<typeof riftHold>): Promise<void> {
    const def = riftById(hold.trip.id);
    if (!def || !def.placed) {
      await returnFromRift(flow, hold, false);
      return;
    }
    let mod: typeof import('../rift');
    try {
      mod = await import('../rift');
    } catch (err) {
      console.error('[ui] arène indisponible', err);
      await returnFromRift(flow, hold, false);
      return;
    }
    if (flow !== flowId) return;
    await waitPlayable(flow);
    if (flow !== flowId) return;
    setScreen(null, true);
    bg.setVisible(false);
    let handle: ModeHandle;
    try {
      handle = mod.startRift(gameRoot, def, {
        hud,
        input,
        audio,
        settings: live,
        loadout: hold.loadout,
        onClear: () => endArena(hold, true),
        onDown: () => endArena(hold, false),
      });
    } catch (err) {
      console.error('[ui] démarrage de la faille impossible', err);
      await showRiftDown(flow, hold);
      return;
    }
    if (flow !== flowId) {
      try {
        handle.destroy();
      } catch {
        /* déjà parti */
      }
      return;
    }
    const next: Run = { stage: hold.stage, loadout: hold.loadout, handle, ended: false, paused: false };
    run = next;
    phase = 'playing';
    hud.showPlatform();
    input.setLayout('platform');
    input.clearPresses();
    if (!isPlayable()) pauseGame();
    await nextFrame();
    await nextFrame();
    await delay(90);
    if (flow !== flowId) return;
    await fader.clear();
  }

  function endArena(hold: NonNullable<typeof riftHold>, cleared: boolean): void {
    const r = run;
    if (!r || r.ended || riftHold !== hold) return;
    r.ended = true;
    window.setTimeout(() => {
      navigate(async (flow) => {
        closePause(false);
        await fader.toBlack();
        if (flow !== flowId) return;
        if (run === r) teardownRun();
        hud.hide();
        input.setLayout('none');
        if (cleared) {
          try {
            clearRift(hold.trip.id);
          } catch (err) {
            console.error('[ui] marque de faille', err);
          }
          await returnFromRift(flow, hold, true);
          return;
        }
        await showRiftDown(flow, hold);
      }, true);
    }, 0);
  }

  /** Vision (écho du Vide), puis nouvel essai : vies et cœurs repartent du départ dans l'arène. */
  function retryRift(hold: NonNullable<typeof riftHold>): void {
    navigate(async (flow) => {
      await fader.toBlack();
      if (flow !== flowId) return;
      if (!(await playStory(flow, RIFT_ECHO, false))) return;
      await openArena(flow, hold);
    }, true);
  }

  async function showRiftDown(flow: number, hold: NonNullable<typeof riftHold>): Promise<void> {
    if (flow !== flowId) return;
    phase = 'menu';
    bg.setVisible(true);
    audio.music(null);
    const s = createRiftDownScreen(ctx, {
      again: () => retryRift(hold),
      back: () => {
        navigate(async (id) => {
          await fader.toBlack();
          if (id !== flowId) return;
          await returnFromRift(id, hold, false);
        }, true);
      },
    });
    setScreen(s, true);
    await fader.clear();
    if (flow !== flowId) return;
    audio.sfx('lose');
    audio.haptic(160);
  }

  /** Ramène Kaï dans la salle, à l'endroit noté. `cleared` : la bombe a fini. */
  async function returnFromRift(flow: number, hold: NonNullable<typeof riftHold>, cleared: boolean): Promise<void> {
    if (flow !== flowId) return;
    hud.hide();
    input.setLayout('none');
    let start: StartMode;
    try {
      start = await loadMode('platform');
      await ensureKaiSprites();
    } catch (err) {
      console.error('[ui] retour 2D impossible', err);
      riftHold = null;
      showStartError(hold.stage, err, null);
      await fader.clear();
      return;
    }
    if (flow !== flowId) return;
    await waitPlayable(flow);
    if (flow !== flowId) return;
    const trip: RiftTrip = { id: hold.trip.id, snapshot: hold.trip.snapshot, cleared };
    setScreen(null, true);
    bg.setVisible(false);
    riftHold = null;
    if (!launch(hold.stage, start, !isPlayable(), null, trip)) {
      await fader.clear();
      return;
    }
    await nextFrame();
    await nextFrame();
    await delay(90);
    if (flow !== flowId) return;
    await fader.clear();
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
    hud.setPaused(true);
    closePause(true);
    const p = createPauseOverlay(ctx, r.stage, {
      resume: () => resumeGame(),
      restart: () => {
        if (riftHold) {
          const hold = riftHold;
          navigate(async (flow) => {
            closePause(false);
            await fader.toBlack();
            if (flow !== flowId) return;
            abandonRun();
            teardownRun();
            await openArena(flow, hold);
          }, true);
          return;
        }
        startStage(r.stage, false, true);
      },
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
    hud.setPaused(false);
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
    // Cinématique : retour = Passer (pas pendant les fondus, voir plus haut).
    if (phase === 'story') {
      const p = story ? story.player : null;
      if (p && p.state === 'playing') {
        audio.sfx('click', { pitch: 0.85 });
        p.skip();
      }
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
    syncStory();
  }

  function onBackground(): void {
    if (backgrounded) return;
    backgrounded = true;
    bgCount++;
    // Son coupé d'abord : le clic de la pause ne doit pas ressortir au retour.
    audio.suspend();
    pauseGame();
    syncStory();
  }

  function onForeground(): void {
    if (!backgrounded) return;
    backgrounded = false;
    audio.resume();
    checkOrientation();
    syncStory();
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
  // ?weapon=laser|machinegun|shotgun|rifle : arme de la session, même hors mode test (comme ?stage=).
  const weaponParam = params.get('weapon');
  urlWeapon = isWeaponId(weaponParam) ? weaponParam : null;
  setSessionWeapon(urlWeapon);
  if (weaponParam && !urlWeapon) weaponWarning = `Arme inconnue : ${weaponParam}`;
  if (params.get('unlock') === '1' && !live.unlockAll) setSettings({ unlockAll: true });
  if (import.meta.env.DEV && params.get('at') === 'boss') urlStartAt = { at: 'boss' };
  if (import.meta.env.DEV && params.get('kai') === 'glb') {
    kaiReady = import('../game2d/art/kaiBake')
      .then((m) => m.prepareKaiSheet())
      .catch((err) => {
        console.error('[kai] modèle .glb inutilisable, Kaï garde son sprite', err);
      });
  }
  void ensureKaiSprites();

  audio.setMusicEnabled(live.music);
  audio.setSfxEnabled(live.sfx);
  audio.setHapticsEnabled(live.haptics);
  input.setTiltEnabled(live.tilt);
  input.setTouchOptions(live);
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
      flushWeaponWarning();
    });
  }

  if (import.meta.env.DEV) {
    // Accès de test (scénarios Playwright) : mêmes fonctions que les écouteurs Capacitor.
    (window as unknown as Record<string, unknown>).__xrShell = {
      cap: (name: keyof typeof capHandlers) => capHandlers[name](),
      audio,
      /** Radio de LUMA : phase, message affiché, file, messages affichés depuis le début de l'étape, pause. */
      radio: () => hud.radioInfo(),
      info: () => {
        // Équipement effectif : celui de la partie en cours, sinon celui du prochain lancement.
        const play = run ? run.loadout : playLoadout(live);
        return {
          phase,
          run: run ? { stage: run.stage.id, paused: run.paused, ended: run.ended } : null,
          screen: screen ? screen.name : null,
          // Arme, armes possédées et compétences seulement ; `play` : tout (améliorations, cœurs, Comète).
          loadout: { equipped: play.equipped, owned: [...play.owned], skills: { ...play.skills } },
          play,
          // Progression lue par core/save.ts (mode test compris pour `unlocked`).
          stages: STAGES.map((s) => ({
            id: s.id,
            kind: s.kind,
            world: s.world,
            cleared: isCleared(s.id),
            unlocked: isUnlocked(s),
          })),
          crystals: getCrystals(),
          rifts: [...getSave().rifts],
          weapon: getSessionWeapon(),
          // Cinématique en cours (phase 'story') et marques de l'histoire (cinématiques vues, tutoriel).
          cutscene: story
            ? {
                id: story.play.id,
                mark: story.play.mark,
                time: story.player.time,
                duration: story.player.duration,
                paused: story.player.paused,
                state: story.player.state,
              }
            : null,
          seen: [...getSave().story.seen],
          backgrounded,
          navLock,
          fading: fader.busy,
          input: { ...input.state },
        };
      },
      /** Ajoute (ou retire) des cristaux à la réserve, enregistrée ; renvoie la réserve. Écran affiché non redessiné. */
      addCrystals: (n: number) => addCrystals(Number(n)),
    };
  }

  // Préchargement des modes et des cinématiques une fois l'accueil affiché.
  window.setTimeout(() => {
    loadMode('platform').catch(noop);
    loadMode('flight').catch(noop);
    loadStory().catch(noop);
  }, 1500);
}
