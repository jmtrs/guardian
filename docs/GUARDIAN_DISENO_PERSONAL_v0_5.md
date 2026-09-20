# GUARDIAN
## Guía de construcción personal v0.5 · diseño, componentes, arquitectura y pruebas

**Fecha:** 20 de septiembre de 2026  
**Propósito:** un vigilante autónomo para un coche personal antiguo de 12 V, sin objetivo de comercialización por ahora.  
**Estado:** especificación actualizada; el código Python del repositorio solo simula eventos y prueba un receptor local. No hay firmware cargado ni pruebas de LTE/GNSS/acelerómetro en la LILYGO. Este documento sustituye la guía v0.4 entregada fuera del repositorio; se han corregido su antigua selección Waveshare y el acelerómetro inicialmente previsto.

> Regla de diseño: pocas piezas, funciones definidas, instalación reversible y protección que no dependa de que el firmware funcione. Guardian NO puede controlar el motor, arranque, dirección, frenos, inmovilizador o centralitas.

## 1. Qué hace y cómo se utiliza

| Situación | Comportamiento previsto | Límite |
|---|---|---|
| Aparcado y armado | Acelerómetro vigila movimientos, se supervisa la tensión del coche y se duerme la radio cuando procede. | El último contacto puede ser antiguo por ahorro energético. |
| Propietario presente | BLE puede detectar un teléfono conocido, pero **no desarma por sí solo**. | Inicio de viaje exige orden autenticada y confirmación del dispositivo. |
| Viaje autorizado | No avisa por vibraciones propias de la conducción. | Pérdida momentánea de BLE o LTE no revoca el viaje. |
| Movimiento sin autorización | Guarda evento, intenta avisar por 4G antes de esperar el GPS y después actualiza la posición. | El aviso puede demorarse por cobertura; no diagnostica por sí mismo un robo. |
| Alimentación desconectada o baja | Supervisor independiente corta **solo el ramal Guardian**; reserva intenta emitir una alerta. | No garantiza arranque del coche ni seguimiento indefinido. |
| Garaje/sin cobertura | Conserva eventos; informa de la fecha de la última posición GNSS válida. | Nunca presenta una ubicación antigua como actual. |

```text
APARCADO / ARMADO ── orden autenticada de la app ──► VIAJE AUTORIZADO
       ▲                                              │
       └──────── confirmación «Finalizar viaje» ◄──────┘
       │
       └── movimiento sin autorización ──► ALERTA ──► GNSS / SEGUIMIENTO

BATERÍA COCHE BAJA ──► CORTE AUTÓNOMO SOLO DE GUARDIAN ──► RESERVA / APAGADO
```

La primera versión utiliza «Iniciar viaje» y «Finalizar viaje» desde una app que hable con el dispositivo de forma autenticada. Una señal BLE, MAC, baliza o RSSI no demuestra identidad ni proximidad segura. No prometemos modo manos libres. Si se olvida finalizar el viaje, la app debe mostrar claramente que continúa autorizado; no rearmar arbitrariamente en semáforos. Antes del uso cotidiano hacen falta recuperación de móvil perdido y modo taller temporal.

## 2. Instalación prevista: exclusivamente 12 V permanente + masa

**No OBD, no mechero, no CAN, no empalmes a circuitos críticos.** El primer prototipo se construye por USB sobre la mesa, fuera del coche.

```text
+12 V PERMANENTE APTO DEL VEHÍCULO
        │
  derivación reversible apropiada
        │
  FUSIBLE PROPIO junto al origen
        │
  arnés protegido y polarizado
        │
  protección de entrada automotriz
        │
  supervisor de baja tensión autónomo + interruptor de Guardian
        │
  conversor regulado compatible con entrada y picos LTE de LILYGO
        │
        ├──────────► LILYGO T-A7670E R2 «With GPS» ──► LIS3DH
        │                         │
        │                         ├──► BLE / LTE / GNSS
        │                         └──► backend ──► móvil
        │
        └────► carga y reserva 18650 compatibles (sin retorno al coche)

MASA CORRECTA DEL VEHÍCULO ─────────────► retorno de Guardian
```

**Diagrama funcional, no plano eléctrico de montaje. Nunca llevar 12 V a la entrada USB/5 V de LILYGO.** Elegir circuito, derivador, fusible y sección de cable a partir del vehículo exacto y del conjunto eléctrico definitivo. El supervisor debe cortar aunque el ESP32 se bloquee y consumir muy poco tras el corte. Ubicación interior seca, firmemente sujeta, alejada de pedales, airbags, cableados críticos y calor excesivo; antenas alejadas de blindajes metálicos según recepción real. La instalación fija requiere revisión de un profesional de electricidad de automoción.

## 3. Componentes: compra ahora para la primera prueba

| Cantidad | Componente | Selección y razón | Compra/documentación |
|---:|---|---|---|
| 1 | **LILYGO T-A7670E R2, Europa, opción `With GPS`** | Placa con ESP32-WROVER-E, LTE Cat-1 A7670E, BLE y GNSS; verificar bandas/variante y disponibilidad en el carrito. **No comprar `Without GPS`**. La ficha anuncia antenas LTE y GPS para el kit GPS. | [LILYGO tienda](https://lilygo.cc/products/t-sim-a7670e) · [Ficha técnica](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/) |
| 1 | **Adafruit LIS3DH, ref. 2809** (BricoGeek SEN-0185) | Acelerómetro de tres ejes; I²C a 3,3 V y pin de interrupción para detectar movimiento y despertar al ESP32. Sustituye al DFRobot SEN0405; **el firmware deberá usar un controlador LIS3DH**. | [BricoGeek](https://tienda.bricogeek.com/acelerometros/1876-adafruit-lis3dh-acelerometro-3-ejes.html) · [Adafruit guía/pinout](https://learn.adafruit.com/adafruit-lis3dh-triple-axis-accelerometer-breakout) |
| 1 | Juego de **Dupont hembra-hembra 20 cm** | Cinco conexiones: VIN/3V, GND, SDA, SCL e INT. Comprobar nombres de pines y GPIO libres según revisión de LILYGO. | [BricoGeek](https://tienda.bricogeek.com/cables/1363-cables-dupont-hembra-hembra-20-cm-40-unidades.html) |
| 1 | USB-C **de datos** y fuente USB 5 V estable | Programación y pruebas de mesa. Evitar un cargador/puerto incapaz de suministrar los picos del módem. | Reutilizar si ya se tienen. |
| 1 | Nano-SIM 4G con datos para particulares | Probar APN, cobertura y bandas del módem donde sueles aparcar. | Operador según cobertura. |
| 1 | Soldador, estaño y multímetro | Soldar la tira de pines del LIS3DH; revisar si la LILYGO ya trae cabeceras montadas; comprobar conexiones sin cortos. | Reutilizar herramientas existentes. |

**Montaje:** el breakout Adafruit incluye pines para soldar, **no un cable Dupont preconectado**. El conector STEMMA QT, si se usa, no transporta la interrupción INT; para Guardian necesitamos esa quinta línea. No asignar GPIO de la LILYGO hasta comprobar el pinout de la revisión exacta, pues el módem ocupa varios pines. No pedir antenas extra sin comprobar el contenido del kit GPS recibido.

### Batería para pruebas sobre la mesa (opcional)

La LILYGO anunciada dispone de alojamiento para **una celda 18650 Li-ion nominal de 3,6/3,7 V** y un circuito integrado de carga: la celda no viene incluida. Para comprobar la reserva por USB, puede emplearse una celda nueva de marca reconocida, de dimensiones físicas que encajen sin forzar y capacidad de descarga compatible con los picos del módem, por ejemplo **Samsung INR18650-30Q 3000 mAh**, *después de verificar las indicaciones de batería/carga de la revisión realmente recibida*. Nunca LiFePO4 en ese alojamiento, baterías de procedencia desconocida, inversión de polaridad ni soldadura directa sobre la celda.

- [LILYGO: documentación y alimentación](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/).
- [Ejemplo de compra de Samsung INR18650-30Q](https://bateriasonline.com/es/baterias-litio-recargable/bateria-litio-samsung-inr-18650-30q-3000mah-samsung-baterias-litio-recargable.html): comprobar precio, proveedor, terminales y tamaño antes de pedir.
- La batería 18650 de BricoGeek que viene **con cable JST** no es una celda para colocar directamente en el portaceldas. Las celdas largas/protegidas pueden no caber; no forzar contactos.

**Distinción crucial:** una celda que sirve para probar la reserva en interior **no queda aprobada para carga continua dentro del coche**. La carga de una Li-ion habitual tiene límites térmicos; el habitáculo puede excederlos. Confirmar documentación del cargador de LILYGO, temperatura efectiva del emplazamiento y cómo se bloquea físicamente la carga fuera de rango. Cambiar entre USB y celda **puede reiniciar la placa**: el aviso de corte/pérdida debe persistirse y recuperarse al arrancar. No prometer transmisión garantizada después de retirar alimentación si el reinicio, la cobertura o la celda lo impiden.

### Comprar después, para instalación permanente

Arnés reversible a positivo permanente y masa, fusible propio, protección automotriz ante inversión/transitorios/cortocircuito, regulador para picos LTE, supervisor UVLO autónomo con histéresis y corte **solo de Guardian**, solución de carga/reserva apta para temperatura real, caja/fijación y antenas según ubicación. **No comprar un buck genérico, una 18650 o una caja definitiva como si fueran por sí mismos un sistema de potencia validado.** El tamaño del fusible, la sección de cable, los GPIO y los umbrales de batería se eligen con el vehículo y las revisiones de piezas reales.

**Presupuesto:** los precios del catálogo no son el coste final. Sumar variante GPS concreta, sensor, envíos, impuestos, SIM y finalmente alimentación/arnés/reserva/caja. No dar una cifra única fiable antes de cerrar el bloque de potencia.

## 4. Arquitectura de software

```text
LIS3DH ── I²C + INT ──► ESP32 (firmware por estados)
                                   │
          BLE ↔ app ── autorización │ ──► evento + contador persistido
                                   │                 │
    GNSS integrado ──► fix + hora ──┘           4G + TLS válido
                                                     │
                                               API / almacén
                                                     │
                                             alerta / mapa móvil
```

**Firmware pendiente:** módulos `motion`, `power`, `ble_auth`, `gnss`, `cellular`, `event_queue` y `device_state`. No incluir comunicaciones arbitrarias ni desarmado en el backend de telemetría. Guardar número de secuencia, evento pendiente y estado de sesión ante reinicios. Tiempo GNSS válido en cada fix; alerta inicial sin esperar coordenadas. Despertar por INT del LIS3DH en GPIO compatible y medir consumo real de la placa en sueño.

**Backend actual:** `guardian/` contiene un **simulador Python**, receptor HTTP restringido a `127.0.0.1`, HMAC por dispositivo, comprobación de secuencias para evitar replay, SQLite y Telegram opcional. Es un banco local: **no es firmware ESP32, no utiliza módem LTE ni implementa autorización teléfono→coche, y no se debe publicar por HTTP en Internet**. Para el dispositivo real: TLS con verificación, autenticación por dispositivo y secretos protegidos; no reutilizar una clave de demo.

**App futura:** muestra última comunicación, batería coche y reserva, estado armado/viaje, ubicación válida con hora, alertas y modo taller. El cambio de estado solo se muestra una vez **confirmado por Guardian**.

## 5. Bocetos de interfaz (no implementados)

```text
┌──────────────────────────────────────────┐
│ GUARDIAN · MI COCHE              ARMADO   │
├──────────────────────────────────────────┤
│ Último contacto: 18:42                   │
│ Batería coche: 12,6 V · lectura 18:42     │
│ Reserva: disponible                      │
│ Movimiento: sin incidencias              │
│                                          │
│ ÚLTIMA POSICIÓN CONOCIDA                 │
│ [               MAPA               ]     │
│ Fix GNSS: 18:38                          │
│                                          │
│           [ INICIAR VIAJE ]              │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ GUARDIAN                    VIAJE ACTIVO  │
├──────────────────────────────────────────┤
│ Inicio CONFIRMADO por Guardian           │
│ BLE perdido temporalmente: sin alarma    │
│           [ FINALIZAR VIAJE ]            │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ GUARDIAN                        ALERTA    │
├──────────────────────────────────────────┤
│ Movimiento sin autorización              │
│ Evento: 03:14   Recibido: 03:15          │
│ GPS: buscando posición reciente          │
│ Última posición válida: 02:55            │
│ [ VER SEGUIMIENTO ]  [ REVISADO ]         │
│ «Revisado» NO equivale a «desarmado»      │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ GUARDIAN                       ENERGÍA    │
├──────────────────────────────────────────┤
│ Batería coche: 12,6 V · 18:42             │
│ Fuente: principal                        │
│ Reserva: estado pendiente de telemetría  │
│ Umbral de corte: específico del coche    │
│ [ HISTORIAL DE TENSIÓN ]                 │
└──────────────────────────────────────────┘
```

No mostrar porcentaje de reserva si no existe medición fiable. Mostrar **hora de la lectura**, no solo valor, y distinguir «última posición» de «posición actual».

## 6. Orden de trabajo sencillo

1. **Banco USB:** recibir LILYGO versión GPS, LIS3DH, Dupont y SIM; verificar físicamente variante, esquema/pines y antenas. Cargar ejemplo oficial, registrar LTE/APN y obtener fix GNSS al aire libre sin publicar IMEI, SIM ni credenciales.
2. **Primer evento físico:** soldar cabeceras, conectar 3,3 V/I²C/INT; confirmar detección de movimiento y despertar. Persistir evento y hacerlo llegar por módem mediante conexión TLS y autenticación por dispositivo. Hasta entonces, el evento del repositorio sigue siendo simulado.
3. **Viajes autorizados:** implementar app BLE, desafío/respuesta, confirmación real y recuperación tras reinicios; modo taller y recuperación de teléfono antes del uso diario.
4. **Potencia:** cerrar esquema de entrada automotriz + supervisor independiente + conversor + reserva y gestión térmica. Comprobar en mesa polaridad, consumo total al aparcar, corte incluso si el ESP32 está detenido, corriente residual y envío/recuperación de evento al desconectar.
5. **Coche:** seleccionar circuito de 12 V permanente no crítico, masa y protección correctos para ese coche; revisión profesional, fijación mecánica y comprobación de consumo en reposo con contacto quitado.

**Objetivo de reposo de diseño:** ≤2 mA de media del conjunto alimentado a 12 V (incluye convertidor, supervisor, radio y recargas). **No es un dato demostrado de la LILYGO.** Si la placa de desarrollo no lo permite, conservarla como banco de firmware y revisar el hardware antes de la instalación. No hacen falta decenas de pruebas de viabilidad, pero las tres de potencia/corte/reserva son innegociables.

## 7. Referencias y estado

- [LILYGO: opciones de compra y GPS](https://lilygo.cc/products/t-sim-a7670e) · [LILYGO: esquemas y guías](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/).
- [Adafruit: LIS3DH y sus pines](https://learn.adafruit.com/adafruit-lis3dh-triple-axis-accelerometer-breakout).
- [ADI: alimentación de aplicaciones automotrices](https://www.analog.com/en/resources/app-notes/an-2083.html).
- [Componentes y compra por etapas](COMPONENTES.md) · [Proyecto y CI](../README.md).

**Hecho:** software de banco con pruebas automatizadas y documentación de selección. **Pendiente:** toda la integración física, firmware, app BLE y alimentación instalada. Un CI verde no prueba el dispositivo ni el montaje en el coche.
