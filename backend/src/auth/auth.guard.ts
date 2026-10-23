import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCES, type Acces } from '../habilitation/acces.decorators.js';
import type { RequeteAuthentifiee } from './identite.js';
import {
  AuthNonConfigureeError,
  IdentiteIndisponibleError,
  TokenVerifierService,
} from './token-verifier.service.js';

const TAILLE_MAX_JETON = 8192;

function extraireJeton(en_tete: string | string[] | undefined): string | null {
  if (typeof en_tete !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/i.exec(en_tete.trim());
  return m && m[1].length <= TAILLE_MAX_JETON ? m[1] : null;
}

/**
 * Garde GLOBALE : toute route exige un jeton vérifié, sauf si elle est déclarée @Public().
 * Les messages restent génériques : on ne dit pas pourquoi un jeton est refusé.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificateur: TokenVerifierService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const acces = this.reflector.getAllAndOverride<Acces | undefined>(ACCES, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (acces?.type === 'public') return true;

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const jeton = extraireJeton(requete.headers.authorization);
    if (!jeton) throw new UnauthorizedException('Authentification requise.');

    try {
      requete.identite = await this.verificateur.verifier(jeton);
    } catch (e) {
      if (e instanceof AuthNonConfigureeError)
        throw new ServiceUnavailableException('Authentification non configurée sur le serveur.');
      if (e instanceof IdentiteIndisponibleError)
        throw new ServiceUnavailableException("Service d'identité injoignable.");
      throw new UnauthorizedException('Jeton invalide ou expiré.');
    }
    return true;
  }
}
