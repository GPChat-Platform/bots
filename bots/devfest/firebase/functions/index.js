'use strict';
/**
 * Guide DevFest sur Firebase Functions (projet GPChat) : le bot en mode WEBHOOK.
 *
 *   devfestBotWebhook   HTTPS    reçoit les événements GPChat (signature HMAC vérifiée) et répond au bot
 *   devfestBotReminders planifié chaque minute : rappels « 10 minutes avant »
 *   devfestBotBroadcastWorker  déclencheur Firestore : envoie un lot d'annonce (50 destinataires), compte, confirme à la fin
 *
 * Secrets (Secret Manager) : DEVFEST_BOT_API_KEY, DEVFEST_BOT_WEBHOOK_SECRET.
 * Paramètre : DEVFEST_ADMIN_IDS (userId des organisateurs, séparés par des virgules).
 * Déploiement : voir ../README.md (le code métier est copié dans lib/ par `npm run build`).
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { GPChatBot, verifyWebhookSignature } = require('./lib/gpchat-bot');
const { createRuntime, sendBatch } = require('./runtime');
const { S } = require('./lib/handlers');
const program = require('./lib/program.json');

admin.initializeApp();
const db = admin.firestore();
const API_KEY = defineSecret('DEVFEST_BOT_API_KEY');
const WEBHOOK_SECRET = defineSecret('DEVFEST_BOT_WEBHOOK_SECRET');
const ADMIN_IDS = defineString('DEVFEST_ADMIN_IDS', { default: '' });

const USERS = 'devfestBotUsers';
const SEEN = 'devfestBotSeen';
const BROADCASTS = 'devfestBotBroadcasts';
const JOBS = 'devfestBotBroadcastJobs';
const BATCH_SIZE = 50;

const firestoreDb = {
  async getUser(id) {
    const s = await db.collection(USERS).doc(id).get();
    return s.exists ? s.data() : null;
  },
  async setUser(id, data) {
    await db.collection(USERS).doc(id).set({ ...data, hasReminders: (data.reminders || []).length > 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  },
  async allUserIds() {
    const snap = await db.collection(USERS).select().get();
    return snap.docs.map((d) => d.id);
  },
  async usersWithReminders() {
    const snap = await db.collection(USERS).where('hasReminders', '==', true).get();
    return snap.docs.map((d) => {
      const { hasReminders, updatedAt, ...data } = d.data();
      return { id: d.id, data };
    });
  },
  /** Met une annonce en file : un document parent (compteurs) et un document par lot de 50 destinataires. */
  async enqueueBroadcast(text, fromUserId, lang, ids) {
    const parent = db.collection(BROADCASTS).doc();
    const chunks = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE));
    await parent.set({ text, fromUserId, lang: lang || 'fr', total: ids.length, sent: 0, failed: 0, jobs: chunks.length, jobsDone: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    for (let i = 0; i < chunks.length; i += 400) {
      const batch = db.batch();
      chunks.slice(i, i + 400).forEach((recipients, k) => batch.set(db.collection(JOBS).doc(), { broadcastId: parent.id, index: i + k, text, recipients, status: 'pending' }));
      await batch.commit();
    }
    return parent.id;
  },
  /** true la première fois ; false si l'événement a déjà été vu (GPChat peut livrer deux fois). */
  async markSeen(eventId) {
    try {
      // Un TTL Firestore sur `expireAt` (à activer dans la console) purge ces documents après 7 jours.
      await db.collection(SEEN).doc(Buffer.from(eventId).toString('base64url').slice(0, 200)).create({ at: admin.firestore.FieldValue.serverTimestamp(), expireAt: new Date(Date.now() + 7 * 864e5) });
      return true;
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message)) return false;
      throw e;
    }
  },
};

function runtime() {
  const bot = new GPChatBot({ apiKey: API_KEY.value() });
  const admins = ADMIN_IDS.value().split(',').map((s) => s.trim()).filter(Boolean);
  return createRuntime({ db: firestoreDb, bot, program, admins, log: { error: (m, f) => logger.error(m, f), warn: (m, f) => logger.warn(m, f), info: (m, f) => logger.info(m, f) } });
}

exports.devfestBotWebhook = onRequest(
  { region: 'us-central1', secrets: [API_KEY, WEBHOOK_SECRET], timeoutSeconds: 60, memory: '256MiB', maxInstances: 20, minInstances: 0, concurrency: 40 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('method not allowed');
    const raw = req.rawBody;
    const secrets = WEBHOOK_SECRET.value().split(',').map((s) => s.trim()).filter(Boolean);
    if (!raw || !verifyWebhookSignature(raw, req.get('x-gpchat-signature'), secrets)) {
      logger.warn('signature de webhook invalide');
      return res.status(401).send('invalid signature');
    }
    const update = req.body;
    try {
      // Serverless : on traite AVANT de répondre (l'instance peut être gelée dès la réponse) ; GPChat attend < 10 s.
      await runtime().handleEvent({ id: update && update.data && update.data.msgId, ...update });
      return res.status(200).json({ ok: true });
    } catch (e) {
      logger.error('échec de traitement', { type: update && update.type, error: e.message });
      return res.status(500).json({ error: 'processing failed' }); // GPChat réessaie (backoff exponentiel)
    }
  },
);

exports.devfestBotReminders = onSchedule(
  { region: 'us-central1', schedule: 'every 1 minutes', timeZone: 'Africa/Douala', secrets: [API_KEY], timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    await runtime().tick();
  },
);

// Annonces : chaque lot de 50 destinataires est envoyé par une invocation (4 envois en parallèle). maxInstances limite
// le débit total (≈ 8 envois simultanés, sous le quota de 1 200 requêtes/minute du bot). La dernière invocation
// confirme le résultat à l'organisateur.
exports.devfestBotBroadcastWorker = onDocumentCreated(
  { document: `${JOBS}/{jobId}`, region: 'us-central1', secrets: [API_KEY], timeoutSeconds: 300, memory: '256MiB', maxInstances: 2, retry: false },
  async (event) => {
    const job = event.data && event.data.data();
    if (!job || job.status !== 'pending') return;
    const bot = new GPChatBot({ apiKey: API_KEY.value() });
    const result = await sendBatch({ bot, text: job.text, recipients: job.recipients || [], parallel: 4 });
    const parentRef = db.collection(BROADCASTS).doc(job.broadcastId);
    const parent = await db.runTransaction(async (tx) => {
      const p = (await tx.get(parentRef)).data();
      const next = { sent: p.sent + result.sent, failed: p.failed + result.failed, jobsDone: p.jobsDone + 1 };
      tx.update(parentRef, next);
      return { ...p, ...next };
    });
    await event.data.ref.update({ status: 'done', sent: result.sent, failed: result.failed });
    logger.info('annonce : lot envoyé', { broadcastId: job.broadcastId, index: job.index, ...result });
    if (parent.jobsDone === parent.jobs) {
      const strings = S[parent.lang] || S.fr;
      await bot.sendMessage(parent.fromUserId, strings.announceDone(parent.sent, parent.failed), { markdown: true }).catch(() => {});
      logger.info('annonce terminée', { broadcastId: job.broadcastId, sent: parent.sent, failed: parent.failed });
    }
  },
);
