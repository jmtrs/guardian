"""Autotest de cripto offline (sin red): comprueba que la referencia v2 es
coherente antes de hablar con el backend. No es un end-to-end — para eso usa
`python -m guardian.simulator` contra el backend real.

Sirve de humo en CI: si HKDF/HMAC/envelope se rompen, esto falla sin depender
de una base de datos ni de un servidor.
"""
import json

from .protocol import derive_key, encode_event, build_power, sign

ROOT = "11" * 32  # K_root de ejemplo (64 hex)
DEVICE = "demo-device"


def main():
    # 1) Claves por contexto: deterministas y DISTINTAS entre canales.
    k_event = derive_key(ROOT, DEVICE, "event")
    k_command = derive_key(ROOT, DEVICE, "command")
    k_ble = derive_key(ROOT, DEVICE, "ble")
    assert k_event == derive_key(ROOT, DEVICE, "event"), "HKDF no determinista"
    assert len({k_event, k_command, k_ble}) == 3, "las claves de contexto colisionan"
    assert len(k_event) == 32, "K_event debe ser de 32 bytes"

    # 2) Envelope v2: power obligatorio, se firma el buffer exacto.
    power = build_power(13600, source="vehicle", reserve_mv=4100)
    body = encode_event(DEVICE, 1, "heartbeat", power)
    parsed = json.loads(body)
    assert parsed["schemaVersion"] == 2, "schemaVersion debe ser 2"
    assert parsed["power"]["vehicleMv"] == 13600, "power.vehicleMv perdido"
    assert "batteryMv" not in parsed, "batteryMv no existe en v2"

    # 3) Firma hex de 64 chars sobre esos bytes exactos.
    signature = sign(body, k_event)
    assert len(signature) == 64 and all(c in "0123456789abcdef" for c in signature)

    print("BENCH DEMO v2: HKDF + envelope + firma OK (offline).")


if __name__ == "__main__":
    main()
