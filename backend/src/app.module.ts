import { Module } from '@nestjs/common';
import { AgendasModule } from './agendas/agendas.module.js';
import { AudiencesModule } from './audiences/audiences.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { DecisionsModule } from './decisions/decisions.module.js';
import { DemandesModule } from './demandes/demandes.module.js';
import { JournalModule } from './journal/journal.module.js';
import { SanteController } from './sante/sante.controller.js';
import { UtilisateursModule } from './utilisateurs/utilisateurs.module.js';
import { VisiteursModule } from './visiteurs/visiteurs.module.js';

/** Modules métier, partagés avec les tests d'intégration (qui fournissent leur propre AuthModule). */
export const MODULES_METIER = [
  UtilisateursModule,
  JournalModule,
  AgendasModule,
  VisiteursModule,
  DemandesModule,
  DecisionsModule,
  AudiencesModule,
];

@Module({
  imports: [DbModule, AuthModule.register(), ...MODULES_METIER],
  controllers: [SanteController],
})
export class AppModule {}
