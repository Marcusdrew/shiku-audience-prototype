#!/bin/bash
# Exécuté UNE fois par l'image postgres, après 01-roles.sh : rôle et base de Keycloak, sans accès croisé.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE keycloak LOGIN PASSWORD '${DB_KEYCLOAK_PASSWORD}';
CREATE DATABASE keycloak OWNER keycloak;
-- PostgreSQL donne CONNECT à PUBLIC sur toute nouvelle base : on le retire, sinon le rôle applicatif
-- pourrait se connecter à la base de Keycloak (défaut trouvé par les tests de T0-33, groupe G).
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
GRANT CONNECT ON DATABASE keycloak TO keycloak;
SQL
