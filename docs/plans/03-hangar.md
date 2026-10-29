# Étape 3 — hangar : plan technique

Troisième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail), après les
[contrôles](01-controles.md) et les [armes](02-armes.md).

**État (28/10/2026)** : **3a et 3b codées et vérifiées** sur la branche `plans-etapes-1-3` (3a commitée dans
`f4275db`, 3b dans `223d5ec`).

- **3a** (points 1 à 8, plus les effets bouclier et turbo de la Comète du point 14) : scénarios e2e adaptés,
  nouveau scénario `hangar`, hangar vérifié de 844x390 à 568x320 (`small-screens`), suite complète verte.
- **3b** (points 9 à 15, combat en vol ; voir « Choix de réalisation de 3b ») : scénarios e2e adaptés, nouveau
  scénario `flight-combat`, portails et rochers de f1 / f2 identiques à ceux d'avant 3b, pilote automatique qui
  finit f1 et f2 sans perdre de bouclier, suite complète verte (32 scénarios). Tests et captures relus, défauts de
  rendu corrigés et tests complétés (« Corrigé après la relecture des tests et des captures de 3b »).
- Reste l'essai sur téléphone des deux parties (3b : lisibilité des tirs et des ennemis, ~~tir automatique, bouton
  TIR, réglages~~ (remplacés par l'amendement du 29/10/2026 : TIR et TURBO, énergie partagée) ; points à trancher
  en fin de [Tests](#tests)).
- **29/10/2026** : premier essai sur téléphone : décision 3 amendée (bouton TIR dédié sous le pouce droit, TURBO
  au-dessus, énergie partagée par le tir et le turbo, plus de tir automatique ni de réglage « Tir manuel ») ;
  codée et vérifiée dans la branche `claude/vol-tir-bouton` (voir « Amendement du 29/10/2026 »), commitée dans
  `8274dd0` puis fusionnée dans `claude/world-1-completion-866505` (décision 21 du plan 04) ; reste l'essai de
  ces commandes sur téléphone.
- La balise (16) est réalisée à l'étape 4 (4a), dans une autre branche (`claude/world-1-completion-866505`).

## Objectif

- Un hangar dans la Comète, entre deux étapes : on y dépense les cristaux pour acheter et améliorer les
  armes de Kaï et équiper la Comète. Les améliorations sont définitives.
- Le combat en vol 3D : la Comète tire, et des ennemis spatiaux l'attaquent.
- La balise de LUMA, qui terminera les niveaux 1 et 2 de chaque monde (utilisée à l'étape 4).

L'étape est grosse : on la découpe en **3a** (hangar et armes de Kaï) et **3b** (combat en vol). Chaque
partie est jouable et testable seule.

## Ce qui existe déjà

État après 3b (28/10/2026), pour l'étape 4 : balise (point 16) et boss du vol (plan 04, points 22 à 24). Avant
3b : canon de la Comète enregistré mais lu par personne, HUD du vol sans chauffe ni cristaux, vol sans cristaux
pour la réserve ; avant 3a : sauvegarde version 1, `MAX_HEARTS` et `MAX_SHIELD` constants (détail dans
l'historique git de ce plan).

- **Hangar et sauvegarde** : `core/hangar.ts` (catalogue `HANGAR_ITEMS`, `PRICES`, `itemState`,
  `applyPurchase`, `buildPlayLoadout`, `departLabel`), `core/save.ts` (version 2, `purchase`, `equipWeapon`,
  `recordResult`), écran `ui/screens/hangar.ts`, aperçu `ui/hangarPreview.ts`, enchaînement dans `ui/App.ts`
  (`goHangar`, `makeResults`). Voir « Choix de réalisation de 3a ».
- **Modules de la Comète, tous branchés** : `FlightRun` lit une fois `hooks.loadout.ship` (`maxShields` 3 à 5,
  `boostDrainMul`, `boostFillMul`, `gunLevel` 0 à 3 ; bornés, repli sans `loadout`). Canon : fiches
  `core/shipGuns.ts`, carte du hangar aux effets réels (plus aucun `soon`), canons visibles sur le modèle 3D.
- **Combat en vol** (voir « Choix de réalisation de 3b ») : `game3d/shots.ts` (canon `ShipGun`, visée,
  projectiles `ShotPool`), `enemies.ts` (`EnemyField` : chasseur, mine, essaim, orbes), `pickups.ts`
  (`CrystalPickups`), `courses.ts` (vagues `Course.waves`, `genWaves`), `asteroids.ts` (PV, cristal, `shotTest`,
  `aim`) ; HUD `FlightHud.gunLevel` / `heat` / `overheated` / `crystals` ; réglage `Settings.manualFire` et bouton
  `.xr-shoot`. `flight.ts` : ~1410 lignes, `enemies.ts` ~1510.
- **Résultat du vol** : `StageResult.crystals` (ramassés, ajoutés à la réserve par `recordResult`),
  `crystalsTotal` (rochers du couloir + vagues : `FlightRun.crystalsTotal()`), `enemies` (abattus par les tirs) ;
  score = base d'avant 3b + `points` (rochers, ennemis, cristaux) ; étoiles : portails seulement.
- **Boss du vol : où brancher une cible et des dégâts génériques** (léviathan, plan 04 point 23 : `targets` pour
  la visée, `hitTarget`, `hitsShip`) :
  - *Visée* : `FlightRun.updateGun` remplit `this.aim` (`AimTarget` : type, index, distance, position, vitesse)
    par `EnemyField.aim` dans le cône sûr (`cosSure` : homingDeg + 1°) puis le cône de visée (`cosCone`), sinon
    par `AsteroidField.aim`. Une plaque de boss se propose de même : `inAimCone(dx, dy, dz, cos, portée)` puis
    `offerAim(aim, type, index, dist, x, y, z, vx, vy, vz)` (vitesse : visée en avance), en sautant une cible
    condamnée (PV − `pending` ≤ 0). `AimKind` (`'none' | 'rock' | 'enemy'`) prend une valeur de plus ; `canHit`
    (rayon de la cible + `SHOT_R` comparé à `shotMiss`) et `targetInfo` (`__xr3d.info().target`) lisent le rayon
    et le nom selon le type.
  - *Impacts* : `ShotPool.update(h, time, rocks, enemies, onHit)` teste le segment parcouru par chaque
    projectile (`rocks.shotTest`, puis `enemies.shotTest` jusqu'au point d'entrée dans le rocher : premier
    touché le long du segment) et appelle `ShotHitFn(kind, index, damage, x, y, z)` ; `FlightRun.shotHit`
    répartit (`EnemyField.damage(i, dégâts)` → true si l'ennemi meurt). Boss : un `shotTest(x0, y0, z0, x1, y1,
    z1, r)` de plus (sphères `segmentHitsSphere` de `util.ts`, ou capsules), une valeur de plus dans `ShotHitFn`
    et `hitTarget(index, dégâts)` ; plutôt qu'un troisième paramètre typé, une petite interface commune
    (`shotTest`, `pending`) passée à `update` et `claim`.
  - *Réservation des dégâts* : `ShotPool.claim(aim, rocks, enemies)` ajoute les dégâts d'un tir qui doit toucher
    à `pending[index]` de sa cible ; `release` les rend à l'impact ou à l'extinction (`T_ROCK`, `T_ENEMY` avec le
    `serial` de l'occupant de l'emplacement). Une plaque ne renaît pas : pas besoin de `serial`.
  - *Dégâts reçus* : `FlightRun.damageShip(fromX, fromY)` (bouclier, invulnérabilité, ralentissement, rebond,
    explosion à 0). Il ne fait rien hors de la phase `fly`, comme le ramassage des cristaux
    (`pickups.update(…, phase === 'fly')`), les chocs et tirs d'orbes des ennemis (`live`) et la visée
    (`updateGun`, appelé par `simFly`) : une phase `boss` doit entrer dans chacun de ces tests.
  - *Orbes* : pool d'`EnemyField` (16, `ORB_R` 1,1, lueur magenta du `glowMesh`, choc →
    `EnemyEvents.shipHit('orb', …)`, déjà vues par `avoid`), mais `fireOrb(i, ship)` est privée et part d'un
    chasseur (emplacement `i`, anticipation `ORB_LEAD`, vitesse réglée sur la croisière, `ORB_T`) : il faudra une
    méthode publique qui lance une orbe depuis un point quelconque (même pool, mêmes chocs).
  - *Rappels et récompenses* : `EnemyEvents` (`orbFired`, `enemyKilled(kind, x, y, z, points, crystals)`,
    `shipHit`) sert de modèle aux rappels du boss vers `FlightRun` (son, `points`, cristaux lâchés par
    `CrystalPickups.spawn(x, y, z, n)`) ; ajouter ceux du boss à `crystalsTotal()`.
  - *Rendu* : coque « Vide » = `makeVoidMaterial(theme, bin)` d'`enemies.ts` (veines magenta, liseré froid
    `#8f9cff`, un seul bruit sans boucle ; pas encore exportée), lueurs face caméra dans le style du `glowMesh`.
    Appels de dessin relevés en vol avec le combat : 48 au plus (f1), 47 (f2) : le léviathan (≈ 4) tient
    sous 150.
  - *Parcours* : `genWaves` (graine dérivée) dépend des rochers (`rockFree`) et de `warpZ` (vagues jusqu'à
    `warpZ` + 150). Toutes les vagues sont avant le dernier portail (f1 : dernière vague, 2 mines, à z ≈ −3817 ;
    dernier portail ≈ −3955 ; distorsion ≈ −4285 ; f2 : −5228, −5364, −5704). Retirer les rochers au-delà du
    dernier portail après `genWaves` et garder le `warpZ` du parcours (déplacer seulement `WarpPortal.z`) laisse
    vagues et cristaux identiques ; le hachage `COURSE_FP` de `flight-combat` (rochers compris) est de toute
    façon à remettre à jour pour f1 (plan 04, point 22), `WAVES` / `CRYSTALS_TOTAL` si les vagues bougent.
  - *Aides et tests* : `__xr3d.info()` (combat), `spawn(type, distance, variant)`, `fire(on)`,
    `advance(1 / 60)` (traces de `flight-combat`) ; le pilote automatique tire toujours en automatique et
    s'écarte des mines, de l'essaim et des orbes (`EnemyField.avoid`).
- **Balise** (point 16) : la fin d'un niveau 2D est la Comète (`X` de la légende, `game2d/engine/exitShip.ts`) ;
  check-levels exige exactement un `X`.

## Décisions (27/10/2026)

1. **Cristaux** : tous les cristaux ramassés vont dans la réserve, même en rejouant un niveau (ça aide
   à passer un boss difficile et donne une raison de rejouer). Si l'étape est ratée, ceux de la tentative
   sont perdus.
2. **La Comète tire dès le départ** avec un canon léger ; la mitrailleuse est sa première amélioration.
   Sinon, les ennemis spatiaux seraient injustes avant le premier achat.
3. ~~**Tir automatique en vol** : la Comète tire seule quand une cible est devant elle. Le pouce droit reste
   sur TURBO. Une option permet de passer en tir manuel, avec un bouton TIR.~~
   **Amendée le 29/10/2026** (après essai sur téléphone, demande de l'utilisateur) : **bouton TIR dédié** à la
   place de TURBO, sous le pouce droit ; la Comète tire tant qu'on le tient (plus de tir automatique, plus
   d'option « Tir manuel ») ; **TURBO au-dessus**, un peu plus petit ; **une seule jauge d'énergie** que le tir
   et le turbo font chauffer, et en surchauffe ni tir ni turbo jusqu'au refroidissement. L'aide à la visée vers
   la cible devant la Comète est gardée (direction des tirs seulement, jamais le déclenchement). Réalisation :
   « Amendement du 29/10/2026 » plus bas.
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

### Choix de réalisation de 3b (28/10/2026 ; valeurs de départ, à régler sur téléphone)

- **A. Canons** (`core/shipGuns.ts`, `resolveShipGun(level, vitesse de croisière, out)` sans allocation) :
  canon léger (niveau 0 : un canon sous le nez, 4 tirs/s, dégâts 1, trait cyan de 6 u) ; mitrailleuse (niveau 1 :
  deux canons sous les ailes en alternance, 10 tirs/s en tout, dégâts 1, trait cyan clair `0x7ff6ff` de 5 u ; un
  blanc-cyan saturait en blanc) ; niveaux 2 et 3 : dégâts
  ×1,25 / ×1,5, cadence ×1,15 / ×1,3. Surchauffe comme au sol (reprise sous 30 %) : tir continu surchauffé au
  bout de 4 s (canon léger : 16 tirs) et 3 s (mitrailleuse : 30 tirs, 39 au niveau 3 ; à tous ses niveaux, la
  cadence divise aussi la chauffe par tir) ; refroidissement 0,5 / 0,55 par seconde après 400 / 300 ms sans tirer
  (reprise en ~1,4 s / ~1,3 s). Portée = distance parcourue en 1,6 s à la vitesse de croisière (93 u en f1,
  102 u en f2) ; projectiles à +190 / +220 u/s de la vitesse de la Comète, rayon d'impact 0,35 u (`SHOT_R`),
  48 au plus.
- **B. Visée** : cible = astéroïde du couloir ou ennemi le plus proche dans un cône de 10° (demi-angle) devant
  la Comète et à portée ; tir visé en avance, écarté de l'axe d'au plus 6° (`SHIP_AIM`). Tir automatique par
  défaut (tant qu'une cible est dans le cône, hors surchauffe) ; réglage « Tir manuel » (`Settings.manualFire`,
  rubrique Commandes, aussi dans Pause, icône viseur) : bouton TIR tactile `.xr-shoot` (cyan, viseur), placé comme
  le TIR 2D par rapport à SAUT (à gauche de TURBO, un peu plus haut), masqué hors tir manuel, en vol seulement.
  J, X, F tirent dans les deux modes (appui bref gardé 150 ms, `FIRE_QUEUE`). Réalisé : les ennemis passent d'abord (un rocher du couloir, presque toujours
  là, cachait le chasseur qui vire), le plus proche dans un cône de homingDeg + 1° (7°), sinon de 10° ; aucun ou
  hors d'atteinte : le rocher du couloir choisi de même. Le tir automatique ne part que si le tir guidé peut
  toucher (`shotMiss` ≤ rayon de la cible + `SHOT_R` ; sinon ~2 tirs sur 3 étaient perdus au bord du cône) ; le
  tir manuel n'est pas filtré. Le pilote automatique tire toujours en automatique. Un tir qui doit toucher
  réserve ses dégâts sur sa cible (`ShotPool.claim`, compteurs `pending` des rochers et des ennemis, rendus à
  l'impact ou à l'extinction) : la visée ignore une cible que les tirs en route suffisent à détruire (sinon la
  mitrailleuse perdait la moitié de ses tirs sur des cibles déjà condamnées, et toutes ses surchauffes en f2 en
  venaient). Impact : le premier touché le long du segment, rochers et ennemis confondus.
- **C. Astéroïdes destructibles** : PV selon le rayon (`rockHp` : 1 sous 1,6 u, 2 sous 3,4, 3 sous 5,5, 4 sous
  8,5, sinon 5) ; détruits par un tir :
  éclatement de `onRockHit` sans perte de bouclier ni ralentissement, 10 points ; ~1 rocher du couloir sur 4
  lâche un cristal (`rockDropsCrystal` : graine du parcours + index ; 15 possibles en f1, 78 en f2). Cristaux du
  vol (`game3d/pickups.ts`) aimantés près de la Comète, +1 réserve et 50 points chacun ; couleurs fixes, celles de
  l'icône du HUD et du cristal 2D (facettes `#e8feff` / `#9ffbff` en haut, `#3ff7ff` / `#2a7dff` en bas, bipyramide
  à 6 pans de 1,74 u), halo additif face caméra qui pulse et éclat bref (croix blanche ~0,15 s toutes les ~1,6 s) :
  avant, couleur des facettes des rochers du thème (orange dans la Ceinture : pris pour des éclats de roche). Cristal lâché : glisse
  de 45 % de l'écart latéral vers la ligne de la Comète (`PULL` ; les rochers du couloir sont à 7-13 u de la
  trajectoire idéale), aimant de 7 u qui suit la Comète, ramassage à 1,6 u. Rocher détruit par un tir :
  `enemyBlast` faible et grave ; touché sans être détruit : étincelles et `enemyHit` faible.
- **D. Ennemis** (`game3d/enemies.ts`, un InstancedMesh par type + les orbes) : chasseur (3 PV, 150 points,
  2 cristaux : arrive de face, tire une orbe vers la position anticipée, s'écarte en virant) ; mine (2 PV,
  50 points, 1 cristal : immobile, clignote, explose à moins de 3 u) ; essaim (5 à 7, 1 PV, 30 points chacun,
  1 cristal pour la vague entière abattue). Orbes lentes, grosses, magenta. Orbe, mine ou contact : un bouclier
  perdu (même invulnérabilité que les rochers), l'ennemi percuté est détruit sans points ni cristal. Rendu : 3
  InstancedMesh « touchés par le Vide » (shader à veines magenta, un seul bruit, sans boucle ; liseré froid
  `#8f9cff` propre aux ennemis et fresnel discret : celui du thème Nébuleuse, magenta, rendait les coques roses) + 1
  InstancedMesh de lueurs face caméra (œil du chasseur, balise de la mine, nuée de l'essaim, orbes, éclairs
  d'explosion) : 4 appels de dessin au plus. Le magenta est réservé aux orbes et aux veines : œil du chasseur ambre
  `#ffb030` (lueur de 1,2 à 2,6 u, plus petite que le corps ; elle faisait 4,8 u et cachait la silhouette), bouts
  d'ailes et de griffes allumés ; explosion du chasseur blanc chaud et violet (éclair de 7 u qui pâlit en 0,18 s,
  onde de choc, 8 étincelles magenta au plus : une orbe qui vient de partir reste lisible) ; essaim : lueur
  max(2,4 u, distance × 0,02), plus vive (une ligne de points violets qui barre le passage, de loin).
  Chasseur : entre en scène à 400 u, charge à portée + 8 u (100,8 u en f1, 110,4 u en f2 : son orbe part
  toujours), tire quand la Comète passe en z + 110, orbe qui l'atteint en 1,75 s à la croisière (anticipation
  0,65), puis virage lent (recul 35 u/s, latéral ≤ 12 u/s) pendant lequel on peut l'abattre. Vitesse de l'orbe
  réglée sur la croisière, pas sur la vitesse du moment : presque immobile dans le décor, elle est croisée vers
  `WaveData.z` même si la Comète tire en turbo puis le relâche (avant : jusqu'à 7 u d'un portail en f2). Mines et
  essaims apparaissent à 620 u.
- **E. Vagues** (`Course.waves`, `genWaves` de `game3d/courses.ts`) : générateur à part
  (`mulberry32(seed ^ WAVE_SEED_XOR)`), portails et rochers identiques au bit près ; f1 : 6 vagues (mines et
  essaims, un chasseur après la moitié) ; f2 : 10 vagues, les trois types. Jamais dans un portail ni sur sa
  ligne d'approche. Le pilote automatique finit f1 et f2 en tir automatique avec au moins 1 bouclier
  (`EnemyField.avoid` : écart latéral pour une mine, un membre d'essaim là où il sera, une orbe). Vagues obtenues :
  f1 = mine, essaim de 5, mine, essaim de 6, chasseur seul (77 % du parcours), 2 mines ; f2 = 2 mines, essaim de
  6, chasseur, mine, essaim de 7, 2 chasseurs, 3 mines, essaim de 7, 2 chasseurs, mine. Cristaux possibles : f1 23
  (15 rochers + 8 ennemis), f2 98 (78 + 20). Simulation Node (sans rendu, bouches sans l'inclinaison du modèle) :
  3 boucliers sur 3 en f1 et f2, canon 0 à 3 ; sans esquive, f2 perd tous ses boucliers (orbes, mine). Avec la
  réservation des dégâts (B) : tous les tirs touchent ; f2 sans surchauffe à la mitrailleuse (6 au canon léger) ;
  ennemis abattus en f2 : 14 sur 32 (canon léger), 29, 28 et 29 (mitrailleuse 1 à 3 ; avant : 9, 18, 19) ; f1 :
  12, 15, 16, 16 sur 16. Au-delà du niveau 1, les améliorations abattent plus loin (distance moyenne en f2 :
  68, 70, 72 u) et détruisent plus de rochers (163, 166, 172).
- **F. Modèle** : canon léger = tourelle et canon court sous le nez ; mitrailleuse = nacelle sous chaque aile,
  vers son bout (x = ±1,45 : bord d'attaque reculé) et prolongée loin devant (fourreau, long canon, bouche en
  z = −1,12), bagues cyan, bouche lumineuse et une bague de plus par amélioration ; fusionnés avec les pièces et les
  liserés (aucun appel de dessin de plus). Vue de la caméra de poursuite (~13° au-dessus), l'aile cache ce qui est
  dessous jusqu'à ~0,5 u devant son bord d'attaque : sous l'aile à x = ±1,15 et bouche en z = −0,62, les canons
  achetés ne se voyaient pas de dos. Éclair de bouche : halo additif par bouche, 70 ms (+1 ou +2 appels pendant le
  tir). Trait du tir : cœur et halo en fuseaux (faces avant seulement), halo éteint à son anneau et allumé à ses
  bouts (vu dans l'axe : un point qui s'estompe ; un anneau plus vif dessinait un hexagone blanc), épaissi avec la
  distance à la caméra (0,005 u par u : lisible loin devant).
- **G. HUD du vol** : jauge de chauffe du canon (`.fl-heat`, mêmes classes internes que la jauge 2D, `data-gun` =
  `light` | `machinegun`) entre le chrono et le bouton pause (right : hud-right + 62 px, largeur clamp(116 px, 22vw,
  220 px), 108 px sous 620 px), graduations = 1 s de tir continu (25 % canon léger, 33 % mitrailleuse) ; cristaux du
  vol (`.fl-crystals`, pastille sous bouclier et turbo : hud-top + 56 px, + 48 px sous 380 px de haut). Vérifié
  sans chevauchement de 844x390 à 568x320 avec 5 boucliers, mitrailleuse et tir manuel, aussi en surchauffe
  (`small-screens`).
- **H. Score** : points des rochers, ennemis et cristaux ajoutés au score du vol ; étoiles inchangées
  (portails franchis). `StageResult` du vol : `crystals`, `crystalsTotal`, `enemies`.
- **I. Sons** : `shipGun`, `shipMachinegun`, `enemyOrb`, `enemyHit`, `enemyBlast` ; cristal ramassé : `crystal`.
- **J. Hangar** : carte du canon sans « bientôt », effets réels (« Canon léger → Mitrailleuse : cadence ×2,5 »,
  « Dégâts ×1,25, cadence ×1,15 », « Dégâts ×1,5, cadence ×1,3 ») ; `preview/flight.html` : `&gun=0..3`,
  `&manual=1`, J / X / F tir, G gagner (avant : W, qui est Z en AZERTY : on montait en gagnant), L échouer (avant :
  F, désormais tir), 1 / 2 / 3 : chasseur, mine, essaim devant la Comète ; l'écran de fin donne cristaux et ennemis.
- **K. Aides DEV** : `__xr3d.info()` (`heat`, `overheated`, `gunLevel`, `manualFire`, `shotsActive`, `target`,
  `enemies`, `orbsActive`, `crystals`, `crystalsTotal`, `rocksDestroyed`, `points`, `drawCalls` ; en plus :
  `range`, `waves`, `crystalsActive`, `crystalsDropped`, `target.hit`), `__xr3d.spawn(type, distance = 60,
  variant)` (nombre placé ; chasseur tenu à max(30, distance), il tire après 42 u de trajet ; `variant` 0..1, au
  hasard sans lui : orientation de l'essaim et phase de son ondulation comptée depuis la pose, côté du virage du
  chasseur, clignotement de la mine), `__xr3d.fire(on = true)`.
- **L. Cycle de vie** : ennemis mis à jour une fois par sous-pas (`live` en vol ; ensuite ils finissent leur
  mouvement sans toucher la Comète ; jamais pendant l'intro) ; projectiles et cristaux dans toutes les phases,
  ramassage en vol seulement. Tout est dans la scène et le `Bin` (perte de contexte : rien de plus ; `envMap` →
  `swapEnv`) ; `destroy()` : `EnemyField.dispose`, puis tampons d'instances de tous les InstancedMesh libérés.
  Appels de dessin ajoutés : ennemis 4, tirs 1, cristaux 2 (cristaux et halos), éclairs de bouche 0 à 2 (+9 au plus).

### Amendement du 29/10/2026 : bouton TIR, TURBO au-dessus, énergie partagée (décision 3 amendée)

Branche `claude/vol-tir-bouton` (partie de `plans-etapes-1-3` au commit `03b789e`). Remplace, en 3b, le tir
automatique, le réglage « Tir manuel » et la jauge de turbo à part : choix A (surchauffe, devenue celle de
l'énergie), B, G, J et K ci-dessus, points 10 et 15 des « Modifications prévues » (3b) et ce que la section
« Tests » dit du tir automatique, du tir manuel et de la jauge du canon (relevés du 28/10/2026, gardés tels quels).

- **Commandes tactiles du vol** (`input/touch.ts`, `input/styles.ts`) : gros bouton **TIR** `.xr-shoot` (cyan,
  viseur, taille de SAUT : `--xr-jump`) à l'ancienne place de TURBO, en bas à droite ; **TURBO** `.xr-boost`
  (magenta, taille du TIR de la plateforme : `--xr-fire`) au-dessus, un peu décalé vers le centre de l'écran
  (`--xr-jump` × 0,2) et séparé de 1,4 × `--xr-gap` ; TIR créé après TURBO : là où leurs zones de toucher
  élargies se recouvrent, TIR l'emporte. Miroir en mode gaucher ; taille et opacité réglées comme le reste.
  Joystick, TIR et TURBO tenus ensemble (un doigt par commande). Clavier inchangé : J / X / F tir, Espace / Maj
  turbo.
- **Tir** (`game3d/flight.ts`, `updateGun`) : seulement quand TIR est tenu (bouton, J / X / F, appui bref
  mémorisé 150 ms, `__xr3d.fire`), à la cadence du canon. L'aide à la visée (B) oriente toujours les tirs et
  réserve les dégâts d'un tir qui peut toucher (`ShotPool.claim`), sans jamais déclencher un tir.
- **Énergie** (`game3d/shots.ts`, `ShipGun` ; `SHIP_ENERGY` de `core/shipGuns.ts`) : la jauge de chauffe du canon
  devient la jauge d'énergie de la Comète. `ShipGun.boost(h, wants)` est appelé en premier à chaque sous-pas de
  vol : le turbo pousse hors surchauffe et chauffe la jauge de `boostHeat` = **0,4 par seconde** (**2,5 s** de turbo
  d'affilée depuis une jauge froide, comme l'ancienne jauge de turbo) ; puis `step` refroidit (après `coolDelayMs`
  sans tirer **ni pousser** : 0,4 / 0,3 s ; **0,5 / 0,55 par seconde**, immédiat en surchauffe) et tire
  (`heatPerShot` inchangé : canon léger 1/16, surchauffe en 4 s de tir continu ; mitrailleuse 1/30, 3 s).
  Jauge pleine (tir ou turbo) : **surchauffe**, ni tir ni turbo jusqu'à 30 % (canon léger ~1,4 s, mitrailleuse
  ~1,3 s), son « overheat », turbo coupé dès ce sous-pas. Ensemble : canon léger + turbo surchauffent en ~1,5 s ;
  rafales courtes (une seconde de tir = une graduation de la jauge) et turbo bref restent possibles. Valeurs de
  départ, à régler sur téléphone.
- **Module Turbo du hangar** : `ShipLoadout.boostDrainMul` (÷1,25 / ÷1,5) multiplie la chauffe du turbo (3,1 puis
  3,75 s de turbo depuis une jauge froide), `boostFillMul` (×1,25 / ×1,5) le refroidissement de l'énergie (donc
  aussi après les tirs). Carte : « Turbo moins gourmand ; l’énergie (tir et turbo) refroidit plus vite. », effet
  « Durée du turbo et refroidissement ×1,25 », confirmation « Améliorer le turbo (durée du turbo et
  refroidissement ×1,25) ».
- **Réglage retiré** : `Settings.manualFire`, `TouchOptions.manualFire`, l'interrupteur « Tir manuel » des
  Options (et son icône). Une sauvegarde qui le contient se charge sans erreur : `readSettings` ne relit que les
  champs de `DEFAULT_SETTINGS`, le champ est oublié au prochain enregistrement (pas de nouvelle version).
- **HUD** (`ui/hud.ts`, `styles.css`) : la jauge de turbo de la pastille du bouclier disparaît ; la jauge du canon
  devient la jauge **« Énergie »** `.fl-energy` (même place, entre le chrono et la pause : `createHeatGauge` avec
  un titre ; libellé « Énergie » et repère du turbo `.fl-turbo` au-dessus de la barre ; `data-level` cool / warm
  / hot, `.is-over` + SURCHAUFFE dessous, `.is-boost` : repère et liseré magenta). Contrat `FlightHud` : `boost`
  retiré, `boosting` ajouté ; `heat` / `overheated` = énergie. Vérifié sans chevauchement de 844x390 à 568x320,
  5 boucliers compris (`small-screens`).
- **Pilote automatique** (outil DEV) : tient TIR quand la cible visée peut être touchée (comme l'ancien tir
  automatique) ; turbo loin du prochain portail (> 140 u), lancé sous 5 % d'énergie et relâché à 60 %
  (`AP_BOOST_START` / `AP_BOOST_STOP`), pour garder de quoi tirer.
- **Aides DEV** : `__xr3d.info()` : `heat` / `overheated` (énergie), `boosting`, `boostHeat` et `coolRate` (par
  seconde, module Turbo compris) ; `boost`, `boostDrain`, `boostFill` et `manualFire` retirés ; `fire(on)` = TIR
  tenu ; `settle()` : énergie froide, turbo coupé. `preview/flight.html` : `&manual=` retiré, Maj = turbo.
- **Tests** : « aucun tir sans appui » vérifié avec une cible atteignable devant la Comète (condition de l'ancien
  tir automatique) : `assertNoAutoFire` de `tests/e2e/lib/game3d.mjs` (mine posée, sous-pas simulés, `target.hit`
  exigé, aucun tir) dans `touch-controls` et `f1-play` (smoke) et `touch-options` ; `flight-combat` C exige aussi
  `target.hit` sur la mine frôlée.
- **À juger sur téléphone** : un doigt reste au bouton où il s'est posé (glisser de TIR vers TURBO ne déclenche pas
  TURBO). TIR et turbo ensemble (surchauffe en ~1,5 s) demandent donc deux doigts sur ces boutons, en plus du
  joystick : au clavier, ou avec un troisième doigt (c'est ainsi que les tests le font). Pour tirer et pousser d'un
  seul pouce : un doigt posé sur TIR qui glisse dans TURBO l'active aussi (relâché en ressortant), ou une petite
  zone à cheval entre les deux boutons qui active les deux ; ajouter alors un scénario tactile à un seul doigt.

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
| Turbo | 2 | turbo moins gourmand en énergie, énergie qui refroidit plus vite (amendement du 29/10/2026) |

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
    Comète ; ~~tir automatique par défaut, bouton TIR à côté de TURBO en tir manuel
    (`input/touch.ts`, option dans `ui/screens/options.ts`)~~ — remplacé par l'amendement du 29/10/2026 : bouton
    TIR dédié (tir tant qu'il est tenu, la visée oriente les tirs sans les déclencher), TURBO au-dessus.
11. **Astéroïdes destructibles** : un tir les fait éclater (réutilise `onRockHit`, sans perte de bouclier)
    et lâche parfois un cristal.
12. **Ennemis spatiaux** (nouveau `game3d/enemies.ts`), touchés par le Vide, un `InstancedMesh` par type :
    - **chasseur** : arrive de face, tire une fois et s'écarte ;
    - **mine** : immobile dans le couloir, explose si on la frôle ;
    - **essaim** : petit groupe qui ondule et barre le passage.

    Leurs tirs sont des orbes lentes et lumineuses, faciles à lire. Chaque ennemi détruit rapporte des
    points et des cristaux.
13. **Parcours** (`game3d/courses.ts`) : vagues d'ennemis ajoutées aux parcours Nébuleuse et Ceinture
    d'Orak, générées avec la même graine que les portails (parcours identique à chaque partie ; réalisé avec un
    générateur dérivé de cette graine, qui laisse portails et rochers inchangés : choix E).
14. **Modules de la Comète** : boucliers max, turbo (faits en 3a), et canons visibles sur le modèle
    (`game3d/ship.ts`).
15. **HUD du vol** (`ui/hud.ts`) : jauge de chauffe du canon (jauge « Énergie » du tir et du turbo depuis
    l'amendement du 29/10/2026), compteur de cristaux.

### Pour l'étape 4 (réalisée en 4a, branche `claude/world-1-completion-866505`)

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
- **Adaptés et écrits après 3b** (28/10/2026) :
  - `hangar` : carte du canon sans « Effet en vol : bientôt », ligne d'effet réelle (« Canon léger → Mitrailleuse :
    cadence ×2,5 », puis « Dégâts ×1,25, cadence ×1,15 ») ; réglages relus avec `manualFire: false` (absent des
    sauvegardes écrites par le scénario) ;
  - `audio-lifecycle` : 33 effets (`shipGun`, `shipMachinegun`, `enemyOrb`, `enemyHit`, `enemyBlast`) ;
  - `campaign-flow` : f1 gagné aussitôt rapporte les cristaux ramassés avant `win()` (0 en général), la réserve suit ;
  - `flight-autopilot` : au moins 1 bouclier, ennemis abattus et cristaux ramassés, appels de dessin relevés chaque
    seconde sous 150 (obtenus : f1 3 boucliers sur 3, 12 ennemis, 8 cristaux sur 23, 25 rochers, 48 appels au plus ;
    f2 3 sur 3, 15 ennemis sur 32 au canon léger, 22 cristaux sur 98, 96 rochers, 45 appels) ;
  - `small-screens` : `.fl-heat` et `.fl-crystals` dans les vérifications du HUD du vol ; vol à 5 boucliers,
    mitrailleuse et tir manuel de 844x390 à 568x320 (TIR à gauche de TURBO, rien ne se chevauche) ; ligne « Tir
    manuel » des Options de la Pause amenée à l'écran et entière ; en gaucher grand, TIR à gauche (à droite de
    TURBO) ;
  - `touch-controls` : pas de TIR en tir automatique ; `touch-options` : en gaucher et tir manuel, TIR à gauche,
    de la taille du TIR de la plateforme au même cran, opacité de la couche, tir avec le joystick à droite ;
  - `f1-play`, `f1-ctx-*`, `fps-flight` : verts sans changement ;
  - **nouveau `flight-combat`** (≈ 1 min 40) : parcours (vagues déterministes et attendues, empreintes des portails et
    des rochers d'avant 3b) ; f1 au canon léger en tir automatique : mine posée à 60 u abattue en 0,65 s de jeu sans
    bouclier perdu, chasseur abattu en 0,8 s, points exacts (rochers 10, cristaux 50, mine 50, chasseur 150, essaim
    30), cristaux ramassés et compteur du HUD, rocher visé (`target`) et détruits sans bouclier perdu, un son par
    tir ; victoire : « +N cristaux », réserve et sauvegarde ; mitrailleuse : essaim de 6 abattu en 0,8 s (jusqu'à
    3 essais, voir plus bas) et cristal de la vague, cadence 10 tirs/s, bouches alternées, surchauffe après 30 tirs
    (2,9 s), reprise en 1,28 s ; tir manuel (5 boucliers) : aucun tir sans appui, mine frôlée et orbe reçue (un bouclier chacune, au même sous-pas
    que leur disparition, ni points ni ennemi compté), TIR tactile, joystick + TURBO + TIR, J / X / F, canon léger
    (4 tirs/s, surchauffe après 16 tirs en 3,75 s, reprise en 1,42 s), option coupée depuis la Pause (TIR masqué,
    tir automatique revenu) ; f2 au pilote automatique (x2,5) : les trois types rencontrés, 47 appels de dessin au
    plus. Captures pour la revue : gros plans des trois ennemis (nébuleuse et ceinture), orbe, explosion, cristaux,
    Comète armée (de face au compte à rebours, de dos, en plein tir), HUD à 844x390 et 640x320, TIR, option.
- **Aide ajoutée pour les tests** : `__xr3d.info()` donne aussi `shotsFired` et `lastMuzzle` (cadence, alternance des
  canons). Aucun bogue du jeu trouvé par ces tests.
- **Suite complète verte** (28/10/2026, après `npm run build`) : 32 scénarios en ≈ 27 min.
- **Corrigé après la relecture des tests et des captures de 3b** (28/10/2026) :
  - jeu (rendu seulement, règles inchangées) : tirs vus de dos qui saturaient en hexagones blancs (halo éteint à son
    anneau, faces avant seulement, cyan franc, épaissis avec la distance, traits plus longs) ; œil du chasseur
    magenta plus gros que lui (ambre, plus petit) ; cristaux du vol de la couleur des facettes des rochers (couleurs
    fixes de l'icône, halo et éclat : +1 appel de dessin) ; canons de la mitrailleuse invisibles de dos (vers le bout
    de l'aile, prolongés devant) ; explosion du chasseur magenta où l'orbe se noyait, et petit disque blanc de loin
    (blanc et violet, éclair de 0,18 s, onde de choc) ; coques roses de près (liseré froid propre, fresnel discret) ;
    essaim illisible de loin (lueurs plus grosses et plus vives) — voir « Choix de réalisation de 3b », C, D et F ;
  - `__xr3d.spawn(type, distance, variant)` déterministe (l'essaim tiré au hasard faisait échouer `flight-combat`
    environ une fois sur huit) et `info().crystalsDropped` ; puis `__xr3d.settle()` (Comète sur la trajectoire,
    canon froid, turbo plein, orbes retirées) avant chaque essai, posé à un avancement fixé et tracé dans la même
    tâche (`TRIAL_AT`, `SWARM_AT` de `flight-combat`) : l'état laissé par le vol en temps réel, plus lent à froid,
    faisait encore échouer un essai sur quatre environ (essaim « abattu en entier », mine de A, orbe d'un chasseur,
    chasseur des gros plans attendu au ralenti en temps réel) ; variantes remesurées (`swarmFull` 0,3 → 0,65 ;
    `swarmShot` 0,3 garde les gros plans) ; 5 passages à froid identiques au pas près ;
  - `flight-combat` : parcours (fenêtres des vagues contre les zones des portails ; hachage de tous les champs des
    rochers, de la trajectoire et de la distorsion, relevé dans Chrome sur f4275db) ; score du vol = base d'avant 3b
    + points du combat, étoiles inchangées, score affiché = record ; tir automatique jamais sans cible atteignable
    (toutes les traces) et J qui tire sans cible en tir automatique ; cristaux attribués au pas même de chaque
    destruction (mine 1, chasseur 2, dernier membre d'une vague entière 1, aucun pour une vague incomplète ni pour
    un choc) ; essaims à un avancement fixé du vol et à variante mesurée (un abattu en entier, un qui laisse filer un
    membre) ; tir forcé et trace dans la même tâche ; coups pour abattre un chasseur (3 au canon léger et à la
    mitrailleuse, 2 au niveau 3) ; nouvelle partie B3 (mitrailleuse niveau 3 : 13 tirs/s, 39 tirs avant la
    surchauffe ; membre d'essaim percuté ; mine percutée pendant l'invulnérabilité) ; jauge du HUD rallumée après la
    surchauffe ;
  - `flight-autopilot` : partie neuve au départ de chaque vol (aucun ennemi, orbe, tir, cristal, compteur ni
    cristal au HUD de la précédente), « +N cristaux » et réserve = f1 + f2 ; `stress-laps` : géométries, textures et
    programmes du renderer à l'entrée en vol, égaux au 1er et au 3e tour ; `f1-ctx-loss` : après chaque restauration
    sur place, mine abattue en moins de 1 s de jeu et appels de dessin revenus ; `touch-options` : TIR du vol aux
    crans Grands et Discrète (taille du TIR 2D au même cran, couche du vol à 0,45) ; `small-screens` : HUD du vol en
    surchauffe (libellé SURCHAUFFE) de 844x390 à 568x320 ;
  - relevés : hachage des parcours identique dans Chrome entre f4275db et 3b (sous Node aussi, avec d'autres
    valeurs : fonctions Math.* d'une autre version de V8) ; f1 au pilote automatique : score = base + 1 040 points,
    3 étoiles ; essaim à 6 % du parcours (variante 0,3) : 6 sur 6 et 1 cristal ; à 13 % (variante 0,4) : 5 sur 6,
    aucun cristal (mêmes résultats sur 2 à 8 passages ; l'issue dépend de l'endroit, presque toutes les variantes
    laissent filer un membre à 13 %) ; mine abattue en 25 à 37 sous-pas après une restauration, appels de dessin 39
    → 42 ; renderer à l'entrée en vol : f1 36 géométries, 6 textures, 24 programmes, f2 33 / 6 / 23, aux 3 tours ;
    pilote automatique inchangé (f1 3 boucliers, 12 ennemis, 8 cristaux, 26 rochers ; f2 3 boucliers, 15 ennemis,
    22 cristaux, 97 rochers). Aucun bogue des règles du jeu trouvé ;
  - première suite complète après ces changements : l'essaim à orientation libre, posé à 17 % du parcours, a croisé
    la première mine de f1 (z ≈ −849, abattue pendant la trace : 20 points de trop). Il est désormais posé une fois
    cette mine passée ou abattue (dès 18 %, avant l'entrée en scène du premier essaim à 22 %) et n'est que journalisé
    si une vague s'en mêle (les essais à variante fixée, eux, le refusent). Même suite : la mine percutée de B3 a
    déclenché au moment où la première mine de f1 entrait en scène (Comète en z ≈ −229) : nombre de mines inchangé.
    B3 et C posent désormais leurs mines après cette entrée en scène (`afterFirstWave`, 6 % du parcours).
  - **Suite complète verte** (28/10/2026, après `npm run build`) : 32 scénarios en ≈ 33 min (`flight-combat`
    ≈ 1 min 45 seul, 2 min 25 dans la suite).
- **Points relevés par les captures (3b), à juger sur téléphone** :
  - les tirs restent des points vus presque dans l'axe depuis la caméra de poursuite (cyan désormais, épaissis
    au loin) ; l'éclair de bouche se voit mieux ;
  - le chasseur vu de face reste fin (ailes plates vues par la tranche) : œil ambre et bouts d'ailes allumés ;
    l'essaim se lit bien ; la mine se lit dans la nébuleuse mais se perd parmi les rochers serrés de la ceinture ;
    l'orbe magenta, cerclée de sombre, se distingue bien des portails et des cristaux ;
  - essaim de 6 posé à 95 u devant la mitrailleuse et le pilote automatique : selon l'orientation et l'endroit, un
    membre peut sortir du cône de visée de près (le bonus de vague est alors perdu) ; au pilote automatique, f1
    abat 12 ennemis sur 16 ;
  - un appui bref sur TIR (ou J / X / F) moins de 100 ms après un tir est perdu : la mémoire de l'appui (150 ms,
    comme au sol) est plus courte que la cadence du canon léger (250 ms) ; à garder ou à allonger ;
  - cristaux attirés par l'aimant mais pas encore ramassés au début de la distorsion : perdus (ramassage en vol
    seulement) ;
  - l'aperçu du hangar ne dessine pas le canon léger (niveau 0), le modèle 3D si ; inchangé.
- **Vérifications habituelles** : `npm run typecheck`, `npm run check-levels`, `npm run build`, puis la
  suite e2e complète, et un essai sur téléphone (lisibilité du hangar, ~~tir auto~~ TIR et TURBO depuis
  l'amendement du 29/10/2026, fluidité en vol).

## Documentation à mettre à jour

- **3a (fait le 28/10/2026)** : `docs/GDD.md` (« Interface et enchaînement » : hangar, résultats, mode test ;
  cœurs, boucliers et turbo ; cristaux du score qui vont à la réserve), `docs/SOUHAITS.md` (section 3, ordre
  de travail), `CLAUDE.md` (architecture, contrats, recettes Sauvegarde et Achat du hangar, déroulement d'une
  étape, aides DEV), `docs/ARCHITECTURE.md`, `README.md`, `tests/e2e/README.md` (scénario `hangar`,
  sélecteurs, valeurs recopiées).
- **3b (fait le 28/10/2026)** : `docs/GDD.md` (« Mode vol spatial 3D » : tir, tir automatique, ennemis, cristaux
  du vol ; canon de la Comète au hangar ; score, HUD, options, résultats), `docs/SOUHAITS.md` (section 3, « Où on
  en est », ordre de travail), `CLAUDE.md` (`game3d/shots.ts`, `enemies.ts`, `pickups.ts`, `core/shipGuns.ts`,
  contrats, option du tir manuel, recette Parcours de vol : vagues d'ennemis, empreintes de `flight-combat` ; aides
  DEV, clavier), `docs/ARCHITECTURE.md` (arborescence, emplacements réels), `README.md` (canon, tir en vol),
  `tests/e2e/README.md` (`flight-combat`, aides de `__xr3d`, sélecteurs du HUD du vol et du TIR),
  `docs/plans/README.md` (état, prochaine action) ; ici : état, « Ce qui existe déjà » pour l'étape 4.

## Ordre de réalisation

**3a** (fait) — sauvegarde v2 et gain de cristaux (points 1, 2) ; enchaînement et écran du hangar (3 à 5) ;
améliorations dans le jeu 2D (6) ; aperçu (7) ; retrait du choix provisoire (8) ; tests.

**3b** (codée et vérifiée dans le navigateur ; reste l'essai sur téléphone) — tir de la Comète et tir automatique
(9, 10) ; astéroïdes destructibles (11) ; ennemis et vagues (12, 13) ; canons visibles de la Comète et HUD (14, 15 ;
boucliers et turbo du point 14 faits en 3a) ; tests et essai sur téléphone. Tir automatique remplacé par le bouton
TIR et l'énergie partagée (amendement du 29/10/2026, branche `claude/vol-tir-bouton`).

**Balise** (16) : à l'étape 4 (4a, avec les sorties communes du plan 04), dans la branche
`claude/world-1-completion-866505`.
