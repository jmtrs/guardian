import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado en reposo de la clave raiz del dispositivo (K_root). Antes viajaba en
 * claro en Postgres (TODO del schema); ahora se guarda cifrada con una master
 * key que vive FUERA de la base (env GUARDIAN_SECRET_KEY, KMS-ready). Solo se
 * descifra en memoria para verificar una firma; nunca se devuelve al cliente.
 *
 * Formato versionado: `enc:v1:<iv>:<tag>:<ct>` (base64). El prefijo permite
 * rotar el esquema sin adivinar, y distinguir de los secretos legado en claro
 * (sin prefijo) sin migracion de datos: un secreto viejo se lee tal cual y se
 * re-cifra la proxima vez que se escriba.
 *
 * AES-256-GCM: confidencialidad + integridad. Un secreto manipulado en la BD
 * falla el tag y no descifra (nunca produce una K_root silenciosamente falsa).
 */

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM estandar
const KEY_BYTES = 32; // AES-256

/**
 * Master key desde env. Acepta 64 hex (32 bytes) o base64 de 32 bytes.
 * `null` si no esta configurada: en dev/test se opera en claro (ver encrypt).
 */
function masterKey(): Buffer | null {
  const raw = process.env.GUARDIAN_SECRET_KEY;
  if (!raw) {
    return null;
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('GUARDIAN_SECRET_KEY must decode to 32 bytes (64 hex or base64)');
  }
  return key;
}

/** Boot guard: en produccion la master key es obligatoria (fail-closed). */
export function assertSecretKeyConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !masterKey()) {
    throw new Error('GUARDIAN_SECRET_KEY is required in production (device secret encryption)');
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/**
 * Cifra un secreto en claro (hex de K_root). Sin master key configurada
 * (dev/test) devuelve el texto en claro: el banco local sigue funcionando y en
 * produccion `assertSecretKeyConfigured` ya aborto el arranque si faltaba.
 */
export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) {
    return plain;
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Descifra un secreto almacenado. Legado sin prefijo: se devuelve tal cual
 * (compatibilidad hacia atras, sin migracion). Un valor cifrado sin master key
 * es una mala configuracion: se lanza en vez de operar con una clave incorrecta.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    return stored;
  }
  const key = masterKey();
  if (!key) {
    throw new Error('Encrypted device secret found but GUARDIAN_SECRET_KEY is not set');
  }
  const [, , ivB64, tagB64, ctB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted device secret');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
