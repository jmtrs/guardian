/**
 * @file a7670_modem.h
 * @brief Driven adapter: SIMCom A7670 over UART, implements gd_modem_port_t.
 */
#pragma once

#include "core/ports/modem_port.h"
#include "driver/gpio.h"
#include "driver/uart.h"

/** Receives every line the modem emits (responses and URCs), CR/LF stripped. */
typedef void (*a7670_line_sink_t)(void *sink_ctx, const char *line);

/** Wiring and callbacks for one modem instance. */
typedef struct {
    uart_port_t uart;        /**< UART connected to the modem. */
    int baud;                /**< Modem baud rate. */
    gpio_num_t tx, rx;       /**< UART pins, MCU side. */
    gpio_num_t dtr;          /**< Data terminal ready. */
    gpio_num_t pwrkey;       /**< Power key (must be an RTC GPIO for sleep hold). */
    gpio_num_t reset;        /**< Reset line. */
    int reset_level;         /**< Active level of @c reset. */
    gpio_num_t power_enable; /**< Supply switch (must be an RTC GPIO for sleep hold). */
    a7670_line_sink_t sink;  /**< Line observer, may be NULL. */
    void *sink_ctx;          /**< Passed back to @c sink. */
} a7670_config_t;

/**
 * @brief Install the UART driver, start the RX task and expose the port.
 *
 * Releases any deep-sleep pin hold left by a previous gd_modem_port_t
 * hold_off_during_sleep(). Single instance: calling it twice aborts.
 *
 * @return Port bound to the static adapter instance. Never NULL.
 */
const gd_modem_port_t *a7670_modem_create(const a7670_config_t *config);
