-- Up Migration
-- Lot 2 (audit du 14/10/2026) : purge encadrée du journal, identité nominative, rôle de lecture d'audit.
-- Données fictives uniquement. Limites : docs/dev/JOURNAL.md (le propriétaire du schéma et le
-- superutilisateur PostgreSQL gardent la possibilité technique de contourner ces protections).

-- ── 1. Identité : un nom vide ou fait d'espaces est refusé PAR LA BASE (US-05-002) ───────────────
ALTER TABLE utilisateur
  ADD CONSTRAINT utilisateur_nom_non_vide CHECK (nom_complet ~ '[^[:space:]]');
ALTER TABLE utilisateur
  ADD CONSTRAINT utilisateur_sub_non_vide CHECK (keycloak_sub ~ '[^[:space:]]');

-- ── 2. Purge du journal : seulement à l'échéance de 6 ans, et chaque purge laisse une trace ──────
-- D04-10 : le délai court entrée par entrée, à partir de la date de l'entrée journalisée.
-- Aucun module de conservation n'existe encore : le seul chemin de suppression est ce rôle, bridé.
CREATE TABLE journal_purge (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purge_le           timestamptz NOT NULL DEFAULT clock_timestamp(),
  role_base          text NOT NULL,                 -- rôle de base qui a lancé la purge
  entrees_supprimees integer NOT NULL CHECK (entrees_supprimees > 0),
  plus_ancienne      timestamptz NOT NULL,
  plus_recente       timestamptz NOT NULL
);
REVOKE ALL ON journal_purge FROM PUBLIC;
GRANT SELECT ON journal_purge TO shiku_app, shiku_purge;   -- lecture seule ; personne n'y écrit directement

CREATE FUNCTION journal_purge_refuser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'journal_purge est en ajout seul';
END;
$$;
CREATE TRIGGER journal_purge_sans_update_delete
  BEFORE UPDATE OR DELETE ON journal_purge FOR EACH ROW EXECUTE FUNCTION journal_purge_refuser_modification();
CREATE TRIGGER journal_purge_sans_truncate
  BEFORE TRUNCATE ON journal_purge FOR EACH STATEMENT EXECUTE FUNCTION journal_purge_refuser_modification();

-- Refus avant l'échéance : une entrée de moins de 6 ans ne peut pas être supprimée, même par le rôle de purge.
CREATE FUNCTION journal_refuser_purge_precoce() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.horodatage > clock_timestamp() - interval '6 years' THEN
    RAISE EXCEPTION 'une entrée du journal ne peut être purgée avant 6 ans (D04-10)'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER journal_sans_purge_precoce
  BEFORE DELETE ON journal FOR EACH ROW EXECUTE FUNCTION journal_refuser_purge_precoce();

-- Trace de chaque purge réussie. SECURITY DEFINER : le rôle de purge n'a PAS le droit d'écrire
-- dans journal_purge ; seule cette fonction, déclenchée par une suppression réelle, le fait.
CREATE FUNCTION journal_tracer_purge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
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
CREATE TRIGGER journal_trace_purge
  AFTER DELETE ON journal REFERENCING OLD TABLE AS supprimees
  FOR EACH STATEMENT EXECUTE FUNCTION journal_tracer_purge();

-- ── 3. Lecture d'audit : rôle séparé en lecture seule (T0-33) ───────────────────────────────────
-- Le rôle est créé par infra/postgres/01-roles.sh (nouveau volume). Sur un volume existant :
-- voir docs/dev/JOURNAL.md. Sans ce rôle, la migration ne bloque pas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiku_audit') THEN
    GRANT USAGE ON SCHEMA public TO shiku_audit;
    GRANT SELECT ON journal, journal_purge TO shiku_audit;
  END IF;
END $$;

-- Down Migration
DROP TRIGGER journal_trace_purge ON journal;
DROP TRIGGER journal_sans_purge_precoce ON journal;
DROP FUNCTION journal_tracer_purge();
DROP FUNCTION journal_refuser_purge_precoce();
DROP TABLE journal_purge;
DROP FUNCTION journal_purge_refuser_modification();
ALTER TABLE utilisateur DROP CONSTRAINT utilisateur_sub_non_vide;
ALTER TABLE utilisateur DROP CONSTRAINT utilisateur_nom_non_vide;
