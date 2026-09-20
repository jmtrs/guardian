# Guardian · guía personal de diseño y montaje

**Uso:** un coche propio antiguo de 12 V. **Estado:** simulador de alertas Python probado; electrónica real no integrada. No es una alarma certificada ni un producto listo para montar. [Compra por etapas](COMPONENTES.md).

## Qué hará

- **Aparcado:** vigila movimiento con un LIS2DW12 y tensión de la batería principal, reduciendo actividad del módem/GNSS.
- **Uso autorizado:** la app exige una acción intencional «Iniciar viaje» y Guardian la confirma criptográficamente; perder Bluetooth durante el trayecto no provoca robo ficticio. **Detectar una MAC, beacon o RSSI jamás desarma.** Si se olvida finalizar viaje se muestra ese estado sin ocultarlo.
- **Movimiento sospechoso:** registra localmente, intenta enviar alerta *antes* de esperar al GPS, después solicita GNSS y transmite posiciones válidas mientras haya energía y cobertura.
- **Batería baja o cable de alimentación desconectado:** un circuito independiente del ESP32 desconecta **solo Guardian** de la batería del coche; una reserva protegida intenta un aviso y termina su misión. Guardian no garantiza que el coche vaya a arrancar si la batería ya está degradada.
- **Sin red o GPS:** guarda evento y muestra la edad de la última posición conocida; nunca llama «actual» a una posición antigua.

**No:** OBD, mechero, CAN, inmovilizar, abrir puertas, controlar el motor, vídeo o audio.

## Conexión física definitiva (diagrama funcional, no cableado homologado)

```text
+12 V PERMANENTE APTO del coche ── fusible de derivación propio ── conector polarizado ─┐
                                                                                       ▼
MASA del vehículo correctamente seleccionada ───────────────────────────────► [GUARDIAN]
                                                                      entrada automotriz
                                                                      protección + filtro
                                                                              │
                                                         supervisor autónomo baja tensión
                                                                              │
                                                                   convertidor para placa
                                                                              │
                                                                LILYGO + sensor LIS2DW12
                                                                              ▲
                                                             reserva auxiliar protegida
```

**Nunca alimentar la LILYGO directamente desde los 12 V.** Se elige circuito original, adaptador de fusible, calibre y masa a partir del esquema eléctrico del vehículo y consumo final, no con una receta universal. El supervisor no puede cortar energía al coche: solo a nuestro accesorio. Instalación fijada, seca, alejada de airbags y pedales. Verificar si el vehículo tiene sensor inteligente en el borne negativo para no puentearlo accidentalmente.

## Dónde está cada responsabilidad

```text
SENSOR LIS2DW12 ── interrupción ──► ESP32-WROVER-E ── evento persistido ──► LTE
                                         │                                  │
                                  BLE / sesión local                  servidor propio
                                         │                                  │
                                móvil con orden autenticada       alerta y mapa en móvil
                                         │
GNSS integrado ── lat/lon + hora de fix ─┘

BATERÍA COCHE ── supervisor INDEPENDIENTE ── alimentación Guardian ── reserva
```

GNSS calcula una ubicación a partir de los satélites, sin SIM; LTE + SIM transmiten los datos. En garajes puede faltar cualquiera de las dos señales. La LILYGO escogida es ESP32-WROVER-E y módem A7670E; **no ESP32-S3**. La variante `With GPS` ya incluye antenas LTE y GPS según fabricante.

## Seguridad y comodidad realistas

Primera versión personal: BLE es solamente pista de presencia. Para iniciar viaje se necesita una **orden autenticada, confirmada por el propio dispositivo**. No existe ningún comando de arranque, bloqueo o desactivación del coche. El código actual solo implementa firma HMAC de **telemetría simulada al servidor local**; todavía **no** tiene autorización app↔dispositivo ni claves físicas aprovisionadas, por tanto no debe confundirse una demo exitosa con vigilancia segura real. El servidor Python escucha únicamente en localhost: publicar HTTP sin TLS está prohibido.

Más adelante: app móvil con canal BLE autenticado, credenciales distintas por usuario, revocación, recuperación ante teléfono perdido y modo taller temporal. Si se exige *manos libres* sin tocar el móvil, se reevalúa UWB seguro y su coste: BLE RSSI no demuestra distancia.

## Energía: criterio sencillo, imposible de omitir

```text
Si tensión principal válida: placa alimentada por conversor protegido; reserva mantenida por sistema compatible.
Si tensión cae sostenidamente: registrar/avisar; supervisor corta ramal principal aunque se cuelgue firmware.
Si se pierde +12 V: la reserva intenta emitir aviso; si hay reinicio de la LILYGO se recupera evento persistido.
Si no hay cobertura o se acaba la reserva: guarda evento si hay energía y termina en apagado seguro.
```

La LILYGO dispone de alojamiento 18650, pero **no** admite sustituir la química por LiFePO4 arbitrariamente. La reserva y carga tienen que ser compatibles entre sí y con las temperaturas del emplazamiento. Su conmutación de alimentación puede provocar reinicio. El consumo medio del conjunto en aparcamiento de **≤2 mA** es un objetivo, no un resultado medido. Antes de instalar bastan tres pruebas dirigidas: cableado y polaridad; consumo/corte por tensión con firmware detenido; aviso al retirar alimentación y verificación térmica de reserva. Sin pasar estas pruebas, no conectarlo al coche.

## Bocetos de la aplicación (diseño, no pantallas implementadas)

```text
┌─────────────────────────────────────┐
│ GUARDIAN · MI COCHE        ARMADO    │
├─────────────────────────────────────┤
│ Último contacto: 18:42              │
│ Batería coche: 12,6 V · 18:42        │
│ Reserva: disponible                 │
│ Movimiento: sin incidencias         │
│                                     │
│ ÚLTIMA POSICIÓN CONOCIDA            │
│ [             MAPA             ]    │
│ Fix registrado: 18:38               │
│                                     │
│         [ INICIAR VIAJE ]           │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ GUARDIAN              VIAJE ACTIVO  │
├─────────────────────────────────────┤
│ Orden CONFIRMADA por Guardian       │
│ Pérdida breve de BLE: no es robo    │
│         [ FINALIZAR VIAJE ]         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ GUARDIAN                  ALERTA     │
├─────────────────────────────────────┤
│ Movimiento sin autorización         │
│ Evento: 03:14 / recibido: 03:15     │
│ GPS: buscando nueva posición        │
│ Última posición válida: 02:55       │
│ [ VER HISTORIAL ]  [ REVISADO ]     │
│ «Revisado» no significa «desarmado»  │
└─────────────────────────────────────┘
```

## Orden de implementación sin sobreingeniería

1. **Ahora, sin coche:** obtener LILYGO con GPS, SEN0405 y SIM. Alimentar por USB; usar ejemplos oficiales para AT/IMEI (no publicarlo), red 4G y fix GNSS al aire libre. Comprobar pines de **la revisión recibida** antes de I²C/INT1.
2. **Evento real:** montar sensor 3,3 V; configurar wake-up, registrar evento en memoria persistente y enviar telemetría firmada al backend con transporte TLS válido. El simulador Python actual es referencia del contrato, **no firmware cargable al ESP32**.
3. **Autorización real:** implementar app local BLE y desafío firmado, persistencia de sesión y recuperación tras reinicio. Nunca desarmar por beacon.
4. **Energía:** diseñar bloque automotriz, supervisor autónomo y reserva compatibles; medir reposo, corte y pérdida de alimentación sobre la mesa. No usar celdas sueltas en el coche hasta cerrar esta etapa.
5. **Instalación:** caja definitiva y arnés reversible al +12 V permanente y masa correctos, supervisión de consumo del coche con contacto quitado; revisar fijación, temperatura y antenas.

**Definición de terminado de la etapa actual:** PR con simulador y CI verde, compra identificada y documentación honesta; **ningún firmware físico, instalación, aviso real por LTE ni aplicación móvil se declaran completados.**

## Fuentes de hardware

[LILYGO R2](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/) · [kit With GPS](https://lilygo.cc/products/t-sim-a7670e) · [DFRobot SEN0405](https://wiki.dfrobot.com/sen0405/) · [ejemplo de alimentación automotriz de Analog Devices](https://www.analog.com/en/resources/app-notes/an-2083.html).
