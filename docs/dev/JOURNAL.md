# Journal d'audit : ce qui est protégé, et ce qui ne l'est pas

Le journal (`journal`, migration `1760000200000`) est **protégé contre la modification et la suppression par l'application, y compris sous le compte d'un administrateur applicatif**, au niveau de PostgreSQL. Il n'est **pas** présenté comme inaltérable de façon absolue (ENF03-11, ADR-ARCH-007).

## Mécanismes

1. Le rôle applicatif `shiku_app` n'a que `SELECT` et `INSERT` (ni `UPDATE`, `DELETE` ni `TRUNCATE`). Un administrateur applicatif n'est qu'un compte de l'application : il n'a pas d'autre droit en base.
2. Un déclencheur `BEFORE UPDATE` et un déclencheur `BEFORE TRUNCATE` refusent toute modification, même si un rôle recevait le droit par erreur.
3. Un déclencheur `BEFORE INSERT` impose l'horodatage `clock_timestamp()` du serveur de base : l'application ne choisit pas la date (limite L5 de `PREUVES-AJOUT-SEUL.md` levée pour cette table).
4. Chaque entrée est écrite dans la **même transaction** que l'acte (tout ou rien) et attribuée à un compte nominatif (`utilisateur_id NOT NULL`).
5. Aucune route HTTP ne modifie ni ne supprime le journal ; `GET /journal` est en lecture seule.
6. Le contenu journalisé se limite à des identifiants, noms de champs modifiés et décisions : pas de texte libre sensible (une entrée ne peut pas être purgée avant 6 ans).

## Limites connues (non levées)

- Le propriétaire du schéma (`shiku_migrator`) et le superutilisateur PostgreSQL peuvent désactiver les déclencheurs, modifier ou supprimer des lignes (L1, L2). Ce sont des comptes d'exploitation, hors application.
- Le rôle `shiku_purge` peut supprimer des lignes sans borne d'ancienneté (L3) : la règle des 6 ans (module de conservation) n'est pas développée.
- Aucune chaîne de hachage ni copie externe : une altération faite en tant que propriétaire ne serait pas détectée.
- Aucune alerte en cas d'accès au journal (non développée).
- Seules les actions listées dans `API.md` écrivent au journal. Les consultations de données ne sont pas journalisées.

## Preuves exécutées

`backend/test/db/api-metier.spec.ts` (groupe « journal d'audit ») : refus `UPDATE/DELETE/TRUNCATE` par la base pour `shiku_app` (code 42501), déclencheurs actifs même pour le superutilisateur sans les désactiver, horodatage serveur, atomicité acte + journal, absence de route d'écriture. Exécutés sur PostgreSQL 16 (voir `ETAT-FONCTIONNEL.md`).
