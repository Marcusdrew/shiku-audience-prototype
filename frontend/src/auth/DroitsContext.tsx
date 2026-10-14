import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { lireDroits, type Droits } from '../api/metier';
import { ApiError } from '../api/client';
import { useAuth } from './AuthContext';

type Etat =
  { etat: 'chargement' } | { etat: 'pret'; droits: Droits } | { etat: 'erreur'; message: string };

export interface ContexteDroits {
  etat: Etat['etat'];
  message: string | null;
  compteActif: boolean;
  matrice: Droits['matrice'] | null;
  /** AFFICHAGE seulement (boutons, menus). Le serveur recontrôle chaque action à l'exécution. */
  peut: (action: string) => boolean;
}

const Ctx = createContext<ContexteDroits | null>(null);

/**
 * Charge GET /droits : actions que la matrice accorde aux rôles du jeton, si un compte applicatif actif
 * existe. N'est jamais une autorisation : le backend refuse (403) toute action non permise.
 */
export function DroitsProvider({ children }: { children: ReactNode }) {
  const { jeton } = useAuth();
  const [etat, setEtat] = useState<Etat>({ etat: 'chargement' });

  useEffect(() => {
    const ctrl = new AbortController();
    lireDroits(jeton, ctrl.signal)
      .then((droits) => setEtat({ etat: 'pret', droits }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEtat({
          etat: 'erreur',
          message: e instanceof ApiError ? e.message : 'Erreur inattendue.',
        });
      });
    return () => ctrl.abort();
  }, [jeton]);

  const valeur = useMemo<ContexteDroits>(() => {
    const droits = etat.etat === 'pret' ? etat.droits : null;
    const actions = new Set(droits?.actions ?? []);
    return {
      etat: etat.etat,
      message: etat.etat === 'erreur' ? etat.message : null,
      compteActif: droits?.compte_actif ?? false,
      matrice: droits?.matrice ?? null,
      peut: (a) => actions.has(a),
    };
  }, [etat]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useDroits(): ContexteDroits {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDroits doit être utilisé dans <DroitsProvider>.');
  return c;
}
