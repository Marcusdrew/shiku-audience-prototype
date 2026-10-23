# Hypothèses et points à confirmer

État : 17 octobre 2026, après les réponses de M. Jordan (matrice RBAC Gate 02A et `Reponse_Jordan.docx`).
Rien ci-dessous n'est une décision validée sauf mention explicite. Une hypothèse est marquée `HYPOTHESE` dans le code.

## Levées par la matrice officielle

| #   | Sujet                              | Statut                                                                          |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- |
| H1  | Matrice RBAC dérivée du backlog    | Levée pour les 26 actions officielles ; reste ouverte pour les extensions       |

## Toujours ouvertes (à confirmer)

| #   | Sujet                                                           | Impact si la réponse change                                                      |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Q-13 | Clôture d'audience : rôles **tranchés** le 19/10 (Autorité et Assistant ; ancienne H4). Restent : la ligne de matrice citée par l'arbitrage (absente de Gate 02A reçue) et le Protocole sous délégation | Retirer `protocole` des délégués de `audience.cloturer` si refusé |
| H9  | Périmètre de « L » du journal pour l'Autorité (non défini)      | Aujourd'hui : lecture de toute l'organisation. À restreindre si besoin           |
| H12 | Extensions hors matrice : `demande.modifier`, `decision.consulter`, `audience.consulter`, `agenda.lister` | Supprimer ou restreindre la ligne ; l'écran concerné perd l'accès                |
| ACTE-ARB | `visiteur.creer` : Réception, Assistant, Autorité (DEC-19 tranchée le 19/10) ; reste une extension jusqu'à l'acte qui l'ajoute à la matrice. Libellé du statut neutre de la Réception « non retenue, ne pas planifier » donné en exemple (Q-14) | Changer le libellé dans `frontend/src/lib/libelles.ts` |

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
