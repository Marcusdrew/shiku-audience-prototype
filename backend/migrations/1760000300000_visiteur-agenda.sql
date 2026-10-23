-- Up Migration
-- Lot 1 : visiteurs (US-05-029) et agendas (US-05-024). Clé d'organisation obligatoire (EF03-01).
-- Données fictives uniquement. Pas de DELETE pour l'application : la suppression relève de la
-- conservation (module à venir) et du rôle de purge.

CREATE TABLE visiteur (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  nom_complet      text NOT NULL CHECK (length(btrim(nom_complet)) > 0),
  contact          text,
  qualite          text,            -- qualification (fonction, titre) : texte libre, HYPOTHESE H12
  cree_par         uuid NOT NULL REFERENCES utilisateur(id),
  cree_le          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visiteur_org_nom_idx ON visiteur (organisation_id, lower(nom_complet));

CREATE TABLE agenda (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  nom              text NOT NULL CHECK (length(btrim(nom)) > 0),
  actif            boolean NOT NULL DEFAULT true,
  cree_par         uuid NOT NULL REFERENCES utilisateur(id),
  cree_le          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, nom)
);

REVOKE ALL ON visiteur, agenda FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON visiteur, agenda TO shiku_app;

-- Down Migration
DROP TABLE agenda;
DROP TABLE visiteur;
