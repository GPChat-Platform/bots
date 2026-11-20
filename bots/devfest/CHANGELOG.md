# Changelog — DevFest Guide

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/) · politique : [docs/VERSIONING.md](../../docs/VERSIONING.md)

## [Non publié]

### Corrigé
- En groupe, une commande adressée à un autre bot (« /aide@autre_bot ») n'obtient plus de réponse de ce bot (`BOT_USERNAME` pour changer son nom).

## [1.1.0] — 2026-11-19

### Corrigé
- `/annonce` tient 500+ destinataires : envoi en arrière-plan (Docker) ou en file par lots de 50 (Firebase), confirmation finale à l'organisateur avec le nombre d'envois et d'échecs ; annonce vide refusée.

### Modifié
- Traitement des conversations en parallèle (SDK 1.1).

## [1.0.0] — 2026-11-19

### Ajouté
- Programme officiel du DevFest Douala 2026 (source : devfest.gdgdouala.org), `/programme` `/maintenant` `/prochain` `/lieu` `/conferenciers` `/tracks`, rappels 10 minutes avant, vote du Challenge, FAQ, annonces des organisateurs, FR/EN.
- Journaux JSON, `/healthz` `/readyz` `/metrics`, `HEALTHCHECK` Docker.
