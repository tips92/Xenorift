# Étape 4 — monde 1 complet au nouveau format : plan technique

> **État au 29/10/2026 : 4a et 4b faites** (étapes 1 à 12 de l'ordre de réalisation), vérifiées par typecheck,
> check-levels, build, la suite e2e complète (39/39) et le diag (7/7) ; 4a essayée sur téléphone le 29/10
> (décisions 20 et 21) ; essai sur téléphone de 4b à faire. **Prochaine action : 4c, étape 13.** 3b est fusionnée
> dans la branche ; le tir au bouton du vol (décision 21) se fait à part et n'y est pas encore.
>
> Écarts de 4a au plan, tous dans le sens des décisions :
> - Blob-roi complet dès l'étape 5, puis réglé à l'étape 6 (52 PV) ; converti en 4b en **4 touches** (décision 20) ;
>   prime « Boss vaincu +2 000 » aux résultats ; barre de
>   boss en bas au centre (le haut est pris par le HUD et la bulle) ; renforts enfermés hors de l'arène (`fence`).
> - j1 : 252 colonnes (arène 220-239, balise en 244, K en 217), `levels/jungle/j1.ts` ; premier marcheur enfermé
>   entre deux piliers ; 11 messages de tutoriel (courir et sauter réunis) + 3 d'histoire ; `RadioMessage.keys`
>   (texte du clavier) et `urgent` ; déclencheurs `overheat`, `boss`, `checkpoint`, `door` ; check-levels simule
>   la file de la radio. Pas de seconde ruine (glyphes dans la salle murée existante).
> - Balise : son faisceau couvre toute sa colonne (on ne la saute pas) ; check-levels le sait (`scripts/lib/reach.ts`).
> - `departLabel` dans `ui/flow.ts` (retiré de `core/hangar.ts`) ; `LevelData.parTimeS` remplace
>   `TIME_BONUS_REF_S` ; `=` de la Jungle en branches, lianes, passerelles dès 4a.
> - Lecteur de cinématiques prêt (`src/story/`), branché à l'étape 14.
>
> Écarts de 4b au plan :
> - **Boss en touches** (décision 20) : contrat `Boss.hitBy(x, y)` sans `dmg` (point 16 : -1 raté, 0 blindé ou point
>   faible fermé, 1 touche ; plombs de la même salve absorbés 120 ms), `takeDamage(n)` en touches, barre en crans
>   (`BossHud.steps`) ; `BOSS_FIGHT_S` 25 / 30 / 60 s (IA `boss-bot` : Blob-roi ≈ 12 s, titan ≈ 16 s).
> - **Scarabée-titan** : sur le dos, tout son corps prend les tirs (le tir debout atteint le dôme ; le ventre seul
>   restait hors de portée), le ventre reste la cible des sauts ; sa charge s'arrête à la première case pleine (les
>   champignons collés aux bornes, qu'il écrase) ; cailloux annoncés par une marque seule ; arène de j2 à 16 colonnes
>   (206-221), champignons 207 et 220 contre les bornes.
> - **Méduse-baleine** : corps inoffensif hors plongée (Kaï le traverse) ; cœur ouvert vulnérable en entier ;
>   cachée avant le combat (elle arrive à la fermeture des barrières, la méduse du décor se cache) ; arène de j3 à
>   18 colonnes (162-179), 3 passerelles à hauteur du cœur ; `Boss.defeatMs`, `SCORE_GUARDIAN` 5 000.
> - **j2** (232 colonnes) : le tronc bouche l'entrée d'un tunnel sous un grand rocher ; la salle de Tess est creusée
>   dans le rocher (pas au-dessus du tronc) ; sauvetage garanti par la carte (sa porte est le seul passage, prouvé
>   par une borne haute du graphe, `ReachGraph` `bound`) ; portes fermées pendant le sauvetage ; radio :
>   `RadioMessage.interrupt` (dialogue sans trou) et `castaway` (muet une fois Tess à bord) ; Tess déjà à bord :
>   capsule seule (`PlayLoadout.crew`) ; message du titan avant l'arène (pas au déclencheur `boss` : bulle pendant
>   le rebond d'entrée). Conseil d'intro « … et retrouve Tess ! » remis.
> - **j3** (186 colonnes) : un seul point de contrôle (159), repères par partie dans check-levels
>   (`PART_LIMITS.checkpoints`) ; radio brouillée de bout en bout (5 messages courts) ; pluie de spores, ni ombre ni
>   secousse.
> - Ajouts : `Effects.shake(force, ms?)` (durée réglable), `Mushrooms.squash`, registre des boss `flyers` / `music`,
>   `EnemyManager.summonFlyer`, `PlatformScene.setMusicLevel`, icônes de j2 et j3, `.results-details.is-dense`,
>   `Items.lightCheckpoint` (K contourné allumé sans message au nouvel essai), `screenButton` des tests. La
>   méduse-baleine lointaine de j1 a ses taches grises (décision 9) : seul changement visible de j1 hors du boss.
> - Restent pour plus tard : `boss-bot` ne joue pas la gardienne ; « Réessayer le combat » en vol (4c).
> - Détail et mesures : journal de la séance (hors dépôt) ; résumé dans CLAUDE.md, recettes « Niveau 2D »,
>   « Boss 2D » et « Message de LUMA ».

Quatrième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). En cours de réalisation (branche `claude/world-1-completion-866505`, partie de `plans-etapes-1-3` après 3a). Elle s'appuie sur les
étapes [1](01-controles.md) (visée, accroupi, portes), [2](02-armes.md) (arme générique, `loadout`, compétence
`doubleJump`) et [3](03-hangar.md) (sauvegarde v2, hangar, balise, combat en vol) : 4a et 4b demandent 3a, 4c
demande 3b. Le monde 1 sert de **modèle** : table des mondes, boss, radio et cinématiques resserviront tels quels.

## Objectif

Une fois l'étape finie, un joueur qui commence une partie :

- voit le **prologue** (≈ 40 s, bouton Passer) : le signal, la Faille, l'arrivée sur Xéna ; LUMA annonce le but
  (libérer le gardien et rapporter son noyau, qui ouvrira le portail) ;
- joue les **3 niveaux de la Jungle**, guidé au niveau 1 par la radio de LUMA ; la méduse-baleine, tachée par le
  Vide, se rapproche d'un niveau à l'autre et agit au niveau 2 ; il peut visiter la ruine du niveau 1 ;
- bat un **mini-boss** à la fin des niveaux 1 et 2 (point de contrôle juste avant), puis la **balise** le
  remonte au hangar ; secourt **Tess** au niveau 2 ;
- combat la **méduse-baleine** au niveau 3, voit la **libération** et apprend le **double saut** ;
- affronte le **léviathan** en vol, gagne le **plan du mitrailleur**, puis continue sur la Lune (ancien format).

Les anciennes sauvegardes gardent records et étapes réussies (nuance au choix 2). Hors étape : monde 2 au
nouveau format (étape 5), carte galactique et mondes 3 à 5 (6), secrets et niveaux bonus (7), ennemis du Vide.

## Ce qui existe déjà

État du worktree (étape 1 codée), les plans 02 et 03 étant supposés faits :

- `core/` : 4 étapes écrites à la main (`nextStage` = `STAGES[index + 1]`) ; `unlocked` est un **index**, lu par
  `App.ts` (`continueStage`, `playSub`) et par 4 tests ; `ThemeId`, `MusicId`… sont des unions sans liste à
  l'exécution ; `AudioApi.music(id)` sans intensité ; `onFail(reason)`.
- `levels/jungle.ts` : 226 colonnes, 53 cristaux, dont 5 en « secret de compétence » et 3 dans la salle murée du
  segment `ARMORED` (« ruine astréenne », portes `D` col. 128 et 144) : les 3 étoiles (≥ 90 %) la demandent
  déjà. `check-levels.ts` (727 lignes) : un `P`, un `X`, seuils fixes, thèmes et musiques listés à la main.
- `engine/PlatformScene.ts` (~730 lignes) : scène réutilisée, remise à zéro dans `init()` ; sans `X`,
  `fallbackExit` pose quand même une Comète ; sur perte de contexte, le niveau n'est validé que dans l'état
  `exit` (`finishExitNow`) ; `TILE_BIAS` = 32 px par pas ; `SporePool` de 16 ; ennemis tous issus de la carte.
  Côté `art/`, `createParallax(scene, theme)`, signature figée, fait dériver une méduse-baleine néon au loin.
- `game3d/flight.ts` (~1050 lignes) : `intro → fly → warp | dead | timeout → done`, `compile` dans le
  constructeur, distorsion quand `z <= course.warpZ` ; le léviathan (`creatures.ts`, rayon ≈ 59, au loin) n'est
  qu'un décor ; `preview/flight.ts` implémente `HudApi` hors typecheck. `ui/App.ts` : `menu | intro | playing`.
- [Points de vigilance](../ARCHITECTURE.md#points-de-vigilance-avant-de-grandir) : 63 tests `'jungle'` /
  `'moon'` dans 14 fichiers, des choix `'nebula'` / `'asteroids'` dans 6. Tests touchés : section Tests.

## Décisions (28/10/2026)

Les 19 choix proposés ont été **validés tels quels** par l'utilisateur le 28/10/2026 ; 4a et 4b commencent avant
la fin de 3b (4c, pour le léviathan, attend le tir en vol de 3b). Les questions restent pour mémoire ; la
solution retenue est toujours la première proposée, pas l'« Autre ».

1. **Trois parties jouables** : 4a fondations (tables, progression, écran Niveaux, radio, boss, j1), 4b la Jungle
   (j2, j3, nouvel essai), 4c histoire et vol. Chacune finit sur un jeu complet, des tests verts, CLAUDE.md à
   jour et un essai sur téléphone. Autre : un seul bloc. *D'accord ? 4a peut-elle commencer avant la fin de 3b ?*
2. **Progression par identifiants** : réussie = `id` dans `best` ; ouverte = la première, une réussie ou la
   suivante d'une réussie ; JOUER = la première ouverte non réussie. Rien à convertir (ancien `unlocked: 3` :
   j1, f1, m1 réussis, j2 et f2 ouverts, JOUER → j2), mais f1 se referme pour qui n'avait fini que j1. Sinon
   `legacyOpen`, noté une fois d'après l'ancien index et l'ordre v0.1 figé (`j1 f1 m1 f2`, pas `STAGES`).
   Autre : convertir l'index (j2 et j3 ouverts sans être joués). *f1 qui se referme, ou `legacyOpen` ?*
3. **Six étapes `j1 j2 j3 f1 m1 f2`** (18 étoiles), monde 2 visible à l'ancien format jusqu'à l'étape 5 ; niveaux
   `jungle2`, `jungle3` ; titres « Lisière de Xéna », « Canopée des spores », « Sanctuaire du gardien ».
   Autre : masquer le monde 2. *Monde 2 visible ? Ces noms ?*
4. **Le j1 actuel devient le niveau 1** (même `id`, mêmes colonnes) : la Comète finale laisse place à `K`, à
   l'arène et à la balise ; la salle murée de l'étape 1 devient la ruine (glyphes, message de LUMA), sans seconde
   ruine ; 3 étoiles sans double saut, salle comprise. Autre : trois niveaux neufs. *D'accord ?*
5. **Écran Niveaux : une page par monde** (◀ ▶, glissement, étoiles du monde), ouvert sur l'étape à jouer ;
   cartes inchangées. Autre : tous les mondes à la suite, à faire défiler. *D'accord ?*
6. **Boss dans une arène fermée** (bornes `|`, `K` juste avant, barrières, caméra calée, barre de vie). Vie
   perdue : retour au `K`, **boss remis à neuf**. Autre : il garde ses dégâts (plus facile). *Remis à neuf ?*
7. **« Réessayer le combat »** si les vies tombent à zéro contre un boss, en 2D comme en vol (SOUHAITS §4) :
   reprise au `K` (en vol : au début du combat, boucliers pleins), état noté à ce moment, 3 vies, **sans prime de
   vies**. Exception à la décision 1 du plan 03 : l'essai prolonge la tentative, les cristaux du `K` sont gardés.
   Autre : tout recommencer (2 à 3 min ; 75 s en vol). *D'accord, vol compris ?*
8. **Mini-boss, rejetons du gardien** : Blob-roi (niveau 1), Scarabée-titan (niveau 2), point 17 ; vaincus, ils
   s'enfuient. Autre au niveau 2 : Reine-guêpe (visée vers le haut, déjà au niveau 3). *D'accord ?*
9. **Méduse-baleine en 3 phases** (SOUHAITS : 2 ou 3 ; point 18) ; en 2D, le Vide ne touche que le gardien :
   taches grises en j1, plus en j2, tout gris en j3, où la radio se brouille. Autre : décor et ennemis éteints
   dès j3 (palettes par monde, mieux à l'étape 6). *3 phases ? Le Vide sur le gardien seulement ?*
10. **Champignons dès cette étape, créature qui agit en j2** (ombre, secousse qui abat un tronc, pluie de
    spores) ; `createParallax`, signature figée, reçoit un 3ᵉ paramètre facultatif. Autre : les reporter.
    *D'accord, signature comprise ?*
11. **Tess sur le chemin de j2** : le tronc abattu barre la route, on passe par une salle murée au-dessus (portes
    A ↔ B et C ↔ D, comme la ruine). Téléportée par LUMA, elle n'entre dans l'équipage qu'à la réussite (après un
    échec, elle attend de nouveau). Autre : salle facultative. *Sauvetage garanti ?*
12. **LUMA dans une bulle non bloquante** ; le tutoriel se tait une fois j1 réussi au nouveau format (marque
    `tutorial-j1` dans `story.seen` : un ancien joueur le voit une fois). Autre : pause à chaque message.
    *D'accord ?*
13. **Cinématiques sur un `<canvas>` 2D de l'interface**, avec les dessins du jeu 2D : dessinées par code comme le
    veut HISTOIRE, sans second contexte WebGL. La défaite du gardien reste dans la scène (≤ 2,6 s, encore gris) ;
    ses couleurs ne reviennent que dans la libération. Autre : libération dans Phaser. *D'accord ?*
14. **Une cinématique se joue d'elle-même la première fois** : prologue avant la première étape lancée (anciens
    joueurs compris), libération après la première victoire sur j3 ; vue à la fin ou au Passer (aussi le bouton
    retour) ; arrêtée en arrière-plan, elle reprend seule ; `?stage=` saute celle d'avant, pas celle d'après ;
    Options › « Revoir les cinématiques ». Autre : à chaque fois. *D'accord ?*
15. **Léviathan de la nébuleuse** : il suit les 16 portails puis avale le portail de distorsion (notre lecture
    d'« il avale des portails ») ; libéré par les tirs sur ses plaques, il le recrache avec le plan. **Chrono
    figé** : seule la perte de tous les boucliers fait échouer. Autre : chrono qui continue. *Chrono figé ?
    Cette lecture ?*
16. **Récompenses dans la table des mondes** (j2 → Tess, j3 → double saut, f1 → plan), données à la réussite et
    réappliquées au chargement (ensembles) : qui avait fini f1 reçoit le plan. Autre : le mode les signale dans
    `StageResult`. *Plan rétroactif ?*
17. **Tables par monde avant le contenu** (sauf objection) : 2D en 4a ; `'nebula'` / `'asteroids'` en 4c, car
    ces fichiers bougent avec 3b.
18. **Trois musiques** `boss`, `guardian`, `story` ; l'intensité du gardien par phase demande
    `AudioApi.musicLevel(n)`. Autre : une seule musique de boss. *D'accord ?*
19. **Bouton du hangar** : « Atterrir » (niveau 1), « Redescendre » (niveaux 2 et 3), « Décoller » (vol), au lieu
    du « Décoller » unique du plan 03. Les cœurs demandent Mira (monde 3, étape 6). *Ces libellés ? Cœurs
    achetables sans Mira d'ici là ?*

**Ajouts du 29/10/2026, après l'essai de 4a sur téléphone** (remplacent les vies « 24, 36, 3 × 20 » du point 16) :

20. **Boss en touches** : un boss se bat en touches, pas en points de vie. Une touche = un tir qui atteint le point
    faible exposé (ou un saut dessus quand le boss l'accepte), quelle que soit l'arme ; le point faible se referme
    ensuite jusqu'à la fenêtre suivante. Blob-roi et Scarabée-titan : 4 touches (phase 2 après 2) ; méduse-baleine :
    6 touches, 2 par phase. Les améliorations de dégâts ne changent rien contre les boss.
21. **Vol : tir au bouton** (modifie la décision 3 du plan 03) : bouton TIR à la place du TURBO, tir continu tant
    qu'on appuie, plus de tir automatique ni d'option « tir manuel » ; TURBO au-dessus ; une seule jauge d'énergie
    que le tir et le turbo font chauffer ; en surchauffe, ni tir ni turbo jusqu'au refroidissement. Fait à part
    (branche `claude/vol-tir-bouton`, partie de `plans-etapes-1-3`), puis fusionné.

## Modifications prévues

### Campagne, contrats et interface (`core/` lisible par Node, imports de valeurs en `.ts` ; `ui/`)

1. **`core/worlds.ts`** : par monde, nom, `ThemeId`, gardien (nom, noyau, compétence), naufragé, boss du vol et
   plan, étapes avec `part` (1 à 3, 4 = vol), `before` / `after`, `rewards`, `boss`. **`core/ids.ts`** :
   `THEME_IDS`, `COURSE_IDS`, `MUSIC_IDS` en `as const`, d'où découlent les unions ; `check-levels` les lit.
2. **`core/stages.ts`** construit `STAGES` depuis `WORLDS`. **`core/story.ts`** : titres (aussi `LevelData.name`),
   sous-titres « Monde 1 · Niveau 2 », conseils d'intro (j1 : « LUMA te guide : rejoins sa balise ! » ; f1 :
   « Le noyau a ouvert le portail… et quelque chose nous suit. »), radio (`RadioId` → texte, humeur,
   `tutorial`, `scrambled`), cinématiques.
3. **`core/save.ts`** : `isCleared`, `isUnlocked(stage)`, `nextToPlay()`, `isFresh()` (`best` et `story.seen`
   vides : « Nouvelle aventure ») ; `recordResult(stage, result)` applique les `rewards` ; champ
   `story: { seen: string[] }` avec sa valeur par défaut ; `blueprints` s'il manque à la v2.
4. **`core/types.ts`** : `HudApi.radio(id)`, `HudApi.updateBoss(s | null)`, `ModeHooks.startAt?`,
   `onFail(reason, retry?)` (point de reprise : `{ at: 'boss' }` plus un instantané opaque), `musicLevel(n)`,
   `BossId`, `RadioId`, `CutsceneId`, chacun ajouté à l'étape qui s'en sert ; à reporter à la main dans
   `preview/flight.ts` (hors typecheck) et les enveloppes protégées (`ui/services.ts`, `session.ts`, `hudSync`).
5. **Niveaux** (`screens/select.ts`) : pages, glissement qui annule le `click` d'une carte, `data-stage`, icônes
   par étape. **Résultats** : « Compétence : double saut », « Équipière : Tess », « Plan : mitrailleur ».
   **Échec** : « Réessayer le combat » si le mode a rendu un point de reprise.
6. **Enchaînement** : phase `story` ; `before` avant la carte d'intro, `after` avant les résultats ; JOUER =
   `nextToPlay()`. `ui/flow.ts` ne prend que les décisions pures (étape, cinématique, libellé du hangar) ;
   `navigate`, `flowId` et les fondus restent dans `App.ts`. `__xrShell.info()` gagne `stages` et `cutscene` ;
   `?at=boss` (dev seulement) remplit `startAt`.
7. **Radio** (`ui/radio.ts`) : 2 messages en file, bulle en haut à gauche en `pointer-events: none`, lettres au
   rythme de `lumaBip` (≤ 8 par seconde, une voix), arrêt en pause, texte complet posé une fois dans un nœud
   `aria-live` masqué ; tutoriels filtrés ici. **Barre de boss** (`ui/hud.ts`), commune au 2D et au vol.
   **Hangar** : Tess à l'établi (niveaux 2 et 3 ouverts avec elle). **Options** : « Revoir les cinématiques ».

### Niveaux (`game2d/levels/`, `engine/mapBuilder.ts`, `scripts/check-levels.ts`)

8. **Légende** (`levels/types.ts`, `parseLevel`, `buildTilemap`) : `L` balise, `M` boss, `|` borne d'arène,
   `o` champignon (case solide, aussi dans `SOLID_CHARS`), `N` naufragé, `G` glyphes ; branches, lianes et
   passerelles = `=` aux dessins tirés au hasard (`TILESET`, `TILE_FRAME`). `LevelData` : `boss?`, `creature`,
   `radio?` et `events?` (fenêtres `[col0, col1]`), `start` (`'ship' | 'beam'`), `parTimeS`. Rangement :
   `levels/jungle/{j1,j2,j3}.ts`.
9. **j1** (≈ 250 colonnes) : au départ, la Comète repart en orbite derrière Kaï (variante à vide d'`ExitShip`,
   LUMA accuse le brouillage) ; une douzaine de messages (courir, sauter, écraser ou tirer, viser en haut et en
   diagonale, s'accroupir, descendre d'un `=`, blocs bonus, point de contrôle, surchauffe, porte, blindé,
   cristaux « pour plus tard ») ; `G` dans la ruine ; escalier → `K` → arène du Blob-roi → balise et hangar.
10. **j2** (≈ 230 colonnes, départ `'beam'`) : champignons présentés par LUMA, seuls puis au-dessus de trous ;
    créature proche et ses 3 événements ; tronc et salle de Tess ; secret de compétence ; arène du Scarabée-titan
    avec 2 champignons ; balise. **j3** (≈ 160 + 20 colonnes, départ `'beam'`) : plus exigeant, gardien immense
    et gris, radio brouillée ; un seul `K` avant l'arène (2 ou 3 `=`, 2 champignons) ; pas de sortie.
11. **`check-levels`** : sortie = un `X` ou un `L`, aucune pour un gardien (`fallbackExit` supprimé) ; arène
    (deux `|`, `M` entre, `K` dans les 6 colonnes avant, sol continu, 16 à 22 colonnes) ; arcs « champignon » ;
    `radio` et `events` contre `core/story.ts` ; 3 étoiles sans secret de compétence ; durée avec le combat ;
    seuils selon `part` ; cohérence avec `WORLDS`. Graphe sorti dans `scripts/lib/reach.ts` dès 4a.

### Moteur 2D et boss (`game2d/`) : fichiers à part, remis à zéro dans `init()`, libérés dans `onShutdown()`

12. **Sorties** (`exit.ts`) : `ExitShip`, `Beacon` et la défaite du gardien partagent l'état `exit` (≤ 2,6 s,
    couvert par `finishExitNow`). `__xr2d.win()` va à la sortie ; en j3, il amène d'abord Kaï dans l'arène.
13. **Arène** (`arena.ts`) : barrières = cases solides posées par `putTileAt` (elles arrêtent aussi les ennemis),
    retirées à la réouverture ; bornes de caméra par un seul propriétaire, `updateCameraBounds()`, appelé par
    `snapCamera()`. Instantané du choix 7 : cristaux, blocs `?`, ennemis morts, messages et événements joués,
    Tess, bonus, temps ; rendu aussi avec un échec « Liaison graphique perdue » en plein combat.
14. **Événements** (`levelEvents.ts`) : une fenêtre joue une fois par partie et se saute si Kaï n'y est pas passé
    (téléportation) ; « première surchauffe », ombre, secousse (une seule fonction `fx.shake(force)`, pour une
    future option de confort), pluie de spores (`SporePool` à 32, `drop(x, y)`, taches à part).
15. **Champignons** : rebond à l'atterrissage (`body.blocked.down` sur `o`) ; `MUSHROOM_BOUNCE_TILES` (≈ 6,5 ;
    ≈ 8 en tenant Saut) dans `constants.ts`, **9 au plus** : au-delà, un pas frôle `TILE_BIAS` et Kaï traverse.
    **Tess** (`npc.ts`). **Ennemis appelés** : 6 marcheurs et 4 volants cachés dès le chargement, hors score.
16. **Contrat `Boss`** (`bosses/types.ts`) : vie, phase, état, `start`, `update`, `hitBy(x, y, dmg)` (0 sur une
    partie blindée), `hurts`, `stomp?`, `reset`, `destroy` ; `createBoss`, `generateBossArt`, `destroyBossArt` (à
    l'arrêt de la scène). Vies à régler : 24, 36, 3 × 20 (laser = 2) ; `SCORE_BOSS` 2000 (gardien 5000).
17. **Blob-roi** (bonds, onde au sol, noyau exposé quand il s'aplatit ; phase 2 : 2 petits blobs) et
    **Scarabée-titan** (charges, carapace qui renvoie les tirs, ventre exposé quand il s'assomme contre une
    barrière ; phase 2 : cailloux) : `drawWalker` / `drawArmored` à l'échelle 3 ; vaincus, ils fuient.
18. **Méduse-baleine** (`drawWhale` exporté, échelle 1 à 1,2) : corps au-dessus de la tête de Kaï au sommet d'un
    saut sauf en plongée, cœur descendu à 3 tuiles au plus du canon (gagnable à la pompe) ; spores annoncées
    par une tache ; tentacules abattus (phase 1), balayage à mi-hauteur et 2 guêpes (2), plongée (3) ; cœur
    exposé 3 puis 4 s, corps insensible. Défaite : immobile, cri, elle s'élève.
19. **Décor** (`art/parallax.ts`) : `opts.creature` = `'far' | 'near' | 'looming'` (taille, hauteur, dérive,
    part de gris), `setCreature()` (cachée dans l'arène de j3), `shadowPass()`. **Dessins** (`art/draw/`) :
    balise, champignon, barrières, tronc, Tess et capsule, glyphes, branches, lianes, passerelles.

### Radio et cinématiques (`src/story/`)

20. `portraits.ts` (LUMA en 4 humeurs, Tess), `bubble.ts` (bulle DOM commune), `player.ts` (`playCutscene` →
    `pause`, `resume`, `skip`, `destroy`, `done` ; `<canvas>` 2D, densité ≤ 1,5, pas borné, aucune allocation par
    image, **Passer** en `<button>`), chargé par import dynamique ; écran `ui/screens/cutscene.ts`. `story/` et
    `ui/` n'importent du jeu 2D que `art/draw` et `art/util`.
21. **Prologue** (≈ 40 s) : le signal, la Faille, des mondes gris, l'atterrissage en bordure de la jungle
    (« Bonne nouvelle : on est vivants… »), le gardien au loin, le but. **Libération** (≈ 15 s, paramétrée par
    le monde) : le Vide quitte le gardien, ses couleurs reviennent, le noyau, « DOUBLE SAUT », l'embarquement.

### Vol 1, sons et tables

22. **Parcours** : `CourseDef.boss?` ; rochers au-delà du dernier portail retirés **après** la génération (f2
    inchangé). **Phase `boss`** (`flight.ts`) : `fly → boss → warp`, chrono figé, barre de boss ; `WarpPortal.z`
    déplaçable et relu par le test de distorsion ; nouvel essai = départ au combat ; score : temps restant au
    début du combat plus une prime ; l'état du combat survit à une restauration du contexte.
23. **`bosses/leviathan.ts`** (`FlightBoss` : `group`, `targets` pour la visée de 3b, `hitTarget`, `hitsShip`) :
    `Creature` à l'échelle du couloir, uniforme « Vide » ; 4 plaques sur le dos puis 3 sur la queue
    (`InstancedMesh`), orbes dans la réserve de 3b, balayage de queue testé par capsules. Créé et attaché caché
    **avant `compile`** (rien à compiler en vol, mesuré par `bench-shaders`) ; ≈ 4 appels de dessin de plus.
24. **Approche** (`environment.ts`) : le léviathan du décor se rapproche, avale le portail au dernier portail et
    disparaît quand le boss paraît (un seul tube par image). Plan ramassé tout seul. Aides : `__xr3d.boss`
    (`info`, `start`, `win`), `preview/flight.html?stage=f1&boss=1`.
25. **Sons** : musiques `boss`, `guardian`, `story` ; effets de boss (apparition, coup, phase, défaite), barrière,
    rebond, secousse, pluie, radio, `lumaBip`, compétence, libération, plan. L'étape qui ajoute un identifiant
    fournit sa recette provisoire (les `Record` l'imposent) ; `audio-lifecycle` reste vert.
26. **Tables par monde** : 2D en 4a (`palette`, `parallax`, `draw/*`, `effects`, `ui/icons`, `preview/art`,
    `check-levels`), 3D en 4c (`environment`, `planets`, `flight`, `preview/flight`). Rendu identique, vérifié par
    un scénario `diag` qui capture les pages `preview/` avant et après.

## Tests

- **Cinématiques** : aide `seedSave(t, patch)` (`lib/core.mjs`, `addInitScript` qui n'écrit que si la sauvegarde
  manque, `--prod` compris). Dès l'étape 14, les scénarios qui passent par JOUER, par une carte ou par la fin de
  j3 démarrent cinématiques vues : `back-button` (smoke), `background-intro`, `audio-lifecycle`, `prod-build`,
  `stress-laps`, `background-3d`, `j1-ctx-asleep`. Seuls `story-flow`, `campaign-flow` et `boss-whale` les jouent.
- **À adapter**, à l'étape qui les casse :
  - 2 : `menu`, `small-screens` (cartes et verrous lus sur la page), `flight-autopilot`, `stress-laps` (carte
    `[data-stage]` sur la bonne page), `j1-play`, `j1-ctx-exit`, `f1-play`, `campaign-flow` (sans `unlocked` ;
    nouveau titre de j1) ;
  - 3 : `j1-play`, `j1-ctx-exit` (balise, état `exit`, ≤ 2,6 s) ; 8 et 10 : `background-3d` (A),
    `j1-ctx-asleep`, `stress-laps`, `campaign-flow` (l'étape qui précède f1 est lue dans `stages`) ;
  - 17 : `flight-autopilot` (`boss.win()` dès la phase `boss`, délai revu), `f1-play` ; fin de 4c :
    `campaign-flow` complet (prologue, libération, hangar, `n/18`), coupé en deux au besoin ;
  - à chaque partie : `small-screens` (en-tête, bulle, barre de boss, Passer en 640 × 320) et les scénarios des
    plans 01 à 03 (`aim-crouch-drop` passe par les portes de j1). `flight-look` garde 16 et 22 portails.
- **Nouveaux** : `progress-ids` (2 ; sans aides DEV, donc aussi `--prod` : sauvegardes v1 et v2 injectées,
  verrous, JOUER → j2, records, récompenses rétroactives) ; `luma-radio` (4 : fenêtres, téléportation, bips,
  bulle sans `pointer-events` ni chevauchement, tutoriel muet après réussite) ; `boss-mini` (5 : arène, phases,
  vie perdue, victoire → balise, textures libérées ; 12 : « Réessayer le combat ») ; `j2-play` (8 : rebond,
  événements, Tess dans l'équipage) ; `boss-whale` (10 : corps insensible, cœur, défaite → résultats ; 16 :
  libération, Passer, double saut dans j1) ; `j3-ctx-boss` (10 : perte en plein combat ; perte sans restauration
  pendant la défaite → étape gagnée) ; `story-flow` (14 : prologue, arrière-plan, retour = Passer, second JOUER
  sans prologue, nœuds audio libérés) ; `f1-boss`, `f1-ctx-boss` (17 et 18 : plaques, portail recraché, plan,
  appels de dessin < 150, nouvel essai, contexte perdu en plein combat).
- **Vérifications** : typecheck, check-levels, build, `npm run e2e -- --suite full` (≈ 6 min de plus).
  **Téléphone**, à la fin de chaque partie : points faibles lisibles, difficulté, gêne des bulles, fluidité des
  cinématiques et des combats, ressenti des champignons.

## Documentation à mettre à jour

À la fin de 4a, 4b et 4c, pour ce que la partie a changé (les agents travaillent depuis CLAUDE.md) :

- `CLAUDE.md` : « Le projet » (6 étapes), architecture et contrats, phase `story` et déroulement d'une étape,
  recettes (étape de campagne, sauvegarde, niveau 2D, parcours de vol, nouveau monde, son ; nouvelles : boss
  2D, message de LUMA, cinématique), pièges (bulle, Passer en `<button>`, remise à zéro dans `init()`,
  `destroyBossArt`), paramètres et aides de test ; retirer « 4 étapes et 16 / 22 portails ».
- `tests/e2e/README.md` : `data-stage`, `data-screen="cutscene"`, `seedSave`, `?at=boss`, aides des boss,
  `progress-ids` en `--prod`. `ARCHITECTURE.md` : couche `story/` et son grep, exception d'import des dessins
  (section 1), arborescence, section 6, points de vigilance résolus. `GDD.md` : un monde en 4 étapes, boss,
  balise en fin de niveau, LUMA, cinématiques, champignons, écran Niveaux. `HISTOIRE.md` : noms retenus,
  lecture du léviathan. `README.md` : paramètres d'URL.
- `SOUHAITS.md` : sections 1, 2 (double saut, plan du vol 1), 3 (naufragés), 4, 5 (branches, lianes,
  passerelles) et 7 ; `plans/README.md` : état de l'étape.

## Ordre de réalisation

**P** ≈ une séance (une demi-journée avec les vérifications), **M** ≈ 2 à 3, **G** ≈ 4 à 6 : ≈ 42 à 62
séances. Chaque étape apporte ses tests ; chaque partie finit par la documentation et un essai sur téléphone.

**4a — fondations** (après 3a ; toujours 4 étapes, j1 au nouveau format) — **faite** (29/10/2026)

1. Tables par monde côté 2D, `core/ids.ts`, scénario de captures (points 1, 26) — **M**.
2. Table des mondes, progression, `story` et `rewards`, écran Niveaux, résultats (points 1 à 3, 5, 6) — **M**.
3. Sorties communes ; la balise remplace tout de suite la Comète de j1 (points 11, 12) — **P**.
4. Radio, et 2 ou 3 messages d'histoire dans le j1 actuel (points 2, 7, 14, 20) — **M**.
5. Cadre des boss : arène de j1, Blob-roi provisoire, barre, `?at=boss`, `__xr2d.boss` (points 7, 13, 15, 16)
   — **M**.
6. j1 au nouveau format : légende, départ, tutoriel, ruine, Blob-roi définitif (points 8, 9, 11, 17) — **M**.

**4b — la Jungle** (après 3a) — **faite** (29/10/2026)

7. Champignons, créature proche et événements, dans une ébauche de j2 (points 14, 15, 19) — **M**.
8. j2 complet, Tess, hangar avec Tess (points 7, 10, 15) — **M**. Conseil de j2 remis (« … et retrouve Tess ! »).
9. Scarabée-titan (point 17) — **M**.
10. j3 réduit à son arène, dans `WORLDS` ; méduse-baleine et défaite en sortie (points 12, 18) — **G**.
11. j3 complet (point 10) — **M**.
12. « Réessayer le combat » : instantané et bouton (points 5, 13) — **M**.

**4c — histoire et vol** (après 3b)

13. Tables par monde côté 3D (point 26) — **P**.
14. Lecteur, phase `story`, `story.seen`, `seedSave` dans les tests (points 6, 20) — **M**.
15. Prologue (point 21) — **M**.
16. Libération et bandeau de compétence (point 21) — **M**.
17. Phase `boss` avec un boss provisoire, nouvel essai en vol, aides DEV (points 22, 24) — **M**.
18. Léviathan, approche et plan (points 23, 24) — **G**.
19. Musiques et sons définitifs (point 25) — **M**.
20. Essai sur téléphone, réglages, documentation — **M**.
