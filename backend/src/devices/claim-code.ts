import { createHash, randomInt } from 'crypto';

/**
 * Codigo de claim: lo genera el banco al aprovisionar y lo teclea el dueño en
 * la app para reclamar el dispositivo. Human-typeable y de un solo uso.
 *
 * Alfabeto Crockford base32 sin caracteres ambiguos (sin I, L, O, U): evita
 * confundir 1/I/L y 0/O al leer una pegatina. 8 simbolos = ~41 bits; suficiente
 * porque la ventana de pairing es corta y el codigo se quema al reclamar.
 *
 * En la BD nunca vive el codigo en claro: solo su hash SHA-256 (`claimCodeHash`).
 * La comparacion normaliza (mayusculas, sin guiones ni espacios) para que el
 * formato de presentacion `XXXX-XXXX` no importe al teclearlo.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, sin I L O U
const CODE_LEN = 8;

/** Normaliza a comparacion: mayusculas y solo simbolos del alfabeto. */
export function normalizeClaimCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Codigo nuevo, ya con guion para mostrar: `XXXX-XXXX`. */
export function generateClaimCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Hash del codigo normalizado; lo unico que se guarda o compara. */
export function hashClaimCode(code: string): string {
  return createHash('sha256').update(normalizeClaimCode(code)).digest('hex');
}
