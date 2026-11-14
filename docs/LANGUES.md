# Langues du jeu

Source unique pour ajouter un texte joueur ou une langue. Le français actuel est le sens de référence.
HISTOIRE.md et le GDD restent en français (docs d'équipe). Identifiants de code, logs, commentaires : anglais ou français technique, pas traduits.

## Contrat

| | |
|---|---|
| Locales | `fr` `en` `de` `it` `es` (`LOCALES` dans `src/core/i18n/locale.ts`) |
| Réglage | `Settings.language` : `system` (défaut), `fr`, `en`, `de`, `it`, `es` |
| Où | Options et Pause, rubrique Général. Noms des langues **non traduits** : Français, English, Deutsch, Italiano, Español. « Système » suit la langue de l'interface |
| Défaut | `system` → premier sous-tag de `navigator.languages` (puis `navigator.language`) parmi les 5 |
| Repli | locale inconnue ou absente → **français** |
| Ancienne sauvegarde | champ absent ou abîmé → `system` (pas de nouvelle version : `readSettings`) |
| URL | `?lang=fr\|en\|de\|it\|es\|system`, aussi en production. Gagne au chargement, n'est pas enregistré. Un choix dans Options l'oublie pour la visite et s'enregistre |
| Effet | immédiat : écran de menu redessiné, pause reconstruite, HUD statique, commandes tactiles, invite de rotation, bulle de radio si elle est ouverte |
| Figé au lancement | toasts déjà affichés ; durée du sauvetage de Tess (calculée au chargement du niveau) ; une réplique de cinématique déjà lancée (la suivante suit la langue) |

`t(pack)` ne fait pas d'allocation. `tf` / `tn` allouent : pas dans une boucle de jeu.

Tutoiement. Noms propres inchangés : Kaï, LUMA, Tess, Comète, Xéna, Orak, Krator, Mira, Azur. Commandes tactiles : fr SAUT / TIR / TURBO, en JUMP / FIRE / BOOST, de SPRUNG / FEUER / TURBO, it SALTO / FUOCO / TURBO, es SALTO / DISPARO / TURBO. Le mot « stick » reste.

Le français du hangar garde l'accord (`Équipée`, « la Pompe ») parce que les tests lisent ces libellés. Les autres langues ont des phrases complètes (`UI` dans `src/core/i18n/ui.ts`), pas cette concaténation.

## Familles

| Famille | Où est le texte | Qui l'affiche |
|---|---|---|
| Résolution, `t` / `tf` | `src/core/i18n/locale.ts` | tout le jeu |
| Coquille (menus, échec, fin, options, toasts, aria, commandes) | `src/core/i18n/ui.ts` (`UI`) | `src/ui/screens/*`, `hud.ts`, `overlays.ts`, `input/touch.ts`, `game2d`, `game3d`, `rift` |
| Noms (armes, mondes, boss, compétences, rôles) | `src/core/i18n/names.ts` | hangar, résultats, barre de boss, Niveaux |
| Titres, conseils, sous-titres d'étape | `STAGE_TEXTS` + `stageTitle` / `stageHint` / `stageSubtitle` dans `src/core/story.ts` | intro, cartes, pause, résultats. `StageDef.title` reste le français (niveaux Node) |
| Radio de LUMA | `RADIO` dans `src/core/story.ts` (`text` / `keys` = `L10n`) | `src/ui/radio.ts` |
| Cinématiques (répliques, bandeaux, titres) | `PROLOGUE_LINES`, `LIBERATION_*`, `RIFT_ECHO_LINES`, `CUTSCENES` | `src/story/` |
| Hangar (noms, effets, achats) | `UI` + accord français dans `src/ui/screens/hangar.ts` ; verrous via `lockLabel` (`core/hangar.ts`) | écran hangar |
| Pages `preview/` (art, flight, audio, story, bosses, props, kai, arena, ship, dock, tests) | français en dur | hors jeu. Le bouton « Tests » de l'accueil, lui, est traduit |

Une chaîne partagée avec le jeu (titre d'étape, fiche d'arme) passe par le catalogue, même si une page d'outil l'affiche.

## Ajouter une chaîne

1. Clé anglaise stable, jamais renommée à la légère.
2. Phrase complète par langue dans la famille du tableau (ou `{nom}` si l'ordre des mots change, surtout en allemand). Pas de morceau français réutilisé tel quel.
3. Afficher avec `t` ou `tf` au moment du dessin, pas au chargement du module.
4. Radio ou réplique : 110 caractères max, espace insécable (`NB` de `locale.ts`) avant `: ; ! ?`, dans **chaque** langue. Raccourcir plutôt qu'assouplir. `npm run check-levels` simule la file pour les 5 langues.
5. Si la famille existe déjà : pas de nouveau fichier. Sinon une ligne dans le tableau ci-dessus, dans le même changement.

## Ajouter une langue

1. Ajouter le code à `LOCALES` et à `LANG_PREFS` (`locale.ts`). `L()` et `L10n` exigent alors la nouvelle colonne : tsc liste les trous.
2. Libellé du choix dans `LANG_FIXED` (`ui/screens/options.ts`), dans sa propre langue.
3. Repli inchangé (français) tant que la langue n'est pas dans `LOCALES`.
4. Une ligne ici.

## Audio (non refait)

Statut : **français conservé**. Pas de nouveaux fichiers binaires.

Linguistique, à prévoir plus tard (une prise ou une piste par locale, même identifiant) :

- Voix EVA de l'essai d'arrimage, `art/voix/arrimage/*.mp3` (liste et textes dans le README du dossier). Clips présents : `dock_50m`, `dock_10m`, `count_4`, `count_3`, `count_2`, `drift_right`, `aligned`, `contact`. Les autres lignes sont encore texte + bip.
- Textes parlés de `VOICE` dans `preview/dock.ts`, et la synthèse du téléphone sur cette page d'essai.

Non linguistique (ne pas traduire, ne pas dupliquer) : SFX procéduraux (`RECIPES`, y compris `lumaBip`), musiques (`TRACKS`), bips de la radio.

Brancher plus tard : choisir le clip ou la voix selon `getLocale()` au moment de jouer l'alerte ; un fichier absent retombe sur le français puis sur texte + bip, comme aujourd'hui. Ajouter la famille dans le tableau ci-dessus le jour où c'est codé.
