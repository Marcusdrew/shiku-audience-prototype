import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const corps = (appels: ReturnType<typeof simulerApi>, methode: string) =>
  appels.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === methode)
    .map((c) => ({
      url: String(c[0]).replace(/^\/api/, ''),
      corps: JSON.parse(String((c[1] as RequestInit).body ?? '{}')) as unknown,
    }));

const rattachement = (statut: string, est_moi: boolean, en_vigueur = false) => ({
  id: `r-${statut}`,
  autorite_id: 'u-aut',
  autorite_nom: 'Aude Fictive',
  statut,
  debut: '2026-10-22',
  fin: null,
  en_vigueur,
  est_moi,
});

describe('agendas et périmètre de l’Autorité (DEC-32)', () => {
  it('Administrateur : l’Autorité de rattachement est exigée à la création ; un rattachement autorisé s’applique', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['agenda.lister', 'agenda.administrer', 'utilisateur.administrer'])],
      [
        'GET /agendas',
        {
          elements: [
            {
              id: 'a1',
              nom: 'Agenda fictif',
              a_rattacher: true,
              rattachements: [rattachement('autorise', false)],
            },
          ],
        },
      ],
      [
        'GET /utilisateurs',
        { elements: [{ id: 'u-aut', nom_complet: 'Aude Fictive', actif: true }] },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['POST /rattachements/r-autorise/appliquer', { id: 'r-autorise', statut: 'actif' }],
      ['POST /agendas', { id: 'a2', nom: 'Nouvel agenda fictif' }, 201],
    ]);
    const u = userEvent.setup();
    monter('/agendas');
    expect(
      await screen.findByText(/À rattacher : décisions et suivi impossibles/),
    ).toBeInTheDocument();
    expect(screen.getByText('Autorisé — à appliquer par l’Administrateur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Autoriser' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() =>
      expect(corps(appels, 'POST').map((x) => x.url)).toContain(
        '/rattachements/r-autorise/appliquer',
      ),
    );
    await u.type(screen.getByLabelText('Nouvel agenda'), 'Nouvel agenda fictif');
    await u.selectOptions(await screen.findByLabelText('Autorité de rattachement'), 'u-aut');
    await u.click(screen.getByRole('button', { name: 'Créer l’agenda' }));
    await waitFor(() =>
      expect(corps(appels, 'POST')).toContainEqual({
        url: '/agendas',
        corps: { nom: 'Nouvel agenda fictif', autorite_id: 'u-aut' },
      }),
    );
  });

  it('Autorité : autorise ou révoque SON rattachement ; pas de formulaire d’administration', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['agenda.lister', 'agenda.autoriser_rattachement'])],
      [
        'GET /agendas',
        {
          elements: [
            {
              id: 'a1',
              nom: 'Agenda fictif',
              a_rattacher: true,
              rattachements: [rattachement('propose', true)],
            },
          ],
        },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['POST /rattachements/r-propose/autoriser', { id: 'r-propose', statut: 'autorise' }],
    ]);
    const u = userEvent.setup();
    monter('/agendas');
    const ligne = (await screen.findByText(/Aude Fictive \(vous\)/)).closest('li')!;
    expect(within(ligne).getByRole('button', { name: 'Révoquer' })).toBeInTheDocument();
    await u.click(within(ligne).getByRole('button', { name: 'Autoriser' }));
    await waitFor(() =>
      expect(corps(appels, 'POST').map((x) => x.url)).toEqual([
        '/rattachements/r-propose/autoriser',
      ]),
    );
    expect(screen.queryByText('Administration des agendas')).not.toBeInTheDocument();
  });

  it('Demandes : la file « à rattacher » se filtre côté serveur', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['demande.consulter'])],
      ['GET /demandes', { elements: [], total: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes');
    await u.click(await screen.findByLabelText(/File « à rattacher »/));
    await waitFor(() =>
      expect(appels.mock.calls.some((c) => String(c[0]).includes('a_rattacher=true'))).toBe(true),
    );
  });
});
