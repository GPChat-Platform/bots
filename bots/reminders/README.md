# Rappels (`@rappels_bot`)

Rappels en **langage naturel**, en français et en anglais. On écrit comme à un assistant :

| Message | Résultat |
|---|---|
| _demain à 9h appeler maman_ | demain 09:00 — « Appeler maman » |
| _dans 20 min sortir le gâteau_ | dans 20 minutes |
| _vendredi soir dîner avec Aïcha_ | vendredi 19:00 |
| _tous les lundis et jeudis à 19h footing_ | chaque lundi et jeudi 19:00 |
| _le 5 de chaque mois payer le loyer_ | le 5 de chaque mois 09:00 |
| _anniversaire de Paul le 12 mars chaque année_ | chaque 12 mars 09:00 |
| _every weekday at 6:30 am workout_ | du lundi au vendredi 06:30 |
| _toutes les 2 heures boire de l'eau_ | toutes les 2 h (15 min minimum) |

Sans heure précise : 9h (matin 8h, après-midi 15h, soir 19h). Une heure déjà passée aujourd'hui part le lendemain ; un jour de semaine déjà passé, la semaine suivante.

## Commandes
`/rappel` (ou texte libre en privé), `/liste`, `/supprimer n` (`/supprimer tout`), `/fuseau ville|zone`, `/langue fr|en`, `/exemples`, `/aide`, `/apropos`.
Chaque rappel arrive avec les boutons **Fait**, **+10 min**, **+1 h**, **Demain**.

**En groupe** : `/rappel demain 18h réunion` programme un rappel pour tout le groupe (ou mentionnez le bot). Le bot n'écoute jamais les conversations : seulement les commandes et les mentions.

## Fonctionnement
- **Analyse** (`src/parse.js`) : sans dépendance ni IA, déterministe et testée ; les dates sont calculées dans le **fuseau de chaque utilisateur** (`src/tz.js`, via `Intl`), changements d'heure compris (heure sautée → avancée, heure doublée → première occurrence).
- **Récurrences** (`src/schedule.js`) : fins de mois (le 31 → dernier jour), 29 février, tous les N jours.
- **Planificateur** (`src/scheduler.js`) : passe toutes les 5 s, 10 envois en parallèle au plus, nouvel essai exponentiel (30 s → 16 min, 6 essais), arrêt immédiat sur 403/404, rappel en retard signalé (redémarrage), une récurrence manquée plusieurs fois n'envoie qu'un message.
- **Stockage** (`src/store.js`) : `DATA_DIR/reminders.json`, écriture atomique ; les rappels terminés sont purgés après 48 h.

## Lancer
```bash
cd bots/reminders && npm install
GPCHAT_API_KEY=gpk_live_… npm start
npm test        # sans réseau
```

## Exploitation

| Variable | Défaut | Rôle |
|---|---|---|
| `GPCHAT_API_KEY` | — | clé API du bot (obligatoire) |
| `DEFAULT_TZ` | `Africa/Douala` | fuseau des nouveaux utilisateurs |
| `CONCURRENCY` | `16` | conversations traitées en parallèle |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` |
| `OPS_PORT` / `OPS_HOST` | `9100` / `127.0.0.1` | `/healthz`, `/readyz` (503 si le polling ou le planificateur s'arrête), `/metrics` |
| `DATA_DIR` | `./data` | état persistant — **à sauvegarder** (contient les rappels) |

Métriques propres au bot : `gpchat_bot_reminders_active`, `gpchat_bot_reminders_recurring`, `gpchat_bot_reminders_users`, `gpchat_bot_reminders_fired_total{result="fired|retried|failed"}`. Alerte recommandée : `increase(gpchat_bot_reminders_fired_total{result="failed"}[1h]) > 0`.

Voir aussi [docs/OPERATIONS.md](../../docs/OPERATIONS.md), [CHANGELOG.md](CHANGELOG.md), [docs/VERSIONING.md](../../docs/VERSIONING.md).

## Données personnelles
Le texte des rappels est conservé sur le serveur du bot jusqu'à l'envoi (48 h de plus pour permettre « Reporter »), puis supprimé. `/supprimer tout` efface tout immédiatement.
