"""Tests del contrato v2 en Python (referencia de firmware). Deben cuadrar con
`backend/src/devices/protocol.ts` y `protocol.spec.ts`."""
import hmac
import hashlib
import json
import unittest

from guardian.protocol import (
    build_power,
    derive_key,
    encode_event,
    encode_poll,
    hkdf_sha256,
    sign,
)

ROOT = "11" * 32
DEVICE = "veh-1"


class TestHkdf(unittest.TestCase):
    def test_rfc5869_vector(self):
        # Vector A.1 de RFC 5869 (SHA-256, L=42): ancla la implementacion.
        ikm = bytes.fromhex("0b" * 22)
        salt = bytes.fromhex("000102030405060708090a0b0c")
        info = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9")
        okm = hkdf_sha256(ikm, salt, info, 42)
        expected = (
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
            "34007208d5b887185865"
        )
        self.assertEqual(okm.hex(), expected)

    def test_context_keys_deterministic_and_distinct(self):
        e1 = derive_key(ROOT, DEVICE, "event")
        e2 = derive_key(ROOT, DEVICE, "event")
        c = derive_key(ROOT, DEVICE, "command")
        b = derive_key(ROOT, DEVICE, "ble")
        self.assertEqual(e1, e2)  # determinista
        self.assertEqual(len({e1, c, b}), 3)  # una por canal, sin colision
        self.assertEqual(len(e1), 32)

    def test_key_is_per_device(self):
        self.assertNotEqual(derive_key(ROOT, "a", "event"), derive_key(ROOT, "b", "event"))


class TestSign(unittest.TestCase):
    def test_hmac_hex(self):
        key = derive_key(ROOT, DEVICE, "event")
        body = b'{"x":1}'
        self.assertEqual(sign(body, key), hmac.new(key, body, hashlib.sha256).hexdigest())
        self.assertEqual(len(sign(body, key)), 64)


class TestEncode(unittest.TestCase):
    def test_event_v2_shape(self):
        power = build_power(13600, source="vehicle", reserve_mv=4100)
        data = json.loads(encode_event(DEVICE, 7, "heartbeat", power))
        self.assertEqual(data["schemaVersion"], 2)
        self.assertEqual(data["deviceId"], DEVICE)
        self.assertEqual(data["sequence"], 7)
        self.assertEqual(
            data["power"], {"vehicleMv": 13600, "source": "vehicle", "reserveMv": 4100}
        )
        self.assertNotIn("batteryMv", data)
        self.assertNotIn("commandId", data)  # solo en gnss_fix

    def test_gnss_fix_carries_position_and_command(self):
        power = build_power(13600)
        pos = {"lat": 40.4, "lon": -3.7, "fixAtUtc": "2026-09-23T10:00:00Z"}
        data = json.loads(
            encode_event(DEVICE, 8, "gnss_fix", power, position=pos, command_id="cmd-1")
        )
        self.assertEqual(data["kind"], "gnss_fix")
        self.assertEqual(data["position"], pos)
        self.assertEqual(data["commandId"], "cmd-1")

    def test_unknown_kind_rejected(self):
        with self.assertRaises(ValueError):
            encode_event(DEVICE, 1, "disarm", build_power(13600))

    def test_poll_body(self):
        data = json.loads(encode_poll(DEVICE))
        self.assertEqual(set(data), {"deviceId", "polledAtUtc"})
        self.assertEqual(data["deviceId"], DEVICE)


if __name__ == "__main__":
    unittest.main()
