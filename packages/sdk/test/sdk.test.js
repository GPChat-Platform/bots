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
  stop = bot.poll(async (u) => { if (u.id === 'b') throw new Error('boom'); }, { timeout: 20, onError: (e) => errors.push(e.message) });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(sentAcks[1], ['a'], 'seul « a » est acquitté');
  assert.deepEqual(errors, ['boom']);
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
