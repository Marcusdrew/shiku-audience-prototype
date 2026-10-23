-- Up Migration
-- Lot 2 (US-05-010 / US-05-011) : journal d'audit, AJOUT SEUL garanti PAR LA BASE (motif de T0-33).
-- Données fictives uniquement. Limites connues : docs/dev/PREUVES-AJOUT-SEUL.md (L1 à L5) et
-- docs/dev/JOURNAL.md. Ce n'est PAS une inaltérabilité absolue : le propriétaire du schéma et le
-- superutilisateur PostgreSQL gardent la possibilité technique de contourner ces protections.

CREATE TABLE journal (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  utilisateur_id   uuid NOT NULL REFERENCES utilisateur(id),   -- auteur nominatif (ENF03-13)
  horodatage       timestamptz NOT NULL DEFAULT clock_timestamp(),
  action           text NOT NULL CHECK (length(btrim(action)) > 0),
  objet_type       text NOT NULL CHECK (length(btrim(objet_type)) > 0),
  objet_id         uuid,
  contexte         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX journal_objet_idx ON journal (organisation_id, objet_type, objet_id);
CREATE INDEX journal_horodatage_idx ON journal (organisation_id, horodatage DESC);

REVOKE ALL ON journal FROM PUBLIC;
GRANT SELECT, INSERT ON journal TO shiku_app;           -- ni UPDATE ni DELETE pour l'application
GRANT SELECT, DELETE ON journal TO shiku_purge;         -- purge à l'échéance seulement (D04-10)
GRANT USAGE ON SEQUENCE journal_id_seq TO shiku_app;

-- Ceintures : même un rôle qui obtiendrait UPDATE ne pourrait pas modifier une entrée, et l'horodatage
-- est toujours celui du serveur de base (l'application ne peut pas choisir la date, limite L5).
CREATE FUNCTION journal_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'journal est en ajout seul (ENF03-11)';
END;
$$;
CREATE TRIGGER journal_sans_update
  BEFORE UPDATE ON journal FOR EACH ROW EXECUTE FUNCTION journal_refuser_modification();
CREATE TRIGGER journal_sans_truncate
  BEFORE TRUNCATE ON journal FOR EACH STATEMENT EXECUTE FUNCTION journal_refuser_modification();

CREATE FUNCTION journal_horodatage_serveur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.horodatage := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_horodatage
  BEFORE INSERT ON journal FOR EACH ROW EXECUTE FUNCTION journal_horodatage_serveur();

-- Down Migration
DROP TABLE journal;
DROP FUNCTION journal_horodatage_serveur();
DROP FUNCTION journal_refuser_modification();
