import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { Pool } from 'pg';
import { pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

// Données restituées limitées à ce que la fonction exige (D03-12) : pas de dossier relationnel ici.
@Controller('visiteurs')
export class VisiteursController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
  ) {}

  @Get()
  @ExigeDroit('visiteur.rechercher')
  async rechercher(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const terme = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
    const { rows } = await this.pool.query(
      `SELECT id, nom_complet, contact, qualite FROM visiteur
        WHERE organisation_id = $1 AND ($2 = '' OR nom_complet ILIKE '%' || $2 || '%')
        ORDER BY lower(nom_complet) LIMIT $3 OFFSET $4`,
      [ctx.organisationId, terme.replace(/[%_\\]/g, (m) => `\\${m}`), limite, decalage],
    );
    return { elements: rows, limite, decalage };
  }

  /**
   * Arbitrage du 19/10/2026 (DEC-19) : Réception, Assistant et Autorité créent un visiteur. La Réception
   * ne saisit que l'identité minimale et le contact ; la qualification (champ `qualite`) reste à
   * l'Assistant, ou à l'Autorité. Contrôlé ici, côté serveur, et non par l'affichage.
   * La recherche préalable de doublon est guidée par l'interface ; son caractère bloquant n'est pas
   * décidé (question Q-12) et n'est donc pas imposé par le serveur.
   */
  @Post()
  @ExigeDroit('visiteur.creer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const nom = v.texte('nom_complet', { requis: true, max: 200 });
    const contact = v.texte('contact', { max: 300 });
    const qualite = v.texte('qualite', { max: 200 });
    const qualifie = ctx.identite.roles.some((r) => r === 'assistant' || r === 'authority');
    if (qualite !== null && !qualifie)
      v.erreur(
        'qualite',
        'La qualification du visiteur est réservée à l’Assistant ou à l’Autorité.',
      );
    v.fin();
    return enTransaction(this.pool, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO visiteur (organisation_id, nom_complet, contact, qualite, cree_par)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ctx.organisationId, nom, contact, qualite, ctx.utilisateurId],
      );
      const id = rows[0]!.id;
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'visiteur.creer',
        objetType: 'visiteur',
        objetId: id,
      });
      return { id, nom_complet: nom, contact, qualite };
    });
  }
}
