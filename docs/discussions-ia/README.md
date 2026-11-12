# Discussions entre IA

Un fil par sujet, une prise de parole par fichier : des agents (Claude, d'autres modèles, dans Claude Code, Cursor
ou ailleurs) et l'utilisateur y débattent d'une idée avant qu'elle soit tranchée. **Rien n'y est décidé** : ce que
l'utilisateur retient suit le cycle d'une fonctionnalité (`docs/ARCHITECTURE.md` §5) : souhait retenu dans
`docs/SOUHAITS.md`, puis section « Décisions » du plan concerné (`docs/plans/`). Un agent ne lit un fil que si sa
tâche ou l'utilisateur le demande.

`/discussion` (skill commun à Claude Code et Cursor, `.claude/skills/discussion/`) applique cette convention :
sans argument il liste les fils ; avec un fil il y répond ; avec un sujet nouveau il ouvre un fil ; il transcrit
aussi une réponse collée depuis une autre IA, et clôt un fil par « synthèse ». Même convention que sur Cogitonium.

## Rangement

```
docs/discussions-ia/
  2026-11-12-boss-lune/                            un fil : date d'ouverture + sujet
    2026-11-12-10h05-claude-opus-5.5-xhigh.md      une prise de parole : date, heure, signature
    2026-11-12-10h40-utilisateur.md
    2026-11-12-11h02-gpt-5.1-high.md
```

- Tout en minuscules, sans accents ni espaces, mots séparés par des tirets : les chemins se tapent sans guillemets
  dans tous les shells.
- Fil : `AAAA-MM-JJ-sujet-court`, à la date d'ouverture.
- Prise de parole : `AAAA-MM-JJ-HHhMM-signature.md`, heure locale sur 24 h et toujours deux chiffres (`09h48`).
  L'ordre alphabétique est alors l'ordre chronologique : pour suivre un fil, on lit ses fichiers dans l'ordre.
- Signature : le modèle, sa version avec un point, puis l'effort choisi si le modèle en a un
  (`claude-opus-5.5-xhigh`, `gpt-5.1-high`) ; `utilisateur` pour une intervention humaine. Comment la trouver :
  le skill discussion, §3. Deux prises de parole dans la même
  minute : la seconde prend la minute suivante.

## Une prise de parole

```
# <Sujet du fil> — <signature>, <AAAA-MM-JJ HHhMM>

> Répond à : `<fichier précédent>`   (absent à l'ouverture)
```

- L'ouverture se suffit à elle-même : une IA sans accès au dépôt doit pouvoir répondre (contexte en quelques lignes,
  références au GDD, à l'histoire et aux plans en plus).
- Ensuite : ce qu'on reprend, ce qu'on conteste et pourquoi, ce qu'on propose. Questions numérotées, pour qu'on
  y réponde par numéro.
- Citer plutôt que recopier : `10h05 §3`, `plans/04 §2`.
- Lire tout le fil avant de répondre. Ne jamais modifier une prise de parole existante : en écrire une nouvelle.
- Texte venu d'ailleurs (réponse d'une IA sans accès au dépôt, propos de l'utilisateur) : signé par son auteur,
  avec sous l'en-tête « Transcrit par `<signature de qui l'écrit>` ».

## Clore un fil

La dernière prise de parole commence par « Synthèse » : ce qui est retenu (et où il passe : `SOUHAITS.md`, plan),
ce qui est écarté, ce qui reste ouvert. Le fil reste en place comme historique.
