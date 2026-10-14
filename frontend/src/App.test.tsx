import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { UserManager } from 'oidc-client-ts';
import { AuthProvider } from './auth/AuthContext';
import { AppRoutes } from './App';

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

function monter(utilisateur: unknown, chemin: string) {
  render(
    <AuthProvider gestionnaire={gestionnaire(utilisateur)}>
      <MemoryRouter initialEntries={[chemin]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('routes privées', () => {
  it('redirige un visiteur non connecté vers la page de connexion', async () => {
    monter(null, '/demandes');
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('affiche le tableau de bord et l’état réel de l’API pour un utilisateur connecté', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).endsWith('/moi')
              ? {
                  sub: 's-1',
                  identifiant: 'authority.test',
                  nom: null,
                  email: null,
                  roles: ['authority'],
                }
              : { statut: 'ok', base: 'ok' },
          ),
          { status: 200 },
        ),
      ),
    );
    monter(
      {
        expired: false,
        access_token: 'a.b.c',
        profile: { preferred_username: 'authority.test', name: 'Test Authority' },
      },
      '/',
    );
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Base de données/)).toBeInTheDocument());
    expect(await screen.findByText('Rôles vérifiés')).toBeInTheDocument();
    expect(screen.getByText(/n’accorde aucun droit métier/)).toBeInTheDocument();
  });

  it('signale que l’identité n’est pas confirmée quand le serveur répond 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      Promise.resolve(
        String(url).endsWith('/moi')
          ? new Response('{}', { status: 401 })
          : new Response(JSON.stringify({ statut: 'ok', base: 'ok' }), { status: 200 }),
      ),
    );
    monter({ expired: false, access_token: 'a.b.c', profile: { preferred_username: 'x' } }, '/');
    expect(await screen.findByText('Identité non confirmée')).toBeInTheDocument();
    expect(screen.getByText('Session non reconnue par le serveur (401).')).toBeInTheDocument();
  });

  it('montre une erreur claire quand l’API est injoignable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    monter({ expired: false, access_token: 'a.b.c', profile: { preferred_username: 'x' } }, '/');
    // Deux cartes interrogent l'API (état du service, identité) : les deux signalent la panne.
    expect(await screen.findAllByText('API injoignable (réseau ou serveur arrêté).')).toHaveLength(
      2,
    );
  });

  it('dit explicitement qu’un module n’a pas d’API, sans données fictives', async () => {
    monter(
      { expired: false, access_token: 'a.b.c', profile: { preferred_username: 'x' } },
      '/relationnel',
    );
    expect(await screen.findByText('API non disponible')).toBeInTheDocument();
  });
});
