'use strict';
// Textes du bot Foot en direct (français / anglais). {x} = paramètre.

const S = {
  fr: {
    welcome:
      '⚽ **Bienvenue sur Foot en direct !**\n\nScores en direct, calendrier, classements et buteurs — et des **alertes à chaque but** de vos équipes.\n\n' +
      '• /direct — les matchs en cours\n• /suivre Cameroun — alertes buts, cartons rouges, mi-temps, fin de match\n• /classement ligue1 — classement\n\n' +
      'Écrivez simplement le nom d’une équipe pour voir sa fiche.',
    help:
      '⚽ **Foot en direct — aide**\n\n' +
      '**Matchs**\n/direct — en cours (/direct tout : toutes compétitions)\n/matchs — aujourd’hui (/matchs demain, /matchs 25/12)\n/match _numéro_ — détail d’un match\n\n' +
      '**Équipes**\n/equipe _nom_ — fiche, derniers résultats, prochains matchs\n/suivre _nom_ — alertes en direct\n/mesequipes — vos équipes suivies\n/nepasuivre _nom_\n\n' +
      '**Compétitions**\n/classement _ligue_ · /buteurs _ligue_ · /ligues (raccourcis)\n\n' +
      '**Réglages**\n/fuseau _ville_ · /langue en · /apropos\n\n' +
      '👥 En groupe, /suivre envoie les alertes à tout le groupe.',
    about:
      'ℹ️ **Foot en direct** {version}\n\nDonnées : API-Football (api-sports.io). Le direct est actualisé toutes les {every} environ ; les alertes partent dès que le but apparaît dans les données.\n' +
      'Heures affichées dans votre fuseau : **{tz}**.\n\nCode source ouvert : github.com/GPChat-Platform/bots',
    leagues: '🏆 **Compétitions (raccourcis)**\n\n{list}\n\nExemples : /classement can, /buteurs pl, /classement elite1',
    liveTitle: '🔴 **En direct** ({n})',
    liveNone: 'Aucun match en cours dans les grandes compétitions.',
    liveNoneAll: 'Aucun match en cours en ce moment.',
    liveMore: '\n_…et {n} autres. /direct tout pour tout voir._',
    dayTitle: '📅 **Matchs {day}** ({n})',
    dayNone: 'Aucun match {day} dans les grandes compétitions.',
    dayMore: '\n_…et {n} autres matchs._',
    today: 'aujourd’hui', tomorrow: 'demain', yesterday: 'hier', onDate: 'du {date}',
    teamAsk: 'Quelle équipe ? Exemple : /equipe Cameroun',
    teamNone: 'Aucune équipe trouvée pour « {q} ».',
    teamPick: 'Plusieurs équipes correspondent à « {q} » :',
    teamCard: '{flag}**{name}**{country}\n{venue}',
    nextTitle: '\n📅 **Prochains matchs**',
    lastTitle: '\n🧾 **Derniers résultats**',
    none: '_aucun_',
    follow: '🔔 Suivre',
    unfollow: '🔕 Ne plus suivre',
    followed: '🔔 Vous suivez **{team}** : alertes à chaque but, carton rouge, mi-temps et fin de match.',
    followedGroup: '🔔 Le groupe suit **{team}** : les alertes arriveront ici.',
    already: 'Vous suivez déjà **{team}**.',
    followLimit: '🚫 Maximum {n} équipes suivies par conversation. /mesequipes pour en retirer.',
    unfollowed: '🔕 Vous ne suivez plus **{team}**.',
    notFollowing: 'Vous ne suivez pas cette équipe. /mesequipes pour la liste.',
    myTeams: '🔔 **Équipes suivies** ({n})\n\n{list}',
    myTeamsNone: 'Vous ne suivez aucune équipe. Exemple : /suivre Cameroun',
    leagueAsk: 'Quelle compétition ? /ligues pour la liste. Exemple : /classement ligue1',
    leagueUnknown: 'Compétition inconnue : « {q} ». /ligues pour la liste.',
    standingsTitle: '📊 **Classement — {league}** ({season})',
    standingsNone: 'Pas de classement disponible pour cette compétition.',
    scorersTitle: '🎯 **Buteurs — {league}** ({season})',
    scorersNone: 'Pas de classement des buteurs disponible.',
    matchNotFound: 'Match introuvable.',
    refresh: '🔄 Actualiser',
    details: '📋 Détails',
    goal: '⚽ **BUT !** {minute} — **{player}**{kind} ({team}){assist}\n{score}',
    goalNoEvent: '⚽ **BUT !**\n{score}',
    ownGoal: ' (csc)', penalty: ' (sp)', assist: '\nPasse décisive : {name}',
    red: '🟥 **Carton rouge** {minute} — {player} ({team})\n{score}',
    varNoGoal: '📺 **But annulé par la VAR** {minute} ({team})\n{score}',
    kickoff: '🟢 **Coup d’envoi !**\n{score}',
    halftime: '⏸️ **Mi-temps**\n{score}',
    secondHalf: '▶️ **Reprise**\n{score}',
    extraTime: '⏱️ **Prolongation !**\n{score}',
    penalties: '🎯 **Tirs au but !**\n{score}',
    fulltime: '🏁 **Fin du match**\n{score}{result}',
    suspended: '⚠️ **Match interrompu**\n{score}',
    postponed: '📅 **Match reporté ou annulé** : {match}',
    winner: '\n🏆 Victoire de **{team}**',
    draw: '\n🤝 Match nul',
    pens: ' (t.a.b. {h}–{a})',
    tzAsk: 'Votre fuseau : **{tz}**. Pour le changer : /fuseau Douala, /fuseau Paris, /fuseau UTC+1',
    tzSet: '🌍 Fuseau réglé sur **{tz}**.',
    tzBad: 'Fuseau inconnu. Exemples : Douala, Abidjan, Dakar, Lagos, Paris, Londres, Montréal, UTC+1.',
    langSet: '🇫🇷 Langue : français.',
    langAsk: 'Langue : /langue fr ou /langue en',
    unknown: 'Commande inconnue. Tapez /aide.',
    quota: '⏳ Les données de football sont momentanément limitées (quota du fournisseur). Réessayez un peu plus tard.',
    error: '😕 Données indisponibles pour le moment. Réessayez dans un instant.',
    btnLive: '🔴 Direct', btnToday: '📅 Aujourd’hui', btnMyTeams: '🔔 Mes équipes', btnHelp: '❓ Aide',
    status: { NS: 'À venir', TBD: 'Horaire à confirmer', '1H': '1re mi-temps', HT: 'Mi-temps', '2H': '2e mi-temps', ET: 'Prolongation', BT: 'Pause', P: 'Tirs au but', SUSP: 'Suspendu', INT: 'Interrompu', FT: 'Terminé', AET: 'Après prolongation', PEN: 'Après t.a.b.', PST: 'Reporté', CANC: 'Annulé', ABD: 'Abandonné', AWD: 'Sur tapis vert', WO: 'Forfait', LIVE: 'En cours' },
    pts: 'pts', played: 'J', group: 'Groupe', goals: 'buts',
  },
  en: {
    welcome:
      '⚽ **Welcome to Live Football!**\n\nLive scores, fixtures, tables and top scorers — and **an alert for every goal** your teams score.\n\n' +
      '• /live — matches in play\n• /follow Nigeria — goal, red card, half-time and full-time alerts\n• /table pl — league table\n\n' +
      'Just type a team name to see its card.',
    help:
      '⚽ **Live Football — help**\n\n' +
      '**Matches**\n/live — in play (/live all: every competition)\n/matches — today (/matches tomorrow, /matches 25/12)\n/match _number_ — match details\n\n' +
      '**Teams**\n/team _name_ — card, recent results, next fixtures\n/follow _name_ — live alerts\n/myteams — teams you follow\n/unfollow _name_\n\n' +
      '**Competitions**\n/table _league_ · /scorers _league_ · /leagues (shortcuts)\n\n' +
      '**Settings**\n/timezone _city_ · /lang fr · /about\n\n' +
      '👥 In a group, /follow sends alerts to the whole group.',
    about:
      'ℹ️ **Live Football** {version}\n\nData: API-Football (api-sports.io). Live data refreshes about every {every}; alerts go out as soon as the goal shows up in the data.\n' +
      'Times shown in your time zone: **{tz}**.\n\nOpen source: github.com/GPChat-Platform/bots',
    leagues: '🏆 **Competitions (shortcuts)**\n\n{list}\n\nExamples: /table afcon, /scorers pl, /table elite1',
    liveTitle: '🔴 **Live** ({n})',
    liveNone: 'No match in play in the major competitions.',
    liveNoneAll: 'No match in play right now.',
    liveMore: '\n_…and {n} more. /live all to see everything._',
    dayTitle: '📅 **Matches {day}** ({n})',
    dayNone: 'No match {day} in the major competitions.',
    dayMore: '\n_…and {n} more matches._',
    today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday', onDate: 'on {date}',
    teamAsk: 'Which team? Example: /team Nigeria',
    teamNone: 'No team found for “{q}”.',
    teamPick: 'Several teams match “{q}”:',
    teamCard: '{flag}**{name}**{country}\n{venue}',
    nextTitle: '\n📅 **Next fixtures**',
    lastTitle: '\n🧾 **Recent results**',
    none: '_none_',
    follow: '🔔 Follow',
    unfollow: '🔕 Unfollow',
    followed: '🔔 You follow **{team}**: alerts for every goal, red card, half-time and full-time.',
    followedGroup: '🔔 This group follows **{team}**: alerts will arrive here.',
    already: 'You already follow **{team}**.',
    followLimit: '🚫 Up to {n} teams per conversation. /myteams to remove some.',
    unfollowed: '🔕 You no longer follow **{team}**.',
    notFollowing: 'You don’t follow this team. /myteams for the list.',
    myTeams: '🔔 **Teams you follow** ({n})\n\n{list}',
    myTeamsNone: 'You don’t follow any team. Example: /follow Nigeria',
    leagueAsk: 'Which competition? /leagues for the list. Example: /table pl',
    leagueUnknown: 'Unknown competition: “{q}”. /leagues for the list.',
    standingsTitle: '📊 **Table — {league}** ({season})',
    standingsNone: 'No table available for this competition.',
    scorersTitle: '🎯 **Top scorers — {league}** ({season})',
    scorersNone: 'No top scorers available.',
    matchNotFound: 'Match not found.',
    refresh: '🔄 Refresh',
    details: '📋 Details',
    goal: '⚽ **GOAL!** {minute} — **{player}**{kind} ({team}){assist}\n{score}',
    goalNoEvent: '⚽ **GOAL!**\n{score}',
    ownGoal: ' (o.g.)', penalty: ' (pen.)', assist: '\nAssist: {name}',
    red: '🟥 **Red card** {minute} — {player} ({team})\n{score}',
    varNoGoal: '📺 **Goal disallowed by VAR** {minute} ({team})\n{score}',
    kickoff: '🟢 **Kick-off!**\n{score}',
    halftime: '⏸️ **Half-time**\n{score}',
    secondHalf: '▶️ **Second half under way**\n{score}',
    extraTime: '⏱️ **Extra time!**\n{score}',
    penalties: '🎯 **Penalty shoot-out!**\n{score}',
    fulltime: '🏁 **Full-time**\n{score}{result}',
    suspended: '⚠️ **Match interrupted**\n{score}',
    postponed: '📅 **Match postponed or cancelled**: {match}',
    winner: '\n🏆 **{team}** win',
    draw: '\n🤝 Draw',
    pens: ' ({h}–{a} on pens)',
    tzAsk: 'Your time zone: **{tz}**. To change it: /timezone Lagos, /timezone London, /timezone UTC+1',
    tzSet: '🌍 Time zone set to **{tz}**.',
    tzBad: 'Unknown time zone. Examples: Lagos, Accra, Nairobi, London, Paris, New York, UTC+1.',
    langSet: '🇬🇧 Language: English.',
    langAsk: 'Language: /lang en or /lang fr',
    unknown: 'Unknown command. Type /help.',
    quota: '⏳ Football data is temporarily limited (provider quota). Please try again a bit later.',
    error: '😕 Data unavailable right now. Please try again in a moment.',
    btnLive: '🔴 Live', btnToday: '📅 Today', btnMyTeams: '🔔 My teams', btnHelp: '❓ Help',
    status: { NS: 'Upcoming', TBD: 'Time TBC', '1H': '1st half', HT: 'Half-time', '2H': '2nd half', ET: 'Extra time', BT: 'Break', P: 'Penalties', SUSP: 'Suspended', INT: 'Interrupted', FT: 'Full-time', AET: 'After extra time', PEN: 'After penalties', PST: 'Postponed', CANC: 'Cancelled', ABD: 'Abandoned', AWD: 'Awarded', WO: 'Walkover', LIVE: 'In play' },
    pts: 'pts', played: 'P', group: 'Group', goals: 'goals',
  },
};

function t(lang, key, params = {}) {
  const dict = S[lang] || S.fr;
  const pick = (d) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), d);
  let s = pick(dict);
  if (s == null) s = pick(S.fr);
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
}

module.exports = { t, S };
