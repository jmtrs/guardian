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
 * NOTA de seguridad: no existe funcion inversa "cerrar por evento" sobre un
 * incidente OPEN. El ingest nunca silencia una alerta sin reviso humano; un
 * heartbeat posterior no la borra. Lo unico que avanza un OPEN es el dueno
 * (Revisado). El anti-robo exige que la alerta sea un hecho persistente, no
 * el reflejo del ultimo evento recibido.
 */
export function shouldOpenIncident(state: DeviceState, kind: string): boolean {
  return state === 'ARMED' && ALERT_KINDS.has(kind);
}

/**
 * Cierre por recuperacion OBSERVADA — solo sobre incidentes ya revisados.
 * Una vez el dueno conoce el corte (ACKNOWLEDGED), un evento posterior que
 * re-observa la alimentacion del vehiculo (power.source='vehicle') certifica
 * que la condicion que abrio el incidente ya no existe: cerrar es honesto y
 * queda trazado con closedByEventSeq. Sobre OPEN nunca actua: eso seria
 * auto-resolver una alerta sin reviso humano (invariante de arriba).
 */
export function shouldCloseAcknowledged(
  incidentState: 'ACKNOWLEDGED' | 'CLOSED' | 'OPEN',
  incidentKind: IncidentKind,
  powerSource: string,
): boolean {
  return (
    incidentState === 'ACKNOWLEDGED' &&
    incidentKind === 'power_lost' &&
    powerSource === 'vehicle'
  );
}

/** El kind del evento como IncidentKind (solo valido si shouldOpenIncident). */
export function incidentKindFor(kind: string): IncidentKind {
  return kind as IncidentKind;
}

/**
 * Tipos de incidente que se resuelven al autorizar un viaje: el dueno, con su
 * sesion autenticada, declara presencia ("fui yo"). Es el sustituto EN SOFTWARE
 * del reto BLE autenticado (diferido a firmware, §6): cuando exista, el firmware
 * confirmara la presencia criptograficamente al despertar por movimiento y
 * cerrara estos incidentes sin intervencion manual — sin cambiar este contrato.
 *
 * power_lost NO se incluye a proposito: un corte de alimentacion es mas serio
 * (posible manipulacion) y exige Revisado/cierre explicito aunque haya viaje.
 */
export const TRIP_RESOLVING_KINDS: IncidentKind[] = ['suspected_movement'];
