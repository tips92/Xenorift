# Xeno Rift — consignes pour Claude

## Le projet

Démo de jeu mobile (Android via Capacitor 8, iOS plus tard avec le même code) : plateforme 2D « à la Mario »
avec 4 armes à surchauffe (Phaser 3.90), entrecoupée de vols spatiaux 3D à travers des portails (Three.js 0.186).
Héros : Kaï ; vaisseau : la Comète. Campagne de 4 étapes : Jungle de Xéna `j1` (2D) → Nébuleuse d'Azur `f1`
(vol, 16 portails) → Lune Krator `m1` (2D) → Ceinture d'Orak `f2` (vol, 22 portails) → « Fin de la démo ».
Paysage uniquement, tout se joue au tactile (le clavier sert aux tests sur PC). Aucun fichier image ni son :
graphismes dessinés par code (Canvas 2D, géométries et shaders three), sons et musiques synthétisés (Web Audio).
Docs : `docs/GDD.md` (conception et contraintes techniques), `docs/SOUHAITS.md` (liste vivante + ordre de
travail), `docs/HISTOIRE.md` (trame en 5 mondes), `docs/plans/` (plans techniques des prochaines étapes ;
**`docs/plans/README.md` donne l'état de chaque étape et la prochaine action**), `docs/ARCHITECTURE.md`
(couches, règle de dépendance, documents et suivi des tâches, où ranger le code à venir).

**Langue : tout en français** — réponses, textes de l'interface, commentaires du code (courts), docs, messages
de commit. Identifiants du code en anglais. Suivre le style du fichier modifié (densité des commentaires, idiomes).

## Machine et environnement (Windows 11, iGPU AMD Vega 3)

- **C: est plein : tout s'installe et se met en cache sur D:.** Dans `D:\DevTools` : `jdk-21` (JAVA_HOME),
  `android-sdk` (ANDROID_HOME), `android-user` (ANDROID_USER_HOME, contient le `debug.keystore` qui signe
  l'APK de test), `gradle-home` (GRADLE_USER_HOME), `npm-cache` (imposé par `.npmrc`), `tmp`.
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
| `npm run check-levels` | valide les niveaux 2D (`-- moon` : un seul ; `-- --map` : carte annotée). Les avertissements « secret de compétence » (double saut) sont normaux. |
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
  et calculs purs du hangar (`itemState`, `applyPurchase`, `buildPlayLoadout`, `departLabel`). Lisibles par
  Node (chargés par check-levels via `constants.ts`).
- `src/ui` — la coquille. `App.ts` : phases `menu | intro | playing`, enchaînements `navigate()` (le dernier annule
  les précédents via `flowId` ; `navLock` ignore les clics entre-temps), étapes, pause, bouton retour,
  arrière-plan, orientation, son débloqué au premier geste, paramètres d'URL, `__xrShell`. `overlays.ts` : fondu
  (`FADE_MS` = 250 ms = `--t-screen` de `styles.css`) et invite de rotation. `services.ts` : enveloppes qui
  avalent les erreurs de l'audio et des entrées. `hud.ts` : HUD DOM commun 2D/3D (en 2D : jauge de chauffe
  avec l'icône de l'arme et une graduation par tir, anneaux des bonus vitesse, cadence et bouclier ; 4 ou 5
  cœurs : classe `has-extra-hearts`, la jauge passe à droite sous 960 px ; en vol, 4 ou 5 boucliers :
  `has-extra-shields`, pastilles resserrées).
  `screens/` : `title`, `select` (bouton « Hangar » avec la réserve), `options` (rubriques Général et Commandes
  avec aperçu des commandes ; panneau repris par `pause`), `intro`, `results` (réserve : « +N cristaux » et
  total, gain seulement s'il y en a), `hangar` (onglets Établi / Comète / Kaï, achat avec confirmation intégrée,
  équipement de l'arme ; refus et équipement pour la session annoncés par son propre message `.hg-msg`, pas
  par les toasts globaux, qui passent sous la pause),
  `outcome` (échec, fin, erreur), `common` (contrat `Screen`, boutons).
  `hangarPreview.ts` (aperçu canvas du hangar : Kaï armé et la Comète dessinés avec `game2d/art/draw`, sans
  Phaser ; chargé par `import()` depuis `screens/hangar.ts`, donc hors du bundle de l'accueil).
  `dom.ts` (utilitaires, `enableSecondFingerTaps`), `background.ts` (fond CSS des menus), `icons.ts`
  (`powerIcon`, `weaponIcon`, `upgradeIcon`, `stageIcon`).
- `src/input` — `InputApi`. `keyboard.ts` (par `event.code` : AZERTY = QWERTY), `touch.ts` (pointer events, un doigt
  = un pointerId capturé ; `?touch=` ; en 2D stick rond fixe à 8 directions `.xr-dpad`, en vol joystick flottant ;
  `setOptions` : taille, opacité, mode gaucher), `stick.ts` (lecture pure du stick 2D par secteurs d'angle,
  `STICK_SECTORS` à régler sur téléphone), `tilt.ts` (inclinaison, en vol seulement), `styles.ts` (CSS injecté des
  commandes, variables `--xr-scale` / `--xr-tc-opacity`), `index.ts` (fusion dans un état unique modifié sur place ;
  tout relâché sur `blur` et page cachée ; appui `interact` = front montant de « haut sans ← → », jamais avec Tir).
- `src/audio` — `AudioApi`. `engine.ts` (AudioContext créé au premier geste, bus, compresseur, 24 voix d'effets max,
  suspend/resume, vibrations via `navigator.vibrate`), `sfx.ts` (`RECIPES`), `tracks.ts` (`TRACKS`, morceaux
  procéduraux joués pas à pas), `music.ts` (séquenceur), `band.ts` (instruments, bus), `theory.ts`, `voice.ts`,
  `buffers.ts` (bruit, réverbération).
- `src/game2d` — `index.ts` : `startPlatformer`. `engine/` : `game.ts` (instance Phaser unique, perte de
  contexte), `session.ts` (une session par lancement, `endSession`), `PlatformScene.ts` (scène réutilisée,
  tout remis à zéro dans `init()` ; `__xr2d` ; bonus `speedLeftMs` / `rapidLeftMs` cumulables ; cœurs max
  `maxHearts` lus dans `hooks.loadout` (3 à 5) dans `init()`, rendus à la réapparition), `Player`
  (visée devant / diagonale / haut, accroupi 34x46 pieds en place, descente d'étage ↓ + Saut, bras armé =
  sprite à part accroché à l'épaule, `setWeapon`, `speedMul`, `canDoubleJump` lu dans `hooks.loadout`),
  `enemies` (`hit(e, dégâts)` ; 2 PV, blindé 4), `items`, `projectiles` (`ShotPool` : 40 tirs toutes armes,
  champ `scene.lasers`, vitesse / portée / dégâts / image copiés de la fiche au tir), `weapons` (`Gun` : fiche
  effective de `core/weapons.ts` avec les améliorations `hooks.loadout.mods` de chaque arme, relues une fois
  par partie ; rafale, plombs en éventail, dispersion, surchauffe, tir dans l'axe de la visée), `movers`, `doors` (paires de portes `D`, flèche ▲, passage par l'appui `interact`), `exitShip`,
  `mapBuilder` (carte ASCII → tilemap, mur de fond des salles closes), `hudSync`, `effects` (dont `muzzle`,
  `speedStreak`), `tuning.ts` (réglages internes, PV des ennemis, score). `art/` : textures et parallaxe
  dessinées par code pour le thème du niveau (`index.ts`, `palette.ts`, `parallax.ts`, `draw/*` dont
  `player.ts` : corps 64x80 sans arme, poses accroupie et de reptation, bras armé 64x32 par arme (`GUNS`,
  éclair de recul `FLASH`) ; `items.ts` : `drawBullet` (projectile par arme), icônes de bonus ; `doors.ts` :
  portes, flèche ▲, mur de salle ; `keys.ts` : `ARM_TEX`, `ARM_RIG` (épaule décalée en visée haute et
  diagonale : la visière reste visible), `ARM_MUZZLE` pour le bras armé, `BULLET_TEX` / `BULLET_SIZE` (`tip` =
  point testé contre décor et ennemis) / `BULLET_ADDITIVE` (mode de rendu ; plombs de pompe à contour, en mode
  normal) pour les projectiles).
  `levels/` : `jungle.ts`, `moon.ts`, `build.ts` (`joinSegments`), registre `index.ts`.
- `src/game3d` — `index.ts` : `startFlight` (construction impossible → `onFail` différé). `flight.ts` : `FlightRun`,
  machine à états `intro → fly → warp | dead | timeout → done`, pilotage, portails (+2 s / −5 s), collisions,
  caméra, perte de contexte, `__xr3d` ; boucliers max et taux du turbo lus une fois dans `hooks.loadout.ship`. `renderer.ts` : renderer partagé. `courses.ts` : `COURSES` (générés depuis
  une graine fixe). `sky.ts` (nébuleuse cuite en cubemap + PMREM), `glsl.ts` (bruit), `environment.ts` (planètes
  et créature selon le parcours), `creatures`, `planets`, `gates`, `asteroids`, `ship`, `effects`, `util.ts` (`Bin`),
  `rng.ts` (aléatoire à graine).
- `preview/` — pages d'outil du serveur de dev (hors build et hors typecheck) : `/preview/art.html?theme=jungle|moon&view=world|sheet|weapons`
  (graphismes 2D ; la planche montre aussi Kaï assemblé avec son bras et les portes ; `weapons` : les 4 bras
  à 2x avec bouche du canon et pivot, Kaï dans 6 visées, stand de tir à la vraie cadence et vitesse, icônes
  de bonus et projectiles, `&bg=0` sans le décor ; loupe `&z=2.5&cx=…&cy=…`),
  `/preview/flight.html?stage=f1|f2&autopilot=1&shield=0..2&boost=0..2` (vol avec des hooks simulés et
  `defaultPlayLoadout()` ; `shield` / `boost` : modules de la Comète).
  Ailleurs : `scripts/check-levels.ts` (validateur), `tests/e2e/`, `tools/` (scripts Android).

### Contrats — à ne pas changer à la légère (toute modification se répercute dans chaque module)

- `src/core/types.ts` : `StageDef`, `StageResult`, `ModeHooks` (dont `loadout`) / `ModeHandle` / `StartMode`,
  `HudApi` (`PlatformHud` : `weapon`, `heat`, `speedLeft`, `rapidLeft`, `shield`… ; `FlightHud`), `InputApi` /
  `InputState` / `InputAction` (dont `interact`), `TouchOptions`, `AudioApi`, `Settings`, `SaveData` (version 2,
  recette Sauvegarde), `Loadout`
  (`equipped` ∈ `owned`, `owned` dans l'ordre de `WEAPON_IDS` et toujours avec `'laser'`, `skills.doubleJump`),
  `PlayLoadout` (`ModeHooks.loadout` = `Loadout` + `mods` de chaque arme + `maxHearts` + `ship` : `ShipLoadout`),
  `WeaponUpgrades`, `ShipModules`, et les unions `ThemeId`, `CourseId`, `MusicId`, `SfxId`, `PowerUpKind`
  (`'speed' | 'rapid' | 'shield'`), `WeaponId` (`'laser' | 'machinegun' | 'shotgun' | 'rifle'`), `UpgradeStat`,
  `CrewId` (`'tess' | 'mira'`).
- `src/core/stages.ts` (`STAGES`, `getStage`, `nextStage`) ; `src/core/save.ts` (format de sauvegarde) ;
  `src/core/weapons.ts` (fiches et calcul des valeurs effectives) ; `src/core/hangar.ts` (catalogue des achats,
  identifiants `HangarItemId` stables, prix, conditions, effets ; fonctions pures, lisible par Node).
- `src/game2d/constants.ts` : tuile 64 px, vue de 720 px de haut, 14 lignes, physique de Kaï (corps debout et
  accroupi, `DROP_THROUGH_MS`), `DESIGN_RULES` (sauts garantis au level design), combat (`AIM_ANGLE`,
  `PROJECTILE_POOL_SIZE`, `STARS_RATIO` partagé avec check-levels ; `MAX_HEARTS` = 3 et `MAX_HEARTS_CAP` = 5
  réexportés de `core/hangar.ts`), bonus (`POWER_DURATION_MS`, `SPEED_BOOST_MUL`, `RAPID_FIRE_MUL` réexporté de
  `core/weapons.ts`).
  `src/game2d/levels/types.ts` : `LevelData` et `LEGEND` (dont `D` et l'ordre des paires de portes).
  `src/game2d/art/keys.ts` : clés de textures, d'animations et tileset partagées par l'art et le moteur.
- Signatures exportées figées : `startApp`, `startPlatformer`, `startFlight`, `generatePlatformArt`, `createParallax`.

### Déroulement d'une étape

`App.startStage` (fondu, carte d'intro 2,2 s ou toucher, attente du paysage et du premier plan) → `loadMode`
(import dynamique : Phaser et three ne ralentissent pas l'accueil) → `StartMode(gameRoot, stage, hooks)` →
`ModeHandle`. L'interface appelle `pause()` / `resume()` / `destroy()` ; le mode appelle **au plus une fois**
`onComplete(result)` ou `onFail(reason)`. `endRun` ignore doublons et étapes périmées, enregistre le résultat
(`recordResult`) et change d'écran dans un `setTimeout(0)` : un mode peut donc l'appeler depuis sa boucle (le 2D
diffère en plus via `endSession`). `destroy()` libère tout : le conteneur doit pouvoir accueillir l'autre mode.
`hooks.settings` est un objet vivant (mis à jour sur place quand un réglage change). `hooks.loadout`, au
contraire, est l'équipement EFFECTIF (`PlayLoadout`), figé pour la partie : `launch()` le calcule avec
`playLoadout(live)` (arme de la session de `core/save.ts` — `?weapon=` ou le hangar en mode test — sinon celle
de la sauvegarde ; multiplicateurs `mods` de chaque arme, `maxHearts`, `ship` ; mode test : 4 armes et double
saut, mais seulement les améliorations achetées) ; les modes ne le modifient pas.
Après une réussite, `endRun` ajoute les cristaux à la réserve (dans `recordResult`, une fois) ; les résultats
affichent « +N cristaux » et la réserve. « Suivant » ouvre le hangar (`makeHangar`) s'il reste une étape (sinon
la fin) ; son bouton de départ (libellé : `departLabel` de `core/hangar.ts`) lance la carte d'intro de l'étape
suivante ; le retour (◀, Android, Échap, Retour arrière) ferme d'abord la confirmation d'achat, puis ramène aux résultats
(`makeResults(…, settled)` : valeurs finales, réserve relue). Écran Niveaux : bouton « Hangar », sans départ,
retour aux Niveaux. JOUER ne passe pas par le hangar.

### Rendus partagés : un seul contexte WebGL par moteur (coûteux, nombre limité dans les WebView)

- **2D** (`engine/game.ts`) : un seul `Phaser.Game`, réutilisé ; entre deux sessions le canevas est masqué et la
  boucle endormie. Contexte perdu → scène figée et toast ; restauré → reprise ; sinon `onFail('Liaison graphique
  perdue')` après 5 s au premier plan (délai remis à zéro à chaque retour ; pendant le décollage, niveau validé).
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
boost }, extraHearts, crew, blueprints }`). Les joueurs doivent garder leur progression. `load()` : version 1
→ `readBase` (`unlocked`, `best`, `settings`, `loadout` gardés ; le reste par défaut, réserve 0), réécrite en
version 2 au prochain enregistrement ; version 2 → `readV2` (chaque champ relu : niveaux bornés par
`clampLevel`, identifiants inconnus filtrés, nombres abîmés → défaut) ; autre version ou JSON illisible →
`defaults()`. **Nouveau champ** : type dans `SaveData`, valeur dans `defaults()`, lecture validée dans
`readV2` (absent ou abîmé → défaut : pas de nouvelle version) ; `resetProgress()` le remet à zéro tout seul
(`defaults()`, réglages gardés). **Changement incompatible** (champ renommé, sens changé) : version 3,
migration dans `load()` à partir de `readV2`, et les scénarios e2e qui écrivent une version 2 (`hangar`,
`patchSave` de `small-screens`).
Nouveau réglage : rien à faire dans `load()` (`readSettings` : chaque champ de `DEFAULT_SETTINGS` garde la valeur
enregistrée si elle a le même type ; crans `touchSize` / `touchOpacity` bornés à 0..2). `readLoadout` : laser
seul et pas de double saut si absent, `'laser'` toujours possédé, arme équipée non possédée → laser.
Écritures : `recordResult` (réussite : meilleur score, déblocage, cristaux de l'étape ajoutés à la réserve, seul
endroit où ils s'ajoutent), `purchase(id)`, `equipWeapon(id)` / `setEquippedWeapon(id)` (refuse une arme non
possédée), `addCrystals(n)` (aide de test). Jamais enregistrés : `setSessionWeapon(id)` (`?weapon=`, mode test)
et `playLoadout(settings, override?)` (`PlayLoadout` : équipement EFFECTIF d'une partie, `mods`, `maxHearts`,
`ship` ; sans `override`, arme de la session). Ne jamais renommer l'`id` d'une étape (clé de `best`).

**Achat du hangar** (`core/hangar.ts`, pur, lisible par Node ; valeurs de départ dans le plan 03) : identifiant
stable dans `HangarItemId` (jamais renommé : interface et tests) + entrée de `buildItems` (onglet, `maxLevel`,
`prices` par niveau, `effects`, `crew` par niveau, `blueprint`, `soon` tant que l'effet n'est pas branché) + prix
dans `PRICES`. Niveau enregistré : champ de `SaveData` (recette Sauvegarde), lu par `itemLevel`, écrit par
`applyPurchase`. Effet : champ de `PlayLoadout` calculé par `buildPlayLoadout` (et `defaultPlayLoadout`), lu
une fois par le mode au départ dans `hooks.loadout` et borné (repli sur la valeur de base). Écran
(`ui/screens/hangar.ts`) : rangée ajoutée dans `renderTab` (les onglets Comète et Kaï listent leurs achats un
par un), textes `effectLine` / `buyPhrase` (un `switch` sur `kind` : tsc signale un genre oublié), `KIND_ICONS` ;
aperçu `ui/hangarPreview.ts` si l'achat se voit. Le mode test lève les conditions (plan, arme, équipage), jamais
le prix ni le niveau max. Les prix et réserves attendus sont recopiés dans le scénario `hangar`.

**Niveau 2D** : `src/game2d/levels/<id>.ts` (segments de 14 lignes assemblés par `joinSegments`, légende dans
`levels/types.ts`, exactement un `P` et un `X`, 8 colonnes plates et sûres au départ, `P` en colonne 8 ou plus :
plus à gauche, Kaï apparaît sous le stick tactile ou le Tir du mode gaucher), enregistré dans
`levels/index.ts`. Ces fichiers, `levels/index.ts`, `build.ts`, `types.ts` et `constants.ts` sont lus par Node :
rien qui dépende du navigateur, de Vite ou de Phaser, imports de valeurs avec l'extension `.ts`, TypeScript
« effaçable » (ni enum ni namespace) ; `constants.ts` charge aussi `core/weapons.ts` et `core/hangar.ts` (mêmes
règles). `npm run check-levels` doit finir sans erreur (accessibilité selon `DESIGN_RULES` ; secrets de compétence : ce que seul
le double saut atteint, en avertissement ; 3 étoiles (`STARS_RATIO.three`, 90 % des cristaux) possibles sans
eux, sinon erreur ; sur la carte `--map`, `&` = bloc frappé seulement avec le double saut). Blocs bonus : `1`
vitesse, `2` bouclier, `3` cadence. Viser 2 à 3 min de jeu (~220 colonnes). Aperçu visuel : `preview/art.html`.
Portes `D` : par paires dans l'ordre (colonne, puis ligne), posées sur un sol, case du dessus vide ; check-levels
vérifie la parité et le sol, et relie les deux portes d'une paire dans le graphe d'accessibilité. Les cases vides
d'une salle close (aucun chemin vers le bord de la carte sans traverser de case pleine) reçoivent un mur de fond
(`TEX.roomWall`, `ParsedLevel.enclosed`, `buildTilemap`). Garder les lignes 0 et 1 libres au-dessus d'une salle
tout en haut : le HUD les couvre quand la caméra est calée en haut. check-levels ne
connaît ni la reptation accroupie ni la descente ↓ + Saut : passages d'une tuile de haut et chemins qui exigent
une descente restent hors du chemin principal.

**Parcours de vol** : ajouter l'identifiant à `CourseId` et à `MusicId` (un vol joue la musique de même nom),
une entrée `COURSES` dans `game3d/courses.ts` (graine, vitesse, chrono, portails, densité de rochers,
`CourseTheme`), puis remplacer les choix binaires codés en dur : `flight.ts` (`stage.levelId === 'asteroids' ? … :
'nebula'`), `environment.ts` (planètes, créature), `ui/icons.ts` (`stageIcon`), `preview/flight.ts`.
`maxOffset` / `maxJump` / `REACH_FACTOR` gardent les portails atteignables.

**Étape de campagne** : `STAGES` dans `core/stages.ts` (`index` = ordre, `levelId` = niveau 2D ou `CourseId`,
`theme` pour la carte et l'intro). Déblocage : `isUnlocked(i)` = `unlockAll || i <= save.unlocked` ; réussir
l'étape `i` débloque `i + 1` ; JOUER reprend à `STAGES[unlocked]` (borné à la dernière). `unlocked` est un index :
ajouter en fin de liste (insérer au milieu décale la progression des joueurs → migration). La grille du choix du
niveau a 4 colonnes (2 sous 560 px de large ; `.cards` dans `styles.css`) ; l'écran de fin compte
`STAGES.length × 3` étoiles. Plusieurs scénarios e2e supposent 4 étapes et 16 / 22 portails.

**Réglage** : champ de `Settings` (`core/types.ts`) + défaut dans `DEFAULT_SETTINGS` (`core/save.ts`) +
interrupteur dans `TOGGLES` (champ `group` : rubrique `'general'` ou `'controls'`) ou sélecteur à 3 crans dans
`CHOICES` (`ui/screens/options.ts`, aussi affiché dans Pause, zone défilante `.pause-opt-body`) + effet immédiat
dans `setSettings()` et application au démarrage dans `App.ts` ; les modes lisent `hooks.settings`. Les réglages
des commandes tactiles passent par `input.setTouchOptions` (crans `TOUCH_SIZE_STEPS` / `TOUCH_OPACITY_STEPS` de
`input/touch.ts`, repris par l'aperçu du panneau) ; `load()` ne valide pas les valeurs : `touchStep` les borne.

**Son / musique** : effet = `SfxId` + recette dans `RECIPES` (`audio/sfx.ts`) ; musique = `MusicId` + morceau dans
`TRACKS` (`audio/tracks.ts`), + `VALID_MUSIC` de `scripts/check-levels.ts` si un niveau 2D l'utilise. Les
`Record<…>` font échouer tsc s'il en manque un. Rien ne doit rester branché après une note (le scénario
`audio-lifecycle` compte les nœuds). `music(id)` ne relance pas le morceau déjà en cours. Chaque arme a son son
de tir (`WeaponDef.sfx` : `'laser'`, `'machinegun'`, `'shotgun'`, `'rifle'`), joué une fois par salve (un coup de
pompe = 1 son, une rafale de fusil = 3) : sa durée doit tenir dans la cadence (mitrailleur ≤ 70 ms, fusil
≤ 100 ms, pompe ≈ 370 ms réarmement compris). Les impacts de toutes les armes jouent `'laserHit'` (au plus un
par tranche de 45 ms, `IMPACT_SFX_GAP_MS`).

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

**Nouveau monde (thème)** : `ThemeId`, puis `PALETTES` (`art/palette.ts`), `THEME_COLORS` (`engine/effects.ts`),
dessins `art/draw/{tiles,enemies,items,backgrounds,doors}.ts` et `art/parallax.ts`. Ces fichiers testent souvent
`theme === 'jungle' ? … : …` : un nouveau thème y prendrait silencieusement l'aspect de la Lune (de la jungle
là où le test porte sur `'moon'`) (`grep -rn "'jungle'\|'moon'" src`). Aussi : `stageIcon` (`ui/icons.ts`),
CSS `.card--<thème>` / `.intro--<thème>`, `VALID_THEMES` de check-levels, une musique, `preview/art.ts`. Direction artistique dans le GDD (néon extraterrestre, créature
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
  `dist/` servi sur 4173 (`npm run build` d'abord) ; les scénarios `meta.dev` y sont ignorés (SKIP).
- **Un seul navigateur à la fois** (l'iGPU perd le contexte WebGL sous charge concurrente) : passer toujours par
  le lanceur, qui pose le verrou `D:/DevTools/tmp/xeno-rift-e2e.lock` (commun à tous les worktrees ; un second
  lanceur attend). Depuis un autre worktree, prendre d'autres ports (`XR_DEV_PORT=5174`, `XR_PROD_PORT=4174`) :
  sinon le lanceur réutilise le serveur 5173 de la copie principale et teste son code. Le panneau navigateur intégré de
  l'app est inutilisable pour jouer : page cachée (`document.hidden`), `requestAnimationFrame` gelé, et le jeu se
  met en pause comme en arrière-plan.
- Aides DEV (serveur de dev seulement, `import.meta.env.DEV`) : `window.__xr2d` (`scene`, `teleport(col, row)`,
  `god(on)`, `win()`, `kill()`, `weapon(id?)` (change l'arme en pleine partie : bras, `Gun`, HUD, jauge remise à
  zéro ; renvoie l'arme tenue), `power('speed'|'rapid'|'shield')` (comme un bonus ramassé), `info()` (copie :
  `weapon`, `heat`, `overheated`, `mods` (améliorations de l'arme tenue), `stats` effectives, `hearts`,
  `maxHearts`, `speedLeftMs`, `rapidLeftMs`, `shield`, `speedMul`, `canDoubleJump`, `shots[]` en vol avec
  `weapon`, `x`, `y`, `vx`, `vy`, `dist`, `range`, `damage`) ;
  `scene.player` : `aim`, `crouching`, `dropThrough`, `fireAngle`, `gunX` / `gunY`, `weapon` ; `scene.gun`
  (`heat`, `overheated`, `stats`, `weapon`) ; `scene.lasers.bolts` (`ShotPool`, toutes armes) ;
  `scene.speedLeftMs` / `rapidLeftMs` ; `scene.enemies.list[i].hp` ; `scene.doors.nearIndex`,
  `scene.parsed.doors`), `window.__xr3d` (`info()` → `phase`, `gates`, `nextGate`…, `shield`, `maxShields`,
  `boost` (jauge 0..1), `boosting`, `boostDrain` / `boostFill` (par seconde), `autopilot(on)`,
  `win()`, `fail()`, `advance(s)`, `timeScale(s)`, `bench(n)` ; disparaît avec la partie : tester sa présence),
  `window.__xrShell` (`info()` : dont `loadout` = { `equipped`, `owned`, `skills` } de la partie en cours,
  sinon du prochain lancement, `play` = `PlayLoadout` complet (`mods`, `maxHearts`, `ship`), `crystals` =
  réserve, `weapon` = arme de la session (`getSessionWeapon()`) ou null, `screen` = nom de l'écran affiché ;
  `addCrystals(n)` (réserve enregistrée ; l'écran affiché n'est pas redessiné : ajouter avant d'ouvrir le
  hangar) ; `cap('pause'|'resume'|'backButton')`, `audio`). Paramètres d'URL, actifs aussi en production : `?stage=j1|f1|m1|f2` (lancement direct, sans intro),
  `?unlock=1` (enregistré), `?touch=1|0`, `?weapon=laser|machinegun|shotgun|rifle` (arme de la session, même
  hors mode test et non possédée ; jamais enregistrée ; valeur inconnue ignorée, toast « Arme inconnue » sur
  l'accueil, ou en début de partie avec `?stage=`).
- Clavier : flèches / WASD (ZQSD en AZERTY) ; Espace = saut en 2D et turbo en vol ; K = saut ; Haut/W = haut
  (visée, portes, monter en vol), ne fait PAS sauter ; Bas/S = accroupi (puis ← → : reptation ; + saut :
  descente d'étage) ; J/X/F = tir ; Maj = turbo ; Échap/P = pause et reprise ; Entrée/Espace passent l'intro ;
  hors partie, Échap et Retour arrière = retour (comme le bouton retour Android, sans quitter l'appli ; au
  hangar, ferme d'abord la confirmation d'achat).
- Simulations dans `tests/e2e/lib/` : multi-touch CDP à identifiants explicites (`touch.mjs`), arrière-plan,
  événements Capacitor, bouton retour et compteurs audio (`shell.mjs`), perte/restauration de contexte WebGL
  (`gl.mjs`), aides par domaine (`core.mjs`, `game2d.mjs` : `kai2d`, `bolts2d`, `kaiShot`… ; `game3d.mjs`).
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
  étapes, « Suivant » ouvre le hangar : `nextViaHangar` (`core.mjs`) clique « Suivant » puis « Décoller »
  (`.hg-depart`). Un bouton `aria-disabled` (prix verrouillé) ne se clique avec Playwright qu'avec `force: true`.
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

## Façon de travailler

- Git est utilisé : ne committer (ni pousser) que sur demande de l'utilisateur ; `npm run build` doit passer avant.
- Français partout ; paysage uniquement ; graphismes et sons procéduraux (aucun fichier image ou son sauf fourni).
- Tenir à jour `docs/SOUHAITS.md` (cases cochées) et ce fichier quand une règle ou l'architecture change.
