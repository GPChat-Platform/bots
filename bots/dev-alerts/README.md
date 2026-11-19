# Dev Alerts (`@devalerts_bot`)

Reçoit les webhooks de vos outils et les poste dans un groupe GPChat, avec boutons de lien.

- **GitHub** : push, pull requests (ouverte / fusionnée / fermée), issues, résultat des workflows, versions publiées. Signature `X-Hub-Signature-256` vérifiée avec le secret du hook.
- **Uptime Kuma** : hors ligne / de retour en ligne.
- **Générique** : `POST` JSON `{ "title": "…", "message": "…", "level": "error|warning|ok|info", "url": "https://…" }`.

## Utilisation
1. Ajoutez le bot à un groupe, envoyez `/connecter` : il crée une adresse `PUBLIC_URL/hook/<jeton>` et un secret.
2. Collez-les dans GitHub (*Settings → Webhooks*, `application/json`) ou dans votre outil.
3. `/etat`, `/revoquer`, `/test`, `/aide`.

Sécurité : l'adresse est un secret (quiconque la possède peut écrire dans le groupe) ; 30 alertes/minute par jeton ; corps limité à 256 Ko ; seuls les liens `https` deviennent des boutons.

## Lancer
```bash
cd bots/dev-alerts && npm install
GPCHAT_API_KEY=gpk_live_… PUBLIC_URL=https://alertes.example.com npm start
npm test
```

## Exploitation

| Variable | Défaut | Rôle |
|---|---|---|
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` — journaux JSON en production |
| `OPS_PORT` / `OPS_HOST` | `9100` / `127.0.0.1` | serveur d'exploitation : `/healthz` (vivant), `/readyz` (opérationnel, 503 sinon), `/metrics` (Prometheus) |
| `DATA_DIR` | `./data` | état persistant (écriture atomique) — à sauvegarder |

- **Journaux, métriques, alertes recommandées, dépannage** : [docs/OPERATIONS.md](../../docs/OPERATIONS.md).
- **Version et changelog** : [CHANGELOG.md](CHANGELOG.md) · politique : [docs/VERSIONING.md](../../docs/VERSIONING.md). La version déployée est dans le journal de démarrage et la métrique `gpchat_bot_info`.
- **Alertes côté GPChat** : renseignez un e-mail et/ou un webhook Slack/Discord d'alerte dans la console (*Paramètres*) : GPChat prévient le créateur d'un bot en polling qui ne vient plus chercher ses messages (10 min), d'un webhook en panne (24 h), d'événements abandonnés et de signalements.
