# Changelog — Foot en direct (`@footdirect_bot`)

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/) — politique : [docs/VERSIONING.md](../../docs/VERSIONING.md)

## [Non publié]

### Corrigé
- En groupe, une commande adressée à un autre bot (« /aide@autre_bot ») n'obtient plus de réponse de ce bot (`BOT_USERNAME` pour changer son nom).

## [1.0.0] — 2026-11-19

### Ajouté
- Matchs en direct (`/direct`), du jour ou d'une date (`/matchs demain`, `/matchs 25/12`), détail d'un match avec chronologie (`/match_<id>`).
- Fiche d'équipe (logo, stade, 3 prochains matchs, 3 derniers résultats) ; il suffit d'écrire le nom d'une équipe.
- Alertes en direct pour les équipes suivies (`/suivre`, en privé ou en groupe) : coup d'envoi, but (buteur, minute, passeur, penalty, contre son camp), but annulé par la VAR, carton rouge, mi-temps, reprise, prolongation, tirs au but, fin du match avec vainqueur, match interrompu ou reporté.
- Classements (`/classement`, phases de groupes comprises) et meilleurs buteurs (`/buteurs`) ; raccourcis de compétitions (`/ligues`) dont CAN, Ligue des champions CAF et Elite One.
- Heures dans le fuseau de chaque utilisateur, français et anglais.
- Économie de quota API-Football : un seul appel partagé pour tout le direct, intervalle ajusté au quota journalier, cache par type de donnée, requêtes identiques fusionnées, mode dégradé (cache seul) sous la réserve `QUOTA_RESERVE`.
- Fiabilité : événements déjà notifiés mémorisés (pas de doublon après un redémarrage), match disparu du direct relu pour le score final, file d'envoi à débit limité, conversation bloquée désabonnée.
- Message clair quand une donnée n'est pas incluse dans l'offre API-Football (ex. classements de la saison en cours en offre gratuite).
- Exploitation : `/readyz` (polling, suivi du direct, quota), métriques `gpchat_bot_football_*` (appels API, quota restant, alertes, notifications, abonnés).
