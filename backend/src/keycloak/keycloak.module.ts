import { Module } from '@nestjs/common';
import {
  KEYCLOAK_ADMIN,
  KeycloakAdminService,
  lireConfigService,
} from './keycloak-admin.service.js';

@Module({
  providers: [
    { provide: KEYCLOAK_ADMIN, useFactory: () => new KeycloakAdminService(lireConfigService()) },
  ],
  exports: [KEYCLOAK_ADMIN],
})
export class KeycloakModule {}
