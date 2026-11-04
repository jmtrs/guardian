# ESP-IDF adapters: implement the core ports on the LILYGO T-A7670E.
idf_component_register(
    SRCS "src/a7670_modem.c" "src/lis3dh_i2c.c" "src/esp32_platform.c" "src/uart_console.c"
    INCLUDE_DIRS "include"
    REQUIRES core esp_driver_uart esp_driver_gpio esp_driver_i2c esp_adc
             esp_hw_support spi_flash heap hal
)

# Our code builds warning-free; keep it that way.
target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
