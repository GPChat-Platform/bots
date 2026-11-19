# Changelog — @gpchat/bot

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/)

## [Non publié]

## [1.1.1] — 2026-11-19

### Corrigé
- `sendChatAction()` ne réessaie plus (indicateur cosmétique) : sous forte charge, les nouveaux essais sur 429 consommaient le quota de l'application (test de charge 500 utilisateurs).
- `request()` accepte `retries` pour régler les nouveaux essais appel par appel.

## [1.1.0] — 2026-11-19

### Ajouté
- `poll()` traite les conversations **en parallèle** (`concurrency`, 8 par défaut) en gardant l'ordre dans chaque conversation ; acquittement rapide pendant le traitement ; un événement en échec n'est réessayé qu'après `retryAfterMs` (30 s).
