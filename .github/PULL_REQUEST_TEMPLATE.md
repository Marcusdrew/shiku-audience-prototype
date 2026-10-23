## Ce que fait cette pull request

<!-- Une phrase. Une tâche ou une story par pull request. -->

**Tâche ou story :** `T0-xx` / `US-05-xxx`
**Sprint :** 

**Classe du changement :** <!-- une seule : fonctionnalité / correctif / sécurité / documentation / outillage -->

## Recette

<!-- Recopiez les cases de recette du guide de sprint et cochez celles qui sont vraies. -->

- [ ] 
- [ ] 

## Contrôles exécutés et lieu d'exécution

<!-- Un contrôle réussi dans l'environnement Linux d'un outil ne vaut pas validation. Indiquez pour
chaque contrôle s'il a été exécuté, où, et son résultat. Un contrôle non lancé est écrit « non exécuté ». -->

| Contrôle | Poste Windows (Node 24, PostgreSQL 18, Docker, Keycloak) | Autre environnement (lequel) |
| --- | --- | --- |
| `pnpm lint`, `typecheck`, `format:check`, `build` | | |
| `pnpm test` | | |
| `pnpm test:db` | | |
| `pnpm test:scripts` | | |
| `verifier-parcours.mjs` | | |
| Parcours dans le navigateur | | |

## Les dix conditions de terminé

- [ ] 1. Les critères d'acceptation sont vérifiés
- [ ] 2. Droit évalué côté serveur (si action sensible)
- [ ] 3. Entrée de journal attribuée, protégée contre la modification et la suppression (si action sensible)
- [ ] 4. Clé d'organisation et règle de conservation (si nouvelle donnée)
- [ ] 5. Aucun appel direct entre modules métier
- [ ] 6. Tests de la story passent
- [ ] 7. Cette pull request attend une relecture humaine avant fusion
- [ ] 8. Documentation à jour
- [ ] 9. Écran : design et accessibilité contrôlés (sans objet s'il n'y a pas d'écran)
- [ ] 10. Artefact reproductible (quand la CI existe)

## Sécurité

- [ ] Aucun secret dans les fichiers, les réglages ou les journaux
- [ ] Données fictives uniquement
- [ ] Aucune donnée réelle dans les tests ni les exemples

## Décisions manquantes

<!-- Listez chaque DEC-xx qui manquait, ce que vous avez supposé, et où c'est marqué HYPOTHESE(DEC-xx). Écrivez « aucune » sinon. -->

## Contribution par IA

- [ ] Je n'ai pas utilisé d'IA pour cette pull request
- [ ] J'ai utilisé une IA et j'ai relu moi-même chaque ligne, une par une. Outil et part concernée : 

## Ce qui reste à faire ou à vérifier
