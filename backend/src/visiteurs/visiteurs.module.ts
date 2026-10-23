import { Module } from '@nestjs/common';
import { HabilitationModule } from '../habilitation/habilitation.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { VisiteursController } from './visiteurs.controller.js';

@Module({ imports: [JournalModule, HabilitationModule], controllers: [VisiteursController] })
export class VisiteursModule {}
