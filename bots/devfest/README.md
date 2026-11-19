# DevFest Guide (`@devfest_guide_bot`)

Le guide d'un événement : **programme**, **session en cours / prochaine**, **rappels 10 minutes avant**, **vote du public**, FAQ, annonces des organisateurs. Français et anglais, fuseau `Africa/Douala` (modifiable).

## Commandes
`/programme`, `/maintenant`, `/prochain`, `/lieu`, `/conferenciers`, `/tracks`, `/rappel id`, `/rappels`, `/annuler id`, `/vote`, `/faq`, `/langue fr|en`, `/aide` · organisateurs : `/annonce texte` (liste `ADMIN_IDS`, envoi étalé à ~1 message/s pour respecter la limite de 60 requêtes/minute).

## Programme
`data/program.json` contient le **programme officiel du DevFest Douala 2026** (source : devfest.gdgdouala.org, consulté le 2026-11-19, « sous réserve de modifications d'horaires »). `data/program.template.json` est un gabarit vierge pour un autre événement. Placez votre `program.json` dans `DATA_DIR` pour remplacer celui du dépôt. Format : `event` (nom, date, fuseau, lieu, `voteUrl`), `sessions` (`id`, `start`, `end`, `title`, `room`, `speaker`) et `faq`. Les textes peuvent être `{ "fr": "…", "en": "…" }`.

## Lancer
```bash
cd bots/devfest && npm install
GPCHAT_API_KEY=gpk_live_… ADMIN_IDS=userId1,userId2 npm start
npm test
```
