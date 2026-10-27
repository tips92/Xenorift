import type { AudioApi } from '../core/types';
import { AudioEngine } from './engine';

// Sons et musiques générés par code (Web Audio API), aucun fichier audio.
// Effets : src/audio/sfx.ts — musiques : src/audio/tracks.ts — moteur : src/audio/engine.ts.

/**
 * Crée le moteur audio. L'AudioContext n'est créé qu'au premier unlock() (ou au premier geste
 * de l'utilisateur) ; avant cela, sfx() est ignoré et music() mémorise le morceau demandé.
 */
export function createAudio(): AudioApi {
  return new AudioEngine();
}
