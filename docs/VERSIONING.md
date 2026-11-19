# Versionnage et changelog

## Principes

- Chaque bot est versionné **séparément**, en [SemVer 2.0](https://semver.org/lang/fr/) (`MAJEUR.MINEUR.CORRECTIF`), dans son `package.json`. La version est affichée au démarrage (journal), dans `gpchat_bot_info{version}` et, quand le bot a une commande `/apropos`, à l'utilisateur.
- Le dépôt a un [CHANGELOG.md](../CHANGELOG.md) global ; chaque bot a le sien (`bots/<nom>/CHANGELOG.md`) au format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) (sections *Ajouté, Modifié, Déprécié, Retiré, Corrigé, Sécurité*).
- Les modifications sont décrites **pour l'utilisateur du bot ou son exploitant**, pas pour le développeur : « `/ou_voir` indique maintenant les offres gratuites », pas « refactor ».

## Ce que signifie chaque numéro

| Numéro | Quand | Exemples |
|---|---|---|
| **Correctif** `x.y.Z` | correction sans changement de comportement voulu | bug d'affichage, erreur TMDB mal gérée, dépendance de sécurité |
| **Mineur** `x.Y.0` | nouveauté compatible | nouvelle commande, nouvelle langue, nouveau champ de configuration facultatif, nouvelle métrique |
| **Majeur** `X.0.0` | changement cassant | commande renommée ou supprimée, variable d'environnement obligatoire nouvelle ou renommée, format du fichier de données incompatible, changement de comportement qui oblige l'exploitant à agir |

Règles de dépréciation : une commande ou une variable est d'abord **dépréciée** (version mineure, message d'aide + CHANGELOG « Déprécié »), puis **retirée** dans la version majeure suivante — au moins une version mineure plus tard. Les données persistées portent un `schemaVersion` quand leur format change ; la migration est automatique au démarrage, jamais destructive sans sauvegarde.

## Compatibilité avec l'API GPChat

Les bots ciblent l'API `/v1` de GPChat. Dans une version majeure, GPChat ne publie que des changements rétrocompatibles et maintient une version au moins **12 mois** après l'annonce de la suivante ([politique](https://gpchat.app/developers/docs#versioning)). Le SDK embarqué ignore les champs inconnus ; un bot de la bibliothèque doit en faire autant. Un passage de l'API en `/v2` fera l'objet d'une version majeure de chaque bot, annoncée dans le CHANGELOG.

## Publier une version

1. Rédigez les changements sous `## [Non publié]` dans le CHANGELOG du bot (au fil des pull requests).
2. Lancez : `node scripts/release.mjs <bot> <correctif|mineur|majeur>`. Le script vérifie que l'arbre est propre, lance les tests du bot, met à jour `package.json`, transforme « Non publié » en `## [x.y.z] — AAAA-MM-JJ`, crée le commit `chore(release): <bot> vx.y.z` et l'étiquette `<bot>-vx.y.z`.
3. `git push --follow-tags` : le workflow [`release.yml`](../.github/workflows/release.yml) revérifie, construit l'image Docker, la publie sur GHCR (`ghcr.io/gpchat-platform/bots-<bot>:x.y.z` et `:latest`) et crée la *Release* GitHub avec les notes extraites du CHANGELOG.
4. Déployez : `docker compose pull && docker compose up -d` (voir [OPERATIONS.md](OPERATIONS.md) pour vérifier `/readyz` après la mise à jour).

## Étiquettes et images

| Élément | Format | Exemple |
|---|---|---|
| Étiquette git | `<bot>-v<version>` | `cinema-v1.2.0` |
| Image | `ghcr.io/gpchat-platform/bots-<bot>:<version>` | `bots-cinema:1.2.0` |
| Modèle de bot | `v<version>` | `v1.1.0` |

Ne réutilisez jamais une étiquette ni une version publiée : corrigez par une nouvelle version.
