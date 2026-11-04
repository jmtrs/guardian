/**
 * @file accel.c
 * @brief Acceleration domain rules (see accel.h).
 */
#include "core/accel.h"

/** Floor of the square root of @p value (bitwise method, no floating point). */
static uint32_t isqrt(uint64_t value)
{
    uint64_t result = 0;
    uint64_t bit = (uint64_t)1 << 62;
    while (bit > value) bit >>= 2;
    while (bit != 0) {
        if (value >= result + bit) {
            value -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    return (uint32_t)result;
}

uint32_t gd_accel_magnitude_mg(gd_accel_mg_t s)
{
    const int64_t x = s.x, y = s.y, z = s.z;
    return isqrt((uint64_t)(x * x + y * y + z * z));
}

bool gd_accel_is_at_rest(gd_accel_mg_t sample)
{
    const uint32_t magnitude = gd_accel_magnitude_mg(sample);
    return magnitude >= GD_GRAVITY_MG - GD_AT_REST_TOLERANCE_MG &&
           magnitude <= GD_GRAVITY_MG + GD_AT_REST_TOLERANCE_MG;
}

uint16_t gd_motion_threshold_clamp(uint32_t requested_mg)
{
    if (requested_mg < GD_MOTION_THRESHOLD_MIN_MG) return GD_MOTION_THRESHOLD_MIN_MG;
    if (requested_mg > GD_MOTION_THRESHOLD_MAX_MG) return GD_MOTION_THRESHOLD_MAX_MG;
    return (uint16_t)requested_mg;
}
