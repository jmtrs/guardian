# Guardian

Vigilante personal independiente para un vehículo antiguo de 12 V: movimiento, batería principal, ubicación y alertas. **Estado actual: app móvil + backend + banco de software funcionales; dispositivo físico todavía no integrado.** No existen aún firmware ESP32 real, LTE/GNSS físico validado, autorización BLE ni circuito de alimentación automotriz probado. **No instalar este prototipo en el vehículo.**

## App (monorepo `backend/` + `mobile/`)

Backend **NestJS + Prisma + PostgreSQL** con Better Auth (entrada por código OTP al email, sin contraseña ni teléfono) y app **Expo**. El endpoint de ingesta del dispositivo es `/v1/events` firmado con HMAC; el servidor Python queda como referencia de banco.

La app móvil incluye login OTP, dashboard con recuadros reordenables (ubicación,
eventos, estado + iniciar/finalizar viaje), mapa con rastro del viaje (OpenFreeMap,
sin API key) y navegación a Google Maps/Waze, historial y ajustes de tema/idioma.
Detalle y arranque de la app: **[`mobile/README.md`](mobile/README.md)**.

```bash
make setup          # pnpm install + prisma generate
make db-start       # postgres docker
make db-migrate     # prisma migrate dev
node backend/scripts/seed-device.mjs   # dispositivo de banco (imprime GUARDIAN_DEVICE_KEY_HEX)
make dev-backend    # Nest en :3000 (Swagger en /docs)
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

## Hardware elegido para la siguiente integración de banco

- **LILYGO T-A7670E R2 `With GPS`**, europea, con ESP32-WROVER-E, 4G y GNSS. Comprobar físicamente la variante recibida.
- **LIS3DH** en breakout de 3,3 V con `INT1/INT2` accesibles, conectado por I²C + interrupción para wake por movimiento.
- Nano-SIM 4G, USB-C de datos y alimentación estable para banco.
- **ESP32-S3 N16R8 + INA219 R100** como banco externo de medida conectado al Mac. No forman parte de la instalación final.
- La **18650 Li-ion** se mantiene como candidata de reserva, pero no queda aprobada para carga permanente en el vehículo hasta validar protección térmica por hardware y consumo real.

## Ejecutar simulación local

Requiere Python 3.11 o 3.13 y únicamente biblioteca estándar.

```bash
python3 -m guardian.demo
python3 -m unittest discover -s tests -v
```

La demo abre HTTP **solo en 127.0.0.1**, crea una clave temporal aleatoria, transmite un evento de movimiento **simulado** firmado mediante HMAC-SHA256, lo guarda en SQLite y cierra el servidor. `HTTP 202` significa aceptación del backend, **no** detección real, transmisión 4G, GPS o aviso real al móvil. Los tests verifican firmas, eventos malformados, rechazo de repetición y peticiones no autorizadas.

Para ejecutar la simulación contra el **backend Nest real**:

```bash
make db-start && make db-migrate
node backend/scripts/seed-device.mjs   # imprime GUARDIAN_DEVICE_KEY_HEX
# copia los dos export que imprime
make dev-backend &
python3 -m guardian.simulator --kind suspected_movement
# HTTP 202 aceptado | 409 replay | 401 firma mala | 400 envelope invalido
```

El simulador también sigue funcionando contra el servidor Python de banco (`python3 -m guardian.server`, puerto 8765) con `GUARDIAN_INGEST_URL=http://127.0.0.1:8765/v1/events`.

No exponer HTTP local a Internet ni reutilizar claves de demo en hardware real.

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
