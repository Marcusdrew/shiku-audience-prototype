import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { ErreurValidation, exigerUuidParam, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { SQL_RATTACHEMENT_ACTIF } from '../habilitation/perimetre.service.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Periode {
  autoriteId: string | null;
  debut: string | null;
  fin: string | null;
}

/** Autorité désignée, et période facultative (dates AAAA-MM-JJ ; début par défaut : aujourd'hui). */
function lirePeriode(v: Valideur, requis: boolean): Periode {
  const autoriteId = v.uuid('autorite_id', requis);
  const debut = v.texte('debut', { max: 10 });
  const fin = v.texte('fin', { max: 10 });
  for (const [champ, d] of [
    ['debut', debut],
    ['fin', fin],
  ] as const)
    if (d !== null && (!DATE.test(d) || Number.isNaN(Date.parse(d))))
      v.erreur(champ, 'Date AAAA-MM-JJ attendue.');
  if (debut && fin && fin < debut) v.erreur('fin', 'La fin précède le début.');
  return { autoriteId, debut, fin };
}

/**
 * Agendas et rattachement à une Autorité (périmètre, HYPOTHESE(DEC-32), réponses de M. Jordan du
 * 22/10/2026). À la création, l'Autorité de rattachement est obligatoire : l'Administrateur la
 * PROPOSE ; elle est active une fois AUTORISÉE par l'Autorité désignée puis APPLIQUÉE par
 * l'Administrateur. Chaque étape est journalisée (catégorie à venir : « droits et délégations »).
 *
 * HYPOTHESE : la règle de visibilité d'un agenda (EF03-24, US-05-026) n'est pas définie ; tout agenda
 * actif de l'organisation est visible par les rôles autorisés à les lister.
 */
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
      `SELECT a.id, a.nom, a.actif,
              NOT EXISTS (SELECT 1 FROM rattachement_agenda r
                           WHERE r.agenda_id = a.id AND ${SQL_RATTACHEMENT_ACTIF}) AS a_rattacher,
              coalesce((
                SELECT json_agg(json_build_object(
                         'id', r.id, 'autorite_id', r.autorite_id, 'autorite_nom', u.nom_complet,
                         'statut', r.statut, 'debut', r.debut::text, 'fin', r.fin::text,
                         'en_vigueur', r.statut = 'actif' AND r.debut <= current_date
                                       AND (r.fin IS NULL OR r.fin >= current_date),
                         'est_moi', r.autorite_id = $2)
                         ORDER BY r.propose_le)
                  FROM rattachement_agenda r JOIN utilisateur u ON u.id = r.autorite_id
                 WHERE r.agenda_id = a.id AND r.statut <> 'revoque'), '[]'::json) AS rattachements
         FROM agenda a
        WHERE a.organisation_id = $1 AND a.actif
        ORDER BY a.nom`,
      [ctx.organisationId, ctx.utilisateurId],
    );
    return { elements: rows };
  }

  @Post()
  @ExigeDroit('agenda.administrer')
  async creer(@ContexteCourant() ctx: Contexte, @Body() corps: unknown) {
    const v = new Valideur(corps);
    const nom = v.texte('nom', { requis: true, max: 200 });
    const periode = lirePeriode(v, true);
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
      const rattachement = await proposer(c, this.journal, ctx, id, periode);
      return { id, nom, actif: true, rattachement };
    });
  }

  /** Nouveau rattachement d'un agenda existant (proposé par l'Administrateur). */
  @Post(':id/rattachements')
  @ExigeDroit('agenda.administrer')
  async rattacher(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    const v = new Valideur(corps);
    const periode = lirePeriode(v, true);
    v.fin();
    return enTransaction(this.pool, async (c) => {
      const ag = await c.query(
        `SELECT 1 FROM agenda WHERE id=$1 AND organisation_id=$2 AND actif`,
        [id, ctx.organisationId],
      );
      if (!ag.rowCount) throw new NotFoundException('Agenda introuvable.');
      return proposer(c, this.journal, ctx, id, periode);
    });
  }
}

async function proposer(
  c: PoolClient,
  journal: JournalService,
  ctx: Contexte,
  agendaId: string,
  p: Periode,
) {
  const u = await c.query(
    `SELECT 1 FROM utilisateur WHERE id=$1 AND organisation_id=$2 AND actif`,
    [p.autoriteId, ctx.organisationId],
  );
  if (!u.rowCount)
    throw new ErreurValidation([{ champ: 'autorite_id', message: 'Compte inconnu ou inactif.' }]);
  if (p.autoriteId === ctx.utilisateurId)
    throw new ConflictException('Un administrateur ne peut pas se désigner lui-même Autorité.');
  let ligne: { id: string; statut: string };
  try {
    const r = await c.query<{ id: string; statut: string }>(
      `INSERT INTO rattachement_agenda (organisation_id, agenda_id, autorite_id, debut, fin, propose_par)
       VALUES ($1, $2, $3, coalesce($4::date, current_date), $5::date, $6)
       RETURNING id, statut`,
      [ctx.organisationId, agendaId, p.autoriteId, p.debut, p.fin, ctx.utilisateurId],
    );
    ligne = r.rows[0]!;
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new ConflictException(
        'Un rattachement de cette Autorité à cet agenda est déjà en cours.',
      );
    throw e;
  }
  await journal.enregistrer(c, {
    organisationId: ctx.organisationId,
    utilisateurId: ctx.utilisateurId,
    action: 'rattachement_agenda.proposer',
    objetType: 'rattachement_agenda',
    objetId: ligne.id,
    contexte: { agenda_id: agendaId, autorite_id: p.autoriteId },
  });
  return { id: ligne.id, agenda_id: agendaId, autorite_id: p.autoriteId, statut: ligne.statut };
}

type Etape = 'autoriser' | 'appliquer' | 'revoquer';
const TRANSITION: Record<Etape, { de: readonly string[]; vers: string; colonne: string }> = {
  autoriser: { de: ['propose'], vers: 'autorise', colonne: 'autorise' },
  appliquer: { de: ['autorise'], vers: 'actif', colonne: 'applique' },
  revoquer: { de: ['propose', 'autorise', 'actif'], vers: 'revoque', colonne: 'revoque' },
};

/**
 * Étapes d'un rattachement. L'Autorité désignée autorise ou révoque SON rattachement (pas celui d'une
 * autre) ; l'Administrateur applique un rattachement autorisé. La révocation prend effet à la requête
 * suivante (chaque contrôle relit la table).
 */
@Controller('rattachements')
export class RattachementsController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
  ) {}

  @Post(':id/autoriser')
  @HttpCode(200)
  @ExigeDroit('agenda.autoriser_rattachement')
  autoriser(@ContexteCourant() ctx: Contexte, @Param('id') id: string) {
    return this.etape(ctx, exigerUuidParam('id', id), 'autoriser');
  }

  @Post(':id/appliquer')
  @HttpCode(200)
  @ExigeDroit('agenda.administrer')
  appliquer(@ContexteCourant() ctx: Contexte, @Param('id') id: string) {
    return this.etape(ctx, exigerUuidParam('id', id), 'appliquer');
  }

  @Post(':id/revoquer')
  @HttpCode(200)
  @ExigeDroit('agenda.autoriser_rattachement')
  revoquer(@ContexteCourant() ctx: Contexte, @Param('id') id: string) {
    return this.etape(ctx, exigerUuidParam('id', id), 'revoquer');
  }

  private etape(ctx: Contexte, id: string, etape: Etape) {
    const t = TRANSITION[etape];
    return enTransaction(this.pool, async (c) => {
      const cur = await c.query<{ statut: string; autorite_id: string; agenda_id: string }>(
        `SELECT statut, autorite_id, agenda_id FROM rattachement_agenda
          WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,
        [id, ctx.organisationId],
      );
      const r = cur.rows[0];
      if (!r) throw new NotFoundException('Rattachement introuvable.');
      if (etape !== 'appliquer' && r.autorite_id !== ctx.utilisateurId)
        throw new ForbiddenException('Seule l’Autorité désignée peut autoriser ou révoquer.');
      if (!t.de.includes(r.statut))
        throw new ConflictException(`Étape « ${etape} » impossible au statut « ${r.statut} ».`);
      await c.query(
        `UPDATE rattachement_agenda SET statut=$3, ${t.colonne}_par=$4, ${t.colonne}_le=now()
          WHERE id=$1 AND organisation_id=$2`,
        [id, ctx.organisationId, t.vers, ctx.utilisateurId],
      );
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: `rattachement_agenda.${etape}`,
        objetType: 'rattachement_agenda',
        objetId: id,
        contexte: {
          agenda_id: r.agenda_id,
          autorite_id: r.autorite_id,
          de: r.statut,
          vers: t.vers,
        },
      });
      return { id, agenda_id: r.agenda_id, autorite_id: r.autorite_id, statut: t.vers };
    });
  }
}
