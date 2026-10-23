import { Module } from '@nestjs/common';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { DemandesController } from './demandes.controller.js';
import { PrioriteController } from './priorite.controller.js';

@Module({
  imports: [JournalModule, HabilitationModule],
  controllers: [DemandesController, PrioriteController],
})
export class DemandesModule {}
