// Module des cinématiques et de la bulle de LUMA (docs/plans/04-monde-1.md, points 20 et 21). À charger par
// import dynamique (comme les modes de jeu) : il n'alourdit pas l'accueil. N'importe du jeu 2D que des dessins.

export type { CutsceneAudio, CutsceneCue, CutsceneHandle, CutsceneId, LiberationParams, Mood, Speaker } from './types';
export { playCutscene, DEFAULT_LIBERATION, type CutsceneOptions, type CutscenePlayer } from './player';
export { createBubble, typingDuration, BUBBLE_CPS, BIP_GAP_S, type Bubble, type BubbleOptions } from './bubble';
export { drawPortrait, renderPortraitStrip, PORTRAIT_SIZE, PORTRAIT_FRAME, PORTRAIT_FRAMES, SPEAKER_NAME } from './portraits';
export { ensureStoryStyles } from './styles';
export { PROLOGUE_LINES, LIBERATION_LINES, LIBERATION_BANNERS } from '../core/story';
export type { Line } from './scenes/common';
