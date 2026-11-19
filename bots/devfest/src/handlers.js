'use strict';
const P = require('./program');

// Textes de l'interface (FR/EN). Le contenu du programme vient de data/program.json.
const S = {
  fr: {
    welcome: (e) => `Bienvenue au **${e.name}** 🎉\nJe suis le guide de l'événement : programme, lieu, rappels et vote du public.\n\nTapez /aide pour voir les commandes.`,
    help: [
      '**Commandes**',
      '• `/programme` — le programme complet',
      '• `/maintenant` — ce qui se passe en ce moment',
      '• `/prochain` — la prochaine session',
      '• `/lieu` — adresse et accès',
      '• `/conferenciers` — les speakers annoncés',
      '• `/tracks` — les thématiques',
      '• `/rappel id` — me demander de vous prévenir 10 minutes avant (`/rappels` pour la liste, `/annuler id`)',
      '• `/vote` — comment voter pour le Challenge DevFest',
      '• `/faq` — questions fréquentes',
      '• `/langue fr|en`',
    ].join('\n'),
    program: (e) => `📅 **Programme — ${e.name}**`,
    venueTitle: '📍 **Lieu**',
    speakersTitle: '🎤 **Conférenciers annoncés**',
    tracksTitle: '🧭 **Tracks**',
    source: (e) => `Source : ${e.website} — programme sous réserve de modifications d'horaires.`,
    none: 'Rien en ce moment.',
    nowTitle: '🔴 **En ce moment**',
    nextTitle: '⏭️ **Prochainement**',
    nothingNext: "Plus de session prévue aujourd'hui. Merci d'être venu !",
    vote: (e) => `🗳️ **Vote du public**\n1. Installez GPChat et créez votre compte.\n2. Scannez le QR code de l'événement, ou ouvrez ${e.voteUrl}, puis touchez « Rejoindre le groupe ».\n3. À l'ouverture, touchez le bandeau « Votez » en haut de vos discussions.\n\nUn seul vote par compte, définitif.`,
    faqTitle: '❓ **Questions fréquentes**',
    remindOk: (t) => `⏰ C'est noté : je vous préviens 10 minutes avant **${t}**.`,
    remindBad: "Session inconnue. Voir `/programme` (l'identifiant est affiché après #).",
    remindDup: 'Rappel déjà enregistré.',
    remindNone: "Vous n'avez aucun rappel. Utilisez `/rappel id`.",
    remindList: '⏰ **Vos rappels**',
    remindCancel: 'Rappel annulé.',
    remindPush: (s) => `⏰ Dans 10 minutes : ${s}`,
    langOk: 'Langue : français.',
    langBad: 'Langues : `fr`, `en`.',
    unknown: 'Commande inconnue. Tapez /aide.',
    announceOk: (n) => `📣 Annonce envoyée à ${n} personne(s).`,
    announceDenied: 'Commande réservée aux organisateurs.',
  },
  en: {
    welcome: (e) => `Welcome to **${e.name}** 🎉\nI'm the event guide: schedule, venue, reminders and the public vote.\n\nType /help to see the commands.`,
    help: [
      '**Commands**',
      '• `/schedule` — the full schedule',
      '• `/now` — what is happening now',
      '• `/next` — the next session',
      '• `/venue` — address and directions',
      '• `/speakers` — announced speakers',
      '• `/tracks` — the tracks',
      '• `/remind id` — ping me 10 minutes before (`/reminders` for the list, `/cancel id`)',
      '• `/vote` — how to vote for the DevFest Challenge',
      '• `/faq` — frequently asked questions',
      '• `/lang fr|en`',
    ].join('\n'),
    program: (e) => `📅 **Schedule — ${e.name}**`,
    venueTitle: '📍 **Venue**',
    speakersTitle: '🎤 **Announced speakers**',
    tracksTitle: '🧭 **Tracks**',
    source: (e) => `Source: ${e.website} — schedule subject to time changes.`,
    none: 'Nothing right now.',
    nowTitle: '🔴 **Happening now**',
    nextTitle: '⏭️ **Coming up**',
    nothingNext: 'No more sessions today. Thanks for coming!',
    vote: (e) => `🗳️ **Public vote**\n1. Install GPChat and create your account.\n2. Scan the event QR code, or open ${e.voteUrl}, then tap “Join the group”.\n3. When voting opens, tap the “Vote” banner at the top of your chats.\n\nOne vote per account, final.`,
    faqTitle: '❓ **FAQ**',
    remindOk: (t) => `⏰ Got it: I'll ping you 10 minutes before **${t}**.`,
    remindBad: 'Unknown session. See `/schedule` (the id is shown after #).',
    remindDup: 'Reminder already saved.',
    remindNone: 'You have no reminders. Use `/remind id`.',
    remindList: '⏰ **Your reminders**',
    remindCancel: 'Reminder cancelled.',
    remindPush: (s) => `⏰ In 10 minutes: ${s}`,
    langOk: 'Language: English.',
    langBad: 'Languages: `fr`, `en`.',
    unknown: 'Unknown command. Type /help.',
    announceOk: (n) => `📣 Announcement sent to ${n} people.`,
    announceDenied: 'Organizers only.',
  },
};

const ALIAS = {
  start: 'start', aide: 'help', help: 'help', programme: 'schedule', schedule: 'schedule', maintenant: 'now', now: 'now', prochain: 'next', next: 'next',
  lieu: 'venue', venue: 'venue', conferenciers: 'speakers', speakers: 'speakers', tracks: 'tracks',
  rappel: 'remind', remind: 'remind', rappels: 'reminders', reminders: 'reminders', annuler: 'cancel', cancel: 'cancel',
  vote: 'vote', faq: 'faq', langue: 'lang', lang: 'lang', annonce: 'announce', announce: 'announce',
};

function createHandler({ bot, program, store, admins = [], now = Date.now }) {
  const ev = program.event;
  const tz = ev.timezone || 'Africa/Douala';
  const user = (id) => store.user(id);
  const msg = (to, text, o) => bot.sendMessage(to, text, { markdown: true, ...o });

  async function run(chat, userId, name, arg, groupId) {
    const u = user(userId);
    const lang = u.lang;
    const s = S[lang];
    const say = (text, o) => (groupId ? bot.sendGroupMessage(groupId, text, { markdown: true, ...o }) : msg(chat, text, o));
    const t = now();
    switch (name) {
      case 'start': return say(s.welcome(ev));
      case 'help': return say(s.help);
      case 'schedule': {
        const rows = P.sorted(program).map((x) => P.line(x, lang, tz)).join('\n');
        return say([s.program(ev), `📍 ${ev.venue.name}`, '', rows, '', `_${s.source(ev)}_`].join('\n'));
      }
      case 'venue': {
        const v = ev.venue;
        const text = [s.venueTitle, `**${v.name}**`, P.tr(v.address, lang), P.tr(v.landmark, lang), '', P.tr(v.access, lang), '', P.tr(ev.stats, lang)].join('\n');
        return say(text, { buttons: [[{ text: ev.website.replace('https://', ''), url: ev.website }]] });
      }
      case 'speakers': {
        const sessionLine = (y) => `  • ${P.hhmm(y.start, tz)} ${P.tr(y.title, lang)} #${y.id}`;
        const blocks = P.speakers(program).map((x) => [`**${x.name}** — ${x.role}`, ...x.sessions.map(sessionLine)].join('\n'));
        return say(`${s.speakersTitle}\n\n${blocks.join('\n\n')}`);
      }
      case 'tracks': {
        const rows = program.tracks.map((x) => `**${x.name}** — ${P.tr(x.summary, lang)}`).join('\n');
        return say(`${s.tracksTitle}\n\n${rows}`);
      }
      case 'now': {
        const c = P.current(program, t);
        return say(c.length ? `${s.nowTitle}\n\n${c.map((x) => P.line(x, lang, tz)).join('\n')}` : s.none);
      }
      case 'next': {
        const n = P.upcoming(program, t).slice(0, 3);
        return say(n.length ? `${s.nextTitle}\n\n${n.map((x) => P.line(x, lang, tz)).join('\n')}` : s.nothingNext);
      }
      case 'vote': return say(s.vote(ev), { buttons: [[{ text: lang === 'en' ? 'Open the vote page' : 'Ouvrir la page du vote', url: ev.voteUrl }]] });
      case 'faq': return say(`${s.faqTitle}\n\n${program.faq.map((f) => `**${P.tr(f.q, lang)}**\n${P.tr(f.a, lang)}`).join('\n\n')}`);
      case 'remind': {
        const sess = program.sessions.find((x) => x.id === arg.replace(/^#/, ''));
        if (!sess) return say(s.remindBad);
        if (u.reminders.includes(sess.id)) return say(s.remindDup);
        u.reminders.push(sess.id);
        store.save();
        return say(s.remindOk(P.tr(sess.title, lang)));
      }
      case 'reminders': {
        if (!u.reminders.length) return say(s.remindNone);
        const rows = u.reminders.map((id) => program.sessions.find((x) => x.id === id)).filter(Boolean).map((x) => P.line(x, lang, tz)).join('\n');
        return say(`${s.remindList}\n\n${rows}`);
      }
      case 'cancel': {
        const id = arg.replace(/^#/, '');
        u.reminders = u.reminders.filter((x) => x !== id);
        store.save();
        return say(s.remindCancel);
      }
      case 'lang': {
        if (arg !== 'fr' && arg !== 'en') return say(s.langBad);
        u.lang = arg;
        store.save();
        return say(S[arg].langOk);
      }
      case 'announce': {
        if (!admins.includes(userId)) return say(s.announceDenied);
        const ids = Object.keys(store.data.users);
        for (const id of ids) {
          await bot.sendMessage(id, `📣 ${arg}`).catch(() => {});
          await new Promise((r) => setTimeout(r, store.throttleMs ?? 1100)); // limite API : ~60 requêtes/min par clé
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
    const log = (e) => { if (process.env.NODE_ENV !== 'test') console.error('[devfest]', e.message); };
    if (update.type === 'message.received') {
      if (!m) return;
      const name = ALIAS[m[1].toLowerCase()] || 'unknown';
      try { await run(d.chatId || d.from, d.from, name, m[2].trim(), null); } catch (e) { log(e); }
    } else if (update.type === 'group_message.received' && m) {
      const name = ALIAS[m[1].toLowerCase()] || 'unknown';
      if (name === 'unknown' || name === 'announce') return;
      try { await run(null, d.from, name, m[2].trim(), d.groupId); } catch (e) { log(e); }
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
        u.sent.push(sess.id);
        store.save();
        await bot.sendMessage(id, S[u.lang].remindPush(`${P.tr(sess.title, u.lang)} (${P.hhmm(sess.start, tz)})`)).catch(() => {});
      }
    }
  }

  return { handle, tick };
}

module.exports = { createHandler, S };
