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
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { exigerUuidParam, Valideur } from '../common/validation.js';
import { PG_POOL } from '../db/db.module.js';
import { enTransaction } from '../db/transaction.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { PerimetreService } from '../habilitation/perimetre.service.js';
import { JournalService } from '../journal/journal.service.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';

export const CRITERES = [
  'rang_protocolaire',
  'urgence',
  'importance_strategique',
  'relation',
] as const;
type Critere = (typeof CRITERES)[number];
/** Statuts où la priorité a encore un sens (demande ni close, ni rejetée, ni réalisée). */
const STATUTS_PRIORISABLES = ['recue', 'qualifiee', 'differee', 'validee', 'planifiee'];

interface Valeur {
  code: string;
  libelle: string;
  rang: number;
}

/**
 * Priorité d'une demande : réponses de M. Jordan du 22/10/2026, règle provisoire HYPOTHESE(DEC-37).
 * - Six critères, tous visibles : agenda et chronologie (portés par la demande), rang protocolaire,
 *   urgence, importance stratégique et relation, saisis comme valeurs d'un référentiel.
 *   L'Assistant (et l'Autorité) les saisissent : c'est de la qualification.
 * - Le NIVEAU de priorité est fixé par l'Autorité (droit « P » de « Changer priorité ») ; l'Assistant
 *   seulement sous délégation (inactive : refusé). Libellé textuel ; justification facultative,
 *   à donner si l'écart est contesté.
 * - AUCUNE formule : rien n'est calculé à partir des critères. La file de décision suit le niveau fixé,
 *   puis la plus ancienne en cas d'égalité (une demande sans niveau compte comme le niveau le plus bas).
 */
@Controller()
export class PrioriteController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly journal: JournalService,
    private readonly perimetre: PerimetreService,
  ) {}

  private async referentiel(q: Pick<Pool | PoolClient, 'query'>) {
    const { rows } = await q.query<Valeur & { critere: string }>(
      `SELECT critere, code, libelle, rang FROM priorite_referentiel WHERE actif ORDER BY critere, rang`,
    );
    const r: Record<string, Valeur[]> = {};
    for (const { critere, ...v } of rows) (r[critere] ??= []).push(v);
    return r;
  }

  @Get('priorite/referentiel')
  @ExigeDroit('demande.consulter')
  async lireReferentiel() {
    return this.referentiel(this.pool);
  }

  private async verrouiller(c: PoolClient, ctx: Contexte, id: string) {
    const { rows } = await c.query<
      Record<string, string | null> & { statut: string; agenda_id: string }
    >(
      `SELECT statut, agenda_id, rang_protocolaire, urgence, importance_strategique, relation, priorite
         FROM demande WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
      [id, ctx.organisationId],
    );
    const d = rows[0];
    if (!d) throw new NotFoundException('Demande introuvable.');
    if (!STATUTS_PRIORISABLES.includes(d.statut))
      throw new ConflictException('La priorité ne se modifie plus à ce stade de la demande.');
    return d;
  }

  /** Saisie des critères (valeurs du référentiel ; vide = effacer). Journalisé : codes seulement. */
  @Patch('demandes/:id/criteres')
  @ExigeDroit('demande.saisir_criteres')
  async criteres(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    return enTransaction(this.pool, async (c) => {
      const ref = await this.referentiel(c);
      const v = new Valideur(corps);
      const saisis: Partial<Record<Critere, string | null>> = {};
      for (const k of CRITERES)
        if (v.a(k)) {
          const code = v.texte(k, { max: 50 });
          if (code !== null && !(ref[k] ?? []).some((x) => x.code === code))
            v.erreur(k, `Valeur attendue : ${(ref[k] ?? []).map((x) => x.code).join(', ')}.`);
          saisis[k] = code;
        }
      if (!Object.keys(saisis).length)
        v.erreur('(corps)', `Aucun critère fourni (${CRITERES.join(', ')}).`);
      v.fin();
      const d = await this.verrouiller(c, ctx, id);
      const modifies = CRITERES.filter((k) => k in saisis && saisis[k] !== d[k]);
      if (modifies.length) {
        const apres = { ...d, ...saisis };
        await c.query(
          `UPDATE demande SET rang_protocolaire=$3, urgence=$4, importance_strategique=$5, relation=$6,
                  criteres_saisis_par=$7, criteres_saisis_le=now(), modifie_le=now()
            WHERE id=$1 AND organisation_id=$2`,
          [
            id,
            ctx.organisationId,
            apres.rang_protocolaire,
            apres.urgence,
            apres.importance_strategique,
            apres.relation,
            ctx.utilisateurId,
          ],
        );
        await this.journal.enregistrer(c, {
          organisationId: ctx.organisationId,
          utilisateurId: ctx.utilisateurId,
          action: 'demande.saisir_criteres',
          objetType: 'demande',
          objetId: id,
          // Codes d'un référentiel, pas de texte libre.
          contexte: Object.fromEntries(modifies.map((k) => [k, { de: d[k], vers: saisis[k] }])),
        });
      }
      return {
        id,
        ...Object.fromEntries(CRITERES.map((k) => [k, k in saisis ? saisis[k] : d[k]])),
      };
    });
  }

  /** Niveau de priorité, fixé par l'Autorité rattachée à l'agenda (périmètre DEC-32). */
  @Post('demandes/:id/priorite')
  @HttpCode(200)
  @ExigeDroit('demande.changer_priorite')
  async priorite(
    @ContexteCourant() ctx: Contexte,
    @Param('id') idBrut: string,
    @Body() corps: unknown,
  ) {
    const id = exigerUuidParam('id', idBrut);
    return enTransaction(this.pool, async (c) => {
      const ref = await this.referentiel(c);
      const v = new Valideur(corps);
      const niveau = v.texte('niveau', { requis: true, max: 50 });
      const justification = v.texte('justification', { max: 2000 });
      if (niveau !== null && !(ref.niveau ?? []).some((x) => x.code === niveau))
        v.erreur(
          'niveau',
          `Valeur attendue : ${(ref.niveau ?? []).map((x) => x.code).join(', ')}.`,
        );
      v.fin();
      const d = await this.verrouiller(c, ctx, id);
      await this.perimetre.exiger(c, ctx, d.agenda_id, 'decision', {
        action: 'demande.changer_priorite',
        objetType: 'demande',
        objetId: id,
      });
      await c.query(
        `UPDATE demande SET priorite=$3, priorite_justification=$4, priorite_fixee_par=$5,
                priorite_fixee_le=now(), modifie_le=now()
          WHERE id=$1 AND organisation_id=$2`,
        [id, ctx.organisationId, niveau, justification, ctx.utilisateurId],
      );
      await this.journal.enregistrer(c, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: 'demande.changer_priorite',
        objetType: 'demande',
        objetId: id,
        // La justification (texte libre) reste dans la demande (Q-5) ; ici, codes et indicateur.
        contexte: { de: d.priorite, vers: niveau, justifiee: justification !== null },
      });
      return { id, priorite: niveau, priorite_justification: justification };
    });
  }
}
