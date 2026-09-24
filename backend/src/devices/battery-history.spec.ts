import { resolveBatteryQuery } from './battery-history';
import { ProtocolError } from './protocol';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-24T12:00:00.000Z');
const RETENTION = 90;

describe('resolveBatteryQuery', () => {
  it('default bucket = day con ventana de 30d', () => {
    const q = resolveBatteryQuery({}, NOW, RETENTION);
    expect(q.bucket).toBe('day');
    expect(q.trunc).toBe('day');
    expect(q.stepInterval).toBe('1 day');
    expect(q.to).toEqual(NOW);
    expect(q.from).toEqual(new Date(NOW.getTime() - 30 * DAY_MS));
  });

  it('bucket hour -> ventana 24h + step 1 hour', () => {
    const q = resolveBatteryQuery({ bucket: 'hour' }, NOW, RETENTION);
    expect(q.trunc).toBe('hour');
    expect(q.stepInterval).toBe('1 hour');
    expect(q.from).toEqual(new Date(NOW.getTime() - 24 * 60 * 60 * 1000));
  });

  it('bucket week -> ventana 84d + step 1 week', () => {
    const q = resolveBatteryQuery({ bucket: 'week' }, NOW, RETENTION);
    expect(q.trunc).toBe('week');
    expect(q.stepInterval).toBe('1 week');
    expect(q.from).toEqual(new Date(NOW.getTime() - 84 * DAY_MS));
  });

  it('bucket invalido -> default day', () => {
    expect(resolveBatteryQuery({ bucket: 'nonsense' }, NOW, RETENTION).bucket).toBe('day');
    expect(resolveBatteryQuery({ bucket: '' }, NOW, RETENTION).bucket).toBe('day');
    expect(resolveBatteryQuery({ bucket: 'DAY' }, NOW, RETENTION).bucket).toBe('day');
  });

  it('from/to invalidos se tratan como ausentes', () => {
    const q = resolveBatteryQuery({ from: 'abc', to: '' }, NOW, RETENTION);
    expect(q.to).toEqual(NOW);
    expect(q.from).toEqual(new Date(NOW.getTime() - 30 * DAY_MS));
  });

  it('to ausente -> now; from y to validos se respetan', () => {
    const from = '2026-09-20T00:00:00.000Z';
    const to = '2026-09-22T00:00:00.000Z';
    const q = resolveBatteryQuery({ from, to }, NOW, RETENTION);
    expect(q.from).toEqual(new Date(from));
    expect(q.to).toEqual(new Date(to));
  });

  it('clamp de from al corte de retencion', () => {
    // hour pediria 24h, pero forzamos un from muy viejo con retencion de 1 dia.
    const q = resolveBatteryQuery({ from: '2020-01-01T00:00:00.000Z' }, NOW, 1);
    expect(q.from).toEqual(new Date(NOW.getTime() - 1 * DAY_MS));
  });

  it('week con retencion corta: la ventana default se recorta a retencion', () => {
    const q = resolveBatteryQuery({ bucket: 'week' }, NOW, 7);
    expect(q.from).toEqual(new Date(NOW.getTime() - 7 * DAY_MS));
  });

  it('from >= to -> ProtocolError (400)', () => {
    expect(() =>
      resolveBatteryQuery(
        { from: '2026-09-22T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' },
        NOW,
        RETENTION,
      ),
    ).toThrow(ProtocolError);
    expect(() =>
      resolveBatteryQuery(
        { from: '2026-09-20T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' },
        NOW,
        RETENTION,
      ),
    ).toThrow(ProtocolError);
  });

  it('rango entero por debajo de retencion -> from clamp supera a to -> 400', () => {
    expect(() =>
      resolveBatteryQuery(
        { from: '2020-01-01T00:00:00.000Z', to: '2020-02-01T00:00:00.000Z' },
        NOW,
        90,
      ),
    ).toThrow(ProtocolError);
  });

  it('tz default UTC', () => {
    expect(resolveBatteryQuery({}, NOW, RETENTION).tz).toBe('UTC');
  });

  it('tz IANA valida se respeta', () => {
    expect(resolveBatteryQuery({ tz: 'Europe/Madrid' }, NOW, RETENTION).tz).toBe('Europe/Madrid');
  });

  it('tz basura -> UTC', () => {
    expect(resolveBatteryQuery({ tz: "'; DROP TABLE" }, NOW, RETENTION).tz).toBe('UTC');
    expect(resolveBatteryQuery({ tz: 'a'.repeat(65) }, NOW, RETENTION).tz).toBe('UTC');
    expect(resolveBatteryQuery({ tz: 'has space' }, NOW, RETENTION).tz).toBe('UTC');
  });
});
