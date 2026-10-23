import { Controller, Get, Query } from '@nestjs/common';
import { ErreurValidation, exigerUuidParam, pagination } from '../common/validation.js';
import { ExigeDroit } from '../habilitation/acces.decorators.js';
import { type Contexte, ContexteCourant } from '../utilisateurs/contexte.js';
import { type Categorie, CATEGORIES_VUE_AUTORITE, LIBELLES_CATEGORIES } from './categories.js';
import { JournalService } from './journal.service.js';

/**
 * Lecture seule. Il n'existe, volontairement, AUCUNE route de modification ni de suppression.
 * Vue limitée de l'Autorité (Q-1, HYPOTHESE(DEC-38)) : quatre catégories, plus les entrées « sous
 * délégation », plus le récapitulatif des purges. Une lecture refusée est journalisée par la garde.
 */
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
    let categorie: Categorie | undefined;
    if (typeof q.categorie === 'string' && q.categorie !== '') {
      if (!(CATEGORIES_VUE_AUTORITE as readonly string[]).includes(q.categorie))
        throw new ErreurValidation([
          {
            champ: 'categorie',
            message: `Catégorie hors de votre vue : ${CATEGORIES_VUE_AUTORITE.join(', ')}.`,
          },
        ]);
      categorie = q.categorie as Categorie;
    }
    const elements = await this.journal.lister(ctx.organisationId, {
      objetType,
      objetId,
      categorie,
      limite,
      decalage,
    });
    return {
      elements,
      limite,
      decalage,
      categories_visibles: CATEGORIES_VUE_AUTORITE.map((code) => ({
        code,
        libelle: LIBELLES_CATEGORIES[code],
      })),
    };
  }

  /** Récapitulatif des purges : catégorie, volume, date ; jamais le contenu purgé. */
  @Get('purges')
  @ExigeDroit('journal.consulter')
  async purges(@ContexteCourant() ctx: Contexte, @Query() q: Record<string, unknown>) {
    const { limite, decalage } = pagination(q);
    return {
      elements: await this.journal.purges(ctx.organisationId, limite, decalage),
      limite,
      decalage,
    };
  }
}
