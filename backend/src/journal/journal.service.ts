import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/db.module.js';
import {
  actionsDes,
  type Categorie,
  CATEGORIE_DES_ACTIONS,
  CATEGORIES_VUE_AUTORITE,
  categorieDe,
  LIBELLES_CATEGORIES,
} from './categories.js';

export interface EntreeJournal {
  organisationId: string;
  utilisateurId: string;
  /** Verbe métier, ex. `demande.creer`. Doit être classé dans `categories.ts`. */
  action: string;
  objetType: string;
  objetId?: string | null;
  contexte?: Record<string, unknown>;
  /** Refus d'une action sensible (HYPOTHESE(DEC-38), point 1 e) ; « accepte » par défaut. */
  resultat?: 'accepte' | 'refuse';
}

/**
 * Écriture d'une entrée. Une action non classée est refusée AVANT l'écriture : aucune entrée sans
 * catégorie ne peut naître (le test de couverture le vérifie aussi à la construction).
 * Q-5 (réponse du 23/10/2026) : le contexte ne porte que des identifiants, des codes et des nombres ;
 * ni nom du personnel ni nom d'agenda (résolus à l'affichage), ni texte libre.
 */
export async function insererEntree(
  client: Pick<PoolClient, 'query'>,
  e: EntreeJournal,
): Promise<void> {
  categorieDe(e.action);
  await client.query(
    `INSERT INTO journal (organisation_id, utilisateur_id, action, objet_type, objet_id, contexte,
                          resultat)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      e.organisationId,
      e.utilisateurId,
      e.action,
      e.objetType,
      e.objetId ?? null,
      JSON.stringify(e.contexte ?? {}),
      e.resultat ?? 'accepte',
    ],
  );
}

/**
 * Point d'écriture UNIQUE du journal (US-05-010). Il reçoit le client de la transaction métier :
 * l'action et sa trace sont validées ensemble ou pas du tout. L'horodatage est posé par la base.
 * Le journal ne contient ni mot de passe, ni jeton, ni texte libre sensible : seulement des
 * identifiants, des codes et les noms des champs modifiés.
 */
@Injectable()
export class JournalService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  enregistrer(client: PoolClient, e: EntreeJournal): Promise<void> {
    return insererEntree(client, e);
  }

  /**
   * Vue limitée de l'Autorité (seul rôle qui lit le journal) : catégories de
   * `CATEGORIES_VUE_AUTORITE`, plus les entrées « sous délégation » de toute catégorie. Les noms
   * (auteur) sont résolus à l'affichage ; une entrée de l'initialisation porte l'auteur « système ».
   */
  async lister(
    organisationId: string,
    f: {
      objetType?: string;
      objetId?: string;
      categorie?: Categorie;
      limite: number;
      decalage: number;
    },
  ) {
    const visibles = actionsDes(CATEGORIES_VUE_AUTORITE);
    const filtre = f.categorie ? actionsDes([f.categorie]) : null;
    const { rows } = await this.pool.query<{ action: string }>(
      `SELECT j.id::text AS id, j.horodatage, j.action, j.objet_type, j.objet_id, j.contexte,
              j.resultat, j.sous_delegation, j.auteur, j.utilisateur_id,
              CASE WHEN j.auteur = 'systeme' THEN 'Système' ELSE u.nom_complet END AS utilisateur_nom
         FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.organisation_id = $1
          AND (j.action = ANY($2::text[]) OR j.sous_delegation)
          AND ($3::text[] IS NULL OR j.action = ANY($3::text[]))
          AND ($4::text IS NULL OR j.objet_type = $4)
          AND ($5::uuid IS NULL OR j.objet_id = $5)
        ORDER BY j.id DESC
        LIMIT $6 OFFSET $7`,
      [
        organisationId,
        visibles,
        filtre,
        f.objetType ?? null,
        f.objetId ?? null,
        f.limite,
        f.decalage,
      ],
    );
    return rows.map((r) => {
      const categorie = CATEGORIE_DES_ACTIONS[r.action] ?? null;
      return {
        ...r,
        categorie,
        categorie_libelle: categorie ? LIBELLES_CATEGORIES[categorie] : 'Non classée',
      };
    });
  }

  /**
   * Récapitulatif des purges (HYPOTHESE(DEC-38), point 1 f) : date, volume, période couverte et
   * volume par catégorie, pour l'organisation seulement. Aucune entrée purgée n'est restituée. La
   * table `journal_purge` est écrite par la base seule (déclencheur), en ajout seul ; une purge
   * antérieure à ce lot n'a pas de détail par organisation et n'apparaît pas.
   */
  async purges(organisationId: string, limite: number, decalage: number) {
    const { rows } = await this.pool.query<{
      id: string;
      purge_le: string;
      detail: {
        entrees: number;
        plus_ancienne: string;
        plus_recente: string;
        par_action: Record<string, number>;
      };
    }>(
      `SELECT id::text AS id, purge_le, par_organisation -> $1 AS detail
         FROM journal_purge WHERE par_organisation ? $1
        ORDER BY id DESC LIMIT $2 OFFSET $3`,
      [organisationId, limite, decalage],
    );
    return rows.map(({ id, purge_le, detail }) => {
      const parCategorie: Record<string, number> = {};
      for (const [action, n] of Object.entries(detail.par_action ?? {})) {
        const c = CATEGORIE_DES_ACTIONS[action];
        const cle = c ? LIBELLES_CATEGORIES[c] : 'Non classée';
        parCategorie[cle] = (parCategorie[cle] ?? 0) + n;
      }
      return {
        id,
        purge_le,
        entrees_supprimees: detail.entrees,
        plus_ancienne: detail.plus_ancienne,
        plus_recente: detail.plus_recente,
        par_categorie: parCategorie,
      };
    });
  }
}
