import { Module } from '@nestjs/common';
import { KeycloakModule } from '../keycloak/keycloak.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { DroitsController } from './droits.controller.js';
import { UtilisateursController } from './utilisateurs.controller.js';

// Le ContexteGuard n'est PAS enregistré ici : l'ordre des gardes globales (authentification,
// habilitation, compte applicatif) est fixé en un seul endroit, AuthModule.register().
@Module({
  imports: [JournalModule, HabilitationModule, KeycloakModule],
  controllers: [UtilisateursController, DroitsController],
})
export class UtilisateursModule {}
