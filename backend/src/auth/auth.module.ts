import { type DynamicModule, Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { JWTVerifyGetKey } from 'jose';
import { HabilitationGuard } from '../habilitation/habilitation.guard.js';
import type { Matrice } from '../habilitation/matrice.js';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { type ConfigAuth, lireConfigAuth } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';
import { ContexteGuard } from '../utilisateurs/contexte.guard.js';
import { MoiController } from './moi.controller.js';
import { AUTH_CONFIG, JWKS_RESOLVER, TokenVerifierService } from './token-verifier.service.js';

export interface OptionsAuth {
  /** Pour les tests : remplace la lecture de l'environnement. */
  config?: ConfigAuth | null;
  /** Pour les tests : remplace la lecture des clés distantes de Keycloak. */
  resolveurCles?: JWTVerifyGetKey;
  /** Pour les tests : remplace la matrice d'habilitation. */
  matrice?: Matrice;
}

@Module({})
export class AuthModule implements OnModuleInit {
  constructor(@Inject(AUTH_CONFIG) private readonly config: ConfigAuth | null) {}

  static register(options: OptionsAuth = {}): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        options.matrice ? HabilitationModule.avecMatrice(options.matrice) : HabilitationModule,
      ],
      controllers: [MoiController],
      providers: [
        {
          provide: AUTH_CONFIG,
          useFactory: (): ConfigAuth | null =>
            'config' in options ? (options.config ?? null) : lireConfigAuth(process.env),
        },
        ...(options.resolveurCles
          ? [{ provide: JWKS_RESOLVER, useValue: options.resolveurCles }]
          : []),
        TokenVerifierService,
        // L'ordre compte : authentification, puis habilitation, puis compte applicatif.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: HabilitationGuard },
        // Puis le compte applicatif actif, exigé pour toute route qui demande un droit métier.
        { provide: APP_GUARD, useClass: ContexteGuard },
      ],
    };
  }

  onModuleInit(): void {
    // Message d'amorçage lisible ; la décision de refus est prise à chaque requête.
    if (!this.config)
      new Logger(AuthModule.name).error(
        'KEYCLOAK_ISSUER non défini : toutes les routes protégées répondront 503 (échec fermé).',
      );
  }
}
