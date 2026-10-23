-- Up Migration
-- Lot L6 (réponses de M. Jordan du 22/10/2026, priorité et DEC-37) : six critères saisis comme des
-- valeurs structurées, tous visibles ; niveau de priorité fixé par l'Autorité (ou l'Assistant sous
-- délégation, inactive) ; AUCUNE formule de pondération (la grille sera définie plus tard, versionnée).
-- Critères : agenda (déjà porté par la demande), rang protocolaire, urgence, importance stratégique,
-- relation, chronologie (date de création, déjà portée par la demande).
--
-- HYPOTHESE(DEC-37) : listes provisoires à trois niveaux, à remplacer par les valeurs fixées avec
-- l'Autorité ; le rang protocolaire devra venir des catégories protocolaires (US-05-040, non faite).
-- Le référentiel est une configuration commune (pas une donnée d'une organisation) : modifiable en
-- base, sans écran d'administration pour l'instant.

CREATE TABLE priorite_referentiel (
  critere  text NOT NULL CHECK (critere IN ('niveau', 'rang_protocolaire', 'urgence',
                                            'importance_strategique', 'relation')),
  code     text NOT NULL CHECK (code ~ '^[a-z_]+$'),
  libelle  text NOT NULL CHECK (length(btrim(libelle)) > 0),
  rang     integer NOT NULL CHECK (rang > 0),   -- ordre d'affichage ; pour « niveau », ordre de tri
  actif    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (critere, code),
  UNIQUE (critere, rang)
);
INSERT INTO priorite_referentiel (critere, code, libelle, rang) VALUES
  ('niveau', 'normale', 'Normale', 1),
  ('niveau', 'elevee', 'Élevée', 2),
  ('niveau', 'critique', 'Critique', 3),
  ('rang_protocolaire', 'standard', 'Rang standard', 1),
  ('rang_protocolaire', 'eleve', 'Rang élevé', 2),
  ('rang_protocolaire', 'tres_eleve', 'Rang très élevé', 3),
  ('urgence', 'normale', 'Normale', 1),
  ('urgence', 'elevee', 'Élevée', 2),
  ('urgence', 'critique', 'Critique', 3),
  ('importance_strategique', 'normale', 'Normale', 1),
  ('importance_strategique', 'elevee', 'Élevée', 2),
  ('importance_strategique', 'critique', 'Critique', 3),
  ('relation', 'normale', 'Normale', 1),
  ('relation', 'elevee', 'Élevée', 2),
  ('relation', 'critique', 'Critique', 3);

ALTER TABLE demande
  ADD COLUMN rang_protocolaire      text,
  ADD COLUMN urgence                text,
  ADD COLUMN importance_strategique text,
  ADD COLUMN relation               text,
  ADD COLUMN criteres_saisis_par    uuid REFERENCES utilisateur(id),
  ADD COLUMN criteres_saisis_le     timestamptz,
  ADD COLUMN priorite               text,
  ADD COLUMN priorite_justification text,
  ADD COLUMN priorite_fixee_par     uuid REFERENCES utilisateur(id),
  ADD COLUMN priorite_fixee_le      timestamptz,
  ADD CONSTRAINT demande_priorite_auteur
    CHECK (priorite IS NULL OR (priorite_fixee_par IS NOT NULL AND priorite_fixee_le IS NOT NULL));

REVOKE ALL ON priorite_referentiel FROM PUBLIC;
GRANT SELECT ON priorite_referentiel TO shiku_app;   -- lecture seule pour l'application

-- Down Migration
ALTER TABLE demande
  DROP CONSTRAINT demande_priorite_auteur,
  DROP COLUMN priorite_fixee_le,
  DROP COLUMN priorite_fixee_par,
  DROP COLUMN priorite_justification,
  DROP COLUMN priorite,
  DROP COLUMN criteres_saisis_le,
  DROP COLUMN criteres_saisis_par,
  DROP COLUMN relation,
  DROP COLUMN importance_strategique,
  DROP COLUMN urgence,
  DROP COLUMN rang_protocolaire;
DROP TABLE priorite_referentiel;
