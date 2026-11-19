'use strict';
// Textes du bot (français / anglais). {x} = paramètre.

const S = {
  fr: {
    welcome:
      '👋 **Bonjour, je suis Rappels.**\n\nDites-moi simplement quoi et quand, je m’occupe du reste :\n' +
      '• _demain à 9h appeler maman_\n• _dans 20 min sortir le gâteau_\n• _tous les lundis à 8h réunion d’équipe_\n• _le 5 de chaque mois payer le loyer_\n\n' +
      'Fuseau horaire : **{tz}** (modifiable avec /fuseau).',
    help:
      '⏰ **Rappels — aide**\n\n' +
      '**Créer** — écrivez naturellement, ou /rappel suivi du texte :\n' +
      '• _à 18h30 récupérer les enfants_\n• _vendredi soir dîner avec Aïcha_\n• _le 12 mars chaque année anniversaire de Paul_\n• _toutes les 2 heures boire de l’eau_\n\n' +
      '**Gérer**\n/liste — vos rappels à venir\n/supprimer 2 — supprime le n° 2 de la liste (/supprimer tout pour tout effacer)\n\n' +
      '**Réglages**\n/fuseau — votre fuseau horaire (ex. /fuseau Douala)\n/langue en — passer en anglais\n\n' +
      '**Plus**\n/exemples — toutes les formulations comprises\n/apropos — fonctionnement et données\n\n' +
      '👥 En groupe : /rappel _texte_ programme un rappel pour tout le groupe.',
    examples:
      '📝 **Formulations comprises**\n\n' +
      '**Quand ?**\n• _dans 10 min_, _dans 2 h_, _dans 1h30_, _dans 3 jours_, _dans un mois_\n• _à 9h_, _à 18h30_, _à midi_, _ce soir_, _demain matin_, _après-demain 14h_\n' +
      '• _lundi_, _lundi prochain_, _vendredi soir_\n• _le 30_, _le 25/12_, _le 12 mars_, _le 3 janvier 2027_\n\n' +
      '**Récurrences**\n• _tous les jours à 7h_, _chaque soir_, _en semaine à 6h30_\n• _tous les lundis et jeudis à 19h_, _tous les week-ends_\n' +
      '• _le 5 de chaque mois_, _chaque année le 12 mars_\n• _tous les 3 jours_, _toutes les 2 heures_ (15 min minimum)\n\n' +
      'Sans heure précise, je programme à **9h** (matin 8h, après-midi 15h, soir 19h).',
    about:
      'ℹ️ **Rappels** {version}\n\nJe comprends le français et l’anglais et je calcule chaque date dans **votre fuseau horaire** (changements d’heure compris). ' +
      'Les rappels sont conservés sur le serveur du bot uniquement le temps nécessaire ; supprimez-les à tout moment avec /supprimer.\n\n' +
      'Code source ouvert : github.com/GPChat-Platform/bots',
    created: '✅ **C’est noté !** Je vous le rappellerai **{when}** ({rel}).\n\n📌 {text}',
    createdRecurring: '✅ **Rappel récurrent créé** : {rule}.\nProchain : **{when}** ({rel}).\n\n📌 {text}',
    noTime:
      '🤔 Je n’ai pas trouvé **quand** vous le rappeler.\n\nEssayez par exemple : _demain à 9h {text}_, _dans 30 min {text}_ ou _lundi {text}_.\n/exemples pour toutes les formulations.',
    empty: 'Que voulez-vous que je vous rappelle, et quand ? Exemple : _/rappel demain 9h appeler le médecin_',
    past: '⌛ Cette date est déjà passée. Indiquez un moment à venir.',
    tooFar: '📅 C’est un peu loin : je programme des rappels jusqu’à 5 ans maximum.',
    intervalShort: '⏱️ Pour un rappel répété, l’intervalle minimum est de 15 minutes.',
    badDate: '📅 Cette date n’existe pas. Vérifiez le jour et l’heure.',
    limit: '🚫 Vous avez déjà {n} rappels actifs (maximum). Supprimez-en avec /liste avant d’en ajouter.',
    groupLimit: '🚫 Ce groupe a déjà {n} rappels actifs (maximum).',
    listEmpty: 'Aucun rappel à venir. Écrivez par exemple _demain à 9h appeler maman_.',
    listTitle: '📋 **Vos rappels** ({n})',
    listGroupTitle: '📋 **Rappels du groupe** ({n})',
    listFoot: '\nSupprimer : /supprimer _numéro_',
    deleted: '🗑️ Rappel supprimé : {text}',
    deletedAll: '🗑️ {n} rappel(s) supprimé(s).',
    deleteWhich: 'Lequel ? Tapez /liste puis /supprimer _numéro_ (ou /supprimer tout).',
    deleteNotFound: 'Pas de rappel n° {n}. Tapez /liste pour voir les numéros.',
    notYours: 'Seule la personne qui a créé ce rappel peut le modifier.',
    cancelled: '↩️ Rappel annulé.',
    fire: '⏰ **Rappel**\n\n{text}',
    fireGroup: '⏰ **Rappel du groupe**\n\n{text}',
    fireLate: '\n\n_En retard de {late} : je n’ai pas pu l’envoyer à l’heure._',
    fireNext: '\n\n🔁 Prochain : {when}',
    done: '✅ Fait — {text}',
    snoozed: '😴 Reporté **{when}** ({rel}) : {text}',
    tzAsk: 'Votre fuseau : **{tz}** (il est {time}).\nPour le changer : /fuseau _ville ou zone_, ex. /fuseau Douala, /fuseau Paris, /fuseau America/Montreal, /fuseau UTC+1',
    tzSet: '🌍 Fuseau réglé sur **{tz}** — il est {time}. Vos rappels existants gardent leur heure locale d’origine.',
    tzBad: 'Je ne connais pas ce fuseau. Exemples : Douala, Yaoundé, Abidjan, Dakar, Lagos, Kinshasa, Paris, Londres, Montréal, Europe/Paris, UTC+1.',
    langSet: '🇫🇷 Langue : français.',
    langAsk: 'Langue : /langue fr ou /langue en',
    unknown: 'Commande inconnue. Tapez /aide.',
    error: '😕 Un problème est survenu. Réessayez dans un instant.',
    defaultText: '⏰ Rappel',
    btnCancel: '↩️ Annuler',
    btnList: '📋 Mes rappels',
    btnDone: '✅ Fait',
    btnSnooze10: '+10 min',
    btnSnooze60: '+1 h',
    btnTomorrow: 'Demain',
    btnDelete: '🗑️ {n}',
    btnHelp: '❓ Aide',
    btnExamples: '📝 Exemples',
    and: 'et',
    at: 'à',
    every: {
      day: 'tous les jours',
      nDays: 'tous les {n} jours',
      weekdays: 'en semaine',
      weekend: 'le week-end',
      week: 'chaque {days}',
      month: 'le {d} de chaque mois',
      year: 'chaque année le {date}',
      minutes: 'toutes les {n} min',
      hours: 'toutes les {n} h',
    },
    rel: { now: 'maintenant', in: 'dans {x}', ago: 'il y a {x}', min: '{n} min', h: '{n} h', hmin: '{h} h {m}', d: '{n} j', dh: '{d} j {h} h' },
    days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  },
  en: {
    welcome:
      '👋 **Hi, I’m Reminders.**\n\nJust tell me what and when, I’ll take care of the rest:\n' +
      '• _tomorrow at 9am call mom_\n• _in 20 min take the cake out_\n• _every monday at 8am team meeting_\n• _on the 5th of every month pay rent_\n\n' +
      'Time zone: **{tz}** (change it with /timezone).',
    help:
      '⏰ **Reminders — help**\n\n' +
      '**Create** — write naturally, or /remind followed by the text:\n' +
      '• _at 6:30pm pick up the kids_\n• _friday evening dinner with Aïcha_\n• _every year on march 12 Paul’s birthday_\n• _every 2 hours drink water_\n\n' +
      '**Manage**\n/list — your upcoming reminders\n/delete 2 — deletes #2 from the list (/delete all to clear everything)\n\n' +
      '**Settings**\n/timezone — your time zone (e.g. /timezone Lagos)\n/lang fr — switch to French\n\n' +
      '**More**\n/examples — every phrasing I understand\n/about — how it works\n\n' +
      '👥 In a group: /remind _text_ schedules a reminder for the whole group.',
    examples:
      '📝 **Phrasings I understand**\n\n' +
      '**When?**\n• _in 10 min_, _in 2 hours_, _in 1h30_, _in 3 days_, _in a month_\n• _at 9am_, _at 6:30 pm_, _at noon_, _tonight_, _tomorrow morning_, _day after tomorrow 2pm_\n' +
      '• _monday_, _next monday_, _friday evening_\n• _on the 30th_, _25/12_, _march 12_, _january 3 2027_\n\n' +
      '**Recurring**\n• _every day at 7am_, _every evening_, _every weekday at 6:30_\n• _every monday and thursday at 7pm_, _every weekend_\n' +
      '• _on the 5th of every month_, _every year on march 12_\n• _every 3 days_, _every 2 hours_ (15 min minimum)\n\n' +
      'Without a precise time, I schedule at **9am** (morning 8am, afternoon 3pm, evening 7pm).',
    about:
      'ℹ️ **Reminders** {version}\n\nI understand English and French and compute every date in **your time zone** (daylight saving included). ' +
      'Reminders are kept on the bot’s server only as long as needed; delete them anytime with /delete.\n\n' +
      'Open source: github.com/GPChat-Platform/bots',
    created: '✅ **Got it!** I’ll remind you **{when}** ({rel}).\n\n📌 {text}',
    createdRecurring: '✅ **Recurring reminder created**: {rule}.\nNext: **{when}** ({rel}).\n\n📌 {text}',
    noTime:
      '🤔 I couldn’t find **when** to remind you.\n\nTry for example: _tomorrow at 9am {text}_, _in 30 min {text}_ or _monday {text}_.\n/examples for every phrasing.',
    empty: 'What should I remind you of, and when? Example: _/remind tomorrow 9am call the doctor_',
    past: '⌛ That time has already passed. Please give a future moment.',
    tooFar: '📅 That’s a bit far: I schedule reminders up to 5 years ahead.',
    intervalShort: '⏱️ For a repeating reminder, the minimum interval is 15 minutes.',
    badDate: '📅 That date doesn’t exist. Check the day and time.',
    limit: '🚫 You already have {n} active reminders (maximum). Delete some from /list first.',
    groupLimit: '🚫 This group already has {n} active reminders (maximum).',
    listEmpty: 'No upcoming reminders. Write for example _tomorrow at 9am call mom_.',
    listTitle: '📋 **Your reminders** ({n})',
    listGroupTitle: '📋 **Group reminders** ({n})',
    listFoot: '\nDelete: /delete _number_',
    deleted: '🗑️ Reminder deleted: {text}',
    deletedAll: '🗑️ {n} reminder(s) deleted.',
    deleteWhich: 'Which one? Type /list then /delete _number_ (or /delete all).',
    deleteNotFound: 'No reminder #{n}. Type /list to see the numbers.',
    notYours: 'Only the person who created this reminder can change it.',
    cancelled: '↩️ Reminder cancelled.',
    fire: '⏰ **Reminder**\n\n{text}',
    fireGroup: '⏰ **Group reminder**\n\n{text}',
    fireLate: '\n\n_{late} late: I couldn’t send it on time._',
    fireNext: '\n\n🔁 Next: {when}',
    done: '✅ Done — {text}',
    snoozed: '😴 Snoozed until **{when}** ({rel}): {text}',
    tzAsk: 'Your time zone: **{tz}** (it is {time}).\nTo change it: /timezone _city or zone_, e.g. /timezone Lagos, /timezone London, /timezone America/New_York, /timezone UTC+1',
    tzSet: '🌍 Time zone set to **{tz}** — it is {time}. Existing reminders keep their original local time.',
    tzBad: 'I don’t know this time zone. Examples: Douala, Lagos, Accra, Nairobi, London, Paris, New York, Europe/London, UTC+1.',
    langSet: '🇬🇧 Language: English.',
    langAsk: 'Language: /lang en or /lang fr',
    unknown: 'Unknown command. Type /help.',
    error: '😕 Something went wrong. Please try again in a moment.',
    defaultText: '⏰ Reminder',
    btnCancel: '↩️ Cancel',
    btnList: '📋 My reminders',
    btnDone: '✅ Done',
    btnSnooze10: '+10 min',
    btnSnooze60: '+1 h',
    btnTomorrow: 'Tomorrow',
    btnDelete: '🗑️ {n}',
    btnHelp: '❓ Help',
    btnExamples: '📝 Examples',
    and: 'and',
    at: 'at',
    every: {
      day: 'every day',
      nDays: 'every {n} days',
      weekdays: 'on weekdays',
      weekend: 'on weekends',
      week: 'every {days}',
      month: 'on day {d} of every month',
      year: 'every year on {date}',
      minutes: 'every {n} min',
      hours: 'every {n} h',
    },
    rel: { now: 'now', in: 'in {x}', ago: '{x} ago', min: '{n} min', h: '{n} h', hmin: '{h} h {m} min', d: '{n} d', dh: '{d} d {h} h' },
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
};

function t(lang, key, params = {}) {
  const dict = S[lang] || S.fr;
  let s = key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
  if (s == null) s = key.split('.').reduce((o, k) => (o == null ? o : o[k]), S.fr);
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}

module.exports = { t, S };
