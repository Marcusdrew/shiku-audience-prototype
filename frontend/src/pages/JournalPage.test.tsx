import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const entree = (i: number) => ({
  id: String(i),
  horodatage: '2026-10-20T10:00:00Z',
  action: 'demande.creer',
  objet_type: 'demande',
  objet_id: '11111111-1111-4111-8111-111111111111',
  utilisateur_nom: 'Auteur fictif',
});

describe('écran Journal', () => {
  it('transmet au serveur les seuls filtres qu’il expose (type, identifiant) et pagine', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['journal.consulter'])],
      ['GET /journal', { elements: Array.from({ length: 50 }, (_, i) => entree(i)), limite: 50 }],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
    ]);
    const u = userEvent.setup();
    monter('/journal');
    expect((await screen.findAllByText('Auteur fictif')).length).toBe(50);
    const urls = () =>
      appels.mock.calls.map((c) => String(c[0])).filter((x) => x.includes('/journal'));
    await u.selectOptions(screen.getByLabelText('Type d’objet'), 'audience');
    await waitFor(() => expect(urls().at(-1)).toContain('objet_type=audience'));
    await u.type(screen.getByLabelText('Identifiant de l’objet (UUID)'), 'pas-un-uuid');
    expect(screen.getByRole('button', { name: 'Filtrer' })).toBeDisabled();
    await u.click(await screen.findByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(urls().at(-1)).toContain('decalage=50'));
  });
});
