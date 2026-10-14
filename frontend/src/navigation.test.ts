import { entreesVisibles } from './navigation';

const libelles = (roles: Parameters<typeof entreesVisibles>[0]) =>
  entreesVisibles(roles).map((e) => e.libelle);

describe('entreesVisibles', () => {
  it('masque le dossier relationnel et l’administration à la Réception', () => {
    const l = libelles(['reception']);
    expect(l).not.toContain('Dossiers relationnels');
    expect(l).not.toContain('Administration');
    expect(l).toContain('Demandes');
  });
  it('réserve l’administration à l’Administrateur', () => {
    expect(libelles(['administrator'])).toContain('Administration');
    expect(libelles(['authority'])).not.toContain('Administration');
  });
});
