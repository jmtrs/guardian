import json
import unittest
from datetime import datetime, timezone

from guardian.protocol import decode_event, encode_event, sign, verify


class ProtocolTests(unittest.TestCase):
    def test_signature_and_tamper(self):
        body = encode_event("car-1", 1, "suspected_movement")
        key = b"x" * 32
        self.assertTrue(verify(body, key, sign(body, key)))
        self.assertFalse(verify(body.replace(b"suspected", b"authorized"), key, sign(body, key)))
        self.assertFalse(verify(body, b"y" * 32, sign(body, key)))

    def test_no_fabricated_gps(self):
        body = encode_event("car-1", 2, "suspected_movement")
        self.assertIsNone(decode_event(body, "car-1")["position"])

    def test_invalid_event_rejected(self):
        data = json.loads(encode_event("car-1", 1, "suspected_movement"))
        data["sequence"] = True
        with self.assertRaises(ValueError):
            decode_event(json.dumps(data).encode(), "car-1")
        data["sequence"] = 1
        data["position"] = {"lat": 91, "lon": 0, "fixAtUtc": datetime.now(timezone.utc).isoformat()}
        with self.assertRaises(ValueError):
            decode_event(json.dumps(data).encode(), "car-1")

    def test_no_disarm_event_type(self):
        with self.assertRaises(ValueError):
            encode_event("car-1", 1, "disarm")
