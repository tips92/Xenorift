# Étape 3 — hangar : plan technique

Troisième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail), après les
[contrôles](01-controles.md) et les [armes](02-armes.md). Rien n'est codé.

## Objectif

- Un hangar dans la Comète, entre deux étapes : on y dépense les cristaux pour acheter et améliorer les
  armes de Kaï et équiper la Comète. Les améliorations sont définitives.
- Le combat en vol 3D : la Comète tire, et des ennemis spatiaux l'attaquent.
- La balise de LUMA, qui terminera les niveaux 1 et 2 de chaque monde (utilisée à l'étape 4).

L'étape est grosse : on la découpe en **3a** (hangar et armes de Kaï) et **3b** (combat en vol). Chaque
partie est jouable et testable seule.

## Ce qui existe déjà

- `src/ui/App.ts` : fin d'étape → `recordResult` → écran de résultats avec trois boutons (Suivant,
  Rejouer, Menu). « Suivant » lance directement la carte d'intro de l'étape suivante.
- `src/core/save.ts` : sauvegarde `version: 1` (étape débloquée, meilleurs scores, réglages). Une autre
  version est aujourd'hui **remise à zéro** au chargement : il faudra une vraie migration.
- `src/ui/screens/` : écrans en HTML (titre, niveaux, options, résultats, pause), avec les briques communes
  de `common.ts`.
- Les cristaux ne servent qu'au score et aux étoiles. Jungle : 53 cristaux, Lune : 47.
- `src/game3d/flight.ts` : la Comète a 3 boucliers et un turbo ; pas de tir. `onRockHit` sait déjà faire
  éclater un astéroïde (éclats, particules) et `rocks.destroyed[k]` le retire.
- `src/game3d/asteroids.ts`, `effects.ts` : astéroïdes et éclats en `InstancedMesh` (budget de ~150 appels
  de dessin respecté). Les futurs tirs et ennemis doivent suivre le même principe.
- `src/game3d/ship.ts` : modèle 3D de la Comète, ~8 appels de dessin.
- En vol, le tactile n'a que le joystick et TURBO ; le clavier envoie déjà `fire` (J, X, F).

## Décisions (27/10/2026)

1. **Cristaux** : tous les cristaux ramassés vont dans la réserve, même en rejouant un niveau (ça aide
   à passer un boss difficile et donne une raison de rejouer). Si l'étape est ratée, ceux de la tentative
   sont perdus.
2. **La Comète tire dès le départ** avec un canon léger ; la mitrailleuse est sa première amélioration.
   Sinon, les ennemis spatiaux seraient injustes avant le premier achat.
3. **Tir automatique en vol** : la Comète tire seule quand une cible est devant elle. Le pouce droit reste
   sur TURBO. Une option permet de passer en tir manuel, avec un bouton TIR.
4. **Aperçu en 2D dans le hangar** : Kaï avec son arme et la Comète de profil, dessinés avec les fonctions
   de dessin du jeu 2D. Pas de second contexte 3D sur le téléphone (lent à démarrer, risque de perte du
   contexte graphique). Un aperçu 3D pourra venir plus tard.
5. **Accès au hangar** : entre deux étapes, et depuis l'écran Niveaux.

## Le hangar

Écran HTML à onglets, avec la réserve de cristaux en haut et un aperçu à gauche.

### Établi (armes de Kaï)

- Liste des 4 armes : possédée (équiper), achetable (prix), ou « plan manquant » (verrouillée).
- Pour chaque arme possédée, 4 améliorations à 3 niveaux : **dégâts**, **cadence**, **portée**,
  **refroidissement**. Chacune applique un multiplicateur à la fiche de l'arme (`core/weapons.ts`).
- Les niveaux 2 et 3 demandent la mécanicienne Tess (naufragée du monde 1, étape 4). En attendant, le mode
  test les débloque.

### Atelier de la Comète

| Module | Niveaux | Effet |
|---|---|---|
| Mitrailleuse | 1 (achat) puis 2 améliorations | remplace le canon léger ; cadence et dégâts |
| Bouclier renforcé | 2 | 4 puis 5 boucliers au lieu de 3 |
| Turbo | 2 | jauge plus grande, recharge plus rapide |

La mitrailleuse achetée apparaît sur le modèle 3D (deux canons sous les ailes).

### Kaï

- **Cœur supplémentaire** : 4ᵉ puis 5ᵉ cœur. Demande Mira (naufragée du monde 3, étape 4).
- **Drone compagnon** : prévu, mais construit plus tard (il a besoin des nouveaux niveaux pour être réglé).

### Prix de départ (à régler)

Un monde complet rapportera environ 150 cristaux (3 niveaux de ~50) plus ceux des vols.

| Achat | Prix |
|---|---|
| Arme (après son plan) | 80 à 120 |
| Amélioration d'arme, niveaux 1 / 2 / 3 | 30 / 60 / 100 |
| Mitrailleuse de la Comète | 100 |
| Autres modules de la Comète, niveau 1 / 2 | 80 / 140 |
| Cœur supplémentaire | 150 puis 250 |

## Modifications prévues

### 3a — hangar et armes de Kaï

1. **Sauvegarde version 2** (`core/save.ts`, `core/types.ts`) : réserve de cristaux, armes possédées et
   améliorations, modules de la Comète, cœurs max, équipage secouru. **Migration** depuis la version 1 :
   on garde la progression, les scores et les réglages. « Réinitialiser la progression » vide aussi tout ça.
2. **Gain de cristaux** (`ui/App.ts`, `ui/screens/results.ts`) : à la réussite, les cristaux de l'étape
   s'ajoutent à la réserve. L'écran de résultats affiche « +N cristaux » et le nouveau total.
3. **Enchaînement** (`ui/App.ts`) : « Suivant » sur les résultats ouvre le hangar ; son bouton
   « Décoller » lance la carte d'intro de l'étape suivante. Le bouton retour Android ramène aux résultats.
4. **Écran du hangar** (`ui/screens/hangar.ts`, nouveau) : onglets Établi, Comète, Kaï ; achat avec
   confirmation ; équipement de l'arme ; tout se joue au doigt en paysage, petits écrans compris.
5. **Données des achats** (`core/hangar.ts`, nouveau, données seulement) : prix, niveaux, effets,
   conditions (plan récupéré, membre d'équipage).
6. **Améliorations dans le jeu 2D** : le `Gun` de l'étape 2 applique les multiplicateurs reçus avec le
   `loadout` ; les cœurs max remplacent `MAX_HEARTS`.
7. **Aperçu 2D** : Kaï avec l'arme choisie (sprite du bras armé de l'étape 2) et la Comète de profil
   (`game2d/art/draw/ship.ts`), dessinés sur un canvas de l'écran.
8. **Choix provisoire de l'arme** (carte d'intro, mode test) retiré : le hangar le remplace.

### 3b — combat en vol

9. **Tir de la Comète** (`game3d/flight.ts`, nouveau `game3d/shots.ts`) : projectiles en `InstancedMesh`,
   canon léger ou mitrailleuse, surchauffe comme au sol, multiplicateurs du hangar.
10. **Visée et tir automatique** : cible = astéroïde ou ennemi le plus proche dans un cône devant la
    Comète ; tir automatique par défaut, bouton TIR à côté de TURBO en tir manuel
    (`input/touch.ts`, option dans `ui/screens/options.ts`).
11. **Astéroïdes destructibles** : un tir les fait éclater (réutilise `onRockHit`, sans perte de bouclier)
    et lâche parfois un cristal.
12. **Ennemis spatiaux** (nouveau `game3d/enemies.ts`), touchés par le Vide, un `InstancedMesh` par type :
    - **chasseur** : arrive de face, tire une fois et s'écarte ;
    - **mine** : immobile dans le couloir, explose si on la frôle ;
    - **essaim** : petit groupe qui ondule et barre le passage.

    Leurs tirs sont des orbes lentes et lumineuses, faciles à lire. Chaque ennemi détruit rapporte des
    points et des cristaux.
13. **Parcours** (`game3d/courses.ts`) : vagues d'ennemis ajoutées aux parcours Nébuleuse et Ceinture
    d'Orak, générées avec la même graine que les portails (parcours identique à chaque partie).
14. **Modules de la Comète** : boucliers max, turbo, et canons visibles sur le modèle (`game3d/ship.ts`).
15. **HUD du vol** (`ui/hud.ts`) : jauge de chauffe du canon, compteur de cristaux.

### Pour l'étape 4

16. **Balise de LUMA** (`game2d/engine`, légende des niveaux) : nouvel objet de fin de niveau qui
    remplace la Comète dans les niveaux 1 et 2. Kaï l'active, un faisceau l'emporte, puis on passe aux
    résultats. `check-levels` accepte une balise **ou** une Comète comme sortie.

## Tests

- **Sauvegarde** : migration d'une sauvegarde version 1 (progression gardée), réserve qui survit au
  rechargement, réinitialisation complète.
- **Nouveau scénario `hangar`** : finir une étape (aide de développement), vérifier le gain de cristaux,
  acheter une amélioration, vérifier la réserve, équiper une arme, décoller, vérifier l'arme en jeu.
- **Nouveau scénario `flight-combat`** : tir automatique, astéroïde détruit sans perte de bouclier,
  ennemi détruit, nombre d'appels de dessin toujours sous ~150 (`renderer.info`).
- **À adapter** : `campaign-flow.mjs` (le hangar s'intercale entre les étapes), `f1-play.mjs` et
  `flight-autopilot.mjs` si les ennemis gênent le pilote automatique.
- **Vérifications habituelles** : `npm run typecheck`, `npm run check-levels`, `npm run build`, puis la
  suite e2e complète, et un essai sur téléphone (lisibilité du hangar, tir auto, fluidité en vol).

## Documentation à mettre à jour

- `docs/GDD.md` : sections « Interface et enchaînement », « Mode vol spatial 3D », score.
- `docs/SOUHAITS.md` : cocher les cases de la section 3.

## Ordre de réalisation

**3a** — sauvegarde v2 et gain de cristaux (points 1, 2) ; enchaînement et écran du hangar (3 à 5) ;
améliorations dans le jeu 2D (6) ; aperçu (7) ; retrait du choix provisoire (8) ; tests.

**3b** — tir de la Comète et tir automatique (9, 10) ; astéroïdes destructibles (11) ; ennemis et vagues
(12, 13) ; modules de la Comète et HUD (14, 15) ; tests et essai sur téléphone.

**Balise** (16) : à la fin, ou au début de l'étape 4.
