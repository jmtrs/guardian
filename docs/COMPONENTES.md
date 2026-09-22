# GUARDIAN · Componentes y compra por etapas (v0.6)

**Fuente de verdad para componentes:** este documento y [GUARDIAN v0.6](GUARDIAN_INTEGRACION_APP_DISPOSITIVO_v0_6.md).  
El diseño v0.5 queda como referencia histórica funcional, pero su tabla de compra ya no es la vigente.

## Cerrado para la siguiente fase de banco

| Cant. | Componente | Uso | Estado |
|---:|---|---|---|
| 1 | **LILYGO T-A7670E R2 europea, variante `With GPS`** | ESP32 + LTE Cat-1 + GNSS del Guardian físico. | Elegido; verificar revisión y variante al recibir. |
| 1 | **LIS3DH** en breakout de 3,3 V con `INT1/INT2` expuestos | Detección de movimiento y wake por interrupción. | Elegido. No usar LIS3DSH como sustituto. |
| 1 | **Nano-SIM 4G** con datos | Conectividad LTE real. | Operador pendiente de elegir según cobertura. |
| 1 | **USB-C de datos + fuente 5 V estable capaz de soportar los picos del módem** | Programación y primeras pruebas de mesa. | Reutilizar si ya se dispone. |
| varios | **Dupont / cableado de banco** | I²C, interrupción y alimentación de sensores. | Necesario. |
| 1 | **ESP32-S3 N16R8** externa | Registrador de consumo; se conecta al Mac y no forma parte del coche. | Elegida. |
| 1 | **INA219 con shunt R100 = 0,1 Ω** | Medición de corriente/tensión/potencia para caracterizar Guardian. | Elegido. |

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

Los umbrales de movimiento no se fijan antes de probarlo en el coche real.

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

La celda sigue siendo candidata de reserva, no una pieza aprobada para permanecer cargando dentro del coche.

Antes de usarla de forma permanente hay que validar:

- revisión física del circuito de carga de la LILYGO;
- límites térmicos de la celda;
- corte de carga por hardware fuera de rango;
- fallo de la sonda;
- corriente de recarga desde la batería del coche;
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

## No comprar por ahora

- segunda placa GNSS;
- otro acelerómetro “por si acaso”;
- antenas extra antes de revisar el kit recibido;
- una segunda batería/cargador en paralelo;
- accesorios OBD o toma de mechero;
- instrumental caro antes de medir con INA219 + multímetro;
- piezas para modificar el cargador térmico antes de inspeccionar la R2 real.

## Primera secuencia al recibir las piezas

1. Identificar revisión y variante exactas de LILYGO.
2. Probar LTE y GNSS con ejemplos oficiales.
3. Probar LIS3DH por I²C.
4. Probar interrupción y wake.
5. Conectar el banco ESP32-S3 + INA219.
6. Medir P1-P4.
7. Implementar el primer evento físico firmado hacia el backend.
8. Solo después decidir `REMOTE_READY`, intervalos de check-in y bloque de potencia final.

**No instalar todavía en el coche.** El CI del repositorio valida software; no valida corriente, temperatura, cobertura, protección automotriz ni reserva.
