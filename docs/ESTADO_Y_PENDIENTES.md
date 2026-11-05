# Guardian · estado actual y pendientes

**Fecha: 2026-11-05.** Foto del proyecto tras el bring-up de la primera placa
real. Cada dato remite a su fuente. Este documento resume, no sustituye.

## Dónde estamos

| Pieza | Estado |
|---|---|
| **Backend** (NestJS + Postgres) | En producción en el homelab, detrás de Cloudflare: `https://gtapi.aggc.dev`. Contrato v2 (HKDF + HMAC, anti-replay), incidentes, viajes, `LOCATE_NOW`. Login por OTP con email vía Resend. Ver [DESPLIEGUE](DESPLIEGUE.md). |
| **App móvil** (Expo, dev build) | Funciona contra producción: login, reclamo, panel del dispositivo, mapa, batería. Un dispositivo por cuenta (ver pendientes). |
| **Firmware** (Rust, `firmware/`) | Herramienta de **bring-up**, no firmware de producción. Pasos 1–7 de [COMPONENTES](COMPONENTES.md#primera-secuencia-al-recibir-las-piezas) validados en la unidad 1. Primer evento firmado v2 **aceptado por producción** (HTTP 202) y visto en la app. |
| **Hardware** | Unidad 1 (LILYGO T-A7670E + LIS3DH + 18650) en mesa. Banco de consumo ESP32-S3 + INA219 montado. Nada instalado en el vehículo. |
| **Alimentación del vehículo** | Sin diseñar. Ver [alimentación y reserva](hardware/ALIMENTACION_Y_RESERVA.md). |

## Qué está validado en la placa real

Detalle y números en el [registro de bring-up](hardware/BRINGUP_LOG.md).

| Capacidad | Resultado |
|---|---|
| LTE | Orange ES, bandas 1/3/7, CSQ 25–29, registro en ~30 s desde módem apagado |
| GNSS | Fix en menos de 30 s con AGPS y cielo despejado; sin vista al cielo, nada |
| LIS3DH | I²C a `0x18`, self-test a 1 g, interrupción despierta y desde deep sleep |
| Sleep | P1 (módem apagado) 1,2 mA; P2b (LTE en sleep) 19,7 mA; despertar desde P2b con el módem aún registrado |
| Evento firmado | Hora por NTP → sobre v2 → HMAC con `K_event` (HKDF) → HTTPS del módem con **certificado verificado** → 202 |
| Identidad y secuencia | En NVS; la secuencia se reserva antes de enviar, sobrevive a reinicios y a reaprovisionar el mismo id |
| Anti-replay | Una secuencia vieja (reloj atrasado) recibió 409, como debe |
| Flujo de usuario | Email OTP real (Resend) → reclamo con código → dispositivo y latido en la app |

## Medidas de consumo

Tabla completa y equivalente a 12 V en [COMPONENTES](COMPONENTES.md#resultados-en-la-unidad-1-2026-11-05-desde-la-18650-378-v).

| Prueba | Medida | Gate de 2 mA desde 12 V |
|---|---|---|
| P1 deep sleep, módem OFF | 1,2 mA | Cumple (≈0,45 mA estimados) |
| P2b LTE sleep, batería | 19,7 mA | **No cumple** (≈7,3 mA estimados) |
| P3 registro LTE desde OFF | 0,94 mAh por evento, ~32 s | — |
| P2a, P4, P5 | sin medir | — |

**Consecuencia de diseño, provisional:** con esta placa, hoy solo cabe en el
gate el modo `DEEP` (dormido con el módem apagado, despertar por movimiento y
registrarse para avisar). Un `REMOTE_READY` con LTE siempre registrado solo
sería viable si se explican los ~15 mA de más del módem en sleep.

## Lo aprendido

**Placa y módem**
- El `−` de la batería pasa por la protección DW06D; `V_BAT` es el `+` directo.
  Sin celda, el `−` no tiene continuidad con GND.
- Un reset real del ESP32 deja flotar `POWER_EN` (IO12): el módem pierde la
  alimentación. Abrir el puerto serie bajando DTR/RTS provoca ese reset.
- El A7670 manda literal un `\r\n` dentro de `HTTPPARA="USERDATA"`, pero acumula
  varias llamadas: una cabecera por llamada. No manda User-Agent propio.
- El prompt `>` de `AT+CCERTDOWN` llega sin salto de línea: hay que detectarlo
  por byte, no por línea.
- Tras apagar y encender el módem, su reloj retoma una hora vieja y verosímil.
  Un `+CCLK` válido no prueba nada: NTP antes de firmar.
- `!modem on` no puede fiarse de un estado guardado: el módem puede apagarse
  solo por una caída de tensión.

**Red**
- Orange ES no envía NITZ. `AT+CNTP` funciona, pero justo después de
  registrarse puede no responder a tiempo (`+CNTP: 6`): se prueban
  pool.ntp.org, Cloudflare y Google por orden.
- La red concede eDRX (82 s), pero no bajó el consumo en sleep.
- Cloudflare sirve `aggc.dev` desde Let's Encrypt (YE1 → Root YE → X2 → X1).
  Puede cambiar a Google Trust Services al renovar: el paquete de CA incluye
  ambas.

**Banco de medida**
- Dupont, pinza y protoboard suman ~0,6 Ω en el camino de la batería. Con los
  picos del LTE, el módem se cae al registrarse. Rodeo: registrar con USB y
  desenchufar después.
- El USB nativo del S3 entra en modo descarga si se abre el puerto con DTR/RTS
  activos.
- Para grabar la LILYGO con el banco montado hay que soltar el cable de consola
  del S3 al RX de la placa.

**Servicio**
- Un atajo de login con código fijo (`TEMP_LOGIN_OTP_*`) dejaba sin enviar el
  email de la cuenta del dueño. Desactivado.

## Pendiente

### Seguridad, antes de que una placa salga del banco
- [ ] **Cifrado de flash + NVS y secure boot.** Hoy `K_root` está en flash en claro.
- [ ] **Aprovisionamiento de fábrica.** Hoy `!provision` por consola, que hace
      eco de lo tecleado. Falta una herramienta que no lo muestre.
- [ ] **Hora autenticada.** NTP no está autenticado. Hoy solo alimenta
      `observedAtUtc` (la secuencia es un contador), pero conviene contrastarla
      con la hora GNSS.
- [ ] Mantener el paquete de CA (`firmware/bringup/certs/README.md`).

### Firmware de producción (el siguiente gran bloque; diseño antes de código)
- [ ] Máquina de estados: dormido (P1 o P2 según la energía disponible),
      despertar por movimiento, aviso, vuelta a dormir.
- [ ] `suspected_movement` con debounce y backoff (contrato §8).
- [ ] GNSS → `gnss_fix` con `position` (falta medir P4).
- [ ] Poll de comandos con `K_command` en cada despertar; `LOCATE_NOW` con
      timeout finito.
- [ ] Latido periódico para el watchdog de silencio del backend (prioridad
      según v0.7).
- [ ] Bandeja de salida persistente: un evento conserva su secuencia y se
      reenvía con los mismos bytes hasta 202/409.
- [ ] `power`: medir el rail de 12 V y decidir `source` (hoy `reserve` fijo).
- [ ] Tolerar la transición VBUS/12 V → batería (el módem se reinicia).
- [ ] Mantener `POWER_EN` durante un reset del ESP32.
- [ ] Quitar los ~9 s de comprobación previa de `!modem on` (≈0,12 mAh por aviso).
- [ ] Resistencia de 100 kΩ de INT1 a GND: obligatoria en el dispositivo final.
- [ ] Causa de wake UNDEFINED tras un deep sleep (visto una vez).

### Medidas y hardware
- [ ] **Explicar los ~15 mA de más del módem en P2b.** Primera hipótesis: la
      polarización de la antena GNSS activa. Decide si `REMOTE_READY` es viable.
- [ ] P2a (sleep con VBUS, el riesgo documentado por LILYGO), P4 (GNSS) y
      **P5 (conjunto desde 12 V, la prueba decisiva)**.
- [ ] Contrastar P1 con un multímetro en serie.
- [ ] Calibrar el divisor del ADC de batería (lee un ~2 % alto).
- [ ] Cadena de potencia del vehículo: fusible, protección, supervisor de
      tensión mínima, convertidor, protección térmica de la 18650, caja. Ver
      [alimentación y reserva](hardware/ALIMENTACION_Y_RESERVA.md).

### Backend y app
- [ ] **Verificar `aggc.dev` en Resend** y volver a `EMAIL_FROM=Guardian <noreply@aggc.dev>`.
      Hoy se envía desde `onboarding@resend.dev`, que solo entrega al dueño de
      la cuenta de Resend.
- [ ] Varios dispositivos por cuenta en la app. Hoy solo se reclama sin ninguno
      y se muestra el primero.
- [ ] Endpoint para reabrir el emparejamiento (código nuevo). Hoy se hace a mano
      en el contenedor ([DESPLIEGUE](DESPLIEGUE.md)).
- [ ] Limpieza: el dispositivo simulado "Sim" quedó sin dueño en producción.

### Herramientas de banco
- [ ] El S3 del banco se reinició una vez por watchdog (`TG0WDT_SYS_RST`) al
      arrancar el módem. Ahora lo anuncia; no se ha reproducido.

## Dónde está cada cosa

| Tema | Documento |
|---|---|
| Diseño funcional y gates | [v0.6 integración app-dispositivo](GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md) |
| Ciclo de vida, modelo dual, watchdog de silencio | [v0.7](GUARDIAN_CICLO_DE_VIDA_Y_MODELO_DUAL_v0_7.md) |
| Contrato dispositivo ↔ backend | [CONTRATO v0.6](CONTRATO_DISPOSITIVO_v0_6.md) |
| Componentes, banco y medidas | [COMPONENTES](COMPONENTES.md) |
| Cada prueba en la placa | [BRINGUP_LOG](hardware/BRINGUP_LOG.md) |
| Alimentación y reserva | [ALIMENTACION_Y_RESERVA](hardware/ALIMENTACION_Y_RESERVA.md) |
| Firmware: arquitectura, comandos, banco | [firmware/README.md](../firmware/README.md) |
| Despliegue y operación | [DESPLIEGUE](DESPLIEGUE.md) |
