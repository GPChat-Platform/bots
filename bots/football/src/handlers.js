'use strict';
// Commandes du bot Foot en direct.
const { t } = require('./i18n');
const F = require('./format');
const { LEAGUES, FEATURED_IDS, findLeague, resolveLeague, norm } = require('./leagues');
const { resolveZone } = require('./zones');
const { LIMITS } = require('./store');

const COMMANDS = {
  start: 'start', aide: 'help', help: 'help',
  direct: 'live', live: 'live', endirect: 'live', scores: 'live',
  matchs: 'day', matches: 'day', match: 'match', programme: 'day', fixtures: 'day', calendrier: 'day',
  equipe: 'team', team: 'team', club: 'team',
  suivre: 'follow', follow: 'follow', abonner: 'follow',
  nepasuivre: 'unfollow', unfollow: 'unfollow', desabonner: 'unfollow',
  mesequipes: 'myteams', myteams: 'myteams', equipes: 'myteams',
  classement: 'table', table: 'table', standings: 'table',
  buteurs: 'scorers', scorers: 'scorers',
  ligues: 'leagues', leagues: 'leagues', competitions: 'leagues',
  fuseau: 'tz', timezone: 'tz', langue: 'lang', lang: 'lang', apropos: 'about', about: 'about',
};

/** « /match_1234 » → { name: 'match', arg: '1234' } ; « /classement@foot_bot ligue1 » → { name: 'table', arg: 'ligue1' }. */
function parseCommand(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return { name: 'free', arg: s };
  const m = /^\/([a-zA-Z]+)(?:_(\d+))?(?:@\w+)?\s*([\s\S]*)$/.exec(s);
  if (!m) return null;
  return { name: COMMANDS[m[1].toLowerCase()] || 'unknown', arg: (m[2] || m[3] || '').trim() };
}

/** Date demandée (« demain », « 25/12 », « 2026-12-25 ») → { date: 'YYYY-MM-DD', label } dans le fuseau donné. */
function resolveDay(arg, tz, lang, now) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const shift = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const a = norm(arg);
  if (!a || /^(aujourd hui|aujourdhui|today|auj)$/.test(a)) return { date: today, label: t(lang, 'today'), isToday: true };
  if (/^(demain|tomorrow)$/.test(a)) return { date: shift(today, 1), label: t(lang, 'tomorrow') };
  if (/^(hier|yesterday)$/.test(a)) return { date: shift(today, -1), label: t(lang, 'yesterday') };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(arg).trim());
  if (m) return { date: m[0], label: t(lang, 'onDate', { date: `${m[3]}/${m[2]}` }) };
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?$/.exec(String(arg).trim());
  if (m) {
    const y = m[3] || today.slice(0, 4);
    const date = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(date))) return { date, label: t(lang, 'onDate', { date: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}` }), isToday: date === today };
  }
  return null;
}

function createHandler({ bot, api, tracker, store, button, version = '', now = Date.now, log = { warn() {}, error() {} } }) {
  const prefs = (userId) => store.user(userId);

  function say(c, text, opts = {}) {
    if (c.groupId) return bot.sendGroupMessage(c.groupId, text, { markdown: true, ...opts });
    return bot.sendMessage(c.to, text, { markdown: true, ...opts });
  }
  const quick = (lang) => [[button.callback(t(lang, 'btnLive'), 'x:live'), button.callback(t(lang, 'btnToday'), 'x:day'), button.callback(t(lang, 'btnMyTeams'), 'x:myteams')]];

  /** Ordre d'affichage : équipes suivies d'abord, puis compétitions phares, puis le reste. */
  function rank(fixtures, c) {
    const followed = new Set(((store.subscription(c) || {}).teams || []).map((x) => x.id));
    const score = (f) => (followed.has(f.teams.home.id) || followed.has(f.teams.away.id) ? 0 : FEATURED_IDS.has(f.league.id) ? 1 : 2);
    return [...fixtures].sort((a, b) => score(a) - score(b) || a.league.id - b.league.id || Date.parse(a.fixture.date) - Date.parse(b.fixture.date));
  }
  function filterFeatured(fixtures, c, all) {
    if (all) return fixtures;
    const followed = new Set(((store.subscription(c) || {}).teams || []).map((x) => x.id));
    return fixtures.filter((f) => FEATURED_IDS.has(f.league.id) || followed.has(f.teams.home.id) || followed.has(f.teams.away.id));
  }

  // ---------------------------------------------------------------- matchs
  async function live(c, userId, arg) {
    const { lang, tz } = prefs(userId);
    const all = /^(tout|tous|all)$/i.test(arg || '');
    const fixtures = await tracker.liveFixtures();
    const list = rank(filterFeatured(fixtures, c, all), c);
    if (!list.length) return say(c, t(lang, all ? 'liveNoneAll' : 'liveNone'), { buttons: [[button.callback(t(lang, 'btnToday'), 'x:day')]] });
    const { text, shown } = F.byLeague(list, tz, lang, 30);
    const more = list.length > shown ? t(lang, 'liveMore', { n: list.length - shown }) : '';
    return say(c, `${t(lang, 'liveTitle', { n: list.length })}\n${text}${more}`, { buttons: [[button.callback(t(lang, 'refresh'), `x:live${all ? ':all' : ''}`)]] });
  }

  async function day(c, userId, arg) {
    const { lang, tz } = prefs(userId);
    const all = /\b(tout|tous|all)\b/i.test(arg || '');
    const d = resolveDay(String(arg || '').replace(/\b(tout|tous|all)\b/i, '').trim(), tz, lang, now());
    if (!d) return say(c, t(lang, 'unknown'));
    const fixtures = (await api.fixturesByDate(d.date, tz, d.isToday)) || [];
    const list = rank(filterFeatured(fixtures, c, all), c);
    if (!list.length) return say(c, t(lang, 'dayNone', { day: d.label }));
    const { text, shown } = F.byLeague(list, tz, lang, 40);
    const more = list.length > shown ? t(lang, 'dayMore', { n: list.length - shown }) : '';
    return say(c, `${t(lang, 'dayTitle', { day: d.label, n: list.length })}\n${text}${more}`);
  }

  async function match(c, userId, arg) {
    const { lang, tz } = prefs(userId);
    const id = Number.parseInt(arg, 10);
    if (!id) return say(c, t(lang, 'matchNotFound'));
    const f = await api.fixture(id);
    if (!f) return say(c, t(lang, 'matchNotFound'));
    const events = Array.isArray(f.events) ? f.events : await api.events(id).catch(() => []);
    const buttons = [[button.callback(t(lang, 'refresh'), `m:${id}`)]];
    return say(c, F.matchDetails(f, events, tz, lang), { buttons });
  }

  // ---------------------------------------------------------------- équipes
  async function findTeams(q) {
    const res = (await api.searchTeams(q)) || [];
    const nq = norm(q);
    // Sélections nationales et correspondances exactes d'abord.
    return res.sort((a, b) => (norm(b.team.name) === nq) - (norm(a.team.name) === nq) || (b.team.national === true) - (a.team.national === true));
  }

  async function pickTeam(c, lang, q, action) {
    if (!q || q.length < 3) { await say(c, t(lang, 'teamAsk')); return null; }
    const teams = await findTeams(q);
    if (!teams.length) { await say(c, t(lang, 'teamNone', { q: F.clip(q, 40) })); return null; }
    const exact = teams.filter((x) => norm(x.team.name) === norm(q));
    if (teams.length === 1 || exact.length === 1) return (exact[0] || teams[0]).team;
    const buttons = teams.slice(0, 8).map((x) => [button.callback(F.clip(`${x.team.name}${x.team.country ? ` (${x.team.country})` : ''}`, 40), `${action}:${x.team.id}`)]);
    await say(c, t(lang, 'teamPick', { q: F.clip(q, 40) }), { buttons });
    return null;
  }

  async function teamCard(c, userId, teamId) {
    const { lang, tz } = prefs(userId);
    const info = await api.team(teamId);
    if (!info) return say(c, t(lang, 'teamNone', { q: teamId }));
    const [next, last] = await Promise.all([api.teamNext(teamId, 3).catch(() => []), api.teamLast(teamId, 3).catch(() => [])]);
    const tm = info.team;
    const v = info.venue && info.venue.name ? `🏟️ ${info.venue.name}${info.venue.city ? `, ${info.venue.city}` : ''}` : '';
    const lines = [
      t(lang, 'teamCard', { flag: tm.national ? '🏳️ ' : '', name: tm.name, country: tm.country ? ` · ${tm.country}` : '', venue: v }),
      t(lang, 'nextTitle'), ...(next.length ? next.map((f) => F.teamFixtureLine(f, tz, lang)) : [t(lang, 'none')]),
      t(lang, 'lastTitle'), ...(last.length ? last.map((f) => F.teamFixtureLine(f, tz, lang)) : [t(lang, 'none')]),
    ];
    const following = ((store.subscription(c) || {}).teams || []).some((x) => x.id === tm.id);
    const buttons = [[following ? button.callback(t(lang, 'unfollow'), `u:${tm.id}`) : button.callback(t(lang, 'follow'), `f:${tm.id}`)]];
    if (tm.logo) {
      try {
        return await bot.send({ ...(c.groupId ? { groupId: c.groupId } : { to: c.to }), type: 'image', fileUrl: tm.logo, caption: lines.join('\n'), buttons });
      } catch { /* image refusée : repli texte */ }
    }
    return say(c, lines.join('\n'), { buttons });
  }

  async function team(c, userId, q) {
    const { lang } = prefs(userId);
    const tm = await pickTeam(c, lang, q, 't');
    return tm ? teamCard(c, userId, tm.id) : undefined;
  }

  async function followTeam(c, userId, tm) {
    const p = prefs(userId);
    const r = store.follow(c.groupId ? { groupId: c.groupId } : { to: c.to }, { id: tm.id, name: tm.name }, p);
    if (r === 'already') return say(c, t(p.lang, 'already', { team: tm.name }));
    if (r === 'limit') return say(c, t(p.lang, 'followLimit', { n: LIMITS.TEAMS_PER_CHAT }));
    return say(c, t(p.lang, c.groupId ? 'followedGroup' : 'followed', { team: tm.name }), { buttons: [[button.callback(t(p.lang, 'btnMyTeams'), 'x:myteams')]] });
  }

  async function follow(c, userId, q) {
    const { lang } = prefs(userId);
    const tm = await pickTeam(c, lang, q, 'f');
    return tm ? followTeam(c, userId, tm) : undefined;
  }

  async function unfollow(c, userId, q) {
    const { lang } = prefs(userId);
    const sub = store.subscription(c);
    const nq = norm(q);
    const tm = sub && sub.teams.find((x) => norm(x.name) === nq || norm(x.name).includes(nq));
    if (!q || !tm) return say(c, t(lang, 'notFollowing'));
    store.unfollow(c, tm.id);
    return say(c, t(lang, 'unfollowed', { team: tm.name }));
  }

  async function myTeams(c, userId) {
    const { lang } = prefs(userId);
    const sub = store.subscription(c);
    if (!sub || !sub.teams.length) return say(c, t(lang, 'myTeamsNone'));
    const list = sub.teams.map((x, i) => `${i + 1}. ${x.name}`).join('\n');
    const buttons = sub.teams.slice(0, 10).map((x) => [button.callback(`${t(lang, 'unfollow')} ${F.clip(x.name, 24)}`, `u:${x.id}`)]);
    return say(c, t(lang, 'myTeams', { n: sub.teams.length, list }), { buttons });
  }

  // ---------------------------------------------------------------- compétitions
  async function leagueFrom(c, lang, arg) {
    if (!arg) { await say(c, t(lang, 'leagueAsk')); return null; }
    const l = findLeague(arg);
    if (!l) { await say(c, t(lang, 'leagueUnknown', { q: F.clip(arg, 30) })); return null; }
    const r = await resolveLeague(api, l);
    if (!r) { await say(c, t(lang, 'leagueUnknown', { q: F.clip(arg, 30) })); return null; }
    return r;
  }

  async function table(c, userId, arg) {
    const { lang } = prefs(userId);
    const l = await leagueFrom(c, lang, arg);
    if (!l) return undefined;
    const followed = new Set(((store.subscription(c) || {}).teams || []).map((x) => x.id));
    const s = F.standings(await api.standings(l.id, l.season), lang, { highlight: followed });
    if (!s) return say(c, t(lang, 'standingsNone'));
    return say(c, `${t(lang, 'standingsTitle', { league: s.league.name, season: seasonLabel(l.season, l.calendar) })}\n\n${s.text}`);
  }

  async function scorers(c, userId, arg) {
    const { lang } = prefs(userId);
    const l = await leagueFrom(c, lang, arg);
    if (!l) return undefined;
    const text = F.scorers(await api.scorers(l.id, l.season), lang);
    if (!text) return say(c, t(lang, 'scorersNone'));
    return say(c, `${t(lang, 'scorersTitle', { league: l.name, season: seasonLabel(l.season, l.calendar) })}\n\n${text}`);
  }

  function leagues(c, userId) {
    const { lang } = prefs(userId);
    const list = LEAGUES.map((l) => `${l.flag} **${l.name}** — \`${l.key}\``).join('\n');
    return say(c, t(lang, 'leagues', { list }));
  }

  // ---------------------------------------------------------------- réglages
  function setTz(c, userId, arg) {
    const p = prefs(userId);
    if (!arg) return say(c, t(p.lang, 'tzAsk', { tz: p.tz }));
    const z = resolveZone(arg);
    if (!z) return say(c, t(p.lang, 'tzBad'));
    p.tz = z;
    const sub = store.subscription(c);
    if (sub) sub.tz = z;
    store.save();
    return say(c, t(p.lang, 'tzSet', { tz: z }));
  }

  function setLang(c, userId, arg) {
    const p = prefs(userId);
    const v = String(arg || '').toLowerCase();
    if (!['fr', 'en'].includes(v)) return say(c, t(p.lang, 'langAsk'));
    p.lang = v;
    const sub = store.subscription(c);
    if (sub) sub.lang = v; // les alertes de cette conversation suivent la langue choisie
    store.save();
    return say(c, t(v, 'langSet'));
  }

  // ---------------------------------------------------------------- aiguillage
  async function commands(c, userId, cmd) {
    const p = prefs(userId);
    switch (cmd.name) {
      case 'start': return say(c, t(p.lang, 'welcome'), { buttons: quick(p.lang) });
      case 'help': return say(c, t(p.lang, 'help'), { buttons: quick(p.lang) });
      case 'about': return say(c, t(p.lang, 'about', { version: version ? `v${version}` : '', every: `${Math.round(tracker.interval() / 1000)} s`, tz: p.tz }));
      case 'live': return live(c, userId, cmd.arg);
      case 'day': return day(c, userId, cmd.arg);
      case 'match': return match(c, userId, cmd.arg);
      case 'team': return team(c, userId, cmd.arg);
      case 'free': return team(c, userId, cmd.arg);
      case 'follow': return follow(c, userId, cmd.arg);
      case 'unfollow': return unfollow(c, userId, cmd.arg);
      case 'myteams': return myTeams(c, userId);
      case 'table': return table(c, userId, cmd.arg);
      case 'scorers': return scorers(c, userId, cmd.arg);
      case 'leagues': return leagues(c, userId);
      case 'tz': return setTz(c, userId, cmd.arg);
      case 'lang': return setLang(c, userId, cmd.arg);
      default: return say(c, t(p.lang, 'unknown'));
    }
  }

  async function callback(c, userId, data) {
    const [kind, a, b] = String(data || '').split(':');
    const id = Number(a);
    switch (kind) {
      case 'x': return commands(c, userId, { name: a, arg: b === 'all' ? 'tout' : '' });
      case 't': return teamCard(c, userId, id);
      case 'm': return match(c, userId, a);
      case 'f': {
        const info = await api.team(id);
        return info ? followTeam(c, userId, info.team) : undefined;
      }
      case 'u': {
        const sub = store.subscription(c);
        const tm = sub && sub.teams.find((x) => x.id === id);
        if (!tm) return say(c, t(prefs(userId).lang, 'notFollowing'));
        store.unfollow(c, id);
        return say(c, t(prefs(userId).lang, 'unfollowed', { team: tm.name }));
      }
      default: return undefined;
    }
  }

  async function handle(update) {
    const d = update.data || {};
    const userId = d.from;
    if (!userId) return;
    let c;
    try {
      if (update.type === 'message.received') {
        c = { to: d.chatId || d.from };
        const cmd = parseCommand(d.textMsg);
        if (!cmd || d.type !== 'text') return;
        bot.sendChatAction(c.to, 'typing', 3).catch(() => {});
        await commands(c, userId, cmd);
      } else if (update.type === 'group_message.received') {
        c = { groupId: d.groupId };
        const cmd = parseCommand(d.textMsg);
        if (!cmd || d.type !== 'text' || (cmd.name === 'free' && !d.isMentioned)) return;
        if (cmd.name === 'free') cmd.arg = cmd.arg.replace(/@\w+/g, ' ').trim();
        await commands(c, userId, cmd);
      } else if (update.type === 'callback.received') {
        c = d.groupId ? { groupId: d.groupId } : { to: d.chatId || d.from };
        await callback(c, userId, d.data);
      }
    } catch (e) {
      const lang = prefs(userId).lang;
      const key = e && (e.code === 'quota' || e.code === 'plan') ? e.code : 'error';
      if (c) await say(c, t(lang, key), { markdown: false }).catch(() => {});
      log.error('échec de traitement', { type: update.type, error: e && e.message, code: e && e.code, status: e && e.status });
    }
  }

  return { handle, parseCommand };
}

// Saison « 2025-26 » pour les championnats européens ; « 2025 » pour les compétitions sur une année civile.
const seasonLabel = (y, calendar) => (calendar ? String(y) : Number(y) ? `${y}-${String(Number(y) + 1).slice(2)}` : String(y));

module.exports = { createHandler, parseCommand, resolveDay, COMMANDS };
