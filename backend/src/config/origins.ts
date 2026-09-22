/**
 * Origenes de confianza, fuente unica para Better Auth (trustedOrigins) y CORS
 * (main.ts). No mas `enableCors()` abierto: produccion solo admite lo declarado.
 *
 * Los endpoints del dispositivo (/v1/events, /v1/commands/poll) los llama el
 * firmware sin cabecera Origin, asi que CORS no les afecta; esta lista protege
 * el canal del navegador/app. La firma HMAC sigue siendo la autoridad del
 * dispositivo, no CORS.
 */

// Scheme nativo de la app (app.json -> expo.scheme). Presente en dev y prod:
// el fetch nativo del dev-build manda Origin: guardian://.
const APP_SCHEME = 'guardian://';

// Solo desarrollo: Metro, Expo Go y loopback. Nunca en produccion.
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'exp://127.0.0.1:8081',
  'exp://localhost:8081',
];

/** Origenes extra por entorno: coma-separado en TRUSTED_ORIGINS (LAN, web prod). */
function envOrigins(): string[] {
  return (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Lista efectiva de origenes. Produccion: SOLO el scheme de la app y lo que
 * declare TRUSTED_ORIGINS (p.ej. el dominio web). Desarrollo: ademas el bloque
 * local para iterar sin configurar nada.
 */
export function trustedOrigins(): string[] {
  const extra = envOrigins();
  if (process.env.NODE_ENV === 'production') {
    return [APP_SCHEME, ...extra];
  }
  return [APP_SCHEME, ...DEV_ORIGINS, ...extra];
}
