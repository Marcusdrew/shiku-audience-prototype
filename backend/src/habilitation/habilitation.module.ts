import { type DynamicModule, Module } from '@nestjs/common';
import { HabilitationService, MATRICE } from './habilitation.service.js';
import { type Matrice, validerMatrice } from './matrice.js';
import { MATRICE_PROVISOIRE } from './matrice-provisoire.js';

@Module({
  providers: [
    // Échoue au démarrage si la matrice est malformée.
    { provide: MATRICE, useFactory: () => validerMatrice(MATRICE_PROVISOIRE) },
    HabilitationService,
  ],
  exports: [HabilitationService],
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
