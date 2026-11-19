'use strict';
// Guide DevFest — bot en mode polling. Variables : GPCHAT_API_KEY ; ADMIN_IDS (userId séparés par des virgules) ;
// DATA_DIR (./data) ; PROGRAM_FILE (sinon le programme du dépôt data/program.json) ; LOG_LEVEL ; OPS_PORT.
// Exploitation : /healthz /readyz /metrics sur OPS_PORT (9100, 127.0.0.1) — voir docs/OPERATIONS.md.
const fs = require('node:fs');
const path = require('node:path');
const { GPChatBot } = require('@gpchat/bot');
const { createOps } = require('@gpchat/bot-ops');
const P = require('./program');
const { createHandler } = require('./handlers');

const { version } = require('../package.json');
const ops = createOps({ service: 'devfest', version });
const { log } = ops;

if (!process.env.GPCHAT_API_KEY) {
  log.error("variable d'environnement manquante : GPCHAT_API_KEY");
  process.exit(1);
}
const dataDir = process.env.DATA_DIR || './data';
const program = P.load(process.env.PROGRAM_FILE || path.join(dataDir, 'program.json'), path.join(__dirname, '..', 'data', 'program.json'));

const file = path.join(dataDir, 'devfest.json');
const store = { data: { users: {} }, timer: null };
try { store.data = { users: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* premier démarrage */ }
store.user = (id) => {
  if (!store.data.users[id]) store.data.users[id] = { lang: 'fr', reminders: [], sent: [] };
  return store.data.users[id];
};
store.flush = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(store.data));
  fs.renameSync(`${file}.tmp`, file);
};
store.save = () => {
  clearTimeout(store.timer);
  store.timer = setTimeout(store.flush, 300);
};

const bot = ops.instrumentBot(new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY, baseUrl: process.env.GPCHAT_BASE_URL }));
const admins = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const { handle, tick } = createHandler({ bot, program, store, admins, log });

ops.expectPolling();
const stop = bot.poll(ops.instrumentHandler(handle), { timeout: 20, onError: (e) => log.warn('polling en erreur', { error: e.message }) });
const timer = setInterval(() => {
  ops.metrics.set('users', Object.keys(store.data.users).length, undefined, 'Utilisateurs connus');
  tick().catch((e) => log.error('rappels en échec', { error: e.message }));
}, 30000);
ops.listen().catch((e) => log.error("serveur d'exploitation indisponible", { error: e.message }));
log.info('Guide démarré', { version, event: program.event.name, sessions: program.sessions.length, admins: admins.length });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('arrêt', { signal: sig });
    stop();
    clearInterval(timer);
    store.flush();
    process.exit(0);
  });
}
