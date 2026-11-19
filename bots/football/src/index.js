'use strict';
// Foot en direct — bot en mode polling (aucun serveur public nécessaire).
// Variables : GPCHAT_API_KEY, API_FOOTBALL_KEY (obligatoires) ; DEFAULT_TZ (Africa/Douala), LIVE_POLL_SECONDS (60),
// QUOTA_RESERVE (50), DATA_DIR, LOG_LEVEL, OPS_PORT, CONCURRENCY (facultatives).
// Exploitation : /healthz /readyz /metrics sur OPS_PORT (9100, 127.0.0.1) — voir docs/OPERATIONS.md.
const path = require('node:path');
const { GPChatBot, button } = require('@gpchat/bot');
const { createOps } = require('@gpchat/bot-ops');
const { FootballApi } = require('./api');
const { Store } = require('./store');
const { LiveTracker } = require('./live');
const { createHandler } = require('./handlers');
const { isValidZone } = require('./zones');

const { version } = require('../package.json');
const ops = createOps({ service: 'football', version });
const { log, metrics } = ops;

function must(name) {
  if (!process.env[name]) {
    log.error(`variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const defaultTz = process.env.DEFAULT_TZ || 'Africa/Douala';
if (!isValidZone(defaultTz)) {
  log.error('DEFAULT_TZ invalide', { defaultTz });
  process.exit(1);
}

const bot = ops.instrumentBot(new GPChatBot({ apiKey: must('GPCHAT_API_KEY'), baseUrl: process.env.GPCHAT_BASE_URL }));
const api = new FootballApi({ key: must('API_FOOTBALL_KEY'), reserve: Number(process.env.QUOTA_RESERVE || 50), log });
api.onCall = (endpoint, status) => metrics.inc('football_api_requests_total', { endpoint, status }, 1, 'Appels à API-Football');
const store = new Store(path.join(process.env.DATA_DIR || './data', 'football.json'), { defaultTz });

const send = (chat, text) => (chat.groupId ? bot.sendGroupMessage(chat.groupId, text, { markdown: true }) : bot.sendMessage(chat.to, text, { markdown: true }));
const tracker = new LiveTracker({ api, store, send, log, metrics, intervalMs: Number(process.env.LIVE_POLL_SECONDS || 60) * 1000 });
const { handle } = createHandler({ bot, api, tracker, store, button, version, log });

ops.expectPolling();
ops.addReadinessCheck('live', () => (tracker.healthy() ? true : { ok: false, detail: 'le suivi du direct ne tourne plus' }));
ops.addReadinessCheck('api-football', () => {
  if (api.quota.dailyRemaining === 0) return { ok: false, detail: 'quota API-Football épuisé' };
  return true;
});
setInterval(() => {
  const s = store.stats();
  metrics.set('football_subscribed_chats', s.chats, undefined, 'Conversations abonnées à au moins une équipe');
  metrics.set('football_followed_teams', s.teams, undefined, 'Équipes suivies (distinctes)');
  if (api.quota.dailyRemaining != null) metrics.set('football_quota_remaining', api.quota.dailyRemaining, undefined, 'Requêtes API-Football restantes aujourd’hui');
  metrics.set('football_live_interval_seconds', Math.round(tracker.interval() / 1000), undefined, 'Intervalle effectif du suivi du direct');
}, 15000).unref();

const stop = bot.poll(ops.instrumentHandler(handle), { timeout: 20, concurrency: Number(process.env.CONCURRENCY || 16), onError: (e) => log.warn('polling en erreur', { error: e.message }) });
tracker.start();
ops.listen().catch((e) => log.error("serveur d'exploitation indisponible", { error: e.message }));
log.info('Foot en direct démarré', { version, mode: 'polling', defaultTz, followedTeams: store.stats().teams });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('arrêt', { signal: sig });
    stop();
    tracker.stop();
    store.flush();
    process.exit(0);
  });
}
