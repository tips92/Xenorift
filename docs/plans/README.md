# Plans techniques — état des étapes

Un plan par étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). On l'écrit **avant** de coder
en lisant le code concerné ; l'utilisateur valide les choix proposés, qui passent dans la section
« Décisions ». Organisation générale : [ARCHITECTURE.md](../ARCHITECTURE.md).

## État au 28/10/2026

| Étape | Plan | État |
|---|---|---|
| 1. Contrôles 2D (stick à 8 directions, visée, accroupi, descente, portes, réglage des boutons) | [01-controles.md](01-controles.md) | codé et vérifié par la suite e2e complète (branche `plans-etapes-1-3`) ; essai sur téléphone à faire (secteurs d'angle du stick, taille) |
| 2. Armes et nouveaux bonus | [02-armes.md](02-armes.md) | codé et vérifié par la suite e2e complète (nouveaux scénarios `weapons` / `powerups`) ; essai sur téléphone à faire (réglage des armes, sons, vitesse) |
| 3. Hangar (3a : hangar et armes de Kaï ; 3b : combat en vol) | [03-hangar.md](03-hangar.md) | 3a et 3b codées et vérifiées par la suite e2e complète (branche `plans-etapes-1-3` ; 3a et 3b commitées ; nouveaux scénarios `hangar` et `flight-combat`, captures et tests relus) ; essai sur téléphone à faire (3b : lisibilité des tirs et des ennemis, tir automatique, bouton TIR, réglages) ; la balise (point 16) est faite à l'étape 4 |
| 4. Monde 1 complet au nouveau format (4a fondations, 4b la Jungle, 4c histoire et vol) | [04-monde-1.md](04-monde-1.md) | décisions validées le 28/10 (les 19 choix tels quels) ; en cours de réalisation sur la branche `claude/world-1-completion-866505` ; la balise de LUMA (point 16 du plan 03) est faite ici, en 4a |
| 5. Monde 2 au même format | à écrire | — |
| 6. Carte galactique, puis Boréa, Vulkar, Cœur de la Faille | à écrire | — |
| 7. Objets secrets et niveaux bonus | à écrire | — |

Les étapes 1 à 3 se codent dans l'ordre : l'étape 2 utilise la visée de l'étape 1, l'étape 3 les fiches
d'armes de l'étape 2.

## Prochaine action

1. **Vérifier l'arbre Git** : les étapes 1, 2 et 3a sont commitées sur la branche `plans-etapes-1-3` ; 3b y est
   **non commitée** ; commit sur demande de l'utilisateur (`npm run build` doit passer avant). L'étape 4 avance
   en parallèle sur `claude/world-1-completion-866505` (autre discussion, autre worktree), partie de `f4275db`
   (sans 3b) : sa partie 4c (vol, léviathan) demande 3b, donc la fusion des deux branches ; le plan 04 à jour
   (« Décisions ») est sur cette branche. Points de rencontre : « Ce qui existe déjà » de
   [03-hangar.md](03-hangar.md) (boss du vol : visée, impacts, orbes, phase `fly`, `COURSE_FP` de
   `flight-combat`).
2. **Trancher les points relevés** par les tests de 3a et de 3b (fin de la section Tests de
   [03-hangar.md](03-hangar.md)) : 3a : cœurs au point de contrôle, musique au retour du hangar, message du
   hangar par-dessus la liste, niveau 1 des dégâts sans effet visible ; 3b : tirs vus presque dans l'axe (des
   points), chasseur fin vu de face, mine peu lisible parmi les rochers de la ceinture, appui bref sur TIR perdu
   juste après un tir (mémoire de 150 ms, cadence du canon léger 250 ms), cristaux aimantés perdus à la
   distorsion, canon léger absent de l'aperçu du hangar.
3. **Essai des étapes 1, 2 et 3 sur téléphone** (`tools\build-apk.cmd` puis `tools\install-apk.cmd`) :
   - stick : secteurs d'angle (`STICK_SECTORS`, `src/input/stick.ts`) et taille (crans `TOUCH_SIZE_STEPS`,
     `src/input/touch.ts`) ;
   - armes : tableau des fiches (`WEAPONS`, `src/core/weapons.ts` ; les armes s'essaient au hangar en mode
     test, pour la session, ou avec `?weapon=`), sons de tir (`src/audio/sfx.ts`), bonus de vitesse et de
     cadence (`SPEED_BOOST_MUL`, `RAPID_FIRE_MUL`, `POWER_DURATION_MS`) ;
   - hangar : lisibilité sur petit écran (cartes, message, confirmation), prix et multiplicateurs (`PRICES`,
     `UPGRADE_MULS`, `BOOST_MULS` de `src/core/hangar.ts`), gain de cristaux par niveau ;
   - combat en vol (3b ; « Choix de réalisation de 3b » de [03-hangar.md](03-hangar.md), captures de
     `tests/e2e/out/flight-combat/` et `small-screens/`) : lisibilité des tirs, des ennemis et des orbes, tir
     automatique (cône et guidage `SHIP_AIM`), bouton TIR et option « Tir manuel », canons (`SHIP_GUNS`,
     `SHIP_GUN_MULS` de `src/core/shipGuns.ts`), ennemis (`ENEMY_DEFS` de `src/game3d/enemies.ts`), vagues
     (`waves` de `COURSES`), HUD du vol, fluidité (appels de dessin, images par seconde) et sons du vol.

   Après un réglage : reporter les valeurs dans le GDD, dans la section « Décisions » (ou « Choix de
   réalisation ») du plan concerné et dans les tests (`SPECS` de `tests/e2e/scenarios/weapons.mjs`, `SPEED_MUL` /
   `DURATION_MS` de `powerups.mjs`, prix et multiplicateurs recopiés par `hangar.mjs` et `small-screens.mjs`,
   `GUNS`, `POINTS`, `DROPS`, `WAVES`… de `flight-combat.mjs` : listes dans
   [tests/e2e/README.md](../../tests/e2e/README.md), « Scénario du hangar » et « Scénario du combat en vol »),
   puis `npm test` et `npm run e2e -- weapons powerups hangar small-screens flight-combat flight-autopilot`.
4. **Étape 4** : en cours dans une autre discussion (voir 1) ; elle y suit l'« Ordre de réalisation » du plan
   04 de sa branche.

## Questions encore ouvertes

- Points relevés par les tests de 3a et de 3b, à trancher (voir 2).
- Styles des niveaux bonus (étape 7, rien ne presse).
- Valeurs chiffrées (armes, canons, ennemis du vol, bonus, prix) : à régler après essai sur téléphone.

## Modèle d'un plan

```markdown
# Étape N — titre : plan technique

## Objectif            ce que le joueur pourra faire à la fin
## Ce qui existe déjà  fichiers concernés, avec ce qu'ils font aujourd'hui et ce qui gêne
## Décisions           choix validés par l'utilisateur, datés (avant validation : « Choix proposés »)
## Modifications prévues  points numérotés, regroupés par domaine, avec les fichiers
## Tests               scénarios à adapter, nouveaux scénarios, vérifications, essai sur téléphone
## Documentation à mettre à jour
## Ordre de réalisation   petits morceaux vérifiables, dans l'ordre
```
