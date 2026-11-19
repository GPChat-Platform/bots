# Guide DevFest sur Firebase Functions

Le **même bot** que `bots/devfest` (Docker/VPS), exécuté dans le projet Firebase de GPChat : mode **webhook** signé, rappels par une fonction planifiée, état dans Firestore. Un seul code métier (`../src`), deux hébergements.

| Fonction | Déclencheur | Rôle |
|---|---|---|
| `devfestBotWebhook` | HTTPS | reçoit les événements GPChat, vérifie la signature HMAC, répond au bot (dédoublonnage par `msgId`) |
| `devfestBotReminders` | planifiée, chaque minute | rappels « 10 minutes avant » une session |

Firestore : `devfestBotUsers/{userId}` (langue, rappels), `devfestBotSeen/{eventId}` (dédoublonnage ; activez un **TTL** sur `expireAt` dans la console Firestore pour purger après 7 jours).

## Déployer

```bash
cd bots/devfest/firebase
node build.js                                   # copie le code métier dans functions/lib
cd functions && npm install && cd ..

# Secrets (Secret Manager) — valeurs : clé API et secret de webhook du bot
printf %s "gpk_live_…" | gcloud secrets create DEVFEST_BOT_API_KEY --data-file=- --project gchat-bc814
printf %s "…"          | gcloud secrets create DEVFEST_BOT_WEBHOOK_SECRET --data-file=- --project gchat-bc814

# Organisateurs autorisés à /annonce : functions/.env.gchat-bc814  →  DEVFEST_ADMIN_IDS=userId1,userId2
firebase deploy --only functions:devfest-bot --project gchat-bc814
```

Le code `codebase: "devfest-bot"` isole ces fonctions des autres fonctions du projet (un déploiement ici ne touche jamais les autres).

Puis, dans GPChat (console développeur ou @gpchat_forge) : mode **webhook**, URL `https://us-central1-<projet>.cloudfunctions.net/devfestBotWebhook`, « Envoyer un ping » (requis pour publier).

## Exploitation

- Journaux : Cloud Logging (`logger` de firebase-functions, JSON structuré) → filtre `resource.labels.function_name="devfestBotWebhook"`.
- Alertes GPChat : un bot en **webhook** est surveillé par GPChat (alerte au créateur après 24 h sans livraison réussie, e-mail/webhook d'alerte configurés dans la console). Ajoutez une alerte Cloud Monitoring sur le taux d'erreurs 5xx de `devfestBotWebhook`.
- Coût : quelques centimes pour 500 participants ; `maxInstances: 20`, aucune instance minimale (premier message ≈ 1 s plus lent à froid).
- Tests : `npm test` dans `bots/devfest` (le runtime est testé avec une base factice).
