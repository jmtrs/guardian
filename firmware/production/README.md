# Firmware de producción (candidato de banco)

Este directorio contiene ya un binario ESP-IDF separado de `bringup`. El
primer corte ejecuta una única cadena productiva:

1. recupera una outbox NVS y reintenta exactamente sus bytes;
2. hace durable cualquier movimiento antes de limpiar el latch LIS3DH;
3. crea `suspected_movement` cuando el slot queda libre;
4. firma con `K_event`, acepta solo HTTP 202/409 como terminal;
5. arma wake por IO34 y timer, apaga/retiene el módem y duerme.

La identidad se admite solo desde NVS ya aprovisionada. Una lectura parcial,
identidad inválida, blob truncado o CRC incorrecto detiene el ciclo sin enviar.
`K_root` y `K_event` se zeroizan al salir de memoria.

## Compilar sin tocar la placa

```bash
. ~/export-esp.sh
cd firmware/production
cargo clippy --release -- -D warnings
cargo build --release
```

CI ejecuta ambos comandos para `xtensa-esp32-espidf`. Ninguno flashea ni
modifica eFuses.

## Flash reversible del candidato

Este no es todavía un firmware de fabricación. Antes de grabar la LILYGO con
el banco montado hay que desconectar físicamente el cable 11
(`ESP32-S3 GPIO17 -> LILYGO RX`), que compite con el CH340. El runner lo exige:

```bash
GUARDIAN_CABLE_11_DISCONNECTED=1 cargo run --release
```

El build valida `partitions.csv` con la herramienta oficial de ESP-IDF y deja
su resultado como `partition-table.bin`; el runner graba exactamente ese
artefacto. La tabla preserva la NVS en `0x9000` y reserva `nvs_keys`. No se
activa cifrado en la unidad de bring-up.

## Gate irreversible para una placa designada

`sdkconfig.security.defaults` es una plantilla de revisión, no el default
activo. Secure Boot y Flash Encryption cambian eFuses en el primer arranque;
ningún comando ordinario ni CI los habilita.

1. Generar la clave RSA-3072 fuera del repositorio y del equipo de desarrollo.
2. Resolver un `sdkconfig` de fabricación y validarlo:

   ```bash
   firmware/production/check-security-config.sh path/al/sdkconfig release path/al/proyecto
   ```

3. Guardar backup de eFuses y probar recuperación/OTA en una placa designada.
4. Ejecutar power-cut y recuperación NVS antes de autorizar fabricación.

El gate exige Secure Boot v2, flash encryption `release`, NVS cifrada y ROM
download inseguro desactivado. Nunca debe aplicarse a la unidad de bring-up sin
una decisión explícita.

## Pendiente antes de llamarlo producción

- prueba real de cortes durante escritura y envío;
- P4 GNSS+LTE y P5 desde 12 V;
- clasificación real del rail 12 V/reserva;
- heartbeat, comandos y GNSS productivos;
- calibración ADC, térmica, supervisor y transición 12 V -> reserva;
- debounce/backoff de movimiento afinado en vehículo.

Hasta cerrar esos gates, el artefacto es “candidato de banco”.
