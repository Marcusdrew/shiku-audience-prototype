# Comptes Keycloak : compte de service et comptes de test

## Compte de service `shiku-service`

Client Keycloak confidentiel en `client_credentials`, utilisé par le backend pour créer les personnes (`POST /utilisateurs`). Il ne sert jamais à se connecter.
Secret : variable `KC_SERVICE_PASSWORD` (voir `SECRETS.md`), jamais versionné ; le backend la reçoit sous le nom `KEYCLOAK_SERVICE_CLIENT_SECRET` (`docker-compose.yml`). Le journal indique « via compte de service ».
Si l'écriture en base échoue après la création Keycloak, le backend supprime l'utilisateur créé (compensation).

Droits définis par le realm (`infra/keycloak/realm-shiku.json`) : `manage-users`, `query-users`, `view-users` (client `realm-management`). **Ce ne sont pas des droits minimaux** : mesuré sur Keycloak 26.8.0, ils permettent aussi d'attribuer `authority` et `administrator`, de lire les réglages du realm et de définir le mot de passe d'un compte. L'application, elle, refuse d'attribuer un autre rôle que Réception ou Assistant (arbitrage du 19/10/2026) ; la réduction ci-dessous applique la même limite dans Keycloak.

## Realm créé avant l'ajout de `shiku-service` (installation existante)

Keycloak n'importe `realm-shiku.json` qu'à la création du realm (stratégie `IGNORE_EXISTING`) : un realm plus ancien n'a pas ce client, et la création de comptes répond alors 503. Rattrapage, sans réinitialiser Keycloak ni ses données (dans PowerShell ou Git Bash, à la racine du dépôt, Keycloak démarré) :

```bash
node --env-file=.env scripts/verifier-compte-service.mjs                    # constat : « ABSENT » (code 3) ou « présent »
node --env-file=.env scripts/configurer-compte-service.mjs                  # simulation : n'écrit rien
node --env-file=.env scripts/configurer-compte-service.mjs --appliquer      # crée le client et son compte de service
node --env-file=.env scripts/verifier-compte-service.mjs --roles-creables reception,assistant,authority,administrator
```

- Variables lues dans `.env`, jamais affichées : `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KC_SERVICE_PASSWORD` ; `KEYCLOAK_PORT` donne l'adresse (`http://localhost:<port>`), sinon `KEYCLOAK_URL`.
- Le client est créé avec pour secret la valeur de `KC_SERVICE_PASSWORD` et reçoit les droits du realm actuel. S'il existe déjà, **son secret n'est jamais modifié** ; le script ne supprime ni client, ni compte, ni realm ; il est rejouable.
- `configurer-compte-service.mjs` sans `--appliquer` est une **simulation** : seules des lectures sont envoyées (prouvé par `scripts/compte-service-simulation.test.mjs` et par une empreinte du realm identique avant et après). `verifier-compte-service.mjs`, lui, **crée puis supprime** un compte sonde fictif quand le client existe ; s'il est absent, il ne fait que lire.
- Fin des scripts : ils n'appellent jamais `process.exit()` (cause de l'assertion `UV_HANDLE_CLOSING` de libuv observée sous Windows) ; le code de sortie est rendu par `process.exitCode`.
- Diagnostic de la vérification : code 3 = client absent ; code 4 = client présent mais secret différent de `KC_SERVICE_PASSWORD` (à aligner vous-même : onglet Credentials du client, ou `.env`) ; code 1 = Keycloak injoignable, identifiants d'administration refusés, ou une capacité attendue manquante.
- Ensuite, redémarrer l'application (`docker compose up -d app`) n'est utile que si elle tournait déjà : elle lit le secret au démarrage.

Mesuré sur un Keycloak 26.8.0 jetable démarré avec le realm de `d7c7b36` (sans ce client) : constat « absent », création, rejeu sans effet, création et suppression d'un compte par le compte de service, attribution des quatre rôles possible (droits du realm), comptes de test et accès de l'administrateur `master` inchangés.

## Réduire les droits à la liste blanche (Réception, Assistant)

L'arbitrage du 19/10/2026 (point 2) demande que la limite des rôles attribuables soit appliquée **dans l'application et dans les permissions du compte de service**. Avec les droits du realm, la seconde n'est pas assurée. `--reduire` remplace ces droits par des permissions fines de Keycloak (v2) : comptes (voir, gérer, attribuer des rôles) et **uniquement** les rôles Réception et Assistant (valeur par défaut).

```bash
node --env-file=.env scripts/configurer-compte-service.mjs --reduire               # simulation
node --env-file=.env scripts/configurer-compte-service.mjs --appliquer --reduire
KC_VERIFIER_REDUIT=1 node --env-file=.env scripts/verifier-compte-service.mjs      # PowerShell : $env:KC_VERIFIER_REDUIT=1 puis la commande
```

- Les droits d'origine ne sont retirés qu'une fois les nouvelles permissions posées et **vérifiées** ; si la vérification échoue, ils sont remis automatiquement.
- Retour arrière à tout moment : `node --env-file=.env scripts/configurer-compte-service.mjs --appliquer` (sans `--reduire`) redonne les droits du realm.
- Mesuré (même Keycloak jetable) : Réception et Assistant attribuables ; `authority` et `administrator` refusés (403) ; réglages du realm, groupes, rôles du realm, clients, événements d'administration et usurpation refusés (403) ; le backend ne voit plus que `assistant` et `reception` comme rôles disponibles. Retour arrière vérifié.
- Effet de bord : les permissions fines sont activées pour tout le realm `shiku`. L'administrateur du realm `master` garde ses accès (vérifié) ; aucun autre administrateur de ce realm n'a été mesuré.

**Garde-fou dans le code (exigé par M. Jordan le 23/10/2026) :** `backend/test/keycloak-mot-de-passe.spec.ts` échoue si le backend appelle une opération de définition de mot de passe (`reset-password`, `/credentials`, `credentials` ou `temporary` à la création d'un compte), ou si un autre module que `keycloak/keycloak-admin.service.ts` appelle l'API d'administration de Keycloak. Les autres contre-mesures (permissions fines, événements d'administration, alerte) relèvent du lot L7.

**Risques résiduels, non levés (limite acceptée par M. Jordan le 22/10/2026, contre-mesures en cours) :**
- la permission « gérer » les comptes inclut encore la **définition d'un mot de passe** (constat affiché par la vérification) ; un refus explicite de « reset-password » bloque toutes les opérations sur les comptes dans Keycloak 26.8.0 ;
- elle s'applique à **tous** les comptes du realm, y compris ceux de l'Autorité et de l'Administrateur ;
- l'attribution des rôles Autorité et Administrateur « sur autorisation de l'Autorité » n'a pas d'exécutant technique compatible avec cette réduction (Q-7).

## Rotation du secret

1. Régénérer le secret du client dans la console Keycloak (onglet Credentials) et reporter la nouvelle valeur dans `KC_SERVICE_PASSWORD` (`.env`).
2. Contrôler : `node --env-file=.env scripts/verifier-compte-service.mjs` (pas de code 4).
3. Redémarrer l'application.

## Rôle PostgreSQL `shiku_audit`

Automatique sur un volume neuf (`infra/postgres/01-roles.sh`) ; `bash scripts/octroyer-droits-audit.sh` sur un volume existant (`JOURNAL.md`). Ne supprimez aucun volume sans accord explicite.

## Limites connues

- Pas de SMTP : un compte créé par l'application doit définir son mot de passe à la première connexion, mais aucun courriel ne le lui permet ; le premier mot de passe est défini à la main dans la console Keycloak (« Credentials », mot de passe temporaire).
- Les comptes de test du realm sont fictifs (`reception.test`, `assistant1.test`, `assistant2.test`, `authority.test`, `admin.test`) ; leurs mots de passe sont les variables `KC_PASSWORD_*` de `.env` **au moment de la création du realm**. Si `.env` a changé depuis, la connexion échoue (« identifiant ou mot de passe refusé » dans `verifier-parcours.mjs`). Rattrapage local, limité à ces 5 comptes :

  ```bash
  node --env-file=.env scripts/aligner-comptes-test.mjs              # diagnostic, n'écrit rien
  node --env-file=.env scripts/aligner-comptes-test.mjs --appliquer  # aligne sur .env, lève le blocage, vérifie
  ```

  Le diagnostic teste une connexion par compte : en cas de refus, cela compte comme un échec pour la protection contre les tentatives répétées. Ne le lancez pas en boucle ; `--appliquer` lève de toute façon le blocage des comptes qu'il aligne. N'utilisez jamais ce script hors d'un environnement local.
- Le rôle `shiku_audit` existe mais l'application lit encore le journal via `shiku_app`.
