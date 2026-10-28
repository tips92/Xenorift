// Styles des commandes tactiles, injectés une seule fois depuis TypeScript (styles.css appartient à l'interface).
// Look « néon » : verre sombre translucide, contour lumineux cyan / magenta, état appuyé plus brillant.

const STYLE_ID = 'xr-touch-style';

const CSS = `
.xr-touch {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  --xr-sl: env(safe-area-inset-left, 0px);
  --xr-sr: env(safe-area-inset-right, 0px);
  --xr-sb: env(safe-area-inset-bottom, 0px);
  /* Réglages (touch.ts, setOptions) : échelle des commandes et opacité des couches (cran 1 = 1 et 0,75). */
  --xr-scale: 1;
  --xr-tc-opacity: 0.75;
  --xr-edge: clamp(14px, 3.2vmin, 30px);
  --xr-pad: calc(clamp(76px, 16vmin, 118px) * var(--xr-scale));
  --xr-fire: calc(clamp(78px, 16.5vmin, 120px) * var(--xr-scale));
  --xr-jump: calc(clamp(92px, 20.5vmin, 150px) * var(--xr-scale));
  --xr-dstick: calc(var(--xr-pad) * 1.68);
  --xr-gap: clamp(10px, 2.6vmin, 22px);
  --xr-stick-r: 64px;
  --xr-cyan: 0, 240, 255;
  --xr-mag: 255, 64, 214;
}
.xr-touch [hidden] { display: none !important; }

.xr-tc-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--xr-tc-opacity);
  animation: xr-tc-in 220ms ease-out;
}
/* Sans image « to » : l'animation finit sur l'opacité réglée. */
@keyframes xr-tc-in { from { opacity: 0; } }

.xr-ctl {
  position: absolute;
  box-sizing: border-box;
  pointer-events: auto;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.xr-ctl * { pointer-events: none; }

.xr-glass {
  --xr-c: var(--xr-cyan);
  background: radial-gradient(120% 120% at 50% 28%, rgba(52, 26, 110, 0.5) 0%, rgba(10, 4, 30, 0.74) 72%);
  border: 2px solid rgba(var(--xr-c), 0.85);
  box-shadow: 0 0 14px rgba(var(--xr-c), 0.42), inset 0 0 16px rgba(var(--xr-c), 0.2);
  color: rgb(214, 252, 255);
}

/* ---------- Stick fixe à 8 directions (plateforme) : base ronde immobile, bille qui suit le doigt.
   Garde la classe .xr-dpad de l'ancienne croix ◀ ▶ (visée par les tests). */
.xr-dpad {
  left: calc(var(--xr-sl) + var(--xr-edge));
  bottom: calc(var(--xr-sb) + var(--xr-edge));
  width: var(--xr-dstick);
  height: var(--xr-dstick);
  border-radius: 50%;
  transition: box-shadow 90ms ease-out;
}
/* Zone de toucher élargie autour du cercle visible. */
.xr-dpad::before {
  content: '';
  position: absolute;
  inset: -18px;
  border-radius: 50%;
}
.xr-dpad.is-active {
  box-shadow: 0 0 22px rgba(var(--xr-c), 0.65), inset 0 0 18px rgba(var(--xr-c), 0.3);
}
.xr-dpad-ring {
  position: absolute;
  inset: 24%;
  border-radius: 50%;
  border: 1px dashed rgba(var(--xr-c), 0.35);
}
/* Flèches au-dessus de la bille (z-index) : une flèche allumée reste visible quand la bille passe dessus. */
.xr-dpad-arrow {
  position: absolute;
  z-index: 1;
  width: 20%;
  height: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.45;
  transition: opacity 70ms ease-out, transform 70ms ease-out, color 70ms ease-out;
}
.xr-dpad-arrow svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 4px rgba(var(--xr-c), 0.9));
}
.xr-dpad-l { left: 5%; top: 40%; }
.xr-dpad-r { right: 5%; top: 40%; }
.xr-dpad-u { top: 5%; left: 40%; }
.xr-dpad-d { bottom: 5%; left: 40%; }
/* Allumée : couleur néon du contrôle, liseré sombre (lisible sur la bille claire) et halo. */
.xr-dpad-arrow.is-down {
  opacity: 1;
  color: rgb(var(--xr-c));
  transform: scale(1.2);
}
.xr-dpad-arrow.is-down svg {
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 7px rgba(var(--xr-c), 1));
}
/* Bille : discrète au repos (elle ne délave pas ce qui passe dessous), vive quand un doigt la tient. */
.xr-dpad-knob {
  position: absolute;
  box-sizing: border-box;
  left: 50%;
  top: 50%;
  width: 44%;
  height: 44%;
  margin: -22% 0 0 -22%;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--xr-c), 0.8);
  background: radial-gradient(circle at 42% 36%, rgba(235, 255, 255, 0.55), rgba(var(--xr-c), 0.45) 46%, rgba(0, 60, 140, 0.5) 100%);
  box-shadow: 0 0 8px rgba(var(--xr-c), 0.4);
  opacity: 0.5;
  transition: opacity 90ms ease-out, box-shadow 90ms ease-out;
  will-change: transform;
}
.xr-dpad.is-active .xr-dpad-knob {
  opacity: 1;
  background: radial-gradient(circle at 42% 36%, rgba(235, 255, 255, 0.9), rgba(var(--xr-c), 0.6) 46%, rgba(0, 60, 140, 0.55) 100%);
  box-shadow: 0 0 18px rgba(var(--xr-c), 0.85);
}

/* ---------- Boutons ronds */
.xr-btn {
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3%;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1;
  transition: transform 70ms ease-out, box-shadow 90ms ease-out, background 90ms ease-out, border-color 90ms ease-out;
}
.xr-btn::before {
  content: '';
  position: absolute;
  inset: -9px;
  border-radius: 50%;
}
.xr-btn svg {
  width: 46%;
  height: 46%;
  filter: drop-shadow(0 0 4px rgba(var(--xr-c), 0.9));
}
.xr-btn-label {
  text-shadow: 0 0 6px rgba(var(--xr-c), 0.95);
  padding-left: 0.12em;
}
.xr-btn.is-down {
  transform: scale(0.92);
  border-color: rgba(255, 255, 255, 0.95);
  background: radial-gradient(circle at 50% 42%, rgba(var(--xr-c), 0.55), rgba(var(--xr-c), 0.14) 62%, rgba(10, 4, 30, 0.7) 100%);
  box-shadow: 0 0 30px rgba(var(--xr-c), 0.95), inset 0 0 26px rgba(var(--xr-c), 0.6);
  color: #fff;
}
.xr-jump {
  width: var(--xr-jump);
  height: var(--xr-jump);
  right: calc(var(--xr-sr) + var(--xr-edge));
  bottom: calc(var(--xr-sb) + var(--xr-edge) - 4px);
  font-size: calc(var(--xr-jump) * 0.12);
}
.xr-fire {
  --xr-c: var(--xr-mag);
  width: var(--xr-fire);
  height: var(--xr-fire);
  right: calc(var(--xr-sr) + var(--xr-edge) + var(--xr-jump) + var(--xr-gap));
  bottom: calc(var(--xr-sb) + var(--xr-edge) + var(--xr-jump) * 0.4);
  font-size: calc(var(--xr-fire) * 0.13);
}
.xr-boost {
  --xr-c: var(--xr-mag);
  width: var(--xr-jump);
  height: var(--xr-jump);
  right: calc(var(--xr-sr) + var(--xr-edge));
  bottom: calc(var(--xr-sb) + var(--xr-edge));
  font-size: calc(var(--xr-jump) * 0.115);
}

/* ---------- Joystick flottant (moitié gauche de l'écran, droite en mode gaucher) */
.xr-stick-zone {
  left: 0;
  top: 0;
  bottom: 0;
  width: 50%;
}
.xr-stick-base {
  position: absolute;
  width: calc(var(--xr-stick-r) * 2);
  height: calc(var(--xr-stick-r) * 2);
  border-radius: 50%;
  transition: opacity 140ms ease-out, box-shadow 120ms ease-out;
  will-change: transform;
}
.xr-stick-base::after {
  content: '';
  position: absolute;
  inset: 24%;
  border-radius: 50%;
  border: 1px dashed rgba(var(--xr-c), 0.35);
}
.xr-stick-base.is-idle {
  left: calc(var(--xr-sl) + var(--xr-edge) + 14px);
  bottom: calc(var(--xr-sb) + var(--xr-edge) + 14px);
  opacity: 0.5;
}
.xr-stick-base.is-live {
  left: 0;
  top: 0;
  opacity: 1;
  box-shadow: 0 0 24px rgba(var(--xr-c), 0.7), inset 0 0 22px rgba(var(--xr-c), 0.32);
}
.xr-stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--xr-stick-r) * 0.9);
  height: calc(var(--xr-stick-r) * 0.9);
  margin: calc(var(--xr-stick-r) * -0.45) 0 0 calc(var(--xr-stick-r) * -0.45);
  border-radius: 50%;
  background: radial-gradient(circle at 42% 36%, rgba(235, 255, 255, 0.95), rgba(var(--xr-c), 0.7) 46%, rgba(0, 60, 140, 0.6) 100%);
  box-shadow: 0 0 18px rgba(var(--xr-c), 0.85);
  will-change: transform;
}

/* ---------- Mode gaucher : stick à droite, boutons à gauche (en 2D comme en vol) */
.xr-touch--lefty .xr-dpad {
  left: auto;
  right: calc(var(--xr-sr) + var(--xr-edge));
}
.xr-touch--lefty .xr-jump,
.xr-touch--lefty .xr-boost {
  right: auto;
  left: calc(var(--xr-sl) + var(--xr-edge));
}
.xr-touch--lefty .xr-fire {
  right: auto;
  left: calc(var(--xr-sl) + var(--xr-edge) + var(--xr-jump) + var(--xr-gap));
}
.xr-touch--lefty .xr-stick-zone {
  left: auto;
  right: 0;
}
.xr-touch--lefty .xr-stick-base.is-idle {
  left: auto;
  right: calc(var(--xr-sr) + var(--xr-edge) + 14px);
}
`;

/** Ajoute la feuille de style des commandes (une seule fois par page). */
export function injectTouchStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
