import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module.js';
import { VisiteursController } from './visiteurs.controller.js';

@Module({ imports: [JournalModule], controllers: [VisiteursController] })
export class VisiteursModule {}
