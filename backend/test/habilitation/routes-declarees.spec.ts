import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { MATRICE_PROVISOIRE } from '../../src/habilitation/matrice-provisoire.js';
import { ACCES } from '../../src/habilitation/acces.decorators.js';

const ROUTES_ATTENDUES = [
  'agendas creer',
  'agendas lister',
  'audiences consulter',
  'audiences cloturer',
  'audiences demarrer',
  'audiences planifier',
  'audiences planning',
  'audiences terminer',
  'demandes consulter',
  'demandes creer',
  'demandes lister',
  'demandes modifier',
  'demandes qualifier',
  '/ decider',
  '/ file',
  'droits lire',
  'journal lister',
  'moi lire',
  'sante verifier',
  'utilisateurs creer',
  'utilisateurs lister',
  'visiteurs creer',
  'visiteurs rechercher',
].sort();

type ModuleRef = Type<unknown> | DynamicModule;

// Parcourt récursivement les modules de l'application RÉELLE et collecte leurs contrôleurs.
function controleurs(m: ModuleRef, vus = new Set<unknown>()): Type<unknown>[] {
  const classe = 'module' in m ? m.module : m;
  if (vus.has(classe)) return [];
  vus.add(classe);
  const statiques = (Reflect.getMetadata('controllers', classe) ?? []) as Type<unknown>[];
  const dynamiques = 'module' in m ? (m.controllers ?? []) : [];
  const imports = [
    ...((Reflect.getMetadata('imports', classe) ?? []) as ModuleRef[]),
    ...('module' in m ? ((m.imports ?? []) as ModuleRef[]) : []),
  ];
  return [
    ...statiques,
    ...(dynamiques as Type<unknown>[]),
    ...imports.flatMap((i) => controleurs(i, vus)),
  ];
}

// Test d'exhaustivité (deny-by-default) : chaque route de l'application RÉELLE doit déclarer son
// régime d'accès. Une route ajoutée sans @Public / @AuthentifieSeulement / @ExigeDroit fait échouer ce test.
describe("déclaration d'accès de toutes les routes de l'application", () => {
  it('chaque route déclare son régime, et seule /sante est publique', () => {
    const routes: { route: string; acces: { type: string; action?: string } | undefined }[] = [];
    for (const c of controleurs(AppModule)) {
      const proto = c.prototype as Record<string, unknown>;
      const prefixe = Reflect.getMetadata('path', c) as string;
      for (const nom of Object.getOwnPropertyNames(proto)) {
        const h = proto[nom];
        if (
          nom === 'constructor' ||
          typeof h !== 'function' ||
          Reflect.getMetadata('path', h) === undefined
        )
          continue;
        routes.push({
          route: `${prefixe} ${nom}`,
          acces: Reflect.getMetadata(ACCES, h) ?? Reflect.getMetadata(ACCES, c),
        });
      }
    }
    // Liste explicite : ajouter une route oblige à mettre ce test à jour, donc à la relire.
    expect(routes.map((r) => r.route).sort()).toEqual(ROUTES_ATTENDUES);
    for (const r of routes) expect(r.acces, `route sans déclaration : ${r.route}`).toBeDefined();
    expect(routes.filter((r) => r.acces?.type === 'public').map((r) => r.route)).toEqual([
      'sante verifier',
    ]);
    expect(
      routes
        .filter((r) => r.acces?.type === 'authentifie')
        .map((r) => r.route)
        .sort(),
    ).toEqual(['droits lire', 'moi lire']);
    // Toute autre route exige un droit, et ce droit existe dans la matrice (sinon refus pour tous).
    for (const r of routes.filter((x) => x.acces?.type === 'droit'))
      expect(
        Object.hasOwn(MATRICE_PROVISOIRE.actions, r.acces!.action!),
        `action absente de la matrice : ${r.acces!.action}`,
      ).toBe(true);
  });
});
