# Fiche technique : SHIKU Audience (prototype)

**Date :** 2026-10-09 · **Statut :** proposition du développeur, à valider · **Cadre :** toutes les versions sont `HYPOTHESE(DEC-04)` tant que le représentant habilité ne les a pas fixées (Plan d'Exécution de Gate 07).

## Synthèse

| # | Élément | Choix retenu | Statut de support |
|---|---|---|---|
| 1 | Backend | TypeScript **6.0.3** · NestJS **12.1.2** · exécuté sur Node.js **24 LTS** (24.21.0) | Node 24 : LTS, maintenance dès le 2026-10-20, fin de vie 2028-04-30 |
| 2 | Frontend web | React **19.3.0** · Vite **8.3.4** · TypeScript **6.0.3** | **Développement non commencé** (DEC-28). Versions repérées, non installées, non testées |
| 3 | Gestionnaire de paquets | **pnpm 12.10.1** | Version majeure 12 supportée, sans date de fin annoncée |
| 4 | Migrations | **node-pg-migrate 9.0.0**, migrations en SQL pur | Pas de LTS |
| 5 | Tests et formatage | **Vitest 5.0.3** · **Prettier 3.9.9** · **ESLint 10.12.0** + typescript-eslint 8.71.1 | Pas de LTS |
| 6 | Base de données | **PostgreSQL 18** (dernière mineure : 18.6) | Supportée jusqu'au 2030-11-14 |
| 7 | Identité | **Keycloak 26.8.0** (OAuth 2.0, OpenID Connect, code d'autorisation + PKCE) | **Pas de LTS officielle** |
| 8 | Accompagnement | Voir section dédiée | n/a |

## Compatibilité vérifiée (déclarée par les paquets eux-mêmes)

| Contrôle | Résultat |
|---|---|
| Node 24 accepté par pnpm 12, NestJS 12 (≥ 20), Vite 8 (≥ 22.12), Vitest 5 (22.12, 24 ou ≥ 26), ESLint 10 (≥ 24), node-pg-migrate 9 (≥ 20.11) | Oui |
| TypeScript 6.0.3 accepté par typescript-eslint 8.71.1 (plage `>=4.8.4 <6.1.0`) | Oui |
| TypeScript 7.0.2 (dernière version npm) accepté par typescript-eslint 8.71.1 | **Non** : c'est pourquoi TypeScript est limité à 6.0.3 |
| `@vitejs/plugin-react` 6.1.2 avec Vite 8 | Oui (pair `vite ^8`) |
| node-pg-migrate 9.0.0 avec `pg` 8.23.1 | Oui (pair `pg <9`) |
| Keycloak 26.8.0 avec PostgreSQL 18 | Annoncé compatible (PostgreSQL 14 à 18) par un article tiers ; **non confirmé** dans la documentation officielle de Keycloak |
| PostgreSQL 18 avec les migrations et les rôles du dépôt | Testé sur PostgreSQL **16** seulement, pas sur la 18 |

## Détail par composant

**1. Backend.** TypeScript 6.0.3, NestJS 12.1.2 (dépend de `reflect-metadata` 0.2.2 et `rxjs` 7.8.2), `pg` 8.23.1. Le squelette (route de santé, 3 tests, lint, formatage) a été construit et exécuté. NestJS n'a pas de ligne LTS ; sa politique de support n'a pas été vérifiée. TypeScript non plus (sa page de support n'a pas pu être consultée).

**2. Frontend web.** React 19.3.0 et Vite 8.3.4 existent au registre npm à la date de la fiche, avec les prérequis Node ci-dessus. **Aucun code frontend n'existe** : le dossier `frontend/` est vide, en attente de la décision DEC-28 (CONTRIBUTING § 6). Vite n'a pas de LTS ; sa politique officielle prévoit des correctifs réguliers pour la mineure courante (8.3) et des correctifs de sécurité pour les mineures précédentes.

**3. pnpm 12.10.1.** Binaire natif : Node n'est nécessaire que pour l'installer via npm. Les versions 10 et 11 restent supportées jusqu'au 2027-04-30 ; la 12 n'a pas de date de fin annoncée. Limite : la politique de support n'est connue que par un site tiers (endoflife.date), la source officielle n'a pas été consultée. Le dépôt utilise encore npm ; la bascule est à faire.

**4. node-pg-migrate 9.0.0.** Migrations SQL pures, ce qui permet d'écrire directement rôles et `GRANT`. Projet communautaire sans LTS. Exécuté avec succès sur PostgreSQL 16.

**5. Tests et formatage.** Vitest 5.0.3, Prettier 3.9.9, ESLint 10.12.0, typescript-eslint 8.71.1. Aucun n'a de LTS. Les tests, le lint et le formatage passent sur le squelette.

**6. PostgreSQL 18.** Source officielle : dernière mineure 18.6, fin de support le 2030-11-14. PostgreSQL 14 s'arrête le 2026-11-12. PostgreSQL 19 est en bêta : écartée.

**7. Keycloak 26.8.0** (publiée le 2026-10-01, version affichée sur la page de téléchargement officielle). **Aucune LTS officielle** : la politique de support n'est pas écrite sur les pages consultées, et la mention « seule la dernière version est corrigée » vient d'un tiers. Conséquence : version épinglée et mise à jour planifiée à chaque nouvelle mineure. Limites : version récente (8 jours) ; l'existence de l'image Docker `26.8.0` n'a pas été vérifiée ; le dépôt épingle encore 26.7.0 ; l'import du realm et le flux PKCE n'ont jamais été exécutés. Repli : la dernière version 26.7.x.

## Ce qui n'a pas été vérifié

- Démarrage de la pile complète dans Docker (aucun démon Docker disponible lors de la rédaction).
- Existence des images `postgres:18`, `node:24-slim` et `keycloak:26.8.0`.
- Politiques de support officielles de NestJS, TypeScript, ESLint, Vitest, Prettier et pnpm.
- Numéro de patch de Node 24 (24.21.0) : donné par un site tiers, pas par nodejs.org.

## Node.js 26

Node 26 passe LTS en octobre 2026 (annonce officielle) et serait supportée jusqu'en 2029 ; les outils ci-dessus l'acceptent. Elle n'est pas retenue aujourd'hui parce qu'elle n'est pas encore LTS. À reconsidérer après sa promotion.

## 8. Compétences à renforcer (à ajuster par le développeur)

- Keycloak : realm exporté, clients, rôles, flux PKCE, validation des jetons côté serveur.
- PostgreSQL avancé : rôles séparés, droits par table, journal en ajout seul, tests de preuve.
- NestJS : garde de droits côté serveur, modules sans dépendance directe entre modules métier.
- Tâches planifiées fiables en instance unique (liste mensuelle, purges à l'échéance).
- Contrat d'API OpenAPI vérifié en CI.
- Docker Compose et chaîne de livraison (sous Windows avec WSL 2).
- pnpm : verrouillage, installation reproductible, usage en conteneur.

## Mise à jour du 2026-10-10 (après validation de la fiche)

Aucun choix de la fiche n'est modifié. Ces vérifications complètent la section « Ce qui n'a pas été vérifié » :

| Point de la fiche | Situation au 2026-10-10 |
|---|---|
| Le dépôt épingle encore npm et Keycloak 26.7.0 | **Corrigé** : pnpm 12.10.1 (verrou `pnpm-lock.yaml`, Dockerfile, scripts, documents) et Keycloak 26.8.0 dans `docker-compose.yml` |
| Migrations exécutées sur PostgreSQL 16 seulement | Rejouées sur **PostgreSQL 18.4** (build tiers du paquet npm `@embedded-postgres`, **pas** l'image officielle) : rôles, 2 migrations, 39 tests de sécurité sur une table d'essai (US-05-011 reste partielle) |
| Keycloak 26.8.0 : import du realm et PKCE jamais exécutés | Archive de la release 26.8.0 obtenue sur GitHub, démarrée **hors Docker** sur PostgreSQL 18.4 (Java 21) : realm importé, flux code + PKCE démontré pour les 5 comptes de test (script sans navigateur). **Pas** validé avec un vrai frontend |
| Patch Node 24.21.0 donné par un site tiers | Le paquet npm `node@24.21.0` existe et a servi aux tests ; la page nodejs.org n'a pas été consultée pour ce patch |
| pnpm : installation reproductible, usage en conteneur | `pnpm install --frozen-lockfile`, build, lint, formatage, tests et `pnpm deploy --prod` exécutés avec succès sur Node 24.21.0 ; installation de pnpm par `npm install --global pnpm@12.10.1` testée. Usage **dans l'image Docker** : non testé |
| Existence des images `postgres:18`, `node:24-slim`, `keycloak:26.8.0` ; pile complète dans Docker | **Toujours non vérifiés** : l'environnement de préparation ne peut pas joindre Docker Hub ni Quay. Voir `docs/dev/VALIDATION-PILE.md` |
