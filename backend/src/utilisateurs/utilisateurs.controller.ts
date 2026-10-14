import { Body, ConflictException, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { Pool } from 'pg';
import { pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from './contexte.js';

/**
 * Rattachement d'une personne (sub Keycloak) à l'organisation : acte d'administration explicite,
 * jamais automatique (H6). Le premier administrateur est posé par scripts/amorcer-donnees-test.mjs.
 */
@Controller('utilisateurs')
export class UtilisateursController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
  ) {}

  @Get()
  @ExigeDroit('utilisateur.administrer')
  async lister(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const { rows } = await this.pool.query(
      `SELECT id, nom_complet, actif, cree_le FROM utilisateur
        WHERE organisation_id = $1 ORDER BY nom_complet LIMIT $2 OFFSET $3`,
      [ctx.organisationId, limite, decalage],
    );
    return { elements: rows, limite, decalage };
  }

  @Post()
  @ExigeDroit('utilisateur.administrer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const sub = v.texte('keycloak_sub', { requis: true, max: 200 });
    const nom = v.texte('nom_complet', { requis: true, max: 200 });
    v.fin();
    return enTransaction(this.pool, async (c) => {
      let id: string;
      try {
        const r = await c.query<{ id: string }>(
          `INSERT INTO utilisateur (organisation_id, keycloak_sub, nom_complet)
           VALUES ($1, $2, $3) RETURNING id`,
          [ctx.organisationId, sub, nom],
        );
        id = r.rows[0]!.id;
      } catch (e) {
        if ((e as { code?: string }).code === '23505')
          throw new ConflictException('Ce compte Keycloak est déjà rattaché.');
        throw e;
      }
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'utilisateur.creer',
        objetType: 'utilisateur',
        objetId: id,
        contexte: { nom_complet: nom },
      });
      return { id, nom_complet: nom, actif: true };
    });
  }
}
