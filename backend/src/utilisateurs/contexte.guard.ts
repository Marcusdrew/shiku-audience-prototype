import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/db.module.js';
import { ACCES, type Acces } from '../habilitation/acces.decorators.js';
import type { RequeteContexte } from './contexte.js';

/**
 * 3e garde globale (après authentification puis habilitation). Pour toute route qui exige un
 * droit métier, il faut EN PLUS un compte applicatif ACTIF lié au `sub` du jeton vérifié.
 * Un jeton valide sans compte applicatif n'ouvre donc aucune route métier (ENF03-13, H6) :
 * l'identité ne vaut pas habilitation. Aucun compte n'est créé automatiquement.
 */
@Injectable()
export class ContexteGuard implements CanActivate {
  private readonly journal = new Logger(ContexteGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const acces = this.reflector.getAllAndOverride<Acces | undefined>(ACCES, [
      ec.getHandler(),
      ec.getClass(),
    ]);
    if (acces?.type !== 'droit') return true;

    const req = ec.switchToHttp().getRequest<RequeteContexte>();
    if (!req.identite) throw new ForbiddenException('Accès refusé.');
    try {
      const { rows } = await this.pool.query<{
        id: string;
        organisation_id: string;
        actif: boolean;
      }>('SELECT id, organisation_id, actif FROM utilisateur WHERE keycloak_sub = $1', [
        req.identite.sub,
      ]);
      const compte = rows[0];
      if (!compte || !compte.actif) throw new ForbiddenException('Aucun compte applicatif actif.');
      req.contexte = {
        utilisateurId: compte.id,
        organisationId: compte.organisation_id,
        identite: req.identite,
      };
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.journal.error(`Résolution du compte impossible : ${(e as Error).message}`);
      throw new ServiceUnavailableException('Base de données indisponible.');
    }
  }
}
