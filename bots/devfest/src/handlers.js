'use strict';
const P = require('./program');

const S = {
  fr: {
    welcome: (e) => `Bienvenue au **${e.name}** 🎉\nJe suis le guide de l'événement : programme, prochaine session, rappels et vote du public.\n\nTapez /aide pour voir les commandes.`,
    help: '**Commandes**\n• `/programme` — le programme complet\n• `/maintenant` — ce qui se passe en ce moment\n• `/prochain` — la prochaine session\n• `/rappel id` — me demander de vous prévenir 10 minutes avant (`/rappels` pour la liste, `/annuler id`)\n• `/vote` — comment voter pour votre équipe préférée\n• `/faq` — questions fréquentes\n• `/langue fr|en`',
    program: (e) => `📅 **Programme — ${e.name}**`,
    none: 'Rien en ce moment.', nowTitle: '🔴 **En ce moment**', nextTitle: '⏭️ **Prochainement**', nothingNext: 'Plus de session prévue aujourd\'hui. Merci d\'être venu !',
    vote: (e) => `🗳️ **Vote du public**\n1. Installez GPChat et créez votre compte.\n2. Scannez le QR code de l'événement, ou ouvrez ${e.voteUrl}, puis touchez « Rejoindre le groupe ».\n3. À l'ouverture, touchez le bandeau « Votez » en haut de vos discussions.\n\nUn seul vote par compte, définitif.`,
    faqTitle: '❓ **Questions fréquentes**', remindOk: (t) => `⏰ C'est noté : je vous préviens 10 minutes avant **${t}**.`, remindBad: 'Session inconnue. Voir `/programme` (l\'identifiant est affiché après #).',
    remindDup: 'Rappel déjà enregistré.', remindNone: 'Vous n\'avez aucun rappel. Utilisez `/rappel id`.', remindList: '⏰ **Vos rappels**', remindCancel: 'Rappel annulé.',
    remindPush: (s) => `⏰ Dans 10 minutes : ${s}`, langOk: 'Langue : français.', langBad: 'Langues : `fr`, `en`.', unknown: 'Commande inconnue. Tapez /aide.',
    announceOk: (n) => `📣 Annonce envoyée à ${n} personne(s).`, announceDenied: 'Commande réservée aux organisateurs.',
  },
  en: {
    welcome: (e) => `Welcome to **${e.name}** 🎉\nI'm the event guide: schedule, next session, reminders and the public vote.\n\nType /help to see the commands.`,
    help: '**Commands**\n• `/schedule` — the full schedule\n• `/now` — what is happening now\n• `/next` — the next session\n• `/remind id` — ping me 10 minutes before (`/reminders` for the list, `/cancel id`)\n• `/vote` — how to vote for your favorite team\n• `/faq` — frequently asked questions\n• `/lang fr|en`',
    program: (e) => `📅 **Schedule — ${e.name}**`,
    none: 'Nothing right now.', nowTitle: '🔴 **Happening now**', nextTitle: '⏭️ **Coming up**', nothingNext: 'No more sessions today. Thanks for coming!',
    vote: (e) => `🗳️ **Public vote**\n1. Install GPChat and create your account.\n2. Scan the event QR code, or open ${e.voteUrl}, then tap “Join the group”.\n3. When voting opens, tap the “Vote” banner at the top of your chats.\n\nOne vote per account, final.`,
    faqTitle: '❓ **FAQ**', remindOk: (t) => `⏰ Got it: I'll ping you 10 minutes before **${t}**.`, remindBad: 'Unknown session. See `/schedule` (the id is shown after #).',
    remindDup: 'Reminder already saved.', remindNone: 'You have no reminders. Use `/remind id`.', remindList: '⏰ **Your reminders**', remindCancel: 'Reminder cancelled.',
    remindPush: (s) => `⏰ In 10 minutes: ${s}`, langOk: 'Language: English.', langBad: 'Languages: `fr`, `en`.', unknown: 'Unknown command. Type /help.',
    announceOk: (n) => `📣 Announcement sent to ${n} people.`, announceDenied: 'Organizers only.',
  },
};

const ALIAS = { start: 'start', aide: 'help', help: 'help', programme: 'schedule', schedule: 'schedule', maintenant: 'now', now: 'now', prochain: 'next', next: 'next',
  rappel: 'remind', remind: 'remind', rappels: 'reminders', reminders: 'reminders', annuler: 'cancel', cancel: 'cancel', vote: 'vote', faq: 'faq', langue: 'lang', lang: 'lang', annonce: 'announce', announce: 'announce' };

function createHandler({ bot, program, store, admins = [], now = Date.now }) {
  const ev = program.event;
  const tz = ev.timezone || 'Africa/Douala';
  const user = (id) => store.user(id);
  const msg = (to, text, o) => bot.sendMessage(to, text, { markdown: true, ...o });

  async function run(chat, userId, name, arg, groupId) {
    const u = user(userId); const lang = u.lang; const s = S[lang];
    const say = (text, o) => (groupId ? bot.sendGroupMessage(groupId, text, { markdown: true, ...o }) : msg(chat, text, o));
    const t = now();
    switch (name) {
      case 'start': return say(s.welcome({ ...ev, name: ev.name }));
      case 'help': return say(s.help);
      case 'schedule': return say(`${s.program(ev)}\n\n${P.sorted(program).map((x) => P.line(x, lang, tz)).join('\n')}`);
      case 'now': { const c = P.current(program, t); return say(c.length ? `${s.nowTitle}\n\n${c.map((x) => P.line(x, lang, tz)).join('\n')}` : s.none); }
      case 'next': { const n = P.upcoming(program, t).slice(0, 3); return say(n.length ? `${s.nextTitle}\n\n${n.map((x) => P.line(x, lang, tz)).join('\n')}` : s.nothingNext); }
      case 'vote': return say(s.vote(ev), { buttons: [[{ text: lang === 'en' ? 'Open the vote page' : 'Ouvrir la page du vote', url: ev.voteUrl }]] });
      case 'faq': return say(`${s.faqTitle}\n\n${program.faq.map((f) => `**${P.tr(f.q, lang)}**\n${P.tr(f.a, lang)}`).join('\n\n')}`);
      case 'remind': {
        const sess = program.sessions.find((x) => x.id === arg.replace(/^#/, ''));
        if (!sess) return say(s.remindBad);
        if (u.reminders.includes(sess.id)) return say(s.remindDup);
        u.reminders.push(sess.id); store.save();
        return say(s.remindOk(P.tr(sess.title, lang)));
      }
      case 'reminders': {
        if (!u.reminders.length) return say(s.remindNone);
        return say(`${s.remindList}\n\n${u.reminders.map((id) => program.sessions.find((x) => x.id === id)).filter(Boolean).map((x) => P.line(x, lang, tz)).join('\n')}`);
      }
      case 'cancel': {
        const id = arg.replace(/^#/, '');
        u.reminders = u.reminders.filter((x) => x !== id); store.save();
        return say(s.remindCancel);
      }
      case 'lang': {
        if (arg !== 'fr' && arg !== 'en') return say(s.langBad);
        u.lang = arg; store.save(); return say(S[arg].langOk);
      }
      case 'announce': {
        if (!admins.includes(userId)) return say(s.announceDenied);
        const ids = Object.keys(store.data.users);
        for (const id of ids) {
          await bot.sendMessage(id, `📣 ${arg}`).catch(() => {});
          await new Promise((r) => setTimeout(r, store.throttleMs ?? 1100)); // limite API : ~60 requêtes/min
        }
        return say(s.announceOk(ids.length));
      }
      default: return say(s.unknown);
    }
  }

  async function handle(update) {
    const d = update.data || {};
    if (!d.from || d.type !== 'text') return;
    const m = /^\/([a-zA-Z]+)(?:@\w+)?\s*([\s\S]*)$/.exec(String(d.textMsg || '').trim());
    if (update.type === 'message.received') {
      if (!m) return;
      const name = ALIAS[m[1].toLowerCase()] || 'unknown';
      try { await run(d.chatId || d.from, d.from, name, m[2].trim(), null); } catch (e) { if (process.env.NODE_ENV !== 'test') console.error('[devfest]', e.message); }
    } else if (update.type === 'group_message.received' && m) {
      const name = ALIAS[m[1].toLowerCase()] || 'unknown';
      if (name === 'unknown' || name === 'announce') return;
      try { await run(null, d.from, name, m[2].trim(), d.groupId); } catch (e) { if (process.env.NODE_ENV !== 'test') console.error('[devfest]', e.message); }
    }
  }

  /** À appeler toutes les 30 s : envoie les rappels « 10 minutes avant » (une seule fois par personne et session). */
  async function tick() {
    const t = now();
    for (const sess of program.sessions) {
      const startMs = P.start(sess);
      if (!(startMs - 10 * 60000 <= t && t < startMs)) continue;
      for (const [id, u] of Object.entries(store.data.users)) {
        if (!u.reminders.includes(sess.id) || u.sent.includes(sess.id)) continue;
        u.sent.push(sess.id); store.save();
        await bot.sendMessage(id, S[u.lang].remindPush(`${P.tr(sess.title, u.lang)} (${P.hhmm(sess.start, tz)})`)).catch(() => {});
      }
    }
  }

  return { handle, tick };
}

module.exports = { createHandler, S };
