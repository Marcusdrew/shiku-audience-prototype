# Hypothèses et points à confirmer

État : 22 octobre 2026, après les réponses de M. Jordan (matrice RBAC Gate 02A, `Reponse_Jordan.docx`, arbitrages du 19/10 et réponses du 22/10).
Rien ci-dessous n'est une décision validée sauf mention explicite. Une hypothèse est marquée `HYPOTHESE` dans le code.

## Registre des marqueurs HYPOTHESE(DEC-xx)

Exigé par M. Jordan le 23/10/2026 (réponse à Q-15) : les règles provisoires sont fusionnées avec leur marqueur et la mention « signature attendue », sans attendre les actes. Chaque marqueur `HYPOTHESE(DEC-xx)` du code (backend, migrations, frontend, scripts) doit figurer ici ; chaque ligne « oui » doit avoir au moins un marqueur dans le code. Contrôle : `pnpm hypotheses:check`, lancé par la CI. Les règles de sécurité (droit côté serveur, journal protégé, aucun secret, données fictives) ne sont jamais des hypothèses.

| DEC | Sujet | État | Dans le code |
| --- | --- | --- | --- |
| DEC-04 | Versions de la pile (Node, pnpm, PostgreSQL, Keycloak) | à fixer par le représentant habilité | oui |
| DEC-28 | Cadre du frontend et visibilité des entrées par rôle | à décider | oui |
| DEC-32 | Périmètre de l'Autorité : rattachement aux agendas | provisoire, signature attendue | oui |
| DEC-33 | Clôture : délégation, rectification, motif d'écart | provisoire, signature attendue | oui |
| DEC-34 | Libellé « Non retenue — ne pas planifier » de la Réception | provisoire, signature attendue | oui |
| DEC-35 | Tolérance de 15 minutes pour le motif d'écart | provisoire, à appliquer (lot L5) | non |
| DEC-36 | Visiteur : modification, identité minimale, masquage | provisoire, signature attendue | oui |
| DEC-37 | Priorité : qui la fixe, valeurs des critères | provisoire, signature attendue | oui |
| DEC-38 | Classification du journal, refus journalisés, rôle `shiku_audit`, contenu du journal | provisoire (ACTE-DEC-38), signature attendue ; classification et refus **développés (L2)** ; accès temporaire (L3) et `shiku_audit` à venir | oui |

## Levées par la matrice officielle

| #   | Sujet                              | Statut                                                                          |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- |
| H1  | Matrice RBAC dérivée du backlog    | Levée pour les 26 actions officielles ; reste ouverte pour les extensions       |

## Toujours ouvertes (à confirmer)

| #   | Sujet                                                           | Impact si la réponse change                                                      |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Q-13 | Clôture d'audience : Autorité et Assistant (19/10). Source précisée le 22/10 : droit P de l'Assistant sur « Démarrer / terminer audience », sans délégation ; la délégation ne concerne que le Protocole et la rectification. **Règle provisoire** : `HYPOTHESE(DEC-33)`. Motif d'écart (tolérance de 15 minutes, `HYPOTHESE(DEC-35)`) et rectification décidés, non développés (lot L5) | Retirer `protocole` des délégués de `audience.cloturer` si refusé |
| H9  | Périmètre de « L » du journal pour l'Autorité : **décidé le 22/10** (Q-1), vue limitée **développée (L2)** ; accès temporaire de l'Administrateur non développé (L3) | L'Autorité ne voit plus dans le journal les décisions, audiences et comptes (elle les consulte dans les écrans métier) |
| H12 | Extensions hors matrice : `demande.modifier`, `decision.consulter`, `audience.consulter`, `agenda.lister` | Supprimer ou restreindre la ligne ; l'écran concerné perd l'accès                |
| ACTE-ARB | `visiteur.creer` : Réception, Assistant, Autorité (DEC-19 tranchée le 19/10) ; reste une extension jusqu'à l'acte qui l'ajoute à la matrice | Retirer un rôle de la ligne |
| Q-14 | Libellé de la Réception « Non retenue — ne pas planifier », sans motif ni auteur ; « Annulée » pour une demande annulée. **Règle provisoire** du 22/10 : `HYPOTHESE(DEC-34)` dans `frontend/src/lib/libelles.ts` | Changer le texte dans `libelles.ts` |

## Décidées le 22/10/2026, à appliquer par lots

Source : réponse de M. Jordan du 22/10/2026 (`REPONSE-POINTS-METIER-RESTANTS.docx`). Plan des lots et questions renvoyées : analyse du 22/10 (hors dépôt).

| Sujet | Statut | Lot |
| --- | --- | --- |
| Q-1 Journal : dix catégories, vue limitée de l'Autorité, accès temporaire de l'Administrateur (24 h, 72 h au plus) | Décidé ; catégories et vue limitée **développées (L2)**, classement `HYPOTHESE(DEC-38)` ; accès temporaire non développé | L2, L3 |
| Q-10 Rattachement Autorité ↔ agenda, file « à rattacher » | Règle provisoire `HYPOTHESE(DEC-32)`, **développée (L4)** ; rattachement autorisé par l'Autorité et appliqué par l'Administrateur, dans l'application, journalisé ; voir ci-dessous les choix faits | L4 |
| Q-6 à Q-8 Réinitialisation par courriel, approbations, second facteur de l'Autorité, compte de service sans droit de définir un mot de passe | Décidé, non développé ; limite Keycloak à lever (`COMPTES-KEYCLOAK.md`) | L7 |
| Q-12 Doublons de visiteurs : avertir et confirmer, motif « homonyme distinct », vue minimale de la Réception (courriel `j***@g***.com`, téléphone : deux derniers chiffres ; contact complet jamais envoyé à l'interface) | Décidé, **développé (L1)** | L1 |
| Visiteur : modification par l'Assistant et l'Autorité seulement (valeurs avant et après) ; identité minimale = nom, prénom, un moyen de contact | Règle provisoire `HYPOTHESE(DEC-36)`, **développée (L1)** ; voir ci-dessous les choix faits | L1 |
| Priorité à six critères : valeurs saisies et visibles, aucune formule, tri chronologique maintenu ; l'Assistant saisit les critères, le niveau est fixé par l'Autorité ou l'Assistant sous délégation ; listes provisoires à trois niveaux | Règle provisoire `HYPOTHESE(DEC-37)`, **développée (L6)** ; voir ci-dessous les choix faits | L6 |

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
- donnée initiale : `amorcer-donnees-test.mjs` rattache l'Autorité de test à tout agenda qui n'a **jamais** eu de rattachement (une révocation n'est pas annulée), statut actif, source « initialisation_systeme », entrée de journal `rattachement_agenda.initialiser` au nom du « système » depuis L2 (auparavant : compte administrateur de test).

Choix faits pour L6, marqués `HYPOTHESE(DEC-37)` (à confirmer) :
- quatre critères saisis (rang protocolaire, urgence, importance stratégique, relation) ; les deux autres viennent de la demande (agenda, chronologie) ; listes provisoires à trois niveaux, dans une table de configuration commune (`priorite_referentiel`), sans écran d'administration ;
- le rang protocolaire est une liste provisoire en attendant les catégories protocolaires (US-05-040) ;
- tri de la file de décision : **niveau fixé**, puis la plus ancienne ; une demande **sans niveau compte comme « Normale »** ; le niveau n'est jamais calculé à partir des critères ;
- justification **facultative** (« si l'écart est contesté ») ; visible, avec son auteur, par ceux qui voient les décisions, pas par la Réception ; le journal ne garde que les codes et un indicateur ;
- priorité modifiable tant que la demande n'est ni rejetée, ni réalisée, ni close ; fixer le niveau respecte le périmètre de l'Autorité (DEC-32).

Choix faits pour L2, marqués `HYPOTHESE(DEC-38)` (réponses du 23/10, acte ACTE-DEC-38, signature attendue) :
- la catégorie n'est **pas stockée** dans l'entrée : elle se déduit de l'action par l'énumération fermée `backend/src/journal/categories.ts` (seule source), y compris pour les entrées antérieures, que l'ajout seul interdit de compléter ; une action non classée est refusée à l'écriture ; test de couverture `journal-categories.spec.ts` ;
- classement : visiteurs, demandes (dont la saisie des critères), décisions, planification et suivi en « décisions et audiences » ; changement du niveau de priorité en « priorité » ; compte créé ou rattaché en « comptes et accès » et rôle attribué, entrée distincte dans la même transaction, en « droits et délégations », comme chaque étape d'un rattachement ; agenda créé et `systeme.initialiser` en « administration technique » ; lecture du journal refusée en « sécurité du journal » ;
- refus journalisés (`resultat = 'refuse'`, catégorie de l'action tentée) : rôle hors liste blanche (`role.attribuer`), décision, planification ou changement de priorité hors périmètre d'agenda (403 ; le 409 « à rattacher » n'est pas journalisé), lecture du journal sans accès (`journal.consulter`) ; écrits hors de la transaction annulée ; **regroupement** : une entrée par personne et par action tentée dans une fenêtre de **10 minutes** (valeur non fixée par la décision), l'entrée suivante porte le nombre de refus regroupés de la fenêtre précédente ; le compteur est une table distincte, mise à jour ;
- auteur « système » : `utilisateur_id` vide et `auteur = 'systeme'` (contrainte : une personne ou le système, jamais aucun des deux) ; un rattachement initial n'a plus de proposant ni d'applicateur humain ; les entrées écrites avant ce lot au nom de l'administrateur de test restent telles quelles (ajout seul) ;
- vue limitée de l'Autorité : quatre catégories plus les entrées « sous délégation » (attribut toujours faux tant que les délégations n'existent pas) ; filtre par catégorie limité à ces quatre ; récapitulatif des purges (date, volume, période, volume par catégorie) **par organisation**, à partir des purges postérieures à ce lot ;
- Q-5 appliqué au contenu : plus de nom dans `utilisateur.creer` ni dans `agenda.creer` ; les noms sont résolus à l'affichage. Reste à faire : l'identifiant de version dans l'historique de l'objet pour « avant et après » (aucun historique de version n'existe ; lot L5, rectification).

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
