-- Up Migration
-- Lot 3 : décisions (US-05-043, US-05-044, US-05-046) et audiences (US-05-047, US-05-056).
-- Une décision est un fait daté : l'application ne peut ni la modifier ni la supprimer (pas de
-- UPDATE/DELETE accordé). Un report suivi d'une validation produit deux lignes (historique conservé).
-- Rattachement explicite et navigable à la demande par clé étrangère (US-05-046).

CREATE TABLE decision (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  demande_id       uuid NOT NULL REFERENCES demande(id),
  type             text NOT NULL CHECK (type IN ('valider','rejeter','differer')),
  motif            text NOT NULL CHECK (length(btrim(motif)) > 0),
  decide_par       uuid NOT NULL REFERENCES utilisateur(id),
  decide_le        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_demande_idx ON decision (demande_id, decide_le);

-- HYPOTHESE H13 : une seule audience par demande à ce stade (reprogrammation et annulation non
-- développées). UNIQUE(demande_id) sera levée si le métier retient plusieurs audiences par demande.
CREATE TABLE audience (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL REFERENCES organisation(id),
  demande_id             uuid NOT NULL UNIQUE REFERENCES demande(id),
  agenda_id              uuid NOT NULL REFERENCES agenda(id),
  debut_prevu            timestamptz NOT NULL,
  duree_prevue_minutes   integer NOT NULL CHECK (duree_prevue_minutes > 0),
  responsable_suivi_id   uuid NOT NULL REFERENCES utilisateur(id),
  statut                 text NOT NULL DEFAULT 'planifiee'
                         CHECK (statut IN ('planifiee','en_cours','terminee','cloturee')),
  debut_reel             timestamptz,
  fin_reel               timestamptz,
  resultat               text,
  cloturee_par           uuid REFERENCES utilisateur(id),
  cloturee_le            timestamptz,
  conservation_echeance  date,     -- clôture + 5 ans (D03-06, D04-06) ; purge non développée
  cree_par               uuid NOT NULL REFERENCES utilisateur(id),
  cree_le                timestamptz NOT NULL DEFAULT now(),
  CHECK (fin_reel IS NULL OR (debut_reel IS NOT NULL AND fin_reel >= debut_reel))
);
CREATE INDEX audience_planning_idx ON audience (organisation_id, agenda_id, debut_prevu);

REVOKE ALL ON decision, audience FROM PUBLIC;
GRANT SELECT, INSERT ON decision TO shiku_app;
GRANT SELECT, INSERT, UPDATE ON audience TO shiku_app;

-- Down Migration
DROP TABLE audience;
DROP TABLE decision;
