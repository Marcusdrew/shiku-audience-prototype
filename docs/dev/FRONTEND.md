# Frontend (React + Vite + TypeScript)

`HYPOTHESE(DEC-28)` : voir `frontend/README.md`. Mobile : non démarré (CONTRIBUTING § 6).

## Architecture

```
frontend/src/
├── main.tsx, App.tsx          point d'entrée, routes (publiques : /connexion, /callback ; privées : le reste)
├── config/env.ts              variables VITE_* (aucun secret)
├── auth/                      oidc.ts (UserManager, PKCE), AuthContext.tsx (session), RequireAuth.tsx, roles.ts
├── api/                       client.ts (fetch + erreurs + Bearer), useRequete.ts (chargement/erreur), sante.ts
├── components/                AppShell (en-tête, menu, responsive), Card/Badge, Spinner, ErrorState
├── pages/                     Dashboard, Login, Callback, ModulePage (modules sans API), NotFound
└── navigation.ts              les six entrées métier + exigences, stories et API attendues
```

Choix et justification :

- **oidc-client-ts** : bibliothèque OIDC générique, flux Authorization Code + PKCE S256 pour client public, renouvellement par jeton de rafraîchissement. Pas de dépendance au serveur Keycloak (`keycloak-js`), donc réutilisable si le fournisseur change.
- **react-router** : routes privées par une garde `RequireAuth`.
- **Aucun gestionnaire d'état global ni bibliothèque de composants** : une seule API réelle existe ; ajouter ces outils serait spéculatif.
- **Proxy de développement** : le backend n'active pas CORS (`backend/src/main.ts`). Le navigateur appelle `/api/...` sur `localhost:5173`, Vite relaie vers `localhost:3000` en retirant `/api`. Le backend n'a pas été modifié. En production, servir frontend et API sous la même origine (reverse proxy) ou ajouter CORS au backend dans une tâche dédiée.
- **Jetons en `sessionStorage`** (vidés à la fermeture de l'onglet), jamais en `localStorage`.

## Ce qui est réel et ce qui ne l'est pas

| Élément | État |
|---|---|
| Connexion / déconnexion Keycloak, session, route privée, erreurs | Réel, testé dans un navigateur (voir ci-dessous) |
| `GET /sante`, `GET /moi`, `GET /droits` sur le tableau de bord et le menu | Réel |
| Rôles lus dans le jeton | Réel, **affichage seulement** (signature non vérifiée côté navigateur) ; l'identité qui fait foi vient de `GET /moi` |
| Demandes (liste, recherche, création, détail, qualification, correction), Priorité dans le détail d'une demande (six critères affichés, saisie des critères, niveau fixé par l'Autorité, DEC-37), Décisions (file limitée au périmètre de l'Autorité et triée par niveau puis ancienneté, valider/rejeter/différer), filtre « à rattacher » des demandes, Agendas (Autorité de rattachement : proposer, autoriser, appliquer, révoquer ; badge « À rattacher ») et planning, Opérations du jour (démarrer/terminer), Journal, Administration (comptes) | **Réel**, branchés sur l'API (`docs/dev/API.md`). Boutons et menus pilotés par `GET /droits` ; le serveur recontrôle chaque action |
| Clôture d'audience | Bouton « Clôturer » si `/droits` accorde `audience.cloturer` (Autorité, Assistant), avec confirmation explicite (irréversible) ; durée réelle et responsable de suivi affichés |
| Répertoire des visiteurs (`/relationnel`) | **Réel** (`GET /visiteurs`, `POST /visiteurs`, `PATCH /visiteurs/:id`) : recherche avant création ; prénom, nom, contact obligatoires ; contact masqué et sans qualité pour la Réception (le serveur n'envoie pas le contact complet) ; doublon signalé par le serveur (409) : choisir la fiche existante (depuis une demande) ou confirmer (« homonyme distinct » si même contact) ; modification par l'Assistant et l'Autorité (DEC-36) |
| Statut d'une demande rejetée vue par la Réception | Statut neutre `non_retenue` fourni par le serveur, affiché « Non retenue — ne pas planifier » ; filtre adapté |
| Journal | Filtres réels du serveur (type et identifiant d'objet) et pagination. Restrictions par catégorie (arbitrage du 19/10) : **non appliquées par le serveur** (Q-1) |
| Dossiers relationnels (notes, attestations), salle d'attente, délégations | **Aucune API** : l'écran l'indique. Aucune donnée fictive |
| Indicateurs du tableau de bord (EF03-17) | Absents : aucune API |

## Sécurité : à ne pas oublier

- Le backend valide les jetons et contrôle chaque droit côté serveur (`ETAPE-1-AUTHENTIFICATION.md`). La garde React, le masquage du menu et des boutons ne sont **pas** des contrôles d'accès (CONTRIBUTING § 4.1) : ils reflètent `GET /droits`, matrice officielle Gate 02A (extensions hypothétiques, `HYPOTHESES.md`). Le jeton est transmis en `Bearer` à chaque appel métier.
- Menu par rôle : `HYPOTHESE(DEC-28)`, déduit du cahier des charges, jamais décisionnel.
- Le Protocole est un profil de délégation (D04-24) : il n'est pas dans le jeton, donc pas dans le menu.

## Configuration Keycloak (realm `shiku`, client `shiku-web`)

Vérifiée dans `infra/keycloak/realm-shiku.json` : client public, `standardFlowEnabled`, implicite et mot de passe directs désactivés, PKCE `S256`, redirections `http://localhost:5173/*`, origine `http://localhost:5173`, déconnexion `http://localhost:5173/*`. Suffisant en développement. **Pour un autre hôte (staging/production) il faut ajouter ses URL** au realm : `redirectUris`, `webOrigins`, `post.logout.redirect.uris`.

## Vérifications réalisées (2026-10-11, environnement de développement de l'assistant, Linux)

Tests frontend automatisés : voir `docs/dev/ETAT-FONCTIONNEL.md`. Aucun essai dans un vrai navigateur n'a été fait pour les écrans métier (tests avec API simulée seulement). Non réalisé : essai sur Windows, Docker Desktop, Keycloak sur PostgreSQL, base PostgreSQL pour `/sante` en état « ok ».
