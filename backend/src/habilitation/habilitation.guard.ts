import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequeteAuthentifiee } from '../auth/identite.js';
import { ACCES, type Acces } from './acces.decorators.js';
import { HabilitationService } from './habilitation.service.js';

/**
 * Garde GLOBALE d'autorisation, exécutée après AuthGuard. Refus par défaut :
 *  - route non déclarée → 403 ;
 *  - action absente de la matrice, ou rôle non listé → 403.
 * L'identité vient uniquement du jeton vérifié par AuthGuard, jamais d'un en-tête ou d'un corps.
 */
@Injectable()
export class HabilitationGuard implements CanActivate {
  private readonly journal = new Logger(HabilitationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly habilitation: HabilitationService,
  ) {}

  canActivate(contexte: ExecutionContext): boolean {
    const acces = this.reflector.getAllAndOverride<Acces | undefined>(ACCES, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (acces?.type === 'public') return true;

    const identite = contexte.switchToHttp().getRequest<RequeteAuthentifiee>().identite;
    if (!identite) throw new UnauthorizedException('Authentification requise.');

    if (!acces) {
      this.journal.error(
        `Route sans déclaration d'accès, refusée : ${contexte.getClass().name}.${contexte.getHandler().name}`,
      );
      throw new ForbiddenException('Accès refusé.');
    }
    if (acces.type === 'authentifie') return true;

    if (!this.habilitation.estAutorise(identite.roles, acces.action))
      throw new ForbiddenException('Droit insuffisant.');
    return true;
  }
}
