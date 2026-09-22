# MAPA DE CONEXIÓN DEL SISTEMA · Guardian v0.6

Punto de entrada único para entender cómo encaja todo. No repite los detalles de
cada capa: los enlaza. Si vas a tocar o conectar una capa nueva, empieza aquí y
salta al documento concreto.

Regla de nombres transversal: **siempre "vehículo", nunca "coche"/"car".** La
batería medida es la del vehículo (turismo, moto, lo que sea) frente a la reserva
interna del Guardian. No existe un campo genérico "batería": ver §4.

Sin legacy: hay **un único contrato** (`schemaVersion: 2`). Todo lo anterior está
muerto y su rechazo está testeado (`batteryMv`, `schemaVersion: 1` → `400`). No se
mantiene compatibilidad hacia atrás; un mensaje que no cumpla el contrato se
rechaza, el backend nunca "interpreta lo que quiso decir" el dispositivo.

---

## 1. Las cinco capas

| # | Capa | Qué hace | Estado | Dónde |
|---|---|---|---|---|
| 1 | **Hardware** | LILYGO T-A7670E (ESP32 + LTE Cat-1 + GNSS) + LIS3DH (movimiento) + 18650 (reserva) + rail 12 V del vehículo. | Componentes elegidos; integración de banco pendiente. | [`COMPONENTES.md`](COMPONENTES.md), [`hardware/`](hardware/) |
| 2 | **Firmware** | Mide rails, detecta movimiento (LIS3DH), obtiene fix GNSS, firma y envía eventos, hace poll de comandos. | **No existe aún.** El simulador de banco (Python/TS) ocupa su lugar. | pendiente; simulador en `guardian/`, `backend/scripts/bench.ts` |
| 3 | **Contrato** | El cable: claves HKDF por canal, firma HMAC sobre bytes exactos, esquema de evento, anti-replay, poll de comandos. | Definido y verificado. | [`CONTRATO_DISPOSITIVO_v0_6.md`](CONTRATO_DISPOSITIVO_v0_6.md) |
| 4 | **Backend** | Verifica firma, decodifica, aplica anti-replay, denormaliza estado, abre/cierra incidentes, correlaciona `LOCATE_NOW` ↔ fix. | Funcional, testeado. | `backend/src/devices/` |
| 5 | **App móvil** | Login OTP, dashboard, mapa con rastro, incidentes, "actualizar ubicación", viaje. | Funcional. | `mobile/src/` |

El firmware (capa 2) es hoy el único hueco real. Todo lo que hay por encima y por
debajo de él está definido y sujeto al contrato de la capa 3, así que conectar la
placa es "cumplir el contrato", no "diseñar el protocolo".

---

## 2. Recorrido de un dato, de punta a punta

### 2.1 Telemetría / alerta (dispositivo → app)

```
LIS3DH INT ─► ESP32 despierta ─► mide power {vehicleMv, reserveMv?, source}
                                     │  (GNSS on si procede → position)
                                     ▼
        firma HMAC-SHA256( K_event, body_bytes )        K_event = HKDF(K_root, deviceId, "guardian/event/v1")
                                     │
             POST /v1/events  (x-device-id, x-guardian-signature)
                                     ▼
   backend: verify → decodeEvent → tx { anti-replay por lastSeq, denormaliza
            lastLat/lastVehicleMv/..., guarda evento, abre incidente si ARMED }
                                     ▼
        GET /v1/devices (app, polling)  ─►  dashboard + mapa + incidentes
```

- `suspected_movement` / `power_lost` con el dispositivo `ARMED` abren un
  **incidente persistente** (rojo en la app). Un `heartbeat` posterior NO lo borra.
- `heartbeat`, `gnss_fix`, `battery_low` nunca abren incidente: solo telemetría.
- La secuencia es estrictamente creciente por dispositivo: el anti-replay vive en
  `updateMany(where lastSeq < sequence)`, atómico con el resto de efectos.

### 2.2 Localización a demanda (app → dispositivo → app)

```
app "Actualizar ubicación"  ─► POST /v1/devices/:id/commands/locate
                                     ▼
   backend crea LOCATE_NOW PENDING (TTL 120 s; reutiliza el vivo, idempotente)
                                     ▼
   dispositivo despierto ─► POST /v1/commands/poll  (K_command, NO K_event)
                                     ▼
   backend responde [LOCATE_NOW PENDING] ─► GNSS on, timeout finito
                                     ▼
   POST /v1/events kind=gnss_fix + commandId + position  (K_event)
                                     ▼
   backend: ACK atómico si el comando sigue PENDING y vivo → status ACKED
                                     ▼
   app (polling de commands) ve ACKED + fix ─► botón "UBICADO 18:03"
```

- Despertar la placa **no es autorización**: la orden real vive en el poll
  autenticado. Un fix que llega tarde guarda la posición pero NO ackea (no se
  fabrica una confirmación que no llegó a tiempo).

---

## 3. Fronteras: qué garantiza cada borde

| Frontera | Contrato duro |
|---|---|
| Hardware → firmware | El firmware mide sus rails **antes** de cada emisión; `source` honesto (`unknown` si no lo sabe, nunca `vehicle` inventado). |
| Firmware → backend | Ver [`CONTRATO_DISPOSITIVO_v0_6.md`](CONTRATO_DISPOSITIVO_v0_6.md): HKDF por canal, HMAC sobre bytes exactos, `schemaVersion: 2`, `power` obligatorio, secuencia monotónica persistida en NVS. |
| Backend → BD | Estado denormalizado (`lastLat/lastVehicleMv/...`) + eventos + incidentes; anti-replay por `@@unique([deviceId, seq])`. `backend/prisma/schema.prisma`. |
| Backend → app | REST autenticado con Better Auth (OTP). Tipos del backend espejados 1:1 en `mobile/src/api/devices.ts`. |
| App → dueño | Nada se desarma por telemetría: solo el dueño avanza un incidente (`Revisado`), y solo la energía del vehículo restablecida cierra un `power_lost` revisado. |

El **secreto (`K_root`)** entra una sola vez en el provisioning y no se expone
jamás: `DEVICE_PUBLIC_FIELDS` lo excluye, la app nunca lo ve. Un `deviceId`
desconocido paga el mismo coste HKDF+HMAC que uno válido (clave señuelo), para que
la `401` no enumere dispositivos ni por mensaje ni por tiempo.

---

## 4. Diccionario: un nombre, un sitio

| Concepto | Nombre canónico | Prohibido | Vive en |
|---|---|---|---|
| El bien protegido | **vehículo** | coche, car | todo el repo |
| Energía del rail 12 V | `power.vehicleMv` | ~~`batteryMv`~~ (rechazo `400`) | `protocol.ts`, schema, `devices.ts` |
| Reserva interna | `power.reserveMv` (nullable) | — | idem |
| Rail activo ahora | `power.source` = `vehicle`\|`reserve`\|`unknown` | — | idem |
| Secreto del dispositivo | `K_root` → `deriveKey()` por canal | reutilizar clave entre canales | `protocol.ts` |
| Orden de localizar | `LOCATE_NOW` | — | `CommandType` (schema, `devices.ts`) |
| Alerta persistente | `Incident` (`OPEN`/`ACKNOWLEDGED`/`CLOSED`) | derivar del último evento | `incident.ts`, schema |

Si un término aparece con otro nombre en cualquier capa, es un bug de alineación:
el contrato y `mobile/src/api/devices.ts` mandan.

---

## 5. Dónde vive cada pieza (índice de saltos)

| Pieza | Sitio |
|---|---|
| Contrato de eventos (decode + firma + HKDF) | `backend/src/devices/protocol.ts` |
| Lógica de negocio (anti-replay, ACK, incidentes) | `backend/src/devices/devices.service.ts` |
| Reglas puras de incidentes | `backend/src/devices/incident.ts` |
| Endpoints dispositivo y dueño | `backend/src/devices/ingest.controller.ts` |
| Esquema BD | `backend/prisma/schema.prisma` |
| Tests del contrato | `backend/src/devices/protocol.spec.ts`, `incident.spec.ts` |
| Drives end-to-end | `backend/scripts/drive-pr1.ts`, `drive-pr2.ts` |
| Simulador / banco manual | `backend/scripts/bench.ts`, `guardian/` (Python) |
| Espejo de tipos + hooks de datos (app) | `mobile/src/api/devices.ts` |
| Dashboard, mapa, incidentes (app) | `mobile/src/pages/` |
| Hardware y energía | `docs/COMPONENTES.md`, `docs/hardware/` |

---

## 6. Conectar la capa que falta (firmware)

El firmware no diseña nada nuevo: implementa el contrato de la capa 3. Checklist
canónica en [`CONTRATO_DISPOSITIVO_v0_6.md` §9](CONTRATO_DISPOSITIVO_v0_6.md). En
una línea:

1. Reproducir `deriveKey()` (HKDF-SHA256, salt=`deviceId`, info por canal) y
   verificar contra el backend con un evento de prueba.
2. Firmar los **bytes exactos** del cuerpo con `K_event` (eventos) / `K_command`
   (poll). Nunca cruzar claves de canal.
3. Contador de secuencia persistente en NVS; solo avanza tras un `202`.
4. `power` medido en cada emisión; `batteryMv` no existe ni en código muerto.
5. `gnss_fix` siempre con `position`; `commandId` solo respondiendo a un poll.
6. TLS con verificación completa fuera de `localhost`.

Mientras el firmware no exista, el simulador de banco cumple exactamente este
contrato — es la referencia ejecutable de lo que la placa debe hacer.

---

> Si este documento y el código discrepan, **manda el código**; luego se corrige
> el documento. Fuentes de verdad ejecutables: `backend/src/devices/` y
> `mobile/src/api/devices.ts`.
