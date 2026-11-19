'use strict';
// Guide DevFest — bot en mode polling. Variables : GPCHAT_API_KEY ; ADMIN_IDS (liste d'userId séparés par des virgules) ;
// DATA_DIR (./data) ; PROGRAM_FILE (sinon le programme du dépôt data/program.json).
const fs = require('node:fs');
const path = require('node:path');
const { GPChatBot } = require('@gpchat/bot');
const P = require('./program');
const { createHandler } = require('./handlers');

if (!process.env.GPCHAT_API_KEY) {
  console.error("Variable d'environnement manquante : GPCHAT_API_KEY");
  process.exit(1);
}
const dataDir = process.env.DATA_DIR || './data';
const program = P.load(process.env.PROGRAM_FILE || path.join(dataDir, 'program.json'), path.join(__dirname, '..', 'data', 'program.json'));

const file = path.join(dataDir, 'devfest.json');
const store = { data: { users: {} }, timer: null };
try { store.data = { users: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* premier démarrage */ }
store.user = (id) => {
  if (!store.data.users[id]) store.data.users[id] = { lang: 'fr', reminders: [], sent: [] };
  return store.data.users[id];
};
store.save = () => {
  clearTimeout(store.timer);
  store.timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(store.data));
    fs.renameSync(`${file}.tmp`, file);
  }, 300);
};

const bot = new GPChatBot({ apiKey: process.env.GPCHAT_API_KEY, baseUrl: process.env.GPCHAT_BASE_URL });
const admins = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const { handle, tick } = createHandler({ bot, program, store, admins });

const stop = bot.poll(handle, { timeout: 20, onError: (e) => console.error('[poll]', e.message) });
const timer = setInterval(() => tick().catch((e) => console.error('[tick]', e.message)), 30000);
console.log(`Guide ${program.event.name} démarré.`);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stop();
    clearInterval(timer);
    process.exit(0);
  });
}
