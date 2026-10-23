import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { droits, monter, simulerApi } from '../test/monter';

afterEach(() => vi.restoreAllMocks());

const niveaux = (codes: [string, string][]) =>
  codes.map(([code, libelle], i) => ({ code, libelle, rang: i + 1 }));
const REFERENTIEL = {
  niveau: niveaux([
    ['normale', 'Normale'],
    ['elevee', 'Élevée'],
    ['critique', 'Critique'],
  ]),
  rang_protocolaire: niveaux([
    ['standard', 'Rang standard'],
    ['eleve', 'Rang élevé'],
    ['tres_eleve', 'Rang très élevé'],
  ]),
  urgence: niveaux([
    ['normale', 'Normale'],
    ['elevee', 'Élevée'],
    ['critique', 'Critique'],
  ]),
  importance_strategique: niveaux([
    ['normale', 'Normale'],
    ['elevee', 'Élevée'],
    ['critique', 'Critique'],
  ]),
  relation: niveaux([
    ['normale', 'Normale'],
    ['elevee', 'Élevée'],
    ['critique', 'Critique'],
  ]),
};
const DEMANDE = {
  id: 'd1',
  reference: 'DEM-2026-000001',
  statut: 'qualifiee',
  objet: 'Objet fictif',
  contact: 'c@exemple.invalid',
  derogation: null,
  qualification_initiale: null,
  cree_le: '2026-10-22T09:00:00Z',
  visiteur_id: 'v1',
  visiteur_nom: 'Visiteur Fictif',
  agenda_id: 'a1',
  agenda_nom: 'Agenda fictif',
  responsable_suivi_nom: 'Aude Fictive',
  cree_par_nom: 'Réa Fictive',
  rang_protocolaire: 'eleve',
  urgence: null,
  importance_strategique: null,
  relation: null,
  priorite: null,
};
const corps = (appels: ReturnType<typeof simulerApi>, methode: string) =>
  appels.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === methode)
    .map((c) => [
      String(c[0]).replace(/^\/api/, ''),
      JSON.parse(String((c[1] as RequestInit).body)),
    ]);

describe('priorité à six critères (DEC-37)', () => {
  it('Assistant : les six critères sont affichés ; il saisit les critères mais ne fixe pas le niveau', async () => {
    const appels = simulerApi([
      ['GET /droits', droits(['demande.consulter', 'demande.saisir_criteres'])],
      ['GET /priorite/referentiel', REFERENTIEL],
      ['GET /demandes/d1', DEMANDE],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['PATCH /demandes/d1/criteres', { id: 'd1' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes/d1');
    const carte = (await screen.findByRole('heading', { name: 'Priorité' })).closest('section')!;
    expect((await within(carte).findAllByText('Rang élevé')).length).toBeGreaterThan(0);
    for (const t of [
      'Agenda',
      'Rang protocolaire',
      'Urgence',
      'Importance stratégique',
      'Relation',
      'Chronologie',
    ])
      expect(within(carte).getAllByText(t).length).toBeGreaterThan(0);
    expect(within(carte).getByText('Non fixé (rang par ancienneté)')).toBeInTheDocument();
    expect(within(carte).queryByText('Fixer le niveau de priorité')).not.toBeInTheDocument();
    await u.selectOptions(within(carte).getByLabelText('Urgence'), 'critique');
    await u.click(within(carte).getByRole('button', { name: 'Enregistrer les critères' }));
    await waitFor(() =>
      expect(corps(appels, 'PATCH')).toEqual([['/demandes/d1/criteres', { urgence: 'critique' }]]),
    );
  });

  it('Autorité : fixe le niveau avec une justification facultative', async () => {
    const appels = simulerApi([
      [
        'GET /droits',
        droits(['demande.consulter', 'demande.saisir_criteres', 'demande.changer_priorite']),
      ],
      ['GET /priorite/referentiel', REFERENTIEL],
      ['GET /demandes/d1', DEMANDE],
      ['GET /sante', { statut: 'ok', base: 'ok' }],
      ['POST /demandes/d1/priorite', { id: 'd1', priorite: 'elevee' }],
    ]);
    const u = userEvent.setup();
    monter('/demandes/d1');
    await u.selectOptions(await screen.findByLabelText('Niveau'), 'elevee');
    await u.type(screen.getByLabelText(/Justification/), 'Demande du cabinet (fictif)');
    await u.click(screen.getByRole('button', { name: 'Fixer le niveau' }));
    await waitFor(() =>
      expect(corps(appels, 'POST')).toEqual([
        [
          '/demandes/d1/priorite',
          { niveau: 'elevee', justification: 'Demande du cabinet (fictif)' },
        ],
      ]),
    );
  });
});
