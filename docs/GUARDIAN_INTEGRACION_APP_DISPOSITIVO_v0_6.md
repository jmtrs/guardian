# GUARDIAN v0.6
## Integración de app, dispositivo, seguridad y energía

**Fecha:** 22 de septiembre de 2026  
**Estado:** arquitectura de integración y plan de validación. La app y el backend existen; el firmware físico, el enlace LTE/GNSS real, la autorización BLE y la alimentación automotriz siguen pendientes de banco.  
**Ámbito:** proyecto personal para un vehículo de 12 V. Guardian no controla motor, arranque, dirección, frenos, inmovilizador, CAN ni centralitas.

> Principio rector: Guardian nunca debe comprometer la batería de arranque para mantener una función de comodidad. La detección de movimiento y la protección del vehiculo son prioritarias; el wake remoto inmediato solo se habilita si demuestra un consumo compatible con el presupuesto energético real.

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

La app consulta el backend cada 5-10 s cuando las pantallas están abiertas. **Ese polling es app -> backend y debe seguir leyendo únicamente estado ya almacenado en servidor; no debe generar comandos ni despertar el vehiculo.**

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

> Estado a septiembre de 2026: los huecos 2, 7, 9 y 10 están resueltos (PR1 + PR2); los
> huecos 4, 5, 6 y 11 están resueltos (PR3 + PR3b, endurecimiento de despliegue y
> privacidad, con retención de historial); el hueco 12 tiene su fundación resuelta
> (PR4, claim/pairing con presencia en software); el resto siguen abiertos. El contrato vigente entre placa, backend y app
> es `docs/CONTRATO_DISPOSITIVO_v0_6.md`. Visión de las cinco capas y recorrido de un dato
> de punta a punta: `docs/MAPA_CONEXION_SISTEMA.md`.

1. **El estado de viaje actual es solo servidor.**  
   `POST /v1/devices/:id/trip/start` cambia `Device.state` a `TRIP` y la app hace update optimista. El dispositivo físico no confirma nada. Esto contradice la regla previa de que Guardian debe confirmar un cambio de seguridad. *(Parcialmente mitigado: iniciar viaje cierra los incidentes de movimiento abiertos — presencia del dueño —, pero el viaje sigue sin confirmación del dispositivo.)*

2. ~~**No existe canal backend -> dispositivo.**~~ **Resuelto (PR2).**  
   Cola de comandos `LOCATE_NOW` con TTL 120 s, poll firmado con K_command, ACK atómico desde `gnss_fix.commandId`, expiración perezosa. Contrato: `docs/CONTRATO_DISPOSITIVO_v0_6.md` §6.

3. **No existe wake remoto validado.**  
   La T-A7670E dispone de señales de módem útiles para sleep/wake, pero el método exacto, consumo y comportamiento con nuestra revisión y ruta de alimentación deben medirse.

4. ~~**El secreto HMAC se almacena en claro en PostgreSQL.**~~ **Resuelto (PR3).**  
   `Device.secret` cifrado en reposo con AES-256-GCM (`enc:v1:iv:tag:ct`); master key en env `GUARDIAN_SECRET_KEY`, fuera de la BD (KMS-ready). Se descifra solo en memoria para verificar firma; nunca se devuelve tras el provisioning. Producción falla al arrancar si falta la key. Secretos legado en claro siguen validando y se re-cifran al reescribirse. Ver `src/devices/secret-crypto.ts`.

5. ~~**CORS estaba abierto con `app.enableCors()`.**~~ **Resuelto (PR3).**  
   Origen restringido a `trustedOrigins()` (`src/config/origins.ts`), fuente única compartida con Better Auth. Producción solo admite `guardian://` y lo declarado en `TRUSTED_ORIGINS`; el bloque local es solo desarrollo. Los endpoints del dispositivo no llevan Origin (firmware), así que CORS no los afecta: la firma HMAC sigue siendo su autoridad.

6. ~~**La ubicación exacta sale a terceros.**~~ **Resuelto (PR3 + PR3b).**  
   El reverse-geocode ya no sale desde cada móvil: pasa por el proxy del backend (hueco 11), un único punto que cachea y limita. La app muestra un aviso explícito de terceros en el mapa: mapa/direcciones vía OpenStreetMap y, al abrir Google Maps/Waze, se envían las coordenadas a un tercero. Retención de historial añadida (PR3b): los eventos con ubicación se purgan tras `RETENTION_DAYS` (90 por defecto); los incidentes no caducan.

7. ~~**La alerta actual no tiene estado propio.**~~ **Resuelto (PR1).**  
   Incidente persistente (`OPEN` → `ACKNOWLEDGED` → `CLOSED`) independiente del último evento. `power_lost` abre incidente propio; un `heartbeat` posterior no lo oculta. Ningún incidente `OPEN` se cierra por telemetría; un `power_lost` revisado se cierra al observar energía de vehiculo restablecida (`closedByEventSeq`).

8. **`WORKSHOP` existe en backend pero la app no lo representa correctamente.**  
   La lógica actual termina mostrando cualquier estado que no sea `TRIP` como `ARMADO`. No se habilitará modo taller real hasta diseñar expiración y confirmación en dispositivo. *(La app ya pinta TALLER con cuenta atrás; falta la confirmación en dispositivo.)*

9. ~~**El rastro actual son las últimas posiciones, no necesariamente un viaje o incidente concreto.**~~ **Resuelto (PR2).**  
   `GET /v1/devices/:id/positions` acota el rastro por hecho concreto: `?incidentId=...` desde que abrió el incidente (cota por `openedByEventSeq`), `?tripId=...` entre `startedAt`/`endedAt` del viaje. El dashboard navega al mapa acotado: incidente si hay alerta abierta, viaje si hay viaje activo, historial completo si no. La alerta manda sobre el viaje.

10. ~~**La telemetría de batería es ambigua.**~~ **Resuelto (PR2).**  
    Protocolo v2: `power {vehicleMv, reserveMv?, source}` obligatorio en todo evento; `batteryMv` rechazado. La app muestra el rail activo.

11. ~~**El reverse-geocode del cliente no garantiza la política de Nominatim.**~~ **Resuelto (PR3).**  
    Proxy de backend `GET /v1/geocode/reverse` (autenticado): cache en memoria por coordenada redondeada + rate-limit GLOBAL serializado a ≤1 req/s hacia Nominatim + User-Agent propio. La app deja de llamar a Nominatim directamente (`mobile/src/lib/geocode.ts` consume el proxy). Ver `src/geocode/`.

12. ~~**Provisioning todavía no equivale a pairing seguro.**~~ **Resuelto (PR4, fundación).**  
    El alta separa aprovisionar (banco/fábrica, dispositivo sin dueño, en ventana de pairing con código de un solo uso — en BD solo su hash) de reclamar (`POST /v1/devices/claim`, liga al dueño y quema el código, atómico y con rechazo uniforme). La app muestra el input de código cuando no hay dispositivo. Es la presencia física en software; el reto BLE criptográfico sigue diferido a firmware (§6) y sustituirá al código sin cambiar el contrato. Ver `CONTRATO_DISPOSITIVO_v0_6.md` §7.

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

### Banco de medida, no parte del vehiculo

- **ESP32-S3 N16R8** externa como registrador.
- **INA219 con shunt R100 = 0,1 ohm**.
- Mac por USB.
- Fuente estable para las pruebas.

El ESP32-S3 externo lee el INA219 y envía CSV/telemetría al Mac. No debe alimentarse desde el ramal que se está midiendo.

El INA219 es suficiente como **instrumento de cribado** para distinguir órdenes de magnitud y calcular consumo medio/energía. Con R100 su resolución física y la tolerancia del módulo genérico hacen que una lectura cercana al gate de 2 mA deba confirmarse con multímetro calibrado o instrumental mejor antes de aprobar el vehiculo. Tampoco sustituye a un osciloscopio/profiler para capturar picos LTE muy breves. A corrientes LTE altas, el shunt de 0,1 Ω introduce caída de tensión y esa caída también debe registrarse.

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

Los umbrales, duración y debounce del LIS3DH se determinan con el vehiculo real. No se fijan por intuición.

Cada wake no autorizado tiene un coste energético medible: el ciclo completo wake → ventana BLE → conexión LTE → transmisión → retorno a deep sleep. Ese coste, `E_ciclo`, se mide en banco y se trata como parámetro de diseño. Escenario adversario explícito: un atacante que provoque movimiento repetido (sacudir o golpear el vehiculo) ataca la **batería**, no la criptografía. Cualquier contramedida (debounce, agrupación de alertas, backoff acotado) se decide con `E_ciclo` medido y declara de antemano un techo máximo de retardo de alerta. La detección no se silencia jamás por debajo de ese techo: suprimir alertas no es una opción de ahorro energético.

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

Un ESP32 en deep sleep no mantiene BLE activo. Por eso la app puede preparar una intención local y esperar a que el LIS3DH despierte Guardian al abrir/entrar/mover ligeramente el vehiculo. Tras despertar, Guardian abre una ventana BLE corta para completar el desafío.

La autorización local **no debe depender de que haya Internet o cobertura LTE**: un teléfono ya emparejado debe poder autorizar el viaje localmente y sincronizar el resultado con backend después.

Debe existir una ventana transitoria `PREALERT` muy breve y medible:

- el movimiento se persiste localmente desde el primer instante;
- si llega autorización BLE válida, pasa a `TRIP`;
- si no llega, genera/transmite la alerta.

La duración exacta se decide en pruebas para no degradar la detección antirrobo.

> **Sustituto en software (implementado en PR1, sin hardware).** Mientras no exista el reto BLE, el "fui yo" del propietario se expresa autorizando el viaje desde la app (sesión autenticada). Al pulsar *Iniciar viaje*, el backend cierra automáticamente los incidentes de `suspected_movement` abiertos (`TRIP_RESOLVING_KINDS` en `backend/src/devices/incident.ts`). Esto imita el efecto del desafío BLE: presencia autenticada del dueño ⇒ el movimiento deja de ser alerta. Diferencias con el contrato final que el firmware debe cerrar:
> - Hoy la presencia se declara con un tap manual; con firmware será el reto BLE tras el wake por LIS3DH, sin intervención.
> - Hoy la autorización viaja por el canal backend autenticado (requiere que la app llegue al backend); el objetivo es autorización **local** BLE sin depender de Internet.
> - `power_lost` **no** se auto-resuelve al autorizar (posible manipulación): exige *Revisado*/cierre explícito. Esta política se mantiene igual cuando llegue el firmware.
>
> El contrato de estados (`tripState: REQUESTED → CONFIRMED`) ya está listo para que el ACK físico sustituya la auto-confirmación del backend sin rehacer backend ni app.

### Requisitos duros del reto BLE (contrato normativo para firmware)

Lo siguiente es vinculante para la implementación de firmware. Convención: **debe** = requisito sin excepciones; **parámetro** = valor inicial declarado que el banco de medida puede ajustar, nunca eliminar. Nada aquí depende de LTE o cobertura: la autorización local funciona offline (§6).

#### R1. Criptografía fijada

- Clave: `K_ble = HKDF-SHA256(K_root, info="guardian/ble/v1", salt=deviceId)` — derivación por contexto (PR2). Prohibido reutilizar `K_event` o `K_command` en el canal BLE.
- Autenticación mutua en 4 tramas sobre GATT:

```text
APP       --> GUARDIAN : CONNECT + solicitud de reto
GUARDIAN  --> APP      : N_g (128 bits, CSPRNG, fresco por intento)
APP       --> GUARDIAN : N_p (128 bits, CSPRNG) || tag
                       tag  = HMAC-SHA256(K_ble, "auth/v1"     || N_g || N_p || deviceId)
GUARDIAN  --> APP      : tag2 = HMAC-SHA256(K_ble, "auth-ack/v1" || N_p || N_g)
```

- El teléfono **debe** verificar `tag2`: un Guardian falso no puede suplantar al dispositivo ni cosechar respuestas del dueño.
- `N_g` fresco en cada intento hace inútil la reproducción de un `tag` grabado (anti-replay por construcción, sin estado compartido previo).
- Comparación de etiquetas en tiempo constante en ambos lados. Buffers de nonce y tag zeroizados tras el intercambio.
- Una autenticación exitosa deriva `K_sess = HKDF-SHA256(K_ble, N_g || N_p)` para el resto de comandos de la sesión (`START_TRIP`, `END_TRIP`): el reto no se repite por comando.
- La autenticación de capa de aplicación es la frontera de seguridad. El cifrado del enlace BLE (si se activa tras bonding) es endurecimiento, nunca sustituto. Prohibido depender del emparejamiento "Just Works" del stack o de la cifra del enlace como mecanismo de autenticación.

#### R2. Límite de intentos por ventana

- Máximo **3** etiquetas inválidas por ventana BLE. Al tercer fallo: desconexión inmediata, cierre de ventana, retorno a deep sleep. No se reabre hasta el siguiente wake físico (LIS3DH).
- Contador acumulado de fallos persistido en NVS y expuesto en diagnóstico. No existe bloqueo permanente: el límite acota **energía y superficie de ataque**, no criptoanálisis (clave de 256 bits; fuerza bruta inviable). Un bloqueo permanente sería un vector de denegación de servicio contra el propietario.

#### R3. Cota anti-relé

- Guardian mide el tiempo entre el envío de `N_g` y la recepción de `tag`. Superar `T_relay` (**parámetro**, valor inicial 100 ms, validar en banco con p50/p99) descarta la trama y cierra la conexión, contabilizado como timeout (distinto de fallo criptográfico).
- Nota honesta: un relé suficientemente rápido puede cumplir la cota; esta eleva el coste del atacante, no lo elimina. La mitigación primaria es que la app **solo** responda al reto ante un gesto explícito del usuario (*Iniciar viaje* pulsado; sin diálogo en segundo plano). RSSI y proximidad no se usan para nada (§6).

#### R4. Identidad BLE no rastreable

- MAC de advertising aleatoria, rotada en cada ventana. Nunca la MAC pública de fábrica.
- El anuncio no contiene nombre, número de serie ni datos de fabricante identificativos. Descubrimiento por identificador rotatorio:

```text
RID = trunc64( HMAC-SHA256(K_ble, "rid/v1" || slot) ),  slot = epoch / 15 min
```

  La app calcula el RID esperado (slot actual y anterior) y solo conecta si coincide. Un observador externo no puede correlacionar dos ventanas del mismo vehículo; solo el dueño puede reconocerlo. El RID rota junto con `K_ble` en cada re-pairing.

#### R5. Ventana acotada y presupuesto energético

- Duración de ventana `T_win`: **parámetro**, valor inicial 10 s, máximo duro 30 s.
- Corte garantizado: al llegar a `T_win` el stack BLE se desmonta y el dispositivo entra en deep sleep **aunque exista conexión activa a mitad de protocolo**. Ningún tráfico prolonga la ventana.
- Presupuesto: ventana BLE completa ≤ **0,5 mAh** medidos desde 12 V con el banco INA219. Potencia de transmisión BLE: la mínima que cumpla fiabilidad en el vehiculo real (**parámetro**, validar).
- Un watchdog debe cortar cualquier flujo colgado → deep sleep + evento persistido (`window_aborted`), respetando el principio de persistir-primero (§5).

#### R6. Comportamiento ante violación de protocolo (fail-closed)

- Trama malformada, longitud inesperada, segunda solicitud de reto, escritura fuera de protocolo: desconexión inmediata contada como fallo (consume R2). Respuesta única genérica, sin detalles de error: el canal de error no es un oráculo.

#### R7. Pairing inicial y recuperación

- Credencial de un solo uso `S_pair` (256 bits) generada por backend con TTL corto, mostrada una vez (QR o entrada manual) en el acto de provisioning con presencia física (PR3).
- `K_ble` nace solo entre las dos partes en la ventana de pairing: teléfono y Guardian se autentican mutuamente con `S_pair` (mismo formato de reto de R1, clave `S_pair`), y ambos derivan `K_ble = HKDF-SHA256(S_pair, N_a || N_b, deviceId)`. `S_pair` queda invalidada en el acto.
- Reclamado el dispositivo, el pairing abierto se cierra. Sin reapertura remota.
- Recuperación por móvil perdido: procedimiento físico deliberado (acceso al Guardian) + nueva `S_pair`; implica rotación de `K_ble` y revocación de credenciales anteriores. Nunca una API que entregue la clave BLE existente.
- `K_ble` en el móvil solo en SecureStore. En el ESP32, la resistencia ante acceso físico queda condicionada a Secure Boot + Flash Encryption (§6).

#### Criterios de aceptación en banco

| # | Prueba | Criterio de aceptación |
|---|--------|------------------------|
| A1 | Reproducir un `tag` grabado de una sesión anterior | Rechazado 100/100 |
| A2 | Clave errónea (bit alterado en `K_ble` de prueba) | `tag` inválido; 3 fallos cierran la ventana |
| A3 | Conexión abierta sin completar el reto | Deep sleep en `T_win` ± tolerancia; sin extensión por tráfico |
| A4 | Escáner BLE en dos ventanas consecutivas | MAC distinta; RID distinto; sin correlación externa posible |
| A5 | Medición INA219 de la ventana completa | ≤ 0,5 mAh |
| A6 | RTT del reto (p50/p99) con teléfono real | Medido; `T_relay` fijado con holgura sobre p99 |
| A7 | Flujo colgado artificial (no responder tras `N_g`) | Watchdog → deep sleep + `window_aborted` persistido |

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

**Implementado (PR2):** el contrato de evento es ahora `schemaVersion 2`, el único que existe — un evento que no declare `schemaVersion: 2` se rechaza. `commandId` viaja solo en `gnss_fix` y correlaciona solicitud, fix y ACK: el backend pasa el comando a `ACKED` de forma atómica solo si sigue `PENDING` y no ha expirado. Un `gnss_fix` sin `position` se rechaza: sin coordenadas no hay fix que confirmar (y un fix vacío no puede ACKar un `LOCATE_NOW`). Un fix tardío sobre un comando ya expirado guarda la posición (dato valioso) pero NO lo marca como atendido. El wake best-effort del flujo sigue diferido a firmware: hoy el dispositivo ya despierto hace poll y recoge el comando.

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

**Implementado (PR2):** `LOCATE_NOW` existe con `PENDING | ACKED | EXPIRED` y TTL de 120 s. Sin canal de wake real todavía, el dispositivo despierto pregunta por `POST /v1/commands/poll` autenticado con `K_command`; la expiración es lazy (al leer). El ACK es el `gnss_fix` con `commandId` llegando por el canal de eventos — nunca un autoack del backend. `requestLocate` es idempotente: reutiliza el `PENDING` vivo (get-or-create en transacción serializable) en lugar de encolar otro. Quedan para más adelante: `requestedBy` en el modelo, límite de pendientes y rate limit del endpoint.

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

**Implementado (PR2):** `deriveKey(K_root, deviceId, contexto)` = HKDF-SHA256 con `salt=deviceId` e `info` propia por canal (`guardian/event/v1`, `guardian/command/v1`, `guardian/ble/v1`). `K_event` verifica `/v1/events`, `K_command` verifica `/v1/commands/poll`, y `K_root` no verifica nada: los tests y el drive lo comprueban en ambos sentidos. El cifrado en reposo queda para PR3.

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

**Implementado (PR2):** botón *Actualizar ubicación* en la tarjeta de mapa; hora del último fix visible; energía con semántica física (`13.60 V · vehiculo` / reserva según la fuente activa). Los estados del botón derivan del ÚLTIMO comando real, no de suposiciones locales: `PENDING` = esperando fix del dispositivo, `ACKED` = actualizado + hora, `EXPIRED` = sin respuesta, reintento. Nada de falsos confirmados: el único ACK que cuenta es el `gnss_fix` con `commandId`.

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

**Implementado (PR2):** `GET /v1/devices/:id/positions?incidentId=...` (desde el evento que abrió el incidente, inmune a sesgos de reloj por usar `seq`) y `?tripId=...` (entre `startedAt`/`endedAt`). Con una alerta abierta, el dashboard navega al mapa ya acotado al incidente (“Rastro desde la alerta”).

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

En una fase posterior, las alertas reales deberían llegar por push al teléfono para no depender de tener la app abierta. Eso no obliga a mantener el dispositivo del vehiculo en conexión continua: el dispositivo solo envía el evento al backend y el backend notifica al móvil.

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

**Guardian completo debe añadir <= 2 mA de media medidos desde los 12 V del vehiculo durante aparcamiento representativo.**

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

**Implementado (protocolo v2).** Todo evento lleva `power` obligatorio:

```text
vehicleMv            // int 0..60000, obligatorio — rail del vehiculo
reserveMv?           // int 0..60000 | null — solo si la medición es fiable
source               // 'vehicle' | 'reserve' | 'unknown' — rail que alimenta AHORA
```

`batteryMv` no existe en el contrato: el backend lo rechaza de forma explícita (400), incluso en `null`. La app muestra el voltaje del rail activo (`reserve` → voltaje de reserva), nunca un único campo "Batería" sin semántica física. Contrato exacto: `docs/CONTRATO_DISPOSITIVO_v0_6.md`.

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

Antes de dejar una 18650 en el vehiculo:

- verificar físicamente la revisión recibida;
- comprobar la ruta de carga;
- bloquear por hardware carga fuera del rango térmico de la celda;
- probar fallo de sonda;
- medir corriente de carga real;
- comprobar qué ocurre si una 18650 descargada intenta recargarse mientras el vehiculo lleva días parado.

Si el cargador integrado puede extraer demasiada energía de la batería principal en ese escenario y no se puede limitar de forma segura, se cambia la arquitectura de carga. No se acepta simplemente porque “el consumo en sleep sea bajo”.

---

## 15. Protección de la batería del vehiculo

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

Los umbrales no se fijan hasta conocer batería, vehiculo, caídas del cableado y comportamiento real bajo carga.

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

## 17. Criterios de go/no-go antes del vehiculo

Guardian **NO se instala permanentemente** si falla cualquiera de estos puntos:

| Gate | Exigencia |
| --- | --- |
| Consumo | <= 2 mA medios adicionales desde 12 V en aparcamiento representativo; si el resultado queda cerca del límite, confirmar con instrumento independiente |
| Protección batería vehiculo | UVLO autónomo, histéresis y corriente residual validados |
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
6. solo entonces instalación reversible en vehiculo.

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

La app y el backend son herramientas de control y visualización. **Guardian físico sigue siendo la autoridad sobre el estado que protege el vehiculo.**

El backend puede pedir una localización, almacenar eventos y notificar; no puede convertir por sí solo una fila SQL en “vehiculo autorizado”.

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

**Resultado de esta revisión:** no hace falta rehacer la app. La base móvil/backend actual es válida. La siguiente frontera real del proyecto es firmware + consumo + autoridad de estado. Antes de añadir más UI, Guardian debe demostrar en mesa que puede despertar, enviar, localizarse y volver a dormir sin comprometer la batería del vehiculo.
