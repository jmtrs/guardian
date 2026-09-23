import { generateClaimCode, hashClaimCode, normalizeClaimCode } from './claim-code';

describe('claim-code', () => {
  it('genera formato XXXX-XXXX con alfabeto sin ambiguos (I L O U)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClaimCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('normaliza: mayusculas y sin guiones/espacios', () => {
    expect(normalizeClaimCode('k7qp-3xr9')).toBe('K7QP3XR9');
    expect(normalizeClaimCode(' K7Q P-3X R9 ')).toBe('K7QP3XR9');
  });

  it('hash: mismo codigo (distinto formato) -> mismo hash', () => {
    expect(hashClaimCode('K7QP-3XR9')).toBe(hashClaimCode('k7qp3xr9'));
    expect(hashClaimCode('K7QP-3XR9')).toBe(hashClaimCode(' k7qp-3xr9 '));
  });

  it('hash: codigos distintos -> hashes distintos, y nunca es el codigo en claro', () => {
    const a = hashClaimCode('K7QP-3XR9');
    const b = hashClaimCode('K7QP-3XRA');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(a).not.toContain('K7QP');
  });
});
