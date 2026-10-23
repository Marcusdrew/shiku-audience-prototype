import type { Pool, PoolClient } from 'pg';

/** Exécute `travail` dans UNE transaction : tout réussit (COMMIT) ou rien n'est écrit (ROLLBACK). */
export async function enTransaction<T>(
  pool: Pool,
  travail: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await travail(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
