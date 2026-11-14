# Xeno Rift — architecture et organisation

Vue d'ensemble du code et des documents, pour un humain comme pour Claude. Les règles détaillées et les
« recettes » (ajouter un niveau, un réglage, un son…) sont dans [CLAUDE.md](../CLAUDE.md) ; ce fichier
explique **comment les morceaux tiennent ensemble** et **où ranger le code à venir**.

---

## 1. Les couches

```
                     main.ts  →  ui/App.ts   (point d'entrée, assemble tout)
                                    │
          ┌─────────────────────────┼─────────────────────┬────────────────────────┐
          │                         │                     │ import dynamique       │ import dynamique
          ▼                         ▼                     ▼                        ▼
   input/  audio/            ui/ (écrans, HUD,      story/ (bulle de       game2d/      game3d/
   (adaptateurs :            radio, enchaînement)   LUMA, cinématiques)    (Phaser)     (three)
    clavier, tactile,                                     │                moteurs de jeu
    Web Audio…)                                           └─ dessins purs ─▶ game2d/art/draw/…
          │                         │                     │                     │
          └─────────────────────────┴─────────────────────┴──────────┬──────────┘
                                                                     ▼
                                    core/  (contrats et données — ne dépend de rien)
```

**Règle de dépendance : tout pointe vers `core/`.**

- `core/` n'importe rien (hors de lui-même). C'est le contrat commun : types, identifiants (`ids.ts`), table des
  mondes et liste des étapes, textes de l'histoire, format de sauvegarde.
- `input/`, `audio/`, `game2d/`, `game3d/` n'importent que `core/`.
- Les moteurs de jeu ne connaissent ni l'interface, ni le clavier, ni le son en direct : ils reçoivent
  `InputApi`, `AudioApi`, `HudApi` et les réglages par `ModeHooks` (inversion de dépendance). On peut ainsi
  tester un mode avec de faux branchements (`preview/flight.ts` le fait).
- `ui/` charge les moteurs par `import()` dynamique et ne leur parle que par `StartMode` / `ModeHandle` :
  Phaser et three ne ralentissent pas l'écran d'accueil. Il charge de même `story/` (`ui/radio.ts` →
  `story/bubble.ts`).
- `story/` (bulle de LUMA, portraits, cinématiques) n'importe que `core/` (ses textes) et des dessins purs du jeu 2D.
- **Exception des dessins** : `story/` et `ui/hangarPreview.ts` peuvent importer les dessins Canvas 2D du jeu 2D
  (`game2d/art/draw/*`, `art/util`, `art/keys`, `art/palette`) : fonctions pures, sans Phaser ni moteur. Rien
  d'autre de `game2d/`.

Vérifié le 29/10/2026. Pour revérifier :

```bash
for m in core input audio game2d game3d story; do echo "== $m"; grep -rhoE "from '(\.\./)+[a-zA-Z0-9]+" src/$m | sort | uniq -c; done
grep -rnE "from '(\.\./)+game2d/" src/ui src/story | grep -vE "game2d/art/(draw/|util|keys|palette)"
```

Sous `== core`, rien ne doit s'afficher. Ailleurs, seuls `core` et des fichiers du module lui-même
(`constants`, `art`… pour `game2d`) sont permis : jamais `ui`, `input`, `audio`, ni l'autre moteur ; pour
`story`, aussi `game2d` (dessins seulement). La seconde commande ne doit rien afficher (exception des dessins).

### Correspondance avec une « clean architecture »

| Couche classique | Dans Xeno Rift |
|---|---|
| Domaine (entités, règles) | `core/` (types, table des mondes, étapes, textes, sauvegarde), données de niveaux (`game2d/levels/`), constantes de gameplay (`game2d/constants.ts`) |
| Cas d'usage | `ui/App.ts` (déroulement d'une étape), `ui/flow.ts` (décisions pures de l'enchaînement), `core/save.ts` (`recordResult`, récompenses, progression : `isUnlocked`, `nextToPlay`) |
| Adaptateurs | `input/`, `audio/`, `ui/services.ts`, les rendus (`game2d/engine/game.ts`, `game3d/renderer.ts`) |
| Frameworks | Phaser, three.js, DOM, Web Audio, Capacitor |

L'architecture est **pragmatique, pas stricte** : dans un moteur de jeu, règles et affichage vivent
ensemble pour la performance (pas d'allocation dans la boucle, objets réutilisés). On ne sépare pas chaque
ennemi en « règle pure + rendu ». La rigueur s'applique là où elle paie :

- **Les données partagées par plusieurs modules vont dans `core/`, en données pures** (sans navigateur ni
  Phaser) : fiches des armes, prix du hangar, table des mondes, textes de l'histoire. Comme les niveaux,
  elles restent lisibles par Node, donc vérifiables par un script (`check-levels` en est le modèle).
- **Les contrats de `core/types.ts` changent rarement** et toujours avec tous leurs utilisateurs.

---

## 2. Arborescence

```
src/
  main.ts          point d'entrée → startApp()
  core/            contrats (types.ts), identifiants (ids.ts), table des mondes (worlds.ts), étapes (stages.ts),
                   textes de l'histoire et radio de LUMA (story.ts), sauvegarde (save.ts), fiches des armes
                   (weapons.ts), canons de la Comète (shipGuns.ts), catalogue et calculs du hangar (hangar.ts)
  ui/              coquille : App.ts, enchaînement pur (flow.ts), HUD (hud.ts), radio de LUMA (radio.ts),
                   écrans (screens/), fondu, icônes, utilitaires DOM
  story/           bulle de LUMA (bubble.ts), portraits, lecteur de cinématiques (player.ts), scènes (scenes/),
                   décors des cinématiques (art/) ; chargé à la demande
  input/           clavier, commandes tactiles, inclinaison → un état d'entrée unique
  audio/           moteur Web Audio, effets (sfx), musiques procédurales ; sons du monde 1 (world1Sfx.ts,
                   world1Tracks.ts)
  game2d/          mode plateforme : engine/ (scène, Kaï, ennemis, tirs, sorties et arrivées exit.ts, arène
                   arena.ts, boss bosses/ (Blob-roi, Scarabée-titan, méduse-baleine), événements levelEvents.ts,
                   glyphes glyphs.ts, champignons mushrooms.ts, tronc trunk.ts, pluie de spores sporeRain.ts,
                   naufragé npc.ts, instantané du combat snapshot.ts…), art/ (dessins, dont draw/beacon.ts,
                   draw/bosses.ts, draw/world1.ts ; créature du décor dans parallax.ts), levels/ (un dossier par
                   monde : jungle/j1.ts, j2.ts, j3.ts)
  rift/            arène 3D d'une faille (survie, 3 vagues), chargée à la demande ; pas une étape de campagne
  game3d/          mode vol : flight.ts (partie), parcours et vagues, portails, astéroïdes, tir (shots.ts),
                   ennemis (enemies.ts), cristaux (pickups.ts), créatures, ciel
preview/           pages d'outil du serveur de dev : graphismes 2D (art), vol simulé (flight), sons du monde 1
                   (audio), cinématiques (story), boss (bosses), dessins du monde 1 (props), modèle de Kaï (kai)
scripts/           check-levels.ts (validation des niveaux 2D), lib/reach.ts (graphe d'accessibilité)
tests/e2e/         tests navigateur (lanceur run.mjs, lib/, scenarios/)
tools/             scripts Windows : environnement, SDK Android, APK
android/           projet natif Capacitor
docs/              documents (voir section 5)
```

Le détail fichier par fichier est dans la section « Architecture » de [CLAUDE.md](../CLAUDE.md).

---

## 3. Les flux principaux

- **Démarrage** : `main.ts` → `startApp()` crée les entrées, le son, le HUD, puis affiche l'accueil.
- **La campagne** : `core/worlds.ts` (`WORLDS`) → `core/stages.ts` (`STAGES`) ; textes dans `core/story.ts`.
  La progression se lit dans la sauvegarde par identifiants (`core/save.ts` : `isUnlocked`, `nextToPlay`).
- **Une étape** : `startStage` (fondu, carte d'intro) → `loadMode` (import dynamique du moteur) →
  `StartMode(conteneur, étape, hooks)` → `ModeHandle`. L'interface appelle `pause` / `resume` / `destroy` ;
  le mode appelle **une seule fois** `onComplete(résultat)` ou `onFail(raison, point de reprise?)`. `endRun`
  enregistre le résultat (cristaux ajoutés à la réserve, récompenses de l'étape) et affiche l'écran de résultats ou
  d'échec ; « Suivant » ouvre le hangar (`ui/flow.ts` : étape suivante, libellé du départ), dont le bouton de départ
  lance l'étape suivante.
- **Réessayer le combat** : un échec en plein combat de boss rend un point de reprise (`StartAt` : `{ at: 'boss' }`
  et un instantané opaque pour l'interface, noté par le moteur 2D au point de contrôle d'avant l'arène :
  `game2d/engine/snapshot.ts`). L'écran d'échec le repasse tel quel dans `ModeHooks.startAt` au nouvel essai.
- **Radio de LUMA** : le mode appelle `HudApi.radio(id)` (fenêtres et déclencheurs du niveau :
  `game2d/engine/levelEvents.ts`) → `ui/radio.ts` (file, bulle de `story/bubble.ts`, bips) ; textes dans
  `core/story.ts` (`RADIO`).
- **Entrées** : événements → `InputManager` met à jour **un seul objet d'état**, modifié sur place (aucune
  allocation). Les modes lisent `hooks.input.state` à chaque image et `consumePress()` pour les appuis.
- **HUD** : les modes envoient des mises à jour partielles par `HudApi` (le 2D les regroupe avec
  `hudSync.ts`, une écriture du DOM par image au plus).
- **Sauvegarde** : `localStorage`, uniquement via `core/save.ts`.
- **Rendu** : un seul contexte WebGL par moteur, gardé d'une partie à l'autre ; pertes de contexte gérées
  (voir CLAUDE.md, « Rendus partagés »).

---

## 4. Conventions de code

- **Français** pour les commentaires (courts), les textes et les docs ; **anglais** pour les identifiants.
  Suivre le style du fichier modifié.
- **Performance mobile** : pas d'allocation dans les boucles de jeu (vecteurs, objets et projectiles
  recyclés en pools) ; en 3D, `InstancedMesh` pour tout ce qui est nombreux, moins de ~150 appels de dessin,
  pixelRatio ≤ 1,5, pas de post-traitement plein écran.
- **Graphismes et sons procéduraux** : dessinés par code (`game2d/art/draw/`, géométries three) et
  synthétisés (`audio/`). Les clés de textures (`game2d/art/keys.ts`) découplent le dessin du moteur : on
  pourra remplacer un dessin par une image sans toucher au moteur.
- **Données lisibles par Node** (niveaux, constantes, données de `core/` : identifiants, mondes, textes, armes,
  hangar) : TypeScript « effaçable » (ni `enum` ni `namespace`), imports de valeurs avec l'extension `.ts`, rien
  qui dépende du navigateur. Les listes d'identifiants vivent à l'exécution (`core/ids.ts`, `as const`) et les
  unions en découlent : check-levels les lit au lieu de les recopier.
- **Tables plutôt que conditions** : un `Record<ThemeId, …>` fait échouer la compilation s'il manque un
  monde, alors qu'un `theme === 'jungle' ? … : …` donne silencieusement l'aspect d'un autre monde. Une table par
  fichier de dessin (pas de fichier central des thèmes) : tsc donne la liste des fichiers à compléter.
- **Aides de développement** (`window.__xr2d`, `__xr3d`, `__xrShell`) seulement sous
  `import.meta.env.DEV` ; elles servent aux tests navigateur.
- **Erreurs** : le son et les entrées ne doivent jamais faire planter le jeu (`ui/services.ts` avale leurs
  erreurs) ; les erreurs de rendu passent par `reportError` et les reprises de contexte.

---

## 5. Documents et suivi des tâches

| Document | Contenu | Quand le mettre à jour |
|---|---|---|
| [CLAUDE.md](../CLAUDE.md) | règles, commandes, recettes, pièges (pour Claude) | quand une règle ou l'architecture change |
| [README.md](../README.md) | présentation, lancer le jeu, construire l'APK | quand une commande ou un raccourci change |
| [GDD.md](GDD.md) | conception **du jeu tel qu'il est** | quand une fonctionnalité est livrée |
| [SOUHAITS.md](SOUHAITS.md) | **liste des tâches** (cases à cocher), idées, ordre de travail | à chaque décision et à chaque tâche finie |
| [HISTOIRE.md](HISTOIRE.md) | trame en 5 mondes, personnages, cinématiques | si l'histoire change |
| [plans/](plans/README.md) | un plan technique par étape, et leur état | avant de coder une étape, puis à sa fin |
| [discussions-ia/](discussions-ia/README.md) | débats entre IA et l'utilisateur, un fil par sujet (`/discussion`) ; rien n'y est décidé | à chaque prise de parole ; ce qui est retenu passe dans `SOUHAITS.md` puis le plan |
| `.cursor/rules/claude-code.mdc` | ce qui ne vaut que pour Cursor (le reste : CLAUDE.md, qu'il lit aussi) | quand la façon de travailler de Cursor change |
| ARCHITECTURE.md | ce fichier | quand un module ou une couche apparaît |
| `REPRISE.md` (au besoin) | notes de reprise ponctuelles (après un arrêt) | en fin de séance si du travail reste en cours ; supprimé une fois la reprise faite |
| [tests/e2e/README.md](../tests/e2e/README.md) | écrire et lancer les tests navigateur | quand le banc de test change |

### Le cycle d'une fonctionnalité

1. **Idée** : ajoutée dans `SOUHAITS.md`, section « à discuter ».
2. **Retenue** par l'utilisateur : déplacée dans les souhaits retenus, avec ses cases.
3. **Plan technique** : `docs/plans/NN-nom.md` (modèle dans [plans/README.md](plans/README.md)).
4. **Validation** : les choix proposés passent dans la section « Décisions » du plan.
5. **Code**, dans l'ordre de réalisation du plan, par petits morceaux vérifiables.
6. **Vérifications** (ci-dessous), essai sur téléphone si c'est du ressenti (contrôles, équilibrage).
7. **Docs** : GDD (le jeu a changé), CLAUDE.md (une règle a changé), cases cochées dans `SOUHAITS.md`,
   état du plan dans `plans/README.md`.
8. **Commit**, seulement quand l'utilisateur le demande.

### « Terminé » veut dire

- [ ] `npm run typecheck` et `npm run check-levels` sans erreur
- [ ] `npm run build` passe
- [ ] tests navigateur verts (`npm test` ; suite `full` si le rendu, le cycle de vie, le son ou les
      commandes ont changé), et un scénario pour la nouveauté
- [ ] essayé sur téléphone si ça touche au ressenti
- [ ] documents à jour, cases cochées

---

## 6. Où ranger le code à venir

Emplacements prévus par les plans de la [feuille de route](SOUHAITS.md#ordre-de-travail). Ceux des étapes 1,
2, 3a, 3b, 4a et 4b sont les emplacements réels (étapes codées).

| Besoin | Emplacement | Étape |
|---|---|---|
| Stick à 8 directions, appui `interact` | `input/stick.ts` (secteurs), `input/touch.ts`, `input/index.ts`, `input/keyboard.ts` | 1 |
| Réglage des commandes (taille, opacité, gaucher) | `ui/screens/options.ts` (`CHOICES`), `input/touch.ts` (`setOptions`), `core/save.ts` | 1 |
| Visée, accroupi, descente d'étage | `game2d/engine/Player.ts`, `PlatformScene.ts`, `weapons.ts` ; constantes dans `game2d/constants.ts` | 1 |
| Portes | `game2d/engine/doors.ts`, `game2d/art/draw/doors.ts`, `LEGEND` (`D`), `engine/mapBuilder.ts`, `scripts/check-levels.ts` | 1 |
| Bras armé dessiné à part | `game2d/art/draw/player.ts` (`drawArmFrame`), `game2d/art/keys.ts` (`ARM_TEX`, `ARM_RIG`, `ARM_MUZZLE`) | 1 et 2 |
| Fiches des armes | `core/weapons.ts` (`WEAPONS`, `WEAPON_IDS`, `resolveWeapon`, `WeaponMods` pour le hangar) | 2 |
| Arme générique, projectiles | `game2d/engine/weapons.ts` (`Gun`), `projectiles.ts` (`ShotPool`) ; images `art/draw/items.ts` (`drawBullet`, `BULLET_TEX` / `BULLET_SIZE`) | 2 |
| Bonus vitesse et cadence | `game2d/engine/PlatformScene.ts` (`speedLeftMs`, `rapidLeftMs`), `Player.ts` (`speedMul`), `effects.ts` ; `ui/hud.ts` (anneaux) | 2 |
| Équipement (`Loadout` : arme, armes possédées, compétences ; `PlayLoadout` : équipement effectif d'une partie) | `core/save.ts` (`getLoadout`, `equipWeapon`, `setSessionWeapon`, `playLoadout`), `core/hangar.ts` (`buildPlayLoadout`), `ModeHooks.loadout` ; `?weapon=` (`ui/App.ts`) | 2 et 3a |
| Sauvegarde v2 (réserve, migration) | `core/save.ts` (`load`, `readBase`, `readV2`, `recordResult`, `purchase`), `core/types.ts` | 3a |
| Prix, conditions et effets du hangar | `core/hangar.ts` (catalogue `HANGAR_ITEMS`, `itemState`, `applyPurchase` ; pur) | 3a |
| Écran du hangar, aperçu | `ui/screens/hangar.ts`, `ui/hangarPreview.ts` (chargé à la demande) ; enchaînement dans `ui/App.ts` (`goHangar`, `makeResults`) | 3a |
| Effets des achats en jeu | `game2d/engine/weapons.ts` (`Gun` : `mods`), `PlatformScene.ts` (`maxHearts`), `game3d/flight.ts` (`maxShield`, `gunLevel` ; module Turbo : `ShipGun` de `game3d/shots.ts`) ; `ui/hud.ts` (4-5 cœurs / boucliers) | 3a et 3b |
| Canons de la Comète (fiches) | `core/shipGuns.ts` (`SHIP_GUNS`, `SHIP_GUN_MULS`, `SHIP_AIM`, `resolveShipGun` ; pur) ; canons du modèle dans `game3d/ship.ts` | 3b |
| Tir, ennemis et cristaux en vol | `game3d/shots.ts` (canon, visée, projectiles), `game3d/enemies.ts` (chasseur, mine, essaim, orbes), `game3d/pickups.ts` (cristaux), `game3d/courses.ts` (`genWaves`), `game3d/asteroids.ts` (PV, cristal) ; branchés dans `game3d/flight.ts` (`updateGun`, `shotHit`) | 3b |
| Commandes du vol (TIR, TURBO) et énergie | `input/touch.ts` et `input/styles.ts` (`.xr-shoot`, `.xr-boost`) ; énergie partagée : `game3d/shots.ts` (`ShipGun.boost` / `step`), `core/shipGuns.ts` (`SHIP_ENERGY`) ; HUD du vol `ui/hud.ts` (`.fl-energy`, `.fl-crystals`) | 3b (amendée le 29/10/2026) |
| Listes d'identifiants (thèmes, parcours, musiques, boss) | `core/ids.ts` (`as const`) → unions de `core/types.ts` | 4a |
| Table des mondes et des étapes | `core/worlds.ts` (`WORLDS` : gardien, naufragé, boss du vol, étapes, récompenses) → `STAGES` (`core/stages.ts`) | 4a |
| Progression par identifiants, récompenses | `core/save.ts` (`isCleared`, `isUnlocked`, `nextToPlay`, `isFresh`, `recordResult`, `story.seen`) | 4a |
| Décisions pures de l'enchaînement | `ui/flow.ts` (`stageAfter`, `departLabel`, `playSubtitle`) | 4a |
| Écran Niveaux en pages, récompenses aux résultats | `ui/screens/select.ts`, `ui/screens/results.ts` | 4a |
| Tables par thème côté 2D | une table `Record<ThemeId, …>` par fichier de `game2d/art/` (`TILE_STYLES`, `BG_STYLES`, `PARALLAX_STYLES`, `ENEMIES`, `MOVERS`, `DOOR_STYLES`), `ui/icons.ts` (`PLATFORM_ICONS`) | 4a |
| Niveaux par monde | `game2d/levels/<monde>/` (`levels/jungle/j1.ts`, `j2.ts`, `j3.ts`) | 4a et 4b |
| Sorties (Comète, balise) et arrivées | `game2d/engine/exit.ts` (`createExit`, `createArrival`) ; dessin `art/draw/beacon.ts` | 4a |
| Arène, mini-boss et boss 2D (en touches) | `game2d/engine/arena.ts` ; `game2d/engine/bosses/` (contrat `types.ts`, registre `index.ts`, un fichier par boss : `blobKing.ts`, `beetleTitan.ts`, `whale.ts`) ; dessins `art/draw/bosses.ts` ; barre `ui/hud.ts` | 4a et 4b |
| Défaite du gardien en sortie | `game2d/engine/PlatformScene.ts` (`startGuardianExit`, `landKai`) ; `LevelData.ending: 'guardian'` | 4b |
| Événements d'un niveau (radio, ombre, secousse, spores) | `game2d/engine/levelEvents.ts` ; joués par `PlatformScene.playLevelEvent` : `art/parallax.ts` (`shadowPass`), `engine/trunk.ts`, `engine/sporeRain.ts` | 4a et 4b |
| Créature du décor (distance, ombre) | `game2d/art/parallax.ts` (`CREATURES`, `setCreature`, `shadowPass`) ; `createParallax(scene, theme, opts?)` | 4b |
| Champignons | `game2d/engine/mushrooms.ts` ; rebond dans `Player.ts` ; `MUSHROOM_*` de `constants.ts` ; graphe `scripts/lib/reach.ts` | 4b |
| Naufragé (Tess) | `game2d/engine/npc.ts` ; récompense `crew` de `core/worlds.ts` ; `PlayLoadout.crew` ; hangar `ui/screens/hangar.ts`, `ui/hangarPreview.ts` | 4b |
| Glyphes des ruines, dessins du monde 1 (champignon, tronc, Tess, `=`) | `game2d/engine/glyphs.ts` ; dessins `art/draw/world1.ts`, objets générés par `art/index.ts` (`generateLevelArt`) | 4a et 4b |
| « Réessayer le combat » | `game2d/engine/snapshot.ts` (`FightSnapshot`) et `snapshot()` / `restore()` des modules ; `PlatformScene.ts` (`noteFight`, `restoreFight`, `fightRetryPoint`) ; `ui/App.ts`, `ui/screens/outcome.ts` | 4b |
| Textes de l'histoire, radio de LUMA | `core/story.ts` (données) ; `ui/radio.ts` (file, bips) ; bulle `story/bubble.ts` | 4a |
| Sons et musiques du monde 1 | `audio/world1Sfx.ts`, `audio/world1Tracks.ts` (intensités : `musicLevel`) | 4a |
| Graphe d'accessibilité des niveaux | `scripts/lib/reach.ts` (lu par `scripts/check-levels.ts`) | 4a |
| Cinématiques | `src/story/` : lecteur `player.ts` + une scène par cinématique (`scenes/`) ; écran `ui/screens/cutscene.ts` | 4c |
| Boss des vols | `game3d/bosses/` (léviathan : `leviathan.ts`) | 4c, en place |
| Carte galactique | `ui/screens/galaxy.ts` | 6 |

### Points de vigilance avant de grandir

- **Mondes codés en dur** : résolu côté 2D en 4a (tables `Record<ThemeId, …>` dans chaque fichier de dessin,
  `PLATFORM_ICONS`, `THEME_IDS` lu par check-levels et `preview/art.ts` ; rendu inchangé, vérifié au pixel par
  `theme-captures`). Restent : les choix `'nebula'` / `'asteroids'` du vol (`game3d/flight.ts`,
  `environment.ts`, `planets.ts`, `ui/icons.ts`, `preview/flight.ts` : tables en 4c), les CSS `.card--moon` /
  `.intro--moon` (un thème inconnu prend les couleurs de la jungle), et `art/draw/world1.ts`, dessiné pour la Jungle.
- **Progression des joueurs** : résolu en 4a. Une étape est réussie si son `id` figure dans `best`, ouverte si
  c'est la première, une réussie ou la suivante d'une réussie : j2 et j3, insérés au milieu en 4b, n'ont demandé
  aucune migration. `save.unlocked` (index) est encore écrit mais plus lu. Ne jamais renommer les `id` existants
  (`j1`, `j2`, `j3`, `f1`, `m1`, `f2`) : ce sont les clés des meilleurs scores.
- **Tests et nombre d'étapes** : résolu en 4b pour l'essentiel (`menu` et `progress-ids` lisent l'ordre des cartes,
  `campaign-flow` compare à la règle d'ouverture, `stress-laps` et `theme-captures` suivent `STAGES`, `stageBefore`
  donne l'étape d'avant un vol). Restent écrits en dur : l'ordre et les titres du monde 1 (`menu`), le parcours de
  `campaign-flow` et de `hangar`, et 16 / 22 portails (`flight-look`, `flight-autopilot`).
- **Gros fichiers** : `game3d/enemies.ts` (~1510 lignes), `game3d/flight.ts` (~1410),
  `game2d/engine/PlatformScene.ts` (~1440), `game2d/engine/bosses/whale.ts` (~1150), `bosses/beetleTitan.ts`
  (~800), `ui/App.ts` (~900), `ui/screens/hangar.ts` (~850), `game2d/engine/Player.ts` (~680),
  `scripts/check-levels.ts` (~1050) ; dessins `art/draw/bosses.ts` (~2320) et `world1.ts` (~2070), longs mais
  faits de fonctions indépendantes. Y sortir les nouveautés dans leurs propres fichiers (les sorties l'ont été dans
  `engine/exit.ts`, l'arène dans `arena.ts`, les boss dans `bosses/`, les événements dans `levelEvents.ts`, les
  glyphes dans `glyphs.ts`, en 4b les champignons, le tronc, la pluie de spores, le naufragé et l'instantané du
  combat dans `mushrooms.ts`, `trunk.ts`, `sporeRain.ts`, `npc.ts`, `snapshot.ts` ; les décisions pures de
  l'enchaînement dans `ui/flow.ts`, la radio dans `ui/radio.ts` ; avant : portes, hangar, tir et ennemis du vol)
  plutôt que de les allonger. `PlatformScene.ts` a encore pris ≈ 290 lignes en 4b (branchements des objets, de la
  défaite du gardien et du nouvel essai) : le prochain monde devra en sortir une part (par exemple le combat de
  boss et l'instantané dans un module à part).
- **Un seul contexte WebGL par moteur** : pas de second rendu 3D pour un aperçu ou une cinématique.
  Les cinématiques se jouent sur un `<canvas>` 2D de l'interface (`story/player.ts`), avec les dessins du jeu 2D.
