// Gap pequeño para no tardar 1s por test; el mecanismo es el mismo que en prod.
process.env.GEOCODE_MIN_GAP_MS = '80';

import { GeocodeService } from './geocode.service';

function mockNominatim() {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      address: { road: 'Calle de la Palma', house_number: '15', city: 'Madrid', country: 'España' },
    }),
  }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return fetchMock;
}

describe('GeocodeService (proxy con cache + rate-limit)', () => {
  it('cache: la misma coordenada no vuelve a salir al upstream', async () => {
    const fetchMock = mockNominatim();
    const svc = new GeocodeService();
    const a = await svc.reverse(40.4168, -3.7038);
    const b = await svc.reverse(40.4168, -3.7038); // idéntica (mismo redondeo)
    expect(a).toEqual({ label: 'Calle de la Palma 15', detail: 'Madrid, España' });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1); // segunda servida de cache
  });

  it('rate-limit: coordenadas distintas se serializan con el gap minimo', async () => {
    const fetchMock = mockNominatim();
    const svc = new GeocodeService();
    const start = Date.now();
    await Promise.all([svc.reverse(1, 1), svc.reverse(2, 2), svc.reverse(3, 3)]);
    const elapsed = Date.now() - start;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 3 llamadas, >=2 gaps de 80ms => al menos ~160ms aunque lleguen en rafaga.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it('un fallo del upstream no rompe la cola: la siguiente consulta sigue', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ address: { city: 'Madrid', country: 'España' } }),
      });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    const svc = new GeocodeService();
    await expect(svc.reverse(5, 5)).rejects.toThrow();
    await expect(svc.reverse(6, 6)).resolves.toEqual({ label: 'Madrid', detail: 'Madrid, España' });
  });
});
