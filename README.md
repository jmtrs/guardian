# Guardian

Vigilante personal independiente para un coche antiguo de 12 V: movimiento, batería principal, ubicación y alertas. **Estado actual: únicamente banco de software.** No existen todavía firmware ESP32, sensor conectado, app de autorización ni circuito de alimentación automotriz probado. **No instalar este prototipo en el coche.**

## App (monorepo `backend/` + `mobile/`)

Backend **NestJS + Prisma + PostgreSQL** con Better Auth (entrada por código OTP al email, sin contraseña ni teléfono) y app **Expo**. El endpoint de ingesta del dispositivo es el mismo `/v1/events` firmado con HMAC; el servidor Python queda como referencia de banco.

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

- **[GUARDIAN v0.5: diseño personal, arquitectura y pantallas](docs/GUARDIAN_DISENO_PERSONAL_v0_5.md)**. Sigue siendo el diseño funcional; la antigua `docs/GUIA_PERSONAL.md` remite a este documento.
- **[Alimentación y reserva para meses en el coche](docs/hardware/ALIMENTACION_Y_RESERVA.md)**. Decisión de mantener una única 18650 en la LILYGO **si** se verifica protección térmica real de carga, selección de celda, consumo y protección del coche. Es una especificación pendiente de ensayo, no una instalación validada.
- **[Esquema eléctrico LILYGO V1.4, fuente oficial y lectura de la página de carga](docs/hardware/ESQUEMA_T_A7670X_V1_4.md)**. Enlaza al PDF del fabricante y documenta el circuito `CN3065`, `TEMP` y el puente `N9`; la coincidencia con nuestra unidad **R2** debe comprobarse físicamente. El PDF binario no está copiado dentro de este repositorio.
- [Lista de componentes por etapas](docs/COMPONENTES.md).

## Hardware elegido para la primera integración USB

- **LILYGO T-A7670E R2 `With GPS`**, europea, con ESP32-WROVER-E, 4G, GNSS y antenas del kit. Comprobar variante.
- **Adafruit LIS3DH ref. 2809** (BricoGeek SEN-0185), en lugar del LIS2DW12 previo. Cinco cables Dupont hembra-hembra para 3,3 V, GND, SDA, SCL e interrupción.
- Nano-SIM 4G, USB-C de datos y alimentación USB estable. Soldar cabeceras si se reciben sueltas.
- La **18650 Li-ion** es opcional para pruebas USB; para la instalación personal definitiva se pretende usar **una sola celda en el portabaterías de LILYGO** con inhibición térmica efectiva por hardware. Ni el esquema publicado ni el firmware actual acreditan esa protección: consultar el documento de alimentación antes de comprar piezas de modificación o montar en el coche.

## Ejecutar simulación local

Requiere Python 3.11 o 3.13 y únicamente biblioteca estándar.

```bash
python3 -m guardian.demo
python3 -m unittest discover -s tests -v
```

La demo abre HTTP **solo en 127.0.0.1**, crea una clave temporal aleatoria, transmite un evento de movimiento **simulado** firmado mediante HMAC-SHA256, lo guarda en SQLite y cierra el servidor. `HTTP 202` significa aceptación del backend, **no** detección real, transmisión 4G, GPS o aviso real al móvil. Los tests verifican firmas, eventos malformados, rechazo de repetición y peticiones no autorizadas.

Para ejecutar la simulación contra el **backend Nest real** (mismo protocolo firmado):

```bash
make db-start && make db-migrate
node backend/scripts/seed-device.mjs   # imprime GUARDIAN_DEVICE_KEY_HEX
# (copia los dos export que imprime)
make dev-backend &
python3 -m guardian.simulator --kind suspected_movement
# HTTP 202 aceptado | 409 replay | 401 firma mala | 400 envelope invalido
```

El simulador también sigue funcionando contra el servidor Python de banco (`python3 -m guardian.server`, puerto 8765) con `GUARDIAN_INGEST_URL=http://127.0.0.1:8765/v1/events`.

Ambos procesos deben heredar exactamente la misma clave. No exponer HTTP local a Internet ni reutilizar claves de demo en hardware real. Telegram opcional necesita credenciales propias; no consta entrega verificada a una cuenta real.

## Próximos pasos

1. Comprobar revisión física, cargador real y esquema de la LILYGO `With GPS`; probar LTE y GNSS por USB sin publicar IMEI o credenciales.
2. Conectar LIS3DH por I²C + INT a GPIO libre **verificado** y desarrollar firmware para movimiento real, persistencia de evento, TLS y módem; el Python actual no se flashea al ESP32.
3. Implementar autorización BLE intencional y confirmada por Guardian; mera proximidad no desarma.
4. Comprobar que la 18650 cumple límites de temperatura del emplazamiento, que la carga se suspende **por hardware** en frío/calor/fallo de sensor y que la transición de fuente no pierde alertas aunque haya reinicio.
5. Seleccionar entrada automotriz protegida, fusible, supervisor autónomo de baja tensión y conversor adecuado; **sin OBD ni mechero**. Medir reposo, probar corte del ramal Guardian y funcionamiento prolongado antes de instalar.
