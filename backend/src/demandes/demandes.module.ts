import { Module } from '@nestjs/common';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { DemandesController } from './demandes.controller.js';

@Module({
  imports: [JournalModule, HabilitationModule],
  controllers: [DemandesController],
})
export class DemandesModule {}
