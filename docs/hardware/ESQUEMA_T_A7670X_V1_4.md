# Esquema eléctrico de referencia: LILYGO T-A7670X V1.4

**Fuente primaria:** [esquema original del fabricante, PDF de 5 páginas](https://github.com/Xinyuan-LilyGO/LilyGo-Modem-Series/blob/main/schematic/esp32/T-A7670X-V1.4.pdf) ([PDF directo](https://raw.githubusercontent.com/Xinyuan-LilyGO/LilyGo-Modem-Series/main/schematic/esp32/T-A7670X-V1.4.pdf)). La [documentación oficial de la T-A7670X R2](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/) enlaza ese esquema V1.4. **No hay aquí un esquema eléctrico nuevo de Guardian ni un plano de montaje homologado.**

La copia del PDF aportada para analizar Guardian tiene 5 páginas y SHA-256 `cda319c68da7d274cafa096b133da35c335dc81101b66f28d4de57a0240efb36`. Esta referencia permite localizar el original de LILYGO sin confundir el PDF *V1.4* con una comprobación física de **cada unidad R2**. **La copia binaria no está almacenada en este repositorio:** el enlace superior conduce al original alojado por el fabricante.

## Lectura de la página 4: alimentación y batería

| Referencia visible en el esquema | Función o conexión documentada | Consecuencia para Guardian |
| --- | --- | --- |
| `U7 CN3065`, `VIN`, `BAT`, `TEMP` | Cargador Li-ion: entrada de carga, terminal de batería y pin de vigilancia térmica. | Su función térmica **no se presupone activa** en la placa. |
| `N9 0R`, desde `TEMP` a `GND` | El esquema muestra `TEMP` unido a masa mediante un puente de 0 Ω. | Según el [datasheet del CN3065](https://files.seeedstudio.com/wiki/Lipo_Rider_Pro/res/DSE-CN3065.pdf), poner `TEMP` a masa **deshabilita** el control de temperatura, no la carga. |
| `U8 DW06D` | Circuito de protección eléctrica de la ruta de batería según el diseño de referencia. | No equivale a supervisión térmica verificada de la celda. |
| `D18`, `Q5`, `Q6`, `DVDD4V2` | Ruta de selección/alimentación desde USB y batería. | La conmutación de fuentes y posibles reinicios se ensayarán en la revisión recibida. |
| `IO35` y divisor `R7/R9` | Lectura analógica de tensión según el esquema. | Leer tensión por firmware no permite deducir ni bloquear por sí solo la temperatura de carga. |

La página 4 **no muestra un GPIO del ESP32 que controle directamente una entrada `CE/EN` del CN3065**. Apagar la alimentación principal para intentar suspender la carga podría hacer que Guardian pasase a consumir la reserva. **No conectar una NTC directamente a un GPIO esperando que corte la carga.**

## Lo que NO prueba este documento

- Que el diseño de carga o el montaje de una **T-A7670E R2 comprada hoy** coincidan punto por punto con esta V1.4. Comprobar foto legible de ambas caras, referencia del cargador, puente `N9`, continuidad de `TEMP` y cualquier esquema actualizado del fabricante.
- Que sea seguro retirar `N9` y soldar una NTC sin calcular la red, sus fallos y los umbrales concretos de la celda.
- Que el CN3065 tenga ya una desconexión térmica funcional de origen, que la reserva sea apta para calor de coche, o que el reinicio en conmutación esté eliminado.

**Decisión de proyecto y criterios de instalación:** [ALIMENTACION_Y_RESERVA.md](ALIMENTACION_Y_RESERVA.md). Si se requiere una copia del PDF dentro de Guardian, debe incorporarse desde un entorno Git capaz de subir binarios y conservarse esta URL de procedencia; no renombrar este fichero Markdown como `.pdf`.