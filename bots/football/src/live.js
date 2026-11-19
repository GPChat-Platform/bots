'use strict';
// Traqueur du direct : UN appel `fixtures?live=all` partagé par tous les utilisateurs, à intervalle
// adapté au quota, puis comparaison avec l'état précédent de chaque match suivi pour produire les
// alertes (coup d'envoi, but, but annulé par la VAR, carton rouge, mi-temps, reprise, prolongation,
// tirs au but, fin du match, interruption).
//
// Fiabilité :
//  - les événements déjà notifiés sont mémorisés (store.seen) : un redémarrage en plein match ne
//    renvoie pas les buts passés (au premier passage, l'état courant sert de référence sans alerte,
//    sauf si le match vient juste de commencer) ;
//  - un match suivi qui disparaît du direct est relu (`fixtures?id=`) pour annoncer le score final ;
//  - l'envoi passe par une file à débit limité ; une conversation qui refuse définitivement
//    (403 : bot bloqué ou retiré du groupe, 404) est désabonnée.
const { t } = require('./i18n');
const F = require('./format');

const LIVE_DEFAULTS = { INTERVAL_MS: 60e3, MIN_INTERVAL_MS: 15e3, SHARE_TTL_MS: 45e3, SEND_PARALLEL: 8, SEND_GAP_MS: 60 };

/** Clé stable d'un événement API-Football (minute + type + joueur + équipe). */
const eventKey = (e) => `${e.type}|${e.detail}|${e.time && e.time.elapsed}+${(e.time && e.time.extra) || 0}|${(e.player && (e.player.id || e.player.name)) || ''}|${e.team && e.team.id}`;

const NOTABLE = (e) => (e.type === 'Goal' && !/missed/i.test(e.detail || '')) || (e.type === 'Card' && /red|second yellow/i.test(e.detail || '')) || (e.type === 'Var' && /goal (cancel|disallow)/i.test(e.detail || ''));

class LiveTracker {
  constructor({ api, store, send, now = Date.now, log = { info() {}, warn() {}, error() {} }, metrics = null, intervalMs = LIVE_DEFAULTS.INTERVAL_MS, sendGapMs = LIVE_DEFAULTS.SEND_GAP_MS }) {
    this.api = api; this.store = store; this.send = send; this.now = now; this.log = log; this.metrics = metrics;
    this.baseInterval = intervalMs; this.sendGapMs = sendGapMs;
    this.latest = null; // { at, fixtures } — partagé avec /direct
    this.timer = null;
    this.running = false;
    this.lastTickAt = 0;
    this.queue = [];
    this.sending = 0;
  }

  /**
   * Intervalle effectif : jamais plus fréquent que ce que permet le quota journalier
   * (70 % du quota pour le direct, le reste pour les commandes), ni que MIN_INTERVAL_MS.
   */
  interval() {
    const limit = this.api.quota && this.api.quota.dailyLimit;
    const byQuota = limit ? Math.ceil(86400e3 / (limit * 0.7)) : 0;
    return Math.max(this.baseInterval, byQuota, LIVE_DEFAULTS.MIN_INTERVAL_MS);
  }

  start() {
    const loop = async () => {
      try { await this.tick(); } catch (e) { this.log.error('direct en erreur', { error: e.message }); }
      this.timer = setTimeout(loop, this.interval());
      if (this.timer.unref) this.timer.unref();
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  healthy(now = this.now()) {
    return this.timer != null && now - this.lastTickAt < this.interval() * 4;
  }

  /** Matchs en direct pour /direct : le dernier relevé s'il est récent, sinon un nouvel appel (partagé). */
  async liveFixtures() {
    if (this.latest && this.now() - this.latest.at < Math.max(LIVE_DEFAULTS.SHARE_TTL_MS, this.interval())) return this.latest.fixtures;
    const fixtures = (await this.api.live()) || [];
    this.latest = { at: this.now(), fixtures };
    return fixtures;
  }

  /** Une passe : rien à faire si personne ne suit d'équipe. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.lastTickAt = this.now();
      const followed = this.store.followedTeamIds();
      if (!followed.size) return;
      const fixtures = (await this.api.live()) || [];
      this.latest = { at: this.now(), fixtures };
      const seenNow = new Set();
      for (const f of fixtures) {
        if (!followed.has(f.teams.home.id) && !followed.has(f.teams.away.id)) continue;
        seenNow.add(String(f.fixture.id));
        await this.diff(f);
      }
      // Matchs suivis qui ne sont plus en direct : terminés (ou reportés) depuis la passe précédente.
      for (const [id, s] of Object.entries(this.store.data.seen)) {
        if (seenNow.has(id) || s.final || !F.LIVE.has(s.status)) continue;
        const f = await this.api.fixture(id).catch(() => null);
        if (f) await this.diff(f);
      }
      this.store.purgeSeen(this.now());
    } finally {
      this.running = false;
    }
  }

  /** Compare un match à son dernier état connu et envoie les alertes nouvelles. */
  async diff(f) {
    const id = String(f.fixture.id);
    const status = f.fixture.status.short;
    const prev = this.store.seenFor(id);
    let events = Array.isArray(f.events) ? f.events : null;
    const goals = `${f.goals.home}-${f.goals.away}`;
    if (!events && (!prev || prev.goals !== goals || F.FINISHED.has(status))) events = await this.api.events(f.fixture.id).catch(() => null);
    const notable = (events || []).filter(NOTABLE);

    if (!prev) {
      // Premier passage : on ne rejoue pas le passé, sauf un match qui vient de commencer.
      const justStarted = status === '1H' && (f.fixture.status.elapsed || 0) <= 5;
      this.store.setSeen(id, { status, goals, keys: notable.map(eventKey), final: F.FINISHED.has(status) });
      if (justStarted) await this.broadcast(f, (lang) => t(lang, 'kickoff', { score: F.scoreBlock(f, lang) }));
      return;
    }

    const known = new Set(prev.keys || []);
    const fresh = notable.filter((e) => !known.has(eventKey(e)));
    for (const e of fresh) {
      await this.broadcast(f, (lang) => eventMessage(e, f, lang));
      known.add(eventKey(e));
    }
    // Score changé mais pas encore d'événement détaillé : alerte générique (le détail viendra s'il arrive).
    if (!fresh.some((e) => e.type === 'Goal') && prev.goals !== goals && sumGoals(goals) > sumGoals(prev.goals) && !events) {
      await this.broadcast(f, (lang) => t(lang, 'goalNoEvent', { score: F.scoreBlock(f, lang) }));
    }

    if (status !== prev.status) {
      const msg = statusMessage(prev.status, status, f);
      if (msg) await this.broadcast(f, msg);
    }
    this.store.setSeen(id, { status, goals, keys: [...known], final: F.FINISHED.has(status) || F.OFF.has(status) });
  }

  /** Envoie un message (fonction de la langue) à toutes les conversations qui suivent une des deux équipes. */
  async broadcast(f, render) {
    const subs = this.store.recipients([f.teams.home.id, f.teams.away.id]);
    if (this.metrics) this.metrics.inc('football_alerts_total', undefined, 1, 'Alertes de match produites');
    await Promise.all(subs.map((s) => this.enqueue(s, render(s.lang || 'fr'), f)));
  }

  /** File d'envoi : SEND_PARALLEL envois simultanés au plus, espacés de sendGapMs. */
  enqueue(sub, text, f) {
    return new Promise((resolve) => {
      this.queue.push({ sub, text, f, resolve });
      this.pump();
    });
  }

  pump() {
    while (this.sending < LIVE_DEFAULTS.SEND_PARALLEL && this.queue.length) {
      const job = this.queue.shift();
      this.sending += 1;
      this.deliver(job).finally(() => {
        setTimeout(() => { this.sending -= 1; this.pump(); }, this.sendGapMs);
        job.resolve();
      });
    }
  }

  async deliver({ sub, text, f }) {
    try {
      await this.send(sub.chat, text, f);
      if (this.metrics) this.metrics.inc('football_notifications_total', { result: 'ok' }, 1, 'Notifications envoyées');
    } catch (e) {
      if (this.metrics) this.metrics.inc('football_notifications_total', { result: 'error' }, 1, 'Notifications envoyées');
      if (e && (e.status === 403 || e.status === 404)) {
        this.store.dropChat(sub.chat);
        this.log.warn('conversation désabonnée (refus définitif)', { status: e.status });
      } else {
        this.log.warn('notification non envoyée', { error: e && e.message, status: e && e.status });
      }
    }
  }
}

const sumGoals = (g) => String(g || '0-0').split('-').reduce((a, x) => a + (Number(x) || 0), 0);

function eventMessage(e, f, lang) {
  const score = F.scoreBlock(f, lang);
  const player = (e.player && e.player.name) || '?';
  const team = (e.team && e.team.name) || '';
  if (e.type === 'Goal') {
    const kind = /own/i.test(e.detail) ? t(lang, 'ownGoal') : /penalty/i.test(e.detail) ? t(lang, 'penalty') : '';
    const assist = e.assist && e.assist.name && !/own/i.test(e.detail) ? t(lang, 'assist', { name: e.assist.name }) : '';
    return t(lang, 'goal', { minute: F.minute(e.time), player, kind, team, assist, score });
  }
  if (e.type === 'Var') return t(lang, 'varNoGoal', { minute: F.minute(e.time), team, score });
  return t(lang, 'red', { minute: F.minute(e.time), player, team, score });
}

/** Message de changement d'état, ou null si le changement n'intéresse pas l'utilisateur. */
function statusMessage(from, to, f) {
  const score = (lang) => F.scoreBlock(f, lang);
  if (to === '1H' && (from === 'NS' || from === 'TBD')) return (lang) => t(lang, 'kickoff', { score: score(lang) });
  if (to === 'HT') return (lang) => t(lang, 'halftime', { score: score(lang) });
  if (to === '2H' && from === 'HT') return (lang) => t(lang, 'secondHalf', { score: score(lang) });
  if (to === 'ET') return (lang) => t(lang, 'extraTime', { score: score(lang) });
  if (to === 'P') return (lang) => t(lang, 'penalties', { score: score(lang) });
  if (to === 'SUSP' || to === 'INT') return (lang) => t(lang, 'suspended', { score: score(lang) });
  if (F.OFF.has(to)) return (lang) => t(lang, 'postponed', { match: `${f.teams.home.name} – ${f.teams.away.name}` });
  if (F.FINISHED.has(to)) {
    return (lang) => {
      const w = f.teams.home.winner ? f.teams.home.name : f.teams.away.winner ? f.teams.away.name : null;
      return t(lang, 'fulltime', { score: score(lang), result: w ? t(lang, 'winner', { team: w }) : t(lang, 'draw') });
    };
  }
  return null;
}

module.exports = { LiveTracker, LIVE_DEFAULTS, eventKey, eventMessage, statusMessage };
