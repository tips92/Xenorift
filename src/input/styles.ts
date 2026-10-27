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
  --xr-edge: clamp(14px, 3.2vmin, 30px);
  --xr-pad: clamp(76px, 16vmin, 118px);
  --xr-fire: clamp(78px, 16.5vmin, 120px);
  --xr-jump: clamp(92px, 20.5vmin, 150px);
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
  opacity: 0.75;
  animation: xr-tc-in 220ms ease-out;
}
@keyframes xr-tc-in { from { opacity: 0; } to { opacity: 0.75; } }

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

/* ---------- Croix directionnelle horizontale (une seule zone, glissement d'une flèche à l'autre) */
.xr-dpad {
  left: calc(var(--xr-sl) + var(--xr-edge));
  bottom: calc(var(--xr-sb) + var(--xr-edge));
  width: calc(var(--xr-pad) * 2 + 14px);
  height: var(--xr-pad);
  border-radius: calc(var(--xr-pad) * 0.5);
  display: flex;
  align-items: stretch;
  transition: box-shadow 90ms ease-out;
}
.xr-dpad::before {
  content: '';
  position: absolute;
  inset: -18px -14px -14px -18px;
  border-radius: calc(var(--xr-pad) * 0.5 + 16px);
}
.xr-dpad.is-active {
  box-shadow: 0 0 22px rgba(var(--xr-c), 0.65), inset 0 0 18px rgba(var(--xr-c), 0.3);
}
.xr-dpad-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 80ms ease-out, box-shadow 80ms ease-out;
}
.xr-dpad-l { border-radius: calc(var(--xr-pad) * 0.5) 0 0 calc(var(--xr-pad) * 0.5); }
.xr-dpad-r { border-radius: 0 calc(var(--xr-pad) * 0.5) calc(var(--xr-pad) * 0.5) 0; }
.xr-dpad-half svg {
  width: 44%;
  height: 44%;
  filter: drop-shadow(0 0 4px rgba(var(--xr-c), 0.9));
  transition: transform 70ms ease-out;
}
.xr-dpad-mid {
  width: 2px;
  margin: 22% 0;
  background: linear-gradient(transparent, rgba(var(--xr-c), 0.55), transparent);
}
.xr-dpad-half.is-down {
  background: radial-gradient(circle at 50% 50%, rgba(var(--xr-c), 0.5), rgba(var(--xr-c), 0.1) 72%);
  box-shadow: inset 0 0 22px rgba(var(--xr-c), 0.55);
  color: #fff;
}
.xr-dpad-half.is-down svg {
  transform: scale(1.16);
  filter: drop-shadow(0 0 9px rgba(var(--xr-c), 1));
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

/* ---------- Joystick flottant (moitié gauche de l'écran) */
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
`;

/** Ajoute la feuille de style des commandes (une seule fois par page). */
export function injectTouchStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
