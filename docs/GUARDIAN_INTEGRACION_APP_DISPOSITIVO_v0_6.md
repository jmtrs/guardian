# GUARDIAN v0.6
## Integración de app, dispositivo, seguridad y energía

**Fecha:** 22 de septiembre de 2026  
**Estado:** arquitectura de integración y plan de validación. La app y el backend existen; el firmware físico, el enlace LTE/GNSS real, la autorización BLE y la alimentación automotriz siguen pendientes de banco.  
**Ámbito:** proyecto personal para un vehículo de 12 V. Guardian no controla motor, arranque, dirección, frenos, inmovilizador, CAN ni centralitas.

> Principio rector: Guardian nunca debe comprometer la batería de arranque para mantener una función de comodidad. La detección de movimiento y la protección del coche son prioritarias; el wake remoto inmediato solo se habilita si demuestra un consumo compatible con el presupuesto energético real.

---

## 1. Estado real del repositorio revisado

La documentación v0.5 describe todavía parte de la app como futura, pero el repositorio ya contiene una primera app funcional y un backend real.

### App móvil actual

En `mobile/` existe una app Expo con:

- login por OTP de email mediante Better Auth;
- sesión persistida en `expo-secure-store`;
- dashboard con estado, último contacto, batería, eventos y ubicación;
- recuadros reordenables;
- acción Iniciar / Finalizar viaje;
- mapa MapLibre con OpenFreeMap;
- rastro de posiciones;
- reverse-geocode mediante Nominatim;
- enlaces explícitos a Google Maps y Waze;
- historial de eventos;
- tema configurable, idioma ES/EN y logout.

La app consulta el backend cada 5-10 s cuando las pantallas están abiertas. **Ese polling es app -> backend y debe seguir leyendo únicamente estado ya almacenado en servidor; no debe generar comandos ni despertar el coche.**

### Backend actual

En `backend/` existe NestJS + Prisma + PostgreSQL con:

- Better Auth y OTP;
- autorización por propietario de dispositivo;
- ingesta `POST /v1/events` firmada con HMAC-SHA256 sobre el body crudo;
- secuencia monotónica y anti-replay atómico;
- validación de timestamps, batería y coordenadas;
- ocultación del secreto del dispositivo en las respuestas normales;
- última posición, batería y último contacto denormalizados;
- eventos y posiciones;
- `TripAuthorization`;
- endpoints actuales `trip/start` y `trip/end`.

El banco Python continúa siendo útil como implementación de referencia y simulador.

### Seguridad que ya está bien encaminada

- La sesión de la app se guarda en SecureStore, no en AsyncStorage plano.
- El backend valida propiedad antes de devolver datos.
- Un deviceId desconocido y una firma incorrecta producen una respuesta equivalente en ingesta, evitando enumeración trivial.
- La firma usa comparación temporalmente segura.
- El avance de secuencia y la escritura del evento están dentro de una transacción.
- El OTP tiene caducidad e intentos limitados.
- El OTP fijo `000000` existe solo en entorno no productivo.

### Huecos encontrados que v0.6 debe resolver

1. **El estado de viaje actual es solo servidor.**  
   `POST /v1/devices/:id/trip/start` cambia `Device.state` a `TRIP` y la app hace update optimista. El dispositivo físico no confirma nada. Esto contradice la regla previa de que Guardian debe confirmar un cambio de seguridad.

2. **No existe canal backend -> dispositivo.**  
   Hay telemetría del dispositivo hacia el backend, pero aún no hay cola de comandos, ACK, expiración ni `LOCATE_NOW`.

3. **No existe wake remoto validado.**  
   La T-A7670E dispone de señales de módem útiles para sleep/wake, pero el método exacto, consumo y comportamiento con nuestra revisión y ruta de alimentación deben medirse.

4. **El secreto HMAC se almacena actualmente en claro en PostgreSQL.**  
   El propio schema lo marca como TODO. Es aceptable para banco local, no para un backend expuesto.

5. **CORS está abierto con `app.enableCors()`.**  
   No sustituye a autenticación, pero producción debe restringir orígenes y separar configuración de desarrollo.

6. **La ubicación exacta sale a terceros en la app actual.**  
   Nominatim recibe lat/lon para reverse-geocode. Google Maps/Waze reciben las coordenadas cuando el usuario pulsa sus botones. Debe ser una decisión explícita de privacidad.

7. **La alerta actual no tiene estado propio.**  
   El dashboard solo considera alerta si el dispositivo está `ARMED` y el evento más reciente es `suspected_movement`. Un `heartbeat` posterior puede hacer desaparecer visualmente la alerta, y `power_lost` no activa hoy el estado rojo del dashboard. Debe existir un incidente persistente independiente del último evento.

8. **`WORKSHOP` existe en backend pero la app no lo representa correctamente.**  
   La lógica actual termina mostrando cualquier estado que no sea `TRIP` como `ARMADO`. No se habilitará modo taller real hasta diseñar expiración y confirmación en dispositivo.

9. **El rastro actual son las últimas posiciones, no necesariamente un viaje o incidente concreto.**

10. **La telemetría de batería es ambigua.**  
    El protocolo actual solo tiene `batteryMv`, pero el producto necesita distinguir como mínimo tensión de batería del coche, tensión/estado de reserva y fuente activa. No debe mostrarse un único campo “Batería” sin semántica física definida.

11. **El reverse-geocode actual no garantiza la política de Nominatim.**  
    `staleTime` evita repetir una misma consulta, pero varias filas/posiciones distintas pueden lanzar peticiones en paralelo. Antes de producción hay que centralizar cache + rate limit o retirar el reverse-geocode masivo del cliente.

12. **Provisioning todavía no equivale a pairing seguro.**  
    La revisión corrigió el binding `@Body()` de `POST /v1/devices`, pero falta un flujo de claim/pairing con presencia física y credenciales de un solo uso.

13. **OTP de producción queda cerrado hasta implementar entrega real.**  
    La revisión impide que códigos OTP terminen en logs de producción. Mientras no exista un transporte real de email, producción debe fallar de forma cerrada en vez de degradar a consola.

14. **La documentación de componentes v0.5 estaba desactualizada.**  
    `COMPONENTES.md` se actualiza junto con v0.6 y pasa a ser la fuente vigente de compra/banco.

---

## 2. Componentes cerrados para la siguiente fase

### Guardian físico

- **LILYGO T-A7670E R2 europea, variante `With GPS`**.
- **LIS3DH** en breakout de 3,3 V con `INT1/INT2` accesibles.
- Nano-SIM 4G.
- Antenas LTE/GNSS adecuadas a la variante recibida.
- Una 18650 como reserva **solo si** el bloque térmico de carga queda validado por hardware.
- Alimentación final desde 12 V permanente mediante fusible, protección automotriz, UVLO autónomo y conversor de muy bajo consumo.

### Banco de medida, no parte del coche

- **ESP32-S3 N16R8** externa como registrador.
- **INA219 con shunt R100 = 0,1 ohm**.
- Mac por USB.
- Fuente estable para las pruebas.

El ESP32-S3 externo lee el INA219 y envía CSV/telemetría al Mac. No debe alimentarse desde el ramal que se está midiendo.

El INA219 es suficiente como **instrumento de cribado** para distinguir órdenes de magnitud y calcular consumo medio/energía. Con R100 su resolución física y la tolerancia del módulo genérico hacen que una lectura cercana al gate de 2 mA deba confirmarse con multímetro calibrado o instrumental mejor antes de aprobar el coche. Tampoco sustituye a un osciloscopio/profiler para capturar picos LTE muy breves. A corrientes LTE altas, el shunt de 0,1 Ω introduce caída de tensión y esa caída también debe registrarse.

---

## 3. Dos máquinas de estados, no una sola

Seguridad y energía son conceptos distintos y no deben mezclarse.

### Estado de seguridad

```text
ARMED
  |
  +-- autorización local válida --> TRIP
  |
  +-- movimiento no autorizado --> incidente ALERT
  |
  +-- modo taller temporal ------> WORKSHOP

TRIP ---- finalización confirmada ----> ARMED
WORKSHOP ---- expiración/fin ----------> ARMED
```

`ALERT` no debe sustituir permanentemente a `Device.state`. Es mejor modelarlo como **incidente** con fecha de apertura, causa y posible reconocimiento/cierre.

### Estado energético

```text
DEEP          ESP32 deep sleep, GNSS OFF, módem OFF
REMOTE_READY  ESP32 sleep, GNSS OFF, módem registrado en sleep
ACTIVE        CPU + radio según trabajo
RESERVE       alimentación principal perdida; política agresiva de ahorro
```

Así un dispositivo puede estar, por ejemplo:

```text
security = ARMED
power    = DEEP
```

o:

```text
security = ARMED
power    = REMOTE_READY
```

sin cambiar la semántica de la alarma.

---

## 4. Comportamiento por defecto al aparcar

El comportamiento base debe ser conservador:

```text
Finalizar viaje confirmado
        |
        +--> guardar última posición válida de aparcamiento
        +--> GNSS OFF
        +--> BLE OFF salvo ventana explícita
        +--> LIS3DH low-power + INT armado
        +--> ESP32 deep sleep
        +--> módem:
               REMOTE_READY solo si pasa presupuesto energético
               DEEP/OFF si no lo pasa
```

Abrir la app y navegar por dashboard, historial o mapa **no despierta Guardian**. La app muestra datos almacenados en backend con su hora real.

Debe distinguir siempre:

- `Última posición conocida`;
- hora del fix GNSS;
- hora del último contacto;
- `Solicitando ubicación...`;
- `Ubicación actualizada` solo después de recibir un fix posterior a la solicitud.

Nunca presentar una posición antigua como “actual”.

---

## 5. Wake por movimiento: función primaria

El LIS3DH es el mecanismo de vigilancia permanente de bajo consumo.

```text
movimiento
   |
LIS3DH INT1
   |
ESP32 wake
   |
persistir evento/estado primero
   |
determinar si existe autorización local válida
   |
   +-- sí --> TRIP / continuar
   |
   +-- no --> suspected_movement
              |
              +--> despertar/conectar LTE
              +--> enviar alerta sin esperar GNSS
              +--> encender GNSS
              +--> enviar posición cuando exista fix
```

El evento se persiste antes de comunicaciones costosas para sobrevivir a reset, pérdida de fuente o cobertura.

Los umbrales, duración y debounce del LIS3DH se determinan con el coche real. No se fijan por intuición.

---

## 6. Autorización de viaje: corregir el flujo actual

**El backend no debe ser la autoridad que desarma Guardian. El dispositivo es la autoridad final de su estado físico.**

### Flujo deseado

1. Usuario autenticado pulsa **Iniciar viaje**.
2. La app entra en modo “esperando Guardian”.
3. Se establece proximidad local BLE con el dispositivo.
4. App y Guardian realizan desafío/respuesta usando credenciales de pairing.
5. Guardian decide localmente si acepta `START_TRIP`.
6. Guardian cambia a `TRIP`, persiste el estado y devuelve ACK.
7. Guardian envía al backend un evento/estado firmado.
8. Solo entonces la app muestra **VIAJE AUTORIZADO** como confirmado.

```text
APP --sesión--> backend            (identidad de usuario)
APP <--BLE autenticado--> GUARDIAN (presencia local)
                         |
                         +--> TRIP persistido
                         +--> evento firmado
                                  |
                                  v
                               backend
                                  |
                                  v
                           app = CONFIRMADO
```

La mera proximidad, una MAC BLE o un RSSI alto **no son autenticación**.

### Pairing inicial y recuperación

El pairing no puede consistir en “ver un BLE y asociarlo”. La primera vinculación debe requerir **presencia física** y una credencial de un solo uso o ventana de pairing explícita. Una vez reclamado el dispositivo, el pairing abierto se cierra.

La recuperación por móvil perdido debe requerir un procedimiento deliberado de re-pairing con acceso físico al Guardian; no una API remota que entregue la clave BLE existente.

Las credenciales locales se guardan en SecureStore en el móvil. En el firmware se evaluarán Secure Boot y Flash Encryption del ESP32 antes de considerar resistente el secreto ante acceso físico al dispositivo.

### Primer movimiento del propietario

Un ESP32 en deep sleep no mantiene BLE activo. Por eso la app puede preparar una intención local y esperar a que el LIS3DH despierte Guardian al abrir/entrar/mover ligeramente el coche. Tras despertar, Guardian abre una ventana BLE corta para completar el desafío.

La autorización local **no debe depender de que haya Internet o cobertura LTE**: un teléfono ya emparejado debe poder autorizar el viaje localmente y sincronizar el resultado con backend después.

Debe existir una ventana transitoria `PREALERT` muy breve y medible:

- el movimiento se persiste localmente desde el primer instante;
- si llega autorización BLE válida, pasa a `TRIP`;
- si no llega, genera/transmite la alerta.

La duración exacta se decide en pruebas para no degradar la detección antirrobo.

### Finalizar viaje

También debe terminar con confirmación del dispositivo. No basta con actualizar PostgreSQL.

### Modo taller

`WORKSHOP` debe ser:

- explícito;
- temporal;
- con expiración almacenada en el dispositivo;
- visible de forma prominente en la app;
- nunca activado por mera proximidad.

---

## 7. Localización remota desde la app

`LOCATE_NOW` sí puede ser remoto porque **no desarma el vehículo ni cambia su política de alarma**.

### API conceptual

```http
POST /v1/devices/:id/commands/locate
```

Respuesta inmediata:

```json
{
  "commandId": "...",
  "status": "PENDING",
  "expiresAt": "..."
}
```

La app muestra:

```text
SOLICITANDO UBICACIÓN
Esperando a Guardian...
Última posición conocida: 13:42
```

No mueve el marcador a una supuesta posición nueva hasta recibir un `gnss_fix` relacionado con ese comando.

**El protocolo v1 actual no conserva un `commandId`/correlation id en los eventos.** Antes de implementar `LOCATE_NOW` hay que extender el contrato de evento o crear un mensaje de resultado específico que permita correlacionar de forma inequívoca solicitud, fix y ACK.

### Flujo del dispositivo

```text
APP
 |
HTTPS
 v
BACKEND
 |
+--> guarda LOCATE_NOW con TTL corto
 |
+--> wake best-effort si REMOTE_READY está habilitado
             |
             v
          Guardian
             |
             +--> establece TLS saliente
             +--> autentica dispositivo
             +--> consulta comandos pendientes
             +--> valida tipo + id + expiración
             +--> GNSS ON
             +--> timeout finito
             +--> POST evento gnss_fix + commandId
             +--> ACK
             +--> GNSS OFF
             +--> sleep
```

La señal que provoca el wake **no es una autorización**. SMS, RI, notificación de red o cualquier mecanismo similar solo pueden significar “despierta y pregunta al backend”. La orden real siempre se obtiene por el canal autenticado.

---

## 8. Remote wake: opcional y condicionado al consumo

La placa oficial expone señales de módem DTR/RI y LILYGO publica ejemplos de `ModemSleep`. **La existencia de RI no demuestra por sí sola que un paquete IP arbitrario pueda despertar Guardian**: hay que verificar qué eventos/URC del A7670E pueden activar RI en el modo y firmware concretos, y qué mecanismo de red usaremos para provocarlos. Además, LILYGO documenta para T-A7670X que el módem no entra en sleep correctamente cuando la placa está alimentada por USB-C/VBUS sin la solución de hardware indicada por el fabricante. Esto es un **riesgo central**, porque la instalación normal también necesitará alimentación externa.

Por tanto no se declara todavía:

> “Guardian siempre puede despertarse remotamente de forma instantánea”.

Se declara:

> “Guardian podrá usar wake remoto inmediato únicamente si la unidad real, el firmware y la ruta de alimentación final mantienen el consumo dentro del presupuesto”.

### Dos modos posibles

#### A. REMOTE_READY

Si la medición demuestra consumo aceptable:

```text
ESP32 deep/light sleep según validación
A7670E registrado en LTE sleep
GNSS OFF
LIS3DH ON
```

`REMOTE_READY` puede reducir mucho la latencia, pero **no se promete “en segundos”**: registro de red, cobertura, entorno GNSS e interior de garaje pueden hacer que la operación tarde hasta el timeout/TTL o falle. La UI debe mostrar progreso y la última posición válida mientras espera.

#### B. DEEP

Si el módem registrado eleva demasiado el consumo:

```text
ESP32 deep sleep
A7670E OFF
GNSS OFF
LIS3DH ON
```

Los comandos remotos quedan pendientes hasta:

- próximo check-in periódico;
- despertar por movimiento;
- otro despertar legítimo.

La seguridad antirrobo no se degrada, porque el movimiento despierta directamente por hardware.

El intervalo de check-in no se fija antes de medir. Se elige después de obtener mAh/día reales.

---

## 9. Cola de comandos segura

No crear un endpoint genérico que ejecute acciones arbitrarias.

### Tipos permitidos inicialmente

```text
LOCATE_NOW
```

Después, solo si son necesarios:

```text
REQUEST_STATUS
ROTATE_DEVICE_KEY
```

Los cambios de seguridad `START_TRIP`, `END_TRIP` y `WORKSHOP` deben usar el flujo local/confirmado y no convertirse en simples comandos remotos equivalentes.

### Modelo conceptual

```text
DeviceCommand
- id
- deviceId
- type
- status: PENDING | DELIVERED | ACKED | EXPIRED | FAILED
- requestedBy
- createdAt
- expiresAt
- deliveredAt
- ackedAt
- payload limitado y validado
- result limitado y validado
```

Reglas:

- TTL corto;
- idempotencia por `commandId`;
- nunca reejecutar un comando ACKed;
- límite de pendientes por dispositivo;
- rate limit por usuario/dispositivo;
- auditoría de quién pidió cada comando;
- payload con schema estricto;
- ningún shell, URL arbitraria, AT command arbitrario o código remoto.

---

## 10. Autenticación dispositivo <-> backend

El HMAC actual es una buena base para telemetría, pero v0.6 debe separar direcciones y propósitos.

### Requisito mínimo

- TLS con verificación completa del certificado.
- Secreto único por dispositivo.
- No reutilizar claves de demo.
- Clave fuera de logs.
- Rotación recuperable.
- Servidor nunca devuelve el secreto después del provisioning.

### Evolución recomendada

A partir de un secreto raíz por dispositivo:

```text
K_root
  |
  +-- HKDF("guardian-event-v1")   --> K_event
  +-- HKDF("guardian-command-v1") --> K_command
  +-- HKDF("guardian-ble-v1")     --> K_ble
```

Así una clave usada en un contexto no se reutiliza directamente en otro.

El secreto raíz/derivados del backend deben almacenarse cifrados en reposo antes de desplegar Internet público. Para un despliegue personal inicial puede usarse una master key fuera de la base de datos; si se migra a cloud, usar un servicio de secretos/KMS.

---

## 11. App: cambios concretos sobre lo que ya existe

La app actual no se rehace. Se evoluciona.

### Dashboard

Mantener:

- tarjetas reordenables;
- estado;
- batería;
- eventos;
- última posición;
- CTA de viaje.

Añadir:

- hora visible del último fix;
- estado energético si es útil: `ahorro`, `remoto disponible`, `reserva`;
- botón **Actualizar ubicación**;
- estados `PENDING / WAITING / UPDATED / FAILED`;
- indicador claro cuando una lectura es antigua.

### Botón Iniciar/Finalizar viaje

Eliminar el significado actual de “POST correcto = viaje confirmado”.

La UI puede seguir siendo rápida, pero debe distinguir:

```text
SOLICITANDO...
ESPERANDO GUARDIAN...
VIAJE CONFIRMADO
```

Un update optimista puede representar “solicitud iniciada”, no el estado físico final.

### Mapa

Mantener MapLibre/OpenFreeMap.

Cambiar el rastro para poder mostrar:

- posiciones de un viaje concreto;
- posiciones de un incidente concreto;
- no simplemente las últimas N posiciones mezcladas.

### Alertas

Crear concepto de incidente:

```text
OPEN -> ACKNOWLEDGED -> CLOSED
```

“Revisado” no desarma Guardian.

Esto corrige dos defectos actuales de UI: un heartbeat posterior puede ocultar una alerta de movimiento y `power_lost` no activa por sí solo el estado rojo del dashboard.

### Taller

Mientras `WORKSHOP` no tenga expiración y confirmación física, la app no debe presentarlo como una función terminada. Cuando se implemente, debe mostrarse como estado propio y nunca caer visualmente a `ARMADO`.

### Polling

El polling actual de 5-10 s puede mantenerse durante desarrollo porque consulta solo PostgreSQL/backend.

En una fase posterior, las alertas reales deberían llegar por push al teléfono para no depender de tener la app abierta. Eso no obliga a mantener el dispositivo del coche en conexión continua: el dispositivo solo envía el evento al backend y el backend notifica al móvil.

---

## 12. Privacidad de ubicación

La ubicación de un vehículo es un dato sensible aunque este proyecto sea personal.

### Estado actual

`reverseGeocode()` envía las coordenadas exactas a Nominatim para obtener calle/ciudad/país.

Los botones Google Maps y Waze comparten las coordenadas cuando el usuario los pulsa.

El mapa descarga teselas/estilo de OpenFreeMap. La revisión vuelve a mostrar la atribución requerida en MapLibre; no debe desactivarse.

Además, la política del Nominatim público limita el uso a un máximo absoluto de 1 petición/s y exige identificación/atribución. El hook actual no garantiza ese límite global cuando hay varias coordenadas distintas.

### Decisión v0.6

- Mantener las coordenadas como fuente de verdad en Guardian/backend.
- Informar claramente de los terceros usados para mapa/geocode.
- No enviar ubicaciones a servicios externos en background sin necesidad.
- Sustituir el reverse-geocode masivo del cliente por cache + rate limit centralizado, o eliminarlo del historial hasta tener esa capa.
- Mantener atribución de OpenStreetMap/OpenFreeMap donde corresponda.
- Considerar self-hosting/proxy de mapas o geocode si se desea máxima privacidad.
- No registrar secretos, IMEI, IMSI, claves SIM ni coordenadas precisas en logs de producción por defecto.
- Definir retención de historial antes de un despliegue permanente; no conservar ubicación indefinidamente por accidente.

---

## 13. Política energética

### Regla de aceptación

**Guardian completo debe añadir <= 2 mA de media medidos desde los 12 V del coche durante aparcamiento representativo.**

Objetivo preferido: acercarse a **1 mA o menos**.

Este presupuesto incluye:

- convertidor;
- supervisor;
- LIS3DH;
- ESP32;
- módem;
- despertares;
- check-ins;
- fugas;
- gestión de reserva.

No basta con medir únicamente el ESP32.

### Telemetría de potencia

El campo v1 `batteryMv` no basta para el producto final. La siguiente evolución del protocolo debe distinguir como mínimo:

```text
vehicleBatteryMv
reserveBatteryMv?   // solo si la medición es fiable
powerSource         // VEHICLE | RESERVE
```

Temperatura de la reserva y estado de carga solo se añaden si existe sensor/medición físicamente fiables. La app no mostrará porcentajes inferidos sin una base de medida válida.

### GNSS

GNSS permanece OFF por defecto.

Se enciende solo para:

- alerta;
- `LOCATE_NOW`;
- tracking explícito durante un incidente;
- necesidades concretas de viaje que pasen el presupuesto.

Siempre con timeout.

### LTE

Nunca permitir:

```text
sin cobertura -> buscar red durante horas sin límite
```

Debe haber:

- timeout de registro;
- timeout de transmisión;
- backoff;
- número de intentos acotado;
- política más agresiva de ahorro con batería baja/reserva.

### BLE

No mantener BLE activo permanentemente por comodidad sin medirlo.

Se abre una ventana local cuando sea necesaria la autorización de viaje o durante estados explícitos.

---

## 14. Reserva 18650

La reserva no existe para alimentar funciones de confort durante semanas. Existe para:

- detectar pérdida de alimentación principal;
- intentar enviar la alerta;
- conservar el estado;
- proporcionar seguimiento limitado según energía disponible.

La transición 12 V -> 18650 puede reiniciar la LILYGO. El firmware debe sobrevivir mediante estado persistido.

### Carga

El esquema V1.4 documentado en el repo muestra CN3065 y la red TEMP con `N9 0R`, por lo que no se considera validada una protección térmica efectiva de carga.

Antes de dejar una 18650 en el coche:

- verificar físicamente la revisión recibida;
- comprobar la ruta de carga;
- bloquear por hardware carga fuera del rango térmico de la celda;
- probar fallo de sonda;
- medir corriente de carga real;
- comprobar qué ocurre si una 18650 descargada intenta recargarse mientras el coche lleva días parado.

Si el cargador integrado puede extraer demasiada energía de la batería principal en ese escenario y no se puede limitar de forma segura, se cambia la arquitectura de carga. No se acepta simplemente porque “el consumo en sleep sea bajo”.

---

## 15. Protección de la batería del coche

La protección final no puede depender del ESP32.

```text
12 V permanente
      |
   fusible
      |
protección inversión/transitorios
      |
UVLO AUTÓNOMO + histéresis
      |
buck bajo consumo
      |
Guardian
```

El UVLO corta **solo Guardian**.

Debe funcionar aunque:

- ESP32 esté colgado;
- firmware no arranque;
- módem esté bloqueado;
- la app/backend estén caídos.

Los umbrales no se fijan hasta conocer batería, coche, caídas del cableado y comportamiento real bajo carga.

---

## 16. Banco de consumo que cierra la arquitectura

### Instrumentación

```text
Mac
 |
USB
 |
ESP32-S3 N16R8
 |
I2C
 |
INA219 R100
 |
+---- corriente del DUT ----+
```

La ESP32-S3 de medida se alimenta desde el Mac, no desde Guardian.

### Pruebas obligatorias

#### P1. Reposo profundo

```text
ESP32 deep sleep
A7670E OFF
GNSS OFF
LIS3DH ON
```

Objetivo: establecer el suelo real de la placa.

#### P2. Remote-ready

```text
ESP32 sleep
A7670E registrado/sleep
GNSS OFF
LIS3DH ON
```

Hacer la prueba **al menos en dos condiciones**:

- `P2a`: alimentación externa/VBUS;
- `P2b`: alimentación desde batería.

La diferencia importa porque LILYGO documenta el problema de sleep del módem con USB-C/VBUS. Si P2a no duerme, no se extrapola P2b ni se da por solucionado: se decide explícitamente si usar `DEEP`, validar una modificación de hardware, rediseñar la ruta de potencia o cambiar de plataforma.

Si P2 rompe el presupuesto, `REMOTE_READY` deja de ser el modo por defecto.

#### P3. Wake + LTE

Medir:

- tiempo hasta registro;
- media;
- energía por evento;
- tensión mínima observada durante el ciclo;
- comportamiento con buena cobertura;
- fallos/reintentos.

El INA219 R100 sirve para energía/media, pero el shunt puede introducir una caída apreciable en la prueba directa a 5 V y no garantiza capturar el pico LTE más breve. Un reset o caída de bus invalida esa ejecución como medida representativa.

#### P4. Wake + LTE + GNSS

Medir:

- tiempo al fix;
- energía del ciclo completo;
- timeout;
- vuelta a sleep.

#### P5. Sistema final desde 12 V

```text
12,6 V
 |
INA219
 |
protección + UVLO + buck
 |
Guardian
```

Este es el dato que decide la instalación.

#### P6. 72 h aparcado

Incluir:

- despertares programados;
- reconexiones;
- eventos simulados realistas;
- media total;
- mAh/Wh acumulados.

#### P7. Mala cobertura

El sistema debe demostrar que no queda buscando LTE/GNSS indefinidamente.

#### P8. Pérdida y retorno de 12 V

Repetir cortes, incluido corte durante escritura y durante transmisión.

#### P9. Carga de reserva

Medir pico, media y duración de carga de una 18650 parcialmente descargada.

---

## 17. Criterios de go/no-go antes del coche

Guardian **NO se instala permanentemente** si falla cualquiera de estos puntos:

| Gate | Exigencia |
| --- | --- |
| Consumo | <= 2 mA medios adicionales desde 12 V en aparcamiento representativo; si el resultado queda cerca del límite, confirmar con instrumento independiente |
| Protección batería coche | UVLO autónomo, histéresis y corriente residual validados |
| Movimiento | LIS3DH despierta de forma fiable sin falsos positivos inaceptables |
| LTE | timeouts/backoff probados, sin bucles de búsqueda indefinidos |
| GNSS | timeout y posición fechada; nunca stale como “actual” |
| Autorización viaje | dispositivo confirma; backend solo no puede desarmarlo |
| Secretos | no demo keys, no logs, almacenamiento backend endurecido |
| 18650 | temperatura/carga/reserva probadas por hardware |
| Corte 12 V | evento sobreviviente a reset y reintento real |
| Privacidad | comportamiento de terceros de mapas/geocode conocido y aceptado |

---

## 18. Orden de implementación desde el estado actual

### Fase A - Banco físico mínimo

1. Recibir y verificar revisión exacta de T-A7670E.
2. Verificar LTE y GNSS oficiales.
3. Conectar LIS3DH por I2C + INT.
4. Confirmar wake físico.
5. Implementar firmware mínimo de eventos firmado.
6. Reutilizar el backend Nest actual.
7. Medir P1-P4 con ESP32-S3 + INA219.

### Fase B - Seguridad de estado

1. Diseñar claim/pairing inicial con presencia física y credencial de un solo uso.
2. Implementar pairing BLE.
3. Challenge-response local que funcione sin Internet.
4. `PREALERT`.
5. Inicio/fin de viaje confirmado por dispositivo.
6. Separar estado reportado por Guardian de cualquier estado deseado/solicitud del backend.
7. Eliminar la autoridad exclusiva de los endpoints actuales `trip/start|end`.
8. Crear incidente de alerta separado del `DeviceState`.
9. Evaluar Secure Boot + Flash Encryption para proteger credenciales ante acceso físico.

### Fase C - Comandos remotos

1. `DeviceCommand`.
2. Extender protocolo para correlation id y telemetría de potencia no ambigua.
3. `LOCATE_NOW`.
4. ACK/TTL/idempotencia.
5. Autenticación del dispositivo para lectura de comandos.
6. UI de “Actualizar ubicación”.
7. Probar primero con polling al despertar.

### Fase D - Remote wake

Solo después de P2:

1. comprobar DTR/RI y revisión real;
2. probar wake de red;
3. medir 24/72 h;
4. habilitar `REMOTE_READY` únicamente si respeta presupuesto.

### Fase E - Alimentación automotriz y reserva

1. protección de entrada;
2. buck de bajo quiescent current;
3. UVLO independiente;
4. ruta 18650 + protección térmica real;
5. P5-P9;
6. solo entonces instalación reversible en coche.

---

## 19. Cambios de backend recomendados antes de Internet público

Prioridad alta:

- cifrar el secreto HMAC en reposo;
- restringir CORS/orígenes de producción;
- rate limit para OTP, creación de comandos y endpoints sensibles;
- implementar transporte real de email OTP; producción permanece fail-closed hasta entonces;
- separar configuración `development` / `production` con startup checks;
- sustituir el provisioning técnico actual por pairing/claim explícito y seguro;
- crear cola de comandos con schemas cerrados;
- auditoría de comandos;
- evitar coordenadas/secrets en logs;
- cache/rate limit correcto para geocoding o retirar geocoding masivo del cliente;
- tests de autorización cruzada entre dos propietarios;
- tests de expiración/replay de comandos.

Prioridad posterior:

- push notifications móviles;
- retención configurable de historial;
- rotación de claves;
- export/delete de datos personales;
- hardening de despliegue, backups y restauración.

---

## 20. Decisión de arquitectura resultante

La arquitectura objetivo queda:

```text
                        +----------------------+
                        |      APP EXPO        |
                        | SecureStore + OTP    |
                        +----------+-----------+
                                   |
                                 HTTPS
                                   |
                        +----------v-----------+
                        |   NESTJS / POSTGRES  |
                        | events / commands    |
                        | incidents / trips    |
                        +----+-------------+---+
                             ^             |
          eventos HMAC/TLS   |             | comandos pendientes
                             |             v
                        +----+-------------+---+
                        | LILYGO T-A7670E      |
                        | ESP32 + LTE + GNSS   |
                        | estado persistido    |
                        +----+-------------+---+
                             ^             ^
                             |             |
                        LIS3DH INT      BLE local
                             |        challenge/response
                             |             |
                        movimiento       APP cerca

12 V -> fusible -> protección -> UVLO -> buck -> Guardian
                                      |
                                      +--> 18650 solo con carga térmicamente segura
```

La app y el backend son herramientas de control y visualización. **Guardian físico sigue siendo la autoridad sobre el estado que protege el coche.**

El backend puede pedir una localización, almacenar eventos y notificar; no puede convertir por sí solo una fila SQL en “coche autorizado”.

El remote wake es una optimización energética/UX que se gana con mediciones. El sistema antirrobo funciona aunque esa optimización finalmente se descarte.

---

## 21. Referencias internas y externas

Documentación existente del proyecto:

- [Diseño personal v0.5](GUARDIAN_DISENO_PERSONAL_v0_5.md)
- [Alimentación y reserva](hardware/ALIMENTACION_Y_RESERVA.md)
- [Esquema T-A7670X V1.4](hardware/ESQUEMA_T_A7670X_V1_4.md)
- [Componentes v0.5](COMPONENTES.md)
- [App móvil](../mobile/README.md)
- [README raíz](../README.md)

Fabricante:

- [LILYGO T-A7670X](https://wiki.lilygo.cc/products/t-sim-series/t-a7670/)
- [Repositorio LILYGO Modem Series](https://github.com/Xinyuan-LilyGO/LilyGo-Modem-Series)
- [Ejemplo oficial ModemSleep](https://github.com/Xinyuan-LilyGO/LilyGo-Modem-Series/tree/main/examples/ModemSleep)
- [ST LIS3DH](https://www.st.com/en/mems-and-sensors/lis3dh.html)
- [TI INA219](https://www.ti.com/product/INA219)

---

**Resultado de esta revisión:** no hace falta rehacer la app. La base móvil/backend actual es válida. La siguiente frontera real del proyecto es firmware + consumo + autoridad de estado. Antes de añadir más UI, Guardian debe demostrar en mesa que puede despertar, enviar, localizarse y volver a dormir sin comprometer la batería del coche.
