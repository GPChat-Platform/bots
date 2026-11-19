'use strict';
// Textes du bot Cinéma (FR/EN). t(lang, clé, paramètres) ; repli sur le français.

const STRINGS = {
  fr: {
    welcome: 'Bienvenue sur **Ciné Club** 🎬\nCherchez un film, un acteur, découvrez les tendances et gardez votre liste de films à voir.\n\nTapez /aide pour la liste des commandes, ou envoyez simplement un titre.',
    help:
      '**Commandes**\n' +
      '• `/film titre` — fiche d\'un film (affiche, notes, casting)\n' +
      '• `/acteur nom` — biographie et films connus\n' +
      '• `/tendances` — films du moment\n' +
      '• `/bientot` — prochaines sorties\n' +
      '• `/hasard [genre]` — un film au hasard (ex. `/hasard thriller`)\n' +
      '• `/ou_voir titre` — où le regarder (streaming)\n' +
      '• `/similaires titre` — films dans le même esprit\n' +
      '• `/comparer film A | film B` — comparer deux films\n' +
      '• `/liste` · `/ajouter titre` · `/retirer numéro` — votre liste « à voir »\n' +
      '• `/quiz` — devinez le film\n' +
      '• `/langue fr|en` · `/pays CM` — vos préférences\n' +
      '• `/apropos` — sources des données',
    about: 'Données de films : TMDB. Notes IMDb, Rotten Tomatoes et Metacritic : OMDb.\nCe produit utilise l\'API TMDB mais n\'est ni approuvé ni certifié par TMDB. Informations de streaming : JustWatch (via TMDB).\nCode source libre : https://github.com/GPChat-Platform/bots',
    askTitle: 'Quel film ? Exemple : `/film Black Panther`',
    askPerson: 'Quel acteur ou quelle actrice ? Exemple : `/acteur Lupita Nyong\'o`',
    askCompare: 'Format : `/comparer Film A | Film B`',
    noResult: 'Aucun résultat pour « {q} ». Essayez une autre orthographe.',
    pick: 'Plusieurs résultats pour « {q} » — lequel ?',
    trending: '🔥 **Tendances de la semaine**',
    upcoming: '📅 **Prochaines sorties**',
    similarTo: '🎞️ **Dans le même esprit que {title}**',
    randomPick: '🎲 Pour ce soir :',
    unknownGenre: 'Genre inconnu. Genres : {list}.',
    whereTitle: '📺 **{title}** — où le voir ({country})',
    whereNone: 'Aucune offre de streaming trouvée pour {country}. Essayez `/pays FR` ou `/pays US`.',
    stream: 'Abonnement', rent: 'Location', buy: 'Achat', free: 'Gratuit',
    listEmpty: 'Votre liste est vide. Ajoutez un film avec `/ajouter titre` ou le bouton « Ma liste ».',
    listTitle: '📝 **Votre liste « à voir »**',
    added: '✅ « {title} » ajouté à votre liste.',
    alreadyIn: '« {title} » est déjà dans votre liste.',
    removed: '🗑️ « {title} » retiré de votre liste.',
    badIndex: 'Numéro invalide. Utilisez `/liste` pour voir les numéros.',
    langSet: 'Langue : français.', langBad: 'Langues disponibles : `fr`, `en`.',
    countrySet: 'Pays pour le streaming : {country}.', countryBad: 'Code pays à deux lettres, par exemple `CM`, `FR`, `US`.',
    quizIntro: '🎬 **Devine le film !**\n{hint}\nGenre : {genre} · Année : {year}',
    quizRight: '✅ Bravo ! C\'était **{title}**.', quizWrong: '❌ Raté… C\'était **{title}**.', quizScore: 'Vos bonnes réponses : {n}',
    quizExpired: 'Cette question a expiré. Lancez `/quiz` pour une nouvelle partie.',
    quizAgain: 'Rejouer',
    unknownCmd: 'Commande inconnue. Tapez /aide.',
    error: 'Le service de données est momentanément indisponible. Réessayez dans un instant.',
    btnWhere: '📺 Où voir', btnSimilar: '🎞️ Similaires', btnList: '➕ Ma liste', btnTrailer: '▶️ Bande-annonce', btnCast: '👥 Casting', btnMore: 'Voir la fiche',
    rating: 'Note', runtime: 'Durée', director: 'Réalisation', cast: 'Casting', genres: 'Genres', released: 'Sortie', awards: 'Récompenses',
    born: 'Naissance', knownFor: 'Connu pour', biography: 'Biographie', overview: 'Synopsis', unknown: 'inconnu',
    compareTitle: '⚖️ **{a}** vs **{b}**', cmpRating: 'Note', cmpYear: 'Année', cmpRuntime: 'Durée',
    anon: 'Anonyme', minutes: 'min',
  },
  en: {
    welcome: 'Welcome to **Ciné Club** 🎬\nLook up a movie or an actor, see what is trending and keep a watchlist.\n\nType /help for the command list, or simply send a title.',
    help:
      '**Commands**\n' +
      '• `/movie title` — movie card (poster, ratings, cast)\n' +
      '• `/actor name` — biography and best-known films\n' +
      '• `/trending` — what is hot this week\n' +
      '• `/upcoming` — coming soon\n' +
      '• `/random [genre]` — a random movie (e.g. `/random thriller`)\n' +
      '• `/where title` — where to watch (streaming)\n' +
      '• `/similar title` — movies in the same spirit\n' +
      '• `/compare movie A | movie B` — compare two movies\n' +
      '• `/list` · `/add title` · `/remove number` — your watchlist\n' +
      '• `/quiz` — guess the movie\n' +
      '• `/lang fr|en` · `/country US` — your preferences\n' +
      '• `/about` — data sources',
    about: 'Movie data: TMDB. IMDb, Rotten Tomatoes and Metacritic ratings: OMDb.\nThis product uses the TMDB API but is not endorsed or certified by TMDB. Streaming information: JustWatch (via TMDB).\nOpen source: https://github.com/GPChat-Platform/bots',
    askTitle: 'Which movie? Example: `/movie Black Panther`',
    askPerson: 'Which actor or actress? Example: `/actor Lupita Nyong\'o`',
    askCompare: 'Format: `/compare Movie A | Movie B`',
    noResult: 'No result for "{q}". Try another spelling.',
    pick: 'Several results for "{q}" — which one?',
    trending: '🔥 **Trending this week**',
    upcoming: '📅 **Coming soon**',
    similarTo: '🎞️ **In the same spirit as {title}**',
    randomPick: '🎲 For tonight:',
    unknownGenre: 'Unknown genre. Genres: {list}.',
    whereTitle: '📺 **{title}** — where to watch ({country})',
    whereNone: 'No streaming offer found for {country}. Try `/country US` or `/country FR`.',
    stream: 'Subscription', rent: 'Rent', buy: 'Buy', free: 'Free',
    listEmpty: 'Your watchlist is empty. Add a movie with `/add title` or the "My list" button.',
    listTitle: '📝 **Your watchlist**',
    added: '✅ "{title}" added to your list.',
    alreadyIn: '"{title}" is already in your list.',
    removed: '🗑️ "{title}" removed from your list.',
    badIndex: 'Invalid number. Use `/list` to see the numbers.',
    langSet: 'Language: English.', langBad: 'Available languages: `fr`, `en`.',
    countrySet: 'Streaming country: {country}.', countryBad: 'Two-letter country code, for example `CM`, `FR`, `US`.',
    quizIntro: '🎬 **Guess the movie!**\n{hint}\nGenre: {genre} · Year: {year}',
    quizRight: '✅ Well done! It was **{title}**.', quizWrong: '❌ Missed… It was **{title}**.', quizScore: 'Your correct answers: {n}',
    quizExpired: 'This question has expired. Send `/quiz` to start a new one.',
    quizAgain: 'Play again',
    unknownCmd: 'Unknown command. Type /help.',
    error: 'The data service is temporarily unavailable. Please try again in a moment.',
    btnWhere: '📺 Where to watch', btnSimilar: '🎞️ Similar', btnList: '➕ My list', btnTrailer: '▶️ Trailer', btnCast: '👥 Cast', btnMore: 'Open card',
    rating: 'Rating', runtime: 'Runtime', director: 'Director', cast: 'Cast', genres: 'Genres', released: 'Release', awards: 'Awards',
    born: 'Born', knownFor: 'Known for', biography: 'Biography', overview: 'Synopsis', unknown: 'unknown',
    compareTitle: '⚖️ **{a}** vs **{b}**', cmpRating: 'Rating', cmpYear: 'Year', cmpRuntime: 'Runtime',
    anon: 'Anonymous', minutes: 'min',
  },
};

function t(lang, key, params) {
  const table = STRINGS[lang] || STRINGS.fr;
  let s = table[key] ?? STRINGS.fr[key] ?? key;
  for (const [k, v] of Object.entries(params || {})) s = s.split(`{${k}}`).join(String(v));
  return s;
}

module.exports = { t, STRINGS };
