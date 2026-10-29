# Étape 6 — carte galactique, Boréa, Vulkar, Cœur de la Faille : plan technique

> **État au 29/10/2026 : choix proposés, rien n'est codé.** On code après validation. L'étape suppose les
> étapes **4 et 5 terminées** (deux mondes au nouveau format, libération, boss de vol, glissade). Elle ajoute
> la carte, puis **trois mondes** sur le même cadre. Le Cœur de la Faille s'en écarte exprès (Éon, fuite, plus
> de radio).
>
> **Ajusté le 29/10 au soir, puis une seconde fois.** La carte ne dessine pas les mondes absents. Pas de
> journal. Fresques en fin de v2. Le vent est un nombre sur le niveau, pas un événement. Les mini-boss sont
> des copies, pas des machines nouvelles. Rook ajoute un cran au bouclier déjà vendu. La salle inversée reste
> dans la même carte. La fuite réutilise le chrono du vol. Les aides d'Éon déclenchent des événements déjà
> écrits.

Sixième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). Trame :
[HISTOIRE.md](../HISTOIRE.md) (mondes 3 à 5, fresques, piège, finale).

## À valider

1. **Quatre parties** : 6a la carte, 6b Boréa, 6c Vulkar, 6d la Faille. Chacune laisse un jeu finissable.
   *D'accord ?*
2. **La carte remplace l'écran Niveaux** (les pages par monde disparaissent). Elle dessine les mondes de
   `WORLDS`, plus un seul point gris sans nom tant que la campagne n'est pas finie. *Remplacer, ou garder
   les pages en secours ?*
3. **Identifiants** : Boréa `b1 b2 b3 f3`, Vulkar `v1 v2 v3 f4`, Faille `r1 r2 r3 f5`. Parcours `helia`,
   `rift`, `collapse`. On ne renomme plus rien ensuite. *D'accord ?*
4. **Mira (Boréa)** débloque les **cœurs** (déjà codés, déjà verrouillés sur elle). Le journal de bord reste
   dans les idées « au fil de l'eau » : un écran de fiches pendant Boréa double le coût du monde pour un
   objet qui n'ouvre aucun niveau. *Cœurs seuls, ou journal quand même dans 6b ?*
5. **Rook (Vulkar)** débloque **un cran de plus** du bouclier renforcé déjà en vente (+1 bouclier, un prix,
   `crew: 'rook'` sur ce cran seul). Pas d'objet nouveau, pas de cran sur la mitrailleuse ni le turbo.
   *D'accord ?*
6. **Saut mural** : contre un mur, stick vers le mur opposé + Saut. Un mural par temps en l'air, le double
   saut reste disponible une fois (pas de délai qui avale l'appui). **Grappin** : ↑ près d'un anneau `H`
   (4 tuiles), Kaï y est tiré. Ni l'un ni l'autre n'est requis pour battre le boss qui l'apprend. *Ces gestes ?*
7. **Fresques** : glyphes dans la forge de v2 (déjà le système de j1), cinématique de 20 s en `after` de v2,
   avec Passer. Pas de cinématique au milieu du niveau. *À la fin de v2, ou au milieu quand même ?*
8. **Monde 5** : LUMA coupée (pas de bulle), pas de naufragé, pas de compétence, pas de plan d'arme. Éon se
   combat, elle ne se « libère » pas. Le dernier vol est une **fuite**, sans barre de boss. *D'accord ?*
9. **Le Vide sur les niveaux** commence à Vulkar (zones grises + ennemis teintés, **mêmes** points de vie)
   et couvre le monde 5. Boréa ne teinte que son gardien, comme la Jungle. *D'accord ?*

## Objectif

- **6a.** Le choix du niveau est une carte de la galaxie. Ozzo n'y marque encore rien (étape 7).
- **6b.** Boréa : sol qui glisse, blizzard, colosse de givre, **saut mural**, Mira, vol « Tempête d'Hélia »,
  **raie solaire**, plan du **fusil**.
- **6c.** Vulkar : lave qui monte, salamandre, **grappin**, Rook, fresques, vol « Abords de la Faille »,
  **Sentinelle** (pas de quatrième arme).
- **6d.** Cœur de la Faille : gravité qui s'inverse, piège d'Éon, combat contre Éon aidé des gardiens déjà
  libérés, finale, fuite devant le Vide, épilogue. L'écran « Fin de la démo » disparaît.

## Ce qui existe déjà

- Écran Niveaux : `ui/screens/select.ts`, une page `.select-page[data-world]` par entrée de `WORLDS`,
  glissement, étoiles du monde, cartes `data-stage`. La progression (`isUnlocked`, `nextToPlay`) ne dépend
  pas de cet écran : la carte doit l'appeler, pas la recopier.
- `WORLDS` n'a que la Jungle et la Lune. `THEME_IDS` = `jungle | moon`. `COURSE_IDS` = `nebula | asteroids`.
  `CrewId` = `tess | mira` (Mira nommée, **jamais donnée**). `Loadout.skills` = `doubleJump` plus `slide`
  après l'étape 5.
- Cœurs : achat hangar déjà refusé sans Mira (`hangar.ts`, décision 19 du plan 04). Il suffit qu'une
  récompense `crew: mira` existe.
- Modules de la Comète : mitrailleuse 0–3, bouclier 0–2, turbo 0–2 (`ShipModules`). Pas de quatrième niveau,
  pas de Rook.
- Cadre recopié tel quel d'un monde à l'autre : table `WORLDS`, niveau `part` 1–4, `start` vaisseau / faisceau,
  `creature` far / near / looming, balise, naufragé `N`, arène, boss en touches, libération `perWorld`,
  récompenses, boss de vol après le dernier portail. check-levels et les `Record<ThemeId, …>` (palette,
  tuiles, ennemis, portes, parallaxe) **échouent à la compilation** tant qu'un thème nouveau n'a pas sa branche.
- Cinématiques : `before` / `after` sur l'étape, lecteur `src/story/`. Rien ne lance une cinématique **pendant**
  un niveau. `CUTSCENE_IDS` = `prologue | liberation`.
- Écran de fin : la dernière étape n'a pas de suivante (`stages.ts` / `flow.ts`) et tombe sur « Fin de la démo ».
- Décision 9 du plan 04 : le Vide ne teinte que le gardien du monde 1. Les palettes de zones étaient renvoyées
  à cette étape.
- Journal, succès, peintures, juke-box : idées retenues, **pas** dans cette étape.

## Choix proposés (29/10/2026)

1. **Quatre parties.** 6a est petite et se teste seule (les deux mondes actuels sur la carte). 6b, 6c, 6d
   suivent l'ordre de l'histoire : chacune ajoute un monde **fermé** (3 niveaux + 1 vol) avant la suivante.
   On ne laisse pas un monde à un seul niveau « en attendant ».
2. **Carte.** `ui/screens/map.ts` remplace `select.ts` dans `App.ts`. Fond dessiné par code. Un monde de
   `WORLDS` = un point nommé ; un tap ouvre ses étapes, les mêmes cartes qu'aujourd'hui (`data-stage`,
   étoiles, cadenas de `isUnlocked`). Tant qu'il reste des mondes hors de la table, **un** point gris sans
   nom (« … ») rappelle que la galaxie continue. On ne dessine pas Boréa, Vulkar ni la Faille avant leur
   partie : pas de décor à jeter, pas de nom figé trop tôt. Glisser déplace la carte ; un glissement ne lance
   pas une étape. Clavier : flèches d'un monde à l'autre, Entrée pour ouvrir. Le monde de `nextToPlay()` est
   centré à l'ouverture. Boréa s'ajoute à la table en 6b et s'ouvre en réussissant f2.
   **Ozzo.** `secretHint(stageId)` retourne `null`. Pas de pastille.
3. **Identifiants.** Thèmes `borea`, `vulkar`, `rift`. Musiques de même nom (plus `boss`, `guardian`,
   `story` déjà là). Niveaux `levels/borea/b1.ts` … `levels/rift/r3.ts`. Vols : f3 thème tempête, f4 abords
   (anneaux, peu de rochers), f5 fuite. Titres proposés, à confirmer en même temps que le choix 3 :

   | Id | Titre | Partie |
   |---|---|---|
   | b1 | Banquise d'Hélos | 1, Comète, colosse loin |
   | b2 | Crevasse des aurores | 2, Mira, colosse qui agit |
   | b3 | Cirque du colosse | 3, gardien |
   | f3 | Tempête d'Hélia | vol, raie solaire, plan `rifle` |
   | v1 | Calderas | 1 |
   | v2 | Forges astréennes | 2, Rook, fresques |
   | v3 | Lac de magma | 3, salamandre |
   | f4 | Abords de la Faille | vol, Sentinelle, pas de plan |
   | r1 | Débris | 1, après le piège |
   | r2 | Mondes mêlés | 2, une salle au plafond, derrière une porte |
   | r3 | Chambre d'Éon | 3 |
   | f5 | Effondrement | vol, fuite |

4. **Mira.** Récompense de b2. Les cœurs s'achètent dès qu'elle est à bord (le verrou existe). Pas de
   `seenFoes`, pas d'écran Journal dans cette étape.
5. **Rook.** `CrewId` gagne `'rook'` en 6c. `ship.shield` passe de 2 à 3 crans : `MAX_SHIELD_LEVEL`, un prix
   de plus dans `PRICES.shipShield`, `crew: [null, null, 'rook']`. Le champ de sauvegarde existe déjà (un
   nombre). Pas de `ship.hull`, pas de nouveau `HangarItemKind` : un objet parallèle referait l'écran, la
   sauvegarde et les tests pour le même +1 bouclier. Mitrailleuse et turbo inchangés. Un autre cran, plus
   tard, sur le même équipier.
6. **Gestes.** Saut mural : Kaï touche un `#` ou un `B` sur le flanc, stick à l'opposé, Saut. Impulsion
   horizontale + verticale ≈ un saut normal. **Un** mural par temps en l'air. Le double saut n'est pas
   consommé par le mural et ne le consomme pas : on peut enchaîner l'un puis l'autre, une fois chacun, puis
   il faut un sol. Pas de fenêtre de 200 ms qui ignore le bouton (au stick, l'appui suivant est souvent le
   geste qu'on voulait). Grappin : case `H`, pas de collision, ↑ au sol ou en l'air dans un rayon de 4 tuiles,
   traction à vitesse fixe, on lâche en relâchant ↑ ou au contact. Les lianes `=` de la Jungle ne sont pas
   des anneaux. Les deux compétences sont des secrets pour check-levels sur le niveau qui les donne ; les
   niveaux d'après peuvent les exiger sur le chemin principal, et le graphe doit alors les connaître.
7. **Fresques.** La forge de v2 a des glyphes `G` et un message, comme la ruine de j1. La cinématique
   `frescoes` (20 s, Passer) est le `after` de v2 : le lecteur de 4c, la marque `frescoes`, Options › Revoir.
   On n'ajoute pas `HudApi.cutscene` ni une pause au milieu d'une scène Phaser (perte de contexte, radio,
   bouton retour, tests) pour un film qui se joue très bien à la sortie.
8. **Faille.** Pas de `castaway`. `guardian.skill: null`. `flightBoss.blueprint: null`. Étape r1 :
   `before: 'trap'`. Étape r3 : `after: 'finale'` (Éon vaincue, elle renonce, les gardiens referment la
   Faille — ce n'est pas `liberation`). Étape f5 : `after: 'epilogue'`. Radio : `LevelData` peut porter
   `silent: true` ; la bulle ne s'ouvre pas ; les `radio` du niveau sont ignorées. Le piège le dit.
   Éon : boss 2D, 3 phases, 6 touches. Pas de contrôleur d'allié : un gardien n'est que le dessin d'un
   mécanisme déjà là. Phase 1, une plateforme mobile (la méduse) et le point faible se vise en double saut.
   Phase 2, le point faible est derrière un passage bas et la glissade y entre. Phase 3, la ligne de lave de
   l'arène descend (le même réglage que Vulkar, dans l'autre sens) pendant que le grappin atteint le point
   faible. Le saut mural sert à entrer dans la salle inversée de r2 ; il n'est pas une condition du boss.
   Fuite f5 : un parcours court, **sans** drapeau nouveau. L'échec est la phase `timeout` déjà dans
   `flight.ts` (le chrono n'est pas gelé, il n'y a pas de boss). Le plan de Vide est le dessin de ce chrono :
   s'il rattrape la Comète à l'écran, le temps est à zéro. Les boucliers continuent de servir contre les
   ennemis du parcours. « Réessayer » reprend au début du vol, comme un échec de temps aujourd'hui.
9. **Vide.** Des colonnes (`LevelData.voidCols`) se dessinent avec une palette gris, fissures, liseré rouge,
   au moment du dessin. Pas de filtre plein écran. Ennemi teinté : même classe, mêmes points de vie. Première
   apparition : un couloir de v2 ou v3, puis la moitié de r1 et la totalité de r2–r3. Les boss gardent leur
   combat.

## Modifications prévues

### 6a — carte (`ui/`)

1. **`screens/map.ts`** + styles. `select.ts` retiré du flux (fichier gardé le temps du scénario, puis
   supprimé quand `campaign-flow` et `small-screens` lisent la carte).
2. **Contrat** : la carte ne décide pas de la progression. Elle affiche `isUnlocked` / `isCleared` / étoiles.
   Point d'ancrage `secretHint(stageId): number | null` dans `core/save.ts`, qui retourne `null` tant que
   l'étape 7 n'a pas de données.

### 6b — Boréa

3. **Thème** `borea` dans toutes les tables `Record<ThemeId, …>` (palette, tuiles, quatre **dessins** sur
   les comportements déjà là : marcheur, volant, blindé, cracheur, spore). Pas de nouvelle IA d'ennemi.
   Musique `borea`. Effets dans `sfx.ts` (un fichier `world3Sfx.ts` seulement s'il devient illisible).
4. **Sol qui glisse** : lettre `~`, un sol. Relâcher la direction fait encore **une tuile** de glisse, puis
   l'arrêt. Le saut garde le même arc (le graphe ajoute une tuile de côte, il ne simule pas une friction).
   Le vent est `LevelData.wind` (px/s, 0 par défaut) sur les colonnes voulues, ajouté à la vitesse de Kaï.
   Pas un `LevelEvent` : check-levels n'a qu'une constante de plus, et l'écran ne s'assombrit pas.
5. **Saut mural** : `wallJump` dans `skills`, récompense de b3. Règle pour tous les mondes à partir d'ici :
   un mini-boss est une **copie** d'un boss déjà là (Éclat-roi copie le Crabe, Avalanche copie la charge),
   autre dessin, autres chiffres, le fichier d'origine sans diff. Le gardien est la seule machine nouvelle
   (colosse : cristaux du dos ouverts pendant qu'il frappe, 6 touches). Créature dans la parallaxe, loin puis
   proche ; l'avalanche qui barre le chemin est un `quake`, comme la dalle de la Lune.
6. **Mira** et les cœurs. Vol `helia`, boss `solarRay` (éruptions = projectiles à éviter, point faible entre
   deux éruptions), plan `rifle`. Libération paramétrée (colosse, saut mural).

### 6c — Vulkar

7. **Thème** `vulkar`. Lettre `H` (anneau). **Lave** : elle monte quand Kaï franchit une colonne
   (`LevelData.lava` : liste de `{ col, row }`), et dans l'arène à chaque phase du boss. Les cases sous la
   ligne piquent comme `^`. Le graphe connaît la ligne **après** cette colonne, sans estimer une montre :
   un joueur lent ne se fait pas rattraper par un chronomètre que check-levels aurait deviné. Le niveau 3
   se finit sans grappin. L'avalanche de Boréa et la dalle de la Lune restent des `quake` ; la lave n'est
   pas un troisième « truc qui tombe ».
8. **Grappin** `grapple`, récompense de v3. Forge-roi copie la Tourelle-mère, Coulée copie la charge. La
   salamandre est le gardien nouveau : elle refroidit quelques secondes, seule fenêtre de tir, 6 touches.
   Créature proche en v2 : une coulée est un `quake` qui rend la forge du dessus obligatoire.
9. **Rook**, cran 3 du bouclier renforcé. Cinématique `frescoes` en `after` de v2. Vol `rift`, boss
   `sentinel` (on tire la plaque quand son bouclier tourne). Pas de plan d'arme. Couloir teinté par le Vide
   (couleurs au dessin, pas un filtre plein écran).

### 6d — Faille

10. **Thème** `rift` : des bandes de colonnes réutilisent les palettes déjà faites, plus le calque Vide au
    dessin. **Gravité inversée** : un rectangle de r2, derrière une porte `D`, dans la **même** carte. Le
    graphe et les collisions retournent Y dans ce rectangle seulement. Pas une seconde `LevelData`, pas
    `flipCols` le long du niveau. r1 et r3 restent à gravité normale. Pendant le combat d'Éon, la lave de
    l'arène descend par phase ; le reste de r3 ne mélange pas les deux.
11. **Cinématiques** `trap`, `finale`, `epilogue` dans `src/story/scenes/`, durées visées 30 s, 40 s, 20 s,
    bouton Passer, marques dans `story.seen`.
12. **Éon** (`bosses/eon.ts`) et **fuite** : `collapse` est un `COURSES` court sans `boss`, l'échec est
    `timeout`. Fin de f5 : épilogue, puis l'accueil. Plus d'écran « Fin de la démo ». Pas de `chase: true`.

## Tests

- 6a : scénario `galaxy-map` (le point gris sans nom, ouvrir la Jungle, glisser sans lancer, `nextToPlay`
  centré, cadenas). `small-screens` sur la carte jusqu'à 568×320. Les anciens scénarios qui tapaient une carte
  `data-stage` passent par la carte (aide dans `tests/e2e/lib`).
- 6b : `check-levels` avec la tuile de côte et le saut mural ; `b2-play` (Mira, vent) ; `boss-colossus` ;
  `wall-jump` ; `f3-boss` (raie, plan du fusil) ; `hangar` (cœur achetable avec Mira, refusé sans).
- 6c : lave (franchir la colonne fait monter la ligne ; rester dessous pique) ; `grapple` ; `v2-play`
  (glyphes, Rook, coulée, fresque en `after`) ; `boss-salamander` ; `f4-boss` ; le cran 3 du bouclier est
  refusé sans Rook, les crans 1 et 2 restent achetables sans lui.
- 6d : salle inversée dans reach (un cristal du plafond de la salle est atteint, un cristal hors salle ne
  l'est pas) ; `trap` / `finale` / `epilogue` dans `story-flow` ; `boss-eon` (une compétence par phase, aide
  de chaque gardien, un événement déjà écrit par phase) ; `f5-chase` (temps à zéro = échec, portail = succès,
  pas de barre de boss, les boucliers comptent encore contre les ennemis) ; radio absente sur r1 ; plus
  aucune chaîne « Fin de la démo » dans `campaign-flow`.
- Suite e2e complète à la fin de **chaque** partie. Essai téléphone à chaque partie : lisibilité de la carte
  au pouce, glisse, saut mural, lave, grappin, Éon, fuite (le Vide doit se voir arriver).

## Documentation à mettre à jour

À chaque partie : `CLAUDE.md` (recettes carte, thème, lave, anneau, gravité inversée, fuite), `GDD.md`,
`HISTOIRE.md` (noms retenus **après** validation), `SOUHAITS.md` (sections 1, 3, 4, 7 et l'idée « carte
galactique »), `ARCHITECTURE.md`, `plans/README.md`, `tests/e2e/README.md`. `README.md` : la campagne n'est
plus « fin de la démo » à partir de 6d.

## Ordre de réalisation

**6a — carte** (dès que l'étape 5 a ses quatre étapes dans `WORLDS` ; peut démarrer sur les deux mondes actuels)

- [ ] **1. M — Écran carte** à la place des pages. Mondes de `WORLDS`, un point gris sans nom. `secretHint`
      retourne `null`. Scénario `galaxy-map`, `small-screens`.

**6b — Boréa**

- [ ] **2. M — Thème, quatre ennemis, musique, tuile `~`.** Un niveau vide de test dans check-levels, puis on
      le remplace. Ne pas laisser de `Record` incomplet.
- [ ] **3. M — b1.** Arrivée, créature loin, mini-boss Éclat-roi, balise.
- [ ] **4. M — Côte d'une tuile, vent, b2, Mira, mini-boss.** Cœurs au hangar.
- [ ] **5. G — b3, colosse, saut mural, libération.**
- [ ] **6. M — Vol f3, raie solaire, plan du fusil.** Suite e2e, essai téléphone.

**6c — Vulkar**

- [ ] **7. M — Thème, lave par colonnes, anneau `H`, teinte du Vide (mêmes points de vie).**
- [ ] **8. M — v1 et v2** (coulée, Rook, glyphes, fresque en fin de niveau).
- [ ] **9. G — v3, salamandre, grappin, libération.**
- [ ] **10. M — Vol f4, Sentinelle, cran 3 du bouclier.** Suite e2e, essai téléphone.

**6d — Cœur de la Faille**

- [ ] **11. M — Thème mosaïque, calque Vide au dessin, rectangle inversé dans r2.** Même carte, Y retourné
      dans le rectangle seulement. Un essai avant r2 définitif.
- [ ] **12. M — Cinématique du piège, r1 sans radio, r2.**
- [ ] **13. G — r3 et Éon** (3 phases : plateforme, passage bas, lave qui descend).
- [ ] **14. M — Finale, vol f5 sur le chrono déjà là, épilogue.** Pas de phase `chase`. Retirer « Fin de la
      démo ». Suite e2e, essai téléphone.
