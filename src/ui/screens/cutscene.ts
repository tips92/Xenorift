import type { AudioApi, SfxId } from '../../core/types';
import type { CutsceneAudio, CutsceneCue, CutscenePlayer } from '../../story';
import type { StoryPlay } from '../flow';
import { voicePitch } from '../radio';
import type { UiCtx } from '../services';
import { screenRoot, type Screen } from './common';

// Écran d'une cinématique (phase 'story' de App.ts) : le lecteur de src/story (canvas 2D plein cadre, bulle, bouton
// Passer) et la traduction de ses repères sonores en effets (`cutsceneAudio`, reprise par preview/story.ts). Le
// module des cinématiques est chargé par import dynamique (App.ts) : ici, types seulement. La musique ('story') et
// les marques « vues » sont l'affaire d'App.ts.

/** Module des cinématiques (src/story/index.ts). */
export type StoryModule = typeof import('../../story');

interface CueSound {
  readonly id: SfxId;
  readonly volume?: number;
  readonly pitch?: number;
  /** Vibration (ms), selon le réglage. */
  readonly haptic?: number;
}

/** Repères des scènes (story/scenes) → effets ; 'bip' : voix de la bulle (lumaBip, hauteur selon la lettre). */
export const CUE_SFX: Readonly<Record<Exclude<CutsceneCue, 'bip'>, CueSound>> = {
  // Le signal inconnu, capté par LUMA.
  signal: { id: 'checkpoint', volume: 0.5, pitch: 1.5 },
  // La Faille s'ouvre, la Comète y est aspirée.
  rift: { id: 'warp', volume: 0.8 },
  whoosh: { id: 'boost', volume: 0.7 },
  impact: { id: 'crash', volume: 0.7, haptic: 60 },
  // Rétrofusées de la Comète qui se pose.
  landing: { id: 'boost', volume: 0.5, pitch: 0.6 },
  // Le Vide : mondes qui s'éteignent (prologue), ombre qui quitte le gardien (libération).
  vide: { id: 'lose', volume: 0.5, pitch: 0.7 },
  // Les couleurs reviennent.
  heal: { id: 'liberation' },
  // Le noyau confié à Kaï.
  core: { id: 'crystal', pitch: 0.8 },
  skill: { id: 'skill', haptic: 40 },
  takeoff: { id: 'takeoff' },
};

/** Sons d'une cinématique sur `audio` (jeu et page d'aperçu) : repères de CUE_SFX, bips à la hauteur de la radio. */
export function cutsceneAudio(audio: AudioApi): CutsceneAudio {
  /** Options des effets (objets réutilisés : un bip toutes les 125 ms). */
  const sfxOpts: { volume: number; pitch: number } = { volume: 1, pitch: 1 };
  const bipOpts = { pitch: 1 };
  return {
    cue(c) {
      if (c === 'bip') {
        audio.sfx('lumaBip');
        return;
      }
      const s = CUE_SFX[c];
      sfxOpts.volume = s.volume ?? 1;
      sfxOpts.pitch = s.pitch ?? 1;
      audio.sfx(s.id, sfxOpts);
      if (s.haptic) audio.haptic(s.haptic);
    },
    bip(who, mood, letter) {
      bipOpts.pitch = voicePitch(who, mood, letter);
      audio.sfx('lumaBip', bipOpts);
    },
  };
}

export interface CutsceneScreen extends Screen {
  readonly play: StoryPlay;
  /** Lance la cinématique, une seule fois (écran déjà dans le DOM : le lecteur prend sa taille). */
  start(): CutscenePlayer;
}

export function createCutsceneScreen(ctx: UiCtx, story: StoryModule, play: StoryPlay): CutsceneScreen {
  const root = screenRoot('cutscene');
  let player: CutscenePlayer | null = null;
  const audio = cutsceneAudio(ctx.audio);

  // Passer (<button class="cs-skip"> du lecteur) : le son des boutons de l'interface (capture : avant que le
  // lecteur ne s'arrête).
  root.addEventListener(
    'click',
    (e) => {
      const skip = e.target instanceof Element && e.target.closest('.cs-skip');
      if (!skip || !player || player.state !== 'playing') return;
      ctx.audio.sfx('click', { pitch: 0.85 });
      ctx.audio.haptic(8);
    },
    true,
  );

  return {
    name: 'cutscene',
    el: root,
    play,
    start(): CutscenePlayer {
      if (!player) player = story.playCutscene(root, play.id, play.params ? { audio, params: play.params } : { audio });
      return player;
    },
    dispose(): void {
      player?.destroy();
    },
  };
}
