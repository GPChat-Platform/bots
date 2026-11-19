'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { GPChatBot, GPChatError, verifyWebhookSignature, webhookMiddleware, button } = require('..');

const sign = (body, secret, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

const fakeFetch = (responses) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    return { ok: r.status < 400, status: r.status, headers: { get: () => null }, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
};

test('signature : valide, falsifiée, expirée, secret erroné', () => {
  const body = '{"type":"ping"}';
  assert.equal(verifyWebhookSignature(body, sign(body, 's3cret'), 's3cret'), true);
  assert.equal(verifyWebhookSignature(body + ' ', sign(body, 's3cret'), 's3cret'), false);
  assert.equal(verifyWebhookSignature(body, sign(body, 'autre'), 's3cret'), false);
  assert.equal(verifyWebhookSignature(body, sign(body, 's3cret', 1000), 's3cret'), false);
  assert.equal(verifyWebhookSignature(body, undefined, 's3cret'), false);
  assert.equal(verifyWebhookSignature(body, 't=abc,v1=zz', 's3cret'), false);
});

test('signature : rotation (deux v1) acceptée avec l\'un OU l\'autre secret', () => {
  const body = '{"a":1}';
  const t = Math.floor(Date.now() / 1000);
  const h = (s) => crypto.createHmac('sha256', s).update(`${t}.${body}`).digest('hex');
  const header = `t=${t},v1=${h('nouveau')},v1=${h('ancien')}`;
  assert.equal(verifyWebhookSignature(body, header, 'nouveau'), true);
  assert.equal(verifyWebhookSignature(body, header, 'ancien'), true);
  assert.equal(verifyWebhookSignature(body, header, 'inconnu'), false);
  assert.equal(verifyWebhookSignature(body, header, ['inconnu', 'ancien']), true);
});

test('sendMessage : corps, en-tête d\'autorisation, Markdown et boutons', async () => {
  const f = fakeFetch([{ status: 201, body: { status: 'success', data: { msgId: 'm1' } } }]);
  const bot = new GPChatBot({ apiKey: 'gpk_live_x', fetch: f });
  const r = await bot.sendMessage('u1', '**oui**', { markdown: true, buttons: [[button.callback('Oui', 'v:1'), button.link('Site', 'https://example.com')]] });
  assert.deepEqual(r, { msgId: 'm1' });
  assert.equal(f.calls[0].url, 'https://api.gpchat.app/v1/messages');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer gpk_live_x');
  const sent = JSON.parse(f.calls[0].init.body);
  assert.equal(sent.parseMode, 'markdown');
  assert.equal(sent.buttons[0][1].url, 'https://example.com');
  assert.equal(sent.to, 'u1');
});

test('erreurs API : GPChatError avec statut et code, sans nouvel essai sur 4xx', async () => {
  const f = fakeFetch([{ status: 403, body: { status: 'error', code: 'permission-denied', message: 'Interdit' } }]);
  const bot = new GPChatBot({ apiKey: 'k', fetch: f });
  await assert.rejects(bot.sendMessage('u', 'x'), (e) => e instanceof GPChatError && e.status === 403 && e.code === 'permission-denied');
  assert.equal(f.calls.length, 1);
});

test('429 : un nouvel essai puis succès', async () => {
  const f = fakeFetch([{ status: 429, body: {} }, { status: 201, body: { data: { msgId: 'm2' } } }]);
  const bot = new GPChatBot({ apiKey: 'k', fetch: f, maxRetries: 1 });
  const realTimeout = global.setTimeout;
  global.setTimeout = (fn) => realTimeout(fn, 0); // pas d'attente réelle
  try { assert.deepEqual(await bot.sendMessage('u', 'x'), { msgId: 'm2' }); } finally { global.setTimeout = realTimeout; }
  assert.equal(f.calls.length, 2);
});

test('edit / delete / chat action / getUpdates visent les bonnes routes', async () => {
  const f = fakeFetch([1, 2, 3, 4].map(() => ({ status: 200, body: { data: { updates: [], hasMore: false } } })));
  const bot = new GPChatBot({ apiKey: 'k', fetch: f });
  await bot.editMessage('u1', 'm1', { buttons: null });
  await bot.deleteMessage({ groupId: 'g1' }, 'm2');
  await bot.sendChatAction('u1', 'typing', 1);
  await bot.getUpdates({ ack: ['e1'], timeout: 0 });
  assert.deepEqual(f.calls.map((c) => c.url.replace('https://api.gpchat.app/v1', '')), ['/messages/edit', '/messages/delete', '/chat/action', '/updates']);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { to: 'u1', msgId: 'm1', buttons: null });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { groupId: 'g1', msgId: 'm2' });
});

test('poll : acquitte seulement les événements traités sans erreur', async () => {
  const batches = [
    { updates: [{ id: 'a' }, { id: 'b' }], hasMore: false },
    { updates: [], hasMore: false },
  ];
  const sentAcks = [];
  let stop;
  const bot = new GPChatBot({ apiKey: 'k' });
  bot.getUpdates = async ({ ack }) => {
    sentAcks.push(ack);
    const next = batches.shift();
    if (!next) { stop(); return { updates: [], hasMore: false }; }
    return next;
  };
  const errors = [];
  stop = bot.poll(async (u) => { if (u.id === 'b') throw new Error('boom'); }, { timeout: 20, busyPollMs: 5, onError: (e) => errors.push(e.message) });
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(sentAcks.flat(), ['a'], 'seul « a » est acquitté');
  assert.deepEqual(errors, ['boom']);
});

/** Simule l'API : `pending` = événements non acquittés, redonnés à chaque appel tant qu'ils ne sont pas acquittés. */
function fakeUpdatesApi(events) {
  const pending = new Map(events.map((e) => [e.id, e]));
  const calls = [];
  return {
    pending, calls,
    getUpdates: async ({ ack = [], limit = 50 }) => {
      calls.push({ ack: [...ack] });
      ack.forEach((id) => pending.delete(id));
      return { updates: [...pending.values()].slice(0, limit), hasMore: false };
    },
  };
}

test('poll : conversations traitées en parallèle, ordre conservé dans chaque conversation', async () => {
  const events = [];
  for (let u = 0; u < 4; u += 1) for (let n = 0; n < 3; n += 1) events.push({ id: `u${u}-${n}`, type: 'message.received', data: { chatId: `u${u}` } });
  const api = fakeUpdatesApi(events);
  const bot = new GPChatBot({ apiKey: 'k' });
  bot.getUpdates = api.getUpdates;
  const order = {};
  let running = 0;
  let maxRunning = 0;
  const stop = bot.poll(async (u) => {
    running += 1; maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 30));
    (order[u.data.chatId] ||= []).push(u.id);
    running -= 1;
  }, { concurrency: 4, busyPollMs: 5, timeout: 0, idleDelayMs: 5 });
  const t0 = Date.now();
  while (api.pending.size && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 10));
  stop();
  assert.equal(api.pending.size, 0, 'tout est acquitté');
  assert.ok(maxRunning >= 3, `parallélisme effectif (max ${maxRunning})`);
  for (let u = 0; u < 4; u += 1) assert.deepEqual(order[`u${u}`], [`u${u}-0`, `u${u}-1`, `u${u}-2`], 'ordre par conversation');
  assert.ok(Date.now() - t0 < 600, 'nettement plus rapide que 12 × 30 ms en série');
});

test('poll : un événement redonné pendant son traitement n\'est pas traité deux fois', async () => {
  const api = fakeUpdatesApi([{ id: 'x', data: { chatId: 'c' } }]);
  const bot = new GPChatBot({ apiKey: 'k' });
  bot.getUpdates = api.getUpdates;
  let count = 0;
  const stop = bot.poll(async () => { count += 1; await new Promise((r) => setTimeout(r, 60)); }, { busyPollMs: 5, timeout: 0, idleDelayMs: 5 });
  const t0 = Date.now();
  while (api.pending.size && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 10));
  stop();
  assert.equal(count, 1);
  assert.ok(api.calls.length >= 3, 'la boucle a bien interrogé l\'API pendant le traitement');
});

test('middleware Express : refuse une signature invalide, expose l\'événement sinon', () => {
  const body = Buffer.from('{"type":"message.received","data":{}}');
  const mw = webhookMiddleware('s');
  const mkRes = () => { const r = { code: 0, status(c) { r.code = c; return r; }, send() { return r; } }; return r; };
  const bad = mkRes(); let called = false;
  mw({ body, get: () => 'x' }, bad, () => { called = true; });
  assert.equal(bad.code, 401); assert.equal(called, false);
  const req = { body, get: () => sign(body.toString(), 's') };
  mw(req, mkRes(), () => { called = true; });
  assert.equal(called, true); assert.equal(req.gpchatEvent.type, 'message.received');
});
