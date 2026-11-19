'use strict';
// Serveur HTTP : reçoit les webhooks externes (POST /hook/<jeton>) et les poste dans le groupe GPChat lié.
// Et gestion des commandes du bot (/connecter, /etat, /revoquer, /test) via polling GPChat.
const http = require('node:http');
const crypto = require('node:crypto');
const { format } = require('./formatters');

const MAX_BODY = 256 * 1024;
const PER_MIN = 30; // alertes par minute et par jeton (anti-inondation)

function newToken() { return crypto.randomBytes(18).toString('base64url'); }
function sign256(secret, raw) { return `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`; }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Registre jeton → groupe (fichier JSON via `store`, objet { hooks: {token: {...}} }). */
class Hooks {
  constructor(store, now = Date.now) { this.store = store; this.now = now; this.counters = new Map(); }
  create(groupId, userId) {
    const token = newToken(); const secret = crypto.randomBytes(16).toString('hex');
    this.store.data.hooks[token] = { groupId, createdBy: userId, secret, createdAt: this.now() };
    this.store.save();
    return { token, secret };
  }
  get(token) { return this.store.data.hooks[token] || null; }
  forGroup(groupId) { return Object.entries(this.store.data.hooks).filter(([, h]) => h.groupId === groupId).map(([token, h]) => ({ token, ...h })); }
  revoke(token, userId) {
    const h = this.get(token);
    if (!h || h.createdBy !== userId) return false;
    delete this.store.data.hooks[token]; this.store.save(); return true;
  }
  allow(token) {
    const minute = Math.floor(this.now() / 60000); const c = this.counters.get(token);
    if (!c || c.minute !== minute) { this.counters.set(token, { minute, n: 1 }); return true; }
    c.n += 1; return c.n <= PER_MIN;
  }
}

function createServer({ bot, hooks, ops }) {
  const count = (result, source) => ops && ops.metrics.inc('webhook_deliveries_total', { result, source }, 1, 'Webhooks entrants reçus');
  return http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true });
    const m = /^\/hook\/([A-Za-z0-9_-]{16,64})$/.exec((req.url || '').split('?')[0]);
    if (req.method !== 'POST' || !m) return send(404, { error: 'not found' });
    const hook = hooks.get(m[1]);
    if (!hook) return send(404, { error: 'unknown hook' });

    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { send(413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
    req.on('end', async () => {
      if (size > MAX_BODY) return undefined;
      const raw = Buffer.concat(chunks);
      // Signature GitHub : si l'expéditeur en envoie une, elle doit être valide pour le secret de ce hook.
      const sig = req.headers['x-hub-signature-256'];
      if (sig && !safeEqual(sig, sign256(hook.secret, raw))) { count('bad_signature', 'github'); return send(401, { error: 'bad signature' }); }
      let body;
      try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { return send(400, { error: 'invalid json' }); }
      const msg = format(req.headers, body);
      if (!msg) { count('ignored', req.headers['x-github-event'] ? 'github' : 'other'); return send(202, { ignored: true }); }
      if (!hooks.allow(m[1])) { count('rate_limited', 'other'); return send(429, { error: 'rate limited' }); }
      try {
        await bot.sendGroupMessage(hook.groupId, msg.text, { markdown: true, buttons: msg.buttons });
        count('delivered', req.headers['x-github-event'] ? 'github' : 'other');
        return send(200, { ok: true });
      } catch (e) {
        count('delivery_failed', 'other');
        if (ops) ops.log.error('livraison GPChat échouée', { error: e.message, status: e.status });
        return send(502, { error: 'gpchat delivery failed' });
      }
    });
    return undefined;
  });
}

/** Commandes du bot dans les groupes. */
function createCommands({ bot, hooks, publicUrl }) {
  const say = (groupId, text) => bot.sendGroupMessage(groupId, text, { markdown: true });
  return async function handle(update) {
    if (update.type !== 'group_message.received') {
      if (update.type === 'message.received' && update.data && update.data.chatId) {
        await bot.sendMessage(update.data.chatId, 'Ajoutez-moi à un groupe, puis envoyez `/connecter` dans ce groupe pour obtenir l\'adresse du webhook.', { markdown: true });
      }
      return;
    }
    const d = update.data; const text = String(d.textMsg || '').trim();
    const m = /^\/([a-z_]+)(?:@\w+)?\s*(.*)$/i.exec(text);
    if (!m) return;
    const cmd = m[1].toLowerCase(); const arg = m[2].trim();
    if (cmd === 'connecter' || cmd === 'connect') {
      const { token, secret } = hooks.create(d.groupId, d.from);
      return say(d.groupId,
        `🔗 **Webhook créé pour ce groupe**\n\nAdresse : \`${publicUrl}/hook/${token}\`\nSecret (GitHub, facultatif) : \`${secret}\`\n\n` +
        '• **GitHub** : Settings → Webhooks → *Add webhook*, type `application/json`, collez l\'adresse et le secret.\n' +
        '• **Uptime Kuma** : notification de type *Webhook* (JSON).\n' +
        '• **Autre outil** : `POST` JSON `{ "title": "…", "message": "…", "level": "error|warning|ok|info", "url": "https://…" }`.\n\n' +
        '⚠️ Gardez cette adresse secrète : quiconque la possède peut écrire dans ce groupe. `/revoquer` pour la supprimer.');
    }
    if (cmd === 'etat' || cmd === 'status') {
      const list = hooks.forGroup(d.groupId);
      return say(d.groupId, list.length ? `🔗 ${list.length} webhook(s) actif(s) pour ce groupe.` : 'Aucun webhook pour ce groupe. Envoyez `/connecter`.');
    }
    if (cmd === 'revoquer' || cmd === 'revoke') {
      const mine = hooks.forGroup(d.groupId).filter((h) => h.createdBy === d.from);
      mine.forEach((h) => hooks.revoke(h.token, d.from));
      return say(d.groupId, mine.length ? `🗑️ ${mine.length} webhook(s) supprimé(s).` : 'Vous n\'avez créé aucun webhook dans ce groupe.');
    }
    if (cmd === 'test') {
      return say(d.groupId, '✅ Test réussi : le bot peut écrire dans ce groupe.');
    }
    if (cmd === 'aide' || cmd === 'help' || cmd === 'start') {
      return say(d.groupId, '**Dev Alerts** — reçoit les alertes de vos outils et les poste ici.\n`/connecter` · `/etat` · `/revoquer` · `/test`\nCode libre : https://github.com/GPChat-Platform/bots');
    }
    void arg;
  };
}

module.exports = { createServer, createCommands, Hooks, sign256, newToken };
