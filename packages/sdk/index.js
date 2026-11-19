'use strict';
/**
 * SDK GPChat pour Node.js ≥ 18 — aucune dépendance.
 *
 *   const { GPChatBot, verifyWebhookSignature } = require('@gpchat/bot');
 *   const bot = new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY });
 *   await bot.sendMessage(userId, 'Bonjour **monde**', { markdown: true });
 *   bot.poll(async (event) => { ... });   // mode polling, ou recevez des webhooks et vérifiez-les.
 */
const crypto = require('node:crypto');

const DEFAULT_BASE_URL = 'https://api.gpchat.app/v1';

class GPChatError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'GPChatError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Vérifie l'en-tête X-GPChat-Signature (`t=…,v1=…[,v1=…]`) sur le corps BRUT de la requête.
 * Plusieurs `v1=` peuvent coexister pendant une rotation de secret : une seule doit correspondre.
 * @param {string|Buffer} rawBody corps exact reçu (avant JSON.parse)
 * @param {string|undefined} header valeur de X-GPChat-Signature
 * @param {string|string[]} secret secret du webhook (ou liste de secrets acceptés)
 * @param {{ toleranceSeconds?: number, now?: number }} [options]
 */
function verifyWebhookSignature(rawBody, header, secret, options = {}) {
  const tolerance = options.toleranceSeconds ?? 300;
  const match = /^t=(\d+)((?:,v1=[0-9a-f]{64})+)$/.exec(header || '');
  if (!match) return false;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(match[1])) > tolerance) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const provided = match[2].split(',').filter(Boolean).map((p) => Buffer.from(p.slice(3), 'hex'));
  const secrets = Array.isArray(secret) ? secret : [secret];
  return secrets.some((s) => {
    const expected = crypto.createHmac('sha256', s).update(`${match[1]}.${body}`, 'utf8').digest();
    return provided.some((p) => p.length === expected.length && crypto.timingSafeEqual(p, expected));
  });
}

/** Construit les lignes de boutons attendues par l'API à partir d'un tableau plat ou de lignes. */
const button = {
  callback: (text, callbackData) => ({ text, callbackData }),
  link: (text, url) => ({ text, url }),
};

class GPChatBot {
  /**
   * @param {{ apiKey: string, baseUrl?: string, fetch?: typeof fetch, timeoutMs?: number, maxRetries?: number }} options
   */
  constructor(options) {
    if (!options || !options.apiKey) throw new TypeError('apiKey est requis');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 2;
    if (typeof this.fetch !== 'function') throw new Error('fetch indisponible : Node.js 18+ requis (ou passez options.fetch)');
  }

  async request(method, path, { body, query, timeoutMs } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
      try {
        const res = await this.fetch(url, {
          method,
          headers: { Authorization: `Bearer ${this.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) return json.data ?? json;
        // 429 et 5xx : nouvel essai avec repli, en respectant Retry-After s'il est fourni.
        if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
          const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          await new Promise((r) => setTimeout(r, (retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt)));
          attempt++;
          continue;
        }
        throw new GPChatError(json.message || `HTTP ${res.status}`, { status: res.status, code: json.code, details: json.details });
      } catch (err) {
        if (err instanceof GPChatError) throw err;
        if (attempt < this.maxRetries) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); attempt++; continue; }
        throw new GPChatError(err.name === 'AbortError' ? 'Délai dépassé' : err.message, { code: 'network' });
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /** Message texte privé. options : { markdown, buttons, replyToMsgId } */
  sendMessage(to, content, options = {}) {
    return this.request('POST', '/messages', { body: this._textBody({ to }, content, options) });
  }

  /** Message de groupe. options : { markdown, buttons, replyToMsgId, mentionedUserIds } */
  sendGroupMessage(groupId, content, options = {}) {
    return this.request('POST', '/messages/group', { body: { ...this._textBody({ groupId }, content, options), mentionedUserIds: options.mentionedUserIds } });
  }

  /** Autres types (image, video, audio, doc, gif, sticker, location, …) : passez le corps de l'API tel quel. */
  send(body) {
    return this.request('POST', body.groupId ? '/messages/group' : '/messages', { body });
  }

  /** Modifie un de vos messages. patch : { content?, caption?, buttons? (null = retirer) } */
  editMessage(target, msgId, patch) {
    return this.request('POST', '/messages/edit', { body: { ...this._target(target), msgId, ...patch } });
  }

  deleteMessage(target, msgId) {
    return this.request('POST', '/messages/delete', { body: { ...this._target(target), msgId } });
  }

  /** Affiche « écrit… » ; l'appel dure `seconds` (1-10). */
  sendChatAction(to, action = 'typing', seconds = 5) {
    return this.request('POST', '/chat/action', { body: { to, action, seconds }, timeoutMs: (seconds + 30) * 1000 });
  }

  /** Mode polling : { updates, hasMore }. `ack` = identifiants déjà traités. */
  getUpdates({ ack, limit, timeout = 0 } = {}) {
    return this.request('POST', '/updates', { body: { ack, limit, timeout }, timeoutMs: (timeout + 30) * 1000 });
  }

  /**
   * Boucle de polling : appelle `handler(update)` pour chaque événement et l'acquitte seulement
   * s'il se termine sans erreur (sinon il vous est renvoyé). Retourne une fonction d'arrêt.
   */
  poll(handler, { timeout = 20, limit = 50, onError = (e) => console.error('[gpchat] polling :', e.message), idleDelayMs = 1000 } = {}) {
    let stopped = false;
    let ack = [];
    const loop = async () => {
      while (!stopped) {
        try {
          const { updates } = await this.getUpdates({ ack, limit, timeout });
          ack = [];
          for (const update of updates) {
            try { await handler(update); ack.push(update.id); } catch (err) { onError(err); }
          }
          if (updates.length === 0 && timeout === 0) await new Promise((r) => setTimeout(r, idleDelayMs));
        } catch (err) {
          onError(err);
          await new Promise((r) => setTimeout(r, Math.max(idleDelayMs, 3000)));
        }
      }
    };
    loop();
    return () => { stopped = true; };
  }

  _target(target) {
    return typeof target === 'string' ? { to: target } : target;
  }

  _textBody(base, content, options) {
    return {
      ...base,
      type: 'text',
      content,
      parseMode: options.markdown ? 'markdown' : undefined,
      buttons: options.buttons,
      replyToMsgId: options.replyToMsgId,
    };
  }
}

/**
 * Middleware Express : vérifie la signature puis expose `req.gpchatEvent`.
 * IMPORTANT : montez-le AVANT express.json() avec express.raw({ type: 'application/json' }).
 */
function webhookMiddleware(secret, options = {}) {
  return (req, res, next) => {
    const raw = req.body;
    if (!Buffer.isBuffer(raw) && typeof raw !== 'string') {
      res.status(500).send('Utilisez express.raw({ type: "application/json" }) avant le middleware GPChat');
      return;
    }
    if (!verifyWebhookSignature(raw, req.get('X-GPChat-Signature'), secret, options)) {
      res.status(401).send('Signature invalide');
      return;
    }
    try { req.gpchatEvent = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw); } catch { res.status(400).send('JSON invalide'); return; }
    next();
  };
}

module.exports = { GPChatBot, GPChatError, verifyWebhookSignature, webhookMiddleware, button, DEFAULT_BASE_URL };
