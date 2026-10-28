# Plans techniques — état des étapes

Un plan par étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). On l'écrit **avant** de coder
en lisant le code concerné ; l'utilisateur valide les choix proposés, qui passent dans la section
« Décisions ». Organisation générale : [ARCHITECTURE.md](../ARCHITECTURE.md).

## État au 28/10/2026

| Étape | Plan | État |
|---|---|---|
| 1. Contrôles 2D (stick à 8 directions, visée, accroupi, descente, portes, réglage des boutons) | [01-controles.md](01-controles.md) | codé et vérifié par la suite e2e complète (branche `plans-etapes-1-3`) ; essai sur téléphone à faire (secteurs d'angle du stick, taille) |
| 2. Armes et nouveaux bonus | [02-armes.md](02-armes.md) | codé et vérifié par la suite e2e complète (nouveaux scénarios `weapons` / `powerups`) ; essai sur téléphone à faire (réglage des armes, sons, vitesse) |
| 3. Hangar (3a : hangar et armes de Kaï ; 3b : combat en vol) | [03-hangar.md](03-hangar.md) | 3a codée et vérifiée par la suite e2e complète (scénarios adaptés, nouveau scénario `hangar`, hangar de 844x390 à 568x320) ; essai sur téléphone à faire ; 3b (combat en vol) et la balise à coder |
| 4. Monde 1 complet au nouveau format (4a fondations, 4b la Jungle, 4c histoire et vol) | [04-monde-1.md](04-monde-1.md) | rédigé ; choix proposés en attente de validation |
| 5. Monde 2 au même format | à écrire | — |
| 6. Carte galactique, puis Boréa, Vulkar, Cœur de la Faille | à écrire | — |
| 7. Objets secrets et niveaux bonus | à écrire | — |

Les étapes 1 à 3 se codent dans l'ordre : l'étape 2 utilise la visée de l'étape 1, l'étape 3 les fiches
d'armes de l'étape 2.

## Prochaine action

1. **Vérifier l'arbre Git** : les étapes 1, 2 et 3a sont sur la branche `plans-etapes-1-3`, **non commitées** ;
   commit sur demande de l'utilisateur (`npm run build` doit passer avant).
2. **Trancher les points relevés** par les tests de 3a (fin de la section Tests de
   [03-hangar.md](03-hangar.md) : cœurs au point de contrôle, musique au retour du hangar, message du hangar
   par-dessus la liste, niveau 1 des dégâts sans effet visible).
3. **Essai des étapes 1, 2 et 3a sur téléphone** (`tools\build-apk.cmd` puis `tools\install-apk.cmd`) :
   - stick : secteurs d'angle (`STICK_SECTORS`, `src/input/stick.ts`) et taille (crans `TOUCH_SIZE_STEPS`,
     `src/input/touch.ts`) ;
   - armes : tableau des fiches (`WEAPONS`, `src/core/weapons.ts` ; les armes s'essaient au hangar en mode
     test, pour la session, ou avec `?weapon=`), sons de tir (`src/audio/sfx.ts`), bonus de vitesse et de
     cadence (`SPEED_BOOST_MUL`, `RAPID_FIRE_MUL`, `POWER_DURATION_MS`) ;
   - hangar : lisibilité sur petit écran (cartes, message, confirmation), prix et multiplicateurs (`PRICES`,
     `UPGRADE_MULS`, `BOOST_MULS` de `src/core/hangar.ts`), gain de cristaux par niveau.

   Après un réglage : reporter les valeurs dans le GDD, dans la section « Décisions » du plan concerné et dans
   les tests (`SPECS` de `tests/e2e/scenarios/weapons.mjs`, `SPEED_MUL` / `DURATION_MS` de `powerups.mjs`, prix
   et multiplicateurs recopiés par `hangar.mjs` et `small-screens.mjs` : liste dans
   [tests/e2e/README.md](../../tests/e2e/README.md), « Scénario du hangar »), puis `npm test` et
   `npm run e2e -- weapons powerups hangar small-screens`.
4. **Faire valider les choix proposés du plan 4** ([04-monde-1.md](04-monde-1.md), chacun finit par sa
   question, dont « 4a peut-elle commencer avant la fin de 3b ? ») ; les réponses passent dans une section
   « Décisions ».
5. **Coder l'étape 3b** (combat en vol) en suivant l'« Ordre de réalisation » de [03-hangar.md](03-hangar.md) ;
   sa section « Ce qui existe déjà » donne l'état après 3a (canon de la Comète déjà acheté et transmis au vol,
   boucliers et turbo déjà branchés, cristaux du vol à remplir dans `StageResult.crystals`).
6. **Balise de LUMA** (point 16 du plan 03) : à la fin de 3b, ou au début de l'étape 4 si le plan 4 est validé
   tel quel (il la place dans 4a, avec les sorties communes).

## Questions encore ouvertes

- Choix proposés du plan 4 (découpage 4a / 4b / 4c, progression par identifiants, étapes et noms, boss,
  cinématiques, léviathan…).
- Styles des niveaux bonus (étape 7, rien ne presse).
- Valeurs chiffrées (armes, bonus, prix) : à régler après essai sur téléphone.

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
