// Contrats partagés entre tous les modules du jeu.
// Toute modification ici doit être répercutée dans chaque module qui les implémente.

import type { WeaponMods } from './weapons';

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
  /**
   * Cristaux ramassés (ajoutés à la réserve par recordResult), en 2D comme en vol (astéroïdes et ennemis
   * abattus) ; crystalsTotal : cristaux possibles de l'étape.
   */
  crystals?: number;
  crystalsTotal?: number;
  /** Ennemis éliminés (2D ; en vol : abattus par les tirs). */
  enemies?: number;
  /** Vols 3D uniquement. */
  gates?: number;
  gatesTotal?: number;
}

/** Bonus du mode plateforme : blocs `1` (vitesse), `2` (bouclier), `3` (cadence). Vitesse et cadence se cumulent. */
export type PowerUpKind = 'speed' | 'rapid' | 'shield';

// ---------------------------------------------------------------- Armes et équipement

/** Armes de Kaï ; fiches et ordre d'affichage dans core/weapons.ts (WEAPONS, WEAPON_IDS). */
export type WeaponId = 'laser' | 'machinegun' | 'shotgun' | 'rifle';

/** Équipement du joueur, gardé d'un niveau à l'autre (SaveData.loadout). */
export interface Loadout {
  /** Arme équipée, toujours présente dans owned. */
  equipped: WeaponId;
  /** Armes possédées, dans l'ordre de WEAPON_IDS ; 'laser' toujours. */
  owned: WeaponId[];
  /** Compétences apprises. */
  skills: {
    /** Second saut en l'air (plus aucun bloc ne le donne). */
    doubleJump: boolean;
  };
}

// ---------------------------------------------------------------- Hangar (core/hangar.ts)

/** Caractéristiques améliorables d'une arme ; mêmes clés que WeaponMods (core/weapons.ts). */
export type UpgradeStat = 'damage' | 'fireRate' | 'range' | 'cooling';

/** Niveaux d'amélioration achetés pour une arme : 0 (fiche d'origine) à 3, par caractéristique. */
export type WeaponUpgrades = Record<UpgradeStat, number>;

/** Membres d'équipage secourus (étape 4) : Tess (mécanicienne, monde 1), Mira (biologiste, monde 3). */
export type CrewId = 'tess' | 'mira';

/** Modules de la Comète achetés au hangar (niveaux). */
export interface ShipModules {
  /** Canon : 0 = canon léger (de série), 1 = mitrailleuse achetée, 2 et 3 = ses améliorations. */
  gun: number;
  /** Bouclier renforcé : 0 à 2. */
  shield: number;
  /** Turbo : 0 à 2. */
  boost: number;
}

/** Effets des modules de la Comète pour une partie (shipLoadout de core/hangar.ts). */
export interface ShipLoadout {
  /** Canon : 0 = canon léger, 1 = mitrailleuse, 2 et 3 = améliorée (fiches : core/shipGuns.ts). */
  gunLevel: number;
  /** Boucliers au départ et au maximum : 3 + niveau du bouclier renforcé (3 à 5). */
  maxShields: number;
  /** Niveau du turbo, 0 à 2. */
  boostLevel: number;
  /** Multiplie la vidange de la jauge (BOOST_DRAIN de game3d/flight.ts) : 1, 0,8, 0,667 (jauge qui dure ×1,25, ×1,5). */
  boostDrainMul: number;
  /** Multiplie la recharge de la jauge (BOOST_FILL) : 1, 1,25, 1,5. */
  boostFillMul: number;
}

/**
 * Équipement EFFECTIF d'une partie (ModeHooks.loadout) : sauvegarde, mode test et arme de la session,
 * résolu par playLoadout (core/save.ts). Jamais enregistré.
 */
export interface PlayLoadout extends Loadout {
  /** Multiplicateurs de CHAQUE arme (améliorations achetées ; 1 partout sans achat, même en mode test). */
  mods: Record<WeaponId, WeaponMods>;
  /** Cœurs de Kaï au départ, au point de contrôle et à la réapparition : 3 + cœurs supplémentaires (3 à 5). */
  maxHearts: number;
  ship: ShipLoadout;
}

// ---------------------------------------------------------------- HUD

export interface PlatformHud {
  hearts: number;
  maxHearts: number;
  lives: number;
  crystals: number;
  crystalsTotal: number;
  /** Arme équipée (icône de la jauge de chauffe). */
  weapon: WeaponId;
  /** Chauffe de l'arme équipée, 0..1. */
  heat: number;
  overheated: boolean;
  /** Bonus de vitesse : temps restant 0..1 (0 = inactif), par pas de 0,02. */
  speedLeft: number;
  /** Bonus de cadence : temps restant 0..1 (0 = inactif), par pas de 0,02. */
  rapidLeft: number;
  /** Bouclier porté (dure jusqu'au prochain coup). */
  shield: boolean;
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
  /** Canon de la Comète (icône et graduations de la jauge) : 0 canon léger, 1 à 3 mitrailleuse. */
  gunLevel: number;
  /** Chauffe du canon, 0..1. */
  heat: number;
  overheated: boolean;
  /** Cristaux ramassés pendant ce vol. */
  crystals: number;
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

/**
 * Appuis mémorisés (voir consumePress).
 * interact : front montant de « haut sans ← → » (clavier + stick 2D fusionnés) : stick qui entre dans le
 * secteur haut (pas une diagonale), ↑ / W (Z en AZERTY) pressé sans ← → tenus, ou ← → relâché pendant que
 * haut reste tenu ; ignoré si Tir est maintenu à cet instant. Sert aux portes (jeu 2D).
 */
export type InputAction = 'jump' | 'fire' | 'boost' | 'pause' | 'interact';
export type TouchLayout = 'none' | 'platform' | 'flight';

/** État courant des commandes, fusion clavier + tactile + inclinaison. */
export interface InputState {
  /**
   * Directions : clavier, stick 2D à 8 directions (diagonales basses transmises telles quelles ; le jeu 2D
   * n'accroupit que sur ↓ seul), et en vol l'axe analogique au-delà de 0,5.
   */
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Maintenu (pour le saut à hauteur variable). */
  jump: boolean;
  fire: boolean;
  boost: boolean;
  /**
   * Axe horizontal -1 (gauche) .. 1 (droite). Analogique en vol (joystick, inclinaison) ; ailleurs (clavier,
   * stick 2D) : -1 / 0 / 1, diagonales ramenées à ±0,707.
   */
  stickX: number;
  /** Axe vertical -1 (bas) .. 1 (haut), mêmes règles que stickX. */
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
  /** Taille, opacité et côté des commandes tactiles ; appliqué tout de suite, même en partie. */
  setTouchOptions(opts: TouchOptions): void;
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
  // Tirs : un son par arme (WeaponDef.sfx), le laser garde 'laser'.
  | 'laser'
  | 'machinegun'
  | 'shotgun'
  | 'rifle'
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
  | 'lose'
  // Hangar : achat confirmé.
  | 'buy'
  // Combat en vol (3b) : tir du canon léger, de la mitrailleuse (~10 par seconde : très court), orbe ennemie
  // lancée, ennemi touché, ennemi détruit ou mine qui explose. Cristal ramassé en vol : 'crystal'.
  | 'shipGun'
  | 'shipMachinegun'
  | 'enemyOrb'
  | 'enemyHit'
  | 'enemyBlast';

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
  /** Commandes tactiles : taille du stick et des boutons (0 petit, 1 moyen = taille d'origine, 2 grand). */
  touchSize: 0 | 1 | 2;
  /** Commandes tactiles : opacité (0 discret, 1 moyen = opacité d'origine, 2 opaque). */
  touchOpacity: 0 | 1 | 2;
  /** Mode gaucher : stick à droite, boutons à gauche (en 2D comme en vol). */
  leftHanded: boolean;
  /**
   * Tir manuel en vol : bouton TIR à côté de TURBO, la Comète ne tire que sur appui. Sinon (par défaut), tir
   * automatique sur la cible devant elle. Le clavier (J, X, F) tire dans les deux modes.
   */
  manualFire: boolean;
}

/**
 * Réglages des commandes tactiles passés aux entrées (un Settings complet convient aussi). manualFire : bouton
 * TIR affiché en vol.
 */
export type TouchOptions = Pick<Settings, 'touchSize' | 'touchOpacity' | 'leftHanded' | 'manualFire'>;

export interface ModeHooks {
  hud: HudApi;
  input: InputApi;
  audio: AudioApi;
  settings: Readonly<Settings>;
  /**
   * Équipement EFFECTIF de la partie, déjà résolu par l'interface (playLoadout de core/save.ts : mode test,
   * arme de la session, améliorations, cœurs max, modules de la Comète). Fixe pendant la partie ; les modes
   * ne le modifient pas.
   */
  loadout: Readonly<PlayLoadout>;
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

/**
 * Sauvegarde, version 2 (hangar). Une version 1 est migrée au chargement (progression, scores, réglages et
 * loadout gardés ; le reste à sa valeur par défaut) ; une autre version est remise à zéro.
 */
export interface SaveData {
  version: 2;
  /** Index de la dernière étape débloquée. */
  unlocked: number;
  best: Record<string, BestScore>;
  settings: Settings;
  /** Armes et compétences (absent des anciennes sauvegardes v1 : valeur par défaut). */
  loadout: Loadout;
  /** Réserve de cristaux à dépenser au hangar (entier ≥ 0). */
  crystals: number;
  /** Améliorations achetées, pour chacune des 4 armes (0 partout pour une arme non possédée). */
  upgrades: Record<WeaponId, WeaponUpgrades>;
  /** Modules de la Comète. */
  ship: ShipModules;
  /** Cœurs supplémentaires de Kaï : 0 à 2. */
  extraHearts: number;
  /** Équipage secouru, dans l'ordre de CREW_IDS (core/hangar.ts). */
  crew: CrewId[];
  /** Plans d'armes récupérés, dans l'ordre de WEAPON_IDS ; jamais 'laser' (il n'en a pas besoin). */
  blueprints: WeaponId[];
}
