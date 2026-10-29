# Xeno Rift — liste de souhaits

Évolutions voulues après la démo v0.1 ([GDD.md](GDD.md)). La trame de la campagne est dans
[HISTOIRE.md](HISTOIRE.md). Liste vivante : on coche `[x]` quand c'est fait et vérifié, on déplace une idée
de « à discuter » vers « retenu » quand elle est validée.

Rappel des contraintes du projet : tout est dessiné par code et les sons sont synthétisés, donc chaque
nouvelle arme, boss ou décor demande son dessin et ses sons ; viser 60 i/s sur un mobile milieu de gamme.

## Où on en est (29/10/2026)

- Toutes les décisions prises avec l'utilisateur sont dans ce fichier, dans [HISTOIRE.md](HISTOIRE.md)
  (validée) et dans la section « Décisions » de chaque plan technique.
- **Étape 1 (contrôles 2D) codée et vérifiée** (typecheck, check-levels, build, suite e2e complète) sur la
  branche `plans-etapes-1-3` ; reste l'essai sur téléphone pour régler les secteurs d'angle et la taille du
  stick. [plans/README.md](plans/README.md) donne l'état de chaque étape et la prochaine action.
- **Étape 2 (armes et nouveaux bonus) codée et vérifiée** sur la même branche (typecheck, check-levels, build,
  suite e2e complète avec les nouveaux scénarios `weapons` et `powerups`) ; reste à régler les armes sur
  téléphone (et à écouter leurs sons).
- **Étape 3 (hangar) codée et vérifiée** sur la même branche : 3a (hangar et armes de Kaï ; nouveau scénario
  `hangar`, hangar vérifié jusqu'à 568x320) et 3b (combat en vol : canon et mitrailleuse de la Comète,
  astéroïdes destructibles, ennemis spatiaux, cristaux du vol ; nouveau scénario `flight-combat`), suite e2e
  complète verte, captures et tests relus. 3a et 3b sont commitées. Après le premier essai sur téléphone
  (29/10/2026) : bouton TIR dédié sous le pouce droit (tir tant qu'il est tenu, plus de tir automatique), TURBO
  au-dessus, une seule jauge d'énergie pour le tir et le turbo (branche `claude/vol-tir-bouton`, fusionnée dans
  celle de l'étape 4). Reste l'essai sur téléphone des étapes 1 à 3. La balise de LUMA (fin de l'étape 3) est
  faite avec l'étape 4 (4a).
- **Étape 4 (monde 1 complet) en cours** sur la branche `claude/world-1-completion-866505` (3b et le tir au
  bouton y sont fusionnés) :
  choix du plan 4 validés le 28/10 tels quels, plus les boss en touches et le tir au bouton en vol le 29/10.
  **Partie 4a faite et vérifiée** (nouveaux scénarios `progress-ids`, `luma-radio`, `boss-mini`), essayée sur
  téléphone le 29/10 : table des mondes et progression par identifiants, écran Niveaux en pages par monde,
  récompenses aux résultats, j1 au nouveau format (arrivée en Comète, tutoriel de LUMA par radio, ruine aux
  glyphes, arène du Blob-roi, balise de LUMA), sons du monde 1. **Partie 4b faite et vérifiée** (suite e2e
  complète 39/39, nouveaux scénarios `j2-play`, `boss-titan`, `boss-whale`, `j3-ctx-boss`) : campagne à 6 étapes,
  j2 « Canopée des spores » (champignons, la méduse-baleine qui agit, Tess, Scarabée-titan), j3 « Sanctuaire du
  gardien » (radio brouillée, combat contre la méduse-baleine, double saut), boss en touches, « Réessayer le
  combat ». Reste l'essai sur téléphone de 4b, puis 4c (cinématiques, léviathan).
- Plans 5 à 7 écrits le 29/10, choix encore à valider :
  [05-monde-2.md](plans/05-monde-2.md), [06-carte-et-mondes.md](plans/06-carte-et-mondes.md),
  [07-secrets-bonus.md](plans/07-secrets-bonus.md). Les styles de bonus proposés sont la course jetpack et la
  défense de la Comète (question 2 du plan 07).
- Reste à faire côté conception : valider ces choix, et les réglages chiffrés (armes, canons, ennemis du vol,
  prix) après essai sur téléphone.
- Organisation du code et des documents : [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Souhaits retenus

### 1. Mondes et niveaux

Aujourd'hui : 2 mondes ; la Jungle de Xéna au nouveau format (3 niveaux plateforme, mini-boss, gardienne,
puis un vol 3D), la Lune Krator à l'ancien (1 niveau plateforme, puis un vol 3D).

**Décidé :** 5 mondes de 3 niveaux plateforme + 1 vol, soit 20 étapes. La créature géante du monde est
loin au niveau 1, plus proche au niveau 2, et c'est le boss du niveau 3. Une fois battue, Kaï monte dans
la Comète et décolle. Le vol suit le même principe avec une créature spatiale.

- [ ] Passer la Jungle et la Lune au nouveau format (2 niveaux plateforme à créer pour chacune) (Jungle faite en
      4b : j2 et j3 ; la Lune : étape 5)
- [ ] Créer Boréa (glace), Vulkar (volcans) et le Cœur de la Faille (proposés dans l'histoire)
- [ ] Créature géante qui se rapproche d'un niveau à l'autre, et qui agit déjà au niveau 2 (Jungle faite en 4b :
      méduse-baleine lointaine en j1, proche en j2 avec son ombre, la secousse qui abat un tronc et la pluie de
      spores, immense en j3 ; vérifiée par `j2-play` et `boss-whale`)
- [ ] Une mécanique propre à chaque monde : champignons qui font rebondir, gravité faible, sol qui glisse,
      lave qui monte, gravité qui s'inverse (champignons faits en 4b, vérifiés par `j2-play` et check-levels)
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
saut auprès du premier gardien viennent avec l'étape 4 (4a : le plan du mitrailleur est donné en réussissant le
vol 1, en attendant le léviathan de 4c ; les récompenses sont rendues aux anciens joueurs ; 4b : le double saut
est appris en battant la méduse-baleine de j3).

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
- [x] Double saut retiré des bonus : compétence apprise en battant le premier gardien, gardée ensuite
      (retiré des bonus et rangé dans la sauvegarde à l'étape 2 ; appris en battant la méduse-baleine de j3 en 4b,
      « Compétence : double saut » aux résultats ; vérifié par `boss-whale` et `campaign-flow`)
- [x] Tir triple supprimé (la pompe prend le relais)

**Décidé :** surchauffe pour toutes les armes, pas de munitions (rien de plus à gérer sur un écran
tactile). Chaque arme chauffe à son rythme.

### 3. Hangar entre les niveaux

**Décidé :** améliorations définitives, pas de revente.

Plan technique : [plans/03-hangar.md](plans/03-hangar.md).

**État (28/10/2026) :** 3a codée (réserve de cristaux, sauvegarde version 2, écran du hangar entre deux étapes
et depuis Niveaux, améliorations des armes de Kaï, cœurs supplémentaires, bouclier renforcé et turbo de la
Comète, aperçu 2D), vérifiée par les tests navigateur (scénario `hangar`). 3b codée (canon léger et
mitrailleuse de la Comète, astéroïdes destructibles, chasseurs, mines, essaims et leurs orbes, cristaux du vol
pour la réserve, cristaux dans le HUD du vol), vérifiée par les tests navigateur (scénario `flight-combat`).
**29/10/2026**, après l'essai sur téléphone : bouton TIR dédié à la place de TURBO (tir tant qu'il est tenu, plus
de tir automatique ni d'option « Tir manuel »), TURBO au-dessus, une seule jauge « Énergie » que le tir et le
turbo font chauffer (en surchauffe, ni tir ni turbo) ; le module Turbo rend le turbo moins gourmand et l'énergie
plus rapide à refroidir. Les plans d'armes et l'équipage viennent avec l'étape 4 : plan du mitrailleur après le
vol 1 (4a), Tess secourue en j2 (4b) ouvre les niveaux 2 et 3 des améliorations ; Mira (cœurs) viendra avec le
monde 3. Restent l'essai sur téléphone (prix, multiplicateurs, lisibilité du hangar ; tirs, ennemis, boutons TIR
et TURBO, énergie du vol). La balise de LUMA est faite avec l'étape 4.

- [ ] Hangar dans la Comète en orbite : on y monte par la balise de LUMA en fin de niveaux 1 et 2, et en
      décollant après le niveau 3 (balises de j1 et j2, bouton « Atterrir » / « Redescendre » / « Décoller » au
      hangar, hangar après j3 : faits en 4a et 4b ; le décollage après le niveau 3 viendra avec la cinématique de
      libération, 4c)
- [x] Établi : acheter les armes débloquées et les améliorer (dégâts, cadence, portée, refroidissement)
- [x] Atelier de la Comète : mitrailleuse, bouclier renforcé, meilleur turbo… (bouclier renforcé et turbo
      en 3a ; mitrailleuse et ses deux améliorations en 3b, vérifiées par `flight-combat`)
- [x] Les cristaux ramassés servent de monnaie
- [x] Aperçu de la Comète personnalisée et de Kaï avec son arme (en 2D d'abord, 3D plus tard)
- [x] La Comète a un canon léger dès le départ ; la mitrailleuse est sa première amélioration (3b)
- [x] Ennemis spatiaux à abattre en vol 3D : chasseur, mine, essaim et leurs orbes, astéroïdes destructibles,
      cristaux du vol (3b ; réglages à faire sur téléphone)
- [x] Vol : bouton TIR dédié (tir tant qu'il est tenu, aide à la visée vers la cible devant la Comète) à la place
      de TURBO, TURBO au-dessus, une seule jauge d'énergie pour le tir et le turbo (demande du 29/10/2026 après
      essai sur téléphone ; remplace le tir automatique et l'option « Tir manuel »)
- [x] Tous les cristaux ramassés vont dans la réserve, même en rejouant ; perdus si l'étape est ratée
- [x] Hangar accessible entre deux étapes et depuis l'écran Niveaux
- [ ] Les naufragés secourus rejoignent l'équipage et ouvrent de nouveaux services (voir l'histoire) ; le
      hangar sait déjà les attendre (Tess : niveaux 2 et 3 des améliorations, Mira : cœurs). Tess faite en 4b :
      secourue en j2, à bord à la réussite, « Tess à l'établi », niveaux 2 et 3 ouverts (vérifié par `j2-play` et
      `hangar`) ; les autres avec leur monde
- [x] Cœur supplémentaire achetable (maximum 5)
- [ ] Drone compagnon achetable : suit Kaï, attire les cristaux proches ou tire de temps en temps

### 4. Boss

**Décidé :** un mini-boss à la fin des niveaux 1 et 2, le gardien au niveau 3, un boss dans chaque vol.
Toujours un point de contrôle juste avant chaque combat.

**État (29/10/2026) :** cadre des boss 2D fait en 4a (arène fermée par des barrières, point de contrôle juste
avant, caméra calée, barre de vie commune au 2D et au vol, boss remis à neuf après une vie perdue, prime de
2 000 points) avec le premier mini-boss, le **Blob-roi** (j1). En 4b : le **Scarabée-titan** (j2), la
**méduse-baleine** (gardienne de j3, 3 phases, prime de 5 000 points, sa défaite termine le niveau), les boss en
touches (décidé le 29/10 : le Blob-roi était trop dur ; 4 touches pour un mini-boss, 6 pour la gardienne) et
« Réessayer le combat » (reprise au point de contrôle d'avant l'arène, avec l'état de ce moment, sans prime de
vies) ; vérifiés par `boss-mini`, `boss-titan`, `boss-whale`, `j3-ctx-boss`. Difficulté à régler sur téléphone.

- [ ] Mini-boss de fin des niveaux 1 et 2 : grande version d'un ennemi du monde (10 au total) (2 sur 10 : le
      Blob-roi et le Scarabée-titan)
- [ ] Gardien au niveau 3 : la créature vue au loin (méduse-baleine, ver des sables, colosse de givre,
      salamandre de magma, puis Éon) (1 sur 5 : la méduse-baleine)
- [ ] Après la victoire : cinématique de libération, nouvelle compétence, embarquement et décollage (compétence
      donnée aux résultats en 4b ; cinématique en 4c)
- [ ] Boss dans chaque vol 3D (léviathan, ver cosmique, raie solaire, Sentinelle, puis la fuite finale)
- [ ] Barre de vie, 2 ou 3 phases, point faible lisible (barre en crans, 2 et 3 phases faites ; lisibilité des
      points faibles à juger sur téléphone)
- [ ] « Réessayer le combat » si les vies tombent à zéro contre un boss (2D faite en 4b, vérifiée par `boss-mini`,
      `boss-titan`, `boss-whale` et `j3-ctx-boss` ; en vol avec le léviathan, 4c)
- [x] Musique de boss et effets d'apparition / de défaite (musique `boss`, effets d'apparition, de coup, de
      phase et de défaite, joués par le Blob-roi ; musique du gardien à 3 intensités prête pour 4b)

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
- [x] Haut devant une porte : entrer (portes `D` par paires ; dans la Jungle, la salle murée est devenue la
      ruine astréenne en 4a ; en j2, Haut devant Tess la secourt, 4b)
- [x] Bas : s'accroupir (esquiver les tirs ennemis hauts ; ↓ + côté une fois accroupi : ramper lentement)
- [x] Bas sur un support traversable : descendre d'un étage (↓ + Saut, sur `=` et sur les plateformes mobiles)
- [x] Nouveaux supports traversables : branches, lianes, passerelles… (4a : dans la Jungle, les `=` sont
      dessinés en branches, lianes ou passerelles, une famille par rangée ; même comportement)
- [x] Seuils d'angle nets entre droit devant, diagonale et vers le haut (30° et 65°, à affiner sur téléphone)
- [x] Clavier : ↑ / Z pour viser en haut et entrer (avec ← → pour la diagonale), ↓ / S pour s'accroupir
      et descendre

### 6. Niveaux bonus

- [ ] Accès par les objets secrets cachés dans les niveaux
- [ ] Choisir les styles de jeu (pistes : tir à défilement à bord de la Comète, course en jetpack
      automatique, chute libre entre des obstacles, défense de la Comète contre des vagues d'ennemis,
      course de rover)
- [ ] Récompense : cristaux en plus ou pièce rare pour le hangar

**Choix proposés** dans [plans/07-secrets-bonus.md](plans/07-secrets-bonus.md) (pas encore validés) : d'abord la
course en jetpack et la défense de la Comète. Le tir à défilement, la chute libre et le rover attendent l'essai
sur téléphone de ces deux-là.

### 7. Histoire et cinématiques

Détail dans [HISTOIRE.md](HISTOIRE.md).

**État (29/10/2026) :** radio de LUMA et tutoriel de j1 faits en 4a (scénario `luma-radio`), rythme validé sur
téléphone ; en 4b, radio de j2 (champignons, la méduse-baleine, dialogue de Tess) et radio brouillée de j3.
Lecteur de cinématiques, prologue et libération dessinés (`src/story/`, page `preview/story.html`), branchés dans
le jeu en 4c.

- [x] LUMA, l'ordinateur de bord : messages radio avec portrait et bips synthétisés (bulle non bloquante en haut à
      gauche, file de 2 messages, figée en pause)
- [x] Tutoriel dans le niveau 1, donné par LUMA au moment où on a besoin de chaque commande (11 messages, muets
      une fois j1 réussi ; texte du clavier sur PC)
- [ ] Cinématique : prologue
- [ ] Cinématique : libération du gardien (même modèle pour les mondes 1 à 4)
- [ ] Cinématique : les fresques des Astréens (Vulkar)
- [ ] Cinématique : le piège d'Éon (début du monde 5)
- [ ] Cinématique : finale et épilogue
- [ ] Bouton Passer sur toutes les cinématiques
- [ ] Le Vide : zones et ennemis éteints (gris, fissures noires, reflets rouges)
- [x] Portes vers les ruines astréennes (fresques, morceaux d'histoire) (4a : ruine de j1, glyphes qui s'allument
      et message de LUMA ; une par monde ensuite)
- [ ] Un naufragé à secourir par monde, du monde 1 au monde 4 (monde 1 : Tess, en j2, faite en 4b)
- [x] Balises de LUMA en fin de niveaux 1 et 2 (j1 en 4a, j2 en 4b ; vérifiées par `j1-play`, `boss-mini`,
      `j2-play`)

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
      couleurs des projectiles adaptées aux daltoniens, taille des textes. (Depuis 4b, toutes les secousses du jeu
      2D passent par une seule fonction, `Effects.shake`, prête pour un réglage.)
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
   monde avant de multiplier les niveaux. **En cours** (plan validé, branche `claude/world-1-completion-866505`) :
   4a (fondations, j1) et 4b (la Jungle : j2, j3, Tess, mini-boss et gardienne) faites et vérifiées ; prochaine :
   4c (histoire et vol).
5. **Monde 2** au même format. Plan écrit, à valider : [plans/05-monde-2.md](plans/05-monde-2.md).
6. **Carte galactique**, puis Boréa, Vulkar et le Cœur de la Faille, avec les cinématiques de fin. Plan écrit,
   à valider : [plans/06-carte-et-mondes.md](plans/06-carte-et-mondes.md).
7. **Objets secrets et niveaux bonus**. Plan écrit, à valider : [plans/07-secrets-bonus.md](plans/07-secrets-bonus.md).

Les défis, succès, contre-la-montre, niveaux de difficulté et le reste s'ajoutent au fil de l'eau.
