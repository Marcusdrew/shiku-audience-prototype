import { Controller, Get, Query } from '@nestjs/common';
import { exigerUuidParam, pagination } from '../common/validation.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';
import { JournalService } from './journal.service.js';

/** Lecture seule. Il n'existe, volontairement, AUCUNE route de modification ni de suppression. */
@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @ExigeDroit('journal.consulter')
  async lister(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    const objetId =
      typeof q.objet_id === 'string' ? exigerUuidParam('objet_id', q.objet_id) : undefined;
    const objetType = typeof q.objet_type === 'string' ? q.objet_type.slice(0, 50) : undefined;
    const elements = await this.journal.lister(ctx.organisationId, {
      objetType,
      objetId,
      limite,
      decalage,
    });
    return { elements, limite, decalage };
  }
}
