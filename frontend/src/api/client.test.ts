import { ApiError, appeler } from './client';

afterEach(() => vi.restoreAllMocks());

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });

describe('appeler', () => {
  it('renvoie le JSON et n’ajoute pas d’Authorization sans jeton', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse({ statut: 'ok' }));
    await expect(appeler('/sante')).resolves.toEqual({ statut: 'ok' });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('/api/sante');
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('transmet le jeton en Bearer quand il est fourni', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse({}));
    await appeler('/x', { jeton: 'abc' });
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer abc',
    );
  });
  it('convertit un statut HTTP en erreur lisible', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse({}, 503));
    await expect(appeler('/sante')).rejects.toMatchObject({ statut: 503 });
  });
  it('convertit une coupure réseau en ApiError sans statut', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await appeler('/sante').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).statut).toBeNull();
  });
});
