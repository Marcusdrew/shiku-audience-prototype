# Environnement local conteneurisé (T0-08, Keycloak, application)

## Objectif du document

Ce document décrit l'environnement local de SHIKU Audience : les services conteneurisés, les ports exposés, les volumes, le réseau et les commandes principales de démarrage et d'arrêt.

La configuration doit respecter l'exigence `ENV-001`. Mettez à jour les tableaux lorsqu'un service, un port, un volume ou un réseau est ajouté ou modifié.

## 1\. Architecture des services

|Service|Image utilisée|Port publié sur l'hôte|Fonction|
|-|-|-|-|
|`db`|`postgres:18`|`127.0.0.1:${POSTGRES\\\_PORT}` → `5432` dans le conteneur (par défaut : `5432`)|Héberge PostgreSQL. Lors de l'initialisation du volume, les scripts créent les rôles `shiku\\\_migrator`, `shiku\\\_app` et `shiku\\\_purge` (`01-roles.sh`), puis le rôle et la base `keycloak` (`02-keycloak.sh`).|
|`keycloak`|`quay.io/keycloak/keycloak:26.8.0`|`127.0.0.1:${KEYCLOAK\\\_PORT}` → `8080` dans le conteneur (par défaut : `8080`)|Fournit l'identité et les fonctions OAuth 2.0 / OIDC. Le realm `shiku` est importé depuis `infra/keycloak/realm-shiku.json`. Le service fonctionne actuellement en mode **développement** (`start-dev`).|
|`migrate`|`shiku-backend:local`, construite depuis `backend/Dockerfile`|Aucun port publié|Applique les migrations avec le rôle `shiku\\\_migrator`, puis s'arrête. Le code de sortie attendu est `0`.|
|`app`|`shiku-backend:local`|`127.0.0.1:${APP\\\_PORT}` → `3000` dans le conteneur (par défaut : `3000`)|Expose l'API NestJS avec le rôle de base de données `shiku\\\_app`. Le service démarre après la réussite des migrations.|

## 2\. Volumes, réseau et variables

|Élément|Configuration|À retenir|
|-|-|-|
|Volume PostgreSQL|`shiku\\\_pgdata` (volume Compose nommé `shiku\\\_shiku\\\_pgdata`)|Conserve les données PostgreSQL entre les arrêts et les redémarrages. Le chemin de montage est celui prévu par l'image PostgreSQL 18.|
|Réseau Compose|`shiku\\\_default`|Réseau créé par Docker Compose pour permettre aux services du projet de communiquer entre eux.|
|Exposition réseau|Ports publiés sur `127.0.0.1`|Les ports publiés sont accessibles depuis la machine locale, et non directement depuis les autres machines du réseau.|
|Variables d'environnement|`.env` et `.env.example`|`.env` contient la configuration locale et les secrets ; il ne doit jamais être versionné. `.env.example` sert de modèle. Voir `docs/dev/SECRETS.md`.|

## 3\. Démarrer et arrêter l'environnement

Exécutez les commandes depuis la racine du dépôt, dans Git Bash.

### Première initialisation

```bash
bash scripts/init-local.sh
```

**Objectif :** créer le fichier `.env` local s'il n'existe pas déjà.
**Important :** si `.env` existe, le script doit le préserver au lieu de remplacer les secrets déjà configurés.

### Construire et démarrer les services

```bash
docker compose up --build -d
```

**Objectif :** construire l'image nécessaire et démarrer les services en arrière-plan.

Vérifiez ensuite leur état :

```bash
docker compose ps -a
```

**Résultat attendu :**

* `db` doit finir par être `healthy` ;
* `keycloak` et `app` doivent être démarrés ;
* `migrate` doit se terminer avec le code `0`.

Le démarrage initial de Keycloak peut prendre un peu de temps.

### Arrêter les services en conservant les données

```bash
docker compose down
```

Cette commande arrête et supprime les conteneurs et le réseau du projet, mais conserve le volume de données PostgreSQL.

### Réinitialiser complètement l'environnement local

```bash
docker compose down -v
```

**Attention : cette commande supprime également les volumes du projet et les données qu'ils contiennent.** Utilisez-la uniquement si vous souhaitez réellement réinitialiser l'environnement local et si vous acceptez de perdre les données locales concernées.

### Amorcer les données de test (une fois, après le premier démarrage)

```bash
node --env-file=.env scripts/amorcer-donnees-test.mjs
```

Crée l'organisation fictive « Organisation de test (fictive) » (acte du propriétaire du schéma, avec `shiku_migrator`), rattache les 5 comptes de test à leur identité Keycloak (le `sub` est lu dans Keycloak) et crée deux agendas fictifs. Idempotent. Sans cela, aucun compte n'a de compte applicatif et toute route métier répond 403 `Aucun compte applicatif actif.`. Il faut que le realm contienne le scope `basic` (voir `ETAPE-1-AUTHENTIFICATION.md`).

Vérifier ensuite : `node --env-file=.env scripts/verifier-auth.mjs` (jetons) puis `node --env-file=.env scripts/verifier-parcours.mjs` (parcours métier complet ; laisse des données fictives « PARCOURS » en base, le journal étant en ajout seul).

## 4\. Comportements importants

* **Import du realm Keycloak :** avec la stratégie `IGNORE\\\_EXISTING`, le fichier `infra/keycloak/realm-shiku.json` est importé lors de la création initiale du realm. Modifier ce fichier ne met pas automatiquement à jour un realm déjà existant. Une réinitialisation du volume peut entraîner la perte des données locales ; ne la faites pas sans en comprendre les conséquences.
* **Comptes de test :** les mots de passe des cinq comptes de test ne sont pas stockés dans le fichier du realm. Ils proviennent des variables `${KC\\\_PASSWORD\\\_…}` configurées dans `.env`. Voir `docs/dev/SECRETS.md`.
* **Initialisation des rôles PostgreSQL :** les scripts d'initialisation de la base s'exécutent lors de la création initiale du volume. Modifier une variable de mot de passe dans `.env` ne modifie pas nécessairement un mot de passe déjà enregistré dans une base persistante.
* **Tests PKCE :** le flux OAuth 2.0 / OIDC avec PKCE a été testé à l'aide de `node --env-file=.env scripts/verifier-pkce.mjs`. Ce test utilise un client simulé et ne remplace pas un parcours complet dans le navigateur avec le frontend.
* **Version PostgreSQL :** PostgreSQL 18 est utilisé dans la configuration. Le statut de décision formelle reste associé à `HYPOTHESE(DEC-04)` tant que la décision correspondante n'a pas été confirmée dans le registre de décisions.

## 5\. État de validation et limites

> \\\*\\\*État au 12 octobre 2026 :\\\*\\\* la pile Docker locale a été construite, démarrée et vérifiée avec le script `scripts/verifier-pile.sh` : \\\*\\\*23 vérifications réussies, 0 échec\\\*\\\*.
>
> Les tests automatisés PKCE ont également réussi avec un client simulé, sans navigateur. Les tests de sécurité PostgreSQL ont réussi (\\\*\\\*39 tests\\\*\\\*), mais certaines limites relatives aux privilèges du propriétaire des tables, du superutilisateur, à la purge et à l'horodatage restent à examiner.
>
> Cette validation locale ne constitue pas une validation de production ni une validation complète des fonctionnalités métier.

### Éléments non couverts par la validation globale

* Le parcours complet d'authentification dans le navigateur avec le frontend.
* La validation fonctionnelle complète des modules métier.
* La configuration de Keycloak pour un environnement de production : la configuration actuelle utilise `start-dev`.
* La résolution complète des limites de sécurité du journal d'audit.

Pour les étapes détaillées et les résultats de chaque contrôle, consultez `docs/dev/VALIDATION-PILE.md`.
