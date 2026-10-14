import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const demande = {
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'DEM-2026-000001',
  statut: 'qualifiee',
  objet: 'Objet fictif',
  contact: 'c@exemple.invalid',
  derogation: null,
  qualification_initiale: 'Recevable',
  cree_le: '2026-10-13T10:00:00Z',
  visiteur_id: 'v',
  visiteur_nom: 'Visiteur Fictif',
  agenda_id: 'a',
  agenda_nom: 'Agenda fictif',
  responsable_suivi_nom: 'Réception',
  cree_par_nom: 'Réception',
};

describe('écran Demandes', () => {
  it('affiche les demandes réellement renvoyées par l’API, avec leur statut en toutes lettres', async () => {
    simulerApi([
      ['GET /droits', droits(['demande.consulter'])],
      ['GET /demandes', { elements: [demande], total: 1, limite: 20, decalage: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['GET /moi', { sub: 's', identifiant: 'x', nom: null, email: null, roles: [] }],
    ]);
    monter('/demandes');
    expect(await screen.findByText('DEM-2026-000001')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Qualifiée')).toBeInTheDocument();
    expect(screen.getByText('Visiteur Fictif')).toBeInTheDocument();
    // Pas de droit de création : le formulaire n'est pas proposé (le serveur refuserait de toute façon).
    expect(screen.queryByText('Créer une demande')).not.toBeInTheDocument();
  });

  it('propose la création quand le droit est accordé et prévient quand aucun compte n’est rattaché', async () => {
    simulerApi([
      ['GET /droits', droits([], false)],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    monter('/demandes');
    expect(await screen.findByText(/aucun compte applicatif actif/)).toBeInTheDocument();
    expect(screen.queryByText('Liste des demandes')).not.toBeInTheDocument();
  });

  it('montre le message du serveur quand une création est refusée (400 avec détails)', async () => {
    simulerApi([
      ['GET /droits', droits(['demande.creer', 'demande.consulter'])],
      ['GET /agendas', { elements: [{ id: 'a1', nom: 'Agenda fictif' }] }],
      [
        'GET /visiteurs',
        { elements: [{ id: 'v1', nom_complet: 'Visiteur Fictif', contact: null, qualite: null }] },
      ],
      ['GET /demandes', { elements: [], total: 0 }],
      [
        'POST /demandes',
        {
          message: 'Données invalides.',
          erreurs: [{ champ: 'contact', message: 'Contact requis.' }],
        },
        400,
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes');
    await u.click(await screen.findByText('Créer une demande'));
    await u.click(
      within(screen.getByRole('group', { name: 'Visiteur' })).getByRole('button', {
        name: 'Rechercher',
      }),
    );
    await u.click(await screen.findByText('Choisir'));
    await u.selectOptions(await screen.findByLabelText('Agenda'), 'a1');
    await u.type(screen.getByLabelText('Objet de la demande'), 'Un objet');
    await u.click(screen.getByText('Enregistrer la demande'));
    expect(await screen.findByText('Données invalides.')).toBeInTheDocument();
    expect(screen.getByText('contact : Contact requis.')).toBeInTheDocument();
  });
});

describe('détail d’une demande', () => {
  const base = (actions: string[], extra: Record<string, unknown> = {}) => [
    ['GET /droits', droits(actions)] as [string, unknown],
    ['GET /demandes/', { ...demande, ...extra }] as [string, unknown],
    ['GET /sante', { statut: 'ok', base: 'ok' }] as [string, unknown],
  ];

  it('propose valider, rejeter et différer à l’autorité, pas à la réception', async () => {
    simulerApi(
      base(['demande.consulter', 'decision.valider_rejeter', 'decision.differer'], {
        decisions: [],
      }),
    );
    const premier = monter(`/demandes/${demande.id}`);
    expect(await screen.findByText('Valider')).toBeInTheDocument();
    expect(screen.getByText('Rejeter')).toBeInTheDocument();
    expect(screen.getByText('Différer')).toBeInTheDocument();
    premier.unmount();
    vi.restoreAllMocks();

    simulerApi(base(['demande.consulter', 'demande.modifier']));
    monter(`/demandes/${demande.id}`);
    await waitFor(() =>
      expect(screen.getAllByText('Corriger la demande').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('Valider')).not.toBeInTheDocument();
  });

  it('explique que la clôture est indisponible tant que H4 n’est pas tranchée', async () => {
    simulerApi(
      base(['demande.consulter', 'audience.consulter'], {
        statut: 'realisee',
        audience: {
          id: 'au1',
          statut: 'terminee',
          debut_prevu: '2026-11-02T09:00:00Z',
          duree_prevue_minutes: 30,
          debut_reel: '2026-11-02T09:01:00Z',
          fin_reel: '2026-11-02T09:31:00Z',
          resultat: 'Tenue',
          cloturee_le: null,
          conservation_echeance: null,
        },
      }),
    );
    monter(`/demandes/${demande.id}`);
    expect(
      await screen.findByText(/responsable de la clôture n’est pas encore désigné/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Clôturer')).not.toBeInTheDocument();
  });
});
