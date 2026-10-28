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
node tests/e2e/run.mjs --prod --suite full # build de production : menu, small-screens, prod-build (le reste : SKIP)
node tests/e2e/run.mjs --help              # aide (en-tête de run.mjs)
```

Avec npm, les options passent après `--` : `npm run e2e -- --suite full`. Noms et `--suite` s'additionnent.
`--prod` seul garde la suite smoke par défaut : seul `menu` y tourne.

Durées sur cette machine : `smoke` ≈ 1 min 40 (`npm test` ≈ 2 min 10 en tout), `full` ≈ 33 min (dont
`flight-autopilot` ≈ 2 min 45, `flight-combat` ≈ 1 min 45 seul et 2 min 25 dans la suite, `stress-laps`
≈ 2 min 20, `small-screens` ≈ 2 min 10,
`weapons` ≈ 1 min 40, `hangar` ≈ 1 min 20 et `powerups` ≈ 45 s), `diag` ≈ 1 min 20, `--prod --suite full` ≈ 1 min 30.

- **Serveur** : scénarios dev : le lanceur réutilise le serveur de dev déjà ouvert sur http://localhost:5173/
  (sans jamais l'arrêter), sinon il lance lui-même `vite`. Scénarios sur le build de production (`--prod`, ou
  `meta.prod` comme `prod-build`, qui fait partie de `full`) : il réutilise un `vite preview` déjà ouvert sur
  4173 (`npm run preview`), sinon il le lance. Un serveur lancé par lui est arrêté à la fin, y compris sur
  Ctrl+C. Un port occupé par autre chose que le bon serveur Xeno Rift fait échouer les scénarios (voir
  `XR_BASE`). Le build de production exige un `dist/` : **`npm run build` avant `--prod` ou `--suite full`**
  (le lanceur prévient si `dist/` est plus ancien que les sources, seulement quand il lance `vite preview`).
- **`--prod`** : sans aides DEV, seuls `menu`, `small-screens`, `prod-build` (et `bench-shaders` en `diag`)
  tournent ; les autres sont SKIP.
- **Variables** : `XR_BASE` (URL imposée à tous les scénarios, `prod-build` compris, aucun serveur géré),
  `XR_DEV_PORT` / `XR_PROD_PORT` (autres ports),
  `XR_TMP` (dossier temporaire du profil Chrome, `D:/DevTools/tmp` par défaut), `XR_VERBOSE=1`
  (affiche aussi les `console.log` de la page).
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
| `diag` | mesures et diagnostics (bancs d'essai, journaux, captures de l'aperçu graphique `art-preview`) : affichent des chiffres ou des images, sans vrai verdict |
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
  `activeScreen`, `screenText`, `clickText`, `center(t, sélecteur, fx, fy)`, `readSave`, et pour le jeu
  (aides DEV) `waitFor2dPlay`, `player2d`, `lasers2d`, `waitFor3dPhase`, `info3d`.
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
    (« Suivant » des résultats, puis « Décoller » du hangar : vers l'étape suivante), `waitPause`,
    `input` / `waitInput` / `waitInputIdle` (ces trois-là : DEV, `__xrShell` ; au repos = ni direction, `up` et
    `down` compris, ni bouton), `screenLuma`,
    `assertLayout` / `layoutProblems` / `rects` / `overlaps`, `heapMB`, `measureFps`, `gameCanvases`, `domNodes`.
  - `game2d.mjs` (plateforme ; les aides de partie exigent le serveur de dev) : `recordUi`, `armGame`,
    `engine2d` / `gameInfo` / `phaserCanvases`, `loseGame` / `restoreGame`, `ends`, `frameStats`, `assertRenders`,
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
    ennemis : `moveEnemy` / `parkEnemy` (posé ailleurs, immobile), `removeEnemies`, `enemy2d` (vie).
  - `game3d.mjs` (vol ; idem) : `recordUi` / `uiLog`, `runId` / `waitNewRun` / `waitFlying`, `assertFlying`,
    `loseFlight`, `threeCanvases` / `tagCanvas` / `assertOneLiveCanvas`, `frameLuma`, `failReason`,
    `armBootLoss` / `bootInfo` (perte du contexte au démarrage).

### Repères utiles

- Aides DEV (serveur de dev uniquement) : `window.__xr2d` (scène 2D, `teleport`, `god`, `win`, `kill`,
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
  tuile, voir `aim-crouch-drop`), `window.__xr3d` (`info` : dont `shield` / `maxShields` (3 + bouclier renforcé),
  `boost` (jauge), `boostDrain` / `boostFill` (vidange et recharge par seconde, module Turbo compris), et pour le
  combat (plan 03, 3b) `gunLevel` (0 canon léger, 1 à 3 mitrailleuse), `heat`, `overheated`, `manualFire`, `range`
  (portée, u), `shotsActive` (tirs en vol), `shotsFired` (tirs partis depuis le départ), `lastMuzzle` (bouche du
  dernier tir : 0, ou 0 / 1 en alternance pour la mitrailleuse), `target` (`{ type: 'rock' | 'fighter' | 'mine' |
  'swarm', dist, hit }` ou null), `enemies` (`fighter`, `mine`, `swarm` vivants, `killed` : abattus par les tirs),
  `orbsActive`, `waves`, `crystals` (ramassés pendant ce vol) / `crystalsTotal` / `crystalsActive` (en vol, pas encore
  ramassés), `crystalsDropped` (cristaux lâchés depuis le départ : ils apparaissent au sous-pas même de la
  destruction), `rocksDestroyed`, `points` (rochers, ennemis, cristaux), `drawCalls` (`renderer.info.render.calls`
  de la dernière image), `geometries` / `textures` / `programs` (`renderer.info`) ; `autopilot` (tire toujours en
  automatique, même en tir manuel), `win`, `fail`, `advance(s)` (s secondes de jeu simulées dans la même tâche,
  renvoie `info()` ; `advance(1 / 60)` : un sous-pas, voir `__xrTrace` de `flight-combat`), `timeScale`, `bench`,
  `spawn(type, distance = 60, variant)` (chasseur, mine ou essaim de 6 posé devant la Comète, sur sa ligne ; renvoie
  le nombre placé ; un chasseur se tient à max(30, distance) et tire après 42 u de trajet ; `variant` 0..1, au
  hasard sans lui : orientation de l'essaim et phase de son ondulation comptée depuis la pose, côté du virage du
  chasseur, clignotement de la mine : à fixer dans un test), `fire(on = true)` (tir forcé, en tir automatique comme
  manuel)), `window.__xrShell` (`info` : `phase`, `screen` (écran affiché), `loadout` (`equipped`, `owned`,
  `skills`), `play` (équipement effectif complet : améliorations `mods` par arme, `maxHearts`, `ship` :
  `maxShields`, `boostDrainMul`, `boostFillMul`, `gunLevel`), `crystals` (réserve), `weapon` (l'arme de la
  session) ; `cap` ; `addCrystals(n)` : ajoute des cristaux à la réserve, enregistrée, sans redessiner l'écran
  affiché : l'appeler avant d'ouvrir le hangar). `__xr3d` disparaît quand la partie est détruite : toujours tester
  sa présence. `lasers2d` (`helpers.mjs`) ne compte
  que les traits du laser (texture `laser`) : pour les autres armes, `__xr2d.info().shots` ou `recordShots` /
  `shotLog`. Le HUD suit le jeu à l'image suivante : après `power()` ou `weapon()`, attendre (`waitFor`) avant
  de lire le HUD. Un ennemi se déplace avec `moveEnemy` (positions précédentes du corps Arcade recalées : sinon
  un ennemi endormi, réveillé à sa nouvelle place, repart d'autant dans l'autre sens).
- Paramètres d'URL (actifs aussi en production) : `?stage=j1|f1|m1|f2` (lancement direct, sans intro),
  `?unlock=1` (mode test, enregistré dans la sauvegarde : 4 armes et double saut, conditions du hangar levées mais
  pas les prix), `?weapon=laser|machinegun|shotgun|rifle` (arme de la session ; inconnue : message et laser),
  `?touch=1` / `?touch=0`.
- Sauvegarde (`localStorage` `xeno-rift-save-v1`) en version 2 depuis le plan 03 : `crystals`, `upgrades` (par arme),
  `ship` (`gun`, `shield`, `boost`), `extraHearts`, `crew`, `blueprints` en plus de `unlocked`, `best`, `settings`,
  `loadout`. Une sauvegarde version 1 écrite à la main est migrée (pas remise à zéro), réécrite en version 2 au
  premier enregistrement ; pour poser des achats avant le chargement, écrire une version 2 (voir `patchSave` de
  `small-screens`).
- Clavier : flèches / WASD, Espace = saut (2D) et turbo (vol), K = saut, Haut/W = haut (visée, portes ; ne fait
  plus sauter), Bas/S = accroupi (+ Saut : descente d'une plateforme `=` ou mobile), J/X/F = tir, Maj = turbo,
  Échap/P = pause, Entrée/Espace passent l'intro.
- Écrans : `.screens [data-screen=title|select|options|intro|results|hangar|fail|end|error]` ; pause :
  `.overlay.pause.is-open`, bouton `.btn-primary` (REPRENDRE) ; HUD : `.hud-pause`, jauge `.hud-heat[data-weapon]`
  (`--heat-step` : graduations, `.is-over` : SURCHAUFFE), anneaux `.hud-powers .hud-power.is-on[data-kind=speed|
  rapid|shield]` (`.is-ending` : fin proche), cœurs `.hud-hearts .hud-heart` (`.is-empty`), boucliers du vol
  `.fl-pips .fl-pip` (`.is-empty`), jauge du canon de la Comète `.fl-heat` (mêmes classes internes que `.hud-heat` :
  `data-level` cool | warm | hot, `data-gun` light | machinegun, `--heat-step` = 1 s de tir continu, `.is-over`,
  part vide `--heat-off` de `.heat-grad`), cristaux du vol `.fl-crystals .hud-num`. Résultats : ligne `.detail--bank` (« Réserve », gain `.detail-gain` « +N
  cristaux », total `.detail-value`). Niveaux : bouton `.select-hangar` (réserve en sous-titre). Hangar : réserve
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
  vol : joystick flottant sur la moitié gauche (`.xr-stick-zone`) + `.xr-boost` (TURBO), et `.xr-shoot`
  (TIR, à gauche de TURBO et un peu plus haut) en tir manuel seulement (réglage `manualFire`, interrupteur
  `.toggle--manualFire` de la rubrique Commandes). Couches :
  `#touch-root .xr-tc-layer`. Réglages (rubrique Commandes des Options) : `--xr-scale` et `--xr-tc-opacity`
  sur `#touch-root`, classe `xr-touch--lefty` en mode gaucher (stick et joystick à droite, boutons à gauche) ;
  pour les poser avant le chargement, modifier `settings` de la sauvegarde (`touchSize`, `touchOpacity` :
  0..2, `leftHanded`) puis `t.goto` (voir `small-screens`).
- Scénarios des contrôles 2D (à lire avant d'en écrire un du même genre) : `touch-controls` (smoke : stick
  8 directions, glissements, doigts multiples, joystick + TURBO), `aim-crouch-drop` (visée haute et
  diagonale, éventail de la pompe, accroupi, reptation, plafond bas posé par le test, descente d'une plateforme `=`
  puis de la plateforme mobile de la Lune, portes de la Jungle (128, 5) ↔ (144, 9), au clavier et au stick),
  `touch-options` (rubrique Commandes : anciennes sauvegardes, réglages abîmés, persistance, Pause, gaucher en
  2D et en vol), `small-screens` (place du stick et des boutons selon les réglages, carte d'intro, HUD avec trois
  bonus, HUD à 5 cœurs et 5 boucliers, ligne Réserve des résultats, hangar de 844x390 à 568x320 : chaque carte
  amenée à l'écran, aperçu d'au moins 100x60 px, première amélioration de l'Établi entière sans défiler, cibles
  tactiles, confirmation, captures aux 4 tailles ; aussi en `--prod`, sans ce qui demande les aides DEV) ; `art-preview` (diag) capture `preview/art.html` (Kaï et
  son bras, poses accroupies, portes, stand de tir des 4 armes) pour une revue à l'œil.
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
- **Scénario du hangar (plan 03)** : `hangar` (full, ≈ 1 min 15) enchaîne A. lecture de la sauvegarde (version
  inconnue, JSON illisible, version 2 abîmée, migration d'une version 1), B. gain de cristaux de j1 (score et étoiles
  finaux notés), C. hangar entre j1 et f1 (équipement, achat avec confirmation, refus, retour Android vers les
  résultats figés, Décoller, 4 boucliers en vol), D. hangar depuis les Niveaux (modules de la Comète, retours par
  Échap, ◀ et Retour arrière), E. effets en jeu hors mode test (laser, boucliers, turbo), F. mode test (réserve
  insuffisante refusée, arme de la session achetée, améliorations, j1 à 4 puis 5 cœurs, portée, cadence et
  refroidissement mesurés), G. équipage et plan posés dans la sauvegarde (achats hors mode test), H.
  réinitialisation. Aides du scénario : `hangarState` (réserve, onglet, armes, cartes `items[id]` : niveau, prix,
  verrou, notes, ligne d'effet ; confirmation, message, légende), `openBuy` / `buy` (confirmation vérifiée, débit,
  niveau ou arme achetée, son « buy »), `refuse` (message, tremblement, note, ni boîte ni débit), `recordSfx` /
  `sfxLog` (sons notés en enveloppant `__xrShell.audio.sfx`), `confirmSettled` (fin du fondu de la confirmation :
  attendue après chaque achat et avant une capture). Valeurs **recopiées en dur**, à mettre à jour après un réglage : prix 30 / 60 / 80 / 100 /
  140 / 150 / 250 et réserves attendues qui en découlent (`PRICES` de `src/core/hangar.ts`), multiplicateurs ×1,25 /
  ×1,15 (`UPGRADE_MULS`, `BOOST_MULS`), fiches du laser (`LASER_COOLDOWN_MS`, `LASER_COOL_RATE`) et du fusil
  (`RIFLE_RANGE_PX`, portée 13,8 tuiles) de `src/core/weapons.ts`, `BOOST_DRAIN` / `BOOST_FILL` de
  `src/game3d/flight.ts`, et les phrases de la confirmation (`buyPhrase` de `src/ui/screens/hangar.ts`).
  `small-screens` recopie aussi la réserve 12 398 (12 345 + 53) et le prix de Dégâts du laser ; `campaign-flow`
  compte les cristaux ramassés (3 en j1, 2 en m1 après RÉESSAYER ; en f1, gagné aussitôt, ceux que le tir
  automatique a pu faire tomber avant `win()`, 0 en général).
- **Scénario du combat en vol (plan 03, 3b)** : `flight-combat` (full, ≈ 1 min 45) : 0. parcours construits dans la
  page (`import('/src/game3d/courses.ts')`) : vagues déterministes et attendues, hors des portails et de leur ligne
  d'approche (fenêtres de `genWaves` recopiées), portails, rochers (tous les champs), trajectoire et distorsion
  identiques à ceux d'avant 3b (hachage `COURSE_FP` relevé dans Chrome sur f4275db) ; A. f1, canon léger, pilote
  automatique (tir automatique) : chasseur abattu en 3 coups (sons « touché » des ennemis, volume 0,8), mine
  `spawn('mine', 60)` abattue en < 0,9 s, points exacts, cristaux lâchés au pas même de la mort (`crystalsDropped` :
  1 mine, 2 chasseur) puis ramassés (HUD), rochers détruits sans bouclier perdu, aucun tir automatique sans cible
  atteignable (`checkAutoFire`, toutes les traces), un son par tir, captures de près au ralenti, victoire (score =
  base d'avant 3b + points du combat, étoiles des portails seulement, score affiché = record, « +N cristaux »,
  réserve) ; B. f1, mitrailleuse : chasseur en 3 coups, essaims de 6 posés à un avancement fixé du vol avec une
  variante fixée (`VARIANT`, `SWARM_AT` : l'un abattu en entier, cristal de la vague lâché à la mort du dernier
  membre et à aucune autre ; l'autre laisse filer un membre, aucun cristal), un essaim à orientation libre
  (journalisé), cadence, bouches alternées, surchauffe et jauge rallumée ; B3. mitrailleuse niveau 3 : chasseur en 2
  coups, membre d'essaim percuté (un bouclier, ni points ni cristal) puis mine percutée pendant l'invulnérabilité
  (bouclier gardé, choc léger), 13 tirs/s, surchauffe après 39 tirs ; C. f1, tir manuel, 5 boucliers : TIR placé,
  aucun tir sans appui, mine frôlée et orbe reçue (un bouclier chacune, au même pas que la disparition de la mine ou
  de l'orbe, sans cristal), TIR tactile, joystick + TURBO + TIR, J / X / F, canon léger (cadence, surchauffe,
  reprise), HUD à 844x390 et 640x320, option coupée depuis la Pause (tir automatique revenu, J tire aussi sans
  cible) ; D. f2 : captures de près dans la ceinture, vol au pilote automatique (x2,5) avec les appels de dessin
  relevés. Les mesures fines passent par `window.__xrTrace(max, until)` (posé par `installTrace` avant `t.goto`) :
  `__xr3d.advance(1 / 60)` répété dans la même tâche (temps de jeu exact, sans dépendre des images/s), état résumé
  de chaque pas, arrêt sur l'expression `until` (`i`, `i0`, `rows`) ; `spawn`, `fire(true)` et une touche
  simulée (`KeyboardEvent` sur `window`) se font dans la même tâche que la trace (aucune image du jeu entre les
  deux). Les mesures de cadence et de surchauffe se font en tir manuel sans pilote automatique (rien d'autre ne
  tire). Captures agrandies x3 autour du point situé `d` u devant la Comète (`clipAhead` : projection par la
  caméra du vol, scène suivie par `trackThreeScenes`). Valeurs **recopiées en dur**, à mettre à jour après un
  réglage : `GUNS` (cadence, tirs avant la surchauffe, refroidissement de `src/core/shipGuns.ts` et
  `SHIP_GUN_MULS`, coups pour abattre un chasseur), `POINTS` / `DROPS` (`ROCK_POINTS`, `CRYSTAL_POINTS` de
  `src/game3d/flight.ts`, `ENEMY_DEFS`, `SWARM_WAVE_CRYSTALS` de `src/game3d/enemies.ts`), `SCORE` (`startWarp`),
  `CRUISE` (`COURSES`), `WAVES` et `CRYSTALS_TOTAL` (vagues obtenues, plan 03), `GATE_ZONE` / `WAVE_WINDOW`
  (`genWaves`), `COURSE_FP`, `VARIANT` / `SWARM_AT` (variantes mesurées : à remesurer si le pilote automatique,
  la visée ou l'essaim changent). Le tir manuel apparaît aussi dans `touch-options` (TIR à gauche en mode gaucher,
  aux crans Grands et Discrète : taille du TIR de la plateforme au même cran, opacité de la couche du vol, tir avec
  le joystick à droite) et `small-screens` (HUD du combat et TIR de 844x390 à 568x320, aussi en surchauffe, ligne
  « Tir manuel » de la Pause) ; `touch-controls` vérifie qu'il n'y a pas de TIR en tir automatique ;
  `flight-autopilot` exige au moins un bouclier, des ennemis abattus, des cristaux et moins de 150 appels de dessin,
  une partie neuve au départ de chaque vol (rien de la précédente) et la réserve = cristaux de f1 + f2 ;
  `f1-ctx-loss` abat une mine après chaque restauration sur place ; `stress-laps` compare géométries, textures et
  programmes du renderer à l'entrée en vol au 1er et au dernier tour.
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
