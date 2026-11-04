/**
 * @file esp32_platform.c
 * @brief ESP32 platform adapter: delays, identity, battery ADC, deep sleep.
 */
#include "adapters/esp32_platform.h"

#include <assert.h>
#include <string.h>

#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_chip_info.h"
#include "esp_flash.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_sleep.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define BATTERY_SAMPLES 16
#define ADC_FULL_SCALE_MV 3300 /**< Fallback scale when no eFuse calibration. */
#define ADC_MAX_RAW 4095
#define SLEEP_FLUSH_MS 200     /**< Let the console drain before sleeping. */

static const char *TAG = "platform";

/** Adapter state. Single instance. */
typedef struct {
    esp32_platform_config_t config;
    adc_oneshot_unit_handle_t adc;
    adc_cali_handle_t calibration; /**< NULL if the chip has no eFuse calibration. */
    bool created;
} esp32_platform_t;

static esp32_platform_t s_platform;

static void delay_ms(void *ctx, uint32_t ms)
{
    (void)ctx;
    vTaskDelay(pdMS_TO_TICKS(ms));
}

static void identity(void *ctx, gd_platform_identity_t *id)
{
    (void)ctx;
    esp_chip_info_t chip;
    esp_chip_info(&chip);
    memset(id, 0, sizeof(*id));
    id->chip_revision = chip.revision;
    id->cores = chip.cores;
    esp_flash_get_size(NULL, &id->flash_bytes);
    id->psram_bytes = (uint32_t)heap_caps_get_total_size(MALLOC_CAP_SPIRAM);
    esp_read_mac(id->mac, ESP_MAC_BASE);
}

/** Lazily open ADC1 on the battery channel. */
static bool battery_adc_ready(esp32_platform_t *self)
{
    if (self->adc) return true;
    adc_oneshot_unit_handle_t adc = NULL;
    const adc_oneshot_unit_init_cfg_t unit = {.unit_id = ADC_UNIT_1};
    if (adc_oneshot_new_unit(&unit, &adc) != ESP_OK) return false;
    const adc_oneshot_chan_cfg_t channel = {.atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT};
    if (adc_oneshot_config_channel(adc, self->config.battery_channel, &channel) != ESP_OK) {
        adc_oneshot_del_unit(adc); /* retry from scratch next time */
        return false;
    }
    self->adc = adc; /* publish only once fully configured */
    const adc_cali_line_fitting_config_t cali = {
        .unit_id = ADC_UNIT_1, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    if (adc_cali_create_scheme_line_fitting(&cali, &self->calibration) != ESP_OK) {
        ESP_LOGW(TAG, "no eFuse ADC calibration: battery reading is approximate");
        self->calibration = NULL;
    }
    return true;
}

/** One pin-level sample in mV (calibrated when possible). */
static bool sample_mv(esp32_platform_t *self, int *mv)
{
    int raw = 0;
    if (adc_oneshot_read(self->adc, self->config.battery_channel, &raw) != ESP_OK) return false;
    if (self->calibration) return adc_cali_raw_to_voltage(self->calibration, raw, mv) == ESP_OK;
    *mv = raw * ADC_FULL_SCALE_MV / ADC_MAX_RAW;
    return true;
}

static int32_t battery_mv(void *ctx)
{
    esp32_platform_t *self = ctx;
    if (!battery_adc_ready(self)) return -1;
    int32_t sum = 0;
    for (int i = 0; i < BATTERY_SAMPLES; i++) {
        int mv = 0;
        if (!sample_mv(self, &mv)) return -1;
        sum += mv;
    }
    const int32_t pin_mv = sum / BATTERY_SAMPLES;
    return (int32_t)((int64_t)pin_mv * self->config.battery_divider_x1000 / 1000);
}

static gd_wake_cause_t wake_cause(void *ctx)
{
    (void)ctx;
    switch (esp_sleep_get_wakeup_cause()) {
    case ESP_SLEEP_WAKEUP_UNDEFINED: return GD_WAKE_POWER_ON;
    case ESP_SLEEP_WAKEUP_EXT0: return GD_WAKE_MOTION;
    default: return GD_WAKE_OTHER;
    }
}

static void deep_sleep_until_motion(void *ctx)
{
    esp32_platform_t *self = ctx;
    gpio_deep_sleep_hold_en();
    ESP_ERROR_CHECK(esp_sleep_enable_ext0_wakeup(self->config.motion_wake, 1));
    vTaskDelay(pdMS_TO_TICKS(SLEEP_FLUSH_MS));
    esp_deep_sleep_start();
}

static const gd_platform_port_t PORT = {
    .ctx = &s_platform,
    .delay_ms = delay_ms,
    .identity = identity,
    .battery_mv = battery_mv,
    .wake_cause = wake_cause,
    .deep_sleep_until_motion = deep_sleep_until_motion,
};

const gd_platform_port_t *esp32_platform_create(const esp32_platform_config_t *config)
{
    assert(!s_platform.created && "esp32_platform_create called twice");
    s_platform.config = *config;
    s_platform.created = true;
    gpio_deep_sleep_hold_dis();
    return &PORT;
}
