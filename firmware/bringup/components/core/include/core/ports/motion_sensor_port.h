/**
 * @file motion_sensor_port.h
 * @brief Driven port: accelerometer with a latched motion interrupt.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "core/accel.h"
#include "core/status.h"

/** Identity of a detected sensor. */
typedef struct {
    uint8_t bus_address; /**< 7-bit I2C address it answered on. */
    uint8_t chip_id;     /**< Value of its identification register. */
} gd_sensor_info_t;

/** Motion sensor operations required by the core. */
typedef struct {
    void *ctx; /**< Adapter state, opaque to the core. */

    /** Detect and initialise the sensor. Idempotent. */
    gd_status_t (*probe)(void *ctx, gd_sensor_info_t *info);

    /** Read one sample in mg. Requires a successful probe. */
    gd_status_t (*read)(void *ctx, gd_accel_mg_t *sample);

    /** Configure the latched motion interrupt with an already clamped threshold. */
    gd_status_t (*arm)(void *ctx, uint16_t threshold_mg);

    /** Current level of the interrupt line (true = motion latched). */
    bool (*is_triggered)(void *ctx);

    /** Clear the latch. @return Raw interrupt source, for diagnostics. */
    uint8_t (*acknowledge)(void *ctx);
} gd_motion_sensor_port_t;
