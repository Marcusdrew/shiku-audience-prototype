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

  it('clôture : réservée à l’Autorité et à l’Assistant (arbitrage du 19/10), sans bouton pour les autres', async () => {
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
          responsable_suivi_nom: 'Responsable audience fictif',
        },
      }),
    );
    monter(`/demandes/${demande.id}`);
    expect(
      await screen.findByText(/Clôture réservée à l’Autorité et à l’Assistant/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Clôturer')).not.toBeInTheDocument();
    // La durée réelle et le responsable de suivi DE L'AUDIENCE (conditions de clôture) sont affichés.
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText('Responsable audience fictif')).toBeInTheDocument();
  });

  it('clôture : confirmation explicite (irréversible) avant l’appel au serveur', async () => {
    const appels = simulerApi([
      ...base(['demande.consulter', 'audience.consulter', 'audience.cloturer'], {
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
      ['POST /audiences/au1/cloturer', { id: 'au1', statut: 'cloturee' }],
    ]);
    const u = userEvent.setup();
    monter(`/demandes/${demande.id}`);
    await u.click(await screen.findByRole('button', { name: 'Clôturer' }));
    expect(screen.getByText(/irréversible/)).toBeInTheDocument();
    const posts = () =>
      appels.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts()).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(String(posts()[0]![0])).toContain('/audiences/au1/cloturer');
  });

  it('décision : le motif est obligatoire avant tout envoi', async () => {
    simulerApi(base(['demande.consulter', 'decision.valider_rejeter'], { decisions: [] }));
    const u = userEvent.setup();
    monter(`/demandes/${demande.id}`);
    expect(await screen.findByRole('button', { name: 'Valider' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeDisabled();
    await u.type(screen.getByLabelText('Motif (obligatoire)'), 'Motif fictif');
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it('Réception : le statut neutre renvoyé par le serveur s’affiche en toutes lettres', async () => {
    simulerApi(base(['demande.consulter'], { statut: 'non_retenue' }));
    monter(`/demandes/${demande.id}`);
    expect(await screen.findByText('Non retenue — ne pas planifier')).toBeInTheDocument();
    expect(screen.queryByText('Rejetée')).not.toBeInTheDocument();
  });
});

describe('formulaire de création : Réception, visiteurs (DEC-19) et comptes', () => {
  it('sans droit « visiteur.creer », la création de visiteur n’est pas proposée', async () => {
    simulerApi([
      ['GET /droits', droits(['demande.creer', 'demande.consulter', 'visiteur.rechercher'])],
      ['GET /agendas', { elements: [{ id: 'a1', nom: 'Agenda fictif' }] }],
      [
        'GET /visiteurs',
        { elements: [{ id: 'v1', nom_complet: 'Visiteur Fictif', contact: null, qualite: null }] },
      ],
      ['GET /demandes', { elements: [], total: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes');
    await u.click(await screen.findByText('Créer une demande'));
    const groupe = screen.getByRole('group', { name: 'Visiteur' });
    await u.click(within(groupe).getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText('Choisir')).toBeInTheDocument();
    expect(
      within(groupe).getByText(/Votre profil ne peut pas créer de visiteur/),
    ).toBeInTheDocument();
    expect(within(groupe).queryByText('Créer le visiteur')).not.toBeInTheDocument();
  });

  it('avec « visiteur.creer », la création n’est proposée qu’après une recherche (anti-doublon)', async () => {
    simulerApi([
      [
        'GET /droits',
        droits(['demande.creer', 'demande.consulter', 'visiteur.rechercher', 'visiteur.creer']),
      ],
      ['GET /agendas', { elements: [{ id: 'a1', nom: 'Agenda fictif' }] }],
      ['GET /visiteurs', { elements: [] }],
      ['GET /demandes', { elements: [], total: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes');
    await u.click(await screen.findByText('Créer une demande'));
    const groupe = screen.getByRole('group', { name: 'Visiteur' });
    expect(within(groupe).queryByText('Créer le visiteur')).not.toBeInTheDocument();
    expect(within(groupe).getByText(/Recherchez d’abord le visiteur/)).toBeInTheDocument();
    await u.type(within(groupe).getByLabelText('Rechercher un visiteur par nom'), 'Nouveau Fictif');
    await u.click(within(groupe).getByRole('button', { name: 'Rechercher' }));
    expect(await within(groupe).findByText('Aucun visiteur trouvé.')).toBeInTheDocument();
    expect(within(groupe).getByLabelText(/créer une fiche/)).toHaveValue('Nouveau Fictif');
    expect(within(groupe).getByText('Créer le visiteur')).toBeInTheDocument();
  });

  it('Réception : le filtre de statut propose le statut neutre, jamais « Rejetée »', async () => {
    simulerApi([
      ['GET /droits', droits(['demande.consulter'])],
      ['GET /demandes', { elements: [], total: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    monter('/demandes');
    const filtre = await screen.findByLabelText('Statut');
    expect(within(filtre).queryByText('Rejetée')).not.toBeInTheDocument();
    expect(within(filtre).getByText('Non retenue — ne pas planifier')).toBeInTheDocument();
  });

  it('l’Administrateur crée un compte avec prénom, nom, courriel et rôle', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['utilisateur.administrer'])],
      ['GET /utilisateurs', { elements: [] }],
      ['POST /utilisateurs', { id: 'u1', nom_complet: 'Fictive Personne', actif: true }, 201],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/administration');
    await u.type(await screen.findByLabelText('Prénom'), 'Fictive');
    await u.type(screen.getByLabelText('Nom'), 'Personne');
    await u.type(screen.getByLabelText('Courriel'), 'fictive@example.test');
    // Liste blanche (arbitrage du 19/10) : seuls Réception et Assistant sont proposés.
    const options = within(screen.getByLabelText('Rôle'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['reception', 'assistant']);
    await u.selectOptions(screen.getByLabelText('Rôle'), 'reception');
    await u.click(screen.getByText('Créer le compte'));
    await waitFor(() => {
      const post = (appels?.mock?.calls ?? []).find(
        (c: unknown[]) => String(c[1] && (c[1] as RequestInit).method) === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        prenom: 'Fictive',
        nom: 'Personne',
        courriel: 'fictive@example.test',
        role: 'reception',
      });
    });
  });
});
