'use strict';
// La logique du bot, sans réseau : facile à tester. Remplacez-la par la vôtre.
function createHandler({ bot, button }) {
  return async function handle(update) {
    const d = update.data || {};
    if (update.type === 'message.received' && d.type === 'text') {
      const text = String(d.textMsg || '').trim();
      if (text === '/start') {
        return bot.sendMessage(d.chatId, 'Bonjour ! Envoyez-moi un message, je vous le renvoie.', {
          buttons: [[button.callback('Dire bonjour', 'hello')]],
        });
      }
      return bot.sendMessage(d.chatId, `Vous avez dit : ${text}`);
    }
    if (update.type === 'callback.received' && d.data === 'hello') {
      return bot.sendMessage(d.chatId, 'Bonjour à vous aussi 👋');
    }
    return undefined;
  };
}

module.exports = { createHandler };
