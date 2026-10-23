import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { RefusSensiblesService, type Tentative } from '../journal/refus-sensibles.service.js';
import type { Contexte } from '../utilisateurs/contexte.js';

/**
 * Périmètre de l'Autorité par agenda : règle provisoire HYPOTHESE(DEC-32), réponses de M. Jordan du
 * 22/10/2026 (Q-10). Contrôle transverse, comme l'habilitation : il lit le modèle de données
 * (table `rattachement_agenda`) et n'appelle aucun module métier.
 *
 * - Agenda sans rattachement ACTIF à la date du jour : décisions et suivi refusés (409, file
 *   « à rattacher ») ; la consultation reste ouverte.
 * - Autorité : décide, planifie et suit seulement les agendas auxquels elle est rattachée (403 sinon).
 * - Assistant (droit P de la matrice pour le suivi) : HYPOTHESE(DEC-32), limité aux agendas rattachés à
 *   une Autorité ; le périmètre par délégation (agendas du délégant) attend les délégations (Sprint 2).
 */
export const SQL_RATTACHEMENT_ACTIF = `statut = 'actif' AND debut <= current_date
  AND (fin IS NULL OR fin >= current_date)`;

@Injectable()
export class PerimetreService {
  constructor(private readonly refus: RefusSensiblesService) {}

  async etat(
    q: Pick<Pool | PoolClient, 'query'>,
    ctx: Contexte,
    agendaId: string,
  ): Promise<{ rattache: boolean; moi: boolean }> {
    const { rows } = await q.query<{ rattache: boolean; moi: boolean }>(
      `SELECT count(*) > 0 AS rattache, coalesce(bool_or(autorite_id = $3), false) AS moi
         FROM rattachement_agenda
        WHERE organisation_id = $1 AND agenda_id = $2 AND ${SQL_RATTACHEMENT_ACTIF}`,
      [ctx.organisationId, agendaId, ctx.utilisateurId],
    );
    return rows[0] ?? { rattache: false, moi: false };
  }

  /**
   * Décision ou planification : réservées à une Autorité rattachée à l'agenda.
   * Suivi (démarrer, terminer, clôturer) : l'Autorité doit être rattachée ; l'Assistant agit sur tout
   * agenda rattaché.
   * Une tentative de DÉCISION hors périmètre (403) est journalisée comme refus sensible
   * (HYPOTHESE(DEC-38), point 1 e) ; le refus « à rattacher » (409) et le suivi ne le sont pas.
   */
  async exiger(
    q: Pick<Pool | PoolClient, 'query'>,
    ctx: Contexte,
    agendaId: string,
    nature: 'decision' | 'suivi',
    tentative?: Tentative,
  ): Promise<void> {
    const e = await this.etat(q, ctx, agendaId);
    if (!e.rattache)
      throw new ConflictException(
        'Cet agenda n’a pas d’Autorité rattachée : décisions et suivi impossibles. La demande ' +
          'reste dans la file « à rattacher ».',
      );
    const roles = ctx.identite.roles;
    const parAssistant = nature === 'suivi' && roles.includes('assistant');
    if (!parAssistant && !e.moi) {
      if (nature === 'decision' && tentative)
        await this.refus.signaler(ctx, {
          ...tentative,
          contexte: { ...(tentative.contexte ?? {}), agenda_id: agendaId, motif: 'hors_perimetre' },
        });
      throw new ForbiddenException(
        'Agenda hors de votre périmètre : aucun rattachement actif à votre nom.',
      );
    }
  }
}
