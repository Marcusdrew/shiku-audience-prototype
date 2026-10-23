#!/usr/bin/env bash
# Prépare le poste en UNE commande, rejouable sans effet de bord (T0-02).
# Ne PAS confondre : il VÉRIFIE les prérequis système (Node, pnpm, Git, Docker) et dit quoi installer
# s'il en manque ; il n'installe pas de logiciel système (droits administrateur requis, hors périmètre).
# Usage : bash scripts/bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/4 Prérequis du poste"
node scripts/doctor.mjs || { echo "Corrigez les KO ci-dessus puis relancez : bash scripts/bootstrap.sh" >&2; exit 1; }

echo "2/4 Dépendances (verrou respecté)"
pnpm install --frozen-lockfile

echo "3/4 Secrets locaux (.env jamais écrasé s'il existe)"
bash scripts/init-local.sh

echo "4/4 Hooks Git (format, secrets, gros fichiers, message de commit)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  echo "Hooks installés (core.hooksPath = .githooks)."
else
  echo "Pas un dépôt Git : hooks non installés."
fi
echo "Poste prêt. Étape suivante : docker compose up --build"
