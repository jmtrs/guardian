/**
 * @file esp32_platform.h
 * @brief Driven adapter: ESP32 services, implements gd_platform_port_t.
 */
#pragma once

#include "core/ports/platform_port.h"
#include "driver/gpio.h"
#include "hal/adc_types.h"

/** Platform wiring. */
typedef struct {
    adc_channel_t battery_channel;  /**< ADC1 channel of the battery divider. */
    uint32_t battery_divider_x1000; /**< Divider ratio x1000 (2000 = 2:1). */
    gpio_num_t motion_wake;         /**< RTC GPIO used as ext0 wake (active HIGH). */
} esp32_platform_config_t;

/**
 * @brief Expose the platform port. Releases deep-sleep holds from a previous sleep.
 */
const gd_platform_port_t *esp32_platform_create(const esp32_platform_config_t *config);
