import type { DeviceState, IncidentKind } from '@prisma/client';

// Tipos de evento que abren incidente cuando el dispositivo esta ARMED.
// Espejo de mobile isAlertKind: movimiento sospechoso o corte de alimentacion.
const ALERT_KINDS = new Set<string>(['suspected_movement', 'power_lost']);

/**
 * Decide si un evento debe abrir un incidente de seguridad. Puro: sin BD, sin
 * efectos. La regla es la unica autoridad sobre "esto es una alerta":
 *   - Solo con el dispositivo ARMED (durante TRIP autorizado no hay alerta).
 *   - Solo para tipos de alerta (movimiento / corte de energia).
 *
 * NOTA de seguridad: no existe funcion inversa "cerrar por evento". El ingest
 * nunca cierra un incidente; un heartbeat posterior no lo borra. Solo el dueno
 * lo reconoce (ACKNOWLEDGED) o lo cierra (CLOSED). El anti-robo exige que la
 * alerta sea un hecho persistente, no el reflejo del ultimo evento recibido.
 */
export function shouldOpenIncident(state: DeviceState, kind: string): boolean {
  return state === 'ARMED' && ALERT_KINDS.has(kind);
}

/** El kind del evento como IncidentKind (solo valido si shouldOpenIncident). */
export function incidentKindFor(kind: string): IncidentKind {
  return kind as IncidentKind;
}
