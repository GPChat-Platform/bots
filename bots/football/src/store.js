'use strict';
// État persistant : préférences, abonnements aux équipes (par conversation privée ou groupe) et événements
// déjà notifiés (pour ne jamais renvoyer un but après un redémarrage). Fichier JSON à écriture atomique.
const fs = require('node:fs');
const path = require('node:path');

const LIMITS = { TEAMS_PER_CHAT: 15, SEEN_TTL_MS: 2 * 24 * 3600e3 };

const chatKey = (chat) => (chat.groupId ? `g:${chat.groupId}` : `u:${chat.to}`);

class Store {
  constructor(file, { defaultTz = 'Africa/Douala', defaultLang = 'fr' } = {}) {
    this.file = file;
    this.defaults = { tz: defaultTz, lang: defaultLang };
    this.data = { users: {}, subs: {}, seen: {} };
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fichier illisible : état vide */ }
    }
    for (const k of ['users', 'subs', 'seen']) this.data[k] = this.data[k] || {};
    this.rebuildIndex();
  }

  user(id) {
    if (!this.data.users[id]) this.data.users[id] = { lang: this.defaults.lang, tz: this.defaults.tz };
    return this.data.users[id];
  }

  // ---------------------------------------------------------------- abonnements
  /** Index équipe → clés de conversation, pour retrouver vite qui prévenir. */
  rebuildIndex() {
    this.byTeam = new Map();
    for (const [key, s] of Object.entries(this.data.subs)) {
      for (const t of s.teams) {
        if (!this.byTeam.has(t.id)) this.byTeam.set(t.id, new Set());
        this.byTeam.get(t.id).add(key);
      }
    }
  }

  subscription(chat) {
    return this.data.subs[chatKey(chat)] || null;
  }

  follow(chat, team, { lang, tz }) {
    const key = chatKey(chat);
    const s = this.data.subs[key] || (this.data.subs[key] = { chat, lang, tz, teams: [] });
    s.lang = lang; s.tz = tz;
    if (s.teams.some((t) => t.id === team.id)) return 'already';
    if (s.teams.length >= LIMITS.TEAMS_PER_CHAT) return 'limit';
    s.teams.push({ id: team.id, name: team.name });
    this.rebuildIndex();
    this.save();
    return 'ok';
  }

  unfollow(chat, teamId) {
    const key = chatKey(chat);
    const s = this.data.subs[key];
    if (!s) return false;
    const before = s.teams.length;
    s.teams = s.teams.filter((t) => t.id !== teamId);
    if (!s.teams.length) delete this.data.subs[key];
    this.rebuildIndex();
    this.save();
    return before !== (s.teams ? s.teams.length : 0);
  }

  /** Supprime tous les abonnements d'une conversation (bot bloqué, retiré du groupe…). */
  dropChat(chat) {
    delete this.data.subs[chatKey(chat)];
    this.rebuildIndex();
    this.save();
  }

  /** Conversations à prévenir pour un match (équipe à domicile ou à l'extérieur suivie). */
  recipients(teamIds) {
    const keys = new Set();
    for (const id of teamIds) for (const k of this.byTeam.get(id) || []) keys.add(k);
    return [...keys].map((k) => this.data.subs[k]).filter(Boolean);
  }

  followedTeamIds() {
    return new Set(this.byTeam.keys());
  }

  // ---------------------------------------------------------------- événements déjà notifiés
  seenFor(fixtureId) {
    return this.data.seen[fixtureId] || null;
  }

  setSeen(fixtureId, state) {
    this.data.seen[fixtureId] = { ...state, at: Date.now() };
    this.save();
  }

  purgeSeen(now = Date.now()) {
    for (const [id, s] of Object.entries(this.data.seen)) if (now - (s.at || 0) > LIMITS.SEEN_TTL_MS) delete this.data.seen[id];
  }

  stats() {
    const subs = Object.values(this.data.subs);
    return { chats: subs.length, groups: subs.filter((s) => s.chat.groupId).length, teams: this.byTeam.size };
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    if (this.timer.unref) this.timer.unref();
  }

  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, LIMITS, chatKey };
