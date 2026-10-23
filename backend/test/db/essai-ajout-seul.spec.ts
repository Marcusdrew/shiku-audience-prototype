// T0-33 : preuves, sur un vrai PostgreSQL, qu'une table en ajout seul est protégée PAR LA BASE.
// Le motif est appliqué à une TABLE D'ESSAI créée ici (test/db/modele-ajout-seul.sql) : le vrai journal
// relève de US-05-010 / US-05-011 (Sprint 1). Ces tests exigent une base migrée : voir docs/dev/PREUVES-AJOUT-SEUL.md.
// Données fictives uniquement. Les essais destructifs du propriétaire et du superutilisateur
// sont faits dans une transaction annulée (ROLLBACK) : rien n'est réellement détruit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { Client } = pg;

function exiger(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(
      `Variable ${nom} manquante : lancez "pnpm test:db" après "bash scripts/init-local.sh".`,
    );
  }
  return valeur;
}

const hote = process.env.PGHOST ?? '127.0.0.1';
const port = Number(process.env.POSTGRES_PORT ?? 5432);
const base = process.env.POSTGRES_DB ?? 'shiku';
const MARQUE = `TEST-US-05-011-${randomUUID()}`;

type Role = 'app' | 'purge' | 'migrator' | 'super' | 'keycloak';
const identifiants: Record<Role, () => { user: string; password: string }> = {
  app: () => ({ user: 'shiku_app', password: exiger('DB_APP_PASSWORD') }),
  purge: () => ({ user: 'shiku_purge', password: exiger('DB_PURGE_PASSWORD') }),
  migrator: () => ({ user: 'shiku_migrator', password: exiger('DB_MIGRATOR_PASSWORD') }),
  super: () => ({
    user: process.env.POSTGRES_SUPERUSER ?? 'postgres',
    password: exiger('POSTGRES_SUPERUSER_PASSWORD'),
  }),
  keycloak: () => ({ user: 'keycloak', password: exiger('DB_KEYCLOAK_PASSWORD') }),
};

const clients: pg.Client[] = [];
async function connecter(role: Role, database = base): Promise<pg.Client> {
  const c = new Client({ host: hote, port, database, ...identifiants[role]() });
  await c.connect();
  clients.push(c);
  return c;
}

/** Exécute une requête et renvoie le code SQLSTATE de l'erreur (undefined si elle a réussi). */
async function codeErreur(c: pg.Client, sql: string, params: unknown[] = []) {
  try {
    await c.query(sql, params);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}
const REFUSE = '42501'; // insufficient_privilege

let app: pg.Client;
let purge: pg.Client;
let migrator: pg.Client;
let superuser: pg.Client;
let orgId: string;
let adminId: string;
let receptionId: string;
let entreeId: string;

async function compter(c: pg.Client): Promise<number> {
  const r = await c.query('SELECT count(*)::int AS n FROM essai_ajout_seul WHERE action = $1', [
    MARQUE,
  ]);
  return r.rows[0].n;
}

beforeAll(async () => {
  app = await connecter('app');
  purge = await connecter('purge');
  migrator = await connecter('migrator');
  superuser = await connecter('super');

  // Fixtures. L'application ne peut pas créer d'organisation (pas d'INSERT) : le propriétaire le fait.
  orgId = (
    await migrator.query(
      `INSERT INTO organisation (nom) VALUES ('Org fictive ${MARQUE}') RETURNING id`,
    )
  ).rows[0].id;
  const u = async (nom: string) =>
    (
      await app.query(
        'INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet) VALUES ($1,$2,$3) RETURNING id',
        [orgId, `sub-${randomUUID()}`, nom],
      )
    ).rows[0].id as string;
  adminId = await u('Admin Fictif');
  receptionId = await u('Réception Fictive');

  // Repart de zéro, même si un passage précédent a été interrompu.
  await migrator.query('DROP TABLE IF EXISTS essai_ajout_seul CASCADE');
  await migrator.query('DROP FUNCTION IF EXISTS refuser_modification_essai()');
  await migrator.query(readFileSync(new URL('./modele-ajout-seul.sql', import.meta.url), 'utf8'));

  entreeId = (
    await app.query(
      `INSERT INTO essai_ajout_seul (organisation_id, utilisateur_id, action, objet)
       VALUES ($1,$2,$3,'objet-essai') RETURNING id`,
      [orgId, receptionId, MARQUE],
    )
  ).rows[0].id;
});

afterAll(async () => {
  // La seule suppression légitime : le rôle de purge. Puis le propriétaire retire la table d'essai et
  // les fixtures. Chaque étape est tentée même si la précédente échoue : on ne laisse rien derrière soi.
  const etapes: Array<() => Promise<unknown> | undefined> = [
    () => purge?.query('DELETE FROM essai_ajout_seul WHERE action = $1', [MARQUE]),
    () => migrator?.query('DROP TABLE IF EXISTS essai_ajout_seul'),
    () => migrator?.query('DROP FUNCTION IF EXISTS refuser_modification_essai()'),
    () => migrator?.query('DELETE FROM utilisateur WHERE organisation_id = $1', [orgId]),
    () => migrator?.query('DELETE FROM organisation WHERE id = $1', [orgId]),
  ];
  for (const etape of etapes) await Promise.resolve(etape()).catch(() => undefined);
  await Promise.all(clients.map((c) => c.end().catch(() => undefined)));
});

describe('A. Matrice des privilèges (lue dans le catalogue PostgreSQL)', () => {
  const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  const attendu: Record<string, string[]> = {
    shiku_app: ['SELECT', 'INSERT'],
    shiku_purge: ['SELECT', 'DELETE'],
    // Propriétaire de la table : a tous les droits. Limite documentée (voir test H).
    shiku_migrator: privileges,
    keycloak: [],
  };
  for (const [role, ok] of Object.entries(attendu)) {
    it(`${role} a exactement les privilèges attendus sur essai_ajout_seul`, async () => {
      const obtenus: string[] = [];
      for (const p of privileges) {
        const r = await superuser.query('SELECT has_table_privilege($1, $2, $3) AS a', [
          role,
          'essai_ajout_seul',
          p,
        ]);
        if (r.rows[0].a) obtenus.push(p);
      }
      expect(obtenus.sort()).toEqual([...ok].sort());
    });
  }

  it("aucun droit n'est accordé à PUBLIC sur essai_ajout_seul", async () => {
    const r = await superuser.query(
      `SELECT count(*)::int AS n FROM pg_class c, aclexplode(c.relacl) a
       WHERE c.relname = 'essai_ajout_seul' AND a.grantee = 0`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('aucun rôle applicatif nest superutilisateur, ni ne crée de rôle/base, ni ne contourne la RLS', async () => {
    const r = await superuser.query(
      `SELECT rolname FROM pg_roles
       WHERE rolname IN ('shiku_app','shiku_purge','shiku_migrator','keycloak')
         AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication)`,
    );
    expect(r.rows).toEqual([]);
  });

  it("aucun rôle applicatif n'est membre d'un autre (pas d'héritage de droits)", async () => {
    const r = await superuser.query(
      `SELECT m.rolname AS membre, g.rolname AS groupe
       FROM pg_auth_members am JOIN pg_roles m ON m.oid = am.member JOIN pg_roles g ON g.oid = am.roleid
       WHERE m.rolname IN ('shiku_app','shiku_purge','shiku_migrator','keycloak')
         AND g.rolname !~ '^pg_'`,
    );
    expect(r.rows).toEqual([]);
  });

  it("le rôle applicatif n'est pas propriétaire de la table", async () => {
    const r = await superuser.query(
      `SELECT pg_get_userbyid(relowner) AS proprio FROM pg_class WHERE relname = 'essai_ajout_seul'`,
    );
    expect(r.rows[0].proprio).toBe('shiku_migrator');
  });
});

describe('B. Le rôle applicatif peut ajouter et lire', () => {
  it('INSERT réussit et SELECT relit la ligne', async () => {
    expect(await compter(app)).toBe(1);
  });
});

describe('C. Le rôle applicatif ne peut ni modifier, ni supprimer, ni contourner', () => {
  const tentatives: Array<[string, string]> = [
    ['UPDATE', `UPDATE essai_ajout_seul SET objet = 'falsifie' WHERE id = ${'$ID'}`],
    ['DELETE', `DELETE FROM essai_ajout_seul WHERE id = ${'$ID'}`],
    ['DELETE sans filtre', 'DELETE FROM essai_ajout_seul'],
    ['TRUNCATE', 'TRUNCATE essai_ajout_seul'],
    [
      'INSERT ... ON CONFLICT DO UPDATE (écrase par la voie de l’insertion)',
      `INSERT INTO essai_ajout_seul (id, organisation_id, action) OVERRIDING SYSTEM VALUE
       VALUES (${'$ID'}, '${'$ORG'}', 'x') ON CONFLICT (id) DO UPDATE SET action = 'ecrase'`,
    ],
    [
      'MERGE ... WHEN MATCHED THEN DELETE',
      `MERGE INTO essai_ajout_seul j USING (SELECT ${'$ID'}::bigint AS id) s ON j.id = s.id
       WHEN MATCHED THEN DELETE`,
    ],
    [
      'SELECT ... FOR UPDATE (verrou de modification)',
      `SELECT * FROM essai_ajout_seul WHERE id = ${'$ID'} FOR UPDATE`,
    ],
    ['ALTER TABLE ... DISABLE TRIGGER', 'ALTER TABLE essai_ajout_seul DISABLE TRIGGER ALL'],
    ['DROP TRIGGER', 'DROP TRIGGER essai_ajout_seul_sans_update ON essai_ajout_seul'],
    ['DROP TABLE', 'DROP TABLE essai_ajout_seul'],
    [
      'remplacer la fonction du déclencheur',
      `CREATE OR REPLACE FUNCTION refuser_modification_essai() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`,
    ],
    ['créer une table dans le schéma public', 'CREATE TABLE contournement (x int)'],
  ];
  for (const [nom, sql] of tentatives) {
    it(`refuse : ${nom}`, async () => {
      const requete = sql.replaceAll('$ID', String(entreeId)).replaceAll('$ORG', orgId);
      expect(await codeErreur(app, requete)).toBe(REFUSE);
    });
  }

  it("refuse l'escalade : SET ROLE vers migration, purge ou superutilisateur", async () => {
    for (const cible of ['shiku_migrator', 'shiku_purge', 'postgres']) {
      expect(await codeErreur(app, `SET ROLE ${cible}`)).toBe(REFUSE);
    }
    expect(await codeErreur(app, 'SET SESSION AUTHORIZATION postgres')).toBe(REFUSE);
  });

  it('refuse la désactivation des déclencheurs par session_replication_role', async () => {
    expect(await codeErreur(app, `SET session_replication_role = 'replica'`)).toBe(REFUSE);
  });

  it("refuse de s'octroyer des droits ou d'en créer (ALTER ROLE, CREATE ROLE, ALTER SYSTEM)", async () => {
    expect(await codeErreur(app, 'ALTER ROLE shiku_app SUPERUSER')).toBe(REFUSE);
    expect(await codeErreur(app, 'CREATE ROLE intrus LOGIN')).toBe(REFUSE);
    expect(await codeErreur(app, `ALTER SYSTEM SET log_statement = 'none'`)).toBe(REFUSE);
  });

  it("un GRANT lancé par l'application n'a aucun effet (le droit reste absent)", async () => {
    await app
      .query('GRANT UPDATE, DELETE, TRUNCATE ON essai_ajout_seul TO shiku_app')
      .catch(() => undefined);
    const r = await superuser.query(
      `SELECT has_table_privilege('shiku_app','essai_ajout_seul','UPDATE') AS u,
              has_table_privilege('shiku_app','essai_ajout_seul','DELETE') AS d,
              has_table_privilege('shiku_app','essai_ajout_seul','TRUNCATE') AS t`,
    );
    expect(r.rows[0]).toEqual({ u: false, d: false, t: false });
  });

  it("l'entrée est intacte après toutes ces tentatives", async () => {
    const r = await app.query('SELECT objet, action FROM essai_ajout_seul WHERE id = $1', [
      entreeId,
    ]);
    expect(r.rows).toEqual([{ objet: 'objet-essai', action: MARQUE }]);
  });
});

describe('D. Un administrateur APPLICATIF n’a pas plus de droits en base que l’application', () => {
  // Dans l'architecture, « Administrateur » est un rôle métier porté par l'identité (Keycloak) et par
  // la table utilisateur. Toutes ses actions s'exécutent sur la connexion du rôle shiku_app.
  // Il n'existe donc, côté base, aucun moyen de lui donner plus que ce que shiku_app possède.
  it("l'administrateur, authentifié comme tel, est refusé comme n'importe quel autre", async () => {
    const adminSession = await connecter('app'); // même rôle de base que toute l'application
    await adminSession.query(`SELECT set_config('app.utilisateur_id', $1, false)`, [adminId]);
    await adminSession.query(`SELECT set_config('app.role', 'administrator', false)`);
    await adminSession.query(
      `INSERT INTO essai_ajout_seul (organisation_id, utilisateur_id, action, objet)
       VALUES ($1,$2,$3,'action-admin')`,
      [orgId, adminId, MARQUE],
    );
    expect(
      await codeErreur(adminSession, `UPDATE essai_ajout_seul SET objet = 'x' WHERE action = $1`, [
        MARQUE,
      ]),
    ).toBe(REFUSE);
    expect(
      await codeErreur(adminSession, `DELETE FROM essai_ajout_seul WHERE action = $1`, [MARQUE]),
    ).toBe(REFUSE);
    expect(await codeErreur(adminSession, 'TRUNCATE essai_ajout_seul')).toBe(REFUSE);
    // Se déclarer « administrator » dans la session ne change rien : ce n'est pas un droit PostgreSQL.
    expect(await compter(adminSession)).toBe(2);
  });
});

describe('E. Défense en profondeur : déclencheur contre UPDATE', () => {
  it("le déclencheur refuse UPDATE même au propriétaire de la table (message d'ajout seul)", async () => {
    await migrator.query('BEGIN');
    let message = '';
    try {
      await migrator.query(`UPDATE essai_ajout_seul SET objet = 'x' WHERE id = $1`, [entreeId]);
    } catch (e) {
      message = (e as Error).message;
    }
    await migrator.query('ROLLBACK');
    expect(message).toContain('ajout seul');
  });
});

describe('F. Rôle de purge', () => {
  it('lit mais ne peut ni ajouter, ni modifier, ni vider la table', async () => {
    expect(
      (await purge.query('SELECT 1 FROM essai_ajout_seul WHERE id = $1', [entreeId])).rowCount,
    ).toBe(1);
    expect(
      await codeErreur(
        purge,
        `INSERT INTO essai_ajout_seul (organisation_id, action) VALUES ($1, 'x')`,
        [orgId],
      ),
    ).toBe(REFUSE);
    expect(
      await codeErreur(purge, `UPDATE essai_ajout_seul SET objet = 'x' WHERE id = $1`, [entreeId]),
    ).toBe(REFUSE);
    expect(await codeErreur(purge, 'TRUNCATE essai_ajout_seul')).toBe(REFUSE);
  });
});

describe('G. Isolation des bases', () => {
  it("Keycloak ne peut pas se connecter à la base de l'application", async () => {
    const c = new Client({ host: hote, port, database: base, ...identifiants.keycloak() });
    const code = await c.connect().then(
      () => 'connecté',
      (e: { code?: string }) => e.code,
    );
    await c.end().catch(() => undefined);
    expect(code).toBe(REFUSE);
  });

  it("l'application ne peut pas se connecter à la base de Keycloak", async () => {
    const c = new Client({ host: hote, port, database: 'keycloak', ...identifiants.app() });
    const code = await c.connect().then(
      () => 'connecté',
      (e: { code?: string }) => e.code,
    );
    await c.end().catch(() => undefined);
    expect(code).toBe(REFUSE);
  });
});

describe('I. Droits du rôle applicatif sur les tables de T0-38', () => {
  it("l'application lit les organisations mais n'en crée ni n'en supprime", async () => {
    expect((await app.query('SELECT 1 FROM organisation WHERE id = $1', [orgId])).rowCount).toBe(1);
    expect(await codeErreur(app, `INSERT INTO organisation (nom) VALUES ('x')`)).toBe(REFUSE);
    expect(await codeErreur(app, 'DELETE FROM organisation')).toBe(REFUSE);
  });
  it("l'application désactive un utilisateur mais ne le supprime jamais", async () => {
    await app.query('UPDATE utilisateur SET actif = false WHERE id = $1', [receptionId]);
    await app.query('UPDATE utilisateur SET actif = true WHERE id = $1', [receptionId]);
    expect(await codeErreur(app, 'DELETE FROM utilisateur WHERE id = $1', [receptionId])).toBe(
      REFUSE,
    );
    expect(await codeErreur(app, 'TRUNCATE utilisateur')).toBe(REFUSE);
  });
  it('le rôle de purge ne touche pas aux utilisateurs', async () => {
    expect(await codeErreur(purge, 'SELECT 1 FROM utilisateur')).toBe(REFUSE);
  });
});

// ---------------------------------------------------------------------------------------------
// LIMITES CONNUES. Ces tests décrivent ce qui n'est PAS garanti par la base. Ils ne sont pas des
// preuves de sécurité : ils documentent le comportement actuel pour que personne ne l'oublie.
// Chacun renvoie à une décision à faire valider (docs/dev/PREUVES-JOURNAL.md).
// ---------------------------------------------------------------------------------------------
describe('H. LIMITES CONNUES (non garanties par la base, à faire valider)', () => {
  it('H1. le propriétaire (shiku_migrator) peut supprimer et vider la table', async () => {
    await migrator.query('BEGIN');
    await migrator.query('TRUNCATE essai_ajout_seul');
    const apres = (await migrator.query('SELECT count(*)::int AS n FROM essai_ajout_seul')).rows[0]
      .n;
    await migrator.query('ROLLBACK');
    expect(apres).toBe(0);
  });

  it('H2. le propriétaire peut désactiver le déclencheur puis modifier une entrée', async () => {
    await migrator.query('BEGIN');
    await migrator.query(
      'ALTER TABLE essai_ajout_seul DISABLE TRIGGER essai_ajout_seul_sans_update',
    );
    await migrator.query(`UPDATE essai_ajout_seul SET objet = 'falsifie' WHERE id = $1`, [
      entreeId,
    ]);
    const objet = (
      await migrator.query('SELECT objet FROM essai_ajout_seul WHERE id = $1', [entreeId])
    ).rows[0].objet;
    await migrator.query('ROLLBACK');
    expect(objet).toBe('falsifie');
  });

  it('H3. un superutilisateur PostgreSQL contourne tout (droits, déclencheur)', async () => {
    await superuser.query('BEGIN');
    await superuser.query(`SET LOCAL session_replication_role = 'replica'`);
    await superuser.query(`UPDATE essai_ajout_seul SET objet = 'falsifie' WHERE id = $1`, [
      entreeId,
    ]);
    const objet = (
      await superuser.query('SELECT objet FROM essai_ajout_seul WHERE id = $1', [entreeId])
    ).rows[0].objet;
    await superuser.query('ROLLBACK');
    expect(objet).toBe('falsifie');
  });

  it('H4. le rôle de purge peut supprimer une entrée toute récente (pas de contrôle des 6 ans)', async () => {
    await purge.query('BEGIN');
    const r = await purge.query('DELETE FROM essai_ajout_seul WHERE id = $1', [entreeId]);
    await purge.query('ROLLBACK');
    expect(r.rowCount).toBe(1);
  });

  it("H5. l'application peut écrire un horodatage arbitraire (passé ou futur)", async () => {
    await app.query('BEGIN');
    const r = await app.query(
      `INSERT INTO essai_ajout_seul (organisation_id, action, horodatage)
       VALUES ($1, $2, '2001-01-01T00:00:00Z') RETURNING horodatage`,
      [orgId, MARQUE],
    );
    await app.query('ROLLBACK');
    expect(new Date(r.rows[0].horodatage).getUTCFullYear()).toBe(2001);
  });
});
