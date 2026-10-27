import type {
  AudioApi,
  HudApi,
  InputAction,
  InputApi,
  InputState,
  MusicId,
  SfxId,
  Settings,
  TouchLayout,
} from '../core/types';

// Enveloppes protégées autour de l'audio et des entrées : une erreur dans un module ne doit
// jamais bloquer l'interface (écran blanc). Si la création échoue, un substitut silencieux est utilisé.

/** Contexte partagé par les écrans. */
export interface UiCtx {
  readonly audio: AudioApi;
  readonly input: InputApi;
  readonly hud: HudApi;
  /** Réglages courants (objet vivant, mis à jour à chaque changement). */
  readonly settings: Readonly<Settings>;
  /** Enregistre et applique immédiatement un changement de réglages. */
  setSettings(patch: Partial<Settings>): void;
}

const warned = new Set<string>();

function warn(where: string, err: unknown): void {
  if (warned.has(where)) return;
  warned.add(where);
  console.error(`[ui] ${where}`, err);
}

export function createSafeAudio(make: () => AudioApi): AudioApi {
  let a: AudioApi | null = null;
  try {
    a = make();
  } catch (err) {
    warn('createAudio (son désactivé)', err);
  }
  return {
    unlock(): void {
      if (!a) return;
      try {
        a.unlock();
      } catch (err) {
        warn('audio.unlock', err);
      }
    },
    sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void {
      if (!a) return;
      try {
        a.sfx(id, opts);
      } catch (err) {
        warn('audio.sfx', err);
      }
    },
    music(id: MusicId | null): void {
      if (!a) return;
      try {
        a.music(id);
      } catch (err) {
        warn('audio.music', err);
      }
    },
    setMusicEnabled(on: boolean): void {
      if (!a) return;
      try {
        a.setMusicEnabled(on);
      } catch (err) {
        warn('audio.setMusicEnabled', err);
      }
    },
    setSfxEnabled(on: boolean): void {
      if (!a) return;
      try {
        a.setSfxEnabled(on);
      } catch (err) {
        warn('audio.setSfxEnabled', err);
      }
    },
    setHapticsEnabled(on: boolean): void {
      if (!a) return;
      try {
        a.setHapticsEnabled(on);
      } catch (err) {
        warn('audio.setHapticsEnabled', err);
      }
    },
    haptic(pattern: number | number[]): void {
      if (!a) return;
      try {
        a.haptic(pattern);
      } catch (err) {
        warn('audio.haptic', err);
      }
    },
    suspend(): void {
      if (!a) return;
      try {
        a.suspend();
      } catch (err) {
        warn('audio.suspend', err);
      }
    },
    resume(): void {
      if (!a) return;
      try {
        a.resume();
      } catch (err) {
        warn('audio.resume', err);
      }
    },
  };
}

const IDLE_STATE: InputState = {
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

export function createSafeInput(make: () => InputApi): InputApi {
  let a: InputApi | null = null;
  try {
    a = make();
  } catch (err) {
    warn('createInput (commandes indisponibles)', err);
  }
  return {
    get state(): Readonly<InputState> {
      return a ? a.state : IDLE_STATE;
    },
    consumePress(action: InputAction): boolean {
      if (!a) return false;
      try {
        return a.consumePress(action);
      } catch (err) {
        warn('input.consumePress', err);
        return false;
      }
    },
    clearPresses(): void {
      if (!a) return;
      try {
        a.clearPresses();
      } catch (err) {
        warn('input.clearPresses', err);
      }
    },
    setLayout(layout: TouchLayout): void {
      if (!a) return;
      try {
        a.setLayout(layout);
      } catch (err) {
        warn('input.setLayout', err);
      }
    },
    setTiltEnabled(on: boolean): void {
      if (!a) return;
      try {
        a.setTiltEnabled(on);
      } catch (err) {
        warn('input.setTiltEnabled', err);
      }
    },
    requestTiltPermission(): Promise<boolean> {
      if (!a) return Promise.resolve(false);
      try {
        // Appel synchrone : doit rester dans la pile du geste utilisateur (iOS).
        return a.requestTiltPermission().catch((err: unknown) => {
          warn('input.requestTiltPermission', err);
          return false;
        });
      } catch (err) {
        warn('input.requestTiltPermission', err);
        return Promise.resolve(false);
      }
    },
    calibrateTilt(): void {
      if (!a) return;
      try {
        a.calibrateTilt();
      } catch (err) {
        warn('input.calibrateTilt', err);
      }
    },
    onPause(cb: () => void): () => void {
      if (!a) return () => undefined;
      try {
        return a.onPause(cb);
      } catch (err) {
        warn('input.onPause', err);
        return () => undefined;
      }
    },
  };
}
