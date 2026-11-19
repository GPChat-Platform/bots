'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOps, createLogger, Metrics } = require('..');

test('logger : JSON avec service et champs, niveaux respectés', () => {
  const lines = [];
  const out = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
  const log = createLogger({ service: 'x', level: 'warn', json: true, out, now: () => new Date('2026-11-28T09:00:00Z') });
  log.info('ignoré');
  log.error('boum', { code: 7 });
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { t: '2026-11-28T09:00:00.000Z', level: 'error', service: 'x', msg: 'boum', code: 7 });
});

test('métriques : format Prometheus avec étiquettes, résumé et échappement', () => {
  const m = new Metrics('gpchat_bot');
  m.inc('events_total', { type: 'message.received', result: 'ok' }, 2, 'Événements');
  m.inc('events_total', { type: 'message.received', result: 'ok' });
  m.set('uptime_seconds', 5);
  m.observe('d_seconds', 0.5, { t: 'a"b' });
  const text = m.render();
  assert.match(text, /# HELP gpchat_bot_events_total Événements/);
  assert.match(text, /# TYPE gpchat_bot_events_total counter/);
  assert.match(text, /gpchat_bot_events_total\{result="ok",type="message.received"\} 3/);
  assert.match(text, /gpchat_bot_uptime_seconds 5/);
  assert.match(text, /gpchat_bot_d_seconds_sum\{t="a_b"\} 0.5/);
  assert.match(text, /gpchat_bot_d_seconds_count\{t="a_b"\} 1/);
});

test('instrumentHandler : compte ok/erreur, journalise, ne propage jamais', async () => {
  const lines = [];
  const ops = createOps({ service: 't', out: { log: (l) => lines.push(l), error: (l) => lines.push(l) } });
  const h = ops.instrumentHandler(async (u) => { if (u.type === 'boom') throw new Error('KO'); });
  await h({ type: 'message.received' });
  await h({ type: 'boom' });
  const text = ops.metrics.render();
  assert.match(text, /events_total\{result="ok",type="message.received"\} 1/);
  assert.match(text, /events_total\{result="error",type="boom"\} 1/);
  assert.ok(lines.some((l) => /échec de traitement/.test(l) && /KO/.test(l)));
});

test('instrumentBot : appels, codes, 401/429 journalisés, polling frais', async () => {
  let t = 1_000_000;
  const lines = [];
  const ops = createOps({ service: 't', now: () => t, out: { log: (l) => lines.push(l), error: (l) => lines.push(l) } });
  const calls = [];
  const bot = {
    async request(method, path) {
      calls.push(path);
      if (path === '/messages') { const e = new Error('rate'); e.status = 429; throw e; }
      if (path === '/auth') { const e = new Error('nope'); e.status = 401; throw e; }
      return { ok: true };
    },
  };
  ops.instrumentBot(bot);
  ops.expectPolling();
  await bot.request('GET', '/updates?limit=1');
  await assert.rejects(bot.request('POST', '/messages'), /rate/);
  await assert.rejects(bot.request('POST', '/auth'), /nope/);
  const text = ops.metrics.render();
  assert.match(text, /api_requests_total\{route="\/updates",status="2xx"\} 1/);
  assert.match(text, /api_requests_total\{route="\/messages",status="4xx"\} 1/);
  assert.match(text, /last_poll_success_timestamp_seconds 1000/);
  assert.ok(lines.some((l) => /429/.test(l)));
  assert.ok(lines.some((l) => /401/.test(l)));
});

test('serveur : /healthz, /readyz (503 si polling périmé ou dépendance KO), /metrics', async () => {
  let t = 5_000_000;
  const ops = createOps({ service: 'svc', version: '9.9.9', now: () => t, staleAfterMs: 90_000, out: { log() {}, error() {} } });
  ops.expectPolling();
  let depOk = true;
  ops.addReadinessCheck('tmdb', () => depOk);
  const server = await ops.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
  depOk = false;
  const r = await fetch(`${base}/readyz`);
  assert.equal(r.status, 503);
  assert.deepEqual((await r.json()).problems.map((p) => p.name), ['tmdb']);
  depOk = true;
  t += 120_000;
  const stale = await fetch(`${base}/readyz`);
  assert.equal(stale.status, 503);
  assert.match((await stale.json()).problems[0].detail, /aucun polling réussi/);
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /gpchat_bot_uptime_seconds/);
  assert.match(metrics, /gpchat_bot_info\{node="v[\d.]+",service="svc",version="9.9.9"\} 1/);
  assert.equal((await fetch(`${base}/inconnu`)).status, 404);
  assert.equal((await fetch(`${base}/metrics`, { method: 'POST' })).status, 405);
  server.close();
});
