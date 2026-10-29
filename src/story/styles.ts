// Styles de la bulle de dialogue et du lecteur de cinématiques, injectés une seule fois depuis TypeScript
// (comme src/input/styles.ts : styles.css appartient à l'interface). Look « néon » : verre sombre, contour
// lumineux à la couleur de qui parle (--xb-c), bouton Passer en pastille. Encoche : marges --sat, --sar, --sab,
// --sal de styles.css (zones sûres de l'écran), sinon env() (pages d'aperçu).

const STYLE_ID = 'xr-story-style';

const CSS = `
.xr-bubble {
  --xb-c: 63, 247, 255;
  --xb-portrait: clamp(46px, 15.5vh, 76px);
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: flex-start;
  gap: clamp(8px, 2.2vh, 12px);
  box-sizing: border-box;
  max-width: min(620px, calc(100% - 32px));
  padding: clamp(6px, 1.8vh, 9px) clamp(12px, 3.4vh, 16px) clamp(7px, 2vh, 10px) clamp(6px, 1.8vh, 9px);
  border: 1.5px solid rgba(var(--xb-c), 0.55);
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(32, 17, 76, 0.86), rgba(10, 4, 30, 0.9));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4), 0 0 16px rgba(var(--xb-c), 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  color: #eef0ff;
  font: 600 clamp(14px, 4.1vh, 17px) / 1.32 'Exo 2', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transition: opacity 160ms ease, transform 160ms ease, border-color 160ms ease;
}
.xr-bubble * { pointer-events: none; }
.xr-bubble.is-hidden { opacity: 0; transform: translate3d(0, 6px, 0); }
.xr-bubble[data-speaker='tess'] { --xb-c: 255, 79, 216; }
.xr-bubble[data-speaker='kai'] { --xb-c: 255, 154, 63; }
.xr-bubble[data-mood='scrambled'] {
  --xb-c: 196, 190, 206;
  border-color: rgba(255, 58, 74, 0.6);
  animation: xr-bubble-static 1.4s steps(1) infinite;
}
.xr-bubble.is-paused, .xr-bubble.is-paused * { animation-play-state: paused; }
@keyframes xr-bubble-static {
  0%, 100% { transform: translate3d(0, 0, 0); }
  8% { transform: translate3d(-2px, 0, 0); }
  10% { transform: translate3d(1px, 0, 0); }
  56% { transform: translate3d(0, 0, 0); }
  58% { transform: translate3d(2px, -1px, 0); }
  60% { transform: translate3d(0, 0, 0); }
}
.xr-bubble-portrait {
  flex: none;
  width: var(--xb-portrait);
  height: var(--xb-portrait);
  border: 1.5px solid rgba(var(--xb-c), 0.8);
  border-radius: 12px;
  box-shadow: 0 0 10px rgba(var(--xb-c), 0.35);
  background: #05010f;
}
.xr-bubble-body { min-width: 0; flex: 1 1 auto; }
.xr-bubble-head {
  display: flex;
  align-items: baseline;
  gap: 0.7em;
  margin: 0.1em 0 0.25em;
}
.xr-bubble-name {
  color: rgb(var(--xb-c));
  font: 800 0.72em / 1 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.16em;
  text-shadow: 0 0 8px rgba(var(--xb-c), 0.6);
}
.xr-bubble-status {
  color: #ff6a78;
  font: 600 0.62em / 1 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.xr-bubble-text { margin: 0; overflow-wrap: break-word; }
.xr-bubble-text > span { color: transparent; }
.xr-bubble-text > span.is-on { color: inherit; }
.xr-bubble[data-mood='scrambled'] .xr-bubble-text { color: #d6d2e2; }
.xr-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
/* Radio en jeu (.xr-bubble--radio) : placée sous le HUD par styles.css (ui/radio.ts). */

/* Cinématique : reçoit les touchers même dans un parent en pointer-events: none (#ui-root) ; contexte
   d'empilement propre (bulle et Passer au-dessus du canvas, sans se mêler au reste de l'interface). */
.cs {
  position: absolute;
  inset: 0;
  isolation: isolate;
  overflow: hidden;
  background: #05010f;
  pointer-events: auto;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cs-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.cs-bubble {
  --cs-sal: var(--sal, env(safe-area-inset-left, 0px));
  --cs-sar: var(--sar, env(safe-area-inset-right, 0px));
  left: calc(var(--cs-sal) + clamp(12px, 3vw, 28px));
  bottom: calc(var(--sab, env(safe-area-inset-bottom, 0px)) + clamp(10px, 3vh, 20px));
  max-width: min(640px, calc(100% - var(--cs-sal) - var(--cs-sar) - 2 * clamp(12px, 3vw, 28px)));
}
.cs-skip {
  position: absolute;
  z-index: 4;
  top: calc(var(--sat, env(safe-area-inset-top, 0px)) + clamp(8px, 2.4vh, 14px));
  right: calc(var(--sar, env(safe-area-inset-right, 0px)) + clamp(10px, 2.4vw, 18px));
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  min-width: 48px;
  min-height: 44px;
  margin: 0;
  padding: 0 1em 0 1.1em;
  border: 1.5px solid rgba(63, 247, 255, 0.45);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(14, 6, 38, 0.72), rgba(8, 3, 24, 0.6));
  box-shadow: 0 0 12px rgba(63, 247, 255, 0.18);
  color: #eef0ff;
  font: 800 clamp(11px, 3.3vh, 14px) / 1 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(63, 247, 255, 0.5);
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms ease, opacity 200ms ease;
}
/* Zone de toucher élargie autour de la pastille. */
.cs-skip::before { content: ''; position: absolute; inset: -8px; border-radius: 28px; }
.cs-skip:active { transform: scale(0.94); }
.cs-skip:focus-visible { outline: 2px solid rgba(63, 247, 255, 0.9); outline-offset: 3px; }
.cs-skip svg { width: 1.1em; height: 1.1em; filter: drop-shadow(0 0 4px rgba(63, 247, 255, 0.7)); }
.cs.is-over .cs-skip { opacity: 0; pointer-events: none; }
`;

/** Injecte les styles une seule fois (jamais retirés : partagés par toutes les bulles et cinématiques). */
export function ensureStoryStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}
