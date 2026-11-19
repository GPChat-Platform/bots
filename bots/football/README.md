# Foot en direct (`@footdirect_bot`)

Le football en direct dans GPChat : **scores en temps réel**, **alertes à chaque but** de vos équipes, calendrier, classements et buteurs — en privé comme en groupe. Français et anglais.

## Commandes

| Commande | Rôle |
|---|---|
| `/direct` (`/direct tout`) | matchs en cours — compétitions phares et équipes suivies d'abord |
| `/matchs` (`demain`, `hier`, `25/12`, `2026-12-25`) | matchs d'un jour, heures dans votre fuseau |
| `/match_<id>` | détail : score, état, stade, buts, cartons rouges, VAR |
| `/equipe Cameroun` (ou juste « Cameroun ») | fiche, 3 prochains matchs, 3 derniers résultats, bouton Suivre |
| `/suivre`, `/mesequipes`, `/nepasuivre` | alertes en direct (15 équipes max. par conversation) |
| `/classement can`, `/buteurs pl` | classement (phases de groupes comprises), meilleurs buteurs |
| `/ligues` | raccourcis : `can`, `cafcl`, `elite1`, `ucl`, `uel`, `pl`, `liga`, `ligue1`, `seriea`, `bundesliga`, `wc` |
| `/fuseau`, `/langue`, `/aide`, `/apropos` | réglages |

**Alertes** : coup d'envoi, ⚽ but (buteur, minute, passeur, penalty, csc), 📺 but annulé par la VAR, 🟥 carton rouge, mi-temps, reprise, prolongation, tirs au but, 🏁 fin du match avec vainqueur, match interrompu ou reporté. En groupe, `/suivre` envoie les alertes à tout le groupe ; le bot n'écoute que les commandes et les mentions.

## Données : API-Football
Le bot utilise [API-Football](https://www.api-football.com) (api-sports.io) : toutes les compétitions (y compris CAN, Ligue des champions CAF, Elite One), événements en direct, une seule clé.

| Offre | Quota | Usage conseillé |
|---|---|---|
| Gratuite | 100 requêtes/jour | développement et tests (le direct est alors relevé toutes les ~20 min) |
| Pro (ou supérieure) | 7 500 requêtes/jour | production : direct toutes les 60 s, commandes servies largement |

Vérifiez les tarifs et conditions actuels sur leur site avant la mise en production.

### Économie de quota (`src/api.js`, `src/live.js`)
- **Un seul appel `fixtures?live=all`** sert à la fois les alertes de tout le monde et `/direct` ; aucun appel quand personne ne suit d'équipe.
- **Intervalle adapté au quota** : jamais plus d'environ 70 % du quota journalier pour le direct (le reste pour les commandes).
- **Cache par type** : classements 10 min, matchs du jour 5 min, autres jours 1 h, recherche d'équipes 24 h ; requêtes identiques simultanées fusionnées.
- **Mode dégradé** : sous `QUOTA_RESERVE` requêtes restantes, le bot ne sert plus que le cache (même ancien) et l'indique poliment ; `/readyz` passe en erreur si le quota est épuisé.

### Fiabilité des alertes
- Les événements déjà notifiés sont enregistrés : un redémarrage en plein match ne renvoie pas les buts passés.
- Un match suivi qui sort du direct est relu par son identifiant pour annoncer le score final.
- Envoi par file à débit limité (8 en parallèle) ; une conversation qui a bloqué le bot (403/404) est désabonnée.

## Lancer
```bash
cd bots/football && npm install
GPCHAT_API_KEY=gpk_live_… API_FOOTBALL_KEY=… npm start
npm test        # sans réseau
```

## Exploitation

| Variable | Défaut | Rôle |
|---|---|---|
| `GPCHAT_API_KEY` | — | clé API du bot (obligatoire) |
| `API_FOOTBALL_KEY` | — | clé API-Football (obligatoire) |
| `LIVE_POLL_SECONDS` | `60` | intervalle souhaité du direct (relevé automatiquement si le quota l'exige) |
| `QUOTA_RESERVE` | `50` | requêtes gardées en réserve avant le mode dégradé |
| `DEFAULT_TZ` | `Africa/Douala` | fuseau des nouveaux utilisateurs |
| `CONCURRENCY` | `16` | conversations traitées en parallèle |
| `LOG_LEVEL`, `OPS_PORT`, `OPS_HOST`, `DATA_DIR` | | comme les autres bots (voir [docs/OPERATIONS.md](../../docs/OPERATIONS.md)) |

Métriques propres : `gpchat_bot_football_api_requests_total{endpoint,status}`, `gpchat_bot_football_quota_remaining`, `gpchat_bot_football_live_interval_seconds`, `gpchat_bot_football_alerts_total`, `gpchat_bot_football_notifications_total{result}`, `gpchat_bot_football_subscribed_chats`, `gpchat_bot_football_followed_teams`.
Alertes recommandées : `gpchat_bot_football_quota_remaining < 200`, `increase(gpchat_bot_football_notifications_total{result="error"}[15m]) > 10`.

Voir aussi [CHANGELOG.md](CHANGELOG.md) et [docs/VERSIONING.md](../../docs/VERSIONING.md).
