/**
 * @file accel.h
 * @brief Domain rules for acceleration samples and motion thresholds.
 *
 * Sensor-independent: values are in milli-g. Register encodings belong to
 * the sensor adapter, not here.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Default motion threshold. Field tuning happens in the vehicle, not here. */
#define GD_MOTION_THRESHOLD_DEFAULT_MG 80u
/** Smallest threshold accepted (one step of a +-2 g, 7-bit threshold). */
#define GD_MOTION_THRESHOLD_MIN_MG 16u
/** Largest threshold accepted (127 steps of 16 mg). */
#define GD_MOTION_THRESHOLD_MAX_MG 2032u

/** Gravity magnitude expected from a sensor lying still, in mg. */
#define GD_GRAVITY_MG 1000u
/** Tolerance around gravity to consider a sample "at rest". */
#define GD_AT_REST_TOLERANCE_MG 150u

/** One three-axis acceleration sample, in milli-g. */
typedef struct {
    int16_t x; /**< X axis, mg. */
    int16_t y; /**< Y axis, mg. */
    int16_t z; /**< Z axis, mg. */
} gd_accel_mg_t;

/**
 * @brief Euclidean magnitude of a sample.
 * @param sample Acceleration sample.
 * @return Magnitude in mg (integer square root, floor).
 */
uint32_t gd_accel_magnitude_mg(gd_accel_mg_t sample);

/**
 * @brief Whether a sample is consistent with a sensor lying still (~1 g).
 *
 * Used as a sensor self-test: a healthy, correctly scaled accelerometer at
 * rest reads GD_GRAVITY_MG +- GD_AT_REST_TOLERANCE_MG regardless of orientation.
 */
bool gd_accel_is_at_rest(gd_accel_mg_t sample);

/**
 * @brief Clamp a requested motion threshold to the supported range.
 * @param requested_mg Threshold asked for by the operator.
 * @return Value within [GD_MOTION_THRESHOLD_MIN_MG, GD_MOTION_THRESHOLD_MAX_MG].
 */
uint16_t gd_motion_threshold_clamp(uint32_t requested_mg);
