# Registro de bring-up de la placa

Resultados reales medidos con `firmware/bringup`. Cada entrada indica qué estaba
conectado, porque eso condiciona la lectura. Los identificadores únicos (IMEI,
ICCID, MAC) no se registran aquí.

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

Pasos de COMPONENTES.md: **3 (LIS3DH I²C) ✅**.

Lección: los cables dupont baratos fallan por dentro sin que se note. Antes de
sospechar del chip, mirar los niveles de las líneas al arrancar.
