"""Signed bench event envelope, not a phone-to-car authorization protocol."""
import hashlib
import hmac
import json
from datetime import datetime, timezone

ALLOWED_TYPES = frozenset({"suspected_movement", "battery_low", "power_lost", "heartbeat", "gnss_fix"})
MAX_BODY = 4096


def encode_event(device_id: str, sequence: int, kind: str, *, battery_mv=None, position=None) -> bytes:
    if not device_id or type(sequence) is not int or sequence < 1 or kind not in ALLOWED_TYPES:
        raise ValueError("Invalid event envelope")
    event = {
        "schemaVersion": 1,
        "deviceId": device_id,
        "sequence": sequence,
        "kind": kind,
        "observedAtUtc": datetime.now(timezone.utc).isoformat(),
        "batteryMv": battery_mv,
        "position": position,
    }
    return json.dumps(event, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign(body: bytes, key: bytes) -> str:
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def verify(body: bytes, key: bytes, signature: str) -> bool:
    return isinstance(signature, str) and len(signature) == 64 and hmac.compare_digest(sign(body, key), signature)


def decode_event(body: bytes, expected_device_id: str) -> dict:
    if len(body) > MAX_BODY:
        raise ValueError("Event too large")
    try:
        data = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON") from exc
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise ValueError("Unsupported event version")
    if data.get("deviceId") != expected_device_id:
        raise ValueError("Device mismatch")
    if type(data.get("sequence")) is not int or not 1 <= data["sequence"] < 2**63:
        raise ValueError("Invalid sequence")
    if data.get("kind") not in ALLOWED_TYPES:
        raise ValueError("Unknown event type")
    stamp = data.get("observedAtUtc")
    if not isinstance(stamp, str) or len(stamp) > 64:
        raise ValueError("Bad timestamp")
    try:
        when = datetime.fromisoformat(stamp)
    except ValueError as exc:
        raise ValueError("Bad timestamp") from exc
    if when.tzinfo is None:
        raise ValueError("Timezone required")
    battery = data.get("batteryMv")
    if battery is not None and (type(battery) is not int or not 0 <= battery <= 60000):
        raise ValueError("Invalid battery reading")
    position = data.get("position")
    if position is not None:
        if not isinstance(position, dict) or set(position) != {"lat", "lon", "fixAtUtc"}:
            raise ValueError("Invalid position")
        lat, lon = position["lat"], position["lon"]
        if (type(lat) not in (int, float) or type(lon) not in (int, float)
                or not -90 <= lat <= 90 or not -180 <= lon <= 180):
            raise ValueError("Invalid coordinates")
        try:
            fix_time = datetime.fromisoformat(position["fixAtUtc"])
        except (ValueError, TypeError, KeyError) as exc:
            raise ValueError("Invalid fix timestamp") from exc
        if fix_time.tzinfo is None:
            raise ValueError("Fix timezone required")
    return data
