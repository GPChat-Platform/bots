'use strict';
// Compétitions proposées en raccourci (/classement ligue1, /buteurs can…) et résolution de la saison en cours.
// Les identifiants sont ceux d'API-Football ; une compétition sans identifiant fixe est retrouvée par
// pays + nom (ex. Elite One au Cameroun) puis mise en cache.

const LEAGUES = [
  { key: 'can', id: 6, name: 'Coupe d’Afrique des Nations', short: 'CAN', aliases: ['afcon', 'can', 'coupe d afrique', 'africa cup'], flag: '🌍' },
  { key: 'cafcl', id: 12, name: 'Ligue des champions de la CAF', short: 'LdC CAF', aliases: ['caf', 'cafcl', 'ldc caf', 'caf champions league'], flag: '🌍' },
  { key: 'elite1', country: 'Cameroon', match: /elite one/i, name: 'Elite One (Cameroun)', short: 'Elite One', aliases: ['elite1', 'elite one', 'mtn elite one', 'cameroun', 'cameroon'], flag: '🇨🇲' },
  { key: 'ucl', id: 2, name: 'Ligue des champions', short: 'LdC', aliases: ['ucl', 'ldc', 'champions league', 'ligue des champions', 'c1'], flag: '🇪🇺' },
  { key: 'uel', id: 3, name: 'Ligue Europa', short: 'Europa', aliases: ['uel', 'europa', 'europa league', 'c3'], flag: '🇪🇺' },
  { key: 'pl', id: 39, name: 'Premier League', short: 'PL', aliases: ['pl', 'premier league', 'epl', 'angleterre', 'england'], flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'liga', id: 140, name: 'LaLiga', short: 'Liga', aliases: ['liga', 'laliga', 'la liga', 'espagne', 'spain'], flag: '🇪🇸' },
  { key: 'ligue1', id: 61, name: 'Ligue 1', short: 'L1', aliases: ['ligue1', 'ligue 1', 'l1', 'france'], flag: '🇫🇷' },
  { key: 'seriea', id: 135, name: 'Serie A', short: 'Serie A', aliases: ['seriea', 'serie a', 'italie', 'italy'], flag: '🇮🇹' },
  { key: 'bundesliga', id: 78, name: 'Bundesliga', short: 'Bundesliga', aliases: ['bundesliga', 'allemagne', 'germany', 'bl'], flag: '🇩🇪' },
  { key: 'wc', id: 1, name: 'Coupe du monde', short: 'CM', aliases: ['wc', 'coupe du monde', 'world cup', 'mondial', 'cdm'], flag: '🏆' },
];

/** Compétitions mises en avant dans /direct et /matchs (les autres restent accessibles avec « tout »). */
const FEATURED_IDS = new Set([6, 12, 2, 3, 39, 140, 61, 135, 78, 1, 848, 4, 9, 29, 30, 31, 32, 33, 34, 36, 19, 20]);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function findLeague(input) {
  const q = norm(input);
  if (!q) return null;
  return LEAGUES.find((l) => l.key === q || l.aliases.some((a) => norm(a) === q)) || LEAGUES.find((l) => norm(l.name).includes(q) || l.aliases.some((a) => norm(a).startsWith(q))) || null;
}

/**
 * Identifiant et saison en cours d'une compétition : { id, season, name, logo } (mis en cache par le client API).
 * @param {import('./api').FootballApi} api
 */
async function resolveLeague(api, league) {
  let id = league.id;
  if (!id) {
    const list = await api.get('/leagues', { country: league.country }, { ttl: 24 * 3600e3 });
    const found = (list || []).find((x) => league.match.test(x.league && x.league.name));
    if (!found) return null;
    id = found.league.id;
  }
  const info = await api.leagueCurrent(id);
  const seasons = (info && info.seasons) || [];
  const cur = seasons.find((s) => s.current) || seasons[seasons.length - 1];
  const calendar = Boolean(cur && cur.start && cur.end && cur.start.slice(0, 4) === cur.end.slice(0, 4));
  return { id, calendar, season: cur ? cur.year : new Date().getUTCFullYear(), name: (info && info.league && info.league.name) || league.name, logo: info && info.league && info.league.logo };
}

module.exports = { LEAGUES, FEATURED_IDS, findLeague, resolveLeague, norm };
