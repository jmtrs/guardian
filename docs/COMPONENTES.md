# GUARDIAN · Componentes y compra por etapas (v0.6)

**Fuente de verdad para componentes:** este documento y [GUARDIAN v0.6](GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md).  
El diseño v0.5 queda como referencia histórica funcional, pero su tabla de compra ya no es la vigente.

## Cerrado para la siguiente fase de banco

| Cant. | Componente | Uso | Estado |
|---:|---|---|---|
| 1 | **LILYGO T-A7670E R2 europea, variante `With GPS`** | ESP32 + LTE Cat-1 + GNSS del Guardian físico. | **Recibida (unidad 1)**: ESP32-WROVER-E (4 MB flash, 8 MB PSRAM, 4 MB mapeados) + A7670E-FASE. Bring-up completo, ver [registro](hardware/BRINGUP_LOG.md). |
| 1 | **LIS3DH** en breakout de 3,3 V con `INT1/INT2` expuestos | Detección de movimiento y wake por interrupción. | **Recibido y validado**: `0x18`, `WHO_AM_I 0x33`, wake desde deep sleep. |
| 1 | **Nano-SIM 4G** con datos | Conectividad LTE real. | **Orange ES** en uso (LTE bandas 1/3/7, CSQ 25–29). No envía la hora por la red (NITZ): el firmware usa NTP. |
| 1 | **USB-C de datos + fuente 5 V estable capaz de soportar los picos del módem** | Programación y primeras pruebas de mesa. | Reutilizar si ya se dispone. |
| varios | **Dupont / cableado de banco** | I²C, interrupción y alimentación de sensores. | Necesario. |
| 1 | **ESP32-S3 N16R8** externa | Registrador de consumo; se conecta al Mac y no forma parte del vehiculo. | **En uso** (`firmware/power-bench`), también como puente de consola. |
| 1 | **INA219 con shunt R100 = 0,1 Ω** | Medición de corriente/tensión/potencia para caracterizar Guardian. | **En uso**. Cero medido: −0,1/−0,2 mA. |

La ESP32-S3 de medida y el INA219 son **instrumentación de desarrollo**, no componentes de la instalación final.

## Banco de medida

```text
Mac
 │ USB
 ▼
ESP32-S3 N16R8
 │ I²C
 ▼
INA219 R100
 │
 └──── corriente del DUT ────► Guardian
```

La ESP32-S3 se alimenta desde el Mac. El dispositivo bajo prueba debe usar una fuente independiente.

El INA219 con R100 sirve para clasificar el consumo y calcular medias/energía durante horas o días. Su resolución de shunt y la tolerancia de un módulo genérico no lo convierten en un profiler de laboratorio. Si una medición queda cerca del gate de **2 mA desde 12 V**, se confirma con un multímetro calibrado o instrumental de mayor precisión antes de aprobar la instalación.

Durante LTE, el shunt de 0,1 Ω introduce caída de tensión. En las pruebas directas a 5 V se debe vigilar también la tensión de bus y cualquier reset; no usar el INA219 para afirmar que se ha capturado el pico instantáneo máximo del módem. El dato decisivo de autonomía será la medición del **sistema completo desde 12 V**.

**Montaje real (2026-11-05):** la celda va fuera del portapilas, con el + al INA219 y el − al contacto − del portapilas, para que la protección DW06D de la placa siga en el circuito. La consola de la LILYGO pasa por el S3 (cables 10/11), para medir sin USB. Ver el [esquema](hardware/img/ina219-bench-wiring.png) y `firmware/README.md`. Lecciones:

- El camino de potencia del banco midió **~0,6 Ω** (dupont, pinza, protoboard; ~0,2 Ω son fijos: shunt + DW06D + celda). Con los picos del LTE, el módem se apagó al registrarse en 3 de 5 intentos. Rodeo: registrarlo con el USB conectado y desenchufarlo después.
- Sin batería conectada, el − del portapilas no tiene continuidad con GND: la DW06D abre su MOSFET. Es normal.

## LIS3DH

Conexión prevista, pendiente de validar contra el pinout de la revisión recibida:

```text
LILYGO          LIS3DH
3,3 V  ───────► VCC
GND    ───────► GND
SDA    ───────► SDA
SCL    ───────► SCL
GPIO   ◄────── INT1
```

El breakout genérico se tratará como dispositivo de **3,3 V** hasta verificar su circuito. Antes de integrarlo:

1. comprobar alimentación y ausencia de cortos;
2. verificar I²C y `WHO_AM_I`;
3. comprobar lectura XYZ;
4. configurar una interrupción de movimiento;
5. verificar que `INT1` despierta el ESP32;
6. medir su consumo dentro del conjunto.

Los umbrales de movimiento no se fijan antes de probarlo en el vehiculo real.

## Alimentación y reserva

La instalación final **todavía no tiene referencias cerradas** para:

- derivación reversible desde +12 V permanente no crítico;
- fusible y arnés;
- protección de entrada automotriz;
- supervisor UVLO autónomo con histéresis;
- buck de muy bajo consumo capaz de soportar LTE;
- solución térmicamente segura para la 18650;
- caja y fijación.

No comprar un buck genérico o un módulo UVLO al azar como solución definitiva. La selección depende de las mediciones del banco y del vehículo.

### 18650

La celda sigue siendo candidata de reserva, no una pieza aprobada para permanecer cargando dentro del vehiculo.

Antes de usarla de forma permanente hay que validar:

- revisión física del circuito de carga de la LILYGO;
- límites térmicos de la celda;
- corte de carga por hardware fuera de rango;
- fallo de la sonda;
- corriente de recarga desde la batería del vehiculo;
- transición 12 V → reserva y recuperación tras reset.

Ver [alimentación y reserva](hardware/ALIMENTACION_Y_RESERVA.md).

## Riesgo conocido de la T-A7670X

LILYGO documenta que el módem de la T-A7670X puede no entrar en sleep correctamente cuando la placa está alimentada mediante USB-C/VBUS. Esto es crítico porque la instalación final también necesitará una ruta externa de alimentación.

Por eso se probarán por separado:

```text
P1  deep sleep + módem OFF
P2a LTE sleep con alimentación externa/VBUS
P2b LTE sleep con batería
P3  wake + LTE
P4  wake + LTE + GNSS
P5  conjunto completo desde 12 V
```

Si la alimentación normal impide el sleep del módem, no se asume una modificación de placa como solución automática. Se decidirá entre modo `DEEP` con módem apagado, una modificación validada en banco, otra ruta de potencia o un cambio de plataforma.

### Resultados en la unidad 1 (2026-11-05, desde la 18650, ~3,78 V)

| Prueba | Medida | Equivalente desde 12 V\* | Frente al gate de 2 mA |
|---|---|---|---|
| **P1** deep sleep, módem OFF | **1,2 mA** (±0,1) | ≈ 0,45 mA | Cumple, con margen para convertidor y supervisor |
| P2a LTE sleep con VBUS | — | — | **Pendiente** |
| **P2b** LTE sleep con batería (`!standby`, `CSCLK=1` + DTR) | **19,7 mA** (módem ≈ 18 mA frente a 2–3 mA de la hoja de datos) | ≈ 7,3 mA | **No cumple** (×3,6). Sin los ~15 mA anómalos sería ≈ 1,75 mA: al límite |
| **P3** módem OFF → registrado en LTE | **0,94 mAh**, ~32 s | — | Coste por aviso desde P1 |
| Despertar desde P2b | Módem ya registrado, sin coste de registro | — | |
| P4 wake + LTE + GNSS | — | — | **Pendiente** |
| P5 conjunto desde 12 V | — | — | **Pendiente** (decisivo) |

\*Estimación: potencia a 3,78 V / 12 V / 0,85 de rendimiento del convertidor, sin su consumo en vacío ni el del supervisor. P5 la sustituye.

**Lectura provisional:** hoy solo el modo `DEEP` (P1 + despertar por movimiento + P3 por aviso) cabe en el gate. `REMOTE_READY` (LTE siempre registrado) queda fuera mientras no se explique el consumo de más de P2b. Primera hipótesis: la polarización de la antena GNSS activa. Ver [estado y pendientes](ESTADO_Y_PENDIENTES.md).

## No comprar por ahora

- segunda placa GNSS;
- otro acelerómetro “por si acaso”;
- antenas extra antes de revisar el kit recibido;
- una segunda batería/cargador en paralelo;
- accesorios OBD o toma de mechero;
- instrumental caro antes de medir con INA219 + multímetro;
- piezas para modificar el cargador térmico antes de inspeccionar la R2 real.

## Primera secuencia al recibir las piezas

Estado de la unidad 1 a 2026-11-05 (detalle en el [registro de bring-up](hardware/BRINGUP_LOG.md)):

1. ✅ Identificar revisión y variante exactas de LILYGO.
2. ✅ Probar LTE y GNSS (firmware Rust propio en lugar de los ejemplos: Orange LTE, fix en menos de 30 s con AGPS y cielo despejado).
3. ✅ Probar LIS3DH por I²C.
4. ✅ Probar interrupción y wake (despierto y desde deep sleep).
5. ✅ Conectar el banco ESP32-S3 + INA219.
6. 🟡 Medir P1-P4: P1, P2b y P3 hechos; P2a y P4 pendientes.
7. ✅ Implementar el primer evento físico firmado hacia el backend (HTTP 202 en producción, TLS verificado, secuencia e identidad en NVS).
8. ⏳ Solo después decidir `REMOTE_READY`, intervalos de check-in y bloque de potencia final. Datos y lectura provisional arriba.

**No instalar todavía en el vehiculo.** El CI del repositorio valida software; no valida corriente, temperatura, cobertura, protección automotriz ni reserva.
