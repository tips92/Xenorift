// Icônes SVG en ligne des commandes tactiles (couleur héritée via currentColor).

export const ICON_LEFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.8 7.2 12l8.3 7.2z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';

export const ICON_RIGHT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.8 16.8 12l-8.3 7.2z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';

export const ICON_UP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 15.5 12 7.2l7.2 8.3z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';

export const ICON_DOWN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 8.5 12 16.8l7.2-8.3z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';

/** Rayon laser qui jaillit d'un éclair de bouche. */
export const ICON_LASER =
  '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<path d="M13.5 16H29" stroke-width="4.2" opacity=".55"/>' +
  '<path d="M13.5 16H29" stroke-width="1.8" stroke="#fff"/>' +
  '<circle cx="9" cy="16" r="3.3" fill="currentColor" stroke="none"/>' +
  '<path d="M9 7.6v2.8M9 21.6v2.8M2.6 16h2.6M4.4 11.4l1.9 1.9M4.4 20.6l1.9-1.9" stroke-width="2"/>' +
  '</svg>';

/** Chevron montant au-dessus d'une ligne de sol. */
export const ICON_JUMP =
  '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M8 16.5 16 8.5l8 8" stroke-width="3.6"/>' +
  '<path d="M10.5 23 16 17.5l5.5 5.5" stroke-width="2.6" opacity=".6"/>' +
  '<path d="M7 28h18" stroke-width="2" opacity=".45"/>' +
  '</svg>';

/** Viseur à point central lumineux (TIR de la Comète, en vol). */
export const ICON_SHOT =
  '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round">' +
  '<circle cx="16" cy="16" r="8.4" stroke-width="2.6"/>' +
  '<path d="M16 3.4v5M16 23.6v5M3.4 16h5M23.6 16h5" stroke-width="2.4"/>' +
  '<circle cx="16" cy="16" r="2.7" fill="#fff" stroke="none"/>' +
  '</svg>';

/** Double chevron de vitesse avec traînées. */
export const ICON_TURBO =
  '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M11 8.5 18.5 16 11 23.5M18.5 8.5 26 16l-7.5 7.5" stroke-width="3.4"/>' +
  '<path d="M3 12h4M2 16h5M3 20h4" stroke-width="1.8" opacity=".6"/>' +
  '</svg>';
