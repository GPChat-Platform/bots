# Déploiement (Docker Compose)

Les bots Ciné Club et DevFest Guide fonctionnent en **polling** : ils appellent l'API GPChat, aucune adresse publique n'est requise. Seul **Dev Alerts** reçoit des appels entrants (webhooks GitHub, Uptime Kuma…) et a besoin d'une adresse HTTPS.

## 1. Créer les trois bots

Pour chaque `bots/<nom>/bot.json` :

1. Écrivez à **@gpchat_forge** : `/newbot`, le nom et l'@username du fichier `bot.json`. Notez la **clé API** (affichée une seule fois).
2. `/setmode polling`, puis `/setdescription` et `/setcommands` avec le contenu de `bot.json`. (La console développeur permet aussi de tout saisir.)
3. Catégorie : `/setcategory`. Publication : `/publish` puis `/publish confirm` quand tout fonctionne.
4. Avatar : `assets/avatar.png` (512×512).

## 2. Démarrer

```bash
cp deploy/.env.example deploy/.env      # renseignez les clés
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

## 3. Dev Alerts : adresse HTTPS entrante

Exemple Apache (certificat Let's Encrypt via `certbot --apache`) :

```apache
<VirtualHost *:443>
  ServerName alertes.example.com
  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:18090/
  ProxyPassReverse / http://127.0.0.1:18090/
  # Seuls /hook/<jeton> et /healthz sont utiles : limitez la taille des corps
  LimitRequestBody 262144
</VirtualHost>
```

Dans un groupe GPChat, ajoutez le bot puis envoyez `/connecter` : il répond avec l'adresse `…/hook/<jeton>` à coller dans GitHub (*Settings → Webhooks*, type `application/json`).

## 4. DevFest Guide : le programme

Le bot démarre avec `bots/devfest/data/program.template.json`. Copiez-le dans le volume `devfest-data` sous le nom `program.json`, remplissez les vraies sessions (heures avec fuseau, ex. `2026-11-28T09:00:00+01:00`) puis redémarrez le conteneur.

## 5. Mise à jour et sauvegarde

```bash
git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker run --rm -v bots_cinema-data:/d -v "$PWD":/b alpine tar czf /b/cinema-data.tgz -C /d .   # sauvegarde
```

Les clés API ne doivent jamais être committées : `deploy/.env` est ignoré par git.

## Quota

Chaque bot a **60 requêtes/minute** par défaut. Un bot très sollicité (ou une annonce à 500 personnes) peut demander un quota plus élevé à l'équipe GPChat (`setAppRateLimit`).
