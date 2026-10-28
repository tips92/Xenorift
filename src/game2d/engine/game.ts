import * as Phaser from 'phaser';
import { GRAVITY, MAX_VIEW_W, MIN_VIEW_W, VIEW_H } from '../constants';
import { PlatformScene } from './PlatformScene';
import { endSession, reportError, toast } from './session';
import type { Session } from './session';
import { PHYS_FPS, SCENE_KEY, TILE_BIAS } from './tuning';

// Instance Phaser unique, créée au premier lancement puis réutilisée (évite de multiplier les contextes WebGL).
// Entre deux sessions, le canvas est masqué et la boucle endormie.
// Perte du contexte WebGL : Phaser recrée lui-même ses ressources à la restauration (textures renvoyées
// depuis les canvas d'origine). En attendant, la scène est figée ; sans restauration, l'étape échoue
// et le lancement suivant repart d'une instance neuve (nouveau canvas, nouveau contexte).

let game: Phaser.Game | null = null;
let hostEl: HTMLElement | null = null;
/** Vrai quand Phaser a fini de démarrer (textures internes prêtes, scènes créées). */
let ready = false;
/** Session qui possède actuellement le jeu. */
let current: Session | null = null;
/** Session à lancer dès que Phaser sera prêt. */
let pending: Session | null = null;
let resizeTimer = 0;
/** Délai d'attente de la restauration du contexte (application au premier plan) avant d'abandonner l'étape. */
const GFX_RESTORE_WAIT_MS = 5000;
const GFX_CHECK_MS = 250;
const GFX_LOST_REASON = 'Liaison graphique perdue';
let lostTimer = 0;
/** Temps passé au premier plan depuis la perte (ou depuis le dernier retour au premier plan). */
let lostVisibleMs = 0;
/** Jeu de secours en rendu Canvas 2D (WebGL refusé) : on retentera WebGL au prochain lancement. */
let degraded = false;

/** Largeur logique : suit le ratio de l'écran, hauteur fixe VIEW_H. */
export function computeViewWidth(el: HTMLElement | null): number {
  let w = el ? el.clientWidth : 0;
  let h = el ? el.clientHeight : 0;
  if (w <= 0 || h <= 0) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  const raw = Math.round((VIEW_H * w) / Math.max(1, h));
  return Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, raw));
}

function applyViewSize(): void {
  if (!game || !ready) return;
  // refresh() calcule l'affichage avec la taille du parent EN CACHE puis la met à jour en silence :
  // sans cette relecture, le canvas peut rester bloqué à une taille d'affichage périmée.
  game.scale.getParentBounds();
  const w = computeViewWidth(hostEl);
  if (w !== game.scale.gameSize.width || game.scale.gameSize.height !== VIEW_H) {
    game.scale.setGameSize(w, VIEW_H);
  } else {
    game.scale.refresh();
  }
}

function onWindowResize(): void {
  applyViewSize();
}

function onOrientationChange(): void {
  applyViewSize();
  // Les dimensions ne sont pas toujours à jour immédiatement après une rotation.
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(applyViewSize, 300);
}

function makeConfig(container: HTMLElement, type: number): Phaser.Types.Core.GameConfig {
  const width = computeViewWidth(container);
  return {
    type,
    parent: container,
    backgroundColor: '#05010f',
    banner: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height: VIEW_H,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: GRAVITY },
        fps: PHYS_FPS,
        fixedStep: true,
        tileBias: TILE_BIAS,
        debug: false,
      },
    },
    render: {
      antialias: true,
      roundPixels: true,
      powerPreference: 'high-performance',
    },
    // Toutes les commandes passent par hooks.input ; tout le son par hooks.audio.
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    scene: [PlatformScene],
  };
}

function createGame(container: HTMLElement): Phaser.Game {
  let g: Phaser.Game;
  try {
    g = new Phaser.Game(makeConfig(container, Phaser.AUTO));
    degraded = false;
  } catch (err) {
    // Contexte WebGL impossible à créer (GPU bloqué après des pertes répétées…) : rendu Canvas 2D, plus lent mais jouable.
    reportError('création du rendu WebGL', err);
    g = new Phaser.Game(makeConfig(container, Phaser.CANVAS));
    degraded = true;
  }
  // Le démarrage est synchrone quand la page est chargée ; sinon le moteur de rendu n'existe qu'à BOOT.
  if (g.isBooted) watchContext(g);
  else g.events.once(Phaser.Core.Events.BOOT, () => watchContext(g));

  g.events.once(Phaser.Core.Events.READY, () => {
    // Jeu abandonné avant d'avoir fini de démarrer.
    if (game !== g) return;
    ready = true;
    applyViewSize();
    if (pending && pending === current) {
      const s = pending;
      pending = null;
      launch(s);
    } else {
      pending = null;
      // La boucle démarre juste après cet événement : on l'endort au tick suivant si personne n'en veut.
      setTimeout(() => {
        if (!current && game === g) g.loop.sleep();
      }, 0);
    }
  });

  // Filet de sécurité : certaines WebView livrent l'événement resize en retard (ou pas du tout).
  let pollMs = 0;
  g.events.on(Phaser.Core.Events.PRE_STEP, (_time: number, delta: number) => {
    pollMs += delta;
    if (pollMs < 500) return;
    pollMs = 0;
    if (ready && computeViewWidth(hostEl) !== g.scale.gameSize.width) applyViewSize();
  });

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onOrientationChange);
  return g;
}

// ---------------------------------------------------------------- Perte du contexte WebGL

function webglRenderer(g: Phaser.Game): Phaser.Renderer.WebGL.WebGLRenderer | null {
  const r = g.renderer;
  return r && r.type === Phaser.WEBGL ? (r as Phaser.Renderer.WebGL.WebGLRenderer) : null;
}

/** Vrai si le contexte WebGL de ce jeu est perdu (et pas encore restauré). */
function contextGone(g: Phaser.Game): boolean {
  const r = webglRenderer(g);
  if (!r) return false;
  try {
    return r.contextLost || !r.gl || r.gl.isContextLost();
  } catch {
    return true;
  }
}

function watchContext(g: Phaser.Game): void {
  const r = webglRenderer(g);
  if (!r) return;
  // Contexte perdu : Chrome peint le canevas en blanc (icône d'image cassée) ; masqué, le fond sombre reste.
  const c = g.canvas;
  c.addEventListener('webglcontextlost', () => (c.style.visibility = 'hidden'));
  c.addEventListener('webglcontextrestored', () => (c.style.visibility = ''));
  r.on(Phaser.Renderer.Events.LOSE_WEBGL, () => onContextLost(g));
  r.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => onContextRestored(g));
}

function clearLostTimer(): void {
  window.clearInterval(lostTimer);
  lostTimer = 0;
}

function onContextLost(g: Phaser.Game): void {
  // Jeu endormi (aucune session) : rien à figer, le prochain runSession recrée le jeu si le contexte manque encore.
  const s = current;
  if (g !== game || !s || !s.alive) return;
  // Écran noir : on fige la partie plutôt que de laisser le joueur avancer à l'aveugle.
  s.gfxLost = true;
  const scene = sceneOf(s);
  if (scene && scene.sys.isActive()) g.scene.pause(SCENE_KEY);
  if (s.ended) return;
  toast(s, 'Liaison graphique perdue…', 'bad');
  armLostTimer(s);
}

function armLostTimer(s: Session): void {
  clearLostTimer();
  lostVisibleMs = 0;
  lostTimer = window.setInterval(() => {
    if (current !== s || !s.alive || !s.gfxLost) {
      clearLostTimer();
      return;
    }
    // Application en arrière-plan : la restauration n'arrive souvent qu'au retour au premier plan.
    // Le délai ne court donc qu'au premier plan, et repart de zéro à chaque retour.
    if (document.hidden) {
      lostVisibleMs = 0;
      return;
    }
    lostVisibleMs += GFX_CHECK_MS;
    if (lostVisibleMs < GFX_RESTORE_WAIT_MS) return;
    clearLostTimer();
    giveUpSession(s);
  }, GFX_CHECK_MS);
}

/** Pas de restauration : l'étape se termine (une seule fois) pour que l'interface propose de réessayer. */
function giveUpSession(s: Session): void {
  const scene = sceneOf(s);
  // Kaï décollait déjà : le niveau est gagné, inutile d'attendre la fin de l'animation.
  if (scene && scene.finishExitNow()) return;
  endSession(s, () => s.hooks.onFail(GFX_LOST_REASON));
}

function onContextRestored(g: Phaser.Game): void {
  if (g !== game) return;
  clearLostTimer();
  const s = current;
  if (!s || !s.gfxLost) return;
  s.gfxLost = false;
  if (!s.alive || s.ended || s.paused) return;
  // Les appuis faits pendant l'écran noir ne doivent pas déclencher de saut / tir.
  try {
    s.hooks.input.clearPresses();
  } catch (err) {
    reportError('input.clearPresses', err);
  }
  const scene = sceneOf(s);
  if (scene && scene.sys.isPaused()) {
    g.loop.resetDelta();
    g.scene.resume(SCENE_KEY);
  }
}

/** Abandonne l'instance actuelle (contexte perdu pour de bon, ou rendu de secours) : la suivante sera neuve. */
function dropGame(): void {
  const g = game;
  if (!g) return;
  game = null;
  ready = false;
  pending = null;
  clearLostTimer();
  try {
    // Arrêt explicite : destroy() ne déclenche pas le nettoyage SHUTDOWN de la scène.
    const scene = g.scene.getScene(SCENE_KEY);
    if (scene) {
      const status = scene.sys.settings.status;
      if (status >= Phaser.Scenes.START && status < Phaser.Scenes.SHUTDOWN) g.scene.stop(SCENE_KEY);
    }
  } catch (err) {
    reportError('arrêt de la scène', err);
  }
  const canvas = g.canvas;
  try {
    g.destroy(true);
    // Phaser détruit le jeu au pas de boucle suivant : une boucle endormie doit être réveillée.
    if (g.isRunning && !g.loop.running) g.loop.wake();
  } catch (err) {
    reportError('destruction du jeu', err);
  }
  // Retiré tout de suite : le nouveau canvas prend sa place sans attendre la frame suivante.
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
}

function ensureGame(container: HTMLElement): Phaser.Game {
  if (!game) {
    hostEl = container;
    game = createGame(container);
    return game;
  }
  if (hostEl !== container) {
    // Conteneur différent : on y déplace le canvas existant.
    hostEl = container;
    if (game.canvas) container.appendChild(game.canvas);
    game.scale.parent = container;
    if (ready) {
      game.scale.getParentBounds();
      applyViewSize();
    }
  }
  return game;
}

function setCanvasVisible(on: boolean): void {
  // 'block' : pas d'espace de ligne sous le canvas, marges de centrage fiables.
  if (game && game.canvas) game.canvas.style.display = on ? 'block' : 'none';
}

function getScene(): PlatformScene | null {
  if (!game || !ready) return null;
  return game.scene.getScene(SCENE_KEY) as PlatformScene | null;
}

function launch(session: Session): void {
  if (!game || current !== session || !session.alive) return;
  const scene = getScene();
  if (!scene) return;
  const status = scene.sys.settings.status;
  // Une scène bloquée entre START et CREATING (erreur pendant create) ne redémarrerait pas : on l'arrête d'abord.
  if (status >= Phaser.Scenes.START && status < Phaser.Scenes.SHUTDOWN) {
    game.scene.stop(SCENE_KEY);
  }
  game.scene.start(SCENE_KEY, { session });
}

function wakeLoop(): void {
  if (!game || !game.isRunning) return;
  if (!game.loop.running) {
    game.loop.resetDelta();
    game.loop.wake();
  }
}

/** Prend possession du jeu pour une nouvelle session et démarre la scène (dès que Phaser est prêt). */
export function runSession(container: HTMLElement, session: Session): void {
  if (current && current !== session) {
    // Session précédente jamais détruite : elle est remplacée.
    current.alive = false;
  }
  // Contexte perdu sans restauration (pendant le sommeil, ou étape abandonnée) : réutiliser ce jeu
  // donnerait un écran vide. Une instance neuve obtient un nouveau contexte (ou retente WebGL après un secours Canvas).
  if (game && (degraded || contextGone(game))) {
    current = null;
    dropGame();
  }
  ensureGame(container);
  current = session;
  setCanvasVisible(true);
  if (ready) {
    applyViewSize();
    wakeLoop();
    launch(session);
  } else {
    pending = session;
  }
}

/** Scène active de cette session, ou null. */
export function sceneOf(session: Session): PlatformScene | null {
  if (current !== session) return null;
  const scene = getScene();
  if (!scene || scene.session !== session) return null;
  return scene;
}

export function pauseSession(session: Session): void {
  const scene = sceneOf(session);
  if (scene && scene.sys.isActive()) {
    game?.scene.pause(SCENE_KEY);
  }
  // Sinon : la scène n'existe pas encore, elle se mettra en pause d'elle-même (session.paused).
}

export function resumeSession(session: Session): void {
  const scene = sceneOf(session);
  // Contexte graphique toujours perdu : la scène reste figée, sa restauration la relancera.
  if (scene && scene.sys.isPaused() && !session.gfxLost) {
    game?.scene.resume(SCENE_KEY);
  }
}

/** Libère le jeu : arrête la scène, masque le canvas, endort la boucle. Sans effet si la session a été remplacée. */
export function releaseSession(session: Session): void {
  if (current !== session) return;
  current = null;
  if (pending === session) pending = null;
  clearLostTimer();
  if (!game) return;
  setCanvasVisible(false);
  const g = game;
  const stop = (): void => {
    // Une nouvelle session a pu démarrer entre-temps : elle a déjà relancé la scène.
    if (current) return;
    const scene = getScene();
    if (scene) {
      const status = scene.sys.settings.status;
      if (status >= Phaser.Scenes.START && status < Phaser.Scenes.SHUTDOWN) g.scene.stop(SCENE_KEY);
    }
    if (g.isRunning) g.loop.sleep();
  };
  // Appelé pendant une mise à jour Phaser : on termine la frame avant d'arrêter la scène.
  if (g.scene.isProcessing) setTimeout(stop, 0);
  else stop();
}
