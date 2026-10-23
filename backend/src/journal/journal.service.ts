import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/db.module.js';

export interface EntreeJournal {
  organisationId: string;
  utilisateurId: string;
  /** Verbe métier, ex. `demande.creer`. */
  action: string;
  objetType: string;
  objetId?: string | null;
  contexte?: Record<string, unknown>;
}

/**
 * Point d'écriture UNIQUE du journal (US-05-010). Il reçoit le client de la transaction métier :
 * l'action et sa trace sont validées ensemble ou pas du tout. L'horodatage est posé par la base.
 * Le journal ne contient ni mot de passe, ni jeton, ni texte libre sensible : seulement des
 * identifiants et les champs modifiés.
 */
@Injectable()
export class JournalService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async enregistrer(client: PoolClient, e: EntreeJournal): Promise<void> {
    await client.query(
      `INSERT INTO journal (organisation_id, utilisateur_id, action, objet_type, objet_id, contexte)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        e.organisationId,
        e.utilisateurId,
        e.action,
        e.objetType,
        e.objetId ?? null,
        JSON.stringify(e.contexte ?? {}),
      ],
    );
  }

  async lister(
    organisationId: string,
    f: { objetType?: string; objetId?: string; limite: number; decalage: number },
  ) {
    const { rows } = await this.pool.query(
      `SELECT j.id::text AS id, j.horodatage, j.action, j.objet_type, j.objet_id, j.contexte,
              j.utilisateur_id, u.nom_complet AS utilisateur_nom
         FROM journal j JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.organisation_id = $1
          AND ($2::text IS NULL OR j.objet_type = $2)
          AND ($3::uuid IS NULL OR j.objet_id = $3)
        ORDER BY j.id DESC
        LIMIT $4 OFFSET $5`,
      [organisationId, f.objetType ?? null, f.objetId ?? null, f.limite, f.decalage],
    );
    return rows;
  }
}
