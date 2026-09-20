"""One-command local end-to-end simulation without hardware or credentials."""
import secrets
import tempfile
from pathlib import Path
from threading import Thread

from .server import make_server
from .simulator import send


def main():
    with tempfile.TemporaryDirectory() as directory:
        key = secrets.token_bytes(32)
        server = make_server("127.0.0.1", 0, "guardian-demo", key, str(Path(directory) / "events.db"))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_address[1]}/v1/events"
            status, result = send(url, "guardian-demo", key, "suspected_movement", 1)
            print(f"BENCH DEMO: HTTP {status} {result}")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    main()
