# Xeno Rift — architecture et organisation

Vue d'ensemble du code et des documents, pour un humain comme pour Claude. Les règles détaillées et les
« recettes » (ajouter un niveau, un réglage, un son…) sont dans [CLAUDE.md](../CLAUDE.md) ; ce fichier
explique **comment les morceaux tiennent ensemble** et **où ranger le code à venir**.

---

## 1. Les couches

```
                     main.ts  →  ui/App.ts   (point d'entrée, assemble tout)
                                    │
          ┌─────────────────────────┼──────────────────────────────┐
          │                         │                              │ import dynamique
          ▼                         ▼                              ▼
   input/  audio/            ui/ (écrans, HUD,             game2d/      game3d/
   (adaptateurs :            enchaînement)                 (Phaser)     (three)
    clavier, tactile,                                     moteurs de jeu
    Web Audio…)                                                │
          │                         │                          │
          └─────────────────────────┴──────────────┬───────────┘
                                                   ▼
                                    core/  (contrats et données — ne dépend de rien)
```

**Règle de dépendance : tout pointe vers `core/`.**

- `core/` n'importe rien. C'est le contrat commun : types, liste des étapes, format de sauvegarde.
- `input/`, `audio/`, `game2d/`, `game3d/` n'importent que `core/`.
- Les moteurs de jeu ne connaissent ni l'interface, ni le clavier, ni le son en direct : ils reçoivent
  `InputApi`, `AudioApi`, `HudApi` et les réglages par `ModeHooks` (inversion de dépendance). On peut ainsi
  tester un mode avec de faux branchements (`preview/flight.ts` le fait).
- `ui/` charge les moteurs par `import()` dynamique et ne leur parle que par `StartMode` / `ModeHandle` :
  Phaser et three ne ralentissent pas l'écran d'accueil.

Vérifié le 27/10/2026. Pour revérifier :

```bash
for m in core input audio game2d game3d; do echo "== $m"; grep -rhoE "from '(\.\./)+[a-zA-Z0-9]+" src/$m | sort | uniq -c; done
```

Sous `== core`, rien ne doit s'afficher. Ailleurs, seuls `core` et des fichiers du module lui-même
(`constants`, `art`… pour `game2d`) sont permis : jamais `ui`, `input`, `audio`, ni l'autre moteur.

### Correspondance avec une « clean architecture »

| Couche classique | Dans Xeno Rift |
|---|---|
| Domaine (entités, règles) | `core/` (types, étapes, sauvegarde), données de niveaux (`game2d/levels/`), constantes de gameplay (`game2d/constants.ts`) |
| Cas d'usage | `ui/App.ts` (déroulement d'une étape, progression), `core/save.ts` (`recordResult`, déblocage) |
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
  core/            contrats (types.ts), étapes (stages.ts), sauvegarde (save.ts)
  ui/              coquille : App.ts, HUD, écrans (screens/), fondu, icônes, utilitaires DOM
  input/           clavier, commandes tactiles, inclinaison → un état d'entrée unique
  audio/           moteur Web Audio, effets (sfx), musiques procédurales
  game2d/          mode plateforme : engine/ (scène, Kaï, ennemis, tirs…), art/ (dessins), levels/
  game3d/          mode vol : flight.ts (partie), parcours, portails, astéroïdes, créatures, ciel
preview/           pages d'outil du serveur de dev (aperçu des graphismes 2D, vol simulé)
scripts/           check-levels.ts (validation des niveaux 2D)
tests/e2e/         tests navigateur (lanceur run.mjs, lib/, scenarios/)
tools/             scripts Windows : environnement, SDK Android, APK
android/           projet natif Capacitor
docs/              documents (voir section 5)
```

Le détail fichier par fichier est dans la section « Architecture » de [CLAUDE.md](../CLAUDE.md).

---

## 3. Les flux principaux

- **Démarrage** : `main.ts` → `startApp()` crée les entrées, le son, le HUD, puis affiche l'accueil.
- **Une étape** : `startStage` (fondu, carte d'intro) → `loadMode` (import dynamique du moteur) →
  `StartMode(conteneur, étape, hooks)` → `ModeHandle`. L'interface appelle `pause` / `resume` / `destroy` ;
  le mode appelle **une seule fois** `onComplete(résultat)` ou `onFail(raison)`. `endRun` enregistre le
  résultat et affiche l'écran de résultats ou d'échec.
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
- **Données lisibles par Node** (niveaux, constantes, futures données de `core/`) : TypeScript « effaçable »
  (ni `enum` ni `namespace`), imports de valeurs avec l'extension `.ts`, rien qui dépende du navigateur.
- **Tables plutôt que conditions** : un `Record<ThemeId, …>` fait échouer la compilation s'il manque un
  monde, alors qu'un `theme === 'jungle' ? … : …` donne silencieusement l'aspect d'un autre monde.
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
| ARCHITECTURE.md | ce fichier | quand un module ou une couche apparaît |
| [REPRISE.md](REPRISE.md) | notes de reprise ponctuelles (après un arrêt) | en fin de séance si du travail reste en cours |
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

Emplacements prévus par les plans de la [feuille de route](SOUHAITS.md#ordre-de-travail).

| Besoin | Emplacement | Étape |
|---|---|---|
| Stick à 8 directions, appui `interact` | `input/touch.ts`, `input/index.ts`, `input/keyboard.ts` | 1 |
| Visée, accroupi, descente d'étage | `game2d/engine/Player.ts`, `PlatformScene.ts` | 1 |
| Portes | `game2d/engine/doors.ts` (nouveau), légende des niveaux | 1 |
| Bras armé dessiné à part | `game2d/art/draw/player.ts`, `art/keys.ts` | 1 et 2 |
| Fiches des armes | `core/weapons.ts` (données) | 2 |
| Arme générique, projectiles | `game2d/engine/weapons.ts` (`Gun`), `projectiles.ts` | 2 |
| Sauvegarde v2 (équipement, réserve, migration) | `core/save.ts`, `core/types.ts` | 2 et 3 |
| Prix et conditions du hangar | `core/hangar.ts` (données) | 3 |
| Écran du hangar | `ui/screens/hangar.ts` | 3 |
| Tir et ennemis en vol | `game3d/shots.ts`, `game3d/enemies.ts` | 3 |
| Table des mondes, liste des 20 étapes | `core/worlds.ts` (données) → `STAGES` construit à partir d'elle | 4 |
| Niveaux par monde | `game2d/levels/<monde>/` | 4 |
| Mini-boss et boss 2D | `game2d/bosses/` : un fichier par boss, un contrat `Boss` commun | 4 |
| Boss des vols | `game3d/bosses/` | 4 |
| Textes de l'histoire, radio de LUMA | `core/story.ts` (données) ; bulle de radio dans `ui/` | 4 |
| Cinématiques | `src/story/` : un lecteur commun + une description par cinématique | 4 |
| Carte galactique | `ui/screens/galaxy.ts` | 6 |

### Points de vigilance avant de grandir

- **Mondes codés en dur** : 61 tests `'jungle'` / `'moon'` dans 13 fichiers, et des choix `'nebula'` /
  `'asteroids'` dans 6. Les remplacer par des tables par monde (`Record<ThemeId, …>`) **avant** d'ajouter
  Boréa, sinon le nouveau monde prendra l'aspect d'un ancien sans erreur de compilation.
- **Progression des joueurs** : `save.unlocked` est un **index** dans `STAGES`. Passer de 4 à 20 étapes
  en insérant des niveaux au milieu impose une migration (retrouver l'étape par son `id`). Ne jamais
  renommer les `id` existants (`j1`, `f1`, `m1`, `f2`) : ce sont les clés des meilleurs scores.
- **Tests qui supposent 4 étapes et 16 / 22 portails** : les faire lire `STAGES` et `COURSES`.
- **Gros fichiers** : `game3d/flight.ts` (~1050 lignes), `ui/App.ts` (~780), `game2d/engine/PlatformScene.ts`
  (~710). Y sortir les nouveautés dans leurs propres fichiers (tir et ennemis du vol, enchaînement du
  hangar, règles des portes et des boss) plutôt que de les allonger.
- **Un seul contexte WebGL par moteur** : pas de second rendu 3D pour un aperçu ou une cinématique.
  Les cinématiques se jouent dans le moteur déjà ouvert, ou en DOM.
