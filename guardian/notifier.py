"""Optional Telegram notification for laboratory events only."""
import json
import os
import urllib.request


def telegram_notifier_from_env():
    token = os.getenv("GUARDIAN_TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("GUARDIAN_TELEGRAM_CHAT_ID", "")
    if not token and not chat_id:
        return None
    if not token or not chat_id or any(c not in "-0123456789" for c in chat_id):
        raise ValueError("Set bot token and numeric chat ID together")

    def notify(event):
        text = ("GUARDIAN · BANCO / EVENTO SIMULADO\n"
                f"Tipo: {event['kind']}\nSecuencia: {event['sequence']}\n"
                "No significa que haya movimiento real del vehículo.")
        body = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage", body,
            {"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.load(response)
            if not result.get("ok"):
                raise RuntimeError("Telegram rejected message")
    return notify
