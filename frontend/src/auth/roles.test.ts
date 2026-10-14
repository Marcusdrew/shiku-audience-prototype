import { rolesDepuisJeton } from './roles';

function jeton(charge: object): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64(charge)}.sig`;
}

describe('rolesDepuisJeton', () => {
  it('lit les rôles SHIKU du jeton et ignore les rôles inconnus', () => {
    const t = jeton({
      realm_access: { roles: ['assistant', 'default-roles-shiku', 'offline_access'] },
    });
    expect(rolesDepuisJeton(t)).toEqual(['assistant']);
  });
  it('renvoie une liste vide pour un jeton absent ou mal formé', () => {
    expect(rolesDepuisJeton(undefined)).toEqual([]);
    expect(rolesDepuisJeton('pas-un-jeton')).toEqual([]);
    expect(rolesDepuisJeton('a.%%%.c')).toEqual([]);
  });
});
