/**
 * @file main.c
 * @brief Composition root of the Guardian bring-up tool.
 *
 * The only place that knows both the board wiring and the core: it builds
 * every adapter from board_t_a7670.h, injects them into the bring-up service
 * and runs the console loop. No logic lives here.
 */
#include "adapters/a7670_modem.h"
#include "adapters/board_t_a7670.h"
#include "adapters/esp32_platform.h"
#include "adapters/lis3dh_i2c.h"
#include "adapters/uart_console.h"
#include "core/bringup.h"

#define CONSOLE_LINE_BYTES 256

/** Prints every modem line prefixed with "< " so it stands out from local output. */
static void print_modem_line(void *ctx, const char *line)
{
    gd_report((const gd_report_port_t *)ctx, "< %s\n", line);
}

void app_main(void)
{
    /* Platform first: it releases deep-sleep pin holds before anyone drives pins. */
    const gd_platform_port_t *platform = esp32_platform_create(&(esp32_platform_config_t){
        .battery_channel = BOARD_BATTERY_ADC_CHANNEL,
        .battery_divider_x1000 = BOARD_BATTERY_DIVIDER_X1000,
        .motion_wake = BOARD_MOTION_INT,
    });
    const gd_report_port_t *report = uart_console_report();
    const gd_modem_port_t *modem = a7670_modem_create(&(a7670_config_t){
        .uart = BOARD_MODEM_UART,
        .baud = BOARD_MODEM_BAUD,
        .tx = BOARD_MODEM_TX,
        .rx = BOARD_MODEM_RX,
        .dtr = BOARD_MODEM_DTR,
        .pwrkey = BOARD_MODEM_PWRKEY,
        .reset = BOARD_MODEM_RESET,
        .reset_level = BOARD_MODEM_RESET_LEVEL,
        .power_enable = BOARD_MODEM_POWER_EN,
        .sink = print_modem_line,
        .sink_ctx = (void *)report,
    });
    const gd_motion_sensor_port_t *motion = lis3dh_i2c_create(&(lis3dh_config_t){
        .i2c_port = BOARD_MOTION_I2C_PORT,
        .sda = BOARD_MOTION_SDA,
        .scl = BOARD_MOTION_SCL,
        .interrupt = BOARD_MOTION_INT,
    });

    gd_bringup_t service = gd_bringup_create(modem, motion, platform, report);
    gd_bringup_announce(&service);

    uart_console_init(BOARD_CONSOLE_UART);
    char line[CONSOLE_LINE_BYTES];
    for (;;) {
        uart_console_read_line(line, sizeof(line));
        gd_bringup_handle_line(&service, line);
    }
}
