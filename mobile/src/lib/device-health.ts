// Salud del dispositivo derivada de lo ya almacenado en servidor (sin protocolo
// nuevo): online/offline a partir de `lastSeenAt`. GPS/modem/acelerometro NO se
// pueden reportar aun — requieren self-test en el contrato v3.

// Ventana de frescura de `lastSeenAt` para considerar el dispositivo "en linea".
// PROVISIONAL: la cadencia de heartbeat aun no esta fijada (se elige tras medir
// mAh/dia reales, docs INTEGRACION §check-in). Ajustar a ~3x la cadencia real
// cuando se conozca, para no marcar offline por un ciclo perdido.
export const ONLINE_WINDOW_MS = 15 * 60_000;

export type DeviceOnlineState = 'online' | 'offline' | 'never';

export function deviceOnline(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
): DeviceOnlineState {
  if (!lastSeenAt) return 'never';
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return 'never';
  return now - seen <= ONLINE_WINDOW_MS ? 'online' : 'offline';
}

// "hace 2 min" / "hace 3 h" / "hace 1 d" — antiguedad compacta de un instante
// pasado. Complementa formatEventTime (reloj) y formatCountdown (futuro). null
// si no hay fecha. Devuelve minutos con piso 1 ("hace 0 min" no aporta).
export function formatSince(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const totalMin = Math.max(1, Math.floor((now - then) / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}
