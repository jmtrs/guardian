import { randomBytes } from 'crypto';

import { deriveKey, sign, verify } from './protocol';

// La master key se lee de env en cada llamada, asi que la fijamos por test y la
// restauramos. Modulo sin estado: basta re-importar las funciones puras.
const KEY_HEX = '11'.repeat(32);

describe('secret-crypto (cifrado del K_root en reposo)', () => {
  const prev = process.env.GUARDIAN_SECRET_KEY;
  const prevEnv = process.env.NODE_ENV;
  let crypto: typeof import('./secret-crypto');

  beforeEach(() => {
    jest.resetModules();
    process.env.GUARDIAN_SECRET_KEY = KEY_HEX;
    crypto = require('./secret-crypto');
  });
  afterAll(() => {
    process.env.GUARDIAN_SECRET_KEY = prev;
    process.env.NODE_ENV = prevEnv;
  });

  it('round-trip: cifra -> descifra -> misma K_root, y firma/verifica e2e', () => {
    const rootHex = randomBytes(32).toString('hex');
    const stored = crypto.encryptSecret(rootHex);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain(rootHex); // el claro no aparece en lo guardado
    expect(crypto.decryptSecret(stored)).toBe(rootHex);

    // La clave descifrada firma y verifica igual que la original (como el ingest).
    const deviceId = 'dev-1';
    const body = Buffer.from('{"schemaVersion":2}');
    const k = deriveKey(crypto.decryptSecret(stored), deviceId, 'event');
    expect(verify(body, k, sign(body, deriveKey(rootHex, deviceId, 'event')))).toBe(true);
  });

  it('con master key, un secreto en claro es config invalida: lanza (fail-closed)', () => {
    const plaintext = randomBytes(32).toString('hex');
    expect(crypto.isEncrypted(plaintext)).toBe(false);
    // beforeEach ya fija GUARDIAN_SECRET_KEY: nunca confiar en un claro silencioso.
    expect(() => crypto.decryptSecret(plaintext)).toThrow();
  });

  it('manipulacion en la BD falla el tag GCM (nunca K_root silenciosa)', () => {
    const stored = crypto.encryptSecret(randomBytes(32).toString('hex'));
    const parts = stored.split(':');
    const ct = Buffer.from(parts[4], 'base64');
    ct[0] ^= 0xff; // corromo el primer byte del ciphertext
    parts[4] = ct.toString('base64');
    expect(() => crypto.decryptSecret(parts.join(':'))).toThrow();
  });

  it('valor cifrado sin master key es mala config: lanza, no adivina', () => {
    const stored = crypto.encryptSecret(randomBytes(32).toString('hex'));
    jest.resetModules();
    delete process.env.GUARDIAN_SECRET_KEY;
    const noKey = require('./secret-crypto') as typeof import('./secret-crypto');
    expect(() => noKey.decryptSecret(stored)).toThrow();
  });

  it('sin master key (dev): encrypt deja el claro; prod exige la key al arrancar', () => {
    jest.resetModules();
    delete process.env.GUARDIAN_SECRET_KEY;
    const noKey = require('./secret-crypto') as typeof import('./secret-crypto');
    const plain = randomBytes(32).toString('hex');
    expect(noKey.encryptSecret(plain)).toBe(plain); // dev: sin cifrar
    expect(noKey.decryptSecret(plain)).toBe(plain); // dev: claro se lee tal cual

    process.env.NODE_ENV = 'production';
    expect(() => noKey.assertSecretKeyConfigured()).toThrow();
    process.env.NODE_ENV = 'test';
    expect(() => noKey.assertSecretKeyConfigured()).not.toThrow();
  });
});
