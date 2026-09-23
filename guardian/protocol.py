"""Contrato v2 dispositivo -> backend, en Python puro (stdlib).

Referencia ejecutable del firmware: mismos bytes de clave y firma que el
backend (`backend/src/devices/protocol.ts`). schemaVersion 2 es el UNICO
contrato — sin legacy: `power` {vehicleMv, reserveMv?, source} obligatorio en
todo evento, claves por contexto via HKDF-SHA256, HMAC sobre los bytes exactos
del cuerpo. MicroPython/ESP-IDF deben reproducir esto byte a byte.
"""
import hashlib
import hmac
import json
from datetime import datetime, timezone

ALLOWED_TYPES = frozenset(
    {"suspected_movement", "battery_low", "power_lost", "heartbeat", "gnss_fix"}
)

# info por canal — identico a KEY_INFO del backend. Una clave por contexto,
# jamas reutilizada entre canales.
KEY_INFO = {
    "event": b"guardian/event/v1",
    "command": b"guardian/command/v1",
    "ble": b"guardian/ble/v1",
}


def _hmac_sha256(key: bytes, msg: bytes) -> bytes:
    return hmac.new(key, msg, hashlib.sha256).digest()


def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int = 32) -> bytes:
    """HKDF-SHA256 (RFC 5869). Extract-then-expand; identico a Node hkdfSync."""
    prk = _hmac_sha256(salt, ikm)  # extract
    okm = b""
    block = b""
    counter = 1
    while len(okm) < length:
        block = _hmac_sha256(prk, block + info + bytes([counter]))
        okm += block
        counter += 1
    return okm[:length]


def derive_key(root_secret_hex: str, device_id: str, context: str) -> bytes:
    """K_context = HKDF-SHA256(K_root, salt=deviceId, info='guardian/<ctx>/v1')."""
    if context not in KEY_INFO:
        raise ValueError(f"unknown key context: {context}")
    return hkdf_sha256(
        bytes.fromhex(root_secret_hex),
        device_id.encode("utf-8"),
        KEY_INFO[context],
        32,
    )


def sign(body: bytes, key: bytes) -> str:
    """HMAC-SHA256 hex sobre los bytes EXACTOS del cuerpo (64 chars)."""
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def _now_iso() -> str:
    # ISO 8601 con zona obligatoria (Z). Nunca hora local ambigua.
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_power(vehicle_mv: int, source: str = "vehicle", reserve_mv=None) -> dict:
    power = {"vehicleMv": vehicle_mv, "source": source}
    if reserve_mv is not None:
        power["reserveMv"] = reserve_mv
    return power


def encode_event(
    device_id: str,
    sequence: int,
    kind: str,
    power: dict,
    position=None,
    command_id: str = None,
    observed_at: str = None,
) -> bytes:
    """Envelope v2 -> bytes. Se firma y se envia ESTE buffer, sin re-serializar."""
    if kind not in ALLOWED_TYPES:
        raise ValueError(f"unknown kind: {kind}")
    envelope = {
        "schemaVersion": 2,
        "deviceId": device_id,
        "sequence": sequence,
        "kind": kind,
        "observedAtUtc": observed_at or _now_iso(),
        "power": power,
    }
    if command_id is not None:
        envelope["commandId"] = command_id
    if position is not None:
        envelope["position"] = position
    return json.dumps(envelope, separators=(",", ":")).encode("utf-8")


def encode_poll(device_id: str, polled_at: str = None) -> bytes:
    """Cuerpo del poll de comandos (firmado con K_command)."""
    body = {"deviceId": device_id, "polledAtUtc": polled_at or _now_iso()}
    return json.dumps(body, separators=(",", ":")).encode("utf-8")
