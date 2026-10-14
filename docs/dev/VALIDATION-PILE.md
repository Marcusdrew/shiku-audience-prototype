# Valider la pile Docker complète sur Windows (T0-40)

## Objectif du document

Ce guide décrit comment vérifier la pile technique SHIKU Audience sous Windows, depuis la préparation du dépôt jusqu'à l'arrêt des services. Il distingue les vérifications réellement exécutées des fonctionnalités qui restent à tester.

La pile comprend le backend NestJS, PostgreSQL 18 et Keycloak 26.8.0, orchestrés avec Docker Compose.

> **État au 12 octobre 2026 : validation locale de la pile réussie.**
>
> Le script `scripts/verifier-pile.sh` a terminé avec **23 vérifications réussies et 0 échec**.
>
> Les vérifications ont couvert :
> - la construction des images et le démarrage des services ;
> - PostgreSQL 18 et l'exécution des migrations ;
> - le backend NestJS et son endpoint `GET /sante` ;
> - la disponibilité du realm `shiku` dans Keycloak ;
> - les scénarios OAuth 2.0 / OIDC avec PKCE, y compris plusieurs cas de rejet ;
> - les tests de sécurité PostgreSQL (**39 tests réussis**) ;
> - la persistance de données fictives après un redémarrage sans suppression du volume.
>
> Les tests PKCE automatisés ont été exécutés avec un client simulé, sans navigateur. La validation de la pile ne signifie donc pas que toutes les fonctionnalités métier sont terminées.
>
> **Limites restantes :** des limites ont été identifiées concernant les privilèges du propriétaire des tables, du superutilisateur PostgreSQL, ainsi que les règles de purge et d'horodatage. La sécurité complète du journal d'audit reste à examiner.
>
> Cette validation concerne l'environnement local. Elle ne constitue ni une validation de production ni une preuve que toutes les exigences fonctionnelles sont satisfaites.

> **Mise à jour du 14 octobre 2026.** Ce bilan du 12 octobre porte sur la pile technique et reste exact pour ce périmètre. Depuis, le backend a reçu la vérification des jetons, l'habilitation, les API métier et le journal (`docs/dev/API.md`), et le scope `basic` a été ajouté au client `shiku-web`. Ces ajouts n'ont **pas** été revalidés dans Docker par `verifier-pile.sh` : voir `docs/dev/ETAT-FONCTIONNEL.md` pour ce qui a été réellement exécuté, et où.

> **Périmètre de T0-40 :** selon le guide, cette tâche dépend de `T0-02` (script `bootstrap`), qui n'existe pas dans ce dépôt. `scripts/init-local.sh` (T0-10) en tient lieu partiellement. La validation technique décrite ici ne clôt donc pas automatiquement tous les critères de T0-40.

## 1. Comprendre les niveaux de validation

| Niveau | Signification | Exemple dans ce dépôt |
|---|---|---|
| **Configuré** | Présent dans les fichiers, mais pas encore exécuté dans les conditions visées. | Un service déclaré dans `docker-compose.yml`. |
| **Testé individuellement** | Vérifié séparément, sans démontrer le fonctionnement de toute la pile. | Un test ciblé d'un composant. |
| **Validé localement** | Exécuté dans la pile Docker locale, avec les composants connectés. | Le démarrage de la pile et le contrôle de santé du backend. |
| **Non couvert par cette validation** | N'a pas été démontré par le script global. | Le parcours complet dans le navigateur ou les fonctionnalités métier. |

### Bilan des vérifications réalisées

| Élément vérifié | Résultat | Preuve ou précision |
|---|---|---|
| Configuration Docker Compose | Réussie | Configuration vérifiée lors de la procédure globale. |
| Construction des images | Réussie | Les images ont été construites localement. |
| PostgreSQL 18 | Réussi | PostgreSQL 18.6 est opérationnel dans Docker. |
| Migrations SQL | Réussies | Deux migrations exécutées ; le service `migrate` s'est terminé avec le code `0`. |
| Backend NestJS | Réussi | `GET /sante` répond HTTP 200 lorsque la base est opérationnelle. |
| Séparation des privilèges | Contrôle réalisé | Le conteneur applicatif ne reçoit pas les mots de passe des rôles superutilisateur, migration et purge. Cela ne prouve pas à lui seul l'absence de toute escalade de privilèges. |
| Keycloak | Réussi | Le realm `shiku` est accessible et les comptes ont persisté après redémarrage. |
| OAuth 2.0 / OIDC avec PKCE | Tests automatisés réussis | 9 vérifications réussies avec un client simulé, sans navigateur. |
| Tests de sécurité PostgreSQL | Réussis, avec limites connues | 39 tests réussis ; certaines limites de sécurité restent à traiter. |
| Persistance après redémarrage | Réussie | Une donnée fictive a survécu à un arrêt sans `-v` puis au redémarrage. |
| Script global `verifier-pile.sh` | Réussi | 23 vérifications réussies, 0 échec. |
| Connexion depuis le navigateur | Vérification distincte | Le script global ne valide pas le parcours complet du navigateur. Des essais manuels ont été effectués séparément. |
| Fonctionnalités métier | Non couvertes par cette validation | Les modules métier doivent être vérifiés selon les exigences du projet. |

## 2. Avant de commencer : choisir la branche

Les pull requests ne sont pas encore fusionnées dans `main`. Tant que c'est le cas, la validation doit être effectuée sur la branche locale qui rassemble les éléments nécessaires : `validation/locale` (voir `PULL_REQUESTS.md`, partie « Assembler en local »).

**Ne poussez jamais la branche `validation/locale`.**

Une fois les changements fusionnés dans `main`, utilisez plutôt :

```bash
git switch main
git pull --ff-only
```

Le script `scripts/init-local.sh` existe dans `feature/T0-10-gestion-secrets`, tandis que la pile complète est répartie sur les branches suivantes. Ne lancez pas la procédure depuis une branche isolée.

## 3. Procédure de validation (Git Bash, à la racine du dépôt)

Chaque étape précise la commande à exécuter, son objectif et le résultat attendu. Un résultat attendu décrit le comportement prévu ; il ne signifie pas que chaque commande a été exécutée lors de la validation précédente.

### Étape 1 — Préparer le dépôt

```bash
git switch validation/locale
```

**Objectif :** se placer sur la branche locale qui rassemble la pile.
**Résultat attendu :** `Switched to branch 'validation/locale'`.

```bash
git status --short
git branch --show-current
```

**Objectif :** vérifier l'état du dépôt et la branche active.
**Résultat attendu :** `git status --short` ne renvoie aucune ligne si l'arbre est propre ; la seconde commande affiche `validation/locale`.

> Si des modifications locales sont présentes, ne les supprimez pas : examinez-les avant de poursuivre.

```bash
git config core.autocrlf
```

**Objectif :** vérifier la configuration des fins de ligne.
**Résultat attendu :** `input`, `false` ou aucune valeur, selon la configuration et les règles de `.gitattributes`.

> Si la valeur est `true`, ne lancez pas automatiquement de commande destructive comme `git reset --hard`. Vérifiez d'abord les modifications locales et les règles de `.gitattributes`. Ne réinitialisez pas le dépôt sans avoir sauvegardé et compris les changements présents.

### Étape 2 — Initialiser et vérifier les secrets locaux

```bash
bash scripts/init-local.sh
```

**Objectif :** créer un fichier `.env` local contenant des secrets propres au poste.
**Résultat attendu :** création du fichier si nécessaire ; si `.env` existe déjà, le script ne doit pas l'écraser.

Si le script indique que `.env` n'est pas ignoré par Git, arrêtez-vous et corrigez `.gitignore` avant de poursuivre.

```bash
git check-ignore -v .env
git ls-files | grep -E '(^|/)\.env'
git status --short
```

**Objectif :** vérifier que `.env` est ignoré et n'est pas suivi par Git.
**Résultat attendu :**
- `git check-ignore -v .env` indique la règle qui ignore le fichier ;
- la recherche dans les fichiers suivis ne doit pas révéler un fichier `.env` suivi ; `.env.example` peut, lui, être suivi ;
- `git status --short` ne doit pas montrer `.env`.

**Sécurité :** ne partagez jamais le contenu de `.env`, ni la sortie d'une commande susceptible d'afficher les secrets.

### Étape 3 — Vérifier Node.js, pnpm et le projet

```bash
node --version
pnpm --version
```

**Objectif :** confirmer les versions des outils.
**Résultat attendu :** Node.js `v24.x` et pnpm `12.10.1`.

Si pnpm n'est pas installé, installez la version prévue par le projet :

```bash
npm install --global pnpm@12.10.1
```

Installez ensuite les dépendances verrouillées :

```bash
pnpm install --frozen-lockfile
```

**Objectif :** installer les versions définies dans le lockfile.
**Résultat attendu :** installation terminée sans erreur. Une erreur indiquant que le lockfile n'est pas à jour doit être examinée et signalée.

Lancez les contrôles du projet :

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm test
pnpm typecheck
```

**Objectif :** vérifier la compilation, le lint, le formatage, les tests et les types avant le démarrage Docker.
**Résultat attendu :** chaque commande se termine sans erreur.

### Étape 4 — Démarrer Docker Desktop

Démarrez Docker Desktop et attendez que le moteur indique qu'il est opérationnel.

```bash
docker version
docker compose version
```

**Objectif :** vérifier que le client Docker et le moteur répondent.
**Résultat attendu :** les informations du client et du serveur s'affichent ; Docker Compose v2 est disponible.

Si la section `Server` manque ou si une erreur de connexion apparaît, attendez que Docker Desktop soit prêt avant de continuer.

```bash
docker compose config -q
```

**Objectif :** vérifier la configuration Compose sans afficher son contenu.
**Résultat attendu :** aucune sortie et un code de sortie égal à `0`.

**Important :** n'exécutez pas `docker compose config` sans `-q` dans un terminal dont vous partagerez la sortie : la commande peut afficher des valeurs sensibles issues de l'environnement.

### Étape 5 — Construire et démarrer la pile

```bash
docker compose build
```

**Objectif :** construire les images nécessaires, notamment celle du backend.
**Résultat attendu :** la construction se termine sans erreur. Le premier lancement peut prendre plusieurs minutes.

Une erreur `403`, `denied` ou `timeout` lors du téléchargement d'une image peut venir du réseau, d'un proxy, d'un pare-feu ou d'une limite du registre. Examinez le message avant de conclure à un défaut du code.

Démarrez ensuite les services :

```bash
docker compose up -d
docker compose ps -a
```

**Objectif :** démarrer les conteneurs et vérifier leur état.
**Résultat attendu après le démarrage :**

| Service | État attendu |
|---|---|
| `db` | `healthy` |
| `keycloak` | `Up` |
| `migrate` | `Exited (0)` |
| `app` | `Up` |

Keycloak peut nécessiter 30 à 90 secondes pour démarrer.

Pour suivre ses journaux :

```bash
docker compose logs -f keycloak
```

Quittez l'affichage avec `Ctrl+C` ; cela ne doit pas arrêter le conteneur.

### Étape 6 — Vérifier PostgreSQL et les migrations

```bash
docker compose exec db pg_isready -U postgres -d shiku
```

**Objectif :** vérifier que PostgreSQL accepte les connexions.
**Résultat attendu :** `accepting connections`.

Adaptez le nom de l'utilisateur ou de la base si les variables correspondantes de `.env` ont été personnalisées.

```bash
docker compose exec db postgres --version
```

**Objectif :** vérifier la version de PostgreSQL.
**Résultat attendu :** une version `PostgreSQL 18.x`.

```bash
docker compose logs migrate
```

**Objectif :** examiner l'exécution des migrations.
**Résultat attendu :** les deux migrations sont enregistrées et le service indique `Migrations complete!`.

### Étape 7 — Vérifier le backend

```bash
curl http://localhost:3000/sante
```

Sous PowerShell, utilisez `curl.exe` si `curl` est interprété comme un alias.

**Objectif :** vérifier que le backend répond et peut joindre la base.
**Résultat attendu :**

```json
{"statut":"ok","base":"ok"}
```

Un contrôle négatif facultatif consiste à arrêter temporairement la base :

```bash
docker compose stop db
curl -i http://localhost:3000/sante
docker compose start db
```

Lorsque la base est arrêtée, le endpoint doit renvoyer HTTP `503` et indiquer que la base est injoignable. Attendez que la base soit de nouveau opérationnelle après son redémarrage.

### Étape 8 — Vérifier Keycloak et PKCE

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/realms/shiku/.well-known/openid-configuration
```

**Objectif :** vérifier que le realm `shiku` sert sa configuration OpenID Connect.
**Résultat attendu :** code HTTP `200`.

Un code `404` peut indiquer que le realm n'a pas été importé. Examinez les journaux de Keycloak.

Lancez ensuite les tests PKCE :

```bash
node --env-file=.env scripts/verifier-pkce.mjs
```

**Objectif :** tester le flux Authorization Code avec PKCE pour les cinq comptes de test et vérifier le rejet de scénarios négatifs : mauvais mot de passe, mauvais `code_verifier`, absence de PKCE et flux direct par mot de passe.
**Résultat attendu :** les contrôles affichent `OK` et le script se termine avec le code `0`.

Ces tests utilisent un client simulé : ils ne remplacent pas un parcours complet dans le navigateur avec le frontend.

### Étape 9 — Exécuter les tests de sécurité PostgreSQL

```bash
pnpm test:db
```

**Objectif :** tester les permissions et les protections d'ajout seul sur une table d'essai, notamment les tentatives de modification ou de suppression et les possibilités d'escalade de privilèges couvertes par la suite de tests.

**Résultat observé lors de la validation locale :** `39 tests réussis`.

Ces tests ne prouvent pas que le journal d'audit est inviolable dans toutes les circonstances. Des limites connues restent à traiter, notamment concernant les privilèges du propriétaire de table, du superutilisateur, la purge et l'horodatage.

Les tests manipulent des données fictives. Ne les exécutez pas contre une base contenant de vraies données.

### Étape 10 — Exécuter la vérification globale (facultatif)

```bash
bash scripts/verifier-pile.sh
```

**Objectif :** rejouer les contrôles automatisés, tester la persistance d'une donnée fictive après un arrêt sans suppression du volume, vérifier le rejeu neutre des migrations et contrôler le retour de Keycloak avec ses comptes.

**Résultat observé le 12 octobre 2026 :** **23 vérifications réussies, 0 échec**, avec le message :

`PILE VALIDÉE de bout en bout (hors navigateur et frontend).`

Ce résultat porte sur la pile locale et les contrôles automatisés du script. Il ne valide pas à lui seul les parcours dans le navigateur ni les fonctionnalités métier.

### Étape 11 — Arrêter les services

Pour arrêter les conteneurs tout en conservant les données :

```bash
docker compose down
```

Pour arrêter les conteneurs et supprimer aussi les volumes, donc les données PostgreSQL locales :

```bash
docker compose down -v
```

**Attention :** la deuxième commande supprime les données stockées dans les volumes. Ne l'utilisez que si vous souhaitez réellement repartir de zéro.

## 4. Interpréter les résultats

| Résultat | Signification | Action recommandée |
|---|---|---|
| Contrôles globaux réussis, 39/39 tests DB, `/sante` HTTP 200 et PKCE réussi | La pile locale est validée dans le périmètre testé, hors navigateur et frontend. | Consignez la date, les versions et le rapport. Documentez aussi les limites restantes. |
| Échec de `docker compose build` lors du téléchargement | Problème possible de réseau, proxy, pare-feu ou registre. | Examinez le message et réessayez lorsque l'accès au registre est disponible. |
| `migrate` termine avec le code `1` | Erreur de migration ou incohérence de configuration possible. | Consultez `docker compose logs migrate`. Ne supprimez pas le volume avant d'avoir identifié la cause. |
| `/sante` renvoie HTTP 503 alors que la base semble démarrée | La base n'est peut-être pas prête, ou la connexion applicative/migration pose problème. | Vérifiez l'état de `db`, les journaux et la configuration sans publier les secrets. |
| La configuration OIDC de Keycloak ne renvoie pas HTTP 200 | Keycloak peut être encore en démarrage ou le realm peut être absent. | Patientez, puis consultez `docker compose logs keycloak`. |
| `pnpm test:db` échoue | Un contrôle de permissions ou de sécurité ne passe pas. | Relevez le nom du test et son message, sans copier de secrets. N'ignorez pas l'échec. |
| `verifier-pile.sh` échoue sur un contrôle isolé | Le contrôle peut révéler un problème de configuration, de service ou de script. | Examinez le premier échec et reproduisez le contrôle concerné avant de conclure. |

### Informations partageables dans un ticket ou une pull request

Vous pouvez partager :
- le bilan du script de validation ;
- les versions des outils ;
- la sortie de `docker compose ps` ;
- les messages d'erreur après vérification qu'ils ne contiennent pas de secrets.

Ne partagez jamais le fichier `.env`, la sortie non filtrée de `docker compose config` ni des journaux non relus.

## 5. Problèmes fréquents sous Windows

| Symptôme | Cause possible | Action recommandée |
|---|---|---|
| `port is already allocated` sur `5432`, `8080` ou `3000` | Un autre service utilise le port. | Vérifiez le service concerné et adaptez `POSTGRES_PORT`, `KEYCLOAK_PORT` ou `APP_PORT` dans `.env` si nécessaire. |
| `bad interpreter` ou erreur liée à `\r` dans `01-roles.sh` | Fins de ligne CRLF dans un script shell. | Vérifiez `.gitattributes` et les fins de ligne du script. |
| `DB_APP_PASSWORD` manquant | `.env` absent ou variable manquante. | Vérifiez la présence et la configuration locale de `.env` sans en partager le contenu. |
| Le backend ne se connecte plus après une modification de `.env` | Les identifiants présents dans le volume peuvent ne pas correspondre à la nouvelle configuration. | Examinez les journaux et la configuration. Ne supprimez le volume qu'après avoir compris les conséquences sur les données. |
| Modifier `realm-shiku.json` n'a aucun effet | L'import peut n'être exécuté qu'à la première création du realm. | Consultez les journaux Keycloak et la procédure prévue pour réinitialiser l'environnement de test. |
| `the input device is not a TTY` | Incompatibilité d'un terminal avec une commande interactive. | Essayez `-T` avec `docker compose exec` lorsque l'interactivité n'est pas nécessaire, ou `winpty` selon le terminal. |
| Un chemin est transformé en `C:/Program Files/Git/...` | Conversion automatique des chemins par Git Bash. | Utilisez `MSYS_NO_PATHCONV=1` uniquement pour la commande concernée si nécessaire. |
| `docker: error during connect` | Docker Desktop ou son moteur n'est pas démarré. | Démarrez Docker Desktop et attendez que le moteur soit opérationnel. |

## 6. Limites et éléments hors périmètre

- **Navigateur et frontend :** les tests automatisés PKCE n'exécutent pas un parcours complet dans le navigateur. Les essais manuels du frontend doivent être documentés séparément.
- **Fonctionnalités métier :** la validation de la pile ne prouve pas que les demandes, décisions, audiences, agendas ou autres modules répondent aux exigences fonctionnelles.
- **Journal d'audit :** les tests actuels ne démontrent pas une inviolabilité absolue face au propriétaire des tables ou au superutilisateur PostgreSQL. Les règles de purge et d'horodatage restent à examiner.
- **Keycloak en production :** l'environnement testé utilise `start-dev` (HTTP et paramètres de développement). La configuration de Staging et de Production relève d'un travail distinct, notamment au regard de `DEC-07` et `DEC-09`.
- **T0-40 :** la validation locale documentée ici ne remplace pas les critères de gouvernance ni la dépendance à `T0-02` mentionnée plus haut.
