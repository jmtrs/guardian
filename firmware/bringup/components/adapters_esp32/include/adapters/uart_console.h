/**
 * @file uart_console.h
 * @brief Driving adapter: operator console on UART0 (USB serial).
 *
 * Reads edited lines from the operator and implements gd_report_port_t for
 * output. The composition root feeds each line to the core.
 */
#pragma once

#include <stddef.h>

#include "core/ports/report_port.h"
#include "driver/uart.h"

/**
 * @brief Install the UART driver on the console port for input.
 * @param uart Console UART (the one stdout is routed to). Output keeps using stdout.
 */
void uart_console_init(uart_port_t uart);

/**
 * @brief Block until the operator submits a line (CR or LF), echoing input.
 *
 * Supports backspace. Non-printable bytes are ignored, so control characters
 * such as Ctrl-Z/ESC cannot be sent to the modem (SMS text mode, AT+CMGS, is
 * out of scope for bring-up). The line is always
 * NUL-terminated; input beyond @p size - 1 characters is dropped.
 */
void uart_console_read_line(char *buffer, size_t size);

/** Report port writing to stdout (flushed on every write). */
const gd_report_port_t *uart_console_report(void);
