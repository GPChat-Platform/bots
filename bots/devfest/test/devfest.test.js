'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const P = require('../src/program');
const { createHandler } = require('../src/handlers');

const program = P.load(path.join(__dirname, '..', 'data', 'program.example.json'));
const at = (hhmm) => Date.parse(`2026-11-28T${hhmm}:00+01:00`);

function setup(nowIso = '10:30', admins = []) {
  const sent = [];
  const bot = { sendMessage: async (to, text, o) => sent.push({ to, text, o }), sendGroupMessage: async (g, text, o) => sent.push({ g, text, o }) };
  const store = { data: { users: {} }, throttleMs: 0, save() {}, user(id) { return (this.data.users[id] ||= { lang: 'fr', reminders: [], sent: [] }); } };
  let t = at(nowIso);
  const h = createHandler({ bot, program, store, admins, now: () => t });
  const dm = (text, from = 'u1') => h.handle({ type: 'message.received', data: { from, chatId: from, type: 'text', textMsg: text } });
  return { sent, dm, h, store, set: (x) => { t = at(x); } };
}

test('programme : session en cours, suivante, heure locale Douala', () => {
  assert.equal(P.current(program, at('10:30'))[0].id, 'hackathon');
  assert.equal(P.upcoming(program, at('10:30'))[0].id, 'pitchs');
  assert.equal(P.current(program, at('20:00')).length, 0);
  assert.equal(P.hhmm('2026-11-28T09:30:00+01:00', 'Africa/Douala'), '09:30');
  assert.equal(P.tr({ fr: 'a', en: 'b' }, 'en'), 'b');
  assert.throws(() => P.load('/nope.json', '/nope2.json'), /introuvable/);
});

test('commandes : /programme, /maintenant, /prochain, /vote, /faq', async () => {
  const { sent, dm } = setup('10:30');
  await dm('/programme');
  assert.match(sent.at(-1).text, /Hackathon.*#hackathon/);
  await dm('/maintenant');
  assert.match(sent.at(-1).text, /En ce moment[\s\S]*Hackathon/);
  await dm('/prochain');
  assert.match(sent.at(-1).text, /Présentations des équipes/);
  await dm('/vote');
  assert.match(sent.at(-1).text, /Rejoindre le groupe/);
  assert.equal(sent.at(-1).o.buttons[0][0].url, 'https://gpchat.app/devfest');
  await dm('/faq');
  assert.match(sent.at(-1).text, /Comment voter/);
  await dm('/zzz');
  assert.match(sent.at(-1).text, /inconnue/);
});

test('langue anglaise par utilisateur', async () => {
  const { sent, dm } = setup('10:30');
  await dm('/lang en');
  await dm('/schedule');
  assert.match(sent.at(-1).text, /Team pitches/);
  await dm('/lang xx');
  assert.match(sent.at(-1).text, /Languages/);
});

test('rappels : enregistrés, envoyés une seule fois 10 minutes avant', async () => {
  const s = setup('14:00');
  await s.dm('/rappel pitchs');
  assert.match(s.sent.at(-1).text, /10 minutes avant/);
  await s.dm('/rappel pitchs');
  assert.match(s.sent.at(-1).text, /déjà/);
  await s.dm('/rappel inconnu');
  assert.match(s.sent.at(-1).text, /Session inconnue/);
  await s.h.tick();
  const before = s.sent.length;
  s.set('14:52'); // pitchs à 15:00 → fenêtre [14:50, 15:00)
  await s.h.tick();
  assert.equal(s.sent.length, before + 1);
  assert.match(s.sent.at(-1).text, /Dans 10 minutes|In 10 minutes/);
  await s.h.tick();
  assert.equal(s.sent.length, before + 1, 'pas de doublon');
  await s.dm('/annuler pitchs');
  await s.dm('/rappels');
  assert.match(s.sent.at(-1).text, /aucun rappel/);
});

test('/annonce : réservée aux organisateurs, diffusée à tous', async () => {
  const s = setup('10:30', ['admin1']);
  await s.dm('/start', 'a');
  await s.dm('/start', 'b');
  await s.dm('/annonce Salle B ouverte', 'a');
  assert.match(s.sent.at(-1).text, /réservée/);
  const n = s.sent.length;
  await s.dm('/annonce Salle B ouverte', 'admin1');
  assert.ok(s.sent.length >= n + 3);
  assert.ok(s.sent.some((m) => m.to === 'a' && /Salle B ouverte/.test(m.text)));
});

test('en groupe : commandes publiques seulement, jamais /annonce', async () => {
  const { sent, h } = setup('10:30', ['u1']);
  const g = (textMsg) => h.handle({ type: 'group_message.received', data: { from: 'u1', groupId: 'G', type: 'text', textMsg } });
  await g('/prochain');
  assert.equal(sent.at(-1).g, 'G');
  const n = sent.length;
  await g('/annonce secret');
  await g('bonjour');
  assert.equal(sent.length, n);
});
