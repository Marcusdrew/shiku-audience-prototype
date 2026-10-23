# Modèle de données et migrations

Migrations versionnées dans `backend/migrations/` (node-pg-migrate, SQL). Elles s'exécutent avec le rôle `shiku_migrator` (propriétaire du schéma) ; l'application utilise `shiku_app`, aux droits minimaux.

| Migration                                | Contenu                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `1760000000000_organisation-utilisateur` | `organisation`, `utilisateur` (clé `keycloak_sub`, nominatif)      |
| `1760000100000_droits-par-role`          | privilèges de `shiku_app` sur ces deux tables                      |
| `1760000200000_journal`                  | `journal` en ajout seul (voir `JOURNAL.md`)                        |
| `1760000300000_visiteur-agenda`          | `visiteur`, `agenda`                                               |
| `1760000400000_demande`                  | `compteur_reference`, `demande` (contrainte contact OU dérogation) |
| `1760000500000_decision-audience`        | `decision` (insertion seule), `audience` (une par demande, H13)    |

Toute table métier porte `organisation_id NOT NULL` (EF03-01). Privilèges de `shiku_app` : `SELECT/INSERT/UPDATE` sur visiteur, agenda, demande, compteur_reference, audience ; `SELECT/INSERT` seulement sur `decision` et `journal`. **Aucun `DELETE`** pour l'application : la suppression relève de la conservation (module non développé) et du rôle `shiku_purge`, qui n'a de droits que sur `journal` (`SELECT, DELETE`).

Commande : `pnpm migrate:up` (ou le service `migrate` de `docker-compose.yml`). Ne jamais contourner les migrations.
Les migrations ont été exécutées sur **PostgreSQL 16** dans l'environnement de développement de cette livraison ; leur exécution sur PostgreSQL 18 (version du projet) n'a pas été faite par l'auteur.
