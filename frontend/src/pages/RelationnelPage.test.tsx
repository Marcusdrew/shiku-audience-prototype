import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

describe('répertoire minimal des visiteurs', () => {
  it('recherche d’abord, puis crée un visiteur avec le droit serveur correspondant', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['visiteur.rechercher', 'visiteur.creer'])],
      ['GET /visiteurs?q=Visiteur', { elements: [], limite: 20, decalage: 0 }],
      ['GET /visiteurs', { elements: [], limite: 20, decalage: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['GET /moi', { sub: 's', identifiant: 'test', nom: null, email: null, roles: [] }],
      [
        'POST /visiteurs',
        { id: 'v-1', nom_complet: 'Visiteur Fictif', contact: null, qualite: null },
      ],
    ]);
    const user = userEvent.setup();
    monter('/relationnel');
    // Pas de formulaire de création avant une recherche (éviter les doublons).
    expect(await screen.findByText(/Recherchez d’abord le visiteur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer le visiteur' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom du visiteur'), 'Visiteur Fictif');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    // Le nom recherché pré-remplit la fiche ; la création part vers le serveur.
    expect(await screen.findByLabelText('Nom complet')).toHaveValue('Visiteur Fictif');
    await user.click(screen.getByRole('button', { name: 'Créer le visiteur' }));
    expect(await screen.findByText('Fiche créée : Visiteur Fictif.')).toBeInTheDocument();
    const post = appels.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      nom_complet: 'Visiteur Fictif',
    });
    await waitFor(() => expect(screen.getByText(/notes, attestations/i)).toBeInTheDocument());
  });

  it('sans rôle Assistant ni Autorité (Réception), le champ de qualification n’est pas proposé', async () => {
    simulerApi([
      ['GET /droits', droits(['visiteur.rechercher', 'visiteur.creer'])],
      ['GET /visiteurs', { elements: [], limite: 20, decalage: 0 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const user = userEvent.setup();
    monter('/relationnel');
    await user.click(await screen.findByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByLabelText('Nom complet')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Qualité/)).not.toBeInTheDocument();
    expect(screen.getByText(/saisie par l’Assistant/)).toBeInTheDocument();
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
