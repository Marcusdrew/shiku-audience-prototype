# Prérequis du poste (T0-01)

Données vérifiées le 2026-10-09 et 2026-10-10 sur les sources officielles (calendrier Node.js, politique de versions PostgreSQL, annonces Keycloak) et sur le registre npm (métadonnées `engines` et `peerDependencies`). **Toutes les versions sont `HYPOTHESE(DEC-04)`** tant que le représentant habilité n'a pas fixé les versions au Plan d'Exécution de Gate 07. La fiche technique `docs/dev/FICHE-TECHNIQUE.md` a été validée par le responsable le 2026-10-10.

## À installer sur le poste

| Outil | Version retenue | Support | Commande de vérification |
|---|---|---|---|
| Git (avec Git Bash sous Windows) | dernière stable | n/a | `git --version` |
| Docker Desktop (Windows, WSL 2) avec Compose | dernière stable | n/a | `docker --version` puis `docker compose version` |
| Node.js (développement hors conteneur) | **24.x** (ligne LTS « Krypton »), testé avec 24.21.0 | Active LTS jusqu'au 2026-10-20, maintenance jusqu'au 2028-04-30 | `node --version` |
| **pnpm** | **12.10.1** (version exacte) | Version courante | `pnpm --version` |

Node.js 26 passe LTS en octobre 2026 : à reconsidérer quand sa promotion LTS est effective. Le conteneur, lui, fixe Node 24 (`backend/Dockerfile`).

### Installer pnpm 12.10.1

```bash
npm install --global pnpm@12.10.1
pnpm --version        # doit afficher 12.10.1
```

(Testé avec Node 24.21.0 : l'installation fonctionne et `pnpm --version` affiche 12.10.1.) La version est inscrite à trois endroits qui doivent rester identiques : `"packageManager"` et `"engines.pnpm"` dans le `package.json` racine, et `backend/Dockerfile`. Pour changer de version, modifiez les trois dans la même pull request.

## Versions des composants (dans les conteneurs ou dans les `package.json`)

| Composant | Version | Remarque |
|---|---|---|
| PostgreSQL | **18** (image `postgres:18`) | Supportée jusqu'en novembre 2030. La 19 est annoncée pour octobre 2026 : trop récente. Tests faits sur le serveur 18.4 (build tiers), pas sur l'image officielle |
| Keycloak | **26.8.0** (image épinglée) | Keycloak n'a **pas de ligne LTS** : seule la dernière version reçoit des correctifs. La règle « LTS » ne peut donc s'appliquer qu'en épinglant une version exacte et en planifiant des mises à jour régulières. Repli : 26.7.x. Testée hors Docker (archive de la release GitHub) |
| NestJS | 12.1.2 | Épinglée en version exacte. |
| TypeScript | 6.0.3 | Plafonnée à `<6.1.0` par `typescript-eslint` 8.71.1 ; TypeScript 7 non retenu. |
| node-pg-migrate | 9.0.0 | Migrations SQL pures. |
| Vitest / Prettier / ESLint | 5.0.3 / 3.9.9 / 10.12.0 | Tests, formatage, lint. |
| React + Vite (frontend) | **présents dans `frontend/`** | React 19, Vite 8, TypeScript 6 ; voir `frontend/README.md` et `docs/dev/FRONTEND.md`. La décision `DEC-28` reste à confirmer par le représentant habilité. |

## pnpm : comment le dépôt est organisé

- **Un seul verrou : `pnpm-lock.yaml`, à la racine, versionné.** `package-lock.json`, `yarn.lock` et leurs équivalents sont ignorés par Git (`.gitignore`).
- **Versions exactes** (`.npmrc` : `save-exact=true`) et `engine-strict=true` : un Node qui n'est pas en 24.x fait échouer l'installation.
- **Espace de travail** (`pnpm-workspace.yaml`) : `backend` et `frontend`. Le frontend s'y ajoutera sans changer l'organisation, quand `DEC-28` sera rendue.
- **Garde** : `npm install` à la racine est refusé (script `preinstall`). Il peut toutefois laisser un `package-lock.json` local : supprimez-le, il est de toute façon ignoré par Git.
- **Docker** : l'image installe pnpm 12.10.1, puis `pnpm install --frozen-lockfile` (échoue si le verrou n'est pas à jour), compile, puis `pnpm deploy --prod` pour n'embarquer que les dépendances de production.

Commandes courantes (depuis la racine) :

```bash
pnpm install              # installe depuis le verrou
pnpm build                # compile le backend
pnpm test                 # tests unitaires (aucune base requise)
pnpm test:db              # tests de sécurité de la base (à partir de T0-33 ; pile démarrée, voir PREUVES-AJOUT-SEUL.md)
pnpm lint                 # ESLint
pnpm format:check         # Prettier (pnpm --filter shiku-backend format pour corriger)
```

## Ce qui a été exécuté avec pnpm (2026-10-10, Node 24.21.0, pnpm 12.10.1)

`pnpm install --frozen-lockfile` sur une copie vierge du dépôt, puis `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm test` (3 tests), `pnpm --filter shiku-backend deploy --prod` et démarrage de l'application compilée : tout a réussi. L'**image Docker** n'a pas été construite (voir `docs/dev/VALIDATION-PILE.md`).
