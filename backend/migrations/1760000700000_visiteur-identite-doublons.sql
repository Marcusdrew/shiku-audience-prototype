-- Up Migration
-- Lot L1 (réponses de M. Jordan du 22/10/2026, Q-12 et DEC-36) : identité minimale du visiteur
-- (nom, prénom, un moyen de contact) et clés normalisées pour détecter les doublons CÔTÉ SERVEUR.
-- Les clés sont calculées par la base (colonnes générées) : une seule définition, appliquée aussi
-- aux fiches existantes. Aucune donnée existante n'est modifiée ni supprimée.

-- Nom normalisé : sans casse, sans accents, ordre des mots indifférent (« Dupont Jean » = « jean DUPONT »).
CREATE FUNCTION shiku_cle_nom(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT string_agg(m, ' ' ORDER BY m)
    FROM regexp_split_to_table(
           translate(
             replace(replace(replace(replace(lower(t), 'œ', 'oe'), 'æ', 'ae'), 'Œ', 'oe'), 'Æ', 'ae'),
             'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
             'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy'),
           '[^a-z0-9]+') AS m
   WHERE m <> ''
$$;

-- Contact normalisé : courriel en minuscules ; sinon téléphone réduit à ses chiffres.
-- HYPOTHESE(DEC-36) : l'indicatif pays n'est pas unifié (« +243 81… » et « 081… » diffèrent).
CREATE FUNCTION shiku_cle_contact(c text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN c IS NULL OR btrim(c) = '' THEN NULL
           WHEN position('@' IN c) > 0 THEN lower(btrim(c))
           ELSE NULLIF(regexp_replace(c, '[^0-9]', '', 'g'), '')
         END
$$;

-- Nom et prénom séparés pour les nouvelles fiches ; `nom_complet` reste le nom affiché.
-- Les fiches antérieures n'ont que `nom_complet` (nom et prénom restent vides).
ALTER TABLE visiteur
  ADD COLUMN nom    text CHECK (nom IS NULL OR nom ~ '[^[:space:]]'),
  ADD COLUMN prenom text CHECK (prenom IS NULL OR prenom ~ '[^[:space:]]'),
  ADD COLUMN cle_nom text GENERATED ALWAYS AS (shiku_cle_nom(nom_complet)) STORED,
  ADD COLUMN cle_contact text GENERATED ALWAYS AS (shiku_cle_contact(contact)) STORED,
  ADD COLUMN modifie_par uuid REFERENCES utilisateur(id),
  ADD COLUMN modifie_le  timestamptz;

CREATE INDEX visiteur_org_cle_nom_idx ON visiteur (organisation_id, cle_nom);
CREATE INDEX visiteur_org_cle_contact_idx ON visiteur (organisation_id, cle_contact);

-- Down Migration
DROP INDEX visiteur_org_cle_contact_idx;
DROP INDEX visiteur_org_cle_nom_idx;
ALTER TABLE visiteur
  DROP COLUMN modifie_le,
  DROP COLUMN modifie_par,
  DROP COLUMN cle_contact,
  DROP COLUMN cle_nom,
  DROP COLUMN prenom,
  DROP COLUMN nom;
DROP FUNCTION shiku_cle_contact(text);
DROP FUNCTION shiku_cle_nom(text);
