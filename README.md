# Guardian

Vigilante personal para un coche antiguo de 12 V: movimiento, batería principal, ubicación y alertas. **Situación actual: únicamente banco de software.** No existe todavía firmware ESP32, sensor conectado, app de autorización ni un circuito automotriz instalado. **No conectar este prototipo al coche.**

## Hardware elegido

- **LILYGO T-A7670E R2 `With GPS`** (variante europea), con ESP32-WROVER-E, LTE Cat-1, GNSS y antenas del kit; no comprar `Without GPS`.
- **DFRobot Fermion LIS2DW12 SEN0405** con pines INT1/INT2 para interrupción por movimiento. La versión Gravity SEN0409 no expone del mismo modo los pines de interrupción.
- SIM nano de datos de particular; placa conectada por USB **solo en pruebas de escritorio**.

[**Componentes concretos, precios orientativos, compra por etapas y enlaces**](docs/COMPONENTES.md) · [**Guía personal con diagramas eléctricos, estados, pantallas y montaje**](docs/GUIA_PERSONAL.md)

## Ejecutar simulación local

Requiere Python 3.11 o 3.13; el software de banco usa únicamente la biblioteca estándar.

```bash
python3 -m guardian.demo
python3 -m unittest discover -s tests -v
```

La demo abre HTTP **solo en 127.0.0.1**, crea una clave aleatoria temporal, transmite un evento de movimiento **simulado** firmado con HMAC-SHA256, lo guarda en SQLite y cierra el servidor. `HTTP 202` significa que el backend lo aceptó: **no** significa que haya habido sensor, modem, GPS o notificación real al teléfono. Los tests cubren firmas, contenido inválido, rechazo de repetición y una petición no autorizada.

Para ejecutar servidor y simulador por separado, usa una clave individual de laboratorio **fuera del repositorio**: 

```bash
export GUARDIAN_DEVICE_KEY_HEX="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export GUARDIAN_DEVICE_ID=guardian-lab-01
python3 -m guardian.server &
SERVER_PID=$!
python3 -m guardian.simulator --kind suspected_movement
kill "$SERVER_PID"
```

Servidor y simulador deben heredar exactamente la misma clave. No expongas el puerto ni reutilices el esquema HTTP local en la red móvil. La entrega opcional en Telegram requiere credenciales propias; **no se ha verificado en una cuenta real**.

## Próxima integración

1. Encender la LILYGO por USB y ejecutar ejemplos **oficiales de esa revisión** de LTE y GNSS; no inventar pinout ni credenciales.
2. Conectar SEN0405 a 3,3 V, I²C y un pin de interrupción adecuado tras comprobar esquema de placa; leer un movimiento real.
3. Crear firmware con evento persistente, TLS verificado, identidad de dispositivo y envío mediante módem. **El simulador Python no se puede flashear al ESP32.**
4. Implementar autorización BLE *intencional* y confirmada por Guardian; proximidad por sí sola nunca desarma.
5. Diseñar y revisar alimentación +12 V protegida con fusible, supervisor físico de baja tensión y reserva térmicamente apta; medir reposo y corte **antes** de instalar en el coche.

Principio: sistema independiente del coche, simple, reparable, sin OBD ni toma de mechero y sin acceso a motor, frenos, cierre o inmovilizador.
