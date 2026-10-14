# Structure du dépôt (T0-04)

Un seul dépôt, plusieurs dossiers. Aucun module métier n'est ajouté : un dossier de code par module du dossier d'architecture (dix modules : sept métier, trois transverses). Arborescence et nombre de dépôts : **à décider** (`DEC-27`, `DEC-28`) ; ceci est l'état proposé.

```
shiku-audience-prototype/
├── README.md, CONTRIBUTING.md        règles du dépôt (fournies)
├── .github/PULL_REQUEST_TEMPLATE.md  modèle de pull request (fourni)
├── docker-compose.yml                pile locale : PostgreSQL, Keycloak, migrations, API
├── .env.example                      modèle de configuration : AUCUN secret (valeurs vides)
├── .env                              votre copie locale, générée, JAMAIS versionnée
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .npmrc
│                                     espace de travail pnpm (backend, frontend), verrou unique
├── backend/                          API (NestJS, TypeScript)
│   ├── src/                          code ; un sous-dossier par module (voir ci-dessous)
│   ├── migrations/                   migrations SQL versionnées (node-pg-migrate)
│   ├── test/                         tests unitaires ; test/db/ : tests exigeant PostgreSQL
│   └── Dockerfile                    image multi-étapes, exécutée sans droits administrateur
├── frontend/                         React + Vite + TypeScript (frontend/README.md, docs/dev/FRONTEND.md)
├── infra/
│   ├── postgres/                     01-roles.sh (migrator, app, purge), 02-keycloak.sh (base Keycloak)
│   └── keycloak/realm-shiku.json     realm versionné, sans mot de passe
├── scripts/                          init-local.sh (secrets), verifier-pile.sh, verifier-pkce.mjs, verifier-auth.mjs,
│                                     amorcer-donnees-test.mjs, verifier-parcours.mjs, lib/pkce.mjs
└── docs/dev/                         PREREQUIS, FICHE-TECHNIQUE, STRUCTURE, SECRETS, ENV-LOCAL,
                                      PREUVES-AJOUT-SEUL, VALIDATION-PILE, ETAPE-1-AUTHENTIFICATION, API, MODELE-DONNEES,
                                      JOURNAL, ETAT-FONCTIONNEL
```

Les fichiers apparaissent au fil des pull requests (voir `PULL_REQUESTS.md`) : ce plan décrit la cible, pas le contenu d'une branche isolée.

## Modules du backend (`backend/src/`)

| Dossier | Nature | Stories principales |
|---|---|---|
| `habilitation/` | transverse | US-05-001 à 009, 064 à 066 |
| `journal/` | transverse | US-05-010 à 017 |
| `conservation/` | transverse | US-05-018 à 023 |
| `agendas/` | métier | US-05-024 à 027, 047 à 052 |
| `relationnel/` | métier | US-05-028 à 036 |
| `demandes/` | métier | US-05-037 à 042 |
| `decisions/` | métier | US-05-043 à 046 |
| `operations/` | métier | US-05-053 à 057 |
| `pilotage/` | métier | US-05-058 à 060 |
| `evenements/` | transverse au modèle | US-05-061 à 063 |

(`sante/` et `db/` : outillage technique du squelette, pas des modules métier. Les dossiers des modules ci-dessus sont créés avec leur première story, pas à l'avance.)

## Règle de dépendance
Les modules métier peuvent appeler les modules transverses, jamais l'inverse. **Aucun module métier n'en appelle un autre** : ils communiquent par le modèle de données et par les événements (`evenements/`). Un test d'architecture le vérifiera (Sprint 3, US-05-061).

## Où ira le code d'une story
Dans le dossier du module de son épic ; migrations dans `backend/migrations/` ; tests dans `backend/test/<module>/` (ceux qui exigent PostgreSQL dans `backend/test/db/`).
