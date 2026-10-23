# Journal d'audit : ce qui est protégé, et ce qui ne l'est pas

Le journal (`journal`, migration `1760000200000`) est **protégé contre la modification et la suppression par l'application, y compris sous le compte d'un administrateur applicatif**, au niveau de PostgreSQL. Il n'est **pas** présenté comme inaltérable de façon absolue (ENF03-11, ADR-ARCH-007).

## Mécanismes

1. Le rôle applicatif `shiku_app` n'a que `SELECT` et `INSERT` (ni `UPDATE`, `DELETE` ni `TRUNCATE`). Un administrateur applicatif n'est qu'un compte de l'application : il n'a pas d'autre droit en base.
2. Un déclencheur `BEFORE UPDATE` et un déclencheur `BEFORE TRUNCATE` refusent toute modification, même si un rôle recevait le droit par erreur.
3. Un déclencheur `BEFORE INSERT` impose l'horodatage `clock_timestamp()` du serveur de base : l'application ne choisit pas la date (limite L5 de `PREUVES-AJOUT-SEUL.md` levée pour cette table).
4. Chaque entrée est écrite dans la **même transaction** que l'acte (tout ou rien) et attribuée à un compte nominatif. Seule exception, depuis L2 : les entrées de l'initialisation (`scripts/amorcer-donnees-test.mjs`), au nom du « système » (`auteur = 'systeme'`, sans compte) ; une contrainte impose une personne **ou** le système. Les refus d'actions sensibles sont écrits hors de la transaction annulée, avec `resultat = 'refuse'`.
5. Aucune route HTTP ne modifie ni ne supprime le journal ; `GET /journal` est en lecture seule.
6. Le contenu journalisé se limite à des identifiants, des codes, des nombres et des noms de champs modifiés (Q-5, 23/10/2026) : ni texte libre, ni nom du personnel, ni nom d'agenda, résolus à l'affichage ; une entrée ne peut pas être purgée avant 6 ans.

## Catégories et vue de l'Autorité (lot L2, `HYPOTHESE(DEC-38)`)

- Dix catégories, énumération fermée dans `backend/src/journal/categories.ts` ; chaque action en a exactement une. La catégorie se **déduit** de l'action (elle n'est pas une colonne : les entrées antérieures ne peuvent pas être complétées). Une action non classée est refusée à l'écriture, et `journal-categories.spec.ts` échoue.
- L'Autorité, seul rôle qui lit le journal, voit : consultation du dossier relationnel, droits et délégations, priorité, signalement et revue, plus toute entrée « sous délégation ». Elle ne voit ni « décisions et audiences » ni « comptes et accès ». `GET /journal/purges` lui donne le récapitulatif des purges de son organisation (date, volume, période, volume par catégorie), jamais le contenu purgé.
- Refus journalisés : rôle hors liste blanche, décision hors périmètre d'agenda, lecture du journal sans accès ; regroupés par personne et par action (fenêtre de 10 minutes, compteur `journal_refus_regroupe`). Les autres refus ne sont pas journalisés.

## Limites connues (non levées)

- Le propriétaire du schéma (`shiku_migrator`) et le superutilisateur PostgreSQL peuvent désactiver les déclencheurs, modifier ou supprimer des lignes (L1, L2). Ce sont des comptes d'exploitation, hors application.
- Le rôle `shiku_purge` peut supprimer des lignes sans borne d'ancienneté (L3) : la règle des 6 ans (module de conservation) n'est pas développée.
- Aucune chaîne de hachage ni copie externe : une altération faite en tant que propriétaire ne serait pas détectée.
- Aucune alerte en cas d'accès au journal (non développée).
- Seules les actions listées dans `API.md` écrivent au journal. Les consultations de données ne sont pas journalisées, ni les lectures du journal par l'Autorité (seules les lectures refusées le sont).
- Aucune personne ne voit dans l'application les entrées « décisions et audiences » ni « comptes et accès » : c'est la décision du 22/10. Elles restent en base ; l'accès temporaire de l'Administrateur (L3) et le rôle de lecture `shiku_audit` (Q-3) sont à venir.

## Rôle de lecture d'audit `shiku_audit` sur un volume déjà initialisé

Le rôle `shiku_audit` (lecture seule de `journal` et `journal_purge`) est créé par `infra/postgres/01-roles.sh`, que l'image PostgreSQL n'exécute **qu'à la création du volume**. La migration `1760000600000` lui accorde `SELECT` **seulement s'il existe déjà**. Un volume créé avant l'ajout de ce rôle n'a donc ni le rôle ni ses droits : `pnpm test:db` échoue alors avec `password authentication failed for user "shiku_audit"` (suite `conservation-identite.spec.ts`).

Rattrapage, sans supprimer le volume ni les données :

```bash
docker compose up -d db          # base démarrée
pnpm migrate:up                  # si les migrations ne sont pas à jour
bash scripts/octroyer-droits-audit.sh
```

- Prérequis : `POSTGRES_SUPERUSER`, `POSTGRES_DB` et `DB_AUDIT_PASSWORD` présents dans `.env`.
- Le script crée le rôle s'il manque, avec le mot de passe `DB_AUDIT_PASSWORD` de `.env`, puis accorde exactement ce que prévoient `01-roles.sh` et la migration : `CONNECT`, `USAGE` sur le schéma `public`, `SELECT` sur `journal` et `journal_purge`. Rien d'autre.
- Il est rejouable et **ne change jamais le mot de passe d'un rôle existant**. Si le rôle existe avec un autre mot de passe que celui de `.env`, c'est à vous de choisir lequel garder (`ALTER ROLE shiku_audit PASSWORD …` dans `psql`, ou modifier `.env`).
- Il refuse d'agir si les tables du journal sont absentes (migrations non appliquées).
- Aucun secret n'est affiché ni passé en argument de commande.
- Ne lancez pas `docker compose down -v` ni `bash scripts/init-local.sh --force` pour résoudre ce cas : le premier détruit les données, le second régénère tous les mots de passe alors que ceux des rôles existants sont inscrits dans le volume.

Contrôle sans secret : `docker compose exec -T db psql -U <POSTGRES_SUPERUSER> -d <POSTGRES_DB> -c "\dp journal"` ; `shiku_audit` n'y apparaît qu'avec `r` (lecture).

Qui détient ce mot de passe, et si ce rôle doit lire la table brute ou une vue, reste à décider (arbitrage du 19/10, point 1 ; question Q-3) : aujourd'hui personne ne l'utilise hors des tests (`SECRETS.md`).

## Preuves exécutées

`backend/test/db/api-metier.spec.ts` (groupe « journal d'audit ») : refus `UPDATE/DELETE/TRUNCATE` par la base pour `shiku_app` (code 42501), déclencheurs actifs même pour le superutilisateur sans les désactiver, horodatage serveur, atomicité acte + journal, absence de route d'écriture. Exécutés sur PostgreSQL 16 (voir `ETAT-FONCTIONNEL.md`).
