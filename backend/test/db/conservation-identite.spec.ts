import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Preuves, sur PostgreSQL RÉEL, du lot 2 : purge du journal encadrée (6 ans, tracée), identité
// nominative minimale, rôle de lecture d'audit. Données fictives. Le superutilisateur ne sert qu'à
// préparer et nettoyer ; il contourne volontairement les protections (limites L1 à L5 documentées).

function exiger(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable ${nom} manquante : lancez "pnpm test:db" après init-local.sh.`);
  return v;
}
const hote = process.env.PGHOST ?? '127.0.0.1';
const port = Number(process.env.POSTGRES_PORT ?? 5432);
const base = process.env.POSTGRES_DB ?? 'shiku';

async function connecter(user: string, password: string): Promise<pg.Client> {
  const c = new pg.Client({ host: hote, port, database: base, user, password });
  await c.connect();
  return c;
}
async function code(c: pg.Client, sql: string, params: unknown[] = []): Promise<string | null> {
  await c.query('BEGIN');
  try {
    await c.query(sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'inconnu';
  } finally {
    await c.query('ROLLBACK');
  }
}

describe('lot 2 : purge encadrée, identité nominative, lecture d’audit', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let purge: pg.Client;
  let audit: pg.Client;
  let orgId: string;
  let userId: string;
  const marque = `TEST-CONS-${randomUUID()}`;

  beforeAll(async () => {
    admin = await connecter(
      process.env.POSTGRES_SUPERUSER ?? 'postgres',
      exiger('POSTGRES_SUPERUSER_PASSWORD'),
    );
    app = await connecter('shiku_app', exiger('DB_APP_PASSWORD'));
    purge = await connecter('shiku_purge', exiger('DB_PURGE_PASSWORD'));
    audit = await connecter('shiku_audit', exiger('DB_AUDIT_PASSWORD'));
    orgId = (
      await admin.query<{ id: string }>(`INSERT INTO organisation (nom) VALUES ($1) RETURNING id`, [
        `${marque} (fictive)`,
      ])
    ).rows[0]!.id;
    userId = (
      await admin.query<{ id: string }>(
        `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet)
         VALUES ($1,$2,'Personne Fictive') RETURNING id`,
        [orgId, `${marque}-u`],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (admin) {
      await admin.query('SET session_replication_role = replica').catch(() => undefined);
      await admin
        .query('DELETE FROM journal WHERE organisation_id=$1', [orgId])
        .catch(() => undefined);
      await admin
        .query('DELETE FROM utilisateur WHERE organisation_id=$1', [orgId])
        .catch(() => undefined);
      await admin.query('DELETE FROM organisation WHERE id=$1', [orgId]).catch(() => undefined);
      await admin
        .query(
          'DELETE FROM journal_purge WHERE role_base = $1 AND plus_ancienne < now() - interval $2',
          ['shiku_purge', '5 years'],
        )
        .catch(() => undefined);
    }
    await Promise.all([admin, app, purge, audit].map((c) => c?.end()));
  });

  /** Insère une entrée « ancienne » : le superutilisateur coupe les déclencheurs de SA session. */
  async function entreeAgee(ans: number, action: string): Promise<number> {
    await admin.query('SET session_replication_role = replica');
    try {
      const r = await admin.query<{ id: string }>(
        `INSERT INTO journal (organisation_id, utilisateur_id, horodatage, action, objet_type)
         VALUES ($1,$2, clock_timestamp() - make_interval(years => $3), $4, 'essai') RETURNING id`,
        [orgId, userId, ans, action],
      );
      return Number(r.rows[0]!.id);
    } finally {
      await admin.query('SET session_replication_role = DEFAULT');
    }
  }

  describe('identité nominative (US-05-002)', () => {
    it.each([
      ['nom vide', ''],
      ['nom d’espaces', '   '],
      ['nom de tabulations', '\t \t'],
    ])('la base refuse un compte avec un %s (le rôle applicatif aussi)', async (_n, nom) => {
      expect(
        await code(
          app,
          `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet) VALUES ($1,$2,$3)`,
          [orgId, `${marque}-vide`, nom],
        ),
      ).toBe('23514');
    });
    it('la base refuse un identifiant Keycloak vide', async () => {
      expect(
        await code(
          app,
          `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet) VALUES ($1,'  ','X Y')`,
          [orgId],
        ),
      ).toBe('23514');
    });
  });

  describe('purge du journal (US-05-011)', () => {
    it('le rôle applicatif ne peut toujours ni supprimer ni modifier une entrée', async () => {
      expect(await code(app, 'DELETE FROM journal WHERE organisation_id=$1', [orgId])).toBe(
        '42501',
      );
      expect(
        await code(app, `UPDATE journal SET action='x' WHERE organisation_id=$1`, [orgId]),
      ).toBe('42501');
    });
    it('le rôle de purge ne peut PAS supprimer une entrée récente (moins de 6 ans)', async () => {
      const id = await entreeAgee(0, `${marque}-recente`);
      expect(await code(purge, 'DELETE FROM journal WHERE id=$1', [id])).toBe('23514');
      expect((await admin.query('SELECT 1 FROM journal WHERE id=$1', [id])).rowCount).toBe(1);
    });
    it('…ni une entrée de 5 ans et 11 mois ; la limite est de 6 ans, entrée par entrée', async () => {
      await admin.query('SET session_replication_role = replica');
      const r = await admin.query<{ id: string }>(
        `INSERT INTO journal (organisation_id, utilisateur_id, horodatage, action, objet_type)
         VALUES ($1,$2, clock_timestamp() - interval '5 years 11 months', $3, 'essai') RETURNING id`,
        [orgId, userId, `${marque}-presque`],
      );
      await admin.query('SET session_replication_role = DEFAULT');
      expect(await code(purge, 'DELETE FROM journal WHERE id=$1', [r.rows[0]!.id])).toBe('23514');
    });
    it('une entrée de plus de 6 ans est purgée par le rôle de purge, et la purge est tracée', async () => {
      const id = await entreeAgee(7, `${marque}-ancienne`);
      const avant = Number(
        (await admin.query<{ n: string }>('SELECT count(*) n FROM journal_purge')).rows[0]!.n,
      );
      const r = await purge.query('DELETE FROM journal WHERE id=$1', [id]);
      expect(r.rowCount).toBe(1);
      const trace = await admin.query(
        `SELECT role_base, entrees_supprimees FROM journal_purge ORDER BY id DESC LIMIT 1`,
      );
      expect(
        Number(
          (await admin.query<{ n: string }>('SELECT count(*) n FROM journal_purge')).rows[0]!.n,
        ),
      ).toBe(avant + 1);
      expect(trace.rows[0]).toEqual({ role_base: 'shiku_purge', entrees_supprimees: 1 });
    });
    it('une purge groupée trace une seule ligne avec le nombre d’entrées et leurs bornes', async () => {
      await entreeAgee(8, `${marque}-lot`);
      await entreeAgee(9, `${marque}-lot`);
      await purge.query('DELETE FROM journal WHERE organisation_id=$1 AND action=$2', [
        orgId,
        `${marque}-lot`,
      ]);
      const t = await admin.query(
        `SELECT entrees_supprimees, plus_ancienne < plus_recente AS bornes FROM journal_purge ORDER BY id DESC LIMIT 1`,
      );
      expect(t.rows[0]).toEqual({ entrees_supprimees: 2, bornes: true });
    });
    it('une suppression qui ne retire aucune ligne ne laisse aucune fausse trace', async () => {
      const avant = Number(
        (await admin.query<{ n: string }>('SELECT count(*) n FROM journal_purge')).rows[0]!.n,
      );
      await purge.query('DELETE FROM journal WHERE id = -1');
      expect(
        Number(
          (await admin.query<{ n: string }>('SELECT count(*) n FROM journal_purge')).rows[0]!.n,
        ),
      ).toBe(avant);
    });
    it('le rôle de purge ne peut ni modifier, ni vider le journal, ni écrire sa propre trace', async () => {
      expect(await code(purge, `UPDATE journal SET action='x'`)).toBe('42501');
      expect(await code(purge, 'TRUNCATE journal')).toBe('42501');
      expect(
        await code(
          purge,
          `INSERT INTO journal_purge (role_base, entrees_supprimees, plus_ancienne, plus_recente)
           VALUES ('faux', 1, now(), now())`,
        ),
      ).toBe('42501');
      expect(await code(purge, 'DELETE FROM journal_purge')).toBe('42501');
    });
    it('l’application ne peut pas falsifier ni effacer les traces de purge', async () => {
      for (const sql of [
        'DELETE FROM journal_purge',
        `UPDATE journal_purge SET entrees_supprimees = 1`,
        `INSERT INTO journal_purge (role_base, entrees_supprimees, plus_ancienne, plus_recente) VALUES ('x',1,now(),now())`,
      ])
        expect(await code(app, sql), sql).toBe('42501');
    });
    it('même le superutilisateur est arrêté par les déclencheurs sur la trace de purge (limites L1 à L5 inchangées)', async () => {
      expect(await code(admin, 'DELETE FROM journal_purge')).toBe('P0001');
      expect(await code(admin, 'TRUNCATE journal_purge')).toBe('P0001');
    });
  });

  describe('rôle de lecture d’audit', () => {
    it('lit le journal et les traces de purge', async () => {
      expect((await audit.query('SELECT 1 FROM journal LIMIT 1')).rowCount).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        (await audit.query('SELECT 1 FROM journal_purge LIMIT 1')).rowCount,
      ).toBeGreaterThanOrEqual(0);
    });
    it('n’écrit, ne modifie, ne supprime ni ne vide rien', async () => {
      expect(
        await code(
          audit,
          `INSERT INTO journal (organisation_id, utilisateur_id, action, objet_type) VALUES ($1,$2,'x','y')`,
          [orgId, userId],
        ),
      ).toBe('42501');
      expect(await code(audit, `UPDATE journal SET action='x'`)).toBe('42501');
      expect(await code(audit, 'DELETE FROM journal')).toBe('42501');
      expect(await code(audit, 'TRUNCATE journal')).toBe('42501');
    });
    it('ne lit aucune donnée métier ni les comptes', async () => {
      for (const t of ['utilisateur', 'demande', 'decision', 'audience', 'visiteur'])
        expect(await code(audit, `SELECT 1 FROM ${t}`), t).toBe('42501');
    });
    it('ne peut pas escalader vers un autre rôle', async () => {
      for (const cible of ['shiku_migrator', 'shiku_purge', 'shiku_app', 'postgres'])
        expect(await code(audit, `SET ROLE ${cible}`), cible).toBe('42501');
    });
  });
});
