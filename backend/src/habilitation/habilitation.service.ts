import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Matrice } from './matrice.js';

export const MATRICE = 'MATRICE_HABILITATION';

/**
 * Point d'entrée unique d'évaluation des droits (ADR-ARCH-004, US-05-003).
 * Refus par défaut : une action absente de la matrice est interdite, quel que soit le rôle.
 */
@Injectable()
export class HabilitationService {
  private readonly journal = new Logger(HabilitationService.name);

  constructor(@Inject(MATRICE) private readonly matrice: Matrice) {
    if (matrice.statut !== 'OFFICIELLE')
      this.journal.warn(
        `Matrice d'habilitation PROVISOIRE (${matrice.statut}) : ${matrice.reference}`,
      );
  }

  get statutMatrice(): Matrice['statut'] {
    return this.matrice.statut;
  }

  get referenceMatrice(): string {
    return this.matrice.reference;
  }

  /** Actions que la matrice accorde à ces rôles. Sert à l'AFFICHAGE ; le contrôle reste serveur. */
  actionsAutorisees(roles: readonly string[]): string[] {
    return Object.keys(this.matrice.actions)
      .filter((a) => this.estAutorise(roles, a))
      .sort();
  }

  estAutorise(roles: readonly string[], action: string): boolean {
    const definition = Object.hasOwn(this.matrice.actions, action)
      ? this.matrice.actions[action]
      : undefined;
    if (!definition) return false;
    return roles.some((r) => (definition.roles as readonly string[]).includes(r));
  }
}
