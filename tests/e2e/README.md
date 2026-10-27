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
node tests/e2e/run.mjs --prod              # build de production (dist/ servi par vite preview sur 4173)
node tests/e2e/run.mjs --help              # aide (en-tête de run.mjs)
```

Avec npm, les options passent après `--` : `npm run e2e -- --suite full`. Noms et `--suite` s'additionnent.

- **Serveur** : scénarios dev : le lanceur réutilise le serveur de dev déjà ouvert sur http://localhost:5173/
  (sans jamais l'arrêter), sinon il lance lui-même `vite`. Scénarios sur le build de production (`--prod`, ou
  `meta.prod` comme `prod-build`, qui fait partie de `full`) : il réutilise un `vite preview` déjà ouvert sur
  4173 (`npm run preview`), sinon il le lance. Un serveur lancé par lui est arrêté à la fin, y compris sur
  Ctrl+C. Un port occupé par autre chose que le bon serveur Xeno Rift fait échouer les scénarios (voir
  `XR_BASE`). Le build de production exige un `dist/` : **`npm run build` avant `--prod` ou `--suite full`**
  (le lanceur prévient si `dist/` est plus ancien que les sources, seulement quand il lance `vite preview`).
- **`--prod`** : sans aides DEV, seuls `menu`, `small-screens`, `prod-build` (et `bench-shaders` en `diag`)
  tournent ; les autres sont SKIP.
- **Variables** : `XR_BASE` (URL imposée, aucun serveur géré), `XR_DEV_PORT` / `XR_PROD_PORT` (autres ports),
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
| `diag` | mesures et diagnostics (bancs d'essai, journaux) : affichent des chiffres, sans vrai verdict |
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
| `goto(q)` | `page.goto(new URL(q, base))`, ex. `t.goto('?stage=f1&unlock=1')` |
| `wait(ms)` | pause (`page.waitForTimeout`) |
| `ev(fn, arg)` | `page.evaluate(fn, arg)` |
| `key(code, ms = 100)` | appui maintenu `ms` ms (`'ArrowRight'`, `'Space'`, `'KeyJ'`, `'Escape'`…) |
| `shot(nom)` | capture `NN-nom.png` dans `out`, renvoie le chemin |
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
    `hudFlight` / `hudPlatform`, `waitHud`, `resultDetails`, `recordToasts` / `toasts`, `press`, `waitPause`,
    `input` / `waitInput` / `waitInputIdle` (ces trois-là : DEV, `__xrShell`), `screenLuma`,
    `assertLayout` / `layoutProblems` / `rects` / `overlaps`, `heapMB`, `measureFps`, `gameCanvases`, `domNodes`.
  - `game2d.mjs` (plateforme ; les aides de partie exigent le serveur de dev) : `recordUi`, `armGame`,
    `engine2d` / `gameInfo` / `phaserCanvases`, `loseGame` / `restoreGame`, `ends`, `frameStats`, `assertRenders`,
    `assertPlays`, `assertFrozen`.
  - `game3d.mjs` (vol ; idem) : `recordUi` / `uiLog`, `runId` / `waitNewRun` / `waitFlying`, `assertFlying`,
    `loseFlight`, `threeCanvases` / `tagCanvas` / `assertOneLiveCanvas`, `frameLuma`, `failReason`,
    `armBootLoss` / `bootInfo` (perte du contexte au démarrage).

### Repères utiles

- Aides DEV (serveur de dev uniquement) : `window.__xr2d` (scène 2D, `teleport`, `god`, `win`, `kill`),
  `window.__xr3d` (`info`, `autopilot`, `win`, `fail`, `advance`, `timeScale`, `bench`), `window.__xrShell`
  (`info`, `cap`). `__xr3d` disparaît quand la partie est détruite : toujours tester sa présence.
- Paramètres d'URL (actifs aussi en production) : `?stage=j1|f1|m1|f2` (lancement direct, sans intro),
  `?unlock=1` (enregistré dans la sauvegarde), `?touch=1` / `?touch=0`.
- Clavier : flèches / WASD, Espace = saut (2D) et turbo (vol), Haut/W = haut + saut, K = saut, J/X/F = tir,
  Maj = turbo, Échap/P = pause, Entrée/Espace passent l'intro.
- Écrans : `.screens [data-screen=title|select|options|intro|results|fail|end|error]` ; pause :
  `.overlay.pause.is-open`, bouton `.btn-primary` (REPRENDRE) ; HUD : `.hud-pause`.
- Contrôles tactiles : `.xr-dpad` (moitiés gauche / droite), `.xr-jump`, `.xr-fire` ; en vol : joystick
  flottant sur la moitié gauche (`.xr-stick-zone`) + `.xr-boost` (TURBO). Couches : `#touch-root .xr-tc-layer`.
- Pendant un enchaînement d'écrans, les clics sont ignorés : utiliser `waitForScreen` avant de cliquer.

## Règles de la machine (Windows, iGPU AMD Vega 3)

- **Un seul navigateur à la fois** : l'iGPU perd le contexte WebGL sous charge GPU concurrente. Le lanceur
  pose un verrou (`tests/e2e/out/.lock`, avec le pid) ; un second lanceur affiche « en attente du verrou… »
  et attend (30 min max). Un verrou dont le processus n'existe plus est supprimé. Ne pas lancer de navigateur
  hors du lanceur, ni utiliser le panneau navigateur intégré (page cachée : `requestAnimationFrame` figé).
- Sorties console attendues et sans gravité : `warning X4122: sum of … cannot be represented accurately in
  double precision` (compilation D3D des shaders, une fois par navigateur à froid) ; lors des pertes de
  contexte provoquées, `[flight3d] contexte WebGL perdu` et les journaux THREE / Phaser associés.
- Tout reste sur D: (C: est plein) : le profil temporaire de Chrome va dans `D:/DevTools/tmp`, le cache npm
  dans `D:/DevTools/npm-cache`.
- Chrome met 15 à 60 s à se fermer normalement sur cette machine : le lanceur ferme les pages puis arrête
  le processus de force (quelques secondes).
