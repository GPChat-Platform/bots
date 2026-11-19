'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { format } = require('../src/formatters');
const { createServer, createCommands, Hooks, sign256 } = require('../src/server');

const memStore = () => ({ data: { hooks: {} }, save() {} });

test('GitHub : push, PR fusionnée, workflow en échec, ping, événements ignorés', () => {
  const push = format({ 'x-github-event': 'push' }, { ref: 'refs/heads/main', repository: { full_name: 'org/app' }, sender: { login: 'boris' }, commits: [{ message: 'fix: bug' }, { message: 'feat: x' }], compare: 'https://github.com/org/app/compare/a...b' });
  assert.match(push.text, /2 commits sur `main`/);
  assert.equal(push.buttons[0][0].url, 'https://github.com/org/app/compare/a...b');
  const pr = format({ 'x-github-event': 'pull_request' }, { action: 'closed', pull_request: { number: 7, title: 'Ajoute X', merged: true, html_url: 'https://github.com/o/r/pull/7' }, repository: { full_name: 'o/r' }, sender: { login: 'a' } });
  assert.match(pr.text, /fusionnée/);
  const wf = format({ 'x-github-event': 'workflow_run' }, { action: 'completed', workflow_run: { name: 'CI', conclusion: 'failure', head_branch: 'dev', html_url: 'https://github.com/o/r/actions/runs/1' }, repository: { full_name: 'o/r' } });
  assert.match(wf.text, /❌.*en échec/);
  assert.match(format({ 'x-github-event': 'ping' }, { repository: { full_name: 'o/r' } }).text, /connecté/);
  assert.equal(format({ 'x-github-event': 'star' }, {}), null);
  assert.equal(format({ 'x-github-event': 'workflow_run' }, { action: 'requested', workflow_run: {} }), null);
});

test('Uptime Kuma et format libre ; lien non-https retiré', () => {
  assert.match(format({}, { heartbeat: { status: 0 }, monitor: { name: 'API' }, msg: 'timeout' }).text, /🔴 \*\*API\*\* est HORS LIGNE/);
  assert.match(format({}, { heartbeat: { status: 1 }, monitor: { name: 'API' } }).text, /🟢/);
  const g = format({}, { title: 'Déploiement', message: 'v1.2 en prod', level: 'ok', url: 'http://pas-https.example' });
  assert.match(g.text, /🟢 \*\*Déploiement\*\*/);
  assert.equal(g.buttons, undefined);
  assert.equal(format({}, {}), null);
});

async function boot(botOver = {}) {
  const sent = [];
  const bot = { sendGroupMessage: async (g, text, o) => { sent.push({ g, text, o }); }, sendMessage: async () => {}, ...botOver };
  let t = 60000 * 100;
  const hooks = new Hooks(memStore(), () => t);
  const server = createServer({ bot, hooks });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { sent, hooks, base, server, close: () => server.close(), tick: (ms) => { t += ms; } };
}

test('serveur : jeton inconnu 404, signature GitHub vérifiée, message posté dans le bon groupe', async () => {
  const s = await boot();
  const { token, secret } = s.hooks.create('G1', 'u1');
  assert.equal((await fetch(`${s.base}/hook/${'x'.repeat(24)}`, { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);

  const body = JSON.stringify({ title: 'Alerte', message: 'CPU 98 %', level: 'warning' });
  const bad = await fetch(`${s.base}/hook/${token}`, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=00' } });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${s.base}/hook/${token}`, { method: 'POST', body, headers: { 'x-hub-signature-256': sign256(secret, body) } });
  assert.equal(ok.status, 200);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].g, 'G1');
  assert.match(s.sent[0].text, /🟠 \*\*Alerte\*\*/);
  // sans signature : accepté (jeton secret dans l'URL)
  assert.equal((await fetch(`${s.base}/hook/${token}`, { method: 'POST', body })).status, 200);
  // JSON invalide / événement ignoré
  assert.equal((await fetch(`${s.base}/hook/${token}`, { method: 'POST', body: 'pas du json' })).status, 400);
  assert.equal((await fetch(`${s.base}/hook/${token}`, { method: 'POST', body: '{}' })).status, 202);
  s.close();
});

test('serveur : limite par jeton et échec de livraison GPChat = 502', async () => {
  const s = await boot();
  const { token } = s.hooks.create('G1', 'u1');
  const post = () => fetch(`${s.base}/hook/${token}`, { method: 'POST', body: JSON.stringify({ message: 'x' }) });
  let last;
  for (let i = 0; i < 31; i += 1) last = await post();
  assert.equal(last.status, 429);
  s.tick(61000);
  assert.equal((await post()).status, 200);
  s.close();

  const f = await boot({ sendGroupMessage: async () => { throw new Error('GPChat 500'); } });
  const h = f.hooks.create('G2', 'u1');
  assert.equal((await fetch(`${f.base}/hook/${h.token}`, { method: 'POST', body: JSON.stringify({ message: 'x' }) })).status, 502);
  f.close();
});

test('serveur : corps trop gros refusé', async () => {
  const s = await boot();
  const { token } = s.hooks.create('G1', 'u1');
  let status;
  try { status = (await fetch(`${s.base}/hook/${token}`, { method: 'POST', body: 'x'.repeat(300 * 1024) })).status; } catch { status = 'reset'; }
  assert.ok(status === 413 || status === 'reset');
  s.close();
});

test('commandes : /connecter crée un hook, /etat, /revoquer (créateur seulement)', async () => {
  const sent = [];
  const bot = { sendGroupMessage: async (g, text) => sent.push({ g, text }), sendMessage: async (to, text) => sent.push({ to, text }) };
  const hooks = new Hooks(memStore());
  const handle = createCommands({ bot, hooks, publicUrl: 'https://alertes.example.com' });
  const g = (from, textMsg) => handle({ type: 'group_message.received', data: { from, groupId: 'G1', textMsg } });
  await g('u1', '/connecter');
  assert.match(sent[0].text, /https:\/\/alertes\.example\.com\/hook\/[A-Za-z0-9_-]{20,}/);
  assert.equal(hooks.forGroup('G1').length, 1);
  await g('u2', '/revoquer');
  assert.match(sent.at(-1).text, /aucun webhook/);
  assert.equal(hooks.forGroup('G1').length, 1);
  await g('u1', '/etat');
  assert.match(sent.at(-1).text, /1 webhook/);
  await g('u1', '/revoquer');
  assert.match(sent.at(-1).text, /1 webhook\(s\) supprimé/);
  assert.equal(hooks.forGroup('G1').length, 0);
  await g('u1', 'bonjour tout le monde');
  const n = sent.length;
  await handle({ type: 'message.received', data: { chatId: 'u1', from: 'u1', textMsg: 'salut' } });
  assert.equal(sent.length, n + 1);
});
