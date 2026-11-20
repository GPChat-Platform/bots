# Changelog — Rappels (`@rappels_bot`)

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage : [SemVer](https://semver.org/lang/fr/) — politique : [docs/VERSIONING.md](../../docs/VERSIONING.md)

## [Non publié]

### Corrigé
- En groupe, une commande adressée à un autre bot (« /aide@autre_bot ») n'obtient plus de réponse de ce bot (`BOT_USERNAME` pour changer son nom).

## [1.0.0] — 2026-11-19

### Ajouté
- Rappels en langage naturel, français et anglais : délais (« dans 20 min », « in 2 hours »), jours (« demain », « lundi prochain »), dates (« le 25/12 », « march 3 »), heures (« 18h30 », « 6:30 pm », « midi »), moments (« ce soir », « demain matin »).
- Récurrences : quotidienne, tous les N jours, jours de semaine choisis, en semaine, week-end, mensuelle (fin de mois gérée), annuelle (29 février géré), toutes les N minutes/heures (15 min minimum).
- Fuseau horaire par utilisateur (`/fuseau Douala`, `/fuseau Europe/Paris`, `/fuseau UTC+1`), changements d'heure compris.
- Boutons sur chaque rappel : Fait, +10 min, +1 h, Demain ; annulation juste après la création ; suppression depuis `/liste`.
- Groupes : `/rappel` programme un rappel pour tout le groupe ; tout membre peut le marquer fait ou le reporter, seul son créateur peut le supprimer.
- Planificateur fiable : nouvel essai exponentiel (6 essais), abandon immédiat si l'API refuse définitivement (403/404), retard signalé après un redémarrage, pas de double envoi.
- Exploitation : journaux JSON, `/healthz`, `/readyz` (polling + planificateur), `/metrics` (`gpchat_bot_reminders_active`, `gpchat_bot_reminders_fired_total{result}`…).
- Limites : 50 rappels actifs par personne, 30 par groupe, horizon de 5 ans.
