# Plans techniques — état des étapes

Un plan par étape de l'[ordre de travail](../SOUHAITS.md#ordre-de-travail). On l'écrit **avant** de coder
en lisant le code concerné ; l'utilisateur valide les choix proposés, qui passent dans la section
« Décisions ». Organisation générale : [ARCHITECTURE.md](../ARCHITECTURE.md).

## État au 31/10/2026

| Étape | Plan | État |
|---|---|---|
| 1. Contrôles 2D (stick à 8 directions, visée, accroupi, descente, portes, réglage des boutons) | [01-controles.md](01-controles.md) | codé et vérifié par la suite e2e complète (branche `plans-etapes-1-3`) ; essai sur téléphone à faire (secteurs d'angle du stick, taille) |
| 2. Armes et nouveaux bonus | [02-armes.md](02-armes.md) | codé et vérifié par la suite e2e complète (nouveaux scénarios `weapons` / `powerups`) ; essai sur téléphone à faire (réglage des armes, sons, vitesse) |
| 3. Hangar (3a : hangar et armes de Kaï ; 3b : combat en vol) | [03-hangar.md](03-hangar.md) | 3a et 3b codées et vérifiées par la suite e2e complète (branche `plans-etapes-1-3` ; 3a et 3b commitées ; nouveaux scénarios `hangar` et `flight-combat`, captures et tests relus) ; premier essai sur téléphone le 29/10/2026 : décision 3 amendée (bouton TIR dédié, TURBO au-dessus, énergie partagée ; décision 21 du plan 04 ; branche `claude/vol-tir-bouton`, commitée en `8274dd0` et fusionnée dans `claude/world-1-completion-866505`) ; à réessayer sur téléphone (lisibilité des tirs et des ennemis, TIR et TURBO, énergie, réglages) ; la balise (point 16) est faite à l'étape 4 |
| 4. Monde 1 complet au nouveau format (4a fondations, 4b la Jungle, 4c histoire et vol) | [04-monde-1.md](04-monde-1.md) | décisions validées le 28/10 (les 19 choix tels quels), plus 20 (boss en touches) et 21 (tir au bouton en vol) le 29/10 ; **tout est sur `main`** (`78c11e3`) ; **4a faite** (étapes 1 à 6 : tables par thème, table des mondes et progression, Niveaux en pages, balise de LUMA, radio et tutoriel, arène et Blob-roi, j1 au nouveau format), essayée sur téléphone le 29/10 ; **4b faite** (étapes 7 à 12 : champignons, créature et événements, j2 et Tess, Scarabée-titan, j3 et méduse-baleine, campagne à 6 étapes, boss en touches, « Réessayer le combat »), vérifiée par la suite e2e complète (39/39) et le diag (7/7) ; **4c codée** (étapes 13 à 19 : tables 3D, prologue, libération, phase `boss`, léviathan en 7 touches, portail avalé puis recraché, plan du mitrailleur aux résultats) ; `f1-boss` vert le 31/10 ; essai sur téléphone de 4b et de 4c à faire ; la suite e2e complète n'a pas été rejouée après le léviathan |
| 5. Monde 2 (Lune) au nouveau format : gravité faible, Ozzo, glissade, ver des sables, ver cosmique | [05-monde-2.md](05-monde-2.md) | choix proposés, relus le 31/10 (ascenseurs ralentis avec le saut, Crabe en fichier court) ; à valider |
| 6. Carte galactique, puis Boréa, Vulkar, Cœur de la Faille | [06-carte-et-mondes.md](06-carte-et-mondes.md) | choix proposés, relus le 31/10 (boss de vol sur le contrat de 4c, salle inversée sans ennemis) ; à valider |
| 7. Objets secrets et niveaux bonus | [07-secrets-bonus.md](07-secrets-bonus.md) | choix proposés, relus le 31/10 (essai d'une mine avant le vol stationnaire) ; à valider. Hors de ce plan : faille de survie de j1 codée le 14/11 (vortex, 3 vagues, marque `rifts`), voir SOUHAITS §6 |

Les étapes 1 à 3 se codent dans l'ordre : l'étape 2 utilise la visée de l'étape 1, l'étape 3 les fiches
d'armes de l'étape 2.

## Prochaine action

Reprise au 31/10/2026, arbre de travail propre. **Tout est sur `main`** (`78c11e3`) : étapes 1 à 3
(`plans-etapes-1-3`), tir au bouton (`8274dd0`), monde 1 jusqu'au léviathan (`effc3e0`) et plans 5 à 7 relus
(`1fac140`). Le codage s'est arrêté à la **fin de 4c**. On ne commence pas l'étape 5 tant que la suite
complète n'a pas revu le léviathan et que les questions des plans 5 à 7 ne sont pas tranchées.

1. **Rejouer la suite e2e complète** après le léviathan : `npm run build`, puis
   `npm run e2e -- --suite full`. La dernière suite verte (39/39) date de 4b ; seul `f1-boss` a été revu
   le 31/10. Le diag (`boss-bot`, aperçus) peut suivre si la suite passe.
2. **Trancher les points relevés** par les tests de 3a et de 3b (fin de la section Tests de
   [03-hangar.md](03-hangar.md)) : 3a : cœurs au point de contrôle, musique au retour du hangar, message du
   hangar par-dessus la liste, niveau 1 des dégâts sans effet visible ; 3b : tirs vus presque dans l'axe (des
   points), chasseur fin vu de face, mine peu lisible parmi les rochers de la ceinture, appui bref sur TIR perdu
   juste après un tir (mémoire de 150 ms, cadence du canon léger 250 ms), cristaux aimantés perdus à la
   distorsion, canon léger absent de l'aperçu du hangar. Plusieurs se jugent sur le téléphone (points 3 et 5).
3. **Essai des étapes 1, 2 et 3 sur téléphone** (`tools\build-apk.cmd` puis `tools\install-apk.cmd`) :
   - stick : secteurs d'angle (`STICK_SECTORS`, `src/input/stick.ts`) et taille (crans `TOUCH_SIZE_STEPS`,
     `src/input/touch.ts`) ;
   - armes : tableau des fiches (`WEAPONS`, `src/core/weapons.ts` ; les armes s'essaient au hangar en mode
     test, pour la session, ou avec `?weapon=`), sons de tir (`src/audio/sfx.ts`), bonus de vitesse et de
     cadence (`SPEED_BOOST_MUL`, `RAPID_FIRE_MUL`, `POWER_DURATION_MS`) ;
   - hangar : lisibilité sur petit écran (cartes, message, confirmation), prix et multiplicateurs (`PRICES`,
     `UPGRADE_MULS`, `BOOST_MULS` de `src/core/hangar.ts`), gain de cristaux par niveau ;
   - combat en vol (3b ; « Choix de réalisation de 3b » de [03-hangar.md](03-hangar.md), captures de
     `tests/e2e/out/flight-combat/` et `small-screens/`) : lisibilité des tirs, des ennemis et des orbes, aide à
     la visée (cône et guidage `SHIP_AIM`), boutons TIR et TURBO (un doigt reste au bouton où il s'est posé : TIR
     et turbo ensemble demandent deux doigts ; « À juger sur téléphone » de l'amendement du 29/10/2026), énergie
     (`SHIP_ENERGY`), canons (`SHIP_GUNS`,
     `SHIP_GUN_MULS` de `src/core/shipGuns.ts`), ennemis (`ENEMY_DEFS` de `src/game3d/enemies.ts`), vagues
     (`waves` de `COURSES`), HUD du vol, fluidité (appels de dessin, images par seconde) et sons du vol.

   Après un réglage : reporter les valeurs dans le GDD, dans la section « Décisions » (ou « Choix de
   réalisation ») du plan concerné et dans les tests (`SPECS` de `tests/e2e/scenarios/weapons.mjs`, `SPEED_MUL` /
   `DURATION_MS` de `powerups.mjs`, prix et multiplicateurs recopiés par `hangar.mjs` et `small-screens.mjs`,
   `GUNS`, `POINTS`, `DROPS`, `WAVES`… de `flight-combat.mjs` : listes dans
   [tests/e2e/README.md](../../tests/e2e/README.md), « Scénario du hangar » et « Scénario du combat en vol »),
   puis `npm test` et `npm run e2e -- weapons powerups hangar small-screens flight-combat flight-autopilot`.
4. **Essai de 4b sur téléphone** (même APK ; 4a essayée le 29/10 : tutoriel, glyphes et départ en Comète
   validés, Blob-roi trop dur d'où les boss en touches) :
   - champignons (6,5 / 8 tuiles : `MUSHROOM_*` de `src/game2d/constants.ts`) et chaîne au-dessus du vide de j3 ;
     branches de j3 au-dessus d'un trou de 25 colonnes ;
   - lisibilité : créature proche (j2) et immense (j3), ombre, taches des spores, tunnel bouché par le tronc,
     marque des cailloux du titan, cœur, marques, balayage et ombre de la plongée de la gardienne ;
   - rythme : messages de LUMA entre la secousse et la salle de Tess, portes fermées ≈ 6 s pendant le sauvetage,
     les 5 messages brouillés de j3, pluie de spores ;
   - combats en touches (Blob-roi, Scarabée-titan, méduse-baleine : réglages en tête de
     `src/game2d/engine/bosses/*.ts`, puis `BOSS_LIFE` / constantes de `boss-mini`, `boss-titan`, `boss-whale` et
     `BOSS_FIGHT_S` de `scripts/check-levels.ts` ; relancer le diag `boss-bot`) ; plongée de la gardienne contre une
     borne (≈ 480 px à courir) ; Kaï qui traverse son corps ;
   - arènes : bords sous le stick et sous TIR (j1 à 20 colonnes surtout), sortie de l'arène de j2 en sautant sur le
     champignon 220 ;
   - écran d'échec à trois boutons (« Réessayer le combat »).
5. **Essai sur téléphone de 4b et de 4c** (même APK). 4c est codée : prologue, libération, léviathan
   (`src/game3d/bosses/leviathan.ts`, 4 plaques puis 3, prime 3 000). À juger : taille du corps dans le couloir,
   lisibilité des plaques, difficulté des orbes et du balayage de queue, gêne des bulles et fluidité des
   cinématiques. Après un réglage : constantes en tête de `leviathan.ts`, puis `PHASE_TOUCHES` / `BOSS` de
   `tests/e2e/scenarios/f1-boss.mjs`.
6. **Valider les plans 5 à 7** (questions en tête de chaque fichier) avant de les coder. Rien de ces trois plans
   n'est commencé.

## Questions encore ouvertes

- Points relevés par les tests de 3a et de 3b, à trancher (voir 2).
- 4a, sans blocage (bilan technique) : blocs « ? » du départ de j1 sans explication (la file de la radio est
  pleine au départ), messages `tuto-aim` et `tuto-blocks` chassés à pleine course, tutoriel rejoué après un
  échec de j1 (marque posée à la réussite, décision 12).
- 4b, sans blocage (bilans et relectures) : `boss-bot` ne joue pas la gardienne (durée réelle d'un combat à
  mesurer) ; `small-screens` ne vérifie pas la barre de la gardienne (vérifiée à la main à 640x320) ; volant (99, 6)
  de j2 qui, écrasé depuis le rocher, relance Kaï jusqu'à la branche secrète ; saut normal sous un plafond bas
  plus indulgent dans check-levels que dans le moteur (le calcul des rebonds pourrait s'y appliquer, au risque de
  changer le verdict de j1 et de la Lune) ; premier message de radio d'un niveau retardé d'≈ 0,5 s par l'horloge
  bornée ; bulle presque transparente quand Kaï passe dessous (idée).
- Choix des plans [05](05-monde-2.md), [06](06-carte-et-mondes.md) et [07](07-secrets-bonus.md) : listes « À valider »
  en tête de chaque plan. Les styles des niveaux bonus sont la question 2 du plan 07 (jetpack et défense en
  premier).
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
