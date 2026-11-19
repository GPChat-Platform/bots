'use strict';
// Modèle de bot GPChat en mode polling : aucun serveur public nécessaire.
// Lancez :  GPCHAT_API_KEY=gpk_live_... node src/index.js
const { GPChatBot, button } = require('@gpchat/bot');
const { createHandler } = require('./handler');

if (!process.env.GPCHAT_API_KEY) {
  console.error('Définissez GPCHAT_API_KEY (console développeur → Identifiants).');
  process.exit(1);
}
const bot = new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY });
const stop = bot.poll(createHandler({ bot, button }), { timeout: 20, onError: (e) => console.error('[poll]', e.message) });
console.log('Bot démarré (polling). Ctrl+C pour arrêter.');
process.on('SIGINT', () => { stop(); process.exit(0); });
