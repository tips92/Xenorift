import { L, LOCALES, NB, t, tf, type L10n, type Locale } from './i18n/locale.ts';
import { skillPack } from './i18n/names.ts';
import type { CrewId, CutsceneId, SkillId, StagePart } from './types';

// Textes de la campagne (docs/HISTOIRE.md) : titres, sous-titres et conseils des étapes, radio de LUMA, répliques
// des cinématiques. Lisible par Node : données seules, TypeScript effaçable. Chaque langue : L10n.
// Radio et répliques : espace insécable (NB) avant : ; ! ? (pas de retour à la ligne avant la ponctuation).
// Catalogue et règles : docs/LANGUES.md.

export interface StageText {
  /** Titre : cartes, intro, résultats, pause ; aussi LevelData.name du niveau 2D (champ .fr). */
  readonly title: L10n;
  /** Conseil d'une ligne de la carte d'intro. */
  readonly hint: L10n;
}

/** Par identifiant d'étape (core/worlds.ts). */
export const STAGE_TEXTS: Readonly<Record<string, StageText>> = {
  j1: {
    title: L('Lisière de Xéna', 'Edge of Xéna', 'Rand von Xéna', 'Margine di Xéna', 'Linde de Xéna'),
    hint: L(
      'LUMA te guide : rejoins sa balise !',
      'LUMA guides you: reach her beacon!',
      'LUMA führt dich: erreiche ihre Bake!',
      'LUMA ti guida: raggiungi il suo faro!',
      'LUMA te guía: ¡llega a su baliza!',
    ),
  },
  j2: {
    title: L('Canopée des spores', 'Spore Canopy', 'Sporenwipfel', 'Volta delle spore', 'Dosel de esporas'),
    hint: L(
      'Rebondis sur les champignons et retrouve Tess !',
      'Bounce on the mushrooms and find Tess!',
      'Spring auf den Pilzen und finde Tess!',
      'Rimbalza sui funghi e ritrova Tess!',
      'Rebota en los hongos y encuentra a Tess!',
    ),
  },
  j3: {
    title: L('Sanctuaire du gardien', 'Guardian’s Sanctuary', 'Heiligtum des Wächters', 'Santuario del custode', 'Santuario del guardián'),
    hint: L(
      'Libère la méduse-baleine du Vide !',
      'Free the whale jellyfish from the Void!',
      'Befreie den Quallenwal von der Leere!',
      'Libera la medusa-balena dal Vuoto!',
      '¡Libera a la medusa ballena del Vacío!',
    ),
  },
  f1: {
    title: L("Nébuleuse d'Azur", 'Azur Nebula', 'Azur-Nebel', 'Nebulosa di Azur', 'Nebulosa de Azur'),
    hint: L(
      'Le noyau a ouvert le portail… et quelque chose nous suit.',
      'The core opened the gate… and something is following us.',
      'Der Kern hat das Portal geöffnet… und etwas folgt uns.',
      'Il nucleo ha aperto il portale… e qualcosa ci segue.',
      'El núcleo abrió el portal… y algo nos sigue.',
    ),
  },
  m1: {
    title: L('Lune Krator', 'Krator Moon', 'Mond Krator', 'Luna Krator', 'Luna Krator'),
    hint: L(
      'Les crabes blindés ne craignent que tes tirs. Attention aux trous !',
      'Armored crabs fear only your shots. Watch the pits!',
      'Gepanzerte Krabben fürchten nur deine Schüsse. Achtung, Löcher!',
      'I granchi corazzati temono solo i tuoi colpi. Attento ai buchi!',
      'Los cangrejos blindados solo temen tus disparos. ¡Cuidado con los huecos!',
    ),
  },
  f2: {
    title: L("Ceinture d'Orak", 'Orak Belt', 'Orak-Gürtel', 'Cintura di Orak', 'Cinturón de Orak'),
    hint: L(
      'Champ d’astéroïdes dense : utilise le turbo avec prudence !',
      'A dense asteroid field: use the boost with care!',
      'Dichtes Asteroidenfeld: den Turbo mit Bedacht!',
      'Campo di asteroidi fitto: usa il turbo con prudenza!',
      'Campo de asteroides denso: ¡usa el turbo con cuidado!',
    ),
  },
};

const EMPTY = L('', '', '', '', '');

/** Textes d'une étape ; inconnue : son identifiant pour titre. */
export function stageText(id: string): StageText {
  return Object.prototype.hasOwnProperty.call(STAGE_TEXTS, id) ? STAGE_TEXTS[id] : { title: L(id, id, id, id, id), hint: EMPTY };
}

/** Titre dans la langue active. */
export function stageTitle(id: string): string {
  return t(stageText(id).title);
}

/** Conseil dans la langue active. */
export function stageHint(id: string): string {
  return t(stageText(id).hint);
}

/** « Monde 1 · Niveau 2 », « Monde 1 · Vol » (langue active). */
export function stageSubtitle(world: number, part: StagePart): string {
  return part === 4 ? tf(L('Monde {w} · Vol', 'World {w} · Flight', 'Welt {w} · Flug', 'Mondo {w} · Volo', 'Mundo {w} · Vuelo'), { w: world }) : tf(L('Monde {w} · Niveau {n}', 'World {w} · Stage {n}', 'Welt {w} · Level {n}', 'Mondo {w} · Livello {n}', 'Mundo {w} · Nivel {n}'), { w: world, n: part });
}

/** Nom d'une compétence (« Compétence : double saut »). */
export const SKILL_NAMES: Readonly<Record<SkillId, L10n>> = {
  doubleJump: skillPack('doubleJump'),
};

/** Plus long des textes tactile / clavier, pour une langue (check-levels). */
export function radioPlain(m: { readonly text: L10n; readonly keys?: L10n }, locale: Locale): string {
  const text = m.text[locale];
  const keys = m.keys ? m.keys[locale] : '';
  return keys.length > text.length ? keys : text;
}

export { LOCALES };

// ---------------------------------------------------------------- Qui parle (bulle de story/bubble.ts)

/** Qui parle dans la bulle (portrait dessiné par code, story/portraits.ts). */
export type Speaker = 'luma' | 'tess' | 'kai';

/** Humeur du portrait ; « scrambled » = LUMA brouillée par le Vide (bulle grise, « signal brouillé »). */
export type Mood = 'neutral' | 'amused' | 'worried' | 'scrambled';

/** Une réplique. */
export interface StoryLine {
  readonly speaker: Speaker;
  readonly mood: Mood;
  readonly text: L10n;
}

// ---------------------------------------------------------------- Radio de LUMA (ui/radio.ts)

/**
 * Message de la radio, déclenché par un niveau (LevelData.radio) ; RadioId = ses clés. `text` nomme les commandes
 * tactiles (stick, SAUT, TIR) ; `keys`, s'il y en a un, le remplace au clavier (commandes tactiles absentes).
 */
export interface RadioMessage extends StoryLine {
  readonly keys?: L10n;
  /** Tutoriel : se tait une fois TUTORIAL_MARK dans story.seen. */
  readonly tutorial?: boolean;
  /** Passe devant les messages en attente (danger tout proche : à pleine course, la file arriverait trop tard). */
  readonly urgent?: boolean;
  /**
   * Coupe la parole (dialogue lancé par une action de Kaï, calé sur elle : sauvetage) : il remplace aussitôt le
   * message de la bulle, sans trou ; les messages en attente sans ce drapeau sont oubliés, ceux qui l'ont gardent leur
   * ordre.
   */
  readonly interrupt?: boolean;
  /** Parle de ce naufragé avant son sauvetage : se tait une fois qu'il est dans l'équipage (SaveData.crew). */
  readonly castaway?: CrewId;
  /** Radio brouillée par le Vide : bulle grise qui tressaute (humeur « scrambled » à l'affichage). */
  readonly scrambled?: boolean;
}

export const RADIO = {
  // ---- j1, dans l'ordre du niveau (tutoriel : courir et sauter, écraser ou tirer, visée, accroupi et descente,
  // point de contrôle, surchauffe, blocs, blindé, porte, cristaux pour plus tard, boss).
  'j1-start': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: L(
      `Le Vide me brouille… Je te guide depuis l’orbite${NB}!`,
      `The Void is scrambling me… I will guide you from orbit${NB}!`,
      `Die Leere stört mich… Ich führe dich aus dem Orbit${NB}!`,
      `Il Vuoto mi disturba… Ti guido dall’orbita${NB}!`,
      `El Vacío me interfiere… Te guío desde la órbita${NB}!`,
    ),
  },
  'tuto-move': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Stick pour courir, SAUT pour sauter. Tiens SAUT${NB}: tu montes plus haut.`,
      `Stick to run, JUMP to jump. Hold JUMP${NB}: you go higher.`,
      `Stick zum Rennen, SPRUNG zum Springen. SPRUNG halten${NB}: du steigst höher.`,
      `Stick per correre, SALTO per saltare. Tieni SALTO${NB}: sali più in alto.`,
      `Stick para correr, SALTO para saltar. Mantén SALTO${NB}: subes más.`,
    ),
    keys: L(
      `← → pour courir, Espace pour sauter. Tiens Espace${NB}: tu montes plus haut.`,
      `← → to run, Space to jump. Hold Space${NB}: you go higher.`,
      `← → zum Rennen, Leertaste zum Springen. Leertaste halten${NB}: du steigst höher.`,
      `← → per correre, Spazio per saltare. Tieni Spazio${NB}: sali più in alto.`,
      `← → para correr, Espacio para saltar. Mantén Espacio${NB}: subes más.`,
    ),
  },
  'tuto-stomp': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    urgent: true,
    text: L(
      `Un blob, derrière ce pilier. Saute-lui dessus, ou TIR. Il n’a pas d’avis.`,
      `A blob, behind that pillar. Jump on it, or FIRE. It has no opinion.`,
      `Ein Blob hinter dem Pfeiler. Spring drauf, oder FEUER. Ihm ist es egal.`,
      `Un blob, dietro quel pilastro. Saltagli sopra, o FUOCO. Non ha un’opinione.`,
      `Un blob, tras ese pilar. Sáltale encima, o DISPARO. No opina.`,
    ),
    keys: L(
      `Un blob, derrière ce pilier. Saute-lui dessus, ou tire avec J. Il n’a pas d’avis.`,
      `A blob, behind that pillar. Jump on it, or shoot with J. It has no opinion.`,
      `Ein Blob hinter dem Pfeiler. Spring drauf, oder schieß mit J. Ihm ist es egal.`,
      `Un blob, dietro quel pilastro. Saltagli sopra, o spara con J. Non ha un’opinione.`,
      `Un blob, tras ese pilar. Sáltale encima, o dispara con J. No opina.`,
    ),
  },
  'tuto-aim': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Des volants. Stick vers le haut ou en diagonale${NB}: ton tir part dans cette direction.`,
      `Fliers. Stick up or diagonal${NB}: your shot goes that way.`,
      `Flieger. Stick nach oben oder diagonal${NB}: der Schuss geht dorthin.`,
      `Volanti. Stick in alto o in diagonale${NB}: il colpo parte da quella parte.`,
      `Voladores. Stick arriba o en diagonal${NB}: el disparo sale hacia ahí.`,
    ),
    keys: L(
      `Des volants. ↑, ou ↑ avec ← →${NB}: ton tir part en haut ou en diagonale.`,
      `Fliers. ↑, or ↑ with ← →${NB}: your shot goes up or diagonal.`,
      `Flieger. ↑, oder ↑ mit ← →${NB}: der Schuss geht nach oben oder diagonal.`,
      `Volanti. ↑, o ↑ con ← →${NB}: il colpo parte in alto o in diagonale.`,
      `Voladores. ↑, o ↑ con ← →${NB}: el disparo sale arriba o en diagonal.`,
    ),
  },
  'tuto-drop': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Stick vers le bas${NB}: tu t’accroupis. Bas et SAUT sur ces plateformes${NB}: tu passes au travers.`,
      `Stick down${NB}: you crouch. Down and JUMP on these platforms${NB}: you drop through.`,
      `Stick nach unten${NB}: du duckst. Unten und SPRUNG auf diesen Plattformen${NB}: du fällst durch.`,
      `Stick in basso${NB}: ti accucci. Giù e SALTO su queste piattaforme${NB}: ci passi attraverso.`,
      `Stick abajo${NB}: te agachas. Abajo y SALTO en estas plataformas${NB}: caes a través.`,
    ),
    keys: L(
      `↓ pour t’accroupir. ↓ et Espace sur ces plateformes${NB}: tu passes au travers.`,
      `↓ to crouch. ↓ and Space on these platforms${NB}: you drop through.`,
      `↓ zum Ducken. ↓ und Leertaste auf diesen Plattformen${NB}: du fällst durch.`,
      `↓ per accucciarti. ↓ e Spazio su queste piattaforme${NB}: ci passi attraverso.`,
      `↓ para agacharte. ↓ y Espacio en estas plataformas${NB}: caes a través.`,
    ),
  },
  'tuto-checkpoint': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    text: L(
      `Point de contrôle. Si tu tombes, tu repars d’ici. Je préfère ne pas vérifier.`,
      `Checkpoint. If you fall, you restart here. I would rather not test it.`,
      `Kontrollpunkt. Fällst du, startest du hier neu. Ich prüfe das lieber nicht.`,
      `Punto di controllo. Se cadi, riparti da qui. Preferisco non verificarlo.`,
      `Punto de control. Si caes, reinicias aquí. Prefiero no comprobarlo.`,
    ),
  },
  'tuto-overheat': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Surchauffe${NB}! Ton arme se bloque le temps de refroidir${NB}: tire plutôt par petites rafales.`,
      `Overheat${NB}! Your weapon locks while it cools${NB}: fire in short bursts.`,
      `Überhitzt${NB}! Die Waffe blockiert beim Abkühlen${NB}: lieber kurze Feuerstöße.`,
      `Surriscaldamento${NB}! L’arma si blocca mentre si raffredda${NB}: spara a brevi raffiche.`,
      `Sobrecalentamiento${NB}! El arma se bloquea al enfriarse${NB}: dispara en ráfagas cortas.`,
    ),
  },
  'tuto-blocks': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Ces blocs lumineux se frappent de la tête, par en dessous. Cristaux dedans, parfois mieux.`,
      `Hit these glowing blocks from below, with your head. Crystals inside, sometimes better.`,
      `Diese Leuchtblöcke stößt du von unten mit dem Kopf an. Kristalle drin, manchmal Besseres.`,
      `Questi blocchi luminosi si colpiscono di testa, da sotto. Cristalli dentro, a volte meglio.`,
      `Estos bloques luminosos se golpean con la cabeza, desde abajo. Cristales dentro, a veces mejor.`,
    ),
  },
  'tuto-armored': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Un blindé. Lui sauter dessus ne sert à rien${NB}: deux tirs, et il comprendra.`,
      `An armored one. Jumping on it does nothing${NB}: two shots, and it will get the idea.`,
      `Ein Gepanzerter. Draufspringen bringt nichts${NB}: zwei Schüsse, dann kapiert er es.`,
      `Un corazzato. Saltargli sopra non serve${NB}: due colpi, e capirà.`,
      `Un blindado. Saltarle encima no sirve${NB}: dos disparos, y lo entenderá.`,
    ),
  },
  'tuto-door': {
    speaker: 'luma',
    mood: 'amused',
    tutorial: true,
    text: L(
      `Une porte astréenne, sur ce rocher${NB}! Devant elle, stick vers le haut pour entrer.`,
      `An Astrean door, on that rock${NB}! In front of it, stick up to enter.`,
      `Eine astreische Tür, auf dem Felsen${NB}! Davor Stick nach oben, um reinzugehen.`,
      `Una porta astreana, su quella roccia${NB}! Davanti, stick in alto per entrare.`,
      `Una puerta astreana, en esa roca${NB}! Delante, stick arriba para entrar.`,
    ),
    keys: L(
      `Une porte astréenne, sur ce rocher${NB}! Devant elle, ↑ pour entrer.`,
      `An Astrean door, on that rock${NB}! In front of it, ↑ to enter.`,
      `Eine astreische Tür, auf dem Felsen${NB}! Davor ↑, um reinzugehen.`,
      `Una porta astreana, su quella roccia${NB}! Davanti, ↑ per entrare.`,
      `Una puerta astreana, en esa roca${NB}! Delante, ↑ para entrar.`,
    ),
  },
  // Dans la ruine (première porte franchie) : les Astréens, sans rien dire d'Éon.
  'j1-ruin': {
    speaker: 'luma',
    mood: 'amused',
    text: L(
      `Une ruine astréenne${NB}! Ce peuple a bâti les portails, puis il a disparu. Où${NB}? Mes archives sont muettes.`,
      `An Astrean ruin${NB}! That people built the gates, then vanished. Where${NB}? My archives are silent.`,
      `Eine astreische Ruine${NB}! Dieses Volk baute die Portale, dann verschwand es. Wohin${NB}? Meine Archive schweigen.`,
      `Una rovina astreana${NB}! Quel popolo costruì i portali, poi sparì. Dove${NB}? I miei archivi tacciono.`,
      `Una ruina astreana${NB}! Ese pueblo alzó los portales, luego desapareció. ¿Adónde${NB}? Mis archivos callan.`,
    ),
  },
  // Vortex de la salle aux cristaux (pas une fenêtre de colonnes : joué quand Kaï s'en approche).
  'rift-j1': {
    speaker: 'luma',
    mood: 'worried',
    text: L(
      `Une faille du Vide. Haut pour entrer. Tiens trois vagues${NB}: la bombe libère le vide.`,
      `A Void rift. Up to enter. Hold three waves${NB}: the bomb clears the void.`,
      `Ein Riss der Leere. Oben, um reinzugehen. Drei Wellen halten${NB}: die Bombe löst die Leere.`,
      `Una faglia del Vuoto. Su per entrare. Reggi tre ondate${NB}: la bomba libera il vuoto.`,
      `Una falla del Vacío. Arriba para entrar. Aguanta tres oleadas${NB}: la bomba libera el vacío.`,
    ),
    keys: L(
      `Une faille du Vide. ↑ pour entrer. Tiens trois vagues${NB}: la bombe libère le vide.`,
      `A Void rift. ↑ to enter. Hold three waves${NB}: the bomb clears the void.`,
      `Ein Riss der Leere. ↑ zum Reingehen. Drei Wellen halten${NB}: die Bombe löst die Leere.`,
      `Una faglia del Vuoto. ↑ per entrare. Reggi tre ondate${NB}: la bomba libera il vuoto.`,
      `Una falla del Vacío. ↑ para entrar. Aguanta tres oleadas${NB}: la bomba libera el vacío.`,
    ),
  },
  'tuto-later': {
    speaker: 'luma',
    mood: 'neutral',
    tutorial: true,
    text: L(
      `Ceux-là sont trop hauts, pour l’instant. Ramasse les autres${NB}: au hangar, ils paient tes améliorations.`,
      `Those are too high, for now. Grab the others${NB}: at the hangar, they pay for your upgrades.`,
      `Die sind vorerst zu hoch. Sammle die anderen${NB}: im Hangar zahlen sie deine Verbesserungen.`,
      `Quelli sono troppo in alto, per ora. Raccogli gli altri${NB}: all’hangar pagano le migliorie.`,
      `Esos están demasiado altos, por ahora. Recoge los otros${NB}: en el hangar pagan tus mejoras.`,
    ),
  },
  'j1-beacon': {
    speaker: 'luma',
    mood: 'amused',
    text: L(
      `Je capte enfin ta position${NB}! Ma balise est droit devant, au bout de cette clairière.`,
      `I finally have your position${NB}! My beacon is straight ahead, at the end of this clearing.`,
      `Endlich habe ich deine Position${NB}! Meine Bake ist geradeaus, am Ende der Lichtung.`,
      `Finalmente ho la tua posizione${NB}! Il mio faro è dritto davanti, in fondo a questa radura.`,
      `¡Por fin capto tu posición${NB}! Mi baliza está justo delante, al final de este claro.`,
    ),
  },
  'j1-boss': {
    speaker: 'luma',
    mood: 'worried',
    tutorial: true,
    text: L(
      `Un Blob-roi garde ma balise${NB}! Sa gelée arrête tes tirs${NB}: saute ses ondes et vise le noyau quand il s’aplatit.`,
      `A Blob King guards my beacon${NB}! Its jelly stops your shots${NB}: jump the waves and aim the core when it flattens.`,
      `Blob-König an der Bake${NB}! Gelee stoppt Schüsse${NB}: spring die Wellen, ziel den Kern.`,
      `Re Blob al faro${NB}! La gelatina ferma i colpi${NB}: salta le onde, mira il nucleo.`,
      `Rey Blob en la baliza${NB}! Su gelatina para tiros${NB}: salta las ondas, apunta al núcleo.`,
    ),
  },
  // ---- j2, dans l'ordre du niveau : champignons, la méduse-baleine qui agit (ombre, secousse, spores), Tess. Pas
  // de `tutorial` : j1 réussi les ferait taire, or on n'arrive ici qu'après. Courts autour des champignons : la
  // bulle doit être fermée au sommet des rebonds (check-levels).
  'j2-mushroom': {
    speaker: 'luma',
    mood: 'amused',
    text: L(
      `Champignon${NB}! Tiens SAUT à l’impact${NB}: plus haut.`,
      `Mushroom${NB}! Hold JUMP on impact${NB}: higher.`,
      `Pilz${NB}! SPRUNG beim Aufprall halten${NB}: höher.`,
      `Fungo${NB}! Tieni SALTO all’impatto${NB}: più in alto.`,
      `Hongo${NB}! Mantén SALTO al impactar${NB}: más alto.`,
    ),
    keys: L(
      `Champignon${NB}! Tiens Espace à l’impact${NB}: plus haut.`,
      `Mushroom${NB}! Hold Space on impact${NB}: higher.`,
      `Pilz${NB}! Leertaste beim Aufprall halten${NB}: höher.`,
      `Fungo${NB}! Tieni Spazio all’impatto${NB}: più in alto.`,
      `Hongo${NB}! Mantén Espacio al impactar${NB}: más alto.`,
    ),
  },
  'j2-shadow': {
    speaker: 'luma',
    mood: 'worried',
    text: L(
      `Cette ombre… C’est la méduse-baleine. Le Vide la rend nerveuse.`,
      `That shadow… It’s the whale jellyfish. The Void makes it nervous.`,
      `Dieser Schatten… Das ist der Quallenwal. Die Leere macht ihn nervös.`,
      `Quell’ombra… È la medusa-balena. Il Vuoto la rende nervosa.`,
      `Esa sombra… Es la medusa ballena. El Vacío la pone nerviosa.`,
    ),
  },
  'j2-pits': {
    speaker: 'luma',
    mood: 'neutral',
    text: L(
      `Au-dessus du vide${NB}: rebondis d’un champignon à l’autre${NB}!`,
      `Over the pit${NB}: bounce from mushroom to mushroom${NB}!`,
      `Über der Leere${NB}: spring von Pilz zu Pilz${NB}!`,
      `Sopra il vuoto${NB}: rimbalza da un fungo all’altro${NB}!`,
      `Sobre el vacío${NB}: rebota de hongo en hongo${NB}!`,
    ),
  },
  'j2-closer': {
    speaker: 'luma',
    mood: 'amused',
    text: L(
      `Cette méduse grossit à vue d’œil. Ou alors on s’approche. Je préfère la première option.`,
      `That jellyfish is growing fast. Or we are getting closer. I prefer the first option.`,
      `Diese Qualle wächst zusehends. Oder wir kommen näher. Ich nehme die erste Option.`,
      `Quella medusa cresce a vista d’occhio. Oppure ci avviciniamo. Preferisco la prima.`,
      `Esa medusa crece a ojos vistas. O nos acercamos. Prefiero la primera.`,
    ),
  },
  'j2-signal': {
    speaker: 'luma',
    mood: 'worried',
    castaway: 'tess',
    text: L(
      `Un signal de détresse, tout près… Quelqu’un d’autre s’est écrasé ici${NB}!`,
      `A distress signal, very close… Someone else crashed here${NB}!`,
      `Ein Notsignal, ganz nah… Jemand anders ist hier abgestürzt${NB}!`,
      `Un segnale di soccorso, vicinissimo… Qualcun altro si è schiantato qui${NB}!`,
      `Una señal de socorro, muy cerca… ¡Alguien más se estrelló aquí${NB}!`,
    ),
  },
  'j2-quake': {
    speaker: 'luma',
    mood: 'worried',
    urgent: true,
    text: L(
      `La forêt tremble${NB}! Le tronc bouche le tunnel… Passe par la porte${NB}: stick vers le haut.`,
      `The forest is shaking${NB}! The trunk blocks the tunnel… Use the door${NB}: stick up.`,
      `Der Wald bebt${NB}! Der Stamm versperrt den Tunnel… Durch die Tür${NB}: Stick nach oben.`,
      `La foresta trema${NB}! Il tronco tappa il tunnel… Passa dalla porta${NB}: stick in alto.`,
      `El bosque tiembla${NB}! El tronco tapa el túnel… Pasa por la puerta${NB}: stick arriba.`,
    ),
    keys: L(
      `La forêt tremble${NB}! Le tronc bouche le tunnel… Passe par la porte${NB}: ↑ devant elle.`,
      `The forest is shaking${NB}! The trunk blocks the tunnel… Use the door${NB}: ↑ in front of it.`,
      `Der Wald bebt${NB}! Der Stamm versperrt den Tunnel… Durch die Tür${NB}: ↑ davor.`,
      `La foresta trema${NB}! Il tronco tappa il tunnel… Passa dalla porta${NB}: ↑ davanti.`,
      `El bosque tiembla${NB}! El tronco tapa el túnel… Pasa por la puerta${NB}: ↑ delante.`,
    ),
  },
  // Sauvetage (déclencheur 'rescue') : Tess, puis LUMA qui la téléporte à bord ; ils coupent la parole (engine/npc.ts
  // cale la dissolution sur ces deux répliques : finie juste après « … à bord ! »).
  'j2-tess': {
    speaker: 'tess',
    mood: 'amused',
    interrupt: true,
    text: L(
      `Enfin quelqu’un${NB}! Je suis Tess. Ma capsule est en miettes…`,
      `Someone at last${NB}! I’m Tess. My pod is in pieces…`,
      `Endlich jemand${NB}! Ich bin Tess. Meine Kapsel ist Schrott…`,
      `Finalmente qualcuno${NB}! Sono Tess. La mia capsula è in pezzi…`,
      `¡Por fin alguien${NB}! Soy Tess. Mi cápsula está hecha pedazos…`,
    ),
  },
  'j2-rescue': {
    speaker: 'luma',
    mood: 'amused',
    interrupt: true,
    text: L(
      `Ne bouge plus, Tess${NB}: je te téléporte à bord${NB}!`,
      `Hold still, Tess${NB}: I’m beaming you aboard${NB}!`,
      `Stillhalten, Tess${NB}: ich beam dich an Bord${NB}!`,
      `Non muoverti, Tess${NB}: ti teletrasporto a bordo${NB}!`,
      `No te muevas, Tess${NB}: te teletransporto a bordo${NB}!`,
    ),
  },
  'j2-spores': {
    speaker: 'luma',
    mood: 'worried',
    urgent: true,
    text: L(
      `Des spores tombent${NB}! Une tache au sol annonce chacune${NB}: écarte-toi, ou abats-les au TIR.`,
      `Spores are falling${NB}! A ground stain marks each one${NB}: move, or shoot them with FIRE.`,
      `Sporen fallen${NB}! Ein Fleck am Boden kündigt jede an${NB}: weg, oder FEUER.`,
      `Cadono spore${NB}! Una macchia a terra annuncia ognuna${NB}: spostati, o FUOCO.`,
      `Caen esporas${NB}! Una mancha anuncia cada una${NB}: apártate, o DISPARO.`,
    ),
    keys: L(
      `Des spores tombent${NB}! Une tache au sol annonce chacune${NB}: écarte-toi, ou abats-les avec J.`,
      `Spores are falling${NB}! A ground stain marks each one${NB}: move, or shoot them with J.`,
      `Sporen fallen${NB}! Ein Fleck am Boden kündigt jede an${NB}: weg, oder mit J.`,
      `Cadono spore${NB}! Una macchia a terra annuncia ognuna${NB}: spostati, o con J.`,
      `Caen esporas${NB}! Una mancha anuncia cada una${NB}: apártate, o con J.`,
    ),
  },
  // Avant l'arène (pas au déclencheur 'boss') : la bulle doit être fermée quand Kaï rebondit sur son champignon 205.
  'j2-titan': {
    speaker: 'luma',
    mood: 'worried',
    text: L(
      `Un Scarabée-titan garde ma balise${NB}! Renversé, frappe-le${NB}!`,
      `A Titan Beetle guards my beacon${NB}! Once it’s flipped, hit it${NB}!`,
      `Ein Titanenkäfer an der Bake${NB}! Auf dem Rücken${NB}: schlag zu${NB}!`,
      `Uno Scarabeo titano custodisce il mio faro${NB}! Ribaltato, colpiscilo${NB}!`,
      `Un Escarabajo titán guarda mi baliza${NB}! Volteado, golpéalo${NB}!`,
    ),
  },
  // ---- j3, dans l'ordre du niveau : près de la gardienne, le Vide brouille la radio de bout en bout (bulle grise qui
  // tressaute). Courts : la bulle doit être fermée avant chaque champignon, dont celui de l'entrée de l'arène.
  'j3-start': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: L(
      `…Kaï${NB}? Le Vide brouille tout, ici… Là-haut, la gardienne. Toute grise.`,
      `…Kaï${NB}? The Void scrambles everything here… Up there, the guardian. All grey.`,
      `…Kaï${NB}? Die Leere stört hier alles… Da oben, der Wächter. Ganz grau.`,
      `…Kaï${NB}? Il Vuoto disturba tutto, qui… Lassù, la custode. Tutta grigia.`,
      `…¿Kaï${NB}? El Vacío interfiere todo, aquí… Arriba, la guardiana. Toda gris.`,
    ),
  },
  'j3-pits': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: L(
      `Champignons… au-dessus du vide. Tiens SAUT${NB}!`,
      `Mushrooms… over the pit. Hold JUMP${NB}!`,
      `Pilze… über der Leere. SPRUNG halten${NB}!`,
      `Funghi… sopra il vuoto. Tieni SALTO${NB}!`,
      `Hongos… sobre el vacío. ¡Mantén SALTO${NB}!`,
    ),
    keys: L(
      `Champignons… au-dessus du vide. Tiens Espace${NB}!`,
      `Mushrooms… over the pit. Hold Space${NB}!`,
      `Pilze… über der Leere. Leertaste halten${NB}!`,
      `Funghi… sopra il vuoto. Tieni Spazio${NB}!`,
      `Hongos… sobre el vacío. ¡Mantén Espacio${NB}!`,
    ),
  },
  'j3-spores': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    urgent: true,
    text: L(
      `…des spores${NB}! Les taches au sol… écarte-toi${NB}!`,
      `…spores${NB}! The stains on the ground… move${NB}!`,
      `…Sporen${NB}! Die Flecken am Boden… weg${NB}!`,
      `…spore${NB}! Le macchie a terra… spostati${NB}!`,
      `…esporas${NB}! Las manchas en el suelo… ¡apártate${NB}!`,
    ),
  },
  'j3-signal': {
    speaker: 'luma',
    mood: 'amused',
    scrambled: true,
    text: L(
      `Signal… trop faible. Si tu m’entends${NB}: ne meurs pas. C’est un ordre.`,
      `Signal… too weak. If you can hear me${NB}: don’t die. That’s an order.`,
      `Signal… zu schwach. Wenn du mich hörst${NB}: stirb nicht. Das ist ein Befehl.`,
      `Segnale… troppo debole. Se mi senti${NB}: non morire. È un ordine.`,
      `Señal… demasiado débil. Si me oyes${NB}: no mueras. Es una orden.`,
    ),
  },
  'j3-heart': {
    speaker: 'luma',
    mood: 'worried',
    scrambled: true,
    text: L(
      `Brouillage… Vise son cœur quand il s’ouvre${NB}!`,
      `Scramble… Aim its heart when it opens${NB}!`,
      `Störung… Ziel auf sein Herz, wenn es sich öffnet${NB}!`,
      `Disturbo… Mira il cuore quando si apre${NB}!`,
      `Interferencia… ¡Apunta a su corazón cuando se abra${NB}!`,
    ),
  },
} as const satisfies Record<string, RadioMessage>;

/** Marque de story.seen posée à la réussite de TUTORIAL_STAGE : les messages `tutorial` se taisent ensuite. */
export const TUTORIAL_MARK = 'tutorial-j1';
export const TUTORIAL_STAGE = 'j1';

// ---------------------------------------------------------------- Rythme de la bulle et de la radio
// Partagé par story/bubble.ts, ui/radio.ts et scripts/check-levels.ts (file de la radio simulée).

/** Lettres écrites par seconde dans la bulle. */
export const BUBBLE_CPS = 32;
/** Pauses après la ponctuation (s) : . ! ? … puis , ; : */
const STOP_PAUSE_S = 0.22;
const COMMA_PAUSE_S = 0.09;

/** Délai après le caractère de code `c` avant le suivant (s). */
export function letterGap(c: number, cps = BUBBLE_CPS): number {
  const base = 1 / cps;
  // . ! ? …
  if (c === 46 || c === 33 || c === 63 || c === 8230) return base + STOP_PAUSE_S;
  // , ; :
  if (c === 44 || c === 59 || c === 58) return base + COMMA_PAUSE_S;
  return base;
}

/** Durée d'écriture d'une réplique (s), pour caler une chronologie. */
export function typingDuration(text: string, cps = BUBBLE_CPS): number {
  let d = 0;
  for (let i = 0; i < text.length - 1; i++) d += letterGap(text.charCodeAt(i), cps);
  return d;
}

/**
 * Radio en jeu (s) : ouverture (radioOpen) avant la première lettre ; lecture après la dernière lettre, selon la
 * longueur et bornée, réduite à holdBusyS si un message attend ; bulle cachée avant le suivant ; messages en
 * attente au plus (un nouveau chasse le plus ancien).
 */
export const RADIO_TIMING = {
  openS: 0.3,
  holdPerCharS: 0.045,
  holdMinS: 2.2,
  holdMaxS: 5,
  holdBusyS: 1.2,
  gapS: 0.35,
  maxWaiting: 2,
} as const;

/** Lecture d'un message après sa dernière lettre, sans message en attente (s). */
export function radioHoldS(text: string): number {
  const t = RADIO_TIMING;
  return Math.min(t.holdMaxS, Math.max(t.holdMinS, text.length * t.holdPerCharS));
}

// ---------------------------------------------------------------- Cinématiques : titres et marques « vues »

export interface CutsceneInfo {
  /** Titre (Options › Revoir les cinématiques). */
  readonly title: L10n;
  /** Paramétrée par le monde (libération d'un gardien) : une marque « vue » par monde. */
  readonly perWorld: boolean;
}

export const CUTSCENES: Readonly<Record<CutsceneId, CutsceneInfo>> = {
  prologue: { title: L('Prologue', 'Prologue', 'Prolog', 'Prologo', 'Prólogo'), perWorld: false },
  liberation: {
    title: L('Libération du gardien', 'Guardian freed', 'Wächter befreit', 'Liberazione del custode', 'Liberación del guardián'),
    perWorld: true,
  },
  // Vision avant de retenter une faille (à la place d'une vidéo publicitaire : aucun SDK). Pas dans WORLDS.
  rift: { title: L('Écho du Vide', 'Echo of the Void', 'Echo der Leere', 'Eco del Vuoto', 'Eco del Vacío'), perWorld: false },
};

/** Répliques de l'écho du Vide (cinématique `rift`, ~8 s). */
export const RIFT_ECHO_LINES = {
  hold: luma(
    'worried',
    L(
      `Le Vide reprend la faille. La bombe n’a pas fini${NB}: tiens encore trois vagues.`,
      `The Void is taking the rift back. The bomb did not finish${NB}: hold three more waves.`,
      `Die Leere holt sich den Riss zurück. Die Bombe ist nicht fertig${NB}: halte noch drei Wellen.`,
      `Il Vuoto riprende la faglia. La bomba non ha finito${NB}: reggi altre tre ondate.`,
      `El Vacío recupera la falla. La bomba no terminó${NB}: aguanta tres oleadas más.`,
    ),
  ),
  back: luma(
    'neutral',
    L(
      'Je te renvoie au même endroit. Les cœurs repartent au plein.',
      'I’m sending you back to the same spot. Hearts start full again.',
      'Ich schicke dich an denselben Ort zurück. Die Herzen sind wieder voll.',
      'Ti rimando nello stesso punto. I cuori ripartono al pieno.',
      'Te devuelvo al mismo sitio. Los corazones vuelven al máximo.',
    ),
  ),
};

/** Marque de story.seen d'une cinématique jouée pour une étape du monde `world` : 'prologue', 'liberation-1'… */
export function cutsceneMark(id: CutsceneId, world: number): string {
  return CUTSCENES[id].perWorld ? `${id}-${world}` : id;
}

// ---------------------------------------------------------------- Répliques des cinématiques (story/scenes)

function luma(mood: Mood, text: L10n): StoryLine {
  return { speaker: 'luma', mood, text };
}

export const PROLOGUE_LINES = {
  signal: luma(
    'neutral',
    L(
      'Kaï, je capte un signal au bord de la galaxie. Inconnu. Très ancien.',
      'Kaï, I pick up a signal at the edge of the galaxy. Unknown. Very old.',
      'Kaï, ich empfange ein Signal am Rand der Galaxie. Unbekannt. Sehr alt.',
      'Kaï, ricevo un segnale ai bordi della galassia. Sconosciuto. Antichissimo.',
      'Kaï, capto una señal al borde de la galaxia. Desconocida. Muy antigua.',
    ),
  ),
  kai: {
    speaker: 'kai',
    mood: 'neutral',
    text: L('On va voir.', 'Let’s go see.', 'Schauen wir nach.', 'Andiamo a vedere.', 'Vamos a ver.'),
  },
  decision: luma(
    'amused',
    L(
      `Évidemment. Je note${NB}: décision prise sans consulter l’ordinateur de bord.`,
      `Of course. Noted${NB}: decision made without asking the ship computer.`,
      `Natürlich. Notiert${NB}: Entscheidung ohne den Bordrechner.`,
      `Ovvio. Annoto${NB}: decisione presa senza consultare il computer di bordo.`,
      `Claro. Anoto${NB}: decisión tomada sin consultar el ordenador de a bordo.`,
    ),
  ),
  rift: luma(
    'worried',
    L(
      `Ce n’est pas un signal, ça… C’est une faille${NB}! Elle nous aspire${NB}!`,
      `That’s not a signal… It’s a rift${NB}! It’s pulling us in${NB}!`,
      `Das ist kein Signal… Das ist ein Riss${NB}! Er saugt uns ein${NB}!`,
      `Questo non è un segnale… È una faglia${NB}! Ci aspira${NB}!`,
      `Eso no es una señal… ¡Es una falla${NB}! ¡Nos aspira${NB}!`,
    ),
  ),
  worlds: luma(
    'worried',
    L(
      'Ces mondes s’éteignent un à un… Une ombre grise les ronge. Appelons-la le Vide.',
      'These worlds are going dark one by one… A grey shadow is eating them. Let’s call it the Void.',
      'Diese Welten erlöschen eine nach der anderen… Ein grauer Schatten zerfrisst sie. Nennen wir ihn die Leere.',
      'Questi mondi si spengono uno a uno… Un’ombra grigia li rode. Chiamiamola il Vuoto.',
      'Estos mundos se apagan uno a uno… Una sombra gris los roe. Llamémosla el Vacío.',
    ),
  ),
  alive: luma(
    'amused',
    L(
      `Bonne nouvelle${NB}: on est vivants. Mauvaise nouvelle${NB}: il me faut de l’énergie pour ouvrir un portail.`,
      `Good news${NB}: we’re alive. Bad news${NB}: I need energy to open a gate.`,
      `Gute Nachricht${NB}: wir leben. Schlechte Nachricht${NB}: ich brauche Energie, um ein Portal zu öffnen.`,
      `Buona notizia${NB}: siamo vivi. Cattiva notizia${NB}: mi serve energia per aprire un portale.`,
      `Buena noticia${NB}: estamos vivos. Mala noticia${NB}: necesito energía para abrir un portal.`,
    ),
  ),
  guardian: luma(
    'neutral',
    L(
      `Tu vois la méduse-baleine${NB}? C’est la gardienne de ce monde. Le Vide l’a rendue folle.`,
      `See the whale jellyfish${NB}? She’s this world’s guardian. The Void drove her mad.`,
      `Siehst du den Quallenwal${NB}? Das ist der Wächter dieser Welt. Die Leere hat ihn wahnsinnig gemacht.`,
      `Vedi la medusa-balena${NB}? È la custode di questo mondo. Il Vuoto l’ha fatta impazzire.`,
      `¿Ves la medusa ballena${NB}? Es la guardiana de este mundo. El Vacío la volvió loca.`,
    ),
  ),
  goal: luma(
    'neutral',
    L(
      `Libère-la et rapporte son noyau${NB}: il ouvrira le portail.`,
      `Free her and bring back her core${NB}: it will open the gate.`,
      `Befreie ihn und bring seinen Kern zurück${NB}: er öffnet das Portal.`,
      `Liberala e riporta il suo nucleo${NB}: aprirà il portale.`,
      `Libérala y trae su núcleo${NB}: abrirá el portal.`,
    ),
  ),
  // Le jeu suit : la Comète repart en orbite au début de j1, LUMA guide Kaï jusqu'à sa balise (carte d'intro de j1).
  // Amorce distincte de la radio 'j1-start' (« Le Vide me brouille… »), lue quelques secondes plus tard.
  onFoot: luma(
    'scrambled',
    L(
      `Trop de brouillage ici… Impossible de me poser plus près${NB}: rejoins ma balise à pied${NB}!`,
      `Too much scramble here… I can’t land any closer${NB}: reach my beacon on foot${NB}!`,
      `Zu viel Störung hier… Ich kann nicht näher landen${NB}: erreiche meine Bake zu Fuß${NB}!`,
      `Troppo disturbo qui… Impossibile posarmi più vicino${NB}: raggiungi il mio faro a piedi${NB}!`,
      `Demasiada interferencia aquí… No puedo posarme más cerca${NB}: llega a mi baliza a pie${NB}!`,
    ),
  ),
} as const satisfies Record<string, StoryLine>;

export const LIBERATION_LINES = {
  skill: luma(
    'amused',
    L(
      `Nouvelle compétence installée. Essaie de ne pas t’en servir pour sauter dans un trou.`,
      `New skill installed. Try not to use it to jump into a pit.`,
      `Neue Fähigkeit installiert. Spring damit bitte nicht in ein Loch.`,
      `Nuova competenza installata. Cerca di non usarla per saltare in un buco.`,
      `Nueva habilidad instalada. Procura no usarla para saltar a un hueco.`,
    ),
  ),
} as const satisfies Record<string, StoryLine>;

/** Bandeaux de la libération (dessinés sur le canvas ; le nom et la compétence viennent de LiberationParams). */
export const LIBERATION_BANNERS = {
  guardian: L('GARDIEN LIBÉRÉ', 'GUARDIAN FREED', 'WÄCHTER BEFREIT', 'CUSTODE LIBERATO', 'GUARDIÁN LIBERADO'),
  skill: L('NOUVELLE COMPÉTENCE', 'NEW SKILL', 'NEUE FÄHIGKEIT', 'NUOVA COMPETENZA', 'NUEVA HABILIDAD'),
} as const;
