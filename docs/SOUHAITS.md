# Xeno Rift — liste de souhaits

Évolutions voulues après la démo v0.1 ([GDD.md](GDD.md)). La trame de la campagne est dans
[HISTOIRE.md](HISTOIRE.md). Liste vivante : on coche `[x]` quand c'est fait et vérifié, on déplace une idée
de « à discuter » vers « retenu » quand elle est validée.

Rappel des contraintes du projet : tout est dessiné par code et les sons sont synthétisés, donc chaque
nouvelle arme, boss ou décor demande son dessin et ses sons ; viser 60 i/s sur un mobile milieu de gamme.

## Où on en est (27/10/2026)

- Toutes les décisions prises avec l'utilisateur sont dans ce fichier, dans [HISTOIRE.md](HISTOIRE.md)
  (validée) et dans la section « Décisions » de chaque plan technique.
- Plans des étapes 1 à 3 **validés et prêts à coder** : [plans/README.md](plans/README.md) donne l'état
  de chaque étape et la prochaine action.
- **Aucun code de la feuille de route n'est écrit.** Git est en place depuis le 27/10 au soir (premier
  commit `bda3e52`) : on peut commencer l'étape 1.
- Reste à faire côté conception : le plan de l'étape 4 (monde 1 complet), le choix des styles de niveaux
  bonus, les réglages chiffrés (armes, prix) après essai sur téléphone.
- Organisation du code et des documents : [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Souhaits retenus

### 1. Mondes et niveaux

Aujourd'hui : 2 mondes (Jungle de Xéna, Lune Krator), chacun avec 1 niveau plateforme suivi d'un vol 3D.

**Décidé :** 5 mondes de 3 niveaux plateforme + 1 vol, soit 20 étapes. La créature géante du monde est
loin au niveau 1, plus proche au niveau 2, et c'est le boss du niveau 3. Une fois battue, Kaï monte dans
la Comète et décolle. Le vol suit le même principe avec une créature spatiale.

- [ ] Passer la Jungle et la Lune au nouveau format (2 niveaux plateforme à créer pour chacune)
- [ ] Créer Boréa (glace), Vulkar (volcans) et le Cœur de la Faille (proposés dans l'histoire)
- [ ] Créature géante qui se rapproche d'un niveau à l'autre, et qui agit déjà au niveau 2
- [ ] Une mécanique propre à chaque monde : champignons qui font rebondir, gravité faible, sol qui glisse,
      lave qui monte, gravité qui s'inverse
- [ ] Pour chaque monde : décor, 4 ennemis, créature géante, musique (comme la Jungle et la Lune)
- [ ] Remplacer l'écran « Fin de la démo » par la fin de l'histoire

### 2. Armes et bonus

Aujourd'hui : pistolet laser avec jauge de surchauffe ; bonus temporaires tir triple (15 s), bouclier
(1 coup) et double saut (20 s).

Plan technique : [plans/02-armes.md](plans/02-armes.md).

- [ ] Arme équipée conservée d'un niveau à l'autre (enregistrée dans la sauvegarde)
- [ ] Pistolet laser : arme de départ (l'actuelle)
- [ ] Mitrailleur : moyenne portée, cadence élevée
- [ ] Pompe : courte portée, tir en gerbe, gros dégâts
- [ ] Fusil d'assaut : tir en rafale, longue portée
- [ ] Déblocage : un plan d'arme sur chacun des boss des vols 1 à 3, puis achat et amélioration à l'établi
- [ ] Chaque arme a sa portée, sa cadence, ses dégâts, sa surchauffe, son visuel et son son
- [ ] Arme équipée visible sur Kaï et dans le HUD
- [ ] Bonus temporaire : vitesse de course
- [ ] Bonus temporaire : cadence de tir
- [ ] Bonus bouclier conservé (absorbe 1 coup)
- [ ] Double saut retiré des bonus : compétence apprise en battant le premier gardien, gardée ensuite
- [ ] Tir triple supprimé (la pompe prend le relais)

**Décidé :** surchauffe pour toutes les armes, pas de munitions (rien de plus à gérer sur un écran
tactile). Chaque arme chauffe à son rythme.

### 3. Hangar entre les niveaux

**Décidé :** améliorations définitives, pas de revente.

Plan technique : [plans/03-hangar.md](plans/03-hangar.md).

- [ ] Hangar dans la Comète en orbite : on y monte par la balise de LUMA en fin de niveaux 1 et 2, et en
      décollant après le niveau 3
- [ ] Établi : acheter les armes débloquées et les améliorer (dégâts, cadence, portée, refroidissement)
- [ ] Atelier de la Comète : mitrailleuse, bouclier renforcé, meilleur turbo…
- [ ] Les cristaux ramassés servent de monnaie
- [ ] Aperçu de la Comète personnalisée et de Kaï avec son arme (en 2D d'abord, 3D plus tard)
- [ ] La Comète a un canon léger dès le départ ; la mitrailleuse est sa première amélioration
- [ ] Ennemis spatiaux à abattre en vol 3D ; tir automatique quand une cible est devant (option tir manuel)
- [ ] Tous les cristaux ramassés vont dans la réserve, même en rejouant ; perdus si l'étape est ratée
- [ ] Hangar accessible entre deux étapes et depuis l'écran Niveaux
- [ ] Les naufragés secourus rejoignent l'équipage et ouvrent de nouveaux services (voir l'histoire)
- [ ] Cœur supplémentaire achetable (maximum 5)
- [ ] Drone compagnon achetable : suit Kaï, attire les cristaux proches ou tire de temps en temps

### 4. Boss

**Décidé :** un mini-boss à la fin des niveaux 1 et 2, le gardien au niveau 3, un boss dans chaque vol.
Toujours un point de contrôle juste avant chaque combat.

- [ ] Mini-boss de fin des niveaux 1 et 2 : grande version d'un ennemi du monde (10 au total)
- [ ] Gardien au niveau 3 : la créature vue au loin (méduse-baleine, ver des sables, colosse de givre,
      salamandre de magma, puis Éon)
- [ ] Après la victoire : cinématique de libération, nouvelle compétence, embarquement et décollage
- [ ] Boss dans chaque vol 3D (léviathan, ver cosmique, raie solaire, Sentinelle, puis la fuite finale)
- [ ] Barre de vie, 2 ou 3 phases, point faible lisible
- [ ] Musique de boss et effets d'apparition / de défaite

### 5. Contrôles 2D : stick à deux axes

Aujourd'hui : pad gauche ◀ ▶ (horizontal seulement), boutons Saut et Tir à droite. Les plateformes
traversables par le dessous existent déjà dans les niveaux.

**Décidé :** le stick ne fait pas sauter, le saut reste sur le bouton Saut.

Plan technique : [plans/01-controles.md](plans/01-controles.md).

- [ ] Le pad gauche devient un stick à deux axes
- [ ] Haut maintenu + Tir : tirer vers le haut
- [ ] Haut + côté maintenus + Tir : tirer en diagonale
- [ ] Haut devant une porte : entrer (ruines, salles secrètes, naufragés)
- [ ] Bas : s'accroupir (esquiver les tirs ennemis hauts)
- [ ] Bas sur un support traversable : descendre d'un étage
- [ ] Nouveaux supports traversables : branches, lianes, passerelles…
- [ ] Seuils d'angle nets entre droit devant, diagonale et vers le haut
- [ ] Clavier : ↑ / Z pour viser en haut et entrer (avec ← → pour la diagonale), ↓ / S pour s'accroupir
      et descendre

### 6. Niveaux bonus

- [ ] Accès par les objets secrets cachés dans les niveaux
- [ ] Choisir les styles de jeu (pistes : tir à défilement à bord de la Comète, course en jetpack
      automatique, chute libre entre des obstacles, défense de la Comète contre des vagues d'ennemis,
      course de rover)
- [ ] Récompense : cristaux en plus ou pièce rare pour le hangar

**À discuter :** quels styles en premier ? Rien ne presse, ils arrivent en dernier.

### 7. Histoire et cinématiques

Détail dans [HISTOIRE.md](HISTOIRE.md).

- [ ] LUMA, l'ordinateur de bord : messages radio avec portrait et bips synthétisés
- [ ] Tutoriel dans le niveau 1, donné par LUMA au moment où on a besoin de chaque commande
- [ ] Cinématique : prologue
- [ ] Cinématique : libération du gardien (même modèle pour les mondes 1 à 4)
- [ ] Cinématique : les fresques des Astréens (Vulkar)
- [ ] Cinématique : le piège d'Éon (début du monde 5)
- [ ] Cinématique : finale et épilogue
- [ ] Bouton Passer sur toutes les cinématiques
- [ ] Le Vide : zones et ennemis éteints (gris, fissures noires, reflets rouges)
- [ ] Portes vers les ruines astréennes (fresques, morceaux d'histoire)
- [ ] Un naufragé à secourir par monde, du monde 1 au monde 4
- [ ] Balises de LUMA en fin de niveaux 1 et 2

---

## Idées retenues (27/10/2026)

- [ ] **Carte galactique** pour choisir l'étape : remplace les 4 cartes et grandit avec les mondes
- [ ] **Réglage des contrôles tactiles** : taille, position et opacité des boutons, mode gaucher
- [ ] **Objets secrets** : 3 par niveau, bien cachés ; les trouver débloque les niveaux bonus
- [ ] **Les compétences ouvrent des passages dans les niveaux déjà finis** : certains objets secrets ne
      s'atteignent qu'en revenant avec le double saut, le saut mural ou le grappin
- [ ] **Nouveaux mouvements de Kaï**, un par gardien vaincu : double saut, glissade, saut mural, grappin
      (qui s'accroche aux lianes et aux anneaux)
- [ ] **Défis par niveau** : sans dégât, contre la montre, tous les ennemis → badges
- [ ] **Niveaux de difficulté** : en facile, plus de cœurs et de points de contrôle
- [ ] **Contre-la-montre** avec le fantôme de son meilleur passage
- [ ] **Succès** à débloquer
- [ ] **Journal de bord** : chaque ennemi et créature rencontrés s'y ajoutent avec une fiche
- [ ] **Plusieurs emplacements de sauvegarde**
- [ ] **Préparer la publication sur le Play Store** : icône, écran de démarrage, fiche du jeu, signature
      de version (pour plus tard)
- [ ] **Ennemis touchés par le Vide** : version sombre et plus résistante des ennemis normaux. On les
      réutilise d'un monde à l'autre et on voit le Vide gagner du terrain à mesure qu'on approche de la Faille.
- [ ] **Confort et accessibilité** : réduire les secousses et les flashs (les boss en auront beaucoup),
      couleurs des projectiles adaptées aux daltoniens, taille des textes.
- [ ] **Mode Boss** (après la fin du jeu) : enchaîner tous les boss contre la montre.
- [ ] **Nouvelle partie +** : recommencer l'histoire avec des ennemis plus coriaces, en gardant armes et
      améliorations.
- [ ] **Couleurs de Kaï et de la Comète** : combinaisons et peintures à débloquer avec des cristaux ou des
      succès. Peu coûteux, puisque tout est dessiné par code.
- [ ] **Juke-box au hangar** : réécouter les musiques des mondes déjà visités.
- [ ] **Vol du jour** : un parcours 3D généré chaque jour à partir de la date, avec son meilleur score.
- [ ] **Manette Bluetooth** : pour jouer sur tablette ou sur un téléphone branché à la télé.
- [ ] **Mode économie de batterie** : 30 i/s et effets allégés.

---

## Ordre de travail

1. **Contrôles** : stick à deux axes (viser en haut, portes, s'accroupir, descendre), réglage des boutons.
   Petit, indépendant, vite testable sur téléphone.
2. **Armes et nouveaux bonus** : le hangar et les boss en dépendent.
3. **Hangar**, en deux parties : 3a (cristaux-monnaie, écran du hangar, améliorations des armes de Kaï),
   puis 3b (tir de la Comète, ennemis spatiaux, modules) ; la balise de LUMA à la fin ou en début d'étape 4.
4. **Monde 1 complet au nouveau format** : 3 niveaux, mini-boss, méduse-baleine, double saut, vol avec le
   léviathan, LUMA, prologue et cinématique de libération. Il sert de modèle : on valide tout sur un seul
   monde avant de multiplier les niveaux.
5. **Monde 2** au même format.
6. **Carte galactique**, puis Boréa, Vulkar et le Cœur de la Faille, avec les cinématiques de fin.
7. **Objets secrets et niveaux bonus**.

Les défis, succès, contre-la-montre, niveaux de difficulté et le reste s'ajoutent au fil de l'eau.
