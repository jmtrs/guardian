# RED ANÓNIMA DE GUARDIANES v0.1

**Estado: diseño de arquitectura. NADA de esto está implementado.** Este
documento cierra el diseño de una red colaborativa entre Guardianes al estilo
Find My / AirTag: cada device sirve de "finder" para los demás, de modo que un
vehículo cuyo device se queda solo y sin enlace propio sigue siendo localizable
gracias a los Guardianes que pasan cerca. Complementa
`GUARDIAN_CICLO_DE_VIDA_Y_MODELO_DUAL_v0_7.md` (del que hereda F6 watchdog y F2
seq) y `CONTRATO_DISPOSITIVO_v0_6.md` (protocolo v2, HKDF). Si este documento y
el código discrepan, manda el código.

Convención de marcadores:

- **VERIFICADO** — comprobado en código, con referencia `archivo:línea`.
- **DISEÑO CERRADO** — especificado aquí, sin implementar.
- **HUECO** — problema detectado, sin diseño ni código; hay que resolverlo.
- **DECISIÓN** — decisión de arquitectura tomada aquí.

---

## 1. Qué es y qué NO es

La red es una capa de **localización colaborativa cifrada de extremo a extremo**.
Copia el modelo Find My: balizas BLE pasivas con clave pública rotatoria +
cualquier "finder" que las oye y sube su propia ubicación cifrada + servidor
ciego que solo almacena + dueño que descifra con su clave privada.

- **NO** es mesh multi-hop, **NO** es routing dinámico, **NO** es un canal de
  chat entre devices. Cada capa extra multiplica superficie de ataque; se
  descartan a propósito.
- **NO** cambia el modelo de propiedad single-owner ni el alta (`v0_7.md:76-94`).
- **SÍ** reutiliza la cripto que ya existe: HKDF-SHA256 sobre K_root (VERIFICADO
  `CONTRATO_DISPOSITIVO_v0_6.md:26-30`) para derivar el material de baliza.

### 1.1 DECISIÓN — la red es una LECTURA, no un device nuevo

Las tres features (§3) son tres lecturas distintas del **mismo** flujo de
reportes cifrados. Un solo mecanismo de red (baliza + finder + reporte),
tres capas de valor encima. No se diseñan tres sistemas.

---

## 2. Modelo criptográfico (fiel a AirTag)

```
Alta (una vez, en el claim/pairing por BLE):
  Device deriva la semilla de baliza: seed = HKDF(K_root, "guardian/beacon/v1").
  La entrega UNA vez a la app del dueño por el canal BLE autenticado
  (K_ble + tag2, INTEGRACION_APP_DISPOSITIVO_v0_6.md:337-340). La semilla NUNCA
  pasa por el servidor; en modo managed la app no conoce K_root — recibe esta
  derivación ya hecha por el device.

  De la semilla sale, POR ÍNDICE DE TIEMPO, el par efímero (d_i, P_i):
  i = floor(reloj / T_rot) y (d_i, P_i) = KDF(semilla, i). Determinista y SIN
  estado de cadena — cada ventana se deriva DIRECTA desde (semilla, i), no
  encadenando SHA-256 desde la anterior (ver DECISIÓN 21). El device deriva P_i
  para emitirla (el cálculo pasa por d_i, que jamás usa ni expone); la app del
  dueño deriva (d_i, P_i) igual, bajo demanda. d_i solo existe en el device y en
  el móvil del dueño. NADIE más.

  Recuperación: la semilla solo se re-entrega re-emparejando por BLE físico
  (mismo canal autenticado). Móvil perdido = re-pair presencial con el device.
  Nunca respaldo en servidor ni en nube — otra copia online es otra fuga.

Baliza (cada T_rot, def. §5):
  Índice de tiempo i = floor(reloj / T_rot) → (d_i, P_i) = KDF(semilla, i).
  Device emite por BLE solo P_i. Nada identificable, nada enlazable.

Finder oye P_i:
  Toma SU ubicación L (la del finder, que está físicamente al lado).
  C = ECIES(P_i, L || ts).
  Sube al servidor:  (h = hash(P_i), C, ts_grueso).   ← y nada más.

Servidor:
  Guarda C indexado por h. No tiene la semilla → no deriva d_i → no descifra.
  Retención ~7 días.

Dueño:
  Recalcula la ventana de P_i (misma derivación desde la semilla, por índice i),
  consulta por hash(P_i), descifra C con d_i. Obtiene dónde fue visto su device.
  La consulta va SIN autenticar — solo h, sin identidad (G8) — y barre un puñado
  de índices vecinos (i ± δ) para absorber el drift del RTC offline. Con índice
  de TIEMPO ese δ lo fija el error del reloj (ppm × horas sin sync), acotado y
  pequeño, NUNCA el número de rotaciones transcurridas — por eso no se usa una
  cadena SHA-256 count-indexed (DECISIÓN 21).
```

Propiedades que da este modelo, en cualquier tamaño de flota:

| Propiedad | Cómo |
|---|---|
| Servidor ciego | solo ve `hash(P_i)` + cifrado; sin la semilla no deriva `d_i` |
| Servidor sin mapa owner↔baliza | pull de reportes **sin autenticar**, por `h` (G8) — con pull autenticado esta tabla es FALSA por el camino de lectura |
| Finder ciego | cifra a una clave pública; no sabe de quién es el vehículo |
| Reportes no enlazables | `P_i` rota cada `T_rot`; sin patrón entre reportes |
| E2E | `d_i` solo vive en device + móvil del dueño; nadie más lee la ubicación |

**Esto es irrenunciable y vale igual con 10 devices que con 10 millones.**

---

## 3. Las tres features (misma red, tres lecturas)

### F-A — Relé de ubicación (la función núcleo)

Device robado con GPS jammeado o LTE caído → no puede reportar por su enlace.
Un Guardian cercano oye su baliza y sube la posición cifrada por SU enlace. El
dueño sigue viendo dónde está. Es Find My puro.

### F-B — Corroboración de silencio / jamming

Cruza dos señales que **ya existen** en el sistema:

- El watchdog de silencio (F6, `v0_7.md:132-152`) sabe que un device lleva
  N×cadencia sin reportar por su enlace.
- La red aporta la contraprueba: vecinos SIGUEN oyendo su baliza (presente,
  o moviéndose entre reportes de finders).

Silencio en el enlace + baliza viva en la red = **jamming confirmado**, no
batería muerta. Mata la falsa alarma más cara del anti-robo.

El cruce INVERSO, lectura gratis de la misma señal: **enlace "normal" + baliza
que la red jamás oye = posible suplantación** (ladrón con K_root extraído que
mata el device real e inyecta eventos plausibles con seq creciente — ver G1,
vía extracción de firmware). Ojo con el ruido: baliza no oída es NORMAL en
muchos casos legítimos (vehículo guardado en casa, zona sin finders, flota
pequeña), así que esto es **heurística débil, no confirmación**: solo pesa
como sospecha si el enlace reporta MOVIMIENTO sostenido y la red sigue sin
oír nada, y se muestra como señal a ponderar en el cliente, nunca como alarma
dura. Aun así tiene valor: la farsa por inyección exige mantener cadencia y
seq SIEMPRE sin un solo hueco (si falla, F6 dispara) y con la baliza ausente
como testigo en contra. Coste cero — misma señal de F-B, leída al revés.

**DECISIÓN — la correlación la hace el CLIENTE, nunca el servidor.** Si el
servidor cruzase "device X callado" con "baliza vista", tendría que enlazar la
identidad del device con la clave rotatoria → rompería el anonimato de la red.
Solo el dueño tiene la semilla (y con ella sus `d_i`/`P_i`), así que solo el
dueño corrobora. Coste: la app debe estar online y consultar (polling). Y esa
consulta tampoco puede llevar identidad: un pull autenticado entrega al
servidor el mapa owner→h y con él esta correlación ya hecha, sin semilla y sin
querer (G8).

### F-C — Mapa de calor de robos (agregado, anónimo)

Muchos eventos de jamming/movimiento anómalo en una zona → alerta comunitaria
"zona caliente". Inteligencia de prevención, no localización.

**DECISIÓN — canal separado del blob de relé.** Reporte distinto: geohash
truncado (~1 km) + tipo de evento, **sin identidad**, con ruido diferencial.
Una celda solo se publica si la reportan **≥ k = 5 reporteros distintos**
(k-anonimato) + difuminado temporal. Evento raro + celda fina + hora exacta =
reidentifica. Grueso o nada.

**Dependencia declarada:** contar "≥ k reporteros distintos" sin identificarlos
exige tokens por celda unlinkables — la misma cripto verde de G3. Sin G3 no hay
F-C publicable: cinco reportes del mismo Sybil no son k-anonimato.

**HUECO — distinto XOR unlinkable (el nudo duro de F-C).** Un token unlinkable
estilo Privacy Pass da rate-limit por EMISIÓN, no prueba de distinción: un solo
device con 5 tokens los gasta los 5 en la misma celda y simula 5 reporteros →
k-anonimato NOMINAL, no real. Garantizar "distintos" exige emisión ACOTADA por
`(device, celda, época)` — credencial anónima con rate-limit (Anonymous Tokens
con clave por época + scope de celda, o VOPRF con límite por origen). El filo:
hay que probar "≤ 1 token por celda-época" sin revelar CUÁL device, y un scope
demasiado fino roza reintroducir linkability. Sin resolver este
distinto-XOR-unlinkable, el conteo de k de F-C es simulable. Pendiente junto a
G3 (tarea 7).

### 3.1 Cómo se refuerzan

```
   F-A da la posición  ──►  cuando el device solo no puede
   F-B usa a los vecinos de F-A  ──►  para CONFIRMAR que es ataque
   F-C agrega los eventos de F-B  ──►  en inteligencia de zona
```

F-A = acción. F-B = certeza. F-C = prevención.

---

## 4. El problema REAL no es la cripto: es la densidad

AirTag es fiable por **~1.500M de iPhones** retransmitiendo. **Una baliza que
nadie oye = silencio.** La densidad de finders decide si la red sirve, muy por
encima de la cripto.

### 4.1 DECISIÓN — los devices Guardian SON la red de finders

Diferencia clave con AirTag: el tag de Apple es pasivo y lo lleva una persona
quieta → sin flota de móviles ambiente nadie lo oye, por eso Apple NECESITA los
iPhones. **Guardian no: cada unidad va instalada en un vehículo —coche, moto,
furgoneta, bici, patinete— que circula, aparca y cruza calles y parkings.** El
propio device ES el finder móvil que AirTag no tenía. Se oyen entre sí sin
depender de teléfonos.

La heterogeneidad AMPLÍA la cobertura, no la diluye: las furgonetas reparten
todo el día por polígonos y barrios, motos y patinetes entran donde un coche no
(carriles bici, cascos históricos, aceras), los coches cubren autovías y
parkings. Cada tipo de vehículo pinta una malla distinta; juntas suman.

- **Densidad geográfica > densidad total.** Arrancar por ciudad/comunidad, no
  disperso por el mapa.
- Es débil al arranque (pocas unidades), pero autosuficiente: cero coste de
  batería/permisos/privacidad de terceros.

Honestidad sobre el patrón de robo: los finders son vehículos que CIRCULAN, y
los robos pasan donde el vehículo está quieto — aparcado de noche en la calle
(tráfico de finders mínimo, BLE a ~10-50 m) o directamente guardado en casa
(una bici o patinete dentro: ningún finder lo oye, pero tampoco hace falta
hasta que sale). Con flota pequeña, F-A en aparcado quieto es lotería justo
donde más se necesita. La asimetría que sí juega a favor: **F-B solo necesita
que un finder oiga la baliza UNA vez** (corroboración de jamming), y **F-A en
fase de fuga tiene finders alrededor** (el vehículo robado circula entre
tráfico, o es conducido/pedaleado por calles con otros vehículos). Con flota
pequeña el valor realista es F-B + el tramo en movimiento de F-A; el aparcado
quieto crece con la densidad.

### 4.1.1 DECISIÓN — el móvil NO es finder (descartado)

Descartado a propósito: usar la app como finder en background exige permiso de
**ubicación en background** (revisión brutal de store), drena batería, escanea
balizas de terceros (consentimiento + DPA) y añade complejidad que no se va a
poder sostener. La red la forman **solo los devices Guardian**. Sin excepción.

### 4.2 DECISIÓN — baliza adaptativa (encaje con flota pequeña)

Con pocos finders hay que exprimir cada oído. La baliza cambia de comportamiento
según el estado del device:

- **Normal:** rota lento, emite bajo. Ahorra batería, discreto.
- **Modo robado** (disparado por el dueño / por F6): rota más rápido + emite más
  fuerte y más a menudo → toda la red cercana lo capta.

Esto es lo que hace que la red funcione con pocos nodos donde AirTag necesitaría
millones. HUECO: requiere firmware (control de potencia/cadencia BLE).

### 4.3 DECISIÓN — el coste de SER finder se declara y se acota

§4.1 promete "cero coste de batería/permisos/privacidad" y es cierto — para
TERCEROS. Pero el escaneo BLE y la subida corren en el propio Guardian y salen
por SU SIM: bici y patinete van a batería, y el propietario paga los datos que
relayan a desconocidos. Sin política, eso se paga en flota muerta o en soporte.

- **Duty-cycle de escaneo por alimentación:** rail 12 V (coche, moto, furgón)
  → escaneo continuo. Clase batería (bici, patinete) → escaneo por ventanas
  ligado al movimiento (LIS3DH); un finder quieto no oye balizas de vehículos
  quietos, y ese par (quieto-quieto) ya estaba descartado en la honestidad de
  §4.1.
- **Budget de datos mensual** para el rol finder por device: los reportes son
  KB; el cap protege la SIM del propietario, no la red.
- **Default-on con opt-out** explícito en la app + transparencia de qué sube
  (blob cifrado ajeno, sin identidad, con tu ubicación ilegible para el
  servidor). Opt-in puro mata la densidad de §4.1; default silencioso es
  tramposo con quien paga la SIM.
- HUECO: números (mJ por ventana de escaneo, KB/mes) y política final, junto
  al firmware (tarea 5b).

---

## 5. Parámetros de seguridad (a fijar antes de firmware)

| Parámetro | Valor propuesto | Por qué importa |
|---|---|---|
| `T_rot` baliza (normal) | 15 min | Rotación lenta = un sniffer local enlaza trayectos |
| `T_rot` baliza (modo robado) | 1-2 min | Captura máxima; enlazabilidad ya no importa (quieres que lo sigan) |
| Cifrado de reporte | ECIES (curva a fijar, P-256) | E2E finder→dueño |
| Retención de reportes | 7 días | Minimización; suficiente para un robo |
| `k` (k-anonimato heatmap) | ≥ 5 | Menos = reidentificable |
| Precisión geohash heatmap | ~1 km | Fino = fuga de ubicación individual |
| Viaje de activación `X` (G1 arranque) | ≥ ~5-10 min en movimiento (cualquier vehículo) | Corto = falseable; largo = fricción al instalar |
| Transición a SUSPECT | lenta, varios trayectos + señal corroborante | Rápido = DoS de cegado anti-robo (jamear BLE → device se calla → robar); lento = ventana stalking más larga |
| Ratio de co-presencia `R` (G1 baseline) | ≥ ~50-70% de trayectos, ventana rodante `W` ~7-14 días | Puntual = falseable (activador de una vez); alto = pasajero frecuente persiste (F-DV6, asumido) |
| Supresión de encubrimiento en robo (G1) | ~7 días | Corto = delata en robo; largo = víctima tarda en descubrir |
| Dead-man switch de baliza (G4) | ~3-7 días sin sync → baliza OFF (≤ retención) | Device irreachable emitiendo ratchet viejo = ventana del viejo dueño |
| Duty-cycle de escaneo finder (§4.3) | continuo en rail 12 V; por ventanas en clase batería | Presupuesto energético del rol finder |
| Barrido de índice `δ` en consulta (drift RTC) | acotado por error de reloj (ppm × horas sin sync); p. ej. ±unos índices | Índice por TIEMPO (dec. 21): δ NO crece con las rotaciones transcurridas, solo con el drift |

---

## 6. HUECOS de seguridad (worst-case)

Ordenados por gravedad. Cada uno con decisión.

### G1 (CRÍTICO) — Anti-stalking vs anti-robo — DISEÑO CERRADO

El conflicto de partida parece irresoluble (trilema):

1. **Encubierto** — el ladrón no lo encuentra (anti-robo).
2. **Anti-stalking técnico** — no se puede usar para espiar a una persona.
3. **Sin fricción** — comprar y usar, sin taller, vale para cualquier vehículo:
   coche, moto, furgoneta, bici, patinete.

La industria eligió dos y renunció a una: Apple/Tile eligieron 2+3 (sus trackers
se delatan → malos anti-robo); los trackers GPS de vehículo eligieron 1+3 (no
resuelven stalking técnicamente, lo dejan en ley + registro). Guardian necesita
las **tres**. Se cierran con el mecanismo de esta sección.

**El alta NO basta y NO resuelve el stalking.** El alta protege la integridad
del vínculo dueño↔device (no robar propiedad, no reasignar en silencio — `v0_7`
release), pero el stalker **no roba propiedad**: da de alta su propio device de
forma legítima y lo **planta** en el vehículo de la víctima. El alta no puede
saber en qué vehículo está físicamente el device. Hace falta un mecanismo en el
propio device.

#### La idea núcleo — la ubicación sigue al CONDUCTOR, no al "dueño" remoto

La asimetría que lo cierra **no** es "¿está el dueño cerca del device?" (el
conviviente la falsea: vive con la víctima, su móvil está junto a la bici
aparcada en casa). Es:

```
Dueño legítimo:       CONDUCE su vehículo → su móvil viaja CON el device
                      durante el movimiento (co-presencia EN MOVIMIENTO).
Stalker (cualquiera): NO conduce el vehículo de la víctima → durante los
                      trayectos de la víctima su móvil NO va a bordo.
```

**Un trayecto se reporta al dueño solo si el dueño fue co-presente EN ESE
trayecto.** El conviviente que planta el device en la bici de la pareja no va
montado cuando ella circula → esos trayectos **no se le reportan**. Es el cambio
que mata el stalking de pareja/violencia de género — el caso más peligroso, no
un residual.

#### DOS gates independientes (la pieza que lo ordena todo)

El error era mezclar dos cosas. Van separadas:

- **Gate REPORTAR-AL-DUEÑO** — ¿el dueño ve la ubicación?
- **Gate ENCUBRIMIENTO** — ¿se suprime la detectabilidad DULT (el device queda
  oculto al que conduce)?

Observación que lo simplifica: **DULT se auto-dirige.** Solo alerta a un
co-viajero que NO es el dueño. Al dueño legítimo (su móvil emparejado va a bordo)
**nunca** le salta. Luego la detectabilidad puede estar **encendida por defecto**
sin molestar al dueño: solo "muerde" cuando el device viaja con un no-dueño — que
es exactamente el caso stalking. **El encubrimiento solo se suprime durante la
recuperación de un robo REAL** (baseline dueño=conductor que se rompió, R3).

Consecuencia directa (corrige el antiguo R4): **el ANTI-ROBO es inmediato; lo que
NO se regala es el encubrimiento.** Un device recién puesto protege desde el
minuto uno, aunque sea detectable. Lo que se gana/pierde según co-presencia es el
sigilo, no la protección.

#### Arranque: viaje de activación (resuelve el cold-start)

Activar exige un **viaje de arranque de ≥ X min** en el que el device confirma,
midiendo **acelerómetro + GPS compartidos** con el móvil autenticado del dueño,
que ese móvil va **en el mismo vehículo** (no solo cerca). Eso da baseline
dueño=conductor **fuerte e inmediato** → anti-robo pleno desde el día uno, sin
esperar días de aprendizaje. Es también la forma robusta de R2 (mismo-vehículo,
no "al lado").

#### Máquina de estados (device-side)

| Estado | Condición | Gate REPORTAR | Gate ENCUBRIR |
|---|---|---|---|
| **PROVISIONAL** | instalado, viaje de activación sin completar | no (inerte) | detectable |
| **ACTIVE** | viaje de activación hecho: dueño=conductor confirmado | **SÍ** | detectable (no molesta al dueño) |
| ⤷ **PARKED** | ACTIVE + quieto + dueño ausente (aparcado meses) | última posición; reporta si se mueve | detectable (nadie viaja) |
| ⤷ **STOLEN** | ACTIVE + se mueve sin el dueño, rompiendo baseline | **SÍ, activo** | **suprimido** en ventana recuperación |
| **SUSPECT** | conductor constante ≠ dueño (baseline nunca fue del dueño, o se volvió otro constante) | **NO** | **detectable, DULT dispara** |
| **LOANED** | dueño lo activa, **con caducidad** (préstamo/taller) | SÍ | detectable, **nunca oculto** |

Distinción robo vs stalking (la bisagra de R3):
- **Robo = ROTURA** de un baseline dueño=conductor → movimiento puntual no
  autorizado → reporta + encubre en la ventana de recuperación.
- **Stalking = ese baseline nunca fue del dueño, o el vehículo pasa a un conductor
  NO-dueño CONSTANTE** (uso diario) → no es recuperación → SUSPECT → no reporta +
  DULT dispara.
- **STOLEN es latch y no decae por duración.** Lo dispara la ROTURA de un
  baseline válido del dueño; que el ladrón conduzca dos semanas no lo convierte
  en "conductor constante nuevo" — SUSPECT exige que el baseline nunca fue del
  dueño o cambió sin rotura. Si STOLEN decayera a SUSPECT con el tiempo, el
  ataque sería esperar la ventana y conducir tranquilo. Lo que caduca (~7 días,
  §5) es el ENCUBRIMIENTO, no el reporte: expirada la ventana, DULT vuelve a
  ON y el reporte sigue hasta resolución manual (recuperado / release). La
  ventana se renueva solo con evidencia device-side (movimiento, relay), nunca
  por declaración del dueño (R3).

Dos costes declarados del modelo (no sorpresas después):
- **Gap frío:** entre instalar y completar el primer viaje de X min el device
  es inerte. La protección empieza al completar la activación, no al instalar
  — minutos-hasta-el-primer-trayecto, no cero (matiz a R4).
- **Vehículo compartido de conductores mezclados (familia/flota):** conductor
  constante ≠ dueño sin enrolamiento → SUSPECT → el dueño pierde la
  localización de SU propio vehículo. R5/F8 lo resuelve (enrolamiento
  consentido), pero cada conductor con app + consentimiento es fricción que
  roza el vértice "sin fricción" del trilema. Aceptado y declarado.

#### Baseline por co-presencia SOSTENIDA (ratio, no instantánea)

El baseline dueño=conductor **no se mantiene por un trayecto puntual**: se
sostiene solo si la co-presencia cubre ≥ R del total de trayectos en una
ventana rodante de W días (parámetros en §5). Consecuencias:

- El conviviente que hizo el viaje de activación y ya no acompaña → el ratio
  cae enseguida → SUSPECT rápido. "Montarse una vez" no sostiene nada.
- El pasajero frecuente (a bordo casi siempre) SÍ lo sostiene — es un leak
  declarado, no eliminable por diseño (F-DV6): mientras va a bordo ya sabe
  dónde está el vehículo; el leak marginal son los trayectos en solitario
  entre compartidos.

#### Anti-transplante: removal fuerza re-activación

Un stalker podría hacer el viaje de activación en SU vehículo y luego transplantar
el device a la víctima. Se cierra: **quitar/despegar el device (tamper LIS3DH, G6)
invalida el baseline y exige repetir el viaje de activación** en el vehículo
actual. Para plantarlo en la víctima tendría que hacer el viaje de ≥ X min **en el
vehículo de la víctima** → tendría que conducirlo → no puede. Backstop si el
removal no se detecta: la co-presencia continua (víctima conduce, dueño no a bordo,
conductor constante ≠ dueño) → SUSPECT → DULT dispara.

#### Reglas de cierre (obligatorias — sin ellas es teatro)

- **R1 — Todos los caminos de ubicación se gatean, no solo el LTE.** La red
  anónima (F-A) también localiza vía baliza; en PROVISIONAL/SUSPECT el device
  **no emite baliza resoluble por el dueño**, o el stalker lee la posición por la
  red aunque el device "no reporte".
- **R2 — Co-presencia medida LOCAL:** proximidad BLE reto-respuesta (`tag2`,
  `INTEGRACION_APP_DISPOSITIVO_v0_6.md:337-340`) + **movimiento común de
  acelerómetro** (mismo vehículo, no al lado), reforzada por el viaje de
  activación. **Nunca** correlación de tracks GPS en el servidor (spoofeable en
  remoto). Límite físico declarado: el acelerómetro certifica **mismo
  vehículo**, no mismo asiento — no distingue conductor de pasajero (ver
  F-DV6).
- **R3 — El encubrimiento solo se suprime en robo REAL** (baseline dueño=conductor
  que se rompió, ventana de recuperación). Sin ese baseline, o con conductor
  no-dueño constante, la detectabilidad **dispara** (stalking). Declarar "robado"
  no la suprime si nunca hubo baseline del dueño.
- **R4 — Anti-robo inmediato, encubrimiento ganado.** El device protege
  (reporta+alarma) desde que se completa el viaje de activación; el sigilo depende
  de la co-presencia continua. Nunca "no protege hasta aprender".
- **R5 — Visibilidad multi-conductor (flota/familia) exige CONSENTIMIENTO
  explícito de cada conductor.** Ata F8 (`v0_7`): misma lógica para flota
  (conductores enrolados que consienten) y anti-stalking (sin consentimiento →
  protege).
- **Sesión única (catch-22):** la cuenta solo puede estar logueada en **un**
  dispositivo (web y tokens incluidos). El stalker no puede mantener la presencia
  falsa en el vehículo de la víctima **y** consultar la ubicación a la vez.
  **Coste declarado:** ese mismo dispositivo es el nodo BLE load-bearing de
  co-presencia (R2), así que el dueño legítimo sacrifica el uso multi-dispositivo
  (web + móvil a la vez) por esta defensa. Y F-DV5 muestra que el catch-22 se
  rompe con un móvil plantado con acceso remoto — acota el "salvo ventana corta".

#### HUECO — key schedule POR ESTADO y formato DULT (pre-fab, bloquea R1)

R1 exige que en PROVISIONAL/SUSPECT el device emita baliza DULT-detectable pero
NO resoluble por el dueño. Eso no sale del ratchet único de §2: el dueño tiene
la semilla → resuelve cualquier `P_i` que ese ratchet emita. Hace falta un
**key schedule por estado**:

- ACTIVE/PARKED/STOLEN/LOANED → ratchet desde la semilla sincronizada (§2).
- PROVISIONAL/SUSPECT → ratchet desde una **sal local NO sincronizada**: el
  dueño no puede derivar `P_i` (no resuelve), la baliza sigue viva para DULT.

Y la interacción con DULT no es trivial: el frame DULT trae su propio formato
de identificación anti-spoofing; hay que definir cómo convive con la `P_i`
rotatoria (payload conjunto o frame paralelo). Pendiente de diseño junto a
5/9 antes de fabricar.

Misma ventana pre-fab: **la `P_i` comprimida (P-256) ocupa 33 bytes y el
advertisement BLE legacy solo lleva 31.** O la placa hace extended
advertising (BLE 5 — verificar la variante exacta de ESP32 del T-A7670E) o la
baliza se trocea en dos adv (como hace Find My). Condiciona firmware y el
escáner de los finders.

#### HUECO — viabilidad MÓVIL de la co-presencia (pre-fab; carga todo G1)

R2 exige sesión BLE sostenida móvil↔device en CADA trayecto — app cerrada,
móvil en el bolsillo — más accel del móvil (permiso Motion) para el movimiento
común. iOS mantiene conexiones background vía state restoration, pero las mata
bajo presión de recursos; cada falso negativo de co-presencia hunde el ratio R
y empuja a SUSPECT: el dueño pierde SU vehículo por un problema de radio, no
por un atacante. Es la misma clase de fricción background que descartó al
móvil-finder (§4.1.1) — con la diferencia de que aquí es el mecanismo
load-bearing de G1. Antes de fabricar: validar bonding + intervalo de conexión
largo + RSSI y presupuesto de reconexión en iOS/Android objetivo, medir la
tasa de falso negativo de co-presencia, y calibrar `R` y `W` (§5) CON esa
tasa — un R sin margen sobre radios reales convierte la protección en falsos
SUSPECT.

#### Detectabilidad DULT (red de seguridad irrenunciable)

Alinear con **DULT** (estándar IETF Apple+Google, *Detecting Unwanted Location
Trackers*): un tracker compliant lo detecta de forma **nativa cualquier
iPhone/Android** → la víctima recibe el aviso sin necesitar nuestra app.
**Mando central a tunear:** cuánto se suprime en la ventana de recuperación de
robo. Corto → delata en robo; largo → víctima tarda. ~7 días enhebra ambos;
DULT estricto puede exigirlo antes (tuning + jurisdicción).

#### Modo préstamo / taller (estado LOANED)

Caso real: dejas el vehículo a alguien (o lo llevas al taller). Otro lo conduce,
no vas a bordo, y quieres seguir localizándolo **sin** que salte la alarma de
robo ni el anti-stalking. El problema: eso es **funcionalmente idéntico al
stalking** (alguien que no eres tú conduce y tú sigues viendo dónde está).

Lo que separa préstamo legítimo de stalking no es el rastreo, es
**consentimiento + transparencia**. Regla de oro:

> **LOANED da localización-SIN-alarma, NUNCA localización-OCULTA.**

- Un prestador legítimo no tiene motivo para esconder el device del que conduce;
  un stalker sí. Por eso en LOANED la **detectabilidad DULT sigue ENCENDIDA**: el
  conductor siempre puede descubrir el device. Solo se suprime la **alarma de
  robo** y se mantiene tu localización.
- **Time-boxed:** caduca solo. Préstamo indefinido encubierto = no permitido.
- Conductor **con app** → recibe aviso "usas el vehículo de X; puede ver la
  ubicación hasta HH:MM" y acepta (consentimiento explícito).
- Conductor **sin app** → la detectabilidad DULT encendida es la transparencia de
  respaldo.
- **Modo taller** = un LOANED corto y acotado; mismo mecanismo, misma regla.
- **Robo DURANTE el préstamo degrada la detección — declarado.** En LOANED la
  ausencia del dueño es lo normal, así que la co-presencia no distingue al
  prestatario del ladrón: quedan el tamper (G6) y el ojo del dueño sobre la
  trayectoria (F-A). Cerrarlo del todo exigiría enrolar al conductor (R5/F8),
  justo lo que LOANED evita cuando no hay app.

Por qué no reabre G1: si un abusador activa LOANED para espiar, el móvil de la
víctima **detecta igual el tracker desconocido** (DULT) → lo encuentra. Gana
"sin alarma" pero no gana "oculto", y oculto es lo que el stalking necesita.
Invariante: **préstamo ≠ ocultar.**

#### Residual estructural — la ventana mínima (el suelo)

El único caso que NO da leak cero es el conviviente que hace el viaje de
activación en el vehículo de la víctima (convive, puede montarse una vez). Tras
eso, la víctima conduce sola. Distinguir "robo" (reporta al dueño) de "nuevo
conductor constante = stalking" (no reporta + revela) **exige observar unos pocos
trayectos**: no se puede saber al instante si un vehículo que se aleja del dueño fue
robado o simplemente lo usa otro ahora. Ese es el suelo físico: **una ventana
corta y acotada** (unos trayectos) en la que el conviviente ve ubicación, antes de
que el chequeo de conductor-constante lo pase a SUSPECT y dispare DULT.

Se minimiza con: identidad de conductor continua (activador ≠ conductor real →
SUSPECT rápido), ratio de co-presencia (montarse una vez no sostiene el
baseline, ver §Baseline por co-presencia sostenida), sesión única (mantener
presencia XOR consultar) y reveal. No se elimina del todo — ninguna tecnología
lo hace — pero queda en trayectos, no en semanas.

#### Residuales HONESTOS — fuera del alcance del tracker

- **F-DV1 — Víctima sin smartphone:** DULT nativo no la alerta → mitigar con
  **chirp audible físico**, no solo BLE.
- **F-DV2 — Abusador controla el móvil de la víctima** (stalkerware): puede
  suprimir el aviso DULT, pero entonces ya la espía sin Guardian; es otra
  superficie (nivel dispositivo), fuera del alcance del tracker.
- **F-DV3 — El reveal puede ESCALAR el peligro:** avisar puede provocar violencia
  si el abusador se entera. El reveal debe ser discreto y guiado a recursos (buenas
  prácticas DULT/violencia de género). **Se diseña CON expertos en violencia de
  género, no solo ingeniería.** Esta parte es humana, no criptográfica.
- **F-DV4 — Caja Faraday total:** mata LTE y BLE a la vez → silencio absoluto sin
  corroboración posible. Lo único que dispara es F6 server-side
  (`v0_7.md:132-152`): el dueño sabe QUE se fue a oscuras, no DÓNDE. Límite
  físico asumido.
- **F-DV5 — Teléfono plantado con acceso remoto:** el catch-22 de sesión única
  asume que el stalker no deja su propio móvil a bordo consultando desde lejos;
  un móvil plantado con acceso remoto (tethering/scrcpy) lo rompe. Caso
  esotérico, pero acota el "salvo ventana corta" de G1.
- **F-DV6 — El pasajero frecuente:** el acelerómetro certifica mismo vehículo,
  no mismo asiento (R2). Un abusador que acompaña a bordo de forma habitual
  sostiene el ratio de co-presencia → nunca SUSPECT → ve los trayectos en que
  la víctima va sola. Mitigaciones parciales: mientras va a bordo ya conoce la
  ubicación (el leak marginal es solo-trayectos-entre-compartidos), mantenerlo
  exige presencia física constante — visible y arriesgada para él — y DULT no
  dispara (el dueño va a bordo). Límite físico del sensor, no de diseño; no se
  elimina, se declara.

### G2 (ALTO) — Metadatos del finder filtran a quien retransmite

El contenido va cifrado, pero el reporte lo sube el finder desde SU módem / SU
IP a una hora. Ser honestos con el alcance: la ceguera del diseño es —y solo
puede ser— el enlace **baliza↔dueño**. El operador del servidor SÍ puede inferir
qué finder subió: el reporte ciego viaja por la misma conexión que la telemetría
autenticada de ese device (misma IP / sesión TLS), cuya posición el backend ya
conoce legítimamente. Anonimato pleno del finder frente al operador no es
alcanzable ni necesario; la promesa real es que el reporte NO NECESITA
identidad de finder y que la correlación casual se encarece.

**DECISIÓN:** reportes en lote, sin identidad de finder en el payload, con
mezcla temporal y jitter (retraso aleatorio por reporte). Nada de ID de finder.
Proxy/relay de subida que despoje IP solo si algún despliegue lo exige.
HUECO: batching/jitter sin diseñar en detalle.

### G3 (ALTO) — Envenenamiento del heatmap (Sybil)

Finders falsos inyectan eventos y ensucian las zonas. Pero exigir atestación
del finder para filtrar Sybil vincula el reporte a un device real → choca con el
anonimato de la red.

**DECISIÓN:** credencial anónima (blind signature / VOPRF tipo Privacy Pass): el
finder prueba "soy un Guardian legítimo" sin revelar cuál. Es la pieza cripto
más verde del diseño. HUECO: no construido. **Alcance ampliado:** para F-C no
basta "soy legítimo" — hace falta emisión ACOTADA por `(device, celda, época)`
para que el conteo de k cuente reporteros distintos y no tokens repetidos (ver
HUECO distinto-XOR-unlinkable en §3 F-C).

### G4 (ALTO) — Reset de baliza vs `seq` en release

La semilla de baliza deriva de K_root (§2). Al hacer release+rotación de K_root
(`v0_7.md:154-184`, F1/F2), el device debe re-derivar la semilla y abortar el
ratchet viejo **en el mismo paso atómico** — nunca seguir emitiendo `P_i` del
ratchet anterior. El vendedor conserva la semilla vieja: no podrá leer reportes
nuevos, pero sí resolver los que queden vivos ≤ 7 días de retención si el
device siguiera emitiendo el ratchet viejo. La rotación debe matar el ratchet
en el acto. Atarlo al mismo reset que `lastSeq=0`.

Esa atomicidad es imposible con un device irreachable (venta conflictiva,
jamming): sin contacto sigue emitiendo el ratchet viejo y el viejo dueño
resuelve reportes POST-release hasta la reconexión. Cierre — **dead-man
switch de baliza:** el firmware apaga la baliza tras N días sin sync con el
servidor (N ≤ retención; ~3-7 días, §5). Nunca un ratchet viejo indefinido:
lo peor es una ventana acotada de N días.

**HUECO cerrado — el dead-man NO puede ser ciego al estado, o mata F-A en el
robo con jamming.** "N días sin sync → baliza OFF" aplicado a secas apaga la
baliza justo en el escenario estrella: robo con LTE jammeado = cero sync por
definición → el vehículo robado se queda MUDO tras N días, matando el relé F-A
cuando más se necesita. La fuga que el dead-man cubre (viejo dueño resolviendo
tras un release) **solo existe si hubo release** — y un release NO ocurre en
mitad de un robo. **DECISIÓN — dead-man dependiente del estado:**

- **STOLEN (robo auto-detectado, baseline roto):** dead-man SUSPENDIDO. No hay
  release, no hay dueño nuevo; la misión es seguir vivo para F-A. La
  confidencialidad no está en juego (el resolutor legítimo NO cambió).
- **ACTIVE/PARKED sin release y N días sin sync:** dead-man DISPARA. Cubre el
  traspaso silencioso (venta con device offline) sin coste — en aparcado quieto
  F-A ya no aporta (§4).
- **Backstop independiente:** la retención de 7 días ya CADUCA cualquier reporte
  que el viejo dueño pudiera resolver; el dead-man solo estrecha la ventana
  dentro de esa cota, no la crea.

### G5 (MEDIO) — Sniffer local sigue el vehículo en tiempo real

Un ladrón con un escáner BLE al lado del vehículo puede seguir la baliza localmente
mientras no rote. `T_rot` es el parámetro de defensa (§5). En modo robado
priorizamos captura sobre no-enlazabilidad a propósito (queremos que lo sigan),
así que este riesgo se acepta explícitamente en ese modo.

**DECISIÓN adicional:** la baliza debe ser **genérica** (sin service-UUID que la
identifique como Guardian) y de duty-cycle bajo en modo normal, o un ladrón barre
el vehículo buscando "una baliza tipo Guardian" para arrancarla. Encubrimiento
parcial; aceptado.

### G6 (ALTO) — El tamper es de doble filo (interruptor del ladrón)

Si "removal → invalida baseline → silencio", un ladrón que **arranca el device**
lo hace callar. Pero arrancarlo estando ACTIVE/PARKED y sin el dueño debe ser
**ALARMA de robo**, no silencio.

**DECISIÓN:** el manejo de tamper es **dependiente del estado** (LIS3DH,
`MAPA:22`): removal en ACTIVE/PARKED → **alarma + reporta YA** (robo, vía red si
hay jamming). La invalidación del baseline (exigir nuevo viaje de activación,
anti-transplante G1) solo rige cómo **re-establece** después, nunca suprime la
alarma del momento.

Honesto: LIS3DH es acelerómetro, no interruptor mecánico — un removal
cuidadoso (lento, sin sacudidas) puede no dispararlo. El backstop no cambia:
la co-presencia por ratio tras el transplante → SUSPECT → DULT. La ventana se
alarga unos trayectos; no se elimina la defensa. Considerar sensor de
tamper dedicado (interruptor óptico/magnético de carcasa) en la revisión de
hardware pre-fab.

### G7 (ALTO) — Ingest del relé sin autenticación: flooding + ubicación falsa

El endpoint ciego acepta `(h, C, ts)` de cualquiera y el servidor no puede
verificar `C` sin `d_i`. Dos ataques reales:

- **Ubicación falsa:** quien oiga una `P_i` UNA vez (ladrón con escáner BLE)
  sube `C = ECIES(P_i, L_falsa)` → envenena el mapa del dueño DURANTE la
  recuperación: lo manda al sitio equivocado o contamina la evidencia.
- **Flooding:** basura sobre cualquier `h` conocido → storage × 7 días de
  retención y la app trial-decriptando ruido.

**DECISIÓN (capas):**

1. **Ventana temporal dentro del AEAD:** el `ts` fino va DENTRO de `C`; el
   cliente rechaza al descifrar lo que quede fuera de ventana (anti-replay de
   reporte). **Ojo: `P_i` es una clave PÚBLICA** — quien la oye cifra un `C` con
   `ts` fresco y válido. Esta capa para el REPLAY, NO la forja fresca; contra
   forja fresca solo valen las capas 3 y 4.
2. **Rate-limit y cap por `h`:** máximo N reportes por `h`·ventana. El flood
   queda acotado por diseño, no por moderación. El cap **rechaza el exceso y
   nunca desplaza lo ya admitido** (reject-not-evict): si expulsase, quien
   oyó una `P_i` una vez inunda dentro del propio cap y evicta el track
   legítimo — el DoS se pagaría con el presupuesto del cap.
3. **Credencial anónima por lote (extiende G3):** subir reportes de red
   consume un token blind-signature/VOPRF: "soy un Guardian legítimo" sin
   revelar cuál. Misma pieza que el heatmap.
4. **Cliente escéptico:** en modo robado hay muchos `P_i` y muchos finders; la
   app agrupa por ventana y descarta outliers antes de pintar el track.
   **Corrección honesta:** un track falso NO es caro — quien oyó `P_i` una vez
   sintetiza N puntos auto-consistentes en cualquier trayectoria (solo necesita
   la clave pública). El clustering por consenso solo gana si los finders
   HONESTOS superan al atacante alrededor del vehículo, y §4 admite que con flota
   pequeña / aparcado quieto los honestos son ~0 justo ahí. → La capa 4 NO basta
   sola en el régimen operativo declarado; la integridad de F-A recae en la
   **capa 3 (token anónimo)**.

**Consecuencia para el plan:** F-A NO es íntegra sin la capa 3 (token G3/G7.3),
que §8 pone como tarea 7 (alto, no construido). El "MVP 1-4" LOCALIZA pero es
envenenable durante la recuperación hasta que exista el token — un atacante con
un escáner BLE contamina el track. Reflejado en §8/§9.

HUECO: N por `h`·ventana y tamaño de ventana, a fijar con el ingest (tarea 2b).

### G8 (ALTO) — El canal de CONSULTA del dueño des-ciega al servidor

G2 cubre los metadatos del finder, pero nadie miró los del que CONSULTA. Si el
pull de reportes va autenticado, el servidor ve `owner → h_i`, y las subidas ya
están indexadas por esos mismos `h`: tiene el mapa device↔baliza sin descifrar
nada — y con él la correlación F-B entera (cuándo fue oída una baliza, desde
qué IP de finder), que es justo la que la DECISIÓN de §3 prohíbe hacer al
servidor. La tabla de propiedades de §2 sería falsa por el camino de lectura.

**DECISIÓN — pull ciego, sin autenticar.** La clave de acceso es solo `h`: el
contenido es inútil sin `d_i`, `h` es inadivinable (preimagen de SHA-256 sobre
una clave efímera) y responder no es oráculo (entrega ciphertexts que el
atacante ya podría haber subido él mismo). Sin cookie de sesión, sin token de
cuenta en ese endpoint; rate-limit por IP. La app agrupa las `h` de su ventana
y añade jitter y mezcla temporal, igual que G2. **El rate-limit por IP debe
contemplar la ráfaga legítima del dueño en modo robado** (`T_rot` 1-2 min ×
ventana × δ = muchas `h`): la consulta va por LOTE de `h` en una sola petición,
no una por `h`, o el rate-limit estrangula al dueño justo en la recuperación.

**Residual declarado (espejo de G2, mismo suelo):** la IP del pull puede
correlacionarse estadísticamente con el dueño (comparte salida de red con su
tráfico autenticado). Anonimato pleno del consultante frente al operador no es
alcanzable, igual que el del finder. Lo que se mantiene — y un pull
autenticado rompería — es que el servidor no recibe el mapa owner→baliza:
solo le queda inferencia de metadatos, no identidad criptográfica.

---

## 7. Cómo encaja con lo que ya hay

```
        CRIPTO EXISTENTE (v0_6/v0_7)
   K_root + HKDF-SHA256 · protocolo v2 · watchdog F6 · seq/F2
                        │
        ┌───────────────┼───────────────┐
     BALIZA          RELÉ (F-A)      CORROBORACIÓN (F-B)
   (deriva de        finder→dueño     watchdog F6 × baliza viva
    K_root, §2)       E2E cifrado      (correlación en cliente)
                        │
                    HEATMAP (F-C)
                 canal agregado k-anón
```

La red no introduce un secreto nuevo en el servidor: la semilla de baliza se
deriva de K_root (que YA existe) y transita UNA vez device→app por BLE
autenticado; el servidor jamás la ve. F-B es literalmente el watchdog F6
cruzado con la señal de red. F-C es un canal de telemetría aparte.
Reutilización máxima, superficie nueva mínima.

---

## 8. Plan de trabajo (ordenado por lo que HABILITA, no por lo fácil)

| # | Tarea | Capa | Habilita | Coste |
|---|---|---|---|---|
| 1 | Derivación de baliza desde K_root (ratchet + P_i) | firmware+backend | §2 | medio |
| 2 | Ingest de reportes ciegos (`hash(P_i)`, C, ts) | backend | F-A | medio |
| 2b | Endurecer ingest: ts fino en AEAD + rate-limit/cap por `h` + token anónimo por lote + clustering anti-outlier en app | backend+app | G7 | bajo-medio |
| 3 | Consulta+descifrado en cliente — pull ciego por `h` sin autenticar (G8) + barrido ±índices | backend+app | F-A, G8 | medio |
| 4 | Corroboración F6 × baliza (client-side, directa + heurística inversa) | app | F-B | bajo |
| 5 | Baliza adaptativa (normal/robado) | firmware | §4.2, captura con pocos nodos | alto (pre-fab) |
| 5b | Política rol finder: duty-cycle por clase, budget de datos, opt-out (§4.3) | firmware+app | §4.3 | bajo-medio |
| 6 | Canal heatmap agregado + k-anón + DP | backend | F-C | medio |
| 7 | Credencial anónima anti-Sybil (blind sig/VOPRF) | backend+firmware | G3 | alto |
| 8 | Máquina de estados co-presencia-en-movimiento (dos gates) + viaje de activación (X min, accel+GPS) + baseline por ratio R/W + tamper→re-activación + gate de todos los caminos (R1) + DULT | firmware+app+backend | G1 (anti-stalking + anti-robo inmediato), legal | alto (pre-fab) |
| 8b | Sesión única total (web + tokens) + consentimiento por conductor (R5) | backend | G1 catch-22, ata F8 | medio |
| 9 | Reset de baliza atado a release/K_root | firmware+backend | G4 | alto (pre-fab) |
| 10 | Estado LOANED (préstamo/taller): sin alarma, localiza, DULT ON, time-box | firmware+app | caso préstamo sin reabrir G1 | medio |

Regla: 1-4 son el MVP de red (F-A + F-B) sobre la flota de devices, que ya son
finders móviles (§4.1); 2b sube con 2 — el ingest no se despliega desnudo (G7).
**Aviso de integridad:** 1-4 LOCALIZA pero es envenenable durante la recuperación
(G7: `P_i` pública → forja fresca; el clustering cliente no basta con flota
pequeña). La integridad de F-A recae en el **token anónimo (tarea 7), que por eso
deja de ser opcional post-MVP**: sin él, F-A muestra tracks que un atacante con un
escáner puede contaminar. Igual para F-C, que además exige el token ACOTADO por
celda-época (k-anon real, no nominal).
5/9, el **key schedule por estado + formato DULT + troceo BLE de 33 B** y la
**viabilidad BLE background de la co-presencia** (HUECOs de G1) deben quedar
decididos **antes de fabricar** (control de baliza desde el arranque). El móvil
como finder está **descartado** (§4.1.1).

---

## 9. DECISIONES FIJAS

1. **La red es una lectura, no un device nuevo (§1.1).** Un mecanismo, tres
   features.
2. **Cripto fiel a AirTag: servidor ciego + claves rotatorias + E2E (§2).**
   Irrenunciable en cualquier tamaño de flota.
3. **La densidad es EL problema, no la cripto (§4).** Los devices Guardian YA
   son la red de finders porque son móviles (§4.1). El móvil como finder está
   **descartado** (§4.1.1): complejidad + permisos + privacidad que no se sostiene.
4. **Baliza adaptativa (§4.2)** es lo que hace viable la red con flota pequeña
   donde AirTag necesitaría millones.
5. **Corroboración (F-B) en cliente, nunca servidor (§3).** O se rompe el
   anonimato.
6. **Heatmap solo agregado y grueso: k ≥ 5, ~1 km, DP (§3 F-C).** Fino = fuga.
   El k-anon exige token ACOTADO por `(device, celda, época)`: sin él, "5
   reporteros distintos" es simulable por un Sybil con 5 tokens (HUECO
   distinto-XOR-unlinkable, §3 F-C).
7. **Anti-stalking + anti-robo cerrados por DOS GATES independientes (G1):**
   REPORTAR-AL-DUEÑO (¿ve la ubicación?) y ENCUBRIR (¿oculto al conductor?). La
   ubicación sigue al **conductor** (co-presencia EN MOVIMIENTO, R2), no al dueño
   remoto. **Anti-robo inmediato** vía viaje de activación (X min, accel+GPS);
   el **encubrimiento se gana/pierde** con la co-presencia (corrige R4). DULT
   se auto-dirige: solo alerta a un co-viajero no-dueño → nunca molesta al dueño;
   se suprime solo en robo REAL (R3). Anti-transplante por tamper→re-activación.
   Mata stalking de desconocido **y** de conviviente, salvo una **ventana corta
   acotada** (unos trayectos, el suelo físico de distinguir robo de
   nuevo-conductor) y el **pasajero frecuente** (F-DV6: mismo vehículo ≠ mismo
   asiento, límite del sensor). El baseline se sostiene por **ratio de
   co-presencia en ventana rodante** (R/W, §5), no por trayecto puntual.
   Residual fuera de alcance: víctima sin móvil, móvil comprometido, y UX del
   reveal **a diseñar con expertos en violencia de género**.
8. **Metadatos del finder son el eslabón débil real (G2):** lote + mezcla + sin
   ID de finder.
9. **Anti-Sybil por credencial anónima (G3),** no por atestación identificable.
   Alcance: no solo "soy legítimo" sino emisión ACOTADA por celda-época para que
   el k-anon de F-C cuente reporteros distintos (HUECO distinto-XOR-unlinkable).
10. **Sin mesh multi-hop ni routing (§1):** descartado por superficie de ataque.
11. **El gateo de reporte vive en el DEVICE, no en el servidor (G1):** un
    operador curioso/comprometido no debe poder flipear el estado para habilitar
    stalking o cegar el anti-robo. **Sin backdoor de soporte** que salte la
    co-presencia.
12. **Tamper dependiente del estado (G6):** removal en ACTIVE/PARKED = alarma de
    robo, nunca silencio; y fuerza re-activación (anti-transplante). No convertir
    el anti-stalking en el interruptor del ladrón.
13. **Modo préstamo/taller (LOANED) = localización SIN alarma, NUNCA oculta
    (G1):** time-boxed, detectabilidad DULT siempre encendida. Préstamo ≠ ocultar,
    por eso no reabre el stalking.
14. **Ingest del relé endurecido (G7):** ts fino dentro del AEAD (para REPLAY, no
    forja fresca — `P_i` es pública), rate-limit y cap por `h` (reject-not-evict),
    token anónimo por lote (extiende G3) y cliente escéptico con outliers. **La
    integridad de F-A recae en el token, no en el clustering** (inútil con flota
    pequeña): sin token, quien oiga una baliza una vez envenena la recuperación
    con un track falso auto-consistente.
15. **Key schedule por estado (G1/R1):** PROVISIONAL/SUSPECT ratchean desde una
    sal local no sincronizada — baliza viva para DULT, irresoluble para el
    dueño. HUECO pre-fab junto al formato DULT y al troceo BLE (33 B > 31 B
    legacy).
16. **Pull ciego (G8):** la consulta de reportes va sin autenticar — la clave
    es solo `h`; el servidor no recibe el mapa owner→baliza. Residual de IP
    declarado, mismo suelo que G2.
17. **El rol finder tiene coste y se acota (§4.3):** duty-cycle por
    alimentación, budget de datos por SIM, default-on con opt-out. "Cero
    coste" era solo de terceros.
18. **Dead-man switch de baliza (G4), DEPENDIENTE DEL ESTADO:** N días sin sync →
    baliza OFF en ACTIVE/PARKED (traspaso silencioso), pero SUSPENDIDO en STOLEN
    — o el jamming del robo apagaría el relé F-A justo cuando importa. La retención
    de 7 días acota la fuga aparte. Nunca un ratchet viejo indefinido tras un
    release.
19. **STOLEN es latch (G1):** caduca el encubrimiento (~7 días), no el reporte;
    renovación solo por evidencia device-side, nunca por declaración (R3).
20. **La co-presencia es un problema de radio móvil, no de cripto (G1):** BLE
    background sostenido móvil↔device es el mecanismo load-bearing de G1 —
    medir falsos negativos y calibrar R/W con ellos, antes de fab.
21. **Ratchet de baliza indexado por TIEMPO, no por cadena (§2):**
    (d_i, P_i) = KDF(semilla, floor(reloj/T_rot)). Sin estado de cadena → el
    dueño resuelve cualquier ventana derivando directo; el barrido i±δ lo fija el
    drift del RTC (ppm × horas), acotado, NUNCA el número de rotaciones
    transcurridas. Una cadena count-indexed haría el resync inviable tras un
    PARKED de meses o tras estados con sal local (dec. 15).
