'use strict';
// Client API-Football v3 (api-sports.io) : cache par type de donnée, déduplication des requêtes
// simultanées et garde-fou de quota.
//
// Le quota journalier est la ressource rare (100 req/jour en gratuit, 7 500 en « Pro ») : le direct
// est lu par UN SEUL appel partagé (`live()`, voir live.js), les autres données sont mises en cache
// (classements 10 min, calendrier du jour 5 min, recherche d'équipes 24 h…). Quand le quota restant
// passe sous `reserve`, le client ne sert plus que le cache (même expiré) et signale le mode dégradé.

const TTL = {
  live: 0, // jamais mis en cache ici : c'est le traqueur qui partage le résultat
  fixturesToday: 5 * 60e3,
  fixturesOther: 60 * 60e3,
  fixture: 60e3,
  team: 24 * 3600e3,
  teamFixtures: 10 * 60e3,
  standings: 10 * 60e3,
  scorers: 60 * 60e3,
  league: 24 * 3600e3,
};

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class FootballApi {
  /**
   * @param {{ key: string, baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number, reserve?: number, now?: () => number, log?: object }} o
   */
  constructor({ key, baseUrl = 'https://v3.football.api-sports.io', fetchImpl = fetch, timeoutMs = 10000, reserve = 50, now = Date.now, log = { warn() {}, info() {} } }) {
    this.key = key; this.base = baseUrl; this.fetch = fetchImpl; this.timeout = timeoutMs;
    this.reserve = reserve; this.now = now; this.log = log;
    this.cache = new Map(); // url -> { at, ttl, data }
    this.pending = new Map(); // url -> Promise (requêtes identiques simultanées : un seul appel)
    this.quota = { dailyRemaining: null, dailyLimit: null, minuteRemaining: null, updatedAt: 0 };
    this.calls = 0;
    this.onCall = null; // (endpoint, status) => void — branché sur les métriques
  }

  /** Le quota restant est-il trop bas pour faire de nouveaux appels non essentiels ? */
  get degraded() {
    return this.quota.dailyRemaining != null && this.quota.dailyRemaining <= this.reserve;
  }

  async get(path, params = {}, { ttl = 0, essential = false } = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
    const key = url.toString();
    const hit = this.cache.get(key);
    const fresh = hit && this.now() - hit.at < hit.ttl;
    if (fresh) return hit.data;
    if (this.degraded && !essential) {
      if (hit) return hit.data; // mieux vaut une donnée un peu ancienne que rien
      throw new ApiError('quota presque épuisé', { code: 'quota' });
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const p = this.request(key, path).then((data) => {
      if (ttl > 0) this.cache.set(key, { at: this.now(), ttl, data });
      if (this.cache.size > 3000) this.evict();
      return data;
    }).catch((e) => {
      if (hit) { this.log.warn('API football en erreur : cache servi', { path, error: e.message }); return hit.data; }
      throw e;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  async request(url, path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    let res;
    try {
      this.calls += 1;
      res = await this.fetch(url, { headers: { 'x-apisports-key': this.key, accept: 'application/json' }, signal: ctrl.signal });
    } catch (e) {
      if (this.onCall) this.onCall(path, 'réseau');
      throw new ApiError(e.name === 'AbortError' ? 'délai dépassé' : e.message, { code: 'network' });
    } finally {
      clearTimeout(timer);
    }
    this.readQuota(res.headers);
    if (this.onCall) this.onCall(path, `${String(res.status)[0]}xx`);
    if (res.status === 429) throw new ApiError('trop de requêtes (limite par minute)', { status: 429, code: 'rate' });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, { status: res.status });
    const json = await res.json();
    // API-Football renvoie 200 avec un champ `errors` non vide en cas de clé invalide, quota atteint, paramètre refusé…
    const errs = json && json.errors && (Array.isArray(json.errors) ? json.errors : Object.values(json.errors));
    if (errs && errs.length) {
      const msg = errs.map(String).join(' ; ');
      // « plan » : donnée hors de l'offre souscrite (ex. saison en cours en offre gratuite) — ce n'est pas une panne.
      const code = /plan|do not have access/i.test(msg) ? 'plan' : /request|limit|quota/i.test(msg) ? 'quota' : /token|key|subscri/i.test(msg) ? 'auth' : 'api';
      if (code === 'quota') this.quota.dailyRemaining = 0;
      throw new ApiError(msg, { code });
    }
    return json.response;
  }

  readQuota(h) {
    if (!h || typeof h.get !== 'function') return;
    const day = h.get('x-ratelimit-requests-remaining');
    const limit = h.get('x-ratelimit-requests-limit');
    const minute = h.get('x-ratelimit-remaining');
    if (day != null && day !== '') this.quota.dailyRemaining = Number(day);
    if (limit != null && limit !== '') this.quota.dailyLimit = Number(limit);
    if (minute != null && minute !== '') this.quota.minuteRemaining = Number(minute);
    this.quota.updatedAt = this.now();
  }

  evict() {
    const now = this.now();
    for (const [k, v] of this.cache) if (now - v.at > v.ttl) this.cache.delete(k);
  }

  // ---------------------------------------------------------------- points d'accès utilisés
  /** Tous les matchs en cours (un seul appel pour tout le monde). */
  live() { return this.get('/fixtures', { live: 'all' }, { essential: true }); }
  fixturesByDate(date, tz, isToday) { return this.get('/fixtures', { date, timezone: tz }, { ttl: isToday ? TTL.fixturesToday : TTL.fixturesOther }); }
  fixture(id) { return this.get('/fixtures', { id }, { ttl: TTL.fixture, essential: true }).then((r) => (r && r[0]) || null); }
  events(fixtureId) { return this.get('/fixtures/events', { fixture: fixtureId }, { ttl: 30e3, essential: true }); }
  searchTeams(q) { return this.get('/teams', { search: q }, { ttl: TTL.team }); }
  team(id) { return this.get('/teams', { id }, { ttl: TTL.team }).then((r) => (r && r[0]) || null); }
  teamNext(id, n = 5) { return this.get('/fixtures', { team: id, next: n }, { ttl: TTL.teamFixtures }); }
  teamLast(id, n = 5) { return this.get('/fixtures', { team: id, last: n }, { ttl: TTL.teamFixtures }); }
  standings(league, season) { return this.get('/standings', { league, season }, { ttl: TTL.standings }); }
  scorers(league, season) { return this.get('/players/topscorers', { league, season }, { ttl: TTL.scorers }); }
  leagueCurrent(id) { return this.get('/leagues', { id, current: 'true' }, { ttl: TTL.league }).then((r) => (r && r[0]) || null); }
  searchLeague(name, country) { return this.get('/leagues', { search: name, country }, { ttl: TTL.league }); }
}

module.exports = { FootballApi, ApiError, TTL };
