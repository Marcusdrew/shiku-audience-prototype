#!/bin/bash
# Exécuté UNE fois par l'image postgres, à la création du volume de données.
# Crée les rôles séparés de l'application. Les droits sur les tables sont donnés par les migrations (T0-33).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
-- Migration : propriétaire du schéma, seul à pouvoir créer/modifier les tables.
CREATE ROLE shiku_migrator LOGIN PASSWORD '${DB_MIGRATOR_PASSWORD}';
-- Application : droits minimaux, accordés table par table par les migrations.
CREATE ROLE shiku_app      LOGIN PASSWORD '${DB_APP_PASSWORD}';
-- Purge : seul rôle autorisé à supprimer des lignes à l'échéance de conservation (D04-10).
CREATE ROLE shiku_purge    LOGIN PASSWORD '${DB_PURGE_PASSWORD}';

-- Le schéma public n'est plus ouvert à tous.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO shiku_migrator;
GRANT USAGE ON SCHEMA public TO shiku_app, shiku_purge;
REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO shiku_migrator, shiku_app, shiku_purge;
SQL
