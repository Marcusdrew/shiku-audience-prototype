import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const corpsEnvoye = (appels: ReturnType<typeof simulerApi>, methode: string) =>
  appels.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === methode)
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>);

describe('répertoire minimal des visiteurs', () => {
  it('recherche d’abord, puis crée un visiteur (prénom, nom, contact) avec le droit serveur', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['visiteur.rechercher', 'visiteur.creer'])],
      ['GET /visiteurs?q=Fictif', { elements: [], limite: 20, decalage: 0 }],
      ['GET /visiteurs', { elements: [], limite: 20, decalage: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['GET /moi', { sub: 's', identifiant: 'test', nom: null, email: null, roles: [] }],
      [
        'POST /visiteurs',
        { id: 'v-1', nom_complet: 'Ama Fictif', contact_masque: 'a***@e***.invalid' },
        201,
      ],
    ]);
    const user = userEvent.setup();
    monter('/relationnel');
    // Pas de formulaire de création avant une recherche (éviter les doublons).
    expect(await screen.findByText(/Recherchez d’abord le visiteur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer le visiteur' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom du visiteur'), 'Fictif');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    // Le terme recherché pré-remplit le nom ; prénom et contact sont exigés.
    expect(await screen.findByLabelText('Nom')).toHaveValue('Fictif');
    await user.type(screen.getByLabelText('Prénom'), 'Ama');
    await user.type(
      screen.getByLabelText('Contact (téléphone ou courriel)'),
      'ama@exemple.invalid',
    );
    await user.click(screen.getByRole('button', { name: 'Créer le visiteur' }));
    expect(await screen.findByText('Fiche créée : Ama Fictif.')).toBeInTheDocument();
    expect(corpsEnvoye(appels, 'POST')).toEqual([
      { prenom: 'Ama', nom: 'Fictif', contact: 'ama@exemple.invalid' },
    ]);
    await waitFor(() => expect(screen.getByText(/notes, attestations/i)).toBeInTheDocument());
  });

  it('Réception : contact masqué, ni qualification ni modification proposées', async () => {
    simulerApi([
      ['GET /droits', droits(['visiteur.rechercher', 'visiteur.creer'])],
      [
        'GET /visiteurs',
        {
          elements: [{ id: 'v1', nom_complet: 'Ama Fictif', contact_masque: 'a***@e***.invalid' }],
          limite: 20,
          decalage: 0,
        },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const user = userEvent.setup();
    monter('/relationnel');
    expect(await screen.findByText('a***@e***.invalid')).toBeInTheDocument();
    expect(screen.getByText(/Contacts masqués/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Qualité' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByLabelText('Prénom')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Qualité/)).not.toBeInTheDocument();
    expect(screen.getByText(/saisie par l’Assistant/)).toBeInTheDocument();
  });

  it('doublon de contact : le serveur répond 409, l’écran montre la fiche masquée puis renvoie avec le motif « homonyme distinct »', async () => {
    let n = 0;
    const appels = vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const u = String(url).replace(/^\/api/, '');
      const m = init?.method ?? 'GET';
      const json = (corps: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(corps), { status }));
      if (u.startsWith('/droits')) return json(droits(['visiteur.rechercher', 'visiteur.creer']));
      if (u.startsWith('/sante')) return json({ statut: 'ok', base: 'ok' });
      if (m === 'GET' && u.startsWith('/visiteurs'))
        return json({ elements: [], limite: 20, decalage: 0 });
      if (m === 'POST' && u === '/visiteurs')
        return ++n === 1
          ? json(
              {
                message: 'Un visiteur a déjà ce contact.',
                code: 'doublon_contact',
                doublons: [{ id: 'v1', nom_complet: 'Ama Autre', contact_masque: '***00' }],
              },
              409,
            )
          : json({ id: 'v2', nom_complet: 'Ama Fictif', contact_masque: '***00' }, 201);
      return Promise.reject(new Error(`Appel non prévu : ${m} ${u}`));
    });
    const user = userEvent.setup();
    monter('/relationnel');
    await user.click(await screen.findByRole('button', { name: 'Rechercher' }));
    await user.type(await screen.findByLabelText('Prénom'), 'Ama');
    await user.type(screen.getByLabelText('Nom'), 'Fictif');
    await user.type(screen.getByLabelText('Contact (téléphone ou courriel)'), '0810000000');
    await user.click(screen.getByRole('button', { name: 'Créer le visiteur' }));
    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByText('Un visiteur a déjà ce contact.')).toBeInTheDocument();
    expect(within(alerte).getByText(/Ama Autre — \*\*\*00/)).toBeInTheDocument();
    await user.click(
      within(alerte).getByRole('button', { name: /autre personne \(homonyme distinct\)/ }),
    );
    expect(await screen.findByText('Fiche créée : Ama Fictif.')).toBeInTheDocument();
    const posts = appels.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>);
    expect(posts[1]).toEqual({
      prenom: 'Ama',
      nom: 'Fictif',
      contact: '0810000000',
      motif_doublon: 'homonyme_distinct',
    });
  });

  it('avec « visiteur.modifier » (Assistant, Autorité) : fiche complète et modification des seuls champs changés', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['visiteur.rechercher', 'visiteur.creer', 'visiteur.modifier'])],
      [
        'GET /visiteurs',
        {
          elements: [
            {
              id: 'v1',
              nom_complet: 'Ama Fictif',
              prenom: 'Ama',
              nom: 'Fictif',
              contact: 'ama@exemple.invalid',
              qualite: 'Délégué fictif',
            },
          ],
          limite: 20,
          decalage: 0,
        },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      [
        'PATCH /visiteurs/v1',
        {
          id: 'v1',
          nom_complet: 'Ama Fictif',
          prenom: 'Ama',
          nom: 'Fictif',
          contact: 'ama@exemple.invalid',
          qualite: 'Ministre fictif',
        },
      ],
    ]);
    const user = userEvent.setup();
    monter('/relationnel');
    expect(await screen.findByText('ama@exemple.invalid')).toBeInTheDocument();
    expect(screen.getByText('Délégué fictif')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const qualite = await screen.findByLabelText('Qualité / fonction');
    await user.clear(qualite);
    await user.type(qualite, 'Ministre fictif');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la modification' }));
    await waitFor(() =>
      expect(corpsEnvoye(appels, 'PATCH')).toEqual([{ qualite: 'Ministre fictif' }]),
    );
  });

  it('ne propose pas de création sans le droit visiteur.creer', async () => {
    simulerApi([
      ['GET /droits', droits(['visiteur.rechercher'])],
      ['GET /visiteurs', { elements: [], limite: 20, decalage: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    monter('/relationnel');
    expect(await screen.findByText('Aucun visiteur trouvé.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer le visiteur' })).not.toBeInTheDocument();
  });
});
