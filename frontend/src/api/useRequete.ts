import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './client';

export type EtatRequete<T> =
  | { etat: 'chargement' }
  | { etat: 'succes'; donnees: T }
  | { etat: 'erreur'; message: string; statut: number | null };

/** Charge une ressource et expose chargement / succès / erreur de façon uniforme. */
export function useRequete<T>(charger: (signal: AbortSignal) => Promise<T>) {
  const [resultat, setResultat] = useState<EtatRequete<T>>({ etat: 'chargement' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    charger(ctrl.signal)
      .then((donnees) => setResultat({ etat: 'succes', donnees }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError)
          setResultat({ etat: 'erreur', message: e.message, statut: e.statut });
        else setResultat({ etat: 'erreur', message: 'Erreur inattendue.', statut: null });
      });
    return () => ctrl.abort();
  }, [charger, version]);

  const recharger = useCallback(() => {
    setResultat({ etat: 'chargement' });
    setVersion((v) => v + 1);
  }, []);
  return { ...resultat, recharger } as EtatRequete<T> & { recharger: () => void };
}
