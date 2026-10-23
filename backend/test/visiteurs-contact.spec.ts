import { describe, expect, it } from 'vitest';
import { genreContact, masquerContact } from '../src/visiteurs/contact.js';

describe('contact du visiteur (DEC-36)', () => {
  it('masque un courriel : première lettre, ***, première lettre du domaine, ***, extension', () => {
    expect(masquerContact('jean.dupont@gmail.com')).toBe('j***@g***.com');
    expect(masquerContact('  A@exemple.invalid ')).toBe('A***@e***.invalid');
    expect(masquerContact('x@sous.domaine.cd')).toBe('x***@s***.cd');
  });
  it('masque un téléphone : seulement les deux derniers chiffres', () => {
    expect(masquerContact('+243 81 234 56 78')).toBe('***78');
    expect(masquerContact('0812345678')).toBe('***78');
  });
  it('ne renvoie jamais la valeur complète', () => {
    for (const c of ['jean.dupont@gmail.com', '+243 81 234 56 78', 'texte libre'])
      expect(masquerContact(c)).not.toContain(c);
    expect(masquerContact(null)).toBeNull();
    expect(masquerContact('   ')).toBeNull();
  });
  it('reconnaît un courriel ou un téléphone, refuse le reste', () => {
    expect(genreContact('a@b.cd')).toBe('courriel');
    expect(genreContact('+243 (0)81-234.56')).toBe('telephone');
    expect(genreContact('a@b')).toBeNull();
    expect(genreContact('12345')).toBeNull();
    expect(genreContact('rue des Fleurs')).toBeNull();
  });
});
