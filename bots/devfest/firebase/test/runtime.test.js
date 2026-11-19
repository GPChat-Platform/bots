'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../build');

build();
const { createRuntime } = require('../functions/runtime');
const program = require('../functions/lib/program.json');

/** Base de données factice qui garde les utilisateurs en mémoire et compte les écritures. */
function fakeDb() {
  const users = new Map();
  const seen = new Set();
  const writes = [];
  const broadcasts = [];
  return {
    users, writes, broadcasts,
    enqueueBroadcast: async (text, fromUserId, lang, ids) => { broadcasts.push({ text, fromUserId, lang, ids: [...ids] }); return 'B1'; },
    getUser: async (id) => (users.has(id) ? JSON.parse(JSON.stringify(users.get(id))) : null),
    setUser: async (id, data) => { writes.push(id); users.set(id, JSON.parse(JSON.stringify(data))); },
    allUserIds: async () => [...users.keys()],
    usersWithReminders: async () => [...users].filter(([, u]) => (u.reminders || []).length).map(([id, data]) => ({ id, data: JSON.parse(JSON.stringify(data)) })),
    markSeen: async (id) => { if (seen.has(id)) return false; seen.add(id); return true; },
  };
}

function setup(nowIso = '2026-11-28T10:30:00+01:00', admins = []) {
  const sent = [];
  const bot = { sendMessage: async (to, text, o) => sent.push({ to, text, o }), sendGroupMessage: async (g, text, o) => sent.push({ g, text, o }) };
  const db = fakeDb();
  let now = Date.parse(nowIso);
  const rt = createRuntime({ db, bot, program, admins, now: () => now, throttleMs: 0 });
  const dm = (text, from = 'u1', msgId = `m${Math.random()}`) => rt.handleEvent({ type: 'message.received', data: { from, chatId: from, type: 'text', textMsg: text, msgId } });
  return { sent, db, rt, dm, setNow: (iso) => { now = Date.parse(iso); } };
}

test('webhook : une commande reçoit sa réponse', async () => {
  const { sent, dm } = setup();
  await dm('/programme');
  assert.match(sent[0].text, /Architecture résiliente/);
  await dm('/lieu');
  assert.match(sent[1].text, /Santa Barbara/);
});

test('préférences et rappels persistés entre deux invocations', async () => {
  const { sent, db, dm } = setup();
  await dm('/lang en');
  assert.equal(db.users.get('u1').lang, 'en');
  await dm('/schedule');
  assert.match(sent.at(-1).text, /subject to time changes/);
  await dm('/rappel android-3g');
  assert.deepEqual(db.users.get('u1').reminders, ['android-3g']);
});

test('dédoublonnage : un même msgId n\'est traité qu\'une fois', async () => {
  const { sent, dm } = setup();
  const r1 = await dm('/ping-inconnu', 'u1', 'M1');
  const r2 = await dm('/ping-inconnu', 'u1', 'M1');
  assert.equal(r1.duplicate, false);
  assert.equal(r2.duplicate, true);
  assert.equal(sent.length, 1);
});

test('rappels planifiés : envoyés une seule fois dans la fenêtre de 10 minutes', async () => {
  const s = setup('2026-11-28T13:30:00+01:00');
  await s.dm('/rappel android-3g');
  await s.rt.tick();
  const before = s.sent.length;
  s.setNow('2026-11-28T13:52:00+01:00');
  await s.rt.tick();
  assert.equal(s.sent.length, before + 1);
  assert.match(s.sent.at(-1).text, /Dans 10 minutes/);
  assert.deepEqual(s.db.users.get('u1').sent, ['android-3g']);
  await s.rt.tick();
  assert.equal(s.sent.length, before + 1, 'pas de doublon');
});

test('annonce : réservée aux organisateurs, diffusée à tous les utilisateurs connus', async () => {
  const s = setup('2026-11-28T10:30:00+01:00', ['admin1']);
  await s.dm('/start', 'a');
  await s.dm('/start', 'b');
  await s.dm('/annonce Salle Lab ouverte', 'a');
  assert.match(s.sent.at(-1).text, /réservée/);
  await s.dm('/annonce Salle Lab ouverte', 'admin1');
  // Serverless : rien n'est envoyé dans la requête ; l'annonce est mise en file pour TOUS les utilisateurs connus.
  assert.equal(s.db.broadcasts.length, 1);
  assert.deepEqual(s.db.broadcasts[0].ids.sort(), ['a', 'b']);
  assert.equal(s.db.broadcasts[0].text, '📣 Salle Lab ouverte');
  assert.equal(s.db.broadcasts[0].fromUserId, 'admin1');
  assert.ok(!s.sent.some((m) => m.to === 'a' && /Salle Lab/.test(m.text)), 'aucun envoi direct dans la requête');
  assert.match(s.sent.at(-1).text, /en cours d'envoi à 2 personne/);
});

test('annonce : envoi d\'un lot (parallèle, échecs comptés, jamais d\'exception)', async () => {
  const { sendBatch } = require('../functions/runtime');
  const sent = [];
  const bot = { sendMessage: async (to) => { await new Promise((r) => setTimeout(r, 5)); if (to.startsWith('x')) throw new Error('KO'); sent.push(to); } };
  const recipients = [...Array.from({ length: 48 }, (_, i) => `u${i}`), 'x1', 'x2'];
  const t0 = Date.now();
  const r = await sendBatch({ bot, text: 't', recipients, parallel: 5 });
  assert.deepEqual(r, { sent: 48, failed: 2 });
  assert.equal(new Set(sent).size, 48);
  assert.ok(Date.now() - t0 < 50 * 5, 'envois en parallèle');
});

test('annonce : 500 destinataires mis en file sans envoi dans la requête', async () => {
  const s = setup('2026-11-28T10:30:00+01:00', ['admin1']);
  for (let i = 0; i < 500; i += 1) s.db.users.set(`p${i}`, { lang: 'fr', reminders: [], sent: [] });
  const t0 = Date.now();
  await s.dm('/annonce Ouverture des portes', 'admin1');
  assert.ok(Date.now() - t0 < 500, 'réponse immédiate');
  assert.equal(s.db.broadcasts[0].ids.length, 500);
});

test('aucune écriture inutile quand rien ne change', async () => {
  const { db, dm } = setup();
  await dm('/lang en');
  const writes = db.writes.length;
  await dm('/faq');
  assert.equal(db.writes.length, writes);
});
