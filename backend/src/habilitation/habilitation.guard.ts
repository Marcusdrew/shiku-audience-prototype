import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequeteAuthentifiee } from '../auth/identite.js';
import { ACCES, type Acces } from './acces.decorators.js';
import { RefusSensiblesService } from '../journal/refus-sensibles.service.js';
import { HabilitationService } from './habilitation.service.js';

/**
 * Refus journalisés dès la garde (HYPOTHESE(DEC-38), point 1 e) : lecture du journal sans accès.
 * Les autres refus de droit ne sont pas journalisés.
 */
export const REFUS_SENSIBLES_A_LA_GARDE: Readonly<Record<string, string>> = {
  'journal.consulter': 'journal',
};

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
    @Optional() private readonly refus?: RefusSensiblesService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
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

    if (!this.habilitation.estAutorise(identite.roles, acces.action)) {
      const objetType = REFUS_SENSIBLES_A_LA_GARDE[acces.action];
      if (objetType && this.refus)
        await this.refus.signalerParSub(identite.sub, { action: acces.action, objetType });
      throw new ForbiddenException('Droit insuffisant.');
    }
    return true;
  }
}
