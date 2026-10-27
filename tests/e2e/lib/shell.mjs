// Outils des scénarios « shell » (enchaînement des écrans, arrière-plan, Capacitor, son).
//
// instrument() s'injecte AVANT le chargement de la page (appeler avant t.goto) :
//  - __acs : AudioContext créés ; __starts : nombre de start() de sources audio ;
//  - __liveNodes() : nœuds audio encore branchés (connect sans disconnect()) ;
//  - __setHidden(bool) : simule la mise en arrière-plan (document.hidden + visibilitychange) ;
//  - __cap(name) : événements Capacitor ('pause', 'resume', 'backButton') via le crochet DEV __xrShell.cap.
import { waitFor } from './helpers.mjs';

/** Accepte `t` ou directement une Page Playwright. */
function pageOf(x) {
  return x && x.page ? x.page : x;
}

export async function instrument(tOrPage) {
  await pageOf(tOrPage).addInitScript(() => {
    window.__acs = [];
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      constructor(...a) {
        super(...a);
        window.__acs.push(this);
      }
    };
    const live = new Set();
    const oc = AudioNode.prototype.connect;
    const od = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (...a) {
      live.add(this);
      return oc.apply(this, a);
    };
    AudioNode.prototype.disconnect = function (...a) {
      if (a.length === 0) live.delete(this);
      return od.apply(this, a);
    };
    window.__liveNodes = () => live.size;
    window.__starts = 0;
    const os = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function (...a) {
      window.__starts++;
      return os.apply(this, a);
    };
    const ob = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      window.__starts++;
      return ob.apply(this, a);
    };
    window.__hid = false;
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hid });
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get: () => (window.__hid ? 'hidden' : 'visible'),
    });
    window.__setHidden = (h) => {
      window.__hid = !!h;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    // Mêmes fonctions que celles enregistrées auprès de Capacitor par App.ts (crochet DEV).
    window.__cap = (name) => window.__xrShell.cap(name);
  });
}

/**
 * Petit état lisible de l'interface et du son :
 *  screens (data-screen présents), pause ('open' | 'closing' | 'none'), ac (état de l'AudioContext),
 *  fader ('black' | 'clear'), touch (couches tactiles visibles, ex. '10'), x2d (x de Kaï),
 *  sh (phase/étape, -P en pause, -E terminée, BG arrière-plan, LOCK enchaînement),
 *  inp (commandes : L R J F B 0/1 + stick), shell (__xrShell.info() brut).
 */
export function uiState(t) {
  return t.ev(() => {
    const ac = window.__acs && window.__acs[0];
    const ov = document.querySelector('.overlay.pause');
    const s2 = window.__xr2d && window.__xr2d.scene;
    const i = window.__xrShell ? window.__xrShell.info() : null;
    const sh = i
      ? `${i.phase}${i.run ? `/${i.run.stage}${i.run.paused ? '-P' : ''}${i.run.ended ? '-E' : ''}` : ''}${i.backgrounded ? ' BG' : ''}${i.navLock ? ' LOCK' : ''}`
      : null;
    const inp = i
      ? `L${+i.input.left}R${+i.input.right}J${+i.input.jump}F${+i.input.fire}B${+i.input.boost}S${i.input.stickX.toFixed(1)},${i.input.stickY.toFixed(1)}`
      : null;
    const fader = document.querySelector('.fader');
    return {
      screens: [...document.querySelectorAll('.screens [data-screen]')].map((e) => e.dataset.screen).join(','),
      pause: ov ? (ov.classList.contains('is-open') ? 'open' : 'closing') : 'none',
      ac: ac ? ac.state : 'none',
      fader: fader && fader.classList.contains('is-on') ? 'black' : 'clear',
      touch: [...document.querySelectorAll('#touch-root .xr-tc-layer')].map((l) => (l.hidden ? 0 : 1)).join(''),
      x2d: s2 && s2.player ? Math.round(s2.player.x) : null,
      sh,
      inp,
      shell: i,
    };
  });
}

/** __xrShell.info() (phase, run, backgrounded, navLock, fading, input) ou null hors dev. */
export function shellInfo(t) {
  return t.ev(() => (window.__xrShell ? window.__xrShell.info() : null));
}

/** Simule le passage en arrière-plan (true) ou le retour au premier plan (false). Nécessite instrument(). */
export function setHidden(t, hidden) {
  return t.ev((h) => {
    if (!window.__setHidden) throw new Error('setHidden : instrument() doit être appelé avant t.goto()');
    window.__setHidden(h);
  }, !!hidden);
}

/** Déclenche un événement Capacitor : 'pause', 'resume' ou 'backButton' (aide DEV __xrShell). */
export function cap(t, name) {
  return t.ev((n) => {
    if (!window.__xrShell) throw new Error('cap : __xrShell absent (aides DEV indisponibles)');
    window.__xrShell.cap(n);
  }, name);
}

/** Compteurs audio (nécessite instrument()) : contextes créés, état du premier, nœuds branchés, start(). */
export function audioStats(t) {
  return t.ev(() => ({
    contexts: window.__acs ? window.__acs.length : 0,
    state: window.__acs && window.__acs[0] ? window.__acs[0].state : 'none',
    liveNodes: window.__liveNodes ? window.__liveNodes() : 0,
    starts: window.__starts || 0,
  }));
}

// ---------------------------------------------------------------- Retour Android, pause, arrière-plan, son
// (scénarios back-button, background-2d, background-3d, background-intro, audio-lifecycle ; aides DEV)

/**
 * À appeler AVANT t.goto : compte les morceaux de musique lancés (window.__tracks).
 * Chaque morceau (TrackPlayer, src/audio/music.ts) règle à sa création l'écho partagé du moteur
 * (setTargetAtTime sur le delayTime du seul DelayNode de 2 s) : un appel = un morceau lancé.
 */
export async function countTracks(tOrPage) {
  await pageOf(tOrPage).addInitScript(() => {
    window.__tracks = 0;
    let param = null;
    const cd = BaseAudioContext.prototype.createDelay;
    BaseAudioContext.prototype.createDelay = function (...a) {
      const d = cd.apply(this, a);
      if (a[0] === 2) param = d.delayTime;
      return d;
    };
    const st = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (...a) {
      if (param && this === param) window.__tracks++;
      return st.apply(this, a);
    };
  });
}

/** Morceaux de musique lancés depuis le chargement (nécessite countTracks()). */
export function tracks(t) {
  return t.ev(() => window.__tracks);
}

/**
 * Espionne CapApp.exitApp() : chaque appel incrémente window.__exitCalls (au lieu de l'erreur
 * « Not implemented on web »). À appeler une fois l'accueil chargé : App.ts a alors chargé l'implémentation
 * web de @capacitor/app en s'abonnant aux événements. Serveur de dev uniquement : le module est retrouvé
 * parmi les dépendances pré-groupées par Vite (même URL, donc même instance que celle du jeu).
 */
export function spyExitApp(t) {
  return waitFor(
    t,
    async () => {
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => u.includes('/node_modules/.vite/deps/') && /\.js(\?|$)/.test(u) && !/phaser|three/i.test(u));
      for (const u of urls) {
        try {
          const m = await import(u);
          if (m.AppWeb && m.AppWeb.prototype) {
            window.__exitCalls = 0;
            m.AppWeb.prototype.exitApp = function () {
              window.__exitCalls++;
              return Promise.resolve();
            };
            return u;
          }
        } catch {
          // module sans intérêt ici
        }
      }
      return false;
    },
    { timeout: 10000, label: 'module AppWeb de @capacitor/app (espion de exitApp)' },
  );
}

/** Nombre d'appels à CapApp.exitApp() depuis spyExitApp(). */
export function exitCalls(t) {
  return t.ev(() => window.__exitCalls);
}

/** `n` appuis sur le bouton retour Android dans la même tâche (même « tick »). */
export function pressBack(t, n = 1) {
  return t.ev((k) => {
    for (let i = 0; i < k; i++) window.__xrShell.cap('backButton');
  }, n);
}

/**
 * Clique (click() DOM, synchrone) le bouton visible dont le texte contient `label` dans `scope`, puis
 * exécute `then` dans la même tâche : 'back' (bouton retour), 'hide' (arrière-plan), 'cap-pause' ou rien.
 * Sert à tester ce qui arrive PENDANT le fondu ou l'enchaînement que le clic déclenche.
 */
export async function clickThen(t, scope, label, then = null) {
  const ok = await t.ev(
    ([s, l, th]) => {
      const b = [...document.querySelectorAll(`${s} button`)].find(
        (e) => e.offsetParent !== null && e.textContent.toUpperCase().includes(l.toUpperCase()),
      );
      if (!b) return false;
      b.click();
      if (th === 'back') window.__xrShell.cap('backButton');
      else if (th === 'hide') window.__setHidden(true);
      else if (th === 'cap-pause') window.__xrShell.cap('pause');
      return true;
    },
    [scope, label, then],
  );
  if (!ok) throw new Error(`clickThen : bouton « ${label} » introuvable dans ${scope}`);
}

/**
 * Menu Pause et partie : overlays présents (overlays) et ouverts (open), vue du menu ouvert ('menu' |
 * 'options'), phase du shell, étape, partie en pause / terminée, arrière-plan, enchaînement, fondu.
 */
export function pauseState(t) {
  return t.ev(() => {
    const open = document.querySelectorAll('.overlay.pause.is-open');
    const i = window.__xrShell.info();
    return {
      overlays: document.querySelectorAll('.overlay.pause').length,
      open: open.length,
      view: open[0] ? open[0].dataset.view : null,
      phase: i.phase,
      stage: i.run ? i.run.stage : null,
      paused: !!(i.run && i.run.paused),
      ended: !!(i.run && i.run.ended),
      backgrounded: i.backgrounded,
      navLock: i.navLock,
      fading: i.fading,
    };
  });
}

/** Attend le menu Pause ouvert (un seul) sur une partie en pause, enchaînement terminé. */
export function waitPaused(t, label = 'menu Pause ouvert, partie en pause', { timeout = 8000 } = {}) {
  return waitFor(
    t,
    () => {
      const i = window.__xrShell.info();
      return (
        document.querySelectorAll('.overlay.pause.is-open').length === 1 &&
        !!(i.run && i.run.paused && !i.run.ended) &&
        !i.navLock &&
        !i.fading
      );
    },
    { timeout, label },
  );
}

/** Attend la partie relancée : menu Pause fermé, partie hors pause, enchaînement terminé. */
export function waitResumed(t, label = 'partie relancée (menu Pause fermé)', { timeout = 8000 } = {}) {
  return waitFor(
    t,
    () => {
      const i = window.__xrShell.info();
      return !document.querySelector('.overlay.pause.is-open') && !!(i.run && !i.run.paused && !i.run.ended) && !i.navLock;
    },
    { timeout, label },
  );
}

/** Clique REPRENDRE dans le menu Pause ouvert (clic Playwright réel). */
export function clickResume(t) {
  return t.page.locator('.overlay.pause.is-open .btn-primary').click({ timeout: 5000 });
}

/** Clique le bouton `label` (Recommencer, Options, Quitter) du menu Pause ouvert. */
export function clickPauseButton(t, label) {
  return t.page.locator('.overlay.pause.is-open .pause-view--menu button', { hasText: label }).first().click({ timeout: 5000 });
}

/** Attend la carte d'intro d'une étape affichée (fondu terminé ; l'enchaînement, lui, continue). */
export function waitIntroCard(t, { timeout = 20000 } = {}) {
  return waitFor(
    t,
    () => {
      const s = document.querySelector('.screens [data-screen="intro"].is-active:not(.is-leaving)');
      const f = document.querySelector('.fader');
      const i = window.__xrShell.info();
      return !!s && !(f && f.classList.contains('is-on')) && !i.fading && i.phase === 'intro' && !i.run;
    },
    { timeout, label: "carte d'intro affichée" },
  );
}

/**
 * Attend l'étape `stage` lancée et dévoilée (enchaînement terminé), en pause ou non.
 * En 2D, attend aussi Kaï créé ; en vol, l'aide __xr3d.
 */
export function waitStageShown(t, stage, { timeout = 60000 } = {}) {
  return waitFor(
    t,
    (id) => {
      const i = window.__xrShell.info();
      if (!i.run || i.run.stage !== id || i.run.ended || i.navLock || i.fading || i.phase !== 'playing') return false;
      const f = document.querySelector('.fader');
      if (f && f.classList.contains('is-on')) return false;
      if (id[0] === 'f') return !!window.__xr3d;
      return !!(window.__xr2d && window.__xr2d.scene && window.__xr2d.scene.player);
    },
    { timeout, label: `étape ${stage} lancée et dévoilée`, arg: stage },
  );
}

/** État du premier AudioContext ('none' s'il n'a pas encore été créé). */
export function audioState(t) {
  return t.ev(() => (window.__acs && window.__acs[0] ? window.__acs[0].state : 'none'));
}

/** Attend l'AudioContext dans l'état `state` ('running' | 'suspended'). */
export function waitAudio(t, state, label, { timeout = 5000 } = {}) {
  return waitFor(t, (s) => !!(window.__acs && window.__acs[0] && window.__acs[0].state === s), {
    timeout,
    label: label || `AudioContext ${state}`,
    arg: state,
  });
}

/** Sources audio démarrées (start()) depuis le chargement (nécessite instrument()). */
export function sourceStarts(t) {
  return t.ev(() => window.__starts || 0);
}

/** Sources audio démarrées par seconde, mesurées sur `ms` ms. */
export async function sourceRate(t, ms) {
  const a = await sourceStarts(t);
  await t.wait(ms);
  return Math.round((((await sourceStarts(t)) - a) * 1000) / ms);
}

/** Nœuds audio branchés (connect sans disconnect()) ; nécessite instrument(). */
export function liveNodes(t) {
  return t.ev(() => (window.__liveNodes ? window.__liveNodes() : 0));
}

/** Commandes lues par le jeu (__xrShell.info().input) : { left, right, jump, fire, boost, stickX, stickY }. */
export function inputState(t) {
  return t.ev(() => window.__xrShell.info().input);
}
