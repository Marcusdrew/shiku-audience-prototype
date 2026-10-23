#!/usr/bin/env bash
# Vérifie la pile Docker COMPLÈTE (application + PostgreSQL + Keycloak) de bout en bout.
# À lancer depuis Git Bash (Windows, Docker Desktop démarré) ou WSL :  bash scripts/verifier-pile.sh
# Prérequis sur le poste : Docker Desktop, Node 24 et pnpm 12.10.1 (pour les tests de base et PKCE).
# Ce script a été écrit sans pouvoir être exécuté sur Docker par son auteur : son premier passage
# réel est celui de la personne qui le lance. Corrigez-le si une étape est fausse.
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || bash scripts/init-local.sh || exit 1
set -a; . ./.env; set +a

OK=0; KO=0
ok()  { echo "  OK    $1"; OK=$((OK+1)); }
ko()  { echo "  ECHEC $1"; KO=$((KO+1)); }
etape() { echo; echo "== $1"; }
attendre() { # attendre <secondes> <commande...> : réessaie jusqu'au succès ou au délai
  local t=$1; shift; local i=0
  until "$@" >/dev/null 2>&1; do i=$((i+2)); [ $i -ge "$t" ] && return 1; sleep 2; done
}
psql_as() { # psql_as <rôle> <mot de passe> <sql>
  # -h db (et non localhost) : l'image officielle accepte sans mot de passe les connexions depuis
  # 127.0.0.1 ; via le nom « db » le mot de passe est réellement vérifié (hypothèse non testée sur Docker).
  docker compose exec -T -e PGPASSWORD="$2" db psql -h db -U "$1" -d "$POSTGRES_DB" -Atq -c "$3"
}

etape "1. Configuration et construction des images"
docker compose config -q && ok "docker-compose.yml valide, variables résolues" || ko "docker compose config"
docker compose build && ok "images construites (app et migrate)" || { ko "construction des images"; echo "Arrêt : rien d'autre ne peut être vérifié."; exit 1; }

etape "2. Démarrage"
docker compose up -d && ok "conteneurs démarrés" || { ko "docker compose up"; exit 1; }

etape "3. PostgreSQL"
attendre 90 docker compose exec -T db pg_isready -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" \
  && ok "PostgreSQL répond" || ko "PostgreSQL ne répond pas"
V=$(docker compose exec -T db postgres --version 2>/dev/null | tr -d '\r'); echo "        version : $V"
echo "$V" | grep -q "PostgreSQL) 18" && ok "version majeure 18" || ko "la version majeure n'est pas 18"

etape "4. Migrations"
CID=$(docker compose ps -a -q migrate)
attendre 90 test "$(docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null)" = "exited"
[ "$(docker inspect -f '{{.State.ExitCode}}' "$CID" 2>/dev/null)" = "0" ] \
  && ok "le service migrate s'est terminé avec le code 0" || ko "le service migrate a échoué (docker compose logs migrate)"
N=$(psql_as shiku_migrator "$DB_MIGRATOR_PASSWORD" "SELECT count(*) FROM pgmigrations" 2>/dev/null)
ATTENDU=$(ls backend/migrations/*.sql | wc -l | tr -d ' ')
[ "$N" = "$ATTENDU" ] && ok "$ATTENDU migration(s) enregistrée(s), autant que de fichiers dans backend/migrations" || ko "migrations enregistrées : '$N' (attendu $ATTENDU)"

etape "5. Backend NestJS"
attendre 60 curl -fsS "http://localhost:${APP_PORT}/sante" \
  && ok "GET /sante répond 200 : $(curl -s "http://localhost:${APP_PORT}/sante")" || ko "GET /sante ne répond pas 200"
docker compose exec -T app printenv DATABASE_URL | grep -q "shiku_app:" \
  && ok "le backend se connecte avec le rôle shiku_app" || ko "le backend n'utilise pas shiku_app"
docker compose exec -T app printenv | grep -qE "POSTGRES_SUPERUSER_PASSWORD|DB_MIGRATOR_PASSWORD|DB_PURGE_PASSWORD" \
  && ko "le conteneur app voit un secret qui ne le concerne pas" || ok "le conteneur app ne voit ni mot de passe superutilisateur, ni migration, ni purge"
[ "$(docker compose exec -T app id -u | tr -d '\r')" != "0" ] \
  && ok "le backend ne tourne pas en administrateur (root)" || ko "le backend tourne en root"

etape "6. Keycloak (import du realm)"
attendre 180 curl -fsS "http://localhost:${KEYCLOAK_PORT}/realms/shiku/.well-known/openid-configuration" \
  && ok "le realm « shiku » est servi" || ko "le realm « shiku » n'est pas disponible (docker compose logs keycloak)"
if docker compose logs keycloak 2>/dev/null | grep -Eq "Realm 'shiku' imported|Realm 'shiku' already exists\. Import skipped"; then
  ok "journal Keycloak : import effectué ou realm déjà présent"
else
  ko "aucune trace d'import ni de présence préalable du realm dans les journaux"
fi
docker compose logs keycloak 2>/dev/null | grep -q 'KC_PASSWORD_\|\${KC_PASSWORD' \
  && ko "un placeholder de mot de passe est apparu dans les journaux" || ok "aucun placeholder de mot de passe dans les journaux"

etape "7. Flux OAuth 2.0 / OIDC avec PKCE (client simulé, sans navigateur)"
node --env-file=.env scripts/verifier-pkce.mjs && ok "flux code + PKCE démontré" || ko "flux PKCE en échec"

etape "8. Preuves de sécurité de la base (sur PostgreSQL du conteneur)"
if node -e "process.exit(require('./backend/package.json').scripts['test:db']?0:1)"; then
  (cd backend && pnpm test:db) && ok "tests de sécurité de la base (pnpm test:db)" || ko "tests de sécurité de la base (pnpm test:db)"
else
  echo "  (passé : le script test:db n'existe pas dans cette branche ; il arrive avec T0-33)"
fi

etape "9. Persistance et redémarrage (SANS supprimer le volume)"
ORG=$(psql_as shiku_migrator "$DB_MIGRATOR_PASSWORD" "INSERT INTO organisation (nom) VALUES ('Org fictive verif-pile') RETURNING id" | head -1)
[ -n "$ORG" ] && ok "organisation fictive écrite ($ORG)" || ko "écriture de l'organisation fictive"
docker compose down && docker compose up -d && ok "arrêt (sans -v) puis redémarrage" || ko "redémarrage"
attendre 90 docker compose exec -T db pg_isready -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" || ko "PostgreSQL ne revient pas"
C=$(psql_as shiku_migrator "$DB_MIGRATOR_PASSWORD" "SELECT count(*) FROM organisation WHERE id='$ORG'" 2>/dev/null)
[ "$C" = "1" ] && ok "la donnée a survécu au redémarrage (volume conservé)" || ko "la donnée a disparu ('$C')"
CID=$(docker compose ps -a -q migrate); attendre 90 test "$(docker inspect -f '{{.State.Status}}' "$CID")" = "exited"
docker compose logs migrate 2>/dev/null | tail -5 | grep -qi "No migrations to run" \
  && ok "les migrations rejouées ne changent rien" || ko "le rejeu des migrations n'est pas neutre"
attendre 120 curl -fsS "http://localhost:${KEYCLOAK_PORT}/realms/shiku/.well-known/openid-configuration" \
  && ok "Keycloak revient avec son realm" || ko "Keycloak ne revient pas"
attendre 60 curl -fsS "http://localhost:${APP_PORT}/sante" && ok "/sante répond à nouveau" || ko "/sante ne répond plus"
node --env-file=.env scripts/verifier-pkce.mjs >/dev/null && ok "les comptes Keycloak ont survécu (PKCE rejoué)" || ko "PKCE en échec après redémarrage"
# Nettoyage de la donnée fictive.
psql_as shiku_migrator "$DB_MIGRATOR_PASSWORD" "DELETE FROM organisation WHERE id='$ORG'" >/dev/null

echo; echo "Bilan : $OK vérifications réussies, $KO en échec."
[ "$KO" -eq 0 ] && echo "PILE VALIDÉE de bout en bout (hors navigateur et frontend)." || echo "PILE NON VALIDÉE : corrigez les ECHEC ci-dessus."
exit $((KO>0))
