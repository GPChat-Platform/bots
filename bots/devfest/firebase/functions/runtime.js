'use strict';
/**
 * Exécution du Guide DevFest en environnement « sans état » (Firebase Functions, Cloud Run…).
 * La logique métier (src/handlers.js) est la même qu'en Docker ; ici on branche un stockage distant :
 *
 *   db.getUser(id)            → préférences de l'utilisateur ou null
 *   db.setUser(id, data)      → enregistre
 *   db.allUserIds()           → tous les identifiants (annonces)
 *   db.enqueueBroadcast(text, fromUserId, lang, ids) → met l'annonce en file (lots traités par un déclencheur)
 *   db.usersWithReminders()   → [{ id, data }] des utilisateurs ayant un rappel (déclencheur planifié)
 *   db.markSeen(eventId)      → true la première fois, false si l'événement a déjà été traité (dédoublonnage)
 *
 * Le gestionnaire de messages attend un « store » synchrone : on charge les utilisateurs concernés AVANT l'appel
 * et on enregistre ceux qui ont changé APRÈS. Aucun état n'est gardé entre deux invocations.
 */
const { createHandler } = require('./lib/handlers');
const { ignoreOtherBotsCommands } = require('./lib/gpchat-bot');

function createRuntime({ db, bot, program, admins = [], log = { error() {}, warn() {}, info() {} }, now = Date.now, throttleMs = 100 }) {
  /** Store synchrone pour UNE invocation, pré-rempli avec les utilisateurs donnés. */
  function makeStore(users) {
    const store = {
      data: { users: { ...users } },
      throttleMs,
      save() {},
      user(id) {
        if (!store.data.users[id]) store.data.users[id] = { lang: 'fr', reminders: [], sent: [] };
        return store.data.users[id];
      },
    };
    return store;
  }

  async function persistChanged(store, before) {
    for (const [id, data] of Object.entries(store.data.users)) {
      if (JSON.stringify(data) !== before[id]) await db.setUser(id, data);
    }
  }
  const snapshot = (users) => Object.fromEntries(Object.entries(users).map(([id, d]) => [id, JSON.stringify(d)]));

  /** Un événement GPChat (webhook). Ne lève jamais : les erreurs sont journalisées. */
  async function handleEvent(update) {
    const d = (update && update.data) || {};
    const eventId = d.msgId ? `${update.type}:${d.msgId}` : null;
    if (eventId && !(await db.markSeen(eventId))) return { duplicate: true };
    const users = {};
    const ids = new Set([d.from].filter(Boolean));
    for (const id of ids) {
      const u = await db.getUser(id);
      if (u) users[id] = u;
    }
    const store = makeStore(users);
    const before = snapshot(store.data.users);
    // Annonce : la liste des destinataires est lue au moment de l'envoi et mise en file (jamais envoyée dans la requête).
    const broadcast = async (text, fromUserId, lang) => {
      const all = await db.allUserIds();
      await db.enqueueBroadcast(text, fromUserId, lang, all);
      return all.length;
    };
    const { handle } = createHandler({ bot, program, store, admins, now, log, broadcast });
    // En groupe, « /commande@autre_bot » ne concerne pas ce bot.
    await ignoreOtherBotsCommands(handle, process.env.BOT_USERNAME || 'devfest_guide_bot')(update);
    await persistChanged(store, before);
    return { duplicate: false };
  }

  /** À appeler chaque minute : envoie les rappels « 10 minutes avant ». */
  async function tick() {
    const rows = await db.usersWithReminders();
    const users = Object.fromEntries(rows.map((r) => [r.id, r.data]));
    const store = makeStore(users);
    const before = snapshot(store.data.users);
    const { tick: run } = createHandler({ bot, program, store, admins, now, log });
    await run();
    await persistChanged(store, before);
  }

  return { handleEvent, tick };
}

/**
 * Envoi d'un lot d'annonce (déclencheur sur chaque document de lot) : quelques envois en parallèle,
 * résultat renvoyé pour mise à jour des compteurs. Ne lève jamais.
 */
async function sendBatch({ bot, text, recipients, parallel = 5 }) {
  let sent = 0;
  let failed = 0;
  const queue = [...recipients];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try { await bot.sendMessage(id, text); sent += 1; } catch { failed += 1; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, recipients.length) }, worker));
  return { sent, failed };
}

module.exports = { createRuntime, sendBatch };
