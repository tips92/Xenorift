import { RIFT_ECHO_LINES } from '../../core/story';
import type { Ctx } from '../../game2d/art/util';
import { clamp01, type CutsceneEvent, type CutsceneScript, type View } from './common';

// Écho du Vide : vision courte (~8 s) avant de retenter une faille. Dessin par code, pas de fichier vidéo.
// Remplace une « vidéo » de relance : le projet n'a pas de régie publicitaire.

const DURATION = 8;

export function createRiftEcho(): CutsceneScript {
  const events: CutsceneEvent[] = [
    { t: 0.35, cue: 'vide' },
    { t: 0.7, say: RIFT_ECHO_LINES.hold },
    { t: 4.3, cue: 'heal', say: RIFT_ECHO_LINES.back },
    { t: 7.3, hide: true },
  ];
  return {
    duration: DURATION,
    events,
    build(): void {
      /* Pas de calque : l'image ne dépend que du temps. */
    },
    draw(ctx: Ctx, t: number, view: View): void {
      drawEcho(ctx, t, view);
    },
    release(): void {
      /* rien à libérer */
    },
  };
}

function drawEcho(ctx: Ctx, t: number, view: View): void {
  const w = view.w;
  const h = view.h;
  const u = clamp01(t / 7.2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#100818';
  ctx.fillRect(0, 0, w, h);
  // Fissures grises qui reprennent la couleur de la Jungle à mesure que la bombe se recharge.
  ctx.lineWidth = Math.max(2, h * 0.004);
  for (let i = 0; i < 7; i++) {
    const y = h * (0.18 + i * 0.1);
    const grey = 1 - u;
    const cr = Math.round(90 * grey + 61 * u);
    const cg = Math.round(96 * grey + 255 * u);
    const cb = Math.round(120 * grey + 210 * u);
    ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
    ctx.globalAlpha = 0.35 + 0.4 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * (0.28 + (i % 3) * 0.08), y + h * 0.04);
    ctx.lineTo(w * 0.72, y - h * 0.02);
    ctx.lineTo(w * 0.92, y + h * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const cx = w * 0.5;
  const cy = h * 0.42;
  const rad = Math.min(w, h) * 0.16;
  ctx.strokeStyle = '#5c6178';
  ctx.lineWidth = Math.max(4, rad * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#3dffd2';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = u > 0.92 ? '#c8fdff' : '#2a1848';
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.28, 0, Math.PI * 2);
  ctx.fill();
}
