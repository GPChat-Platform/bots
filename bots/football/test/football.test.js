'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FootballApi } = require('../src/api');
const { Store } = require('../src/store');
const { LiveTracker, eventKey } = require('../src/live');
const { createHandler, parseCommand, resolveDay } = require('../src/handlers');
const { findLeague } = require('../src/leagues');
const F = require('../src/format');
const { button } = require('../../../packages/sdk');

// ---------------------------------------------------------------- données au format API-Football v3
const CMR = { id: 1530, name: 'Cameroon', logo: 'https://media.api-sports.io/football/teams/1530.png' };
const EGY = { id: 32, name: 'Egypt', logo: '' };
const fx = (o = {}) => ({
  fixture: { id: 9001, date: '2026-11-19T19:00:00+00:00', status: { short: '1H', long: 'First Half', elapsed: 2 }, venue: { name: 'Stade Olembe', city: 'Yaoundé' }, ...o.fixture },
  league: { id: 6, name: 'Africa Cup of Nations', country: 'World', round: 'Semi-finals', ...o.league },
  teams: { home: { ...CMR, winner: null }, away: { ...EGY, winner: null }, ...o.teams },
  goals: { home: 0, away: 0, ...o.goals },
  score: { penalty: { home: null, away: null }, ...o.score },
  ...(o.events ? { events: o.events } : {}),
});
const goal = (min, player, team = CMR, detail = 'Normal Goal', assist) => ({ time: { elapsed: min, extra: null }, team, player: { id: player.length, name: player }, assist: { name: assist || null }, type: 'Goal', detail });

function fakeApi(over = {}) {
  return {
    quota: { dailyLimit: null, dailyRemaining: null },
    calls: [],
    liveData: [],
    live() { this.calls.push('live'); return Promise.resolve(this.liveData); },
    fixture: async () => null,
    events: async () => [],
    fixturesByDate: async () => [],
    searchTeams: async () => [],
    team: async () => null,
    teamNext: async () => [],
    teamLast: async () => [],
    standings: async () => [],
    scorers: async () => [],
    leagueCurrent: async (id) => ({ league: { id, name: id === 61 ? 'Ligue 1' : 'League' }, seasons: [{ year: 2025, current: true, start: '2025-08-15', end: '2026-05-20' }] }),
    get: async () => [],
    ...over,
  };
}

function trackerSetup(api = fakeApi()) {
  const store = new Store(null);
  const sent = [];
  const send = async (chat, text) => { if (chat.to === 'blocked') throw Object.assign(new Error('bloqué'), { status: 403 }); sent.push({ chat, text }); };
  const tracker = new LiveTracker({ api, store, send, sendGapMs: 0 });
  return { api, store, sent, tracker };
}

// ---------------------------------------------------------------- tests
test('commandes et dates', () => {
  assert.deepEqual(parseCommand('/match_9001'), { name: 'match', arg: '9001' });
  assert.deepEqual(parseCommand('/classement@foot_bot ligue1'), { name: 'table', arg: 'ligue1' });
  assert.deepEqual(parseCommand('Cameroun'), { name: 'free', arg: 'Cameroun' });
  const now = Date.UTC(2026, 10, 19, 23, 30); // 00:30 le 20 à Douala
  assert.equal(resolveDay('', 'Africa/Douala', 'fr', now).date, '2026-11-20');
  assert.equal(resolveDay('demain', 'Africa/Douala', 'fr', now).date, '2026-11-21');
  assert.equal(resolveDay('25/12', 'Africa/Douala', 'fr', now).date, '2026-12-25');
  assert.equal(resolveDay('n importe quoi', 'Africa/Douala', 'fr', now), null);
  assert.equal(findLeague('Ligue 1').id, 61);
  assert.equal(findLeague('afcon').id, 6);
  assert.equal(findLeague('elite one').key, 'elite1');
  assert.equal(findLeague('xyz'), null);
});

test('client API : cache, requêtes partagées, quota, erreurs dans le corps', async () => {
  let n = 0;
  let remaining = 500;
  const fetchImpl = async (url) => {
    n += 1;
    remaining -= 1;
    const headers = new Map([['x-ratelimit-requests-remaining', String(remaining)], ['x-ratelimit-requests-limit', '7500']]);
    if (String(url).includes('search=bad')) return { ok: true, status: 200, headers, json: async () => ({ errors: { requests: 'You have reached the request limit for the day' }, response: [] }) };
    return { ok: true, status: 200, headers, json: async () => ({ errors: [], response: [{ team: { id: 1, name: 'X' } }] }) };
  };
  const api = new FootballApi({ key: 'k', fetchImpl, reserve: 50 });
  await Promise.all([api.searchTeams('Cameroon'), api.searchTeams('Cameroon'), api.searchTeams('Cameroon')]);
  assert.equal(n, 1, 'trois demandes identiques simultanées = un seul appel');
  await api.searchTeams('Cameroon');
  assert.equal(n, 1, 'servi par le cache');
  assert.equal(api.quota.dailyLimit, 7500);
  await assert.rejects(api.searchTeams('bad'), (e) => e.code === 'quota');
  assert.equal(api.degraded, true);
  // En mode dégradé : le cache reste servi, les nouvelles requêtes non essentielles sont refusées sans appel.
  assert.ok(await api.searchTeams('Cameroon'));
  const before = n;
  await assert.rejects(api.searchTeams('Nigeria'), (e) => e.code === 'quota');
  assert.equal(n, before);
});

test('direct : coup d’envoi, but, mi-temps, fin de match — une seule fois chacun', async () => {
  const s = trackerSetup();
  s.store.follow({ to: 'u1' }, CMR, { lang: 'fr', tz: 'Africa/Douala' });
  s.store.follow({ groupId: 'G1' }, EGY, { lang: 'en', tz: 'Africa/Cairo' });
  s.store.follow({ to: 'u3' }, { id: 999, name: 'Other' }, { lang: 'fr', tz: 'UTC' });

  s.api.liveData = [fx(), fx({ fixture: { id: 7 }, teams: { home: { id: 5, name: 'A' }, away: { id: 6, name: 'B' } } })];
  await s.tracker.tick();
  assert.equal(s.sent.length, 2, 'coup d’envoi aux deux conversations concernées, pas à u3 ni pour le match non suivi');
  assert.match(s.sent.find((m) => m.chat.to === 'u1').text, /Coup d’envoi/);
  assert.match(s.sent.find((m) => m.chat.groupId === 'G1').text, /Kick-off/);

  s.api.liveData = [fx({ fixture: { status: { short: '1H', elapsed: 23 } }, goals: { home: 1 }, events: [goal(23, 'V. Aboubakar', CMR, 'Normal Goal', 'B. Mbeumo')] })];
  await s.tracker.tick();
  await s.tracker.tick(); // même état : rien de neuf
  const goals = s.sent.filter((m) => /BUT|GOAL/.test(m.text));
  assert.equal(goals.length, 2);
  assert.match(goals[0].text, /23' — \*\*V\. Aboubakar\*\*/);
  assert.match(goals[0].text, /Passe décisive : B\. Mbeumo/);
  assert.match(goals[0].text, /Cameroon \*\*1 – 0\*\* Egypt/);

  s.api.liveData = [fx({ fixture: { status: { short: 'HT', elapsed: 45 } }, goals: { home: 1 }, events: [goal(23, 'V. Aboubakar')] })];
  await s.tracker.tick();
  assert.equal(s.sent.filter((m) => /Mi-temps|Half-time/.test(m.text)).length, 2);

  // Le match disparaît du direct : relu par identifiant, score final annoncé.
  s.api.liveData = [];
  s.api.fixture = async () => fx({ fixture: { status: { short: 'FT', elapsed: 90 } }, goals: { home: 2, away: 1 }, teams: { home: { ...CMR, winner: true }, away: { ...EGY, winner: false } }, events: [goal(23, 'V. Aboubakar'), goal(60, 'M. Salah', EGY, 'Penalty'), goal(88, 'K. Toko Ekambi')] });
  await s.tracker.tick();
  const ft = s.sent.filter((m) => /Fin du match|Full-time/.test(m.text));
  assert.equal(ft.length, 2);
  assert.match(ft[0].text, /Victoire de \*\*Cameroon\*\*|Cameroon\*\* win/);
  assert.ok(s.sent.some((m) => /M\. Salah\*\* \(sp\)/.test(m.text)), 'pénalty signalé');
  const total = s.sent.length;
  await s.tracker.tick();
  assert.equal(s.sent.length, total, 'match terminé : plus rien');
});

test('redémarrage en plein match : pas de rejeu des buts passés', async () => {
  const s = trackerSetup();
  s.store.follow({ to: 'u1' }, CMR, { lang: 'fr', tz: 'UTC' });
  s.api.liveData = [fx({ fixture: { status: { short: '2H', elapsed: 70 } }, goals: { home: 2 }, events: [goal(10, 'A'), goal(50, 'B')] })];
  await s.tracker.tick();
  assert.equal(s.sent.length, 0);
  // Nouveau processus, même fichier d'état : toujours rien, puis seulement le nouveau but.
  const t2 = new LiveTracker({ api: s.api, store: s.store, send: async (chat, text) => s.sent.push({ chat, text }), sendGapMs: 0 });
  await t2.tick();
  assert.equal(s.sent.length, 0);
  s.api.liveData = [fx({ fixture: { status: { short: '2H', elapsed: 75 } }, goals: { home: 3 }, events: [goal(10, 'A'), goal(50, 'B'), goal(74, 'C')] })];
  await t2.tick();
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].text, /74' — \*\*C\*\*/);
});

test('direct : carton rouge, VAR, conversation bloquée désabonnée', async () => {
  const s = trackerSetup();
  s.store.follow({ to: 'u1' }, CMR, { lang: 'fr', tz: 'UTC' });
  s.store.follow({ to: 'blocked' }, CMR, { lang: 'fr', tz: 'UTC' });
  s.api.liveData = [fx({ fixture: { status: { short: '1H', elapsed: 30 } } })];
  await s.tracker.tick();
  s.api.liveData = [fx({ fixture: { status: { short: '1H', elapsed: 40 } }, events: [
    { time: { elapsed: 38 }, team: EGY, player: { id: 3, name: 'X' }, type: 'Card', detail: 'Red Card' },
    { time: { elapsed: 39 }, team: CMR, player: { id: 4, name: 'Y' }, type: 'Var', detail: 'Goal cancelled' },
    { time: { elapsed: 39 }, team: CMR, player: { id: 5, name: 'Z' }, type: 'Card', detail: 'Yellow Card' },
  ] })];
  await s.tracker.tick();
  assert.equal(s.sent.length, 2);
  assert.match(s.sent[0].text, /Carton rouge\*\* 38' — X/);
  assert.match(s.sent[1].text, /annulé par la VAR/);
  assert.equal(s.store.subscription({ to: 'blocked' }), null);
  assert.equal(s.api.calls.length, 2);
});

test('direct : aucun appel sans abonné ; intervalle borné par le quota', async () => {
  const s = trackerSetup();
  await s.tracker.tick();
  assert.equal(s.api.calls.length, 0);
  s.api.quota.dailyLimit = 100; // offre gratuite
  assert.ok(s.tracker.interval() >= 20 * 60e3);
  s.api.quota.dailyLimit = 7500;
  assert.equal(s.tracker.interval(), 60e3);
  assert.equal(eventKey(goal(23, 'A')), 'Goal|Normal Goal|23+0|1|1530');
});

// ---------------------------------------------------------------- commandes
function handlerSetup(over = {}) {
  const sent = [];
  const bot = {
    sendMessage: async (to, text, o) => sent.push({ to, text, o }),
    sendGroupMessage: async (groupId, text, o) => sent.push({ groupId, text, o }),
    send: async (body) => sent.push({ raw: body, text: body.caption, o: body }),
    sendChatAction: async () => {},
  };
  const api = fakeApi(over);
  const store = new Store(null);
  const tracker = new LiveTracker({ api, store, send: async () => {}, sendGapMs: 0 });
  const h = createHandler({ bot, api, tracker, store, button, version: '1.0.0', now: () => Date.UTC(2026, 10, 19, 12) });
  const dm = (text, from = 'u1') => h.handle({ type: 'message.received', data: { from, chatId: from, type: 'text', textMsg: text } });
  const click = (data, from = 'u1') => h.handle({ type: 'callback.received', data: { from, chatId: from, data } });
  return { sent, store, api, h, dm, click };
}

test('suivre une équipe (résultat unique, choix multiple), mes équipes, ne plus suivre', async () => {
  const s = handlerSetup({
    searchTeams: async (q) => (/cam/i.test(q) ? [{ team: { ...CMR, national: true, country: 'Cameroon' } }, { team: { id: 77, name: 'Cameroon U20', national: true } }] : [{ team: { id: 50, name: 'Manchester City', country: 'England' } }]),
    team: async (id) => ({ team: id === 1530 ? { ...CMR, national: true } : { id, name: 'Manchester City' } }),
  });
  await s.dm('/suivre cameroon');
  assert.match(s.sent.at(-1).text, /Vous suivez \*\*Cameroon\*\*/, 'correspondance exacte choisie directement');
  await s.dm('/suivre man city');
  assert.match(s.sent.at(-1).text, /Vous suivez \*\*Manchester City\*\*/);
  await s.dm('/suivre cameroon');
  assert.match(s.sent.at(-1).text, /déjà/);
  await s.dm('/mesequipes');
  assert.match(s.sent.at(-1).text, /\(2\)/);
  await s.click('u:50');
  assert.match(s.sent.at(-1).text, /ne suivez plus \*\*Manchester City\*\*/);
  assert.deepEqual(s.store.subscription({ to: 'u1' }).teams.map((x) => x.id), [1530]);
});

test('plusieurs équipes : boutons de choix', async () => {
  const s = handlerSetup({ searchTeams: async () => [{ team: { id: 1, name: 'Union Douala' } }, { team: { id: 2, name: 'Union Berlin' } }] });
  await s.dm('/equipe union');
  assert.match(s.sent.at(-1).text, /Plusieurs équipes/);
  assert.equal(s.sent.at(-1).o.buttons[1][0].callbackData, 't:2');
});

test('fiche d’équipe avec logo, prochains matchs et résultats', async () => {
  const s = handlerSetup({
    searchTeams: async () => [{ team: { ...CMR, national: true } }],
    team: async () => ({ team: { ...CMR, national: true, country: 'Cameroon' }, venue: { name: 'Stade Olembe', city: 'Yaoundé' } }),
    teamNext: async () => [fx({ fixture: { status: { short: 'NS' } } })],
    teamLast: async () => [fx({ fixture: { status: { short: 'FT' } }, goals: { home: 2, away: 1 } })],
  });
  await s.dm('Cameroon');
  const card = s.sent.at(-1);
  assert.equal(card.raw.type, 'image');
  assert.match(card.text, /Prochains matchs/);
  assert.match(card.text, /Cameroon \*\*2 – 1\*\* Egypt/);
  assert.equal(card.o.buttons[0][0].callbackData, 'f:1530');
});

test('/direct : compétitions phares et équipes suivies d’abord', async () => {
  const s = handlerSetup();
  s.api.liveData = [
    fx({ fixture: { id: 1, status: { short: '2H', elapsed: 60 } }, league: { id: 9999, name: 'Obscure League', country: 'Nowhere' }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } } }),
    fx({ fixture: { id: 2, status: { short: '1H', elapsed: 12 } } }),
  ];
  await s.dm('/direct');
  assert.match(s.sent.at(-1).text, /En direct\*\* \(1\)/);
  assert.match(s.sent.at(-1).text, /12'/);
  await s.dm('/direct tout');
  assert.match(s.sent.at(-1).text, /\(2\)/);
});

test('/classement et /buteurs', async () => {
  const row = (rank, id, name, pts) => ({ rank, team: { id, name }, points: pts, goalsDiff: 10 - rank, all: { played: 12 }, group: 'Ligue 1' });
  const s = handlerSetup({
    standings: async () => [{ league: { name: 'Ligue 1', standings: [[row(1, 85, 'Paris Saint Germain', 30), row(2, 81, 'Marseille', 27)]] } }],
    scorers: async () => [{ player: { name: 'B. Barcola' }, statistics: [{ team: { name: 'PSG' }, goals: { total: 11 } }] }],
  });
  await s.dm('/classement ligue 1');
  assert.match(s.sent.at(-1).text, /Classement — Ligue 1\*\* \(2025-26\)/);
  assert.match(s.sent.at(-1).text, /1\. Paris Saint Germain — \*\*30\*\* pts \(12 J, \+9\)/);
  await s.dm('/buteurs ligue1');
  assert.match(s.sent.at(-1).text, /B\. Barcola\*\* \(PSG\) — 11 buts/);
  await s.dm('/classement zzz');
  assert.match(s.sent.at(-1).text, /Compétition inconnue/);
});

test('donnée hors offre (saison en cours en offre gratuite) : message clair', async () => {
  const s = handlerSetup({ standings: async () => { throw Object.assign(new Error('Free plans do not have access to this season'), { code: 'plan' }); } });
  await s.dm('/classement ligue1');
  assert.match(s.sent.at(-1).text, /pas incluse dans l’offre/);
});

test('quota épuisé : message clair', async () => {
  const s = handlerSetup({ searchTeams: async () => { throw Object.assign(new Error('quota'), { code: 'quota' }); } });
  await s.dm('/equipe arsenal');
  assert.match(s.sent.at(-1).text, /quota du fournisseur/);
});

test('détail d’un match', async () => {
  const s = handlerSetup({ fixture: async () => fx({ fixture: { status: { short: '2H', elapsed: 67 } }, goals: { home: 1 }, events: [goal(23, 'V. Aboubakar', CMR, 'Penalty')] }) });
  await s.dm('/match_9001');
  assert.match(s.sent.at(-1).text, /\*\*Africa Cup of Nations\*\* · Semi-finals/);
  assert.match(s.sent.at(-1).text, /2e mi-temps · 67'/);
  assert.match(s.sent.at(-1).text, /23' ⚽ V\. Aboubakar \(sp\)/);
  assert.match(F.matchDetails(fx({ fixture: { status: { short: 'NS' } } }), [], 'Africa/Douala', 'fr'), /20:00/);
});
