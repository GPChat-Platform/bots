# @gpchat/bot (Node.js)

SDK officiel GPChat — Node.js ≥ 18, aucune dépendance, types TypeScript inclus.

```js
const { GPChatBot, button } = require('@gpchat/bot');
const bot = new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY });

// Mode polling : aucun serveur public nécessaire (console → Webhooks → Mode de réception)
bot.poll(async (update) => {
  if (update.type === 'message.received') {
    await bot.sendChatAction(update.data.from, 'typing', 2);
    await bot.sendMessage(update.data.from, 'Salut **toi** !', {
      markdown: true,
      buttons: [[button.callback('Oui', 'vote:oui'), button.callback('Non', 'vote:non')]],
    });
  } else if (update.type === 'callback.received') {
    await bot.editMessage(update.data.from, update.data.msgId, { content: 'Merci !', buttons: null });
  }
});
```

Webhook Express (signature vérifiée, compatible avec la rotation du secret) :

```js
const express = require('express');
const { webhookMiddleware } = require('@gpchat/bot');
const app = express();
app.post('/gpchat', express.raw({ type: 'application/json' }), webhookMiddleware(process.env.GPCHAT_WEBHOOK_SECRET), (req, res) => {
  console.log(req.gpchatEvent.type);
  res.sendStatus(200);
});
```

Les erreurs sont des `GPChatError` (`status`, `code`). Les réponses 429/5xx sont réessayées automatiquement. Tests : `npm test`.
