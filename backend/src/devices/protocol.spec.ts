import { decodeEvent, sign, verify, ProtocolError, ALLOWED_TYPES } from './protocol';

// Espejo de tests/test_protocol.py

function encodeEvent(deviceId: string, sequence: number, kind: string): Buffer {
  const event = {
    schemaVersion: 1,
    deviceId,
    sequence,
    kind,
    observedAtUtc: new Date().toISOString(),
    batteryMv: null,
    position: null,
  };
  return Buffer.from(JSON.stringify(event), 'utf8');
}

describe('protocol (port de guardian/protocol.py)', () => {
  const key = Buffer.alloc(32, 'x');

  it('verifica firma y rechaza tamper / clave equivocada', () => {
    const body = encodeEvent('car-1', 1, 'suspected_movement');
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
    const body = encodeEvent('car-1', 2, 'suspected_movement');
    expect(decodeEvent(body, 'car-1').position).toBeNull();
  });

  it('rechaza sequence=true (boolean) como Python', () => {
    const base = JSON.parse(encodeEvent('car-1', 1, 'suspected_movement').toString());
    base.sequence = true;
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'car-1')).toThrow(ProtocolError);

    base.sequence = 1;
    base.position = { lat: 91, lon: 0, fixAtUtc: new Date().toISOString() };
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'car-1')).toThrow(ProtocolError);
  });

  it('no existe tipo disarm: solo ALLOWED_TYPES', () => {
    expect(ALLOWED_TYPES).not.toContain('disarm');
    const body = encodeEvent('car-1', 1, 'disarm');
    expect(() => decodeEvent(body, 'car-1')).toThrow(ProtocolError);
  });

  it('rechaza timestamps sin zona horaria', () => {
    const base = JSON.parse(encodeEvent('car-1', 1, 'heartbeat').toString());
    base.observedAtUtc = '2026-09-21T10:00:00';
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'car-1')).toThrow(ProtocolError);
  });

  it('rechaza position con campos extra', () => {
    const base = JSON.parse(encodeEvent('car-1', 1, 'gnss_fix').toString());
    base.position = { lat: 1, lon: 2, fixAtUtc: new Date().toISOString(), speed: 30 };
    expect(() => decodeEvent(Buffer.from(JSON.stringify(base)), 'car-1')).toThrow(ProtocolError);
  });
});
