# Règles de contribution

Ce dépôt est un prototype hors CGPA (voir `README.md`). Le cadre de gouvernance ne s'y applique pas, mais **la qualité exigée reste la même** : ce que vous écrivez sera relu avant d'entrer dans le dépôt gouverné.

## 1. Ordre de travail

1. Suivez les guides de sprint, dans l'ordre : Sprint 0, puis 1, puis 2.
2. Dans un sprint, suivez l'ordre du guide : il respecte les dépendances entre stories.
3. N'ouvrez un sprint que lorsque le précédent est terminé.
4. Ne faites pas une story qui n'est pas dans le sprint en cours.

## 2. Branches et pull requests

- **Jamais de commit direct sur `main`.**
- Une branche courte par tâche ou par story : `feature/US-05-001-cle-organisation`, `feature/T0-04-structure-depot`.
- Chaque branche passe par une **pull request relue par un humain avant fusion**. La personne qui a écrit ne fusionne pas sans cette relecture.
- Une pull request = une tâche ou une story. Pas de pull request fourre-tout.
- Ne construisez pas une pull request sur la branche d'une autre : partez toujours de `main` à jour.

## 3. Messages de commit

Format : `type(portée) : message court à l'impératif`.

Exemples : `feat(habilitation) : refuser l'action sans droit côté serveur`, `docs(sprint0) : décrire la structure du dépôt`, `test(journal) : vérifier le refus de modification`.

Types : `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.

## 4. Les règles de sécurité qui ne se négocient pas

Elles viennent des décisions d'architecture déjà arrêtées.

1. **Le droit est contrôlé côté serveur à l'exécution.** Masquer un bouton n'est jamais un contrôle.
2. **Le journal est en ajout seul, garanti par la base de données**, pas seulement par le code. Le rôle applicatif ne doit pas pouvoir modifier ni supprimer une ligne du journal.
3. **Toute action sensible écrit une entrée de journal** attribuée à une personne identifiée.
4. **Toute donnée métier porte sa clé d'organisation.**
5. **Aucun module métier n'en appelle directement un autre.** On passe par le modèle de données et les événements.
6. **Aucun compte partagé.** Un compte = une personne.
7. **Aucun secret dans le dépôt, ses réglages ou ses journaux.** Variables d'environnement, jamais de valeur en clair. Un secret commité est à considérer comme compromis et à renouveler.
8. **Données fictives uniquement.** Aucune donnée réelle, y compris dans les tests et les exemples.

## 5. Qu'est-ce qu'une story terminée ?

Dix conditions, toutes vraies :

1. Les critères d'acceptation de la story sont vérifiés (la recette du guide).
2. Le droit est évalué côté serveur pour toute action sensible.
3. Toute action sensible produit une entrée de journal attribuée à une personne identifiée et impossible à modifier.
4. Toute donnée porte sa clé d'organisation et sa règle de conservation (durée, point de départ, propagation).
5. Aucun appel direct entre modules métier.
6. Les tests de la story passent. Un test par ligne de recette est le plus simple.
7. La pull request est relue avant fusion.
8. La documentation touchée est à jour.
9. S'il y a un écran : contrôles de design et d'accessibilité passés.
10. L'artefact est versionné et reproductible (applicable quand la CI existe).

## 6. Quand une décision manque

Les décisions ouvertes sont listées dans `DECISIONS-A-RENDRE.md` (dépôt gouverné). Si l'une d'elles vous bloque :

1. **Ne tranchez pas à la place du représentant habilité.**
2. Notez dans la pull request : la décision manquante (`DEC-xx`), ce que vous avez supposé, et pourquoi.
3. Marquez le code ou le document : `HYPOTHESE(DEC-xx) : ce qui est supposé`.
4. Faites au plus simple et au plus facile à défaire.
5. Avancez sur une autre tâche pendant que la décision est rendue.

Ne démarrez **pas** : l'application mobile, un frontend dont le cadre n'est pas choisi, de l'infrastructure sur AWS.

## 7. Contributions par IA

Si vous utilisez un assistant IA, **dites-le dans la pull request** et relisez vous-même chaque ligne avant de la proposer. Une relecture par la même IA ne vaut pas une relecture humaine.

## 8. Réintégration dans le dépôt gouverné

Ce dépôt est un prototype. Après la décision du 14 octobre 2026 :

1. Le représentant habilité dit quelles parties sont reprises.
2. Chaque partie reprise passe par une pull request vers `shiku-audience-platform`, avec une **revue humaine** et le contrôle des dix conditions ci-dessus.
3. Les `HYPOTHESE(DEC-xx)` encore présentes sont soit confirmées par un acte signé, soit corrigées.
4. Ce qui n'est pas repris reste dans ce dépôt ou est abandonné.

Aucune garantie n'est donnée que le prototype soit repris tel quel : c'est pourquoi les décisions ouvertes sont à marquer et non à trancher.

## 9. Ce que vous n'avez pas à faire ici

Les Gates, les actes de décision, les rapports de gouvernance et la mise à jour de `project-state.md` restent dans le dépôt gouverné. Ici, vous construisez et vous documentez ce que vous construisez.
