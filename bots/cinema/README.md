# Ciné Club (`@cineclub_bot`)

Guide cinéma pour GPChat : fiches de films avec affiche, notes **IMDb / Rotten Tomatoes / Metacritic**, acteurs, tendances, sorties, **où regarder** (streaming par pays), comparaison, quiz et liste « à voir ». Français et anglais.

## Commandes
`/film`, `/acteur`, `/tendances`, `/bientot`, `/hasard [genre]`, `/ou_voir`, `/similaires`, `/comparer A | B`, `/liste`, `/ajouter`, `/retirer n`, `/quiz`, `/langue fr|en`, `/pays CM`, `/aide`, `/apropos`.
Envoyer simplement un titre en message privé lance aussi une recherche. En groupe, le bot ne répond qu'aux commandes ou quand on le mentionne.

## Données
- **TMDB** (obligatoire) — fiches, casting, affiches, streaming. Jeton « Read Access Token » gratuit. *This product uses the TMDB API but is not endorsed or certified by TMDB.* Vérifiez leurs conditions pour un usage commercial.
- **OMDb** (facultatif) — notes IMDb / Rotten Tomatoes / Metacritic. IMDb n'offre pas d'API gratuite : OMDb est le relais le plus simple (clé gratuite limitée à ~1 000 requêtes/jour).
- Streaming : JustWatch via TMDB.

## Lancer
```bash
cd bots/cinema && npm install
GPCHAT_API_KEY=gpk_live_… TMDB_TOKEN=… OMDB_API_KEY=… npm start
npm test        # 17 tests, sans réseau
```
Un cache mémoire (10 min TMDB, 1 h OMDb) limite les appels. Préférences et listes : `DATA_DIR/cinema.json`.
