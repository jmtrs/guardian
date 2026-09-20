# Guardian · alimentación y reserva para instalación personal

**Estado: decisión de arquitectura, NO instalación validada.** Complementa el [diseño personal v0.5](../GUARDIAN_DISENO_PERSONAL_v0_5.md), que sigue siendo la especificación funcional. Para interpretación de la electrónica ya publicada por LILYGO, consultar el [esquema V1.4 y las referencias verificadas](ESQUEMA_T_A7670X_V1_4.md). No se ha comprado ni probado en banco la T-A7670E R2 concreta, ni se ha cerrado un circuito de potencia automotriz.

## Decisión acordada para la primera versión personal

- **Mantener LILYGO T-A7670E R2 europea `With GPS` + Adafruit LIS3DH.** No comprar otra placa por anticipado.
- **Aprovechar una sola 18650 Li-ion en el alojamiento de LILYGO como reserva**, en vez de añadir por defecto una segunda batería/cargador externo. La celda es opcional solo durante desarrollo USB; para el uso final es un requisito funcional, sujeto a superar los ensayos eléctricos y térmicos.
- Aceptar que la transición 12 V → batería **puede reiniciar** ESP32/módem. El firmware tendrá evento pendiente persistido, detección de fuente, reconexión y reintento de alerta sin esperar al GPS. No prometer conmutación sin reinicio ni alerta garantizada sin cobertura.
- No perseguimos certificación comercial, pero sí un montaje duradero para permanecer **meses en el coche** sin agotar su batería ni cargar una celda fuera de sus límites.

## Diagrama funcional, no plano de cableado

```text
  +12 V PERMANENTE APTO DEL COCHE
                 │
  fusible propio junto al origen
                 │
  protección de entrada AUTOMOTRIZ
  (inversión, picos, cortocircuitos)
                 │
  corte por baja tensión INDEPENDIENTE
  con histéresis, solo del ramal Guardian
                 │
  convertidor estable de salida y
  corriente compatibles con la LILYGO
                 │
                 ▼
          LILYGO T-A7670E R2 ── I²C + INT ──► LIS3DH
             │            │
             │            ├──► LTE + GNSS + BLE
             │            └──► eventos persistidos
             ▼
  cargador integrado CN3065 (*verificar R2*)
             ▲
  inhibición TÉRMICA de carga por hardware
  basada en temperatura de la propia celda
             │
       18650 Li-ion, una celda,
       en alojamiento de LILYGO
```

No inyectar 12 V directamente en USB, `5V`, `VBAT` ni portabaterías; no unir una segunda fuente/cargador en paralelo. No conectar una LiFePO4 al cargador Li-ion de la placa. Elegir tensión, regulador, fusible y cableados tras medir el conjunto y consultar el circuito del vehículo. Si se pierde la principal, la 18650 alimenta la placa por su ruta original: **no hay un paquete externo adicional elegido**.

## Protección térmica: lo que está probado y lo que falta

En la **página 4 del esquema V1.4** figura `U7 CN3065`, cuya entrada `TEMP` (pin 1) va a masa mediante `N9 0R`: por tanto, **en ese diseño está deshabilitada la función de monitorizar temperatura durante la carga**. `U8 DW06D` protege eléctricamente la batería, pero no demuestra protección térmica. La ficha técnica del CN3065 describe cómo puede **suspender la carga** a través de `TEMP` cuando recibe una señal de temperatura válida. El ESP32 puede registrar una temperatura o una alarma; **un GPIO o software por sí solos no cortan la carga en el circuito V1.4**.

**Solución candidata, no implementada:** confirmar que la R2 real conserva cargador y red `N9`, y evaluar una NTC físicamente unida a la celda más red de acondicionamiento y corte independiente de firmware. La solución debe bloquear carga tanto por **frío como por calor**, detectar circuito abierto/cortocircuitado de la sonda y dejar alimentado Guardian desde los 12 V cuando la carga esté suspendida. Una NTC con resistencia sin cálculo ni ensayo no cumple esta exigencia. No publicar todavía valor de NTC, resistencias, GPIO ni instrucciones de retirada/soldadura de `N9`.

Si no es posible conseguir esa protección de forma **mecánica y eléctricamente fiable**, no se dejará una 18650 cargando meses en el coche: habrá que adoptar una ruta de carga protegida externa **aislando correctamente el cargador interno**, o cambiar la plataforma de potencia. No seguir cargando a ciegas ni tratar la telemetría de temperatura como barrera de seguridad.

**Límite físico:** detener la carga fuera de rango no hace automáticamente adecuada una celda para almacenamiento prolongado a temperaturas extremas. Elegir celda auténtica con ficha técnica, comprobar sus límites de carga, descarga y almacenamiento, fijar Guardian en un lugar seco y protegido del calor directo y medir allí la temperatura real durante condiciones representativas. No prometer autonomía tras corte hasta medir consumo y capacidad útil bajo esas condiciones.

## Firmware previsto (cuando exista firmware físico)

1. Persistir `event_id`, tipo de evento, contador y estado pendiente **antes** de comunicaciones costosas, con política de desgaste/atomicidad y recuperación ante corte durante escritura.
2. Detectar fuente principal presente/ausente, leer tensión de la reserva si la revisión lo permite y registrar temperatura si se añade una lectura **independiente de la protección térmica por hardware**.
3. En el arranque, recuperar eventos pendientes; ante caída principal, enviar aviso 4G autenticado y seguro antes de esperar GNSS; reconectar y continuar con posiciones fechadas si hay energía/cobertura.
4. Suprimir duplicados por `event_id` en el servidor sin perder reintentos; watchdog y modo de reserva con frecuencia de posición adaptativa según batería disponible.
5. Almacenar y avisar de sobretemperatura y pérdida de sonda. La lógica de software **no debe poder forzar la carga** si el hardware la ha inhibido.

## Condiciones de aceptación ANTES de dejarlo meses en el coche

| Ensayo | Resultado exigido |
| --- | --- |
| Identidad física de placa | Confirmar revisión R2, referencia real de U7, puente N9, polaridad y acceso práctico al circuito de carga con esquema/fotos; si no coincide, rediseñar antes de tocarla. |
| Carga y temperatura | Con celda y sensor adecuados, verificar frío, calor, retorno al rango y fallo de sonda. La corriente **de carga a la celda** cae a nivel de suspensión cuando corresponde, sin apagar la alimentación principal de Guardian. |
| Compatibilidad de la 18650 | Dimensiones y terminal encajan, corriente de pico del módem, protección mecánica, hoja de datos y temperaturas del emplazamiento verificadas. Sin soldar directamente a la celda. |
| Pérdida de 12 V | Repetir cortes y retornos de fuente; si se reinicia, recuperar evento y confirmar llegada de alerta real por LTE, incluida la prueba de corte durante escritura/envío. |
| Batería del coche | Medir reposo **del conjunto a 12 V**, corriente de cargador y fugas; el supervisor autónomo corta solo Guardian incluso con firmware bloqueado y no rearma oscilando. |
| Prueba prolongada | Ensayo térmico y funcionamiento continuo en banco; después instalación reversible revisada y comprobación periódica de consumo, tensión del coche, temperatura y salud de la celda. |

**Estado de avances:** solo el backend/simulador Python está probado en CI. Este documento no declara aprobados batería, temperatura, umbrales, funcionamiento LTE/GNSS real, autonomía o instalación. La compra inmediata de desarrollo sigue siendo LILYGO, LIS3DH, cinco Dupont, USB de datos y SIM; una 18650 auténtica puede comprarse para pruebas **sobre mesa** cuando se verifique el alojamiento. No comprar NTC o piezas de modificación del cargador hasta inspeccionar la unidad recibida.