# Guardian · componentes y compra por etapas

**Alcance:** un coche propio de 12 V; instalación fija únicamente a +12 V permanente y masa. Sin OBD, mechero, CAN ni intervención en sistemas del vehículo. **El software Python del repositorio es de banco:** no es firmware para ESP32.

## Comprar ahora: prueba de sobremesa, alimentada por USB

| Cant. | Pieza concreta | Motivo y coste de referencia | Enlace |
|---:|---|---|---|
| 1 | **LILYGO T-A7670E R2, variante `With GPS` para Europa** | Incluye ESP32-WROVER-E, LTE Cat-1 A7670E, GNSS, BLE y antenas LTE/GPS según la ficha del kit. Precio publicado desde **US$32,89**, comprobar cuánto cuesta exactamente la opción **E con GPS** y envío/IVA. **NO comprar `Without GPS`** ni confundir A7670E con A7670SA. | [Tienda](https://lilygo.cc/products/t-sim-a7670e) · [Ficha y bandas](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/) |
| 1 | **DFRobot Fermion LIS2DW12 breakout SEN0405** | Acelerómetro I²C/SPI, alimentación lógica 3,3 V, dispone de **INT1/INT2 expuestos** para despertar el ESP32 ante movimiento. Precio fabricante **US$3,90**; el chip aislado consume menos que el breakout. Preferible al Gravity SEN0409 si necesitamos el pin de interrupción accesible. | [Producto](https://www.dfrobot.com/product-2337.html) · [Pines](https://wiki.dfrobot.com/sen0405/) |
| 1 | SIM nano de datos **para particulares**, sin PIN o con PIN gestionado por firmware | Seleccionar operador después de recibir la placa y probar cobertura y APN. No presupuestar 1NCE como consumidor particular. | Operador de tu elección, cobertura verificada donde aparcas. |
| 1 | Cable USB de datos + alimentación USB estable, cables Dupont y protoboard | Firmware y conectividad **sin contacto con la batería del coche**. | Reutilizar lo que ya tengas. |

**No comprar duplicado:** el kit `With GPS` ya anuncia antena LTE, antena GPS, cable PH2.0 y headers. La placa no incluye SIM ni celda 18650. Confirmar el contenido del paquete recibido.

**Compatibilidad:** A7670E admite LTE FDD B1/B3/B5/B8/B20 según LILYGO. No elegir pines GPIO todavía: usar esquema y pinout de **la revisión física recibida**, pues varios GPIO están ocupados por el módem. El breakout SEN0405 requiere 3,3 V y comparte GND; conectar SDA/SCL y después INT1 a un GPIO compatible con wake tras verificar el pinout.

## Segunda compra: instalación fija, después del prototipo USB

| Cant. | Subsistema | Selección y condición mínima |
|---:|---|---|
| 1 | Arnés reversible a **+12 V permanente** y masa correcta | Derivador compatible con la caja de fusibles de **tu coche**, fusible independiente próximo al origen, cable automotriz, funda y conectores polarizados. No conectar a circuitos de seguridad. |
| 1 | **Entrada automotriz protegida y convertidor a la entrada admitida por LILYGO** | No sirve un buck de hobby sin más. Verificar tensiones de arranque/transitorios, protección ante inversión, cortocircuito, calor y picos de consumo del LTE; medir corriente de reposo del conjunto. La entrada 12 V **nunca** va directa a LILYGO. |
| 1 | Supervisor de baja tensión con histéresis + corte de **solo el ramal Guardian** | Debe cortar aunque se cuelgue el ESP32, tener corriente residual muy baja y rearme estable. Los umbrales se elegirán para el vehículo y su batería. |
| 1 | Reserva energética compatible con el circuito de carga de la placa y con la temperatura de montaje | El portaceldas LILYGO es para **18650 Li-ion 3,7 V, no LiFePO4**. No comprar una celda genérica antes de verificar química, características del cargador de la revisión recibida, protección térmica y ubicación segura. La conmutación de alimentación **puede reiniciar** la placa: persistir el aviso pendiente antes del cambio cuando sea posible y recuperarlo al arrancar. |
| 1 | Caja y fijación no conductora, material apto para calor interior | Diseñar después de medir placa, antenas, reserva y arnés. Evitar PLA estándar para un interior expuesto al sol. |

**No hay aún referencia de tienda segura para el conjunto de potencia y reserva.** El fusible, el DC/DC y la celda no se pueden comprar responsablemente con un precio de catálogo arbitrario sin saber su circuito completo y los picos reales. El único montaje inmediato autorizado en esta guía es **USB de sobremesa**. Piezas para fabricar en serie u homologar no forman parte de esta etapa.

## Presupuesto

La placa y sensor cuestan **desde ~US$36,79 en precio base de fabricante**, pero puede ser más para la variante con GPS; quedan fuera SIM, impuestos, transporte, herramientas, arnés, alimentación automotriz y reserva. **No presentar este subtotal como precio final del dispositivo.** Comparar el presupuesto de conjunto terminado con un tracker comercial antes de encargar una PCB propia.

## Referencias técnicas

- [LILYGO T-A7670X: variantes, bandas, esquemas y arranque](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/)
- [LILYGO: contenido del kit con GPS](https://lilygo.cc/products/t-sim-a7670e)
- [DFRobot SEN0405: pines INT1/INT2 y especificaciones](https://wiki.dfrobot.com/sen0405/)
- [Analog Devices: alimentación de localizadores automotrices](https://www.analog.com/en/resources/app-notes/an-2083.html)
