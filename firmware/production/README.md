# Gate de firmware de producción

Este directorio no es un firmware flasheable. Separa dos cosas que no deben
mezclarse con `bringup`:

- `guardian-device`: dominio productivo probado en host (outbox y ciclo);
- el gate de configuración irreversible que deberá consumir el futuro binario
  ESP-IDF de producción.

`sdkconfig.security.defaults` es una plantilla de revisión, no un default
activo. Secure Boot y Flash Encryption cambian eFuses en el primer arranque;
por eso ningún comando de CI ni de este repositorio los activa o flashea.

## Gate antes de la primera placa designada

1. Crear el binario ESP-IDF productivo y una tabla con partición `nvs_keys`.
2. Generar la clave privada RSA-3072 en un equipo de fabricación; nunca
   guardarla dentro del repositorio ni en Git.
3. Resolver el `sdkconfig` real y comprobarlo:

   ```bash
   firmware/production/check-security-config.sh path/al/sdkconfig release path/al/proyecto
   ```

4. Guardar backup de eFuses, probar OTA/recuperación y firmar el acta de placa.
5. Solo entonces ejecutar el primer arranque seguro en esa unidad, nunca en la
   placa de bring-up sin una decisión explícita.

El gate exige Secure Boot v2 (la unidad medida es ESP32 rev v3.1), clave
RSA-3072 válida y externa al repositorio, ROM download inseguro desactivado,
cifrado de flash en modo `release`, NVS cifrada y ausencia de excepciones
inseguras.
Se basa en la documentación de Espressif para [Secure Boot v2](https://docs.espressif.com/projects/esp-idf/en/v5.5.6/esp32/security/secure-boot-v2.html),
[Flash Encryption](https://docs.espressif.com/projects/esp-idf/en/v5.5.6/esp32/security/flash-encryption.html)
y [NVS Encryption](https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/storage/nvs_encryption.html).

## Gates físicos que el software no puede cerrar

- P4: GNSS con LTE;
- P5: conjunto completo alimentado desde 12 V;
- explicar los ~15 mA extra de P2b;
- validar transición 12 V → reserva, térmica y supervisor;
- confirmar que la outbox sobrevive a cortes reales durante escritura/envío.

Hasta que todos pasen, el estado es “candidato de banco”, no producción.
