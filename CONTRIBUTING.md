# Contribuer

Merci de proposer un bot ! / Thanks for contributing a bot!

## Checklist d'une contribution

- [ ] Dossier `bots/<nom>/` créé à partir de `_template/`.
- [ ] `bot.json` complet : nom (sans *gpchat / forge / official / admin / verified*), `@username` finissant par `bot`, catégorie (`assistant`, `productivity`, `games`, `education`, `entertainment`, `news`, `finance`, `utilities`, `social`, `other`), description ≥ 20 caractères, commandes avec descriptions.
- [ ] `assets/avatar.png` 512×512 (et la source `avatar.svg` si possible) — image **originale** ou sous licence libre.
- [ ] Logique séparée du réseau + tests `node --test` (la CI doit passer : `npm test`).
- [ ] `README.md` du bot (usage, variables d'environnement) et `.env.example` — **aucun secret** dans le dépôt.
- [ ] `Dockerfile` construisant depuis la racine du dépôt (voir les bots existants).
- [ ] Respect des [règles d'usage des bots](https://gpchat.app/en/developers/docs#bot-rules) : un bot répond, il ne démarche pas ; pas d'usurpation ; pas de collecte de données sans consentement.

## Style

- Node.js ≥ 20, CommonJS, sans dépendance inutile ; Markdown GPChat pour le texte, texte brut pour les légendes d'image.
- Gérez les erreurs des services externes : un message poli à l'utilisateur, jamais de plantage.
- Respectez les limites de l'API (60 requêtes/minute par clé par défaut) : étalez les envois en masse.

## Signaler un problème de sécurité

Écrivez à infos@gpchat.app (n'ouvrez pas d'issue publique pour une faille).
