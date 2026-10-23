import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module.js';
import { AgendasController, RattachementsController } from './agendas.controller.js';

@Module({ imports: [JournalModule], controllers: [AgendasController, RattachementsController] })
export class AgendasModule {}
