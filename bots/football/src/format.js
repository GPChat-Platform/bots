'use strict';
// Mise en forme des données API-Football pour GPChat (Markdown léger, lisible sur mobile).
const { t } = require('./i18n');

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const OFF = new Set(['PST', 'CANC', 'ABD']);

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const loc = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');

function hour(iso, tz, lang) {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function dayShort(iso, tz, lang) {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** « 67' », « 45+2' ». */
function minute(time) {
  if (!time || time.elapsed == null) return '';
  return `${time.elapsed}${time.extra ? `+${time.extra}` : ''}'`;
}

/** État court d'un match : « 67' », « MT », « Terminé », « 20:00 ». */
function state(f, tz, lang) {
  const s = f.fixture.status.short;
  if (s === 'HT') return lang === 'en' ? 'HT' : 'MT';
  if (LIVE.has(s)) return f.fixture.status.elapsed != null ? `${f.fixture.status.elapsed}'` : t(lang, `status.${s}`);
  if (FINISHED.has(s)) return s === 'FT' ? (lang === 'en' ? 'FT' : 'Fin') : t(lang, `status.${s}`);
  if (OFF.has(s)) return t(lang, `status.${s}`);
  return hour(f.fixture.date, tz, lang);
}

/** « Cameroun 2 – 1 Égypte » (score en gras si commencé). */
function scoreLine(f) {
  const h = f.teams.home.name;
  const a = f.teams.away.name;
  const gh = f.goals.home;
  const ga = f.goals.away;
  if (gh == null || ga == null) return `${h} – ${a}`;
  return `${h} **${gh} – ${ga}** ${a}`;
}

/** Ligne de liste : « 67' · Cameroun **2 – 1** Égypte  #1234 ». */
function fixtureLine(f, tz, lang) {
  const live = LIVE.has(f.fixture.status.short) ? '🔴 ' : '';
  return `${live}\`${state(f, tz, lang).padEnd(5)}\` ${scoreLine(f)}`;
}

/** Bloc « score » des alertes : ligne de score + compétition et tour. */
function scoreBlock(f, lang) {
  const round = f.league.round ? ` · ${f.league.round}` : '';
  const pens = f.score && f.score.penalty && f.score.penalty.home != null ? t(lang, 'pens', { h: f.score.penalty.home, a: f.score.penalty.away }) : '';
  return `${scoreLine(f)}${pens}\n_${f.league.name}${round}_`;
}

/** Regroupe des matchs par compétition, dans l'ordre d'apparition (compétitions phares d'abord). */
function byLeague(fixtures, tz, lang, max = 30) {
  const groups = new Map();
  for (const f of fixtures) {
    const k = f.league.id;
    if (!groups.has(k)) groups.set(k, { league: f.league, items: [] });
    groups.get(k).items.push(f);
  }
  const out = [];
  let shown = 0;
  for (const g of groups.values()) {
    if (shown >= max) break;
    out.push(`\n**${g.league.name}**${g.league.country && g.league.country !== 'World' ? ` · ${g.league.country}` : ''}`);
    for (const f of g.items) {
      if (shown >= max) break;
      out.push(`${fixtureLine(f, tz, lang)}  /match_${f.fixture.id}`);
      shown += 1;
    }
  }
  return { text: out.join('\n'), shown };
}

/** Fiche d'un match : score, état, chronologie (buts, cartons, remplacements exclus). */
function matchDetails(f, events, tz, lang) {
  const s = f.fixture.status;
  const head = `**${f.league.name}**${f.league.round ? ` · ${f.league.round}` : ''}\n${scoreLine(f)}`;
  const st = LIVE.has(s.short) || FINISHED.has(s.short) || OFF.has(s.short)
    ? `${t(lang, `status.${s.short}`) || s.long}${s.elapsed != null && LIVE.has(s.short) ? ` · ${s.elapsed}'` : ''}`
    : `${dayShort(f.fixture.date, tz, lang)} · ${hour(f.fixture.date, tz, lang)}`;
  const venue = f.fixture.venue && f.fixture.venue.name ? `\n🏟️ ${f.fixture.venue.name}${f.fixture.venue.city ? `, ${f.fixture.venue.city}` : ''}` : '';
  const lines = (events || [])
    .filter((e) => e.type === 'Goal' || (e.type === 'Card' && /red|second yellow/i.test(e.detail)) || (e.type === 'Var' && /cancel|disallow/i.test(e.detail)))
    .filter((e) => !/missed/i.test(e.detail || ''))
    .map((e) => {
      const icon = e.type === 'Goal' ? '⚽' : e.type === 'Var' ? '📺' : '🟥';
      const kind = e.type === 'Goal' && /own/i.test(e.detail) ? t(lang, 'ownGoal') : e.type === 'Goal' && /penalty/i.test(e.detail) ? t(lang, 'penalty') : '';
      return `${minute(e.time).padStart(4)} ${icon} ${e.player && e.player.name ? e.player.name : '?'}${kind} · ${e.team && e.team.name}`;
    });
  return `${head}\n${st}${venue}${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
}

function standings(resp, lang, { highlight = new Set(), max = 20 } = {}) {
  const league = resp && resp[0] && resp[0].league;
  if (!league || !league.standings || !league.standings.length) return null;
  const tables = league.standings;
  const multi = tables.length > 1;
  const out = [];
  for (const table of tables.slice(0, multi ? 8 : 1)) {
    if (multi) out.push(`\n**${clip(table[0] && table[0].group, 40)}**`);
    for (const r of table.slice(0, multi ? 4 : max)) {
      const me = highlight.has(r.team.id) ? '🔔 ' : '';
      const gd = r.goalsDiff > 0 ? `+${r.goalsDiff}` : String(r.goalsDiff);
      out.push(`${String(r.rank).padStart(2)}. ${me}${clip(r.team.name, 22)} — **${r.points}** ${t(lang, 'pts')} (${r.all.played} ${t(lang, 'played')}, ${gd})`);
    }
  }
  return { league, text: out.join('\n') };
}

function scorers(resp, lang, max = 10) {
  if (!resp || !resp.length) return null;
  return resp.slice(0, max).map((p, i) => {
    const st = p.statistics && p.statistics[0];
    const goals = st && st.goals ? st.goals.total : 0;
    const team = st && st.team ? st.team.name : '';
    return `${String(i + 1).padStart(2)}. **${p.player.name}** (${team}) — ${goals} ${t(lang, 'goals')}`;
  }).join('\n');
}

/** Ligne de résultat / prochain match d'une équipe sur la fiche. */
function teamFixtureLine(f, tz, lang) {
  const when = FINISHED.has(f.fixture.status.short) || LIVE.has(f.fixture.status.short) ? dayShort(f.fixture.date, tz, lang) : `${dayShort(f.fixture.date, tz, lang)} ${hour(f.fixture.date, tz, lang)}`;
  return `• ${when} — ${scoreLine(f)} _(${clip(f.league.name, 28)})_`;
}

module.exports = { LIVE, FINISHED, OFF, minute, state, scoreLine, scoreBlock, fixtureLine, byLeague, matchDetails, standings, scorers, teamFixtureLine, hour, dayShort, clip };
