import type { PowerUpKind, StageDef, ThemeId, UpgradeStat, WeaponId } from '../core/types';

// Icônes vectorielles en ligne (aucun fichier image). Les couleurs passent par `currentColor`
// ou par les dégradés partagés définis une seule fois dans le document (ensureSvgDefs).

const V24 = 'viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"';

export const ICONS = {
  heart: `<svg ${V24}><path class="heart-fill" d="M12 21.2l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.39z"/><path class="heart-shine" d="M6.2 6.4c-1.2.4-2 1.4-2.1 2.6" fill="none" stroke-linecap="round"/></svg>`,
  helmet: `<svg ${V24}><path d="M12 2.4c-5 0-8.6 3.7-8.6 8.7v4.5c0 1.5 1 2.8 2.5 3.2l1.3.3v2.3h9.6v-2.3l1.3-.3c1.5-.4 2.5-1.7 2.5-3.2v-4.5c0-5-3.6-8.7-8.6-8.7z" fill="#eef3ff"/><path d="M6.3 10.5c0-2.3 1.9-3.8 5.7-3.8s5.7 1.5 5.7 3.8v1.6c0 1.7-1.3 3-3 3H9.3c-1.7 0-3-1.3-3-3z" fill="#ff9a3f"/><path d="M8.3 9.7c.7-.9 1.9-1.3 3.1-1.3" fill="none" stroke="#fff4e0" stroke-width="1.2" stroke-linecap="round" opacity=".85"/><circle cx="19.2" cy="15.4" r="1" fill="#3ff7ff"/></svg>`,
  crystal: `<svg ${V24}><path d="M12 1.8l6.3 7.1L12 22.3 5.7 8.9z" fill="url(#xr-g-crystal)" stroke="#c8fdff" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.7 8.9h12.6M12 1.8L9.3 8.9 12 22.3l2.7-13.4z" fill="none" stroke="#effeff" stroke-width=".8" stroke-linejoin="round" opacity=".7"/></svg>`,
  pause: `<svg ${V24}><rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor"/></svg>`,
  /** Bonus du mode plateforme : vitesse (traits et double chevron), cadence (deux balles et leurs traits de vitesse), bouclier. */
  speed: `<svg ${V24}><path d="M2.5 8h4M1.5 12h5M2.5 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M9 5.5l6.5 6.5L9 18.5M14.5 5.5L21 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  rapid: `<svg ${V24}><path d="M1.8 7.5h3.6M1 16.5h3.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M7.4 4.5h2.4v6H7.4zM10.8 4.5h4.6c2.8 0 4.9 1.3 6 3-1.1 1.7-3.2 3-6 3h-4.6zM6 13.5h2.4v6H6zM9.4 13.5H14c2.8 0 4.9 1.3 6 3-1.1 1.7-3.2 3-6 3H9.4z" fill="currentColor"/></svg>`,
  shield: `<svg ${V24}><path d="M12 2.4l8 3.1v6c0 5-3.4 8.7-8 10.1-4.6-1.4-8-5.1-8-10.1v-6z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M12 6.4v11.9c2.9-1.2 4.9-3.7 4.9-6.8V8.2z" fill="currentColor" opacity=".55"/></svg>`,
  /** Compétence du double saut (hangar, plus tard). */
  doublejump: `<svg ${V24}><path d="M5 12.6l7-6.1 7 6.1M5 19.4l7-6.1 7 6.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 3.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/></svg>`,
  gate: `<svg ${V24}><ellipse cx="12" cy="12" rx="7" ry="9" fill="none" stroke="currentColor" stroke-width="2.6"/><ellipse cx="12" cy="12" rx="3" ry="4.4" fill="currentColor" opacity=".45"/></svg>`,
  boost: `<svg ${V24}><path d="M4 6l6.5 6L4 18M12 6l6.5 6-6.5 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hex: `<svg ${V24}><path class="hex-fill" d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  back: `<svg ${V24}><path d="M15.5 4.5L8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg ${V24}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor" opacity=".9"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="15.6" r="1.6" fill="#05010f"/></svg>`,
  unlock: `<svg ${V24}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor" opacity=".9"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15.6" r="1.6" fill="#05010f"/></svg>`,
  star: `<svg ${V24}><path class="star-fill" d="M12 2.2l2.95 6.3 6.9.75-5.15 4.68 1.44 6.8L12 17.25l-6.14 3.48 1.44-6.8-5.15-4.68 6.9-.75z" stroke-linejoin="round"/></svg>`,
  music: `<svg ${V24}><path d="M9 18V5.2l11-2.2v12.8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><circle cx="6.4" cy="18" r="2.7" fill="currentColor"/><circle cx="17.4" cy="15.8" r="2.7" fill="currentColor"/></svg>`,
  sfx: `<svg ${V24}><path d="M3.5 9.2h3.8L12.5 5v14l-5.2-4.2H3.5z" fill="currentColor"/><path d="M15.6 8.6a5 5 0 0 1 0 6.8M18.4 5.8a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  vibration: `<svg ${V24}><rect x="7.5" y="3" width="9" height="18" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.4 8v8M1.9 10v4M19.6 8v8M22.1 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  tilt: `<svg ${V24}><g transform="rotate(-24 12 13)"><rect x="4" y="8.5" width="16" height="9" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="13" r=".9" fill="currentColor"/></g><path d="M5.5 4.6a9 9 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.9 2.6l-.3 2.6-2.6-.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /** Commandes tactiles (Options) : taille, opacité, mode gaucher. */
  touchSize: `<svg ${V24}><circle cx="7" cy="15.6" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15.4" cy="10.2" r="6.1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  touchOpacity: `<svg ${V24}><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" fill="currentColor"/></svg>`,
  swap: `<svg ${V24}><path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reset: `<svg ${V24}><path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M6.2 2.8v4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  play: `<svg ${V24}><path d="M7.5 4.6v14.8c0 .8.9 1.3 1.6.8l11-7.4c.6-.4.6-1.2 0-1.6l-11-7.4c-.7-.5-1.6 0-1.6.8z" fill="currentColor"/></svg>`,
  grid: `<svg ${V24}><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" fill="currentColor"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity=".7"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity=".7"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.8" fill="currentColor" opacity=".45"/></svg>`,
  gear: `<svg ${V24}><circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><path d="M12 2.2v3M12 18.8v3M2.2 12h3M18.8 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M5.1 18.9l2.1-2.1M16.8 7.2l2.1-2.1" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  restart: `<svg ${V24}><path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M17.8 2.8v4.4h-4.4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  home: `<svg ${V24}><path d="M3.5 11.2L12 4l8.5 7.2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9.5h4.5v-5h3v5H18V10" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>`,
  next: `<svg ${V24}><path d="M5 12h12.5M12.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warning: `<svg ${V24}><path d="M12 3.2L22 20.5H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5v5.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="currentColor"/></svg>`,
  clock: `<svg ${V24}><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.3l3.4 2.1" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  enemy: `<svg ${V24}><path d="M3.5 18.5c0-6.4 3.8-11 8.5-11s8.5 4.6 8.5 11c-1.4 1.2-2.6-.6-4.2.6-1.4 1-2.6-.8-4.3.2-1.7-1-2.9.8-4.3-.2-1.6-1.2-2.8.6-4.2-.6z" fill="currentColor" opacity=".9"/><circle cx="9.2" cy="12.6" r="1.7" fill="#05010f"/><circle cx="14.8" cy="12.6" r="1.7" fill="#05010f"/></svg>`,
  trophy: `<svg ${V24}><path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5.2H3.8v1.6A3.6 3.6 0 0 0 7.4 10.4M17 5.2h3.2v1.6a3.6 3.6 0 0 1-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 13.7v3.6M8 20.5h8l-.8-3.2H8.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  /** Hangar : bâtiment (bouton des Niveaux), clé (Établi), décollage, coche (arme équipée). */
  hangar: `<svg ${V24}><path d="M2.5 20.5V11L12 4l9.5 7v9.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M6.5 20.5v-7h11v7M6.5 16h11M6.5 18.3h11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  wrench: `<svg ${V24}><path d="M14.6 3.2a5.2 5.2 0 0 0-5.8 6.7l-5.6 5.6a2.1 2.1 0 0 0 0 3l2.3 2.3a2.1 2.1 0 0 0 3 0l5.6-5.6a5.2 5.2 0 0 0 6.7-5.8l-3.1 3.1-3.3-.6-.6-3.3z" fill="currentColor"/><circle cx="6.4" cy="17.6" r="1.2" fill="#05010f"/></svg>`,
  launch: `<svg ${V24}><path d="M20.5 3.5c-4.6.2-8.3 2.4-10.9 6.3L7 9.6 3.5 13.1l3.6.7 3.1 3.1.7 3.6 3.5-3.5-.2-2.6c3.9-2.6 6.1-6.3 6.3-10.9z" fill="currentColor"/><circle cx="15.2" cy="8.8" r="1.8" fill="#05010f"/><path d="M6.8 17.2c-1.5.3-2.6 1.4-3 3.3 1.9-.4 3-1.5 3.3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>`,
  check: `<svg ${V24}><path d="M4.5 12.5l4.8 4.8L19.5 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /** Améliorations d'arme (la cadence reprend `rapid`) : dégâts, portée, refroidissement. */
  damage: `<svg ${V24}><path d="M12 2.5l1.6 5.6 5.1-2.8-2.8 5.1 5.6 1.6-5.6 1.6 2.8 5.1-5.1-2.8-1.6 5.6-1.6-5.6-5.1 2.8 2.8-5.1L2.5 12l5.6-1.6-2.8-5.1 5.1 2.8z" fill="currentColor"/><circle cx="12" cy="12" r="2.3" fill="#05010f"/></svg>`,
  range: `<svg ${V24}><circle cx="14" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="12" r="2.3" fill="currentColor"/><path d="M14 2v3.6M14 18.4V22M24 12h-3.6M1.5 12h7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.4 9.3L9.1 12l-2.7 2.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cooling: `<svg ${V24}><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9.4 4.2L12 6.5l2.6-2.3M9.4 19.8l2.6-2.3 2.6 2.3M4.4 10.8l3.3-1-.7-3.4M19.6 13.2l-3.3 1 .7 3.4M7 17.6l.7-3.4-3.3-1M17 6.4l-.7 3.4 3.3 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /** Modules : mitrailleuse de la Comète (deux canons), drone compagnon. */
  shipGun: `<svg ${V24}><path d="M2 6.5h10l1.6 1.6H20v2.3h-6.4L12 12H2zM2 13.5h10l1.6 1.6H20v2.3h-6.4L12 19H2z" fill="currentColor"/><circle cx="22" cy="9.25" r="1.3" fill="currentColor" opacity=".55"/><circle cx="22" cy="16.25" r="1.3" fill="currentColor" opacity=".55"/><path d="M4 9.2h6M4 16.2h6" stroke="#05010f" stroke-width="1" stroke-linecap="round" opacity=".55"/></svg>`,
  drone: `<svg ${V24}><path d="M3.5 6h6M14.5 6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.5 6v3.4M17.5 6v3.4" stroke="currentColor" stroke-width="1.8"/><path d="M5 11.6c0-1.4 1.1-2.3 2.5-2.3h9c1.4 0 2.5.9 2.5 2.3v1.2c0 3.5-3.1 6.4-7 6.4s-7-2.9-7-6.4z" fill="currentColor"/><circle cx="12" cy="13.3" r="2.4" fill="#05010f"/><circle cx="12" cy="13.3" r="1" fill="currentColor"/></svg>`,
  /** La Comète vue de dessus, nez vers la droite (64 x 32). */
  ship: `<svg viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg"><path d="M14 13.2L1.5 16 14 18.8z" fill="#ff9a3f"/><path d="M14 14.4L6 16l8 1.6z" fill="#fff1c9"/><path d="M60 16L30 11.2 18.5 2.5l2.2 9.2L13.5 13v6l7.2 1.3-2.2 9.2L30 20.8z" fill="#f4f7ff"/><path d="M30 11.2L18.5 2.5l2.2 9.2zM30 20.8l-11.5 8.7 2.2-9.2z" fill="#c9d2ee"/><path d="M42 14.3c3.6.4 6 1 7.4 1.7-1.4.7-3.8 1.3-7.4 1.7-1.2-.9-1.2-2.5 0-3.4z" fill="#3ff7ff"/><path d="M22 16h16" stroke="#3ff7ff" stroke-width="1.4" stroke-linecap="round"/></svg>`,
} as const;

const POWER_ICONS: Record<PowerUpKind, string> = { speed: ICONS.speed, rapid: ICONS.rapid, shield: ICONS.shield };
const POWER_LABELS: Record<PowerUpKind, string> = { speed: 'Vitesse', rapid: 'Cadence', shield: 'Bouclier' };

/** Icône d'un bonus du mode plateforme. */
export function powerIcon(kind: PowerUpKind): string {
  return POWER_ICONS[kind] ?? ICONS.shield;
}

export function powerLabel(kind: PowerUpKind): string {
  return POWER_LABELS[kind] ?? '';
}

// ---------------------------------------------------------------- Armes de Kaï (profil, canon vers la droite)

/** Détails évidés (aérations, nervures) : couleur du fond des menus et du HUD. */
const HOLE = '#05010f';

const WEAPON_ICONS: Record<WeaponId, string> = {
  // Pistolet laser : court, poignée inclinée, émetteur lumineux.
  laser: `<svg ${V24}><path d="M3 8.2h13.2l1.6 1.2v2.4L16.2 13h-5l-2 6.6H4.8l2-6.6H3z" fill="currentColor"/><path d="M17.8 9.5h2.8v2h-2.8z" fill="currentColor"/><circle cx="21.4" cy="10.5" r="1.7" fill="currentColor" opacity=".5"/><path d="M11.4 13v1.2c0 .9.7 1.6 1.6 1.6h1V13" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 10.6h9.5" stroke="${HOLE}" stroke-width="1" stroke-linecap="round" opacity=".55"/></svg>`,
  // Mitrailleur : chargeur tambour, manchon ajouré, poignée de transport.
  machinegun: `<svg ${V24}><path d="M1 9.6l3.2-.6v4.6L1 14.8z" fill="currentColor"/><path d="M4.2 8.6h9.4v5H4.2zM13.6 9.4H20v3.4h-6.4zM20 10.4h3v1.4h-3zM5.8 13.6h2.4l-1 4.6H4.8z" fill="currentColor"/><circle cx="11" cy="15.8" r="2.9" fill="currentColor"/><path d="M6.5 8.6V7h5v1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="15" cy="11.1" r=".7" fill="${HOLE}"/><circle cx="16.9" cy="11.1" r=".7" fill="${HOLE}"/><circle cx="18.8" cy="11.1" r=".7" fill="${HOLE}"/></svg>`,
  // Pompe : canon épais à bouche large, pompe nervurée, crosse.
  shotgun: `<svg ${V24}><path d="M.8 10.6L5 9.2v4.6l-3.6 2.8H.8zM5 9.2h5.4v4.6H5zM10.4 9.2H21V12H10.4zM21 8.6h2.2v4H21z" fill="currentColor"/><rect x="12" y="12.4" width="6.6" height="2.6" rx="1.2" fill="currentColor"/><path d="M13.7 12.8v1.8M15.3 12.8v1.8M16.9 12.8v1.8" stroke="${HOLE}" stroke-width=".9" opacity=".6"/><path d="M6.6 13.8v1.3c0 .8.6 1.4 1.4 1.4h1v-2.7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`,
  // Fusil d'assaut : long canon fin, lunette, chargeur courbe.
  rifle: `<svg ${V24}><path d="M.8 9.8h3.6l.8 3.6-4.4 1.8zM4.4 9.6h10.2v3.8H4.4zM14.6 9.8H19V13h-4.4zM19 10.6h4.2V12H19zM5.8 13.4H8l-.6 4H5.2zM9.8 13.4h2.6l1 5-2.4.6z" fill="currentColor"/><rect x="6.2" y="5.8" width="6.4" height="2.2" rx="1.1" fill="currentColor"/><path d="M8.6 8v1.6M10.6 8v1.6" stroke="currentColor" stroke-width="1.1"/></svg>`,
};

/** Icône d'une arme (jauge de chauffe du HUD, hangar). */
export function weaponIcon(id: WeaponId): string {
  return WEAPON_ICONS[id] ?? WEAPON_ICONS.laser;
}

const UPGRADE_ICONS: Record<UpgradeStat, string> = {
  damage: ICONS.damage,
  fireRate: ICONS.rapid,
  range: ICONS.range,
  cooling: ICONS.cooling,
};

/** Icône d'une amélioration d'arme (hangar). */
export function upgradeIcon(stat: UpgradeStat): string {
  return UPGRADE_ICONS[stat] ?? ICONS.damage;
}

// ---------------------------------------------------------------- Icônes d'étape (64 x 64)

const V64 = 'viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"';

const STAGE_JUNGLE = `<svg ${V64}>
<path d="M2 57c9-4 18-5.5 30-4.6S52 55 62 52" fill="none" stroke="#9dff3f" stroke-width="3" stroke-linecap="round"/>
<path d="M29.5 56c.4-9-.6-16 1.2-24h4.6c1.6 8 .6 15 1 24z" fill="#3ff7ff" opacity=".9"/>
<path d="M9 31C9 17 20 8.5 33 8.5S57 17 57 31c-6.5 3-14 4-24 4s-17.5-1-24-4z" fill="#ff3fd2"/>
<path d="M14 27.5c3-8.5 10.5-13.5 19-13.5" fill="none" stroke="#ffd0f4" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
<circle cx="23" cy="20" r="3" fill="#ffd0f4"/><circle cx="38" cy="15.5" r="2.4" fill="#ffd0f4"/><circle cx="47" cy="24" r="2.8" fill="#ffd0f4"/>
<path d="M12 56c-1-5 1-9 5-11M17 45c-2 0-3.5 1-4 3" fill="none" stroke="#9dff3f" stroke-width="2.2" stroke-linecap="round"/>
<path d="M51 55c1-4.5-.5-8-4-10" fill="none" stroke="#3ff7ff" stroke-width="2.2" stroke-linecap="round"/>
<circle cx="45" cy="40" r="1.6" fill="#3ff7ff"/><circle cx="20" cy="38" r="1.3" fill="#9dff3f"/><circle cx="54" cy="36" r="1.1" fill="#ff9adf"/>
</svg>`;

const STAGE_MOON = `<svg ${V64}>
<ellipse cx="34" cy="24" rx="27" ry="6.5" fill="none" stroke="#ffc27a" stroke-width="2" opacity=".55" transform="rotate(-14 34 24)"/>
<circle cx="34" cy="24" r="15" fill="#8d80c4"/>
<path d="M34 9a15 15 0 0 1 0 30 11 15 0 0 0 0-30z" fill="#4c3f86" opacity=".7"/>
<circle cx="28" cy="19" r="3.2" fill="#6f62a8"/><circle cx="37" cy="29" r="2.2" fill="#6f62a8"/><circle cx="39" cy="17" r="1.5" fill="#6f62a8"/>
<path d="M8.5 27.7c8 4 26 5.3 44-.5" fill="none" stroke="#ffc27a" stroke-width="2" opacity=".85"/>
<path d="M2 57h60" stroke="#c9b8ff" stroke-width="3" stroke-linecap="round"/>
<path d="M13 57l4.5-15 4.5 15z" fill="#ff9a3f"/><path d="M22 57l3-9 3 9z" fill="#ffc27a"/>
<path d="M41 57l5.5-18 5.5 18z" fill="#ff9a3f"/><path d="M50 57l3-8 3 8z" fill="#ffc27a"/>
<path d="M46.5 39v18" stroke="#ffe2b8" stroke-width="1.2" opacity=".7"/>
</svg>`;

const STAGE_NEBULA = `<svg ${V64}>
<ellipse cx="47" cy="32" rx="10" ry="21" fill="none" stroke="#3ff7ff" stroke-width="4"/>
<ellipse cx="47" cy="32" rx="5.5" ry="13" fill="none" stroke="#ff3fd2" stroke-width="1.6" opacity=".8"/>
<path d="M17 28.2L4 32l13 3.8z" fill="#ff9a3f"/>
<path d="M44 32L26 28.3 18.5 20l1.5 8.2-3.5 1.3v5l3.5 1.3-1.5 8.2 7.5-8.3z" fill="#f4f7ff"/>
<path d="M34.5 30.6c2.2.3 3.6.8 4.4 1.4-.8.6-2.2 1.1-4.4 1.4-.7-.8-.7-2 0-2.8z" fill="#3ff7ff"/>
<circle cx="12" cy="14" r="1.2" fill="#fff"/><circle cx="22" cy="52" r="1" fill="#fff"/><circle cx="58" cy="8" r="1.1" fill="#9dfcff"/>
</svg>`;

const STAGE_ASTEROIDS = `<svg ${V64}>
<path d="M41 6l9 2.5 4 8-3.5 8.5-9 1.5-6.5-6.5 1-9z" fill="#7d7299" stroke="#b9acdf" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M44 12.5l3 1.5-1 3.5" fill="none" stroke="#ff9a3f" stroke-width="1.6" stroke-linecap="round"/>
<path d="M48 41l7 1.5 2.5 6-3 6-7-.5-3.5-6z" fill="#6c6188" stroke="#b9acdf" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M9 45l5-1.5 3 4-2 4.5-5 .5-2.5-4z" fill="#6c6188" stroke="#b9acdf" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M14 30.2L2 34l12 3.8z" fill="#ff9a3f"/>
<path d="M41 34L23 30.3 15.5 22l1.5 8.2-3.5 1.3v5l3.5 1.3-1.5 8.2 7.5-8.3z" fill="#f4f7ff"/>
<path d="M31.5 32.6c2.2.3 3.6.8 4.4 1.4-.8.6-2.2 1.1-4.4 1.4-.7-.8-.7-2 0-2.8z" fill="#3ff7ff"/>
<circle cx="24" cy="10" r="1.1" fill="#fff"/><circle cx="58" cy="30" r="1" fill="#fff"/>
</svg>`;

/** Icône des étapes de plateforme, par thème. */
const PLATFORM_ICONS: Record<ThemeId, string> = { jungle: STAGE_JUNGLE, moon: STAGE_MOON };

export function stageIcon(stage: StageDef): string {
  if (stage.kind === 'platform') return PLATFORM_ICONS[stage.theme];
  return stage.levelId === 'asteroids' ? STAGE_ASTEROIDS : STAGE_NEBULA;
}

// ---------------------------------------------------------------- Dégradés partagés

let defsMounted = false;

/** Monte une seule fois les dégradés référencés par les icônes (url(#xr-g-…)). */
export function ensureSvgDefs(): void {
  if (defsMounted || typeof document === 'undefined') return;
  defsMounted = true;
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  // Pas de display:none : les dégradés d'un SVG masqué ne s'affichent plus ailleurs.
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  holder.innerHTML = `<svg width="0" height="0" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="xr-g-heart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff86e6"/><stop offset="1" stop-color="#ff2f6e"/></linearGradient>
<linearGradient id="xr-g-crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8fdff"/><stop offset=".5" stop-color="#3ff7ff"/><stop offset="1" stop-color="#2a7dff"/></linearGradient>
<linearGradient id="xr-g-star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset="1" stop-color="#ffaa22"/></linearGradient>
<linearGradient id="xr-g-hex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9dfcff"/><stop offset="1" stop-color="#1fa8ff"/></linearGradient>
</defs></svg>`;
  document.body.appendChild(holder);
}
