# API nécessaires au frontend et absentes du backend

> **Mise à jour du 14 octobre 2026.** Demandes, décisions, agendas, audiences (planification, démarrage, fin, clôture), journal et comptes sont **implémentés** : voir `docs/dev/API.md`. Les tableaux ci-dessous conservent les propositions d'origine ; seule la part non listée dans `API.md` reste à faire (priorité à six critères, catégorie protocolaire, reprogrammation, annulation, arrivées et appels, dossier relationnel, délégations, tableau de bord).

État du backend au 2026-10-14 : routes listées dans `API.md`. Validation de jeton et refus par défaut en place ; matrice RBAC provisoire ; pas de CORS. Ce paragraphe décrivait l'état du 2026-10-11 (une seule route, `GET /sante`).

Les routes ci-dessous sont des **propositions** pour dimensionner le travail, non des contrats. Chacune relève d'une tâche backend distincte, après décision du représentant habilité. Règles communes à toutes : droit évalué côté serveur à l'exécution, clé d'organisation, entrée de journal attribuée pour toute action sensible, données fictives en test (CONTRIBUTING § 4).

## Prérequis transverses (à faire avant tout module)

| Tâche | Contenu | Story / décision |
|---|---|---|
| ~~B-00 Validation des jetons~~ **faite (hors résolution `keycloak_sub` → `utilisateur`, faite par `ContexteGuard`)** | Valider le JWT Keycloak (signature via JWKS, `iss`, `exp`, audience), garde Nest, résolution `keycloak_sub` → `utilisateur`. Tests : sans jeton 401, jeton expiré 401, signature invalide 401 | US-05-002, US-05-003 ; `DEC-16` (authentification) |
| ~~B-01 Habilitation~~ **faite, matrice PROVISOIRE** | Évaluer le droit d'une action selon la matrice RBAC, refuser par défaut | US-05-003 |
| **B-02 Journal** | Écriture attribuée, ajout seul garanti par la base | US-05-010, US-05-011 |
| **B-03 CORS ou même origine** | Choix à arrêter ; le proxy Vite ne couvre que le développement | — |
| **B-04 Profil courant** (partiel : `GET /moi` et `GET /droits` existent, sans délégations) | `GET /moi` : identité, rôles, délégations actives (le Protocole n'est pas dans le jeton, D04-24) | US-05-009 |

## Par écran

| Écran | API proposées | Données attendues | Contrôle d'accès requis | Tests à prévoir |
|---|---|---|---|---|
| Demandes | `GET/POST /demandes`, `GET/PATCH /demandes/:id` | visiteur, motif, agenda, statut, date, responsable (EF03-04) ; catégorie protocolaire (EF03-13) ; priorité à six critères (EF03-14) | Réception : création et qualification initiale seulement (US-05-038) ; justification obligatoire d'un changement de priorité | refus sans droit hors interface ; journal écrit ; agenda masqué non restitué (D04-23) |
| Décisions | `GET /decisions/file`, `POST /demandes/:id/decision` | valider/rejeter/différer, motif, auteur, date | Autorité, délégable à l'Assistant (US-05-043) | délégation expirée/révoquée refusée (AB-04) |
| Agendas / audiences | `GET /agendas`, `GET /agendas/:id/planning`, `POST/PATCH /audiences` | agenda, période ou séquence, durée, motif de report/annulation | Administrateur pour l'administration des agendas ; règle de visibilité (EF03-24) | conflit de créneau signalé non bloquant (US-05-052) |
| Opérations du jour | `GET /operations/jour`, arrivées, appels, début/fin d'audience | états arrivé, en attente, appelé, absent, sorti (EF03-11) | Réception : accueil seulement ; Assistant : appel | transitions horodatées |
| Dossiers relationnels | visiteurs, dossier, notes, signalement, revue | notes en texte libre, attestation, signalement (EF03-18 à 20) | Réception exclue ; consultation journalisée | alerte de saisie, passage outre tracé (D04-05) |
| Administration | utilisateurs, délégations | délégation programmée (EF03-25) | Administrateur seul ; pas d'auto-attribution | journal inaltérable (ENF03-12) |
| Tableau de bord | `GET /pilotage/indicateurs` | cinq familles d'EF03-17 | agrégats calculés côté serveur après évaluation des droits (US-05-059) | périmètre par rôle |

## Décisions humaines nécessaires (non tranchées ici)

- `DEC-16` : mécanisme d'authentification (le frontend suppose Keycloak, ce que le dépôt impose).
- `DEC-18` : canal de l'alerte immédiate à l'Autorité et forme de la liste d'exceptions.
- `DEC-19` : qui crée un visiteur à l'accueil (la matrice RBAC n'a pas cette action).
- `DEC-28` : confirmation formelle du cadre frontend (CONTRIBUTING § 6).
- Visibilité des entrées de menu par rôle : à confirmer par la matrice RBAC validée (`phase-03-matrice-rbac-delegation`), absente de cette archive.
- Même origine ou CORS en production.
