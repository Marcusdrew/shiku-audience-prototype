-- Up Migration
-- Lot L4 (réponses de M. Jordan du 22/10/2026, Q-10 et point 7) : périmètre de l'Autorité.
-- Règle provisoire HYPOTHESE(DEC-32) : un agenda est rattaché à une ou plusieurs Autorités, pour une
-- période. L'Autorité AUTORISE, l'Administrateur APPLIQUE : deux étapes tracées dans l'application.
-- Un agenda sans rattachement actif : décisions et suivi refusés, consultation ouverte (file
-- « à rattacher »). Aucune donnée existante n'est modifiée : le rattachement initial est posé par la
-- donnée de déploiement (scripts/amorcer-donnees-test.mjs), journalisé « initialisation système ».
--
-- Cycle : propose (par l'Administrateur) → autorise (par l'Autorité désignée) → actif (appliqué par
-- l'Administrateur) ; revoque (par l'Autorité) à tout moment. Une ligne n'est jamais supprimée.

CREATE TABLE rattachement_agenda (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisation(id),
  agenda_id        uuid NOT NULL REFERENCES agenda(id),
  autorite_id      uuid NOT NULL REFERENCES utilisateur(id),
  debut            date NOT NULL DEFAULT current_date,
  fin              date,
  statut           text NOT NULL DEFAULT 'propose'
                   CHECK (statut IN ('propose', 'autorise', 'actif', 'revoque')),
  propose_par      uuid NOT NULL REFERENCES utilisateur(id),
  propose_le       timestamptz NOT NULL DEFAULT now(),
  autorise_par     uuid REFERENCES utilisateur(id),
  autorise_le      timestamptz,
  applique_par     uuid REFERENCES utilisateur(id),
  applique_le      timestamptz,
  revoque_par      uuid REFERENCES utilisateur(id),
  revoque_le       timestamptz,
  -- « initialisation_systeme » : donnée initiale de déploiement (point 7 de M. Jordan), sans
  -- autorisation individuelle ; journalisée comme telle par le script d'amorçage.
  source           text NOT NULL DEFAULT 'application'
                   CHECK (source IN ('application', 'initialisation_systeme')),
  CHECK (fin IS NULL OR fin >= debut),
  -- Chaque étape a son auteur et sa date ; l'application ne peut pas sauter une étape.
  CHECK (statut IN ('propose', 'revoque') OR source = 'initialisation_systeme'
         OR (autorise_par IS NOT NULL AND autorise_le IS NOT NULL)),
  CHECK (statut <> 'actif' OR (applique_par IS NOT NULL AND applique_le IS NOT NULL)),
  CHECK (statut <> 'revoque' OR (revoque_par IS NOT NULL AND revoque_le IS NOT NULL))
);
-- Une seule demande en cours (proposée, autorisée ou active) par couple agenda et Autorité.
CREATE UNIQUE INDEX rattachement_agenda_en_cours_uniq
  ON rattachement_agenda (agenda_id, autorite_id) WHERE statut IN ('propose', 'autorise', 'actif');
CREATE INDEX rattachement_agenda_org_agenda_idx ON rattachement_agenda (organisation_id, agenda_id);

REVOKE ALL ON rattachement_agenda FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON rattachement_agenda TO shiku_app;   -- ni DELETE : historique conservé

-- Down Migration
DROP TABLE rattachement_agenda;
