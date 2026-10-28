import { type Ctx, circle, ellipse, fillOutlined, glow, glowDot, linGrad, rgba, rimLight, rng, roundRect, smoothPoly, softDot, sphereGrad } from '../game2d/art/util';
import type { Mood, Speaker } from './types';

// Portraits de la bulle de dialogue, dessinés par code sur un carré de 96 px (fond compris) : LUMA (visage
// holographique, 4 humeurs, « scrambled » = brouillée par le Vide), Tess (mécanicienne) et Kaï (casque, yeux
// devinés derrière la visière). Images : voir PORTRAIT_FRAME. Dessin coûteux (dégradés, halos) : on le
// pré-rend en planche (renderPortraitStrip) et on n'affiche ensuite que des copies.

/** Côté du carré de dessin (unités de drawPortrait). */
export const PORTRAIT_SIZE = 96;

/** Images d'une planche : bouche fermée, deux bouches qui parlent, clignement. */
export const PORTRAIT_FRAME = { idle: 0, talkA: 1, talkB: 2, blink: 3 } as const;
export const PORTRAIT_FRAMES = 4;

/** Nom affiché dans la bulle. */
export const SPEAKER_NAME: Record<Speaker, string> = { luma: 'LUMA', tess: 'TESS', kai: 'KAÏ' };

const OUT = '#120c24';
const CYAN = '#3ff0ff';
const MAGENTA = '#ff4fd8';
const VOID_RED = '#ff3a4a';
const S = PORTRAIT_SIZE;

/**
 * Dessine le portrait de `speaker` (humeur `mood`) sur le carré (0, 0)-(96, 96) du repère courant : mettre
 * l'échelle avant (ctx.scale(px / 96, px / 96)). `frame` : PORTRAIT_FRAME (0 repos, 1-2 parle, 3 clignement) ;
 * pour « scrambled », il change aussi les bandes du brouillage.
 */
export function drawPortrait(ctx: Ctx, speaker: Speaker, mood: Mood, frame: number): void {
  const f = ((frame % PORTRAIT_FRAMES) + PORTRAIT_FRAMES) % PORTRAIT_FRAMES;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (speaker === 'luma') drawLuma(ctx, mood, f);
  else if (speaker === 'tess') drawTess(ctx, mood === 'scrambled' ? 'neutral' : mood, f);
  else drawKai(ctx, mood === 'scrambled' ? 'neutral' : mood, f);
  if (mood === 'scrambled') scramble(ctx, f, speaker === 'luma' ? 1 : 0.7);
  ctx.restore();
}

/**
 * Pré-rend une planche horizontale de PORTRAIT_FRAMES images de `px` × `px` (canvas accéléré : copié à chaque
 * changement d'image de la bulle). L'image i est en (i * px, 0).
 */
export function renderPortraitStrip(speaker: Speaker, mood: Mood, px: number): HTMLCanvasElement {
  const size = Math.max(8, Math.round(px));
  const canvas = document.createElement('canvas');
  canvas.width = size * PORTRAIT_FRAMES;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let i = 0; i < PORTRAIT_FRAMES; i++) {
    ctx.setTransform(size / S, 0, 0, size / S, i * size, 0);
    drawPortrait(ctx, speaker, mood, i);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------- Fonds

function backdrop(ctx: Ctx, top: string, bottom: string, glowCol: string): void {
  ctx.fillStyle = linGrad(ctx, 0, 0, 0, S, [[0, top], [1, bottom]]);
  ctx.fillRect(0, 0, S, S);
  softDot(ctx, S * 0.5, S * 0.55, S * 0.62, glowCol, 0.28);
}

/** Lignes de balayage d'écran (radio). */
function scanlines(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 1; y < S; y += 3) ctx.fillRect(0, y, S, 1);
}

// ---------------------------------------------------------------- LUMA

interface LumaColors {
  line: string;
  fill: string;
  eye: string;
  accent: string;
}

const LUMA_OK: LumaColors = { line: CYAN, fill: '#0b5a7a', eye: '#effeff', accent: MAGENTA };
const LUMA_VOID: LumaColors = { line: '#b4b4c4', fill: '#3a3a48', eye: '#ffd0d4', accent: VOID_RED };

/** Visage holographique : tête arrondie projetée, écouteurs, antenne, yeux en pilules, bouche en onde. */
function drawLuma(ctx: Ctx, mood: Mood, f: number): void {
  const col = mood === 'scrambled' ? LUMA_VOID : LUMA_OK;
  backdrop(ctx, '#0a1838', '#04020f', mood === 'scrambled' ? '#6a5a70' : '#1f7dff');
  // Grille du projecteur
  ctx.strokeStyle = rgba(col.line, 0.08);
  ctx.lineWidth = 1;
  for (let x = 8; x < S; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
  }
  for (let y = 6; y < S; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
  }
  // Cône de projection sous la tête
  ctx.fillStyle = linGrad(ctx, 0, 70, 0, 96, [[0, rgba(col.line, 0.3)], [1, rgba(col.line, 0)]]);
  ctx.beginPath();
  ctx.moveTo(30, 72);
  ctx.lineTo(66, 72);
  ctx.lineTo(54, 96);
  ctx.lineTo(42, 96);
  ctx.closePath();
  ctx.fill();
  glowDot(ctx, 48, 93, 2.2, col.line);

  // Antenne
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 20);
  ctx.lineTo(48, 11);
  ctx.stroke();
  glowDot(ctx, 48, 9, 2.6, col.accent);

  // Écouteurs
  for (const x of [17, 79]) {
    const pod = roundRect(x - 6, 38, 12, 20, 6);
    fillOutlined(ctx, pod, linGrad(ctx, 0, 38, 0, 58, [[0, '#2a3a6a'], [1, '#101634']]), OUT, 2);
    ctx.strokeStyle = rgba(col.line, 0.9);
    ctx.lineWidth = 1.3;
    ctx.stroke(pod);
    glowDot(ctx, x, 48, 1.8, col.accent);
  }

  // Tête : verre translucide, contour lumineux
  const head = roundRect(20, 19, 56, 52, 21);
  glow(ctx, col.line, 10, () => {
    ctx.fillStyle = linGrad(ctx, 0, 19, 0, 71, [[0, rgba(col.fill, 0.92)], [1, rgba(col.fill, 0.55)]]);
    ctx.fill(head);
  });
  ctx.save();
  ctx.clip(head);
  softDot(ctx, 36, 28, 26, '#ffffff', 0.12);
  ctx.restore();
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.2;
  ctx.stroke(head);
  // Reflet du verre
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(48, 45, 22, -2.6, -1.9);
  ctx.stroke();

  lumaFace(ctx, mood, f, col);
  scanlines(ctx, 0.14);
}

function lumaFace(ctx: Ctx, mood: Mood, f: number, col: LumaColors): void {
  const blink = f === PORTRAIT_FRAME.blink;
  const lx = 38;
  const rx = 58;
  const ey = 42;
  const pill = (x: number, h: number) => {
    glow(ctx, col.line, 7, () => {
      ctx.fillStyle = col.eye;
      ctx.fill(roundRect(x - 4, ey - h / 2, 8, h, 4));
    });
  };
  const closed = (x: number) => {
    ctx.strokeStyle = col.eye;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x - 4.5, ey + 1);
    ctx.lineTo(x + 4.5, ey + 1);
    ctx.stroke();
  };
  const happy = (x: number) => {
    glow(ctx, col.line, 6, () => {
      ctx.strokeStyle = col.eye;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(x, ey + 3, 5, -Math.PI * 0.92, -Math.PI * 0.08);
      ctx.stroke();
    });
  };

  if (mood === 'amused') {
    // Pince-sans-rire : clin d'œil, sourire en coin.
    if (blink) closed(lx);
    else pill(lx, 12);
    happy(rx);
  } else if (mood === 'worried') {
    if (blink) {
      closed(lx);
      closed(rx);
    } else {
      pill(lx, 15);
      pill(rx, 15);
    }
    // Sourcils relevés vers le milieu
    ctx.strokeStyle = col.eye;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(32, 33);
    ctx.lineTo(42, 29);
    ctx.moveTo(54, 29);
    ctx.lineTo(64, 33);
    ctx.stroke();
    // Goutte
    const drop = new Path2D();
    drop.moveTo(70, 26);
    drop.quadraticCurveTo(74, 33, 70, 35);
    drop.quadraticCurveTo(66, 33, 70, 26);
    ctx.fillStyle = rgba('#9ef8ff', 0.85);
    ctx.fill(drop);
  } else if (blink) {
    closed(lx);
    closed(rx);
  } else {
    pill(lx, 12);
    pill(rx, 12);
  }

  // Bouche : onde sonore (amplitude selon l'image), courbée selon l'humeur.
  const amp = f === PORTRAIT_FRAME.talkA ? 2.6 : f === PORTRAIT_FRAME.talkB ? 4.4 : 0.6;
  const curve = mood === 'amused' ? -2.6 : mood === 'worried' ? 2.4 : -0.8;
  const shift = mood === 'amused' ? 2 : 0;
  glow(ctx, col.line, 6, () => {
    ctx.strokeStyle = col.eye;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const x = 38 + shift + i * 2;
      const u = (x - 48 - shift) / 10;
      const env = 1 - u * u;
      const w = Math.sin(i * 1.9 + f) * amp * env;
      const y = 59 + curve * (1 - u * u) * -1 + (mood === 'amused' ? -u * 1.6 : 0) + w;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

// ---------------------------------------------------------------- Kaï

const SUIT = '#f6f8ff';
const SUIT_MID = '#cdd4ee';
const SUIT_SHADE = '#8f98c2';
const BOOT = '#3b4166';

/** Casque de Kaï de trois quarts (même visière orange que drawPlayerFrame), yeux devinés derrière la visière. */
function drawKai(ctx: Ctx, mood: Mood, f: number): void {
  backdrop(ctx, '#0c2034', '#05010f', '#1fb8c8');
  // Étoiles
  const r = rng(91);
  ctx.fillStyle = 'rgba(220,240,255,0.7)';
  for (let i = 0; i < 18; i++) ctx.fillRect(r() * S, r() * 50, 1, 1);

  // Épaules et col
  const shoulders = new Path2D();
  shoulders.moveTo(6, 96);
  shoulders.bezierCurveTo(8, 80, 24, 74, 48, 74);
  shoulders.bezierCurveTo(72, 74, 88, 80, 90, 96);
  shoulders.closePath();
  fillOutlined(ctx, shoulders, linGrad(ctx, 0, 74, 0, 96, [[0, SUIT], [1, SUIT_SHADE]]), OUT, 3);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, 90);
  ctx.quadraticCurveTo(22, 82, 30, 80);
  ctx.stroke();
  ctx.strokeStyle = '#ff9a2e';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(70, 80);
  ctx.quadraticCurveTo(78, 84, 82, 92);
  ctx.stroke();
  fillOutlined(ctx, ellipse(48, 76, 22, 7), BOOT, OUT, 2.4);
  // Voyant de radio du col : allumé quand Kaï parle.
  const talking = f === PORTRAIT_FRAME.talkA || f === PORTRAIT_FRAME.talkB;
  glowDot(ctx, 60, 77, talking ? 2.4 : 1.6, talking ? '#c9fdff' : '#3a8a9a');

  // Antenne (derrière)
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(26, 30);
  ctx.lineTo(18, 12);
  ctx.stroke();
  ctx.strokeStyle = SUIT_SHADE;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  glowDot(ctx, 17.5, 10.5, 2.6, f === PORTRAIT_FRAME.talkB ? '#ffffff' : CYAN);

  // Casque
  const shell = circle(48, 44, 31);
  fillOutlined(ctx, shell, sphereGrad(ctx, 48, 44, 31, '#ffffff', SUIT, SUIT_SHADE), OUT, 3.2);
  rimLight(ctx, shell, 'rgba(120,230,255,0.55)', 2.4, -3, -2);
  // Visière : celle de drawPose (casque de rayon 13) agrandie.
  ctx.save();
  ctx.translate(48, 44);
  ctx.scale(2.3, 2.3);
  const visor = new Path2D();
  visor.moveTo(-8.5, -8);
  visor.bezierCurveTo(-2, -11.5, 9.5, -9, 11.5, -1);
  visor.bezierCurveTo(12.2, 5.5, 8, 9.4, 1, 9);
  visor.bezierCurveTo(-5.5, 8.6, -10.8, 5.5, -11, -0.5);
  visor.bezierCurveTo(-11.1, -4, -10.4, -6.6, -8.5, -8);
  visor.closePath();
  glow(ctx, '#ff8a1a', 5, () => {
    ctx.fillStyle = linGrad(ctx, 0, -10, 0, 9, [[0, '#ffe7a0'], [0.4, '#ffa21f'], [1, '#c43c00']]);
    ctx.fill(visor);
  });
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 0.9;
  ctx.stroke(visor);
  ctx.save();
  ctx.clip(visor);
  kaiEyes(ctx, mood, f);
  ctx.restore();
  // Reflets
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(1.5, 1, 7.2, -2.5, -1.4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(8.2, -4.4, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (mood === 'worried') sweat(ctx, 76, 22);
  if (mood === 'amused') sparkle(ctx, 80, 18, 4.5);
}

/** Yeux devinés derrière la visière (repère de la visière, échelle 2,3). */
function kaiEyes(ctx: Ctx, mood: Mood, f: number): void {
  ctx.fillStyle = 'rgba(70,18,0,0.6)';
  ctx.strokeStyle = 'rgba(70,18,0,0.6)';
  ctx.lineWidth = 1.1;
  const xs = [-3.2, 4.4];
  for (let i = 0; i < 2; i++) {
    const x = xs[i];
    if (f === PORTRAIT_FRAME.blink) {
      ctx.beginPath();
      ctx.moveTo(x - 1.6, 0.6);
      ctx.lineTo(x + 1.6, 0.6);
      ctx.stroke();
    } else if (mood === 'amused') {
      ctx.beginPath();
      ctx.arc(x, 1.4, 1.7, -Math.PI * 0.9, -Math.PI * 0.1);
      ctx.stroke();
    } else {
      const h = mood === 'worried' ? 2.6 : 2.1;
      ctx.beginPath();
      ctx.ellipse(x, 0.4, 1.25, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.8)';
      ctx.beginPath();
      ctx.arc(x + 0.4, -0.5, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,18,0,0.6)';
    }
  }
  if (mood === 'worried') {
    ctx.beginPath();
    ctx.moveTo(-5, -3.4);
    ctx.lineTo(-1.6, -4.4);
    ctx.moveTo(2.8, -4.4);
    ctx.lineTo(6.2, -3.4);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- Tess

const SKIN = '#b9775a';
const SKIN_LIGHT = '#e0a07e';
const SKIN_DARK = '#7e4632';
const HAIR = '#ff4fd8';
const HAIR_DARK = '#9a1f8a';
const SUIT_TESS = '#ffb347';

/** Tess, mécanicienne : cheveux néon en épis, lunettes de soudure relevées, combinaison orange, trace de cambouis. */
function drawTess(ctx: Ctx, mood: Mood, f: number): void {
  backdrop(ctx, '#2a0f3e', '#0a0418', '#ff6ad8');
  // Engrenage en filigrane
  ctx.save();
  ctx.translate(80, 20);
  ctx.strokeStyle = 'rgba(255,180,90,0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
    ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
    ctx.stroke();
  }
  ctx.restore();

  // Épaules : combinaison
  const body = new Path2D();
  body.moveTo(8, 96);
  body.bezierCurveTo(10, 82, 26, 76, 48, 76);
  body.bezierCurveTo(70, 76, 86, 82, 88, 96);
  body.closePath();
  fillOutlined(ctx, body, linGrad(ctx, 0, 76, 0, 96, [[0, SUIT_TESS], [1, '#c4621a']]), OUT, 3);
  // Col et bretelle
  fillOutlined(ctx, smoothPoly([36, 76, 48, 86, 60, 76, 56, 72, 40, 72]), '#e8892a', OUT, 2);
  ctx.strokeStyle = '#6a2e10';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(26, 82);
  ctx.lineTo(30, 96);
  ctx.stroke();
  // Écusson clé
  fillOutlined(ctx, circle(68, 87, 5), '#2a1a4a', OUT, 1.6);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(65.5, 89.5);
  ctx.lineTo(70, 85);
  ctx.stroke();
  glowDot(ctx, 70.5, 84.5, 1, CYAN);

  // Cou
  fillOutlined(ctx, roundRect(41, 62, 14, 16, 5), SKIN_DARK, OUT, 2);

  // Cheveux arrière
  fillOutlined(ctx, ellipse(48, 42, 25, 26), HAIR_DARK, OUT, 2.6);

  // Visage
  const face = new Path2D();
  face.moveTo(27, 40);
  face.bezierCurveTo(27, 22, 69, 22, 69, 40);
  face.bezierCurveTo(69, 56, 60, 70, 48, 70);
  face.bezierCurveTo(36, 70, 27, 56, 27, 40);
  face.closePath();
  fillOutlined(ctx, face, sphereGrad(ctx, 48, 46, 26, SKIN_LIGHT, SKIN, SKIN_DARK), OUT, 2.6);
  // Oreilles et boucle
  fillOutlined(ctx, ellipse(27, 47, 3.6, 5.5), SKIN, OUT, 2);
  fillOutlined(ctx, ellipse(69, 47, 3.6, 5.5), SKIN, OUT, 2);
  glowDot(ctx, 69.5, 54, 1.4, CYAN);
  // Joues
  softDot(ctx, 36, 54, 6, '#ff6a7a', 0.35);
  softDot(ctx, 60, 54, 6, '#ff6a7a', 0.35);
  // Cambouis
  ctx.fillStyle = 'rgba(40,20,40,0.45)';
  ctx.beginPath();
  ctx.ellipse(60, 58, 4, 1.6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  tessFace(ctx, mood, f);

  // Mèche et épis
  const fringe = new Path2D();
  fringe.moveTo(24, 40);
  fringe.bezierCurveTo(20, 18, 40, 8, 56, 12);
  fringe.lineTo(62, 4);
  fringe.lineTo(64, 14);
  fringe.bezierCurveTo(72, 16, 76, 28, 72, 40);
  fringe.bezierCurveTo(66, 30, 58, 28, 50, 30);
  fringe.lineTo(46, 36);
  fringe.lineTo(42, 30);
  fringe.bezierCurveTo(34, 30, 28, 34, 24, 40);
  fringe.closePath();
  fillOutlined(ctx, fringe, linGrad(ctx, 0, 6, 0, 40, [[0, '#ffb3f0'], [0.45, HAIR], [1, HAIR_DARK]]), OUT, 2.6);
  // Mèche cyan
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(34, 16);
  ctx.quadraticCurveTo(30, 24, 30, 34);
  ctx.stroke();

  // Lunettes de soudure relevées sur le front
  ctx.strokeStyle = '#2a1a3a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(25, 30);
  ctx.quadraticCurveTo(48, 22, 71, 30);
  ctx.stroke();
  for (const x of [39, 57]) {
    fillOutlined(ctx, circle(x, 26, 7.2), '#4a4a6a', OUT, 2.2);
    glow(ctx, '#9dff3f', 6, () => {
      ctx.fillStyle = linGrad(ctx, 0, 21, 0, 31, [[0, '#e8ffb0'], [0.5, '#9dff3f'], [1, '#3a8a10']]);
      ctx.beginPath();
      ctx.arc(x, 26, 4.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x - 1.6, 24.4, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mood === 'worried') sweat(ctx, 72, 38);
  if (mood === 'amused') sparkle(ctx, 16, 22, 4);
}

function tessFace(ctx: Ctx, mood: Mood, f: number): void {
  const blink = f === PORTRAIT_FRAME.blink;
  const ey = 45;
  const eyes = [39, 57];
  // Sourcils
  ctx.strokeStyle = HAIR_DARK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (mood === 'worried') {
    ctx.moveTo(34, 39);
    ctx.lineTo(43, 36.5);
    ctx.moveTo(53, 36.5);
    ctx.lineTo(62, 39);
  } else {
    ctx.moveTo(34, 38);
    ctx.quadraticCurveTo(39, 35.5, 44, 37.5);
    ctx.moveTo(52, 37.5);
    ctx.quadraticCurveTo(57, 35.5, 62, 38);
  }
  ctx.stroke();
  // Yeux
  for (let i = 0; i < 2; i++) {
    const x = eyes[i];
    if (blink || (mood === 'amused' && f !== PORTRAIT_FRAME.idle)) {
      ctx.strokeStyle = '#1a0a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (mood === 'amused') ctx.arc(x, ey + 2, 3.6, -Math.PI * 0.9, -Math.PI * 0.1);
      else {
        ctx.moveTo(x - 3.4, ey + 0.5);
        ctx.quadraticCurveTo(x, ey + 2, x + 3.4, ey + 0.5);
      }
      ctx.stroke();
      continue;
    }
    const h = mood === 'worried' ? 4.4 : 3.8;
    fillOutlined(ctx, ellipse(x, ey, 3.4, h), '#ffffff', '#1a0a2a', 1.4);
    ctx.fillStyle = '#2a1238';
    ctx.beginPath();
    ctx.arc(x + 0.4, ey + 0.4, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 1.2, ey - 0.8, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nez
  ctx.strokeStyle = SKIN_DARK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(48.5, 49);
  ctx.quadraticCurveTo(50.5, 53, 47.5, 54);
  ctx.stroke();
  // Bouche
  const open = f === PORTRAIT_FRAME.talkA ? 1 : f === PORTRAIT_FRAME.talkB ? 2 : 0;
  if (mood === 'worried' && open === 0) {
    fillOutlined(ctx, ellipse(48, 61, 2.6, 2.2), '#5a1a2a', '#3a0a1a', 1.2);
    return;
  }
  if (open === 0) {
    ctx.strokeStyle = '#5a1a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (mood === 'amused') {
      ctx.moveTo(41, 58.5);
      ctx.quadraticCurveTo(48, 64.5, 55.5, 58);
    } else {
      ctx.moveTo(43, 59.5);
      ctx.quadraticCurveTo(48, 62, 53, 59);
    }
    ctx.stroke();
    return;
  }
  const w = mood === 'amused' ? 7 : 5;
  const h = open === 1 ? 2.6 : 4;
  const mouth = new Path2D();
  mouth.moveTo(48 - w, 59);
  mouth.quadraticCurveTo(48, 59 + (mood === 'amused' ? 1 : -0.4), 48 + w, 59);
  mouth.quadraticCurveTo(48, 59 + h * 2.2, 48 - w, 59);
  mouth.closePath();
  fillOutlined(ctx, mouth, '#4a0f22', '#3a0a1a', 1.2);
  ctx.save();
  ctx.clip(mouth);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(48 - w, 58, w * 2, 1.8);
  ctx.fillStyle = '#ff7a8a';
  ctx.beginPath();
  ctx.ellipse(48, 59 + h * 1.6, w * 0.55, h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- Accessoires d'humeur

function sweat(ctx: Ctx, x: number, y: number): void {
  const drop = new Path2D();
  drop.moveTo(x, y);
  drop.quadraticCurveTo(x + 5, y + 8, x, y + 10);
  drop.quadraticCurveTo(x - 5, y + 8, x, y);
  fillOutlined(ctx, drop, '#bff6ff', OUT, 1.6);
}

function sparkle(ctx: Ctx, x: number, y: number, r: number): void {
  glow(ctx, '#ffffff', 6, () => {
    ctx.strokeStyle = '#fff6c0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  });
}

// ---------------------------------------------------------------- Brouillage du Vide

/**
 * Surimpression « brouillée » : couleurs éteintes, bandes horizontales décalées (copies du canvas sur
 * lui-même), reflets rouges et grésillement. `force` 1 = LUMA (fort), moins pour les autres.
 */
function scramble(ctx: Ctx, f: number, force: number): void {
  const r = rng(1337 + f * 101);
  // Couleurs éteintes (le Vide « éteint la lumière »)
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = 0.55 * force;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  // Bandes décalées : copie de tranches du canvas, en pixels réels du canvas.
  const m = ctx.getTransform();
  const sx = m.a;
  const sy = m.d;
  const bands = 2 + Math.floor(r() * 2);
  for (let i = 0; i < bands; i++) {
    const y = 14 + r() * 64;
    const h = 3 + r() * 7;
    const dx = (r() < 0.5 ? -1 : 1) * (3 + r() * 6) * force;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = m.e;
    const py = m.f + y * sy;
    const pw = S * sx;
    const ph = Math.max(1, h * sy);
    try {
      ctx.drawImage(ctx.canvas, px, py, pw, ph, px + dx * sx, py, pw, ph);
    } catch {
      // Canvas de taille nulle : sans effet.
    }
    ctx.restore();
    ctx.fillStyle = rgba(r() < 0.5 ? VOID_RED : '#d0d0e0', 0.22 * force);
    ctx.fillRect(0, y, S, Math.max(1, h * 0.3));
  }
  // Grésillement
  for (let i = 0; i < 70 * force; i++) {
    const v = r();
    ctx.fillStyle = v < 0.15 ? rgba(VOID_RED, 0.75) : v < 0.6 ? 'rgba(220,220,235,0.5)' : 'rgba(10,8,16,0.6)';
    ctx.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 3), 1);
  }
  // Fissure noire bordée de rouge
  glow(ctx, VOID_RED, 5, () => {
    ctx.strokeStyle = 'rgba(10,6,14,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(S, 10 + f * 3);
    ctx.lineTo(80, 24 + f);
    ctx.lineTo(86, 34);
    ctx.lineTo(72, 46 + f * 2);
    ctx.stroke();
  });
}
