# Xeno Rift — document de conception (démo v0.1)

Nom provisoire. Héros : **Kaï**, astronaute explorateur. Vaisseau : **la Comète**. Ordinateur de bord :
**LUMA**, qui guide Kaï par radio.
Kaï s'est posé sur des mondes extraterrestres ; il doit traverser chaque monde à pied jusqu'à la Comète (ou
jusqu'à une balise de LUMA, qui le remonte dans la Comète en orbite), puis voler à travers des portails
intergalactiques jusqu'au monde suivant. Le monde 1 passe au format de la campagne en 5 mondes
([HISTOIRE.md](HISTOIRE.md), plan [04](plans/04-monde-1.md)) : ses 3 niveaux, ses 2 mini-boss et son gardien
sont faits (4a, 4b), les cinématiques et le boss du vol suivent (4c) ; la Lune reste au format de la démo v0.1.

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
  Le Vide la tache de gris : quelques taches au niveau 1, plus proche et plus grise au niveau 2, immense et toute
  grise au niveau 3 (le décor et les ennemis gardent leurs couleurs).
  Ennemis : blob vert gluant (marcheur), guêpe-libellule (volant), scarabée à carapace (blindé),
  plante carnivore cracheuse de spores (cracheur).
- **Lune Krator (monde 2)** : ciel noir-indigo, énorme planète à anneaux en fond, comètes qui passent ;
  sol de régolithe gris-lilas veiné de cristaux orange, cratères. Au loin : un ver des sables géant qui
  surgit des dunes de temps en temps. Ennemis : acarien de cristal (marcheur), drone-œil (volant),
  crabe de roche (blindé), tourelle de cristal (cracheur).
- **Kaï** : combinaison blanche, visière orange lumineuse, sac à dos avec lumières cyan, bras qui tient
  son arme. Lisible à 64x80 px. Le bras armé est un sprite à part (64x32) qui pivote à l'épaule
  selon la visée : les poses du corps n'ont pas à être redessinées pour chaque angle ni pour chaque arme.
  Une silhouette et une couleur par arme : pistolet laser cyan-blanc, mitrailleur compact cyan, pompe au canon
  épais ambre, fusil d'assaut long blanc-violet à lunette.
- **La Comète** (même design en 2D et en 3D) : coque blanche effilée, ailes en delta, cockpit et bandes
  cyan, réacteurs à flamme orange ; canon léger sous le nez, ou mitrailleuse (deux canons sous les ailes,
  bagues cyan).
- Tirs du joueur : lumineux, de la couleur de l'arme (trait laser cyan-blanc, traits courts cyan du
  mitrailleur, plombs ambre de la pompe, long trait blanc-violet du fusil ; traits cyan du canon de la
  Comète). Projectiles ennemis : magenta / vert acide (en vol : orbes magenta).

## Mode plateforme 2D

Défilement horizontal, gameplay « à la Mario ». Constantes et règles de level design :
`src/game2d/constants.ts`. Format des niveaux : `src/game2d/levels/types.ts`.

- Contrôles : stick rond fixe à 8 directions à gauche (on glisse le doigt d'une direction à l'autre),
  **Saut** et **Tir** à droite (l'inverse en mode gaucher). Secteurs : ← → jusqu'à 30° de l'horizontale,
  diagonales de 30° à 65°, ↑ ↓ au-delà (`src/input/stick.ts`) ; les diagonales vers le bas comptent comme
  ← → (pas d'accroupi par accident en courant). Le stick ne fait jamais sauter : seul le bouton Saut saute.
  Saut à hauteur variable (relâcher tôt = petit saut), « coyote time » (~100 ms) et mémoire d'appui (~120 ms).
  - ↑ seul : Kaï s'arrête et vise en haut ; ↑ + côté : il court en visant en diagonale.
  - ↓ seul au sol : accroupi (boîte de 46 px au lieu de 70, tir à l'horizontale au ras du sol) ; une fois
    accroupi, ↓ + côté fait ramper lentement. Sous un plafond trop bas, il ne se relève pas et ne saute pas ;
    ← → seuls l'y font ramper (passages d'une tuile de haut).
  - ↓ + Saut sur une plateforme traversable (`=`) ou mobile : descente d'un étage (sur un sol plein, c'est un
    saut normal).
  - ↑ devant une porte (au sol) : entrer ; on ressort devant l'autre porte de la paire. Une flèche ▲ apparaît
    au-dessus de la porte quand Kaï est devant. Avec Tir maintenu, ↑ vise sans entrer.
  - Options, rubrique Commandes : taille des boutons et opacité (3 crans), mode gaucher (stick à droite).
- Armes : le tir part du canon dans la direction visée (devant, diagonale haute ou haut). Pas de munitions :
  chaque arme a sa jauge de surchauffe (l'icône de la jauge montre l'arme tenue) ; en surchauffe, plus de tir
  jusqu'à ce que la jauge redescende sous 30 %. Un son de tir par arme (une rafale de fusil = 3 sons).
  L'arme équipée est enregistrée dans la sauvegarde et gardée d'un niveau à l'autre ; on part avec le
  pistolet laser, les autres s'achètent au hangar une fois leur plan récupéré (mitrailleur : en réussissant le
  vol 1, donné aussi à qui l'avait déjà fini ; les autres plus tard ; en mode test, toutes s'essaient au hangar). Chaque arme s'améliore au hangar (dégâts, cadence, portée,
  refroidissement, voir « Hangar »). Fiches : `src/core/weapons.ts` (valeurs de départ, à régler sur téléphone).

  | | Pistolet laser | Mitrailleur | Pompe | Fusil d'assaut |
  |---|---|---|---|---|
  | Rôle | polyvalent | moyenne portée, arrose | courte portée, gros coup | longue portée, précis |
  | Portée | 9 tuiles | 7 tuiles | 3,5 tuiles | 12 tuiles |
  | Tir | 1 trait | 1 balle, dispersion ±3° | 5 plombs en éventail ±14° | rafale de 3 balles (70 ms) |
  | Délai entre tirs | 160 ms | 80 ms | 600 ms | 450 ms par rafale |
  | Dégâts | 2 | 1 | 1 par plomb | 2 par balle |
  | Avant surchauffe (tir maintenu) | 5 tirs | 17 tirs | 3 tirs | 4 rafales |

- Vie : 3 cœurs (4 ou 5 avec les cœurs du hangar), 3 vies ; coup reçu = -1 cœur, recul, clignotement 1,2 s.
  0 cœur ou chute dans un trou = vie perdue, retour au dernier point de contrôle avec tous ses cœurs. 0 vie =
  mission échouée.
- Ennemis : sauter dessus les élimine (rebond) sauf le blindé ; les tirs éliminent tout. Points de vie :
  2 (normaux), 4 (blindé) : 1 tir de laser ou 2 balles de mitrailleur pour un ennemi normal, 2 tirs de laser
  pour le blindé ; au contact, un coup de pompe élimine le blindé.
- Bonus (blocs frappés par dessous) : **vitesse** (bloc `1`, course et accélérations ×1,35 pendant 12 s,
  saut inchangé, traînée lumineuse), **bouclier** (bloc `2`, absorbe 1 coup), **cadence** (bloc `3`, délai
  entre tirs et chauffe par tir ×0,6 pendant 12 s, étincelles plus vives au canon). Vitesse et cadence se
  cumulent, un anneau chacun dans le HUD ; reprendre le même bonus remet 12 s. Tout est perdu avec une vie.
- Double saut : une compétence apprise (sauvegarde), plus un bonus : Kaï l'apprend en battant la méduse-baleine
  (Jungle, niveau 3) ; actif en mode test. Les endroits qu'il est seul à
  atteindre sont des « secrets de compétence » (on y revient plus tard) : les 3 étoiles restent possibles sans eux.
- Cristaux à ramasser. Fin du niveau : sur la Lune, toucher la Comète → animation de décollage → résultats ;
  aux niveaux 1 et 2 d'un monde au nouveau format (Jungle), toucher la **balise de LUMA** (colonne
  blanche, œil cyan) : un faisceau descend du ciel, Kaï s'élève et file vers la Comète en orbite (≈ 2 s). Le
  faisceau happe Kaï à toute hauteur : on ne saute pas par-dessus la balise. Le niveau 3 n'a pas de sortie : la
  défaite du gardien le termine (≈ 2,5 s : il crie et s'élève, encore gris ; Kaï retombe et attend).
- Départ (Jungle, niveau 1) : la Comète est posée derrière Kaï, il en saute, puis elle repart en orbite à vide
  (LUMA s'en explique : le Vide la brouille). Les niveaux 2 et 3 commencent dans le faisceau de LUMA.
- **Champignons** (Jungle, mécanique du monde) : on ne s'y tient pas, toute arrivée dessus relance Kaï à 6,5 tuiles,
  8 en tenant Saut à l'impact (on garde le contrôle en l'air et le double saut). Ils franchissent les murs et les
  trous ; dans les arènes, ils sont collés aux bornes (on y entre et on en sort en rebondissant).
- **La créature agit au niveau 2** (Jungle) : son ombre balaie l'écran (cri), une secousse abat un tronc qui
  bouche le tunnel (on passe par une porte), une pluie de spores tombe devant Kaï, chacune annoncée 1 s par une tache
  au sol (s'écarter, ou les abattre au tir). Au niveau 3, la pluie de spores revient.
- **Naufragée** (Jungle, niveau 2) : **Tess**, mécanicienne, attend près de sa capsule dans une salle murée du
  rocher, derrière la porte qui contourne le tronc. ↑ devant elle : elle parle par la radio, puis LUMA la téléporte
  à bord (« Tess est à bord ! ») ; les portes restent fermées le temps du sauvetage, et la seule porte vers la suite
  est la sienne (on ne peut pas la manquer). Elle rejoint l'équipage à la réussite du niveau (après un échec, elle
  attend de nouveau) ; en rejouant le niveau, seule sa capsule reste.
- Portes (`D` dans la carte) : par paires, chacune mène devant l'autre. Dans la Jungle, une paire relie le
  rocher du blindé à une **ruine astréenne** murée tout en haut (3 cristaux, comptés pour les 3 étoiles) :
  six glyphes gravés au mur s'allument quand Kaï approche (en vague quand il arrive par la porte), et LUMA y
  raconte les Astréens, bâtisseurs des portails disparus.
  Passages bas (reptation) et descentes ↓ + Saut restent hors du chemin principal. Dans la Jungle, les
  plateformes traversables (`=`) sont dessinées en branches, lianes ou passerelles (une famille par rangée).
- **LUMA, radio non bloquante** : bulle en haut à gauche (portrait animé, texte écrit lettre à lettre avec
  des bips synthétisés), jamais cliquable, figée en pause ; 2 messages en attente au plus (le plus ancien cède
  la place, un message urgent passe devant). Les messages se déclenchent en entrant dans une zone du niveau ou
  sur un événement (première surchauffe, premier point de contrôle, première porte, début d'un combat de
  boss, sauvetage). Au clavier, LUMA nomme les touches au lieu des boutons tactiles. Radio brouillée par le Vide
  (tout le niveau 3 de la Jungle, près de la gardienne) : bulle grise qui tressaute. Un dialogue (Tess, puis LUMA)
  coupe la parole au message en cours. Les messages de l'interface passent sous la bulle, un seul à la fois.
- **Tutoriel du niveau 1** (Jungle) : 11 messages de LUMA, chacun au moment où la commande sert (courir et
  sauter, écraser ou tirer un blob, viser en haut et en diagonale, s'accroupir et descendre d'une plateforme,
  point de contrôle, surchauffe, blocs bonus, blindé, porte, cristaux hors d'atteinte « pour l'instant »,
  boss), plus 3 messages d'histoire (arrivée, ruine, balise). Le premier marcheur est enfermé entre deux
  piliers : rien ne vient sur Kaï tant qu'il lit. Le tutoriel se tait une fois le niveau 1 réussi (marque
  enregistrée ; un ancien joueur l'entend donc une fois) ; il rejoue après un échec.
- **Mini-boss** (fin des niveaux 1 et 2) : point de contrôle juste avant une **arène** ; en y entrant, des
  barrières d'énergie se ferment de chaque côté (jusqu'en haut de l'écran), la caméra se cale sur l'arène, la
  musique de boss démarre et une barre de vie (nom, phase, repères, un cran par touche) s'affiche en bas au
  centre. Vie perdue : retour au point de contrôle, arène rouverte, boss remis à neuf. Victoire : le boss
  s'enfuit, les barrières s'éteignent, prime de 2 000 points (« Boss vaincu +2 000 » sous le score des résultats).
- **Boss en touches** (décidé après l'essai sur téléphone) : un boss ne compte pas des points de vie mais des
  touches. Une touche = un tir (n'importe quelle arme ; un coup de pompe compte une fois) ou un saut qui atteint son
  point faible exposé ; le point faible se referme ensuite jusqu'à la fenêtre suivante. Les améliorations de
  dégâts ne changent rien contre les boss.
  - **Blob-roi** (Jungle, niveau 1), rejeton du gardien : grosse gelée couronnée. Il bondit vers Kaï,
    s'aplatit à l'atterrissage en lançant deux ondes au sol (à sauter) et expose alors son noyau magenta, seul
    point faible (ailleurs, la gelée arrête les tirs) ; un tir ou un saut sur le noyau aplati = une touche, puis il
    se relève ; rebondir sur la gelée ou la couronne ne compte pas. 4 touches ; après 2, colère (1,2 s) puis
    phase 2 : plus rapide, il appelle 2 petits blobs. IA de test : ≈ 12 s ; joueur : ≈ 25 s.
  - **Scarabée-titan** (Jungle, niveau 2), rejeton du gardien : énorme scarabée à carapace. Il gratte le sol tête
    basse (annonce), puis charge vers Kaï jusqu'au champignon collé à une borne de l'arène, qu'il écrase en s'y
    assommant : il tombe sur le dos, ventre exposé, seul moment où on le touche (un tir sur son corps retourné, ou
    un saut sur le ventre, avec un grand rebond) ; une touche le réveille. Debout, sa carapace renvoie les tirs ;
    on le franchit pendant la charge en rebondissant sur lui ou sur le champignon. 4 touches ; après 2, carapace
    fendue, plus rapide, et chaque choc fait tomber 3 cailloux d'au-dessus de l'écran, annoncés par une marque
    ambrée sur leur point d'arrivée. IA de test : ≈ 16 s ; joueur : ≈ 30 s.
- **Gardien** (niveau 3) : point de contrôle unique, juste avant l'arène ; musique du gardien, plus intense à
  chaque phase ; prime de 5 000 points.
  - **Méduse-baleine** (Jungle), toute grise : elle arrive d'en haut quand les barrières se ferment et plane
    au-dessus de Kaï (son corps arrête les tirs ; il ne blesse qu'en plongée). Après chaque attaque, elle lâche
    des spores annoncées par des taches au sol, puis son cœur magenta descend sous elle et s'ouvre 3 s (4 s en
    phase 3) : seul point faible, touché vers le haut, en diagonale (la pompe l'atteint) ou droit devant depuis
    l'une des 3 passerelles de l'arène. 6 touches, 2 par phase. Phase 1 : tentacules abattus au sol (une marque
    les annonce) ; phase 2 : un tentacule balaie l'arène à mi-hauteur (s'accroupir ou sauter) et 2 guêpes
    gênent les tirs ; phase 3 : plongée (son ombre grandit au sol : s'écarter). Vaincue, elle s'élève, encore
    grise (ses couleurs reviendront dans la cinématique de libération, 4c) ; le niveau se termine et donne le
    **double saut**. Combat estimé : ≈ 1 min.
- **Réessayer le combat** : si les vies tombent à zéro en plein combat de boss (ou si la liaison graphique est
  perdue pendant le combat), l'écran d'échec propose « Réessayer le combat » au-dessus de « Réessayer » (tout le
  niveau) et « Menu » : on repart du point de contrôle d'avant l'arène avec 3 vies, cœurs pleins, boss à neuf, et
  tout ce qu'on avait à ce point (temps, cristaux, blocs frappés, ennemis abattus, messages et événements déjà
  joués, Tess secourue, tronc couché, bonus en cours) ; le score n'a alors pas de prime de vies. Valeurs de
  départ des boss, à régler sur téléphone.
- Score : cristaux x50 + ennemis x100 + bonus de temps + vies restantes x500 (sauf après « Réessayer le combat »)
  (+ 2 000 si un mini-boss est vaincu, + 5 000 pour le gardien).
  Bonus de temps : 10 points par seconde sous le temps de référence du niveau (240 s pour chaque niveau actuel).
  Étoiles : 1 = terminé, 2 = ≥ 50 % des cristaux, 3 = ≥ 90 % des cristaux.
  Les cristaux ramassés vont aussi dans la réserve du hangar quand le niveau est réussi, même en le rejouant ;
  ceux d'une tentative ratée sont perdus.
- Durée visée : 2 à 3 minutes par niveau, combat compris (≈ 250 colonnes avec l'arène aux niveaux 1 et 2, ≈ 160 +
  l'arène au niveau 3). Jungle : niveau 1 « Lisière de Xéna » 252 colonnes, niveau 2 « Canopée des spores » 232,
  niveau 3 « Sanctuaire du gardien » 186 ; ≈ 2 min 20 à 2 min 40 estimées chacun.

## Mode vol spatial 3D

Vol en « couloir semi-libre » : la Comète avance seule vers l'avant ; le joueur la déplace
haut / bas / gauche / droite dans un couloir (rayon ~12 unités) pour traverser les portails.

- Contrôles : joystick virtuel à gauche, bouton **Turbo** à droite (jauge qui se vide en 2,5 s et se
  recharge en 5 s ; module Turbo du hangar : durée et recharge ×1,25 puis ×1,5), et bouton **TIR** en tir
  manuel seulement (voir plus bas) ;
  l'inverse en mode gaucher, avec la même taille et la même opacité qu'en 2D.
  Option « inclinaison du téléphone » (réglage) qui remplace le joystick.
- Portails : anneaux lumineux animés, ~16 à 22 par parcours, positions variées mais toujours atteignables.
  Portail traversé = +2 s et son ; portail manqué = -5 s et message.
- Obstacles : astéroïdes (et débris). Choc = -1 bouclier (3 au total, 4 ou 5 avec le bouclier renforcé du
  hangar), ralentissement, secousse.
  0 bouclier ou chrono à 0 = mission échouée.
- Canon de la Comète (étape 3b ; valeurs de départ, à régler sur téléphone) : **canon léger** au départ (sous
  le nez, 4 tirs/s, dégâts 1, trait cyan) ; **mitrailleuse** en première amélioration du hangar (deux canons
  sous les ailes en alternance, 10 tirs/s, trait cyan clair), puis dégâts ×1,25 / ×1,5 et cadence ×1,15 / ×1,3.
  Portée : la distance parcourue en 1,6 s. Surchauffe comme au sol : tir continu surchauffé au bout de 4 s
  (canon léger) ou 3 s (mitrailleuse), reprise sous 30 %.
- Tir **automatique** par défaut : la Comète tire seule sur l'astéroïde ou l'ennemi le plus proche dans un cône
  de 10° devant elle (tir guidé de 6° au plus), seulement si le tir peut toucher et si les tirs déjà en route ne
  suffisent pas à détruire la cible. Option **« Tir manuel »** (Commandes, aussi dans Pause) : bouton **TIR** à
  côté de Turbo, en vol seulement (gaucher, taille et opacité respectés). Clavier : J / X / F dans les deux modes.
- Astéroïdes destructibles : 1 à 5 PV selon la taille ; détruit par les tirs, il éclate sans dégât pour la
  Comète (10 points) ; environ un rocher du couloir sur quatre lâche un cristal.
- Ennemis « touchés par le Vide » (silhouettes violet-noir veinées de magenta), en vagues fixes par parcours
  (6 dans la Nébuleuse d'Azur, 10 dans la Ceinture d'Orak ; jamais dans un portail ni sur sa ligne
  d'approche) : **chasseur** (3 PV, 150 points, 2 cristaux : arrive de face, tire une orbe vers la position
  anticipée de la Comète, puis s'écarte en virant), **mine** (2 PV, 50 points, 1 cristal : immobile, clignote,
  explose si la Comète passe tout près), **essaim** (5 à 7 en formation ondulante, 1 PV et 30 points chacun,
  1 cristal pour la vague entière abattue). Orbes lentes, grosses, magenta (le magenta est réservé aux orbes et
  aux veines : œil du chasseur ambre, explosions blanches et violettes). Orbe, mine ou contact : -1 bouclier
  (même invulnérabilité qu'après un rocher) ; l'ennemi percuté est détruit sans points.
- Cristaux du vol : cyan et bleus comme l'icône et le cristal 2D (dans tous les parcours), halo qui pulse et
  éclat bref ; aimantés quand la Comète passe près ; +1 réserve et 50 points chacun. Le HUD du vol
  montre la jauge de chauffe du canon et les cristaux ramassés.
- Fin : un grand portail de distorsion (warp) → effet de vitesse → résultats.
- Décor : skybox nébuleuse colorée, champ d'étoiles, planètes, traînées de vitesse, et **une créature
  spatiale géante** qui nage au loin (vol 1 : léviathan de la nébuleuse ; vol 2 : planète à anneaux
  et ver cosmique).
- Parcours « nebula » (vol 1, facile, ~75 s) et « asteroids » (vol 2, ceinture d'astéroïdes dense, ~90 s).
- Score : temps restant x100 + portails x200 + bonus sans dégât (1 000) + rochers détruits x10 + ennemis
  abattus (150, 50 ou 30) + cristaux ramassés x50. Étoiles selon le ratio de portails (1 = terminé, 2 = ≥ 70 %,
  3 = ≥ 95 %), inchangées par le combat. Les cristaux du vol vont dans la réserve si le vol est réussi.

## Interface et enchaînement

Accueil (JOUER / NIVEAUX / OPTIONS) → carte d'intro de l'étape (titre, « Monde 1 · Niveau 1 » ou « Monde 1 ·
Vol », conseil) → jeu (HUD + pause) → résultats → hangar (« Suivant ») → carte d'intro de l'étape suivante. Le
bouton de départ du hangar dit « Atterrir » vers un niveau 1, « Redescendre » vers un niveau 2 ou 3,
« Décoller » vers un vol. Après le vol 2 : « Fin de la démo ». JOUER lance directement la première étape
ouverte et pas encore réussie, sans passer par le hangar ; la ligne sous JOUER dit « Nouvelle aventure » sur
une sauvegarde neuve, sinon « Continuer · <étape> ».

- Choix du niveau (« Niveaux ») : **une page par monde**, ouverte sur le monde de l'étape à jouer ; barre en
  haut avec ◀ ▶, le nom du monde et ses étoiles (total de la campagne dans l'en-tête) ; on change de page en
  glissant le doigt (ou la souris), avec ◀ ▶ ou ← → au clavier ; un glissement ne lance jamais la carte touchée.
  Une étape est ouverte si c'est la première, si elle est réussie ou si la précédente l'est (« Tout débloquer »
  ouvre tout pour tester). Meilleur score et étoiles sur chaque carte. Bouton « Hangar » (avec la réserve) : le
  hangar s'ouvre sans bouton de départ, le retour ramène à la même page du choix du niveau.
- Résultats : score, étoiles, détails et la réserve de cristaux (« +N cristaux » gagnés, nouveau total). Les
  cristaux sont la monnaie du hangar ; les niveaux 2D et les vols en rapportent (en vol : astéroïdes et
  ennemis abattus). Récompense d'une première réussite, en doré : « Équipière : Tess » (Jungle, niveau 2),
  « Compétence : double saut » (Jungle, niveau 3), « Plan : mitrailleur » (vol 1) ; prime « Boss vaincu +2 000 »
  (gardien : +5 000) sous le score.
- **Hangar** (dans la Comète) : réserve en haut, aperçu 2D à gauche (Kaï avec l'arme, la Comète et ses
  modules), onglets **Établi** (armes : équiper, acheter ; 4 améliorations à 3 niveaux par arme : dégâts
  ×1,25 / ×1,5 / ×2, cadence et portée ×1,15 / ×1,3 / ×1,5, refroidissement ×1,25 / ×1,5 / ×1,8),
  **Comète** (mitrailleuse puis ses deux améliorations, voir « Mode vol spatial 3D » ; bouclier renforcé 4 puis 5 boucliers ; turbo) et
  **Kaï** (cœur supplémentaire, jusqu'à 5 ; drone compagnon plus tard). Achat avec confirmation, définitif.
  Prix de départ : arme 80 à 120, amélioration 30 / 60 / 100, mitrailleuse 100 puis 80 / 140, bouclier et
  turbo 80 / 140, cœur 150 / 250. Conditions : une arme demande son plan, les niveaux 2 et 3 d'une
  amélioration la mécanicienne Tess (secourue au niveau 2 de la Jungle ; une fois à bord, « Tess à l'établi » et
  Tess derrière Kaï dans l'aperçu de l'Établi), les cœurs la biologiste Mira (monde 3) : d'ici là, ils ne
  s'achètent qu'en mode test. Bouton retour : ferme la confirmation, puis revient aux résultats (ou au
  choix du niveau).
- Mode test (« Tout débloquer ») : les 4 armes et le double saut ; au hangar, les conditions (plan,
  équipage) sont levées, pas les prix ; une arme non possédée s'y équipe pour la session seulement.
  Raccourci `?weapon=` dans l'URL (arme de la session, jamais enregistrée).
- HUD 2D : cœurs (3 à 5), vies, cristaux, jauge de chauffe avec l'icône de l'arme (une graduation par tir),
  anneaux des bonus actifs (vitesse, cadence, bouclier) ; bulle de LUMA sous les cœurs, en haut à gauche. HUD
  du vol : 3 à 5 boucliers, jauge de turbo, chrono, portails, jauge de chauffe du canon (icône du canon léger
  ou de la mitrailleuse), cristaux du vol. Barre de boss (2D et vol) en bas au centre, entre le stick et les
  boutons : nom, « Phase 1/2 » (« 1/3 » pour le gardien), repères de phase, un cran plus discret par touche,
  éclair blanc au coup.
- Options (même panneau dans le menu Pause), en deux rubriques : **Général** (musique, effets sonores,
  vibrations, tout débloquer) et **Commandes** (aperçu des commandes ; taille des boutons et opacité, 3 crans
  chacune ; mode gaucher ; pilotage par inclinaison ; tir manuel en vol) ; puis réinitialiser la progression
  (déblocages, scores, armes, réserve et achats du hangar, histoire : le tutoriel de LUMA rejouera ; les
  réglages restent). Effet immédiat, même en partie.
- Pause : bouton en haut à droite, touche Échap/P, bouton retour Android, mise en arrière-plan de l'app.
- Bouton retour Android : en jeu → pause ; dans un sous-menu → retour ; sur l'accueil → quitter.
- Écran « Tourne ton téléphone » si l'affichage est en portrait (navigateur).
- Polices embarquées : Orbitron (titres), Exo 2 (texte).

## Évolutions prévues

Liste de souhaits et idées à discuter : [SOUHAITS.md](SOUHAITS.md).

Trame de la campagne en 5 mondes : [HISTOIRE.md](HISTOIRE.md).

Organisation du code et des documents : [ARCHITECTURE.md](ARCHITECTURE.md).
