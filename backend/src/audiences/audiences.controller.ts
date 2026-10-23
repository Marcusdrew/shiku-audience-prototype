import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { ErreurValidation, exigerUuidParam, pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { PerimetreService } from '../habilitation/perimetre.service.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

const COLONNES = `au.id, au.demande_id, de.reference AS demande_reference, au.agenda_id,
  ag.nom AS agenda_nom, au.statut, au.debut_prevu, au.duree_prevue_minutes,
  au.responsable_suivi_id, au.debut_reel, au.fin_reel, au.resultat,
  CASE WHEN au.fin_reel IS NOT NULL
       THEN (EXTRACT(EPOCH FROM (au.fin_reel - au.debut_reel)) / 60)::int END AS duree_reelle_minutes,
  au.cloturee_le, au.conservation_echeance::text AS conservation_echeance, au.cree_le`;
const JOINTURES = `FROM audience au JOIN demande de ON de.id = au.demande_id
  JOIN agenda ag ON ag.id = au.agenda_id`;

type StatutAudience = 'planifiee' | 'en_cours' | 'terminee' | 'cloturee';

@Controller('audiences')
export class AudiencesController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    private readonly perimetre: PerimetreService,
  ) {}

  private async lire(q: Pick<Pool, 'query'>, ctx: Contexte, id: string) {
    const { rows } = await q.query(
      `SELECT ${COLONNES} ${JOINTURES} WHERE au.id=$1 AND au.organisation_id=$2`,
      [id, ctx.organisationId],
    );
    if (!rows[0]) throw new NotFoundException('Audience introuvable.');
    return rows[0] as Record<string, unknown>;
  }

  /**
   * Verrouille l'audience ET sa demande, dans cet ordre, pour éviter deux changements simultanés,
   * puis contrôle le périmètre du suivi sur l'agenda de l'audience (HYPOTHESE(DEC-32)).
   */
  private async verrouiller(c: PoolClient, ctx: Contexte, id: string) {
    const { rows } = await c.query<{
      statut: StatutAudience;
      demande_id: string;
      agenda_id: string;
    }>(
      `SELECT statut, demande_id, agenda_id FROM audience
        WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,
      [id, ctx.organisationId],
    );
    if (!rows[0]) throw new NotFoundException('Audience introuvable.');
    await c.query(`SELECT 1 FROM demande WHERE id=$1 FOR UPDATE`, [rows[0].demande_id]);
    await this.perimetre.exiger(c, ctx, rows[0].agenda_id, 'suivi');
    return rows[0];
  }

  /** Planning d'un agenda sur une période (US-05-051). */
  @Get()
  @ExigeDroit('audience.consulter')
  async planning(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const agendaId =
      typeof q.agenda_id === 'string' ? exigerUuidParam('agenda_id', q.agenda_id) : null;
    const date = (champ: string): Date | null => {
      const brut = q[champ];
      if (brut === undefined) return null;
      const v = new Valideur({ [champ]: brut });
      const d = v.dateHeure(champ);
      v.fin();
      return d;
    };
    const du = date('du');
    const au = date('au');
    const { rows } = await this.pool.query(
      `SELECT ${COLONNES} ${JOINTURES}
        WHERE au.organisation_id = $1
          AND ($2::uuid IS NULL OR au.agenda_id = $2)
          AND ($3::timestamptz IS NULL OR au.debut_prevu >= $3)
          AND ($4::timestamptz IS NULL OR au.debut_prevu < $4)
        ORDER BY au.debut_prevu, au.id LIMIT $5 OFFSET $6`,
      [ctx.organisationId, agendaId, du, au, limite, decalage],
    );
    return { elements: rows, limite, decalage };
  }

  @Get(':id')
  @ExigeDroit('audience.consulter')
  consulter(@ContexteCourant() ctx: Contexte, @Param('id') id: string) {
    return this.lire(this.pool, ctx, exigerUuidParam('id', id));
  }

  @Post()
  @ExigeDroit('audience.planifier')
  async planifier(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const demandeId = v.uuid('demande_id', true);
    const agendaId = v.uuid('agenda_id');
    const debut = v.dateHeure('debut_prevu', true);
    const duree = v.entier('duree_prevue_minutes', 1, 1440, true);
    const responsableId = v.uuid('responsable_suivi_id');
    v.fin();

    return enTransaction(this.pool, async (c) => {
      const dem = await c.query<{ statut: string; agenda_id: string }>(
        `SELECT statut, agenda_id FROM demande WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,
        [demandeId, ctx.organisationId],
      );
      if (!dem.rows[0]) throw new NotFoundException('Demande introuvable.');
      if (dem.rows[0].statut !== 'validee')
        throw new ConflictException(
          `Seule une demande validée peut être planifiée (statut actuel : « ${dem.rows[0].statut} »).`,
        );
      const agenda = agendaId ?? dem.rows[0].agenda_id;
      const ag = await c.query(
        `SELECT 1 FROM agenda WHERE id=$1 AND organisation_id=$2 AND actif`,
        [agenda, ctx.organisationId],
      );
      if (!ag.rowCount)
        throw new ErreurValidation([{ champ: 'agenda_id', message: 'Référence inconnue.' }]);
      await this.perimetre.exiger(c, ctx, agenda, 'decision');
      if (responsableId) {
        const r = await c.query(
          `SELECT 1 FROM utilisateur WHERE id=$1 AND organisation_id=$2 AND actif`,
          [responsableId, ctx.organisationId],
        );
        if (!r.rowCount)
          throw new ErreurValidation([
            { champ: 'responsable_suivi_id', message: 'Référence inconnue.' },
          ]);
      }
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO audience (organisation_id, demande_id, agenda_id, debut_prevu,
                               duree_prevue_minutes, responsable_suivi_id, cree_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          ctx.organisationId,
          demandeId,
          agenda,
          debut,
          duree,
          responsableId ?? ctx.utilisateurId,
          ctx.utilisateurId,
        ],
      );
      const id = rows[0]!.id;
      await c.query(`UPDATE demande SET statut='planifiee', modifie_le=now() WHERE id=$1`, [
        demandeId,
      ]);
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'audience.planifier',
        objetType: 'audience',
        objetId: id,
        contexte: { demande_id: demandeId, agenda_id: agenda },
      });
      return this.lire(c, ctx, id);
    });
  }

  @Post(':id/demarrer')
  @HttpCode(200)
  @ExigeDroit('audience.demarrer_terminer')
  async demarrer(@ContexteCourant() ctx: Contexte, @Param('id') idBrut: string) {
    const id = exigerUuidParam('id', idBrut);
    return enTransaction(this.pool, async (c) => {
      const a = await this.verrouiller(c, ctx, id);
      if (a.statut !== 'planifiee')
        throw new ConflictException(`Démarrage impossible au statut « ${a.statut} ».`);
      await c.query(`UPDATE audience SET statut='en_cours', debut_reel=now() WHERE id=$1`, [id]);
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'audience.demarrer',
        objetType: 'audience',
        objetId: id,
      });
      return this.lire(c, ctx, id);
    });
  }

  @Post(':id/terminer')
  @HttpCode(200)
  @ExigeDroit('audience.demarrer_terminer')
  async terminer(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    const v = new Valideur(corps);
    const resultat = v.texte('resultat', { requis: true, max: 4000 });
    v.fin();
    return enTransaction(this.pool, async (c) => {
      const a = await this.verrouiller(c, ctx, id);
      if (a.statut !== 'en_cours')
        throw new ConflictException(`Fin impossible au statut « ${a.statut} ».`);
      await c.query(
        `UPDATE audience SET statut='terminee', fin_reel=GREATEST(clock_timestamp(), debut_reel), resultat=$2
          WHERE id=$1`,
        [id, resultat],
      );
      await c.query(`UPDATE demande SET statut='realisee', modifie_le=now() WHERE id=$1`, [
        a.demande_id,
      ]);
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'audience.terminer',
        objetType: 'audience',
        objetId: id,
      });
      return this.lire(c, ctx, id);
    });
  }

  /**
   * Clôture du traitement : l'Assistant ou l'Autorité clôt directement (arbitrage de M. Jordan du
   * 19/10/2026) ; les autres rôles reçoivent 403. Seule une audience démarrée puis terminée, donc avec
   * résultat et durée réelle, peut être clôturée. Aucune route ne la rouvre : la clôture est
   * irréversible et fixe le point de départ de la conservation de 5 ans.
   */
  @Post(':id/cloturer')
  @HttpCode(200)
  @ExigeDroit('audience.cloturer')
  async cloturer(@ContexteCourant() ctx: Contexte, @Param('id') idBrut: string) {
    const id = exigerUuidParam('id', idBrut);
    return enTransaction(this.pool, async (c) => {
      const a = await this.verrouiller(c, ctx, id);
      if (a.statut !== 'terminee')
        throw new ConflictException(`Clôture impossible au statut « ${a.statut} ».`);
      // D03-06 / D04-06 : point de départ de conservation à 5 ans, calculé par la base.
      const cl = await c.query<{ duree_prevue_minutes: number; duree_reelle_minutes: number }>(
        `UPDATE audience SET statut='cloturee', cloturee_par=$2, cloturee_le=now(),
                conservation_echeance=(now() + interval '5 years')::date WHERE id=$1
         RETURNING duree_prevue_minutes,
                   round(extract(epoch FROM (fin_reel - debut_reel)) / 60)::int AS duree_reelle_minutes`,
        [id, ctx.utilisateurId],
      );
      await c.query(`UPDATE demande SET statut='cloturee', modifie_le=now() WHERE id=$1`, [
        a.demande_id,
      ]);
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'audience.cloturer',
        objetType: 'audience',
        objetId: id,
        // Trace de clôture (arbitrage du 19/10, point 6) : identifiants et durées seulement. Le texte du
        // résultat reste dans l'audience (le journal ne contient que des identifiants : point 4, Q-5).
        // Auteur nominatif et heure serveur : colonnes du journal. Motif d'écart et délégation : non
        // développés (« écart » non défini, délégations au Sprint 2).
        contexte: {
          demande_id: a.demande_id,
          duree_prevue_minutes: cl.rows[0]!.duree_prevue_minutes,
          duree_reelle_minutes: cl.rows[0]!.duree_reelle_minutes,
        },
      });
      return this.lire(c, ctx, id);
    });
  }
}
