-- Up Migration
-- Lot 1 : demandes d'audience (US-05-037, US-05-038, US-05-039).
-- HYPOTHESE H3 : référence DEM-AAAA-NNNNNN, compteur par organisation et par année. Proposition en
-- attente de validation, non une décision.
-- Statuts : recue → qualifiee → (validee | rejetee | differee) → planifiee → realisee → cloturee.
-- Les transitions sont contrôlées par l'application ; la base borne seulement les valeurs.

CREATE TABLE compteur_reference (
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  annee            integer NOT NULL,
  dernier          integer NOT NULL DEFAULT 0 CHECK (dernier >= 0),
  PRIMARY KEY (organisation_id, annee)
);

CREATE TABLE demande (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid NOT NULL REFERENCES organisation(id),
  reference               text NOT NULL,
  visiteur_id             uuid NOT NULL REFERENCES visiteur(id),
  agenda_id               uuid NOT NULL REFERENCES agenda(id),
  objet                   text NOT NULL CHECK (length(btrim(objet)) > 0),
  contact                 text,
  derogation              text,     -- justification de l'absence de contact (EF03-04)
  statut                  text NOT NULL DEFAULT 'recue'
                          CHECK (statut IN ('recue','qualifiee','differee','validee','rejetee',
                                            'planifiee','realisee','cloturee')),
  qualification_initiale  text,
  qualifiee_par           uuid REFERENCES utilisateur(id),
  qualifiee_le            timestamptz,
  responsable_suivi_id    uuid NOT NULL REFERENCES utilisateur(id),
  cree_par                uuid NOT NULL REFERENCES utilisateur(id),
  cree_le                 timestamptz NOT NULL DEFAULT now(),
  modifie_le              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, reference),
  -- « Nom, objet, agenda ou Autorité et contact sont requis, sauf dérogation justifiée. »
  CONSTRAINT demande_contact_ou_derogation
    CHECK ((contact IS NOT NULL AND length(btrim(contact)) > 0)
        OR (derogation IS NOT NULL AND length(btrim(derogation)) > 0))
);
CREATE INDEX demande_org_statut_idx ON demande (organisation_id, statut, cree_le);

REVOKE ALL ON compteur_reference, demande FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON compteur_reference, demande TO shiku_app;

-- Down Migration
DROP TABLE demande;
DROP TABLE compteur_reference;
