/**
 * @file a7670_modem.c
 * @brief SIMCom A7670 adapter: power sequencing, AT transport, line framing.
 *
 * Power-on sequence mirrors LILYGO examples/ATdebug for LILYGO_T_A7670.
 * A background task frames UART bytes into lines, forwards them to the sink
 * and signals final result codes to the waiting command().
 */
#include "adapters/a7670_modem.h"

#include <assert.h>
#include <stdatomic.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#define RX_BUFFER_BYTES   2048
#define LINE_MAX_BYTES    512
#define RX_TASK_STACK     4096
#define RX_TASK_PRIORITY  10
#define POWERON_PULSE_MS  100   /**< PWRKEY HIGH time to switch on. */
#define POWEROFF_PULSE_MS 3000  /**< PWRKEY HIGH time to switch off. */
#define RESET_PULSE_MS    2600
#define BOOT_WAIT_MS      3000  /**< Extra wait if the first AT probes fail. */
#define AT_PROBE_MS       1000
#define CPOF_TIMEOUT_MS   5000
#define SHUTDOWN_WAIT_MS  2000

#define MODEM_PIN_COUNT 5 /**< power_enable, pwrkey, reset, dtr, tx. */

#define BIT_OK    BIT0
#define BIT_ERROR BIT1

static const char *TAG = "a7670";

/** Adapter state. Single instance: the board has one modem. */
typedef struct {
    a7670_config_t config;
    EventGroupHandle_t result;
    /** True only while command() waits. Result codes outside that window
     *  (late answers to a timed-out command, passthrough results) are ignored. */
    atomic_bool awaiting;
} a7670_t;

static a7670_t s_modem;

static void drive(gpio_num_t pin, int level)
{
    gpio_reset_pin(pin);
    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, level);
}

static void delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

/** Classify a line as a final result code, then hand it to the sink. */
static void on_line(a7670_t *self, const char *line)
{
    if (line[0] == '\0') return;
    if (self->config.sink) self->config.sink(self->config.sink_ctx, line);
    if (!atomic_load(&self->awaiting)) return;
    if (strcmp(line, "OK") == 0) {
        xEventGroupSetBits(self->result, BIT_OK);
    } else if (strcmp(line, "ERROR") == 0 || strncmp(line, "+CME ERROR", 10) == 0 ||
               strncmp(line, "+CMS ERROR", 10) == 0) {
        xEventGroupSetBits(self->result, BIT_ERROR);
    }
}

/** RX task: frames bytes into LF-terminated lines (CR dropped). */
static void rx_task(void *arg)
{
    a7670_t *self = arg;
    uint8_t chunk[128];
    char line[LINE_MAX_BYTES];
    size_t length = 0;
    for (;;) {
        const int n = uart_read_bytes(self->config.uart, chunk, sizeof(chunk), pdMS_TO_TICKS(50));
        for (int i = 0; i < n; i++) {
            const char c = (char)chunk[i];
            if (c == '\r') continue;
            if (c == '\n') {
                line[length] = '\0';
                on_line(self, line);
                length = 0;
                continue;
            }
            if (length == sizeof(line) - 1) { /* overlong: flush, keep the byte */
                line[length] = '\0';
                on_line(self, line);
                length = 0;
            }
            line[length++] = c;
        }
    }
}

static void send_raw(void *ctx, const char *line)
{
    a7670_t *self = ctx;
    uart_write_bytes(self->config.uart, line, strlen(line));
    uart_write_bytes(self->config.uart, "\r\n", 2);
}

static gd_status_t command(void *ctx, const char *cmd, uint32_t timeout_ms)
{
    /* AT has no correlation ids. Results are only accepted while waiting, which
     * discards late answers to earlier commands except one landing in the few
     * microseconds between arming and the new command reaching the modem. */
    a7670_t *self = ctx;
    xEventGroupClearBits(self->result, BIT_OK | BIT_ERROR);
    atomic_store(&self->awaiting, true);
    send_raw(self, cmd);
    const EventBits_t bits = xEventGroupWaitBits(self->result, BIT_OK | BIT_ERROR, pdTRUE,
                                                 pdFALSE, pdMS_TO_TICKS(timeout_ms));
    atomic_store(&self->awaiting, false);
    if (bits & BIT_OK) return GD_OK;
    if (bits & BIT_ERROR) return GD_ERR_REJECTED;
    return GD_ERR_TIMEOUT;
}

/** Probe with bare "AT" up to @p attempts times. */
static bool answers_at(a7670_t *self, int attempts)
{
    for (int i = 0; i < attempts; i++) {
        if (command(self, "AT", AT_PROBE_MS) == GD_OK) return true;
    }
    return false;
}

static void pulse(gpio_num_t pin, uint32_t high_ms)
{
    drive(pin, 0);
    delay_ms(100);
    gpio_set_level(pin, 1);
    delay_ms(high_ms);
    gpio_set_level(pin, 0);
}

static gd_status_t power_on(void *ctx)
{
    a7670_t *self = ctx;
    const a7670_config_t *c = &self->config;
    drive(c->power_enable, 1);
    drive(c->dtr, 0);
    /* The modem survives an MCU reset: reuse it if it already answers. Even if it
     * is on but still booting, the 100 ms pulse below cannot switch it off: an
     * A7670 power-down needs a long press (LILYGO utilities.h, TINY_GSM_MODEM_A7670:
     * POWERON 100 ms / POWEROFF 3000 ms). Bench-confirm on the received unit. */
    if (answers_at(self, 3)) return GD_OK;

    drive(c->reset, !c->reset_level);
    delay_ms(100);
    gpio_set_level(c->reset, c->reset_level);
    delay_ms(RESET_PULSE_MS);
    gpio_set_level(c->reset, !c->reset_level);
    pulse(c->pwrkey, POWERON_PULSE_MS);

    ESP_LOGI(TAG, "power-on pulse sent, waiting for AT");
    if (answers_at(self, 3)) return GD_OK;
    delay_ms(BOOT_WAIT_MS);
    return answers_at(self, 20) ? GD_OK : GD_ERR_TIMEOUT;
}

static void power_off(void *ctx)
{
    a7670_t *self = ctx;
    /* A long PWRKEY press toggles power, so it is only used on a modem that is
     * provably alive. A silent modem is either off or hung; in both cases opening
     * the supply switch is the only safe action (a hung modem cannot shut down
     * cleanly anyway). */
    if (!answers_at(self, 2)) {
        ESP_LOGI(TAG, "not answering: cutting supply");
    } else if (command(self, "AT+CPOF", CPOF_TIMEOUT_MS) != GD_OK && answers_at(self, 2)) {
        ESP_LOGW(TAG, "AT+CPOF failed but modem alive: long-pressing PWRKEY");
        pulse(self->config.pwrkey, POWEROFF_PULSE_MS);
    }
    delay_ms(SHUTDOWN_WAIT_MS);
    drive(self->config.power_enable, 0);
    ESP_LOGI(TAG, "off, supply switch open");
}

/** Every MCU pin wired to the modem, for sleep hold/release. */
static void modem_pins(const a7670_config_t *c, gpio_num_t pins[MODEM_PIN_COUNT])
{
    pins[0] = c->power_enable;
    pins[1] = c->pwrkey;
    pins[2] = c->reset;
    pins[3] = c->dtr;
    pins[4] = c->tx;
}

static gd_status_t hold_off_during_sleep(void *ctx)
{
    /* Unpowered modem, every line low: no back-powering through TX/DTR, reset
     * inactive. Holds keep these levels through deep sleep so the P1 current
     * is measured in a known state. */
    a7670_t *self = ctx;
    const a7670_config_t *c = &self->config;
    drive(c->power_enable, 0);
    drive(c->pwrkey, 0);
    drive(c->reset, !c->reset_level);
    drive(c->dtr, 0);
    drive(c->tx, 0);
    gpio_num_t pins[MODEM_PIN_COUNT];
    modem_pins(c, pins);
    for (size_t i = 0; i < MODEM_PIN_COUNT; i++) {
        if (gpio_hold_en(pins[i]) != ESP_OK) {
            ESP_LOGE(TAG, "cannot hold GPIO%d through sleep", pins[i]);
            return GD_ERR_IO;
        }
    }
    return GD_OK;
}

static const gd_modem_port_t PORT = {
    .ctx = &s_modem,
    .power_on = power_on,
    .power_off = power_off,
    .command = command,
    .send_raw = send_raw,
    .hold_off_during_sleep = hold_off_during_sleep,
};

const gd_modem_port_t *a7670_modem_create(const a7670_config_t *config)
{
    assert(s_modem.result == NULL && "a7670_modem_create called twice");
    s_modem.config = *config;
    s_modem.result = xEventGroupCreate();
    gpio_num_t pins[MODEM_PIN_COUNT];
    modem_pins(config, pins);
    for (size_t i = 0; i < MODEM_PIN_COUNT; i++) gpio_hold_dis(pins[i]);

    const uart_config_t uart = {
        .baud_rate = config->baud,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    ESP_ERROR_CHECK(uart_driver_install(config->uart, RX_BUFFER_BYTES, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(config->uart, &uart));
    ESP_ERROR_CHECK(uart_set_pin(config->uart, config->tx, config->rx, UART_PIN_NO_CHANGE,
                                 UART_PIN_NO_CHANGE));
    xTaskCreate(rx_task, "a7670_rx", RX_TASK_STACK, &s_modem, RX_TASK_PRIORITY, NULL);
    return &PORT;
}
