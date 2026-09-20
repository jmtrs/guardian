"""Loopback-only ingest for the laboratory. NOT a public LTE endpoint."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from .protocol import MAX_BODY, decode_event, verify
from .notifier import telegram_notifier_from_env


class Store:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = Lock()
        self.db.execute("CREATE TABLE IF NOT EXISTS device_seq (device_id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS events (device_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, observed_at TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device_id, seq))")
        self.db.commit()

    def save(self, event: dict) -> bool:
        with self.lock:
            device_id, seq = event["deviceId"], event["sequence"]
            existing = self.db.execute("SELECT last_seq FROM device_seq WHERE device_id=?", (device_id,)).fetchone()
            if existing and seq <= existing[0]:
                return False
            with self.db:
                self.db.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)",
                                (device_id, seq, event["kind"], event["observedAtUtc"],
                                 datetime.now(timezone.utc).isoformat(), json.dumps(event, separators=(",", ":"))))
                self.db.execute("INSERT INTO device_seq(device_id, last_seq) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_seq=excluded.last_seq", (device_id, seq))
            return True

    def close(self):
        self.db.close()


def handler_factory(device_id: str, secret: bytes, store: Store, notify=None):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status: int, message: str):
            data = json.dumps({"status": message}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if self.path != "/v1/events":
                return self.reply(404, "not_found")
            if self.headers.get("X-Device-Id") != device_id:
                return self.reply(401, "unauthorized")
            try:
                size = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                return self.reply(400, "invalid_length")
            if size < 1 or size > MAX_BODY:
                return self.reply(413, "invalid_size")
            body = self.rfile.read(size)
            signature = self.headers.get("X-Guardian-Signature", "")
            if not verify(body, secret, signature):
                return self.reply(401, "unauthorized")
            try:
                event = decode_event(body, device_id)
            except ValueError:
                return self.reply(400, "invalid_event")
            if not store.save(event):
                return self.reply(409, "replay_or_out_of_order")
            print(f"GUARDIAN EVENT: {event['kind']} seq={event['sequence']} device={device_id}", flush=True)
            if notify is not None:
                try:
                    notify(event)
                except Exception as exc:
                    print(f"Notifier unavailable: {type(exc).__name__}", flush=True)
            return self.reply(202, "accepted")

        def do_GET(self):
            if self.path == "/health":
                return self.reply(200, "ok")
            return self.reply(404, "not_found")

        def log_message(self, format, *args):
            return
    return Handler


def make_server(host: str, port: int, device_id: str, secret: bytes, db_path: str, notify=None):
    return ThreadingHTTPServer((host, port), handler_factory(device_id, secret, Store(db_path), notify))


def main():
    device_id = os.getenv("GUARDIAN_DEVICE_ID", "guardian-lab-01")
    key_hex = os.getenv("GUARDIAN_DEVICE_KEY_HEX", "")
    if len(key_hex) != 64:
        raise SystemExit("Set GUARDIAN_DEVICE_KEY_HEX to 32 random bytes in hex; see README")
    try:
        secret = bytes.fromhex(key_hex)
    except ValueError:
        raise SystemExit("Invalid key hex")
    host = os.getenv("GUARDIAN_HOST", "127.0.0.1")
    if host != "127.0.0.1":
        raise SystemExit("Bench server binds only 127.0.0.1. Add authenticated TLS ingress before remote use.")
    port = int(os.getenv("GUARDIAN_PORT", "8765"))
    db_path = os.getenv("GUARDIAN_DB", "guardian-lab.sqlite3")
    try:
        notify = telegram_notifier_from_env()
    except ValueError as exc:
        raise SystemExit(str(exc))
    httpd = make_server(host, port, device_id, secret, db_path, notify)
    print(f"Guardian local-only ingest listening on http://{host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
