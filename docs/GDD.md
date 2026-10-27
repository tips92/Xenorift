# Xeno Rift — document de conception (démo v0.1)

Nom provisoire. Héros : **Kaï**, astronaute explorateur. Vaisseau : **la Comète**.
Kaï s'est posé sur des mondes extraterrestres ; il doit traverser chaque monde à pied jusqu'à la Comète,
puis voler à travers des portails intergalactiques jusqu'au monde suivant.

## Plateformes cibles et contraintes techniques

- Android d'abord (APK via Capacitor 8), iOS ensuite avec le même code (Capacitor `ios`).
- TypeScript + Vite. 2D : Phaser 3.90 (Arcade Physics). 3D : Three.js r186 (WebGL).
- **Écran paysage uniquement**, tout se joue au tactile. Le clavier existe seulement pour tester sur PC.
- **Aucun fichier image ni audio** : graphismes dessinés par code (Canvas 2D / géométries Three.js),
  sons et musiques synthétisés (Web Audio). Le code doit permettre de remplacer facilement les visuels plus tard.
- Mobile milieu de gamme : viser 60 i/s ; 3D sous ~150 draw calls, pas de post-traitement plein écran,
  pixelRatio plafonné à 1,5 ; pas d'allocation dans les boucles de jeu (réutiliser vecteurs et objets).
- Compatibilité iOS : pas d'API propre à Android, audio débloqué par un geste, inclinaison soumise à
  `DeviceOrientationEvent.requestPermission()`, zones sûres (`env(safe-area-inset-*)`) respectées.
- Langue de l'interface : français. Code : identifiants en anglais, commentaires courts en français.

## Direction artistique — « néon extraterrestre »

Vectoriel lumineux : fonds sombres, dégradés, contours et halos lumineux (glow), formes arrondies et
organiques, silhouettes lisibles. Partout : ciel galactique (étoiles scintillantes, nébuleuses colorées,
planètes) et **créatures géantes qui bougent au loin**.

- **Jungle de Xéna (monde 1)** : ciel violet-bleu nuit avec voie lactée turquoise ; arbres-champignons géants,
  lianes, fougères bioluminescentes cyan / magenta ; sol de terre violette sombre couvert de mousse vert-cyan
  lumineuse. Au loin : une méduse-baleine géante qui flotte lentement dans le ciel, de petites créatures volantes.
  Ennemis : blob vert gluant (marcheur), guêpe-libellule (volant), scarabée à carapace (blindé),
  plante carnivore cracheuse de spores (cracheur).
- **Lune Krator (monde 2)** : ciel noir-indigo, énorme planète à anneaux en fond, comètes qui passent ;
  sol de régolithe gris-lilas veiné de cristaux orange, cratères. Au loin : un ver des sables géant qui
  surgit des dunes de temps en temps. Ennemis : acarien de cristal (marcheur), drone-œil (volant),
  crabe de roche (blindé), tourelle de cristal (cracheur).
- **Kaï** : combinaison blanche, visière orange lumineuse, sac à dos avec lumières cyan, bras qui tient
  un pistolet laser. Lisible à 64x80 px.
- **La Comète** (même design en 2D et en 3D) : coque blanche effilée, ailes en delta, cockpit et bandes
  cyan, réacteurs à flamme orange.
- Laser du joueur : cyan-blanc lumineux. Projectiles ennemis : magenta / vert acide.

## Mode plateforme 2D

Défilement horizontal, gameplay « à la Mario ». Constantes et règles de level design :
`src/game2d/constants.ts`. Format des niveaux : `src/game2d/levels/types.ts`.

- Contrôles : ◀ ▶ à gauche (on peut glisser le doigt d'une flèche à l'autre), **Saut** et **Tir** à droite.
  Saut à hauteur variable (relâcher tôt = petit saut), « coyote time » (~100 ms) et mémoire d'appui (~120 ms).
- Laser : part dans la direction où regarde Kaï ; jauge de surchauffe (5 tirs rapides = surchauffe).
- Vie : 3 cœurs, 3 vies ; coup reçu = -1 cœur, recul, clignotement 1,2 s. 0 cœur ou chute dans un trou =
  vie perdue, retour au dernier point de contrôle avec 3 cœurs. 0 vie = mission échouée.
- Ennemis : sauter dessus les élimine (rebond) sauf le blindé ; le laser élimine tout (blindé : 2 tirs).
- Bonus (blocs frappés par dessous) : tir triple 15 s, bouclier (absorbe 1 coup), double saut 20 s.
- Cristaux à ramasser. Fin du niveau : toucher la Comète → animation de décollage → résultats.
- Score : cristaux x50 + ennemis x100 + bonus de temps + vies restantes x500.
  Étoiles : 1 = terminé, 2 = ≥ 50 % des cristaux, 3 = ≥ 90 % des cristaux.
- Durée visée : 2 à 3 minutes par niveau (~220 colonnes).

## Mode vol spatial 3D

Vol en « couloir semi-libre » : la Comète avance seule vers l'avant ; le joueur la déplace
haut / bas / gauche / droite dans un couloir (rayon ~12 unités) pour traverser les portails.

- Contrôles : joystick virtuel à gauche, bouton **Turbo** à droite (jauge qui se vide et se recharge).
  Option « inclinaison du téléphone » (réglage) qui remplace le joystick.
- Portails : anneaux lumineux animés, ~16 à 22 par parcours, positions variées mais toujours atteignables.
  Portail traversé = +2 s et son ; portail manqué = -5 s et message.
- Obstacles : astéroïdes (et débris). Choc = -1 bouclier (3 au total), ralentissement, secousse.
  0 bouclier ou chrono à 0 = mission échouée.
- Fin : un grand portail de distorsion (warp) → effet de vitesse → résultats.
- Décor : skybox nébuleuse colorée, champ d'étoiles, planètes, traînées de vitesse, et **une créature
  spatiale géante** qui nage au loin (vol 1 : léviathan de la nébuleuse ; vol 2 : planète à anneaux
  et ver cosmique).
- Parcours « nebula » (vol 1, facile, ~75 s) et « asteroids » (vol 2, ceinture d'astéroïdes dense, ~90 s).
- Score : temps restant x100 + portails x200 + bonus sans dégât. Étoiles selon le ratio de portails.

## Interface et enchaînement

Accueil (JOUER / NIVEAUX / OPTIONS) → carte d'intro de l'étape → jeu (HUD + pause) → résultats
→ étape suivante. Après le vol 2 : « Fin de la démo ».

- Choix du niveau : 4 cartes, verrouillées tant que l'étape précédente n'est pas réussie
  (option « Tout débloquer » pour tester). Meilleur score et étoiles affichés.
- Options : musique, effets sonores, vibrations, pilotage par inclinaison, tout débloquer,
  réinitialiser la progression.
- Pause : bouton en haut à droite, touche Échap/P, bouton retour Android, mise en arrière-plan de l'app.
- Bouton retour Android : en jeu → pause ; dans un sous-menu → retour ; sur l'accueil → quitter.
- Écran « Tourne ton téléphone » si l'affichage est en portrait (navigateur).
- Polices embarquées : Orbitron (titres), Exo 2 (texte).

## Évolutions prévues

Liste de souhaits et idées à discuter : [SOUHAITS.md](SOUHAITS.md).

Trame de la campagne en 5 mondes : [HISTOIRE.md](HISTOIRE.md).
