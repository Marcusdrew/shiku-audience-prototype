import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { Public } from '../habilitation/acces.decorators.js';

// T0-39 : page de santé. 200 si la base répond, 503 sinon.
@Public() // route technique : seule route accessible sans jeton
@Controller('sante')
export class SanteController {
  constructor(@Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>) {}

  @Get()
  async verifier(): Promise<{ statut: string; base: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { statut: 'ok', base: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ statut: 'ko', base: 'injoignable' });
    }
  }
}
