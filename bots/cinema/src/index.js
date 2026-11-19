'use strict';
// Ciné Club — bot en mode polling (aucun serveur public nécessaire).
// Variables : GPCHAT_API_KEY, TMDB_TOKEN (obligatoires) ; OMDB_API_KEY, DATA_DIR, LOG_LEVEL, OPS_PORT (facultatives).
// Exploitation : /healthz /readyz /metrics sur OPS_PORT (9100, 127.0.0.1) — voir docs/OPERATIONS.md.
const path = require('node:path');
const { GPChatBot, button } = require('@gpchat/bot');
const { createOps } = require('@gpchat/bot-ops');
const { Tmdb, Omdb } = require('./tmdb');
const { Store } = require('./store');
const { createHandler } = require('./handlers');

const { version } = require('../package.json');
const ops = createOps({ service: 'cinema', version });
const { log } = ops;

function must(name) {
  if (!process.env[name]) {
    log.error(`variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const bot = ops.instrumentBot(new GPChatBot({ apiKey: must('GPCHAT_API_KEY'), baseUrl: process.env.GPCHAT_BASE_URL }));
const tmdb = new Tmdb({ token: must('TMDB_TOKEN') });
const omdb = process.env.OMDB_API_KEY ? new Omdb({ apiKey: process.env.OMDB_API_KEY }) : null;
const store = new Store(path.join(process.env.DATA_DIR || './data', 'cinema.json'));
const { handle } = createHandler({ bot, tmdb, omdb, store, button, log });

ops.expectPolling();
// TMDB est la dépendance critique : /readyz passe à 503 s'il est injoignable (résultat mis en cache 10 min par le client).
ops.addReadinessCheck('tmdb', async () => {
  try {
    await tmdb.trending('fr-FR');
    return true;
  } catch (e) {
    return { ok: false, detail: e.message };
  }
});

const stop = bot.poll(ops.instrumentHandler(handle), { timeout: 20, onError: (e) => log.warn('polling en erreur', { error: e.message }) });
ops.listen().catch((e) => log.error("serveur d'exploitation indisponible", { error: e.message }));
log.info('Ciné Club démarré', { version, mode: 'polling', omdb: Boolean(omdb) });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('arrêt', { signal: sig });
    stop();
    store.flush();
    process.exit(0);
  });
}
