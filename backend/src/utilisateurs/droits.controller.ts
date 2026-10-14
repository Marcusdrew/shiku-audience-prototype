import { Controller, Get, Header, Inject, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { RequeteAuthentifiee } from '../auth/identite.js';
import { PG_POOL } from '../db/db.module.js';
import { AuthentifieSeulement } from '../habilitation/acces.decorators.js';
import { HabilitationService } from '../habilitation/habilitation.service.js';

/**
 * Informe le frontend de ce que la matrice accorde aux rôles du jeton, et de l'existence d'un compte
 * applicatif actif. Pure AIDE À L'AFFICHAGE (menus, boutons) : chaque action est de toute façon
 * contrôlée à nouveau par le serveur à l'exécution. Sans compte actif, la liste d'actions est vide.
 */
@Controller('droits')
export class DroitsController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly habilitation: HabilitationService,
  ) {}

  @Get()
  @AuthentifieSeulement()
  @Header('Cache-Control', 'no-store')
  async lire(@Req() req: RequeteAuthentifiee) {
    const identite = req.identite!;
    let compteActif: boolean;
    try {
      const { rows } = await this.pool.query<{ actif: boolean }>(
        'SELECT actif FROM utilisateur WHERE keycloak_sub = $1',
        [identite.sub],
      );
      compteActif = rows[0]?.actif === true;
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible.');
    }
    return {
      compte_actif: compteActif,
      matrice: {
        statut: this.habilitation.statutMatrice,
        reference: this.habilitation.referenceMatrice,
      },
      actions: compteActif ? this.habilitation.actionsAutorisees(identite.roles) : [],
    };
  }
}
