import { deviceOnline, formatSince, ONLINE_WINDOW_MS } from '../device-health';

describe('device-health', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime();

  describe('deviceOnline', () => {
    it('never sin fecha', () => {
      expect(deviceOnline(null, now)).toBe('never');
      expect(deviceOnline(undefined, now)).toBe('never');
    });

    it('never con fecha invalida', () => {
      expect(deviceOnline('no-es-fecha', now)).toBe('never');
    });

    it('online dentro de la ventana', () => {
      const seen = new Date(now - (ONLINE_WINDOW_MS - 1_000)).toISOString();
      expect(deviceOnline(seen, now)).toBe('online');
    });

    it('online en el borde exacto', () => {
      const seen = new Date(now - ONLINE_WINDOW_MS).toISOString();
      expect(deviceOnline(seen, now)).toBe('online');
    });

    it('offline pasada la ventana', () => {
      const seen = new Date(now - (ONLINE_WINDOW_MS + 1_000)).toISOString();
      expect(deviceOnline(seen, now)).toBe('offline');
    });
  });

  describe('formatSince', () => {
    it('null sin fecha', () => {
      expect(formatSince(null, now)).toBeNull();
      expect(formatSince('no-es-fecha', now)).toBeNull();
    });

    it('piso de 1 min', () => {
      expect(formatSince(new Date(now - 10_000).toISOString(), now)).toBe('1 min');
    });

    it('minutos', () => {
      expect(formatSince(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min');
    });

    it('horas a partir de 60 min', () => {
      expect(formatSince(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h');
    });

    it('dias a partir de 24 h', () => {
      expect(formatSince(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2 d');
    });
  });
});
