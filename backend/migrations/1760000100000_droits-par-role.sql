-- Up Migration
-- T0-33 : privilèges par table, au plus juste. Les rôles sont créés par infra/postgres/01-roles.sh.
-- L'application lit les organisations et gère les utilisateurs ; elle ne supprime jamais un utilisateur
-- (on le désactive). Elle ne crée pas d'organisation : c'est un acte du propriétaire du schéma (AUD-26).

REVOKE ALL ON organisation, utilisateur FROM PUBLIC;
GRANT SELECT ON organisation, utilisateur TO shiku_app;
GRANT INSERT, UPDATE ON utilisateur TO shiku_app;

-- Down Migration
REVOKE ALL ON organisation, utilisateur FROM shiku_app;
