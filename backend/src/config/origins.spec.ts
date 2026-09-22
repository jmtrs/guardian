describe('trustedOrigins (fuente unica CORS + auth)', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevTrusted = process.env.TRUSTED_ORIGINS;
  let origins: typeof import('./origins');

  beforeEach(() => {
    jest.resetModules();
    origins = require('./origins');
  });
  afterAll(() => {
    process.env.NODE_ENV = prevEnv;
    process.env.TRUSTED_ORIGINS = prevTrusted;
  });

  it('produccion: NO admite los origenes de desarrollo (localhost/exp)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TRUSTED_ORIGINS;
    const list = origins.trustedOrigins();
    expect(list).toContain('guardian://');
    expect(list).not.toContain('http://localhost:8081');
    expect(list.some((o) => o.startsWith('exp://'))).toBe(false);
  });

  it('produccion: admite lo declarado en TRUSTED_ORIGINS (dominio web)', () => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_ORIGINS = 'https://app.guardian.example, https://admin.guardian.example';
    const list = origins.trustedOrigins();
    expect(list).toContain('https://app.guardian.example');
    expect(list).toContain('https://admin.guardian.example');
  });

  it('desarrollo: incluye el bloque local para iterar sin configurar', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TRUSTED_ORIGINS;
    const list = origins.trustedOrigins();
    expect(list).toContain('http://localhost:8081');
    expect(list).toContain('guardian://');
  });
});
