/**
 * @file uart_console.c
 * @brief Operator console over UART0: line editing in, stdout out.
 */
#include "adapters/uart_console.h"

#include <assert.h>
#include <stdio.h>

#include "driver/uart.h"
#include "freertos/FreeRTOS.h"

#define CONSOLE_RX_BYTES 1024
#define KEY_BACKSPACE 0x08
#define KEY_DELETE 0x7F

static uart_port_t s_uart = UART_NUM_MAX; /**< Set by uart_console_init(). */

void uart_console_init(uart_port_t uart)
{
    s_uart = uart;
    ESP_ERROR_CHECK(uart_driver_install(uart, CONSOLE_RX_BYTES, 0, 0, NULL, 0));
}

static void echo(const char *text)
{
    fputs(text, stdout);
    fflush(stdout);
}

void uart_console_read_line(char *buffer, size_t size)
{
    assert(s_uart != UART_NUM_MAX && "uart_console_init() not called");
    size_t length = 0;
    echo("$ ");
    for (;;) {
        uint8_t c;
        if (uart_read_bytes(s_uart, &c, 1, portMAX_DELAY) != 1) continue;
        if (c == '\r' || c == '\n') {
            echo("\n");
            buffer[length] = '\0';
            return;
        }
        if ((c == KEY_BACKSPACE || c == KEY_DELETE) && length > 0) {
            length--;
            echo("\b \b");
        } else if (c >= 0x20 && c < KEY_DELETE && length + 1 < size) {
            buffer[length++] = (char)c;
            putchar(c);
            fflush(stdout);
        }
    }
}

static void write_stdout(void *ctx, const char *text)
{
    (void)ctx;
    echo(text);
}

static const gd_report_port_t REPORT = {.ctx = NULL, .write = write_stdout};

const gd_report_port_t *uart_console_report(void) { return &REPORT; }
