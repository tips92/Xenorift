# Voix d'arrimage (EVA)

Clips de la voix **EVA** pour l'essai d'arrimage (`preview/dock.ts`). Fichiers fournis, donc exception permise à
« aucun fichier son ». `preview/dock.ts` les charge par `import.meta.glob` : seule la page d'arrimage les embarque.
Ils sont rognés à la lecture (silences de début et de fin) et la durée rognée cadence les alertes. Un fichier absent
n'est pas une erreur : l'alerte reste en texte et bip (mode « Voix : EVA »).

- Source : ElevenLabs, voix `weA4Q36twV5kwSaTEL0Q` (« Eva - Futuristic Robot Helper », voix de bibliothèque),
  modèle `eleven_v4`, une prise par ligne. mp3 mono 44,1 kHz 128 kb/s. Générés depuis la session Cogitonium du
  12/11 (commit `4154bab`, branche `claude/eleven-labs-mcp-connection-709b6f`).
- Droits : vérifier la licence de la voix de bibliothèque et du plan ElevenLabs pour un usage commercial avant la
  mise en ligne.

## Lignes (`<nom>.mp3`) et alerte de `VOICE`

| nom | texte | alerte | état |
|---|---|---|---|
| `dock_100m` | Arrimage dans 100 mètres. | `d100` | à générer |
| `dock_50m` | Arrimage dans 50 mètres. | `d50` | fait |
| `dock_10m` | Arrimage dans 10 mètres. | `d10` | fait |
| `count_4` | Quatre. | `c4` | fait |
| `count_3` | Trois. | `c3` | fait |
| `count_2` | Deux. | `c2` | fait |
| `count_1` | Un. | `c1` | à générer |
| `drift_left` | Attention, dérive à gauche. | `driftL` | à générer |
| `drift_right` | Attention, dérive à droite. | `driftR` | fait |
| `drift_up` | Attention, dérive vers le haut. | `driftU` | à générer |
| `drift_down` | Attention, dérive vers le bas. | `driftD` | à générer |
| `impact_imminent` | [urgently] Impact imminent. | `urgent` | à générer |
| `speed_too_high` | [urgently] Vitesse excessive. Ralentissez. | `speed` | à générer |
| `collision` | [urgently] Collision. | `collision` | à générer |
| `aligned` | Alignement correct. | `aligned` | fait |
| `contact` | Contact. | `contact` | fait |
| `docking_success` | Arrimage réussi. | `success` | à générer |
| `docking_failed` | Échec de l'arrimage. | `fail` | à générer |

Sans fichier prévu (texte et bip seulement) : `engage`, `d500`, `d300`, `reduce`, `fuel`, `perfect`.
`[urgently]` est une balise de jeu d'acteur du modèle `eleven_v4` (pas prononcée).
