import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserManager } from 'oidc-client-ts';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../App';

/** Gestionnaire OIDC factice : l'utilisateur est déjà connecté (ou non). Aucun appel réseau. */
function gestionnaire(utilisateur: unknown): UserManager {
  const ajout = () => undefined;
  return {
    getUser: () => Promise.resolve(utilisateur),
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
    removeUser: vi.fn(),
    events: {
      addUserLoaded: ajout,
      removeUserLoaded: ajout,
      addUserUnloaded: ajout,
      removeUserUnloaded: ajout,
      addAccessTokenExpired: ajout,
      removeAccessTokenExpired: ajout,
      addSilentRenewError: ajout,
      removeSilentRenewError: ajout,
    },
  } as unknown as UserManager;
}

export const UTILISATEUR = {
  expired: false,
  access_token: 'a.b.c',
  profile: { preferred_username: 'test', name: 'Utilisateur de test' },
};

export function monter(chemin: string) {
  return render(
    <AuthProvider gestionnaire={gestionnaire(UTILISATEUR)}>
      <MemoryRouter initialEntries={[chemin]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

type Route = [RegExp | string, unknown, number?];

/** Simule fetch par URL. Chaque appel non prévu fait échouer le test (aucune réponse inventée). */
export function simulerApi(routes: Route[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const u = String(url).replace(/^\/api/, '');
    const methode = init?.method ?? 'GET';
    const trouvee = routes.find(([motif]) =>
      typeof motif === 'string'
        ? `${methode} ${u}`.startsWith(motif)
        : motif.test(`${methode} ${u}`),
    );
    if (!trouvee) return Promise.reject(new Error(`Appel non prévu : ${methode} ${u}`));
    return Promise.resolve(new Response(JSON.stringify(trouvee[1]), { status: trouvee[2] ?? 200 }));
  });
}

export const droits = (actions: string[], compte = true) => ({
  compte_actif: compte,
  matrice: { statut: 'HYPOTHESE', reference: 'HYPOTHESE H1 (test)' },
  actions,
});
