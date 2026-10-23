import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const entree = (i: number) => ({
  id: String(i),
  horodatage: '2026-10-20T10:00:00Z',
  action: 'demande.changer_priorite',
  objet_type: 'demande',
  objet_id: '11111111-1111-4111-8111-111111111111',
  utilisateur_nom: 'Auteur fictif',
  categorie: 'priorite',
  categorie_libelle: 'Priorité',
  resultat: 'accepte',
  sous_delegation: false,
  auteur: 'utilisateur',
});
const CATEGORIES = [
  { code: 'droits_delegations', libelle: 'Droits et délégations' },
  { code: 'priorite', libelle: 'Priorité' },
];

describe('écran Journal', () => {
  it('transmet au serveur les seuls filtres qu’il expose (type, identifiant) et pagine', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['journal.consulter'])],
      ['GET /journal/purges', { elements: [] }],
      [
        'GET /journal',
        {
          elements: Array.from({ length: 50 }, (_, i) => entree(i)),
          limite: 50,
          categories_visibles: CATEGORIES,
        },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/journal');
    expect((await screen.findAllByText('Auteur fictif')).length).toBe(50);
    const urls = () =>
      appels.mock.calls
        .map((c) => String(c[0]))
        .filter((x) => x.includes('/journal') && !x.includes('/purges'));
    await u.selectOptions(screen.getByLabelText('Catégorie'), 'droits_delegations');
    await waitFor(() => expect(urls().at(-1)).toContain('categorie=droits_delegations'));
    await u.selectOptions(screen.getByLabelText('Type d’objet'), 'audience');
    await waitFor(() => expect(urls().at(-1)).toContain('objet_type=audience'));
    await u.type(screen.getByLabelText('Identifiant de l’objet (UUID)'), 'pas-un-uuid');
    expect(screen.getByRole('button', { name: 'Filtrer' })).toBeDisabled();
    await u.click(await screen.findByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(urls().at(-1)).toContain('decalage=50'));
  });

  it('affiche catégorie, résultat « Refusé », auteur « Système » et le récapitulatif des purges', async () => {
    simulerApi([
      ['GET /droits', droits(['journal.consulter'])],
      [
        'GET /journal/purges',
        {
          elements: [
            {
              id: '1',
              purge_le: '2026-10-20T10:00:00Z',
              entrees_supprimees: 3,
              plus_ancienne: '2017-01-01T00:00:00Z',
              plus_recente: '2019-01-01T00:00:00Z',
              par_categorie: { 'Décisions et audiences': 2, 'Droits et délégations': 1 },
            },
          ],
        },
      ],
      [
        'GET /journal',
        {
          elements: [
            {
              ...entree(1),
              action: 'role.attribuer',
              categorie: 'droits_delegations',
              categorie_libelle: 'Droits et délégations',
              resultat: 'refuse',
              utilisateur_nom: 'Adam Fictif',
            },
            {
              ...entree(2),
              action: 'rattachement_agenda.initialiser',
              categorie: 'droits_delegations',
              categorie_libelle: 'Droits et délégations',
              auteur: 'systeme',
              utilisateur_nom: 'Système',
            },
          ],
          categories_visibles: CATEGORIES,
        },
      ],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    monter('/journal');
    expect(await screen.findByText('Système')).toBeInTheDocument();
    expect(screen.getByText('Refusé')).toBeInTheDocument();
    expect(screen.getByText('Accepté')).toBeInTheDocument();
    expect(
      await screen.findByText('Décisions et audiences : 2 ; Droits et délégations : 1'),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
