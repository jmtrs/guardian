# CONTRATO DISPOSITIVO ↔ BACKEND v0.6

Fuente única de verdad para conectar una placa (LILYGO T-A7670E) al backend.
Todo lo que hay aquí está implementado y verificado en `backend/src/devices/`
(`protocol.ts`, `devices.service.ts`) y ejercitado por `backend/scripts/bench.ts`
y los drives `drive-pr1.ts` / `drive-pr2.ts`. Si este documento y el código
discrepan, manda el código; luego se corrige el documento.

No hay versiones anteriores ni compatibilidad que mantener: `schemaVersion: 2`
es el único contrato. Un mensaje que no cumpla algo de este documento se
rechaza — el backend nunca "interpreta lo que quiso decir" el dispositivo.

---

## 1. Identidad y claves

Cada dispositivo tiene:

- **`deviceId`**: string cuid generado por el backend en el provisioning
  (ej. `cmucuubng0001cd515d2mc2ck`). El dispositivo lo almacena y lo envía
  en la cabecera `x-device-id` de TODAS sus peticiones.
- **`K_root`**: 32 bytes aleatorios, entregados UNA vez en el provisioning
  como hex (64 caracteres). El backend no vuelve a exponerlo jamás. Si se
  pierde, se reprovee el dispositivo.

`K_root` **no firma nada directamente**. De ella se deriva una clave por canal
mediante HKDF-SHA256:

```
K_contexto = HKDF-SHA256(
  ikm  = K_root (32 bytes),
  salt = deviceId (bytes UTF-8),
  info = "guardian/event/v1"    -> K_event    (canal eventos)
       | "guardian/command/v1"  -> K_command  (canal comandos)
       | "guardian/ble/v1"      -> K_ble      (desafío BLE, futuro)
  L    = 32 bytes
)
```

Implementación de referencia: `deriveKey()` en `backend/src/devices/protocol.ts`
(usar HKDF estándar RFC 5869; en MicroPython/ESP-IDF existe `hmac` + expansión
HKDF equivalente).

Reglas duras:

- Un evento SIEMPRE se firma con `K_event`. El poll SIEMPRE con `K_command`.
- Una clave de un contexto nunca se acepta en otro canal (el backend deriva
  la del canal que está verificando; cualquier otra falla).
- El secreto no va jamás en el cuerpo, en cabeceras propias ni en logs.

## 2. Firma

HMAC-SHA256 sobre los **bytes exactos** del cuerpo HTTP, en hexadecimal
(64 caracteres), cabecera `x-guardian-signature`.

```
signature = hex( HMAC-SHA256( K_contexto, body_bytes ) )
```

El backend compara con `timingSafeEqual`. El JSON se firma tal cual se envía:
el dispositivo debe firmar el buffer que transmite, no re-serializar.

## 3. Transporte

- HTTP `POST`, `content-type: application/json`.
- Cuerpo ≤ **4096 bytes** (`MAX_BODY`). Más grande = rechazo.
- Cabeceras obligatorias en toda petición del dispositivo:

```
x-device-id:           <deviceId>
x-guardian-signature:  <hex hmac del cuerpo exacto>
content-type:          application/json
```

- Banco local: `http://localhost:3000` (o el host del backend). Producción
  exigirá HTTPS con verificación completa del certificado — el firmware debe
  traer el CA bundle y validar, nunca aceptar cualquier certificado.

El dispositivo solo habla dos endpoints:

| Endpoint | Clave | Función |
|---|---|---|
| `POST /v1/events` | K_event | enviar un evento (telemetría/alerta/fix) |
| `POST /v1/commands/poll` | K_command | preguntar si hay comandos pendientes |

## 4. Evento (`POST /v1/events`)

### 4.1 Esquema

```json
{
  "schemaVersion": 2,
  "deviceId": "cmucuubng0001cd515d2mc2ck",
  "sequence": 42,
  "kind": "gnss_fix",
  "observedAtUtc": "2026-09-22T18:03:11Z",
  "power": {
    "vehicleMv": 13600,
    "reserveMv": 4100,
    "source": "vehicle"
  },
  "commandId": "cmucuxxxxxxxxxxxxxxxxxxxx",
  "position": { "lat": 40.4168, "lon": -3.7038, "fixAtUtc": "2026-09-22T18:03:10Z" }
}
```

Campo a campo:

| Campo | Regla |
|---|---|
| `schemaVersion` | Entero, exactamente `2`. Cualquier otro valor: `400 Unsupported event version`. |
| `deviceId` | Debe coincidir con la cabecera `x-device-id`. Si no: `400 Device mismatch`. |
| `sequence` | Entero, `1 .. 2^31-1`. Estrictamente creciente por dispositivo (ver anti-replay §4.4). |
| `kind` | Uno de: `suspected_movement` \| `power_lost` \| `heartbeat` \| `gnss_fix` \| `battery_low`. |
| `observedAtUtc` | ISO 8601 con zona obligatoria (`Z` o `±HH:MM`), ≤ 64 caracteres. Nunca hora local ambigua. |
| `power` | **Obligatorio en todo evento.** Ver §4.2. |
| `commandId` | Opcional. SOLO en `gnss_fix` (correlación con `LOCATE_NOW`). Regex `^[A-Za-z0-9_-]{1,64}$`. En otro kind: `400`. |
| `position` | Opcional en general, **obligatorio en `gnss_fix`**. Ver §4.3. Un `gnss_fix` sin position: `400 gnss_fix requires position`. |

Campos desconocidos: los objetos `power` y `position` admiten EXACTAMENTE las
claves del contrato (ni extra ni faltan). Un campo extra en el nivel raíz se
ignora, salvo `batteryMv`, que se rechaza de forma explícita (ver §4.2).

### 4.2 `power` — telemetría de energía

```json
{ "vehicleMv": 13600, "reserveMv": 4100, "source": "vehicle" }
```

| Clave | Regla |
|---|---|
| `vehicleMv` | Entero `0..60000`, obligatorio, nunca null. Milivoltios del rail de 12 V del vehiculo. |
| `reserveMv` | Entero `0..60000` o `null`, opcional. Milivoltios de la reserva interna (18650). Omitir si no hay medición fiable. |
| `source` | `'vehicle'` \| `'reserve'` \| `'unknown'`. Qué rail alimenta AHORA. |

`source: 'unknown'` es la honestidad del firmware cuando no puede determinar
el rail activo — es válido, pero nunca se inventa `'vehicle'` sin medición.

**`batteryMv` no existe.** Si aparece — aunque venga `null` — el backend
responde `400 batteryMv is not part of the protocol; use power`. Es un
dispositivo desalineado y se quiere ruido explícito, no silencio.

### 4.3 `position`

```json
{ "lat": 40.4168, "lon": -3.7038, "fixAtUtc": "2026-09-22T18:03:10Z" }
```

`lat` ∈ [-90, 90], `lon` ∈ [-180, 180], números finitos. `fixAtUtc` ISO 8601
con zona. Es el momento del fix GNSS, no el de envío.

### 4.4 Anti-replay

El backend guarda `lastSeq` por dispositivo y solo acepta `sequence` estrictamente
mayor, de forma atómica con el resto de efectos del evento:

- `sequence <= lastSeq` → `409 Replayed or stale sequence`, nada cambia.
- Dos eventos con la misma secuencia nunca ambos entran (unique `(deviceId, seq)`).

El firmware mantiene el contador en NVS/flash y lo incrementa SOLO tras un 202.
Si el dispositivo se reinicia, recupera el último valor persistido y continúa
desde ahí (+1). Ante un 409 persistente, re-sincroniza: hace poll y reintentará
con una secuencia mayor solo cuando la conozca; nunca reinicia el contador a 0
en caliente.

### 4.5 Respuestas

| Código | Cuerpo | Significado |
|---|---|---|
| `202` | `{"status":202,"sequence":N}` | Evento aceptado y aplicado. |
| `400` | mensaje del fallo de contrato | JSON inválido, versión, campos, secuencia no numérica, etc. Fail-closed. |
| `401` | `Bad signature` | Firma incorrecta o deviceId desconocido. Uniforme en mensaje Y tiempo (un deviceId inválido igualmente paga HKDF+HMAC): no permite enumerar dispositivos. |
| `409` | `Replayed or stale sequence` | Secuencia no avanza. |

### 4.6 Efectos colaterales en el backend (lo que la placa provoca)

Al aceptar un evento, el backend en una transacción:

1. Actualiza el estado denormalizado del dispositivo: `lastSeq`, `lastSeenAt`,
   posición (`lastLat/lastLon/lastFixAt`) si trae `position`, y telemetría
   (`lastVehicleMv/lastReserveMv/lastPowerSource`).
2. Guarda el evento completo (`kind`, `observedAt`, `payload`).
3. **Abre incidente** si `kind` es `suspected_movement` o `power_lost` y el
   dispositivo está `ARMED` (estado de seguridad del lado servidor). Un kind
   con incidente ya `OPEN` no duplica. `heartbeat`, `gnss_fix` y `battery_low`
   nunca abren incidente.
4. **Cierra por recuperación** (solo `power_lost` en `ACKNOWLEDGED`): si el
   incidente fue revisado por el dueño y llega un evento con
   `power.source === 'vehicle'`, el incidente pasa a `CLOSED` y queda
   trazado con `closedByEventSeq`. Un incidente `OPEN` jamás se cierra por
   telemetría — solo el dueño lo avanza.
5. **ACK de comando**: si el evento es `gnss_fix` con `commandId` y `position`,
   y el comando referenciado sigue `PENDING` y vivo, pasa a `ACKED` atómicamente
   y se guarda `resultEventId`. Fix tardío (comando ya `EXPIRED`): la posición
   se guarda, el comando NO se marca atendido.

## 5. Semántica de los `kind` — cuándo emite la placa

| kind | Cuándo | Lleva position | Notas |
|---|---|---|---|
| `heartbeat` | Check-in periódico de ahorro energético | No obligatoria | Mantiene `lastSeenAt` + telemetría. Nunca abre ni cierra nada. |
| `suspected_movement` | El LIS3DH detecta movimiento con el vehiculo aparcado/armado | Recomendada (GNSS on tras el wake) | Abre incidente `OPEN` (rojo en la app). |
| `power_lost` | Corte del ramal de 12 V del Guardian | Recomendada | Abre incidente propio. Típicamente irá con `source:'reserve'` si la reserva asume el sistema. |
| `battery_low` | Umbral de reserva baja | No | SOLO telemetría/aviso. Nunca es incidente. |
| `gnss_fix` | Respuesta a `LOCATE_NOW`, o fix de rutina durante alerta | **Obligatoria** | Con `commandId` si responde a un comando. |

Regla de honestidad: la placa nunca emite un evento que no midió. Sin fix
GNSS válido no hay `gnss_fix` (y el backend lo rechazaría igualmente).

## 6. Comandos (`POST /v1/commands/poll`)

La app pide ubicar el vehiculo → el backend crea un comando `LOCATE_NOW`
(`PENDING`, TTL **120 s**). El dispositivo despierto pregunta:

```json
{ "deviceId": "cmucuubng0001cd515d2mc2ck", "polledAtUtc": "2026-09-22T18:03:00Z" }
```

Firmado con **K_command** (K_event aquí falla con 401). Campos exactos, sin extras.

Respuesta `200`: array JSON con los comandos `PENDING` no expirados, orden
cronológico:

```json
[
  {
    "id": "cmucuxxxxxxxxxxxxxxxxxxxx",
    "deviceId": "cmucuubng0001cd515d2mc2ck",
    "type": "LOCATE_NOW",
    "status": "PENDING",
    "createdAt": "2026-09-22T18:02:05.000Z",
    "expiresAt": "2026-09-22T18:04:05.000Z",
    "ackedAt": null,
    "resultEventId": null
  }
]
```

Errores: `400` (cuerpo mal formado), `401 Bad signature` (uniforme, misma
política anti-enumeración que eventos).

### 6.1 Ciclo `LOCATE_NOW` completo

```
APP            BACKEND                    PLACA
 |--POST locate->|                          |
 |               |-- crea LOCATE_NOW PENDING (TTL 120 s)
 |<--command-----|                          |
 |               |<------POST poll----------|  (K_command, al despertar)
 |               |--[LOCATE_NOW PENDING]--->|
 |               |                          |-- GNSS on, timeout finito
 |               |<---POST gnss_fix---------|  (K_event, commandId+position)
 |               |-- ACK atómico si vivo -->|  202 -> GNSS off, sleep
 |<--poll app----|                          |
 |   ACKED+fix   |                          |
```

- El comando expira solo: el backend lo marca `EXPIRED` de forma perezosa
  (al leer). Un fix que llega tarde guarda la posición pero NO ackea.
- Despertar la placa (RI/SMS/lo que sea) **no es autorización**: solo significa
  "despierta y pregunta al canal autenticado". La orden real vive en el poll.
- El firmware valida `type` e `id` del comando antes de actuar; algo que no
  entiende se ignora (fail-closed) y se reporta al siguiente heartbeat si procede.

## 7. Provisioning (estado actual, banco)

Hoy el alta es operada por banco (no hay pairing en producción aún):

```bash
cd backend
npx ts-node scripts/bench.ts provision <email-del-dueño> [nombre]
# imprime deviceId + secret (K_root en hex) — UNA sola vez
```

- Requiere que el usuario haya iniciado sesión en la app al menos una vez.
- El `deviceId` + `K_root` se graban en la flash/NVS de la placa.
- Flujo de pairing con presencia física (claim + credenciales de un solo uso):
  pendiente, ver `GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md` §6.

Herramientas de banco contra un backend en marcha:

```bash
npx ts-node scripts/bench.ts send <email> <kind> [vehicle|reserve]  # evento firmado
npx ts-node scripts/bench.ts locate <email>                          # crea LOCATE_NOW
npx ts-node scripts/bench.ts poll <email>                            # poll firmado
npx ts-node scripts/bench.ts fix <email> [commandId]                 # gnss_fix con ACK
npx ts-node scripts/bench.ts walk <email> [n]                        # rastro de n fixes
npx ts-node scripts/bench.ts status <email>                          # estado/energía/incidentes
```

## 8. Máquina de estados que la placa debe respetar

La placa no conoce el estado de seguridad (`ARMED`/`TRIP`/`WORKSHOP`) — es
decisión del backend/dueño. Lo que sí debe respetar:

- **Nada se desarma por telemetría.** Un evento jamás cierra un incidente
  `OPEN`; solo el dueño desde la app lo pasa a `ACKNOWLEDGED`, y solo la
  energía de vehiculo restablecida cierra un `power_lost` revisado.
- **La detección no se silencia.** Si el LIS3DH dispara, se emite
  `suspected_movement` con debounce y backoff acotados (presupuesto
  energético), pero nunca supresión total de alertas.
- **Toda transmisión mide antes sus rails** y los reporta en `power`.
- **Fallo de red**: timeouts finitos, reintentos acotados con backoff, política
  más agresiva en reserva. El evento se persiste localmente con su secuencia
  y se envía al recuperar enlace (la secuencia estrictamente creciente hace
  que lleguen en orden y sin duplicar).

## 9. Checklist de integración de la placa

1. [ ] HKDF-SHA256 RFC 5869 con salt=deviceId, info por canal → claves idénticas
      a `deriveKey()` (verificar contra el backend con un evento de prueba).
2. [ ] HMAC-SHA256 sobre los bytes exactos del cuerpo, hex en cabecera.
3. [ ] Contador de secuencia persistente (NVS), solo avanza tras 202.
4. [ ] `power` medido en cada emisión; `source` honesto.
5. [ ] `gnss_fix` siempre con `position`; `commandId` solo en respuesta a poll.
6. [ ] Poll con K_command en cada wake; `LOCATE_NOW` ejecutado con timeout finito.
7. [ ] `batteryMv` no existe en el firmware — ni en código muerto.
8. [ ] 401/409 manejados: re-sincronización de secuencia, sin bucle de reintento
      infinito, sin revelar nada en logs.
9. [ ] TLS con verificación completa para cualquier despliegue fuera de localhost.

## 10. Dónde está cada cosa

| Pieza | Sitio |
|---|---|
| Contrato de eventos (decode) | `backend/src/devices/protocol.ts` |
| Lógica de negocio (incidentes, ACK, anti-replay) | `backend/src/devices/devices.service.ts` |
| Reglas puras de incidentes | `backend/src/devices/incident.ts` |
| Endpoints dispositivo | `backend/src/devices/ingest.controller.ts`, `device-commands.controller.ts` (mismo archivo) |
| Esquema BD | `backend/prisma/schema.prisma` |
| Tests del contrato | `backend/src/devices/protocol.spec.ts`, `incident.spec.ts` |
| Drives end-to-end | `backend/scripts/drive-pr1.ts`, `drive-pr2.ts` |
| Bench manual | `backend/scripts/bench.ts` |
| Diseño (energía, BLE, wake) | `docs/GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md` |
