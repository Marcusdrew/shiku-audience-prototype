# Preuves : « ajout seul » garanti par la base (T0-33)

**Statut de `US-05-011` : PARTIELLE.** Ce document prouve un mécanisme sur une **table d'essai**. Il ne prouve pas que `US-05-011` est satisfaite, et il ne doit pas être présenté comme tel. Le statut reste « partiel » tant que les limites L1 à L5 ci-dessous ne sont pas résolues ou formellement acceptées par le représentant habilité.

Exigence visée (`ENF03-11`, `ADR-ARCH-007`, contrainte C3) : aucun rôle, Administrateur compris, ne dispose d'un chemin de modification ou de suppression d'une entrée du journal, et cela doit être imposé par PostgreSQL, pas seulement par le code.

## Ce que la tâche T0-33 demande, et ce qui est fait

Critère du guide : « un test automatisé montre que le rôle applicatif ne peut ni modifier ni supprimer une ligne d'une **table d'essai** en ajout seul, ni escalader ses droits. »

| Critère | Résultat |
|---|---|
| Rôles séparés : propriétaire/migrations, application, purge | Fait : `shiku_migrator`, `shiku_app`, `shiku_purge` (`infra/postgres/01-roles.sh`) |
| Le rôle applicatif ne peut ni modifier ni supprimer une ligne d'une table d'essai | **Démontré** par les groupes A, C, D |
| … ni escalader ses droits | **Démontré** (groupe C : `SET ROLE`, `GRANT`, `ALTER ROLE`…) |
| Rôle de lecture d'audit | **Non fait** (cité dans le guide : « lecture d'audit ») |

La **vraie table de journal** (`journal_audit`) n'existe pas dans ce dépôt : elle relève de `US-05-010` (modèle d'entrée) et `US-05-011`, au Sprint 1. Le motif testé ici (`backend/test/db/modele-ajout-seul.sql`) est celui que ces stories reprendront.

## Où en est la story US-05-011 (ligne de recette par ligne de recette)

| Ligne de recette | État | Pourquoi |
|---|---|---|
| Le journal est en ajout seul | **Partiel** | Démontré sur une table d'essai pour tous les rôles de l'application. Pas de vrai journal. Contourné par le propriétaire du schéma et par un superutilisateur PostgreSQL (L1, L2) |
| Aucun chemin de modification ni de suppression n'est exposé, à aucun rôle | **Non vérifiable aujourd'hui** | Aucune API de journal n'existe (seule `/sante` est exposée) ; un test d'architecture parcourant les routes sera nécessaire (L5) |
| La seule disparition d'une entrée est sa purge à 6 ans par `Conservation`, elle-même journalisée | **Non satisfait** | Le module n'existe pas (Sprint 3) ; le rôle de purge peut supprimer n'importe quelle entrée (L3) |

Dépendance du guide : `US-05-011` suppose `US-05-010` (modèle et écriture du journal), pas encore faite.

## Ce qui est démontré par les 39 tests

| Question | Réponse | Preuve |
|---|---|---|
| Le **rôle applicatif** (`shiku_app`) peut-il modifier, supprimer ou vider la table d'essai ? | **Non, refusé par la base** | Groupes A, C |
| Un **administrateur applicatif** le peut-il ? | **Non** : il agit par la même connexion `shiku_app` | Groupe D |
| Le **rôle de purge** peut-il modifier ou ajouter ? | **Non** (lire et supprimer seulement) | Groupe F |
| Le **propriétaire du schéma** (`shiku_migrator`) peut-il contourner ? | **Oui** | H1, H2 : **limite** |
| Un **superutilisateur PostgreSQL** peut-il contourner ? | **Oui**, inhérent à PostgreSQL | H3 : **limite** |
| Le rôle de purge supprime-t-il seulement à l'échéance ? | **Non, rien ne l'impose** | H4 : **limite** |
| L'heure d'une entrée est-elle forcée par la base ? | **Non** | H5 : **limite** |

## Administrateur applicatif et superutilisateur PostgreSQL : deux choses différentes

| | Administrateur applicatif | Superutilisateur PostgreSQL |
|---|---|---|
| Où il existe | Dans l'application : un rôle métier (Keycloak + table `utilisateur`) | Dans le moteur de base de données |
| Qui c'est | Une personne nominative de l'équipe, qui gère comptes et réglages | Le compte technique qui installe et administre le serveur |
| Accès à la base | Par la connexion `shiku_app`, comme tout utilisateur | Directement, avec ses propres identifiants |
| Droits sur une table en ajout seul | Ceux de `shiku_app` : lire et ajouter | Tous : il contourne droits et déclencheurs |
| Où est le contrôle | `ENF03-11` s'applique pleinement | Hors de portée du code applicatif : contrôle d'accès à l'infrastructure |

Dire « Administrateur » dans une session ne donne aucun droit PostgreSQL : le groupe D positionne même `app.role = 'administrator'` dans la session, sans effet.

## Les rôles

| Rôle | Sur la table d'essai | Remarque |
|---|---|---|
| `shiku_app` | `SELECT`, `INSERT` | Ni `UPDATE`, ni `DELETE`, ni `TRUNCATE` ; pas propriétaire ; pas de `CREATE` dans le schéma |
| `shiku_purge` | `SELECT`, `DELETE` | Seul rôle qui supprime (D04-10) |
| `shiku_migrator` | tous (propriétaire) | Utilisé uniquement par le service `migrate` |
| `keycloak` | aucun | Sa propre base ; ne peut pas se connecter à celle de l'application |
| (PUBLIC) | aucun | `REVOKE ALL … FROM PUBLIC` |

Sur les tables de T0-38 : l'application lit `organisation` et `utilisateur`, ajoute et met à jour les utilisateurs, ne supprime jamais (migration `1760000100000_droits-par-role.sql`, groupe I).
Défense en profondeur : un déclencheur `BEFORE UPDATE` refuse toute modification, même du propriétaire (groupe E) ; il ne protège pas contre `ALTER TABLE … DISABLE TRIGGER` du propriétaire (H2).

## Lancer les preuves

Prérequis : pile démarrée (au moins `db`, avec ses migrations appliquées), `.env` généré, Node 24 et pnpm 12.10.1. Voir `docs/dev/VALIDATION-PILE.md`.

```bash
pnpm install
pnpm test:db
```

Les tests créent une organisation, des utilisateurs et une table d'essai **fictifs**, puis les retirent (par le rôle de purge pour les lignes, c'est son usage légitime). Ils repartent de zéro à chaque passage, même après une exécution interrompue. Les démonstrations destructrices du propriétaire et du superutilisateur se font dans une transaction **annulée** (`ROLLBACK`). Ne les lancez pas contre une base contenant de vraies données.
Si une variable d'environnement manque, les tests **échouent** avec un message : ils ne se désactivent jamais en silence.

## Résultats réels

Exécution du 2026-10-10 sur **PostgreSQL 18.4** (build tiers du paquet npm `@embedded-postgres/linux-x64`, **pas** l'image officielle `postgres:18`), base vierge créée par `01-roles.sh` et `02-keycloak.sh`, puis les 2 migrations (`node-pg-migrate` 9.0.0, build de production, rôle `shiku_migrator`), Node 24.21.0 :

```
Test Files  1 passed (1)
     Tests  39 passed (39)
```

Trois exécutions consécutives : 39/39 à chaque fois ; après chacune, 0 table d'essai, 0 fonction, 0 utilisateur, 0 organisation. **Non exécuté** sur l'image Docker officielle.

| Groupe | Tests | Établit |
|---|---|---|
| A. Privilèges | 8 | Privilèges exacts (lus dans le catalogue), rien pour PUBLIC, aucun rôle superutilisateur/`CREATEROLE`/`CREATEDB`/`BYPASSRLS`/réplication, aucune appartenance entre rôles, `shiku_app` non propriétaire |
| B. Ajout | 1 | `shiku_app` ajoute et relit |
| C. Refus | 17 | `UPDATE`, `DELETE`, `TRUNCATE`, `ON CONFLICT DO UPDATE`, `MERGE … DELETE`, `SELECT … FOR UPDATE`, `DISABLE TRIGGER`, `DROP TRIGGER`, `DROP TABLE`, remplacement de la fonction, `CREATE TABLE`, `SET ROLE`, `SET SESSION AUTHORIZATION`, `session_replication_role`, `ALTER/CREATE ROLE`, `ALTER SYSTEM`, `GRANT` sans effet : tous refusés (SQLSTATE `42501`), ligne intacte |
| D. Administrateur applicatif | 1 | Même refus que tout utilisateur de l'application |
| E. Déclencheur | 1 | `UPDATE` refusé même au propriétaire |
| F. Purge | 1 | Lit ; ne peut ni ajouter, ni modifier, ni vider |
| G. Isolation des bases | 2 | Keycloak ↔ application : aucune connexion croisée |
| H. Limites connues | 5 | Ces tests **réussissent en montrant que la limite existe** |
| I. Tables de T0-38 | 3 | Droits de l'application sur `organisation` et `utilisateur` |

**Ces 39 tests sont un résultat important, pas une preuve que `US-05-011` est satisfaite.**

### Un défaut trouvé par ces tests, et corrigé

Au premier passage, le groupe G a échoué : `shiku_app` pouvait se connecter à la base `keycloak`. PostgreSQL accorde `CONNECT` à PUBLIC sur toute nouvelle base. Correction dans `infra/postgres/02-keycloak.sh` (`REVOKE ALL ON DATABASE keycloak FROM PUBLIC`).

## Limites : à résoudre ou à faire accepter formellement (rien de ce qui suit n'est une garantie)

**L1. Le propriétaire (`shiku_migrator`) peut vider ou modifier la table** (`TRUNCATE`, `DELETE`, désactivation du déclencheur). Propositions, cumulables :
- le mot de passe de migration n'existe qu'au déploiement (CI/CD), jamais à l'exécution de l'application (déjà le cas pour le service `migrate` séparé) ;
- journaliser les ordres `DDL` (`pgaudit` ou journal du serveur) et les envoyer hors de la base ;
- **chaîne d'empreintes** : chaque entrée stocke l'empreinte de la précédente ; une vérification périodique détecte toute suppression ou modification (contrôle de **détection**, pas de prévention).

**L2. Un superutilisateur PostgreSQL contourne tout.** Aucune configuration n'y change rien. La réponse est organisationnelle et d'infrastructure : qui détient ce compte, comment il est tracé, hébergement (`DEC-07`). Même chaîne d'empreintes, avec un ancrage régulier de l'empreinte finale hors de la base.

**L3. Le rôle de purge supprime n'importe quelle entrée, même récente.** Proposition : retirer `DELETE` directe à `shiku_purge` et lui donner l'exécution d'une fonction `purger_journal(limite)` qui refuse toute limite postérieure à « maintenant − 6 ans » et écrit sa propre trace. Durée et point de départ des 6 ans à confirmer (condition de DoD n° 4, `AUD-13`). À faire avec `Conservation` (Sprint 3).

**L4. L'application peut écrire un horodatage arbitraire.** `US-05-010` prévoit l'heure du serveur de base. Proposition : un déclencheur `BEFORE INSERT` imposant `horodatage := now()`. À décider avant `US-05-010`.

**L5. Deux lignes de recette ne sont pas testables aujourd'hui** (voir le tableau « Où en est la story ») : absence de chemin exposé (aucune API de journal) et purge à 6 ans (module `Conservation`).

**Décision attendue du représentant habilité** : résoudre ces limites, ou les **accepter formellement** (par un acte), avant de présenter `US-05-011` comme satisfaite.

## Formulation à faire valider dans le `README.md`

Le README fourni dit : « personne, administrateur compris, ne peut le modifier ni le supprimer ». Au vu de L1 et L2, c'est vrai pour **tous les rôles de l'application, administrateur applicatif compris**, pas pour le propriétaire du schéma ni pour un superutilisateur PostgreSQL. Ce fichier fourni n'a pas été modifié : la formulation relève du représentant habilité.

> **Suite (14 octobre 2026) :** le motif de cette table d'essai est appliqué à la vraie table `journal` (migration `1760000200000`) avec un déclencheur d'horodatage serveur en plus. Voir `docs/dev/JOURNAL.md`.
