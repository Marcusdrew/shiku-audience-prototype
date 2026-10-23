# Parcours de validation dans le navigateur (de la connexion à la clôture)

But : vérifier à la main, dans un vrai navigateur, le parcours complet du prototype avec chaque rôle, sur votre installation locale. Données **fictives** uniquement ; les entrées de journal créées restent en base (journal en ajout seul).

Cochez chaque ligne ; à la première différence, notez l'écran, le rôle, l'heure et le message affiché, et arrêtez-vous.

## 0. Préparation (une fois)

Dans PowerShell, à la racine du dépôt :

| # | Commande | Résultat attendu |
|---|---|---|
| 0.1 | `docker compose up -d --build` | `db` en état *healthy* ; `keycloak`, `app` démarrés |
| 0.2 | `& "<dossier de Git>\bin\bash.exe" scripts/octroyer-droits-audit.sh` | « déjà présent » ou « créé » (voir `JOURNAL.md`) |
| 0.3 | `node --env-file=.env scripts/verifier-compte-service.mjs` | pas de « ABSENT » ; sinon étape 0.4 |
| 0.4 | `node --env-file=.env scripts/configurer-compte-service.mjs` puis `… --appliquer` | « fait : créer le client shiku-service » (voir `COMPTES-KEYCLOAK.md`) ; puis `docker compose restart app` |
| 0.4 bis | `node --env-file=.env scripts/aligner-comptes-test.mjs` (puis `--appliquer` si « À FAIRE ») | 5 lignes `OK` : les comptes de test acceptent les mots de passe de `.env` (voir `COMPTES-KEYCLOAK.md`) |
| 0.5 | `node --env-file=.env scripts/amorcer-donnees-test.mjs` | « OK : organisation …, 5 comptes rattachés, 2 agendas » |
| 0.6 | `node --env-file=.env scripts/verifier-parcours.mjs` | 30 lignes `OK`, puis `RESULTAT : TOUT OK` (parcours par l'API, sans navigateur) |
| 0.7 | `pnpm dev:frontend` | Vite écoute sur `http://localhost:5173` |

Si Keycloak n'écoute pas sur le port 8080 (`KEYCLOAK_PORT` de `.env`), créez `frontend/.env.local` avec `VITE_KEYCLOAK_URL=http://localhost:<KEYCLOAK_PORT>` avant 0.7. Le frontend appelle l'API par `/api` (proxy Vite vers `APP_PORT`).

**Comptes de test** (mots de passe : variables `KC_PASSWORD_*` de `.env` ; sur un realm créé avec une version antérieure, ce sont ceux de sa création) :

| Compte | Rôle | Variable |
|---|---|---|
| `reception.test` | Réception | `KC_PASSWORD_RECEPTION` |
| `assistant1.test` | Assistant | `KC_PASSWORD_ASSISTANT1` |
| `authority.test` | Autorité | `KC_PASSWORD_AUTHORITY` |
| `admin.test` | Administrateur | `KC_PASSWORD_ADMIN` |

Utilisez une **fenêtre de navigation privée par rôle** (ou « Se déconnecter » entre deux rôles) : une session Keycloak ouverte reconnecterait le compte précédent.

## 1. Réception (`reception.test`)

| # | Action | Résultat attendu |
|---|---|---|
| 1.1 | Ouvrir `http://localhost:5173`, « Se connecter », saisir le compte | Retour sur l'application, « Tableau de bord », API et base « ok », compte applicatif « Actif » |
| 1.2 | Menu | Demandes, Agendas, Répertoire des visiteurs ; **ni** Décisions, **ni** Journal, **ni** Administration |
| 1.3 | Répertoire des visiteurs : avant toute recherche | Message « Recherchez d'abord le visiteur » ; pas de formulaire de création |
| 1.4 | Rechercher un nom inexistant, puis créer la fiche (nom, contact) | Fiche créée ; **aucun champ « Qualité / fonction »** (note : saisie par l'Assistant) |
| 1.5 | Demandes → « Créer une demande » → rechercher ce visiteur → « Choisir » ; choisir un agenda, un objet, un contact → « Enregistrer la demande » | Fiche de la demande `DEM-AAAA-NNNNNN`, statut « Reçue » |
| 1.6 | Sur la fiche : « Qualification initiale », saisir un texte → « Qualifier » | Statut « Qualifiée » ; **aucun** bouton Valider / Rejeter / Différer |
| 1.7 | Noter l'adresse de la fiche (URL) | Elle servira aux autres rôles |

## 2. Autorité (`authority.test`)

| # | Action | Résultat attendu |
|---|---|---|
| 2.1 | Se connecter ; menu | Demandes, Décisions, Agendas, Opérations du jour, Répertoire des visiteurs, Journal ; pas d'Administration |
| 2.2 | Décisions | La demande figure dans la file (ordre chronologique ; la priorité à six critères n'existe pas) |
| 2.3 | Ouvrir la fiche ; sans motif | Boutons Valider, Rejeter, Différer **inactifs** |
| 2.4 | Saisir un motif → « Valider » | Décision listée (« Validée par … ») ; carte « Planifier l'audience » |
| 2.5 | Début prévu = aujourd'hui, dans quelques minutes ; durée 30 → « Planifier » | Carte « Audience » : statut « Planifiée », responsable de suivi de l'audience = l'Autorité |
| 2.6 | Agendas → période incluant aujourd'hui | L'audience apparaît dans le planning |

## 3. Assistant (`assistant1.test`)

| # | Action | Résultat attendu |
|---|---|---|
| 3.1 | Se connecter ; ouvrir la fiche de la demande | **Aucun** bouton de décision ni de planification (droits « D » sans délégation) |
| 3.2 | Opérations du jour | L'audience du jour avec « Démarrer » |
| 3.3 | « Démarrer » | Statut « En cours », champ « Résultat » |
| 3.4 | Saisir un résultat → « Terminer » | Statut « Terminée » |
| 3.5 | Fiche de la demande → « Clôturer » | Encadré « La clôture est **irréversible** … » avec « Confirmer la clôture » et « Annuler » ; rien n'est encore envoyé |
| 3.6 | « Confirmer la clôture » | Statut « Clôturée » ; durée réelle ; « Clôturée le, conservation jusqu'au » = date + 5 ans |
| 3.7 | Journal (menu) | Absent du menu ; l'adresse `/journal` saisie à la main affiche une erreur d'accès (403 du serveur) |

## 4. Contrôles complémentaires

| # | Rôle | Action | Résultat attendu |
|---|---|---|---|
| 4.1 | Réception | Rouvrir la fiche clôturée | Statut « Clôturée » ; ni décisions, ni audience, ni bouton « Clôturer » |
| 4.2 | Autorité | Créer une 2ᵉ demande (ou en prendre une « Reçue »), saisir un motif → « Rejeter » | Statut « Rejetée » chez l'Autorité |
| 4.3 | Réception | Ouvrir cette demande ; filtre de statut de la liste | « Non retenue — ne pas planifier », sans motif ni auteur ; le filtre ne propose pas « Rejetée » |
| 4.4 | Autorité | Journal → filtre « audience » | Entrées `audience.planifier`, `audience.demarrer`, `audience.terminer`, `audience.cloturer` avec leur auteur |
| 4.5 | Administrateur (`admin.test`) | Menu | Agendas, Administration (et tableau de bord) ; ni Demandes, ni Journal |
| 4.6 | Administrateur | Administration → « Créer un compte » | Rôles proposés : Réception, Assistant **seulement** ; création d'un compte fictif `…@example.test` → il apparaît dans la liste (exige l'étape 0.4) |
| 4.7 | Administrateur | Agendas → créer un agenda fictif | Agenda ajouté |
| 4.8 | Tous | Console du navigateur (F12) | Aucune erreur JavaScript |

Le compte créé en 4.6 n'a pas de mot de passe : sans serveur de courriel, il se définit dans la console Keycloak (limite connue, `COMPTES-KEYCLOAK.md`).

## Ce qui est hors du parcours (non développé ou en attente de décision)

Salle d'attente et appel des visiteurs, annulation et reprogrammation, délégations, dossier relationnel (notes, attestations), priorité à six critères, indicateurs du tableau de bord, restrictions du journal par catégorie (Q-1), périmètre de l'Autorité (Q-10), réinitialisation de mot de passe (Q-6 à Q-8). Voir `ETAT-FONCTIONNEL.md` et `HYPOTHESES.md`.

## Déjà exécuté par l'assistant (environnement Linux, pas votre poste)

Le 22/10/2026, sur PostgreSQL 16 jetable, un Keycloak 26.8.0 jetable démarré avec le realm de `d7c7b36` puis mis à niveau par `configurer-compte-service.mjs` (et réduit à Réception et Assistant), le vrai backend et Vite :
- `verifier-parcours.mjs` : 30 contrôles OK ;
- les étapes 1.1, 1.5, 1.6, 2.3 à 2.5, 3.2 à 3.6, 4.1, 4.4 (clôture), 4.5 et 4.6 (rôles proposés) dans un vrai Chromium (connexion PKCE par l'écran, un contexte par rôle) : toutes conformes, aucune erreur JavaScript.

## Exécuté sur le poste du développeur (Windows)

Le 22/10/2026, sous Windows, Node 24, Docker Desktop, PostgreSQL 18 et Keycloak 26.8.0 (realm existant, rattrapé par les étapes 0.2 à 0.4 bis) :
- étapes 0.1 à 0.7 : conformes ; `verifier-parcours.mjs` : 30 contrôles OK, code de sortie 0 ;
- parcours à la main dans le navigateur (Microsoft Edge), un rôle à la fois : sections 1 à 4 conformes selon le développeur, console sans erreur (4.8) ;
- trace en base (journal, entre 12:41 et 13:07, heure de Kinshasa) : création du visiteur, de la demande et qualification par la Réception ; validation et planification par l'Autorité ; démarrage, fin et clôture par l'Assistant 1 ; seconde demande rejetée par l'Autorité ; agenda créé par l'Administrateur ;
- 4.6 : liste des rôles proposés contrôlée à l'écran ; la création d'un compte par l'application n'apparaît pas dans le journal de ce parcours (elle est couverte par `verifier-parcours.mjs`).

Les étapes sans écriture (menus par rôle, statut « Non retenue » chez la Réception, refus d'accès au journal pour l'Assistant, encadré de confirmation de la clôture) n'ont pas de trace en base : seul le constat à l'écran les atteste.
