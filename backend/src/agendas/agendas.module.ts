import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module.js';
import { AgendasController } from './agendas.controller.js';

@Module({ imports: [JournalModule], controllers: [AgendasController] })
export class AgendasModule {}
