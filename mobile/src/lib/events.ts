import type { TFunction } from 'i18next';

// Glifos HUD por tipo de evento (compartido dashboard + historial).
export const KIND_GLYPH: Record<string, string> = {
  suspected_movement: '▲',
  battery_low: '▼',
  power_lost: '✕',
  heartbeat: '♥',
  gnss_fix: '⌖',
};

export function getEventGlyph(kind: string): string {
  return KIND_GLYPH[kind] ?? '·';
}

export function isAlertKind(kind: string): boolean {
  return kind === 'suspected_movement' || kind === 'power_lost';
}

export function getEventLabel(kind: string, t: TFunction): string {
  const labels: Record<string, string> = {
    suspected_movement: t('events.kindSuspectedMovement'),
    battery_low: t('events.kindBatteryLow'),
    power_lost: t('events.kindPowerLost'),
    heartbeat: t('events.kindHeartbeat'),
    gnss_fix: t('events.kindGnssFix'),
  };
  return labels[kind] ?? kind;
}

// "22:41" si es hoy, "20 sep, 22:41" si no — compacto para timeline.
export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hhmm = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return hhmm;
  const dayMonth = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${dayMonth}, ${hhmm}`;
}
