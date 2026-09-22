import { decodeEvent, deriveKey, sign, verify, ProtocolError, ALLOWED_TYPES } from './protocol';

// Contrato v2 puro: sin BD, sin HTTP.

const POWER = { vehicleMv: 13600, reserveMv: 4100, source: 'vehicle' } as const;

function encodeEvent(deviceId: string, sequence: number, kind: string): Buffer {
  const event = {
    schemaVersion: 2,
    deviceId,
    sequence,
    kind,
    observedAtUtc: new Date().toISOString(),
    power: POWER,
    position: null,
  };
  return Buffer.from(JSON.stringify(event), 'utf8');
}

describe('protocol (envelope v2)', () => {
  const key = Buffer.alloc(32, 'x');

  it('verifica firma y rechaza tamper / clave equivocada', () => {
    const body = encodeEvent('veh-1', 1, 'suspected_movement');
    const signature = sign(body, key);
    expect(verify(body, key, signature)).toBe(true);
    const tampered = Buffer.from(
      body.toString('utf8').replace('suspected', 'authorized'),
      'utf8',
    );
    expect(verify(tampered, key, signature)).toBe(false);
    expect(verify(body, Buffer.alloc(32, 'y'), signature)).toBe(false);
  });

  it('no fabrica GPS ausente', () => {
    const body = encodeEvent('veh-1', 2, 'suspected_movement');
    expect(decodeEvent(body, 'veh-1').position).toBeNull();
  });

  it('rechaza sequence=true (boolean)', () => {
    const base = JSON.parse(encodeEvent('veh-1', 1, 'suspected_movement').toString());
    base.sequence = true;
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'veh-1')).toThrow(ProtocolError);

    base.sequence = 1;
    base.position = { lat: 91, lon: 0, fixAtUtc: new Date().toISOString() };
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'veh-1')).toThrow(ProtocolError);
  });

  it('no existe tipo disarm: solo ALLOWED_TYPES', () => {
    expect(ALLOWED_TYPES).not.toContain('disarm');
    const body = encodeEvent('veh-1', 1, 'disarm');
    expect(() => decodeEvent(body, 'veh-1')).toThrow(ProtocolError);
  });

  it('rechaza timestamps sin zona horaria', () => {
    const base = JSON.parse(encodeEvent('veh-1', 1, 'heartbeat').toString());
    base.observedAtUtc = '2026-09-21T10:00:00';
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'veh-1')).toThrow(ProtocolError);
  });

  it('rechaza position con campos extra', () => {
    const base = JSON.parse(encodeEvent('veh-1', 1, 'gnss_fix').toString());
    base.position = { lat: 1, lon: 2, fixAtUtc: new Date().toISOString(), speed: 30 };
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'veh-1')).toThrow(ProtocolError);
  });
});

// ============ schemaVersion 2: unico contrato (commandId + power) ============

function encodeV2(
  deviceId: string,
  sequence: number,
  kind: string,
  extra: Record<string, unknown> = {},
): Buffer {
  const event = {
    schemaVersion: 2,
    deviceId,
    sequence,
    kind,
    observedAtUtc: new Date().toISOString(),
    power: POWER,
    ...extra,
  };
  return Buffer.from(JSON.stringify(event), 'utf8');
}

describe('protocol v2 (commandId + power)', () => {
  it('acepta v2: power siempre presente, commandId opcional', () => {
    const decoded = decodeEvent(encodeV2('veh-1', 1, 'heartbeat'), 'veh-1');
    expect(decoded.schemaVersion).toBe(2);
    expect(decoded.power).toEqual(POWER);
    expect(decoded.commandId).toBeNull();
  });

  it('acepta power con reserveMv y normaliza reserveMv ausente a null', () => {
    const withReserve = decodeEvent(
      encodeV2('veh-1', 2, 'heartbeat', {
        power: { vehicleMv: 13600, reserveMv: 4100, source: 'vehicle' },
      }),
      'veh-1',
    );
    expect(withReserve.power).toEqual({ vehicleMv: 13600, reserveMv: 4100, source: 'vehicle' });
    const withoutReserve = decodeEvent(
      encodeV2('veh-1', 3, 'heartbeat', { power: { vehicleMv: 13600, source: 'reserve' } }),
      'veh-1',
    );
    expect(withoutReserve.power).toEqual({ vehicleMv: 13600, reserveMv: null, source: 'reserve' });
  });

  it('rechaza cualquier version que no sea 2: no hay contrato viejo', () => {
    const v1 = JSON.parse(encodeV2('veh-1', 4, 'heartbeat').toString());
    v1.schemaVersion = 1;
    expect(() => decodeEvent(Buffer.from(JSON.stringify(v1)), 'veh-1')).toThrow(ProtocolError);
    const v3 = JSON.parse(encodeV2('veh-1', 5, 'heartbeat').toString());
    v3.schemaVersion = 3;
    expect(() => decodeEvent(Buffer.from(JSON.stringify(v3)), 'veh-1')).toThrow(ProtocolError);
  });

  it('power es obligatorio: sin el no hay evento', () => {
    const noPower = JSON.parse(encodeV2('veh-1', 6, 'heartbeat').toString());
    delete noPower.power;
    expect(() => decodeEvent(Buffer.from(JSON.stringify(noPower)), 'veh-1')).toThrow(ProtocolError);
  });

  it('batteryMv no es del protocolo: rechazo explicito (tampoco en null)', () => {
    const body = encodeV2('veh-1', 7, 'heartbeat', { batteryMv: 13600 });
    expect(() => decodeEvent(body, 'veh-1')).toThrow(ProtocolError);
    // El firmware viejo mandaba batteryMv: null siempre — eso tambien es
    // desalineacion, no pasa en silencio.
    const nullBody = encodeV2('veh-1', 15, 'heartbeat', { batteryMv: null });
    expect(() => decodeEvent(nullBody, 'veh-1')).toThrow(ProtocolError);
  });

  it('gnss_fix exige posicion: sin coordenadas no hay fix que confirmar', () => {
    const body = encodeV2('veh-1', 16, 'gnss_fix', { position: null });
    expect(() => decodeEvent(body, 'veh-1')).toThrow(ProtocolError);
  });

  it('rechaza power malformado: campos extra, rango, fuente', () => {
    expect(() =>
      decodeEvent(
        encodeV2('veh-1', 8, 'heartbeat', { power: { vehicleMv: 1, source: 'vehicle', extra: 2 } }),
        'veh-1',
      ),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeEvent(encodeV2('veh-1', 9, 'heartbeat', { power: { vehicleMv: 60001, source: 'vehicle' } }), 'veh-1'),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeEvent(encodeV2('veh-1', 10, 'heartbeat', { power: { vehicleMv: 13600.5, source: 'vehicle' } }), 'veh-1'),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeEvent(encodeV2('veh-1', 11, 'heartbeat', { power: { vehicleMv: 1, source: 'wall' } }), 'veh-1'),
    ).toThrow(ProtocolError);
  });

  it('commandId: valido en gnss_fix, rechazado en heartbeat o malformado', () => {
    const pos = { lat: 40.4168, lon: -3.7038, fixAtUtc: new Date().toISOString() };
    const decoded = decodeEvent(
      encodeV2('veh-1', 12, 'gnss_fix', { commandId: 'cmd123abc', position: pos }),
      'veh-1',
    );
    expect(decoded.commandId).toBe('cmd123abc');
    expect(() =>
      decodeEvent(encodeV2('veh-1', 13, 'heartbeat', { commandId: 'cmd123abc' }), 'veh-1'),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeEvent(encodeV2('veh-1', 14, 'gnss_fix', { commandId: 'no spaces!', position: pos }), 'veh-1'),
    ).toThrow(ProtocolError);
  });
});

// ============ HKDF por contexto (PR2) ============

describe('deriveKey (HKDF-SHA256 por contexto)', () => {
  const secret = 'ab'.repeat(32); // 256 bits en hex, como Device.secret

  it('determinista: mismos inputs producen la misma clave', () => {
    const a = deriveKey(secret, 'veh-1', 'event');
    const b = deriveKey(secret, 'veh-1', 'event');
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it('contextos distintos derivan claves distintas (event/command/ble)', () => {
    const contexts = ['event', 'command', 'ble'] as const;
    const keys = contexts.map((ctx) => deriveKey(secret, 'veh-1', ctx));
    expect(keys[0].equals(keys[1])).toBe(false);
    expect(keys[0].equals(keys[2])).toBe(false);
    expect(keys[1].equals(keys[2])).toBe(false);
  });

  it('deviceId distinto deriva clave distinta: la clave es por dispositivo', () => {
    expect(deriveKey(secret, 'veh-1', 'event').equals(deriveKey(secret, 'veh-2', 'event'))).toBe(
      false,
    );
  });

  it('la K derivada firma y verifica de extremo a extremo (como el ingest)', () => {
    const body = encodeV2('veh-1', 15, 'gnss_fix', { commandId: 'cmd123abc' });
    const key = deriveKey(secret, 'veh-1', 'event');
    const signature = sign(body, key);
    expect(verify(body, key, signature)).toBe(true);
    // Ni K_root ni otra K de contexto verifican: separacion real.
    expect(verify(body, Buffer.from(secret, 'hex'), signature)).toBe(false);
    expect(verify(body, deriveKey(secret, 'veh-1', 'command'), signature)).toBe(false);
  });
});
