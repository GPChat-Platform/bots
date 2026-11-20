'use strict';
// Rappels — bot en mode polling (aucun serveur public nécessaire).
// Variables : GPCHAT_API_KEY (obligatoire) ; DEFAULT_TZ (Africa/Douala), DATA_DIR, LOG_LEVEL, OPS_PORT, CONCURRENCY (facultatives).
// Exploitation : /healthz /readyz /metrics sur OPS_PORT (9100, 127.0.0.1) — voir docs/OPERATIONS.md.
const path = require('node:path');
const { GPChatBot, button, ignoreOtherBotsCommands } = require('@gpchat/bot');
// Nom du bot : en groupe, « /commande@autre_bot » ne le concerne pas (voir ignoreOtherBotsCommands).
const BOT_USERNAME = process.env.BOT_USERNAME || 'rappels_bot';
const { createOps } = require('@gpchat/bot-ops');
const { Store } = require('./store');
const { Scheduler } = require('./scheduler');
const { createHandler } = require('./handlers');
const { isValidZone } = require('./tz');

const { version } = require('../package.json');
const ops = createOps({ service: 'reminders', version });
const { log, metrics } = ops;

if (!process.env.GPCHAT_API_KEY) {
  log.error("variable d'environnement manquante : GPCHAT_API_KEY");
  process.exit(1);
}
const defaultTz = process.env.DEFAULT_TZ || 'Africa/Douala';
if (!isValidZone(defaultTz)) {
  log.error('DEFAULT_TZ invalide', { defaultTz });
  process.exit(1);
}

const bot = ops.instrumentBot(new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY, baseUrl: process.env.GPCHAT_BASE_URL }));
const store = new Store(path.join(process.env.DATA_DIR || './data', 'reminders.json'), { defaultTz });
const { handle, deliver } = createHandler({ bot, store, button, version, log });
const scheduler = new Scheduler({ store, deliver, log, metrics });

ops.expectPolling();
ops.addReadinessCheck('scheduler', () => (scheduler.healthy() ? true : { ok: false, detail: 'le planificateur ne tourne plus' }));
// Jauges mises à jour à chaque passe de collecte.
setInterval(() => {
  const s = store.stats();
  metrics.set('reminders_active', s.active, undefined, 'Rappels actifs');
  metrics.set('reminders_recurring', s.recurring, undefined, 'Rappels récurrents actifs');
  metrics.set('reminders_users', s.users, undefined, 'Utilisateurs connus');
}, 15000).unref();

const stop = bot.poll(ops.instrumentHandler(ignoreOtherBotsCommands(handle, BOT_USERNAME)), { timeout: 20, concurrency: Number(process.env.CONCURRENCY || 16), onError: (e) => log.warn('polling en erreur', { error: e.message }) });
scheduler.start();
ops.listen().catch((e) => log.error("serveur d'exploitation indisponible", { error: e.message }));
log.info('Rappels démarré', { version, mode: 'polling', defaultTz, reminders: store.stats().active });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('arrêt', { signal: sig });
    stop();
    scheduler.stop();
    store.flush();
    process.exit(0);
  });
}
