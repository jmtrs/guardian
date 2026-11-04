# Guardian bring-up (ESP-IDF)

Herramienta de banco para la **LILYGO T-A7670E (ESP32)**. Cubre los pasos 1–4 de
[COMPONENTES.md](../../docs/COMPONENTES.md#primera-secuencia-al-recibir-las-piezas)
y la medida **P1** (deep sleep, módem OFF).

No es el firmware de Guardian: no lleva secretos ni habla con el backend. El
`core` está pensado para que el firmware real reutilice puertos y adaptadores.

## Arquitectura (hexagonal)

```text
                 ┌────────────────────────── components/core ──────────────────────────┐
 operador ──►    │  command.c        parse de línea (dominio, puro)                    │
 (UART0)         │  accel.c          reglas de aceleración/umbral (dominio, puro)      │
 uart_console ──►│  bringup*.c       casos de uso: identify, gnss, selftest, watch,    │
  (driving)      │                   sleep_until_motion                                │
                 │  ports/           modem · motion_sensor · platform · report         │
                 └────────▲───────────────▲───────────────▲───────────────▲────────────┘
                          │               │               │               │
              a7670_modem.c     lis3dh_i2c.c   esp32_platform.c   uart_console.c
                 (UART1)           (I²C)        (ADC, sleep)        (stdout)
                 └─────────────── components/adapters_esp32 (driven) ───────────────┘
                                          ▲
                              main/main.c — composition root
                              (único que conoce board_t_a7670.h)
```

Reglas:

| Capa | Puede depender de | No puede |
|---|---|---|
| `core` | C estándar | incluir nada de ESP-IDF ni FreeRTOS (`CMakeLists` sin `REQUIRES`) |
| `adapters_esp32` | `core`, drivers ESP-IDF | contener decisiones de negocio |
| `main` | todo | contener lógica: solo construye y cablea |

Consecuencia: el `core` compila y se prueba en el Mac con fakes, sin placa.

## Estructura

```text
firmware/bringup/
├── components/core/                 dominio + puertos + casos de uso (C puro)
│   ├── include/core/{status,accel,command,bringup}.h
│   ├── include/core/ports/*.h       interfaces (vtable + ctx)
│   └── src/*.c
├── components/adapters_esp32/       implementaciones sobre ESP-IDF
│   ├── include/adapters/board_t_a7670.h   pin map (fuente: utilities.h de LILYGO)
│   └── src/{a7670_modem,lis3dh_i2c,esp32_platform,uart_console}.c
├── main/main.c                      composition root
└── test/host/                       tests del core con fakes (ASan + UBSan)
```

## Tests del core (sin placa)

```bash
make test-firmware              # desde la raíz del repo
make -C firmware/bringup/test/host
```

CI: jobs `firmware-core` (tests host) y `firmware-build` (`idf.py build` en
`espressif/idf:v5.4.2`).

## Toolchain

```bash
# una vez (ESP-IDF v5.4.2 en ~/esp/esp-idf)
brew install cmake ninja dfu-util ccache
git clone -b v5.4.2 --recursive --depth 1 --shallow-submodules \
  https://github.com/espressif/esp-idf.git ~/esp/esp-idf
~/esp/esp-idf/install.sh esp32,esp32s3

# cada shell
. ~/esp/esp-idf/export.sh
```

## Compilar y flashear

```bash
cd firmware/bringup
idf.py build
idf.py -p /dev/cu.usbserial-XXXX flash monitor   # salir: Ctrl+]
```

El puerto aparece como `/dev/cu.wchusbserial*` o `/dev/cu.usbserial*`. Si no
aparece, el cable USB-C es solo de carga.

## Cableado LIS3DH

| LILYGO | LIS3DH |
|---|---|
| 3V3 | VCC |
| GND | GND |
| IO21 | SDA |
| IO22 | SCL |
| IO34 | INT1 |
| IO34 → 100 kΩ → GND | pull-down externo |

SDO/SA0 libre: el adaptador prueba 0x18 y 0x19.

**El pull-down es obligatorio.** IO34 no tiene pulls internos y el wake ext0 es
por nivel alto: con INT1 suelto, la línea flota y la placa puede despertar en bucle.

## Comandos (monitor serie)

| Comando | Paso | Qué valida |
|---|---|---|
| `!diag` | 1–2 | chip, PSRAM, MAC, VBAT, `ATI`, `AT+SIMCOMATI`, SIM, `CSQ`, registro LTE |
| `!gnss` → `AT+CGNSSINFO` | 2 | GNSS (antena al exterior; repetir hasta fix) |
| `!lis` | 3 | detección + 10 muestras; PASS si todas ≈ 1 g (±150 mg) |
| `!arm [mg]` | 4a | INT1 durante 30 s con la placa despierta |
| `!sleep [mg]` | 4b / P1 | módem OFF, deep sleep, despertar por movimiento |
| `!vbat` | — | rail de batería |
| `!modem on\|off` | — | secuencia de potencia del módem |
| `AT...` | — | cualquier línea sin `!` va tal cual al módem |

Umbral por defecto 80 mg, rango 16–2032 mg (pasos de 16 mg a ±2 g).

## Decisiones y supuestos a verificar en banco

- **Pines** tomados de `LILYGO_T_A7670` en el `utilities.h` oficial; contrastar
  con la serigrafía de la unidad recibida.
- **INT1 → IO34**: decisión propia. Solo entrada, RTC (wake ext0), sin pulls
  internos; el LIS3DH empuja push-pull.
- **Divisor VBAT ×2** (`BOARD_BATTERY_DIVIDER_X1000`): supuesto hasta medir R7/R9
  con multímetro.
- **PWRKEY**: el pulso de encendido (100 ms) no puede apagar un A7670 encendido,
  porque apagarlo requiere pulsación larga (LILYGO `utilities.h`, A7670:
  100 ms encender / 3000 ms apagar). **Confirmar en banco.** La pulsación larga solo se usa
  si el módem responde a `AT` tras fallar `AT+CPOF`.
- **Módem mudo = corte de alimentación.** Si no responde a `AT`, `power_off`
  abre `POWER_EN` sin `CPOF`. Un módem apagado o colgado no admite otro apagado
  seguro.
- **Deep sleep**: `POWER_EN`, `PWRKEY`, `RESET`, `DTR` y `TX` quedan retenidos
  en bajo (reset inactivo), para que P1 se mida sin alimentar el módem por las
  líneas de señal.
- **Passthrough `AT+CPOF`/`AT+CPOWD`** marca el módem como apagado.
- **Consola**: Ctrl-Z y ESC no llegan al módem (SMS en modo texto fuera de alcance).
- **`!sleep` se niega** a dormir si INT1 sigue alto tras limpiar el latch
  (despertaría en bucle), si no se puede leer el latch o si falla el hold de
  algún pin del módem.
- **Correlación AT**: el protocolo no tiene ids. El adaptador solo acepta
  `OK`/`ERROR` mientras un comando espera, así que las respuestas tardías se
  descartan.
