# État fonctionnel réel : implémenté, testé, restant

Rédigé le 14 octobre 2026. Ce document dit ce qui existe, ce qui a été **réellement exécuté** et où, et ce qui reste. Un écran ou une route qui existe n'est pas pour autant « terminé ».

## 1. Fonctionnalités

| Fonctionnalité                                                                                                  | Implémenté                                | Testé                                                             | Réserves                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Vérification des jetons Keycloak, refus par défaut, `/moi`                                                      | oui                                       | oui (unitaire + HTTP + Keycloak réel)                             | DEC-16 ouverte ; pas de révocation, pas de verrou de session 5 min       |
| Comptes applicatifs nominatifs, rattachement par un administrateur                                              | oui                                       | oui (base réelle)                                                 | H6 : politique non validée                                               |
| Visiteurs (créer, rechercher, modifier)                                                                         | oui                                       | oui                                                               | DEC-19 (19/10) et DEC-36 (22/10, provisoire) : nom, prénom, contact obligatoires ; Réception : nom et contact masqué seulement, ne qualifie ni ne modifie ; doublons signalés par le serveur (409), création confirmée ou motif « homonyme distinct », jamais de fusion ; modification par l'Assistant et l'Autorité, journalisée |
| Agendas (lister, créer, rattacher à une Autorité)                                                               | oui                                       | oui                                                               | DEC-32 (22/10, provisoire) : Autorité obligatoire à la création ; proposer (Administrateur) → autoriser (Autorité désignée) → appliquer (Administrateur), révocation par l'Autorité, tout journalisé ; sans rattachement actif : décisions et suivi refusés, file « à rattacher » ; donnée initiale par `amorcer-donnees-test.mjs` (« initialisation système ») |
| Demandes (créer, lister, consulter, corriger, qualifier)                                                        | oui                                       | oui                                                               | Référence `DEM-AAAA-NNNNNN` (H3) ; droits ajoutés (H12)                  |
| Décisions (valider, rejeter, différer), file                                                                    | oui                                       | oui                                                               | File triée par date seule : priorité à six critères non développée       |
| Planification, planning, démarrage, fin avec résultat                                                           | oui                                       | oui                                                               | Une audience par demande (H13)                                           |
| Clôture d'audience                                                                                              | oui : Autorité et Assistant (arbitrage du 19/10) | oui, avec confirmation (irréversible) | Trace : identifiants et durées. Rectification, motif d'écart, irréversibilité garantie en base : non développés |
| Journal d'audit en ajout seul                                                                                   | oui                                       | oui (base réelle)                                                 | limites dans `JOURNAL.md` ; non « inaltérable »                          |
| Journal : dix catégories, vue limitée de l'Autorité, refus sensibles, auteur « système », récapitulatif des purges | oui                                       | oui (base réelle, navigateur)                                     | HYPOTHESE(DEC-38) (L2) ; accès temporaire de l'Administrateur : L3, non fait |
| Frontend raccordé : demandes, décisions, agendas/planning, opérations, journal, administration                  | oui                                       | tests automatisés avec API simulée ; parcours API réel par script | pas d'essai manuel dans un navigateur                                    |
| Priorité à six critères (saisie, niveau fixé, tri de la file)                                                   | oui                                       | oui (base réelle)                                                 | DEC-37 (22/10, provisoire) : critères saisis par l'Assistant ou l'Autorité, niveau fixé par l'Autorité, aucune formule, référentiels provisoires à trois niveaux |
| Catégorie protocolaire, reprogrammation, annulation, urgence | **non**                                   | —                                                                 | voir « Restant »                                                         |
| Salle d'attente, appels, dossier relationnel, délégations, conservation/purge, alertes, tableau de bord, mobile | **non**                                   | —                                                                 | hors de ce lot                                                           |

## 2. Tests réellement exécutés (14 octobre 2026, environnement de développement de l'assistant, Linux)

| Contrôle                                                                  | Résultat   | Environnement                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` backend (unitaire + HTTP avec jetons RS256 de test)           | 75 réussis | Node de l'environnement (pas la version 24 du projet), sans base                                                                                                                             |
| `pnpm test:db` (39 tests de sécurité existants + 34 tests des API métier) | 73 réussis | **PostgreSQL 16** (pas 18), rôles et migrations du projet, hors Docker                                                                                                                       |
| `pnpm test` frontend                                                      | 18 réussis | jsdom, API simulée par URL                                                                                                                                                                   |
| `pnpm lint`, `typecheck`, `build`, `format:check`                         | réussis    | idem                                                                                                                                                                                         |
| `scripts/verifier-auth.mjs`                                               | tout OK    | vrai Keycloak 26.8.0 (hors Docker), scope `basic` présent                                                                                                                                    |
| `scripts/verifier-parcours.mjs`                                           | tout OK    | vrai Keycloak + vrai backend compilé + PostgreSQL 16 : connexion PKCE de 4 rôles, demande → qualification → décision → planification → démarrage → fin → clôture refusée → chaîne et journal |

## 3. Non exécuté (à faire dans votre environnement)

- Docker Compose et Docker Desktop (`docker compose up --build`), Windows, PostgreSQL 18, Node 24, `scripts/verifier-pile.sh` après ces changements.
- Les migrations sur PostgreSQL 18 (écrites en SQL standard, exécutées sur 16 seulement).
- Un parcours manuel dans un navigateur (Vite sur `localhost:5173` + Keycloak) pour les écrans métier.
- Jeton expiré et mauvais client contre un vrai Keycloak (couverts uniquement par les tests à clés de test).

## 4. Restant, par ordre suggéré

1. Décisions métier : arbitrages du 19/10 appliqués pour la création des visiteurs, la clôture, le statut neutre de la Réception et la liste blanche des rôles ; décisions du 22 et du 23/10 développées : doublons et vue minimale des visiteurs (L1), classification du journal (L2), périmètre de l'Autorité (L4), priorité à six critères (L6) ; décidées mais non développées (voir `HYPOTHESES.md`) : accès temporaire de l'Administrateur au journal (L3), rôle `shiku_audit` limité à des vues et journal d'audit de la base (Q-3), motif d'écart et rectification avec identifiant de version (Q-13, Q-5 ; L5), réinitialisation de mot de passe (Q-6 à Q-8 ; L7) ; restent ouverts : H13, H14, DEC-16.
2. Priorité : la grille de pondération (formule) sera fixée avec l'Autorité, configurable et versionnée ; les valeurs des critères sont provisoires (DEC-37).
3. Catégorie protocolaire, reprogrammation, annulation (conservation 2 ans, AUD-28), urgence.
4. Accueil : arrivée, attente, appel, absence (US-05-053 à 055, 062).
5. Délégations (US-05-005 à 009), conservation et purge (US-05-018 à 023), dossier relationnel, alertes sur le journal, tableau de bord.

## 5. Hypothèses introduites dans ce lot (aucune n'est une décision métier)

H3 format de référence · H6 rattachement par administrateur · H7 nom d'organisation fictif · H12 droits supplémentaires de la matrice et qualification de visiteur en texte libre · H13 une audience par demande · H14 machines d'états. Détail : `ETAPE-1-AUTHENTIFICATION.md` et `backend/src/habilitation/matrice-officielle.ts` ; `HYPOTHESES.md` (champ `source` de chaque action).
