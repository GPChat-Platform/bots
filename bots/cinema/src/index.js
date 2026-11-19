'use strict';
// Ciné Club — bot en mode polling (aucun serveur public nécessaire).
// Variables : GPCHAT_API_KEY, TMDB_TOKEN (obligatoires) ; OMDB_API_KEY, DATA_DIR (facultatives).
const path = require('node:path');
const { GPChatBot, button } = require('@gpchat/bot');
const { Tmdb, Omdb } = require('./tmdb');
const { Store } = require('./store');
const { createHandler } = require('./handlers');

function must(name) {
  if (!process.env[name]) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const bot = new GPChatBot({ apiKey: must('GPCHAT_API_KEY'), baseUrl: process.env.GPCHAT_BASE_URL });
const tmdb = new Tmdb({ token: must('TMDB_TOKEN') });
const omdb = process.env.OMDB_API_KEY ? new Omdb({ apiKey: process.env.OMDB_API_KEY }) : null;
const store = new Store(path.join(process.env.DATA_DIR || './data', 'cinema.json'));
const { handle } = createHandler({ bot, tmdb, omdb, store, button });

const stop = bot.poll(handle, { timeout: 20, onError: (e) => console.error('[poll]', e.message) });
console.log('Ciné Club démarré (polling).');
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stop();
    store.flush();
    process.exit(0);
  });
}
