# Étape 2 — armes et nouveaux bonus : plan technique

Deuxième étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail), après les
[contrôles](01-controles.md). **Codé** le 28/10/2026 (typecheck, check-levels et build passent),
**vérifié par la suite e2e complète** (30 scénarios, dont les nouveaux `weapons` et `powerups`, section
« Tests ») et documenté (section « Documentation à mettre à jour ») ; reste l'essai sur téléphone pour régler
le tableau des armes (et écouter leurs sons). La section « Ce qui existe déjà » décrit le code d'avant
l'étape 2.

## Objectif

- Quatre armes : pistolet laser (départ), mitrailleur, pompe, fusil d'assaut. L'arme équipée est gardée
  d'un niveau à l'autre.
- Toutes les armes surchauffent, chacune à son rythme. Pas de munitions.
- Nouveaux bonus : vitesse de course et cadence de tir. Le bouclier est conservé.
- Supprimés : le tir triple, et le double saut comme bonus (il devient une compétence apprise).

Le hangar (achat, améliorations) est l'étape 3. Ici, on construit les armes et on peut les essayer.

## Ce qui existe déjà

- `src/game2d/engine/weapons.ts` : classe `Blaster`, un seul laser. Cadence, tir maintenu, surchauffe et
  tir triple y sont codés en dur avec les constantes de `constants.ts` (`LASER_*`). Depuis l'étape 1, le
  tir part de `player.gunX` / `gunY` selon `player.fireAngle` (visée devant, diagonale ou haut), gerbe
  triple comprise.
- `src/game2d/engine/projectiles.ts` : `LaserPool`, 24 tirs recyclés. Vitesse et portée sont les mêmes
  pour tous (`LASER_SPEED`, `LASER_RANGE`). La direction est déjà libre (`fire(x, y, angle)`).
- `src/game2d/engine/enemies.ts` : `laserHit(e)` retire toujours 1 point de vie ; le blindé en a 2,
  les autres 1.
- `src/game2d/engine/PlatformScene.ts` : un seul bonus à durée à la fois (`power: 'triple' | 'doublejump'`),
  plus le bouclier à part. `collectPower` et `updatePower` les gèrent.
- `src/game2d/art/draw/player.ts` : depuis l'étape 1, le corps de Kaï est dessiné **sans arme** et le bras
  armé est un sprite à part (64x32) qui pivote à l'épaule (`ARM_RIG`, `PLAYER_SHOULDER`) ; une texture par
  arme dans `ARM_TEX` (`art/keys.ts`), qui n'a encore que `laser` (`drawArmFrame(ctx, weapon, index)`).
- `src/ui/hud.ts` et `src/ui/icons.ts` : jauge de chauffe avec l'icône du laser, un anneau de bonus.
- Niveaux : blocs `1` (tir triple), `2` (bouclier), `3` (double saut). La Jungle a un bloc `3` suivi de
  5 cristaux secrets (sur 53) qu'on n'atteint qu'avec le double saut. `scripts/check-levels.ts` vérifie
  que ces secrets suivent bien un bloc `3`.

## Les armes

Valeurs de départ, à régler après essai sur téléphone. Les points de vie des ennemis sont **doublés**
(2 pour les ennemis normaux, 4 pour le blindé) pour pouvoir donner des dégâts entiers à toutes les armes.
Le laser fait 2 de dégâts : il se comporte exactement comme aujourd'hui.

| | Pistolet laser | Mitrailleur | Pompe | Fusil d'assaut |
|---|---|---|---|---|
| Rôle | polyvalent | moyenne portée, arrose | courte portée, gros coup | longue portée, précis |
| Portée | 9 tuiles | 7 tuiles | 3,5 tuiles | 12 tuiles |
| Tir | 1 trait | 1 balle, dispersion ±3° | 5 plombs en éventail ±14° | rafale de 3 balles |
| Délai entre tirs | 160 ms | 80 ms | 600 ms | 450 ms par rafale |
| Dégâts | 2 | 1 | 1 par plomb | 2 par balle |
| Chauffe | 0,20 par tir (5 tirs) | 0,06 par tir (~16 tirs) | 0,34 par tir (3 tirs) | 0,25 par rafale (4 rafales) |
| Refroidissement | 0,45 / s | 0,50 / s | 0,50 / s | 0,40 / s |
| Vitesse du projectile | 900 px/s | 1000 px/s | 1100 px/s | 1400 px/s |
| Couleur | cyan-blanc (actuel) | cyan, traits courts | ambre, petits plombs | blanc-violet, long trait |

Ce que ça donne : 1 tir de laser ou 2 balles de mitrailleur pour un ennemi normal. Au contact, un tir de
pompe élimine un blindé. Une rafale de fusil d'assaut aussi, si deux balles touchent.

## Les bonus

| Bloc | Bonus | Effet | Durée |
|---|---|---|---|
| `1` | Vitesse | course ×1,35 | 12 s |
| `2` | Bouclier | absorbe 1 coup (inchangé) | jusqu'au coup |
| `3` | Cadence | délai entre tirs ×0,6 **et** chauffe par tir ×0,6 (sinon on surchaufferait juste plus vite) | 12 s |

On réutilise les caractères `1` et `3` : les niveaux n'ont pas à être réécrits, seul leur sens change.

## Décisions (27/10/2026)

- **Bonus cumulables** : vitesse et cadence peuvent être actifs en même temps, chacun avec son anneau dans
  le HUD. Reprendre le même bonus remet sa durée à 12 s.
- **Double saut** : plus aucun bloc ne le donne. Il dépend de la sauvegarde (compétence apprise) ; en
  attendant le premier boss, il s'active en mode test. Les 5 cristaux secrets de la Jungle deviennent un
  « secret de compétence » : on y revient plus tard avec le double saut. Les 3 étoiles restent possibles
  sans eux (48 cristaux sur 53, soit 90,6 %).
- **Choix de l'arme avant le hangar** : en mode test (« Tout débloquer »), une ligne « Arme : ◀ Laser ▶ »
  sur la carte d'intro de l'étape, et un raccourci `?weapon=` dans l'URL. Le hangar la remplacera. *Fait en 3a
  ([03-hangar.md](03-hangar.md), point I) : ligne retirée, arme de la session choisie au hangar ; `?weapon=`
  gardé.*
- **Bras et arme dessinés à part** : un sprite séparé, accroché à l'épaule de Kaï, qui pivote selon la
  visée. Une seule série de poses pour le corps, et 4 dessins d'armes au lieu de 4 × toutes les poses.
  Ça sert aussi la visée haut / diagonale de l'étape 1 (voir son point 9).

## Modifications prévues

### Données et sauvegarde

1. **`src/core/weapons.ts`** (nouveau, données seulement) : identifiants `'laser' | 'machinegun' |
   'shotgun' | 'rifle'`, nom affiché, statistiques du tableau. Partagé par le jeu 2D, l'interface et plus
   tard le hangar.
2. **Sauvegarde** (`core/save.ts`, `core/types.ts`) : nouveau bloc `loadout` avec l'arme équipée, les armes
   possédées (`['laser']` au départ) et les compétences (`doubleJump: false`). Les anciennes sauvegardes
   reçoivent ces valeurs par défaut, sans changer de version.
3. **Contrat des modes** (`core/types.ts`) : `ModeHooks` reçoit le `loadout` ; `PowerUpKind` devient
   `'speed' | 'rapid' | 'shield'` ; `PlatformHud` décrit l'arme équipée et les deux bonus à durée.

### Moteur 2D

4. **Projectiles** (`projectiles.ts`) : `LaserPool` devient un pool de projectiles génériques (vitesse,
   portée, dégâts et image par tir), agrandi à 40. Le sous-pas de 14 px est gardé pour ne rien traverser.
5. **Arme générique** (`weapons.ts`) : `Blaster` devient `Gun`, piloté par la fiche de l'arme : rafale,
   plombs, dispersion, chauffe et refroidissement propres, multiplicateurs du bonus de cadence. L'angle de
   tir vient de la visée de l'étape 1.
6. **Dégâts** (`enemies.ts`, `tuning.ts`) : `laserHit(e)` devient `hit(e, dégâts)` ; points de vie doublés.
7. **Bonus** (`PlatformScene.ts`, `items.ts`, `mapBuilder.ts`, `Player.ts`) : deux minuteries (vitesse,
   cadence), plus le bouclier. Vitesse : `RUN_SPEED` et les accélérations multipliées. Le tir triple et
   le double saut temporaire disparaissent. `Player.canDoubleJump` vient du `loadout`.
8. **Effets** : traînée lumineuse derrière Kaï pendant le bonus de vitesse, étincelles au canon plus
   vives pendant le bonus de cadence.

### Graphismes et sons

9. **Kaï** (`art/draw/player.ts`, `art/keys.ts`) : le bras armé est déjà un sprite à part (étape 1) ;
   reste à dessiner les 3 autres armes et à les ajouter à `ARM_TEX`.
10. **Projectiles et bonus** (`art/draw/items.ts`) : images des balles, plombs et traits ; icônes de
    bonus vitesse et cadence à la place de tir triple et double saut.
11. **Sons** (`audio/sfx.ts`, `SfxId`) : un son de tir par arme, synthétisé comme les autres.

### Interface

12. **HUD** (`ui/hud.ts`, `ui/icons.ts`) : l'icône de la jauge de chauffe montre l'arme équipée ; deux
    anneaux de bonus au lieu d'un.
13. **Choix provisoire de l'arme** : carte d'intro en mode test et `?weapon=` (voir les décisions).

### Niveaux

14. **`scripts/check-levels.ts`** : blocs `1` et `3` renommés (vitesse, cadence) ; les secrets du double
    saut deviennent des « secrets de compétence », sans exiger de bloc `3` avant. Ils restent signalés en
    avertissement.
15. **Légende** (`levels/types.ts`) et commentaires des niveaux mis à jour.

## Tests

- **Non-régression** : avec le laser, tout doit se passer comme avant (1 tir pour un ennemi normal,
  2 pour le blindé, 5 tirs avant surchauffe). Les scénarios existants doivent passer sans changement.
- **Nouveau scénario `weapons`** : pour chaque arme (`?weapon=`), nombre de projectiles par appui, portée,
  dégâts sur un blindé, nombre de tirs avant surchauffe.
- **Nouveau scénario `powerups`** : vitesse maximale avec le bonus de vitesse, cadence avec le bonus de
  cadence, les deux en même temps, et le bouclier.
- **Vérifications habituelles** : `npm run typecheck`, `npm run check-levels`, `npm run build`, puis la
  suite e2e complète.
- **Après relecture** (28/10/2026) : `weapons` vérifie aussi le refroidissement de chaque arme et la reprise
  du tir sous 30 %, la chauffe gardée jusqu'au délai de refroidissement, la dispersion réelle, la portée et la
  vitesse effectives, le son de chaque arme, l'arme gardée d'une étape à l'autre puis oubliée hors mode test,
  et l'équipement relu de la sauvegarde (anciennes sauvegardes, valeurs abîmées, double saut appris) ;
  `powerups` vérifie le bonus sorti de chaque bloc, les anneaux qui clignotent, la jauge du HUD vidée à la mort
  et le HUD de 844 à 621 px avec 53 cristaux. Retouches visuelles : plombs de pompe ambrés cerclés de sombre
  (mode normal, vitesses à ± 8 %), icône Cadence (deux balles et traits de vitesse), jauge vide sans liseré,
  traînée de vitesse verte sur le torse, épaule décalée en visée diagonale (et un peu plus en visée haute).
- **Essai sur téléphone** pour régler le tableau des armes.

## Documentation à mettre à jour

Fait le 28/10/2026.

- `docs/GDD.md` : sections « Mode plateforme 2D » (armes, surchauffe, bonus, double saut) et score (inchangé).
- `README.md` : raccourcis `?weapon=` et mode test.
- `docs/SOUHAITS.md` : cocher les cases de la section 2.
- `CLAUDE.md` (architecture, contrats, recettes Sauvegarde et Arme, aides DEV), `tests/e2e/README.md`
  (scénarios `weapons` et `powerups`, aides), `docs/ARCHITECTURE.md`, et « Ce qui existe déjà » de
  [03-hangar.md](03-hangar.md).

## Ordre de réalisation

1. Données des armes, sauvegarde, contrat des modes (points 1 à 3).
2. Projectiles et arme génériques, dégâts : le laser seul doit se comporter comme avant (points 4 à 6).
3. Mitrailleur, pompe, fusil d'assaut, avec images et sons provisoires.
4. Nouveaux bonus, double saut en compétence, niveaux et `check-levels` (points 7, 8, 14, 15).
5. Bras et armes dessinés à part, images et sons définitifs (points 9 à 11).
6. HUD et choix provisoire de l'arme (points 12, 13).
7. Tests, essai sur téléphone, documentation.
