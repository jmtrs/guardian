# Herramientas de banco (Python + pyserial)

```bash
python3 -m venv .venv && .venv/bin/pip install pyserial
```

| Script | Para qué |
|---|---|
| `console.py [--reset] PORT "secs=cmd" ...` | Consola de la LILYGO por su USB (`/dev/cu.usbserial-*`). Abre el puerto **sin tocar DTR/RTS**: bajarlos pasa por RTS=1/DTR=0, que tira de EN, reinicia el ESP32 y deja sin alimentación el rail del módem. `--reset` reinicia a propósito |
| `bench.py PORT LOG "secs=line" ...` | Banco de consumo ESP32-S3 (`/dev/cu.usbmodem*`). Abre **con DTR/RTS liberados**: el USB nativo del S3 entra en modo descarga si los ve activos al abrir. Las líneas van a la LILYGO por el puente; `~reset` reinicia el contador de carga |
| `benchd.py PORT LOG CMDFILE SECS` | Igual que `bench.py`, en segundo plano durante SECS: lo que se añade a CMDFILE se envía. Sirve para medidas largas con órdenes en el momento justo |

Lecciones:
- Para grabar la LILYGO por USB con el banco montado, **desconectar el cable 11**
  (S3 GPIO17 → RX de la LILYGO): compite con el puente USB-serie por la misma línea.
- Los logs pueden contener IMEI, ICCID o coordenadas: no se suben a git.
