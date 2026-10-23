# CLAUDE.md : consignes pour Claude Code sur SHIKU Audience (prototype)

Langue : français pour les échanges, la documentation et les messages de commit.

## Règles non négociables
- **Ne jamais** réinitialiser le dépôt, supprimer des modifications locales ni remplacer le travail par une nouvelle archive.
- **Aucun commit, push, merge ni changement de branche** sans autorisation explicite de l'utilisateur.
- **Aucun secret** (mot de passe, jeton, fichier `.env`) dans le code, les docs, les tests ou les journaux. Données fictives uniquement.
- Ne jamais supprimer un volume Docker, ne jamais contourner une migration, ne jamais inventer de données.
- Ne pas présenter un test comme réussi s'il n'a pas été exécuté ; dire ce qui n'a pas été lancé.
- Ne pas réécrire le backend en Spring Boot. Le prototype est en NestJS (l'incohérence avec DEC-27 est signalée, non tranchée).
- Une règle métier non définie n'est pas inventée : la marquer `HYPOTHESE(...)`, l'ajouter à `docs/dev/HYPOTHESES.md` avec la règle et son impact.
- Le journal est « protégé contre la modification et la suppression, y compris par un administrateur applicatif ». Ne jamais écrire « inaltérable » : le propriétaire du schéma et le superutilisateur peuvent le contourner (limite documentée).

## Pile
NestJS / TypeScript (backend), React / Vite (frontend), PostgreSQL, Keycloak, pnpm (npm refusé par `preinstall`). Versions exactes : `docs/dev/FICHE-TECHNIQUE.md`.

## Commandes (à la racine)
- `pnpm install --frozen-lockfile`, `pnpm doctor` (diagnostic de l'environnement)
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`
- `pnpm test` (unitaires backend et frontend), `pnpm test:db` (base réelle, demande les variables PostgreSQL), `pnpm test:scripts`
- `pnpm migrate:up`, `pnpm scan:secrets`

## Architecture de sécurité
- Gardes globales dans l'ordre : AuthGuard, HabilitationGuard, ContexteGuard. Refus par défaut.
- Chaque route déclare `@Public`, `@AuthentifieSeulement` ou `@ExigeDroit('objet.verbe')`. Le test `routes-declarees.spec.ts` échoue sinon.
- Droits : `backend/src/habilitation/matrice-officielle.ts` (Gate 02A). Droits « D » refusés jusqu'aux délégations (Sprint 2). Extensions marquées `hypothese`.
- Toute mutation écrit une entrée de journal dans la même transaction ; l'inventaire est dans `backend/test/habilitation/mutations-journalisees.ts`.
- Toute donnée est filtrée par organisation. Le frontend masque des éléments d'après `/droits`, mais seul le backend décide.
- Comptes Keycloak créés via le compte de service : `docs/dev/COMPTES-KEYCLOAK.md`.

## Conventions
- Une tâche ou une story par pull request ; gabarit `.github/PULL_REQUEST_TEMPLATE.md`.
- Fins de ligne : LF (`.gitattributes`). Un fichier existant en CRLF se modifie en gardant ses fins de ligne.
- Documentation à mettre à jour avec le code : `docs/dev/API.md`, `ETAT-FONCTIONNEL.md`, `HYPOTHESES.md`.
- Hooks Git dans `.githooks/` (activés par `scripts/bootstrap.sh`) ; détail dans `docs/dev/CI.md`.
