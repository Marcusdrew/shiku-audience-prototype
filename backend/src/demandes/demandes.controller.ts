import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { ErreurValidation, exigerUuidParam, pagination, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { HabilitationService } from '../habilitation/habilitation.service.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';
import { STATUTS_DEMANDE, STATUTS_MODIFIABLES, type StatutDemande } from './statuts.js';

const COLONNES = `d.id, d.reference, d.statut, d.objet, d.contact, d.derogation,
  d.qualification_initiale, d.qualifiee_le, d.cree_le, d.modifie_le,
  d.visiteur_id, v.nom_complet AS visiteur_nom,
  d.agenda_id, a.nom AS agenda_nom,
  d.responsable_suivi_id, r.nom_complet AS responsable_suivi_nom,
  d.cree_par, c.nom_complet AS cree_par_nom`;
const JOINTURES = `FROM demande d
  JOIN visiteur v ON v.id = d.visiteur_id
  JOIN agenda a ON a.id = d.agenda_id
  JOIN utilisateur r ON r.id = d.responsable_suivi_id
  JOIN utilisateur c ON c.id = d.cree_par`;

@Controller('demandes')
export class DemandesController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    private readonly habilitation: HabilitationService,
  ) {}

  private async chargerVerrouillee(c: PoolClient, ctx: Contexte, id: string) {
    const { rows } = await c.query<{ id: string; statut: StatutDemande }>(
      `SELECT id, statut FROM demande WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [id, ctx.organisationId],
    );
    if (!rows[0]) throw new NotFoundException('Demande introuvable.');
    return rows[0];
  }

  @Post()
  @ExigeDroit('demande.creer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const visiteurId = v.uuid('visiteur_id', true);
    const agendaId = v.uuid('agenda_id', true);
    const objet = v.texte('objet', { requis: true, max: 2000 });
    const contact = v.texte('contact', { max: 300 });
    const derogation = v.texte('derogation', { max: 1000 });
    const responsableId = v.uuid('responsable_suivi_id');
    if (!contact && !derogation)
      v.erreur('contact', 'Contact requis, ou dérogation justifiée dans « derogation ».');
    v.fin();

    return enTransaction(this.pool, async (c) => {
      const verif = async (sql: string, id: string | null, msg: string) => {
        if (!id) return;
        const r = await c.query(sql, [id, ctx.organisationId]);
        if (!r.rowCount)
          throw new ErreurValidation([{ champ: msg, message: 'Référence inconnue.' }]);
      };
      await verif(
        `SELECT 1 FROM visiteur WHERE id=$1 AND organisation_id=$2`,
        visiteurId,
        'visiteur_id',
      );
      await verif(
        `SELECT 1 FROM agenda WHERE id=$1 AND organisation_id=$2 AND actif`,
        agendaId,
        'agenda_id',
      );
      await verif(
        `SELECT 1 FROM utilisateur WHERE id=$1 AND organisation_id=$2 AND actif`,
        responsableId,
        'responsable_suivi_id',
      );
      // HYPOTHESE H3 : DEM-AAAA-NNNNNN, compteur par organisation et par année.
      const compteur = await c.query<{ annee: number; dernier: number }>(
        `INSERT INTO compteur_reference (organisation_id, annee, dernier)
         VALUES ($1, EXTRACT(YEAR FROM now())::int, 1)
         ON CONFLICT (organisation_id, annee)
         DO UPDATE SET dernier = compteur_reference.dernier + 1
         RETURNING annee, dernier`,
        [ctx.organisationId],
      );
      const { annee, dernier } = compteur.rows[0]!;
      const reference = `DEM-${annee}-${String(dernier).padStart(6, '0')}`;
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO demande (organisation_id, reference, visiteur_id, agenda_id, objet, contact,
                              derogation, responsable_suivi_id, cree_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          ctx.organisationId,
          reference,
          visiteurId,
          agendaId,
          objet,
          contact,
          derogation,
          responsableId ?? ctx.utilisateurId,
          ctx.utilisateurId,
        ],
      );
      const id = rows[0]!.id;
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'demande.creer',
        objetType: 'demande',
        objetId: id,
        contexte: { reference, derogation: derogation !== null },
      });
      return this.detail(c, ctx, id, false);
    });
  }

  @Get()
  @ExigeDroit('demande.consulter')
  async lister(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    let statut: string | null = null;
    if (q.statut !== undefined) {
      if (
        typeof q.statut !== 'string' ||
        !(STATUTS_DEMANDE as readonly string[]).includes(q.statut)
      )
        throw new ErreurValidation([{ champ: 'statut', message: 'Statut inconnu.' }]);
      statut = q.statut;
    }
    const agendaId =
      typeof q.agenda_id === 'string' ? exigerUuidParam('agenda_id', q.agenda_id) : null;
    const terme = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
    const { rows } = await this.pool.query(
      `SELECT ${COLONNES}, count(*) OVER() AS total ${JOINTURES}
        WHERE d.organisation_id = $1
          AND ($2::text IS NULL OR d.statut = $2)
          AND ($3::uuid IS NULL OR d.agenda_id = $3)
          AND ($4 = '' OR d.reference ILIKE '%' || $4 || '%' OR d.objet ILIKE '%' || $4 || '%'
               OR v.nom_complet ILIKE '%' || $4 || '%')
        ORDER BY d.cree_le DESC, d.reference DESC
        LIMIT $5 OFFSET $6`,
      [
        ctx.organisationId,
        statut,
        agendaId,
        terme.replace(/[%_\\]/g, (m) => `\\${m}`),
        limite,
        decalage,
      ],
    );
    const total = rows[0] ? Number(rows[0].total) : 0;
    return {
      elements: rows.map((r) => {
        const copie = { ...(r as Record<string, unknown>) };
        delete copie.total;
        return copie;
      }),
      total,
      limite,
      decalage,
    };
  }

  @Get(':id')
  @ExigeDroit('demande.consulter')
  async consulter(@ContexteCourant() ctx: Contexte, @Param('id') id: string) {
    return this.detail(this.pool, ctx, exigerUuidParam('id', id), true);
  }

  /** Détail + chaîne Demande → Décisions → Audience (US-05-017), selon les droits de l'appelant. */
  private async detail(
    q: Pick<Pool, 'query'>,
    ctx: Contexte,
    id: string,
    avecChaine: boolean,
  ): Promise<Record<string, unknown>> {
    const { rows } = await q.query(
      `SELECT ${COLONNES} ${JOINTURES} WHERE d.id = $1 AND d.organisation_id = $2`,
      [id, ctx.organisationId],
    );
    if (!rows[0]) throw new NotFoundException('Demande introuvable.');
    const res: Record<string, unknown> = { ...rows[0] };
    if (!avecChaine) return res;
    const roles = ctx.identite.roles;
    if (this.habilitation.estAutorise(roles, 'decision.consulter')) {
      const d = await q.query(
        `SELECT x.id, x.type, x.motif, x.decide_le, x.decide_par, u.nom_complet AS decide_par_nom
           FROM decision x JOIN utilisateur u ON u.id = x.decide_par
          WHERE x.demande_id = $1 AND x.organisation_id = $2 ORDER BY x.decide_le, x.id`,
        [id, ctx.organisationId],
      );
      res.decisions = d.rows;
    }
    if (this.habilitation.estAutorise(roles, 'audience.consulter')) {
      const a = await q.query(
        `SELECT id, statut, agenda_id, debut_prevu, duree_prevue_minutes, debut_reel, fin_reel,
                resultat, cloturee_le, conservation_echeance::text AS conservation_echeance
           FROM audience WHERE demande_id = $1 AND organisation_id = $2`,
        [id, ctx.organisationId],
      );
      res.audience = a.rows[0] ?? null;
    }
    return res;
  }

  @Patch(':id')
  @ExigeDroit('demande.modifier')
  async modifier(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    const v = new Valideur(corps);
    const champs: Record<string, string | null> = {};
    if (v.a('objet')) champs.objet = v.texte('objet', { requis: true, max: 2000 });
    if (v.a('contact')) champs.contact = v.texte('contact', { max: 300 });
    if (v.a('derogation')) champs.derogation = v.texte('derogation', { max: 1000 });
    if (v.a('agenda_id')) champs.agenda_id = v.uuid('agenda_id', true);
    if (!['objet', 'contact', 'derogation', 'agenda_id'].some((k) => v.a(k)))
      v.erreur('(corps)', 'Aucun champ modifiable fourni (objet, contact, derogation, agenda_id).');
    v.fin();

    return enTransaction(this.pool, async (c) => {
      const cur = await c.query<{
        statut: StatutDemande;
        contact: string | null;
        derogation: string | null;
      }>(
        `SELECT statut, contact, derogation FROM demande WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,
        [id, ctx.organisationId],
      );
      if (!cur.rows[0]) throw new NotFoundException('Demande introuvable.');
      if (!STATUTS_MODIFIABLES.includes(cur.rows[0].statut))
        throw new ConflictException(`Demande non modifiable au statut « ${cur.rows[0].statut} ».`);
      if (champs.agenda_id) {
        const r = await c.query(
          `SELECT 1 FROM agenda WHERE id=$1 AND organisation_id=$2 AND actif`,
          [champs.agenda_id, ctx.organisationId],
        );
        if (!r.rowCount)
          throw new ErreurValidation([{ champ: 'agenda_id', message: 'Référence inconnue.' }]);
      }
      const contact = 'contact' in champs ? champs.contact : cur.rows[0].contact;
      const derog = 'derogation' in champs ? champs.derogation : cur.rows[0].derogation;
      if (!contact && !derog)
        throw new ErreurValidation([
          { champ: 'contact', message: 'Contact requis, ou dérogation justifiée.' },
        ]);
      const noms = Object.keys(champs);
      const sets = noms.map((n, i) => `${n} = $${i + 3}`);
      await c.query(
        `UPDATE demande SET ${sets.join(', ')}, modifie_le = now() WHERE id=$1 AND organisation_id=$2`,
        [id, ctx.organisationId, ...noms.map((n) => champs[n])],
      );
      // Le journal garde les NOMS des champs modifiés, pas leurs valeurs (texte libre, non purgeable
      // avant 6 ans) : les valeurs sont dans la demande elle-même.
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'demande.modifier',
        objetType: 'demande',
        objetId: id,
        contexte: { champs: noms },
      });
      return this.detail(c, ctx, id, false);
    });
  }

  @Post(':id/qualification')
  @HttpCode(200)
  @ExigeDroit('demande.qualifier_initialement')
  async qualifier(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    const v = new Valideur(corps);
    const qualification = v.texte('qualification', { requis: true, max: 1000 });
    v.fin();
    return enTransaction(this.pool, async (c) => {
      const d = await this.chargerVerrouillee(c, ctx, id);
      if (d.statut !== 'recue')
        throw new ConflictException(`Qualification impossible au statut « ${d.statut} ».`);
      await c.query(
        `UPDATE demande SET statut='qualifiee', qualification_initiale=$3, qualifiee_par=$4,
                qualifiee_le=now(), modifie_le=now() WHERE id=$1 AND organisation_id=$2`,
        [id, ctx.organisationId, qualification, ctx.utilisateurId],
      );
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'demande.qualifier_initialement',
        objetType: 'demande',
        objetId: id,
      });
      return this.detail(c, ctx, id, false);
    });
  }
}
