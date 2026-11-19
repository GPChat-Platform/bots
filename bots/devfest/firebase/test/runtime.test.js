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
  return {
    users, writes,
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
  const n = s.sent.length;
  await s.dm('/annonce Salle Lab ouverte', 'admin1');
  assert.ok(s.sent.length >= n + 3);
  assert.ok(s.sent.some((m) => m.to === 'a' && /Salle Lab ouverte/.test(m.text)));
});

test('aucune écriture inutile quand rien ne change', async () => {
  const { db, dm } = setup();
  await dm('/lang en');
  const writes = db.writes.length;
  await dm('/faq');
  assert.equal(db.writes.length, writes);
});
