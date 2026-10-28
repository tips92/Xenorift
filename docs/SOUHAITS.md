# Xeno Rift — liste de souhaits

Évolutions voulues après la démo v0.1 ([GDD.md](GDD.md)). La trame de la campagne est dans
[HISTOIRE.md](HISTOIRE.md). Liste vivante : on coche `[x]` quand c'est fait et vérifié, on déplace une idée
de « à discuter » vers « retenu » quand elle est validée.

Rappel des contraintes du projet : tout est dessiné par code et les sons sont synthétisés, donc chaque
nouvelle arme, boss ou décor demande son dessin et ses sons ; viser 60 i/s sur un mobile milieu de gamme.

## Où on en est (28/10/2026)

- Toutes les décisions prises avec l'utilisateur sont dans ce fichier, dans [HISTOIRE.md](HISTOIRE.md)
  (validée) et dans la section « Décisions » de chaque plan technique.
- **Étape 1 (contrôles 2D) codée et vérifiée** (typecheck, check-levels, build, suite e2e complète) sur la
  branche `plans-etapes-1-3` ; reste l'essai sur téléphone pour régler les secteurs d'angle et la taille du
  stick. [plans/README.md](plans/README.md) donne l'état de chaque étape et la prochaine action.
- **Étape 2 (armes et nouveaux bonus) codée et vérifiée** sur la même branche (typecheck, check-levels, build,
  suite e2e complète avec les nouveaux scénarios `weapons` et `powerups`) ; reste à régler les armes sur
  téléphone (et à écouter leurs sons).
- **Étape 3 (hangar) codée et vérifiée** sur la même branche : 3a (hangar et armes de Kaï ; nouveau scénario
  `hangar`, hangar vérifié jusqu'à 568x320) et 3b (combat en vol : canon et mitrailleuse de la Comète, tir
  automatique ou manuel, astéroïdes destructibles, ennemis spatiaux, cristaux du vol ; nouveau scénario
  `flight-combat`), suite e2e complète verte, captures et tests relus. 3b n'est pas encore commitée. Reste
  l'essai sur téléphone des étapes 1 à 3. La balise de LUMA (fin de l'étape 3) est faite avec l'étape 4.
- **Étape 4 (monde 1 complet) en cours** dans une autre discussion, sur sa propre branche
  (`claude/world-1-completion-866505`) : choix du plan 4 validés le 28/10 tels quels (le plan à jour est sur
  cette branche).
- Reste à faire côté conception : le choix des styles de niveaux bonus, les réglages chiffrés (armes, canons,
  ennemis du vol, prix) après essai sur téléphone.
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

Aujourd'hui : 4 armes à surchauffe (pistolet laser, mitrailleur, pompe, fusil d'assaut ; fiches dans
`src/core/weapons.ts`), l'arme équipée dans la sauvegarde ; bonus vitesse et cadence (12 s, cumulables) et
bouclier ; double saut = compétence (active en mode test). Avant l'étape 2 : laser seul ; tir triple (15 s),
bouclier et double saut (20 s) en bonus.

Plan technique : [plans/02-armes.md](plans/02-armes.md).

**État (28/10/2026) :** codé sur la branche `plans-etapes-1-3` et vérifié par la suite e2e complète
(scénarios `weapons` et `powerups` : projectiles, portée, visée, surchauffe et dégâts de chaque arme, bonus,
bouclier, double saut selon le mode test). Reste le réglage sur téléphone (sons compris). La sauvegarde a
un bloc `loadout` (arme équipée, armes possédées, double saut appris), relu à chaque étape ; depuis
l'étape 3a, l'arme équipée se change au hangar (enregistrée). En mode test, une arme non possédée s'y équipe
pour la session seulement, comme avec `?weapon=`. Les plans d'armes sur les boss et l'apprentissage du double
saut auprès du premier gardien viennent avec l'étape 4.

- [x] Arme équipée conservée d'un niveau à l'autre (enregistrée dans la sauvegarde : `loadout.equipped`)
- [x] Pistolet laser : arme de départ (l'actuelle)
- [x] Mitrailleur : moyenne portée, cadence élevée
- [x] Pompe : courte portée, tir en gerbe, gros dégâts
- [x] Fusil d'assaut : tir en rafale, longue portée
- [ ] Déblocage : un plan d'arme sur chacun des boss des vols 1 à 3, puis achat et amélioration à l'établi
- [x] Chaque arme a sa portée, sa cadence, ses dégâts, sa surchauffe, son visuel et son son (valeurs à
      régler sur téléphone)
- [x] Arme équipée visible sur Kaï et dans le HUD
- [x] Bonus temporaire : vitesse de course
- [x] Bonus temporaire : cadence de tir
- [x] Bonus bouclier conservé (absorbe 1 coup)
- [ ] Double saut retiré des bonus : compétence apprise en battant le premier gardien, gardée ensuite
      (retiré des bonus et rangé dans la sauvegarde à l'étape 2 ; appris auprès du gardien : étape 4)
- [x] Tir triple supprimé (la pompe prend le relais)

**Décidé :** surchauffe pour toutes les armes, pas de munitions (rien de plus à gérer sur un écran
tactile). Chaque arme chauffe à son rythme.

### 3. Hangar entre les niveaux

**Décidé :** améliorations définitives, pas de revente.

Plan technique : [plans/03-hangar.md](plans/03-hangar.md).

**État (28/10/2026) :** 3a codée (réserve de cristaux, sauvegarde version 2, écran du hangar entre deux étapes
et depuis Niveaux, améliorations des armes de Kaï, cœurs supplémentaires, bouclier renforcé et turbo de la
Comète, aperçu 2D), vérifiée par les tests navigateur (scénario `hangar`). 3b codée (canon léger et
mitrailleuse de la Comète, tir automatique ou manuel, astéroïdes destructibles, chasseurs, mines, essaims et
leurs orbes, cristaux du vol pour la réserve, jauge du canon et cristaux dans le HUD du vol), vérifiée par les
tests navigateur (scénario `flight-combat`). Les plans d'armes et l'équipage (Tess, Mira) viendront avec
l'étape 4 : d'ici là, hors mode test, seuls le niveau 1 des améliorations du laser et les modules de la Comète
s'achètent. Restent l'essai sur téléphone (prix, multiplicateurs, lisibilité du hangar ; tirs, ennemis, bouton
TIR et réglages du vol) et la balise de LUMA (faite avec l'étape 4).

- [ ] Hangar dans la Comète en orbite : on y monte par la balise de LUMA en fin de niveaux 1 et 2, et en
      décollant après le niveau 3
- [x] Établi : acheter les armes débloquées et les améliorer (dégâts, cadence, portée, refroidissement)
- [x] Atelier de la Comète : mitrailleuse, bouclier renforcé, meilleur turbo… (bouclier renforcé et turbo
      en 3a ; mitrailleuse et ses deux améliorations en 3b, vérifiées par `flight-combat`)
- [x] Les cristaux ramassés servent de monnaie
- [x] Aperçu de la Comète personnalisée et de Kaï avec son arme (en 2D d'abord, 3D plus tard)
- [x] La Comète a un canon léger dès le départ ; la mitrailleuse est sa première amélioration (3b)
- [x] Ennemis spatiaux à abattre en vol 3D ; tir automatique quand une cible est devant (option tir manuel) :
      chasseur, mine, essaim et leurs orbes, astéroïdes destructibles, cristaux du vol (3b ; réglages à faire sur
      téléphone)
- [x] Tous les cristaux ramassés vont dans la réserve, même en rejouant ; perdus si l'étape est ratée
- [x] Hangar accessible entre deux étapes et depuis l'écran Niveaux
- [ ] Les naufragés secourus rejoignent l'équipage et ouvrent de nouveaux services (voir l'histoire) ; le
      hangar sait déjà les attendre (Tess : niveaux 2 et 3 des améliorations, Mira : cœurs), le secours vient
      avec l'étape 4
- [x] Cœur supplémentaire achetable (maximum 5)
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

Aujourd'hui : stick rond fixe à 8 directions à gauche, boutons Saut et Tir à droite (l'inverse en mode
gaucher) ; détail dans le [GDD](GDD.md). Avant l'étape 1 : pad ◀ ▶ (horizontal seulement).

**Décidé :** le stick ne fait pas sauter, le saut reste sur le bouton Saut.

Plan technique : [plans/01-controles.md](plans/01-controles.md).

**État (28/10/2026) :** codé et vérifié sur la branche `plans-etapes-1-3` (typecheck, check-levels, build,
suite e2e complète, dont `touch-controls`, `aim-crouch-drop`, `touch-options` et `small-screens`). Reste
l'essai sur téléphone pour régler les secteurs d'angle (`STICK_SECTORS`, `src/input/stick.ts`) et la taille
du stick.

- [x] Le pad gauche devient un stick à deux axes (stick rond à 8 directions)
- [x] Haut maintenu + Tir : tirer vers le haut (Kaï s'arrête)
- [x] Haut + côté maintenus + Tir : tirer en diagonale
- [x] Haut devant une porte : entrer (portes `D` par paires ; pour l'instant une salle secrète dans la
      Jungle, les ruines et les naufragés viendront avec le monde 1)
- [x] Bas : s'accroupir (esquiver les tirs ennemis hauts ; ↓ + côté une fois accroupi : ramper lentement)
- [x] Bas sur un support traversable : descendre d'un étage (↓ + Saut, sur `=` et sur les plateformes mobiles)
- [ ] Nouveaux supports traversables : branches, lianes, passerelles…
- [x] Seuils d'angle nets entre droit devant, diagonale et vers le haut (30° et 65°, à affiner sur téléphone)
- [x] Clavier : ↑ / Z pour viser en haut et entrer (avec ← → pour la diagonale), ↓ / S pour s'accroupir
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
- [ ] **Réglage des contrôles tactiles** : taille, position et opacité des boutons, mode gaucher. Taille,
      opacité et mode gaucher faits à l'étape 1 (rubrique Commandes des Options) ; position : plus tard.
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

## Bugs connus (mineurs, relevés par les tests le 27/10/2026)

- [x] **Vol : 3e restauration du contexte WebGL pendant la pause** : l'étape échouait aussitôt derrière le
      menu Pause. Corrigé le 28/10 : l'abandon attend la reprise (`giveUpSoon()`, `src/game3d/flight.ts`) ;
      scénario `f1-ctx-pause` cas e.
- [x] **Canevas blanc pendant une perte de contexte** (2D et vol) : Chrome peignait le canevas en blanc avec une
      icône d'image cassée. Corrigé le 28/10 : canevas masqué jusqu'à la restauration (`engine/game.ts`,
      `game3d/renderer.ts`) ; vérifié par `j1-ctx-pause` et `f1-ctx-loss`.
- [ ] **Musique** : un changement de morceau demandé pendant une pause Capacitor joue environ 120 ms de notes
      au retour.
- [ ] **Reflets (PMREM, `src/game3d/sky.ts`)** : première compilation parfois ~9 s à froid sous Windows avec
      une carte AMD ; Android n'est pas concerné.

---

## Ordre de travail

1. **Contrôles** : stick à deux axes (viser en haut, portes, s'accroupir, descendre), réglage des boutons.
   Petit, indépendant, vite testable sur téléphone. **Codé et vérifié** ; essai sur téléphone à faire.
2. **Armes et nouveaux bonus** : le hangar et les boss en dépendent. **Codé et vérifié** ; essai sur
   téléphone à faire (réglage des armes).
3. **Hangar**, en deux parties : 3a (cristaux-monnaie, écran du hangar, améliorations des armes de Kaï),
   puis 3b (tir de la Comète, ennemis spatiaux, modules) ; la balise de LUMA en début d'étape 4.
   **3a et 3b codées et vérifiées** (suite e2e) ; essai sur téléphone à faire ; balise faite avec l'étape 4 (4a).
4. **Monde 1 complet au nouveau format** : 3 niveaux, mini-boss, méduse-baleine, double saut, vol avec le
   léviathan, LUMA, prologue et cinématique de libération. Il sert de modèle : on valide tout sur un seul
   monde avant de multiplier les niveaux. **En cours** dans une autre discussion (plan validé, branche
   `claude/world-1-completion-866505`).
5. **Monde 2** au même format.
6. **Carte galactique**, puis Boréa, Vulkar et le Cœur de la Faille, avec les cinématiques de fin.
7. **Objets secrets et niveaux bonus**.

Les défis, succès, contre-la-montre, niveaux de difficulté et le reste s'ajoutent au fil de l'eau.
