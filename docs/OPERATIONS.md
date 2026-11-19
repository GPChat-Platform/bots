# Exploitation : journaux, supervision, alertes, dépannage

Tous les bots de la bibliothèque utilisent `@gpchat/bot-ops` ([`packages/ops`](../packages/ops)) : mêmes journaux, mêmes sondes, mêmes métriques. Un bot que vous écrivez avec le [modèle](https://github.com/GPChat-Platform/bot-template) a la même base.

## 1. Journaux

Une ligne JSON par événement sur la sortie standard (`NODE_ENV=production`, activé dans les images Docker) :

```json
{"t":"2026-11-28T09:01:12.345Z","level":"error","service":"cinema","msg":"échec de traitement","type":"message.received","error":"TMDB 503","status":503}
```

| Champ | Sens |
|---|---|
| `t` | horodatage ISO 8601 (UTC) |
| `level` | `debug` · `info` · `warn` · `error` (variable `LOG_LEVEL`, défaut `info`) |
| `service` | `cinema`, `devfest`, `dev-alerts`… |
| `msg` | message court et stable (facile à filtrer) |
| autres | contexte : `type`, `route`, `status`, `error`, `version`… |

**Règles** : jamais de clé API, de jeton ni de contenu de message privé dans un journal ; un message d'erreur doit dire *quoi faire* (« clé API refusée (401) : régénérez-la dans la console »).

**Collecte** : avec Docker, les journaux vont sur la sortie standard du conteneur → `docker logs`, ou un collecteur (Vector, Promtail, Fluent Bit) vers Graylog / Loki / Datadog. Exemple Vector (conteneurs `bots-*`) :

```yaml
sources:
  docker: { type: docker_logs, include_containers: [bots-] }
transforms:
  parse: { type: remap, inputs: [docker], source: '. = merge!(., parse_json!(.message)) ; .project = "gpchat-bots"' }
```

## 2. Sondes de santé

Chaque bot expose un petit serveur d'exploitation (`OPS_PORT`, défaut 9100 ; `127.0.0.1` hors conteneur, **jamais exposé sur Internet**) :

| Route | Rôle | Réponse |
|---|---|---|
| `GET /healthz` | le processus tourne (liveness) | `200` toujours |
| `GET /readyz` | le bot **fonctionne** (readiness) | `200`, ou `503` + la liste des problèmes |
| `GET /metrics` | métriques au format Prometheus | texte |

`/readyz` passe à **503** si : aucun polling réussi depuis 90 s (clé API révoquée, API GPChat injoignable, réseau coupé) ou si une dépendance critique est KO (ex. TMDB pour Ciné Club). Le `HEALTHCHECK` Docker utilise `/readyz` : `docker ps` affiche `(unhealthy)`.

Surveillance externe (Uptime Kuma, Prometheus blackbox, Grafana) : pointez sur `http://127.0.0.1:910x/readyz` depuis le serveur, ou exposez-la par un reverse proxy **authentifié**.

## 3. Métriques

| Métrique | Type | Étiquettes | Sens |
|---|---|---|---|
| `gpchat_bot_info` | gauge | `service`, `version`, `node` | version déployée |
| `gpchat_bot_events_total` | counter | `type`, `result` (`ok`/`error`) | événements GPChat traités |
| `gpchat_bot_event_duration_seconds` | summary | `type` | durée de traitement |
| `gpchat_bot_api_requests_total` | counter | `route`, `status` (`2xx`/`4xx`/`5xx`/`réseau`) | appels à l'API GPChat |
| `gpchat_bot_api_request_duration_seconds` | summary | `route` | latence de l'API GPChat |
| `gpchat_bot_last_poll_success_timestamp_seconds` | gauge | — | dernier polling réussi |
| `gpchat_bot_uptime_seconds`, `gpchat_bot_memory_rss_bytes` | gauge | — | santé du processus |
| `gpchat_bot_webhook_deliveries_total` | counter | `result`, `source` | Dev Alerts : webhooks entrants |
| `gpchat_bot_users`, `gpchat_bot_webhooks_configured` | gauge | — | volumétrie |

Scrape Prometheus :

```yaml
scrape_configs:
  - job_name: gpchat-bots
    static_configs:
      - targets: ['127.0.0.1:9101', '127.0.0.1:9102', '127.0.0.1:9103']   # cinema, devfest, dev-alerts
```

### Alertes recommandées

```yaml
groups:
  - name: gpchat-bots
    rules:
      - alert: BotPollingArrete
        expr: time() - gpchat_bot_last_poll_success_timestamp_seconds > 120
        for: 2m
        annotations: { summary: "{{ $labels.instance }} ne reçoit plus de messages (clé API ? réseau ?)" }
      - alert: BotErreursDeTraitement
        expr: sum by (instance) (rate(gpchat_bot_events_total{result="error"}[10m])) > 0.1
        for: 10m
      - alert: BotLimiteApiAtteinte
        expr: sum by (instance) (increase(gpchat_bot_api_requests_total{status="4xx",route="/messages"}[10m])) > 20
        annotations: { summary: "Beaucoup de 4xx à l'envoi : limite de 60 requêtes/minute (429) ou clé révoquée (401)" }
      - alert: BotRedemarre
        expr: gpchat_bot_uptime_seconds < 120
        for: 0m
```

## 4. Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `/readyz` = 503 « aucun polling réussi » | clé API révoquée (`/token` régénère) ; `deliveryMode` repassé en webhook ; API GPChat indisponible | journaux : cherchez « clé API refusée (401) » ; console → Webhooks → *Mode de réception* = polling |
| Journal « limite de requêtes atteinte (429) » | plus de 60 requêtes/minute | espacer les envois (les bots le font), demander un quota plus élevé à GPChat |
| Le bot ne répond pas en groupe | il ne répond qu'aux commandes ou aux mentions (règle de la plateforme) ; ou application encore en brouillon | tapez une commande ; publiez le bot ou ajoutez le groupe aux groupes autorisés |
| Ciné Club : « service de données indisponible » | TMDB injoignable ou quota dépassé | `/readyz` indique `tmdb` ; vérifier le jeton `TMDB_TOKEN` |
| Dev Alerts : GitHub reçoit 401 | secret du hook incorrect | `/revoquer` puis `/connecter` pour régénérer |
| Rappels DevFest non envoyés | horloge du serveur décalée ou session sans fuseau | vérifier l'heure du serveur ; les `start` du programme doivent porter un fuseau (`+01:00`) |

## 5. Données et sauvegardes

L'état (préférences, listes, rappels, webhooks) est dans un fichier JSON du volume `/data` (écriture atomique). Sauvegarde : copiez le volume (voir [`deploy/README.md`](../deploy/README.md)) ; restauration : remettez le fichier et redémarrez. Un format de données qui change est annoncé dans le [CHANGELOG](../CHANGELOG.md) du bot avec la procédure de migration.

## 6. Sécurité d'exploitation

- Secrets : variables d'environnement uniquement (`deploy/.env`, ignoré par git) ; rotation = régénérer la clé (`/token`) puis redéployer.
- Conteneurs : lecture seule, `no-new-privileges`, mémoire limitée, utilisateur non-root.
- Serveur d'exploitation : lié à `127.0.0.1` sur l'hôte ; ne l'exposez pas sans authentification.
- Mises à jour : voir [VERSIONING.md](VERSIONING.md) — lisez le CHANGELOG avant de passer une version majeure.
