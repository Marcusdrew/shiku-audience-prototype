import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module.js';
import { AudiencesController } from './audiences.controller.js';

@Module({ imports: [JournalModule], controllers: [AudiencesController] })
export class AudiencesModule {}
