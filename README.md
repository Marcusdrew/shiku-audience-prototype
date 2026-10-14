# SHIKU Audience — prototype

> **Prototype, hors CGPA, non opposable.** Ce dépôt est un espace de travail pour construire l'application en suivant les guides de sprint. Il n'est pas gouverné par le cadre CGPA du dépôt `shiku-audience-platform`, et rien de ce qui est produit ici ne vaut preuve pour un Gate. Le code sera ramené dans le dépôt gouverné après la décision du 14 octobre 2026 (voir `CONTRIBUTING.md`, section « Réintégration »).

## Le produit

SHIKU Audience (PGAP) est une application interne qui porte le cycle de vie d'une audience : demande, décision, audience planifiée, audience réalisée, clôture. Cinq utilisateurs, environ vingt demandes par jour. Deux propriétés comptent plus que tout :

1. **Chaque décision doit pouvoir être justifiée plus tard.** Le journal des actions est en ajout seul : personne, administrateur compris, ne peut le modifier ni le supprimer.
2. **Chaque donnée relationnelle doit rester nécessaire à la finalité.**

## La technique

| Élément | État |
|---|---|
| Backend | **NestJS 12 (TypeScript)** dans ce prototype. Les documents de gouvernance parlent de Spring Boot (demandé le 2026-10-08, `DEC-27`, **non acté**) : **incohérence connue, à trancher par le représentant habilité**. Le prototype n'est pas réécrit en Spring Boot et rien ne dit que NestJS est validé |
| Base de données | PostgreSQL (`ADR-ARCH-002`) |
| Frontend | React 19 + Vite 8 + TypeScript dans `frontend/` ; choix `DEC-28` à confirmer formellement |
| Mobile | **Hors de ce dépôt pour l'instant** : après le MVP (`DEC-29`) |
| Versions de Java, Spring Boot, PostgreSQL | **À fixer** (`DEC-04`). Ne les inventez pas : écrivez `HYPOTHESE(DEC-04)` à côté de toute version provisoire |
| Hébergement | AWS est la cible, rien n'est arrêté (`DEC-07`) |

Les décisions `DEC-xx` sont décrites dans le dépôt gouverné, dossier `docs/cgpa/sprints/` (`DECISIONS-A-RENDRE.md` et `actes/`).

## Où trouver quoi

Dans le dépôt `shiku-audience-platform`, dossier `docs/cgpa/sprints/` :

| Fichier | Contenu |
|---|---|
| `SPRINTS-POUR-LE-DEVELOPPEUR.md` | À lire en premier |
| `guides/GUIDE-SPRINT-00.md` à `GUIDE-SPRINT-11.md` | Un guide par sprint : stories, tâches, recette |
| `DECISIONS-A-RENDRE.md` et `actes/` | Ce qui est décidé et ce qui reste ouvert |
| `AUDIT-BACKLOG-2026-10-08.md` | Défauts connus de la liste de fonctionnalités |
| `docs/cgpa/phase-05-product-backlog.md` | La liste des 67 stories |
| `docs/cgpa/phase-04-dossier-architecture.md` | Pourquoi l'application est construite ainsi |

## Démarrer

Démarrage local (Windows : Git Bash + Docker Desktop), détail dans `docs/dev/ENV-LOCAL.md` et `docs/dev/ETAT-FONCTIONNEL.md` :

```bash
bash scripts/init-local.sh                      # génère .env (secrets locaux, jamais commité)
docker compose up --build -d                    # PostgreSQL, Keycloak, migrations, backend
node --env-file=.env scripts/amorcer-donnees-test.mjs   # organisation fictive + 5 comptes rattachés + 2 agendas
pnpm install && pnpm --filter shiku-frontend dev        # http://localhost:5173
node --env-file=.env scripts/verifier-parcours.mjs      # parcours métier complet via Keycloak (API réelle)
```

Les tâches T0-02 (installation) et T0-03 (diagnostic) restent à faire. Documentation de l'API : `docs/dev/API.md`. État réel (fait, testé, restant) : `docs/dev/ETAT-FONCTIONNEL.md`.

Ordre de travail : `GUIDE-SPRINT-00.md`, puis `GUIDE-SPRINT-01.md`, et ainsi de suite. Un sprint ne démarre que lorsque le précédent est terminé.

## Ce qui est interdit ici

- Travailler sur `main` directement.
- Mettre un secret, un mot de passe ou une clé dans le dépôt.
- Utiliser une donnée réelle : **données fictives uniquement**.
- Démarrer l'application mobile.
- Ajouter une fonctionnalité qui n'est pas dans une story.
- Trancher une décision ouverte à la place du représentant habilité.

Les règles complètes sont dans `CONTRIBUTING.md`.
