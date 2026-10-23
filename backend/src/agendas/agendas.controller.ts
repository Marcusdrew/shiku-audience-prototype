import { Body, ConflictException, Controller, Get, Inject, Post } from '@nestjs/common';
import type { Pool } from 'pg';
import { Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

// HYPOTHESE : la règle de visibilité d'un agenda (EF03-24, US-05-026) n'est pas définie ; ici tout
// agenda actif de l'organisation est visible par les rôles autorisés à les lister.
@Controller('agendas')
export class AgendasController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
  ) {}

  @Get()
  @ExigeDroit('agenda.lister')
  async lister(@ContexteCourant() ctx: Contexte) {
    const { rows } = await this.pool.query(
      `SELECT id, nom, actif FROM agenda WHERE organisation_id = $1 AND actif ORDER BY nom`,
      [ctx.organisationId],
    );
    return { elements: rows };
  }

  @Post()
  @ExigeDroit('agenda.administrer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const nom = v.texte('nom', { requis: true, max: 200 });
    v.fin();
    return enTransaction(this.pool, async (c) => {
      let id: string;
      try {
        const r = await c.query<{ id: string }>(
          `INSERT INTO agenda (organisation_id, nom, cree_par) VALUES ($1, $2, $3) RETURNING id`,
          [ctx.organisationId, nom, ctx.utilisateurId],
        );
        id = r.rows[0]!.id;
      } catch (e) {
        if ((e as { code?: string }).code === '23505')
          throw new ConflictException('Un agenda porte déjà ce nom.');
        throw e;
      }
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'agenda.creer',
        objetType: 'agenda',
        objetId: id,
        contexte: { nom },
      });
      return { id, nom, actif: true };
    });
  }
}
