import { entreesVisibles, NAVIGATION } from './navigation';

const libelles = (roles: Parameters<typeof entreesVisibles>[0]) =>
  entreesVisibles(roles).map((e) => e.libelle);

describe('entreesVisibles', () => {
  it('Réception : répertoire des visiteurs et demandes, pas d’administration (sans droits serveur)', () => {
    const l = libelles(['reception']);
    expect(l).toContain('Répertoire des visiteurs');
    expect(l).not.toContain('Administration');
    expect(l).toContain('Demandes');
  });
  it('quand les droits du serveur sont connus, ils décident seuls de l’affichage', () => {
    const peut = (a: string) => ['utilisateur.administrer', 'agenda.lister'].includes(a);
    const l = entreesVisibles(['administrator'], peut).map((e) => e.libelle);
    expect(l).toEqual(['Agendas', 'Administration']);
  });
  it('chaque route listée correspond à un appel réellement exposé (aucune route inventée)', () => {
    const connues = new Set([
      'GET /demandes',
      'POST /demandes',
      'GET /demandes/:id',
      'PATCH /demandes/:id',
      'POST /demandes/:id/qualification',
      'GET /decisions/file',
      'POST /demandes/:id/decision',
      'GET /agendas',
      'POST /agendas',
      'POST /agendas/:id/rattachements',
      'POST /rattachements/:id/(autoriser|appliquer|revoquer)',
      'GET /audiences',
      'POST /audiences',
      'POST /audiences/:id/demarrer',
      'POST /audiences/:id/terminer',
      'GET /visiteurs?q=…',
      'POST /visiteurs',
      'PATCH /visiteurs/:id',
      'GET /utilisateurs',
      'POST /utilisateurs',
      'POST /utilisateurs/rattachement',
      'GET /journal',
    ]);
    for (const e of NAVIGATION)
      for (const r of e.api) expect(connues, `${e.chemin} : ${r}`).toContain(r);
  });
  it('réserve l’administration à l’Administrateur', () => {
    expect(libelles(['administrator'])).toContain('Administration');
    expect(libelles(['authority'])).not.toContain('Administration');
  });
});
