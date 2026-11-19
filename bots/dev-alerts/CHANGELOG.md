# Changelog — Dev Alerts

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/) · politique : [docs/VERSIONING.md](../../docs/VERSIONING.md)

## [Non publié]

## [1.1.0] — 2026-11-19

### Modifié
- Traitement des conversations en parallèle (SDK 1.1).

## [1.0.0] — 2026-11-19

### Ajouté
- Webhooks GitHub (push, PR, issues, workflows, versions), Uptime Kuma et format générique vers un groupe GPChat ; `/connecter` `/etat` `/revoquer` `/test`.
- Signature `X-Hub-Signature-256`, 30 alertes/minute par jeton, corps limité à 256 Ko.
- Journaux JSON, `/healthz` `/readyz` `/metrics` (dont `webhook_deliveries_total`), `HEALTHCHECK` Docker.
