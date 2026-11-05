# CICLO DE VIDA DEL DISPOSITIVO Y MODELO DUAL v0.7

**Estado: diseño de arquitectura. NADA de esto está implementado salvo lo que
se marca explícitamente como VERIFICADO en código.** Este documento cierra el
diseño del ciclo de vida completo de un Guardian (aprovisionamiento → claim →
release → traspaso → migración) y del modelo de negocio dual (managed vs
self-host), incluyendo los huecos de ingeniería que hay que cerrar antes de
fabricar. Complementa `GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md` (que ya
cerró el diseño de release/transfer) y `CONTRATO_DISPOSITIVO_v0_6.md` (protocolo
v2). Si este documento y el código discrepan, manda el código.

Convención de marcadores:

- **VERIFICADO** — comprobado en código, con referencia `archivo:línea`.
- **DISEÑO CERRADO** — especificado en `v0_6.md`, sin implementar.
- **HUECO** — problema detectado, sin diseño ni código; hay que resolverlo.
- **DECISIÓN** — decisión de arquitectura tomada aquí.

---

## 1. Modelo dual: managed vs self-host

### 1.1 Managed (€X/mes — precio sin validar, ver §9)

- App apunta al cloud por defecto (`getApiBaseUrl`, VERIFICADO
  `mobile/src/api/config.ts:6-18`: hoy resuelve `EXPO_PUBLIC_API_URL` inlineado
  en build o `localhost`).
- Device pre-aprovisionado contra el cloud.
- Cuenta Better Auth (email + OTP) por-backend. VERIFICADO
  (`backend/prisma/schema.prisma:16-63`).
- Flujo actual funcional: cuenta → teclea claim code → `claimDevice`. VERIFICADO
  (`backend/src/devices/devices.service.ts:135-158`).
- Backend responsable del tratamiento de datos (ver §7).

### 1.2 Self-host (pago único, €0/mes)

- Backend self-host YA existe. VERIFICADO (`docker-compose.homelab.yml`):
  Postgres + backend GHCR + migraciones automáticas + secretos por `.env`.
- App: necesita **URL de servidor configurable en runtime** (HUECO, ver §5.1).
- Auth por-backend: la cuenta del self-hoster vive en su servidor. Trivial.
- Provisioning: `createDevice` existe (VERIFICADO
  `devices.service.ts:97-114`) pero no hay tool/CLI/UI que lo exponga fuera del
  bench. HUECO menor.

### 1.3 DECISIÓN — self-host es "community", NO co-igual

Dos productos con las MISMAS garantías = doble matriz de test, doble ruta de
soporte, doble modelo de seguridad, para siempre. Cada feature debe funcionar en
ambos. Es una tasa de QA permanente.

- **Managed = EL producto.** Con SLA, seguridad acotada, responsabilidad de
  datos asumida.
- **Self-host = backend open-source SIN soporte, SIN SLA, SIN garantía de
  compatibilidad de app.** "Community edition".
- Esto acota la tasa: no se promete que reventa/migración self-host sean
  seguras (ver §3.1/F1), solo que el backend corre.

---

## 2. Primitivas del ciclo de vida

Casi todo (migración, reventa, self-host) se reduce a tres primitivas. Bien
diseñadas una vez, resuelven el resto.

| Primitiva | Estado | Sirve para |
|---|---|---|
| **K_root rotable** | VERIFICADO cifrado en reposo (`secret-crypto.ts`); rotación en device **falta firmware** | migración, reventa, corte de acceso |
| **Provisioning reusable** | VERIFICADO `createDevice` (`devices.service.ts:97`); sin tool expuesto | alta en cualquier backend |
| **Endpoint configurable** en device | HUECO — firmware fijo hoy | self-host, migración |

`K_root` no firma nada directo; se derivan claves por canal con HKDF-SHA256.
VERIFICADO (`CONTRATO_DISPOSITIVO_v0_6.md:26-30`).

---

## 3. Estados del dispositivo y transiciones

```
   [FÁBRICA]
      │ createDevice: K_root + claimCodeHash + pairingExpiresAt, ownerId=null
      ▼
 [SIN DUEÑO / PAIRING]
      │ claimDevice(code): ownerId=set, claimCode/pairing borrados
      ▼
   [RECLAMADO] ──────────────┐
      │ release (DISEÑO        │ migración (release en origen +
      │  CERRADO, sin impl.)   │  provision en destino, ver §4)
      ▼                        ▼
 [SIN DUEÑO / PAIRING]   [otro backend]
```

VERIFICADO: `createDevice` + `claimDevice` (`devices.service.ts:97-158`). El modelo de
propiedad es **single-owner**: `ownerId` es un FK único en todo el service
(VERIFICADO, ~20 usos). Ver F8.

### 3.1 Release / reventa / traspaso — DISEÑO CERRADO (`v0_6.md:289-300`)

- `POST /v1/devices/:id/release` — sesión del dueño + **step-up OTP** (acción
  destructiva; no basta sesión robada). Atómico.
- Efecto: `ownerId=null` + nuevo `claimCode`/ventana + **purga total** de
  historial (eventos, viajes, ubicaciones).
- Comprador reclama como device nuevo. Sin tokens de transferencia.
- El device pertenece a la **cuenta**, no al teléfono (`v0_6.md:291`): login en
  otro móvil ya lo ve.
- **Sin denylist ni activation-lock** — descartado a propósito (`v0_6.md:298`).
  No reintroducir.

---

## 4. Migración self ↔ managed

Mismo mecanismo, dos direcciones: **release en origen + provision en destino +
repuntar endpoint + rotar K_root**.

1. Cuenta nueva en el backend destino (auth por-backend).
2. `release` en origen (reusa §3.1).
3. `createDevice` en destino → nuevo K_root + claimCode.
4. App/BLE: escribe endpoint_destino + K_root_new en el device.
5. Claim en destino.
6. **Export/import de device+historial** si se quiere conservar (JSON) — también
   cubre portabilidad GDPR (ver §7). HUECO: no construido.
7. Suscripción: se liga al alta/baja del device en el cloud.

Gotcha crítico: reset de `seq` (ver F2).

---

## 5. HUECOS de ingeniería (worst-case, verificados)

Ordenados por gravedad. Cada uno con evidencia y decisión.

### F6 (RESUELTO EN SOFTWARE, 2026-11-05) — Watchdog de silencio

El hueco original era el ataque más simple: silenciar el device. Ya existe
`LivenessService`: usa reloj del servidor, cadencia opt-in por dispositivo y
abre un incidente `signal_lost` tras N heartbeats perdidos. Un evento firmado
posterior lo cierra conservando el historial.

Implementado y verificado:
- `Device.heartbeatIntervalSec`; `null` desactiva rollout sin falsos positivos.
- `LIVENESS_MISSED_HEARTBEATS` acotado (1–20; default 3).
- Índice parcial: un único incidente OPEN por `(deviceId, kind)`.
- App entiende `signal_lost`; pruebas unitarias y PostgreSQL real cubren
  apertura, idempotencia, recuperación y anti-replay.

Sin esto, Guardian **no es un anti-robo correcto**. Va antes que todo el
self-host.

### F1 (CRÍTICO en self-host) — Release sin rotar K_root = teatro

`/v1/events` se autentica por HMAC de K_root, no por sesión. Quien tenga K_root
puede **inyectar eventos** de ese device.

- Managed: el dueño nunca ve K_root (está en BD + firmware; la app usa K_ble).
  Solo un atacante con extracción de firmware lo saca → acotado por Secure
  Boot/Flash Encryption (`v0_6.md:287`). Tolerable.
- Self-host: el dueño **es admin de la BD → conoce K_root** (lo descifra con su
  `GUARDIAN_SECRET_KEY`). Vende el device → puede falsificar
  ubicación/incidentes del comprador para siempre.

**DECISIÓN:** reventa/migración segura exige **rotación de K_root en el device**
(firmware). Sin firmware, el self-host **NO promete reventa segura** (coherente
con §1.3). El doc ya lo admite parcialmente (`v0_6.md:297`).

### F2 (CRÍTICO) — Reset de `seq` descoordinado = brick silencioso

Anti-replay: `updateMany where lastSeq < sequence` (VERIFICADO
`devices.service.ts:403-409`). `device.id` NO cambia en el release; `lastSeq`
persiste. El contador lo persiste también el cliente (VERIFICADO: ficheros
`.guardian_seq_*.json` en la raíz del repo).

Brick: si el firmware del nuevo dueño reinicia a `seq=1` y el backend sigue en
`lastSeq=5000` → **rechaza TODO como replay** (`Replayed or stale sequence`),
device vivo e ignorado en silencio.

**DECISIÓN:** el reset de `seq` es **bilateral y atómico**, atado a la rotación
de K_root. Un lado nunca se resetea sin el otro. El `release` debe poner
`lastSeq=0`.

### F3 (ALTO) — Atomicidad del release bajo carga

Purga de miles de eventos en una tx = lock largo. Si el claimCode nuevo se
activa antes de terminar la purga → el comprador ve datos del vendedor.

**DECISIÓN — orden obligatorio del release:**
1. `ownerId=null`, `claimCodeHash=null` (device **inreclamable**), `lastSeq=0`.
2. Purga del historial (puede ser async; el device sigue inreclamable).
3. Solo al terminar: emitir nuevo `claimCode` + ventana.

Nunca reclamable mientras queden datos viejos.

### F4 (ALTO) — Step-up OTP sin fallback rompe self-host

Release exige step-up OTP por email. Pero `RESEND_API_KEY` tiene **default
vacío** (VERIFICADO `docker-compose.homelab.yml:41`). Self-host sin email →
sin OTP → release imposible → device no transferible.

**DECISIÓN:** o (a) email obligatorio en self-host (validar al arrancar,
fail-closed), o (b) fallback de step-up por **presencia física** (BLE/botón)
cuando no hay email. Elegir antes de implementar release.

### F5 (ALTO) — Repointing de endpoint = bypass anti-robo silencioso

Endpoint configurable por BLE/WiFi (futuro). Sin gate, un atacante con
proximidad repunta el device a otro servidor → deja de reportar (silencio).

**DECISIÓN:** cambio de endpoint exige el **mismo gate físico+auth que el
re-pairing**. Y F6 (watchdog) cubre la detección del silencio resultante.

### F9 (MEDIO) — Reloj del device confiado a ciegas

`observedAt = parseTzTimestamp(data.observedAtUtc)` (VERIFICADO
`protocol.ts:158`), timestamp del device, sin validación contra reloj real.
Battery-history e incidentes usan `observedAt`. Reloj malo → historial mal
agrupado, incidentes con hora falsa.

**DECISIÓN:** GNSS es **fuente de reloj autoritativa**; `observedAt`
best-effort hasta el primer fix. Retención ya usa `receivedAt` (server) — bien.
Definir en firmware + validar skew razonable en `protocol.ts`.

### F8 (MEDIO, decisión estructural) — `ownerId` FK único cierra B2B/familia

Single-owner grabado (VERIFICADO, ~20 usos en `devices.service.ts`). Vehículo con
dos conductores / flota / compartir solo-lectura = imposible sin migrar esquema
(`ownerId` → tabla de membresía con roles).

**DECISIÓN a tomar AHORA:** ¿sharing/roles/flota entran en el mercado?
- Si no: mantener `ownerId` FK. Simple.
- Si sí: `ownerId` es deuda desde el día 1; modelar membresía antes de escalar.

Pendiente de decisión del producto.

---

## 6. Cómo encaja todo

```
                    PRIMITIVAS (§2)
   K_root rotable · provisioning · endpoint configurable
                        │
     ┌──────────────┬───┴────────┬───────────────┐
   RELEASE      MIGRACIÓN     DUAL MODEL       WATCHDOG
  (§3.1, F1-3)   (§4, F2)     (§1, F4)        (F6, base
                                               del anti-robo)
```

Reventa, migración y self-host **no son tres sistemas**: son el mismo (release +
provisioning + endpoint/K_root configurables) apuntando a distinto
backend/dueño. El watchdog (F6) es transversal: sin él, el pilar anti-robo es
defectuoso en cualquier modelo.

---

## 7. Datos y GDPR (product-defining para managed EU)

La ubicación revela casa, trabajo, hábitos → dato personal de alto riesgo.

- Managed: **tú eres responsable/encargado del tratamiento.** Base legal, DPA,
  minimización, borrado, portabilidad.
  - Retención: VERIFICADO `RETENTION_DAYS=90` (`retention.service.ts`).
  - Borrado: purga en release (DISEÑO CERRADO §3.1).
  - Portabilidad: export **no construido** (HUECO, §4.6).
- Self-host: **traslada la responsabilidad al usuario.** Ventaja legal real,
  no solo marketing.

**DECISIÓN:** lanzamiento managed EU requiere base legal + DPA + export antes de
vender. No es papeleo opcional.

---

## 8. Plan de trabajo (ordenado por lo que ROMPE, no por lo fácil)

| # | Tarea | Capa | Cierra | Coste |
|---|---|---|---|---|
| 0 | ✅ **Watchdog de silencio** | backend | F6 (anti-robo correcto) | cerrado |
| 1 | Reloj GNSS autoritativo + skew | firmware+backend | F9 | bajo |
| 2 | Decidir `ownerId` → membresía o no | modelo | F8 | decisión |
| 3 | Release: orden inreclamable→purga→claim + `lastSeq=0` | backend | F2, F3, §3.1 | medio |
| 4 | Step-up OTP: email obligatorio self-host o fallback físico | backend | F4 | bajo |
| 5 | URL servidor runtime en Ajustes | app | self-host | 1-2 días |
| 6 | Tool provisioning (`provision-device`) | backend | self-host, migración | medio |
| 7 | Export/import device+historial | backend | migración, GDPR (§7) | medio |
| 8 | Docs self-host (compose + provision + apuntar app) | docs | onboarding | bajo |
| 9 | Endpoint change = gate físico+auth | firmware | F5 | alto (pre-fab) |
| 10 | Firmware: rotación K_root + reset seq atómico | firmware | F1, F2 de verdad | alto (pre-fab) |

Regla: 0-8 son software puro, hoy. 9-10 son las decisiones que deben quedar
tomadas **antes de mandar a fabricar** (endpoint + K_root configurables desde el
arranque).

---

## 9. DECISIONES FIJAS

1. **Anti-robo real = watchdog de silencio (F6).** Prioridad 0. Sin esto no hay
   producto anti-robo.
2. **Self-host = community, sin garantías (§1.3).** No co-igual. Acota
   QA/soporte/seguridad.
3. **Reventa/migración segura exige rotación K_root en device (F1).** Sin
   firmware, self-host no la promete.
4. **Reset `seq` bilateral y atómico (F2)**, `lastSeq=0` en release, o brick
   silencioso.
5. **Release: inreclamable antes de purgar (F3).** Nunca fuga al comprador.
6. **GNSS = reloj autoritativo (F9).**
7. **Modelo de propiedad (single vs membresía) a decidir antes de escalar
   esquema (F8).**
8. **Sin denylist/activation-lock** (respetar `v0_6.md:298`).
9. **€X/mes sin validar:** reprecial con coste totalmente cargado (Stripe ~8%
   sobre €4.99, SIM, hosting, **soporte amortizado**). El break-even por unidades
   sin contar soporte no vale.
10. **Managed EU: base legal + DPA + export antes de vender (§7).**
