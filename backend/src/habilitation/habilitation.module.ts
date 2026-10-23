import { type DynamicModule, Module } from '@nestjs/common';
import { HabilitationService, MATRICE } from './habilitation.service.js';
import { PerimetreService } from './perimetre.service.js';
import { type Matrice, validerMatrice } from './matrice.js';
import { MATRICE_OFFICIELLE } from './matrice-officielle.js';

@Module({
  providers: [
    // Échoue au démarrage si la matrice est malformée.
    { provide: MATRICE, useFactory: () => validerMatrice(MATRICE_OFFICIELLE) },
    HabilitationService,
    PerimetreService,
  ],
  exports: [HabilitationService, PerimetreService],
})
export class HabilitationModule {
  /** Pour les tests : une autre matrice (validée de la même façon). Jamais utilisé en production. */
  static avecMatrice(matrice: Matrice): DynamicModule {
    return {
      module: HabilitationModule,
      providers: [{ provide: MATRICE, useFactory: () => validerMatrice(matrice) }],
    };
  }
}
