# Gestion des secrets en local (T0-10)

Règle du `CONTRIBUTING.md` § 4.7 : **aucun secret dans le dépôt, ses réglages ou ses journaux.** Un secret commité est à considérer comme compromis et à renouveler.

> Les sections sur Docker Compose et Keycloak décrivent la cible : elles ne s'appliquent qu'une fois les pull requests `T0-08` et `DEC-16` (realm Keycloak) fusionnées.
> `T0-10` dépend de `T0-07` (hooks de pré-commit), qui n'est pas faite.

## Le principe

| Fichier | Versionné ? | Contenu |
|---|---|---|
| `.env.example` | oui | Le **modèle** : les noms de variables, les réglages non secrets (ports, noms), et les secrets **vides** |
| `.env` | **non** (ignoré par Git) | Votre copie locale, avec des secrets générés au hasard sur votre poste |
| `infra/keycloak/realm-shiku.json` | oui | La configuration du realm, **sans aucun mot de passe** : les mots de passe des comptes de test sont des variables `${KC_PASSWORD_…}` |

Chaque développeur a donc des mots de passe **différents**, qui ne quittent jamais son poste.

## Première utilisation

```bash
bash scripts/init-local.sh
```

Sous Windows : dans **Git Bash** (installé avec Git) ou dans WSL. Le script :

1. copie `.env.example` vers `.env` ;
2. remplit chaque variable `*PASSWORD*` vide par 32 caractères aléatoires ;
3. donne à `.env` des droits restreints à votre utilisateur (sans effet visible sous Windows) ;
4. **refuse de continuer et supprime `.env`** si Git ne l'ignore pas (garde-fou contre un `.gitignore` cassé) ;
5. vérifie qu'aucun secret n'est resté vide.

Relancé, il ne touche à rien (« `.env` existe déjà »). Docker Compose lit ensuite `.env` tout seul : `docker compose up --build`.
Si `.env` manque, Compose s'arrête avec un message clair : `DB_APP_PASSWORD manquant, lancez bash scripts/init-local.sh`.

## Où chaque secret sert

| Variable | Utilisé par |
|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | Le superutilisateur PostgreSQL du conteneur (administration locale seulement) |
| `DB_MIGRATOR_PASSWORD` | Le rôle `shiku_migrator` (propriétaire du schéma) : uniquement le service `migrate` |
| `DB_APP_PASSWORD` | Le rôle `shiku_app` : uniquement le service `app` |
| `DB_PURGE_PASSWORD` | Le rôle `shiku_purge` : personne pour l'instant (le module de conservation viendra au Sprint 3) |
| `DB_AUDIT_PASSWORD` | Le rôle `shiku_audit` (lecture seule du journal) : personne pour l'instant |
| `DB_KEYCLOAK_PASSWORD` | Le rôle `keycloak` et sa base |
| `KEYCLOAK_ADMIN_PASSWORD` | Le compte administrateur de la console Keycloak |
| `KC_PASSWORD_RECEPTION`, `_ASSISTANT1`, `_ASSISTANT2`, `_AUTHORITY`, `_ADMIN` | Les 5 comptes de test fictifs du realm |

Le conteneur `app` ne reçoit que son propre mot de passe (voir `docker-compose.yml` ; `scripts/verifier-pile.sh` le contrôle, mais n’a pas encore été exécuté sur Docker).

## Comment le realm reste versionné sans secret

Le fichier de realm contient, pour chaque compte de test, `"value": "${KC_PASSWORD_RECEPTION}"` et ses équivalents. Au démarrage, `docker-compose.yml` passe ces variables au conteneur Keycloak, et Keycloak remplace les `${…}` à l'import.
**Vérifié** sur Keycloak 26.8.0 (hors Docker, 2026-10-10) : les 5 comptes se connectent avec les mots de passe de `.env` et obtiennent leur rôle.

Pour connaître le mot de passe d'un compte de test : ouvrez votre `.env` (par exemple `KC_PASSWORD_RECEPTION` pour `reception.test`).

## Changer ou renouveler les secrets

```bash
docker compose down -v          # supprime les données locales (les anciens mots de passe y sont inscrits)
bash scripts/init-local.sh --force
docker compose up --build
```

Un mot de passe de rôle PostgreSQL est inscrit dans le volume à sa création : changer `.env` sans supprimer le volume **ne change pas** le mot de passe réel et l'application n'arrivera plus à se connecter.

Le realm n'est importé qu'à la **première** création (stratégie `IGNORE_EXISTING`, vue dans le journal de Keycloak). Modifier `realm-shiku.json` ensuite n'a d'effet qu'après `docker compose down -v`.

## Contrôles à connaître

```bash
git check-ignore -v .env              # doit afficher la règle de .gitignore qui l'ignore
git ls-files | grep -E '(^|/)\.env'   # ne doit afficher que .env.example
git status --short                    # .env ne doit jamais apparaître
```

## Pièges

- **Ne ré-exportez jamais le realm depuis la console Keycloak pour l'écraser dans le dépôt** sans nettoyer : un export peut contenir des secrets de clients ou des empreintes de mots de passe. Éditez le fichier à la main ou nettoyez l'export avant commit.
- Ne collez jamais le contenu de `.env` dans une pull request, un ticket ou un journal.
- Les secrets de **Staging et Production** ne sont pas traités ici : ils relèvent de `DEC-10` (coffre de secrets, rotation).

## Ce qui n'est pas encore fait (T0-10 n'est donc pas terminée)

- Le critère « l'application refuse de démarrer sans ses variables, avec un message clair » est rempli par **Docker Compose** (variables obligatoires) mais pas par le **backend** lui-même, qui ne contrôle pas `DATABASE_URL` à son démarrage.
- Le crochet de pré-commit qui bloque un faux secret (`T0-07`) et la détection de secrets dans la CI (`T0-15`) n'existent pas encore.
- L'analyse de l'historique Git à la recherche de secrets n'a pas été faite avec un outil dédié : seule une recherche de motifs sur les fichiers a été exécutée (aucun résultat).
