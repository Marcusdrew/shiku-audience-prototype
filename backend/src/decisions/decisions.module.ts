import { Module } from '@nestjs/common';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { DecisionsController } from './decisions.controller.js';

@Module({
  imports: [JournalModule, HabilitationModule],
  controllers: [DecisionsController],
})
export class DecisionsModule {}
