import json
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from threading import Thread

from guardian.protocol import encode_event, sign
from guardian.server import make_server
from guardian.simulator import send


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.key = b"k" * 32
        self.server = make_server("127.0.0.1", 0, "test-device", self.key, str(Path(self.tmp.name) / "events.db"))
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/v1/events"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def test_valid_event_accepted_and_replay_rejected(self):
        status, _ = send(self.url, "test-device", self.key, "suspected_movement", 1)
        self.assertEqual(status, 202)
        with self.assertRaises(urllib.error.HTTPError) as err:
            send(self.url, "test-device", self.key, "suspected_movement", 1)
        self.assertEqual(err.exception.code, 409)

    def test_bad_signature_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as err:
            send(self.url, "test-device", b"wrong" * 7, "suspected_movement", 1)
        self.assertEqual(err.exception.code, 401)

    def test_invalid_payload_rejected_even_if_signed(self):
        body = encode_event("test-device", 1, "heartbeat")
        data = json.loads(body)
        data["kind"] = "disarm"
        tampered = json.dumps(data).encode()
        request = urllib.request.Request(self.url, tampered, headers={"X-Device-Id": "test-device", "X-Guardian-Signature": sign(tampered, self.key)}, method="POST")
        with self.assertRaises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(request)
        self.assertEqual(err.exception.code, 400)

    def test_health_does_not_expose_events(self):
        with urllib.request.urlopen(self.url.replace("/v1/events", "/health")) as result:
            self.assertEqual(result.status, 200)
        with self.assertRaises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(self.url.replace("/v1/events", "/events"))
        self.assertEqual(err.exception.code, 404)
