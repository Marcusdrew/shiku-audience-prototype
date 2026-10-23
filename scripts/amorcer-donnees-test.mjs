// Amorçage des données de TEST locales : une organisation fictive, les 5 comptes de test rattachés
// à leur identité Keycloak, deux agendas fictifs. Idempotent. À lancer après `docker compose up`.
// Usage : node --env-file=.env scripts/amorcer-donnees-test.mjs
//
// Pourquoi un script et non l'application : créer une organisation est un acte du propriétaire du
// schéma (AUD-26) ; l'application n'en a pas le droit. Ce script utilise donc le rôle de migration
// (shiku_migrator), jamais le rôle applicatif, et ne sert QU'en local (données fictives).
// Le `sub` de chaque compte est lu dans Keycloak (API d'administration) : jamais saisi à la main.
//
// HYPOTHESE H6 : le rattachement est un acte d'administration explicite, pas automatique.
// DEC-32 (règle provisoire du 22/10/2026) : au MVP, l'unique Autorité est rattachée à tous les agendas
// par la donnée initiale, journalisée « initialisation système ». Seuls les agendas qui n'ont JAMAIS eu
// de rattachement sont concernés : une révocation faite dans l'application n'est pas annulée.
// HYPOTHESE H7 : le nom d'organisation ci-dessous est fictif, à remplacer par le métier.
import { createRequire } from "node:module";

const exiger = (nom) => {
  const v = process.env[nom];
  if (!v)
    throw new Error(
      `Variable ${nom} manquante (lancez bash scripts/init-local.sh).`,
    );
  return v;
};

// `pg` n'est installé que dans backend/ : on le résout depuis là.
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const { Client } = require("pg");

const kc = `http://localhost:${process.env.KEYCLOAK_PORT ?? "8080"}`;
const COMPTES = [
  // Personnes FICTIVES, une par compte, aucun compte partagé (D04-26) ; courriels en @example.test.
  // Le Protocole n'a pas de compte permanent (D04-24) : profil de délégation, non modélisé (Sprint 2).
  ["reception.test", "Réa Test-Accueil"],
  ["assistant1.test", "Alex Test-Assistant-1"],
  ["assistant2.test", "Alex Test-Assistant-2"],
  ["authority.test", "Aude Test-Autorité"],
  ["admin.test", "Adam Test-Admin"],
];
const AGENDAS = [
  "Agenda de l’Autorité (fictif)",
  "Agenda du Protocole (fictif)",
];
const NOM_ORG = "Organisation de test (fictive)";

async function jetonAdmin() {
  const r = await fetch(`${kc}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: process.env.KEYCLOAK_ADMIN ?? "kcadmin",
      password: exiger("KEYCLOAK_ADMIN_PASSWORD"),
    }),
  });
  if (!r.ok)
    throw new Error(
      `Connexion administrateur Keycloak refusée (HTTP ${r.status}).`,
    );
  return (await r.json()).access_token;
}

const jeton = await jetonAdmin();
const subs = new Map();
for (const [nom] of COMPTES) {
  const r = await fetch(
    `${kc}/admin/realms/shiku/users?username=${nom}&exact=true`,
    {
      headers: { authorization: `Bearer ${jeton}` },
    },
  );
  const [u] = await r.json();
  if (!u?.id) throw new Error(`Compte ${nom} introuvable dans le realm shiku.`);
  subs.set(nom, u.id);
}

const db = new Client({
  host: "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? "shiku",
  user: "shiku_migrator",
  password: exiger("DB_MIGRATOR_PASSWORD"),
});
await db.connect();
try {
  await db.query("BEGIN");
  let org = (
    await db.query("SELECT id FROM organisation WHERE nom = $1", [NOM_ORG])
  ).rows[0];
  if (!org)
    org = (
      await db.query(
        "INSERT INTO organisation (nom) VALUES ($1) RETURNING id",
        [NOM_ORG],
      )
    ).rows[0];
  for (const [nom, complet] of COMPTES)
    await db.query(
      `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet)
       VALUES ($1, $2, $3) ON CONFLICT (keycloak_sub) DO NOTHING`,
      [org.id, subs.get(nom), complet],
    );
  const admin = (
    await db.query("SELECT id FROM utilisateur WHERE keycloak_sub = $1", [
      subs.get("admin.test"),
    ])
  ).rows[0];
  for (const nom of AGENDAS)
    await db.query(
      `INSERT INTO agenda (organisation_id, nom, cree_par) VALUES ($1, $2, $3)
       ON CONFLICT (organisation_id, nom) DO NOTHING`,
      [org.id, nom, admin.id],
    );
  const autorite = (
    await db.query("SELECT id FROM utilisateur WHERE keycloak_sub = $1", [
      subs.get("authority.test"),
    ])
  ).rows[0];
  const initiaux = await db.query(
    `INSERT INTO rattachement_agenda (organisation_id, agenda_id, autorite_id, statut, source,
                                      propose_par, applique_par, applique_le)
     SELECT a.organisation_id, a.id, $2, 'actif', 'initialisation_systeme', $3, $3, now()
       FROM agenda a
      WHERE a.organisation_id = $1 AND a.actif
        AND NOT EXISTS (SELECT 1 FROM rattachement_agenda r WHERE r.agenda_id = a.id)
     RETURNING id, agenda_id`,
    [org.id, autorite.id, admin.id],
  );
  for (const r of initiaux.rows)
    await db.query(
      `INSERT INTO journal (organisation_id, utilisateur_id, action, objet_type, objet_id, contexte)
       VALUES ($1, $2, 'rattachement_agenda.initialiser', 'rattachement_agenda', $3, $4::jsonb)`,
      [
        org.id,
        admin.id,
        r.id,
        JSON.stringify({
          source: "initialisation_systeme",
          agenda_id: r.agenda_id,
          autorite_id: autorite.id,
        }),
      ],
    );
  await db.query("COMMIT");
  console.log(
    `OK : organisation « ${NOM_ORG} », ${COMPTES.length} comptes rattachés, ${AGENDAS.length} agendas` +
      ` ; ${initiaux.rowCount} rattachement(s) initial(aux) à l’Autorité (initialisation système).`,
  );
} catch (e) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw e;
} finally {
  await db.end();
}
