#!/usr/bin/env bash
# Rattrapage d'un volume PostgreSQL DÉJÀ initialisé : crée le rôle de lecture d'audit « shiku_audit »
# s'il manque, puis lui accorde exactement les droits prévus par l'architecture :
#   - infra/postgres/01-roles.sh (volume neuf) : LOGIN, CONNECT sur la base, USAGE sur le schéma public ;
#   - migration 1760000600000 : SELECT sur journal et journal_purge (accordé seulement si le rôle existait).
# Un volume créé avant l'ajout de ce rôle n'a jamais exécuté 01-roles.sh à nouveau (l'image postgres ne
# lance les scripts d'initialisation qu'à la création du volume) : ce script comble cet écart.
#
# Garanties : rejouable ; ne change JAMAIS le mot de passe d'un rôle existant ; n'accorde aucun autre
# droit ; ne supprime rien et ne touche à aucun volume ; aucune valeur secrète n'est affichée ni passée
# en argument de commande (le mot de passe voyage par l'entrée standard, encodé en hexadécimal).
#
# Prérequis : base démarrée (docker compose up -d db) et migrations appliquées ; .env contient
# POSTGRES_SUPERUSER, POSTGRES_DB et DB_AUDIT_PASSWORD.
# Usage (Git Bash sous Windows, ou bash) : bash scripts/octroyer-droits-audit.sh
# Essais seulement : SHIKU_PSQL="psql -h … -p … -U … -d …" remplace « docker compose exec ».
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ERREUR : .env introuvable à la racine du dépôt." >&2; exit 1; }

# Lecture de .env SANS l'exécuter (pas de « source ») et sans rien afficher ; fins de ligne CRLF tolérées.
lire() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r' || true; }
superutilisateur=$(lire POSTGRES_SUPERUSER)
base=$(lire POSTGRES_DB)
mdp=$(lire DB_AUDIT_PASSWORD)
[ -n "$superutilisateur" ] && [ -n "$base" ] ||
  { echo "ERREUR : POSTGRES_SUPERUSER ou POSTGRES_DB absent de .env." >&2; exit 1; }
[ -n "$mdp" ] || { echo "ERREUR : DB_AUDIT_PASSWORD absent ou vide dans .env." >&2; exit 1; }

# Encodage hexadécimal : le mot de passe peut contenir n'importe quel caractère sans risque d'injection.
mdp_hex=$(printf '%s' "$mdp" | od -An -v -tx1 | tr -d ' \n')

if [ -n "${SHIKU_PSQL:-}" ]; then
  # shellcheck disable=SC2206
  commande=($SHIKU_PSQL)
else
  commande=(docker compose exec -T db psql -U "$superutilisateur" -d "$base")
fi

"${commande[@]}" -v ON_ERROR_STOP=1 -q <<SQL
\set mdp_hex '$mdp_hex'
SELECT to_regclass('public.journal') IS NOT NULL AND to_regclass('public.journal_purge') IS NOT NULL
       AS migrations_ok \gset
\if :migrations_ok
\else
  DO \$\$ BEGIN RAISE EXCEPTION 'tables journal et journal_purge absentes : appliquez d''abord les migrations (pnpm migrate:up)'; END \$\$;
\endif
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiku_audit') AS absent \gset
\if :absent
  SELECT format('CREATE ROLE shiku_audit LOGIN PASSWORD %L',
                convert_from(decode(:'mdp_hex', 'hex'), 'UTF8')) \gexec
  \echo Rôle shiku_audit créé avec le mot de passe DB_AUDIT_PASSWORD de .env.
\else
  \echo Rôle shiku_audit déjà présent : mot de passe inchangé.
\endif
SELECT format('GRANT CONNECT ON DATABASE %I TO shiku_audit', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO shiku_audit;
GRANT SELECT ON journal, journal_purge TO shiku_audit;
\echo Droits accordés : CONNECT, USAGE sur public, SELECT sur journal et journal_purge (rien d autre).
SQL
