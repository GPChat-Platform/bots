'use strict';
// Dev Alerts — polling (commandes) + petit serveur HTTP (webhooks entrants).
// Variables : GPCHAT_API_KEY, PUBLIC_URL (ex. https://alertes.example.com) ; PORT (8080), DATA_DIR (./data), LOG_LEVEL, OPS_PORT.
// Exploitation : /healthz /readyz /metrics sur OPS_PORT (9100, 127.0.0.1) — voir docs/OPERATIONS.md.
const fs = require('node:fs');
const path = require('node:path');
const { GPChatBot } = require('@gpchat/bot');
const { createOps } = require('@gpchat/bot-ops');
const { createServer, createCommands, Hooks } = require('./server');

const { version } = require('../package.json');
const ops = createOps({ service: 'dev-alerts', version });
const { log } = ops;

function must(name) {
  if (!process.env[name]) {
    log.error(`variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const file = path.join(process.env.DATA_DIR || './data', 'alerts.json');
const store = { data: { hooks: {} }, timer: null };
try { store.data = { hooks: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* premier démarrage */ }
store.flush = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(store.data));
  fs.renameSync(`${file}.tmp`, file);
};
store.save = () => {
  clearTimeout(store.timer);
  store.timer = setTimeout(store.flush, 300);
};

const bot = ops.instrumentBot(new GPChatBot({ apiKey: must('GPCHAT_API_KEY'), baseUrl: process.env.GPCHAT_BASE_URL }));
const hooks = new Hooks(store);
const publicUrl = must('PUBLIC_URL').replace(/\/$/, '');
const handle = createCommands({ bot, hooks, publicUrl });

ops.expectPolling();
ops.metrics.set('webhooks_configured', Object.keys(store.data.hooks).length, undefined, 'Webhooks entrants configurés');
const stop = bot.poll(ops.instrumentHandler(handle), { timeout: 20, onError: (e) => log.warn('polling en erreur', { error: e.message }) });
const port = Number(process.env.PORT || 8080);
const server = createServer({ bot, hooks, ops }).listen(port, () => log.info('Dev Alerts démarré', { version, port, hooks: Object.keys(store.data.hooks).length }));
ops.listen().catch((e) => log.error("serveur d'exploitation indisponible", { error: e.message }));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('arrêt', { signal: sig });
    stop();
    server.close();
    store.flush();
    process.exit(0);
  });
}
