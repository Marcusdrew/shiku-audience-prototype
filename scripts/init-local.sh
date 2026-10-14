#!/usr/bin/env bash
# Initialise les identifiants LOCAUX : copie .env.example vers .env et remplit
# chaque secret vide par une valeur aléatoire. .env est ignoré par Git.
# Usage : bash scripts/init-local.sh [--force]   (--force régénère tout et écrase .env)
# Sous Windows : Git Bash (installé avec Git) ou WSL.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  echo ".env existe déjà : rien n'est modifié (utilisez --force pour tout régénérer)."
  echo "Attention : --force génère de NOUVEAUX mots de passe ; supprimez aussi le volume de données :"
  echo "  docker compose down -v"
  exit 0
fi

# Mot de passe aléatoire alphanumérique (sûr dans une URL de connexion), 32 caractères.
gen() { head -c 256 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32; }

umask 077
: > .env
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *PASSWORD*=) printf '%s%s\n' "$line" "$(gen)" >> .env ;;
    *)           printf '%s\n' "$line" >> .env ;;
  esac
done < .env.example

# Garde-fou : .env ne doit jamais pouvoir être commité.
if git rev-parse --git-dir >/dev/null 2>&1 && ! git check-ignore -q .env; then
  rm -f .env
  echo "ERREUR : .env n'est pas ignoré par Git. Fichier supprimé. Corrigez .gitignore." >&2
  exit 1
fi

if grep -qE 'PASSWORD[A-Z0-9_]*=$' .env; then
  echo "ERREUR : un secret est resté vide dans .env." >&2
  exit 1
fi
echo ".env créé avec des secrets aléatoires (ignoré par Git)."
echo "Étape suivante : docker compose up --build"
