import { Module } from '@nestjs/common';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { AudiencesController } from './audiences.controller.js';

@Module({ imports: [JournalModule, HabilitationModule], controllers: [AudiencesController] })
export class AudiencesModule {}
