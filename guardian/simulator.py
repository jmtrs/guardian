"""Simulador de dispositivo v2 contra el backend REAL (referencia de firmware).

NO es deteccion real: firma y envia eventos v2 como hara la placa. Lee su
identidad como la placa desde NVS: deviceId + K_root (secret hex) por env. La
secuencia se persiste en un fichero (analogo a NVS) y SOLO avanza tras un 202.

Provisiona antes con el banco:
    cd backend && npx ts-node scripts/bench.ts provision "Sim"
    # exporta lo que imprime:
    export GUARDIAN_DEVICE_ID=...  GUARDIAN_DEVICE_SECRET_HEX=...
    # reclama el dispositivo (o desde la app):
    npx ts-node scripts/bench.ts claim <email> <claimCode>

Uso:
    python -m guardian.simulator heartbeat
    python -m guardian.simulator send suspected_movement [--source reserve]
    python -m guardian.simulator poll
    python -m guardian.simulator locate   # poll + responde LOCATE_NOW con fix
"""
import argparse
import json
import os
import urllib.error
import urllib.request

from .protocol import build_power, derive_key, encode_event, encode_poll, sign

BASE = os.getenv("GUARDIAN_BASE", "http://localhost:3000")
# Coordenada por defecto (Madrid centro) para los gnss_fix del simulador.
DEFAULT_LAT, DEFAULT_LON = 40.4168, -3.7038


def _config():
    device_id = os.getenv("GUARDIAN_DEVICE_ID", "")
    secret_hex = os.getenv("GUARDIAN_DEVICE_SECRET_HEX", "")
    if not device_id or len(secret_hex) != 64:
        raise SystemExit(
            "Set GUARDIAN_DEVICE_ID and GUARDIAN_DEVICE_SECRET_HEX (see module docstring)"
        )
    return device_id, secret_hex


def _seq_path(device_id: str) -> str:
    # Contador persistente por dispositivo (analogo a NVS de la placa).
    return os.getenv("GUARDIAN_SEQ_FILE", f".guardian_seq_{device_id}.json")


def _read_seq(device_id: str) -> int:
    try:
        with open(_seq_path(device_id), "r", encoding="utf-8") as f:
            return int(json.load(f).get("lastSeq", 0))
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        return 0


def _write_seq(device_id: str, seq: int) -> None:
    # La placa solo persiste tras un 202: mismo contrato aqui.
    with open(_seq_path(device_id), "w", encoding="utf-8") as f:
        json.dump({"lastSeq": seq}, f)


def _post(path: str, device_id: str, body: bytes, signature: str):
    request = urllib.request.Request(
        f"{BASE}{path}",
        body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            # Cloudflare (Browser Integrity Check) bloquea el UA por defecto de
            # urllib con 403/1010. El firmware real debe mandar su propio UA:
            # valor reservado para el canal de dispositivo.
            "User-Agent": "Guardian-Device/2",
            "X-Device-Id": device_id,
            "X-Guardian-Signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def _send_event(device_id, secret_hex, kind, source="vehicle", command_id=None, with_position=False):
    from .protocol import _now_iso

    seq = _read_seq(device_id) + 1
    vehicle_mv = 9000 if source == "reserve" else 13600
    power = build_power(vehicle_mv, source=source, reserve_mv=4100)
    position = None
    if with_position or kind == "gnss_fix":
        position = {"lat": DEFAULT_LAT, "lon": DEFAULT_LON, "fixAtUtc": _now_iso()}
    body = encode_event(device_id, seq, kind, power, position=position, command_id=command_id)
    key = derive_key(secret_hex, device_id, "event")  # canal eventos: K_event
    status, text = _post("/v1/events", device_id, body, sign(body, key))
    if status == 202:
        _write_seq(device_id, seq)  # solo avanza tras 202 (como la placa)
    print(f"{kind} seq={seq} -> HTTP {status} {text}")
    return status


def _poll(device_id, secret_hex):
    body = encode_poll(device_id)
    key = derive_key(secret_hex, device_id, "command")  # poll: K_command (nunca K_event)
    status, text = _post("/v1/commands/poll", device_id, body, sign(body, key))
    print(f"poll -> HTTP {status} {text}")
    return json.loads(text) if status == 200 else []


def main():
    parser = argparse.ArgumentParser(description="Guardian v2 device simulator")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_send = sub.add_parser("send")
    p_send.add_argument(
        "kind",
        choices=sorted(
            {"suspected_movement", "battery_low", "power_lost", "heartbeat", "gnss_fix"}
        ),
    )
    p_send.add_argument("--source", choices=["vehicle", "reserve", "unknown"], default="vehicle")
    sub.add_parser("heartbeat")
    sub.add_parser("poll")
    sub.add_parser("locate")
    args = parser.parse_args()

    device_id, secret_hex = _config()

    if args.cmd == "heartbeat":
        _send_event(device_id, secret_hex, "heartbeat")
    elif args.cmd == "send":
        _send_event(device_id, secret_hex, args.kind, source=args.source)
    elif args.cmd == "poll":
        _poll(device_id, secret_hex)
    elif args.cmd == "locate":
        commands = _poll(device_id, secret_hex)
        pending = next((c for c in commands if c.get("type") == "LOCATE_NOW"), None)
        if not pending:
            print("No hay LOCATE_NOW pendiente. Pide uno desde la app.")
            return
        # Responde con un gnss_fix correlacionado (K_event, commandId+position).
        _send_event(
            device_id, secret_hex, "gnss_fix", command_id=pending["id"], with_position=True
        )


if __name__ == "__main__":
    main()
