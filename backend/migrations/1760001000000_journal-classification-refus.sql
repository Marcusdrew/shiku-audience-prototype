-- Up Migration
-- Lot L2 (réponses de M. Jordan du 22 et du 23/10/2026, Q-1 et DEC-38, acte ACTE-DEC-38, signature
-- attendue) : classification du journal, refus sensibles, auteur « système », récapitulatif des purges.
-- Aucune entrée existante n'est modifiée : les colonnes ajoutées ont une valeur par défaut (opération
-- de catalogue, les déclencheurs d'ajout seul ne sont pas sollicités).
--
-- La CATÉGORIE n'est pas une colonne : elle se déduit de l'action par l'énumération fermée du code
-- (backend/src/journal/categories.ts), y compris pour les entrées déjà écrites.

-- ── 1. Attributs d'une entrée ──────────────────────────────────────────────────────────────────
ALTER TABLE journal
  -- HYPOTHESE(DEC-38), point 1 e : refus d'une action sensible, journalisé avec « refuse ».
  ADD COLUMN resultat text NOT NULL DEFAULT 'accepte' CHECK (resultat IN ('accepte', 'refuse')),
  -- Q-1 : « exécutée sous délégation » est un attribut, pas une catégorie. Toujours faux tant que
  -- les délégations n'existent pas (Sprint 2).
  ADD COLUMN sous_delegation boolean NOT NULL DEFAULT false,
  -- HYPOTHESE(DEC-38), point 1 c : l'initialisation est écrite au nom du « système », nommé comme tel.
  ADD COLUMN auteur text NOT NULL DEFAULT 'utilisateur' CHECK (auteur IN ('utilisateur', 'systeme'));
ALTER TABLE journal ALTER COLUMN utilisateur_id DROP NOT NULL;
-- Une personne OU le système, jamais aucun des deux ; l'application écrit toujours une personne.
ALTER TABLE journal ADD CONSTRAINT journal_auteur_coherent
  CHECK ((auteur = 'utilisateur') = (utilisateur_id IS NOT NULL));
CREATE INDEX journal_action_idx ON journal (organisation_id, action, id DESC);

-- ── 2. Regroupement des refus répétés (point 1 e) ───────────────────────────────────────────────
-- Compteur par utilisateur et action tentée : une seule entrée de journal par fenêtre. Ce compteur
-- n'est PAS le journal (il est mis à jour) ; il ne contient que des identifiants et des nombres.
CREATE TABLE journal_refus_regroupe (
  organisation_id uuid NOT NULL REFERENCES organisation(id),
  utilisateur_id  uuid NOT NULL REFERENCES utilisateur(id),
  action          text NOT NULL,
  fenetre_debut   timestamptz NOT NULL DEFAULT now(),
  nombre          integer NOT NULL DEFAULT 1 CHECK (nombre > 0),
  precedents      integer CHECK (precedents > 0),   -- refus de la fenêtre précédente
  PRIMARY KEY (organisation_id, utilisateur_id, action)
);
REVOKE ALL ON journal_refus_regroupe FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON journal_refus_regroupe TO shiku_app;

-- ── 3. Récapitulatif des purges par organisation et par action (point 1 f) ─────────────────────
-- La catégorie se déduit de l'action dans l'application. Les purges antérieures n'ont pas ce détail.
ALTER TABLE journal_purge ADD COLUMN par_organisation jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION journal_tracer_purge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp AS $$
DECLARE
  n integer; ancienne timestamptz; recente timestamptz; detail jsonb;
BEGIN
  SELECT count(*), min(horodatage), max(horodatage) INTO n, ancienne, recente FROM supprimees;
  IF n > 0 THEN
    SELECT coalesce(jsonb_object_agg(o.organisation_id::text, jsonb_build_object(
             'entrees', o.n, 'plus_ancienne', o.ancienne, 'plus_recente', o.recente,
             'par_action', o.par_action)), '{}'::jsonb)
      INTO detail
      FROM (SELECT s.organisation_id, count(*) AS n, min(s.horodatage) AS ancienne,
                   max(s.horodatage) AS recente,
                   (SELECT jsonb_object_agg(a.action, a.n)
                      FROM (SELECT action, count(*) AS n FROM supprimees
                             WHERE organisation_id = s.organisation_id GROUP BY action) a) AS par_action
              FROM supprimees s GROUP BY s.organisation_id) o;
    INSERT INTO journal_purge (role_base, entrees_supprimees, plus_ancienne, plus_recente,
                               par_organisation)
    VALUES (session_user, n, ancienne, recente, detail);
  END IF;
  RETURN NULL;
END;
$$;

-- ── 4. Rattachement initial au nom du « système » (point 1 c) ──────────────────────────────────
-- Une ligne posée par l'initialisation n'a ni proposant ni applicateur humain.
ALTER TABLE rattachement_agenda ALTER COLUMN propose_par DROP NOT NULL;
ALTER TABLE rattachement_agenda ADD CONSTRAINT rattachement_agenda_proposant
  CHECK (propose_par IS NOT NULL OR source = 'initialisation_systeme');
-- Contrainte anonyme de la migration 1760000800000 (« actif ⇒ applicateur ») : retrouvée par sa
-- définition plutôt que par son nom généré, puis remplacée par une contrainte nommée.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'rattachement_agenda'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%applique_par IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE rattachement_agenda DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE rattachement_agenda ADD CONSTRAINT rattachement_agenda_actif_applique
  CHECK (statut <> 'actif' OR (applique_le IS NOT NULL
                               AND (applique_par IS NOT NULL OR source = 'initialisation_systeme')));

-- Down Migration
-- Échoue s'il existe déjà des entrées ou des rattachements au nom du « système » : le journal est en
-- ajout seul, ces entrées ne peuvent pas être réécrites.
ALTER TABLE rattachement_agenda DROP CONSTRAINT rattachement_agenda_actif_applique;
ALTER TABLE rattachement_agenda ADD CONSTRAINT rattachement_agenda_check2
  CHECK (statut <> 'actif' OR (applique_par IS NOT NULL AND applique_le IS NOT NULL));
ALTER TABLE rattachement_agenda DROP CONSTRAINT rattachement_agenda_proposant;
ALTER TABLE rattachement_agenda ALTER COLUMN propose_par SET NOT NULL;
CREATE OR REPLACE FUNCTION journal_tracer_purge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp AS $$
DECLARE
  n integer; ancienne timestamptz; recente timestamptz;
BEGIN
  SELECT count(*), min(horodatage), max(horodatage) INTO n, ancienne, recente FROM supprimees;
  IF n > 0 THEN
    INSERT INTO journal_purge (role_base, entrees_supprimees, plus_ancienne, plus_recente)
    VALUES (session_user, n, ancienne, recente);
  END IF;
  RETURN NULL;
END;
$$;
ALTER TABLE journal_purge DROP COLUMN par_organisation;
DROP TABLE journal_refus_regroupe;
DROP INDEX journal_action_idx;
ALTER TABLE journal DROP CONSTRAINT journal_auteur_coherent;
ALTER TABLE journal ALTER COLUMN utilisateur_id SET NOT NULL;
ALTER TABLE journal DROP COLUMN auteur, DROP COLUMN sous_delegation, DROP COLUMN resultat;
