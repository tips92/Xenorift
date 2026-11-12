# Xeno Rift — consignes pour Claude

## Le projet

Démo de jeu mobile (Android via Capacitor 8, iOS plus tard avec le même code) : plateforme 2D « à la Mario »
avec 4 armes à surchauffe (Phaser 3.90), entrecoupée de vols spatiaux 3D à travers des portails, avec tir
(bouton TIR tenu), turbo, une jauge d'énergie commune et des ennemis (Three.js 0.186) ; hangar entre deux étapes
(cristaux-monnaie).
Héros : Kaï ; vaisseau : la Comète ; ordinateur de bord : LUMA (radio en bulle). Campagne tirée de la table des
mondes (`core/worlds.ts`), 6 étapes (18 étoiles) : monde 1, Jungle de Xéna : `j1` « Lisière de Xéna », `j2`
« Canopée des spores », `j3` « Sanctuaire du gardien » (2D) → Nébuleuse d'Azur `f1` (vol, 16 portails) ; monde 2 :
Lune Krator `m1` (2D) → Ceinture d'Orak `f2` (vol, 22 portails) → « Fin de la démo ». Le monde 1 passe au nouveau
format (plan 04) : 4a faite (j1 : arrivée en Comète, tutoriel de LUMA, ruine, Blob-roi, balise ; Niveaux en pages
par monde), 4b faite (j2 : champignons, la méduse-baleine qui agit, Tess, Scarabée-titan ; j3 : la gardienne
méduse-baleine, double saut ; boss en touches ; « Réessayer le combat »), 4c codée (prologue, libération,
léviathan du vol 1 : 4 plaques dorsales puis 3 sur la queue ; essai sur téléphone de 4b et de 4c à faire).
La Lune reste à l'ancien format (étape 5).
Paysage uniquement, tout se joue au tactile (le clavier sert aux tests sur PC). Aucun fichier son :
graphismes dessinés par code (Canvas 2D, géométries et shaders three), sauf les poses de Kaï (PNG
`art/sprites/kai/`, dans l'APK) ; sons et musiques synthétisés (Web Audio).
Docs : `docs/GDD.md` (conception et contraintes techniques), `docs/SOUHAITS.md` (liste vivante + ordre de
travail), `docs/HISTOIRE.md` (trame en 5 mondes), `docs/plans/` (plans techniques des prochaines étapes ;
**`docs/plans/README.md` donne l'état de chaque étape et la prochaine action**), `docs/ARCHITECTURE.md`
(couches, règle de dépendance, documents et suivi des tâches, où ranger le code à venir).

**Langue : tout en français** — réponses, textes de l'interface, commentaires du code (courts), docs, messages
de commit. Identifiants du code en anglais. Suivre le style du fichier modifié (densité des commentaires, idiomes).

## Machine et environnement (Windows 11, iGPU AMD Vega 3)

- **C: est plein : tout s'installe et se met en cache sur D:.** Dans `D:\DevTools` : `jdk-21` (JAVA_HOME),
  `android-sdk` (ANDROID_HOME), `android-user` (ANDROID_USER_HOME, contient le `debug.keystore` qui signe
  l'APK de test), `gradle-home` (GRADLE_USER_HOME), `npm-cache` (imposé par `.npmrc` ; aussi cache global du
  compte via `~/.npmrc`), `ms-playwright` (navigateurs Playwright, jonction depuis `%LOCALAPPDATA%`), `tmp`
  (aussi TEMP/TMP du compte Windows).
- `tools\env.cmd` (cmd) ou `. .\tools\env.ps1` (PowerShell) posent toutes ces variables, TEMP=TMP=`D:\DevTools\tmp`
  et le PATH (java, adb). Sinon, définir au moins TEMP/TMP sur `D:/DevTools/tmp` avant npm/npx/node. Depuis
  PowerShell : `npm.cmd` / `npx.cmd`. Node 24 (déjà installé) exécute les `.ts` directement (`check-levels`).
- `dl.google.com` (SDK Android) a déjà été bloqué par le DNS du réseau de l'utilisateur ; ça marche maintenant.
  Ne jamais tenter de contourner un DNS (autre résolveur, fichier hosts, proxy…) sans le lui demander.
- Les shells de Claude définissent `NoDefaultCurrentDirectoryInExePath=1` : dans un `.cmd`, appeler un exécutable
  du dossier courant par son chemin complet (`call "%CD%\gradlew.bat"`, voir `tools/build-apk.cmd`).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Vite sur http://localhost:5173 (port strict, `--host` : ouvert aussi sur le réseau local). Souvent déjà lancé par l'app de bureau (`.claude/launch.json`) : le réutiliser. |
| `npm run typecheck` | `tsc --noEmit` (ne couvre que `src/`) |
| `npm run check-levels` | valide les niveaux 2D (`-- moon` : un seul, par `LevelData.id` ; `-- --map` : carte annotée). Les avertissements « secret de compétence » (double saut) sont normaux. |
| `npm run build` | typecheck + `vite build` → `dist/` ; `npm run preview` le sert sur le port 4173 |
| `npm run cap:sync` | build + `cap sync android` (copie `dist/` dans `android/`, sans Gradle) |
| `npm run e2e` | tests navigateur, suite smoke par défaut (`npm run e2e -- --suite full` : `npm run build` avant, le scénario `prod-build` teste `dist/`) |
| `npm test` | typecheck + check-levels + suite smoke |
| `tools\setup-android.cmd` | une fois : JDK 21 + SDK Android (platform-tools, android-36, build-tools 36.0.0) sur D:, licences acceptées |
| `tools\build-apk.cmd` | build web → `npx cap sync android` → Gradle `assembleDebug` → `XenoRift-debug.apk` à la racine |
| `tools\install-apk.cmd` | `adb install -r XenoRift-debug.apk` sur le téléphone branché en USB |

- `sdkmanager --licenses` : réponses lues depuis un fichier (`< yes.txt`), jamais par un tube cmd (`echo y | …`
  envoie « y » plus un espace : tout est refusé). sdkmanager sort sans erreur même s'il saute des paquets : vérifier.
- `android/` = projet Capacitor (appId `com.xenorift.game`, minSdk 24, compile/target 36) : `MainActivity.java`
  (écran allumé, encoche utilisée, plein écran immersif réappliqué au retour du focus), manifeste (`sensorLandscape`,
  VIBRATE), `res/values/styles.xml` + `xr_colors.xml` (fond, splash), icône `res/drawable/ic_xr_foreground.xml`.
  `capacitor.config.ts` : `webDir: 'dist'` ; `vite.config.ts` : `base: './'` (obligatoire dans la WebView).

## Architecture

`index.html` empile 3 couches : `#game-root` (canevas du mode en cours), `#touch-root` (commandes tactiles),
`#ui-root` (fond des menus, HUD, écrans, pause, fondu, invite « Tourne ton téléphone »). `src/main.ts` → `startApp()`.

- `src/core` — contrats et données partagées (liste ci-dessous), dont `weapons.ts` : fiches des 4 armes
  (`WEAPONS`, ordre `WEAPON_IDS`), `resolveWeapon` (fiche × améliorations `WeaponMods` × bonus de cadence →
  `WeaponStats`, sans allocation), `isWeaponId` ; `hangar.ts` : catalogue des achats, prix, conditions, effets
  et calculs purs du hangar (`itemState`, `applyPurchase`, `buildPlayLoadout`) ; `shipGuns.ts` :
  canons de la Comète (`SHIP_GUNS` canon léger / mitrailleuse, `SHIP_GUN_MULS` par niveau, `SHIP_AIM` cône et
  guidage, `SHIP_ENERGY` chauffe du turbo par seconde (jauge d'énergie partagée par le tir et le turbo),
  `resolveShipGun(niveau, vitesse de croisière, out)` sans allocation) ; `ids.ts` : listes
  `THEME_IDS`, `COURSE_IDS`, `MUSIC_IDS`, `BOSS_IDS` (`as const`, d'où découlent les unions de `types.ts` ; lues
  par check-levels) ; `worlds.ts` : `WORLDS`, table des mondes (nom, thème, gardien, naufragé, boss du vol, étapes
  `WorldStage` : `id`, `part` 1..3 ou 4 = vol, `levelId`, `rewards`, `boss`, `before` / `after` pour 4c) ;
  `stages.ts` : `STAGES` construit depuis `WORLDS` ; `story.ts` : textes (`STAGE_TEXTS` : titre et conseil par
  étape, `stageSubtitle` « Monde 1 · Niveau 1 », `SKILL_NAMES`), radio de LUMA (`RADIO`, `TUTORIAL_MARK`),
  rythme de la bulle (`BUBBLE_CPS`, `letterGap`, `typingDuration`, `RADIO_TIMING`, `radioHoldS`) et répliques des
  cinématiques. Tous lisibles par Node (chargés par check-levels).
- `src/ui` — la coquille. `App.ts` : phases `menu | intro | playing`, enchaînements `navigate()` (le dernier annule
  les précédents via `flowId` ; `navLock` ignore les clics entre-temps), étapes, pause, bouton retour,
  arrière-plan, orientation, son débloqué au premier geste, paramètres d'URL, `__xrShell`. `overlays.ts` : fondu
  (`FADE_MS` = 250 ms = `--t-screen` de `styles.css`) et invite de rotation. `services.ts` : enveloppes qui
  avalent les erreurs de l'audio et des entrées. `flow.ts` : décisions pures de l'enchaînement (`stageAfter`,
  `departLabel` : « Atterrir » vers un niveau 1, « Redescendre » vers un niveau 2 ou 3, « Décoller » vers un vol ;
  `playSubtitle`) ; la progression (JOUER, verrous) est dans `core/save.ts`. `radio.ts` : radio de LUMA
  (`createRadio` : bulle de `story/bubble.ts` chargée par `import()`, file, bips `lumaBip` (Tess : ×1,2), horloge
  propre en `requestAnimationFrame`, `cutIn` des dialogues `interrupt`, `info()`). `hud.ts` : HUD DOM commun 2D/3D
  (`ShellHud` = `HudApi` + `setPaused` + `radioInfo` ; bulle de la radio en haut à gauche, messages `.toasts`
  décalés dessous, un seul à la fois ; barre de boss `.hud-boss` en bas au centre, repères de phase et un cran
  `.boss-mark.is-step` par touche (`BossHud.steps`) ; en 2D : jauge de chauffe
  avec l'icône de l'arme et une graduation par tir, anneaux des bonus vitesse, cadence et bouclier ; 4 ou 5
  cœurs : classe `has-extra-hearts`, la jauge passe à droite sous 960 px ; en vol, 4 ou 5 boucliers :
  `has-extra-shields`, pastilles resserrées ; jauge « Énergie » `.fl-energy` chauffée par le tir et le turbo (mêmes
  classes internes que la jauge 2D, `createHeatGauge` avec un titre : libellé et repère du turbo `.fl-turbo` au-dessus
  de la barre, `data-gun`, graduation = 1 s de tir continu, `.is-boost` turbo en marche) entre le chrono et la
  pause, cristaux du vol `.fl-crystals` sous le bouclier).
  `screens/` : `title`, `select` (une page `.select-page[data-world]` par monde : barre ◀ nom et étoiles du monde
  ▶, glissement au doigt ou à la souris, ← → ; ouverte sur le monde de l'étape à jouer ; cartes `data-stage` ;
  bouton « Hangar » avec la réserve), `options` (rubriques Général et Commandes
  avec aperçu des commandes ; panneau repris par `pause`), `intro`, `results` (réserve : « +N cristaux » et
  total, gain seulement s'il y en a ; récompenses nouvelles « Plan : mitrailleur », « Compétence : double saut »,
  « Équipière : Tess » ; prime « Boss vaincu +2 000 » (gardien +5 000) sous le score ; 5 lignes et plus :
  `.results-details.is-dense`, resserrée sous 360 px de haut), `hangar` (onglets Établi / Comète / Kaï,
  achat avec confirmation intégrée, équipement de l'arme ; refus et équipement pour la session annoncés par son propre message `.hg-msg`, pas
  par les toasts globaux, qui passent sous la pause ; Tess à bord : « Tess à l’établi » `.hg-crew` et Tess dans
  l'aperçu de l'Établi),
  `outcome` (échec : « Réessayer le combat » `.fail-fight` en premier, seul sur sa rangée, si le mode a rendu un point
  de reprise ; fin ; erreur), `common` (contrat `Screen`, boutons).
  `hangarPreview.ts` (aperçu canvas du hangar : Kaï armé, Tess (`KaiView.tess`) et la Comète dessinés avec
  `game2d/art/draw`, sans Phaser ; chargé par `import()` depuis `screens/hangar.ts`, donc hors du bundle de l'accueil).
  `dom.ts` (utilitaires, `enableSecondFingerTaps`), `background.ts` (fond CSS des menus), `icons.ts`
  (`powerIcon`, `weaponIcon`, `upgradeIcon`, `stageIcon` : `STAGE_ICONS` par identifiant (j2, j3), sinon
  `PLATFORM_ICONS` par thème).
- `src/story` — cinématiques et bulle de LUMA, chargés par `import()` : `bubble.ts` (`createBubble`, bulle DOM
  commune à la radio et aux cinématiques, bips `onBip`), `portraits.ts` (LUMA en 4 humeurs, Tess, Kaï), `player.ts`
  (`playCutscene` sur un `<canvas>` 2D : `pause`, `resume`, `skip`, `destroy`, `done` ; pas encore branché dans le
  jeu : étape 14), `scenes/` (prologue ≈ 44 s, libération ≈ 15 s), `art/` (espace, jungle, méduse-baleine),
  `styles.ts` (CSS injecté), `types.ts` (`CutsceneId`…). Textes dans `core/story.ts`. N'importe du jeu 2D que des
  dessins purs.
- `src/input` — `InputApi`. `keyboard.ts` (par `event.code` : AZERTY = QWERTY), `touch.ts` (pointer events, un doigt
  = un pointerId capturé ; `?touch=` ; en 2D stick rond fixe à 8 directions `.xr-dpad`, en vol joystick flottant ;
  `setOptions` : taille, opacité, mode gaucher ; en vol, gros TIR `.xr-shoot` sous le pouce (taille de SAUT) et
  TURBO `.xr-boost` au-dessus (taille du TIR 2D), TIR prioritaire là où leurs zones de toucher se recouvrent ;
  `fire` = TIR 2D ou TIR du vol), `stick.ts` (lecture pure du stick 2D par secteurs d'angle,
  `STICK_SECTORS` à régler sur téléphone), `tilt.ts` (inclinaison, en vol seulement), `styles.ts` (CSS injecté des
  commandes, variables `--xr-scale` / `--xr-tc-opacity`), `index.ts` (fusion dans un état unique modifié sur place ;
  tout relâché sur `blur` et page cachée ; appui `interact` = front montant de « haut sans ← → », jamais avec Tir).
- `src/audio` — `AudioApi`. `engine.ts` (AudioContext créé au premier geste, bus, compresseur, 24 voix d'effets max,
  suspend/resume, vibrations via `navigator.vibrate`), `sfx.ts` (`RECIPES`), `tracks.ts` (`TRACKS`, morceaux
  procéduraux joués pas à pas ; intensités : `TrackDef.levels`, lues dans `StepCtx.level`), `music.ts`
  (séquenceur ; `musicLevel` appliqué au début de mesure suivant), `world1Sfx.ts` (`WORLD1_SFX_IDS`,
  `WORLD1_RECIPES` : boss, barrière, champignon, secousse, radio, histoire) et `world1Tracks.ts` (`WORLD1_TRACKS` :
  `boss`, `guardian` à 3 intensités, `story` à 2), repris par `RECIPES` et `TRACKS`, `band.ts` (instruments, bus),
  `theory.ts`, `voice.ts`, `buffers.ts` (bruit, réverbération).
- `src/game2d` — `index.ts` : `startPlatformer`. `engine/` : `game.ts` (instance Phaser unique, perte de
  contexte ; `giveUpSession` rend le point de reprise d'un combat), `session.ts` (une session par lancement,
  `endSession` ; accès protégés aux hooks : `sfx`, `music`, `musicLevel`, `radio`, `bossBar`, `toast`…),
  `PlatformScene.ts` (scène réutilisée,
  tout remis à zéro dans `init()` ; états `enter | play | dead | exit | over` ; `__xr2d` ; bonus `speedLeftMs` /
  `rapidLeftMs` cumulables ; cœurs max `maxHearts` lus dans `hooks.loadout` (3 à 5) dans `init()`, rendus à la
  réapparition ; départ au P, ou au K d'avant l'arène (`arenaK`) avec `hooks.startAt` ; seul propriétaire du cadre de
  la caméra : `updateCameraBounds()` ; combat de boss : `startBossFight`, `onBossBeaten`, `resetBossFight`,
  `setMusicLevel`, défaite du gardien `startGuardianExit` / `landKai` ; événements du décor `playLevelEvent`, tronc
  couché `onTrunkDown` ; « Réessayer le combat » : `fightSnap` noté par `noteFight`, `fightRetryPoint()`,
  `restoreFight`, `fightRetry`), `Player`
  (visée devant / diagonale / haut, accroupi 34x46 pieds en place, descente d'étage ↓ + Saut, bras armé =
  sprite à part accroché à l'épaule, `setWeapon`, `speedMul`, `canDoubleJump` lu dans `hooks.loadout` ; rebond sur
  un champignon `mushroomBounce`, montée bornée à `MAX_RISE_V`, chute bornée à la main),
  `enemies` (`hit(e, dégâts)` ; 2 PV, blindé 4 ; renforts de boss `summoned` créés cachés en fin de liste, hors
  score, `summon` / `summonFlyer` / `recall` ; `fence(x0, x1)` : demi-tour devant l'arène ; `crushIn` (tronc) ;
  `snapshot` / `restore`), `items` (`snapshot` / `restore`, `lightCheckpoint` : K allumé sans son ni effet),
  `projectiles` (`ShotPool` :
  40 tirs toutes armes, champ `scene.lasers`, vitesse / portée / dégâts / image copiés de la fiche au tir ; `probe`
  teste le décor, puis le boss (en touches), puis les ennemis ; `SporePool` de 32, `drop(x, y)` pour la pluie),
  `weapons` (`Gun` : fiche
  effective de `core/weapons.ts` avec les améliorations `hooks.loadout.mods` de chaque arme, relues une fois
  par partie ; rafale, plombs en éventail, dispersion, surchauffe, tir dans l'axe de la visée ; `onOverheat`),
  `movers`, `doors` (paires de portes `D`, flèche ▲, passage par l'appui `interact`), `exit.ts` (sorties : contrat
  `LevelExit`, `createExit` : Comète `X` ou balise de LUMA `L`, séquence ≤ `EXIT_MAX_MS` = 2,62 s ; arrivées
  `createArrival` selon `LevelData.start` : Comète qui repart à vide, ou faisceau, ≤ `ARRIVAL_MS` = 0,7 s d'état
  `enter`), `arena.ts` (`Arena` : bornes `|`, barrières posées dans la grille ET le calque, `open | closed | done`,
  glissement du cadre de la caméra `camBlend`), `bosses/` (`types.ts` : contrat `Boss` ; `index.ts` : registre
  `BOSSES` (planches, marcheurs et volants de réserve, musique), `createBoss`, `bossWalkers`, `bossFlyers`,
  `bossMusic`, `generateBossArt` / `destroyBossArt` ; `blobKing.ts` (j1), `beetleTitan.ts` (j2), `whale.ts`
  (méduse-baleine, gardienne de j3)), `levelEvents.ts` (`LevelEvents` : messages radio et événements du décor par
  fenêtres de colonnes ou déclencheurs, une fois par partie ; `snapshot` / `restore`), `glyphs.ts`
  (glyphes `G` qui s'allument à l'approche ou en vague après une porte), `mushrooms.ts` (`Mushrooms` : un sprite
  animé par `o`, `bounce`, `squash` quand le titan s'y assomme), `trunk.ts` (`FallingTrunk` : tronc que la secousse
  abat, couché = cases pleines dans la grille ET le calque ; `restore`), `sporeRain.ts` (`SporeRain` : 8 spores
  annoncées par une tache au sol, devant Kaï), `npc.ts` (`Castaway` : naufragé `N`, états `wait | talk | beam |
  gone`, `holdsDoors`, `rescueDelayMs` calé sur les répliques ; `aboard` : déjà dans l'équipage), `snapshot.ts`
  (`FightSnapshot`, `readFightSnapshot` : état noté pour « Réessayer le combat »),
  `mapBuilder` (carte ASCII → tilemap, mur de fond des salles closes ; `ParsedLevel.exit`, `arena`, `boss`,
  `glyphs`, `mushrooms`, `castaway` ; `walkwayFrame` : dessin de chaque `=`), `hudSync`, `effects` (dont `muzzle`,
  `speedStreak`, `shake(force, ms?)` : seule porte d'entrée des secousses), `tuning.ts` (réglages internes, PV des
  ennemis, score, `SCORE_BOSS` = 2000, `SCORE_GUARDIAN` = 5000, `MUSHROOM_V` / `MUSHROOM_HELD_V`, `MAX_RISE_V`,
  `SPORE_DROP_VY`). `art/` : textures et
  parallaxe dessinées par code pour le thème du niveau, tables `Record<ThemeId, …>` en fin de fichier (`index.ts` :
  `generatePlatformArt`, `generateArenaArt` / `destroyArenaArt`, `generateLevelArt` / `destroyLevelArt` (champignon,
  tronc, tache de spore, Tess et capsule : seulement si le niveau en a), `createParallax` ; `palette.ts`,
  `parallax.ts` (créature du décor par distance, `CREATURES` : `far`, `near`, `looming`, part de gris ;
  `setCreature`, `shadowPass`), `draw/*` dont
  `beacon.ts` (balise et faisceau, même dessin partout), `bosses.ts` (Blob-roi et son onde, Scarabée-titan et ses
  cailloux `titanRock`, méduse-baleine (corps, cœur, tentacules, tache de spore `drawWhaleSpot`, `drawWhaleBody` aussi
  pour le décor) ; planches et boîtes `hurt` / `weak` : `BOSS_SHEETS`, `buildBossSheet`), `world1.ts`
  (champignon, barrière d'arène, tronc, Tess et sa capsule, glyphes, branches / lianes / passerelles des `=` ;
  `WORLD1_SHEETS` ; dessins de la Jungle),
  `player.ts` : corps 64x80 sans arme (PNG `art/sprites/kai/planche.png`, repli dessiné), poses accroupie et
  de reptation, bras armé 64x32 (`planche-bras.png` ; canon dessiné par arme, `GUNS`,
  éclair de recul `FLASH`) ; `items.ts` : `drawBullet` (projectile par arme), icônes de bonus ; `doors.ts` :
  portes, flèche ▲, mur de salle ; `keys.ts` : `ARM_TEX`, `ARM_RIG` (épaule décalée en visée haute et
  diagonale : la visière reste visible), `ARM_MUZZLE` pour le bras armé, `BULLET_TEX` / `BULLET_SIZE` (`tip` =
  point testé contre décor et ennemis) / `BULLET_ADDITIVE` (mode de rendu ; plombs de pompe à contour, en mode
  normal) pour les projectiles ; tileset 8x4 : `TILE_FRAME.WALKWAY` (familles x variantes de `=`) ; `TEX.mushroom`,
  `trunk`, `sporeSpot`, `tess`, `capsule` et leurs `FRAMES`).
  `levels/` : `jungle/j1.ts`, `j2.ts`, `j3.ts` (un dossier par monde au nouveau format), `moon.ts`, `build.ts`
  (`joinSegments`), registre `index.ts`.
- `src/game3d` — `index.ts` : `startFlight` (construction impossible → `onFail` différé). `flight.ts` : `FlightRun`,
  machine à états `intro → fly → warp | dead | timeout → done`, pilotage, portails (+2 s / −5 s), collisions,
  caméra, perte de contexte, `__xr3d` ; boucliers max, module Turbo et niveau du canon lus une fois dans
  `hooks.loadout.ship` ; combat : `simFly` = commandes → turbo (`ShipGun.boost`, énergie) → portails → rochers
  → ennemis (`live`) → visée et tir (`updateGun` : tir seulement quand TIR est tenu ; visée : ennemis d'abord,
  puis rocher du couloir, elle oriente les tirs sans jamais les déclencher ; un tir qui peut toucher réserve ses
  dégâts sur sa cible, `ShotPool.claim` / `pending`, et la visée ignore une cible déjà condamnée), puis, dans
  toutes les phases, projectiles et cristaux. `renderer.ts` :
  renderer partagé.
  `courses.ts` : `COURSES` (générés depuis une graine fixe ; vagues d'ennemis `Course.waves` par `genWaves`, générateur
  à part). `shots.ts` (canon et énergie `ShipGun` : cadence, chauffe par tir et par seconde de turbo (`boost`, appelé en
  premier à chaque sous-pas), surchauffe (ni tir ni turbo) ; visée `AimTarget`, `aimDirection`, `shotMiss` ;
  projectiles `ShotPool`), `pickups.ts` (cristaux du vol `CrystalPickups` : couleurs fixes de l'icône, halo, aimant), `enemies.ts`
  (`EnemyField` : chasseur, mine, essaim, orbes ; IA, `avoid` du pilote automatique ; prévient `FlightRun` par
  `EnemyEvents`). `sky.ts` (nébuleuse cuite en cubemap + PMREM), `glsl.ts` (bruit), `environment.ts` (planètes
  et créature selon le parcours), `creatures`, `planets`, `gates`, `asteroids` (PV `rockHp`, cristal
  `rockDropsCrystal`, `shotTest`, `aim`), `ship` (canons fusionnés selon le niveau, `muzzleWorld`, `fireFlash`),
  `effects`, `util.ts` (`Bin`, `segmentHitsSphere`), `rng.ts` (aléatoire à graine).
- `preview/` — pages d'outil du serveur de dev (hors build et hors typecheck) : `/preview/art.html?theme=jungle|moon&view=world|sheet|weapons`
  (graphismes 2D, thème lu dans `THEME_IDS` ; la planche montre aussi Kaï assemblé avec son bras, les portes, la
  balise et son faisceau, le tileset et ses 25 tuiles ; `weapons` : les 4 bras
  à 2x avec bouche du canon et pivot, Kaï dans 6 visées, stand de tir à la vraie cadence et vitesse, icônes
  de bonus et projectiles, `&bg=0` sans le décor ; loupe `&z=2.5&cx=…&cy=…`),
  `/preview/flight.html?stage=f1|f2&autopilot=1&gun=0..3&shield=0..2&boost=0..2` (vol avec des hooks
  simulés et `defaultPlayLoadout()` ; `gun` / `shield` / `boost` : modules de la Comète ; J / X / F tir tenu,
  Espace / Maj turbo, G gagner, L échouer, 1 / 2 / 3 : chasseur, mine, essaim devant la Comète). Monde 1 :
  `/preview/audio.html` (sons et musiques du monde 1, intensités ; `?analyse=1` : mesures hors temps réel),
  `/preview/story.html?cut=prologue|liberation&t=<s>&hold=1&ui=0&sound=1` (cinématiques, curseur, Passer),
  `/preview/bosses.html?view=blob|beetle|whale|whale-sheet&grey=0..1&boxes=1` (boss à l'échelle du jeu, boîtes),
  `/preview/props.html?view=objects|trunk|walkways|scene` (dessins de `world1.ts`),
  `/preview/kai.html` (modèle `art/kai.glb` dans le cadre 64×80 du sprite, à côté du Kaï PNG du jeu).
  Ailleurs : `scripts/check-levels.ts` (validateur) et `scripts/lib/reach.ts` (grille `LevelGrid` et graphe
  d'accessibilité `ReachGraph` : sauts selon `DESIGN_RULES`, portes, faisceau de balise infranchissable `inBeam` /
  `crossesBeam`, bornes d'arène vides, rebonds de champignon (`LevelGrid.bounce`, `MUSHROOM_RULES` écourtées sous
  un plafond : `bounceAllowed`, `bounceRoom`, `bounceTravel`) ; `ReachGraph(g, beam, skipDoors, bound)` : portes
  retirées et borne haute pour prouver qu'une case est hors d'atteinte ; `touchable`, `hittable`), `tests/e2e/`,
  `tools/` (scripts Android).

### Contrats — à ne pas changer à la légère (toute modification se répercute dans chaque module)

- `src/core/types.ts` : `StageDef` (dont `part` 1..4, `rewards` toujours présent, `boss?`, `before?` / `after?`),
  `StagePart`, `StageReward` (`skill` | `crew` | `blueprint`), `SkillId`, `StageResult` (`crystals` /
  `crystalsTotal` / `enemies` en 2D comme en vol ; `bossBonus?` : prime comprise dans `score`),
  `ModeHooks` (dont `loadout`, `startAt?` : `StartAt` `{ at: 'boss', snapshot? }` (instantané opaque pour
  l'interface), `onFail(reason, retry?: StartAt)` : point de reprise d'un échec en plein combat de boss) /
  `ModeHandle` / `StartMode`,
  `HudApi` (`PlatformHud` : `weapon`, `heat`, `speedLeft`, `rapidLeft`, `shield`… ; `FlightHud` : dont `gunLevel`,
  `heat` / `overheated` (énergie), `boosting`, `crystals` ; `radio(id: RadioId)` ; `updateBoss(s: BossHud | null)` :
  barre de boss commune au 2D et au vol, `BossHud.steps?` = touches du boss), `InputApi` /
  `InputState` / `InputAction` (dont `interact`), `TouchOptions`, `AudioApi` (dont `musicLevel(n)`), `Settings`
  (plus de `manualFire` depuis le 29/10/2026 : ignoré à la lecture), `SaveData` (version 2, recette Sauvegarde ;
  `story` : `StoryProgress`), `Loadout`
  (`equipped` ∈ `owned`, `owned` dans l'ordre de `WEAPON_IDS` et toujours avec `'laser'`, `skills.doubleJump`),
  `PlayLoadout` (`ModeHooks.loadout` = `Loadout` + `mods` de chaque arme + `maxHearts` + `ship` : `ShipLoadout` +
  `crew` : équipage à bord, un naufragé déjà secouru n'attend plus dans son niveau),
  `WeaponUpgrades`, `ShipModules`, et les unions `ThemeId`, `CourseId`, `MusicId`, `BossId` (tirées des listes de
  `core/ids.ts`), `RadioId` (clés de `RADIO`), `SfxId`, `PowerUpKind`
  (`'speed' | 'rapid' | 'shield'`), `WeaponId` (`'laser' | 'machinegun' | 'shotgun' | 'rifle'`), `UpgradeStat`,
  `CrewId` (`'tess' | 'mira'`).
  Les faux `HudApi` / `AudioApi` de `preview/flight.ts` (hors typecheck) et les enveloppes protégées
  (`ui/services.ts`, `engine/session.ts`) se mettent à jour à la main.
- `src/core/ids.ts`, `src/core/worlds.ts` (`WORLDS`) et `src/core/stages.ts` (`STAGES` construit depuis `WORLDS`,
  `getStage`, `nextStage`, `stageWorld`) ; `src/core/story.ts` (`STAGE_TEXTS`, `RADIO`, rythme partagé avec
  check-levels) ; `src/core/save.ts` (format de sauvegarde, progression) ;
  `src/core/weapons.ts` (fiches et calcul des valeurs effectives) ; `src/core/shipGuns.ts` (canons de la Comète) ;
  `src/core/hangar.ts` (catalogue des achats,
  identifiants `HangarItemId` stables, prix, conditions, effets ; fonctions pures, lisible par Node).
- `src/game2d/constants.ts` : tuile 64 px, vue de 720 px de haut, 14 lignes, physique de Kaï (corps debout et
  accroupi, `DROP_THROUGH_MS`), `DESIGN_RULES` (sauts garantis au level design), combat (`AIM_ANGLE`,
  `PROJECTILE_POOL_SIZE`, `STARS_RATIO` partagé avec check-levels ; `MAX_HEARTS` = 3 et `MAX_HEARTS_CAP` = 5
  réexportés de `core/hangar.ts`), bonus (`POWER_DURATION_MS`, `SPEED_BOOST_MUL`, `RAPID_FIRE_MUL` réexporté de
  `core/weapons.ts`).
  Champignons : `MUSHROOM_BOUNCE_TILES` 6,5, `MUSHROOM_BOUNCE_HELD_TILES` 8 (Saut tenu), `MUSHROOM_MAX_TILES` 9 (au
  plus : au-delà, un pas frôle `TILE_BIAS`), `MUSHROOM_RULES` (arcs du graphe depuis un champignon).
  `src/game2d/levels/types.ts` : `LevelData` (`parTimeS` obligatoire ; `ending?`, `radio?`, `boss?`, `start?`,
  `creature?`, `events?` : recette Niveau 2D), listes `LEVEL_STARTS`, `CREATURE_DISTANCES`, `RADIO_TRIGGERS`,
  `LEVEL_EVENT_KINDS`, et `LEGEND` (dont `D` et l'ordre des paires de portes, `L`, `|`, `M`, `G`, `o`, `N`).
  `src/game2d/art/keys.ts` : clés de textures, d'animations et tileset partagées par l'art et le moteur.
  Contrats internes du moteur 2D : `Boss` (`engine/bosses/types.ts`), `LevelExit` / `LevelArrival` (`engine/exit.ts`),
  `FightSnapshot` (`engine/snapshot.ts`).
- Signatures exportées figées : `startApp`, `startPlatformer`, `startFlight`, `generatePlatformArt`, `createParallax`
  (`(scene, theme, opts?)` : `ParallaxOptions.creature`, distance de la créature, `'far'` par défaut).

### Déroulement d'une étape

`App.startStage` (fondu, carte d'intro 2,2 s ou toucher, attente du paysage et du premier plan) → `loadMode`
(import dynamique : Phaser et three ne ralentissent pas l'accueil) → `StartMode(gameRoot, stage, hooks)` →
`ModeHandle`. L'interface appelle `pause()` / `resume()` / `destroy()` ; le mode appelle **au plus une fois**
`onComplete(result)` ou `onFail(reason, retry?)`. `endRun` ignore doublons et étapes périmées, enregistre le résultat
(`recordResult`) et change d'écran dans un `setTimeout(0)` : un mode peut donc l'appeler depuis sa boucle (le 2D
diffère en plus via `endSession`). `destroy()` libère tout : le conteneur doit pouvoir accueillir l'autre mode.
`hooks.settings` est un objet vivant (mis à jour sur place quand un réglage change). `hooks.loadout`, au
contraire, est l'équipement EFFECTIF (`PlayLoadout`), figé pour la partie : `launch()` le calcule avec
`playLoadout(live)` (arme de la session de `core/save.ts` — `?weapon=` ou le hangar en mode test — sinon celle
de la sauvegarde ; multiplicateurs `mods` de chaque arme, `maxHearts`, `ship` ; mode test : 4 armes et double
saut, mais seulement les améliorations achetées) ; les modes ne le modifient pas. `hooks.startAt` fait partir du
combat : `?at=boss` (serveur de dev : en 2D, le K d'avant l'arène ; en vol, le début du combat), ou point de reprise
d'un échec en plein combat (prioritaire). Un mode qui perd en plein combat (plus de vies, boucliers à zéro, ou
« Liaison graphique perdue » arène fermée ou phase `boss`) passe `retry` = `{ at: 'boss', snapshot }` à `onFail` ;
l'écran d'échec (`retryPoint` d'`App.ts`) propose alors « Réessayer le combat »
(`startStage(stage, false, false, retry)`, gardé par l'écran d'erreur de lancement) avant « Réessayer » (toute
l'étape) et « Menu ». Le vol rend le même point (vérifié par `f1-boss`).
Après une réussite, `endRun` appelle `recordResult(stage, result)` (une fois) : record, cristaux ajoutés à la
réserve, récompenses de l'étape (`stage.rewards`), marque `tutorial-j1` à la réussite de j1 ; les résultats
affichent « +N cristaux », la réserve, les récompenses NOUVELLES et la prime du boss. « Suivant » ouvre le hangar
(`makeHangar`) vers `stageAfter(stage)` (`ui/flow.ts`) s'il reste une étape (sinon la fin) ; son bouton de départ
(libellé : `departLabel` de `ui/flow.ts`) lance la carte d'intro de l'étape suivante ; le retour (◀, Android,
Échap, Retour arrière) ferme d'abord la confirmation d'achat, puis ramène aux résultats
(`makeResults(…, settled)` : valeurs finales, réserve relue). Écran Niveaux : bouton « Hangar », sans départ,
retour aux Niveaux sur la même page. JOUER lance `nextToPlay()` (première étape ouverte non réussie, sinon la
dernière ; ligne dessous : `playSubtitle`), sans passer par le hangar.
En 2D, une partie va de `enter` (arrivée, ≤ 0,7 s, commandes coupées ; seulement si `LevelData.start`) à `play`,
puis `exit` (sortie, ≤ 2,62 s ; en j3, défaite du gardien, 2,5 s) et `over` ; `dead` entre une vie perdue et la
réapparition. La radio (`HudApi.radio`)
et la barre de boss sont vidées par `hud.hide()` à la fin de l'étape ; la pause de la coquille fige la radio
(`hud.setPaused`).

### Rendus partagés : un seul contexte WebGL par moteur (coûteux, nombre limité dans les WebView)

- **2D** (`engine/game.ts`) : un seul `Phaser.Game`, réutilisé ; entre deux sessions le canevas est masqué et la
  boucle endormie. Contexte perdu → scène figée et toast ; restauré → reprise ; sinon `onFail('Liaison graphique
  perdue')` après 5 s au premier plan (délai remis à zéro à chaque retour ; pendant la sortie, Comète, balise ou
  défaite du gardien : niveau validé par `finishExitNow` ; en plein combat de boss : point de reprise).
  Contexte toujours perdu au lancement suivant → jeu neuf (`dropGame`), en Canvas si WebGL est refusé (retenté ensuite).
- **3D** (`renderer.ts`) : `acquireRenderer` / `releaseRenderer` (canevas masqué, gardé pour la partie suivante) /
  `discardRenderer` (contexte perdu, ou restauré en cours de partie : jamais réutilisé). `FlightRun` attend 2 s une
  restauration (délai suspendu en pause), accepte 2 restaurations sur place par partie puis abandonne (en pause :
  abandon à la reprise, après ces 2 s) ; une issue déjà décidée (warp, explosion, chrono) est conservée.
- Pendant une perte, les deux canevas sont masqués (`visibility: hidden`, écouteurs DOM posés à leur création) :
  Chrome peint un canevas au contexte perdu en blanc avec une icône d'image cassée. `display` reste réservé à
  l'affichage entre deux parties.

## Recettes

**Sauvegarde** (`core/save.ts`, localStorage `xeno-rift-save-v1` — clé gardée, la version est dans les données —,
`{ version: 2, unlocked, best: { [stageId]: { score, stars } }, settings, loadout: { equipped, owned, skills:
{ doubleJump } }, crystals, upgrades: { [weaponId]: { damage, fireRate, range, cooling } }, ship: { gun, shield,
boost }, extraHearts, crew, blueprints, story: { seen } }`). Les joueurs doivent garder leur progression.
`load()` : version 1
→ `readBase` (`unlocked`, `best`, `settings`, `loadout`, `story` gardés ; le reste par défaut, réserve 0), réécrite en
version 2 au prochain enregistrement ; version 2 → `readV2` (chaque champ relu : niveaux bornés par
`clampLevel`, identifiants inconnus filtrés, nombres abîmés → défaut) ; autre version ou JSON illisible →
`defaults()`. Après lecture, les récompenses de chaque étape réussie sont réappliquées (ensembles : qui avait
fini f1 reçoit le plan du mitrailleur), enregistrées au changement suivant. `story.seen` (`readStory` : chaînes
non vides, sans doublon) : marques des cinématiques vues et des tutoriels finis (`tutorial-j1`) ; absent des
anciennes sauvegardes, sans changer de version.
**Nouveau champ** : type dans `SaveData`, valeur dans `defaults()`, lecture validée dans
`readV2` (absent ou abîmé → défaut : pas de nouvelle version) ; `resetProgress()` le remet à zéro tout seul
(`defaults()`, réglages gardés). **Changement incompatible** (champ renommé, sens changé) : version 3,
migration dans `load()` à partir de `readV2`, et les scénarios e2e qui écrivent une version 2 (`hangar`,
`patchSave` de `small-screens`).
Nouveau réglage : rien à faire dans `load()` (`readSettings` : chaque champ de `DEFAULT_SETTINGS` garde la valeur
enregistrée si elle a le même type ; crans `touchSize` / `touchOpacity` bornés à 0..2). `readLoadout` : laser
seul et pas de double saut si absent, `'laser'` toujours possédé, arme équipée non possédée → laser.
Écritures : `recordResult(stage, result)` (réussite : meilleur score, `unlocked` hérité, cristaux de l'étape
ajoutés à la réserve, seul endroit où ils s'ajoutent ; récompenses par `applyRewards`, renvoyées dans
`RecordInfo.rewards` seulement si elles sont nouvelles ; marque du tutoriel), `purchase(id)`, `equipWeapon(id)`
/ `setEquippedWeapon(id)` (refuse une arme non possédée), `addCrystals(n)` (aide de test). Jamais enregistrés : `setSessionWeapon(id)` (`?weapon=`, mode test)
et `playLoadout(settings, override?)` (`PlayLoadout` : équipement EFFECTIF d'une partie, `mods`, `maxHearts`,
`ship` ; sans `override`, arme de la session). Ne jamais renommer l'`id` d'une étape (clé de `best`).

**Achat du hangar** (`core/hangar.ts`, pur, lisible par Node ; valeurs de départ dans le plan 03) : identifiant
stable dans `HangarItemId` (jamais renommé : interface et tests) + entrée de `buildItems` (onglet, `maxLevel`,
`prices` par niveau, `effects`, `crew` par niveau, `blueprint`, `soon` tant que l'effet n'est pas branché : note
« Effet en vol : bientôt », plus aucun achat depuis 3b) + prix dans `PRICES`. Niveau enregistré : champ de `SaveData` (recette Sauvegarde), lu par `itemLevel`, écrit par
`applyPurchase`. Effet : champ de `PlayLoadout` calculé par `buildPlayLoadout` (et `defaultPlayLoadout`), lu
une fois par le mode au départ dans `hooks.loadout` et borné (repli sur la valeur de base). Écran
(`ui/screens/hangar.ts`) : rangée ajoutée dans `renderTab` (les onglets Comète et Kaï listent leurs achats un
par un), textes `effectLine` / `buyPhrase` (un `switch` sur `kind` : tsc signale un genre oublié), `KIND_ICONS` ;
aperçu `ui/hangarPreview.ts` si l'achat se voit. Le mode test lève les conditions (plan, arme, équipage), jamais
le prix ni le niveau max. Équipage : `SaveData.crew` (récompense `crew` d'une étape), recopié dans
`PlayLoadout.crew` ; `CREW` (`core/hangar.ts`) donne le nom. Les prix et réserves attendus sont recopiés dans le
scénario `hangar`.

**Niveau 2D** : `src/game2d/levels/<monde>/<niveau>.ts` (`jungle/j1.ts`, `j2.ts`, `j3.ts` ; la Lune, ancien format :
`moon.ts`), segments de 14 lignes assemblés par `joinSegments`, légende dans `levels/types.ts`, exactement un `P`
et une sortie (`X` Comète ou `L` balise de LUMA ; aucune avec `ending: 'guardian'`, niveau 3 d'un monde), 8
colonnes plates et sûres au départ, `P` en colonne 8 ou plus (plus à gauche, Kaï apparaît sous le stick tactile
ou le Tir du mode gaucher) ; enregistré dans `levels/index.ts` et placé dans `WORLDS` (recette Étape de campagne).
Ces fichiers, `levels/index.ts`, `build.ts`, `types.ts` et `constants.ts` sont lus par Node :
rien qui dépende du navigateur, de Vite ou de Phaser, imports de valeurs avec l'extension `.ts`, TypeScript
« effaçable » (ni enum ni namespace) ; `constants.ts` charge aussi `core/weapons.ts` et `core/hangar.ts` (mêmes
règles). `npm run check-levels` doit finir sans erreur (accessibilité selon `DESIGN_RULES` ; secrets de compétence : ce que seul
le double saut atteint, en avertissement ; 3 étoiles (`STARS_RATIO.three`, 90 % des cristaux) possibles sans
eux, sinon erreur ; sur la carte `--map`, `&` = bloc frappé seulement avec le double saut). Blocs bonus : `1`
vitesse, `2` bouclier, `3` cadence. Repères selon la partie de l'étape dans `WORLDS` (`PART_LIMITS` de
check-levels : colonnes, cristaux, ennemis, points de contrôle, durée estimée combat compris ; niveaux 1 et 2 :
≈ 190 à 260 colonnes, 2 à 4 K, 2 à 3 min ; niveau 3 : 140 à 200 colonnes, un seul K, juste avant l'arène, 2 à
3,5 min). `parTimeS` (obligatoire, temps de référence du bonus de temps) entre l'estimation et son double (240 pour
j1, j2, j3). Aperçu visuel : `preview/art.html`.
Nouveau format (monde 1) : `start: 'ship'` (j1 : Comète posée sur les colonnes P-4 à P-1 : sol plein dessous, ligne
de P et celle du dessus libres)
ou `'beam'` (faisceau de LUMA : j2, j3) ; `creature` (`far` au niveau 1, `near` au niveau 2, `looming` au niveau 3 :
lu par `createParallax`) ; balise `L` : posée sur le sol, toute la colonne au-dessus en `.` (son faisceau happe Kaï à toute hauteur :
on ne la franchit pas, rien n'est atteint au-delà sauf par une porte) ; `G` (glyphes) sur une case vide d'une salle
close ; `=` : dans la Jungle, branche, liane ou passerelle (`walkwayFrame` : une famille par rangée, tirée d'après
la position). Arène de boss : deux `|` posés sur le sol, de 16 à 22 colonnes bornes comprises, colonne vide
au-dessus, sol continu entre elles, intérieur en `.M*=co` seulement, `M` sur le sol entre elles, `K` dans les 6
colonnes avant, sortie après la seconde borne (aucune avec `ending: 'guardian'`), `LevelData.boss` égal au `boss`
de l'étape dans `WORLDS` (recette Boss 2D). Arènes actuelles : j1 220-239 (20 colonnes), j2 206-221 (16, champignons
207 et 220 contre les bornes : on y entre et on en sort en rebondissant), j3 162-179 (18, champignons 165 et 176,
passerelles en ligne 9 à hauteur du cœur de la gardienne). Messages de LUMA : `LevelData.radio` (recette Message de
LUMA).
**Champignon `o`** (case pleine, posé sur le sol comme un obstacle d'une case) : on ne s'y tient pas, toute arrivée
au-dessus relance Kaï (6,5 tuiles, 8 en tenant Saut ; marcher dessus aussi). check-levels : depuis un champignon,
seulement les arcs de `MUSHROOM_RULES` (montée ≤ 6), écourtés sous un plafond (`bounceAllowed`) ; aucun dans la zone
sûre du départ ; avertissement si une bulle de LUMA est affichée pendant un rebond (messages courts autour des
champignons, rien au déclencheur `boss` si l'arène en a).
**Événements du décor** `LevelData.events` (`LEVEL_EVENT_KINDS`, fenêtres `cols` comme la radio, une fois par
partie) : `shadow` (l'ombre de la créature passe, `parallax.shadowPass()`, son `whaleCry`), `quake` (secousse,
`trunk: [col, ligne]` : souche sur une case vide, sol plein sous les 4 colonnes, fenêtre finie 2 colonnes avant la
souche ; couché, le tronc est plein pour le graphe : souche 1 case et fût 3 x 2), `spores` (`rain: [c0, c1]`
au-dessus d'au moins un sol plein : 8 spores devant Kaï, chacune annoncée 1 s par une tache au sol). j2 : ombre
44-47, secousse 118-120 (tronc 128, 11, qui bouche le tunnel sous le rocher), pluie 160-162 (163-179) ; j3 : pluie
seulement.
**Naufragé `N`** (au plus un, debout sur un sol, capsule sur les 2 cases vides à sa gauche) : seulement si l'étape a
une récompense `crew` ; une porte `D` voisine (à 1 colonne, même ligne) doit être le seul passage vers la sortie
(check-levels le prouve avec la borne haute de `ReachGraph`, double saut compris) ; déclencheur radio `rescue` (sa
réplique puis celle de LUMA, `interrupt`). Dans j2 : salle murée creusée dans le rocher, portes (126, 11) ↔ (134, 7)
et (146, 7) ↔ (148, 11), Tess en (145, 7).
Portes `D` : par paires dans l'ordre (colonne, puis ligne), posées sur un sol, case du dessus vide ; check-levels
vérifie la parité et le sol, et relie les deux portes d'une paire dans le graphe d'accessibilité. Les cases vides
d'une salle close (aucun chemin vers le bord de la carte sans traverser de case pleine) reçoivent un mur de fond
(`TEX.roomWall`, `ParsedLevel.enclosed`, `buildTilemap`). Garder les lignes 0 et 1 libres au-dessus d'une salle
tout en haut : le HUD les couvre quand la caméra est calée en haut. check-levels ne
connaît ni la reptation accroupie ni la descente ↓ + Saut : passages d'une tuile de haut et chemins qui exigent
une descente restent hors du chemin principal.

**Parcours de vol** : ajouter l'identifiant à `COURSE_IDS` et à `MUSIC_IDS` (`core/ids.ts` ; un vol joue la
musique de même nom), une étape `part: 4` dans `WORLDS`,
une entrée `COURSES` dans `game3d/courses.ts` (graine, vitesse, chrono, portails, densité de rochers,
`CourseTheme`, vagues d'ennemis `waves` : `WavePlan` — `count`, `kinds`, `fighterFrom`, `fighterWaves`,
`fighterMax`, `mineMin`/`mineMax`, `swarmMin`/`swarmMax`, `startGate`), puis remplacer les choix binaires codés
en dur : `flight.ts` (`stage.levelId === 'asteroids' ? … : 'nebula'`), `environment.ts` (planètes, créature), `ui/icons.ts` (`stageIcon`), `preview/flight.ts`.
`maxOffset` / `maxJump` / `REACH_FACTOR` gardent les portails atteignables. Les vagues sortent d'un générateur
À PART (`mulberry32(seed ^ WAVE_SEED_XOR)`, `genWaves` appelé après `genRocks`) : ne jamais consommer celui des
portails et des rochers (identiques au bit près : tests, records). `genWaves` garde les ennemis hors des portails
et de leur ligne d'approche (`GATE_APPROACH`, croisement de l'orbe d'un chasseur compris), dans le couloir, loin
des rochers ; le pilote automatique (`EnemyField.avoid`) doit finir le parcours avec au moins 1 bouclier.
Le scénario `flight-combat` recopie les vagues obtenues (`WAVES`, `CRYSTALS_TOTAL`), les fenêtres de `genWaves`
(`GATE_ZONE`, `WAVE_WINDOW`) et un hachage des portails, rochers, trajectoire et distorsion relevé dans Chrome
(`COURSE_FP`) : un parcours modifié volontairement s'y met à jour (ses variantes d'essaim `VARIANT` / `SWARM_AT`,
mesurées, aussi si le pilote automatique, la visée ou l'essaim changent).

**Étape de campagne** : une entrée `WorldStage` dans `WORLDS` (`core/worlds.ts`), à sa place dans son monde (`id`
stable, `part` : 1 à 3 = niveau 2D, 4 = vol ; `levelId` = niveau 2D ou `CourseId` ; `boss` ; `rewards` :
compétence, équipier ou plan) + titre et conseil dans `STAGE_TEXTS` (`core/story.ts` ; aussi `LevelData.name`
via `stageText(id).title`). `STAGES` (`core/stages.ts`) s'en déduit : `index` séquentiel, `world` = rang du monde
+ 1, `kind` d'après `part`, `theme` du monde, sous-titre `stageSubtitle` (« Monde 1 · Niveau 1 », « Monde 1 ·
Vol »). Progression par identifiants (`core/save.ts`) : réussie = `id` dans `best` (`isCleared`) ; ouverte
(`isUnlocked(stage)`) = la première, une réussie ou la suivante d'une réussie (mode test : toutes) ; JOUER =
`nextToPlay()`. Une étape peut donc s'insérer au milieu sans migration (elle s'ouvre si la précédente est
réussie) ; `unlocked` (index hérité de la v0.1) est encore écrit, plus rien ne le lit. Récompenses : données à
la réussite et réappliquées au chargement (recette Sauvegarde) ; texte des résultats dans `ui/screens/results.ts`
(`CREW_LABELS`, `SKILL_ICONS`). Icône de carte : `STAGE_ICONS` (`ui/icons.ts`, par identifiant) ou celle du thème.
Écran Niveaux : une page par monde, cartes de même largeur qu'à 4 colonnes (`--cols` sur `.cards` ; 2 colonnes sous
560 px) ; l'écran de fin et l'en-tête des Niveaux comptent `STAGES.length × 3` étoiles. Les scénarios lisent les
étapes (cartes des Niveaux, `__xrShell.info().stages`, `stageBefore`) ; restent écrits en dur : l'ordre `j1 j2 j3
f1` et les trois titres du monde 1 (`menu`), le parcours de `campaign-flow` et de `hangar` (j3 entre j2 et f1), et
16 / 22 portails (`flight-look`, `flight-autopilot`) ; `theme-captures` suit `STAGES` (reprendre une référence
avant).

**Réglage** : champ de `Settings` (`core/types.ts`) + défaut dans `DEFAULT_SETTINGS` (`core/save.ts`) +
interrupteur dans `TOGGLES` (champ `group` : rubrique `'general'` ou `'controls'`) ou sélecteur à 3 crans dans
`CHOICES` (`ui/screens/options.ts`, aussi affiché dans Pause, zone défilante `.pause-opt-body`) + effet immédiat
dans `setSettings()` et application au démarrage dans `App.ts` ; les modes lisent `hooks.settings`. Les réglages
des commandes tactiles passent par `input.setTouchOptions` (`TouchOptions` ; crans `TOUCH_SIZE_STEPS` /
`TOUCH_OPACITY_STEPS` de
`input/touch.ts`, repris par l'aperçu du panneau) ; `load()` ne valide pas les valeurs : `touchStep` les borne.

**Son / musique** : effet = `SfxId` + recette dans `RECIPES` (`audio/sfx.ts` ; monde 1 : `WORLD1_SFX_IDS` et
`WORLD1_RECIPES` de `audio/world1Sfx.ts`, repris par `...WORLD1_RECIPES`) + son nom dans la liste `SFX`
d'`audio-lifecycle` ; musique = identifiant dans `MUSIC_IDS` (`core/ids.ts`, aussi lu par check-levels) +
morceau dans `TRACKS` (`audio/tracks.ts` ; monde 1 : `WORLD1_TRACKS`). Les
`Record<…>` font échouer tsc s'il en manque un. Rien ne doit rester branché après une note (le scénario
`audio-lifecycle` compte les nœuds). `music(id)` ne relance pas le morceau déjà en cours. Intensités : `levels`
dans le `TrackDef`, `play()` lit `c.level` ; `AudioApi.musicLevel(n)` s'applique au début de mesure suivant, sans
effet sur un morceau à un seul niveau, remis à 0 quand `music()` change de morceau (en 2D : `musicLevel(session,
n)` de `engine/session.ts`). Écoute et mesures : `preview/audio.html` (scénario `audio-world1`). Monde 1 : musiques
`boss` (mini-boss), `guardian` (méduse-baleine : intensité 0, 1, 2 posée au début de chaque phase ; la scène
remet `musicLevel(0)` à chaque entrée dans l'arène), `story` (cinématiques, 4c) ; effets du boss (`bossAppear`,
`bossHit`, `bossArmor`, `bossPhase`, `bossDefeat`), `barrier`, `quake`, `beacon`, `radioOpen`, `lumaBip`,
`mushroomBounce`, `sporeDrop`, `rescue`, `whaleCry`, `skill`, `liberation`, `blueprint` (aux résultats, avec le
plan), `leviathanRoar` et `portalSwallow` (approche du léviathan) ; les repères des cinématiques réutilisent des
effets déjà là (`cutscene.ts`, `CUE_SFX`) pour rester dans les 18 effets mesurés par `audio-world1`. Le
Scarabée-titan reprend des sons existants (`stomp`, `boost`, `crash`, `bump` graves). Chaque arme a son son
de tir (`WeaponDef.sfx` : `'laser'`, `'machinegun'`, `'shotgun'`, `'rifle'`), joué une fois par salve (un coup de
pompe = 1 son, une rafale de fusil = 3) : sa durée doit tenir dans la cadence (mitrailleur ≤ 70 ms, fusil
≤ 100 ms, pompe ≈ 370 ms réarmement compris). Les impacts de toutes les armes jouent `'laserHit'` (au plus un
par tranche de 45 ms, `IMPACT_SFX_GAP_MS`). En vol : `SHIP_GUNS[…].sfx` (`'shipGun'` ≤ 110 ms, `'shipMachinegun'`
≤ 50 ms, joué ~10 fois par seconde), `'enemyOrb'`, `'enemyHit'` (aussi rocher entamé, plus faible), `'enemyBlast'`
(aussi rocher détruit par un tir, plus grave), cristal ramassé : `'crystal'`.

**Arme** : `WeaponId` (`core/types.ts`) + fiche dans `WEAPONS` et place dans `WEAPON_IDS` (`core/weapons.ts`)
+ son (`SfxId` et recette) + `ARM_TEX`, `BULLET_TEX`, `BULLET_SIZE`, `BULLET_ADDITIVE`, `ARM_MUZZLE`
(`art/keys.ts`, leurs `satisfies Record<WeaponId, …>` font échouer tsc s'il en manque une) + dessins `GUNS` /
`FLASH` (`art/draw/player.ts`, le canon dessiné tombe exactement sur `ARM_MUZZLE`) et `drawBullet`
(`art/draw/items.ts` : suite de `if`, une arme oubliée y prend sans erreur le trait du laser) + `WEAPON_ICONS`
(`ui/icons.ts`) + `SHORT` de `preview/art.ts` (hors typecheck) + une ligne de `SPECS` (valeurs attendues) dans
`tests/e2e/scenarios/weapons.mjs`. Le moteur lit tout depuis la fiche (`Gun`, `ShotPool`) : rien d'autre à
brancher. `coolDelayMs` doit rester plus long que le temps entre deux projectiles (sinon le tir maintenu
refroidit). Plombs (`pellets` > 1) : vitesse de chacun à ± `PELLET_SPEED_JITTER` (8 %) près. Valeurs
vérifiées à l'écran par `preview/art.html?view=weapons`. Régler une arme : sa fiche, le tableau du GDD et
`SPECS`. Améliorations du hangar (étape 3a) : `WeaponMods`, calculées par `weaponMods` (`core/hangar.ts`,
`UPGRADE_MULS`) et appliquées par `Gun.resolve` avec `hooks.loadout.mods[arme]`, pour chaque arme (repli sur
`DEFAULT_WEAPON_MODS` si absent ou invalide). Au hangar, ses entrées (achat, 4 améliorations) naissent de
`WEAPON_IDS` : il faut son prix `PRICES.weapon` et sa description `WEAPON_DESC` (`core/hangar.ts`, tsc signale
un oubli), et `FEMININE` (`ui/screens/hangar.ts`) si son nom est féminin (« Équipée », « la Pompe »).

**Boss 2D** : identifiant dans `BOSS_IDS` (`core/ids.ts`) + entrée de `BOSSES` (`engine/bosses/index.ts` :
planches `BOSS_ART`, marcheurs et volants de réserve, musique `boss` ou `guardian`, `create`) + classe qui implémente
`Boss` (`engine/bosses/types.ts` ; modèles : `blobKing.ts` et `beetleTitan.ts` au sol, `whale.ts` volant et gardien) :
`start` (barrières fermées), `update(dt, dtMs)` sans allocation et sur l'horloge de la scène seulement (pause,
perte de contexte, arrêt), `reset` (vie perdue dans l'arène : remis à neuf), `destroy`, `info?`, `hurts(p)` (abscisse
de la source ou NaN), `stomp?`, `defeatMs?` (gardien). **En touches** (décision 20 du plan 04) : `life` / `maxLife`
= touches (mini-boss 4, phase 2 après 2 ; gardien 6, 2 par phase) ; `hitBy(x, y)` : -1 raté, 0 blindé ou point
faible fermé (tir arrêté), 1 point faible ouvert atteint, quelle que soit l'arme ; `takeDamage(n)` : n touches,
referme le point faible jusqu'à la fenêtre suivante ; les plombs de la salve qui vient de toucher rendent 1 sans
seconde touche pendant `TOUCH_GRACE_MS` (120 ms). `x` / `y` : pieds d'un boss au sol, centre du corps d'un boss
volant. Un mini-boss appelle `scene.onBossBeaten()` une fois vaincu, puis s'enfuit (`gone`). Renforts :
`scene.enemies.summon` / `summonFlyer` (hors score), jamais dans une case pleine (un champignon de l'arène). Le
Scarabée-titan s'arrête à la première case pleine de sa ligne (`stopLeft` / `stopRight` : les champignons contre
les bornes, `Mushrooms.squash`). Dessins dans `art/draw/bosses.ts` (`BOSS_SHEETS` : planches et boîtes `hurt` /
`weak` par image). Durée estimée du combat : `BOSS_FIGHT_S` de check-levels (`Record<BossId>` : 25, 30, 60 s).
Dans le niveau : `LevelData.boss`, arène `|` … `M` … `|` (recette Niveau 2D) et `boss` de l'étape dans `WORLDS`.
La scène fait le reste : barrières, caméra calée, musique du registre puis `musicLevel(0)`, déclencheur radio
`boss`, barre (`HudApi.updateBoss`, `steps` = `maxLife`, envoyée quand la vie en % ou la phase change), prime
`SCORE_BOSS` (`result.bossBonus`), réserve créée cachée au chargement, arène rouverte et boss remis à neuf à la
réapparition, `destroyBossArt` à l'arrêt de la scène ; `scene.setMusicLevel(n)` pour l'intensité.
**Gardien** (niveau 3, `LevelData.ending: 'guardian'`, sans sortie) : caché en attente, il arrive à la fermeture des
barrières et la créature du décor se cache (`parallax.setCreature(false)`, revenue à la remise à neuf) ;
`onBossBeaten()` → `startGuardianExit` : état `exit` `min(defeatMs, EXIT_MAX_MS)`, renforts éclatés, Kaï finit son
saut puis se fige (`landKai`), `finishLevel` ; prime `SCORE_GUARDIAN` (5 000) ; arène jamais rouverte.
**Réessayer le combat** : la scène note `fightSnap` (`FightSnapshot`, `engine/snapshot.ts`) quand le K d'avant
l'arène s'allume, ou à l'entrée dans l'arène s'il a été contourné ; `fightRetryPoint()` (arène fermée et état noté)
est rendu par `killPlayer` à la dernière vie et par `giveUpSession` ; au nouvel essai, `build()` lit l'instantané
(`readFightSnapshot`, autre niveau → départ au K seul) et `restoreFight` remet temps, cristaux, bonus, ennemis morts
(`EnemyManager.restore`), objets (`Items.restore`, K allumé par `lightCheckpoint`, sans message), événements et
messages joués (`LevelEvents.restore`), naufragé (`Castaway.restore`) et troncs (`FallingTrunk.restore`) ; 3 vies,
boss à neuf, pas de prime de vies (`fightRetry`). Un nouvel état à garder : son champ dans `FightSnapshot`, un
`snapshot()` / `restore()` dans le module, `readFightSnapshot`. Tests : `boss-mini` (Blob-roi, touches recopiées :
`BOSS_LIFE`), `boss-titan`, `boss-whale`, `j3-ctx-boss`, `boss-bot` (diag, durée des combats des mini-boss par une
IA : à relancer après un réglage), `?at=boss`, `__xr2d.boss`.

**Message de LUMA** : entrée de `RADIO` (`core/story.ts` : `speaker`, `mood`, `text` de 110 caractères au plus
avec espace insécable `NB` avant `: ; ! ?`, qui nomme les commandes tactiles (stick, SAUT, TIR) ; `keys` : texte
du clavier, choisi par `ui/radio.ts` quand les commandes tactiles sont absentes ; `tutorial` : muet une fois
`tutorial-j1` dans `story.seen` ; `urgent` : passe devant les messages en attente, pas devant un dialogue
commencé ; `interrupt` : dialogue calé sur une action de Kaï (sauvetage), remplace aussitôt le message de la bulle,
sans trou, et fait oublier les autres ; `castaway` : muet une fois ce naufragé dans l'équipage ; `scrambled` : radio
brouillée ; `speaker` : `'luma'` ou `'tess'`) + dans le niveau `LevelData.radio` : `{ id, cols: [c0, c1] }` (quand le centre de Kaï entre dans ces
colonnes ; sautée s'il les dépasse sans y entrer : porte, téléportation) ou `{ id, on }` (`RADIO_TRIGGERS` :
`overheat`, `boss`, `checkpoint` = premier K allumé, `door` = première porte, `rescue` = Kaï parle au naufragé ; un
nouveau déclencheur : la liste + un appel `levelEvents.trigger(kind)` dans le moteur). Le mode appelle
`HudApi.radio(id)` (en 2D : `radio(session, id)`) ; `ui/radio.ts` garde 2 messages en attente au plus (le plus
ancien chassé) et ignore un doublon. check-levels simule la file au rythme de l'estimation de durée (2,5 colonnes/s,
`RADIO_TIMING`) : erreur si un message est chassé, avertissement si un tutoriel s'ouvre plus de 3 s après le
passage de Kaï ou si une bulle est affichée pendant un rebond sur un champignon, note à pleine course. j2 n'a pas de
`tutorial` (j1 réussi les ferait taire) ; j3 : 5 messages `scrambled`. Tests : `luma-radio` (tutoriel de j1 dans
l'ordre du niveau, puis la radio brouillée de j3 : à adapter si les fenêtres bougent), `j2-play` (bulle fermée
avant le premier champignon, dialogue de Tess).

**Nouveau monde (thème)** : identifiant dans `THEME_IDS` (`core/ids.ts` : `ThemeId`, check-levels et
`preview/art.ts` le lisent), puis tsc donne la liste des tables `Record<ThemeId, …>` à remplir côté 2D : `PALETTES`
(`art/palette.ts`), `THEME_COLORS` (`engine/effects.ts`), `TILE_STYLES` (`art/draw/tiles.ts`), `BG_STYLES`
(`backgrounds.ts`), `PARALLAX_STYLES` (`art/parallax.ts`, en tête), `ENEMIES` (`enemies.ts`), `MOVERS`
(`items.ts`), `DOOR_STYLES` (`doors.ts`), `PLATFORM_ICONS` (`ui/icons.ts`). Plus aucun `theme === 'jungle' | 'moon'`
dans `src/game2d`, `src/ui`, `preview/art.ts` ni `scripts/`, sauf `art/draw/world1.ts` (dessins de la Jungle) ;
restent hors tables : CSS `.card--<thème>` / `.intro--<thème>` (un thème inconnu prend les couleurs de la
jungle), et côté vol les choix `'nebula'` / `'asteroids'` (recette Parcours de vol ; tables en 4c). Ensuite : une
entrée de `WORLDS` (gardien, naufragé, boss du vol, étapes), une musique, les dessins du monde (sur le modèle de
`world1.ts` et `bosses.ts` ; les objets de `generateLevelArt` sont ceux de `world1.ts`, et la créature du décor
de `parallax.ts` (`whale` de `PARALLAX_STYLES`, distances `CREATURES`) est la méduse-baleine). Vérifier que le
rendu des thèmes existants n'a pas bougé : `theme-captures` avec
`XR_CAPTURES_REF` (`tests/e2e/README.md`). Direction artistique dans le GDD (néon extraterrestre, créature
géante au loin, 4 ennemis par monde).

## Tests

- Toujours : `npm run typecheck` et `npm run check-levels`. Après un changement du jeu : `npm test` (smoke).
  Après un changement du cycle de vie, du rendu, du son ou des commandes : `npm run build` puis
  `npm run e2e -- --suite full` (`prod-build`, dans `full`, teste `dist/` : sans build, il échoue ou teste
  l'ancien code).
- Tests navigateur : `tests/e2e/` — **lire `tests/e2e/README.md` avant d'écrire un scénario.**
  `node tests/e2e/run.mjs [noms…] [--suite smoke|full|diag|all] [--prod] [--repeat N] [--list]`. Vrai Chrome
  sans fenêtre (ANGLE/D3D11) via playwright-core 1.55 ; navigateur neuf et sauvegarde vide par scénario ;
  contexte tactile (`hasTouch`) : commandes tactiles visibles sauf `?touch=0`, invite de rotation si la vue est
  en portrait. Captures dans `tests/e2e/out/<scénario>/` (ignoré par git). Le lanceur réutilise le serveur du
  port 5173 (ou un `vite preview` sur 4173) sans l'arrêter, ou démarre puis arrête le sien. `--prod` : tout sur
  `dist/` servi sur 4173 (`npm run build` d'abord) ; les scénarios `meta.dev` y sont ignorés (SKIP). Ne modifier
  aucun fichier source pendant un passage : Vite recharge la page, la partie repart (sans mode dieu) et le
  scénario échoue pour rien.
- **Un seul navigateur à la fois** (l'iGPU perd le contexte WebGL sous charge concurrente) : passer toujours par
  le lanceur, qui pose le verrou `D:/DevTools/tmp/xeno-rift-e2e.lock` (commun à tous les worktrees ; un second
  lanceur attend). Depuis un autre worktree, prendre d'autres ports (`XR_DEV_PORT=5174`, `XR_PROD_PORT=4174`) :
  sinon le lanceur réutilise le serveur 5173 de la copie principale et teste son code. Le panneau navigateur intégré de
  l'app est inutilisable pour jouer : page cachée (`document.hidden`), `requestAnimationFrame` gelé, et le jeu se
  met en pause comme en arrière-plan.
- Aides DEV (serveur de dev seulement, `import.meta.env.DEV`) : `window.__xr2d` (`scene`, `teleport(col, row)`,
  `god(on)`, `win()` (Kaï posé devant la sortie, état `exit` aussitôt ; un combat de boss est passé, arène ouverte
  pour de bon, sans prime ; en j3, sans sortie : Kaï posé dans l'arène, combat lancé, gardienne vaincue, prime
  comprise, état `exit` 2,5 s), `kill()`, `boss` (`info()` : boss et `arena` ; `enter()` : Kaï posé sur la
  première case libre après la première borne (champignon sauté) ; `hit(n = 1)` : touches directes, renvoie les
  touches restantes ; `win()` : vaincu comme par les tirs, prime comprise), `weapon(id?)` (change l'arme en pleine
  partie : bras, `Gun`, HUD, jauge remise à zéro ; renvoie l'arme tenue), `power('speed'|'rapid'|'shield')` (comme un bonus ramassé), `info()` (copie :
  `weapon`, `heat`, `overheated`, `mods` (améliorations de l'arme tenue), `stats` effectives, `hearts`,
  `maxHearts`, `speedLeftMs`, `rapidLeftMs`, `shield`, `speedMul`, `canDoubleJump`, `shots[]` en vol avec
  `weapon`, `x`, `y`, `vx`, `vy`, `dist`, `range`, `damage`) ;
  `scene.player` : `aim`, `crouching`, `dropThrough`, `fireAngle`, `gunX` / `gunY`, `weapon` ; `scene.gun`
  (`heat`, `overheated`, `stats`, `weapon`) ; `scene.lasers.bolts` (`ShotPool`, toutes armes) ;
  `scene.speedLeftMs` / `rapidLeftMs` ; `scene.enemies.list[i].hp` ; `scene.doors.nearIndex`,
  `scene.parsed.doors` ; `scene.exit`, `arrival`, `glyphs`, `levelEvents.windows` / `events`, `arena`, `boss`,
  `bossBeaten`, `mushrooms`, `trunks`, `sporeRain`, `spores`, `shadowPasses`, `npc`, `fightSnap`, `fightRetry` ;
  détail dans `tests/e2e/README.md`), `window.__xr3d` (`info()` → `phase`, `gates`, `nextGate`…, `shield`, `maxShields`,
  `boosting`, `boostHeat` / `coolRate` (énergie par seconde, module Turbo compris) ; combat : `gunLevel`, `heat` /
  `overheated` (énergie partagée par le tir et le turbo), `range`, `shotsActive`, `shotsFired` / `lastMuzzle` (tirs partis, bouche du dernier),
  `target` ({ `type` : `'rock'` ou type d'ennemi, `dist`, `hit` :
  le tir guidé peut toucher } ou null), `enemies` ({ `fighter`, `mine`, `swarm` vivants, `killed` abattus par les
  tirs }), `orbsActive`, `waves`, `crystals` / `crystalsTotal` / `crystalsActive`, `rocksDestroyed`, `points`,
  `crystalsDropped` (lâchés), `drawCalls`, `geometries` / `textures` / `programs`), `autopilot(on)` (tient TIR
  quand la cible visée peut être touchée, turbo loin des portails sur une énergie froide), `spawn(type, distance =
  60, variant)` (ennemi devant la Comète, essaim = formation entière ;
  renvoie le nombre placé ; chasseur tenu à max(30, distance), tire après 42 u ; `variant` 0..1 fixe orientation,
  ondulation, virage : tests reproductibles),
  `fire(on = true)` (TIR tenu), `settle()` (Comète remise sur la trajectoire, sans vitesse latérale, énergie froide,
  turbo coupé, orbes ennemies retirées : un essai part du même état quel qu'ait été le vol en temps réel avant, plus
  lent à froid ; le poser aussi à un avancement fixé, trace comprise, dans la même tâche),
  `win()`, `fail()`, `advance(s)`, `timeScale(s)` (0 à 8 ; 0 : jeu figé pour une capture), `bench(n)` ; disparaît avec la
  partie : tester sa présence),
  `window.__xrShell` (`info()` : dont `loadout` = { `equipped`, `owned`, `skills` } de la partie en cours,
  sinon du prochain lancement, `play` = `PlayLoadout` complet (`mods`, `maxHearts`, `ship`, `crew`), `crystals` =
  réserve, `weapon` = arme de la session (`getSessionWeapon()`) ou null, `screen` = nom de l'écran affiché,
  `stages` = { `id`, `kind`, `world`, `cleared`, `unlocked` } par étape de `STAGES` ;
  `addCrystals(n)` (réserve enregistrée ; l'écran affiché n'est pas redessiné : ajouter avant d'ouvrir le
  hangar) ; `radio()` (radio de LUMA : `phase`, `current`, `text`, `waiting`, `played`, `paused`) ;
  `cap('pause'|'resume'|'backButton')`, `audio`). Paramètres d'URL, actifs aussi en production : `?stage=j1|j2|j3|f1|m1|f2` (lancement direct, sans intro),
  `?unlock=1` (enregistré), `?touch=1|0`, `?weapon=laser|machinegun|shotgun|rifle` (arme de la session, même
  hors mode test et non possédée ; jamais enregistrée ; valeur inconnue ignorée, toast « Arme inconnue » sur
  l'accueil, ou en début de partie avec `?stage=`). Serveur de dev seulement : `?at=boss` (chaque niveau 2D lancé
  part du point de contrôle d'avant son arène, sans arrivée ; ignoré sans arène). `?kai=glb` : le corps de Kaï
  est le rendu de profil de `art/kai.glb` (export de `art/kai.blend`, `art/outils/export-kai.py`) à la place du
  PNG ; une seule pose tant que le fichier n'a pas de squelette, le bras armé reste le sprite du jeu. Le
  `.glb` n'est pas dans l'APK (les PNG de Kaï, eux, y sont).
- Clavier : flèches / WASD (ZQSD en AZERTY) ; Espace = saut en 2D et turbo en vol ; K = saut ; Haut/W = haut
  (visée, portes, monter en vol), ne fait PAS sauter ; Bas/S = accroupi (puis ← → : reptation ; + saut :
  descente d'étage) ; J/X/F = tir (en vol : tant que la touche est tenue) ; Maj = turbo ; Échap/P =
  pause et reprise ; Entrée/Espace passent l'intro ;
  hors partie, Échap et Retour arrière = retour (comme le bouton retour Android, sans quitter l'appli ; au
  hangar, ferme d'abord la confirmation d'achat).
- Simulations dans `tests/e2e/lib/` : multi-touch CDP à identifiants explicites (`touch.mjs`), arrière-plan,
  événements Capacitor, bouton retour et compteurs audio (`shell.mjs`), perte/restauration de contexte WebGL
  (`gl.mjs`), aides par domaine (`core.mjs` : dont `stageBefore` ; `game2d.mjs` : `kai2d`, `bolts2d`, `kaiShot`,
  `loseFight`, `progress2d`, `snapFields` / `snapOf`… ; `game3d.mjs`) ; `screenButton` (`helpers.mjs`, utilisé par
  `press` et `pressScreen`) prend d'abord le bouton au libellé exact : « Réessayer » ne clique pas « Réessayer le
  combat ».
- Contrôles 2D : `touch-controls` (smoke : stick 8 directions, doigts multiples), `aim-crouch-drop` (visée,
  accroupi, reptation, plafond bas, descente, portes, au clavier et au stick), `touch-options` (rubrique
  Commandes, anciennes sauvegardes, gaucher en 2D et en vol), `small-screens` (place des commandes selon les
  réglages ; HUD à 5 cœurs et 5 boucliers, ligne Réserve des résultats, hangar de 844x390 à 568x320) ;
  `art-preview` (diag) capture `preview/art.html`. Toute retouche des commandes, de Kaï ou des
  portes doit les garder verts.
- Armes et bonus (étape 2) : `weapons` (arme de la session équipée au hangar en mode test, puis par arme :
  projectiles par appui, portée, visée, surchauffe, dégâts sur un marcheur et un blindé) et `powerups` (double saut selon le
  mode test, vitesse, cadence, les deux, durée, bouclier, vie perdue, blocs bonus) ; aides `gun2d`,
  `recordShots` / `shotLog`, `moveEnemy`, `hudGun`, `freeze2d` (`game2d.mjs`). `lasers2d` (`helpers.mjs`) ne
  compte que la texture `'laser'` : pour les autres armes, `recordShots` / `shotLog` ou `__xr2d.info().shots`.
  Toute retouche des armes, des bonus ou du HUD doit les garder verts (et `small-screens` : HUD à 3 anneaux).
- Hangar (étape 3a) : `hangar` (sauvegarde : version inconnue, v2 abîmée, migration d'une v1 ; cristaux gagnés,
  achats avec confirmation et refus, achat d'une arme, conditions remplies par la sauvegarde, équipement, retours,
  effets en jeu : dégâts, cadence, refroidissement, portée, cœurs, boucliers, turbo ; réinitialisation ; valeurs
  recopiées listées dans `tests/e2e/README.md`, « Scénario du hangar »). Entre deux
  étapes, « Suivant » ouvre le hangar : `nextViaHangar` (`core.mjs`) clique « Suivant » puis le bouton de départ
  (`.hg-depart` : « Atterrir », « Redescendre » ou « Décoller »). Un bouton `aria-disabled` (prix verrouillé) ne se clique avec Playwright qu'avec `force: true`.
- Combat en vol (étape 3b, TIR et énergie du 29/10/2026) : `flight-combat` (parcours inchangés, tirs du pilote
  automatique, aucun tir sans appui, cadence et surchauffe de chaque canon, énergie partagée par le tir et le turbo,
  rochers, cristaux, chasseur, mine, essaim, orbes, score, appels de dessin ; mesures par sous-pas
  `__xr3d.advance(1 / 60)` dans la même tâche, ennemis posés par `spawn` à variante fixée) ; aussi
  `flight-autopilot` (au moins 1 bouclier, < 150 appels de dessin), `small-screens` (HUD du vol, jauge d'énergie,
  TIR et TURBO), `touch-options` (gaucher) et `touch-controls` (joystick + TURBO + TIR), `f1-play` (turbo et
  tir au clavier), `background-3d` (commandes relâchées en arrière-plan), `hangar` (module Turbo), `f1-ctx-loss`
  (combat après une restauration). Valeurs recopiées
  (canons, points, vagues, hachage des parcours) : `tests/e2e/README.md`, « Scénario du combat en vol » ; toute
  retouche du vol, des canons ou des vagues doit les garder verts.
- Monde 1, partie 4a : `progress-ids` (full, aussi en `--prod` : sauvegardes v1 et v2, verrous, JOUER, pages des
  Niveaux, glissements, plan rendu), `luma-radio` (fenêtres, file, bips, pause, tutoriel de j1 dans l'ordre,
  tutoriel muet, mise en page de la bulle jusqu'à 640x320), `boss-mini` (arène, Blob-roi, phase 2, vie perdue,
  victoire, résultats, perte de contexte) ; `j1-play` (arrivée, balise), `j1-ctx-exit` (perte pendant la sortie),
  `campaign-flow` (j1 fini par le boss). Diag : `boss-bot` (durée des combats des deux mini-boss, `BOT_BOSS`),
  `theme-captures` (refonte sans changement visible : comparaison au pixel avec `XR_CAPTURES_REF`), pages d'aperçu
  `audio-world1`, `story-preview`, `bosses-preview`, `props-preview`, `art-preview`. Toute retouche de j1, de la
  radio, de la balise ou du boss doit garder verts `luma-radio`, `boss-mini`, `j1-play` et `aim-crouch-drop`
  (portes et ruine).
- Monde 1, partie 4b : `j2-play` (faisceau, rebonds mesurés, ombre, secousse et tronc, Tess et ses portes, pluie de
  spores, échec, arène, « Équipière : Tess », j2 rejouée Tess à bord), `boss-titan` (Scarabée-titan en touches,
  charge, ventre, cailloux, vie perdue, victoire ; H : instantané de Tess et du tronc, K contourné), `boss-whale`
  (j3 : radio brouillée, méduse-baleine en 3 phases, défaite en sortie, « Compétence : double saut », double saut
  dans j1), `j3-ctx-boss` (perte du contexte en combat et pendant la défaite) ; « Réessayer le combat » : `boss-mini`
  F2 / G, `boss-titan` H, `boss-whale` H, `j3-ctx-boss` C, `small-screens` (écran d'échec à 640x320 et 568x320) ;
  campagne à 6 étapes : `menu`, `progress-ids`, `campaign-flow`, `hangar`, `stress-laps`. Toute retouche de j2, j3,
  des champignons, des événements, de Tess ou des boss doit garder verts `j2-play`, `boss-titan`, `boss-whale`,
  `j3-ctx-boss`, `boss-mini` et `luma-radio`.
- Sorties console attendues : avertissement D3D `X4122 … double precision` (compilation d'un shader, une fois
  par navigateur à froid) ; lors des pertes de contexte provoquées, `[flight3d] contexte WebGL perdu` et les
  journaux THREE / Phaser. Chrome met 15 à 60 s à se fermer sur cette machine : le lanceur le tue, c'est normal.
  L'ancien banc `D:/DevTools/pw` est remplacé : ne plus l'utiliser, ni le supprimer sans l'accord de l'utilisateur.

## Pièges connus

- **iGPU Vega 3 sous ANGLE/D3D11** : le contexte WebGL se perd pendant une longue compilation de shaders ou
  quand plusieurs navigateurs utilisent le GPU en même temps.
- **Le compilateur D3D (FXC) déroule les boucles GLSL** : dans `src/game3d/glsl.ts`, les bornes valent
  `constante + xrLoopBias` (uniforme jamais renseigné, donc 0) et la compilation est ~8x plus rapide. Réutiliser
  `GLSL_NOISE` ou ce procédé pour tout nouveau shader à boucles. Le PMREM de three (`sky.ts`) reste la seule
  compilation lente, sous Windows seulement (≈ 1 s, parfois ~9 s à froid).
- **Pertes de contexte** : les reprises 2D et 3D sont couvertes par les scénarios `*-ctx-*` ; toute modification du
  rendu, de la pause ou du cycle de vie doit les garder verts.
- `#touch-root > * { pointer-events: auto }` (`styles.css`) est voulu : plus spécifique que
  `.xr-tc-layer { pointer-events: none }` (`input/styles.ts`), il évite qu'un doigt posé hors des commandes lance
  un défilement qui annulerait tous les doigts. Ne pas l'affaiblir (pas de `:where()`).
- Un doigt tactile non principal ne produit pas de `click` : `enableSecondFingerTaps` (`ui/dom.ts`, posé sur
  `#ui-root`) rejoue le clic au relâcher (PAUSE puis REPRENDRE pendant qu'un pouce tient le stick). Les commandes
  de l'interface doivent donc rester des `<button>`.
- La coquille (`App.ts`) gère seule le bouton retour Android (`handleBack` : en jeu → pause / reprise, sous-menu →
  retour, accueil → `exitApp`), `pause` / `resume` de Capacitor et `visibilitychange`. L'audio et les entrées
  réagissent aussi à la page cachée (son suspendu, commandes relâchées) ; les modes de jeu, eux, sont mis en pause
  par l'interface. Une étape attend le paysage et le premier plan pour démarrer, et démarre en pause si l'appli
  est passée en arrière-plan pendant son lancement (intro, fondus) ; en portrait ou en arrière-plan, REPRENDRE
  est sans effet.
- Les touches du jeu (Espace, flèches…) ne font `preventDefault` qu'en partie, hors pause (`keyboard.capture` =
  `setLayout()` ≠ `'none'`).
- Performances (GDD) : pas d'allocation dans les boucles de jeu (vecteurs et objets réutilisés), 3D sous
  ~150 draw calls, pixelRatio ≤ 1,5, pas de post-traitement plein écran ; viser 60 i/s sur mobile milieu de gamme.
- **Parcours de vol déterministes** : portails, rochers, cristaux des rochers et vagues sortent de la graine
  (records, tests). Un tirage de plus dans le générateur des portails et des rochers change tout le parcours :
  les vagues ont le leur (recette Parcours de vol). Le hachage `COURSE_FP` de `flight-combat` se relève dans
  Chrome : sous Node, les fonctions `Math.*` d'une autre version de V8 donnent d'autres valeurs.
- Combat en vol : le pilote automatique (`__xr3d.autopilot`) tient TIR quand la cible visée peut être touchée,
  prend le turbo loin des portails sur une énergie froide (relâché à 60 %) et s'écarte des mines, de l'essaim et des
  orbes ; sans lui, rien ne tire sans TIR tenu (`fire`, J / X / F, bouton) ; sans `variant`, `__xr3d.spawn` tire au hasard l'orientation de l'essaim et
  le virage du chasseur (un test le fixe). Hors de la phase `fly`, ni chocs, ni visée, ni ramassage des
  cristaux (`damageShip`, `live`, `updateGun`, `pickups.update`).
- **Moteur 2D, monde 1** : les textures Phaser sont globales : planches de boss, barrières et objets du niveau se
  libèrent à l'arrêt de la scène (`destroyBossArt`, `destroyArenaArt`, `destroyLevelArt` dans `onShutdown`). Une case
  pleine posée en jeu (barrière, tronc couché) va dans `grid.cells` ET dans le calque (`putTileAt`, collision et
  faces à la main), retirée des deux. Le cadre de
  la caméra n'a qu'un propriétaire, `updateCameraBounds()` (appelé par `snapCamera`, au redimensionnement et
  pendant le glissement de l'arène). `scene.exit`, `arena`, `boss`, `arrival`, `glyphs`, `mushrooms`, `sporeRain`,
  `npc`, `fightSnap` sont nuls sans l'élément correspondant (tous remis à zéro dans `init()`, `levelEvents` et
  `trunks` compris). Dans l'état `enter`, dégâts, `__xr2d.teleport`,
  `win`, `kill` et `power` sont ignorés : attendre `waitFor2dPlay`. Un coup reçu par le boss arrive après son
  `update()` de l'image : tout ce qui se dessine (clignotement) se recale dans `takeDamage`.
- **Champignons et vitesse verticale** : Arcade borne `maxVelocity` dans les deux sens. Le corps de Kaï monte
  jusqu'à `MAX_RISE_V` (rebond de 9 tuiles, ≈ 29 px par pas, sous `TILE_BIAS` = 32) et sa chute est bornée à la main
  à `MAX_FALL_SPEED` (`Player.controlUpdate`) : un rebond plus haut que `MUSHROOM_MAX_TILES` ferait traverser les
  tuiles. Le rebond consomme l'appui de Saut de l'image (ni saut ni double saut en même temps).
- **Secousses** : toujours `scene.fx.shake(force, ms?)` (force 1 = 0,01 de `Camera.shake`), jamais
  `cameras.main.shake` : Phaser ignore une secousse pendant une autre, `shake` fait remplacer la plus faible ou la plus
  courte (porte d'entrée unique pour une future option de confort).
- **Naufragé** : tant que Kaï est près de lui sans l'avoir secouru, puis pendant le sauvetage (≈ 6 s), les portes
  restent fermées (`Castaway.holdsDoors`) ; l'appui ↑ le secourt avant d'ouvrir une porte. Déjà dans
  `hooks.loadout.crew` : état `gone` d'emblée, capsule seule.
- **Radio de LUMA** : horloge en temps réel de l'interface (pas celle de la scène), figée par `hud.setPaused` et la
  page cachée ; bulle jamais cliquable (`pointer-events: none`). check-levels simule la file avec `RADIO_TIMING` et
  la longueur des textes : allonger un message ou changer le rythme peut le faire échouer (message chassé) ou
  avertir (bulle pendant un rebond). Au début d'un niveau, l'horloge de la radio est bornée (`MAX_DT` 0,1 s) pendant
  les premières images, lourdes : le premier message s'ouvre ≈ 0,5 s plus tard que dans la simulation (marge à
  garder avant un premier champignon).
- `story/` et `ui/hangarPreview.ts` n'importent du jeu 2D que des dessins purs (`art/draw/*`, `art/util`,
  `art/keys`, `art/palette`), jamais Phaser ni le moteur. Le module des bulles et des cinématiques se charge par
  `import()` (hors du bundle de l'accueil).
- Écran Niveaux : le glissement avale le `click` d'une carte seulement s'il vient d'un pointeur (`e.detail !== 0` :
  Entrée et Espace marchent toujours) ; pas de `setPointerCapture` au `pointerdown` (le `click` irait à la zone des
  pages, pas à la carte) ; pages masquées par `visibility` + `inert` + `aria-hidden`.
- WebView Android anciennes : `Object.prototype.hasOwnProperty.call` plutôt que `Object.hasOwn`.

## Façon de travailler

- Git est utilisé : ne committer (ni pousser) que sur demande de l'utilisateur ; `npm run build` doit passer avant.
- Français partout ; paysage uniquement ; graphismes et sons procéduraux (aucun fichier image ou son sauf
  les PNG de Kaï, `art/sprites/kai/`, et un fichier fourni explicitement).
- Tenir à jour `docs/SOUHAITS.md` (cases cochées) et ce fichier quand une règle ou l'architecture change.
- **Cursor** travaille aussi sur ce dépôt : il lit ce fichier et les skills de `.claude/skills/` ; ce qui lui est
  propre (où il écrit, signature) est dans `.cursor/rules/claude-code.mdc`. Règle commune → ici, jamais en double.
  Une commande à partager se fait en skill, `.claude/skills/<nom>/SKILL.md`, dossier que Cursor charge aussi.
- Discussions entre IA : `docs/discussions-ia/` (convention : son `README.md`), `/discussion` pour ouvrir un fil,
  y répondre, transcrire une réponse venue d'ailleurs, clore. Rien n'y est décidé ; ne lire un fil que sur demande.
