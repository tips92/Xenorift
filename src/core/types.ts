// Contrats partagés entre tous les modules du jeu.
// Toute modification ici doit être répercutée dans chaque module qui les implémente.

export type StageKind = 'platform' | 'flight';
export type ThemeId = 'jungle' | 'moon';
export type CourseId = 'nebula' | 'asteroids';

/** Une étape de la campagne (niveau 2D ou vol 3D). */
export interface StageDef {
  /** Identifiant stable utilisé dans la sauvegarde : 'j1' | 'f1' | 'm1' | 'f2'. */
  id: string;
  /** Ordre dans la campagne, à partir de 0. */
  index: number;
  kind: StageKind;
  /** Numéro de monde affiché (1, 2…). */
  world: number;
  title: string;
  subtitle: string;
  /** Conseil d'une ligne affiché sur la carte d'introduction. */
  hint: string;
  /** platform : clé passée à getLevel() ; flight : un CourseId. */
  levelId: string;
  /** Thème visuel (pour un vol : la planète que l'on quitte). */
  theme: ThemeId;
}

export interface StageResult {
  stageId: string;
  score: number;
  stars: 1 | 2 | 3;
  timeMs: number;
  /** Niveaux 2D uniquement. */
  crystals?: number;
  crystalsTotal?: number;
  enemies?: number;
  /** Vols 3D uniquement. */
  gates?: number;
  gatesTotal?: number;
}

export type PowerUpKind = 'triple' | 'shield' | 'doublejump';

// ---------------------------------------------------------------- HUD

export interface PlatformHud {
  hearts: number;
  maxHearts: number;
  lives: number;
  crystals: number;
  crystalsTotal: number;
  /** Chauffe du laser, 0..1. */
  heat: number;
  overheated: boolean;
  /** Bonus actif (le bouclier dure jusqu'au prochain coup). */
  power: PowerUpKind | null;
  /** Temps restant du bonus, 0..1 (1 pour le bouclier). */
  powerLeft: number;
}

export interface FlightHud {
  /** Secondes restantes au chrono. */
  timeLeft: number;
  gates: number;
  gatesTotal: number;
  shield: number;
  maxShield: number;
  /** Jauge de turbo, 0..1. */
  boost: number;
  /** Avancement dans le parcours, 0..1. */
  progress: number;
}

export type ToastKind = 'info' | 'good' | 'bad';

export interface HudApi {
  showPlatform(): void;
  showFlight(): void;
  hide(): void;
  updatePlatform(s: Partial<PlatformHud>): void;
  updateFlight(s: Partial<FlightHud>): void;
  /** Court message centré en haut de l'écran (ex. « Point de contrôle ! »). */
  toast(text: string, kind?: ToastKind): void;
}

// ---------------------------------------------------------------- Entrées

export type InputAction = 'jump' | 'fire' | 'boost' | 'pause';
export type TouchLayout = 'none' | 'platform' | 'flight';

/** État courant des commandes, fusion clavier + tactile + inclinaison. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Maintenu (pour le saut à hauteur variable). */
  jump: boolean;
  fire: boolean;
  boost: boolean;
  /** Axe horizontal -1 (gauche) .. 1 (droite). */
  stickX: number;
  /** Axe vertical -1 (bas) .. 1 (haut). */
  stickY: number;
}

export interface InputApi {
  readonly state: Readonly<InputState>;
  /** Vrai une seule fois par appui (front montant mémorisé jusqu'à consommation). */
  consumePress(action: InputAction): boolean;
  /** Oublie les appuis en attente (à appeler au démarrage d'une étape). */
  clearPresses(): void;
  /** Change les contrôles tactiles affichés. */
  setLayout(layout: TouchLayout): void;
  setTiltEnabled(on: boolean): void;
  /** iOS exige une autorisation déclenchée par un geste ; résout true sur Android et le web. */
  requestTiltPermission(): Promise<boolean>;
  /** Prend la position actuelle du téléphone comme position neutre. */
  calibrateTilt(): void;
  /** Appelé quand le joueur demande la pause (Échap / P). Renvoie une fonction de désabonnement. */
  onPause(cb: () => void): () => void;
}

// ---------------------------------------------------------------- Audio

export type SfxId =
  | 'click'
  | 'jump'
  | 'doubleJump'
  | 'laser'
  | 'laserHit'
  | 'overheat'
  | 'stomp'
  | 'enemyDie'
  | 'armorClank'
  | 'crystal'
  | 'bump'
  | 'powerup'
  | 'shieldBreak'
  | 'hurt'
  | 'death'
  | 'checkpoint'
  | 'takeoff'
  | 'gate'
  | 'gateMiss'
  | 'boost'
  | 'crash'
  | 'warp'
  | 'win'
  | 'lose';

export type MusicId = 'menu' | 'jungle' | 'moon' | 'nebula' | 'asteroids';

export interface AudioApi {
  /** À appeler depuis un geste utilisateur (débloque l'AudioContext). */
  unlock(): void;
  sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void;
  /** Lance une musique en boucle (fondu), ou null pour couper. Rejouer la même musique ne la relance pas. */
  music(id: MusicId | null): void;
  setMusicEnabled(on: boolean): void;
  setSfxEnabled(on: boolean): void;
  setHapticsEnabled(on: boolean): void;
  /** Vibration courte (Android ; ignoré ailleurs). */
  haptic(pattern: number | number[]): void;
  /** Application en arrière-plan / retour. */
  suspend(): void;
  resume(): void;
}

// ---------------------------------------------------------------- Modes de jeu

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  /** Pilotage du vaisseau par inclinaison du téléphone. */
  tilt: boolean;
  /** Mode test : toutes les étapes sont jouables. */
  unlockAll: boolean;
}

export interface ModeHooks {
  hud: HudApi;
  input: InputApi;
  audio: AudioApi;
  settings: Readonly<Settings>;
  /** Étape réussie. À appeler une seule fois, après l'animation de fin. */
  onComplete(result: StageResult): void;
  /** Étape perdue (plus de vies, chrono à zéro, vaisseau détruit). */
  onFail(reason: string): void;
}

/** Poignée renvoyée par un mode démarré. Après onComplete/onFail, l'interface appelle destroy(). */
export interface ModeHandle {
  pause(): void;
  resume(): void;
  /** Libère tout ; le conteneur doit pouvoir accueillir un autre mode ensuite. */
  destroy(): void;
}

export type StartMode = (container: HTMLElement, stage: StageDef, hooks: ModeHooks) => ModeHandle;

// ---------------------------------------------------------------- Sauvegarde

export interface BestScore {
  score: number;
  stars: 1 | 2 | 3;
}

export interface SaveData {
  version: 1;
  /** Index de la dernière étape débloquée. */
  unlocked: number;
  best: Record<string, BestScore>;
  settings: Settings;
}
