# Modèle de bot

Copiez ce dossier dans `bots/mon-bot/`, renommez le paquet, puis :

```bash
cd bots/mon-bot && npm install
GPCHAT_API_KEY=gpk_live_... npm start
```

1. Créez le bot : écrivez à **@gpchat_forge** et tapez `/newbot`, ou utilisez la [console développeur](https://gpchat.app/developers/console).
2. Passez en mode polling : `/setmode polling` (aucun serveur public nécessaire).
3. Ajoutez un fichier `bot.json` (nom, @username, description, commandes) et un `assets/avatar.png` (512 × 512).
4. Écrivez des tests : la logique est séparée du réseau (`src/handler.js`), comme dans les autres bots.
