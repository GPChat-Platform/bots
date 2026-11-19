'use strict';
// Stockage des rappels et des préférences : un fichier JSON écrit de façon atomique (fichier temporaire
// puis renommage), différé de 300 ms pour regrouper les écritures. Suffisant pour quelques dizaines de
// milliers de rappels ; même interface à garder pour passer à SQLite/Postgres.
const fs = require('node:fs');
const path = require('node:path');

const LIMITS = { ACTIVE_PER_USER: 50, ACTIVE_PER_GROUP: 30, KEEP_DONE_MS: 2 * 24 * 3600 * 1000 };

class Store {
  constructor(file, { defaultTz = 'Africa/Douala', defaultLang = 'fr' } = {}) {
    this.file = file;
    this.defaults = { tz: defaultTz, lang: defaultLang };
    this.data = { seq: 0, users: {}, reminders: {} };
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fichier illisible : on repart d'un état vide */ }
    }
    this.data.users = this.data.users || {};
    this.data.reminders = this.data.reminders || {};
    this.data.seq = this.data.seq || 0;
  }

  user(id) {
    if (!this.data.users[id]) this.data.users[id] = { lang: this.defaults.lang, tz: this.defaults.tz };
    return this.data.users[id];
  }

  /** Identifiant court et lisible (base 36), unique dans ce fichier. */
  nextId() {
    this.data.seq += 1;
    return this.data.seq.toString(36);
  }

  add(r) {
    const id = this.nextId();
    const rec = { id, status: 'active', attempts: 0, fired: 0, createdAt: Date.now(), ...r };
    this.data.reminders[id] = rec;
    this.save();
    return rec;
  }

  get(id) {
    return this.data.reminders[id] || null;
  }

  update(id, patch) {
    const r = this.data.reminders[id];
    if (!r) return null;
    Object.assign(r, patch);
    this.save();
    return r;
  }

  remove(id) {
    const r = this.data.reminders[id];
    delete this.data.reminders[id];
    this.save();
    return r || null;
  }

  /** Rappels actifs d'une conversation (privée : `to` ; groupe : `groupId`), triés par échéance. */
  activeFor({ owner, groupId }) {
    return Object.values(this.data.reminders)
      .filter((r) => r.status === 'active' && (groupId ? r.chat.groupId === groupId : r.owner === owner && !r.chat.groupId))
      .sort((a, b) => a.nextAt - b.nextAt);
  }

  countActive({ owner, groupId }) {
    return this.activeFor({ owner, groupId }).length;
  }

  /** Rappels dont l'échéance est atteinte. */
  due(now) {
    return Object.values(this.data.reminders).filter((r) => r.status === 'active' && r.nextAt <= now).sort((a, b) => a.nextAt - b.nextAt);
  }

  /** Supprime les rappels terminés depuis plus de KEEP_DONE_MS (gardés un temps pour « Reporter »). */
  purge(now) {
    let n = 0;
    for (const r of Object.values(this.data.reminders)) {
      if (r.status !== 'active' && now - (r.endedAt || r.createdAt) > LIMITS.KEEP_DONE_MS) {
        delete this.data.reminders[r.id];
        n += 1;
      }
    }
    if (n) this.save();
    return n;
  }

  stats() {
    const all = Object.values(this.data.reminders);
    return { active: all.filter((r) => r.status === 'active').length, recurring: all.filter((r) => r.status === 'active' && r.rule).length, users: Object.keys(this.data.users).length };
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

module.exports = { Store, LIMITS };
