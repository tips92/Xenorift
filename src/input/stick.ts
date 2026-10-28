// Stick fixe à 8 directions du mode plateforme : la position du doigt par rapport au centre du stick est lue
// par secteurs d'angle. Pur (ni DOM ni allocation) : les seuils se règlent ici après essai sur téléphone.
//
//   horizontal : jusqu'à 30° de part et d'autre de l'horizontale → gauche / droite seuls
//   diagonale  : de 30° à 65°
//   vertical   : au-delà de 65° → haut / bas seuls
//
// Les diagonales vers le bas sont lues telles quelles ; c'est le jeu 2D qui les traite comme ← → (pas
// d'accroupi en courant) en n'acceptant ↓ que sans ← →.

/** Seuils réglables du stick 2D. */
export const STICK_SECTORS = {
  /** Jusqu'à cet angle (degrés depuis l'horizontale) : gauche / droite seuls. */
  horizontalMaxDeg: 30,
  /** À partir de cet angle : haut / bas seuls. Entre les deux : diagonale. */
  verticalMinDeg: 65,
  /** Zone morte, en fraction du rayon : en deçà, aucune direction. */
  deadZone: 0.2,
  /** Hystérésis (degrés) : la direction en cours garde un peu plus de place (pas de clignotement sur une frontière). */
  hysteresisDeg: 4,
} as const;

/** Direction lue : x = -1 gauche / 1 droite, y = -1 bas / 1 haut, 0 = aucune. */
export interface StickDir {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

const S = STICK_SECTORS;
const RAD = Math.PI / 180;
// Tangentes des frontières : normales, puis décalées de l'hystérésis selon la direction en cours.
const TAN_H = Math.tan(S.horizontalMaxDeg * RAD);
const TAN_H_WIDE = Math.tan((S.horizontalMaxDeg + S.hysteresisDeg) * RAD);
const TAN_H_NARROW = Math.tan((S.horizontalMaxDeg - S.hysteresisDeg) * RAD);
const TAN_V = Math.tan(S.verticalMinDeg * RAD);
const TAN_V_WIDE = Math.tan((S.verticalMinDeg - S.hysteresisDeg) * RAD);
const TAN_V_NARROW = Math.tan((S.verticalMinDeg + S.hysteresisDeg) * RAD);

/**
 * Lit la direction du stick et l'écrit dans `out` (réutilisé, renvoyé).
 * dx, dy : position du doigt par rapport au centre, en px écran (dy > 0 vers le bas) ; un doigt sorti du
 * cercle compte toujours. radius : rayon du stick en px (sert à la zone morte).
 * La valeur précédente de `out` sert d'hystérésis : la remettre à { x: 0, y: 0 } quand le doigt se lève.
 */
export function readStick(dx: number, dy: number, radius: number, out: StickDir): StickDir {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  const dead = S.deadZone * (radius > 0 ? radius : 1);
  if (ax * ax + ay * ay <= dead * dead) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  let tanH = TAN_H;
  let tanV = TAN_V;
  if (out.x !== 0 && out.y === 0) {
    tanH = TAN_H_WIDE;
  } else if (out.x === 0 && out.y !== 0) {
    tanV = TAN_V_WIDE;
  } else if (out.x !== 0 && out.y !== 0) {
    tanH = TAN_H_NARROW;
    tanV = TAN_V_NARROW;
  }
  const sx = dx > 0 ? 1 : -1;
  const sy = dy < 0 ? 1 : -1; // écran : y vers le bas ; ici 1 = haut
  if (ay <= ax * tanH) {
    out.x = sx;
    out.y = 0;
  } else if (ay >= ax * tanV) {
    out.x = 0;
    out.y = sy;
  } else {
    out.x = sx;
    out.y = sy;
  }
  return out;
}
