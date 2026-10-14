import { useCallback, useState } from 'react';
import { ApiError } from '../api/client';

/** Exécute une action d'écriture : état « en cours », erreur lisible (message serveur + détails de champs). */
export function useAction() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; details: string[] } | null>(null);

  const executer = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setEnCours(true);
    setErreur(null);
    try {
      return await action();
    } catch (e) {
      setErreur(
        e instanceof ApiError
          ? { message: e.message, details: e.details }
          : { message: 'Erreur inattendue.', details: [] },
      );
      return undefined;
    } finally {
      setEnCours(false);
    }
  }, []);

  return { enCours, erreur, executer };
}
