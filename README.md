# Guardian

Vigilante personal independiente para un coche antiguo de 12 V: movimiento, batería principal, ubicación y alertas. **Situación actual: únicamente banco de software.** No existe todavía firmware ESP32, sensor conectado, app de autorización ni un circuito automotriz instalado. **No conectar este prototipo al coche.**

## Documentación vigente

**[GUARDIAN v0.5 · Diseño personal completo, componentes, batería, instalación, diagramas y pantallas](docs/GUARDIAN_DISENO_PERSONAL_v0_5.md)**. Es la referencia vigente; sustituye al documento v0.4 compartido por chat. La antigua ruta `docs/GUIA_PERSONAL.md` conduce ahora a esta versión, para evitar instrucciones incompatibles. [Lista de compra por etapas actualizada](docs/COMPONENTES.md).

## Hardware elegido para la primera integración USB

- **LILYGO T-A7670E R2 `With GPS`**, variante europea con ESP32-WROVER-E, LTE Cat-1, GNSS y antenas del kit. Verificar que la opción pedida incluya GPS.
- **Adafruit LIS3DH ref. 2809**, vendido por BricoGeek como SEN-0185. Sustituye al DFRobot LIS2DW12 inicialmente previsto; el firmware se desarrollará para LIS3DH y su pin de interrupción.
- Cinco cables Dupont hembra-hembra, nano-SIM 4G, USB-C de datos y alimentación USB estable. Soldar cabeceras de los módulos cuando corresponda.
- Batería **18650 Li-ion nominal 3,6/3,7 V** solo opcional para ensayo de reserva en interior, comprobando dimensiones y compatibilidad de la revisión de placa. No está aprobada la carga permanente en el coche sin gestión térmica y circuito automotriz cerrado.

## Ejecutar simulación local

Requiere Python 3.11 o 3.13 y únicamente biblioteca estándar.

```bash
python3 -m guardian.demo
python3 -m unittest discover -s tests -v
```

La demostración abre HTTP **solo en 127.0.0.1**, crea una clave aleatoria temporal, transmite un evento de movimiento **simulado** firmado con HMAC-SHA256, lo guarda en SQLite y cierra el servidor. `HTTP 202` significa que el backend aceptó el evento, **no** que hayan intervenido sensor, módem, GPS o una notificación real al teléfono. Tests: firmas, eventos malformados, rechazo de repetición y peticiones no autorizadas.

Para ejecutar servidor y simulador por separado, usa una clave de laboratorio **fuera del repositorio**:

```bash
export GUARDIAN_DEVICE_KEY_HEX="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export GUARDIAN_DEVICE_ID=guardian-lab-01
python3 -m guardian.server &
SERVER_PID=$!
python3 -m guardian.simulator --kind suspected_movement
kill "$SERVER_PID"
```

Servidor y simulador deben compartir exactamente la misma clave. No expongas HTTP local a Internet ni reutilices una clave de demo en hardware real. Telegram opcional necesita credenciales propias; no consta envío verificado a una cuenta real.

## Próximos pasos

1. Probar LILYGO GPS por USB, LTE/GNSS y bandas/APN según revisión física recibida, sin publicar IMEI o credenciales.
2. Conectar **LIS3DH** por alimentación 3,3 V, I²C y una interrupción INT a GPIO verificado; leer movimiento real.
3. Firmware para ESP32 que persista eventos, valide TLS, autentique el dispositivo y utilice el módem. El Python actual **no se flashea al ESP32**.
4. Implementar autorización BLE intencional, confirmada por Guardian; proximidad nunca desarma por sí sola.
5. Cerrar alimentación protegida desde +12 V permanente, supervisor hardware independiente y reserva apta para la temperatura prevista; comprobarlo en banco antes de montar nada en el coche. **Sin OBD ni toma de mechero.**
