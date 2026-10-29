# Tests de bout en bout (e2e)

Chrome sans fenêtre, piloté par `playwright-core` (version exacte 1.55.0, aucun navigateur téléchargé :
on utilise le Chrome installé via `channel: 'chrome'`). Le jeu tourne sur le vrai GPU (ANGLE / Direct3D 11).

## Lancer

```bash
npm test                                   # typecheck + check-levels + suite smoke
npm run e2e                                # suite smoke seule
node tests/e2e/run.mjs menu j1-play        # scénarios choisis (depuis n'importe quel dossier)
node tests/e2e/run.mjs --suite full        # smoke | full | diag | all (= full + diag)
node tests/e2e/run.mjs --list              # scénarios, suites, titres
node tests/e2e/run.mjs --repeat 5 j1-play  # recherche d'instabilités
node tests/e2e/run.mjs --prod --suite full # build de production : menu, small-screens, progress-ids, prod-build (le reste : SKIP)
node tests/e2e/run.mjs --help              # aide (en-tête de run.mjs)
```

Avec npm, les options passent après `--` : `npm run e2e -- --suite full`. Noms et `--suite` s'additionnent.
`--prod` seul garde la suite smoke par défaut : seul `menu` y tourne.

Durées sur cette machine (fourchettes : la seconde valeur, mesurée au bilan de 4b, sur une machine peut-être
chargée par une autre séance) : `smoke` ≈ 1 min 40 (`npm test` ≈ 2 min 10 en tout), `full` ≈ 41 à 48 min (dont
`flight-autopilot` ≈ 2 min 45, `flight-combat` ≈ 1 min 45 seul et 2 min 25 dans la suite, `stress-laps` ≈ 2 min 55
à 3 min 20, `small-screens` ≈ 3 à 4 min 20, `weapons` ≈ 1 min 40 à 2 min 35, `audio-lifecycle` ≈ 1 min 20,
`hangar` ≈ 1 min 30 à 1 min 45, `luma-radio` ≈ 3 min 20 à 3 min 40, `campaign-flow` ≈ 1 min 20,
`boss-mini` ≈ 1 min 30, `boss-titan` ≈ 1 min 10, `boss-whale` ≈ 1 min 50, `j3-ctx-boss` ≈ 45 s,
`progress-ids` ≈ 50 s à 1 min 25, `powerups` ≈ 45 s et `j2-play` ≈ 1 min 15),
`diag` ≈ 7 min 20 à 9 min
(dont `audio-world1` ≈ 2 min 15 à 3 min, `boss-bot` ≈ 1 min 50 à 2 min 05 et `story-preview` ≈ 55 s),
`--prod --suite full` ≈ 2 min 10.

- **Serveur** : scénarios dev : le lanceur réutilise le serveur de dev déjà ouvert sur http://localhost:5173/
  (sans jamais l'arrêter), sinon il lance lui-même `vite`. Scénarios sur le build de production (`--prod`, ou
  `meta.prod` comme `prod-build`, qui fait partie de `full`) : il réutilise un `vite preview` déjà ouvert sur
  4173 (`npm run preview`), sinon il le lance. Un serveur lancé par lui est arrêté à la fin, y compris sur
  Ctrl+C. Un port occupé par autre chose que le bon serveur Xeno Rift fait échouer les scénarios (voir
  `XR_BASE`). Le build de production exige un `dist/` : **`npm run build` avant `--prod` ou `--suite full`**
  (le lanceur prévient si `dist/` est plus ancien que les sources, seulement quand il lance `vite preview`).
- **`--prod`** : sans aides DEV, seuls `menu`, `small-screens`, `progress-ids`, `prod-build` (et `bench-shaders` en `diag`)
  tournent ; les autres sont SKIP.
- **Variables** : `XR_BASE` (URL imposée à tous les scénarios, `prod-build` compris, aucun serveur géré),
  `XR_DEV_PORT` / `XR_PROD_PORT` (autres ports),
  `XR_TMP` (dossier temporaire du profil Chrome, `D:/DevTools/tmp` par défaut), `XR_VERBOSE=1`
  (affiche aussi les `console.log` de la page), `XR_CAPTURES_REF` (référence de `theme-captures`, voir plus bas).
- **Résultat** : tableau final (scénario, PASS / FAIL / SKIP, durée, première erreur) ; code de sortie 1
  si un scénario échoue, 2 pour une option ou un scénario inconnus, 130 si interrompu.
- **Captures** : `tests/e2e/out/<scénario>/NN-nom.png` (dossier vidé au début du scénario ; avec `--repeat`,
  un sous-dossier `runK/` par passage). Un échec ajoute une capture `NN-fail.png`. `tests/e2e/out/` est ignoré
  par git.

## Suites

| Suite | Contenu |
|---|---|
| `smoke` | rapide, lancée par `npm test` (`menu`, `j1-play`, `f1-play`, `touch-controls`, `back-button`) ; chaque scénario smoke est aussi dans `full` |
| `full` | tous les vrais tests (avec assertions) |
| `diag` | mesures et diagnostics (bancs d'essai, journaux, captures de l'aperçu graphique `art-preview`, captures par thème `theme-captures`, pages d'aperçu du monde 1 : sons et musiques `audio-world1`, cinématiques et bulle `story-preview`, boss `bosses-preview`, dessins du décor `props-preview` ; durée des combats des mini-boss par une IA de test `boss-bot`) : affichent des chiffres ou des images, sans vrai verdict (sauf `theme-captures` comparé à une référence, les contrôles d'`audio-world1` et `story-preview`, et les victoires de `boss-bot`) |
| `all` | `full` + `diag` |

## Écrire un scénario

Un fichier `tests/e2e/scenarios/<nom>.mjs` :

```js
// Ce que le scénario vérifie, en une ou deux lignes.
import { assert, waitFor2dPlay, player2d } from '../lib/helpers.mjs';

export const meta = {
  title: 'Jungle 2D : course',     // obligatoire
  suites: ['full'],                 // ['smoke','full'] | ['full'] | ['diag']
  dev: true,                        // utilise __xr2d / __xr3d / __xrShell : ignoré (SKIP) avec --prod
  timeoutMs: 60000,                 // facultatif (120000 par défaut)
  viewport: { width: 740, height: 360 }, // facultatif (844x390 par défaut)
  allowConsole: [/\[engine2d\] création du rendu WebGL/], // console.error attendues (sinon échec)
  // prod: true,                    // tourne uniquement sur le build de production (vite preview)
};

export default async function (t) {
  await t.goto('?touch=1&unlock=1&stage=j1');
  await waitFor2dPlay(t);
  const x0 = (await player2d(t)).x;
  await t.key('ArrowRight', 800);
  assert((await player2d(t)).x > x0 + 100, 'Kaï doit avancer');
  await t.shot('run');
}
```

Un scénario **échoue** sur : exception ou assertion, délai dépassé, erreur de page (`pageerror`), plantage
du rendu, `console.error` non listée dans `meta.allowConsole`, `meta` invalide (signalé par `--list`). Les
avertissements console (`console.warn`, dont `[flight3d] contexte WebGL perdu`) sont affichés (dédoublonnés)
sans faire échouer. Chaque scénario a un **navigateur neuf** (GPU et shaders à froid) et une sauvegarde vide
(localStorage neuf). Le contexte est tactile (`hasTouch`) : le jeu affiche ses commandes tactiles sauf avec
`?touch=0`, et une vue en portrait déclenche l'invite de rotation (et la pause).

### L'objet `t`

| Champ | Rôle |
|---|---|
| `page`, `ctx`, `browser` | Page, BrowserContext et Browser Playwright |
| `base` | URL du jeu, avec `/` final |
| `goto(q)` | `page.goto(new URL(q, base))`, ex. `t.goto('?stage=f1&unlock=1')`, ou une page d'outil du serveur de dev : `t.goto('preview/art.html?theme=moon&view=sheet')` |
| `wait(ms)` | pause (`page.waitForTimeout`) |
| `ev(fn, arg)` | `page.evaluate(fn, arg)` |
| `key(code, ms = 100)` | appui maintenu `ms` ms (`'ArrowRight'`, `'Space'`, `'KeyJ'`, `'Escape'`…) |
| `shot(nom, opts)` | capture `NN-nom.png` dans `out`, renvoie le chemin ; `opts.clip` `{ x, y, width, height }` : une zone seulement, agrandie `opts.zoom` fois sans lissage (voir `kaiShot`) |
| `log(...)` | journal préfixé par le scénario et le temps écoulé |
| `cdp()` | session CDP (créée au premier appel, pour la page `t.page` d'alors) |
| `out`, `name`, `meta`, `prod`, `dev` | dossier des captures, nom, meta normalisée, mode |

### Bibliothèques (`tests/e2e/lib/`)

- `helpers.mjs` : `assert`, `assertEq` (égalité profonde), `assertNear`, `waitFor(t, fn, {timeout, interval,
  label, arg})` (lève une erreur avec le libellé et la dernière valeur), `waitForScreen(t, nom)`,
  `activeScreen`, `screenText`, `clickText`, `center(t, sélecteur, fx, fy)`, `readSave`, `screenButton(t, écran,
  libellé)` (bouton de l'écran affiché dont le texte vaut exactement le libellé, sinon le premier qui le contient :
  `press` et `pressScreen` passent par lui, « Réessayer » ne prend donc pas « Réessayer le combat », placé avant), et
  pour le jeu (aides DEV) `waitFor2dPlay`, `player2d`, `lasers2d`, `waitFor3dPhase`, `info3d`.
- `touch.mjs` : multi-touch CDP avec identifiants explicites. `touches(t)` renvoie `start / move / end /
  cancel / set` (chaque liste = **tous les doigts posés après l'appel**, points `[x, y, id]`) et
  `down(id, x, y) / moveTo / up(id) / tap`. `tap(t, x, y, id)` tape sans lever les autres doigts.
- `shell.mjs` : `instrument(t)` (avant `t.goto` : compteurs audio, arrière-plan simulé, `__cap`),
  `uiState`, `shellInfo`, `setHidden(t, bool)`, `cap(t, 'pause' | 'resume' | 'backButton')`, `audioStats`,
  et pour l'enchaînement des écrans et le son : `spyExitApp` / `exitCalls`, `pressBack`, `clickThen`,
  `waitPaused` / `waitResumed`, `waitIntroCard`, `waitStageShown`, `waitAudio`, `sourceRate`, `liveNodes`,
  `countTracks` / `tracks`.
- `gl.mjs` : `logContexts(t)` (avant `t.goto`) puis `contextLog(t)`, `canvases(t)`,
  `loseContext(t, 'three' | 'phaser')`, `restoreContext(t, …)`, `webglRenderer(t)`.
- Aides par domaine, à lire avant d'écrire un scénario du même genre :
  - `core.mjs` (vol, campagne, tactile, petits écrans, endurance ; sauf mention contraire, sans aides DEV,
    donc utilisable aussi sur le build de production) :
    `trackThreeScenes` + `shipPos` (position du vaisseau via le crochet `__THREE_DEVTOOLS__` de three),
    `hudFlight` / `hudPlatform`, `waitHud`, `resultDetails`, `recordToasts` / `toasts`, `press`, `nextViaHangar`
    (« Suivant » des résultats, puis le bouton de départ du hangar, « Atterrir », « Redescendre » ou « Décoller » :
    vers l'étape suivante), écran Niveaux : `selectState` (pages, monde affiché, barre du monde, flèches, et chaque
    carte par étape : page, verrou, record, étoiles), `waitSelectPage` (page d'un monde arrivée à sa place, autres
    pages masquées), `pickStage(t, id)` (amène la page de l'étape par ◀ ▶ puis touche sa carte), `stageBefore(t, id)`
    (étape qui précède `id` dans `__xrShell.info().stages` : DEV, ex. le niveau 2D avant f1), `waitPause`,
    `input` / `waitInput` / `waitInputIdle` (ces trois-là : DEV, `__xrShell` ; au repos = ni direction, `up` et
    `down` compris, ni bouton), `screenLuma`,
    `assertLayout` / `layoutProblems` / `rects` / `overlaps`, `heapMB`, `measureFps`, `gameCanvases`, `domNodes`.
  - `game2d.mjs` (plateforme ; les aides de partie exigent le serveur de dev) : `recordUi`, `armGame` (journal
    `window.__ends2d` des fins d'étape : `kind`, `reason`, `retry` = `StartAt.at` du point de reprise passé à
    `onFail`, sinon null ; l'enveloppe transmet ce point de reprise), `engine2d` / `gameInfo` / `phaserCanvases`,
    `loseGame` / `restoreGame`, `ends`, `waitFail`, `pressScreen`, `frameStats`, `assertRenders`,
    `assertPlays`, `assertFrozen`, et pour Kaï `kai2d` (visée, accroupi, hauteur du corps, descente d'étage,
    plateforme mobile), `placeKai` / `placeKaiRight` (téléporté, posé, tourné à droite), `bolts2d` (tirs en vol
    et leur vitesse), `kaiClip` / `kaiShot` (capture agrandie x3 autour de Kaï, qui ne fait qu'une quarantaine de
    pixels de haut ; `dx` décale la zone, ex. vers les tirs), `freeze2d` (scène figée le temps d'une capture) ;
    armes et bonus : `gun2d` (`__xr2d.info()` sans les tirs), `waitGunIdle` (rafale finie, plus aucun tir en
    vol : à préférer à une attente fixe, l'heure du jeu prend du retard quand les images ralentissent),
    `readyGun` (arme au repos puis remise à zéro), `recordShots` / `shotLog` / `gameClock` / `shotAngle` (journal
    de tous les tirs, image par image : arme, heure, direction, bouche du canon `x0` / `y0`, distance à la
    première image vue et distance finale, fin), `hudGun` (icône, graduations et part vide de la jauge,
    SURCHAUFFE, anneaux allumés et qui clignotent, cœurs) ;
    ennemis : `moveEnemy` / `parkEnemy` (posé ailleurs, immobile), `removeEnemies`, `enemy2d` (vie) ;
    « Réessayer le combat » : `loseFight` (vies épuisées en plein combat, voir plus bas), `progress2d`, `snapFields`
    / `snapOf`.
  - `game3d.mjs` (vol ; idem) : `recordUi` / `uiLog`, `runId` / `waitNewRun` / `waitFlying`, `assertFlying`,
    `assertNoAutoFire` (pas de tir automatique : mine posée devant la Comète, sous-pas simulés sans appui, cible
    atteignable `target.hit` exigée et aucun tir ; mine abattue ensuite, énergie froide),
    `loseFlight`, `threeCanvases` / `tagCanvas` / `assertOneLiveCanvas`, `frameLuma`, `failReason`,
    `armBootLoss` / `bootInfo` (perte du contexte au démarrage).

### Repères utiles

- Aides DEV (serveur de dev uniquement) : `window.__xr2d` (scène 2D, `teleport`, `god`, `win` (Kaï posé juste
  avant la sortie de la carte, qui démarre aussitôt : état `exit`, 2,6 s de séquence au plus ; balise de LUMA en
  j1 et j2, Comète sur la Lune ; un combat de boss est passé : arène ouverte pour de bon, sans prime ; en j3, sans
  sortie : Kaï posé dans l'arène, combat lancé et gardienne vaincue aussitôt, prime comprise : état `exit` le temps
  de sa défaite, 2,5 s), `kill`,
  `boss` (arène et boss du niveau, voir « Boss » plus bas),
  `weapon(id)` (change d'arme, jauge et cadence remises à zéro ; garde les améliorations du hangar de cette arme),
  `power('speed' | 'rapid' | 'shield')` (bonus donné comme ramassé), `info()` (arme, chauffe, surchauffe,
  améliorations du hangar de l'arme tenue `mods` (multiplicateurs `damage`, `fireRate`, `range`, `cooling`), fiche
  effective `stats` (`damage`, `rangeTiles`, `cooldownMs`, `coolRate`…), `hearts` / `maxHearts` (3 + cœurs achetés),
  `speedLeftMs` / `rapidLeftMs`, bouclier, `speedMul`, `canDoubleJump`, tirs en vol `shots`) ; dans la scène :
  `crystals`, `collectCrystal(x, y)` (cristal compté comme ramassé), `damagePlayer(x, 'hazard')` (un cœur perdu),
  `player` (`aim`,
  `crouching`, `dropThrough`, `body`, `arm` : bras armé, texture `arm-<arme>`), `gun` (arme tenue), `doors`
  (`nearIndex`), `lasers.bolts` (tirs de toutes les armes, champ `weapon`), `enemies.list` (`hp`), `items.powers`
  (bonus sortis d'un bloc), `parsed.bonus` (contenu des blocs), `movers.list`, `grid` et `layer` pour poser une
  tuile (voir `aim-crouch-drop`), `exit` (sortie du niveau : `kind` `'beacon'` | `'ship'`, `launched`,
  `approachX` / `feetY` : où `win` pose Kaï ; `j1-play` mesure la séquence sur l'horloge de la scène ; la balise
  se déclenche dans toute la colonne de son faisceau, `j1-ctx-exit` y téléporte Kaï ; case dans `parsed.exit`),
  `arrival` (arrivée au départ d'un niveau qui a `LevelData.start` : j1 `kind` `'ship'`, j2 et j3 `'beam'` ; `landed`, `done`,
  `comet.ship` ; la scène reste dans l'état `'enter'`, commandes coupées, 0,7 s au plus, puis `'play'` :
  `waitFor2dPlay` l'attend ; la Comète repart à vide en ≈ 3 s, son `takeoff` ; rien depuis un point de contrôle,
  `?at=boss`), `glyphs` (glyphes 'G' de la ruine de j1 : `list[i].lit`, `on` : image allumée en fondu) ; monde 1,
  4b (voir « Niveau 2 du monde 1 », « Gardienne du monde 1 » et « Réessayer le combat ») : `mushrooms`, `trunks`,
  `sporeRain`, `spores`, `shadowPasses`, `levelEvents.events`, `npc`, `fightSnap`, `fightRetry`),
  `window.__xr3d` (`info` : dont `shield` / `maxShields` (3 + bouclier renforcé),
  `boosting` (turbo en marche), `boostHeat` / `coolRate` (chauffe du turbo et refroidissement de l'énergie par
  seconde, module Turbo compris), et pour le combat (plan 03, 3b) `gunLevel` (0 canon léger, 1 à 3 mitrailleuse),
  `heat` / `overheated` (jauge d'énergie, chauffée par le tir et le turbo), `range`
  (portée, u), `shotsActive` (tirs en vol), `shotsFired` (tirs partis depuis le départ), `lastMuzzle` (bouche du
  dernier tir : 0, ou 0 / 1 en alternance pour la mitrailleuse), `target` (`{ type: 'rock' | 'fighter' | 'mine' |
  'swarm', dist, hit }` ou null), `enemies` (`fighter`, `mine`, `swarm` vivants, `killed` : abattus par les tirs),
  `orbsActive`, `waves`, `crystals` (ramassés pendant ce vol) / `crystalsTotal` / `crystalsActive` (en vol, pas encore
  ramassés), `crystalsDropped` (cristaux lâchés depuis le départ : ils apparaissent au sous-pas même de la
  destruction), `rocksDestroyed`, `points` (rochers, ennemis, cristaux), `drawCalls` (`renderer.info.render.calls`
  de la dernière image), `geometries` / `textures` / `programs` (`renderer.info`) ; `autopilot` (tient TIR quand la cible
  visée peut être touchée ; turbo loin des portails, lancé sous 5 % d'énergie et relâché à 60 %), `win`, `fail`, `advance(s)` (s secondes de jeu simulées dans la même tâche,
  renvoie `info()` ; `advance(1 / 60)` : un sous-pas, voir `__xrTrace` de `flight-combat`), `timeScale` (0 à 8 ; 0 :
  jeu figé, image toujours dessinée, `advance` avance encore : captures sans que le vol continue), `bench`,
  `spawn(type, distance = 60, variant)` (chasseur, mine ou essaim de 6 posé devant la Comète, sur sa ligne ; renvoie
  le nombre placé ; un chasseur se tient à max(30, distance) et tire après 42 u de trajet ; `variant` 0..1, au
  hasard sans lui : orientation de l'essaim et phase de son ondulation comptée depuis la pose, côté du virage du
  chasseur, clignotement de la mine : à fixer dans un test), `fire(on = true)` (TIR tenu : sans lui, ni touche ni
  bouton, rien ne tire), `settle()` (Comète remise sur la trajectoire idéale à son z, sans vitesse latérale, énergie
  froide, turbo coupé, orbes ennemies retirées : à appeler dans la même tâche que `spawn` et la trace, après une trace jusqu'à un
  avancement fixé (`i.progress >= …`), sinon l'issue dépend du vol en temps réel qui précède, plus lent à froid :
  endroit du parcours, rochers, chauffe)), `window.__xrShell` (`info` : `phase`, `screen` (écran affiché), `loadout` (`equipped`, `owned`,
  `skills`), `play` (équipement effectif complet : améliorations `mods` par arme, `maxHearts`, `ship` :
  `maxShields`, `boostDrainMul` (chauffe du turbo), `boostFillMul` (refroidissement de l'énergie), `gunLevel`,
  `crew` : équipage à bord), `stages` (chaque étape de `STAGES`, dans l'ordre :
  `id`, `kind`, `world`, `cleared` (réussie), `unlocked` (ouverte, mode test compris)), `crystals` (réserve), `weapon`
  (l'arme de la session) ; `cap` ; `addCrystals(n)` : ajoute des cristaux à la réserve, enregistrée, sans redessiner l'écran
  affiché : l'appeler avant d'ouvrir le hangar ; `radio()` : radio de LUMA, voir plus bas). `__xr3d` disparaît quand la
  partie est détruite : toujours tester sa présence. `lasers2d` (`helpers.mjs`) ne compte
  que les traits du laser (texture `laser`) : pour les autres armes, `__xr2d.info().shots` ou `recordShots` /
  `shotLog`. Le HUD suit le jeu à l'image suivante : après `power()` ou `weapon()`, attendre (`waitFor`) avant
  de lire le HUD. Un ennemi se déplace avec `moveEnemy` (positions précédentes du corps Arcade recalées : sinon
  un ennemi endormi, réveillé à sa nouvelle place, repart d'autant dans l'autre sens).
- Paramètres d'URL (actifs aussi en production) : `?stage=j1|j2|j3|f1|m1|f2` (lancement direct, sans intro),
  `?unlock=1` (mode test, enregistré dans la sauvegarde : 4 armes et double saut, conditions du hangar levées mais
  pas les prix), `?weapon=laser|machinegun|shotgun|rifle` (arme de la session ; inconnue : message et laser),
  `?touch=1` / `?touch=0`. Serveur de dev seulement : `?at=boss` (`ModeHooks.startAt`) : chaque niveau 2D lancé part
  du point de contrôle d'avant son arène (ignoré sans arène).
- Sauvegarde (`localStorage` `xeno-rift-save-v1`) en version 2 depuis le plan 03 : `crystals`, `upgrades` (par arme),
  `ship` (`gun`, `shield`, `boost`), `extraHearts`, `crew`, `blueprints`, `story` (`seen` : marques de l'histoire,
  absent des anciennes sauvegardes) en plus de `unlocked`, `best`, `settings`, `loadout`. Une sauvegarde version 1
  écrite à la main est migrée (pas remise à zéro), réécrite en version 2 au premier enregistrement ; pour poser des
  achats avant le chargement, écrire une version 2 (voir `patchSave` de `small-screens`). Progression par
  identifiants (plan 04) : une étape est réussie si son id figure dans `best`, ouverte si c'est la première, une
  réussie ou la suivante d'une réussie (mode test : toutes) ; JOUER lance la première ouverte non réussie (sinon la
  dernière). `unlocked` (index hérité) est encore lu et écrit mais ne décide plus rien. Les récompenses des étapes
  réussies (plan du mitrailleur pour f1) sont réappliquées au chargement, et enregistrées au changement suivant.
- Clavier : flèches / WASD, Espace = saut (2D) et turbo (vol), K = saut, Haut/W = haut (visée, portes ; ne fait
  plus sauter), Bas/S = accroupi (+ Saut : descente d'une plateforme `=` ou mobile), J/X/F = tir, Maj = turbo,
  Échap/P = pause, Entrée/Espace passent l'intro.
- Écrans : `.screens [data-screen=title|select|options|intro|results|hangar|fail|end|error]` ; pause :
  `.overlay.pause.is-open`, bouton `.btn-primary` (REPRENDRE) ; HUD : `.hud-pause`, jauge `.hud-heat[data-weapon]`
  (`--heat-step` : graduations, `.is-over` : SURCHAUFFE), anneaux `.hud-powers .hud-power.is-on[data-kind=speed|
  rapid|shield]` (`.is-ending` : fin proche), cœurs `.hud-hearts .hud-heart` (`.is-empty`), boucliers du vol
  `.fl-pips .fl-pip` (`.is-empty`), jauge d'énergie de la Comète `.fl-energy` (mêmes classes internes que
  `.hud-heat` : `data-level` cool | warm | hot, `data-gun` light | machinegun, `--heat-step` = 1 s de tir continu,
  `.is-over`, part vide `--heat-off` de `.heat-grad` ; en plus libellé `.fl-label` et repère du turbo `.fl-turbo`
  dans `.heat-head`, `.is-boost` turbo en marche ; `hudFlight` de `core.mjs` : `energy`, `boosting`, `over`), cristaux du vol `.fl-crystals .hud-num`. Résultats : ligne `.detail--bank` (« Réserve », gain `.detail-gain` « +N
  cristaux », total `.detail-value`), récompenses nouvelles `.detail--reward[data-reward="<kind>:<id>"]` (libellé
  « Plan », « Compétence », « Équipière »). Niveaux : bouton `.select-hangar` (réserve en sous-titre), total
  `.select-total-n`, une page par monde `.select-page[data-world]` (`.is-current` : affichée ; les autres masquées
  par `visibility`), barre du monde `.select-world-name` et `.select-world-n` (étoiles du monde), flèches
  `.select-prev` / `.select-next` (`disabled` au bout), cartes `.card[data-stage="<id>"]` (`.is-locked`) ; un
  glissement horizontal (doigt ou souris) change de page sans lancer la carte touchée, ← → aussi. Hangar : réserve
  `.hg-wallet-n`, onglets `.hg-tab--bench|ship|kai` (`aria-selected`), armes de l'Établi
  `.hg-weapon[data-weapon]` (`aria-checked` : choisie), cartes `[data-item="<HangarItemId>"]` (niveau :
  `.hg-pip.is-on`, notes `.hg-note`, `.hg-max` au niveau max), achat `[data-buy="<HangarItemId>"]` (`.is-locked` et
  `aria-disabled` si refusé ; le toucher fait alors trembler la carte (animation d'id `hg-shake`), clignoter sa note
  de verrou (`hg-blink`) et affiche la raison dans le message du hangar `.hg-msg.is-on`, jamais dans un toast),
  confirmation
  `.hg-confirm.is-open` puis `.hg-confirm .btn-primary` (Acheter ; le retour la ferme d'abord), équipement
  `[data-equip="<arme>"]` (`aria-pressed`), départ `.hg-depart` (absent depuis les Niveaux), aperçu `.hg-stage` et
  son canvas `.hg-canvas-el` (chargé à la demande). Identifiants des achats : `weapon.<arme>`,
  `upgrade.<arme>.<damage|fireRate|range|cooling>`, `ship.gun|shield|boost`, `kai.heart`.
- Contrôles tactiles : `.xr-dpad` = stick rond fixe à 8 directions (secteurs d'angle autour de son centre,
  `src/input/stick.ts` : ← → jusqu'à 30° de l'horizontale, diagonales jusqu'à 65°, ↑ ↓ au-delà ; viser avec
  `center(t, '.xr-dpad', fx, fy)`, ex. 0.8, 0.5 = →, 0.5, 0.12 = ↑, 0.78, 0.78 = ↘), `.xr-jump`, `.xr-fire` ; en
  vol : joystick flottant sur la moitié gauche (`.xr-stick-zone`), gros `.xr-shoot` (TIR, en bas à droite, taille
  de SAUT) et `.xr-boost` (TURBO, juste au-dessus, taille du TIR 2D) ; plus de réglage « Tir manuel » (retiré le
  29/10/2026 : un ancien `manualFire` de la sauvegarde est ignoré). Couches :
  `#touch-root .xr-tc-layer`. Réglages (rubrique Commandes des Options) : `--xr-scale` et `--xr-tc-opacity`
  sur `#touch-root`, classe `xr-touch--lefty` en mode gaucher (stick et joystick à droite, boutons à gauche) ;
  pour les poser avant le chargement, modifier `settings` de la sauvegarde (`touchSize`, `touchOpacity` :
  0..2, `leftHanded`) puis `t.goto` (voir `small-screens`).
- Scénarios des contrôles 2D (à lire avant d'en écrire un du même genre) : `touch-controls` (smoke : stick
  8 directions, glissements, doigts multiples, joystick + TURBO + TIR), `aim-crouch-drop` (visée haute et
  diagonale, éventail de la pompe, accroupi, reptation, plafond bas posé par le test, descente d'une plateforme `=`
  puis de la plateforme mobile de la Lune, portes de la Jungle (128, 5) ↔ (144, 9), au clavier et au stick),
  `touch-options` (rubrique Commandes : anciennes sauvegardes, réglages abîmés, persistance, Pause, gaucher en
  2D et en vol, ancien réglage « tir manuel » ignoré), `small-screens` (place du stick et des boutons selon les réglages, carte d'intro, HUD avec trois
  bonus, HUD à 5 cœurs et 5 boucliers, ligne Réserve des résultats, hangar de 844x390 à 568x320 : chaque carte
  amenée à l'écran, aperçu d'au moins 100x60 px, première amélioration de l'Établi entière sans défiler, cibles
  tactiles, confirmation, mention « Tess à l’établi » en mode test (équipage posé dans la sauvegarde), captures aux 4
  tailles ; aussi en `--prod`, sans ce qui demande les aides DEV) ; `art-preview` (diag) capture `preview/art.html` (Kaï et
  son bras, poses accroupies, portes, stand de tir des 4 armes) pour une revue à l'œil.
- **Refonte sans changement visible** : `theme-captures` (diag, ≈ 45 s) capture tout ce qui dépend du thème 2D de façon
  reproductible : `preview/art.html` (planche, stand de tir, 3 vues du monde, avec avance rapide de la parallaxe) de
  chaque thème, avec `Math.random` semé et une horloge virtuelle (1/60 s par image, `performance.now` et
  `requestAnimationFrame` remplacés, pages `preview/` seulement) figée à l'image 90, textes Phaser masqués (police
  chargée à un moment variable), plus l'empreinte des pixels de chaque texture ; puis le choix du niveau (une capture
  par page : `ui-select-w<monde>`) et la carte d'intro de chaque étape de `STAGES` (lu dans `/src/core/stages.ts` ;
  carte touchée par `pickStage`), avec `animations: 'disabled'` et le fond des menus masqué (ses
  calques animés varient d'une unité sur quelques pixels). Il écrit `hashes.json` dans son dossier de captures.
  Usage : une exécution avant la refonte, copier `tests/e2e/out/theme-captures/` hors de `out/` (vidé à chaque
  passage), puis relancer après avec `XR_CAPTURES_REF=<copie>` : il échoue sur le moindre pixel ou la moindre
  texture différente, et sur une capture présente d'un seul côté, et écrit `diff-<capture>.png` (pixels différents
  en rouge).
- **Pages d'aperçu du monde 1 (plan 04, diag, serveur de dev)** : `audio-world1` (`preview/audio.html`, vrai
  moteur instrumenté : les 18 effets du monde 1, rafale au-delà de 24 voix et retour exact au graphe fixe ;
  musiques `boss`, `guardian` (intensités 0 à 2 prises au début de mesure suivant, sans relancer le morceau),
  `story` ; mesures hors temps réel : échoue sur une saturation, un son muet ou des notes perdues ; crochet
  `window.__audioPreview`), `story-preview` (`preview/story.html` : prologue et libération figés par
  `&t=…&hold=1` en 844x390 et 640x320, toucher sur l'image, bips, page cachée, Passer = `'skipped'`, fin =
  `'ended'`, `destroy()` sans reste ; crochet `window.__story`), `bosses-preview` (`preview/bosses.html` : Blob-roi,
  Scarabée-titan et ses cailloux, méduse-baleine, avec et sans leurs boîtes `&boxes=1`), `props-preview` (`preview/props.html` :
  champignon, barrière, glyphes, Tess et sa capsule, tronc, branches / lianes / passerelles, petite scène). Les
  deux derniers ne font que capturer, pour une revue à l'œil. À relancer après une retouche des sons, des
  cinématiques ou des dessins du monde 1.
- Scénarios des armes et des bonus (plan 02) : `weapons` (arme de la session équipée au hangar en mode test,
  gardée d'une étape à l'autre et oubliée hors mode test ; équipement de la sauvegarde : anciennes sauvegardes,
  valeurs abîmées, double saut appris ; puis pour chaque arme : projectiles par appui, vitesse, portée, son, visée,
  dispersion, surchauffe, refroidissement et reprise du tir, dégâts sur un marcheur et un blindé ; ennemis
  déplacés devant Kaï avec `moveEnemy` ; sons notés en enveloppant `__xrShell.audio.sfx`), `powerups` (double
  saut selon le mode test, vitesse, cadence, les deux, durée et anneaux qui clignotent, bouclier, vie perdue,
  HUD de 844 à 621 px avec 53 cristaux, blocs bonus de la Jungle et de la Lune). Valeurs attendues recopiées
  des fiches : `SPECS` en tête de `weapons.mjs` (une ligne par arme, parcourue pour les tests par arme),
  `SPEED_MUL` / `DURATION_MS` de `powerups.mjs` ; à mettre à jour avec `src/core/weapons.ts` et
  `src/game2d/constants.ts` après un réglage.
- **Radio de LUMA (plan 04)** : `luma-radio` (full, ≈ 3 min 20) joue j1 sur une sauvegarde neuve, au clavier :
  messages du départ (histoire brouillée, puis « courir et sauter » en attente ; bulle sans `pointer-events`, texte
  complet posé une fois dans le nœud `aria-live`, bips `lumaBip` espacés de 125 ms au moins, texte du clavier ; Kaï
  immobile : le premier marcheur reste dans son enclos 35-40), conseil du premier marcheur avant le contact, à pleine
  course (→ et saut simulés dans la page : `tuto-stomp`, urgent, passe devant « courir et sauter » ; contact relevé
  sur `postupdate`) et à 2,5 colonnes/s (Kaï avancé d'une colonne toutes les 400 ms),
  première surchauffe → tutoriel (une fois, seconde surchauffe une fois la radio au repos), tutoriel complet dans
  l'ordre du niveau (Kaï posé dans chaque fenêtre, sur le point de contrôle 78, devant la porte du rocher puis ↑ vers
  la ruine et ses glyphes, dans l'arène : chaque message demandé une fois par `LevelEvents.say`, espionné, puis joué
  sans être chassé de la file ; revenir dans une fenêtre ne la rejoue pas), pause et page cachée qui figent
  l'écriture, file de 2 messages (le plus ancien chassé), file vidée à la fin de l'étape et marque `tutorial-j1`
  enregistrée ; puis tutoriel muet avec cette marque (fenêtres franchies par téléportation : sautées), et mise en page
  de 844x390 à 640x320 (3 et 5 cœurs, trois bonus, messages de l'interface : un seul sous la bulle, au-dessus de Kaï,
  glissement de `top` quand la bulle paraît ou se cache) avec captures ; enfin j3 (radio brouillée de bout en bout :
  Kaï posé dans chaque fenêtre, dans l'ordre du niveau, chaque message demandé une fois, affiché en bulle
  `data-mood="scrambled"` avec son texte du clavier, aucun chassé ; captures le long du niveau). Les messages, leurs fenêtres et leurs
  déclencheurs (`overheat`, `boss`, `checkpoint` : premier point de contrôle, `door` : première porte) sont dans
  `RADIO` (`src/core/story.ts`, `keys` : texte du clavier, `urgent` : passe devant les messages en attente, pas devant
  un dialogue commencé ; `interrupt` : dialogue lancé par une action de Kaï, déclencheur `rescue` de j2, qui remplace
  aussitôt le message de la bulle, sans trou, et fait oublier les autres ; `castaway` : muet une fois ce naufragé dans
  l'équipage ; vérifiés par `j2-play`) et
  `LevelData.radio` ; `npm run check-levels` simule la file (au rythme de référence : aucun message chassé, tutoriel
  ouvert au plus 3 s après le passage de Kaï ; à pleine course, en note). Repères : `__xrShell.radio()` (`phase` `idle | open | typing | hold | gap`, `current`, `text` (texte
  affiché : `keys` sans commandes tactiles), `waiting`, `played` depuis le début de l'étape, `paused`,
  `typing`) ; message poussé comme le ferait un mode :
  `__xr2d.scene.session.hooks.hud.radio(id)` (identifiants : `RADIO` de `src/core/story.ts`, lisible dans la page par
  `import('/src/core/story.ts')`) ; fenêtres du niveau `__xr2d.scene.levelEvents.windows` (`id`, `col0`, `col1`,
  `state` 0 en attente, 1 jouée, 2 sautée) ; bulle `.hud .xr-bubble--radio` (`data-speaker`, `data-mood` : `scrambled`
  pour la radio brouillée, `.is-hidden`, `.is-paused`, lettres écrites `.xr-bubble-text > span.is-on`, texte complet
  `.xr-sr`) ; messages de l'interface décalés sous la bulle, un seul à la fois : `.toasts.is-below-radio`. Les sons
  `radioOpen` et `lumaBip` s'enregistrent en enveloppant `__xrShell.audio.sfx` dès le chargement (script d'init : le
  message de départ s'ouvre avant `waitFor2dPlay`).
- **Boss (plan 04)** : les boss 2D se battent en touches (point 20 : 4 pour le Blob-roi et le Scarabée-titan, phase 2
  après 2 ; une touche = un tir ou un saut sur le point faible exposé, quelle que soit l'arme ; point faible refermé
  ensuite jusqu'à la fenêtre suivante ; les plombs de la salve qui vient de toucher sont absorbés : `hitBy` rend 1
  sans seconde touche pendant 120 ms). `boss-bot` (diag, ≈ 2 min 05) : une IA de test simple (commandes posées à la
  place de `hooks.input` avant chaque image) gagne 3 combats contre le Blob-roi (j1) puis 3 contre le Scarabée-titan
  (j2, ennemis du niveau retirés) au laser, sans amélioration ni double saut ni mode dieu, et note la durée (horloge
  de la scène), les coups reçus, les tirs et les touches par fenêtre (noyau aplati, titan sur le dos) : à relancer
  après un réglage (`src/game2d/engine/bosses/blobKing.ts`, `beetleTitan.ts` ; `BOT_RUNS=n` pour n combats par
  boss, `BOT_BOSS=blobKing|beetleTitan` pour un seul, `BOT_MAX_S` pour un essai court, `BOT_TRACE=1` : relevé des
  charges et étourdissements du titan). Mesuré : Blob-roi 12,2 s, titan 16,5 s (14,1 à 17,7 s).
  `boss-titan` (full, dev, ≈ 1 min 10) joue l'arène du Scarabée-titan de j2 depuis `?stage=j2&at=boss` (ennemis du niveau
  retirés ; on entre en sautant sur le champignon 207, contre la première borne) : arène 206-221 (16 colonnes), titan
  en 213, champignons 207 et 220, butées de la charge devant eux (`info().stops`), aucun renfort, textures
  `boss-beetle-titan`, `-cracked`, `boss-titan-rock` ; barrières, sons, musique, barre « Scarabée-titan » en 4 crans ;
  carapace (contrat `hitBy` : 0 partout debout, même à hauteur du ventre, image « tir renvoyé » 6 en marche ; tir du
  `ShotPool` arrêté sans effet) ; rebond sur la carapace sans cœur perdu ; charge (Kaï posé devant le champignon
  opposé, au début d'une marche : annonce tête basse avec raclements, charge vers Kaï à 600 px/s qui blesse au sol et
  pas au-dessus, relevée sur `postupdate`, choc contre le champignon qui s'écrase sans rebond compté, sons `boost`,
  `crash`, `quake`) ; sur le dos (ventre touché : 1 touche, plomb de la même salve sur le dôme absorbé, clignotement
  calé ; point faible refermé ensuite (0, relevé sur `postupdate` après 120 ms) et titan relevé en 450 ms ; saut sur
  le ventre au choc suivant : seconde touche, grand rebond, aucun cœur perdu, d'où la phase 2 : colère depuis le dos,
  carapace fendue, clignotement calé, barre « Phase 2/2 ») ; phase 2 (charge à 760 px/s ; Kaï posé derrière le titan
  pendant la charge, à 190 px du point de choc : 3 cailloux annoncés par une marque sur leur point d'arrivée pendant
  850 ms, caillou encore caché, puis tombés d'au-dessus de la vue ; celui visé sur Kaï le blesse (il le recouvre à
  l'image du cœur perdu), celui visé sur le titan assommé est annoncé sur son dos par une marque dessinée au-dessus de
  lui et s'y arrête ; au choc suivant, tir réel de Kaï debout côté dôme : une touche) ; vie perdue pendant les
  cailloux du choc suivant (retour au K ; titan à neuf, cailloux rangés et cachés à la remise à neuf même, relevée en
  enveloppant `reset`) ; victoire (fuite, image 7 de la carapace fendue, message « Scarabée-titan s’enfuit ! »),
  balise, résultats avec la prime, textures libérées ; enfin « Réessayer le combat » depuis j2 joué du début (partie
  H, paragraphe « Réessayer le combat »). Repères (titan) : `info()` : `act` (`intro | walk | windup |
  charge | stunned | recover | rage`), `frame`, `shownFrame` (image affichée : 6 pendant un tir renvoyé),
  `texture`, `facing`, `flashing`, `visible`, `speed`, `open` (fenêtre de touche ouverte), `charges`, `stuns`,
  `deflects`, `scrapes`, `mushHits`, `stops`, `rocks` / `falling` / `rocksDropped` ; champs privés lisibles :
  `rocks[i]` (`phase` `off | wait | warn | fall`, `x`, `y`, `floor`, `img`, `mark`), `rockFloor(r)` (point
  d'arrivée : dos du titan s'il est dessous), `touchAt`, `actMs`, `stopLeft` / `stopRight`, `glow`, `sheet`,
  `sprite`, `spot`.
  `boss-mini` (full, dev, ≈ 1 min 30) joue l'arène du Blob-roi de j1 depuis `?at=boss` : renforts cachés dès
  le chargement, barrières fermées à l'entrée (grille ET calque), sons, musique, barre de boss en 4 crans, caméra
  calée et centrée sur l'arène (glissement relevé image par image sur l'événement `postrender` du jeu : pas de plus
  de 60 px), noyau seul vulnérable (contrat `hitBy` : 1 touche sur le noyau aplati, plomb de la même salve absorbé,
  noyau refermé ensuite et boss relevé en 250 ms ; tirs du `ShotPool` lancés par `scene.lasers.fire` avec la fiche de
  l'arme : pas d'attente d'un tir clavier qui raterait l'image aplatie), clignotement de dégât (copie additive
  `boss.glow`) calé sur le boss dès le coup, rebond sur la couronne sans mode dieu (aucun cœur perdu ; détecté sur
  `postupdate` de la scène par `stompGraceMs`), ondes au sol, seconde touche par un tir du `ShotPool` : phase 2 et
  petits blobs (hors score), vie perdue (retour au K, boss à neuf), victoire puis course jusqu'à la balise, résultats
  « Boss vaincu +2 000 » sous le score (panneau entier, sans défilement, à 844x390 et 640x320), textures libérées après
  la session, perte du contexte en plein combat (restauré : le combat reprend ; définitive : « Réessayer le combat »),
  et « Réessayer le combat » depuis j1 joué du début (paragraphe suivant). Repères : `__xr2d.boss` : `info()` (`id`, `name`, `state` `wait | fight | beaten | gone`, `life`,
  `maxLife`, `phase`, `phases`, `x`, `y`, `beaten` (prime acquise), `arena` (`state` `open | closed | done`, `col0`,
  `col1`, `row`, `left` / `right` : intérieur en px, `camBlend` : 1 = caméra calée), et pour le Blob-roi `act`
  (`intro | idle | squash | leap | flat | rise | rage`), `frame`, `texture`, `facing`, `flashing`, `open`,
  `waves`, `visible`), `enter()` (Kaï posé sur la première case libre après la première borne, champignon collé à
  la borne sauté : le combat commence à l'image suivante), `hit(n = 1)` (touches directes pendant le combat, renvoie
  les touches restantes), `win()` (vaincu comme par les tirs : fuite, barrières ouvertes, prime). Dans la scène :
  `arena`, `boss` (`hitBy(x, y)`, `hurts`, `takeDamage` ; champs privés lisibles : `waves`, `spot`, `touchAt`),
  `bossBeaten`, renforts `enemies.list[i].summoned` (en fin de liste), `enemies.summon`.
  Barre du HUD : `.hud-boss.is-on` (`data-phase`), `.boss-name`, `.boss-phase` (« Phase 1/2 »), `.boss-fill`
  (`scaleX` = vie), `.boss-mark` (repères : de phase, et `.boss-mark.is-step` : un cran par touche) ; résultats : prime sous le score `.results-bonus`
  (`.results-bonus-label`, `.results-bonus-value`). `small-screens` vérifie la barre à
  640x320 (commandes moyennes, grandes, gaucher), `j1-ctx-fallback` l'arène et le clignotement de dégât en rendu
  Canvas, `campaign-flow` finit j1 par le boss (prime sur les résultats), `j1-play` vérifie que `win()` passe le combat ;
  `small-screens` vérifie aussi la barre du titan (nom le plus long) à 640x320, grandes commandes.
- **Gardienne du monde 1 (plan 04, étapes 10 et 11)** : la méduse-baleine de j3 (`?stage=j3`, 186 colonnes ; arène
  162-179 de 18 colonnes, champignons 165 et 176, passerelles 167-168, 170-171, 173-174 ; un seul point de contrôle,
  159, juste avant elle : `?stage=j3&at=boss` y fait partir ; `LevelData.ending: 'guardian'` : pas de sortie, sa défaite
  termine le niveau) se bat en 6 touches, 2 par phase, sur son seul cœur (corps insensible : `hitBy` 0 ; inoffensif
  hors plongée). `boss-whale` (full, dev, ≈ 1 min 50 ; sauvegarde neuve sans mode test) : départ de j3, arrivée par
  le faisceau et radio brouillée (bulle `data-mood="scrambled"`), méduse du décor visible ; puis `?at=boss` (départ au
  point de contrôle 159, le seul, sans arrivée) : gardienne cachée en attente (`visible` faux), méduse du décor `bg-jungle-creature-looming` visible puis cachée pendant le combat et revenue à la
  remise à neuf, 2 guêpes de réserve (`enemies.list[i].summoned`, `kind` `'f'`) ; entrée : musique `guardian` puis
  `musicLevel(0)` (sons et musiques notés en enveloppant `__xrShell.audio.sfx`, `music` et `musicLevel`), barre
  « Méduse-baleine » en 6 crans « Phase 1/3 », arrivée d'en haut ; phase 1 : tentacule abattu annoncé 800 ms par une
  marque au sol sous Kaï (`boss.slamMark`), qui blesse, spores lâchées sur leur tache au moins 950 ms après (enveloppe
  de `boss.dropSpore`), jupe toujours au-dessus de la tête de Kaï au sommet d'un saut hors plongée (relevé sur
  `postupdate`), cœur au plus bas à 3 tuiles du canon (centre à 230 px du sol), ouvert 3 s, cœur fermé et corps : 0 ;
  corps inoffensif hors plongée (gardienne calée contre la première borne : saut depuis la passerelle sous elle et
  rebond sur le champignon 165, Kaï dans son corps, aucun cœur perdu ; `scene.mushrooms.bounces`) ; tache d'une spore
  au-dessus du champignon (`boss.sporeBaseX`, `boss.announceSpore(0)`, `boss.spots`) posée sur son chapeau et effacée
  quand la spore y éclate (`scene.spores.spores`) ;
  touches : tir réel ↑ + J sous le cœur (clignotement `boss.heartGlow` calé dès la touche), salves du `Gun` de Kaï
  (`scene.gun.emit()` avec `player.aim` posé : diagonale, pompe vers le haut ; spores en l'air et à venir retirées
  avant, `boss.clearSpores()` : une spore lâchée au-dessus de Kaï arrêterait le tir) ;
  phase 2 : `musicLevel(1)` au début de la colère, 2 guêpes à 110 px du sol (hors score), balayage à mi-hauteur
  (bout à 68 px du sol, contrat `hurts` : debout touché, accroupi et en saut non ; Kaï accroupi ↓ : aucun cœur perdu),
  cœur qui s'ouvre (image 1) touché dans son bouton, sous le petit point faible de l'image (ouvert, il compte en entier) ;
  phase 3 : `musicLevel(2)`, plongée annoncée 1 s par son ombre au sol (`boss.diveShadow`), qui blesse dessous (sol et
  passerelle) et pas à côté, cœur ouvert 4 s ; vie perdue (retour au K, gardienne à neuf et cachée, guêpes rangées,
  musique du niveau ; nouvel essai : `guardian` puis `musicLevel(0)` explicite) ; défaite (`__xr2d.boss.win()` : état
  `exit`, image 2, cri, elle s'élève, Kaï figé au sol ; `finishLevel` 2,5 s plus tard sur l'horloge de la scène, au plus
  2,62 s) → résultats « Compétence : double saut » (`.detail--reward[data-reward="skill:doubleJump"]`) et « Boss vaincu
  +5 000 », textures libérées ; puis j1 (même sauvegarde) : double saut actif et réel (son `doubleJump`, plus haut qu'un
  saut seul) ; enfin « Réessayer le combat » (partie H, paragraphe suivant). `j3-ctx-boss` (full, dev, ≈ 45 s ;
  `?at=boss` : départ au seul point de contrôle, juste avant l'arène) : perte du contexte en plein combat (figé, puis
  restauré : le combat reprend, aucun échec), puis perte définitive pendant la défaite (figée en `exit`, étape gagnée
  une seule fois ≈ 5 s plus tard par `finishExitNow`, prime du gardien, record de j3 ; REJOUER : jeu Phaser neuf),
  enfin perte définitive en plein combat (« Réessayer le combat », reprise au K). Repères (gardienne) :
  `__xr2d.boss.info()` : `x` / `y` = centre du corps, `act` (`intro | drift | slam | sweep | dive | heart | rage`, `none`
  vaincue), `sub` (sous-étape : tentacule 0 annonce, 1 frappe, 2 au sol, 3 retour ; balayage 0 annonce, 1 balayage,
  2 retour ; plongée 0 annonce, 1 descente, 2 au sol, 3 remontée ; cœur 0 descente, 1 ouvert, 2 fermeture,
  3 remontée), `frame` (corps : 0, 1 blessée, 2 défaite), `heartFrame`, `heartK` (descente du cœur 0..1), `heartX` /
  `heartY` (centre), `open`, `shut`, `skirtY` (bas de la jupe), `groundY`, `hoverY`, `visible`, `alpha`, `attack`
  (`none | slam | sweep`), `hurting`, `tip` (bout du tentacule), `slams`, `sweeps`, `dives`, `heartsOpened`, `spots`,
  `spotsShown`, `sporesDropped`, `waspsCalled`, `flashing` ; champs privés lisibles : `slamMark`, `diveShadow`, `heart`,
  `heartGlow`, `spots[i]` (`img`, `x`, `ms` depuis l'annonce, `dropped`), `clock`, `actMs`, `atkParts`.
- **« Réessayer le combat » (plan 04, étape 12, choix 7)** : une partie 2D perdue en plein combat de boss (plus de
  vies, ou « Liaison graphique perdue » pendant que l'arène est fermée) appelle `onFail(motif, { at: 'boss', snapshot })`
  ; l'écran d'échec propose alors « Réessayer le combat » (`.fail-fight`, `<button>` principal, seul sur sa rangée)
  avant « Réessayer » (tout le niveau) et « Menu » ; le motif reste dans `.fail-reason`. L'instantané
  (`scene.fightSnap`, forme `FightSnapshot` de `src/game2d/engine/snapshot.ts`) est noté quand Kaï allume le K d'avant
  l'arène (ou à l'entrée dans l'arène s'il l'a contourné : ce K est alors allumé sans message au nouvel essai,
  `Items.lightCheckpoint`) ; la partie reprise (`scene.fightRetry`) part de ce K, sans
  arrivée, 3 vies, cœurs pleins, boss à neuf, avec cet état : temps, cristaux (compte et cristaux pris), blocs « ? »
  frappés (tuile redessinée), bonus sortis d'un bloc et pas encore pris (flottants), points de contrôle allumés, ennemis
  de la carte morts, fenêtres et déclencheurs de `levelEvents` (messages de LUMA et événements du décor déjà joués ne
  rejouent pas ; pluie de spores éteinte), Tess secourue, troncs couchés, bonus en cours ; score sans prime de vies.
  Aides de `game2d.mjs` : `loseFight(t, label)` (à chaque vie : `__xr2d.boss.enter()`, combat commencé, puis
  `__xr2d.kill()` ; renvoie le motif de l'écran d'échec), `progress2d(t)` (état de la partie relevé par le test sous
  la forme d'un instantané, plus `sid`, `state`, `x`, `lives`, `hearts`, `retry`, `powerKinds`, le K d'avant l'arène
  `k` et une copie de `scene.fightSnap`), `snapFields(relevé)` / `snapOf(instantané)` (champs comparables).
  Scénarios : `boss-mini` F2 (perte définitive en plein combat : bouton, puis reprise au K dans un jeu Phaser neuf) et
  G (j1 du début : cristaux, deux blocs « ? », deux ennemis, bouclier, K ; vies épuisées → bouton ; reprise : état
  noté rendu, HUD, aucun message rejoué ni « Point de contrôle ! » ; de nouveau perdu → « Réessayer » simple : début
  du niveau avec l'arrivée, rien de gardé ; puis combat repris et gagné : score sans prime de vies) ; `boss-whale` H
  (j3 du début : cristaux avant la pluie, ennemis, pluie jouée, K 159 ; reprise : gardienne à neuf et cachée, méduse
  du décor, pluie non rejouée ; défaite : score sans prime de vies ; Rejouer puis « Réessayer » simple : début du
  niveau par le faisceau) ; `j3-ctx-boss` C (perte définitive en plein combat contre la gardienne : bouton, reprise
  au K dans un jeu neuf) ; `boss-titan` H (j2 du début, sauvegarde effacée : secousse jouée, Tess secourue, puis
  arène atteinte par `boss.enter()` sans allumer le K 201 ; reprise : K 201 allumé sans « Point de contrôle ! » et
  instantané inchangé, Tess partie sans « Tess est à bord ! », capsule seule, tronc couché et plein dans la grille et
  le calque, secousse et messages non rejoués, titan à neuf) ; `small-screens` (écran d'échec à 640x320 et 568x320 : panneau sans défilement, « Réessayer
  le combat » au-dessus de Réessayer et Menu, cibles de 40 px au moins).
- **Niveau 2 du monde 1 (plan 04, étapes 7 et 8)** : `j2-play` (full, dev, ≈ 1 min 15) joue j2 (`?stage=j2`, clavier,
  sans mode test donc sans double saut ; ennemis retirés après l'arrivée) : arrivée par le faisceau de LUMA (`enter`
  puis `play`, son `beacon`), méduse-baleine proche dans le décor (image de texture `bg-jungle-creature-near`),
  textures du niveau (`w1-mushroom`, `w1-trunk`, `w1-spore-spot`, `w1-tess`, `w1-capsule`), 7 champignons, Tess en
  attente (capsule sur les 2 cases à sa gauche), bulle du premier message (`j2-mushroom`) cachée avant que Kaï
  n'atteigne le premier champignon au rythme de référence de check-levels (relevé de `__xrShell.radio()` depuis l'état
  `enter`) ; rebonds mesurés sur le champignon seul (33, 11) par un relevé posé
  sur `postupdate` de la scène (sommet des pieds, vitesses, cases pleines chevauchées) : 6,5 tuiles sans tenir Saut,
  8 en le tenant (± 8 px), retombée bornée à 1 400 px/s (lue après la borne : 1 400), aucune case traversée, même sous
  une dalle posée par le test (grille ET calque) à 4 lignes du chapeau, puis juste au-dessus de la tête (ligne 8 : choc
  à ≈ 1 570 px/s, ≈ 26 px par pas, relevé `hitUp` du pas d'avant `blocked.up` ; relevé remis à zéro et Kaï posé dans la
  même tâche) ; mur 24-27 franchi en rebondissant sur le premier champignon (→ tenu après le rebond) ; ombre de la
  créature (fenêtre 44-47 : `shadowPasses`, image `bg-jungle-creature-shadow` visible au milieu du passage, créature du
  décor effacée en fondu puis revenue en fondu (opacité relevée à chaque image), son `whaleCry`, pas de second passage) ;
  secousse (fenêtre 118-120 : tronc (128, 11) qui tremble, caméra secouée par l'événement (0,01, 900 ms) même si une
  secousse de coup reçu tournait, son `quake`, tronc couché plein dans la grille et le calque, Kaï posé dessous remonté
  dessus, arrêté par la souche ; sur le tronc, arrêté par le rocher 131-150 même en sautant : le tunnel est bouché) ;
  Tess (salle murée creusée dans le rocher : porte du sol (126, 11) ↔ porte de la salle (134, 7), glyphes allumés ;
  devant la porte voisine de Tess (146, 7), flèche au-dessus de Tess, portes fermées, Tess qui salue tournée vers Kaï ;
  ↑ la secourt (Kaï reste dans la salle) : réplique de Tess par la radio (bulle `data-speaker="tess"`), ouverte au plus
  150 ms après l'appui alors qu'un message ordinaire était à l'écran (`j2-closer` poussé par le test), portes toujours
  fermées, LUMA qui parle quand Tess se dissout (images 4 à 7, son `rescue` ; relevé à chaque image : dissolution
  pendant « … je te téléporte à bord », lettres écrites `.xr-bubble-text > span.is-on`), message « Tess est à bord ! »
  après la dernière lettre de LUMA, capsule restée ; ↑ → porte du tunnel (148, 11) ; pas encore dans l'équipage) ; pluie de spores (fenêtre 160-162, pluie
  163-179 : 8 taches dans la pluie, chaque spore lâchée sur la sienne au moins 950 ms après l'annonce, une spore
  abattue en l'air par un tir de `scene.lasers.fire`, une autre qui blesse Kaï posé sous sa tache) ; chaque événement
  une fois (`levelEvents.events[i].state`) ; plus de vies (`__xr2d.kill()` x 3) : échec, Tess hors de l'équipage, puis
  RÉESSAYER : Tess attend de nouveau ; partie neuve : à pleine course avec le bonus de vitesse depuis la colonne 114,
  le tronc est couché avant que Kaï n'entre dans le tunnel ; Tess secourue ; arène du mini-boss (`__xr2d.boss.enter()` :
  bornes 206 et 221, Scarabée-titan, 2 champignons contre les bornes, rebond pendant le combat ; `boss.win()`, Kaï posé
  après la seconde borne), balise atteinte en courant → résultats « Équipière : Tess » (`.detail--reward[data-reward="crew:tess"]`) et « Boss vaincu +2 000 »,
  panneau entier à 844x390 et 640x320 (5 lignes de détails : `.results-details.is-dense` resserrée sur les écrans
  bas), `crew: ['tess']` enregistré, j2 réussie ; j2 rejouée (`t.goto`, même sauvegarde) : `hooks.loadout.crew` =
  `['tess']`, Tess absente (`npc.state` `gone` d'emblée), capsule restée, message `j2-signal` muet (fenêtre franchie,
  rien joué), porte voisine ouverte d'emblée, ↑ → porte du tunnel sans dialogue ni message. Repères : `scene.mushrooms`
  (`list[i].frame` : 3 à 5 pendant l'écrasement, `bounces`, `lastHeld`), `scene.trunks[i]` (`state` `stand | tremble
  | fall | down`, `col`, `row` de la souche), `scene.sporeRain` (`active`, `history` : `x`, `groundY`, `announcedAt`,
  `droppedAt` sur l'horloge de la scène, `spots[i].img`), `scene.spores` (`active`, `spores[i]` : `alive`, `img`),
  `scene.shadowPasses`, `scene.levelEvents.events` (`event.kind`, `col0`, `col1`, `state` 0 / 1 / 2), `scene.npc`
  (naufragé 'N', null sans lui : `state` `wait | talk | beam | gone`, `near` (Kaï au sol à moins de 96 px, flèche),
  `x` / `feetY`, `img` (frames 0-1 repos, 2-3 salut, 4-7 dissolution), `capsule`, `arrow`, `rescuedAt` : horloge de la
  scène à l'appui, -1 avant). Valeurs
  recopiées : hauteurs de rebond (`MUSHROOM_BOUNCE_TILES`, `MUSHROOM_BOUNCE_HELD_TILES`), `MAX_RISE_V`, `MAX_FALL`,
  colonnes de j2 (champignons, fenêtres, tronc, rocher, portes, Tess, arène, pluie), `DROPS` et `WARN_MS` de
  `src/game2d/engine/sporeRain.ts`.
- **Campagne à 6 étapes** (`j1 j2 j3 f1 m1 f2`, 18 étoiles) : les scénarios lisent les étapes plutôt que de les recopier. `menu` et
  `progress-ids` (aussi en `--prod`) prennent l'ordre des cartes des Niveaux (verrous attendus d'après les étapes
  réussies, étoiles du monde et total « n/3 × cartes ») ; `campaign-flow` (j2 réussie : « Équipière : Tess », Tess à
  l'Établi, `crew` enregistré) compare `__xrShell.info().stages` à la règle
  d'ouverture et vérifie à la fin que son parcours a joué toutes les étapes ; `touch-options` calcule les verrous
  de son ancienne sauvegarde (j1 réussie) sur l'ordre de `__xrShell.info().stages` ; `stress-laps` et `theme-captures`
  suivent `STAGES` ; `j1-ctx-asleep` et `background-3d` jouent le niveau qui précède f1 (`stageBefore` : j3, gagné par
  `__xr2d.win()`) ; `j1-play` lit l'étape suivante de j1 ; `hangar` et `small-screens` passent par j2 (« Redescendre »),
  `hangar` puis par j3 (double saut déjà appris par sa sauvegarde de départ : pas de ligne « Compétence ») avant le
  Vol 1 ; `campaign-flow` joue j3 (arrivée par le faisceau,
  défaite du gardien par `__xr2d.win()` pendant son arrivée, jouée à sa hauteur et dans la vue, « Compétence : double saut », prime +5 000, double saut enregistré) ; `menu`
  vérifie l'ordre `j1 j2 j3 f1` du monde 1 et les trois titres.
- **Progression (plan 04)** : `progress-ids` (full, aussi en `--prod`, ≈ 50 s ; ≈ 30 s sans sa partie E) injecte des
  sauvegardes (neuve, version 1 « unlocked: 3 » et « unlocked: 2 », version 2 avec ou sans `story` ; « unlocked: 3 »
  avec j1 f1 m1 réussis ouvre aussi j2 et f2, JOUER → j2 ; version 2 avec j2 réussie et l'équipage vide : Tess rendue
  au chargement, mention « Tess à l’établi » `.hg-caption .hg-crew` au hangar) et vérifie sur la
  page : ligne sous JOUER (« Nouvelle aventure », « Continuer · … »), carte d'intro lancée par JOUER (Échap revient à
  l'accueil avant le lancement), verrous, records et étoiles (cartes, monde, total), page ouverte, plan du
  mitrailleur rendu à qui a fini f1 (état de l'arme au hangar), retour du hangar sur la même page, glissements (doigt
  CDP, souris, geste vif, petit glissement qui revient) sans lancer la carte, souris relâchée hors de la zone des
  pages puis survol sans bouton (bande immobile), Entrée sur une carte après un glissement au doigt (carte lancée),
  flèches du clavier, sauvegarde réécrite (histoire relue sans doublon, plan, `unlocked` gardé). Partie E (aides DEV, sautée en `--prod`) : f1 gagné →
  « Plan : mitrailleur » sur les résultats et « Atterrir » vers la Lune au hangar ; rejoué et gagné → plus de ligne.
- **Scénario du hangar (plan 03)** : `hangar` (full, ≈ 1 min 30) enchaîne A. lecture de la sauvegarde (version
  inconnue, JSON illisible, version 2 abîmée, migration d'une version 1), B. gain de cristaux de j1 (score et étoiles
  finaux notés), C. hangar entre j1 et j2 (équipement, achat avec confirmation, refus, retour Android vers les
  résultats figés, Redescendre, j2 gagné : « Équipière : Tess », puis Tess à l'Établi (mention `.hg-crew`, aperçu) et
  Dégâts niveau 2 sans « Demande Tess », Décoller, 4 boucliers en vol), D. hangar depuis les Niveaux (modules de la Comète, retours par
  Échap, ◀ et Retour arrière), E. effets en jeu hors mode test (laser, boucliers, turbo), F. mode test (réserve
  insuffisante refusée, arme de la session achetée, améliorations (Tess à bord depuis C : Dégâts niveau 2 sans note
  « Mode test »), j1 à 4 puis 5 cœurs, portée, cadence et refroidissement mesurés), G. équipage et plan posés dans la
  sauvegarde (achats hors mode test ; Dégâts niveaux 2 puis 3 ouverts avec Tess), H.
  réinitialisation. Aides du scénario : `hangarState` (réserve, onglet, armes, cartes `items[id]` : niveau, prix,
  verrou, notes, ligne d'effet ; confirmation, message, légende), `openBuy` / `buy` (confirmation vérifiée, débit,
  niveau ou arme achetée, son « buy »), `refuse` (message, tremblement, note, ni boîte ni débit), `recordSfx` /
  `sfxLog` (sons notés en enveloppant `__xrShell.audio.sfx`), `confirmSettled` (fin du fondu de la confirmation :
  attendue après chaque achat et avant une capture). Valeurs **recopiées en dur**, à mettre à jour après un réglage : prix 30 / 60 / 80 / 100 /
  140 / 150 / 250 et réserves attendues qui en découlent (`PRICES` de `src/core/hangar.ts`), multiplicateurs ×1,25 /
  ×1,15 (`UPGRADE_MULS`, `BOOST_MULS`), fiches du laser (`LASER_COOLDOWN_MS`, `LASER_COOL_RATE`) et du fusil
  (`RIFLE_RANGE_PX`, portée 13,8 tuiles) de `src/core/weapons.ts`, `BOOST_HEAT` / `COOL_RATE` / `COOL_DELAY`
  (énergie : `SHIP_ENERGY` et canon léger de `src/core/shipGuns.ts`), et les phrases de la confirmation (`buyPhrase` de `src/ui/screens/hangar.ts`).
  `small-screens` recopie aussi la réserve 12 398 (12 345 + 53) et le prix de Dégâts du laser ; `campaign-flow`
  compte les cristaux ramassés (3 en j1, 2 en m1 après RÉESSAYER ; en f1, gagné aussitôt sans tirer, 0).
- **Scénario du combat en vol (plan 03, 3b ; TIR et énergie du 29/10/2026)** : `flight-combat` (full, ≈ 1 min 45) :
  0. parcours construits dans la page (`import('/src/game3d/courses.ts')`) : vagues déterministes et attendues, hors
  des portails et de leur ligne d'approche (fenêtres de `genWaves` recopiées), portails, rochers (tous les champs),
  trajectoire et distorsion identiques à ceux d'avant 3b (hachage `COURSE_FP` relevé dans Chrome sur f4275db) ;
  A. f1, canon léger, pilote automatique (il tient TIR sur les cibles atteignables) : aucun tir au départ sans appui,
  chasseur abattu en 3 coups (sons « touché » des ennemis, volume 0,8), mine `spawn('mine', 60)` abattue en < 0,9 s,
  points exacts, cristaux lâchés au pas même de la mort (`crystalsDropped` : 1 mine, 2 chasseur) puis ramassés (HUD),
  rochers détruits sans bouclier perdu, aucun tir du pilote sans cible atteignable (`checkPilotFire`, toutes les
  traces), un son par tir, captures de près au ralenti, victoire (score = base d'avant 3b + points du combat, étoiles
  des portails seulement, score affiché = record, « +N cristaux », réserve) ; B. f1, mitrailleuse : chasseur en 3
  coups, essaims de 6 posés à un avancement fixé du vol (vol ralenti à `timeScale(0.1)` entre deux relevés : cet
  avancement ne doit pas être dépassé au départ de l'essai, `assertTrialStart`) avec une variante fixée (`VARIANT`,
  `SWARM_AT` : l'un abattu en entier, cristal de la vague lâché à la mort du dernier membre et à aucune autre ;
  l'autre laisse filer un membre, aucun cristal), un essaim à orientation libre (journalisé), cadence, bouches alternées, surchauffe et
  jauge rallumée ; B3. mitrailleuse niveau 3 : chasseur en 2 coups, membre d'essaim percuté (un bouclier, ni points ni
  cristal) puis mine percutée pendant l'invulnérabilité (bouclier gardé, choc léger), 13 tirs/s, surchauffe après 39
  tirs ; C. f1, 5 boucliers : gros TIR en bas à droite et TURBO au-dessus, aucun tir sans appui (mine frôlée visée et
  atteignable, `target.hit`), mine frôlée et orbe
  reçue (un bouclier chacune, au même pas que la disparition de la mine ou de l'orbe, sans cristal), TIR tactile,
  joystick + TURBO + TIR, J / X / F, canon léger (cadence, surchauffe, reprise), énergie (`energyTrial` : turbo seul
  qui chauffe de 0,4 par seconde et surchauffe en 2,5 s, ni turbo ni tir en surchauffe malgré Espace et TIR tenus
  jusqu'à 30 %, puis reprise des deux ; TIR et turbo ensemble : surchauffe en ~1,5 s ; sons du turbo et de la
  surchauffe), HUD à 844x390 (turbo en marche) et 640x320, J tire sans cible pendant que le pilote automatique vole ;
  D. f2 : captures de près dans la ceinture, vol au pilote automatique (x2,5) avec les appels de dessin relevés. Les
  mesures fines passent par `window.__xrTrace(max, until)` (posé par `installTrace` avant `t.goto`) :
  `__xr3d.advance(1 / 60)` répété dans la même tâche (temps de jeu exact, sans dépendre des images/s), état résumé
  de chaque pas (dont `boosting`, `hudOver`, `hudBoost`), arrêt sur l'expression `until` (`i`, `i0`, `rows`) ;
  `spawn`, `fire(true)` et une touche simulée (`KeyboardEvent` sur `window` : J, Espace, Maj) se font dans la même
  tâche que la trace (aucune image du jeu entre les deux). Les mesures de cadence, de surchauffe et d'énergie se font
  pilote coupé (rien d'autre ne tire ni ne pousse) ; le pilote automatique prend le turbo et tire : `settle()`
  refroidit l'énergie avant un essai. Captures agrandies x3 autour du point situé `d` u devant la Comète
  (`clipAhead` : projection par la caméra du vol, scène suivie par `trackThreeScenes`). Valeurs **recopiées en dur**,
  à mettre à jour après un réglage : `GUNS` (cadence, tirs avant la surchauffe, refroidissement de
  `src/core/shipGuns.ts` et `SHIP_GUN_MULS`, coups pour abattre un chasseur), `BOOST_HEAT` (`SHIP_ENERGY`),
  `POINTS` / `DROPS` (`ROCK_POINTS`, `CRYSTAL_POINTS` de `src/game3d/flight.ts`, `ENEMY_DEFS`,
  `SWARM_WAVE_CRYSTALS` de `src/game3d/enemies.ts`), `SCORE` (`startWarp`), `CRUISE` (`COURSES`), `WAVES` et
  `CRYSTALS_TOTAL` (vagues obtenues, plan 03), `GATE_ZONE` / `WAVE_WINDOW` (`genWaves`), `COURSE_FP`, `VARIANT` /
  `SWARM_AT` / `TRIAL_AT` (avancements fixes des essais, variantes mesurées après `__xr3d.settle()`, une partie
  neuve par variante essayée : à remesurer si le pilote automatique, la visée, l'essaim ou les vagues de f1 changent ;
  inchangées après le pilote du 29/10/2026, qui tient TIR et prend le turbo sur l'énergie). TIR et TURBO apparaissent
  aussi dans `touch-options` (miroir en mode gaucher, aux crans Grands et Discrète : TIR de la taille de SAUT, TURBO
  de celle du TIR de la plateforme, opacité de la couche du vol, ancien `manualFire: false` ignoré
  (`assertNoAutoFire`), TIR et TURBO tenus avec le joystick à droite),
  `small-screens` (HUD du combat, TIR et TURBO de 844x390 à 568x320, aussi turbo en marche et en surchauffe ;
  rubrique Commandes de la Pause sans « Tir manuel »), `touch-controls` (pas de tir automatique : `assertNoAutoFire` ;
  joystick + TURBO + TIR, TIR levé seul), `f1-play` (pas de tir automatique : `assertNoAutoFire` ; turbo et J au
  clavier : énergie du HUD), `background-3d` (joystick, TURBO et TIR relâchés en
  arrière-plan) et `hangar` (module Turbo : chauffe du turbo et refroidissement mesurés) ; `flight-autopilot` exige
  au moins un bouclier, des ennemis abattus, des cristaux et moins de 150 appels de dessin, une partie neuve au départ
  de chaque vol (rien de la précédente) et la réserve = cristaux de f1 + f2 ; `f1-ctx-loss` abat une mine (TIR tenu
  par `fire`) après chaque restauration sur place ; `stress-laps` compare géométries, textures et programmes du
  renderer à l'entrée en vol au 1er et au dernier tour.
- Champs privés du moteur lisibles dans la page (TypeScript ne les cache pas à l'exécution) : `scene.gun`
  (`burstLeft`, `sinceShotMs`, `heat`, `overheated`), `scene.player.invulnMs`, `enemies.list[i]` (`awake`,
  `body.blocked.down`) : préférer une attente d'état (`waitFor`) à une durée fixe.
- Pendant un enchaînement d'écrans, les clics sont ignorés : utiliser `waitForScreen` avant de cliquer.

## Règles de la machine (Windows, iGPU AMD Vega 3)

- **Un seul navigateur à la fois** : l'iGPU perd le contexte WebGL sous charge GPU concurrente. Le lanceur
  pose un verrou (`xeno-rift-e2e.lock` dans `XR_TMP`, `D:/DevTools/tmp` par défaut, avec le pid), commun à
  toutes les copies du dépôt (worktrees) ; un second lanceur affiche « en attente du verrou… » et attend (30 min max). Un verrou dont le processus n'existe plus est supprimé. Ne pas lancer de navigateur
  hors du lanceur, ni utiliser le panneau navigateur intégré (page cachée : `requestAnimationFrame` figé).
- Sorties console attendues et sans gravité : `warning X4122: sum of … cannot be represented accurately in
  double precision` (compilation D3D des shaders, une fois par navigateur à froid) ; lors des pertes de
  contexte provoquées, `[flight3d] contexte WebGL perdu` et les journaux THREE / Phaser associés.
- Tout reste sur D: (C: est plein) : le profil temporaire de Chrome va dans `D:/DevTools/tmp`, le cache npm
  dans `D:/DevTools/npm-cache`.
- Chrome met 15 à 60 s à se fermer normalement sur cette machine : le lanceur ferme les pages puis arrête
  le processus de force (quelques secondes).
