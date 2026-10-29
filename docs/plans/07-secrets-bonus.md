# Étape 7 — objets secrets et niveaux bonus : plan technique

> **État au 29/10/2026 : choix proposés, rien n'est codé.** Dernière étape de
> l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). On code après validation. L'étape suppose la **carte**
> (6a) et, pour les secrets qui demandent un geste, les compétences déjà apprises (double saut, glissade,
> saut mural, grappin). On peut **poser les secrets des mondes 1 et 2 dès la fin de l'étape 5** si la carte
> existe ; les mondes 3 à 5 suivent l'étape 6.
>
> **Ajusté le 29/10 au soir, puis une seconde fois.** Secrets par case, sans monter la version, sans compteur
> dans le HUD. La bourse vaut le prix du premier cœur. Le jetpack ne garde que le saut et le tir. Les `S` se
> posent d'abord dans les cachettes déjà dessinées. On essaie le jetpack sur téléphone avant d'écrire la
> défense. Un échec de niveau n'efface pas un secret déjà pris.

## À valider

1. **3 objets secrets par niveau de plateforme**, pas dans les vols. Ce ne sont pas les cristaux déjà hors
   de portée. Les 3 étoiles restent un compte de **cristaux**. Les secrets débloquent un bonus, ils ne
   changent pas les étoiles. *D'accord ?*
2. **Deux styles seulement** pour commencer : une **course en jetpack** (le moteur 2D, Kaï avance seul) et
   une **défense de la Comète** (le moteur de vol, la Comète ne avance pas, des vagues arrivent). Les trois
   autres pistes (tir à défilement, chute libre, rover) attendent qu'un de ces deux-là soit jugé bon sur
   téléphone. *Ces deux-là en premier ?*
3. **Un niveau bonus par monde**, ouvert quand les **9** secrets de ses 3 niveaux de plateforme sont pris
   (au total, pas 3 d'un coup dans la même partie). Le rejouer ne les redemande pas. *9 pour un bonus, ou
   3 secrets d'un niveau pour un bonus de ce niveau ?*
4. **Récompense** : une bourse à la **première** réussite, du montant du premier cœur (`PRICES.heart[0]`,
   150 aujourd'hui), plus les cristaux ramassés pendant la course (perdus si on échoue). Pas de pièce rare
   du hangar dans cette étape. *Ce montant, et pas de pièce rare ?*
5. **Ozzo** affiche sur la carte, par étape, combien de secrets restent (0 à 3). Sans Ozzo, la carte ne
   montre aucun chiffre ; les secrets existent quand même. *D'accord ?*
6. **Certains secrets exigent une compétence** (double saut, glissade, saut mural, grappin) et se prennent
   en revenant plus tard. Le chemin vers la sortie, lui, ne doit pas exiger un secret. *D'accord ?*

## Objectif

- Chaque niveau de plateforme cache **3 secrets**. Les trouver tous dans un monde ouvre **un** niveau bonus
  de ce monde.
- Le bonus du monde 1 est une course jetpack. Celui du monde 2 est une défense de la Comète. Les mondes
  suivants **réutilisent** ces deux styles (monde impair : jetpack, monde pair : défense) tant que les autres
  styles ne sont pas choisis.
- Avec Ozzo à bord, la carte dit combien il en reste. Dans le niveau, pas de compteur.
- Finir un bonus la première fois verse une bourse de cristaux.

## Ce qui existe déjà

- **Cristaux hors de portée** (« secrets de compétence ») : check-levels les marque en avertissement et exige
  que les 3 étoiles (`STARS_RATIO.three`, 90 % des cristaux) soient possibles **sans** eux. La Jungle en a
  déjà (branche de j2, branche de j3). On les **laisse**. Un secret nouveau n'est pas un cristal : lettre
  différente, pas dans le score des étoiles.
- **Pas d'objet secret**, pas de compte dans la sauvegarde, pas de niveau bonus, pas d'identifiant d'étape
  hors de `WORLDS`. `secretHint` du plan 06 retourne `null`.
- **Compétences** qui rouvrent un passage : double saut (monde 1), glissade (monde 2), saut mural et grappin
  (étape 6). Le graphe de `reach.ts` connaît le double saut ; la glissade est un secret non simulé sur le
  chemin principal (plan 05) ; le saut mural et le grappin le deviennent sur le chemin principal **après**
  le niveau qui les donne (plan 06).
- **Carte** : emplacement vide prévu au plan 06. Sans cette étape-là, Ozzo n'a nulle part où écrire le chiffre ;
  on ne construit pas une seconde carte.
- **Moteurs** : plateforme (`game2d`) et vol (`game3d`, vagues déjà générées dans `courses.ts`). Aucun mode
  « Kaï avance seul » ni « la Comète est fixe ».
- **Cristaux** : tout cristal ramassé dans une étape réussie va à la réserve, y compris en rejouant ; un échec
  ne verse rien (`core/save.ts`, décision du plan 03). Une bourse **fixe** en plus des cristaux du niveau
  n'existe pas : ce serait une récompense nouvelle (`kind: 'crystals'`), versée une fois.
- Styles cités dans SOUHAITS et pas choisis : tir à défilement à bord de la Comète, course jetpack, chute
  libre, défense de la Comète, course de rover.

## Choix proposés (29/10/2026)

1. **Lettre `S`.** Case vide, au plus 3 par carte. check-levels **étend** le secret de compétence déjà en
   place (aujourd'hui : le double saut, en avertissement). Chaque `S` porte la compétence qu'il demande, ou
   aucune. La sortie est atteinte avec les compétences apprises **avant** cette étape. Un `S` sans compétence
   est atteint par ce graphe-là. Un `S` marqué `slide` (ou `wallJump`, `grapple`, `doubleJump`) est hors de
   ce graphe et dedans dès que cette compétence est ajoutée. Un `S` hors d'atteinte même avec elle est une
   erreur. Un `S` nécessaire pour la sortie est une erreur. On ne lance pas un second graphe « les quatre
   compétences partout » : il dit oui à des cachettes que le joueur n'a pas encore le droit d'avoir, et il
   double le temps de check-levels.
   Les `S` ne comptent pas dans les cristaux, ni dans les étoiles, ni dans le score.
   Sauvegarde : `SaveData.secrets: { [stageId: string]: string[] }`, une entrée `"col,ligne"` par secret pris.
   Déplacer la case plus tard oublie celui-là (visible), insérer une case ne décale pas les autres. Pas de
   masque de bits. Champ absent au chargement = `{}`. Pas de montée de `SaveData.version` : le chargeur
   remplit le défaut, comme pour `story`.
   Le secret est noté **à la prise**, y compris si le niveau est raté ensuite : `recordResult` sur un échec
   n'y touche pas. Mourir le garde. L'échec ne garde pas les cristaux.
2. **Deux styles, un bonus par monde.** Identifiants stables, hors numérotation des étapes de l'histoire :

   | Monde | Id | Style | Déblocage |
   |---|---|---|---|
   | Jungle | `bonus-j` | jetpack | 9 `S` sur j1, j2, j3 |
   | Lune | `bonus-m` | défense | 9 `S` sur m1, m2, m3 |
   | Boréa | `bonus-b` | jetpack | 9 `S` sur b1–b3 |
   | Vulkar | `bonus-v` | défense | 9 `S` sur v1–v3 |
   | Faille | `bonus-r` | jetpack | 9 `S` sur r1–r3 |

   L'étape bonus n'est **pas** dans la chaîne `nextToPlay` : JOUER ne la propose pas. Elle apparaît sur la
   carte du monde, grisée tant que les 9 secrets n'y sont pas, avec le compte « 4/9 » si Ozzo est à bord.
   La réussir n'ouvre pas le monde suivant. Pas de boss, pas de naufragé, pas de compétence.
   Mondes 3 à 5 : les fichiers de bonus s'écrivent quand le monde existe (fin de 6b, 6c, 6d), pas avant.
3. **Pourquoi un bonus par monde et pas par niveau.** Cinq niveaux à concevoir, pas quinze. Trois secrets
   d'un seul niveau seraient trop rapides à convertir en contenu, et trop courts à jouer. Si l'essai téléphone
   montre que 9 est décourageant, on baisse à 6 sans changer les identifiants.
4. **Récompense.** `{ kind: 'crystals', amount: PRICES.heart[0] }` sur l'étape bonus, versée dans
   `recordResult` une fois (`best[id]` déjà présent : on ne reverse pas). Les cristaux ramassés dans le
   bonus se rejouent. Pas d'arme, pas de peinture, pas de module. Le montant suit le prix du cœur : si ce
   prix change au réglage téléphone, la bourse change avec lui.
5. **Ozzo.** `secretHint(stageId)` retourne `3 - trouvés`, ou `0`. Sans `'ozzo'` dans `crew`, retourne `null`
   et la carte n'écrit rien (pas de « ? »). Il n'indique pas l'emplacement, seulement le reste. Les vols n'ont
   pas de ligne secrets.
6. **Placement.** D'abord les cases déjà hors du chemin (branches secrètes de j2 et j3, salles `D` déjà
   closes) : on y pose un `S` sans ajouter de colonne, les cristaux de ces branches restent pour les étoiles.
   Une salle neuve seulement s'il manque encore un `S`, et on coupe du décor `*` si les colonnes dépassent.
   On ne déplace pas un `K` ni une arène. Au moins un `S` de chaque niveau 1 se prend sans compétence
   nouvelle. Au moins un `S` du monde exige le geste appris dans ce monde.

### Course jetpack (monde impair)

- Même `PlatformScene`, drapeau `LevelData.autoRun: true` : stick horizontal ignoré, Kaï court à `RUN_SPEED`
  vers la droite. **Saut et tir seulement.** Pas de portes, d'accroupi, de glissade, de champignon, de boss,
  de radio, d'événement : check-levels refuse ces lettres dans un niveau `autoRun`, et la scène n'a pas à
  les désactiver une par une. Double saut si la compétence est apprise. Pas de retour en arrière. Durée
  visée ~45 s. Borne check-levels à part, plus courte que `PART_LIMITS`. Échec : trou ou plus de vies, écran
  d'échec habituel, sans « Réessayer le combat ». Sortie : balise ou ligne d'arrivée.

### Défense de la Comète (monde pair)

- Même `FlightRun`, drapeau de parcours `defend: true` : vitesse de translation nulle, la Comète se déplace
  dans le plan de l'écran (joystick), TIR et énergie comme en vol. Vagues déjà décrites par `WavePlan`,
  trois vagues fixes (pas de graine qui changerait `COURSE_FP` des vrais parcours : **autre** générateur,
  autre graine, fichiers à part). Pas de portails, pas de distorsion. Réussite : les trois vagues vidées.
  Échec : plus de boucliers. Chrono indicatif, pas une défaite. ~45 s.

## Modifications prévues

1. **`S` dans la légende**, ramassage dans `items.ts` (autre compteur que le cristal). Pas de pastille
   « 1/3 » dans le HUD : elle transforme la chasse en liste. Un son bref à la prise suffit. Le nombre restant
   est sur la carte, et seulement avec Ozzo.
2. **`SaveData.secrets`**, clés `"col,ligne"`, écrites à la prise. `secretHint` du plan 06 branché.
3. **Récompense `crystals`** dans `StageReward` et `recordResult` (une fois, montant `PRICES.heart[0]`).
4. **Étapes bonus** dans `WORLDS` : champ `bonus?: WorldStage` **à côté** de `stages`, ignoré par
   `nextToPlay` et par le déblocage de la suivante. `stages.ts` les expose à la carte et à `?stage=bonus-j`.
5. **`autoRun`** dans la scène 2D. **`defend`** dans `flight.ts` (pas de `z` qui avance, vagues en temps).
   Deux fichiers de contenu par style, réutilisés : le monde change la palette et les ennemis, pas la
   structure. `bonus-j`, `bonus-b`, `bonus-r` partagent le même gabarit de carte (obstacles différents).
   `bonus-m`, `bonus-v` partagent le gabarit de vagues (kinds du thème du vol de ce monde).
6. **Carte** : carte bonus sous les quatre étapes du monde, cadenas, « n/9 » avec Ozzo, lance l'étape.
7. **Check-levels** : le graphe de la première visite, plus un passage par `S` qui ajoute seulement sa
   compétence. Exactement 3 `S` sur chaque niveau de plateforme de l'histoire, 0 sur un bonus et sur un vol.
   Borne séparée, plus courte, pour les bonus `autoRun`.

## Tests

- `secrets` : prendre un `S`, mourir, le retrouver pris à la visite suivante. L'échec ne garde pas les
  cristaux. Reprendre la même case ne double pas l'entrée.
- `secrets-lock` : 8/9 ne montre pas le bonus jouable ; le 9e l'ouvre ; sans Ozzo, pas de chiffre, le bonus
  s'ouvre quand même.
- `bonus-jetpack` : l'auto-course ignore le stick horizontal, le saut marche, la sortie verse le prix du
  cœur une fois et 0 la deuxième (les cristaux du parcours, eux, reviennent).
- `bonus-defend` : trois vagues, défaite si boucliers à zéro, pas de portail.
- check-levels sur j1–j3 et m1–m3 après pose des `S` : colonnes dans les bornes, sortie atteinte sans les
  `S`, chaque `S` atteint avec la compétence marquée dessus et pas sans elle. Un `S` de j1 au moins sans
  double saut.
- `galaxy-map` étendu : pastille d'Ozzo. `flight-combat` : `COURSE_FP` inchangé (le mode défense ne passe
  pas par `genRocks` / `genWaves` des parcours de campagne).
- Suite e2e en fin d'étape. Essai téléphone : les `S` se voient-ils trop (ils doivent se chercher) ; le
  jetpack à une main ; la défense avec TIR + joystick (deux pouces, comme le vol).

## Documentation à mettre à jour

- `SOUHAITS.md` section 6 : les deux styles retenus, les trois autres toujours en attente. `GDD.md` :
  secrets, bonus, bourse. `CLAUDE.md` : lettre `S`, `autoRun`, `defend`, récompense `crystals` indexée sur
  le cœur, clés `"col,ligne"`. `HISTOIRE.md` : Ozzo indique un nombre, pas un emplacement. `plans/README.md`.
  `tests/e2e/README.md`.

## Ordre de réalisation

On peut s'arrêter après le monde 1 et le monde 2 : le jeu est déjà entier. Boréa, Vulkar et la Faille
répètent les deux gabarits quand ces mondes existent.

**7a — le mécanisme, sur la Jungle**

- [ ] **1. M — Lettre `S`, sauvegarde par case, prise conservée si on meurt ensuite.** Pas de compteur à
      l'écran. check-levels : exactement 3, la sortie ne dépend pas d'eux, une compétence à la fois.
- [ ] **2. M — Poser les 9 `S` de j1, j2, j3** d'abord sur les branches et salles déjà hors chemin. Au moins
      un sans double saut, au moins un qui le demande. Aucun `K` ni arène déplacé.
- [ ] **3. M — Récompense `crystals` (le prix du premier cœur, une fois) et étape `bonus-j` hors de JOUER.**
- [ ] **4. M — Course jetpack** (saut et tir seuls), scénario `bonus-jetpack`, borne check-levels dédiée.
- [ ] **5. P — Carte : cadenas, 9/9, pastille d'Ozzo.** Scénarios `secrets` et `secrets-lock`. Essai téléphone
      du jetpack **avant** d'écrire la défense.

**7b — la Lune, second style**

- [ ] **6. M — 9 `S` sur m1–m3.** Au moins un qui demande la glissade, un qui se prend sans elle.
- [ ] **7. M — Défense** (`defend`, vagues à part), `bonus-m`, scénario `bonus-defend`. `COURSE_FP` intact.
- [ ] **8. P — Suite e2e, essai téléphone de la défense.** Le troisième style attend ces deux essais.

**7c — quand les mondes 3 à 5 existent**

- [ ] **9. P — `bonus-b` (jetpack) et 9 `S` de Boréa**, dont un au saut mural.
- [ ] **10. P — `bonus-v` (défense) et 9 `S` de Vulkar**, dont un au grappin.
- [ ] **11. P — `bonus-r` (jetpack) et 9 `S` de la Faille.** Suite e2e.
