# Étape 5 — monde 2 (Lune Krator) au nouveau format : plan technique

> **État au 29/10/2026 : choix proposés, rien n'est codé.** On code après validation (les questions sont en
> tête). L'étape suppose la **4c terminée** : libération réutilisable, phase `boss` du vol, « Réessayer le
> combat » en vol, plan d'arme à la réussite. Elle recopie le monde 1, elle n'invente pas un second cadre.
>
> **Ajusté le 29/10 au soir, puis une seconde fois.** La gravité faible garde la portée des sauts. La dalle
> reprend la géométrie du tronc, sans nouvelle pluie. La glissade part à l'appui, sans délai de 120 ms, et
> elle est jouable avant la récompense de m3. Le Crabe est une copie du Scarabée : on ne factorise pas le
> boss de la Jungle. Le ver cosmique a son propre corps.

Cinquième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). Trame :
[HISTOIRE.md](../HISTOIRE.md) (Lune, ver des sables, glissade, Ozzo, ver cosmique).

## À valider

La première réponse est celle proposée. Une objection remplace le choix, pas seulement la ligne.

1. **Trois parties jouables** (5a la gravité et m1, 5b les dunes, 5c le ver cosmique), chacune avec tests verts
   et un essai sur téléphone. *D'accord ?*
2. **Identifiants stables** : on garde `m1` et `f2`. On ajoute `m2` et `m3`. Qui a déjà réussi `m1` ou `f2`
   les garde. `f2` se **referme** tant que `m3` n'est pas réussi (même règle que `f1` au plan 04). *f2 qui se
   referme, ou on le laisse ouvert ?*
3. **Titres** : m1 « Cratères de Krator », m2 « Dunes de verre », m3 « Gouffre du ver ». f2 garde
   « Ceinture d'Orak ». *Ces noms ?*
4. **Le niveau Lune actuel devient m1** (même carte, la Comète `X` laisse place à l'arène et à la balise).
   Si la carte dépasse les bornes de check-levels, on coupe un segment avant d'ajouter l'arène. *D'accord ?*
5. **Gravité faible, même portée.** Gravité ×0,5 sur le thème `moon` seulement, impulsion de saut ×√0,5 :
   le sommet reste **4,2 tuiles**, le temps en l'air passe à ×√2 (~1,4). `MAX_FALL` ne change pas (une chute
   longue rattrape la même vitesse). La Jungle ne change pas. *Ce coefficient ?*
6. **Mini-boss** : Crabe-roi (m1, grand crabe blindé), Tourelle-mère (m2, grande tourelle). 4 touches, 2
   phases, ils s'enfuient. *D'accord ?*
7. **Ver des sables en 3 phases, 6 touches**, gueule ouverte = point faible, saut par-dessus grâce à la
   gravité faible. Le combat se gagne **sans** la glissade (elle s'apprend à la victoire). *D'accord ?*
8. **Ozzo sur le chemin de m2**, sauvetage garanti comme Tess. Au hangar il est visible, **sans achat** :
   ses marques de secrets attendent les étapes 6 et 7. *D'accord ?*
9. **Glissade** : ↓ pendant une course (≥ 70 % de `RUN_SPEED`) lance tout de suite ~3 tuiles, hitbox basse,
   pas de tir. ↓ à l'arrêt, ou encore maintenu à la fin de la glisse, reste l'accroupi. Pas de délai à
   deviner. Les passages qui l'exigent sont des secrets (3 étoiles sans elle). *Ce geste ?*
10. **Ver cosmique sur le parcours `asteroids` actuel** (graine, portails et rochers intacts). Phase `boss`
    après le dernier portail, chrono figé, plan de la **pompe** à la réussite, y compris pour qui avait déjà
    fini f2. *D'accord ?*

## Objectif

Un joueur qui a fini la Jungle :

- joue **3 niveaux** sur la Lune en gravité faible, la créature (le ver) loin, puis proche et agissante, puis
  en boss ;
- secourt **Ozzo** au niveau 2 et le voit au hangar ;
- bat le **ver des sables**, voit la **libération** (le même lecteur que la Jungle) et apprend la **glissade** ;
- affronte le **ver cosmique** dans la Ceinture d'Orak et gagne le **plan de la pompe**.

Hors étape : la carte galactique, Boréa, Vulkar, la Faille (étape 6), les objets secrets qu'Ozzo indiquera
(étape 7), le sol qui glisse (c'est la mécanique de Boréa, pas de la Lune).

## Ce qui existe déjà

- `WORLDS[1]` (`core/worlds.ts`) : « Lune Krator », thème `moon`, gardien « Ver des sables » avec
  `skill: null`, `castaway: null`, boss de vol « Ver cosmique » et plan `shotgun`. Étapes : `m1` (niveau
  `moon`, partie 1, **sans** boss ni récompense) puis `f2` (parcours `asteroids`, partie 4, **sans**
  récompense). Pas de `m2` / `m3`.
- `moon.ts` : un seul niveau, ancien format (pas de `start`, pas de `creature`, sortie `X` dans `LANDING`).
  Segments : `START`, `CRATERS`, `ELEVATOR`, `ACID_POOL`, `TUNNEL`, `LIFTS`, `HIGH_ROAD`, `GAUNTLET`,
  `SQUEEZE`, `LANDING`. Ennemis déjà dessinés pour `moon` (`art/draw/enemies.ts`) : acarien `w`, drone-œil
  `f`, crabe blindé `a`, tourelle `p`, spore-gemme. Aucun dessin de ver.
- Gravité **unique** `GRAVITY = 2600` (`game2d/constants.ts`), posée sur le monde Phaser (`engine/game.ts`)
  et lue par le saut, le double saut, les champignons, les spores, les rochers du titan et `reach.ts`. Les
  ennemis qui marchent ou volent ne tombent pas : ils n'utilisent pas cette constante. Le choix 5 ne change
  donc que le monde Phaser et l'impulsion de Kaï.
- Compétences : `Loadout.skills` n'a que `doubleJump` (`core/types.ts`, défaut dans `save.ts`, lecture dans
  `PlatformScene`). `SKILL_NAMES` et l'icône de résultats aussi.
- Équipage : `CrewId = 'tess' | 'mira'`. Ozzo n'existe pas. Mira est déjà le verrou des cœurs ; on n'y touche
  pas.
- Vol : `COURSES.asteroids` n'a pas de `boss` (le léviathan est sur `nebula`). Le cadre de boss de vol arrive
  avec 4c (`game3d/bosses/`, phase `boss`, chrono figé, nouvel essai). Le hachage `COURSE_FP` de
  `flight-combat` fige portails, rochers et trajectoire : **on ne régénère pas** la Ceinture.
- Libération : `CUTSCENE_IDS` contient `liberation`, `perWorld: true` (`core/story.ts`). Le lecteur est dans
  `src/story/`. Les noms, la compétence et les couleurs du monde se paramètrent ; on n'ajoute pas une seconde
  cinématique de libération.
- check-levels : bornes par partie (`PART_LIMITS`), 3 étoiles sans les secrets de compétence, arène `|` + `M`
  + `K`, naufragé `N` seulement si l'étape a une récompense `crew`.

## Choix proposés (29/10/2026)

Détail des dix questions de « À valider ».

1. **Trois parties.** 5a : physique par thème, m1 au nouveau format, Crabe-roi. 5b : m2, Ozzo, le ver qui
   agit, Tourelle-mère, m3 et le ver des sables, glissade. 5c : ver cosmique et plan de la pompe. 5c attend
   le cadre de boss de 4c. 5a et 5b peuvent suivre 4b si 4c traîne, **sauf** la libération de m3, qui attend
   le lecteur branché.
2. **Progression.** Ordre du monde : `m1 m2 m3 f2`. Réussie = `id` dans `best` (déjà le cas). `f2` n'est plus
   la suivante de `m1` : qui n'avait fini que la Lune d'un bloc rejoue m2 et m3 avant de revoir la Ceinture.
   Pas de `legacyOpen`.
3. **Noms.** L'écran dit aujourd'hui « Lune Krator » pour l'étape, qui est aussi le nom du monde. On le
   réserve au monde. Les trois titres sont des lieux, comme « Lisière de Xéna ».
4. **m1 = la carte actuelle.** Même `id` de niveau `moon` (déplacé vers `levels/moon/m1.ts`). `start: 'ship'`,
   `creature: 'far'`. On remplace `LANDING` (le `X`) par un `K`, une arène de 16 à 22 colonnes et une balise
   `L`. On mesure les colonnes **avant** : au-dessus de 260, on retire `GAUNTLET` ou `SQUEEZE`, pas un peu
   des deux. Les cristaux retirés avec le segment ne comptent plus. 3 étoiles sans glissade (elle n'existe
   pas encore en 5a).
5. **Gravité.** Table `THEME_GRAVITY` dans `game2d/constants.ts` : `jungle` = 1, `moon` = 0,5. L'impulsion
   suit : `sqrt(2 × gravité × 4,2 tuiles)`, soit l'impulsion actuelle ×√0,5. Le sommet en tuiles ne bouge pas,
   donc **`reach.ts` ne change pas de hauteur** et les trous de la Lune actuelle restent les mêmes trous. Seul
   le temps de vol change (×√2). Le double saut garde ses 3 tuiles de la même façon (impulsion ×√0,5).
   `MAX_FALL_SPEED` reste 1 400 : sous gravité moitié, on met plus longtemps à l'atteindre, les petits sauts
   flottent, une chute de puits finit quand même vite. Champignons, spores et rochers du titan restent sur
   `GRAVITY` (ils ne sont pas sur la Lune). `reach.ts` ne change pas : mêmes hauteurs, mêmes trous.
6. **Rejetons.** Crabe-roi : **copie** de `beetleTitan.ts` (charge, carapace, 4 touches, fuite), autre
   dessin, autres chiffres. On ne factorise pas le Scarabée : `boss-titan` et j2 ne doivent pas changer de
   diff. Tourelle-mère : fichier court, fixe, ouverte le temps d'une salve (4 touches, fuite). Pas de
   cinquième espèce d'ennemi.
7. **Gardien.** Arène fermée, `boss: 'sandWorm'`, `ending: 'guardian'`. Il jaillit du sol ; le corps émergé
   tient dans **2 tuiles**, donc le saut actuel (4,2) passe au-dessus, et le temps en l'air plus long sert à
   viser la gueule. Phase 2 après 2 touches, phase 3 après 4. Vie perdue : ver remis à neuf (décision 6 du
   plan 04). « Réessayer le combat » déjà en place. Le Vide ne teinte que lui (taches, puis tout gris), comme
   la méduse-baleine. La glissade n'est pas nécessaire pour le battre.
8. **Ozzo.** Même contrat que Tess : `N`, capsule, porte `D` voisine qui est le seul passage, réplique puis
   LUMA, équipage **à la réussite**. Récompense `{ kind: 'crew', id: 'ozzo' }`. Résultats : « Équipier :
   Ozzo ». Hangar : son nom et son rôle dans l'aperçu, comme Tess. Pas de phrase « bientôt », pas de prix,
   pas de `soon`. Les marques sur la carte arrivent avec l'étape 7, sur l'emplacement vide de l'étape 6.
9. **Glissade.** ↓ pendant que la vitesse horizontale est ≥ 70 % de `RUN_SPEED` : la glisse part à l'appui,
   ~3 tuiles, hitbox basse, pas de saut, pas de tir, les tirs ennemis hauts passent au-dessus. Si ↓ est encore
   là à la fin, Kaï est accroupi. ↓ à l'arrêt = accroupi tout de suite (déjà codé). Pas de fenêtre de 120 ms :
   au stick, un délai invisible se trompe une fois sur deux. Clavier : S ou ↓, même règle. Compétence `slide`
   dans `Loadout.skills`, récompense de m3, réappliquée au chargement. Mode test : disponible, comme le double
   saut. Elle est **codée avant** le combat qui la donne, sinon la libération offre un geste mort. check-levels :
   un passage bas qui n'est franchissable qu'en glissade est un secret (avertissement, 3 étoiles sans elle).
   Le graphe ne la simule pas sur le chemin principal.
10. **Vol.** `COURSES.asteroids.boss = 'cosmicWorm'`. On ne change pas `seed`, `gateCount`, `waves`, ni les
    rochers. Après le dernier portail, le ver a **son propre corps** dans l'arène de vol (comme le léviathan) :
    ses anneaux sont les touches (6, 3 phases). On ne le soude pas à un gros rocher généré : la position de
    ces rochers est figée par `COURSE_FP`, et un combat qui en dépend casse ou devient injouable au premier
    décalage. Vaincu, il lâche le portail de distorsion et le plan. Récompense de f2 :
    `{ kind: 'blueprint', id: 'shotgun' }`, réappliquée au chargement (qui avait fini f2 reçoit le plan,
    décision 16 du plan 04). Musiques : `moon`, `boss`, `guardian` déjà là. Effets nouveaux dans `sfx.ts`
    (jaillissement, gueule, glissade, anneau du ver). On n'ouvre un `world2Sfx.ts` que si `sfx.ts` devient
    difficile à lire. Pas de nouvel identifiant de musique.

## Modifications prévues

### Physique et compétence (`game2d/`, `core/`)

1. **`THEME_GRAVITY`** (`constants.ts`) et `gravityOf(theme)`. `engine/game.ts` pose cette gravité sur le
   monde Phaser. `Player` recalcule son impulsion pour garder 4,2 et 3 tuiles. `reach.ts` garde ses hauteurs.
   Champignons, spores et rochers du titan restent sur `GRAVITY`.
2. **`slide`** : champ de `Loadout.skills`, défaut `false`, migration des sauvegardes (clé absente = faux).
   `Player.ts` : état `slide` à côté d'accroupi. `PlatformScene` le lit comme le double saut. Son `slide` dans
   `sfx.ts`. `SKILL_NAMES`, icône de résultats, `buildPlayLoadout` (mode test).

### Campagne

3. **`CrewId`** gagne `'ozzo'`. `CREW` dans `hangar.ts` : nom « Ozzo », rôle « cartographe ». Pas de ligne
   d'achat.
4. **`WORLDS[1]`** : `skill: 'slide'`, `castaway: 'ozzo'`, étapes `m1` (boss `crabKing`), `m2` (boss
   `turretMother`, récompense Ozzo), `m3` (boss `sandWorm`, `after: 'liberation'`, récompense `slide`), `f2`
   (boss de vol déjà nommé, récompense `shotgun`). Textes dans `story.ts` (titres, conseils, radio).
5. **Libération** : paramètres monde 2 (ver, noyau de Krator, glissade, palette lune). Marque `liberation-2`
   (`stage.world` vaut 2 ; la Jungle est `liberation-1`). Aucun nouvel `CutsceneId`.

### Niveaux et boss 2D

6. **Dossier `levels/moon/`** : `m1.ts` (carte actuelle ajustée), `m2.ts`, `m3.ts`. `levels/index.ts` retire
   l'ancien `moon.ts`.
7. **m2** : `start: 'beam'`, `creature: 'near'`. `shadow` (l'ombre du ver). `quake` : `FallingTrunk` garde
   sa géométrie (souche 1 case, fût 3×2, check-levels inchangé) et choisit le dessin du thème (dalle de
   régolithe sur la Lune, tronc dans la Jungle). Un passage se ferme, l'autre s'ouvre. Pas de pluie
   recolorée : deux événements suffisent, une troisième peau de spores est du dessin pour un effet que la
   Jungle a déjà. Ozzo derrière une porte, sauvetage garanti. Arène de la Tourelle-mère, balise `L`.
8. **m3** : `creature: 'looming'`, radio brouillée, une arène, `ending: 'guardian'`. Pas de balise : la
   libération enchaîne l'embarquement (déjà le modèle de j3).
9. **Boss** : `bosses/crabKing.ts`, `turretMother.ts`, `sandWorm.ts`, enregistrement dans `bosses/index.ts`
   et `BOSS_IDS`. Dessins dans `art/draw/bosses.ts`. Le ver du décor : branche `moon` de `parallax.ts`
   (`far` / `near` / `looming`), aujourd'hui un ciel sans créature.

### Vol

10. **`bosses/cosmicWorm.ts`** sur le registre de 4c, identifiant `cosmicWorm` dans `FLIGHT_BOSS_IDS`.
    `COURSES.asteroids.boss`. Le parcours généré ne change pas : le test `COURSE_FP` reste vert sans mise à
    jour de hachage. S'il change, c'est un bug, pas une régénération.

## Tests

- `npm run check-levels` : m1, m2, m3 dans les bornes ; les hauteurs de saut en tuiles de la Jungle **et**
  de la Lune restent celles d'aujourd'hui (assertion sur un trou connu de chaque thème) ; 3 étoiles sans
  glissade ; Ozzo sur l'unique passage.
- Scénarios : `m1-play` (arrivée ; un saut mesuré : même sommet en tuiles, temps de vol plus long),
  `boss-crab`, `m2-play` (dalle, Ozzo à la réussite seulement), `boss-turret`, `slide` (course = glisse,
  arrêt = accroupi). `boss-titan` reste vert sans diff sur le Scarabée. `boss-worm` (gueule, 6 touches,
  résultats + glissade). `f2-boss` (ver cosmique, nouvel essai, plan de la pompe). `progress-ids` : ancien
  `best` avec `m1` et `f2` → JOUER propose `m2`, `f2` n'est pas jouable tant que `m3` n'est pas réussi, le
  plan est rendu à qui a `f2`.
- `flight-combat` : `COURSE_FP` de la Ceinture identique.
- Suite e2e complète en fin de 5b et de 5c. Essai téléphone en fin de chaque partie : hauteur des sauts,
  mal de mer de la gravité faible, lisibilité du ver et de la gueule, glissade au stick, ver cosmique parmi
  les gros rochers.

## Documentation à mettre à jour

- `CLAUDE.md` : recette Niveau (gravité par thème, dalle de `quake`, compétence `slide`),
  campagne à 8 étapes. `GDD.md` : Lune en 4 étapes, gravité, glissade, Ozzo, deux mini-boss, ver, plan de la
  pompe. `HISTOIRE.md` : noms retenus du monde 2, une fois les choix validés. `SOUHAITS.md` : sections 1, 2
  (pompe), 4, 7 (Ozzo). `ARCHITECTURE.md` : dossier `levels/moon/`. `plans/README.md` :
  l'état de l'étape. `tests/e2e/README.md` : nouveaux scénarios.

## Ordre de réalisation

**P** ≈ une séance, **M** ≈ 2 à 3, **G** ≈ 4 à 6.

**5a — gravité et m1** (après 4b ; la libération n'est pas dans cette partie)

- [ ] **1. P — Gravité par thème.** `THEME_GRAVITY`, monde Phaser, impulsion du joueur. `reach.ts` inchangé.
      Rien d'autre : la Lune actuelle se joue avec les mêmes trous, plus lentement en l'air, et reste
      finissable.
- [ ] **2. M — m1 au nouveau format.** Déplacer `moon.ts`, remplacer l'arrivée `X` par arène + balise, couper
      un segment si > 260 colonnes. `start: 'ship'`, `creature: 'far'`. Radio courte (gravité, crabes).
- [ ] **3. M — Crabe-roi.** Copie de `beetleTitan.ts`, autre dessin, 4 touches, fuite, `boss-crab`. Le
      fichier du Scarabée ne change pas.
- [ ] **4. P — Documentation de 5a et essai téléphone** (hauteur de saut, taille de l'arène sous le stick).

**5b — les dunes** (libération de m3 : après le lecteur de 4c)

- [ ] **5. M — Dalle et créature.** Dessin de `FallingTrunk` selon le thème, ver dans `parallax.ts` (`near`).
- [ ] **6. M — m2, Ozzo, Tourelle-mère.** `CrewId`, récompense, hangar sans achat, `m2-play`, `boss-turret`.
- [ ] **7. M — Glissade.** Compétence, geste, secret de check-levels, scénario `slide`, mode test. Avant m3.
- [ ] **8. G — m3 et ver des sables.** 6 touches, 3 phases, radio brouillée, défaite → libération. La
      récompense `slide` tombe sur un geste déjà jouable.
- [ ] **9. P — Suite e2e, documentation de 5b, essai téléphone.**

**5c — ver cosmique** (après 4c)

- [ ] **10. M — `cosmicWorm` sur `asteroids`.** Sans changer le hachage du parcours. `f2-boss`, plan de la
      pompe rétroactif.
- [ ] **11. P — Sons du monde 2, documentation, essai téléphone** (lisibilité du ver parmi les rochers, touches
      sur les anneaux).
