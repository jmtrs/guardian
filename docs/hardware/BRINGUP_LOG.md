# Registro de bring-up de la placa

Resultados reales medidos con `firmware/bringup`. Cada entrada indica qué estaba
conectado, porque eso condiciona la lectura. Los identificadores únicos (IMEI,
ICCID, MAC) no se registran aquí.

**Resumen (unidad 1, 2026-11-05).** Pasos 1–7 ✅. P1 1,2 mA, P2b 19,7 mA (con
~15 mA anómalos), P3 0,94 mAh por registro. Evento firmado v2 aceptado por
producción con TLS verificado, y secuencia e identidad en NVS. Pendientes P2a,
P4 y P5. Visión global en [ESTADO_Y_PENDIENTES](../ESTADO_Y_PENDIENTES.md).

| Fecha | Entrada |
|---|---|
| 2026-11-04 | Solo placa por USB · LTE + GNSS · LIS3DH por I²C |
| 2026-11-05 | Camino de la batería · P1 · P3 y primer P2b · P2b · Paso 7 · HTTPS verificado · NVS |

## 2026-11-04 · Unidad 1 · solo placa por USB

Conectado: LILYGO T-A7670E por USB-C al Mac. Sin SIM, sin antenas, sin LIS3DH y
sin batería.

| Comprobación | Resultado | Lectura |
|---|---|---|
| ESP32 | rev v3.1, 2 núcleos, 40 MHz XTAL, flash 4 MB | Coincide con `sdkconfig.defaults` |
| PSRAM | 4096 KB usables | ESP32-WROVER-E; el firmware la detecta |
| Módem | `A7670E-FASE` | Variante con GNSS ("With GPS"), la elegida en COMPONENTES.md |
| Firmware módem | `A011B09A7670M7_F`, build `A7670M7_B09V01_250619` | Referencia para incidencias con SIMCom |
| Encendido módem | Responde a `AT` tras la secuencia POWER_EN → RESET → PWRKEY | Secuencia de `utilities.h` válida en esta unidad |
| SIM | `+CME ERROR: SIM not inserted` | Esperado |
| Red | `+CPSI: NO SERVICE,Flight Mode`, `+CSQ: 5,0` | Esperado sin SIM ni antena |
| LIS3DH | `not found` | Esperado: no conectado |
| VBAT (IO35, divisor ×2 supuesto) | 4270 mV | **No valida el divisor**: sin celda, el nodo BAT muestra la tensión de carga del CN3065 (~4,2 V). Es coherente con 2:1; hay que confirmarlo con batería y multímetro. |

Pasos de COMPONENTES.md: **1 (identificar revisión y variante) ✅**. El paso 2
(LTE + GNSS) queda pendiente de SIM y antenas.

Pendiente detectado: `espflash` grabó su bootloader genérico (ESP-IDF v6.1), no
el v5.4.2 que genera el build. Funciona, pero hay que grabar el bootloader del
propio build.

### Incidencia: USB-C solo funciona en una orientación

Con un cable USB-C a USB-C, la placa solo recibe alimentación (y el Mac solo
ve el CH9102) en **una** de las dos orientaciones del conector. En la otra
no hay ni enumeración USB: parece una placa muerta. Es lo típico cuando solo
un lado del conector lleva la resistencia CC de 5,1 kΩ. Un cable USB-A a USB-C
no depende de CC y funciona en ambas orientaciones.

Acción: marcar la orientación buena en el conector o usar un cable USB-A a C.
Para la instalación final no importa (se alimenta desde el bloque de 12 V),
pero hay que tenerlo presente en el banco.

## 2026-11-04 · Unidad 1 · LTE + GNSS

Conectado: placa por USB-C, SIM Orange (datos), antena LTE FPC en el IPEX
superior y antena cerámica GNSS en el IPEX "GNSS" junto al USB-C. Sin LIS3DH ni
batería. Firmware `bringup` en `3f032b3`.

| Comprobación | Resultado | Lectura |
|---|---|---|
| SIM | `+CPIN: READY` | Requiere esperar a la SIM tras arrancar (corregido en `3f032b3`) |
| Cobertura | `+CSQ: 28` (≈ −57 dBm) | Muy buena, en interior |
| Registro | `+CEREG: 0,1`, `+COPS: 0,2,"21403",7` | Orange ES, LTE |
| Celda | `+CPSI: LTE,Online,…,EUTRAN-BAND1` | Banda 1 (2100 MHz) |
| GNSS | `+CGNSSPWR: READY!`, `AT+CGNSSMODE?` = 3 | GPS + GLONASS + Galileo + BDS |
| AGPS | `AT+CAGPS` → `+AGPS: success.` | Descarga por LTE; hay que esperar a `READY!` antes de pedirlo |
| Fix | < 30 s tras AGPS; 150/150 s con fix, 9 satélites de media (máx. 11), HDOP 2,0 (mín. 1,23) | Paso 2 validado. Coordenadas no registradas |
| SNR máxima | 44–46 dB-Hz | La cadena de antena GNSS está bien |

Pasos de COMPONENTES.md: **2 (LTE + GNSS) ✅**.

### Lecciones de banco GNSS

- **Vista de cielo manda.** Junto a una ventana solo entraban satélites de un
  lado (3 en el horizonte NO, cenit sin señal) y no había fix en 10 min.
  Cambiando de sitio: fix inmediato. Diagnóstico: `AT+CGNSSPORTSWITCH=0,1` +
  `AT+CGNSSTST=1` y mirar la SNR por satélite en `$xxGSV`.
- **Antena cerámica:** la cara cerámica (beige) hacia el cielo; la tapa metálica
  (blindaje del LNA) abajo.
- **Abrir el puerto serie no debe resetear la placa.** Al abrir, macOS activa
  DTR y RTS a la vez, y el circuito de auto-reset lo ignora. El reset
  (`POWERON_RESET` y, de paso, la caída del rail del módem: `*ATREADY: 1` y el GNSS
  de nuevo en frío) lo causaba el script de banco: bajaba DTR y RTS antes de
  abrir, y pyserial los aplica de uno en uno (DTR primero). Ese instante con
  RTS=1/DTR=0 baja EN. Verificado: 3/3 aperturas sin tocar las líneas no
  reinician, y el módem conserva su estado (NMEA activo, última posición) entre
  sesiones. Regla: no tocar DTR/RTS al abrir; para reiniciar a propósito, pulso
  DTR bajo con RTS alto. `espflash` reinicia adrede al flashear o monitorizar.
- **El rail del módem no sobrevive a un reset del ESP32.** IO12 (`POWER_EN`,
  pin de arranque) queda sin conducir desde el reset hasta `Board::take`. Un
  reset real (flasheo, pánico, botón) apaga el módem. Es hardware: aceptado en
  banco y a tener en cuenta en producción.
- **Sin AGPS** el arranque en frío con una antena pasiva pequeña puede pasar de
  varios minutos. El firmware de producción debe pedir AGPS (o inyectar
  efemérides) tras registrarse en LTE.

## 2026-11-04 · Unidad 1 · LIS3DH por I²C

Conectado: módulo LIS3DH azul con tiras soldadas, 7 cables dupont según
[el diagrama](img/lis3dh-wiring.png). Sin pull-down en INT1.

| Comprobación | Resultado | Lectura |
|---|---|---|
| Primer intento | Nadie responde en todo el bus (0x08–0x77) | Barrido añadido a `!lis` (`1f5442f`) |
| Niveles en reposo (pull-down interna) | SDA bajo, SCL alto | SCL alto = módulo alimentado con pull-ups. SDA no llega (`7339174`) |
| Causa | Cable dupont azul (SDA) roto por dentro | Cambiado el cable: SDA y SCL altos |
| Detección | `0x18`, `WHO_AM_I` = `0x33` | LIS3DH auténtico, SDO a GND |
| Self-test en reposo | 10/10, \|a\| = 1021–1030 mg, ruido ±5 mg | **PASS**. Desviación del +2,5 %, dentro de la tolerancia del cero-g y la sensibilidad |
| Primera muestra | ~750 mg con 20 ms de espera | El modo HR tarda 7/ODR en arrancar. Espera subida a 100 ms |

| `!arm` 80 mg, 30 s | 15 interrupciones con toques cada 2 s, cada una limpiada | INT1 → IO34 llega. Fuentes `0x56`–`0x6a`: bit IA más los ejes |

| `!arm` en reposo, 30 s | 0 interrupciones, fuente `0x15` sin IA | Sin falsos disparos. `0x15` son flags de ejes en vivo, no una interrupción (`acknowledge` devuelve ya `Latch { active, raw }`) |
| `!sleep` 80 mg | Primer intento rechazado (`interrupt line stuck high`, había movimiento). Segundo: deep sleep, más de 20 s sin despertar sola; un toque → `WAKE: motion interrupt`, fuente `0x5a` | Despertar por movimiento validado. La protección contra el bucle de wake funcionó |

Pasos de COMPONENTES.md: **3 (LIS3DH I²C) ✅**, **4a (interrupción despierto) ✅** y
**4b (despertar desde deep sleep) ✅**.
Sin pull-down en INT1 no hubo falsos disparos: la salida push-pull fija el nivel.

Lección: los cables dupont baratos fallan por dentro sin que se note. Antes de
sospechar del chip, mirar los niveles de las líneas al arrancar.

## 2026-11-05 · Unidad 1 · Camino de la batería (preparación del banco)

Medido con multímetro, celda LiitoKala 25R a 3,798 V.

| Comprobación | Resultado | Lectura |
|---|---|---|
| Continuidad + portapilas ↔ pin `V_BAT`, sin celda | Pita | `V_BAT` es el + de la celda, directo |
| Continuidad − portapilas ↔ pin `GND`, sin celda | No pita | La protección DW06D (U8) está en el lado −. Sin celda no tiene alimentación y sus MOSFET quedan abiertos |
| `V_BAT`–`GND` con celda, sin USB | 3,789 V | 9 mV de caída en contactos y protección. Con celda, la protección conduce |
| − portapilas ↔ `GND` con celda | 0 V | Ídem |

Consecuencia para el banco: la batería − va al contacto − del portapilas, no
a la GND. Así la protección sigue actuando y su consumo entra en P1. Diagrama
corregido.

Con USB y sin celda, `!vbat` lee 4268 mV: es la salida del cargador CN3065,
no una batería.

## 2026-11-05 · Unidad 1 · P1 en el banco de consumo

Banco: INA219 en serie con la 18650 (fuera del portapilas, − al contacto − del
portapilas), leído por un ESP32-S3 (`firmware/power-bench`). Cero del INA219
sin corriente: −0,20 mA (−0,10 mA en otra sesión); se resta.

| Medida | Resultado | Lectura |
|---|---|---|
| Despierta, consola esperando, módem OFF | 47,0 mA a 3,76 V | Línea base de la ESP32 a 160 MHz |
| **P1**: `!sleep`, deep sleep, módem OFF, USB desconectado | lectura 1,00 mA estable durante 2 min → **≈ 1,2 mA** (±0,1) | Muy por encima de ESP32 (~10 µA) + LIS3DH (~11 µA): el resto es la placa. Pendiente de desglosar |
| P1 con la consola puenteada al S3 (cables 10/11) | Idéntico, 1,00 mA | El TX del S3 en reposo no alimenta la placa (< 0,1 mA) |
| `!vbat` frente al INA219 | 3834 mV frente a 3760 mV | El ADC con divisor ×2 lee un 2 % alto. Pendiente de calibrar con multímetro |

Orientativo: 2500 mAh / 1,2 mA ≈ 87 días solo con P1, sin despertares ni envíos.

Incidencias:

- La batería se desconectó de la placa varias veces sin manipulación aparente:
  0 mA y 0,48 V en el bus. Se recuperó tocando las uniones.
- Resistencia del camino de potencia: la tensión baja 24–30 mV entre 1,2 mA y
  47 mA, es decir **≈ 0,5–0,6 Ω** (dupont, pinza y protoboard). Con los picos
  de ~2 A del LTE caerían más de 1 V. Antes de P3/P4: cables 1–3 gruesos,
  cortos y soldados.
- Con la LILYGO sin alimentar, el cable de consola del S3 la eleva a ~1 V (al
  revés que en reposo). No medir con la LILYGO apagada y el puente conectado.

## 2026-11-05 · Unidad 1 · P3 y primer P2b (banco INA219, consola por el S3)

Consola de la LILYGO puenteada por el S3 (`power-bench`, cables 10/11), USB de
la LILYGO desconectado salvo donde se indica.

| Medida | Resultado | Lectura |
|---|---|---|
| **P3** `!modem on` → registrado (`PB DONE`) | **≈ 0,94 mAh en ~32 s**, ESP32 incluida | 9 s de ellos son la comprobación previa del adapter (`answers_at(3)`, 0,12 mAh): optimizable |
| Módem arrancando | 88–96 mA (total) | |
| Registro y `PDN ACT` | 130–217 mA de media por segundo, picos de 297–416 mA en ventanas de 70 ms | |
| LTE registrado, en reposo, `CSCLK=0` | ≈ 81 mA total, ≈ 34 mA el módem | |
| P2b parcial: `AT+CSCLK=2`, ESP32 despierta | 65,7 mA total → **≈ 18 mA el módem**, suelo de 62,3 mA en 70 ms | Lejos de los 2–3 mA esperables en sleep. DTR estaba en bajo (lo fija `power_on`) |
| `AT+CEDRXS=1,4,"0101"` | Concedido por la red (`+CEDRXRDP: 4,"0101","0101","0000"`), pero 78,5 mA durante 2 min | Tras los AT el módem no volvió a dormir; sin conclusión |
| `AT+CPSMS?` | PSM desactivado. `AT+CEREG=4` no soportado | |

Incidencias del banco:

- Con 0,6 Ω en el camino (medido en estado estable: 266,6 mA a 3,616 V frente
  a 47 mA a 3,748 V), el pico de `PDN ACT` apagó el módem en 3 de 5 intentos.
  Una vez se quedó a 266,6 mA planos durante 15 s antes de apagarse. Rodeo: que
  se registre con el USB conectado y desenchufarlo después. Al desenchufar, el
  módem se reinició y volvió a registrarse con la batería.
- Una vez el S3 se reinició por watchdog (`TG0WDT_SYS_RST`, PC en `int_wdt`
  `tick_hook`) en la misma fase. Ahora lo anuncia (`bbc1f0e`). No se ha
  reproducido.
- `!modem on` no hacía nada tras un apagado espontáneo del módem: estado en
  caché. Corregido en `b0b5ce5`; falta regrabar la unidad.
- Tras un despertar real (`rst:0x5 DEEPSLEEP_RESET`), `announce` dijo
  "power-on / reset" (`esp_sleep_get_wakeup_cause` = UNDEFINED). Pendiente de
  investigar.

Pendiente para cerrar P2: sleep por DTR (`AT+CSCLK=1` + DTR alto) controlado
por firmware, con la ESP32 en deep sleep y los pads del módem retenidos.

## 2026-11-05 · Unidad 1 · P2b (`!standby`)

Firmware con `!standby` (`bfc3b27`, `fff25bf`) grabado. Módem registrado con
batería (Orange, eDRX 82 s concedido por la red), luego `!standby 500`:
`AT+CSCLK=1`, DTR alto, alimentación del módem y TX en reposo retenidos, ESP32
en deep sleep.

| Medida | Resultado | Lectura |
|---|---|---|
| **P2b**, 2 min | **19,5 mA** de media (19,7 con el cero corregido), suelo de 16,5 mA en 70 ms, picos de 28–43 mA | Restando P1 (1,2 mA), **el módem en sleep gasta ≈ 18 mA**. Igual que con `CSCLK=2` y la ESP32 despierta |
| Esperable en sleep LTE (SIMCom) | 2–3 mA | Hay ~15 mA que no son del sleep del módem |
| Primer intento | `interrupt line stuck high`, rechazado | Movimiento al lanzarlo; reintento a 500 mg sin problema |

Orientativo con 2500 mAh: P2b ≈ 127 h (**~5 días**), frente a ~87 días de P1.

Hipótesis por comprobar, de más a menos probable:

1. Polarización de la antena GNSS activa (LNA alimentado aunque el GNSS esté
   apagado): típicamente 5–15 mA.
2. Convertidor o regulador del raíl del módem en la placa, con pérdidas a baja carga.
3. eDRX concedido pero no aplicado: los picos de paging siguen apareciendo
   cada pocos segundos.

Despertar desde P2b con un toque: `rst:0x5 DEEPSLEEP_RESET`, `*** WAKE: motion
interrupt ***`, fuente `0x59`. El módem sigue registrado al despertar
(`+CEREG: 0,1`, `CSQ 29`) y responde en cuanto DTR baja: **sin los ~30 s ni
los ~0,9 mAh del registro de P3**. Esta vez la causa de wake se reportó bien;
el `power-on / reset` tras un `DEEPSLEEP_RESET` del caso anterior sigue
pendiente.

Pasos de COMPONENTES.md: **P1 ✅**, **P2b ✅** (valor anómalo, en
investigación), **P3 ✅** (desde módem apagado). P2a (VBUS) y P4 (GNSS)
pendientes.

## 2026-11-05 · Unidad 1 · Paso 7: primer evento firmado v2

Dispositivo de banco aprovisionado en el backend de producción
(`createDevice` dentro del contenedor; `K_root` fuera del repo). Identidad
compilada en el binario desde el entorno. `!event` con USB conectado (el pico
de TX no tumba el módem por los cables del banco).

| Intento | Resultado | Lectura y arreglo |
|---|---|---|
| 1 | `+CCLK: "70/01/01..."`: sin hora, no se envía nada | Orange ES no manda NITZ (`+CTZU: 0`). `AT+CNTP` con pool.ntp.org sí funciona |
| 2 | HTTPS hasta el backend, **HTTP 400** `Missing raw body, X-Device-Id or X-Guardian-Signature` | El firmware del A7670 manda literal el `\r\n` dentro de `USERDATA` (lo enseñó un servicio de eco). Sí acumula varias llamadas `USERDATA`: una por cabecera. Tampoco manda User-Agent propio |
| 3 | **HTTP 202 aceptado** | `lastSeq 1793878424`, `lastReserveMv 4252` (USB conectado), `source reserve` en la base de datos |
| 4 | Tras `!modem off`/`on`, **HTTP 409** (secuencia repetida) | El reloj del módem retomó una hora antigua y plausible (11:24 a las 11:35): la secuencia de banco (segundos UTC) retrocedió. La defensa anti-replay del backend funcionó. Arreglo: NTP siempre antes de firmar |
| 5 | NTP → `+CNTP: 0` → **HTTP 202** | Cadena completa validada |

Cadena validada: hora por NTP → sobre v2 (198 bytes) → HMAC con `K_event`
(HKDF) → HTTPS por el módem con SNI y Cloudflare → backend 202.

Pendiente de producción: verificar el certificado del servidor
(`authmode 1` con la CA), secuencia en NVS en vez de la hora, y NTP
autenticado o hora por GNSS.

Pasos de COMPONENTES.md: **7 (primer evento firmado v2) ✅**.

## 2026-11-05 · Unidad 1 · HTTPS con verificación de certificado

El paquete de raíces (`firmware/guardian-esp32/certs/guardian-ca.pem`: ISRG Root X1,
GTS Root R1 y R4) se sube una vez al sistema de ficheros del módem
(`AT+CCERTDOWN`, prompt `>` sin salto de línea: el transport ahora detecta
prompts por byte) y el contexto SSL 0 queda en `authmode 1`, con la fecha del
certificado comprobada contra el reloj sincronizado por NTP.

| Prueba | Resultado |
|---|---|
| `!event` a `gtapi.aggc.dev` (cadena YE1 → Root YE → X2 → **X1**) | **HTTP 202** |
| GET a `self-signed.badssl.com` con el mismo contexto | `+HTTPACTION: 0,715,0`: handshake rechazado |
| GET a `badssl.com` (certificado válido) | `200` |

La limitación `authmode 0` del primer evento queda cerrada.

## 2026-11-05 · Unidad 1 · Identidad y secuencia en NVS

Firmware compilado **sin** identidad (arranque: `device identity: none`).

| Paso | Resultado |
|---|---|
| `!provision <id> <secret>` | `identity stored ...; sequence restarts` (el secreto no se imprime) |
| `!event` × 2 | seq 1793881796 (sembrada de los segundos UTC, por encima del último `lastSeq`) y 1793881797, ambas **202** |
| Reset y `!event` | `device identity: from NVS`, seq **1793881798**, **202** |

La secuencia se guarda en NVS antes de enviar: un fallo deja un hueco y nunca
repite. Pendiente: cifrado de NVS y de flash.

## 2026-11-05 · Unidad 1 · Regresión tras la revisión

Firmware sin identidad compilada; la identidad sale de NVS. USB conectado.

| Prueba | Resultado |
|---|---|
| Arranque, `!vbat`, `!lis` | identidad desde NVS, 4254 mV (USB), PASS 10/10 |
| `AT+CCERTDELE` del paquete de CA y luego `!event` | Se reinstala solo (`installing CA bundle`), **202** |
| Reaprovisionar el mismo id y luego `!event` | La secuencia sigue (798 → 799), **202**. Antes del arreglo se habría reiniciado a la hora |
| `!provision` con id o secreto no válidos | Rechazado, nada guardado |
| Dos `!event` justo tras registrarse | `+CNTP: 6` (NTP sin respuesta a tiempo): sin hora, no se envía. Arreglo: tres servidores NTP en orden |
| Tras el arreglo: `!event` × 2, reset, `!event` | seq 800, 801 y 802, todas **202** |

## 2026-11-05 · Unidad 1 · Incidencia: protección de batería U8 dañada

Al final de una carga por USB, con la celda en el banco (fuera del portapilas,
cables al INA219), **salió humo de la zona de potencia**. La celda estaba fría.

| Comprobación | Resultado |
|---|---|
| S3, INA219, ESP32, PSRAM, LIS3DH, módem, LTE y puente de consola | Funcionan |
| Celda en vacío frente al bus del INA a 48,6 mA | 3,95 V frente a 3,74 V: **~4,4 Ω** en el camino (antes ~0,6 Ω) |
| GND de la placa ↔ contacto − del portapilas | **193 mV** a ~48 mA (sano: unos mV). El defecto está en ese tramo |
| Inspección | El chip de 6 patas de la protección (**U8**, marcado `DW06D`/`DW060`) tiene el recubrimiento saltado |
| Esquema V1.4 (página 4) | Ese tramo es celda − → `PY1`.2 → **Q4 AO3400** (protección de polaridad) → B− → **U8** → `GND`. La caída medida incluye Q4; al sustituir U8, comprobar también Q4 (caída entre `PY1`.2 y B−) |

Lectura: **U8 se dañó durante el uso de hoy, no venía así.** Por la mañana
estaba sana: con la celda en el portapilas caían solo 9 mV a 47 mA, y el
recubrimiento estaba intacto. Uno de sus MOSFET integrados quedó dañado a
medias (~4 Ω); con ~285 mA de carga disipaba ~0,3 W y humeó.

Causa más probable: el uso de la protección en el banco. Los "cortes de
batería" de la mañana (0,48 V, placa apagada sin tocar nada) eran casi seguro
disparos de U8 ante picos, a los que se suman los transitorios de conectar y
desconectar cables con la batería puesta y los muchos ciclos de encendido del
módem. El firmware no controla ni el cargador ni la protección.

Estado: la placa funciona **con USB y sin batería** (U8 no está en ese camino).
**No usar con batería ni cargar** hasta sustituir U8 (DW06D, SOT-23-6).

Regla nueva de banco: si la batería "se desconecta sola", parar e investigar
la protección antes de seguir midiendo o cargando.
