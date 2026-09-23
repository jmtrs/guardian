# Guardian

Vigilante personal independiente para un vehículo antiguo de 12 V: movimiento, batería principal, ubicación y alertas. **Estado actual: app móvil + backend + banco de software funcionales; dispositivo físico todavía no integrado.** No existen aún firmware ESP32 real, LTE/GNSS físico validado, autorización BLE ni circuito de alimentación automotriz probado. **No instalar este prototipo en el vehículo.**

## App (monorepo `backend/` + `mobile/`)

Backend **NestJS + Prisma + PostgreSQL** con Better Auth (entrada por código OTP al email, sin contraseña ni teléfono) y app **Expo**. El endpoint de ingesta del dispositivo es `/v1/events` firmado con HMAC; el paquete Python `guardian/` es el simulador de dispositivo v2 y referencia de firmware.

La app móvil incluye login OTP, dashboard con recuadros reordenables (ubicación,
eventos, estado + iniciar/finalizar viaje), mapa con rastro del viaje (OpenFreeMap,
sin API key) y navegación a Google Maps/Waze, historial y ajustes de tema/idioma.
Detalle y arranque de la app: **[`mobile/README.md`](mobile/README.md)**.

```bash
make setup          # pnpm install + prisma generate
make db-start       # postgres docker
make db-migrate     # prisma migrate dev
make dev-backend    # Nest en :3000 (Swagger en /docs)
# dispositivo de banco: provision + claim (ver "Simulador de dispositivo")
cd backend && npx ts-node scripts/bench.ts provision "Sim"
```

> **La app móvil requiere un _dev build_** (`cd mobile && pnpm android` / `pnpm ios`),
> no Expo Go: usa módulos nativos (MapLibre, gesture-handler, reanimated). En dev el
> código OTP es fijo `000000`. Ver [`mobile/README.md`](mobile/README.md).

## Documentación vigente

- **[Mapa de conexión del sistema (las 5 capas)](docs/MAPA_CONEXION_SISTEMA.md)**. Punto de entrada único: hardware → firmware → contrato → backend → app, con el recorrido de un dato de punta a punta y dónde vive cada pieza. Empieza por aquí para conectar cualquier capa nueva.
- **[Contrato dispositivo ↔ backend v0.6](docs/CONTRATO_DISPOSITIVO_v0_6.md)**. Fuente de verdad del cable: claves HKDF, firma HMAC, esquema de evento (`schemaVersion: 2`), telemetría `power`, anti-replay, poll de comandos y `LOCATE_NOW`. Sin legacy: un único contrato, fail-closed.
- **[GUARDIAN v0.6: integración app, dispositivo, seguridad y energía](docs/GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md)**. Arquitectura objetivo desde el estado real de la app/backend actuales: autoridad del dispositivo, autorización BLE, localización remota, command queue, wake condicionado al consumo y banco de potencia.
- **[GUARDIAN v0.5: diseño personal, arquitectura y pantallas](docs/GUARDIAN_DISENO_PERSONAL_v0_5.md)**. Diseño funcional previo; v0.6 lo complementa y corrige donde la app ya ha avanzado.
- **[Alimentación y reserva para meses en el vehículo](docs/hardware/ALIMENTACION_Y_RESERVA.md)**. Decisión de mantener una única 18650 en la LILYGO **si** se verifica protección térmica real de carga, selección de celda, consumo y protección del vehículo. Es una especificación pendiente de ensayo, no una instalación validada.
- **[Esquema eléctrico LILYGO V1.4, fuente oficial y lectura de la página de carga](docs/hardware/ESQUEMA_T_A7670X_V1_4.md)**. Enlaza al PDF del fabricante y documenta el circuito `CN3065`, `TEMP` y el puente `N9`; la coincidencia con nuestra unidad **R2** debe comprobarse físicamente.
- [Componentes y banco de medida v0.6](docs/COMPONENTES.md).
- **[Despliegue del backend](docs/DESPLIEGUE.md)**. Dockerfile, variables de producción y despliegue en homelab por túnel Cloudflare.

## Hardware elegido para la siguiente integración de banco

- **LILYGO T-A7670E R2 `With GPS`**, europea, con ESP32-WROVER-E, 4G y GNSS. Comprobar físicamente la variante recibida.
- **LIS3DH** en breakout de 3,3 V con `INT1/INT2` accesibles, conectado por I²C + interrupción para wake por movimiento.
- Nano-SIM 4G, USB-C de datos y alimentación estable para banco.
- **ESP32-S3 N16R8 + INA219 R100** como banco externo de medida conectado al Mac. No forman parte de la instalación final.
- La **18650 Li-ion** se mantiene como candidata de reserva, pero no queda aprobada para carga permanente en el vehículo hasta validar protección térmica por hardware y consumo real.

## Simulador de dispositivo (referencia de firmware)

El paquete `guardian/` (Python puro, solo biblioteca estándar) implementa el
**contrato v2** — HKDF-SHA256 por canal, HMAC sobre los bytes exactos, envelope
con `power` obligatorio — y habla con el **backend Nest real**. Es la referencia
ejecutable que el firmware (MicroPython/ESP-IDF) debe reproducir byte a byte.
**No** es detección real: firma y envía como hará la placa.

Autotest de cripto offline (sin red) y tests de contrato:

```bash
python3 -m guardian.demo                    # HKDF + envelope + firma OK (offline)
python3 -m unittest discover -s tests -v    # incluye el vector RFC 5869
```

Contra el backend real (aprovisiona con el banco, ver
[contrato §7](docs/CONTRATO_DISPOSITIVO_v0_6.md)):

```bash
make db-start && make db-migrate && make dev-backend &
cd backend && npx ts-node scripts/bench.ts provision "Sim"   # imprime deviceId + secret + claimCode
npx ts-node scripts/bench.ts claim <tu-email> <claimCode>    # reclama (o desde la app)
export GUARDIAN_DEVICE_ID=...  GUARDIAN_DEVICE_SECRET_HEX=...  # lo que imprimió provision
python3 -m guardian.simulator heartbeat            # HTTP 202 aceptado
python3 -m guardian.simulator send suspected_movement
python3 -m guardian.simulator locate               # poll + responde LOCATE_NOW con fix
# 202 aceptado | 409 replay | 401 firma mala | 400 envelope invalido
```

La secuencia se persiste en un fichero local (análogo a la NVS de la placa) y
solo avanza tras un `202`. No exponer el backend local a Internet ni reutilizar
secretos de banco en hardware real.

## Próximos pasos

El orden de implementación y los gates están definidos en **[GUARDIAN v0.6](docs/GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md)**. En resumen:

1. verificar físicamente la T-A7670E, LTE, GNSS y pinout;
2. conectar LIS3DH y confirmar wake por interrupción;
3. implementar firmware mínimo con TLS, eventos firmados y persistencia;
4. medir deep sleep, LTE sleep, LTE TX y LTE + GNSS con ESP32-S3 + INA219;
5. implementar autorización BLE y hacer que Guardian físico confirme inicio/fin de viaje;
6. añadir `LOCATE_NOW` y cola de comandos segura;
7. probar remote wake solo si respeta el presupuesto energético;
8. cerrar UVLO, conversor, reserva y protección térmica antes de instalar en el vehículo.
