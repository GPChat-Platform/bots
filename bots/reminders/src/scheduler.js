'use strict';
// Planificateur : toutes les `tickMs`, envoie les rappels arrivés à échéance.
//
// Garanties :
//  - un rappel n'est jamais envoyé deux fois en parallèle (verrou en mémoire `inFlight`) ;
//  - échec d'envoi : nouvel essai avec repli exponentiel (30 s, 1 min, 2 min… 6 essais), puis abandon journalisé ;
//    un refus définitif de l'API (403 : bot bloqué / hors du groupe, 404 : destinataire introuvable) arrête aussitôt ;
//  - après un redémarrage, les rappels en retard sont envoyés avec la mention du retard ; une récurrence
//    manquée plusieurs fois ne produit qu'un seul message, puis reprend à la prochaine échéance future ;
//  - au plus `parallel` envois simultanés (respect du quota de l'API).
const { nextOccurrence } = require('./schedule');

const SCHEDULER = { TICK_MS: 5000, PARALLEL: 10, MAX_ATTEMPTS: 6, RETRY_BASE_MS: 30000, LATE_NOTICE_MS: 2 * 60 * 1000 };

class Scheduler {
  /**
   * @param {object} o
   * @param {import('./store').Store} o.store
   * @param {(r: object, info: { lateMs: number, nextAt: number|null }) => Promise<void>} o.deliver envoie le message du rappel
   */
  constructor({ store, deliver, now = Date.now, log = { info() {}, warn() {}, error() {} }, metrics = {}, tickMs = SCHEDULER.TICK_MS, parallel = SCHEDULER.PARALLEL }) {
    this.store = store; this.deliver = deliver; this.now = now; this.log = log; this.metrics = metrics;
    this.tickMs = tickMs; this.parallel = parallel;
    this.inFlight = new Set();
    this.timer = null;
    this.lastTickAt = 0;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tick().catch((e) => this.log.error('tick en erreur', { error: e.message })); }, this.tickMs);
    if (this.timer.unref) this.timer.unref();
    this.tick().catch(() => {});
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Une passe : envoie ce qui est dû. Renvoie le nombre de rappels traités. */
  async tick() {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = this.now();
      this.lastTickAt = now;
      const due = this.store.due(now).filter((r) => !this.inFlight.has(r.id));
      let i = 0;
      const worker = async () => {
        while (i < due.length) {
          const r = due[i++];
          await this.fire(r, now);
        }
      };
      await Promise.all(Array.from({ length: Math.min(this.parallel, due.length) }, worker));
      if (now % 600000 < this.tickMs) this.store.purge(now);
      return due.length;
    } finally {
      this.running = false;
    }
  }

  async fire(r, now) {
    this.inFlight.add(r.id);
    try {
      const dueAt = r.originalAt || r.nextAt; // échéance d'origine (inchangée par les nouveaux essais)
      const lateMs = Math.max(0, now - dueAt);
      const nextAt = r.rule ? nextOccurrence(r.rule, Math.max(now, dueAt), r.tz, dueAt) : null;
      await this.deliver(r, { lateMs: lateMs > SCHEDULER.LATE_NOTICE_MS ? lateMs : 0, nextAt });
      if (r.rule && Number.isFinite(nextAt)) {
        this.store.update(r.id, { nextAt, originalAt: null, lastFiredAt: now, fired: (r.fired || 0) + 1, attempts: 0 });
      } else {
        this.store.update(r.id, { status: 'fired', originalAt: null, lastFiredAt: now, endedAt: now, fired: (r.fired || 0) + 1, attempts: 0 });
      }
      this.count('fired');
    } catch (e) {
      const attempts = (r.attempts || 0) + 1;
      const permanent = e && (e.status === 403 || e.status === 404);
      if (permanent || attempts >= SCHEDULER.MAX_ATTEMPTS) {
        this.store.update(r.id, { status: 'failed', endedAt: now, attempts, lastError: String(e && e.message).slice(0, 200) });
        this.log.error('rappel abandonné', { id: r.id, attempts, status: e && e.status, error: e && e.message });
        this.count('failed');
      } else {
        const delay = SCHEDULER.RETRY_BASE_MS * 2 ** (attempts - 1);
        // Le rappel garde son échéance d'origine pour le calcul du retard : on ne décale que la prochaine tentative.
        this.store.update(r.id, { attempts, nextAt: now + delay, originalAt: r.originalAt || r.nextAt });
        this.log.warn('envoi de rappel en échec, nouvel essai', { id: r.id, attempts, inMs: delay, error: e && e.message });
        this.count('retried');
      }
    } finally {
      this.inFlight.delete(r.id);
    }
  }

  count(result) {
    if (typeof this.metrics.inc === 'function') this.metrics.inc('reminders_fired_total', { result }, 1, 'Rappels envoyés (fired), réessayés (retried) ou abandonnés (failed)');
  }

  /** Santé : le planificateur tourne-t-il encore ? (utilisé par /readyz) */
  healthy(now = this.now()) {
    return this.timer != null && now - this.lastTickAt < this.tickMs * 6;
  }
}

module.exports = { Scheduler, SCHEDULER };
