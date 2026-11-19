'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReminder, cleanText } = require('../src/parse');
const { nextOccurrence } = require('../src/schedule');
const TZ = require('../src/tz');
const { resolveZone } = require('../src/zones');
const { Store } = require('../src/store');
const { Scheduler } = require('../src/scheduler');
const { createHandler } = require('../src/handlers');
const F = require('../src/format');
const { button } = require('../../../packages/sdk');

const DLA = 'Africa/Douala'; // UTC+1, sans heure d'été
// Jeudi 19 novembre 2026, 10:00 à Douala.
const NOW = Date.UTC(2026, 10, 19, 9, 0);
const local = (ms, tz = DLA) => { const p = TZ.parts(ms, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };
const parse = (s, now = NOW, tz = DLA) => parseReminder(s, { now, tz });

test('dates et heures en français', () => {
  const cases = [
    ['rappelle-moi demain à 9h d’appeler maman', '2026-11-20 09:00', 'Appeler maman'],
    ['dans 20 min sortir le gâteau', '2026-11-19 10:20', 'Sortir le gâteau'],
    ['dans 1h30 rappeler Jean', '2026-11-19 11:30', 'Rappeler Jean'],
    ['à 18h30 récupérer les enfants', '2026-11-19 18:30', 'Récupérer les enfants'],
    ['rappel 8h réunion', '2026-11-20 08:00', 'Réunion'], // 8h est passé : demain
    ['ce soir regarder le match', '2026-11-19 19:00', 'Regarder le match'],
    ['vendredi soir dîner avec Aïcha', '2026-11-20 19:00', 'Dîner avec Aïcha'],
    ['lundi prochain envoyer le rapport', '2026-11-23 09:00', 'Envoyer le rapport'],
    ['le 25/12 à minuit joyeux noël', '2026-12-25 00:00', 'Joyeux noël'],
    ['le 30 payer la facture', '2026-11-30 09:00', 'Payer la facture'],
    ['après-demain 14h dentiste', '2026-11-21 14:00', 'Dentiste'],
    ['n’oublie pas d’acheter du pain à 17h', '2026-11-19 17:00', 'Acheter du pain'],
    ['le 3 janvier 2027 à 8h30 rentrée', '2027-01-03 08:30', 'Rentrée'],
    ['demain matin footing', '2026-11-20 08:00', 'Footing'],
    ['à 3h de l’après-midi appeler Paul', '2026-11-19 15:00', 'Appeler Paul'],
    ['dans 3 jours rendre le livre', '2026-11-22 10:00', 'Rendre le livre'],
  ];
  for (const [input, when, text] of cases) {
    const r = parse(input);
    assert.ok(r.ok, `${input} → ${r.reason}`);
    assert.equal(local(r.at), when, input);
    assert.equal(r.text, text, input);
    assert.equal(r.rule, null, input);
  }
});

test('dates et heures en anglais', () => {
  const cases = [
    ['remind me tomorrow morning to call the bank', '2026-11-20 08:00', 'Call the bank'],
    ['in 2 hours check the oven', '2026-11-19 12:00', 'Check the oven'],
    ['remind me on friday at 5pm to submit the timesheet', '2026-11-20 17:00', 'Submit the timesheet'],
    ['next monday at 10 dentist', '2026-11-23 10:00', 'Dentist'],
    ['remind me march 3 to renew passport', '2027-03-03 09:00', 'Renew passport'],
    ['at 6:30 pm pick up the kids', '2026-11-19 18:30', 'Pick up the kids'],
    ['in half an hour leave for the airport', '2026-11-19 10:30', 'Leave for the airport'],
    ['tonight call grandma', '2026-11-19 19:00', 'Call grandma'],
  ];
  for (const [input, when, text] of cases) {
    const r = parse(input);
    assert.ok(r.ok, `${input} → ${r.reason}`);
    assert.equal(local(r.at), when, input);
    assert.equal(r.text, text, input);
  }
});

test('récurrences', () => {
  let r = parse('tous les jours à 7h prendre mes médicaments');
  assert.deepEqual(r.rule, { kind: 'daily', n: 1, h: 7, mi: 0 });
  assert.equal(local(r.at), '2026-11-20 07:00');

  r = parse('remind me every monday and thursday at 7pm to go running');
  assert.deepEqual(r.rule.days, [1, 4]);
  assert.equal(local(r.at), '2026-11-19 19:00'); // jeudi, aujourd'hui
  assert.equal(r.text, 'Go running');

  r = parse('le 5 de chaque mois à 9h payer le loyer');
  assert.equal(r.rule.kind, 'monthly');
  assert.equal(r.rule.day, 5);
  assert.equal(local(r.at), '2026-12-05 09:00');
  assert.equal(r.text, 'Payer le loyer');

  r = parse('anniversaire de Paul le 12 mars chaque année');
  assert.equal(r.rule.kind, 'yearly');
  assert.equal(local(r.at), '2027-03-12 09:00');
  assert.equal(r.text, 'Anniversaire de Paul');

  r = parse('en semaine à 6h30 sport');
  assert.deepEqual(r.rule.days, [1, 2, 3, 4, 5]);
  assert.equal(local(r.at), '2026-11-20 06:30');

  r = parse('toutes les 2 heures boire de l’eau');
  assert.equal(r.rule.kind, 'interval');
  assert.equal(r.at, NOW + 2 * 3600e3);

  r = parse('every day at 8:15 am stand-up');
  assert.equal(local(r.at), '2026-11-20 08:15');
  assert.equal(r.text, 'Stand-up');

  assert.equal(parse('toutes les 5 minutes test').reason, 'interval_too_short');
});

test('erreurs explicites', () => {
  assert.equal(parse('appeler le médecin').reason, 'no_time');
  assert.equal(parse('').reason, 'empty');
  assert.equal(parse('le 31/02 test').reason, 'bad_date');
  assert.equal(parse('à 25h test').reason, 'bad_date');
  assert.equal(parse('dans 7 ans test').reason, 'no_time');
  assert.equal(parse('le 12 mars 2040 test').reason, 'too_far');
  assert.equal(parse('le 12 mars 2020 test').reason, 'past');
});

test('fuseaux et changement d’heure (Europe/Paris)', () => {
  // Samedi 28 mars 2026 12:00 à Paris (UTC+1) ; le 29 mars on passe à UTC+2.
  const now = Date.UTC(2026, 2, 28, 11, 0);
  const r = parseReminder('demain à 9h test', { now, tz: 'Europe/Paris' });
  assert.equal(local(r.at, 'Europe/Paris'), '2026-03-29 09:00');
  assert.equal(new Date(r.at).toISOString(), '2026-03-29T07:00:00.000Z');
  // Récurrence quotidienne qui traverse le changement d'heure : toujours 9:00 heure locale.
  const rule = { kind: 'daily', n: 1, h: 9, mi: 0 };
  const a = nextOccurrence(rule, now, 'Europe/Paris');
  const b = nextOccurrence(rule, a, 'Europe/Paris');
  assert.equal(local(a, 'Europe/Paris'), '2026-03-29 09:00');
  assert.equal(local(b, 'Europe/Paris'), '2026-03-30 09:00');
  // Heure inexistante (02:30 le 29 mars) : décalée à 03:30.
  assert.equal(local(TZ.zonedToUtc(2026, 3, 29, 2, 30, 'Europe/Paris'), 'Europe/Paris'), '2026-03-29 03:30');
});

test('récurrences : fins de mois et années bissextiles', () => {
  const jan31 = Date.UTC(2027, 0, 31, 12, 0);
  const m = nextOccurrence({ kind: 'monthly', day: 31, h: 9, mi: 0 }, jan31, 'UTC');
  assert.equal(local(m, 'UTC'), '2027-02-28 09:00');
  const y = nextOccurrence({ kind: 'yearly', month: 2, day: 29, h: 9, mi: 0 }, Date.UTC(2027, 0, 1), 'UTC');
  assert.equal(local(y, 'UTC'), '2027-02-28 09:00');
  const every3 = { kind: 'daily', n: 3, h: 9, mi: 0, anchor: { y: 2026, m: 11, d: 20 } };
  const d1 = nextOccurrence(every3, NOW, DLA);
  const d2 = nextOccurrence(every3, d1, DLA);
  assert.equal(local(d1), '2026-11-20 09:00');
  assert.equal(local(d2), '2026-11-23 09:00');
});

test('résolution des fuseaux', () => {
  assert.equal(resolveZone('Douala'), 'Africa/Douala');
  assert.equal(resolveZone('yaoundé'), 'Africa/Douala');
  assert.equal(resolveZone('Montréal'), 'America/Toronto');
  assert.equal(resolveZone('europe/paris'), 'Europe/Paris');
  assert.equal(resolveZone('UTC+1'), 'Etc/GMT-1');
  assert.equal(resolveZone('GMT-5'), 'Etc/GMT+5');
  assert.equal(resolveZone('Atlantide'), null);
});

test('nettoyage du texte', () => {
  assert.equal(cleanText('  rappelle-moi de   payer   '), 'Payer');
  assert.equal(cleanText('remind me to , call mom at'), 'Call mom');
  assert.equal(cleanText('/rappel@rappels_bot  réunion'), 'Réunion');
});

test('mise en forme', () => {
  assert.equal(F.when(NOW + 3600e3, DLA, 'fr', NOW), 'aujourd’hui à 11:00');
  assert.equal(F.when(NOW + 24 * 3600e3, DLA, 'en', NOW), 'tomorrow at 10:00');
  assert.equal(F.rel(NOW + 150 * 60e3, 'fr', NOW), 'dans 2 h 30');
  assert.equal(F.ruleLabel({ kind: 'weekly', days: [1, 4], h: 19, mi: 0 }, 'fr'), 'chaque lundi et jeudi à 19:00');
  assert.equal(F.ruleLabel({ kind: 'monthly', day: 5, h: 9, mi: 0 }, 'en'), 'on day 5 of every month at 09:00');
  assert.equal(F.ruleLabel({ kind: 'interval', everyMs: 2 * 3600e3 }, 'fr'), 'toutes les 2 h');
});

// ---------------------------------------------------------------- handlers + planificateur
function setup() {
  const sent = [];
  let now = NOW;
  const bot = {
    sendMessage: async (to, text, o) => { sent.push({ to, text, o }); return { msgId: `m${sent.length}` }; },
    sendGroupMessage: async (groupId, text, o) => { sent.push({ groupId, text, o }); return { msgId: `m${sent.length}` }; },
    editMessage: async (target, msgId, patch) => { sent.push({ edit: msgId, text: patch.content }); },
  };
  const store = new Store(null);
  const h = createHandler({ bot, store, button, version: '1.0.0', now: () => now });
  const dm = (from, text) => h.handle({ type: 'message.received', data: { from, chatId: from, type: 'text', textMsg: text } });
  const click = (from, data, msgId = 'm1') => h.handle({ type: 'callback.received', data: { from, chatId: from, data, msgId } });
  return { sent, store, h, dm, click, setNow: (v) => { now = v; }, getNow: () => now };
}

test('création, liste, suppression et annulation', async () => {
  const s = setup();
  await s.dm('u1', 'demain à 9h appeler maman');
  assert.match(s.sent.at(-1).text, /C’est noté/);
  assert.match(s.sent.at(-1).text, /demain à 09:00/);
  const id = s.store.activeFor({ owner: 'u1' })[0].id;
  assert.equal(s.sent.at(-1).o.buttons[0][0].callbackData, `c:${id}`);

  await s.dm('u1', '/rappel tous les lundis à 8h réunion');
  await s.dm('u1', '/liste');
  assert.match(s.sent.at(-1).text, /Vos rappels\*\* \(2\)/);
  assert.match(s.sent.at(-1).text, /chaque lundi à 08:00/);

  await s.dm('u1', '/supprimer 1');
  assert.match(s.sent.at(-1).text, /supprimé : Appeler maman/);
  assert.equal(s.store.countActive({ owner: 'u1' }), 1);

  const other = s.store.activeFor({ owner: 'u1' })[0].id;
  await s.click('u2', `c:${other}`);
  assert.match(s.sent.at(-1).text, /Seule la personne/);
  await s.click('u1', `c:${other}`);
  assert.equal(s.store.countActive({ owner: 'u1' }), 0);
});

test('texte sans date : aide ciblée', async () => {
  const s = setup();
  await s.dm('u1', 'appeler le plombier');
  assert.match(s.sent.at(-1).text, /quand/);
  assert.match(s.sent.at(-1).text, /demain à 9h appeler le plombier/);
});

test('fuseau et langue par utilisateur', async () => {
  const s = setup();
  await s.dm('u1', '/fuseau Paris');
  assert.match(s.sent.at(-1).text, /Europe\/Paris/);
  await s.dm('u1', '/lang en');
  await s.dm('u1', 'tomorrow at 9am gym');
  assert.match(s.sent.at(-1).text, /Got it/);
  const r = s.store.activeFor({ owner: 'u1' })[0];
  assert.equal(r.tz, 'Europe/Paris');
  assert.equal(local(r.nextAt, 'Europe/Paris'), '2026-11-20 09:00');
});

test('quota de rappels actifs', async () => {
  const s = setup();
  for (let i = 0; i < 50; i += 1) s.store.add({ owner: 'u1', chat: { to: 'u1' }, text: 'x', nextAt: NOW + 1e7, tz: DLA, lang: 'fr' });
  await s.dm('u1', 'demain 9h test');
  assert.match(s.sent.at(-1).text, /50 rappels actifs/);
});

test('envoi à échéance, récurrence et boutons Fait / Reporter', async () => {
  const s = setup();
  await s.dm('u1', 'dans 10 min sortir le gâteau');
  await s.dm('u1', 'tous les jours à 7h médicaments');
  const sched = new Scheduler({ store: s.store, deliver: s.h.deliver, now: s.getNow });
  s.setNow(NOW + 11 * 60e3);
  assert.equal(await sched.tick(), 1);
  const fired = s.sent.at(-1);
  assert.match(fired.text, /Rappel\*\*\n\nSortir le gâteau/);
  const id = fired.o.buttons[0][0].callbackData.split(':')[1];
  assert.equal(s.store.get(id).status, 'fired');

  await s.click('u1', `z:${id}:10`);
  assert.match(s.sent.at(-1).text, /Reporté/);
  assert.equal(s.store.countActive({ owner: 'u1' }), 2); // le report + le quotidien

  // Le lendemain 7:00 : le rappel quotidien part et se reprogramme au jour suivant.
  s.setNow(Date.UTC(2026, 10, 20, 6, 0, 30));
  await sched.tick();
  const daily = s.store.activeFor({ owner: 'u1' }).find((r) => r.rule);
  assert.equal(local(daily.nextAt), '2026-11-21 07:00');
  assert.match(s.sent.at(-1).text, /Prochain : demain à 07:00/);
});

test('planificateur : nouvel essai puis abandon, retard signalé, pas de double envoi', async () => {
  const store = new Store(null);
  let now = NOW;
  const calls = [];
  let fail = 2;
  const deliver = async (r, info) => { calls.push(info); if (fail-- > 0) throw Object.assign(new Error('503'), { status: 503 }); };
  const sched = new Scheduler({ store, deliver, now: () => now, parallel: 4 });
  const r = store.add({ owner: 'u', chat: { to: 'u' }, text: 't', nextAt: NOW - 10 * 60e3, tz: DLA });
  await Promise.all([sched.tick(), sched.tick()]); // la 2e passe est ignorée (déjà en cours)
  assert.equal(calls.length, 1);
  assert.equal(store.get(r.id).attempts, 1);
  now += 31e3; await sched.tick();
  now += 61e3; await sched.tick();
  assert.equal(store.get(r.id).status, 'fired');
  assert.ok(calls[2].lateMs >= 10 * 60e3, 'le retard est calculé depuis l’échéance d’origine');

  const gone = store.add({ owner: 'v', chat: { to: 'v' }, text: 't', nextAt: now - 1, tz: DLA });
  const s2 = new Scheduler({ store, deliver: async () => { throw Object.assign(new Error('bloqué'), { status: 403 }); }, now: () => now });
  await s2.tick();
  assert.equal(store.get(gone.id).status, 'failed');
});

test('groupe : commandes seulement, rappel pour tout le groupe, « Fait » ouvert à tous', async () => {
  const s = setup();
  const g = (from, text, extra = {}) => s.h.handle({ type: 'group_message.received', data: { from, groupId: 'G1', type: 'text', textMsg: text, ...extra } });
  await g('u1', 'demain 9h réunion'); // pas une commande, pas de mention : ignoré
  assert.equal(s.sent.length, 0);
  await g('u1', '/rappel demain 18h apéro');
  assert.equal(s.sent.at(-1).groupId, 'G1');
  const r = s.store.activeFor({ groupId: 'G1' })[0];
  assert.equal(r.text, 'Apéro');
  await s.h.deliver(r, { lateMs: 0, nextAt: null });
  assert.match(s.sent.at(-1).text, /Rappel du groupe/);
  await s.h.handle({ type: 'callback.received', data: { from: 'u2', groupId: 'G1', data: `k:${r.id}`, msgId: 'm9' } });
  assert.match(s.sent.at(-1).text, /Fait/);
});
