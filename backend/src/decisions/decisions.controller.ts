import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { exigerUuidParam, pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { HabilitationService } from '../habilitation/habilitation.service.js';
import { PerimetreService, SQL_RATTACHEMENT_ACTIF } from '../habilitation/perimetre.service.js';
import { JournalService } from '../journal/journal.service.js';
import { STATUTS_DECIDABLES, type StatutDemande, transitionPermise } from '../demandes/statuts.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

const TYPES = ['valider', 'rejeter', 'differer'] as const;
const STATUT_CIBLE: Record<(typeof TYPES)[number], StatutDemande> = {
  valider: 'validee',
  rejeter: 'rejetee',
  differer: 'differee',
};

/**
 * Décisions sur les demandes. Aucun appel direct vers le module « demandes » (EF03-15) : la
 * décision et le changement de statut passent par le modèle de données, dans UNE transaction,
 * avec l'entrée de journal.
 */
@Controller()
export class DecisionsController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    private readonly habilitation: HabilitationService,
    private readonly perimetre: PerimetreService,
  ) {}

  /**
   * File des demandes en attente de décision, limitée aux agendas rattachés à l'Autorité qui consulte ;
   * pour l'Assistant, aux agendas rattachés à une Autorité (HYPOTHESE(DEC-32), en attendant le
   * périmètre par délégation). Les demandes d'un agenda sans rattachement sont dans la file « à rattacher »
   * (`GET /demandes?a_rattacher=true`). Tri (HYPOTHESE(DEC-37)) : niveau de priorité FIXÉ par
   * l'Autorité, puis la plus ancienne ; une demande sans niveau compte comme le niveau le plus bas.
   * Aucune formule n'est calculée à partir des critères.
   */
  @Get('decisions/file')
  @ExigeDroit('decision.consulter')
  async file(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const { rows } = await this.pool.query(
      `SELECT d.id, d.reference, d.statut, d.objet, d.cree_le, d.qualifiee_le, d.priorite,
              v.nom_complet AS visiteur_nom, a.nom AS agenda_nom
         FROM demande d JOIN visiteur v ON v.id = d.visiteur_id JOIN agenda a ON a.id = d.agenda_id
         LEFT JOIN priorite_referentiel pr ON pr.critere = 'niveau' AND pr.code = d.priorite
        WHERE d.organisation_id = $1 AND d.statut = ANY($2::text[])
          AND EXISTS (SELECT 1 FROM rattachement_agenda r
                       WHERE r.organisation_id = d.organisation_id AND r.agenda_id = d.agenda_id
                         AND (NOT $6 OR r.autorite_id = $5) AND ${SQL_RATTACHEMENT_ACTIF})
        ORDER BY coalesce(pr.rang, 1) DESC, d.cree_le ASC, d.reference ASC LIMIT $3 OFFSET $4`,
      [
        ctx.organisationId,
        STATUTS_DECIDABLES,
        limite,
        decalage,
        ctx.utilisateurId,
        ctx.identite.roles.includes('authority'),
      ],
    );
    return { elements: rows, limite, decalage };
  }

  @Post('demandes/:id/decision')
  @ExigeDroit('decision.valider_rejeter')
  async decider(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    const v = new Valideur(corps);
    const type = v.enumeration('type', TYPES, true);
    const motif = v.texte('motif', { requis: true, max: 2000 });
    v.fin();
    // Reporter une décision relève d'un droit distinct (US-05-044), contrôlé à l'exécution.
    if (
      type === 'differer' &&
      !this.habilitation.estAutorise(ctx.identite.roles, 'decision.differer')
    )
      throw new ForbiddenException('Droit insuffisant.');

    return enTransaction(this.pool, async (c) => {
      const cur = await c.query<{ statut: StatutDemande; agenda_id: string }>(
        `SELECT statut, agenda_id FROM demande WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,
        [id, ctx.organisationId],
      );
      if (!cur.rows[0]) throw new NotFoundException('Demande introuvable.');
      await this.perimetre.exiger(c, ctx, cur.rows[0].agenda_id, 'decision');
      const de = cur.rows[0].statut;
      const vers = STATUT_CIBLE[type!];
      if (!STATUTS_DECIDABLES.includes(de) || !transitionPermise(de, vers))
        throw new ConflictException(`Décision « ${type} » impossible au statut « ${de} ».`);
      const d = await c.query<{ id: string; decide_le: Date }>(
        `INSERT INTO decision (organisation_id, demande_id, type, motif, decide_par)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, decide_le`,
        [ctx.organisationId, id, type, motif, ctx.utilisateurId],
      );
      await c.query(
        `UPDATE demande SET statut=$3, modifie_le=now() WHERE id=$1 AND organisation_id=$2`,
        [id, ctx.organisationId, vers],
      );
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: `decision.${type}`,
        objetType: 'demande',
        objetId: id,
        // Point de départ de conservation d'un rejet (D04-07) : sa date est decide_le ; purge à venir.
        contexte: { decision_id: d.rows[0]!.id, de, vers },
      });
      return {
        id: d.rows[0]!.id,
        demande_id: id,
        type,
        motif,
        decide_le: d.rows[0]!.decide_le,
        statut_demande: vers,
      };
    });
  }
}
