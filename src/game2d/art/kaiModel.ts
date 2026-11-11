import { FRAME_SIZE } from './keys';

// Contrat du modèle Blender de Kaï (art/kai.blend → art/kai.glb).
// Le jeu 2D reste en sprites : le .glb est rendu de profil dans la frame 64×80, pieds en bas, vers la droite.
// Pas encore de squelette : une seule pose, recopiée sur toutes les frames. Le bras proche est masqué,
// l'arme continue de pivoter avec le sprite du bras (ARM_RIG).

/** Servi par le serveur de dev (hors build de production). */
export const KAI_GLB_URL = '/art/kai.glb';

/** Part de la frame occupée par la hauteur du modèle. Le reste est vide au-dessus du casque ; les pieds touchent le bas. */
export const KAI_FILL = 0.9;

/** Rendu plus grand, puis réduit à 64×80. */
export const KAI_BAKE_SCALE = 4;

export const KAI_FRAME = FRAME_SIZE.player;

/**
 * Bras du côté de la caméra. Dans Blender, Kaï fait face à −Y : ce côté est .R
 * quand on le regarde depuis −X pour qu'il aille vers la droite de l'écran.
 */
export const KAI_NEAR_ARM: readonly string[] = [
  'Épaule.R',
  'Bras.R',
  'Brassard.R',
  'Poignet.R',
  'Écran_poignet.R',
  'Gant.R',
  'Écusson.R',
];
