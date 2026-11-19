'use strict';
/**
 * @gpchat/bot-ops — observabilité commune des bots GPChat, sans dépendance.
 *
 *   const ops = createOps({ service: 'cinema' });
 *   ops.log.info('démarré', { mode: 'polling' });          // une ligne JSON par événement
 *   const handle = ops.instrumentHandler(router.handle);   // compte les événements, les erreurs, la durée
 *   ops.instrumentBot(bot);                                 // compte les appels à l'API GPChat (code, durée) + dernier polling réussi
 *   await ops.listen({ port: 9100 });                       // /healthz  /readyz  /metrics
 *
 * Journaux : JSON en production (Vector → Graylog, Loki, Datadog…), lisible en développement.
 *            Champs fixes : t, level, service, msg + vos champs. Jamais de secret ni de message privé.
 * Santé :    /healthz = le processus tourne ; /readyz = prêt (polling récent / dépendances OK) → 503 sinon.
 * Métriques: format texte Prometheus (voir docs/OPERATIONS.md pour les alertes recommandées).
 */
const http = require('node:http');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger({ service, level = 'info', json = process.env.NODE_ENV === 'production', out = console, now = () => new Date() } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const log = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const line = json
      ? JSON.stringify({ t: now().toISOString(), level: lvl, service, msg, ...fields })
      : `${now().toISOString()} ${lvl.toUpperCase().padEnd(5)} [${service}] ${msg}${fields ? ` ${JSON.stringify(fields)}` : ''}`;
    (lvl === 'error' || lvl === 'warn' ? out.error : out.log)(line);
  };
  return { debug: (m, f) => log('debug', m, f), info: (m, f) => log('info', m, f), warn: (m, f) => log('warn', m, f), error: (m, f) => log('error', m, f) };
}

/** Registre de métriques minimal : compteurs, jauges, résumés (somme + nombre) avec étiquettes. */
class Metrics {
  constructor(prefix) {
    this.prefix = prefix;
    this.series = new Map(); // nom -> { type, help, values: Map(labelsKey -> valeur | {sum,count}) }
  }

  _get(name, type, help) {
    if (!this.series.has(name)) this.series.set(name, { type, help, values: new Map() });
    return this.series.get(name);
  }

  static key(labels) {
    return Object.keys(labels || {}).sort().map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, '_')}"`).join(',');
  }

  inc(name, labels, by = 1, help = '') {
    const s = this._get(name, 'counter', help);
    const k = Metrics.key(labels);
    s.values.set(k, (s.values.get(k) || 0) + by);
  }

  set(name, value, labels, help = '') {
    this._get(name, 'gauge', help).values.set(Metrics.key(labels), value);
  }

  observe(name, seconds, labels, help = '') {
    const s = this._get(name, 'summary', help);
    const k = Metrics.key(labels);
    const cur = s.values.get(k) || { sum: 0, count: 0 };
    cur.sum += seconds;
    cur.count += 1;
    s.values.set(k, cur);
  }

  render() {
    const lines = [];
    for (const [name, s] of this.series) {
      const full = `${this.prefix}_${name}`;
      if (s.help) lines.push(`# HELP ${full} ${s.help}`);
      lines.push(`# TYPE ${full} ${s.type}`);
      for (const [k, v] of s.values) {
        const sel = k ? `{${k}}` : '';
        if (s.type === 'summary') {
          lines.push(`${full}_sum${sel} ${v.sum}`);
          lines.push(`${full}_count${sel} ${v.count}`);
        } else lines.push(`${full}${sel} ${v}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }
}

function createOps({ service, version = 'dev', level = process.env.LOG_LEVEL || 'info', now = Date.now, staleAfterMs = 90_000, out } = {}) {
  const log = createLogger({ service, level, out });
  const prefix = `gpchat_bot`;
  const metrics = new Metrics(prefix);
  const startedAt = now();
  const state = { lastPollOkAt: 0, pollingExpected: false, checks: [] };

  metrics.set('info', 1, { service, version, node: process.version }, 'Informations sur le bot (version du bot, de Node.js)');

  const ops = {
    log, metrics, state, version,

    /** Ajoute une vérification de disponibilité (ex. dépendance externe). fn() → true | false | { ok, detail } */
    addReadinessCheck(name, fn) { state.checks.push({ name, fn }); },

    /** Enveloppe le traitement d'une mise à jour : compte, mesure, journalise les erreurs, ne laisse rien s'échapper. */
    instrumentHandler(handle) {
      return async (update) => {
        const type = (update && update.type) || 'inconnu';
        const t0 = process.hrtime.bigint();
        try {
          await handle(update);
          metrics.inc('events_total', { type, result: 'ok' }, 1, 'Événements GPChat traités');
        } catch (e) {
          metrics.inc('events_total', { type, result: 'error' }, 1, 'Événements GPChat traités');
          log.error('échec de traitement', { type, error: e && e.message });
        } finally {
          metrics.observe('event_duration_seconds', Number(process.hrtime.bigint() - t0) / 1e9, { type }, 'Durée de traitement d\'un événement');
        }
      };
    },

    /** Instrumente le client GPChat : appels à l'API (route, code HTTP, durée) et fraîcheur du polling. */
    instrumentBot(bot) {
      const request = bot.request.bind(bot);
      bot.request = async (method, path, opts) => {
        const route = String(path).split('?')[0];
        const t0 = process.hrtime.bigint();
        try {
          const res = await request(method, path, opts);
          metrics.inc('api_requests_total', { route, status: '2xx' }, 1, 'Appels à l\'API GPChat');
          if (route === '/updates') { state.lastPollOkAt = now(); metrics.set('last_poll_success_timestamp_seconds', Math.floor(now() / 1000), undefined, 'Dernier polling réussi'); }
          return res;
        } catch (e) {
          const status = e && e.status ? `${String(e.status)[0]}xx` : 'réseau';
          metrics.inc('api_requests_total', { route, status }, 1, 'Appels à l\'API GPChat');
          if (e && e.status === 401) log.error('clé API refusée (401) : régénérez-la dans la console', { route });
          if (e && e.status === 429) log.warn('limite de requêtes atteinte (429)', { route });
          throw e;
        } finally {
          metrics.observe('api_request_duration_seconds', Number(process.hrtime.bigint() - t0) / 1e9, { route }, 'Durée des appels à l\'API GPChat');
        }
      };
      return bot;
    },

    /** Déclare que ce bot fonctionne en polling : /readyz exige alors un polling réussi récent. */
    expectPolling() { state.pollingExpected = true; state.lastPollOkAt = now(); },

    async readiness() {
      const problems = [];
      if (state.pollingExpected) {
        const age = now() - state.lastPollOkAt;
        if (age > staleAfterMs) problems.push({ name: 'polling', detail: `aucun polling réussi depuis ${Math.round(age / 1000)} s` });
      }
      for (const c of state.checks) {
        try {
          const r = await c.fn();
          if (r === false || (r && r.ok === false)) problems.push({ name: c.name, detail: (r && r.detail) || 'KO' });
        } catch (e) { problems.push({ name: c.name, detail: e.message }); }
      }
      return { ok: problems.length === 0, problems, uptimeSeconds: Math.round((now() - startedAt) / 1000) };
    },

    /** Serveur d'exploitation : /healthz /readyz /metrics. À exposer en interne seulement (127.0.0.1 / réseau privé). */
    listen({ port = Number(process.env.OPS_PORT || 9100), host = process.env.OPS_HOST || '127.0.0.1' } = {}) {
      const server = http.createServer(async (req, res) => {
        const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
        const url = (req.url || '').split('?')[0];
        if (req.method !== 'GET') return send(405, 'text/plain', 'method not allowed');
        if (url === '/healthz') return send(200, 'application/json', JSON.stringify({ ok: true, service, uptimeSeconds: Math.round((now() - startedAt) / 1000) }));
        if (url === '/readyz') { const r = await ops.readiness(); return send(r.ok ? 200 : 503, 'application/json', JSON.stringify(r)); }
        if (url === '/metrics') {
          metrics.set('uptime_seconds', Math.round((now() - startedAt) / 1000), undefined, 'Durée de fonctionnement');
          const mem = process.memoryUsage();
          metrics.set('memory_rss_bytes', mem.rss, undefined, 'Mémoire résidente');
          return send(200, 'text/plain; version=0.0.4', metrics.render());
        }
        return send(404, 'text/plain', 'not found');
      });
      return new Promise((resolve) => server.listen(port, host, () => { log.info('serveur d\'exploitation en écoute', { host, port, routes: ['/healthz', '/readyz', '/metrics'] }); resolve(server); }));
    },
  };
  return ops;
}

module.exports = { createOps, createLogger, Metrics };
