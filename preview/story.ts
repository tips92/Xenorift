import '@fontsource/orbitron/800.css';
import '@fontsource/exo-2/400.css';
import '@fontsource/exo-2/600.css';
import { createAudio } from '../src/audio';
import { createBubble } from '../src/story/bubble';
import { PROLOGUE_LINES } from '../src/core/story';
import { type CutscenePlayer, DEFAULT_LIBERATION, playCutscene } from '../src/story/player';
import { ensureKaiSprites } from '../src/game2d/art/kaiPng';
import { PORTRAIT_FRAMES, PORTRAIT_SIZE, drawPortrait } from '../src/story/portraits';
import type { CutsceneAudio, CutsceneCue, CutsceneId, LiberationParams, Mood, Speaker } from '../src/story/types';
import { cutsceneAudio } from '../src/ui/screens/cutscene';

// Page d'aperçu des cinématiques (outil de développement, hors jeu et hors typecheck).
// Paramètres : ?cut=prologue|liberation &t=<s> (départ à cet instant) &hold=1 (figé sur cet instant : captures
// reproductibles) &ui=0 (sans panneau) &sound=1 (repères joués avec les effets du jeu, après un premier toucher)
// &world=&guardian=&skill= (libération). Panneau : choix, curseur de temps, pause, Passer, journal des repères.
// Crochet de test : window.__story (voir tests/e2e/scenarios/story-preview.mjs).

const params = new URLSearchParams(location.search);
const root = document.getElementById('root') as HTMLElement;
const panel = document.getElementById('panel') as HTMLElement;
if (params.get('ui') === '0') panel.hidden = true;

const sound = params.get('sound') === '1' ? createAudio() : null;
if (sound) window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
/** Sons du jeu (ui/screens/cutscene.ts : CUE_SFX, bips lumaBip à la hauteur de la radio). */
const gameSound: CutsceneAudio | null = sound ? cutsceneAudio(sound) : null;

interface CueLog {
  c: CutsceneCue;
  t: number;
  at: number;
}

const story = {
  ready: false,
  cut: 'prologue' as CutsceneId,
  handle: null as CutscenePlayer | null,
  cues: [] as CueLog[],
  result: null as null | 'ended' | 'skipped',
  start,
  destroy(): void {
    if (story.handle) story.handle.destroy();
    story.handle = null;
  },
  info() {
    const h = story.handle;
    const b = h ? h.bubble : null;
    const el = document.querySelector('.cs-bubble');
    return {
      cut: story.cut,
      t: h ? h.time : -1,
      duration: h ? h.duration : 0,
      paused: h ? h.paused : null,
      state: h ? h.state : null,
      result: story.result,
      typing: b ? b.typing : null,
      bubbleVisible: b ? b.visible : null,
      speaker: el ? (el as HTMLElement).dataset.speaker : null,
      mood: el ? (el as HTMLElement).dataset.mood : null,
      letters: el ? el.querySelectorAll('.xr-bubble-text > span').length : 0,
      lettersOn: el ? el.querySelectorAll('.xr-bubble-text > span.is-on').length : 0,
      cues: story.cues.length,
    };
  },
};
(window as unknown as { __story: typeof story }).__story = story;

function liberationParams(): LiberationParams {
  return {
    world: Number(params.get('world')) || DEFAULT_LIBERATION.world,
    guardianName: params.get('guardian') || DEFAULT_LIBERATION.guardianName,
    skillLabel: params.get('skill') || DEFAULT_LIBERATION.skillLabel,
  };
}

function start(cut: CutsceneId, t = 0, hold = false): CutscenePlayer {
  story.destroy();
  story.cut = cut;
  story.cues = [];
  story.result = null;
  const t0 = performance.now();
  const note = (c: CutsceneCue): void => {
    story.cues.push({ c, t: Math.round((story.handle ? story.handle.time : t) * 1000) / 1000, at: Math.round(performance.now() - t0) });
  };
  const h = playCutscene(root, cut, {
    audio: {
      cue(c) {
        note(c);
        if (gameSound) gameSound.cue(c);
        renderLog();
      },
      // Bips notés comme des repères 'bip' (journal, story-preview), joués comme dans le jeu.
      bip(who, mood, letter) {
        note('bip');
        if (gameSound && gameSound.bip) gameSound.bip(who, mood, letter);
        renderLog();
      },
    },
    params: cut === 'liberation' ? liberationParams() : undefined,
    startAtS: t,
  });
  story.handle = h;
  if (hold) h.pause();
  h.done.then((r) => {
    if (story.handle === h) story.result = r;
    renderLog();
  });
  renderPanel();
  return h;
}

// ---------------------------------------------------------------- Panneau

let slider: HTMLInputElement | null = null;
let clock: HTMLElement | null = null;
let log: HTMLElement | null = null;

function button(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function renderPanel(): void {
  if (panel.hidden) return;
  panel.replaceChildren();
  const h = story.handle;
  const dur = h ? h.duration : 1;
  panel.append(
    button('Prologue', () => start('prologue')),
    button('Libération', () => start('liberation')),
    button('Pause', () => story.handle && story.handle.pause()),
    button('Reprendre', () => story.handle && story.handle.resume()),
    button('Passer', () => story.handle && story.handle.skip()),
    button('Détruire', () => {
      story.destroy();
      renderLog();
    }),
  );
  slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(dur);
  slider.step = '0.1';
  slider.value = '0';
  slider.addEventListener('change', () => start(story.cut, Number(slider?.value) || 0, true));
  clock = document.createElement('div');
  log = document.createElement('div');
  log.id = 'log';
  panel.append(slider, clock, log);
  renderLog();
}

function renderLog(): void {
  if (!log) return;
  const lines = story.cues.filter((c) => c.c !== 'bip').map((c) => `${c.t.toFixed(2).padStart(6)} s  ${c.c}`);
  const bips = story.cues.filter((c) => c.c === 'bip').length;
  log.textContent = `${lines.join('\n')}\n(bips : ${bips})${story.result ? `\nfin : ${story.result}` : ''}`;
}

function tickPanel(): void {
  const h = story.handle;
  if (clock) clock.textContent = h ? `${h.time.toFixed(2)} / ${h.duration.toFixed(1)} s  ${h.state}${h.paused ? ' (pause)' : ''}` : 'détruite';
  if (slider && h && document.activeElement !== slider) slider.value = String(h.time);
  window.setTimeout(tickPanel, 100);
}

// ---------------------------------------------------------------- Planche des portraits (?view=portraits)

const SPEAKERS: Speaker[] = ['luma', 'tess', 'kai'];
const MOODS: Mood[] = ['neutral', 'amused', 'worried', 'scrambled'];

/** Toutes les humeurs et images de chaque portrait, en grand, puis une bulle par personnage. */
function portraitSheet(): void {
  panel.hidden = true;
  const cell = Number(params.get('cell')) || 104;
  const gap = 8;
  const blockW = PORTRAIT_FRAMES * (cell + gap) + 24;
  const cnv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = SPEAKERS.length * blockW + 16;
  const H = MOODS.length * (cell + gap) + 40;
  cnv.width = W * dpr;
  cnv.height = H * dpr;
  cnv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
  const ctx = cnv.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#b8b0e0';
  ctx.font = '12px "Exo 2", sans-serif';
  SPEAKERS.forEach((sp, si) => {
    const x0 = 16 + si * blockW;
    ctx.fillText(`${sp} — images : repos, parle A, parle B, clignement`, x0, 20);
    MOODS.forEach((mood, mi) => {
      for (let f = 0; f < PORTRAIT_FRAMES; f++) {
        ctx.save();
        ctx.translate(x0 + f * (cell + gap), 30 + mi * (cell + gap));
        ctx.scale(cell / PORTRAIT_SIZE, cell / PORTRAIT_SIZE);
        drawPortrait(ctx, sp, mood, f);
        ctx.restore();
      }
      ctx.fillStyle = '#b8b0e0';
      ctx.fillText(mood, x0 + PORTRAIT_FRAMES * (cell + gap) - 4, 30 + mi * (cell + gap) + cell / 2);
    });
  });
  root.append(cnv);
  // Bulles réelles, texte complet.
  const host = document.createElement('div');
  host.style.cssText = `position:absolute;left:0;right:0;top:${H + 6}px;bottom:0`;
  root.append(host);
  const P = PROLOGUE_LINES;
  const lines: [Speaker, Mood, string, string][] = [
    [P.alive.speaker, P.alive.mood, P.alive.text, 'left:16px;top:0'],
    ['tess', 'worried', 'Tu es venu me chercher ? Attention, la porte grince !', 'left:16px;top:100px'],
    [P.kai.speaker, P.kai.mood, P.kai.text, 'right:16px;top:100px'],
    [P.onFoot.speaker, P.onFoot.mood, P.onFoot.text, 'right:16px;top:0;max-width:560px'],
  ];
  for (const [sp, mood, text, pos] of lines) {
    const b = createBubble(host, {});
    b.el.style.cssText += pos;
    void b.say(sp, mood, text);
    b.finish();
    b.pause();
  }
  story.ready = true;
}

// ---------------------------------------------------------------- Départ (polices chargées : bandeaux nets)

const cut: CutsceneId = params.get('cut') === 'liberation' ? 'liberation' : 'prologue';
const t0 = Math.max(0, Number(params.get('t')) || 0);
const hold = params.get('hold') === '1';
Promise.all([
  document.fonts.load("800 20px 'Orbitron'"),
  document.fonts.load("600 16px 'Exo 2'"),
  document.fonts.load("400 16px 'Exo 2'"),
  ensureKaiSprites(),
])
  .catch(() => undefined)
  .then(() => {
    if (params.get('view') === 'portraits') {
      portraitSheet();
      return;
    }
    start(cut, t0, hold);
    story.ready = true;
    if (!panel.hidden) tickPanel();
  });
