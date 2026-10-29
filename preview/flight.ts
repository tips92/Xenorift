import { defaultPlayLoadout, shipLoadout } from '../src/core/hangar';
import { STAGES } from '../src/core/stages';
import type {
  AudioApi,
  BossHud,
  FlightHud,
  HudApi,
  InputAction,
  InputApi,
  InputState,
  ModeHandle,
  ModeHooks,
  Settings,
  StageDef,
  StageResult,
  StartAt,
  ToastKind,
} from '../src/core/types';
import { startFlight } from '../src/game3d';

// Page d'aperçu du mode vol 3D (outil de développement, hors jeu), avec des « hooks » simulés.
// Paramètres : ?stage=<étape de vol de STAGES : f1, f2…> (inconnue : la première) &autopilot=1 &ts=1..8 &gun=0..3
// &shield=0..2 &boost=0..2 (modules de la Comète du hangar) &boss=1 (départ au combat du boss du parcours, comme
// ?at=boss dans le jeu ; ignoré sans boss). Tir tant que J / X / F est tenu, turbo : Espace / Maj (même jauge
// d'énergie).

interface Dev3d {
  autopilot(on?: boolean): void;
  win(): void;
  fail(): void;
  timeScale(s: number): void;
  info(): Record<string, unknown>;
  /** Place un ennemi devant la Comète (essaim : formation entière) ; nombre placé. */
  spawn?(type: string, distance?: number): number;
  fire?(on?: boolean): void;
  boss?: { start(): boolean; win(): void; hit(n?: number): number };
}

const params = new URLSearchParams(location.search);
const flights = STAGES.filter((s) => s.kind === 'flight');
const stage: StageDef = flights.find((s) => s.id === params.get('stage')) ?? flights[0];
const auto = params.get('autopilot') === '1';
const timeScale = Number(params.get('ts')) || 1;
const atBoss = params.get('boss') === '1';
// Équipement de départ (rien d'acheté), sauf les modules de la Comète demandés (niveaux bornés par shipLoadout).
const loadout = defaultPlayLoadout();
loadout.ship = shipLoadout({
  gun: Number(params.get('gun')) || 0,
  shield: Number(params.get('shield')) || 0,
  boost: Number(params.get('boost')) || 0,
});

const root = document.getElementById('root') as HTMLElement;
const hudEl = document.getElementById('hud') as HTMLElement;
const toastEl = document.getElementById('toast') as HTMLElement;
const endEl = document.getElementById('end') as HTMLElement;

// ------------------------------------------------------------------ HUD simulé
const hudState: FlightHud = {
  timeLeft: 0,
  gates: 0,
  gatesTotal: 0,
  shield: 0,
  maxShield: 3,
  progress: 0,
  gunLevel: 0,
  heat: 0,
  overheated: false,
  boosting: false,
  crystals: 0,
};
let hudUpdates = 0;
/** Barre de boss (copie : l'objet du jeu est réutilisé), null hors combat. */
let bossState: BossHud | null = null;
function renderHud(): void {
  const s = hudState;
  const b = bossState;
  const bar = (v: number, n = 10): string => '█'.repeat(Math.round(v * n)).padEnd(n, '·');
  hudEl.textContent =
    `${stage.id} · ${stage.title}\n` +
    `Temps    ${s.timeLeft.toFixed(1)} s\n` +
    `Portails ${s.gates}/${s.gatesTotal}\n` +
    `Bouclier ${'◆'.repeat(s.shield)}${'◇'.repeat(Math.max(0, s.maxShield - s.shield))}\n` +
    `Énergie  ${bar(s.heat)} ${s.gunLevel >= 1 ? `mitrailleuse ${s.gunLevel}` : 'canon léger'}${s.boosting ? ' TURBO' : ''}${s.overheated ? ' SURCHAUFFE' : ''}\n` +
    `Cristaux ${s.crystals}\n` +
    `Parcours ${bar(s.progress, 20)}\n` +
    (b ? `Boss     ${bar(b.life)} ${b.name} · phase ${b.phase}/${b.phases}\n` : '') +
    `Tir J / X / F (tenu), turbo Espace / Maj\n` +
    `(maj HUD : ${hudUpdates})`;
}
let toastTimer = 0;
const hud: HudApi = {
  showPlatform: () => undefined,
  showFlight: () => undefined,
  hide: () => undefined,
  updatePlatform: () => undefined,
  updateFlight(s: Partial<FlightHud>) {
    Object.assign(hudState, s);
    hudUpdates++;
    renderHud();
  },
  toast(text: string, kind: ToastKind = 'info') {
    console.log('[toast]', text, kind);
    toastEl.textContent = text;
    toastEl.className = kind;
    toastEl.style.opacity = '1';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastEl.style.opacity = '0'), 900);
  },
  radio: (id) => console.log('[radio]', id),
  updateBoss(s: BossHud | null) {
    bossState = s ? { ...s } : null;
    renderHud();
  },
};

// ------------------------------------------------------------------ Entrées simulées (clavier)
const state: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
  boost: false,
  stickX: 0,
  stickY: 0,
};
const pauseCbs = new Set<() => void>();
/** Appui sur Tir pas encore lu (consumePress('fire')). */
let firePress = false;
function syncStick(): void {
  state.stickX = (state.right ? 1 : 0) - (state.left ? 1 : 0);
  state.stickY = (state.up ? 1 : 0) - (state.down ? 1 : 0);
}
function setKey(code: string, down: boolean): boolean {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      state.left = down;
      break;
    case 'ArrowRight':
    case 'KeyD':
      state.right = down;
      break;
    // Codes physiques comme le jeu : W en QWERTY = Z en AZERTY
    case 'ArrowUp':
    case 'KeyW':
      state.up = down;
      break;
    case 'ArrowDown':
    case 'KeyS':
      state.down = down;
      break;
    // Turbo : Espace ou Maj (comme le jeu)
    case 'Space':
    case 'ShiftLeft':
    case 'ShiftRight':
      state.boost = down;
      break;
    // Tir (comme le jeu) : J, X, F
    case 'KeyJ':
    case 'KeyX':
    case 'KeyF':
      state.fire = down;
      break;
    default:
      return false;
  }
  syncStick();
  return true;
}
window.addEventListener('keydown', (e) => {
  if ((e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'KeyF') && !e.repeat && !state.fire) firePress = true;
  if (setKey(e.code, true)) {
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyG') dev()?.win();
  else if (e.code === 'KeyL') dev()?.fail();
  else if (e.code === 'Digit1') dev()?.spawn?.('fighter', 70);
  else if (e.code === 'Digit2') dev()?.spawn?.('mine', 60);
  else if (e.code === 'Digit3') dev()?.spawn?.('swarm', 70);
  else if (e.code === 'KeyB') dev()?.boss?.start();
  else if (e.code === 'KeyV') dev()?.boss?.win();
  else if (e.code === 'KeyC' && fightRetry) restart(fightRetry);
});
window.addEventListener('keyup', (e) => {
  if (setKey(e.code, false)) e.preventDefault();
});
const input: InputApi = {
  state,
  consumePress: (a: InputAction) => {
    if (a !== 'fire' || !firePress) return false;
    firePress = false;
    return true;
  },
  clearPresses: () => {
    firePress = false;
  },
  setLayout: () => undefined,
  setTouchOptions: () => undefined,
  setTiltEnabled: () => undefined,
  requestTiltPermission: async () => true,
  calibrateTilt: () => undefined,
  onPause(cb: () => void) {
    pauseCbs.add(cb);
    return () => pauseCbs.delete(cb);
  },
};

// ------------------------------------------------------------------ Audio muet (journal console)
const audio: AudioApi = {
  unlock: () => undefined,
  sfx: (id, opts) => console.log('[sfx]', id, opts ?? ''),
  music: (id) => console.log('[music]', id),
  musicLevel: (n) => console.log('[musicLevel]', n),
  setMusicEnabled: () => undefined,
  setSfxEnabled: () => undefined,
  setHapticsEnabled: () => undefined,
  haptic: (p) => console.log('[haptic]', p),
  suspend: () => undefined,
  resume: () => undefined,
};

const settings: Settings = {
  music: true,
  sfx: true,
  haptics: true,
  tilt: false,
  unlockAll: false,
  touchSize: 1,
  touchOpacity: 1,
  leftHanded: false,
};

// ------------------------------------------------------------------ Partie
let handle: ModeHandle | null = null;
let paused = false;
/** Point de reprise du dernier échec en plein combat (C : « Réessayer le combat »), null sinon. */
let fightRetry: StartAt | null = null;

function dev(): Dev3d | undefined {
  return (window as unknown as { __xr3d?: Dev3d }).__xr3d;
}

function showEnd(text: string): void {
  endEl.textContent = text + `\n\nR : rejouer${fightRetry ? ' · C : réessayer le combat' : ''}`;
  endEl.style.display = 'flex';
}

const hooks: ModeHooks = {
  hud,
  input,
  audio,
  settings,
  loadout,
  onComplete(r: StageResult) {
    console.log('[complete]', JSON.stringify(r));
    fightRetry = null;
    showEnd(
      `Étape réussie ! ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}\n` +
        `Score ${r.score}${r.bossBonus ? ` (boss vaincu +${r.bossBonus})` : ''} · Portails ${r.gates}/${r.gatesTotal} · ${(r.timeMs / 1000).toFixed(1)} s\n` +
        `Cristaux ${r.crystals ?? 0}/${r.crystalsTotal ?? 0} · Ennemis abattus ${r.enemies ?? 0}`,
    );
  },
  onFail(reason: string, retry?: StartAt) {
    console.log('[fail]', reason, retry ? 'point de reprise du combat' : '');
    fightRetry = retry ?? null;
    showEnd(`Mission échouée : ${reason}`);
  },
};

/** Départ : `at` (« Réessayer le combat »), sinon ?boss=1 (début du combat), sinon le début du vol. */
function start(at: StartAt | null = null): void {
  endEl.style.display = 'none';
  paused = false;
  bossState = null;
  renderHud();
  const startAt = at ?? (atBoss ? { at: 'boss' as const } : null);
  if (startAt) hooks.startAt = startAt;
  else delete hooks.startAt;
  handle = startFlight(root, stage, hooks);
  const d = dev();
  if (d) {
    if (auto) d.autopilot(true);
    if (timeScale !== 1) d.timeScale(timeScale);
  }
}

function restart(at: StartAt | null = null): void {
  handle?.destroy();
  handle = null;
  fightRetry = null;
  start(at);
}

function togglePause(): void {
  if (!handle) return;
  paused = !paused;
  if (paused) handle.pause();
  else handle.resume();
  for (const cb of pauseCbs) cb();
}

renderHud();
start();
