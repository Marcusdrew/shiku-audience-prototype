import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, UserManager } from 'oidc-client-ts';
import { rolesDepuisJeton, type Role } from './roles';

export type EtatAuth = 'chargement' | 'connecte' | 'deconnecte';

export interface Session {
  etat: EtatAuth;
  nom: string | null;
  identifiant: string | null;
  email: string | null;
  roles: Role[];
  jeton: string | null;
  erreur: string | null;
  connecter: (retour?: string) => Promise<void>;
  deconnecter: () => Promise<void>;
}

const AuthContext = createContext<Session | null>(null);

function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur d’authentification inconnue.';
}

export function AuthProvider({
  gestionnaire,
  children,
}: {
  gestionnaire: UserManager;
  children: ReactNode;
}) {
  const [utilisateur, setUtilisateur] = useState<User | null>(null);
  const [etat, setEtat] = useState<EtatAuth>('chargement');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    gestionnaire
      .getUser()
      .then((u) => {
        if (!actif) return;
        const valide = u && !u.expired ? u : null;
        setUtilisateur(valide);
        setEtat(valide ? 'connecte' : 'deconnecte');
      })
      .catch((e: unknown) => {
        if (!actif) return;
        setErreur(messageErreur(e));
        setEtat('deconnecte');
      });

    const { events } = gestionnaire;
    const chargee = (u: User) => {
      setUtilisateur(u);
      setEtat('connecte');
      setErreur(null);
    };
    const perdue = () => {
      setUtilisateur(null);
      setEtat('deconnecte');
    };
    const echecRenouvellement = (e: Error) => {
      setErreur(`Session expirée : ${e.message}`);
      setUtilisateur(null);
      setEtat('deconnecte');
    };
    events.addUserLoaded(chargee);
    events.addUserUnloaded(perdue);
    events.addAccessTokenExpired(perdue);
    events.addSilentRenewError(echecRenouvellement);
    return () => {
      actif = false;
      events.removeUserLoaded(chargee);
      events.removeUserUnloaded(perdue);
      events.removeAccessTokenExpired(perdue);
      events.removeSilentRenewError(echecRenouvellement);
    };
  }, [gestionnaire]);

  const connecter = useCallback(
    async (retour?: string) => {
      setErreur(null);
      try {
        await gestionnaire.signinRedirect({ state: { retour: retour ?? '/' } });
      } catch (e) {
        setErreur(`Connexion impossible : ${messageErreur(e)}`);
      }
    },
    [gestionnaire],
  );

  const deconnecter = useCallback(async () => {
    try {
      await gestionnaire.signoutRedirect();
    } catch (e) {
      // Si Keycloak est injoignable, on efface au moins la session locale.
      await gestionnaire.removeUser();
      setErreur(`Déconnexion distante impossible : ${messageErreur(e)}`);
    }
  }, [gestionnaire]);

  const valeur = useMemo<Session>(
    () => ({
      etat,
      nom: (utilisateur?.profile.name as string | undefined) ?? null,
      identifiant: (utilisateur?.profile.preferred_username as string | undefined) ?? null,
      email: utilisateur?.profile.email ?? null,
      roles: rolesDepuisJeton(utilisateur?.access_token),
      jeton: utilisateur?.access_token ?? null,
      erreur,
      connecter,
      deconnecter,
    }),
    [etat, utilisateur, erreur, connecter, deconnecter],
  );

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth(): Session {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
