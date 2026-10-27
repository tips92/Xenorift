# Plans techniques — état des étapes

Un plan par étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). On l'écrit **avant** de coder
en lisant le code concerné ; l'utilisateur valide les choix proposés, qui passent dans la section
« Décisions ». Organisation générale : [ARCHITECTURE.md](../ARCHITECTURE.md).

## État au 27/10/2026

| Étape | Plan | État |
|---|---|---|
| 1. Contrôles 2D (stick à 8 directions, visée, accroupi, descente, portes, réglage des boutons) | [01-controles.md](01-controles.md) | validé, prêt à coder |
| 2. Armes et nouveaux bonus | [02-armes.md](02-armes.md) | validé, prêt à coder |
| 3. Hangar (3a : hangar et armes de Kaï ; 3b : combat en vol) | [03-hangar.md](03-hangar.md) | validé, prêt à coder |
| 4. Monde 1 complet au nouveau format | à écrire | — |
| 5. Monde 2 au même format | à écrire | — |
| 6. Carte galactique, puis Boréa, Vulkar, Cœur de la Faille | à écrire | — |
| 7. Objets secrets et niveaux bonus | à écrire | — |

Les étapes 1 à 3 se codent dans l'ordre : l'étape 2 utilise la visée de l'étape 1, l'étape 3 les fiches
d'armes de l'étape 2.

## Prochaine action

1. Vérifier l'arbre Git : `git status`, `git log --oneline -3`. Git est en place depuis le 27/10 au soir
   (premier commit `bda3e52`, « Démo v0.1 »). Des modifications non commitées doivent être comprises (ou
   commitées sur demande de l'utilisateur) avant de commencer.
2. `npm test` doit être vert avant de commencer.
3. Coder l'**étape 1** en suivant son « Ordre de réalisation », point par point.
4. En parallèle de l'attente ou de la relecture : écrire le plan de l'**étape 4** (3 niveaux de la Jungle,
   2 mini-boss, méduse-baleine, prologue, LUMA, vol avec le léviathan) à partir de
   [HISTOIRE.md](../HISTOIRE.md).

## Questions encore ouvertes

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
