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
