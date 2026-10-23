import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { lireUrlBase } from './config-base.js';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: lireUrlBase() }),
    },
  ],
  exports: [PG_POOL],
})
export class DbModule {}
