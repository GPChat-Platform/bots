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

  async request(method, path, { body, query, timeoutMs, retries } = {}) {
    const maxRetries = retries ?? this.maxRetries;
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
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          await new Promise((r) => setTimeout(r, (retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt)));
          attempt++;
          continue;
        }
        throw new GPChatError(json.message || `HTTP ${res.status}`, { status: res.status, code: json.code, details: json.details });
      } catch (err) {
        if (err instanceof GPChatError) throw err;
        if (attempt < maxRetries) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); attempt++; continue; }
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

  /**
   * Affiche « écrit… » ; l'appel dure `seconds` (1-10). Purement cosmétique : aucun nouvel essai
   * (sous forte charge, réessayer un indicateur de saisie ne ferait que consommer le quota).
   */
  sendChatAction(to, action = 'typing', seconds = 5) {
    return this.request('POST', '/chat/action', { body: { to, action, seconds }, timeoutMs: (seconds + 30) * 1000, retries: 0 });
  }

  /** Mode polling : { updates, hasMore }. `ack` = identifiants déjà traités. */
  getUpdates({ ack, limit, timeout = 0 } = {}) {
    return this.request('POST', '/updates', { body: { ack, limit, timeout }, timeoutMs: (timeout + 30) * 1000 });
  }

  /**
   * Boucle de polling : appelle `handler(update)` pour chaque événement et l'acquitte seulement
   * s'il se termine sans erreur (sinon il vous est renvoyé). Retourne une fonction d'arrêt.
   *
   * Traitement EN PARALLÈLE : jusqu'à `concurrency` conversations à la fois, mais toujours dans l'ordre
   * au sein d'une même conversation (même `chatId` / `groupId`). Un utilisateur lent (appel externe, IA…)
   * ne bloque donc plus les autres. Pendant qu'il reste des événements en cours, la boucle interroge l'API
   * en polling court (toutes les `busyPollMs`) pour acquitter vite et ne pas recevoir deux fois les mêmes.
   * `concurrency: 1` retrouve le comportement séquentiel.
   */
  poll(handler, {
    timeout = 20, limit = 50, concurrency = 8, busyPollMs = 1100, idleDelayMs = 1000, retryAfterMs = 30000,
    onError = (e) => console.error('[gpchat] polling :', e.message),
  } = {}) {
    let stopped = false;
    const toAck = [];
    const inFlight = new Set();
    const recentlyDone = new Map(); // id -> horodatage : réacquitte un doublon livré avant que l'acquittement n'arrive
    const failedAt = new Map(); // id -> horodatage : un événement en échec n'est réessayé qu'après `retryAfterMs`
    const chains = new Map(); // clé de conversation -> fin de la file de cette conversation
    let active = 0;
    const waiters = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const acquire = () => (active < concurrency ? (active += 1, Promise.resolve()) : new Promise((r) => waiters.push(r)));
    const release = () => { const next = waiters.shift(); if (next) next(); else active -= 1; };
    const keyOf = (u) => {
      const d = (u && u.data) || {};
      return d.groupId ? `g:${d.groupId}` : d.chatId ? `c:${d.chatId}` : d.from ? `u:${d.from}` : `e:${u.id}`;
    };

    const schedule = (update) => {
      inFlight.add(update.id);
      const key = keyOf(update);
      const prev = chains.get(key) || Promise.resolve();
      const run = prev.then(async () => {
        await acquire();
        try {
          await handler(update);
          toAck.push(update.id);
          recentlyDone.set(update.id, Date.now());
        } catch (err) {
          failedAt.set(update.id, Date.now());
          onError(err); // non acquitté : sera relivré (après retryAfterMs)
        } finally {
          release();
          inFlight.delete(update.id);
        }
      });
      chains.set(key, run);
      run.then(() => { if (chains.get(key) === run) chains.delete(key); });
    };

    const loop = async () => {
      while (!stopped) {
        try {
          const busy = inFlight.size > 0;
          const { updates } = await this.getUpdates({ ack: toAck.splice(0), limit, timeout: busy ? 0 : timeout });
          let fresh = 0;
          for (const update of updates) {
            if (inFlight.has(update.id)) continue; // déjà en cours
            if (recentlyDone.has(update.id)) { toAck.push(update.id); continue; } // acquittement pas encore reçu
            if (Date.now() - (failedAt.get(update.id) || 0) < retryAfterMs) continue; // échec récent : on patiente
            schedule(update);
            fresh += 1;
          }
          const cutoff = Date.now() - 5 * 60 * 1000;
          for (const [id, t] of recentlyDone) if (t < cutoff) recentlyDone.delete(id);
          for (const [id, t] of failedAt) if (t < cutoff) failedAt.delete(id);
          if (inFlight.size > 0 && fresh === 0) await sleep(busyPollMs); // rien de neuf : laisser avancer le traitement
          else if (fresh === 0 && updates.length > 0) await sleep(busyPollMs); // seulement des échecs récents en attente
          else if (updates.length === 0 && timeout === 0) await sleep(idleDelayMs);
        } catch (err) {
          onError(err);
          await sleep(Math.max(idleDelayMs, 3000));
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

/**
 * Commande adressée à un AUTRE bot (« /cmd@autre_bot ») ? Convention des groupes (comme Telegram) :
 * « /cmd@nom_du_bot » ne concerne que ce bot, « /cmd » tous les bots du groupe.
 * La plateforme ne remet déjà « /cmd@bot » qu'au bot visé ; ce contrôle est une protection de plus.
 */
function isAddressedToOtherBot(text, username) {
  const m = /^\/[A-Za-z0-9_]+@([A-Za-z0-9_]+)/.exec(String(text || '').trim());
  return Boolean(m && username && m[1].toLowerCase() !== String(username).replace(/^@/, '').toLowerCase());
}

/** Enveloppe un gestionnaire : les commandes de groupe adressées à un autre bot sont ignorées. */
function ignoreOtherBotsCommands(handler, username) {
  return async (update) => {
    const d = (update && update.data) || {};
    if (update && update.type === 'group_message.received' && isAddressedToOtherBot(d.textMsg, username)) return;
    return handler(update);
  };
}

module.exports = { GPChatBot, GPChatError, verifyWebhookSignature, webhookMiddleware, button, isAddressedToOtherBot, ignoreOtherBotsCommands, DEFAULT_BASE_URL };
