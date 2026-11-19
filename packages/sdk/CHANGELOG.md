# Changelog — @gpchat/bot

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/)

## [Non publié]

## [1.1.0] — 2026-11-19

### Ajouté
- `poll()` traite les conversations **en parallèle** (`concurrency`, 8 par défaut) en gardant l'ordre dans chaque conversation ; acquittement rapide pendant le traitement ; un événement en échec n'est réessayé qu'après `retryAfterMs` (30 s).
