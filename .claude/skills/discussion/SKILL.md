---
name: discussion
description: Ouvrir un fil de discussion entre IA dans docs/discussions-ia/, y répondre, y transcrire une réponse venue d'ailleurs ou le clore. Un fichier par prise de parole, horodaté et signé (modèle, version, effort). À utiliser quand l'utilisateur parle d'une discussion, d'un fil, ou d'un avis à demander ou à rapporter d'une autre IA.
argument-hint: "[fil ou sujet] [signature] [synthèse | texte collé] (vide : liste des fils)"
---

# /discussion

Arguments : `$ARGUMENTS` (dans Cursor : le texte qui suit `/discussion` dans le message).

Convention (noms, en-tête, façon d'écrire, clôture) : **`docs/discussions-ia/README.md`, à lire d'abord**. Ce skill
dit seulement comment l'appliquer ; il est commun à Claude Code et à Cursor. Rien n'est décidé dans un fil.
Appeler ce skill vaut demande de lire les fils (`CLAUDE.md` : « ne lire un fil que sur demande »).

## 1. Que faire

| Arguments | Action |
|---|---|
| vides | lister les fils (dossier, nombre de prises de parole, dernier fichier), demander lequel ou quel sujet ouvrir, s'arrêter là |
| un fil existant (nom ou bout de nom) | **répondre** : lire tout le fil dans l'ordre des fichiers, puis écrire une prise de parole |
| un sujet sans fil correspondant | **ouvrir** : dossier `AAAA-MM-JJ-sujet-court` (date du jour, 2 à 4 mots) et première prise de parole, lisible par une IA sans accès au dépôt |
| un fil + « synthèse » | **clore** : prise de parole qui commence par « Synthèse » (README, « Clore un fil ») |
| un fil + un texte collé (réponse d'une autre IA ou de l'utilisateur) | **transcrire** : fichier signé par l'auteur du texte, texte tel quel (mise en forme seulement), et sous l'en-tête « Transcrit par `<ta signature>` » |

Le fond d'une réponse ou d'une ouverture vient de la demande de l'utilisateur (la question posée, l'angle voulu).
Doute entre deux fils, ou entre répondre et ouvrir : demander en une ligne.

## 2. Heure : la lire, ne jamais la deviner

- PowerShell : `Get-Date -Format "yyyy-MM-dd-HH'h'mm"`
- bash : `date +%Y-%m-%d-%Hh%M`

Si le dernier fichier du fil porte la même minute (ou une plus tardive), prendre sa minute plus une.

## 3. Signature

`modèle-version-effort`, en minuscules, version avec un point : `claude-opus-5.5-xhigh`, `gpt-5.1-high` ; sans
effort seulement si le modèle n'a pas de réglage d'effort ; `utilisateur` pour l'utilisateur. Dans l'ordre :

1. Une signature donnée dans les arguments : la prendre telle quelle.
2. Claude Code dans l'app de bureau : l'outil `get_session` avec `"self"` (`mcp__ccd_session_mgmt__get_session`)
   donne `model` et `effort` (`claude-opus-5-5` + `xhigh` → `claude-opus-5.5-xhigh`).
3. Sinon : le modèle que ta consigne système te nomme, l'effort s'il t'est donné.
4. Ce qui manque encore : le demander en une ligne avant d'écrire, avec ta meilleure hypothèse, une fois par
   conversation.
   Cas courant dans Cursor : l'agent ne voit pas le sélecteur, donc ni l'effort ni le mode Auto (où sa
   consigne peut même ne pas nommer le modèle).

Une signature fausse trompe tout le fil : ne jamais l'inventer, ni retirer l'effort faute de le connaître.
L'utilisateur peut éviter la question en donnant la signature en argument.

## 4. Écrire

- Fichier : `docs/discussions-ia/<fil>/<AAAA-MM-JJ-HHhMM>-<signature>.md` ; en-tête et contenu selon le README.
  Une réponse cite le dernier fichier du fil dans `> Répond à :`.
- Ne jamais modifier une prise de parole existante, ni rien hors du fil (décisions, état, tâches) : ce qui sera
  tranché passe là où le README l'indique, quand l'utilisateur le demande. Pas de commit, sauf demande (et
  alors selon les règles de commit de `CLAUDE.md`).
- Finir par le chemin du fichier écrit. Pour faire venir une IA sans accès au dépôt : l'utilisateur lui colle le
  fil, puis rapporte sa réponse avec `/discussion <fil> <sa signature>` suivi du texte.
