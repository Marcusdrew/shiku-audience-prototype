-- Up Migration
-- T0-38 : première version du schéma. Le modèle d'utilisateur nominatif existe dès le départ.
-- Données fictives uniquement. Les privilèges par rôle sont posés par T0-33 (migration suivante).

CREATE TABLE organisation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        text NOT NULL,
  cree_le    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE utilisateur (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  keycloak_sub     text NOT NULL UNIQUE,   -- identifiant de la personne dans Keycloak
  nom_complet      text NOT NULL,          -- une personne physique, jamais un compte partagé (ENF03-13)
  actif            boolean NOT NULL DEFAULT true,
  cree_le          timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE utilisateur;
DROP TABLE organisation;
