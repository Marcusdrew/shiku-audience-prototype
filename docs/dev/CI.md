# Contrôles automatiques : hooks et CI

## Hooks Git (`.githooks/`)
- `pre-commit` : analyse des secrets sur les fichiers indexés (`scripts/controles-commit.mjs`).
- `commit-msg` : contrôle du format du message.
Activation : `bash scripts/bootstrap.sh`. Les hooks ont été démontrés dans un dépôt temporaire, pas sur Windows.

## Workflow GitHub Actions (`.github/workflows/ci.yml`)
Lint, typecheck, tests unitaires, tests base de données, build, scan de secrets.
**Jamais exécuté** : il a été écrit mais n'a tourné sur aucun serveur GitHub.

## Non prouvé à ce jour
- Branche `main` protégée (réglage GitHub à faire par le propriétaire du dépôt).
- Démonstration d'une pull request qui échoue.
- Temps de parcours du README par une personne tierce.
- Exécution sous Docker Desktop / Windows, PostgreSQL 18, Node 24.
