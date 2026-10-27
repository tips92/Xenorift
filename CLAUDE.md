# Xeno Rift — consignes pour Claude

## Le projet

Démo de jeu mobile (Android via Capacitor 8, iOS plus tard avec le même code) : plateforme 2D « à la Mario »
avec tir laser (Phaser 3.90), entrecoupée de vols spatiaux 3D à travers des portails (Three.js 0.186).
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
| `npm run check-levels` | valide les niveaux 2D (`-- moon` : un seul ; `-- --map` : carte annotée). Les avertissements « secret double saut » sont normaux. |
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

- `src/core` — contrats et données partagées (liste ci-dessous).
- `src/ui` — la coquille. `App.ts` : phases `menu | intro | playing`, enchaînements `navigate()` (le dernier annule
  les précédents via `flowId` ; `navLock` ignore les clics entre-temps), étapes, pause, bouton retour,
  arrière-plan, orientation, son débloqué au premier geste, paramètres d'URL, `__xrShell`. `overlays.ts` : fondu
  (`FADE_MS` = 250 ms = `--t-screen` de `styles.css`) et invite de rotation. `services.ts` : enveloppes qui
  avalent les erreurs de l'audio et des entrées. `hud.ts` : HUD DOM commun 2D/3D. `screens/` : `title`, `select`,
  `options` (panneau repris par `pause`), `intro`, `results`, `outcome` (échec, fin, erreur), `common` (contrat
  `Screen`, boutons). `dom.ts` (utilitaires, `enableSecondFingerTaps`), `background.ts` (fond CSS des menus), `icons.ts`.
- `src/input` — `InputApi`. `keyboard.ts` (par `event.code` : AZERTY = QWERTY), `touch.ts` (pointer events, un doigt
  = un pointerId capturé ; `?touch=`), `tilt.ts` (inclinaison, en vol seulement), `styles.ts` (CSS injecté des
  commandes), `index.ts` (fusion dans un état unique modifié sur place ; tout relâché sur `blur` et page cachée).
- `src/audio` — `AudioApi`. `engine.ts` (AudioContext créé au premier geste, bus, compresseur, 24 voix d'effets max,
  suspend/resume, vibrations via `navigator.vibrate`), `sfx.ts` (`RECIPES`), `tracks.ts` (`TRACKS`, morceaux
  procéduraux joués pas à pas), `music.ts` (séquenceur), `band.ts` (instruments, bus), `theory.ts`, `voice.ts`,
  `buffers.ts` (bruit, réverbération).
- `src/game2d` — `index.ts` : `startPlatformer`. `engine/` : `game.ts` (instance Phaser unique, perte de
  contexte), `session.ts` (une session par lancement, `endSession`), `PlatformScene.ts` (scène réutilisée,
  tout remis à zéro dans `init()` ; `__xr2d`), `Player`, `enemies`, `items`, `projectiles`, `weapons`, `movers`,
  `exitShip`, `mapBuilder` (carte ASCII → tilemap), `hudSync`, `effects`, `tuning.ts` (réglages internes, score).
  `art/` : textures et parallaxe dessinées par code pour le thème du niveau (`index.ts`, `palette.ts`,
  `parallax.ts`, `draw/*`). `levels/` : `jungle.ts`, `moon.ts`, `build.ts` (`joinSegments`), registre `index.ts`.
- `src/game3d` — `index.ts` : `startFlight` (construction impossible → `onFail` différé). `flight.ts` : `FlightRun`,
  machine à états `intro → fly → warp | dead | timeout → done`, pilotage, portails (+2 s / −5 s), collisions,
  caméra, perte de contexte, `__xr3d`. `renderer.ts` : renderer partagé. `courses.ts` : `COURSES` (générés depuis
  une graine fixe). `sky.ts` (nébuleuse cuite en cubemap + PMREM), `glsl.ts` (bruit), `environment.ts` (planètes
  et créature selon le parcours), `creatures`, `planets`, `gates`, `asteroids`, `ship`, `effects`, `util.ts` (`Bin`),
  `rng.ts` (aléatoire à graine).
- `preview/` — pages d'outil du serveur de dev (hors build et hors typecheck) : `/preview/art.html?theme=jungle|moon&view=world|sheet`
  (graphismes 2D), `/preview/flight.html?stage=f1|f2&autopilot=1` (vol avec des hooks simulés).
  Ailleurs : `scripts/check-levels.ts` (validateur), `tests/e2e/`, `tools/` (scripts Android).

### Contrats — à ne pas changer à la légère (toute modification se répercute dans chaque module)

- `src/core/types.ts` : `StageDef`, `StageResult`, `ModeHooks` / `ModeHandle` / `StartMode`, `HudApi`
  (`PlatformHud`, `FlightHud`), `InputApi` / `InputState`, `AudioApi`, `Settings`, `SaveData`, et les unions
  `ThemeId`, `CourseId`, `MusicId`, `SfxId`, `PowerUpKind`.
- `src/core/stages.ts` (`STAGES`, `getStage`, `nextStage`) ; `src/core/save.ts` (format de sauvegarde).
- `src/game2d/constants.ts` : tuile 64 px, vue de 720 px de haut, 14 lignes, physique de Kaï, `DESIGN_RULES`
  (sauts garantis au level design), combat. `src/game2d/levels/types.ts` : `LevelData` et `LEGEND`.
  `src/game2d/art/keys.ts` : clés de textures, d'animations et tileset partagées par l'art et le moteur.
- Signatures exportées figées : `startApp`, `startPlatformer`, `startFlight`, `generatePlatformArt`, `createParallax`.

### Déroulement d'une étape

`App.startStage` (fondu, carte d'intro 2,2 s ou toucher, attente du paysage et du premier plan) → `loadMode`
(import dynamique : Phaser et three ne ralentissent pas l'accueil) → `StartMode(gameRoot, stage, hooks)` →
`ModeHandle`. L'interface appelle `pause()` / `resume()` / `destroy()` ; le mode appelle **au plus une fois**
`onComplete(result)` ou `onFail(reason)`. `endRun` ignore doublons et étapes périmées, enregistre le résultat
(`recordResult`) et change d'écran dans un `setTimeout(0)` : un mode peut donc l'appeler depuis sa boucle (le 2D
diffère en plus via `endSession`). `destroy()` libère tout : le conteneur doit pouvoir accueillir l'autre mode.
`hooks.settings` est un objet vivant (mis à jour sur place quand un réglage change).

### Rendus partagés : un seul contexte WebGL par moteur (coûteux, nombre limité dans les WebView)

- **2D** (`engine/game.ts`) : un seul `Phaser.Game`, réutilisé ; entre deux sessions le canevas est masqué et la
  boucle endormie. Contexte perdu → scène figée et toast ; restauré → reprise ; sinon `onFail('Liaison graphique
  perdue')` après 5 s au premier plan (délai remis à zéro à chaque retour ; pendant le décollage, niveau validé).
  Contexte toujours perdu au lancement suivant → jeu neuf (`dropGame`), en Canvas si WebGL est refusé (retenté ensuite).
- **3D** (`renderer.ts`) : `acquireRenderer` / `releaseRenderer` (canevas masqué, gardé pour la partie suivante) /
  `discardRenderer` (contexte perdu, ou restauré en cours de partie : jamais réutilisé). `FlightRun` attend 2 s une
  restauration (délai suspendu en pause), accepte 2 restaurations sur place par partie puis abandonne ; une issue
  déjà décidée (warp, explosion, chrono) est conservée.

## Recettes

**Sauvegarde** (`core/save.ts`, localStorage `xeno-rift-save-v1`, `{ version: 1, unlocked, best: { [stageId]:
{ score, stars } }, settings }`). Les joueurs doivent garder leur progression : `load()` remet tout à zéro si
`version !== 1` et ne recopie que `unlocked`, `best` et `settings`. Un nouveau champ de premier niveau doit donc
y être lu avec une valeur par défaut ; un nouveau réglage reçoit la sienne tout seul (fusion avec
`DEFAULT_SETTINGS`). Changer de version impose d'écrire la migration dans `load()`. Ne jamais renommer l'`id`
d'une étape (clé de `best`).

**Niveau 2D** : `src/game2d/levels/<id>.ts` (segments de 14 lignes assemblés par `joinSegments`, légende dans
`levels/types.ts`, exactement un `P` et un `X`, 8 colonnes plates et sûres au départ), enregistré dans
`levels/index.ts`. Ces fichiers, `levels/index.ts`, `build.ts`, `types.ts` et `constants.ts` sont lus par Node :
rien qui dépende du navigateur, de Vite ou de Phaser, imports de valeurs avec l'extension `.ts`, TypeScript
« effaçable » (ni enum ni namespace). `npm run check-levels` doit finir sans erreur (accessibilité selon
`DESIGN_RULES`, secrets double saut). Viser 2 à 3 min de jeu (~220 colonnes). Aperçu visuel : `preview/art.html`.

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
interrupteur dans `TOGGLES` (`ui/screens/options.ts`, aussi affiché dans Pause) + effet immédiat dans
`setSettings()` et application au démarrage dans `App.ts` ; les modes lisent `hooks.settings`.

**Son / musique** : effet = `SfxId` + recette dans `RECIPES` (`audio/sfx.ts`) ; musique = `MusicId` + morceau dans
`TRACKS` (`audio/tracks.ts`), + `VALID_MUSIC` de `scripts/check-levels.ts` si un niveau 2D l'utilise. Les
`Record<…>` font échouer tsc s'il en manque un. Rien ne doit rester branché après une note (le scénario
`audio-lifecycle` compte les nœuds). `music(id)` ne relance pas le morceau déjà en cours.

**Nouveau monde (thème)** : `ThemeId`, puis `PALETTES` (`art/palette.ts`), `THEME_COLORS` (`engine/effects.ts`),
dessins `art/draw/{tiles,enemies,items,backgrounds}.ts` et `art/parallax.ts`. Ces fichiers testent souvent
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
  le lanceur, qui pose le verrou `tests/e2e/out/.lock` (un second lanceur attend). Le panneau navigateur intégré de
  l'app est inutilisable pour jouer : page cachée (`document.hidden`), `requestAnimationFrame` gelé, et le jeu se
  met en pause comme en arrière-plan.
- Aides DEV (serveur de dev seulement, `import.meta.env.DEV`) : `window.__xr2d` (`scene`, `teleport(col, row)`,
  `god(on)`, `win()`, `kill()`), `window.__xr3d` (`info()` → `phase`, `gates`, `nextGate`…, `autopilot(on)`,
  `win()`, `fail()`, `advance(s)`, `timeScale(s)`, `bench(n)` ; disparaît avec la partie : tester sa présence),
  `window.__xrShell` (`info()`, `cap('pause'|'resume'|'backButton')`, `audio`). Paramètres d'URL, actifs aussi en
  production : `?stage=j1|f1|m1|f2` (lancement direct, sans intro), `?unlock=1` (enregistré), `?touch=1|0`.
- Clavier : flèches / WASD (ZQSD en AZERTY) ; Espace = saut en 2D et turbo en vol ; Haut/W = haut + saut ;
  K = saut ; J/X/F = tir ; Maj = turbo ; Échap/P = pause et reprise ; Entrée/Espace passent l'intro ; hors
  partie, Échap et Retour arrière = retour (comme le bouton retour Android, sans quitter l'appli).
- Simulations dans `tests/e2e/lib/` : multi-touch CDP à identifiants explicites (`touch.mjs`), arrière-plan,
  événements Capacitor, bouton retour et compteurs audio (`shell.mjs`), perte/restauration de contexte WebGL
  (`gl.mjs`), aides par domaine (`core.mjs`, `game2d.mjs`, `game3d.mjs`).
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
  `#ui-root`) rejoue le clic au relâcher (PAUSE puis REPRENDRE pendant qu'un pouce tient la croix). Les commandes
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
