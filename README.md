# Xeno Rift

Démo d'un jeu mobile : plateforme 2D (style Mario, avec armes à tir) entrecoupée de vols spatiaux en 3D
à travers des portails intergalactiques, où la Comète tire sur les astéroïdes et les ennemis. Univers
extraterrestre, tout se joue à l'écran tactile.
Conception détaillée : [docs/GDD.md](docs/GDD.md).

## Contenu de la démo

| Étape | Type | Lieu |
|---|---|---|
| 1 | Plateforme 2D | Jungle de Xéna |
| 2 | Vol spatial 3D | Nébuleuse d'Azur |
| 3 | Plateforme 2D | Lune Krator |
| 4 | Vol spatial 3D | Ceinture d'Orak |

Chaque étape se choisit dans le menu « Niveaux » (déblocage progressif, ou « Tout débloquer » dans les options).
Entre deux étapes (« Suivant » sur les résultats) et depuis le menu « Niveaux », le **hangar** de la Comète
dépense les cristaux ramassés (niveaux 2D et vols) : armes de Kaï et leurs améliorations, cœurs
supplémentaires, mitrailleuse, bouclier et turbo de la Comète.

## Technique

- TypeScript + Vite. 2D : Phaser 3. 3D : Three.js. Emballage mobile : Capacitor 8 (Android, iOS ensuite).
- Aucun fichier image ou son : graphismes dessinés par code, musique et bruitages synthétisés.
- Tous les outils et caches sont sur `D:\DevTools` (le disque C: est plein).

```
src/core      contrats partagés, étapes, sauvegarde, fiches des armes et des canons, catalogue du hangar
src/ui        écrans (dont le hangar), HUD, enchaînement des étapes
src/input     clavier, contrôles tactiles, inclinaison
src/audio     sons et musiques synthétisés
src/game2d    mode plateforme (moteur, graphismes, niveaux)
src/game3d    mode vol spatial (parcours, tir, ennemis, cristaux)
android       projet Android natif (généré par Capacitor)
tools         scripts d'installation et de build Android
scripts       validation des niveaux 2D
tests/e2e     tests de bout en bout (Chrome sans fenêtre)
```

## Jouer sur PC (test)

```bash
npm run dev
```

Puis ouvrir http://localhost:5173. Clavier : flèches ou ZQSD, Espace ou K = saut (Espace = turbo en vol),
J, X ou F = tir, Échap = pause. En 2D, ↑ / Z vise vers le haut (avec ← → : en diagonale) et fait entrer dans
une porte ; il ne fait pas sauter. ↓ / S accroupit (puis ← → : ramper) ; ↓ + saut descend d'une plateforme
traversable ou mobile. En vol, la Comète tire tant que la touche de tir est tenue (vers la cible devant elle) ;
Maj ou Espace = turbo ; le tir et le turbo font chauffer la même jauge d'énergie. Sur téléphone : stick rond à
8 directions, boutons Saut et Tir ; en vol, joystick, gros bouton Tir et Turbo au-dessus ; taille, opacité et
mode gaucher dans Options › Commandes.
Raccourcis de test : `?stage=j1` (ou `f1`, `m1`, `f2`) lance directement une étape, `?unlock=1` débloque tout,
`?touch=1` affiche les boutons tactiles sur PC, `?weapon=machinegun` (ou `laser`, `shotgun`, `rifle`) impose
l'arme pour la session, même si elle n'est pas possédée (rien n'est enregistré ; une valeur inconnue est
ignorée, avec le message « Arme inconnue » sur l'accueil, ou en début de partie avec `?stage=`). Les
paramètres se combinent : `?stage=m1&weapon=rifle`.

Mode test (« Tout débloquer » dans les options, ou `?unlock=1`) : les 4 armes et le double saut sont
disponibles. Au hangar (après « Suivant » sur les résultats, ou bouton « Hangar » du choix du niveau), le mode
test lève les conditions d'achat (plans d'armes, équipage) mais pas les prix, et une arme non possédée s'y
équipe pour la session seulement (rien n'est enregistré).

## Tests

```bash
npm test                      # vérification des types + niveaux 2D + tests rapides (suite smoke)
npm run build                 # nécessaire avant la suite complète (un scénario teste dist/)
npm run e2e -- --suite full   # tous les tests de bout en bout (plusieurs minutes)
```

Les tests de bout en bout pilotent Chrome sans fenêtre sur le vrai GPU, un seul navigateur à la fois.
Le serveur de dev déjà ouvert est réutilisé, sinon le lanceur en démarre un (de même pour `vite preview`
sur le port 4173). Captures dans `tests/e2e/out/`.
Détails, options et écriture d'un scénario : [tests/e2e/README.md](tests/e2e/README.md).

## Construire l'APK Android

1. Une seule fois : installer Java et le SDK Android sur D: (accepte les licences Google du SDK).

   ```bash
   tools\setup-android.cmd
   ```

   Le SDK se télécharge depuis `dl.google.com`. Si le script affiche « impossible de joindre dl.google.com »,
   ce nom est bloqué par le DNS du réseau (box, bloqueur de pubs, contrôle parental, Pi-hole, NextDNS…) :
   l'autoriser puis relancer le script.

2. Construire l'APK de test : il apparaît à la racine sous le nom `XenoRift-debug.apk`.

   ```bash
   tools\build-apk.cmd
   ```

3. Installer sur le téléphone branché en USB (options développeur + débogage USB activés),
   ou copier simplement l'APK sur le téléphone et l'ouvrir.

   ```bash
   tools\install-apk.cmd
   ```

## Plus tard : iOS

Le code est déjà compatible (audio débloqué au toucher, autorisation d'inclinaison iOS, zones sûres de l'écran).
Il faudra un Mac avec Xcode et un compte Apple Developer, puis :

```bash
npm install @capacitor/ios
npx cap add ios
npx cap open ios
```

Dans Xcode : limiter l'orientation au paysage et masquer la barre de statut.
