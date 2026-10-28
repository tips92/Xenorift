# Étape 3 — hangar : plan technique

Troisième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail), après les
[contrôles](01-controles.md) et les [armes](02-armes.md).

**État (28/10/2026)** : **3a codée et vérifiée** (points 1 à 8, plus les effets bouclier et turbo de la Comète
du point 14) sur la branche `plans-etapes-1-3` : scénarios e2e adaptés, nouveau scénario `hangar`, hangar
vérifié de 844x390 à 568x320 (`small-screens`), suite complète verte (voir [Tests](#tests)). Reste l'essai sur
téléphone. 3b (combat en vol) et la balise (16) restent à faire.

## Objectif

- Un hangar dans la Comète, entre deux étapes : on y dépense les cristaux pour acheter et améliorer les
  armes de Kaï et équiper la Comète. Les améliorations sont définitives.
- Le combat en vol 3D : la Comète tire, et des ennemis spatiaux l'attaquent.
- La balise de LUMA, qui terminera les niveaux 1 et 2 de chaque monde (utilisée à l'étape 4).

L'étape est grosse : on la découpe en **3a** (hangar et armes de Kaï) et **3b** (combat en vol). Chaque
partie est jouable et testable seule.

## Ce qui existe déjà

État après 3a (28/10/2026), pour coder 3b et la balise. Avant 3a : sauvegarde version 1, « Suivant » direct
vers l'étape suivante, arme choisie sur la carte d'intro en mode test, `MAX_HEARTS` et `MAX_SHIELD` constants
(détail dans l'historique git de ce plan).

- **Hangar et sauvegarde** : `core/hangar.ts` (catalogue `HANGAR_ITEMS`, `PRICES`, `itemState`,
  `applyPurchase`, `buildPlayLoadout`, `departLabel`), `core/save.ts` (version 2, `purchase`, `equipWeapon`,
  `recordResult`), écran `ui/screens/hangar.ts`, aperçu `ui/hangarPreview.ts`, enchaînement dans `ui/App.ts`
  (`goHangar`, `makeResults`). Voir « Choix de réalisation de 3a ».
- **Canon de la Comète** : déjà achetable et enregistré (`ship.gun` : 0 canon léger, 1 mitrailleuse, 2-3 ses
  améliorations) et transmis au vol (`hooks.loadout.ship.gunLevel`), mais lu par personne. Sa carte a
  `soon: true` (note « Effet en vol : bientôt ») et des effets provisoires (« Cadence et dégâts + » / « ++ ») :
  en 3b, retirer `soon` et écrire les vraies valeurs. L'aperçu du hangar dessine déjà la mitrailleuse (deux
  canons sous les ailes, une bague cyan par amélioration) ; le modèle 3D (`game3d/ship.ts`, ~8 appels de
  dessin) pas encore.
- **Modules déjà branchés en vol** (point 14, sauf les canons) : `FlightRun` lit une fois `hooks.loadout.ship`
  (`ShipLoadout` : `maxShields` 3 à 5, `boostDrainMul`, `boostFillMul` ; bornés par `shipValue`, repli sans
  `loadout`) et l'applique à `BOOST_DRAIN` (jauge vidée en 2,5 s) et `BOOST_FILL` (rechargée en 5 s). HUD du
  vol : 3 à 5 boucliers (`has-extra-shields`) ; ni jauge de chauffe ni cristaux (`FlightHud`, point 15).
  `__xr3d.info()` : `maxShields`, `boostDrain`, `boostFill`. `preview/flight.html` : `&shield=` et `&boost=`
  (pas encore `&gun=`).
- **Cristaux du vol** : le vol ne remplit pas `StageResult.crystals` (commenté « Niveaux 2D uniquement » dans
  `core/types.ts`) : 0 pour la réserve. Les cristaux des astéroïdes et des ennemis (points 11, 12) n'auront
  qu'à le remplir : `recordResult` les ajoute à la réserve et les résultats affichent « +N cristaux ».
- **Arme de Kaï, modèle pour le canon** : fiches `core/weapons.ts` (`resolveWeapon` sans allocation,
  multiplicateurs `WeaponMods`) et surchauffe de `Gun` (`game2d/engine/weapons.ts`).
- `src/game3d/flight.ts` (~1080 lignes) : pas de tir. `onRockHit` sait déjà faire éclater un astéroïde
  (éclats, particules) et `rocks.destroyed[k]` le retire.
- `src/game3d/asteroids.ts`, `effects.ts` : astéroïdes et éclats en `InstancedMesh` (budget de ~150 appels
  de dessin respecté). Les futurs tirs et ennemis doivent suivre le même principe.
- Commandes en vol : joystick flottant et TURBO (inversés en mode gaucher, taille et opacité réglables) ; le
  clavier envoie déjà `fire` (J, X, F). L'option du tir manuel ira dans `TOGGLES` (rubrique `'controls'`,
  `ui/screens/options.ts`).
- **Balise** (point 16) : la fin d'un niveau 2D est la Comète (`X` de la légende, `game2d/engine/exitShip.ts`) ;
  check-levels exige exactement un `X`.

## Décisions (27/10/2026)

1. **Cristaux** : tous les cristaux ramassés vont dans la réserve, même en rejouant un niveau (ça aide
   à passer un boss difficile et donne une raison de rejouer). Si l'étape est ratée, ceux de la tentative
   sont perdus.
2. **La Comète tire dès le départ** avec un canon léger ; la mitrailleuse est sa première amélioration.
   Sinon, les ennemis spatiaux seraient injustes avant le premier achat.
3. **Tir automatique en vol** : la Comète tire seule quand une cible est devant elle. Le pouce droit reste
   sur TURBO. Une option permet de passer en tir manuel, avec un bouton TIR.
4. **Aperçu en 2D dans le hangar** : Kaï avec son arme et la Comète de profil, dessinés avec les fonctions
   de dessin du jeu 2D. Pas de second contexte 3D sur le téléphone (lent à démarrer, risque de perte du
   contexte graphique). Un aperçu 3D pourra venir plus tard.
5. **Accès au hangar** : entre deux étapes, et depuis l'écran Niveaux.

### Choix de réalisation de 3a (28/10/2026 ; valeurs de départ, à régler sur téléphone)

Données et calculs purs dans `core/hangar.ts` (catalogue `HANGAR_ITEMS`, `itemState`, `applyPurchase`,
`buildPlayLoadout`) ; enregistrement dans `core/save.ts` (`purchase`, `equipWeapon`, `playLoadout`…).

- **A. Sauvegarde version 2** (même clé `xeno-rift-save-v1` : la version est dans les données). On garde
  `unlocked`, `best`, `settings`, `loadout` ; nouveaux champs : `crystals` (réserve, entier ≥ 0),
  `upgrades` (par arme, niveaux 0 à 3 de `damage`, `fireRate`, `range`, `cooling`), `ship` (`gun` : 0 canon
  léger, 1 mitrailleuse achetée, 2-3 ses améliorations ; `shield` 0-2 ; `boost` 0-2), `extraHearts` (0-2),
  `crew` (`'tess'`, `'mira'`), `blueprints` (plans d'armes ; jamais le laser). Version 1 → migrée en mémoire
  (le reste à sa valeur par défaut, réserve 0), écrite en v2 au prochain enregistrement ; autre version ou
  données illisibles → remise à zéro. Chaque champ est relu avec ses bornes, les identifiants inconnus
  filtrés. « Réinitialiser la progression » vide aussi tout ça (réglages gardés).
- **B. Améliorations d'arme** (multiplicateurs de `WeaponMods`, niveaux 1 / 2 / 3) : dégâts ×1,25 / ×1,5 / ×2 ;
  cadence ×1,15 / ×1,3 / ×1,5 ; portée ×1,15 / ×1,3 / ×1,5 ; refroidissement ×1,25 / ×1,5 / ×1,8.
  Projectiles pour éliminer un ennemi normal (2 PV) / un blindé (4 PV), selon le niveau de dégâts (les PV
  ne remontent pas : `enemies.hit` retire les dégâts non arrondis) :

  | Arme (dégâts par projectile) | niveau 0 | 1 (×1,25) | 2 (×1,5) | 3 (×2) |
  |---|---|---|---|---|
  | Pistolet laser (2) | 1 / 2 | 1 / 2 | 1 / 2 | 1 / 1 |
  | Mitrailleur (1) | 2 / 4 | 2 / 4 | 2 / 3 | 1 / 2 |
  | Pompe (1 par plomb, 5 plombs) | 2 / 4 plombs | 2 / 4 | 2 / 3 | 1 / 2 |
  | Fusil d'assaut (2 par balle, rafale de 3) | 1 / 2 balles | 1 / 2 | 1 / 2 | 1 / 1 |

  Avec 2 et 4 PV, le niveau 1 des dégâts ne change rien pour aucune arme, et le niveau 2 seulement le
  blindé du mitrailleur et de la pompe : l'effet se verra sur les boss de l'étape 4 (plus de PV). À revoir
  si les joueurs le trouvent inutile (PV des ennemis en dixièmes, ou autres multiplicateurs).
- **C. Prix** : mitrailleur 80, pompe 100, fusil 120 (après son plan) ; amélioration d'arme 30 / 60 / 100 ;
  mitrailleuse de la Comète 100 puis ses améliorations 80 / 140 ; bouclier renforcé 80 / 140 ; turbo
  80 / 140 ; cœur supplémentaire 150 / 250.
- **D. Conditions** : une arme demande son plan ; une amélioration demande l'arme possédée, et ses niveaux 2
  et 3 Tess ; les cœurs demandent Mira. Le mode test (« Tout débloquer ») lève les conditions, **pas** les
  prix ni les niveaux max. Hors mode test, en 3a, on n'a donc que le niveau 1 des améliorations du laser et
  les modules de la Comète (plans et équipage viendront à l'étape 4).
- **E. Équiper** : une arme possédée est équipée et enregistrée (`setEquippedWeapon`) ; en mode test, une
  arme non possédée l'est pour la session seulement (sauvegarde inchangée). L'arme de la session vit dans
  `core/save.ts` (`setSessionWeapon`, aussi posée par `?weapon=`) et `playLoadout` la prend par défaut.
- **F. Effets** : Kaï → multiplicateurs de chaque arme (toutes, pas seulement l'équipée) ; cœurs max =
  3 + niveau (départ, point de contrôle, réapparition ; HUD jusqu'à 5). Comète dès 3a : boucliers max =
  3 + niveau (HUD jusqu'à 5) ; turbo : jauge qui dure ×1,25 / ×1,5 (`BOOST_DRAIN` divisé) et recharge
  ×1,25 / ×1,5 (`BOOST_FILL`). Canon de la Comète : seulement enregistré (effet en 3b) ; le hangar affiche
  « Effet en vol : bientôt ».
- **G. Cristaux** : à la réussite, `StageResult.crystals` (2D ; rien en vol pour l'instant) s'ajoute à la
  réserve dans `recordResult`, même en rejouant ; échec = rien. Résultats : « +N cristaux » (seulement si N > 0)
  et la réserve.
- **H. Enchaînement** : résultats → « Suivant » ouvre le hangar s'il y a une étape suivante → « Décoller »
  (`departLabel`, seul endroit où se décide le libellé) lance la carte d'intro de l'étape suivante ; retour
  (Android, Échap, Retour arrière, bouton ◀) → résultats. Écran Niveaux : bouton « Hangar » ; ouvert de là,
  pas de « Décoller », le retour ramène aux Niveaux. Confirmation d'achat ouverte : le retour la ferme
  d'abord. JOUER depuis l'accueil ne passe pas par le hangar.
- **I. Choix provisoire de l'arme** (carte d'intro) retiré ; `?weapon=` reste (paramètre de test, session).
- **J. Aide de développement** : `__xrShell.addCrystals(n)` et la réserve dans `__xrShell.info()`.
- Son : nouvel effet `buy` (achat confirmé).

## Le hangar

Écran HTML à onglets, avec la réserve de cristaux en haut et un aperçu à gauche.

Réalisé en 3a (`ui/screens/hangar.ts`) : la réserve insuffisante n'éteint que le prix (les cartes ne
répètent pas « Réserve insuffisante ») ; les autres verrous sont écrits sur la carte (« Plan manquant »,
« Arme non possédée », « Demande Tess / Mira »), avec la note « Mode test » quand le mode test lève une
condition. Un prix verrouillé reste un bouton : le toucher fait trembler la carte, clignoter en rouge sa note de
verrou et affiche la raison dans le message du hangar (`.hg-msg`, dans la colonne des achats : en bas de la liste,
en haut si la carte touchée est dans le bas ; un seul message, remplacé à chaque refus, effacé au changement
d'onglet et à la sortie ; jamais les toasts globaux, qui restaient affichés sur l'écran suivant). Le même message
annonce l'arme équipée pour la session (mode test). États et boutons accordés au nom de l'arme (« Équipé »,
« Possédé » ; « Équipée » pour la Pompe, seule arme au féminin : table `FEMININE` de l'écran). Confirmation
rédigée en phrase (« Améliorer les dégâts du Pistolet laser (×1,25) pour 30 cristaux ? », « Acheter la Pompe… »,
« Installer le bouclier renforcé (4 boucliers)… »), boîte opaque. Petits écrans : jusqu'à 420 px de haut, fiche
de l'arme sans sa description et pastilles d'armes resserrées ; à 320 px, titre « Améliorations · arme » masqué :
la première amélioration reste entière sans défiler.
L'aperçu (`ui/hangarPreview.ts`) est un module chargé à la demande (chunk séparé, dessins partagés avec le
mode 2D) : l'accueil ne le charge pas.

### Établi (armes de Kaï)

- Liste des 4 armes : possédée (équiper), achetable (prix), ou « plan manquant » (verrouillée).
- Pour chaque arme possédée, 4 améliorations à 3 niveaux : **dégâts**, **cadence**, **portée**,
  **refroidissement**. Chacune applique un multiplicateur à la fiche de l'arme (`core/weapons.ts`).
- Les niveaux 2 et 3 demandent la mécanicienne Tess (naufragée du monde 1, étape 4). En attendant, le mode
  test les débloque.

### Atelier de la Comète

| Module | Niveaux | Effet |
|---|---|---|
| Mitrailleuse | 1 (achat) puis 2 améliorations | remplace le canon léger ; cadence et dégâts |
| Bouclier renforcé | 2 | 4 puis 5 boucliers au lieu de 3 |
| Turbo | 2 | jauge plus grande, recharge plus rapide |

La mitrailleuse achetée apparaît sur le modèle 3D (deux canons sous les ailes).

### Kaï

- **Cœur supplémentaire** : 4ᵉ puis 5ᵉ cœur. Demande Mira (naufragée du monde 3, étape 4).
- **Drone compagnon** : prévu, mais construit plus tard (il a besoin des nouveaux niveaux pour être réglé).

### Prix de départ (à régler)

Un monde complet rapportera environ 150 cristaux (3 niveaux de ~50) plus ceux des vols.

| Achat | Prix |
|---|---|
| Arme (après son plan) | 80 à 120 |
| Amélioration d'arme, niveaux 1 / 2 / 3 | 30 / 60 / 100 |
| Mitrailleuse de la Comète | 100 |
| Autres modules de la Comète, niveau 1 / 2 | 80 / 140 |
| Cœur supplémentaire | 150 puis 250 |

## Modifications prévues

### 3a — hangar et armes de Kaï

1. **Sauvegarde version 2** (`core/save.ts`, `core/types.ts`) : réserve de cristaux, améliorations des
   armes, modules de la Comète, cœurs max, équipage secouru (arme équipée, armes possédées et compétences
   sont déjà dans `loadout`). **Migration** depuis la version 1 : on garde la progression, les scores, les
   réglages et le `loadout`. « Réinitialiser la progression » vide aussi tout ça.
2. **Gain de cristaux** (`ui/App.ts`, `ui/screens/results.ts`) : à la réussite, les cristaux de l'étape
   s'ajoutent à la réserve. L'écran de résultats affiche « +N cristaux » et le nouveau total.
3. **Enchaînement** (`ui/App.ts`) : « Suivant » sur les résultats ouvre le hangar ; son bouton
   « Décoller » lance la carte d'intro de l'étape suivante. Le bouton retour Android ramène aux résultats.
4. **Écran du hangar** (`ui/screens/hangar.ts`, nouveau) : onglets Établi, Comète, Kaï ; achat avec
   confirmation ; équipement de l'arme ; tout se joue au doigt en paysage, petits écrans compris.
5. **Données des achats** (`core/hangar.ts`, nouveau, données seulement) : prix, niveaux, effets,
   conditions (plan récupéré, membre d'équipage).
6. **Améliorations dans le jeu 2D** : le `Gun` de l'étape 2 applique les multiplicateurs reçus avec le
   `loadout` ; les cœurs max remplacent `MAX_HEARTS`.
7. **Aperçu 2D** : Kaï avec l'arme choisie (sprite du bras armé de l'étape 2) et la Comète de profil
   (`game2d/art/draw/ship.ts`), dessinés sur un canvas de l'écran.
8. **Choix provisoire de l'arme** (carte d'intro, mode test) retiré : le hangar le remplace.

### 3b — combat en vol

9. **Tir de la Comète** (`game3d/flight.ts`, nouveau `game3d/shots.ts`) : projectiles en `InstancedMesh`,
   canon léger ou mitrailleuse, surchauffe comme au sol, multiplicateurs du hangar.
10. **Visée et tir automatique** : cible = astéroïde ou ennemi le plus proche dans un cône devant la
    Comète ; tir automatique par défaut, bouton TIR à côté de TURBO en tir manuel
    (`input/touch.ts`, option dans `ui/screens/options.ts`).
11. **Astéroïdes destructibles** : un tir les fait éclater (réutilise `onRockHit`, sans perte de bouclier)
    et lâche parfois un cristal.
12. **Ennemis spatiaux** (nouveau `game3d/enemies.ts`), touchés par le Vide, un `InstancedMesh` par type :
    - **chasseur** : arrive de face, tire une fois et s'écarte ;
    - **mine** : immobile dans le couloir, explose si on la frôle ;
    - **essaim** : petit groupe qui ondule et barre le passage.

    Leurs tirs sont des orbes lentes et lumineuses, faciles à lire. Chaque ennemi détruit rapporte des
    points et des cristaux.
13. **Parcours** (`game3d/courses.ts`) : vagues d'ennemis ajoutées aux parcours Nébuleuse et Ceinture
    d'Orak, générées avec la même graine que les portails (parcours identique à chaque partie).
14. **Modules de la Comète** : boucliers max, turbo (faits en 3a), et canons visibles sur le modèle
    (`game3d/ship.ts`).
15. **HUD du vol** (`ui/hud.ts`) : jauge de chauffe du canon, compteur de cristaux.

### Pour l'étape 4

16. **Balise de LUMA** (`game2d/engine`, légende des niveaux) : nouvel objet de fin de niveau qui
    remplace la Comète dans les niveaux 1 et 2. Kaï l'active, un faisceau l'emporte, puis on passe aux
    résultats. `check-levels` accepte une balise **ou** une Comète comme sortie.

## Tests

- **Sauvegarde** : migration d'une sauvegarde version 1 (progression gardée), réserve qui survit au
  rechargement, réinitialisation complète.
- **Nouveau scénario `hangar`** : finir une étape (aide de développement), vérifier le gain de cristaux,
  acheter une amélioration, vérifier la réserve, équiper une arme, décoller, vérifier l'arme en jeu.
- **Nouveau scénario `flight-combat`** : tir automatique, astéroïde détruit sans perte de bouclier,
  ennemi détruit, nombre d'appels de dessin toujours sous ~150 (`renderer.info`).
- **À adapter** : `campaign-flow.mjs` (le hangar s'intercale entre les étapes), `f1-play.mjs` et
  `flight-autopilot.mjs` si les ennemis gênent le pilote automatique.
- **Adaptés après 3a** (28/10/2026) :
  - `campaign-flow`, `background-3d`, `j1-ctx-asleep`, `stress-laps` : « Suivant » puis « Décoller »
    (`nextViaHangar` de `tests/e2e/lib/core.mjs`) ; `campaign-flow` vérifie aussi la réserve affichée au hangar,
    le libellé du départ et le retour (Échap) aux résultats figés ;
  - `weapons` : plus de ligne Arme sur la carte d'intro ; l'arme de la session est équipée au hangar en mode test
    (gardée d'une étape à l'autre, oubliée hors mode test et au rechargement) ; ses sauvegardes version 1 sont
    migrées (réécrites en version 2) ;
  - `small-screens` : carte d'intro sans ligne Arme ; `patchSave` écrit une version 2 ; HUD à 5 cœurs (avec les
    trois bonus) et vol à 5 boucliers à 640x320 et 740x360 ; résultats avec « +53 cristaux » et une réserve à
    5 chiffres (ligne Réserve entière) ; en-tête des Niveaux avec le bouton Hangar ; hangar à 844x390, 740x360,
    640x320 et 568x320, hors mode test depuis les Niveaux et en mode test depuis les résultats (chaque carte
    amenée à l'écran et entière, cibles tactiles ≥ 40 px, confirmation) ;
  - `touch-options` : inchangé, ses sauvegardes version 1 restent valides par migration.
- **Scénario `hangar`** (écrit) : lecture de la sauvegarde (version inconnue et JSON illisible remis à zéro ;
  version 2 abîmée relue dans ses bornes, identifiants inconnus filtrés ; migration d'une v1 réaliste),
  « +N cristaux » = cristaux de la partie, achat avec confirmation (fermée par le retour Android), refus (Tess,
  réserve, plan, arme, Mira : message du hangar, pas de toast, tremblement identifié `hg-shake`, note qui clignote),
  réserve insuffisante refusée aussi en mode test, équipement (enregistré ; pour la session en mode test), achat
  d'une arme (pompe équipée pour la session puis achetée : rangée dans l'ordre des armes, arme enregistrée, focus
  sur Équiper), conditions remplies par la sauvegarde hors mode test (Tess, Mira, plan du mitrailleur), retours
  (confirmation → hangar → résultats figés : score, étoiles, aucun son ; Niveaux → hangar → Niveaux, par Android,
  Échap, Retour arrière et ◀), rechargement, effets en jeu (tir du laser à 2,5 de dégâts, cadence et
  refroidissement du laser, portée d'une balle du fusil, 4 puis 5 cœurs et réapparition à 4, 4 puis 5 boucliers,
  turbo mesuré sur une seconde de jeu avec `__xr3d.advance`), réinitialisation (équipage et plans compris).
- **Complétés après la relecture** : `campaign-flow` (cristaux ramassés : « +3 » après RECOMMENCER, réserve 3 au
  hangar et au retour, vol sans gain, réserve après RÉESSAYER = avant + cristaux de la nouvelle tentative) ;
  `small-screens` (zone de dessin de l'aperçu ≥ 100x60 px et canvas dessiné, première amélioration entière sur
  l'Établi, captures aux 4 tailles ; en mode test, `waitFor2dPlay` avant `__xr2d.win()` : attendre seulement
  `scene.state === 'play'` a laissé une fois la victoire se perdre à 740x360) ; `audio-lifecycle` (effet `buy` dans le comptage des nœuds : 28 effets) ;
  `weapons` (message de session lu dans le hangar).
- **Corrigé pendant les tests** : `audio/engine.ts` n'appelle plus `navigator.vibrate` avant le premier geste
  (Chrome le refuse avec une erreur dans la console : vibrations coupées dès le démarrage, victoire sans
  toucher l'écran).
- **Points relevés, à trancher** : « au point de contrôle » est compris comme la réapparition (avec tous les
  cœurs), atteindre un point de contrôle ne rend pas de cœurs ; au retour du hangar vers les résultats, la
  musique « menu » lancée par le hangar continue (les résultats étaient silencieux) ; le niveau 1 des dégâts ne se
  voit sur aucun ennemi actuel (tableau du point B) ; le message du hangar (`.hg-msg`, 2,6 s) se pose
  par-dessus la liste (en bas, en haut si la carte touchée est en bas) et peut cacher une autre carte le temps
  de son affichage : à juger sur téléphone.
- **Corrigé après la relecture des tests et des captures** (28/10/2026) : messages de refus du hangar sortis des
  toasts globaux (ils masquaient les cartes, s'empilaient et restaient sur les résultats) ; confirmation
  translucide rendue opaque ; améliorations hors de vue sur l'Établi à 640x320 et 844x390 ; accords
  (« Équipée » sous un nom masculin) ; phrase de la confirmation ; « +0 cristal » affiché en vert ; « −N » de la
  dépense posé sur les onglets (désormais à gauche de la réserve) ; hors 3a, toasts du jeu au-dessus du panneau
  Pause (`.toasts` passe sous la pause : z-index 25).
- **Sélecteurs du hangar** pour le scénario `hangar` : `[data-screen="hangar"]`, `.hg-wallet-n` (réserve),
  onglets `.hg-tab--bench|ship|kai` (`aria-selected`), pastilles `.hg-weapon[data-weapon="<arme>"]`
  (`aria-checked`), achat `[data-buy="<HangarItemId>"]` (`.is-locked` + `aria-disabled` si refusé),
  confirmation `.hg-confirm.is-open` puis `.hg-confirm .btn-primary` (Acheter), message `.hg-msg.is-on`, équipement
  `[data-equip="<arme>"]` (`aria-pressed`), niveau `[data-item="<id>"] .hg-pip.is-on`, départ `.hg-depart`
  (absent depuis Niveaux), canvas `.hg-canvas-el` (après l'import dynamique). Aides : `__xrShell.addCrystals(n)`
  (avant d'ouvrir le hangar), `__xrShell.info()` (`crystals`, `play`, `screen`), `__xr2d.info()` (`mods`,
  `stats`, `hearts`, `maxHearts`), `__xr3d.info()` (`maxShields`, `boostDrain`, `boostFill`).
- **Vérifications habituelles** : `npm run typecheck`, `npm run check-levels`, `npm run build`, puis la
  suite e2e complète, et un essai sur téléphone (lisibilité du hangar, tir auto, fluidité en vol).

## Documentation à mettre à jour

- **3a (fait le 28/10/2026)** : `docs/GDD.md` (« Interface et enchaînement » : hangar, résultats, mode test ;
  cœurs, boucliers et turbo ; cristaux du score qui vont à la réserve), `docs/SOUHAITS.md` (section 3, ordre
  de travail), `CLAUDE.md` (architecture, contrats, recettes Sauvegarde et Achat du hangar, déroulement d'une
  étape, aides DEV), `docs/ARCHITECTURE.md`, `README.md`, `tests/e2e/README.md` (scénario `hangar`,
  sélecteurs, valeurs recopiées).
- **3b** : `docs/GDD.md` (« Mode vol spatial 3D » : tir, tir automatique, ennemis, cristaux du vol ; canon
  de la Comète au hangar), `docs/SOUHAITS.md` (section 3), `CLAUDE.md` (`game3d/shots.ts`, `enemies.ts`,
  option du tir manuel, recette Parcours de vol : vagues d'ennemis ; retirer « Effet en vol : bientôt »),
  `tests/e2e/README.md` (`flight-combat`, aides de `__xr3d`).

## Ordre de réalisation

**3a** (fait) — sauvegarde v2 et gain de cristaux (points 1, 2) ; enchaînement et écran du hangar (3 à 5) ;
améliorations dans le jeu 2D (6) ; aperçu (7) ; retrait du choix provisoire (8) ; tests.

**3b** — tir de la Comète et tir automatique (9, 10) ; astéroïdes destructibles (11) ; ennemis et vagues
(12, 13) ; canons visibles de la Comète et HUD (14, 15 ; boucliers et turbo du point 14 faits en 3a) ; tests
et essai sur téléphone.

**Balise** (16) : à la fin, ou au début de l'étape 4 (le plan 4, pas encore validé, la place dans 4a).
