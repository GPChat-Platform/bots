'use strict';
/**
 * Exécution du Guide DevFest en environnement « sans état » (Firebase Functions, Cloud Run…).
 * La logique métier (src/handlers.js) est la même qu'en Docker ; ici on branche un stockage distant :
 *
 *   db.getUser(id)            → préférences de l'utilisateur ou null
 *   db.setUser(id, data)      → enregistre
 *   db.allUserIds()           → tous les identifiants (annonces)
 *   db.usersWithReminders()   → [{ id, data }] des utilisateurs ayant un rappel (déclencheur planifié)
 *   db.markSeen(eventId)      → true la première fois, false si l'événement a déjà été traité (dédoublonnage)
 *
 * Le gestionnaire de messages attend un « store » synchrone : on charge les utilisateurs concernés AVANT l'appel
 * et on enregistre ceux qui ont changé APRÈS. Aucun état n'est gardé entre deux invocations.
 */
const { createHandler } = require('./lib/handlers');

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
    const isAnnounce = /^\/(annonce|announce)\b/i.test(String(d.textMsg || ''));
    if (isAnnounce) for (const id of await db.allUserIds()) ids.add(id);
    for (const id of ids) {
      const u = await db.getUser(id);
      if (u) users[id] = u;
    }
    const store = makeStore(users);
    const before = snapshot(store.data.users);
    const { handle } = createHandler({ bot, program, store, admins, now, log });
    await handle(update);
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

module.exports = { createRuntime };
