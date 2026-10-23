# Hypothèses et points à confirmer

État : 22 octobre 2026, après les réponses de M. Jordan (matrice RBAC Gate 02A, `Reponse_Jordan.docx`, arbitrages du 19/10 et réponses du 22/10).
Rien ci-dessous n'est une décision validée sauf mention explicite. Une hypothèse est marquée `HYPOTHESE` dans le code.

## Levées par la matrice officielle

| #   | Sujet                              | Statut                                                                          |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- |
| H1  | Matrice RBAC dérivée du backlog    | Levée pour les 26 actions officielles ; reste ouverte pour les extensions       |

## Toujours ouvertes (à confirmer)

| #   | Sujet                                                           | Impact si la réponse change                                                      |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Q-13 | Clôture d'audience : Autorité et Assistant (19/10). Source précisée le 22/10 : droit P de l'Assistant sur « Démarrer / terminer audience », sans délégation ; la délégation ne concerne que le Protocole et la rectification. **Règle provisoire** : `HYPOTHESE(DEC-33)`. Motif d'écart (tolérance de 15 minutes, `HYPOTHESE(DEC-35)`) et rectification décidés, non développés (lot L5) | Retirer `protocole` des délégués de `audience.cloturer` si refusé |
| H9  | Périmètre de « L » du journal pour l'Autorité : **décidé le 22/10** (Q-1 : dix catégories, vue limitée de l'Autorité, accès temporaire de l'Administrateur), **non développé** (lots L2 et L3) | Aujourd'hui : lecture de toute l'organisation, jusqu'à la livraison de L2 |
| H12 | Extensions hors matrice : `demande.modifier`, `decision.consulter`, `audience.consulter`, `agenda.lister` | Supprimer ou restreindre la ligne ; l'écran concerné perd l'accès                |
| ACTE-ARB | `visiteur.creer` : Réception, Assistant, Autorité (DEC-19 tranchée le 19/10) ; reste une extension jusqu'à l'acte qui l'ajoute à la matrice | Retirer un rôle de la ligne |
| Q-14 | Libellé de la Réception « Non retenue — ne pas planifier », sans motif ni auteur ; « Annulée » pour une demande annulée. **Règle provisoire** du 22/10 : `HYPOTHESE(DEC-34)` dans `frontend/src/lib/libelles.ts` | Changer le texte dans `libelles.ts` |

## Décidées le 22/10/2026, à appliquer par lots

Source : réponse de M. Jordan du 22/10/2026 (`REPONSE-POINTS-METIER-RESTANTS.docx`). Plan des lots et questions renvoyées : analyse du 22/10 (hors dépôt).

| Sujet | Statut | Lot |
| --- | --- | --- |
| Q-1 Journal : dix catégories, vue limitée de l'Autorité, accès temporaire de l'Administrateur (24 h, 72 h au plus) | Décidé, non développé | L2, L3 |
| Q-10 Rattachement Autorité ↔ agenda, file « à rattacher » | Règle provisoire `HYPOTHESE(DEC-32)`, **développée (L4)** ; rattachement autorisé par l'Autorité et appliqué par l'Administrateur, dans l'application, journalisé ; voir ci-dessous les choix faits | L4 |
| Q-6 à Q-8 Réinitialisation par courriel, approbations, second facteur de l'Autorité, compte de service sans droit de définir un mot de passe | Décidé, non développé ; limite Keycloak à lever (`COMPTES-KEYCLOAK.md`) | L7 |
| Q-12 Doublons de visiteurs : avertir et confirmer, motif « homonyme distinct », vue minimale de la Réception (courriel `j***@g***.com`, téléphone : deux derniers chiffres ; contact complet jamais envoyé à l'interface) | Décidé, **développé (L1)** | L1 |
| Visiteur : modification par l'Assistant et l'Autorité seulement (valeurs avant et après) ; identité minimale = nom, prénom, un moyen de contact | Règle provisoire `HYPOTHESE(DEC-36)`, **développée (L1)** ; voir ci-dessous les choix faits | L1 |
| Priorité à six critères : valeurs saisies et visibles, aucune formule, tri chronologique maintenu ; l'Assistant saisit les critères, le niveau est fixé par l'Autorité ou l'Assistant sous délégation ; listes provisoires à trois niveaux | Règle provisoire `HYPOTHESE(DEC-37)`, non développée | L6 |

Choix faits pour L1, marqués `HYPOTHESE(DEC-36)` (à confirmer) :
- le contact est **obligatoire** à la création (identité minimale) ; forme acceptée : courriel, ou téléphone d'au moins 6 chiffres ;
- normalisation du téléphone : chiffres seuls, **sans unifier l'indicatif pays** (« +243 81… » et « 081… » ne sont pas reconnus comme identiques) ;
- la fiche complète est réservée aux détenteurs de `visiteur.modifier` (Assistant, Autorité) ; tout autre profil reçoit le résultat minimal ;
- pas de contrôle de doublon lors d'une **modification** (non demandé) ;
- journal de `visiteur.modifier` : noms des champs changés seulement, en attendant Q-5 ; journal de `visiteur.creer` avec doublon : code, identifiants des fiches proches, motif ou confirmation, jamais d'identité ;
- fiches antérieures (nom complet seul) : nom et prénom vides ; une modification du nom exige les deux.

Choix faits pour L4, marqués `HYPOTHESE(DEC-32)` (à confirmer) :
- trois étapes au lieu de deux : l'Administrateur **propose** (en désignant l'Autorité, champ obligatoire à la création d'un agenda), l'Autorité désignée **autorise**, l'Administrateur **applique** ; l'Autorité peut **révoquer** son rattachement ; tout est journalisé (`rattachement_agenda.proposer`, `autoriser`, `appliquer`, `revoquer`) ;
- période en jours (dates), sans heure ; plusieurs Autorités possibles pour un même agenda ;
- l'application ne connaît pas les rôles Keycloak : l'Administrateur choisit parmi tous les comptes actifs ; seul un compte qui a le rôle Autorité peut ensuite autoriser ;
- Assistant : décisions impossibles (matrice) ; pour le suivi (droit P) et la file de décision, il agit sur tout agenda rattaché à une Autorité, en attendant le périmètre par délégation (Sprint 2) ;
- donnée initiale : `amorcer-donnees-test.mjs` rattache l'Autorité de test à tout agenda qui n'a **jamais** eu de rattachement (une révocation n'est pas annulée), statut actif, source « initialisation_systeme », entrée de journal `rattachement_agenda.initialiser` attribuée au compte administrateur de test qui lance le déploiement.

Précisions du 22/10 au soir : vue du journal de l'Autorité sans « décisions et audiences » ni « comptes et accès », sauf entrées « sous délégation » ; expiration de l'accès temporaire appliquée à l'instant, journalisée « expiré le …, constaté le … » ; limite Keycloak acceptée avec contre-mesures (L7). Toujours sans réponse : Q-3 (rôle `shiku_audit`), Q-5 (contenu du journal), Q-15 (signature des actes), recopiées en entier le 22/10 ; classement des actions dans les catégories, proposé le 22/10. Interface publique par code QR (DEC-31) : non décidée, non construite.

## Fonctionnalités non réalisées (donc refusées ou absentes)

- Délégations (« D ») : toujours refusées ; implémentation prévue Sprint 2.
- Profil Protocole : n'existe que comme profil de délégation, aucun droit sans délégation.
- Profil Administrateur applicatif : droits limités à l'administration des comptes et des agendas ; `journal.consulter` en « D ».
- Liste des exceptions et liste mensuelle d'audit : non implémentées.
- Module de conservation : seule la règle de purge au niveau base est en place (6 ans, avec trace `journal_purge`).

## Décisions à formaliser (sans les présenter comme validées)

- DEC-03, DEC-27, DEC-29 : en attente de formalisation.
- Incohérence documentaire : la décision DEC-27 mentionne Spring Boot alors que le prototype est en NestJS. Aucune réécriture n'a été faite ; à trancher.
- Durées de conservation (5 ans demandes, 6 ans journal) : à confirmer.
