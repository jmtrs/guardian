import { shouldOpenIncident, shouldCloseAcknowledged, TRIP_RESOLVING_KINDS } from './incident';

// La regla de apertura de incidentes es el corazon de la seguridad de estado:
// se testea pura, sin BD (igual que protocol.spec.ts).
describe('shouldOpenIncident', () => {
  it('abre por movimiento sospechoso cuando esta ARMED', () => {
    expect(shouldOpenIncident('ARMED', 'suspected_movement')).toBe(true);
  });

  it('abre por corte de alimentacion cuando esta ARMED', () => {
    expect(shouldOpenIncident('ARMED', 'power_lost')).toBe(true);
  });

  it('un heartbeat nunca abre incidente (y por tanto nunca lo cierra)', () => {
    // No hay logica de cierre por evento: si heartbeat ni siquiera abre,
    // tampoco puede borrar una alerta existente. Invariante anti-robo.
    expect(shouldOpenIncident('ARMED', 'heartbeat')).toBe(false);
  });

  it('gnss_fix y battery_low no son alertas', () => {
    expect(shouldOpenIncident('ARMED', 'gnss_fix')).toBe(false);
    expect(shouldOpenIncident('ARMED', 'battery_low')).toBe(false);
  });

  it('durante un viaje autorizado (TRIP) no hay alerta', () => {
    expect(shouldOpenIncident('TRIP', 'suspected_movement')).toBe(false);
    expect(shouldOpenIncident('TRIP', 'power_lost')).toBe(false);
  });

  it('en taller (WORKSHOP) no hay alerta', () => {
    expect(shouldOpenIncident('WORKSHOP', 'suspected_movement')).toBe(false);
  });
});

describe('TRIP_RESOLVING_KINDS', () => {
  it('autorizar viaje resuelve movimiento (presencia del dueno)', () => {
    expect(TRIP_RESOLVING_KINDS).toContain('suspected_movement');
  });

  it('NO auto-resuelve corte de alimentacion (exige Revisado explicito)', () => {
    expect(TRIP_RESOLVING_KINDS).not.toContain('power_lost');
  });
});

describe('shouldCloseAcknowledged (cierre por recuperacion observada)', () => {
  it('power_lost revisado + alimentacion restablecida -> cierra', () => {
    expect(shouldCloseAcknowledged('ACKNOWLEDGED', 'power_lost', 'vehicle')).toBe(true);
  });

  it('OPEN jamas se cierra por evento: exige Revisado primero', () => {
    expect(shouldCloseAcknowledged('OPEN', 'power_lost', 'vehicle')).toBe(false);
  });

  it('sin restauracion real (sigue en reserva) no cierra', () => {
    expect(shouldCloseAcknowledged('ACKNOWLEDGED', 'power_lost', 'reserve')).toBe(false);
    expect(shouldCloseAcknowledged('ACKNOWLEDGED', 'power_lost', 'unknown')).toBe(false);
  });

  it('movimiento no se cierra por telemetria de energia', () => {
    expect(shouldCloseAcknowledged('ACKNOWLEDGED', 'suspected_movement', 'vehicle')).toBe(false);
  });
});
