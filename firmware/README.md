# Guardian firmware (Rust)

Firmware de la **LILYGO T-A7670E (ESP32 + SIMCom A7670E)** en Rust, sobre
ESP-IDF v5.4.2 (`esp-idf-svc`). La pieza actual es la herramienta de banco
**bring-up**, que cubre los pasos 1–4 de
[COMPONENTES.md](../docs/COMPONENTES.md#primera-secuencia-al-recibir-las-piezas)
y la medida P1. El firmware de producción reutilizará `guardian-core` y
`guardian-drivers`.

## Por qué Rust y dónde

| Capa | Lenguaje | Motivo |
|---|---|---|
| Lógica (dominio, casos de uso, protocolo futuro) | Rust `no_std`, sin `unsafe` | Seguridad de memoria y tipos donde viven los secretos y el protocolo v2. Tests con `cargo test` en el Mac. |
| Drivers (LIS3DH, framing AT) | Rust `no_std` sobre `embedded-hal` 1.0 | Independientes de la HAL. Se testean con mocks de I²C/GPIO. |
| Adapters de placa | Rust `std` sobre `esp-idf-hal` | Drivers ESP-IDF probados (UART, I²C, ADC calibrado, deep sleep). El `unsafe` queda confinado a `hold.rs` y `platform.rs`, con `SAFETY` documentado. |
| Sistema (RTOS, drivers, sleep) | C de ESP-IDF | Lo da Espressif. No se reescribe. |

## Arquitectura (hexagonal)

```text
 guardian-core (no_std, forbid(unsafe))
 ├── accel.rs     Accel, Threshold (newtype: solo existe ya acotado)
 ├── command.rs   parser de consola, pureza total
 ├── ports.rs     traits: Modem · MotionSensor · Platform   (salida = fmt::Write)
 └── bringup/     casos de uso: identify, gnss, selftest, watch, sleep_until_motion
          ▲ implementan
 guardian-drivers (no_std, embedded-hal 1.0)
 ├── lis3dh.rs    Lis3dh<I2c, InputPin, DelayNs>: MotionSensor
 └── at.rs        LineFramer + final_result (lado puro del módem)
          ▲ usan
 bringup (xtensa-esp32-espidf, std)
 ├── board.rs     ÚNICO sitio con pines físicos → roles
 ├── modem/       A7670: potencia + AtTransport (hilo lector, Condvar)
 ├── platform.rs  identidad, ADC batería, ext0 wake, deep sleep
 ├── hold.rs      hold de pads en deep sleep (único unsafe de GPIO)
 ├── console.rs   consola UART0 + Stdout: fmt::Write
 └── main.rs      composition root: cablea y entra en el bucle
```

Reglas:
- `guardian-core` no depende de nada.
- `guardian-drivers` depende solo del core y de `embedded-hal`.
- Solo `bringup` conoce ESP-IDF.
- Ningún archivo pasa de 300 líneas. `missing_docs = "deny"` y clippy `pedantic` en los tres crates.

## Tests (sin placa)

```bash
make test-firmware          # core (27) + drivers (11)
```

Los drivers verifican el tráfico I²C exacto: la receta de interrupción AN3308,
el decodificado de 12 bits, el fallback de dirección 0x18→0x19 y que rechaza un
LIS3DSH.

CI:
- `firmware-host`: fmt, clippy y test de core y drivers.
- `firmware-esp32`: clippy y build para `xtensa-esp32-espidf`.

## Toolchain (una vez)

```bash
cargo install espup ldproxy espflash --locked
espup install --targets esp32       # Rust fork para Xtensa → ~/export-esp.sh
```

`esp-idf-sys` descarga y compila ESP-IDF v5.4.2 (fijado en
`bringup/.cargo/config.toml`). Las herramientas se comparten en `~/.espressif`.

## Compilar, flashear, monitor

```bash
. ~/export-esp.sh
cd firmware/bringup
cargo build --release
cargo run --release            # = espflash flash --monitor (elige el puerto)
```

El puerto aparece como `/dev/cu.wchusbserial*` o `/dev/cu.usbserial*`. Si no
aparece, el cable USB-C es solo de carga.

## Cableado LIS3DH

| LIS3DH | LILYGO |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SCL | IO22 |
| SDA | IO21 |
| CS | 3V3 (fuerza I²C) |
| SDO | GND (dirección 0x18) |
| INT1 | IO34 + **100 kΩ a GND** |
| INT2, ADC1–3 | sin conectar |

**El pull-down es obligatorio.** IO34 no tiene pulls internos y el wake ext0 es
por nivel alto: con INT1 suelto, la línea flota y la placa despierta en bucle.

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

## Supuestos a verificar en banco

- **Pines**: tomados de `LILYGO_T_A7670` en el `utilities.h` oficial (`bringup/src/board.rs`).
- **Divisor VBAT ×2** (`BATTERY_DIVIDER_X1000`): hay que medir R7/R9.
- **PWRKEY**: el pulso de encendido (100 ms) no puede apagar un A7670 encendido,
  porque apagarlo requiere pulsación larga (LILYGO: 3000 ms). **Confirmar en banco.**
  La pulsación larga solo se usa si el módem responde a `AT` tras fallar `AT+CPOF`.
- **Módem mudo = corte de alimentación**: si no responde a `AT`, `power_off` abre
  `POWER_EN` sin `CPOF`.
- **Deep sleep**: `POWER_EN`, `PWRKEY`, `RESET` (inactivo), `DTR` y `TX` quedan
  retenidos en bajo, para que P1 se mida sin alimentar el módem por las líneas de señal.
- **`!sleep` se niega** a dormir si INT1 sigue alto tras limpiar el latch, si no se
  puede leer el latch o si falla el hold de algún pin.
- **Correlación AT**: el protocolo no tiene ids. Solo se acepta `OK`/`ERROR`
  mientras un comando espera.
- **Consola**: Ctrl-Z y ESC no llegan al módem (SMS en modo texto fuera de alcance).
