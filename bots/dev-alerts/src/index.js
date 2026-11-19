'use strict';
// Dev Alerts — polling (commandes) + petit serveur HTTP (webhooks entrants).
// Variables : GPCHAT_API_KEY, PUBLIC_URL (ex. https://alertes.example.com) ; PORT (8080), DATA_DIR (./data).
const fs = require('node:fs');
const path = require('node:path');
const { GPChatBot } = require('@gpchat/bot');
const { createServer, createCommands, Hooks } = require('./server');

function must(name) {
  if (!process.env[name]) {
    console.error(`Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const file = path.join(process.env.DATA_DIR || './data', 'alerts.json');
const store = { data: { hooks: {} }, timer: null };
try { store.data = { hooks: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* premier démarrage */ }
store.save = () => {
  clearTimeout(store.timer);
  store.timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(store.data));
    fs.renameSync(`${file}.tmp`, file);
  }, 300);
};

const bot = new GPChatBot({ apiKey: must('GPCHAT_API_KEY'), baseUrl: process.env.GPCHAT_BASE_URL });
const hooks = new Hooks(store);
const publicUrl = must('PUBLIC_URL').replace(/\/$/, '');
const handle = createCommands({ bot, hooks, publicUrl });

const stop = bot.poll(handle, { timeout: 20, onError: (e) => console.error('[poll]', e.message) });
const server = createServer({ bot, hooks }).listen(Number(process.env.PORT || 8080), () => console.log('Dev Alerts démarré.'));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stop();
    server.close();
    process.exit(0);
  });
}
