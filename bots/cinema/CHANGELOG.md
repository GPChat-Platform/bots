# Changelog — Ciné Club

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/) · politique : [docs/VERSIONING.md](../../docs/VERSIONING.md)

## [Non publié]

### Corrigé
- En groupe, une commande adressée à un autre bot (« /aide@autre_bot ») n'obtient plus de réponse de ce bot (`BOT_USERNAME` pour changer son nom).

## [1.2.0] — 2026-11-19

### Modifié
- Jusqu'à 16 conversations traitées en parallèle (variable `CONCURRENCY`) : un utilisateur lent ne bloque plus les autres.

## [1.1.0] — 2026-11-19

### Modifié
- Aide repensée : sections courtes (Chercher, Découvrir, Regarder, Ma liste, Réglages) et boutons d'accès rapide (Tendances, Au hasard, Quiz, Ma liste) sous /start et /aide.
- Descriptions des commandes du menu « / » raccourcies.

### Corrigé
- Réponses plus rapides : l'indicateur « écrit… » n'est plus attendu avant de répondre (environ 3,5 s gagnées par message).

## [1.0.0] — 2026-11-19

### Ajouté
- Fiches de films (affiche, notes IMDb / Rotten Tomatoes / Metacritic via OMDb), acteurs, tendances, sorties, streaming par pays, similaires, comparaison, hasard par genre, quiz, liste « à voir », FR/EN.
- Journaux JSON, `/healthz` `/readyz` `/metrics`, `HEALTHCHECK` Docker.
