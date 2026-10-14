import { Controller, Get, Header, Req } from '@nestjs/common';
import { AuthentifieSeulement } from '../habilitation/acces.decorators.js';
import type { RequeteAuthentifiee } from './identite.js';

/**
 * GET /moi : renvoie l'identité et les rôles issus d'un jeton dont la signature a été vérifiée.
 * Elle n'accorde AUCUN droit métier : les droits sont évalués action par action (ExigeDroit).
 */
@Controller('moi')
export class MoiController {
  @Get()
  @AuthentifieSeulement()
  @Header('Cache-Control', 'no-store')
  lire(@Req() requete: RequeteAuthentifiee) {
    // AuthGuard garantit la présence de l'identité sur une route non publique.
    const { sub, identifiant, nom, email, roles } = requete.identite!;
    return { sub, identifiant, nom, email, roles };
  }
}
