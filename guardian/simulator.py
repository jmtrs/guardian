"""Bench-only fake accelerometer event sender, NOT live vehicle detection."""
import argparse
import os
import sqlite3
import urllib.request

from .protocol import encode_event, sign


def next_sequence(path: str) -> int:
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL)")
        db.execute("INSERT OR IGNORE INTO counter VALUES (1, 0)")
        db.execute("UPDATE counter SET value=value+1 WHERE id=1")
        return db.execute("SELECT value FROM counter WHERE id=1").fetchone()[0]


def send(url: str, device_id: str, key: bytes, kind: str, sequence: int, battery_mv=None):
    body = encode_event(device_id, sequence, kind, battery_mv=battery_mv)
    request = urllib.request.Request(
        url, body, method="POST", headers={
            "Content-Type": "application/json",
            "X-Device-Id": device_id,
            "X-Guardian-Signature": sign(body, key),
        })
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status, response.read().decode()


def main():
    parser = argparse.ArgumentParser(description="Guardian bench movement simulator")
    parser.add_argument("--kind", choices=["suspected_movement", "battery_low", "power_lost", "heartbeat"], default="suspected_movement")
    parser.add_argument("--battery-mv", type=int, default=None)
    args = parser.parse_args()
    key_hex = os.getenv("GUARDIAN_DEVICE_KEY_HEX", "")
    if len(key_hex) != 64:
        raise SystemExit("Set GUARDIAN_DEVICE_KEY_HEX as described in README")
    try:
        key = bytes.fromhex(key_hex)
    except ValueError:
        raise SystemExit("Invalid key hex")
    url = os.getenv("GUARDIAN_INGEST_URL", "http://127.0.0.1:8765/v1/events")
    if not url.startswith("http://127.0.0.1:"):
        raise SystemExit("Only the local bench endpoint is supported by this simulator")
    seq = next_sequence(os.getenv("GUARDIAN_COUNTER_DB", "guardian-counter.sqlite3"))
    status, result = send(url, os.getenv("GUARDIAN_DEVICE_ID", "guardian-lab-01"), key, args.kind, seq, args.battery_mv)
    print(f"HTTP {status} seq={seq} response={result}")


if __name__ == "__main__":
    main()
