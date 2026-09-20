# GUARDIAN · Componentes y compra por etapas (v0.5)

**Fuente de verdad:** [Diseño personal completo v0.5](GUARDIAN_DISENO_PERSONAL_v0_5.md). Es un proyecto personal para un coche de 12 V, sin OBD, mechero ni intervención en sistemas de conducción. **Solo está preparado el software de banco: aún no hay firmware ni montaje físico.**

## Comprar ahora: banco de trabajo alimentado por USB

| Cant. | Producto concreto | Función y condiciones | Enlace |
|---:|---|---|---|
| 1 | **LILYGO T-A7670E R2 europea, variante `With GPS`** | ESP32-WROVER-E, LTE Cat-1 A7670E, BLE y GNSS. Confirmar variante E, `With GPS` y coste final con impuestos/transporte. El kit GPS anuncia antenas LTE y GPS: no comprar duplicadas. | [Tienda LILYGO](https://lilygo.cc/products/t-sim-a7670e) · [Guía y esquema](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/) |
| 1 | **Adafruit LIS3DH ref. 2809**, BricoGeek SEN-0185 | Acelerómetro I²C, 3,3 V y pin INT para despertar por movimiento. Es la **selección vigente** en lugar de DFRobot SEN0405; el firmware tendrá que usar LIS3DH. La placa puede traer tira de pines sin soldar; **no trae cables Dupont**. | [BricoGeek](https://tienda.bricogeek.com/acelerometros/1876-adafruit-lis3dh-acelerometro-3-ejes.html) · [Adafruit: conexión y pinout](https://learn.adafruit.com/adafruit-lis3dh-triple-axis-accelerometer-breakout) |
| 1 | **Dupont hembra-hembra 20 cm**, 40 piezas | Necesitamos cinco hilos: alimentación, masa, SDA, SCL e interrupción INT. El cable STEMMA QT de cuatro hilos **no sustituye el INT**. Confirmar si la LILYGO trae cabeceras soldadas. | [BricoGeek](https://tienda.bricogeek.com/cables/1363-cables-dupont-hembra-hembra-20-cm-40-unidades.html) |
| 1 | **Nano-SIM 4G** con datos, para particulares | Elegir operador después de comprobar bandas, cobertura y APN en tu zona. No presupuestar una oferta para empresas como compra particular. | Operador que tenga cobertura donde dejas el coche. |
| 1 | **Cable USB-C de datos + alimentación USB 5 V estable** | Programar y alimentar la LILYGO sin conectarla al coche. Verificar corriente suficiente para picos del módem. | Reutilizar si ya lo tienes. |
| 1 | **Soldador + multímetro** | Soldar pines del Adafruit si vienen sueltos y comprobar alimentación y ausencia de cortos. | Ya dispones de soldador; reutilizar multímetro si lo tienes. |

**No comprar ahora:** antenas GPS/LTE adicionales sin revisar el paquete real, protoboard si los cinco Dupont permiten unir las cabeceras con firmeza, una segunda placa GNSS, una placa de alimentación de protoboard ni accesorios OBD.

## Reserva para experimentar por USB (opcional, no apta automáticamente para el coche)

La LILYGO anunciada incorpora alojamiento para **una 18650 Li-ion nominal de 3,6/3,7 V** y circuito de carga/protección. La celda no está incluida. Para comprobar la reserva sobre la mesa puede elegirse una celda de marca y dimensiones compatibles, por ejemplo **Samsung INR18650-30Q de 3000 mAh**, comprobando terminal, dimensiones y las indicaciones de la revisión exacta de la LILYGO antes de colocarla. [Referencia comercial en España](https://bateriasonline.com/es/baterias-litio-recargable/bateria-litio-samsung-inr-18650-30q-3000mah-samsung-baterias-litio-recargable.html).

**No comprar para el portaceldas la batería BricoGeek con cable JST ni dar por compatible una 18650 protegida de 68–70 mm:** pueden no encajar o no tener el formato adecuado. No usar LiFePO4 en portaceldas/cargador especificado para Li-ion convencional, no soldar cables directamente a la celda y no invertir polaridad. La conmutación de fuente **puede reiniciar** LILYGO: los eventos deben persistirse y reenviarse tras reiniciar.

La temperatura es el problema del montaje en coche: la carga de Li-ion tiene un rango permitido específico y el interior del habitáculo puede excederlo. **Una celda apta para ensayo de interior no está aprobada como reserva permanente en el vehículo** hasta verificar emplazamiento, bloqueo de carga fuera de rango y protecciones del circuito.

## Compra posterior: montaje definitivo, todavía sin referencias cerradas

| Subsistema | Condición de selección |
|---|---|
| Arnés de alimentación | Derivación reversible desde circuito +12 V permanente no crítico, masa adecuada, fusible propio próximo al origen, cable automotriz protegido y conectores polarizados. **Nada de OBD ni toma de mechero.** |
| Entrada de potencia | Protección documentada contra polaridad inversa, transitorios, cortocircuito y calor; convertidor **12 V → tensión admitida por la LILYGO** capaz de soportar picos LTE y con reposo bajo. Nunca 12 V directos a la placa. |
| Supervisor UVLO | Corte físico e independiente del ESP32 **solo del ramal Guardian**, con histéresis, corriente residual muy baja y rearme estable. |
| Reserva final | Celda/carga/gestión de fuente como conjunto compatible con picos LTE y temperatura del emplazamiento. No asumir que el portaceldas de la placa resuelve la protección térmica de un coche. |
| Caja | Fijación positiva y material apto para la temperatura del lugar; diseñar después de recibir y medir la electrónica real. |

**Presupuesto:** el precio anunciado de una pieza no equivale al coste total. Verificar variante GPS, disponibilidad, envío, IVA, SIM y después el bloque eléctrico completo; no inventar un presupuesto definitivo sin seleccionar este último.

## Primera prueba tras recibir el pedido

USB sobre mesa → comprobar revisión/pines → ejecutar ejemplos oficiales LTE/GNSS → soldar pines LIS3DH → conectar 3,3 V, GND, SDA, SCL e INT a GPIO comprobado → generar un evento físico → integrarlo con transporte seguro. **El CI verde de `main` prueba únicamente el software Python simulado, no la electrónica.**
