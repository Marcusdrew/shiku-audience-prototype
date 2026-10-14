-- Motif « ajout seul garanti par la base » (T0-33), appliqué à une TABLE D'ESSAI.
-- Ce motif sera repris tel quel par la migration du vrai journal (US-05-010 / US-05-011, Sprint 1).
CREATE TABLE essai_ajout_seul (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  utilisateur_id   uuid REFERENCES utilisateur(id),
  horodatage       timestamptz NOT NULL DEFAULT now(),
  action           text NOT NULL,
  objet            text,
  contexte         jsonb NOT NULL DEFAULT '{}'::jsonb
);

REVOKE ALL ON essai_ajout_seul FROM PUBLIC;
GRANT SELECT, INSERT ON essai_ajout_seul TO shiku_app;
GRANT SELECT, DELETE ON essai_ajout_seul TO shiku_purge;
GRANT USAGE ON SEQUENCE essai_ajout_seul_id_seq TO shiku_app;

CREATE FUNCTION refuser_modification_essai() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'essai_ajout_seul est en ajout seul (ENF03-11)';
END;
$$;
CREATE TRIGGER essai_ajout_seul_sans_update
  BEFORE UPDATE ON essai_ajout_seul
  FOR EACH ROW EXECUTE FUNCTION refuser_modification_essai();
