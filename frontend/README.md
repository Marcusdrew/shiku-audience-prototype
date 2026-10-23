# frontend/

Application React + Vite + TypeScript. Connexion Keycloak (code d'autorisation + PKCE), écrans
protégés par rôle pour l'**affichage**, appels à l'API via `src/api/client.ts`.

- `GET /sante` : état du service (public).
- `GET /moi` (étape 1) : identité et rôles **confirmés par le backend** à partir du jeton vérifié.
  Le tableau de bord les affiche à côté des rôles lus localement dans le jeton (affichage seul,
  sans vérification de signature). Seul le serveur fait foi ; `/moi` n'accorde aucun droit métier.
- Aucun module métier n'a encore d'API : leurs écrans le disent explicitement.

Voir `docs/dev/FRONTEND.md` et `docs/dev/FRONTEND-API-MANQUANTES.md`.
Commandes : `pnpm --filter shiku-frontend test | lint | typecheck | build`.
