# Étape 1 : vérification des jetons et habilitation (refus par défaut)

Statut : **prototype**. Ce document sépare ce qui est établi (dépôt, documents) de ce qui est
**hypothèse** (à valider par le représentant habilité). Aucune hypothèse ci-dessous n'est une
décision métier.

## Ce que fait le backend

| Élément           | Comportement                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /sante`      | Public (`@Public()`).                                                                                                                                                                                                                                       |
| `GET /moi`        | Jeton Bearer vérifié obligatoire. Renvoie `sub`, `identifiant`, `nom`, `email`, `roles` **issus du jeton vérifié**, rien d'autre. N'accorde aucun droit métier. Ne crée aucun compte applicatif (voir `GET /droits` pour savoir si un compte actif existe). |
| Toute autre route | Doit déclarer `@Public()`, `@AuthentifieSeulement()` ou `@ExigeDroit('objet.verbe')`. Sinon : 401 sans jeton, 403 avec jeton (refus par défaut). Un test d'architecture échoue si une route réelle n'est pas déclarée.                                      |
| Jeton             | Signature RS256 (clés lues dans le JWKS Keycloak), `iss`, `exp`, `iat`, `sub` obligatoires, `typ = Bearer`, `azp = shiku-web`. `id_token`, `refresh_token`, jetons `none`/HS256 : refusés. Rôles = `realm_access.roles` filtrés sur les 4 rôles connus.     |
| Échecs            | Jeton invalide ou expiré : 401 (message générique). Droit insuffisant : 403. Authentification non configurée ou Keycloak injoignable : 503 (échec fermé, jamais d'accès).                                                                                   |

## Variables (sans secret)

| Variable            | Rôle                                                                                                                                              | Défaut                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `KEYCLOAK_ISSUER`   | Émetteur attendu (`iss`), adresse vue par le **navigateur** (ex. `http://localhost:8080/realms/shiku`). Vide → 503 partout sauf routes publiques. | aucun                                    |
| `KEYCLOAK_JWKS_URL` | Où le backend lit les clés publiques (en Docker : `http://keycloak:8080/...`).                                                                    | `<issuer>/protocol/openid-connect/certs` |
| `AUTH_CLIENT_ID`    | Client attendu (`azp`).                                                                                                                           | `shiku-web`                              |

Deux variables distinctes car, en `start-dev`, l'`iss` suit l'hôte utilisé par le navigateur alors que le
conteneur joint Keycloak par le réseau Docker. Câblé dans `docker-compose.yml` (service `app`).

## Matrice RBAC : officielle Gate 02A, avec extensions signalées

`backend/src/habilitation/matrice-officielle.ts`, transcrite de `phase-03-matrice-rbac-delegation.md`
(fournie par M. Jordan le 16/10/2026). Le test `matrice.spec.ts` compare le code à la table officielle.
Les droits « D » (délégation) sont **refusés** tant que les délégations n'existent pas (Sprint 2).
Le Protocole n'est pas un rôle du jeton : c'est un profil de délégation. Une action inconnue est refusée.
Les actions absentes de la matrice officielle (extensions) portent `hypothese` : voir `HYPOTHESES.md`.
H1 est donc levée pour les 26 actions officielles ; elle reste ouverte pour les extensions.

## Hypothèses

| #   | Sujet                                                                                                                                                                                                                                      | Nature                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Matrice RBAC dérivée du backlog                                                                                                                                                                                                            | validation métier                                                                                                                                                                   |
| H2  | Voir DEC-19 / realm                                                                                                                                                                                                                        | validation métier                                                                                                                                                                   |
| H3  | Format `DEM-AAAA-NNNNNN`                                                                                                                                                                                                                   | proposition en attente de validation                                                                                                                                                |
| H4  | Clôture sans responsable désigné                                                                                                                                                                                                           | validation métier                                                                                                                                                                   |
| H5  | Identifiants techniques                                                                                                                                                                                                                    | choix technique confirmable                                                                                                                                                         |
| H6  | Politique d'attribution des comptes applicatifs                                                                                                                                                                                            | mécanisme provisoire : rattachement explicite par un administrateur (`POST /utilisateurs`) ; premier administrateur posé par `scripts/amorcer-donnees-test.mjs` ; validation métier |
| H7  | Nom d'organisation de test                                                                                                                                                                                                                 | validation métier                                                                                                                                                                   |
| H8  | Priorité saisie par un utilisateur habilité                                                                                                                                                                                                | proposition en attente de validation                                                                                                                                                |
| H9  | `journal.consulter` réservé à l'Autorité                                                                                                                                                                                                   | validation métier                                                                                                                                                                   |
| H10 | Pas de CORS ni de proxy en production                                                                                                                                                                                                      | choix technique confirmable                                                                                                                                                         |
| H11 | Contrôle `azp` (le realm n'a pas de mapper d'audience)                                                                                                                                                                                     | choix technique confirmable                                                                                                                                                         |
| H12 | Droits ajoutés à la matrice pour que le parcours fonctionne (lecture des demandes par la Réception et l'Autorité, modification d'une demande, file de décisions et planning, liste des agendas) ; qualification de visiteur en texte libre | validation métier                                                                                                                                                                   |
| H13 | Une seule audience par demande à ce stade                                                                                                                                                                                                  | validation métier                                                                                                                                                                   |
| H14 | Machine d'états des demandes et audiences (`backend/src/demandes/statuts.ts`)                                                                                                                                                              | validation métier                                                                                                                                                                   |

## Realm : scope `basic` (résolu avec l'accord de M. Jordan)

Le client `shiku-web` n'avait pas le scope `basic` dans `defaultClientScopes` : Keycloak 26 n'émettait alors **pas de `sub`** dans le jeton d'accès, et le backend (qui exige `sub`) refusait tous les jetons. Le scope a été ajouté à l'instance locale par la console d'administration (sauvegarde de la base Keycloak faite avant), et `infra/keycloak/realm-shiku.json` a été aligné (`"basic"` en tête de `defaultClientScopes`). L'import du realm ne se rejoue pas sur un realm existant : une installation neuve reçoit le scope via le fichier, une installation existante l'a reçu par la console. Les utilisateurs doivent se reconnecter pour obtenir un jeton avec `sub`.

## Limites connues

- Un jeton reste valable jusqu'à son `exp` (pas de vérification de révocation, pas de verrouillage de
  session à 5 minutes côté serveur).
- Comptes applicatifs : ils existent (table `utilisateur`) ; `/moi` prouve l'identité, jamais un droit. Toute route métier exige un compte actif rattaché par un administrateur (jamais créé automatiquement).
- DEC-16 (authentification) reste ouverte.
- `/sante` avec base « ok » : exécuté sur PostgreSQL 16 (environnement de développement), pas sur PostgreSQL 18 ni dans Docker.

## Vérifier sous Windows (Git Bash + Docker Desktop)

```bash
bash scripts/init-local.sh
docker compose up --build -d
node --env-file=.env scripts/verifier-auth.mjs
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

`verifier-auth.mjs` ne couvre pas : jeton expiré, mauvais client, refus par défaut d'une route non
déclarée (couverts par les tests automatisés avec de fausses clés). Il suppose le scope `basic` présent (voir ci-dessus).
