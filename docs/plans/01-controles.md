# Étape 1 — contrôles 2D : plan technique

Première étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). **Codé et vérifié** sur la branche
`plans-etapes-1-3` (points 1 à 11 ; le point 12 reste « plus tard ») : suite e2e complète verte, documentation
à jour. Reste l'essai sur téléphone (secteurs d'angle et taille du stick). La section « Ce qui existe déjà »
décrit l'état d'avant l'étape.

## Ce que le joueur doit pouvoir faire

| Commande | Effet |
|---|---|
| Stick ← → | courir (comme aujourd'hui) |
| Stick ↑ (sans ← →) | s'arrêter et viser vers le haut ; un coup vers le haut devant une porte = entrer |
| Stick ↗ ↖ | courir en visant en diagonale |
| Stick ↓ (sans ← →) | s'accroupir : boîte de collision plus basse, tir à l'horizontale au ras du sol |
| Stick ↓ + Saut sur un support traversable | descendre d'un étage (Saut seul ou ↓ seul ne font pas tomber) |
| Bouton Saut | sauter (seul moyen de sauter) |
| Bouton Tir | tirer dans la direction visée |

Diagonales vers le bas : traitées comme ← →, pour ne pas s'accroupir par accident en courant.

## Ce qui existe déjà

- `src/input/touch.ts` : pad gauche en forme de pilule, deux moitiés ◀ ▶. Seule la position horizontale
  du doigt compte (`zoneOf(clientX)`) ; il n'y a ni haut ni bas.
- `src/input/index.ts` : `InputState` a déjà `up`, `down`, `stickX`, `stickY`. Pour l'instant `up` et `down`
  ne viennent que du clavier, et le jeu 2D ne s'en sert pas.
- `src/input/keyboard.ts` : ↑ / W **fait sauter** (`K_UP | K_JUMP`). À changer : ↑ ne doit plus sauter.
- `src/game2d/engine/PlatformScene.ts` : `processTile` laisse passer par le dessous les plateformes
  traversables (`=`) ; `processMover` fait de même pour les plateformes mobiles. Descendre d'un étage
  revient à faire renvoyer `false` à ces fonctions pendant un court instant.
- `src/game2d/engine/projectiles.ts` : `LaserPool.fire(x, y, angle)` accepte déjà n'importe quel angle.
- `src/game2d/engine/Player.ts` : corps de 34 x 70 séparé du visuel ; `gunX` / `gunY` donnent la sortie du
  canon, toujours à l'horizontale.

## Modifications prévues

### Entrées

1. **Pad → stick fixe à 8 directions** (`touch.ts`, `styles.ts`). Même emplacement et même taille
   qu'aujourd'hui, mais rond, avec une bille qui suit le doigt (comme le joystick du vol, sans
   déplacement de la base). Direction lue par secteurs d'angle :
   - droite / gauche : ±30° autour de l'horizontale ;
   - diagonales : de 30° à 65° ;
   - haut / bas : au-delà de 65°.

   Les seuils sont réglables dans un seul fichier, pour les ajuster après essai sur téléphone. Le passage
   d'une direction à l'autre sans lever le doigt est conservé.
2. **Sorties du tactile** : `up` et `down` en plus de `left` et `right`, fusionnés dans `InputState` par
   `recompute()` (le contrat de `core/types.ts` change à peine).
3. **Nouvel appui `interact`** (`InputAction`) : déclenché quand le stick passe vers le haut (front montant)
   ou quand on appuie sur ↑ au clavier. Il sert aux portes et ne se déclenche pas si Tir est maintenu.
4. **Clavier** : ↑ / Z (W en QWERTY) ne fait plus sauter. Le saut reste sur Espace et K.

### Kaï

5. **Visée** (`Player.ts`) : nouvel état `aim` : `'front' | 'diag' | 'up'`, calculé chaque frame à partir
   de l'entrée. `gunX` / `gunY` tiennent compte de la visée. Vers le haut sans ← →, Kaï s'arrête.
6. **Tir** (`weapons.ts`) : angle de 0 / π (devant), ∓π/4 (diagonale) ou −π/2 (haut). La gerbe du tir
   triple suit le même angle (le tir triple disparaît à l'étape 2).
7. **Accroupi** : boîte de collision réduite (~70 → ~46 px de haut), les pieds restent en place. Kaï ne
   peut pas se relever sous un plafond trop bas : il reste accroupi tant que la place manque.
8. **Descente d'étage** : sur une plateforme `=` ou une plateforme mobile, ↓ + Saut remplace le saut par
   un court délai (~200 ms) pendant lequel `processTile` et `processMover` laissent passer Kaï vers le
   bas. Sur un sol plein, ↓ + Saut reste un saut normal.

### Graphismes et décor

9. **Nouvelles images de Kaï** (`art/draw/player.ts`, `art/keys.ts`) : poses accroupi et accroupi qui
   tire. Pour viser, le pistolet est aujourd'hui dessiné dans chaque image ; on sort le bras armé et
   l'arme dans un sprite à part qui pivote selon la visée. Ça évite de redessiner toutes les poses pour
   le haut et la diagonale, et ça sert directement aux 4 armes de l'[étape 2](02-armes.md).
10. **Portes** : nouveau caractère `D` dans la légende des niveaux. Les portes vont par paires dans
    l'ordre de la carte (1ʳᵉ ↔ 2ᵉ, 3ᵉ ↔ 4ᵉ…), et entrer téléporte devant l'autre porte de la paire.
    C'est assez pour les salles secrètes ; les ruines et les naufragés viendront avec le monde 1. Une petite
    flèche ▲ s'affiche au-dessus d'une porte quand Kaï est devant. `scripts/check-levels.ts` vérifie que
    les portes vont bien par paires.

### Réglage des commandes (Options)

11. **Nouvelle rubrique « Commandes »** dans `ui/screens/options.ts` : taille des boutons (3 crans),
    opacité (3 crans), mode gaucher (stick à droite, boutons à gauche : Saut et Tir en 2D, Turbo en vol).
    Ces réglages s'ajoutent à `Settings` dans `core/save.ts` ; les anciennes sauvegardes reçoivent les
    valeurs par défaut, et `load()` remplace aussi une valeur du mauvais type (crans bornés à 0..2).
12. Plus tard, si besoin : placement libre des boutons en les faisant glisser.

## Tests

- **À adapter** : `tests/e2e/scenarios/touch-controls.mjs` et `background-2d.mjs` visent les moitiés
  gauche et droite de `.xr-dpad`, et `small-screens.mjs` vérifie sa place à l'écran. On garde la classe
  `.xr-dpad` sur le nouveau stick pour limiter les changements.
- **Nouveau scénario `aim-crouch-drop`** : laser vers le haut et en diagonale (sens des projectiles),
  hauteur du corps accroupi, passage à travers une plateforme `=` et à travers une plateforme mobile
  (Lune), aller-retour par une paire de portes, et ↑ au clavier qui ne fait plus sauter.
- **Ajoutés en cours de route** : `touch-options` (rubrique Commandes, anciennes sauvegardes, persistance,
  changement depuis la Pause, gaucher en 2D et en vol) et `art-preview` (suite `diag` : captures de
  `preview/art.html`, dont le bras armé, les poses accroupies et les portes).
- **Vérifications habituelles** : `npm run typecheck`, `npm run check-levels`, `npm run build`, puis la
  suite e2e complète.
- **Essai sur téléphone** pour régler les secteurs d'angle et la taille du stick.

## Documentation à mettre à jour

Fait le 28/10/2026 (ainsi que `CLAUDE.md`, `docs/ARCHITECTURE.md` et `docs/plans/README.md`).

- `docs/GDD.md` : section « Contrôles » du mode plateforme.
- `README.md` : touches du clavier.
- `tests/e2e/README.md` : description des contrôles tactiles.
- `docs/SOUHAITS.md` : cocher les cases de la section 5.

## Ordre de réalisation

1. Entrées : stick à 8 directions, `interact`, clavier (points 1 à 4).
2. Kaï : visée, tir, accroupi, descente (points 5 à 8), avec des images provisoires.
3. Images définitives de Kaï (point 9).
4. Portes (point 10).
5. Réglage des commandes (point 11).
6. Tests, essai sur téléphone, documentation.

## Décisions (27/10/2026)

- **Descendre d'un étage : ↓ + Saut.** Geste volontaire : s'accroupir sur une plateforme pour esquiver ne
  fait pas tomber.
- **Stick rond à 8 directions**, à la place de la pilule ◀ ▶.
