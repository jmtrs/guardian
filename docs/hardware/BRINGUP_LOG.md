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
