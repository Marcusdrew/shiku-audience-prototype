import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { insererEntree } from './journal.service.js';

/**
 * Refus d'une action SENSIBLE, journalisés (HYPOTHESE(DEC-38), réponse de M. Jordan du 23/10/2026,
 * point 1 e) : attribution d'un rôle hors liste blanche, décision hors périmètre d'agenda, lecture
 * du journal sans accès. Les autres refus (403 ordinaires) ne sont pas journalisés.
 *
 * - La catégorie est celle de l'action tentée ; l'entrée porte `resultat = 'refuse'`.
 * - Écriture HORS de la transaction métier (qui est annulée par le refus) : connexion distincte.
 * - Regroupement : une seule entrée par utilisateur et par action tentée dans une fenêtre de
 *   `FENETRE_MINUTES` (HYPOTHESE(DEC-38) : durée non fixée par la décision). Le compteur de la
 *   fenêtre est tenu dans `journal_refus_regroupe` ; l'entrée qui ouvre la fenêtre suivante porte
 *   le nombre de refus regroupés de la précédente (`refus_regroupes_precedents`).
 * - Un échec d'écriture n'empêche pas le refus : il est consigné dans les journaux du serveur.
 */
export const FENETRE_MINUTES = 10;

export interface Tentative {
  action: string;
  objetType: string;
  objetId?: string | null;
  contexte?: Record<string, unknown>;
}

@Injectable()
export class RefusSensiblesService {
  private readonly log = new Logger(RefusSensiblesService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Refus d'un compte applicatif connu (contexte déjà résolu). */
  async signaler(
    ctx: { organisationId: string; utilisateurId: string },
    t: Tentative,
  ): Promise<void> {
    try {
      const { rows } = await this.pool.query<{ ouvre: boolean; precedents: number | null }>(
        `INSERT INTO journal_refus_regroupe AS r (organisation_id, utilisateur_id, action)
         VALUES ($1, $2, $3)
         ON CONFLICT (organisation_id, utilisateur_id, action) DO UPDATE SET
           precedents  = CASE WHEN r.fenetre_debut > now() - make_interval(mins => $4)
                              THEN r.precedents ELSE r.nombre END,
           nombre      = CASE WHEN r.fenetre_debut > now() - make_interval(mins => $4)
                              THEN r.nombre + 1 ELSE 1 END,
           fenetre_debut = CASE WHEN r.fenetre_debut > now() - make_interval(mins => $4)
                              THEN r.fenetre_debut ELSE now() END
         RETURNING nombre = 1 AS ouvre, precedents`,
        [ctx.organisationId, ctx.utilisateurId, t.action, FENETRE_MINUTES],
      );
      const r = rows[0]!;
      if (!r.ouvre) return;
      const regroupes = (r.precedents ?? 1) - 1;
      await insererEntree(this.pool, {
        organisationId: ctx.organisationId,
        utilisateurId: ctx.utilisateurId,
        action: t.action,
        objetType: t.objetType,
        objetId: t.objetId ?? null,
        resultat: 'refuse',
        contexte: {
          ...(t.contexte ?? {}),
          ...(regroupes > 0 ? { refus_regroupes_precedents: regroupes } : {}),
        },
      });
    } catch (e) {
      this.log.error(`Refus sensible non journalisé (${t.action}) : ${(e as Error).message}`);
    }
  }

  /**
   * Refus décidé avant la résolution du compte (garde d'habilitation) : le compte est retrouvé par
   * le `sub` du jeton vérifié. Sans compte applicatif actif, rien n'est écrit (pas d'organisation).
   */
  async signalerParSub(sub: string, t: Tentative): Promise<void> {
    try {
      const { rows } = await this.pool.query<{ id: string; organisation_id: string }>(
        `SELECT id, organisation_id FROM utilisateur WHERE keycloak_sub = $1 AND actif`,
        [sub],
      );
      const u = rows[0];
      if (!u) return;
      await this.signaler({ organisationId: u.organisation_id, utilisateurId: u.id }, t);
    } catch (e) {
      this.log.error(`Refus sensible non journalisé (${t.action}) : ${(e as Error).message}`);
    }
  }
}
